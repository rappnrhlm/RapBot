const path = require('path');
const { readJSON, writeJSON } = require('../utils/json');
const { normalizePhoneNumber } = require('../utils/phone');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OWNER_FILE = path.join(DATA_DIR, 'owners.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const LOG_FILE = path.join(DATA_DIR, 'command-log.json');
const WELCOME_FILE = path.join(DATA_DIR, 'welcome.json');
const AUTOREPLY_FILE = path.join(DATA_DIR, 'autoreplies.json');
const KOST_FILE = path.join(DATA_DIR, 'kost.json');

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
// KOST REPOSITORY (JSON BACKEND)
// ----------------------------------------------------

function getKostList() {
    ensureDataFiles();
    const list = readJSON(KOST_FILE, []);
    return Array.isArray(list) ? list : [];
}

function saveKostList(list) {
    return writeJSON(KOST_FILE, list);
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

    // Kost
    getKostList,
    saveKostList
};
