"""
main.py — FastAPI Application Entry Point for VaultMCP Backend

All routes wired with real logic:
  POST /process       — Full pipeline: detect → extract → transcribe → structure → search → generate MD
  POST /drive/save    — Save MD entry to user's Google Drive via drive_handler
  GET  /drive/vault   — Fetch vault.md from user's Google Drive
  POST /auth/google   — Exchange OAuth auth code for tokens
  GET  /auth/url      — Get Google OAuth consent URL
  GET  /health        — System health check
"""

import os
import re
import traceback
import json
import base64
import logging
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Query, Response, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# ─── Local Modules ───────────────────────────────────────────────────────────
from ai_processor import (
    process_text,
    process_mcp_compare,
    result_to_dict,
    ProcessingError,
    InvalidTokenError as AIInvalidTokenError,
)
def get_official_info(official_link: str) -> dict:
    """Return the official link extracted by the AI processor."""
    return {"official_link": official_link or "", "provider": "mistral"}
from md_generator import (
    build_entry,
    generate_entry_md,
    format_retro_date,
    VaultEntry,
)

# ─── Load Environment ────────────────────────────────────────────────────────
load_dotenv()

drive_token_var = contextvars.ContextVar("drive_token", default=None)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000,https://vault-mcp-4ssi.vercel.app").split(",")

# ─── App Instance ────────────────────────────────────────────────────────────
app = FastAPI(
    title="VaultMCP Backend",
    description="Save what you scroll. Processing pipeline for Instagram reels, YouTube shorts, URLs, and text.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.middleware.trustedhost import TrustedHostMiddleware

@app.middleware("http")
async def add_coop_header(request, call_next):
    response = await call_next(request)
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    return response

@app.middleware("http")
async def extract_drive_token(request: Request, call_next):
    token = request.headers.get("x-drive-token")
    if token:
        drive_token_var.set(token)
    return await call_next(request)


# ─── Request / Response Models ───────────────────────────────────────────────

class ProcessRequest(BaseModel):
    """Body for POST /process."""
    content: str
    hf_token: str                         # User's Hugging Face token (required)
    content_type: Optional[str] = "auto"  # "url" | "text" | "auto"
    force_category: Optional[str] = None  # User overridden category


class MCPCompareRequest(BaseModel):
    project_readme: str
    drive_token: str  # Actually contains Firebase UID now
    hf_token: Optional[str] = None


# ─── URL Detection Helpers ──────────────────────────────────────────────────

GITHUB_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([\w.-]+)/([\w.-]+)", re.IGNORECASE
)
GENERIC_URL_RE = re.compile(
    r"https?://[^\s<>\"']+", re.IGNORECASE
)


def detect_input_type(content: str) -> str:
    """
    Detect what kind of input the user sent.
    Returns: "instagram" | "youtube" | "github" | "website" | "text"
    """
    content = content.strip()
    logger.info(f"[detect_input_type] Evaluating content: {content}")

    if GITHUB_RE.match(content):
        logger.info("[detect_input_type] Match found: github")
        return "github"

    if GENERIC_URL_RE.match(content):
        logger.info("[detect_input_type] Match found: website")
        return "website"

    logger.info("[detect_input_type] Match found: text (default fallback)")
    return "text"


# ─── Website Scraper (lightweight) ──────────────────────────────────────────

async def scrape_website(url: str) -> str:
    """
    Scrape a website URL for its title and meta description.
    Returns a text summary string for ai_processor.
    """
    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            },
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            html = response.text

        # Extract <title>
        title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        title = title_match.group(1).strip() if title_match else ""

        # Extract meta description
        desc_match = re.search(
            r'<meta\s+[^>]*name=["\']description["\'][^>]*content=["\'](.*?)["\']',
            html, re.IGNORECASE | re.DOTALL,
        )
        if not desc_match:
            desc_match = re.search(
                r'<meta\s+[^>]*content=["\'](.*?)["\'][^>]*name=["\']description["\']',
                html, re.IGNORECASE | re.DOTALL,
            )
        description = desc_match.group(1).strip() if desc_match else ""

        # Extract og:description as fallback
        if not description:
            og_match = re.search(
                r'<meta\s+[^>]*property=["\']og:description["\'][^>]*content=["\'](.*?)["\']',
                html, re.IGNORECASE | re.DOTALL,
            )
            if og_match:
                description = og_match.group(1).strip()

        # Extract visible text from <p> tags (first 5 paragraphs)
        paragraphs = re.findall(r"<p[^>]*>(.*?)</p>", html, re.IGNORECASE | re.DOTALL)
        body_text = " ".join(
            re.sub(r"<[^>]+>", "", p).strip()
            for p in paragraphs[:5]
        )

        # Build a text blob for the AI processor
        parts = []
        if title:
            parts.append(f"Page title: {title}")
        if description:
            parts.append(f"Description: {description}")
        parts.append(f"URL: {url}")
        if body_text:
            parts.append(f"Page content: {body_text[:2000]}")

        return "\n".join(parts) if parts else f"Website URL: {url}"

    except Exception as e:
        # If scraping fails, still pass the URL to ai_processor
        return f"Website URL: {url}\n(Could not scrape page: {e})"


async def get_github_metadata(url: str) -> str:
    """Fetch GitHub repository metadata using the public GitHub API."""
    match = GITHUB_RE.search(url)
    if not match:
        logger.warning(f"Could not parse GitHub owner/repo from URL: {url}")
        return f"GitHub URL: {url}"
    
    owner = match.group(1)
    repo = match.group(2)
    if repo.lower().endswith(".git"):
        repo = repo[:-4]
        
    api_url = f"https://api.github.com/repos/{owner}/{repo}"
    logger.info(f"Fetching GitHub API: {api_url}")
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(api_url, headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "VaultMCP-Backend"
            })
            data = r.json()
            logger.info(f"GitHub API response: {data}")
            
            # Also fetch README
            readme_url = f"https://api.github.com/repos/{owner}/{repo}/readme"
            readme_r = await client.get(readme_url, headers={
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "VaultMCP-Backend"
            })
            readme_text = ""
            if readme_r.status_code == 200:
                readme_data = readme_r.json()
                content_b64 = readme_data.get("content", "")
                if content_b64:
                    readme_text = base64.b64decode(content_b64).decode('utf-8', errors='ignore')[:1000]
            else:
                logger.warning(f"GitHub README response status: {readme_r.status_code}")
                
            description = data.get('description') or 'No description provided'
            readme_preview = readme_text[:800] if readme_text else 'No README available'
            
            # Build richer context for the AI
            return f"""
GitHub Repository: {data.get('full_name')}
Description: {description}
Primary Language: {data.get('language') or 'Not specified'}
Stars: {data.get('stargazers_count', 0)}
Topics: {', '.join(data.get('topics') or []) or 'none'}
README Preview: {readme_preview}

Based on the above, summarize what this repository does.
"""
    except Exception as e:
        logger.error(f"Error fetching GitHub metadata: {e}")
        return f"GitHub URL: {url} (Failed to fetch API metadata: {e})"


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
async def root_index():
    """Welcome page / status."""
    return {
        "status": "running",
        "service": "vaultmcp-backend",
        "message": "Welcome to VaultMCP API. System is active and healthy.",
        "documentation": "/docs"
    }


@app.get("/health")
async def health_check():
    """System health check."""
    return {
        "status": "ok",
        "service": "vaultmcp-backend",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "modules": {
            "metadata_scraper": "ready",
            "ai_processor": "ready",
            "web_searcher": "ready",
            "md_generator": "ready",
        },
    }


@app.post("/process")
async def process_content(request: ProcessRequest):
    """
    Main processing endpoint — the entire VaultMCP pipeline.

    Flow by input type:
      Instagram/YouTube URL → scrape metadata → AI structure → web search → MD
      Website URL           → scrape title/desc → AI structure → web search → MD
      Plain text            → AI structure → web search → MD
    """
    content = request.content.strip()
    hf_token = request.hf_token.strip()

    if not content:
        raise HTTPException(status_code=400, detail="Content is empty.")
    if not hf_token:
        raise HTTPException(status_code=400, detail="Hugging Face token is required.")

    # ── Step 1: Detect input type ────────────────────────────────────────
    if request.content_type and request.content_type != "auto":
        input_type = request.content_type
    else:
        input_type = detect_input_type(content)

    pipeline_steps = [
        {"step": 1, "name": "detect_type", "status": "done", "detail": input_type},
    ]

    source_url = content if input_type != "text" else ""
    text_for_ai = ""

    # ── Step 2: Retrieve metadata/content based on input type ────────────
    if input_type == "github":
        try:
            metadata = await get_github_metadata(content)
            text_for_ai = metadata
            pipeline_steps.append({
                "step": 2, "name": "github_metadata", "status": "done",
                "detail": "Retrieved GitHub metadata",
            })
        except Exception as e:
            pipeline_steps.append({
                "step": 2, "name": "github_metadata", "status": "error",
                "detail": str(e),
            })
            raise HTTPException(status_code=422, detail=f"GitHub metadata fetch failed: {e}")

    elif input_type == "website":
        try:
            url_match = re.search(r'https?://\S+', content)
            if url_match:
                url = url_match.group(0)
                user_note = content.replace(url, '').strip()
                source_url = url
                
                if user_note:
                    text_for_ai = f"URL: {url}\nUser's note: {user_note}"
                    pipeline_steps.append({
                        "step": 2, "name": "user_note", "status": "done",
                        "detail": "Used user's custom note instead of scraping",
                    })
                else:
                    scraped_text = await scrape_website(url)
                    text_for_ai = scraped_text
                    pipeline_steps.append({
                        "step": 2, "name": "scrape_website", "status": "done",
                        "detail": f"Scraped {len(scraped_text)} chars",
                    })
            else:
                scraped_text = await scrape_website(content)
                text_for_ai = scraped_text
                pipeline_steps.append({
                    "step": 2, "name": "scrape_website", "status": "done",
                    "detail": f"Scraped {len(scraped_text)} chars",
                })
        except Exception as e:
            pipeline_steps.append({
                "step": 2, "name": "scrape_website", "status": "error",
                "detail": str(e),
            })
            raise HTTPException(status_code=422, detail=f"Website scraping failed: {e}")

    else:
        # Plain text
        text_for_ai = content
        pipeline_steps.append({
            "step": 2, "name": "prepare_content", "status": "done",
            "detail": f"Prepared {len(content)} chars of plain text",
        })

    # ── Step 3: AI structuring (Mistral) ───────────────────────────────
    try:
        processed = process_text(text_for_ai, hf_token)
        # Bypassing AI categorization completely: rely purely on manual Slash Commands, default to "Other"
        final_category = request.force_category if request.force_category else "Other"
        processed.category = final_category

        processed_dict = result_to_dict(processed)
        pipeline_steps.append({
            "step": 3, "name": "ai_structure", "status": "done",
            "detail": f"Category: {processed.category}, fallback: {processed.was_fallback}",
        })
    except AIInvalidTokenError as e:
        pipeline_steps.append({
            "step": 3, "name": "ai_structure", "status": "error",
            "detail": str(e),
        })
        status_code = 403 if "Inference Provider" in str(e) else 401
        raise HTTPException(status_code=status_code, detail=f"HF token error: {e}")
    except ProcessingError as e:
        pipeline_steps.append({
            "step": 3, "name": "ai_structure", "status": "error",
            "detail": str(e),
        })
        raise HTTPException(status_code=422, detail=f"AI processing failed: {e}")

    # ── Step 4: Web search for official link ─────────────────────
    official_info = get_official_info(processed.official_link)
    official_link = official_info.get("official_link", "")
    pipeline_steps.append({
        "step": 4, "name": "web_search", "status": "done" if official_link else "no_results",
        "detail": f"Provider: {official_info.get('provider', 'none')}, link: {official_link or 'N/A'}",
    })

    # ── Step 5: Generate Markdown ────────────────────────────────
    entry = build_entry(
        processed=processed_dict,
        source_url=source_url,
        official_link=official_link,
        exact_prompt=content if input_type == "text" else "",
    )
    md_entry = generate_entry_md(entry)
    saved_on = format_retro_date(datetime.utcnow())

    pipeline_steps.append({
        "step": 5, "name": "generate_md", "status": "done",
    })

    # ── Return final result ──────────────────────────────────────
    return {
        "status": "success",
        "result": {
            "title": processed.title,
            "category": processed.category,
            "summary": processed.summary,
            "exact_prompt": content if input_type == "text" else "",
            "official_link": official_link,
            "source_url": source_url,
            "tools_mentioned": processed.tools_mentioned,
            "links_mentioned": processed.links_mentioned,
            "md_entry": md_entry,
            "saved_on": saved_on,
        },
        "pipeline_steps": pipeline_steps,
        "input_type": input_type,
    }

# ─── MCP Protocol & Agent Endpoints ────────────────────────────────────────

class MCPCompareRequest(BaseModel):
    project_readme: str
    drive_token: str  # Actually contains Firebase UID now
    hf_token: Optional[str] = None

@app.post("/mcp/compare")
async def mcp_compare(request: MCPCompareRequest):
    """
    Agent sends project README content.
    VaultMCP finds matching tools from vault automatically.
    Returns ranked list of relevant tools.
    """
    project_readme = request.project_readme
    firebase_uid = request.drive_token  # Using drive_token field to carry Firebase UID for backwards compatibility
    
    # Fetch full vault
    vault_content = await get_vault_from_firestore(firebase_uid)
    if not vault_content:
        vault_content = ""
    
    # Use generic text inference to compare and find matches
    prompt = f"""
    Project README:
    {project_readme[:2000]}
    
    Available tools in vault:
    {vault_content[:3000]}
    
    Return JSON list of relevant tools:
    [{{"tool": "name", "reason": "why it fits", "link": "url"}}]
    """
    
    result = process_mcp_compare(prompt, request.hf_token)
    return {"status": "success", "matches": result}


from mcp.server.fastmcp import FastMCP

async def get_vault_from_firestore(uid: str) -> str:
    url = f"https://firestore.googleapis.com/v1/projects/vaultmcp-4431d/databases/(default)/documents/users/{uid}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
        if resp.status_code == 200:
            data = resp.json()
            try:
                items = data.get("fields", {}).get("vaultItems", {}).get("arrayValue", {}).get("values", [])
                md = "# VaultMCP Vault\n\n> Save what you scroll. Use what you saved.\n\n---\n\n"
                for item in items:
                    fields = item.get("mapValue", {}).get("fields", {})
                    title = fields.get("title", {}).get("stringValue", "")
                    category = fields.get("category", {}).get("stringValue", "")
                    date = fields.get("date", {}).get("stringValue", "")
                    summary = fields.get("summary", {}).get("stringValue", "")
                    exactPrompt = fields.get("exactPrompt", {}).get("stringValue", "")
                    md += f"## [CATEGORY: {category}]\n\n### {title}\n"
                    if summary:
                        md += f"- Summary: {summary}\n"
                    if exactPrompt:
                        md += f"- Exact Prompt: {exactPrompt}\n"
                    md += f"- Saved on: {date}\n\n"
                return md
            except Exception as e:
                return f"Error parsing vault data: {e}"
        return "Vault is empty or missing."

# Create MCP server
mcp_server = FastMCP("VaultMCP")

@mcp_server.tool()
async def get_vault() -> str:
    """Get the full VaultMCP knowledge base"""
    token = drive_token_var.get()
    if not token:
        return "Error: Missing X-Drive-Token header"
    content = drive_get_vault(token)
    return content or "Vault is empty"

@mcp_server.tool()
async def search_vault(query: str) -> str:
    """Search vault for tools and resources matching a query"""
    token = drive_token_var.get()
    if not token:
        return "Error: Missing X-Drive-Token header"
    content = drive_get_vault(token)
    if not content:
        return "Vault is empty"
    lines = content.split('\n')
    matches = [l for l in lines if query.lower() in l.lower()]
    return '\n'.join(matches) if matches else "No matches found"

@mcp_server.tool()
async def compare_project(project_readme: str) -> str:
    """Compare project README with vault to find relevant tools"""
    token = drive_token_var.get()
    if not token:
        return "Error: Missing X-Drive-Token header"
    vault_content = drive_get_vault(token)
    if not vault_content:
        return "Your Vault is currently empty! Add some tools to your VaultMCP first before running the comparison."
    
    # Use HF_TOKEN from environment variables
    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        return "Error: HF_TOKEN is not configured on the server"
        
    prompt = f"""
    Project README:
    {project_readme[:2000]}

    Available tools in vault:
    {vault_content[:3000]}

    List the most relevant tools from the vault for this project.
    Format: tool name — why it fits
    """
    result = process_text(prompt, hf_token)
    return result.summary

# Mount MCP server to FastAPI
app.mount("/mcp", mcp_server.sse_app())



# ─── Run with Uvicorn ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    import httpx

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(
        "main:app", 
        host=host, 
        port=port, 
        reload=True,
        proxy_headers=True,
        forwarded_allow_ips="*"
    )
