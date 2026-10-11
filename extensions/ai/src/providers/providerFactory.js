// extensions/ai/src/providers/providerFactory.js - Factory for creating and registering AI providers
const { GeminiProvider } = require('./geminiProvider');

class ProviderFactory {
    constructor() {
        this.providers = new Map();
        this.register('gemini', GeminiProvider);
    }

    /**
     * Register a new provider class
     * @param {string} name
     * @param {Function} providerClass
     */
    register(name, providerClass) {
        this.providers.set(name.toLowerCase(), providerClass);
    }

    /**
     * Create an instance of provider
     * @param {string} name
     * @param {Object} config
     */
    create(name, config) {
        const key = (name || 'gemini').toLowerCase();
        const ProviderClass = this.providers.get(key);
        if (!ProviderClass) {
            const available = Array.from(this.providers.keys()).join(', ');
            throw new Error(`Provider AI "${name}" tidak didukung. Provider yang tersedia: ${available}`);
        }
        return new ProviderClass(config);
    }

    getSupportedProviders() {
        return Array.from(this.providers.keys());
    }
}

const defaultFactory = new ProviderFactory();

module.exports = {
    ProviderFactory,
    providerFactory: defaultFactory
};
