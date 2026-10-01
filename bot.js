require('dotenv').config();

const database = require('./services/database');
const { loadCommands } = require('./core/whatsapp/messageHandler');
const { connectToWhatsApp } = require('./core/whatsapp/connection');

// ==========================================
// BOT INITIALIZATION
// ==========================================

(async () => {
    try {
        console.log('🚀 Memulai WhatsApp Bot (RapBot)...');

        // 1. Inisialisasi koneksi MariaDB dan sinkronisasi seluruh tabel & cache
        database.ensureDataFiles();
        await database.ensureAllTables();
        console.log('✅ MariaDB tables & low-latency cache siap.');

        // 2. Load command registry secara dinamis (Core + Extensions)
        const commandRegistry = loadCommands();
        console.log(`✅ ${commandRegistry.size} command & aliases berhasil dimuat.`);

        // 3. Pre-warm Brat ESM module jika tersedia
        try {
            await import('@ghuts/brat');
            console.log('✅ Brat generator module siap.');
        } catch (bratErr) {
            console.warn('⚠️ Peringatan: Brat module tidak dapat di pre-warm:', bratErr.message);
        }

        // 4. Inisialisasi Express Web Server
        require('./web/server');
        console.log('✅ Web server manajemen owner & dashboard aktif.');

        // 5. Hubungkan ke WhatsApp Socket via Baileys
        await connectToWhatsApp(commandRegistry);
    } catch (err) {
        console.error('❌ Gagal menginisialisasi bot:', err);
        process.exit(1);
    }
})();