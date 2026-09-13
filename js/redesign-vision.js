// SEC Vision (redesign): the first video runs large as a feature, the rest
// sit in a grid beneath it.
//
// Tiles are thumbnails rather than embedded players - ten iframes would load
// the YouTube player ten times on first paint. Clicking a tile swaps that one
// tile for a real autoplaying iframe, so video plays inline on the page.
document.addEventListener('DOMContentLoaded', function () {
    var section = document.querySelector('.njac-vision');
    if (!section) return;

    var feature = section.querySelector('.vision-feature');
    var grid = section.querySelector('.vision-grid');
    if (!feature || !grid) return;

    fetch('data/videos.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var videos = (data.videos || []).filter(function (v) { return v && v.id; });
            if (!videos.length) { section.style.display = 'none'; return; }

            // data-limit caps how many appear here; the rest live on the all-videos
            // page, so newer games push older ones off the front without any edit.
            var limit = parseInt(section.dataset.limit, 10);
            var shown = limit > 0 ? videos.slice(0, limit) : videos;

            feature.appendChild(buildTile(shown[0], true));
            shown.slice(1).forEach(function (v) { grid.appendChild(buildTile(v, false)); });

            var more = section.querySelector('.vision-more');
            if (more && videos.length <= shown.length) more.hidden = true;
        })
        .catch(function () { section.style.display = 'none'; });

    function thumbUrl(v, big) {
        if (v.thumb && /^https?:\/\//i.test(v.thumb)) return v.thumb;
        if (v.thumb) return 'https://i.ytimg.com/vi/' + v.id + '/' + v.thumb + '.jpg';
        return 'https://i.ytimg.com/vi/' + v.id + '/' + (big ? 'maxresdefault' : 'hqdefault') + '.jpg';
    }

    function buildTile(v, big) {
        var tile = document.createElement('article');
        tile.className = 'vision-item' + (big ? ' vision-item--feature' : '');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vision-thumb';
        btn.setAttribute('aria-label', 'Play video: ' + (v.title || 'SEC game'));

        var img = document.createElement('img');
        img.src = thumbUrl(v, big);
        img.alt = v.title || 'SEC game video';
        img.loading = big ? 'eager' : 'lazy';
        img.onerror = function () {
            // maxresdefault is not generated for every upload
            this.onerror = null;
            this.src = 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg';
        };
        btn.appendChild(img);

        var play = document.createElement('span');
        play.className = 'vision-play';
        play.setAttribute('aria-hidden', 'true');
        btn.appendChild(play);

        btn.addEventListener('click', function () {
            var frame = document.createElement('iframe');
            frame.src = 'https://www.youtube.com/embed/' + v.id + '?autoplay=1&rel=0';
            frame.title = v.title || 'SEC game video';
            frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            frame.allowFullscreen = true;
            frame.setAttribute('frameborder', '0');
            btn.replaceWith(frame);
        });

        var meta = document.createElement('div');
        meta.className = 'vision-meta';
        var h3 = document.createElement('h3');
        h3.textContent = v.title || 'SEC game';
        meta.appendChild(h3);
        if (v.sport || v.date) {
            var p = document.createElement('p');
            p.className = 'vision-sub';
            p.textContent = [v.sport, formatDate(v.date)].filter(Boolean).join(' · ');
            meta.appendChild(p);
        }

        tile.appendChild(btn);
        tile.appendChild(meta);
        return tile;
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso + 'T12:00:00');
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
});
