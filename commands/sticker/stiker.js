const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

module.exports = {
    name: 'stiker',
    aliases: ['sticker', 's'],
    category: 'sticker',
    description: 'Membuat stiker dari gambar caption atau reply.',
    usage: '!stiker (kirim gambar dengan caption atau reply gambar)',

    async execute({ sock, msg, from, reply, services }) {
        const database = services?.database || require('../../services/database');

        const imageMsg =
            msg.message?.imageMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!imageMsg) {
            if (typeof reply === 'function') {
                await reply('Kirim gambar dengan caption !stiker atau reply gambar.');
            } else {
                await sock.sendMessage(from, { text: 'Kirim gambar dengan caption !stiker atau reply gambar.' }, { quoted: msg });
            }
            return;
        }

        if (typeof reply === 'function') {
            await reply('⏳ Sedang membuat stiker...');
        } else {
            await sock.sendMessage(from, { text: '⏳ Sedang membuat stiker...' }, { quoted: msg });
        }

        try {
            const stream = await downloadContentFromMessage(imageMsg, 'image');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const sticker = new Sticker(buffer, {
                pack: 'Bot WA',
                author: 'Raffa',
                type: StickerTypes.FULL,
                quality: 70
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(
                from,
                { sticker: stickerBuffer },
                { quoted: msg }
            );

            database.incrementStickerStats();
        } catch (err) {
            console.error('[commands/sticker/stiker] Error making sticker:', err);
            if (typeof reply === 'function') {
                await reply('❌ Gagal membuat stiker.');
            } else {
                await sock.sendMessage(from, { text: '❌ Gagal membuat stiker.' }, { quoted: msg });
            }
        }
    }
};
