// core/storage/groups.js - Persistent WhatsApp group registration and discovery storage
const { getPool } = require('./mariadb/pool');
const { GROUPS_FILE, DISCOVERED_GROUPS_FILE, cache, syncDataFile } = require('./json/cache');
const { normalizeJid } = require('../utils/jid');

function getGroups() {
    return cache.groups;
}

function getGroupById(groupId) {
    if (!groupId) return null;
    const targetId = normalizeJid(groupId);
    return cache.groups.find(g => normalizeJid(g.id) === targetId) || null;
}

function isGroupInitialized(groupId) {
    return Boolean(getGroupById(groupId));
}

function resolveDataGroupId(groupId) {
    if (!groupId) return null;
    const clean = normalizeJid(groupId);
    const g = cache.groups.find(x => normalizeJid(x.id) === clean);
    if (g && g.parentGroupId) {
        return normalizeJid(g.parentGroupId);
    }
    return clean;
}

async function addGroup({ id, name, groupName = '', type = 'kos', role = 'admin', parentGroupId = null, settings = {}, initializedBy = '' }) {
    const cleanId = normalizeJid(id);
    const cleanName = String(name || '').trim();
    const cleanGroupName = String(groupName || '').trim();
    const cleanType = String(type || 'kos').trim().toLowerCase();
    const cleanRole = String(role || 'admin').trim().toLowerCase();
    const cleanParentGroupId = parentGroupId ? normalizeJid(parentGroupId) : null;
    const cleanSettings = settings && typeof settings === 'object' ? settings : {};

    if (!cleanId) {
        return { success: false, message: 'Group ID tidak valid.' };
    }
    if (!cleanName) {
        return { success: false, message: 'Nama/alias grup wajib diisi.' };
    }

    const existing = getGroupById(cleanId);
    if (existing) {
        return {
            success: false,
            alreadyExists: true,
            existingGroup: existing,
            message: `Grup ini sudah diinisialisasi sebagai "${existing.name}".`
        };
    }

    const now = new Date();
    const newGroup = {
        id: cleanId,
        name: cleanName,
        groupName: cleanGroupName,
        type: cleanType,
        role: cleanRole,
        parentGroupId: cleanParentGroupId,
        settings: cleanSettings,
        initializedAt: now.toISOString(),
        initializedBy: String(initializedBy || '').trim()
    };

    cache.groups.push(newGroup);
    syncDataFile(GROUPS_FILE, { groups: cache.groups });

    try {
        const db = getPool();
        await db.query(
            `INSERT INTO bot_groups (id, name, group_name, type, role, parent_group_id, settings_json, initialized_at, initialized_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), group_name = VALUES(group_name), type = VALUES(type), role = VALUES(role), parent_group_id = VALUES(parent_group_id), settings_json = VALUES(settings_json)`,
            [newGroup.id, newGroup.name, newGroup.groupName, newGroup.type, newGroup.role, newGroup.parentGroupId, JSON.stringify(newGroup.settings), now, newGroup.initializedBy]
        );
    } catch (err) {
        console.error('[core/storage/groups] Error inserting group to MariaDB:', err.message);
    }

    return {
        success: true,
        alreadyExists: false,
        group: newGroup,
        message: `Grup berhasil diinisialisasi sebagai "${newGroup.name}" (${newGroup.role.toUpperCase()}).`
    };
}

async function saveGroups(groups) {
    const list = Array.isArray(groups) ? groups : [];
    cache.groups = list;
    syncDataFile(GROUPS_FILE, { groups: list });

    try {
        const db = getPool();
        for (const g of list) {
            if (!g?.id) continue;
            await db.query(
                `INSERT INTO bot_groups (id, name, group_name, initialized_at, initialized_by)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), group_name = VALUES(group_name)`,
                [g.id, g.name || 'Grup', g.groupName || '', g.initializedAt ? new Date(g.initializedAt) : new Date(), g.initializedBy || '']
            );
        }
    } catch (err) {
        console.error('[core/storage/groups] Error saving groups to MariaDB:', err.message);
    }
}

async function updateGroup(id, updates = {}) {
    const cleanId = normalizeJid(id);
    if (!cleanId) {
        return { success: false, message: 'Group ID tidak valid.' };
    }

    const index = cache.groups.findIndex(g => g.id === cleanId);
    if (index === -1) {
        return { success: false, notFound: true, message: 'Grup tidak ditemukan.' };
    }

    const current = cache.groups[index];
    const updated = {
        ...current,
        name: updates.name !== undefined ? String(updates.name).trim() : current.name,
        groupName: updates.groupName !== undefined ? String(updates.groupName).trim() : current.groupName,
        type: updates.type !== undefined ? String(updates.type).trim().toLowerCase() : current.type,
        role: updates.role !== undefined ? String(updates.role).trim().toLowerCase() : current.role,
        parentGroupId: updates.parentGroupId !== undefined
            ? (updates.parentGroupId ? normalizeJid(updates.parentGroupId) : null)
            : current.parentGroupId,
        settings: updates.settings !== undefined ? { ...(current.settings || {}), ...(updates.settings || {}) } : (current.settings || {})
    };

    cache.groups[index] = updated;
    syncDataFile(GROUPS_FILE, { groups: cache.groups });

    try {
        const db = getPool();
        await db.query(
            `UPDATE bot_groups 
             SET name = ?, group_name = ?, type = ?, role = ?, parent_group_id = ?, settings_json = ?
             WHERE id = ?`,
            [updated.name, updated.groupName, updated.type, updated.role, updated.parentGroupId, JSON.stringify(updated.settings), cleanId]
        );
    } catch (err) {
        console.error('[core/storage/groups] Error updating group in MariaDB:', err.message);
    }

    return {
        success: true,
        group: updated,
        message: 'Grup berhasil diperbarui.'
    };
}

async function deleteGroup(id) {
    const cleanId = normalizeJid(id);
    if (!cleanId) {
        return { success: false, message: 'Group ID tidak valid.' };
    }

    const index = cache.groups.findIndex(g => g.id === cleanId);
    if (index === -1) {
        return { success: false, notFound: true, message: 'Grup tidak ditemukan.' };
    }

    const deleted = cache.groups.splice(index, 1)[0];
    syncDataFile(GROUPS_FILE, { groups: cache.groups });

    try {
        const db = getPool();
        await db.query('DELETE FROM bot_groups WHERE id = ?', [cleanId]);
    } catch (err) {
        console.error('[core/storage/groups] Error deleting group from MariaDB:', err.message);
    }

    return {
        success: true,
        deletedGroup: deleted,
        message: 'Grup berhasil dihapus.'
    };
}

function getDiscoveredGroups() {
    return cache.discoveredGroups || [];
}

function saveDiscoveredGroups(list) {
    if (!Array.isArray(list)) return;
    cache.discoveredGroups = list;
    syncDataFile(DISCOVERED_GROUPS_FILE, list);
}

function updateDiscoveredGroupsFromMetadata(metaListOrMap) {
    const current = cache.discoveredGroups || [];
    const map = new Map();
    current.forEach(g => {
        if (g?.id) map.set(normalizeJid(g.id), g);
    });

    const list = Array.isArray(metaListOrMap) ? metaListOrMap : Object.values(metaListOrMap || {});
    list.forEach(m => {
        if (!m?.id) return;
        const jid = normalizeJid(m.id);
        const prev = map.get(jid) || {};
        map.set(jid, {
            id: jid,
            subject: m.subject || prev.subject || '',
            participantsCount: m.participants?.length || prev.participantsCount || 0,
            creation: m.creation || prev.creation || null,
            desc: m.desc || prev.desc || '',
            lastSeen: new Date().toISOString()
        });
    });

    const updated = Array.from(map.values());
    saveDiscoveredGroups(updated);
    return updated;
}

module.exports = {
    GROUPS_FILE,
    DISCOVERED_GROUPS_FILE,
    getGroups,
    saveGroups,
    getGroupById,
    isGroupInitialized,
    resolveDataGroupId,
    addGroup,
    updateGroup,
    deleteGroup,
    getDiscoveredGroups,
    saveDiscoveredGroups,
    updateDiscoveredGroupsFromMetadata
};
