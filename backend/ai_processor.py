"""
ai_processor.py — AI Content Structuring via Mistral-7B-Instruct (Hugging Face API)

Takes plain text (transcript, pasted prompt, scraped content) and uses Mistral to
extract structured JSON with: title, category, summary, tools_mentioned, links_mentioned.

The user's HF token is passed as a parameter (never stored server-side).

Error handling:
  - Invalid HF token → raises ProcessingError
  - LLM returns non-JSON → attempts regex extraction, then falls back to raw text
  - HF API rate limit → retries with exponential backoff
  - Model loading (cold start) → retries automatically
"""

import json
import re
import time
from dataclasses import dataclass, field
from typing import List, Optional

from huggingface_hub import InferenceClient
from huggingface_hub.errors import HfHubHTTPError
import logging

logger = logging.getLogger(__name__)

# ─── Configuration ───────────────────────────────────────────────────────────

# Use Qwen 2.5 Coder 32B for incredibly reliable JSON and ungated access
LLAMA_MODEL = "Qwen/Qwen2.5-Coder-32B-Instruct"

# Valid categories — the LLM must pick one of these
VALID_CATEGORIES = [
    "AI Tools",
    "Prompts",
    "APIs & Libraries",
    "Frameworks",
    "UI Design",
    "Tips & Tricks",
    "Other",
]

# Retry settings
MAX_RETRIES = 5
INITIAL_BACKOFF_SECONDS = 2.0
MAX_BACKOFF_SECONDS = 60.0

# HTTP timeout (LLM generation can be slow on free tier)
REQUEST_TIMEOUT_SECONDS = 120.0

# Max input text length (trim very long inputs to avoid token limits)
MAX_INPUT_CHARS = 8000


# ─── Custom Exceptions ──────────────────────────────────────────────────────

class ProcessingError(Exception):
    """Raised when AI processing fails."""
    pass


class InvalidTokenError(ProcessingError):
    """Raised when the HF API token is invalid or expired."""
    pass


# ─── Result Container ───────────────────────────────────────────────────────

@dataclass
class ProcessedContent:
    """Structured content extracted by the AI."""
    title: str
    category: str
    summary: str
    official_link: str = ""
    tools_mentioned: List[str] = field(default_factory=list)
    links_mentioned: List[str] = field(default_factory=list)
    raw_text: str = ""             # Original input text
    model: str = LLAMA_MODEL       # Model used
    was_fallback: bool = False     # True if JSON parsing failed and we used fallback


# ─── Prompt Construction ─────────────────────────────────────────────────────

def _build_prompt(text: str) -> str:
    """Build the full prompt for the Mistral model."""
    trimmed = text[:MAX_INPUT_CHARS]
    if len(text) > MAX_INPUT_CHARS:
        trimmed += "\n[...content truncated...]"

    prompt = (
        "Analyze the following text and extract information into a JSON object.\n"
        "The JSON MUST have EXACTLY these keys:\n"
        "- title: A short title\n"
        "- category: One of [AI Tools, Prompts, APIs & Libraries, Frameworks, UI Design, Tips & Tricks, Other]\n"
        "- summary: A concise summary of the content\n"
        "- official_link: The official URL if mentioned (leave empty if none)\n"
        "- tools_mentioned: Array of tool names\n"
        "- links_mentioned: Array of URLs\n\n"
        "Return ONLY valid JSON without markdown fences. No explanations.\n\n"
        f"Text: {trimmed}"
    )
    return prompt


# ─── Core Processing ────────────────────────────────────────────────────────

def process_text(text: str, hf_token: str) -> ProcessedContent:
    """
    Process raw text through Mistral-7B-Instruct to extract structured content.

    Args:
        text:     Raw text (transcript, pasted content, scraped page, etc.)
        hf_token: User's Hugging Face API token.

    Returns:
        ProcessedContent with title, category, summary, tools, and links.

    Raises:
        ProcessingError:   If processing fails after all retries.
        InvalidTokenError: If the HF token is invalid or expired.
    """

    # ── Validate inputs ──────────────────────────────────────────────────
    if not hf_token or not hf_token.strip():
        raise InvalidTokenError("Hugging Face token is empty. Please provide a valid token.")

    if not text or not text.strip():
        raise ProcessingError("Input text is empty. Nothing to process.")

    text = text.strip()

    # ── Build prompt ─────────────────────────────────────────────────────
    prompt = _build_prompt(text)

    # ── Setup InferenceClient ────────────────────────────────────────────
    client = InferenceClient(model=LLAMA_MODEL, token=hf_token.strip())
    
    backoff = INITIAL_BACKOFF_SECONDS
    last_error: Optional[Exception] = None

    for attempt in range(MAX_RETRIES):
        try:
            response = client.chat_completion(
                messages=[
                    {"role": "system", "content": "You are a helpful AI that ONLY outputs valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=1500,
                temperature=0.1
            )
            
            raw_output = response.choices[0].message.content.strip()
            
            # Attempt parsing
            parsed = _try_parse_json(raw_output)
            if parsed:
                return _validate_and_build(parsed, text, was_fallback=False)

            # Markdown fence extraction fallback
            fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
            if fence_match:
                parsed = _try_parse_json(fence_match.group(1))
                if parsed:
                    return _validate_and_build(parsed, text, was_fallback=False)
                    
            # Brace extraction fallback
            brace_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", raw_output, re.DOTALL)
            if brace_match:
                parsed = _try_parse_json(brace_match.group(0))
                if parsed:
                    return _validate_and_build(parsed, text, was_fallback=False)

            # If all parsing fails, return fallback
            return _build_fallback(text, f"LLM did not return valid JSON. Raw output: {raw_output[:200]}")

        except HfHubHTTPError as e:
            if e.response.status_code == 401:
                raise InvalidTokenError("Hugging Face token is invalid or expired.")
            elif e.response.status_code == 403:
                raise InvalidTokenError("Hugging Face token does not have permission for this model.")
            elif e.response.status_code == 503:
                last_error = ProcessingError(f"Model is loading (attempt {attempt+1}/{MAX_RETRIES}). Waiting {backoff:.0f}s...")
            else:
                last_error = ProcessingError(f"HF API Error: {str(e)}")
        except Exception as e:
            last_error = ProcessingError(f"Network/Unexpected error: {str(e)}")

        if attempt < MAX_RETRIES - 1:
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)

    return _build_fallback(text, f"All {MAX_RETRIES} attempts failed. Last error: {last_error}")


def _try_parse_json(text: str) -> Optional[dict]:
    """Attempt to parse a string as JSON. Returns dict or None."""
    try:
        result = json.loads(text)
        if isinstance(result, dict):
            return result
        return None
    except (json.JSONDecodeError, ValueError):
        return None


def _validate_and_build(
    parsed: dict,
    original_text: str,
    was_fallback: bool,
) -> ProcessedContent:
    """Validate parsed JSON fields and build a ProcessedContent."""

    title = str(parsed.get("title", "")).strip()
    category = str(parsed.get("category", "")).strip()
    summary = str(parsed.get("summary", "")).strip()
    official_link = str(parsed.get("official_link", "")).strip()

    # Clear instructions/descriptions returned as values
    if "best known official URL" in official_link:
        official_link = ""

    # Validate category — must be one of the allowed values
    if category not in VALID_CATEGORIES:
        # Try fuzzy match (case-insensitive, partial match)
        category_lower = category.lower()
        matched = False
        for valid in VALID_CATEGORIES:
            if valid.lower() in category_lower or category_lower in valid.lower():
                category = valid
                matched = True
                break
        if not matched:
            category = "Other"

    # Extract tools_mentioned
    tools_raw = parsed.get("tools_mentioned", [])
    if isinstance(tools_raw, list):
        tools = [str(t).strip() for t in tools_raw if str(t).strip()]
    else:
        tools = []

    # Extract links_mentioned
    links_raw = parsed.get("links_mentioned", [])
    if isinstance(links_raw, list):
        links = [str(l).strip() for l in links_raw if str(l).strip()]
    else:
        links = []

    # Fallback for missing required fields
    if not title:
        title = original_text[:60].strip().rstrip(".")
    if not summary:
        summary = original_text[:200].strip()

    return ProcessedContent(
        title=title[:60],
        category=category,
        summary=summary[:200],
        official_link=official_link,
        tools_mentioned=tools,
        links_mentioned=links,
        raw_text=original_text,
        model=LLAMA_MODEL,
        was_fallback=was_fallback,
    )


def _build_fallback(text: str, reason: str) -> ProcessedContent:
    """Build a fallback ProcessedContent when AI processing fails."""

    # Try to extract a title from the first line or first N chars
    first_line = text.split("\n")[0].strip()
    title = first_line[:60] if first_line else "Untitled Entry"

    # Try to detect links in the raw text
    url_pattern = r"https?://[^\s<>\"')\]]+"
    found_links = re.findall(url_pattern, text)
    official_link = found_links[0] if found_links else ""

    return ProcessedContent(
        title=title,
        category="Other",
        summary=f"FALLBACK: {reason} | TEXT: {text[:150].strip()}",
        official_link=official_link,
        tools_mentioned=[],
        links_mentioned=found_links[:10],
        raw_text=text,
        model=LLAMA_MODEL,
        was_fallback=True,
    )


# ─── Convenience: Convert to dict ────────────────────────────────────────────

def process_mcp_compare(prompt: str, hf_token: str) -> str:
    """Sends the comparison prompt to the LLM and returns the raw recommendation text."""
    client = InferenceClient(model=LLAMA_MODEL, token=hf_token.strip())
    
    try:
        response = client.chat_completion(
            messages=[
                {"role": "system", "content": "You are a helpful AI coding assistant."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=1000,
            temperature=0.2
        )
        return response.choices[0].message.content.strip()
    except HfHubHTTPError as e:
        if e.response.status_code == 401 or e.response.status_code == 403:
            raise InvalidTokenError("Hugging Face API token is invalid or expired.")
        logger.error(f"Failed to process MCP compare: {e}")
        return "Failed to analyze tools. Please ensure your Hugging Face API token is valid."
    except Exception as e:
        logger.error(f"Failed to process MCP compare: {e}")
        return "Failed to analyze tools. Please ensure your Hugging Face API token is valid."


def result_to_dict(result: ProcessedContent) -> dict:
    """Convert a ProcessedContent to the standard JSON schema dict."""
    return {
        "title": result.title,
        "category": result.category,
        "summary": result.summary,
        "official_link": result.official_link,
        "tools_mentioned": result.tools_mentioned,
        "links_mentioned": result.links_mentioned,
    }


# ─── CLI Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python ai_processor.py <text_or_file_path> <hf_token>")
        print("  If the first argument is a file path, its contents are read.")
        print("  Otherwise, the argument is used as the raw text.")
        print()
        print('Example: python ai_processor.py "This reel shows Cursor AI features" hf_abc123...')
        sys.exit(1)

    text_input = sys.argv[1]
    test_token = sys.argv[2]

    # Check if the input is a file path
    import os
    if os.path.isfile(text_input):
        with open(text_input, "r", encoding="utf-8") as f:
            text_input = f.read()
        print(f"[VaultMCP] Read text from file ({len(text_input)} chars)")

    print(f"[VaultMCP] Processing text ({len(text_input)} chars) with {LLAMA_MODEL}")

    try:
        result = process_text(text_input, test_token)

        print(f"[VaultMCP] ✓ Processing complete!")
        print(f"  Fallback : {'Yes (JSON parsing failed)' if result.was_fallback else 'No (clean JSON)'}")
        print(f"  Result   :")
        print(json.dumps(result_to_dict(result), indent=2))

    except InvalidTokenError as e:
        print(f"[VaultMCP] ✗ Token error: {e}")
        sys.exit(1)

    except ProcessingError as e:
        print(f"[VaultMCP] ✗ Processing failed: {e}")
        sys.exit(1)
