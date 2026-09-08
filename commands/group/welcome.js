module.exports = {
    name: 'welcome',
    aliases: ['setwelcome'],
    category: 'group',
    description: 'Mengatur fitur pesan selamat datang otomatis di grup.',
    usage: '!welcome on/off atau !setwelcome <teks>',

    async execute({ sock, msg, from, command, args, reply, utils, services }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const database = services?.database || require('../../services/database');

        const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
        if (!metadata) return;

        const isAdmin = await groupUtils.requireAdmin(sock, from, msg, metadata);
        if (!isAdmin) return;

        const config = database.getWelcomeConfig();

        if (command === 'setwelcome') {
            const text = args.join(' ').trim();
            if (!text) {
                const guide = '❌ Contoh:\n`!setwelcome Halo @user, selamat datang di @group!`';
                if (typeof reply === 'function') {
                    await reply(guide);
                } else {
                    await sock.sendMessage(from, { text: guide }, { quoted: msg });
                }
                return;
            }

            config.text = text;
            await database.saveWelcomeConfig(config);

            const successMsg = '✅ Pesan welcome berhasil diubah.';
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
`👋 Welcome saat ini: ${config.enabled ? 'AKTIF 🟢' : 'NONAKTIF 🔴'}

Gunakan:
\`!welcome on\`
\`!welcome off\`
\`!setwelcome <teks>\``;

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
