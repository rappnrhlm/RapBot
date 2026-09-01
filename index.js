const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

const client = new Client({
    authStrategy: new LocalAuth(),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1018972684-alpha.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

const PREFIX = '!';

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('Bot Siap! 🚀'));

client.on('message', async (msg) => {
    if (!msg.body.startsWith(PREFIX)) return;

    const args = msg.body.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    switch (command) {
        case 'ping':
            await msg.reply('Pong! 🏓 Bot aktif!');
            break;

        case 'halo':
        case 'hai':
            await msg.reply('Halo! Ada yang bisa dibantu?');
            break;

        case 'stiker':
        case 'sticker':
            let mediaMsg = msg;

            if (msg.hasQuotedMsg) {
                const quotedMsg = await msg.getQuotedMessage();
                if (quotedMsg.hasMedia) mediaMsg = quotedMsg;
            }

            if (mediaMsg.hasMedia) {
                try {
                    await msg.reply('⏳ Sedang memproses stiker...');

                    // Ambil URL media langsung jika tersedia, atau pakai attachment
                    const media = await mediaMsg.downloadMedia().catch(() => null);

                    if (!media) {
                        return await msg.reply('❌ WA Web memblokir akses media langsung. Restart bot atau coba foto lain.');
                    }

                    const sticker = new Sticker(Buffer.from(media.data, 'base64'), {
                        pack: 'Bot WA',
                        author: 'Raffa',
                        type: StickerTypes.FULL,
                        quality: 70
                    });

                    const buffer = await sticker.toBuffer();
                    await client.sendMessage(msg.from, buffer, { sendMediaAsSticker: true });
                } catch (err) {
                    console.error('Error Stiker:', err.message);
                    await msg.reply('❌ Gagal memproses stiker.');
                }
            } else {
                await msg.reply('Kirim foto dengan caption `!stiker` atau reply foto!');
            }
            break;

        case 'menu':
        case 'help':
            const menuText = `🤖 *MENU BOT WA*

1. \`!ping\` - Cek status bot
2. \`!stiker\` - Kirim/reply gambar untuk jadi stiker
3. \`!halo\` - Menyapa bot`;
            await msg.reply(menuText);
            break;

        default:
            await msg.reply(`Perintah \`!${command}\` tidak dikenali. Ketik \`!menu\` untuk bantuan.`);
            break;
    }
});

client.initialize();