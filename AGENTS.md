# AGENTS.md

## Project Overview

WhatsApp bot using `@whiskeysockets/baileys` with an Express web server for owner management. Bot prefix is `!`.

## Entry Points

- **`bot.js`** — Primary entry point (Baileys-based bot). Run this to start the bot.
- **`index.js`** — Secondary bot using `whatsapp-web.js` (legacy/simpler, not the main bot).
- **`web/server.js`** — Express server for owner CRUD API (auto-loaded by `bot.js`).

## Commands

```bash
npm start          # node bot.js (production)
npm run dev        # nodemon bot.js with ignores for auth/data
```

`npm run dev` uses `nodemon.js` which ignores `auth_baileys/`, `.wwebjs_auth/`, `.wwebjs_cache/`, and `data/`.

## Critical Directories (NEVER commit these)

- `auth_baileys/` — WhatsApp session/auth state (958+ files). Listed in `.gitignore`.
- `data/` — Runtime JSON (owners.json, stats.json, command-log.json, welcome.json). Listed in `.gitignore`.
- `.env` — Contains `ADMIN_PIN=160509`. Listed in `.gitignore`.

## Architecture

- Commands are dynamically loaded from `commands/{category}/*.js` via `handlers/messageHandler.js`. Each command file must export `name` and `execute(context)`.
- `handlers/welcomeHandler.js` handles group join events.
- `services/` contains `database.js`, `serverStats.js`, `spreadsheet.js` (some are empty stubs).
- `utils/` has helpers: `group.js`, `jid.js`, `json.js`, `phone.js`.
- `@ghuts/brat` is imported dynamically (`await import()`) in `bot.js` for text-to-sticker generation.

## Environment

- `.env.example` has `ADMIN_PIN=` (empty). Copy to `.env` and set the PIN for the web API.
- Web server port: `WEB_PORT` env var, defaults to `3001`.
- Requires Chromium at `/usr/bin/chromium` for `whatsapp-web.js` (`index.js`).

## Notable Details

- `bot.js` is ~1388 lines with all command logic inline (not fully using the `commands/` directory yet — both patterns coexist).
- `index.js` uses `whatsapp-web.js` with `LocalAuth` and custom puppeteer args.
- Super owner number is hardcoded: `6285195532009` (`SUPER_OWNER` in `bot.js`).
- No test suite, no lint/typecheck config, no CI workflow.
- `package.json` is `type: commonjs`.
- `allowScripts` in package.json enables sharp native builds.
