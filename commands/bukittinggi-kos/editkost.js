function parseContacts(rawContacts) {
    if (!rawContacts) return { instagram: null, tiktok: null, whatsapp: null };

    const contacts = {
        instagram: null,
        tiktok: null,
        whatsapp: null
    };

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
            if (!contacts.instagram) {
                contacts.instagram = token;
            } else if (!contacts.tiktok) {
                contacts.tiktok = token;
            } else if (!contacts.whatsapp) {
                contacts.whatsapp = token;
            }
        }
    }

    return contacts;
}

module.exports = {
    name: 'editkost',
    aliases: ['ubahkost', 'updatekost', 'kostedit'],
    category: 'bukittinggi-kos',
    description: 'Mengedit data kos yang sudah terdaftar (Nama & Kontak).',
    usage: '!editkost <ID> <Nama Baru> > <Kontak Baru>',

    async execute({ sock, msg, from, senderNumber, args, isGroup: isGroupChat, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const sendReply = async (text) => {
            if (typeof reply === 'function') await reply(text);
            else await sock.sendMessage(from, { text }, { quoted: msg });
        };

        // 1. Validasi harus di dalam grup
        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        if (!inGroup) {
            return sendReply('❌ Command ini hanya bisa digunakan di dalam grup.');
        }

        // 2. Validasi grup harus sudah diinisialisasi secara persistent
        if (!database.isGroupInitialized(from)) {
            return sendReply('❌ Grup ini belum diinisialisasi.\nGunakan `!initgroup <nama grup>`');
        }

        // 3. Validasi peran grup: khusus grup internal admin
        const groupInfo = database.getGroupById(from);
        if (groupInfo && groupInfo.role === 'public') {
            return sendReply('❌ Perintah ini khusus untuk grup internal admin.');
        }

        const raw = args.join(' ').trim();
        if (!raw) {
            const guide =
`❌ *Format Edit Kost:*
\`!editkost <ID> <Nama Baru> > <Kontak Baru>\`

_Contoh:_
• \`!editkost 16 Kost Al-Mubarak Baru > ig: @almubarak | wa: 08123456789\`
• \`!editkost KST-000016 Kost Mawar Indah > ig: @kostmawar\``;
            return sendReply(guide);
        }

        // Ambil token ID pertama
        const firstSpaceIdx = raw.indexOf(' ');
        if (firstSpaceIdx === -1) {
            return sendReply('❌ Masukkan nama dan kontak baru setelah ID kost.\n_Contoh:_ `!editkost 16 Kost Mawar > ig: mawar`');
        }

        const targetId = raw.substring(0, firstSpaceIdx).trim();
        const restContent = raw.substring(firstSpaceIdx + 1).trim();

        const parts = restContent.split('>');
        const newName = parts[0]?.trim();
        const contactStr = parts.slice(1).join('>').trim();

        if (!newName) {
            return sendReply('❌ Nama kost baru wajib diisi.');
        }

        // Cek apakah item kost ada
        const currentItem = await database.getKostById(targetId, from);
        if (!currentItem) {
            return sendReply(`❌ Kost dengan ID "${targetId}" tidak ditemukan.`);
        }

        let parsedContacts = {
            instagram: currentItem.instagram,
            tiktok: currentItem.tiktok,
            whatsapp: currentItem.whatsapp
        };

        if (contactStr) {
            parsedContacts = parseContacts(contactStr);
        }

        const updateResult = await database.updateKost(currentItem.id, {
            name: newName,
            instagram: parsedContacts.instagram,
            tiktok: parsedContacts.tiktok,
            whatsapp: parsedContacts.whatsapp,
            updatedBy: senderNumber || 'admin'
        });

        if (!updateResult.success) {
            return sendReply(`❌ ${updateResult.message}`);
        }

        const item = updateResult.data || updateResult.kost || currentItem;
        const succMsg =
`✅ *Data Kost Berhasil Diperbarui!*

🆔 *ID:* ${item.id}
🏠 *Nama:* ${item.name}
📸 *IG:* ${item.instagram ? database.formatInstagramUrl(item.instagram) : '-'}
💬 *WA:* ${item.whatsapp ? database.formatWhatsappUrl(item.whatsapp) : '-'}
🎵 *TikTok:* ${item.tiktok ? database.formatTiktokUrl(item.tiktok) : '-'}
📊 *Status:* ${String(item.status).toUpperCase()}`;

        return sendReply(succMsg);
    }
};
