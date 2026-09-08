function getRawPayload(body, command, action, args) {
    if (body) {
        let text = body.trim();
        // Hapus command pertama (misal: !autoreply-add atau !autoreply)
        text = text.replace(/^\S+\s*/, '').trim();

        // Jika perintahnya !autoreply add/edit/del, hapus subaction-nya juga
        if (command === 'autoreply' && action) {
            text = text.replace(new RegExp(`^${action}\\s*`, 'i'), '').trim();
        }

        // Dukung literal \n jika user mengetik \n
        text = text.replace(/\\n/g, '\n');
        return text;
    }
    return (args || []).join(' ').replace(/\\n/g, '\n').trim();
}

module.exports = {
    name: 'autoreply-add',
    aliases: ['autoreply-list', 'autoreply-del', 'autoreply-edit', 'autoreply'],
    category: 'autoreply',
    description: 'Mengatur autoreply otomatis (Khusus Owner).',
    usage: '!autoreply-add !trigger|respons | !autoreply-list | !autoreply-del !trigger | !autoreply-edit !trigger|respons_baru',

    async execute({ sock, msg, from, senderNumber, command, args, reply, services, body }) {
        const database = services?.database || require('../../services/database');

        let action = '';
        if (command === 'autoreply-add') action = 'add';
        else if (command === 'autoreply-edit') action = 'edit';
        else if (command === 'autoreply-del') action = 'del';
        else if (command === 'autoreply-list') action = 'list';
        else if (command === 'autoreply') {
            action = args.shift()?.toLowerCase() || '';
        }

        const isOwner = database.isOwner(senderNumber);

        if (action === 'list') {
            const list = database.getAutoreplies();
            if (!list.length) {
                const emptyMsg = '📋 Belum ada autoreply yang terdaftar.';
                if (typeof reply === 'function') await reply(emptyMsg);
                else await sock.sendMessage(from, { text: emptyMsg }, { quoted: msg });
                return;
            }

            let text = '📋 *DAFTAR AUTOREPLY*\n\n';
            list.forEach((item, index) => {
                text += `${index + 1}. *${item.trigger}*\n${item.response}\n\n`;
            });

            if (typeof reply === 'function') await reply(text.trim());
            else await sock.sendMessage(from, { text: text.trim() }, { quoted: msg });
            return;
        }

        // Actions add, edit, del require Owner permission
        if (!isOwner) {
            const denyMsg = '❌ Perintah pengaturan autoreply hanya bisa digunakan oleh owner bot.';
            if (typeof reply === 'function') await reply(denyMsg);
            else await sock.sendMessage(from, { text: denyMsg }, { quoted: msg });
            return;
        }

        if (action === 'add') {
            const raw = getRawPayload(body, command, action, args);
            const parts = raw.split('|');
            const trigger = parts[0]?.trim();
            const response = parts.slice(1).join('|').trim();

            if (!trigger || !response) {
                const guide = '❌ Contoh: !autoreply-add !alamat|Jl. Contoh No. 123\n\n💡 Untuk baris baru, kamu bisa tekan Enter langsung atau ketik \\n';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = database.addAutoreply(trigger, response, senderNumber);
            if (!result.success) {
                const warnMsg = `⚠️ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const succMsg = `✅ Autoreply untuk "${trigger}" berhasil ditambahkan!\n\n💬 *Balasan:*\n${response}`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        if (action === 'edit') {
            const raw = getRawPayload(body, command, action, args);
            const parts = raw.split('|');
            const trigger = parts[0]?.trim();
            const response = parts.slice(1).join('|').trim();

            if (!trigger || !response) {
                const guide = '❌ Contoh: !autoreply-edit !alamat|Jl. Contoh Baru\n\n💡 Untuk baris baru, kamu bisa tekan Enter langsung atau ketik \\n';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = database.editAutoreply(trigger, response, senderNumber);
            if (!result.success) {
                const warnMsg = `❌ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const succMsg = `✅ Autoreply untuk "${trigger}" berhasil diperbarui!\n\n💬 *Balasan Baru:*\n${response}`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        if (action === 'del' || action === 'delete') {
            const trigger = getRawPayload(body, command, action, args);
            if (!trigger) {
                const guide = '❌ Contoh: !autoreply-del !alamat';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = database.deleteAutoreply(trigger);
            if (!result.success) {
                const warnMsg = `❌ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const succMsg = `✅ Autoreply untuk "${trigger}" berhasil dihapus!`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        const helpMsg =
`🤖 *PANDUAN AUTOREPLY*

!autoreply-add !trigger|respons
!autoreply-list
!autoreply-del !trigger
!autoreply-edit !trigger|respons_baru

💡 *Tips baris baru:*
Kamu bisa tekan Enter langsung di WhatsApp atau ketik \\n di dalam pesan respons.`;

        if (typeof reply === 'function') await reply(helpMsg);
        else await sock.sendMessage(from, { text: helpMsg }, { quoted: msg });
    }
};
