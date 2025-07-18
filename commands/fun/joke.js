export default {
    name: 'joke',
    aliases: ['funny', 'humor', 'laugh'],
    description: 'Get random jokes to brighten your day!',
    usage: '/joke [category]',
    category: 'fun',
    
    execute: async (sock, msg, args, { jid, senderJid, senderNum, db, memoryNames }) => {
        try {
            const userName = memoryNames?.get(senderJid) || `User${senderNum.slice(-4)}`;
            const category = args[0]?.toLowerCase() || 'random';

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

            // Joke categories
            const jokes = {
                programming: [
                    {
                        setup: "Why do programmers prefer dark mode?",
                        punchline: "Because light attracts bugs! 🐛"
                    },
                    {
                        setup: "How many programmers does it take to change a light bulb?",
                        punchline: "None. It's a hardware problem! 💡"
                    },
                    {
                        setup: "Why do Java developers wear glasses?",
                        punchline: "Because they can't C# 👓"
                    },
                    {
                        setup: "What's a programmer's favorite hangout place?",
                        punchline: "Foo Bar! 🍻"
                    }
                ],
                dad: [
                    {
                        setup: "I'm reading a book about anti-gravity.",
                        punchline: "It's impossible to put down! 📖"
                    },
                    {
                        setup: "Why don't scientists trust atoms?",
                        punchline: "Because they make up everything! ⚛️"
                    },
                    {
                        setup: "Did you hear about the mathematician who's afraid of negative numbers?",
                        punchline: "He'll stop at nothing to avoid them! ➖"
                    },
                    {
                        setup: "What do you call a fake noodle?",
                        punchline: "An impasta! 🍝"
                    }
                ],
                tech: [
                    {
                        setup: "Why was the computer cold?",
                        punchline: "It left its Windows open! 🪟"
                    },
                    {
                        setup: "What's the object-oriented way to become wealthy?",
                        punchline: "Inheritance! 💰"
                    },
                    {
                        setup: "Why do robots never panic?",
                        punchline: "They have nerves of steel! 🤖"
                    },
                    {
                        setup: "What did the router say to the doctor?",
                        punchline: "It hurts when IP! 🌐"
                    }
                ],
                animals: [
                    {
                        setup: "What do you call a sleeping bull?",
                        punchline: "A bulldozer! 🐂"
                    },
                    {
                        setup: "Why don't elephants use computers?",
                        punchline: "They're afraid of the mouse! 🐘"
                    },
                    {
                        setup: "What do you call a fish wearing a crown?",
                        punchline: "A king fish! 👑🐟"
                    },
                    {
                        setup: "Why don't cats play poker in the jungle?",
                        punchline: "Too many cheetahs! 🐱"
                    }
                ],
                food: [
                    {
                        setup: "Why did the cookie go to the doctor?",
                        punchline: "Because it felt crumbly! 🍪"
                    },
                    {
                        setup: "What's a banana's favorite gymnastic move?",
                        punchline: "The split! 🍌"
                    },
                    {
                        setup: "Why did the coffee file a police report?",
                        punchline: "It got mugged! ☕"
                    },
                    {
                        setup: "What do you call cheese that isn't yours?",
                        punchline: "Nacho cheese! 🧀"
                    }
                ]
            };

            // Get all jokes for random selection
            const allJokes = Object.values(jokes).flat();

            // Select joke based on category
            let selectedJokes;
            let categoryName;

            if (category === 'random' || !jokes[category]) {
                selectedJokes = allJokes;
                categoryName = 'Random';
            } else {
                selectedJokes = jokes[category];
                categoryName = category.charAt(0).toUpperCase() + category.slice(1);
            }

            const randomJoke = selectedJokes[Math.floor(Math.random() * selectedJokes.length)];

            // Joke emojis
            const jokeEmojis = ['😂', '🤣', '😄', '😆', '🙃', '😁', '😊', '🤭'];
            const randomEmoji = jokeEmojis[Math.floor(Math.random() * jokeEmojis.length)];

            // Create stylish joke presentation
            const jokeText = `${randomEmoji} ${styleText('JOKE TIME!', 'fancy')} ${randomEmoji}

╭─────◆ ◈ ◆─────╮
📝 ${styleText(categoryName + ' Joke', 'bold')}
╰─────◆ ◈ ◆─────╯

${styleText('Setup:', 'bold')} ${randomJoke.setup}

${styleText('Punchline:', 'bold')} ${randomJoke.punchline}

${randomEmoji.repeat(3)} ${styleText('Hope that made you laugh!', 'italic')} ${randomEmoji.repeat(3)}

${styleText('📚 Available Categories:', 'bold')}
• ${styleText('/joke programming', 'mono')} - Tech humor
• ${styleText('/joke dad', 'mono')} - Classic dad jokes
• ${styleText('/joke tech', 'mono')} - Technology jokes
• ${styleText('/joke animals', 'mono')} - Animal humor
• ${styleText('/joke food', 'mono')} - Food jokes
• ${styleText('/joke random', 'mono')} - Mixed jokes

${styleText('🎭 More Fun:', 'bold')}
• ${styleText('/roast', 'mono')} - Roast someone
• ${styleText('/meme', 'mono')} - Random memes
• ${styleText('/quote', 'mono')} - Inspirational quotes

${styleText('😄 Enjoyed by:', 'italic')} ${userName}`;

            await sock.sendMessage(jid, { text: jokeText }, { quoted: msg });

        } catch (error) {
            console.error('Joke command error:', error);
            await sock.sendMessage(jid, { 
                text: '😅 Joke machine is having a laugh malfunction! Try again later.' 
            }, { quoted: msg });
        }
    }
};