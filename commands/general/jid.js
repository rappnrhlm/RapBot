const { normalizeJid } = require('../../utils/jid');

module.exports = {
    name: 'jid',
    aliases: ['id', 'myid', 'groupid', 'getjid'],
    category: 'general',
    description: 'Menampilkan WhatsApp JID / ID grup dan ID pengirim.',
    usage: '!jid',

    async execute({ sock, msg, from, senderNumber, isGroup, reply, services }) {
        const database = services?.database || require('../../services/database');
        
        let groupSubject = '';
        let initStatus = 'Bukan grup';
        let groupRole = '-';
        let groupType = '-';

        if (isGroup) {
            const groupInfo = database.getGroupById(from);
            if (groupInfo) {
                initStatus = `✅ Terdaftar (${(groupInfo.role || 'admin').toUpperCase()})`;
                groupRole = (groupInfo.role || 'admin').toUpperCase();
                groupType = (groupInfo.type || 'kos').toUpperCase();
            } else {
                initStatus = '⚠️ Belum Di-Init (Undefined)';
            }

            try {
                const meta = await sock.groupMetadata(from);
                groupSubject = meta?.subject || '';
            } catch {}
        }

        const cleanSender = String(senderNumber || '').replace(/[^0-9]/g, '');
        const senderJid = `${cleanSender}@s.whatsapp.net`;

        let text = `📋 *WHATSAPP ID INSPECTOR*\n\n`;
        if (isGroup) {
            text += `👥 *Group JID:* \`${from}\`\n`;
            if (groupSubject) text += `📛 *Nama WA:* *${groupSubject}*\n`;
            text += `🏷️ *Status Init:* ${initStatus}\n`;
            if (groupRole !== '-') text += `🎭 *Peran:* ${groupRole} | 📂 *Tipe:* ${groupType}\n`;
            text += `\n`;
        }

        text += `👤 *User ID (No WA):* \`${senderNumber}\`\n`;
        text += `📱 *User JID:* \`${senderJid}\`\n\n`;
        text += `💡 _ID ini bisa digunakan untuk konfigurasi bot atau panel web._`;

        return await reply(text);
    }
};
