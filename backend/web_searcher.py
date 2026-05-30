"""
web_searcher.py — Web Search Fallback for Source Verification (Simplified)

Returns the official_link already extracted by Mistral. No API calls.
"""

def get_official_info(official_link: str) -> dict:
    """
    Returns a dict containing the official link directly.
    Accepts the official_link extracted by the AI processor.
    """
    return {
        "official_link": official_link or "",
        "description": "",
        "provider": "mistral"
    }
