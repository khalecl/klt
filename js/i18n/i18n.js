/* Khutbah Live Translator — i18n/i18n.js
   Complete localization system: embedded fallback, lang/*.json,
   localStorage cache, GitHub discovery, RTL/LTR, live switching.
   Extracted verbatim from index.html v4.6.1-baseline (Refactor Task 5). */

const LOCALE_FALLBACK = {
    en: {
        _meta: { lang:'en', name:'English', nativeName:'English', dir:'ltr' },
        headerSubtitle:'Khutbah Live Translator', tabTranslator:'Translator', tabQuran:'Quran',
        tabDua:"Du'a", tabPrayer:'Prayer', tabSettings:'Settings', tabAbout:'About',
        lblSource:'Source', lblTranslateTo:'Translate to', statusReady:'Tap microphone to start',
        statusListening:'🎤 Listening...', statusSpeechDetected:'🎤 Speech detected...',
        btnClear:'Clear', btnSave:'Save', btnRec:'Rec', btnRecStop:'Stop', apiReady:'API Ready',
        emptyMsg:'Tap the microphone to begin\nlive translation of the Khutbah',
        clearConfirm:'Clear all translations?', noTranslations:'No translations to save',
        qArabic:'Arabic', qTranslit:'Transliteration', qTranslation:'Translation',
        qSelectSurah:'— Select a Surah —', qLoading:'Loading Surah...',
        duaAll:'All', duaLoading:"Loading Du'as...",
        prayerNextPrayer:'Next Prayer', prayerAdhanAt:'Adhan at',
        prayerHrs:'hrs', prayerMin:'min', prayerSec:'sec',
        qiblaShow:'Show Qibla Compass', qiblaHide:'Hide Qibla Compass',
        qiblaDirLabel:'Qibla Direction from North',
        setUILang:'🌐 App Language', setTranslation:'Translation', setAudio:'Audio',
        setSpeechFlow:'Speech Flow', setEngine:'Translation Engine',
        btnSaveSettings:'Save Settings ✓', aboutTitle:'Khutbah Live Translator',
        tutSkip:'Skip',tutBack:'← Back', tutNext:'Next →', tutStart:'Start ✓',
        tutLangSelectTitle:'Choose Your Language', tutLangSelectDesc:'Select your preferred interface language. This changes the app menus and buttons to your language. You can change this later in Settings.',
        tutLangSelectTip:'You can also change the sermon translation languages separately in the Translator tab.',
        settingsSaved:'Settings saved ✓\nNoise filter & gate changes take effect next time you start listening.',
        setSkin:'🎨 App Skin', skinMasjidNight:'Masjid Night', skinDesertSand:'Desert Sand',
        skinMidnightBlue:'Midnight Blue', skinOttomanRose:'Ottoman Rose',
        skinPureLight:'Pure Light', skinRoyalPurple:'Royal Purple'
    },
    ar: {
        _meta: { lang:'ar', name:'Arabic', nativeName:'العربية', dir:'rtl' },
        headerSubtitle:'مترجم الخطبة الحي', tabTranslator:'المترجم', tabQuran:'القرآن',
        tabDua:'الدعاء', tabPrayer:'الصلاة', tabSettings:'الإعدادات', tabAbout:'حول',
        lblSource:'لغة المصدر', lblTranslateTo:'ترجم إلى', statusReady:'اضغط على المايكروفون للبدء',
        statusListening:'🎤 جاري الاستماع...', statusSpeechDetected:'🎤 تم اكتشاف كلام...',
        btnClear:'مسح', btnSave:'حفظ', btnRec:'تسجيل', btnRecStop:'إيقاف', apiReady:'API جاهز',
        emptyMsg:'اضغط على المايكروفون لبدء\nالترجمة المباشرة للخطبة',
        clearConfirm:'مسح جميع الترجمات؟', noTranslations:'لا توجد ترجمات للحفظ',
        qArabic:'عربي', qTranslit:'نقل صوتي', qTranslation:'ترجمة',
        qSelectSurah:'— اختر سورة —', qLoading:'جاري تحميل السورة...',
        duaAll:'الكل', duaLoading:'جاري تحميل الأدعية...',
        prayerNextPrayer:'الصلاة القادمة', prayerAdhanAt:'الأذان في',
        prayerHrs:'ساعة', prayerMin:'دقيقة', prayerSec:'ثانية',
        qiblaShow:'إظهار بوصلة القبلة', qiblaHide:'إخفاء بوصلة القبلة',
        qiblaDirLabel:'اتجاه القبلة من الشمال',
        setUILang:'🌐 لغة التطبيق', setTranslation:'الترجمة', setAudio:'الصوت',
        setSpeechFlow:'تدفق الكلام', setEngine:'محرك الترجمة',
        btnSaveSettings:'حفظ الإعدادات ✓', aboutTitle:'مترجم الخطبة الحي',
        tutSkip:'تخطي', tutBack:'رجوع →',tutNext:'← التالي', tutStart:'ابدأ ✓',
        tutLangSelectTitle:'اختر لغتك', tutLangSelectDesc:'اختر لغة الواجهة المفضلة. هذا يغير قوائم وأزرار التطبيق إلى لغتك. يمكنك تغيير هذا لاحقًا في الإعدادات.',
        tutLangSelectTip:'يمكنك أيضًا تغيير لغات ترجمة الخطبة بشكل منفصل في علامة التبويب المترجم.',
        settingsSaved:'تم حفظ الإعدادات ✓\nتغييرات فلتر الضوضاء تسري في المرة القادمة.',
        setSkin:'🎨 مظهر التطبيق', skinMasjidNight:'ليلة المسجد', skinDesertSand:'رمال الصحراء',
        skinMidnightBlue:'أزرق منتصف الليل', skinOttomanRose:'وردة عثمانية',
        skinPureLight:'ضوء نقي', skinRoyalPurple:'بنفسجي ملكي'
    },
    ur: {
        _meta: { lang:'ur', name:'Urdu', nativeName:'اردو', dir:'rtl' },
        headerSubtitle:'خطبہ لائیو ترجمان', tabTranslator:'ترجمان', tabQuran:'قرآن',
        tabDua:'دعا', tabPrayer:'نماز', tabSettings:'ترتیبات', tabAbout:'تعارف',
        lblSource:'ماخذ زبان', lblTranslateTo:'ترجمہ کریں', statusReady:'شروع کرنے کے لیے مائیکروفون دبائیں',
        statusListening:'🎤 سن رہا ہے...', statusSpeechDetected:'🎤 تقریر کا پتہ چلا...',
        btnClear:'صاف', btnSave:'محفوظ', btnRec:'ریکارڈ', btnRecStop:'بند', apiReady:'API تیار',
        emptyMsg:'خطبے کا براہ راست ترجمہ شروع\nکرنے کے لیے مائیکروفون دبائیں',
        clearConfirm:'تمام ترجمے صاف کریں؟', noTranslations:'محفوظ کرنے کے لیے کوئی ترجمہ نہیں',
        qArabic:'عربی', qTranslit:'نقل حرفی', qTranslation:'ترجمہ',
        qSelectSurah:'— سورۃ منتخب کریں —', qLoading:'سورۃ لوڈ ہو رہی ہے...',
        duaAll:'تمام', duaLoading:'دعا لوڈ ہو رہی ہے...',
        prayerNextPrayer:'اگلی نماز', prayerAdhanAt:'اذان ہو گی',
        prayerHrs:'گھنٹے', prayerMin:'منٹ', prayerSec:'سیکنڈ',
        qiblaShow:'قبلہ کی طرف دکھائیں', qiblaHide:'قبلہ چھپائیں',
        qiblaDirLabel:'شمال سے قبلے کی سمت',
        setUILang:'🌐 ایپ کی زبان', setTranslation:'ترجمہ', setAudio:'آڈیو',
        setSpeechFlow:'تقریر کا بہاؤ', setEngine:'ترجمہ انجن',
        btnSaveSettings:'سیٹنگز محفوظ کریں ✓', aboutTitle:'خطبہ لائیو ترجمان',
        tutSkip:'چھوڑیں',tutBack:'واپس →', tutNext:'← اگلا', tutStart:'شروع ✓',
        tutLangSelectTitle:'اپنی زبان منتخب کریں', tutLangSelectDesc:'اپنی ترجیحی انٹرفیس زبان منتخب کریں۔ یہ ایپ کے مینو اور بٹن کو آپ کی زبان میں تبدیل کرتا ہے۔ آپ اسے بعد میں سیٹنگز میں تبدیل کر سکتے ہیں۔',
        tutLangSelectTip:'آپ خطبہ کے ترجمہ کی زبانیں بھی الگ سے مترجم ٹیب میں تبدیل کر سکتے ہیں۔',
        settingsSaved:'سیٹنگز محفوظ ہو گئیں ✓\nنویز فلٹر کی تبدیلیاں اگلی بار نافذ ہوں گی۔',
        setSkin:'🎨 ایپ کا اسکن', skinMasjidNight:'مسجد کی رات', skinDesertSand:'ریگستان کی ریت',
        skinMidnightBlue:'درمیانی شب کا نیلا', skinOttomanRose:'عثمانی گلاب',
        skinPureLight:'صاف روشنی', skinRoyalPurple:'شاہی بنفشی'
    }
};

// [migrated → appState.ui.currentLocale / appState.ui.currentLang] (js/state.js)

async function loadLocale(lang) {
    // ── For en/ar/ur: ALWAYS start with embedded fallback (guaranteed to work) ──
    // Then try to enrich with the full lang/ file (has more keys)
    if (LOCALE_FALLBACK[lang]) {
        let locale = { ...LOCALE_FALLBACK[lang] };
        console.log(`[i18n] Using embedded locale for ${lang}`);

        // Try to load richer version from lang/ folder (has ~140 keys vs ~40 embedded)
        try {
            const baseUrl = document.baseURI ? new URL('.', document.baseURI).href : '';
            const url = baseUrl + 'lang/' + lang + '.json';
            const res = await fetchWithTimeout(url, {}, 4000);
            if (res.ok) {
                const fullData = await res.json();
                locale = { ...locale, ...fullData }; // merge: full file wins
                console.log(`[i18n] Enriched ${lang} from lang/ folder (${Object.keys(fullData).length} keys)`);
                try { localStorage.setItem('kht_locale_' + lang, JSON.stringify(fullData)); } catch(e) {}
            }
        } catch(e) {
            console.warn(`[i18n] Could not load lang/${lang}.json, using embedded only`);
            // Try localStorage cache as enrichment
            try {
                const cached = localStorage.getItem('kht_locale_' + lang);
                if (cached) {
                    const cachedData = JSON.parse(cached);
                    locale = { ...locale, ...cachedData };
                    console.log(`[i18n] Enriched ${lang} from localStorage cache`);
                }
            } catch(e2) {}
        }
        return locale;
    }

    // ── For all other languages (tr, id, fr, es, ms, etc.): no embedded fallback ──
    // Must load from lang/ folder or cache; if both fail, fall back to English

    // Try lang/ folder
    try {
        const baseUrl = document.baseURI ? new URL('.', document.baseURI).href : '';
        const url = baseUrl + 'lang/' + lang + '.json';
        const res = await fetchWithTimeout(url, {}, 4000);
        if (res.ok) {
            const data = await res.json();
            console.log(`[i18n] Loaded lang/${lang}.json from server`);
            try { localStorage.setItem('kht_locale_' + lang, JSON.stringify(data)); } catch(e) {}
            return data;
        }
    } catch(e) {
        console.warn(`[i18n] Failed to load lang/${lang}.json:`, e.message);
    }

    // Try localStorage cache
    try {
        const cached = localStorage.getItem('kht_locale_' + lang);
        if (cached) {
            console.log(`[i18n] Using cached locale for ${lang}`);
            return JSON.parse(cached);
        }
    } catch(e) {}

    // No data at all — fall back to English
    console.log(`[i18n] No locale for ${lang}, falling back to English`);
    return LOCALE_FALLBACK.en;
}

function applyLocale(locale) {
    currentLocale = locale;
    const meta = locale._meta || {};
    const dir = meta.dir || 'ltr';

    // Set document direction for RTL languages
    document.documentElement.dir = dir;
    document.documentElement.lang = meta.lang || 'en';

    // Apply body direction class for CSS targeting
    document.body.classList.toggle('rtl-ui', dir === 'rtl');

    // Replace all data-i18n elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (locale[key] !== undefined) {
            // Handle placeholders differently
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = locale[key];
            } else {
                el.textContent = locale[key];
            }
        }
    });

    // Handle data-i18n-placeholder separately
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (locale[key] !== undefined) el.placeholder = locale[key];
    });

    // Update dynamic elements that aren't tagged
    const stsTxt = document.getElementById('stsTxt');
    if (stsTxt && stsTxt.textContent.includes('Tap microphone') || stsTxt && stsTxt.textContent.includes('دبائیں') || stsTxt && stsTxt.textContent.includes('المايكروفون')) {
        stsTxt.textContent = locale.statusReady || 'Tap microphone to start';
    }

    console.log(`[i18n] Applied locale: ${meta.lang || 'unknown'} (${meta.nativeName || meta.name || ''}), dir=${dir}`);
}

// Get a translated string by key (for use in JS code)
function t(key, replacements) {
    let str = currentLocale[key] || LOCALE_FALLBACK.en[key] || key;
    if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
            str = str.replace(`{${k}}`, v);
        }
    }
    return str;
}

async function changeUILang(lang) {
    currentLang = lang;
    localStorage.setItem('kht_ui_lang', lang);
    const locale = await loadLocale(lang);
    applyLocale(locale);
    // Also update tutorial language selector if it exists
    const tutSel = document.getElementById('tutLangSelect');
    if (tutSel) {
        tutSel.value = lang;
    }
}

async function initI18n() {
    const savedLang = localStorage.getItem('kht_ui_lang') || 'en';
    currentLang = savedLang;
    // Note: uiSel.value is now set by initAvailableLangs() which runs in parallel
    const locale = await loadLocale(savedLang);
    applyLocale(locale);
}

// ═══════════════════════════════════════════════
// SKIN / THEME SYSTEM — cached in localStorage
// ═══════════════════════════════════════════════

async function fetchAvailableLangsFromGitHub() {
    // Try to get cached languages first
    try {
        const cached = localStorage.getItem(LANG_CACHE_KEY);
        if (cached) {
            const { ts, langs } = JSON.parse(cached);
            if (Date.now() - ts < LANG_CACHE_TTL) {
                console.log('[i18n] Using cached available languages:', langs);
                return langs;
            }
        }
    } catch(e) {}

    // Try GitHub API to list files in lang/ directory
    const githubApiUrl = 'https://api.github.com/repos/khalecl/Khutbah/contents/lang';
    try {
        const res = await fetchWithTimeout(githubApiUrl, {}, 5000);
        if (res.ok) {
            const files = await res.json();
            // Extract language codes from filenames (remove .json extension)
            const langs = files
                .filter(f => f.name.endsWith('.json'))
                .map(f => f.name.replace('.json', ''))
                .filter(code => LANGUAGE_NAMES[code]); // Only include known languages

            if (langs.length > 0) {
                // Cache the result
                try {
                    localStorage.setItem(LANG_CACHE_KEY, JSON.stringify({
                        ts: Date.now(),
                        langs: langs
                    }));
                } catch(e) {}
                console.log('[i18n] Fetched available languages from GitHub:', langs);
                return langs;
            }
        }
    } catch(e) {
        console.warn('[i18n] Could not fetch languages from GitHub API:', e.message);
    }

    // Fallback: try to check which lang files exist by attempting to load them
    // This works if the app is deployed on GitHub Pages at khalecl.github.io/Khutbah
    const langs = [];
    const baseUrl = document.baseURI ? new URL('.', document.baseURI).href : '';

    // Try loading known languages and check if they exist
    for (const code of Object.keys(LANGUAGE_NAMES)) {
        try {
            const url = baseUrl + 'lang/' + code + '.json';
            const res = await fetchWithTimeout(url, {}, 1500);
            if (res.ok) langs.push(code);
        } catch(e) {}
    }

    if (langs.length > 0) {
        console.log('[i18n] Discovered available languages by probing:', langs);
        return langs;
    }

    // Ultimate fallback: return all known languages
    console.log('[i18n] Using default language list');
    return DEFAULT_AVAILABLE_LANGS;
}

async function initAvailableLangs() {
    const uiSel = document.getElementById('uiLangSelect');
    const tutSel = document.getElementById('tutLangSelect');
    if (!uiSel) return;

    const savedLang = localStorage.getItem('kht_ui_lang') || 'en';
    const availableLangs = await fetchAvailableLangsFromGitHub();

    // Sort languages: embedded first (en, ar, ur), then alphabetically by native name
    const sortedLangs = [...availableLangs].sort((a, b) => {
        const aEmbedded = EMBEDDED_LANGS.includes(a);
        const bEmbedded = EMBEDDED_LANGS.includes(b);
        if (aEmbedded && !bEmbedded) return -1;
        if (!aEmbedded && bEmbedded) return 1;
        const nameA = LANGUAGE_NAMES[a] || a;
        const nameB = LANGUAGE_NAMES[b] || b;
        return nameA.localeCompare(nameB);
    });

    // Build HTML options
    let html = '';
    for (const code of sortedLangs) {
        const name = LANGUAGE_NAMES[code] || code;
        const selected = code === savedLang ? ' selected' : '';
        html += `<option value="${code}"${selected}>${name}</option>`;
    }

    // Update settings dropdown
    uiSel.innerHTML = html;

    // Also update tutorial language selector if it exists and has default options
    if (tutSel && tutSel.options.length <= 1) {
        tutSel.innerHTML = html;
    }

    console.log('[i18n] Populated language dropdown with', sortedLangs.length, 'languages');
}

// ── Translation Cache ──
// [migrated → appState.translator.txCache / appState.translator.apiStats] (js/state.js)

// ── Settings ──
// [migrated → appState.settings.cfg] (js/state.js — defaults preserved verbatim)

// ── Lingva instances ──

function populateTutLangSelect() {
    const sel = document.getElementById('tutLangSelect');
    if (!sel) return;

    // Check if already populated
    if (sel.options.length > 1 && sel.options[0].value !== '') return;

    // Get saved language or default to English
    const savedLang = localStorage.getItem('kht_ui_lang') || 'en';

    // Build options from LANGUAGE_NAMES
    const codes = Object.keys(LANGUAGE_NAMES).sort((a, b) => {
        const aEmbedded = EMBEDDED_LANGS.includes(a);
        const bEmbedded = EMBEDDED_LANGS.includes(b);
        if (aEmbedded && !bEmbedded) return -1;
        if (!aEmbedded && bEmbedded) return 1;
        const nameA = LANGUAGE_NAMES[a] || a;
        const nameB = LANGUAGE_NAMES[b] || b;
        return nameA.localeCompare(nameB);
    });

    let html = '';
    for (const code of codes) {
        const name = LANGUAGE_NAMES[code] || code;
        const selected = code === savedLang ? ' selected' : '';
        html += `<option value="${code}"${selected}>${name}</option>`;
    }

    sel.innerHTML = html;
}

// ══════════════════════════════════════════════
// AUDIO VISUALIZER
// ══════════════════════════════════════════════


/* ── Global bridge: inline HTML handlers and cross-module calls
      resolve these through the global scope. Removed per-name as
      call sites migrate to explicit imports. ── */
Object.assign(window, { LOCALE_FALLBACK, loadLocale, applyLocale, t, changeUILang, initI18n, fetchAvailableLangsFromGitHub, initAvailableLangs, populateTutLangSelect });

export { LOCALE_FALLBACK, loadLocale, applyLocale, t, changeUILang, initI18n, fetchAvailableLangsFromGitHub, initAvailableLangs, populateTutLangSelect };
