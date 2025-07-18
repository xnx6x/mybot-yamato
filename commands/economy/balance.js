export default {
    name: 'balance',
    aliases: ['bal', 'money', 'cash', 'wallet'],
    description: 'Check your current balance and financial status',
    usage: '/balance [@user]',
    category: 'economy',
    
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db, memoryNames }) => {
        try {
            // Initialize economy database
            await db.read();
            if (!db.data.economy) db.data.economy = {};
            if (!db.data.profiles) db.data.profiles = {};

            // Determine target user
            let targetJid = senderJid;
            let targetNum = senderNum;
            
            if (args.length > 0 && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                targetNum = targetJid.split('@')[0];
            }

            const userName = memoryNames?.get(targetJid) || `User${targetNum.slice(-4)}`;
            const isOwnBalance = targetJid === senderJid;

            // Get or create user economy data
            let userEconomy = db.data.economy[targetJid];
            if (!userEconomy) {
                userEconomy = {
                    wallet: isOwnBalance ? 1000 : 0, // Starting bonus for new users
                    bank: 0,
                    networth: isOwnBalance ? 1000 : 0,
                    lastDaily: 0,
                    lastWeekly: 0,
                    lastMonthly: 0,
                    totalEarned: isOwnBalance ? 1000 : 0,
                    totalSpent: 0,
                    bankSpace: 10000 // Default bank capacity
                };
                db.data.economy[targetJid] = userEconomy;
                await db.write();
            }

            // Update networth
            userEconomy.networth = userEconomy.wallet + userEconomy.bank;

            // Stylish text utilities
            const styleText = (text, style = 'normal') => {
                const styles = {
                    bold: t => `*${t}*`,
                    italic: t => `_${t}_`,
                    mono: t => `\`${t}\``,
                    fancy: t => {
                        const chars = {
                            'A': '𝒜', 'B': '𝐵', 'C': '𝒞', 'D': '𝒟', 'E': '𝐸', 'F': '𝐹', 'G': '𝒢', 'H': '𝐻',
                            'I': '𝐼', 'J': '𝒥', 'K': '𝒦', 'L': '𝐿', 'M': '𝑀', 'N': '𝒩', 'O': '𝒪', 'P': '𝒫',
                            'Q': '𝒬', 'R': '𝑅', 'S': '𝒮', 'T': '𝒯', 'U': '𝒰', 'V': '𝒱', 'W': '𝒲', 'X': '𝒳',
                            'Y': '𝒴', 'Z': '𝒵', 'a': '𝒶', 'b': '𝒷', 'c': '𝒸', 'd': '𝒹', 'e': '𝑒', 'f': '𝒻',
                            'g': '𝑔', 'h': '𝒽', 'i': '𝒾', 'j': '𝒿', 'k': '𝓀', 'l': '𝓁', 'm': '𝓂', 'n': '𝓃',
                            'o': '𝑜', 'p': '𝓅', 'q': '𝓆', 'r': '𝓇', 's': '𝓈', 't': '𝓉', 'u': '𝓊', 'v': '𝓋',
                            'w': '𝓌', 'x': '𝓍', 'y': '𝓎', 'z': '𝓏'
                        };
                        return t.split('').map(c => chars[c] || c).join('');
                    }
                };
                return styles[style] ? styles[style](text) : text;
            };

            const createBox = (title, content) => {
                const lines = content.split('\n');
                const maxWidth = Math.max(title.length + 4, ...lines.map(l => l.length + 4));
                const border = '─'.repeat(maxWidth);
                
                return [
                    `┌${border}┐`,
                    `│ ${title.padEnd(maxWidth - 2)} │`,
                    `├${border}┤`,
                    ...lines.map(line => `│ ${line.padEnd(maxWidth - 2)} │`),
                    `└${border}┘`
                ].join('\n');
            };

            // Format money with commas and abbreviations
            const formatMoney = (amount) => {
                if (amount >= 1000000000) return `$${(amount / 1000000000).toFixed(2)}B`;
                if (amount >= 1000000) return `$${(amount / 1000000).toFixed(2)}M`;
                if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
                return `$${amount.toLocaleString()}`;
            };

            // Get wealth rank
            const getWealthRank = (networth) => {
                if (networth >= 100000000) return { rank: '👑 Trillionaire', color: '🟣' };
                if (networth >= 10000000) return { rank: '💎 Billionaire', color: '🔵' };
                if (networth >= 1000000) return { rank: '💰 Millionaire', color: '🟡' };
                if (networth >= 100000) return { rank: '💳 Rich', color: '🟢' };
                if (networth >= 10000) return { rank: '💵 Wealthy', color: '🟠' };
                if (networth >= 1000) return { rank: '🏦 Middle Class', color: '⚪' };
                return { rank: '🥉 Beginner', color: '🟤' };
            };

            const wealthInfo = getWealthRank(userEconomy.networth);

            // Check daily status
            const now = Date.now();
            const dailyReady = now - userEconomy.lastDaily >= 24 * 60 * 60 * 1000;
            const weeklyReady = now - userEconomy.lastWeekly >= 7 * 24 * 60 * 60 * 1000;
            const monthlyReady = now - userEconomy.lastMonthly >= 30 * 24 * 60 * 60 * 1000;

            // Calculate bank usage percentage
            const bankUsage = (userEconomy.bank / userEconomy.bankSpace) * 100;
            const bankBar = '█'.repeat(Math.floor(bankUsage / 10)) + '░'.repeat(10 - Math.floor(bankUsage / 10));

            const balanceText = `💰 ${styleText(userName, 'fancy')} ${isOwnBalance ? styleText('- Your Wallet', 'italic') : styleText('- Balance View', 'italic')}

${createBox('💳 CURRENT BALANCE', 
    `${styleText('Wallet:', 'bold')} ${formatMoney(userEconomy.wallet)} 💵\n` +
    `${styleText('Bank:', 'bold')} ${formatMoney(userEconomy.bank)} 🏦\n` +
    `${styleText('Bank Space:', 'bold')} ${bankBar} ${Math.floor(bankUsage)}%\n` +
    `${styleText('Net Worth:', 'bold')} ${formatMoney(userEconomy.networth)} 💎\n` +
    `${styleText('Wealth Rank:', 'bold')} ${wealthInfo.color} ${wealthInfo.rank}`
)}

${createBox('📊 FINANCIAL OVERVIEW',
    `${styleText('Total Earned:', 'bold')} ${formatMoney(userEconomy.totalEarned)} 📈\n` +
    `${styleText('Total Spent:', 'bold')} ${formatMoney(userEconomy.totalSpent)} 📉\n` +
    `${styleText('Profit/Loss:', 'bold')} ${formatMoney(userEconomy.totalEarned - userEconomy.totalSpent)} ${userEconomy.totalEarned >= userEconomy.totalSpent ? '📈' : '📉'}\n` +
    `${styleText('Bank Capacity:', 'bold')} ${formatMoney(userEconomy.bankSpace)} 🏪`
)}

${isOwnBalance ? createBox('🎁 DAILY REWARDS STATUS',
    `${styleText('Daily Bonus:', 'bold')} ${dailyReady ? '✅ Ready!' : '❌ ' + Math.ceil((24 * 60 * 60 * 1000 - (now - userEconomy.lastDaily)) / (60 * 60 * 1000)) + 'h left'}\n` +
    `${styleText('Weekly Bonus:', 'bold')} ${weeklyReady ? '✅ Ready!' : '❌ ' + Math.ceil((7 * 24 * 60 * 60 * 1000 - (now - userEconomy.lastWeekly)) / (24 * 60 * 60 * 1000)) + 'd left'}\n` +
    `${styleText('Monthly Bonus:', 'bold')} ${monthlyReady ? '✅ Ready!' : '❌ ' + Math.ceil((30 * 24 * 60 * 60 * 1000 - (now - userEconomy.lastMonthly)) / (24 * 60 * 60 * 1000)) + 'd left'}`
) : ''}

${styleText('💡 MONEY MAKING TIPS:', 'bold')}
${isOwnBalance ? 
    `• ${styleText('/daily', 'mono')} - Claim daily rewards (${dailyReady ? 'Ready!' : 'Not ready'})\n` +
    `• ${styleText('/work', 'mono')} - Work for steady income\n` +
    `• ${styleText('/crime', 'mono')} - Risky but rewarding\n` +
    `• ${styleText('/hunt', 'mono')} - Hunt animals for money\n` +
    `• ${styleText('/fish', 'mono')} - Fishing for profits\n` +
    `• ${styleText('/mine', 'mono')} - Mine valuable resources\n` +
    `• ${styleText('/slots', 'mono')} - Try your luck at gambling\n` +
    `• ${styleText('/rob @user', 'mono')} - Rob other users (risky!)`
    :
    `• This user has ${wealthInfo.rank} status\n` +
    `• Use ${styleText('/send @user [amount]', 'mono')} to send money\n` +
    `• Use ${styleText('/rob @user', 'mono')} to attempt robbery`
}

${styleText('🏦 BANKING ACTIONS:', 'bold')}
${isOwnBalance ?
    `• ${styleText('/deposit [amount]', 'mono')} - Deposit to bank\n` +
    `• ${styleText('/withdraw [amount]', 'mono')} - Withdraw from bank\n` +
    `• ${styleText('/bank', 'mono')} - Detailed banking info`
    :
    `• View their detailed banking with ${styleText('/bank @user', 'mono')}`
}

${styleText('📍 Viewing:', 'bold')} ${isOwnBalance ? 'Your Balance' : `${userName}'s Balance`}
${styleText('💳 Quick Commands:', 'italic')} ${styleText('/work', 'mono')} | ${styleText('/daily', 'mono')} | ${styleText('/slots', 'mono')} | ${styleText('/shop', 'mono')}`;

            await sock.sendMessage(jid, { text: balanceText }, { quoted: msg });
            await db.write();

        } catch (error) {
            console.error('Balance command error:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Balance temporarily unavailable. Please try again later!' 
            }, { quoted: msg });
        }
    }
};