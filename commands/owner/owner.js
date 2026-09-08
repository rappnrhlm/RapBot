module.exports = {
    name: 'owner',
    aliases: ['owners'],
    category: 'owner',
    description: 'Manajemen daftar owner bot (Khusus Super Owner).',
    usage: '!owner list | !owner add <nomor> [nama] | !owner delete <nomor>',

    async execute({ sock, msg, from, senderNumber, args, reply, services, utils }) {
        const database = services?.database || require('../../services/database');
        const phoneUtils = utils?.phone || require('../../utils/phone');

        if (!database.isSuperOwner(senderNumber)) {
            const forbidden = '❌ Cuma Rapa utama yang boleh ngatur daftar owner.';
            if (typeof reply === 'function') {
                await reply(forbidden);
            } else {
                await sock.sendMessage(from, { text: forbidden }, { quoted: msg });
            }
            return;
        }

        const subCommand = args.shift()?.toLowerCase();
        if (!subCommand) {
            const usageGuide = '!owner list\n!owner add <nomor> [nama]\n!owner delete <nomor>';
            if (typeof reply === 'function') {
                await reply(usageGuide);
            } else {
                await sock.sendMessage(from, { text: usageGuide }, { quoted: msg });
            }
            return;
        }

        if (subCommand === 'list') {
            const owners = database.getOwners();
            let text = '👑 DAFTAR OWNER\n\n';
            let index = 1;

            owners.forEach(owner => {
                const name = typeof owner === 'object' ? owner.name : 'Owner';
                const number = typeof owner === 'object' ? owner.number : owner;

                if (name === 'Mama' || name === 'Papa' || owner.hidden) return;

                text += `${index}. ${name} — ${phoneUtils.maskNumber(number)}`;
                if (database.isSuperOwner(number)) text += ' 👑';
                text += '\n';
                index++;
            });

            if (typeof reply === 'function') {
                await reply(text);
            } else {
                await sock.sendMessage(from, { text }, { quoted: msg });
            }
            return;
        }

        if (subCommand === 'add') {
            const rawNumber = args[0];
            const cleanNumber = phoneUtils.normalizePhoneNumber(rawNumber);
            if (!cleanNumber) {
                const helpMsg = '❌ Contoh: !owner add 628123456789 [nama]';
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
                const helpMsg = '❌ Contoh: !owner delete 628123456789';
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

        const unknownMsg = `Perintah !owner ${subCommand} tidak dikenali.\n\nGunakan:\n!owner list\n!owner add <nomor>\n!owner delete <nomor>`;
        if (typeof reply === 'function') {
            await reply(unknownMsg);
        } else {
            await sock.sendMessage(from, { text: unknownMsg }, { quoted: msg });
        }
    }
};
