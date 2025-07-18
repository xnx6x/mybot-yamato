# 🚀 Quick Setup Guide - Yamato WhatsApp Bot v3.0

This guide will get your bot running in under 5 minutes!

## ⚡ Quick Start (5 Minutes)

### 1. Prerequisites
```bash
# Check Node.js version (needs 18+)
node --version

# If you don't have Node.js 18+, install it:
# Ubuntu/Debian: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs
# macOS: brew install node@18
# Windows: Download from https://nodejs.org/
```

### 2. Get Groq API Key (FREE)
1. Go to https://console.groq.com/
2. Sign up/login (it's free!)
3. Go to API Keys section
4. Create new API key
5. Copy the key (starts with `gsk_...`)

### 3. Setup Bot
```bash
# Clone or download the bot files
# Navigate to bot directory
cd yamato-whatsapp-bot

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env file with your API key
nano .env  # or use any text editor
```

### 4. Configure .env File
```bash
# Edit these in .env file:
GROQ_API_KEY=gsk_your_actual_api_key_here
PORT=3000
ADMIN_NUMBER=your_phone_number_without_plus_or_country_code
```

### 5. Start the Bot
```bash
# Option 1: Using startup script (recommended)
chmod +x start.sh
./start.sh

# Option 2: Direct start
npm start
```

### 6. Connect WhatsApp
1. QR code will appear in terminal
2. Open WhatsApp on your phone
3. Go to Settings > Linked Devices > Link a Device
4. Scan the QR code
5. Bot will connect automatically!

## 🎯 First Commands to Try

Once connected, try these:

```
/help          # See all commands
/ping          # Check if bot is working
/info          # Bot information
/reg           # Register as user
```

## 🔧 Common Issues & Quick Fixes

### ❌ "QR Code not working"
```bash
# Clear session and try again
./start.sh --clean
```

### ❌ "Bot not responding to messages"
```bash
# Check if Groq API key is correct in .env
# In groups: mention the bot or reply to its messages
# In private: bot always responds
```

### ❌ "Port already in use"
```bash
# Change port in .env file
echo "PORT=3001" >> .env
```

### ❌ "Dependencies error"
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

## 📱 Using the Bot

### In Private Chats
- Bot responds to every message
- Just type anything and bot will reply in Yamato style

### In Group Chats
Bot responds when:
- You reply to any of its messages
- You mention it with @bot
- You include "yamato" in your message
- You start with "hey yamato", "hi yamato", etc.

### Adding Stickers
1. Add `.webp` files to `stickers_webp/` folder
2. Name them descriptively (e.g., `happy.webp`, `angry.webp`)
3. Restart bot or it will auto-load them

## 🛡️ Production Tips

### For 24/7 Running
```bash
# Install PM2 for process management
npm install -g pm2
pm2 start whatsapp-bot.js --name yamato-bot
pm2 startup
pm2 save
```

### For VPS/Server
```bash
# Install screen for persistent sessions
sudo apt install screen

# Start in screen session
screen -S yamato-bot
./start.sh
# Press Ctrl+A then D to detach
# Reconnect with: screen -r yamato-bot
```

### Health Monitoring
```bash
# Check bot status
curl http://localhost:3000/health

# Or use npm scripts
npm run health
npm run status
```

## 🆘 Need Help?

1. **Check logs** - Terminal shows detailed logs with timestamps
2. **Restart bot** - `./start.sh --reset` for complete fresh start
3. **Verify setup** - `./start.sh --check` to validate configuration
4. **Check README.md** - Comprehensive troubleshooting guide

## 🎉 Success!

If you see:
```
✅ Bot connected successfully! Number: +1234567890
🎉 Bot startup sequence completed
```

Your bot is ready! 🤖

---

**⚡ Pro Tip**: Bookmark these endpoints for monitoring:
- http://localhost:3000/health (health check)
- http://localhost:3000/ (bot status)

**🔒 Security**: Never share your `.env` file or session data!