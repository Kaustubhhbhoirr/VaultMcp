import React, { useState } from 'react';
import ScrollReveal from '../components/ScrollReveal';
import RetroModal from '../components/RetroModal';
import { useToast } from '../components/RetroToast';

export default function SettingsScreen({ user, onUpdateUser, onClearVault, onConnectDrive, onSyncFromDrive }) {
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
    showToast("Hugging Face token updated successfully!", "success");
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
              onClick={onClearVault}
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
            {/* Row 1: Google Drive */}
            <div className="flex items-center justify-between p-3 retro-border retro-outset bg-surface-panel">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">cloud</span>
                  <span className="font-title-bar text-body-md font-bold">Google Drive</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 border border-on-surface ${user.isDriveConnected ? 'bg-status-success' : 'bg-status-error'}`}></span>
                  <span className="text-[10px] font-bold text-on-surface-variant">
                    {user.isDriveConnected ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>
              </div>
              <button 
                onClick={onConnectDrive}
                className="bg-surface-variant text-on-surface retro-border px-3 py-1 font-label-caps text-[10px] retro-outset active-press cursor-pointer"
              >
                {user.isDriveConnected ? 'RECONNECT' : 'CONNECT'}
              </button>
            </div>

            {/* Sync from Drive */}
            {user.isDriveConnected && (
              <button
                onClick={onSyncFromDrive}
                className="w-full flex items-center justify-center gap-2 p-3 retro-border retro-outset bg-primary-container text-on-primary-container font-label-caps text-[11px] active-press cursor-pointer hover:opacity-90 transition-opacity"
              >
                <span className="material-symbols-outlined text-[16px]">sync</span>
                [ SYNC FROM DRIVE ]
              </button>
            )}

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
