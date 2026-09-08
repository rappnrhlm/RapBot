module.exports = {
    name: 'sent',
    aliases: ['kirim'],
    category: 'bukittinggi-kos',
    description: 'Menandai status data kost menjadi SENT (mendukung single ID, daftar ID, dan range).',
    usage: '!sent <ID> | !sent <ID_awal> sampai <ID_akhir> | !sent 2 - 20 | !sent 1, 3, 5',

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
• Satu ID: \`!sent KST-000001\` atau \`!sent 1\`
• Range (sampai): \`!sent KST-000002 sampai KST-000020\`
• Range ringkas: \`!sent 2 - 20\` atau \`!sent 2 sampai 20\`
• Beberapa ID: \`!sent 1, 3, 5\` atau \`!sent KST-1, KST-3\`

💡 Gunakan \`!kost pending\` untuk melihat daftar kost yang belum di-DM.`;
                return sendReply(formatGuide);
            }

            const parsed = database.parseKostIdTargets(rawInput);
            if (!parsed.ids || parsed.ids.length === 0) {
                return sendReply('❌ Format ID atau range tidak valid.\n\nContoh:\n• `!sent KST-000002 sampai KST-000020`\n• `!sent 2 - 20`\n• `!sent KST-000001`');
            }

            // Case A: Single ID
            if (parsed.ids.length === 1) {
                const targetId = parsed.ids[0];
                const result = await database.markKostSent(targetId, from, senderNumber || 'unknown');

                if (result.notFound) {
                    return sendReply(`❌ Kost dengan ID ${targetId} tidak ditemukan.`);
                }

                if (result.alreadySent) {
                    const idLabel = result.data?.id || targetId;
                    return sendReply(`ℹ️ Kost ${idLabel} (*${result.data?.name || ''}*) sudah berstatus SENT sebelumnya.`);
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
            }

            // Case B: Batch / Range (multiple IDs)
            const result = await database.markKostBatchSent(parsed.ids, from, senderNumber || 'unknown');

            if (!result.success) {
                return sendReply(`❌ ${result.message}`);
            }

            const totalUpdated = result.updated.length;
            const totalAlready = result.alreadySent.length;
            const totalNotFound = result.notFound.length;

            let responseText = `✅ *SELESAI MENANDAI KOST (BATCH)*\n\n`;
            responseText += `📊 *Ringkasan:* (${result.total} ID diproses)\n`;
            responseText += `• ✅ Berhasil diubah: *${totalUpdated} kost*\n`;
            responseText += `• ℹ️ Sudah SENT sebelumnya: *${totalAlready} kost*\n`;
            if (totalNotFound > 0) {
                responseText += `• ⚠️ Tidak ditemukan: *${totalNotFound} ID*\n`;
            }
            responseText += `\n`;

            if (totalUpdated > 0) {
                responseText += `📝 *Daftar Yang Berhasil Diubah ke SENT:*\n`;
                const displayLimit = 20;
                result.updated.slice(0, displayLimit).forEach((k, idx) => {
                    responseText += `${idx + 1}. [${k.id}] *${k.name}*\n`;
                });
                if (result.updated.length > displayLimit) {
                    responseText += `...dan ${result.updated.length - displayLimit} kost lainnya.\n`;
                }
                responseText += `\n`;
            }

            if (totalAlready > 0) {
                const sampleAlready = result.alreadySent.slice(0, 10).map(k => k.id).join(', ');
                responseText += `ℹ️ *Sudah SENT:* ${sampleAlready}${result.alreadySent.length > 10 ? '...' : ''}\n`;
            }

            if (totalNotFound > 0) {
                const sampleNotFound = result.notFound.slice(0, 10).join(', ');
                responseText += `⚠️ *Tidak ditemukan:* ${sampleNotFound}${result.notFound.length > 10 ? '...' : ''}\n`;
            }

            responseText += `\n👤 Ditandai oleh: ${senderNumber || 'admin'}`;
            return sendReply(responseText.trim());
        } catch (err) {
            console.error('[commands/bukittinggi-kos/sent] Error:', err);
            const userMsg = err?.userFriendly ? err.message : '❌ Data kost sedang tidak dapat diakses. Silakan coba lagi.';
            return sendReply(userMsg);
        }
    }
};
