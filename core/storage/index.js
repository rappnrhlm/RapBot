// core/storage/index.js - Core storage aggregate module
const { getPool } = require('./mariadb/pool');
const { ensureAllTables, autoSeedTablesIfEmpty, refreshDatabaseCache } = require('./mariadb/schema');
const {
    DATA_DIR,
    OWNER_FILE,
    STATS_FILE,
    LOG_FILE,
    WELCOME_FILE,
    AUTOREPLY_FILE,
    GROUPS_FILE,
    DISCOVERED_GROUPS_FILE,
    BROADCAST_FILE,
    SUPER_OWNER,
    DEFAULT_WELCOME,
    cache,
    initLocalCache,
    ensureDataFiles,
    syncDataFile
} = require('./json/cache');

const owners = require('./owners');
const stats = require('./stats');
const logs = require('./logs');
const welcome = require('./welcome');
const autoreplies = require('./autoreplies');
const groups = require('./groups');
const broadcasts = require('./broadcasts');

module.exports = {
    // MariaDB & Schema
    getPool,
    ensureAllTables,
    autoSeedTablesIfEmpty,
    refreshDatabaseCache,

    // Cache & Paths
    DATA_DIR,
    OWNER_FILE,
    STATS_FILE,
    LOG_FILE,
    WELCOME_FILE,
    AUTOREPLY_FILE,
    GROUPS_FILE,
    DISCOVERED_GROUPS_FILE,
    BROADCAST_FILE,
    SUPER_OWNER,
    DEFAULT_WELCOME,
    cache,
    initLocalCache,
    ensureDataFiles,
    syncDataFile,

    // Domain Repositories
    ...owners,
    ...stats,
    ...logs,
    ...welcome,
    ...autoreplies,
    ...groups,
    ...broadcasts
};
