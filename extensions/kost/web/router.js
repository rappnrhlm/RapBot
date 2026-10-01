// extensions/kost/web/router.js - Express API router for Bukittinggi Kos extension
const express = require('express');
const router = express.Router();
const path = require('path');

const database = require('../../../services/database');
const { validatePin, extractPin } = require('../../../web/auth');
const { getBotSocket } = require('../../../web/socket');

// Serve Bukittinggi Kos legacy url redirect to main
router.get('/kost', (req, res) => {
    res.redirect('/#groups');
});

// Get kost list + stats
router.get('/api/kost', async (req, res) => {
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
        console.error('[extensions/kost/web] Error GET /api/kost:', err);
        res.status(500).json({ success: false, message: 'Gagal memuat data kost.' });
    }
});

// Get single kost detail
router.get('/api/kost/:id', async (req, res) => {
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
router.post('/api/kost', async (req, res) => {
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
        console.error('[extensions/kost/web] Error POST /api/kost:', err);
        res.status(500).json({ success: false, message: 'Gagal menambahkan kost.' });
    }
});

// Update kost
router.put('/api/kost/:id', async (req, res) => {
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
        console.error('[extensions/kost/web] Error PUT /api/kost/:id:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui kost.' });
    }
});

// Dynamic universal status changer: pending | sent | published
router.post('/api/kost/:id/status', async (req, res) => {
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
        console.error('[extensions/kost/web] Error POST /api/kost/:id/status:', err);
        res.status(500).json({ success: false, message: 'Gagal mengubah status kost.' });
    }
});

// Mark kost sent / toggle status (sent vs pending)
router.post('/api/kost/:id/sent', async (req, res) => {
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
        console.error('[extensions/kost/web] Error POST /api/kost/:id/sent:', err);
        res.status(500).json({ success: false, message: 'Gagal memperbarui status penawaran kost.' });
    }
});

// Mark kost published (tayang ke publik) / unpublish
router.post('/api/kost/:id/publish', async (req, res) => {
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
        console.error('[extensions/kost/web] Error POST /api/kost/:id/publish:', err);
        res.status(500).json({ success: false, message: 'Gagal mempublikasikan data kost.' });
    }
});

// Delete kost
router.delete('/api/kost/:id', async (req, res) => {
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
        console.error('[extensions/kost/web] Error DELETE /api/kost/:id:', err);
        res.status(500).json({ success: false, message: 'Gagal menghapus kost.' });
    }
});

// Import / Restore kost data
router.post('/api/kost/import', async (req, res) => {
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
        console.error('[extensions/kost/web] Error POST /api/kost/import:', err);
        res.status(500).json({ success: false, message: 'Gagal mengimpor data: ' + err.message });
    }
});

// Submissions List
router.get('/api/submissions', async (req, res) => {
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
router.post('/api/submissions/:id/review', async (req, res) => {
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
router.put('/api/submissions/:id', async (req, res) => {
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
        console.error('[extensions/kost/web] Error PUT /api/submissions/:id:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// Delete Submission
router.delete('/api/submissions/:id', async (req, res) => {
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

module.exports = router;
