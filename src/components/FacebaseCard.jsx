import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Check, RefreshCw, Layers, Smile, Pencil, Save, X } from 'lucide-react';
import { reloadRobloxImage } from '../utils/image-reload';
import { getFlagEmoji, getCountryList } from '../utils/iso-utils.js';
import { updateItemImageUrl, updateFacebaseGroup } from '../utils/data-hooks';
import CatalogImage from './CatalogImage.jsx';

/**
 * FacebaseCard — Displays a facebase variant group.
 * Features a single "Cycle" button to toggle between expressions (Main, Closed, Side).
 */
const FacebaseCard = ({ group, isFavorite, onToggleFavorite, isAdmin, showHidden, onRefresh, onContextMenu }) => {
    const variantsList = Object.values(group.variants).filter(Boolean);
    const [activeVariant, setActiveVariant] = useState(group.defaultItem);
    const [reloading, setReloading] = useState(false);
    const [overrideSrc, setOverrideSrc] = useState(null);

    // Sync activeVariant when group/variants change
    React.useEffect(() => {
        setActiveVariant(group.defaultItem);
    }, [group.defaultItem.id]);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(group.baseDisplayName);
    const [editCountry, setEditCountry] = useState(group.group);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    const isHidden = activeVariant.hidden;

    const handleContextMenu = (e) => {
        if (!isAdmin || !onContextMenu) return;
        onContextMenu(e, { 
            id: activeVariant.id, 
            type: 'facebase', 
            isHidden,
            onEdit: () => setIsEditing(true)
        });
    };

    const hasVariants = variantsList.length > 1;

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editName.trim() || !editCountry.trim() || saving) return;
        setSaving(true);
        try {
            await updateFacebaseGroup(variantsList, editName.trim(), editCountry.trim().toUpperCase());
            setIsEditing(false);
            if (onRefresh) onRefresh();
        } finally {
            setSaving(false);
        }
    };

    const handleReloadImage = async (e) => {
        e.stopPropagation();
        const assetId = activeVariant.codeId;
        const variantId = activeVariant.id;
        const variantType = activeVariant.type || 'facebase';

        if (!assetId || reloading) return;
        setReloading(true);
        try {
            const newSrc = await reloadRobloxImage(assetId);
            if (newSrc) {
                setOverrideSrc(newSrc);
                if (isAdmin) {
                    try {
                        await updateItemImageUrl(variantType, variantId, newSrc);
                    } catch (error) {
                        console.warn('Image refreshed locally but could not be saved.', error);
                    }
                }
            }
        } finally {
            setReloading(false);
        }
    };

    const handleCopy = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(activeVariant.codeId || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    /**
     * Cycles through: Main -> Closed (X) -> Side (S) -> Main
     */
    const handleCycle = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const currentId = activeVariant.id;
        const main = group.defaultItem;
        const x = group.variants.X;
        const s = group.variants.S;

        let next = main;
        if (currentId === main.id) {
            next = x || s || main;
        } else if (x && currentId === x.id) {
            next = s || main;
        } else if (s && currentId === s.id) {
            next = main;
        }

        setActiveVariant(next);
        setOverrideSrc(null);
    };

    // Collect all variant IDs for toggling favorites on the group
    const allVariantIds = variantsList.map(v => v.id);

    // Flag emoji
    const flagEmoji = getFlagEmoji(activeVariant.group);
    let flagTag = flagEmoji ? (
        <span className="text-xl flag-emoji flex-shrink-0" title={activeVariant.group}>{flagEmoji}</span>
    ) : (
        <span className="text-[10px] text-zinc-500 flex-shrink-0">{activeVariant.group}</span>
    );

    return (
        <div className="relative group/stack w-full h-full">
            {/* Stack Visual Effect (Peeking Cards) */}
            {hasVariants && (
                <>
                    <div 
                        className="absolute inset-0 rounded-xl bg-[var(--card-light)] ring-1 ring-[var(--border)] opacity-40" 
                        style={{ transform: 'rotate(2deg) translateY(-3px) scale(0.985)', zIndex: 0 }}
                    />
                    <div 
                        className="absolute inset-0 rounded-xl bg-[var(--card-light)] ring-1 ring-[var(--border)] opacity-60" 
                        style={{ transform: 'rotate(-1.5deg) translateY(-1.5px) scale(0.99)', zIndex: 1 }}
                    />
                </>
            )}

            <div className="relative h-full">
                <div 
                    onContextMenu={handleContextMenu}
                    className={`relative z-10 music-card facebase-card bg-[var(--card-light)] rounded-xl shadow-xl ring-1 ring-[var(--border)] overflow-hidden flex flex-col p-1.5 space-y-1.5 !w-full group/card hover:ring-[var(--gold2)]/30 transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5 ${isHidden ? 'opacity-40 grayscale' : ''}`}
                >
                    
                    {/* Header: Favorites */}
                    <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1.5">
                        <div className="favorite-container !relative !top-0 !right-0 !bg-black/40 !w-7 !h-7 !backdrop-blur-sm">
                            <button
                                className="favorite-btn"
                                onClick={() => onToggleFavorite(activeVariant.id, allVariantIds)}
                            >
                                {isFavorite(activeVariant.id) ? '❤️' : '🖤'}
                            </button>
                        </div>
                        {/* Admin Edit Button */}
                        {isAdmin && (
                            <div className="favorite-container !relative !top-0 !right-0 !bg-black/40 !w-7 !h-7 !backdrop-blur-sm">
                                <button
                                    className="favorite-btn flex items-center justify-center p-0"
                                    onClick={(e) => { e.stopPropagation(); setIsEditing(!isEditing); }}
                                    title="Edit Name/Country"
                                >
                                    <Pencil className="w-3.5 h-3.5 text-zinc-300" />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="variant-display-container">
                        {/* Standardized Header Icon & Title */}
                        <div className="text-xs text-[var(--ink)] font-medium px-1 h-8 flex items-center justify-start gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-[var(--gold2)] flex-shrink-0" />
                            {flagTag}
                            <span className="truncate main-display-name">{group.baseDisplayName}</span>
                            {hasVariants && (
                                <span className="text-[10px] font-bold text-zinc-500 uppercase flex-shrink-0">
                                    ({variantsList.length})
                                </span>
                            )}
                        </div>

                        {/* Main Image View */}
                        <div className="relative">
                            <CatalogImage
                                src={overrideSrc || activeVariant.src}
                                codeId={activeVariant.codeId}
                                alt={group.baseDisplayName}
                                loading="lazy"
                                className="w-full h-auto object-cover aspect-square rounded-md main-image"
                            />
                            
                            {/* Single Cycle Button */}
                            {hasVariants && (
                                <button 
                                    className={`variant-toggle-btn absolute bottom-2 right-2 w-9 h-9 rounded-full flex items-center justify-center transition-all backdrop-blur-md shadow-lg border border-white/20 ${activeVariant.id !== group.defaultItem.id ? 'bg-[var(--gold2)] text-black' : 'bg-black/60 text-white hover:bg-black/80'}`}
                                    onClick={handleCycle}
                                    title="Cycle Expressions"
                                >
                                    <Smile className="w-5 h-5" />
                                </button>
                            )}

                            {/* Reload Action */}
                            <button
                                onClick={handleReloadImage}
                                title="Reload image from Roblox"
                                className={`absolute top-1.5 left-1.5 w-7 h-7 flex items-center justify-center rounded-md bg-black/60 text-zinc-300 opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-white hover:bg-black/80 z-10 ${reloading ? 'animate-spin' : ''}`}
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Edit Overlay */}
                    <AnimatePresence>
                        {isEditing && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className="absolute inset-0 z-30 bg-[#1a1c24]/95 backdrop-blur-md flex flex-col p-4 space-y-3"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                    <span className="text-xs font-bold text-[var(--gold2)] uppercase tracking-widest">Edit Face</span>
                                    <button onClick={() => setIsEditing(false)} className="text-zinc-500 hover:text-white">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-4 pt-2">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block">Base Name</label>
                                        <input 
                                            type="text" 
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            className="w-full bg-black/40 border border-white/10 rounded-md h-9 px-3 text-sm text-white focus:outline-none focus:border-[var(--gold2)]"
                                            placeholder="Natural..."
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-1 block">Country / Category</label>
                                        <div className="relative">
                                            <select 
                                                value={editCountry}
                                                onChange={e => setEditCountry(e.target.value)}
                                                className="w-full bg-black/40 border border-white/10 rounded-md h-9 px-3 text-sm text-white focus:outline-none focus:border-[var(--gold2)] appearance-none cursor-pointer"
                                            >
                                                <option value="" disabled>Select a country...</option>
                                                {getCountryList().map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                ))}
                                                {/* Allow "other" categories if it's already one and not in list */}
                                                {!getCountryList().includes(editCountry) && editCountry && (
                                                    <option value={editCountry}>{editCountry} (Existing)</option>
                                                )}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                                                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                            </div>
                                        </div>
                                    </div>
                                    <button 
                                        disabled={saving}
                                        onClick={handleSaveEdit}
                                        className="w-full h-10 bg-[var(--gold2)] text-black font-bold text-xs uppercase tracking-widest rounded-lg hover:brightness-110 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                                    >
                                        {saving ? <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                                        {saving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
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
        </div>
    );
};

export default FacebaseCard;
