const fs = require('fs');
const path = require('path');
const database = require('../services/database');
const serverStats = require('../services/serverStats');
const spreadsheet = require('../services/spreadsheet');
const jsonUtils = require('../utils/json');
const phoneUtils = require('../utils/phone');
const jidUtils = require('../utils/jid');
const groupUtils = require('../utils/group');

const PREFIX = process.env.BOT_PREFIX || '!';

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
            serverStats,
            spreadsheet
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

    // Private Chat (DM) Gatekeeper: Only owners can interact with the bot in private chat
    if (!isGroupChat) {
        const isOwnerSender = database.isOwner(senderNumber, botNumber);
        if (!isOwnerSender) {
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
            database.findAutoreply(body) ||
            database.findAutoreply(`${PREFIX}${commandName}`);

        if (autoreplyMatch) {
            database.incrementCommandStats('autoreply');
            database.logCommand(`autoreply:${autoreplyMatch.trigger}`, from, senderNumber, isGroupChat);
            await sock.sendMessage(from, { text: autoreplyMatch.response }, { quoted: msg });
            return;
        }

        // Unknown command starting with prefix - silently ignore or no action
        return;
    }

    // Optional: check non-prefix autoreply (e.g. exact phrase trigger)
    const exactMatch = database.findAutoreply(body);
    if (exactMatch) {
        database.incrementCommandStats('autoreply');
        database.logCommand(`autoreply:${exactMatch.trigger}`, from, senderNumber, isGroupChat);
        await sock.sendMessage(from, { text: exactMatch.response }, { quoted: msg });
    }
}

module.exports = {
    loadCommands,
    handleMessagesUpsert,
    handleSingleMessage,
    getBody,
    createContext
};