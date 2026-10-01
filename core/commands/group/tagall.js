module.exports = {
    name: 'tagall',
    aliases: ['everyone'],
    category: 'group',
    description: 'Mention seluruh anggota grup (khusus admin).',
    usage: '!tagall [pesan]',

    async execute({ sock, msg, from, args, utils }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
        if (!metadata) return;

        const isAdmin = await groupUtils.requireAdmin(sock, from, msg, metadata);
        if (!isAdmin) return;

        const mentions = metadata.participants ? metadata.participants.map(p => p.id) : [];
        const customMessage = args.join(' ').trim();
        let text = '📢 TAG ALL\n';
        if (customMessage) {
            text += `\nPesan: ${customMessage}\n`;
        }
        text += '\n';

        metadata.participants?.forEach(p => {
            text += `@${jidUtils.getJidNumber(p.id)}\n`;
        });

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    }
};
