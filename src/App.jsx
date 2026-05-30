import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import OnboardingScreen from './screens/OnboardingScreen';
import ChatScreen from './screens/ChatScreen';
import VaultScreen from './screens/VaultScreen';
import SettingsScreen from './screens/SettingsScreen';
import StatusBar from './components/StatusBar';
import { isValidUrl, formatRetroDate } from './utils/helpers';
import { processContent, saveToDrive, getVaultFromDrive, getGoogleAuthUrl, exchangeGoogleAuthCode } from './utils/api';

// Initial chat history matching the designs
const INITIAL_MESSAGES = [
  {
    sender: 'user',
    text: 'https://instagram.com/reel/abc123',
    isUrl: true
  },
  {
    sender: 'system',
    label: 'INSTAGRAM_EXTRACTOR',
    isExtracting: true,
    step: 3,
    category: 'AI Tools',
    title: 'Cursor AI',
    summary: 'This reel discusses the new Cursor AI features for 2024 including Composer and agentic workflows.'
  },
  {
    sender: 'user',
    text: 'Can you find that tutorial about retro css layouts?',
    isUrl: false
  },
  {
    sender: 'system',
    label: 'VAULT_QUERY',
    isQueryMatch: true,
    matchCount: 1,
    title: 'Brutalism in Web Design 1995-2025',
    date: '12.OCT.2023',
    fileName: 'NeoBrutalist_Guidelines.pdf'
  }
];

export default function App() {
  const [user, setUser] = useLocalStorage('vaultmcp_user', {
    name: '',
    hfToken: '',
    isDriveConnected: false,
    driveAccessToken: '',
    driveRefreshToken: '',
  });

  const [vaultItems, setVaultItems] = useLocalStorage('vaultmcp_vault_items', []);
  const [messages, setMessages] = useLocalStorage('vaultmcp_messages', INITIAL_MESSAGES);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'vault' | 'settings'
  const [sharedInput, setSharedInput] = useState('');
  const hasProcessedShare = useRef(false);

  // ─── Real API call: process content ───────────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    const isLink = isValidUrl(text.trim());
    const hfToken = user.hfToken;

    // Add user message
    const userMsg = { sender: 'user', text, isUrl: isLink };
    setMessages(prev => [...prev, userMsg]);

    if (!hfToken) {
      setMessages(prev => [...prev, {
        sender: 'system',
        isError: true,
        text: '● ERROR — No Hugging Face token set. Go to Settings to add your token.',
      }]);
      return;
    }

    // Add a "processing" system message
    const msgId = Date.now();
    const processingMsg = {
      id: msgId,
      sender: 'system',
      label: isLink ? 'URL_EXTRACTOR' : 'TEXT_PROCESSOR',
      isExtracting: true,
      step: 1,
      category: '',
      title: 'Processing...',
      summary: '',
    };
    setMessages(prev => [...prev, processingMsg]);

    try {
      // Step 2: call the real backend
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, step: 2 } : m));

      const response = await processContent(text.trim(), hfToken);
      const result = response.result;

      // Step 3: show success with real data
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        step: 3,
        title: result.title,
        category: result.category,
        summary: result.summary,
      } : m));

      // Add to local vault items
      const newVaultItem = {
        id: Date.now(),
        title: result.title,
        category: result.category.toUpperCase(),
        date: result.saved_on,
        summary: result.summary,
        sourceUrl: result.source_url || result.official_link || '',
        officialLink: result.official_link || '',
        mdEntry: result.md_entry,
        locked: false,
      };
      setVaultItems(prev => [newVaultItem, ...prev]);

      // Auto-save to Google Drive if connected
      if (user.isDriveConnected && user.driveAccessToken && result.md_entry) {
        try {
          await saveToDrive(result.md_entry, user.driveAccessToken, user.driveRefreshToken);
        } catch (driveErr) {
          console.error('[VaultMCP] Drive save failed:', driveErr.message);
          // Non-blocking: entry is saved locally even if Drive fails
        }
      }

    } catch (err) {
      // Replace the processing message with an error
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        id: undefined, // clear the id so it's treated as a normal message
        isExtracting: false,
        isError: true,
        label: undefined,
        text: `● ERROR — Could not process. Try again. (${err.message})`,
      } : m));
    }
  }, [user.hfToken, user.isDriveConnected, user.driveAccessToken, user.driveRefreshToken, setMessages, setVaultItems]);

  // Parse share target options on load
  useEffect(() => {
    if (hasProcessedShare.current) return;

    const isSharePath = window.location.pathname === '/share';
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const text = params.get('text');
    const url = params.get('url');

    let shared = '';
    if (url) shared = url;
    else if (text) shared = text;
    else if (title) shared = title;

    if (shared && (isSharePath || params.has('title') || params.has('text') || params.has('url'))) {
      hasProcessedShare.current = true;
      
      // Clear URL query parameters and pathname
      window.history.replaceState({}, document.title, '/');
      
      // Lands on Chat screen automatically
      setActiveTab('chat');
      
      if (user.name && user.hfToken) {
        handleSendMessage(shared);
      } else {
        setSharedInput(shared);
      }
    }
  }, [user.name, user.hfToken, handleSendMessage]);

  // ─── Fetch vault from Drive when switching to vault tab ───────────────
  const fetchVaultFromDrive = useCallback(async () => {
    if (!user.driveAccessToken) return;

    try {
      const response = await getVaultFromDrive(user.driveAccessToken, user.driveRefreshToken);

      if (response.status === 'success' && response.content) {
        // Parse vault.md content into structured items
        const items = parseVaultMd(response.content);
        setVaultItems(items);
      }
    } catch (err) {
      console.error('[VaultMCP] Failed to fetch vault from Drive:', err.message);
    }
  }, [user.driveAccessToken, user.driveRefreshToken, setVaultItems]);

  useEffect(() => {
    if (activeTab === 'vault') {
      fetchVaultFromDrive();
    }
  }, [activeTab, fetchVaultFromDrive]);

  // ─── Google Drive OAuth ───────────────────────────────────────────────
  const handleConnectDrive = async () => {
    try {
      const authUrl = await getGoogleAuthUrl();
      // Open Google OAuth consent in a popup
      const popup = window.open(authUrl, 'google-oauth', 'width=500,height=600');

      // Listen for the redirect with auth code
      const checkPopup = setInterval(async () => {
        try {
          if (popup.closed) {
            clearInterval(checkPopup);
            return;
          }
          const popupUrl = popup.location.href;
          if (popupUrl.includes('code=')) {
            clearInterval(checkPopup);
            const popupParams = new URLSearchParams(new URL(popupUrl).search);
            const authCode = popupParams.get('code');
            popup.close();

            if (authCode) {
              const tokens = await exchangeGoogleAuthCode(authCode);
              setUser(prev => ({
                ...prev,
                isDriveConnected: true,
                driveAccessToken: tokens.access_token,
                driveRefreshToken: tokens.refresh_token || '',
              }));
            }
          }
        } catch (_) {
          // Cross-origin — popup hasn't redirected yet, keep polling
        }
      }, 500);
    } catch (err) {
      console.error('[VaultMCP] Drive auth error:', err.message);
      // Add error message to chat
      setMessages(prev => [...prev, {
        sender: 'system',
        isError: true,
        text: `● ERROR — Could not connect Google Drive: ${err.message}`,
      }]);
    }
  };

  const handleOnboardingComplete = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
  };

  const handleUpdateUser = (updatedData) => {
    setUser((prev) => ({ ...prev, ...updatedData }));
  };

  const handleClearVault = () => {
    setUser({
      name: '',
      hfToken: '',
      isDriveConnected: false,
      driveAccessToken: '',
      driveRefreshToken: '',
    });
    setVaultItems([]);
    setMessages(INITIAL_MESSAGES);
    setActiveTab('chat');
  };


  // If user has not completed onboarding, lock them in onboarding screen
  if (!user.name) {
    return (
      <div className="mobile-canvas flex flex-col justify-between min-h-screen bg-background-base relative">
        <div className="scanline" />
        <OnboardingScreen onComplete={handleOnboardingComplete} onConnectDrive={handleConnectDrive} />
        <StatusBar leftLabel="AWAITING SYSTEM INITIALIZATION" rightLabel="OFFLINE" isOk={false} />
      </div>
    );
  }

  return (
    <div className="mobile-canvas flex flex-col justify-between min-h-screen bg-background-base relative border-x-2 border-black">
      <div className="scanline" />
      
      {/* Global Header */}
      <header className="bg-primary text-on-primary font-title-bar text-title-bar uppercase border-b-2 border-black flex justify-between items-center w-full px-4 h-10 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-title-bar">VaultMCP</span>
        </div>
        <div className="flex gap-1">
          <button className="window-control bg-window-control-white text-text-main border-2 border-black w-6 h-6 flex items-center justify-center font-bold active-press cursor-pointer">_</button>
          <button className="window-control bg-window-control-white text-text-main border-2 border-black w-6 h-6 flex items-center justify-center font-bold active-press cursor-pointer">□</button>
          <button 
            onClick={handleClearVault}
            className="window-control bg-window-control-white text-text-main border-2 border-black w-6 h-6 flex items-center justify-center font-bold active-press cursor-pointer"
          >
            ✕
          </button>
        </div>
      </header>

      {/* Sub-header Navigation Tabs */}
      <nav className="flex bg-background-base border-b-2 border-black w-full h-10 shrink-0 select-none">
        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex-1 font-label-caps text-label-caps border-r-2 border-black flex items-center justify-center cursor-pointer transition-all ${
            activeTab === 'chat' ? 'bg-text-main text-secondary-container' : 'bg-transparent text-text-main hover:bg-surface-panel'
          }`}
        >
          CHAT
        </button>
        <button 
          onClick={() => setActiveTab('vault')}
          className={`flex-1 font-label-caps text-label-caps border-r-2 border-black flex items-center justify-center cursor-pointer transition-all ${
            activeTab === 'vault' ? 'bg-text-main text-secondary-container' : 'bg-transparent text-text-main hover:bg-surface-panel'
          }`}
        >
          VAULT
        </button>
        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex-1 font-label-caps text-label-caps flex items-center justify-center cursor-pointer transition-all ${
            activeTab === 'settings' ? 'bg-text-main text-secondary-container' : 'bg-transparent text-text-main hover:bg-surface-panel'
          }`}
        >
          SETTINGS
        </button>
      </nav>

      {/* Main View Container */}
      <div className="flex-grow flex flex-col overflow-hidden relative">
        {activeTab === 'chat' && (
          <ChatScreen 
            messages={messages} 
            onSendMessage={handleSendMessage}
            sharedInput={sharedInput}
            clearSharedInput={() => setSharedInput('')}
          />
        )}
        {activeTab === 'vault' && (
          <VaultScreen vaultItems={vaultItems} onRefresh={fetchVaultFromDrive} />
        )}
        {activeTab === 'settings' && (
          <SettingsScreen 
            user={user} 
            onUpdateUser={handleUpdateUser} 
            onClearVault={handleClearVault}
            onConnectDrive={handleConnectDrive}
          />
        )}
      </div>

      {/* Global Status Footer */}
      <div className="shrink-0 select-none">
        {/* Status Bar */}
        <div className="bg-primary-container h-8 border-t-2 border-b-2 border-black flex justify-between items-center px-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-on-primary-fixed border border-black animate-pulse"></span>
            <span className="text-[10px] font-bold text-on-primary-fixed uppercase">SYSTEM OK</span>
          </div>
          <span className="text-[10px] font-bold text-on-primary-fixed uppercase tracking-tight">ALL SYSTEMS READY</span>
        </div>
        
        {/* Bottom Nav Bar */}
        <nav className="bg-secondary-container border-t-2 border-black flex justify-around items-center h-16 w-full">
          <div 
            onClick={() => setActiveTab('chat')}
            className={`flex flex-col items-center justify-center text-on-secondary-container w-full h-full cursor-pointer hover:bg-primary-container hover:text-on-primary-container transition-colors ${
              activeTab === 'chat' ? 'bg-surface-container-low text-on-surface border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] m-1 px-2' : 'opacity-90'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'chat' ? "'FILL' 1" : undefined }}>home</span>
            <span className="font-label-caps text-[9px] mt-1">HOME</span>
          </div>
          
          <div 
            onClick={() => setActiveTab('vault')}
            className={`flex flex-col items-center justify-center text-on-secondary-container w-full h-full cursor-pointer hover:bg-primary-container hover:text-on-primary-container transition-colors ${
              activeTab === 'vault' ? 'bg-surface-container-low text-on-surface border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] m-1 px-2' : 'opacity-90'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'vault' ? "'FILL' 1" : undefined }}>folder_open</span>
            <span className="font-label-caps text-[9px] mt-1">FILES</span>
          </div>
          
          <div 
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col items-center justify-center text-on-secondary-container w-full h-full cursor-pointer hover:bg-primary-container hover:text-on-primary-container transition-colors ${
              activeTab === 'settings' ? 'bg-surface-container-low text-on-surface border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] m-1 px-2' : 'opacity-90'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: activeTab === 'settings' ? "'FILL' 1" : undefined }}>settings</span>
            <span className="font-label-caps text-[9px] mt-1">SYSTEM</span>
          </div>
        </nav>
      </div>
    </div>
  );
}

// ─── Helper: Parse vault.md content into structured items ───────────────────
function parseVaultMd(mdContent) {
  const items = [];
  if (!mdContent) return items;

  // Split by ### headers (each entry)
  const sections = mdContent.split(/^### /m).filter(s => s.trim());
  let currentCategory = 'OTHER';

  for (const section of sections) {
    // Check if this section starts with a category header
    const catMatch = section.match(/^\[CATEGORY:\s*(.+?)\]/m);
    if (catMatch) {
      currentCategory = catMatch[1].trim().toUpperCase();
      continue;
    }

    // Parse entry
    const lines = section.trim().split('\n');
    const title = lines[0]?.trim() || 'Untitled';

    let summary = '';
    let sourceUrl = '';
    let officialLink = '';
    let savedOn = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- Summary:')) {
        summary = trimmed.replace('- Summary:', '').trim();
      } else if (trimmed.startsWith('- Official link:')) {
        officialLink = trimmed.replace('- Official link:', '').trim();
        if (officialLink === 'N/A') officialLink = '';
      } else if (trimmed.startsWith('- Source:')) {
        sourceUrl = trimmed.replace('- Source:', '').trim();
      } else if (trimmed.startsWith('- Saved on:')) {
        savedOn = trimmed.replace('- Saved on:', '').trim();
      }
    }

    // Find category from the content above this entry
    const aboveContent = mdContent.split(`### ${title}`)[0] || '';
    const catHeaders = aboveContent.match(/## \[CATEGORY:\s*(.+?)\]/g);
    if (catHeaders && catHeaders.length > 0) {
      const lastCat = catHeaders[catHeaders.length - 1];
      const m = lastCat.match(/\[CATEGORY:\s*(.+?)\]/);
      if (m) currentCategory = m[1].trim().toUpperCase();
    }

    items.push({
      id: Date.now() + Math.random(),
      title,
      category: currentCategory,
      date: savedOn || formatRetroDate(new Date()),
      summary,
      sourceUrl: sourceUrl || officialLink,
      officialLink,
      locked: false,
    });
  }

  return items;
}
