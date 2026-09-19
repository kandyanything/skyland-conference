'use strict';
/**
 * scripts/build-news.js
 *
 * Scrapes recent news about this conference from NJ media RSS feeds and Google
 * News, then writes data/news.json for the redesign-news.js renderer.
 *
 *   node scripts/build-news.js [--dry] [--explain]
 *
 * Based on the press wire logic in the Athlitiq platform (cataldij/athlitiq).
 * No database â€” output is a committed JSON file refreshed on the same 3-hour
 * cron as the schedule rebuild.
 */

// â”€â”€â”€ CONFERENCE CONFIGURATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CONF_NAME    = 'Skyland Conference';
const CONF_SHORT   = 'Skyland';           // case-sensitive â€” used in headline matching
const EXTRA_QUERIES = [];             // extra Google News search phrases if needed
const MAX_ITEMS    = 7;              // articles kept in news.json, newest first
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'data', 'news.json');
const DRY     = process.argv.includes('--dry');
const EXPLAIN = process.argv.includes('--explain');

const schoolsFile = path.join(__dirname, 'ds-schools.json');
const DS_SCHOOLS  = fs.existsSync(schoolsFile) ? JSON.parse(fs.readFileSync(schoolsFile, 'utf8')) : [];
const SCHOOL_NAMES = DS_SCHOOLS.map(s => s.name);

// â”€â”€â”€ HTTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const UA          = 'conference-press/1.0 (+https://athlitiq.com)';
const REQUEST_CAP = 60;
const MIN_GAP_MS  = 1600;
const lastAt      = new Map();
let   budget      = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function politeFetch(url, init) {
    if (budget >= REQUEST_CAP) throw new Error('REQUEST_BUDGET_EXCEEDED');
    const host = hostOf(url);
    const last = lastAt.get(host) ?? 0;
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt.set(host, Date.now());
    budget++;
    return fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init?.headers ?? {}) } });
}

// â”€â”€â”€ TEXT UTILITIES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const NAMED_ENTITIES = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    rsquo: 'â€™', lsquo: 'â€˜', ldquo: 'â€œ', rdquo: 'â€',
    mdash: 'â€”', ndash: 'â€“', hellip: 'â€¦',
};

function decodeEntities(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, code) => {
        if (code[0] === '#') {
            const isHex = code[1] === 'x' || code[1] === 'X';
            const n = isHex ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
            return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
        }
        return code.toLowerCase() in NAMED_ENTITIES ? NAMED_ENTITIES[code.toLowerCase()] : whole;
    });
}

function cleanTitle(title, sourceName) {
    const t = decodeEntities(title).trim();
    if (!sourceName) return t;
    const suffix = ` - ${decodeEntities(sourceName).trim()}`;
    return t.endsWith(suffix) ? t.slice(0, -suffix.length).trim() : t;
}

function makePreview(text, title) {
    if (!text) return null;
    let s = decodeEntities(text.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (!s) return null;
    if (s.length > 200) {
        const cut = s.slice(0, 199);
        const sp  = cut.lastIndexOf(' ');
        s = (sp > 0 ? cut.slice(0, sp) : cut) + 'â€¦';
    }
    if (title && s === decodeEntities(title).trim()) return null;
    return s;
}

function normalizeHeadline(s) {
    let t = decodeEntities(s).trim();
    t = t.replace(/\s+-\s+[^-]+$/, '');
    return t.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hostOf(url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function hostMatches(host, domain) {
    const h = host.toLowerCase(), d = domain.toLowerCase();
    return h === d || h.endsWith(`.${d}`);
}

function stripTracking(url) {
    try {
        const u = new URL(url);
        u.hash = '';
        for (const k of [...u.searchParams.keys()])
            if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
        return u.toString();
    } catch { return url; }
}

// â”€â”€â”€ SOURCES & FILTERING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const HOUSE_FEEDS = [
    'https://www.nj.com/arc/outboundfeeds/rss/category/highschoolsports/?outputType=xml',
    'https://www.onnj.com/category/onnj-sports/highschool/feed/',
    'https://wrnjradio.com/feed/',
];

const HOUSE_SOURCES = [
    'nj.com', 'dailyrecord.com', 'northjersey.com', 'tapinto.net', 'patch.com',
    'newjerseyhills.com', 'njherald.com', 'mycentraljersey.com', 'app.com',
    'insidernj.com', 'nj1015.com', 'nfhs.org', 'onnj.com', 'wrnjradio.com',
];

const DENY_HOSTS = [
    'nfhsnetwork.com', 'hudl.com', 'arbiterlive.com',
    'digitalsports.com', 'si.com', 'athlitiq.com',
];

const OG_BLOCKED = ['nj.com'];

// Title must contain at least one sports-related word to be published.
// This prevents crime, politics, and general local news from slipping through
// when a conference school name appears in the dateline or article body.
const SPORTS_TERMS_RE = /\b(soccer|football|basketball|baseball|softball|wrestling|swimming|tennis|lacrosse|volleyball|cross[- ]country|track|field hockey|golf|gymnastics|bowling|fencing|skiing|hockey|rugby|crew|cheerleading|athlete|athletic|athletics|varsity|coaches?|coaching|playoff|championship|tournament|recruit|stat(s)?|sport(s)?|season|rankings?|all-state|all-conference|shutout|hat.trick|assists?|roster|scorer|scoring|goals?|win|wins|victory|defeats?|beats?|standout|signing day|mvp|game|match)\b/i;

const OUTLET_NAMES = {
    'nj.com':              'NJ.com',
    'highschoolsports.nj.com': 'NJ.com',
    'newjerseyhills.com':  'New Jersey Hills',
    'tapinto.net':         'TAPinto',
    'patch.com':           'Patch',
    'dailyrecord.com':     'Daily Record',
    'northjersey.com':     'NorthJersey.com',
    'njherald.com':        'New Jersey Herald',
    'app.com':             'Asbury Park Press',
    'mycentraljersey.com': 'MyCentralJersey',
    'onnj.com':            'On New Jersey',
    'wrnjradio.com':       'WRNJ Radio',
    'maxpreps.com':        'MaxPreps',
};

function outletNameFor(host) {
    for (const [domain, name] of Object.entries(OUTLET_NAMES))
        if (hostMatches(host, domain)) return name;
    return host;
}

function isDenyHost(host) {
    if (host.includes('athlitiq')) return true;
    return DENY_HOSTS.some(d => hostMatches(host, d));
}

const NOT_ARTICLE_SEGS = new Set([
    'school', 'team', 'teams', 'schedule', 'standings', 'scores', 'roster',
    'season', 'stats', 'rankings', 'players',
]);
const FEED_HOSTS = HOUSE_FEEDS.map(hostOf);

function isArticleUrl(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    const host = u.hostname.toLowerCase();
    const segs = u.pathname.split('/').filter(Boolean).map(s => s.toLowerCase());
    if (hostMatches(host, 'highschoolsports.nj.com') && !segs.includes('news')) return false;
    if (segs.some(s => NOT_ARTICLE_SEGS.has(s))) return false;
    const isFeedHost = FEED_HOSTS.some(fh => hostMatches(host, fh));
    if (!isFeedHost && segs.length < 2) return false;
    return true;
}

// â”€â”€â”€ SCHOOL NAME EXPANSION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const BARE_SUFFIXES = [' Regional High School', ' High School', ' Regional'];

function bareSchoolNames(names) {
    const out = [], seen = new Set();
    const add = n => { const k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(n); } };
    const ROMAN_TAIL = /\s+[IVXLC]+$/;
    for (const raw of names) {
        add(raw);
        let s = raw.trim();
        if (s.startsWith('- ')) s = s.slice(2);
        for (const suf of BARE_SUFFIXES) {
            if (s.toLowerCase().endsWith(suf.toLowerCase())) { s = s.slice(0, -suf.length).trim(); break; }
        }
        if (s !== raw.trim() && s.length >= 4) add(s);
        let stripped = true;
        while (stripped) {
            stripped = false;
            if (/ township$/i.test(s)) { s = s.slice(0, -' Township'.length).trim(); stripped = true; }
            else if (ROMAN_TAIL.test(s)) { s = s.replace(ROMAN_TAIL, '').trim(); stripped = true; }
            if (stripped && s.length >= 4) add(s);
        }
    }
    return out;
}

// â”€â”€â”€ RELEVANCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COUNTIES_FP  = /New Jersey Association of Counties|NJAC Foundation/i;
const NJ_MARKER    = /\bN\.?J\.?\b/;
const NJ_FULL      = /new jersey/i;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function phraseRe(phrase) {
    return new RegExp(`\\b${escapeRe(phrase).replace(/\s+/g, '\\s+')}\\b`, 'i');
}

const CTX_SCHOOLS = SCHOOL_NAMES.map((name, i) => ({
    id: String(i),
    name,
    names: bareSchoolNames([name]),
}));

function matchRelevance(text) {
    const shortHit = new RegExp(`\\b${escapeRe(CONF_SHORT)}\\b`).test(text)
        && !COUNTIES_FP.test(text);
    const confHit = phraseRe(CONF_NAME).test(text) || shortHit;

    let schoolName = null, bestIdx = Infinity, bestLen = -1;
    for (const school of CTX_SCHOOLS) {
        for (const n of school.names) {
            if (n.length < 4) continue;
            const m = phraseRe(n).exec(text);
            if (!m) continue;
            if (m.index < bestIdx || (m.index === bestIdx && n.length > bestLen)) {
                bestIdx = m.index; bestLen = n.length; schoolName = school.name;
            }
        }
    }
    return { confHit, schoolName };
}

function classify(title, preview, url) {
    const host = hostOf(url);
    if (isDenyHost(host)) return null;
    if (!isArticleUrl(url)) return null;

    const text      = `${title} ${preview || ''}`;
    const onSources = HOUSE_SOURCES.some(s => hostMatches(host, s))
        || FEED_HOSTS.some(fh => hostMatches(host, fh));
    if (!onSources) return null;   // only publish from known NJ outlets

    const { confHit, schoolName } = matchRelevance(text);
    const schoolHit = schoolName !== null
        && (onSources || NJ_MARKER.test(text) || NJ_FULL.test(text));

    if (!confHit && !schoolHit) return null;
    if (!SPORTS_TERMS_RE.test(title)) return null;
    return { schoolName };
}

// â”€â”€â”€ RSS PARSER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function grabTag(chunk, tag) {
    const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, 'i');
    const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
    const m = chunk.match(cdata) ?? chunk.match(plain);
    return m ? m[1].trim() : null;
}

function parseRss(xml) {
    const out   = [];
    const parts = xml.split(/<item[ >]/i).slice(1);
    for (const raw of parts) {
        const end   = raw.search(/<\/item>/i);
        const chunk = end >= 0 ? raw.slice(0, end) : raw;
        const title = grabTag(chunk, 'title');
        const link  = grabTag(chunk, 'link');
        if (!title || !link) continue;
        const srcM  = chunk.match(/<source\s+url=["']([^"']*)["'][^>]*>([^<]*)<\/source>/i);
        const medM  = chunk.match(/<media:content\s+[^>]*\burl=["']([^"']*)["']/i);
        out.push({
            title:       decodeEntities(title),
            link:        decodeEntities(link),
            description: grabTag(chunk, 'description'),
            pubDate:     grabTag(chunk, 'pubDate'),
            sourceUrl:   srcM ? decodeEntities(srcM[1]) : null,
            sourceName:  srcM ? decodeEntities(srcM[2]).trim() : null,
            imageUrl:    medM ? decodeEntities(medM[1])  : null,
        });
    }
    return out;
}

// â”€â”€â”€ OG FETCH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function metaTag(html, prop) {
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
    const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
    return html.match(a)?.[1] ?? html.match(b)?.[1];
}

async function fetchOg(url) {
    try {
        const res = await politeFetch(url);
        if (!res.ok) return null;
        const html = await res.text();
        return {
            image:         metaTag(html, 'og:image') ?? metaTag(html, 'twitter:image'),
            description:   metaTag(html, 'og:description'),
            publishedTime: metaTag(html, 'article:published_time'),
        };
    } catch { return null; }
}

// â”€â”€â”€ GOOGLE NEWS DECODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Verbatim from cataldij/athlitiq scraper/press.ts â€” verified working Sep 2026.
async function decodeGoogleNewsUrl(id) {
    try {
        const page = await (await politeFetch(`https://news.google.com/rss/articles/${id}`)).text();
        const sg   = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
        const ts   = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
        if (!sg || !ts) return null;
        const inner = JSON.stringify([
            'garturlreq',
            [['X','X',['X','X'],null,null,1,1,'US:en',null,1,null,null,null,null,null,0,1],'X','X',1,[1,1,1],1,1,null,0,0,null,0],
            id, Number(ts), sg,
        ]);
        const body = 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
        const res  = await politeFetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body,
        });
        const text = await res.text();
        const line = text.split('\n').find(l => l.includes('garturlres'));
        if (!line) return null;
        const outer = JSON.parse(line);
        return JSON.parse(outer[0][2])[1];
    } catch { return null; }
}

// â”€â”€â”€ DATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function toDateStr(val) {
    if (!val) return null;
    const d = val instanceof Date ? val : new Date(val);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

// â”€â”€â”€ MAIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function main() {
    console.log(`${CONF_NAME} press wire â€” ${new Date().toISOString()}`);
    console.log(`${SCHOOL_NAMES.length} schools  budget cap: ${REQUEST_CAP}`);

    const feedCache  = new Map();
    const candidates = [];
    const rejectLog  = [];

    // ---- step 1: direct house RSS feeds ----
    for (const feedUrl of HOUSE_FEEDS) {
        let items = [];
        try {
            const res = await politeFetch(feedUrl);
            if (res.ok) { items = parseRss(await res.text()); feedCache.set(feedUrl, items); }
            else console.log(`  âš  feed ${feedUrl} â†’ ${res.status}`);
        } catch (e) { console.log(`  âš  feed failed: ${e.message}`); }

        for (const raw of items) {
            const title   = cleanTitle(raw.title, raw.sourceName);
            const preview = makePreview(raw.description, title);
            const url     = stripTracking(raw.link);
            const result  = classify(title, preview, url);
            if (!result) { rejectLog.push({ title, host: hostOf(url) }); continue; }

            const host = hostOf(url);
            let   imageUrl = raw.imageUrl ?? null;
            if (!imageUrl && !OG_BLOCKED.some(d => hostMatches(host, d)) && budget < REQUEST_CAP) {
                const og = await fetchOg(url).catch(() => null);
                if (og?.image) imageUrl = og.image;
            }
            candidates.push({
                title, url,
                date:    toDateStr(raw.pubDate ? new Date(raw.pubDate) : null),
                image:   imageUrl,
                excerpt: preview,
                outlet:  outletNameFor(host),
                school:  result.schoolName,
            });
        }
    }

    // Index NJ.com headlines for short-circuit (skip Google decode of stories we already have)
    const njNorm = new Set();
    for (const items of feedCache.values())
        for (const item of items)
            njNorm.add(normalizeHeadline(cleanTitle(item.title, item.sourceName)));

    // ---- step 2: Google News ----
    const queries = [`"${CONF_NAME}"`, ...EXTRA_QUERIES];
    for (const name of SCHOOL_NAMES) {
        const bare = name
            .replace(/\s+High School$/i, '')
            .replace(/\s+Regional.*$/i, '')
            .replace(/\s+Township$/i, '')
            .trim();
        queries.push(`"${bare}" NJ`);
    }

    let decodeSaved = 0;
    for (const q of queries) {
        if (budget >= REQUEST_CAP) { console.log('  âš  budget reached â€” stopping Google queries'); break; }
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:7d`)}&hl=en-US&gl=US&ceid=US:en`;
        let items = [];
        try {
            const res = await politeFetch(rssUrl);
            if (res.ok) items = parseRss(await res.text());
            else console.log(`  âš  Google News "${q}" â†’ ${res.status}`);
        } catch (e) { console.log(`  âš  Google News "${q}" failed: ${e.message}`); continue; }

        for (const raw of items) {
            const title      = cleanTitle(raw.title, raw.sourceName);
            const sourceHost = raw.sourceUrl ? hostOf(raw.sourceUrl) : '';
            if (sourceHost && isDenyHost(sourceHost)) continue;

            // NJ.com short-circuit: already have this from the house feed
            const isNjSrc = hostMatches(sourceHost, 'nj.com')
                || raw.sourceName?.toLowerCase() === 'nj.com';
            if (isNjSrc && njNorm.has(normalizeHeadline(title))) { decodeSaved++; continue; }

            // Pre-filter on title only (before spending decode requests)
            const { confHit, schoolName } = matchRelevance(title);
            if (!confHit && !schoolName) continue;

            const idM = raw.link.match(/rss\/articles\/([^?]+)/);
            if (!idM) continue;
            if (budget + 2 > REQUEST_CAP) { console.log('  âš  budget reached â€” stopping decode'); break; }

            const finalUrl = await decodeGoogleNewsUrl(idM[1]);
            if (!finalUrl) continue;
            const url  = stripTracking(finalUrl);
            const host = hostOf(url);

            let imageUrl = null, preview = null;
            if (!OG_BLOCKED.some(d => hostMatches(host, d)) && budget < REQUEST_CAP) {
                const og = await fetchOg(url).catch(() => null);
                if (og) { imageUrl = og.image ?? null; preview = makePreview(og.description, title); }
            } else {
                for (const items of feedCache.values()) {
                    const match = items.find(i => stripTracking(i.link) === url);
                    if (match) { imageUrl = match.imageUrl ?? null; preview = makePreview(match.description, title); break; }
                }
            }

            const result = classify(title, preview, url);
            if (!result) { rejectLog.push({ title, host }); continue; }

            const date = toDateStr(raw.pubDate ? new Date(raw.pubDate) : null);
            candidates.push({ title, url, date, image: imageUrl, excerpt: preview,
                outlet: outletNameFor(host), school: result.schoolName });
        }
    }

    console.log(`\ncandidates: ${candidates.length}  rejects: ${rejectLog.length}  decode-saves: ${decodeSaved}  requests: ${budget}/${REQUEST_CAP}`);
    if (EXPLAIN && rejectLog.length)
        rejectLog.slice(0, 20).forEach(r => console.log(`  [reject] ${r.host}  ${r.title.slice(0,70)}`));

    // ---- dedupe by URL ----
    const byUrl = new Map();
    for (const c of candidates) if (!byUrl.has(c.url)) byUrl.set(c.url, c);
    const fresh = [...byUrl.values()];

    // ---- merge with existing (keep previously fetched images / previews) ----
    let existing = [];
    try {
        const raw = JSON.parse(fs.readFileSync(OUT, 'utf8'));
        existing = (raw.news || []).filter(n => n && n.title && n.url && SPORTS_TERMS_RE.test(n.title));
    } catch { /* first run */ }

    const merged = new Map(existing.map(n => [n.url, n]));
    for (const c of fresh) merged.set(c.url, c);  // fresh data wins

    const sorted = [...merged.values()]
        .filter(n => n.date)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, MAX_ITEMS);

    console.log(`${sorted.length} articles in output (max ${MAX_ITEMS})`);

    if (DRY) {
        console.log('\ndry run â€” not writing');
        sorted.slice(0, 8).forEach(n =>
            console.log(`  [${(n.outlet || '?').padEnd(18)}] ${n.date}  ${n.school ? '('+n.school+') ' : ''}${n.title.slice(0,65)}`));
        return;
    }

    fs.writeFileSync(OUT, JSON.stringify({ _generated: new Date().toISOString(), news: sorted }, null, 2));
    console.log(`wrote ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
