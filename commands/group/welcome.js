module.exports = {
    name: 'welcome',
    aliases: ['setwelcome'],
    category: 'group',
    description: 'Mengatur fitur pesan selamat datang otomatis di grup.',
    usage: '!welcome on/off atau !setwelcome <teks>',

        const groupUtils = utils?.group || require('../../utils/group');
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        if (inGroup) {
            const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
            if (!metadata) return;

            const isAdmin = await groupUtils.requireAdmin(sock, from, msg, metadata);
            if (!isAdmin) return;
        } else {
            const senderNum = jidUtils.getJidNumber(msg?.key?.participant || from);
            const botNum = jidUtils.getJidNumber(sock?.user?.id);
            if (!database.isOwner(senderNum, botNum)) {
                const errMsg = '❌ Command ini hanya bisa digunakan di dalam grup oleh admin.';
                if (typeof reply === 'function') {
                    return await reply(errMsg);
                } else {
                    return await sock.sendMessage(from, { text: errMsg }, { quoted: msg });
                }
            }
        }

        const config = database.getWelcomeConfig();

        if (command === 'setwelcome') {
            const text = args.join(' ').trim();
            if (!text) {
                const guide =
`❌ *Format Salah*

Contoh:
\`!setwelcome Halo @user, selamat datang di @group!\`

💡 *Variabel:*
• \`@user\` : Tag member baru
• \`@group\` : Nama grup`;
                if (typeof reply === 'function') {
                    await reply(guide);
                } else {
                    await sock.sendMessage(from, { text: guide }, { quoted: msg });
                }
                return;
            }

            config.text = text;
            await database.saveWelcomeConfig(config);

            const successMsg =
`✅ *Pesan welcome berhasil diubah!*

📝 *Teks Baru:*
${text}

💡 Pastikan status sudah aktif dengan ketik: \`!welcome on\``;
            if (typeof reply === 'function') {
                await reply(successMsg);
            } else {
                await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
            }
            return;
        }

        // command === 'welcome'
        const mode = args[0]?.toLowerCase();
        if (mode !== 'on' && mode !== 'off') {
            const statusMsg =
`👋 *Status Welcome Message:*
• Status: ${config.enabled ? 'AKTIF 🟢' : 'NONAKTIF 🔴'}
• Teks Saat Ini:
"${config.text || 'Default'}"

💡 *Gunakan:*
• \`!welcome on\` — Aktifkan
• \`!welcome off\` — Nonaktifkan
• \`!setwelcome <teks>\` — Ubah teks sambutan`;

            if (typeof reply === 'function') {
                await reply(statusMsg);
            } else {
                await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
            }
            return;
        }

        config.enabled = mode === 'on';
        await database.saveWelcomeConfig(config);

        const toggleMsg = `✅ Auto welcome ${config.enabled ? 'diaktifkan 🟢' : 'dimatikan 🔴'}`;
        if (typeof reply === 'function') {
            await reply(toggleMsg);
        } else {
            await sock.sendMessage(from, { text: toggleMsg }, { quoted: msg });
        }
    }
};
