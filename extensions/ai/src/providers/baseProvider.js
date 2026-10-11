// extensions/ai/src/providers/baseProvider.js - Abstract Base AI Provider
class BaseProvider {
    constructor(config) {
        this.config = config;
    }

    /**
     * Generate text from prompt
     * @param {Object} options
     * @param {string} options.prompt
     * @param {number} options.maxTokens
     * @param {number} options.timeoutMs
     * @returns {Promise<{ text: string, inputTokens: number, outputTokens: number, model: string }>}
     */
    async generateText(options) {
        throw new Error('generateText must be implemented by subclass');
    }
}

module.exports = {
    BaseProvider
};
