// test-poc.js - Automated Test for Extension System Proof of Concept
const { spawn } = require('child_process');
const path = require('path');
const { loadCommands } = require('./core/whatsapp/messageHandler');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
    console.log('🧪 ===============================================');
    console.log('🧪 MEMULAI TEST EXTENSION SYSTEM PROOF OF CONCEPT');
    console.log('🧪 ===============================================\n');

    let kostProcess = null;

    try {
        // STEP 1: Start Kost Server
        console.log('▶️ [TEST 1] Menjalankan Kost Server terpisah (Port 3005)...');
        kostProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', 'Kost'),
            stdio: 'pipe'
        });

        kostProcess.stdout.on('data', d => console.log(`   [Kost stdout] ${d.toString().trim()}`));
        kostProcess.stderr.on('data', d => console.error(`   [Kost stderr] ${d.toString().trim()}`));

        // Wait for server to listen
        await sleep(1000);

        // Verify health check
        const healthRes = await fetch('http://localhost:3005/health');
        const healthJson = await healthRes.json();
        console.log('   ✅ Kost Health check OK:', healthJson);

        // STEP 2: Load Commands in RapBot Core
        console.log('\n▶️ [TEST 2] RapBot Core me-load command registry (termasuk Extension Manager)...');
        const registry = loadCommands();
        const kostCmd = registry.get('kost');

        if (!kostCmd) {
            throw new Error('❌ Command !kost tidak ditemukan di registry RapBot!');
        }
        console.log(`   ✅ Command !kost berhasil didaftarkan sebagai External Extension:`, {
            name: kostCmd.name,
            isExtension: kostCmd.isExtension,
            extensionInfo: kostCmd.extensionInfo
        });

        // STEP 3: Execute !kost through RapBot Command Context
        console.log('\n▶️ [TEST 3] Mensimulasikan pesan WhatsApp "!kost" ke RapBot...');
        let replyOutput = null;
        const mockContext = {
            command: 'kost',
            args: [],
            from: '628123456789@s.whatsapp.net',
            senderNumber: '628123456789',
            isGroup: false,
            body: '!kost',
            reply: async (text) => {
                replyOutput = text;
                console.log('   📨 [MOCK WHATSAPP OUTPUT DITERIMA RAPBOT]:\n' + text);
            }
        };

        await kostCmd.execute(mockContext);

        if (!replyOutput || !replyOutput.includes('STANDALONE EXTENSION POC')) {
            throw new Error('❌ Respon dari Kost tidak sesuai ekspektasi!');
        }
        console.log('   ✅ Respon !kost dari Kost Server berhasil diterima dan diteruskan ke mock WhatsApp reply!');

        // STEP 4: Test Decoupling & Graceful Failure when Kost is Offline
        console.log('\n▶️ [TEST 4] Menghentikan (Kill) Kost Server dan menguji ketahanan RapBot saat offline...');
        kostProcess.kill('SIGTERM');
        await sleep(1000);

        console.log('   Testing eksekusi !kost saat Kost offline...');
        let offlineReply = null;
        const mockOfflineContext = {
            command: 'kost',
            args: [],
            from: '628123456789@s.whatsapp.net',
            senderNumber: '628123456789',
            isGroup: false,
            body: '!kost',
            reply: async (text) => {
                offlineReply = text;
                console.log('   📨 [MOCK WHATSAPP OFFLINE OUTPUT]:\n' + text);
            }
        };

        await kostCmd.execute(mockOfflineContext);

        if (!offlineReply || !offlineReply.includes('tidak tersedia')) {
            throw new Error('❌ Penanganan offline Kost tidak graceful!');
        }
        console.log('   ✅ RapBot tidak crash dan mengembalikan pesan graceful error ke user saat Kost offline!');

        // STEP 5: Re-start Kost and Test Recovery
        console.log('\n▶️ [TEST 5] Menghidupkan kembali Kost Server dan menguji recovery...');
        kostProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', 'Kost'),
            stdio: 'pipe'
        });
        kostProcess.stdout.on('data', d => console.log(`   [Kost stdout] ${d.toString().trim()}`));
        await sleep(1000);

        let recoverReply = null;
        const mockRecoverContext = {
            command: 'kost',
            args: [],
            from: '628123456789@s.whatsapp.net',
            senderNumber: '628123456789',
            isGroup: false,
            body: '!kost',
            reply: async (text) => {
                recoverReply = text;
                console.log('   📨 [MOCK WHATSAPP RECOVER OUTPUT]:\n' + text);
            }
        };

        await kostCmd.execute(mockRecoverContext);

        if (!recoverReply || !recoverReply.includes('STANDALONE EXTENSION POC')) {
            throw new Error('❌ Recovery setelah Kost online kembali gagal!');
        }
        console.log('   ✅ RapBot otomatis berhasil berkomunikasi kembali dengan Kost Server!');

        console.log('\n🎉 ===============================================');
        console.log('🎉 SEMUA TEST PROOF OF CONCEPT BERHASIL 100%!');
        console.log('🎉 ===============================================\n');
    } catch (err) {
        console.error('\n❌ TEST GAGAL:', err);
        process.exitCode = 1;
    } finally {
        if (kostProcess) {
            kostProcess.kill('SIGTERM');
        }
    }
}

runTests();
