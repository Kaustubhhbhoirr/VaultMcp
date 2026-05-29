import React from 'react';

export default function StatusBar({ 
  leftLabel = 'SYSTEM READY', 
  rightLabel = 'AWAITING_INPUT...', 
  isOk = true 
}) {
  return (
    <footer className="bg-secondary-container text-on-secondary-container h-8 flex justify-between items-center px-4 retro-border-t shrink-0 font-label-caps text-label-caps uppercase select-none">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full animate-pulse ${isOk ? 'bg-status-success' : 'bg-status-error'}`}></span>
        <span>{leftLabel}</span>
      </div>
      <div className="flex items-center gap-1">
        <span>{rightLabel}</span>
      </div>
    </footer>
  );
}
