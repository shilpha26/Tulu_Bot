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
        interval: 1000,
        autoStart: false
    }
});

console.log('🚀 Advanced Tulu Bot v6.0 Starting...\n');

// Enhanced Keep-Alive System
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

// Auto Wake-up System
const WAKE_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes throttle
let lastWakeAt = 0;

async function pingRenderHost(wakeUrl) {
    try {
        console.log('🔔 Pinging Render host for wake-up...');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(wakeUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'TuluBot-RenderWakeUp/1.0' }
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
            console.log('✅ Render wake-up ping successful');
        }
    } catch (error) {
        console.log('⚠️ Render wake-up ping failed:', error.message);
    }
}

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

// Helper function to categorize words for base dictionary
function categorizeWord(english) {
    if (['hello', 'hi', 'hey', 'goodbye', 'bye', 'good morning', 'good evening', 'good night'].includes(english)) return 'greetings';
    if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'].includes(english)) return 'numbers';
    if (['mother', 'father', 'brother', 'sister', 'grandfather', 'grandmother', 'uncle', 'aunt', 'son', 'daughter', 'husband', 'wife'].includes(english)) return 'family';
    if (['red', 'green', 'blue', 'yellow', 'white', 'black'].includes(english)) return 'colors';
    if (['yes', 'no', 'ok', 'okay', 'thank you', 'thanks', 'welcome', 'sorry', 'please'].includes(english)) return 'common';
    if (['water', 'house', 'home', 'food', 'school', 'hospital', 'temple', 'market'].includes(english)) return 'places_things';
    if (['sit', 'stand', 'sleep', 'walk', 'run', 'eat', 'drink', 'come', 'go'].includes(english)) return 'actions';
    return 'general';
}

// MongoDB initialization with base dictionary support
async function initializeMongoDB() {
    if (!mongoUri) {
        console.log('⚠️ No MongoDB URI - using memory storage');
        return false;
    }

    try {
        console.log('🔧 Connecting to MongoDB Atlas (Enhanced Settings)...');
        
        client = new MongoClient(mongoUri, {
            tls: true,
            tlsAllowInvalidCertificates: false,
            tlsAllowInvalidHostnames: false,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 20000,
            connectTimeoutMS: 10000,
            maxPoolSize: 5,
            minPoolSize: 1,
            retryWrites: true,
            retryReads: true,
            w: 'majority',
            authSource: 'admin',
            compressors: ['zlib'],
            family: 4
        });
        
        await client.connect();
        db = client.db('tulu_translator');
        await db.admin().ping();
        
        console.log('✅ Connected to MongoDB Atlas - Enhanced Database Active');
        
        // Create comprehensive collections with indexes
        try {
            // Base Dictionary Collection (MongoDB-based verified words)
            await db.collection('base_dictionary').createIndex({ english: 1 }, { unique: true });
            await db.collection('base_dictionary').createIndex({ category: 1 });
            await db.collection('base_dictionary').createIndex({ verified: 1 });
            await db.collection('base_dictionary').createIndex({ updatedAt: -1 });
            
            // Taught Dictionary Collection (User-contributed authentic Tulu)
            await db.collection('taught_dictionary').createIndex({ english: 1 }, { unique: true });
            await db.collection('taught_dictionary').createIndex({ updatedAt: -1 });
            await db.collection('taught_dictionary').createIndex({ contributor: 1 });
            await db.collection('taught_dictionary').createIndex({ usage_count: -1 });
            
            // API Cache Collection (API results for performance)
            await db.collection('api_cache').createIndex({ english: 1 }, { unique: true });
            await db.collection('api_cache').createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
            await db.collection('api_cache').createIndex({ api_source: 1 });
            
            console.log('✅ Enhanced collections created with comprehensive indexes');
        } catch (indexError) {
            if (indexError.code !== 85) {
                console.log('⚠️ Index creation warning:', indexError.message);
            }
        }
        
        // Initialize base dictionary from code to MongoDB
        await initializeBaseDictionary();
        
        // Get collection stats
        const baseCount = await db.collection('base_dictionary').countDocuments();
        const taughtCount = await db.collection('taught_dictionary').countDocuments();
        const cacheCount = await db.collection('api_cache').countDocuments();
        
        console.log(`📚 Base Dictionary: ${baseCount} verified words (MongoDB)`);
        console.log(`🎯 Taught Dictionary: ${taughtCount} user-contributed words`);
        console.log(`🌐 API Cache: ${cacheCount} cached translations`);
        
        return true;
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.log('⚠️ Continuing with memory storage + API fallback');
        return false;
    }
}

// Initialize base dictionary in MongoDB (one-time setup)
async function initializeBaseDictionary() {
    if (!mongoAvailable || !db) return;

    try {
        const existingCount = await db.collection('base_dictionary').countDocuments();
        
        if (existingCount > 0) {
            console.log(`📚 Base dictionary already initialized: ${existingCount} words`);
            return;
        }

        console.log('🔄 Initializing base dictionary in MongoDB...');
        
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
        
        // Convert to MongoDB format with categories
        const baseWords = [];
        for (const [english, tulu] of Object.entries(tuluDictionary)) {
            baseWords.push({
                english: english.toLowerCase().trim(),
                tulu: tulu.trim(),
                category: categorizeWord(english),
                verified: true,
                source: 'initial_verified',
                contributor: 'System',
                createdAt: new Date(),
                updatedAt: new Date(),
                usage_count: 0,
                editable: true,
                update_count: 0
            });
        }

        // Bulk insert all base words
        if (baseWords.length > 0) {
            await db.collection('base_dictionary').insertMany(baseWords);
            console.log(`✅ Initialized base dictionary: ${baseWords.length} verified words`);
        }

    } catch (error) {
        console.error('❌ Base dictionary initialization failed:', error.message);
    }
}

// Load base dictionary from MongoDB with caching
let baseDictionaryCache = {};
let lastBaseCacheUpdate = 0;
const BASE_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

async function getCachedBaseDictionary() {
    const now = Date.now();
    if (now - lastBaseCacheUpdate > BASE_CACHE_DURATION || Object.keys(baseDictionaryCache).length === 0) {
        baseDictionaryCache = await loadFromBaseDictionary();
        lastBaseCacheUpdate = now;
        console.log(`📚 Base dictionary cache refreshed: ${Object.keys(baseDictionaryCache).length} words`);
    }
    return baseDictionaryCache;
}

async function loadFromBaseDictionary() {
    if (!mongoAvailable || !db) {
        console.log('📚 Using fallback empty dictionary (MongoDB not available)');
        return {};
    }

    try {
        const words = {};
        const cursor = db.collection('base_dictionary').find({ verified: true });
        
        await cursor.forEach(doc => {
            words[doc.english] = doc.tulu;
        });
        
        console.log(`📚 Loaded ${Object.keys(words).length} base dictionary words from MongoDB`);
        return words;
    } catch (error) {
        console.error('❌ Base dictionary load failed:', error.message);
        return {};
    }
}

// Taught dictionary caching
let taughtWordsCache = {};
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

// API cache for fallback mode
let apiCache = {};

// Google Translate API function
async function tryAPITranslation(text) {
    if (text.length <= 2 || /^\d+$/.test(text)) {
        console.log('🔍 Skipping API for short text/numbers:', text);
        return null;
    }
    
    console.log(`🔍 Attempting Tulu translation API for: "${text}"`);
    
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

// Save to taught dictionary
async function saveToTaughtDictionary(englishWord, tuluWord, userInfo = null) {
    if (!mongoAvailable || !db) {
        console.log(`💾 Memory save: "${englishWord}" = "${tuluWord}"`);
        taughtWordsCache[englishWord.toLowerCase().trim()] = tuluWord.trim();
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
    if (!translation || /[\u0C80-\u0CFF]/.test(translation)) {
        console.log('🚫 Skipping cache for invalid/Kannada script response');
        return;
    }

    const key = englishWord.toLowerCase().trim();

    if (!mongoAvailable || !db) {
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

// Load from taught dictionary
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

// Load from API cache
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

// Update base dictionary in MongoDB
async function updateBaseDictionary(englishWord, oldTranslation, newTranslation, userId, userName) {
    if (!mongoAvailable || !db) return false;

    try {
        const updateDoc = {
            $set: {
                tulu: newTranslation.trim(),
                updatedAt: new Date(),
                last_contributor: userName,
                last_contributor_id: userId
            },
            $inc: { update_count: 1 }
        };
        
        await db.collection('base_dictionary').updateOne(
            { english: englishWord.toLowerCase().trim() },
            updateDoc
        );
        
        console.log(`📚 Base dictionary updated: "${englishWord}" → "${newTranslation}" by ${userName}`);
        return true;
    } catch (error) {
        console.error('❌ Base dictionary update failed:', error.message);
        return false;
    }
}

// Enhanced statistics functions
async function getTaughtDictionaryStats() {
    if (!mongoAvailable || !db) {
        console.log('📊 Stats: Using memory cache fallback');
        return { count: Object.keys(taughtWordsCache).length, recent: [] };
    }

    try {
        console.log('📊 Stats: Querying MongoDB taught_dictionary...');
        
        const count = await db.collection('taught_dictionary').countDocuments();
        console.log(`📊 Found ${count} documents in taught_dictionary`);
        
        if (count === 0) {
            return { count: 0, recent: [] };
        }
        
        const recentDocs = await db.collection('taught_dictionary')
            .find({})
            .sort({ updatedAt: -1 })
            .limit(5)
            .toArray();
        
        console.log(`📊 Retrieved ${recentDocs.length} recent documents`);
        
        const recent = recentDocs.map(doc => ({
            english: doc.english, 
            tulu: doc.tulu,
            contributor: doc.contributor || 'Anonymous',
            updatedAt: doc.updatedAt,
            usage_count: doc.usage_count || 1
        }));
        
        console.log(`📊 Stats result: count=${count}, recent=${recent.length}`);
        return { count, recent };
        
    } catch (error) {
        console.error('❌ getTaughtDictionaryStats failed:', error.message);
        return { count: 0, recent: [] };
    }
}

async function getAPICacheStats() {
    if (!mongoAvailable || !db) {
        return { count: Object.keys(apiCache).length };
    }

    try {
        const count = await db.collection('api_cache').countDocuments();
        return { count };
    } catch (error) {
        return { count: 0 };
    }
}

async function getBaseDictionaryStats() {
    if (!mongoAvailable || !db) {
        return { count: Object.keys(baseDictionaryCache).length };
    }

    try {
        const count = await db.collection('base_dictionary').countDocuments();
        return { count };
    } catch (error) {
        return { count: 0 };
    }
}

// Enhanced 5-tier translation system with MongoDB base dictionary
async function translateToTulu(text, userId) {
    const lowerText = text.toLowerCase().trim();
    
    // 1. Check Base dictionary from MongoDB
    const baseDictionary = await getCachedBaseDictionary();
    if (baseDictionary[lowerText]) {
        const translation = baseDictionary[lowerText];
        console.log(`✅ MongoDB base dictionary: "${translation}"`);
        return { 
            translation, 
            found: true, 
            source: 'MongoDB Base Dictionary (Verified)', 
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
    
    // 4. Try Google Translate API
    console.log(`🔍 Trying Google Translate Tulu API for: "${text}"`);
    const apiResult = await tryAPITranslation(text);
    if (apiResult && apiResult.translation) {
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
    
    // 5. No translation found - Ask user to teach
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

// Enhanced learning function
async function learnNewWord(englishWord, tuluTranslation, userId, userInfo = null) {
    const lowerEnglish = englishWord.toLowerCase().trim();
    const tuluWord = tuluTranslation.trim();
    
    if (tuluWord.length < 2) {
        console.log(`❌ Invalid translation too short: "${tuluWord}"`);
        return false;
    }
    
    const saved = await saveToTaughtDictionary(lowerEnglish, tuluWord, userInfo);
    
    if (saved) {
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

// Enhanced health check server
const app = express();

app.get('/', async (req, res) => {
    const isKeepAliveActive = keepAliveInterval !== null;
    const timeSinceActivity = lastActivityTime ? Date.now() - lastActivityTime : null;
    let taughtStats = { count: 0, recent: [] };
    let cacheStats = { count: 0 };
    let baseStats = { count: 0 };
    
    try {
        taughtStats = await getTaughtDictionaryStats();
        cacheStats = await getAPICacheStats();
        baseStats = await getBaseDictionaryStats();
    } catch (error) {
        // Handle gracefully
    }
    
    const stats = {
        status: 'running',
        bot: 'Advanced Authentic Tulu Translator with MongoDB Base Dictionary',
        version: '6.0.0',
        uptime: Math.floor(process.uptime() / 60) + ' minutes',
        database_structure: {
            base_dictionary: baseStats.count,
            taught_dictionary: taughtStats.count,
            api_cache: cacheStats.count
        },
        total_vocabulary: baseStats.count + taughtStats.count,
        recent_contributions: taughtStats.recent,
        keep_alive_active: isKeepAliveActive,
        minutes_since_activity: timeSinceActivity ? Math.floor(timeSinceActivity / (60 * 1000)) : null,
        database: {
            type: mongoAvailable ? 'MongoDB Atlas - Enhanced Collections' : 'Memory Storage + API',
            status: mongoAvailable ? 'Connected' : 'Fallback Mode',
            collections: mongoAvailable ? ['base_dictionary', 'taught_dictionary', 'api_cache'] : ['memory'],
            persistent: mongoAvailable,
            shared_across_users: mongoAvailable
        },
        features: [
            'MongoDB-based Base Dictionary',
            'Community-editable Base Words',
            'User-taught Dictionary',
            'Smart API Caching',
            'Auto Wake-up System',
            '5-tier Translation Priority'
        ],
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        keep_alive: keepAliveInterval !== null,
        database: mongoAvailable ? 'MongoDB Collections Active' : 'Memory + API Active',
        version: '6.0.0',
        features: 'Base Dictionary + Taught Dictionary + API Cache',
        timestamp: new Date().toISOString() 
    });
});

app.post('/wake', express.json(), async (req, res) => {
    console.log('🔔 Manual wake-up endpoint called');
    wakeUpService();
    res.json({ status: 'awake', timestamp: new Date().toISOString() });
});

// User states and message processing
const userStates = {};
let messageProcessing = new Set();

// Enhanced bot startup
let botStarted = false;

async function startBotSafely() {
    if (botStarted) {
        console.log('⚠️ Bot already started - preventing duplicate instance');
        return;
    }
    
    try {
        console.log('🤖 Starting enhanced bot with conflict prevention...');
        
        await bot.deleteWebHook();
        console.log('🧹 Cleared any existing webhooks');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        await bot.startPolling();
        
        botStarted = true;
        console.log('✅ Bot polling started successfully (Optimized: 1000ms interval)');
        
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

// /start command
bot.onText(/\/start/, async (msg) => {
    wakeUpService();
    
    const taughtStats = await getTaughtDictionaryStats();
    const cacheStats = await getAPICacheStats();
    const baseStats = await getBaseDictionaryStats();
    const totalWords = baseStats.count + taughtStats.count;
    
    clearUserState(msg.from.id);
    
    const welcomeMessage = `🌟 **Advanced Tulu Translator Bot v6.0**

🚀 **New Features:**
• **MongoDB Base Dictionary** - Community-editable verified words
• **Dynamic Word Management** - Update base dictionary through bot
• **Enhanced Performance** - Multi-tier caching system
• **Auto Wake-up** - Never sleeps when users are active

📊 **Live Database Statistics:**
• **📚 Base Dictionary:** ${baseStats.count} verified words (MongoDB)
• **🎯 Taught Dictionary:** ${taughtStats.count} authentic user contributions  
• **🌐 API Cache:** ${cacheStats.count} cached translations
• **🏆 Total Vocabulary:** ${totalWords}+ words

🎯 **Enhanced Translation Strategy:**
1️⃣ **MongoDB Base Dictionary** → Community-verified Tulu
2️⃣ **Cached User-Taught** → Authentic contributions (5min cache)
3️⃣ **API Cache** → Previously successful results
4️⃣ **Google Translate (tcy)** → Attempts authentic Tulu
5️⃣ **Community Teaching** → Build authentic database together

💡 **Commands:**
• Just type any English word or phrase
• **/correct <word>** - Edit ANY dictionary word (base or taught)
• **/stats** - Performance and authenticity metrics
• **/learned** - Browse authentic user contributions
• **/base** - Browse base dictionary by category

🎯 **Try These:**
• "Hello" → namaskara (Base: <1ms)
• "Thank you" → dhanyavada (Base: <1ms)  
• Unknown phrases → Teach authentic Tulu!

🏛️ **Building the world's first community-managed Tulu dictionary!**`;

    await bot.sendMessage(msg.chat.id, welcomeMessage, {parse_mode: 'Markdown'});
});

// Enhanced /stats command
bot.onText(/\/stats/, async (msg) => {
    extendKeepAlive();
    
    const taughtStats = await getTaughtDictionaryStats();
    const cacheStats = await getAPICacheStats();
    const baseStats = await getBaseDictionaryStats();
    const uptime = Math.floor(process.uptime() / 60);
    const hours = Math.floor(uptime / 60);
    const minutes = uptime % 60;
    const isKeepAliveActive = keepAliveInterval !== null;
    
    const recentList = taughtStats.recent.length > 0 
        ? taughtStats.recent.map(w => 
            `• "${w.english}" → "${w.tulu}"\n  👤 ${w.contributor} • 🔄 ${w.usage_count} uses`
          ).join('\n\n')
        : 'No user contributions yet - be the first!';
    
    const statsMessage = `📊 **Advanced Performance Statistics**

⚡ **Service Status:**
• **Uptime:** ${hours}h ${minutes}m
• **Keep-Alive:** ${isKeepAliveActive ? 'Active (45min)' : 'Sleeping'}
• **Auto Wake-Up:** ✅ Active (Render-optimized)
• **Database:** ${mongoAvailable ? 'MongoDB Collections (Enhanced)' : 'Memory + API'}

🗄️ **Enhanced Database Collections:**
• **📚 Base Dictionary:** ${baseStats.count} verified words (MongoDB)
• **🎯 Taught Dictionary:** ${taughtStats.count} user contributions
• **🌐 API Cache:** ${cacheStats.count} cached translations
• **🏆 Total Vocabulary:** ${baseStats.count + taughtStats.count}+ words

📈 **Recent User Contributions:**
${recentList}

🎯 **Translation Performance Tiers:**
• **Tier 1 (Base):** <1ms, MongoDB verified Tulu
• **Tier 2 (Taught):** <5ms, user-verified authentic  
• **Tier 3 (Cache):** <50ms, previously translated
• **Tier 4 (Tulu API):** 2-3s, authentic Tulu attempt
• **Tier 5 (Teaching):** Community builds database

🚀 **Auto Wake-Up:** Service automatically wakes when users interact!
🏛️ **Community Goal:** Building authentic Tulu preservation database together!`;

    await bot.sendMessage(msg.chat.id, statsMessage, {parse_mode: 'Markdown'});
});

// Enhanced /learned command
bot.onText(/\/learned/, async (msg) => {
    extendKeepAlive();
    
    console.log('📚 /learned command called');
    const taughtStats = await getTaughtDictionaryStats();
    console.log('📚 Retrieved stats:', taughtStats);
    
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
    
    let recentList = 'No recent contributions found.';
    if (taughtStats.recent && taughtStats.recent.length > 0) {
        recentList = taughtStats.recent
            .map((w, i) => `${i+1}. "${w.english}" = "${w.tulu}"
   👤 Added by: ${w.contributor}
   📊 Used: ${w.usage_count || 1} times`)
            .join('\n\n');
    }
    
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

// Enhanced /correct command supporting both dictionaries
bot.onText(/^\/correct(?:\s+(.+)|$)/, async (msg, match) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'User';
    
    if (!match[1]) {
        await bot.sendMessage(msg.chat.id, `❌ **Please specify a word to correct**

**Usage:** /correct <word>
**Example:** /correct hello

This command lets you:
• ✅ **Edit user-taught words** immediately
• 📚 **Update base dictionary words** (community-verified)

Both types of corrections help improve authentic Tulu for everyone!`, {parse_mode: 'Markdown'});
        return;
    }

    const wordToCorrect = match[1].toLowerCase().trim();
    
    // Check all dictionaries
    const baseDictionary = await getCachedBaseDictionary();
    const taughtWords = await getCachedTaughtWords();
    
    if (taughtWords[wordToCorrect]) {
        // User-taught dictionary - can edit directly
        userStates[userId] = {
            mode: 'correcting',
            englishWord: wordToCorrect,
            originalText: wordToCorrect,
            oldTranslation: taughtWords[wordToCorrect],
            timestamp: Date.now()
        };
        
        await bot.sendMessage(msg.chat.id, `🔧 **Edit User-Taught Word**

📝 **English:** "${wordToCorrect}"
🔄 **Current:** "${taughtWords[wordToCorrect]}"
📚 **Source:** Taught Dictionary (User Contribution)

Please send the new Tulu translation:
*(or /skip to cancel)*`, {parse_mode: 'Markdown'});
        
    } else if (baseDictionary[wordToCorrect]) {
        // Base dictionary - community editing
        userStates[userId] = {
            mode: 'correcting_base',
            englishWord: wordToCorrect,
            originalText: wordToCorrect,
            oldTranslation: baseDictionary[wordToCorrect],
            timestamp: Date.now()
        };
        
        await bot.sendMessage(msg.chat.id, `📚 **Edit Base Dictionary Word**

📝 **English:** "${wordToCorrect}"
🔒 **Current:** "${baseDictionary[wordToCorrect]}"
📚 **Source:** Base Dictionary (Community-Verified)

Your update will improve the base dictionary for all users!

Please send your improved Tulu translation:
*(or /skip to cancel)*`, {parse_mode: 'Markdown'});
        
    } else {
        await bot.sendMessage(msg.chat.id, `❓ **Word "${wordToCorrect}" not found**

Try asking me to translate it first, or check spelling!

💡 **Available commands:**
• Ask me: "${wordToCorrect}"
• **/stats** - See all dictionary statistics
• **/learned** - Browse user contributions`, {parse_mode: 'Markdown'});
    }
});

// /skip command with single response
bot.onText(/\/skip|\/cancel/, async (msg) => {
    extendKeepAlive();
    
    const userId = msg.from.id;
    
    const hasActiveState = userStates[userId] && 
        (userStates[userId].mode === 'learning' || 
         userStates[userId].mode === 'correcting' || 
         userStates[userId].mode === 'correcting_base');
    
    if (hasActiveState) {
        delete userStates[userId];
        
        await bot.sendMessage(msg.chat.id, `✅ **Operation Cancelled**

🔄 **Ready for new translations!**
• Ask me any English word or phrase
• Use **/correct <word>** to edit any dictionary
• Use **/stats** for performance metrics

🗄️ **Enhanced collections** ready for your contributions`, {parse_mode: 'Markdown'});
        
    } else {
        await bot.sendMessage(msg.chat.id, `💭 **No active operation**

🎯 **Try these enhanced features:**
• Type any English word for translation
• **/stats** - Advanced database statistics  
• **/learned** - Browse taught dictionary
• **/correct <word>** - Edit base or taught dictionaries

⚡ **All optimized with MongoDB and auto wake-up!**`, {parse_mode: 'Markdown'});
    }
});

// /numbers command
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
📚 Part of enhanced MongoDB base dictionary`;

    bot.sendMessage(msg.chat.id, numbersMessage, {parse_mode: 'Markdown'});
});

// Complete message handler with all functionality
bot.on('message', async (msg) => {
    console.log(`🔍 Processing message: "${msg.text}" from ${msg.from.first_name} (ID: ${msg.from.id})`);
    if (!msg.text || msg.text.startsWith('/')) return;

    const messageId = `${msg.chat.id}_${msg.message_id}`;
    const userId = msg.from.id;

    // Prevent duplicate processing
    if (messageProcessing.has(messageId)) {
        return;
    }
    messageProcessing.add(messageId);

    // Render Wake-up (throttled)
    try {
        const wakeUrl = process.env.RENDER_EXTERNAL_URL || 'https://tulu-bot.onrender.com';
        const now = Date.now();
        const needWake = (
            wakeUrl &&
            !wakeUrl.includes('localhost') &&
            /^https?:\/\//.test(wakeUrl) &&
            (keepAliveInterval === null || (lastActivityTime && (now - lastActivityTime) > (10 * 60 * 1000)))
        );

        if (needWake && (now - lastWakeAt) > WAKE_THROTTLE_MS) {
            lastWakeAt = now;
            pingRenderHost(wakeUrl);
        }
    } catch (e) {
        console.warn('⚠️ Wake check error:', e && e.message);
    }

    // Single response guarantee
    let responseSent = false;
    
    const sendSingleResponse = async (text, options = {}) => {
        if (responseSent) return;
        responseSent = true;
        await bot.sendMessage(msg.chat.id, text, options);
    };

    try {
        const userText = msg.text.trim();
        const userName = msg.from.first_name;
        
        extendKeepAlive();
        console.log(`📩 ${userName}: "${userText}"`);

        // Handle special modes FIRST
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
                return;
            }
            
            if (state.mode === 'correcting') {
                const corrected = await learnNewWord(state.englishWord, userText, userId, userName);
                if (corrected) {
                    await sendSingleResponse(`✅ **Taught Dictionary Updated**

📝 **English:** "${state.originalText}"
🔄 **Old:** "${state.oldTranslation}"
🆕 **New:** "${userText}"
👤 **Updated by:** ${userName}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`, {parse_mode: 'Markdown'});
                }
                return;
            }

            if (state.mode === 'correcting_base') {
                const success = await updateBaseDictionary(
                    state.englishWord,
                    state.oldTranslation,
                    userText,
                    userId,
                    userName
                );
                
                if (success) {
                    // Clear cache to reflect changes immediately
                    lastBaseCacheUpdate = 0;
                    
                    await sendSingleResponse(`✅ **Base Dictionary Updated!**

📝 **English:** "${state.originalText}"
🔄 **Old:** "${state.oldTranslation}"
🆕 **New:** "${userText}"
👤 **Updated by:** ${userName}

🌍 **Global Impact:** Available to ALL users immediately!
💾 **Cache:** Refreshed for instant access

Thank you for improving the community base dictionary!

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`, {parse_mode: 'Markdown'});
                }
                return;
            }
        }

        // Normal translation flow
        const result = await translateToTulu(userText, userId);
        
        if (result.found) {
            // Translation found - send result
            const tierEmoji = {
                1: '📚', 2: '🎯', 3: '💾', 4: '🌐', 5: '❓'
            }[result.tier] || '✅';
            
            const responseMessage = `${tierEmoji} **Translation Found**

📝 **English:** ${userText}
🏛️ **Translation:** ${result.translation}
📊 **Source:** ${result.source}
${result.needsVerification ? '\n💡 **Improve:** /correct ' + userText.toLowerCase() : ''}
${result.tier === 1 ? '\n🔧 **Community Edit:** /correct ' + userText.toLowerCase() + ' (Base dictionary is now editable!)' : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`;

            await sendSingleResponse(responseMessage, {parse_mode: 'Markdown'});
            
        } else {
            // No translation found - ask user to teach
            const teachMessage = `❓ **Teach me authentic Tulu!**

I don't know "${userText}" in Tulu yet.

Please reply with the Tulu translation using Roman letters.
*(or /skip to cancel)*

This will be added to the **taught dictionary** and shared with all users!

━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 **/stats** • 🔢 **/numbers** • 📚 **/learned**`;

            await sendSingleResponse(teachMessage, {parse_mode: 'Markdown'});
        }

    } finally {
        // Clean up tracking
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
        console.log('🗄️ MongoDB connection closed');
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
    console.log(`🌐 Advanced health server running on port ${PORT}`);
});

// Enhanced startup sequence
async function startBot() {
    try {
        console.log('🔧 Initializing advanced MongoDB collections...');
        mongoAvailable = await initializeMongoDB();
        
        if (mongoAvailable) {
            console.log('📚 Loading dictionaries into smart caches...');
            await getCachedBaseDictionary();
            await getCachedTaughtWords();
        } else {
            console.log('⚡ Running with memory storage + API fallback');
        }
        
        console.log('🤖 Starting enhanced bot with conflict prevention...');
        await startBotSafely();
        
        const baseStats = await getBaseDictionaryStats();
        const taughtStats = await getTaughtDictionaryStats();
        const cacheStats = await getAPICacheStats();
        
        console.log('✅ ========================================================');
        console.log('✅ ADVANCED TULU TRANSLATOR WITH MONGODB BASE DICTIONARY');
        console.log('✅ ========================================================\n');
        
        console.log(`🤖 Bot: @${(await bot.getMe()).username}`);
        console.log(`🗄️ Database: ${mongoAvailable ? 'MongoDB Collections (Enhanced)' : 'Memory + API'}`);
        console.log(`📚 Base Dictionary: ${baseStats.count} verified words (MongoDB)`);
        console.log(`🎯 Taught Dictionary: ${taughtStats.count} authentic contributions`);
        console.log(`💾 API Cache: ${cacheStats.count} cached translations`);
        console.log(`🌍 Total Vocabulary: ${baseStats.count + taughtStats.count}+ words`);
        console.log(`🔧 Features: Community-editable base dictionary`);
        console.log(`⚡ Wake-on-Start: Active (No delays)`);
        console.log(`🏓 Keep-Alive: Enhanced 45-minute sessions`);
        console.log(`🌐 API Strategy: Google Translate (tcy) → User Teaching`);
        console.log(`🚀 Performance: Multi-tier caching with smart refresh`);
        console.log('');
        console.log('🏛️ Ready for authentic Tulu preservation with community management!');
        console.log('🎯 First community-managed Tulu dictionary - Base + Taught + Cached!');
        
    } catch (error) {
        console.error('❌ Advanced Tulu bot startup failed:', error);
        process.exit(1);
    }
}

// Start the complete advanced Tulu bot
startBot();
