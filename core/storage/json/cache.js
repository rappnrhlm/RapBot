// core/storage/json/cache.js - Shared in-memory cache and JSON file persistence
const path = require('path');
const fs = require('fs');
const { readJSON, writeJSON } = require('../../utils/json');
const { normalizePhoneNumber } = require('../../utils/phone');

const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');
const OWNER_FILE = path.join(DATA_DIR, 'owners.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const LOG_FILE = path.join(DATA_DIR, 'command-log.json');
const WELCOME_FILE = path.join(DATA_DIR, 'welcome.json');
const AUTOREPLY_FILE = path.join(DATA_DIR, 'autoreplies.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const DISCOVERED_GROUPS_FILE = path.join(DATA_DIR, 'discovered_groups.json');
const BROADCAST_FILE = path.join(DATA_DIR, 'broadcasts.json');

const SUPER_OWNER = normalizePhoneNumber(process.env.SUPER_OWNER || '');

const DEFAULT_WELCOME = {
    enabled: true,
    text:
        '👋 Selamat datang {user} di *{group}*!\n\n' +
        'Semoga betah di sini 🤙\n' +
        'Ketik !menu untuk melihat fitur bot.'
};

const INITIAL_GROUP = {
    id: '120363429518970623@g.us',
    name: 'Bukittinggi Kos',
    groupName: 'admin @bukittinggikos',
    type: 'kos',
    role: 'admin',
    initializedAt: new Date().toISOString(),
    initializedBy: SUPER_OWNER
};

const cache = {
    owners: [],
    groups: [],
    discoveredGroups: [],
    autoreplies: [],
    welcome: { ...DEFAULT_WELCOME },
    groupWelcomes: {},
    stats: {
        messages: 0,
        commands: 0,
        stickers: 0,
        brats: 0,
        startedAt: new Date().toISOString(),
        commandUsage: {}
    },
    logs: [],
    broadcasts: [],
    initialized: false
};

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

        const rawDiscovered = readJSON(DISCOVERED_GROUPS_FILE, []);
        if (Array.isArray(rawDiscovered)) {
            cache.discoveredGroups = rawDiscovered;
        }

        const rawAutoreplies = readJSON(AUTOREPLY_FILE, null);
        if (Array.isArray(rawAutoreplies)) {
            cache.autoreplies = rawAutoreplies;
        }

        const rawWelcome = readJSON(WELCOME_FILE, null);
        if (rawWelcome && typeof rawWelcome === 'object') {
            if (rawWelcome.groups && typeof rawWelcome.groups === 'object') {
                cache.welcome = { ...DEFAULT_WELCOME, ...(rawWelcome.default || {}) };
                cache.groupWelcomes = { ...rawWelcome.groups };
            } else {
                cache.welcome = { ...DEFAULT_WELCOME, ...rawWelcome };
                cache.groupWelcomes = {};
            }
        }

        const rawStats = readJSON(STATS_FILE, null);
        if (rawStats && typeof rawStats === 'object') {
            cache.stats = { ...cache.stats, ...rawStats };
        }

        const rawLogs = readJSON(LOG_FILE, null);
        if (Array.isArray(rawLogs)) {
            cache.logs = rawLogs;
        }

        const rawBroadcasts = readJSON(BROADCAST_FILE, null);
        if (Array.isArray(rawBroadcasts)) {
            cache.broadcasts = rawBroadcasts;
        }
    } catch (err) {
        console.warn('[core/storage] Warning: error initializing local cache:', err.message);
    }
}

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(OWNER_FILE)) writeJSON(OWNER_FILE, cache.owners);
    if (!fs.existsSync(STATS_FILE)) writeJSON(STATS_FILE, cache.stats);
    if (!fs.existsSync(LOG_FILE)) writeJSON(LOG_FILE, cache.logs);
    if (!fs.existsSync(WELCOME_FILE)) writeJSON(WELCOME_FILE, cache.welcome);
    if (!fs.existsSync(AUTOREPLY_FILE)) writeJSON(AUTOREPLY_FILE, cache.autoreplies);
    if (!fs.existsSync(GROUPS_FILE)) writeJSON(GROUPS_FILE, { groups: cache.groups });
    if (!fs.existsSync(DISCOVERED_GROUPS_FILE)) writeJSON(DISCOVERED_GROUPS_FILE, []);
    if (!fs.existsSync(BROADCAST_FILE)) writeJSON(BROADCAST_FILE, cache.broadcasts);
}

initLocalCache();

function syncDataFile(file, data) {
    try {
        writeJSON(file, data);
    } catch {}
}

module.exports = {
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
};
