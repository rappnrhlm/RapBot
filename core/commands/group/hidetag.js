module.exports = {
    name: 'hidetag',
    aliases: ['ht', 'notify'],
    category: 'group',
    description: 'Mention seluruh anggota grup secara tersembunyi (khusus admin).',
    usage: '!hidetag <teks>',

    async execute({ sock, msg, from, args, utils }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
        if (!metadata) return;

        const isAdmin = await groupUtils.requireAdmin(sock, from, msg, metadata);
        if (!isAdmin) return;

        const mentions = metadata.participants ? metadata.participants.map(p => p.id) : [];
        const text = args.join(' ').trim() || '📢';

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    }
};
