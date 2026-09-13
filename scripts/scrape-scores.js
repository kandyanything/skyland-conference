// EXPERIMENTAL / BACKEND ONLY - not wired into the site or the nightly workflow.
//
// Scrapes final scores for a conference off NJ.com's public schedule pages.
// Each game card carries a data-filter-conference attribute (e.g. "Super Essex|NJIC"),
// so we keep only cards whose conferences include the target, then read the two
// teams and their scores straight out of the card.
//
// Run:  node scripts/scrape-scores.js [YYYY-MM-DD] [conference]
//   e.g. node scripts/scrape-scores.js 2025-10-15 "Super Essex"
//        node scripts/scrape-scores.js              (defaults to yesterday, Super Essex)
//
// CAVEATS (why this is backend-only for now):
//   - NJ.com runs DataDome bot protection. This works from a normal/residential
//     IP but will likely be BLOCKED from GitHub Actions / datacenter IPs, so it
//     is NOT safe to put on the nightly pipeline.
//   - Re-publishing NJ.com's compiled scores may run against their terms. This
//     script is for evaluating accuracy, not for automated live use.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE = 'https://highschoolsports.nj.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PAUSE_MS = 900;

// The head-to-head sports NJ.com posts scores for, by season. Cross country and
// track are meet-based and have no head-to-head score, so they are omitted.
const SPORTS = {
    fall:   ['football', 'boyssoccer', 'girlssoccer', 'fieldhockey', 'girlsvolleyball', 'girlstennis'],
    winter: ['boysbasketball', 'girlsbasketball', 'icehockey', 'wrestling', 'boysbowling', 'girlsbowling'],
    spring: ['baseball', 'softball', 'boyslacrosse', 'girlslacrosse', 'boysvolleyball', 'boystennis'],
};
const SPORT_LABEL = {
    football: 'Football', boyssoccer: 'Boys Soccer', girlssoccer: 'Girls Soccer',
    fieldhockey: 'Field Hockey', girlsvolleyball: 'Girls Volleyball', girlstennis: 'Girls Tennis',
    boysbasketball: 'Boys Basketball', girlsbasketball: 'Girls Basketball', icehockey: 'Ice Hockey',
    wrestling: 'Wrestling', boysbowling: 'Boys Bowling', girlsbowling: 'Girls Bowling',
    baseball: 'Baseball', softball: 'Softball', boyslacrosse: 'Boys Lacrosse',
    girlslacrosse: 'Girls Lacrosse', boysvolleyball: 'Boys Volleyball', boystennis: 'Boys Tennis',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function seasonFor(month) {          // month 1-12
    if (month >= 8 && month <= 11) return 'fall';
    if (month === 12 || month <= 2) return 'winter';
    return 'spring';
}

async function fetchDay(sport, y, m, d) {
    const url = `${BASE}/${sport}/schedule/${y}/${m}/${d}`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status === 404) return { blocked: false, html: null };
    const html = await res.text();
    // DataDome serves an interstitial / the page loses its game cards
    if (/datadome|captcha-delivery|blocked/i.test(html) && !html.includes('sked-col')) {
        return { blocked: true, html: null };
    }
    return { blocked: false, html };
}

function parseGames(html, sport, isoDate, confRe) {
    const $ = cheerio.load(html);
    const games = [];
    $('.sked-col').each((i, el) => {
        const card = $(el);
        const conf = card.attr('data-filter-conference') || '';
        if (!confRe.test(conf)) return;
        const teams = card.find('img.sked-image').map((j, im) => ($(im).attr('alt') || '').trim()).get();
        const scores = card.find('.col-auto')
            .map((j, c) => $(c).text().replace(/\s+/g, '')).get()
            .filter(s => /^\d+$/.test(s));
        const txt = card.text().replace(/\s+/g, ' ').trim();
        const status = (txt.match(/\b(FINAL|Halftime|Postponed|PPD|Cancell?ed|Suspended)\b/i) || [])[1] || 'scheduled';
        const gameId = (card.find('a[href^="/game/"]').attr('href') || '').replace('/game/', '');
        if (teams.length < 2) return;
        games.push({
            sport: SPORT_LABEL[sport] || sport,
            date: isoDate,
            conference: conf,
            status,
            gameId,
            home: teams[1] || '',      // NJ.com lists away first, home second
            away: teams[0] || '',
            awayScore: scores[0] != null ? Number(scores[0]) : null,
            homeScore: scores[1] != null ? Number(scores[1]) : null,
        });
    });
    return games;
}

(async () => {
    const arg = process.argv[2];
    const confArg = process.argv[3] || 'Super Essex';
    const confRe = new RegExp(confArg.replace(/[-\s]+/g, '.?'), 'i');   // "Super Essex" ~ "Big-North"

    let date;
    if (arg && /^\d{4}-\d{1,2}-\d{1,2}$/.test(arg)) date = new Date(arg + 'T12:00:00');
    else { date = new Date(); date.setDate(date.getDate() - 1); }        // yesterday
    const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

    const sports = SPORTS[seasonFor(m)];
    console.log(`scraping ${confArg} scores for ${iso} (${seasonFor(m)}): ${sports.join(', ')}`);

    const all = [];
    for (const sport of sports) {
        try {
            const { blocked, html } = await fetchDay(sport, y, m, d);
            if (blocked) { console.log(`  ${sport.padEnd(16)} BLOCKED by bot protection`); await sleep(PAUSE_MS); continue; }
            if (!html) { console.log(`  ${sport.padEnd(16)} no page`); await sleep(PAUSE_MS); continue; }
            const games = parseGames(html, sport, iso, confRe);
            const finals = games.filter(g => /final/i.test(g.status));
            console.log(`  ${sport.padEnd(16)} ${games.length} ${confArg} games (${finals.length} final)`);
            all.push(...games);
        } catch (err) {
            console.log(`  ${sport.padEnd(16)} ERROR ${err.message}`);
        }
        await sleep(PAUSE_MS);
    }

    const out = path.join(__dirname, '..', 'data', 'scores-scraped.json');
    fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), date: iso, conference: confArg, games: all }, null, 2) + '\n');
    console.log(`\n  ${all.length} games -> ${path.relative(path.join(__dirname, '..'), out)}`);
    all.filter(g => /final/i.test(g.status)).forEach(g =>
        console.log(`    [${g.sport}] ${g.away} ${g.awayScore} - ${g.homeScore} ${g.home}`));
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
