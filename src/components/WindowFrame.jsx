import React from 'react';

export default function WindowFrame({ title, icon = 'terminal', children, onClose }) {
  return (
    <div className="w-full flex flex-col retro-border retro-outset bg-surface-panel overflow-hidden">
      {/* Title Bar Header */}
      <header className="bg-primary-container text-on-primary-container flex justify-between items-center w-full px-4 h-10 retro-border-b shrink-0">
        <div className="flex items-center gap-2">
          {icon && <span className="material-symbols-outlined text-[18px]">{icon}</span>}
          <span className="font-title-bar text-title-bar uppercase font-bold text-on-primary-fixed">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            className="w-6 h-6 border-2 border-black bg-window-control-white text-text-main flex items-center justify-center font-bold text-xs active-press cursor-pointer"
            onClick={() => console.log('Minimize window')}
          >
            _
          </button>
          <button 
            className="w-6 h-6 border-2 border-black bg-window-control-white text-text-main flex items-center justify-center font-bold text-xs active-press cursor-pointer"
            onClick={() => {
              if (onClose) onClose();
              else if (confirm("Terminate session?")) {
                window.location.reload();
              }
            }}
          >
            ✕
          </button>
        </div>
      </header>
      
      {/* Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {children}
      </div>
    </div>
  );
}
