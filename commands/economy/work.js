export default {
    name: 'work',
    aliases: ['job', 'earn', 'labor'],
    description: 'Work different jobs to earn money and experience!',
    usage: '/work [job_type]',
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
                    lastWork: 0,
                    workStreak: 0,
                    totalWorked: 0,
                    totalEarned: 1000,
                    jobLevel: 1,
                    jobExperience: 0
                };
                db.data.economy[senderJid] = userEconomy;
            }

            // Get or create user profile for XP
            let userProfile = db.data.profiles[senderJid];
            if (!userProfile) {
                userProfile = {
                    level: 1,
                    xp: 0,
                    created: Date.now()
                };
                db.data.profiles[senderJid] = userProfile;
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

            // Work cooldown check (1 hour)
            const now = Date.now();
            const workCooldown = 60 * 60 * 1000; // 1 hour
            const timeSinceLastWork = now - userEconomy.lastWork;

            if (timeSinceLastWork < workCooldown) {
                const timeLeft = workCooldown - timeSinceLastWork;
                const minutesLeft = Math.ceil(timeLeft / (60 * 1000));
                
                const cooldownText = `⏰ ${styleText('WORK COOLDOWN', 'fancy')}

${createBox('🚫 STILL TIRED FROM LAST JOB', 
    `${styleText('Time Remaining:', 'bold')} ${minutesLeft} minutes\n` +
    `${styleText('Next Work Available:', 'bold')} ${new Date(userEconomy.lastWork + workCooldown).toLocaleTimeString()}\n` +
    `${styleText('Current Streak:', 'bold')} ${userEconomy.workStreak} jobs 🔥`
)}

${styleText('💡 WHILE YOU WAIT:', 'bold')}
• ${styleText('/daily', 'mono')} - Claim daily rewards
• ${styleText('/hunt', 'mono')} - Hunt for money
• ${styleText('/fish', 'mono')} - Go fishing
• ${styleText('/mine', 'mono')} - Mine resources
• ${styleText('/slots', 'mono')} - Try gambling

${styleText('🎯 WORK STATS:', 'bold')}
${styleText('Job Level:', 'bold')} ${userEconomy.jobLevel}
${styleText('Job Experience:', 'bold')} ${userEconomy.jobExperience} XP
${styleText('Total Jobs:', 'bold')} ${userEconomy.totalWorked}`;

                await sock.sendMessage(jid, { text: cooldownText }, { quoted: msg });
                return;
            }

            // Job types with different pay rates and requirements
            const jobs = {
                delivery: {
                    name: 'Pizza Delivery',
                    emoji: '🍕',
                    minLevel: 1,
                    basePay: [100, 300],
                    xpGain: [10, 25],
                    failureRate: 0.1,
                    descriptions: [
                        'Delivered hot pizzas across town',
                        'Successfully navigated rush hour traffic',
                        'Made customers happy with fast delivery',
                        'Handled difficult customers professionally'
                    ]
                },
                cashier: {
                    name: 'Store Cashier',
                    emoji: '🏪',
                    minLevel: 1,
                    basePay: [150, 250],
                    xpGain: [15, 30],
                    failureRate: 0.05,
                    descriptions: [
                        'Served customers with a smile',
                        'Handled cash register efficiently',
                        'Helped customers find products',
                        'Managed long checkout lines'
                    ]
                },
                programmer: {
                    name: 'Freelance Coding',
                    emoji: '💻',
                    minLevel: 3,
                    basePay: [300, 600],
                    xpGain: [25, 50],
                    failureRate: 0.15,
                    descriptions: [
                        'Fixed critical bugs in production',
                        'Developed new features for clients',
                        'Optimized database queries',
                        'Completed project ahead of deadline'
                    ]
                },
                manager: {
                    name: 'Team Manager',
                    emoji: '👔',
                    minLevel: 5,
                    basePay: [500, 800],
                    xpGain: [40, 70],
                    failureRate: 0.2,
                    descriptions: [
                        'Led successful team meeting',
                        'Resolved workplace conflicts',
                        'Improved team productivity',
                        'Secured new business partnerships'
                    ]
                },
                ceo: {
                    name: 'CEO Consulting',
                    emoji: '👑',
                    minLevel: 10,
                    basePay: [1000, 2000],
                    xpGain: [75, 150],
                    failureRate: 0.3,
                    descriptions: [
                        'Closed million-dollar deal',
                        'Restructured company operations',
                        'Led successful board meeting',
                        'Expanded business to new markets'
                    ]
                }
            };

            // Get job type from args or auto-select based on level
            const jobType = args[0]?.toLowerCase() || 'auto';
            let selectedJob;

            if (jobType === 'auto') {
                // Auto-select best available job based on level
                const availableJobs = Object.entries(jobs).filter(([_, job]) => 
                    userEconomy.jobLevel >= job.minLevel
                );
                selectedJob = availableJobs[availableJobs.length - 1]; // Best available
            } else {
                selectedJob = Object.entries(jobs).find(([key, _]) => key === jobType);
                if (!selectedJob) {
                    const availableJobsList = Object.keys(jobs).join(', ');
                    await sock.sendMessage(jid, { 
                        text: `❌ Unknown job type! Available jobs: ${availableJobsList}` 
                    }, { quoted: msg });
                    return;
                }
            }

            const [jobKey, jobData] = selectedJob;

            // Check level requirement
            if (userEconomy.jobLevel < jobData.minLevel) {
                await sock.sendMessage(jid, { 
                    text: `🚫 ${jobData.name} requires Job Level ${jobData.minLevel}! You're currently level ${userEconomy.jobLevel}.` 
                }, { quoted: msg });
                return;
            }

            // Work simulation
            const isSuccess = Math.random() > jobData.failureRate;
            const levelMultiplier = 1 + (userEconomy.jobLevel - 1) * 0.1; // 10% per level
            const streakMultiplier = 1 + Math.min(userEconomy.workStreak * 0.05, 0.5); // Max 50% bonus

            let earnings = 0;
            let xpGained = 0;
            let description = '';

            if (isSuccess) {
                earnings = Math.floor(
                    (Math.random() * (jobData.basePay[1] - jobData.basePay[0]) + jobData.basePay[0]) 
                    * levelMultiplier * streakMultiplier
                );
                xpGained = Math.floor(
                    (Math.random() * (jobData.xpGain[1] - jobData.xpGain[0]) + jobData.xpGain[0])
                    * levelMultiplier
                );
                description = jobData.descriptions[Math.floor(Math.random() * jobData.descriptions.length)];
                userEconomy.workStreak += 1;
            } else {
                earnings = Math.floor(jobData.basePay[0] * 0.3); // Partial pay for failed work
                xpGained = Math.floor(jobData.xpGain[0] * 0.5); // Reduced XP
                description = 'Work didn\'t go as planned, but you tried your best';
                userEconomy.workStreak = Math.max(0, userEconomy.workStreak - 1);
            }

            // Update user stats
            userEconomy.wallet += earnings;
            userEconomy.totalEarned += earnings;
            userEconomy.lastWork = now;
            userEconomy.totalWorked += 1;
            userEconomy.jobExperience += xpGained;

            // Check for job level up
            const xpForNextJobLevel = userEconomy.jobLevel * 500;
            let jobLeveledUp = false;
            if (userEconomy.jobExperience >= xpForNextJobLevel) {
                userEconomy.jobLevel += 1;
                userEconomy.jobExperience -= xpForNextJobLevel;
                jobLeveledUp = true;
            }

            // Update profile XP
            userProfile.xp += xpGained;
            const xpForNextLevel = userProfile.level * 1000;
            let profileLeveledUp = false;
            if (userProfile.xp >= xpForNextLevel) {
                userProfile.level += 1;
                userProfile.xp -= xpForNextLevel;
                profileLeveledUp = true;
            }

            const workResultText = `${jobData.emoji} ${styleText('WORK COMPLETED!', 'fancy')}

${createBox(isSuccess ? '✅ WORK SUCCESSFUL' : '⚠️ WORK PARTIALLY COMPLETED',
    `${styleText('Job:', 'bold')} ${jobData.name}\n` +
    `${styleText('Description:', 'bold')} ${description}\n` +
    `${styleText('Performance:', 'bold')} ${isSuccess ? 'Excellent!' : 'Needs improvement'}\n` +
    `${styleText('Earnings:', 'bold')} $${earnings} 💰\n` +
    `${styleText('Experience:', 'bold')} +${xpGained} XP ⭐`
)}

${createBox('📊 UPDATED STATS',
    `${styleText('New Wallet:', 'bold')} $${userEconomy.wallet}\n` +
    `${styleText('Work Streak:', 'bold')} ${userEconomy.workStreak} jobs 🔥\n` +
    `${styleText('Job Level:', 'bold')} ${userEconomy.jobLevel} (${userEconomy.jobExperience} XP)\n` +
    `${styleText('Profile Level:', 'bold')} ${userProfile.level} (${userProfile.xp} XP)\n` +
    `${styleText('Total Jobs:', 'bold')} ${userEconomy.totalWorked}`
)}

${jobLeveledUp ? `🎉 ${styleText('JOB LEVEL UP!', 'bold')} You reached Job Level ${userEconomy.jobLevel}!\n` : ''}${profileLeveledUp ? `🏆 ${styleText('PROFILE LEVEL UP!', 'bold')} You reached Level ${userProfile.level}!\n` : ''}
${styleText('💼 AVAILABLE JOBS:', 'bold')}
${Object.entries(jobs).map(([key, job]) => 
    `${userEconomy.jobLevel >= job.minLevel ? '✅' : '🔒'} ${styleText(`/work ${key}`, 'mono')} - ${job.emoji} ${job.name} (Level ${job.minLevel}+)`
).join('\n')}

${styleText('⏰ NEXT WORK:', 'bold')} Available in 1 hour
${styleText('💡 TIP:', 'italic')} Higher job levels unlock better paying jobs!
${styleText('🔥 STREAK BONUS:', 'bold')} +${Math.round((streakMultiplier - 1) * 100)}% earnings`;

            await sock.sendMessage(jid, { text: workResultText }, { quoted: msg });
            await db.write();

        } catch (error) {
            console.error('Work command error:', error);
            await sock.sendMessage(jid, { 
                text: '💼 Work system temporarily unavailable. Please try again later!' 
            }, { quoted: msg });
        }
    }
};