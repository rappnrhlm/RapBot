# ARSITEKTUR EXTENSION SYSTEM RAPBOT

Dokumen ini menjelaskan arsitektur modular **Extension System** pada RapBot.

Prinsip Utama:
> **RapBot Core tidak mengenal domain/business logic aplikasi tertentu. RapBot Core hanya mengenal kontrak Extension.**

```text
                         RAPBOT CORE
                              │
                    ┌─────────┴─────────┐
                    │                   │
             WhatsApp Engine    Extension Manager
                                        │
                         ┌──────────────┼──────────────┐
                         │              │              │
                       Kost          Example          ...
                    (Port 3005)    (Port 3006)
                         │              │
                      HTTP/API       HTTP/API
```

---

## 1. Apa itu RapBot Extension?

Extension adalah aplikasi independen (layanan mandiri yang berjalan di proses/server terpisah) yang menambahkan fungsionalitas dan command khusus ke RapBot tanpa mengubah source code internal RapBot Core.

Karakteristik Extension:
- **Loose Coupling:** Extension memiliki repository, database, dependencies, dan siklus hidup sendiri.
- **Transport Generic:** Berkomunikasi dengan RapBot Core melalui protokol HTTP standar (`POST /command`, `GET /manifest`, `GET /health`).
- **Zero Baileys Dependency:** Extension tidak menyentuh socket WhatsApp Baileys secara langsung.

---

## 2. Extension Manager

Berada di `core/extensions/manager.js`. Bertanggung jawab untuk:
1. Membaca konfigurasi extension dari `config/extensions.json`.
2. Mendaftarkan command bridge ke dalam command registry RapBot.
3. Membentuk payload request context standar.
4. Melakukan dispatching command ke HTTP endpoint extension dengan timeout guard (7 detik).
5. Menerima respon teks dan menginstruksikan `ActionExecutor` untuk menjalankan background actions.
6. Memantau lifecycle state dari setiap extension.

---

## 3. Manifest Specification

Setiap extension mendefinisikan manifest berupa JSON:

```json
{
  "id": "example-extension",
  "name": "Example Extension",
  "version": "1.0.0",
  "endpoint": "http://localhost:3006",
  "description": "Deskripsi singkat extension",
  "commands": [
    {
      "name": "hello",
      "aliases": ["hi", "halo"],
      "description": "Menyapa user",
      "category": "example"
    }
  ]
}
```

---

## 4. Command Registration

Saat booting atau reload:
```text
config/extensions.json
        ↓
ExtensionManager.loadExtensions()
        ↓
ExtensionManager.registerExtensionCommands(commandRegistry)
        ↓
Command Router (messageHandler.js)
```

Setiap command yang didaftarkan ditandai dengan flag `isExtension: true` dan metadata `extensionInfo`.

---

## 5. Request Flow & Standard Context

Ketika user mengetik command extension di WhatsApp (contoh: `!hello` atau `!kost`), RapBot Core membentuk Standard Request Context:

```json
{
  "botId": "6285195532009",
  "chatId": "120363000000000000@g.us",
  "senderId": "628123456789",
  "messageId": "3EB0123456789",
  "isGroup": true,
  "isOwner": true,
  "command": "!hello",
  "args": ["arg1", "arg2"],
  "body": "!hello arg1 arg2",
  "group": {
    "id": "120363000000000000@g.us",
    "name": "Bukittinggi Community",
    "role": "admin",
    "type": "umum",
    "parentGroupId": null,
    "isInitialized": true
  }
}
```

Request dikirimkan ke `POST <endpoint>/command`.

---

## 6. Response Flow

Extension mengembalikan JSON response dengan format standar:

```json
{
  "type": "reply",
  "text": "Pesan balasan yang akan dikirim ke WhatsApp",
  "actions": []
}
```

---

## 7. Action Executor

Berada di `core/extensions/actionExecutor.js`.

Jika extension perlu mengirimkan pesan tambahan (seperti balon template DM terpisah, japri notifikasi ke owner, atau notifikasi persetujuan ke warga pengusul), extension mengembalikan daftar `actions`:

```json
{
  "type": "reply",
  "text": "Usulan kos berhasil disetujui!",
  "actions": [
    {
      "type": "send_message",
      "target": "628123456789@s.whatsapp.net",
      "text": "Halo Kak, usulan kos Anda telah disetujui admin!"
    }
  ]
}
```

`ActionExecutor` secara aman meneruskan perintah `send_message` tersebut ke WhatsApp socket.

---

## 8. Error Handling & Fault Tolerance

RapBot Core dilengkapi proteksi:
1. **Timeout Guard:** Request ke extension dibatasi maksimal 7 detik menggunakan `AbortController`.
2. **Offline Resilience:** Jika extension mati/crash (`fetch failed` / `ECONNREFUSED`), RapBot Core **tidak akan crash**. Core akan membalas user dengan pesan graceful:
   `❌ Layanan extension *<nama_extension>* sedang tidak tersedia (offline atau timeout).`
3. **Zero-Restart Recovery:** Ketika service extension hidup kembali, RapBot Core langsung otomatis terhubung kembali tanpa perlu restart.

---

## 9. Extension Lifecycle

Extension Manager mencatat status siklus hidup setiap extension:
- `LOADED`: Konfigurasi extension telah dimuat ke memory.
- `READY`: Extension aktif dan berhasil menjawab request.
- `OFFLINE`: Gagal terhubung atau timeout.
- `ERROR`: Endpoint extension mengembalikan status error (HTTP 5xx/4xx).
- `RECOVERED`: Extension kembali online setelah sebelumnya OFFLINE/ERROR.

Status ini dapat diinspeksi via `extensionManager.getAllExtensionStates()`.

---

## 10. Cara Membuat Extension Baru

### Langkah 1: Buat Folder & Manifest
Buat direktori project baru (misal di `extensions/my-app/` atau di luar RapBot):
```json
// manifest.json
{
  "id": "my-app",
  "name": "My Application",
  "version": "1.0.0",
  "endpoint": "http://localhost:3010",
  "commands": [
    {
      "name": "myapp",
      "aliases": ["app"],
      "description": "Menjalankan fitur My App",
      "category": "my-app"
    }
  ]
}
```

### Langkah 2: Buat HTTP Server
Implementasikan endpoint `POST /command`:
```js
// server.js
const http = require("http");

http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/command") {
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            const payload = JSON.parse(body);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                type: "reply",
                text: `Halo dari My App! Anda memanggil: ${payload.command}`
            }));
        });
    }
}).listen(3010);
```

### Langkah 3: Daftarkan ke RapBot
Tambahkan entri di `RapBot/config/extensions.json`:
```json
{
  "id": "my-app",
  "name": "My Application",
  "endpoint": "http://localhost:3010",
  "enabled": true,
  "commands": [
    { "name": "myapp", "aliases": ["app"], "description": "Fitur My App" }
  ]
}
```

Command `!myapp` langsung aktif dan otomatis muncul di `!help` RapBot!