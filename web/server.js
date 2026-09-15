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

// Mark kost sent / toggle status
app.post('/api/kost/:id/sent', async (req, res) => {
    try {
        const { id } = req.params;
        const { sentBy, groupId, pin, sent, status } = req.body;
        const currentPin = pin || extractPin(req);

        if (!validatePin(currentPin)) {
            return res.status(401).json({ success: false, message: 'PIN admin salah.' });
        }

        if (sent === false || status === 'pending') {
            const result = await database.updateKost(id, { status: 'pending', groupId });
            if (!result.success) {
                return res.status(result.notFound ? 404 : 400).json(result);
            }
            return res.json({
                success: true,
                message: 'Status kost berhasil diubah menjadi draft / pending.',
                data: result.data
            });
        }

        const result = await database.markKostSent(id, groupId, sentBy || 'web-admin');
        if (!result.success) {
            return res.status(result.notFound ? 404 : 400).json(result);
        }

        res.json({
            success: true,
            message: 'Status kost berhasil diubah menjadi sent (sudah diposting).',
            data: result.data
        });
    } catch (err) {
        console.error('[web/server] Error POST /api/kost/:id/sent:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status publikasi kost.' });
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

        for (const jid of targetJids) {
            try {
                await activeBotSocket.sendMessage(jid, { text: String(message) });
                sentCount++;
                // Small delay to avoid rate limit
                await new Promise(r => setTimeout(r, 400));
            } catch (sendErr) {
                console.warn(`[web/server] Gagal mengirim siaran ke ${jid}:`, sendErr.message);
                errors.push({ jid, error: sendErr.message });
            }
        }

        database.logCommand(`broadcast:${target || 'custom'}`, 'system', 'admin', true);

        res.json({
            success: true,
            message: `Pesan siaran berhasil dikirim ke ${sentCount} dari ${targetJids.length} grup.`,
            sentCount,
            totalTarget: targetJids.length,
            errors: errors.length > 0 ? errors : undefined
        });
    } catch (err) {
        console.error('[web/server] Error broadcast:', err);
        res.status(500).json({ success: false, message: `Gagal mengirim siaran: ${err.message}` });
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