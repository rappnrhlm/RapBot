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

app.get('/test', (req, res) => {
    res.send('OK');
});

const server = app.listen(PORT, () => {
    console.log(`[WebServer] 🌐 Owner Manager berjalan di http://localhost:${PORT}`);
});

module.exports = { app, server };