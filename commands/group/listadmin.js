module.exports = {
    name: 'listadmin',
    aliases: ['adminlist', 'admins'],
    category: 'group',
    description: 'Menampilkan daftar admin grup.',
    usage: '!listadmin',

    async execute({ sock, msg, from, utils }) {
        const groupUtils = utils?.group || require('../../utils/group');
        const jidUtils = utils?.jid || require('../../utils/jid');

        const metadata = await groupUtils.getGroupMetadata(sock, from, msg);
        if (!metadata) return;

        const admins = metadata.participants ? metadata.participants.filter(groupUtils.isAdmin) : [];
        let text = '👑 DAFTAR ADMIN\n\n';
        const mentions = [];

        admins.forEach((participant, index) => {
            const jid = participant.id;
            mentions.push(jid);
            text += `${index + 1}. @${jidUtils.getJidNumber(jid)}\n`;
        });

        await sock.sendMessage(from, { text, mentions }, { quoted: msg });
    }
};
