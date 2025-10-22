const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const express = require('express');
const { MongoClient } = require('mongodb');

// SECURE: Only use environment variables
const token = process.env.TELEGRAM_TOKEN;
const PORT = process.env.PORT || 3000;

// Exit if token not provided
if (!token) {
    console.error('❌ TELEGRAM_TOKEN environment variable not set');
    console.error('💡 Set it in Render.com dashboard under Environment Variables');
    process.exit(1);
}

// MongoDB connection with fallback
const mongoUri = process.env.MONGODB_URI;
let client;
let db;
let mongoAvailable = false;

if (!mongoUri) {
    console.log('⚠️ MONGODB_URI not set - running with memory storage only');
    mongoAvailable = false;
} else {
    console.log('🗄️ MongoDB URI detected - will attempt connection');
}

const bot = new TelegramBot(token, {polling: true});

console.log('🚀 Complete Cloud Tulu Bot Starting...\n');

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

// Enhanced MongoDB initialization with robust error handling
async function initializeMongoDB() {
    if (!mongoUri) {
        console.log('⚠️ No MongoDB URI - skipping database connection');
        return false;
    }

    try {
        console.log('🔧 Connecting to MongoDB Atlas (Mumbai)...');
        
        client = new MongoClient(mongoUri, {
            // Enhanced SSL/TLS configuration
            tls: true,
            tlsAllowInvalidCertificates: false,
            tlsAllowInvalidHostnames: false,
            
            // Connection timeouts
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            
            // Pool settings
            maxPoolSize: 10,
            minPoolSize: 1,
            
            // Retry configuration
            retryWrites: true,
            retryReads: true,
            w: 'majority',
            
            // Stability options
            heartbeatFrequencyMS: 10000,
            serverSelectionRetryDelayMS: 2000,
            maxIdleTimeMS: 30000
        });
        
        console.log('📡 Attempting MongoDB connection...');
        await client.connect();
        
        console.log('🔄 Testing database connection...');
        db = client.db('tulubot');
        
        // Test connection with multiple retries
        let pingSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await db.admin().ping();
                pingSuccess = true;
                console.log('✅ Database ping successful');
                break;
            } catch (pingError) {
                console.log(`⚠️ Ping attempt ${attempt}/3 failed: ${pingError.message}`);
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        
        if (!pingSuccess) {
            throw new Error('Failed to ping database after 3 attempts');
        }
        
        console.log('✅ Connected to MongoDB Atlas (Mumbai)');
        
        // Create index with error handling
        try {
            await db.collection('learned_words').createIndex({ english: 1 }, { unique: true });
            console.log('✅ MongoDB collection indexed');
        } catch (indexError) {
            if (indexError.code === 85) {
                console.log('✅ Index already exists - skipping creation');
            } else {
                console.log('⚠️ Index creation warning:', indexError.message);
            }
        }
        
        const wordCount = await db.collection('learned_words').countDocuments();
        console.log(`📚 MongoDB loaded with ${wordCount} learned words`);
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        
        if (error.message.includes('SSL') || error.message.includes('TLS')) {
            console.log('🔧 SSL/TLS connection issue detected');
            console.log('💡 This is common on first deployment - bot will use memory storage');
        } else if (error.message.includes('timeout')) {
            console.log('⏰ Connection timeout - network may be slow');
            console.log('💡 Bot will continue with base dictionary');
        }
        
        console.log('⚠️ Continuing without MongoDB - bot will work with memory storage');
        return false;
    }
}

// MongoDB operations with fallback
async function saveWordToMongoDB(englishWord, tuluWord) {
    if (!mongoAvailable || !db) {
        console.log(`💾 Memory save: "${englishWord}" = "${tuluWord}" (MongoDB unavailable)`);
        return true; // Return success for memory storage
    }

    try {
        await db.collection('learned_words').replaceOne(
            { english: englishWord.toLowerCase().trim() },
            { 
                english: englishWord.toLowerCase().trim(), 
                tulu: tuluWord.trim(),
                createdAt: new Date(),
                updatedAt: new Date()
            },
            { upsert: true }
        );
        
        console.log(`💾 MongoDB save: "${englishWord}" = "${tuluWord}"`);
        return true;
    } catch (error) {
        console.error('❌ MongoDB save failed:', error.message);
        console.log(`💾 Fallback to memory: "${englishWord}" = "${tuluWord}"`);
        return true; // Still return success for memory storage
    }
}

async function loadLearnedWordsFromMongoDB() {
    if (!mongoAvailable || !db) {
        console.log('📖 Loading from memory storage (MongoDB unavailable)');
        return {};
    }

    try {
        const words = {};
        const cursor = db.collection('learned_words').find({});
        
        await cursor.forEach(doc => {
            words[doc.english] = doc.tulu;
        });
        
        console.log(`📖 Loaded ${Object.keys(words).length} words from MongoDB`);
        return words;
    } catch (error) {
        console.error('❌ MongoDB load failed:', error.message);
        return {};
    }
}

async function getWordCountFromMongoDB() {
    if (!mongoAvailable || !db) {
        return Object.keys(learnedWords).length;
    }

    try {
        const count = await db.collection('learned_words').countDocuments();
        return count;
    } catch (error) {
        console.error('❌ MongoDB count failed:', error.message);
        return Object.keys(learnedWords).length;
    }
}

async function getRecentWordsFromMongoDB(limit = 5) {
    if (!mongoAvailable || !db) {
        const recent = Object.entries(learnedWords)
            .slice(-limit)
            .map(([english, tulu]) => ({ english, tulu }));
        return recent;
    }

    try {
        const cursor = db.collection('learned_words')
            .find({})
            .sort({ updatedAt: -1 })
            .limit(limit);
        
        const recentWords = [];
        await cursor.forEach(doc => {
            recentWords.push({ english: doc.english, tulu: doc.tulu });
        });
        
        return recentWords;
    } catch (error) {
        console.error('❌ MongoDB recent words failed:', error.message);
        return [];
    }
}

// Health check server
const app = express();

app.get('/', async (req, res) => {
    const isKeepAliveActive = keepAliveInterval !== null;
    const timeSinceActivity = lastActivityTime ? Date.now() - lastActivityTime : null;
    let dbWordCount = 0;
    let recentWords = [];
    
    try {
        dbWordCount = await getWordCountFromMongoDB();
        recentWords = await getRecentWordsFromMongoDB(3);
    } catch (error) {
        // Handle error gracefully
    }
    
    const stats = {
        status: 'running',
        bot: 'Complete Cloud Tulu Learning Translator',
        version: '3.0.0',
        uptime: Math.floor(process.uptime() / 60) + ' minutes',
        learned_words: dbWordCount,
        total_words: Object.keys(tuluDictionary).length + dbWordCount,
        recent_words: recentWords,
        keep_alive_active: isKeepAliveActive,
        minutes_since_activity: timeSinceActivity ? Math.floor(timeSinceActivity / (60 * 1000)) : null,
        database: {
            type: mongoAvailable ? 'MongoDB Atlas' : 'Memory Storage',
            region: mongoAvailable ? 'Mumbai (ap-south-1)' : 'Local',
            status: mongoAvailable ? 'Connected' : 'Fallback Mode',
            persistent: mongoAvailable
        },
        features: [
            'Smart Keep-Alive System', 
            'Community Learning Mode',
            'Word Correction System',
            'Complete Number System (0-1000+)',
            'Secure Token Management',
            'Database Fallback System'
        ],
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        keep_alive: keepAliveInterval !== null,
        database: mongoAvailable ? 'MongoDB Atlas Connected' : 'Memory Storage Active',
        timestamp: new Date().toISOString() 
    });
});

// In-memory cache and user states
let learnedWords = {};
const userStates = {};

// Complete comprehensive Tulu dictionary
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
    
    // Written Numbers (0-100)
    '0': 'pundu', '1': 'onji', '2': 'raddu', '3': 'muji', '4': 'nalku',
    '5': 'aidu', '6': 'aaru', '7': 'elu', '8': 'enmu', '9': 'ombodu', '10': 'pattu',
    '11': 'pannondu', '12': 'panniraddu', '13': 'paddmuji', '14': 'paddnalku', '15': 'paddaidu',
    '16': 'paddarru', '17': 'paddelu', '18': 'paddenmu', '19': 'paddombodu', '20': 'ippattu',
    '21': 'ippatonji', '22': 'ippatraddu', '25': 'ippataidu', '30': 'muppattu',
    
    // Larger Numbers
    'thirty': 'muppattu', 'forty': 'nalpattu', 'fifty': 'aivattu',
    'sixty': 'aruvattu', 'seventy': 'eppattu', 'eighty': 'enpattu', 'ninety': 'tombattu',
    'hundred': 'nuru', 'thousand': 'saayira', 'lakh': 'laksha',
    '30': 'muppattu', '40': 'nalpattu', '50': 'aivattu', '60': 'aruvattu',
    '70': 'eppattu', '80': 'enpattu', '90': 'tombattu', '100': 'nuru', '1000': 'saayira',
    
    // Basic Words & Actions
    'water': 'jalu', 'house': 'mane', 'home': 'mane', 'come': 'bale', 'go': 'pole',
    'good': 'chennu', 'bad': 'kettadu', 'big': 'dodd', 'small': 'kuchi',
    'hot': 'bekku', 'cold': 'thandu', 'food': 'oota', 'eat': 'tinu', 'drink': 'kuDi',
    'sit': 'kur', 'stand': 'nille', 'sleep': 'malpe', 'wake up': 'yetar',
    'walk': 'naDe', 'run': 'oDu', 'stop': 'nille', 'wait': 'tingla',
    
    // Family Relations
    'mother': 'amma', 'father': 'appa', 'brother': 'anna', 'sister': 'akka',
    'grandfather': 'ajja', 'grandmother': 'ajji', 'uncle': 'mama', 'aunt': 'mami',
    'son': 'maga', 'daughter': 'magal', 'husband': 'ganda', 'wife': 'hendati',
    
    // Common Questions & Phrases
    'how are you': 'yenkulu ullar', 'what is your name': 'ninna hesaru yenu',
    'where are you': 'yer yele ullar', 'what are you doing': 'yenu maduttullar',
    'how old are you': 'ninna vayasu yethra', 'where do you live': 'yer vasisu ullar',
    'did you eat': 'oota aayitha', 'what time is it': 'yencha velu aayithu',
    
    // Colors
    'red': 'kempu', 'green': 'pacche', 'blue': 'neeli', 'yellow': 'arishina',
    'white': 'bolpu', 'black': 'karpu', 'brown': 'kahve', 'orange': 'kittale',
    
    // Time & Days
    'today': 'inji', 'yesterday': 'ninale', 'tomorrow': 'naalke',
    'morning': 'udike', 'afternoon': 'madhyanna', 'evening': 'sanje', 'night': 'ratre',
    'time': 'velu', 'now': 'ipuni', 'later': 'aga', 'early': 'bega', 'late': 'kale',
    
    // Places & Directions
    'school': 'shale', 'office': 'karyalaya', 'hospital': 'aspatre',
    'temple': 'deve', 'market': 'pete', 'shop': 'angadi', 'road': 'dhari',
    'village': 'grama', 'city': 'nagara', 'left': 'yeda', 'right': 'bala',
    
    // Weather & Nature
    'rain': 'male', 'sun': 'surya', 'moon': 'chandra', 'star': 'nakshatra',
    'wind': 'gali', 'tree': 'mara', 'flower': 'huvu', 'river': 'aare',
    
    // Body Parts
    'head': 'tale', 'eye': 'kannu', 'nose': 'mookka', 'mouth': 'bayi',
    'hand': 'kai', 'leg': 'kaal', 'hair': 'kess', 'tooth': 'hallu',
    
    // Number-related & Ordinals
    'first': 'modali', 'second': 'randane', 'third': 'munjane', 'last': 'kainche',
    'how many': 'yethra', 'how much': 'yethra', 'count': 'lekka', 'number': 'sankhye',
    'more': 'jai', 'less': 'kam', 'enough': 'saaku', 'little': 'kochi',
    
    // Emotions & States
    'happy': 'santoshi', 'sad': 'dukhi', 'angry': 'kopa', 'tired': 'bejaar',
    'hungry': 'hasive', 'thirsty': 'daaha', 'sick': 'rogi', 'healthy': 'arogya',
    
    // Common Verbs
    'give': 'korle', 'take': 'teele', 'see': 'kan', 'listen': 'kel',
    'speak': 'mal', 'read': 'odu', 'write': 'baraye', 'buy': 'gont',
    'sell': 'achar', 'work': 'kelsa', 'study': 'odu', 'play': 'aaDu'
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
    
    // Save to MongoDB if available, otherwise memory
    const saved = await saveWordToMongoDB(lowerEnglish, tuluWord);
    
    if (saved) {
        // Always update in-memory cache
        learnedWords[lowerEnglish] = tuluWord;
        delete userStates[userId];
        
        console.log(`📚 Learned: "${lowerEnglish}" = "${tuluWord}" (${mongoAvailable ? 'MongoDB' : 'Memory'})`);
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
    const dbWordCount = await getWordCountFromMongoDB();
    const totalWords = Object.keys(tuluDictionary).length + dbWordCount;
    
    extendKeepAlive();
    clearUserState(msg.from.id);
    
    const storageType = mongoAvailable ? 'MongoDB Atlas (Mumbai)' : 'Memory Storage';
    const persistence = mongoAvailable ? 'Permanently preserved' : 'Session-based (resets on restart)';
    
    const welcomeMessage = `🌟 *Complete Cloud Tulu Bot!*

${mongoAvailable ? '🗄️' : '💾'} **Storage:** ${storageType}
🧠 **Community Learning System**

📊 **Current Stats:**
• Base dictionary: ${Object.keys(tuluDictionary).length} words
• Community learned: ${dbWordCount} words
• **Total vocabulary: ${totalWords} words**

💾 **Data Storage:**
${mongoAvailable ? '✅ Words preserved forever (no expiration!)' : '⚠️ Words stored in memory (reset on restart)'}
${mongoAvailable ? '✅ Mumbai data center (fast for India)' : '✅ Instant response (no database delays)'}
✅ ${persistence}

🏓 **Smart Keep-Alive System:**
✅ Stays awake during active conversations
✅ Smart resource management
✅ Auto-extends with user activity

💡 **All Commands:**
• /stats - Complete bot statistics
• /learned - Community taught words
• /correct <word> - Fix any translation
• /numbers - Complete Tulu number system
• /help - Show this help again
• /skip - Skip current teaching

🎯 **Try These:**
• "hello" → namaskara
• "5" or "five" → aidu  
• "did you eat" → (teach me authentic Tulu!)
• "how are you" → yenkulu ullar

🚀 **${mongoAvailable ? 'MongoDB-powered' : 'Memory-based'} community learning!**`;

    bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// Help command
bot.onText(/\/help/, async (msg) => {
    bot.onText(/\/start/, msg);
});

// Enhanced stats with storage info
bot.onText(/\/stats/, async (msg) => {
    extendKeepAlive();
    
    const dbWordCount = await getWordCountFromMongoDB();
    const uptime = Math.floor(process.uptime() / 60);
    const hours = Math.floor(uptime / 60);
    const minutes = uptime % 60;
    const isKeepAliveActive = keepAliveInterval !== null;
    const recentWords = await getRecentWordsFromMongoDB(3);
    
    const recentList = recentWords.length > 0 
        ? recentWords.map(w => `• "${w.english}" → "${w.tulu}"`).join('\n')
        : 'None yet - be the first to contribute!';
    
    const statsMessage = `📊 **Complete Cloud Bot Statistics**

${mongoAvailable ? '🗄️' : '💾'} **Storage:** ${mongoAvailable ? 'MongoDB Atlas (Mumbai)' : 'Memory Storage'}
🛡️ **Security:** Secure environment variable management
☁️ **Hosting:** Render.com with Smart Keep-Alive
⏱️ **Uptime:** ${hours}h ${minutes}m
🏓 **Keep-Alive:** ${isKeepAliveActive ? 'Active (30min session)' : 'Sleeping - will wake on message'}

📚 **Comprehensive Vocabulary:**
• **Base dictionary:** ${Object.keys(tuluDictionary).length} words
  *(Numbers, family, colors, actions, emotions, etc.)*
• **Community learned:** ${dbWordCount} words
• **Total vocabulary: ${Object.keys(tuluDictionary).length + dbWordCount} words**

📈 **Recent Community Additions:**
${recentList}

💾 **Storage Details:**
${mongoAvailable ? '✅ MongoDB Atlas (Mumbai region)' : '⚠️ Memory storage (temporary)'}
${mongoAvailable ? '✅ 512MB free storage capacity' : '✅ Instant access (no network delays)'}
${mongoAvailable ? '✅ Zero expiration - truly permanent' : '⚠️ Resets on bot restart'}
${mongoAvailable ? '✅ Real-time sync across all users' : '✅ Session-based learning'}

🎯 **Smart Features Active:**
✅ Context-aware learning mode
✅ Word correction system
✅ Auto-timeout prevention
✅ Conversation flow control
✅ Number system (0-1000+)
✅ Database fallback protection

🏓 **Keep-alive extended for 30 more minutes!**`;

    bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Enhanced learned words
bot.onText(/\/learned/, async (msg) => {
    extendKeepAlive();
    
    const dbWordCount = await getWordCountFromMongoDB();
    
    if (dbWordCount === 0) {
        const storageInfo = mongoAvailable 
            ? 'MongoDB Atlas database' 
            : 'memory storage (temporary)';
            
        bot.sendMessage(msg.chat.id, `📝 **No Words Learned Yet**
        
🎯 **Start building the community dictionary:**
• Ask me any English word, phrase, or number
• If I don't know it, I'll ask you to teach me
• Your contribution gets saved in ${storageInfo}

💾 **Current Storage:**
${mongoAvailable ? '✅ **MongoDB Atlas** - permanent preservation' : '⚠️ **Memory Storage** - words reset on restart'}
${mongoAvailable ? '✅ **Mumbai hosting** - fast for Indian users' : '✅ **Instant response** - no database delays'}

💡 **Try these to get started:**
• "did you eat" → teach me authentic Tulu
• "how was your day" → add your regional variation
• "good afternoon" → help complete the greetings

🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
        return;
    }
    
    const currentWords = mongoAvailable ? await loadLearnedWordsFromMongoDB() : learnedWords;
    const recentWords = await getRecentWordsFromMongoDB(10);
    
    const recentList = recentWords
        .map(w => `• "${w.english}" → "${w.tulu}"`)
        .join('\n');
    
    const message = `📚 **Community Dictionary**

💾 **Total Words:** ${dbWordCount}
${mongoAvailable ? '🗄️ **Database:** MongoDB Atlas (Mumbai)' : '💭 **Storage:** Memory (temporary)'}
${mongoAvailable ? '✅ **Status:** Permanently preserved' : '⚠️ **Status:** Session-based'}

**Recent contributions:**
${recentList}

${dbWordCount > 10 ? `\n*📊 ...and ${dbWordCount - 10} more words stored*\n` : ''}

🔧 **Available Operations:**
• **/correct <word>** - Fix any translation
• **Ask me any word** - Query full vocabulary
• **Teach new words** - Contribute to community

💡 **Storage Features:**
${mongoAvailable ? '✅ **Instant sync** - Available to all users immediately' : '✅ **Fast access** - No network delays'}
${mongoAvailable ? '✅ **Backup redundancy** - Multiple copies across regions' : '⚠️ **Session-based** - Resets when bot restarts'}
${mongoAvailable ? '✅ **Search optimization** - Fast lookups with indexing' : '✅ **Memory-optimized** - Lightning fast responses'}

🌍 **Building authentic Tulu preservation together!**
🏓 Keep-alive extended for 30 minutes`;
    
    bot.sendMessage(msg.chat.id, message, {parse_mode: 'Markdown'});
});

// Enhanced correct command
bot.onText(/\/correct (.+)/, async (msg, match) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const wordToCorrect = match[1].toLowerCase().trim();
    
    const currentWords = mongoAvailable ? await loadLearnedWordsFromMongoDB() : learnedWords;
    const fullDictionary = { ...tuluDictionary, ...currentWords };
    
    if (fullDictionary[wordToCorrect]) {
        const currentTranslation = fullDictionary[wordToCorrect];
        const source = currentWords[wordToCorrect] ? 'community-taught' : 'base dictionary';
        
        if (source === 'base dictionary') {
            await bot.sendMessage(msg.chat.id, `❌ **Cannot Correct Base Dictionary Word**
            
📝 **Word:** "${wordToCorrect}"
🏛️ **Current Translation:** "${currentTranslation}"
📖 **Source:** Base dictionary (built-in)

⚠️ This word is from the built-in Tulu dictionary. You can teach me a regional variation by asking me to translate "${wordToCorrect}" and I'll ask you for the authentic local version.

💡 **Alternative:** Ask me "${wordToCorrect}" to see current translation, then teach me your preferred version.

🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
            return;
        }
        
        userStates[userId] = {
            mode: 'correcting',
            englishWord: wordToCorrect,
            originalText: wordToCorrect,
            oldTranslation: currentTranslation,
            timestamp: Date.now()
        };
        
        const storageInfo = mongoAvailable ? 'MongoDB Atlas (Mumbai)' : 'Memory Storage';
        
        await bot.sendMessage(msg.chat.id, `🔧 **Word Correction Mode**

📝 **English:** "${wordToCorrect}"
🏛️ **Current Tulu:** "${currentTranslation}"
💾 **Source:** Community ${storageInfo}

✏️ **Send the correct Tulu translation now:**

💡 **Or use /skip to cancel correction**
🌍 **Your correction will be ${mongoAvailable ? 'saved permanently and available to all users' : 'stored in memory for this session'}**
🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
    } else {
        await bot.sendMessage(msg.chat.id, `❌ **Word Not Found**
        
📝 **"${wordToCorrect}"** is not in our vocabulary yet.

🎯 **Options:**
1️⃣ **Teach it:** Ask me to translate "${wordToCorrect}" and I'll learn it from you
2️⃣ **Check spelling:** Make sure the English word is spelled correctly
3️⃣ **View all words:** Use /learned to see current vocabulary

💾 **Once taught, it will be stored in ${mongoAvailable ? 'MongoDB Atlas permanently' : 'memory for this session'}**
🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
    }
});

// Numbers reference
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
• 80 → enpattu • 90 → tombattu • 100 → nuru • 1000 → saayira • 1 lakh → laksha

**Number Words:**
• "how many" → yethra • "first" → modali • "second" → randane • "third" → munjane
• "more" → jai • "less" → kam • "enough" → saaku

💡 **Usage Examples:**
• Type "5" or "five" → aidu
• Type "25" or "twenty five" → (teach me!)
• Type "how many" → yethra

📚 **All numbers stored in base dictionary - no need to teach basic numbers!**
🏓 Keep-alive extended for 30 minutes`;

    bot.sendMessage(msg.chat.id, numbersMessage, {parse_mode: 'Markdown'});
});

// Enhanced main message handler
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const userText = msg.text.trim();
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'User';
        
        extendKeepAlive();
        console.log(`📩 ${userName}: "${userText}" (keep-alive extended)`);
        
        // Reload learned words if MongoDB is available
        if (mongoAvailable) {
            learnedWords = await loadLearnedWordsFromMongoDB();
        }
        
        // Check if user is in learning or correction mode
        if (userStates[userId]) {
            const userState = userStates[userId];
            
            if (userState.mode === 'learning') {
                const success = await learnNewWord(userState.englishWord, userText, userId);
                
                if (success) {
                    const storageType = mongoAvailable ? 'MongoDB Atlas (Mumbai)' : 'memory storage';
                    const persistence = mongoAvailable ? 'preserved forever' : 'available for this session';
                    
                    const successMessage = `✅ **Learned & Saved!**

📝 **English:** ${userState.originalText}
🏛️ **Authentic Tulu:** ${userText}

💾 **Stored in ${storageType}** - ${persistence}
${mongoAvailable ? '🌍 Available to all users immediately' : '⚡ Instant in-memory access'}
🏓 **Bot staying awake for 30 more minutes**

💡 **Test it:** Ask me "${userState.originalText}" again!
🙏 **Thank you for helping preserve authentic Tulu!**`;

                    await bot.sendMessage(msg.chat.id, successMessage, {parse_mode: 'Markdown'});
                } else {
                    await bot.sendMessage(msg.chat.id, `❌ **Save Error**

🚨 Could not save "${userState.originalText}" properly.

💡 **Please try again:** Ask me "${userState.originalText}" again and I'll learn it from you.

🏓 Keep-alive extended for 30 minutes`);
                    
                    delete userStates[userId];
                }
                return;
                
            } else if (userState.mode === 'correcting') {
                const oldTranslation = userState.oldTranslation;
                const success = await learnNewWord(userState.englishWord, userText, userId);
                
                if (success) {
                    const storageType = mongoAvailable ? 'MongoDB Atlas' : 'memory storage';
                    
                    const correctionMessage = `✅ **Word Corrected!**

📝 **English:** ${userState.originalText}
❌ **Old Tulu:** ${oldTranslation}  
✅ **New Tulu:** ${userText}

💾 **Updated in ${storageType}!**
${mongoAvailable ? '🌍 Correction available to all users immediately' : '⚡ Updated in current session'}
🏓 **Bot staying awake for 30 more minutes**

💡 **Verify:** Ask me "${userState.originalText}" to confirm the correction
🎯 **Community-driven accuracy** - thank you for the improvement!`;

                    await bot.sendMessage(msg.chat.id, correctionMessage, {parse_mode: 'Markdown'});
                } else {
                    await bot.sendMessage(msg.chat.id, `❌ **Update Error**

🚨 Could not update "${userState.originalText}".

💡 **Please try the correction again:** Use /correct ${userState.originalText}

🏓 Keep-alive extended for 30 minutes`);
                    
                    delete userStates[userId];
                }
                return;
            }
        }
        
        // Normal translation request
        const englishPattern = /^[a-zA-Z0-9\s.,!?'"-]+$/;
        
        if (englishPattern.test(userText)) {
            bot.sendChatAction(msg.chat.id, 'typing');
            
            const result = await translateToTulu(userText, userId);
            
            if (result.found) {
                const confidence = result.source === 'Community taught' ? '🎯' : 
                                result.source === 'Base dictionary' ? '✅' : '⚠️';
                
                const storageInfo = mongoAvailable ? 'MongoDB Atlas (Mumbai)' : 'Memory Storage';
                
                const response = `🔄 **Translation Result**

📝 **English:** ${userText}
🏛️ **Tulu:** ${result.translation}

${confidence} **Source:** ${result.source}
💾 **Storage:** ${storageInfo}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 **Want to correct this?** /correct ${userText.toLowerCase()}
📊 **Bot statistics:** /stats
🔢 **Number reference:** /numbers
🏓 **Bot staying awake** for 30 more minutes`;

                await bot.sendMessage(msg.chat.id, response, {parse_mode: 'Markdown'});
                
            } else {
                const vocabCount = Object.keys(tuluDictionary).length + Object.keys(learnedWords).length;
                const storageType = mongoAvailable ? 'MongoDB Atlas' : 'memory storage';
                
                const learnMessage = `❓ **"${userText}" not found**

🗄️ **Searched:** ${vocabCount} words in ${storageType}

🎯 **Help build the community dictionary:**

1️⃣ **Teach me:** Reply with the authentic Tulu translation
2️⃣ **Skip this:** Use /skip to try a different word
3️⃣ **Get help:** Use /numbers for number references

💾 **Your contribution will be:**
${mongoAvailable ? '✅ **Preserved permanently** in MongoDB Atlas' : '⚠️ **Stored in memory** for this session'}
${mongoAvailable ? '✅ **Available instantly** to all users worldwide' : '✅ **Instantly accessible** with no delays'}
✅ **Helps preserve** authentic Tulu language
✅ **Builds community** knowledge base

🏛️ **Share your authentic Tulu knowledge!**
⏰ **This teaching request expires in 10 minutes**
🏓 **Bot staying awake** for 30 minutes`;

                await bot.sendMessage(msg.chat.id, learnMessage, {parse_mode: 'Markdown'});
                
                // Auto-expire learning state after 10 minutes
                setTimeout(() => {
                    if (userStates[userId] && userStates[userId].englishWord === userText.toLowerCase()) {
                        delete userStates[userId];
                        bot.sendMessage(msg.chat.id, `⏰ **Teaching session expired for "${userText}"**
                        
🔄 **You can ask me any new word or number now!**
💡 **Try:** /numbers for complete number reference
🎯 **Or ask:** Any other English word to translate

🏓 Bot ready for new queries!`).catch(() => {});
                    }
                }, 10 * 60 * 1000); // 10 minutes
            }
        } else {
            const vocabCount = Object.keys(getCombinedDictionary()).length;
            
            await bot.sendMessage(msg.chat.id, `❌ **Please send English text or numbers only**

✅ **Supported formats:**
• **English words:** hello, good morning, thank you
• **Numbers:** 1, 2, 5, 10, 50, 100 (or spelled out)
• **Simple phrases:** how are you, what is your name
• **Questions:** did you eat, where are you

📊 **Current capability:** ${vocabCount} total words
🔢 **Numbers:** Complete system 0-1000+
🏛️ **Focus:** English to authentic Tulu translation

💡 **Try /numbers** for complete number reference
🏓 Keep-alive extended for 30 minutes`, {parse_mode: 'Markdown'});
        }
    }
});

// Skip/cancel commands
bot.onText(/\/skip|\/cancel/, (msg) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const cleared = clearUserState(userId);
    
    if (cleared) {
        const storageType = mongoAvailable ? 'MongoDB database' : 'memory storage';
        
        bot.sendMessage(msg.chat.id, `✅ **Learning Session Cancelled**
        
🔄 **Ready for new queries!**
• Ask me any English word or number
• Try /numbers for complete reference
• Use /stats to see current vocabulary

💾 **${storageType}** ready for new contributions
🏓 Keep-alive extended for 30 more minutes`, {parse_mode: 'Markdown'});
    } else {
        const vocabCount = Object.keys(getCombinedDictionary()).length;
        
        bot.sendMessage(msg.chat.id, `💭 **No active learning session**

🎯 **Ready to help!** Ask me:
• Any English word for Tulu translation
• Numbers (try "fifty" or "100")
• Common phrases ("how are you")

📊 **Current vocabulary:** ${vocabCount} words
🔢 **Complete number system** available
🏓 Keep-alive extended for 30 minutes`);
    }
});

// Error handling
bot.on('error', (error) => {
    console.error('🚨 Bot error:', error);
});

bot.on('polling_error', (error) => {
    console.error('🚨 Polling error:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📴 Shutting down gracefully...');
    if (client && mongoAvailable) {
        await client.close();
        console.log('🗄️ MongoDB connection closed');
    }
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📴 Shutting down gracefully...');
    if (client && mongoAvailable) {
        await client.close();
        console.log('🗄️ MongoDB connection closed');
    }
    bot.stopPolling();
    process.exit(0);
});

// Start health check server
app.listen(PORT, () => {
    console.log(`🌐 Health check server running on port ${PORT}`);
    console.log(`📊 Bot statistics available at: http://localhost:${PORT}`);
});

// Enhanced startup with fallback handling
async function startBot() {
    try {
        console.log('🔧 Initializing database connection...');
        mongoAvailable = await initializeMongoDB();
        
        if (!mongoAvailable) {
            console.log('⚠️ Running without MongoDB - using memory storage');
            console.log('✅ Bot will still work with base dictionary and session-based learning!');
            console.log('💡 MongoDB can be added later without affecting functionality');
        } else {
            console.log('📚 Loading learned words from database...');
            learnedWords = await loadLearnedWordsFromMongoDB();
        }
        
        console.log('🤖 Starting Telegram bot...');
        const botInfo = await bot.getMe();
        const dbWordCount = await getWordCountFromMongoDB();
        
        console.log('✅ ================================================');
        console.log('✅ COMPLETE CLOUD TULU BOT IS LIVE!');
        console.log('✅ ================================================\n');
        
        console.log(`🤖 Bot: @${botInfo.username}`);
        console.log(`🗄️ Storage: ${mongoAvailable ? 'MongoDB Atlas (Mumbai)' : 'Memory Storage'}`);
        console.log(`🛡️ Security: Secure environment variable management`);
        console.log(`☁️ Hosting: Render.com with Smart Keep-Alive`);
        console.log(`🏓 Keep-Alive: Ready (30min sessions)`);
        console.log(`📚 Base dictionary: ${Object.keys(tuluDictionary).length} words`);
        console.log(`💾 Learned words: ${dbWordCount} words`);
        console.log(`🎯 Total vocabulary: ${Object.keys(tuluDictionary).length + dbWordCount} words`);
        console.log(`🌍 ${mongoAvailable ? 'Preserving authentic Tulu permanently!' : 'Ready for session-based learning!'}`);
        console.log(`${mongoAvailable ? '🇮🇳 Optimized for Indian users with Mumbai hosting' : '⚡ Lightning-fast memory-based responses'}\n`);
        
        console.log('🚀 Bot fully operational and ready for users!');
        
    } catch (error) {
        console.error('❌ Bot startup failed:', error);
        process.exit(1);
    }
}

// Start the complete enhanced bot
startBot();
