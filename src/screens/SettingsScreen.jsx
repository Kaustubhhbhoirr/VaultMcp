import React, { useState } from 'react';

export default function SettingsScreen({ user, onUpdateUser, onClearVault, onConnectDrive }) {
  const [displayName, setDisplayName] = useState(user.name || '');

  const handleNameChange = (e) => {
    const val = e.target.value;
    setDisplayName(val);
    onUpdateUser({ name: val });
  };

  const handleUpdateToken = () => {
    const newToken = prompt("Enter new Hugging Face token:", user.hfToken || '');
    if (newToken !== null) {
      onUpdateUser({ hfToken: newToken });
      alert("Hugging Face token updated successfully!");
    }
  };

  const handleClear = () => {
    if (confirm("CRITICAL WARNING: This will permanently delete all local vault indices and disconnect connected services. Continue?")) {
      onClearVault();
      alert("Vault purged successfully. Restarting...");
    }
  };

  return (
    <main className="flex-grow space-y-8 bg-background-base px-6 py-6 pb-40 overflow-y-auto no-scrollbar">
      {/* USER Section */}
      <section className="space-y-3">
        <h2 className="text-on-surface-variant font-label-caps text-label-caps opacity-70 tracking-widest uppercase">USER</h2>
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

      {/* Divider */}
      <div className="h-[2px] bg-on-surface opacity-10"></div>

      {/* CONNECTIONS Section */}
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

      {/* Divider */}
      <div className="h-[2px] bg-on-surface opacity-10"></div>

      {/* DANGER ZONE Section */}
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

      {/* Footer Text */}
      <footer className="space-y-2 pt-2 select-none">
        <div className="h-[1px] bg-on-surface opacity-5 w-full"></div>
        <p className="text-center text-[10px] font-mono-code text-on-surface opacity-60">VaultMCP v1.0 — MIT License</p>
        <p className="text-center text-[10px] font-mono-code text-on-surface opacity-60">Made with ☕ by developers for developers</p>
      </footer>
    </main>
  );
}
