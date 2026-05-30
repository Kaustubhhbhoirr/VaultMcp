# VaultMCP Error Diagnostics Log

This log outlines the root causes of the processing pipeline fallbacks and connection failures encountered during backend testing and deployment.

---

## 1. Hugging Face Inference Endpoint Deprecation

### Symptom
*   Requests to the backend's `/process` endpoint triggered local DNS resolution failures (`getaddrinfo failed`).
*   Running `nslookup api-inference.huggingface.co` resolved the name but returned **no IP addresses (A/AAAA records)**.

### Root Cause
Hugging Face has deprecated and decommissioned the legacy serverless inference endpoint domain:
`https://api-inference.huggingface.co`

All requests have been migrated to the new router infrastructure:
`https://router.huggingface.co`

*   **Chat/LLM Completions URL:** `https://router.huggingface.co/v1/chat/completions` (OpenAI-compatible)
*   **Specialized Pipelines URL:** `https://router.huggingface.co/hf-inference/models/{MODEL_ID}/pipeline/{TASK}`

---

## 2. Hugging Face Token Permission Error (403 Forbidden)

### Symptom
When the backend called the new router endpoint `https://router.huggingface.co/hf-inference/models/mistralai/Mistral-7B-Instruct-v0.3`, it failed with:
```json
403 Forbidden
{
  "error": "This authentication method does not have sufficient permissions to call Inference Providers on behalf of user Kaustubh5934"
}
```

### Root Cause
*   The model `mistralai/Mistral-7B-Instruct-v0.3` is delegated on the Hugging Face router to **external partner providers** (such as Together AI).
*   Standard or older fine-grained Hugging Face User Access Tokens do not possess the required security scopes to perform queries on behalf of the user to these external providers.
*   **Fix Required:** The user must go to [Hugging Face Access Token Settings](https://huggingface.co/settings/tokens) and generate a new token with explicitly checked permissions for **"Inference Providers" / "Inference on Hub"**.

---

## 3. yt-dlp Datacenter/IP Blockage (Video Unavailable)

### Symptom
Testing the YouTube metadata extraction route on Hugging Face Spaces returned:
```
yt_dlp.utils.DownloadError: ERROR: [youtube] 5MuIMqhT8lI: Video unavailable
```

### Root Cause
*   YouTube aggressively blocks and rate-limits requests originating from cloud datacenter IP ranges (AWS, GCP, Hugging Face Spaces infrastructure).
*   When `yt-dlp` attempts to fetch the webpage, YouTube serves a bot detection page or returns a `429 Too Many Requests` status, causing `yt-dlp` to report that the video is unavailable (even though it is accessible from a home network).
*   **Pipeline Behavior:** The `/process` endpoint gracefully caught this exception and fell back to passing the raw URL to the LLM, preventing the server from crashing and returning the structured fallback entry successfully.
