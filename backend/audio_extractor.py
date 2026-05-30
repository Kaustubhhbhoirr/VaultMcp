"""
audio_extractor.py — Audio Extraction from Instagram Reels & YouTube Shorts

Uses yt-dlp to download ONLY the audio track (not the full video).
Saves as a temporary .mp3 file and returns the file path.

Supported platforms:
  - Instagram Reels (https://instagram.com/reel/...)
  - YouTube Shorts  (https://youtube.com/shorts/... or youtu.be/...)

Error handling:
  - Invalid / malformed URLs → raises ExtractionError
  - Private / age-restricted content → raises ExtractionError
  - Network failures → raises ExtractionError
  - Unsupported platforms → raises UnsupportedPlatformError
"""

import os
import re
import uuid
import tempfile
import shutil
from dataclasses import dataclass
from typing import Optional

import yt_dlp


# ─── Custom Exceptions ──────────────────────────────────────────────────────

class ExtractionError(Exception):
    """Raised when audio extraction fails for any reason."""
    pass


class UnsupportedPlatformError(Exception):
    """Raised when the URL is not from a supported platform."""
    pass


# ─── Result Container ───────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    """Holds the result of a successful audio extraction."""
    audio_path: str          # Absolute path to the extracted .mp3 file
    source_url: str          # Original URL that was processed
    platform: str            # "instagram" | "youtube"
    title: Optional[str]     # Video/reel title (if available)
    duration: Optional[int]  # Duration in seconds (if available)


# ─── URL Detection ───────────────────────────────────────────────────────────

# Patterns to identify supported platforms
INSTAGRAM_PATTERNS = [
    r"(?:https?://)?(?:www\.)?instagram\.com/(?:reel|reels|p)/[\w-]+",
    r"(?:https?://)?(?:www\.)?instagram\.com/[\w.]+/reel/[\w-]+",
]

YOUTUBE_PATTERNS = [
    r"(?:https?://)?(?:www\.)?youtube\.com/shorts/[\w-]+",
    r"(?:https?://)?(?:www\.)?youtube\.com/watch\?v=[\w-]+",
    r"(?:https?://)?youtu\.be/[\w-]+",
    r"(?:https?://)?(?:www\.)?youtube\.com/v/[\w-]+",
    r"(?:https?://)?(?:m\.)?youtube\.com/watch\?v=[\w-]+",
]


def detect_platform(url: str) -> str:
    """
    Detect which platform a URL belongs to.

    Args:
        url: The URL to analyze.

    Returns:
        "instagram" or "youtube"

    Raises:
        UnsupportedPlatformError: If the URL doesn't match any supported platform.
    """
    url = url.strip()

    for pattern in INSTAGRAM_PATTERNS:
        if re.match(pattern, url, re.IGNORECASE):
            return "instagram"

    for pattern in YOUTUBE_PATTERNS:
        if re.match(pattern, url, re.IGNORECASE):
            return "youtube"

    raise UnsupportedPlatformError(
        f"URL is not from a supported platform (Instagram or YouTube): {url}"
    )


# ─── Audio Extraction ───────────────────────────────────────────────────────

def _get_temp_dir() -> str:
    """
    Get or create a temporary directory for VaultMCP audio files.
    Uses the system temp directory with a vaultmcp subfolder.
    """
    temp_dir = os.path.join(tempfile.gettempdir(), "vaultmcp_audio")
    os.makedirs(temp_dir, exist_ok=True)
    return temp_dir


def extract_audio(url: str) -> ExtractionResult:
    """
    Extract audio from an Instagram Reel or YouTube Short/Video URL.

    Downloads ONLY the audio track as a .mp3 file to a temp directory.
    No video data is downloaded — keeps it fast and lightweight.

    Args:
        url: Instagram reel or YouTube short/video URL.

    Returns:
        ExtractionResult with the path to the .mp3 file and metadata.

    Raises:
        UnsupportedPlatformError: If the URL is not from Instagram or YouTube.
        ExtractionError: If extraction fails (private video, network error, etc.)
    """
    url = url.strip()

    # Validate platform
    platform = detect_platform(url)

    # Generate a unique filename to avoid collisions
    file_id = uuid.uuid4().hex[:12]
    temp_dir = _get_temp_dir()
    output_template = os.path.join(temp_dir, f"vaultmcp_{file_id}")

    # Detect if ffmpeg is available
    ffmpeg_available = shutil.which("ffmpeg") is not None
    preferred_ext = "mp3" if ffmpeg_available else "m4a"
    postprocessors = []

    if ffmpeg_available:
        postprocessors.append({
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "128",
        })

    # Custom logger to print everything yt-dlp returns to server logs
    class YDLogger:
        def debug(self, msg):
            print(f"[yt-dlp debug] {msg}", flush=True)
        def warning(self, msg):
            print(f"[yt-dlp warning] {msg}", flush=True)
        def error(self, msg):
            print(f"[yt-dlp error] {msg}", flush=True)

    print(f"[Audio Extractor] URL: {url}", flush=True)
    print(f"[Audio Extractor] FFmpeg available: {ffmpeg_available}", flush=True)
    print(f"[Audio Extractor] Temp output template: {output_template}", flush=True)

    # yt-dlp options: audio only, convert to mp3 if ffmpeg is present, otherwise native formats
    ydl_opts = {
        # Extract audio only — no video download
        "format": "bestaudio[ext=m4a]/bestaudio/best" if not ffmpeg_available else "bestaudio/best",
        "outtmpl": f"{output_template}.%(ext)s",
        "postprocessors": postprocessors,

        # Verbose terminal output for HF Space logs
        "quiet": False,
        "no_warnings": False,
        "logger": YDLogger(),

        # Network resilience
        "retries": 3,
        "socket_timeout": 30,

        # Don't download playlists — single video only
        "noplaylist": True,

        # Restrict to safe filenames
        "restrictfilenames": True,
    }

    # Platform-specific tweaks
    if platform == "instagram":
        # Instagram sometimes needs cookies or specific headers
        # yt-dlp handles most Instagram reels natively
        ydl_opts["http_headers"] = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
        }

    # Run extraction
    title = None
    duration = None

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info first to validate the URL and get metadata
            info = ydl.extract_info(url, download=True)

            if info is None:
                raise ExtractionError(
                    f"yt-dlp returned no info for URL: {url}. "
                    "The content may be private, deleted, or region-locked."
                )

            title = info.get("title")
            duration = info.get("duration")

    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e).lower()
        print(f"[Audio Extractor] DownloadError occurred: {error_msg}", flush=True)

        if "private" in error_msg or "login" in error_msg or "sign in" in error_msg:
            raise ExtractionError(
                "This reel is from a private account"
            ) from e

        if "not found" in error_msg or "404" in error_msg or "deleted" in error_msg or "removed" in error_msg:
            raise ExtractionError(
                "This reel is no longer available"
            ) from e

        if "age" in error_msg or "restricted" in error_msg or "confirm your age" in error_msg:
            raise ExtractionError(
                "This reel is age-restricted and cannot be accessed"
            ) from e

        raise ExtractionError(
            "Could not extract audio. Try a different link"
        ) from e

    except Exception as e:
        print(f"[Audio Extractor] Unexpected Exception occurred: {e}", flush=True)
        raise ExtractionError(
            "Could not extract audio. Try a different link"
        ) from e

    # Find the output audio file
    expected_path = f"{output_template}.{preferred_ext}"
    print(f"[Audio Extractor] Checking expected path: {expected_path}", flush=True)

    if not os.path.exists(expected_path):
        print(f"[Audio Extractor] Expected file not found. Scanning directory: {temp_dir}", flush=True)
        # yt-dlp sometimes uses a slightly different name — scan the temp dir
        for filename in os.listdir(temp_dir):
            print(f"[Audio Extractor] Found temp file: {filename}", flush=True)
            if filename.startswith(f"vaultmcp_{file_id}") and filename.endswith((".mp3", ".m4a", ".webm", ".opus", ".aac", ".ogg", ".wav", ".3gp")):
                expected_path = os.path.join(temp_dir, filename)
                print(f"[Audio Extractor] Matching file resolved: {expected_path}", flush=True)
                break
        else:
            raise ExtractionError(
                f"Audio extraction completed but file not found. "
                f"FFmpeg may not be installed or the download failed."
            )
    else:
        print(f"[Audio Extractor] Expected file exists: {expected_path}", flush=True)

    return ExtractionResult(
        audio_path=expected_path,
        source_url=url,
        platform=platform,
        title=title,
        duration=duration,
    )


# ─── Cleanup Utility ────────────────────────────────────────────────────────

def cleanup_audio(audio_path: str) -> bool:
    """
    Delete a temporary audio file after processing is complete.

    Args:
        audio_path: Path to the .mp3 file to delete.

    Returns:
        True if the file was deleted, False if it didn't exist.
    """
    try:
        if os.path.exists(audio_path):
            os.remove(audio_path)
            return True
        return False
    except OSError:
        return False


def cleanup_all() -> int:
    """
    Delete ALL temporary audio files in the VaultMCP temp directory.
    Useful for periodic cleanup or on server shutdown.

    Returns:
        Number of files deleted.
    """
    temp_dir = _get_temp_dir()
    count = 0

    try:
        for filename in os.listdir(temp_dir):
            filepath = os.path.join(temp_dir, filename)
            if os.path.isfile(filepath):
                os.remove(filepath)
                count += 1
    except OSError:
        pass

    return count


# ─── CLI Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python audio_extractor.py <URL>")
        print("Example: python audio_extractor.py https://youtube.com/shorts/abc123")
        sys.exit(1)

    test_url = sys.argv[1]
    print(f"[VaultMCP] Extracting audio from: {test_url}")

    try:
        result = extract_audio(test_url)
        print(f"[VaultMCP] ✓ Success!")
        print(f"  Platform : {result.platform}")
        print(f"  Title    : {result.title}")
        print(f"  Duration : {result.duration}s" if result.duration else "  Duration : unknown")
        print(f"  Audio    : {result.audio_path}")
        print(f"  Size     : {os.path.getsize(result.audio_path) / 1024:.1f} KB")

    except UnsupportedPlatformError as e:
        print(f"[VaultMCP] ✗ Unsupported platform: {e}")
        sys.exit(1)

    except ExtractionError as e:
        print(f"[VaultMCP] ✗ Extraction failed: {e}")
        sys.exit(1)
