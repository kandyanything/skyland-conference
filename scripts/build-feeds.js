// Build subscribable calendar feeds + an RSS feed from data/schedule.json.
// Reusable across conferences: it reads the roster from data/schools.json and
// resolves slugs via school-logos.js (falling back to a plain slugify).
//
// Output (served at stable URLs so calendars auto-refresh):
//   feeds/all.ics                  - the whole conference
//   feeds/schools/<slug>.ics       - one school (home & away)
//   feeds/sports/<slug>.ics        - one sport across the conference
//   feeds/sports/<lvl>--<sport>.ics- one sport at one level (e.g. varsity--boys-soccer)
//   feeds/rss.xml                  - upcoming games as RSS
//   feeds/index.json               - manifest the subscribe panel reads
//
// Run: node scripts/build-feeds.js   (after build-schedule.js)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let logoSlug = function () { return null; };
try { logoSlug = require('./school-logos').logoSlug; } catch (e) {}

const rawSchools = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schools.json'), 'utf8'));
const CONF = rawSchools.conference || 'Conference';
const slugify = s => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const SCHOOLS = (rawSchools.schools || rawSchools).map(s => ({ name: s.name, slug: s.slug || logoSlug(s.name) || slugify(s.name) }));

const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'schedule.json'), 'utf8'));
const games = doc.games || [];
const OUT = path.join(ROOT, 'feeds');
fs.mkdirSync(path.join(OUT, 'schools'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'sports'), { recursive: true });

const norm = s => String(s || '').toLowerCase().replace(/\b(high school|high|school|regional|jr sr|the|academy)\b/g, '').replace(/[^a-z0-9]/g, '');
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const xml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const VTZ = ['BEGIN:VTIMEZONE', 'TZID:America/New_York',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD', 'END:VTIMEZONE'];
// Fixed DTSTAMP so an unchanged feed stays byte-identical build-to-build — no
// git churn across the ~2000 team feeds. It's the calendar object's creation
// stamp, not a refresh signal (clients re-fetch by URL / HTTP caching).
const DTSTAMP = '20250801T000000Z';

function vevent(g) {
  const ymd = g.date.replace(/-/g, '');
  const lines = ['BEGIN:VEVENT', `UID:${(g.id || (g.date + g.school + g.opponent)).replace(/[^\w:.-]/g, '')}@${slugify(CONF)}`, `DTSTAMP:${DTSTAMP}`];
  if (g.time) {
    const hm = g.time.replace(':', '') + '00';
    const end = new Date(`${g.date}T${g.time}:00`); end.setHours(end.getHours() + 2);
    lines.push(`DTSTART;TZID=America/New_York:${ymd}T${hm}`, `DTEND;TZID=America/New_York:${ymd}T${String(end.getHours()).padStart(2, '0')}${String(end.getMinutes()).padStart(2, '0')}00`);
  } else {
    const nx = new Date(`${g.date}T12:00:00Z`); nx.setUTCDate(nx.getUTCDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${nx.toISOString().slice(0, 10).replace(/-/g, '')}`);
  }
  const detail = [g.level, g.gender, g.sport].filter(Boolean).join(' ');
  let sum = `${g.school} ${g.home === false ? 'at' : 'vs'} ${g.opponent || 'TBD'}`;
  if (detail) sum += ` (${detail})`;
  if (g.status) sum = `[${g.status}] ` + sum;
  lines.push(`SUMMARY:${esc(sum)}`, `DESCRIPTION:${esc(detail + (g.home === false ? ' - Away' : ' - Home') + (g.timeLabel ? ' - ' + g.timeLabel : ''))}`);
  if (g.status) lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT');
  return lines;
}
function calendar(name, list) {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AthlitIQ//' + CONF + '//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(name)}`, 'X-WR-TIMEZONE:America/New_York', ...VTZ];
  for (const g of list) out.push(...vevent(g));
  out.push('END:VCALENDAR');
  return out.map(l => l.length <= 74 ? l : l.replace(/(.{73})/g, '$1\r\n ')).join('\r\n') + '\r\n';
}
function schoolGames(name) {
  const k = norm(name);
  return games.filter(g => norm(g.school) === k || norm(g.opponent) === k || (g.schools || []).some(s => norm(s) === k));
}

// RSS for any slice of games. Conference feed is short-window/high-cap; the
// per-school and per-sport feeds look further ahead so a single team's page
// isn't nearly empty.
const nowUTC = new Date().toUTCString();
function rssFor(title, desc, list, days, cap) {
  const t0 = new Date().toISOString().slice(0, 10);
  const h = new Date(); h.setDate(h.getDate() + days);
  const t1 = h.toISOString().slice(0, 10);
  const up = list.filter(g => g.date >= t0 && g.date <= t1)
    .sort((a, b) => (a.date === b.date ? (a.time || '99:99').localeCompare(b.time || '99:99') : a.date.localeCompare(b.date)));
  const items = up.slice(0, cap).map(g => {
    const line = `${g.school} ${g.home === false ? 'at' : 'vs'} ${g.opponent || 'TBD'} — ${[g.level, g.gender, g.sport].filter(Boolean).join(' ')}`;
    const when = new Date(`${g.date}T${g.time || '00:00'}:00-04:00`).toUTCString();
    return `    <item>\n      <title>${xml(line)}</title>\n      <description>${xml(g.date + (g.timeLabel ? ' ' + g.timeLabel : '') + ' — ' + (g.status || 'Scheduled'))}</description>\n      <pubDate>${when}</pubDate>\n      <guid isPermaLink="false">${xml(g.id || line)}</guid>\n    </item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>${xml(title)}</title>\n    <link>/</link>\n    <description>${xml(desc)}</description>\n    <lastBuildDate>${nowUTC}</lastBuildDate>\n${items}\n  </channel>\n</rss>\n`;
}

fs.writeFileSync(path.join(OUT, 'all.ics'), calendar(CONF + ' — Full Schedule', games));
const schoolFeeds = [];
for (const s of SCHOOLS) {
  const list = schoolGames(s.name);
  fs.writeFileSync(path.join(OUT, 'schools', s.slug + '.ics'), calendar(CONF + ' — ' + s.name, list));
  fs.writeFileSync(path.join(OUT, 'schools', s.slug + '.xml'), rssFor(CONF + ' — ' + s.name, 'Upcoming games for ' + s.name + '.', list, 60, 200));
  schoolFeeds.push({ name: s.name, slug: s.slug, path: 'feeds/schools/' + s.slug + '.ics', rss: 'feeds/schools/' + s.slug + '.xml', games: list.length });
}
const sportFeeds = [];
for (const sport of [...new Set(games.map(g => g.sport))].sort()) {
  const slug = slugify(sport), list = games.filter(g => g.sport === sport);
  fs.writeFileSync(path.join(OUT, 'sports', slug + '.ics'), calendar(CONF + ' — ' + sport, list));
  fs.writeFileSync(path.join(OUT, 'sports', slug + '.xml'), rssFor(CONF + ' — ' + sport, 'Upcoming ' + sport + ' games across ' + CONF + '.', list, 60, 300));
  sportFeeds.push({ name: sport, slug, path: 'feeds/sports/' + slug + '.ics', rss: 'feeds/sports/' + slug + '.xml', games: list.length });
}
const sportLevelFeeds = [], combos = {};
for (const g of games) { if (g.level) { const k = g.sport + '||' + g.level; (combos[k] = combos[k] || []).push(g); } }
for (const k of Object.keys(combos).sort()) {
  const [sport, level] = k.split('||'), slug = slugify(level) + '--' + slugify(sport);
  fs.writeFileSync(path.join(OUT, 'sports', slug + '.ics'), calendar(CONF + ' — ' + level + ' ' + sport, combos[k]));
  fs.writeFileSync(path.join(OUT, 'sports', slug + '.xml'), rssFor(CONF + ' — ' + level + ' ' + sport, 'Upcoming ' + level + ' ' + sport + ' games.', combos[k], 60, 300));
  sportLevelFeeds.push({ sport, level, name: level + ' ' + sport, slug, path: 'feeds/sports/' + slug + '.ics', rss: 'feeds/sports/' + slug + '.xml', games: combos[k].length });
}

// ---- per-team feeds: one school's sport (all levels) and each sport+level ----
// Lets someone subscribe to exactly their team, e.g. "<School> Boys Soccer
// Varsity". Only combos that actually have games are written. The tree is
// emitted to feeds/teams.json (loaded lazily by the subscribe drawer).
const orderLv = ['Varsity', 'Junior Varsity', 'Freshman', 'Middle School'];
const teamSchools = [];
let teamCount = 0;
for (const s of SCHOOLS) {
  const list = schoolGames(s.name);
  if (!list.length) continue;
  const bySport = {};
  for (const g of list) (bySport[g.sport] = bySport[g.sport] || []).push(g);
  const dir = path.join(OUT, 'teams', s.slug);
  fs.mkdirSync(dir, { recursive: true });
  const sportsOut = [];
  for (const sport of Object.keys(bySport).sort()) {
    const sl = slugify(sport);
    fs.writeFileSync(path.join(dir, sl + '.ics'), calendar(CONF + ' — ' + s.name + ' ' + sport, bySport[sport])); teamCount++;
    const byLevel = {};
    for (const g of bySport[sport]) if (g.level) (byLevel[g.level] = byLevel[g.level] || []).push(g);
    const levels = Object.keys(byLevel).sort((a, b) => (orderLv.indexOf(a) + 1 || 9) - (orderLv.indexOf(b) + 1 || 9));
    for (const lv of levels) { fs.writeFileSync(path.join(dir, sl + '--' + slugify(lv) + '.ics'), calendar(CONF + ' — ' + s.name + ' ' + lv + ' ' + sport, byLevel[lv])); teamCount++; }
    sportsOut.push({ name: sport, slug: sl, levels: levels.map(lv => ({ name: lv, slug: slugify(lv) })) });
  }
  teamSchools.push({ name: s.name, slug: s.slug, sports: sportsOut });
}
fs.writeFileSync(path.join(OUT, 'teams.json'), JSON.stringify({ conference: CONF, base: 'feeds/teams', schools: teamSchools }) + '\n');

const upCount = games.filter(g => { const t0 = new Date().toISOString().slice(0, 10); const h = new Date(); h.setDate(h.getDate() + 21); return g.date >= t0 && g.date <= h.toISOString().slice(0, 10); }).length;
fs.writeFileSync(path.join(OUT, 'rss.xml'), rssFor(CONF + ' — Upcoming Games', 'Upcoming games across all ' + CONF + ' schools.', games, 21, 600));

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({
  conference: CONF, generated: doc.generated, all: 'feeds/all.ics', rss: 'feeds/rss.xml', teams: 'feeds/teams.json',
  schools: schoolFeeds, sports: sportFeeds, sportLevels: sportLevelFeeds,
}, null, 2) + '\n');
console.log(`feeds for ${CONF}: all.ics (${games.length}), ${schoolFeeds.length} schools, ${sportFeeds.length} sports, ${sportLevelFeeds.length} sport+level, ${teamCount} team feeds, rss (${Math.min(upCount, 600)})`);
