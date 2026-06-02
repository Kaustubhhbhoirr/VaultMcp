import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import OnboardingScreen from './screens/OnboardingScreen';
import ChatScreen from './screens/ChatScreen';
import VaultScreen from './screens/VaultScreen';
import SettingsScreen from './screens/SettingsScreen';
import StatusBar from './components/StatusBar';
import AuthCallback from './screens/AuthCallback';
import { isValidUrl, formatRetroDate } from './utils/helpers';
import { processContent, saveToDrive, getVaultFromDrive, getGoogleAuthUrl, exchangeGoogleAuthCode, healthCheck, processFile, getUserConfig, saveUserConfig, clearVault } from './utils/api';
import { useToast } from './components/RetroToast';

// Initial chat history matching the designs
const INITIAL_MESSAGES = [
  {
    sender: 'system',
    text: '[ CONNECTION ESTABLISHED ] VAULTMCP v1.0 — READY. Paste any link, prompt, or text to save it.',
  }
];

export default function App() {
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />;
  }

  const { showToast } = useToast();

  const [user, setUser] = useLocalStorage('vaultmcp_user', {
    uid: '',
    name: '',
    hfToken: '',
    isDriveConnected: false,
    driveAccessToken: '',
    driveRefreshToken: '',
  });

  const vaultCacheKey = user.uid ? `vaultmcp_vault_items_${user.uid}` : 'vaultmcp_vault_items';
  const messagesCacheKey = user.uid ? `vaultmcp_messages_${user.uid}` : 'vaultmcp_messages';

  const [vaultItems, setVaultItems] = useLocalStorage(vaultCacheKey, []);
  const [messages, setMessages] = useLocalStorage(messagesCacheKey, INITIAL_MESSAGES);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'vault' | 'settings'
  const [sharedInput, setSharedInput] = useState('');
  const hasProcessedShare = useRef(false);
  const [isBackendOnline, setIsBackendOnline] = useState(false);

  // ─── Health check for backend ───────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const checkHealth = async () => {
      try {
        await healthCheck();
        if (active) setIsBackendOnline(true);
      } catch (err) {
        if (active) setIsBackendOnline(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // ─── Save config to Drive on token change ──────────────────────────────
  useEffect(() => {
    if (
      user.isDriveConnected &&
      user.driveAccessToken &&
      user.hfToken &&
      user.hfToken.trim() !== ''
    ) {
      console.log('HF token changed — saving to Drive...');
      saveUserConfig(
        user.hfToken,
        user.name,
        user.driveAccessToken,
        user.driveRefreshToken
      ).catch(console.error);
    }
  }, [user.hfToken, user.isDriveConnected, user.driveAccessToken, user.name, user.driveRefreshToken]);

  // ─── Real API call: process content ───────────────────────────────────
  const handleSendMessage = useCallback(async (text) => {
    let cleanText = text.trim();
    let forceCategory = null;

    const slashMatch = cleanText.match(/^\/\s*(ai|dev|prompt|design|resource|other)\b/i);
    if (slashMatch) {
      const keyword = slashMatch[1].toLowerCase();
      const catMap = {
        'ai': 'AI Tools',
        'dev': 'Dev Tools',
        'prompt': 'Prompts',
        'design': 'Design',
        'resource': 'Resources',
        'other': 'Other'
      };
      forceCategory = catMap[keyword];
      cleanText = cleanText.substring(slashMatch[0].length).trim();
    }

    if (!cleanText && forceCategory) {
      // User only typed the command, but no content
      setMessages(prev => [...prev, {
        sender: 'system',
        isError: true,
        text: '● ERROR — You must enter some content or a link after the slash command (e.g. "/prompt Make a react app").',
      }]);
      return;
    }

    if (!cleanText && !forceCategory) {
      return; // Do nothing if completely empty
    }

    const isLink = isValidUrl(cleanText);
    const hfToken = user.hfToken;

    // Add user message
    const userMsg = { sender: 'user', text: text.trim(), isUrl: isLink };
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
      label: forceCategory ? `FORCE: ${forceCategory.toUpperCase()}` : (isLink ? 'URL_EXTRACTOR' : 'TEXT_PROCESSOR'),
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

      const response = await processContent(cleanText, hfToken, forceCategory);
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
        exactPrompt: result.exact_prompt || '',
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
        } catch {
          // Non-blocking: entry is saved locally even if Drive fails
        }
      }

    } catch (err) {
      let errMsg = "● Could not process this. Try again or paste as plain text";
      if (err.message && (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network'))) {
        errMsg = "● Connection failed. Check your internet and try again";
      }
      // Replace the processing message with an error
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        id: undefined, // clear the id so it's treated as a normal message
        isExtracting: false,
        isError: true,
        label: undefined,
        text: errMsg,
      } : m));
    }
  }, [user.hfToken, user.isDriveConnected, user.driveAccessToken, user.driveRefreshToken, setMessages, setVaultItems]);

  const handleSendFile = useCallback(async (file) => {
    const hfToken = user.hfToken;

    // Add user message with attached file info
    const userMsg = { sender: 'user', text: `[Attached File: ${file.name}]`, isUrl: false };
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
      label: 'FILE_PROCESSOR',
      isExtracting: true,
      step: 1,
      category: '',
      title: 'Processing file...',
      summary: '',
    };
    setMessages(prev => [...prev, processingMsg]);

    try {
      // Step 2: call the real backend processFile API
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, step: 2 } : m));

      const response = await processFile(
        file, 
        hfToken, 
        user.isDriveConnected ? user.driveAccessToken : null, 
        user.isDriveConnected ? user.driveRefreshToken : null
      );
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
        exactPrompt: result.exact_prompt || '',
        sourceUrl: result.source_url || result.official_link || '',
        officialLink: result.official_link || '',
        originalLink: result.original_file_link || '',
        mdLink: result.md_file_link || '',
        mdEntry: result.md_entry,
        locked: false,
      };
      setVaultItems(prev => [newVaultItem, ...prev]);

      // Auto-save to Google Drive if connected
      if (user.isDriveConnected && user.driveAccessToken && result.md_entry) {
        try {
          await saveToDrive(result.md_entry, user.driveAccessToken, user.driveRefreshToken);
        } catch {
          // Non-blocking
        }
      }

    } catch (err) {
      let errMsg = "● Could not process this. Try again or paste as plain text";
      if (err.message && (err.message.toLowerCase().includes('fetch') || err.message.toLowerCase().includes('network'))) {
        errMsg = "● Connection failed. Check your internet and try again";
      }
      setMessages(prev => prev.map(m => m.id === msgId ? {
        ...m,
        id: undefined,
        isExtracting: false,
        isError: true,
        label: undefined,
        text: errMsg,
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
        return items.length;
      }
    } catch {
      // Silently fail — vault was fetched from cache
    }
    return 0;
  }, [user.driveAccessToken, user.driveRefreshToken, setVaultItems]);

  // ─── Auto-sync vault on app load when Drive already connected ──────────
  useEffect(() => {
    if (user.isDriveConnected && user.driveAccessToken) {
      fetchVaultFromDrive();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.isDriveConnected]);

  // ─── Manual sync from Drive (Settings button) ─────────────────────────
  const handleSyncFromDrive = useCallback(async () => {
    if (!user.driveAccessToken) {
      setMessages(prev => [...prev, {
        sender: 'system',
        isError: true,
        text: '● ERROR — Google Drive not connected. Connect Drive first.',
      }]);
      return;
    }
    try {
      const count = await fetchVaultFromDrive();
      showToast(`Vault synced — ${count} entries restored from Drive`, 'success');
    } catch {
      showToast('Sync failed. Check Drive connection.', 'error');
    }
  }, [fetchVaultFromDrive, user.driveAccessToken, showToast, setMessages]);

  useEffect(() => {
    if (activeTab === 'vault') {
      fetchVaultFromDrive();
    }
  }, [activeTab, fetchVaultFromDrive]);

  // ─── Google Drive OAuth ───────────────────────────────────────────────
  const handleConnectDrive = async () => {
    try {
      const authUrl = await getGoogleAuthUrl();
      const popup = window.open(authUrl, 'google-oauth', 'width=500,height=600');

      window.addEventListener('message', async (event) => {
        if (event.origin !== window.location.origin) return;

        if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          const authCode = event.data.code;

          try {
            const tokens = await exchangeGoogleAuthCode(authCode);
            
            try {
              setTimeout(async () => {
                const configRes = await getUserConfig(tokens.access_token, tokens.refresh_token);
                console.log('Config load result:', configRes);
                console.log('HF token restored:', configRes?.config?.hf_token ? 'YES' : 'NO');
                setUser(prev => {
                  const conf = (configRes.status === 'success' && configRes.config) ? configRes.config : {};
                  const newUser = {
                    ...prev,
                    isDriveConnected: true,
                    driveAccessToken: tokens.access_token,
                    driveRefreshToken: tokens.refresh_token || '',
                    hfToken: conf.hf_token || prev.hfToken,
                    name: conf.display_name || prev.name,
                  };
                  console.log('Saving config to Drive:', { hfToken: newUser.hfToken, name: newUser.name });
                  saveUserConfig(newUser.hfToken, newUser.name, newUser.driveAccessToken, newUser.driveRefreshToken).catch(console.error);
                  return newUser;
                });
              }, 2000);
            } catch (configErr) {
              console.error("Config restore failed", configErr);
              setUser(prev => ({
                ...prev,
                isDriveConnected: true,
                driveAccessToken: tokens.access_token,
                driveRefreshToken: tokens.refresh_token || '',
              }));
            }
            
            showToast("Google Drive authorized successfully!", "success");
            if (popup) popup.close();
            // Auto-restore vault after connecting
            const count = await fetchVaultFromDrive();
            if (count > 0) {
              setMessages(prev => [...prev, {
                sender: 'system',
                text: `● VAULT RESTORED — ${count} entries loaded from Drive`,
              }]);
            }
          } catch (err) {
            setMessages(prev => [...prev, {
              sender: 'system',
              isError: true,
              text: '● Drive connection expired. Go to Settings → Reconnect Drive',
            }]);
          }
        } else if (event.data && event.data.type === 'GOOGLE_AUTH_ERROR') {
          setMessages(prev => [...prev, {
            sender: 'system',
            isError: true,
            text: '● Drive connection expired. Go to Settings → Reconnect Drive',
          }]);
          if (popup) popup.close();
        }
      }, { once: true });

      // Bulletproof fallback: BroadcastChannel works even if window.opener is stripped
      const authChannel = new BroadcastChannel('google_oauth_channel');
      authChannel.onmessage = async (event) => {
        if (event.data && event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          const authCode = event.data.code;
          authChannel.close();
          try {
            const tokens = await exchangeGoogleAuthCode(authCode);
            
            try {
              setTimeout(async () => {
                const configRes = await getUserConfig(tokens.access_token, tokens.refresh_token);
                console.log('Config load result:', configRes);
                console.log('HF token restored:', configRes?.config?.hf_token ? 'YES' : 'NO');
                setUser(prev => {
                  const conf = (configRes.status === 'success' && configRes.config) ? configRes.config : {};
                  const newUser = {
                    ...prev,
                    isDriveConnected: true,
                    driveAccessToken: tokens.access_token,
                    driveRefreshToken: tokens.refresh_token || '',
                    hfToken: conf.hf_token || prev.hfToken,
                    name: conf.display_name || prev.name,
                  };
                  console.log('Saving config to Drive:', { hfToken: newUser.hfToken, name: newUser.name });
                  saveUserConfig(newUser.hfToken, newUser.name, newUser.driveAccessToken, newUser.driveRefreshToken).catch(console.error);
                  return newUser;
                });
              }, 2000);
            } catch (configErr) {
              console.error("Config restore failed", configErr);
              setUser(prev => ({
                ...prev,
                isDriveConnected: true,
                driveAccessToken: tokens.access_token,
                driveRefreshToken: tokens.refresh_token || '',
              }));
            }
            showToast("Google Drive authorized successfully!", "success");
            if (popup) popup.close();
            // Auto-restore vault after connecting (BroadcastChannel path)
            const count = await fetchVaultFromDrive();
            if (count > 0) {
              setMessages(prev => [...prev, {
                sender: 'system',
                text: `● VAULT RESTORED — ${count} entries loaded from Drive`,
              }]);
            }
          } catch (err) {
            setMessages(prev => [...prev, { sender: 'system', isError: true, text: '● Drive connection expired. Go to Settings → Reconnect Drive' }]);
          }
        } else if (event.data && event.data.type === 'GOOGLE_AUTH_ERROR') {
          authChannel.close();
          setMessages(prev => [...prev, { sender: 'system', isError: true, text: '● Drive connection expired. Go to Settings → Reconnect Drive' }]);
          if (popup) popup.close();
        }
      };

    } catch (err) {
      setMessages(prev => [...prev, {
        sender: 'system',
        isError: true,
        text: '● Drive connection expired. Go to Settings → Reconnect Drive',
      }]);
    }
  };

  const handleOnboardingComplete = (userData) => {
    setUser(prev => {
      const newUser = { ...prev, ...userData };
      if (newUser.isDriveConnected && newUser.driveAccessToken) {
        console.log('Saving config to Drive (onboarding complete):', { hfToken: newUser.hfToken, name: newUser.name });
        saveUserConfig(newUser.hfToken, newUser.name, newUser.driveAccessToken, newUser.driveRefreshToken).catch(console.error);
      }
      return newUser;
    });
  };

  const handleUpdateUser = (updatedData) => {
    setUser(prev => {
      const newUser = { ...prev, ...updatedData };
      if (newUser.isDriveConnected && newUser.driveAccessToken) {
        console.log('Saving config to Drive (settings update):', { hfToken: newUser.hfToken, name: newUser.name });
        saveUserConfig(newUser.hfToken, newUser.name, newUser.driveAccessToken, newUser.driveRefreshToken).catch(console.error);
      }
      return newUser;
    });
  };

  const handleClearVault = async () => {
    // Save empty vault to Drive and delete files
    if (user.isDriveConnected && user.driveAccessToken) {
      try {
        await clearVault(user.driveAccessToken, user.driveRefreshToken);
        const header = "# VaultMCP Vault\n\n> Save what you scroll. Use what you saved.\n\n---\n\n";
        await saveToDrive(header, user.driveAccessToken, user.driveRefreshToken, true);
        showToast('Vault files cleared from Drive', 'success');
      } catch (err) {
        console.error(err);
        showToast('Failed to clear files from Drive', 'error');
      }
    }
    // Clear local state
    setVaultItems([]);
  };

  const handleLogout = () => {
    setUser({
      uid: '',
      name: '',
      email: '',
      hfToken: '',
      isDriveConnected: false,
      driveAccessToken: '',
      driveRefreshToken: '',
    });
    setVaultItems([]);
    setMessages(INITIAL_MESSAGES);
    setActiveTab('chat');
    showToast('Logged out successfully', 'success');
  };



  // If user has not completed onboarding, lock them in onboarding screen
  if (!user.uid) {
    return (
      <>
        <div className="app-window mobile-canvas bg-background-base relative">
          <div className="scanline" />
          <OnboardingScreen onComplete={handleOnboardingComplete} />
          <StatusBar 
            leftLabel={isBackendOnline ? "SYSTEM INITIALIZED" : "AWAITING SYSTEM INITIALIZATION"} 
            rightLabel={isBackendOnline ? "ONLINE" : "OFFLINE"} 
            isOk={isBackendOnline} 
          />
        </div>
        <div className="desktop-taskbar">
          <span className="font-bold">VaultMCP System — v1.0.0</span>
          <span className="ml-auto opacity-70">AWAITING SYSTEM INITIALIZATION</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="app-window mobile-canvas bg-background-base relative border-x-2 border-black">
        <div className="scanline" />
      
      {/* Global Header */}
      <header className="bg-primary text-on-primary font-title-bar text-title-bar uppercase border-b-2 border-black flex justify-between items-center w-full px-4 h-10 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <span className="font-title-bar">VaultMCP</span>
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
            onSendFile={handleSendFile}
            sharedInput={sharedInput}
            clearSharedInput={() => setSharedInput('')}
          />
        )}
        {activeTab === 'vault' && (
          <VaultScreen 
            vaultItems={vaultItems} 
            onRefresh={fetchVaultFromDrive} 
            onDeleteEntry={(id, newMdContent) => {
              setVaultItems(prev => prev.filter(item => item.id !== id));
              if (user.isDriveConnected && user.driveAccessToken) {
                saveToDrive(newMdContent, user.driveAccessToken, user.driveRefreshToken, true).catch(console.error);
              }
            }}
            user={user}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsScreen 
            user={user} 
            onUpdateUser={handleUpdateUser} 
            onClearVault={handleClearVault}
            onConnectDrive={handleConnectDrive}
            onSyncFromDrive={handleSyncFromDrive}
            onLogout={handleLogout}
          />
        )}
      </div>

      {/* Global Status Footer */}
      <div className="shrink-0 select-none">
        {/* Status Bar */}
        <div className={`h-8 border-t-2 border-b-2 border-black flex justify-between items-center px-4 transition-colors ${
          isBackendOnline ? 'bg-primary-container' : 'bg-status-error text-white'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 border border-black animate-pulse ${
              isBackendOnline ? 'bg-on-primary-fixed' : 'bg-white'
            }`}></span>
            <span className={`text-[10px] font-bold uppercase ${
              isBackendOnline ? 'text-on-primary-fixed' : 'text-white'
            }`}>
              {isBackendOnline ? 'SYSTEM OK' : 'SYSTEM OFFLINE'}
            </span>
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-tight ${
            isBackendOnline ? 'text-on-primary-fixed' : 'text-white'
          }`}>
            {isBackendOnline ? 'ALL SYSTEMS READY' : 'BACKEND CONNECTION LOST'}
          </span>
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
    <div className="desktop-taskbar">
      <span className="font-bold">VaultMCP System — v1.0.0</span>
      <span className="ml-auto opacity-70">{isBackendOnline ? 'SYSTEM ONLINE' : 'SYSTEM OFFLINE'}</span>
    </div>
    </>
  );
}

// ─── Helper: Parse vault.md content into structured items ───────────────────
function parseVaultMd(mdContent) {
  const items = [];
  if (!mdContent) return items;

  // Split by ### headers (each entry)
  const sections = mdContent.split(/^### /m).filter(s => s.trim());
  
  if (sections.length > 0 && sections[0].includes('# VaultMCP Vault')) {
    sections.shift();
  }

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
    let toolsMentioned = '';
    let originalLink = '';
    let mdLink = '';
    let exactPrompt = '';
    let currentBlock = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- Summary:')) {
        if (trimmed === '- Summary:') currentBlock = 'summary';
        else summary = trimmed.replace('- Summary:', '').trim();
      } else if (trimmed.startsWith('- Exact Prompt:')) {
        if (trimmed === '- Exact Prompt:') currentBlock = 'exactPrompt';
        else exactPrompt = trimmed.replace('- Exact Prompt:', '').trim();
      } else if (trimmed.startsWith('- Official link:')) {
        currentBlock = null;
        officialLink = trimmed.replace('- Official link:', '').trim();
        if (officialLink === 'N/A') officialLink = '';
      } else if (trimmed.startsWith('- Source:')) {
        currentBlock = null;
        sourceUrl = trimmed.replace('- Source:', '').trim();
      } else if (trimmed.startsWith('- Tools mentioned:')) {
        currentBlock = null;
        toolsMentioned = trimmed.replace('- Tools mentioned:', '').trim();
      } else if (trimmed.startsWith('- Saved on:')) {
        currentBlock = null;
        savedOn = trimmed.replace('- Saved on:', '').trim();
      } else if (trimmed.startsWith('- Original File:')) {
        currentBlock = null;
        originalLink = trimmed.replace('- Original File:', '').trim();
      } else if (trimmed.startsWith('- MD File:')) {
        currentBlock = null;
        const match = trimmed.match(/https?:\/\/\S+/);
        if (match) mdLink = match[0];
      } else if (currentBlock) {
        if (trimmed.startsWith('```')) continue;
        if (currentBlock === 'summary') summary += (summary ? '\n' : '') + trimmed;
        else if (currentBlock === 'exactPrompt') exactPrompt += (exactPrompt ? '\n' : '') + trimmed;
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
      exactPrompt,
      sourceUrl: sourceUrl || officialLink,
      officialLink,
      originalLink,
      mdLink,
      toolsMentioned,
      locked: false,
    });
  }

  return items;
}
