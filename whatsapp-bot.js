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

// Enhanced logger with timestamps
const log = msg => console.log(chalk.blue(`[${new Date().toISOString()}] [INFO]`), msg);
const ok = msg => console.log(chalk.green(`[${new Date().toISOString()}] [OK]`), msg);
const err = msg => console.error(chalk.red(`[${new Date().toISOString()}] [ERR]`), msg);
const warn = msg => console.log(chalk.yellow(`[${new Date().toISOString()}] [WARN]`), msg);

// Enhanced global variables with better state management
let sock;
let isConnected = false;
let isConnecting = false;
let retryCount = 0;
let connectionAttempts = 0;
const maxRetries = 10;
const maxConnectionAttempts = 50;
let lastQRTime = 0;
let authDir = './auth_info_bot';
let reconnectTimeout = null;
let keepAliveInterval = null;
let connectionHealthCheck = null;

// Commands system
const commandsMap = new Map();
const commandsDir = './commands';

// Enhanced connection state management
const ConnectionState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting', 
    QR_PENDING: 'qr_pending',
    AUTHENTICATED: 'authenticated',
    CONNECTED: 'connected',
    ERROR: 'error'
};

let currentState = ConnectionState.DISCONNECTED;

// Connection health monitoring
const startHealthCheck = () => {
    if (connectionHealthCheck) clearInterval(connectionHealthCheck);
    
    connectionHealthCheck = setInterval(async () => {
        if (isConnected && sock) {
            try {
                // Send a lightweight ping to check connection health
                await sock.query({
                    tag: 'iq',
                    attrs: { type: 'get', xmlns: 'jabber:iq:ping' }
                });
                log('Connection health check: OK');
            } catch (error) {
                warn('Connection health check failed, connection may be unstable');
                if (error.message.includes('Socket not open')) {
                    log('Socket closed unexpectedly, initiating reconnection...');
                    isConnected = false;
                    await handleReconnection('Socket health check failed');
                }
            }
        }
    }, 30000); // Check every 30 seconds
};

// Enhanced error handling and cleanup
const cleanup = () => {
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    if (connectionHealthCheck) {
        clearInterval(connectionHealthCheck);
        connectionHealthCheck = null;
    }
    if (sock) {
        try {
            sock.end();
        } catch (e) {
            // Ignore cleanup errors
        }
        sock = null;
    }
    isConnected = false;
    isConnecting = false;
    currentState = ConnectionState.DISCONNECTED;
};

// Enhanced reconnection logic with exponential backoff
const handleReconnection = async (reason = 'Unknown') => {
    if (isConnecting) {
        log('Already attempting to reconnect, skipping...');
        return;
    }
    
    log(`Handling reconnection. Reason: ${reason}`);
    cleanup();
    
    if (connectionAttempts >= maxConnectionAttempts) {
        err('Maximum connection attempts reached. Clearing auth and restarting...');
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
        connectionAttempts = 0;
        retryCount = 0;
    }
    
    // Exponential backoff: 3s, 6s, 12s, 24s, 48s, then 60s max
    const backoffDelay = Math.min(3000 * Math.pow(2, retryCount), 60000);
    
    if (retryCount < maxRetries) {
        retryCount++;
        connectionAttempts++;
        log(`Reconnecting in ${backoffDelay/1000}s... (attempt ${retryCount}/${maxRetries}, total: ${connectionAttempts})`);
        
        reconnectTimeout = setTimeout(() => {
            connectToWhatsApp();
        }, backoffDelay);
    } else {
        err('Max retries reached. Clearing auth data and restarting with fresh session...');
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
        retryCount = 0;
        connectionAttempts = 0;
        
        reconnectTimeout = setTimeout(() => {
            connectToWhatsApp();
        }, 10000);
    }
};

// Create commands directory if it doesn't exist
if (!fs.existsSync(commandsDir)) {
    log('Commands folder not found, creating it...');
    fs.mkdirSync(commandsDir, { recursive: true });
    createExampleCommands();
}

// ENHANCED: Better function to check if message is a reply to bot
const isReplyToBot = (msg, sock) => {
    try {
        if (!sock?.user?.id) return false;
        
        // Check if there's a quoted message
        const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
        if (!contextInfo?.quotedMessage) return false;
        
        // Get the participant who sent the quoted message
        const quotedParticipant = contextInfo.participant;
        if (!quotedParticipant) return false;
        
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

// ENHANCED: Better function to check if bot is mentioned
const isBotMentioned = (msg, sock) => {
    try {
        if (!sock?.user?.id) return false;
        
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const botNumber = sock.user.id.split(':')[0];
        
        // Check for @mentions
        const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
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

// ENHANCED: Group response logic with better error handling
const shouldRespondInGroup = (msg, sock) => {
    try {
        if (!msg?.message || !sock?.user?.id) return false;
        
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

    // Enhanced ping command with connection status
    const pingCommand = `export default {
    name: 'ping',
    aliases: ['p', 'status'],
    description: 'Check bot response time and connection status',
    usage: '/ping',
    category: 'utility',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        const start = Date.now();
        const sentMsg = await sock.sendMessage(jid, { text: '🏓 Pinging...' }, { quoted: msg });
        const end = Date.now();
        
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
        
        const editText = \`🏓 **Pong!**
📊 Response Time: \${end - start}ms
🤖 Bot Status: Online ✅
⏱️ Uptime: \${formatUptime(uptime)}
📱 Connection: Stable
🔄 Retry Count: \${retryCount}/\${maxRetries}\`;
        
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

    // Enhanced info command
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
🛡️ **Enhanced Features:** 
• Advanced AI Chat responses
• Smart reply detection
• Robust connection management
• Sticker support
• Dynamic commands
• User registration
• Health monitoring
• Auto-reconnection

💻 **Developer:** Ray
🌟 **Version:** 3.0 Enhanced Stability
🔧 **Stability:** Production Ready
📈 **Uptime Target:** 99.9%\`;
        
        return await sock.sendMessage(jid, { text: infoText }, { quoted: msg });
    }
};`;

    // Enhanced stats command
    const statsCommand = `export default {
    name: 'stats',
    aliases: ['statistics'],
    description: 'Show detailed bot statistics',
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
        
        const memUsage = process.memoryUsage();
        
        const statsText = \`📊 **Bot Statistics**

👥 **Total Users:** \${totalUsers}
⚡ **Total Commands:** \${totalCommands}
🕒 **Uptime:** \${formatUptime(uptime)}
💾 **Memory Usage:** \${Math.round(memUsage.heapUsed / 1024 / 1024)}MB
📈 **Heap Total:** \${Math.round(memUsage.heapTotal / 1024 / 1024)}MB
🔄 **Process ID:** \${process.pid}
📡 **Connection Attempts:** \${connectionAttempts}
🔁 **Current Retry Count:** \${retryCount}/\${maxRetries}
🌐 **Connection State:** \${currentState}
✅ **Connection Status:** \${isConnected ? 'Connected' : 'Disconnected'}\`;
        
        return await sock.sendMessage(jid, { text: statsText }, { quoted: msg });
    }
};`;

    // Restart command for admins
    const restartCommand = `export default {
    name: 'restart',
    aliases: ['reboot'],
    description: 'Restart the bot connection (Admin only)',
    usage: '/restart',
    category: 'admin',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        // Check if user is admin (you can modify this logic)
        const adminNumbers = [process.env.ADMIN_NUMBER || '0']; // Add admin numbers in env
        const senderNumber = senderNum;
        
        if (!adminNumbers.includes(senderNumber)) {
            return await sock.sendMessage(jid, { 
                text: '❌ This command is only available for administrators.' 
            }, { quoted: msg });
        }
        
        await sock.sendMessage(jid, { 
            text: '🔄 Restarting bot connection...' 
        }, { quoted: msg });
        
        // Trigger reconnection
        await handleReconnection('Manual restart requested');
    }
};`;

    // Write example commands to files
    fs.writeFileSync(path.join(commandsDir, 'help.js'), helpCommand);
    fs.writeFileSync(path.join(commandsDir, 'ping.js'), pingCommand);
    fs.writeFileSync(path.join(commandsDir, 'info.js'), infoCommand);
    fs.writeFileSync(path.join(commandsDir, 'stats.js'), statsCommand);
    fs.writeFileSync(path.join(commandsDir, 'restart.js'), restartCommand);
    
    ok('Created enhanced commands: help, ping, info, stats, restart');
}

// Enhanced command loader with better error handling
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
            
            // Enhanced cache busting for ES modules
            const fileUrl = `file://${filePath}?t=${Date.now()}&r=${Math.random()}`;
            
            const command = await import(fileUrl);
            const cmd = command.default;
            
            if (!cmd || !cmd.name || !cmd.execute) {
                err(`Command ${file} is missing required properties (name, execute)`);
                continue;
            }
            
            // Validate command structure
            if (typeof cmd.execute !== 'function') {
                err(`Command ${file}: execute must be a function`);
                continue;
            }
            
            commandsMap.set(cmd.name, cmd);
            
            // Add aliases with validation
            if (cmd.aliases && Array.isArray(cmd.aliases)) {
                for (const alias of cmd.aliases) {
                    if (typeof alias === 'string' && alias.length > 0) {
                        commandsMap.set(alias, cmd);
                    }
                }
            }
            
            log(`Loaded command: ${cmd.name}${cmd.aliases ? ` (aliases: ${cmd.aliases.join(', ')})` : ''}`);
        } catch (error) {
            err(`Failed to load command ${file}: ${error.message}`);
        }
    }
    
    ok(`Loaded ${commandsMap.size} commands successfully`);
}

// Enhanced command file watcher
function watchCommands() {
    if (!fs.existsSync(commandsDir)) return;
    
    try {
        fs.watch(commandsDir, { recursive: true }, (eventType, filename) => {
            if (filename && filename.endsWith('.js')) {
                log(`Command file ${filename} changed (${eventType}), reloading...`);
                setTimeout(() => {
                    loadCommands().catch(e => err(`Failed to reload commands: ${e.message}`));
                }, 500); // Increased delay for file write completion
            }
        });
        
        log('Watching commands directory for changes...');
    } catch (error) {
        warn(`Failed to start command file watcher: ${error.message}`);
    }
}

// Enhanced HTTP server with health endpoint
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => {
    res.json({
        status: 'running',
        bot: 'Yamato Bot v3.0',
        connection: isConnected ? 'connected' : 'disconnected',
        state: currentState,
        uptime: process.uptime(),
        retryCount: retryCount,
        connectionAttempts: connectionAttempts
    });
});

app.get('/health', (_, res) => {
    res.json({
        healthy: isConnected,
        state: currentState,
        lastError: null, // You can track last error here
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

app.listen(PORT, () => ok(`HTTP server running on port ${PORT}`));

// Enhanced DB setup with error handling
let db;
try {
    db = new Low(new JSONFile('./users.json'), { users: [] });
    await db.read();
    db.data ||= { users: [] };
    await db.write();
    ok('Database initialized successfully');
} catch (error) {
    err(`Database initialization failed: ${error.message}`);
    process.exit(1);
}

// Enhanced stickers cache with error handling
const stickerDir = './stickers_webp/';
if (!fs.existsSync(stickerDir)) {
    log('stickers_webp folder not found, creating it...');
    fs.mkdirSync(stickerDir, { recursive: true });
}

let stickerFiles = [];
let stickerNames = [];
const stickerCache = new Map();

try {
    stickerFiles = fs.readdirSync(stickerDir).filter(f => f.endsWith('.webp'));
    stickerNames = stickerFiles.map(f => f.split('.')[0]);

    if (stickerFiles.length > 0) {
        for (const file of stickerFiles) {
            try {
                const stickerBuffer = fs.readFileSync(`${stickerDir}/${file}`);
                const s = new Sticker(stickerBuffer, { 
                    pack: 'Yamato Bot', 
                    author: 'Ray',
                    type: 'full',
                    quality: 100
                });
                stickerCache.set(file.split('.')[0], await s.toBuffer());
            } catch (e) {
                err(`Failed to load sticker ${file}: ${e.message}`);
            }
        }
        ok(`Loaded ${stickerCache.size} stickers successfully`);
    } else {
        log('No stickers found in stickers_webp folder');
    }
} catch (error) {
    warn(`Error loading stickers: ${error.message}`);
}

let lastSticker = null;
const memoryNames = new Map();

// Enhanced AI function with better error handling and retry logic
const askYamato = async (q, userJid, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            if (!process.env.GROQ_API_KEY) {
                throw new Error('GROQ_API_KEY not configured');
            }
            
            const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
            const name = memoryNames.get(userJid) || '';
            const stickerList = stickerNames.length > 0 ? stickerNames.join(', ') : 'none';
            
            const prompt = `You are Yamato from One Piece. You are savage, rude, give short replies, and sometimes roast people. You shout "I'm Kozuki Oden!" sometimes. ${name ? `The user's name is ${name}.` : ''} 

IMPORTANT: You must ALWAYS respond with valid JSON in this exact format:
{"reply":"your response text","sticker":"sticker_name"}

Available stickers: ${stickerList}
Choose a sticker that's different from the last one used: ${lastSticker || 'none'}

User message: ${q}`;

            const completion = await groq.chat.completions.create({
                model: 'llama3-8b-8192',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 150,
                timeout: 10000 // 10 second timeout
            });
            
            let raw = completion.choices[0].message.content.trim();
            log(`AI raw response (attempt ${attempt}): ${raw}`);
            
            // Enhanced JSON extraction
            raw = raw.replace(/```json|```/g, '').trim();
            
            // Multiple JSON extraction strategies
            let jsonStr = null;
            
            // Strategy 1: Find complete JSON object
            const jsonMatch = raw.match(/\{[^{}]*"reply"[^{}]*"sticker"[^{}]*\}/);
            if (jsonMatch) {
                jsonStr = jsonMatch[0];
            } else {
                // Strategy 2: Find any JSON-like structure
                const fallbackMatch = raw.match(/\{[\s\S]*?\}/);
                if (fallbackMatch) {
                    jsonStr = fallbackMatch[0];
                }
            }
            
            if (!jsonStr) {
                throw new Error('No valid JSON structure found in AI response');
            }
            
            // Clean up JSON string
            jsonStr = jsonStr
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
                .replace(/\n/g, ' ') // Replace newlines
                .replace(/\r/g, '') // Remove carriage returns
                .replace(/\t/g, ' ') // Replace tabs
                .replace(/\s+/g, ' ') // Multiple spaces to single
                .replace(/,\s*}/g, '}') // Remove trailing commas
                .trim();
                
            log(`Cleaned JSON (attempt ${attempt}): ${jsonStr}`);
            
            const json = JSON.parse(jsonStr);
            
            // Validate response structure
            if (!json.reply || typeof json.reply !== 'string' || json.reply.trim().length === 0) {
                throw new Error('Invalid or empty reply in JSON response');
            }
            
            // Enhanced sticker selection
            if (stickerNames.length > 0) {
                if (!json.sticker || 
                    json.sticker === lastSticker || 
                    !stickerNames.includes(json.sticker)) {
                    // Find a different sticker from the last one used
                    const availableStickers = stickerNames.filter(s => s !== lastSticker);
                    json.sticker = availableStickers.length > 0 ? 
                        availableStickers[Math.floor(Math.random() * availableStickers.length)] : 
                        stickerNames[0];
                }
            } else {
                json.sticker = null;
            }
            
            return json;
            
        } catch (e) {
            err(`AI error (attempt ${attempt}/${maxRetries}): ${e.message}`);
            
            if (attempt === maxRetries) {
                // Final fallback with random responses
                const fallbackReplies = [
                    "Huh? What do you want?",
                    "I'm Kozuki Oden! Deal with it!",
                    "Tch, whatever...",
                    "You're annoying me.",
                    "Shut up and leave me alone!",
                    "What's your problem?",
                    "I don't have time for this.",
                    "Are you stupid or something?"
                ];
                
                return { 
                    reply: fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)], 
                    sticker: stickerNames.length > 0 ? 
                        stickerNames[Math.floor(Math.random() * stickerNames.length)] : null 
                };
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
    }
};

// Enhanced connection function with improved stability
const connectToWhatsApp = async () => {
    if (isConnecting) {
        log('Connection already in progress, skipping...');
        return;
    }
    
    isConnecting = true;
    currentState = ConnectionState.CONNECTING;
    
    try {
        log('Starting WhatsApp connection...');
        
        // Enhanced auth state with better error handling
        const { state, saveCreds } = await baileys.useMultiFileAuthState(authDir);
        
        // Enhanced socket configuration
        sock = baileys.makeWASocket({
            logger: P({ level: 'silent' }),
            auth: state,
            printQRInTerminal: false,
            browser: ['Yamato Bot', 'Chrome', '122.0.0.0'],
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            qrTimeout: 120000, // 2 minutes for QR
            maxMsgRetryCount: 3,
            msgRetryCounterCache: new Map(),
            shouldReconnectOnLogout: false, // We handle this manually
            shouldIgnoreJid: jid => baileys.isJidBroadcast(jid),
            getMessage: async (key) => {
                return { conversation: '' };
            },
            // Enhanced message retry configuration
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            // Improved connection options
            options: {
                phoneNumber: undefined // Let it use QR code
            }
        });

        // Enhanced connection event handler
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr, isNewLogin } = update;
            
            if (qr) {
                currentState = ConnectionState.QR_PENDING;
                const currentTime = Date.now();
                
                // Prevent QR spam - only show new QR if enough time has passed
                if (currentTime - lastQRTime > 10000) { // 10 seconds minimum between QR codes
                    lastQRTime = currentTime;
                    log('New QR Code received, displaying...');
                    
                    try {
                        const qrString = await qrcode.toString(qr, { 
                            type: 'terminal', 
                            small: true,
                            errorCorrectionLevel: 'M'
                        });
                        console.log('\n' + '='.repeat(50));
                        console.log('📱 SCAN THIS QR CODE WITH WHATSAPP');
                        console.log('='.repeat(50));
                        console.log(qrString);
                        console.log('='.repeat(50));
                        console.log('⏰ QR Code expires in 2 minutes');
                        console.log('🔄 Scanning will auto-refresh if needed');
                        console.log('='.repeat(50) + '\n');
                    } catch (e) {
                        err('QR code display error: ' + e.message);
                    }
                } else {
                    log('QR Code received but rate limited (preventing spam)');
                }
            }
            
            if (connection === 'open') {
                currentState = ConnectionState.CONNECTED;
                isConnected = true;
                isConnecting = false;
                retryCount = 0;
                
                ok(`🎉 Bot connected successfully! Number: ${sock.user.id}`);
                
                if (isNewLogin) {
                    log('New login detected - connection is fresh');
                }
                
                // Start health monitoring
                startHealthCheck();
                
                // Set presence to available
                try {
                    await sock.sendPresenceUpdate('available');
                } catch (e) {
                    warn('Failed to set presence: ' + e.message);
                }
            }
            
            if (connection === 'close') {
                isConnected = false;
                isConnecting = false;
                currentState = ConnectionState.DISCONNECTED;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = Object.keys(baileys.DisconnectReason).find(
                    key => baileys.DisconnectReason[key] === statusCode
                ) || 'Unknown';
                
                log(`Connection closed. Reason: ${reason} (${statusCode})`);
                
                // Enhanced disconnect handling
                switch (statusCode) {
                    case baileys.DisconnectReason.badSession:
                        warn('Bad session detected, clearing auth data...');
                        if (fs.existsSync(authDir)) {
                            fs.rmSync(authDir, { recursive: true, force: true });
                        }
                        await handleReconnection('Bad session');
                        break;
                        
                    case baileys.DisconnectReason.connectionClosed:
                        log('Connection closed by WhatsApp');
                        await handleReconnection('Connection closed');
                        break;
                        
                    case baileys.DisconnectReason.connectionLost:
                        log('Connection lost');
                        await handleReconnection('Connection lost');
                        break;
                        
                    case baileys.DisconnectReason.connectionReplaced:
                        warn('Connection replaced by another session');
                        if (fs.existsSync(authDir)) {
                            fs.rmSync(authDir, { recursive: true, force: true });
                        }
                        await handleReconnection('Connection replaced');
                        break;
                        
                    case baileys.DisconnectReason.loggedOut:
                        warn('Device logged out, clearing auth data...');
                        if (fs.existsSync(authDir)) {
                            fs.rmSync(authDir, { recursive: true, force: true });
                        }
                        await handleReconnection('Logged out');
                        break;
                        
                    case baileys.DisconnectReason.restartRequired:
                        log('Restart required by WhatsApp');
                        await handleReconnection('Restart required');
                        break;
                        
                    case baileys.DisconnectReason.timedOut:
                        log('Connection timed out');
                        await handleReconnection('Timed out');
                        break;
                        
                    case baileys.DisconnectReason.forbidden:
                        err('Connection forbidden - possible ban or rate limit');
                        await handleReconnection('Forbidden');
                        break;
                        
                    default:
                        log(`Unknown disconnect reason: ${reason}`);
                        await handleReconnection(`Unknown: ${reason}`);
                        break;
                }
            }
            
            if (connection === 'connecting') {
                currentState = ConnectionState.CONNECTING;
                log('Connecting to WhatsApp...');
            }
        });

        // Enhanced credentials update handler
        sock.ev.on('creds.update', async (creds) => {
            try {
                await saveCreds();
                log('Credentials updated and saved');
            } catch (error) {
                err('Failed to save credentials: ' + error.message);
            }
        });

        // ENHANCED: Messages handler with better error handling and retry logic
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            for (const msg of messages) {
                try {
                    // Skip invalid messages
                    if (!msg?.message || msg.key.fromMe) continue;

                    const jid = msg.key.remoteJid;
                    const senderJid = msg.key.participant || jid;
                    const senderNum = senderJid.split('@')[0];
                    const txt = msg.message.conversation || 
                               msg.message.extendedTextMessage?.text || 
                               msg.message.imageMessage?.caption ||
                               msg.message.videoMessage?.caption || '';
                    
                    if (!txt || txt.trim().length === 0) continue;

                    log(`📨 Message from ${senderNum} in ${jid.endsWith('@g.us') ? 'group' : 'private'}: ${txt.substring(0, 100)}${txt.length > 100 ? '...' : ''}`);

                    // Enhanced command handling with error recovery
                    if (txt.startsWith('/')) {
                        const [commandName, ...args] = txt.slice(1).split(' ');
                        const command = commandsMap.get(commandName.toLowerCase());
                        
                        if (command) {
                            log(`⚡ Executing command: ${commandName}`);
                            try {
                                await command.execute(sock, msg, args, {
                                    jid,
                                    senderJid,
                                    senderNum,
                                    db,
                                    memoryNames,
                                    stickerCache,
                                    commandsMap,
                                    retryCount,
                                    connectionAttempts,
                                    currentState
                                });
                            } catch (error) {
                                err(`Command execution error for ${commandName}: ${error.message}`);
                                try {
                                    await sock.sendMessage(jid, { 
                                        text: `❌ Error executing command: ${error.message.substring(0, 100)}` 
                                    }, { quoted: msg });
                                } catch (sendError) {
                                    err(`Failed to send error message: ${sendError.message}`);
                                }
                            }
                            continue;
                        }
                    }

                    // Enhanced registration command
                    if (txt.toLowerCase() === '/reg') {
                        try {
                            await db.read();
                            const existingUser = db.data.users.find(u => u.jid === senderJid);
                            
                            if (!existingUser) {
                                db.data.users.push({ 
                                    jid: senderJid, 
                                    number: senderNum, 
                                    date: Date.now(),
                                    lastSeen: Date.now()
                                });
                                await db.write();
                                await sock.sendMessage(jid, { 
                                    text: `🎉 Successfully registered! Welcome, +${senderNum}` 
                                }, { quoted: msg });
                            } else {
                                // Update last seen for existing user
                                existingUser.lastSeen = Date.now();
                                await db.write();
                                await sock.sendMessage(jid, { 
                                    text: `✅ Already registered, +${senderNum}. Welcome back!` 
                                }, { quoted: msg });
                            }
                        } catch (error) {
                            err(`Registration error: ${error.message}`);
                            await sock.sendMessage(jid, { 
                                text: `❌ Registration failed. Please try again later.` 
                            }, { quoted: msg });
                        }
                        continue;
                    }

                    // Enhanced name detection with validation
                    const nameMatch = txt.match(/(?:i'm|i am|my name is|call me)\s+([a-zA-Z0-9_]{2,20})/i);
                    if (nameMatch) {
                        const name = nameMatch[1].trim();
                        if (name.length >= 2 && name.length <= 20) {
                            memoryNames.set(senderJid, name);
                            log(`💭 Remembered name: ${name} for ${senderNum}`);
                        }
                    }

                    // ENHANCED: Better response logic with error handling
                    let shouldRespond = false;
                    
                    try {
                        if (jid.endsWith('@g.us')) {
                            // In groups: use enhanced logic
                            shouldRespond = shouldRespondInGroup(msg, sock);
                        } else {
                            // In private chats: always respond
                            shouldRespond = true;
                        }
                    } catch (error) {
                        err(`Error determining response logic: ${error.message}`);
                        shouldRespond = !jid.endsWith('@g.us'); // Fallback: respond in private only
                    }
                    
                    if (!shouldRespond) {
                        log('🤐 Not responding to this message');
                        continue;
                    }

                    log('🤖 Generating AI response...');
                    
                    // Get AI response with retry logic
                    const aiResponse = await askYamato(txt, senderJid);
                    
                    if (!aiResponse || !aiResponse.reply) {
                        warn('AI returned invalid response, skipping...');
                        continue;
                    }
                    
                    // Send text reply with error handling
                    try {
                        await sock.sendMessage(jid, { 
                            text: aiResponse.reply 
                        }, { quoted: msg });
                        
                        log(`💬 Sent reply: ${aiResponse.reply.substring(0, 50)}${aiResponse.reply.length > 50 ? '...' : ''}`);
                    } catch (error) {
                        err(`Failed to send text reply: ${error.message}`);
                        continue; // Skip sticker if text failed
                    }
                    
                    // Send sticker with error handling
                    if (aiResponse.sticker && stickerCache.has(aiResponse.sticker)) {
                        try {
                            await sock.sendMessage(jid, { 
                                sticker: stickerCache.get(aiResponse.sticker) 
                            });
                            lastSticker = aiResponse.sticker;
                            log(`🎭 Sent sticker: ${aiResponse.sticker}`);
                        } catch (error) {
                            warn(`Failed to send sticker: ${error.message}`);
                        }
                    }
                    
                } catch (error) {
                    err(`Message processing error: ${error.message}`);
                    // Continue processing other messages even if one fails
                }
            }
        });

        // Enhanced error event handler
        sock.ev.on('CB:call', (data) => {
            log('Incoming call detected, auto-rejecting...');
            // Auto-reject calls to prevent issues
        });

        // Connection timeout handler
        setTimeout(() => {
            if (isConnecting && !isConnected) {
                warn('Connection timeout reached, forcing reconnection...');
                handleReconnection('Connection timeout');
            }
        }, 90000); // 90 seconds timeout

    } catch (error) {
        err('Connection initialization error: ' + error.message);
        isConnecting = false;
        currentState = ConnectionState.ERROR;
        await handleReconnection('Initialization error');
    }
};

// Graceful shutdown with proper cleanup
const gracefulShutdown = (signal) => {
    log(`Received ${signal}, initiating graceful shutdown...`);
    
    cleanup();
    
    // Close database
    if (db) {
        try {
            db.write();
        } catch (e) {
            // Ignore write errors during shutdown
        }
    }
    
    log('Bot shutdown complete');
    process.exit(0);
};

// Enhanced startup sequence
const startBot = async () => {
    try {
        log('🚀 Starting Yamato Bot v3.0 Enhanced...');
        
        // Validate environment
        if (!process.env.GROQ_API_KEY) {
            warn('GROQ_API_KEY not set - AI features will use fallback responses');
        }
        
        // Load commands
        await loadCommands();
        
        // Start watching commands
        watchCommands();
        
        // Start connection
        await connectToWhatsApp();
        
        ok('✅ Bot startup sequence completed');
        
    } catch (error) {
        err('Startup error: ' + error.message);
        process.exit(1);
    }
};

// Signal handlers for graceful shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Unhandled error handlers
process.on('uncaughtException', (error) => {
    err('Uncaught Exception: ' + error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    err('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the bot
startBot();