const dmTemplate = require('../../utils/dmTemplate');

module.exports = {
    name: 'dm',
    aliases: ['dmpromosi', 'dmkost'],
    category: 'bukittinggi-kos',
    description: 'Menyiapkan link dan balon teks DM promosi siap salin untuk pemilik kos (Khusus Admin).',
    usage: '!dm <ID>',

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
            return sendReply('❌ Perintah `!dm` hanya untuk grup internal admin.');
        }

        const rawInput = args[0]?.trim();
        if (!rawInput) {
            const formatGuide =
`❌ *Format Perintah DM*

Gunakan:
\`!dm <ID Kost>\`

Contoh:
• \`!dm 1\` atau \`!dm KST-000001\`
• \`!dm 25\`

💡 *Tips:* Bot akan mengirim 2 balon chat. Balon kedua berisi teks template yang bisa langsung kamu tahan (long-press) dan salin ke Instagram!`;
            return sendReply(formatGuide);
        }

        const normalizedId = database.normalizeKostId(rawInput);
        const kost = await database.getKostById(normalizedId, from);

        if (!kost) {
            return sendReply(`❌ Kost dengan ID "${rawInput}" (${normalizedId}) tidak ditemukan di database.`);
        }

        const igUrl = kost.instagram ? database.formatInstagramUrl(kost.instagram) : '-';
        const ttUrl = kost.tiktok ? database.formatTiktokUrl(kost.tiktok) : '-';
        const waDisplay = kost.whatsapp ? database.formatWhatsappUrl(kost.whatsapp) : '-';
        const statusBadge = (kost.status || 'pending').toLowerCase() === 'sent' ? '✅ SUDAH DI-DM (SENT)' : '⏳ BELUM DI-DM (PENDING)';

        const cardText =
`🏠 *SIAP DM KOST: ${kost.name}*

🆔 ID: \`${kost.id}\`
📌 Status: ${statusBadge}
📸 Instagram: ${igUrl}
💬 WhatsApp: ${waDisplay}
🎵 TikTok: ${ttUrl}

────────────────────
👇 *Teks template promosi ada di balon chat terpisah di bawah.*
Tinggal *tahan (long press)* balon chat di bawah ➡️ Salin ➡️ Paste di DM IG/WA/TikTok!

Setelah selesai di-DM, tandai dengan:
\`!sent ${kost.id}\``;

        // 1. Kirim Pesan 1 (Kartu Info & Link)
        await sendReply(cardText);

        // 2. Kirim Pesan 2 (Balon chat mandiri hanya berisi teks template)
        const personalizedTemplate = dmTemplate.generateDmText(kost.name);
        await sock.sendMessage(from, { text: personalizedTemplate });
    }
};
