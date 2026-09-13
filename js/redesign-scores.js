// Fall scores ticker. Reads data/scores.json and renders a continuously
// scrolling band of recent conference results on the home page. Hides itself
// if there are no scores. Pauses on hover/focus; honours reduced-motion.
document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.njac-scores');
    if (!section) return;
    var track = section.querySelector('.score-track');
    if (!track) return;

    fetch('data/scores.json', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var games = (data.games || []).filter(function (g) { return g && g.teams && g.teams.length === 2; });
            if (!games.length) { section.style.display = 'none'; return; }

            var meta = section.querySelector('.score-season');
            if (meta && data.season) meta.textContent = data.season;

            var LIMIT = 60;
            var cards = games.slice(0, LIMIT).map(buildCard);

            // Two copies back-to-back so the scroll can loop seamlessly at -50%.
            cards.forEach(function (c) { track.appendChild(c); });
            cards.forEach(function (c) { track.appendChild(c.cloneNode(true)); });

            // Duration scales with content so the speed is constant regardless of
            // how many games there are (~ one card every 3.2s).
            var secs = Math.max(24, cards.length * 3.2);
            track.style.animationDuration = secs + 's';
        })
        .catch(function () { section.style.display = 'none'; });

    function fmtDate(iso) {
        var d = new Date(iso + 'T12:00:00');
        return isNaN(d) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function teamEl(t, won) {
        var el = document.createElement('span');
        el.className = 'score-team' + (won ? ' is-win' : '');
        if (t.slug) {
            var img = document.createElement('img');
            img.className = 'score-logo';
            img.src = 'images/logos/optimized/' + t.slug + '.png';
            img.alt = '';
            img.loading = 'lazy';
            img.onerror = function () { this.style.display = 'none'; };
            el.appendChild(img);
        }
        var nm = document.createElement('span');
        nm.className = 'score-name';
        nm.textContent = t.name;
        el.appendChild(nm);
        var sc = document.createElement('span');
        sc.className = 'score-num';
        sc.textContent = t.score;
        el.appendChild(sc);
        return el;
    }

    function buildCard(g) {
        var card = document.createElement('div');
        card.className = 'score-card';

        var head = document.createElement('div');
        head.className = 'score-head';
        head.textContent = g.sport + ' · ' + fmtDate(g.date);
        card.appendChild(head);

        var row = document.createElement('div');
        row.className = 'score-row';
        var a = g.teams[0], b = g.teams[1];
        row.appendChild(teamEl(a, a.winner));
        row.appendChild(teamEl(b, b.winner));
        card.appendChild(row);
        return card;
    }
});
