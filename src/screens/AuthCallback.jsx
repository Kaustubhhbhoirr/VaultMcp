import React, { useEffect } from 'react';

export default function AuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    const authChannel = new BroadcastChannel('google_oauth_channel');

    if (code) {
      // Send the code back to the opener (main App window)
      window.opener?.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', code }, window.location.origin);
      authChannel.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', code });
    } else if (error) {
      window.opener?.postMessage({ type: 'GOOGLE_AUTH_ERROR', error }, window.location.origin);
      authChannel.postMessage({ type: 'GOOGLE_AUTH_ERROR', error });
    }

    // Close the popup window automatically after a brief delay to ensure message transmission
    const timer = setTimeout(() => {
      authChannel.close();
      window.close();
    }, 1000);

    return () => {
      clearTimeout(timer);
      authChannel.close();
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background-base p-6 select-none relative">
      <div className="scanline" />
      <div className="bg-surface-panel retro-border retro-outset p-6 max-w-sm text-center">
        <h2 className="font-headline-md text-headline-md uppercase text-text-main mb-4">[ SYSTEM AUTHORIZATION ]</h2>
        <div className="font-mono-code text-[11px] text-text-main space-y-2">
          <p className="animate-pulse">● TRANSMITTING CREDENTIALS...</p>
          <p className="opacity-60">This window will close automatically shortly.</p>
        </div>
      </div>
    </div>
  );
}
