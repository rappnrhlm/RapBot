// core/storage/broadcasts.js - Broadcast history and undo storage (in-memory + JSON)
const { BROADCAST_FILE, cache, syncDataFile } = require('./json/cache');

function saveBroadcast(broadcastData) {
    const entry = {
        id: broadcastData.id || `bc_${Date.now()}`,
        timestamp: broadcastData.timestamp || new Date().toISOString(),
        target: broadcastData.target || 'all',
        targetJid: broadcastData.targetJid || null,
        message: broadcastData.message || '',
        sentCount: broadcastData.sentCount || 0,
        totalTarget: broadcastData.totalTarget || 0,
        messages: Array.isArray(broadcastData.messages) ? broadcastData.messages : [],
        deleted: Boolean(broadcastData.deleted),
        deletedAt: broadcastData.deletedAt || null
    };

    cache.broadcasts.push(entry);
    if (cache.broadcasts.length > 500) {
        cache.broadcasts.splice(0, cache.broadcasts.length - 500);
    }
    syncDataFile(BROADCAST_FILE, cache.broadcasts);
    return entry;
}

function getBroadcasts(limit = 50) {
    return [...cache.broadcasts].reverse().slice(0, limit);
}

function getBroadcastById(id) {
    if (!id) return null;
    return cache.broadcasts.find(b => b.id === id) || null;
}

function getLatestBroadcast() {
    if (!cache.broadcasts || cache.broadcasts.length === 0) return null;
    return cache.broadcasts[cache.broadcasts.length - 1];
}

function markBroadcastDeleted(id) {
    const entry = cache.broadcasts.find(b => b.id === id);
    if (entry) {
        entry.deleted = true;
        entry.deletedAt = new Date().toISOString();
        syncDataFile(BROADCAST_FILE, cache.broadcasts);
        return entry;
    }
    return null;
}

module.exports = {
    saveBroadcast,
    getBroadcasts,
    getBroadcastById,
    getLatestBroadcast,
    markBroadcastDeleted
};
