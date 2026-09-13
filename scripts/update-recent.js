// Lightweight hourly refresh - re-checks only the next few days rather than
// the whole season, so a same-day reschedule (an AD moving a 6pm kickoff to
// 4pm, the way it actually happens) can show up within the hour instead of
// waiting for the 2am rebuild.
//
// Fetches the same DigitalSports sources build-schedule.js does, scoped to a
// short window, then splices the result into the existing data/schedule.json in
// place of just that window - every date outside it is left exactly as the
// last full rebuild wrote it.
//
// Run: node scripts/update-recent.js

const fs = require('fs');
const path = require('path');
const {
    fetchRaw, canonicalSport, schoolGender, stripSelfVenue, blankPlaceholderTime,
    isAthletic, dedupe, applySplit,
} = require('./build-schedule');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'schedule.json');

const WINDOW_DAYS = 3;        // today plus the following two days

// A narrow window can legitimately come back thin (an off week), so this
// guards the whole merged schedule rather than the window alone - it is
// checking for a broken fetch, not a quiet few days.
const MIN_SOURCES_OK = 20;    // of 41
const MAX_TOTAL_DROP = 0.10;  // vs the schedule this is splicing into

const easternDate = d => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(d);

(async () => {
    if (!fs.existsSync(OUT)) {
        throw new Error('data/schedule.json does not exist yet - run the full nightly build first');
    }
    const existing = JSON.parse(fs.readFileSync(OUT, 'utf8'));

    const from = easternDate(new Date());
    const end = new Date(from + 'T12:00:00Z');
    end.setUTCDate(end.getUTCDate() + WINDOW_DAYS - 1);
    const through = end.toISOString().slice(0, 10);
    console.log(`window ${from} .. ${through}`);

    const { all, report } = await fetchRaw(from, through);
    const okSources = report.filter(r => r.ok).length;
    console.log(`  ${okSources}/${report.length} sources returned data for the window`);
    if (okSources < MIN_SOURCES_OK) {
        throw new Error(`only ${okSources}/${report.length} sources returned data - aborting rather than publishing a gutted window`);
    }

    // DigitalSports only honours a range at month granularity - asking for
    // three days still returns its whole current month. Filtering down to the
    // actual window here is what keeps this "hourly, next few days" rather than
    // "hourly, whatever each source felt like sending back."
    const normalised = all.map(canonicalSport).map(schoolGender)
        .map(stripSelfVenue).map(blankPlaceholderTime).filter(isAthletic)
        .filter(g => g.date >= from && g.date <= through);

    // The split decision (which sports need a gender prefix) needs the whole
    // season to make correctly - a 3-day slice might only ever see one
    // gender play a sport that splits later. Reuse whatever the last full
    // rebuild worked out rather than recomputing it from this window.
    const split = new Set(existing.splitSports && existing.splitSports.length
        ? existing.splitSports
        : (existing.games || [])
            .filter(g => /^(Boys|Girls|Coed) /.test(g.sport))
            .map(g => g.sport.replace(/^(Boys|Girls|Coed) /, '')));
    const windowGames = applySplit(normalised, split);

    // A school whose fetch failed this run (a network blip - see the retry
    // note in build-schedule.js) should keep its last-known window games
    // rather than lose them for an hour. Only the schools that actually
    // returned data this run have their window entries replaced.
    const okSchools = new Set(report.filter(r => r.ok).map(r => r.school));
    const untouched = (existing.games || []).filter(g =>
        g.date < from || g.date > through || !okSchools.has(g.school));
    const windowBefore = (existing.games || []).length - untouched.length;
    const merged = dedupe(untouched.concat(windowGames));

    const prevTotal = (existing.games || []).length;
    const drop = prevTotal ? (prevTotal - merged.length) / prevTotal : 0;
    if (drop > MAX_TOTAL_DROP) {
        throw new Error(`total games fell ${(drop * 100).toFixed(0)}% (${prevTotal} -> ${merged.length}) - aborting`);
    }

    const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
    const games = merged.sort((a, b) => a.date === b.date ? byTime(a, b) : a.date.localeCompare(b.date));

    const byDate = {};
    for (const g of games) (byDate[g.date] = byDate[g.date] || []).push(g);

    console.log(`  window previously had ${windowBefore} games, now has ${windowGames.length}`);

    fs.writeFileSync(OUT, JSON.stringify({
        _comment: existing._comment,
        generated: new Date().toISOString(),
        range: existing.range,
        sources: report,
        coverage: { schoolsFetched: report.length, schoolsInConference: 41, complete: report.length >= 41 },
        counts: {
            raw: all.length,
            nonAthleticDropped: all.length - normalised.length,
            deduped: games.length,
            dates: Object.keys(byDate).length,
        },
        splitSports: [...split],
        games,
    }, null, 2) + '\n');

    console.log(`  written ${path.relative(ROOT, OUT)}: ${games.length} games across ${Object.keys(byDate).length} dates`);
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
