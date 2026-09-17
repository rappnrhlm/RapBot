module.exports = {
    name: 'owner',
    aliases: ['owners'],
    category: 'owner',
    description: 'Manajemen daftar owner bot (Khusus Super Owner).',
    usage: '!owner list | !owner add <nomor> [nama] | !owner delete <nomor>',

    async execute({ sock, msg, from, senderNumber, args, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const phoneUtils = utils?.phone || require('../../utils/phone');
        const botNumber = sock?.user?.id ? phoneUtils.normalizePhoneNumber(sock.user.id) : null;
        const isUserOwner = database.isOwner(senderNumber, botNumber) || database.isSuperOwner(senderNumber);

        const subCommand = args.shift()?.toLowerCase();
        
        // If no subcommand or subcommand is contact / info
        if (!subCommand) {
            const owners = database.getOwners();
            const superOwner = owners.find(o => database.isSuperOwner(typeof o === 'object' ? o.number : o)) || owners[0] || { name: 'Raffa', number: '6285195532009' };
            const ownerNum = typeof superOwner === 'object' ? superOwner.number : superOwner;
            const cleanNum = String(ownerNum).replace(/\D/g, '');

            const contactMsg =
`👑 *KONTAK OWNER / PENGELOLA BOT*

👤 Nama: *${(typeof superOwner === 'object' ? superOwner.name : 'Raffa') || 'Raffa'}*
📱 WhatsApp: wa.me/${cleanNum}
🌐 Website: *https://bukittinggikos.com*
📸 Instagram: *@bukittinggikos*

${isUserOwner ? '💡 *Menu Owner:* `!owner list` | `!owner add <nomor>` | `!owner delete <nomor>`' : 'Silakan hubungi jika ada kendala atau permohonan kerjasama.'}`;

            if (typeof reply === 'function') await reply(contactMsg);
            else await sock.sendMessage(from, { text: contactMsg }, { quoted: msg });
            return;
        }

        if (subCommand === 'list') {
            if (!isUserOwner) {
                const forbidden = '❌ Informasi daftar owner hanya dapat dilihat oleh owner bot.';
                if (typeof reply === 'function') await reply(forbidden);
                else await sock.sendMessage(from, { text: forbidden }, { quoted: msg });
                return;
            }

            const owners = database.getOwners();
            let text = '👑 *DAFTAR OWNER BOT*\n\n';
            let index = 1;

            owners.forEach(owner => {
                const name = typeof owner === 'object' ? owner.name : 'Owner';
                const number = typeof owner === 'object' ? owner.number : owner;

                if (name === 'Mama' || name === 'Papa' || owner.hidden) return;

                text += `${index}. *${name}* — ${phoneUtils.maskNumber(number)}`;
                if (database.isSuperOwner(number)) text += ' 👑 (Super Owner)';
                text += '\n';
                index++;
            });

            if (typeof reply === 'function') {
                await reply(text);
            } else {
                await sock.sendMessage(from, { text: text }, { quoted: msg });
            }
            return;
        }

        // Subcommand add / edit / delete strictly requires Super Owner
        if (!database.isSuperOwner(senderNumber)) {
            const forbidden = '❌ Cuma Rapa utama yang boleh ngatur/mengubah daftar owner.';
            if (typeof reply === 'function') {
                await reply(forbidden);
            } else {
                await sock.sendMessage(from, { text: forbidden }, { quoted: msg });
            }
            return;
        }

        if (subCommand === 'add') {
            const rawNumber = args[0];
            const cleanNumber = phoneUtils.normalizePhoneNumber(rawNumber);
            if (!cleanNumber) {
                const helpMsg = '❌ Contoh: `!owner add 628123456789 [nama]`';
                if (typeof reply === 'function') {
                    await reply(helpMsg);
                } else {
                    await sock.sendMessage(from, { text: helpMsg }, { quoted: msg });
                }
                return;
            }

            const name = args.slice(1).join(' ') || 'Owner';
            const result = await database.addOwner(cleanNumber, name);

            if (!result.success) {
                const warnMsg = `⚠️ ${result.message}`;
                if (typeof reply === 'function') {
                    await reply(warnMsg);
                } else {
                    await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                }
                return;
            }

            const succMsg = `✅ ${cleanNumber} berhasil ditambahkan sebagai owner.`;
            if (typeof reply === 'function') {
                await reply(succMsg);
            } else {
                await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            }
            return;
        }

        if (subCommand === 'delete' || subCommand === 'del' || subCommand === 'remove') {
            const rawNumber = args[0];
            const cleanNumber = phoneUtils.normalizePhoneNumber(rawNumber);
            if (!cleanNumber) {
                const helpMsg = '❌ Contoh: `!owner delete 628123456789`';
                if (typeof reply === 'function') {
                    await reply(helpMsg);
                } else {
                    await sock.sendMessage(from, { text: helpMsg }, { quoted: msg });
                }
                return;
            }

            if (database.isSuperOwner(cleanNumber)) {
                const denyMsg = '❌ Super owner tidak bisa dihapus.';
                if (typeof reply === 'function') {
                    await reply(denyMsg);
                } else {
                    await sock.sendMessage(from, { text: denyMsg }, { quoted: msg });
                }
                return;
            }

            const result = await database.deleteOwner(cleanNumber);
            if (!result.success) {
                const notFoundMsg = `❌ ${result.message}`;
                if (typeof reply === 'function') {
                    await reply(notFoundMsg);
                } else {
                    await sock.sendMessage(from, { text: notFoundMsg }, { quoted: msg });
                }
                return;
            }

            const succMsg = `✅ ${cleanNumber} berhasil dihapus dari owner.`;
            if (typeof reply === 'function') {
                await reply(succMsg);
            } else {
                await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            }
            return;
        }

        if (subCommand === 'edit' || subCommand === 'update') {
            const rawOldNumber = args[0];
            const cleanOldNumber = phoneUtils.normalizePhoneNumber(rawOldNumber);
            if (!cleanOldNumber) {
                const helpMsg = '❌ Format: `!owner edit <nomor_lama> [nama_baru]`\nAtau: `!owner edit <nomor_lama> <nomor_baru> [nama_baru]`';
                if (typeof reply === 'function') await reply(helpMsg);
                else await sock.sendMessage(from, { text: helpMsg }, { quoted: msg });
                return;
            }

            let newNumber = cleanOldNumber;
            let newName = '';

            // Check if second argument is a phone number
            const possibleSecondNumber = phoneUtils.normalizePhoneNumber(args[1]);
            if (possibleSecondNumber && (args[1].startsWith('62') || args[1].startsWith('08') || args[1].startsWith('+'))) {
                newNumber = possibleSecondNumber;
                newName = args.slice(2).join(' ').trim();
            } else {
                newName = args.slice(1).join(' ').trim();
            }

            if (!newName) {
                // Keep existing name if not provided
                const currentOwner = database.getOwners().find(o => phoneUtils.normalizePhoneNumber(o.number) === cleanOldNumber);
                if (currentOwner) {
                    newName = typeof currentOwner === 'object' ? currentOwner.name : 'Owner';
                } else {
                    newName = 'Owner';
                }
            }

            const result = await database.updateOwner(cleanOldNumber, { name: newName, number: newNumber });
            if (!result.success) {
                const warnMsg = `⚠️ ${result.message}`;
                if (typeof reply === 'function') await reply(warnMsg);
                else await sock.sendMessage(from, { text: warnMsg }, { quoted: msg });
                return;
            }

            const succMsg = `✅ Owner berhasil diperbarui!\n\n👤 Nama: *${newName}*\n📱 Nomor: *${phoneUtils.maskNumber(newNumber)}*`;
            if (typeof reply === 'function') await reply(succMsg);
            else await sock.sendMessage(from, { text: succMsg }, { quoted: msg });
            return;
        }

        const unknownMsg = `Perintah !owner ${subCommand} tidak dikenali.\n\nGunakan:\n• \`!owner list\`\n• \`!owner add <nomor> [nama]\`\n• \`!owner edit <nomor_lama> [nama_baru]\`\n• \`!owner delete <nomor>\``;
        if (typeof reply === 'function') {
            await reply(unknownMsg);
        } else {
            await sock.sendMessage(from, { text: unknownMsg }, { quoted: msg });
        }
    }
};
