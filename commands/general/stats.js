module.exports = {
    name: 'stats',
    aliases: ['status', 'botstats'],
    category: 'general',
    description: 'Menampilkan statistik bot dan server.',
    usage: '!stats',

    async execute({ sock, msg, from, reply, services }) {
        const database = services?.database || require('../../services/database');
        const serverStats = services?.serverStats || require('../../services/serverStats');

        const stats = database.getStats();
        const started = new Date(stats.startedAt);
        const uptime = Date.now() - started.getTime();

        const server = await serverStats.getServerStats();

        const sorted = Object.entries(stats.commandUsage || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        let topCommands = '> Belum ada';
        if (sorted.length) {
            topCommands = sorted
                .map(([cmd, count], i) => `${i + 1}. !${cmd} — ${count}x`)
                .join('\n');
        }

        let serverDetails = '> ⚠️ Gagal mengambil info server';
        if (server) {
            serverDetails =
`Device: ${server.deviceName}
Lokasi: ${server.city}
CPU Load: ${server.cpuLoad}%
CPU Temp: ${server.cpuTemp}
RAM: ${server.ramUsedGB} GB / ${server.ramTotalGB} GB (${server.ramPercent}%)
Disk: ${server.diskUsedGB} GB / ${server.diskTotalGB} GB (${server.diskPercent}%)`;
        }

        const text =
`╭━━━〔 📊 *BOT STATS* 〕━━━╮

⏱️ *Uptime*
${serverStats.formatDuration(uptime)}

💬 *Pesan diproses*
${stats.messages}

🤖 *Command*
${stats.commands}

🎨 *Sticker*
${stats.stickers}

🖼️ *Brat*
${stats.brats}

🖥️ *SERVER MONITOR*
${serverDetails}

🔥 *TOP COMMAND*
${topCommands}

╰━━━━━━━━━━━━━━━━━━━━╯`;

        if (typeof reply === 'function') {
            await reply(text);
        } else {
            await sock.sendMessage(from, { text }, { quoted: msg });
        }
    }
};