// extensions/example/server.js - Minimal Generic Example Extension
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3006;
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

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

    if (req.method === 'GET' && pathname === '/health') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        return res.end(JSON.stringify({ status: 'ok', name: manifest.name, version: manifest.version }));
    }

    if (req.method === 'GET' && pathname === '/manifest') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        return res.end(JSON.stringify(manifest));
    }

    if (req.method === 'POST' && pathname === '/command') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body || '{}');
                const rawCmd = (payload.command || '').replace(/^!/, '').toLowerCase();
                console.log(`[ExampleExtension] 📥 Received command: ${rawCmd} from ${payload.senderId || payload.context?.senderNumber || 'user'}`);

                if (rawCmd === 'hello' || rawCmd === 'hi' || rawCmd === 'halo') {
                    res.setHeader('Content-Type', 'application/json');
                    res.writeHead(200);
                    return res.end(JSON.stringify({
                        type: 'reply',
                        text: 'Hello from Example Extension!'
                    }));
                }

                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                return res.end(JSON.stringify({
                    type: 'reply',
                    text: `Unknown command for Example Extension: !${rawCmd}`
                }));
            } catch (err) {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(500);
                return res.end(JSON.stringify({ type: 'reply', text: 'Internal error in Example Extension' }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
});

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`[ExampleExtension] 🚀 Server running on port ${PORT}`);
    });
}

module.exports = server;
