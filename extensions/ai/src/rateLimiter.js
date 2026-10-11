// extensions/ai/src/rateLimiter.js - Per-user cooldown, hourly limit, and global concurrency guard
class RateLimiter {
    constructor(config) {
        this.config = config;
        this.currentConcurrent = 0;
        this.userCooldowns = new Map(); // userId -> timestamp ms
        this.userHourlyRequests = new Map(); // userId -> array of timestamp ms
    }

    getCurrentConcurrency() {
        return this.currentConcurrent;
    }

    /**
     * Check if a request from userId can proceed and increment concurrency counter
     */
    checkAndAcquire(userId) {
        const cleanUserId = String(userId || 'unknown').trim();

        // 1. Global Concurrency Guard
        if (this.currentConcurrent >= this.config.maxConcurrentRequests) {
            return {
                allowed: false,
                reason: 'concurrency_limit',
                message: `⏳ Server AI sedang memproses kapasitas maksimal (${this.currentConcurrent}/${this.config.maxConcurrentRequests} permintaan). Silakan tunggu sebentar dan coba lagi.`
            };
        }

        const now = Date.now();

        // 2. Per-User Cooldown Guard
        const lastRequest = this.userCooldowns.get(cleanUserId) || 0;
        const elapsedSeconds = (now - lastRequest) / 1000;
        if (elapsedSeconds < this.config.cooldownSeconds) {
            const remaining = Math.ceil(this.config.cooldownSeconds - elapsedSeconds);
            return {
                allowed: false,
                reason: 'cooldown',
                remainingSeconds: remaining,
                message: `⏳ Mohon tunggu ${remaining} detik sebelum mengirim pertanyaan lagi.`
            };
        }

        // 3. Per-User Hourly Rate Limit (sliding window of 1 hour)
        const ONE_HOUR_MS = 60 * 60 * 1000;
        let history = this.userHourlyRequests.get(cleanUserId) || [];
        history = history.filter(ts => (now - ts) < ONE_HOUR_MS);
        this.userHourlyRequests.set(cleanUserId, history);

        if (history.length >= this.config.maxRequestsPerHour) {
            return {
                allowed: false,
                reason: 'hourly_limit',
                limit: this.config.maxRequestsPerHour,
                message: `⚠️ Batas penggunaan tercapai. Anda hanya dapat mengirim maksimal ${this.config.maxRequestsPerHour} pertanyaan AI per jam. Silakan coba lagi nanti.`
            };
        }

        // Acquire lock
        this.currentConcurrent++;
        this.userCooldowns.set(cleanUserId, now);
        history.push(now);

        return {
            allowed: true
        };
    }

    /**
     * Release concurrency lock
     */
    releaseConcurrency() {
        this.currentConcurrent = Math.max(0, this.currentConcurrent - 1);
    }

    /**
     * Clear all records (useful for test reset)
     */
    reset() {
        this.currentConcurrent = 0;
        this.userCooldowns.clear();
        this.userHourlyRequests.clear();
    }
}

module.exports = {
    RateLimiter
};
