// extensions/ai/src/utils/storage.js - Lightweight persistent JSON storage for AI usage stats
const fs = require('fs');
const path = require('path');

const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DEFAULT_STORAGE_FILE = path.join(DEFAULT_DATA_DIR, 'usage.json');

function getLocalDateString(date = new Date()) {
    // Return YYYY-MM-DD in UTC+7 (Asia/Jakarta)
    const d = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
}

function getLocalMonthString(date = new Date()) {
    return getLocalDateString(date).slice(0, 7);
}

class Storage {
    constructor(filePath = DEFAULT_STORAGE_FILE) {
        this.filePath = filePath;
        this.dataDir = path.dirname(filePath);
        this.data = this.createDefaultData();
        this.ensureDir();
        this.load();
    }

    createDefaultData() {
        return {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCostIdr: 0,
            daily: {},
            monthly: {},
            lastUpdated: new Date().toISOString()
        };
    }

    ensureDir() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const raw = fs.readFileSync(this.filePath, 'utf8');
                const parsed = JSON.parse(raw);
                this.data = {
                    ...this.createDefaultData(),
                    ...parsed,
                    daily: parsed.daily || {},
                    monthly: parsed.monthly || {}
                };
            } else {
                this.save();
            }
        } catch (err) {
            console.error('[AI Storage] ⚠️ Gagal membaca storage, menggunakan default:', err.message);
            this.data = this.createDefaultData();
        }
        return this.data;
    }

    save() {
        try {
            this.ensureDir();
            this.data.lastUpdated = new Date().toISOString();
            const content = JSON.stringify(this.data, null, 2);
            // Atomic write: write to temp file then rename
            const tempPath = `${this.filePath}.tmp.${Date.now()}`;
            fs.writeFileSync(tempPath, content, 'utf8');
            fs.renameSync(tempPath, this.filePath);
        } catch (err) {
            console.error('[AI Storage] ❌ Gagal menyimpan data:', err.message);
        }
    }

    getDailyStats(dateStr = getLocalDateString()) {
        if (!this.data.daily[dateStr]) {
            this.data.daily[dateStr] = {
                date: dateStr,
                requests: 0,
                successful: 0,
                failed: 0,
                inputTokens: 0,
                outputTokens: 0,
                costIdr: 0
            };
        }
        return this.data.daily[dateStr];
    }

    getMonthlyStats(monthStr = getLocalMonthString()) {
        if (!this.data.monthly[monthStr]) {
            this.data.monthly[monthStr] = {
                month: monthStr,
                requests: 0,
                successful: 0,
                failed: 0,
                inputTokens: 0,
                outputTokens: 0,
                costIdr: 0
            };
        }
        return this.data.monthly[monthStr];
    }

    record({ inputTokens = 0, outputTokens = 0, costIdr = 0, success = true }) {
        const today = getLocalDateString();
        const thisMonth = getLocalMonthString();

        const daily = this.getDailyStats(today);
        const monthly = this.getMonthlyStats(thisMonth);

        this.data.totalRequests++;
        daily.requests++;
        monthly.requests++;

        if (success) {
            this.data.successfulRequests++;
            daily.successful++;
            monthly.successful++;

            this.data.totalInputTokens += inputTokens;
            daily.inputTokens += inputTokens;
            monthly.inputTokens += inputTokens;

            this.data.totalOutputTokens += outputTokens;
            daily.outputTokens += outputTokens;
            monthly.outputTokens += outputTokens;

            this.data.totalCostIdr += costIdr;
            daily.costIdr += costIdr;
            monthly.costIdr += costIdr;
        } else {
            this.data.failedRequests++;
            daily.failed++;
            monthly.failed++;
        }

        this.save();
    }
}

module.exports = {
    Storage,
    getLocalDateString,
    getLocalMonthString
};
