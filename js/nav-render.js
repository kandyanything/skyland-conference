// Builds the top navigation from data/nav.json rather than from a copy of the
// markup hand-duplicated into all seven pages - which is what it used to be,
// and which meant every wording change (there have been several) meant editing
// every file that carried it. This one script is the entire menu now.
//
// It also absorbs everything js/redesign-nav.js used to do (the hamburger,
// the tap-to-reveal-submenu-then-navigate behaviour, closing on navigate) into
// the same file, run immediately after the menu is built rather than on a
// separate DOMContentLoaded. That ordering matters: the old script assumed the
// menu already existed in the DOM when it ran. This one fetches nav.json
// first, so if the interactivity were wired up by a second, independently-
// timed script, it would very likely run before the menu it is trying to
// attach to actually exists, and silently do nothing.
document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.querySelector('.nav-toggle');
    var list = document.getElementById('primary-menu');
    if (!toggle || !list) return;

    // "index.html" here, "" (the site root) on Netlify once you have actually
    // navigated to "/" rather than "/index.html" - both mean the home page.
    var onHome = /(^|\/)(index\.html)?$/.test(location.pathname);
    var here = location.pathname.split('/').pop() || 'index.html';

    // A link's canonical form is always "index.html#section" - portable from
    // any page. On the home page itself that becomes a same-document anchor
    // instead: "index.html#standings" would otherwise be a different URL from
    // the bare "/" a visitor is actually standing on, and clicking it forces a
    // full reload to get there rather than the smooth scroll a same-page
    // anchor gives for free.
    function resolveHref(href) {
        if (onHome) return href.replace(/^index\.html(?=#)/, '');
        return href;
    }

    // Current page: the one item whose own link, or one of whose children's
    // links, points at the file actually being viewed. Anchors do not count -
    // "index.html#standings" is not "the standings page", it is a section of
    // the home page - only a bare filename match marks anything current.
    function ownsCurrentPage(href) {
        // A link with a fragment is a section of some page, not a page of its
        // own - "index.html#member-schools" must never count as "the current
        // page" just because its filename half happens to match, or every
        // anchor link on the home page would falsely mark itself current the
        // moment you're standing on the home page at all.
        if (href.indexOf('#') !== -1) return false;
        return href === here;
    }

    function buildItem(item) {
        var li = document.createElement('li');
        var isParent = Array.isArray(item.children) && item.children.length > 0;

        if (isParent) li.className = 'has-sub';
        var current = ownsCurrentPage(item.href) ||
            (isParent && item.children.some(function (c) { return ownsCurrentPage(c.href); }));

        var a = document.createElement('a');
        a.href = resolveHref(item.href);
        a.textContent = item.label;
        if (current) a.setAttribute('aria-current', 'page');
        li.appendChild(a);

        if (isParent) {
            var sub = document.createElement('ul');
            sub.className = 'subnav';
            item.children.forEach(function (child) {
                var cli = document.createElement('li');
                var ca = document.createElement('a');
                ca.href = resolveHref(child.href);
                ca.textContent = child.label;
                cli.appendChild(ca);
                sub.appendChild(cli);
            });
            li.appendChild(sub);
        }
        return li;
    }

    // The four Extra Pages are optional, independent, and quiet about their
    // own absence - each is asked for individually so one missing or
    // unpublished page can never hold up the other three, or the core menu.
    var EXTRA_PAGES = [
        'data/pages/custom-1.json', 'data/pages/custom-2.json',
        'data/pages/custom-3.json', 'data/pages/custom-4.json',
    ];

    function fetchExtraItem(path) {
        return fetch(path)
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) {
                if (!d || !d.published || !d.navLabel || !d.file) return null;
                return { label: d.navLabel, href: d.file };
            })
            .catch(function () { return null; });
    }

    Promise.all([
        fetch('data/nav.json').then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); }),
        Promise.all(EXTRA_PAGES.map(fetchExtraItem)),
    ]).then(function (results) {
        var core = results[0].items || [];
        var extras = results[1].filter(Boolean);
        core.concat(extras).forEach(function (item) { list.appendChild(buildItem(item)); });
        wireInteractivity();
    }).catch(function () {
        // The menu failing to load is a real problem, but it must not be a
        // silent one - a page with no way to get anywhere else is the worst
        // version of this failure. A minimal way home is better than nothing.
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = onHome ? '#' : 'index.html';
        a.textContent = 'Home';
        li.appendChild(a);
        list.appendChild(li);
    });

    // ---- Everything js/redesign-nav.js used to do, run after the menu above
    //      actually exists rather than raced against it. ----
    function wireInteractivity() {
        function collapsed() {
            return getComputedStyle(toggle).display !== 'none';
        }

        function close() {
            list.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
            list.querySelectorAll('.has-sub.open').forEach(function (li) {
                li.classList.remove('open');
            });
        }

        toggle.addEventListener('click', function () {
            if (list.classList.contains('open')) { close(); return; }
            list.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
        });

        list.querySelectorAll('a').forEach(function (link) {
            var parent = link.parentElement;
            var isParent = parent.classList.contains('has-sub') && !!parent.querySelector('.subnav');

            link.addEventListener('click', function (e) {
                if (!collapsed()) return;

                if (isParent && !parent.classList.contains('open')) {
                    e.preventDefault();
                    parent.classList.add('open');
                    return;
                }
                if (isParent) return;

                close();
            });
        });

        window.addEventListener('resize', function () {
            if (!collapsed()) close();
        });
    }
});
