// extensions/ai/src/providers/geminiProvider.js - Google Gemini API Provider Implementation
const { BaseProvider } = require('./baseProvider');
const { normalizeModelName } = require('../utils/pricing');

class GeminiProvider extends BaseProvider {
    constructor(config) {
        super(config);
        this.apiKey = config.geminiApiKey || '';
        this.model = normalizeModelName(config.model || 'gemini-2.5-flash');
        this.baseUrl = config.geminiBaseUrl || 'https://generativelanguage.googleapis.com';
    }

    sanitize(str) {
        if (!str || !this.apiKey) return str;
        return String(str).split(this.apiKey).join('***REDACTED***');
    }

    async generateText({ prompt, maxTokens = 600, timeoutMs = 20000 }) {
        if (!this.apiKey) {
            throw new Error('GEMINI_API_KEY belum diisi dalam konfigurasi bot.');
        }

        const model = this.model;
        const url = `${this.baseUrl.replace(/\/+$/, '')}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

        const requestPayload = {
            systemInstruction: {
                parts: [
                    {
                        text: (
                            "Kamu adalah asisten AI cerdas di RapBot WhatsApp. Berikan jawaban yang ramah, ringkas, padat, dan SANGAT NYAMAN DIBACA di layar HP WhatsApp.\n\n" +
                            "PANDUAN FORMAT WAJIB KHUSUS WHATSAPP:\n" +
                            "1. DILARANG menggunakan tanda Markdown heading (#, ##, ###, ####). Ganti sub-judul atau penomoran dengan teks tebal biasa, contoh: *1. Apa itu RDW?*\n" +
                            "2. DILARANG menggunakan garis pemisah horizontal (--- atau ___).\n" +
                            "3. Gunakan simbol titik bulat '• ' untuk poin-poin list, JANGAN gunakan tanda bintang (*).\n" +
                            "4. Gunakan format WhatsApp: *tebal* untuk kata penting, _miring_ untuk istilah asing/latin, dan `kode` untuk teks teknis.\n" +
                            "5. Jangan berlebihan memakai tanda bintang/kutip di setiap kalimat. Buat teks mengalir rapi, natural, dan bersih."
                        )
                    }
                ]
            },
            contents: [
                {
                    parts: [
                        { text: prompt }
                    ]
                }
            ],
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: 0.7
            }
        };

        const maxRetries = 2;
        let lastError = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const controller = new AbortController();
            const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                if (attempt > 0) {
                    // Exponential backoff: 1000ms, 2000ms
                    await new Promise(res => setTimeout(res, attempt * 1000));
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestPayload),
                    signal: controller.signal
                });

                clearTimeout(timeoutTimer);

                if (!response.ok) {
                    const status = response.status;
                    let errorBody = '';
                    try {
                        const errJson = await response.json();
                        errorBody = errJson?.error?.message || JSON.stringify(errJson);
                    } catch {
                        errorBody = response.statusText;
                    }

                    // Transient errors eligible for retry
                    const isTransient = status === 429 || status === 503 || status === 500;
                    if (isTransient && attempt < maxRetries) {
                        console.warn(`[GeminiProvider] ⚠️ HTTP ${status} pada percobaan ${attempt + 1}, mencoba lagi...`);
                        continue;
                    }

                    if (status === 429) {
                        throw new Error('Batas kuota/rate-limit Gemini API tercapai (429 Too Many Requests). Silakan coba lagi beberapa saat lagi.');
                    }
                    if (status === 400) {
                        throw new Error(`Permintaan ke Gemini API tidak valid (400): ${this.sanitize(errorBody)}`);
                    }
                    if (status === 403) {
                        throw new Error('API Key Gemini tidak valid atau tidak memiliki izin akses (403 Forbidden).');
                    }

                    throw new Error(`Gemini API Error HTTP ${status}: ${this.sanitize(errorBody)}`);
                }

                const data = await response.json();

                // Check finish reason or safety blocks
                const candidate = data.candidates?.[0];
                if (!candidate) {
                    const blockReason = data.promptFeedback?.blockReason;
                    if (blockReason) {
                        return {
                            text: `⚠️ Pertanyaan tidak dapat dijawab karena diblokir oleh kebijakan keamanan konten Google Gemini (${blockReason}).`,
                            inputTokens: data.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 3.5),
                            outputTokens: 0,
                            model
                        };
                    }
                    throw new Error('Gemini API mengembalikan respons kosong (tidak ada kandidat balasan).');
                }

                const textParts = candidate.content?.parts || [];
                const replyText = textParts.map(p => p.text || '').join('').trim();

                if (!replyText) {
                    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                        return {
                            text: `⚠️ Respon selesai dengan alasan: ${candidate.finishReason}.`,
                            inputTokens: data.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 3.5),
                            outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
                            model
                        };
                    }
                    throw new Error('Gemini API menghasilkan teks kosong.');
                }

                const inputTokens = data.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 3.5);
                const outputTokens = data.usageMetadata?.candidatesTokenCount || Math.ceil(replyText.length / 3.5);

                return {
                    text: replyText,
                    inputTokens,
                    outputTokens,
                    model
                };
            } catch (err) {
                clearTimeout(timeoutTimer);
                lastError = err;

                if (err.name === 'AbortError') {
                    throw new Error(`Request ke Gemini API timeout setelah ${timeoutMs / 1000} detik.`);
                }

                const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch failed');
                if (isNetworkError && attempt < maxRetries) {
                    console.warn(`[GeminiProvider] ⚠️ Network error (${err.message}) pada percobaan ${attempt + 1}, mencoba lagi...`);
                    continue;
                }

                break;
            }
        }

        throw new Error(this.sanitize(lastError?.message || 'Gagal menghubungi Gemini API'));
    }
}

module.exports = {
    GeminiProvider
};
