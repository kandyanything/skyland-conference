// FinalSite (new CMS) source — server-rendered HTML table.
//
// FinalSite's new CMS renders the full schedule as a <table class="fsEventTable
// fsElementTable"> in the initial HTML response (no JavaScript required). Each
// row is one fixture. Only the new CMS version is scrapeable this way; the old
// CMS loads data via JavaScript and cannot be reached without a headless browser.
//
// Title format: "[Sport] - [Level] [Gender]"
//   e.g.  "Soccer - Varsity Boys"  /  "Cross Country - Middle School Coed"
// Datetime: <time datetime="2026-09-14T16:00:00-04:00"> (ISO with Eastern offset)
// Home/Away: <span class="fsAthleticsVs">vs. </span> = home; "@" in opponent = away

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const LEVELS = [
    ['Middle School', 'Middle School'], ['Junior Varsity', 'Junior Varsity'],
    ['Jr Varsity', 'Junior Varsity'], ['JV', 'Junior Varsity'],
    ['Varsity', 'Varsity'], ['Freshman', 'Freshman'], ['MS', 'Middle School'],
];
const GENDERS = ['Boys/Girls', 'Girls', 'Boys', 'Coed', 'Co-Ed'];

function htmlDecode(s) {
    return String(s || '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// "Soccer - Varsity Boys" -> { sport, level, gender }
function parseTitle(title) {
    const clean = htmlDecode(stripTags(title));

    // Split on " - " separator
    const dashIdx = clean.indexOf(' - ');
    if (dashIdx < 0) return { sport: clean, level: '', gender: '' };
    const sport = clean.slice(0, dashIdx).trim();
    let rest = clean.slice(dashIdx + 3).trim();

    let level = '';
    for (const [needle, canonical] of LEVELS) {
        const re = new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, 'i');
        if (re.test(rest)) {
            level = canonical;
            rest = rest.replace(re, ' ').trim();
            break;
        }
    }

    let gender = '';
    for (const g of GENDERS) {
        const re = new RegExp(`(^|\\s)${g.replace(/\//g, '\\/')}(\\s|$)`, 'i');
        if (re.test(rest)) {
            gender = g.replace(/^co-?ed$/i, 'Coed');
            rest = rest.replace(re, ' ').trim();
            break;
        }
    }

    return { sport, level, gender };
}

// Parse <time datetime="2026-09-14T16:00:00-04:00"> to date + time parts.
// The datetime attribute is already in Eastern time (offset -04:00 or -05:00),
// so no UTC conversion is needed.
function parseDateTime(isoStr) {
    if (!isoStr) return null;
    const m = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?(?:[+-]\d{2}:\d{2})?)?/);
    if (!m) return null;
    const [, y, mo, d, hh, mm] = m;
    if (!hh) return null;   // all-day
    const H = hh;
    const h12 = (Number(H) % 12) === 0 ? 12 : Number(H) % 12;
    return {
        date: `${y}-${mo}-${d}`,
        time: `${H}:${mm}`,
        label: `${h12}:${mm} ${Number(H) >= 12 ? 'PM' : 'AM'}`,
    };
}

// Extract all <tr> row bodies from the table.
function extractRows(html) {
    const tableM = html.match(/<table[^>]*class="[^"]*fsEventTable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
    if (!tableM) return [];
    const tbody = tableM[1];

    const rows = [];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(tbody)) !== null) {
        rows.push(m[1]);
    }
    return rows;
}

// Extract text/attributes from a <td> by its class name.
function cellByClass(row, cls) {
    const re = new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
    const m = row.match(re);
    return m ? m[1] : '';
}

// Extract all opponent names from the opponents cell.
function parseOpponents(cell) {
    const names = [];
    const re = /<span[^>]*class="[^"]*fsAthleticsOpponentName[^"]*"[^>]*>([^<]+)<\/span>/gi;
    let m;
    while ((m = re.exec(cell)) !== null) {
        const n = htmlDecode(m[1]).trim();
        if (n) names.push(n);
    }
    return names.join(', ');
}

// Detect home/away from the opponents cell.
function parseHomeAway(cell) {
    if (/<span[^>]*class="[^"]*fsAthleticsVs[^"]*"[^>]*>/i.test(cell)) return true;   // "vs." = home
    if (/<span[^>]*class="[^"]*fsAthleticsAt[^"]*"[^>]*>/i.test(cell)) return false;  // "@" = away
    if (/@/.test(stripTags(cell))) return false;
    return null;   // unknown
}

// Check for cancellation / postponement in the status cell.
function parseStatus(cell) {
    const text = htmlDecode(stripTags(cell)).toLowerCase();
    if (/cancell?ed/.test(text)) return 'Cancelled';
    if (/postponed/.test(text)) return 'Postponed';
    return '';
}

async function fetchSchool(school, startDate, endDate) {
    const res = await fetch(school.url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`page ${res.status}`);
    const html = await res.text();

    const from = String(startDate).replace(/-(\d)(?!\d)/g, '-0$1');
    const to = String(endDate).replace(/-(\d)(?!\d)/g, '-0$1');

    const rows = extractRows(html);
    const events = [];
    let idx = 0;

    for (const row of rows) {
        // Skip header rows (th cells, no datetime)
        if (/<th[^>]*>/i.test(row)) continue;

        const titleCell = cellByClass(row, 'fsTitle');
        if (!titleCell) continue;

        // Date and time come from the <time datetime="..."> attribute
        const timeM = row.match(/<time[^>]*datetime="([^"]+)"/i);
        if (!timeM) continue;
        const when = parseDateTime(timeM[1]);
        if (!when) continue;
        if (when.date < from || when.date > to) continue;

        const oppCell = cellByClass(row, 'fsAthleticsOpponents');
        const opponent = parseOpponents(oppCell);
        if (!opponent) continue;   // no opponent = not a game

        const { sport, level, gender } = parseTitle(titleCell);
        if (!sport) continue;

        const home = parseHomeAway(oppCell);
        const status = parseStatus(cellByClass(row, 'fsAthleticsStatus'));

        events.push({
            id: `fs:${school.name}:${when.date}:${when.time}:${sport}:${idx++}`,
            date: when.date,
            time: when.time,
            timeLabel: when.label,
            sport,
            level,
            gender,
            school: school.name,
            opponent,
            home,
            kind: 'Game',
            status,
            source: 'finalsite',
        });
    }
    return events;
}

module.exports = { fetchSchool, parseTitle, parseDateTime };
