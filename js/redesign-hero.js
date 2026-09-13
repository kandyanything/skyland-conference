// Hero photo slider. Photos cross-fade behind the hero text.
//
// If slides.json is empty the hero keeps its plain gradient, so the page never
// shows an empty banner while photos are still being gathered.
document.addEventListener('DOMContentLoaded', function () {
    var hero = document.querySelector('.hero');
    if (!hero) return;

    fetch('data/slides.json')
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function (data) {
            var slides = (data.slides || []).filter(function (s) { return s && s.image; });
            if (!slides.length) return;                 // keep the gradient hero
            build(slides, data.intervalMs || 6000);
        })
        .catch(function () { /* gradient hero stands */ });

    function build(slides, interval) {
        hero.classList.add('hero--photo');

        var layer = document.createElement('div');
        layer.className = 'hero-slides';
        layer.setAttribute('aria-hidden', 'true');

        slides.forEach(function (s, i) {
            var fig = document.createElement('div');
            // Deliberately not marking the first slide active here. render()
            // starts a slide's drift when it sees the slide become active, and
            // pre-setting the class means the first photograph - the one
            // everybody sees - is the only one that never moves.
            fig.className = 'hero-slide';
            var img = document.createElement('img');
            img.src = s.image;
            img.alt = s.alt || '';
            img.loading = i === 0 ? 'eager' : 'lazy';
            fig.appendChild(img);
            layer.appendChild(fig);
        });
        hero.insertBefore(layer, hero.firstChild);

        var caption = document.createElement('div');
        caption.className = 'hero-caption';
        hero.appendChild(caption);

        var controls = document.createElement('div');
        controls.className = 'hero-controls';
        var prev = mkBtn('‹', 'Previous slide');
        var dots = document.createElement('div');
        dots.className = 'hero-dots';
        var next = mkBtn('›', 'Next slide');
        controls.appendChild(prev);
        controls.appendChild(dots);
        controls.appendChild(next);
        hero.appendChild(controls);

        slides.forEach(function (s, i) {
            var d = document.createElement('button');
            d.type = 'button';
            d.className = 'hero-dot' + (i === 0 ? ' is-active' : '');
            d.setAttribute('aria-label', 'Slide ' + (i + 1));
            d.addEventListener('click', function () { go(i, true); });
            dots.appendChild(d);
        });

        var idx = 0, timer = null;
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // The slow drift across each photograph runs for the slide's whole turn
        // plus the cross-fade that follows it, so the outgoing frame is still
        // moving while the incoming one arrives. Stop it at the moment the class
        // changes and the picture snaps back to its start mid-dissolve, which is
        // the one thing that would give the effect away.
        var FADE_MS = 900;                 // matches the opacity transition in the stylesheet

        // The drift is given twice the time a slide is ever on screen, so it can
        // never run out partway through. Matching it to the slide length looks
        // right on paper and is wrong in practice: reach the end early and the
        // photograph simply stops, holding its last scale for the rest of its
        // turn - no jump, nothing obviously broken, just a picture that quietly
        // stopped being alive while you were looking at it.
        //
        // Only about half the 6% is therefore travelled while a slide is up. That
        // is the intended speed, not a compromise: barely perceptible frame to
        // frame is the whole idea, and it is now guaranteed to still be moving
        // when the next photograph arrives.
        hero.style.setProperty('--kb-duration', (interval * 2 + FADE_MS) + 'ms');

        // The drift is held on its own class rather than on is-active, and that
        // matters more than it looks. Handing over by swapping one class for
        // another changes which rule owns the animation, and the browser treats
        // that as a new animation and restarts it - so the outgoing photograph
        // jumped back to its starting scale halfway through the dissolve, which
        // is precisely the moment anyone would notice. is-playing is added when
        // a slide comes up and removed only once it has finished fading out, so
        // nothing changes underneath the animation while it is visible.
        function play(fig) {
            if (fig.kbTimer) { clearTimeout(fig.kbTimer); fig.kbTimer = null; }
            fig.classList.remove('is-playing');
            void fig.offsetWidth;          // let the removal land, so the drift starts over
            fig.classList.add('is-playing');
        }

        function stopSoon(fig) {
            if (fig.kbTimer) clearTimeout(fig.kbTimer);
            fig.kbTimer = window.setTimeout(function () {
                fig.classList.remove('is-playing');
                fig.kbTimer = null;
            }, FADE_MS);
        }

        function render() {
            var figs = layer.children, ds = dots.children;
            for (var i = 0; i < figs.length; i++) {
                var on = i === idx;
                var was = figs[i].classList.contains('is-active');
                figs[i].classList.toggle('is-active', on);
                if (on && !was) play(figs[i]);
                else if (!on && was) stopSoon(figs[i]);
            }
            for (var j = 0; j < ds.length; j++) ds[j].classList.toggle('is-active', j === idx);

            var s = slides[idx];
            caption.innerHTML = '';
            if (s.heading || s.text || s.link) {
                if (s.heading) {
                    var h = document.createElement('h2');
                    h.textContent = s.heading;
                    caption.appendChild(h);
                }
                if (s.text) {
                    var p = document.createElement('p');
                    p.textContent = s.text;
                    caption.appendChild(p);
                }
                if (s.link) {
                    var a = document.createElement('a');
                    a.className = 'btn';
                    a.href = s.link;
                    a.textContent = s.linkLabel || 'Read More';
                    if (/^https?:\/\//i.test(s.link)) { a.target = '_blank'; a.rel = 'noopener'; }
                    caption.appendChild(a);
                }
                caption.hidden = false;
            } else {
                caption.hidden = true;
            }
        }

        function go(n, manual) {
            idx = (n + slides.length) % slides.length;
            render();
            if (manual) restart();
        }

        function restart() {
            if (timer) clearInterval(timer);
            if (reduce || slides.length < 2) return;
            timer = setInterval(function () { go(idx + 1); }, interval);
        }

        function stop() { if (timer) { clearInterval(timer); timer = null; } }

        prev.addEventListener('click', function () { go(idx - 1, true); });
        next.addEventListener('click', function () { go(idx + 1, true); });

        // Hovering the whole hero used to pause it, which sounds considerate and
        // was in practice a bug: the hero fills the top of the page, so a pointer
        // resting there - which is where a pointer rests while you read - stopped
        // the slideshow for as long as it stayed, and it never moved at all.
        // Only the controls pause it now, where hovering means you are lining up
        // a click and would rather the target held still.
        controls.addEventListener('mouseenter', stop);
        controls.addEventListener('mouseleave', restart);

        // Keyboard users tabbing into the hero get the same courtesy, so the
        // thing they are reading or about to activate does not change underneath
        // them. Only restart once focus has actually left the hero.
        hero.addEventListener('focusin', stop);
        hero.addEventListener('focusout', function (e) {
            if (!hero.contains(e.relatedTarget)) restart();
        });

        if (slides.length < 2) controls.hidden = true;
        render();
        restart();
    }

    function mkBtn(glyph, label) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'hero-arrow';
        b.textContent = glyph;
        b.setAttribute('aria-label', label);
        return b;
    }
});
