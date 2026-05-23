import React, { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { reloadRobloxImage } from '../utils/image-reload';
import { updateItemImageUrl } from '../utils/data-hooks';
import CatalogImage from './CatalogImage.jsx';

export default function Card({ id, displayName, group, imageSrc, codeId, isFavorite, onToggleFavorite, type = 'avatar', isAdmin, isHidden, onRefresh, onContextMenu }) {
    const [copied, setCopied] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [overrideSrc, setOverrideSrc] = useState(null);

    const handleContextMenu = (e) => {
        if (!isAdmin || !onContextMenu) return;
        onContextMenu(e, { id, type, isHidden });
    };

    const handleCopy = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(codeId || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleReloadImage = async (e) => {
        e.stopPropagation();
        if (!codeId || reloading) return;
        setReloading(true);
        try {
            const newSrc = await reloadRobloxImage(codeId);
            if (newSrc) {
                setOverrideSrc(newSrc);
                if (isAdmin) {
                    try {
                        await updateItemImageUrl(type, id, newSrc);
                    } catch (error) {
                        console.warn('Image refreshed locally but could not be saved.', error);
                    }
                }
            }
        } finally {
            setReloading(false);
        }
    };

    return (
        <div
            onContextMenu={handleContextMenu}
            className={`music-card facebase-card bg-[var(--card-light)] rounded-xl shadow-xl ring-1 ring-[var(--border)] overflow-hidden flex flex-col p-1.5 space-y-1.5 !w-full relative group/card hover:ring-[var(--gold2)]/30 transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5 ${isHidden ? 'opacity-40 grayscale' : ''}`}>
            
            <div className="favorite-container">
                <button
                    className="favorite-btn"
                    onClick={() => onToggleFavorite(id)}
                >
                    {isFavorite ? '❤️' : '🖤'}
                </button>
            </div>

            <div className="text-xs text-[var(--ink)] font-medium px-1 h-8 flex items-center justify-start gap-1">
                <span className="truncate">{displayName} ({group})</span>
            </div>

            <div className="relative">
                <CatalogImage
                    src={overrideSrc || imageSrc}
                    codeId={codeId}
                    alt={displayName}
                    loading="lazy"
                    className="w-full h-auto object-cover aspect-square rounded-md"
                />
                <button
                    onClick={handleReloadImage}
                    title="Reload image from Roblox"
                    className={`absolute top-1.5 left-1.5 w-7 h-7 flex items-center justify-center rounded-md bg-black/60 text-zinc-300 opacity-0 group-hover/card:opacity-100 transition-opacity hover:text-white hover:bg-black/80 ${reloading ? 'animate-spin' : ''}`}
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="flex items-center gap-1.5 p-1">
                <input
                    readOnly
                    type="text"
                    value={codeId || ''}
                    placeholder="…"
                    className="flex-grow w-0 h-8 px-2 text-xs dark-input rounded-md"
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
    );
}
