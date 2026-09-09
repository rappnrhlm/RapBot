const database = require('../services/database');
const { getJidNumber } = require('../utils/jid');

function extractParticipantJid(participant) {
    if (!participant) return '';
    if (typeof participant === 'string') return participant;
    if (typeof participant === 'object') {
        return participant.id || participant.jid || participant.phoneNumber || '';
    }
    return String(participant);
}

async function handleWelcome(sock, update) {
    const { id, participants, action } = update;
    if (action !== 'add' || !participants?.length) return;

    const groupId = typeof id === 'object' ? (id.id || id.jid || String(id)) : String(id);

    const config = database.getWelcomeConfig(groupId);
    if (!config || !config.enabled) return;

    let metadata;
    try {
        metadata = await sock.groupMetadata(groupId);
    } catch (err) {
        console.error('[handlers/welcomeHandler] Failed to get group metadata:', err.message);
        return;
    }

    const groupName = metadata?.subject || 'Grup';
    const groupDesc = metadata?.desc ? String(metadata.desc).trim() : '-';
    const memberCount = metadata?.participants?.length ? String(metadata.participants.length) : '-';

    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    const timeStr = now.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit'
    }) + ' WIB';

    for (const rawParticipant of participants) {
        const participantJid = extractParticipantJid(rawParticipant);
        if (!participantJid) continue;

        let displayJid = participantJid;
        let number = getJidNumber(participantJid);

        // If it's a LID, attempt to resolve phone number for cleaner @tag
        if (participantJid.endsWith('@lid')) {
            try {
                const pn = await sock?.signalRepository?.lidMapping?.getPNForLID(participantJid);
                if (pn) {
                    displayJid = pn;
                    number = getJidNumber(pn);
                }
            } catch (_) {}
        }

        const template = config.text ||
            '👋 Selamat datang @user di *@group*!\n\n' +
            'Semoga betah di sini 🤙\n' +
            'Ketik !menu untuk melihat fitur bot.';

        const text = String(template)
            .replace(/@user/g, `@${number}`)
            .replace(/@group/g, groupName)
            .replace(/@desc/g, groupDesc)
            .replace(/@count/g, memberCount)
            .replace(/@members/g, memberCount)
            .replace(/@date/g, dateStr)
            .replace(/@time/g, timeStr);

        const mentions = [participantJid];
        if (displayJid && displayJid !== participantJid && !mentions.includes(displayJid)) {
            mentions.push(displayJid);
        }

        try {
            await sock.sendMessage(
                groupId,
                { text, mentions }
            );
        } catch (err) {
            console.error(`[handlers/welcomeHandler] Error sending welcome to ${participantJid}:`, err.message);
        }
    }
}

module.exports = {
    handleWelcome
};
