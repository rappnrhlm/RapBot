// core/storage/logs.js - Command execution logging (in-memory + MariaDB & JSON)
const { getPool } = require('./mariadb/pool');
const { LOG_FILE, cache, syncDataFile } = require('./json/cache');

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
        ).catch(err => console.error('[core/storage/logs] Error logging command to MariaDB:', err.message));
    } catch {}
}

module.exports = {
    getLogs,
    logCommand
};
