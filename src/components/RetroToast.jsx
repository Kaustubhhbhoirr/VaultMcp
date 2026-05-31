import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

// ─── Toast Context ──────────────────────────────────────────────────────────

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastOverlay toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

// ─── Toast Container (renders all active toasts) ────────────────────────────

function ToastOverlay({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 pointer-events-none"
      style={{ width: 'min(92%, 360px)' }}
    >
      {toasts.map(toast => (
        <SingleToast key={toast.id} {...toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

// ─── Single Toast (Win95 style) ─────────────────────────────────────────────

const TYPE_CONFIG = {
  success: { bg: 'bg-[#2d7d2d]', icon: 'check_circle', label: 'SUCCESS' },
  error:   { bg: 'bg-[#c43030]', icon: 'error',        label: 'ERROR' },
  warning: { bg: 'bg-[#b86e00]', icon: 'warning',      label: 'WARNING' },
  info:    { bg: 'bg-[#4a6a8a]', icon: 'info',          label: 'SYSTEM' },
};

function SingleToast({ message, type, duration, onDismiss }) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setExiting(true), duration - 400);
    const removeTimer = setTimeout(onDismiss, duration);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, onDismiss]);

  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;

  return (
    <div
      className={`pointer-events-auto transition-all duration-300 ${
        exiting ? 'opacity-0 -translate-y-2' : 'animate-toast-in opacity-100'
      }`}
    >
      {/* Win95 Title Bar */}
      <div
        className={`${cfg.bg} text-white px-3 py-1 flex justify-between items-center border-2 border-black border-b-0`}
      >
        <span className="font-bold text-[11px] uppercase tracking-wide flex items-center gap-1.5 select-none"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          <span className="material-symbols-outlined text-[14px]">{cfg.icon}</span>
          {cfg.label}
        </span>
        <button
          onClick={() => { setExiting(true); setTimeout(onDismiss, 200); }}
          className="bg-white bg-opacity-20 text-white border border-white border-opacity-40 w-5 h-5 flex items-center justify-center text-[10px] font-bold hover:bg-opacity-40 cursor-pointer leading-none"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="bg-[#d4cabb] border-2 border-black border-t-0 p-3"
           style={{ boxShadow: '3px 3px 0px 0px rgba(0,0,0,1)' }}>
        <p className="text-[12px] text-[#1a1a1a] leading-snug"
           style={{ fontFamily: "'JetBrains Mono', monospace" }}>
          {message}
        </p>
      </div>
    </div>
  );
}
