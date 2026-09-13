// SEC News (redesign): a slider. Stories scroll horizontally a page at a time,
// with arrows and dots. The section hides itself when news.json is empty rather
// than leaving a bare heading on the page.
document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.njac-news');
    if (!section) return;

    var track = section.querySelector('.news-track');
    var prev = section.querySelector('.news-prev');
    var next = section.querySelector('.news-next');
    var dots = section.querySelector('.news-dots');
    if (!track) return;

    fetch('data/news.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var items = (data.news || []).filter(function (n) { return n && n.title; });
            if (!items.length) { section.style.display = 'none'; return; }
            items.forEach(function (n) { track.appendChild(buildItem(n)); });
            setupSlider();
        })
        .catch(function () { section.style.display = 'none'; });

    function buildItem(n) {
        var item = document.createElement('article');
        item.className = 'news-item';

        if (n.image) {
            var img = document.createElement('img');
            img.className = 'news-thumb';
            img.src = n.image;
            img.alt = n.title;
            img.loading = 'lazy';
            img.onerror = function () { this.style.display = 'none'; };
            item.appendChild(img);
        }

        var body = document.createElement('div');
        body.className = 'news-body';

        var h3 = document.createElement('h3');
        if (n.url) {
            var a = document.createElement('a');
            a.href = n.url;
            a.textContent = n.title;
            if (/^https?:\/\//i.test(n.url)) { a.target = '_blank'; a.rel = 'noopener'; }
            h3.appendChild(a);
        } else {
            h3.textContent = n.title;
        }
        body.appendChild(h3);

        if (n.date) {
            var d = document.createElement('p');
            d.className = 'news-date';
            d.textContent = formatDate(n.date);
            body.appendChild(d);
        }
        if (n.excerpt) {
            var p = document.createElement('p');
            p.className = 'news-excerpt';
            p.textContent = n.excerpt;
            body.appendChild(p);
        }
        item.appendChild(body);
        return item;
    }

    function setupSlider() {
        function pageWidth() { return track.clientWidth; }

        function pageCount() {
            return Math.max(1, Math.ceil(track.scrollWidth / Math.max(1, pageWidth())));
        }

        function currentPage() {
            return Math.round(track.scrollLeft / Math.max(1, pageWidth()));
        }

        function go(dir) {
            track.scrollBy({ left: dir * pageWidth(), behavior: 'smooth' });
        }

        if (prev) prev.addEventListener('click', function () { go(-1); });
        if (next) next.addEventListener('click', function () { go(1); });

        function renderDots() {
            if (!dots) return;
            var n = pageCount();
            dots.innerHTML = '';
            if (n < 2) { dots.hidden = true; return; }
            dots.hidden = false;
            for (var i = 0; i < n; i++) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'news-dot' + (i === currentPage() ? ' is-active' : '');
                b.setAttribute('aria-label', 'Go to news page ' + (i + 1));
                (function (idx) {
                    b.addEventListener('click', function () {
                        track.scrollTo({ left: idx * pageWidth(), behavior: 'smooth' });
                    });
                })(i);
                dots.appendChild(b);
            }
        }

        function syncArrows() {
            var maxScroll = track.scrollWidth - track.clientWidth - 2;
            var overflowing = maxScroll > 0;
            [prev, next].forEach(function (b) { if (b) b.hidden = !overflowing; });
            if (prev) prev.disabled = track.scrollLeft <= 2;
            if (next) next.disabled = track.scrollLeft >= maxScroll;
            if (dots) {
                Array.prototype.forEach.call(dots.children, function (d, i) {
                    d.classList.toggle('is-active', i === currentPage());
                });
            }
        }

        renderDots();
        syncArrows();
        track.addEventListener('scroll', syncArrows, { passive: true });
        window.addEventListener('resize', function () { renderDots(); syncArrows(); });
    }

    function formatDate(iso) {
        var d = new Date(iso + 'T12:00:00');
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
});
