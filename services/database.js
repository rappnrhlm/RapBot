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
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'kost_submissions.json');

const SUPER_OWNER = normalizePhoneNumber(process.env.SUPER_OWNER || '6285195532009');

const INITIAL_GROUP = {
    id: '120363429518970623@g.us',
    name: 'Bukittinggi Kos',
    groupName: 'admin @bukittinggikos',
    type: 'kos',
    role: 'admin',
    parentGroupId: null,
    settings: {},
    initializedAt: '2026-09-07T14:38:00.333Z',
    initializedBy: '6285195532009'
};

const DEFAULT_WELCOME = {
    enabled: true,
    text:
        '👋 Selamat datang @user di *@group*!\n\n' +
        'Semoga betah di sini 🤙\n' +
        'Ketik !menu untuk melihat fitur bot.'
};

const INITIAL_KOST = [
    { id: 'KST-000001', group_id: '120363429518970623@g.us', name: 'Kost Farrel', instagram: 'kostfarrel_bukittinggi', tiktok: null, whatsapp: null, status: 'sent', added_by: '6285195532009', created_at: '2026-09-07 21:45:55', sent_by: '6282171641083', sent_at: '2026-09-07 23:00:39' },
    { id: 'KST-000002', group_id: '120363429518970623@g.us', name: 'Kost Putri Enam Dua', instagram: 'kostputrienamdua', tiktok: null, whatsapp: null, status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 22:53:25', sent_by: null, sent_at: null },
    { id: 'KST-000003', group_id: '120363429518970623@g.us', name: 'Kost Al Hazen', instagram: 'kost_al_hazen_bukittinggi', tiktok: null, whatsapp: null, status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:08:31', sent_by: null, sent_at: null },
    { id: 'KST-000004', group_id: '120363429518970623@g.us', name: 'Kos Gunapaksi', instagram: 'suchi_putri', tiktok: null, whatsapp: null, status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:12:40', sent_by: null, sent_at: null },
    { id: 'KST-000005', group_id: '120363429518970623@g.us', name: 'Fatimah Guesthouse', instagram: 'fatimah_guesthouse', tiktok: null, whatsapp: null, status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:14:55', sent_by: null, sent_at: null },
    { id: 'KST-000006', group_id: '120363429518970623@g.us', name: 'Kost Putri', instagram: 'dhiyazzu_', tiktok: null, whatsapp: null, status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:16:04', sent_by: null, sent_at: null },
    { id: 'KST-000007', group_id: '120363429518970623@g.us', name: 'Mubarak Homestay & Kost', instagram: 'mubarak_homestaybkt', tiktok: null, whatsapp: null, status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:28:57', sent_by: null, sent_at: null },
    { id: 'KST-000008', group_id: '120363429518970623@g.us', name: 'Sabila Homestay', instagram: 'sabilahomestay', tiktok: null, whatsapp: '6282283771685', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:30:04', sent_by: null, sent_at: null },
    { id: 'KST-000009', group_id: '120363429518970623@g.us', name: 'Kos Putri Tangah Sawah', instagram: null, tiktok: null, whatsapp: '6281268201018', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:33:03', sent_by: null, sent_at: null },
    { id: 'KST-000010', group_id: '120363429518970623@g.us', name: 'Kontrakan Jorong Tampaik', instagram: null, tiktok: null, whatsapp: '6285760271400', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:34:00', sent_by: null, sent_at: null },
    { id: 'KST-000011', group_id: '120363429518970623@g.us', name: 'Kontrakan jl.Cangkiang', instagram: null, tiktok: null, whatsapp: '6281267075917', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:35:18', sent_by: null, sent_at: null },
    { id: 'KST-000012', group_id: '120363429518970623@g.us', name: 'Kost di Birugo', instagram: null, tiktok: null, whatsapp: '6281374043580', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:36:03', sent_by: null, sent_at: null },
    { id: 'KST-000013', group_id: '120363429518970623@g.us', name: 'Kontrakan simpang pakan ladang', instagram: null, tiktok: null, whatsapp: '6281372282374', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:37:11', sent_by: null, sent_at: null },
    { id: 'KST-000014', group_id: '120363429518970623@g.us', name: 'Kost Putri dekat UIN', instagram: 'kost_uin_bukittinggi', tiktok: null, whatsapp: '6285718745033', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:38:26', sent_by: null, sent_at: null },
    { id: 'KST-000015', group_id: '120363429518970623@g.us', name: 'Rumah Kita', instagram: null, tiktok: null, whatsapp: '6281277224179', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:39:31', sent_by: null, sent_at: null },
    { id: 'KST-000016', group_id: '120363429518970623@g.us', name: 'Kost Putri Gulai Bancah', instagram: null, tiktok: null, whatsapp: '6288279032407', status: 'pending', added_by: '6285195532009', created_at: '2026-09-07 23:40:21', sent_by: null, sent_at: null }
];

// ====================================================
// IN-MEMORY CACHE (ULTRA LOW-LATENCY 0MS READS)
// ====================================================
const cache = {
    owners: [],
    groups: [],
    autoreplies: [],
    welcome: { ...DEFAULT_WELCOME },
    stats: {
        messages: 0,
        commands: 0,
        stickers: 0,
        brats: 0,
        startedAt: new Date().toISOString(),
        commandUsage: {}
    },
    logs: [],
    submissions: [],
    initialized: false
};

// Initial synchronous hydration from local JSON backup
function initLocalCache() {
    try {
        const rawOwners = readJSON(OWNER_FILE, null);
        if (Array.isArray(rawOwners) && rawOwners.length > 0) {
            cache.owners = rawOwners;
        } else {
            cache.owners = [{ name: 'Raffa', number: SUPER_OWNER, hidden: false }];
        }

        const rawGroups = readJSON(GROUPS_FILE, null);
        if (Array.isArray(rawGroups?.groups)) {
            cache.groups = rawGroups.groups;
        } else if (Array.isArray(rawGroups)) {
            cache.groups = rawGroups;
        } else {
            cache.groups = [INITIAL_GROUP];
        }

        const rawAutoreplies = readJSON(AUTOREPLY_FILE, null);
        if (Array.isArray(rawAutoreplies)) {
            cache.autoreplies = rawAutoreplies;
        }

        const rawWelcome = readJSON(WELCOME_FILE, null);
        if (rawWelcome && typeof rawWelcome === 'object') {
            cache.welcome = { ...DEFAULT_WELCOME, ...rawWelcome };
        }

        const rawStats = readJSON(STATS_FILE, null);
        if (rawStats && typeof rawStats === 'object') {
            cache.stats = { ...cache.stats, ...rawStats };
        }

        const rawLogs = readJSON(LOG_FILE, null);
        if (Array.isArray(rawLogs)) {
            cache.logs = rawLogs;
        }

        const rawSubmissions = readJSON(SUBMISSIONS_FILE, null);
        if (Array.isArray(rawSubmissions)) {
            cache.submissions = rawSubmissions;
        }
    } catch (err) {
        console.warn('[database] Warning: error initializing local cache:', err.message);
    }
}

// Ensure local data files exist as fallback / backup
function ensureDataFiles() {
    const fs = require('fs');
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(OWNER_FILE)) writeJSON(OWNER_FILE, cache.owners);
    if (!fs.existsSync(STATS_FILE)) writeJSON(STATS_FILE, cache.stats);
    if (!fs.existsSync(LOG_FILE)) writeJSON(LOG_FILE, cache.logs);
    if (!fs.existsSync(WELCOME_FILE)) writeJSON(WELCOME_FILE, cache.welcome);
    if (!fs.existsSync(AUTOREPLY_FILE)) writeJSON(AUTOREPLY_FILE, cache.autoreplies);
    if (!fs.existsSync(GROUPS_FILE)) writeJSON(GROUPS_FILE, { groups: cache.groups });
    if (!fs.existsSync(KOST_FILE)) writeJSON(KOST_FILE, []);
    if (!fs.existsSync(SUBMISSIONS_FILE)) writeJSON(SUBMISSIONS_FILE, []);
}

initLocalCache();

// Helper to write backup JSON files
function syncDataFile(file, data) {
    try {
        writeJSON(file, data);
    } catch {}
}

// ====================================================
// MARIADB CONNECTION POOL
// ====================================================
let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || 'armbian',
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

// ====================================================
// TABLE DEFINITIONS & AUTO-MIGRATION
// ====================================================

async function ensureAllTables() {
    const db = getPool();

    // 1. Table: kost
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

    // 2. Table: bot_groups (Persistent Group Registration)
    await db.query(`
        CREATE TABLE IF NOT EXISTS bot_groups (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            group_name VARCHAR(255) DEFAULT '',
            type VARCHAR(50) NOT NULL DEFAULT 'kos',
            role VARCHAR(20) NOT NULL DEFAULT 'admin',
            parent_group_id VARCHAR(100) DEFAULT NULL,
            settings_json TEXT DEFAULT NULL,
            initialized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            initialized_by VARCHAR(100) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'kos' AFTER name`);
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER type`);
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS parent_group_id VARCHAR(100) NULL DEFAULT NULL AFTER role`);
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS settings_json TEXT NULL DEFAULT NULL AFTER parent_group_id`);
    } catch {}

    // 2b. Table: kost_submissions (Crowdsourcing Usul Kos)
    await db.query(`
        CREATE TABLE IF NOT EXISTS kost_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            group_id VARCHAR(100) NOT NULL,
            name VARCHAR(255) NOT NULL,
            contacts_raw TEXT NOT NULL,
            submitted_by VARCHAR(100) NOT NULL,
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            reviewed_by VARCHAR(100) DEFAULT NULL,
            reviewed_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Table: autoreplies (Dynamic Multi-Trigger Autoreply)
    await db.query(`
        CREATE TABLE IF NOT EXISTS autoreplies (
            id INT AUTO_INCREMENT PRIMARY KEY,
            trigger_name VARCHAR(255) NOT NULL,
            triggers_json TEXT NOT NULL,
            response TEXT NOT NULL,
            created_by VARCHAR(100) DEFAULT 'owner',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_by VARCHAR(100) DEFAULT NULL,
            updated_at DATETIME DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
        await db.query(`ALTER TABLE autoreplies ADD COLUMN IF NOT EXISTS group_id VARCHAR(100) NULL DEFAULT NULL AFTER response`);
    } catch {}

    // 4. Table: owners (Super Owner & Bot Owners)
    await db.query(`
        CREATE TABLE IF NOT EXISTS owners (
            number VARCHAR(50) NOT NULL PRIMARY KEY,
            name VARCHAR(100) NOT NULL DEFAULT 'Owner',
            hidden TINYINT(1) NOT NULL DEFAULT 0,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Table: welcome_settings (Greeting Configuration)
    await db.query(`
        CREATE TABLE IF NOT EXISTS welcome_settings (
            id VARCHAR(50) NOT NULL PRIMARY KEY DEFAULT 'default',
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            text TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Table: bot_stats (Bot Usage Counters)
    await db.query(`
        CREATE TABLE IF NOT EXISTS bot_stats (
            id VARCHAR(50) NOT NULL PRIMARY KEY DEFAULT 'main',
            messages INT NOT NULL DEFAULT 0,
            commands INT NOT NULL DEFAULT 0,
            stickers INT NOT NULL DEFAULT 0,
            brats INT NOT NULL DEFAULT 0,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            command_usage_json LONGTEXT DEFAULT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Table: command_logs (Command Execution Logs)
    await db.query(`
        CREATE TABLE IF NOT EXISTS command_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            command VARCHAR(100) NOT NULL,
            from_jid VARCHAR(100) NOT NULL,
            sender VARCHAR(100) NOT NULL,
            type ENUM('group', 'private') NOT NULL DEFAULT 'private',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_cmd_time (command, timestamp),
            INDEX idx_sender (sender)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Auto-seed tables if they are empty
    await autoSeedTablesIfEmpty(db);

    // Refresh in-memory cache with canonical MariaDB data
    await refreshDatabaseCache();
}

async function autoSeedTablesIfEmpty(db) {
    // 1. Seed kost
    try {
        const [cntRows] = await db.query('SELECT COUNT(*) as cnt FROM kost');
        if (cntRows[0]?.cnt === 0) {
            for (const k of INITIAL_KOST) {
                await db.query(
                    `INSERT IGNORE INTO kost (id, group_id, name, instagram, tiktok, whatsapp, status, added_by, created_at, sent_by, sent_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [k.id, k.group_id, k.name, k.instagram, k.tiktok, k.whatsapp, k.status, k.added_by, k.created_at, k.sent_by, k.sent_at]
                );
            }
            console.log('[database] Auto-seeded 16 data kost awal ke MariaDB.');
        }
    } catch (e) {
        console.error('[database] Auto-seed kost check error:', e.message);
    }

    // 2. Seed bot_groups
    try {
        const [cntGroups] = await db.query('SELECT COUNT(*) as cnt FROM bot_groups');
        if (cntGroups[0]?.cnt === 0) {
            const fileGroups = readJSON(GROUPS_FILE, null);
            const list = Array.isArray(fileGroups?.groups) ? fileGroups.groups : (Array.isArray(fileGroups) ? fileGroups : [INITIAL_GROUP]);
            for (const g of list) {
                if (!g?.id) continue;
                await db.query(
                    `INSERT IGNORE INTO bot_groups (id, name, group_name, initialized_at, initialized_by)
                     VALUES (?, ?, ?, ?, ?)`,
                    [g.id, g.name || 'Grup', g.groupName || '', g.initializedAt ? new Date(g.initializedAt) : new Date(), g.initializedBy || '']
                );
            }
            console.log(`[database] Auto-seeded ${list.length} bot_groups ke MariaDB.`);
        }
    } catch (e) {
        console.error('[database] Auto-seed bot_groups check error:', e.message);
    }

    // 3. Seed autoreplies
    try {
        const [cntAutoreplies] = await db.query('SELECT COUNT(*) as cnt FROM autoreplies');
        if (cntAutoreplies[0]?.cnt === 0) {
            const fileAutoreplies = readJSON(AUTOREPLY_FILE, []);
            if (Array.isArray(fileAutoreplies) && fileAutoreplies.length > 0) {
                for (const item of fileAutoreplies) {
                    const trigName = item.trigger || (Array.isArray(item.triggers) ? item.triggers.join(' / ') : '!help');
                    const trigJson = JSON.stringify(Array.isArray(item.triggers) ? item.triggers : [trigName]);
                    await db.query(
                        `INSERT INTO autoreplies (trigger_name, triggers_json, response, group_id, created_by, created_at, updated_by, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            trigName,
                            trigJson,
                            item.response || '',
                            item.groupId || null,
                            item.createdBy || 'owner',
                            item.createdAt ? new Date(item.createdAt) : new Date(),
                            item.updatedBy || null,
                            item.updatedAt ? new Date(item.updatedAt) : null
                        ]
                    );
                }
                console.log(`[database] Auto-seeded ${fileAutoreplies.length} autoreplies ke MariaDB.`);
            }
        }
    } catch (e) {
        console.error('[database] Auto-seed autoreplies check error:', e.message);
    }

    // 4. Seed owners
    try {
        const [cntOwners] = await db.query('SELECT COUNT(*) as cnt FROM owners');
        if (cntOwners[0]?.cnt === 0) {
            const fileOwners = readJSON(OWNER_FILE, []);
            const list = Array.isArray(fileOwners) && fileOwners.length > 0
                ? fileOwners
                : [{ name: 'Raffa', number: SUPER_OWNER, hidden: false }];

            for (const o of list) {
                const num = normalizePhoneNumber(typeof o === 'object' ? o.number : o);
                if (!num) continue;
                const name = (typeof o === 'object' && o.name) ? o.name : 'Owner';
                const hidden = Boolean(typeof o === 'object' && o.hidden);
                await db.query(
                    `INSERT IGNORE INTO owners (number, name, hidden, added_at)
                     VALUES (?, ?, ?, NOW())`,
                    [num, name, hidden ? 1 : 0]
                );
            }
            console.log(`[database] Auto-seeded ${list.length} owners ke MariaDB.`);
        }
    } catch (e) {
        console.error('[database] Auto-seed owners check error:', e.message);
    }

    // 5. Seed welcome_settings
    try {
        const [rows] = await db.query("SELECT id FROM welcome_settings WHERE id = 'default'");
        if (rows.length === 0) {
            const fileWelcome = readJSON(WELCOME_FILE, DEFAULT_WELCOME);
            await db.query(
                `INSERT INTO welcome_settings (id, enabled, text)
                 VALUES ('default', ?, ?)`,
                [fileWelcome.enabled ? 1 : 0, fileWelcome.text || DEFAULT_WELCOME.text]
            );
            console.log('[database] Auto-seeded welcome_settings ke MariaDB.');
        }
    } catch (e) {
        console.error('[database] Auto-seed welcome_settings check error:', e.message);
    }

    // 6. Seed bot_stats
    try {
        const [rows] = await db.query("SELECT id FROM bot_stats WHERE id = 'main'");
        if (rows.length === 0) {
            const fileStats = readJSON(STATS_FILE, cache.stats);
            await db.query(
                `INSERT INTO bot_stats (id, messages, commands, stickers, brats, started_at, command_usage_json)
                 VALUES ('main', ?, ?, ?, ?, ?, ?)`,
                [
                    fileStats.messages || 0,
                    fileStats.commands || 0,
                    fileStats.stickers || 0,
                    fileStats.brats || 0,
                    fileStats.startedAt ? new Date(fileStats.startedAt) : new Date(),
                    JSON.stringify(fileStats.commandUsage || {})
                ]
            );
            console.log('[database] Auto-seeded bot_stats ke MariaDB.');
        }
    } catch (e) {
        console.error('[database] Auto-seed bot_stats check error:', e.message);
    }
}

// Refresh in-memory cache directly from MariaDB
async function refreshDatabaseCache() {
    const db = getPool();

    try {
        // 1. Refresh Owners
        const [ownerRows] = await db.query('SELECT number, name, hidden FROM owners ORDER BY added_at ASC');
        if (ownerRows.length > 0) {
            cache.owners = ownerRows.map(r => ({
                number: r.number,
                name: r.name,
                hidden: Boolean(r.hidden)
            }));
            syncDataFile(OWNER_FILE, cache.owners);
        }

        // 2. Refresh Groups
        const [groupRows] = await db.query('SELECT id, name, group_name, type, role, parent_group_id, settings_json, initialized_at, initialized_by FROM bot_groups');
        if (groupRows.length > 0) {
            cache.groups = groupRows.map(r => {
                let settings = {};
                try {
                    settings = typeof r.settings_json === 'string' ? JSON.parse(r.settings_json) : (r.settings_json || {});
                } catch {}
                return {
                    id: r.id,
                    name: r.name,
                    groupName: r.group_name || '',
                    type: r.type || 'kos',
                    role: r.role || 'admin',
                    parentGroupId: r.parent_group_id || null,
                    settings: settings || {},
                    initializedAt: r.initialized_at,
                    initializedBy: r.initialized_by || ''
                };
            });
            syncDataFile(GROUPS_FILE, { groups: cache.groups });
        }

        // 2b. Refresh Kost Submissions
        try {
            const [subRows] = await db.query('SELECT id, group_id, name, contacts_raw, submitted_by, submitted_at, status, reviewed_by, reviewed_at FROM kost_submissions ORDER BY id DESC');
            cache.submissions = subRows.map(r => ({
                id: r.id,
                groupId: r.group_id,
                name: r.name,
                contactsRaw: r.contacts_raw,
                submittedBy: r.submitted_by,
                submittedAt: r.submitted_at,
                status: r.status,
                reviewedBy: r.reviewed_by,
                reviewedAt: r.reviewed_at
            }));
            syncDataFile(SUBMISSIONS_FILE, cache.submissions);
        } catch (subErr) {
            console.warn('[database] Warning reading submissions from MariaDB:', subErr.message);
        }

        // 3. Refresh Autoreplies
        const [autoRows] = await db.query('SELECT id, trigger_name, triggers_json, response, group_id, created_by, created_at, updated_by, updated_at FROM autoreplies ORDER BY id ASC');
        cache.autoreplies = autoRows.map(r => {
            let triggers = [];
            try {
                triggers = JSON.parse(r.triggers_json);
            } catch {
                triggers = [r.trigger_name];
            }
            return {
                id: r.id,
                trigger: r.trigger_name,
                triggers,
                response: r.response,
                groupId: r.group_id || null,
                createdBy: r.created_by,
                createdAt: r.created_at,
                updatedBy: r.updated_by,
                updatedAt: r.updated_at
            };
        });
        syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

        // 4. Refresh Welcome
        const [welcomeRows] = await db.query("SELECT enabled, text FROM welcome_settings WHERE id = 'default'");
        if (welcomeRows.length > 0) {
            cache.welcome = {
                enabled: Boolean(welcomeRows[0].enabled),
                text: welcomeRows[0].text
            };
            syncDataFile(WELCOME_FILE, cache.welcome);
        }

        // 5. Refresh Stats
        const [statsRows] = await db.query("SELECT messages, commands, stickers, brats, started_at, command_usage_json FROM bot_stats WHERE id = 'main'");
        if (statsRows.length > 0) {
            let usage = {};
            try {
                usage = JSON.parse(statsRows[0].command_usage_json || '{}');
            } catch {}
            cache.stats = {
                messages: Number(statsRows[0].messages || 0),
                commands: Number(statsRows[0].commands || 0),
                stickers: Number(statsRows[0].stickers || 0),
                brats: Number(statsRows[0].brats || 0),
                startedAt: statsRows[0].started_at,
                commandUsage: usage
            };
            syncDataFile(STATS_FILE, cache.stats);
        }

        cache.initialized = true;
    } catch (err) {
        console.error('[database] Error refreshing cache from MariaDB:', err.message);
    }
}

// ====================================================
// OWNERS REPOSITORY
// ====================================================

function getOwners() {
    return cache.owners;
}

async function saveOwners(owners) {
    if (!Array.isArray(owners)) return;
    cache.owners = owners;
    syncDataFile(OWNER_FILE, owners);

    try {
        const db = getPool();
        for (const o of owners) {
            const num = normalizePhoneNumber(typeof o === 'object' ? o.number : o);
            if (!num) continue;
            const name = (typeof o === 'object' && o.name) ? o.name : 'Owner';
            const hidden = Boolean(typeof o === 'object' && o.hidden);
            await db.query(
                `INSERT INTO owners (number, name, hidden, added_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE name = VALUES(name), hidden = VALUES(hidden)`,
                [num, name, hidden ? 1 : 0]
            );
        }
    } catch (err) {
        console.error('[database] Error saving owners to MariaDB:', err.message);
    }
}

function isOwner(number, botNumber = null) {
    const normalized = normalizePhoneNumber(number);
    if (!normalized) return false;
    if (isSuperOwner(normalized)) return true;
    if (botNumber && normalizePhoneNumber(botNumber) === normalized) return true;
    return cache.owners.some(owner => {
        const ownerNumber = typeof owner === 'object' ? owner.number : owner;
        return normalizePhoneNumber(ownerNumber) === normalized;
    });
}

function isSuperOwner(number) {
    const normalized = normalizePhoneNumber(number);
    return normalized === SUPER_OWNER;
}

async function addOwner(number, name = 'Owner') {
    const cleanNumber = normalizePhoneNumber(number);
    if (!cleanNumber) return { success: false, message: 'Nomor tidak valid.' };

    const exists = cache.owners.some(o => {
        const ownerNumber = typeof o === 'object' ? o.number : o;
        return normalizePhoneNumber(ownerNumber) === cleanNumber;
    });

    if (exists) {
        return { success: false, message: `${cleanNumber} sudah menjadi owner.` };
    }

    const newOwner = { name: name || 'Owner', number: cleanNumber, hidden: false };
    cache.owners.push(newOwner);
    syncDataFile(OWNER_FILE, cache.owners);

    try {
        const db = getPool();
        await db.query(
            `INSERT INTO owners (number, name, hidden, added_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE name = VALUES(name), hidden = VALUES(hidden)`,
            [newOwner.number, newOwner.name, newOwner.hidden ? 1 : 0]
        );
    } catch (err) {
        console.error('[database] Error inserting owner to MariaDB:', err.message);
    }

    return { success: true, message: `${cleanNumber} berhasil ditambahkan sebagai owner.`, owners: cache.owners };
}

async function updateOwner(oldNumber, { name, number, hidden = false }) {
    const cleanOld = normalizePhoneNumber(oldNumber);
    const cleanNew = normalizePhoneNumber(number);
    const cleanName = String(name || '').trim();

    if (!cleanOld || !cleanNew) return { success: false, message: 'Nomor tidak valid.' };
    if (!cleanName) return { success: false, message: 'Nama wajib diisi.' };

    const index = cache.owners.findIndex(o => normalizePhoneNumber(o.number) === cleanOld);
    if (index === -1) {
        return { success: false, message: 'Owner tidak ditemukan.' };
    }

    // Check conflict if changing to another existing number
    if (cleanOld !== cleanNew) {
        const duplicate = cache.owners.some((o, i) => i !== index && normalizePhoneNumber(o.number) === cleanNew);
        if (duplicate) {
            return { success: false, message: 'Nomor tersebut sudah digunakan owner lain.' };
        }
    }

    const updated = {
        name: cleanName,
        number: cleanNew,
        hidden: Boolean(hidden)
    };
    cache.owners[index] = updated;
    syncDataFile(OWNER_FILE, cache.owners);

    try {
        const db = getPool();
        if (cleanOld === cleanNew) {
            await db.query(
                'UPDATE owners SET name = ?, hidden = ? WHERE number = ?',
                [updated.name, updated.hidden ? 1 : 0, cleanOld]
            );
        } else {
            await db.query('DELETE FROM owners WHERE number = ?', [cleanOld]);
            await db.query(
                'INSERT INTO owners (number, name, hidden, added_at) VALUES (?, ?, ?, NOW())',
                [updated.number, updated.name, updated.hidden ? 1 : 0]
            );
        }
    } catch (err) {
        console.error('[database] Error updating owner in MariaDB:', err.message);
    }

    return { success: true, message: 'Owner berhasil diperbarui.', owners: cache.owners };
}

async function deleteOwner(number) {
    const cleanNumber = normalizePhoneNumber(number);
    if (!cleanNumber) return { success: false, message: 'Nomor tidak valid.' };
    if (cleanNumber === SUPER_OWNER) {
        return { success: false, message: 'Super owner tidak bisa dihapus.' };
    }

    const initialLen = cache.owners.length;
    cache.owners = cache.owners.filter(o => {
        const ownerNumber = typeof o === 'object' ? o.number : o;
        return normalizePhoneNumber(ownerNumber) !== cleanNumber;
    });

    if (cache.owners.length === initialLen) {
        return { success: false, message: 'Owner tidak ditemukan.' };
    }

    syncDataFile(OWNER_FILE, cache.owners);

    try {
        const db = getPool();
        await db.query('DELETE FROM owners WHERE number = ?', [cleanNumber]);
    } catch (err) {
        console.error('[database] Error deleting owner from MariaDB:', err.message);
    }

    return { success: true, message: `${cleanNumber} berhasil dihapus dari owner.`, owners: cache.owners };
}

// ====================================================
// STATS REPOSITORY
// ====================================================

let statsFlushTimer = null;

async function flushStatsToDb() {
    try {
        const db = getPool();
        await db.query(
            `UPDATE bot_stats
             SET messages = ?, commands = ?, stickers = ?, brats = ?, command_usage_json = ?
             WHERE id = 'main'`,
            [
                cache.stats.messages || 0,
                cache.stats.commands || 0,
                cache.stats.stickers || 0,
                cache.stats.brats || 0,
                JSON.stringify(cache.stats.commandUsage || {})
            ]
        );
    } catch (err) {
        console.error('[database] Error flushing stats to MariaDB:', err.message);
    }
}

function scheduleStatsFlush() {
    if (statsFlushTimer) return;
    statsFlushTimer = setTimeout(() => {
        statsFlushTimer = null;
        flushStatsToDb();
    }, 2000);
}

function getStats() {
    return cache.stats;
}

function saveStats(stats) {
    cache.stats = { ...cache.stats, ...stats };
    syncDataFile(STATS_FILE, cache.stats);
    scheduleStatsFlush();
}

function incrementMessageStats() {
    cache.stats.messages = (cache.stats.messages || 0) + 1;
    scheduleStatsFlush();
}

function incrementCommandStats(command) {
    if (!command) return;
    cache.stats.commands = (cache.stats.commands || 0) + 1;
    if (!cache.stats.commandUsage) cache.stats.commandUsage = {};
    cache.stats.commandUsage[command] = (cache.stats.commandUsage[command] || 0) + 1;
    scheduleStatsFlush();
}

function incrementStickerStats() {
    cache.stats.stickers = (cache.stats.stickers || 0) + 1;
    scheduleStatsFlush();
}

function incrementBratStats() {
    cache.stats.brats = (cache.stats.brats || 0) + 1;
    scheduleStatsFlush();
}

// ====================================================
// COMMAND LOGS REPOSITORY
// ====================================================

function getLogs() {
    return cache.logs;
}

function logCommand(command, from, senderNumber, isGroupChat = false) {
    const entry = {
        command,
        from,
        sender: senderNumber || 'unknown',
        type: isGroupChat ? 'group' : 'private',
        timestamp: new Date().toISOString()
    };

    cache.logs.push(entry);
    if (cache.logs.length > 5000) {
        cache.logs.splice(0, cache.logs.length - 5000);
    }
    syncDataFile(LOG_FILE, cache.logs);

    // Asynchronously insert log into MariaDB
    try {
        const db = getPool();
        db.query(
            `INSERT INTO command_logs (command, from_jid, sender, type, timestamp)
             VALUES (?, ?, ?, ?, NOW())`,
            [command, from, senderNumber || 'unknown', isGroupChat ? 'group' : 'private']
        ).catch(err => console.error('[database] Error logging command to MariaDB:', err.message));
    } catch {}
}

// ====================================================
// WELCOME REPOSITORY
// ====================================================

function getWelcomeConfig() {
    return cache.welcome;
}

async function saveWelcomeConfig(config) {
    cache.welcome = { ...cache.welcome, ...config };
    syncDataFile(WELCOME_FILE, cache.welcome);

    try {
        const db = getPool();
        await db.query(
            `INSERT INTO welcome_settings (id, enabled, text)
             VALUES ('default', ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), text = VALUES(text)`,
            [cache.welcome.enabled ? 1 : 0, cache.welcome.text]
        );
    } catch (err) {
        console.error('[database] Error saving welcome config to MariaDB:', err.message);
    }
}

// ====================================================
// AUTOREPLIES REPOSITORY
// ====================================================

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

async function addAutoreply(triggerInput, response, createdBy = 'owner', groupId = null) {
    if (!triggerInput || !response) {
        return { success: false, message: 'Trigger dan respons wajib diisi.' };
    }

    const cleanGroupId = groupId ? normalizeJid(groupId) : null;
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

    let insertId = null;
    try {
        const db = getPool();
        const [res] = await db.query(
            `INSERT INTO autoreplies (trigger_name, triggers_json, response, group_id, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [primaryTrigger, JSON.stringify(triggers), response.trim(), cleanGroupId, createdBy || 'owner', now]
        );
        insertId = res.insertId;
    } catch (err) {
        console.error('[database] Error inserting autoreply to MariaDB:', err.message);
    }

    const newItem = {
        id: insertId,
        trigger: primaryTrigger,
        triggers: triggers,
        response: response.trim(),
        groupId: cleanGroupId,
        createdBy: createdBy || 'owner',
        createdAt: now.toISOString()
    };

    cache.autoreplies.push(newItem);
    syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

    return { success: true, message: `Autoreply untuk "${primaryTrigger}" berhasil ditambahkan.`, item: newItem };
}

async function editAutoreply(triggerInput, newResponse, updatedBy = 'owner') {
    if (!triggerInput || !newResponse) {
        return { success: false, message: 'Trigger dan respons baru wajib diisi.' };
    }

    const targets = normalizeTriggerList(triggerInput);
    let foundIndex = -1;

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

    if (foundIndex === -1) {
        return { success: false, message: `Trigger "${triggerInput}" tidak ditemukan.` };
    }

    const item = cache.autoreplies[foundIndex];
    if (targets.length > 1) {
        item.triggers = targets;
        item.trigger = targets.join(' / ');
    } else if (targets.length === 1 && !item.triggers?.some(tr => tr.toLowerCase() === targets[0].toLowerCase())) {
        item.triggers = targets;
        item.trigger = targets[0];
    }
    item.response = newResponse.trim();
    item.updatedBy = updatedBy;
    item.updatedAt = new Date().toISOString();

    syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

    try {
        const db = getPool();
        if (item.id) {
            await db.query(
                `UPDATE autoreplies
                 SET trigger_name = ?, triggers_json = ?, response = ?, updated_by = ?, updated_at = NOW()
                 WHERE id = ?`,
                [item.trigger, JSON.stringify(item.triggers), item.response, updatedBy, item.id]
            );
        } else {
            await db.query(
                `UPDATE autoreplies
                 SET response = ?, updated_by = ?, updated_at = NOW()
                 WHERE trigger_name = ?`,
                [item.response, updatedBy, item.trigger]
            );
        }
    } catch (err) {
        console.error('[database] Error updating autoreply in MariaDB:', err.message);
    }

    const label = Array.isArray(item.triggers) ? item.triggers.join(' / ') : item.trigger;
    return { success: true, message: `Autoreply untuk "${label}" berhasil diubah.`, item };
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
        console.error('[database] Error deleting autoreply from MariaDB:', err.message);
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
                    `INSERT INTO autoreplies (id, trigger_name, triggers_json, response, group_id, created_by, created_at, updated_by, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE trigger_name = VALUES(trigger_name), triggers_json = VALUES(triggers_json), response = VALUES(response), group_id = VALUES(group_id), updated_by = VALUES(updated_by), updated_at = NOW()`,
                    [item.id, trigName, trigJson, item.response, item.groupId || null, item.createdBy || 'owner', item.createdAt ? new Date(item.createdAt) : new Date(), item.updatedBy || null, item.updatedAt ? new Date(item.updatedAt) : null]
                );
            } else {
                await db.query(
                    `INSERT INTO autoreplies (trigger_name, triggers_json, response, group_id, created_by, created_at)
                     VALUES (?, ?, ?, ?, ?, NOW())`,
                    [trigName, trigJson, item.response, item.groupId || null, item.createdBy || 'owner']
                );
            }
        }
    } catch (err) {
        console.error('[database] Error saving autoreplies to MariaDB:', err.message);
    }
}

// ====================================================
// GROUPS REPOSITORY (PERSISTENT REGISTRATION)
// ====================================================

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
        console.error('[database] Error inserting group to MariaDB:', err.message);
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
        console.error('[database] Error saving groups to MariaDB:', err.message);
    }
}

// ====================================================
// KOST REPOSITORY (MARIADB SINGLE SOURCE OF TRUTH)
// ====================================================

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

async function getKostList(groupId = null) {
    await ensureAllTables();
    const db = getPool();
    const effectiveGroupId = resolveDataGroupId(groupId);
    const cleanGroupId = effectiveGroupId ? normalizeJid(effectiveGroupId) : null;
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

    await ensureAllTables();
    const db = getPool();
    const effectiveGroupId = resolveDataGroupId(targetGroup);
    const cleanGroupId = effectiveGroupId ? normalizeJid(effectiveGroupId) : null;
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
    const effectiveGroupId = resolveDataGroupId(targetGroup);
    const cleanGroupId = effectiveGroupId ? normalizeJid(effectiveGroupId) : null;

    await ensureAllTables();
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
    const effectiveGroupId = resolveDataGroupId(targetGroup);
    const cleanGroupId = effectiveGroupId ? normalizeJid(effectiveGroupId) : null;

    await ensureAllTables();
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
    await ensureAllTables();
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

function normalizeKostId(input) {
    if (!input) return null;
    let s = String(input).trim().toUpperCase();
    const matchFull = s.match(/^KST-(\d+)$/i);
    if (matchFull) return `KST-${matchFull[1].padStart(6, '0')}`;
    const matchSpace = s.match(/^KST\s+(\d+)$/i);
    if (matchSpace) return `KST-${matchSpace[1].padStart(6, '0')}`;
    if (/^\d+$/.test(s)) return `KST-${s.padStart(6, '0')}`;
    return s;
}

function parseKostIdTargets(rawInput) {
    if (!rawInput) return { type: 'none', ids: [] };
    let text = String(rawInput).trim();

    // 1. Range syntax: "X sampai Y", "X hingga Y", "X s/d Y", "X sd Y", "X to Y", "X - Y"
    const rangeRegex = /^(.*?)\s+(?:sampai|hingga|s\/d|sd|to|-)\s+(.*)$/i;
    let rangeMatch = text.match(rangeRegex);

    // Simple digits range like "2-20"
    if (!rangeMatch && text.includes('-')) {
        const hyphenParts = text.split(/\s*-\s*/);
        if (hyphenParts.length === 2 && /^\d+$/.test(hyphenParts[0]) && /^\d+$/.test(hyphenParts[1])) {
            rangeMatch = [text, hyphenParts[0], hyphenParts[1]];
        }
    }

    if (rangeMatch) {
        const left = rangeMatch[1].trim();
        const right = rangeMatch[2].trim();
        const leftNumMatch = left.replace(/^KST[- ]*/i, '').trim();
        const rightNumMatch = right.replace(/^KST[- ]*/i, '').trim();

        if (/^\d+$/.test(leftNumMatch) && /^\d+$/.test(rightNumMatch)) {
            let start = parseInt(leftNumMatch, 10);
            let end = parseInt(rightNumMatch, 10);
            if (start > end) [start, end] = [end, start];
            if (end - start > 100) end = start + 100;
            const ids = [];
            for (let i = start; i <= end; i++) {
                ids.push(`KST-${String(i).padStart(6, '0')}`);
            }
            return { type: 'range', start, end, ids };
        }
    }

    // 2. Multiple IDs separated by comma or space
    const tokens = text.split(/[,|\s]+/).map(t => t.trim()).filter(Boolean);
    if (tokens.length > 1) {
        const ids = [...new Set(tokens.map(normalizeKostId).filter(Boolean))];
        return { type: 'list', ids };
    }

    // 3. Single ID
    if (tokens.length === 1) {
        const id = normalizeKostId(tokens[0]);
        return { type: 'single', ids: id ? [id] : [] };
    }

    return { type: 'none', ids: [] };
}

async function markKostBatchSent(ids, groupId, senderNumber = '') {
    await ensureAllTables();
    const db = getPool();
    const cleanGroupId = groupId ? normalizeJid(groupId) : null;
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
        if (cleanGroupId) {
            updateSql += ' AND group_id = ?';
            updateParams.push(cleanGroupId);
        }
        await db.query(updateSql, updateParams);
    }

    return {
        success: true,
        updated: toUpdate,
        alreadySent,
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

    const cleanId = String(targetId).trim().toUpperCase();
    const cleanGroupId = targetGroup ? normalizeJid(targetGroup) : null;

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
    await ensureAllTables();
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

// ====================================================
// KOST SUBMISSIONS REPOSITORY (CROWDSOURCING)
// ====================================================

async function addKostSubmission({ groupId, name, contactsRaw, submittedBy = '' }) {
    await ensureAllTables();
    const cleanGroupId = groupId ? normalizeJid(groupId) : '';
    const cleanName = String(name || '').trim();
    const cleanContacts = String(contactsRaw || '').trim();
    const cleanSubmitter = String(submittedBy || '').trim();

    if (!cleanName || !cleanContacts) {
        return { success: false, message: 'Nama kos dan kontak wajib diisi.' };
    }

    const db = getPool();
    const now = new Date();
    const [result] = await db.query(
        `INSERT INTO kost_submissions (group_id, name, contacts_raw, submitted_by, submitted_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [cleanGroupId, cleanName, cleanContacts, cleanSubmitter, now]
    );

    const submission = {
        id: result.insertId,
        groupId: cleanGroupId,
        name: cleanName,
        contactsRaw: cleanContacts,
        submittedBy: cleanSubmitter,
        submittedAt: now.toISOString(),
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null
    };

    cache.submissions.unshift(submission);
    syncDataFile(SUBMISSIONS_FILE, cache.submissions);

    return {
        success: true,
        submission
    };
}

async function getKostSubmissions({ groupId = null, status = 'pending' } = {}) {
    await ensureAllTables();
    const db = getPool();
    let query = 'SELECT * FROM kost_submissions';
    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
    }
    if (groupId) {
        conditions.push('group_id = ?');
        params.push(normalizeJid(groupId));
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY id DESC';

    const [rows] = await db.query(query, params);
    return rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        name: r.name,
        contactsRaw: r.contacts_raw,
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at
    }));
}

async function getKostSubmissionById(id) {
    const cleanId = Number(id);
    if (!cleanId || isNaN(cleanId)) return null;
    await ensureAllTables();
    const db = getPool();
    const [rows] = await db.query('SELECT * FROM kost_submissions WHERE id = ?', [cleanId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
        id: r.id,
        groupId: r.group_id,
        name: r.name,
        contactsRaw: r.contacts_raw,
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at
    };
}

async function reviewKostSubmission(id, newStatus, reviewerNumber = '') {
    await ensureAllTables();
    const cleanId = Number(id);
    if (!cleanId || isNaN(cleanId)) {
        return { success: false, message: 'ID usulan tidak valid.' };
    }
    const cleanStatus = ['approved', 'rejected'].includes(newStatus) ? newStatus : 'pending';

    const db = getPool();
    const [rows] = await db.query('SELECT * FROM kost_submissions WHERE id = ?', [cleanId]);
    if (rows.length === 0) {
        return { success: false, message: `Usulan #${cleanId} tidak ditemukan.` };
    }

    const sub = rows[0];
    if (sub.status !== 'pending') {
        return { success: false, message: `Usulan #${cleanId} sudah di-${sub.status} sebelumnya.` };
    }

    const now = new Date();
    await db.query(
        `UPDATE kost_submissions 
         SET status = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ?`,
        [cleanStatus, reviewerNumber || 'admin', now, cleanId]
    );

    // Update in-memory cache
    const item = cache.submissions.find(s => Number(s.id) === cleanId);
    if (item) {
        item.status = cleanStatus;
        item.reviewedBy = reviewerNumber || 'admin';
        item.reviewedAt = now.toISOString();
        syncDataFile(SUBMISSIONS_FILE, cache.submissions);
    }

    return {
        success: true,
        status: cleanStatus,
        submission: {
            id: sub.id,
            groupId: sub.group_id,
            name: sub.name,
            contactsRaw: sub.contacts_raw,
            submittedBy: sub.submitted_by
        }
    };
}

module.exports = {
    DATA_DIR,
    SUPER_OWNER,
    SUBMISSIONS_FILE,
    ensureDataFiles,
    ensureAllTables,
    ensureKostTable: ensureAllTables,
    refreshDatabaseCache,

    // Owners
    getOwners,
    saveOwners,
    isOwner,
    isSuperOwner,
    addOwner,
    deleteOwner,
    updateOwner,

    // Stats
    getStats,
    saveStats,
    incrementMessageStats,
    incrementCommandStats,
    incrementStickerStats,
    incrementBratStats,
    flushStatsToDb,

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
    markKostBatchSent,
    normalizeKostId,
    parseKostIdTargets,
    deleteKost,
    updateKost,
    getKostStats,

    // Groups (Persistent Registration)
    GROUPS_FILE,
    getGroups,
    saveGroups,
    getGroupById,
    isGroupInitialized,
    resolveDataGroupId,
    addGroup,

    // Submissions
    addKostSubmission,
    getKostSubmissions,
    getKostSubmissionById,
    reviewKostSubmission
};
