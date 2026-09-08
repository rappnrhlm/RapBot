module.exports = {
    apps: [
        {
            name: 'rapbot',
            script: 'bot.js',
            watch: true,
            // PENTING: Wajib abaikan auth_baileys & data agar bot tidak restart terus-menerus setiap kali ada chat masuk!
            ignore_watch: [
                'node_modules',
                'auth_baileys',
                '.wwebjs_auth',
                '.wwebjs_cache',
                'data',
                '*.log',
                '.git'
            ],
            watch_options: {
                followSymlinks: false
            },
            max_memory_restart: '500M',
            env: {
                NODE_ENV: 'production'
            }
        }
    ]
};
