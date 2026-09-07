require('dotenv').config();
const fs = require('fs');
const path = require('path');
const database = require('../services/database');

const GROUPS_DATA = {
    groups: [
        {
            id: '120363429518970623@g.us',
            name: 'Bukittinggi Kos',
            groupName: 'admin @bukittinggikos',
            initializedAt: '2026-09-07T14:38:00.333Z',
            initializedBy: '6285195532009'
        }
    ]
};

const KOST_RECORDS = [
    {
        id: 'KST-000001',
        group_id: '120363429518970623@g.us',
        name: 'Kost Farrel',
        instagram: 'kostfarrel_bukittinggi',
        tiktok: null,
        whatsapp: null,
        status: 'sent',
        added_by: '6285195532009',
        created_at: '2026-09-07 21:45:55',
        sent_by: '6282171641083',
        sent_at: '2026-09-07 23:00:39'
    },
    {
        id: 'KST-000002',
        group_id: '120363429518970623@g.us',
        name: 'Kost Putri Enam Dua',
        instagram: 'kostputrienamdua',
        tiktok: null,
        whatsapp: null,
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 22:53:25',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000003',
        group_id: '120363429518970623@g.us',
        name: 'Kost Al Hazen',
        instagram: 'kost_al_hazen_bukittinggi',
        tiktok: null,
        whatsapp: null,
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:08:31',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000004',
        group_id: '120363429518970623@g.us',
        name: 'Kos Gunapaksi',
        instagram: 'suchi_putri',
        tiktok: null,
        whatsapp: null,
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:12:40',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000005',
        group_id: '120363429518970623@g.us',
        name: 'Fatimah Guesthouse',
        instagram: 'fatimah_guesthouse',
        tiktok: null,
        whatsapp: null,
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:14:55',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000006',
        group_id: '120363429518970623@g.us',
        name: 'Kost Putri',
        instagram: 'dhiyazzu_',
        tiktok: null,
        whatsapp: null,
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:16:04',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000007',
        group_id: '120363429518970623@g.us',
        name: 'Mubarak Homestay & Kost',
        instagram: 'mubarak_homestaybkt',
        tiktok: null,
        whatsapp: null,
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:28:57',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000008',
        group_id: '120363429518970623@g.us',
        name: 'Sabila Homestay',
        instagram: 'sabilahomestay',
        tiktok: null,
        whatsapp: '6282283771685',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:30:04',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000009',
        group_id: '120363429518970623@g.us',
        name: 'Kos Putri Tangah Sawah',
        instagram: null,
        tiktok: null,
        whatsapp: '6281268201018',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:33:03',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000010',
        group_id: '120363429518970623@g.us',
        name: 'Kontrakan Jorong Tampaik',
        instagram: null,
        tiktok: null,
        whatsapp: '6285760271400',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:34:00',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000011',
        group_id: '120363429518970623@g.us',
        name: 'Kontrakan jl.Cangkiang',
        instagram: null,
        tiktok: null,
        whatsapp: '6281267075917',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:35:18',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000012',
        group_id: '120363429518970623@g.us',
        name: 'Kost di Birugo',
        instagram: null,
        tiktok: null,
        whatsapp: '6281374043580',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:36:03',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000013',
        group_id: '120363429518970623@g.us',
        name: 'Kontrakan simpang pakan ladang',
        instagram: null,
        tiktok: null,
        whatsapp: '6281372282374',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:37:11',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000014',
        group_id: '120363429518970623@g.us',
        name: 'Kost Putri dekat UIN',
        instagram: 'kost_uin_bukittinggi',
        tiktok: null,
        whatsapp: '6285718745033',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:38:26',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000015',
        group_id: '120363429518970623@g.us',
        name: 'Rumah Kita',
        instagram: null,
        tiktok: null,
        whatsapp: '6281277224179',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:39:31',
        sent_by: null,
        sent_at: null
    },
    {
        id: 'KST-000016',
        group_id: '120363429518970623@g.us',
        name: 'Kost Putri Gulai Bancah',
        instagram: null,
        tiktok: null,
        whatsapp: '6288279032407',
        status: 'pending',
        added_by: '6285195532009',
        created_at: '2026-09-07 23:40:21',
        sent_by: null,
        sent_at: null
    }
];

async function seed() {
    console.log('🌱 Menyiapkan data awal untuk server...\n');

    // 1. Pastikan folder data dan file groups.json ada
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    const groupsFile = path.join(dataDir, 'groups.json');
    if (!fs.existsSync(groupsFile)) {
        fs.writeFileSync(groupsFile, JSON.stringify(GROUPS_DATA, null, 4));
        console.log('✅ data/groups.json berhasil dibuat (Grup Bukittinggi Kos terdaftar).');
    } else {
        const currentGroups = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
        const exists = (currentGroups.groups || []).some(g => g.id === GROUPS_DATA.groups[0].id);
        if (!exists) {
            currentGroups.groups = currentGroups.groups || [];
            currentGroups.groups.push(GROUPS_DATA.groups[0]);
            fs.writeFileSync(groupsFile, JSON.stringify(currentGroups, null, 4));
            console.log('✅ Grup Bukittinggi Kos ditambahkan ke data/groups.json.');
        } else {
            console.log('ℹ️ data/groups.json sudah memiliki grup Bukittinggi Kos.');
        }
    }

    // 2. Insert ke MariaDB
    await database.ensureKostTable();
    const db = database.getPool();

    let inserted = 0;
    let updated = 0;

    for (const k of KOST_RECORDS) {
        const [res] = await db.query(
            `INSERT INTO kost (id, group_id, name, instagram, tiktok, whatsapp, status, added_by, created_at, sent_by, sent_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             instagram = VALUES(instagram),
             tiktok = VALUES(tiktok),
             whatsapp = VALUES(whatsapp),
             status = VALUES(status),
             sent_by = VALUES(sent_by),
             sent_at = VALUES(sent_at)`,
            [k.id, k.group_id, k.name, k.instagram, k.tiktok, k.whatsapp, k.status, k.added_by, k.created_at, k.sent_by, k.sent_at]
        );

        if (res.affectedRows === 1) {
            inserted++;
        } else if (res.affectedRows === 2) {
            updated++;
        }
    }

    console.log(`\n🎉 SEEDING SELESAI:`);
    console.log(`   - Data baru masuk: ${inserted}`);
    console.log(`   - Data diperbarui: ${updated}`);
    console.log(`   - Total record: ${KOST_RECORDS.length} kost terdaftar di database server.`);
    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Gagal melakukan seeding:', err);
    process.exit(1);
});
