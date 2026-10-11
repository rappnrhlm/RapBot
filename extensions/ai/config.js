// extensions/ai/config.js - Configuration loader with fallback & defaults
const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const content = fs.readFileSync(filePath, 'utf8');
    const result = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
            }
            result[key] = val;
        }
    }
    return result;
}

function loadConfig() {
    // 1. Try loading root bot/.env first
    const rootEnvPath = path.join(__dirname, '..', '..', '.env');
    const rootEnv = parseEnvFile(rootEnvPath);

    // 2. Try loading local extensions/ai/.env (overrides root env if present)
    const localEnvPath = path.join(__dirname, '.env');
    const localEnv = parseEnvFile(localEnvPath);

    const merged = { ...rootEnv, ...localEnv, ...process.env };

    const get = (key, defaultVal) => {
        if (merged[key] !== undefined && merged[key] !== '') {
            return merged[key];
        }
        return defaultVal;
    };

    return {
        port: Number(get('PORT', 3007)),
        enabled: get('AI_ENABLED', 'true') === 'true' || get('AI_ENABLED', 'true') === true,
        provider: (get('AI_PROVIDER', 'gemini')).toLowerCase(),
        model: get('AI_MODEL', 'gemini-3.5-flash-lite'),
        geminiApiKey: get('GEMINI_API_KEY', '').trim(),
        dailyBudgetIDR: Number(get('AI_DAILY_BUDGET_IDR', 1000)),
        monthlyBudgetIDR: Number(get('AI_MONTHLY_BUDGET_IDR', 25000)),
        maxOutputTokens: Number(get('AI_MAX_OUTPUT_TOKENS', 600)),
        maxInputChars: Number(get('AI_MAX_INPUT_CHARS', 2000)),
        cooldownSeconds: Number(get('AI_COOLDOWN_SECONDS', 5)),
        maxRequestsPerHour: Number(get('AI_MAX_REQUESTS_PER_HOUR', 10)),
        maxConcurrentRequests: Number(get('AI_MAX_CONCURRENT_REQUESTS', 2)),
        timeoutMs: Number(get('AI_TIMEOUT_MS', 20000)),
        usdToIdrRate: Number(get('AI_USD_TO_IDR_RATE', 16000)),
        priceInputPerMUSD: get('AI_PRICE_INPUT_PER_M_USD', null) !== null ? Number(get('AI_PRICE_INPUT_PER_M_USD')) : null,
        priceOutputPerMUSD: get('AI_PRICE_OUTPUT_PER_M_USD', null) !== null ? Number(get('AI_PRICE_OUTPUT_PER_M_USD')) : null
    };
}

module.exports = {
    loadConfig
};
