export default {
    name: 'profile',
    aliases: ['p', 'me', 'user'],
    description: 'View your complete profile with stats and information',
    usage: '/profile [@user]',
    category: 'profile',
    
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db, memoryNames }) => {
        try {
            // Initialize user database
            await db.read();
            if (!db.data.users) db.data.users = [];
            if (!db.data.profiles) db.data.profiles = {};
            if (!db.data.economy) db.data.economy = {};
            if (!db.data.userGangs) db.data.userGangs = {};
            if (!db.data.gangs) db.data.gangs = {};

            // Determine target user
            let targetJid = senderJid;
            let targetNum = senderNum;
            
            if (args.length > 0 && msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.length > 0) {
                targetJid = msg.message.extendedTextMessage.contextInfo.mentionedJid[0];
                targetNum = targetJid.split('@')[0];
            }

            const userName = memoryNames?.get(targetJid) || `User${targetNum.slice(-4)}`;
            const isOwnProfile = targetJid === senderJid;

            // Get or create user profile
            let userProfile = db.data.profiles[targetJid];
            if (!userProfile) {
                userProfile = {
                    created: Date.now(),
                    bio: '✨ New adventurer in the RPG world!',
                    age: null,
                    gender: null,
                    title: '🔰 Newcomer',
                    avatar: '👤',
                    status: 'active',
                    reputation: 0,
                    level: 1,
                    xp: 0,
                    lastActive: Date.now()
                };
                db.data.profiles[targetJid] = userProfile;
            }

            // Get economy data
            const userEconomy = db.data.economy[targetJid] || {
                wallet: 0,
                bank: 0,
                networth: 0
            };

            // Get gang info
            const userGang = db.data.userGangs[targetJid];
            const gangInfo = userGang ? db.data.gangs[userGang] : null;

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

            const createBox = (content) => {
                const lines = content.split('\n');
                const maxWidth = Math.max(...lines.map(l => l.length)) + 4;
                const border = '─'.repeat(maxWidth);
                
                return [
                    `┌${border}┐`,
                    ...lines.map(line => `│ ${line.padEnd(maxWidth - 2)} │`),
                    `└${border}┘`
                ].join('\n');
            };

            // Calculate level progress
            const xpForNext = userProfile.level * 1000;
            const xpProgress = (userProfile.xp % 1000) / 10; // percentage
            const progressBar = '█'.repeat(Math.floor(xpProgress / 10)) + '░'.repeat(10 - Math.floor(xpProgress / 10));

            // Calculate total networth
            const totalNetworth = userEconomy.wallet + userEconomy.bank;

            // Format numbers
            const formatMoney = (amount) => {
                if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M`;
                if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
                return amount.toString();
            };

            // Profile display
            const profileText = `${userProfile.avatar} ${styleText(userName, 'fancy')} ${userProfile.title}
${createBox(
    `${styleText('📊 PROFILE OVERVIEW', 'bold')}\n\n` +
    `${styleText('Bio:', 'bold')} ${userProfile.bio}\n` +
    `${userProfile.age ? `${styleText('Age:', 'bold')} ${userProfile.age} years\n` : ''}` +
    `${userProfile.gender ? `${styleText('Gender:', 'bold')} ${userProfile.gender}\n` : ''}` +
    `${styleText('Status:', 'bold')} ${userProfile.status === 'active' ? '🟢 Active' : '🔴 Away'}\n` +
    `${styleText('Reputation:', 'bold')} ${userProfile.reputation} ⭐\n` +
    `${styleText('Joined:', 'bold')} ${new Date(userProfile.created).toLocaleDateString()}`
)}

${createBox(
    `${styleText('⚡ LEVEL & EXPERIENCE', 'bold')}\n\n` +
    `${styleText('Level:', 'bold')} ${userProfile.level} 🏆\n` +
    `${styleText('Experience:', 'bold')} ${userProfile.xp} XP\n` +
    `${styleText('Progress:', 'bold')} ${progressBar} ${Math.floor(xpProgress)}%\n` +
    `${styleText('Next Level:', 'bold')} ${xpForNext - (userProfile.xp % 1000)} XP needed`
)}

${createBox(
    `${styleText('💰 ECONOMY STATUS', 'bold')}\n\n` +
    `${styleText('Wallet:', 'bold')} $${formatMoney(userEconomy.wallet)} 💵\n` +
    `${styleText('Bank:', 'bold')} $${formatMoney(userEconomy.bank)} 🏦\n` +
    `${styleText('Net Worth:', 'bold')} $${formatMoney(totalNetworth)} 💎\n` +
    `${styleText('Rank:', 'bold')} ${totalNetworth >= 1000000 ? '👑 Millionaire' : 
                                    totalNetworth >= 100000 ? '💎 Rich' : 
                                    totalNetworth >= 10000 ? '💰 Wealthy' : 
                                    totalNetworth >= 1000 ? '💵 Middle Class' : '🥉 Beginner'}`
)}

${gangInfo ? createBox(
    `${styleText('🛡️ GANG INFORMATION', 'bold')}\n\n` +
    `${styleText('Gang:', 'bold')} ${styleText(gangInfo.name, 'fancy')}\n` +
    `${styleText('Role:', 'bold')} ${gangInfo.members[targetJid]?.role || 'Member'}\n` +
    `${styleText('Contribution:', 'bold')} ${gangInfo.members[targetJid]?.contribution || 0} points\n` +
    `${styleText('Members:', 'bold')} ${Object.keys(gangInfo.members).length}`
) : createBox(
    `${styleText('🛡️ GANG STATUS', 'bold')}\n\n` +
    `${styleText('Status:', 'bold')} No gang affiliation\n` +
    `${styleText('Suggestion:', 'italic')} Join a gang to unlock features!`
)}

${styleText('🎮 PROFILE ACTIONS:', 'bold')}
${isOwnProfile ? 
    `• ${styleText('/edit', 'mono')} - Edit profile\n` +
    `• ${styleText('/bio [text]', 'mono')} - Change bio\n` +
    `• ${styleText('/title [title]', 'mono')} - Set title\n` +
    `• ${styleText('/avatar', 'mono')} - Change avatar` :
    `• ${styleText('/reputation @user', 'mono')} - Give reputation\n` +
    `• ${styleText('/send @user [amount]', 'mono')} - Send money`
}

${styleText('📈 PROGRESS TIPS:', 'italic')}
• Use commands to gain XP and level up
• Complete daily tasks for bonus rewards
• Join gangs for exclusive benefits
• Build your economy through various activities

${styleText('👤 Viewing:', 'bold')} ${isOwnProfile ? 'Your Profile' : `${userName}'s Profile`}`;

            await sock.sendMessage(jid, { text: profileText }, { quoted: msg });
            await db.write();

        } catch (error) {
            console.error('Profile command error:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Profile temporarily unavailable. Please try again later!' 
            }, { quoted: msg });
        }
    }
};