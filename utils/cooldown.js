// utils/cooldown.js - In-memory cooldown & rate-limiter
const cooldownMap = new Map();

// Periodic cleanup of expired cooldowns every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, expiresAt] of cooldownMap.entries()) {
        if (expiresAt <= now) {
            cooldownMap.delete(key);
        }
    }
}, 5 * 60 * 1000).unref();

/**
 * Check if an action is allowed based on cooldown duration
 * @param {string} key - Unique identifier, e.g. "cari:628123@s.whatsapp.net" or "autohelp:120363@g.us"
 * @param {number} durationSeconds - Cooldown duration in seconds
 * @returns {{ allowed: boolean, remainingSeconds: number }}
 */
function checkCooldown(key, durationSeconds = 10) {
    if (!key) return { allowed: true, remainingSeconds: 0 };

    const now = Date.now();
    const expiresAt = cooldownMap.get(key) || 0;

    if (expiresAt > now) {
        const remainingSeconds = Math.ceil((expiresAt - now) / 1000);
        return { allowed: false, remainingSeconds };
    }

    cooldownMap.set(key, now + (durationSeconds * 1000));
    return { allowed: true, remainingSeconds: 0 };
}

/**
 * Clear cooldown for a specific key
 * @param {string} key 
 */
function resetCooldown(key) {
    if (key) cooldownMap.delete(key);
}

module.exports = {
    checkCooldown,
    resetCooldown
};
