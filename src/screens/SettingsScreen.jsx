import React, { useState } from 'react';
import ScrollReveal from '../components/ScrollReveal';
import RetroModal from '../components/RetroModal';
import { useToast } from '../components/RetroToast';

export default function SettingsScreen({ user, onUpdateUser, onClearVault, onLogout }) {
  const [displayName, setDisplayName] = useState(user.name || '');
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tempToken, setTempToken] = useState(user.hfToken || '');
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const { showToast } = useToast();

  const handleNameChange = (e) => {
    const val = e.target.value;
    setDisplayName(val);
    onUpdateUser({ name: val });
  };

  const handleUpdateToken = () => {
    setTempToken(user.hfToken || '');
    setIsTokenModalOpen(true);
  };

  const handleSaveToken = () => {
    onUpdateUser({ hfToken: tempToken });
    setIsTokenModalOpen(false);
    showToast("● HF Token saved to Firebase ✓", "success");
  };

  const handleClear = () => {
    setIsClearConfirmOpen(true);
  };

  const handleConfirmClear = () => {
    setIsClearConfirmOpen(false);
    onClearVault();
    showToast("Vault purged successfully. Restarting...", "success");
  };

  return (
    <main className="flex-grow space-y-8 bg-background-base px-6 py-6 pb-40 overflow-y-auto no-scrollbar">
      {/* USER Section */}
      <ScrollReveal>
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-on-surface-variant font-label-caps text-label-caps opacity-70 tracking-widest uppercase">USER</h2>
            <button 
              onClick={onLogout}
              className="bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press cursor-pointer"
            >
              LOGOUT
            </button>
          </div>
          <div className="p-4 retro-border retro-outset bg-surface-panel space-y-2">
            <label className="font-label-caps text-[10px] text-on-surface-variant uppercase">DISPLAY NAME</label>
            <div className="relative">
              <input 
                className="w-full bg-surface-container-lowest retro-border retro-inset px-3 py-2 font-mono-code focus:outline-none" 
                type="text" 
                value={displayName}
                onChange={handleNameChange}
              />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Divider */}
      <div className="h-[2px] bg-on-surface opacity-10"></div>

      {/* CONNECTIONS Section */}
      <ScrollReveal>
        <section className="space-y-3">
          <h2 className="text-on-surface-variant font-label-caps text-label-caps opacity-70 tracking-widest uppercase">CONNECTIONS</h2>
          <div className="space-y-4">


            {/* Row 2: Hugging Face */}
            <div className="flex items-center justify-between p-3 retro-border retro-outset bg-surface-panel">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">token</span>
                  <span className="font-title-bar text-body-md font-bold">Hugging Face</span>
                </div>
                <span className="text-[10px] font-mono-code text-on-surface-variant">
                  {user.hfToken ? `hf_••••${user.hfToken.slice(-6)}` : 'No token set'}
                </span>
              </div>
              <button 
                onClick={handleUpdateToken}
                className="bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press cursor-pointer"
              >
                UPDATE
              </button>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Divider */}
      <div className="h-[2px] bg-on-surface opacity-10"></div>

      {/* MCP CONNECTION Section */}
      <ScrollReveal>
        <section className="space-y-3">
          <h2 className="text-on-surface-variant font-label-caps text-label-caps opacity-70 tracking-widest uppercase">MCP CONNECTION</h2>
          <div className="space-y-4">
            {/* MCP Server URL */}
            <div className="flex flex-col gap-2 p-3 retro-border retro-outset bg-surface-panel">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">SERVER URL</span>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value="https://kaustubh5934-vaultmcp-backend.hf.space"
                  className="w-full bg-surface-container-lowest retro-border retro-inset px-2 py-1 font-mono-code text-[10px] focus:outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText('https://kaustubh5934-vaultmcp-backend.hf.space');
                    showToast('Copied!');
                  }}
                  className="bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press cursor-pointer whitespace-nowrap"
                >
                  [ COPY ]
                </button>
              </div>
            </div>

            {/* Manifest URL */}
            <div className="flex flex-col gap-2 p-3 retro-border retro-outset bg-surface-panel">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">MANIFEST</span>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value="https://kaustubh5934-vaultmcp-backend.hf.space/.well-known/mcp.json"
                  className="w-full bg-surface-container-lowest retro-border retro-inset px-2 py-1 font-mono-code text-[10px] focus:outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText('https://kaustubh5934-vaultmcp-backend.hf.space/.well-known/mcp.json');
                    showToast('Copied!');
                  }}
                  className="bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press cursor-pointer whitespace-nowrap"
                >
                  [ COPY ]
                </button>
              </div>
            </div>

            {/* Firebase UID for MCP */}
            <div className="flex flex-col gap-2 p-3 retro-border retro-outset bg-surface-panel">
              <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">FIREBASE UID</span>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={user.uid ? '●●●●●●●●●●' : 'Not logged in'}
                  className="w-full bg-surface-container-lowest retro-border retro-inset px-2 py-1 font-mono-code text-[10px] focus:outline-none"
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(user.uid);
                    showToast('UID copied!');
                  }}
                  disabled={!user.uid}
                  className={`bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press whitespace-nowrap ${!user.uid ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  [ COPY ]
                </button>
              </div>
            </div>

            {/* How to connect instructions */}
            <div className="bg-[#1a1a1a] text-[#f59500] p-3 text-[10px] font-mono-code leading-relaxed retro-inset flex flex-col gap-2">
              <div>
                <div className="font-bold mb-1">PASTE INTO mcp_config.json:</div>
                <div>~/.gemini/antigravity/mcp_config.json</div>
              </div>
              <div className="text-status-error font-bold mt-1">
                ⚠️ Keep your Firebase UID private. Never share this config publicly.
              </div>
              <button 
                onClick={() => {
                  const config = JSON.stringify({
                    mcpServers: {
                      vaultmcp: {
                        command: "npx",
                        args: [
                          "-y", 
                          "mcp-remote", 
                          "https://kaustubh5934-vaultmcp-backend.hf.space/mcp/sse",
                          "--header",
                          "X-Vault-Uid: YOUR_FIREBASE_UID"
                        ]
                      }
                    }
                  }, null, 2);
                  navigator.clipboard.writeText(config);
                  showToast('Config copied!');
                }}
                className="bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press cursor-pointer w-full text-center mt-1"
              >
                [ COPY MCP CONFIG ]
              </button>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Divider */}
      <div className="h-[2px] bg-on-surface opacity-10"></div>

      {/* DANGER ZONE Section */}
      <ScrollReveal>
        <section className="space-y-3">
          <h2 className="text-status-error font-label-caps text-label-caps tracking-widest uppercase">DANGER ZONE</h2>
          <button 
            onClick={handleClear}
            className="w-full bg-surface-container-lowest text-status-error retro-border p-4 font-headline-md retro-outset active-press flex items-center justify-center gap-3 cursor-pointer" 
            style={{ backgroundColor: 'rgb(212, 202, 187)' }}
          >
            <span className="material-symbols-outlined">delete_forever</span>
            [ CLEAR VAULT ]
          </button>
        </section>
      </ScrollReveal>

      {/* Footer Text */}
      <footer className="space-y-2 pt-2 select-none">
        <div className="h-[1px] bg-on-surface opacity-5 w-full"></div>
        <p className="text-center text-[10px] font-mono-code text-on-surface opacity-60">VaultMCP v1.0 — MIT License</p>
        <p className="text-center text-[10px] font-mono-code text-on-surface opacity-60">Made with ☕ by developers for developers</p>
      </footer>
      {/* Update HF Token Modal */}
      <RetroModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
        title="UPDATE HF TOKEN"
      >
        <div className="space-y-4 font-mono-code text-mono-code text-[12px]">
          <label className="font-label-caps text-[10px] text-on-surface-variant uppercase">
            HUGGING FACE TOKEN
          </label>
          <input
            type="password"
            value={tempToken}
            onChange={(e) => setTempToken(e.target.value)}
            placeholder="hf_••••••••••••••••"
            className="w-full bg-white text-[#1a1a1a] border-2 border-black px-3 py-2 font-mono-code focus:outline-none"
            style={{ boxShadow: 'inset 2px 2px 0px 0px rgba(0,0,0,1)' }}
          />
          <div className="flex justify-end gap-3 pt-2 select-none">
            <button
              onClick={() => setIsTokenModalOpen(false)}
              className="bg-surface-variant text-on-surface border-2 border-black px-4 py-1.5 font-label-caps text-[11px] retro-outset active-press cursor-pointer"
            >
              CANCEL
            </button>
            <button
              onClick={handleSaveToken}
              className="bg-black text-secondary-container border-2 border-black px-4 py-1.5 font-label-caps text-[11px] retro-outset active-press cursor-pointer"
            >
              SAVE
            </button>
          </div>
        </div>
      </RetroModal>

      {/* Critical Clear Confirm Modal */}
      <RetroModal
        isOpen={isClearConfirmOpen}
        onClose={() => setIsClearConfirmOpen(false)}
        title="CRITICAL WARNING"
        type="danger"
      >
        <div className="space-y-4 font-mono-code text-mono-code text-[12px]">
          <p className="font-bold text-[#c43030] leading-snug">
            CRITICAL WARNING: This will permanently delete all local vault indices and disconnect connected services.
          </p>
          <p className="text-on-surface-variant">
            Are you absolutely sure you want to continue?
          </p>
          <div className="flex justify-end gap-3 pt-2 select-none">
            <button
              onClick={() => setIsClearConfirmOpen(false)}
              className="bg-surface-variant text-on-surface border-2 border-black px-4 py-1.5 font-label-caps text-[11px] retro-outset active-press cursor-pointer"
            >
              NO, ABORT
            </button>
            <button
              onClick={handleConfirmClear}
              className="bg-[#c43030] text-white border-2 border-black px-4 py-1.5 font-label-caps text-[11px] retro-outset active-press cursor-pointer"
            >
              YES, PURGE
            </button>
          </div>
        </div>
      </RetroModal>
    </main>
  );
}
