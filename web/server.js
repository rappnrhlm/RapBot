require('dotenv').config();

const express = require('express');
const path = require('path');
const database = require('../services/database');
const { normalizePhoneNumber } = require('../utils/phone');

const app = express();
const PORT = process.env.WEB_PORT || 3001;
const ADMIN_PIN = process.env.ADMIN_PIN;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function validatePin(pin) {
    return Boolean(ADMIN_PIN && String(pin || '') === String(ADMIN_PIN));
}

app.get('/api/owners', (req, res) => {
    res.json({
        success: true,
        owners: database.getOwners()
    });
});

app.post('/api/owners', (req, res) => {
    const { name, number, pin } = req.body;

    if (!validatePin(pin)) {
        return res.status(401).json({
            success: false,
            message: 'PIN admin salah.'
        });
    }

    const cleanName = String(name || '').trim();
    const cleanNumber = normalizePhoneNumber(number);

    if (!cleanName) {
        return res.status(400).json({
            success: false,
            message: 'Nama wajib diisi.'
        });
    }

    if (!cleanNumber) {
        return res.status(400).json({
            success: false,
            message: 'Nomor WhatsApp wajib diisi.'
        });
    }

    const owners = database.getOwners();

    if (owners.some(owner => {
        const oNum = typeof owner === 'object' ? owner.number : owner;
        return normalizePhoneNumber(oNum) === cleanNumber;
    })) {
        return res.status(409).json({
            success: false,
            message: 'Nomor tersebut sudah menjadi owner.'
        });
    }

    owners.push({
        name: cleanName,
        number: cleanNumber,
        hidden: false
    });

    database.saveOwners(owners);

    res.json({
        success: true,
        message: 'Owner berhasil ditambahkan.',
        owners
    });
});

app.put('/api/owners/:number', (req, res) => {
    const oldNumber = normalizePhoneNumber(req.params.number);
    const { name, number, pin } = req.body;

    if (!validatePin(pin)) {
        return res.status(401).json({
            success: false,
            message: 'PIN admin salah.'
        });
    }

    const cleanName = String(name || '').trim();
    const cleanNumber = normalizePhoneNumber(number);

    if (!cleanName) {
        return res.status(400).json({
            success: false,
            message: 'Nama wajib diisi.'
        });
    }

    if (!cleanNumber) {
        return res.status(400).json({
            success: false,
            message: 'Nomor WhatsApp wajib diisi.'
        });
    }

    const owners = database.getOwners();
    const index = owners.findIndex(owner => {
        const oNum = typeof owner === 'object' ? owner.number : owner;
        return normalizePhoneNumber(oNum) === oldNumber;
    });

    if (index === -1) {
        return res.status(404).json({
            success: false,
            message: 'Owner tidak ditemukan.'
        });
    }

    const duplicate = owners.some((owner, i) => {
        if (i === index) return false;
        const oNum = typeof owner === 'object' ? owner.number : owner;
        return normalizePhoneNumber(oNum) === cleanNumber;
    });

    if (duplicate) {
        return res.status(409).json({
            success: false,
            message: 'Nomor tersebut sudah digunakan owner lain.'
        });
    }

    const currentOwner = owners[index];
    owners[index] = {
        name: cleanName,
        number: cleanNumber,
        hidden: currentOwner?.hidden || false
    };

    database.saveOwners(owners);

    res.json({
        success: true,
        message: 'Owner berhasil diperbarui.',
        owners
    });
});

app.delete('/api/owners/:number', (req, res) => {
    const number = normalizePhoneNumber(req.params.number);
    const { pin } = req.body;

    if (!validatePin(pin)) {
        return res.status(401).json({
            success: false,
            message: 'PIN admin salah.'
        });
    }

    if (database.isSuperOwner(number)) {
        return res.status(403).json({
            success: false,
            message: 'Super owner tidak bisa dihapus.'
        });
    }

    const owners = database.getOwners();
    const index = owners.findIndex(owner => {
        const oNum = typeof owner === 'object' ? owner.number : owner;
        return normalizePhoneNumber(oNum) === number;
    });

    if (index === -1) {
        return res.status(404).json({
            success: false,
            message: 'Owner tidak ditemukan.'
        });
    }

    owners.splice(index, 1);
    database.saveOwners(owners);

    res.json({
        success: true,
        message: 'Owner berhasil dihapus.',
        owners
    });
});

function extractPin(req) {
    return req.body?.pin || req.headers['x-pin'] || req.query?.pin;
}

// ----------------------------------------------------
// BUKITTINGGI KOS WEB ADMIN API
// ----------------------------------------------------

// Serve Bukittinggi Kos admin page
app.get('/kost', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'kost.html'));
});

// List registered groups
app.get('/api/groups', (req, res) => {
    try {
        const groups = database.getGroups();
        res.json({ success: true, groups });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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
        console.error('[web/server] Error GET /api/kost/:id:', err);
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

// Update kost (name, instagram, tiktok, whatsapp, status)
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

app.get('/test', (req, res) => {
    res.send('OK');
});

const server = app.listen(PORT, () => {
    console.log(`[WebServer] 🌐 Owner Manager berjalan di http://localhost:${PORT}`);
});

module.exports = { app, server };