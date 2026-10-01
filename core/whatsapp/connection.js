// core/whatsapp/connection.js - Baileys WhatsApp socket connection and lifecycle management
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const database = require('../../services/database');
const { handleMessagesUpsert } = require('./messageHandler');
const { handleWelcome } = require('./welcomeHandler');

async function connectToWhatsApp(commandRegistry) {
    const { state, saveCreds } = await useMultiFileAuthState('auth_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    const webServer = require('../../web/server');
    webServer.setBotSocket(sock, 'connecting');

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async update => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
            console.log('Scan QR Code di atas!');
        }

        if (connection === 'close') {
            webServer.setBotSocket(null, 'offline');
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[Baileys] Koneksi terputus (status: ${statusCode || 'unknown'}). Reconnecting...`, shouldReconnect);

            if (shouldReconnect) {
                setTimeout(() => {
                    connectToWhatsApp(commandRegistry);
                }, 3000);
            } else {
                console.log('[Baileys] Session logged out. Silakan hapus auth_baileys/ dan scan ulang.');
            }
        }

        if (connection === 'open') {
            webServer.setBotSocket(sock, 'connected');
            console.log('Bot Baileys Berhasil Terhubung! 🚀');
            console.log('Daftar Owner:', database.getOwners().map(o => o.name || o.number));
            try {
                const groups = await sock.groupFetchAllParticipating();
                if (groups && typeof groups === 'object') {
                    database.updateDiscoveredGroupsFromMetadata(groups);
                    console.log(`✅ ${Object.keys(groups).length} grup WhatsApp terdeteksi & disinkronkan.`);
                }
            } catch (gErr) {
                console.warn('Info: Gagal mengambil daftar grup partisipasi saat startup:', gErr.message);
            }
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

module.exports = {
    connectToWhatsApp
};
