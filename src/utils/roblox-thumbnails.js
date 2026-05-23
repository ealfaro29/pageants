const ROBLOX_THUMBNAIL_API = 'https://thumbnails.roproxy.com/v1/assets';
const thumbnailCache = new Map();

export function cleanRobloxAssetId(value) {
    if (value === null || value === undefined) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    const queryMatch = raw.match(/[?&]assetIds?=([^&\s]+)/i);
    if (queryMatch) {
        return queryMatch[1].replace(/\D/g, '');
    }

    const numberMatch = raw.match(/\d{5,}/);
    return numberMatch ? numberMatch[0] : '';
}

export function isRobloxThumbnailApiUrl(src) {
    if (!src) return false;
    return /https:\/\/thumbnails\.(roblox|roproxy)\.com\/v1\/assets/i.test(src)
        || /https:\/\/www\.roblox\.com\/asset-thumbnail\/image/i.test(src);
}

export function getRobloxThumbnailApiUrl(assetId, size = '420x420') {
    const cleanId = cleanRobloxAssetId(assetId);
    if (!cleanId) return '';
    return `${ROBLOX_THUMBNAIL_API}?assetIds=${cleanId}&size=${size}&format=Png&isCircular=false`;
}

export async function resolveRobloxThumbnail(assetId, size = '420x420') {
    const cleanId = cleanRobloxAssetId(assetId);
    if (!cleanId) return '';

    const cacheKey = `${cleanId}:${size}`;
    if (thumbnailCache.has(cacheKey)) {
        return thumbnailCache.get(cacheKey);
    }

    const request = fetch(getRobloxThumbnailApiUrl(cleanId, size))
        .then(async (response) => {
            if (!response.ok) {
                throw new Error(`Roblox thumbnail lookup failed with ${response.status}`);
            }
            const payload = await response.json();
            const imageUrl = payload?.data?.[0]?.imageUrl;
            return typeof imageUrl === 'string' ? imageUrl : '';
        })
        .catch((error) => {
            thumbnailCache.delete(cacheKey);
            throw error;
        });

    thumbnailCache.set(cacheKey, request);
    return request;
}
