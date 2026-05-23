// src/utils/data-hooks.js
// Extracted from legacy data-loader.js

import { getRobloxThumbnailUrl } from './roblox-legacy.js';
import { auth, db } from '../core/firebase-config.js';
import { collection, getDocs, updateDoc, doc, writeBatch } from "firebase/firestore";
import { getIsoCode, ISO_MAP } from './iso-utils.js';

const CATALOG_COLLECTIONS = ['textures', 'facebases', 'avatar', 'music'];

function normalizeText(...values) {
    const value = values.find(current => current !== null && current !== undefined && String(current).trim());
    return value ? String(value).trim() : '';
}

function normalizeCodeId(item) {
    return normalizeText(item.robloxId, item.codeId, item.assetId, item.idCode, item.code);
}

function normalizeImageSrc(item, codeId) {
    return normalizeText(
        item.remoteUrl,
        item.imageUrl,
        item.thumbnailUrl,
        item.thumbUrl,
        item.src,
        item.url
    ) || getRobloxThumbnailUrl(codeId);
}

function buildCollectionError(collectionName, error) {
    const wrapped = new Error(`${collectionName}: ${error.code || error.name || 'error'} - ${error.message || error}`);
    wrapped.collectionName = collectionName;
    wrapped.originalError = error;
    wrapped.code = error.code || 'catalog-load-error';
    return wrapped;
}

async function readCatalogCollection(collectionName, currentUser) {
    try {
        return await getDocs(collection(db, collectionName));
    } catch (error) {
        if (error?.code === 'permission-denied' && currentUser?.getIdToken) {
            await currentUser.getIdToken(true);
            try {
                return await getDocs(collection(db, collectionName));
            } catch (retryError) {
                throw buildCollectionError(collectionName, retryError);
            }
        }
        throw buildCollectionError(collectionName, error);
    }
}

/**
 * Updates a Facebase group (multiple variants) in Firestore.
 * @param {Array} variantItems - Array of variant objects { id, displayName }
 * @param {string} newBaseName - New name for the face (e.g. "Natural")
 * @param {string} newCountry - New country code (e.g. "BRAZIL")
 */
export async function updateFacebaseGroup(variantItems, newBaseName, newCountry) {
    if (!variantItems || !newBaseName || !newCountry) return;

    const batch = writeBatch(db);
    
    variantItems.forEach(item => {
        const itemRef = doc(db, 'facebases', item.id);
        
        // Determine the new display name: "BaseName", "BaseName S", or "BaseName X"
        let finalDisplayName = newBaseName;
        if (item.displayName.toUpperCase().endsWith(' S')) finalDisplayName += ' S';
        else if (item.displayName.toUpperCase().endsWith(' X')) finalDisplayName += ' X';

        batch.update(itemRef, {
            displayName: finalDisplayName,
            name: finalDisplayName,
            variant: finalDisplayName,
            group: newCountry.toUpperCase(),
            category: newCountry.toUpperCase(),
            lastEdited: new Date().toISOString()
        });
    });

    try {
        console.log(`DB_BATCH: Committing batch for ${variantItems.length} items...`);
        await batch.commit();
        console.log(`DB_BATCH: ✅ Successfully updated ${variantItems.length} facebase variants.`);
    } catch (error) {
        console.error("DB_BATCH: ❌ Error updating facebase group. ID mismatch?", error);
        throw error;
    }
}
/**
 * Used for "healing" broken image links.
 * @param {string} type - 'textures', 'facebases', 'avatar'
 * @param {string} docId - The Firestore document ID
 * @param {string} newUrl - The verified Roblox thumbnail URL
 */
export async function updateItemImageUrl(type, docId, newUrl) {
    if (!type || !docId || !newUrl) return;
    
    // Convert friendly type to collection name if needed
    const collectionMap = {
        'texture': 'textures',
        'facebase': 'facebases',
        'avatar': 'avatar'
    };
    const collectionName = collectionMap[type] || type;

    try {
        const itemRef = doc(db, collectionName, docId);
        console.log(`DB_UPDATE: Updating ${collectionName}/${docId}...`);
        await updateDoc(itemRef, {
            remoteUrl: newUrl,
            lastHealed: new Date().toISOString()
        });
        console.log(`DB_UPDATE: ✅ Successfully updated ${collectionName}/${docId}.`);
    } catch (error) {
        console.error(`DB_UPDATE: ❌ Error updating ${collectionName}/${docId}:`, error);
        throw error;
    }
}

export const parseItemName = () => { };

export async function initializeAllData(user = auth.currentUser) {
    console.log("DATA_LOADER: ☁️ Starting Cloud Data Load (Firebase ONLY)...");

    let sourceData = { textures: [], facebases: [], avatar: [], music: [] };

    if (!user) {
        throw new Error('Catalog requires an authenticated Firebase user before loading private collections.');
    }

    await user.getIdToken();

    const snapshots = await Promise.all(CATALOG_COLLECTIONS.map(collectionName => readCatalogCollection(collectionName, user)));
    snapshots.forEach((snapshot, index) => {
        const collectionName = CATALOG_COLLECTIONS[index];
        snapshot.forEach(documentSnapshot => sourceData[collectionName].push({ ...documentSnapshot.data(), docId: documentSnapshot.id }));
    });

    // Normalizar texturas
    const allTextureItems = (sourceData.textures || []).map(item => {
        const codeId = normalizeCodeId(item);
        const displayName = normalizeText(item.displayName, item.fullName, item.name, item.baseName, codeId, item.docId, 'Untitled texture');
        return {
            id: item.docId,
            group: normalizeText(item.category, item.group, item.type, 'General'),
            displayName,
            codeId,
            src: normalizeImageSrc(item, codeId),
            type: 'texture',
            baseName: normalizeText(item.baseName, item.name, displayName),
            hidden: !!item.hidden
        };
    });

    // Normalizar facebases
    const allFacebaseItems = (sourceData.facebases || []).map(item => {
        const codeId = normalizeCodeId(item);
        return {
            id: item.docId, // Use the real Firestore Document ID
            group: normalizeText(item.group, item.category, 'General').toUpperCase(),
            displayName: normalizeText(item.displayName, item.name, item.variant, item.baseName, codeId, item.docId, 'Untitled facebase'),
            codeId,
            src: normalizeImageSrc(item, codeId),
            type: 'facebase',
            hidden: !!item.hidden
        };
    });

    // Normalizar avatar items
    const allAvatarItems = (sourceData.avatar || []).map(item => {
        const codeId = normalizeCodeId(item);
        return {
            id: item.docId,
            group: normalizeText(item.category, item.group, 'General').toUpperCase(),
            displayName: normalizeText(item.displayName, item.name, item.fullName, codeId, item.docId, 'Untitled avatar item'),
            codeId,
            src: normalizeImageSrc(item, codeId),
            type: 'avatar',
            hidden: !!item.hidden
        };
    });

    const allMusicCodes = (sourceData.music || []).map(item => ({
        ...item,
        id: item.docId, // Consistency
        title: normalizeText(item.title, item.name, item.displayName, item.docId, 'Untitled music'),
        category: normalizeText(item.category, item.group, 'General'),
        hidden: !!item.hidden
    }));
    const facebaseCategories = generateFacebaseCategories(allFacebaseItems);
    const allTextureBasenames = allTextureItems.map(t => t.baseName);

    const normalizedData = {
        allFacebaseItems,
        facebaseCategories,
        allAvatarItems,
        allTextureBasenames,
        allTextureItems,
        allMusicCodes,
        rawDb: sourceData
    };

    console.info('DATA_LOADER: ✅ Catalog counts', {
        facebases: allFacebaseItems.length,
        textures: allTextureItems.length,
        avatar: allAvatarItems.length,
        music: allMusicCodes.length
    });

    return normalizedData;
}

function generateFacebaseCategories(items) {
    const countries = new Set();
    const others = new Set();
    const knownCountries = ['BRAZIL', 'UK', 'USA', 'ZAMBIA', 'IRELAND', 'ITALY', 'INDIA', 'BELGIUM', 'EGYPT', 'SPAIN', 'FRANCE', 'COSTA RICA', 'THAILAND', 'KOREA', 'JAPAN'];

    items.forEach(item => {
        const group = item.group;
        if (knownCountries.includes(group)) {
            countries.add(group);
        } else {
            others.add(group);
        }
    });

    return {
        countries: Array.from(countries).map(name => ({
            name: name.charAt(0) + name.slice(1).toLowerCase(),
            iso: getIsoCode(name)
        })),
        others: Array.from(others).map(name => ({
            name: name.charAt(0) + name.slice(1).toLowerCase(),
            flag: `photos/app/${name.charAt(0) + name.slice(1).toLowerCase()}.webp`
        }))
    };
}

/**
 * Migration Script: Normalizes all existing Facebases to the standard country list.
 */
export async function migrateFacebaseCountries() {
    console.log("MIGRATION: 🌏 Starting Facebase country normalization...");
    try {
        const snap = await getDocs(collection(db, 'facebases'));
        const batch = writeBatch(db);
        let count = 0;

        snap.forEach(d => {
            const data = d.data();
            const currentGroup = (data.category || data.group || '').toUpperCase().trim();
            
            // Look for a match in ISO_MAP keys
            let standardMatch = Object.keys(ISO_MAP).find(std => 
                std === currentGroup || 
                std.replace(/\s+/g, '') === currentGroup.replace(/\s+/g, '')
            );

            // Extra heuristics: If it's already an ISO code, it might need to be converted to the full name
            if (!standardMatch) {
                const results = Object.entries(ISO_MAP).find(([name, iso]) => iso === currentGroup);
                if (results) standardMatch = results[0];
            }

            if (standardMatch && currentGroup !== standardMatch) {
                batch.update(doc(db, 'facebases', d.id), {
                    group: standardMatch,
                    category: standardMatch,
                    lastMigrated: new Date().toISOString()
                });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`MIGRATION: ✅ Standardized ${count} records.`);
            return count;
        } else {
            console.log("MIGRATION: ⏭️ No records needed standardizing.");
            return 0;
        }
    } catch (error) {
        console.error("MIGRATION: ❌ Error during normalization:", error);
        throw error;
    }
}

/**
 * Toggles an item's visibility (hidden state) in Firestore.
 * @param {string} type - 'textures', 'facebases', 'avatar'
 * @param {string} docId - The Firestore document ID
 * @param {boolean} hidden - The new hidden state
 */
export async function toggleItemVisibility(type, docId, hidden) {
    if (!type || !docId) return;

    const collectionMap = {
        'texture': 'textures',
        'facebase': 'facebases',
        'avatar': 'avatar'
    };
    const collectionName = collectionMap[type] || type;

    try {
        const itemRef = doc(db, collectionName, docId);
        console.log(`DB_UPDATE: Setting visibility for ${collectionName}/${docId} to ${hidden}...`);
        await updateDoc(itemRef, {
            hidden: hidden,
            lastHiddenUpdate: new Date().toISOString()
        });
        console.log(`DB_UPDATE: ✅ Set ${collectionName}/${docId} hidden to ${hidden}.`);
    } catch (error) {
        console.error(`DB_UPDATE: ❌ Error toggling visibility for ${collectionName}/${docId}:`, error);
        throw error;
    }
}
/**
 * Decouples Facebases by ensuring every document has a unique name+country combination.
 * If duplicates are found, they are suffixed with (1), (2), etc.
 * This effectively "breaks" unintended groups.
 */
export async function decoupleFacebaseNames() {
    console.log("DECAPPING: 💥 Starting Facebase decoupling...");
    try {
        const snap = await getDocs(collection(db, 'facebases'));
        const allItems = snap.docs.map(d => ({ ...d.data(), id: d.id }));
        const batch = writeBatch(db);
        let updateCount = 0;

        // Group by EXACT Country + DisplayName
        const collisionMap = {};
        allItems.forEach(item => {
            const name = (item.displayName || item.name || '').trim();
            const group = (item.group || item.category || 'General').toUpperCase().trim();
            const key = `${group}|${name}`;
            if (!collisionMap[key]) collisionMap[key] = [];
            collisionMap[key].push(item);
        });

        // Resolve collisions
        Object.entries(collisionMap).forEach(([key, items]) => {
            if (items.length > 1) {
                // We have multiple items with the exact same name and country
                items.forEach((item, index) => {
                    const originalName = (item.displayName || item.name || '').trim();
                    const newName = `${originalName} (${index + 1})`;
                    
                    batch.update(doc(db, 'facebases', item.id), {
                        displayName: newName,
                        name: newName, // Sync both fields just in case
                        lastDecoupled: new Date().toISOString()
                    });
                    updateCount++;
                });
            }
        });

        if (updateCount > 0) {
            await batch.commit();
            console.log(`DECAPPING: ✅ Decoupled ${updateCount} records with unique names.`);
            return updateCount;
        } else {
            console.log("DECAPPING: ⏭️ No naming collisions found.");
            return 0;
        }
    } catch (error) {
        console.error("DECAPPING: ❌ Error during decoupling:", error);
        throw error;
    }
}
