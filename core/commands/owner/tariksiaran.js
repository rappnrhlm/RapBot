module.exports = {
    name: 'tariksiaran',
    aliases: ['undobc', 'undobroadcast', 'hapussiaran', 'bchapus'],
    category: 'owner',
    description: 'Tarik / hapus pesan siaran terakhir serentak dari seluruh grup (Khusus Owner).',
    usage: '!tariksiaran',

    async execute({ sock, msg, from, senderNumber, reply, services }) {
        const database = services?.database || require('../../services/database');

        if (!database.isOwner(senderNumber) && !database.isSuperOwner(senderNumber)) {
            const forbidden = '❌ Perintah ini hanya dapat dijalankan oleh Owner / Super Owner bot.';
            if (typeof reply === 'function') {
                return await reply(forbidden);
            }
            return await sock.sendMessage(from, { text: forbidden }, { quoted: msg });
        }

        const latestBc = database.getLatestBroadcast();
        if (!latestBc) {
            const notFound = 'ℹ️ Tidak ditemukan riwayat pesan siaran untuk ditarik.';
            if (typeof reply === 'function') {
                return await reply(notFound);
            }
            return await sock.sendMessage(from, { text: notFound }, { quoted: msg });
        }

        if (latestBc.deleted) {
            const already = `⚠️ Pesan siaran terakhir (${latestBc.id}) sudah pernah ditarik/dihapus sebelumnya.`;
            if (typeof reply === 'function') {
                return await reply(already);
            }
            return await sock.sendMessage(from, { text: already }, { quoted: msg });
        }

        const targetMessages = latestBc.messages || [];
        if (targetMessages.length === 0) {
            database.markBroadcastDeleted(latestBc.id);
            const empty = '⚠️ Tidak ada data pesan yang tersimpan pada sesi siaran ini.';
            if (typeof reply === 'function') {
                return await reply(empty);
            }
            return await sock.sendMessage(from, { text: empty }, { quoted: msg });
        }

        if (typeof reply === 'function') {
            await reply(`⏳ Sedang menarik pesan siaran terakhir dari *${targetMessages.length} grup*...`);
        } else {
            await sock.sendMessage(from, { text: `⏳ Sedang menarik pesan siaran terakhir dari *${targetMessages.length} grup*...` }, { quoted: msg });
        }

        let deletedCount = 0;
        const errors = [];

        for (const item of targetMessages) {
            try {
                if (item.key) {
                    await sock.sendMessage(item.jid, { delete: item.key });
                } else if (item.messageId) {
                    await sock.sendMessage(item.jid, {
                        delete: {
                            remoteJid: item.jid,
                            fromMe: true,
                            id: item.messageId
                        }
                    });
                }
                deletedCount++;
                await new Promise(r => setTimeout(r, 250));
            } catch (err) {
                console.warn(`[tariksiaran] Gagal delete di ${item.jid}:`, err.message);
                errors.push(item.jid);
            }
        }

        database.markBroadcastDeleted(latestBc.id);
        database.logCommand(`broadcast:undo:${latestBc.id}`, from, senderNumber, true);

        const resultText = `✅ *SIARAN BERHASIL DITARIK!*\n\n` +
            `• ID Siaran: \`${latestBc.id}\`\n` +
            `• Berhasil dihapus dari: *${deletedCount} / ${targetMessages.length} grup*\n` +
            `• Waktu Tarik: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n` +
            (errors.length > 0 ? `• Gagal di: ${errors.length} grup\n` : '');

        if (typeof reply === 'function') {
            await reply(resultText);
        } else {
            await sock.sendMessage(from, { text: resultText }, { quoted: msg });
        }
    }
};
