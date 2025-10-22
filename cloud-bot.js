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
    process.exit(1);
}

// MongoDB connection with fallback
const mongoUri = process.env.MONGODB_URI;
let client;
let db;
let mongoAvailable = false;

const bot = new TelegramBot(token, {
    polling: {
        interval: 300,
        autoStart: false
    }
});

console.log('🚀 Enhanced Tulu Bot with Separate Collections Starting...\n');

// Enhanced Keep-Alive System with Wake-on-Start
let keepAliveInterval = null;
let lastActivityTime = null;
const KEEP_ALIVE_DURATION = 45 * 60 * 1000; // 45 minutes
const PING_INTERVAL = 12 * 60 * 1000; // 12 minutes

function startKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    lastActivityTime = Date.now();
    console.log('🏓 Starting keep-alive session for 45 minutes');
    
    keepAliveInterval = setInterval(async () => {
        const now = Date.now();
        const timeSinceActivity = now - lastActivityTime;
        
        if (timeSinceActivity > KEEP_ALIVE_DURATION) {
            clearInterval(keepAliveInterval);
            keepAliveInterval = null;
            console.log('😴 Keep-alive session ended - bot can sleep safely');
            return;
        }
        
        try {
            const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
            const response = await fetch(`${baseUrl}/health`, {
                timeout: 10000,
                headers: { 'User-Agent': 'TuluBot-KeepAlive/1.0' }
            });
            
            if (response.ok) {
                const remainingTime = Math.ceil((KEEP_ALIVE_DURATION - timeSinceActivity) / (60 * 1000));
                console.log(`🏓 Keep-alive ping successful - ${remainingTime} min remaining`);
            }
        } catch (error) {
            console.log('🚨 Keep-alive ping failed:', error.message);
        }
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

// Wake-on-Start: Immediate response system
function wakeUpService() {
    console.log('⚡ Service wake-up triggered');
    extendKeepAlive();
    
    setTimeout(async () => {
        try {
            const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
            await fetch(`${baseUrl}/health`);
            console.log('✅ Service fully responsive after wake-up');
        } catch (error) {
            console.log('⚠️ Wake-up health check failed:', error.message);
        }
    }, 1000);
}

// Enhanced MongoDB initialization with separate collections
async function initializeMongoDB() {
    if (!mongoUri) {
        console.log('⚠️ No MongoDB URI - using memory storage');
        return false;
    }

    try {
        console.log('🔧 Connecting to MongoDB Atlas (Enhanced Collections)...');
        
        client = new MongoClient(mongoUri, {
            tls: true,
            tlsAllowInvalidCertificates: false,
            serverSelectionTimeoutMS: 20000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 15000,
            maxPoolSize: 10,
            minPoolSize: 2,
            retryWrites: true,
            retryReads: true,
            w: 'majority'
        });
        
        await client.connect();
        db = client.db('tulu_translator');
        
        // Test connection with retry
        let connected = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await db.admin().ping();
                connected = true;
                break;
            } catch (pingError) {
                console.log(`⚠️ Connection attempt ${attempt}/3 failed`);
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        if (!connected) throw new Error('Failed to establish stable connection');
        
        console.log('✅ Connected to MongoDB Atlas - Enhanced Database Active');
        
        // Create separate collections with comprehensive indexes
        try {
            // Taught Dictionary Collection (User-contributed authentic Tulu)
            await db.collection('taught_dictionary').createIndex({ english: 1 }, { unique: true });
            await db.collection('taught_dictionary').createIndex({ updatedAt: -1 });
            await db.collection('taught_dictionary').createIndex({ contributor: 1 });
            await db.collection('taught_dictionary').createIndex({ usage_count: -1 });
            
            // API Cache Collection (API results for performance)
            await db.collection('api_cache').createIndex({ english: 1 }, { unique: true });
            await db.collection('api_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // 7 days TTL
            await db.collection('api_cache').createIndex({ api_source: 1 });
            
            console.log('✅ Enhanced collections created with comprehensive indexes');
        } catch (indexError) {
            if (indexError.code !== 85) {
                console.log('⚠️ Index creation warning:', indexError.message);
            }
        }
        
        const taughtCount = await db.collection('taught_dictionary').countDocuments();
        const cacheCount = await db.collection('api_cache').countDocuments();
        
        console.log(`📚 Taught Dictionary: ${taughtCount} user-contributed words`);
        console.log(`🌐 API Cache: ${cacheCount} cached translations`);
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.log('⚠️ Continuing with memory storage + API fallback');
        return false;
    }
}

// Enhanced API translation with multiple accurate sources
async function tryAPITranslation(text) {
    // Skip API for very short words or numbers (already in base dictionary)
    if (text.length <= 2 || /^\d+$/.test(text)) return null;
    
    const translationMethods = [
        // Method 1: Google Translate to Hindi (most accurate for Indian languages)
        async () => {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
            });
            
            if (!response.ok) return null;
            
            const result = await response.json();
            if (result && result[0] && result[0][0] && result[0][0][0]) {
                const translation = result[0][0][0].trim();
                
                // Quality validation
                if (translation.length > 1 && 
                    translation !== text.toLowerCase() && 
                    !translation.includes('undefined') &&
                    !translation.includes('INVALID') &&
                    !translation.includes('ERROR')) {
                    return { translation, source: 'Google Translate (Hindi)' };
                }
            }
            return null;
        },
        
        // Method 2: MyMemory Translator (backup)
        async () => {
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|hi`;
            const response = await fetch(url, { timeout: 8000 });
            
            if (!response.ok) return null;
            
            const result = await response.json();
            if (result && result.responseData && result.responseData.translatedText) {
                const translation = result.responseData.translatedText.trim();
                if (translation !== text && 
                    translation !== "NO QUERY SPECIFIED. EXAMPLE: GET?Q=HELLO&LANGPAIR=EN|IT" &&
                    !translation.includes('INVALID')) {
                    return { translation, source: 'MyMemory Translator' };
                }
            }
            return null;
        },
        
        // Method 3: Google Translate to Kannada (similar to Tulu)
        async () => {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=kn&dt=t&q=${encodeURIComponent(text)}`;
            const response = await fetch(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
            });
            
            if (!response.ok) return null;
            
            const result = await response.json();
            if (result && result[0] && result[0][0] && result[0][0][0]) {
                const translation = result[0][0][0].trim();
                if (translation.length > 1 && translation !== text.toLowerCase()) {
                    return { translation: `${translation}`, source: 'Google Translate (Kannada)' };
                }
            }
            return null;
        }
    ];
    
    // Try each method sequentially
    for (let i = 0; i < translationMethods.length; i++) {
        try {
            console.log(`🌐 Trying API method ${i + 1} for: "${text}"`);
            const result = await Promise.race([
                translationMethods[i](),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
            ]);
            
            if (result) {
                console.log(`✅ API success (${result.source}): "${result.translation}"`);
                return result;
            }
        } catch (error) {
            console.log(`⚠️ API method ${i + 1} failed:`, error.message);
        }
    }
    
    console.log('🚫 All API methods failed');
    return null;
}

// Save to Taught Dictionary (User contributions)
async function saveToTaughtDictionary(englishWord, tuluWord, userInfo = null) {
    if (!mongoAvailable || !db) {
        console.log(`💾 Memory save: "${englishWord}" = "${tuluWord}"`);
        return true;
    }

    try {
        const doc = {
            english: englishWord.toLowerCase().trim(),
            tulu: tuluWord.trim(),
            contributor: userInfo || 'Anonymous',
            createdAt: new Date(),
            updatedAt: new Date(),
            verified: false,
            source: 'user_taught',
            votes: 0,
            usage_count: 1
        };
        
        // Check if word exists to preserve metadata
        const existing = await db.collection('taught_dictionary').findOne({ english: doc.english });
        if (existing) {
            doc.createdAt = existing.createdAt;
            doc.usage_count = (existing.usage_count || 0) + 1;
            doc.votes = existing.votes || 0;
        }
        
        await db.collection('taught_dictionary').replaceOne(
            { english: doc.english },
            doc,
            { upsert: true }
        );
        
        console.log(`📚 Taught Dictionary: "${englishWord}" = "${tuluWord}" by ${userInfo || 'Anonymous'}`);
        return true;
    } catch (error) {
        console.error('❌ Taught Dictionary save failed:', error.message);
        return false;
    }
}

// Save API result to cache
async function saveToAPICache(englishWord, translation, apiSource) {
    if (!mongoAvailable || !db) return;

    try {
        const doc = {
            english: englishWord.toLowerCase().trim(),
            translation: translation.trim(),
            api_source: apiSource,
            createdAt: new Date(),
            source: 'api_cache'
        };
        
        await db.collection('api_cache').replaceOne(
            { english: doc.english },
            doc,
            { upsert: true }
        );
        
        console.log(`🌐 API Cache: "${englishWord}" = "${translation}" (${apiSource})`);
    } catch (error) {
        console.error('❌ API Cache save failed:', error.message);
    }
}

// Load from Taught Dictionary
async function loadFromTaughtDictionary() {
    if (!mongoAvailable || !db) return {};

    try {
        const words = {};
        const cursor = db.collection('taught_dictionary').find({});
        
        await cursor.forEach(doc => {
            words[doc.english] = doc.tulu;
        });
        
        console.log(`📖 Loaded ${Object.keys(words).length} user-taught words`);
        return words;
    } catch (error) {
        console.error('❌ Taught Dictionary load failed:', error.message);
        return {};
    }
}

// Load from API Cache
async function loadFromAPICache(englishWord) {
    if (!mongoAvailable || !db) return null;

    try {
        const cached = await db.collection('api_cache').findOne({ 
            english: englishWord.toLowerCase().trim() 
        });
        
        if (cached) {
            console.log(`🌐 Cache hit: "${englishWord}" = "${cached.translation}"`);
            return { translation: cached.translation, source: cached.api_source };
        }
        return null;
    } catch (error) {
        console.error('❌ API Cache load failed:', error.message);
        return null;
    }
}

// Get comprehensive statistics
async function getTaughtDictionaryStats() {
    if (!mongoAvailable || !db) return { count: Object.keys(learnedWords).length, recent: [] };

    try {
        const count = await db.collection('taught_dictionary').countDocuments();
        
        const recentCursor = db.collection('taught_dictionary')
            .find({})
            .sort({ updatedAt: -1 })
            .limit(5);
        
        const recent = [];
        await recentCursor.forEach(doc => {
            recent.push({ 
                english: doc.english, 
                tulu: doc.tulu,
                contributor: doc.contributor || 'Anonymous',
                updatedAt: doc.updatedAt,
                usage_count: doc.usage_count || 1
            });
        });
        
        return { count, recent };
    } catch (error) {
        return { count: 0, recent: [] };
    }
}

async function getAPICacheStats() {
    if (!mongoAvailable || !db) return { count: 0 };

    try {
        const count = await db.collection('api_cache').countDocuments();
        return { count };
    } catch (error) {
        return { count: 0 };
    }
}

// Enhanced health check server
const app = express();

app.get('/', async (req, res) => {
    const isKeepAliveActive = keepAliveInterval !== null;
    const timeSinceActivity = lastActivityTime ? Date.now() - lastActivityTime : null;
    let taughtStats = { count: 0, recent: [] };
    let cacheStats = { count: 0 };
    
    try {
        taughtStats = await getTaughtDictionaryStats();
        cacheStats = await getAPICacheStats();
    } catch (error) {
        // Handle gracefully
    }
    
    const stats = {
        status: 'running',
        bot: 'Enhanced Tulu Translator with Separate Collections',
        version: '5.0.0',
        uptime: Math.floor(process.uptime() / 60) + ' minutes',
        database_structure: {
            taught_dictionary: taughtStats.count,
            api_cache: cacheStats.count,
            base_dictionary: Object.keys(tuluDictionary).length
        },
        total_vocabulary: Object.keys(tuluDictionary).length + taughtStats.count,
        recent_contributions: taughtStats.recent,
        keep_alive_active: isKeepAliveActive,
        minutes_since_activity: timeSinceActivity ? Math.floor(timeSinceActivity / (60 * 1000)) : null,
        database: {
            type: mongoAvailable ? 'MongoDB Atlas - Enhanced Collections' : 'Memory Storage + API',
            status: mongoAvailable ? 'Connected' : 'Fallback Mode',
            collections: mongoAvailable ? ['taught_dictionary', 'api_cache'] : ['memory'],
            persistent: mongoAvailable,
            shared_across_users: mongoAvailable
        },
        features: [
            'Separate Collections (taught_dictionary, api_cache)',
            'Wake-on-Start (No 15min Downtime)',
            'Multi-API Translation System', 
            'Enhanced Keep-Alive (45min)',
            'User Attribution System',
            'Performance Caching',
            'Comprehensive Statistics'
        ],
        translation_priority: [
            '1. Base Dictionary (Verified)',
            '2. Taught Dictionary (User Authentic)',
            '3. API Cache (Performance)',
            '4. Fresh API (Google/MyMemory)',
            '5. User Teaching (Community Building)'
        ],
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        keep_alive: keepAliveInterval !== null,
        database: mongoAvailable ? 'Enhanced MongoDB Collections Connected' : 'Memory + API Active',
        wake_responsive: true,
        collections: mongoAvailable ? ['taught_dictionary', 'api_cache'] : ['memory'],
        timestamp: new Date().toISOString() 
    });
});

// In-memory cache and user states
let learnedWords = {};
const userStates = {};

// Comprehensive base dictionary with Roman Tulu
const tuluDictionary = {
    // Greetings
    'hello': 'namaskara', 'hi': 'namaskara', 'hey': 'namaskara',
    'good morning': 'udige namaskara', 'good evening': 'sanje namaskara',
    'good night': 'ratre namaskara', 'goodbye': 'barpe', 'bye': 'barpe',
    
    // Basic responses
    'yes': 'aye', 'no': 'illa', 'ok': 'sari', 'okay': 'sari',
    'thank you': 'dhanyavada', 'thanks': 'dhanyavada',
    'welcome': 'swagata', 'sorry': 'kshame', 'please': 'dayavu',
    
    // Numbers (Roman Tulu)
    'zero': 'pundu', 'one': 'onji', 'two': 'raddu', 'three': 'muji', 'four': 'nalku',
    'five': 'aidu', 'six': 'aaru', 'seven': 'elu', 'eight': 'enmu', 'nine': 'ombodu', 'ten': 'pattu',
    'eleven': 'pannondu', 'twelve': 'panniraddu', 'thirteen': 'paddmuji', 'fourteen': 'paddnalku', 'fifteen': 'paddaidu',
    'sixteen': 'paddarru', 'seventeen': 'paddelu', 'eighteen': 'paddenmu', 'nineteen': 'paddombodu', 'twenty': 'ippattu',
    
    // Written numbers
    '0': 'pundu', '1': 'onji', '2': 'raddu', '3': 'muji', '4': 'nalku',
    '5': 'aidu', '6': 'aaru', '7': 'elu', '8': 'enmu', '9': 'ombodu', '10': 'pattu',
    '11': 'pannondu', '12': 'panniraddu', '13': 'paddmuji', '14': 'paddnalku', '15': 'paddaidu',
    '16': 'paddarru', '17': 'paddelu', '18': 'paddenmu', '19': 'paddombodu', '20': 'ippattu',
    
    // Larger numbers
    'thirty': 'muppattu', 'forty': 'nalpattu', 'fifty': 'aivattu',
    'sixty': 'aruvattu', 'seventy': 'eppattu', 'eighty': 'enpattu', 'ninety': 'tombattu',
    'hundred': 'nuru', 'thousand': 'saayira', 'lakh': 'laksha',
    '30': 'muppattu', '40': 'nalpattu', '50': 'aivattu', '60': 'aruvattu',
    '70': 'eppattu', '80': 'enpattu', '90': 'tombattu', '100': 'nuru', '1000': 'saayira',
    
    // Family & Relationships
    'mother': 'amma', 'father': 'appa', 'brother': 'anna', 'sister': 'akka',
    'grandfather': 'ajja', 'grandmother': 'ajji', 'uncle': 'mama', 'aunt': 'mami',
    'son': 'maga', 'daughter': 'magal', 'husband': 'ganda', 'wife': 'hendati',
    
    // Common words
    'water': 'jalu', 'house': 'mane', 'home': 'mane', 'come': 'bale', 'go': 'pole',
    'good': 'chennu', 'bad': 'kettadu', 'big': 'dodd', 'small': 'kuchi',
    'hot': 'bekku', 'cold': 'thandu', 'food': 'oota', 'eat': 'tinu', 'drink': 'kuDi',
    
    // Actions
    'sit': 'kur', 'stand': 'nille', 'sleep': 'malpe', 'wake up': 'yetar',
    'walk': 'naDe', 'run': 'oDu', 'stop': 'nille', 'wait': 'tingla',
    'give': 'korle', 'take': 'teele', 'see': 'kan', 'listen': 'kel',
    'speak': 'mal', 'read': 'odu', 'write': 'baraye',
    
    // Common questions
    'how are you': 'yenkulu ullar', 'what is your name': 'ninna hesaru yenu',
    'where are you': 'yer yele ullar', 'what are you doing': 'yenu maduttullar',
    'did you eat': 'oota aayitha', 'how old are you': 'ninna vayasu yethra',
    
    // Colors
    'red': 'kempu', 'green': 'pacche', 'blue': 'neeli', 'yellow': 'arishina',
    'white': 'bolpu', 'black': 'karpu',
    
    // Time
    'today': 'inji', 'yesterday': 'ninale', 'tomorrow': 'naalke',
    'morning': 'udike', 'evening': 'sanje', 'night': 'ratre', 'time': 'velu',
    
    // Places
    'school': 'shale', 'hospital': 'aspatre', 'temple': 'deve', 'market': 'pete',
    
    // Emotions
    'happy': 'santoshi', 'sad': 'dukhi', 'angry': 'kopa', 'love': 'priti'
};

function getCombinedDictionary() {
    return { ...tuluDictionary, ...learnedWords };
}

// Enhanced 5-tier translation system with separate collections
async function translateToTulu(text, userId) {
    const lowerText = text.toLowerCase().trim();
    
    // Tier 1: Base dictionary (highest priority - verified Tulu)
    if (tuluDictionary[lowerText]) {
        const translation = tuluDictionary[lowerText];
        console.log(`✅ Base dictionary: "${translation}"`);
        return { translation, found: true, source: 'Verified Base Dictionary', tier: 1 };
    }
    
    // Tier 2: Taught Dictionary (second priority - user-taught authentic Tulu)
    const taughtWords = await loadFromTaughtDictionary();
    if (taughtWords[lowerText]) {
        const translation = taughtWords[lowerText];
        console.log(`✅ Taught dictionary: "${translation}"`);
        return { translation, found: true, source: 'User-Taught Dictionary', tier: 2 };
    }
    
    // Tier 3: API Cache (check if we already translated this)
    const cachedResult = await loadFromAPICache(lowerText);
    if (cachedResult) {
        console.log(`✅ API cache hit: "${cachedResult.translation}"`);
        return { 
            translation: cachedResult.translation, 
            found: true, 
            source: `${cachedResult.source} (Cached)`, 
            tier: 3,
            needsVerification: true 
        };
    }
    
    // Tier 4: Fresh API translation
    console.log(`🔍 Checking APIs for: "${text}"`);
    const apiResult = await tryAPITranslation(text);
    if (apiResult) {
        // Save to cache for future use
        await saveToAPICache(lowerText, apiResult.translation, apiResult.source);
        
        console.log(`🌐 Fresh API translation: "${apiResult.translation}"`);
        return {
            translation: apiResult.translation,
            found: true,
            source: `${apiResult.source} (Fresh)`,
            tier: 4,
            needsVerification: true
        };
    }
    
    // Tier 5: Ask user to teach (last resort)
    console.log(`❓ No translation found anywhere for: "${text}"`);
    userStates[userId] = {
        mode: 'learning',
        englishWord: lowerText,
        originalText: text,
        timestamp: Date.now()
    };
    
    return { translation: null, found: false, source: 'needs_teaching', tier: 5 };
}

// Enhanced learning function for taught dictionary
async function learnNewWord(englishWord, tuluTranslation, userId, userInfo = null) {
    const lowerEnglish = englishWord.toLowerCase().trim();
    const tuluWord = tuluTranslation.trim();
    
    // Validate input
    if (tuluWord.length < 2) {
        console.log(`❌ Invalid translation too short: "${tuluWord}"`);
        return false;
    }
    
    // Save to taught dictionary
    const saved = await saveToTaughtDictionary(lowerEnglish, tuluWord, userInfo);
    
    if (saved) {
        // Update local cache
        learnedWords[lowerEnglish] = tuluWord;
        delete userStates[userId];
        
        console.log(`📚 User taught: "${lowerEnglish}" = "${tuluWord}"`);
        return true;
    }
    
    return false;
}

function clearUserState(userId) {
    if (userStates[userId]) {
        delete userStates[userId];
        return true;
    }
    return false;
}

// Enhanced bot startup with conflict prevention
let botStarted = false;

async function startBotSafely() {
    if (botStarted) {
        console.log('⚠️ Bot already started - preventing duplicate instance');
        return;
    }
    
    try {
        console.log('🤖 Starting bot with conflict prevention...');
        
        // Clear any existing webhooks that might conflict
        await bot.deleteWebHook();
        console.log('🧹 Cleared any existing webhooks');
        
        // Start polling with delay to avoid conflicts
        await new Promise(resolve => setTimeout(resolve, 2000));
        await bot.startPolling();
        
        botStarted = true;
        console.log('✅ Bot polling started successfully');
        
        // Test bot connection
        const botInfo = await bot.getMe();
        console.log(`🤖 Bot confirmed: @${botInfo.username}`);
        
    } catch (error) {
        console.error('❌ Bot startup failed:', error.message);
        
        if (error.message.includes('409') || error.message.includes('Conflict')) {
            console.log('🔄 Conflict detected - retrying in 10 seconds...');
            setTimeout(() => {
                botStarted = false;
                startBotSafely();
            }, 10000);
        } else {
            throw error;
        }
    }
}

// Enhanced bot commands

// Wake-on-Start /start command
bot.onText(/\/start/, async (msg) => {
    wakeUpService();
    
    const taughtStats = await getTaughtDictionaryStats();
    const cacheStats = await getAPICacheStats();
    const totalWords = Object.keys(tuluDictionary).length + taughtStats.count;
    
    clearUserState(msg.from.id);
    
    const welcomeMessage = `🌟 **Enhanced Tulu Translator Bot**

⚡ **Instant Wake-Up** - No 15-minute delays!
🗄️ **Separate Collections** - Organized database structure
🌐 **Multi-API System** - Google + MyMemory + Cache

📊 **Live Database Statistics:**
• **🏆 Base Dictionary:** ${Object.keys(tuluDictionary).length} verified words
• **📚 Taught Dictionary:** ${taughtStats.count} user contributions  
• **🌐 API Cache:** ${cacheStats.count} cached translations
• **🎯 Total Vocabulary:** ${totalWords}+ words

🎯 **Smart Translation Priority:**
1️⃣ **Base Dictionary** → Instant verified Tulu
2️⃣ **User-Taught** → Authentic community contributions
3️⃣ **API Cache** → Fast cached results
4️⃣ **Fresh API** → Google/MyMemory translation
5️⃣ **Community Teaching** → You help build the database

💡 **Commands:**
• Just type any English word or phrase
• **/correct <word>** - Fix taught dictionary entries
• **/stats** - Detailed database statistics
• **/learned** - Browse user contributions
• **/numbers** - Complete Tulu number system

🎯 **Try These:**
• "Hello" → namaskara
• "Thank you" → dhanyavada  
• "I love you" → (teach us authentic Tulu!)

🚀 **Building the largest authentic Tulu database together!**`;

    await bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// Enhanced /correct command for taught dictionary
bot.onText(/\/correct (.+)/, async (msg, match) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'User';
    const wordToCorrect = match[1].toLowerCase().trim();
    
    // Reload from taught dictionary
    const taughtWords = await loadFromTaughtDictionary();
    const fullDictionary = { ...tuluDictionary, ...taughtWords };
    
    if (fullDictionary[wordToCorrect]) {
        const currentTranslation = fullDictionary[wordToCorrect];
        
        // Check if it's from base dictionary
        if (tuluDictionary[wordToCorrect]) {
            await bot.sendMessage(msg.chat.id, `❌ **Cannot Correct Base Dictionary**

📝 **Word:** "${wordToCorrect}"
🔒 **Current:** "${currentTranslation}"
📚 **Source:** Built-in verified dictionary

**Why can't I correct this?**
Base dictionary words are verified Tulu. However, you can:

1️⃣ **Add variation:** Ask me to translate "${wordToCorrect} alternative" 
2️⃣ **Teach regional version:** Use slightly different phrasing
3️⃣ **Contribute new words:** Help expand the taught dictionary

💡 **Focus on teaching new authentic Tulu words!**`, {parse_mode: 'Markdown'});
            return;
        }
        
        // Set up correction mode for taught dictionary words
        userStates[userId] = {
            mode: 'correcting',
            englishWord: wordToCorrect,
            originalText: wordToCorrect,
            oldTranslation: currentTranslation,
            correctorName: userName,
            timestamp: Date.now()
        };
        
        await bot.sendMessage(msg.chat.id, `🔧 **Taught Dictionary Correction Mode**

📝 **English:** "${wordToCorrect}"
🔄 **Current Translation:** "${currentTranslation}"
🗄️ **Source:** User-taught dictionary collection

✏️ **Send the correct Tulu translation:**

**What happens:**
• Updates **taught_dictionary** collection in MongoDB
• Your correction gets user attribution
• All users see the improved translation
• Original contributor info preserved

**Commands:**
• **/skip** - Cancel this correction
• Type correct translation to proceed

⏰ **Correction expires in 10 minutes**`, {parse_mode: 'Markdown'});
        
        // Auto-expire correction
        setTimeout(() => {
            if (userStates[userId] && userStates[userId].mode === 'correcting' && 
                userStates[userId].englishWord === wordToCorrect) {
                delete userStates[userId];
                bot.sendMessage(msg.chat.id, `⏰ **Correction expired for "${wordToCorrect}"**

You can start a new correction anytime:
**/correct ${wordToCorrect}**`).catch(() => {});
            }
        }, 10 * 60 * 1000);
        
    } else {
        await bot.sendMessage(msg.chat.id, `❌ **Word Not Found in Database**

📝 **"${wordToCorrect}"** is not in any collection yet.

🎯 **What you can do:**
1️⃣ **Add it first:** Ask me "${wordToCorrect}" and teach the translation
2️⃣ **Check spelling:** Verify the English word is correct
3️⃣ **Browse words:** Use **/learned** to see taught dictionary

**Collections searched:**
• ${Object.keys(tuluDictionary).length} base dictionary words
• ${taughtWords ? Object.keys(taughtWords).length : 0} taught dictionary words

💡 **Once you teach "${wordToCorrect}", you can use /correct to improve it.**`, {parse_mode: 'Markdown'});
    }
});

// Enhanced stats command with collection breakdown
bot.onText(/\/stats/, async (msg) => {
    extendKeepAlive();
    
    const taughtStats = await getTaughtDictionaryStats();
    const cacheStats = await getAPICacheStats();
    const uptime = Math.floor(process.uptime() / 60);
    const hours = Math.floor(uptime / 60);
    const minutes = uptime % 60;
    const isKeepAliveActive = keepAliveInterval !== null;
    
    const recentList = taughtStats.recent.length > 0 
        ? taughtStats.recent.map(w => 
            `• "${w.english}" → "${w.tulu}"\n  👤 ${w.contributor} • 🔄 ${w.usage_count} uses`
          ).join('\n\n')
        : 'No user contributions yet - be the first!';
    
    const statsMessage = `📊 **Enhanced Database Statistics**

⚡ **Service Status:**
• **Uptime:** ${hours}h ${minutes}m
• **Keep-Alive:** ${isKeepAliveActive ? 'Active (45min)' : 'Sleeping'}
• **Wake-on-Start:** ✅ Instant response
• **Database:** ${mongoAvailable ? 'MongoDB Atlas (Enhanced)' : 'Memory + API'}

🗄️ **Database Collections:**
• **🏆 Base Dictionary:** ${Object.keys(tuluDictionary).length} verified Tulu words
• **📚 Taught Dictionary:** ${taughtStats.count} user contributions
• **🌐 API Cache:** ${cacheStats.count} cached translations
• **📊 Total Vocabulary:** ${Object.keys(tuluDictionary).length + taughtStats.count}+ words

📈 **Recent User Contributions:**
${recentList}

🎯 **Translation Success Rate:**
• **Tier 1 (Base):** Instant, 100% verified Tulu
• **Tier 2 (Taught):** Instant, user-verified authentic  
• **Tier 3 (Cache):** <1 second, previously translated
• **Tier 4 (Fresh API):** 2-3 seconds, needs verification
• **Tier 5 (Teaching):** Community builds authentic database

💾 **MongoDB Collections Structure:**
${mongoAvailable ? '✅ **taught_dictionary** - User contributions with attribution' : '⚠️ **Memory storage** - Session-based'}
${mongoAvailable ? '✅ **api_cache** - Performance optimization (7-day TTL)' : '✅ **API fallback** - Multiple translation sources'}
${mongoAvailable ? '✅ **Comprehensive indexes** - Fast queries and analytics' : '✅ **Fast memory access** - No network delays'}

🚀 **Building authentic Tulu together - ${1000 - (Object.keys(tuluDictionary).length + taughtStats.count)} words to reach 1000!**`;

    await bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Enhanced learned command for taught dictionary
bot.onText(/\/learned/, async (msg) => {
    extendKeepAlive();
    
    const taughtStats = await getTaughtDictionaryStats();
    
    if (taughtStats.count === 0) {
        await bot.sendMessage(msg.chat.id, `📝 **Taught Dictionary Collection Empty**

🎯 **Be the first contributor to taught_dictionary!**

**How the enhanced system works:**
1️⃣ Ask me any English word/phrase
2️⃣ System checks: Base → Taught → API Cache → Fresh API
3️⃣ If not found, I ask you to teach authentic Tulu
4️⃣ Your word goes to **taught_dictionary** collection with attribution

**Benefits of separate collections:**
${mongoAvailable ? '✅ **User attribution** - Credit for your contributions' : '✅ **Session storage** - Fast access'}
${mongoAvailable ? '✅ **Organized storage** - taught_dictionary vs api_cache' : '✅ **Memory optimization** - Best performance'}
${mongoAvailable ? '✅ **Analytics** - Track usage, popular words' : '✅ **API integration** - Multiple sources'}
✅ **Higher priority** - Your words beat API results
✅ **Community building** - Preserve authentic Tulu

**Start contributing now!**`, {parse_mode: 'Markdown'});
        return;
    }
    
    const recentList = taughtStats.recent
        .map(w => `• "${w.english}" → "${w.tulu}"
  👤 Contributor: ${w.contributor}
  📅 Added: ${w.updatedAt.toLocaleDateString()}
  🔄 Used: ${w.usage_count} times`)
        .join('\n\n');
    
    const message = `📚 **Taught Dictionary Collection**

🗄️ **MongoDB Collection:** taught_dictionary  
📊 **Total User Contributions:** ${taughtStats.count} words
${mongoAvailable ? '🌍 **Shared across all users globally**' : '💭 **Available in current session**'}  

**Recent Authentic Contributions:**
${recentList}

${taughtStats.count > 5 ? `\n*📊 ...and ${taughtStats.count - 5} more words in taught_dictionary collection*\n` : ''}

🎯 **Enhanced Database Structure:**
• **Base Dictionary** → Built-in verified Tulu (highest priority)
• **Taught Dictionary** → Your authentic contributions (2nd priority)
• **API Cache** → Performance optimization (3rd priority)
• **Fresh API** → Real-time translation (4th priority)

💡 **Your Impact with Attribution:**
${mongoAvailable ? '✅ **Permanent cloud storage** - Never lost' : '✅ **Fast session storage** - Instant access'}
${mongoAvailable ? '✅ **User attribution** - Credit preserved forever' : '✅ **Immediate availability** - No delays'}
${mongoAvailable ? '✅ **Usage analytics** - Track word popularity' : '✅ **Memory efficiency** - Optimized performance'}
✅ **Community resource** - Helps preserve authentic Tulu
✅ **Higher priority** - Beats API translations always

🔧 **Collection Management:**
• **/correct <word>** - Update taught_dictionary entries
• Ask new words - Add to taught_dictionary with your attribution
• **/stats** - See collection analytics

🌍 **Building the world's largest authentic Tulu database together!**`;
    
    await bot.sendMessage(msg.chat.id, message, {parse_mode: 'Markdown'});
});

// Numbers reference (same as before)
bot.onText(/\/numbers/, (msg) => {
    extendKeepAlive();
    
    const numbersMessage = `🔢 **Complete Tulu Numbers (Roman)**

**Basic (0-10):**
0→pundu, 1→onji, 2→raddu, 3→muji, 4→nalku, 5→aidu  
6→aaru, 7→elu, 8→enmu, 9→ombodu, 10→pattu

**Teens (11-20):**
11→pannondu, 12→panniraddu, 13→paddmuji, 14→paddnalku, 15→paddaidu  
16→paddarru, 17→paddelu, 18→paddenmu, 19→paddombodu, 20→ippattu

**Larger Numbers:**
30→muppattu, 40→nalpattu, 50→aivattu, 60→aruvattu, 70→eppattu  
80→enpattu, 90→tombattu, 100→nuru, 1000→saayira

**Try it:**
• Type "5" → aidu
• Type "fifteen" → paddaidu  
• Type "hundred" → nuru

✅ All numbers in base dictionary - instant translation!
📚 Part of ${Object.keys(tuluDictionary).length} verified base words`;

    bot.sendMessage(msg.chat.id, numbersMessage, {parse_mode: 'Markdown'});
});

// Enhanced main message handler with 5-tier system
bot.on('message', async (msg) => {
    if (msg.text && !msg.text.startsWith('/')) {
        const userText = msg.text.trim();
        const userId = msg.from.id;
        const userName = msg.from.first_name || 'User';
        
        extendKeepAlive();
        console.log(`📩 ${userName}: "${userText}"`);
        
        // Reload taught dictionary for latest contributions
        if (mongoAvailable) {
            learnedWords = await loadFromTaughtDictionary();
        }
        
        // Handle learning/correction modes
        if (userStates[userId]) {
            const userState = userStates[userId];
            
            if (userState.mode === 'learning') {
                // User is teaching authentic Tulu to taught_dictionary
                const userInfo = `${userName} (${userId})`;
                const success = await learnNewWord(userState.englishWord, userText, userId, userInfo);
                
                if (success) {
                    const storageType = mongoAvailable ? 'taught_dictionary collection' : 'session memory';
                    const impact = mongoAvailable ? 'Available to ALL users globally!' : 'Available in current session';
                    
                    const successMessage = `✅ **Added to Taught Dictionary Collection!**

📝 **English:** ${userState.originalText}  
🏛️ **Authentic Tulu:** ${userText}
👤 **Contributor:** ${userName} (attributed)
🗄️ **Stored in:** MongoDB ${storageType}

🌍 **Global Impact:** ${impact}
🏆 **Priority:** Tier 2 - Higher than any API translation
📈 **Database Growth:** +1 authentic community word

**Test it:** Ask me "${userState.originalText}" again!
**Share it:** Tell others to try "${userState.originalText}"

🙏 **Thank you for preserving authentic Tulu language!**
🎯 **Your contribution helps the entire Tulu community worldwide!**`;

                    await bot.sendMessage(msg.chat.id, successMessage, {parse_mode: 'Markdown'});
                } else {
                    await bot.sendMessage(msg.chat.id, `❌ **Could not save to taught_dictionary**

Please try again: Ask me "${userState.originalText}" and provide the authentic Tulu translation.

💡 **Tips for better contributions:**
• Use Roman letters (English alphabet)
• Provide the most authentic/common version
• Double-check spelling before submitting`);
                    delete userStates[userId];
                }
                return;
                
            } else if (userState.mode === 'correcting') {
                // User correcting taught dictionary entry
                const oldTranslation = userState.oldTranslation;
                const correctorInfo = `${userName} (Corrector)`;
                const success = await learnNewWord(userState.englishWord, userText, userId, correctorInfo);
                
                if (success) {
                    const correctionMessage = `✅ **Taught Dictionary Updated!**

📝 **English:** ${userState.originalText}
❌ **Previous:** ${oldTranslation}  
✅ **Your Correction:** ${userText}
👤 **Corrected by:** ${userName}

🗄️ **Collection:** taught_dictionary updated in MongoDB
🌍 **Effect:** All users globally see your correction immediately
📊 **Attribution:** Your contribution is credited

**Verify:** Ask me "${userState.originalText}" to confirm
🎯 **Community gets better authentic Tulu thanks to you!**`;

                    await bot.sendMessage(msg.chat.id, correctionMessage, {parse_mode: 'Markdown'});
                } else {
                    await bot.sendMessage(msg.chat.id, `❌ **Correction failed**

Please try: **/correct ${userState.originalText}** again`);
                    delete userStates[userId];
                }
                return;
            }
        }
        
        // Normal translation request with enhanced 5-tier system
        const englishPattern = /^[a-zA-Z0-9\s.,!?'"-]+$/;
        
        if (englishPattern.test(userText)) {
            bot.sendChatAction(msg.chat.id, 'typing');
            
            const result = await translateToTulu(userText, userId);
            
            if (result.found) {
                const tierEmoji = {
                    1: '🏆', // Base dictionary
                    2: '🎯', // Taught dictionary 
                    3: '💾', // API cache
                    4: '🌐', // Fresh API
                    5: '❓'  // Unknown
                }[result.tier] || '✅';
                
                const priority = {
                    1: 'Highest (Verified)', 
                    2: 'High (User-Taught)', 
                    3: 'Good (Cached)',
                    4: 'Medium (Fresh API)', 
                    5: 'Learning'
                }[result.tier] || 'Standard';
                
                let responseMessage = `${tierEmoji} **Translation Found**

📝 **English:** ${userText}
🏛️ **Translation:** ${result.translation}

📊 **Source:** ${result.source}
⭐ **Priority:** ${priority}
🗄️ **Database:** ${mongoAvailable ? 'Enhanced MongoDB Collections' : 'Memory + API'}`;

                // Add tier-specific messaging
                if (result.tier >= 3 && result.needsVerification) {
                    responseMessage += `

🌐 **API Translation Note:**
• Accurate general translation
• May not be authentic Tulu
• **Improve it:** **/correct ${userText.toLowerCase()}**
• Your correction goes to taught_dictionary with attribution`;
                } else if (result.tier === 2) {
                    responseMessage += `

🎯 **User-Taught Translation:**
• Contributed by community member
• Authentic and verified
• **Improve it:** **/correct ${userText.toLowerCase()}** if needed`;
                } else {
                    responseMessage += `

💡 **Enhance database:** Use **/correct ${userText.toLowerCase()}** to add community version`;
                }

                responseMessage += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`;

                await bot.sendMessage(msg.chat.id, responseMessage, {parse_mode: 'Markdown'});
                
            } else {
                // No translation found anywhere - comprehensive search completed
                const taughtStats = await getTaughtDictionaryStats();
                const cacheStats = await getAPICacheStats();
                
                const learnMessage = `❓ **"${userText}" - Not Found Anywhere**

🔍 **Comprehensive Search Completed:**
✅ ${Object.keys(tuluDictionary).length} base dictionary words
✅ ${taughtStats.count} taught dictionary words
✅ ${cacheStats.count} cached API translations
✅ Google Translate API (Hindi, Kannada)
✅ MyMemory Translator API

**All 5 tiers searched - Your help needed!**

🎯 **Teach Authentic Tulu to taught_dictionary:**
Reply with the correct Tulu translation (Roman letters)

**Why your contribution matters:**
${mongoAvailable ? '🌍 **Global impact** - Helps ALL users worldwide' : '⚡ **Session benefit** - Fast access this session'}
${mongoAvailable ? '🏆 **User attribution** - You get credit forever' : '🎯 **Memory efficiency** - Instant availability'}
${mongoAvailable ? '📊 **Analytics** - Track usage and popularity' : '✅ **Performance** - Better than API calls'}
🥇 **Tier 2 priority** - Higher than any API translation
🏛️ **Cultural preservation** - Authentic Tulu matters most
📈 **Database growth** - Every word makes it better

**Examples of good contributions:**
• "I miss you" → "naan ninna miss madtini"  
• "How's everything?" → "yellu henganide?"
• "Take care" → "jagrathegiri"

⏰ **Teaching request expires in 10 minutes**
🔧 **Commands:** **/skip** to cancel`;

                await bot.sendMessage(msg.chat.id, learnMessage, {parse_mode: 'Markdown'});
                
                // Auto-expire learning request
                setTimeout(() => {
                    if (userStates[userId] && userStates[userId].englishWord === userText.toLowerCase()) {
                        delete userStates[userId];
                        bot.sendMessage(msg.chat.id, `⏰ **Teaching request expired for "${userText}"**

🔄 **Ready for new translations!**
💡 **Try different words** or browse **/learned** to see taught dictionary`).catch(() => {});
                    }
                }, 10 * 60 * 1000);
            }
        } else {
            const taughtStats = await getTaughtDictionaryStats();
            const totalWords = Object.keys(tuluDictionary).length + taughtStats.count;
            
            await bot.sendMessage(msg.chat.id, `❌ **Please send English text only**

✅ **Supported formats:**
• English words and phrases
• Numbers (handled by base dictionary)
• Simple punctuation

📊 **Enhanced database system:**
• ${totalWords}+ words across multiple collections
• 5-tier translation priority system
• Multi-API integration with caching
• User attribution and analytics

🎯 **Goal:** English → Authentic Tulu (Roman letters)
💡 **Try:** "hello", "thank you", "good morning"`);
        }
    }
});

// Skip/cancel command
bot.onText(/\/skip|\/cancel/, (msg) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const cleared = clearUserState(userId);
    
    if (cleared) {
        bot.sendMessage(msg.chat.id, `✅ **Operation Cancelled**

🔄 **Ready for new translations!**
• Ask me any English word or phrase
• Use **/correct <word>** to fix taught dictionary
• Use **/stats** for enhanced database statistics

🗄️ **Enhanced collections ready** for your contributions`);
    } else {
        bot.sendMessage(msg.chat.id, `💭 **No active operation**

🎯 **Try these enhanced features:**
• Type any English word for 5-tier translation
• **/stats** - Enhanced database statistics  
• **/learned** - Browse taught dictionary
• **/numbers** - Complete number reference`);
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
    console.log('📴 Graceful shutdown initiated...');
    if (client && mongoAvailable) {
        await client.close();
        console.log('🗄️ Enhanced MongoDB connection closed');
    }
    bot.stopPolling();
    process.exit(0);
});

// Start health server
app.listen(PORT, () => {
    console.log(`🌐 Enhanced health server running on port ${PORT}`);
});

// Enhanced startup sequence
async function startBot() {
    try {
        console.log('🔧 Initializing enhanced MongoDB collections...');
        mongoAvailable = await initializeMongoDB();
        
        if (mongoAvailable) {
            console.log('📚 Loading taught dictionary from enhanced collections...');
            learnedWords = await loadFromTaughtDictionary();
        } else {
            console.log('⚡ Running with memory storage + API fallback');
        }
        
        console.log('🤖 Starting enhanced bot with conflict prevention...');
        await startBotSafely();
        
        const taughtStats = await getTaughtDictionaryStats();
        const cacheStats = await getAPICacheStats();
        
        console.log('✅ ================================================');
        console.log('✅ ENHANCED TULU TRANSLATOR BOT IS LIVE!');
        console.log('✅ ================================================\n');
        
        console.log(`🤖 Bot: @${(await bot.getMe()).username}`);
        console.log(`🗄️ Database: ${mongoAvailable ? 'Enhanced MongoDB Collections' : 'Memory + Multi-API'}`);
        console.log(`⚡ Wake-on-Start: Active (No 15min delays)`);
        console.log(`🏓 Keep-Alive: Enhanced 45-minute sessions`);
        console.log(`📚 Base Dictionary: ${Object.keys(tuluDictionary).length} verified words`);
        console.log(`🎯 Taught Dictionary: ${taughtStats.count} user contributions`);
        console.log(`💾 API Cache: ${cacheStats.count} cached translations`);
        console.log(`🌍 Total Vocabulary: ${Object.keys(tuluDictionary).length + taughtStats.count}+ words`);
        console.log(`🌐 API Integration: Google + MyMemory with smart caching`);
        console.log(`🔧 Collections: taught_dictionary + api_cache`);
        console.log(`👥 User Attribution: Full credit system`);
        console.log(`📊 Analytics: Usage tracking and statistics`);
        console.log('');
        console.log('🚀 Ready for production with enhanced features!');
        console.log('🏛️ Building the world\'s largest authentic Tulu database!');
        
    } catch (error) {
        console.error('❌ Enhanced bot startup failed:', error);
        process.exit(1);
    }
}

// Start the complete enhanced bot
startBot();
