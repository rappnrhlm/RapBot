// core/storage/stats.js - Bot statistics counters and MariaDB flush scheduler
const { getPool } = require('./mariadb/pool');
const { STATS_FILE, cache, syncDataFile } = require('./json/cache');

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
        console.error('[core/storage/stats] Error flushing stats to MariaDB:', err.message);
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

module.exports = {
    getStats,
    saveStats,
    incrementMessageStats,
    incrementCommandStats,
    incrementStickerStats,
    incrementBratStats,
    flushStatsToDb,
    scheduleStatsFlush
};
