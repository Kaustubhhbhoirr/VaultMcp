import React, { useState, useRef, useEffect } from 'react';
import ScrollReveal from '../components/ScrollReveal';

export default function ChatScreen({ messages, onSendMessage, onSendFile, sharedInput, clearSharedInput }) {
  const [inputVal, setInputVal] = useState('');
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);

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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && onSendFile) {
      onSendFile(file);
    }
    e.target.value = null;
  };

  return (
    <div className="flex-grow flex flex-col h-full overflow-hidden p-4 relative bg-background-base">
      {/* Scrollable Chat Area */}
      <div className="flex-1 bg-surface-panel retro-border retro-inset p-4 overflow-y-auto no-scrollbar space-y-6">

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
                              <span className="text-status-success">✓</span> SAVED — Check Google Drive → VaultMCP folder → vault.md
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
                      <p>{msg.text}</p>
                    )}
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input controls with relative positioning for popup */}
      <div className="mt-4 flex gap-2 items-end shrink-0 relative">
        
        {/* Slash Command Popup */}
        {inputVal.trimStart().startsWith('/') && !inputVal.replace(/^\s*\/\s*/, '/').includes(' ') && (
          <div className="absolute bottom-full left-0 mb-2 w-64 bg-surface-panel retro-border retro-outset z-10 p-1 flex flex-col gap-1 max-h-48 overflow-y-auto">
            <div className="px-2 py-1 bg-primary-container text-white font-label-caps text-[10px]">
              FORCE CATEGORY
            </div>
            {[
              { cmd: '/ai', label: 'AI Tools', desc: 'Categorize as AI Tool' },
              { cmd: '/dev', label: 'Dev Tools', desc: 'Categorize as Developer Tool' },
              { cmd: '/prompt', label: 'Prompts', desc: 'Categorize as Prompt' },
              { cmd: '/design', label: 'Design', desc: 'Categorize as Design Resource' },
              { cmd: '/resource', label: 'Resources', desc: 'General Resource' },
              { cmd: '/other', label: 'Other', desc: 'Uncategorized' },
            ].filter(c => c.cmd.startsWith(inputVal.replace(/^\/\s*/, '/').toLowerCase())).map(item => (
              <button
                key={item.cmd}
                onClick={() => setInputVal(item.cmd + ' ')}
                className="flex flex-col text-left px-2 py-1.5 hover:bg-surface-variant active-press cursor-pointer retro-border border-transparent hover:border-black transition-colors"
              >
                <span className="font-mono-code text-[12px] font-bold text-primary">{item.cmd}</span>
                <span className="font-body-md text-[10px] text-on-surface-variant opacity-80">{item.desc}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1">
          <div className="bg-surface-container-lowest retro-border retro-inset flex items-center overflow-hidden px-1 py-1">
            <input 
              className="w-full bg-transparent border-none focus:ring-0 font-body-md placeholder:text-on-surface-variant placeholder:opacity-50 text-[12px] px-2 py-2" 
              placeholder="Type '/' to force a category, or paste a link/text..." 
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
            />
          </div>
        </div>
        <input 
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button 
          onClick={() => fileInputRef.current?.click()}
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
