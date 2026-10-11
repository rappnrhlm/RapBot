// extensions/ai/server.js - Standalone HTTP Server for RapBot AI Extension
const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { Storage } = require('./src/utils/storage');
const { BudgetManager } = require('./src/budgetManager');
const { RateLimiter } = require('./src/rateLimiter');
const { AiService } = require('./src/aiService');

const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

function createServer(customConfig = null) {
    const config = customConfig || loadConfig();
    const storage = new Storage();
    const budgetManager = new BudgetManager({ storage, config });
    const rateLimiter = new RateLimiter(config);
    const aiService = new AiService({ config, storage, budgetManager, rateLimiter });

    const server = http.createServer(async (req, res) => {
        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end();
        }

        // Health Check
        if (req.method === 'GET' && pathname === '/health') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            return res.end(JSON.stringify({
                status: 'ok',
                id: manifest.id,
                name: manifest.name,
                version: manifest.version,
                enabled: config.enabled,
                provider: config.provider,
                model: config.model
            }));
        }

        // Extension Manifest
        if (req.method === 'GET' && pathname === '/manifest') {
            res.setHeader('Content-Type', 'application/json');
            res.writeHead(200);
            return res.end(JSON.stringify(manifest));
        }

        // Command Endpoint
        if (req.method === 'POST' && pathname === '/command') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const payload = JSON.parse(body || '{}');
                    const senderId = payload.senderId || payload.context?.senderNumber || payload.chatId || 'user';
                    console.log(`[AiExtension] 📩 Perintah diterima: "${payload.command || '!ai'}" dari ${senderId}`);

                    const result = await aiService.handleCommand(payload);

                    res.setHeader('Content-Type', 'application/json');
                    res.writeHead(200);
                    return res.end(JSON.stringify(result));
                } catch (err) {
                    console.error('[AiExtension] ❌ Error handling command:', err.message);
                    res.setHeader('Content-Type', 'application/json');
                    res.writeHead(500);
                    return res.end(JSON.stringify({
                        type: 'reply',
                        text: '❌ Terjadi kesalahan internal pada layanan AI Extension.'
                    }));
                }
            });
            return;
        }

        res.writeHead(404);
        res.end('Not Found');
    });

    return {
        server,
        config,
        storage,
        budgetManager,
        rateLimiter,
        aiService
    };
}

if (require.main === module) {
    const { server, config } = createServer();
    server.listen(config.port, () => {
        console.log(`[AiExtension] 🚀 Server running on port ${config.port} (Model: ${config.model}, Provider: ${config.provider})`);
    });
}

module.exports = {
    createServer
};
