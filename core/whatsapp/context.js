// core/whatsapp/context.js - Execution context builder for bot commands
const database = require('../../services/database');
const serverStats = require('../services/serverStats');
const jsonUtils = require('../utils/json');
const phoneUtils = require('../utils/phone');
const jidUtils = require('../utils/jid');
const groupUtils = require('../utils/group');

function createContext({ sock, msg, from, senderNumber, args, commandName, body, isGroupChat, registry }) {
    const clearCmd = registry?.get('clear');

    const reply = async (text, options = {}) => {
        try {
            const sentResult = await sock.sendMessage(from, { text, ...options }, { quoted: msg });
            if (sentResult?.key && clearCmd?.trackSentMessage) {
                clearCmd.trackSentMessage(from, sentResult.key);
            }
            return sentResult;
        } catch (err) {
            console.warn(`[MessageHandler] Gagal mengirim quoted reply (${err.message}), mencoba kirim langsung...`);
            const sentResult = await sock.sendMessage(from, { text, ...options });
            if (sentResult?.key && clearCmd?.trackSentMessage) {
                clearCmd.trackSentMessage(from, sentResult.key);
            }
            return sentResult;
        }
    };

    const send = async (content, options = {}) => {
        try {
            const sentResult = await sock.sendMessage(from, content, { quoted: msg, ...options });
            if (sentResult?.key && clearCmd?.trackSentMessage) {
                clearCmd.trackSentMessage(from, sentResult.key);
            }
            return sentResult;
        } catch (err) {
            console.warn(`[MessageHandler] Gagal mengirim quoted send (${err.message}), mencoba kirim langsung...`);
            const sentResult = await sock.sendMessage(from, content, options);
            if (sentResult?.key && clearCmd?.trackSentMessage) {
                clearCmd.trackSentMessage(from, sentResult.key);
            }
            return sentResult;
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

module.exports = {
    createContext
};
