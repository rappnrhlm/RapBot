module.exports = {
    name: 'sent',
    aliases: ['kirim'],
    category: 'bukittinggi-kos',
    description: 'Menandai status data kost menjadi SENT.',
    usage: '!sent <Nama Kost 1> [Nama Kost 2] atau dipisah koma',

    async execute({ sock, msg, from, senderNumber, args, reply, services, utils }) {
        const spreadsheet = services?.spreadsheet || require('../../services/spreadsheet');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const whitelistGroupId = process.env.KOS_GROUP_ID;
        if (whitelistGroupId) {
            const currentFrom = jidUtils.normalizeJid(from);
            const targetGroup = jidUtils.normalizeJid(whitelistGroupId);

            if (currentFrom !== targetGroup) {
                const denyMsg = '❌ Fitur manajemen kos hanya dapat digunakan di grup resmi yang ditentukan.';
                if (typeof reply === 'function') await reply(denyMsg);
                else await sock.sendMessage(from, { text: denyMsg }, { quoted: msg });
                return;
            }
        }

        const rawInput = args.join(' ').trim();
        if (!rawInput) {
            const guide =
`❌ Masukkan nama kost yang ingin ditandai sebagai sent.
Contoh:
*!sent Kost Mawar, Kost Melati*
atau
*!sent Kost Mawar Kost Melati*`;
            if (typeof reply === 'function') await reply(guide);
            else await sock.sendMessage(from, { text: guide }, { quoted: msg });
            return;
        }

        const allKost = await spreadsheet.getAllKost();
        let targetNames = [];

        // If input contains commas, split by comma
        if (rawInput.includes(',')) {
            targetNames = rawInput.split(',').map(s => s.trim()).filter(Boolean);
        } else {
            // Find which kost names from database are contained in rawInput (case-insensitive)
            const matched = allKost.filter(k =>
                rawInput.toLowerCase().includes(k.name.toLowerCase())
            );

            if (matched.length > 0) {
                targetNames = matched.map(k => k.name);
            } else {
                targetNames = [rawInput];
            }
        }

        const result = await spreadsheet.markSent(targetNames, senderNumber || 'unknown');

        let text = '';
        if (result.updatedCount > 0) {
            text += `✅ *${result.updatedCount} KOST DITANDAI SENT*\n\n`;
            result.updatedNames.forEach((name, idx) => {
                text += `${idx + 1}. ${name} ✅\n`;
            });
            text += `\n👤 Ditandai oleh: @${senderNumber}\n`;
        }

        if (result.notFoundNames && result.notFoundNames.length > 0) {
            if (text) text += '\n';
            text += `⚠️ *Tidak ditemukan:* ${result.notFoundNames.join(', ')}`;
        }

        if (typeof reply === 'function') {
            await reply(text);
        } else {
            await sock.sendMessage(
                from,
                { text, mentions: senderNumber ? [`${senderNumber}@s.whatsapp.net`] : [] },
                { quoted: msg }
            );
        }
    }
};
