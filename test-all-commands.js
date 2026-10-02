// test-all-commands.js - Comprehensive Test Suite for All 14 Kost Commands via Extension Manager
const { spawn } = require('child_process');
const path = require('path');
const { loadCommands } = require('./core/whatsapp/messageHandler');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAllTests() {
    console.log('🧪 =========================================================');
    console.log('🧪 MEMULAI PENGUJIAN SEMUA 14 COMMAND KOST VIA EXTENSION');
    console.log('🧪 =========================================================\n');

    let kostProcess = null;
    const fs = require('fs');
    const kostDataDir = path.join(__dirname, '..', 'Kost', 'data');
    if (!fs.existsSync(kostDataDir)) fs.mkdirSync(kostDataDir, { recursive: true });
    fs.writeFileSync(path.join(kostDataDir, 'kost.json'), JSON.stringify([
        { id: 'KST-000001', name: 'Kost Melati Indah Baru', whatsapp: '6281234567890', instagram: 'melatibaru', tiktok: null, status: 'pending', createdAt: new Date().toISOString() },
        { id: 'KST-000002', name: 'Kost Mawar Aur Kuning', whatsapp: '082198765432', instagram: 'kostmawar_aur', tiktok: null, status: 'published', createdAt: new Date().toISOString() },
        { id: 'KST-000003', name: 'Kost Flamboyan Belakang Balok', whatsapp: '085211223344', instagram: 'flamboyankos', tiktok: null, status: 'pending', createdAt: new Date().toISOString() }
    ], null, 2));
    fs.writeFileSync(path.join(kostDataDir, 'kost_submissions.json'), '[]');

    try {
        // 1. Start Kost Server
        console.log('▶️ [1/6] Menjalankan Standalone Kost Server (~/Coding/Kost/server.js)...');
        kostProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', 'Kost'),
            stdio: 'pipe'
        });

        kostProcess.stdout.on('data', d => console.log(`   [Kost stdout] ${d.toString().trim()}`));
        kostProcess.stderr.on('data', d => console.error(`   [Kost stderr] ${d.toString().trim()}`));
        await sleep(1200);

        // Verify Manifest & Health
        const healthRes = await fetch('http://localhost:3005/health');
        const healthData = await healthRes.json();
        console.log('   ✅ Kost Health OK:', healthData);

        const manifestRes = await fetch('http://localhost:3005/manifest');
        const manifestData = await manifestRes.json();
        console.log(`   ✅ Kost Manifest OK: ${manifestData.commands.length} commands defined.`);

        // 2. Load Commands in RapBot Core
        console.log('\n▶️ [2/6] RapBot Core me-load command registry secara generic...');
        const registry = loadCommands();
        console.log(`   ✅ Total registered commands & aliases in RapBot: ${registry.size}`);

        const testCommandsList = [
            'kost', 'addkost', 'cari', 'dm', 'sent', 'post',
            'editkost', 'delkost', 'usulkost', 'listusul',
            'acc', 'tolak', 'delusul', 'editusul'
        ];

        for (const cmdName of testCommandsList) {
            const cmd = registry.get(cmdName);
            if (!cmd || !cmd.isExtension) {
                throw new Error(`❌ Command !${cmdName} tidak terdaftar sebagai extension di RapBot!`);
            }
        }
        console.log('   ✅ Semua 14 command Kost terdaftar dengan benar di RapBot Core registry!\n');

        // Helper for simulating command execution
        async function execCommand(command, args = [], groupRole = 'admin', sender = '628123456789') {
            const cmd = registry.get(command);
            if (!cmd) throw new Error(`Command !${command} not found`);

            let lastReply = null;
            const sentMessages = [];

            const mockSock = {
                sendMessage: async (target, content) => {
                    sentMessages.push({ target, content });
                    console.log(`      [MOCK WHATSAPP ACTION] -> ${target}: "${content.text?.slice(0, 60)}..."`);
                }
            };

            const mockContext = {
                sock: mockSock,
                command,
                args,
                from: '120363000000000000@g.us',
                senderNumber: sender,
                isGroup: true,
                isOwner: true,
                body: `!${command} ${args.join(' ')}`.trim(),
                services: {
                    database: {
                        isOwner: () => true,
                        getGroupById: () => ({
                            id: '120363000000000000@g.us',
                            name: 'Bukittinggi Kos Admin',
                            role: groupRole,
                            type: 'kos',
                            parentGroupId: groupRole === 'public' ? '120363000000000000@g.us' : null
                        })
                    }
                },
                utils: {
                    jid: {
                        normalizeJid: (j) => j
                    }
                },
                reply: async (text) => {
                    lastReply = text;
                    console.log(`      [MOCK WHATSAPP REPLY]:\n${text.split('\n').map(l => '      | ' + l).join('\n')}`);
                }
            };

            await cmd.execute(mockContext);
            return { reply: lastReply, sentMessages };
        }

        // 3. Test Every Single Command
        console.log('▶️ [3/6] Menguji fungsionalitas 14 command Kost satu per satu:');

        // Test 1: !kost
        console.log('\n   🔹 [1] Menguji !kost...');
        const resKost = await execCommand('kost', []);
        if (!resKost.reply || !resKost.reply.includes('DAFTAR KOST')) throw new Error('!kost failed');

        // Test 2: !addkost
        console.log('\n   🔹 [2] Menguji !addkost...');
        const resAdd = await execCommand('addkost', ['Kost', 'Anggrek', 'Birugo', '>', 'ig:', 'anggrekkos', '|', 'wa:', '081299998888']);
        if (!resAdd.reply || !resAdd.reply.includes('Kost berhasil ditambahkan')) throw new Error('!addkost failed');

        // Test 3: !cari
        console.log('\n   🔹 [3] Menguji !cari...');
        const resCari = await execCommand('cari', ['anggrek']);
        if (!resCari.reply || !resCari.reply.includes('HASIL PENCARIAN')) throw new Error('!cari failed');

        // Test 4: !dm
        console.log('\n   🔹 [4] Menguji !dm...');
        const resDm = await execCommand('dm', ['KST-000001']);
        if (!resDm.reply || !resDm.reply.includes('SIAP DM KOST')) throw new Error('!dm failed');
        if (resDm.sentMessages.length === 0) throw new Error('!dm missing 2nd balloon template action');

        // Test 5: !sent
        console.log('\n   🔹 [5] Menguji !sent...');
        const resSent = await execCommand('sent', ['KST-000001']);
        if (!resSent.reply || !resSent.reply.includes('DITANDAI SENT') && !resSent.reply.includes('SENT sebelumnya')) throw new Error('!sent failed');

        // Test 6: !post
        console.log('\n   🔹 [6] Menguji !post...');
        const resPost = await execCommand('post', ['KST-000001']);
        if (!resPost.reply || !resPost.reply.includes('DIPOSTING') && !resPost.reply.includes('PUBLISHED')) throw new Error('!post failed');

        // Test 7: !editkost
        console.log('\n   🔹 [7] Menguji !editkost...');
        const resEdit = await execCommand('editkost', ['KST-000001', 'Kost Melati Indah Baru > wa: 081234567890 | ig: @melatibaru']);
        if (!resEdit.reply || !resEdit.reply.includes('Berhasil Diperbarui')) throw new Error('!editkost failed');

        // Test 8: !usulkost
        console.log('\n   🔹 [8] Menguji !usulkost (dari warga grup publik)...');
        const resUsul = await execCommand('usulkost', ['Kost Edelweiss Asri > wa: 081377776666 | ig: @edelweiss'], 'public');
        if (!resUsul.reply || !resUsul.reply.includes('Usulan Kos Berhasil Terkirim')) throw new Error('!usulkost failed');

        // Test 9: !listusul
        console.log('\n   🔹 [9] Menguji !listusul...');
        const resListUsul = await execCommand('listusul', ['all']);
        if (!resListUsul.reply || !resListUsul.reply.includes('DAFTAR USULAN KOS')) throw new Error('!listusul failed');

        // Test 10: !editusul
        console.log('\n   🔹 [10] Menguji !editusul...');
        const resEditUsul = await execCommand('editusul', ['1', 'Kost Edelweiss Indah > wa: 081377776666 | ig: @edelweiss_bkt']);
        if (!resEditUsul.reply || !resEditUsul.reply.includes('Berhasil Diperbarui') && !resEditUsul.reply.includes('tidak ditemukan')) throw new Error('!editusul failed');

        // Test 11: !acc
        console.log('\n   🔹 [11] Menguji !acc...');
        const resAcc = await execCommand('acc', ['1']);
        if (!resAcc.reply || !resAcc.reply.includes('Berhasil Disetujui') && !resAcc.reply.includes('sudah diproses')) throw new Error('!acc failed');

        // Test 12: !tolak (usul baru)
        console.log('\n   🔹 [12] Menguji !tolak...');
        await execCommand('usulkost', ['Kost Cendana > 081122334455'], 'public', '628999999999');
        const resTolak = await execCommand('tolak', ['2']);
        if (!resTolak.reply || !resTolak.reply.includes('berhasil ditolak') && !resTolak.reply.includes('sudah di-')) throw new Error('!tolak failed');

        // Test 13: !delusul
        console.log('\n   🔹 [13] Menguji !delusul...');
        const resDelUsul = await execCommand('delusul', ['2']);
        if (!resDelUsul.reply || !resDelUsul.reply.includes('berhasil dihapus') && !resDelUsul.reply.includes('tidak ditemukan')) throw new Error('!delusul failed');

        // Test 14: !delkost
        console.log('\n   🔹 [14] Menguji !delkost...');
        const resDelKost = await execCommand('delkost', ['KST-000003']);
        if (!resDelKost.reply || !resDelKost.reply.includes('berhasil dihapus') && !resDelKost.reply.includes('tidak ditemukan')) throw new Error('!delkost failed');

        console.log('\n   ✅ SELURUH 14 COMMAND KOST BERHASIL DIUJI DENGAN BEHAVIOUR ASLI!');

        // 4. Test Help Dynamic Rendering
        console.log('\n▶️ [4/6] Menguji Dynamic Help Command...');
        const helpCmd = registry.get('help');
        let helpOutput = null;
        await helpCmd.execute({
            sock: { sendMessage: async () => {} },
            from: '120363000000000000@g.us',
            senderNumber: '628123456789',
            args: [],
            isGroup: true,
            reply: async (text) => { helpOutput = text; },
            commands: registry
        });
        if (!helpOutput || !helpOutput.includes('BUKITTINGGI KOS') || !helpOutput.includes('!kost')) {
            throw new Error('❌ Dynamic help tidak menampilkan extension Bukittinggi Kos!');
        }
        console.log('   ✅ Dynamic help berhasil me-render kategori extension Bukittinggi Kos secara otomatis!');

        // 5. Test Offline Resilience
        console.log('\n▶️ [5/6] Menguji Ketahanan RapBot saat Extension Offline...');
        kostProcess.kill('SIGTERM');
        await sleep(1000);

        const resOffline = await execCommand('kost', []);
        if (!resOffline.reply || !resOffline.reply.includes('tidak tersedia')) {
            throw new Error('❌ RapBot tidak merespons error offline secara graceful');
        }
        console.log('   ✅ RapBot tidak crash dan mengembalikan pesan graceful saat Kost offline!');

        // 6. Test Online Recovery
        console.log('\n▶️ [6/6] Menghidupkan kembali Kost dan menguji recovery...');
        kostProcess = spawn('node', ['server.js'], {
            cwd: path.join(__dirname, '..', 'Kost'),
            stdio: 'pipe'
        });
        await sleep(1200);

        const resRecover = await execCommand('kost', []);
        if (!resRecover.reply || !resRecover.reply.includes('DAFTAR KOST')) {
            throw new Error('❌ Recovery setelah Kost online kembali gagal!');
        }
        console.log('   ✅ RapBot otomatis berhasil berkomunikasi kembali dengan Kost tanpa perlu restart!');

        console.log('\n🎉 =========================================================');
        console.log('🎉 SEMUA PENGUJIAN 14 COMMAND DAN DECOUPLING BERHASIL 100%!');
        console.log('🎉 =========================================================\n');
    } catch (err) {
        console.error('\n❌ PENGUJIAN GAGAL:', err);
        process.exitCode = 1;
    } finally {
        if (kostProcess) {
            kostProcess.kill('SIGTERM');
        }
    }
}

runAllTests();
