// core/utils/videoSticker.js - Video to animated sticker conversion for WhatsApp
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');
const Exif = require('wa-sticker-formatter/dist/internal/Metadata/Exif').default;

const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB max video input
const MAX_CONCURRENT_CONVERSIONS = 1;      // Concurrency limit for low-RAM STB
const MAX_QUEUE_SIZE = 3;                  // Max queue size before rejecting

let activeConversions = 0;
const conversionQueue = [];

/**
 * Mendeteksi lokasi binary FFmpeg yang tersedia
 */
function getFfmpegPath() {
    if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
        return process.env.FFMPEG_PATH;
    }
    try {
        const ffmpegStatic = require('ffmpeg-static');
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
            return ffmpegStatic;
        }
    } catch {}
    try {
        const sysFfmpeg = execSync('which ffmpeg 2>/dev/null').toString().trim();
        if (sysFfmpeg && fs.existsSync(sysFfmpeg)) {
            return sysFfmpeg;
        }
    } catch {}
    return null;
}

/**
 * Mendapatkan durasi video dalam detik menggunakan FFmpeg
 */
function getVideoDuration(ffmpegPath, filePath, timeoutMs = 10000) {
    return new Promise((resolve) => {
        let stderr = '';
        const proc = spawn(ffmpegPath, ['-i', filePath]);

        const timer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch {}
            resolve(null);
        }, timeoutMs);

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('close', () => {
            clearTimeout(timer);
            const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
            if (match) {
                const hours = parseFloat(match[1]);
                const minutes = parseFloat(match[2]);
                const seconds = parseFloat(match[3]);
                resolve(hours * 3600 + minutes * 60 + seconds);
            } else {
                resolve(null);
            }
        });

        proc.on('error', () => {
            clearTimeout(timer);
            resolve(null);
        });
    });
}

/**
 * Menjalankan proses konversi video ke animated WebP dengan FFmpeg
 */
function runFfmpegConvert({ ffmpegPath, inputPath, outputPath, startTime, duration, fps = 12, scale = 512, quality = 45, timeoutMs = 30000 }) {
    return new Promise((resolve, reject) => {
        const vf = `fps=${fps},scale=${scale}:${scale}:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000`;
        const args = [
            '-y',
            '-ss', String(startTime),
            '-t', String(duration),
            '-i', inputPath,
            '-vcodec', 'libwebp',
            '-filter:v', vf,
            '-loop', '0',
            '-an',
            '-s', '512x512',
            '-quality', String(quality),
            '-compression_level', '4',
            outputPath
        ];

        const proc = spawn(ffmpegPath, args);
        let stderr = '';

        const timer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch {}
            reject(new Error(`Konversi FFmpeg melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik)`));
        }, timeoutMs);

        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg gagal (exit code ${code}): ${stderr.slice(-300)}`));
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

/**
 * Queue manajemen untuk membatasi konkurensi pada perangkat terbatas seperti STB
 */
function enqueueConversion(taskFn) {
    return new Promise((resolve, reject) => {
        if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
            if (conversionQueue.length >= MAX_QUEUE_SIZE) {
                return reject(new Error('QUEUE_FULL'));
            }
            conversionQueue.push({ taskFn, resolve, reject });
            return;
        }

        executeTask(taskFn, resolve, reject);
    });
}

async function executeTask(taskFn, resolve, reject) {
    activeConversions++;
    try {
        const result = await taskFn();
        resolve(result);
    } catch (err) {
        reject(err);
    } finally {
        activeConversions--;
        if (conversionQueue.length > 0) {
            const next = conversionQueue.shift();
            executeTask(next.taskFn, next.resolve, next.reject);
        }
    }
}

/**
 * Mengonversi file video menjadi Animated WebP Buffer dengan Exif WhatsApp
 */
async function convertVideoToSticker({ inputPath, startTime = 0, duration = 5, pack = 'Bot WA', author = 'Raffa' }) {
    const ffmpegPath = getFfmpegPath();
    if (!ffmpegPath) {
        const err = new Error('FFMPEG_NOT_FOUND');
        err.code = 'FFMPEG_NOT_FOUND';
        throw err;
    }

    const tempOutputPath = path.join(os.tmpdir(), `rapbot_stk_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);
    let fallbackPath = null;

    try {
        // Pass 1: Standar resolusi 512x512, 12 fps, quality 45
        await runFfmpegConvert({
            ffmpegPath,
            inputPath,
            outputPath: tempOutputPath,
            startTime,
            duration,
            fps: 12,
            scale: 512,
            quality: 45,
            timeoutMs: 30000
        });

        let chosenPath = tempOutputPath;

        // Jika ukuran file mendekati batas WhatsApp (> 900 KB), lakukan pass kompresi fallback
        if (fs.existsSync(tempOutputPath) && fs.statSync(tempOutputPath).size > 900 * 1024) {
            fallbackPath = path.join(os.tmpdir(), `rapbot_stk_comp_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);
            try {
                await runFfmpegConvert({
                    ffmpegPath,
                    inputPath,
                    outputPath: fallbackPath,
                    startTime,
                    duration,
                    fps: 10,
                    scale: 384,
                    quality: 30,
                    timeoutMs: 25000
                });
                if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).size < fs.statSync(tempOutputPath).size) {
                    chosenPath = fallbackPath;
                }
            } catch (compErr) {
                console.warn('[videoSticker] Kompresi fallback gagal, menggunakan hasil awal:', compErr.message);
            }
        }

        const rawBuffer = fs.readFileSync(chosenPath);

        // Sisipkan EXIF metadata WhatsApp
        let finalBuffer = rawBuffer;
        try {
            const exif = new Exif({ pack, author });
            finalBuffer = await exif.add(rawBuffer);
        } catch (exifErr) {
            console.warn('[videoSticker] Gagal menyisipkan EXIF metadata:', exifErr.message);
        }

        return finalBuffer;
    } finally {
        if (fs.existsSync(tempOutputPath)) {
            try { fs.unlinkSync(tempOutputPath); } catch {}
        }
        if (fallbackPath && fs.existsSync(fallbackPath)) {
            try { fs.unlinkSync(fallbackPath); } catch {}
        }
    }
}

/**
 * Parsing argumen waktu untuk video: [mulai, durasi]
 */
function parseVideoTimeArgs(args) {
    let startTime = 0;
    let duration = 5;

    if (!args || args.length === 0) {
        return { valid: true, startTime, duration };
    }

    if (args.length > 2) {
        return {
            valid: false,
            error: '❌ Terlalu banyak argumen.\n\n*Format penggunaan video:*\n• `!stiker` (maks 5 detik pertama)\n• `!stiker <mulai>` (contoh: `!stiker 10`)\n• `!stiker <mulai> <durasi>` (contoh: `!stiker 10 3`)'
        };
    }

    const rawStart = Number(args[0]);
    if (isNaN(rawStart) || !isFinite(rawStart)) {
        return {
            valid: false,
            error: '❌ Waktu mulai harus berupa angka detik.\n\nContoh: `!stiker 10` atau `!stiker 10 3`'
        };
    }
    if (rawStart < 0) {
        return {
            valid: false,
            error: '❌ Waktu mulai tidak boleh bernilai negatif.\n\nContoh: `!stiker 10`'
        };
    }
    startTime = rawStart;

    if (args.length >= 2) {
        const rawDuration = Number(args[1]);
        if (isNaN(rawDuration) || !isFinite(rawDuration)) {
            return {
                valid: false,
                error: '❌ Durasi harus berupa angka detik.\n\nContoh: `!stiker 10 3`'
            };
        }
        if (rawDuration <= 0) {
            return {
                valid: false,
                error: '❌ Durasi stiker harus lebih dari 0 detik.\n\nContoh: `!stiker 10 3`'
            };
        }
        // Durasi hasil tidak boleh melebihi 5 detik
        duration = Math.min(rawDuration, 5);
    }

    return { valid: true, startTime, duration };
}

module.exports = {
    MAX_VIDEO_BYTES,
    getFfmpegPath,
    getVideoDuration,
    runFfmpegConvert,
    enqueueConversion,
    convertVideoToSticker,
    parseVideoTimeArgs
};
