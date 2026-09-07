module.exports = {
    name: 'menu',
    aliases: ['admin-menu', 'adminmenu'],
    category: 'general',
    description: 'Menampilkan menu bot dan admin menu.',
    usage: '!menu atau !admin-menu',

    async execute({ sock, msg, from, command, reply, utils }) {
        if (command === 'admin-menu' || command === 'adminmenu') {
            const groupUtils = utils?.group || require('../../utils/group');
            const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
            if (!metadata) return;

            const admin = await groupUtils.requireAdmin(sock, from, msg, metadata);
            if (!admin) return;

            const adminText =
`╭━━━〔 👑 ADMIN MENU 〕━━━╮

⚠️ Command di bawah khusus admin grup.

👥 MEMBER
│ !add 628xxxxxxxxxx
│ !kick @user
│ !kick → reply pesan
│ !promote @user
│ !promote → reply pesan
│ !demote @user
│ !demote → reply pesan

📢 GROUP
│ !tagall
│ !hidetag <teks>
│ !groupinfo
│ !listadmin

👋 WELCOME
│ !welcome on
│ !welcome off
│ !setwelcome <teks>

📊 BOT
│ !stats
│ !help <command>

👑 OWNER
│ !owner list
│ !owner add <nomor>
│ !owner delete <nomor>

╰━━━━━━━━━━━━━━━━━━━━╯`;

            if (typeof reply === 'function') {
                await reply(adminText);
            } else {
                await sock.sendMessage(from, { text: adminText }, { quoted: msg });
            }
            return;
        }

        const generalText =
`╭━━━〔 🤖 BOT MENU 〕━━━╮

👤 UMUM
│ !ping
│ !menu
│ !help
│ !stats

🎨 STICKER
│ !stiker
│ !smeme <teks atas|teks bawah>
│ !brat <teks>

👥 GROUP
│ !groupinfo
│ !listadmin
│ !tagall
│ !hidetag <teks>

╰━━━━━━━━━━━━━━━━━━━━╯

💡 Mau lihat command khusus admin?
Ketik !admin-menu`;

        if (typeof reply === 'function') {
            await reply(generalText);
        } else {
            await sock.sendMessage(from, { text: generalText }, { quoted: msg });
        }
    }
};