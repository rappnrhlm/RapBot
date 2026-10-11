# RapBot AI Extension Architecture & Guide

Silakan merujuk ke dokumentasi lengkap di:
- [`bot/extensions/ai/README.md`](../../extensions/ai/README.md)

### Ringkasan Fitur
- **Command:** `!ai`, `!ai <pertanyaan>`, `!ai status`, `!ai usage`
- **Provider Pertama:** Google Gemini API (`@generativelanguage.googleapis.com`)
- **Model Default:** `gemini-2.5-flash`
- **Port Layanan:** `3007` (HTTP POST `/command`, GET `/health`, GET `/manifest`)
- **Proteksi:** Cooldown 5 detik, limit 10/jam/user, maks 2 concurrent, limit harian Rp 1.000, bulanan Rp 25.000.
