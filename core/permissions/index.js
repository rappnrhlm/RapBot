// core/permissions/index.js - Centralized permission & authorization helpers
const database = require('../../services/database');
const groupUtils = require('../utils/group');
const jidUtils = require('../utils/jid');

function isOwner(number, botNumber = null) {
    return database.isOwner(number, botNumber);
}

function isSuperOwner(number) {
    return database.isSuperOwner(number);
}

async function requireAdmin(sock, from, msg, metadata, senderJid = null) {
    return groupUtils.requireAdmin(sock, from, msg, metadata, senderJid);
}

async function requireBotAdmin(sock, from, msg, metadata) {
    return groupUtils.requireBotAdmin(sock, from, msg, metadata);
}

module.exports = {
    isOwner,
    isSuperOwner,
    requireAdmin,
    requireBotAdmin
};
