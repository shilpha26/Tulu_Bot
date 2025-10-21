const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const express = require('express');

// Environment variables for cloud deployment
const token = process.env.TELEGRAM_TOKEN || '8497161792:AAE6eth-gtYs2n3nU7cm2ygWsBa96CJWG2Y';
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(token, {polling: true});

console.log('🚀 Cloud-Ready Learning Tulu Bot Starting...\n');

// Health check server for Render.com
const app = express();

app.get('/', (req, res) => {
    const stats = {
        status: 'running',
        bot: 'Tulu Learning Translator',
        uptime: process.uptime(),
        learned_words: Object.keys(learnedWords).length,
        total_words: Object.keys(getCombinedDictionary()).length,
        timestamp: new Date().toISOString()
    };
    
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
    console.log(`📊 Bot stats available at: http://localhost:${PORT}`);
});

// File to store learned translations (cloud-persistent)
const LEARNED_WORDS_FILE = path.join(__dirname, 'learned_tulu.json');

// Load learned words from file
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

// Save learned words to file
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

// User states for learning mode
const userStates = {};

// Base dictionary
const tuluDictionary = {
    'hello': 'namaskara',
    'hi': 'namaskara', 
    'yes': 'aye',
    'no': 'illa',
    'water': 'jalu',
    'house': 'mane',
    'come': 'bale',
    'go': 'pole',
    'good': 'chennu',
    'bad': 'kettadu',
    'mother': 'amma',
    'father': 'appa'
};

// Combine base dictionary with learned words
function getCombinedDictionary() {
    return { ...tuluDictionary, ...learnedWords };
}

// Translation function with learning capability
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
    
    // Try API as fallback
    const apiResult = await tryAPITranslation(text);
    if (apiResult) {
        return {
            translation: apiResult,
            found: true,
            source: 'API (may not be authentic)'
        };
    }
    
    console.log(`❓ Unknown word: "${text}"`);
    userStates[userId] = {
        mode: 'learning',
        englishWord: lowerText,
        originalText: text
    };
    
    return {
        translation: null,
        found: false,
        source: 'unknown'
    };
}

// API fallback
async function tryAPITranslation(text) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tcy&dt=t&q=${encodeURIComponent(text)}`;
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result && result[0] && result[0][0] && result[0][0][0]) {
                const translation = result[0][0][0];
                if (translation.length > 2 && translation !== text.toLowerCase()) {
                    return translation;
                }
            }
        }
    } catch (error) {
        console.log(`API error: ${error.message}`);
    }
    return null;
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

// Bot commands
bot.onText(/\/start/, (msg) => {
    const learnedCount = Object.keys(learnedWords).length;
    const totalWords = Object.keys(getCombinedDictionary()).length;
    
    const welcomeMessage = `🌟 *Learning Tulu Translator Bot!*

☁️ **Now Running 24/7 on Render.com!**
🧠 **I Learn From You!**

📊 **Current Stats:**
• Base words: ${Object.keys(tuluDictionary).length}
• Learned from users: ${learnedCount}
• Total vocabulary: ${totalWords}

🎯 **How It Works:**
1. Send English text
2. If I don't know it, I'll ask you
3. Teach me the authentic Tulu
4. I'll remember forever!

💡 **Commands:**
• /stats - Learning progress
• /learned - Words you taught me
• /forget <word> - Remove a word

🚀 **Available 24/7 - Your laptop can be off!**

Try: "did you eat" (teach me authentic Tulu!)`;

    bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// Stats command
bot.onText(/\/stats/, (msg) => {
    const learnedCount = Object.keys(learnedWords).length;
    const totalWords = Object.keys(getCombinedDictionary()).length;
    const uptime = Math.floor(process.uptime() / 60);
    
    const statsMessage = `📊 **Cloud Bot Statistics**

☁️ **Hosting:** Render.com (24/7)
⏱️ **Uptime:** ${uptime} minutes
🧠 **Vocabulary:**
• Base dictionary: ${Object.keys(tuluDictionary).length} words
• Learned from users: ${learnedCount} words
• Total vocabulary: ${totalWords} words

📈 **Recent Additions:**
${Object.entries(learnedWords).slice(-5).map(([eng, tulu]) => `• "${eng}" → "${tulu}"`).join('\n') || 'None yet'}

🎯 **Running 24/7 - Keep teaching me!**`;

    bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Show learned words
bot.onText(/\/learned/, (msg) => {
    if (Object.keys(learnedWords).length === 0) {
        bot.sendMessage(msg.chat.id, '📝 No words learned yet. Teach me some authentic Tulu!');
        return;
    }
    
    const learnedList = Object.entries(learnedWords)
        .map(([eng, tulu]) => `• "${eng}" → "${tulu}"`)
        .join('\n');
    
    const message = `📚 **Words You Taught Me:**

${learnedList}

🎯 These are authentic Tulu words you've taught me!
☁️ Stored permanently on Render.com`;
    
    bot.sendMessage(msg.chat.id, message, {parse_mode: 'Markdown'});
});

// Forget word command
bot.onText(/\/forget (.+)/, (msg, match) => {
    const wordToForget = match[1].toLowerCase().trim();
    
    if (learnedWords[wordToForget]) {
        delete learnedWords[wordToForget];
        saveLearnedWords(learnedWords);
        bot.sendMessage(msg.chat.id, `✅ Forgot "${wordToForget}". You can teach me again!`);
    } else {
        bot.sendMessage(msg.chat.id, `❌ I don't have "${wordToForget}" in my learned words.`);
    }
});

// Main message handler
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const userText = msg.text.trim();
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'User';
        
        console.log(`📩 ${userName}: "${userText}"`);
        
        // Check if user is in learning mode
        if (userStates[userId] && userStates[userId].mode === 'learning') {
            const userState = userStates[userId];
            const englishWord = userState.englishWord;
            const originalText = userState.originalText;
            
            learnNewWord(englishWord, userText, userId);
            
            const successMessage = `✅ **Learned Successfully!**

📝 **English:** ${originalText}
🏛️ **Authentic Tulu:** ${userText}

🧠 Stored permanently in cloud!
☁️ Available 24/7 on Render.com

Try asking me "${originalText}" again!`;

            await bot.sendMessage(msg.chat.id, successMessage, {parse_mode: 'Markdown'});
            return;
        }
        
        // Normal translation request
        const englishPattern = /^[a-zA-Z\s.,!?'"-]+$/;
        
        if (englishPattern.test(userText)) {
            bot.sendChatAction(msg.chat.id, 'typing');
            
            const result = await translateToTulu(userText, userId);
            
            if (result.found) {
                const response = `🔄 **Translation Result**

📝 **English:** ${userText}
🏛️ **Tulu:** ${result.translation}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 **Source:** ${result.source}
☁️ **Running 24/7 on Render.com**`;

                await bot.sendMessage(msg.chat.id, response, {parse_mode: 'Markdown'});
                
            } else {
                const learnMessage = `❓ **I don't know "${userText}"**

🎯 **Teach me the authentic Tulu translation!**

Just reply with the correct Tulu word/phrase and I'll remember it forever on the cloud!

🏛️ Help me learn authentic Tulu from native speakers like you!`;

                await bot.sendMessage(msg.chat.id, learnMessage, {parse_mode: 'Markdown'});
            }
        }
    }
});

// Error handling for cloud deployment
bot.on('error', (error) => {
    console.error('Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    bot.stopPolling();
    process.exit(0);
});

bot.getMe().then(botInfo => {
    console.log('✅ ==========================================');
    console.log('✅ CLOUD TULU BOT IS RUNNING 24/7!');
    console.log('✅ ==========================================\n');
    console.log(`🤖 Bot: @${botInfo.username}`);
    console.log(`☁️ Hosted on: Render.com`);
    console.log(`📚 Base words: ${Object.keys(tuluDictionary).length}`);
    console.log(`🧠 Learned words: ${Object.keys(learnedWords).length}`);
    console.log(`🌐 Health check: Port ${PORT}`);
    console.log(`🎯 Available 24/7 - Laptop can be off!\n`);
});
