// services/apiKeyService.js - API Key Management and Verification
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const API_KEYS_FILE = path.join(DATA_DIR, 'api_keys.json');

// In-memory cache
let apiKeysCache = [];

function ensureStorage() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(API_KEYS_FILE)) {
        fs.writeFileSync(API_KEYS_FILE, JSON.stringify([], null, 2), 'utf-8');
    }
}

function loadApiKeys() {
    try {
        ensureStorage();
        const data = fs.readFileSync(API_KEYS_FILE, 'utf-8');
        apiKeysCache = JSON.parse(data || '[]');
        if (!Array.isArray(apiKeysCache)) apiKeysCache = [];
    } catch (err) {
        console.error('[ApiKeyService] Failed to load api_keys.json:', err.message);
        apiKeysCache = [];
    }
    return apiKeysCache;
}

function saveApiKeys() {
    try {
        ensureStorage();
        fs.writeFileSync(API_KEYS_FILE, JSON.stringify(apiKeysCache, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ApiKeyService] Failed to save api_keys.json:', err.message);
    }
}

// Initialize on load
loadApiKeys();

function hashToken(rawKey) {
    return crypto.createHash('sha256').update(String(rawKey).trim()).digest('hex');
}

/**
 * Generate a new API Key with high entropy
 * Key format: rap_live_<hex32> (41 characters)
 */
function createApiKey({ name = 'Unnamed Key', description = '', createdBy = 'admin' } = {}) {
    loadApiKeys();
    const randomBytes = crypto.randomBytes(20).toString('hex');
    const rawKey = `rap_live_${randomBytes}`;
    const keyHash = hashToken(rawKey);
    const id = `key_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 14) + '...';

    const newKeyObj = {
        id,
        name: String(name || 'Unnamed Key').trim(),
        description: String(description || '').trim(),
        keyPrefix,
        keyHash,
        createdBy,
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        usageCount: 0,
        isActive: true
    };

    apiKeysCache.push(newKeyObj);
    saveApiKeys();

    return {
        ...newKeyObj,
        rawKey // only returned ONCE upon creation
    };
}

/**
 * List all keys (without hash or rawKey)
 */
function listApiKeys() {
    loadApiKeys();
    return apiKeysCache.map(k => ({
        id: k.id,
        name: k.name,
        description: k.description,
        keyPrefix: k.keyPrefix,
        createdBy: k.createdBy,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
        usageCount: k.usageCount || 0,
        isActive: k.isActive !== false
    }));
}

/**
 * Revoke/Delete an API key by ID
 */
function revokeApiKey(id) {
    loadApiKeys();
    const index = apiKeysCache.findIndex(k => k.id === id);
    if (index === -1) return false;
    apiKeysCache.splice(index, 1);
    saveApiKeys();
    return true;
}

/**
 * Toggle Active Status of an API key
 */
function toggleApiKeyStatus(id, isActive) {
    loadApiKeys();
    const key = apiKeysCache.find(k => k.id === id);
    if (!key) return null;
    key.isActive = Boolean(isActive);
    saveApiKeys();
    return key;
}

/**
 * Verify incoming raw token from Authorization Header / x-api-key
 */
function verifyApiKey(rawKey) {
    if (!rawKey) return { valid: false, reason: 'No key provided' };
    const cleanKey = String(rawKey).trim();
    if (!cleanKey.startsWith('rap_live_')) {
        return { valid: false, reason: 'Invalid token format' };
    }

    loadApiKeys();
    const incomingHash = hashToken(cleanKey);
    const foundKey = apiKeysCache.find(k => k.keyHash === incomingHash);

    if (!foundKey) {
        return { valid: false, reason: 'Token not found' };
    }

    if (foundKey.isActive === false) {
        return { valid: false, reason: 'Token is deactivated' };
    }

    // Update usage metric asynchronously
    foundKey.lastUsedAt = new Date().toISOString();
    foundKey.usageCount = (foundKey.usageCount || 0) + 1;
    saveApiKeys();

    return {
        valid: true,
        key: {
            id: foundKey.id,
            name: foundKey.name,
            keyPrefix: foundKey.keyPrefix
        }
    };
}

module.exports = {
    createApiKey,
    listApiKeys,
    revokeApiKey,
    toggleApiKeyStatus,
    verifyApiKey,
    loadApiKeys
};
