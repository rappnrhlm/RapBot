// extensions/kost/storage/submissions.js - MariaDB repository for crowdsourced kost submissions
const { getPool } = require('../../../core/storage/mariadb/pool');
const { ensureAllTables } = require('../../../core/storage/mariadb/schema');
const { SUBMISSIONS_FILE, cache, syncDataFile } = require('../../../core/storage/json/cache');
const { normalizeJid } = require('../../../core/utils/jid');

async function addKostSubmission({ groupId, name, contactsRaw, submittedBy = '' }) {
    await ensureAllTables();
    const cleanGroupId = groupId ? normalizeJid(groupId) : '';
    const cleanName = String(name || '').trim();
    const cleanContacts = String(contactsRaw || '').trim();
    const cleanSubmitter = String(submittedBy || '').trim();

    if (!cleanName || !cleanContacts) {
        return { success: false, message: 'Nama kos dan kontak wajib diisi.' };
    }

    const db = getPool();
    const now = new Date();
    const [result] = await db.query(
        `INSERT INTO kost_submissions (group_id, name, contacts_raw, submitted_by, submitted_at, status)
         VALUES (?, ?, ?, ?, ?, 'pending')`,
        [cleanGroupId, cleanName, cleanContacts, cleanSubmitter, now]
    );

    const submission = {
        id: result.insertId,
        groupId: cleanGroupId,
        name: cleanName,
        contactsRaw: cleanContacts,
        submittedBy: cleanSubmitter,
        submittedAt: now.toISOString(),
        status: 'pending',
        reviewedBy: null,
        reviewedAt: null
    };

    cache.submissions.unshift(submission);
    syncDataFile(SUBMISSIONS_FILE, cache.submissions);

    return {
        success: true,
        message: 'Usulan kos berhasil dikirim.',
        submission,
        data: submission
    };
}

async function getKostSubmissions({ groupId = null, status = 'pending' } = {}) {
    await ensureAllTables();
    const db = getPool();
    let query = 'SELECT * FROM kost_submissions';
    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
        conditions.push('status = ?');
        params.push(status);
    }
    if (groupId) {
        conditions.push('group_id = ?');
        params.push(normalizeJid(groupId));
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY id DESC';

    const [rows] = await db.query(query, params);
    return rows.map(r => ({
        id: r.id,
        groupId: r.group_id,
        name: r.name,
        contactsRaw: r.contacts_raw,
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at
    }));
}

async function getKostSubmissionById(id) {
    const cleanId = Number(id);
    if (!cleanId || isNaN(cleanId)) return null;
    await ensureAllTables();
    const db = getPool();
    const [rows] = await db.query('SELECT * FROM kost_submissions WHERE id = ?', [cleanId]);
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
        id: r.id,
        groupId: r.group_id,
        name: r.name,
        contactsRaw: r.contacts_raw,
        submittedBy: r.submitted_by,
        submittedAt: r.submitted_at,
        status: r.status,
        reviewedBy: r.reviewed_by,
        reviewedAt: r.reviewed_at
    };
}

async function reviewKostSubmission(id, newStatus, reviewerNumber = '') {
    await ensureAllTables();
    const cleanId = Number(id);
    if (!cleanId || isNaN(cleanId)) {
        return { success: false, message: 'ID usulan tidak valid.' };
    }
    const cleanStatus = ['approved', 'rejected'].includes(newStatus) ? newStatus : 'pending';

    const db = getPool();
    const [rows] = await db.query('SELECT * FROM kost_submissions WHERE id = ?', [cleanId]);
    if (rows.length === 0) {
        return { success: false, message: `Usulan #${cleanId} tidak ditemukan.` };
    }

    const sub = rows[0];
    if (sub.status !== 'pending') {
        return { success: false, message: `Usulan #${cleanId} sudah di-${sub.status} sebelumnya.` };
    }

    const now = new Date();
    await db.query(
        `UPDATE kost_submissions 
         SET status = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ?`,
        [cleanStatus, reviewerNumber || 'admin', now, cleanId]
    );

    const item = cache.submissions.find(s => Number(s.id) === cleanId);
    if (item) {
        item.status = cleanStatus;
        item.reviewedBy = reviewerNumber || 'admin';
        item.reviewedAt = now.toISOString();
        syncDataFile(SUBMISSIONS_FILE, cache.submissions);
    }

    return {
        success: true,
        status: cleanStatus,
        submission: {
            id: sub.id,
            groupId: sub.group_id,
            name: sub.name,
            contactsRaw: sub.contacts_raw,
            submittedBy: sub.submitted_by
        }
    };
}

async function updateKostSubmission(id, { name, contactsRaw, groupId, status, reviewedBy } = {}) {
    const cleanId = Number(id);
    if (!cleanId || isNaN(cleanId)) return { success: false, message: 'ID usulan tidak valid.' };
    await ensureAllTables();
    const db = getPool();

    const [rows] = await db.query('SELECT * FROM kost_submissions WHERE id = ?', [cleanId]);
    if (rows.length === 0) {
        return { success: false, notFound: true, message: `Usulan #${cleanId} tidak ditemukan.` };
    }

    const current = rows[0];
    const newName = name !== undefined ? String(name).trim() : current.name;
    const newContacts = contactsRaw !== undefined ? String(contactsRaw).trim() : current.contacts_raw;
    const newGroupId = groupId !== undefined ? (groupId ? normalizeJid(groupId) : current.group_id) : current.group_id;
    const newStatus = status !== undefined && ['pending', 'approved', 'rejected'].includes(status) ? status : current.status;
    const newReviewer = reviewedBy !== undefined ? String(reviewedBy).trim() : current.reviewed_by;
    const reviewDate = (newStatus !== 'pending' && !current.reviewed_at) ? new Date() : (newStatus === 'pending' ? null : current.reviewed_at);

    if (!newName) {
        return { success: false, message: 'Nama usulan tidak boleh kosong.' };
    }

    await db.query(
        `UPDATE kost_submissions
         SET name = ?, contacts_raw = ?, group_id = ?, status = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ?`,
        [newName, newContacts, newGroupId, newStatus, newReviewer || null, reviewDate, cleanId]
    );

    const updated = {
        id: cleanId,
        groupId: newGroupId,
        name: newName,
        contactsRaw: newContacts,
        submittedBy: current.submitted_by,
        submittedAt: current.submitted_at,
        status: newStatus,
        reviewedBy: newReviewer || null,
        reviewedAt: reviewDate ? (reviewDate instanceof Date ? reviewDate.toISOString() : String(reviewDate)) : null
    };

    const cacheIdx = cache.submissions.findIndex(s => Number(s.id) === cleanId);
    if (cacheIdx !== -1) {
        cache.submissions[cacheIdx] = updated;
    } else {
        cache.submissions.push(updated);
    }
    syncDataFile(SUBMISSIONS_FILE, cache.submissions);

    return {
        success: true,
        message: `Usulan #${cleanId} berhasil diperbarui.`,
        data: updated,
        submission: updated
    };
}

async function deleteKostSubmission(id) {
    const cleanId = Number(id);
    if (!cleanId || isNaN(cleanId)) return { success: false, message: 'ID usulan tidak valid.' };
    await ensureAllTables();
    const db = getPool();
    await db.query('DELETE FROM kost_submissions WHERE id = ?', [cleanId]);
    cache.submissions = cache.submissions.filter(s => Number(s.id) !== cleanId);
    syncDataFile(SUBMISSIONS_FILE, cache.submissions);
    return { success: true, message: 'Usulan berhasil dihapus.' };
}

module.exports = {
    addKostSubmission,
    getKostSubmissions,
    getKostSubmissionById,
    updateKostSubmission,
    reviewKostSubmission,
    deleteKostSubmission
};
