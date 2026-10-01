// core/storage/owners.js - Owner management storage (MariaDB + JSON cache)
const { getPool } = require('./mariadb/pool');
const { OWNER_FILE, SUPER_OWNER, cache, syncDataFile } = require('./json/cache');
const { normalizePhoneNumber } = require('../utils/phone');

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
        console.error('[core/storage/owners] Error saving owners to MariaDB:', err.message);
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
        console.error('[core/storage/owners] Error inserting owner to MariaDB:', err.message);
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
        console.error('[core/storage/owners] Error updating owner in MariaDB:', err.message);
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
        console.error('[core/storage/owners] Error deleting owner from MariaDB:', err.message);
    }

    return { success: true, message: `${cleanNumber} berhasil dihapus dari owner.`, owners: cache.owners };
}

module.exports = {
    getOwners,
    saveOwners,
    isOwner,
    isSuperOwner,
    addOwner,
    updateOwner,
    deleteOwner
};
