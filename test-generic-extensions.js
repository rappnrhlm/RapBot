// test-generic-extensions.js - Genericity & Multi-Extension Test Suite
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { loadCommands } = require('./core/whatsapp/messageHandler');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runGenericityTests() {
    console.log('🧪 =========================================================');
    console.log('🧪 MEMULAI TEST GENERISITAS ARSITEKTUR EXTENSION RAPBOT');
    console.log('🧪 =========================================================\n');

    let kostProcess = null;
    let exampleProcess = null;

    const configPath = path.join(__dirname, 'config', 'extensions.json');
    const originalConfig = fs.readFileSync(configPath, 'utf8');

    try {
        // Prepare config with both Kost and Example Extension
        const fullConfig = [
            {
                id: 'kost',
                name: 'Bukittinggi Kos',
                endpoint: 'http://localhost:3005',
                enabled: true,
                version: '1.0.0',
                commands: [
                    { name: 'kost', aliases: ['kos'], description: 'Listing kos', category: 'bukittinggi-kos' },
                    { name: 'cari', aliases: ['carikost'], description: 'Cari kos', category: 'bukittinggi-kos' }
                ]
            },
            {
                id: 'example',
                name: 'Example Extension',
                endpoint: 'http://localhost:3006',
                enabled: true,
                version: '1.0.0',
                commands: [
                    { name: 'hello', aliases: ['hi', 'halo'], description: 'Greeting from example extension', category: 'example' }
                ]
            }
        ];
        fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf8');

        // Start Kost Server
        console.log('▶️ [SETUP 1] Menjalankan Standalone Kost Server (:3005)...');
        kostProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', 'Kost'),
            stdio: 'pipe'
        });
        kostProcess.stdout.on('data', d => console.log(`   [Kost stdout] ${d.toString().trim()}`));

        // Start Example Server
        console.log('▶️ [SETUP 2] Menjalankan Example Extension Server (:3006)...');
        exampleProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, 'extensions', 'example'),
            stdio: 'pipe'
        });
        exampleProcess.stdout.on('data', d => console.log(`   [Example stdout] ${d.toString().trim()}`));
        await sleep(1500);

        // Helper to execute commands through RapBot messageHandler registry
        async function execCommand(command, registry, sender = '628123456789') {
            const cmd = registry.get(command);
            if (!cmd) throw new Error(`Command !${command} tidak ditemukan di registry`);

            let lastReply = null;
            const sentMessages = [];

            const mockContext = {
                sock: {
                    user: { id: '6285195532009:1@s.whatsapp.net' },
                    sendMessage: async (target, content) => {
                        sentMessages.push({ target, content });
                    }
                },
                command,
                args: [],
                from: '120363000000000000@g.us',
                senderNumber: sender,
                isGroup: true,
                isOwner: true,
                body: `!${command}`,
                services: {
                    database: {
                        isOwner: () => true,
                        getGroupById: () => ({ id: '120363000000000000@g.us', name: 'Test Group', role: 'admin' })
                    }
                },
                utils: {
                    jid: { normalizeJid: j => j }
                },
                reply: async (text) => {
                    lastReply = text;
                }
            };

            await cmd.execute(mockContext);
            return { reply: lastReply, sentMessages };
        }

        // ==========================================
        // TEST A: Kost aktif -> !kost bekerja
        // ==========================================
        console.log('\n▶️ [TEST A] Menguji Kost aktif (!kost)...');
        let registry = loadCommands();
        const resA = await execCommand('kost', registry);
        console.log('   Hasil !kost:', resA.reply?.slice(0, 50).replace(/\n/g, ' ') + '...');
        if (!resA.reply || !resA.reply.includes('DAFTAR KOST')) {
            throw new Error('TEST A Gagal: !kost tidak merespons dengan benar');
        }
        console.log('   ✅ TEST A PASSED: Kost Extension berhasil merespons.');

        // ==========================================
        // TEST B: Example aktif -> !hello bekerja
        // ==========================================
        console.log('\n▶️ [TEST B] Menguji Example Extension aktif (!hello)...');
        const resB = await execCommand('hello', registry);
        console.log('   Hasil !hello:', resB.reply);
        if (!resB.reply || !resB.reply.includes('Hello from Example Extension!')) {
            throw new Error('TEST B Gagal: !hello tidak mengembalikan output yang diharapkan');
        }
        console.log('   ✅ TEST B PASSED: Example Extension berhasil merespons generic command.');

        // ==========================================
        // TEST C: Kost offline -> Core tetap hidup
        // ==========================================
        console.log('\n▶️ [TEST C] Menguji Kost offline...');
        kostProcess.kill('SIGTERM');
        await sleep(1000);

        const resC = await execCommand('kost', registry);
        console.log('   Hasil saat Kost offline:', resC.reply);
        if (!resC.reply || !resC.reply.includes('tidak tersedia')) {
            throw new Error('TEST C Gagal: RapBot tidak merespons error offline secara graceful');
        }
        console.log('   ✅ TEST C PASSED: Core tetap hidup & menangani Kost offline dengan graceful.');

        // ==========================================
        // TEST D: Example offline -> Core tetap hidup
        // ==========================================
        console.log('\n▶️ [TEST D] Menguji Example Extension offline...');
        exampleProcess.kill('SIGTERM');
        await sleep(1000);

        const resD = await execCommand('hello', registry);
        console.log('   Hasil saat Example offline:', resD.reply);
        if (!resD.reply || !resD.reply.includes('tidak tersedia')) {
            throw new Error('TEST D Gagal: RapBot tidak merespons error offline secara graceful');
        }
        console.log('   ✅ TEST D PASSED: Core tetap hidup & menangani Example offline dengan graceful.');

        // ==========================================
        // TEST E: Disable Example -> !hello tidak terdaftar
        // ==========================================
        console.log('\n▶️ [TEST E] Menonaktifkan Example Extension (enabled: false)...');
        fullConfig[1].enabled = false;
        fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf8');

        registry = loadCommands();
        const helloCmd = registry.get('hello');
        if (helloCmd) {
            throw new Error('TEST E Gagal: Command !hello masih terdaftar padahal extension di-disable!');
        }
        console.log('   ✅ TEST E PASSED: Command !hello tidak terdaftar saat extension di-disable.');

        // ==========================================
        // TEST F: Restart/Reload -> Registry kembali dimuat
        // ==========================================
        console.log('\n▶️ [TEST F] Menghidupkan kembali konfigurasi & reload registry...');
        fullConfig[1].enabled = true;
        fs.writeFileSync(configPath, JSON.stringify(fullConfig, null, 2), 'utf8');

        registry = loadCommands();
        const reloadedHello = registry.get('hello');
        if (!reloadedHello) {
            throw new Error('TEST F Gagal: Command !hello gagal dimuat kembali setelah re-enable!');
        }
        console.log('   ✅ TEST F PASSED: Registry berhasil dimuat ulang dengan sempurna.');

        console.log('\n🎉 =========================================================');
        console.log('🎉 SEMUA TEST GENERISITAS (TEST A s/d F) BERHASIL 100%!');
        console.log('🎉 =========================================================\n');
    } catch (err) {
        console.error('\n❌ PENGUJIAN GENERISITAS GAGAL:', err);
        process.exitCode = 1;
    } finally {
        if (kostProcess) kostProcess.kill('SIGTERM');
        if (exampleProcess) exampleProcess.kill('SIGTERM');
        fs.writeFileSync(configPath, originalConfig, 'utf8');
    }
}

runGenericityTests();

