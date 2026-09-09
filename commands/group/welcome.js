module.exports = {
    name: 'welcome',
    aliases: ['setwelcome'],
    category: 'group',
    description: 'Mengatur fitur pesan selamat datang otomatis di grup.',
    usage: '!welcome on/off atau !setwelcome <teks>',

    async execute({ sock, msg, from, command, args, reply, utils, services, isGroup: isGroupChat }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
        let metadata = null;
        if (inGroup) {
            metadata = await groupUtils.getGroupMetadata(sock, from, msg);
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

        const targetGroupId = inGroup ? from : 'default';
        const groupName = metadata?.subject || 'Global Default';

        const senderNum = jidUtils.getJidNumber(msg?.key?.participant || from);
        const botNum = jidUtils.getJidNumber(sock?.user?.id);
        const isOwner = database.isOwner(senderNum, botNum);

        const config = database.getWelcomeConfig(targetGroupId);

        if (command === 'setwelcome') {
            let text = args.join(' ').trim();
            if (!text) {
                const guide =
`❌ *Format Salah*

Contoh Penggunaan:
\`!setwelcome Halo @user 👋 Selamat datang di *@group*!\`

💡 *Tag Otomatis yang Tersedia:*
• \`@user\` : Tag/mention member baru
• \`@group\` : Nama grup ini
• \`@desc\` : Deskripsi grup
• \`@count\` : Jumlah anggota grup
• \`@date\` : Tanggal bergabung
• \`@time\` : Waktu bergabung (WIB)`;
                if (typeof reply === 'function') {
                    await reply(guide);
                } else {
                    await sock.sendMessage(from, { text: guide }, { quoted: msg });
                }
                return;
            }

            let isGlobal = !inGroup;
            if (text.includes('--global')) {
                if (isOwner) {
                    isGlobal = true;
                    text = text.replace(/--global/g, '').trim();
                }
            }

            await database.saveWelcomeConfig({ text }, isGlobal ? 'default' : targetGroupId);

            const scopeLabel = isGlobal ? 'Default Global 🌐' : `Grup *${groupName}* 🏷️`;
            const successMsg =
`✅ *Pesan welcome berhasil diatur!*
• Lingkup: ${scopeLabel}

📝 *Teks Sambutan:*
${text}

💡 *Tips:*
• Pastikan status welcome sudah aktif dengan ketik \`!welcome on\`.
• Gunakan \`!welcome reset\` jika ingin kembali ke pesan default global.`;

            if (typeof reply === 'function') {
                await reply(successMsg);
            } else {
                await sock.sendMessage(from, { text: successMsg }, { quoted: msg });
            }
            return;
        }

        // command === 'welcome'
        const mode = args[0]?.toLowerCase();

        // 1. Reset per-group custom welcome back to global default
        if (mode === 'reset') {
            if (!inGroup) {
                const resetErr = '❌ Reset hanya bisa digunakan di dalam grup.';
                return typeof reply === 'function' ? await reply(resetErr) : await sock.sendMessage(from, { text: resetErr }, { quoted: msg });
            }

            await database.resetWelcomeConfig(targetGroupId);
            const resetMsg =
`🔄 *Pesan welcome untuk grup ini berhasil di-reset ke DEFAULT GLOBAL 🌐*

Grup ini sekarang akan menggunakan pengaturan dan teks welcome default.`;
            return typeof reply === 'function' ? await reply(resetMsg) : await sock.sendMessage(from, { text: resetMsg }, { quoted: msg });
        }

        // 2. Toggle on / off
        if (mode === 'on' || mode === 'off') {
            const enabled = mode === 'on';
            await database.saveWelcomeConfig({ enabled }, targetGroupId);

            const scopeLabel = inGroup ? `untuk grup *${groupName}*` : 'default global';
            const toggleMsg = `✅ Auto welcome ${scopeLabel} ${enabled ? 'diaktifkan 🟢' : 'dimatikan 🔴'}`;

            if (typeof reply === 'function') {
                await reply(toggleMsg);
            } else {
                await sock.sendMessage(from, { text: toggleMsg }, { quoted: msg });
            }
            return;
        }

        // 3. Status check (!welcome)
        const scopeStatus = config.isCustom ? 'Khusus Grup Ini 🏷️' : 'Default Global 🌐';
        const statusMsg =
`👋 *Status Welcome Message:*
• Grup: *${groupName}*
• Mode: ${scopeStatus}
• Status: ${config.enabled ? 'AKTIF 🟢' : 'NONAKTIF 🔴'}
• Teks Saat Ini:
"${config.text || 'Default'}"

💡 *Perintah Tersedia:*
• \`!welcome on\` — Aktifkan untuk grup ini
• \`!welcome off\` — Nonaktifkan untuk grup ini
• \`!setwelcome <teks>\` — Atur teks khusus grup ini
• \`!welcome reset\` — Kembalikan ke teks default global

🏷️ *Tag Tersedia:*
\`@user\`, \`@group\`, \`@desc\`, \`@count\`, \`@date\`, \`@time\``;

        if (typeof reply === 'function') {
            await reply(statusMsg);
        } else {
            await sock.sendMessage(from, { text: statusMsg }, { quoted: msg });
        }
    }
};
