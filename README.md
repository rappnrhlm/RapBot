# 🤖 RapBot Core

Modular, High-Performance WhatsApp Bot Gateway built with `@whiskeysockets/baileys`, Express Web Admin Panel, and a Dynamic Microservice Extension Architecture.

---

## 🌟 Key Features

- **Decoupled Extension Architecture**: Connect standalone microservices (e.g. Bukittinggi Kos, Bot Kelas) via HTTP endpoints without bloating the core bot.
- **Dynamic Command Dispatcher**: Automatically registers, validates cooldowns, and routes commands to appropriate modules/extensions.
- **Web Admin Panel**: Dashboard for bot status, runtime logs, system info, owner management, and whitelist control.
- **Multi-Device Support**: Built on Baileys WebSocket connection with auto-reconnect and session persistence.
- **Production Ready**: Optimized PM2 support with smart watch/ignore rules.

---

## 📁 Architecture Overview

```text
RapBot/
├── bot.js                  # Gateway entry point (Baileys socket)
├── core/                   # Command router, permissions, extensions manager
│   ├── commands/           # Core commands (admin, ping, stats, etc.)
│   ├── extensions/         # Dynamic HTTP Extension Loader & State Manager
│   └── handlers/           # Message, group, and event listeners
├── config/
│   └── extensions.json     # Extension registry (e.g. Kost on port 3005)
├── web/                    # Express Web Dashboard & API
└── data/                   # Runtime state (owners, stats, whitelist)
```

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone <your-repo-url>/RapBot.git core
cd core
npm install
```

### 2. Configuration
Copy `.env.example` to `.env` and set your credentials:
```bash
cp .env.example .env
```
```env
ADMIN_PIN=160509
SUPER_OWNER=6285195532009
PORT=3001
```

### 3. Running
```bash
# Development (with nodemon)
npm run dev

# Production
npm start
```

---

## 🔌 Connecting Extensions

Register your external services in `config/extensions.json`:

```json
[
  {
    "id": "kost",
    "name": "Bukittinggi Kos",
    "endpoint": "http://localhost:3005",
    "enabled": true
  }
]
```

---

## 📜 License
ISC License
