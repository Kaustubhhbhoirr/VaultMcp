/**
 * api.js — VaultMCP API Client
 *
 * All calls to the FastAPI backend go through this module.
 * Base URL loaded from VITE_API_URL env var.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://kaustubh5934-vaultmcp-backend.hf.space';

/**
 * POST /process — Send content through the full pipeline.
 * @param {string} content - URL or plain text
 * @param {string} hfToken - User's Hugging Face token
 * @returns {Promise<object>} Pipeline result
 */
export async function processContent(content, hfToken) {
  const res = await fetch(`${API_BASE}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HF-Token': hfToken,
    },
    body: JSON.stringify({
      content,
      hf_token: hfToken,
      content_type: 'auto',
    }),
  });

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("HF Token needs Inference Provider permissions. Go to huggingface.co/settings/tokens → update token → enable Inference Providers");
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * POST /drive/save — Save an MD entry to Google Drive.
 * @param {string} mdEntry - Markdown string to save
 * @param {string} accessToken - Google Drive OAuth access token
 * @param {string|null} refreshToken - Google Drive OAuth refresh token
 * @returns {Promise<object>}
 */
export async function saveToDrive(mdEntry, accessToken, refreshToken = null, overwrite = false) {
  const res = await fetch(`${API_BASE}/drive/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      md_entry: mdEntry,
      access_token: accessToken,
      refresh_token: refreshToken,
      overwrite: overwrite,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Drive save error: ${res.status}`);
  }

  return res.json();
}

/**
 * GET /drive/vault — Fetch the full vault.md from Google Drive.
 * @param {string} accessToken - Google Drive OAuth access token
 * @param {string|null} refreshToken - Google Drive OAuth refresh token
 * @returns {Promise<object>}
 */
export async function getVaultFromDrive(accessToken, refreshToken = null) {
  const params = new URLSearchParams({ access_token: accessToken });
  if (refreshToken) params.append('refresh_token', refreshToken);

  const res = await fetch(`${API_BASE}/drive/vault?${params.toString()}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Drive vault error: ${res.status}`);
  }

  return res.json();
}

/**
 * GET /auth/url — Get the Google OAuth consent URL.
 * @returns {Promise<string>} OAuth consent URL
 */
export async function getGoogleAuthUrl() {
  const res = await fetch(`${API_BASE}/auth/url`, { method: 'GET' });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Auth URL error: ${res.status}`);
  }

  const data = await res.json();
  return data.auth_url;
}

/**
 * POST /auth/google — Exchange OAuth auth code for tokens.
 * @param {string} authCode - Authorization code from Google redirect
 * @returns {Promise<object>} { access_token, refresh_token, expires_in }
 */
export async function exchangeGoogleAuthCode(authCode) {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_code: authCode }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Auth exchange error: ${res.status}`);
  }

  const data = await res.json();
  return data.tokens;
}

/**
 * GET /health — Check backend health.
 * @returns {Promise<object>}
 */
export async function healthCheck() {
  const res = await fetch(`${API_BASE}/health`, { method: 'GET' });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/**
 * POST /process/file — Upload and process a file through the pipeline.
 * @param {File} file - The file to upload
 * @param {string} hfToken - User's Hugging Face token
 * @returns {Promise<object>} Pipeline result
 */
export async function processFile(file, hfToken, driveAccessToken = null, driveRefreshToken = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('hf_token', hfToken);
  
  if (driveAccessToken) {
    formData.append('drive_access_token', driveAccessToken);
  }
  if (driveRefreshToken) {
    formData.append('drive_refresh_token', driveRefreshToken);
  }

  const res = await fetch(`${API_BASE}/process/file`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    if (res.status === 403) {
      throw new Error("HF Token needs Inference Provider permissions. Go to huggingface.co/settings/tokens → update token → enable Inference Providers");
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * POST /config/save — Save user config to Google Drive.
 * @param {string} hfToken - User's Hugging Face token
 * @param {string} displayName - User's display name
 * @param {string} accessToken - Google Drive OAuth access token
 * @param {string|null} refreshToken - Google Drive OAuth refresh token
 * @returns {Promise<object>}
 */
export async function saveUserConfig(hfToken, displayName, accessToken, refreshToken = null) {
  const res = await fetch(`${API_BASE}/config/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hf_token: hfToken,
      display_name: displayName,
      access_token: accessToken,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Config save error: ${res.status}`);
  }

  return res.json();
}

/**
 * GET /config/load — Fetch user config from Google Drive.
 * @param {string} accessToken - Google Drive OAuth access token
 * @param {string|null} refreshToken - Google Drive OAuth refresh token
 * @returns {Promise<object>}
 */
export async function getUserConfig(accessToken, refreshToken = null) {
  const params = new URLSearchParams({ access_token: accessToken });
  if (refreshToken) params.append('refresh_token', refreshToken);

  const res = await fetch(`${API_BASE}/config/load?${params.toString()}`, {
    method: 'GET',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Config load error: ${res.status}`);
  }

  return res.json();
}

/**
 * GET /drive/fetch — Fetch raw file content from Google Drive by ID.
 */
export async function fetchDriveFile(fileId, accessToken, refreshToken = null) {
  const url = new URL(`${API_BASE}/drive/fetch`);
  url.searchParams.append('file_id', fileId);
  url.searchParams.append('access_token', accessToken);
  if (refreshToken) {
    url.searchParams.append('refresh_token', refreshToken);
  }

  const res = await fetch(url.toString(), {
    method: 'GET'
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Drive fetch error: ${res.status}`);
  }

  return res.text();
}

/**
 * POST /drive/clear — Delete all vault files (except config.json) from Google Drive.
 */
export async function clearVault(accessToken, refreshToken = null) {
  const payload = {
    access_token: accessToken,
    refresh_token: refreshToken || '',
  };

  const res = await fetch(`${API_BASE}/drive/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Clear vault error: ${res.status}`);
  }

  return res.json();
}
