module.exports = {
    name: 'groupinfo',
    aliases: ['infogrup', 'grupinfo'],
    category: 'group',
    description: 'Menampilkan informasi grup (nama, member, admin).',
    usage: '!groupinfo',

    async execute({ sock, msg, from, reply, utils }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
        if (!metadata) return;

        const admins = metadata.participants ? metadata.participants.filter(groupUtils.isAdmin) : [];
        const text =
`╭━━━〔 👥 GROUP INFO 〕━━━╮

📛 Nama
${metadata.subject}

👤 Member
${metadata.participants?.length || 0}

👑 Admin
${admins.length}

╰━━━━━━━━━━━━━━━━━━━━╯`;

        if (typeof reply === 'function') {
            await reply(text);
        } else {
            await sock.sendMessage(from, { text }, { quoted: msg });
        }
    }
};
