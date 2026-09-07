module.exports = {
    name: 'kost',
    aliases: ['addkost', 'cari'],
    category: 'bukittinggi-kos',
    description: 'Manajemen data kos Bukittinggi (khusus grup yang di-whitelist).',
    usage: '!addkost <Nama Kost> > <username_ig> | !kost [all|pending|sent] | !cari <keyword>',

    async execute({ sock, msg, from, senderNumber, command, args, reply, services, utils }) {
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

        // 1. ADD KOST: !addkost <Nama Kost> > <ig_username>
        if (command === 'addkost') {
            const raw = args.join(' ').trim();
            const parts = raw.split('>');
            const name = parts[0]?.trim();
            const ig = parts[1]?.trim();

            if (!name || !ig) {
                const guide = '❌ Format salah.\nContoh: *!addkost Kost Mawar > kostmawar*';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = await spreadsheet.addKost({
                name,
                instagram: ig,
                addedBy: senderNumber || 'unknown'
            });

            if (!result.success) {
                const warnMsg = `⚠️ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const igLink = spreadsheet.formatInstagramUrl(result.data.instagram);
            const succMsg =
`✅ *DATA KOST BERHASIL DITAMBAHKAN*

🏠 *Nama:* ${result.data.name}
📸 *IG:* ${igLink}
📌 *Status:* PENDING ⏳`;

            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        // 2. CARI KOST: !cari <keyword>
        if (command === 'cari') {
            const query = args.join(' ').trim();
            if (!query) {
                const guide = '❌ Masukkan kata kunci pencarian.\nContoh: *!cari mawar*';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const results = await spreadsheet.searchKost(query);
            if (!results.length) {
                const emptyMsg = `🔍 Tidak ditemukan data kost dengan kata kunci "${query}".`;
                if (typeof reply === 'function') await reply(emptyMsg);
                else await sock.sendMessage(from, { text: emptyMsg }, { quoted: msg });
                return;
            }

            let text = `🔍 *HASIL PENCARIAN: "${query}"* (${results.length} ditemukan)\n\n`;
            results.forEach((k, idx) => {
                const statusBadge = (k.status || 'pending').toLowerCase() === 'sent' ? '✅ SENT' : '⏳ PENDING';
                const igUrl = spreadsheet.formatInstagramUrl(k.instagram);
                text += `${idx + 1}. *${k.name}*\n   📸 ${igUrl}\n   📌 Status: ${statusBadge}\n`;
                if (k.sentBy) text += `   👤 Sent By: ${k.sentBy}\n`;
                text += '\n';
            });

            if (typeof reply === 'function') await reply(text);
            else await sock.sendMessage(from, { text }, { quoted: msg });
            return;
        }

        // 3. LIST KOST: !kost [all|pending|sent]
        const sub = args[0]?.toLowerCase() || 'pending';
        let filter = 'pending';
        if (sub === 'all') filter = 'all';
        else if (sub === 'sent') filter = 'sent';
        else if (sub === 'pending') filter = 'pending';

        const list = await spreadsheet.getKostByStatus(filter);

        if (!list.length) {
            const emptyMsg = `📋 Tidak ada data kost dengan status *${filter.toUpperCase()}*.`;
            if (typeof reply === 'function') await reply(emptyMsg);
            else await sock.sendMessage(from, { text: emptyMsg }, { quoted: msg });
            return;
        }

        let text = `🏠 *DAFTAR KOST BUKITTINGGI* (${filter.toUpperCase()})\nTotal: ${list.length}\n\n`;
        list.forEach((k, idx) => {
            const statusBadge = (k.status || 'pending').toLowerCase() === 'sent' ? '✅ SENT' : '⏳ PENDING';
            const igUrl = spreadsheet.formatInstagramUrl(k.instagram);
            text += `${idx + 1}. *${k.name}*\n   📸 ${igUrl}\n   📌 Status: ${statusBadge}\n`;
            if (k.sentBy) text += `   👤 Sent By: ${k.sentBy}\n`;
            text += '\n';
        });

        text += '💡 *Perintah Tersedia:*\n!kost all\n!kost pending\n!kost sent\n!addkost <Nama> > <ig>\n!cari <nama>\n!sent <Nama Kost>';

        if (typeof reply === 'function') await reply(text);
        else await sock.sendMessage(from, { text }, { quoted: msg });
    }
};
