# VaultMCP 🗄️
> Save what you scroll. Use what you saved.

VaultMCP is an open source PWA that captures tools, prompts, links, and ideas from anywhere — Instagram, YouTube, websites, PDFs, plain text — and turns them into structured, searchable Markdown files saved to your Google Drive.

No more saving reels and forgetting them. No more losing the prompt you saw at 2 am.

![VaultMCP](https://img.shields.io/badge/version-1.0-orange) ![License](https://img.shields.io/badge/license-MIT-black) ![PWA](https://img.shields.io/badge/PWA-ready-orange) ![Cost](https://img.shields.io/badge/cost-$0-black)

---

## 🎯 The Problem

You're doom-scrolling Instagram. A creator shows you a powerful AI tool or a killer prompt.

You save the reel. You forget it forever.

VaultMCP fixes this.

---

## ✨ How It Works

### 1. Share or Paste
- Share any link directly to VaultMCP from the Android share sheet
- Paste any URL — YouTube, GitHub, website, article
- Paste any text — prompt, idea, tip you copied
- Upload a PDF or file

### 2. AI Processes It
VaultMCP automatically:
- Extracts metadata from YouTube videos and GitHub repos
- Scrapes websites for title and description
- Sends everything to AI for structured summarisation
- Generates a clean `.md` entry

### 3. Saved to Your Google Drive
Named. Categorized. Done. One structured `vault.md` file.

### 4. Use It When You Build
1. Download your `vault.md`
2. Grab your project README
3. Paste both into Claude / Gemini / GPT
4. Ask: *"Which tools from my vault fit this project?"*
5. Build with it.

---

## 📱 Screens

| Screen | Purpose |
|---|---|
| Onboarding | One-time setup — name, HF token, Google Drive |
| Chat | Main screen — paste anything, AI processes it |
| Vault | Browse all saved entries, filter by category |
| Settings | Manage connections and preferences |

---

## 🛠️ Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | React + Vite (PWA) | Free |
| Styling | Retro Win95 / TailwindCSS | Free |
| Hosting | Vercel | Free |
| AI Structuring | Qwen2.5-7B via HF Router | Free |
| Metadata | GitHub API + httpx scraping | Free |
| Storage | User's own Google Drive | Free |
| Backend | FastAPI (Python) | Free |
| Backend Hosting | Hugging Face Spaces | Free |

**Total cost: $0**

---

## 🚀 Live Demo

- 🌐 App: [vault-mcp-4ssi.vercel.app](https://vault-mcp-4ssi.vercel.app)
- ⚙️ Backend: [kaustubh5934-vaultmcp-backend.hf.space](https://kaustubh5934-vaultmcp-backend.hf.space)

---

## ⚡ Quick Start

### Frontend
```bash
git clone https://github.com/Kaustubhhbhoirr/VaultMcp
cd VaultMcp
npm install
npm run dev
```

### Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Add your keys to .env
uvicorn main:app --reload
```

### Environment Variables
```
HF_TOKEN=your_hugging_face_token
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/process` | Process any URL or text |
| POST | `/drive/save` | Save entry to Google Drive |
| GET | `/drive/vault` | Fetch vault.md from Drive |
| POST | `/auth/google` | Google OAuth flow |
| GET | `/mcp/vault` | MCP — read full vault |
| GET | `/mcp/search` | MCP — search vault by keyword |
| GET | `/health` | Health check |

---

## 📂 Vault Structure

```md
# VaultMCP Vault
> Save what you scroll. Use what you saved.

## [CATEGORY: AI Tools]
### Tool Name
- Summary: What it does and why it's useful
- Official link: https://...
- Source: https://...
- Saved on: 30.MAY.2026
```

---

## 🗺️ Roadmap

- [x] PWA with Android share target
- [x] Chat interface for all input types
- [x] Google Drive OAuth + vault.md sync
- [x] GitHub repo metadata extraction
- [x] YouTube metadata extraction
- [x] MCP server endpoints
- [ ] React Native app (V2)
- [ ] Browser extension (V3)
- [ ] Agent auto-scan vault on project open (V4)

---

## 🔒 Security

Your data never touches our servers permanently.

```
Browser → Backend (process only) → Your Google Drive
```

- HF token stored locally in the browser only
- Google OAuth — your account, your files only
- Zero user data stored on server

---

## 🤝 Contributing

Open source. No monetisation. No ads. Built for developers by developers.

- Check open issues
- Pick something, build it, PR it
- Keep it simple, keep it free

---

## 👤 Author

**Kaustubh Bhoir** — Computer Engineering
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Kaustubh%20Bhoir-0077B5?style=flat-square&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/kaustubh-bhoir-ce/)

---

## 📄 License

MIT — use it, fork it, ship it.

---

<div align="center">
<i>"We don't want your data. We don't want your money. We just want you to actually use what you save."</i>
</div>

---

## MCP Integration (Model Context Protocol)

VaultMCP includes a remote MCP server that exposes your Vault and the powerful `compare_project` tool to AI IDEs (like Cursor, Claude Desktop, and Antigravity).

For IDEs that do not natively support remote SSE URLs, a Python proxy script (`mcp_proxy.py`) is included. 
Add this to your IDE's `mcp_config.json`:

```json
{
    "mcpServers": {
        "VaultMCP": {
            "command": "python",
            "args": [
                "path/to/vaultmcp/mcp_proxy.py"
            ]
        }
    }
}
```
