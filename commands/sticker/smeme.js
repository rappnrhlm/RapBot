const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function drawMeme(imageBuffer, topText, bottomText) {
    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img, 0, 0, img.width, img.height);

    const fontSize = Math.floor(img.width / 7);
    ctx.font = `600 ${fontSize}px Impact, sans-serif`;
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = Math.floor(fontSize / 9);
    ctx.textAlign = 'center';

    if (topText) {
        ctx.textBaseline = 'top';
        const x = img.width / 2;
        const y = img.height * 0.05;
        ctx.strokeText(topText.toUpperCase(), x, y);
        ctx.fillText(topText.toUpperCase(), x, y);
    }

    if (bottomText) {
        ctx.textBaseline = 'bottom';
        const x = img.width / 2;
        const y = img.height * 0.95;
        ctx.strokeText(bottomText.toUpperCase(), x, y);
        ctx.fillText(bottomText.toUpperCase(), x, y);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    name: 'smeme',
    aliases: ['stickermeme', 'memesticker'],
    category: 'sticker',
    description: 'Membuat stiker meme dengan teks atas dan bawah.',
    usage: '!smeme teks atas|teks bawah',

    async execute({ sock, msg, from, args, reply, services }) {
        const database = services?.database || require('../../services/database');

        const rawText = args.join(' ').trim();
        const textParts = rawText.split('|');
        const topText = textParts[0] ? textParts[0].trim() : '';
        const bottomText = textParts[1] ? textParts[1].trim() : '';

        const imageMsg =
            msg.message?.imageMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;

        if (!imageMsg) {
            const guide = '❌ Kirim/reply gambar dengan caption:\n*!smeme teks atas|teks bawah*\n\nContoh:\n!smeme ketika ngoding|error 500';
            if (typeof reply === 'function') {
                await reply(guide);
            } else {
                await sock.sendMessage(from, { text: guide }, { quoted: msg });
            }
            return;
        }

        if (typeof reply === 'function') {
            await reply('⏳ Sedang membuat stiker meme...');
        } else {
            await sock.sendMessage(from, { text: '⏳ Sedang membuat stiker meme...' }, { quoted: msg });
        }

        try {
            const stream = await downloadContentFromMessage(imageMsg, 'image');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const memeBuffer = await drawMeme(buffer, topText, bottomText);

            const sticker = new Sticker(memeBuffer, {
                pack: 'Meme Sticker',
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
            console.error('[commands/sticker/smeme] Error making meme sticker:', err);
            if (typeof reply === 'function') {
                await reply('❌ Gagal membuat stiker meme.');
            } else {
                await sock.sendMessage(from, { text: '❌ Gagal membuat stiker meme.' }, { quoted: msg });
            }
        }
    }
};
