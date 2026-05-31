import React, { useState } from 'react';
import WindowFrame from '../components/WindowFrame';
import { useToast } from '../components/RetroToast';

export default function OnboardingScreen({ onComplete, onConnectDrive, isDriveConnected }) {
  const [name, setName] = useState('');
  const { showToast } = useToast();

  const handleStart = () => {
    if (!name.trim()) {
      showToast("Please enter your name to set up the profile.", "warning");
      return;
    }
    onComplete({
      name,
      isDriveConnected
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      {/* Onboarding Window Card */}
      <div className="w-full max-w-[373px] mb-8">
        <WindowFrame title="VaultMCP 🗄" icon="terminal">
          <div className="p-6 md:p-8 bg-surface-panel">
            {/* Tagline & Subtext */}
            <div className="mb-6">
              <h1 className="font-headline-lg text-headline-lg text-text-main leading-none mb-3">Save what you scroll.</h1>
              <p className="font-body-md text-on-surface-variant opacity-70">Set up once. Then just share.</p>
            </div>

            {/* Step 1 */}
            <div className="space-y-2 mb-6">
              <label className="font-label-caps text-label-caps block text-on-surface uppercase tracking-wider">Step 1</label>
              <input 
                className="w-full h-12 px-4 bg-white retro-border retro-inset-light focus:outline-none font-body-md text-text-main placeholder:text-on-surface-variant placeholder:opacity-40" 
                placeholder="Your name" 
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Step 2 */}
            <div className="space-y-2 mb-6">
              <label className="font-label-caps text-label-caps block text-on-surface uppercase tracking-wider">Step 2</label>
              <button 
                onClick={onConnectDrive}
                className={`w-full h-14 font-headline-md text-[13px] sm:text-headline-md whitespace-nowrap uppercase retro-border retro-outset active-press transition-all ${
                  isDriveConnected 
                    ? 'bg-status-success text-text-main' 
                    : 'bg-on-background text-primary-container hover:bg-opacity-90'
                }`}
              >
                {isDriveConnected ? '[ DRIVE CONNECTED ]' : '[ CONNECT GOOGLE DRIVE ]'}
              </button>
            </div>


            {/* CTA */}
            <div className="py-2">
              <button 
                onClick={handleStart}
                className="w-full h-16 bg-on-background text-primary-container font-headline-md text-headline-md uppercase retro-border retro-outset active-press transition-all"
              >
                [ GET STARTED ]
              </button>
            </div>

            {/* Note Footer */}
            <div className="text-center mt-4">
              <p className="font-label-caps text-[10px] leading-relaxed text-on-surface-variant opacity-60">
                Data is stored locally.<br />Never on our servers.
              </p>
            </div>
          </div>
        </WindowFrame>
      </div>

      {/* Decorative Art */}
      <div className="flex flex-col items-center opacity-40 grayscale pointer-events-none select-none">
        <pre className="text-[8px] font-mono leading-[8px] whitespace-pre">
{`   _________________
  |  VaultMCP v1.0  |
  | [][][][][][][]  |
  |_________________|`}
        </pre>
      </div>
    </div>
  );
}
