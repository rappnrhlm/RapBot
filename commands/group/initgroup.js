module.exports = {
    name: 'initgroup',
    aliases: [],
    category: 'group',
    description: 'Menginisialisasi registrasi grup secara persistent.',
    usage: '!initgroup <nama>',

    async execute({ sock, msg, from, senderNumber, args, reply, utils, services }) {
        const jidUtils = utils?.jid || require('../../utils/jid');
        const database = services?.database || require('../../services/database');

        // 1. Validasi harus di dalam grup
        const isGroupChat = jidUtils.isGroup(from);
        if (!isGroupChat) {
            const privateMsg = '❌ Command ini hanya bisa digunakan di dalam grup.';
            if (typeof reply === 'function') await reply(privateMsg);
            else await sock.sendMessage(from, { text: privateMsg }, { quoted: msg });
            return;
        }

        // 2. Validasi nama/alias grup
        const aliasName = args.join(' ').trim();
        if (!aliasName) {
            const formatMsg = '❌ Format: `!initgroup <nama>`\n\nContoh:\n`!initgroup Bukittinggi Kos`';
            if (typeof reply === 'function') await reply(formatMsg);
            else await sock.sendMessage(from, { text: formatMsg }, { quoted: msg });
            return;
        }

        // 3. Ambil metadata grup WhatsApp jika tersedia
        let groupSubject = '';
        try {
            const metadata = await sock.groupMetadata(from);
            groupSubject = metadata?.subject || '';
        } catch (err) {
            console.warn('[commands/group/initgroup] Gagal mengambil metadata grup:', err.message);
        }

        // 4. Periksa apakah grup sudah terdaftar (Group JID adalah unique identifier)
        const existing = database.getGroupById(from);
        if (existing) {
            const alreadyMsg = `ℹ️ Grup ini sudah diinisialisasi sebagai "${existing.name}".`;
            if (typeof reply === 'function') await reply(alreadyMsg);
            else await sock.sendMessage(from, { text: alreadyMsg }, { quoted: msg });
            return;
        }

        // 5. Simpan registrasi grup secara persistent
        const result = await database.addGroup({
            id: from,
            name: aliasName,
            groupName: groupSubject,
            initializedBy: senderNumber || ''
        });

        if (result.success) {
            const succMsg = `✅ Grup berhasil diinisialisasi sebagai "${result.group.name}".`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        if (result.alreadyExists) {
            const alreadyMsg = `ℹ️ Grup ini sudah diinisialisasi sebagai "${result.existingGroup.name}".`;
            if (typeof reply === 'function') await reply(alreadyMsg);
            else await sock.sendMessage(from, { text: alreadyMsg }, { quoted: msg });
            return;
        }

        const failMsg = `❌ Gagal menginisialisasi grup: ${result.message}`;
        if (typeof reply === 'function') await reply(failMsg);
        else await sock.sendMessage(from, { text: failMsg }, { quoted: msg });
    }
};
