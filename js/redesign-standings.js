// Conference standings: NJ.com publishes the SEC tables, so each sport links
// out to theirs rather than duplicating the data here.
document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.njac-standings');
    if (!section) return;

    var wrap = section.querySelector('.standings-groups');
    var note = section.querySelector('.standings-season');
    if (!wrap) return;

    fetch('data/standings.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var seasons = (data.seasons || []).filter(function (s) { return s.sports && s.sports.length; });
            if (!seasons.length) { section.style.display = 'none'; return; }
            if (note && data.defaultSeason) note.textContent = data.defaultSeason.replace('-', '–') + ' season';

            seasons.forEach(function (s) {
                var group = document.createElement('div');
                group.className = 'standings-group';

                var h3 = document.createElement('h3');
                h3.textContent = s.name;
                group.appendChild(h3);

                var list = document.createElement('div');
                list.className = 'standings-links';
                s.sports.forEach(function (sp) {
                    // A sport with neither a slug nor a url is listed but not
                    // clickable - no SEC table is published for it yet.
                    if (!sp.slug && !sp.url) {
                        var pending = document.createElement('span');
                        pending.className = 'standings-link is-pending';
                        pending.textContent = sp.label;
                        var note = document.createElement('em');
                        note.textContent = 'Link coming soon';
                        pending.appendChild(note);
                        list.appendChild(pending);
                        return;
                    }
                    var a = document.createElement('a');
                    a.className = 'standings-link';
                    a.href = sp.url || (data.baseUrl + '/' + sp.slug + '/standings/season/' +
                             (sp.season || data.defaultSeason) + '?conference=' +
                             (sp.conference || data.defaultConference || 'SEC'));
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.textContent = sp.label;
                    list.appendChild(a);
                });
                group.appendChild(list);
                wrap.appendChild(group);
            });
        })
        .catch(function () { section.style.display = 'none'; });
});
