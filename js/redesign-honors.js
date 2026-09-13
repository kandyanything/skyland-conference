// SEC Honors: championships, scholar athletes and other recognition.
// Hides itself while honors.json is empty so the page shows no bare heading.
document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.njac-honors');
    if (!section) return;

    var grid = section.querySelector('.honors-grid');
    if (!grid) return;

    fetch('data/honors.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var items = (data.honors || []).filter(function (h) { return h && h.title; });
            if (!items.length) { section.style.display = 'none'; return; }
            items.forEach(function (h) { grid.appendChild(buildCard(h)); });
        })
        .catch(function () { section.style.display = 'none'; });

    function buildCard(h) {
        var card = document.createElement('article');
        card.className = 'honor-card';

        if (h.year || h.sport) {
            var tag = document.createElement('p');
            tag.className = 'honor-tag';
            tag.textContent = [h.sport, h.year].filter(Boolean).join(' · ');
            card.appendChild(tag);
        }

        var h3 = document.createElement('h3');
        if (h.url) {
            var a = document.createElement('a');
            a.href = h.url;
            a.textContent = h.title;
            if (/^https?:\/\//i.test(h.url)) { a.target = '_blank'; a.rel = 'noopener'; }
            h3.appendChild(a);
        } else {
            h3.textContent = h.title;
        }
        card.appendChild(h3);

        if (h.description) {
            var p = document.createElement('p');
            p.className = 'honor-desc';
            p.textContent = h.description;
            card.appendChild(p);
        }

        if (Array.isArray(h.items) && h.items.length) {
            var ul = document.createElement('ul');
            ul.className = 'honor-list';
            h.items.forEach(function (name) {
                var li = document.createElement('li');
                li.textContent = name;
                ul.appendChild(li);
            });
            card.appendChild(ul);
        }
        return card;
    }
});
