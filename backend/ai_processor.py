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

import httpx


# ─── Configuration ───────────────────────────────────────────────────────────

PRIMARY_MODEL = "Qwen/Qwen2.5-7B-Instruct"
FALLBACK_MODEL = "HuggingFaceH4/zephyr-7b-beta"
HF_INFERENCE_URL = "https://router.huggingface.co/v1/chat/completions"

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
    model: str = PRIMARY_MODEL     # Model used
    was_fallback: bool = False     # True if JSON parsing failed and we used fallback


# ─── Prompt Construction ─────────────────────────────────────────────────────

def _build_prompt(text: str) -> str:
    """Build the full prompt for the model."""
    trimmed = text[:MAX_INPUT_CHARS]
    if len(text) > MAX_INPUT_CHARS:
        trimmed += "\n[...content truncated...]"

    if "User's note:" in text:
        prompt = f"""A user bookmarked a website with their personal observation.

{trimmed}

Return ONLY this JSON, no extra text, no backticks:
{{"title": "short name of the website or brand",
"category": "UI Design / AI Tools / Frameworks / APIs & Libraries / Prompts / Tips & Tricks / Other",
"summary": "Write 2-3 sentences from the USER'S PERSPECTIVE based on their note. What did THEY observe or like about it? Use phrases like 'This site features...', 'Notable for its...', 'User saved this for its...'",
"official_link": "the URL from the content",
"tools_mentioned": [],
"links_mentioned": []}}"""
    else:
        prompt = f"""
You are a knowledge vault assistant. Analyze the following content and extract structured information.

Content: {trimmed}

Return ONLY a JSON object with NO extra text, NO markdown, NO backticks:
{{
  "title": "clear descriptive name of the tool, concept, or resource (NOT a URL)",
  "category": "one of: AI Tools / Prompts / APIs & Libraries / Frameworks / UI Design / Tips & Tricks / Other",
  "summary": "REQUIRED. Minimum 2-3 sentences explaining: (1) what this tool/concept is, (2) what problem it solves, (3) who should use it. Never leave empty. Never copy the title.",
  "official_link": "the most likely official URL for this tool or resource",
  "tools_mentioned": ["list", "of", "tools"],
  "links_mentioned": ["list", "of", "urls"]
}}
"""
    return prompt



# ─── Core Processing ────────────────────────────────────────────────────────

def process_text(text: str, hf_token: str) -> ProcessedContent:
    """
    Process raw text through Mistral-7B-Instruct (or Zephyr) to extract structured content.

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

    models_to_try = [PRIMARY_MODEL, FALLBACK_MODEL]
    last_error: Optional[Exception] = None

    for model in models_to_try:
        # ── Build prompt and request payload ─────────────────────────────────
        prompt = _build_prompt(text)

        headers = {
            "Authorization": f"Bearer {hf_token.strip()}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 1024,
            "temperature": 0.1,
        }

        # ── Send to HF Inference API with retry logic ────────────────────────
        backoff = INITIAL_BACKOFF_SECONDS
        model_failed = False

        print(f"[AI Processor] Attempting extraction with model: {model}...", flush=True)

        for attempt in range(MAX_RETRIES):
            try:
                with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    response = client.post(
                        HF_INFERENCE_URL,
                        headers=headers,
                        json=payload,
                    )

                # ── Handle HTTP status codes ─────────────────────────────
                if response.status_code == 200:
                    result = _parse_llm_response(response, text)
                    result.model = model
                    return result

                if response.status_code == 401:
                    raise InvalidTokenError(
                        "Hugging Face token is invalid or expired. "
                        "Get a new token at: https://huggingface.co/settings/tokens"
                    )

                if response.status_code == 403:
                    raise InvalidTokenError(
                        f"HF Token needs Inference Provider permissions. "
                        f"Go to huggingface.co/settings/tokens → update token → enable Inference Providers"
                    )

                if response.status_code == 429:
                    last_error = ProcessingError(
                        f"HF API rate limit hit for {model} (attempt {attempt + 1}/{MAX_RETRIES})."
                    )

                elif response.status_code == 503:
                    body = _safe_json(response)
                    estimated_time = body.get("estimated_time", backoff) if body else backoff
                    backoff = min(float(estimated_time), MAX_BACKOFF_SECONDS)
                    last_error = ProcessingError(
                        f"Model {model} is loading (attempt {attempt + 1}/{MAX_RETRIES}). "
                        f"Waiting {backoff:.0f}s..."
                    )

                else:
                    body = _safe_json(response)
                    error_detail = body.get("error", response.text[:300]) if body else response.text[:300]
                    raise ProcessingError(
                        f"HF API error for {model} (HTTP {response.status_code}): {error_detail}"
                    )

            except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as e:
                last_error = ProcessingError(
                    f"Network error on attempt {attempt + 1}/{MAX_RETRIES} for {model}: {e}"
                )

            except (InvalidTokenError, ProcessingError) as e:
                if isinstance(e, InvalidTokenError) and "invalid or expired" in str(e):
                    # Fundamental auth error, do not switch models
                    raise
                # Switch to fallback model
                last_error = e
                model_failed = True
                break

            # ── Wait before retry ────────────────────────────────────────
            if attempt < MAX_RETRIES - 1:
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)

        if model_failed:
            print(f"[AI Processor] Model {model} failed with: {last_error}. Switching model...", flush=True)
            continue

    # All retries / models exhausted — return fallback instead of crashing
    return _build_fallback(text, f"All models failed. Last error: {last_error}")


# ─── Response Parsing ────────────────────────────────────────────────────────

def _parse_llm_response(response: httpx.Response, original_text: str) -> ProcessedContent:
    """
    Parse the LLM response and extract structured JSON.
    If the LLM returns malformed JSON, attempt regex extraction, then fallback.
    """
    body = _safe_json(response)

    if body is None:
        return _build_fallback(original_text, "HF API returned non-JSON response.")

    raw_output = ""
    # ── Handle OpenAI-compatible response format ─────────────────────
    if isinstance(body, dict) and "choices" in body:
        choices = body.get("choices", [])
        if choices and isinstance(choices, list) and len(choices) > 0:
            message = choices[0].get("message", {})
            if isinstance(message, dict):
                raw_output = message.get("content", "")

    # ── Legacy/Alternative response format fallback ──────────────────
    if not raw_output:
        if isinstance(body, list) and len(body) > 0:
            generated = body[0]
            if isinstance(generated, dict):
                raw_output = generated.get("generated_text", "")
            else:
                raw_output = str(generated)
        elif isinstance(body, dict):
            raw_output = body.get("generated_text", json.dumps(body))
        else:
            raw_output = str(body)

    raw_output = raw_output.strip()

    # ── Attempt 1: Direct JSON parse ─────────────────────────────────
    parsed = _try_parse_json(raw_output)
    if parsed:
        return _validate_and_build(parsed, original_text, was_fallback=False)

    # ── Attempt 2: Extract JSON from markdown code fence ─────────────
    # LLMs sometimes wrap JSON in ```json ... ```
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_output, re.DOTALL)
    if fence_match:
        parsed = _try_parse_json(fence_match.group(1))
        if parsed:
            return _validate_and_build(parsed, original_text, was_fallback=False)

    # ── Attempt 3: Find first { ... } block via regex ────────────────
    brace_match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", raw_output, re.DOTALL)
    if brace_match:
        parsed = _try_parse_json(brace_match.group(0))
        if parsed:
            return _validate_and_build(parsed, original_text, was_fallback=False)

    # ── All attempts failed — return fallback ────────────────────────
    return _build_fallback(
        original_text,
        f"LLM did not return valid JSON. Raw output: {raw_output[:200]}"
    )


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
        summary = original_text[:500].strip()

    return ProcessedContent(
        title=title[:60],
        category=category,
        summary=summary[:500],
        official_link=official_link,
        tools_mentioned=tools,
        links_mentioned=links,
        raw_text=original_text,
        model=PRIMARY_MODEL,
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
        summary=text[:500].strip(),
        official_link=official_link,
        tools_mentioned=[],
        links_mentioned=found_links[:10],
        raw_text=text,
        model=PRIMARY_MODEL,
        was_fallback=True,
    )


def _safe_json(response: httpx.Response):
    """Attempt to parse response as JSON, return None on failure."""
    try:
        return response.json()
    except Exception:
        return None


# ─── Convenience: Convert to dict ────────────────────────────────────────────

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

    print(f"[VaultMCP] Processing text ({len(text_input)} chars) with {PRIMARY_MODEL}")

    try:
        result = process_text(text_input, test_token)

        print(f"[VaultMCP] OK: Processing complete!")
        print(f"  Fallback : {'Yes (JSON parsing failed)' if result.was_fallback else 'No (clean JSON)'}")
        print(f"  Result   :")
        print(json.dumps(result_to_dict(result), indent=2))

    except InvalidTokenError as e:
        print(f"[VaultMCP] ERROR: Token error: {e}")
        sys.exit(1)

    except ProcessingError as e:
        print(f"[VaultMCP] ERROR: Processing failed: {e}")
        sys.exit(1)
