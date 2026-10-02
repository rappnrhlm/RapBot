// core/extensions/manager.js - Generic Extension Manager for RapBot
const fs = require('fs');
const path = require('path');
const ActionExecutor = require('./actionExecutor');

const EXTENSIONS_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'extensions.json');

/**
 * Extension Lifecycle States:
 * - 'LOADED': Config loaded into memory
 * - 'READY': Extension online and answering requests
 * - 'OFFLINE': Connection failed or timeout
 * - 'ERROR': Extension returned error response
 * - 'RECOVERED': Extension returned online after being OFFLINE/ERROR
 */
const ExtensionState = {
    LOADED: 'LOADED',
    READY: 'READY',
    OFFLINE: 'OFFLINE',
    ERROR: 'ERROR',
    RECOVERED: 'RECOVERED'
};

class ExtensionManager {
    constructor(configPath = EXTENSIONS_CONFIG_PATH) {
        this.configPath = configPath;
        this.extensions = [];
        this.states = new Map(); // id -> { id, state, previousState, lastUpdated, lastError }
    }

    /**
     * Set the current lifecycle state for an extension
     */
    setExtensionState(extId, state, meta = {}) {
        const previous = this.states.get(extId)?.state || ExtensionState.LOADED;
        let newState = state;

        if (state === ExtensionState.READY && (previous === ExtensionState.OFFLINE || previous === ExtensionState.ERROR)) {
            newState = ExtensionState.RECOVERED;
        }

        this.states.set(extId, {
            id: extId,
            state: newState,
            previousState: previous,
            lastUpdated: new Date().toISOString(),
            ...meta
        });

        if (newState === ExtensionState.RECOVERED) {
            console.log(`[ExtensionManager] 🔄 Extension "${extId}" has RECOVERED and is now READY.`);
            // Automatically settle to READY after recovery is noted
            setTimeout(() => {
                const current = this.states.get(extId);
                if (current && current.state === ExtensionState.RECOVERED) {
                    current.state = ExtensionState.READY;
                }
            }, 100);
        }
    }

    /**
     * Get lifecycle state of an extension
     */
    getExtensionState(extId) {
        return this.states.get(extId) || { id: extId, state: ExtensionState.LOADED };
    }

    /**
     * Get all extensions and their current states
     */
    getAllExtensionStates() {
        return this.extensions.map(ext => ({
            id: ext.id,
            name: ext.name,
            version: ext.version || '1.0.0',
            endpoint: ext.endpoint,
            enabled: ext.enabled !== false,
            commandCount: (ext.commands || []).length,
            ...this.getExtensionState(ext.id)
        }));
    }

    /**
     * Load extension configurations from config file
     */
    loadExtensions() {
        if (!fs.existsSync(this.configPath)) {
            console.log(`[ExtensionManager] ℹ️ Config file not found at ${this.configPath}, using empty list.`);
            this.extensions = [];
            return this.extensions;
        }

        try {
            const raw = fs.readFileSync(this.configPath, 'utf8');
            const data = JSON.parse(raw);
            this.extensions = Array.isArray(data) ? data : (data.extensions || []);

            for (const ext of this.extensions) {
                if (ext.id && !this.states.has(ext.id)) {
                    this.setExtensionState(ext.id, ExtensionState.LOADED);
                }
            }

            console.log(`[ExtensionManager] 🔌 Loaded ${this.extensions.length} extension configuration(s).`);
        } catch (err) {
            console.error('[ExtensionManager] ❌ Failed to parse extensions config:', err.message);
            this.extensions = [];
        }

        return this.extensions;
    }

    /**
     * Register all extension commands into RapBot command registry
     * @param {Map<string, Object>} commandRegistry - RapBot command registry map
     */
    registerExtensionCommands(commandRegistry) {
        this.loadExtensions();

        for (const ext of this.extensions) {
            if (ext.enabled === false) {
                console.log(`[ExtensionManager] ⏸️ Extension "${ext.name || ext.id}" is disabled, skipping.`);
                continue;
            }

            if (!ext.endpoint || !Array.isArray(ext.commands)) {
                console.warn(`[ExtensionManager] ⚠️ Extension "${ext.name || ext.id || 'unnamed'}" missing endpoint or commands.`);
                continue;
            }

            for (const cmdDef of ext.commands) {
                const cmdName = cmdDef.name?.toLowerCase();
                if (!cmdName) continue;

                const bridgeCommand = {
                    name: cmdName,
                    aliases: (cmdDef.aliases || []).map(a => a.toLowerCase()),
                    description: cmdDef.description || `Provided by ${ext.name || ext.id}`,
                    category: cmdDef.category || ext.id || 'extension',
                    isExtension: true,
                    extensionInfo: {
                        id: ext.id,
                        name: ext.name || ext.id,
                        version: ext.version || '1.0.0',
                        endpoint: ext.endpoint
                    },
                    execute: async (ctx) => {
                        await this.dispatchCommand(ext, cmdName, ctx);
                    }
                };

                commandRegistry.set(cmdName, bridgeCommand);
                if (Array.isArray(bridgeCommand.aliases)) {
                    for (const alias of bridgeCommand.aliases) {
                        if (alias) {
                            commandRegistry.set(alias, bridgeCommand);
                        }
                    }
                }

                console.log(`[ExtensionManager] 📦 Registered external command !${cmdName} -> ${ext.name || ext.id} (${ext.endpoint})`);
            }
        }
    }

    /**
     * Dispatch command execution to target extension over HTTP
     */
    async dispatchCommand(ext, defaultCmdName, ctx) {
        const database = ctx.services?.database;
        const jidUtils = ctx.utils?.jid;
        const cleanFrom = jidUtils ? jidUtils.normalizeJid(ctx.from) : ctx.from;
        const registeredGroup = (ctx.isGroup && database?.getGroupById) ? database.getGroupById(cleanFrom) : null;
        const isOwner = database?.isOwner ? database.isOwner(ctx.senderNumber) : false;

        const activeBotId = ctx.sock?.user?.id ? (jidUtils ? jidUtils.normalizeJid(ctx.sock.user.id) : ctx.sock.user.id) : 'bot';
        const invokedCommand = ctx.command ? `!${ctx.command}` : `!${defaultCmdName}`;

        // Standardized Generic Request Context
        const payload = {
            botId: activeBotId,
            chatId: ctx.from,
            senderId: ctx.senderNumber,
            messageId: ctx.msg?.key?.id || '',
            isGroup: Boolean(ctx.isGroup),
            isOwner: Boolean(isOwner),
            command: invokedCommand,
            args: ctx.args || [],
            body: ctx.body || `${invokedCommand} ${(ctx.args || []).join(' ')}`.trim(),
            group: registeredGroup ? {
                id: registeredGroup.id,
                name: registeredGroup.name || registeredGroup.groupName || '',
                role: registeredGroup.role || 'admin',
                type: registeredGroup.type || 'umum',
                parentGroupId: registeredGroup.parentGroupId || null,
                isInitialized: true
            } : {
                id: ctx.from,
                isInitialized: false
            },
            // Backward-compatible context format for Kost and existing extensions
            context: {
                from: ctx.from,
                senderNumber: ctx.senderNumber,
                isGroup: Boolean(ctx.isGroup),
                isOwner: Boolean(isOwner),
                group: registeredGroup ? {
                    id: registeredGroup.id,
                    name: registeredGroup.name || registeredGroup.groupName || '',
                    role: registeredGroup.role || 'admin',
                    type: registeredGroup.type || 'umum',
                    parentGroupId: registeredGroup.parentGroupId || null,
                    isInitialized: true
                } : {
                    id: ctx.from,
                    isInitialized: false
                },
                body: ctx.body
            }
        };

        const endpointUrl = `${ext.endpoint.replace(/\/+$/, '')}/command`;
        console.log(`[ExtensionManager] 📡 Dispatching ${invokedCommand} to ${ext.name || ext.id} (${endpointUrl})...`);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 7000);

            const res = await fetch(endpointUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!res.ok) {
                this.setExtensionState(ext.id, ExtensionState.ERROR, { lastError: `HTTP ${res.status}: ${res.statusText}` });
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }

            const result = await res.json();
            this.setExtensionState(ext.id, ExtensionState.READY);

            // 1. Reply main message to WhatsApp
            const replyText = result?.text || result?.reply || (result?.type === 'reply' ? result.text : null);
            if (replyText && typeof replyText === 'string' && replyText.trim()) {
                await ctx.reply(replyText);
            }

            // 2. Execute any generic actions via ActionExecutor
            if (Array.isArray(result?.actions) && result.actions.length > 0) {
                await ActionExecutor.executeActions(result.actions, ctx.sock);
            }

            // Fallback if extension returned empty output
            if (!replyText && (!Array.isArray(result?.actions) || result.actions.length === 0)) {
                await ctx.reply('⚠️ Extension tidak mengembalikan respon teks.');
            }
        } catch (err) {
            this.setExtensionState(ext.id, ExtensionState.OFFLINE, { lastError: err.message });
            console.error(`[ExtensionManager] ❌ Failed communicating with ${ext.name || ext.id}:`, err.message);
            await ctx.reply(`❌ Layanan extension *${ext.name || ext.id}* sedang tidak tersedia (offline atau timeout).`);
        }
    }
}

const defaultManager = new ExtensionManager();
defaultManager.ExtensionManager = ExtensionManager;
defaultManager.ExtensionState = ExtensionState;

module.exports = defaultManager;
