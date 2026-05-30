"""
web_searcher.py — Web Search for Source Verification (Tavily + Serper fallback)

Takes a tool name or title extracted by ai_processor and searches the web to
find the official source link and a clean description.

Strategy:
  1. Try Tavily API first (primary — 1000 free searches/month)
  2. If Tavily fails or is not configured, fall back to Serper API (2500 free searches)
  3. If both fail, return None gracefully (entry is saved without a verified link)

API keys are loaded from the .env file.
"""

import os
import re
from dataclasses import dataclass
from typing import Optional, List

import httpx
from dotenv import load_dotenv

# ─── Load Environment ────────────────────────────────────────────────────────
load_dotenv()

# ─── Configuration ───────────────────────────────────────────────────────────

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
SERPER_API_KEY = os.getenv("SERPER_API_KEY", "")
SEARCH_PROVIDER = os.getenv("SEARCH_PROVIDER", "tavily").lower()

TAVILY_SEARCH_URL = "https://api.tavily.com/search"
SERPER_SEARCH_URL = "https://google.serper.dev/search"

REQUEST_TIMEOUT_SECONDS = 15.0


# ─── Custom Exceptions ──────────────────────────────────────────────────────

class SearchError(Exception):
    """Raised when web search fails on all providers."""
    pass


# ─── Result Container ───────────────────────────────────────────────────────

@dataclass
class SearchResult:
    """A single search result with link and description."""
    title: str                          # Page title
    url: str                            # Official / source URL
    description: str                    # Clean snippet or description
    provider: str                       # "tavily" or "serper"


@dataclass
class SearchResponse:
    """Full search response with top results."""
    query: str                          # The search query used
    top_result: Optional[SearchResult]  # Best result (None if nothing found)
    all_results: List[SearchResult]     # All results returned
    provider_used: str                  # Which provider succeeded


# ─── Tavily Search ───────────────────────────────────────────────────────────

def _search_tavily(query: str) -> Optional[SearchResponse]:
    """
    Search using the Tavily API.

    Args:
        query: Search query string.

    Returns:
        SearchResponse on success, None if Tavily is unavailable or fails.
    """
    if not TAVILY_API_KEY or TAVILY_API_KEY == "tvly-your_key_here":
        return None

    payload = {
        "api_key": TAVILY_API_KEY,
        "query": query,
        "search_depth": "basic",
        "max_results": 5,
        "include_answer": False,
        "include_raw_content": False,
    }

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = client.post(TAVILY_SEARCH_URL, json=payload)

        if response.status_code == 401:
            # Invalid API key — skip to fallback
            return None

        if response.status_code == 429:
            # Rate limited — skip to fallback
            return None

        if response.status_code != 200:
            return None

        body = response.json()
        raw_results = body.get("results", [])

        if not raw_results:
            return SearchResponse(
                query=query,
                top_result=None,
                all_results=[],
                provider_used="tavily",
            )

        results = []
        for item in raw_results:
            result = SearchResult(
                title=item.get("title", "").strip(),
                url=item.get("url", "").strip(),
                description=_clean_description(item.get("content", "")),
                provider="tavily",
            )
            if result.url:
                results.append(result)

        return SearchResponse(
            query=query,
            top_result=results[0] if results else None,
            all_results=results,
            provider_used="tavily",
        )

    except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout):
        return None
    except Exception:
        return None


# ─── Serper Search ───────────────────────────────────────────────────────────

def _search_serper(query: str) -> Optional[SearchResponse]:
    """
    Search using the Serper (Google Search) API.

    Args:
        query: Search query string.

    Returns:
        SearchResponse on success, None if Serper is unavailable or fails.
    """
    if not SERPER_API_KEY:
        return None

    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json",
    }

    payload = {
        "q": query,
        "num": 5,
    }

    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = client.post(SERPER_SEARCH_URL, headers=headers, json=payload)

        if response.status_code == 401:
            return None

        if response.status_code == 429:
            return None

        if response.status_code != 200:
            return None

        body = response.json()
        raw_results = body.get("organic", [])

        if not raw_results:
            return SearchResponse(
                query=query,
                top_result=None,
                all_results=[],
                provider_used="serper",
            )

        results = []
        for item in raw_results:
            result = SearchResult(
                title=item.get("title", "").strip(),
                url=item.get("link", "").strip(),
                description=_clean_description(item.get("snippet", "")),
                provider="serper",
            )
            if result.url:
                results.append(result)

        return SearchResponse(
            query=query,
            top_result=results[0] if results else None,
            all_results=results,
            provider_used="serper",
        )

    except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout):
        return None
    except Exception:
        return None


# ─── Main Search Function ───────────────────────────────────────────────────

def search_web(query: str) -> Optional[SearchResponse]:
    """
    Search the web for a tool name, concept, or title.

    Strategy:
      1. Try the preferred provider (from SEARCH_PROVIDER env var, default Tavily)
      2. If it fails, try the other provider
      3. If both fail, return None (search is optional — entry is saved without link)

    Args:
        query: The search query (e.g. tool name, concept title).

    Returns:
        SearchResponse with results, or None if all providers fail.
    """
    if not query or not query.strip():
        return None

    query = query.strip()

    # Enrich the query for better results
    enriched_query = f"{query} official website"

    # Determine provider order
    if SEARCH_PROVIDER == "serper":
        providers = [_search_serper, _search_tavily]
    else:
        providers = [_search_tavily, _search_serper]

    # Try each provider in order
    for search_fn in providers:
        result = search_fn(enriched_query)
        if result is not None and result.top_result is not None:
            return result

    # Both providers returned no results — try without "official website"
    for search_fn in providers:
        result = search_fn(query)
        if result is not None and result.top_result is not None:
            return result

    return None


# ─── Convenience: Extract official link ──────────────────────────────────────

def get_official_link(query: str) -> Optional[str]:
    """
    Quick helper — search for a query and return just the top URL.

    Args:
        query: Tool name or title to search for.

    Returns:
        URL string or None.
    """
    response = search_web(query)
    if response and response.top_result:
        return response.top_result.url
    return None


def get_official_info(query: str) -> dict:
    """
    Search and return a dict with official_link and description.
    Safe to call even if no API keys are configured — returns empty strings.

    Args:
        query: Tool name or title.

    Returns:
        {"official_link": "...", "description": "...", "provider": "..."}
    """
    response = search_web(query)

    if response and response.top_result:
        return {
            "official_link": response.top_result.url,
            "description": response.top_result.description,
            "provider": response.provider_used,
        }

    return {
        "official_link": "",
        "description": "",
        "provider": "none",
    }


# ─── Text Cleaning ──────────────────────────────────────────────────────────

def _clean_description(text: str) -> str:
    """Clean up a search snippet for use as a description."""
    if not text:
        return ""

    text = text.strip()

    # Remove excessive whitespace
    text = re.sub(r"\s+", " ", text)

    # Remove trailing ellipsis artifacts
    text = re.sub(r"\s*\.{3,}\s*$", ".", text)

    # Cap length
    if len(text) > 300:
        text = text[:297].rsplit(" ", 1)[0] + "..."

    return text


# ─── CLI Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python web_searcher.py <search_query>")
        print('Example: python web_searcher.py "Cursor AI"')
        print()
        print("Ensure TAVILY_API_KEY and/or SERPER_API_KEY are set in .env")
        sys.exit(1)

    test_query = " ".join(sys.argv[1:])
    print(f"[VaultMCP] Searching for: {test_query}")
    print(f"[VaultMCP] Preferred provider: {SEARCH_PROVIDER}")
    print(f"[VaultMCP] Tavily key: {'configured' if TAVILY_API_KEY and TAVILY_API_KEY != 'tvly-your_key_here' else 'NOT SET'}")
    print(f"[VaultMCP] Serper key: {'configured' if SERPER_API_KEY else 'NOT SET'}")
    print()

    result = search_web(test_query)

    if result is None:
        print("[VaultMCP] ✗ No results from any provider.")
        print("  Check your API keys in .env")
        sys.exit(1)

    if result.top_result is None:
        print(f"[VaultMCP] ✗ {result.provider_used} returned 0 results.")
        sys.exit(1)

    print(f"[VaultMCP] ✓ Found {len(result.all_results)} result(s) via {result.provider_used}")
    print()

    for i, r in enumerate(result.all_results[:3], 1):
        print(f"  [{i}] {r.title}")
        print(f"      {r.url}")
        print(f"      {r.description[:120]}")
        print()
