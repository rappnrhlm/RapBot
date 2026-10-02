// core/whatsapp/messageHandler.js - Message reception, parsing, permission validation, and command dispatching
const fs = require('fs');
const path = require('path');
const database = require('../../services/database');
const cooldownUtils = require('../utils/cooldown');
const jidUtils = require('../utils/jid');
const { PREFIX, getMessageTimestamp, getBody, formatAutoreplyText } = require('./parser');
const { createContext } = require('./context');
const extensionManager = require('../extensions/manager');

const BOT_START_TIME = Math.floor(Date.now() / 1000);
const MAX_MESSAGE_AGE_SECONDS = Number(process.env.MAX_MESSAGE_AGE) || 60;

function loadCommands(dirs = [
    path.join(__dirname, '..', 'commands')
]) {
    const targetDirs = Array.isArray(dirs) ? dirs : [dirs];
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

    for (const dir of targetDirs) {
        readDirRecursive(dir);
    }

    // Register external extensions generically from ExtensionManager
    extensionManager.registerExtensionCommands(commands);

    return commands;
}

async function handleMessagesUpsert(sock, upsertData, registry) {
    if (!Array.isArray(upsertData?.messages)) {
        return;
    }

    for (const msg of upsertData.messages) {
        try {
            await handleSingleMessage(sock, msg, registry);
        } catch (err) {
            console.error('[core/whatsapp/messageHandler] Unexpected error handling message:', err);
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

    // Track pesan bot sendiri ke memory ring buffer agar bisa di-clear
    if (msg.key?.fromMe) {
        const clearCmd = registry?.get('clear');
        if (clearCmd?.trackSentMessage && msg.key?.remoteJid) {
            clearCmd.trackSentMessage(msg.key.remoteJid, msg.key);
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

        // 1. Check built-in & extension commands registry (prioritized)
        const cmd = registry?.get(commandName);
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
                console.error(`[core/whatsapp/messageHandler] Error executing !${commandName}:`, cmdErr);
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

            const groupInfo = isGroupChat ? database.getGroupById(from) : null;
            const finalResponse = formatAutoreplyText(autoreplyMatch.response || '', { from, senderNumber, isGroupChat, groupInfo });

            if (autoreplyMatch.mediaPath && fs.existsSync(autoreplyMatch.mediaPath)) {
                try {
                    const imageBuffer = fs.readFileSync(autoreplyMatch.mediaPath);
                    await sock.sendMessage(from, {
                        image: imageBuffer,
                        caption: finalResponse
                    }, { quoted: msg });
                } catch (imgErr) {
                    console.error('[MessageHandler] Gagal mengirim media autoreply:', imgErr);
                    await sock.sendMessage(from, { text: finalResponse }, { quoted: msg });
                }
            } else {
                await sock.sendMessage(from, { text: finalResponse }, { quoted: msg });
            }
            return;
        }

        // 3. Perintah tidak dikenal dengan prefix ! (Beri tahu user dengan sopan)
        try {
            const unknownReply = `❓ Perintah *${PREFIX}${commandName}* tidak ditemukan.\n\nKetik *${PREFIX}help* atau *${PREFIX}menu* untuk melihat daftar perintah yang tersedia.`;
            await sock.sendMessage(from, { text: unknownReply }, { quoted: msg });
        } catch (unknownErr) {
            console.warn('[MessageHandler] Gagal mengirim balasan unknown command:', unknownErr.message);
        }
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

        const groupInfo = isGroupChat ? database.getGroupById(from) : null;
        const finalResponse = formatAutoreplyText(exactMatch.response || '', { from, senderNumber, isGroupChat, groupInfo });

        if (exactMatch.mediaPath && fs.existsSync(exactMatch.mediaPath)) {
            try {
                const imageBuffer = fs.readFileSync(exactMatch.mediaPath);
                await sock.sendMessage(from, {
                    image: imageBuffer,
                    caption: finalResponse
                }, { quoted: msg });
            } catch (imgErr) {
                console.error('[MessageHandler] Gagal mengirim media autoreply:', imgErr);
                await sock.sendMessage(from, { text: finalResponse }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(from, { text: finalResponse }, { quoted: msg });
        }
        return;
    }


}

module.exports = {
    loadCommands,
    handleMessagesUpsert,
    handleSingleMessage,
    getBody,
    createContext
};
