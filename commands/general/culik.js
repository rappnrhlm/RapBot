const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

function findViewOnceMedia(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    const targets = [quoted, msg.message].filter(Boolean);

    for (const target of targets) {
        // 1. Check viewOnce wrappers (V1, V2, V2 Extension)
        const voWrapper =
            target.viewOnceMessage?.message ||
            target.viewOnceMessageV2?.message ||
            target.viewOnceMessageV2Extension?.message;

        if (voWrapper) {
            if (voWrapper.imageMessage) {
                return { type: 'image', media: voWrapper.imageMessage, caption: voWrapper.imageMessage.caption || '' };
            }
            if (voWrapper.videoMessage) {
                return { type: 'video', media: voWrapper.videoMessage, caption: voWrapper.videoMessage.caption || '' };
            }
            if (voWrapper.audioMessage) {
                return { type: 'audio', media: voWrapper.audioMessage, caption: '' };
            }
        }

        // 2. Direct message flags (viewOnce: true)
        if (target.imageMessage?.viewOnce) {
            return { type: 'image', media: target.imageMessage, caption: target.imageMessage.caption || '' };
        }
        if (target.videoMessage?.viewOnce) {
            return { type: 'video', media: target.videoMessage, caption: target.videoMessage.caption || '' };
        }
        if (target.audioMessage?.viewOnce) {
            return { type: 'audio', media: target.audioMessage, caption: '' };
        }

        // 3. Fallback: regular quoted media
        if (target.imageMessage) {
            return { type: 'image', media: target.imageMessage, caption: target.imageMessage.caption || '' };
        }
        if (target.videoMessage) {
            return { type: 'video', media: target.videoMessage, caption: target.videoMessage.caption || '' };
        }
        if (target.audioMessage) {
            return { type: 'audio', media: target.audioMessage, caption: '' };
        }
    }

    return null;
}

module.exports = {
    name: 'culik',
    aliases: ['rvo', 'readviewonce', 'viewonce', 'lihat'],
    category: 'general',
    description: 'Mengambil media sekali lihat (View Once) menjadi foto/video biasa.',
    usage: '!culik (reply pesan sekali lihat)',

    async execute({ sock, msg, from, reply, services }) {
        const database = services?.database || require('../../services/database');

        const mediaItem = findViewOnceMedia(msg);

        if (!mediaItem) {
            const guide = '❌ Reply pesan foto/video/audio sekali lihat (View Once) dengan caption *!culik*';
            if (typeof reply === 'function') {
                await reply(guide);
            } else {
                await sock.sendMessage(from, { text: guide }, { quoted: msg });
            }
            return;
        }

        if (typeof reply === 'function') {
            await reply('⏳ Sedang mengambil media sekali lihat...');
        } else {
            await sock.sendMessage(from, { text: '⏳ Sedang mengambil media sekali lihat...' }, { quoted: msg });
        }

        try {
            const stream = await downloadContentFromMessage(mediaItem.media, mediaItem.type);
            let buffer = Buffer.alloc(0);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            const captionHeader = '🔓 *Hasil Culik Media Sekali Lihat*';
            const finalCaption = mediaItem.caption
                ? `${captionHeader}\n\n📝 *Caption Asli:*\n${mediaItem.caption}`
                : captionHeader;

            if (mediaItem.type === 'image') {
                await sock.sendMessage(
                    from,
                    {
                        image: buffer,
                        caption: finalCaption
                    },
                    { quoted: msg }
                );
            } else if (mediaItem.type === 'video') {
                await sock.sendMessage(
                    from,
                    {
                        video: buffer,
                        caption: finalCaption,
                        mimetype: mediaItem.media.mimetype || 'video/mp4'
                    },
                    { quoted: msg }
                );
            } else if (mediaItem.type === 'audio') {
                await sock.sendMessage(
                    from,
                    {
                        audio: buffer,
                        mimetype: mediaItem.media.mimetype || 'audio/mp4',
                        ptt: mediaItem.media.ptt || false
                    },
                    { quoted: msg }
                );
            }

            database.incrementCommandStats('culik');
        } catch (err) {
            console.error('[commands/general/culik] Error downloading view once media:', err);
            const errMsg = `❌ Gagal mengambil media sekali lihat (${err.message}). Pastikan media belum kedaluwarsa.`;
            if (typeof reply === 'function') {
                await reply(errMsg);
            } else {
                await sock.sendMessage(from, { text: errMsg }, { quoted: msg });
            }
        }
    }
};
