import React from 'react';

/**
 * RetroModal — Win95-style modal dialog.
 *
 * Props:
 *   isOpen    — boolean, controls visibility
 *   onClose   — function, called when backdrop or ✕ clicked
 *   title     — string, title bar text
 *   type      — 'info' | 'danger' — affects title bar color
 *   children  — modal body content
 */
export default function RetroModal({
  isOpen,
  onClose,
  title = 'SYSTEM DIALOG',
  type = 'info',
  children,
}) {
  if (!isOpen) return null;

  const titleBarBg =
    type === 'danger' ? 'bg-[#c43030]' : 'bg-[#4a6a8a]';

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Window */}
      <div
        className="relative w-full max-w-sm z-10 animate-modal-in"
        style={{ maxHeight: '80vh' }}
      >
        {/* Title Bar */}
        <div
          className={`${titleBarBg} text-white px-3 py-1.5 flex justify-between items-center border-2 border-black border-b-0`}
        >
          <span
            className="font-bold text-[11px] uppercase tracking-wide select-none"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {title}
          </span>
          <button
            onClick={onClose}
            className="bg-white bg-opacity-20 text-white border border-white border-opacity-40 w-5 h-5 flex items-center justify-center text-[10px] font-bold hover:bg-opacity-40 cursor-pointer leading-none"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          className="bg-[#d4cabb] border-2 border-black border-t-0 p-4 overflow-y-auto"
          style={{
            boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)',
            maxHeight: 'calc(80vh - 40px)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
