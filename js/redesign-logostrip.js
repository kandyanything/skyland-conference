// School logos drifting right to left behind the masthead.
//
// The illusion is that the logos pass *behind* the SEC seal and the wordmark:
// they fade out as they reach the end of "Conference", cross the brand unseen,
// and reappear in the gap to the left of the seal before fading off the edge.
//
// That is done with a mask on the marquee layer rather than by hiding anything.
// The mask stops depend on where the brand actually sits, which moves with the
// viewport and shifts again once the webfont loads, so they are measured rather
// than hard-coded and re-measured on resize and after fonts settle.
document.addEventListener('DOMContentLoaded', function () {
    var strip = document.querySelector('.masthead-strip');
    var masthead = document.querySelector('.masthead');
    var brand = document.querySelector('.masthead-brand');
    if (!strip || !masthead || !brand) return;

    // A drifting background is decoration; anyone who has asked for less motion
    // should not get it at all.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var track = document.createElement('div');
    track.className = 'strip-track';
    strip.appendChild(track);

    fetch('data/directory.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var logos = (data.directory || [])
                .map(function (d) { return d.logo; })
                .filter(Boolean);
            if (logos.length < 8) return;              // not worth running

            // Two passes of the same set, so translating by exactly half the
            // track width loops seamlessly with no visible jump.
            [].concat(logos, logos).forEach(function (file, i) {
                var img = document.createElement('img');
                img.className = 'strip-logo';
                img.src = 'images/logos/optimized/' + file;
                img.alt = '';
                img.setAttribute('aria-hidden', 'true');
                // Every copy loads eagerly. The second pass sits thousands of
                // pixels off the right edge, so lazy loading never fires for it
                // - and the schools at the start of the alphabet begin the cycle
                // already behind the wordmark, so their second-pass copy is the
                // ONLY one that ever crosses the visible zone. Marking it lazy
                // left them permanently blank.
                //
                // The cost is small: the duplicate reuses the cached file, so
                // this is 39 requests rather than 78, and low priority keeps
                // them queued behind the hero.
                img.loading = 'eager';
                img.decoding = 'async';
                img.fetchPriority = 'low';
                // A logo's width is unknown until it decodes, so the lap length grows as
                // they arrive - re-measure on each one.
                img.onload = syncShift;
                img.onerror = function () { this.remove(); syncShift(); };
                track.appendChild(img);
            });

            strip.classList.add('is-running');
            syncShift();
            measure();

            window.addEventListener('resize', function () { syncShift(); measure(); });
            if (document.fonts && document.fonts.ready) {
                // the wordmark's width changes when Oswald finishes loading
                document.fonts.ready.then(function () { syncShift(); measure(); });
            }
        })
        .catch(function () { /* no strip - the masthead is fine without it */ });

    // Where the wordmark truly ends. The brand element is sized to its content,
    // but the text node is the authority - a Range measures the glyphs
    // themselves, so the fade lands on the final "e" of "Conference" rather
    // than on a box that may be wider.
    function brandBox() {
        var b = brand.getBoundingClientRect();
        var name = brand.querySelector('.name');
        if (name && name.firstChild && document.createRange) {
            try {
                var r = document.createRange();
                r.selectNodeContents(name);
                var t = r.getBoundingClientRect();
                if (t.width > 0) return { left: b.left, right: Math.max(b.right, t.right) };
            } catch (e) { /* fall through to the element box */ }
        }
        return { left: b.left, right: b.right };
    }

    // How far one lap must travel: the distance from the first logo to its
    // duplicate. Measured rather than expressed as -50% of the track, because
    // the track is a flex item and its box does not necessarily match its
    // content - it was being shrunk, which cut the lap in half and made the
    // strip restart mid-alphabet.
    function syncShift() {
        var imgs = track.querySelectorAll('.strip-logo');
        var n = imgs.length / 2;
        if (!n || n % 1 || !imgs[n]) return;
        var one = imgs[n].offsetLeft - imgs[0].offsetLeft;
        if (one > 0) track.style.setProperty('--strip-shift', one + 'px');
    }

    function measure() {
        var head = masthead.getBoundingClientRect();
        var b = brandBox();
        if (!head.width) return;

        var pct = function (px) { return (px / head.width) * 100; };
        var left = pct(b.left - head.left);
        var right = pct(b.right - head.left);

        // The fade is a real distance, not a share of the viewport, so it looks
        // the same on any screen. Roughly a logo and a half.
        var FADE = 90;
        var fade = pct(FADE);

        // The sliver where a logo re-emerges left of the seal only exists if
        // there is room for it; under ~110px it reads as a flicker.
        var leftGapPx = b.left - head.left;
        var stops;

        if (leftGapPx > 110) {
            stops = [
                'transparent 0%',
                'black ' + Math.max(1, pct(Math.min(FADE, leftGapPx * 0.45))).toFixed(2) + '%',
                'black ' + Math.max(2, left - fade * 0.55).toFixed(2) + '%',
                'transparent ' + left.toFixed(2) + '%',
                'transparent ' + right.toFixed(2) + '%',
                'black ' + Math.min(99.5, right + fade).toFixed(2) + '%',
                'black 100%',
            ];
        } else {
            // no room on the left - logos simply fade into the brand and stop
            stops = [
                'transparent 0%',
                'transparent ' + right.toFixed(2) + '%',
                'black ' + Math.min(99.5, right + fade).toFixed(2) + '%',
                'black 100%',
            ];
        }

        var gradient = 'linear-gradient(to right, ' + stops.join(', ') + ')';
        strip.style.webkitMaskImage = gradient;
        strip.style.maskImage = gradient;
    }
});
