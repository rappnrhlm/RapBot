// core/storage/mariadb/schema.js - DDL table initialization, auto-seeding, and cache synchronization
const { getPool } = require('./pool');
const {
    GROUPS_FILE,
    AUTOREPLY_FILE,
    OWNER_FILE,
    WELCOME_FILE,
    STATS_FILE,
    SUPER_OWNER,
    DEFAULT_WELCOME,
    cache,
    syncDataFile
} = require('../json/cache');

const { readJSON } = require('../../utils/json');
const { normalizePhoneNumber } = require('../../utils/phone');
const { normalizeJid } = require('../../utils/jid');

async function ensureAllTables() {
    const db = getPool();

    // 1. Table: bot_groups (Persistent Group Registration)
    await db.query(`
        CREATE TABLE IF NOT EXISTS bot_groups (
            id VARCHAR(100) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            group_name VARCHAR(255) DEFAULT '',
            type VARCHAR(50) NOT NULL DEFAULT 'umum',
            role VARCHAR(20) NOT NULL DEFAULT 'admin',
            parent_group_id VARCHAR(100) DEFAULT NULL,
            settings_json TEXT DEFAULT NULL,
            initialized_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            initialized_by VARCHAR(100) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS type VARCHAR(50) NOT NULL DEFAULT 'umum' AFTER name`);
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'admin' AFTER type`);
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS parent_group_id VARCHAR(100) NULL DEFAULT NULL AFTER role`);
        await db.query(`ALTER TABLE bot_groups ADD COLUMN IF NOT EXISTS settings_json TEXT NULL DEFAULT NULL AFTER parent_group_id`);
    } catch {}

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
        await db.query(`ALTER TABLE autoreplies ADD COLUMN IF NOT EXISTS media_path VARCHAR(255) NULL DEFAULT NULL AFTER group_id`);
        await db.query(`ALTER TABLE autoreplies ADD COLUMN IF NOT EXISTS media_type VARCHAR(50) NULL DEFAULT NULL AFTER media_path`);
        await db.query(`ALTER TABLE autoreplies ADD COLUMN IF NOT EXISTS owner_only TINYINT(1) DEFAULT 0 AFTER media_type`);
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
            id VARCHAR(128) NOT NULL PRIMARY KEY DEFAULT 'default',
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            text TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await db.query("ALTER TABLE welcome_settings MODIFY id VARCHAR(128) NOT NULL").catch(() => {});

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
    // 1. Seed bot_groups from data/groups.json if table is empty
    try {
        const [cntGroups] = await db.query('SELECT COUNT(*) as cnt FROM bot_groups');
        if (cntGroups[0]?.cnt === 0) {
            const fileGroups = readJSON(GROUPS_FILE, null);
            const list = Array.isArray(fileGroups?.groups) ? fileGroups.groups : (Array.isArray(fileGroups) ? fileGroups : []);
            for (const g of list) {
                if (!g?.id) continue;
                await db.query(
                    `INSERT IGNORE INTO bot_groups (id, name, group_name, type, role, parent_group_id, settings_json, initialized_at, initialized_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [g.id, g.name || 'Grup', g.groupName || '', g.type || 'umum', g.role || 'admin', g.parentGroupId || null, JSON.stringify(g.settings || {}), g.initializedAt ? new Date(g.initializedAt) : new Date(), g.initializedBy || '']
                );
            }
            if (list.length > 0) {
                console.log(`[core/storage] Auto-seeded ${list.length} bot_groups ke MariaDB.`);
            }
        }
    } catch (e) {
        console.error('[core/storage] Auto-seed bot_groups check error:', e.message);
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
                        `INSERT INTO autoreplies (trigger_name, triggers_json, response, group_id, media_path, media_type, owner_only, created_by, created_at, updated_by, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            trigName,
                            trigJson,
                            item.response || '',
                            item.groupId || null,
                            item.mediaPath || null,
                            item.mediaType || null,
                            item.ownerOnly ? 1 : 0,
                            item.createdBy || 'owner',
                            item.createdAt ? new Date(item.createdAt) : new Date(),
                            item.updatedBy || null,
                            item.updatedAt ? new Date(item.updatedAt) : null
                        ]
                    );
                }
                console.log(`[core/storage] Auto-seeded ${fileAutoreplies.length} autoreplies ke MariaDB.`);
            }
        }
    } catch (e) {
        console.error('[core/storage] Auto-seed autoreplies check error:', e.message);
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
            console.log(`[core/storage] Auto-seeded ${list.length} owners ke MariaDB.`);
        }
    } catch (e) {
        console.error('[core/storage] Auto-seed owners check error:', e.message);
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
            console.log('[core/storage] Auto-seeded welcome_settings ke MariaDB.');
        }
    } catch (e) {
        console.error('[core/storage] Auto-seed welcome_settings check error:', e.message);
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
            console.log('[core/storage] Auto-seeded bot_stats ke MariaDB.');
        }
    } catch (e) {
        console.error('[core/storage] Auto-seed bot_stats check error:', e.message);
    }
}

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
                    type: r.type || 'umum',
                    role: r.role || 'admin',
                    parentGroupId: r.parent_group_id || null,
                    settings: settings || {},
                    initializedAt: r.initialized_at,
                    initializedBy: r.initialized_by || ''
                };
            });
            syncDataFile(GROUPS_FILE, { groups: cache.groups });
        }

        // 3. Refresh Autoreplies
        const [autoRows] = await db.query('SELECT id, trigger_name, triggers_json, response, group_id, media_path, media_type, owner_only, created_by, created_at, updated_by, updated_at FROM autoreplies ORDER BY id ASC');
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
                mediaPath: r.media_path || null,
                mediaType: r.media_type || null,
                ownerOnly: Boolean(r.owner_only),
                createdBy: r.created_by,
                createdAt: r.created_at,
                updatedBy: r.updated_by,
                updatedAt: r.updated_at
            };
        });
        syncDataFile(AUTOREPLY_FILE, cache.autoreplies);

        // 4. Refresh Welcome (default & per-group)
        const [welcomeRows] = await db.query("SELECT id, enabled, text FROM welcome_settings");
        cache.groupWelcomes = {};
        for (const row of welcomeRows) {
            const rowData = {
                enabled: Boolean(row.enabled),
                text: row.text
            };
            if (row.id === 'default') {
                cache.welcome = rowData;
            } else {
                cache.groupWelcomes[normalizeJid(row.id)] = rowData;
            }
        }
        syncDataFile(WELCOME_FILE, {
            default: cache.welcome,
            groups: cache.groupWelcomes
        });

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
        console.error('[core/storage] Error refreshing cache from MariaDB:', err.message);
    }
}

module.exports = {
    ensureAllTables,
    autoSeedTablesIfEmpty,
    refreshDatabaseCache
};
