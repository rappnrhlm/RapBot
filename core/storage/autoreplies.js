// core/storage/autoreplies.js - Autoreply repository with multi-trigger support (MariaDB + JSON cache)
const { getPool } = require('./mariadb/pool');
const { AUTOREPLY_FILE, cache, syncDataFile } = require('./json/cache');
const { normalizeJid } = require('../utils/jid');

function resolveDataGroupId(groupId) {
    if (!groupId) return null;
    const clean = normalizeJid(groupId);
    const g = cache.groups.find(x => normalizeJid(x.id) === clean);
    if (g && g.parentGroupId) {
        return normalizeJid(g.parentGroupId);
    }
    return clean;
}

function getAutoreplies() {
    return cache.autoreplies;
}

function normalizeTriggerList(triggerInput) {
    if (!triggerInput) return [];
    let cleaned = String(triggerInput).trim().replace(/^\{+|\}+$/g, '').trim();
    const list = cleaned
        .split(/[/,]+/)
        .map(t => t.trim().replace(/^\{+|\}+$/g, '').trim())
        .filter(Boolean);
    return list;
}

function findAutoreply(trigger, groupId = null) {
    if (!trigger) return null;
    const normalized = trigger.trim().toLowerCase();
    const cleanGroupId = groupId ? normalizeJid(groupId) : null;

    function matches(item) {
        if (Array.isArray(item.triggers) && item.triggers.length > 0) {
            if (item.triggers.some(t => t.toLowerCase() === normalized)) return true;
        }
        if (item.trigger?.toLowerCase() === normalized) return true;
        if (item.trigger && (item.trigger.includes('/') || item.trigger.includes(','))) {
            const parts = item.trigger.split(/[/,]+/).map(p => p.trim().toLowerCase());
            if (parts.includes(normalized)) return true;
        }
        return false;
    }

    // 1. Jika di dalam grup, cek autoreply khusus grup ini terlebih dahulu (termasuk grup induk jika grup publik terhubung)
    if (cleanGroupId) {
        const effectiveGroupId = resolveDataGroupId(cleanGroupId);
        const groupMatch = cache.autoreplies.find(item => {
            if (!item.groupId) return false;
            const norm = normalizeJid(item.groupId);
            return (norm === cleanGroupId || (effectiveGroupId && norm === effectiveGroupId)) && matches(item);
        });
        if (groupMatch) return groupMatch;
    }

    // 2. Jika tidak ada match khusus grup, ambil autoreply global (tanpa group_id)
    return cache.autoreplies.find(item => !item.groupId && matches(item)) || null;
}

async function addAutoreply(triggerInput, response, createdBy = 'owner', groupId = null, mediaInfo = null, ownerOnly = false) {
    if (!triggerInput || (!response && !mediaInfo)) {
        return { success: false, message: 'Trigger dan respons/media wajib diisi.' };
    }

    const cleanGroupId = groupId ? normalizeJid(groupId) : null;
    const cleanMediaPath = mediaInfo?.path || null;
    const cleanMediaType = mediaInfo?.type || (cleanMediaPath ? 'image' : null);
    const isOwnerOnly = Boolean(ownerOnly);

    const triggers = normalizeTriggerList(triggerInput);
    if (triggers.length === 0) {
        return { success: false, message: 'Format trigger tidak valid.' };
    }

    for (const t of triggers) {
        const found = findAutoreply(t, cleanGroupId);
        if (found && ((!cleanGroupId && !found.groupId) || (cleanGroupId && found.groupId === cleanGroupId))) {
            const label = Array.isArray(found.triggers) ? found.triggers.join(' / ') : found.trigger;
            return {
                success: false,
                message: `Trigger "${t}" sudah terdaftar pada autoreply (${label}). Gunakan edit untuk mengubahnya.`
            };
        }
    }

    const primaryTrigger = triggers.join(' / ');
    const now = new Date();
    const cleanResponse = String(response || '').trim();

    let insertId = null;
    try {
        const db = getPool();
        const [res] = await db.query(
            `INSERT INTO autoreplies (trigger_name, triggers_json, response, group_id, media_path, media_type, owner_only, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [primaryTrigger, JSON.stringify(triggers), cleanResponse, cleanGroupId, cleanMediaPath, cleanMediaType, isOwnerOnly ? 1 : 0, createdBy || 'owner', now]
        );
        insertId = res.insertId;
    } catch (err) {
        console.error('[core/storage/autoreplies] Error inserting autoreply to MariaDB:', err.message);
    }

    const newItem = {
        id: insertId,
        trigger: primaryTrigger,
        triggers: triggers,
        response: cleanResponse,
        groupId: cleanGroupId,
        mediaPath: cleanMediaPath,
        mediaType: cleanMediaType,
        ownerOnly: isOwnerOnly,
        createdBy: createdBy || 'owner',
        createdAt: now.toISOString()
    };

    cache.autoreplies.push(newItem);
    syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

    return { success: true, message: `Autoreply untuk "${primaryTrigger}" berhasil ditambahkan.`, item: newItem };
}

async function editAutoreply(triggerOrId, updatesOrResponse, updatedBy = 'owner') {
    if (!triggerOrId || !updatesOrResponse) {
        return { success: false, message: 'Identitas trigger/ID dan data baru wajib diisi.' };
    }

    let isObjectUpdate = typeof updatesOrResponse === 'object' && updatesOrResponse !== null;
    let newResponse = isObjectUpdate ? updatesOrResponse.response : String(updatesOrResponse);
    let newTriggerInput = isObjectUpdate ? updatesOrResponse.trigger : null;
    let newOwnerOnly = isObjectUpdate && updatesOrResponse.ownerOnly !== undefined ? Boolean(updatesOrResponse.ownerOnly) : undefined;
    let newGroupId = isObjectUpdate && updatesOrResponse.groupId !== undefined ? (updatesOrResponse.groupId ? normalizeJid(updatesOrResponse.groupId) : null) : undefined;

    let foundIndex = -1;

    // 1. Try finding by numeric/string ID if triggerOrId matches an item ID
    if (typeof triggerOrId === 'number' || (!isNaN(Number(triggerOrId)) && !String(triggerOrId).startsWith('!'))) {
        const numericId = Number(triggerOrId);
        foundIndex = cache.autoreplies.findIndex(item => item.id === numericId);
    }

    // 2. Try finding by trigger keywords if not found by ID
    if (foundIndex === -1) {
        const targets = normalizeTriggerList(String(triggerOrId));
        for (const t of targets) {
            const normalized = t.toLowerCase();
            foundIndex = cache.autoreplies.findIndex(item => {
                if (Array.isArray(item.triggers) && item.triggers.some(tr => tr.toLowerCase() === normalized)) return true;
                if (item.trigger?.toLowerCase() === normalized) return true;
                if (item.trigger && (item.trigger.includes('/') || item.trigger.includes(','))) {
                    const parts = item.trigger.split(/[/,]+/).map(p => p.trim().toLowerCase());
                    if (parts.includes(normalized)) return true;
                }
                return false;
            });
            if (foundIndex !== -1) break;
        }
    }

    if (foundIndex === -1) {
        return { success: false, message: `Autoreply "${triggerOrId}" tidak ditemukan.` };
    }

    const item = cache.autoreplies[foundIndex];
    const targetGroupId = newGroupId !== undefined ? newGroupId : item.groupId;

    // If new trigger(s) are supplied, validate for collision against other autoreplies
    if (newTriggerInput) {
        const newTriggers = normalizeTriggerList(newTriggerInput);
        if (newTriggers.length === 0) {
            return { success: false, message: 'Format trigger baru tidak valid.' };
        }

        for (const t of newTriggers) {
            const collision = cache.autoreplies.find((other, idx) => {
                if (idx === foundIndex) return false;
                const matchGroup = (!targetGroupId && !other.groupId) || (targetGroupId && other.groupId === targetGroupId);
                if (!matchGroup) return false;
                const normalized = t.toLowerCase();
                if (Array.isArray(other.triggers) && other.triggers.some(tr => tr.toLowerCase() === normalized)) return true;
                if (other.trigger?.toLowerCase() === normalized) return true;
                return false;
            });

            if (collision) {
                const label = Array.isArray(collision.triggers) ? collision.triggers.join(' / ') : collision.trigger;
                return {
                    success: false,
                    message: `Trigger "${t}" sudah digunakan oleh autoreply lain (${label}). Tidak dapat menduplikasi.`
                };
            }
        }

        item.triggers = newTriggers;
        item.trigger = newTriggers.join(' / ');
    }

    if (newResponse !== undefined) {
        item.response = String(newResponse).trim();
    }
    if (newOwnerOnly !== undefined) {
        item.ownerOnly = newOwnerOnly;
    }
    if (newGroupId !== undefined) {
        item.groupId = newGroupId;
    }

    item.updatedBy = updatedBy;
    item.updatedAt = new Date().toISOString();

    syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

    try {
        const db = getPool();
        if (item.id) {
            await db.query(
                `UPDATE autoreplies
                 SET trigger_name = ?, triggers_json = ?, response = ?, group_id = ?, owner_only = ?, updated_by = ?, updated_at = NOW()
                 WHERE id = ?`,
                [item.trigger, JSON.stringify(item.triggers || [item.trigger]), item.response, item.groupId || null, item.ownerOnly ? 1 : 0, updatedBy, item.id]
            );
        } else {
            await db.query(
                `UPDATE autoreplies
                 SET response = ?, group_id = ?, owner_only = ?, updated_by = ?, updated_at = NOW()
                 WHERE trigger_name = ?`,
                [item.response, item.groupId || null, item.ownerOnly ? 1 : 0, updatedBy, item.trigger]
            );
        }
    } catch (err) {
        console.error('[core/storage/autoreplies] Error updating autoreply in MariaDB:', err.message);
    }

    const label = Array.isArray(item.triggers) ? item.triggers.join(' / ') : item.trigger;
    return { success: true, message: `Autoreply untuk "${label}" berhasil diperbarui.`, item, data: item };
}

async function deleteAutoreply(triggerInput) {
    if (!triggerInput) return { success: false, message: 'Trigger wajib diisi.' };

    const targets = normalizeTriggerList(triggerInput);
    let index = -1;

    for (const t of targets) {
        const normalized = t.toLowerCase();
        index = cache.autoreplies.findIndex(item => {
            if (Array.isArray(item.triggers) && item.triggers.some(tr => tr.toLowerCase() === normalized)) return true;
            if (item.trigger?.toLowerCase() === normalized) return true;
            if (item.trigger && (item.trigger.includes('/') || item.trigger.includes(','))) {
                const parts = item.trigger.split(/[/,]+/).map(p => p.trim().toLowerCase());
                if (parts.includes(normalized)) return true;
            }
            return false;
        });
        if (index !== -1) break;
    }

    if (index === -1) {
        return { success: false, message: `Trigger "${triggerInput}" tidak ditemukan.` };
    }

    const removed = cache.autoreplies.splice(index, 1)[0];
    syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

    try {
        const db = getPool();
        if (removed.id) {
            await db.query('DELETE FROM autoreplies WHERE id = ?', [removed.id]);
        } else {
            await db.query('DELETE FROM autoreplies WHERE trigger_name = ?', [removed.trigger]);
        }
    } catch (err) {
        console.error('[core/storage/autoreplies] Error deleting autoreply from MariaDB:', err.message);
    }

    const label = Array.isArray(removed.triggers) ? removed.triggers.join(' / ') : removed.trigger;
    return { success: true, message: `Autoreply untuk "${label}" berhasil dihapus.`, item: removed };
}

async function saveAutoreplies(list) {
    if (!Array.isArray(list)) return;
    cache.autoreplies = list;
    syncDataFile(AUTOREPLY_FILE, list);

    try {
        const db = getPool();
        for (const item of list) {
            const trigName = item.trigger || (Array.isArray(item.triggers) ? item.triggers.join(' / ') : '');
            const trigJson = JSON.stringify(Array.isArray(item.triggers) ? item.triggers : [trigName]);
            if (item.id) {
                await db.query(
                    `INSERT INTO autoreplies (id, trigger_name, triggers_json, response, group_id, media_path, media_type, owner_only, created_by, created_at, updated_by, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE trigger_name = VALUES(trigger_name), triggers_json = VALUES(triggers_json), response = VALUES(response), group_id = VALUES(group_id), media_path = VALUES(media_path), media_type = VALUES(media_type), owner_only = VALUES(owner_only), updated_by = VALUES(updated_by), updated_at = NOW()`,
                    [item.id, trigName, trigJson, item.response, item.groupId || null, item.mediaPath || null, item.mediaType || null, item.ownerOnly ? 1 : 0, item.createdBy || 'owner', item.createdAt ? new Date(item.createdAt) : new Date(), item.updatedBy || null, item.updatedAt ? new Date(item.updatedAt) : null]
                );
            } else {
                await db.query(
                    `INSERT INTO autoreplies (trigger_name, triggers_json, response, group_id, media_path, media_type, owner_only, created_by, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [trigName, trigJson, item.response, item.groupId || null, item.mediaPath || null, item.mediaType || null, item.ownerOnly ? 1 : 0, item.createdBy || 'owner']
                );
            }
        }
    } catch (err) {
        console.error('[core/storage/autoreplies] Error saving autoreplies to MariaDB:', err.message);
    }
}

module.exports = {
    getAutoreplies,
    saveAutoreplies,
    normalizeTriggerList,
    findAutoreply,
    addAutoreply,
    editAutoreply,
    deleteAutoreply
};
