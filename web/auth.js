// web/auth.js - Web admin PIN & API Key Token validation and extraction
const { verifyApiKey } = require('../services/apiKeyService');

const ADMIN_PIN = process.env.ADMIN_PIN;

// Simple in-memory rate limiter / brute force protection for failed attempts
const failedAttempts = new Map(); // IP -> { count, blockedUntil }
const MAX_FAILURES = 10;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip) {
    if (!ip) return { blocked: false };
    const now = Date.now();
    const record = failedAttempts.get(ip);
    if (!record) return { blocked: false };

    if (record.blockedUntil && record.blockedUntil > now) {
        const remainingMinutes = Math.ceil((record.blockedUntil - now) / 60000);
        return { blocked: true, message: `Terlalu banyak percobaan autentikasi gagal. IP Anda diblokir sementara selama ${remainingMinutes} menit.` };
    }

    if (record.blockedUntil && record.blockedUntil <= now) {
        failedAttempts.delete(ip);
        return { blocked: false };
    }

    return { blocked: false };
}

function recordFailedAttempt(ip) {
    if (!ip) return;
    const now = Date.now();
    const record = failedAttempts.get(ip) || { count: 0, blockedUntil: null };
    record.count += 1;
    if (record.count >= MAX_FAILURES) {
        record.blockedUntil = now + BLOCK_DURATION_MS;
        console.warn(`[Security] IP ${ip} diblokir sementara karena ${record.count} kali gagal autentikasi.`);
    }
    failedAttempts.set(ip, record);
}

function recordSuccessAttempt(ip) {
    if (ip && failedAttempts.has(ip)) {
        failedAttempts.delete(ip);
    }
}

/**
 * Validate PIN directly
 */
function validatePin(pin) {
    if (!ADMIN_PIN) return true;
    return String(pin || '').trim() === String(ADMIN_PIN).trim();
}

/**
 * Extract PIN from headers, query, or body
 */
function extractPin(req) {
    return req.headers['x-admin-pin'] || req.headers['x-pin'] || req.query?.pin || req.body?.pin || null;
}

/**
 * Extract API Token from Authorization header or custom headers
 * Supports:
 * - Authorization: Bearer rap_live_...
 * - x-api-key: rap_live_...
 * - Authorization: rap_live_...
 */
function extractApiToken(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const parts = authHeader.trim().split(/\s+/);
        if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
            return parts[1];
        }
        if (parts.length === 1 && parts[0].startsWith('rap_live_')) {
            return parts[0];
        }
    }
    return req.headers['x-api-key'] || req.headers['x-token'] || null;
}

/**
 * Unified Auth Checker:
 * Validates request if it provides a valid ADMIN_PIN OR a valid API Key Token.
 * Also applies anti-brute force checking.
 */
function authenticateRequest(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1';

    // Check rate limit first
    const limitCheck = checkRateLimit(ip);
    if (limitCheck.blocked) {
        return {
            success: false,
            statusCode: 429,
            message: limitCheck.message
        };
    }

    // 1. Check API Key Token
    const token = extractApiToken(req);
    if (token) {
        const verifyRes = verifyApiKey(token);
        if (verifyRes.valid) {
            recordSuccessAttempt(ip);
            req.authType = 'token';
            req.apiKey = verifyRes.key;
            return { success: true, authType: 'token', key: verifyRes.key };
        } else {
            recordFailedAttempt(ip);
            return {
                success: false,
                statusCode: 401,
                message: `API Key tidak valid atau telah dinonaktifkan (${verifyRes.reason}).`
            };
        }
    }

    // 2. Check Admin PIN
    const pin = extractPin(req);
    if (pin) {
        if (validatePin(pin)) {
            recordSuccessAttempt(ip);
            req.authType = 'pin';
            return { success: true, authType: 'pin' };
        } else {
            recordFailedAttempt(ip);
            return {
                success: false,
                statusCode: 401,
                message: 'PIN admin salah.'
            };
        }
    }

    // If ADMIN_PIN is not configured at all in server env
    if (!ADMIN_PIN) {
        return { success: true, authType: 'open' };
    }

    // No credentials provided
    return {
        success: false,
        statusCode: 401,
        message: 'Akses ditolak. Sertakan Authorization Bearer Token atau Header PIN Admin.'
    };
}

module.exports = {
    ADMIN_PIN,
    validatePin,
    extractPin,
    extractApiToken,
    authenticateRequest,
    checkRateLimit,
    recordFailedAttempt,
    recordSuccessAttempt
};
