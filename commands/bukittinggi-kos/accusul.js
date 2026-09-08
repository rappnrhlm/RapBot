function parseContacts(rawContacts) {
    if (!rawContacts) return { instagram: null, tiktok: null, whatsapp: null };

    const contacts = { instagram: null, tiktok: null, whatsapp: null };
    const tokens = rawContacts.split(/[,|]+/).map(t => t.trim()).filter(Boolean);

    for (const token of tokens) {
        const lower = token.toLowerCase();

        if (/^(ig|instagram)\s*[:=]\s*/i.test(token)) {
            contacts.instagram = token.replace(/^(ig|instagram)\s*[:=]\s*/i, '').trim();
        } else if (/^(wa|whatsapp|no|telp|hp)\s*[:=]\s*/i.test(token)) {
            contacts.whatsapp = token.replace(/^(wa|whatsapp|no|telp|hp)\s*[:=]\s*/i, '').trim();
        } else if (/^(tt|tiktok)\s*[:=]\s*/i.test(token)) {
            contacts.tiktok = token.replace(/^(tt|tiktok)\s*[:=]\s*/i, '').trim();
        } else if (lower.includes('instagram.com/')) {
            contacts.instagram = token;
        } else if (lower.includes('tiktok.com/')) {
            contacts.tiktok = token;
        } else if (lower.includes('wa.me/') || lower.includes('api.whatsapp.com/')) {
            contacts.whatsapp = token;
        } else if (/^(\+?62|08)[0-9\s\-]{7,15}$/.test(token.replace(/\s+/g, ''))) {
            contacts.whatsapp = token;
        } else {
            if (!contacts.instagram) contacts.instagram = token;
            else if (!contacts.tiktok) contacts.tiktok = token;
            else if (!contacts.whatsapp) contacts.whatsapp = token;
        }
    }

    return contacts;
}

module.exports = {
    name: 'acc',
    aliases: ['approvekost', 'terimakost', 'acckost'],
    category: 'bukittinggi-kos',
    description: 'Menyetujui usulan kos dari warga dan memasukkannya ke database (Khusus Admin).',
    usage: '!acc <ID Usulan>',

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
            return sendReply('❌ Perintah `!acc` hanya untuk grup internal admin.');
        }

        const targetId = args[0]?.replace(/^#/, '').trim();
        if (!targetId || isNaN(Number(targetId))) {
            return sendReply('❌ Format salah.\nContoh: `!acc 1` atau `!acc #1`\n\n💡 Ketik `!listusul` untuk melihat ID usulan.');
        }

        const sub = await database.getKostSubmissionById(targetId);
        if (!sub) {
            return sendReply(`❌ Usulan kos #${targetId} tidak ditemukan.`);
        }

        if (sub.status !== 'pending') {
            return sendReply(`ℹ️ Usulan #${targetId} sudah diproses sebelumnya dengan status: *${sub.status.toUpperCase()}*.`);
        }

        const parsed = parseContacts(sub.contactsRaw);

        // Masukkan ke tabel utama kost
        const addResult = await database.addKost({
            name: sub.name,
            instagram: parsed.instagram,
            tiktok: parsed.tiktok,
            whatsapp: parsed.whatsapp,
            addedBy: sub.submittedBy ? `usul:${sub.submittedBy}` : 'warga',
            groupId: from
        });

        if (!addResult.success) {
            return sendReply(`❌ Gagal memasukkan data kos: ${addResult.message}`);
        }

        // Update status usulan jadi approved
        await database.reviewKostSubmission(targetId, 'approved', senderNumber || 'admin');

        let contactLines = [];
        if (addResult.data.instagram) contactLines.push(`   📸 IG: ${database.formatInstagramUrl(addResult.data.instagram)}`);
        if (addResult.data.whatsapp) contactLines.push(`   💬 WA: ${database.formatWhatsappUrl(addResult.data.whatsapp)}`);
        if (addResult.data.tiktok) contactLines.push(`   🎵 TT: ${database.formatTiktokUrl(addResult.data.tiktok)}`);

        const succMsg =
`✅ *Usulan #${targetId} Berhasil Disetujui!*

Data otomatis masuk ke database:
🆔 ID Kos Baru: *${addResult.data.id}*
🏠 Nama: *${addResult.data.name}*
${contactLines.join('\n')}
📌 Status: ⏳ PENDING
👤 Pengusul: wa.me/${sub.submittedBy || 'unknown'}`;

        return sendReply(succMsg);
    }
};
