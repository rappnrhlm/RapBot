module.exports = {
    name: 'help',
    aliases: ['bantuan'],
    category: 'general',
    description: 'Menampilkan panduan lengkap seluruh perintah bot.',
    usage: '!help atau !help <command>',

    async execute({ sock, msg, from, args, reply }) {
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
            initgroup: '👥 `!initgroup <nama grup>`\nMendaftarkan grup WhatsApp ke sistem database secara persistent agar fitur kos aktif.\nContoh: `!initgroup Bukittinggi Kos`',
            kost: '🏠 *MANAJEMEN KOST: !kost*\n\n`!kost` atau `!kost pending` — Daftar kos yang belum di-DM\n`!kost sent` — Daftar kos yang sudah di-DM\n`!kost all` — Semua daftar kos\n`!kost dm` — Format ringkas & link langsung untuk DM IG/WA/TT\n`!kost lengkap <ID>` — Detail lengkap satu kos',
            addkost: '🏠 `!addkost <Nama Kost> > <kontak>`\nMenambahkan data kos ke database (mendukung Instagram, WhatsApp, TikTok).\nContoh:\n• `!addkost Kost Melati > kostmelati_bkt`\n• `!addkost Kost Mawar > wa: 08123456789`\n• `!addkost Kost Indah > ig: indah | wa: 08123456789 | tt: indahkos`',
            cari: '🔍 `!cari <keyword>`\nMencari data kos berdasarkan nama, akun IG, nomor WA, username TikTok, atau ID.\nContoh: `!cari birugo` atau `!cari 0812`',
            sent: '✅ `!sent <ID>`\nMenandai status kos menjadi SENT setelah selesai di-DM.\nContoh: `!sent KST-000001`',
            kirim: '✅ `!sent <ID>`\nMenandai status kos menjadi SENT (alias dari !sent).',
            delkost: '🗑️ `!delkost <ID>`\nMenghapus data kos dari database.\nContoh: `!delkost KST-000001`',
            hapuskost: '🗑️ `!delkost <ID>`\nMenghapus data kos dari database (alias dari !delkost).'
        };

        if (!args || !args[0]) {
            const fullGuide =
`╭━━━〔 📖 *PANDUAN LENGKAP BOT* 〕━━━╮

🏠 *BUKITTINGGI KOS*
│ \`!kost\` — Daftar kos (pending/sent/all)
│ \`!kost dm\` — Format ringkas link untuk DM
│ \`!kost lengkap <ID>\` — Detail lengkap data kos
│ \`!addkost <Nama> > <kontak>\` — Tambah data kos (IG/WA/TT)
│ \`!cari <keyword>\` — Cari kos (nama/kontak/ID)
│ \`!sent <ID>\` — Tandai kos sudah di-DM
│ \`!delkost <ID>\` — Hapus data kos

🎨 *STICKER & MEDIA*
│ \`!stiker\` — Ubah gambar jadi stiker (caption/reply)
│ \`!smeme <atas|bawah>\` — Buat stiker meme teks
│ \`!brat <teks>\` — Buat stiker Brat aesthetic

🤖 *AUTOREPLY (OWNER)*
│ \`!autoreply-list\` — Lihat semua autoreply aktif
│ \`!autoreply-add <trig>|<resp>\` — Tambah autoreply (multi-trigger)
│ \`!autoreply-edit <trig>|<resp>\` — Ubah isi respons
│ \`!autoreply-del <trig>\` — Hapus autoreply

👥 *GRUP & MEMBER*
│ \`!initgroup <nama>\` — Inisialisasi grup di bot
│ \`!groupinfo\` — Cek info & statistik grup
│ \`!listadmin\` — Daftar admin grup
│ \`!tagall\` — Mention seluruh member grup
│ \`!hidetag <teks>\` — Mention tersembunyi
│ \`!welcome on/off\` — Toggle sambutan member baru
│ \`!setwelcome <teks>\` — Atur teks sambutan

👑 *ADMIN GRUP*
│ \`!add 628xxx\` — Tambah anggota ke grup
│ \`!kick @user\` — Keluarkan anggota
│ \`!promote @user\` — Angkat jadi admin
│ \`!demote @user\` — Turunkan dari admin

⚙️ *SISTEM & OWNER*
│ \`!ping\` — Cek status & latency bot
│ \`!stats\` — Pantau statistik bot & server STB
│ \`!menu\` — Tampilan menu ringkas
│ \`!owner list\` — Cek daftar owner bot
│ \`!owner add/del\` — Tambah/hapus owner

╰━━━━━━━━━━━━━━━━━━━━━━━━╯

💡 *TIPS:*
Ketik \`!help <nama_command>\` untuk panduan lebih detail.
Contoh: \`!help addkost\` atau \`!help autoreply-add\``;

            if (typeof reply === 'function') {
                await reply(fullGuide);
            } else {
                await sock.sendMessage(from, { text: fullGuide }, { quoted: msg });
            }
            return;
        }

        const targetCmd = args[0].toLowerCase().replace(/^!/, '');
        const helpText = helps[targetCmd] || `❌ Help untuk \`!${targetCmd}\` tidak ditemukan.\n\nKetik \`!help\` untuk melihat seluruh daftar perintah.`;

        if (typeof reply === 'function') {
            await reply(helpText);
        } else {
            await sock.sendMessage(from, { text: helpText }, { quoted: msg });
        }
    }
};