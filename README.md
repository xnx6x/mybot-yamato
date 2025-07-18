# 🤖 Yamato WhatsApp Bot v3.0 Enhanced

A robust WhatsApp bot featuring Yamato from One Piece with AI integration, enhanced stability, and production-ready connection management.

## ✨ Features

### 🛡️ **Enhanced Stability**
- **Exponential Backoff Reconnection**: Smart retry logic prevents spam connections
- **Connection Health Monitoring**: Regular health checks with automatic recovery
- **QR Code Rate Limiting**: Prevents QR code spam while maintaining functionality
- **Graceful Error Handling**: Comprehensive error recovery for 10+ years reliability
- **State Management**: Advanced connection state tracking and management

### 🤖 **AI Integration**
- **Groq AI Powered**: Fast Llama 3 model integration
- **Character Personality**: Authentic Yamato responses with attitude
- **Smart JSON Parsing**: Robust AI response handling with fallbacks
- **Context Memory**: Remembers user names and preferences

### 💬 **Smart Messaging**
- **Enhanced Reply Detection**: Accurately detects replies to bot messages
- **Group Intelligence**: Responds only when mentioned or replied to in groups
- **Private Chat Support**: Always responds in private conversations
- **Command System**: Dynamic command loading with hot-reload

### 🎭 **Sticker Support**
- **Dynamic Sticker Loading**: Auto-loads WebP stickers from folder
- **Smart Selection**: Avoids repeating the same sticker consecutively
- **High Quality**: Optimized sticker processing

### 📊 **Monitoring & Health**
- **HTTP Health Endpoints**: `/health` and `/status` for monitoring
- **Detailed Statistics**: Memory usage, uptime, connection stats
- **Comprehensive Logging**: Timestamped logs with different levels
- **Admin Commands**: Restart and management commands for administrators

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- WhatsApp account
- Groq API key (free at [console.groq.com](https://console.groq.com/))

### Installation

1. **Clone and Setup**
```bash
git clone <your-repo>
cd yamato-whatsapp-bot
npm install
```

2. **Environment Configuration**
```bash
cp .env.example .env
# Edit .env with your Groq API key and settings
```

3. **Start the Bot**
```bash
npm start
```

4. **Scan QR Code**
- QR code will be displayed in terminal
- Scan with WhatsApp mobile app within 2 minutes
- Bot will automatically reconnect if disconnected

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description | Default |
|----------|----------|-------------|---------|
| `GROQ_API_KEY` | Yes | Your Groq API key | - |
| `PORT` | No | HTTP server port | 3000 |
| `ADMIN_NUMBER` | No | Admin phone number for restart command | - |
| `NODE_ENV` | No | Environment mode | production |

### Directory Structure
```
yamato-whatsapp-bot/
├── whatsapp-bot.js          # Main bot file
├── package.json             # Dependencies
├── .env                     # Environment variables
├── commands/                # Dynamic command files
│   ├── help.js
│   ├── ping.js
│   ├── info.js
│   ├── stats.js
│   └── restart.js
├── stickers_webp/          # Your sticker files (.webp)
├── auth_info_bot/          # WhatsApp session data
└── users.json              # User database
```

## 📱 Available Commands

### 🔧 **Utility Commands**
- `/help` - Show all commands
- `/ping` - Check bot status and response time
- `/info` - Bot information and features
- `/stats` - Detailed statistics
- `/reg` - Register as user

### 👨‍💼 **Admin Commands**
- `/restart` - Restart bot connection (admin only)

### 🎯 **Bot Activation (Groups)**
- Reply to any bot message
- Mention the bot with `@bot`
- Use "yamato" in your message
- Start with "hey yamato", "hi yamato", etc.

## 🛠️ Advanced Usage

### Adding Custom Commands

Create a new file in `commands/` directory:

```javascript
// commands/mycommand.js
export default {
    name: 'mycommand',
    aliases: ['mc', 'mycmd'],
    description: 'My custom command',
    usage: '/mycommand [args]',
    category: 'custom',
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db }) => {
        await sock.sendMessage(jid, { 
            text: 'Hello from custom command!' 
        }, { quoted: msg });
    }
};
```

Commands auto-reload when files change.

### Adding Stickers

1. Add `.webp` sticker files to `stickers_webp/` directory
2. Name them descriptively (e.g., `happy.webp`, `angry.webp`)
3. Bot will auto-load them on startup

### Monitoring

```bash
# Check bot health
curl http://localhost:3000/health

# Get bot status
curl http://localhost:3000/

# Monitor with scripts
npm run health
npm run status
```

## 🔍 Troubleshooting

### Common Issues

#### ❌ **QR Code Not Scanning**
```bash
# Clear auth data and restart
npm run reset
```

#### ❌ **Connection Keeps Dropping**
- Check internet stability
- Verify WhatsApp isn't logged in elsewhere
- Bot automatically retries with exponential backoff

#### ❌ **AI Not Responding**
- Verify `GROQ_API_KEY` in `.env`
- Check Groq API quota at console.groq.com
- Bot uses fallback responses if AI fails

#### ❌ **Commands Not Working**
```bash
# Reload commands
# Files auto-reload, or restart bot
npm start
```

#### ❌ **High Memory Usage**
- Bot automatically manages memory
- Restart if needed: `/restart` (admin command)

### Advanced Troubleshooting

#### **Connection State Debugging**
The bot tracks detailed connection states:
- `disconnected` - Not connected
- `connecting` - Attempting connection
- `qr_pending` - Waiting for QR scan
- `connected` - Successfully connected
- `error` - Error state

#### **Log Analysis**
- All logs include timestamps
- Different log levels: INFO, OK, WARN, ERR
- Connection attempts and retry counts logged

#### **Health Monitoring**
The bot performs automatic health checks every 30 seconds and will auto-recover from most issues.

## 🚀 Production Deployment

### Docker Deployment (Recommended)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 Deployment

```bash
npm install -g pm2
pm2 start whatsapp-bot.js --name "yamato-bot"
pm2 startup
pm2 save
```

### Environment Best Practices

- Use environment variables for all sensitive data
- Set `NODE_ENV=production` in production
- Monitor with health endpoints
- Set up log rotation
- Use reverse proxy (nginx) for HTTP endpoints

## 📊 Performance Features

### Connection Management
- **Smart Retry Logic**: Exponential backoff prevents server overload
- **Rate Limiting**: QR code and connection request rate limiting
- **Health Monitoring**: Automatic detection and recovery from connection issues
- **Session Persistence**: Maintains WhatsApp session across restarts

### Memory Management
- **Efficient Caching**: Smart sticker and command caching
- **Cleanup on Shutdown**: Proper resource cleanup
- **Memory Monitoring**: Built-in memory usage tracking

### Error Recovery
- **Automatic Reconnection**: Handles all WhatsApp disconnect scenarios
- **Fallback Responses**: AI failure doesn't break the bot
- **Graceful Degradation**: Bot continues working even with partial failures

## 🔒 Security Features

- **Admin-only Commands**: Restricted access to sensitive commands
- **Input Validation**: All user inputs properly validated
- **Error Sanitization**: Sensitive information filtered from error messages
- **Session Security**: Secure handling of WhatsApp authentication

## 📈 Monitoring & Analytics

### Built-in Endpoints
- `GET /` - Bot status and basic info
- `GET /health` - Detailed health information

### Available Metrics
- Connection status and uptime
- Memory usage and performance
- Command execution statistics
- Error rates and retry counts
- User registration count

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Create Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and support:
1. Check troubleshooting section above
2. Create GitHub issue with logs
3. Include environment details and error messages

## 🔄 Updates

### v3.0 Enhanced Features
- ✅ Production-ready stability
- ✅ Enhanced connection management
- ✅ Smart QR code handling
- ✅ Comprehensive error recovery
- ✅ Health monitoring system
- ✅ Admin commands
- ✅ Improved logging
- ✅ Memory optimization
- ✅ 10+ years reliability target

---

**Made with ❤️ by Ray** | **Powered by Groq AI & Baileys**