module.exports = {
    name: 'help',
    aliases: ['bantuan'],
    category: 'general',
    description: 'Menampilkan panduan lengkap seluruh perintah bot.',
    usage: '!help atau !help <command>',

    async execute({ sock, msg, from, senderNumber, args, reply, services, utils, isGroup: isGroupChat }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        const isOwner = database.isOwner(senderNumber);

        let showKosAdmin = false;
        let showKosPublic = false;

        if (inGroup) {
            const cleanFrom = jidUtils.normalizeJid(from);
            const groupObj = database.getGroupById(cleanFrom);
            const effectiveGroupId = database.resolveDataGroupId(cleanFrom);
            const effectiveGroupObj = effectiveGroupId ? database.getGroupById(effectiveGroupId) : groupObj;

            const isKosType = Boolean(
                (groupObj && (groupObj.type === 'kos' || !groupObj.type)) ||
                (effectiveGroupObj && (effectiveGroupObj.type === 'kos' || !effectiveGroupObj.type))
            );

            if (isKosType) {
                const role = groupObj?.role || 'admin';
                if (role === 'admin' || isOwner) {
                    showKosAdmin = true;
                    showKosPublic = true;
                } else if (role === 'public') {
                    showKosPublic = true;
                }
            }
        } else {
            // Private chat (DM ke bot)
            if (isOwner) {
                showKosAdmin = true;
                showKosPublic = true;
            }
        }

        const kosAdminCmds = new Set([
            'kost', 'kos', 'kosts', 'kostdm', 'listkost',
            'addkost',
            'dm', 'dmpromosi', 'dmkost',
            'sent', 'kirim', 'terkirim', 'marksent',
            'delkost', 'hapuskost',
            'listusul', 'usulan', 'daftar-usul', 'usulan-kost',
            'acc', 'terimausul', 'setujuiusul', 'acc-usul',
            'tolak', 'tolakusul', 'rejectusul', 'tolak-usul'
        ]);

        const kosPublicCmds = new Set([
            'cari',
            'usulkost', 'usul', 'suggest', 'daftarkost'
        ]);

        const helps = {
            // General
            ping: '🏓 `!ping`\nCek apakah bot aktif dan responsif.',
            menu: '📋 `!menu`\nMenampilkan menu fitur bot untuk seluruh anggota.',
            'admin-menu': '👑 `!admin-menu`\nMenampilkan menu perintah khusus admin grup.',
            adminmenu: '👑 `!admin-menu`\nMenampilkan menu perintah khusus admin grup.',
            stats: '📊 `!stats`\nMenampilkan statistik bot (pesan, stiker, command) serta monitor server STB (CPU, RAM, Uptime).',
            status: '📊 `!stats`\nMenampilkan statistik bot dan server STB.',
            botstats: '📊 `!stats`\nMenampilkan statistik bot dan server STB.',

            // Sticker
            stiker: '🎨 `!stiker`\nKirim gambar dengan caption `!stiker` atau reply gambar untuk dijadikan stiker WhatsApp.',
            sticker: '🎨 `!stiker`\nKirim gambar dengan caption `!stiker` atau reply gambar.',
            s: '🎨 `!stiker`\nKirim gambar dengan caption `!s` atau reply gambar.',
            smeme: '🎨 `!smeme <teks atas|teks bawah>`\nKirim/reply gambar dengan caption `!smeme teks atas|teks bawah` untuk membuat stiker meme.',
            brat: '🎨 `!brat <teks>`\nMembuat stiker teks bergaya Brat aesthetic (hijau lime / putih).\nContoh: `!brat halo dunia`',

            // Group
            groupinfo: '👥 `!groupinfo`\nMenampilkan informasi lengkap grup (nama, deskripsi, pembuat, jumlah member).',
            listadmin: '👑 `!listadmin`\nMenampilkan daftar nama dan nomor seluruh admin grup.',
            tagall: '📢 `!tagall`\nMention seluruh anggota grup secara terbuka.',
            hidetag: '📢 `!hidetag <teks>`\nMention seluruh anggota secara tersembunyi (hanya teks yang terlihat).',
            add: '➕ `!add 628xxxxxxxxxx`\nMenambahkan nomor telepon ke dalam grup (Khusus Admin).',
            kick: '🔨 `!kick @user`\nMengeluarkan anggota dari grup (Khusus Admin). Bisa juga reply pesan target lalu ketik `!kick`.',
            promote: '👑 `!promote @user`\nMenaikkan anggota menjadi admin grup (Khusus Admin).',
            demote: '⬇️ `!demote @user`\nMenurunkan admin menjadi anggota biasa (Khusus Admin).',
            welcome: '👋 `!welcome on` atau `!welcome off`\nMengaktifkan atau mematikan fitur pesan sambutan otomatis untuk anggota baru.',
            setwelcome: '✏️ `!setwelcome <teks>`\nMengatur teks sambutan grup. Gunakan variabel `@user` dan `@group`.\nContoh: `!setwelcome Selamat datang @user di @group!`',

            // Owner
            owner: '👑 `!owner list` | `!owner add <nomor>` | `!owner delete <nomor>`\nManajemen daftar owner bot (Khusus Super Owner).',
            owners: '👑 `!owner list`\nMenampilkan daftar owner bot.',

            // Autoreply
            autoreply: '🤖 `!autoreply list` | `!autoreply-add` | `!autoreply-edit` | `!autoreply-del`\nPengaturan pesan balasan otomatis bot (Khusus Owner).',
            'autoreply-add': '🤖 `!autoreply-add <trigger>|<respons>`\nMenambahkan respons otomatis baru (Khusus Owner).\nContoh multi-trigger:\n`!autoreply-add {!rekening/!rek/!norek}|Transfer BCA: 8456243687`\n💡 Mendukung enter langsung atau `\\n`.',
            'autoreply-list': '📋 `!autoreply-list`\nMenampilkan seluruh pesan balasan otomatis yang terdaftar di database.',
            'autoreply-edit': '✏️ `!autoreply-edit <trigger>|<respons baru>`\nMengubah balasan autoreply yang sudah terdaftar (Khusus Owner).',
            'autoreply-del': '🗑️ `!autoreply-del <trigger>`\nMenghapus autoreply dari database (Khusus Owner).',

            // Bukittinggi Kos
            initgroup: '👥 `!initgroup [admin|public] <nama> [--link <grup_induk>]`\nMendaftarkan grup ke database. Mendukung mode admin, publik dengan link data, atau `!initgroup list`.\nContoh:\n• Admin: `!initgroup admin Bukittinggi Kos`\n• Publik: `!initgroup public Komunitas Kos --link Bukittinggi Kos`\n• Daftar grup: `!initgroup list`',
            kost: '🏠 *MANAJEMEN KOST: !kost*\n\n`!kost` atau `!kost pending` — Daftar kos yang belum di-DM\n`!kost sent` — Daftar kos yang sudah di-DM\n`!kost all` — Semua daftar kos\n`!kost dm` — Format ringkas & link langsung untuk DM IG/WA/TT\n`!kost dm <ID>` / `!dm <ID>` — Link prefilled & balon template DM siap salin\n`!kost lengkap <ID>` — Detail lengkap satu kos',
            dm: '💬 `!dm <ID>`\nMenyiapkan link WhatsApp prefilled & balon teks DM promosi siap salin untuk pemilik kos (Khusus Admin).\nContoh: `!dm 1` atau `!dm KST-000001`',
            dmpromosi: '💬 `!dm <ID>`\nMenyiapkan link WhatsApp prefilled & balon teks DM promosi siap salin (alias dari !dm).',
            dmkost: '💬 `!dm <ID>`\nMenyiapkan link WhatsApp prefilled & balon teks DM promosi siap salin (alias dari !dm).',
            addkost: '🏠 `!addkost <Nama Kost> > <kontak>`\nMenambahkan data kos ke database (khusus Admin).\nContoh:\n• `!addkost Kost Melati > kostmelati_bkt`\n• `!addkost Kost Mawar > wa: 08123456789`\n• `!addkost Kost Indah > ig: indah | wa: 08123456789 | tt: indahkos`',
            cari: '🔍 `!cari <keyword>`\nMencari data kos (aktif di grup Admin & Publik).\nContoh: `!cari birugo` atau `!cari 0812`',
            usulkost: '📥 `!usulkost <Nama> > <Kontak>`\nMengusulkan data kos baru dari grup publik untuk direview oleh admin.\nContoh:\n`!usulkost Kost Melati > wa: 08123456789`\n`!usulkost Kost Flamboyan > ig: flamboyankos`',
            listusul: '📥 `!listusul [pending|all|approved|rejected]`\nMenampilkan daftar usulan kos warga yang masuk (Khusus Admin).',
            acc: '✅ `!acc <ID Usulan>`\nMenyetujui usulan kos dari warga dan otomatis memasukkannya ke database (Khusus Admin).\nContoh: `!acc 1`',
            tolak: '❌ `!tolak <ID Usulan>`\nMenolak usulan kos dari warga (Khusus Admin).\nContoh: `!tolak 1`',
            sent: '✅ `!sent <ID>` atau `!sent 2 sampai 20`\nMenandai status kos menjadi SENT (mendukung satu ID, daftar koma, atau range).\nContoh:\n• `!sent KST-000001` atau `!sent 1`\n• `!sent KST-000002 sampai KST-000020`\n• `!sent 2 - 20`\n• `!sent 1, 3, 5`',
            kirim: '✅ `!sent <ID>`\nMenandai status kos menjadi SENT (alias dari !sent).',
            delkost: '🗑️ `!delkost <ID>`\nMenghapus data kos dari database (Khusus Admin).\nContoh: `!delkost KST-000001`',
            hapuskost: '🗑️ `!delkost <ID>`\nMenghapus data kos dari database (alias dari !delkost).'
        };

        if (!args || !args[0]) {
            const sections = [];

            if (showKosAdmin) {
                sections.push(
`🏠 *BUKITTINGGI KOS (ADMIN)*
│ \`!kost\` — Daftar kos (pending/sent/all)
│ \`!kost dm\` — Format ringkas link untuk DM
│ \`!dm <ID>\` — Link WA & balon template DM siap salin
│ \`!kost lengkap <ID>\` — Detail lengkap data kos
│ \`!addkost <Nama> > <kontak>\` — Tambah data kos (IG/WA/TT)
│ \`!sent <ID/range>\` — Tandai kos sudah di-DM (dukung range)
│ \`!delkost <ID>\` — Hapus data kos
│ \`!listusul\` — Daftar usulan kos dari warga
│ \`!acc <ID>\` — Setujui usulan kos warga
│ \`!tolak <ID>\` — Tolak usulan kos warga`
                );
            }

            if (showKosPublic) {
                sections.push(
`🔍 *PUBLIK & WARGA*
│ \`!cari <keyword>\` — Cari kos berdasarkan nama/daerah
│ \`!usulkost <Nama> > <kontak>\` — Usulkan info kos baru`
                );
            }

            sections.push(
`🎨 *STICKER & MEDIA*
│ \`!stiker\` — Ubah gambar jadi stiker (caption/reply)
│ \`!smeme <atas|bawah>\` — Buat stiker meme teks
│ \`!brat <teks>\` — Buat stiker Brat aesthetic`
            );

            if (isOwner) {
                sections.push(
`🤖 *AUTOREPLY (OWNER)*
│ \`!autoreply-list\` — Lihat semua autoreply aktif
│ \`!autoreply-add <trig>|<resp>\` — Tambah autoreply (multi-trigger)
│ \`!autoreply-edit <trig>|<resp>\` — Ubah isi respons
│ \`!autoreply-del <trig>\` — Hapus autoreply`
                );
            }

            sections.push(
`👥 *GRUP & MEMBER*
│ \`!initgroup <nama>\` — Inisialisasi grup di bot
│ \`!groupinfo\` — Cek info & statistik grup
│ \`!listadmin\` — Daftar admin grup
│ \`!tagall\` — Mention seluruh member grup
│ \`!hidetag <teks>\` — Mention tersembunyi
│ \`!welcome on/off\` — Toggle sambutan member baru
│ \`!setwelcome <teks>\` — Atur teks sambutan`
            );

            sections.push(
`👑 *ADMIN GRUP*
│ \`!add 628xxx\` — Tambah anggota ke grup
│ \`!kick @user\` — Keluarkan anggota
│ \`!promote @user\` — Angkat jadi admin
│ \`!demote @user\` — Turunkan dari admin`
            );

            sections.push(
`⚙️ *SISTEM & OWNER*
│ \`!ping\` — Cek status & latency bot
│ \`!stats\` — Pantau statistik bot & server STB
│ \`!menu\` — Tampilan menu ringkas
│ \`!owner list\` — Cek daftar owner bot
│ \`!owner add/del\` — Tambah/hapus owner`
            );

            const exampleTip = showKosAdmin ? '`!help addkost` atau `!help stiker`' : '`!help stiker` atau `!help groupinfo`';
            const fullGuide =
`╭━━━〔 📖 *PANDUAN LENGKAP BOT* 〕━━━╮

${sections.join('\n\n')}

╰━━━━━━━━━━━━━━━━━━━━━━━━╯

💡 *TIPS:*
Ketik \`!help <nama_command>\` untuk panduan lebih detail.
Contoh: ${exampleTip}`;

            if (typeof reply === 'function') {
                await reply(fullGuide);
            } else {
                await sock.sendMessage(from, { text: fullGuide }, { quoted: msg });
            }
            return;
        }

        const targetCmd = args[0].toLowerCase().replace(/^!/, '');

        // Validasi pembatasan perintah kos untuk grup non-kos
        if (kosAdminCmds.has(targetCmd) && !showKosAdmin) {
            const notFoundText = `❌ Perintah \`!${targetCmd}\` hanya tersedia di grup internal admin Bukittinggi Kos.`;
            if (typeof reply === 'function') return await reply(notFoundText);
            return await sock.sendMessage(from, { text: notFoundText }, { quoted: msg });
        }

        if (kosPublicCmds.has(targetCmd) && !showKosPublic) {
            const notFoundText = `❌ Perintah \`!${targetCmd}\` hanya tersedia di grup Bukittinggi Kos.`;
            if (typeof reply === 'function') return await reply(notFoundText);
            return await sock.sendMessage(from, { text: notFoundText }, { quoted: msg });
        }

        const helpText = helps[targetCmd] || `❌ Help untuk \`!${targetCmd}\` tidak ditemukan.\n\nKetik \`!help\` untuk melihat seluruh daftar perintah.`;

        if (typeof reply === 'function') {
            await reply(helpText);
        } else {
            await sock.sendMessage(from, { text: helpText }, { quoted: msg });
        }
    }
};