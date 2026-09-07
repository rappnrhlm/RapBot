const database = require('./database');

function cleanInstagramUsername(input) {
    if (!input) return '';
    let username = String(input).trim();
    username = username.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
    username = username.replace(/^@/, '');
    username = username.split(/[/?#]/)[0].trim();
    return username;
}

function formatInstagramUrl(username) {
    const clean = cleanInstagramUsername(username);
    return clean ? `https://instagram.com/${clean}` : '-';
}

async function getAllKost() {
    return database.getKostList();
}

async function getKostByStatus(status) {
    const list = await getAllKost();
    if (!status || status === 'all') return list;
    const targetStatus = String(status).toLowerCase();
    return list.filter(k => (k.status || 'pending').toLowerCase() === targetStatus);
}

async function searchKost(query) {
    if (!query) return [];
    const q = String(query).toLowerCase().trim();
    const list = await getAllKost();
    return list.filter(k =>
        k.name?.toLowerCase().includes(q) ||
        k.instagram?.toLowerCase().includes(q)
    );
}

async function addKost({ name, instagram, addedBy = '' }) {
    const cleanName = String(name || '').trim();
    const cleanIg = cleanInstagramUsername(instagram);

    if (!cleanName) {
        return { success: false, message: 'Nama kost wajib diisi.' };
    }
    if (!cleanIg) {
        return { success: false, message: 'Username Instagram wajib diisi.' };
    }

    const list = await getAllKost();
    const exists = list.find(k => k.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
        return { success: false, message: `Kost dengan nama "${cleanName}" sudah ada.` };
    }

    const newKost = {
        name: cleanName,
        instagram: cleanIg,
        status: 'pending',
        sentBy: '',
        sentAt: '',
        addedBy,
        createdAt: new Date().toISOString()
    };

    list.push(newKost);
    database.saveKostList(list);

    return {
        success: true,
        message: `Kost "${cleanName}" (@${cleanIg}) berhasil ditambahkan.`,
        data: newKost
    };
}

async function markSent(kostNames, sentBy = '') {
    if (!Array.isArray(kostNames) || kostNames.length === 0) {
        return { success: false, message: 'Daftar nama kost tidak boleh kosong.' };
    }

    const list = await getAllKost();
    const updatedNames = [];
    const notFoundNames = [];

    for (const target of kostNames) {
        const trimmed = String(target).trim();
        if (!trimmed) continue;

        const found = list.find(k => k.name.toLowerCase() === trimmed.toLowerCase());
        if (found) {
            found.status = 'sent';
            found.sentBy = sentBy;
            found.sentAt = new Date().toISOString();
            updatedNames.push(found.name);
        } else {
            notFoundNames.push(trimmed);
        }
    }

    if (updatedNames.length > 0) {
        database.saveKostList(list);
    }

    return {
        success: true,
        updatedCount: updatedNames.length,
        updatedNames,
        notFoundNames
    };
}

module.exports = {
    cleanInstagramUsername,
    formatInstagramUrl,
    getAllKost,
    getKostByStatus,
    searchKost,
    addKost,
    markSent
};
