"""
drive_handler.py — Google Drive OAuth2 & File Management

Handles all interactions with the user's Google Drive:
  - OAuth2 authorization code exchange for tokens
  - Find or create the "VaultMCP" folder in Drive
  - Save (append) markdown entries to vault.md inside that folder
  - Fetch the full vault.md content
  - List all files in the VaultMCP folder

Zero server-side storage: OAuth tokens are passed per-request from the frontend.
Google client credentials (client_id, client_secret) loaded from .env.

Libraries: google-auth, google-api-python-client only.
"""

import os
import io
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request as GoogleAuthRequest
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload


# ─── Load Environment ────────────────────────────────────────────────────────
load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/callback")

# Scopes: read/write files in Google Drive
SCOPES = ["https://www.googleapis.com/auth/drive.file"]

# Constants
VAULTMCP_FOLDER_NAME = "VaultMCP"
VAULT_FILENAME = "vault.md"
VAULT_MIME_TYPE = "text/markdown"

VAULT_HEADER = """# VaultMCP Vault

> Save what you scroll. Use what you saved.

---

"""


# ─── Custom Exceptions ──────────────────────────────────────────────────────

class DriveError(Exception):
    """Raised when a Google Drive operation fails."""
    pass


class DriveAuthError(DriveError):
    """Raised when OAuth authentication fails or token is invalid."""
    pass


# ─── Result Containers ──────────────────────────────────────────────────────

@dataclass
class AuthTokens:
    """OAuth2 tokens returned after a successful authorization."""
    access_token: str
    refresh_token: Optional[str]
    expires_in: Optional[int]
    token_uri: str
    scopes: list


@dataclass
class SaveResult:
    """Result of saving an entry to Drive."""
    file_id: str            # Google Drive file ID of vault.md
    folder_id: str          # Google Drive folder ID of VaultMCP folder
    file_name: str          # Always "vault.md"
    action: str             # "created" or "appended"


# ─── OAuth2 Flow ─────────────────────────────────────────────────────────────

import urllib.parse

def get_auth_url() -> str:
    """
    Generate the Google OAuth2 consent URL for the user to visit.

    Returns:
        Authorization URL string.

    Raises:
        DriveAuthError: If Google client credentials are not configured.
    """
    _validate_client_credentials()

    # Manually construct URL to avoid stateful PKCE generation by google-auth-oauthlib,
    # which breaks our stateless token exchange in auth_google()
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    
    return "https://accounts.google.com/o/oauth2/auth?" + urllib.parse.urlencode(params)


def auth_google(auth_code: str) -> AuthTokens:
    """
    Exchange a Google OAuth2 authorization code for access + refresh tokens.

    The frontend redirects the user to Google's consent page, Google redirects
    back with an auth_code, and this function exchanges it for tokens.

    Args:
        auth_code: The authorization code from Google's OAuth redirect.

    Returns:
        AuthTokens with access_token, refresh_token, etc.

    Raises:
        DriveAuthError: If the exchange fails (invalid code, expired, etc.)
    """
    _validate_client_credentials()

    flow = _build_oauth_flow()

    try:
        flow.fetch_token(code=auth_code)
    except Exception as e:
        raise DriveAuthError(
            f"Failed to exchange auth code for tokens: {e}. "
            "The code may be expired or invalid. Please re-authorize."
        ) from e

    creds = flow.credentials

    if not creds or not creds.token:
        raise DriveAuthError("OAuth flow completed but no access token was returned.")

    return AuthTokens(
        access_token=creds.token,
        refresh_token=creds.refresh_token,
        expires_in=creds.expiry.timestamp() if creds.expiry else None,
        token_uri=creds.token_uri,
        scopes=list(creds.scopes) if creds.scopes else SCOPES,
    )


# ─── Drive Operations ───────────────────────────────────────────────────────

def save_to_drive(md_entry: str, access_token: str, refresh_token: str = None) -> SaveResult:
    """
    Append a new Markdown entry to vault.md in the user's Google Drive.

    If the VaultMCP folder doesn't exist, it is created.
    If vault.md doesn't exist, it is created with the standard header.
    If vault.md exists, the new entry is appended at the end.

    Args:
        md_entry:      Markdown string to append (from md_generator).
        access_token:  User's Google OAuth access token.
        refresh_token: User's refresh token (optional, for auto-refresh).

    Returns:
        SaveResult with file_id, folder_id, and action taken.

    Raises:
        DriveAuthError: If the token is invalid or expired.
        DriveError:     If any Drive operation fails.
    """
    service = _build_drive_service(access_token, refresh_token)

    # Step 1: Find or create the VaultMCP folder
    folder_id = _find_or_create_folder(service)

    # Step 2: Find vault.md in the folder
    file_id = _find_file_in_folder(service, VAULT_FILENAME, folder_id)

    if file_id:
        # vault.md exists — download current content, append, re-upload
        existing_content = _download_file_content(service, file_id)

        # Ensure clean separation
        if not existing_content.endswith("\n"):
            existing_content += "\n"

        updated_content = existing_content + "\n" + md_entry

        _update_file_content(service, file_id, updated_content)

        return SaveResult(
            file_id=file_id,
            folder_id=folder_id,
            file_name=VAULT_FILENAME,
            action="appended",
        )

    else:
        # vault.md doesn't exist — create it with header + entry
        full_content = VAULT_HEADER + md_entry

        file_id = _create_file(
            service=service,
            name=VAULT_FILENAME,
            content=full_content,
            folder_id=folder_id,
            mime_type=VAULT_MIME_TYPE,
        )

        return SaveResult(
            file_id=file_id,
            folder_id=folder_id,
            file_name=VAULT_FILENAME,
            action="created",
        )


def get_vault(access_token: str, refresh_token: str = None) -> Optional[str]:
    """
    Fetch and return the full vault.md content from the user's Google Drive.

    Args:
        access_token:  User's Google OAuth access token.
        refresh_token: User's refresh token (optional).

    Returns:
        Full vault.md content as a string, or None if vault.md doesn't exist.

    Raises:
        DriveAuthError: If the token is invalid or expired.
        DriveError:     If any Drive operation fails.
    """
    service = _build_drive_service(access_token, refresh_token)

    # Find the VaultMCP folder
    folder_id = _find_folder(service)
    if not folder_id:
        return None

    # Find vault.md in the folder
    file_id = _find_file_in_folder(service, VAULT_FILENAME, folder_id)
    if not file_id:
        return None

    return _download_file_content(service, file_id)


# ─── Internal: Build Service & Credentials ──────────────────────────────────

def _validate_client_credentials():
    """Ensure Google client credentials are configured in .env."""
    if not GOOGLE_CLIENT_ID or GOOGLE_CLIENT_ID == "your_client_id.apps.googleusercontent.com":
        raise DriveAuthError(
            "GOOGLE_CLIENT_ID is not configured. "
            "Set it in your .env file. Get credentials at: "
            "https://console.cloud.google.com/apis/credentials"
        )
    if not GOOGLE_CLIENT_SECRET or GOOGLE_CLIENT_SECRET == "your_client_secret":
        raise DriveAuthError(
            "GOOGLE_CLIENT_SECRET is not configured. Set it in your .env file."
        )


def _build_oauth_flow() -> Flow:
    """Build a Google OAuth2 Flow from .env credentials."""
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }

    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI,
    )

    return flow


def _build_drive_service(access_token: str, refresh_token: str = None):
    """
    Build a Google Drive API service client from a user's OAuth token.

    Args:
        access_token:  User's access token.
        refresh_token: User's refresh token (enables auto-refresh).

    Returns:
        Google Drive API service resource.

    Raises:
        DriveAuthError: If the token is invalid.
    """
    if not access_token or not access_token.strip():
        raise DriveAuthError("Access token is empty. Please re-authorize with Google.")

    creds = Credentials(
        token=access_token.strip(),
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    # Attempt to refresh if the token is expired and we have a refresh token
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(GoogleAuthRequest())
        except Exception as e:
            raise DriveAuthError(
                f"Failed to refresh access token: {e}. Please re-authorize."
            ) from e

    try:
        service = build("drive", "v3", credentials=creds)
    except Exception as e:
        raise DriveAuthError(
            f"Failed to build Google Drive service: {e}. Token may be invalid."
        ) from e

    return service


# ─── Internal: Folder Operations ────────────────────────────────────────────

def _find_folder(service) -> Optional[str]:
    """
    Find the VaultMCP folder in the user's Google Drive root.

    Returns:
        Folder ID string or None if not found.
    """
    try:
        query = (
            f"name = '{VAULTMCP_FOLDER_NAME}' "
            f"and mimeType = 'application/vnd.google-apps.folder' "
            f"and trashed = false"
        )

        response = service.files().list(
            q=query,
            spaces="drive",
            fields="files(id, name)",
            pageSize=1,
        ).execute()

        files = response.get("files", [])
        return files[0]["id"] if files else None

    except Exception as e:
        raise DriveError(f"Failed to search for VaultMCP folder: {e}") from e


def _find_or_create_folder(service) -> str:
    """
    Find or create the VaultMCP folder in the user's Google Drive root.

    Returns:
        Folder ID string.
    """
    folder_id = _find_folder(service)

    if folder_id:
        return folder_id

    # Create the folder
    try:
        folder_metadata = {
            "name": VAULTMCP_FOLDER_NAME,
            "mimeType": "application/vnd.google-apps.folder",
        }

        folder = service.files().create(
            body=folder_metadata,
            fields="id",
        ).execute()

        return folder["id"]

    except Exception as e:
        raise DriveError(f"Failed to create VaultMCP folder: {e}") from e


# ─── Internal: File Operations ──────────────────────────────────────────────

def _find_file_in_folder(service, filename: str, folder_id: str) -> Optional[str]:
    """
    Find a file by name inside a specific folder.

    Returns:
        File ID string or None if not found.
    """
    try:
        query = (
            f"name = '{filename}' "
            f"and '{folder_id}' in parents "
            f"and trashed = false"
        )

        response = service.files().list(
            q=query,
            spaces="drive",
            fields="files(id, name)",
            pageSize=1,
        ).execute()

        files = response.get("files", [])
        return files[0]["id"] if files else None

    except Exception as e:
        raise DriveError(f"Failed to search for {filename}: {e}") from e


def _download_file_content(service, file_id: str) -> str:
    """
    Download the text content of a file from Google Drive.

    Returns:
        File content as a UTF-8 string.
    """
    try:
        request = service.files().get_media(fileId=file_id)
        buffer = io.BytesIO()
        downloader = MediaIoBaseDownload(buffer, request)

        done = False
        while not done:
            _, done = downloader.next_chunk()

        buffer.seek(0)
        return buffer.read().decode("utf-8")

    except Exception as e:
        raise DriveError(f"Failed to download file {file_id}: {e}") from e


def _update_file_content(service, file_id: str, content: str):
    """
    Overwrite a file's content on Google Drive.

    Args:
        service:  Drive API service.
        file_id:  ID of the file to update.
        content:  New full content string.
    """
    try:
        media = MediaIoBaseUpload(
            io.BytesIO(content.encode("utf-8")),
            mimetype=VAULT_MIME_TYPE,
            resumable=True,
        )

        service.files().update(
            fileId=file_id,
            media_body=media,
        ).execute()

    except Exception as e:
        raise DriveError(f"Failed to update file {file_id}: {e}") from e


def _create_file(
    service,
    name: str,
    content: str,
    folder_id: str,
    mime_type: str = VAULT_MIME_TYPE,
) -> str:
    """
    Create a new file in Google Drive inside a specific folder.

    Returns:
        The new file's ID.
    """
    try:
        file_metadata = {
            "name": name,
            "parents": [folder_id],
            "mimeType": mime_type,
        }

        media = MediaIoBaseUpload(
            io.BytesIO(content.encode("utf-8")),
            mimetype=mime_type,
            resumable=True,
        )

        created_file = service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id",
        ).execute()

        return created_file["id"]

    except Exception as e:
        raise DriveError(f"Failed to create file {name}: {e}") from e


# ─── CLI Test ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("[VaultMCP] drive_handler.py — Configuration Check\n")
    print(f"  Client ID     : {'configured' if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID != 'your_client_id.apps.googleusercontent.com' else 'NOT SET'}")
    print(f"  Client Secret : {'configured' if GOOGLE_CLIENT_SECRET and GOOGLE_CLIENT_SECRET != 'your_client_secret' else 'NOT SET'}")
    print(f"  Redirect URI  : {GOOGLE_REDIRECT_URI}")
    print(f"  Folder Name   : {VAULTMCP_FOLDER_NAME}")
    print(f"  Vault File    : {VAULT_FILENAME}")
    print(f"  Scopes        : {SCOPES}")
    print()

    try:
        auth_url = get_auth_url()
        print(f"  ✓ OAuth URL generated successfully.")
        print(f"  Auth URL: {auth_url[:80]}...")
    except DriveAuthError as e:
        print(f"  ✗ Cannot generate OAuth URL: {e}")

    print()
    print("  To test full flow:")
    print("  1. Visit the auth URL above in a browser")
    print("  2. Authorize and copy the auth code from the redirect")
    print("  3. Call auth_google(code) to get tokens")
    print("  4. Call save_to_drive(md_entry, access_token) to save")
