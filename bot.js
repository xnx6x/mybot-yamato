import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import * as baileys from '@whiskeysockets/baileys';
import qrcode from 'qrcode';
import fs from 'fs';
import path from 'path';
import P from 'pino';
import Groq from 'groq-sdk';
import { Sticker } from 'wa-sticker-formatter';
import chalk from 'chalk';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

// Logger
const log = msg => console.log(chalk.blue('[INFO]'), msg);
const ok = msg => console.log(chalk.green('[OK]'), msg);
const err = msg => console.error(chalk.red('[ERR]'), msg);

// Global variables
let sock;
let isConnected = false;
let retryCount = 0;
const maxRetries = 5;

// Commands system
const commandsMap = new Map();
const commandsDir = './commands';

// Create commands directory if it doesn't exist
if (!fs.existsSync(commandsDir)) {
    log('Commands folder not found, creating it...');
    fs.mkdirSync(commandsDir, { recursive: true });
    
    // Create example commands
    createExampleCommands();
}

// FIXED: Better function to check if message is a reply to bot
const isReplyToBot = (msg, sock) => {
    try {
        if (!sock.user) return false;
        
        // Check if there's a quoted message
        const contextInfo = msg.message.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return false;
        
        // Get the participant who sent the quoted message
        const quotedParticipant = contextInfo.participant;
        
        // Get bot's JID in different formats
        const botJid = sock.user.id;
        const botNumber = botJid.split(':')[0];
        const botJidFormatted = botNumber + '@s.whatsapp.net';
        
        log(`Checking reply - Quoted participant: ${quotedParticipant}, Bot JID: ${botJidFormatted}`);
        
        // Check if quoted participant matches bot
        return quotedParticipant === botJidFormatted;
    } catch (e) {
        log(`Error checking reply: ${e.message}`);
        return false;
    }
};

// FIXED: Better function to check if bot is mentioned
const isBotMentioned = (msg, sock) => {
    try {
        if (!sock.user) return false;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        const botNumber = sock.user.id.split(':')[0];
        
        // Check for @mentions
        const mentionedJids = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
        const botJidFormatted = botNumber + '@s.whatsapp.net';
        
        // Check if bot is @mentioned OR if text contains "yamato" (case insensitive)
        const isAtMentioned = mentionedJids.includes(botJidFormatted);
        const isTextMentioned = text.toLowerCase().includes('yamato');
        
        // Log for debugging
        log(`Checking mention - Text: "${text}", @mentioned: ${isAtMentioned}, text mentioned: ${isTextMentioned}`);
        
        return isAtMentioned || isTextMentioned;
    } catch (e) {
        log(`Error checking mention: ${e.message}`);
        return false;
    }
};

// FIXED: Enhanced group response logic
const shouldRespondInGroup = (msg, sock) => {
    try {
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        // Check if replying to bot (PRIORITY CHECK)
        const isReply = isReplyToBot(msg, sock);
        
        // Check @mentions and text mentions
        const isMentioned = isBotMentioned(msg, sock);
        
        // Check for greeting patterns (optional - can be disabled)
        const textLower = text.toLowerCase();
        const isGreeting = textLower.startsWith('hey yamato') || 
                          textLower.startsWith('hi yamato') ||
                          textLower.startsWith('hello yamato');
        
        log(`Group response check - Reply: ${isReply}, Mentioned: ${isMentioned}, Greeting: ${isGreeting}`);
        
        // Priority: Reply > Mention > Greeting
        return isReply || isMentioned || isGreeting;
    } catch (e) {
        log(`Error checking group response: ${e.message}`);
        return false;
    }
};

// Function to create example commands
function createExampleCommands() {
    // Help command
    const helpCommand = `export default {
    name: 'help',
    aliases: ['h', 'commands'],
    description: 'Show available commands',
    usage: '/help [command]',
    category: 'utility',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        if (args.length > 0) {
            const commandName = args[0].toLowerCase();
            const command = commandsMap.get(commandName);
            
            if (!command) {
                return await sock.sendMessage(jid, { 
                    text: \`❌ Command '\${commandName}' not found!\` 
                }, { quoted: msg });
            }
            
            const helpText = \`📖 **\${command.name}** Command

🔸 **Description:** \${command.description}
🔸 **Usage:** \${command.usage}
🔸 **Category:** \${command.category}
\${command.aliases?.length > 0 ? \`🔸 **Aliases:** \${command.aliases.join(', ')}\` : ''}\`;
            
            return await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
        }
        
        const categories = {};
        for (const [name, command] of commandsMap) {
            if (!categories[command.category]) {
                categories[command.category] = [];
            }
            categories[command.category].push(name);
        }
        
        let helpText = '📋 **Available Commands:**\\n\\n';
        for (const [category, commands] of Object.entries(categories)) {
            helpText += \`**\${category.toUpperCase()}:**\\n\`;
            helpText += commands.map(cmd => \`• /\${cmd}\`).join('\\n') + '\\n\\n';
        }
        helpText += 'Use \`/help <command>\` for detailed info about a specific command.';
        
        return await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
    }
};`;

    // Ping command
    const pingCommand = `export default {
    name: 'ping',
    aliases: ['p'],
    description: 'Check bot response time',
    usage: '/ping',
    category: 'utility',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        const start = Date.now();
        const sentMsg = await sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: msg });
        const end = Date.now();
        
        const editText = \`🏓 **Pong!**
📊 Response Time: \${end - start}ms
🤖 Bot Status: Online\`;
        
        // Edit the message if possible, otherwise send a new one
        try {
            await sock.sendMessage(jid, { 
                text: editText,
                edit: sentMsg.key 
            });
        } catch (e) {
            await sock.sendMessage(jid, { text: editText });
        }
    }
};`;

    // Info command
    const infoCommand = `export default {
    name: 'info',
    aliases: ['about', 'botinfo'],
    description: 'Show bot information',
    usage: '/info',
    category: 'utility',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        const infoText = \`🤖 **Yamato Bot Information**

👤 **Character:** Yamato from One Piece
🔥 **Personality:** Savage, rude, short replies
⚡ **Powered by:** Groq AI (Llama 3)
📱 **WhatsApp Integration:** Baileys
🎯 **Features:** 
• AI Chat responses
• Sticker support
• Dynamic commands
• User registration
• Reply detection

💻 **Developer:** Ray
🌟 **Version:** 2.1 Fixed Reply Detection\`;
        
        return await sock.sendMessage(jid, { text: infoText }, { quoted: msg });
    }
};`;

    // Stats command
    const statsCommand = `export default {
    name: 'stats',
    aliases: ['statistics'],
    description: 'Show bot statistics',
    usage: '/stats',
    category: 'utility',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        await db.read();
        const totalUsers = db.data.users.length;
        const totalCommands = commandsMap.size;
        const uptime = process.uptime();
        
        const formatUptime = (seconds) => {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            let result = '';
            if (days > 0) result += \`\${days}d \`;
            if (hours > 0) result += \`\${hours}h \`;
            if (minutes > 0) result += \`\${minutes}m \`;
            result += \`\${secs}s\`;
            
            return result;
        };
        
        const statsText = \`📊 **Bot Statistics**

👥 **Total Users:** \${totalUsers}
⚡ **Total Commands:** \${totalCommands}
🕒 **Uptime:** \${formatUptime(uptime)}
💾 **Memory Usage:** \${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
🔄 **Process ID:** \${process.pid}\`;
        
        return await sock.sendMessage(jid, { text: statsText }, { quoted: msg });
    }
};`;

    // Write example commands to files
    fs.writeFileSync(path.join(commandsDir, 'help.js'), helpCommand);
    fs.writeFileSync(path.join(commandsDir, 'ping.js'), pingCommand);
    fs.writeFileSync(path.join(commandsDir, 'info.js'), infoCommand);
    fs.writeFileSync(path.join(commandsDir, 'stats.js'), statsCommand);
    
    ok('Created example commands: help, ping, info, stats');
}

// Load commands from directory
async function loadCommands() {
    commandsMap.clear();
    
    if (!fs.existsSync(commandsDir)) {
        log('Commands directory not found');
        return;
    }
    
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        try {
            const filePath = path.join(process.cwd(), commandsDir, file);
            
            // ES modules don't have require.cache, so we use timestamp for cache busting
            const fileUrl = `file://${filePath}?t=${Date.now()}`;
            
            const command = await import(fileUrl);
            const cmd = command.default;
            
            if (!cmd.name || !cmd.execute) {
                err(`Command ${file} is missing name or execute function`);
                continue;
            }
            
            commandsMap.set(cmd.name, cmd);
            
            // Add aliases
            if (cmd.aliases) {
                for (const alias of cmd.aliases) {
                    commandsMap.set(alias, cmd);
                }
            }
            
            log(`Loaded command: ${cmd.name}${cmd.aliases ? ` (aliases: ${cmd.aliases.join(', ')})` : ''}`);
        } catch (error) {
            err(`Failed to load command ${file}: ${error.message}`);
        }
    }
    
    ok(`Loaded ${commandsMap.size} commands`);
}

// Watch for command file changes
function watchCommands() {
    if (!fs.existsSync(commandsDir)) return;
    
    fs.watch(commandsDir, { recursive: true }, (eventType, filename) => {
        if (filename && filename.endsWith('.js')) {
            log(`Command file ${filename} changed, reloading...`);
            setTimeout(() => loadCommands(), 100); // Small delay to ensure file is written
        }
    });
    
    log('Watching commands directory for changes...');
}

// HTTP server
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (_, res) => res.send('🦊 Yamato Bot running!'));
app.listen(PORT, () => ok(`HTTP server on port ${PORT}`));

// DB setup
const db = new Low(new JSONFile('./users.json'), { users: [] });
await db.read();
db.data ||= { users: [] };
await db.write();

// Stickers cache
const stickerDir = './stickers_webp/';
if (!fs.existsSync(stickerDir)) {
    log('stickers_webp folder not found, creating it...');
    fs.mkdirSync(stickerDir, { recursive: true });
}

const stickerFiles = fs.readdirSync(stickerDir).filter(f => f.endsWith('.webp'));
const stickerNames = stickerFiles.map(f => f.split('.')[0]);
const stickerCache = new Map();

if (stickerFiles.length > 0) {
    for (const file of stickerFiles) {
        try {
            const s = new Sticker(fs.readFileSync(`${stickerDir}/${file}`), { 
                pack: 'Yamato Bot', 
                author: 'Ray' 
            });
            stickerCache.set(file.split('.')[0], await s.toBuffer());
        } catch (e) {
            err(`Failed to load sticker ${file}: ${e.message}`);
        }
    }
    ok(`Loaded ${stickerCache.size} stickers`);
} else {
    log('No stickers found in stickers_webp folder');
}

let lastSticker = null;
const memoryNames = new Map();

// AI function
const askYamato = async (q, userJid) => {
    try {
        const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
        const name = memoryNames.get(userJid) || '';
        const stickerList = stickerNames.length > 0 ? stickerNames.join(', ') : 'none';
        const prompt = `You are Yamato from One Piece. You are savage, rude, give short replies, and sometimes roast people. You shout "I'm Kozuki Oden!" sometimes. ${name ? `The user's name is ${name}.` : ''} 

IMPORTANT: You must ALWAYS respond with valid JSON in this exact format:
{"reply":"your response text","sticker":"sticker_name"}

Available stickers: ${stickerList}
Choose a sticker that's different from the last one used.

User message: ${q}`;

        const c = await groq.chat.completions.create({
            model: 'llama3-8b-8192',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
        });
        
        let raw = c.choices[0].message.content.trim();
        log(`AI raw response: ${raw}`);
        
        // Remove any markdown formatting
        raw = raw.replace(/```json|```/g, '').trim();
        
        // Try to extract JSON more carefully
        let jsonMatch = raw.match(/\{[\s\S]*?\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        
        let jsonStr = jsonMatch[0];
        
        // Clean up common JSON issues
        jsonStr = jsonStr
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\n/g, ' ') // Replace newlines with spaces
            .replace(/\r/g, '') // Remove carriage returns
            .replace(/\t/g, ' ') // Replace tabs with spaces
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim();
            
        log(`Cleaned JSON: ${jsonStr}`);
        
        const json = JSON.parse(jsonStr);
        
        // Validate the JSON structure
        if (!json.reply || typeof json.reply !== 'string') {
            throw new Error('Invalid reply in JSON');
        }
        
        // Handle sticker selection
        if (stickerNames.length > 0) {
            if (!json.sticker || json.sticker === lastSticker || !stickerNames.includes(json.sticker)) {
                json.sticker = stickerNames.find(s => s !== lastSticker) || stickerNames[0];
            }
        } else {
            json.sticker = null;
        }
        
        return json;
    } catch (e) {
        err('AI error: ' + e.message);
        
        // Fallback responses
        const fallbackReplies = [
            "Huh?",
            "What do you want?",
            "I'm Kozuki Oden!",
            "Tch, whatever.",
            "You're annoying.",
            "Shut up!"
        ];
        
        return { 
            reply: fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)], 
            sticker: stickerNames.length > 0 ? stickerNames[0] : null 
        };
    }
};

// Connect function
const connectToWhatsApp = async () => {
    const authDir = './auth_info_bot';
    
    try {
        const { state, saveCreds } = await baileys.useMultiFileAuthState(authDir);
        
        sock = baileys.makeWASocket({
            logger: P({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            browser: ['Yamato Bot', 'Chrome', '1.0.0'],
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 0,
            keepAliveIntervalMs: 10000,
            qrTimeout: 60000,
            maxMsgRetryCount: 5,
            shouldReconnectOnLogout: true,
            shouldIgnoreJid: jid => baileys.isJidBroadcast(jid),
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            if (qr) {
                log('QR Code received, displaying...');
                try {
                    const qrString = await qrcode.toString(qr, { type: 'terminal', small: true });
                    console.log('\n' + qrString + '\n');
                    log('Scan this QR code with your WhatsApp mobile app within 60 seconds');
                } catch (e) {
                    err('QR code display error: ' + e.message);
                }
            }
            
            if (connection === 'open') {
                ok('Bot connected successfully!');
                isConnected = true;
                retryCount = 0;
            }
            
            if (connection === 'close') {
                isConnected = false;
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys.DisconnectReason.loggedOut;
                const reason = lastDisconnect?.error?.output?.statusCode;
                
                log(`Connection closed. Reason: ${reason}`);
                
                if (reason === baileys.DisconnectReason.badSession) {
                    log('Bad session detected, clearing auth data...');
                    if (fs.existsSync(authDir)) {
                        fs.rmSync(authDir, { recursive: true, force: true });
                    }
                    log('Auth data cleared. Restarting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (reason === baileys.DisconnectReason.connectionClosed) {
                    log('Connection was closed by WhatsApp. Reconnecting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (reason === baileys.DisconnectReason.connectionLost) {
                    log('Connection lost, reconnecting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (reason === baileys.DisconnectReason.connectionReplaced) {
                    log('Connection replaced by another session');
                    if (fs.existsSync(authDir)) {
                        fs.rmSync(authDir, { recursive: true, force: true });
                    }
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (reason === baileys.DisconnectReason.loggedOut) {
                    log('Device logged out, clearing auth data...');
                    if (fs.existsSync(authDir)) {
                        fs.rmSync(authDir, { recursive: true, force: true });
                    }
                    log('Auth data cleared. Restarting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (reason === baileys.DisconnectReason.restartRequired) {
                    log('Restart required by WhatsApp. Reconnecting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else if (reason === baileys.DisconnectReason.timedOut) {
                    log('Connection timed out, reconnecting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                } else {
                    log('Unknown disconnect reason, reconnecting...');
                    setTimeout(() => connectToWhatsApp(), 3000);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // FIXED: Messages handler with better reply detection
        sock.ev.on('messages.upsert', async ({ messages }) => {
            try {
                const msg = messages[0];
                if (!msg?.message || msg.key.fromMe) return;

                const jid = msg.key.remoteJid;
                const senderJid = msg.key.participant || jid;
                const senderNum = senderJid.split('@')[0];
                const txt = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
                if (!txt) return;

                log(`Message from ${senderNum} in ${jid.endsWith('@g.us') ? 'group' : 'private'}: ${txt}`);

                // Check for commands
                if (txt.startsWith('/')) {
                    const [commandName, ...args] = txt.slice(1).split(' ');
                    const command = commandsMap.get(commandName.toLowerCase());
                    
                    if (command) {
                        log(`Executing command: ${commandName}`);
                        try {
                            await command.execute(sock, msg, args, {
                                jid,
                                senderJid,
                                senderNum,
                                db,
                                memoryNames,
                                stickerCache,
                                commandsMap
                            });
                        } catch (error) {
                            err(`Command execution error: ${error.message}`);
                            await sock.sendMessage(jid, { 
                                text: `❌ Error executing command: ${error.message}` 
                            }, { quoted: msg });
                        }
                        return;
                    }
                }

                // Registration command (keeping original functionality)
                if (txt.toLowerCase() === '/reg') {
                    await db.read();
                    if (!db.data.users.find(u => u.jid === senderJid)) {
                        db.data.users.push({ jid: senderJid, number: senderNum, date: Date.now() });
                        await db.write();
                        await sock.sendMessage(jid, { text: `🎉 Registered, +${senderNum}` });
                    } else {
                        await sock.sendMessage(jid, { text: `✅ Already registered, +${senderNum}` });
                    }
                    return;
                }

                // Name detection
                const nameMatch = txt.match(/(?:i'm|i am|my name is|call me)\s+([a-z0-9]{2,20})/i);
                if (nameMatch) {
                    memoryNames.set(senderJid, nameMatch[1]);
                    log(`Remembered name: ${nameMatch[1]} for ${senderNum}`);
                }

                // FIXED: Better response logic
                let shouldRespond = false;
                
                if (jid.endsWith('@g.us')) {
                    // In groups: use enhanced logic
                    shouldRespond = shouldRespondInGroup(msg, sock);
                } else {
                    // In private chats: always respond
                    shouldRespond = true;
                }
                
                if (!shouldRespond) {
                    log('Not responding to this message');
                    return;
                }

                log('Responding to message...');
                
                // Get AI response
                const { reply, sticker } = await askYamato(txt, senderJid);
                
                // Send text reply
                if (reply) {
                    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
                }
                
                // Send sticker if available
                if (sticker && stickerCache.has(sticker)) {
                    await sock.sendMessage(jid, { sticker: stickerCache.get(sticker) });
                    lastSticker = sticker;
                }
            } catch (e) {
                err('Message handling error: ' + e.message);
            }
        });

    } catch (e) {
        err('Connection error: ' + e.message);
        if (retryCount < maxRetries) {
            retryCount++;
            log(`Retrying connection... (${retryCount}/${maxRetries})`);
            setTimeout(() => connectToWhatsApp(), 5000);
        } else {
            err('Max retries reached. Please restart the bot manually.');
        }
    }
};

// Start the bot
log('🚀 Starting Yamato Bot...');

// Load commands and start watching
await loadCommands();
watchCommands();

connectToWhatsApp();

// Graceful shutdown
process.on('SIGINT', () => {
    log('Shutting down bot...');
    if (sock) {
        sock.end();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('Shutting down bot...');
    if (sock) {
        sock.end();
    }
    process.exit(0);
});