// test-video-sticker.js - Comprehensive Automated Test Suite for Video and Image Stickers
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');
const { execSync } = require('child_process');
const sharp = require('sharp');
const { Image } = require('node-webpmux');
const stikerCmd = require('./core/commands/sticker/stiker');
const videoStickerUtils = require('./core/utils/videoSticker');
const { loadCommands } = require('./core/whatsapp/messageHandler');

async function bufferToAsyncIterable(buf) {
    return (async function* () {
        const chunkSize = 16384;
        for (let i = 0; i < buf.length; i += chunkSize) {
            yield buf.subarray(i, i + chunkSize);
        }
    })();
}

async function runTestSuite() {
    console.log('🧪 ========================================================');
    console.log('🧪 MEMULAI PENGUJIAN LENGKAP FITUR STIKER VIDEO & GAMBAR');
    console.log('🧪 ========================================================\n');

    const tempDir = os.tmpdir();
    const testSampleDir = path.join(tempDir, `rapbot_test_samples_${Date.now()}`);
    fs.mkdirSync(testSampleDir, { recursive: true });

    const sampleImagePath = path.join(testSampleDir, 'sample_image.png');
    const sampleVideo3sPath = path.join(testSampleDir, 'sample_3s.mp4');
    const sampleVideo12sPath = path.join(testSampleDir, 'sample_12s.mp4');
    const sampleCorruptPath = path.join(testSampleDir, 'corrupt.mp4');

    const ffmpegPath = videoStickerUtils.getFfmpegPath();
    console.log(`[Info] FFmpeg Path terdeteksi: ${ffmpegPath}`);
    if (!ffmpegPath) {
        throw new Error('FFmpeg tidak ditemukan!');
    }

    // 1. Generate sample files
    console.log('📁 Membuat sample media pengujian...');
    await sharp({
        create: {
            width: 200,
            height: 200,
            channels: 4,
            background: { r: 50, g: 150, b: 250, alpha: 1 }
        }
    }).png().toFile(sampleImagePath);

    execSync(`"${ffmpegPath}" -y -f lavfi -i testsrc=duration=3:size=320x240:rate=15 "${sampleVideo3sPath}"`, { stdio: 'ignore' });
    execSync(`"${ffmpegPath}" -y -f lavfi -i testsrc=duration=12:size=320x240:rate=15 "${sampleVideo12sPath}"`, { stdio: 'ignore' });
    fs.writeFileSync(sampleCorruptPath, Buffer.from('BOGUS_CORRUPT_VIDEO_DATA_123456789'));

    const sampleImageBuffer = fs.readFileSync(sampleImagePath);
    const sampleVideo3sBuffer = fs.readFileSync(sampleVideo3sPath);
    const sampleVideo12sBuffer = fs.readFileSync(sampleVideo12sPath);
    const sampleCorruptBuffer = fs.readFileSync(sampleCorruptPath);

    // Mock baileys downloadContentFromMessage
    const baileys = require('@whiskeysockets/baileys');
    const originalDownload = baileys.downloadContentFromMessage;

    // Helper context builder
    function createMockContext({ msg, args = [] }) {
        let replies = [];
        let sentMessages = [];
        let stickerStatsIncremented = 0;

        const mockSock = {
            sendMessage: async (target, content, options) => {
                sentMessages.push({ target, content, options });
                return { key: { id: 'MOCK_ID_' + Date.now() } };
            }
        };

        const mockReply = async (text) => {
            replies.push(text);
        };

        const mockServices = {
            database: {
                incrementStickerStats: () => { stickerStatsIncremented++; },
                isOwner: () => true
            },
            downloadContentFromMessage: async (mediaObj, mediaType) => {
                if (mediaObj._forceError) {
                    throw new Error('DOWNLOAD_NETWORK_ERROR_SIMULATION');
                }
                if (mediaObj._testBuffer) {
                    return await bufferToAsyncIterable(mediaObj._testBuffer);
                }
                if (mediaType === 'image') {
                    return await bufferToAsyncIterable(sampleImageBuffer);
                }
                if (mediaType === 'video') {
                    return await bufferToAsyncIterable(sampleVideo3sBuffer);
                }
                throw new Error('Unknown media type');
            }
        };

        return {
            ctx: {
                sock: mockSock,
                msg,
                from: '120363000000000000@g.us',
                args,
                reply: mockReply,
                services: mockServices
            },
            getReplies: () => replies,
            getSentMessages: () => sentMessages,
            getStickerStats: () => stickerStatsIncremented
        };
    }

    let passedTests = 0;
    let failedTests = 0;

    async function assertTest(name, fn) {
        process.stdout.write(`▶️ [TEST] ${name} ... `);
        try {
            await fn();
            console.log('✅ PASS');
            passedTests++;
        } catch (err) {
            console.log(`❌ FAIL: ${err.message}`);
            failedTests++;
        }
    }

    try {
        // Mock downloadContentFromMessage to return our generated sample buffers based on media type
        baileys.downloadContentFromMessage = async (mediaObj, mediaType) => {
            if (mediaObj._testBuffer) {
                return await bufferToAsyncIterable(mediaObj._testBuffer);
            }
            if (mediaObj._forceError) {
                throw new Error('DOWNLOAD_NETWORK_ERROR_SIMULATION');
            }
            if (mediaType === 'image') {
                return await bufferToAsyncIterable(sampleImageBuffer);
            }
            if (mediaType === 'video') {
                return await bufferToAsyncIterable(sampleVideo3sBuffer);
            }
            throw new Error('Unknown media type');
        };

        // TEST 1: Reply gambar biasa dengan !stiker
        await assertTest('1. Reply gambar biasa dengan !stiker', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker',
                        contextInfo: {
                            quotedMessage: {
                                imageMessage: { mimetype: 'image/png', _testBuffer: sampleImageBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker gambar tidak terkirim');
            if (mock.getStickerStats() !== 1) throw new Error('Stats stiker tidak bertambah');

            // Verify it's a valid webp
            const img = new Image();
            await img.load(stickerMsg.content.sticker);
            if (img.hasAnim) throw new Error('Stiker gambar seharusnya tidak animasi');
        });

        // TEST 2: Reply gambar sekali lihat (View Once) dengan !stiker
        await assertTest('2. Reply gambar sekali lihat dengan !stiker', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker',
                        contextInfo: {
                            quotedMessage: {
                                viewOnceMessageV2: {
                                    message: {
                                        imageMessage: { mimetype: 'image/png', _testBuffer: sampleImageBuffer }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker gambar sekali lihat tidak terkirim');
            if (mock.getStickerStats() !== 1) throw new Error('Stats stiker tidak bertambah');
        });

        // TEST 3: Gambar dengan argumen waktu (argumen tidak boleh merusak / salah deteksi)
        await assertTest('3. Reply gambar dengan !stiker 10 3 (argumen diabaikan pada gambar)', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker 10 3',
                        contextInfo: {
                            quotedMessage: {
                                imageMessage: { mimetype: 'image/png', _testBuffer: sampleImageBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['10', '3'] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker gambar tidak terkirim');
            const img = new Image();
            await img.load(stickerMsg.content.sticker);
            if (img.hasAnim) throw new Error('Gambar tidak boleh diubah menjadi animasi');
        });

        // TEST 4: Reply video 3 detik dengan !stiker (default: max 5s)
        await assertTest('4. Reply video 3 detik dengan !stiker', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo3sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker animasi tidak terkirim');
            if (!stickerMsg.content.isAnimated) throw new Error('Flag isAnimated harus true');

            const img = new Image();
            await img.load(stickerMsg.content.sticker);
            if (!img.hasAnim) throw new Error('Stiker video harus berformat animasi');
            if (mock.getStickerStats() !== 1) throw new Error('Stats stiker tidak bertambah');
        });

        // TEST 5: Reply video 12 detik dengan !stiker (mengambil max 5 detik pertama)
        await assertTest('5. Reply video 12 detik dengan !stiker (default max 5 detik)', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo12sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker animasi 5s pertama tidak terkirim');

            const img = new Image();
            await img.load(stickerMsg.content.sticker);
            if (!img.hasAnim) throw new Error('Stiker harus animasi');
        });

        // TEST 6: Reply video dengan !stiker 7 (mulai detik ke-7, max 5 detik)
        await assertTest('6. Reply video 12s dengan !stiker 7', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker 7',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo12sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['7'] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker animasi dari detik 7 tidak terkirim');
        });

        // TEST 7: Reply video dengan !stiker 2 3 (mulai detik ke-2, durasi 3 detik)
        await assertTest('7. Reply video 12s dengan !stiker 2 3', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker 2 3',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo12sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['2', '3'] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker animasi dari detik 2 durasi 3s tidak terkirim');
        });

        // TEST 8: Reply video sekali lihat (View Once)
        await assertTest('8. Reply video sekali lihat dengan !stiker', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker',
                        contextInfo: {
                            quotedMessage: {
                                viewOnceMessage: {
                                    message: {
                                        videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo3sBuffer }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker dari video sekali lihat tidak terkirim');
        });

        // TEST 9: Waktu mulai melebihi durasi video (!stiker 20 pada video 12 detik)
        await assertTest('9. Waktu mulai melebihi durasi video (!stiker 20 pada video 12s)', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker 20',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo12sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['20'] });
            await stikerCmd.execute(mock.ctx);

            const replies = mock.getReplies();
            const errReply = replies.find(r => r.includes('melebihi durasi video'));
            if (!errReply) throw new Error(`Pesan error tidak sesuai: ${replies.join(' | ')}`);
        });

        // TEST 10: Argumen negatif (!stiker -5)
        await assertTest('10. Argumen negatif ditolak dengan panduan (!stiker -5)', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker -5',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo3sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['-5'] });
            await stikerCmd.execute(mock.ctx);

            const replies = mock.getReplies();
            const errReply = replies.find(r => r.includes('tidak boleh bernilai negatif'));
            if (!errReply) throw new Error(`Pesan error tidak sesuai: ${replies.join(' | ')}`);
        });

        // TEST 11: Argumen non-numerik (!stiker abc)
        await assertTest('11. Argumen non-numerik ditolak (!stiker abc)', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker abc',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo3sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['abc'] });
            await stikerCmd.execute(mock.ctx);

            const replies = mock.getReplies();
            const errReply = replies.find(r => r.includes('harus berupa angka'));
            if (!errReply) throw new Error(`Pesan error tidak sesuai: ${replies.join(' | ')}`);
        });

        // TEST 12: Durasi tersisa lebih pendek dari durasi yang diminta (video 3s, !stiker 1 5 -> ambil sisa 2s)
        await assertTest('12. Menggunakan sisa durasi jika lebih pendek dari permintaan', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker 1 5',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleVideo3sBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: ['1', '5'] });
            await stikerCmd.execute(mock.ctx);

            const sent = mock.getSentMessages();
            const stickerMsg = sent.find(s => s.content?.sticker);
            if (!stickerMsg) throw new Error('Stiker dari sisa durasi tidak terkirim');
        });

        // TEST 13: File video corrupt / FFmpeg gagal
        await assertTest('13. Penanganan file media rusak / FFmpeg gagal secara graceful', async () => {
            const msg = {
                message: {
                    extendedTextMessage: {
                        text: '!stiker',
                        contextInfo: {
                            quotedMessage: {
                                videoMessage: { mimetype: 'video/mp4', _testBuffer: sampleCorruptBuffer }
                            }
                        }
                    }
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const replies = mock.getReplies();
            const errReply = replies.find(r => r.includes('Gagal membuat stiker video'));
            if (!errReply) throw new Error(`Pesan error kegagalan video tidak ada: ${replies.join(' | ')}`);
        });

        // TEST 14: Pesan tanpa media (!stiker pada chat biasa)
        await assertTest('14. Pesan tanpa media memberikan petunjuk', async () => {
            const msg = {
                message: {
                    conversation: '!stiker'
                }
            };
            const mock = createMockContext({ msg, args: [] });
            await stikerCmd.execute(mock.ctx);

            const replies = mock.getReplies();
            const guideReply = replies.find(r => r.includes('Kirim gambar/video'));
            if (!guideReply) throw new Error(`Petunjuk tanpa media tidak muncul: ${replies.join(' | ')}`);
        });

        // TEST 15: Pembersihan file sementara (tidak ada file sementara tertinggal di /tmp)
        await assertTest('15. Verifikasi pembersihan file sementara di /tmp', async () => {
            const tmpFiles = fs.readdirSync(tempDir).filter(f => f.startsWith('rapbot_vid_') || f.startsWith('rapbot_stk_'));
            if (tmpFiles.length > 0) {
                throw new Error(`File sementara masih tersisa di /tmp: ${tmpFiles.join(', ')}`);
            }
        });

        // TEST 16: Command RapBot lainnya tetap berfungsi dan command registry memuat !stiker dengan baik
        await assertTest('16. Kompatibilitas Command Registry dan command lain', async () => {
            const registry = loadCommands();
            if (!registry.has('stiker')) throw new Error('Command !stiker tidak terdaftar');
            if (!registry.has('sticker')) throw new Error('Alias !sticker tidak terdaftar');
            if (!registry.has('s')) throw new Error('Alias !s tidak terdaftar');

            // Cek command lain seperti brat, smeme, toimg, ping, help
            const testOthers = ['brat', 'smeme', 'toimg', 'ping', 'help'];
            for (const other of testOthers) {
                if (!registry.has(other)) throw new Error(`Command !${other} hilang atau gagal dimuat!`);
            }
        });

    } finally {
        // Restore original download function
        baileys.downloadContentFromMessage = originalDownload;

        // Cleanup test sample directory
        if (fs.existsSync(testSampleDir)) {
            try { fs.rmSync(testSampleDir, { recursive: true, force: true }); } catch {}
        }
    }

    console.log('\n========================================================');
    console.log(`📊 HASIL PENGUJIAN: ${passedTests} BERHASIL, ${failedTests} GAGAL`);
    console.log('========================================================\n');

    if (failedTests > 0) {
        process.exitCode = 1;
    }
}

runTestSuite();
