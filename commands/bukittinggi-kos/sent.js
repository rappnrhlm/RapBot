module.exports = {
    name: 'sent',
    aliases: ['kirim'],
    category: 'bukittinggi-kos',
    description: 'Menandai status data kost menjadi SENT berdasarkan ID.',
    usage: '!sent <ID>',

    async execute({ sock, msg, from, senderNumber, args, isGroup: isGroupChat, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const sendReply = async (text) => {
            if (typeof reply === 'function') {
                await reply(text);
            } else {
                await sock.sendMessage(from, { text }, { quoted: msg });
            }
        };

        // 1. Validasi harus di dalam grup
        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        if (!inGroup) {
            return sendReply('❌ Command ini hanya bisa digunakan di dalam grup.');
        }

        // 2. Validasi grup harus sudah diinisialisasi secara persistent
        if (!database.isGroupInitialized(from)) {
            const uninitMsg =
`❌ Grup ini belum diinisialisasi.

Gunakan:
\`!initgroup <nama grup>\``;
            return sendReply(uninitMsg);
        }

        try {
            const targetId = args[0]?.trim();
            if (!targetId) {
                const formatGuide =
`❌ Format: \`!sent <ID>\`

Contoh:
\`!sent KST-000001\`

💡 Gunakan \`!cari <nama>\` untuk melihat ID kost.`;
                return sendReply(formatGuide);
            }

            const result = await database.markKostSent(targetId, from, senderNumber || 'unknown');

            if (result.notFound) {
                return sendReply(`❌ Kost dengan ID ${targetId.toUpperCase()} tidak ditemukan.`);
            }

            if (result.alreadySent) {
                const idLabel = result.data?.id || targetId.toUpperCase();
                return sendReply(`ℹ️ Kost ${idLabel} sudah berstatus SENT.`);
            }

            if (!result.success) {
                return sendReply(`❌ ${result.message}`);
            }

            const kost = result.data;
            const sentAtFormatted = database.formatIndonesianDateTime(kost.sentAt);

            const succMsg =
`✅ *KOST BERHASIL DITANDAI SENT*

🆔 ${kost.id}
🏠 ${kost.name}
📌 Status: ✅ SENT
👤 Sent By: ${kost.sentBy || senderNumber || '-'}
🕒 Sent At: ${sentAtFormatted}`;

            return sendReply(succMsg);
        } catch (err) {
            console.error('[commands/bukittinggi-kos/sent] Error:', err);
            const userMsg = err?.userFriendly ? err.message : '❌ Data kost sedang tidak dapat diakses. Silakan coba lagi.';
            return sendReply(userMsg);
        }
    }
};
