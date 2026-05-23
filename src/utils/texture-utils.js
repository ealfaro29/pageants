// src/utils/texture-utils.js
// Extracted from legacy tabs/textures.js

export function groupTextureVariants(textureItems) {
    const grouped = {};

    textureItems.forEach(item => {
        if (!item || typeof item !== 'object') return;

        const displayName = String(item.displayName || item.name || item.baseName || item.id || 'Untitled texture').trim();
        let groupingKey = item.baseName;

        if (!groupingKey) {
            const parts = displayName.split(' ');
            if (parts.length > 1) {
                parts.pop();
                groupingKey = parts.join(' ');
            } else {
                groupingKey = displayName;
            }
        }

        groupingKey = String(groupingKey || displayName).trim();
        const normalizedKey = groupingKey.toLowerCase();

        if (!grouped[normalizedKey]) {
            grouped[normalizedKey] = {
                group: item.group || 'General',
                baseName: groupingKey,
                mainVariant: { ...item, displayName },
                variants: [{ ...item, displayName }]
            };
        } else {
            grouped[normalizedKey].variants.push({ ...item, displayName });
        }
    });

    return Object.values(grouped);
}
