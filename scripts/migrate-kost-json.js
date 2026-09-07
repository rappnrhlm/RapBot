/**
 * scripts/migrate-kost-json.js
 * One-time idempotent migration script to import data from data/kost.json to MariaDB.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const database = require('../services/database');

async function runMigration() {
    console.log('🚀 Memulai migrasi data dari data/kost.json ke MariaDB (RapDB)...');

    const jsonPath = path.join(__dirname, '..', 'data', 'kost.json');
    if (!fs.existsSync(jsonPath)) {
        console.log('ℹ️ File data/kost.json tidak ditemukan. Tidak ada data untuk dimigrasikan.');
        process.exit(0);
    }

    let records = [];
    try {
        const raw = fs.readFileSync(jsonPath, 'utf-8');
        records = JSON.parse(raw);
    } catch (err) {
        console.error('❌ Gagal membaca atau parse data/kost.json:', err.message);
        process.exit(1);
    }

    if (!Array.isArray(records) || records.length === 0) {
        console.log('ℹ️ data/kost.json kosong. Tidak ada record untuk dimigrasikan.');
        process.exit(0);
    }

    console.log(`📄 Ditemukan ${records.length} record di data/kost.json.`);

    // 1. Pastikan tabel kost sudah tersedia
    await database.ensureKostTable();
    const db = database.getPool();

    let insertedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const item of records) {
        const id = item.id ? String(item.id).trim().toUpperCase() : null;
        if (!id) {
            console.warn(`⚠️ Melewati record tanpa ID:`, item);
            skippedCount++;
            continue;
        }

        const name = item.name || item.namaKost || '';
        const instagram = database.cleanInstagramUsername(item.instagram || '');
        const groupId = item.groupId || item.group_id || '';
        const status = (item.status || 'pending').toLowerCase() === 'sent' ? 'sent' : 'pending';
        const addedBy = item.addedBy || item.added_by || null;
        const sentBy = item.sentBy || item.sent_by || null;

        let createdAt = null;
        if (item.createdAt) {
            const d = new Date(item.createdAt);
            if (!isNaN(d.getTime())) createdAt = d;
        }
        if (!createdAt) createdAt = new Date();

        let sentAt = null;
        if (item.sentAt) {
            const d = new Date(item.sentAt);
            if (!isNaN(d.getTime())) sentAt = d;
        }

        try {
            // Cek apakah ID sudah ada di MariaDB
            const [existing] = await db.query('SELECT id FROM kost WHERE id = ?', [id]);
            if (existing.length > 0) {
                console.log(`⏩ [SKIP] ${id} (${name}) sudah ada di database MariaDB.`);
                skippedCount++;
                continue;
            }

            // Insert ke MariaDB
            await db.query(
                `INSERT INTO kost (id, group_id, name, instagram, status, added_by, created_at, sent_by, sent_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, groupId, name, instagram, status, addedBy, createdAt, sentBy, sentAt]
            );

            console.log(`✅ [INSERT] ${id} - "${name}" (@${instagram}) [${status}] berhasil dimigrasikan.`);
            insertedCount++;
        } catch (err) {
            console.error(`❌ Gagal migrasi record ${id}:`, err.message);
            errorCount++;
        }
    }

    console.log('\n=========================================');
    console.log('🎉 HASIL MIGRASI KOST JSON KE MARIADB:');
    console.log(`- Total Record Dibaca : ${records.length}`);
    console.log(`- Berhasil Disimpan   : ${insertedCount}`);
    console.log(`- Dilewati (Sudah Ada): ${skippedCount}`);
    console.log(`- Gagal / Error       : ${errorCount}`);
    console.log('=========================================\n');

    process.exit(0);
}

runMigration().catch(err => {
    console.error('❌ Fatal error during migration:', err);
    process.exit(1);
});
