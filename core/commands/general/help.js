// core/commands/general/help.js - Dynamic Help Command
module.exports = {
    name: 'help',
    aliases: ['bantuan'],
    category: 'general',
    description: 'Menampilkan panduan lengkap seluruh perintah bot.',
    usage: '!help atau !help <command>',

    async execute({ sock, msg, from, senderNumber, args, reply, services, utils, isGroup: isGroupChat, commands: registry }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        const isOwner = database.isOwner(senderNumber);

        const helps = {
            // General
            ping: '🏓 `!ping`\nCek apakah bot aktif dan responsif.',
            menu: '📋 `!menu`\nMenampilkan menu fitur bot untuk seluruh anggota.',
            'admin-menu': '👑 `!admin-menu`\nMenampilkan menu perintah khusus admin grup.',
            adminmenu: '👑 `!admin-menu`\nMenampilkan menu perintah khusus admin grup.',
            stats: '📊 `!stats`\nMenampilkan statistik bot (pesan, stiker, command) serta monitor server STB (CPU, RAM, Uptime).',
            status: '📊 `!stats`\nMenampilkan statistik bot dan server STB.',
            botstats: '📊 `!stats`\nMenampilkan statistik bot dan server STB.',
            culik: '🔓 `!culik`\nReply pesan foto/video sekali lihat (View Once) untuk mengambil dan melihatnya kembali.',
            rvo: '🔓 `!culik`\nReply pesan foto/video sekali lihat (View Once) untuk mengambilnya.',
            viewonce: '🔓 `!culik`\nReply pesan foto/video sekali lihat (View Once) untuk mengambilnya.',

            // Sticker
            stiker: '🎨 `!stiker`\nKirim gambar dengan caption `!stiker` atau reply gambar untuk dijadikan stiker WhatsApp.',
            sticker: '🎨 `!stiker`\nKirim gambar dengan caption `!stiker` atau reply gambar.',
            s: '🎨 `!stiker`\nKirim gambar dengan caption `!s` atau reply gambar.',
            smeme: '🎨 `!smeme <teks atas|teks bawah>`\nKirim/reply gambar atau stiker dengan caption `!smeme teks atas|teks bawah` untuk membuat stiker meme.',
            brat: '🎨 `!brat <teks>`\nMembuat stiker teks bergaya Brat aesthetic (hijau lime / putih).\nContoh: `!brat halo dunia`',
            toimg: '🖼️ `!toimg`\nReply stiker dengan `!toimg` untuk mengubahnya kembali menjadi foto/gambar.',
            toimage: '🖼️ `!toimg`\nReply stiker dengan `!toimage` untuk mengubahnya kembali menjadi foto/gambar.',
            togambar: '🖼️ `!toimg`\nReply stiker dengan `!togambar` untuk mengubahnya kembali menjadi foto/gambar.',

            // Group
            initgroup: '👥 `!initgroup [admin|public] <nama>`\nMendaftarkan grup ke sistem bot.',
            groupinfo: '👥 `!groupinfo`\nMenampilkan informasi lengkap grup (nama, deskripsi, pembuat, jumlah member).',
            listadmin: '👑 `!listadmin`\nMenampilkan daftar nama dan nomor seluruh admin grup.',
            tagall: '📢 `!tagall`\nMention seluruh anggota grup secara terbuka.',
            hidetag: '📢 `!hidetag <teks>`\nMention seluruh anggota secara tersembunyi (hanya teks yang terlihat).',
            add: '➕ `!add 628xxxxxxxxxx`\nMenambahkan nomor telepon ke dalam grup (Khusus Admin).',
            kick: '🔨 `!kick @user`\nMengeluarkan anggota dari grup (Khusus Admin). Bisa juga reply pesan target lalu ketik `!kick`.',
            promote: '👑 `!promote @user`\nMenaikkan anggota menjadi admin grup (Khusus Admin).',
            demote: '⬇️ `!demote @user`\nMenurunkan admin menjadi anggota biasa (Khusus Admin).',
            welcome: '👋 `!welcome [on|off|reset]`\nMengatur sambutan otomatis khusus grup ini.',
            setwelcome: '✏️ `!setwelcome <teks>`\nMengatur teks sambutan khusus grup ini.',
            clear: '🧹 `!clear [jumlah]` atau `!del (reply chat)`\nMenghapus pesan bot untuk membersihkan chat.',
            del: '🗑️ `!del (reply chat)`\nMenghapus pesan yang di-reply untuk semua orang di grup.',

            // Owner
            owner: '👑 `!owner list` | `!owner add <nomor>` | `!owner delete <nomor>`\nManajemen daftar owner bot (Khusus Super Owner).',
            owners: '👑 `!owner list`\nMenampilkan daftar owner bot.',
            tariksiaran: '📢 `!tariksiaran` / `!undobc`\nMenarik / menghapus pesan siaran terakhir serentak dari semua grup tujuan (Khusus Owner).',
            undobc: '📢 `!undobc`\nMenarik / menghapus pesan siaran terakhir serentak dari semua grup tujuan (Khusus Owner).',

            // Autoreply
            autoreply: '🤖 `!autoreply list` | `!autoreply-add` | `!autoreply-edit` | `!autoreply-del`\nPengaturan pesan balasan otomatis bot (Khusus Owner).',
            'autoreply-add': '🤖 `!autoreply-add <trigger>|<respons>`\nMenambahkan respons otomatis baru (Khusus Owner).',
            'autoreply-list': '📋 `!autoreply-list`\nMenampilkan seluruh pesan balasan otomatis yang terdaftar di database.',
            'autoreply-edit': '✏️ `!autoreply-edit <trigger>|<respons baru>`\nMengubah balasan autoreply yang sudah terdaftar (Khusus Owner).',
            'autoreply-del': '🗑️ `!autoreply-del <trigger>`\nMenghapus autoreply dari database (Khusus Owner).'
        };

        if (!args || !args[0]) {
            const sections = [];

            // 1. Dynamic Extension Commands Section
            if (registry) {
                const extensionsMap = new Map();
                for (const [key, cmd] of registry.entries()) {
                    if (cmd.isExtension && cmd.extensionInfo && cmd.name === key) {
                        const extId = cmd.extensionInfo.id || 'extension';
                        if (!extensionsMap.has(extId)) {
                            extensionsMap.set(extId, {
                                name: cmd.extensionInfo.name || extId,
                                commands: []
                            });
                        }
                        extensionsMap.get(extId).commands.push(cmd);
                    }
                }

                for (const [extId, extData] of extensionsMap.entries()) {
                    const extLines = [`🔌 *${extData.name.toUpperCase()}*`];
                    for (const cmd of extData.commands) {
                        extLines.push(`│ \`!${cmd.name}\` — ${cmd.description || 'Extension command'}`);
                    }
                    sections.push(extLines.join('\n'));
                }
            }

            // 2. Core Sticker & Media
            sections.push(
`🎨 *STICKER & MEDIA*
│ \`!stiker\` — Ubah gambar jadi stiker (caption/reply)
│ \`!toimg\` — Ubah stiker kembali jadi foto/gambar (reply)
│ \`!culik\` — Ambil foto/video sekali lihat (reply view once)
│ \`!smeme <atas|bawah>\` — Buat stiker meme teks
│ \`!brat <teks>\` — Buat stiker Brat aesthetic`
            );

            // 3. Core Group
            sections.push(
`👥 *GRUP & MEMBER*
│ \`!initgroup <nama>\` — Inisialisasi grup di bot
│ \`!groupinfo\` — Cek info & statistik grup
│ \`!listadmin\` — Daftar admin grup
│ \`!tagall\` — Mention seluruh member grup
│ \`!hidetag <teks>\` — Mention tersembunyi
│ \`!clear [jumlah]\` — Bersihkan chat / riwayat pesan bot
│ \`!del\` — Hapus pesan yang di-reply untuk semua
│ \`!welcome on/off\` — Toggle sambutan member baru
│ \`!setwelcome <teks>\` — Atur teks sambutan`
            );

            // 4. Core Admin
            sections.push(
`👑 *ADMIN GRUP*
│ \`!add 628xxx\` — Tambah anggota ke grup
│ \`!kick @user\` — Keluarkan anggota
│ \`!promote @user\` — Angkat jadi admin
│ \`!demote @user\` — Turunkan dari admin`
            );

            // 5. Core Owner (if owner)
            if (isOwner) {
                sections.push(
`🤖 *AUTOREPLY (OWNER)*
│ \`!autoreply-list\` — Lihat semua autoreply aktif
│ \`!autoreply-add <trig>|<resp>\` — Tambah autoreply (multi-trigger)
│ \`!autoreply-edit <trig>|<resp>\` — Ubah isi respons
│ \`!autoreply-del <trig>\` — Hapus autoreply`
                );
            }

            // 6. Core System
            sections.push(
`⚙️ *SISTEM & OWNER*
│ \`!ping\` — Cek status & latency bot
│ \`!stats\` — Pantau statistik bot & server STB
│ \`!menu\` — Tampilan menu ringkas
│ \`!owner list\` — Cek daftar owner bot
│ \`!owner add/del\` — Tambah/hapus owner`
            );

            const fullGuide =
`╭━━━〔 📖 *PANDUAN LENGKAP BOT* 〕━━━╮

${sections.join('\n\n')}

╰━━━━━━━━━━━━━━━━━━━━━━━━╯

💡 *TIPS:*
Ketik \`!help <nama_command>\` untuk panduan lebih detail.
Contoh: \`!help stiker\` atau \`!help groupinfo\``;

            if (typeof reply === 'function') {
                await reply(fullGuide);
            } else {
                await sock.sendMessage(from, { text: fullGuide }, { quoted: msg });
            }
            return;
        }

        const targetCmd = args[0].toLowerCase().replace(/^!/, '');

        // Check if command is in dynamic registry
        const registeredCmd = registry?.get(targetCmd);
        if (registeredCmd && registeredCmd.isExtension) {
            const extHelp = `🔌 *Command Extension: !${registeredCmd.name}*\n\n${registeredCmd.description || '-'}\n\nDisediakan oleh: *${registeredCmd.extensionInfo?.name || 'External Extension'}*`;
            if (typeof reply === 'function') return await reply(extHelp);
            return await sock.sendMessage(from, { text: extHelp }, { quoted: msg });
        }

        const helpText = helps[targetCmd] || (registeredCmd ? `ℹ️ \`!${registeredCmd.name}\`\n${registeredCmd.description || '-'}` : `❌ Help untuk \`!${targetCmd}\` tidak ditemukan.\n\nKetik \`!help\` untuk melihat seluruh daftar perintah.`);

        if (typeof reply === 'function') {
            await reply(helpText);
        } else {
            await sock.sendMessage(from, { text: helpText }, { quoted: msg });
        }
    }
};