function parseContacts(rawContacts) {
    if (!rawContacts) return { instagram: null, tiktok: null, whatsapp: null };

    const contacts = {
        instagram: null,
        tiktok: null,
        whatsapp: null
    };

    // Pisahkan berdasarkan delimiter pipa (|) atau koma (,)
    const tokens = rawContacts.split(/[,|]+/).map(t => t.trim()).filter(Boolean);

    for (const token of tokens) {
        const lower = token.toLowerCase();

        // 1. Prefix eksplisit
        if (/^(ig|instagram)\s*[:=]\s*/i.test(token)) {
            contacts.instagram = token.replace(/^(ig|instagram)\s*[:=]\s*/i, '').trim();
        } else if (/^(wa|whatsapp|no|telp|hp)\s*[:=]\s*/i.test(token)) {
            contacts.whatsapp = token.replace(/^(wa|whatsapp|no|telp|hp)\s*[:=]\s*/i, '').trim();
        } else if (/^(tt|tiktok)\s*[:=]\s*/i.test(token)) {
            contacts.tiktok = token.replace(/^(tt|tiktok)\s*[:=]\s*/i, '').trim();
        }
        // 2. Format URL
        else if (lower.includes('instagram.com/')) {
            contacts.instagram = token;
        } else if (lower.includes('tiktok.com/')) {
            contacts.tiktok = token;
        } else if (lower.includes('wa.me/') || lower.includes('api.whatsapp.com/')) {
            contacts.whatsapp = token;
        }
        // 3. Deteksi otomatis nomor telepon / WhatsApp (+62, 62, 08, dsb.)
        else if (/^(\+?62|08)[0-9\s\-]{7,15}$/.test(token.replace(/\s+/g, ''))) {
            contacts.whatsapp = token;
        }
        // 4. Default fallback: jika Instagram belum terisi -> Instagram, jika sudah -> TikTok, jika sudah -> WhatsApp
        else {
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

function getContactDisplayLines(kost, database, indent = '   ') {
    const lines = [];
    if (kost.instagram) {
        const url = database.formatInstagramUrl(kost.instagram);
        lines.push(`${indent}📸 ${url}`);
    }
    if (kost.whatsapp) {
        const url = database.formatWhatsappUrl(kost.whatsapp);
        lines.push(`${indent}💬 ${url}`);
    }
    if (kost.tiktok) {
        const url = database.formatTiktokUrl(kost.tiktok);
        lines.push(`${indent}🎵 ${url}`);
    }
    if (lines.length === 0) {
        lines.push(`${indent}ℹ️ -`);
    }
    return lines.join('\n');
}

module.exports = {
    name: 'kost',
    aliases: ['addkost', 'cari', 'listkost', 'kostdm'],
    category: 'bukittinggi-kos',
    description: 'Manajemen data kos (khusus grup yang terdaftar). Mendukung Instagram, WhatsApp, dan TikTok.',
    usage: '!addkost <Nama Kost> > <kontak (ig/wa/tt)> | !kost [all|pending|sent] | !kost dm | !kost lengkap <ID> | !cari <keyword>',

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

        // 2. Validasi grup harus sudah diinisialisasi secara persistent
        if (!database.isGroupInitialized(from)) {
            const uninitMsg =
`❌ Grup ini belum diinisialisasi.

Gunakan:
!initgroup <nama grup>`;
            return sendReply(uninitMsg);
        }

        try {
            // 1. ADD KOST: !addkost <Nama Kost> > <kontak (ig/wa/tt)>
            if (command === 'addkost') {
                const raw = args.join(' ').trim();
                const parts = raw.split('>');
                const name = parts[0]?.trim();
                const contactStr = parts.slice(1).join('>').trim();

                if (!name || !contactStr) {
                    const guide =
`❌ Format salah.
Contoh:
• *!addkost Kost Mawar > kostmawar* (Instagram)
• *!addkost Kost Mawar > wa: 08123456789* (WhatsApp)
• *!addkost Kost Mawar > ig: mawar | wa: 08123456789 | tt: mawarkos*`;
                    return sendReply(guide);
                }

                const parsed = parseContacts(contactStr);

                const result = await database.addKost({
                    name,
                    instagram: parsed.instagram,
                    tiktok: parsed.tiktok,
                    whatsapp: parsed.whatsapp,
                    addedBy: senderNumber || 'unknown',
                    groupId: from
                });

                if (!result.success) {
                    const warnMsg = `⚠️ ${result.message}`;
                    return sendReply(warnMsg);
                }

                const contactDisplay = getContactDisplayLines(result.data, database, '');
                const succMsg =
`✅ Kost berhasil ditambahkan.

ID: ${result.data.id}
Nama: ${result.data.name}
${contactDisplay}
Status: ⏳ PENDING`;

                return sendReply(succMsg);
            }

            // 2. CARI KOST: !cari <keyword>
            if (command === 'cari') {
                const query = args.join(' ').trim();
                if (!query) {
                    const guide = '❌ Masukkan kata kunci pencarian.\nContoh: *!cari mawar* atau *!cari 0812*';
                    return sendReply(guide);
                }

                const results = await database.searchKost(query, from);
                if (!results.length) {
                    const emptyMsg = `🔎 Tidak ditemukan kost dengan kata kunci "${query}".`;
                    return sendReply(emptyMsg);
                }

                let text = `🔎 *HASIL PENCARIAN*\nKata kunci: ${query}\n\nDitemukan: ${results.length}\n\n`;
                results.forEach((k, idx) => {
                    const statusBadge = (k.status || 'pending').toLowerCase() === 'sent' ? '✅ SENT' : '⏳ PENDING';
                    const contacts = getContactDisplayLines(k, database, '   ');
                    text += `${idx + 1}. *${k.name}*\n   🆔 ${k.id}\n${contacts}\n   📌 ${statusBadge}\n\n`;
                });

                text += `────────────────────\n\n💡 Gunakan:\n!kost lengkap <ID>\n!sent <ID>\n!delkost <ID>`;

                return sendReply(text.trim());
            }

            // 3. KOST LENGKAP: !kost lengkap <ID>
            if (args[0]?.toLowerCase() === 'lengkap') {
                const targetId = args[1]?.trim();
                if (!targetId) {
                    const formatGuide =
`❌ Format: !kost lengkap <ID>

Contoh:
!kost lengkap KST-000001

💡 Gunakan !cari <nama> untuk melihat ID kost.`;
                    return sendReply(formatGuide);
                }

                const kost = await database.getKostById(targetId, from);
                if (!kost) {
                    return sendReply(`❌ Kost dengan ID ${targetId.toUpperCase()} tidak ditemukan.`);
                }

                const registeredGroup = database.getGroupById(from);
                const groupName = registeredGroup?.name || 'Bukittinggi Kos';
                const statusBadge = (kost.status || 'pending').toLowerCase() === 'sent' ? '✅ SENT' : '⏳ PENDING';
                const igUrl = kost.instagram ? database.formatInstagramUrl(kost.instagram) : '-';
                const waUrl = kost.whatsapp ? database.formatWhatsappUrl(kost.whatsapp) : '-';
                const ttUrl = kost.tiktok ? database.formatTiktokUrl(kost.tiktok) : '-';
                const sentByDisplay = kost.sentBy ? kost.sentBy : '-';
                const sentAtDisplay = kost.sentAt ? database.formatIndonesianDateTime(kost.sentAt) : '-';

                const detailText =
`🏠 *DETAIL KOST*

🆔 ID: ${kost.id}
🏠 Nama: ${kost.name}
📸 Instagram: ${igUrl}
💬 WhatsApp: ${waUrl}
🎵 TikTok: ${ttUrl}
📌 Status: ${statusBadge}
👤 Sent By: ${sentByDisplay}
🕒 Sent At: ${sentAtDisplay}
👥 Group: ${groupName}`;

                return sendReply(detailText);
            }

            // 4. DAFTAR RINGKAS / OUTPUT SEDERHANA UNTUK DM: !kost dm / !kost ringkas / !kost simple
            const isDmMode = command === 'listkost' || command === 'kostdm' ||
                             ['dm', 'ringkas', 'simple', 'link'].includes(args[0]?.toLowerCase());

            if (isDmMode) {
                let filterStatus = 'pending';
                if (['dm', 'ringkas', 'simple', 'link'].includes(args[0]?.toLowerCase())) {
                    if (args[1]?.toLowerCase() === 'all' || args[1]?.toLowerCase() === 'sent') {
                        filterStatus = args[1].toLowerCase();
                    }
                } else if (args[0]?.toLowerCase() === 'all' || args[0]?.toLowerCase() === 'sent') {
                    filterStatus = args[0].toLowerCase();
                }

                const list = await database.getKostByStatus(filterStatus, from);
                if (!list.length) {
                    const emptyMsg = `📋 Tidak ada data kost dengan status *${filterStatus.toUpperCase()}*.`;
                    return sendReply(emptyMsg);
                }

                let text = `📋 *DAFTAR KOST ${filterStatus.toUpperCase()} (LINK DM)*\nTotal: ${list.length}\n\n`;
                list.forEach((k, idx) => {
                    const contacts = getContactDisplayLines(k, database, '   ');
                    text += `${idx + 1}. *${k.name}* (${k.id})\n${contacts}\n\n`;
                });

                text += `────────────────────\n💡 Setelah di-DM, tandai sent:\n!sent <ID>`;
                return sendReply(text.trim());
            }

            // 5. LIST KOST: !kost [all|pending|sent]
            const sub = args[0]?.toLowerCase() || 'pending';
            let filter = 'pending';
            if (sub === 'all') filter = 'all';
            else if (sub === 'sent') filter = 'sent';
            else if (sub === 'pending') filter = 'pending';

            const list = await database.getKostByStatus(filter, from);

            if (!list.length) {
                const emptyMsg = `📋 Tidak ada data kost dengan status *${filter.toUpperCase()}*.`;
                return sendReply(emptyMsg);
            }

            const registeredGroup = database.getGroupById(from);
            const groupAlias = registeredGroup?.name ? registeredGroup.name.toUpperCase() : 'BUKITTINGGI KOS';
            let text = `🏠 *DAFTAR KOST ${groupAlias}* (${filter.toUpperCase()})\nTotal: ${list.length}\n\n`;

            list.forEach((k, idx) => {
                const statusBadge = (k.status || 'pending').toLowerCase() === 'sent' ? '✅ SENT' : '⏳ PENDING';
                const contacts = getContactDisplayLines(k, database, '   ');
                text += `${idx + 1}. *${k.name}*\n   🆔 ${k.id}\n${contacts}\n   📌 Status: ${statusBadge}\n\n`;
            });

            text +=
`────────────────────

💡 *PERINTAH TERSEDIA*

> !kost dm
> !kost all
> !kost pending
> !kost sent
> !kost lengkap <ID>
> !addkost <Nama> > <kontak (ig/wa/tt)>
> !cari <kata kunci>
> !sent <ID>
> !delkost <ID>`;

            return sendReply(text.trim());
        } catch (err) {
            console.error('[commands/bukittinggi-kos/kost] Error:', err);
            const userMsg = err?.userFriendly ? err.message : '❌ Data kost sedang tidak dapat diakses. Silakan coba lagi.';
            return sendReply(userMsg);
        }
    }
};
