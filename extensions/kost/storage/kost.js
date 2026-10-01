// extensions/kost/storage/kost.js - MariaDB repository for Bukittinggi Kos listings
const { getPool } = require('../../../core/storage/mariadb/pool');
const { ensureAllTables } = require('../../../core/storage/mariadb/schema');
const { KOST_FILE, syncDataFile } = require('../../../core/storage/json/cache');
const { resolveDataGroupId } = require('../../../core/storage/groups');
const { readJSON } = require('../../../core/utils/json');
const { normalizeJid } = require('../../../core/utils/jid');
const {
    cleanInstagramUsername,
    cleanTiktokUsername,
    cleanWhatsappNumber,
    mapKostRow,
    normalizeKostId
} = require('../utils/formatters');

async function generateNextKostIdFromDb() {
    await ensureAllTables();
    const db = getPool();
    const [rows] = await db.query(
        "SELECT id FROM kost WHERE id LIKE 'KST-%' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) DESC LIMIT 1"
    );
    let maxNum = 0;
    if (rows.length > 0 && rows[0]?.id) {
        const match = String(rows[0].id).match(/^KST-(\d+)$/i);
        if (match) {
            maxNum = parseInt(match[1], 10);
        }
    }
    return `KST-${String(maxNum + 1).padStart(6, '0')}`;
}

async function syncKostBackup() {
    try {
        const db = getPool();
        const [rows] = await db.query('SELECT * FROM kost ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC');
        const list = rows.map(mapKostRow);
        syncDataFile(KOST_FILE, list);
        return list;
    } catch (err) {
        console.warn('[extensions/kost/storage] Warning syncing kost backup JSON:', err.message);
        return [];
    }
}

async function getKostList(groupId = null) {
    try {
        await ensureAllTables();
        const db = getPool();
        const effectiveGroupId = resolveDataGroupId(groupId);
        const cleanGroupId = (effectiveGroupId && String(effectiveGroupId).endsWith('@g.us')) ? normalizeJid(effectiveGroupId) : null;
        
        if (cleanGroupId) {
            const [groupRows] = await db.query(
                'SELECT * FROM kost WHERE group_id = ? ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC',
                [cleanGroupId]
            );
            if (groupRows.length > 0) {
                return groupRows.map(mapKostRow);
            }
        }

        const [rows] = await db.query('SELECT * FROM kost ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC');
        return rows.map(mapKostRow);
    } catch (err) {
        const list = readJSON(KOST_FILE, []);
        const effectiveGroupId = resolveDataGroupId(groupId);
        const cleanGroupId = (effectiveGroupId && String(effectiveGroupId).endsWith('@g.us')) ? normalizeJid(effectiveGroupId) : null;
        if (cleanGroupId) {
            const groupFiltered = list.filter(k => normalizeJid(k.groupId || k.group_id) === cleanGroupId);
            if (groupFiltered.length > 0) return groupFiltered;
        }
        return list;
    }
}

async function getKostListByGroup(groupId) {
    return getKostList(groupId);
}

async function getKostByStatus(statusOrGroup, groupIdOrStatus = null) {
    let targetStatus = statusOrGroup;
    let targetGroup = groupIdOrStatus;

    if (typeof statusOrGroup === 'string' && statusOrGroup.endsWith('@g.us')) {
        targetGroup = statusOrGroup;
        targetStatus = groupIdOrStatus;
    }

    const s = String(targetStatus || '').trim().toLowerCase();
    if (!s || s === 'all') {
        return getKostList(targetGroup);
    }

    const normalizedStatus = (s === 'posted') ? 'published' : s;

    await ensureAllTables();
    const db = getPool();
    const effectiveGroupId = resolveDataGroupId(targetGroup);
    const cleanGroupId = (effectiveGroupId && String(effectiveGroupId).endsWith('@g.us')) ? normalizeJid(effectiveGroupId) : null;

    if (cleanGroupId) {
        const [groupRows] = await db.query(
            'SELECT * FROM kost WHERE (status = ? OR (status = "posted" AND ? = "published")) AND group_id = ? ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC',
            [normalizedStatus, normalizedStatus, cleanGroupId]
        );
        if (groupRows.length > 0) {
            return groupRows.map(mapKostRow);
        }
    }

    const [rows] = await db.query(
        'SELECT * FROM kost WHERE (status = ? OR (status = "posted" AND ? = "published")) ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC',
        [normalizedStatus, normalizedStatus]
    );
    return rows.map(mapKostRow);
}

async function getKostById(idOrGroup, groupIdOrId = null) {
    let targetId = idOrGroup;
    let targetGroup = groupIdOrId;

    if (typeof idOrGroup === 'string' && idOrGroup.endsWith('@g.us')) {
        targetGroup = idOrGroup;
        targetId = groupIdOrId;
    }

    if (!targetId) return null;
    const cleanId = normalizeKostId(targetId) || String(targetId).trim().toUpperCase();
    const effectiveGroupId = resolveDataGroupId(targetGroup);
    const cleanGroupId = (effectiveGroupId && String(effectiveGroupId).endsWith('@g.us')) ? normalizeJid(effectiveGroupId) : null;

    await ensureAllTables();
    const db = getPool();

    if (cleanGroupId) {
        const [groupRows] = await db.query('SELECT * FROM kost WHERE id = ? AND group_id = ?', [cleanId, cleanGroupId]);
        if (groupRows.length > 0) {
            return mapKostRow(groupRows[0]);
        }
    }

    const [rows] = await db.query('SELECT * FROM kost WHERE id = ?', [cleanId]);
    return rows.length > 0 ? mapKostRow(rows[0]) : null;
}

async function searchKost(queryOrGroup, groupIdOrQuery = null, options = {}) {
    let targetQuery = queryOrGroup;
    let targetGroup = groupIdOrQuery;
    let targetStatus = null;

    if (typeof options === 'string') {
        targetStatus = options;
    } else if (options && typeof options === 'object') {
        targetStatus = options.status || (options.onlySent ? 'sent' : null);
    }

    if (typeof queryOrGroup === 'string' && queryOrGroup.endsWith('@g.us')) {
        targetGroup = queryOrGroup;
        targetQuery = groupIdOrQuery;
    }

    if (!targetQuery) return [];
    const q = String(targetQuery).trim().toLowerCase();
    const effectiveGroupId = resolveDataGroupId(targetGroup);
    const cleanGroupId = (effectiveGroupId && String(effectiveGroupId).endsWith('@g.us')) ? normalizeJid(effectiveGroupId) : null;

    await ensureAllTables();
    const db = getPool();
    const likePattern = `%${q}%`;
    const normSt = targetStatus && targetStatus !== 'all' 
        ? (String(targetStatus).toLowerCase() === 'posted' ? 'published' : String(targetStatus).toLowerCase())
        : null;

    if (cleanGroupId) {
        let groupSql = `SELECT * FROM kost WHERE (
            LOWER(name) LIKE ? OR 
            LOWER(COALESCE(instagram, '')) LIKE ? OR 
            LOWER(COALESCE(tiktok, '')) LIKE ? OR 
            LOWER(COALESCE(whatsapp, '')) LIKE ? OR 
            LOWER(id) LIKE ?
        ) AND group_id = ?`;
        const groupParams = [likePattern, likePattern, likePattern, likePattern, likePattern, cleanGroupId];
        if (normSt) {
            groupSql += ' AND (status = ? OR (status = "posted" AND ? = "published"))';
            groupParams.push(normSt, normSt);
        }
        groupSql += ' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC';
        const [groupRows] = await db.query(groupSql, groupParams);
        if (groupRows.length > 0) {
            return groupRows.map(mapKostRow);
        }
    }

    let sql = `SELECT * FROM kost WHERE (
        LOWER(name) LIKE ? OR 
        LOWER(COALESCE(instagram, '')) LIKE ? OR 
        LOWER(COALESCE(tiktok, '')) LIKE ? OR 
        LOWER(COALESCE(whatsapp, '')) LIKE ? OR 
        LOWER(id) LIKE ?
    )`;
    const params = [likePattern, likePattern, likePattern, likePattern, likePattern];
    if (normSt) {
        sql += ' AND (status = ? OR (status = "posted" AND ? = "published"))';
        params.push(normSt, normSt);
    }
    sql += ' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC';
    const [rows] = await db.query(sql, params);
    return rows.map(mapKostRow);
}

async function addKost({ name, instagram = null, tiktok = null, whatsapp = null, status = 'pending', addedBy = '', groupId = '' }) {
    await ensureAllTables();
    const cleanName = String(name || '').trim();
    const cleanIg = cleanInstagramUsername(instagram);
    const cleanTt = cleanTiktokUsername(tiktok);
    const cleanWa = cleanWhatsappNumber(whatsapp);
    const cleanGroupId = (groupId && String(groupId).endsWith('@g.us')) ? normalizeJid(groupId) : '';
    let cleanStatus = String(status || 'pending').toLowerCase();
    if (cleanStatus === 'posted') cleanStatus = 'published';
    if (!['pending', 'sent', 'published'].includes(cleanStatus)) cleanStatus = 'pending';

    if (!cleanName) {
        return { success: false, message: 'Nama kost/item wajib diisi.' };
    }
    if (!cleanIg && !cleanTt && !cleanWa) {
        return { success: false, message: 'Minimal salah satu kontak (Instagram, TikTok, atau WhatsApp) wajib diisi.' };
    }

    const db = getPool();

    // Check duplicate identik jika ada kontak yang sama
    const dupConditions = [];
    const dupParams = [];
    if (cleanIg) {
        dupConditions.push('LOWER(instagram) = LOWER(?)');
        dupParams.push(cleanIg);
    }
    if (cleanTt) {
        dupConditions.push('LOWER(tiktok) = LOWER(?)');
        dupParams.push(cleanTt);
    }
    if (cleanWa) {
        dupConditions.push('whatsapp = ?');
        dupParams.push(cleanWa);
    }

    if (dupConditions.length > 0) {
        let dupQuery = `SELECT id, name FROM kost WHERE LOWER(name) = LOWER(?) AND (${dupConditions.join(' OR ')})`;
        const params = [cleanName, ...dupParams];
        if (cleanGroupId) {
            dupQuery += ' AND group_id = ?';
            params.push(cleanGroupId);
        }
        const [existing] = await db.query(dupQuery, params);
        if (existing.length > 0) {
            return {
                success: false,
                alreadyExists: true,
                message: `Kost "${cleanName}" dengan kontak tersebut sudah terdaftar (${existing[0].id}).`
            };
        }
    }

    const nextId = await generateNextKostIdFromDb();
    const now = new Date();
    const isSentOrPub = cleanStatus === 'sent' || cleanStatus === 'published';

    await db.query(
        `INSERT INTO kost (id, group_id, name, instagram, tiktok, whatsapp, status, added_by, created_at, sent_by, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nextId, cleanGroupId, cleanName, cleanIg, cleanTt, cleanWa, cleanStatus, addedBy || null, now, isSentOrPub ? (addedBy || 'admin') : null, isSentOrPub ? now : null]
    );

    const newRecord = {
        id: nextId,
        groupId: cleanGroupId,
        group_id: cleanGroupId,
        name: cleanName,
        namaKost: cleanName,
        instagram: cleanIg,
        tiktok: cleanTt,
        whatsapp: cleanWa,
        status: cleanStatus,
        addedBy: addedBy || null,
        added_by: addedBy || null,
        createdAt: now.toISOString(),
        created_at: now.toISOString(),
        sentBy: isSentOrPub ? (addedBy || 'admin') : null,
        sent_by: isSentOrPub ? (addedBy || 'admin') : null,
        sentAt: isSentOrPub ? now.toISOString() : null,
        sent_at: isSentOrPub ? now.toISOString() : null
    };

    syncKostBackup();

    return {
        success: true,
        message: `Kost "${cleanName}" berhasil ditambahkan.`,
        data: newRecord
    };
}

async function setKostStatus(targetId, targetStatus, updatedBy = '', targetGroup = null) {
    if (!targetId) return { success: false, message: 'ID kost wajib diisi.' };
    const cleanId = normalizeKostId(targetId) || String(targetId || '').trim().toUpperCase();
    const cleanGroupId = (targetGroup && String(targetGroup).endsWith('@g.us')) ? normalizeJid(targetGroup) : null;

    let s = String(targetStatus || 'pending').toLowerCase().trim();
    if (s === 'posted') s = 'published';
    if (!['pending', 'sent', 'published'].includes(s)) {
        return { success: false, message: `Status "${targetStatus}" tidak valid (gunakan pending, sent, atau published).` };
    }

    await ensureAllTables();
    const db = getPool();

    const current = await getKostById(cleanId, cleanGroupId);
    if (!current) {
        return { success: false, notFound: true, message: `Kost dengan ID ${cleanId} tidak ditemukan.` };
    }

    const now = new Date();
    let sentAt = current.sentAt;
    let sentBy = current.sentBy;

    if (s === 'pending') {
        sentAt = null;
        sentBy = null;
    } else if (s === 'sent' || s === 'published') {
        if (!sentAt) sentAt = now;
        if (updatedBy) sentBy = updatedBy;
    }

    let updateSql = 'UPDATE kost SET status = ?, sent_by = ?, sent_at = ? WHERE id = ?';
    const updateParams = [s, sentBy || null, sentAt, cleanId];
    await db.query(updateSql, updateParams);

    const updated = await getKostById(cleanId, cleanGroupId);
    syncKostBackup();

    return {
        success: true,
        message: `Status kost ${cleanId} berhasil diubah menjadi ${s.toUpperCase()}.`,
        data: updated
    };
}

async function markKostSent(arg1, arg2 = '', arg3 = null) {
    let targetId = '';
    let targetGroup = null;
    let targetSentBy = '';

    if (typeof arg1 === 'string' && arg1.endsWith('@g.us')) {
        targetGroup = arg1;
        targetId = arg2;
        targetSentBy = arg3 || '';
    } else {
        targetId = arg1;
        if (typeof arg2 === 'string' && arg2.endsWith('@g.us')) {
            targetGroup = arg2;
            targetSentBy = arg3 || '';
        } else if (typeof arg3 === 'string' && arg3.endsWith('@g.us')) {
            targetGroup = arg3;
            targetSentBy = arg2 || '';
        } else {
            targetSentBy = arg2 || arg3 || '';
            targetGroup = null;
        }
    }

    const cleanId = normalizeKostId(targetId) || String(targetId || '').trim().toUpperCase();
    const cleanGroupId = (targetGroup && String(targetGroup).endsWith('@g.us')) ? normalizeJid(targetGroup) : null;

    if (!cleanId) {
        return { success: false, message: 'ID kost wajib diisi.' };
    }

    await ensureAllTables();
    const current = await getKostById(cleanId, cleanGroupId);
    if (!current) {
        return {
            success: false,
            notFound: true,
            message: `Kost dengan ID ${cleanId} tidak ditemukan.`
        };
    }

    if (current.status === 'sent') {
        return {
            success: false,
            alreadySent: true,
            message: `Kost dengan ID ${cleanId} sudah berstatus SENT sebelumnya.`,
            data: current
        };
    }

    return setKostStatus(cleanId, 'sent', targetSentBy || 'admin', cleanGroupId);
}

async function markKostPublished(arg1, arg2 = '', arg3 = null) {
    let targetId = '';
    let targetGroup = null;
    let targetPublishedBy = '';

    if (typeof arg1 === 'string' && arg1.endsWith('@g.us')) {
        targetGroup = arg1;
        targetId = arg2;
        targetPublishedBy = arg3 || '';
    } else {
        targetId = arg1;
        if (typeof arg2 === 'string' && arg2.endsWith('@g.us')) {
            targetGroup = arg2;
            targetPublishedBy = arg3 || '';
        } else if (typeof arg3 === 'string' && arg3.endsWith('@g.us')) {
            targetGroup = arg3;
            targetPublishedBy = arg2 || '';
        } else {
            targetPublishedBy = arg2 || arg3 || '';
            targetGroup = null;
        }
    }

    const cleanId = normalizeKostId(targetId) || String(targetId || '').trim().toUpperCase();
    const cleanGroupId = (targetGroup && String(targetGroup).endsWith('@g.us')) ? normalizeJid(targetGroup) : null;

    if (!cleanId) {
        return { success: false, message: 'ID kost wajib diisi.' };
    }

    await ensureAllTables();
    const current = await getKostById(cleanId, cleanGroupId);
    if (!current) {
        return {
            success: false,
            notFound: true,
            message: `Kost dengan ID ${cleanId} tidak ditemukan.`
        };
    }

    if (current.status === 'published' || current.status === 'posted') {
        return {
            success: false,
            alreadyPublished: true,
            message: `Kost dengan ID ${cleanId} sudah berstatus PUBLISHED (tayang) sebelumnya.`,
            data: current
        };
    }

    return setKostStatus(cleanId, 'published', targetPublishedBy || 'admin', cleanGroupId);
}

async function markKostBatchSent(ids, groupId, senderNumber = '') {
    await ensureAllTables();
    const db = getPool();
    const cleanGroupId = (groupId && String(groupId).endsWith('@g.us')) ? normalizeJid(groupId) : null;
    const cleanIds = Array.isArray(ids) ? [...new Set(ids.map(normalizeKostId).filter(Boolean))] : [];

    if (cleanIds.length === 0) {
        return { success: false, message: 'Tidak ada ID yang valid.' };
    }

    let query = 'SELECT id, name, status, sent_by, sent_at FROM kost WHERE id IN (?)';
    const params = [cleanIds];
    if (cleanGroupId) {
        query += ' AND group_id = ?';
        params.push(cleanGroupId);
    }

    const [rows] = await db.query(query, params);
    const rowMap = new Map(rows.map(r => [r.id, r]));

    const toUpdate = [];
    const alreadySent = [];
    const notFound = [];

    for (const id of cleanIds) {
        const row = rowMap.get(id);
        if (!row) {
            notFound.push(id);
        } else if (row.status === 'sent') {
            alreadySent.push(row);
        } else {
            toUpdate.push(row);
        }
    }

    if (toUpdate.length > 0) {
        const updateIds = toUpdate.map(r => r.id);
        let updateSql = 'UPDATE kost SET status = ?, sent_by = ?, sent_at = NOW() WHERE id IN (?)';
        const updateParams = ['sent', senderNumber || null, updateIds];
        await db.query(updateSql, updateParams);
        syncKostBackup();
    }

    return {
        success: true,
        updated: toUpdate,
        alreadySent,
        notFound,
        total: cleanIds.length
    };
}

async function setKostBatchStatus(ids, targetStatus, updatedBy = '', groupId = null) {
    await ensureAllTables();
    const db = getPool();
    const cleanGroupId = (groupId && String(groupId).endsWith('@g.us')) ? normalizeJid(groupId) : null;
    const cleanIds = Array.isArray(ids) ? [...new Set(ids.map(normalizeKostId).filter(Boolean))] : [];

    let s = String(targetStatus || 'pending').toLowerCase().trim();
    if (s === 'posted') s = 'published';
    if (!['pending', 'sent', 'published'].includes(s)) {
        return { success: false, message: `Status "${targetStatus}" tidak valid.` };
    }

    if (cleanIds.length === 0) {
        return { success: false, message: 'Tidak ada ID yang valid.' };
    }

    let query = 'SELECT id, name, status, sent_by, sent_at FROM kost WHERE id IN (?)';
    const params = [cleanIds];

    const [rows] = await db.query(query, params);
    const rowMap = new Map(rows.map(r => [r.id, r]));

    const toUpdate = [];
    const alreadySame = [];
    const notFound = [];

    for (const id of cleanIds) {
        const row = rowMap.get(id);
        if (!row) {
            notFound.push(id);
        } else if (row.status === s || (s === 'published' && row.status === 'posted')) {
            alreadySame.push(row);
        } else {
            toUpdate.push(row);
        }
    }

    if (toUpdate.length > 0) {
        const updateIds = toUpdate.map(r => r.id);
        let updateSql = '';
        let updateParams = [];

        if (s === 'pending') {
            updateSql = 'UPDATE kost SET status = ?, sent_by = NULL, sent_at = NULL WHERE id IN (?)';
            updateParams = ['pending', updateIds];
        } else {
            updateSql = 'UPDATE kost SET status = ?, sent_by = ?, sent_at = NOW() WHERE id IN (?)';
            updateParams = [s, updatedBy || null, updateIds];
        }

        await db.query(updateSql, updateParams);
        syncKostBackup();
    }

    return {
        success: true,
        status: s,
        updated: toUpdate,
        alreadyInStatus: alreadySame,
        notFound,
        total: cleanIds.length
    };
}

async function deleteKost(idOrGroup, groupIdOrId = null) {
    let targetId = idOrGroup;
    let targetGroup = groupIdOrId;

    if (typeof idOrGroup === 'string' && idOrGroup.endsWith('@g.us')) {
        targetGroup = idOrGroup;
        targetId = groupIdOrId;
    }

    if (!targetId) {
        return { success: false, message: 'ID kost wajib diisi.' };
    }

    const cleanId = normalizeKostId(targetId) || String(targetId).trim().toUpperCase();
    const cleanGroupId = (targetGroup && String(targetGroup).endsWith('@g.us')) ? normalizeJid(targetGroup) : null;

    await ensureAllTables();
    const db = getPool();

    const current = await getKostById(cleanId, cleanGroupId);
    if (!current) {
        return {
            success: false,
            notFound: true,
            message: `Kost dengan ID ${cleanId} tidak ditemukan.`
        };
    }

    let delSql = 'DELETE FROM kost WHERE id = ?';
    const delParams = [cleanId];
    await db.query(delSql, delParams);
    syncKostBackup();

    return {
        success: true,
        data: current
    };
}

async function updateKost(id, { name, instagram = undefined, tiktok = undefined, whatsapp = undefined, status, groupId = null, updatedBy = '' }) {
    if (!id) return { success: false, message: 'ID kost wajib diisi.' };
    const cleanId = normalizeKostId(id) || String(id).trim().toUpperCase();
    const cleanGroupId = (groupId && String(groupId).endsWith('@g.us')) ? normalizeJid(groupId) : null;

    await ensureAllTables();
    const db = getPool();

    const current = await getKostById(cleanId, cleanGroupId);
    if (!current) {
        return { success: false, notFound: true, message: `Kost dengan ID ${cleanId} tidak ditemukan.` };
    }

    const cleanName = name !== undefined ? String(name).trim() : current.name;
    const cleanIg = instagram !== undefined ? cleanInstagramUsername(instagram) : current.instagram;
    const cleanTt = tiktok !== undefined ? cleanTiktokUsername(tiktok) : current.tiktok;
    const cleanWa = whatsapp !== undefined ? cleanWhatsappNumber(whatsapp) : current.whatsapp;
    
    let cleanStatus = status !== undefined ? String(status).toLowerCase() : current.status;
    if (cleanStatus === 'posted') cleanStatus = 'published';
    if (!['pending', 'sent', 'published'].includes(cleanStatus)) cleanStatus = current.status || 'pending';

    let sentAt = current.sentAt;
    let sentBy = current.sentBy;

    if (cleanStatus === 'pending') {
        sentAt = null;
        sentBy = null;
    } else if ((cleanStatus === 'sent' || cleanStatus === 'published') && !current.sentAt) {
        sentAt = new Date();
        if (updatedBy) sentBy = updatedBy;
    }

    let sql = 'UPDATE kost SET name = ?, instagram = ?, tiktok = ?, whatsapp = ?, status = ?, sent_by = ?, sent_at = ? WHERE id = ?';
    const params = [cleanName, cleanIg, cleanTt, cleanWa, cleanStatus, sentBy || null, sentAt, cleanId];
    await db.query(sql, params);

    const updated = await getKostById(cleanId, cleanGroupId);
    syncKostBackup();

    return { success: true, message: 'Data kost berhasil diperbarui.', data: updated };
}

async function getKostStats(groupId = null) {
    await ensureAllTables();
    const db = getPool();
    const cleanGroupId = (groupId && String(groupId).endsWith('@g.us')) ? normalizeJid(groupId) : null;

    let sql = `
        SELECT 
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
            COALESCE(SUM(CASE WHEN status IN ('published', 'posted') THEN 1 ELSE 0 END), 0) AS published
        FROM kost
    `;
    const params = [];
    if (cleanGroupId) {
        sql += ' WHERE group_id = ?';
        params.push(cleanGroupId);
    }
    const [rows] = await db.query(sql, params);
    return {
        total: Number(rows[0]?.total || 0),
        pending: Number(rows[0]?.pending || 0),
        sent: Number(rows[0]?.sent || 0),
        published: Number(rows[0]?.published || 0)
    };
}

module.exports = {
    generateNextKostIdFromDb,
    syncKostBackup,
    getKostList,
    getKostListByGroup,
    getKostByStatus,
    getKostById,
    searchKost,
    addKost,
    setKostStatus,
    markKostSent,
    markSent: markKostSent,
    markKostBatchSent,
    setKostBatchStatus,
    markKostPublished,
    markPublished: markKostPublished,
    deleteKost,
    updateKost,
    getKostStats
};
