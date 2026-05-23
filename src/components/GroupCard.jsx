import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, RefreshCw, Layers, Trash2, X, Smile } from 'lucide-react';
import { reloadRobloxImage } from '../utils/image-reload';
import { getFlagEmoji } from '../utils/iso-utils.js';
import CatalogImage from './CatalogImage.jsx';

/**
 * GroupCard — Displays a user-created group.
 * Features a stacked visual to indicate multiple items.
 */
export default function GroupCard({ group, allItems, onDelete, isFavorite, onToggleFavorite, isFacebaseTab, isAdmin, onContextMenu }) {
    const [copied, setCopied] = useState(false);
    const [showVariants, setShowVariants] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [overrideSrc, setOverrideSrc] = useState(null);

    // Resolve items in this group
    const items = group.itemIds
        .map(id => allItems.find(item => item.id === id))
        .filter(Boolean);

    // activeVariant state
    const [activeVariant, setActiveVariant] = useState(() => 
        items.find(i => i.id === group.coverItemId) || items[0]
    );

    // Sync state when data reloads
    React.useEffect(() => {
        const next = items.find(i => i.id === group.coverItemId) || items[0];
        setActiveVariant(next);
    }, [group.id, group.coverItemId, items.length]);

    if (items.length === 0) return null;

    const isHidden = activeVariant.hidden;
    const hasVariants = items.length > 1;
    const otherVariantsCount = items.length - 1;

    const handleContextMenu = (e) => {
        if (!isAdmin || !onContextMenu) return;
        onContextMenu(e, { id: activeVariant.id, type: activeVariant.type, isHidden });
    };

    const handleCycle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentIndex = items.findIndex(i => i.id === activeVariant.id);
        const nextIndex = (currentIndex + 1) % items.length;
        setActiveVariant(items[nextIndex]);
        setOverrideSrc(null);
    };

    const handleReloadImage = async (e) => {
        e.stopPropagation();
        const assetId = activeVariant.codeId;
        if (!assetId || reloading) return;
        setReloading(true);
        try {
            const newSrc = await reloadRobloxImage(assetId);
            if (newSrc) setOverrideSrc(newSrc);
        } finally {
            setReloading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(activeVariant.codeId || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="relative group/stack w-full h-full">
            {/* Stack Visual Effect (Peeking Cards) */}
            {hasVariants && (
                <>
                    <div 
                        className="absolute inset-0 rounded-xl bg-[var(--card-light)] ring-1 ring-[var(--border)] opacity-40" 
                        style={{ transform: 'rotate(3deg) translateY(-4px) scale(0.98)', zIndex: 0 }}
                    />
                    <div 
                        className="absolute inset-0 rounded-xl bg-[var(--card-light)] ring-1 ring-[var(--border)] opacity-60" 
                        style={{ transform: 'rotate(-2deg) translateY(-2px) scale(0.99)', zIndex: 1 }}
                    />
                </>
            )}

            {/* Main Card Container */}
            <div 
                onContextMenu={handleContextMenu}
                className={`relative z-10 music-card facebase-card bg-[var(--card-light)] rounded-xl shadow-xl ring-1 ring-[var(--border)] overflow-hidden flex flex-col p-1.5 space-y-1.5 !w-full group/card hover:ring-[var(--gold2)]/30 transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5 ${isHidden ? 'opacity-40 grayscale' : ''} ${showVariants ? 'show-variants' : ''}`}
            >
                
                {/* Header: Favorites and Delete */}
                <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1.5">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(group.id); }}
                        className="w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-red-400 hover:bg-red-500/20 transition-all backdrop-blur-sm opacity-0 group-hover/card:opacity-100"
                        title="Delete custom group"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="favorite-container !relative !top-0 !right-0 !bg-black/40 !w-7 !h-7 !backdrop-blur-sm">
                        <button
                            className="favorite-btn"
                            onClick={() => onToggleFavorite(activeVariant.id)}
                        >
                            {isFavorite(activeVariant.id) ? '❤️' : '🖤'}
                        </button>
                    </div>
                </div>

                <div className="variant-display-container">
                    {/* Standardized Header Icon & Title */}
                    <div className="text-xs text-[var(--ink)] font-medium px-1 h-8 flex items-center justify-start gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[var(--gold2)] flex-shrink-0" />
                        {isFacebaseTab && getFlagEmoji(activeVariant.group) && (
                            <span className="text-xl flag-emoji flex-shrink-0" title={activeVariant.group}>
                                {getFlagEmoji(activeVariant.group)}
                            </span>
                        )}
                        <span className="truncate main-display-name">{group.name}</span>
                        {hasVariants && (
                            <span className="text-[10px] font-bold text-zinc-500 uppercase flex-shrink-0">
                                ({items.length})
                            </span>
                        )}
                    </div>

                    {/* Main Image View */}
                    <div className="relative">
                        <CatalogImage
                            src={overrideSrc || activeVariant.src}
                            codeId={activeVariant.codeId}
                            alt={activeVariant.displayName || activeVariant.title}
                            loading="lazy"
                            className="w-full h-auto object-cover aspect-square rounded-md main-image"
                        />
                        
                        {/* Reload Action */}
                        <button
                            onClick={handleReloadImage}
                            title="Reload image from Roblox"
                            className={`absolute top-1.5 left-1.5 w-7 h-7 flex items-center justify-center rounded-md bg-black/60 text-zinc-300 opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-white hover:bg-black/80 z-10 ${reloading ? 'animate-spin' : ''}`}
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>

                        {/* Cycle button for Facebases, otherwise Variant Gallery button */}
                        {hasVariants && (
                            isFacebaseTab ? (
                                <button 
                                    className={`variant-toggle-btn absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-all backdrop-blur-md shadow-lg border border-white/20 bg-black/60 text-white hover:bg-black/80`}
                                    onClick={handleCycle}
                                    title="Cycle Faces"
                                >
                                    <Smile className="w-5 h-5" />
                                </button>
                            ) : (
                                <button
                                    className="variant-indicator-btn"
                                    title={`Show all ${items.length} items`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowVariants(true);
                                    }}
                                >
                                    {otherVariantsCount}+
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* Variants Gallery Overlay */}
                <AnimatePresence>
                    {hasVariants && showVariants && (
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="variants-gallery-overlay" 
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowVariants(false) }} 
                            style={{ opacity: 1, visibility: 'visible' }}
                        >
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="variants-gallery-container" 
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-[var(--gold2)]" />
                                        <h4 className="text-sm font-semibold text-zinc-100">{group.name}</h4>
                                    </div>
                                    <X className="w-4 h-4 text-zinc-400 cursor-pointer hover:text-white" onClick={() => setShowVariants(false)} />
                                </div>
                                <div className="variants-grid">
                                    {items.map(item => {
                                        const isActive = activeVariant.id === item.id;
                                        return (
                                            <div
                                                key={item.id}
                                                className={`variant-thumbnail ${isActive ? 'active' : ''}`}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    setActiveVariant(item);
                                                    setShowVariants(false);
                                                    setOverrideSrc(null);
                                                }}
                                            >
                                                <CatalogImage src={item.src} codeId={item.codeId} alt={item.displayName || item.title} loading="lazy" className="w-full h-auto object-cover aspect-square rounded-md" />
                                                <span className="variant-name truncate px-1">
                                                    {item.displayName || item.title}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer with Code Input and Copy Action */}
                <div className="flex items-center gap-1.5 p-1 card-footer">
                    <input
                        readOnly
                        type="text"
                        value={activeVariant.codeId || ''}
                        placeholder="…"
                        className="flex-grow w-0 h-8 px-2 text-xs dark-input rounded-md main-code-id-input"
                    />
                    <button
                        onClick={handleCopy}
                        className={`copy-btn flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md border transition-all ${copied
                            ? 'bg-green-500/20 text-green-500 border-green-500/50'
                            : 'bg-[var(--card-lighter)] text-[var(--ink)] border-[var(--border)] hover:bg-[var(--card-hover)]'
                            }`}
                        title="Copy Code"
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    );
}
