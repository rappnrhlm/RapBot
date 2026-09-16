module.exports = {
    name: 'delusul',
    aliases: ['hapususul', 'usuldel'],
    category: 'bukittinggi-kos',
    description: 'Menghapus data usulan kos (khusus admin).',
    usage: '!delusul <ID>',

    async execute({ sock, msg, from, args, isGroup: isGroupChat, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const sendReply = async (text) => {
            if (typeof reply === 'function') await reply(text);
            else await sock.sendMessage(from, { text }, { quoted: msg });
        };

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        if (!inGroup) {
            return sendReply('❌ Command ini hanya bisa digunakan di dalam grup.');
        }

        if (!database.isGroupInitialized(from)) {
            return sendReply('❌ Grup ini belum diinisialisasi.');
        }

        const groupInfo = database.getGroupById(from);
        if (groupInfo && groupInfo.role === 'public') {
            return sendReply('❌ Perintah ini khusus untuk grup internal admin.');
        }

        const targetId = args[0]?.trim().replace(/^#/, '');
        if (!targetId) {
            return sendReply('❌ Format: `!delusul <ID>`\n_Contoh:_ `!delusul 3`');
        }

        const result = await database.deleteKostSubmission(targetId);
        if (!result.success) {
            return sendReply(`❌ ${result.message}`);
        }

        return sendReply(`✅ Usulan #${targetId} berhasil dihapus dari sistem.`);
    }
};
