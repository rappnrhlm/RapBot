const si = require('systeminformation');
const os = require('os');

async function getServerStats() {
    try {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        const temp = await si.cpuTemperature();
        const fsSize = await si.fsSize();

        const disk = fsSize[0] || { use: 0, size: 0, used: 0 };

        const ramUsedGB = (mem.active / (1024 ** 3)).toFixed(1);
        const ramTotalGB = (mem.total / (1024 ** 3)).toFixed(1);
        const ramPercent = Math.round((mem.active / mem.total) * 100);

        const cpuLoad = Math.round(cpu.currentLoad || 0);
        const cpuTemp = temp.main ? `${Math.round(temp.main)}°C` : 'N/A';

        const diskUsedGB = (disk.used / (1024 ** 3)).toFixed(1);
        const diskTotalGB = (disk.size / (1024 ** 3)).toFixed(1);
        const diskPercent = Math.round(disk.use || 0);

        const deviceName = os.hostname();

        let city = 'Indonesia';
        const dev = deviceName.toLowerCase();

        if (dev.includes('victus') || dev.includes('rapahh')) {
            city = 'Bukittinggi';
        } else if (dev.includes('armbian') || dev.includes('stb')) {
            city = 'Pekanbaru';
        }

        return {
            deviceName,
            city,
            cpuLoad,
            cpuTemp,
            ramUsedGB,
            ramTotalGB,
            ramPercent,
            diskUsedGB,
            diskTotalGB,
            diskPercent
        };
    } catch (err) {
        console.error('[services/serverStats] Error fetching system stats:', err.message);
        return null;
    }
}

function formatDuration(ms) {
    let seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    seconds %= 86400;
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;

    const parts = [];
    if (days) parts.push(`${days}h`);
    if (hours) parts.push(`${hours}j`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${seconds}d`);

    return parts.join(' ');
}

module.exports = {
    getServerStats,
    formatDuration
};
