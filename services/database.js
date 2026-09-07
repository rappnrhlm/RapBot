require('dotenv').config();
const path = require('path');
const mysql = require('mysql2/promise');
const { readJSON, writeJSON } = require('../utils/json');
const { normalizePhoneNumber } = require('../utils/phone');
const { normalizeJid } = require('../utils/jid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OWNER_FILE = path.join(DATA_DIR, 'owners.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const LOG_FILE = path.join(DATA_DIR, 'command-log.json');
const WELCOME_FILE = path.join(DATA_DIR, 'welcome.json');
const AUTOREPLY_FILE = path.join(DATA_DIR, 'autoreplies.json');
const KOST_FILE = path.join(DATA_DIR, 'kost.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

const SUPER_OWNER = normalizePhoneNumber(process.env.SUPER_OWNER || '6285195532009');

function ensureDataFiles() {
    const fs = require('fs');
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(OWNER_FILE)) {
        writeJSON(OWNER_FILE, [
            { name: 'Raffa', number: SUPER_OWNER, hidden: false }
        ]);
    }

    if (!fs.existsSync(STATS_FILE)) {
        writeJSON(STATS_FILE, {
            messages: 0,
            commands: 0,
            stickers: 0,
            brats: 0,
            startedAt: new Date().toISOString(),
            commandUsage: {}
        });
    }

    if (!fs.existsSync(LOG_FILE)) {
        writeJSON(LOG_FILE, []);
    }

    if (!fs.existsSync(WELCOME_FILE)) {
        writeJSON(WELCOME_FILE, {
            enabled: true,
            text:
                '👋 Selamat datang @user di *@group*!\n\n' +
                'Semoga betah di sini 🤙\n' +
                'Ketik !menu untuk melihat fitur bot.'
        });
    }

    if (!fs.existsSync(AUTOREPLY_FILE)) {
        writeJSON(AUTOREPLY_FILE, []);
    }

    if (!fs.existsSync(KOST_FILE)) {
        writeJSON(KOST_FILE, []);
    }

    if (!fs.existsSync(GROUPS_FILE)) {
        writeJSON(GROUPS_FILE, { groups: [] });
    }
}

// ----------------------------------------------------
// OWNERS
// ----------------------------------------------------

function getOwners() {
    ensureDataFiles();
    const data = readJSON(OWNER_FILE, []);
    return Array.isArray(data) ? data : [];
}

function saveOwners(owners) {
    return writeJSON(OWNER_FILE, owners);
}

function isOwner(number, botNumber = null) {
    const normalized = normalizePhoneNumber(number);
    if (!normalized) return false;
    if (isSuperOwner(normalized)) return true;
    if (botNumber && normalizePhoneNumber(botNumber) === normalized) return true;
    return getOwners().some(owner => {
        const ownerNumber = typeof owner === 'object' ? owner.number : owner;
        return normalizePhoneNumber(ownerNumber) === normalized;
    });
}

function isSuperOwner(number) {
    const normalized = normalizePhoneNumber(number);
    return normalized === SUPER_OWNER;
}

function addOwner(number, name = 'Owner') {
    const cleanNumber = normalizePhoneNumber(number);
    if (!cleanNumber) return { success: false, message: 'Nomor tidak valid.' };

    const owners = getOwners();
    const exists = owners.some(o => {
        const ownerNumber = typeof o === 'object' ? o.number : o;
        return normalizePhoneNumber(ownerNumber) === cleanNumber;
    });

    if (exists) {
        return { success: false, message: `${cleanNumber} sudah menjadi owner.` };
    }

    owners.push({ name: name || 'Owner', number: cleanNumber, hidden: false });
    saveOwners(owners);
    return { success: true, message: `${cleanNumber} berhasil ditambahkan sebagai owner.`, owners };
}

function deleteOwner(number) {
    const cleanNumber = normalizePhoneNumber(number);
    if (!cleanNumber) return { success: false, message: 'Nomor tidak valid.' };
    if (cleanNumber === SUPER_OWNER) {
        return { success: false, message: 'Super owner tidak bisa dihapus.' };
    }

    const owners = getOwners();
    const initialLen = owners.length;
    const filtered = owners.filter(o => {
        const ownerNumber = typeof o === 'object' ? o.number : o;
        return normalizePhoneNumber(ownerNumber) !== cleanNumber;
    });

    if (filtered.length === initialLen) {
        return { success: false, message: 'Owner tidak ditemukan.' };
    }

    saveOwners(filtered);
    return { success: true, message: `${cleanNumber} berhasil dihapus dari owner.`, owners: filtered };
}

// ----------------------------------------------------
// STATS
// ----------------------------------------------------

function getStats() {
    ensureDataFiles();
    return readJSON(STATS_FILE, {
        messages: 0,
        commands: 0,
        stickers: 0,
        brats: 0,
        startedAt: new Date().toISOString(),
        commandUsage: {}
    });
}

function saveStats(stats) {
    return writeJSON(STATS_FILE, stats);
}

function incrementMessageStats() {
    const stats = getStats();
    stats.messages = (stats.messages || 0) + 1;
    saveStats(stats);
}

function incrementCommandStats(command) {
    if (!command) return;
    const stats = getStats();
    stats.commands = (stats.commands || 0) + 1;
    if (!stats.commandUsage) stats.commandUsage = {};
    stats.commandUsage[command] = (stats.commandUsage[command] || 0) + 1;
    saveStats(stats);
}

function incrementStickerStats() {
    const stats = getStats();
    stats.stickers = (stats.stickers || 0) + 1;
    saveStats(stats);
}

function incrementBratStats() {
    const stats = getStats();
    stats.brats = (stats.brats || 0) + 1;
    saveStats(stats);
}

// ----------------------------------------------------
// COMMAND LOGS
// ----------------------------------------------------

function getLogs() {
    ensureDataFiles();
    return readJSON(LOG_FILE, []);
}

function logCommand(command, from, senderNumber, isGroupChat = false) {
    const logs = getLogs();
    logs.push({
        command,
        from,
        sender: senderNumber || 'unknown',
        type: isGroupChat ? 'group' : 'private',
        timestamp: new Date().toISOString()
    });

    if (logs.length > 5000) {
        logs.splice(0, logs.length - 5000);
    }

    writeJSON(LOG_FILE, logs);
}

// ----------------------------------------------------
// WELCOME
// ----------------------------------------------------

function getWelcomeConfig() {
    ensureDataFiles();
    return readJSON(WELCOME_FILE, {
        enabled: true,
        text:
            '👋 Selamat datang @user di *@group*!\n\n' +
            'Semoga betah di sini 🤙\n' +
            'Ketik !menu untuk melihat fitur bot.'
    });
}

function saveWelcomeConfig(config) {
    return writeJSON(WELCOME_FILE, config);
}

// ----------------------------------------------------
// AUTOREPLIES
// ----------------------------------------------------

function getAutoreplies() {
    ensureDataFiles();
    const list = readJSON(AUTOREPLY_FILE, []);
    return Array.isArray(list) ? list : [];
}

function saveAutoreplies(list) {
    return writeJSON(AUTOREPLY_FILE, list);
}

function findAutoreply(trigger) {
    if (!trigger) return null;
    const normalized = trigger.trim().toLowerCase();
    const list = getAutoreplies();
    return list.find(item => item.trigger?.toLowerCase() === normalized) || null;
}

function addAutoreply(trigger, response, createdBy = 'owner') {
    if (!trigger || !response) {
        return { success: false, message: 'Trigger dan respons wajib diisi.' };
    }

    const list = getAutoreplies();
    const normalized = trigger.trim().toLowerCase();
    const existingIndex = list.findIndex(item => item.trigger?.toLowerCase() === normalized);

    if (existingIndex !== -1) {
        return { success: false, message: `Trigger "${trigger}" sudah ada. Gunakan edit untuk mengubahnya.` };
    }

    const newItem = {
        trigger: trigger.trim(),
        response: response.trim(),
        createdBy: createdBy || 'owner',
        createdAt: new Date().toISOString()
    };

    list.push(newItem);
    saveAutoreplies(list);
    return { success: true, message: `Autoreply untuk "${trigger}" berhasil ditambahkan.`, item: newItem };
}

function editAutoreply(trigger, newResponse, updatedBy = 'owner') {
    if (!trigger || !newResponse) {
        return { success: false, message: 'Trigger dan respons baru wajib diisi.' };
    }

    const list = getAutoreplies();
    const normalized = trigger.trim().toLowerCase();
    const item = list.find(i => i.trigger?.toLowerCase() === normalized);

    if (!item) {
        return { success: false, message: `Trigger "${trigger}" tidak ditemukan.` };
    }

    item.response = newResponse.trim();
    item.updatedBy = updatedBy;
    item.updatedAt = new Date().toISOString();

    saveAutoreplies(list);
    return { success: true, message: `Autoreply untuk "${trigger}" berhasil diubah.`, item };
}

function deleteAutoreply(trigger) {
    if (!trigger) return { success: false, message: 'Trigger wajib diisi.' };

    const list = getAutoreplies();
    const normalized = trigger.trim().toLowerCase();
    const index = list.findIndex(i => i.trigger?.toLowerCase() === normalized);

    if (index === -1) {
        return { success: false, message: `Trigger "${trigger}" tidak ditemukan.` };
    }

    list.splice(index, 1);
    saveAutoreplies(list);
    return { success: true, message: `Autoreply untuk "${trigger}" berhasil dihapus.` };
}

// ----------------------------------------------------
// MARIADB CONNECTION POOL & KOST REPOSITORY
// ----------------------------------------------------

let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || 'dbrapa',
            password: process.env.DB_PASSWORD || '090409',
            database: process.env.DB_NAME || 'RapDB',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            dateStrings: true
        });
    }
    return pool;
}

async function ensureKostTable() {
    const db = getPool();
    await db.query(`
        CREATE TABLE IF NOT EXISTS kost (
            id VARCHAR(20) NOT NULL PRIMARY KEY,
            group_id VARCHAR(100) NOT NULL,
            name VARCHAR(255) NOT NULL,
            instagram VARCHAR(100) DEFAULT NULL,
            tiktok VARCHAR(100) DEFAULT NULL,
            whatsapp VARCHAR(50) DEFAULT NULL,
            status ENUM('pending', 'sent') NOT NULL DEFAULT 'pending',
            added_by VARCHAR(100) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            sent_by VARCHAR(100) DEFAULT NULL,
            sent_at DATETIME DEFAULT NULL,
            INDEX idx_group_id (group_id),
            INDEX idx_group_status (group_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
        await db.query(`ALTER TABLE kost ADD COLUMN IF NOT EXISTS tiktok VARCHAR(100) NULL AFTER instagram`);
        await db.query(`ALTER TABLE kost ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50) NULL AFTER tiktok`);
        await db.query(`ALTER TABLE kost MODIFY COLUMN instagram VARCHAR(100) NULL DEFAULT NULL`);
    } catch {}
}

function cleanInstagramUsername(input) {
    if (!input) return null;
    let username = String(input).trim();
    username = username.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
    username = username.replace(/^@/, '');
    username = username.split(/[/?#]/)[0].trim();
    return username || null;
}

function formatInstagramUrl(username) {
    const clean = cleanInstagramUsername(username);
    if (!clean) return null;
    return `https://instagram.com/${clean}`;
}

function cleanTiktokUsername(input) {
    if (!input) return null;
    let username = String(input).trim();
    username = username.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '');
    username = username.replace(/^@/, '');
    username = username.split(/[/?#]/)[0].trim();
    return username || null;
}

function formatTiktokUrl(username) {
    const clean = cleanTiktokUsername(username);
    if (!clean) return null;
    return `https://www.tiktok.com/@${clean}`;
}

function cleanWhatsappNumber(input) {
    if (!input) return null;
    let num = String(input).trim();
    num = num.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)\/?/i, '');
    num = normalizePhoneNumber(num);
    return num || null;
}

function formatWhatsappUrl(number) {
    const clean = cleanWhatsappNumber(number);
    if (!clean) return null;
    return `https://wa.me/${clean}`;
}

function formatIndonesianDateTime(dateInput) {
    if (!dateInput) return '-';
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return String(dateInput);

        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const hr = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');

        return `${d}/${m}/${y} ${hr}:${min} WIB`;
    } catch {
        return String(dateInput);
    }
}

function mapKostRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        groupId: row.group_id,
        group_id: row.group_id,
        name: row.name,
        namaKost: row.name,
        instagram: row.instagram || null,
        tiktok: row.tiktok || null,
        whatsapp: row.whatsapp || null,
        status: row.status,
        addedBy: row.added_by,
        added_by: row.added_by,
        createdAt: row.created_at,
        created_at: row.created_at,
        sentBy: row.sent_by,
        sent_by: row.sent_by,
        sentAt: row.sent_at,
        sent_at: row.sent_at
    };
}

async function generateNextKostIdFromDb() {
    await ensureKostTable();
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

async function getKostList(groupId = null) {
    await ensureKostTable();
    const db = getPool();
    const cleanGroupId = groupId ? normalizeJid(groupId) : null;
    let query = 'SELECT * FROM kost';
    const params = [];
    if (cleanGroupId) {
        query += ' WHERE group_id = ?';
        params.push(cleanGroupId);
    }
    query += ' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC';
    const [rows] = await db.query(query, params);
    return rows.map(mapKostRow);
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

    await ensureKostTable();
    const db = getPool();
    const cleanGroupId = targetGroup ? normalizeJid(targetGroup) : null;
    let query = 'SELECT * FROM kost WHERE status = ?';
    const params = [s];
    if (cleanGroupId) {
        query += ' AND group_id = ?';
        params.push(cleanGroupId);
    }
    query += ' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC';
    const [rows] = await db.query(query, params);
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
    const cleanId = String(targetId).trim().toUpperCase();
    const cleanGroupId = targetGroup ? normalizeJid(targetGroup) : null;

    await ensureKostTable();
    const db = getPool();
    let query = 'SELECT * FROM kost WHERE id = ?';
    const params = [cleanId];
    if (cleanGroupId) {
        query += ' AND group_id = ?';
        params.push(cleanGroupId);
    }
    const [rows] = await db.query(query, params);
    return rows.length > 0 ? mapKostRow(rows[0]) : null;
}

async function searchKost(queryOrGroup, groupIdOrQuery = null) {
    let targetQuery = queryOrGroup;
    let targetGroup = groupIdOrQuery;

    if (typeof queryOrGroup === 'string' && queryOrGroup.endsWith('@g.us')) {
        targetGroup = queryOrGroup;
        targetQuery = groupIdOrQuery;
    }

    if (!targetQuery) return [];
    const q = String(targetQuery).trim().toLowerCase();
    const cleanGroupId = targetGroup ? normalizeJid(targetGroup) : null;

    await ensureKostTable();
    const db = getPool();
    let sql = `SELECT * FROM kost WHERE (
        LOWER(name) LIKE ? OR 
        LOWER(COALESCE(instagram, '')) LIKE ? OR 
        LOWER(COALESCE(tiktok, '')) LIKE ? OR 
        LOWER(COALESCE(whatsapp, '')) LIKE ? OR 
        LOWER(id) LIKE ?
    )`;
    const likePattern = `%${q}%`;
    const params = [likePattern, likePattern, likePattern, likePattern, likePattern];

    if (cleanGroupId) {
        sql += ' AND group_id = ?';
        params.push(cleanGroupId);
    }
    sql += ' ORDER BY CAST(SUBSTRING(id, 5) AS UNSIGNED) ASC';
    const [rows] = await db.query(sql, params);
    return rows.map(mapKostRow);
}

async function addKost({ name, instagram = null, tiktok = null, whatsapp = null, addedBy = '', groupId = '' }) {
    await ensureKostTable();
    const cleanName = String(name || '').trim();
    const cleanIg = cleanInstagramUsername(instagram);
    const cleanTt = cleanTiktokUsername(tiktok);
    const cleanWa = cleanWhatsappNumber(whatsapp);
    const cleanGroupId = groupId ? normalizeJid(groupId) : '';

    if (!cleanName) {
        return { success: false, message: 'Nama kost wajib diisi.' };
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

    await db.query(
        `INSERT INTO kost (id, group_id, name, instagram, tiktok, whatsapp, status, added_by, created_at, sent_by, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL, NULL)`,
        [nextId, cleanGroupId, cleanName, cleanIg, cleanTt, cleanWa, addedBy || null, now]
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
        status: 'pending',
        addedBy: addedBy || null,
        added_by: addedBy || null,
        createdAt: now.toISOString(),
        created_at: now.toISOString(),
        sentBy: null,
        sent_by: null,
        sentAt: null,
        sent_at: null
    };

    return {
        success: true,
        message: `Kost "${cleanName}" berhasil ditambahkan.`,
        data: newRecord
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
            targetSentBy = arg2 || '';
            targetGroup = arg3 || null;
        }
    }

    const cleanId = String(targetId || '').trim().toUpperCase();
    const cleanGroupId = targetGroup ? normalizeJid(targetGroup) : null;

    if (!cleanId) {
        return { success: false, message: 'ID kost wajib diisi.' };
    }

    await ensureKostTable();
    const db = getPool();

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
            message: `Kost dengan ID ${cleanId} sudah berstatus sent sebelumnya.`,
            data: current
        };
    }

    const now = new Date();
    let updateSql = 'UPDATE kost SET status = ?, sent_by = ?, sent_at = ? WHERE id = ?';
    const updateParams = ['sent', targetSentBy || null, now, cleanId];
    if (cleanGroupId) {
        updateSql += ' AND group_id = ?';
        updateParams.push(cleanGroupId);
    }
    await db.query(updateSql, updateParams);

    const updated = await getKostById(cleanId, cleanGroupId);
    return {
        success: true,
        data: updated
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

    const cleanId = String(targetId).trim().toUpperCase();
    const cleanGroupId = targetGroup ? normalizeJid(targetGroup) : null;

    await ensureKostTable();
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
    if (cleanGroupId) {
        delSql += ' AND group_id = ?';
        delParams.push(cleanGroupId);
    }
    await db.query(delSql, delParams);

    return {
        success: true,
        data: current
    };
}

async function updateKost(id, { name, instagram = undefined, tiktok = undefined, whatsapp = undefined, status, groupId = null }) {
    if (!id) return { success: false, message: 'ID kost wajib diisi.' };
    const cleanId = String(id).trim().toUpperCase();
    const cleanGroupId = groupId ? normalizeJid(groupId) : null;

    await ensureKostTable();
    const db = getPool();

    const current = await getKostById(cleanId, cleanGroupId);
    if (!current) {
        return { success: false, notFound: true, message: `Kost dengan ID ${cleanId} tidak ditemukan.` };
    }

    const cleanName = name !== undefined ? String(name).trim() : current.name;
    const cleanIg = instagram !== undefined ? cleanInstagramUsername(instagram) : current.instagram;
    const cleanTt = tiktok !== undefined ? cleanTiktokUsername(tiktok) : current.tiktok;
    const cleanWa = whatsapp !== undefined ? cleanWhatsappNumber(whatsapp) : current.whatsapp;
    const cleanStatus = status ? String(status).toLowerCase() : current.status;

    let sentAt = current.sentAt;
    if (cleanStatus === 'sent' && current.status !== 'sent') {
        sentAt = new Date();
    } else if (cleanStatus === 'pending') {
        sentAt = null;
    }

    let sql = 'UPDATE kost SET name = ?, instagram = ?, tiktok = ?, whatsapp = ?, status = ?, sent_at = ? WHERE id = ?';
    const params = [cleanName, cleanIg, cleanTt, cleanWa, cleanStatus, sentAt, cleanId];
    if (cleanGroupId) {
        sql += ' AND group_id = ?';
        params.push(cleanGroupId);
    }
    await db.query(sql, params);

    const updated = await getKostById(cleanId, cleanGroupId);
    return { success: true, message: 'Data kost berhasil diperbarui.', data: updated };
}

async function getKostStats(groupId = null) {
    await ensureKostTable();
    const db = getPool();
    const cleanGroupId = groupId ? normalizeJid(groupId) : null;

    let sql = `
        SELECT 
            COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END), 0) AS sent
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
        sent: Number(rows[0]?.sent || 0)
    };
}

// ----------------------------------------------------
// GROUPS REPOSITORY (PERSISTENT REGISTRATION)
// ----------------------------------------------------

function getGroups() {
    ensureDataFiles();
    const data = readJSON(GROUPS_FILE, { groups: [] });
    if (Array.isArray(data?.groups)) {
        return data.groups;
    }
    return Array.isArray(data) ? data : [];
}

function saveGroups(groups) {
    return writeJSON(GROUPS_FILE, {
        groups: Array.isArray(groups) ? groups : []
    });
}

function getGroupById(groupId) {
    if (!groupId) return null;
    const targetId = normalizeJid(groupId);
    const groups = getGroups();
    return groups.find(g => normalizeJid(g.id) === targetId) || null;
}

function isGroupInitialized(groupId) {
    return Boolean(getGroupById(groupId));
}

function addGroup({ id, name, groupName = '', initializedBy = '' }) {
    const cleanId = normalizeJid(id);
    const cleanName = String(name || '').trim();
    const cleanGroupName = String(groupName || '').trim();

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

    const groups = getGroups();
    const newGroup = {
        id: cleanId,
        name: cleanName,
        groupName: cleanGroupName,
        initializedAt: new Date().toISOString(),
        initializedBy: String(initializedBy || '').trim()
    };

    groups.push(newGroup);
    saveGroups(groups);

    return {
        success: true,
        alreadyExists: false,
        group: newGroup,
        message: `Grup berhasil diinisialisasi sebagai "${newGroup.name}".`
    };
}

module.exports = {
    DATA_DIR,
    SUPER_OWNER,
    ensureDataFiles,

    // Owners
    getOwners,
    saveOwners,
    isOwner,
    isSuperOwner,
    addOwner,
    deleteOwner,

    // Stats
    getStats,
    saveStats,
    incrementMessageStats,
    incrementCommandStats,
    incrementStickerStats,
    incrementBratStats,

    // Logs
    getLogs,
    logCommand,

    // Welcome
    getWelcomeConfig,
    saveWelcomeConfig,

    // Autoreply
    getAutoreplies,
    saveAutoreplies,
    findAutoreply,
    addAutoreply,
    editAutoreply,
    deleteAutoreply,

    // Kost (MariaDB Single Source of Truth)
    getPool,
    ensureKostTable,
    cleanInstagramUsername,
    formatInstagramUrl,
    cleanTiktokUsername,
    formatTiktokUrl,
    cleanWhatsappNumber,
    formatWhatsappUrl,
    formatIndonesianDateTime,
    getKostList,
    getKostListByGroup,
    getKostByStatus,
    getKostById,
    searchKost,
    addKost,
    markKostSent,
    markSent: markKostSent,
    deleteKost,
    updateKost,
    getKostStats,

    // Groups (Persistent Registration)
    GROUPS_FILE,
    getGroups,
    saveGroups,
    getGroupById,
    isGroupInitialized,
    addGroup
};
