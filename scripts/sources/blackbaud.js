// Blackbaud mySchoolApp (WhippleHill/Podium) source.
//
// The iCal token is school-level and does not require a login. It is embedded
// in the public athletics calendar page as a "webcal://" link, which we extract
// and convert to https:// to fetch the feed directly.
//
// SUMMARY format: "[Level] [Sport]  vs [Opponent] - Home/Away"
// Cancellations prefix the whole line with "CANCELLED - CANCELED ".
// Two spaces commonly appear between the sport name and "vs" due to how
// Podium constructs the title.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TZ = 'America/New_York';

const LEVELS = [
    ['Junior Varsity', 'Junior Varsity'], ['Jr. Varsity', 'Junior Varsity'],
    ['JV', 'Junior Varsity'], ['Varsity', 'Varsity'],
    ['Freshman', 'Freshman'], ['Middle School', 'Middle School'],
    ['MS', 'Middle School'],
];
const GENDERS = ['Boys/Girls', 'Girls', 'Boys', 'Coed', 'Co-Ed'];

function unfold(text) {
    return text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function icalUnescape(s) {
    return String(s || '')
        .replace(/\\n/gi, ' ')
        .replace(/\\,/g, ',')
        .replace(/\\;/g, ';')
        .replace(/\\\\/g, '\\')
        .replace(/\s+/g, ' ')
        .trim();
}

// Handles UTC stamps (20260914T213000Z) and floating local stamps.
function toEastern(stamp) {
    const m = String(stamp || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, hh, mm, ss, z] = m;
    if (!hh) return null;   // all-day events are not fixtures

    const dt = z
        ? new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +(ss || 0)))
        : new Date(+y, +mo - 1, +d, +hh, +mm, +(ss || 0));

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(dt).reduce((a, p) => (a[p.type] = p.value, a), {});

    const H = parts.hour === '24' ? '00' : parts.hour;
    const h12 = (Number(H) % 12) === 0 ? 12 : Number(H) % 12;
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${H}:${parts.minute}`,
        label: `${h12}:${parts.minute} ${Number(H) >= 12 ? 'PM' : 'AM'}`,
    };
}

// Blackbaud SUMMARY: "Varsity Field Hockey  vs South Hunterdon - Away"
// Cancellation prefix: "CANCELLED - CANCELED Varsity Field Hockey  vs ..."
function parseSummary(raw) {
    let rest = icalUnescape(raw);

    // Cancellation prefix can appear in several forms
    let status = '';
    const cm = rest.match(/^\s*(?:CANCELLED\s*-\s*CANCELED|CANCELED\s*-\s*CANCELLED|CANCELLED|CANCELED|POSTPONED)\s+/i);
    if (cm) {
        status = 'Cancelled';
        rest = rest.slice(cm[0].length).trim();
    }

    // Extract "- Home" or "- Away" suffix
    let home = null;
    const hm = rest.match(/\s*-\s*(Home|Away)\s*$/i);
    if (hm) {
        home = /home/i.test(hm[1]);
        rest = rest.slice(0, rest.length - hm[0].length).trim();
    }

    // Split on " vs " (with any number of spaces around it)
    const vsIdx = rest.search(/\s+vs\.?\s+/i);
    if (vsIdx < 0) return null;

    const head = rest.slice(0, vsIdx).trim();
    const opponent = rest.slice(vsIdx).replace(/^\s+vs\.?\s+/i, '').trim();
    if (!opponent) return null;

    // Parse level from beginning of head
    let levelStr = '';
    let remaining = head;
    for (const [needle, canonical] of LEVELS) {
        const re = new RegExp(`^${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`, 'i');
        if (re.test(remaining)) {
            levelStr = canonical;
            remaining = remaining.replace(re, '').trim();
            break;
        }
    }

    // Parse gender if present after level
    let gender = '';
    for (const g of GENDERS) {
        const re = new RegExp(`^${g.replace(/\//g, '\\/')}\\s*`, 'i');
        if (re.test(remaining)) {
            gender = g.replace(/^co-?ed$/i, 'Coed');
            remaining = remaining.replace(re, '').trim();
            break;
        }
    }

    const sport = remaining.replace(/\s+/g, ' ').trim();
    if (!sport) return null;

    return { sport, level: levelStr, gender, opponent, home, status };
}

// Extract the webcal:// iCal URL from the Blackbaud athletics calendar page.
async function extractIcalUrl(calPageUrl) {
    const res = await fetch(calPageUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`cal page ${res.status}`);
    const html = await res.text();

    // The feed link appears as: webcal://[school].myschoolapp.com/podium/feed/iCal.aspx?z=...
    const m = html.match(/webcal:\/\/[^"'\s]+myschoolapp\.com\/podium\/feed\/iCal\.aspx\?[^"'\s]+/i);
    if (!m) throw new Error('iCal webcal link not found on calendar page');

    return 'https://' + m[0].slice('webcal://'.length);
}

async function fetchSchool(school, startDate, endDate) {
    const icsUrl = await extractIcalUrl(school.calPageUrl);
    const res = await fetch(icsUrl, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`ics ${res.status}`);
    const body = unfold(await res.text());
    if (!/BEGIN:VCALENDAR/.test(body)) throw new Error('response was not an iCalendar feed');

    const from = String(startDate).replace(/-(\d)(?!\d)/g, '-0$1');
    const to = String(endDate).replace(/-(\d)(?!\d)/g, '-0$1');

    const events = [];
    for (const chunk of body.split('BEGIN:VEVENT').slice(1)) {
        const field = k => {
            const m = chunk.match(new RegExp(`^${k}[^:\\r\\n]*:(.*)$`, 'm'));
            return m ? m[1].trim() : '';
        };
        const when = toEastern(field('DTSTART'));
        if (!when) continue;
        if (when.date < from || when.date > to) continue;

        const parsed = parseSummary(field('SUMMARY'));
        if (!parsed) continue;

        events.push({
            id: `bb:${school.name}:${field('UID') || when.date + when.time + parsed.sport}`,
            date: when.date,
            time: when.time,
            timeLabel: when.label,
            sport: parsed.sport,
            level: parsed.level,
            gender: parsed.gender,
            school: school.name,
            opponent: parsed.opponent,
            home: parsed.home,
            kind: 'Game',
            status: parsed.status,
            source: 'blackbaud',
        });
    }
    return events;
}

module.exports = { fetchSchool, parseSummary, extractIcalUrl };
