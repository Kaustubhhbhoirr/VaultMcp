import React, { useState } from 'react';
import WindowFrame from '../components/WindowFrame';
import { useToast } from '../components/RetroToast';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

export default function OnboardingScreen({ onComplete }) {
  const { showToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      onComplete({
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email,
        isDriveConnected: false // Drive connects later
      });
      showToast("Successfully logged in!", "success");
    } catch (error) {
      console.error("Firebase Login Error:", error);
      showToast("Failed to sign in with Google.", "error");
    } finally {
      setIsLoading(false);
    }
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
              <p className="font-body-md text-on-surface-variant opacity-70">Log in to isolate your Vault data.</p>
            </div>

            {/* Login CTA */}
            <div className="py-2 mt-8">
              <button 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className={`w-full h-16 bg-on-background text-primary-container font-headline-md text-headline-md uppercase retro-border retro-outset active-press transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isLoading ? '[ AUTHENTICATING... ]' : '[ SIGN IN WITH GOOGLE ]'}
              </button>
            </div>

            {/* Note Footer */}
            <div className="text-center mt-6">
              <p className="font-label-caps text-[10px] leading-relaxed text-on-surface-variant opacity-60">
                Data is securely stored in your personal Vault.
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
