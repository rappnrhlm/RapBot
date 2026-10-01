// web/auth.js - Web admin PIN validation and extraction
const ADMIN_PIN = process.env.ADMIN_PIN;

function validatePin(pin) {
    if (!ADMIN_PIN) return true;
    return String(pin || '').trim() === String(ADMIN_PIN).trim();
}

function extractPin(req) {
    return req.headers['x-admin-pin'] || req.headers['x-pin'] || req.query?.pin || req.body?.pin || null;
}

module.exports = {
    ADMIN_PIN,
    validatePin,
    extractPin
};
