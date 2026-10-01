// extensions/kost/index.js - Bukittinggi Kos extension entry point
const path = require('path');
const router = require('./web/router');
const storage = require('./storage');
const formatters = require('./utils/formatters');
const dmTemplate = require('./utils/dmTemplate');

module.exports = {
    name: 'kost',
    title: 'Bukittinggi Kos',
    commandsDir: path.join(__dirname, 'commands'),
    router,
    storage,
    utils: {
        ...formatters,
        ...dmTemplate
    }
};
