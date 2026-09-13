// SEC Leadership: the conference's executive officers.
// Hides itself if leadership.json is empty, like the other data-driven sections.
document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.njac-leadership');
    if (!section) return;

    var grid = section.querySelector('.leadership-grid');
    if (!grid) return;

    fetch('data/leadership.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var people = (data.leadership || []).filter(function (p) { return p && p.name && p.role; });
            if (!people.length) { section.style.display = 'none'; return; }
            people.forEach(function (p) { grid.appendChild(buildCard(p)); });
        })
        .catch(function () { section.style.display = 'none'; });

    function buildCard(p) {
        var card = document.createElement('article');
        card.className = 'leader-card';

        var role = document.createElement('p');
        role.className = 'leader-role';
        role.textContent = p.role;
        card.appendChild(role);

        var h3 = document.createElement('h3');
        h3.textContent = p.name;
        card.appendChild(h3);

        if (p.school) {
            var sch = document.createElement('p');
            sch.className = 'leader-school';
            sch.textContent = p.school;
            card.appendChild(sch);
        }

        // Name and position only. Officer contact details are deliberately
        // absent from leadership.json rather than merely unrendered - the file
        // is fetched by the browser, so hiding them here would not keep them
        // off the public site.
        return card;
    }
});
