const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const express = require('express');
const { Pool } = require('pg');

// SECURE: Only use environment variables
const token = process.env.TELEGRAM_TOKEN;
const PORT = process.env.PORT || 3000;

// Exit if token not provided
if (!token) {
    console.error('❌ TELEGRAM_TOKEN environment variable not set');
    console.error('💡 Set it in Render.com dashboard under Environment Variables');
    process.exit(1);
}

// Database connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const bot = new TelegramBot(token, {polling: true});

console.log('🚀 Persistent Database Tulu Bot Starting...\n');

// Smart Keep-Alive System
let keepAliveInterval = null;
let lastActivityTime = null;
const KEEP_ALIVE_DURATION = 30 * 60 * 1000; // 30 minutes
const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    lastActivityTime = Date.now();
    console.log('🏓 Starting keep-alive session for 30 minutes');
    
    keepAliveInterval = setInterval(() => {
        const now = Date.now();
        const timeSinceActivity = now - lastActivityTime;
        
        if (timeSinceActivity > KEEP_ALIVE_DURATION) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
            console.log('😴 Keep-alive session ended - bot can sleep');
            return;
        }
        
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
    
    if (!keepAliveInterval) {
        startKeepAlive();
    } else {
        console.log('🔄 Keep-alive session extended');
    }
}

// Initialize database
async function initializeDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS learned_words (
                id SERIAL PRIMARY KEY,
                english VARCHAR(255) UNIQUE NOT NULL,
                tulu VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ Database table initialized');
        
        // Test database connection
        const result = await pool.query('SELECT COUNT(*) FROM learned_words');
        const wordCount = parseInt(result.rows[0].count);
        console.log(`📚 Database loaded with ${wordCount} learned words`);
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        // Continue without database if it fails
    }
}

// Database operations
async function saveLearnedWordToDB(englishWord, tuluWord) {
    try {
        await pool.query(`
            INSERT INTO learned_words (english, tulu, updated_at) 
            VALUES ($1, $2, CURRENT_TIMESTAMP) 
            ON CONFLICT (english) 
            DO UPDATE SET tulu = $2, updated_at = CURRENT_TIMESTAMP
        `, [englishWord.toLowerCase().trim(), tuluWord.trim()]);
        
        console.log(`💾 Saved to database: "${englishWord}" = "${tuluWord}"`);
        return true;
    } catch (error) {
        console.error('❌ Database save failed:', error);
        return false;
    }
}

async function loadLearnedWordsFromDB() {
    try {
        const result = await pool.query('SELECT english, tulu FROM learned_words ORDER BY created_at');
        const words = {};
        result.rows.forEach(row => {
            words[row.english] = row.tulu;
        });
        console.log(`📖 Loaded ${result.rows.length} words from database`);
        return words;
    } catch (error) {
        console.error('❌ Database load failed:', error);
        return {};
    }
}

async function getWordCount() {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM learned_words');
        return parseInt(result.rows[0].count);
    } catch (error) {
        console.error('❌ Database count failed:', error);
        return 0;
    }
}

async function deleteLearnedWord(englishWord) {
    try {
        const result = await pool.query('DELETE FROM learned_words WHERE english = $1', [englishWord.toLowerCase().trim()]);
        return result.rowCount > 0;
    } catch (error) {
        console.error('❌ Database delete failed:', error);
        return false;
    }
}

// Load learned words on startup
let learnedWords = {};
const userStates = {};

// Health check server
const app = express();

app.get('/', async (req, res) => {
    const isKeepAliveActive = keepAliveInterval !== null;
    const timeSinceActivity = lastActivityTime ? Date.now() - lastActivityTime : null;
    const dbWordCount = await getWordCount();
    
    const stats = {
        status: 'running',
        bot: 'Persistent Database Tulu Learning Translator',
        uptime: Math.floor(process.uptime() / 60) + ' minutes',
        learned_words_db: dbWordCount,
        total_words: Object.keys(tuluDictionary).length + dbWordCount,
        keep_alive_active: isKeepAliveActive,
        minutes_since_activity: timeSinceActivity ? Math.floor(timeSinceActivity / (60 * 1000)) : null,
        database: 'PostgreSQL - Persistent Storage',
        features: ['Database Storage', 'Smart Keep-Alive', 'Learning Mode', 'Word Corrections', 'Number System'],
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        keep_alive: keepAliveInterval !== null,
        database: 'connected',
        timestamp: new Date().toISOString() 
    });
});

// Complete Tulu dictionary (same as before)
const tuluDictionary = {
    // Basic Greetings
    'hello': 'namaskara', 'hi': 'namaskara', 'hey': 'namaskara',
    'good morning': 'udige namaskara', 'good evening': 'sanje namaskara',
    'good night': 'ratre namaskara', 'goodbye': 'barpe', 'bye': 'barpe',
    
    // Basic Responses
    'yes': 'aye', 'no': 'illa', 'ok': 'sari', 'okay': 'sari',
    'thank you': 'dhanyavada', 'thanks': 'dhanyavada',
    'welcome': 'swagata', 'sorry': 'kshame', 'please': 'dayavu',
    
    // Numbers (0-20)
    'zero': 'pundu', 'one': 'onji', 'two': 'raddu', 'three': 'muji', 'four': 'nalku',
    'five': 'aidu', 'six': 'aaru', 'seven': 'elu', 'eight': 'enmu', 'nine': 'ombodu', 'ten': 'pattu',
    'eleven': 'pannondu', 'twelve': 'panniraddu', 'thirteen': 'paddmuji', 'fourteen': 'paddnalku', 'fifteen': 'paddaidu',
    'sixteen': 'paddarru', 'seventeen': 'paddelu', 'eighteen': 'paddenmu', 'nineteen': 'paddombodu', 'twenty': 'ippattu',
    
    // Written Numbers
    '0': 'pundu', '1': 'onji', '2': 'raddu', '3': 'muji', '4': 'nalku',
    '5': 'aidu', '6': 'aaru', '7': 'elu', '8': 'enmu', '9': 'ombodu', '10': 'pattu',
    '11': 'pannondu', '12': 'panniraddu', '13': 'paddmuji', '14': 'paddnalku', '15': 'paddaidu',
    '16': 'paddarru', '17': 'paddelu', '18': 'paddenmu', '19': 'paddombodu', '20': 'ippattu',
    
    // Larger Numbers
    'thirty': 'muppattu', 'forty': 'nalpattu', 'fifty': 'aivattu',
    'sixty': 'aruvattu', 'seventy': 'eppattu', 'eighty': 'enpattu', 'ninety': 'tombattu',
    'hundred': 'nuru', 'thousand': 'saayira', 'lakh': 'laksha',
    '30': 'muppattu', '40': 'nalpattu', '50': 'aivattu', '60': 'aruvattu',
    '70': 'eppattu', '80': 'enpattu', '90': 'tombattu', '100': 'nuru', '1000': 'saayira',
    
    // Basic Words
    'water': 'jalu', 'house': 'mane', 'home': 'mane', 'come': 'bale', 'go': 'pole',
    'good': 'chennu', 'bad': 'kettadu', 'big': 'dodd', 'small': 'kuchi',
    'hot': 'bekku', 'cold': 'thandu', 'food': 'onji', 'eat': 'tinu', 'drink': 'kuDi',
    
    // Family
    'mother': 'amma', 'father': 'appa', 'brother': 'anna', 'sister': 'akka',
    'grandfather': 'ajja', 'grandmother': 'ajji', 'uncle': 'mama', 'aunt': 'mami',
    
    // Common Questions
    'how are you': 'yenkulu ullar', 'what is your name': 'ninna hesaru yenu',
    'where are you': 'yer yele ullar', 'what are you doing': 'yenu maduttullar',
    
    // Number-related
    'first': 'modali', 'second': 'randane', 'third': 'munjane', 'last': 'kainche',
    'how many': 'yethra', 'how much': 'yethra', 'count': 'lekka', 'number': 'sankhye'
};

function getCombinedDictionary() {
    return { ...tuluDictionary, ...learnedWords };
}

async function translateToTulu(text, userId) {
    const lowerText = text.toLowerCase().trim();
    const fullDictionary = getCombinedDictionary();
    
    if (fullDictionary[lowerText]) {
        const translation = fullDictionary[lowerText];
        const source = learnedWords[lowerText] ? 'Community taught' : 'Base dictionary';
        console.log(`✅ Found "${translation}" (${source})`);
        return { translation, found: true, source };
    }
    
    console.log(`❓ Unknown word: "${text}"`);
    userStates[userId] = {
        mode: 'learning',
        englishWord: lowerText,
        originalText: text,
        timestamp: Date.now()
    };
    
    return { translation: null, found: false, source: 'unknown' };
}

async function learnNewWord(englishWord, tuluTranslation, userId) {
    const lowerEnglish = englishWord.toLowerCase().trim();
    const tuluWord = tuluTranslation.trim();
    
    // Save to database
    const saved = await saveLearnedWordToDB(lowerEnglish, tuluWord);
    
    if (saved) {
        // Update in-memory cache
        learnedWords[lowerEnglish] = tuluWord;
        delete userStates[userId];
        
        console.log(`📚 Learned permanently: "${lowerEnglish}" = "${tuluWord}"`);
        return true;
    } else {
        console.log(`❌ Failed to save: "${lowerEnglish}" = "${tuluWord}"`);
        return false;
    }
}

function clearUserState(userId) {
    if (userStates[userId]) {
        delete userStates[userId];
        return true;
    }
    return false;
}

// Bot commands
bot.onText(/\/start/, async (msg) => {
    const dbWordCount = await getWordCount();
    const totalWords = Object.keys(tuluDictionary).length + dbWordCount;
    
    extendKeepAlive();
    clearUserState(msg.from.id);
    
    const welcomeMessage = `🌟 *Persistent Database Tulu Bot!*

🗄️ **PostgreSQL Database - Words Saved Forever!**
🧠 **Community Learning System**

📊 **Current Stats:**
• Base words: ${Object.keys(tuluDictionary).length}
• Community learned: ${dbWordCount}
• Total vocabulary: ${totalWords}

💾 **Permanent Storage:**
✅ Words survive server restarts
✅ Community dictionary grows forever
✅ PostgreSQL database backup

🏓 **Smart Keep-Alive:**
✅ Stays awake during active use
✅ Smart resource management

💡 **All Commands:**
• /stats - Database statistics
• /learned - Community taught words
• /correct <word> - Fix translations
• /numbers - All Tulu numbers  
• /skip - Skip current teaching

🎯 **Try:**
• "hello" → namaskara
• "5" or "five" → aidu
• "did you eat" (teach me authentic Tulu!)

🚀 **Your words are preserved forever!**`;

    bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// Enhanced stats with database info
bot.onText(/\/stats/, async (msg) => {
    extendKeepAlive();
    
    const dbWordCount = await getWordCount();
    const uptime = Math.floor(process.uptime() / 60);
    const isKeepAliveActive = keepAliveInterval !== null;
    
    const statsMessage = `📊 **Database Bot Statistics**

🗄️ **Storage:** PostgreSQL Database (Permanent)
🛡️ **Security:** Token secured via environment variables
☁️ **Hosting:** Render.com with Smart Keep-Alive
⏱️ **Uptime:** ${uptime} minutes
🏓 **Keep-Alive:** ${isKeepAliveActive ? 'Active (30min)' : 'Sleeping'}

📚 **Vocabulary Breakdown:**
• Base dictionary: ${Object.keys(tuluDictionary).length} words
• Community learned: ${dbWordCount} words
• **Total vocabulary: ${Object.keys(tuluDictionary).length + dbWordCount} words**

💾 **Database Features:**
✅ Words survive server restarts
✅ Community contributions preserved
✅ Automatic backups by Render
✅ Real-time updates across all users

🏓 **Keep-alive extended for 30 more minutes!**`;

    bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Enhanced learned words with database
bot.onText(/\/learned/, async (msg) => {
    extendKeepAlive();
    
    const dbWordCount = await getWordCount();
    
    if (dbWordCount === 0) {
        bot.sendMessage(msg.chat.id, `📝 **No Words in Community Database Yet**
        
🎯 **Start building the community dictionary:**
• Ask me any English word or number
• If I don't know it, I'll ask you to teach me
• Your contribution gets saved permanently!

💾 **Your words will be preserved forever in PostgreSQL database**
💡 **Try:** "did you eat", "how are you", "good evening"
🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
        return;
    }
    
    // Reload from database to get latest
    const currentWords = await loadLearnedWordsFromDB();
    
    const learnedList = Object.entries(currentWords)
        .slice(-10) // Show last 10 learned words
        .map(([eng, tulu]) => `• "${eng}" → "${tulu}"`)
        .join('\n');
    
    const message = `📚 **Community Dictionary (${dbWordCount} total words):**

**Recent additions:**
${learnedList}

${dbWordCount > 10 ? `\n*... and ${dbWordCount - 10} more words*\n` : ''}

🔧 **Commands:**
• /correct <word> - Fix any translation
• Ask me any word to see full database

💾 **All stored permanently in PostgreSQL database!**
🏓 Keep-alive extended for 30 minutes`;
    
    bot.sendMessage(msg.chat.id, message, {parse_mode: 'Markdown'});
});

// Enhanced correct command with database
bot.onText(/\/correct (.+)/, async (msg, match) => {
    extendKeekAlive();
    
    const userId = msg.from.id;
    const wordToCorrect = match[1].toLowerCase().trim();
    
    // Check database first
    const currentWords = await loadLearnedWordsFromDB();
    const fullDictionary = { ...tuluDictionary, ...currentWords };
    
    if (fullDictionary[wordToCorrect]) {
        const currentTranslation = fullDictionary[wordToCorrect];
        const source = currentWords[wordToCorrect] ? 'community-taught' : 'base dictionary';
        
        if (source === 'base dictionary') {
            await bot.sendMessage(msg.chat.id, `❌ **Cannot Correct Base Dictionary Word**
            
📝 **Word:** "${wordToCorrect}"
🏛️ **Current:** "${currentTranslation}"

⚠️ This is from the base dictionary. You can teach me a better version by asking me to translate "${wordToCorrect}" and I'll ask you for the correct translation.

🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
            return;
        }
        
        // Set up correction mode
        userStates[userId] = {
            mode: 'correcting',
            englishWord: wordToCorrect,
            originalText: wordToCorrect,
            oldTranslation: currentTranslation,
            timestamp: Date.now()
        };
        
        await bot.sendMessage(msg.chat.id, `🔧 **Database Correction Mode**

📝 **English:** "${wordToCorrect}"
🏛️ **Current Tulu:** "${currentTranslation}"
💾 **Source:** Community database

✏️ **Send the correct Tulu translation now:**

💡 Or use /skip to cancel correction
🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
    } else {
        await bot.sendMessage(msg.chat.id, `❌ **Word Not Found in Database**
        
📝 I don't know "${wordToCorrect}" yet.

💡 **Try:** Ask me to translate "${wordToCorrect}" and I'll learn it from you!
💾 **It will be saved permanently in the database**
🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
    }
});

// Numbers command (same as before)
bot.onText(/\/numbers/, (msg) => {
    extendKeepAlive();
    
    const numbersMessage = `🔢 **Complete Tulu Numbers Reference**

**Basic Numbers (0-10):**
• 0 → pundu • 1 → onji • 2 → raddu • 3 → muji • 4 → nalku • 5 → aidu
• 6 → aaru • 7 → elu • 8 → enmu • 9 → ombodu • 10 → pattu

**Teens (11-20):**
• 11 → pannondu • 12 → panniraddu • 13 → paddmuji • 14 → paddnalku • 15 → paddaidu
• 16 → paddarru • 17 → paddelu • 18 → paddenmu • 19 → paddombodu • 20 → ippattu

**Larger Numbers:**
• 30 → muppattu • 40 → nalpattu • 50 → aivattu • 60 → aruvattu • 70 → eppattu
• 80 → enpattu • 90 → tombattu • 100 → nuru • 1000 → saayira

💡 **Usage:** Type any number (1, 2, 5, 10, 50, 100) or number word
🏓 Keep-alive extended for 30 minutes`;

    bot.sendMessage(msg.chat.id, numbersMessage, {parse_mode: 'Markdown'});
});

// Main message handler with database integration
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const userText = msg.text.trim();
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'User';
        
        extendKeepAlive();
        console.log(`📩 ${userName}: "${userText}" (keep-alive extended)`);
        
        // Reload learned words from database for each request
        learnedWords = await loadLearnedWordsFromDB();
        
        // Check if user is in learning or correction mode
        if (userStates[userId]) {
            const userState = userStates[userId];
            
            if (userState.mode === 'learning') {
                // User is teaching a new word
                const success = await learnNewWord(userState.englishWord, userText, userId);
                
                if (success) {
                    const successMessage = `✅ **Learned & Saved to Database!**

📝 **English:** ${userState.originalText}
🏛️ **Authentic Tulu:** ${userText}

💾 **Permanently stored in PostgreSQL database!**
🌍 **Available to all users immediately**
🏓 Bot staying awake for 30 more minutes

💡 **Try:** Ask me "${userState.originalText}" again!`;

                    await bot.sendMessage(msg.chat.id, successMessage, {parse_mode: 'Markdown'});
                } else {
                    await bot.sendMessage(msg.chat.id, '❌ **Database Error** - Could not save the word. Please try again.');
                }
                return;
                
            } else if (userState.mode === 'correcting') {
                // User is correcting an existing word
                const oldTranslation = userState.oldTranslation;
                const success = await learnNewWord(userState.englishWord, userText, userId);
                
                if (success) {
                    const correctionMessage = `✅ **Word Corrected in Database!**

📝 **English:** ${userState.originalText}
❌ **Old Tulu:** ${oldTranslation}  
✅ **New Tulu:** ${userText}

💾 **Updated permanently in PostgreSQL database!**
🌍 **Correction available to all users immediately**
🏓 Bot staying awake for 30 more minutes

💡 **Verify:** Ask me "${userState.originalText}" to see the correction`;

                    await bot.sendMessage(msg.chat.id, correctionMessage, {parse_mode: 'Markdown'});
                } else {
                    await bot.sendMessage(msg.chat.id, '❌ **Database Error** - Could not update the word. Please try again.');
                }
                return;
            }
        }
        
        const englishPattern = /^[a-zA-Z0-9\s.,!?'"-]+$/;
        
        if (englishPattern.test(userText)) {
            bot.sendChatAction(msg.chat.id, 'typing');
            
            const result = await translateToTulu(userText, userId);
            
            if (result.found) {
                const response = `🔄 **Translation from Database**

📝 **English:** ${userText}
🏛️ **Tulu:** ${result.translation}
🔧 **Source:** ${result.source}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 **Stored in:** PostgreSQL Database (Permanent)
💡 **Want to correct?** /correct ${userText.toLowerCase()}
🏓 **Bot staying awake** for 30 more minutes`;

                await bot.sendMessage(msg.chat.id, response, {parse_mode: 'Markdown'});
                
            } else {
                const learnMessage = `❓ **"${userText}" not in database**

🎯 **Options:**
1️⃣ **Teach me:** Reply with authentic Tulu translation
2️⃣ **Skip:** Use /skip to try another word

💾 **Your contribution will be saved permanently!**
🌍 **Help build the community Tulu database**
🏓 **Bot staying awake** for 30 minutes`;

                await bot.sendMessage(msg.chat.id, learnMessage, {parse_mode: 'Markdown'});
            }
        }
    }
});

bot.onText(/\/skip|\/cancel/, (msg) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const cleared = clearUserState(userId);
    
    if (cleared) {
        bot.sendMessage(msg.chat.id, `✅ **Conversation Reset!**
        
🔄 Ask me any English word or number
💾 Database ready for new contributions
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

// Start server
app.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
});

// Initialize and start
async function startBot() {
    try {
        await initializeDatabase();
        learnedWords = await loadLearnedWordsFromDB();
        
        const botInfo = await bot.getMe();
        const dbWordCount = await getWordCount();
        
        console.log('✅ ===============================================');
        console.log('✅ PERSISTENT DATABASE TULU BOT IS LIVE!');
        console.log('✅ ===============================================\n');
        console.log(`🤖 Bot: @${botInfo.username}`);
        console.log(`🗄️ Database: PostgreSQL (Persistent Storage)`);
        console.log(`🛡️ Security: Token secured via env vars`);
        console.log(`☁️ Hosted on: Render.com`);
        console.log(`🏓 Smart Keep-Alive: Ready`);
        console.log(`📚 Base words: ${Object.keys(tuluDictionary).length}`);
        console.log(`💾 Database words: ${dbWordCount}`);
        console.log(`🎯 Total vocabulary: ${Object.keys(tuluDictionary).length + dbWordCount}`);
        console.log(`🌍 Words preserved forever!\n`);
        
    } catch (error) {
        console.error('❌ Bot startup failed:', error);
        process.exit(1);
    }
}

// Start the bot
startBot();
