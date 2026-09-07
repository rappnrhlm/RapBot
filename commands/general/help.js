module.exports = {
    name: 'help',
    aliases: ['bantuan'],
    category: 'general',
    description: 'Menampilkan bantuan command.',
    usage: '!help [nama_command]',

    async execute({ sock, msg, from, args, reply }) {
        const helps = {
            ping: '🏓 !ping\nCek apakah bot aktif.',
            menu: '📋 !menu\nMenampilkan menu untuk anggota.',
            'admin-menu': '👑 !admin-menu\nMenampilkan command khusus admin grup.',
            adminmenu: '👑 !admin-menu\nMenampilkan command khusus admin grup.',
            stats: '📊 !stats\nMenampilkan statistik penggunaan bot & server.',
            stiker: '🎨 !stiker\nKirim gambar dengan caption !stiker atau reply gambar.',
            sticker: '🎨 !stiker\nKirim gambar dengan caption !stiker atau reply gambar.',
            smeme: '🎨 !smeme <teks atas|teks bawah>\nMembuat stiker meme dari gambar.',
            brat: '🎨 !brat <teks>\nMembuat stiker Brat dari teks.',
            groupinfo: '👥 !groupinfo\nMenampilkan informasi grup.',
            listadmin: '👑 !listadmin\nMenampilkan daftar admin grup.',
            tagall: '📢 !tagall\nMention seluruh anggota grup.',
            hidetag: '📢 !hidetag <teks>\nMention semua anggota tanpa pesan mention.',
            add: '➕ !add 628xxxxxxxxxx\nMenambahkan nomor ke grup.',
            kick: '🔨 !kick @user\nAtau reply pesan user lalu ketik !kick.',
            promote: '👑 !promote @user\nAtau reply pesan user lalu ketik !promote.',
            demote: '⬇️ !demote @user\nAtau reply pesan user lalu ketik !demote.',
            welcome: '👋 !welcome on/off\nMengaktifkan atau mematikan welcome otomatis.',
            setwelcome: '✏️ !setwelcome <teks>\nVariabel: @user dan @group.',
            owner: '👑 !owner list/add/delete\nKhusus super owner.',
            'autoreply-add': '🤖 !autoreply-add !trigger|respons\nMenambahkan autoreply otomatis (Khusus Owner).',
            'autoreply-list': '📋 !autoreply-list\nMenampilkan daftar autoreply yang terdaftar.',
            'autoreply-del': '🗑️ !autoreply-del !trigger\nMenghapus autoreply (Khusus Owner).',
            'autoreply-edit': '✏️ !autoreply-edit !trigger|respons baru\nMengubah autoreply (Khusus Owner).',
            addkost: '🏠 !addkost <Nama Kost> > <kontak (ig/wa/tt)>\nMenambahkan data kos (mendukung Instagram, WhatsApp, TikTok).',
            kost: '🏠 !kost [all|pending|sent] atau !kost dm atau !kost lengkap <ID>\nMenampilkan daftar kos, daftar link untuk DM, atau detail kos.',
            cari: '🔍 !cari <nama/kontak/ID>\nMencari data kos dalam daftar.',
            sent: '✅ !sent <ID>\nMenandai status kos menjadi sent berdasarkan ID.',
            delkost: '🗑️ !delkost <ID>\nMenghapus data kos berdasarkan ID.',
            initgroup: '👥 !initgroup <nama>\nInisialisasi registrasi grup secara persistent.'
        };

        if (!args || !args[0]) {
            const defaultText =
`💡 *HELP*

Ketik:
!help <command>

Contoh:
!help smeme
!help brat
!help welcome
!help kost`;

            if (typeof reply === 'function') {
                await reply(defaultText);
            } else {
                await sock.sendMessage(from, { text: defaultText }, { quoted: msg });
            }
            return;
        }

        const targetCmd = args[0].toLowerCase().replace(/^!/, '');
        const helpText = helps[targetCmd] || `❌ Help untuk !${targetCmd} tidak ditemukan.`;

        if (typeof reply === 'function') {
            await reply(helpText);
        } else {
            await sock.sendMessage(from, { text: helpText }, { quoted: msg });
        }
    }
};