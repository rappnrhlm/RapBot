module.exports = {
    name: 'tolak',
    aliases: ['rejectkost', 'tolakkost'],
    category: 'bukittinggi-kos',
    description: 'Menolak usulan kos dari warga (Khusus Admin).',
    usage: '!tolak <ID Usulan>',

    async execute({ sock, msg, from, senderNumber, args, isGroup: isGroupChat, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const sendReply = async (text) => {
            if (typeof reply === 'function') return await reply(text);
            return await sock.sendMessage(from, { text }, { quoted: msg });
        };

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        if (!inGroup) {
            return sendReply('❌ Command ini hanya bisa digunakan di dalam grup.');
        }

        if (!database.isGroupInitialized(from)) {
            return sendReply('❌ Grup ini belum diinisialisasi.\n\nGunakan: `!initgroup <nama grup>`');
        }

        const registeredGroup = database.getGroupById(from);
        if (registeredGroup?.role === 'public') {
            return sendReply('❌ Perintah `!tolak` hanya untuk grup internal admin.');
        }

        const targetId = args[0]?.replace(/^#/, '').trim();
        if (!targetId || isNaN(Number(targetId))) {
            return sendReply('❌ Format salah.\nContoh: `!tolak 1` atau `!tolak #1`\n\n💡 Ketik `!listusul` untuk melihat ID usulan.');
        }

        const result = await database.reviewKostSubmission(targetId, 'rejected', senderNumber || 'admin');
        if (!result.success) {
            return sendReply(`❌ Gagal: ${result.message}`);
        }

        return sendReply(`✅ Usulan kos #${targetId} ("${result.submission.name}") berhasil ditolak.`);
    }
};
