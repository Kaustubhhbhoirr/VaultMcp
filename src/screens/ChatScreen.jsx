import React, { useState, useRef, useEffect } from 'react';
import ScrollReveal from '../components/ScrollReveal';

export default function ChatScreen({ messages, onSendMessage, onSaveToVault, sharedInput, clearSharedInput }) {
  const [inputVal, setInputVal] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (sharedInput) {
      setInputVal(sharedInput);
      clearSharedInput();
    }
  }, [sharedInput, clearSharedInput]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = () => {
    if (!inputVal.trim()) return;
    onSendMessage(inputVal);
    setInputVal('');
  };

  return (
    <div className="flex-grow flex flex-col h-full overflow-hidden p-4 relative bg-background-base">
      {/* Scrollable Chat Area */}
      <div className="flex-1 bg-surface-panel retro-border retro-inset p-4 overflow-y-auto no-scrollbar space-y-6">
        {/* Welcome Message (System) */}
        <div className="flex justify-center">
          <div className="bg-surface-container-low retro-border px-4 py-2 text-center max-w-xs">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">[ CONNECTION ESTABLISHED ]</p>
            <p className="font-body-md text-body-md">VAULTMCP v1.0.4 - READY</p>
          </div>
        </div>

        {/* Chat History */}
        <div className="flex flex-col gap-6">
          {messages.map((msg, index) => {
            const isUser = msg.sender === 'user';
            
            if (isUser) {
              return (
                <ScrollReveal key={index} className="flex justify-end">
                  <div className="bg-surface-container-lowest retro-border retro-outset p-3 max-w-[85%] md:max-w-md">
                    <p className={`font-mono-code text-mono-code ${msg.isUrl ? 'break-all underline cursor-pointer text-primary hover:text-secondary-container transition-colors' : ''}`}>
                      {msg.text}
                    </p>
                  </div>
                </ScrollReveal>
              );
            }

            // System Message
            return (
              <ScrollReveal key={index} className="flex flex-col items-start gap-1">
                {msg.label && (
                  <div className="bg-secondary-container text-on-secondary-container px-2 py-0.5 retro-border border-b-0 font-label-caps text-[10px] ml-1">
                    {msg.label}
                  </div>
                )}
                
                <div className="bg-text-main text-secondary-container retro-border retro-outset p-4 max-w-[90%] md:max-w-lg">
                  <div className="space-y-1 font-mono-code text-mono-code">
                    {msg.isExtracting && (
                      <>
                        <p className="flex items-center gap-2">
                          <span className="text-primary-container animate-pulse">●</span> Analyzing content...
                        </p>
                        {msg.step >= 2 && (
                          <p className="flex items-center gap-2">
                            <span className="text-primary-container animate-pulse">●</span> Structuring entry...
                          </p>
                        )}
                        {msg.step >= 3 && (
                          <>
                            <p className="flex items-center gap-2">
                              <span className="text-primary-container animate-pulse">●</span> Saving to Drive...
                            </p>
                            <p className="flex items-center gap-2 pt-2 border-t border-secondary-container border-opacity-30">
                              <span className="text-status-success">✓</span> SAVED — {msg.category} → {msg.title}
                            </p>
                          </>
                        )}
                        {msg.step >= 3 && msg.summary && (
                          <div className="mt-3 bg-inverse-surface text-on-primary-fixed border border-secondary-container border-opacity-50 p-2">
                            <p className="text-[11px] opacity-70 mb-1 font-bold" style={{ color: 'rgb(245, 149, 0)' }}>METADATA SUMMARY:</p>
                            <p style={{ color: 'rgb(245, 149, 0)' }}>"{msg.summary}"</p>
                          </div>
                        )}
                      </>
                    )}

                    {!msg.isExtracting && (
                      <>
                        {msg.isQueryMatch ? (
                          <>
                            <p className="flex items-center gap-2">
                              <span className="text-status-success">✓</span> FOUND {msg.matchCount} MATCH: "{msg.title}"
                            </p>
                            <p className="opacity-70 text-[11px] pl-5">Saved: {msg.date}</p>
                            <div className="mt-2 retro-border border-secondary-container bg-surface-dim overflow-hidden flex items-center">
                              <div className="w-16 h-16 bg-surface-container-highest border-r-2 border-secondary-container flex items-center justify-center">
                                <span className="material-symbols-outlined text-text-main" data-icon="article">article</span>
                              </div>
                              <div className="p-2 text-text-main flex-1">
                                <p className="font-bold text-[12px]">{msg.fileName}</p>
                                <p className="text-[10px]">Open in Browser →</p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p>{msg.text}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input controls */}
      <div className="mt-4 flex gap-2 items-end shrink-0">
        <div className="flex-1">
          <div className="bg-surface-container-lowest retro-border retro-inset flex items-center overflow-hidden px-1 py-1">
            <input 
              className="w-full bg-transparent border-none focus:ring-0 font-body-md placeholder:text-on-surface-variant placeholder:opacity-50 text-[12px] px-2 py-2" 
              placeholder="Paste link, prompt, or share a reel..." 
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
          </div>
        </div>
        <button 
          onClick={() => {
            const fakeUrl = prompt("Enter a mock URL to attach (e.g. https://instagram.com/reel/xyz987):");
            if (fakeUrl) setInputVal(fakeUrl);
          }}
          className="bg-surface-container-lowest text-text-main retro-border retro-outset h-11 w-11 flex items-center justify-center hover:bg-surface-variant active-press shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined" data-icon="attach_file">attach_file</span>
        </button>
        <button 
          onClick={handleSend}
          className="bg-primary-container text-on-primary-container retro-border retro-outset h-11 w-11 flex items-center justify-center hover:bg-secondary-container active-press shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined" data-icon="arrow_forward" style={{ fontVariationSettings: '"wght" 700' }}>arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
