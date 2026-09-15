require('dotenv').config();

const express = require('express');
const path = require('path');
const database = require('../services/database');
const { normalizePhoneNumber } = require('../utils/phone');
const { normalizeJid } = require('../utils/jid');

const app = express();
const PORT = process.env.WEB_PORT || 3001;
const ADMIN_PIN = process.env.ADMIN_PIN;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Reference to live WhatsApp Socket
let activeBotSocket = null;
let botConnectionStatus = 'offline'; // 'offline' | 'connecting' | 'connected'

function setBotSocket(sock, status = 'connected') {
    activeBotSocket = sock;
    botConnectionStatus = status;
}

function getBotSocket() {
    return activeBotSocket;
}

function validatePin(pin) {
    if (!ADMIN_PIN) return true;
    return Boolean(pin && String(pin).trim() === String(ADMIN_PIN).trim());
}

function extractPin(req) {
    return req.body?.pin || req.headers['x-pin'] || req.query?.pin;
}

// ----------------------------------------------------
// 1. SYSTEM & STATUS API
// ----------------------------------------------------

app.get('/api/system/status', async (req, res) => {
    try {
        const mem = process.memoryUsage();
        const uptimeSeconds = Math.floor(process.uptime());
        const stats = database.getStats();
        const groups = database.getGroups();
        const owners = database.getOwners();

        let totalKost = 0;
        let pendingKost = 0;
        let sentKost = 0;
        let pendingSubmissions = 0;

        try {
            const kostStats = await database.getKostStats();
            totalKost = kostStats?.total || 0;
            pendingKost = kostStats?.pending || 0;
            sentKost = kostStats?.sent || 0;
        } catch {}

        try {
            const subs = await database.getKostSubmissions({ status: 'pending' });
            pendingSubmissions = subs.length;
        } catch {}

        let botUserJid = null;
        if (activeBotSocket?.user?.id) {
            botUserJid = normalizeJid(activeBotSocket.user.id);
        }

        res.json({
            success: true,
            status: {
                botStatus: botConnectionStatus,
                botUser: botUserJid,
                uptimeSeconds,
                uptimeFormatted: formatUptime(uptimeSeconds),
                memory: {
                    heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
                    rssMB: Math.round(mem.rss / 1024 / 1024)
                },
                counts: {
                    groups: groups.length,
                    owners: owners.length,
                    totalKost,
                    pendingKost,
                    sentKost,
                    pendingSubmissions,
                    commands: stats?.commands || 0,
                    messages: stats?.messages || 0,
                    stickers: stats?.stickers || 0,
                    brats: stats?.brats || 0
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (d > 0) parts.push(`${d}h`);
    if (h > 0) parts.push(`${h}j`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}d`);
    return parts.join(' ');
}

// ----------------------------------------------------
// 2. OWNERS API
// ----------------------------------------------------

app.get('/api/owners', (req, res) => {
    res.json({
        success: true,
        owners: database.getOwners(),
        superOwner: database.SUPER_OWNER
    });
});

app.post('/api/owners', async (req, res) => {
    const { name, number, pin } = req.body;
    const currentPin = pin || extractPin(req);

    if (!validatePin(currentPin)) {
        return res.status(401).json({ success: false, message: 'PIN admin salah.' });
    }

    const cleanName = String(name || '').trim();
    const cleanNumber = normalizePhoneNumber(number);

    if (!cleanName) return res.status(400).json({ success: false, message: 'Nama wajib diisi.' });
    if (!cleanNumber) return res.status(400).json({ success: false, message: 'Nomor WhatsApp wajib diisi.' });

    const result = await database.addOwner(cleanNumber, cleanName);
    if (!result.success) {
        return res.status(409).json(result);
    }

    res.json({
        success: true,
        message: 'Owner berhasil ditambahkan.',
        owners: result.owners
    });
});

app.put('/api/owners/:number', async (req, res) => {
    const oldNumber = normalizePhoneNumber(req.params.number);
    const { name, number, pin } = req.body;
    const currentPin = pin || extractPin(req);

    if (!validatePin(currentPin)) {
        return res.status(401).json({ success: false, message: 'PIN admin salah.' });
    }

    const cleanName = String(name || '').trim();
    const cleanNumber = normalizePhoneNumber(number);

    if (!cleanName) return res.status(400).json({ success: false, message: 'Nama wajib diisi.' });
    if (!cleanNumber) return res.status(400).json({ success: false, message: 'Nomor WhatsApp wajib diisi.' });

    const result = await database.updateOwner(oldNumber, { name: cleanName, number: cleanNumber });
    if (!result.success) {
        return res.status(400).json(result);
    }

    res.json({
        success: true,
        message: 'Owner berhasil diperbarui.',
        owners: result.owners
    });
});

app.delete('/api/owners/:number', async (req, res) => {
    const number = normalizePhoneNumber(req.params.number);
    const currentPin = extractPin(req);

    if (!validatePin(currentPin)) {
        return res.status(401).json({ success: false, message: 'PIN admin salah.' });
    }

    if (database.isSuperOwner(number)) {
        return res.status(403).json({ success: false, message: 'Super owner tidak bisa dihapus.' });
    }

    const result = await database.deleteOwner(number);
    if (!result.success) {
        return res.status(404).json(result);
    }

    res.json({
        success: true,
        message: 'Owner berhasil dihapus.',
        owners: result.owners
    });
});

// ----------------------------------------------------
// 3. GROUPS & GROUP LINKING API
// ----------------------------------------------------

// List all registered groups
app.get('/api/groups', (req, res) => {
    try {
        const rawGroups = database.getGroups();
        const enriched = rawGroups.map(g => {
            let parentName = null;
            if (g.parentGroupId) {
                const parent = database.getGroupById(g.parentGroupId);
                parentName = parent ? parent.name : g.parentGroupId;
            }
            return {
                ...g,
                parentGroupName: parentName
            };
        });

        res.json({ success: true, groups: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Register new group
app.post('/api/groups', async (req, res) => {
    try {
        const { id, name, groupName, type, role, parentGroupId, settings, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.addGroup({
            id,
            name,
            groupName: groupName || '',
            type: type || 'kos',
            role: role || 'admin',
            parentGroupId: parentGroupId || null,
            settings: settings || {},
            initializedBy: 'web-admin'
        });

        if (!result.success) {
            return res.status(result.alreadyExists ? 409 : 400).json(result);
        }

        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Link Child Group to Parent Group (1-Click Linking)
app.post('/api/groups/link', async (req, res) => {
    try {
        const { childGroupId, parentGroupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        if (!childGroupId) {
            return res.status(400).json({ success: false, message: 'Grup asal (child) wajib dipilih.' });
        }

        const cleanChildId = normalizeJid(childGroupId);
        const cleanParentId = parentGroupId ? normalizeJid(parentGroupId) : null;

        if (cleanParentId && cleanChildId === cleanParentId) {
            return res.status(400).json({ success: false, message: 'Grup tidak bisa dihubungkan ke dirinya sendiri.' });
        }

        const updates = {
            parentGroupId: cleanParentId,
            role: cleanParentId ? 'public' : 'admin'
        };

        const result = await database.updateGroup(cleanChildId, updates);
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json({
            success: true,
            message: cleanParentId 
                ? 'Grup berhasil dihubungkan ke grup induk.' 
                : 'Link grup berhasil dilepas (berubah menjadi grup mandiri/admin).',
            group: result.group
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update group
app.put('/api/groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, groupName, type, role, parentGroupId, settings, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.updateGroup(id, {
            name,
            groupName,
            type,
            role,
            parentGroupId,
            settings
        });

        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete group
app.delete('/api/groups/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const currentPin = extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.deleteGroup(id);
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// 4. BUKITTINGGI KOS & SUBMISSIONS API
// ----------------------------------------------------

// Serve Bukittinggi Kos legacy url redirect to main
app.get('/kost', (req, res) => {
    res.redirect('/#groups');
});

// Get kost list + stats
app.get('/api/kost', async (req, res) => {
    try {
        const { status, query, search, groupId } = req.query;
        const q = (query || search || '').trim();
        const gid = groupId ? String(groupId).trim() : null;

        let list = [];
        if (q) {
            list = await database.searchKost(q, gid);
            if (status && status !== 'all') {
                list = list.filter(k => (k.status || 'pending').toLowerCase() === status.toLowerCase());
            }
        } else if (status && status !== 'all') {
            list = await database.getKostByStatus(status, gid);
        } else {
            list = await database.getKostList(gid);
        }

        const stats = await database.getKostStats(gid);

        res.json({
            success: true,
            stats,
            total: list.length,
            data: list
        });
    } catch (err) {
        console.error('[web/server] Error GET /api/kost:', err);
        res.status(500).json({ success: false, message: 'Gagal memuat data kost.' });
    }
});

// Get single kost detail
app.get('/api/kost/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { groupId } = req.query;
        const item = await database.getKostById(id, groupId || null);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Kost tidak ditemukan.' });
        }
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail kost.' });
    }
});

// Add kost
app.post('/api/kost', async (req, res) => {
    try {
        const { name, instagram, tiktok, whatsapp, groupId, addedBy, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.addKost({
            name,
            instagram,
            tiktok,
            whatsapp,
            groupId,
            addedBy: addedBy || 'web-admin'
        });

        if (!result.success) {
            return res.status(result.alreadyExists ? 409 : 400).json(result);
        }

        res.status(201).json(result);
    } catch (err) {
        console.error('[web/server] Error POST /api/kost:', err);
        res.status(500).json({ success: false, message: 'Gagal menambahkan kost.' });
    }
});

// Update kost
app.put('/api/kost/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, instagram, tiktok, whatsapp, status, groupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.updateKost(id, {
            name,
            instagram,
            tiktok,
            whatsapp,
            status,
            groupId
        });

        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[web/server] Error PUT /api/kost/:id:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui kost.' });
    }
});

// Mark kost sent
app.post('/api/kost/:id/sent', async (req, res) => {
    try {
        const { id } = req.params;
        const { sentBy, groupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.markKostSent(id, groupId, sentBy || 'web-admin');
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json({
            success: true,
            message: 'Status kost berhasil diubah menjadi sent.',
            data: result.data
        });
    } catch (err) {
        console.error('[web/server] Error POST /api/kost/:id/sent:', err);
        res.status(500).json({ success: false, message: 'Gagal menandai status sent.' });
    }
});

// Delete kost
app.delete('/api/kost/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const currentPin = extractPin(req);
        const groupId = req.body?.groupId || req.query?.groupId || null;

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.deleteKost(id, groupId);
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json({
            success: true,
            message: 'Data kost berhasil dihapus.',
            data: result.data
        });
    } catch (err) {
        console.error('[web/server] Error DELETE /api/kost/:id:', err);
        res.status(500).json({ success: false, message: 'Gagal menghapus kost.' });
    }
});

// Submissions List
app.get('/api/submissions', async (req, res) => {
    try {
        const { groupId, status } = req.query;
        const list = await database.getKostSubmissions({
            groupId: groupId || null,
            status: status || 'all'
        });
        res.json({ success: true, total: list.length, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Review Submission (Approve / Reject)
app.post('/api/submissions/:id/review', async (req, res) => {
    try {
        const { id } = req.params;
        const { action, autoAddKost, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const statusTarget = action === 'approve' || action === 'approved' ? 'approved' : 'rejected';
        const result = await database.reviewKostSubmission(id, statusTarget, 'web-admin');

        if (!result.success) {
            return res.status(400).json(result);
        }

        // Auto-add to kost table if approved and requested
        let addedKost = null;
        if (statusTarget === 'approved' && autoAddKost !== false && result.submission) {
            const sub = result.submission;
            const contacts = sub.contactsRaw || '';
            const igMatch = contacts.match(/instagram:?\s*([^\s,;]+)/i);
            const waMatch = contacts.match(/wa:?\s*([^\s,;]+)/i);
            const ttMatch = contacts.match(/tiktok:?\s*([^\s,;]+)/i);

            const addResult = await database.addKost({
                name: sub.name,
                instagram: igMatch ? igMatch[1] : (contacts.includes('@') ? contacts : null),
                whatsapp: waMatch ? waMatch[1] : null,
                tiktok: ttMatch ? ttMatch[1] : null,
                groupId: sub.groupId,
                addedBy: `usul:${sub.submittedBy || 'warga'}`
            });
            if (addResult.success) {
                addedKost = addResult.data;
            }
        }

        res.json({
            success: true,
            message: `Usulan #${id} berhasil di-${statusTarget}.`,
            data: result.submission,
            addedKost
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// 5. AUTOREPLIES API
// ----------------------------------------------------

app.get('/api/autoreplies', (req, res) => {
    try {
        res.json({ success: true, data: database.getAutoreplies() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/autoreplies', async (req, res) => {
    try {
        const { keyword, response, matchType, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.addAutoreply(keyword, response, matchType || 'exact');
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.delete('/api/autoreplies/:keyword', async (req, res) => {
    try {
        const { keyword } = req.params;
        const currentPin = extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.deleteAutoreply(keyword);
        if (!result.success) {
            return res.status(404).json(result);
        }

        res.json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// 6. WELCOME CONFIG API
// ----------------------------------------------------

app.get('/api/welcome', (req, res) => {
    try {
        res.json({ success: true, config: database.getWelcomeConfig() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/welcome', async (req, res) => {
    try {
        const { config, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        if (!config || typeof config !== 'object') {
            return res.status(400).json({ success: false, message: 'Config tidak valid.' });
        }

        await database.saveWelcomeConfig(config);
        res.json({ success: true, message: 'Konfigurasi welcome berhasil disimpan.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// 7. AUDIT LOGS API
// ----------------------------------------------------

app.get('/api/logs', (req, res) => {
    try {
        const logs = database.getLogs();
        const limit = parseInt(req.query.limit, 10) || 50;
        const recent = Array.isArray(logs) ? logs.slice(-limit).reverse() : [];
        res.json({ success: true, total: recent.length, logs: recent });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// 8. BOT ACTIONS & BROADCAST API
// ----------------------------------------------------

// Broadcast / Send message to target WhatsApp JID
app.post('/api/bot/broadcast', async (req, res) => {
    try {
        const { targetJid, message, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        if (!targetJid || !message) {
            return res.status(400).json({ success: false, message: 'Target JID dan pesan wajib diisi.' });
        }

        if (!activeBotSocket) {
            return res.status(503).json({
                success: false,
                message: 'Bot WhatsApp sedang offline / belum terhubung.'
            });
        }

        const cleanJid = normalizeJid(targetJid);
        await activeBotSocket.sendMessage(cleanJid, { text: String(message) });

        res.json({
            success: true,
            message: `Pesan berhasil dikirim ke ${cleanJid}.`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: `Gagal mengirim pesan: ${err.message}` });
    }
});

// Sync / Flush in-memory cache with database
app.post('/api/bot/sync', async (req, res) => {
    try {
        const currentPin = extractPin(req);
        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        await database.refreshDatabaseCache();
        res.json({ success: true, message: 'Cache data berhasil disinkronisasi.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/test', (req, res) => {
    res.send('OK');
});

const server = app.listen(PORT, () => {
    console.log(`[WebServer] 🌐 Bot Control Panel berjalan di http://localhost:${PORT}`);
});

module.exports = { app, server, setBotSocket, getBotSocket };