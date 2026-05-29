# VaultMCP 🗄

VaultMCP is a premium, retro-themed Control Panel and URL Extractor UI. Save links, media, and text shared directly from your device (including Android Share Sheet support) and automatically compile transcripts, metadata summaries, and document guidelines in a vintage 90s visual console.

## Project Structure
```text
vaultmcp/
├── src/
│   ├── screens/
│   │   ├── OnboardingScreen.jsx
│   │   ├── ChatScreen.jsx
│   │   ├── VaultScreen.jsx
│   │   └── SettingsScreen.jsx
│   ├── components/
│   │   ├── WindowFrame.jsx
│   │   └── StatusBar.jsx
│   ├── hooks/
│   │   └── useLocalStorage.js
│   ├── utils/
│   │   └── helpers.js
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
│   └── manifest.json
├── package.json
└── vite.config.js
```

## Features
- **Skeuomorphic Retro Aesthetics**: Hard 2px borders, 3px solid shadows, inset inputs, and scanline/flicker overlays styled strictly via custom CSS variables and utility classes.
- **Dynamic Navigation Flow**: Toggles between Onboarding, Chat, Vault, and Settings.
- **PWA Share Target**: Integrates with Android native share sheets using `manifest.json` `share_target`.
- **Interactive URL Extraction**: Simulates an audio-extraction, transcription, and indexing workflow for any input link.
- **Local Storage State Persistence**: Stores configuration, vault documents, and message transcripts directly on the device.

## Commands

```bash
# Install dependencies
npm install

# Run the dev server
npm run dev

# Build the production bundle
npm run build
```
