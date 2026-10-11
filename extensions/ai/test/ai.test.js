// extensions/ai/test/ai.test.js - Comprehensive Automated Test Suite with Mock API
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const { Storage } = require('../src/utils/storage');
const { BudgetManager } = require('../src/budgetManager');
const { RateLimiter } = require('../src/rateLimiter');
const { AiService } = require('../src/aiService');
const { providerFactory } = require('../src/providers/providerFactory');
const { GeminiProvider } = require('../src/providers/geminiProvider');
const { getModelPricing, calculateCost, estimateWorstCaseCost } = require('../src/utils/pricing');
const { createServer } = require('../server');

async function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Temporary test data directory
const TEST_DATA_DIR = path.join(__dirname, 'test-data');
const TEST_STORAGE_FILE = path.join(TEST_DATA_DIR, 'test-usage.json');

function cleanupTestData() {
    if (fs.existsSync(TEST_STORAGE_FILE)) {
        try { fs.unlinkSync(TEST_STORAGE_FILE); } catch {}
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
        try { fs.rmdirSync(TEST_DATA_DIR); } catch {}
    }
}

async function runTests() {
    console.log('🧪 =========================================================');
    console.log('🧪 MEMULAI PENGUJIAN OTOMATIS FITUR AI EXTENSION RAPBOT');
    console.log('🧪 =========================================================\n');

    cleanupTestData();

    // 1. Setup Mock Gemini API Server
    let mockResponse = {
        candidates: [
            {
                content: {
                    parts: [{ text: 'Halo! Saya adalah Google Gemini AI siap membantu Anda.' }]
                },
                finishReason: 'STOP'
            }
        ],
        usageMetadata: {
            promptTokenCount: 25,
            candidatesTokenCount: 15
        }
    };
    let mockStatusCode = 200;
    let mockDelayMs = 0;
    let mockRequestCount = 0;
    let lastReceivedUrl = '';
    let lastReceivedBody = null;

    const mockServer = http.createServer(async (req, res) => {
        mockRequestCount++;
        lastReceivedUrl = req.url;
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try { lastReceivedBody = JSON.parse(body || '{}'); } catch {}
            if (mockDelayMs > 0) {
                await sleep(mockDelayMs);
            }
            res.writeHead(mockStatusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(mockResponse));
        });
    });

    const MOCK_PORT = 3999;
    await new Promise(res => mockServer.listen(MOCK_PORT, res));
    const mockBaseUrl = `http://localhost:${MOCK_PORT}`;

    try {
        const testConfig = {
            port: 3007,
            enabled: true,
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            geminiApiKey: 'TEST_SECRET_API_KEY_123456789',
            geminiBaseUrl: mockBaseUrl,
            dailyBudgetIDR: 1000,
            monthlyBudgetIDR: 25000,
            maxOutputTokens: 600,
            maxInputChars: 2000,
            cooldownSeconds: 2, // 2s for fast testing
            maxRequestsPerHour: 5,
            maxConcurrentRequests: 2,
            timeoutMs: 3000,
            usdToIdrRate: 16000,
            priceInputPerMUSD: null,
            priceOutputPerMUSD: null
        };

        // ----------------------------------------------------
        // TEST 1: Pricing and Cost Calculations
        // ----------------------------------------------------
        console.log('▶️ [TEST 1] Verifikasi Utilitas Pricing & Estimasi Biaya...');
        const pricing = getModelPricing('gemini-2.5-flash');
        assert.ok(pricing, 'Pricing gemini-2.5-flash harus ditemukan');
        assert.strictEqual(pricing.inputPerM, 0.30);
        assert.strictEqual(pricing.outputPerM, 2.50);

        const unknownPricing = getModelPricing('unknown-gpt-999');
        assert.strictEqual(unknownPricing, null, 'Model tak dikenal tidak boleh dianggap gratis');

        const cost = calculateCost({
            model: 'gemini-2.5-flash',
            inputTokens: 1000,
            outputTokens: 500,
            usdToIdrRate: 16000
        });
        assert.ok(cost.totalCostIdr > 0, 'Cost IDR harus bernilai positif');
        console.log(`   Biaya 1000 input & 500 output tokens: Rp ${cost.totalCostIdr}`);
        console.log('   ✅ TEST 1 PASSED: Perhitungan tarif akurat & model tak dikenal tidak dianggap gratis.');

        // ----------------------------------------------------
        // TEST 2: Storage Persistence
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 2] Verifikasi Persistensi Storage (Save, Load, Restart)...');
        const storage1 = new Storage(TEST_STORAGE_FILE);
        storage1.record({ inputTokens: 100, outputTokens: 50, costIdr: 15.5, success: true });

        // Simulate bot restart by creating fresh Storage instance on same file
        const storage2 = new Storage(TEST_STORAGE_FILE);
        assert.strictEqual(storage2.data.totalRequests, 1, 'Total requests harus bertahan setelah restart');
        assert.strictEqual(storage2.data.successfulRequests, 1, 'Success requests harus bertahan setelah restart');
        assert.strictEqual(storage2.data.totalInputTokens, 100, 'Input tokens harus tersimpan');
        assert.strictEqual(storage2.data.totalOutputTokens, 50, 'Output tokens harus tersimpan');
        assert.strictEqual(storage2.data.totalCostIdr, 15.5, 'Cost IDR harus tersimpan');
        console.log('   ✅ TEST 2 PASSED: Data penggunaan tersimpan di disk dan pulih setelah restart.');

        // ----------------------------------------------------
        // TEST 3: Command Routing (!ai help, !ai status, !ai usage)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 3] Verifikasi Command !ai, !ai status, !ai usage...');
        const budgetMgr = new BudgetManager({ storage: storage2, config: testConfig });
        const rateLimiter = new RateLimiter(testConfig);
        const aiService = new AiService({
            config: testConfig,
            storage: storage2,
            budgetManager: budgetMgr,
            rateLimiter
        });

        // 3a. !ai tanpa argumen
        const replyEmpty = await aiService.handleCommand({ command: '!ai', args: [], body: '!ai', senderId: '6281111' });
        assert.ok(replyEmpty.text.includes('RapBot AI Assistant'), 'Harus menampilkan panduan');
        assert.ok(replyEmpty.text.includes('!ai status'), 'Harus mencantumkan !ai status');

        // 3b. !ai status
        const replyStatus = await aiService.handleCommand({ command: '!ai', args: ['status'], body: '!ai status', senderId: '6281111' });
        assert.ok(replyStatus.text.includes('Status AI RapBot'), 'Harus menampilkan status');
        assert.ok(replyStatus.text.includes('gemini-2.5-flash'), 'Harus mencantumkan model');
        assert.ok(replyStatus.text.includes('****'), 'API key harus dimasking');
        assert.ok(!replyStatus.text.includes('TEST_SECRET_API_KEY_123456789'), 'API key mentah TIDAK BOLEH bocor');

        // 3c. !ai usage
        const replyUsage = await aiService.handleCommand({ command: '!ai', args: ['usage'], body: '!ai usage', senderId: '6281111' });
        assert.ok(replyUsage.text.includes('Statistik Penggunaan'), 'Harus menampilkan usage');
        assert.ok(replyUsage.text.includes('Catatan: Biaya merupakan batas estimasi aplikasi'), 'Harus mencantumkan disclaimer estimasi');
        console.log('   ✅ TEST 3 PASSED: Petunjuk, status, dan statistik berfungsi sempurna tanpa membocorkan API key.');

        // ----------------------------------------------------
        // TEST 4: Successful Question & Answer via Mock Provider
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 4] Verifikasi Tanya Jawab AI (!ai <pertanyaan>)...');
        mockResponse = {
            candidates: [{
                content: { parts: [{ text: 'Matahari terbit dari timur.' }] },
                finishReason: 'STOP'
            }],
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10 }
        };
        const replyQA = await aiService.handleCommand({
            command: '!ai',
            args: ['Dari', 'mana', 'matahari', 'terbit?'],
            body: '!ai Dari mana matahari terbit?',
            senderId: '628123456789'
        });
        assert.strictEqual(replyQA.type, 'reply');
        assert.strictEqual(replyQA.text, 'Matahari terbit dari timur.');
        assert.ok(lastReceivedUrl.includes('key=TEST_SECRET_API_KEY_123456789'), 'Harus memanggil endpoint mock');
        console.log('   Jawaban AI:', replyQA.text);
        console.log('   ✅ TEST 4 PASSED: !ai berhasil memanggil provider dan mengembalikan jawaban.');

        // ----------------------------------------------------
        // TEST 5: Per-User Cooldown Guard (5 detik / 2 detik di test)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 5] Menguji Cooldown Guard Per-User...');
        const replyCooldown = await aiService.handleCommand({
            command: '!ai',
            args: ['Pertanyaan', 'kedua', 'langsung'],
            body: '!ai Pertanyaan kedua langsung',
            senderId: '628123456789' // same sender immediately
        });
        assert.ok(replyCooldown.text.includes('Mohon tunggu'), 'Harus diblokir oleh jeda cooldown');
        console.log('   Respon cooldown:', replyCooldown.text);
        console.log('   ✅ TEST 5 PASSED: Request cepat dari user yang sama ditolak cooldown.');

        // ----------------------------------------------------
        // TEST 6: Per-User Hourly Rate Limit (max 5 per hour di test)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 6] Menguji Batas Maksimal Request Per Jam...');
        const spamSender = '628999888777';
        // Reset cooldown between calls for test user
        for (let i = 0; i < 5; i++) {
            rateLimiter.userCooldowns.delete(spamSender);
            const res = await aiService.handleCommand({
                command: '!ai',
                args: ['Test', `nomor ${i}`],
                body: `!ai Test nomor ${i}`,
                senderId: spamSender
            });
            assert.strictEqual(res.text, 'Matahari terbit dari timur.');
        }

        rateLimiter.userCooldowns.delete(spamSender);
        const replyHourlyLimit = await aiService.handleCommand({
            command: '!ai',
            args: ['Test', 'ke-6'],
            body: '!ai Test ke-6',
            senderId: spamSender
        });
        assert.ok(replyHourlyLimit.text.includes('Batas penggunaan tercapai'), 'Request ke-6 harus ditolak batas per jam');
        console.log('   Respon hourly limit:', replyHourlyLimit.text);
        console.log('   ✅ TEST 6 PASSED: Batas request per jam per user bekerja.');

        // ----------------------------------------------------
        // TEST 7: Global Concurrency Guard (max 2 concurrent)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 7] Menguji Batas Concurrency Global (Maks 2 Request Bersamaan)...');
        mockDelayMs = 400; // Slow down mock to simulate concurrent requests

        const promise1 = aiService.handleCommand({ command: '!ai', args: ['P1'], body: '!ai P1', senderId: 'user_A' });
        const promise2 = aiService.handleCommand({ command: '!ai', args: ['P2'], body: '!ai P2', senderId: 'user_B' });
        // Third concurrent request arrives while 1 & 2 are in-flight
        await sleep(50);
        const promise3 = aiService.handleCommand({ command: '!ai', args: ['P3'], body: '!ai P3', senderId: 'user_C' });

        const [r1, r2, r3] = await Promise.all([promise1, promise2, promise3]);
        mockDelayMs = 0;

        assert.strictEqual(r1.text, 'Matahari terbit dari timur.');
        assert.strictEqual(r2.text, 'Matahari terbit dari timur.');
        assert.ok(r3.text.includes('kapasitas maksimal'), 'Request ke-3 harus ditolak batas concurrency');
        console.log('   Respon concurrency limit:', r3.text);
        console.log('   ✅ TEST 7 PASSED: Maksimal 2 request diproses bersamaan.');

        // ----------------------------------------------------
        // TEST 8: Daily Budget Guard Rejection
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 8] Menguji Budget Guard Harian...');
        const lowBudgetConfig = { ...testConfig, dailyBudgetIDR: 20 }; // Very low budget
        const lowBudgetMgr = new BudgetManager({ storage: storage2, config: lowBudgetConfig });
        const lowBudgetService = new AiService({
            config: lowBudgetConfig,
            storage: storage2,
            budgetManager: lowBudgetMgr,
            rateLimiter: new RateLimiter(lowBudgetConfig)
        });

        // Set storage spent to 20 IDR
        const dailyStats = storage2.getDailyStats();
        dailyStats.costIdr = 25; // Exceeded
        const replyBudgetExceeded = await lowBudgetService.handleCommand({
            command: '!ai',
            args: ['Halo'],
            body: '!ai Halo',
            senderId: 'user_budget_test'
        });
        assert.ok(replyBudgetExceeded.text.includes('budget harian AI'), 'Harus ditolak budget guard');
        console.log('   Respon budget harian habis:', replyBudgetExceeded.text);
        console.log('   ✅ TEST 8 PASSED: Request ditolak saat budget harian habis.');

        // ----------------------------------------------------
        // TEST 9: Concurrent Requests Cannot Bypass Budget Guard
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 9] Verifikasi Request Bersamaan Tidak Menembus Budget...');
        // Remaining budget allows exactly 1 request (estimated ~30 IDR worst case)
        const budgetGuardTestConfig = { ...testConfig, dailyBudgetIDR: 45 };
        const tightStorage = new Storage(path.join(TEST_DATA_DIR, 'tight-usage.json'));
        const tightBudgetMgr = new BudgetManager({ storage: tightStorage, config: budgetGuardTestConfig });
        const tightRateLimiter = new RateLimiter(budgetGuardTestConfig);
        const tightService = new AiService({
            config: budgetGuardTestConfig,
            storage: tightStorage,
            budgetManager: tightBudgetMgr,
            rateLimiter: tightRateLimiter
        });

        mockDelayMs = 300;
        const cReq1 = tightService.handleCommand({ command: '!ai', args: ['A'], body: '!ai A', senderId: 'user_c1' });
        await sleep(30);
        // Second concurrent request should be blocked by budget reservation of req1
        const cReq2 = tightService.handleCommand({ command: '!ai', args: ['B'], body: '!ai B', senderId: 'user_c2' });

        const [resC1, resC2] = await Promise.all([cReq1, cReq2]);
        mockDelayMs = 0;

        assert.strictEqual(resC1.text, 'Matahari terbit dari timur.');
        assert.ok(resC2.text.includes('budget harian AI'), 'Request ke-2 harus diblokir oleh reservasi budget');
        console.log('   Respon reservasi budget bersamaan:', resC2.text);
        console.log('   ✅ TEST 9 PASSED: Budget reservation mencegah request paralel melompat budget.');

        // ----------------------------------------------------
        // TEST 10: Missing API Key Handling (Graceful Error, No Crash)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 10] Menguji Penanganan API Key Kosong...');
        const noKeyConfig = { ...testConfig, geminiApiKey: '' };
        const noKeyService = new AiService({
            config: noKeyConfig,
            storage: storage2,
            budgetManager: new BudgetManager({ storage: storage2, config: noKeyConfig }),
            rateLimiter: new RateLimiter(noKeyConfig)
        });
        const replyNoKey = await noKeyService.handleCommand({
            command: '!ai',
            args: ['Halo'],
            body: '!ai Halo',
            senderId: 'user_nokey'
        });
        assert.ok(replyNoKey.text.includes('API Key belum dikonfigurasi'), 'Harus memberikan pesan jelas tanpa crash');
        console.log('   Respon API Key kosong:', replyNoKey.text);
        console.log('   ✅ TEST 10 PASSED: API key kosong ditangani dengan pesan informatif tanpa crash.');

        // ----------------------------------------------------
        // TEST 11: Retry on Transient Error (HTTP 429 / 503)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 11] Menguji Retry Terbatas pada Error Sementara (429/503)...');
        let callCount = 0;
        mockServer.removeAllListeners('request');
        mockServer.on('request', (req, res) => {
            callCount++;
            if (callCount === 1) {
                // First call fails with 429
                res.writeHead(429, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Quota temporarily exceeded' } }));
            } else {
                // Retry succeeds
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(mockResponse));
            }
        });

        const retryRateLimiter = new RateLimiter(testConfig);
        const retryService = new AiService({
            config: testConfig,
            storage: storage2,
            budgetManager: new BudgetManager({ storage: storage2, config: testConfig }),
            rateLimiter: retryRateLimiter
        });

        const replyRetry = await retryService.handleCommand({
            command: '!ai',
            args: ['Coba', 'retry'],
            body: '!ai Coba retry',
            senderId: 'user_retry'
        });
        assert.strictEqual(replyRetry.text, 'Matahari terbit dari timur.');
        assert.strictEqual(callCount, 2, 'Harus melakukan retry tepat 1 kali');
        console.log('   Berhasil pulih pada percobaan ke-2!');
        console.log('   ✅ TEST 11 PASSED: Retry terbatas berhasil memulihkan koneksi tanpa intervensi user.');

        // ----------------------------------------------------
        // TEST 12: Input Length Exceeded Guard
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 12] Menguji Pembatasan Panjang Karakter Input...');
        const longQuestion = 'a'.repeat(2500); // Exceeds 2000 chars limit
        const replyLong = await aiService.handleCommand({
            command: '!ai',
            args: [longQuestion],
            body: `!ai ${longQuestion}`,
            senderId: 'user_long'
        });
        assert.ok(replyLong.text.includes('terlalu panjang'), 'Harus menolak teks melebihi batas');
        console.log('   Respon input panjang:', replyLong.text);
        console.log('   ✅ TEST 12 PASSED: Pertanyaan > 2000 karakter ditolak secara sopan.');

        // ----------------------------------------------------
        // TEST 13: HTTP Server Protocol (/health, /manifest, /command)
        // ----------------------------------------------------
        console.log('\n▶️ [TEST 13] Menguji Kontrak HTTP Server Standar RapBot Extension...');
        const { server: aiServer } = createServer({ ...testConfig, port: 3099 });
        await new Promise(res => aiServer.listen(3099, res));

        try {
            // GET /health
            const resHealth = await fetch('http://localhost:3099/health');
            const jsonHealth = await resHealth.json();
            assert.strictEqual(jsonHealth.status, 'ok');
            assert.strictEqual(jsonHealth.id, 'ai');

            // GET /manifest
            const resManifest = await fetch('http://localhost:3099/manifest');
            const jsonManifest = await resManifest.json();
            assert.strictEqual(jsonManifest.id, 'ai');
            assert.strictEqual(jsonManifest.commands[0].name, 'ai');

            // POST /command
            const resCmd = await fetch('http://localhost:3099/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: '!ai',
                    args: ['status'],
                    body: '!ai status',
                    senderId: '628123456789'
                })
            });
            const jsonCmd = await resCmd.json();
            assert.strictEqual(jsonCmd.type, 'reply');
            assert.ok(jsonCmd.text.includes('Status AI RapBot'));

            console.log('   GET /health -> 200 OK');
            console.log('   GET /manifest -> 200 OK');
            console.log('   POST /command -> 200 OK');
            console.log('   ✅ TEST 13 PASSED: Server mematuhi protokol HTTP Extension RapBot.');
        } finally {
            await new Promise(res => aiServer.close(res));
        }

        console.log('\n🎉 =========================================================');
        console.log('🎉 SEMUA PENGUJIAN UNIT & INTEGRASI AI (13/13) BERHASIL 100%!');
        console.log('🎉 =========================================================\n');
    } finally {
        mockServer.close();
        cleanupTestData();
    }
}

if (require.main === module) {
    runTests().catch(err => {
        console.error('❌ PENGUJIAN GAGAL:', err);
        process.exit(1);
    });
}

module.exports = { runTests };
