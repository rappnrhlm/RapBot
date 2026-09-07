module.exports = {
    name: 'kick',
    aliases: ['add', 'promote', 'demote'],
    category: 'group',
    description: 'Manajemen anggota grup: !add, !kick, !promote, !demote.',
    usage: '!add <nomor> | !kick @user | !promote @user | !demote @user',

    async execute({ sock, msg, from, command, args, reply, utils }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const jidUtils = utils?.jid || require('../../utils/jid');
        const phoneUtils = utils?.phone || require('../../utils/phone');

        const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
        if (!metadata) return;

        const isUserAdmin = await groupUtils.requireAdmin(sock, from, msg, metadata);
        if (!isUserAdmin) return;

        const isBotAdmin = await groupUtils.requireBotAdmin(sock, from, msg, metadata);
        if (!isBotAdmin) return;

        if (command === 'add') {
            const number = phoneUtils.normalizePhoneNumber(args[0]);
            if (!number) {
                const guide = '❌ Contoh: !add 628123456789';
                if (typeof reply === 'function') {
                    await reply(guide);
                } else {
                    await sock.sendMessage(from, { text: guide }, { quoted: msg });
                }
                return;
            }

            const jid = `${number}@s.whatsapp.net`;
            try {
                await sock.groupParticipantsUpdate(from, [jid], 'add');
                await sock.sendMessage(
                    from,
                    { text: `✅ Berhasil mencoba menambahkan @${number}`, mentions: [jid] },
                    { quoted: msg }
                );
            } catch (err) {
                console.error('[commands/group/moderation] Error add participant:', err);
                if (typeof reply === 'function') {
                    await reply('❌ Gagal menambahkan user.');
                } else {
                    await sock.sendMessage(from, { text: '❌ Gagal menambahkan user.' }, { quoted: msg });
                }
            }
            return;
        }

        const target = jidUtils.getTargetJid(msg);
        if (!target) {
            const guide = `❌ Mention atau reply target dengan !${command}`;
            if (typeof reply === 'function') {
                await reply(guide);
            } else {
                await sock.sendMessage(from, { text: guide }, { quoted: msg });
            }
            return;
        }

        const targetParticipant = groupUtils.findParticipant(metadata, target);
        if (!targetParticipant) {
            const notFound = '❌ User tidak ditemukan di grup.';
            if (typeof reply === 'function') {
                await reply(notFound);
            } else {
                await sock.sendMessage(from, { text: notFound }, { quoted: msg });
            }
            return;
        }

        const targetJid = targetParticipant.id;
        const targetNumber = jidUtils.getJidNumber(targetJid);

        try {
            if (command === 'kick') {
                await sock.groupParticipantsUpdate(from, [targetJid], 'remove');
                await sock.sendMessage(
                    from,
                    {
                        text: `✅ @${targetNumber} telah dikeluarkan.`,
                        mentions: [targetJid]
                    },
                    { quoted: msg }
                );
                return;
            }

            if (command === 'promote') {
                await sock.groupParticipantsUpdate(from, [targetJid], 'promote');
                await sock.sendMessage(
                    from,
                    {
                        text: `👑 @${targetNumber} sekarang menjadi admin.`,
                        mentions: [targetJid]
                    },
                    { quoted: msg }
                );
                return;
            }

            if (command === 'demote') {
                await sock.groupParticipantsUpdate(from, [targetJid], 'demote');
                await sock.sendMessage(
                    from,
                    {
                        text: `⬇️ @${targetNumber} tidak lagi menjadi admin.`,
                        mentions: [targetJid]
                    },
                    { quoted: msg }
                );
                return;
            }
        } catch (err) {
            console.error(`[commands/group/moderation] Error executing !${command}:`, err);
            const failMsg = `❌ Gagal menjalankan !${command}.`;
            if (typeof reply === 'function') {
                await reply(failMsg);
            } else {
                await sock.sendMessage(from, { text: failMsg }, { quoted: msg });
            }
        }
    }
};
