import React from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { cleanRobloxAssetId, isRobloxThumbnailApiUrl, resolveRobloxThumbnail } from '../utils/roblox-thumbnails.js';

export default function CatalogImage({ src, codeId, alt, className = '', loading = 'lazy', onResolved, ...props }) {
    const assetId = cleanRobloxAssetId(codeId || src);
    const [imageState, setImageState] = React.useState({
        src: src || '',
        loading: false,
        error: false,
        triedRoblox: false
    });

    React.useEffect(() => {
        let cancelled = false;
        const initialSrc = src || '';
        const shouldResolveFirst = !initialSrc || isRobloxThumbnailApiUrl(initialSrc);

        if (!shouldResolveFirst) {
            setImageState({
                src: initialSrc,
                loading: false,
                error: false,
                triedRoblox: false
            });
            return () => {
                cancelled = true;
            };
        }

        if (!assetId) {
            setImageState({
                src: initialSrc,
                loading: false,
                error: !initialSrc,
                triedRoblox: true
            });
            return () => {
                cancelled = true;
            };
        }

        setImageState({
            src: '',
            loading: true,
            error: false,
            triedRoblox: true
        });

        resolveRobloxThumbnail(assetId)
            .then((resolvedSrc) => {
                if (cancelled) return;
                setImageState({
                    src: resolvedSrc,
                    loading: false,
                    error: !resolvedSrc,
                    triedRoblox: true
                });
                if (resolvedSrc && onResolved) onResolved(resolvedSrc);
            })
            .catch(() => {
                if (cancelled) return;
                setImageState({
                    src: '',
                    loading: false,
                    error: true,
                    triedRoblox: true
                });
            });

        return () => {
            cancelled = true;
        };
    }, [assetId, onResolved, src]);

    const resolveAfterError = React.useCallback(() => {
        if (!assetId || imageState.triedRoblox) {
            setImageState((current) => ({
                ...current,
                src: '',
                loading: false,
                error: true
            }));
            return;
        }

        setImageState((current) => ({
            ...current,
            loading: true,
            error: false,
            triedRoblox: true
        }));

        resolveRobloxThumbnail(assetId)
            .then((resolvedSrc) => {
                setImageState({
                    src: resolvedSrc,
                    loading: false,
                    error: !resolvedSrc,
                    triedRoblox: true
                });
                if (resolvedSrc && onResolved) onResolved(resolvedSrc);
            })
            .catch(() => {
                setImageState({
                    src: '',
                    loading: false,
                    error: true,
                    triedRoblox: true
                });
            });
    }, [assetId, imageState.triedRoblox, onResolved]);

    if (imageState.loading) {
        return (
            <div className={`${className} flex items-center justify-center bg-black/50 text-zinc-500`}>
                <RefreshCw className="h-5 w-5 animate-spin" />
            </div>
        );
    }

    if (imageState.error || !imageState.src) {
        return (
            <div className={`${className} flex flex-col items-center justify-center gap-2 bg-black/50 px-3 text-center text-zinc-500`}>
                <ImageOff className="h-6 w-6" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Image unavailable</span>
            </div>
        );
    }

    return (
        <img
            {...props}
            src={imageState.src}
            alt={alt}
            loading={loading}
            onError={resolveAfterError}
            className={className}
        />
    );
}
