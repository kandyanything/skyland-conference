// Today at a Glance: what is actually happening across the conference now.
//
// Reads data/schedule/upcoming.json, an eight-day window the nightly build
// writes alongside the month files. A month file runs to 557 KB, far too much
// to load on a homepage to show a few days; the window is 136 KB raw and about
// 5 KB once Netlify compresses it.
//
// "Today" is the conference's today, not the reader's. Someone opening this in
// California at 9pm Sunday should see Monday's New Jersey fixtures, because the
// games are in New Jersey. Every date in the feed is already Eastern, so the
// comparison has to be made in Eastern too.
document.addEventListener('DOMContentLoaded', function () {
    var root = document.querySelector('.njac-today');
    if (!root) return;

    var lede = root.querySelector('.today-lede');
    var days = root.querySelector('.today-days');
    var panel = root.querySelector('.today-panel');

    var DAY_CHIPS = 5;      // today plus the next four days that have fixtures
    var GAME_ROWS = 10;     // beyond this, send them to the full calendar

    var byDate = {};
    var dates = [];
    var today = easternToday();
    var selected = null;
    var sport = '';         // '' means every sport
    var crests = {};        // school name -> logo file, filled from the directory

    function easternToday() {
        try {
            return new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/New_York',
                year: 'numeric', month: '2-digit', day: '2-digit',
            }).format(new Date());
        } catch (e) {
            return new Date().toISOString().slice(0, 10);
        }
    }

    // The window and the directory together: the directory is what turns a
    // school name into its crest. It is small, already cached from the
    // athletic director listing, and the schedule is perfectly readable
    // without it - so a failure there must not take the section down.
    Promise.all([
        fetch('data/schedule/upcoming.json').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }),
        fetch('data/directory.json').then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
    ]).then(function (both) {
        var data = both[0];
        ((both[1] && both[1].directory) || []).forEach(function (d) {
            if (d.school && d.logo) {
                crests[d.school] = d.logo;
                crests[normSchool(d.school)] = d.logo;
            }
        });

        (data.games || []).forEach(function (g) {
            if (g.date < today) return;                  // the build may predate the visit
            if (!byDate[g.date]) { byDate[g.date] = []; dates.push(g.date); }
            byDate[g.date].push(g);
        });
        dates.sort();
        if (!dates.length) { root.style.display = 'none'; return; }

        render();
    }).catch(function () { root.style.display = 'none'; });

    function render() {
        var shown = dates.slice(0, DAY_CHIPS);
        selected = shown[0];

        // The heading promises today. If there is nothing today - a Sunday, or
        // between seasons - say so plainly rather than quietly showing another
        // day's fixtures under a heading that claims otherwise.
        if (dates[0] !== today) {
            lede.textContent = 'No SEC games today. Here is what is coming up.';
            lede.hidden = false;
        } else {
            lede.hidden = true;
        }

        days.innerHTML = '';
        shown.forEach(function (date) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'today-day' + (date === selected ? ' is-on' : '');
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', date === selected ? 'true' : 'false');
            b.dataset.date = date;

            var name = document.createElement('span');
            name.className = 'today-day-name';
            name.textContent = dayLabel(date);

            var n = document.createElement('span');
            n.className = 'today-day-count';
            n.textContent = byDate[date].length;

            b.appendChild(name);
            b.appendChild(n);
            b.addEventListener('click', function () {
                selected = this.dataset.date;

                // Someone following one sport should keep following it as they
                // move through the week - but only where that sport is actually
                // playing, or the panel would come up empty with no explanation.
                if (sport && !byDate[selected].some(function (g) { return g.sport === sport; })) sport = '';

                [].forEach.call(days.children, function (c) {
                    var on = c.dataset.date === selected;
                    c.classList.toggle('is-on', on);
                    c.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                showDay();
            });
            days.appendChild(b);
        });

        showDay();
    }

    function dayLabel(date) {
        if (date === today) return 'Today';
        var d = new Date(date + 'T12:00:00');
        var tomorrow = new Date(today + 'T12:00:00');
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (date === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow';
        return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function showDay() {
        var all = byDate[selected] || [];
        panel.innerHTML = '';

        // A count per sport reads faster than sixty rows, and tells a parent in
        // one glance whether their sport is even playing today. Each one is also
        // the filter for it.
        var counts = {};
        all.forEach(function (g) { counts[g.sport] = (counts[g.sport] || 0) + 1; });
        var sports = Object.keys(counts).sort(function (a, b) {
            return counts[b] - counts[a] || a.localeCompare(b);
        });

        var sum = document.createElement('div');
        sum.className = 'today-sports';
        sum.appendChild(sportPill('All sports', '', all.length));
        sports.forEach(function (s) { sum.appendChild(sportPill(s, s, counts[s])); });
        panel.appendChild(sum);

        var list = sport ? all.filter(function (g) { return g.sport === sport; }) : all;
        var fixtures = group(list);

        var rows = document.createElement('div');
        rows.className = 'today-games';
        fixtures.slice(0, GAME_ROWS).forEach(function (fx) { rows.appendChild(buildRow(fx)); });
        panel.appendChild(rows);

        var more = document.createElement('a');
        more.className = 'today-all';
        // The calendar reads both parts, so a filtered view carries through
        // rather than dumping the reader into every sport on that date.
        more.href = 'calendar.html#' + selected + (sport ? '/' + encodeURIComponent(sport) : '');
        more.textContent = fixtures.length > GAME_ROWS
            ? 'See all ' + list.length + (sport ? ' ' + sport : '') + ' games'
            : 'Open this day in the full calendar';
        panel.appendChild(more);
    }

    function sportPill(label, value, count) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'today-sport' + (sport === value ? ' is-on' : '');
        b.setAttribute('aria-pressed', sport === value ? 'true' : 'false');
        b.appendChild(document.createTextNode(label));

        var c = document.createElement('b');
        c.textContent = count;
        b.appendChild(c);

        b.addEventListener('click', function () {
            // Clicking the sport already showing turns the filter off, so the
            // pill works as a toggle and there is always a way back.
            sport = (sport === value) ? '' : value;
            showDay();
        });
        return b;
    }

    // One fixture, however many teams play it. A school sending Freshman, JV and
    // Varsity to the same opponent at the same hour was three near-identical
    // rows; it is one now, with the levels as badges.
    //
    // The time is part of the key on purpose. Roughly one fixture in five runs
    // its levels at different hours - JV at four, Varsity at half five - and
    // folding those together would hide the very thing a parent came to read.
    // Those stay as separate rows, correctly.
    var LEVEL_SHORT = {
        'Varsity': 'V',
        'Junior Varsity': 'JV',
        'Freshman': 'F',
        'Middle School': 'MS',
    };
    var LEVEL_ORDER = ['Varsity', 'Junior Varsity', 'Freshman', 'Middle School'];

    function group(list) {
        var map = {}, out = [];
        list.forEach(function (g) {
            var k = [g.school, g.opponent, g.home, g.sport, g.gender, g.time, g.status, g.kind].join('|');
            if (!map[k]) {
                map[k] = { game: g, levels: [], count: 0 };
                out.push(map[k]);
            }
            if (g.level && map[k].levels.indexOf(g.level) === -1) map[k].levels.push(g.level);
            map[k].count++;
        });
        out.forEach(function (fx) {
            fx.levels.sort(function (a, b) {
                var i = LEVEL_ORDER.indexOf(a), j = LEVEL_ORDER.indexOf(b);
                return (i === -1 ? 99 : i) - (j === -1 ? 99 : j);
            });
        });
        return out;
    }

    // Feeds spell the same school several ways - "Montville Township High
    // School" here, "Montville High School" there, "Hanover Park" plain. Reduce
    // a name to its distinguishing words so an opponent can be recognised as a
    // conference member however its own school chose to write it.
    //
    // Checked against the full directory: no two SEC schools reduce to the same
    // string, so this cannot put one school's crest on another's row.
    function normSchool(s) {
        return String(s || '')
            .toLowerCase()
            .replace(/\b(high school|high|school|township|regional|academy|hs)\b/g, '')
            .replace(/[^a-z]/g, '');
    }

    // A team's name with its own crest in front of it. Both sides of a fixture
    // get one when both are conference members - which is 42% of them - and the
    // crest sits beside the name it belongs to rather than floating at the start
    // of the row, so there is never a question which team it is for.
    function team(name) {
        var wrap = document.createElement('span');
        wrap.className = 'today-team';

        var file = crests[name] || crests[normSchool(name)];
        if (file) {
            var img = document.createElement('img');
            img.className = 'today-crest';
            img.src = 'images/logos/optimized/' + file;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.onerror = function () { this.remove(); };
            wrap.appendChild(img);
        }

        var label = document.createElement('span');
        label.className = 'today-name';
        label.textContent = name;
        wrap.appendChild(label);
        return wrap;
    }

    function buildRow(fx) {
        var g = fx.game;
        var row = document.createElement('div');
        row.className = 'today-game' + (g.status ? ' is-off' : '');

        var t = document.createElement('span');
        t.className = 'today-time';
        t.textContent = g.timeLabel || 'TBA';
        row.appendChild(t);


        var mid = document.createElement('span');
        mid.className = 'today-match';

        var teams = document.createElement('strong');
        teams.className = 'today-teams';
        teams.appendChild(team(g.school));

        if (g.opponent) {
            var sep = document.createElement('em');
            sep.className = 'today-vs';
            sep.textContent = g.home === true ? 'vs' : g.home === false ? 'at' : 'v';
            teams.appendChild(sep);
            teams.appendChild(team(g.opponent));
        } else {
            // A feed that names no opponent should say so, rather than trailing
            // off and reading like a fault in the page.
            var tba = document.createElement('span');
            tba.className = 'today-tba';
            tba.textContent = '— opponent TBA';
            teams.appendChild(tba);
        }
        mid.appendChild(teams);

        var meta = document.createElement('span');
        meta.className = 'today-meta';
        // The gender is part of the sport's name now where it matters, so
        // repeating it here would read "Girls · Girls Soccer".
        meta.textContent = g.sport;
        mid.appendChild(meta);

        row.appendChild(mid);

        if (fx.levels.length) {
            var wrap = document.createElement('span');
            wrap.className = 'today-levels';
            fx.levels.forEach(function (lv) {
                var b = document.createElement('b');
                b.textContent = LEVEL_SHORT[lv] || lv;
                b.title = lv;
                wrap.appendChild(b);
            });
            row.appendChild(wrap);
        }

        if (g.status) {
            var s = document.createElement('span');
            s.className = 'today-status';
            s.textContent = g.status;
            row.appendChild(s);
        }
        return row;
    }
});
