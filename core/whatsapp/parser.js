// core/whatsapp/parser.js - WhatsApp message parsing and template formatting utilities
const PREFIX = process.env.BOT_PREFIX || '!';

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

function formatAutoreplyText(template, { from, senderNumber, isGroupChat, groupInfo }) {
    if (!template) return '';
    let result = String(template);
    const now = new Date();
    const timeWib = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
    const dateWib = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full' });
    const cleanSender = String(senderNumber || '').replace(/[^0-9]/g, '');
    const groupTitle = groupInfo?.name || groupInfo?.groupName || (isGroupChat ? from : 'Private Chat');

    result = result
        .replace(/\{jid\}/gi, from)
        .replace(/\{groupJid\}/gi, from)
        .replace(/\{groupId\}/gi, from)
        .replace(/\{userId\}/gi, cleanSender)
        .replace(/\{userJid\}/gi, `${cleanSender}@s.whatsapp.net`)
        .replace(/\{sender\}/gi, cleanSender)
        .replace(/\{senderNumber\}/gi, cleanSender)
        .replace(/\{groupName\}/gi, groupTitle)
        .replace(/\{group\}/gi, groupTitle)
        .replace(/\{time\}/gi, timeWib)
        .replace(/\{date\}/gi, dateWib)
        .replace(/\{prefix\}/gi, PREFIX);

    return result;
}

module.exports = {
    PREFIX,
    getMessageTimestamp,
    getBody,
    formatAutoreplyText
};
