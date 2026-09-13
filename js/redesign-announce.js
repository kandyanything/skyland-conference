// Site-wide announcement pop-up. Reads data/announcement.json and, if it is
// active, shows a dismissible modal after the intro finishes. The admin picks
// how long it keeps showing via "mode":
//   "once"        - a single time per visitor (any close ends it). Default.
//   "acknowledge" - returns every visit until the visitor clicks the primary
//                   "don't show again" button; a casual close (X / Esc) only
//                   hides it for that browser session.
//   "untilDate"   - shows every session until "endDate" (YYYY-MM-DD) passes,
//                   then comes down on its own; a close hides it for the session.
// "id" keys the memory, so posting a new message (new id) re-shows it to
// everyone. Add ?announce to the URL to preview. Fully editable from the CMS.
(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        fetch('data/announcement.json', { cache: 'no-store' })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (a) {
                if (!a || !a.active || !a.title) return;
                var id = a.id || 'announcement';
                var mode = a.mode || (a.frequency === 'always' ? 'always' : 'once');
                var force = /[?&#]announce\b/i.test(location.search + location.hash);
                if (!force && !shouldShow(mode, id, a.endDate)) return;
                waitForIntro(function () { render(a, id, mode, force); });
            })
            .catch(function () { /* no announcement, no problem */ });
    });

    // ---- storage + gating ----------------------------------------------
    function lget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lset(k) { try { localStorage.setItem(k, '1'); } catch (e) {} }
    function sget(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
    function sset(k) { try { sessionStorage.setItem(k, '1'); } catch (e) {} }
    function endOfDay(d) { var t = new Date(String(d).slice(0, 10) + 'T23:59:59'); return isNaN(t.getTime()) ? NaN : t.getTime(); }

    function shouldShow(mode, id, endDate) {
        if (mode === 'always') return true;
        if (mode === 'untilDate') {
            var e = endDate ? endOfDay(endDate) : NaN;
            if (!isNaN(e) && Date.now() > e) return false;          // the date has passed - it comes down
            return !sget('annDismiss_' + id);                        // else once per session
        }
        if (mode === 'acknowledge') {
            if (lget('annAck_' + id)) return false;                  // already acknowledged for good
            return !sget('annDismiss_' + id);                        // else once per session until acknowledged
        }
        return !lget('annSeen_' + id);                               // "once": a single time ever
    }

    function remember(mode, id, acknowledged) {
        if (mode === 'once') lset('annSeen_' + id);
        else if (mode === 'acknowledge') { if (acknowledged) lset('annAck_' + id); else sset('annDismiss_' + id); }
        else if (mode === 'untilDate') sset('annDismiss_' + id);
        // "always" remembers nothing
    }

    // The intro veil owns the screen first; wait until it is gone.
    function waitForIntro(cb) {
        function gone() { return !document.getElementById('sec-intro') && !document.getElementById('njac-intro'); }
        if (gone()) { setTimeout(cb, 300); return; }
        var t0 = Date.now();
        var iv = setInterval(function () {
            if (gone() || Date.now() - t0 > 9000) { clearInterval(iv); setTimeout(cb, 250); }
        }, 200);
    }

    var CSS =
        '.ann-backdrop{position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(6,8,11,.62);opacity:0;transition:opacity .25s ease;}' +
        '.ann-backdrop.is-open{opacity:1;}' +
        '.ann-card{position:relative;width:100%;max-width:440px;background:#fff;border-radius:14px;overflow:hidden;' +
        'box-shadow:0 30px 80px rgba(0,0,0,.5);transform:translateY(14px) scale(.97);transition:transform .3s cubic-bezier(.2,.8,.3,1.2);' +
        'font-family:var(--font-body,system-ui,-apple-system,"Segoe UI",sans-serif);}' +
        '.ann-backdrop.is-open .ann-card{transform:none;}' +
        '.ann-bar{height:6px;background:var(--red,#c8102e);}' +
        '.ann-x{position:absolute;top:9px;right:12px;border:0;background:none;font-size:27px;line-height:1;color:#9aa2ad;cursor:pointer;padding:2px 7px;border-radius:6px;}' +
        '.ann-x:hover{color:#22262c;background:#f0f1f3;}' +
        '.ann-x:focus-visible{outline:2px solid var(--red,#c8102e);outline-offset:2px;}' +
        '.ann-eyebrow{margin:20px 26px 0;font-size:.7rem;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--red,#c8102e);}' +
        '.ann-title{font-family:var(--font-display,inherit);margin:6px 26px 8px;font-size:1.5rem;line-height:1.15;color:#14181c;text-transform:uppercase;letter-spacing:.01em;text-wrap:balance;}' +
        '.ann-body{margin:0 26px 20px;color:#48505b;font-size:1rem;line-height:1.55;}' +
        '.ann-actions{display:flex;gap:10px;flex-wrap:wrap;padding:0 26px 24px;}' +
        '.ann-btn{font:inherit;font-weight:600;font-size:.88rem;letter-spacing:.03em;padding:11px 20px;border-radius:8px;cursor:pointer;text-decoration:none;border:2px solid transparent;transition:all .15s;}' +
        '.ann-btn--primary{background:var(--red,#c8102e);color:#fff;}' +
        '.ann-btn--primary:hover{filter:brightness(1.1);}' +
        '.ann-btn--ghost{background:transparent;color:#48505b;border-color:#d6dadf;}' +
        '.ann-btn--ghost:hover{background:#f2f3f5;}' +
        '.ann-btn:focus-visible{outline:2px solid var(--red,#c8102e);outline-offset:2px;}' +
        '@media (prefers-reduced-motion:reduce){.ann-backdrop,.ann-card{transition:none;}}';

    function render(a, id, mode, force) {
        if (document.getElementById('sec-announce')) return;
        if (!document.getElementById('ann-css')) {
            var st = document.createElement('style'); st.id = 'ann-css'; st.textContent = CSS; document.head.appendChild(st);
        }

        var back = document.createElement('div');
        back.id = 'sec-announce'; back.className = 'ann-backdrop';
        back.setAttribute('role', 'dialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-labelledby', 'ann-title');

        var card = document.createElement('div'); card.className = 'ann-card';
        var bar = document.createElement('div'); bar.className = 'ann-bar';
        var x = document.createElement('button'); x.className = 'ann-x'; x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.innerHTML = '&times;';
        card.appendChild(bar); card.appendChild(x);
        if (a.eyebrow) { var ey = document.createElement('div'); ey.className = 'ann-eyebrow'; ey.textContent = a.eyebrow; card.appendChild(ey); }
        var h = document.createElement('h2'); h.id = 'ann-title'; h.className = 'ann-title'; h.textContent = a.title; card.appendChild(h);
        if (a.body) { var p = document.createElement('p'); p.className = 'ann-body'; p.textContent = a.body; card.appendChild(p); }

        var actions = document.createElement('div'); actions.className = 'ann-actions';
        if (a.linkUrl) {
            var link = document.createElement('a'); link.className = 'ann-btn ann-btn--primary';
            link.href = a.linkUrl; link.textContent = a.linkLabel || 'Learn More';
            if (/^https?:/i.test(a.linkUrl)) { link.target = '_blank'; link.rel = 'noopener'; }
            link.addEventListener('click', function () { dismiss(true); });   // engaging with the CTA counts as received
            actions.appendChild(link);
        }
        var got = document.createElement('button'); got.type = 'button'; got.className = 'ann-btn ann-btn--ghost';
        got.textContent = mode === 'acknowledge' ? "Don't show this again" : (a.linkUrl ? 'Dismiss' : 'Got it');
        actions.appendChild(got);
        card.appendChild(actions);

        back.appendChild(card);
        document.body.appendChild(back);
        requestAnimationFrame(function () { back.classList.add('is-open'); });
        setTimeout(function () { x.focus(); }, 60);

        function dismiss(acknowledged) {
            back.classList.remove('is-open');
            setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 260);
            document.removeEventListener('keydown', onKey);
            if (!force) remember(mode, id, acknowledged);
        }
        function onKey(e) {
            if (e.key === 'Escape') dismiss(false);
            if (e.key === 'Tab') {
                var f = back.querySelectorAll('button, a[href]');
                if (!f.length) return;
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        }
        x.addEventListener('click', function () { dismiss(false); });
        got.addEventListener('click', function () { dismiss(true); });
        back.addEventListener('click', function (e) { if (e.target === back) dismiss(false); });
        document.addEventListener('keydown', onKey);
    }
})();
