import React, { useState } from 'react';
import ScrollReveal from '../components/ScrollReveal';
import RetroModal from '../components/RetroModal';

export default function VaultScreen({ vaultItems, onRefresh, onDeleteEntry }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expandedIds, setExpandedIds] = useState(new Set([1])); // default expand the first entry
  const [viewingItem, setViewingItem] = useState(null);

  const categories = ["All", "AI Tools", "Dev Tools", "Prompts", "Design", "Resources", "Other"];

  const filteredItems = selectedCategory === 'All'
    ? vaultItems
    : vaultItems.filter(item => item.category.toUpperCase() === selectedCategory.toUpperCase());

  const toggleExpand = (id) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  };

  const buildMdContent = (items) => {
    const CATEGORIES_ORDER = [
      "AI Tools",
      "Dev Tools",
      "Prompts",
      "Design",
      "Resources",
      "Other"
    ];

    const getNormalizedCategory = (cat) => {
      if (!cat) return "Other";
      const cleaned = cat.trim().toLowerCase();
      if (cleaned === 'ai tools') return 'AI Tools';
      if (cleaned === 'dev tools') return 'Dev Tools';
      if (cleaned === 'prompts') return 'Prompts';
      if (cleaned === 'design' || cleaned.includes('design')) return 'Design';
      if (cleaned === 'resources' || cleaned.includes('resource')) return 'Resources';
      return 'Other';
    };

    // Group items
    const grouped = {};
    CATEGORIES_ORDER.forEach(cat => {
      grouped[cat] = [];
    });

    items.forEach(item => {
      const cat = getNormalizedCategory(item.category);
      if (!grouped[cat]) {
        grouped[cat] = [];
      }
      grouped[cat].push(item);
    });

    let mdContent = `# VaultMCP Vault\n\n> Save what you scroll. Use what you saved.\n\n---\n\n`;

    let hasEntries = false;
    CATEGORIES_ORDER.forEach(category => {
      const entries = grouped[category];
      if (entries && entries.length > 0) {
        hasEntries = true;
        mdContent += `## [CATEGORY: ${category}]\n\n`;
        entries.forEach(entry => {
          mdContent += `### ${entry.title}\n`;
          mdContent += `- Summary: ${entry.summary || ''}\n`;
          mdContent += `- Official link: ${entry.officialLink || 'N/A'}\n`;
          if (entry.sourceUrl) {
            mdContent += `- Source: ${entry.sourceUrl}\n`;
          }
          if (entry.toolsMentioned) {
            mdContent += `- Tools mentioned: ${entry.toolsMentioned}\n`;
          }
          mdContent += `- Saved on: ${entry.date || ''}\n\n`;
        });
        mdContent += `---\n\n`;
      }
    });

    // If there were no entries grouped by CATEGORIES_ORDER, but we had items, let's group them under Other or output them anyway
    if (!hasEntries && items.length > 0) {
      mdContent += `## [CATEGORY: Other]\n\n`;
      items.forEach(entry => {
        mdContent += `### ${entry.title}\n`;
        mdContent += `- Summary: ${entry.summary || ''}\n`;
        mdContent += `- Official link: ${entry.officialLink || 'N/A'}\n`;
        if (entry.sourceUrl) {
          mdContent += `- Source: ${entry.sourceUrl}\n`;
        }
        mdContent += `- Saved on: ${entry.date || ''}\n\n`;
      });
      mdContent += `---\n\n`;
    }

    return mdContent;
  };

  const handleDownloadVault = () => {
    const mdContent = buildMdContent(vaultItems);
    const blob = new Blob([mdContent.trim() + '\n'], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vault.md';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteEntry = (id) => {
    if (!onDeleteEntry) return;
    const newItems = vaultItems.filter(item => item.id !== id);
    const mdContent = buildMdContent(newItems);
    onDeleteEntry(id, mdContent);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background-base">
      {/* Category Filter Bar */}
      <nav className="bg-surface-panel py-3 px-4 flex gap-2 overflow-x-auto no-scrollbar retro-border-b shrink-0 select-none">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap px-4 py-1 border-2 border-black font-label-caps text-label-caps retro-outset active-press cursor-pointer transition-all ${
                isSelected 
                  ? 'bg-black text-secondary-container' 
                  : 'bg-surface-container-lowest text-black hover:bg-surface-variant'
              }`}
            >
              {cat}
            </button>
          );
        })}
      </nav>

      {/* Main Scrollable Content */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-on-surface-variant border-opacity-30">
            <p className="font-mono-code text-on-surface-variant opacity-60">NO ENTRIES FOUND IN "{selectedCategory}"</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            return (
              <ScrollReveal key={item.id}>
                <article 
                  className={`retro-border p-4 retro-outset space-y-3 bg-surface-panel transition-opacity ${item.locked ? 'opacity-80 grayscale' : ''}`}
                >
                  {/* Header info */}
                  <div className="flex justify-between items-start select-none">
                    <span className="px-2 py-0.5 bg-primary-container text-white retro-border font-label-caps text-[10px] uppercase">
                      {item.category}
                    </span>
                    <span className="font-label-caps text-[10px] text-on-surface-variant">
                      {item.date}
                    </span>
                  </div>

                  {/* Core title and toggle */}
                  <div 
                    onClick={() => !item.locked && toggleExpand(item.id)}
                    className={`flex justify-between items-center cursor-pointer ${item.locked ? 'cursor-not-allowed' : ''}`}
                  >
                    <h2 className="font-headline-md text-headline-md leading-tight text-text-main">
                      {item.title}
                    </h2>
                    {!item.locked && (
                      <span className="material-symbols-outlined transition-transform select-none">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    )}
                    {item.locked && (
                      <span className="material-symbols-outlined text-on-surface-variant select-none">
                        lock
                      </span>
                    )}
                  </div>

                  {/* Expanded guide / source */}
                  {isExpanded && !item.locked && (
                    <div className="space-y-3 pt-2">
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {item.summary || item.text}
                      </p>
                      {item.sourceUrl && (
                        <div className="bg-white retro-border p-2 font-mono-code text-[11px] break-all retro-inset-medium">
                          SRC: <a className="underline text-tertiary" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceUrl}</a>
                        </div>
                      )}
                      <button 
                        onClick={() => setViewingItem(item)}
                        className="w-full py-3 bg-black text-secondary-container font-headline-md retro-border retro-outset active-press cursor-pointer"
                      >
                        [ VIEW MD ]
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm('Delete this entry?')) {
                            handleDeleteEntry(item.id);
                          }
                        }}
                        className="delete-btn"
                        style={{
                          marginTop: '8px',
                          background: '#1a1a1a',
                          color: 'red',
                          border: '2px solid red',
                          padding: '4px 14px',
                          fontFamily: 'Courier New',
                          fontSize: '11px',
                          cursor: 'pointer',
                          width: '100%'
                        }}>
                        [ DELETE ENTRY ]
                      </button>
                    </div>
                  )}

                  {/* Collapsed short excerpt preview */}
                  {!isExpanded && !item.locked && (
                    <p className="font-body-md text-body-md text-on-surface-variant line-clamp-1 opacity-70">
                      {item.summary || item.text}
                    </p>
                  )}
                </article>
              </ScrollReveal>
            );
          })
        )}
      </main>

      {/* Bottom Floating Bar */}
      <div className="bg-background-base retro-border-t p-4 shrink-0 select-none">
        <button 
          onClick={handleDownloadVault}
          className="w-full py-4 bg-black text-secondary-container font-headline-md retro-border retro-outset active-press flex items-center justify-center gap-2 cursor-pointer"
        >
          <span className="material-symbols-outlined">download</span>
          [ DOWNLOAD VAULT.MD ]
        </button>
        <div className="text-center mt-2">
          <p className="font-label-caps text-label-caps text-on-surface-variant opacity-60">
            {vaultItems.length} ITEMS IN VAULT
          </p>
        </div>
      </div>

      {/* View MD Retro Modal */}
      <RetroModal
        isOpen={!!viewingItem}
        onClose={() => setViewingItem(null)}
        title={viewingItem?.title || 'VIEW ENTRY'}
      >
        <div className="space-y-4 font-mono-code text-mono-code text-[12px]">
          <div className="bg-white retro-border p-3 font-mono-code text-[12px] whitespace-pre-wrap retro-inset-medium max-h-[50vh] overflow-y-auto custom-scrollbar select-text">
            {viewingItem?.mdEntry || viewingItem?.summary || viewingItem?.text || 'No content.'}
          </div>
          <div className="flex justify-end pt-2 select-none">
            <button
              onClick={() => setViewingItem(null)}
              className="bg-black text-secondary-container retro-border px-5 py-2 font-label-caps text-[11px] retro-outset active-press cursor-pointer"
            >
              CLOSE
            </button>
          </div>
        </div>
      </RetroModal>
    </div>
  );
}
