// core/storage/welcome.js - Welcome greetings configuration storage (MariaDB + JSON cache)
const { getPool } = require('./mariadb/pool');
const { WELCOME_FILE, cache, syncDataFile } = require('./json/cache');
const { normalizeJid } = require('../utils/jid');

function getWelcomeConfig(groupId = null) {
    if (!groupId || groupId === 'default') {
        return { ...cache.welcome, isCustom: false };
    }
    const cleanId = normalizeJid(groupId);
    if (cache.groupWelcomes && cache.groupWelcomes[cleanId]) {
        return { ...cache.groupWelcomes[cleanId], isCustom: true };
    }
    return { ...cache.welcome, isCustom: false };
}

async function saveWelcomeConfig(config, groupId = null) {
    const isGlobal = !groupId || groupId === 'default';
    const targetId = isGlobal ? 'default' : normalizeJid(groupId);

    if (isGlobal) {
        cache.welcome = { ...cache.welcome, ...config };
    } else {
        if (!cache.groupWelcomes) cache.groupWelcomes = {};
        const current = cache.groupWelcomes[targetId] || cache.welcome;
        cache.groupWelcomes[targetId] = { ...current, ...config };
    }

    syncDataFile(WELCOME_FILE, {
        default: cache.welcome,
        groups: cache.groupWelcomes || {}
    });

    try {
        const db = getPool();
        const saveTarget = isGlobal ? cache.welcome : cache.groupWelcomes[targetId];
        await db.query(
            `INSERT INTO welcome_settings (id, enabled, text)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), text = VALUES(text)`,
            [targetId, saveTarget.enabled ? 1 : 0, saveTarget.text]
        );
    } catch (err) {
        console.error('[core/storage/welcome] Error saving welcome config to MariaDB:', err.message);
    }

    return getWelcomeConfig(targetId);
}

async function resetWelcomeConfig(groupId) {
    if (!groupId || groupId === 'default') return false;
    const cleanId = normalizeJid(groupId);
    if (cache.groupWelcomes) {
        delete cache.groupWelcomes[cleanId];
    }
    syncDataFile(WELCOME_FILE, {
        default: cache.welcome,
        groups: cache.groupWelcomes || {}
    });

    try {
        const db = getPool();
        await db.query("DELETE FROM welcome_settings WHERE id = ?", [cleanId]);
    } catch (err) {
        console.error('[core/storage/welcome] Error deleting group welcome config from MariaDB:', err.message);
    }
    return true;
}

module.exports = {
    getWelcomeConfig,
    saveWelcomeConfig,
    resetWelcomeConfig
};
