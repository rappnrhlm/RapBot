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

// Device Info
app.get('/api/device/info', async (req, res) => {
    try {
        const sock = getBotSocket();
        const status = sock ? 'connected' : 'offline';
        
        let deviceInfo = {
            status,
            phone: null,
            name: null,
            platform: 'Baileys (WhatsApp Web)',
            version: require('@whiskeysockets/baileys/package.json').version || 'unknown',
            uptime: process.uptime(),
            memory: {
                heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
                rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100,
                heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100,
            },
            os: {
                platform: require('os').platform(),
                arch: require('os').arch(),
                totalMemMB: Math.round(require('os').totalmem() / 1024 / 1024),
                freeMemMB: Math.round(require('os').freemem() / 1024 / 1024),
                cpus: require('os').cpus().length,
                hostname: require('os').hostname(),
            }
        };
        
        if (sock && sock.user) {
            const rawId = sock.user.id || '';
            deviceInfo.phone = rawId.replace(/:.*/, '').replace('@s.whatsapp.net', '');
            deviceInfo.name = sock.user.name || null;
        }
        
        res.json({ success: true, data: deviceInfo });
    } catch (err) {
        console.error('[API] Device info error:', err);
        res.status(500).json({ success: false, message: 'Gagal memuat info device: ' + err.message });
    }
});

// ----------------------------------------------------
// 2. OWNERS API
// ----------------------------------------------------

app.get('/api/owners', (req, res) => {
    const owners = database.getOwners();
    res.json({
        success: true,
        data: owners,
        owners,
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

// List all groups (both initialized and uninitialized / undefined)
app.get('/api/groups', async (req, res) => {
    try {
        // If active bot socket is connected, fetch live participating groups
        if (activeBotSocket?.groupFetchAllParticipating) {
            try {
                const liveGroupsMap = await activeBotSocket.groupFetchAllParticipating();
                if (liveGroupsMap && typeof liveGroupsMap === 'object') {
                    database.updateDiscoveredGroupsFromMetadata(liveGroupsMap);
                }
            } catch (err) {
                console.warn('[web/server] Info: Could not fetch live groups from socket:', err.message);
            }
        }

        const rawGroups = database.getGroups();
        const discovered = database.getDiscoveredGroups();

        // Map initialized groups
        const initializedJids = new Set();
        const enrichedRegistered = rawGroups.map(g => {
            const cleanId = normalizeJid(g.id);
            initializedJids.add(cleanId);
            const parentGid = g.parentGroupId || g.parentId || null;
            let parentName = null;
            if (parentGid) {
                const parent = database.getGroupById(parentGid);
                parentName = parent ? parent.name : parentGid;
            }
            const disc = discovered.find(d => normalizeJid(d.id) === cleanId);

            // Normalize role: "admin" / "indukan" / "master" -> "indukan"; "public" / "cabang" -> "cabang"
            const rawRole = (g.role || 'admin').toLowerCase();
            const isCabang = rawRole === 'cabang' || rawRole === 'public' || Boolean(parentGid);
            const normalizedRole = isCabang ? 'cabang' : 'indukan';

            return {
                ...g,
                id: cleanId,
                name: g.name || disc?.subject || 'Grup WhatsApp',
                groupName: g.groupName || disc?.subject || '',
                role: normalizedRole,
                originalRole: rawRole,
                parentId: parentGid,
                parentGroupId: parentGid,
                parentGroupName: parentName,
                isInitialized: true,
                isUndefined: false,
                participantsCount: disc?.participantsCount || g.participantsCount || null
            };
        });

        // Map uninitialized (undefined) groups discovered by bot
        const uninitialized = discovered
            .filter(d => d?.id && !initializedJids.has(normalizeJid(d.id)))
            .map(d => ({
                id: normalizeJid(d.id),
                name: d.subject || 'Grup WhatsApp',
                groupName: d.subject || '',
                type: 'undefined',
                role: 'undefined',
                originalRole: 'uninitialized',
                parentId: null,
                parentGroupId: null,
                parentGroupName: null,
                isInitialized: false,
                isUndefined: true,
                participantsCount: d.participantsCount || 0,
                lastSeen: d.lastSeen || null
            }));

        const allGroups = [...enrichedRegistered, ...uninitialized];

        res.json({
            success: true,
            total: allGroups.length,
            initializedCount: enrichedRegistered.length,
            uninitializedCount: uninitialized.length,
            groups: allGroups,
            data: allGroups
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ----------------------------------------------------
// DYNAMIC FEATURE CATALOG & PERMISSIONS API
// ----------------------------------------------------
function scanAvailableFeatures() {
    const fs = require('fs');
    const commandsDir = path.join(__dirname, '..', 'commands');
    const features = [];

    function walkDir(dir) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walkDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                try {
                    delete require.cache[require.resolve(fullPath)];
                    const cmd = require(fullPath);
                    if (!cmd || !cmd.name) continue;

                    const cat = (cmd.category || 'general').toLowerCase();
                    const name = cmd.name.toLowerCase();

                    // Calculate permission matrix
                    let availability = {
                        uninitialized: true,
                        admin: true,
                        public: true,
                        dm: true,
                        requiredRole: 'anyone',
                        note: 'Tersedia di semua jenis interaksi'
                    };

                    if (cat === 'sticker') {
                        availability = {
                            uninitialized: true,
                            admin: true,
                            public: true,
                            dm: false,
                            requiredRole: 'anyone',
                            note: 'Tersedia di seluruh grup WhatsApp'
                        };
                    } else if (cat === 'group') {
                        if (name === 'initgroup') {
                            availability = {
                                uninitialized: true,
                                admin: false,
                                public: false,
                                dm: false,
                                requiredRole: 'group_admin',
                                note: 'Khusus inisialisasi grup baru'
                            };
                        } else {
                            availability = {
                                uninitialized: true,
                                admin: true,
                                public: true,
                                dm: false,
                                requiredRole: 'group_admin',
                                note: 'Hanya dapat dijalankan oleh Admin Grup WA'
                            };
                        }
                    } else if (cat === 'bukittinggi-kos' || cat === 'kos') {
                        if (name === 'cari') {
                            availability = {
                                uninitialized: false,
                                admin: true,
                                public: true,
                                dm: false,
                                requiredRole: 'anyone',
                                note: 'Pencarian kos publik / member grup'
                            };
                        } else if (name === 'usulkost') {
                            availability = {
                                uninitialized: false,
                                admin: true,
                                public: true,
                                dm: false,
                                requiredRole: 'anyone',
                                note: 'Formulir usulan data kos dari warga'
                            };
                        } else {
                            availability = {
                                uninitialized: false,
                                admin: true,
                                public: false,
                                dm: false,
                                requiredRole: 'group_admin',
                                note: 'Khusus grup induk / internal admin'
                            };
                        }
                    } else if (cat === 'owner') {
                        availability = {
                            uninitialized: true,
                            admin: true,
                            public: true,
                            dm: true,
                            requiredRole: 'bot_owner',
                            note: 'Khusus Super Owner & Pengelola Bot'
                        };
                    } else if (cat === 'autoreply') {
                        availability = {
                            uninitialized: true,
                            admin: true,
                            public: true,
                            dm: true,
                            requiredRole: 'anyone',
                            note: 'Berdasarkan konfigurasi trigger autoreply'
                        };
                    }

                    features.push({
                        name: cmd.name,
                        aliases: Array.isArray(cmd.aliases) ? cmd.aliases : [],
                        category: cmd.category || 'general',
                        description: cmd.description || 'Tidak ada deskripsi',
                        usage: cmd.usage || `!${cmd.name}`,
                        availability
                    });
                } catch (e) {
                    console.warn(`[WebServer] Error scanning feature ${fullPath}:`, e.message);
                }
            }
        }
    }

    walkDir(commandsDir);
    return features;
}

app.get('/api/features', (req, res) => {
    try {
        const { groupId, role } = req.query;
        const features = scanAvailableFeatures();

        let targetRole = role;
        let isInit = true;
        let groupDetails = null;

        if (groupId) {
            const cleanGid = normalizeJid(groupId);
            groupDetails = database.getGroupById(cleanGid);
            if (groupDetails) {
                targetRole = groupDetails.role || 'admin';
                isInit = true;
            } else {
                targetRole = 'uninitialized';
                isInit = false;
            }
        }

        // Categorize features with evaluated status for the target group
        const evaluated = features.map(f => {
            let active = true;
            let reason = 'Tersedia dan aktif';

            if (targetRole === 'uninitialized') {
                if (!f.availability.uninitialized) {
                    active = false;
                    reason = 'Grup belum diinisialisasi (jalankan !initgroup terlebih dahulu)';
                }
            } else if (targetRole === 'public') {
                if (!f.availability.public) {
                    active = false;
                    reason = 'Perintah khusus grup internal Admin (bukan grup publik/cabang)';
                }
            } else if (targetRole === 'admin') {
                if (!f.availability.admin) {
                    active = false;
                    reason = 'Fitur tidak aktif pada mode grup ini';
                }
            }

            return {
                ...f,
                evaluated: {
                    active,
                    reason,
                    targetRole: targetRole || 'all'
                }
            };
        });

        res.json({
            success: true,
            total: evaluated.length,
            group: groupDetails || (groupId ? { id: groupId, role: targetRole, isInitialized: isInit } : null),
            features: evaluated
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Register new group
app.post('/api/groups', async (req, res) => {
    try {
        const { id, name, groupName, type, role, parentGroupId, parentId, settings, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const rawParent = parentGroupId !== undefined ? parentGroupId : parentId;
        const cleanParent = (rawParent && rawParent !== 'none' && rawParent !== 'unlink' && rawParent !== 'null') ? rawParent : null;

        const result = await database.addGroup({
            id,
            name,
            groupName: groupName || '',
            type: type || 'kos',
            role: role || 'admin',
            parentGroupId: cleanParent,
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
        const childGroupId = req.body.childGroupId || req.body.groupId || req.body.id || req.body.sourceId;
        const rawParent = req.body.parentGroupId || req.body.parentId || req.body.targetParent || req.body.parent;
        const parentGroupId = (rawParent && rawParent !== 'none' && rawParent !== 'unlink' && rawParent !== 'null') ? rawParent : null;
        const currentPin = req.body.pin || extractPin(req);

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
        const { name, groupName, type, role, parentGroupId, parentId, settings, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const rawParent = parentGroupId !== undefined ? parentGroupId : parentId;
        const cleanParent = (rawParent && rawParent !== 'none' && rawParent !== 'unlink' && rawParent !== 'null') ? rawParent : (rawParent === '' || rawParent === null ? null : undefined);

        const result = await database.updateGroup(id, {
            name,
            groupName,
            type,
            role,
            parentGroupId: cleanParent,
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
            list = await database.searchKost(q, gid, { status: status && status !== 'all' ? status : null });
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
            data: list,
            kost: list
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
        res.json({ success: true, data: item, kost: item });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Gagal mengambil detail kost.' });
    }
});

// Add kost
app.post('/api/kost', async (req, res) => {
    try {
        const { name, instagram, tiktok, whatsapp, status, groupId, addedBy, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const ig = instagram !== undefined ? instagram : req.body.contact?.instagram;
        const tt = tiktok !== undefined ? tiktok : req.body.contact?.tiktok;
        const wa = whatsapp !== undefined ? whatsapp : req.body.contact?.whatsapp;
        const stat = status || 'pending';

        const result = await database.addKost({
            name,
            instagram: ig,
            tiktok: tt,
            whatsapp: wa,
            status: stat,
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

        const ig = instagram !== undefined ? instagram : req.body.contact?.instagram;
        const tt = tiktok !== undefined ? tiktok : req.body.contact?.tiktok;
        const wa = whatsapp !== undefined ? whatsapp : req.body.contact?.whatsapp;

        const result = await database.updateKost(id, {
            name,
            instagram: ig,
            tiktok: tt,
            whatsapp: wa,
            status,
            groupId,
            updatedBy: 'web-admin'
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

// Dynamic universal status changer: pending | sent | published
app.post('/api/kost/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, updatedBy, groupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        if (!status) {
            return res.status(400).json({ success: false, message: 'Parameter status wajib diisi (pending, sent, atau published).' });
        }

        const result = await database.setKostStatus(id, status, updatedBy || 'web-admin', groupId);
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        let japriSent = false;
        if (status === 'published' && result.data?.whatsapp) {
            const sock = getBotSocket();
            if (sock) {
                try {
                    let cleanNum = String(result.data.whatsapp).replace(/[^0-9]/g, '');
                    if (cleanNum.startsWith('0')) cleanNum = '62' + cleanNum.substring(1);
                    if (cleanNum.length >= 9) {
                        const targetJid = cleanNum + '@s.whatsapp.net';
                        const confirmMsg =
`Halo Kak dari tim @bukittinggikos! 🎉

Kabar baik, informasi seputar *${result.data.name}* sudah resmi dipublikasikan di database & media sosial kami:
🆔 ID Listing: *${result.data.id}*
📱 Akun Instagram dan Tiktok Resmi: *@bukittinggikos*

Kini pencari kos dapat menemukan info *${result.data.name}* secara otomatis via pencarian bot WhatsApp "!cari ${result.data.name}".

Semoga lekas penuh kamarnya ya Kak! Terima kasih banyak atas kerjasamanya. 🙏`;

                        await sock.sendMessage(targetJid, { text: confirmMsg });
                        japriSent = true;
                    }
                } catch (dmErr) {
                    console.warn(`[WebServer] Gagal auto-japri status published ke ${result.data.whatsapp}:`, dmErr.message);
                }
            }
        }

        res.json({
            success: true,
            message: (result.message || `Status kost berhasil diubah menjadi ${String(status).toUpperCase()}.`) + (japriSent ? ' Pesan Konfirmasi Tayang telah dijapri ke pemilik.' : ''),
            data: result.data,
            japriSent
        });
    } catch (err) {
        console.error('[web/server] Error POST /api/kost/:id/status:', err);
        res.status(500).json({ success: false, message: 'Gagal mengubah status kost.' });
    }
});

// Mark kost sent / toggle status (sent vs pending)
app.post('/api/kost/:id/sent', async (req, res) => {
    try {
        const { id } = req.params;
        const { sentBy, groupId, pin, sent, status } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const targetStatus = (sent === false || status === 'pending') ? 'pending' : 'sent';
        const result = await database.setKostStatus(id, targetStatus, sentBy || 'web-admin', groupId);
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json({
            success: true,
            message: targetStatus === 'sent' 
                ? 'Status kost berhasil diubah menjadi terkirim penawaran (sent).' 
                : 'Status kost berhasil diubah menjadi pending (belum ditawarkan).',
            data: result.data
        });
    } catch (err) {
        console.error('[web/server] Error POST /api/kost/:id/sent:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status penawaran kost.' });
    }
});

// Mark kost published (tayang ke publik) / unpublish
app.post('/api/kost/:id/publish', async (req, res) => {
    try {
        const { id } = req.params;
        const { publishedBy, groupId, pin, unpublish } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const targetStatus = unpublish ? 'sent' : 'published';
        const result = await database.setKostStatus(id, targetStatus, publishedBy || 'web-admin', groupId);
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        let japriSent = false;
        if (!unpublish && result.data?.whatsapp) {
            const sock = getBotSocket();
            if (sock) {
                try {
                    let cleanNum = String(result.data.whatsapp).replace(/[^0-9]/g, '');
                    if (cleanNum.startsWith('0')) cleanNum = '62' + cleanNum.substring(1);
                    if (cleanNum.length >= 9) {
                        const targetJid = cleanNum + '@s.whatsapp.net';
                        const confirmMsg =
`Halo Kak dari tim @bukittinggikos! 🎉

Kabar baik, informasi seputar *${result.data.name}* sudah resmi dipublikasikan di database & media sosial kami:
🆔 ID Listing: *${result.data.id}*
📱 Akun Instagram dan Tiktok Resmi: *@bukittinggikos*

Kini pencari kos dapat menemukan info *${result.data.name}* secara otomatis via pencarian bot WhatsApp "!cari ${result.data.name}".

Semoga lekas penuh kamarnya ya Kak! Terima kasih banyak atas kerjasamanya. 🙏`;

                        await sock.sendMessage(targetJid, { text: confirmMsg });
                        japriSent = true;
                    }
                } catch (dmErr) {
                    console.warn(`[WebServer] Gagal auto-japri konfirmasi tayang ke ${result.data.whatsapp}:`, dmErr.message);
                }
            }
        }

        res.json({
            success: true,
            message: (unpublish 
                ? 'Status kost berhasil ditarik dari publik (kembali ke sent).' 
                : 'Status kost berhasil dipublikasikan (tayang ke publik).') + (japriSent ? ' Pesan Konfirmasi Tayang telah dijapri ke WhatsApp pemilik.' : ''),
            data: result.data,
            japriSent
        });
    } catch (err) {
        console.error('[web/server] Error POST /api/kost/:id/publish:', err);
        res.status(500).json({ success: false, message: 'Gagal mempublikasikan data kost.' });
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

// Import / Restore kost data
app.post('/api/kost/import', async (req, res) => {
    try {
        const currentPin = extractPin(req);
        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const { items, mode = 'merge' } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Data array items tidak valid atau kosong.' });
        }

        let importedCount = 0;
        for (const item of items) {
            if (!item.name && !item.namaKost) continue;
            const name = item.name || item.namaKost;
            const instagram = item.instagram || item.contact?.instagram || null;
            const tiktok = item.tiktok || item.contact?.tiktok || null;
            const whatsapp = item.whatsapp || item.contact?.whatsapp || null;
            const status = item.status || 'pending';
            const groupId = item.groupId || item.group_id || null;

            await database.addKost({
                name,
                instagram,
                tiktok,
                whatsapp,
                status,
                groupId,
                addedBy: item.addedBy || item.added_by || 'import'
            });
            importedCount++;
        }

        res.json({
            success: true,
            message: `Berhasil mengimpor ${importedCount} data kos.`,
            importedCount
        });
    } catch (err) {
        console.error('[web/server] Error POST /api/kost/import:', err);
        res.status(500).json({ success: false, message: 'Gagal mengimpor data: ' + err.message });
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

        // Auto Japri ke pengusul jika disetujui & bot socket online
        let japriSent = false;
        if (statusTarget === 'approved' && result.submission) {
            const sub = result.submission;
            const sock = getBotSocket();
            if (sub.submittedBy && sub.submittedBy !== 'warga' && sub.submittedBy !== 'unknown' && sock) {
                try {
                    let cleanNum = String(sub.submittedBy).replace(/[^0-9]/g, '');
                    if (cleanNum.startsWith('0')) cleanNum = '62' + cleanNum.substring(1);
                    const submitterJid = cleanNum + '@s.whatsapp.net';

                    const kostName = addedKost?.name || sub.name;
                    const kostId = addedKost?.id || sub.id;

                    const defaultAccMsg =
`Halo Kak, terima kasih banyak atas usulan data *${kostName}* yang Kakak kirimkan ke tim @bukittinggikos! 🙌

Usulan Kakak sudah kami verifikasi dan resmi disetujui masuk ke database bot WhatsApp kami dengan nomor ID: *${kostId}*.

Kontribusi Kakak sangat berarti bagi para pencari hunian di Bukittinggi. Semoga harimu menyenangkan! ✨`;

                    await sock.sendMessage(submitterJid, { text: defaultAccMsg });
                    japriSent = true;
                } catch (dmErr) {
                    console.warn(`[WebServer] Gagal auto-japri pengusul usulan #${id}:`, dmErr.message);
                }
            }
        }

        res.json({
            success: true,
            message: `Usulan #${id} berhasil di-${statusTarget}.${japriSent ? ' Notifikasi japri WhatsApp telah dikirimkan ke pengusul.' : ''}`,
            data: result.submission,
            addedKost,
            japriSent
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// Update Submission (Edit Name, Contacts, Status)
app.put('/api/submissions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contactsRaw, contact, whatsapp, status, groupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const rawContacts = contactsRaw !== undefined ? contactsRaw : (whatsapp || contact);
        const result = await database.updateKostSubmission(id, {
            name,
            contactsRaw: rawContacts,
            groupId,
            status,
            reviewedBy: 'web-admin'
        });

        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[web/server] Error PUT /api/submissions/:id:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete Submission
app.delete('/api/submissions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const currentPin = extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.deleteKostSubmission(id);
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
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
        const { keyword, trigger, response, matchType, ownerOnly, groupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const targetTrigger = trigger || keyword;
        const result = await database.addAutoreply(
            targetTrigger,
            response,
            'web-admin',
            groupId || null,
            null,
            Boolean(ownerOnly)
        );
        if (!result.success) {
            return res.status(400).json(result);
        }

        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/autoreplies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { keyword, trigger, response, ownerOnly, groupId, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const result = await database.editAutoreply(
            id,
            {
                trigger: trigger || keyword,
                response,
                ownerOnly,
                groupId
            },
            'web-admin'
        );

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.json(result);
    } catch (err) {
        console.error('[web/server] Error PUT /api/autoreplies/:id:', err);
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
        const { groupId } = req.query;
        const config = database.getWelcomeConfig(groupId || null);
        res.json({ success: true, config, welcome: config, data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.post('/api/welcome', async (req, res) => {
    try {
        const { config, pin, groupId, enabled, text, mediaPath } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        const configObj = (config && typeof config === 'object') ? config : {
            enabled: enabled !== undefined ? Boolean(enabled) : true,
            text: text !== undefined ? String(text) : '',
            mediaPath: mediaPath || ''
        };

        if (typeof configObj !== 'object') {
            return res.status(400).json({ success: false, message: 'Config tidak valid.' });
        }

        const targetGroupId = groupId || req.body.group_id || (config && config.groupId) || null;
        const saved = await database.saveWelcomeConfig(configObj, targetGroupId);
        res.json({ success: true, message: 'Konfigurasi welcome berhasil disimpan.', config: saved, welcome: saved, data: saved });
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

// Command Usage Statistics
app.get('/api/stats/commands', async (req, res) => {
    try {
        const stats = database.getStats();
        const commandUsage = stats.commandUsage || {};
        
        // Sort by usage count descending
        const sorted = Object.entries(commandUsage)
            .map(([command, count]) => ({ command, count }))
            .sort((a, b) => b.count - a.count);
        
        res.json({
            success: true,
            data: {
                totalCommands: stats.commands || 0,
                totalMessages: stats.messages || 0,
                totalStickers: stats.stickers || 0,
                totalBrats: stats.brats || 0,
                startedAt: stats.startedAt || null,
                topCommands: sorted.slice(0, 20),
                allCommands: sorted
            }
        });
    } catch (err) {
        console.error('[API] Stats commands error:', err);
        res.status(500).json({ success: false, message: 'Gagal memuat statistik: ' + err.message });
    }
});

// ----------------------------------------------------
// 8. BOT ACTIONS & BROADCAST API
// ----------------------------------------------------

// Broadcast / Send message to target WhatsApp JID or group categories
app.post('/api/bot/broadcast', async (req, res) => {
    try {
        const { target, targetJid, message, pin } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        if (!message || !String(message).trim()) {
            return res.status(400).json({ success: false, message: 'Isi pesan siaran wajib diisi.' });
        }

        if (!activeBotSocket) {
            return res.status(503).json({
                success: false,
                message: 'Bot WhatsApp sedang offline / belum terhubung.'
            });
        }

        const registeredGroups = database.getGroups() || [];
        let targetJids = [];

        if (targetJid) {
            targetJids = [normalizeJid(targetJid)];
        } else if (target === 'all' || !target) {
            targetJids = registeredGroups.map(g => normalizeJid(g.id));
        } else if (target === 'indukan') {
            targetJids = registeredGroups.filter(g => g.role === 'indukan').map(g => normalizeJid(g.id));
        } else if (target === 'cabang') {
            targetJids = registeredGroups.filter(g => g.role === 'cabang').map(g => normalizeJid(g.id));
        } else {
            targetJids = [normalizeJid(target)];
        }

        targetJids = [...new Set(targetJids.filter(Boolean))];

        if (targetJids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tidak ada grup tujuan yang terdaftar untuk siaran ini.'
            });
        }

        let sentCount = 0;
        const errors = [];
        const sentMessages = [];

        for (const jid of targetJids) {
            try {
                const sentMsg = await activeBotSocket.sendMessage(jid, { text: String(message) });
                sentCount++;
                if (sentMsg && sentMsg.key) {
                    sentMessages.push({
                        jid,
                        messageId: sentMsg.key.id,
                        key: sentMsg.key
                    });
                }
                // Small delay to avoid rate limit
                await new Promise(r => setTimeout(r, 400));
            } catch (sendErr) {
                console.warn(`[web/server] Gagal mengirim siaran ke ${jid}:`, sendErr.message);
                errors.push({ jid, error: sendErr.message });
            }
        }

        const bcRecord = database.saveBroadcast({
            id: `bc_${Date.now()}`,
            timestamp: new Date().toISOString(),
            target: target || (targetJid ? 'single' : 'all'),
            targetJid: targetJid || null,
            message: String(message),
            sentCount,
            totalTarget: targetJids.length,
            messages: sentMessages,
            deleted: false
        });

        database.logCommand(`broadcast:${target || 'custom'}`, 'system', 'admin', true);

        res.json({
            success: true,
            message: `Pesan siaran berhasil dikirim ke ${sentCount} dari ${targetJids.length} grup.`,
            sentCount,
            totalTarget: targetJids.length,
            broadcastId: bcRecord.id,
            broadcast: bcRecord,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('[web/server] Error broadcast:', err);
        res.status(500).json({ success: false, message: `Gagal mengirim siaran: ${err.message}` });
    }
});

// Get broadcast history
app.get('/api/bot/broadcasts', (req, res) => {
    try {
        const pin = extractPin(req);
        if (!validatePin(pin)) return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        const list = database.getBroadcasts(30);
        res.json({ success: true, broadcasts: list });
    } catch (err) {
        console.error('[web/server] Error getting broadcasts:', err);
        res.status(500).json({ success: false, message: 'Gagal memuat riwayat siaran.' });
    }
});

// Undo / Delete broadcast messages for everyone
app.post('/api/bot/broadcast/delete', async (req, res) => {
    try {
        const pin = extractPin(req);
        if (!validatePin(pin)) return res.status(401).json({ success: false, message: 'PIN admin salah.' });

        const sock = getBotSocket();
        if (!sock) {
            return res.status(503).json({ success: false, message: 'Bot WhatsApp sedang offline / belum terhubung.' });
        }

        const { id } = req.body || {};
        const bc = id ? database.getBroadcastById(id) : database.getLatestBroadcast();

        if (!bc) {
            return res.status(404).json({ success: false, message: 'Tidak ada data siaran yang dapat ditarik/dihapus.' });
        }

        if (bc.deleted) {
            return res.status(400).json({ success: false, message: 'Pesan siaran ini sudah pernah ditarik/dihapus sebelumnya.' });
        }

        let deletedCount = 0;
        const errors = [];

        if (Array.isArray(bc.messages) && bc.messages.length > 0) {
            for (const item of bc.messages) {
                try {
                    if (item.key) {
                        await sock.sendMessage(item.jid, { delete: item.key });
                    } else if (item.messageId) {
                        await sock.sendMessage(item.jid, {
                            delete: {
                                remoteJid: item.jid,
                                fromMe: true,
                                id: item.messageId
                            }
                        });
                    }
                    deletedCount++;
                    // Delay between deletes to avoid flood
                    await new Promise(r => setTimeout(r, 300));
                } catch (delErr) {
                    console.warn(`[broadcast/delete] Gagal hapus ke ${item.jid}:`, delErr.message);
                    errors.push({ jid: item.jid, error: delErr.message });
                }
            }
        }

        database.markBroadcastDeleted(bc.id);
        database.logCommand(`broadcast:undo:${bc.id}`, 'system', 'admin', true);

        res.json({
            success: true,
            message: `Berhasil menarik/menghapus pesan siaran serentak dari ${deletedCount} target grup.`,
            deletedCount,
            totalTarget: bc.messages?.length || 0,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('[web/server] Error undo broadcast:', err);
        res.status(500).json({ success: false, message: `Gagal menarik siaran: ${err.message}` });
    }
});

// Send to Individual Number
app.post('/api/bot/send', async (req, res) => {
    try {
        const pin = extractPin(req);
        if (!validatePin(pin)) return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        
        const sock = getBotSocket();
        if (!sock) return res.status(503).json({ success: false, message: 'Bot tidak terhubung.' });
        
        const { number, message } = req.body;
        if (!number || !message) return res.status(400).json({ success: false, message: 'Nomor dan pesan wajib diisi.' });
        
        // Normalize number to JID format
        let jid = number.replace(/[^0-9]/g, '');
        if (jid.startsWith('0')) jid = '62' + jid.substring(1);
        jid = jid + '@s.whatsapp.net';
        
        await sock.sendMessage(jid, { text: message });
        
        // Log the action
        if (database.logCommand) {
            database.logCommand(`web-send-direct`, jid, 'web-admin', false);
        }
        
        res.json({ success: true, message: `Pesan berhasil dikirim ke ${number}`, jid });
    } catch (err) {
        console.error('[API] Send direct error:', err);
        res.status(500).json({ success: false, message: 'Gagal mengirim pesan: ' + err.message });
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

// ----------------------------------------------------
// Realtime Bot Command & Autoreply Simulator API
// ----------------------------------------------------
const { loadCommands } = require('../handlers/messageHandler');
let simCommandRegistry = null;

function getSimCommandRegistry() {
    if (!simCommandRegistry) {
        simCommandRegistry = loadCommands();
    }
    return simCommandRegistry;
}

app.post('/api/bot/simulate', async (req, res) => {
    try {
        const { command, param = '', sender = '628123456789', role = 'public', isGroup = true } = req.body;
        const registry = getSimCommandRegistry();

        let rawInput = String(command || '').trim();
        let targetCmdName = rawInput.toLowerCase();
        let args = [];

        if (rawInput === 'custom') {
            const clean = String(param || '').trim();
            const textToParse = clean.startsWith('!') ? clean.slice(1).trim() : clean;
            const parts = textToParse.split(/\s+/);
            targetCmdName = (parts[0] || '').toLowerCase();
            args = parts.slice(1);
        } else {
            targetCmdName = rawInput.replace(/^!/, '').toLowerCase();
            if (param) {
                args = String(param).trim().split(/\s+/);
            }
        }

        // Normalize command aliases & subcommands
        let invokedCommand = targetCmdName;
        if (targetCmdName === 'adminmenu') {
            targetCmdName = 'menu';
            invokedCommand = 'admin-menu';
        } else if (targetCmdName === 'owner_list') {
            targetCmdName = 'owner';
            invokedCommand = 'owner';
            args = ['list'];
        } else if (targetCmdName === 'owner_add') {
            targetCmdName = 'owner';
            invokedCommand = 'owner';
            if (args[0] !== 'add') args.unshift('add');
        } else if (targetCmdName === 'owner_del' || targetCmdName === 'owner_delete') {
            targetCmdName = 'owner';
            invokedCommand = 'owner';
            if (args[0] !== 'delete' && args[0] !== 'del') args.unshift('delete');
        } else if (targetCmdName === 'autoreply_list') {
            targetCmdName = 'autoreply-add';
            invokedCommand = 'autoreply-list';
        } else if (targetCmdName === 'autoreply_add') {
            targetCmdName = 'autoreply-add';
            invokedCommand = 'autoreply-add';
        } else if (targetCmdName === 'autoreply_edit') {
            targetCmdName = 'autoreply-add';
            invokedCommand = 'autoreply-edit';
        } else if (targetCmdName === 'autoreply_del') {
            targetCmdName = 'autoreply-add';
            invokedCommand = 'autoreply-del';
        } else if (targetCmdName === 'setwelcome') {
            targetCmdName = 'welcome';
            invokedCommand = 'setwelcome';
        } else if (targetCmdName === 'unpost') {
            targetCmdName = 'post';
            invokedCommand = 'unpost';
        } else if (targetCmdName === 'unsent') {
            targetCmdName = 'sent';
            invokedCommand = 'unsent';
        } else if (targetCmdName === 'tolakusul') {
            targetCmdName = 'tolak';
            invokedCommand = 'tolak';
        } else if (targetCmdName === 'kost_lengkap') {
            targetCmdName = 'kost';
            invokedCommand = 'kost';
            args = ['lengkap', ...(args.length ? args : ['1'])];
        } else if (targetCmdName === 'kost_pending') {
            targetCmdName = 'kost';
            invokedCommand = 'kost';
            args = ['pending', ...args];
        } else if (targetCmdName === 'kost_sent') {
            targetCmdName = 'kost';
            invokedCommand = 'kost';
            args = ['sent', ...args];
        } else if (targetCmdName === 'kost_published') {
            targetCmdName = 'kost';
            invokedCommand = 'kost';
            args = ['published', ...args];
        } else if (targetCmdName === 'kost_all') {
            targetCmdName = 'kost';
            invokedCommand = 'kost';
            args = ['all', ...args];
        } else if (targetCmdName === 'kost_dm') {
            targetCmdName = 'kost';
            invokedCommand = 'kost';
            args = ['dm', ...args];
        }

        const capturedReplies = [];
        const cleanSender = String(sender).replace(/\D/g, '') || '628123456789';
        const simulatedFrom = isGroup ? '120363048921820938@g.us' : `${cleanSender}@s.whatsapp.net`;
        const activeSock = getBotSocket();

        // Virtual Socket for capturing real output
        const virtualSock = {
            user: activeSock?.user || { id: '6285195532009:1@s.whatsapp.net', name: 'RapBot Assistant' },
            sendMessage: async (jid, content, options) => {
                if (typeof content === 'string') {
                    capturedReplies.push(content);
                } else if (content?.text) {
                    capturedReplies.push(content.text);
                } else if (content?.caption) {
                    capturedReplies.push(content.caption);
                } else if (content?.image) {
                    capturedReplies.push(`🎨 [Media Gambar/Stiker Terlampir]`);
                } else {
                    capturedReplies.push(JSON.stringify(content, null, 2));
                }
                return { key: { id: `SIM_${Date.now()}`, remoteJid: jid, fromMe: true } };
            },
            groupMetadata: async (jid) => {
                return {
                    id: jid,
                    subject: 'Komunitas Kos Bukittinggi (Simulasi Realtime)',
                    owner: '6285195532009@s.whatsapp.net',
                    participants: [
                        { id: '6285195532009@s.whatsapp.net', admin: 'superadmin' },
                        { id: '628123456789@s.whatsapp.net', admin: 'admin' },
                        { id: `${cleanSender}@s.whatsapp.net`, admin: role === 'admin' ? 'admin' : null },
                        { id: '6281234567890@s.whatsapp.net', admin: 'admin' },
                        { id: '6285277889900@s.whatsapp.net', admin: null }
                    ]
                };
            },
            groupParticipantsUpdate: async (jid, participants, action) => {
                capturedReplies.push(`👥 [Aksi Grup: ${String(action).toUpperCase()} pada ${participants.join(', ')}]`);
                return true;
            },
            groupUpdateSubject: async (jid, subject) => {
                capturedReplies.push(`🏷️ [Nama Grup Diubah Menjadi: "${subject}"]`);
                return true;
            }
        };

        const virtualMsg = {
            key: {
                remoteJid: simulatedFrom,
                fromMe: false,
                id: `SIM_MSG_${Date.now()}`,
                participant: isGroup ? `${cleanSender}@s.whatsapp.net` : undefined
            },
            message: {
                conversation: `!${targetCmdName} ${args.join(' ')}`.trim()
            },
            messageTimestamp: Math.floor(Date.now() / 1000)
        };

        // Sandbox database proxy: Read-only for existing data, no-op/mock for mutations (tidak merubah cache / file / database)
        const sandboxedDatabase = new Proxy(database, {
            get(target, prop, receiver) {
                // Intercept mutation / logging / stat increment methods
                if (prop === 'incrementCommandStats' || prop === 'incrementMessageStats' || prop === 'logCommand') {
                    return () => {}; // No-op
                }
                if (prop === 'addKost') {
                    return async (kostData) => ({
                        success: true,
                        message: 'Simulasi: Kos berhasil ditambahkan (Sandbox)',
                        data: {
                            id: `KST-${String(Math.floor(Math.random() * 900000) + 100000)}`,
                            ...kostData,
                            status: 'pending',
                            createdAt: new Date().toISOString()
                        }
                    });
                }
                if (prop === 'deleteKost') {
                    return async (targetId) => ({
                        success: true,
                        data: {
                            id: targetId.startsWith('KST-') ? targetId : `KST-${String(targetId).padStart(6, '0')}`,
                            name: 'Kost Contoh (Simulasi Sandbox)'
                        }
                    });
                }
                if (prop === 'updateKost') {
                    return async (targetId, updateData) => ({
                        success: true,
                        data: {
                            id: targetId.startsWith('KST-') ? targetId : `KST-${String(targetId).padStart(6, '0')}`,
                            name: updateData.name || 'Kost Contoh (Simulasi)',
                            instagram: updateData.instagram || 'kostcontoh',
                            whatsapp: updateData.whatsapp || '628123456789',
                            tiktok: updateData.tiktok || null,
                            status: 'pending'
                        }
                    });
                }
                if (prop === 'updateKostStatus') {
                    return async (targetId, newStatus) => ({
                        success: true,
                        data: {
                            id: targetId.startsWith('KST-') ? targetId : `KST-${String(targetId).padStart(6, '0')}`,
                            name: 'Kost Contoh (Simulasi)',
                            status: newStatus
                        }
                    });
                }
                if (prop === 'submitKostProposal') {
                    return async (propData) => ({
                        success: true,
                        submissionId: Math.floor(Math.random() * 900) + 100,
                        id: `SUB-${Date.now()}`
                    });
                }
                if (prop === 'updateKostSubmission') {
                    return async (targetId, subData) => ({
                        success: true,
                        data: {
                            id: targetId,
                            name: subData.name || 'Kost Contoh (Simulasi)',
                            contactsRaw: subData.contactsRaw || 'wa: 08123456789',
                            status: 'pending'
                        }
                    });
                }
                if (prop === 'reviewKostSubmission') {
                    return async (targetId, newStatus) => ({
                        success: true,
                        submission: {
                            id: targetId,
                            name: 'Kost Contoh (Simulasi)',
                            status: newStatus
                        }
                    });
                }
                if (prop === 'deleteKostSubmission') {
                    return async (targetId) => ({
                        success: true,
                        message: `Usulan #${targetId} berhasil dihapus (Simulasi Sandbox).`
                    });
                }
                if (prop === 'saveBroadcast' || prop === 'markBroadcastDeleted') {
                    return () => ({ id: `sim_bc_${Date.now()}` });
                }
                if (prop === 'addOwner' || prop === 'removeOwner' || prop === 'setGroupWelcome') {
                    return async () => true;
                }
                if (prop === 'isGroupInitialized') {
                    return () => true; // Always true in simulation context so admin commands can run preview
                }

                const orig = Reflect.get(target, prop, receiver);
                if (typeof orig === 'function') {
                    return orig.bind(target);
                }
                return orig;
            }
        });

        const ctx = {
            sock: virtualSock,
            msg: virtualMsg,
            from: simulatedFrom,
            senderNumber: cleanSender,
            args,
            command: invokedCommand,
            body: `!${invokedCommand} ${args.join(' ')}`.trim(),
            isGroup,
            reply: async (text) => {
                capturedReplies.push(typeof text === 'string' ? text : (text?.text || JSON.stringify(text)));
            },
            send: async (content) => {
                capturedReplies.push(typeof content === 'string' ? content : (content?.text || content?.caption || '🎨 [Media Terlampir]'));
            },
            commands: registry,
            services: {
                database: sandboxedDatabase,
                serverStats: require('../services/serverStats')
            },
            utils: {
                json: require('../utils/json'),
                phone: require('../utils/phone'),
                jid: require('../utils/jid'),
                group: require('../utils/group')
            }
        };

        // 1. Check Command Registry
        const cmdObj = registry.get(targetCmdName);
        if (cmdObj) {
            await cmdObj.execute(ctx);
        } else {
            // 2. Check Real Autoreply from Database (support custom free input phrase matching)
            const checkQuery = rawInput === 'custom' ? (param || '').trim() : `!${targetCmdName} ${args.join(' ')}`.trim();
            const matchedAr = database.findAutoreply(checkQuery, simulatedFrom) || database.findAutoreply(targetCmdName, simulatedFrom);
            if (matchedAr) {
                let responseText = matchedAr.response || matchedAr.reply || 'Pesan otomatis berhasil dipicu.';
                const now = new Date();
                const timeWib = now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
                const dateWib = now.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full' });
                responseText = responseText
                    .replace(/\{jid\}/gi, simulatedFrom)
                    .replace(/\{groupJid\}/gi, simulatedFrom)
                    .replace(/\{groupId\}/gi, simulatedFrom)
                    .replace(/\{userId\}/gi, cleanSender)
                    .replace(/\{userJid\}/gi, `${cleanSender}@s.whatsapp.net`)
                    .replace(/\{sender\}/gi, cleanSender)
                    .replace(/\{senderNumber\}/gi, cleanSender)
                    .replace(/\{groupName\}/gi, 'Komunitas Kos Bukittinggi')
                    .replace(/\{group\}/gi, 'Komunitas Kos Bukittinggi')
                    .replace(/\{time\}/gi, timeWib)
                    .replace(/\{date\}/gi, dateWib)
                    .replace(/\{prefix\}/gi, '!');
                capturedReplies.push(responseText);
            } else {
                capturedReplies.push(`❓ Perintah *!${targetCmdName}* tidak ditemukan di sistem.\n\nKetik *!help* atau *!menu* untuk melihat daftar perintah yang tersedia.`);
            }
        }

        const finalOutput = capturedReplies.filter(Boolean).join('\n\n────────────────────\n\n') || '✅ Perintah berhasil diproses tanpa output balasan teks.';

        res.json({
            success: true,
            realtime: true,
            sandbox: true,
            command: targetCmdName,
            args,
            fullUserMsg: `!${targetCmdName} ${args.join(' ')}`.trim(),
            reply: finalOutput
        });
    } catch (err) {
        console.error('[Simulator] Realtime error:', err);
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