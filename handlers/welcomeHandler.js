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

    const config = database.getWelcomeConfig();
    if (!config || !config.enabled) return;

    const groupId = typeof id === 'object' ? (id.id || id.jid || String(id)) : String(id);

    let metadata;
    try {
        metadata = await sock.groupMetadata(groupId);
    } catch (err) {
        console.error('[handlers/welcomeHandler] Failed to get group metadata:', err.message);
        return;
    }

    const groupName = metadata?.subject || 'Grup';

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
            .replace(/@group/g, groupName);

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
