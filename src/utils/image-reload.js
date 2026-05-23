import { resolveRobloxThumbnail } from './roblox-thumbnails.js';

export async function reloadRobloxImage(assetId) {
    if (!assetId) return null;
    return resolveRobloxThumbnail(assetId);
}
