// extensions/kost/storage/index.js - KOST storage aggregation
const kost = require('./kost');
const submissions = require('./submissions');

module.exports = {
    ...kost,
    ...submissions
};
