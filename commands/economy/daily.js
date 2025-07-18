export default {
    name: 'daily',
    aliases: ['dailyreward', 'bonus', 'claim'],
    description: 'Claim your daily rewards and build streaks for bigger bonuses!',
    usage: '/daily',
    category: 'economy',
    
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db, memoryNames }) => {
        try {
            // Initialize economy database
            await db.read();
            if (!db.data.economy) db.data.economy = {};
            if (!db.data.profiles) db.data.profiles = {};

            const userName = memoryNames?.get(senderJid) || `User${senderNum.slice(-4)}`;

            // Get or create user economy data
            let userEconomy = db.data.economy[senderJid];
            if (!userEconomy) {
                userEconomy = {
                    wallet: 1000,
                    bank: 0,
                    networth: 1000,
                    lastDaily: 0,
                    lastWeekly: 0,
                    lastMonthly: 0,
                    dailyStreak: 0,
                    totalEarned: 1000,
                    totalSpent: 0,
                    dailyClaims: 0
                };
                db.data.economy[senderJid] = userEconomy;
            }

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
                            'Y': '𝒴', 'Z': '𝒵'
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

            // Check if daily is available
            const now = Date.now();
            const timeSinceLastDaily = now - userEconomy.lastDaily;
            const oneDayMs = 24 * 60 * 60 * 1000;
            const twoDaysMs = 48 * 60 * 60 * 1000;

            if (timeSinceLastDaily < oneDayMs) {
                const timeLeft = oneDayMs - timeSinceLastDaily;
                const hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
                
                const cooldownText = `🎁 ${styleText('DAILY REWARDS', 'fancy')}

${createBox('⏰ COOLDOWN ACTIVE', 
    `${styleText('Time Remaining:', 'bold')} ${hoursLeft} hours\n` +
    `${styleText('Next Claim:', 'bold')} ${new Date(userEconomy.lastDaily + oneDayMs).toLocaleString()}\n` +
    `${styleText('Current Streak:', 'bold')} ${userEconomy.dailyStreak} days 🔥`
)}

${styleText('💡 WHILE YOU WAIT:', 'bold')}
• ${styleText('/work', 'mono')} - Work for money
• ${styleText('/hunt', 'mono')} - Hunt for rewards
• ${styleText('/fish', 'mono')} - Go fishing
• ${styleText('/mine', 'mono')} - Mine resources
• ${styleText('/slots', 'mono')} - Try your luck

${styleText('⚡ STREAK REWARDS:', 'bold')}
🔥 3 days: +50% bonus
🔥 7 days: +100% bonus
🔥 15 days: +200% bonus
🔥 30 days: +500% bonus`;

                await sock.sendMessage(jid, { text: cooldownText }, { quoted: msg });
                return;
            }

            // Calculate streak
            let newStreak = userEconomy.dailyStreak;
            if (timeSinceLastDaily > twoDaysMs) {
                // Streak broken if more than 2 days
                newStreak = 1;
            } else {
                // Continue or start streak
                newStreak += 1;
            }

            // Calculate rewards based on streak
            const baseReward = 500;
            let streakMultiplier = 1;
            let streakBonus = 0;
            let streakTitle = '';

            if (newStreak >= 30) {
                streakMultiplier = 6;
                streakTitle = '👑 LEGENDARY STREAK!';
            } else if (newStreak >= 15) {
                streakMultiplier = 3;
                streakTitle = '💎 DIAMOND STREAK!';
            } else if (newStreak >= 7) {
                streakMultiplier = 2;
                streakTitle = '🔥 FIRE STREAK!';
            } else if (newStreak >= 3) {
                streakMultiplier = 1.5;
                streakTitle = '⭐ BUILDING STREAK!';
            } else {
                streakTitle = '🎯 DAILY CLAIM';
            }

            const totalReward = Math.floor(baseReward * streakMultiplier);
            streakBonus = totalReward - baseReward;

            // Random bonus items (sometimes)
            const bonusItems = [];
            if (Math.random() < 0.3) { // 30% chance
                const items = [
                    { name: 'Energy Drink', value: 100, emoji: '⚡' },
                    { name: 'Lucky Coin', value: 250, emoji: '🪙' },
                    { name: 'Small Gem', value: 500, emoji: '💎' },
                    { name: 'Golden Ticket', value: 1000, emoji: '🎫' }
                ];
                const randomItem = items[Math.floor(Math.random() * items.length)];
                bonusItems.push(randomItem);
            }

            const bonusValue = bonusItems.reduce((sum, item) => sum + item.value, 0);
            const finalReward = totalReward + bonusValue;

            // Update user data
            userEconomy.wallet += finalReward;
            userEconomy.totalEarned += finalReward;
            userEconomy.lastDaily = now;
            userEconomy.dailyStreak = newStreak;
            userEconomy.dailyClaims += 1;

            // Achievement messages for milestones
            let achievementMsg = '';
            if (newStreak === 7) {
                achievementMsg = '\n🏆 Achievement Unlocked: Week Warrior!';
            } else if (newStreak === 30) {
                achievementMsg = '\n🏆 Achievement Unlocked: Monthly Master!';
            } else if (newStreak === 100) {
                achievementMsg = '\n🏆 Achievement Unlocked: Century Champion!';
            }

            const rewardText = `🎁 ${styleText('DAILY REWARDS CLAIMED!', 'fancy')}

${createBox(streakTitle,
    `${styleText('Base Reward:', 'bold')} $${baseReward} 💰\n` +
    `${streakBonus > 0 ? `${styleText('Streak Bonus:', 'bold')} +$${streakBonus} 🔥\n` : ''}` +
    `${bonusItems.length > 0 ? `${styleText('Bonus Items:', 'bold')} ${bonusItems.map(item => `${item.emoji} ${item.name} (+$${item.value})`).join(', ')}\n` : ''}` +
    `${styleText('Total Earned:', 'bold')} $${finalReward} ✨\n` +
    `${styleText('Current Streak:', 'bold')} ${newStreak} days 🎯`
)}

${createBox('💳 UPDATED BALANCE',
    `${styleText('New Wallet:', 'bold')} $${userEconomy.wallet}\n` +
    `${styleText('Total Claims:', 'bold')} ${userEconomy.dailyClaims}\n` +
    `${styleText('Lifetime Earned:', 'bold')} $${userEconomy.totalEarned}`
)}

${styleText('🔥 STREAK MILESTONES:', 'bold')}
${newStreak >= 3 ? '✅' : '❌'} 3 days - 50% bonus
${newStreak >= 7 ? '✅' : '❌'} 7 days - 100% bonus
${newStreak >= 15 ? '✅' : '❌'} 15 days - 200% bonus
${newStreak >= 30 ? '✅' : '❌'} 30 days - 500% bonus

${styleText('💡 KEEP THE STREAK ALIVE!', 'bold')}
Come back within 24 hours to maintain your streak!
Next claim available: ${styleText(new Date(now + oneDayMs).toLocaleString(), 'mono')}

${styleText('🎮 MORE REWARDS:', 'bold')}
• ${styleText('/weekly', 'mono')} - Weekly bonus
• ${styleText('/monthly', 'mono')} - Monthly bonus
• ${styleText('/work', 'mono')} - Work for more money${achievementMsg}`;

            await sock.sendMessage(jid, { text: rewardText }, { quoted: msg });
            await db.write();

        } catch (error) {
            console.error('Daily command error:', error);
            await sock.sendMessage(jid, { 
                text: '🎁 Daily rewards temporarily unavailable. Please try again later!' 
            }, { quoted: msg });
        }
    }
};