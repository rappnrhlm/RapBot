const fs = require('fs');
const path = require('path');
const database = require('../services/database');
const serverStats = require('../services/serverStats');
const jsonUtils = require('../utils/json');
const phoneUtils = require('../utils/phone');
const jidUtils = require('../utils/jid');
const groupUtils = require('../utils/group');
const cooldownUtils = require('../utils/cooldown');

const PREFIX = process.env.BOT_PREFIX || '!';
const BOT_START_TIME = Math.floor(Date.now() / 1000);
const MAX_MESSAGE_AGE_SECONDS = Number(process.env.MAX_MESSAGE_AGE) || 60;

function getMessageTimestamp(msg) {
    if (!msg?.messageTimestamp) return 0;
    let ts = typeof msg.messageTimestamp === 'number'
        ? msg.messageTimestamp
        : (typeof msg.messageTimestamp === 'object' && msg.messageTimestamp?.low)
            ? msg.messageTimestamp.low
            : Number(msg.messageTimestamp);

    if (isNaN(ts)) return 0;
    if (ts > 10000000000) {
        ts = Math.floor(ts / 1000);
    }
    return ts;
}

function loadCommands(dir = path.join(__dirname, '..', 'commands')) {
    const commands = new Map();

    function readDirRecursive(currentDir) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                readDirRecursive(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                try {
                    delete require.cache[require.resolve(fullPath)];
                    const cmd = require(fullPath);

                    if (!cmd || !cmd.name || typeof cmd.execute !== 'function') {
                        console.warn(`[CommandLoader] Skipping invalid command file: ${fullPath}`);
                        continue;
                    }

                    const primaryName = cmd.name.toLowerCase();
                    commands.set(primaryName, cmd);

                    if (Array.isArray(cmd.aliases)) {
                        for (const alias of cmd.aliases) {
                            if (alias) {
                                commands.set(alias.toLowerCase(), cmd);
                            }
                        }
                    }

                    console.log(`[CommandLoader] 📦 Loaded !${primaryName} (${cmd.category || 'general'})`);
                } catch (err) {
                    console.error(`[CommandLoader] ❌ Error loading ${fullPath}:`, err.message);
                }
            }
        }
    }

    readDirRecursive(dir);
    return commands;
}

function getBody(msg) {
    return (
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        msg?.message?.videoMessage?.caption ||
        msg?.message?.documentMessage?.caption ||
        ''
    );
}

function createContext({ sock, msg, from, senderNumber, args, commandName, body, isGroupChat, registry }) {
    const reply = async (text, options = {}) => {
        try {
            return await sock.sendMessage(from, { text, ...options }, { quoted: msg });
        } catch (err) {
            console.warn(`[MessageHandler] Gagal mengirim quoted reply (${err.message}), mencoba kirim langsung...`);
            return await sock.sendMessage(from, { text, ...options });
        }
    };

    const send = async (content, options = {}) => {
        try {
            return await sock.sendMessage(from, content, { quoted: msg, ...options });
        } catch (err) {
            console.warn(`[MessageHandler] Gagal mengirim quoted send (${err.message}), mencoba kirim langsung...`);
            return await sock.sendMessage(from, content, options);
        }
    };

    return {
        sock,
        msg,
        from,
        senderNumber,
        args,
        command: commandName,
        body,
        isGroup: isGroupChat,
        reply,
        send,
        commands: registry,
        services: {
            database,
            serverStats
        },
        utils: {
            json: jsonUtils,
            phone: phoneUtils,
            jid: jidUtils,
            group: groupUtils
        }
    };
}

async function handleMessagesUpsert(sock, upsertData, registry) {
    if (!Array.isArray(upsertData?.messages)) {
        return;
    }

    for (const msg of upsertData.messages) {
        try {
            await handleSingleMessage(sock, msg, registry);
        } catch (err) {
            console.error('[handlers/messageHandler] Unexpected error handling message:', err);
        }
    }
}

async function handleSingleMessage(sock, msg, registry) {
    if (!msg?.message) return;

    const body = getBody(msg).trim();
    if (!body) return;

    // Abaikan pesan lama yang dikirim sebelum bot aktif atau saat bot offline (stb restart)
    const msgTimestamp = getMessageTimestamp(msg);
    if (msgTimestamp > 0) {
        const now = Math.floor(Date.now() / 1000);
        const ageSeconds = now - msgTimestamp;

        if (ageSeconds > MAX_MESSAGE_AGE_SECONDS || msgTimestamp < (BOT_START_TIME - 5)) {
            console.log(`[MessageHandler] ⏳ Mengabaikan pesan lama (${ageSeconds}s lalu): "${body.slice(0, 30)}"`);
            return;
        }
    }

    // Abaikan pesan dari bot sendiri KECUALI diawali prefix ! (untuk pengujian self-command)
    if (msg.key?.fromMe && !body.startsWith(PREFIX)) {
        return;
    }

    const from = msg.key?.remoteJid;
    if (!from) return;

    // Increment overall incoming message count
    database.incrementMessageStats();

    const isGroupChat = jidUtils.isGroup(from);
    const senderNumber = await jidUtils.resolveSenderNumber(sock, msg, from);
    const botNumber = jidUtils.getJidNumber(sock?.user?.id);
    const isOwner = database.isOwner(senderNumber, botNumber);

    // Private Chat (DM) Gatekeeper: Only owners can interact with the bot in private chat
    if (!isGroupChat) {
        if (!isOwner) {
            if (body.startsWith(PREFIX)) {
                console.log(`[MessageHandler] ⛔ DM ditolak dari non-owner: ${senderNumber || 'unknown'} (${from})`);
                await sock.sendMessage(
                    from,
                    { text: 'ngapain sih lo sok asik, bot cuma boleh dipake rapa 😭' },
                    { quoted: msg }
                ).catch(() => {});
            }
            return;
        }
    }

    // Check if message is a command starting with PREFIX
    if (body.startsWith(PREFIX)) {
        const parts = body.slice(PREFIX.length).trim().split(/\s+/);
        const commandName = parts.shift()?.toLowerCase();
        const args = parts;

        if (!commandName) return;

        console.log(`[MessageHandler] 📩 Perintah diterima: !${commandName} dari ${senderNumber || 'unknown'} (${isGroupChat ? 'grup' : 'private'})`);

        // 1. Check built-in commands first (prioritized)
        const cmd = registry.get(commandName);
        if (cmd) {
            database.incrementCommandStats(cmd.name);
            database.logCommand(cmd.name, from, senderNumber, isGroupChat);

            const ctx = createContext({
                sock,
                msg,
                from,
                senderNumber,
                args,
                commandName,
                body,
                isGroupChat,
                registry
            });

            try {
                await cmd.execute(ctx);
                console.log(`[MessageHandler] ✅ Berhasil mengeksekusi !${commandName}`);
            } catch (cmdErr) {
                console.error(`[handlers/messageHandler] Error executing !${commandName}:`, cmdErr);
                try {
                    await sock.sendMessage(
                        from,
                        { text: `❌ Terjadi error saat menjalankan !${commandName}.` },
                        { quoted: msg }
                    );
                } catch {
                    await sock.sendMessage(from, { text: `❌ Terjadi error saat menjalankan !${commandName}.` }).catch(() => {});
                }
            }
            return;
        }

        // 2. If command not found in registry, check autoreply
        const autoreplyMatch =
            database.findAutoreply(body, from) ||
            database.findAutoreply(`${PREFIX}${commandName}`, from);

        if (autoreplyMatch) {
            if (autoreplyMatch.ownerOnly && !isOwner) {
                console.log(`[MessageHandler] ⛔ Autoreply ${autoreplyMatch.trigger} ditolak (khusus owner) dari ${senderNumber}`);
                return;
            }
            database.incrementCommandStats('autoreply');
            database.logCommand(`autoreply:${autoreplyMatch.trigger}`, from, senderNumber, isGroupChat);

            if (autoreplyMatch.mediaPath && fs.existsSync(autoreplyMatch.mediaPath)) {
                try {
                    const imageBuffer = fs.readFileSync(autoreplyMatch.mediaPath);
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: autoreplyMatch.response || ''
                    }, { quoted: msg });
                } catch (imgErr) {
                    console.error('[MessageHandler] Gagal mengirim media autoreply:', imgErr);
                    await sock.sendMessage(from, { text: autoreplyMatch.response || '' }, { quoted: msg });
                }
            } else {
                await sock.sendMessage(from, { text: autoreplyMatch.response || '' }, { quoted: msg });
            }
            return;
        }

        // Unknown command starting with prefix - silently ignore or no action
        return;
    }

    // Optional: check non-prefix autoreply (e.g. exact phrase trigger)
    const exactMatch = database.findAutoreply(body, from);
    if (exactMatch) {
        if (exactMatch.ownerOnly && !isOwner) {
            console.log(`[MessageHandler] ⛔ Autoreply ${exactMatch.trigger} ditolak (khusus owner) dari ${senderNumber}`);
            return;
        }
        database.incrementCommandStats('autoreply');
        database.logCommand(`autoreply:${exactMatch.trigger}`, from, senderNumber, isGroupChat);

        if (exactMatch.mediaPath && fs.existsSync(exactMatch.mediaPath)) {
            try {
                const imageBuffer = fs.readFileSync(exactMatch.mediaPath);
                await sock.sendMessage(from, {
                    image: imageBuffer,
                    caption: exactMatch.response || ''
                }, { quoted: msg });
            } catch (imgErr) {
                console.error('[MessageHandler] Gagal mengirim media autoreply:', imgErr);
                await sock.sendMessage(from, { text: exactMatch.response || '' }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(from, { text: exactMatch.response || '' }, { quoted: msg });
        }
        return;
    }

    // Auto-Helper: deteksi pertanyaan natural seputar info kos di grup publik
    if (isGroupChat) {
        const groupInfo = database.getGroupById(from);
        if (groupInfo && (groupInfo.role === 'public' || groupInfo.settings?.autoHelper)) {
            const lowerBody = body.toLowerCase();
            const isKostInquiry =
                /(info|cari|ada|rekomendasi|spill|minta)\s+(kos|kost|kontrakan|sewa)/i.test(lowerBody) ||
                /(kos|kost|kontrakan)\s+(putri|putra|cowok|cewek|pasutri|murah|birugo|dekat|uin|unp)/i.test(lowerBody);

            if (isKostInquiry) {
                const cd = cooldownUtils.checkCooldown(`autohelp:${from}`, 180); // Maksimal 1x tiap 3 menit per grup
                if (cd.allowed) {
                    const tip =
`💡 *Tips Pencarian Kos Otomatis*
Halo kak! Kamu bisa langsung cari kos dengan ketik:
\`!cari <kata kunci>\`

_Contoh:_
• \`!cari birugo\`
• \`!cari putri\`
• \`!cari dekat uin\`

📱 Info & update kos: *@bukittinggikos*`;
                    await sock.sendMessage(from, { text: tip }, { quoted: msg }).catch(() => {});
                }
            }
        }
    }
}

module.exports = {
    loadCommands,
    handleMessagesUpsert,
    handleSingleMessage,
    getBody,
    createContext
};