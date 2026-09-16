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
        let type = null;
        let parentGroupId = null;
        let remainingArgs = [...args];

        // Parse --role or --peran
        const roleFlagIdx = remainingArgs.findIndex(a => a.toLowerCase() === '--role' || a.toLowerCase() === '--peran');
        if (roleFlagIdx !== -1) {
            const roleVal = remainingArgs[roleFlagIdx + 1]?.toLowerCase();
            remainingArgs.splice(roleFlagIdx, 2);
            if (roleVal) {
                role = (roleVal === 'cabang' || roleVal === 'public') ? 'public' : 'admin';
            }
        }

        // Parse --type or --tipe or --kategori
        const typeFlagIdx = remainingArgs.findIndex(a => a.toLowerCase() === '--type' || a.toLowerCase() === '--tipe' || a.toLowerCase() === '--kategori');
        if (typeFlagIdx !== -1) {
            const typeVal = remainingArgs[typeFlagIdx + 1]?.toLowerCase();
            remainingArgs.splice(typeFlagIdx, 2);
            if (typeVal) {
                type = typeVal;
            }
        }

        // Parse --link or --parent or --induk <target>
        const linkFlagIdx = remainingArgs.findIndex(a => ['--link', '--parent', '--induk'].includes(a.toLowerCase()));
        if (linkFlagIdx !== -1) {
            const linkTarget = remainingArgs.slice(linkFlagIdx + 1).join(' ').trim();
            remainingArgs = remainingArgs.slice(0, linkFlagIdx);
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
                    role = 'public';
                } else {
                    return sendReply(`❌ Grup induk untuk link "${linkTarget}" tidak ditemukan.\n💡 Ketik \`!initgroup list\` untuk melihat daftar grup yang tersedia.`);
                }
            }
        }

        // Check first positional argument for role or type
        if (remainingArgs.length > 0) {
            const first = remainingArgs[0].toLowerCase();
            if (['admin', 'public', 'indukan', 'cabang'].includes(first)) {
                role = (first === 'cabang' || first === 'public') ? 'public' : 'admin';
                remainingArgs.shift();
            }
        }

        if (remainingArgs.length > 0) {
            const first = remainingArgs[0].toLowerCase();
            if (['marketplace', 'store', 'toko', 'kos', 'kost', 'umum', 'komunitas'].includes(first)) {
                if (!type) {
                    type = (first === 'kost') ? 'kos' : first;
                }
                remainingArgs.shift();
            }
        }

        const aliasName = remainingArgs.join(' ').trim();
        if (!aliasName) {
            const formatMsg =
`❌ *Panduan Format !initgroup*

1. *Grup Admin (Akses Penuh)*:
   \`!initgroup [admin] <nama grup> [--type <tipe>]\`
   _Contoh:_
   • \`!initgroup admin Bukittinggi Kos --type kos\`
   • \`!initgroup admin MiceyStore (admin) --type marketplace\`

2. *Grup Publik (Terhubung ke Indukan)*:
   \`!initgroup public <nama grup> --link <grup induk> [--type <tipe>]\`
   _Contoh:_
   • \`!initgroup public Komunitas Kos --link Bukittinggi Kos\`
   • \`!initgroup public MiceyStore (publik) --link Micey --type marketplace\`

3. *Pilihan Tipe*:
   \`kos\`, \`marketplace\`, \`store\`, \`komunitas\`, \`umum\`

4. *Lihat Daftar Grup*:
   \`!initgroup list\``;
            return sendReply(formatMsg);
        }

        // Smart type detection if not explicitly set
        if (!type) {
            const lowerCheck = `${aliasName} ${from}`.toLowerCase();
            if (/store|marketplace|toko|shop|jual|beli|micey/i.test(lowerCheck)) {
                type = 'marketplace';
            } else if (/kos|kost|kontrakan|losmen|homestay/i.test(lowerCheck)) {
                type = 'kos';
            } else {
                type = 'umum';
            }
        }
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
