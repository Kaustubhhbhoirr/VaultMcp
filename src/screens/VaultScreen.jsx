import React, { useState } from 'react';

export default function VaultScreen({ vaultItems }) {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [expandedIds, setExpandedIds] = useState(new Set([1])); // default expand the first entry

  const categories = ['ALL', 'AI TOOLS', 'PROMPTS', 'APIS', 'FRAMEWORKS', 'UI DESIGN', 'OTHER'];

  const filteredItems = selectedCategory === 'ALL'
    ? vaultItems
    : vaultItems.filter(item => item.category.toUpperCase() === selectedCategory);

  const toggleExpand = (id) => {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedIds(next);
  };

  const handleDownloadVault = () => {
    // Generate simple markdown structure
    const mdContent = vaultItems.map(item => {
      return `## ${item.title} [${item.category}] - ${item.date}
${item.summary || item.text}
Source: ${item.sourceUrl || 'N/A'}
---`;
    }).join('\n\n');

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vault.md';
    link.click();
    URL.revokeObjectURL(url);
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
      <main className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 pb-24">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-on-surface-variant border-opacity-30">
            <p className="font-mono-code text-on-surface-variant opacity-60">NO ENTRIES FOUND IN "{selectedCategory}"</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isExpanded = expandedIds.has(item.id);
            return (
              <article 
                key={item.id} 
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
                      onClick={() => alert(`Content of:\n${item.title}\n\n${item.summary}`)}
                      className="w-full py-3 bg-black text-secondary-container font-headline-md retro-border retro-outset active-press cursor-pointer"
                    >
                      [ VIEW MD ]
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
            );
          })
        )}
      </main>

      {/* Bottom Floating Bar */}
      <div className="fixed bottom-14 left-0 w-full bg-background-base retro-border-t p-4 z-40 max-w-[375px] mx-auto left-1/2 -translate-x-1/2 select-none">
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
    </div>
  );
}
