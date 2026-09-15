module.exports = {
    name: 'post',
    aliases: ['tayang', 'publikasikan', 'unpost', 'tarik'],
    category: 'bukittinggi-kos',
    description: 'Menandai status data kos menjadi PUBLISHED (tayang resmi & dapat dicari publik), atau UNPOST (menarik kembali dari publik).',
    usage: '!post <ID> | !unpost <ID>',

    async execute({ sock, msg, from, senderNumber, command, args, isGroup: isGroupChat, reply, services, utils }) {
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

        // 2. Validasi grup harus sudah diinisialisasi
        if (!database.isGroupInitialized(from)) {
            const uninitMsg =
`❌ Grup ini belum diinisialisasi.

Gunakan:
\`!initgroup <nama grup>\``;
            return sendReply(uninitMsg);
        }

        // 3. Validasi peran grup: khusus grup internal admin
        const groupInfo = database.getGroupById(from);
        if (groupInfo && groupInfo.role === 'public') {
            return sendReply('❌ Perintah ini khusus untuk grup internal admin.');
        }

        try {
            const rawInput = args.join(' ').trim();
            if (!rawInput) {
                const formatGuide =
`❌ Format salah.

💡 *Contoh Penggunaan:*
• Tayangkan kos: \`!post KST-000001\` atau \`!post 1\`
• Tarik dari publik: \`!unpost KST-000001\` atau \`!unpost 1\`

💡 Gunakan \`!kost [sent|pending]\` untuk melihat daftar kos yang siap diposting.`;
                return sendReply(formatGuide);
            }

            const isUnpost = command === 'unpost' || command === 'tarik';
            const parsed = database.parseKostIdTargets(rawInput);
            if (!parsed.ids || parsed.ids.length === 0) {
                return sendReply('❌ Format ID tidak valid.\nContoh: `!post KST-000001` atau `!post 1`');
            }

            const targetId = parsed.ids[0];

            if (isUnpost) {
                // Revert to 'sent'
                const updateRes = await database.updateKost(targetId, { status: 'sent', groupId: from });
                if (!updateRes.success) {
                    return sendReply(`❌ ${updateRes.message || 'Gagal mengubah status.'}`);
                }

                const succMsg =
`↩️ *KOST BERHASIL DITARIK DARI PUBLIK (UNPOST)*

🆔 ${updateRes.data.id}
🏠 ${updateRes.data.name}
📌 Status: 📩 TERKIRIM PENAWARAN (Hanya Admin)
💡 Kos ini tidak akan muncul lagi di pencarian publik \`!cari\`.`;
                return sendReply(succMsg);
            }

            // Normal POST / TAYANG
            const result = await database.markKostPublished(targetId, from, senderNumber || 'admin');

            if (result.notFound) {
                return sendReply(`❌ Kost dengan ID "${targetId}" tidak ditemukan.`);
            }

            if (result.alreadyPublished) {
                const idLabel = result.data?.id || targetId;
                return sendReply(`ℹ️ Kost ${idLabel} (*${result.data?.name || ''}*) sudah berstatus TAYANG / SUDAH DIPOSTING sebelumnya.`);
            }

            if (!result.success) {
                return sendReply(`❌ ${result.message}`);
            }

            const kost = result.data;
            const succMsg =
`🟢 *KOST BERHASIL DIPOSTING / DITAYANGKAN!*

🆔 ${kost.id}
🏠 ${kost.name}
📌 Status: 🟢 SUDAH DIPOSTING (PUBLIK)
👤 Diposting oleh: ${senderNumber || 'admin'}
🕒 Waktu: ${database.formatIndonesianDateTime(new Date())}

✨ Kos ini sekarang *resmi aktif* dan dapat dicari oleh seluruh warga grup melalui \`!cari ${kost.name}\`.`;

            return sendReply(succMsg);
        } catch (err) {
            console.error('[commands/bukittinggi-kos/post] Error:', err);
            const userMsg = err?.userFriendly ? err.message : '❌ Data kost sedang tidak dapat diakses. Silakan coba lagi.';
            return sendReply(userMsg);
        }
    }
};
