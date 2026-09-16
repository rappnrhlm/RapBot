module.exports = {
    name: 'editusul',
    aliases: ['ubahusul', 'updateusul', 'usuledit'],
    category: 'bukittinggi-kos',
    description: 'Mengedit data usulan warga (khusus admin).',
    usage: '!editusul <ID> <Nama Baru> > <Kontak Baru>',

    async execute({ sock, msg, from, senderNumber, args, isGroup: isGroupChat, reply, services, utils }) {
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

        const raw = args.join(' ').trim();
        if (!raw) {
            const guide =
`❌ *Format Edit Usulan:*
\`!editusul <ID> <Nama Baru> > <Kontak Baru>\`

_Contoh:_
• \`!editusul 3 Kost Sakura Indah > wa: 08123456789 | ig: @kostsakura\``;
            return sendReply(guide);
        }

        const firstSpaceIdx = raw.indexOf(' ');
        if (firstSpaceIdx === -1) {
            return sendReply('❌ Masukkan nama dan kontak usulan baru setelah nomor ID usulan.');
        }

        const targetId = raw.substring(0, firstSpaceIdx).trim().replace(/^#/, '');
        const restContent = raw.substring(firstSpaceIdx + 1).trim();

        const parts = restContent.split('>');
        const newName = parts[0]?.trim();
        const contactStr = parts.slice(1).join('>').trim();

        if (!newName) {
            return sendReply('❌ Nama usulan baru wajib diisi.');
        }

        const existing = await database.getKostSubmissionById(targetId);
        if (!existing) {
            return sendReply(`❌ Usulan #${targetId} tidak ditemukan.`);
        }

        const newContacts = contactStr || existing.contactsRaw;
        const result = await database.updateKostSubmission(targetId, {
            name: newName,
            contactsRaw: newContacts,
            reviewedBy: senderNumber || 'admin'
        });

        if (!result.success) {
            return sendReply(`❌ ${result.message}`);
        }

        const succMsg =
`✅ *Usulan #${targetId} Berhasil Diperbarui!*

🏠 *Nama:* ${newName}
📱 *Kontak:* ${newContacts}
📊 *Status:* ${String(result.data.status).toUpperCase()}`;

        return sendReply(succMsg);
    }
};
