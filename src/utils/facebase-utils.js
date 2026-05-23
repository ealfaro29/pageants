export function groupFacebaseVariants(items) {
    const grouped = {};
    const variantRegex = /^(.*?)( S| X)$/i;

    for (const item of items) {
        if (!item) continue;
        
        const displayName = String(item.displayName || item.name || item.variant || item.id || 'Untitled facebase').trim();
        let baseDisplayName = displayName;
        const match = displayName.match(variantRegex);

        if (match) {
            baseDisplayName = match[1].trim();
        }

        const group = String(item.group || 'GENERAL').trim().toUpperCase();
        const key = `${group}-${baseDisplayName}`;

        if (!grouped[key]) {
            grouped[key] = {
                group,
                baseDisplayName: baseDisplayName,
                items: []
            };
        }

        grouped[key].items.push({ ...item, displayName, group });
    }

    return Object.values(grouped).map(g => {
        const variants = {};
        const itemsList = g.items;
        
        itemsList.forEach(item => {
            const match = String(item.displayName || '').match(variantRegex);
            const variant = match ? match[2].trim().toUpperCase() : 'default';
            
            // If this variant slot is already occupied, use a unique key to prevent disappearance
            if (variants[variant]) {
                variants[`${variant}_${item.id}`] = item;
            } else {
                variants[variant] = item;
            }
        });

        return {
            group: g.group,
            baseDisplayName: g.baseDisplayName,
            variants,
            defaultItem: variants['default'] || itemsList[0]
        };
    });
}
