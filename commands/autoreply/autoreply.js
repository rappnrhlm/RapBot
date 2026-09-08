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

    async execute({ sock, msg, from, senderNumber, command, args, reply, services, body, isGroup: isGroupChat, utils }) {
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

            const jidUtils = utils?.jid || require('../../utils/jid');
            const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
            const cleanFrom = jidUtils.normalizeJid(from);
            const effectiveGroupId = inGroup ? database.resolveDataGroupId(cleanFrom) : null;
            const showAllGroups = Boolean(args && args.includes('--all') && isOwner);

            const globalList = list.filter(item => !item.groupId);

            let text = '📋 *DAFTAR PESAN AUTOREPLY*\n\n';

            // 1. Global Section
            text += '🌐 *AUTOREPLY GLOBAL (SEMUA CHAT)*\n';
            if (globalList.length === 0) {
                text += '_Tidak ada autoreply global._\n\n';
            } else {
                globalList.forEach((item, index) => {
                    text += `${index + 1}. *${item.trigger}*\n${item.response}\n\n`;
                });
            }

            // 2. Group-Scoped Section
            if (inGroup && !showAllGroups) {
                // HANYA tampilkan autoreply khusus grup ini (atau grup induknya jika terhubung)
                const currentGroupList = list.filter(item => {
                    if (!item.groupId) return false;
                    const norm = jidUtils.normalizeJid(item.groupId);
                    return norm === cleanFrom || (effectiveGroupId && norm === effectiveGroupId);
                });

                if (currentGroupList.length > 0) {
                    const groupObj = database.getGroupById(cleanFrom) || (effectiveGroupId ? database.getGroupById(effectiveGroupId) : null);
                    const groupDisplayName = groupObj ? groupObj.name : 'Grup Ini';

                    text += `────────────────────\n👥 *AUTOREPLY KHUSUS GRUP (${groupDisplayName})*\n\n`;
                    currentGroupList.forEach((item, idx) => {
                        text += `  ${idx + 1}. *${item.trigger}*\n  ${item.response}\n\n`;
                    });
                }
            } else {
                // Di private chat / PC atau jika owner menjalankan --all
                const groupScopedList = list.filter(item => Boolean(item.groupId));
                if (groupScopedList.length > 0) {
                    text += '────────────────────\n👥 *AUTOREPLY KHUSUS GRUP*\n\n';
                    const byGroup = new Map();
                    for (const item of groupScopedList) {
                        if (!byGroup.has(item.groupId)) byGroup.set(item.groupId, []);
                        byGroup.get(item.groupId).push(item);
                    }

                    for (const [gid, items] of byGroup.entries()) {
                        const groupObj = database.getGroupById(gid);
                        const gName = groupObj ? groupObj.name : gid;
                        const isCurrent = gid === cleanFrom ? ' *(Grup Ini)*' : '';
                        text += `📂 *Grup: ${gName}*${isCurrent}\n`;
                        items.forEach((item, idx) => {
                            text += `  ${idx + 1}. *${item.trigger}*\n  ${item.response}\n\n`;
                        });
                    }
                }
            }

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
            let raw = getRawPayload(body, command, action, args);
            let targetGroupId = null;

            if (/--global/i.test(raw)) {
                raw = raw.replace(/--global/i, '').trim();
                targetGroupId = null;
            } else if (from && from.endsWith('@g.us')) {
                targetGroupId = from;
            }

            const parts = raw.split('|');
            const trigger = parts[0]?.trim();
            const response = parts.slice(1).join('|').trim();

            if (!trigger || !response) {
                const guide =
`❌ *Format Autoreply Salah*

Contoh:
• Khusus grup ini: \`!autoreply-add !aturan|Dilarang spam\`
• Berlaku global: \`!autoreply-add !rekening|BCA 123456 --global\`

💡 Untuk baris baru, kamu bisa tekan Enter langsung atau ketik \\n`;
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = await database.addAutoreply(trigger, response, senderNumber, targetGroupId);
            if (!result.success) {
                const warnMsg = `⚠️ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const label = result.item?.trigger || trigger;
            const scopeLabel = targetGroupId ? `khusus grup ini` : `global (semua chat)`;
            const succMsg = `✅ Autoreply untuk "${label}" berhasil ditambahkan (${scopeLabel})!\n\n💬 *Balasan:*\n${response}`;
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
                const guide = '❌ Contoh: `!autoreply-edit !alamat|Jl. Contoh Baru`\n\n💡 Untuk baris baru, kamu bisa tekan Enter langsung atau ketik \\n';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = await database.editAutoreply(trigger, response, senderNumber);
            if (!result.success) {
                const warnMsg = `❌ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const label = result.item?.trigger || trigger;
            const succMsg = `✅ Autoreply untuk "${label}" berhasil diperbarui!\n\n💬 *Balasan Baru:*\n${response}`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        if (action === 'del' || action === 'delete') {
            const trigger = getRawPayload(body, command, action, args);
            if (!trigger) {
                const guide = '❌ Contoh: `!autoreply-del !alamat`';
                if (typeof reply === 'function') await reply(guide);
                else await sock.sendMessage(from, { text: guide }, { quoted: msg });
                return;
            }

            const result = await database.deleteAutoreply(trigger);
            if (!result.success) {
                const warnMsg = `❌ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const label = result.item?.trigger || trigger;
            const succMsg = `✅ Autoreply untuk "${label}" berhasil dihapus!`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        const helpMsg =
`🤖 *PANDUAN AUTOREPLY*

\`!autoreply-add !trigger|respons\`
\`!autoreply-add {!trig1/!trig2/!trig3}|respons\`
\`!autoreply-list\`
\`!autoreply-del !trigger\`
\`!autoreply-edit !trigger|respons_baru\`

💡 *Fitur Tambahan:*
• *Multi-trigger / Alias:*
  Contoh: \`!autoreply-add {!rekening/!rek/!norek}|Transfer ke BCA...\`
• *Baris baru (Enter):*
  Bisa tekan Enter langsung di WhatsApp atau ketik \\n`;

        if (typeof reply === 'function') await reply(helpMsg);
        else await sock.sendMessage(from, { text: helpMsg }, { quoted: msg });
    }
};
