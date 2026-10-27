# Panduan Integrasi Aplikasi Eksternal ke RapBot (Standalone Gateway)

RapBot berfungsi sebagai **WhatsApp Gateway Microservice**. Aplikasi eksternal mana pun dapat mengirim pesan WhatsApp, menerima webhook pesan masuk, serta mendaftarkan perintah bot interaktif secara dinamis tanpa perlu mengubah source code internal RapBot.

---

## 1. Menjalankan RapBot
Cukup jalankan RapBot di background / server:
```bash
cd bot
npm start
# atau dengan nodemon: npm run dev
```
Port default API: `http://localhost:3001` (dapat diubah via `WEB_PORT` di `.env`).

---

## 2. Mengirim Pesan WhatsApp dari Aplikasi Eksternal (`POST /api/bot/send`)

Aplikasi kamu bisa mengirim pesan ke nomor pribadi maupun grup, baik teks maupun media.

### A. Kirim Pesan Teks
```bash
curl -X POST http://localhost:3001/api/bot/send \
  -H "Content-Type: application/json" \
  -H "x-admin-pin: 160509" \
  -d '{
    "number": "08123456789",
    "message": "Halo! Tagihan Anda telah diterbitkan."
  }'
```

### B. Kirim Pesan ke WhatsApp Group
```bash
curl -X POST http://localhost:3001/api/bot/send \
  -H "Content-Type: application/json" \
  -H "x-admin-pin: 160509" \
  -d '{
    "groupId": "1203630281928@g.us",
    "message": "Pengumuman: Maintenance server malam ini."
  }'
```

### C. Kirim Gambar / Dokumen (PDF, dsb)
```bash
curl -X POST http://localhost:3001/api/bot/send \
  -H "Content-Type: application/json" \
  -H "x-admin-pin: 160509" \
  -d '{
    "number": "08123456789",
    "mediaUrl": "https://example.com/invoice.pdf",
    "mediaType": "document",
    "fileName": "Invoice-102.pdf",
    "caption": "Terima kasih atas pembayaran Anda!"
  }'
```
*Catatan: Parameter `mediaBase64` juga didukung jika file tidak memiliki public URL.*

---

## 3. Mendaftarkan Fitur Baru Tanpa Ubah RapBot (`POST /api/extensions/register`)

Ketika aplikasi eksternal barumu menyala (misal server port `4000`), aplikasimu cukup menembak HTTP POST ke RapBot sekali saat startup:

```bash
curl -X POST http://localhost:3001/api/extensions/register \
  -H "Content-Type: application/json" \
  -H "x-admin-pin: 160509" \
  -d '{
    "id": "toko-online",
    "name": "Toko Online Service",
    "endpoint": "http://localhost:4000",
    "commands": [
      {
        "name": "produk",
        "aliases": ["katalog", "barang"],
        "description": "Cek katalog produk toko"
      }
    ]
  }'
```

Begitu endpoint ini dipanggil:
* Command `!produk` dan `!katalog` langsung terdaftar di memori RapBot.
* Ketika user mengetik `!produk` di WhatsApp, RapBot otomatis meneruskan request ke `http://localhost:4000/command`.
* Kamu 100% hanya memprogram logic bisnismu di aplikasi `toko-online`.

---

## 4. Menerima Chat Masuk Secara Realtime (Inbound Webhook)

Jika kamu ingin aplikasimu memproses seluruh pesan WhatsApp yang masuk:
1. Tambahkan `WEBHOOK_URL` di `bot/.env`:
   ```env
   WEBHOOK_URL=http://localhost:4000/webhook
   ```
2. RapBot akan mengirimkan payload HTTP POST setiap kali ada pesan masuk:
   ```json
   {
     "event": "message.received",
     "from": "628123456789@s.whatsapp.net",
     "senderNumber": "628123456789",
     "isGroup": false,
     "isOwner": false,
     "body": "Halo admin",
     "messageId": "BAE5...",
     "timestamp": 1729000000
   }
   ```
