// Social wall — one feed per platform behind a tab strip, driven by data/social.json.
//
// Facebook is embedded with the official Page Plugin, which is a plain iframe:
// no SDK, no app id, no access token. That is why it works today and keeps
// working if the account changes hands.
//
// Instagram is NOT embeddable the same way. The public oEmbed endpoint was
// retired, and a profile FEED now needs a Business/Creator account, a Meta app
// and a long-lived token that expires every 60 days. So the Instagram tab shows
// whatever posts are listed in social.json (single-post embeds, which still
// work without a token) and otherwise an honest prompt to visit the profile —
// rather than a broken frame or a paid third-party widget.
//
// The section removes itself entirely when no platform is configured, so it
// never renders as an empty box.
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var section = document.querySelector('.njac-social');
        if (!section) return;

        fetch('data/social.json')
            .then(function (r) { return r.json(); })
            .catch(function () { return null; })
            .then(function (cfg) {
                var platforms = (cfg && cfg.platforms || []).filter(function (p) { return p.enabled !== false; });
                if (!platforms.length) { section.remove(); return; }
                render(section, cfg, platforms);
            });
    });

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function render(section, cfg, platforms) {
        var tabsWrap = section.querySelector('.social-tabs');
        var panel = section.querySelector('.social-panel');
        var note = section.querySelector('.social-note');
        if (!tabsWrap || !panel) return;

        if (note && cfg.note) note.textContent = cfg.note;

        var active = null;

        platforms.forEach(function (p, i) {
            var b = el('button', 'social-tab', p.label || p.id);
            b.type = 'button';
            b.setAttribute('role', 'tab');
            b.setAttribute('data-platform', p.id);
            b.addEventListener('click', function () { select(p, b); });
            tabsWrap.appendChild(b);
            if (i === 0) active = { p: p, b: b };
        });

        // "All" is only meaningful once more than one platform actually has a
        // feed we can show; with a single platform it would just duplicate it.
        if (platforms.length > 1 && cfg.showCombined !== false) {
            var all = el('button', 'social-tab', cfg.combinedLabel || 'All');
            all.type = 'button';
            all.setAttribute('role', 'tab');
            all.setAttribute('data-platform', 'all');
            all.addEventListener('click', function () { selectAll(all); });
            tabsWrap.insertBefore(all, tabsWrap.firstChild);
            active = { p: null, b: all };
        }

        function clear() {
            panel.innerHTML = '';
            Array.prototype.forEach.call(tabsWrap.children, function (c) { c.classList.remove('is-active'); c.setAttribute('aria-selected', 'false'); });
        }

        function select(p, b) {
            clear();
            b.classList.add('is-active'); b.setAttribute('aria-selected', 'true');
            panel.classList.remove('social-panel--grid');
            panel.appendChild(buildFeed(p));
        }

        function selectAll(b) {
            clear();
            b.classList.add('is-active'); b.setAttribute('aria-selected', 'true');
            panel.classList.add('social-panel--grid');
            platforms.forEach(function (p) { panel.appendChild(buildFeed(p)); });
        }

        if (active.p) select(active.p, active.b); else selectAll(active.b);
    }

    function buildFeed(p) {
        var box = el('div', 'social-feed');
        box.setAttribute('data-platform', p.id);

        var head = el('div', 'social-feed__head');
        head.appendChild(el('span', 'social-feed__name', p.label || p.id));
        if (p.url) {
            var a = el('a', 'social-feed__link', p.handle || 'Open');
            a.href = p.url; a.target = '_blank'; a.rel = 'noopener';
            head.appendChild(a);
        }
        box.appendChild(head);

        if (p.id === 'facebook' && p.url) {
            // The Page Plugin. adapt_container_width makes it fill the column;
            // the iframe still needs explicit width/height attributes or it
            // collapses to 0 in some browsers.
            var src = 'https://www.facebook.com/plugins/page.php'
                + '?href=' + encodeURIComponent(p.url)
                + '&tabs=timeline&width=500&height=640'
                + '&small_header=false&adapt_container_width=true'
                + '&hide_cover=false&show_facepile=true';
            var f = document.createElement('iframe');
            f.src = src;
            f.title = (p.label || 'Facebook') + ' feed';
            f.width = '500'; f.height = '640';
            f.style.cssText = 'border:none;overflow:hidden;width:100%;max-width:500px;';
            f.scrolling = 'no';
            f.frameBorder = '0';
            f.allow = 'encrypted-media';
            f.loading = 'lazy';
            box.appendChild(f);
            return box;
        }

        if (p.id === 'instagram' && Array.isArray(p.posts) && p.posts.length) {
            // Single-post embeds still work without a token; a profile feed does not.
            var grid = el('div', 'social-posts');
            p.posts.forEach(function (u) {
                var f = document.createElement('iframe');
                f.src = u.replace(/\/?$/, '/') + 'embed';
                f.title = 'Instagram post';
                f.style.cssText = 'border:none;overflow:hidden;width:100%;aspect-ratio:1/1.25;';
                f.scrolling = 'no';
                f.frameBorder = '0';
                f.loading = 'lazy';
                grid.appendChild(f);
            });
            box.appendChild(grid);
            return box;
        }

        // Nothing embeddable yet — say so plainly instead of showing a dead frame.
        var empty = el('div', 'social-empty');
        empty.appendChild(el('p', null, p.emptyText
            || 'Posts will appear here once this account starts posting.'));
        if (p.url) {
            var go = el('a', 'btn btn--ghost', p.cta || ('Visit ' + (p.label || p.id)));
            go.href = p.url; go.target = '_blank'; go.rel = 'noopener';
            empty.appendChild(go);
        }
        box.appendChild(empty);
        return box;
    }
})();
