const database = require('../services/database');
const { getJidNumber } = require('../utils/jid');

async function handleWelcome(sock, update) {
    const { id, participants, action } = update;
    if (action !== 'add' || !participants?.length) return;

    const config = database.getWelcomeConfig();
    if (!config || !config.enabled) return;

    let metadata;
    try {
        metadata = await sock.groupMetadata(id);
    } catch (err) {
        console.error('[handlers/welcomeHandler] Failed to get group metadata:', err.message);
        return;
    }

    const groupName = metadata?.subject || 'Grup';

    for (const participant of participants) {
        const number = getJidNumber(participant);
        const template = config.text ||
            '👋 Selamat datang @user di *@group*!\n\n' +
            'Semoga betah di sini 🤙\n' +
            'Ketik !menu untuk melihat fitur bot.';

        const text = String(template)
            .replace(/@user/g, `@${number}`)
            .replace(/@group/g, groupName);

        try {
            await sock.sendMessage(
                id,
                { text, mentions: [participant] }
            );
        } catch (err) {
            console.error(`[handlers/welcomeHandler] Error sending welcome to ${participant}:`, err.message);
        }
    }
}

module.exports = {
    handleWelcome
};
