// extensions/ai/src/budgetManager.js - Daily and Monthly budget guard with concurrency reservation
const { estimateWorstCaseCost, calculateCost } = require('./utils/pricing');
const { getLocalDateString, getLocalMonthString } = require('./utils/storage');

class BudgetManager {
    constructor({ storage, config }) {
        this.storage = storage;
        this.config = config;
        this.reservedCostIdr = 0; // Active reservations for in-flight requests
    }

    getDailySpent() {
        const stats = this.storage.getDailyStats();
        return stats.costIdr || 0;
    }

    getMonthlySpent() {
        const stats = this.storage.getMonthlyStats();
        return stats.costIdr || 0;
    }

    /**
     * Check if budget allows this request before calling provider
     */
    checkBudget({ model, maxInputChars, maxOutputTokens }) {
        const customPricing = (this.config.priceInputPerMUSD !== null && this.config.priceOutputPerMUSD !== null)
            ? { input: this.config.priceInputPerMUSD, output: this.config.priceOutputPerMUSD }
            : null;

        const worstCase = estimateWorstCaseCost({
            model,
            maxInputChars: maxInputChars || this.config.maxInputChars,
            maxOutputTokens: maxOutputTokens || this.config.maxOutputTokens,
            usdToIdrRate: this.config.usdToIdrRate,
            customPricing
        });

        const currentDaily = this.getDailySpent();
        const currentMonthly = this.getMonthlySpent();

        const projectedDaily = currentDaily + this.reservedCostIdr + worstCase.worstCaseIdr;
        const projectedMonthly = currentMonthly + this.reservedCostIdr + worstCase.worstCaseIdr;

        if (projectedDaily > this.config.dailyBudgetIDR) {
            return {
                allowed: false,
                reason: 'daily_budget_exceeded',
                estimatedCostIdr: worstCase.worstCaseIdr,
                currentSpentIdr: currentDaily,
                limitIdr: this.config.dailyBudgetIDR,
                message: `⛔ Permintaan ditolak: Estimasi pemakaian melebihi batas budget harian AI (Rp ${this.config.dailyBudgetIDR.toLocaleString('id-ID')}). Terpakai saat ini: Rp ${Math.round(currentDaily).toLocaleString('id-ID')}.`
            };
        }

        if (projectedMonthly > this.config.monthlyBudgetIDR) {
            return {
                allowed: false,
                reason: 'monthly_budget_exceeded',
                estimatedCostIdr: worstCase.worstCaseIdr,
                currentSpentIdr: currentMonthly,
                limitIdr: this.config.monthlyBudgetIDR,
                message: `⛔ Permintaan ditolak: Estimasi pemakaian melebihi batas budget bulanan AI (Rp ${this.config.monthlyBudgetIDR.toLocaleString('id-ID')}). Terpakai saat ini: Rp ${Math.round(currentMonthly).toLocaleString('id-ID')}.`
            };
        }

        return {
            allowed: true,
            estimatedCostIdr: worstCase.worstCaseIdr
        };
    }

    /**
     * Reserve budget for in-flight request
     */
    reserveBudget(costIdr) {
        this.reservedCostIdr += costIdr;
    }

    /**
     * Release reservation
     */
    releaseReservation(costIdr) {
        this.reservedCostIdr = Math.max(0, this.reservedCostIdr - costIdr);
    }

    /**
     * Finalize usage and calculate actual cost
     */
    recordUsage({ model, inputTokens, outputTokens, success = true }) {
        let costResult = { totalCostIdr: 0, totalCostUsd: 0 };
        if (success && (inputTokens > 0 || outputTokens > 0)) {
            const customPricing = (this.config.priceInputPerMUSD !== null && this.config.priceOutputPerMUSD !== null)
                ? { input: this.config.priceInputPerMUSD, output: this.config.priceOutputPerMUSD }
                : null;

            costResult = calculateCost({
                model,
                inputTokens,
                outputTokens,
                usdToIdrRate: this.config.usdToIdrRate,
                customPricing
            });
        }

        this.storage.record({
            inputTokens,
            outputTokens,
            costIdr: costResult.totalCostIdr,
            success
        });

        return costResult;
    }

    getStatusSummary() {
        const daily = this.storage.getDailyStats();
        const monthly = this.storage.getMonthlyStats();

        const dailyPercent = Math.min(100, Math.round(((daily.costIdr + this.reservedCostIdr) / this.config.dailyBudgetIDR) * 100));
        const monthlyPercent = Math.min(100, Math.round(((monthly.costIdr + this.reservedCostIdr) / this.config.monthlyBudgetIDR) * 100));

        return {
            daily: {
                spentIdr: daily.costIdr,
                budgetLimitIdr: this.config.dailyBudgetIDR,
                percent: dailyPercent,
                requests: daily.requests,
                successful: daily.successful
            },
            monthly: {
                spentIdr: monthly.costIdr,
                budgetLimitIdr: this.config.monthlyBudgetIDR,
                percent: monthlyPercent,
                requests: monthly.requests,
                successful: monthly.successful
            },
            reservedIdr: this.reservedCostIdr
        };
    }
}

module.exports = {
    BudgetManager
};
