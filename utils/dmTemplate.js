// utils/dmTemplate.js - Helper generator template pesan promosi kos
const phoneUtils = require('./phone');

const DEFAULT_DM_TEMPLATE = 
`Halo Kak, salam kenal dari tim @bukittinggikos 👋

Kami lihat {nama_kos} lokasinya strategis dan tempatnya nyaman banget. Kebetulan kami baru buat platform informasi kos & kontrakan khusus wilayah Bukittinggi.

Karena baru launching, kami mau menawarkan promosi gratis untuk {nama_kos} supaya bisa makin dikenal pencari kos di Bukittinggi.

Kalau Kakak berminat, cukup kirimkan foto unit dan detail harganya ya, nanti bantu kami buatkan postingannya.

Terima kasih banyak Kak, semoga sehat selalu!`;

/**
 * Menghasilkan teks template yang sudah diisi nama kos
 * @param {string} kostName 
 * @param {string} customTemplate 
 * @returns {string}
 */
function generateDmText(kostName, customTemplate = null) {
    const cleanName = String(kostName || 'Kos').trim();
    const template = customTemplate || DEFAULT_DM_TEMPLATE;
    return template.replace(/\{nama_kos\}/g, cleanName);
}

/**
 * Menghasilkan link wa.me lengkap dengan URL-encoded prefill text
 * @param {string} rawPhone 
 * @param {string} kostName 
 * @param {string} customTemplate 
 * @returns {string|null}
 */
function generateWhatsappDmUrl(rawPhone, kostName, customTemplate = null) {
    if (!rawPhone) return null;
    const cleanPhone = phoneUtils.normalizePhoneNumber(rawPhone);
    if (!cleanPhone) return null;

    const messageText = generateDmText(kostName, customTemplate);
    const encoded = encodeURIComponent(messageText);
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

module.exports = {
    DEFAULT_DM_TEMPLATE,
    generateDmText,
    generateWhatsappDmUrl
};
