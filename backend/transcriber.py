"""
transcriber.py — Audio-to-Text Transcription via Whisper (Hugging Face Inference API)

Takes a .mp3 file path and sends the audio to OpenAI's Whisper model hosted on
the Hugging Face Inference API. Returns the transcript as plain text.

The user's HF token is passed as a parameter (never stored server-side).

Error handling:
  - Invalid or expired HF token → raises TranscriptionError
  - HF API rate limit hit → retries with exponential backoff
  - Audio file not found or unreadable → raises TranscriptionError
  - Model loading (cold start) → retries automatically
  - Empty transcript → raises TranscriptionError
"""

import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx


# ─── Configuration ───────────────────────────────────────────────────────────

# Whisper model endpoint on HF Inference API
WHISPER_MODEL = "openai/whisper-large-v3-turbo"
HF_INFERENCE_URL = f"https://router.huggingface.co/hf-inference/models/{WHISPER_MODEL}"

# Retry settings for HF API (free tier can be slow / rate-limited)
MAX_RETRIES = 5
INITIAL_BACKOFF_SECONDS = 2.0
MAX_BACKOFF_SECONDS = 60.0

# Max audio file size (25 MB — HF Inference API limit)
MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024

# HTTP timeout for the transcription request (Whisper can take a while)
REQUEST_TIMEOUT_SECONDS = 120.0


# ─── Custom Exceptions ──────────────────────────────────────────────────────

class TranscriptionError(Exception):
    """Raised when audio transcription fails."""
    pass


class InvalidTokenError(TranscriptionError):
    """Raised when the HF API token is invalid or expired."""
    pass


class RateLimitError(TranscriptionError):
    """Raised when HF API rate limit is exceeded and all retries are exhausted."""
    pass


def is_hindi(text: str) -> bool:
    """Check if text contains Devnagari characters (indicative of Hindi)."""
    return any(0x0900 <= ord(char) <= 0x097F for char in text)


# ─── Result Container ───────────────────────────────────────────────────────

@dataclass
class TranscriptionResult:
    """Holds the result of a successful transcription."""
    text: str                           # The transcribed text (original, e.g. Hindi)
    audio_path: str                     # Path to the audio file that was transcribed
    model: str                          # Model used for transcription
    audio_size_kb: float                # Size of the audio file in KB
    retries_used: int                   # Number of retries needed (0 = first attempt worked)
    translation: Optional[str] = None   # English translation if original was Hindi


# ─── Core Transcription ─────────────────────────────────────────────────────

def transcribe_audio(audio_path: str, hf_token: str) -> TranscriptionResult:
    """
    Transcribe an audio file using Whisper via the Hugging Face Inference API.
    Auto-detects language and performs translation if Hindi is detected.

    Args:
        audio_path: Absolute path to the .mp3 audio file.
        hf_token:   User's Hugging Face API token (starts with "hf_").

    Returns:
        TranscriptionResult with the transcript text and metadata.

    Raises:
        TranscriptionError:  If the audio file is missing, too large, or transcription fails.
        InvalidTokenError:   If the HF token is invalid or expired.
        RateLimitError:      If HF rate limit is hit and all retries are exhausted.
    """
    import base64

    # ── Validate inputs ──────────────────────────────────────────────────
    if not hf_token or not hf_token.strip():
        raise InvalidTokenError("Hugging Face token is empty. Please provide a valid token.")

    if not os.path.exists(audio_path):
        raise TranscriptionError(f"Audio file not found: {audio_path}")

    if not os.path.isfile(audio_path):
        raise TranscriptionError(f"Path is not a file: {audio_path}")

    file_size = os.path.getsize(audio_path)

    if file_size == 0:
        raise TranscriptionError(f"Audio file is empty (0 bytes): {audio_path}")

    if file_size > MAX_FILE_SIZE_BYTES:
        size_mb = file_size / (1024 * 1024)
        raise TranscriptionError(
            f"Audio file too large ({size_mb:.1f} MB). "
            f"HF Inference API limit is {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB."
        )

    # ── Read audio binary and base64-encode ──────────────────────────────
    try:
        with open(audio_path, "rb") as f:
            audio_bytes = f.read()
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    except IOError as e:
        raise TranscriptionError(f"Cannot read audio file {audio_path}: {e}") from e

    # ── Send to HF Inference API with retry logic ────────────────────────
    headers = {
        "Authorization": f"Bearer {hf_token.strip()}",
        "Content-Type": "application/json",
    }

    # First task: auto-detect and transcribe
    transcribe_payload = {
        "inputs": audio_b64,
        "parameters": {
            "generate_kwargs": {
                "task": "transcribe",
                "language": None  # Auto detect language
            }
        }
    }

    backoff = INITIAL_BACKOFF_SECONDS
    last_error: Optional[Exception] = None
    transcription_text = None
    retries_used = 0

    for attempt in range(MAX_RETRIES):
        try:
            with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                response = client.post(
                    HF_INFERENCE_URL,
                    headers=headers,
                    json=transcribe_payload,
                )

            # ── Handle HTTP status codes ─────────────────────────────
            if response.status_code == 200:
                result = _parse_response(
                    response=response,
                    audio_path=audio_path,
                    file_size=file_size,
                    retries_used=attempt,
                )
                transcription_text = result.text
                retries_used = attempt
                break

            if response.status_code == 401:
                raise InvalidTokenError(
                    "Hugging Face token is invalid or expired. "
                    "Get a new token at: https://huggingface.co/settings/tokens"
                )

            if response.status_code == 403:
                raise InvalidTokenError(
                    "Hugging Face token does not have permission to access this model. "
                    "Ensure your token has 'read' access."
                )

            if response.status_code == 429:
                last_error = RateLimitError(
                    f"HF API rate limit hit (attempt {attempt + 1}/{MAX_RETRIES})."
                )

            elif response.status_code == 503:
                body = _safe_json(response)
                estimated_time = body.get("estimated_time", backoff) if body else backoff
                backoff = min(float(estimated_time), MAX_BACKOFF_SECONDS)
                last_error = TranscriptionError(
                    f"Model is loading (attempt {attempt + 1}/{MAX_RETRIES}). "
                    f"Waiting {backoff:.0f}s..."
                )

            else:
                body = _safe_json(response)
                error_detail = body.get("error", response.text[:200]) if body else response.text[:200]
                raise TranscriptionError(
                    f"HF API error (HTTP {response.status_code}): {error_detail}"
                )

        except (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout) as e:
            last_error = TranscriptionError(
                f"Network error on attempt {attempt + 1}/{MAX_RETRIES}: {e}"
            )

        except (InvalidTokenError, TranscriptionError):
            raise

        if attempt < MAX_RETRIES - 1:
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)

    if transcription_text is None:
        raise RateLimitError(
            f"Transcription failed after {MAX_RETRIES} attempts. Last error: {last_error}"
        )

    # ── Step 4: Optional translation if Hindi is detected ───────────────
    translation_text = None
    if is_hindi(transcription_text):
        print(f"[Transcriber] Hindi detected in transcript. Initiating English translation call...", flush=True)
        translate_payload = {
            "inputs": audio_b64,
            "parameters": {
                "generate_kwargs": {
                    "task": "translate"
                }
            }
        }
        
        backoff = INITIAL_BACKOFF_SECONDS
        for attempt in range(MAX_RETRIES):
            try:
                with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
                    response = client.post(
                        HF_INFERENCE_URL,
                        headers=headers,
                        json=translate_payload,
                    )
                if response.status_code == 200:
                    trans_result = _parse_response(
                        response=response,
                        audio_path=audio_path,
                        file_size=file_size,
                        retries_used=attempt,
                    )
                    translation_text = trans_result.text
                    print(f"[Transcriber] Hindi translation successful.", flush=True)
                    break
                elif response.status_code == 429 or response.status_code == 503:
                    # Let it retry for rate limit/cold start
                    time.sleep(backoff)
                    backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
                else:
                    break
            except Exception as e:
                print(f"[Transcriber] Hindi translation attempt {attempt+1} failed: {e}", flush=True)
                if attempt < MAX_RETRIES - 1:
                    time.sleep(backoff)
                    backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)

    return TranscriptionResult(
        text=transcription_text,
        audio_path=audio_path,
        model=WHISPER_MODEL,
        audio_size_kb=round(file_size / 1024, 1),
        retries_used=retries_used,
        translation=translation_text,
    )


# ─── Response Parsing ────────────────────────────────────────────────────────

def _parse_response(
    response: httpx.Response,
    audio_path: str,
    file_size: int,
    retries_used: int,
) -> TranscriptionResult:
    """Parse the HF API response and extract the transcript text."""

    body = _safe_json(response)

    if body is None:
        # Response is plain text
        text = response.text.strip()
    elif isinstance(body, dict):
        # Standard Whisper response: {"text": "..."}
        text = body.get("text", "")
    elif isinstance(body, list) and len(body) > 0:
        # Some models return a list of chunks
        text = " ".join(
            chunk.get("text", "") if isinstance(chunk, dict) else str(chunk)
            for chunk in body
        )
    else:
        text = str(body)

    text = text.strip()

    if not text:
        raise TranscriptionError(
            "Transcription returned empty text. The audio may be silent, "
            "too short, or in an unsupported language."
        )

    return TranscriptionResult(
        text=text,
        audio_path=audio_path,
        model=WHISPER_MODEL,
        audio_size_kb=round(file_size / 1024, 1),
        retries_used=retries_used,
    )


def _safe_json(response: httpx.Response):
    """Attempt to parse response as JSON, return None on failure."""
    try:
        return response.json()
    except Exception:
        return None


# ─── CLI Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python transcriber.py <audio_file_path> <hf_token>")
        print("Example: python transcriber.py /tmp/vaultmcp_audio/file.mp3 hf_abc123...")
        sys.exit(1)

    test_path = sys.argv[1]
    test_token = sys.argv[2]

    print(f"[VaultMCP] Transcribing: {test_path}")
    print(f"[VaultMCP] Using model: {WHISPER_MODEL}")

    try:
        result = transcribe_audio(test_path, test_token)
        print(f"[VaultMCP] ✓ Transcription complete!")
        print(f"  Model    : {result.model}")
        print(f"  Size     : {result.audio_size_kb} KB")
        print(f"  Retries  : {result.retries_used}")
        print(f"  Text     :")
        print(f"  ---")
        print(f"  {result.text}")
        print(f"  ---")

    except InvalidTokenError as e:
        print(f"[VaultMCP] ✗ Token error: {e}")
        sys.exit(1)

    except TranscriptionError as e:
        print(f"[VaultMCP] ✗ Transcription failed: {e}")
        sys.exit(1)
