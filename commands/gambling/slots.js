export default {
    name: 'slots',
    aliases: ['slot', 'slotmachine', 'casino'],
    description: 'Play the slot machine and win big prizes!',
    usage: '/slots [amount]',
    category: 'gambling',
    
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
                    totalEarned: 1000,
                    totalSpent: 0,
                    totalGambled: 0,
                    totalWon: 0,
                    totalLost: 0,
                    slotPlays: 0,
                    slotWins: 0
                };
                db.data.economy[senderJid] = userEconomy;
            }

            // Get bet amount
            const betAmount = parseInt(args[0]) || 100;
            const minBet = 50;
            const maxBet = Math.max(10000, userEconomy.wallet);

            // Validation
            if (betAmount < minBet) {
                await sock.sendMessage(jid, { 
                    text: `🎰 Minimum bet is $${minBet}! Use \`/slots ${minBet}\`` 
                }, { quoted: msg });
                return;
            }

            if (betAmount > maxBet) {
                await sock.sendMessage(jid, { 
                    text: `🎰 Maximum bet is $${maxBet}! Use \`/slots ${maxBet}\`` 
                }, { quoted: msg });
                return;
            }

            if (userEconomy.wallet < betAmount) {
                await sock.sendMessage(jid, { 
                    text: `💰 Insufficient funds! You need $${betAmount} but only have $${userEconomy.wallet}\nUse \`/work\` or \`/daily\` to earn money!` 
                }, { quoted: msg });
                return;
            }

            // Stylish text utilities
            const styleText = (text, style = 'normal') => {
                const styles = {
                    bold: t => `*${t}*`,
                    italic: t => `_${t}_`,
                    mono: t => `\`${t}\``,
                    fancy: t => {
                        const chars = {
                            'A': '𝒜', 'B': '𝐵', 'C': '𝒞', 'D': '𝒟', 'E': '𝐸'
                        };
                        return t.split('').map(c => chars[c] || c).join('');
                    }
                };
                return styles[style] ? styles[style](text) : text;
            };

            // Slot symbols with different rarities and multipliers
            const symbols = [
                { emoji: '🍒', name: 'Cherry', weight: 25, multiplier: 1.5 },
                { emoji: '🍋', name: 'Lemon', weight: 25, multiplier: 1.5 },
                { emoji: '🍊', name: 'Orange', weight: 20, multiplier: 2 },
                { emoji: '🍇', name: 'Grape', weight: 15, multiplier: 2.5 },
                { emoji: '🔔', name: 'Bell', weight: 10, multiplier: 3 },
                { emoji: '💎', name: 'Diamond', weight: 3, multiplier: 5 },
                { emoji: '👑', name: 'Crown', weight: 1.5, multiplier: 10 },
                { emoji: '💀', name: 'Skull', weight: 0.5, multiplier: 50 }
            ];

            // Weighted random selection
            const getRandomSymbol = () => {
                const totalWeight = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
                let random = Math.random() * totalWeight;
                
                for (const symbol of symbols) {
                    if (random < symbol.weight) {
                        return symbol;
                    }
                    random -= symbol.weight;
                }
                return symbols[0]; // fallback
            };

            // Generate slot results
            const slot1 = getRandomSymbol();
            const slot2 = getRandomSymbol();
            const slot3 = getRandomSymbol();

            // Calculate winnings
            let winMultiplier = 0;
            let winType = '';

            // Check for winning combinations
            if (slot1.emoji === slot2.emoji && slot2.emoji === slot3.emoji) {
                // Triple match - highest payout
                winMultiplier = slot1.multiplier * 2;
                winType = `TRIPLE ${slot1.name.toUpperCase()}S! 🎉`;
            } else if (slot1.emoji === slot2.emoji || slot2.emoji === slot3.emoji || slot1.emoji === slot3.emoji) {
                // Double match - medium payout
                const matchedSymbol = slot1.emoji === slot2.emoji ? slot1 : 
                                    slot2.emoji === slot3.emoji ? slot2 : slot1;
                winMultiplier = matchedSymbol.multiplier;
                winType = `DOUBLE ${matchedSymbol.name.toUpperCase()}S! 🎊`;
            }

            // Special jackpot combinations
            if (slot1.emoji === '💀' && slot2.emoji === '💀' && slot3.emoji === '💀') {
                winMultiplier = 100; // Mega jackpot!
                winType = 'DEATH JACKPOT! 💀💀💀';
            } else if (slot1.emoji === '👑' && slot2.emoji === '👑' && slot3.emoji === '👑') {
                winMultiplier = 50;
                winType = 'ROYAL JACKPOT! 👑👑👑';
            } else if (slot1.emoji === '💎' && slot2.emoji === '💎' && slot3.emoji === '💎') {
                winMultiplier = 25;
                winType = 'DIAMOND JACKPOT! 💎💎💎';
            }

            const winnings = Math.floor(betAmount * winMultiplier);
            const profit = winnings - betAmount;

            // Update user stats
            userEconomy.wallet -= betAmount;
            userEconomy.wallet += winnings;
            userEconomy.totalGambled += betAmount;
            userEconomy.slotPlays += 1;

            if (winnings > betAmount) {
                userEconomy.totalWon += profit;
                userEconomy.slotWins += 1;
            } else {
                userEconomy.totalLost += betAmount;
            }

            // Create animated slot display
            const createSlotDisplay = (s1, s2, s3, isWin = false) => {
                const border = isWin ? '✨' : '🎰';
                return `${border}┌─────────────┐${border}
${border}│ ${s1.emoji} │ ${s2.emoji} │ ${s3.emoji} │${border}
${border}└─────────────┘${border}`;
            };

            // Send initial spinning message
            const spinningMsg = await sock.sendMessage(jid, { 
                text: `🎰 ${styleText(userName, 'fancy')} is spinning the slots!\n\n` +
                      `${styleText('Bet Amount:', 'bold')} $${betAmount}\n\n` +
                      `🎰┌─────────────┐🎰\n` +
                      `🎰│ 🎲 │ 🎲 │ 🎲 │🎰\n` +
                      `🎰└─────────────┘🎰\n\n` +
                      `${styleText('Spinning...', 'italic')} 🌀`
            }, { quoted: msg });

            // Wait for dramatic effect
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Results message
            const isWin = winnings > betAmount;
            const resultText = `🎰 ${styleText('SLOT MACHINE RESULTS', 'bold')} 🎰

${createSlotDisplay(slot1, slot2, slot3, isWin)}

${isWin ? 
    `🎉 ${styleText(winType, 'bold')} 🎉\n\n` +
    `${styleText('Winnings:', 'bold')} $${winnings} ${winMultiplier >= 10 ? '💰💰💰' : winMultiplier >= 5 ? '💰💰' : '💰'}\n` +
    `${styleText('Profit:', 'bold')} +$${profit} 📈\n` +
    `${styleText('Multiplier:', 'bold')} ${winMultiplier}x ⚡`
    :
    `💸 ${styleText('NO MATCH - BETTER LUCK NEXT TIME!', 'bold')} 💸\n\n` +
    `${styleText('Lost:', 'bold')} -$${betAmount} 📉\n` +
    `${styleText('Try again:', 'italic')} Maybe next spin is your lucky one!`
}

${styleText('💳 UPDATED BALANCE:', 'bold')}
${styleText('Wallet:', 'bold')} $${userEconomy.wallet}

${styleText('🎰 SLOT STATISTICS:', 'bold')}
${styleText('Total Plays:', 'bold')} ${userEconomy.slotPlays}
${styleText('Total Wins:', 'bold')} ${userEconomy.slotWins}
${styleText('Win Rate:', 'bold')} ${userEconomy.slotPlays > 0 ? Math.round((userEconomy.slotWins / userEconomy.slotPlays) * 100) : 0}%
${styleText('Net Gambling:', 'bold')} ${userEconomy.totalWon - userEconomy.totalLost >= 0 ? '+' : ''}$${userEconomy.totalWon - userEconomy.totalLost}

${styleText('🎯 PAYOUT TABLE:', 'bold')}
${symbols.map(s => `${s.emoji} ${s.emoji} ${s.emoji} = ${s.multiplier * 2}x`).join('\n')}

${styleText('💡 TIP:', 'italic')} Higher bets = bigger potential wins!
${styleText('🎮 Play Again:', 'bold')} ${styleText(`/slots ${betAmount}`, 'mono')}`;

            // Edit the spinning message with results
            try {
                await sock.sendMessage(jid, { 
                    text: resultText,
                    edit: spinningMsg.key 
                });
            } catch {
                // If edit fails, send new message
                await sock.sendMessage(jid, { text: resultText }, { quoted: msg });
            }

            await db.write();

        } catch (error) {
            console.error('Slots command error:', error);
            await sock.sendMessage(jid, { 
                text: '🎰 Slot machine temporarily out of order! Please try again later.' 
            }, { quoted: msg });
        }
    }
};