// extensions/ai/src/aiService.js - Main orchestrator for RapBot AI Extension
const { providerFactory } = require('./providers/providerFactory');
const { getModelPricing } = require('./utils/pricing');
const { formatWhatsApp } = require('./utils/formatter');

class AiService {
    constructor({ config, storage, budgetManager, rateLimiter }) {
        this.config = config;
        this.storage = storage;
        this.budgetManager = budgetManager;
        this.rateLimiter = rateLimiter;
    }

    /**
     * Dispatch incoming command payload from RapBot Core
     * @param {Object} payload Standard request context from RapBot
     */
    async handleCommand(payload = {}) {
        const rawArgs = Array.isArray(payload.args) ? payload.args : [];
        const fullBody = (payload.body || '').trim();
        const senderId = payload.senderId || payload.context?.senderNumber || payload.chatId || 'unknown';

        // Check if no arguments provided -> Show Help/Guide
        if (rawArgs.length === 0) {
            // Check if body only contains !ai without question
            return {
                type: 'reply',
                text: this.getHelpMessage()
            };
        }

        const subCommand = rawArgs[0].toLowerCase();

        // 1. Help sub-command
        if (subCommand === 'help' || subCommand === 'bantuan') {
            return {
                type: 'reply',
                text: this.getHelpMessage()
            };
        }

        // 2. Status sub-command
        if (subCommand === 'status' && rawArgs.length === 1) {
            return {
                type: 'reply',
                text: this.getStatusMessage()
            };
        }

        // 3. Usage sub-command
        if (subCommand === 'usage' && rawArgs.length === 1) {
            return {
                type: 'reply',
                text: this.getUsageMessage()
            };
        }

        // 4. Default: AI Question & Answer
        // Extract entire question text after command prefix/name
        let question = '';
        if (rawArgs.length > 0) {
            question = rawArgs.join(' ').trim();
        } else {
            question = fullBody.replace(/^!ai\s*/i, '').trim();
        }

        if (!question) {
            return {
                type: 'reply',
                text: this.getHelpMessage()
            };
        }

        return await this.askQuestion(question, senderId);
    }

    getHelpMessage() {
        return (
            `🤖 *RapBot AI Assistant*\n\n` +
            `Tanya jawab cerdas menggunakan Google Gemini AI.\n\n` +
            `*Perintah yang tersedia:*\n` +
            `• \`!ai <pertanyaan>\` — Mengajukan pertanyaan ke AI\n` +
            `• \`!ai status\` — Melihat status & koneksi AI\n` +
            `• \`!ai usage\` — Melihat statistik pemakaian & estimasi biaya\n\n` +
            `*Aturan & Batasan:*\n` +
            `• Jeda: ${this.config.cooldownSeconds} detik antar pertanyaan\n` +
            `• Batas: ${this.config.maxRequestsPerHour} pertanyaan per jam per pengguna\n` +
            `• Maksimal panjang pertanyaan: ${this.config.maxInputChars} karakter\n\n` +
            `_Contoh: !ai Jelaskan apa itu gravitasi secara singkat_`
        );
    }

    getStatusMessage() {
        const isEnabled = this.config.enabled;
        const providerName = this.config.provider;
        const modelName = this.config.model;
        const hasApiKey = Boolean(this.config.geminiApiKey && this.config.geminiApiKey.trim());

        let maskedApiKey = 'Belum dikonfigurasi ❌';
        if (hasApiKey) {
            const key = this.config.geminiApiKey;
            const tail = key.length > 4 ? key.slice(-4) : '****';
            maskedApiKey = `Tersedia (****${tail}) ✅`;
        }

        const budgetSummary = this.budgetManager.getStatusSummary();
        const activeConcurrency = this.rateLimiter.getCurrentConcurrency();

        return (
            `📊 *Status AI RapBot*\n\n` +
            `• *Fitur AI:* ${isEnabled ? 'Aktif ✅' : 'Nonaktif ⏸️'}\n` +
            `• *Provider:* ${providerName}\n` +
            `• *Model:* ${modelName}\n` +
            `• *API Key:* ${maskedApiKey}\n` +
            `• *Permintaan Aktif:* ${activeConcurrency} / ${this.config.maxConcurrentRequests}\n\n` +
            `*Budget & Pengeluaran:*\n` +
            `• *Hari Ini:* Rp ${Math.round(budgetSummary.daily.spentIdr).toLocaleString('id-ID')} / Rp ${budgetSummary.daily.budgetLimitIdr.toLocaleString('id-ID')} (${budgetSummary.daily.percent}%)\n` +
            `• *Bulan Ini:* Rp ${Math.round(budgetSummary.monthly.spentIdr).toLocaleString('id-ID')} / Rp ${budgetSummary.monthly.budgetLimitIdr.toLocaleString('id-ID')} (${budgetSummary.monthly.percent}%)\n\n` +
            `_Gunakan \`!ai usage\` untuk melihat rincian pemakaian token._`
        );
    }

    getUsageMessage() {
        const daily = this.storage.getDailyStats();
        const monthly = this.storage.getMonthlyStats();
        const summary = this.storage.data;

        return (
            `📈 *Statistik Penggunaan & Estimasi Biaya AI*\n\n` +
            `*Hari Ini (${daily.date || 'Hari ini'}):*\n` +
            `• Permintaan: ${daily.requests} (${daily.successful} berhasil, ${daily.failed} gagal)\n` +
            `• Token: ${(daily.inputTokens || 0).toLocaleString('id-ID')} in / ${(daily.outputTokens || 0).toLocaleString('id-ID')} out\n` +
            `• Estimasi Biaya: Rp ${Math.round(daily.costIdr || 0).toLocaleString('id-ID')} (Budget: Rp ${this.config.dailyBudgetIDR.toLocaleString('id-ID')})\n\n` +
            `*Bulan Ini (${monthly.month || 'Bulan ini'}):*\n` +
            `• Permintaan: ${monthly.requests} (${monthly.successful} berhasil, ${monthly.failed} gagal)\n` +
            `• Token: ${(monthly.inputTokens || 0).toLocaleString('id-ID')} in / ${(monthly.outputTokens || 0).toLocaleString('id-ID')} out\n` +
            `• Estimasi Biaya: Rp ${Math.round(monthly.costIdr || 0).toLocaleString('id-ID')} (Budget: Rp ${this.config.monthlyBudgetIDR.toLocaleString('id-ID')})\n\n` +
            `*Total Keseluruhan (All-Time):*\n` +
            `• Total Permintaan: ${summary.totalRequests || 0}\n` +
            `• Total Token: ${((summary.totalInputTokens || 0) + (summary.totalOutputTokens || 0)).toLocaleString('id-ID')}\n` +
            `• Total Estimasi Biaya: Rp ${Math.round(summary.totalCostIdr || 0).toLocaleString('id-ID')}\n\n` +
            `⚠️ _Catatan: Biaya merupakan batas estimasi aplikasi berdasarkan konsumsi token, bukan jaminan tagihan absolut dari provider._`
        );
    }

    async askQuestion(question, senderId) {
        // 1. Check if AI feature is globally enabled
        if (!this.config.enabled) {
            return {
                type: 'reply',
                text: '⏸️ Fitur AI sedang dinonaktifkan oleh administrator bot.'
            };
        }

        // 2. Check if API Key is configured
        if (!this.config.geminiApiKey || !this.config.geminiApiKey.trim()) {
            return {
                type: 'reply',
                text: '❌ Layanan AI belum siap: API Key belum dikonfigurasi pada environment (GEMINI_API_KEY). Silakan hubungi admin bot.'
            };
        }

        // 3. Validate question character length
        if (question.length > this.config.maxInputChars) {
            return {
                type: 'reply',
                text: `⚠️ Pertanyaan terlalu panjang (${question.length} karakter). Batas maksimal adalah ${this.config.maxInputChars} karakter.`
            };
        }

        // 4. Validate Model Pricing (Do NOT assume free if pricing unknown)
        const customPricing = (this.config.priceInputPerMUSD !== null && this.config.priceOutputPerMUSD !== null)
            ? { input: this.config.priceInputPerMUSD, output: this.config.priceOutputPerMUSD }
            : null;

        const pricing = getModelPricing(this.config.model, customPricing);
        if (!pricing) {
            return {
                type: 'reply',
                text: `❌ Tarif untuk model AI "${this.config.model}" belum diketahui. Mohon gunakan model resmi atau tentukan tarif model pada konfigurasi.`
            };
        }

        // 5. Check Rate Limiter (Cooldown, Hourly, Concurrency)
        const rateCheck = this.rateLimiter.checkAndAcquire(senderId);
        if (!rateCheck.allowed) {
            return {
                type: 'reply',
                text: rateCheck.message
            };
        }

        // 6. Check Budget (Daily & Monthly)
        const budgetCheck = this.budgetManager.checkBudget({
            model: this.config.model,
            maxInputChars: question.length,
            maxOutputTokens: this.config.maxOutputTokens
        });

        if (!budgetCheck.allowed) {
            this.rateLimiter.releaseConcurrency();
            return {
                type: 'reply',
                text: budgetCheck.message
            };
        }

        // 7. Reserve estimated cost in budget guard
        this.budgetManager.reserveBudget(budgetCheck.estimatedCostIdr);

        // 8. Call AI Provider
        try {
            const provider = providerFactory.create(this.config.provider, this.config);
            const result = await provider.generateText({
                prompt: question,
                maxTokens: this.config.maxOutputTokens,
                timeoutMs: this.config.timeoutMs
            });

            // 9. Success handling: release locks & record exact usage
            this.budgetManager.releaseReservation(budgetCheck.estimatedCostIdr);
            this.rateLimiter.releaseConcurrency();

            this.budgetManager.recordUsage({
                model: this.config.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                success: true
            });

            return {
                type: 'reply',
                text: formatWhatsApp(result.text)
            };
        } catch (err) {
            // 10. Failure handling: release locks & record failure
            this.budgetManager.releaseReservation(budgetCheck.estimatedCostIdr);
            this.rateLimiter.releaseConcurrency();

            this.budgetManager.recordUsage({
                model: this.config.model,
                inputTokens: 0,
                outputTokens: 0,
                success: false
            });

            console.error('[AiService] ❌ Gagal memproses pertanyaan AI:', err.message);

            // Clean error message for user
            let userErrorMsg = err.message || 'Terjadi kesalahan sistem.';
            if (this.config.geminiApiKey) {
                userErrorMsg = userErrorMsg.split(this.config.geminiApiKey).join('***');
            }

            return {
                type: 'reply',
                text: `❌ Gagal memproses respon AI: ${userErrorMsg}`
            };
        }
    }
}

module.exports = {
    AiService
};
