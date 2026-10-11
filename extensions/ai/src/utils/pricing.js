// extensions/ai/src/utils/pricing.js - Model token pricing and cost calculations
const MODEL_PRICING_USD_PER_M = {
    // Official Google Gemini pricing (USD per 1 Million tokens)
    'gemini-2.5-flash': { input: 0.30, output: 2.50 },
    'gemini-2.5-flash-lite': { input: 0.10, output: 0.40 },
    'gemini-2.0-flash': { input: 0.10, output: 0.40 },
    'gemini-2.0-flash-lite': { input: 0.075, output: 0.30 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 },
    'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
    'gemini-1.5-pro': { input: 1.25, output: 5.00 },
    'gemini-3.5-flash-lite': { input: 0.10, output: 0.40 },
    'gemini-3.8-flash': { input: 0.75, output: 3.75 }
};

function normalizeModelName(rawModel) {
    if (!rawModel) return '';
    return rawModel.trim().toLowerCase().replace(/^models\//, '');
}

/**
 * Get pricing per million tokens in USD
 * Returns null if model pricing is completely unknown and no custom rate provided.
 */
function getModelPricing(modelName, customPricing = {}) {
    if (customPricing && typeof customPricing.input === 'number' && typeof customPricing.output === 'number') {
        return {
            inputPerM: customPricing.input,
            outputPerM: customPricing.output,
            isCustom: true
        };
    }

    const normalized = normalizeModelName(modelName);
    const standard = MODEL_PRICING_USD_PER_M[normalized];
    if (standard) {
        return {
            inputPerM: standard.input,
            outputPerM: standard.output,
            isCustom: false
        };
    }

    // Check partial prefix matches (e.g. gemini-2.5-flash-001)
    for (const [key, val] of Object.entries(MODEL_PRICING_USD_PER_M)) {
        if (normalized.startsWith(key)) {
            return {
                inputPerM: val.input,
                outputPerM: val.output,
                isCustom: false
            };
        }
    }

    // Do NOT assume free if unknown
    return null;
}

/**
 * Calculate token cost based on actual usage
 */
function calculateCost({ model, inputTokens = 0, outputTokens = 0, usdToIdrRate = 16000, customPricing = null }) {
    const pricing = getModelPricing(model, customPricing);
    if (!pricing) {
        throw new Error(`Tarif model "${model}" belum diketahui. Konfigurasikan tarif sebelum mengirim request.`);
    }

    const inputCostUsd = (inputTokens / 1_000_000) * pricing.inputPerM;
    const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPerM;
    const totalCostUsd = inputCostUsd + outputCostUsd;
    const totalCostIdr = totalCostUsd * usdToIdrRate;

    return {
        inputTokens,
        outputTokens,
        inputCostUsd,
        outputCostUsd,
        totalCostUsd,
        totalCostIdr: Math.round(totalCostIdr * 1000) / 1000, // round to 3 decimal places
        pricing
    };
}

/**
 * Estimate worst-case cost for budget reservation before API call
 */
function estimateWorstCaseCost({ model, maxInputChars = 2000, maxOutputTokens = 600, usdToIdrRate = 16000, customPricing = null }) {
    const pricing = getModelPricing(model, customPricing);
    if (!pricing) {
        throw new Error(`Tarif model "${model}" belum diketahui. Harap tentukan tarif atau gunakan model terdaftar.`);
    }

    // Rule of thumb: ~3.5 chars per token for text
    const estimatedInputTokens = Math.ceil(maxInputChars / 3.5);
    const inputCostUsd = (estimatedInputTokens / 1_000_000) * pricing.inputPerM;
    const outputCostUsd = (maxOutputTokens / 1_000_000) * pricing.outputPerM;
    const worstCaseUsd = inputCostUsd + outputCostUsd;
    const worstCaseIdr = worstCaseUsd * usdToIdrRate;

    return {
        estimatedInputTokens,
        estimatedOutputTokens: maxOutputTokens,
        worstCaseUsd,
        worstCaseIdr: Math.ceil(worstCaseIdr) // conservative ceiling
    };
}

module.exports = {
    MODEL_PRICING_USD_PER_M,
    normalizeModelName,
    getModelPricing,
    calculateCost,
    estimateWorstCaseCost
};
