// Homepage load reveal. A circle coin-flips through five photographic sport
// balls (each landing with a squash-and-settle), then flips into the Skyland
// badge, which arrives on a burst of light + a shockwave ring + a shine sweep
// and keeps drifting toward the viewer (Ken Burns) while "SKYLAND CONFERENCE /
// 25 SCHOOLS - ONE CONFERENCE" fades in. Finally the crest flies up and docks
// into the site's header logo as the veil clears - the intro becomes the page.
// Plays once per session, skips on a click, honours reduced-motion, and always
// removes itself (a hard timeout guarantees the veil can never linger). Add
// ?intro to force a replay. Loaded in <head> so it covers before the paint.
(function () {
    'use strict';

    var force = /[?&#]intro\b/i.test(location.search + location.hash);
    if (!force) {
        try {
            if (sessionStorage.getItem('skylandIntroPlayed')) return;
            sessionStorage.setItem('skylandIntroPlayed', '1');
        } catch (e) { /* storage blocked - still fine to play once */ }
        if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    }

    var veil = document.createElement('div');
    veil.id = 'skyland-intro';
    veil.setAttribute('aria-hidden', 'true');
    veil.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:pointer;' +
        'background:radial-gradient(120% 90% at 50% 40%,#080f2a 0%,#040a1f 55%,#020510 100%);' +
        'transition:opacity .8s ease;opacity:1;';
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    veil.appendChild(canvas);
    function mount() { if (!veil.parentNode) (document.body || document.documentElement).appendChild(veil); }
    mount();
    document.addEventListener('DOMContentLoaded', mount);

    var ctx = canvas.getContext('2d');
    var W, H, DPR, cx, cy, R, start = null, firstTs = null, raf = 0, ended = false;
    var PI = Math.PI, PI2 = PI * 2;

    function img(src) { var i = new Image(); i.src = src; return i; }
    var balls = ['basketball', 'soccer', 'tennis', 'lacrosse', 'volleyball'].map(function (n) { return img('images/balls/' + n + '.png'); });
    var logo = img('images/skyland-mark.svg');
    var assets = balls.concat([logo]);
    function ready() { for (var i = 0; i < assets.length; i++) { if (!assets[i].complete || !assets[i].naturalWidth) return false; } return true; }

    function size() {
        W = window.innerWidth; H = window.innerHeight;
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = W * DPR; canvas.height = H * DPR;
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        cx = W * 0.5; cy = H * 0.40; R = Math.min(W, H) * 0.20;
    }
    size();

    // ---- shapes (drawn at origin; caller sets the transform) ------------
    function ballShadow(r) { ctx.save(); ctx.globalAlpha = 0.30; ctx.fillStyle = '#000';
        try { ctx.filter = 'blur(6px)'; } catch (e) {}
        ctx.beginPath(); ctx.ellipse(0, r * 1.02, r * 0.80, r * 0.20, 0, 0, PI2); ctx.fill(); ctx.restore(); }
    function ballShape(im, r) { if (im.complete && im.naturalWidth) { var s = 2.18 * r; ctx.drawImage(im, -s / 2, -s / 2, s, s); } }
    function crestShape(r) {
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = r * 0.30; ctx.shadowOffsetY = r * 0.07;
        var g = ctx.createRadialGradient(-r * 0.32, -r * 0.34, r * 0.15, 0, 0, r);
        g.addColorStop(0, '#7adcf0'); g.addColorStop(0.68, '#45b8d0'); g.addColorStop(1, '#1a7a95');
        ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.fillStyle = g; ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.lineWidth = r * 0.035; ctx.strokeStyle = 'rgba(255,255,255,0.70)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.stroke();
        if (logo.complete && logo.naturalWidth) {
            var iw = logo.naturalWidth, ih = logo.naturalHeight, fit = 1.42 * r / Math.max(iw, ih);
            ctx.drawImage(logo, -iw * fit / 2, -ih * fit / 2, iw * fit, ih * fit);
        }
        ctx.restore();
    }

    function drawFace(i, sx, sy, r) {
        ctx.save(); ctx.translate(cx, cy);
        if (i < 5) { ballShadow(r); ctx.scale(sx, sy); ballShape(balls[i], r); }
        else { ctx.scale(sx, sy); crestShape(r); }
        ctx.restore();
    }
    function crestAt(x, y, r) { ctx.save(); ctx.translate(x, y); crestShape(r); ctx.restore(); }

    // ---- the climactic reveal effects -----------------------------------
    function revealBurst(prog) {          // bloom + shockwave ring, additive
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        var fade = 1 - prog;
        var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (1.2 + prog * 1.8));
        bg.addColorStop(0, 'rgba(255,255,255,' + (0.55 * fade).toFixed(3) + ')');
        bg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.7 * fade; ctx.strokeStyle = '#eef4ff'; ctx.lineWidth = Math.max(1, 5 * fade);
        ctx.beginPath(); ctx.arc(cx, cy, R * (1 + prog * 2.4), 0, PI2); ctx.stroke();
        ctx.restore();
    }
    function shineSweep(r, prog) {         // specular glint across the crest
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, PI2); ctx.clip();
        var x = cx - r * 1.2 + prog * r * 2.6;
        var g = ctx.createLinearGradient(x - r * 0.5, cy - r, x + r * 0.5, cy + r);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
        ctx.restore();
    }
    function spotlight(alpha) {
        ctx.save(); ctx.globalAlpha = alpha;
        var g = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 2.8);
        g.addColorStop(0, 'rgba(69,184,208,.15)'); g.addColorStop(1, 'rgba(69,184,208,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    function wordmark(alpha) {
        if (alpha <= 0) return;
        ctx.save(); ctx.globalAlpha = alpha; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#45b8d0'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - R * 1.05, cy + R * 1.5); ctx.lineTo(cx + R * 1.05, cy + R * 1.5); ctx.stroke();
        ctx.font = '700 ' + Math.min(W * 0.052, 50) + 'px "Oswald","Arial Narrow",system-ui,sans-serif';
        ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(69,184,208,.5)'; ctx.shadowBlur = 18;
        ctx.fillText('SKYLAND CONFERENCE', cx, cy + R * 1.92);
        ctx.shadowBlur = 0;
        ctx.font = '600 ' + Math.min(W * 0.022, 20) + 'px "Oswald","Arial Narrow",system-ui,sans-serif';
        ctx.fillStyle = '#45b8d0';
        try { ctx.letterSpacing = '3px'; } catch (e) {}
        ctx.fillText('25 SCHOOLS · ONE CONFERENCE', cx, cy + R * 2.4);
        try { ctx.letterSpacing = '0px'; } catch (e) {}
        ctx.restore();
    }

    // ---- timeline -------------------------------------------------------
    var SHOW = 440, FLIP = 240, UNIT = SHOW + FLIP, BALLS = 5;
    var LOGO_HOLD = 700, SWAP = 800, TAG_HOLD = 1500, OUTRO = 850;
    var ballsEnd = BALLS * UNIT, total = LOGO_HOLD + SWAP + TAG_HOLD;
    function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

    var hx, hy, hr, homed = false;
    function computeHome() {
        var el = document.querySelector('.masthead-logo'), rc = el && el.getBoundingClientRect();
        if (rc && rc.width > 4 && rc.height > 4) { hx = rc.left + rc.width / 2; hy = rc.top + rc.height / 2; hr = Math.min(rc.width, rc.height) / 2; }
        else { hx = cx; hy = H * 0.12; hr = R * 0.4; }   // fallback: drift up and shrink
        homed = true;
    }

    function frame(ts) {
        if (ended) return;
        if (firstTs === null) firstTs = ts;
        if (start === null) {
            if (ready() || ts - firstTs > 3000) start = ts;
            else { raf = requestAnimationFrame(frame); return; }
        }
        var e = ts - start;
        ctx.clearRect(0, 0, W, H);
        spotlight(0.85);

        if (e < ballsEnd) {                                   // 1. ball cycle
            var idx = Math.floor(e / UNIT), into = e - idx * UNIT;
            if (into < SHOW) {
                var st = into < 200 ? (1 - into / 200) : 0, a = st * st;   // squash-and-settle on landing
                drawFace(idx, 1 + 0.12 * a, 1 - 0.12 * a, R);
            } else {
                var q = (into - SHOW) / FLIP, sxx = Math.abs(Math.cos(q * PI)), f = q < 0.5 ? idx : idx + 1;
                drawFace(f, sxx, 1, R);
            }
        } else {
            var t = e - ballsEnd;
            if (t < total) {                                  // 2. crest holds: Ken Burns + reveal + wordmark
                var kb = 1 + 0.19 * Math.min(1, t / total);
                drawFace(5, 1, 1, R * kb);
                if (t < 720) shineSweep(R * kb, t / 720);
                if (t < 520) revealBurst(t / 520);
                if (t > LOGO_HOLD) wordmark(Math.min(1, (t - LOGO_HOLD) / SWAP));
            } else if (t < total + OUTRO) {                   // 3. hand off into the header logo
                if (!homed) { computeHome(); veil.style.transition = 'none'; }
                var o = (t - total) / OUTRO, oe = easeInOut(o);
                veil.style.opacity = String(1 - Math.max(0, (o - 0.35) / 0.65));
                wordmark(Math.max(0, 1 - o * 2.2));
                crestAt(cx + (hx - cx) * oe, cy + (hy - cy) * oe, (R * 1.19) + (hr - R * 1.19) * oe);
            } else { finish(); return; }
        }
        raf = requestAnimationFrame(frame);
    }

    function finish() {
        if (ended) return; ended = true;
        if (raf) cancelAnimationFrame(raf);
        veil.style.opacity = '0';
        setTimeout(function () { if (veil.parentNode) veil.parentNode.removeChild(veil); }, 900);
    }

    veil.addEventListener('click', finish);
    window.addEventListener('resize', size);
    setTimeout(finish, 12000);           // hard safety net
    raf = requestAnimationFrame(frame);
})();
