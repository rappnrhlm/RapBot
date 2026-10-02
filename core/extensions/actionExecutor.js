// core/extensions/actionExecutor.js - Generic Action Executor for Extension Responses
/**
 * Generic Action Executor
 * Translates abstract extension action payloads into concrete WhatsApp / Transport calls.
 * Extensions never touch Baileys WhatsApp socket directly.
 */
class ActionExecutor {
    /**
     * Execute a list of generic actions returned by an extension
     * @param {Array<Object>} actions - Array of action objects, e.g. [{ type: 'send_message', target: '...', text: '...' }]
     * @param {Object} sock - Baileys WhatsApp socket
     * @param {Object} options - Additional execution options
     */
    static async executeActions(actions, sock, options = {}) {
        if (!Array.isArray(actions) || actions.length === 0) {
            return { executed: 0, errors: [] };
        }

        let executedCount = 0;
        const errors = [];

        for (const action of actions) {
            if (!action || typeof action !== 'object') continue;

            try {
                switch (action.type) {
                    case 'send_message':
                        await this.handleSendMessage(action, sock);
                        executedCount++;
                        break;
                    default:
                        console.warn(`[ActionExecutor] ⚠️ Unsupported action type: ${action.type}`);
                        break;
                }
            } catch (err) {
                console.error(`[ActionExecutor] ❌ Error executing action ${action.type}:`, err.message);
                errors.push({ action, error: err.message });
            }
        }

        return { executed: executedCount, errors };
    }

    /**
     * Handle 'send_message' action
     * @param {Object} action - { type: 'send_message', target: '...', text: '...' }
     * @param {Object} sock - Baileys WhatsApp socket
     */
    static async handleSendMessage(action, sock) {
        const { target, text } = action;
        if (!target || !text) {
            throw new Error('send_message action requires valid target and text');
        }

        if (!sock || typeof sock.sendMessage !== 'function') {
            throw new Error('WhatsApp socket is not available to send message');
        }

        await sock.sendMessage(target, { text });
        console.log(`[ActionExecutor] ✉️ Executed action send_message to ${target}`);
    }
}

module.exports = ActionExecutor;
