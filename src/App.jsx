import React, { useState, useEffect } from 'react';
import { useLocalStorage } from './hooks/useLocalStorage';
import OnboardingScreen from './screens/OnboardingScreen';
import ChatScreen from './screens/ChatScreen';
import VaultScreen from './screens/VaultScreen';
import SettingsScreen from './screens/SettingsScreen';
import StatusBar from './components/StatusBar';
import { isValidUrl, getCleanHostLabel, formatRetroDate } from './utils/helpers';

// Initial vault items matching the designs
const INITIAL_VAULT_ITEMS = [
  {
    id: 1,
    title: "Cursor AI - Agentic Workflows",
    category: "AI TOOLS",
    date: "12.OCT.2023",
    summary: "Detailed guide on using Cursor's new agentic features for rapid frontend prototyping and iterative design.",
    sourceUrl: "https://cursor.com",
    locked: false
  },
  {
    id: 2,
    title: "Neo-Brutalism Guidelines",
    category: "UI DESIGN",
    date: "10.OCT.2023",
    summary: "Core principles of high-contrast UI layouts, typography systems, and skeuomorphic vintage borders.",
    sourceUrl: "https://brutalistwebsites.com",
    locked: false
  },
  {
    id: 3,
    title: "System Role Architect",
    category: "PROMPTS",
    date: "08.OCT.2023",
    summary: "Building complex system role instructions and agentic personas for large language models.",
    sourceUrl: "",
    locked: false
  },
  {
    id: 4,
    title: "Legacy Archive v2.1",
    category: "OTHER",
    date: "05.OCT.2023",
    summary: "Encrypted old index contents.",
    sourceUrl: "",
    locked: true
  }
];

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
    isDriveConnected: false
  });

  const [vaultItems, setVaultItems] = useLocalStorage('vaultmcp_vault_items', INITIAL_VAULT_ITEMS);
  const [messages, setMessages] = useLocalStorage('vaultmcp_messages', INITIAL_MESSAGES);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'vault' | 'settings'
  const [sharedInput, setSharedInput] = useState('');

  // Parse share target options on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const text = params.get('text');
    const url = params.get('url');

    let shared = '';
    if (url) shared = url;
    else if (text) shared = text;
    else if (title) shared = title;

    if (shared) {
      setSharedInput(shared);
      // Clean up parameters from the address bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleOnboardingComplete = (userData) => {
    setUser(userData);
  };

  const handleUpdateUser = (updatedData) => {
    setUser((prev) => ({ ...prev, ...updatedData }));
  };

  const handleClearVault = () => {
    setUser({
      name: '',
      hfToken: '',
      isDriveConnected: false
    });
    setVaultItems(INITIAL_VAULT_ITEMS);
    setMessages(INITIAL_MESSAGES);
    setActiveTab('chat');
  };

  const handleSendMessage = (text) => {
    const isLink = isValidUrl(text.trim());

    // Add user message
    const userMsg = { sender: 'user', text, isUrl: isLink };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);

    if (isLink) {
      // Simulate extraction pipeline
      const msgId = Date.now();
      const newSysMsg = {
        id: msgId,
        sender: 'system',
        label: 'URL_EXTRACTOR',
        isExtracting: true,
        step: 1,
        category: 'AI TOOLS',
        title: 'Extracting...',
        summary: ''
      };

      setMessages(prev => [...prev, newSysMsg]);

      // Phase 2
      setTimeout(() => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, step: 2 } : m));
      }, 1500);

      // Phase 3 (Complete & Add to Vault)
      setTimeout(() => {
        const cleanedHost = getCleanHostLabel(text.trim());
        
        const extractedTitle = `Shared Link from ${cleanedHost}`;
        const summaryText = `Automatically archived shared URL content from web location: ${text.trim()}. Indexed for query analysis.`;
        
        setMessages(prev => prev.map(m => m.id === msgId ? { 
          ...m, 
          step: 3, 
          title: extractedTitle, 
          category: 'APIS',
          summary: summaryText
        } : m));

        // Add to Vault Items
        const newVaultItem = {
          id: Date.now(),
          title: extractedTitle,
          category: 'APIS',
          date: formatRetroDate(new Date()),
          summary: summaryText,
          sourceUrl: text.trim(),
          locked: false
        };
        setVaultItems(prev => [newVaultItem, ...prev]);

      }, 3000);

    } else {
      // Simulate typical AI assistant prompt reply
      setTimeout(() => {
        const queryText = text.toLowerCase();
        // Check if user is searching for something in vault
        const matches = vaultItems.filter(item => 
          !item.locked && 
          (item.title.toLowerCase().includes(queryText) || item.summary.toLowerCase().includes(queryText))
        );

        if (matches.length > 0) {
          const match = matches[0];
          setMessages(prev => [...prev, {
            sender: 'system',
            label: 'VAULT_QUERY',
            isQueryMatch: true,
            matchCount: matches.length,
            title: match.title,
            date: match.date,
            fileName: `${match.title.replace(/\s+/g, '_')}.pdf`
          }]);
        } else {
          setMessages(prev => [...prev, {
            sender: 'system',
            text: `Indexed search query for "${text}". No matches found in your local Google Drive or HF vault. Try searching for "Cursor" or "Brutalism".`,
            isUrl: false
          }]);
        }
      }, 800);
    }
  };

  // If user has not completed onboarding, lock them in onboarding screen
  if (!user.name) {
    return (
      <div className="mobile-canvas flex flex-col justify-between min-h-screen bg-background-base relative">
        <div className="scanline" />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
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
          <VaultScreen vaultItems={vaultItems} />
        )}
        {activeTab === 'settings' && (
          <SettingsScreen 
            user={user} 
            onUpdateUser={handleUpdateUser} 
            onClearVault={handleClearVault}
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
