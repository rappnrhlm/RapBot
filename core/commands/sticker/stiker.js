const fs = require('fs');
const path = require('path');
const os = require('os');
const baileys = require('@whiskeysockets/baileys');
const { downloadContentFromMessage } = baileys;
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const {
    MAX_VIDEO_BYTES,
    getFfmpegPath,
    getVideoDuration,
    enqueueConversion,
    convertVideoToSticker,
    parseVideoTimeArgs
} = require('../../utils/videoSticker');

/**
 * Memvalidasi apakah objek media memiliki mediaKey dan path (url atau directPath) yang valid untuk diunduh
 */
function isValidMediaObject(media) {
    if (!media || typeof media !== 'object') return false;
    const hasMediaKey = Boolean(
        media.mediaKey &&
        (Buffer.isBuffer(media.mediaKey)
            ? media.mediaKey.length > 0
            : typeof media.mediaKey === 'string'
                ? media.mediaKey.length > 0
                : Object.keys(media.mediaKey).length > 0)
    );
    const hasPath = Boolean(media.directPath || media.url);
    return hasMediaKey && hasPath;
}

/**
 * Mencari media gambar atau video (baik pesan biasa maupun sekali lihat/viewOnce).
 * Memprioritaskan kandidat yang memiliki mediaKey & path valid agar tidak terambil stub kosong.
 */
function extractTargetMedia(msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

    // Kumpulan kandidat media gambar (prioritas: quoted direct, viewOnce, ephemeral, lalu direct message)
    const imageCandidates = [
        quoted?.imageMessage,
        quoted?.viewOnceMessageV2?.message?.imageMessage,
        quoted?.viewOnceMessage?.message?.imageMessage,
        quoted?.viewOnceMessageV2Extension?.message?.imageMessage,
        quoted?.ephemeralMessage?.message?.imageMessage,
        quoted?.ephemeralMessage?.message?.viewOnceMessageV2?.message?.imageMessage,
        quoted?.ephemeralMessage?.message?.viewOnceMessage?.message?.imageMessage,
        quoted?.documentWithCaptionMessage?.message?.imageMessage,
        msg.message?.imageMessage,
        msg.message?.viewOnceMessageV2?.message?.imageMessage,
        msg.message?.viewOnceMessage?.message?.imageMessage,
        msg.message?.viewOnceMessageV2Extension?.message?.imageMessage,
        msg.message?.ephemeralMessage?.message?.imageMessage,
        msg.message?.ephemeralMessage?.message?.viewOnceMessageV2?.message?.imageMessage,
        msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.imageMessage,
        msg.message?.documentWithCaptionMessage?.message?.imageMessage
    ].filter(Boolean);

    // Kumpulan kandidat media video
    const videoCandidates = [
        quoted?.videoMessage,
        quoted?.viewOnceMessageV2?.message?.videoMessage,
        quoted?.viewOnceMessage?.message?.videoMessage,
        quoted?.viewOnceMessageV2Extension?.message?.videoMessage,
        quoted?.ephemeralMessage?.message?.videoMessage,
        quoted?.ephemeralMessage?.message?.viewOnceMessageV2?.message?.videoMessage,
        quoted?.ephemeralMessage?.message?.viewOnceMessage?.message?.videoMessage,
        quoted?.documentWithCaptionMessage?.message?.videoMessage,
        msg.message?.videoMessage,
        msg.message?.viewOnceMessageV2?.message?.videoMessage,
        msg.message?.viewOnceMessage?.message?.videoMessage,
        msg.message?.viewOnceMessageV2Extension?.message?.videoMessage,
        msg.message?.ephemeralMessage?.message?.videoMessage,
        msg.message?.ephemeralMessage?.message?.viewOnceMessageV2?.message?.videoMessage,
        msg.message?.ephemeralMessage?.message?.viewOnceMessage?.message?.videoMessage,
        msg.message?.documentWithCaptionMessage?.message?.videoMessage
    ].filter(Boolean);

    // Cari kandidat yang memiliki kredensial unduh (mediaKey & directPath/url) lengkap
    const validImage = imageCandidates.find(isValidMediaObject);
    const validVideo = videoCandidates.find(isValidMediaObject);

    const quotedHasVideo = Boolean(
        quoted?.videoMessage ||
        quoted?.viewOnceMessage?.message?.videoMessage ||
        quoted?.viewOnceMessageV2?.message?.videoMessage ||
        quoted?.viewOnceMessageV2Extension?.message?.videoMessage ||
        quoted?.ephemeralMessage?.message?.videoMessage
    );
    const quotedHasImage = Boolean(
        quoted?.imageMessage ||
        quoted?.viewOnceMessage?.message?.imageMessage ||
        quoted?.viewOnceMessageV2?.message?.imageMessage ||
        quoted?.viewOnceMessageV2Extension?.message?.imageMessage ||
        quoted?.ephemeralMessage?.message?.imageMessage
    );

    // 1. Jika reply ke video
    if (quotedHasVideo) {
        const media = validVideo || videoCandidates[0];
        if (media) {
            return {
                type: 'video',
                media,
                candidates: videoCandidates,
                isViewOnce: Boolean(media.viewOnce || quoted?.viewOnceMessage || quoted?.viewOnceMessageV2 || quoted?.viewOnceMessageV2Extension)
            };
        }
    }

    // 2. Jika reply ke gambar (termasuk view-once yang di-quote)
    if (quotedHasImage) {
        const media = validImage || imageCandidates[0];
        if (media) {
            return {
                type: 'image',
                media,
                candidates: imageCandidates,
                isViewOnce: Boolean(media.viewOnce || quoted?.viewOnceMessage || quoted?.viewOnceMessageV2 || quoted?.viewOnceMessageV2Extension)
            };
        }
    }

    // 3. Jika direct message video (dengan caption)
    const directHasVideo = Boolean(
        msg.message?.videoMessage ||
        msg.message?.viewOnceMessage?.message?.videoMessage ||
        msg.message?.viewOnceMessageV2?.message?.videoMessage ||
        msg.message?.viewOnceMessageV2Extension?.message?.videoMessage
    );
    if (directHasVideo) {
        const media = validVideo || videoCandidates[0];
        if (media) {
            return {
                type: 'video',
                media,
                candidates: videoCandidates,
                isViewOnce: Boolean(media.viewOnce || msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessageV2Extension)
            };
        }
    }

    // 4. Jika direct message gambar (dengan caption)
    const directHasImage = Boolean(
        msg.message?.imageMessage ||
        msg.message?.viewOnceMessage?.message?.imageMessage ||
        msg.message?.viewOnceMessageV2?.message?.imageMessage ||
        msg.message?.viewOnceMessageV2Extension?.message?.imageMessage
    );
    if (directHasImage) {
        const media = validImage || imageCandidates[0];
        if (media) {
            return {
                type: 'image',
                media,
                candidates: imageCandidates,
                isViewOnce: Boolean(media.viewOnce || msg.message?.viewOnceMessage || msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessageV2Extension)
            };
        }
    }

    // Fallback jika ada kandidat valid apapun
    if (validImage) {
        return { type: 'image', media: validImage, candidates: imageCandidates, isViewOnce: Boolean(validImage.viewOnce) };
    }
    if (validVideo) {
        return { type: 'video', media: validVideo, candidates: videoCandidates, isViewOnce: Boolean(validVideo.viewOnce) };
    }

    return null;
}

module.exports = {
    name: 'stiker',
    aliases: ['sticker', 's'],
    category: 'sticker',
    description: 'Membuat stiker dari gambar atau video animasi (caption atau reply).',
    usage: '!stiker [mulai] [durasi] (kirim/reply gambar atau video)',

    async execute({ sock, msg, from, args = [], reply, services }) {
        const database = services?.database || require('../../services/database');
        const downloadMedia = services?.downloadContentFromMessage || baileys.downloadContentFromMessage;

        const sendReply = async (text) => {
            if (typeof reply === 'function') {
                return await reply(text);
            }
            return await sock.sendMessage(from, { text }, { quoted: msg });
        };

        const targetMedia = extractTargetMedia(msg);

        if (!targetMedia) {
            await sendReply('Kirim gambar/video dengan caption !stiker atau reply gambar/video.');
            return;
        }

        // ==========================================
        // 1. ALUR STIKER GAMBAR (Tetap Menggunakan Mekanisme Lama)
        // ==========================================
        if (targetMedia.type === 'image') {
            await sendReply('⏳ Sedang membuat stiker...');

            try {
                let buffer = null;
                let lastErr = null;

                // Coba unduh dari targetMedia.media, jika gagal coba fallback ke kandidat gambar lainnya yang ada
                const downloadAttempts = [targetMedia.media, ...(targetMedia.candidates || []).filter(c => c !== targetMedia.media)];

                for (const candidate of downloadAttempts) {
                    try {
                        const stream = await downloadMedia(candidate, 'image');
                        let tempBuf = Buffer.alloc(0);
                        for await (const chunk of stream) {
                            tempBuf = Buffer.concat([tempBuf, chunk]);
                        }
                        if (tempBuf && tempBuf.length > 0) {
                            buffer = tempBuf;
                            break;
                        }
                    } catch (attemptErr) {
                        lastErr = attemptErr;
                    }
                }

                if (!buffer || buffer.length === 0) {
                    throw lastErr || new Error('Gagal mengunduh buffer gambar');
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
                console.error('[commands/sticker/stiker] Error making image sticker:', err);
                const errMsg = targetMedia.isViewOnce
                    ? '❌ Gagal membuat stiker dari media sekali lihat. Pastikan media belum kedaluwarsa atau sudah dibuka.'
                    : '❌ Gagal membuat stiker.';
                await sendReply(errMsg);
            }
            return;
        }

        // ==========================================
        // 2. ALUR STIKER VIDEO ANIMASI (Mekanisme Baru)
        // ==========================================
        if (targetMedia.type === 'video') {
            // Validasi argumen waktu sebelum download untuk menghemat resource STB
            const parseResult = parseVideoTimeArgs(args);
            if (!parseResult.valid) {
                await sendReply(parseResult.error);
                return;
            }

            // Periksa ketersediaan FFmpeg di sistem
            const ffmpegPath = getFfmpegPath();
            if (!ffmpegPath) {
                await sendReply('❌ Fitur stiker animasi tidak dapat digunakan karena FFmpeg tidak tersedia di sistem.');
                return;
            }

            // Batasi ukuran video berdasarkan metadata awal jika tersedia
            if (targetMedia.media.fileLength && Number(targetMedia.media.fileLength) > MAX_VIDEO_BYTES) {
                await sendReply('❌ Ukuran file video terlalu besar (maksimal 25 MB).');
                return;
            }

            await sendReply('⏳ Sedang memproses stiker video animasi...');

            const tempInputPath = path.join(os.tmpdir(), `rapbot_vid_${Date.now()}_${Math.random().toString(36).slice(2)}.mp4`);

            try {
                await enqueueConversion(async () => {
                    // Unduh stream video langsung ke file sementara di tmpfs untuk menghemat RAM Node.js
                    const videoAttempts = [targetMedia.media, ...(targetMedia.candidates || []).filter(c => c !== targetMedia.media)];
                    let downloaded = false;
                    let lastVidErr = null;

                    for (const candidate of videoAttempts) {
                        try {
                            const stream = await downloadMedia(candidate, 'video');
                            const writeStream = fs.createWriteStream(tempInputPath);
                            let downloadedBytes = 0;

                            for await (const chunk of stream) {
                                downloadedBytes += chunk.length;
                                if (downloadedBytes > MAX_VIDEO_BYTES) {
                                    writeStream.destroy();
                                    throw new Error('VIDEO_TOO_LARGE');
                                }
                                writeStream.write(chunk);
                            }

                            await new Promise((resolve, reject) => {
                                writeStream.end((err) => (err ? reject(err) : resolve()));
                            });

                            if (fs.existsSync(tempInputPath) && fs.statSync(tempInputPath).size > 0) {
                                downloaded = true;
                                break;
                            }
                        } catch (err) {
                            lastVidErr = err;
                            if (err.message === 'VIDEO_TOO_LARGE') throw err;
                            if (fs.existsSync(tempInputPath)) {
                                try { fs.unlinkSync(tempInputPath); } catch {}
                            }
                        }
                    }

                    if (!downloaded) {
                        throw lastVidErr || new Error('Gagal mengunduh video');
                    }

                    // Validasi dan penyesuaian durasi video
                    const videoDuration = await getVideoDuration(ffmpegPath, tempInputPath);
                    let { startTime, duration } = parseResult;

                    if (videoDuration !== null) {
                        if (startTime >= videoDuration) {
                            const totalStr = videoDuration < 10 ? videoDuration.toFixed(1) : Math.round(videoDuration);
                            throw new Error(`START_TIME_EXCEEDED:${startTime}:${totalStr}`);
                        }

                        const remaining = videoDuration - startTime;
                        // Jika durasi tersisa lebih pendek dari durasi yang diminta, gunakan bagian yang tersedia
                        duration = Math.min(duration, remaining);
                        if (duration < 0.2) {
                            throw new Error('DURATION_TOO_SHORT');
                        }
                    }

                    // Konversi video ke Animated WebP sesuai spesifikasi WhatsApp
                    const stickerBuffer = await convertVideoToSticker({
                        inputPath: tempInputPath,
                        startTime,
                        duration,
                        pack: 'Bot WA',
                        author: 'Raffa'
                    });

                    await sock.sendMessage(
                        from,
                        { sticker: stickerBuffer, isAnimated: true },
                        { quoted: msg }
                    );

                    database.incrementStickerStats();
                });
            } catch (err) {
                console.error('[commands/sticker/stiker] Error making video sticker:', err);

                if (err.message?.startsWith('START_TIME_EXCEEDED:')) {
                    const [, st, tot] = err.message.split(':');
                    await sendReply(`❌ Waktu mulai (${st} detik) melebihi durasi video (${tot} detik).`);
                } else if (err.message === 'DURATION_TOO_SHORT') {
                    await sendReply('❌ Sisa durasi video terlalu pendek untuk dijadikan stiker animasi.');
                } else if (err.message === 'VIDEO_TOO_LARGE') {
                    await sendReply('❌ Ukuran file video terlalu besar (maksimal 25 MB).');
                } else if (err.message === 'QUEUE_FULL') {
                    await sendReply('⏳ Antrean konversi video sedang penuh. Silakan coba kembali dalam beberapa saat.');
                } else if (err.code === 'FFMPEG_NOT_FOUND') {
                    await sendReply('❌ Fitur stiker animasi tidak dapat digunakan karena FFmpeg tidak tersedia.');
                } else if (targetMedia.isViewOnce) {
                    await sendReply('❌ Gagal memproses video sekali lihat. Pastikan media belum kedaluwarsa atau sudah dibuka.');
                } else {
                    await sendReply('❌ Gagal membuat stiker video. Pastikan format video didukung.');
                }
            } finally {
                // Pastikan file sementara selalu dibersihkan pada semua kondisi (berhasil maupun error)
                if (fs.existsSync(tempInputPath)) {
                    try { fs.unlinkSync(tempInputPath); } catch {}
                }
            }
        }
    }
};
