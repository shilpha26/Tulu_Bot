const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { MongoClient } = require('mongodb');
// require('dotenv').config();

// Use global fetch on Node 18+; fall back to node-fetch only if necessary
const fetch = (typeof global.fetch === 'function') 
    ? global.fetch 
    : (() => {
        try { return require('node-fetch'); } 
        catch (e) {
            console.error('❌ fetch is not available. Use Node 18+ or install node-fetch (CJS/Esm mismatch may occur).');
            process.exit(1);
        }
    })();

// Ensure AbortController is available (Node 18+ has it)
if (typeof global.AbortController === 'undefined') {
    try { global.AbortController = require('abort-controller'); } 
    catch (e) { console.warn('⚠️ AbortController not found; timeouts may not work reliably.'); }
}

// SECURE: Only use environment variables
const token = process.env.TELEGRAM_TOKEN;
const PORT = process.env.PORT || 3000;

// Exit if token not provided
if (!token) {
    console.error('❌ TELEGRAM_TOKEN environment variable not set');
    process.exit(1);
}

// MongoDB connection with OPTIMIZED settings
const mongoUri = process.env.MONGODB_URI;
let client;
let db;
let mongoAvailable = false;

const bot = new TelegramBot(token, {
    polling: {
        interval: 1000,  // OPTIMIZED: Increased from 300ms to 1000ms
        autoStart: false
    }
});

console.log('🚀 Performance-Optimized Tulu Bot Starting...\n');

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
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${baseUrl}/health`, {
                signal: controller.signal,
                headers: { 'User-Agent': 'TuluBot-KeepAlive/1.0' }
            });
            clearTimeout(timeout);
            
            if (response.ok) {
                const remainingTime = Math.ceil((KEEP_ALIVE_DURATION - timeSinceActivity) / (60 * 1000));
                console.log(`🏓 Keep-alive ping successful - ${remainingTime} min remaining`);
            }
        } catch (error) {
            console.log('🚨 Keep-alive ping failed:', (error && error.name === 'AbortError') ? 'timeout' : error.message);
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

// OPTIMIZED MongoDB initialization with reduced timeouts
async function initializeMongoDB() {
    if (!mongoUri) {
        console.log('⚠️ No MongoDB URI - using memory storage');
        return false;
    }

    try {
        console.log('🔧 Connecting to MongoDB Atlas (Optimized Settings)...');
        
        client = new MongoClient(mongoUri, {
            tls: true,
            tlsAllowInvalidCertificates: false,
            serverSelectionTimeoutMS: 5000,    // OPTIMIZED: Reduced from 20000
            socketTimeoutMS: 15000,            // OPTIMIZED: Reduced from 45000
            connectTimeoutMS: 5000,            // OPTIMIZED: Reduced from 15000
            maxPoolSize: 5,                    // OPTIMIZED: Reduced from 10
            minPoolSize: 1,                    // OPTIMIZED: Reduced from 2
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
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1000)); // OPTIMIZED: Reduced from 2000
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

// YOUR WORKING API METHOD - Corrected to use authentic Tulu (tcy)
async function tryAPITranslation(text) {
    // Skip API for very short words or numbers
    if (text.length <= 2 || /^\d+$/.test(text)) {
        console.log('🔍 Skipping API for short text/numbers:', text);
        return null;
    }
    
    console.log(`🔍 Attempting Tulu translation API for: "${text}"`);
    
    // Updated Google Translate API URL with proper parameters
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tcy&dt=t&dj=1&q=${encodeURIComponent(text)}`;
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        
        const response = await fetch(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9,tcy;q=0.8',
                'Origin': 'https://translate.google.com',
                'Referer': 'https://translate.google.com/'
            },
            signal: controller.signal
        });
        clearTimeout(timeout);
        
        if (!response.ok) {
            console.log(`🚫 API Error: Status ${response.status}`);
            return null;
        }
        
        const result = await response.json();
        console.log('API Response:', JSON.stringify(result).slice(0, 200)); // Debug log
        
        // Handle different response formats
        let translation = '';
        if (result.sentences && Array.isArray(result.sentences)) {
            translation = result.sentences
                .map(s => s.trans || '')
                .filter(Boolean)
                .join(' ')
                .trim();
        } else if (Array.isArray(result) && Array.isArray(result[0])) {
            translation = result[0]
                .map(part => Array.isArray(part) ? part[0] : '')
                .filter(Boolean)
                .join(' ')
                .trim();
        }
        
        // Reject empty or single character responses
        if (!translation || translation === 'ಈ' || translation.length <= 1) {
            console.log('🚫 Rejecting invalid/incomplete response:', translation);
            return null;
        }
        
        console.log(`✅ Valid translation received: "${translation}"`);
        return { translation, source: 'GoogleTranslate (tcy)' };
        
    } catch (error) {
        console.log(`🚫 API Error: ${error.name === 'AbortError' ? 'timeout' : error.message}`);
        return null;
    }
}

// OPTIMIZED cache system for taught dictionary
let taughtWordsCache = {};
let apiCache = {}; // <-- in-memory API cache for fallback mode
let lastCacheUpdate = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getCachedTaughtWords() {
    const now = Date.now();
    if (now - lastCacheUpdate > CACHE_DURATION || Object.keys(taughtWordsCache).length === 0) {
        taughtWordsCache = await loadFromTaughtDictionary();
        lastCacheUpdate = now;
        console.log(`📚 Taught dictionary cache refreshed: ${Object.keys(taughtWordsCache).length} words`);
    }
    return taughtWordsCache;
}

// Save to Taught Dictionary (User contributions)
async function saveToTaughtDictionary(englishWord, tuluWord, userInfo = null) {
    if (!mongoAvailable || !db) {
        console.log(`💾 Memory save: "${englishWord}" = "${tuluWord}"`);
        taughtWordsCache[englishWord.toLowerCase().trim()] = tuluWord.trim(); // Update local cache
        // Ensure runtime lookup used by handlers is also updated
        learnedWords[englishWord.toLowerCase().trim()] = tuluWord.trim();
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
        
        // Update local cache immediately
        taughtWordsCache[doc.english] = doc.tulu;
        
        console.log(`📚 Taught Dictionary: "${englishWord}" = "${tuluWord}" by ${userInfo || 'Anonymous'}`);
        return true;
    } catch (error) {
        console.error('❌ Taught Dictionary save failed:', error.message);
        return false;
    }
}

// Save API result to cache
async function saveToAPICache(englishWord, translation, apiSource) {
    // Don't cache empty or Kannada script responses
    if (!translation || /[\u0C80-\u0CFF]/.test(translation)) {
        console.log('🚫 Skipping cache for invalid/Kannada script response');
        return;
    }

    const key = englishWord.toLowerCase().trim();

    if (!mongoAvailable || !db) {
        // Memory-mode: store in in-process apiCache
        apiCache[key] = { 
            translation: translation.trim(), 
            source: apiSource, 
            createdAt: Date.now() 
        };
        console.log(`🌐 (memory) API Cache: "${englishWord}" = "${translation}" (${apiSource})`);
        return;
    }

    try {
        const doc = {
            english: key,
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
    const key = englishWord.toLowerCase().trim();

    if (!mongoAvailable || !db) {
        const mem = apiCache[key];
        if (mem && !(/[\u0C80-\u0CFF]/.test(mem.translation))) {
            console.log(`🌐 (memory) Cache hit: "${englishWord}" = "${mem.translation}"`);
            return { translation: mem.translation, source: mem.source || 'memory' };
        }
        return null;
    }

    try {
        const cached = await db.collection('api_cache').findOne({ 
            english: key
        });
        
        if (cached && !(/[\u0C80-\u0CFF]/.test(cached.translation))) {
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
    if (!mongoAvailable || !db) return { count: Object.keys(taughtWordsCache).length, recent: [] };

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
    if (!mongoAvailable || !db) {
        // Return in-memory apiCache count when DB unavailable
        return { count: Object.keys(apiCache).length };
    }

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
        bot: 'Authentic Tulu Translator with Performance Optimizations',
        version: '5.2.0',
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
            type: mongoAvailable ? 'MongoDB Atlas - Optimized Settings' : 'Memory Storage + API',
            status: mongoAvailable ? 'Connected' : 'Fallback Mode',
            collections: mongoAvailable ? ['taught_dictionary', 'api_cache'] : ['memory'],
            persistent: mongoAvailable,
            shared_across_users: mongoAvailable
        },
        api_strategy: 'Google Translate (tcy) → User Teaching for Authentic Tulu',
        optimizations: [
            'Reduced MongoDB Timeouts (5-15s)',
            'Smart Taught Dictionary Caching (5min)',
            'Optimized Polling (1000ms)',
            'Authentic Tulu API (tcy language code)',
            'User-Contribution Priority System'
        ],
        translation_priority: [
            '1. Base Dictionary (Verified Tulu)',
            '2. Cached Taught Dictionary (5min TTL)',
            '3. API Cache (Performance)',
            '4. Google Translate (tcy) → If no result, ask user',
            '5. User Teaching → Builds authentic database'
        ],
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        keep_alive: keepAliveInterval !== null,
        database: mongoAvailable ? 'Optimized MongoDB Collections Connected' : 'Memory + API Active',
        api_approach: 'Authentic Tulu (tcy) → User Teaching',
        performance_optimized: true,
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

// CORRECTED 5-tier translation system: Base → Taught → API Cache → Tulu API (tcy) → User Teaching
async function translateToTulu(text, userId) {
    const lowerText = text.toLowerCase().trim();
    
    // 1. First check Base dictionary (highest priority - verified Tulu)
    if (tuluDictionary[lowerText]) {
        const translation = tuluDictionary[lowerText];
        console.log(`✅ Base dictionary: "${translation}"`);
        return { 
            translation, 
            found: true, 
            source: 'Verified Base Dictionary', 
            tier: 1 
        };
    }
    
    // 2. Check Taught Dictionary
    const taughtWords = await getCachedTaughtWords();
    if (taughtWords[lowerText]) {
        const translation = taughtWords[lowerText];
        console.log(`✅ Taught dictionary (cached): "${translation}"`);
        return { 
            translation, 
            found: true, 
            source: 'User-Taught Dictionary', 
            tier: 2 
        };
    }

    // 3. Check API Cache
    const cachedResult = await loadFromAPICache(lowerText);
    if (cachedResult) {
        console.log(`💾 API Cache hit: "${cachedResult.translation}"`);
        return {
            translation: cachedResult.translation,
            found: true,
            source: `Cached ${cachedResult.source}`,
            tier: 3
        };
    }
    
    // 4. Try Google Translate API as last resort
    console.log(`🔍 Trying Google Translate Tulu API for: "${text}"`);
    const apiResult = await tryAPITranslation(text);
    if (apiResult && apiResult.translation) {
        // Save valid API result to cache
        await saveToAPICache(lowerText, apiResult.translation, apiResult.source);
        
        console.log(`🌐 Fresh API translation: "${apiResult.translation}"`);
        return {
            translation: apiResult.translation,
            found: true,
            source: apiResult.source,
            tier: 4,
            needsVerification: true
        };
    }
    
    // 5. No translation found after trying everything - Ask user to teach
    console.log(`🎯 No translation found for: "${text}" - requesting user contribution`);
    userStates[userId] = {
        mode: 'learning',
        englishWord: lowerText,
        originalText: text,
        timestamp: Date.now()
    };
    
    return { 
        translation: null, 
        found: false, 
        source: 'needs_teaching', 
        tier: 5 
    };
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
        
        console.log(`📚 User taught authentic Tulu: "${lowerEnglish}" = "${tuluWord}"`);
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
        console.log('✅ Bot polling started successfully (Optimized: 1000ms interval)');
        
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
    
    const welcomeMessage = `🌟 **Authentic Tulu Translator Bot v5.2**

⚡ **Performance + Authenticity Optimized!**
🚀 **Instant Wake-Up** - No delays!
🏛️ **Authentic Tulu Focus** - Real Tulu, not substitutes
🌐 **Smart API Strategy** - Google Translate (tcy) → User Teaching

📊 **Live Database Statistics:**
• **🏆 Base Dictionary:** ${Object.keys(tuluDictionary).length} verified words
• **📚 Taught Dictionary:** ${taughtStats.count} authentic user contributions  
• **🌐 API Cache:** ${cacheStats.count} cached translations
• **🎯 Total Vocabulary:** ${totalWords}+ words

🎯 **Authentic Translation Strategy:**
1️⃣ **Base Dictionary** → Instant verified Tulu
2️⃣ **Cached User-Taught** → Authentic contributions (5min cache)
3️⃣ **API Cache** → Previously successful results
4️⃣ **Google Translate (tcy)** → Attempts authentic Tulu
5️⃣ **🔑 KEY: When API fails → YOU teach authentic Tulu!**

💡 **Commands:**
• Just type any English word or phrase
• **/correct <word>** - Fix taught dictionary entries
• **/stats** - Performance and authenticity metrics
• **/learned** - Browse authentic user contributions

🎯 **Try These:**
• "Hello" → namaskara (Base: <1ms)
• "Thank you" → dhanyavada (Base: <1ms)  
• "I love you" → (API will likely fail → teach authentic Tulu!)

🏛️ **Building the world's most authentic Tulu database with optimal performance!**`;

    await bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// FIXED: Single /stats command with complete implementation
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
    
    const statsMessage = `📊 **Performance-Optimized Statistics**

⚡ **Service Status:**
• **Uptime:** ${hours}h ${minutes}m
• **Keep-Alive:** ${isKeepAliveActive ? 'Active (45min)' : 'Sleeping'}
• **Database:** ${mongoAvailable ? 'MongoDB Atlas (Optimized)' : 'Memory + API'}

🗄️ **Database Collections:**
• **🏆 Base Dictionary:** ${Object.keys(tuluDictionary).length} verified Tulu words
• **📚 Taught Dictionary:** ${taughtStats.count} user contributions
• **🌐 API Cache:** ${cacheStats.count} cached translations
• **📊 Total Vocabulary:** ${Object.keys(tuluDictionary).length + taughtStats.count}+ words

📈 **Recent User Contributions:**
${recentList}

🎯 **Translation Performance:**
• **Tier 1 (Base):** <1ms, 100% verified Tulu
• **Tier 2 (Taught):** <5ms, user-verified authentic  
• **Tier 3 (Cache):** <50ms, previously translated
• **Tier 4 (Tulu API):** 2-3s, authentic Tulu attempt
• **Tier 5 (Teaching):** Community builds database

🚀 **Building authentic Tulu - ${1000 - (Object.keys(tuluDictionary).length + taughtStats.count)} words to reach 1000!**`;

    await bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Enhanced /learned command for taught dictionary
bot.onText(/\/learned/, async (msg) => {
    extendKeepAlive();
    
    const taughtStats = await getTaughtDictionaryStats();
    
    if (taughtStats.count === 0) {
        await bot.sendMessage(msg.chat.id, `📚 **Taught Dictionary Empty**

No user contributions yet - be the first to teach authentic Tulu!

💡 **How to contribute:**
• Ask me any English word/phrase
• If I don't know it, teach me the Tulu translation
• Your contribution helps preserve authentic Tulu

🎯 Try asking a word now!`, {parse_mode: 'Markdown'});
        return;
    }
    
    const recentList = taughtStats.recent
        .map((w, i) => `${i+1}. "${w.english}" = "${w.tulu}"
   👤 Added by: ${w.contributor}
   📊 Used: ${w.usage_count || 1} times`)
        .join('\n\n');
    
    const message = `📚 **Taught Dictionary Status**

${mongoAvailable ? '🌐 Permanent Cloud Storage' : '💾 Temporary Session Storage'}
📊 Total Words: ${taughtStats.count}

**Recent Contributions:**
${recentList}

${taughtStats.count > 5 ? `\n💡 ...and ${taughtStats.count - 5} more words in database` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use /correct to improve existing translations`;

    await bot.sendMessage(msg.chat.id, message, {parse_mode: 'Markdown'});
});

// Enhanced /correct command handler
bot.onText(/^\/correct(?:\s+(.+)|$)/, async (msg, match) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'User';
    
    // Check if a word was provided
    if (!match[1]) {
        await bot.sendMessage(msg.chat.id, `❌ **Please specify a word to correct**

**Usage:** /correct <word>
**Example:** /correct hello

This command lets you update existing translations in the taught dictionary.
Base dictionary words cannot be modified.`, {parse_mode: 'Markdown'});
        return;
    }

    const wordToCorrect = match[1].toLowerCase().trim();
    
    // Get current translation
    const taughtWords = await getCachedTaughtWords();
    const currentTranslation = tuluDictionary[wordToCorrect] || taughtWords[wordToCorrect];
    
    if (currentTranslation) {
        // Check if it's from base dictionary
        if (tuluDictionary[wordToCorrect]) {
            await bot.sendMessage(msg.chat.id, `❌ **Cannot Correct Base Dictionary**

📝 **Word:** "${wordToCorrect}"
🔒 **Current:** "${currentTranslation}"
📚 **Source:** Built-in verified dictionary

Base dictionary words cannot be modified.`, {parse_mode: 'Markdown'});
            return;
        }
        
        // Set correction mode
        userStates[userId] = {
            mode: 'correcting',
            englishWord: wordToCorrect,
            originalText: wordToCorrect,
            oldTranslation: currentTranslation,
            timestamp: Date.now()
        };
        
        await bot.sendMessage(msg.chat.id, `🔧 **Correction Mode**

📝 **English:** "${wordToCorrect}"
🔄 **Current:** "${currentTranslation}"

Please send the new Tulu translation:
*(or /skip to cancel)*`, {parse_mode: 'Markdown'});
        
    } else {
        await bot.sendMessage(msg.chat.id, `❓ Word "${wordToCorrect}" not found in any dictionary.

Try asking me to translate it first!`, {parse_mode: 'Markdown'});
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
• Use **/stats** for performance metrics

🗄️ **Collections ready** for your contributions`);
    } else {
        bot.sendMessage(msg.chat.id, `💭 **No active operation**

🎯 **Try these features:**
• Type any English word for translation
• **/stats** - Performance and database statistics  
• **/learned** - Browse taught dictionary
• **/numbers** - Complete number reference

⚡ **All optimized for maximum performance!**`);
    }
});

// Numbers reference
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

✅ All numbers in base dictionary - <1ms instant translation!
📚 Part of ${Object.keys(tuluDictionary).length} verified base words`;

    bot.sendMessage(msg.chat.id, numbersMessage, {parse_mode: 'Markdown'});
});

// Add message processing tracking
let messageProcessing = new Set();
let responseTracker = new Map(); // Track responses sent per user

// Modified main message handler with single response guarantee
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const messageId = `${msg.chat.id}_${msg.message_id}`;
    const userId = msg.from.id;
    
    // Prevent duplicate processing
    if (messageProcessing.has(messageId)) {
        return;
    }
    messageProcessing.add(messageId);

    // ✅ FIXED: Ensure only one response per user query
    const responseKey = `${userId}_${Date.now()}`;
    let responseSent = false;
    
    const sendSingleResponse = async (text, options = {}) => {
        if (responseSent) return; // Prevent multiple responses
        responseSent = true;
        await bot.sendMessage(msg.chat.id, text, options);
    };

    try {
        const userText = msg.text.trim();
        const userName = msg.from.first_name;
        
        extendKeepAlive();
        console.log(`📩 ${userName}: "${userText}"`);

        // Handle learning/correction mode FIRST (priority)
        if (userStates[userId]) {
            const state = userStates[userId];
            
            if (state.mode === 'learning') {
                const learned = await learnNewWord(state.englishWord, userText, userId, userName);
                if (learned) {
                    await sendSingleResponse(`✅ **Thank you for teaching!**

📝 **English:** "${state.originalText}"
🏛️ **Tulu:** "${userText}"
👤 **Contributor:** ${userName}

Your authentic Tulu word has been added to the taught dictionary.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`, {parse_mode: 'Markdown'});
                }
                return; // ✅ Exit after handling learning mode
            }
            
            if (state.mode === 'correcting') {
                const corrected = await learnNewWord(state.englishWord, userText, userId, userName);
                if (corrected) {
                    await sendSingleResponse(`✅ **Word Updated Successfully**

📝 **English:** "${state.originalText}"
🔄 **Old:** "${state.oldTranslation}"
🆕 **New:** "${userText}"
👤 **Updated by:** ${userName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`, {parse_mode: 'Markdown'});
                }
                return; // ✅ Exit after handling correction mode
            }
        }

        // Normal translation flow - ONLY if not in special mode
        const result = await translateToTulu(userText, userId);
        
        if (result.found) {
            // ✅ Translation found - send result
            const tierEmoji = {
                1: '🏆', 2: '🎯', 3: '💾', 4: '🌐', 5: '❓'
            }[result.tier] || '✅';
            
            const responseMessage = `${tierEmoji} **Translation Found**

📝 **English:** ${userText}
🏛️ **Translation:** ${result.translation}
📊 **Source:** ${result.source}
${result.needsVerification ? '\n💡 **Improve:** /correct ' + userText.toLowerCase() : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`;

            await sendSingleResponse(responseMessage, {parse_mode: 'Markdown'});
            
        } else {
            // ✅ No translation found - ask user to teach (this sets userStates[userId])
            const teachMessage = `❓ **Teach me authentic Tulu!**

I don't know "${userText}" in Tulu yet.

Please reply with the Tulu translation using Roman letters.
*(or /skip to cancel)*

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`;

            await sendSingleResponse(teachMessage, {parse_mode: 'Markdown'});
        }

    } finally {
        // Clean up tracking
        messageProcessing.delete(messageId);
        setTimeout(() => {
            responseTracker.delete(responseKey);
        }, 5000); // Clean up response tracking after 5 seconds
    }
});

// Main message handler with duplicate prevention
bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const messageId = `${msg.chat.id}_${msg.message_id}`;
    
    // Prevent duplicate processing
    if (messageProcessing.has(messageId)) {
        return;
    }
    messageProcessing.add(messageId);

    try {
        const userText = msg.text.trim();
        const userId = msg.from.id;
        const userName = msg.from.first_name;
        
        extendKeepAlive();
        console.log(`📩 ${userName}: "${userText}"`);

        // Handle learning/correction mode
        if (userStates[userId]) {
            const state = userStates[userId];
            if (state.mode === 'learning') {
                const learned = await learnNewWord(state.englishWord, userText, userId, userName);
                if (learned) {
                    await bot.sendMessage(msg.chat.id, `✅ **Thank you for teaching!**

📝 **English:** "${state.originalText}"
🏛️ **Tulu:** "${userText}"
👤 **Contributor:** ${userName}

Your authentic Tulu word has been added to the taught dictionary.
*Use /correct anytime to improve it further.*

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`, {parse_mode: 'Markdown'});
                }
                return;
            }
            if (state.mode === 'correcting') {
                const corrected = await learnNewWord(state.englishWord, userText, userId, userName);
                if (corrected) {
                    await bot.sendMessage(msg.chat.id, `✅ **Word Updated Successfully**

📝 **English:** "${state.originalText}"
🔄 **Old:** "${state.oldTranslation}"
🆕 **New:** "${userText}"
👤 **Updated by:** ${userName}

The dictionary has been updated with your correction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`, { parse_mode: 'Markdown' });
                    // ensure state cleared (learnNewWord already clears it, but do it defensively)
                    delete userStates[userId];
                }
                return;
            }
        }

        // Normal translation flow
        const result = await translateToTulu(userText, userId);
        let responseMessage = '';
        
        if (result.found) {
            const tierEmoji = {
                1: '🏆', // Base dictionary
                2: '🎯', // Taught dictionary 
                3: '💾', // API cache
                4: '🌐', // Fresh Tulu API
                5: '❓'  // Unknown
            }[result.tier] || '✅';
            
            responseMessage = `${tierEmoji} **Authentic Tulu Translation Found**

📝 **English:** ${userText}
🏛️ **Translation:** ${result.translation}

📊 **Source:** ${result.source}
${result.needsVerification ? '\n💡 **Help improve:** Use **/correct ' + userText.toLowerCase() + '** to add authentic Tulu' : ''}`;

        } else {
            // Only if no translation found at all
            userStates[userId] = {
                mode: 'learning',
                englishWord: userText.toLowerCase(),
                originalText: userText,
                timestamp: Date.now()
            };

            responseMessage = `❓ **Teach me authentic Tulu!**

I don't know how to say "${userText}" in authentic Tulu yet.

Please reply with the correct Tulu translation using Roman letters (English alphabet).
*(or use /skip to cancel)*`;
        }

        responseMessage += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`;

        await bot.sendMessage(msg.chat.id, responseMessage, {parse_mode: 'Markdown'});
    } finally {
        // Clean up after processing
        messageProcessing.delete(messageId);
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
        console.log('🗄️ Optimized MongoDB connection closed');
    }
    bot.stopPolling();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('📴 SIGINT received - shutting down gracefully...');
    try {
        if (client && mongoAvailable) {
            await client.close();
            console.log('🗄️ MongoDB connection closed');
        }
        if (botStarted) {
            await bot.stopPolling();
            console.log('🧹 Bot polling stopped');
        }
    } catch (e) {
        console.error('Error during shutdown:', e.message);
    } finally {
        process.exit(0);
    }
});

process.on('unhandledRejection', (reason, p) => {
    console.error('🚨 Unhandled Rejection at:', p, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
    console.error('🚨 Uncaught Exception:', err);
    process.exit(1);
});

// Start health server
app.listen(PORT, () => {
    console.log(`🌐 Performance-optimized health server running on port ${PORT}`);
});

// Enhanced startup sequence
async function startBot() {
    try {
        console.log('🔧 Initializing performance-optimized MongoDB collections...');
        mongoAvailable = await initializeMongoDB();
        
        if (mongoAvailable) {
            console.log('📚 Loading taught dictionary into smart cache...');
            learnedWords = await getCachedTaughtWords();
        } else {
            console.log('⚡ Running with optimized memory storage + Tulu API fallback');
        }
        
        console.log('🤖 Starting optimized bot with conflict prevention...');
        await startBotSafely();
        
        const taughtStats = await getTaughtDictionaryStats();
        const cacheStats = await getAPICacheStats();
        
        console.log('✅ ========================================================');
        console.log('✅ AUTHENTIC TULU TRANSLATOR WITH PERFORMANCE OPTIMIZATION');
        console.log('✅ ========================================================\n');
        
        console.log(`🤖 Bot: @${(await bot.getMe()).username}`);
        console.log(`🗄️ Database: ${mongoAvailable ? 'Optimized MongoDB Collections (5-15s timeouts)' : 'Memory + Tulu API'}`);
        console.log(`⚡ Wake-on-Start: Active (No delays)`);
        console.log(`🏓 Keep-Alive: Enhanced 45-minute sessions`);
        console.log(`📚 Base Dictionary: ${Object.keys(tuluDictionary).length} verified words (<1ms)`);
        console.log(`🎯 Taught Dictionary: ${taughtStats.count} authentic contributions (<5ms)`);
        console.log(`💾 API Cache: ${cacheStats.count} cached translations (<50ms)`);
        console.log(`🌍 Total Vocabulary: ${Object.keys(tuluDictionary).length + taughtStats.count}+ words`);
        console.log(`🌐 API Strategy: Google Translate (tcy) → User Teaching for Authentic Tulu`);
        console.log(`🔧 Collections: taught_dictionary + api_cache with smart caching`);
        console.log(`👥 User Attribution: Full credit system with performance tracking`);
        console.log(`🏛️ Authenticity Focus: Real Tulu preservation through community`);
        console.log(`📊 Analytics: Optimized usage tracking and statistics`);
        console.log(`🚀 Performance: Smart caching, reduced timeouts, optimized polling`);
        console.log('');
        console.log('🏛️ Ready for authentic Tulu preservation with maximum performance!');
        console.log('🎯 API fails → User teaches → Everyone benefits with authentic Tulu!');
        
    } catch (error) {
        console.error('❌ Authentic Tulu bot startup failed:', error);
        process.exit(1);
    }
}

// Start the complete authentic Tulu bot with performance optimization
startBot();
