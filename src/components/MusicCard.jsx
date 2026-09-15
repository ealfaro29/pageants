import React, { useState } from 'react';
import { Copy, Check, Pencil } from 'lucide-react';

export const getMusicIconPath = (category) => {
    const defaultIcon = 'photos/app/music.jpg';
    const categoryMap = {
        'Chill & LoFi': 'photos/app/music/chill.webp',
        'Electronic & Remixes': 'photos/app/music/electro.webp',
        'Thematic & Mood': 'photos/app/music/mood.webp',
        'Pop Hits': 'photos/app/music/pop.webp',
        'Runway & Pageant': 'photos/app/music/runway.webp',
        'Upbeat & Energetic': 'photos/app/music/upbeat.webp',
        'World & Cultural': 'photos/app/music/world.webp',
    };

    return categoryMap[category] || defaultIcon;
};

export default function MusicCard({ code, isFavorite, onToggleFavorite, isAdmin, hideCodes = false, onRefresh, onContextMenu, onEdit }) {
    const [copied, setCopied] = useState(false);
    const isHidden = code.hidden;

    const handleContextMenu = (e) => {
        if (!isAdmin || !onContextMenu) return;
        onContextMenu(e, { 
            id: code.id, 
            type: 'music', 
            isHidden, 
            name: code.title,
            onEdit: onEdit ? () => onEdit({ id: code.id, type: 'music', name: code.title, currentName: code.title }) : undefined
        });
    };

    const handleCopy = (e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(code.id || '');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const iconSrc = getMusicIconPath(code.category);

    return (
        <div 
            onContextMenu={handleContextMenu}
            className={`music-card facebase-card bg-[var(--card-light)] rounded-xl shadow-xl ring-1 ring-[var(--border)] overflow-hidden flex flex-col p-1.5 space-y-1.5 !w-full relative group/card hover:ring-[var(--gold2)]/30 transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5 ${isHidden ? 'opacity-40 grayscale' : ''}`}
        >
            <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1.5">
                <div className="favorite-container !relative !top-0 !right-0 !bg-black/40 !w-7 !h-7 !backdrop-blur-sm">
                    <button
                        className="favorite-btn"
                        onClick={() => onToggleFavorite(code.id)}
                    >
                        {isFavorite(code.id) ? '❤️' : '🖤'}
                    </button>
                </div>
                {isAdmin && onEdit && (
                    <div className="favorite-container !relative !top-0 !right-0 !bg-black/40 !w-7 !h-7 !backdrop-blur-sm">
                        <button
                            className="favorite-btn flex items-center justify-center p-0"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit({ id: code.id, type: 'music', name: code.title, currentName: code.title });
                            }}
                            title="Edit Title"
                        >
                            <Pencil className="w-3.5 h-3.5 text-zinc-300" />
                        </button>
                    </div>
                )}
            </div>

            <div className="text-xs text-[var(--ink)] font-medium px-1 h-8 flex items-center justify-start gap-1">
                <span className="truncate" title={code.title}>{code.title}</span>
                {code.pitch && code.pitch !== 0 && (
                    <span className="ml-2 text-xs font-semibold text-cyan-400" title={`Pitch: ${code.pitch}`}>
                        [PITCH]
                    </span>
                )}
            </div>

            <div className="relative">
                <img
                    src={iconSrc}
                    alt={code.category}
                    loading="lazy"
                    className="w-full h-auto object-cover aspect-square rounded-md"
                />
                {hideCodes && (
                    <button
                        onClick={handleCopy}
                        title="Copy ID"
                        className={`absolute bottom-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-md border backdrop-blur-md opacity-0 group-hover/card:opacity-100 transition-all z-10 ${
                            copied
                                ? 'bg-green-500/80 text-white border-green-500 opacity-100'
                                : 'bg-black/60 text-zinc-300 border-white/10 hover:text-white hover:bg-black/80'
                        }`}
                    >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                )}
            </div>

            {!hideCodes && (
                <div className="flex items-center gap-1.5 p-1">
                    <input
                        readOnly
                        type="text"
                        value={code.id || ''}
                        placeholder={code.artist || 'Unknown Artist'}
                        className="flex-grow w-0 h-8 px-2 text-xs dark-input rounded-md"
                        title={`Artist: ${code.artist || 'Unknown Artist'}`}
                    />
                    <button
                        onClick={handleCopy}
                        className={`copy-btn flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md border transition-all ${copied
                            ? 'bg-green-500/20 text-green-500 border-green-500/50'
                            : 'bg-[var(--card-lighter)] text-[var(--ink)] border-[var(--border)] hover:bg-[var(--card-hover)]'
                            }`}
                        title="Copy ID"
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                </div>
            )}
        </div>
    );
}
