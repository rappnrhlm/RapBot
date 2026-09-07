const fs = require('fs');
const path = require('path');
const { normalizePhoneNumber } = require('./phone');

const AUTH_DIR = path.join(__dirname, '..', 'auth_baileys');

function normalizeJid(jid) {
    if (!jid) return '';
    return String(jid).trim().replace(/:\d+(?=@)/, '');
}

function getJidNumber(jid) {
    if (!jid) return '';
    return String(jid).split('@')[0].split(':')[0];
}

function isGroup(jid) {
    return Boolean(jid && jid.endsWith('@g.us'));
}

async function resolveSenderNumber(sock, msg, from) {
    // 1. If message was sent from the bot's own account (self-message / fromMe)
    if (msg?.key?.fromMe) {
        const botId = sock?.user?.id || '';
        if (botId) {
            return normalizePhoneNumber(getJidNumber(botId));
        }
    }

    const sender = msg?.key?.participant || msg?.key?.remoteJid || from;
    if (!sender) return '';

    // 2. Direct phone number JID
    if (sender.endsWith('@s.whatsapp.net')) {
        return normalizePhoneNumber(getJidNumber(sender));
    }

    // 3. Check alternate JID fields
    const alt = msg?.key?.participantAlt || msg?.key?.remoteJidAlt;
    if (alt?.endsWith('@s.whatsapp.net')) {
        return normalizePhoneNumber(getJidNumber(alt));
    }

    // 4. LID resolution
    if (sender.endsWith('@lid')) {
        // Try Baileys in-memory signalRepository
        try {
            const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(sender);
            if (pn) return normalizePhoneNumber(getJidNumber(pn));
        } catch {}

        // Fallback: Check saved reverse LID mapping files on disk
        try {
            const lidClean = getJidNumber(sender);
            const reverseFile = path.join(AUTH_DIR, `lid-mapping-${lidClean}_reverse.json`);
            if (fs.existsSync(reverseFile)) {
                const mappedPn = JSON.parse(fs.readFileSync(reverseFile, 'utf8'));
                if (mappedPn) return normalizePhoneNumber(mappedPn);
            }
        } catch {}
    }

    return normalizePhoneNumber(getJidNumber(sender));
}

function getMentionedJid(msg) {
    const context = msg?.message?.extendedTextMessage?.contextInfo;
    if (context?.mentionedJid?.length) return context.mentionedJid[0];
    if (context?.participant) return context.participant;
    return null;
}

function getQuotedParticipant(msg) {
    return msg?.message?.extendedTextMessage?.contextInfo?.participant || null;
}

function getTargetJid(msg) {
    return getMentionedJid(msg) || getQuotedParticipant(msg);
}

module.exports = {
    normalizeJid,
    getJidNumber,
    isGroup,
    resolveSenderNumber,
    getMentionedJid,
    getQuotedParticipant,
    getTargetJid
};
