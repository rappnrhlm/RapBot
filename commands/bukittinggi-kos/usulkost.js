module.exports = {
    name: 'usulkost',
    aliases: ['submitkost', 'usul'],
    category: 'bukittinggi-kos',
    description: 'Mengusulkan data kos baru untuk direview oleh admin.',
    usage: '!usulkost <Nama Kos> > <kontak (ig/wa/tt)>',

    async execute({ sock, msg, from, senderNumber, args, isGroup: isGroupChat, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');
        const cooldownUtils = require('../../utils/cooldown');

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
            const cdKey = `usul:${from}:${senderNumber || 'anon'}`;
            const cd = cooldownUtils.checkCooldown(cdKey, 30); // 30 detik cooldown untuk usul kos
            if (!cd.allowed) {
                return sendReply(`⏳ Mohon tunggu *${cd.remainingSeconds} detik* sebelum mengirim usulan lagi.`);
            }
        }

        const raw = args.join(' ').trim();
        const parts = raw.split('>');
        const name = parts[0]?.trim();
        const contactsRaw = parts.slice(1).join('>').trim();

        if (!name || !contactsRaw) {
            const guide =
`❌ *Format Usulan Kos Salah*

Format:
\`!usulkost <Nama Kos> > <Kontak (IG / WA / TikTok)>\`

Contoh:
• \`!usulkost Kost Flamboyan > wa: 08123456789\`
• \`!usulkost Kost Anggrek Putri > ig: anggrekkos | wa: 082198765432\`
• \`!usulkost Rumah Sewa Ibu Ani > 085211223344\``;
            return sendReply(guide);
        }

        const result = await database.addKostSubmission({
            groupId: from,
            name,
            contactsRaw,
            submittedBy: senderNumber || 'unknown'
        });

        if (!result.success) {
            return sendReply(`⚠️ Gagal mengirim usulan: ${result.message}`);
        }

        const sub = result.submission;
        const confirmText =
`✅ *Usulan Kos Berhasil Terkirim!*

🏠 Nama: *${sub.name}*
📞 Kontak: ${sub.contactsRaw}
🆔 No Usulan: *#${sub.id}*

Terima kasih atas kontribusinya! Usulan ini akan diverifikasi oleh tim admin *@bukittinggikos* sebelum resmi dipublikasikan. 🙏`;

        // Opsional: Notifikasi otomatis ke grup admin jika grup ini terhubung ke parent
        if (registeredGroup?.parentGroupId && sock) {
            const adminNotify =
`📥 *USULAN KOS BARU MASUK DARI WARGA!*

🆔 No Usulan: *#${sub.id}*
🏠 Nama Kos: *${sub.name}*
📞 Kontak: ${sub.contactsRaw}
👥 Dari Grup: *${registeredGroup.name}*
👤 Pengirim: wa.me/${senderNumber || 'unknown'}

Ketik \`!acc ${sub.id}\` untuk menyetujui & masukkan ke database.
Ketik \`!tolak ${sub.id}\` untuk menolak.`;

            sock.sendMessage(registeredGroup.parentGroupId, { text: adminNotify }).catch(() => {});
        }

        return sendReply(confirmText);
    }
};
