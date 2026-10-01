// extensions/kost/utils/formatters.js - Formatting & normalization helpers for Bukittinggi Kos
const { normalizePhoneNumber } = require('../../../core/utils/phone');

function cleanInstagramUsername(input) {
    if (!input) return null;
    let username = String(input).trim();
    username = username.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '');
    username = username.replace(/^@/, '');
    username = username.split(/[/?#]/)[0].trim();
    return username || null;
}

function formatInstagramUrl(username) {
    const clean = cleanInstagramUsername(username);
    if (!clean) return null;
    return `https://instagram.com/${clean}`;
}

function cleanTiktokUsername(input) {
    if (!input) return null;
    let username = String(input).trim();
    username = username.replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/i, '');
    username = username.replace(/^@/, '');
    username = username.split(/[/?#]/)[0].trim();
    return username || null;
}

function formatTiktokUrl(username) {
    const clean = cleanTiktokUsername(username);
    if (!clean) return null;
    return `https://www.tiktok.com/@${clean}`;
}

function cleanWhatsappNumber(input) {
    if (!input) return null;
    let num = String(input).trim();
    num = num.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\?phone=)\/?/i, '');
    num = normalizePhoneNumber(num);
    return num || null;
}

function formatWhatsappUrl(number) {
    const clean = cleanWhatsappNumber(number);
    if (!clean) return null;
    return `https://wa.me/${clean}`;
}

function formatIndonesianDateTime(dateInput) {
    if (!dateInput) return '-';
    try {
        const date = new Date(dateInput);
        if (isNaN(date.getTime())) return String(dateInput);

        const d = String(date.getDate()).padStart(2, '0');
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const y = date.getFullYear();
        const hr = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');

        return `${d}/${m}/${y} ${hr}:${min} WIB`;
    } catch {
        return String(dateInput);
    }
}

function mapKostRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        groupId: row.group_id,
        group_id: row.group_id,
        name: row.name,
        namaKost: row.name,
        instagram: row.instagram || null,
        tiktok: row.tiktok || null,
        whatsapp: row.whatsapp || null,
        status: row.status,
        addedBy: row.added_by,
        added_by: row.added_by,
        createdAt: row.created_at,
        created_at: row.created_at,
        sentBy: row.sent_by,
        sent_by: row.sent_by,
        sentAt: row.sent_at,
        sent_at: row.sent_at
    };
}

function normalizeKostId(input) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim().toUpperCase();
    if (!s) return null;

    const match = s.match(/^(?:(?:KOST|KST|#)[\s\-_#]*)*(\d+)$/i);
    if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > 0) {
            return `KST-${String(num).padStart(6, '0')}`;
        }
    }
    return s;
}

function parseKostIdTargets(rawInput) {
    if (!rawInput) return { type: 'none', ids: [] };
    let text = String(rawInput).trim();

    // 1. Single ID check
    const singleNorm = normalizeKostId(text);
    if (singleNorm && /^KST-\d{6}$/.test(singleNorm)) {
        return { type: 'single', ids: [singleNorm] };
    }

    // 2. Range syntax
    const rangeRegex = /^(.*?)\s+(?:sampai|hingga|s\/d|sd|to|-)\s+(.*)$/i;
    let rangeMatch = text.match(rangeRegex);

    if (!rangeMatch && /^\d+\s*-\s*\d+$/.test(text)) {
        const hyphenParts = text.split(/\s*-\s*/);
        rangeMatch = [text, hyphenParts[0], hyphenParts[1]];
    }

    if (rangeMatch) {
        const left = rangeMatch[1].trim();
        const right = rangeMatch[2].trim();
        const leftNorm = normalizeKostId(left);
        const rightNorm = normalizeKostId(right);

        if (leftNorm && rightNorm && /^KST-\d{6}$/.test(leftNorm) && /^KST-\d{6}$/.test(rightNorm)) {
            let start = parseInt(leftNorm.slice(4), 10);
            let end = parseInt(rightNorm.slice(4), 10);
            if (start > end) [start, end] = [end, start];
            if (end - start > 100) end = start + 100;
            const ids = [];
            for (let i = start; i <= end; i++) {
                ids.push(`KST-${String(i).padStart(6, '0')}`);
            }
            return { type: 'range', start, end, ids };
        }
    }

    // 3. Comma or semicolon separated list
    if (text.includes(',') || text.includes(';')) {
        const rawTokens = text.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
        const ids = [...new Set(rawTokens.map(normalizeKostId).filter(id => id && /^KST-\d{6}$/.test(id)))];
        if (ids.length > 0) {
            return { type: ids.length === 1 ? 'single' : 'list', ids };
        }
    }

    // 4. Space separated multiple IDs
    const idRegex = /(?:(?:KOST|KST|#)[\s\-_#]*)*\d+/gi;
    const matches = text.match(idRegex);
    if (matches && matches.length > 0) {
        const ids = [...new Set(matches.map(normalizeKostId).filter(id => id && /^KST-\d{6}$/.test(id)))];
        if (ids.length > 0) {
            return { type: ids.length === 1 ? 'single' : 'list', ids };
        }
    }

    return { type: 'none', ids: [] };
}

function parseContacts(rawContacts) {
    if (!rawContacts) return { instagram: null, tiktok: null, whatsapp: null };

    const contacts = { instagram: null, tiktok: null, whatsapp: null };
    const tokens = rawContacts.split(/[,|]+/).map(t => t.trim()).filter(Boolean);

    for (const token of tokens) {
        const lower = token.toLowerCase();

        if (/^(ig|instagram)\s*[:=]\s*/i.test(token)) {
            contacts.instagram = token.replace(/^(ig|instagram)\s*[:=]\s*/i, '').trim();
        } else if (/^(wa|whatsapp|no|telp|hp)\s*[:=]\s*/i.test(token)) {
            contacts.whatsapp = token.replace(/^(wa|whatsapp|no|telp|hp)\s*[:=]\s*/i, '').trim();
        } else if (/^(tt|tiktok)\s*[:=]\s*/i.test(token)) {
            contacts.tiktok = token.replace(/^(tt|tiktok)\s*[:=]\s*/i, '').trim();
        } else if (lower.includes('instagram.com/')) {
            contacts.instagram = token;
        } else if (lower.includes('tiktok.com/')) {
            contacts.tiktok = token;
        } else if (lower.includes('wa.me/') || lower.includes('api.whatsapp.com/')) {
            contacts.whatsapp = token;
        } else if (/^(\+?62|08)[0-9\s\-]{7,15}$/.test(token.replace(/\s+/g, ''))) {
            contacts.whatsapp = token;
        } else {
            if (!contacts.instagram) contacts.instagram = token;
            else if (!contacts.tiktok) contacts.tiktok = token;
            else if (!contacts.whatsapp) contacts.whatsapp = token;
        }
    }

    return contacts;
}

module.exports = {
    cleanInstagramUsername,
    formatInstagramUrl,
    cleanTiktokUsername,
    formatTiktokUrl,
    cleanWhatsappNumber,
    formatWhatsappUrl,
    formatIndonesianDateTime,
    mapKostRow,
    normalizeKostId,
    parseKostIdTargets,
    parseContacts
};
