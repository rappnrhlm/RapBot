const fs = require('fs');
const path = require('path');
const os = require('os');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');

const BRAT_COOLDOWN = 3000;
const bratCooldowns = new Map();
let renderBratFn = null;

async function getRenderBrat() {
    if (!renderBratFn) {
        const bratModule = await import('@ghuts/brat');
        renderBratFn = bratModule.renderBrat;
    }
    return renderBratFn;
}

module.exports = {
    name: 'brat',
    aliases: [],
    category: 'sticker',
    description: 'Membuat stiker teks bergaya Brat (Charli XCX).',
    usage: '!brat teks',

    async execute({ sock, msg, from, senderNumber, args, reply, services }) {
        const database = services?.database || require('../../services/database');

        const text = args.join(' ').trim();
        if (!text) {
            const prompt = 'Contoh: !brat dih so ganteng tapi emang ganteng sih';
            if (typeof reply === 'function') {
                await reply(prompt);
            } else {
                await sock.sendMessage(from, { text: prompt }, { quoted: msg });
            }
            return;
        }

        const cooldownKey = senderNumber || msg.key?.participant || from;
        const now = Date.now();
        const last = bratCooldowns.get(cooldownKey) || 0;

        if (now - last < BRAT_COOLDOWN) {
            const remaining = Math.ceil((BRAT_COOLDOWN - (now - last)) / 1000);
            const cdMsg = `⏳ Tunggu ${remaining} detik.`;
            if (typeof reply === 'function') {
                await reply(cdMsg);
            } else {
                await sock.sendMessage(from, { text: cdMsg }, { quoted: msg });
            }
            return;
        }

        bratCooldowns.set(cooldownKey, now);

        if (typeof reply === 'function') {
            await reply('⏳ Bikin stiker Brat...');
        } else {
            await sock.sendMessage(from, { text: '⏳ Bikin stiker Brat...' }, { quoted: msg });
        }

        const outputPath = path.join(
            os.tmpdir(),
            `brat-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
        );

        try {
            const render = await getRenderBrat();
            if (!render) {
                throw new Error('Fungsi renderBrat tidak tersedia.');
            }

            await render({
                text,
                out: outputPath,
                size: 256,
                layout: 'full',
                blur: 7
            });

            const imageBuffer = fs.readFileSync(outputPath);
            const sticker = new Sticker(imageBuffer, {
                pack: 'Brat Text',
                author: 'Raffa',
                type: StickerTypes.FULL,
                quality: 100
            });

            const stickerBuffer = await sticker.toBuffer();
            await sock.sendMessage(
                from,
                { sticker: stickerBuffer },
                { quoted: msg }
            );

            database.incrementBratStats();
        } catch (err) {
            console.error('[commands/sticker/brat] Error generating brat sticker:', err);
            const errMsg = `❌ Gagal membuat stiker Brat.\n\n${err.message}`;
            if (typeof reply === 'function') {
                await reply(errMsg);
            } else {
                await sock.sendMessage(from, { text: errMsg }, { quoted: msg });
            }
        } finally {
            if (fs.existsSync(outputPath)) {
                try {
                    fs.unlinkSync(outputPath);
                } catch {}
            }
        }
    }
};
