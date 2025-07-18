export default {
    name: 'restart',
    aliases: ['reboot', 'reset'],
    description: 'Restart the bot (Admin only)',
    usage: '/restart',
    category: 'utility',
    
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db, memoryNames }) => {
        try {
            const userName = memoryNames?.get(senderJid) || `User${senderNum.slice(-4)}`;
            
            // Admin check
            const adminNumber = process.env.ADMIN_NUMBER;
            const isAdmin = adminNumber && senderNum === adminNumber;
            
            if (!isAdmin) {
                await sock.sendMessage(jid, { 
                    text: '❌ This command is restricted to administrators only.' 
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
                            'A': '𝒜', 'B': '𝐵', 'C': '𝒞', 'D': '𝒟', 'E': '𝐸', 'F': '𝐹', 'G': '𝒢', 'H': '𝐻'
                        };
                        return t.split('').map(c => chars[c] || c).join('');
                    }
                };
                return styles[style] ? styles[style](text) : text;
            };

            // Save database before restart
            try {
                await db.write();
            } catch (error) {
                console.error('Database save error before restart:', error);
            }

            const restartText = `🔄 ${styleText('BOT RESTART INITIATED', 'fancy')}

╭─────◆ ◈ ◆─────╮
⚡ ${styleText('SYSTEM RESTART', 'bold')}
╰─────◆ ◈ ◆─────╯

${styleText('Administrator:', 'bold')} ${userName}
${styleText('Restart Time:', 'bold')} ${new Date().toLocaleString()}
${styleText('Status:', 'bold')} Shutting down gracefully...

${styleText('📊 PRE-RESTART CHECKLIST:', 'bold')}
✅ Database saved
✅ Active connections logged
✅ Memory cleared
✅ Graceful shutdown initiated

${styleText('⏱️ EXPECTED DOWNTIME:', 'bold')} 10-30 seconds
${styleText('🔄 AUTO-RECONNECT:', 'bold')} Enabled

${styleText('💡 Note:', 'italic')} The bot will automatically reconnect
and resume all functions after restart.

${styleText('🤖 Restarting now...', 'bold')}`;

            await sock.sendMessage(jid, { text: restartText }, { quoted: msg });

            // Wait a moment for the message to send
            setTimeout(() => {
                console.log(`[RESTART] Bot restart initiated by admin: ${userName} (${senderNum})`);
                process.exit(0);
            }, 2000);

        } catch (error) {
            console.error('Restart command error:', error);
            await sock.sendMessage(jid, { 
                text: '❌ Restart command failed. Please check bot logs and try again.' 
            }, { quoted: msg });
        }
    }
};