import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

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

export default function MusicCard({ code, isFavorite, onToggleFavorite, isAdmin, onRefresh, onContextMenu }) {
    const [copied, setCopied] = useState(false);
    const isHidden = code.hidden;

    const handleContextMenu = (e) => {
        if (!isAdmin || !onContextMenu) return;
        onContextMenu(e, { id: code.id, type: 'music', isHidden, name: code.title });
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
            className={`music-card facebase-card bg-[var(--card-light)] rounded-xl shadow-xl ring-1 ring-[var(--border)] overflow-hidden flex flex-col p-1.5 space-y-1.5 !w-full relative hover:ring-[var(--gold2)]/30 transition-all duration-200 hover:shadow-2xl hover:-translate-y-0.5 ${isHidden ? 'opacity-40 grayscale' : ''}`}
        >
            <div className="favorite-container">
                <button
                    className="favorite-btn"
                    onClick={() => onToggleFavorite(code.id)}
                >
                    {isFavorite(code.id) ? '❤️' : '🖤'}
                </button>
            </div>

            <div className="text-xs text-[var(--ink)] font-medium px-1 h-8 flex items-center justify-start gap-1">
                <span className="truncate" title={code.title}>{code.title}</span>
                {code.pitch && code.pitch !== 0 && (
                    <span className="ml-2 text-xs font-semibold text-cyan-400" title={`Pitch: ${code.pitch}`}>
                        [PITCH]
                    </span>
                )}
            </div>

            <img
                src={iconSrc}
                alt={code.category}
                loading="lazy"
                className="w-full h-auto object-cover aspect-square rounded-md"
            />

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
        </div>
    );
}
