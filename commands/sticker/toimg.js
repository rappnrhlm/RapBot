const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const sharp = require('sharp');

module.exports = {
    name: 'toimg',
    aliases: ['toimage', 'togambar', 'tovideo', 'tovid'],
    category: 'sticker',
    description: 'Mengubah stiker kembali menjadi gambar (foto/gif).',
    usage: '!toimg (reply stiker)',

    async execute({ sock, msg, from, reply, services }) {
        const database = services?.database || require('../../services/database');

        const stickerMsg =
            msg.message?.stickerMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;

        if (!stickerMsg) {
            const guide = '❌ Reply stiker yang ingin diubah menjadi gambar dengan caption *!toimg*';
            if (typeof reply === 'function') {
                await reply(guide);
            } else {
                await sock.sendMessage(from, { text: guide }, { quoted: msg });
            }
            return;
        }

        if (typeof reply === 'function') {
            await reply('⏳ Sedang memproses stiker menjadi gambar...');
        } else {
            await sock.sendMessage(from, { text: '⏳ Sedang memproses stiker menjadi gambar...' }, { quoted: msg });
        }

        try {
            const stream = await downloadContentFromMessage(stickerMsg, 'sticker');
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (stickerMsg.isAnimated) {
                try {
                    const gifBuffer = await sharp(buffer, { animated: true }).gif().toBuffer();
                    await sock.sendMessage(
                        from,
                        { video: gifBuffer, gifPlayback: true, caption: '✅ Berhasil mengubah stiker bergerak menjadi GIF!' },
                        { quoted: msg }
                    );
                    return;
                } catch (animErr) {
                    console.warn('[commands/sticker/toimg] Gagal convert animasi ke gif, mencoba fallback ke PNG:', animErr.message);
                }
            }

            const pngBuffer = await sharp(buffer).png().toBuffer();
            await sock.sendMessage(
                from,
                { image: pngBuffer, caption: '✅ Berhasil mengubah stiker menjadi gambar!' },
                { quoted: msg }
            );
        } catch (err) {
            console.error('[commands/sticker/toimg] Error converting sticker to image:', err);
            const errorMsg = '❌ Gagal mengubah stiker menjadi gambar. Pastikan stiker yang di-reply valid.';
            if (typeof reply === 'function') {
                await reply(errorMsg);
            } else {
                await sock.sendMessage(from, { text: errorMsg }, { quoted: msg });
            }
        }
    }
};
