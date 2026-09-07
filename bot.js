require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');

const database = require('./services/database');
const { loadCommands, handleMessagesUpsert } = require('./handlers/messageHandler');
const { handleWelcome } = require('./handlers/welcomeHandler');

let commandRegistry = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Scan QR Code di atas!');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[Baileys] Koneksi terputus (status: ${statusCode || 'unknown'}). Reconnecting...`, shouldReconnect);

            if (shouldReconnect) {
                setTimeout(() => {
                    connectToWhatsApp();
                }, 3000);
            } else {
                console.log('[Baileys] Session logged out. Silakan hapus auth_baileys/ dan scan ulang.');
            }
        }

        if (connection === 'open') {
            console.log('Bot Baileys Berhasil Terhubung! 🚀');
            console.log('Daftar Owner:', database.getOwners().map(o => o.name || o.number));
        }
    });

    sock.ev.on('group-participants.update', async update => {
        try {
            await handleWelcome(sock, update);
        } catch (err) {
            console.error('[Event:group-participants.update] Error:', err);
        }
    });

    sock.ev.on('messages.upsert', async upsertData => {
        console.log(
            `[Event:messages.upsert] type=${upsertData.type}, messages=${upsertData.messages?.length || 0}`
        );

        try {
            await handleMessagesUpsert(sock, upsertData, commandRegistry);
        } catch (err) {
            console.error('[Event:messages.upsert] Error:', err);
        }
    });

        return sock;
    }

// ==========================================
// BOT INITIALIZATION
// ==========================================

(async () => {
    try {
        console.log('🚀 Memulai WhatsApp Bot...');

        // 1. Pastikan folder data dan file database JSON siap
        database.ensureDataFiles();
        console.log('✅ File database JSON siap.');

        // 2. Load command registry secara dinamis
        commandRegistry = loadCommands();
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
        console.log('✅ Web server manajemen owner aktif.');

        // 5. Hubungkan ke WhatsApp Socket
        await connectToWhatsApp();
    } catch (err) {
        console.error('❌ Gagal menginisialisasi bot:', err);
        process.exit(1);
    }
})();