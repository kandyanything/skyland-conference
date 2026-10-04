#!/usr/bin/env node
/**
 * Build data/videos.json from NFHS Network broadcasts of member schools.
 *
 *   node scripts/build-nfhs-videos.js [--weeks 6] [--max 24]
 *
 * School slugs come from the sitemap NFHS publishes for crawlers
 * (sitemap-school-sports_index.xml.gz, named in their robots.txt), not from
 * /search/, which robots.txt disallows. Only /schools/ and /events/ pages are
 * read, both of which are permitted.
 *
 * Matching school names to slugs by similarity is NOT safe here and was tried
 * first: it put Central Regional in Newark, Manchester Township in Haledon
 * (Passaic County), and collapsed Brick Township into Brick Memorial, Freehold
 * Township into Freehold Boro, Jackson Memorial into Jackson Liberty and Red
 * Bank Regional into Red Bank Catholic - seven wrong schools out of 48, each
 * of which would have published another school's video. So: every slug must
 * contain the school's distinctive words, no slug may serve two schools, and
 * the genuinely irregular ones are listed by hand below.
 *
 * Thumbnails are the real broadcast frame at
 * social.nfhsnetwork.com/thumbnails/<gameId>_nfhs_net.jpg, which only exists
 * once a game has aired - so it doubles as the test for "this has video".
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const arg = (f, d) => process.argv.includes(f) ? process.argv[process.argv.indexOf(f) + 1] : d;
const WEEKS = Number(arg('--weeks', 6));
const MAX = Number(arg('--max', 24));
const MAP_ONLY = process.argv.includes('--map-only');   // map schools to slugs, then stop

/* Per-site configuration. The only thing that differs between conferences is
   which school names NFHS files under a different slug, so that lives in
   scripts/nfhs-overrides.json and this script is identical on every site.

     { "conference": "Big North",
       "overrides": { "Don Bosco Prep": "don-bosco-preparatory-high-school-ramsey-nj",
                      "Mater Dei High School": null } }

   null means the school is genuinely not on NFHS Network, which is different
   from being absent (absent = the strict matcher resolves it unaided). */
const CFG_PATH = path.join(__dirname, 'nfhs-overrides.json');
let CFG = { conference: '', overrides: {} };
try {
    CFG = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
} catch (e) {
    if (fs.existsSync(CFG_PATH)) { console.error('  nfhs-overrides.json is unreadable: ' + e.message); process.exit(1); }
    console.log('  no scripts/nfhs-overrides.json - relying on the strict matcher alone');
}
const OVERRIDE = CFG.overrides || {};
const CONF = CFG.conference || 'Conference';

/* The level/gender/sport shown on an event card, e.g. "Varsity Girls Soccer".
   It sits between the end of the card anchor and the broadcast run time. Two
   fixtures between the same schools on the same day share an aria-label, so
   without this they render as identical tiles. */
const SPORT_WORDS = /(soccer|football|volleyball|basketball|baseball|softball|wrestling|hockey|lacrosse|tennis|golf|swimming|track|cross country|field hockey|water polo|gymnastics|bowling|cheer|rugby|crew|fencing|skiing|diving|band|concert|graduation|ceremony)/i;
function cardSport(html, anchorIndex) {
    const open = html.indexOf('>', anchorIndex);
    if (open < 0) return '';
    const text = html.slice(open + 1, open + 2500)
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // The first text node after the anchor is the level/gender/sport. A run
    // time follows it only on games that have aired, so it must not be
    // required - demanding it dropped 13 of 20 cards.
    let label = text.split('<')[0].trim();
    label = label.replace(/\s+\d{1,2}:\d{2}(?::\d{2})?$/, '').trim();
    if (label.length > 60) return '';
    return SPORT_WORDS.test(label) ? label : '';
}
async function get(url, asBuffer) {
    for (let a = 0; a < 3; a++) {
        try {
            const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
            if (res.ok) return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text();
            if (res.status === 404) return null;
        } catch { /* retry */ }
        await sleep(900);
    }
    return null;
}
async function exists(url) {
    try { const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': UA } }); return r.ok; }
    catch { return false; }
}

const STOP = new Set(['high', 'school', 'regional', 'the', 'nj', 'of', 'at', 'senior']);
const words = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(w => w && !STOP.has(w));

(async () => {
    /* ---- 1. slugs from the published sitemap ---- */
    const idx = await get('https://sitemap.nfhsnetwork.com/nfhs-www/sitemap-school-sports_index.xml.gz', true);
    if (!idx) throw new Error('sitemap index unavailable');
    const parts = [...zlib.gunzipSync(idx).toString('utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const slugs = new Set();
    for (const p of parts) {
        const buf = await get(p, true);
        if (!buf) continue;
        for (const m of zlib.gunzipSync(buf).toString('utf8').matchAll(/\/schools\/([a-z0-9-]+-nj)\//g)) slugs.add(m[1]);
        await sleep(400);
    }
    console.log(`  ${slugs.size} NJ school slugs from the sitemap`);

    /* ---- 2. map our roster onto them, strictly ---- */
    const schools = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schools.json'), 'utf8')).schools;
    const map = [], unmapped = [];
    for (const sc of schools) {
        if (Object.prototype.hasOwnProperty.call(OVERRIDE, sc.name)) {
            const o = OVERRIDE[sc.name];
            if (o) map.push({ ...sc, nfhs: o }); else unmapped.push(`${sc.name} (not on NFHS)`);
            continue;
        }
        const w = words(sc.name);
        // every distinctive word of the school name must appear in the slug
        // compare WHOLE hyphen-separated words, not substrings
        const hits = [...slugs].filter(s => {
            const parts = new Set(s.split('-'));
            return w.every(x => parts.has(x));
        });
        if (hits.length === 1) map.push({ ...sc, nfhs: hits[0] });
        else unmapped.push(`${sc.name}${hits.length ? ` (ambiguous: ${hits.join(', ')})` : ' (no slug)'}`);
    }
    // a slug serving two schools means one of them is wrong
    const bySlug = {};
    map.forEach(m => (bySlug[m.nfhs] = bySlug[m.nfhs] || []).push(m.name));
    const clash = Object.entries(bySlug).filter(([, v]) => v.length > 1);
    if (clash.length) {
        console.log('  SLUG COLLISIONS - refusing to continue:');
        clash.forEach(([s, v]) => console.log(`    ${s} <- ${v.join(' | ')}`));
        process.exit(1);
    }
    console.log(`  mapped ${map.length}/${schools.length}`);
    unmapped.forEach(u => console.log(`    unmapped: ${u}`));
    if (MAP_ONLY) return;

    /* ---- 3. harvest recent games ---- */
    const cutoff = new Date(Date.now() - WEEKS * 7 * 864e5);
    const byGame = new Map();
    for (const s of map) {
        const html = await get(`https://www.nfhsnetwork.com/schools/${s.nfhs}`);
        await sleep(700);
        if (!html) { console.log(`  ${s.name}: page unavailable`); continue; }

        // each card: <a href="/events/<slug>/gamXXXX" ... aria-label="Title">
        const cards = [...html.matchAll(/href="(\/events\/[a-z0-9-]+\/(gam[a-z0-9]+))"[^>]*aria-label="([^"]*)"/g)];
        // dates appear as ISO stamps in the surrounding markup
        let added = 0;
        for (const c of cards) {
            const [, href, id, label] = c;
            if (byGame.has(id)) continue;
            const near = html.slice(Math.max(0, c.index - 1500), c.index + 1500);
            const iso = (near.match(/(\d{4}-\d{2}-\d{2})T/) || [])[1];
            if (!iso) continue;
            const when = new Date(iso + 'T12:00:00Z');
            if (when > new Date() || when < cutoff) continue;      // past 6 weeks only
            byGame.set(id, {
                id, url: `https://www.nfhsnetwork.com${href}`,
                title: label.replace(/\s+/g, ' ').trim(), date: iso, school: s.name,
                sport: cardSport(html, c.index),
            });
            added++;
        }
        console.log(`  ${s.name.padEnd(40)} ${cards.length} cards, ${added} in window`);
    }
    console.log(`\n  ${byGame.size} distinct games in the last ${WEEKS} weeks`);

    /* ---- 4. keep only those with a real broadcast frame ---- */
    const kept = [];
    for (const g of [...byGame.values()].sort((a, b) => b.date.localeCompare(a.date))) {
        if (kept.length >= MAX) break;
        const frame = `https://social.nfhsnetwork.com/thumbnails/${g.id}_nfhs_net.jpg`;
        if (!(await exists(frame))) continue;    // no frame = never aired
        kept.push({ url: g.url, source: 'nfhs', title: g.title, date: g.date, sport: g.sport || '' });
        await sleep(250);
    }
    console.log(`  ${kept.length} have an aired broadcast frame`);

    fs.writeFileSync(path.join(ROOT, 'data', 'videos.json'), JSON.stringify({
        _comment: CONF + ' Vision. NFHS Network broadcasts of member schools, newest first. '
            + 'No "thumb" is stored: the renderer derives the broadcast frame from the game id '
            + '(social.nfhsnetwork.com/thumbnails/<id>_nfhs_net.jpg), and every entry here was '
            + 'checked to have one. Rebuild with scripts/build-nfhs-videos.js.',
        generated: new Date().toISOString(),
        videos: kept,
    }, null, 2) + '\n', 'utf8');
    console.log(`  wrote data/videos.json`);
})();
