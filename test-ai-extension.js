// test-ai-extension.js - Full End-to-End Integration Test for RapBot AI Extension
const http = require('http');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { loadCommands } = require('./core/whatsapp/messageHandler');
const { createServer } = require('./extensions/ai/server');

async function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function runEndToEndTests() {
    console.log('🧪 =========================================================');
    console.log('🧪 PENGUJIAN END-TO-END RAPBOT CORE + AI EXTENSION');
    console.log('🧪 =========================================================\n');

    // 1. Setup Mock Gemini Server
    let mockResponse = {
        candidates: [{
            content: { parts: [{ text: 'Halo dari Google Gemini AI! Saya terhubung ke RapBot.' }] },
            finishReason: 'STOP'
        }],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 12 }
    };

    const mockServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(mockResponse));
    });
    const MOCK_PORT = 3998;
    await new Promise(res => mockServer.listen(MOCK_PORT, res));

    // 2. Setup AI Extension Server on port 3007
    const testConfig = {
        port: 3007,
        enabled: true,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        geminiApiKey: 'MOCK_KEY_E2E_SECRET',
        geminiBaseUrl: `http://localhost:${MOCK_PORT}`,
        dailyBudgetIDR: 1000,
        monthlyBudgetIDR: 25000,
        maxOutputTokens: 600,
        maxInputChars: 2000,
        cooldownSeconds: 1,
        maxRequestsPerHour: 10,
        maxConcurrentRequests: 2,
        timeoutMs: 5000,
        usdToIdrRate: 16000,
        priceInputPerMUSD: null,
        priceOutputPerMUSD: null
    };

    const { server: aiServer } = createServer(testConfig);
    await new Promise(res => aiServer.listen(3007, res));
    console.log('▶️ [SETUP] AI Extension Server berjalan di http://localhost:3007');

    try {
        // 3. Load RapBot Command Registry
        console.log('\n▶️ [STEP 1] Memuat Command Registry RapBot...');
        const registry = loadCommands();

        // 4. Verify AI command is registered
        const aiCmd = registry.get('ai');
        assert.ok(aiCmd, 'Command !ai harus terdaftar di registry RapBot!');
        assert.strictEqual(aiCmd.isExtension, true, 'Command !ai harus ditandai sebagai isExtension: true');
        assert.strictEqual(aiCmd.extensionInfo.id, 'ai', 'Extension ID harus "ai"');
        console.log('   ✅ STEP 1 PASSED: Command !ai berhasil didaftarkan ke Core RapBot.');

        // 5. Verify existing extension commands (Kost, etc.) remain intact
        const kostCmd = registry.get('kost');
        assert.ok(kostCmd, 'Command !kost dari extension Kost harus tetap ada');
        const pingCmd = registry.get('ping');
        assert.ok(pingCmd, 'Command Core !ping harus tetap ada');
        console.log('   ✅ STEP 2 PASSED: Extension Kost dan command core lainnya tetap utuh & terdaftar.');

        // 6. Helper to simulate WhatsApp execution via Context
        async function execCommand(cmdName, args, body, senderNumber = '628123456789') {
            const cmd = registry.get(cmdName);
            let replyText = null;
            const mockContext = {
                sock: {
                    user: { id: '6285195532009:1@s.whatsapp.net' }
                },
                command: cmdName,
                args,
                from: '120363000000000000@g.us',
                senderNumber,
                isGroup: true,
                isOwner: false,
                body,
                services: {
                    database: {
                        isOwner: () => false,
                        getGroupById: () => ({ id: '120363000000000000@g.us', name: 'Komunitas Grup' })
                    }
                },
                utils: {
                    jid: { normalizeJid: j => j }
                },
                reply: async (text) => {
                    replyText = text;
                }
            };

            await cmd.execute(mockContext);
            return replyText;
        }

        // 7. Test WhatsApp Q&A execution
        console.log('\n▶️ [STEP 3] Simulasi Chat WhatsApp: "!ai halo siapa kamu?"...');
        const replyQA = await execCommand('ai', ['halo', 'siapa', 'kamu?'], '!ai halo siapa kamu?');
        console.log('   Balasan WhatsApp:', replyQA);
        assert.ok(replyQA.includes('Halo dari Google Gemini AI!'), 'Balasan harus sesuai respon AI');
        console.log('   ✅ STEP 3 PASSED: Core RapBot berhasil membalas chat WhatsApp dengan jawaban AI.');

        // 8. Test !ai status via WhatsApp
        console.log('\n▶️ [STEP 4] Simulasi Chat WhatsApp: "!ai status"...');
        await sleep(1100); // Wait 1.1s for cooldown
        const replyStatus = await execCommand('ai', ['status'], '!ai status');
        console.log('   Balasan WhatsApp:', replyStatus);
        assert.ok(replyStatus.includes('Status AI RapBot'), 'Harus menampilkan status');
        assert.ok(replyStatus.includes('gemini-2.5-flash'), 'Harus menampilkan model');
        assert.ok(!replyStatus.includes('MOCK_KEY_E2E_SECRET'), 'API key mentah tidak boleh bocor');
        console.log('   ✅ STEP 4 PASSED: !ai status membalas status tanpa membocorkan API key.');

        // 9. Test !ai usage via WhatsApp
        console.log('\n▶️ [STEP 5] Simulasi Chat WhatsApp: "!ai usage"...');
        await sleep(1100);
        const replyUsage = await execCommand('ai', ['usage'], '!ai usage');
        console.log('   Balasan WhatsApp:', replyUsage);
        assert.ok(replyUsage.includes('Statistik Penggunaan'), 'Harus menampilkan statistik penggunaan');
        assert.ok(replyUsage.includes('Token:'), 'Harus menampilkan rincian token');
        console.log('   ✅ STEP 5 PASSED: !ai usage membalas statistik dan estimasi biaya.');

        // 10. Test Offline Resilience (Extension Server Crash / Stopped)
        console.log('\n▶️ [STEP 6] Menguji Fault Tolerance saat AI Extension Offline...');
        await new Promise(res => aiServer.close(res)); // Stop AI server
        const replyOffline = await execCommand('ai', ['Halo?'], '!ai Halo?');
        console.log('   Balasan saat Offline:', replyOffline);
        assert.ok(replyOffline.includes('sedang tidak tersedia'), 'Harus membalas graceful offline tanpa crash');
        console.log('   ✅ STEP 6 PASSED: Core RapBot tetap tangguh saat AI Extension offline.');

        console.log('\n🎉 =========================================================');
        console.log('🎉 SELURUH PENGUJIAN END-TO-END (6/6) SUKSES 100%!');
        console.log('🎉 =========================================================\n');
    } finally {
        mockServer.close();
        try { aiServer.close(); } catch {}
    }
}

runEndToEndTests()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ E2E PENGUJIAN GAGAL:', err);
        process.exit(1);
    });
