// Build data/schedule.json — every Skyland Conference game we can reach,
// sorted by date then time, de-duplicated so a fixture listed by both schools
// appears once.
//
// Run: node scripts/build-schedule.js [startDate] [endDate]
// Dates are M/D-tolerant strings in the form YYYY-M-D.
//
// Sources:
//   11 schools  DigitalSports (Vantage)         skyland-ds-schools.json
//    8 schools  ArbiterLive                     skyland-arbiter-schools.json
//    1 school   Blackbaud mySchoolApp (iCal)    skyland-blackbaud-schools.json
//    1 school   FinalSite new CMS (HTML table)  skyland-finalsite-schools.json
//   --
//   21 of 25 conference schools
//
// North Plainfield and North Warren have no schedule URL yet.
// Pingry and Rutgers Prep use FinalSite's old CMS, which loads data via
// JavaScript and cannot be reached without a headless browser.

const fs = require('fs');
const path = require('path');
const arbiter      = require('./sources/arbiter');
const digitalsports = require('./sources/digitalsports');
const blackbaud    = require('./sources/blackbaud');
const finalsite    = require('./sources/finalsite');

const DS_SCHOOLS        = require('./skyland-ds-schools.json');
const ARBITER_SCHOOLS   = require('./skyland-arbiter-schools.json');
const BLACKBAUD_SCHOOLS = require('./skyland-blackbaud-schools.json');
const FINALSITE_SCHOOLS = require('./skyland-finalsite-schools.json');

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'data', 'schedule.json');
const PAUSE_MS = 1200;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAD   = n => '  ' + String(n).padStart(4);

async function withRetry(label, fn, attempts = 3) {
    let last;
    for (let i = 1; i <= attempts; i++) {
        try { return await fn(); } catch (err) {
            last = err;
            if (i < attempts) {
                console.log(`         retry ${i}/${attempts - 1} for ${label}: ${err.message}`);
                await sleep(2500 * i);
            }
        }
    }
    throw last;
}

function defaultRange() {
    const now = new Date();
    const y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    return [`${y}-8-1`, `${y + 1}-7-31`];
}

const NOT_ATHLETIC = /^(band|marching band|concert band|jazz band|choir|chorus|orchestra|drama|debate|robotics|model un|mock trial|science olympiad)$/i;

function isAthletic(e) {
    return !NOT_ATHLETIC.test(String(e.sport || '').trim());
}

const SPORT_ALIASES = {
    'hockey': 'Ice Hockey',
    'track and field': 'Track and Field',
    'lacrosse - boys': 'Lacrosse',
    'lacrosse - girls': 'Lacrosse',
    'unified coed soccer': 'Unified Sports Soccer',
    'unified sports soccer': 'Unified Sports Soccer',
};

function canonicalSport(e) {
    const key = String(e.sport || '').trim().toLowerCase();
    const mapped = SPORT_ALIASES[key];
    if (mapped) return { ...e, sport: mapped };
    return e;
}

const VENUE_TAIL = /\b(gym(nasium)?|field(s| ?house)?|courts?|turf|stadium|room|pool|track|rink|lanes|arena|diamond)\s*$/i;

function blankPlaceholderTime(e) {
    if (e.time !== '00:00' && e.time !== '00:01') return e;
    return { ...e, time: '', timeLabel: '' };
}

// Immaculata and Mount Saint Mary are single-sex schools whose feeds may
// omit the gender entirely. Tag their fixtures rather than leaving it blank.
const SCHOOL_GENDER = {
    'Immaculata High School':   'Girls',
    'Mount Saint Mary Academy': 'Girls',
};

function schoolGender(e) {
    if (e.gender) return e;
    const g = SCHOOL_GENDER[e.school];
    return g ? { ...e, gender: g } : e;
}

function computeSplitSet(games) {
    const genders = {};
    for (const g of games) {
        if (!g.gender) continue;
        (genders[g.sport] = genders[g.sport] || new Set()).add(g.gender);
    }
    return new Set(Object.keys(genders).filter(s => genders[s].size > 1));
}

function applySplit(games, split) {
    return games.map(g => (g.gender && split.has(g.sport))
        ? { ...g, sport: g.gender + ' ' + g.sport }
        : g);
}

function splitByGender(games) {
    const split = computeSplitSet(games);
    return { games: applySplit(games, split), split: [...split].sort() };
}

function stripSelfVenue(e) {
    const opp = String(e.opponent || '').trim();
    if (!opp) return e;
    if (opp.toLowerCase() === String(e.school || '').trim().toLowerCase()) return { ...e, opponent: '' };
    if (!VENUE_TAIL.test(opp)) return e;
    const mine = norm(e.school), theirs = norm(opp);
    if (!mine || !theirs.startsWith(mine)) return e;
    return { ...e, opponent: '' };
}

function score(e) {
    return (e.home !== null && e.home !== undefined ? 2 : 0) + (e.opponent ? 1 : 0) + (e.time ? 1 : 0);
}

function norm(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/\b(high school|high|school|township|regional|academy|hs)\b/g, '')
        .replace(/[^a-z]/g, '');
}

function merge(target, e) {
    if (!target.schools.includes(e.school)) target.schools.push(e.school);
    return score(e) > score(target) ? { ...e, schools: target.schools } : target;
}

function dedupe(events) {
    // Pass 1: shared ArbiterLive game id
    const byId = new Map();
    for (const e of events) {
        const prev = byId.get(e.id);
        byId.set(e.id, prev ? merge(prev, e) : { ...e, schools: [e.school] });
    }

    // Pass 2: same two schools, same sport/level/gender, same moment
    const byFixture = new Map();
    const out = [];
    for (const e of byId.values()) {
        const pair = [norm(e.school), norm(e.opponent)].sort().join('~');
        const key = [e.date, e.time, norm(e.sport), norm(e.level), norm(e.gender), pair].join('|');
        if (!e.opponent || !e.time) { out.push(e); continue; }
        const prev = byFixture.get(key);
        if (prev) { byFixture.set(key, merge(prev, e)); continue; }
        byFixture.set(key, e);
    }
    return out.concat([...byFixture.values()]);
}

async function fetchRaw(start, end) {
    const all    = [];
    const report = [];

    for (const school of DS_SCHOOLS) {
        try {
            const events = await withRetry(school.name, () =>
                digitalsports.fetchSchool(school, start, end, { pauseMs: 600 }));
            all.push(...events);
            report.push({ school: school.name, source: 'digitalsports', games: events.length, ok: events.length > 0 });
            console.log(PAD(events.length) + ' games  ' + school.name);
        } catch (err) {
            report.push({ school: school.name, source: 'digitalsports', games: 0, ok: false, error: err.message });
            console.log('  FAILED         ' + school.name + ': ' + err.message);
        }
        await sleep(PAUSE_MS);
    }

    for (const school of ARBITER_SCHOOLS) {
        try {
            const events = await withRetry(school.name, () => arbiter.fetchSchool(school, start, end));
            all.push(...events);
            report.push({ school: school.name, source: 'arbiterlive', games: events.length, ok: events.length > 0 });
            console.log(PAD(events.length) + ' games  ' + school.name);
        } catch (err) {
            report.push({ school: school.name, source: 'arbiterlive', games: 0, ok: false, error: err.message });
            console.log('  FAILED         ' + school.name + ': ' + err.message);
        }
        await sleep(PAUSE_MS);
    }

    for (const school of BLACKBAUD_SCHOOLS) {
        try {
            const events = await withRetry(school.name, () => blackbaud.fetchSchool(school, start, end));
            all.push(...events);
            report.push({ school: school.name, source: 'blackbaud', games: events.length, ok: events.length > 0 });
            console.log(PAD(events.length) + ' games  ' + school.name);
        } catch (err) {
            report.push({ school: school.name, source: 'blackbaud', games: 0, ok: false, error: err.message });
            console.log('  FAILED         ' + school.name + ': ' + err.message);
        }
        await sleep(PAUSE_MS);
    }

    for (const school of FINALSITE_SCHOOLS) {
        try {
            const events = await withRetry(school.name, () => finalsite.fetchSchool(school, start, end));
            all.push(...events);
            report.push({ school: school.name, source: 'finalsite', games: events.length, ok: events.length > 0 });
            console.log(PAD(events.length) + ' games  ' + school.name);
        } catch (err) {
            report.push({ school: school.name, source: 'finalsite', games: 0, ok: false, error: err.message });
            console.log('  FAILED         ' + school.name + ': ' + err.message);
        }
        await sleep(PAUSE_MS);
    }

    return { all, report };
}

async function main() {
    const [start, end] = process.argv[2] && process.argv[3]
        ? [process.argv[2], process.argv[3]]
        : defaultRange();

    console.log(`range ${start} .. ${end}`);
    const { all, report } = await fetchRaw(start, end);

    const normalised = all.map(canonicalSport).map(schoolGender)
        .map(stripSelfVenue).map(blankPlaceholderTime).filter(isAthletic);

    const { games: athletic, split } = splitByGender(normalised);
    console.log('  split by gender: ' + (split.length ? split.join(', ') : '(none)'));
    const dropped = all.length - athletic.length;

    const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
    const games = dedupe(athletic).sort((a, b) =>
        a.date === b.date ? byTime(a, b) : a.date.localeCompare(b.date));

    const byDate = {};
    for (const g of games) (byDate[g.date] = byDate[g.date] || []).push(g);

    const empty = report.filter(r => !r.ok);
    const SCHOOL_COUNT = DS_SCHOOLS.length + ARBITER_SCHOOLS.length +
                         BLACKBAUD_SCHOOLS.length + FINALSITE_SCHOOLS.length;

    fs.writeFileSync(OUT, JSON.stringify({
        _comment: 'Generated by scripts/build-schedule.js — do not edit by hand. ' +
            'Covers 21 of 25 Skyland Conference member schools across 4 platforms ' +
            '(DigitalSports, ArbiterLive, Blackbaud, FinalSite). ' +
            'Games only — practices filtered out. Sorted by date then start time, ' +
            'de-duplicated so a fixture listed by both schools appears once.',
        generated: new Date().toISOString(),
        range: { start, end },
        sources: report,
        coverage: {
            schoolsFetched: report.length,
            schoolsInConference: 25,
            schoolsCovered: SCHOOL_COUNT,
            complete: report.filter(r => r.ok).length >= SCHOOL_COUNT,
        },
        counts: {
            raw: all.length,
            nonAthleticDropped: dropped,
            deduped: games.length,
            dates: Object.keys(byDate).length,
        },
        splitSports: split,
        games,
    }, null, 2) + '\n');

    console.log(`\n  raw ${all.length} -> ${games.length} after de-duplication`);
    console.log(`  ${Object.keys(byDate).length} dates covered`);
    console.log(`  written ${path.relative(ROOT, OUT)}`);
    if (empty.length) {
        console.log(`\n  WARNING - ${empty.length} source(s) returned nothing:`);
        empty.forEach(r => console.log(`    ${r.school}${r.error ? ' - ' + r.error : ''}`));
    }
}

if (require.main === module) {
    main().catch(e => { console.error('FAILED:', e); process.exit(1); });
}

module.exports = {
    fetchRaw, canonicalSport, schoolGender, stripSelfVenue, blankPlaceholderTime,
    isAthletic, dedupe, splitByGender, applySplit, computeSplitSet,
    DS_SCHOOLS, ARBITER_SCHOOLS, BLACKBAUD_SCHOOLS, FINALSITE_SCHOOLS, defaultRange,
};
