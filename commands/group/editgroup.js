module.exports = {
    name: 'editgroup',
    aliases: ['setgroup', 'updategroup', 'groupedit', 'delgroup'],
    category: 'group',
    description: 'Mengubah konfigurasi grup terdaftar atau menghapus registrasi grup.',
    usage: '!editgroup <nama_baru> [--role admin|public] [--link <grup_induk>] | !delgroup [jid]',

    async execute({ sock, msg, from, senderNumber, command, args, isGroup: isGroupChat, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const sendReply = async (text) => {
            if (typeof reply === 'function') await reply(text);
            else await sock.sendMessage(from, { text }, { quoted: msg });
        };

        const isOwner = database.isOwner(senderNumber);

        // Subcommand: !delgroup
        if (command === 'delgroup' || args[0]?.toLowerCase() === 'del' || args[0]?.toLowerCase() === 'delete') {
            if (!isOwner) {
                return sendReply('❌ Hanya owner bot yang dapat menghapus registrasi grup.');
            }

            let targetJid = args[0] === 'del' || args[0] === 'delete' ? args[1] : args[0];
            if (!targetJid) {
                targetJid = from;
            }
            targetJid = jidUtils.normalizeJid(targetJid);

            const result = await database.deleteGroup(targetJid);
            if (!result.success) {
                return sendReply(`❌ ${result.message}`);
            }

            return sendReply(`✅ Registrasi grup \`${targetJid}\` berhasil dihapus.`);
        }

        let remainingArgs = [...args];
        let targetGroup = null;

        // Check if first arg is an explicit group JID or group identifier
        if (remainingArgs.length > 0 && (remainingArgs[0].endsWith('@g.us') || remainingArgs[0].startsWith('120363'))) {
            const explicitJid = jidUtils.normalizeJid(remainingArgs[0]);
            targetGroup = database.getGroupById(explicitJid);
            if (!targetGroup) {
                return sendReply(`❌ Grup dengan JID \`${explicitJid}\` tidak ditemukan.`);
            }
            remainingArgs.shift();
        } else {
            const inGroup = typeof isGroupChat === 'boolean' ? isGroupChat : jidUtils.isGroup(from);
            if (!inGroup) {
                return sendReply('❌ Masukkan JID grup yang ingin diedit, atau jalankan perintah ini di dalam grup.\n_Contoh:_ `!editgroup 120363405545486335@g.us --role public --type marketplace --link 120363411836972985@g.us`');
            }
            targetGroup = database.getGroupById(from);
            if (!targetGroup) {
                return sendReply('❌ Grup ini belum diinisialisasi.\nGunakan `!initgroup <nama grup>`');
            }
        }

        let newName = targetGroup.name;
        let newRole = targetGroup.role || 'admin';
        let newType = targetGroup.type || 'kos';
        let newParentId = targetGroup.parentGroupId || null;

        // Parse --role or --peran
        const roleIdx = remainingArgs.findIndex(a => a.toLowerCase() === '--role' || a.toLowerCase() === '--peran');
        if (roleIdx !== -1) {
            const roleVal = remainingArgs[roleIdx + 1]?.toLowerCase();
            remainingArgs.splice(roleIdx, 2);
            if (['admin', 'public', 'indukan', 'cabang'].includes(roleVal)) {
                newRole = (roleVal === 'cabang' || roleVal === 'public') ? 'public' : 'admin';
            }
        }

        // Parse --type or --tipe or --kategori
        const typeIdx = remainingArgs.findIndex(a => a.toLowerCase() === '--type' || a.toLowerCase() === '--tipe' || a.toLowerCase() === '--kategori');
        if (typeIdx !== -1) {
            const typeVal = remainingArgs[typeIdx + 1]?.toLowerCase();
            remainingArgs.splice(typeIdx, 2);
            if (typeVal) {
                newType = typeVal;
            }
        }

        // Parse --link or --parent or --induk
        const linkIdx = remainingArgs.findIndex(a => ['--link', '--parent', '--induk'].includes(a.toLowerCase()));
        if (linkIdx !== -1) {
            const linkTarget = remainingArgs.slice(linkIdx + 1).join(' ').trim();
            remainingArgs = remainingArgs.slice(0, linkIdx);
            if (linkTarget === 'none' || linkTarget === 'unlink' || linkTarget === 'null') {
                newParentId = null;
                newRole = 'admin';
            } else if (linkTarget) {
                const allGroups = database.getGroups();
                const found = allGroups.find(g =>
                    g.id === linkTarget ||
                    g.id.startsWith(linkTarget) ||
                    g.name.toLowerCase() === linkTarget.toLowerCase() ||
                    g.name.toLowerCase().includes(linkTarget.toLowerCase())
                );
                if (found) {
                    if (found.id === targetGroup.id) {
                        return sendReply('❌ Grup tidak dapat dihubungkan ke dirinya sendiri.');
                    }
                    newParentId = found.id;
                    newRole = 'public';
                } else {
                    return sendReply(`❌ Grup induk "${linkTarget}" tidak ditemukan.\n💡 Ketik \`!initgroup list\` untuk melihat daftar grup.`);
                }
            }
        }

        // Parse --name
        const nameIdx = remainingArgs.findIndex(a => a.toLowerCase() === '--name' || a.toLowerCase() === '--nama');
        if (nameIdx !== -1) {
            const customName = remainingArgs.slice(nameIdx + 1).join(' ').trim();
            remainingArgs = remainingArgs.slice(0, nameIdx);
            if (customName) newName = customName;
        } else if (remainingArgs.join(' ').trim()) {
            newName = remainingArgs.join(' ').trim();
        }

        const updateRes = await database.updateGroup(targetGroup.id, {
            name: newName,
            role: newRole,
            type: newType,
            parentGroupId: newParentId
        });

        if (!updateRes.success) {
            return sendReply(`❌ ${updateRes.message}`);
        }

        let parentName = 'Tidak Terhubung (Mandiri/Indukan)';
        if (updateRes.group.parentGroupId) {
            const p = database.getGroupById(updateRes.group.parentGroupId);
            parentName = p ? `${p.name} (${p.id})` : updateRes.group.parentGroupId;
        }

        const succMsg =
`✅ *Pengaturan Grup Berhasil Diperbarui!*

👥 *Nama:* ${updateRes.group.name}
🆔 *JID:* \`${updateRes.group.id}\`
🎭 *Peran:* ${(updateRes.group.role || 'admin').toUpperCase()}
📂 *Tipe:* ${(updateRes.group.type || 'kos').toUpperCase()}
🔗 *Link Indukan:* ${parentName}`;

        return sendReply(succMsg);
    }
};
