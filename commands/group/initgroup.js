module.exports = {
    name: 'initgroup',
    aliases: ['groupinit'],
    category: 'group',
    description: 'Menginisialisasi registrasi grup (Admin vs Publik) secara persistent.',
    usage: '!initgroup [admin|public] <nama> [--link <grup_induk>]',

    async execute({ sock, msg, from, senderNumber, args, reply, utils, services }) {
        const jidUtils = utils?.jid || require('../../utils/jid');
        const database = services?.database || require('../../services/database');

        const sendReply = async (text) => {
            if (typeof reply === 'function') return await reply(text);
            return await sock.sendMessage(from, { text }, { quoted: msg });
        };

        // 1. Subcommand: list (melihat daftar grup terdaftar)
        if (args[0]?.toLowerCase() === 'list') {
            const groups = database.getGroups();
            if (!groups.length) {
                return sendReply('📋 Belum ada grup yang terdaftar di database.');
            }
            let listText = '👥 *DAFTAR GRUP TERDAFTAR*\n\n';
            groups.forEach((g, idx) => {
                const roleBadge = (g.role || 'admin').toUpperCase();
                const typeBadge = (g.type || 'kos').toUpperCase();
                let parentInfo = '';
                if (g.parentGroupId) {
                    const parent = database.getGroupById(g.parentGroupId);
                    parentInfo = `\n   🔗 Data Link: ${parent ? parent.name : g.parentGroupId}`;
                }
                listText += `${idx + 1}. *${g.name}*\n   🆔 \`${g.id}\`\n   🎭 Peran: *${roleBadge}* | 📂 Tipe: *${typeBadge}*${parentInfo}\n\n`;
            });
            return sendReply(listText.trim());
        }

        // 2. Validasi harus di dalam grup jika melakukan inisialisasi
        const isGroupChat = jidUtils.isGroup(from);
        if (!isGroupChat) {
            return sendReply('❌ Command ini hanya bisa digunakan di dalam grup.');
        }

        // 3. Parse options (role, type, link, name)
        let role = 'admin';
        let type = 'kos';
        let parentGroupId = null;
        let remainingArgs = [...args];

        if (['admin', 'public'].includes(remainingArgs[0]?.toLowerCase())) {
            role = remainingArgs.shift().toLowerCase();
        }

        // Parse --link <target>
        const linkIndex = remainingArgs.findIndex(a => a.toLowerCase() === '--link');
        if (linkIndex !== -1) {
            const linkTarget = remainingArgs.slice(linkIndex + 1).join(' ').trim();
            remainingArgs = remainingArgs.slice(0, linkIndex);
            if (linkTarget) {
                const allGroups = database.getGroups();
                const found = allGroups.find(g =>
                    g.id === linkTarget ||
                    g.id.startsWith(linkTarget) ||
                    g.name.toLowerCase() === linkTarget.toLowerCase() ||
                    g.name.toLowerCase().includes(linkTarget.toLowerCase())
                );
                if (found) {
                    parentGroupId = found.id;
                } else {
                    return sendReply(`❌ Grup induk untuk link "${linkTarget}" tidak ditemukan.\n💡 Ketik \`!initgroup list\` untuk melihat daftar grup yang tersedia.`);
                }
            }
        }

        // Parse --type <tipe>
        const typeIndex = remainingArgs.findIndex(a => a.toLowerCase() === '--type');
        if (typeIndex !== -1) {
            const typeTarget = remainingArgs[typeIndex + 1]?.toLowerCase();
            remainingArgs.splice(typeIndex, 2);
            if (typeTarget) {
                type = typeTarget;
            }
        }

        const aliasName = remainingArgs.join(' ').trim();
        if (!aliasName) {
            const formatMsg =
`❌ *Panduan Format !initgroup*

1. *Grup Admin (Akses Penuh)*:
   \`!initgroup <nama grup>\`
   atau
   \`!initgroup admin <nama grup>\`
   _Contoh:_ \`!initgroup admin Bukittinggi Kos\`

2. *Grup Publik (Terhubung ke Data Admin)*:
   \`!initgroup public <nama grup> --link <nama grup admin>\`
   _Contoh:_ \`!initgroup public Komunitas Kos --link Bukittinggi Kos\`

3. *Lihat Daftar Grup*:
   \`!initgroup list\``;
            return sendReply(formatMsg);
        }

        // 4. Ambil metadata grup WhatsApp jika tersedia
        let groupSubject = '';
        try {
            const metadata = await sock.groupMetadata(from);
            groupSubject = metadata?.subject || '';
        } catch (err) {
            console.warn('[commands/group/initgroup] Gagal mengambil metadata grup:', err.message);
        }

        // 5. Periksa apakah grup sudah terdaftar
        const existing = database.getGroupById(from);
        if (existing) {
            return sendReply(`ℹ️ Grup ini sudah diinisialisasi sebagai "${existing.name}" (Peran: ${(existing.role || 'admin').toUpperCase()}).`);
        }

        // 6. Simpan registrasi grup secara persistent
        const result = await database.addGroup({
            id: from,
            name: aliasName,
            groupName: groupSubject,
            type,
            role,
            parentGroupId,
            settings: {
                cooldownSeconds: role === 'public' ? 10 : 0,
                maxSearchResults: role === 'public' ? 5 : 50,
                autoHelper: role === 'public'
            },
            initializedBy: senderNumber || ''
        });

        if (result.success) {
            let succMsg = `✅ *Grup Berhasil Diinisialisasi!*\n\n` +
                          `📛 Nama: *${result.group.name}*\n` +
                          `🎭 Peran: *${result.group.role.toUpperCase()}*\n` +
                          `📂 Tipe: *${result.group.type.toUpperCase()}*`;

            if (result.group.parentGroupId) {
                const parent = database.getGroupById(result.group.parentGroupId);
                succMsg += `\n🔗 Terhubung ke: *${parent ? parent.name : result.group.parentGroupId}*`;
            }

            if (result.group.role === 'public') {
                succMsg += `\n\n💡 *Mode Publik Aktif:*\n` +
                           `- Perintah pencarian: \`!cari <kata kunci>\`\n` +
                           `- Usul info kos baru: \`!usulkost <nama> > <kontak>\`\n` +
                           `- Perintah admin (!addkost, !sent, !delkost) otomatis dibatasi.`;
            }

            return sendReply(succMsg);
        }

        return sendReply(`❌ Gagal menginisialisasi grup: ${result.message}`);
    }
};
