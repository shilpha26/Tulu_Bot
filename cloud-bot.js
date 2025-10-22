const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Environment variables for cloud deployment
const token = process.env.TELEGRAM_TOKEN;

if (!token) {
    console.error('❌ TELEGRAM_TOKEN environment variable not set');
    process.exit(1);
}

const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(token, {polling: true});

console.log('🚀 Smart Keep-Alive Tulu Bot Starting...\n');

// Smart Keep-Alive System
let keepAliveInterval = null;
let lastActivityTime = null;
const KEEP_ALIVE_DURATION = 30 * 60 * 1000; // 30 minutes
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

function startKeepAlive() {
    // Clear existing interval if any
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    lastActivityTime = Date.now();
    console.log('🏓 Starting keep-alive session for 30 minutes');
    
    keepAliveInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceActivity = now - lastActivityTime;
        
        if (timeSinceActivity > KEEP_ALIVE_DURATION) {
            // Stop keep-alive after 30 minutes of inactivity
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
            console.log('😴 Keep-alive session ended - bot can sleep');
            return;
        }
        
        // Send ping to keep service alive
        const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        fetch(`${baseUrl}/health`)
            .then(() => {
                const remainingTime = Math.ceil((KEEP_ALIVE_DURATION - timeSinceActivity) / (60 * 1000));
                console.log(`🏓 Keep-alive ping sent - ${remainingTime} min remaining`);
            })
            .catch(err => console.log('🚨 Keep-alive ping failed:', err.message));
            
    }, PING_INTERVAL);
}

function extendKeepAlive() {
    lastActivityTime = Date.now();
    
    // Start keep-alive if not already running
    if (!keepAliveInterval) {
        startKeepAlive();
    } else {
        console.log('🔄 Keep-alive session extended');
    }
}

// Health check server for Render.com
const app = express();

app.get('/', (req, res) => {
    const isKeepAliveActive = keepAliveInterval !== null;
    const timeSinceActivity = lastActivityTime ? Date.now() - lastActivityTime : null;
    
    const stats = {
        status: 'running',
        bot: 'Smart Keep-Alive Tulu Learning Translator',
        uptime: Math.floor(process.uptime() / 60) + ' minutes',
        learned_words: Object.keys(learnedWords).length,
        total_words: Object.keys(getCombinedDictionary()).length,
        keep_alive_active: isKeepAliveActive,
        minutes_since_activity: timeSinceActivity ? Math.floor(timeSinceActivity / (60 * 1000)) : null,
        features: ['Smart Keep-Alive', 'Learning Mode', 'Word Corrections', 'Number System', '24/7 Cloud Hosting'],
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        keep_alive: keepAliveInterval !== null,
        timestamp: new Date().toISOString() 
    });
});

// File to store learned translations
const LEARNED_WORDS_FILE = path.join(__dirname, 'learned_tulu.json');

// Load/Save functions (same as before)
function loadLearnedWords() {
    try {
        if (fs.existsSync(LEARNED_WORDS_FILE)) {
            const data = fs.readFileSync(LEARNED_WORDS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('⚠️ Could not load learned words:', error.message);
    }
    return {};
}

function saveLearnedWords(learnedWords) {
    try {
        fs.writeFileSync(LEARNED_WORDS_FILE, JSON.stringify(learnedWords, null, 2));
        console.log('💾 Learned words saved successfully');
    } catch (error) {
        console.error('❌ Could not save learned words:', error.message);
    }
}

// Load existing learned words
let learnedWords = loadLearnedWords();

// Enhanced user states
const userStates = {};

// Complete enhanced base dictionary (same as before - keeping it comprehensive)
const tuluDictionary = {
    // Basic Greetings
    'hello': 'namaskara',
    'hi': 'namaskara', 
    'hey': 'namaskara',
    'good morning': 'udige namaskara',
    'good evening': 'sanje namaskara',
    'good night': 'ratre namaskara',
    'goodbye': 'barpe',
    'bye': 'barpe',
    
    // Basic Responses
    'yes': 'aye',
    'no': 'illa',
    'ok': 'sari',
    'okay': 'sari',
    'thank you': 'dhanyavada',
    'thanks': 'dhanyavada',
    'welcome': 'swagata',
    'sorry': 'kshame',
    'please': 'dayavu',
    
    // Numbers (0-20)
    'zero': 'pundu', 'one': 'onji', 'two': 'raddu', 'three': 'muji', 'four': 'nalku',
    'five': 'aidu', 'six': 'aaru', 'seven': 'elu', 'eight': 'enmu', 'nine': 'ombodu', 'ten': 'pattu',
    '0': 'pundu', '1': 'onji', '2': 'raddu', '3': 'muji', '4': 'nalku',
    '5': 'aidu', '6': 'aaru', '7': 'elu', '8': 'enmu', '9': 'ombodu', '10': 'pattu',
    
    // Basic words
    'water': 'jalu', 'house': 'mane', 'come': 'bale', 'go': 'pole',
    'good': 'chennu', 'bad': 'kettadu', 'mother': 'amma', 'father': 'appa'
};

function getCombinedDictionary() {
    return { ...tuluDictionary, ...learnedWords };
}

// Enhanced translation function
async function translateToTulu(text, userId) {
    const lowerText = text.toLowerCase().trim();
    const fullDictionary = getCombinedDictionary();
    
    if (fullDictionary[lowerText]) {
        const translation = fullDictionary[lowerText];
        const source = learnedWords[lowerText] ? 'You taught me' : 'Base dictionary';
        console.log(`✅ Found "${translation}" (${source})`);
        return {
            translation: translation,
            found: true,
            source: source
        };
    }
    
    console.log(`❓ Unknown word: "${text}"`);
    userStates[userId] = {
        mode: 'learning',
        englishWord: lowerText,
        originalText: text,
        timestamp: Date.now()
    };
    
    return {
        translation: null,
        found: false,
        source: 'unknown'
    };
}

// Learn new word function
function learnNewWord(englishWord, tuluTranslation, userId) {
    const lowerEnglish = englishWord.toLowerCase().trim();
    const tuluWord = tuluTranslation.trim();
    
    learnedWords[lowerEnglish] = tuluWord;
    saveLearnedWords(learnedWords);
    delete userStates[userId];
    
    console.log(`📚 Learned: "${lowerEnglish}" = "${tuluWord}"`);
    return true;
}

// Clear user state function
function clearUserState(userId) {
    if (userStates[userId]) {
        delete userStates[userId];
        return true;
    }
    return false;
}

// Enhanced /start command
bot.onText(/\/start/, (msg) => {
    const learnedCount = Object.keys(learnedWords).length;
    const totalWords = Object.keys(getCombinedDictionary()).length;
    
    // Trigger keep-alive when user starts bot
    extendKeepAlive();
    clearUserState(msg.from.id);
    
    const welcomeMessage = `🌟 *Smart Keep-Alive Tulu Bot!*

☁️ **Now with Smart Keep-Alive System!**
🧠 **I Learn From You!**

📊 **Current Stats:**
• Base words: ${Object.keys(tuluDictionary).length}
• Learned from users: ${learnedCount}
• Total vocabulary: ${totalWords}

🏓 **Smart Keep-Alive:**
✅ Bot stays awake for 30min when you use it
✅ Auto-extends when you send messages
✅ Goes to sleep when inactive (saves resources)
✅ Wakes up instantly when you return

💡 **Try:**
• "hello" → namaskara
• "1" or "one" → onji
• "did you eat" (teach me authentic Tulu!)

🚀 **Available 24/7 with smart resource management!**`;

    bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// Enhanced message handler with keep-alive trigger
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const userText = msg.text.trim();
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'User';
        
        // Trigger keep-alive on every message
        extendKeepAlive();
        
        console.log(`📩 ${userName}: "${userText}" (keep-alive extended)`);
        
        // Check if user is in learning mode
        if (userStates[userId] && userStates[userId].mode === 'learning') {
            const userState = userStates[userId];
            learnNewWord(userState.englishWord, userText, userId);
            
            const successMessage = `✅ **Learned Successfully!**

📝 **English:** ${userState.originalText}
🏛️ **Authentic Tulu:** ${userText}

🧠 Stored permanently in cloud!
🏓 Bot staying awake for 30 more minutes

💡 **Try:** Ask me "${userState.originalText}" again!`;

            await bot.sendMessage(msg.chat.id, successMessage, {parse_mode: 'Markdown'});
            return;
        }
        
        // Normal translation request
        const englishPattern = /^[a-zA-Z0-9\s.,!?'"-]+$/;
        
        if (englishPattern.test(userText)) {
            bot.sendChatAction(msg.chat.id, 'typing');
            
            const result = await translateToTulu(userText, userId);
            
            if (result.found) {
                const response = `🔄 **Translation Result**

📝 **English:** ${userText}
🏛️ **Tulu:** ${result.translation}
🔧 **Source:** ${result.source}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏓 **Bot staying awake** for 30 more minutes
💡 Ask me another word!`;

                await bot.sendMessage(msg.chat.id, response, {parse_mode: 'Markdown'});
                
            } else {
                const learnMessage = `❓ **I don't know "${userText}"**

🎯 **Options:**
1️⃣ **Teach me:** Reply with authentic Tulu translation
2️⃣ **Skip:** Use /skip to try another word

🏓 **Bot staying awake** for 30 minutes while you decide
🏛️ Help me learn authentic Tulu!`;

                await bot.sendMessage(msg.chat.id, learnMessage, {parse_mode: 'Markdown'});
            }
        }
    }
});

// Add keep-alive trigger to all commands
bot.onText(/\/stats/, (msg) => {
    extendKeepAlive();
    
    const learnedCount = Object.keys(learnedWords).length;
    const uptime = Math.floor(process.uptime() / 60);
    const isKeepAliveActive = keepAliveInterval !== null;
    
    const statsMessage = `📊 **Smart Bot Statistics**

☁️ **Hosting:** Render.com with Smart Keep-Alive
⏱️ **Uptime:** ${uptime} minutes
🏓 **Keep-Alive Status:** ${isKeepAliveActive ? 'Active (30min)' : 'Sleeping'}

🧠 **Vocabulary:** ${Object.keys(getCombinedDictionary()).length} total words
📚 **User Taught:** ${learnedCount} words

🎯 **Smart System:**
✅ Stays awake when you're using it
✅ Saves resources when inactive  
✅ Instant response during active sessions

🏓 **Keep-alive extended for 30 more minutes!**`;

    bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Skip command with keep-alive
bot.onText(/\/skip|\/cancel/, (msg) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const cleared = clearUserState(userId);
    
    if (cleared) {
        bot.sendMessage(msg.chat.id, `✅ **Conversation Reset!**
        
🔄 Ask me any new English word or number
🏓 Keep-alive extended for 30 more minutes`, {parse_mode: 'Markdown'});
    } else {
        bot.sendMessage(msg.chat.id, '💭 No active conversation. Ask me any English word!\n🏓 Keep-alive extended for 30 minutes');
    }
});

// Error handling
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Start health check server
app.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// Enhanced startup
bot.getMe().then(botInfo => {
    console.log('✅ ============================================');
    console.log('✅ SMART KEEP-ALIVE TULU BOT IS LIVE!');
    console.log('✅ ============================================\n');
    console.log(`🤖 Bot: @${botInfo.username}`);
    console.log(`☁️ Hosted on: Render.com`);
    console.log(`🏓 Smart Keep-Alive: Ready`);
    console.log(`📚 Base words: ${Object.keys(tuluDictionary).length}`);
    console.log(`🧠 Learned words: ${Object.keys(learnedWords).length}`);
    console.log(`🎯 Efficient resource management active!\n`);
});
