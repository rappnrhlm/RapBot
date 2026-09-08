module.exports = {
    name: 'delkost',
    aliases: ['hapuskost'],
    category: 'bukittinggi-kos',
    description: 'Menghapus data kost berdasarkan ID.',
    usage: '!delkost <ID>',

    async execute({ sock, msg, from, args, isGroup: isGroupChat, reply, services, utils }) {
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
`❌ Format: \`!delkost <ID>\`

Contoh:
\`!delkost KST-000001\`

💡 Gunakan \`!cari <nama>\` untuk melihat ID kost.`;
                return sendReply(formatGuide);
            }

            const result = await database.deleteKost(targetId, from);

            if (result.notFound) {
                return sendReply(`❌ Kost dengan ID ${targetId.toUpperCase()} tidak ditemukan.`);
            }

            if (!result.success) {
                return sendReply(`❌ ${result.message}`);
            }

            const succMsg =
`✅ Kost berhasil dihapus.

🆔 ${result.data.id}
🏠 ${result.data.name}`;

            return sendReply(succMsg);
        } catch (err) {
            console.error('[commands/bukittinggi-kos/delkost] Error:', err);
            const userMsg = err?.userFriendly ? err.message : '❌ Data kost sedang tidak dapat diakses. Silakan coba lagi.';
            return sendReply(userMsg);
        }
    }
};
