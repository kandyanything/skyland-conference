// Renders one of the four Extra Pages from its own data/pages/custom-N.json,
// named by this page's own data-source attribute so the one script serves all
// four files without knowing which one it is.
//
// The publish gate lives here, not in the CMS. Saving a change through the
// editor is a normal commit either way - a draft and a published page are
// both real files sitting in the deployed site the instant that commit goes
// out. What makes a draft not "live" is that this script refuses to show its
// content and nav-render.js refuses to list it, until 'published' is true.
// That is an honest "not shown to ordinary visitors", not a cryptographic
// "cannot be found" - the JSON itself is still a plain fetchable file, exactly
// as every other page's data already is. For a conference site with nothing
// sensitive in it, unlisted-until-ready is the right bar; nobody should read
// this as a stronger guarantee than that.
document.addEventListener('DOMContentLoaded', function () {
    var mount = document.querySelector('.generic-page');
    if (!mount) return;

    var src = mount.getAttribute('data-source');
    if (!src) return;

    fetch(src)
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            if (!data.published) { renderUnpublished(); return; }
            renderPage(data);
        })
        .catch(function () { renderUnpublished(); });

    function renderUnpublished() {
        mount.innerHTML = '';
        var section = document.createElement('section');
        section.className = 'generic-page-empty';
        var p = document.createElement('p');
        p.textContent = 'This page is not public yet.';
        section.appendChild(p);
        mount.appendChild(section);
    }

    function renderPage(data) {
        if (data.pageTitle) document.title = data.pageTitle + ' | SEC';

        mount.innerHTML = '';

        var head = document.createElement('section');
        head.className = 'page-head';
        var wrap1 = document.createElement('div');
        wrap1.className = 'wrap';
        if (data.eyebrow) {
            var eyebrow = document.createElement('div');
            eyebrow.className = 'eyebrow';
            eyebrow.textContent = data.eyebrow;
            wrap1.appendChild(eyebrow);
        }
        var h1 = document.createElement('h1');
        h1.textContent = data.pageTitle || 'Untitled Page';
        wrap1.appendChild(h1);
        if (data.intro) {
            var introP = document.createElement('p');
            introP.textContent = data.intro;
            wrap1.appendChild(introP);
        }
        head.appendChild(wrap1);
        mount.appendChild(head);

        var main = document.createElement('main');
        var container = document.createElement('div');
        container.className = 'container';
        var section = document.createElement('section');

        var items = Array.isArray(data.items) ? data.items.filter(function (i) { return i && i.title; }) : [];
        if (items.length) {
            var grid = document.createElement('div');
            grid.className = 'link-grid';
            items.forEach(function (item) {
                var card = item.url ? document.createElement('a') : document.createElement('div');
                card.className = 'link-card';
                if (item.url) {
                    card.href = item.url;
                    if (/^https?:\/\//i.test(item.url)) { card.target = '_blank'; card.rel = 'noopener'; }
                }
                var h3 = document.createElement('h3');
                h3.textContent = item.title;
                card.appendChild(h3);
                if (item.description) {
                    var p = document.createElement('p');
                    p.textContent = item.description;
                    card.appendChild(p);
                }
                grid.appendChild(card);
            });
            section.appendChild(grid);
        }

        container.appendChild(section);
        main.appendChild(container);
        mount.appendChild(main);
    }
});
