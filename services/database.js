// services/database.js - Unified Database & Storage facade
// Aggregates core domain storage modules and extension storage modules with 100% backward compatibility.

const coreStorage = require('../core/storage');
const kostStorage = require('../extensions/kost/storage');
const kostFormatters = require('../extensions/kost/utils/formatters');

module.exports = {
    ...coreStorage,
    ...kostStorage,
    ...kostFormatters
};
