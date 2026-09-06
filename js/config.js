/* Khutbah Live Translator — config.js
   Immutable configuration constants. No runtime state.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

const VALID_SKINS = ['masjid-night','desert-sand','midnight-blue','ottoman-rose','pure-light','royal-purple'];

const IS_ANDROID = /Android/i.test(navigator.userAgent);
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const IS_CHROME = /Chrome/i.test(navigator.userAgent) && !/Edge|OPR/i.test(navigator.userAgent);
const RESTART_DELAY = IS_ANDROID ? 500 : 100;

const TUT_TOTAL = 6; // Total steps after language (0-6, so 7 total including step 0)
const RTL_LANGS = ['ar','ur','fa','ps','he','ku','sd','yi'];

// v4.6: RTL edition languages (for Quran translation text direction)
const QURAN_RTL_EDITIONS = ['ur','fa','ar','ps','ku','sd','yi','he'];

// ═══════════════════════════════════════════════
// DYNAMIC LANGUAGE SYSTEM (v4.6)
// Maps language codes to native names for UI dropdown
// ═══════════════════════════════════════════════

const LANGUAGE_NAMES = {
    'am': 'አማርኛ (Amharic)',
    'ar': 'العربية (Arabic)',
    'az': 'Azərbaycanca (Azerbaijani)',
    'bn': 'বাংলা (Bengali)',
    'bs': 'Bosanski (Bosnian)',
    'de': 'Deutsch (German)',
    'en': 'English',
    'es': 'Español (Spanish)',
    'fa': 'فارسی (Persian/Farsi)',
    'fil': 'Filipino',
    'fr': 'Français (French)',
    'gu': 'ગુજરાતી (Gujarati)',
    'ha': 'Hausa',
    'hi': 'हिन्दी (Hindi)',
    'id': 'Bahasa Indonesia',
    'it': 'Italiano (Italian)',
    'js': 'Jawa/Sunda',
    'ko': '한국어 (Korean)',
    'ku': 'کوردی (Kurdish)',
    'ml': 'മലയാളം (Malayalam)',
    'nl': 'Nederlands (Dutch)',
    'pa': 'ਪੰਜਾਬੀ (Punjabi)',
    'pl': 'Polski (Polish)',
    'ps': 'پښتو (Pashto)',
    'pt': 'Português (Portuguese)',
    'ru': 'Русский (Russian)',
    'so': 'Somali',
    'sq': 'Shqip (Albanian)',
    'sw': 'Kiswahili (Swahili)',
    'ta': 'தமிழ் (Tamil)',
    'th': 'ไทย (Thai)',
    'tr': 'Türkçe (Turkish)',
    'ur': 'اردو (Urdu)',
    'uz': 'Oʻzbekcha (Uzbek)',
    'va': 'वज़ौरा/वैशाखी (Varang)'
};

// Languages that have embedded fallbacks (always available)
const EMBEDDED_LANGS = ['en', 'ar', 'ur'];

// Default available langs (fallback if GitHub API fails)
const DEFAULT_AVAILABLE_LANGS = Object.keys(LANGUAGE_NAMES);

// Cached available languages (persisted in localStorage)
const LANG_CACHE_KEY = 'kht_available_langs';
const LANG_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const LINGVA_HOSTS = [
    'https://lingva.ml',
    'https://translate.plausibility.cloud',
];
// [migrated → appState.translator.lingvaIdx] (js/state.js)

const LIBRE_HOSTS = ['https://libretranslate.com'];

// ═══════════════════════════════════════════════
// OFFLINE CACHE SYSTEM (v4.6)
// ═══════════════════════════════════════════════

const CACHE_KEYS = {
    PRAYER_DATA: 'kht_cache_prayer',
    PRAYER_COORDS: 'kht_cache_coords',
    PRAYER_METHOD: 'kht_cache_method',
    DUAS: 'kht_cache_duas',
    QURAN_PREFIX: 'kht_cache_quran_',
    QURAN_INDEX: 'kht_cache_quran_idx',
};

const TX_MIN_INTERVAL = 1500; // ms between API calls (respects free-tier rate limits)
const TX_MAX_CHARS = 400;     // flush buffer when it grows beyond this

const SURAH_LIST = [
    "Al-Fatiha","Al-Baqarah","Aal-Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus",
    "Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Taha",
    "Al-Anbiya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-Ankabut","Ar-Rum",
    "Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir",
    "Fussilat","Ash-Shura","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf",
    "Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadilah","Al-Hashr","Al-Mumtahanah",
    "As-Saff","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij",
    "Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","Abasa",
    "At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad",
    "Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-Adiyat",
    "Al-Qari'ah","At-Takathur","Al-Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr",
    "Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas"
];

// [migrated → appState.quran.cache / .showArabic / .showTranslit / .showTrans] (js/state.js)

const QA_SPEEDS = [0.75, 1, 1.25, 1.5];

const DUAS_JSON_URL = 'duas.json';
// [migrated → appState.dua.data / appState.dua.currentFilter] (js/state.js)

const KAABA_LAT = 21.4225, KAABA_LNG = 39.8262;


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { VALID_SKINS, IS_ANDROID, IS_IOS, IS_CHROME, RESTART_DELAY, TUT_TOTAL, RTL_LANGS, QURAN_RTL_EDITIONS, LANGUAGE_NAMES, EMBEDDED_LANGS, DEFAULT_AVAILABLE_LANGS, LANG_CACHE_KEY, LANG_CACHE_TTL, LINGVA_HOSTS, LIBRE_HOSTS, CACHE_KEYS, TX_MIN_INTERVAL, TX_MAX_CHARS, SURAH_LIST, QA_SPEEDS, DUAS_JSON_URL, KAABA_LAT, KAABA_LNG });

export { VALID_SKINS, IS_ANDROID, IS_IOS, IS_CHROME, RESTART_DELAY, TUT_TOTAL, RTL_LANGS, QURAN_RTL_EDITIONS, LANGUAGE_NAMES, EMBEDDED_LANGS, DEFAULT_AVAILABLE_LANGS, LANG_CACHE_KEY, LANG_CACHE_TTL, LINGVA_HOSTS, LIBRE_HOSTS, CACHE_KEYS, TX_MIN_INTERVAL, TX_MAX_CHARS, SURAH_LIST, QA_SPEEDS, DUAS_JSON_URL, KAABA_LAT, KAABA_LNG };
