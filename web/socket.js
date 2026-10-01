// web/socket.js - Shared bot socket reference for web API endpoints
let botSocket = null;
let botStatus = 'offline';

function setBotSocket(sock, status = 'connected') {
    botSocket = sock;
    botStatus = status;
}

function getBotSocket() {
    return botSocket;
}

function getBotStatus() {
    return botStatus;
}

module.exports = {
    setBotSocket,
    getBotSocket,
    getBotStatus
};
