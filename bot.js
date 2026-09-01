require('dotenv').config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const qrcode = require('qrcode-terminal');
const pino = require('pino');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const fs = require('fs');
const path = require('path');

let renderBrat;

const PREFIX = '!';
const SUPER_OWNER = '6285195532009';
const BRAT_COOLDOWN = 3000;

const bratCooldowns = new Map();

const DATA_DIR = path.join(__dirname, 'data');
const OWNER_FILE = path.join(DATA_DIR, 'owners.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const LOG_FILE = path.join(DATA_DIR, 'command-log.json');
const WELCOME_FILE = path.join(DATA_DIR, 'welcome.json');

function ensureDataFiles() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(OWNER_FILE)) {
        fs.writeFileSync(
            OWNER_FILE,
            JSON.stringify(
                [
                    {
                        name: 'Raffa',
                        number: SUPER_OWNER
                    }
                ],
                null,
                4
            )
        );
    }

    if (!fs.existsSync(STATS_FILE)) {
        fs.writeFileSync(
            STATS_FILE,
            JSON.stringify(
                {
                    messages: 0,
                    commands: 0,
                    stickers: 0,
                    brats: 0,
                    startedAt: new Date().toISOString(),
                    commandUsage: {}
                },
                null,
                4
            )
        );
    }

    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(
            LOG_FILE,
            JSON.stringify([], null, 4)
        );
    }

    if (!fs.existsSync(WELCOME_FILE)) {
        fs.writeFileSync(
            WELCOME_FILE,
            JSON.stringify(
                {
                    enabled: true,
                    text:
                        '👋 Selamat datang @user di *@group*!\n\n' +
                        'Semoga betah di sini 🤙\n' +
                        'Ketik !menu untuk melihat fitur bot.'
                },
                null,
                4
            )
        );
    }
}

function readJSON(file, fallback) {
    try {
        return JSON.parse(
            fs.readFileSync(file, 'utf8')
        );
    } catch {
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(
        file,
        JSON.stringify(data, null, 4)
    );
}

function getOwners() {
    ensureDataFiles();

    const data = readJSON(
        OWNER_FILE,
        []
    );

    if (!Array.isArray(data)) {
        return [];
    }

    return data;
}

function saveOwners(owners) {
    writeJSON(
        OWNER_FILE,
        owners
    );
}

function normalizePhoneNumber(number) {
    if (!number) return '';

    let phone = String(number)
        .replace(/\D/g, '');

    if (phone.startsWith('0')) {
        phone = '62' + phone.slice(1);
    }

    return phone;
}

function normalizeJid(jid) {
    if (!jid) return '';

    return String(jid)
        .trim()
        .replace(/:\d+(?=@)/, '');
}

function getJidNumber(jid) {
    if (!jid) return '';

    return String(jid)
        .split('@')[0]
        .split(':')[0];
}

function isGroup(jid) {
    return jid?.endsWith('@g.us');
}

function isOwner(number) {
    const normalized =
        normalizePhoneNumber(number);

    return getOwners().some(owner => {
        const ownerNumber =
            typeof owner === 'object'
                ? owner.number
                : owner;

        return (
            normalizePhoneNumber(ownerNumber) ===
            normalized
        );
    });
}

function isSuperOwner(number) {
    return (
        normalizePhoneNumber(number) ===
        SUPER_OWNER
    );
}

function maskNumber(number) {
    const phone =
        normalizePhoneNumber(number);

    if (phone.length < 8) {
        return phone;
    }

    return (
        phone.slice(0, 4) +
        'xxxxxx' +
        phone.slice(-2)
    );
}

function formatDuration(ms) {
    let seconds =
        Math.floor(ms / 1000);

    const days =
        Math.floor(seconds / 86400);

    seconds %= 86400;

    const hours =
        Math.floor(seconds / 3600);

    seconds %= 3600;

    const minutes =
        Math.floor(seconds / 60);

    seconds %= 60;

    const parts = [];

    if (days) {
        parts.push(`${days}h`);
    }

    if (hours) {
        parts.push(`${hours}j`);
    }

    if (minutes) {
        parts.push(`${minutes}m`);
    }

    parts.push(`${seconds}d`);

    return parts.join(' ');
}

function getStats() {
    ensureDataFiles();

    return readJSON(
        STATS_FILE,
        {
            messages: 0,
            commands: 0,
            stickers: 0,
            brats: 0,
            startedAt: new Date().toISOString(),
            commandUsage: {}
        }
    );
}

function saveStats(stats) {
    writeJSON(
        STATS_FILE,
        stats
    );
}

function incrementMessageStats() {
    const stats = getStats();

    stats.messages++;

    saveStats(stats);
}

function incrementCommandStats(command) {
    const stats = getStats();

    stats.commands++;

    if (!stats.commandUsage) {
        stats.commandUsage = {};
    }

    stats.commandUsage[command] =
        (stats.commandUsage[command] || 0) + 1;

    saveStats(stats);
}

function incrementStickerStats() {
    const stats = getStats();

    stats.stickers++;

    saveStats(stats);
}

function incrementBratStats() {
    const stats = getStats();

    stats.brats++;

    saveStats(stats);
}

function logCommand(command, from, senderNumber) {
    const logs =
        readJSON(
            LOG_FILE,
            []
        );

    logs.push({
        command,
        from,
        sender:
            senderNumber || 'unknown',
        type:
            isGroup(from)
                ? 'group'
                : 'private',
        timestamp:
            new Date().toISOString()
    });

    if (logs.length > 5000) {
        logs.splice(
            0,
            logs.length - 5000
        );
    }

    writeJSON(
        LOG_FILE,
        logs
    );
}

async function resolveSenderNumber(
    sock,
    msg,
    from
) {
    const sender =
        msg?.key?.participant ||
        msg?.key?.remoteJid ||
        from;

    if (!sender) {
        return '';
    }

    if (
        sender.endsWith(
            '@s.whatsapp.net'
        )
    ) {
        return normalizePhoneNumber(
            getJidNumber(sender)
        );
    }

    const alt =
        msg?.key?.participantAlt ||
        msg?.key?.remoteJidAlt;

    if (
        alt?.endsWith(
            '@s.whatsapp.net'
        )
    ) {
        return normalizePhoneNumber(
            getJidNumber(alt)
        );
    }

    if (
        sender.endsWith('@lid')
    ) {
        try {
            const pn =
                await sock.signalRepository
                    ?.lidMapping
                    ?.getPNForLID(sender);

            if (pn) {
                return normalizePhoneNumber(
                    getJidNumber(pn)
                );
            }
        } catch {}
    }

    return '';
}

function getMentionedJid(msg) {
    const context =
        msg?.message
            ?.extendedTextMessage
            ?.contextInfo;

    if (
        context?.mentionedJid?.length
    ) {
        return context.mentionedJid[0];
    }

    if (
        context?.participant
    ) {
        return context.participant;
    }

    return null;
}

function getQuotedMessage(msg) {
    return (
        msg?.message
            ?.extendedTextMessage
            ?.contextInfo
            ?.quotedMessage || null
    );
}

function getQuotedParticipant(msg) {
    return (
        msg?.message
            ?.extendedTextMessage
            ?.contextInfo
            ?.participant || null
    );
}

function getTargetJid(msg) {
    return (
        getMentionedJid(msg) ||
        getQuotedParticipant(msg)
    );
}

function isAdmin(participant) {
    return (
        participant?.admin === 'admin' ||
        participant?.admin === 'superadmin'
    );
}

function getParticipant(metadata, jid) {
    if (!jid) return null;

    const normalizedTarget =
        normalizeJid(jid);

    return metadata?.participants?.find(
        participant =>
            normalizeJid(participant.id) ===
            normalizedTarget
    );
}

function findParticipant(metadata, jid) {
    if (!metadata || !jid) {
        return null;
    }

    let participant =
        getParticipant(
            metadata,
            jid
        );

    if (participant) {
        return participant;
    }

    const targetNumber =
        getJidNumber(jid);

    return metadata.participants.find(
        p => {
            if (!p?.id) {
                return false;
            }

            const number =
                getJidNumber(p.id);

            return number === targetNumber;
        }
    );
}

async function getGroupMetadata(
    sock,
    from,
    msg
) {
    if (!isGroup(from)) {
        await sock.sendMessage(
            from,
            {
                text:
                    '❌ Command ini hanya bisa digunakan di grup.'
            },
            { quoted: msg }
        );

        return null;
    }

    try {
        return await sock.groupMetadata(
            from
        );
    } catch {
        await sock.sendMessage(
            from,
            {
                text:
                    '❌ Gagal mengambil informasi grup.'
            },
            { quoted: msg }
        );

        return null;
    }
}

async function requireAdmin(
    sock,
    from,
    msg,
    metadata
) {
    const sender =
        msg?.key?.participant ||
        msg?.key?.participantAlt ||
        from;

    const participant =
        findParticipant(
            metadata,
            sender
        );

    if (!isAdmin(participant)) {
        await sock.sendMessage(
            from,
            {
                text:
                    '❌ Command ini khusus admin grup.'
            },
            { quoted: msg }
        );

        return false;
    }

    return true;
}

async function requireBotAdmin(
    sock,
    from,
    msg,
    metadata
) {
    const botId =
        sock.user?.id || '';

    const botLid =
        sock.user?.lid || '';

    const normalizedBotId =
        normalizeJid(botId);

    const normalizedBotLid =
        normalizeJid(botLid);

    const botIdNumber =
        getJidNumber(botId);

    const botLidNumber =
        getJidNumber(botLid);

    const botParticipant =
        metadata?.participants?.find(
            participant => {
                if (!participant?.id) {
                    return false;
                }

                const participantId =
                    normalizeJid(
                        participant.id
                    );

                const participantNumber =
                    getJidNumber(
                        participant.id
                    );

                return (
                    participantId ===
                        normalizedBotId ||
                    participantId ===
                        normalizedBotLid ||
                    participantNumber ===
                        botIdNumber ||
                    participantNumber ===
                        botLidNumber
                );
            }
        );

    console.log('===== DEBUG BOT ADMIN =====');
    console.log('botId:', botId);
    console.log('botLid:', botLid);
    console.log(
        'botParticipant:',
        botParticipant
    );

    if (!botParticipant) {
        await sock.sendMessage(
            from,
            {
                text:
                    '❌ Bot tidak ditemukan sebagai member grup.'
            },
            { quoted: msg }
        );

        return false;
    }

    if (!isAdmin(botParticipant)) {
        await sock.sendMessage(
            from,
            {
                text:
                    '❌ Bot harus menjadi admin grup terlebih dahulu!'
            },
            { quoted: msg }
        );

        return false;
    }

    return true;
}

function getBody(msg) {
    return (
        msg?.message?.conversation ||
        msg?.message?.extendedTextMessage?.text ||
        msg?.message?.imageMessage?.caption ||
        msg?.message?.videoMessage?.caption ||
        ''
    );
}

async function sendMenu(
    sock,
    from,
    msg
) {
    await sock.sendMessage(
        from,
        {
            text:
`╭━━━〔 🤖 BOT MENU 〕━━━╮

👤 UMUM
│ !ping
│ !menu
│ !help
│ !stats

🎨 STICKER
│ !stiker
│ !brat <teks>

👥 GROUP
│ !groupinfo
│ !listadmin
│ !tagall
│ !hidetag <teks>

╰━━━━━━━━━━━━━━━━━━━━╯

💡 Mau lihat command khusus admin?
Ketik !admin-menu`
        },
        { quoted: msg }
    );
}

async function sendAdminMenu(
    sock,
    from,
    msg
) {
    const metadata =
        await getGroupMetadata(
            sock,
            from,
            msg
        );

    if (!metadata) return;

    const admin =
        await requireAdmin(
            sock,
            from,
            msg,
            metadata
        );

    if (!admin) return;

    await sock.sendMessage(
        from,
        {
            text:
`╭━━━〔 👑 ADMIN MENU 〕━━━╮

⚠️ Command di bawah khusus admin grup.

👥 MEMBER
│ !add 628xxxxxxxxxx
│ !kick @user
│ !kick → reply pesan
│ !promote @user
│ !promote → reply pesan
│ !demote @user
│ !demote → reply pesan

📢 GROUP
│ !tagall
│ !hidetag <teks>
│ !groupinfo
│ !listadmin

👋 WELCOME
│ !welcome on
│ !welcome off
│ !setwelcome <teks>

📊 BOT
│ !stats
│ !help <command>

👑 OWNER
│ !owner list
│ !owner add <nomor>
│ !owner delete <nomor>

╰━━━━━━━━━━━━━━━━━━━━╯`
        },
        { quoted: msg }
    );
}

async function sendHelp(
    sock,
    from,
    msg,
    command
) {
    const helps = {
        ping:
            '🏓 !ping\nCek apakah bot aktif.',

        menu:
            '📋 !menu\nMenampilkan menu untuk anggota.',

        'admin-menu':
            '👑 !admin-menu\nMenampilkan command khusus admin grup.',

        stats:
            '📊 !stats\nMenampilkan statistik penggunaan bot.',

        stiker:
            '🎨 !stiker\nKirim gambar dengan caption !stiker atau reply gambar.',

        brat:
            '🎨 !brat <teks>\nMembuat stiker Brat dari teks.',

        groupinfo:
            '👥 !groupinfo\nMenampilkan informasi grup.',

        listadmin:
            '👑 !listadmin\nMenampilkan daftar admin grup.',

        tagall:
            '📢 !tagall\nMention seluruh anggota grup.',

        hidetag:
            '📢 !hidetag <teks>\nMention semua anggota tanpa menampilkan mention.',

        add:
            '➕ !add 628xxxxxxxxxx\nMenambahkan nomor ke grup.',

        kick:
            '🔨 !kick @user\nAtau reply pesan user lalu ketik !kick.',

        promote:
            '👑 !promote @user\nAtau reply pesan user lalu ketik !promote.',

        demote:
            '⬇️ !demote @user\nAtau reply pesan user lalu ketik !demote.',

        welcome:
            '👋 !welcome on/off\nMengaktifkan atau mematikan welcome otomatis.',

        setwelcome:
            '✏️ !setwelcome <teks>\nVariabel: @user dan @group.',

        owner:
            '👑 !owner list/add/delete\nKhusus super owner.'
    };

    if (!command) {
        await sock.sendMessage(
            from,
            {
                text:
`💡 *HELP*

Ketik:
!help <command>

Contoh:
!help brat
!help kick
!help welcome`
            },
            { quoted: msg }
        );

        return;
    }

    const help =
        helps[
            command.toLowerCase()
        ];

    await sock.sendMessage(
        from,
        {
            text:
                help ||
                `❌ Help untuk !${command} tidak ditemukan.`
        },
        { quoted: msg }
    );
}

async function handleWelcome(
    sock,
    update
) {
    const {
        id,
        participants,
        action
    } = update;

    if (
        action !== 'add' ||
        !participants?.length
    ) {
        return;
    }

    const config =
        readJSON(
            WELCOME_FILE,
            {
                enabled: true,
                text:
                    '👋 Selamat datang @user di *@group*!'
            }
        );

    if (!config.enabled) {
        return;
    }

    let metadata;

    try {
        metadata =
            await sock.groupMetadata(id);
    } catch {
        return;
    }

    for (
        const participant of participants
    ) {
        const number =
            getJidNumber(
                participant
            );

        const text =
            String(
                config.text
            )
                .replace(
                    /@user/g,
                    `@${number}`
                )
                .replace(
                    /@group/g,
                    metadata.subject
                );

        try {
            await sock.sendMessage(
                id,
                {
                    text,
                    mentions: [
                        participant
                    ]
                }
            );
        } catch (err) {
            console.error(
                'Welcome error:',
                err.message
            );
        }
    }
}

async function connectToWhatsApp() {
    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            'auth_baileys'
        );

    const sock =
        makeWASocket({
            auth: state,
            logger: pino({
                level: 'silent'
            }),
            printQRInTerminal: false
        });

    sock.ev.on(
        'creds.update',
        saveCreds
    );

    sock.ev.on(
        'connection.update',
        update => {
            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            if (qr) {
                qrcode.generate(
                    qr,
                    { small: true }
                );

                console.log(
                    'Scan QR Code di atas!'
                );
            }

            if (
                connection === 'close'
            ) {
                const shouldReconnect =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode !==
                    DisconnectReason.loggedOut;

                console.log(
                    'Koneksi terputus. Reconnecting...',
                    shouldReconnect
                );

                if (shouldReconnect) {
                    connectToWhatsApp();
                }
            }

            if (
                connection === 'open'
            ) {
                console.log(
                    'Bot Baileys Berhasil Terhubung! 🚀'
                );

                console.log(
                    'Owner:',
                    getOwners()
                );
            }
        }
    );

    sock.ev.on(
        'group-participants.update',
        async update => {
            try {
                await handleWelcome(
                    sock,
                    update
                );
            } catch (err) {
                console.error(
                    'Welcome handler error:',
                    err
                );
            }
        }
    );

    sock.ev.on(
        'messages.upsert',
        async ({
            messages,
            type
        }) => {
            console.log(
                '📩 EVENT MASUK:',
                type,
                messages?.length
            );

            if (type !== 'notify') {
                return;
            }

            const msg =
                messages[0];

            if (!msg?.message) {
                return;
            }

            if (msg.key.fromMe) {
                return;
            }

            const from =
                msg.key.remoteJid;

            if (!from) {
                return;
            }

            incrementMessageStats();

            const body =
                getBody(msg);

            if (
                !body.startsWith(
                    PREFIX
                )
            ) {
                return;
            }

            const senderNumber =
                await resolveSenderNumber(
                    sock,
                    msg,
                    from
                );

            if (
                !isGroup(from)
            ) {
                if (
                    !senderNumber ||
                    !isOwner(
                        senderNumber
                    )
                ) {
                    await sock.sendMessage(
                        from,
                        {
                            text:
                                'ngapain sih lo sok asik, bot cuma boleh dipake rapa 😭'
                        },
                        { quoted: msg }
                    );

                    return;
                }
            }

            const parts =
                body
                    .slice(
                        PREFIX.length
                    )
                    .trim()
                    .split(/\s+/);

            const command =
                parts
                    .shift()
                    ?.toLowerCase();

            const args =
                parts;

            if (!command) {
                return;
            }

            incrementCommandStats(
                command
            );

            logCommand(
                command,
                from,
                senderNumber
            );

            if (
                command === 'ping'
            ) {
                await sock.sendMessage(
                    from,
                    {
                        text:
                            'Pong! 🏓 Bot aktif lancar!'
                    },
                    { quoted: msg }
                );

                return;
            }

            if (
                command === 'menu'
            ) {
                await sendMenu(
                    sock,
                    from,
                    msg
                );

                return;
            }

            if (
                command ===
                'admin-menu'
            ) {
                await sendAdminMenu(
                    sock,
                    from,
                    msg
                );

                return;
            }

            if (
                command === 'help'
            ) {
                await sendHelp(
                    sock,
                    from,
                    msg,
                    args[0]
                );

                return;
            }

            if (
                command === 'stats'
            ) {
                const stats =
                    getStats();

                const started =
                    new Date(
                        stats.startedAt
                    );

                const uptime =
                    Date.now() -
                    started.getTime();

                const sorted =
                    Object.entries(
                        stats.commandUsage || {}
                    )
                        .sort(
                            (a, b) =>
                                b[1] - a[1]
                        )
                        .slice(0, 5);

                let topCommands =
                    'Belum ada';

                if (
                    sorted.length
                ) {
                    topCommands =
                        sorted
                            .map(
                                ([cmd, count], i) =>
                                    `${i + 1}. !${cmd} — ${count}x`
                            )
                            .join('\n');
                }

                await sock.sendMessage(
                    from,
                    {
                        text:
`╭━━━〔 📊 BOT STATS 〕━━━╮

⏱️ Uptime
${formatDuration(uptime)}

💬 Pesan diproses
${stats.messages}

🤖 Command
${stats.commands}

🎨 Sticker
${stats.stickers}

🖼️ Brat
${stats.brats}

🔥 TOP COMMAND

${topCommands}

╰━━━━━━━━━━━━━━━━━━━━╯`
                    },
                    { quoted: msg }
                );

                return;
            }

            if (
                command ===
                    'stiker' ||
                command ===
                    'sticker'
            ) {
                try {
                    const imageMsg =
                        msg.message.imageMessage ||
                        msg.message
                            .extendedTextMessage
                            ?.contextInfo
                            ?.quotedMessage
                            ?.imageMessage;

                    if (!imageMsg) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    'Kirim gambar dengan caption !stiker atau reply gambar.'
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                '⏳ Sedang membuat stiker...'
                        },
                        { quoted: msg }
                    );

                    const stream =
                        await downloadContentFromMessage(
                            imageMsg,
                            'image'
                        );

                    let buffer =
                        Buffer.alloc(0);

                    for await (
                        const chunk of stream
                    ) {
                        buffer =
                            Buffer.concat([
                                buffer,
                                chunk
                            ]);
                    }

                    const sticker =
                        new Sticker(
                            buffer,
                            {
                                pack:
                                    'Bot WA',
                                author:
                                    'Raffa',
                                type:
                                    StickerTypes.FULL,
                                quality:
                                    70
                            }
                        );

                    const stickerBuffer =
                        await sticker.toBuffer();

                    await sock.sendMessage(
                        from,
                        {
                            sticker:
                                stickerBuffer
                        },
                        { quoted: msg }
                    );

                    incrementStickerStats();

                } catch (err) {
                    console.error(
                        'Error Stiker:',
                        err
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                '❌ Gagal membuat stiker.'
                        },
                        { quoted: msg }
                    );
                }

                return;
            }

            if (
                command === 'brat'
            ) {
                try {
                    const text =
                        args
                            .join(' ')
                            .trim();

                    if (!text) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    'Contoh: !brat dih so ganteng tapi emang ganteng sih'
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    const cooldownKey =
                        senderNumber ||
                        msg.key.participant ||
                        from;

                    const now =
                        Date.now();

                    const last =
                        bratCooldowns.get(
                            cooldownKey
                        ) || 0;

                    if (
                        now - last <
                        BRAT_COOLDOWN
                    ) {
                        const remaining =
                            Math.ceil(
                                (
                                    BRAT_COOLDOWN -
                                    (now - last)
                                ) / 1000
                            );

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    `⏳ Tunggu ${remaining} detik.`
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    bratCooldowns.set(
                        cooldownKey,
                        now
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                '⏳ Bikin stiker Brat...'
                        },
                        { quoted: msg }
                    );

                    const outputPath =
                        `/tmp/brat-${Date.now()}-${Math.random()
                            .toString(36)
                            .slice(2)}.png`;

                    await renderBrat({
                        text,
                        out:
                            outputPath,
                        size:
                            256,
                        layout:
                            'full',
                        blur:
                            7
                    });

                    const imageBuffer =
                        fs.readFileSync(
                            outputPath
                        );

                    const sticker =
                        new Sticker(
                            imageBuffer,
                            {
                                pack:
                                    'Brat Text',
                                author:
                                    'Raffa',
                                type:
                                    StickerTypes.FULL,
                                quality:
                                    100
                            }
                        );

                    const stickerBuffer =
                        await sticker.toBuffer();

                    await sock.sendMessage(
                        from,
                        {
                            sticker:
                                stickerBuffer
                        },
                        { quoted: msg }
                    );

                    incrementBratStats();

                    if (
                        fs.existsSync(
                            outputPath
                        )
                    ) {
                        fs.unlinkSync(
                            outputPath
                        );
                    }

                } catch (err) {
                    console.error(
                        'Error Brat:',
                        err
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                `❌ Gagal membuat stiker Brat.\n\n${err.message}`
                        },
                        { quoted: msg }
                    );
                }

                return;
            }

            if (
                command === 'owner'
            ) {
                if (
                    !isSuperOwner(
                        senderNumber
                    )
                ) {
                    await sock.sendMessage(
                        from,
                        {
                            text:
                                '❌ Cuma Rapa utama yang boleh ngatur daftar owner.'
                        },
                        { quoted: msg }
                    );

                    return;
                }

                const subCommand =
                    args
                        .shift()
                        ?.toLowerCase();

                if (
                    !subCommand
                ) {
                    await sock.sendMessage(
                        from,
                        {
                            text:
`!owner list
!owner add <nomor>
!owner delete <nomor>`
                        },
                        { quoted: msg }
                    );

                    return;
                }

                if (
                    subCommand ===
                    'list'
                ) {
                    const owners =
                        getOwners();

                    let text =
                        '👑 DAFTAR OWNER\n\n';

                    let index = 1;

                    owners.forEach(
                        owner => {
                            const name =
                                typeof owner === 'object'
                                    ? owner.name
                                    : 'Owner';

                            const number =
                                typeof owner === 'object'
                                    ? owner.number
                                    : owner;

                            if (
                                name === 'Mama' ||
                                name === 'Papa'
                            ) {
                                return;
                            }

                            text +=
                                `${index}. ${name} — ${maskNumber(number)}`;

                            if (
                                normalizePhoneNumber(
                                    number
                                ) ===
                                SUPER_OWNER
                            ) {
                                text +=
                                    ' 👑';
                            }

                            text += '\n';

                            index++;
                        }
                    );

                    await sock.sendMessage(
                        from,
                        { text },
                        { quoted: msg }
                    );

                    return;
                }

                if (
                    subCommand ===
                    'add'
                ) {
                    const number =
                        normalizePhoneNumber(
                            args[0]
                        );

                    if (!number) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '❌ Contoh: !owner add 628123456789'
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    const owners =
                        getOwners();

                    const exists =
                        owners.some(
                            owner => {
                                const ownerNumber =
                                    typeof owner === 'object'
                                        ? owner.number
                                        : owner;

                                return (
                                    normalizePhoneNumber(
                                        ownerNumber
                                    ) === number
                                );
                            }
                        );

                    if (exists) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    `⚠️ ${number} sudah menjadi owner.`
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    owners.push({
                        name:
                            args
                                .slice(1)
                                .join(' ') ||
                            'Owner',
                        number
                    });

                    saveOwners(
                        owners
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                `✅ ${number} berhasil ditambahkan sebagai owner.`
                        },
                        { quoted: msg }
                    );

                    return;
                }

                if (
                    subCommand ===
                        'delete' ||
                    subCommand ===
                        'del' ||
                    subCommand ===
                        'remove'
                ) {
                    const number =
                        normalizePhoneNumber(
                            args[0]
                        );

                    if (!number) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '❌ Contoh: !owner delete 628123456789'
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    if (
                        number ===
                        SUPER_OWNER
                    ) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '❌ Super owner tidak bisa dihapus.'
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    const owners =
                        getOwners();

                    const filtered =
                        owners.filter(
                            owner => {
                                const ownerNumber =
                                    typeof owner === 'object'
                                        ? owner.number
                                        : owner;

                                return (
                                    normalizePhoneNumber(
                                        ownerNumber
                                    ) !== number
                                );
                            }
                        );

                    saveOwners(
                        filtered
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                `✅ ${number} berhasil dihapus dari owner.`
                        },
                        { quoted: msg }
                    );

                    return;
                }

                return;
            }

            if (
                command ===
                    'groupinfo' ||
                command ===
                    'listadmin'
            ) {
                const metadata =
                    await getGroupMetadata(
                        sock,
                        from,
                        msg
                    );

                if (!metadata) {
                    return;
                }

                if (
                    command ===
                    'groupinfo'
                ) {
                    const admins =
                        metadata.participants.filter(
                            isAdmin
                        );

                    await sock.sendMessage(
                        from,
                        {
                            text:
`╭━━━〔 👥 GROUP INFO 〕━━━╮

📛 Nama
${metadata.subject}

👤 Member
${metadata.participants.length}

👑 Admin
${admins.length}

╰━━━━━━━━━━━━━━━━━━━━╯`
                        },
                        { quoted: msg }
                    );

                    return;
                }

                const admins =
                    metadata.participants.filter(
                        isAdmin
                    );

                let text =
                    '👑 DAFTAR ADMIN\n\n';

                const mentions = [];

                admins.forEach(
                    (participant, index) => {
                        const jid =
                            participant.id;

                        mentions.push(
                            jid
                        );

                        const number =
                            getJidNumber(jid);

                        text +=
                            `${index + 1}. @${number}\n`;
                    }
                );

                await sock.sendMessage(
                    from,
                    {
                        text,
                        mentions
                    },
                    { quoted: msg }
                );

                return;
            }

            const adminCommands = [
                'tagall',
                'hidetag',
                'kick',
                'promote',
                'demote',
                'add',
                'welcome',
                'setwelcome'
            ];

            if (
                adminCommands.includes(
                    command
                )
            ) {
                const metadata =
                    await getGroupMetadata(
                        sock,
                        from,
                        msg
                    );

                if (!metadata) {
                    return;
                }

                const admin =
                    await requireAdmin(
                        sock,
                        from,
                        msg,
                        metadata
                    );

                if (!admin) {
                    return;
                }

                if (
                    command ===
                    'welcome'
                ) {
                    const mode =
                        args[0]
                            ?.toLowerCase();

                    const config =
                        readJSON(
                            WELCOME_FILE,
                            {
                                enabled: true,
                                text:
                                    '👋 Selamat datang @user di *@group*!'
                            }
                        );

                    if (
                        mode !== 'on' &&
                        mode !== 'off'
                    ) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
`👋 Welcome saat ini: ${
    config.enabled
        ? 'AKTIF 🟢'
        : 'NONAKTIF 🔴'
}

Gunakan:
!welcome on
!welcome off`
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    config.enabled =
                        mode === 'on';

                    writeJSON(
                        WELCOME_FILE,
                        config
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                `✅ Auto welcome ${
                                    config.enabled
                                        ? 'diaktifkan 🟢'
                                        : 'dimatikan 🔴'
                                }`
                        },
                        { quoted: msg }
                    );

                    return;
                }

                if (
                    command ===
                    'setwelcome'
                ) {
                    const text =
                        args
                            .join(' ')
                            .trim();

                    if (!text) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
`❌ Contoh:
!setwelcome Halo @user, selamat datang di @group!`
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    const config =
                        readJSON(
                            WELCOME_FILE,
                            {
                                enabled: true
                            }
                        );

                    config.text =
                        text;

                    writeJSON(
                        WELCOME_FILE,
                        config
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                '✅ Pesan welcome berhasil diubah.'
                        },
                        { quoted: msg }
                    );

                    return;
                }

                if (
                    command ===
                    'tagall'
                ) {
                    const mentions =
                        metadata.participants.map(
                            p => p.id
                        );

                    let text =
                        '📢 TAG ALL\n\n';

                    metadata.participants.forEach(
                        participant => {
                            const number =
                                getJidNumber(
                                    participant.id
                                );

                            text +=
                                `@${number}\n`;
                        }
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text,
                            mentions
                        },
                        { quoted: msg }
                    );

                    return;
                }

                if (
                    command ===
                    'hidetag'
                ) {
                    const mentions =
                        metadata.participants.map(
                            p => p.id
                        );

                    const text =
                        args.join(' ').trim() ||
                        '📢';

                    await sock.sendMessage(
                        from,
                        {
                            text,
                            mentions
                        },
                        { quoted: msg }
                    );

                    return;
                }

                const botAdmin =
                    await requireBotAdmin(
                        sock,
                        from,
                        msg,
                        metadata
                    );

                if (!botAdmin) {
                    return;
                }

                if (
                    command ===
                    'add'
                ) {
                    const number =
                        normalizePhoneNumber(
                            args[0]
                        );

                    if (!number) {
                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '❌ Contoh: !add 628123456789'
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    const jid =
                        `${number}@s.whatsapp.net`;

                    try {
                        await sock.groupParticipantsUpdate(
                            from,
                            [jid],
                            'add'
                        );

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    `✅ Berhasil mencoba menambahkan @${number}`,
                                mentions:
                                    [jid]
                            },
                            { quoted: msg }
                        );
                    } catch (err) {
                        console.error(
                            'Error Add:',
                            err
                        );

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    '❌ Gagal menambahkan user.'
                            },
                            { quoted: msg }
                        );
                    }

                    return;
                }

                const target =
                    getTargetJid(msg);

                if (!target) {
                    await sock.sendMessage(
                        from,
                        {
                            text:
                                `❌ Mention atau reply target dengan !${command}`
                        },
                        { quoted: msg }
                    );

                    return;
                }

                const targetParticipant =
                    findParticipant(
                        metadata,
                        target
                    );

                if (!targetParticipant) {
                    await sock.sendMessage(
                        from,
                        {
                            text:
                                '❌ User tidak ditemukan di grup.'
                        },
                        { quoted: msg }
                    );

                    return;
                }

                const targetJid =
                    targetParticipant.id;

                try {
                    if (
                        command ===
                        'kick'
                    ) {
                        await sock.groupParticipantsUpdate(
                            from,
                            [targetJid],
                            'remove'
                        );

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    `✅ @${getJidNumber(targetJid)} telah dikeluarkan.`,
                                mentions:
                                    [targetJid]
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    if (
                        command ===
                        'promote'
                    ) {
                        await sock.groupParticipantsUpdate(
                            from,
                            [targetJid],
                            'promote'
                        );

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    `👑 @${getJidNumber(targetJid)} sekarang menjadi admin.`,
                                mentions:
                                    [targetJid]
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                    if (
                        command ===
                        'demote'
                    ) {
                        await sock.groupParticipantsUpdate(
                            from,
                            [targetJid],
                            'demote'
                        );

                        await sock.sendMessage(
                            from,
                            {
                                text:
                                    `⬇️ @${getJidNumber(targetJid)} tidak lagi menjadi admin.`,
                                mentions:
                                    [targetJid]
                            },
                            { quoted: msg }
                        );

                        return;
                    }

                } catch (err) {
                    console.error(
                        `Error ${command}:`,
                        err
                    );

                    await sock.sendMessage(
                        from,
                        {
                            text:
                                `❌ Gagal menjalankan !${command}.`
                        },
                        { quoted: msg }
                    );
                }

                return;
            }
        }
    );
}

(async () => {
    try {
        ensureDataFiles();

        const bratModule =
            await import(
                '@ghuts/brat'
            );

        renderBrat =
            bratModule.renderBrat;

        if (!renderBrat) {
            throw new Error(
                'renderBrat tidak ditemukan.'
            );
        }

        console.log(
            'Brat generator berhasil dimuat.'
        );

        require('./web/server');

        console.log(
            '✅ Server web sudah dipanggil'
        );

        await connectToWhatsApp();

    } catch (err) {
        console.error(
            'Gagal memulai bot:',
            err
        );
    }
})();
