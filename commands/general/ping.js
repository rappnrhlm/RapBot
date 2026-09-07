module.exports = {
    name: 'ping',
    aliases: [],
    category: 'general',
    description: 'Cek apakah bot aktif.',
    usage: '!ping',

    async execute({ sock, msg, from, reply }) {
        if (typeof reply === 'function') {
            await reply('Pong! 🏓 Bot aktif lancar!');
        } else {
            await sock.sendMessage(from, { text: 'Pong! 🏓 Bot aktif lancar!' }, { quoted: msg });
        }
    }
};