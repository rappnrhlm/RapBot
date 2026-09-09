const { normalizeJid, getJidNumber, isGroup } = require('./jid');

function isAdmin(participant) {
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

function findParticipant(metadata, jid) {
    if (!metadata || !jid) return null;
    const normalizedTarget = normalizeJid(jid);

    let participant = metadata.participants?.find(
        p => normalizeJid(p.id) === normalizedTarget
    );
    if (participant) return participant;

    const targetNumber = getJidNumber(jid);
    return metadata.participants?.find(p => p?.id && getJidNumber(p.id) === targetNumber) || null;
}

async function getGroupMetadata(sock, from, msg = null) {
    if (!isGroup(from)) {
        if (msg) {
            await sock.sendMessage(
                from,
                { text: '❌ Command ini hanya bisa digunakan di grup.' },
                { quoted: msg }
            );
        }
        return null;
    }

    try {
        return await sock.groupMetadata(from);
    } catch (err) {
        if (msg) {
            await sock.sendMessage(
                from,
                { text: '❌ Gagal mengambil informasi grup.' },
                { quoted: msg }
            );
        }
        return null;
    }
}

async function requireAdmin(sock, from, msg, metadata, senderJid = null) {
    const sender = senderJid || msg?.key?.participant || msg?.key?.participantAlt || from;
    const senderNum = getJidNumber(sender);
    const botNum = getJidNumber(sock?.user?.id);

    try {
        const database = require('../services/database');
        if (database.isOwner(senderNum, botNum)) {
            return true;
        }
    } catch (_) {}

    const participant = findParticipant(metadata, sender);

    if (!isAdmin(participant)) {
        if (msg) {
            await sock.sendMessage(
                from,
                { text: '❌ Command ini khusus admin grup.' },
                { quoted: msg }
            );
        }
        return false;
    }
    return true;
}

async function requireBotAdmin(sock, from, msg, metadata) {
    const botId = sock?.user?.id || '';
    const botLid = sock?.user?.lid || '';
    const normalizedBotId = normalizeJid(botId);
    const normalizedBotLid = normalizeJid(botLid);
    const botIdNumber = getJidNumber(botId);
    const botLidNumber = getJidNumber(botLid);

    const botParticipant = metadata?.participants?.find(p => {
        if (!p?.id) return false;
        const pId = normalizeJid(p.id);
        const pNumber = getJidNumber(p.id);
        return (
            (normalizedBotId && pId === normalizedBotId) ||
            (normalizedBotLid && pId === normalizedBotLid) ||
            (botIdNumber && pNumber === botIdNumber) ||
            (botLidNumber && pNumber === botLidNumber)
        );
    });

    if (!botParticipant) {
        if (msg) {
            await sock.sendMessage(
                from,
                { text: '❌ Bot tidak ditemukan sebagai member grup.' },
                { quoted: msg }
            );
        }
        return false;
    }

    if (!isAdmin(botParticipant)) {
        if (msg) {
            await sock.sendMessage(
                from,
                { text: '❌ Bot harus menjadi admin grup terlebih dahulu!' },
                { quoted: msg }
            );
        }
        return false;
    }

    return true;
}

module.exports = {
    isAdmin,
    findParticipant,
    getGroupMetadata,
    requireAdmin,
    requireBotAdmin
};
