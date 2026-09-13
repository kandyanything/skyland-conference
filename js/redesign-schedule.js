// Conference Schedule: a month grid, click a day to see every SEC game that
// day in chronological order.
//
// Loads data/schedule/index.json for the grid (small - just which dates have
// games and how many), then data/schedule/YYYY-MM.json for the month being
// viewed. The combined file is several megabytes, so it is never loaded.
document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('.njac-schedule');
    if (!root) return;

    var grid = root.querySelector('.cal-grid');
    var title = root.querySelector('.cal-title');
    var prev = root.querySelector('.cal-prev');
    var next = root.querySelector('.cal-next');
    var dayPanel = root.querySelector('.cal-day');
    var sportSel = root.querySelector('.cal-sport');
    var stamp = root.querySelector('.cal-updated');

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    var index = null;
    var monthCache = {};
    var viewMonth = null;      // 'YYYY-MM'
    var selectedDate = null;   // 'YYYY-MM-DD'
    var sportFilter = '';

    fetch('data/schedule/index.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            index = data;
            if (!index.months || !index.months.length) { root.style.display = 'none'; return; }

            if (stamp && index.generated) {
                var d = new Date(index.generated);
                stamp.textContent = 'Updated ' + d.toLocaleDateString('en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' });
            }
            if (sportSel && index.sports) {
                index.sports.forEach(function (s) {
                    var o = document.createElement('option');
                    o.value = s; o.textContent = s;
                    sportSel.appendChild(o);
                });
                sportSel.addEventListener('change', function () {
                    sportFilter = sportSel.value;
                    if (selectedDate) showDay(selectedDate);
                });
            }

            // "Today at a Glance" links here as calendar.html#2026-08-24, and as
            // calendar.html#2026-08-24/Soccer when a sport is being filtered, so
            // honour both rather than always opening on the current month.
            if (!applyHash(true)) {
                viewMonth = defaultMonth();
                renderMonth();
            }
        })
        .catch(function () { root.style.display = 'none'; });

    // "#2026-08-24" or "#2026-08-24/Field%20Hockey"
    function fromHash() {
        var m = String(location.hash || '').match(/^#(\d{4}-\d{2}-\d{2})(?:\/(.+))?$/);
        if (!m) return null;
        var s = '';
        if (m[2]) { try { s = decodeURIComponent(m[2]); } catch (e) { s = m[2]; } }
        return { date: m[1], sport: s };
    }

    function applyHash(scroll) {
        var want = fromHash();
        if (!want || !index || !index.dateCounts[want.date]) return false;

        // Only honour a sport the select actually offers, so a stale or hand-typed
        // link cannot leave the list filtered to something that is never matched.
        if (want.sport && sportSel && index.sports && index.sports.indexOf(want.sport) !== -1) {
            sportFilter = want.sport;
            sportSel.value = want.sport;
        }

        viewMonth = want.date.slice(0, 7);
        renderMonth();
        showDay(want.date);
        if (scroll) root.scrollIntoView({ block: 'start' });
        return true;
    }

    window.addEventListener('hashchange', function () { applyHash(false); });

    // open on the current month if it has games, otherwise the first month that does
    function defaultMonth() {
        var now = new Date();
        var cur = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        return index.months.indexOf(cur) !== -1 ? cur : index.months[0];
    }

    function shiftMonth(month, delta) {
        var y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7)) - 1 + delta;
        var d = new Date(y, m, 1);
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    }

    function renderMonth() {
        var y = Number(viewMonth.slice(0, 4)), m = Number(viewMonth.slice(5, 7)) - 1;
        title.textContent = MONTHS[m] + ' ' + y;

        var i = index.months.indexOf(viewMonth);
        prev.disabled = i <= 0;
        next.disabled = i === -1 || i >= index.months.length - 1;

        grid.innerHTML = '';
        DOW.forEach(function (d) {
            var h = document.createElement('div');
            h.className = 'cal-dow';
            h.textContent = d;
            grid.appendChild(h);
        });

        var first = new Date(y, m, 1);
        var daysIn = new Date(y, m + 1, 0).getDate();
        for (var b = 0; b < first.getDay(); b++) {
            grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-cell is-empty' }));
        }
        for (var day = 1; day <= daysIn; day++) {
            var date = viewMonth + '-' + String(day).padStart(2, '0');
            var n = index.dateCounts[date] || 0;

            var cell = document.createElement(n ? 'button' : 'div');
            cell.className = 'cal-cell' + (n ? '' : ' is-quiet') + (date === selectedDate ? ' is-selected' : '');
            if (n) {
                cell.type = 'button';
                cell.setAttribute('aria-label', n + ' games on ' + date);
                cell.dataset.date = date;
                cell.addEventListener('click', function () { showDay(this.dataset.date); });
            }
            var num = document.createElement('span');
            num.className = 'cal-num';
            num.textContent = day;
            cell.appendChild(num);
            if (n) {
                var tag = document.createElement('span');
                tag.className = 'cal-count';
                tag.textContent = n;
                cell.appendChild(tag);
            }
            grid.appendChild(cell);
        }
    }

    function loadMonth(month) {
        if (monthCache[month]) return Promise.resolve(monthCache[month]);
        return fetch('data/schedule/' + month + '.json')
            .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
            .then(function (d) { monthCache[month] = d.games || []; return monthCache[month]; });
    }

    function showDay(date) {
        selectedDate = date;
        renderMonth();
        dayPanel.innerHTML = '<p class="cal-loading">Loading…</p>';

        loadMonth(date.slice(0, 7)).then(function (games) {
            var list = games.filter(function (g) { return g.date === date; });
            if (sportFilter) list = list.filter(function (g) { return g.sport === sportFilter; });

            dayPanel.innerHTML = '';
            var h3 = document.createElement('h3');
            var d = new Date(date + 'T12:00:00');
            h3.textContent = d.toLocaleDateString('en-US',
                { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            dayPanel.appendChild(h3);

            var sub = document.createElement('p');
            sub.className = 'cal-daycount';
            sub.textContent = list.length + (list.length === 1 ? ' game' : ' games')
                + (sportFilter ? ' — ' + sportFilter : '');
            dayPanel.appendChild(sub);

            if (!list.length) {
                var none = document.createElement('p');
                none.className = 'cal-none';
                none.textContent = sportFilter
                    ? 'No ' + sportFilter + ' games scheduled this day.'
                    : 'No games scheduled this day.';
                dayPanel.appendChild(none);
                return;
            }

            var table = document.createElement('div');
            table.className = 'cal-games';
            list.forEach(function (g) { table.appendChild(buildRow(g)); });
            dayPanel.appendChild(table);
        }).catch(function () {
            dayPanel.innerHTML = '<p class="cal-none">That month could not be loaded.</p>';
        });
    }

    function calCrest(slug) {
        var img = document.createElement('img');
        img.className = 'cal-crest';
        img.src = 'images/logos/optimized/' + slug + '.png';
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = function () { this.remove(); };
        return img;
    }

    function buildRow(g) {
        var row = document.createElement('div');
        row.className = 'cal-game' + (g.status ? ' is-off' : '');

        var t = document.createElement('span');
        t.className = 'cal-time';
        t.textContent = g.timeLabel || 'TBA';
        row.appendChild(t);

        var mid = document.createElement('span');
        mid.className = 'cal-match';
        var teams = document.createElement('strong');
        teams.className = 'cal-teams';
        // A conference school always carries a crest; the opponent only when it
        // is a conference school too (split-schedule.js tags these). So a
        // conference matchup shows two crests, an out-of-conference game one.
        if (g.schoolLogo) teams.appendChild(calCrest(g.schoolLogo));
        teams.appendChild(document.createTextNode(g.school));
        if (g.opponent) {
            var vsSpan = document.createElement('span');
            vsSpan.className = 'cal-vs';
            vsSpan.textContent = g.home === true ? 'vs' : g.home === false ? 'at' : 'v';
            teams.appendChild(vsSpan);
            if (g.oppLogo) teams.appendChild(calCrest(g.oppLogo));
            teams.appendChild(document.createTextNode(g.opponent));
        }
        mid.appendChild(teams);

        var meta = document.createElement('span');
        meta.className = 'cal-meta';
        // gender is carried in the sport name where the sport has more than one
        meta.textContent = [g.level, g.sport].filter(Boolean).join(' · ');
        mid.appendChild(meta);
        row.appendChild(mid);

        if (g.kind && g.kind !== 'Game') {
            var k = document.createElement('span');
            k.className = 'cal-kind';
            k.textContent = g.kind;
            mid.appendChild(k);
        }

        if (g.status) {
            var s = document.createElement('span');
            s.className = 'cal-status';
            s.textContent = g.status;
            row.appendChild(s);
        }
        return row;
    }

    prev.addEventListener('click', function () {
        viewMonth = shiftMonth(viewMonth, -1);
        renderMonth();
    });
    next.addEventListener('click', function () {
        viewMonth = shiftMonth(viewMonth, 1);
        renderMonth();
    });

    // ------------------------------------------------------------------
    // Search a Season: the same data, asked a different question. Browse by
    // Day answers "what is on this date"; this answers "show me every Boys
    // Varsity Soccer game this season" - sport, gender, level and game-vs-
    // scrimmage as independent filters, over Today, This Week, This Season or
    // a custom range.
    // ------------------------------------------------------------------

    var modeBtns = root.querySelectorAll('.cal-mode');
    var browseEl = root.querySelector('.cal-browse');
    var searchEl = root.querySelector('.cal-search');

    modeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            if (btn.classList.contains('is-on')) return;
            modeBtns.forEach(function (b) {
                var on = b === btn;
                b.classList.toggle('is-on', on);
                b.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            var isSearch = btn.dataset.mode === 'search';
            browseEl.hidden = isSearch;
            searchEl.hidden = !isSearch;
            if (isSearch) initSearch();
        });
    });

    // A single-sex school has no reason to name a gender in its own fixture
    // titles - Delbarton never does, because its whole programme is boys'.
    // That is a fact about the school, not a guess about a game, so a search
    // for "Boys Soccer" should still find its fixtures even though the record
    // itself carries no gender. schedule.json is patched with this at build
    // time; this list exists so the same schools are recognised if a record
    // ever reaches the browser without it.
    var SCHOOL_GENDER = { 'Delbarton School': 'Boys' };

    // Which season a sport falls in, worked out from data/standings.json - the
    // same grouping already shown on the Standings section - plus a handful of
    // sports the schedule carries that the standings page does not link out
    // to. Every placement here was checked against the actual fixture dates in
    // schedule.json before being written down, not assumed from how the sport
    // is usually scheduled elsewhere.
    //
    // Tennis and volleyball are not one season each - NJSIAA runs girls'
    // tennis and girls' volleyball in the fall, and the boys' side of both in
    // the spring. The fixtures confirm it: 516 of 537 girls tennis games fall
    // in Aug-Oct, while boys tennis runs Mar-May almost to a game. A sport
    // whose season depends on gender is keyed by the full label; everything
    // else is keyed by the sport alone.
    var SPORT_SEASON = {
        'Soccer': 'Fall', 'Cross Country': 'Fall', 'Field Hockey': 'Fall', 'Football': 'Fall',
        'Cheerleading': 'Fall', 'Gymnastics': 'Fall', 'Unified Sports Soccer': 'Fall',
        'Girls Tennis': 'Fall', 'Girls Volleyball': 'Fall',
        'Basketball': 'Winter', 'Bowling': 'Winter', 'Fencing': 'Winter', 'Swimming': 'Winter',
        'Wrestling': 'Winter', 'Ice Hockey': 'Winter',
        'Baseball': 'Spring', 'Golf': 'Spring', 'Lacrosse': 'Spring', 'Softball': 'Spring',
        'Track and Field': 'Spring', 'Boys Tennis': 'Spring', 'Boys Volleyball': 'Spring',
    };

    // Sport names the search filter should not offer: a grade-level team
    // ("7/8th Boys Wrestling") is a level of an existing sport rather than a
    // sport of its own, and a one-off invitational is an event, not a season.
    // Both still show up under "All Sports" - they are simply not worth their
    // own row in the dropdown, at nine games between them.
    var SPORT_EXCLUDE = /^\d|Invitational/;

    function baseSport(sport) {
        return String(sport || '').replace(/^(Boys|Girls|Coed)\s+/, '');
    }

    function sportSeason(sport, gender) {
        return SPORT_SEASON[gender + ' ' + sport] || SPORT_SEASON[sport] || null;
    }

    // Aug 1 through Jul 31 is the school year this site's data belongs to -
    // the same boundary the nightly build uses to decide which year's fixtures
    // to fetch.
    function schoolYearStart(d) {
        d = d || new Date();
        return d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    }

    // The fixed window for a season, not the span of whatever has been
    // scraped so far - so choosing Spring in August correctly shows an empty
    // result for a season that has not started, rather than silently
    // reinterpreting "season" as "whatever games happen to exist right now".
    function seasonWindow(season) {
        var y = schoolYearStart();
        if (season === 'Fall') return [y + '-08-01', y + '-11-30'];
        if (season === 'Winter') return [y + '-11-01', (y + 1) + '-03-31'];
        if (season === 'Spring') return [(y + 1) + '-03-01', (y + 1) + '-06-30'];
        return [y + '-08-01', (y + 1) + '-07-31'];   // no sport chosen: the whole school year
    }

    function easternToday() {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
            }).format(new Date());
        } catch (e) { return new Date().toISOString().slice(0, 10); }
    }

    function addDaysISO(iso, days) {
        var d = new Date(iso + 'T12:00:00');
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    // Every 'YYYY-MM' between two ISO dates, inclusive.
    function monthsInRange(from, to) {
        var out = [];
        var y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
        var endY = Number(to.slice(0, 4)), endM = Number(to.slice(5, 7));
        while (y < endY || (y === endY && m <= endM)) {
            out.push(y + '-' + String(m).padStart(2, '0'));
            m++; if (m > 12) { m = 1; y++; }
        }
        return out;
    }

    var searchInited = false;
    var sFilters = { sport: '', gender: '', level: '', kind: '' };
    var sRange = 'today';
    var sCrests = {};
    var RESULT_CAP = 600;

    var fSport = root.querySelector('.cal-f-sport');
    var fGender = root.querySelector('.cal-f-gender');
    var fLevel = root.querySelector('.cal-f-level');
    var fKind = root.querySelector('.cal-f-kind');
    var rangeBtns = root.querySelectorAll('.cal-range');
    var customWrap = root.querySelector('.cal-custom-dates');
    var fromInput = root.querySelector('.cal-from');
    var toInput = root.querySelector('.cal-to');
    var summary = root.querySelector('.cal-search-summary');
    var resultsEl = root.querySelector('.cal-search-list');

    function initSearch() {
        if (searchInited) return;
        searchInited = true;

        var bases = [];
        (index.sports || []).forEach(function (s) {
            var b = baseSport(s);
            if (SPORT_EXCLUDE.test(b) || bases.indexOf(b) !== -1) return;
            bases.push(b);
        });
        bases.sort().forEach(function (b) {
            var o = document.createElement('option');
            o.value = b; o.textContent = b;
            fSport.appendChild(o);
        });

        // Default the custom-range inputs to today, so a visitor who opens
        // the date pickers without having typed anything starts from a
        // sensible place rather than a blank calendar widget.
        var todayISO = easternToday();
        if (fromInput) fromInput.value = todayISO;
        if (toInput) toInput.value = todayISO;

        [fSport, fGender, fLevel, fKind].forEach(function (sel) {
            sel.addEventListener('change', function () {
                sFilters.sport = fSport.value;
                sFilters.gender = fGender.value;
                sFilters.level = fLevel.value;
                sFilters.kind = fKind.value;
                runSearch();
            });
        });

        rangeBtns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                rangeBtns.forEach(function (b) { b.classList.toggle('is-on', b === btn); });
                sRange = btn.dataset.range;
                customWrap.hidden = sRange !== 'custom';
                runSearch();
            });
        });
        if (fromInput) fromInput.addEventListener('change', function () { if (sRange === 'custom') runSearch(); });
        if (toInput) toInput.addEventListener('change', function () { if (sRange === 'custom') runSearch(); });

        // The directory is what turns a school name into its crest. It is
        // small and likely already cached from the homepage, and the results
        // are perfectly readable without it, so a failure here must not stop
        // the search from working.
        fetch('data/directory.json')
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                ((d && d.directory) || []).forEach(function (e) {
                    if (!e.school || !e.logo) return;
                    sCrests[e.school] = e.logo;
                    sCrests[normSchool(e.school)] = e.logo;
                });

                // Re-render to pick up crests, but only if a search has
                // actually produced a result to render - otherwise this can
                // resolve before runSearch()'s own fetch does, and would
                // repaint the panel with an empty, dateless result first.
                if (lastFrom) renderResults(lastResults, lastFrom, lastTo);
            })
            .catch(function () { });

        runSearch();
    }

    function normSchool(s) {
        return String(s || '').toLowerCase()
            .replace(/\b(high school|high|school|township|regional|academy|hs)\b/g, '')
            .replace(/[^a-z]/g, '');
    }

    function currentRange() {
        var todayISO = easternToday();
        if (sRange === 'today') return [todayISO, todayISO];
        if (sRange === 'week') return [todayISO, addDaysISO(todayISO, 6)];
        if (sRange === 'season') {
            var season = sFilters.sport ? sportSeason(sFilters.sport, sFilters.gender) : null;
            // A sport whose season depends on gender (tennis, volleyball) needs
            // a gender chosen to know which window to use; without one, fall
            // back to the whole school year rather than guessing.
            return seasonWindow(season);
        }
        // custom
        var from = (fromInput && fromInput.value) || todayISO;
        var to = (toInput && toInput.value) || from;
        if (to < from) { var t = from; from = to; to = t; }   // a reversed pair is still a valid range
        return [from, to];
    }

    function fmtRange(from, to) {
        var a = new Date(from + 'T12:00:00'), b = new Date(to + 'T12:00:00');
        var opts = { month: 'short', day: 'numeric' };
        if (a.getFullYear() !== b.getFullYear()) opts.year = 'numeric';
        var aStr = a.toLocaleDateString('en-US', opts);
        var bOpts = { month: 'short', day: 'numeric', year: 'numeric' };
        var bStr = b.toLocaleDateString('en-US', bOpts);
        return from === to ? bStr : aStr + ' – ' + bStr;
    }

    function filterLabel() {
        var parts = [];
        if (sFilters.gender) parts.push(sFilters.gender);
        if (sFilters.level) parts.push(sFilters.level);
        parts.push(sFilters.sport || 'All Sports');
        parts.push(sFilters.kind === 'Scrimmage' ? 'Scrimmages' : sFilters.kind === 'Game' ? 'Games' : 'Games & Scrimmages');
        return parts.join(' ');
    }

    var lastResults = [];
    var lastFrom = null, lastTo = null;

    // Every filter or range change calls runSearch() again immediately, and a
    // visitor clicking through sport, then gender, then level in quick
    // succession is the ordinary case, not an edge case - each click fires a
    // fetch before the previous one has necessarily returned. Without a guard,
    // whichever fetch happens to finish last wins, and a month file that was
    // already cached from an earlier search can resolve after a slower,
    // not-yet-cached one for the search that actually followed it - so an
    // outdated result silently overwrites the current selection. searchGen
    // makes each call to runSearch() a generation; a resolution only renders
    // if no newer generation has started since. The filters and date range
    // are also captured into local constants at call time rather than read
    // from the shared sFilters object when the fetch resolves, so a filter
    // changed while a request is in flight cannot be applied retroactively to
    // a request that was already sent under the old one.
    var searchGen = 0;

    function runSearch() {
        var gen = ++searchGen;
        var range = currentRange();
        var from = range[0], to = range[1];
        var filters = { sport: sFilters.sport, gender: sFilters.gender, level: sFilters.level, kind: sFilters.kind };
        var months = monthsInRange(from, to).filter(function (m) { return index.months.indexOf(m) !== -1; });

        if (!months.length) { renderResults([], from, to); return; }

        summary.textContent = 'Loading …';
        summary.className = 'cal-search-summary';
        resultsEl.innerHTML = '';

        Promise.all(months.map(loadMonth)).then(function (lists) {
            if (gen !== searchGen) return;   // superseded by a later search

            var all = [];
            lists.forEach(function (list) { all = all.concat(list); });

            var filtered = all.filter(function (g) {
                if (g.date < from || g.date > to) return false;
                var gender = g.gender || SCHOOL_GENDER[g.school] || '';
                if (filters.gender && gender !== filters.gender) return false;
                if (filters.level && g.level !== filters.level) return false;
                if (filters.kind && (g.kind || 'Game') !== filters.kind) return false;
                if (filters.sport && baseSport(g.sport) !== filters.sport) return false;
                return true;
            });

            renderResults(filtered, from, to);
        }).catch(function () {
            if (gen !== searchGen) return;
            summary.textContent = 'Some months in this range could not be loaded.';
            summary.className = 'cal-search-summary is-empty';
            resultsEl.innerHTML = '';
        });
    }

    // One fixture, however many levels play it - identical to the grouping on
    // the homepage, and for the same reason: Freshman, JV and Varsity at the
    // same school, same opponent, same hour is one game with three teams, not
    // three near-identical rows. Kept separate whenever the hour or the status
    // differs, since those are exactly the difference a search like this is
    // usually run to find.
    var LEVEL_SHORT = { 'Varsity': 'V', 'Junior Varsity': 'JV', 'Freshman': 'F', 'Middle School': 'MS' };
    var LEVEL_ORDER = ['Varsity', 'Junior Varsity', 'Freshman', 'Middle School'];

    function groupFixtures(list) {
        var map = {}, out = [];
        list.forEach(function (g) {
            var k = [g.school, g.opponent, g.home, g.sport, g.gender, g.time, g.status, g.kind].join('|');
            if (!map[k]) { map[k] = { game: g, levels: [] }; out.push(map[k]); }
            if (g.level && map[k].levels.indexOf(g.level) === -1) map[k].levels.push(g.level);
        });
        out.forEach(function (fx) {
            fx.levels.sort(function (a, b) {
                var i = LEVEL_ORDER.indexOf(a), j = LEVEL_ORDER.indexOf(b);
                return (i === -1 ? 99 : i) - (j === -1 ? 99 : j);
            });
        });
        return out;
    }

    function renderResults(list, from, to) {
        lastResults = list; lastFrom = from; lastTo = to;
        var fixtures = groupFixtures(list).sort(function (a, b) {
            return a.game.date === b.game.date
                ? (a.game.time || '99:99').localeCompare(b.game.time || '99:99')
                : a.game.date.localeCompare(b.game.date);
        });

        resultsEl.innerHTML = '';

        if (!fixtures.length) {
            summary.textContent = 'No ' + filterLabel().toLowerCase() + ' found for ' + fmtRange(from, to) + '.';
            summary.className = 'cal-search-summary is-empty';
            return;
        }

        summary.innerHTML = '';
        var strong = document.createElement('strong');
        strong.textContent = fixtures.length + (fixtures.length === 1 ? ' game' : ' games');
        summary.appendChild(strong);
        summary.appendChild(document.createTextNode(' — ' + filterLabel() + ', ' + fmtRange(from, to)));
        summary.className = 'cal-search-summary';

        var shown = fixtures.slice(0, RESULT_CAP);
        var byDate = {}, order = [];
        shown.forEach(function (fx) {
            var d = fx.game.date;
            if (!byDate[d]) { byDate[d] = []; order.push(d); }
            byDate[d].push(fx);
        });

        order.forEach(function (date) {
            var group = document.createElement('div');
            group.className = 'cal-search-group';
            var h3 = document.createElement('h3');
            var d = new Date(date + 'T12:00:00');
            h3.textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            group.appendChild(h3);
            byDate[date].forEach(function (fx) { group.appendChild(buildSearchRow(fx)); });
            resultsEl.appendChild(group);
        });

        if (fixtures.length > RESULT_CAP) {
            var cap = document.createElement('p');
            cap.className = 'cal-search-cap';
            cap.textContent = 'Showing the first ' + RESULT_CAP + ' of ' + fixtures.length +
                ' games. Choose a sport or narrow the range to see the rest.';
            resultsEl.appendChild(cap);
        }
    }

    function searchTeam(name) {
        var wrap = document.createElement('span');
        wrap.className = 'cal-search-team';

        var file = sCrests[name] || sCrests[normSchool(name)];
        if (file) {
            var img = document.createElement('img');
            img.className = 'cal-search-crest';
            img.src = 'images/logos/optimized/' + file;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.onerror = function () { this.remove(); };
            wrap.appendChild(img);
        }

        var label = document.createElement('span');
        label.textContent = name;
        wrap.appendChild(label);
        return wrap;
    }

    function buildSearchRow(fx) {
        var g = fx.game;
        var row = document.createElement('div');
        row.className = 'cal-search-row' + (g.status ? ' is-off' : '');

        var t = document.createElement('span');
        t.className = 'cal-search-time';
        t.textContent = g.timeLabel || 'TBA';
        row.appendChild(t);

        var mid = document.createElement('span');
        mid.className = 'cal-search-match';

        var teams = document.createElement('strong');
        teams.className = 'cal-search-teams';
        teams.appendChild(searchTeam(g.school));

        if (g.opponent) {
            var sep = document.createElement('em');
            sep.className = 'cal-search-vs';
            sep.textContent = g.home === true ? 'vs' : g.home === false ? 'at' : 'v';
            teams.appendChild(sep);
            teams.appendChild(searchTeam(g.opponent));
        } else {
            var tba = document.createElement('span');
            tba.className = 'cal-search-tba';
            tba.textContent = '— opponent TBA';
            teams.appendChild(tba);
        }
        mid.appendChild(teams);

        var meta = document.createElement('span');
        meta.className = 'cal-search-meta';
        meta.textContent = g.sport;
        mid.appendChild(meta);
        row.appendChild(mid);

        if (fx.levels.length) {
            var wrap = document.createElement('span');
            wrap.className = 'cal-search-levels';
            fx.levels.forEach(function (lv) {
                var b = document.createElement('b');
                b.textContent = LEVEL_SHORT[lv] || lv;
                b.title = lv;
                wrap.appendChild(b);
            });
            row.appendChild(wrap);
        }

        if (g.kind && g.kind !== 'Game') {
            var k = document.createElement('span');
            k.className = 'cal-kind';
            k.textContent = g.kind;
            mid.appendChild(k);
        }

        if (g.status) {
            var s = document.createElement('span');
            s.className = 'cal-search-status';
            s.textContent = g.status;
            row.appendChild(s);
        }
        return row;
    }
});
