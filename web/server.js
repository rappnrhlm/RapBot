require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.WEB_PORT || 3001;
const ADMIN_PIN = process.env.ADMIN_PIN;

const OWNER_FILE = path.join(__dirname, '..', 'data', 'owners.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readOwners() {
    if (!fs.existsSync(OWNER_FILE)) {
        fs.writeFileSync(
            OWNER_FILE,
            JSON.stringify([], null, 4)
        );
    }

    try {
        const data = JSON.parse(
            fs.readFileSync(OWNER_FILE, 'utf8')
        );

        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function writeOwners(owners) {
    fs.writeFileSync(
        OWNER_FILE,
        JSON.stringify(owners, null, 4)
    );
}

function normalizeNumber(number) {
    let value = String(number || '')
        .replace(/\D/g, '');

    if (value.startsWith('0')) {
        value = '62' + value.slice(1);
    }

    return value;
}

function validatePin(pin) {
    return String(pin || '') === String(ADMIN_PIN);
}

app.get('/api/owners', (req, res) => {
    res.json({
        success: true,
        owners: readOwners()
    });
});

app.post('/api/owners', (req, res) => {
    const {
        name,
        number,
        pin
    } = req.body;

    if (!validatePin(pin)) {
        return res.status(401).json({
            success: false,
            message: 'PIN admin salah.'
        });
    }

    const cleanName =
        String(name || '').trim();

    const cleanNumber =
        normalizeNumber(number);

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

    const owners = readOwners();

    if (
        owners.some(
            owner =>
                normalizeNumber(owner.number) ===
                cleanNumber
        )
    ) {
        return res.status(409).json({
            success: false,
            message: 'Nomor tersebut sudah menjadi owner.'
        });
    }

    owners.push({
        name: cleanName,
        number: cleanNumber
    });

    writeOwners(owners);

    res.json({
        success: true,
        message: 'Owner berhasil ditambahkan.',
        owners
    });
});

app.put('/api/owners/:number', (req, res) => {
    const oldNumber =
        normalizeNumber(req.params.number);

    const {
        name,
        number,
        pin
    } = req.body;

    if (!validatePin(pin)) {
        return res.status(401).json({
            success: false,
            message: 'PIN admin salah.'
        });
    }

    const cleanName =
        String(name || '').trim();

    const cleanNumber =
        normalizeNumber(number);

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

    const owners = readOwners();

    const index =
        owners.findIndex(
            owner =>
                normalizeNumber(owner.number) ===
                oldNumber
        );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            message: 'Owner tidak ditemukan.'
        });
    }

    const duplicate =
        owners.some(
            (owner, i) =>
                i !== index &&
                normalizeNumber(owner.number) ===
                cleanNumber
        );

    if (duplicate) {
        return res.status(409).json({
            success: false,
            message: 'Nomor tersebut sudah digunakan owner lain.'
        });
    }

    owners[index] = {
        name: cleanName,
        number: cleanNumber
    };

    writeOwners(owners);

    res.json({
        success: true,
        message: 'Owner berhasil diperbarui.',
        owners
    });
});

app.delete('/api/owners/:number', (req, res) => {
    const number =
        normalizeNumber(req.params.number);

    const {
        pin
    } = req.body;

    if (!validatePin(pin)) {
        return res.status(401).json({
            success: false,
            message: 'PIN admin salah.'
        });
    }

    const owners = readOwners();

    const index =
        owners.findIndex(
            owner =>
                normalizeNumber(owner.number) ===
                number
        );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            message: 'Owner tidak ditemukan.'
        });
    }

    owners.splice(index, 1);

    writeOwners(owners);

    res.json({
        success: true,
        message: 'Owner berhasil dihapus.',
        owners
    });
});

app.get('/test', (req, res) => {
    res.send('OK');
});

app.listen(PORT, () => {
    console.log(
        `Owner Manager berjalan di http://localhost:${PORT}`
    );
});