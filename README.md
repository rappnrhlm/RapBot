# 🤖 RapBot — Modular WhatsApp Bot & Community Automation Platform

RapBot is a production-ready, modular WhatsApp automation and community management bot built on top of [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) and Express.js. Designed with clean architecture principles, RapBot decouples core bot capabilities (media conversion, group moderation, autoreplies, multi-owner permissions) from domain-specific business extensions (such as **Bukittinggi Kos** listing management).

---

## 🌟 Key Highlights

- 🧩 **Modular Plugin Architecture**: Clear separation between core system libraries and business extensions (`extensions/`).
- ⚡ **High Performance & Stability**: Baileys socket integration with auto-reconnection, timestamp filtering, and event debouncing.
- 🗄️ **Hybrid Storage System**: Primary MariaDB database pool with seamless automatic in-memory & JSON file caching fallback.
- 🌐 **Full-Featured Web Dashboard**: Interactive real-time control panel, command sandbox/simulator, owner/group manager, and broadcast center.
- 🎨 **Rich Media Engine**: Sticker generator, Brat meme creator (`@ghuts/brat`), top/bottom meme generator (`smeme`), and image converter.
- 🛡️ **Granular Permission & Security System**: Super-owner, registered owners, group admins, and member role hierarchy.

---

## 🏗️ System Architecture

```
                                  ┌─────────────────────────────┐
                                  │      WhatsApp Network       │
                                  └──────────────┬──────────────┘
                                                 │
                                     (Baileys Socket Engine)
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                       RAPBOT CORE                                       │
│                                                                                         │
│  ┌───────────────────────┐   ┌────────────────────────┐   ┌──────────────────────────┐  │
│  │   Message Parser      │──▶│   Security / Context   │──▶│    Command Dispatcher    │  │
│  │  (Parser & Timestamp) │   │ (Cooldown, Perms, JID) │   │ (Core & Ext Command Map) │  │
│  └───────────────────────┘   └────────────────────────┘   └────────────┬─────────────┘  │
│                                                                        │                │
│       ┌───────────────────────┬───────────────────────┬────────────────┴────────┐       │
│       ▼                       ▼                       ▼                         ▼       │
│  [General Cmds]         [Group Moderation]      [Sticker Engine]        [Autoreply Engine] │
└───────┬───────────────────────┬───────────────────────┬─────────────────────────┬───────┘
        │                       │                       │                         │
        └───────────────────────┼───────────────────────┼─────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                             DOMAIN EXTENSIONS (Plug & Play)                             │
│                                                                                         │
│  📁 extensions/kost/                                                                    │
│  ├── 📦 Commands: !kost, !usulkost, !listusul, !acc, !tolak, !delkost, !post, !sent...  │
│  ├── 🗄️ Storage: Listing database, submissions workflow, verification logic             │
│  ├── 🛠️ Utils: WhatsApp DM templating, formatting & search algorithms                    │
│  └── 🌐 Web Router: /api/kost, /api/submissions endpoints                               │
└──────────────────────────────────────┬──────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                  STORAGE FACADE & WEB LAYER                             │
│                                                                                         │
│  ┌─────────────────────────────────────────────────┐   ┌─────────────────────────────┐  │
│  │               Hybrid Storage Layer              │   │     Express Web Dashboard   │  │
│  │  MariaDB Pool  ◀─── Fallback ───▶  JSON / Cache │   │  Control Panel, Simulator   │  │
│  └─────────────────────────────────────────────────┘   └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
├── bot.js                      # Clean Bot Orchestrator & Entry Point
├── ecosystem.config.js         # PM2 Process Manager Configuration
├── nodemon.js                  # Nodemon Development Configuration
│
├── core/                       # Core Bot Framework
│   ├── commands/               # Built-in Core Commands
│   │   ├── autoreply/          # Autoreply management commands
│   │   ├── general/            # General utility commands (!ping, !help, !stats, !culik)
│   │   ├── group/              # Group admin & moderation (!hidetag, !tagall, !kick, !initgroup)
│   │   ├── owner/              # Super-owner operations (!owner, !tariksiaran)
│   │   └── sticker/            # Media processing (!stiker, !brat, !smeme, !toimg)
│   ├── permissions/            # Super-owner, owner, & admin authorization logic
│   ├── services/               # System info & hardware stats service
│   ├── storage/                # Core persistence layer (MariaDB + JSON cache)
│   │   ├── mariadb/            # Connection pool & database schemas
│   │   ├── json/               # Atomic JSON file storage & in-memory cache
│   │   └── *.js                # Owners, stats, logs, welcome, autoreplies, groups, broadcasts
│   ├── utils/                  # Core utilities (phone, JID, JSON, cooldown, group helpers)
│   └── whatsapp/               # Baileys Socket Engine
│       ├── connection.js       # Socket lifecycle, authentication, QR & event handlers
│       ├── context.js          # Execution context builder (reply, sender, permissions)
│       ├── messageHandler.js   # Dynamic command loader & message router
│       ├── parser.js           # Message payload parser
│       └── welcomeHandler.js   # Group member join/leave event handler
│
├── extensions/                 # Pluggable Domain Extensions
│   └── kost/                   # Bukittinggi Kos Community Extension
│       ├── index.js            # Extension Manifest
│       ├── commands/           # 12 Domain commands (!kost, !usulkost, !acc, !tolak, etc.)
│       ├── storage/            # Kos listings & submissions storage
│       ├── utils/              # Kos formatters & WhatsApp DM templates
│       └── web/                # Express API router for Kos & Submissions
│
├── services/
│   └── database.js             # Unified Storage Facade (Backward Compatible)
│
└── web/                        # Web Dashboard & API Layer
    ├── auth.js                 # Superuser PIN validation & extraction
    ├── socket.js               # Shared active Baileys socket reference
    ├── server.js               # Express Server & API Routes
    └── public/                 # Dashboard Frontend (HTML, CSS, JS)
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: `v18.0.0` or higher (tested on Node.js v20+ / v24)
- **MariaDB / MySQL** (optional — bot automatically falls back to JSON file storage if MariaDB is unavailable)
- **Chromium / Google Chrome** (only required if running the legacy `whatsapp-web.js` driver in `index.js`)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/rappnrhlm/Wa-Bot.git
   cd Wa-Bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy the example environment file and set your configuration:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   # Web Server & Security
   WEB_PORT=3001
   ADMIN_PIN=160509

   # MariaDB / MySQL Configuration (Optional)
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=rapbot
   ```

---

## 🏃 Running the Bot

### Development Mode (with auto-reload)
```bash
npm run dev
```

### Production Mode (Standard Node.js)
```bash
npm start
```

### Production with PM2 Process Manager
```bash
npm run pm2:start     # Start PM2 cluster
npm run pm2:logs      # View live logs
npm run pm2:restart   # Restart bot
npm run pm2:stop      # Stop bot
```

When started for the first time, a QR code will be rendered in your terminal. Scan it with WhatsApp (**Linked Devices**) to pair.

---

## 💬 Command Reference

### 🌐 General Commands
| Command | Aliases | Description | Permission |
| :--- | :--- | :--- | :--- |
| `!ping` | `!p`, `!test` | Check bot latency and response time | Public |
| `!help` | `!menu` | Display categorized bot help menu | Public |
| `!stats` | `!botinfo` | Show bot uptime, memory, and usage stats | Public |
| `!jid` | `!myid` | Display current chat or user WhatsApp JID | Public |
| `!culik` | `!grup` | Share community group invitation links | Public |

### 🎨 Media & Sticker Engine
| Command | Aliases | Description | Permission |
| :--- | :--- | :--- | :--- |
| `!stiker` | `!s`, `!sticker`, `!sgif` | Convert image/video to WhatsApp sticker | Public |
| `!brat` | `!bratvid`, `!bratgif` | Generate Brat aesthetic text sticker | Public |
| `!smeme` | `!stickermeme` | Add top and bottom text meme to image/sticker | Public |
| `!toimg` | `!toimage` | Convert sticker back to standard image | Public |

### 🛡️ Group Moderation
| Command | Aliases | Description | Permission |
| :--- | :--- | :--- | :--- |
| `!tagall` | `!everyone`, `!semua` | Tag all group members with custom message | Group Admin |
| `!hidetag` | `!ht` | Mention all members invisibly | Group Admin |
| `!kick` | `!tendang`, `!remove` | Remove user from group | Group Admin |
| `!listadmin` | `!admins` | Display list of group administrators | Public (Group) |
| `!welcome` | `!setwelcome` | Configure group join/leave greeting message | Group Admin |
| `!initgroup` | `!setgroup` | Register group role (`indukan` / `cabang`) | Owner |
| `!clear` | `!hapuspesan` | Bulk delete recent bot messages | Group Admin |

### 🏘️ Bukittinggi Kos Extension
| Command | Aliases | Description | Permission |
| :--- | :--- | :--- | :--- |
| `!kost` | `!carikost`, `!infokost` | Search and query verified Kos listings | Public |
| `!usulkost` | `!usul` | Submit new Kos listing recommendation | Public |
| `!listusul` | `!daftarusul` | View list of pending community submissions | Admin / Owner |
| `!acc` | `!terimausul` | Approve submission and auto-add to database | Admin / Owner |
| `!tolak` | `!reject` | Reject submitted Kos recommendation | Admin / Owner |
| `!delkost` | `!hapuskost` | Remove Kos listing from database | Admin / Owner |
| `!editkost` | `!updatekost` | Update Kos details (contact, social media) | Admin / Owner |
| `!post` | `!publishkost` | Mark listing as published & auto-notify owner | Admin / Owner |
| `!sent` | `!telahkirim` | Mark listing proposal as sent | Admin / Owner |
| `!dm` | `!japri` | Send standardized WhatsApp DM template to owner | Admin / Owner |

### 👑 Owner & System
| Command | Aliases | Description | Permission |
| :--- | :--- | :--- | :--- |
| `!owner` | `!addowner`, `!delowner` | Manage authorized bot owners | Super Owner |
| `!tariksiaran` | `!undobroadcast` | Simultaneously recall broadcast across groups | Owner |
| `!autoreply-add` | `!addar` | Register dynamic autoreply keyword | Owner |

---

## 🌐 Web Dashboard & API

RapBot includes an integrated web dashboard running on `http://localhost:3001` (configurable via `WEB_PORT`).

### Features:
- 📊 **Realtime Status**: Live socket connection status, uptime, system load, and command throughput.
- 👥 **Owner & Group Management**: Add/remove bot owners and link parent/branch community groups.
- 🧪 **Live Command Sandbox**: Simulate bot commands with live contextual responses without sending WhatsApp messages.
- 📢 **Broadcast Center**: Dispatch broadcasts to select group categories with one-click simultaneous message undo/recall.
- 🏘️ **Kos Listing Control**: Search, review, edit, approve, and auto-dispatch confirmation messages.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
Built with ❤️ for community management and automation.
