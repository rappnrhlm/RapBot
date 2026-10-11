# Panduan Fitur AI RapBot (!ai)

Extension AI RapBot adalah modul terpisah yang mengintegrasikan kecerdasan buatan (Google Gemini API) ke dalam RapBot WhatsApp tanpa mengganggu Core RapBot atau extension lainnya.

---

## 1. Cara Mendapatkan API Key dari Google AI Studio

1. Kunjungi **[Google AI Studio](https://aistudio.google.com/)**.
2. Masuk menggunakan akun Google Anda.
3. Klik tombol **Get API key** di pojok kiri atas/menu navigasi.
4. Klik **Create API key** (pilih project baru atau project Google Cloud yang sudah ada).
5. Salin API key yang dibuat.
   > **Catatan:** Utamakan menggunakan Free Tier resmi dari Google AI Studio. Langganan Google AI Pro tidak otomatis memberikan kuota gratis untuk Gemini API berbayar. Jangan mengaktifkan penagihan otomatis jika ingin beroperasi sepenuhnya dalam free tier atau kuota terbatas.

---

## 2. Cara Memasukkan API Key ke Konfigurasi

Anda dapat memasukkan konfigurasi AI ke dalam file `.env` utama di folder `bot/` atau di `bot/extensions/ai/.env`:

Buka file `.env` (atau salin dari `.env.example` jika belum ada):
```bash
# Tambahkan atau edit baris berikut:
GEMINI_API_KEY=AIzaSyD...your_real_key_here
```

> **Keamanan:** Jangan pernah melakukan commit file `.env` yang berisi API key ke Git repository. File `.env` sudah masuk dalam daftar `.gitignore`.

---

## 3. Cara Mengaktifkan dan Menonaktifkan AI

- **Mengaktifkan:**
  Set di `.env`:
  ```env
  AI_ENABLED=true
  ```
  Atau aktifkan di `bot/config/extensions.json`:
  ```json
  {
    "id": "ai",
    "enabled": true
  }
  ```

- **Menonaktifkan:**
  Ubah menjadi:
  ```env
  AI_ENABLED=false
  ```
  Ketika dinonaktifkan, bot akan merespons dengan sopan:
  `⏸️ Fitur AI sedang dinonaktifkan oleh administrator bot.` tanpa error atau crash.

---

## 4. Cara Memilih Provider dan Model

Konfigurasi provider dan model diatur lewat environment variable:

```env
AI_PROVIDER=gemini
AI_MODEL=gemini-2.5-flash
```

Model yang didukung secara default:
- `gemini-2.5-flash` *(Direkomendasikan - cepat dan cerdas)*
- `gemini-2.5-flash-lite` *(Hemat biaya)*
- `gemini-2.0-flash`
- `gemini-1.5-flash`
- `gemini-1.5-flash-8b`
- `gemini-3.5-flash-lite`
- `gemini-3.8-flash`

Jika Anda ingin menggunakan tarif kustom untuk model lain, Anda dapat menambahkan:
```env
AI_PRICE_INPUT_PER_M_USD=0.30
AI_PRICE_OUTPUT_PER_M_USD=2.50
AI_USD_TO_IDR_RATE=16000
```
> **Aturan Keamanan:** Sistem tidak akan menganggap model gratis jika tarifnya belum diketahui atau belum dikonfigurasi.

---

## 5. Cara Menggunakan Perintah Bot di WhatsApp

| Perintah | Deskripsi |
| :--- | :--- |
| `!ai` | Menampilkan panduan dan petunjuk penggunaan. |
| `!ai <pertanyaan>` | Mengajukan pertanyaan teks kepada AI. |
| `!ai status` | Melihat status sistem, model, status API key, dan sisa budget. |
| `!ai usage` | Melihat statistik token masuk/keluar serta estimasi biaya harian dan bulanan. |

*Contoh:*
- `!ai Apa perbedaan RAM dan ROM pada smartphone?`
- `!ai status`
- `!ai usage`

---

## 6. Cara Kerja Batas Request & Budget Guard

Extension dilengkapi dengan sistem perlindungan ganda:

1. **Jeda Cooldown Pengguna (5 detik):**
   Maksimal 1 pertanyaan per user setiap 5 detik (`AI_COOLDOWN_SECONDS=5`). Mencegah spam klik.
2. **Batas Frekuensi Pengguna (10 per jam):**
   Maksimal 10 pertanyaan per user per jam (`AI_MAX_REQUESTS_PER_HOUR=10`), dilacak berdasarkan nomor telepon WhatsApp pengguna (`senderId`).
3. **Batas Concurrency Global (2 request):**
   Maksimal 2 permintaan API yang diproses serentak (`AI_MAX_CONCURRENT_REQUESTS=2`).
4. **Batas Karakter & Token:**
   Maksimal 2000 karakter per pertanyaan (`AI_MAX_INPUT_CHARS=2000`) dan 600 output token (`AI_MAX_OUTPUT_TOKENS=600`).
5. **Budget Guard Harian & Bulanan (IDR):**
   - Harian: Rp 1.000 (`AI_DAILY_BUDGET_IDR=1000`)
   - Bulanan: Rp 25.000 (`AI_MONTHLY_BUDGET_IDR=25000`)
   - **Reservasi Concurrency:** Setiap request yang sedang berjalan mencadangkan estimasi biaya worst-case terlebih dahulu sehingga request bersamaan tidak bisa menembus batas budget.
   - **Persistensi Data:** Seluruh catatan pemakaian disimpan di `bot/extensions/ai/data/usage.json` secara aman (atomic write) sehingga data tidak hilang saat server restart.

---

## 7. Cara Menambahkan Provider Baru (DeepSeek, OpenRouter, dll.)

Arsitektur Extension AI memisahkan layer provider menggunakan pola **Provider Factory**:

1. Buat file provider baru di `bot/extensions/ai/src/providers/` (misalnya `deepseekProvider.js`):
   ```javascript
   const { BaseProvider } = require('./baseProvider');

   class DeepSeekProvider extends BaseProvider {
       async generateText({ prompt, maxTokens, timeoutMs }) {
           // Implementasi panggilan HTTP ke DeepSeek API
           return {
               text: 'Jawaban dari DeepSeek',
               inputTokens: 100,
               outputTokens: 50,
               model: 'deepseek-chat'
           };
       }
   }

   module.exports = { DeepSeekProvider };
   ```
2. Daftarkan di `bot/extensions/ai/src/providers/providerFactory.js`:
   ```javascript
   const { DeepSeekProvider } = require('./deepseekProvider');
   providerFactory.register('deepseek', DeepSeekProvider);
   ```
3. Ubah konfigurasi di `.env`:
   ```env
   AI_PROVIDER=deepseek
   ```
   Extension akan langsung beralih ke provider baru tanpa perlu menulis ulang handler perintah WhatsApp atau sistem budget!

---

## 8. Menjalankan Layanan

### Menjalankan Mandiri:
```bash
cd bot
npm run start:ai
```

### Menjalankan Bersama RapBot via PM2:
```bash
cd bot
pm2 start ecosystem.config.js
```
PM2 akan menjalankan `rapbot` dan `rapbot-ai` secara bersamaan dan me-restart otomatis jika diperlukan.
