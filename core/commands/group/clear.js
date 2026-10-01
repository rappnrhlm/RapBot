const jidUtils = require('../../utils/jid');
const groupUtils = require('../../utils/group');

// In-memory ring buffer of recent messages per chat (for bot delete target resolution)
const recentSentMessages = new Map(); // chatJid -> Array of message keys { id, remoteJid, fromMe, participant }

function trackSentMessage(chatJid, messageKey) {
    if (!chatJid || !messageKey?.id) return;
    const cleanJid = jidUtils.normalizeJid(chatJid);
    if (!recentSentMessages.has(cleanJid)) {
        recentSentMessages.set(cleanJid, []);
    }
    const list = recentSentMessages.get(cleanJid);
    list.push(messageKey);
    // Keep last 100 messages per chat
    if (list.length > 100) {
        list.shift();
    }
}

function getRecentSentMessages(chatJid) {
    const cleanJid = jidUtils.normalizeJid(chatJid);
    return recentSentMessages.get(cleanJid) || [];
}

module.exports = {
    name: 'clear',
    aliases: ['purge', 'delete', 'del', 'hapus', 'bersihkan'],
    category: 'group',
    description: 'Menghapus pesan bot (atau pesan member) untuk semua orang di grup agar chat bersih.',
    usage: '!clear [jumlah: 1-50] | !del (reply pesan)',
    trackSentMessage,
    getRecentSentMessages,

    async execute({ sock, msg, from, senderNumber, args, command, isGroup: isGroupChat, reply, utils, services }) {
        const database = services?.database || require('../../services/database');
        const gUtils = utils?.group || groupUtils;
        const jUtils = utils?.jid || jidUtils;

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jUtils.isGroup(from);
        
        // 1. CASE A: REPLY MESSAGE (Hapus 1 Pesan Tertentu yang di-reply)
        const quotedMsg = msg?.message?.extendedTextMessage?.contextInfo;
        const quotedStanzaId = quotedMsg?.stanzaId;
        const quotedParticipant = quotedMsg?.participant;

        if (quotedStanzaId) {
            // Cek perizinan
            if (inGroup) {
                const metadata = await gUtils.getGroupMetadata(sock, from, msg);
                if (!metadata) return;

                const isUserAdmin = await gUtils.requireAdmin(sock, from, msg, metadata);
                if (!isUserAdmin) return;

                const botId = sock?.user?.id || '';
                const botNumber = jUtils.getJidNumber(botId);
                const quotedNumber = quotedParticipant ? jUtils.getJidNumber(quotedParticipant) : '';
                const isBotOwnMessage = quotedNumber === botNumber || quotedMsg?.fromMe;

                // Jika menghapus pesan orang lain, bot harus admin
                if (!isBotOwnMessage) {
                    const isBotAdmin = await gUtils.requireBotAdmin(sock, from, msg, metadata);
                    if (!isBotAdmin) return;
                }
            }

            try {
                const deleteKey = {
                    remoteJid: from,
                    fromMe: quotedMsg?.fromMe || (quotedParticipant && jUtils.getJidNumber(quotedParticipant) === jUtils.getJidNumber(sock?.user?.id)),
                    id: quotedStanzaId,
                    participant: inGroup ? (quotedParticipant || undefined) : undefined
                };

                await sock.sendMessage(from, { delete: deleteKey });
                
                // Hapus juga pesan command !del si admin agar chat bersih total
                try {
                    await sock.sendMessage(from, { delete: msg.key });
                } catch (_) {}
                return;
            } catch (err) {
                console.error('[clear] Error deleting single quoted message:', err);
                if (typeof reply === 'function') {
                    return await reply(`❌ Gagal menghapus pesan: ${err.message}`);
                }
                return;
            }
        }

        // 2. CASE B: HAPUS N PESAN BOT TERAKHIR (Default: !clear / !clear 10)
        if (inGroup) {
            const metadata = await gUtils.getGroupMetadata(sock, from, msg);
            if (!metadata) return;

            const isUserAdmin = await gUtils.requireAdmin(sock, from, msg, metadata);
            if (!isUserAdmin) return;
        }

        let count = 5; // Default 5 pesan
        if (args[0] && !isNaN(Number(args[0]))) {
            count = Math.min(Math.max(parseInt(args[0], 10), 1), 50); // Min 1, Max 50
        }

        const sentList = getRecentSentMessages(from);

        if (sentList.length === 0) {
            const emptyNotice = `ℹ️ Tidak ada riwayat pesan bot terbaru di memori sesi ini yang dapat dihapus.\n\n💡 *Tips:* Kamu juga bisa me-reply chat apapun lalu ketik \`!del\` untuk menghapus pesan spesifik.`;
            if (typeof reply === 'function') return await reply(emptyNotice);
            return await sock.sendMessage(from, { text: emptyNotice }, { quoted: msg });
        }

        // Ambil N pesan terakhir dari bot
        const toDelete = sentList.splice(-count, count);
        let deletedCount = 0;

        for (const key of toDelete.reverse()) {
            try {
                await sock.sendMessage(from, { delete: key });
                deletedCount++;
                // Small delay to prevent flood
                await new Promise(r => setTimeout(r, 200));
            } catch (delErr) {
                console.warn(`[clear] Gagal delete message ${key.id}:`, delErr.message);
            }
        }

        // Hapus juga pesan command trigger `!clear` admin
        try {
            await sock.sendMessage(from, { delete: msg.key });
        } catch (_) {}

        // Kirim konfirmasi singkat lalu auto-delete dalam 3 detik agar grup bersih
        try {
            const confirmMsg = await sock.sendMessage(from, { 
                text: `🧹 *Bersih!* Berhasil menghapus *${deletedCount} pesan bot* dari grup.` 
            });
            setTimeout(async () => {
                try {
                    await sock.sendMessage(from, { delete: confirmMsg.key });
                } catch (_) {}
            }, 3000);
        } catch (_) {}
    }
};
