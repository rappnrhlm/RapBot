const fs = require('fs');
const path = require('path');

function readJSON(filePath, fallback = null) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content || !content.trim()) {
            return fallback;
        }
        return JSON.parse(content);
    } catch (err) {
        console.error(`[utils/json] Error reading JSON from ${filePath}:`, err.message);
        return fallback;
    }
}

function writeJSON(filePath, data) {
    try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const tempPath = `${filePath}.tmp.${Date.now()}`;
        fs.writeFileSync(tempPath, JSON.stringify(data, null, 4), 'utf8');
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (err) {
        console.error(`[utils/json] Error writing JSON to ${filePath}:`, err.message);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf8');
            return true;
        } catch (fatalErr) {
            console.error(`[utils/json] Fatal error writing fallback JSON to ${filePath}:`, fatalErr.message);
            return false;
        }
    }
}

module.exports = {
    readJSON,
    writeJSON
};
