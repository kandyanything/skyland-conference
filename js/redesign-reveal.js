// Sections rise gently into place as they scroll into view.
//
// The restraint is the point: a short fade with a 22px lift, once per element,
// never repeating when you scroll back up. Anything longer or larger starts to
// feel like a slideshow rather than a page, and anything that re-runs on every
// pass reads as a gimmick.
//
// Three rules shape the implementation:
//
//   Content must never depend on this running. The hidden state is applied only
//   under .js-reveal, a class an inline snippet in <head> adds before the first
//   paint - so a visitor with a blocked or failed script sees a normal page
//   rather than a blank one, and there is no flash of content being hidden.
//
//   Nothing that contains a sticky or fixed element may be animated. A transform
//   creates a containing block, which would break .mainnav's position: sticky.
//   Targets are confined to section content, never the header or nav.
//
//   Half the page arrives after the fetches resolve - video cards, the school
//   grid, the directory. A MutationObserver picks those up as they land.
document.addEventListener('DOMContentLoaded', function () {

    // Containers whose children are the natural "blocks" of a page.
    var SECTIONS = '.band > .wrap, .hero > .wrap, .page-head > .wrap, main > .wrap > section';

    // Repeating collections, whose children stagger instead of moving as a slab.
    var GRIDS = '.vision-grid, .school-grid, .schools-grid, .link-grid,' +
                '.leadership-grid, .honors-grid, .hero-facts';

    var EXCLUDE = '.njac-directory';

    var STAGGER = 70;      // ms between neighbours in a grid
    var MAX_STEPS = 6;     // beyond this the last card would lag noticeably

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) {
        document.documentElement.classList.remove('js-reveal');
        return;
    }
    if (!('IntersectionObserver' in window)) {
        document.documentElement.classList.remove('js-reveal');
        return;
    }

    // Longest possible reveal: the capped stagger plus the transition.
    var SETTLE_MS = (MAX_STEPS * STAGGER) + 700 + 80;

    function settle(el) {
        window.setTimeout(function () {
            el.classList.remove('reveal', 'is-in');
            el.style.transitionDelay = '';
        }, SETTLE_MS);
    }

    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);          // one-shot: never replays

            // Once it has settled, take the reveal classes back off. The reveal
            // declares its own transition, and leaving it in place would override
            // the element's real one for good - a school card's 0.2s hover would
            // become a 0.7s crawl, and the properties the card animates that the
            // reveal does not would stop transitioning at all. data-reveal stays,
            // so the element is not armed a second time.
            settle(entry.target);
        });
    }, {
        threshold: 0.1,
        // Start a little before the element is fully on screen, so the movement
        // has finished by the time the eye arrives rather than beginning there.
        rootMargin: '0px 0px -10% 0px',
    });

    // An element that contains another target must not animate itself, or the
    // two opacities multiply and the inner content fades in through a fading
    // parent - which looks muddy. Keeping only the innermost candidates means a
    // grid's cards animate and the grid does not.
    function innermost(list) {
        return list.filter(function (el) {
            return !list.some(function (other) { return other !== el && el.contains(other); });
        });
    }

    function collect() {
        var out = [];
        document.querySelectorAll(SECTIONS).forEach(function (section) {
            [].forEach.call(section.children, function (child) { out.push(child); });
        });
        document.querySelectorAll(GRIDS).forEach(function (grid) {
            [].forEach.call(grid.children, function (card) { out.push(card); });
        });
        // The athletic director listing sits out. It is reference material
        // people arrive looking for, often from a direct link on a phone, and
        // it is not worth a fade to have it start life invisible.
        return innermost(out).filter(function (el) {
            return !(el.closest && el.closest(EXCLUDE));
        });
    }

    function arm() {
        collect().forEach(function (el) {
            if (el.dataset.reveal) return;                    // already handled
            if (el.hasAttribute('hidden')) return;            // not on the page yet
            el.dataset.reveal = '1';
            el.classList.add('reveal');

            // Neighbours in a collection follow one another rather than moving
            // as one slab. Capped, so a 39-card grid does not take three seconds
            // to finish.
            var siblings = el.parentNode;
            var i = [].indexOf.call(siblings.children, el);
            var step = Math.min(i, MAX_STEPS);
            if (step > 0) el.style.transitionDelay = (step * STAGGER) + 'ms';

            // Content that arrives after the reader has already scrolled past it -
            // the video rail, the directory, anything behind a fetch - would never
            // intersect again, and would sit invisible for the rest of the visit.
            // Show it at once instead: there is no reveal to watch when it is
            // already behind you.
            if (el.getBoundingClientRect().bottom < 0) {
                el.classList.add('is-in');
                settle(el);
                return;
            }

            io.observe(el);
        });
    }

    arm();

    // The video rail, school grid, directory and standings are all filled in
    // after their fetches resolve. Re-arm as nodes land, coalesced into one pass
    // per frame so a grid appending 39 cards does not trigger 39 sweeps.
    var queued = false;
    new MutationObserver(function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () { queued = false; arm(); });
    }).observe(document.body, { childList: true, subtree: true });
});
