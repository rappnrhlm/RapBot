module.exports = {
    name: 'listusul',
    aliases: ['usulan', 'daftarusul'],
    category: 'bukittinggi-kos',
    description: 'Melihat daftar usulan kos dari warga/grup publik (Khusus Admin).',
    usage: '!listusul [pending|all|approved|rejected]',

    async execute({ sock, msg, from, args, isGroup: isGroupChat, reply, services, utils }) {
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
            return sendReply('❌ Perintah `!listusul` hanya untuk grup internal admin.');
        }

        const filterStatus = args[0]?.toLowerCase() || 'pending';
        const list = await database.getKostSubmissions({ status: filterStatus });

        if (!list.length) {
            return sendReply(`📋 Tidak ada usulan kos dengan status *${filterStatus.toUpperCase()}*.`);
        }

        let text = `📥 *DAFTAR USULAN KOS (${filterStatus.toUpperCase()})*\nTotal: ${list.length} usulan\n\n`;
        list.forEach((sub, idx) => {
            const timeStr = sub.submittedAt ? database.formatIndonesianDateTime(sub.submittedAt) : '-';
            const statusBadge = sub.status === 'approved' ? '✅ Disetujui' : (sub.status === 'rejected' ? '❌ Ditolak' : '⏳ Pending');
            text += `${idx + 1}. *#${sub.id} - ${sub.name}*\n   📞 Kontak: ${sub.contactsRaw}\n   👤 Pengirim: wa.me/${sub.submittedBy || 'anon'}\n   🕒 Waktu: ${timeStr}\n   📌 Status: ${statusBadge}\n\n`;
        });

        text += `────────────────────\n💡 *Aksi Admin:*\n• Menyetujui: \`!acc <ID>\` (contoh: \`!acc 1\`)\n• Menolak: \`!tolak <ID>\` (contoh: \`!tolak 1\`)`;

        return sendReply(text.trim());
    }
};
