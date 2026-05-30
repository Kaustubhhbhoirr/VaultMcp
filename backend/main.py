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
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from pydantic import BaseModel
import httpx

# ─── Local Modules ───────────────────────────────────────────────────────────
from ai_processor import (
    process_text,
    result_to_dict,
    ProcessingError,
    InvalidTokenError as AIInvalidTokenError,
)
from web_searcher import get_official_info
from md_generator import (
    build_entry,
    generate_entry_md,
    format_retro_date,
    VaultEntry,
)
from drive_handler import (
    auth_google as drive_auth_google,
    get_auth_url as drive_get_auth_url,
    save_to_drive as drive_save_to_drive,
    get_vault as drive_get_vault,
    DriveAuthError,
    DriveError,
)


# ─── Load Environment ────────────────────────────────────────────────────────
load_dotenv()

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000,https://vault-mcp-4ssi.vercel.app").split(",")

# ─── App Instance ────────────────────────────────────────────────────────────
app = FastAPI(
    title="VaultMCP Backend",
    description="Save what you scroll. Processing pipeline for Instagram reels, YouTube shorts, URLs, and text.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://vault-mcp-4ssi.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / Response Models ───────────────────────────────────────────────

class ProcessRequest(BaseModel):
    """Body for POST /process."""
    content: str
    hf_token: str                         # User's Hugging Face token (required)
    content_type: Optional[str] = "auto"  # "url" | "text" | "auto"


class DriveAuthRequest(BaseModel):
    """Body for POST /auth/google."""
    auth_code: str


class DriveSaveRequest(BaseModel):
    """Body for POST /drive/save."""
    md_entry: str                          # Pre-generated MD string from /process
    access_token: str                      # User's Google Drive OAuth token
    refresh_token: Optional[str] = None


class DriveVaultRequest(BaseModel):
    """Query params for GET /drive/vault."""
    pass


# ─── URL Detection Helpers ──────────────────────────────────────────────────

INSTAGRAM_RE = re.compile(
    r"(?:https?://)?(?:www\.)?instagram\.com/(?:reel|reels|p)/[\w-]+", re.IGNORECASE
)
YOUTUBE_RE = re.compile(
    r"(?:https?://)?(?:(?:www\.|m\.)?youtube\.com/(?:shorts/|watch\?v=|v/)|youtu\.be/)[\w-]+", re.IGNORECASE
)
GENERIC_URL_RE = re.compile(
    r"https?://[^\s<>\"']+", re.IGNORECASE
)


def detect_input_type(content: str) -> str:
    """
    Detect what kind of input the user sent.
    Returns: "instagram" | "youtube" | "website" | "text"
    """
    content = content.strip()

    if INSTAGRAM_RE.match(content):
        return "instagram"

    if YOUTUBE_RE.match(content):
        return "youtube"

    if GENERIC_URL_RE.match(content):
        return "website"

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


async def get_youtube_metadata(url: str) -> str:
    """Extract YouTube video metadata (og:title, og:description) using httpx."""
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
            if response.status_code == 200:
                html = response.text
                
                # Extract og:title
                title_match = re.search(
                    r'<meta\s+[^>]*property=["\']og:title["\'][^>]*content=["\'](.*?)["\']',
                    html, re.IGNORECASE
                )
                if not title_match:
                    title_match = re.search(
                        r'<meta\s+[^>]*content=["\'](.*?)["\'][^>]*property=["\']og:title["\']',
                        html, re.IGNORECASE
                    )
                og_title = title_match.group(1).strip() if title_match else ""
                
                # Extract og:description
                desc_match = re.search(
                    r'<meta\s+[^>]*property=["\']og:description["\'][^>]*content=["\'](.*?)["\']',
                    html, re.IGNORECASE
                )
                if not desc_match:
                    desc_match = re.search(
                        r'<meta\s+[^>]*content=["\'](.*?)["\'][^>]*property=["\']og:description["\']',
                        html, re.IGNORECASE
                    )
                og_desc = desc_match.group(1).strip() if desc_match else ""
                
                parts = []
                if og_title:
                    parts.append(f"YouTube Video Title: {og_title}")
                if og_desc:
                    parts.append(f"Description: {og_desc}")
                
                if parts:
                    return "\n".join(parts)
    except Exception as e:
        print(f"[YouTube Metadata] httpx scrape failed: {e}", flush=True)
    return f"YouTube URL: {url}"


async def get_instagram_metadata(url: str) -> str:
    """Extract Instagram post metadata (og:title, og:description) using httpx."""
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
            if response.status_code == 200:
                html = response.text
                
                # Regex for og:title
                title_match = re.search(
                    r'<meta\s+[^>]*property=["\']og:title["\'][^>]*content=["\'](.*?)["\']',
                    html, re.IGNORECASE
                )
                if not title_match:
                    title_match = re.search(
                        r'<meta\s+[^>]*content=["\'](.*?)["\'][^>]*property=["\']og:title["\']',
                        html, re.IGNORECASE
                    )
                og_title = title_match.group(1).strip() if title_match else ""
                
                # Regex for og:description
                desc_match = re.search(
                    r'<meta\s+[^>]*property=["\']og:description["\'][^>]*content=["\'](.*?)["\']',
                    html, re.IGNORECASE
                )
                if not desc_match:
                    desc_match = re.search(
                        r'<meta\s+[^>]*content=["\'](.*?)["\'][^>]*property=["\']og:description["\']',
                        html, re.IGNORECASE
                    )
                og_desc = desc_match.group(1).strip() if desc_match else ""
                
                parts = []
                if og_title:
                    parts.append(f"Instagram Post Title: {og_title}")
                if og_desc:
                    parts.append(f"Caption/Description: {og_desc}")
                
                if parts:
                    return "\n".join(parts)
    except Exception as e:
        print(f"[Instagram Metadata] httpx scrape failed: {e}", flush=True)
    return f"Instagram URL: {url}"


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
            "drive_handler": "ready",
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
    if input_type == "youtube":
        try:
            metadata = await get_youtube_metadata(content)
            text_for_ai = metadata
            pipeline_steps.append({
                "step": 2, "name": "youtube_metadata", "status": "done",
                "detail": f"Retrieved YouTube metadata",
            })
        except Exception as e:
            pipeline_steps.append({
                "step": 2, "name": "youtube_metadata", "status": "error",
                "detail": str(e),
            })
            raise HTTPException(status_code=422, detail=f"YouTube metadata query failed: {e}")

    elif input_type == "instagram":
        try:
            metadata = await get_instagram_metadata(content)
            text_for_ai = metadata
            pipeline_steps.append({
                "step": 2, "name": "instagram_metadata", "status": "done",
                "detail": f"Retrieved Instagram metadata",
            })
        except Exception as e:
            pipeline_steps.append({
                "step": 2, "name": "instagram_metadata", "status": "error",
                "detail": str(e),
            })
            raise HTTPException(status_code=422, detail=f"Instagram metadata query failed: {e}")

    elif input_type == "website":
        try:
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


@app.post("/process/file")
async def process_file(
    file: UploadFile = File(...),
    hf_token: str = Form(...),
):
    """
    Process an uploaded file (PDF, text, etc.).
    Reads file content as text and runs through the AI pipeline.
    """
    if not hf_token or not hf_token.strip():
        raise HTTPException(status_code=400, detail="Hugging Face token is required.")

    try:
        raw_bytes = await file.read()
        text_content = raw_bytes.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}")

    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Prepend filename for context
    text_for_ai = f"File: {file.filename}\n\n{text_content[:8000]}"

    # Run through the same AI pipeline
    try:
        processed = process_text(text_for_ai, hf_token.strip())
        processed_dict = result_to_dict(processed)
    except AIInvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"HF token error: {e}")
    except ProcessingError as e:
        raise HTTPException(status_code=422, detail=f"AI processing failed: {e}")

    official_info = get_official_info(processed.official_link)
    official_link = official_info.get("official_link", "")

    entry = build_entry(
        processed=processed_dict,
        source_url="",
        official_link=official_link,
    )
    md_entry = generate_entry_md(entry)

    return {
        "status": "success",
        "result": {
            "title": processed.title,
            "category": processed.category,
            "summary": processed.summary,
            "official_link": official_link,
            "source_url": "",
            "tools_mentioned": processed.tools_mentioned,
            "links_mentioned": processed.links_mentioned,
            "md_entry": md_entry,
            "saved_on": format_retro_date(datetime.utcnow()),
        },
        "input_type": "file",
        "filename": file.filename,
    }


# ─── Drive Routes ────────────────────────────────────────────────────────────

@app.post("/drive/save")
async def drive_save(request: DriveSaveRequest):
    """Save a Markdown entry to the user's Google Drive VaultMCP folder."""
    if not request.md_entry.strip():
        raise HTTPException(status_code=400, detail="md_entry is empty.")
    if not request.access_token.strip():
        raise HTTPException(status_code=400, detail="Google Drive access token is required.")

    try:
        result = drive_save_to_drive(
            md_entry=request.md_entry,
            access_token=request.access_token,
            refresh_token=request.refresh_token,
        )

        return {
            "status": "success",
            "message": f"Entry {result.action} in Google Drive.",
            "file_id": result.file_id,
            "folder_id": result.folder_id,
            "file_name": result.file_name,
            "action": result.action,
        }

    except DriveAuthError as e:
        raise HTTPException(status_code=401, detail=f"Google Drive auth error: {e}")
    except DriveError as e:
        raise HTTPException(status_code=500, detail=f"Google Drive error: {e}")


@app.get("/drive/vault")
async def drive_get_vault_route(
    access_token: str = Query(..., description="Google Drive OAuth access token"),
    refresh_token: Optional[str] = Query(None, description="Google Drive OAuth refresh token"),
):
    """Fetch the full vault.md content from the user's Google Drive."""
    if not access_token.strip():
        raise HTTPException(status_code=400, detail="Google Drive access token is required.")

    try:
        vault_content = drive_get_vault(
            access_token=access_token,
            refresh_token=refresh_token,
        )

        if vault_content is None:
            return {
                "status": "empty",
                "message": "No vault.md found in Google Drive. Save your first entry to create it.",
                "content": None,
            }

        return {
            "status": "success",
            "content": vault_content,
        }

    except DriveAuthError as e:
        raise HTTPException(status_code=401, detail=f"Google Drive auth error: {e}")
    except DriveError as e:
        raise HTTPException(status_code=500, detail=f"Google Drive error: {e}")


# ─── Auth Routes ─────────────────────────────────────────────────────────────

@app.get("/auth/url")
async def auth_get_url():
    """Get the Google OAuth consent URL for the user to visit."""
    try:
        url = drive_get_auth_url()
        return {"status": "success", "auth_url": url}
    except DriveAuthError as e:
        raise HTTPException(status_code=500, detail=f"OAuth config error: {e}")


@app.post("/auth/google")
async def auth_google(request: DriveAuthRequest):
    """Exchange a Google OAuth authorization code for access + refresh tokens."""
    if not request.auth_code.strip():
        raise HTTPException(status_code=400, detail="Auth code is empty.")

    try:
        tokens = drive_auth_google(request.auth_code)

        return {
            "status": "success",
            "tokens": {
                "access_token": tokens.access_token,
                "refresh_token": tokens.refresh_token,
                "expires_in": tokens.expires_in,
            },
        }

    except DriveAuthError as e:
        raise HTTPException(status_code=401, detail=f"OAuth exchange failed: {e}")


# ─── MCP Routes ──────────────────────────────────────────────────────────────

def parse_vault_md(md_content: str) -> list:
    """Parses a vault.md file contents into a list of structured entries."""
    items = []
    if not md_content:
        return items

    sections = re.split(r"^###\s+", md_content, flags=re.MULTILINE)
    
    for i in range(1, len(sections)):
        section = sections[i]
        lines = section.strip().split("\n")
        if not lines:
            continue
        title = lines[0].strip()
        
        summary = ""
        official_link = ""
        source_url = ""
        tools_mentioned = []
        saved_on = ""
        
        for line in lines[1:]:
            trimmed = line.strip()
            if trimmed.startswith("- Summary:"):
                summary = trimmed[len("- Summary:"):].strip()
            elif trimmed.startswith("- Official link:"):
                official_link = trimmed[len("- Official link:"):].strip()
                if official_link == "N/A":
                    official_link = ""
            elif trimmed.startswith("- Source:"):
                source_url = trimmed[len("- Source:"):].strip()
            elif trimmed.startswith("- Tools mentioned:"):
                tools_str = trimmed[len("- Tools mentioned:"):].strip()
                tools_mentioned = [t.strip() for t in tools_str.split(",") if t.strip()]
            elif trimmed.startswith("- Saved on:"):
                saved_on = trimmed[len("- Saved on:"):].strip()
                
        above_content = md_content.split(f"### {title}")[0]
        cat_matches = re.findall(r"##\s+\[CATEGORY:\s*(.+?)\]", above_content)
        category = cat_matches[-1].strip() if cat_matches else "Other"
        
        items.append({
            "title": title,
            "category": category,
            "summary": summary,
            "official_link": official_link,
            "source_url": source_url,
            "tools_mentioned": tools_mentioned,
            "saved_on": saved_on
        })
        
    return items


@app.get("/mcp/vault")
async def mcp_get_vault(
    x_drive_token: Optional[str] = Header(None, alias="X-Drive-Token")
):
    """Returns the full vault.md contents as plain text."""
    if not x_drive_token or not x_drive_token.strip():
        raise HTTPException(
            status_code=400,
            detail="Google Drive access token is required in X-Drive-Token header."
        )

    try:
        vault_content = drive_get_vault(
            access_token=x_drive_token,
            refresh_token=None,
        )

        if vault_content is None:
            # Fallback to standard empty vault if not created yet
            vault_content = "# VaultMCP Vault\n\n> Save what you scroll. Use what you saved.\n"

        return Response(content=vault_content, media_type="text/plain")

    except DriveAuthError as e:
        raise HTTPException(status_code=401, detail=f"Google Drive auth error: {e}")
    except DriveError as e:
        raise HTTPException(status_code=500, detail=f"Google Drive error: {e}")


@app.get("/mcp/search")
async def mcp_search_vault(
    q: str = Query(..., description="Keyword query to search for"),
    x_drive_token: Optional[str] = Header(None, alias="X-Drive-Token")
):
    """Searches vault.md for matching entries by keyword and returns them as a JSON array."""
    if not x_drive_token or not x_drive_token.strip():
        raise HTTPException(
            status_code=400,
            detail="Google Drive access token is required in X-Drive-Token header."
        )

    try:
        vault_content = drive_get_vault(
            access_token=x_drive_token,
            refresh_token=None,
        )

        if not vault_content:
            return []

        entries = parse_vault_md(vault_content)
        query = q.strip().lower()
        results = []

        for entry in entries:
            title = entry.get("title", "").lower()
            category = entry.get("category", "").lower()
            summary = entry.get("summary", "").lower()
            tools = [t.lower() for t in entry.get("tools_mentioned", [])]

            if (query in title or 
                query in category or 
                query in summary or 
                any(query in t for t in tools)):
                results.append(entry)

        return results

    except DriveAuthError as e:
        raise HTTPException(status_code=401, detail=f"Google Drive auth error: {e}")
    except DriveError as e:
        raise HTTPException(status_code=500, detail=f"Google Drive error: {e}")


# ─── Run with Uvicorn ────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=True)
