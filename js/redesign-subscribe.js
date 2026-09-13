// Subscribe / export / print panel for the conference calendar page.
// Self-injecting: reads feeds/index.json (built by scripts/build-feeds.js) and
// adds an "Add to Calendar" button + drawer to the .njac-schedule section, plus
// a printable schedule. Does nothing if the feeds manifest is absent. Themed
// entirely through the host site's CSS variables.
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var MAN = null, GAMES = null;

  document.addEventListener('DOMContentLoaded', function () {
    var host = $('.njac-schedule') || $('.njac-today') || $('main');
    if (!host) return;
    fetch('feeds/index.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (m) { MAN = m; inject(host); })
      .catch(function () { /* no feeds, no panel */ });
  });

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function absUrl(rel) { return location.origin.replace(/\/$/, '') + '/' + String(rel).replace(/^\//, ''); }

  function inject(host) {
    // action bar at the top of the schedule section
    var bar = el('div', 'csub-bar');
    var subBtn = el('button', 'csub-btn csub-btn--primary', '<span aria-hidden="true">📅</span> Add to Calendar');
    subBtn.type = 'button';
    var printBtn = el('button', 'csub-btn', 'Print schedule');
    printBtn.type = 'button';
    bar.appendChild(subBtn); bar.appendChild(printBtn);
    var h2 = host.querySelector('h2');
    if (h2 && h2.parentNode) h2.parentNode.insertBefore(bar, h2.nextSibling); else host.insertBefore(bar, host.firstChild);

    // drawer
    var back = el('div', 'csub-back'); back.hidden = true;
    back.innerHTML =
      '<div class="csub-card" role="dialog" aria-modal="true" aria-label="Subscribe to the schedule">' +
      '<button type="button" class="csub-x" aria-label="Close">&times;</button>' +
      '<h3 class="csub-h">Add the schedule to your calendar</h3>' +
      '<p class="csub-lede">Subscribe once and it stays current — new games, time changes and cancellations flow in automatically.</p>' +
      '<div class="csub-pick"><label>Follow</label><select class="csub-scope"><option value="all">The whole conference</option>' +
      '<optgroup label="A school" data-g="schools"></optgroup><optgroup label="A sport" data-g="sports"></optgroup></select></div>' +
      '<div class="csub-pick csub-lvl" hidden><label>Level (optional)</label><select class="csub-level"><option value="">All levels</option></select></div>' +
      '<div class="csub-actions">' +
      '<a class="csub-a" data-k="google" target="_blank" rel="noopener">Google Calendar</a>' +
      '<a class="csub-a" data-k="apple">Apple Calendar</a>' +
      '<a class="csub-a" data-k="outlook" target="_blank" rel="noopener">Outlook</a>' +
      '<a class="csub-a" data-k="download" download>Download .ics</a>' +
      '</div>' +
      '<div class="csub-copy"><input type="text" class="csub-url" readonly aria-label="Feed URL"><button type="button" class="csub-copybtn">Copy</button></div>' +
      '<p class="csub-foot">Prefer a reader? <a class="csub-rss" href="feeds/rss.xml">Follow by RSS</a>. On Google Calendar use <em>Other calendars → From URL</em> and paste the link.</p>' +
      '</div>';
    document.body.appendChild(back);

    // populate scope + level
    var scope = $('.csub-scope', back), level = $('.csub-level', back);
    var sg = $('optgroup[data-g="schools"]', back), pg = $('optgroup[data-g="sports"]', back);
    var SCH = {}, SPO = {};
    (MAN.schools || []).forEach(function (s) { SCH[s.slug] = s; var o = el('option'); o.value = 'school:' + s.slug; o.textContent = s.name; sg.appendChild(o); });
    (MAN.sports || []).forEach(function (s) { SPO[s.slug] = s; var o = el('option'); o.value = 'sport:' + s.slug; o.textContent = s.name; pg.appendChild(o); });
    var order = ['Varsity', 'Junior Varsity', 'Freshman', 'Middle School'];
    var levels = (MAN.sportLevels || []).map(function (x) { return x.level; }).filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (a, b) { return (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9); });
    levels.forEach(function (v) { var o = el('option'); o.value = v; o.textContent = v; level.appendChild(o); });

    function feedPath() {
      var v = scope.value, lv = level.value;
      if (v.indexOf('school:') === 0) { var sc = SCH[v.slice(7)]; return sc ? sc.path : MAN.all; }
      if (v.indexOf('sport:') === 0) {
        var sp = SPO[v.slice(6)];
        if (sp && lv) { var m = (MAN.sportLevels || []).filter(function (x) { return x.sport === sp.name && x.level === lv; })[0]; if (m) return m.path; }
        return sp ? sp.path : MAN.all;
      }
      return MAN.all || 'feeds/all.ics';
    }
    function feedRss() {
      var v = scope.value, lv = level.value;
      if (v.indexOf('school:') === 0) { var sc = SCH[v.slice(7)]; return sc && sc.rss ? sc.rss : MAN.rss; }
      if (v.indexOf('sport:') === 0) {
        var sp = SPO[v.slice(6)];
        if (sp && lv) { var m = (MAN.sportLevels || []).filter(function (x) { return x.sport === sp.name && x.level === lv; })[0]; if (m && m.rss) return m.rss; }
        return sp && sp.rss ? sp.rss : MAN.rss;
      }
      return MAN.rss || 'feeds/rss.xml';
    }
    function refresh() {
      $('.csub-lvl', back).hidden = scope.value.indexOf('sport:') !== 0;
      var p = feedPath(), https = absUrl(p), webcal = https.replace(/^https?:/, 'webcal:');
      $('[data-k="apple"]', back).href = webcal;
      $('[data-k="outlook"]', back).href = 'https://outlook.live.com/calendar/0/addfromweb?url=' + encodeURIComponent(https);
      $('[data-k="google"]', back).href = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(webcal);
      $('[data-k="download"]', back).href = p;
      $('.csub-url', back).value = https;
      var rss = $('.csub-rss', back); if (rss) rss.href = feedRss();
    }
    scope.addEventListener('change', refresh); level.addEventListener('change', refresh); refresh();

    function open() { back.hidden = false; document.body.style.overflow = 'hidden'; }
    function close() { back.hidden = true; document.body.style.overflow = ''; }
    subBtn.addEventListener('click', open);
    $('.csub-x', back).addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    $('.csub-copybtn', back).addEventListener('click', function () {
      var u = $('.csub-url', back); u.select();
      if (navigator.clipboard) navigator.clipboard.writeText(u.value); else document.execCommand('copy');
      var t = this; t.textContent = 'Copied!'; setTimeout(function () { t.textContent = 'Copy'; }, 1500);
    });
    printBtn.addEventListener('click', function () { doPrint(scope, level, SCH, SPO); });
  }

  // ---- print ----
  function loadGames() {
    if (GAMES) return Promise.resolve(GAMES);
    return fetch('data/schedule/index.json').then(function (r) { return r.json(); }).then(function (ix) {
      return Promise.all((ix.months || []).map(function (m) {
        return fetch('data/schedule/' + m + '.json').then(function (r) { return r.json(); }).then(function (d) { return d.games || []; }).catch(function () { return []; });
      })).then(function (lists) { GAMES = []; lists.forEach(function (g) { GAMES = GAMES.concat(g); }); return GAMES; });
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\b(high school|high|school|regional|the|academy)\b/g, '').replace(/[^a-z0-9]/g, ''); }
  function baseSport(s) { return String(s || '').replace(/^(Boys|Girls|Coed)\s+/, ''); }
  function pageVal(sel) { var e = document.querySelector(sel); return e && e.value ? e.value : ''; }
  function doPrint(scope, level, SCH, SPO) {
    loadGames().then(function (all) {
      var v = scope.value, lv = level.value, lbl = [], filters = [];
      // drawer scope (subscribe selector)
      if (v.indexOf('school:') === 0) { var sc = SCH[v.slice(7)]; if (sc) { lbl.push(sc.name); var k = norm(sc.name); filters.push(function (g) { return norm(g.school) === k || norm(g.opponent) === k; }); } }
      else if (v.indexOf('sport:') === 0) { var sp = SPO[v.slice(6)]; if (sp) { lbl.push((lv ? lv + ' ' : '') + sp.name); filters.push(function (g) { return g.sport === sp.name && (!lv || g.level === lv); }); } }
      // honor the calendar page's own filters so Print matches what's on screen
      var pSport = pageVal('.cal-f-sport'), pGender = pageVal('.cal-f-gender'), pLevel = pageVal('.cal-f-level'), pKind = pageVal('.cal-f-kind'), pBrowse = pageVal('.cal-sport');
      if (pSport) filters.push(function (g) { return baseSport(g.sport) === pSport; });
      else if (pBrowse) { filters.push(function (g) { return g.sport === pBrowse; }); }
      if (pGender) filters.push(function (g) { return (g.gender || '') === pGender; });
      if (pLevel) filters.push(function (g) { return g.level === pLevel; });
      if (pKind) filters.push(function (g) { return (g.kind || 'Game') === pKind; });
      var pageLbl = [pLevel, pGender, pSport || pBrowse].filter(Boolean).join(' ');
      if (pageLbl) lbl.push(pageLbl);
      var label = lbl.join(' · ') || 'All schools · all sports';
      var filt = filters.length ? function (g) { return filters.every(function (f) { return f(g); }); } : function () { return true; };
      var today = new Date().toISOString().slice(0, 10);
      var games = all.filter(function (g) { return g.date >= today && filt(g); })
        .sort(function (a, b) { return a.date === b.date ? (a.time || '99:99').localeCompare(b.time || '99:99') : a.date.localeCompare(b.date); });
      var conf = (MAN && MAN.conference) || 'Conference';
      var DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var byDate = {}; games.forEach(function (g) { (byDate[g.date] = byDate[g.date] || []).push(g); });
      var html = '<div class="csub-print-head"><h1>' + esc(conf) + '</h1><h2>' + esc(label) + '</h2><p>' + games.length + ' upcoming game' + (games.length !== 1 ? 's' : '') + ' · as of ' + new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + '</p></div>';
      Object.keys(byDate).sort().forEach(function (d) {
        var dt = new Date(d + 'T12:00:00');
        html += '<h3 class="csub-pd">' + DOW[dt.getDay()] + ', ' + MON[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear() + '</h3><table class="csub-pt"><tbody>';
        byDate[d].forEach(function (g) {
          html += '<tr><td class="csub-pt-t">' + esc(g.timeLabel || 'TBA') + '</td><td class="csub-pt-m">' + esc(g.school) + ' <span>' + (g.home === false ? 'at' : 'vs') + '</span> ' + esc(g.opponent || 'TBD') + '</td><td class="csub-pt-x">' + esc([g.level, g.gender, g.sport].filter(Boolean).join(' ')) + (g.status ? ' — ' + esc(g.status) : '') + '</td></tr>';
        });
        html += '</tbody></table>';
      });
      if (!games.length) html += '<p>No upcoming games for this selection.</p>';
      var area = document.getElementById('csub-print-area');
      if (!area) { area = el('div'); area.id = 'csub-print-area'; document.body.appendChild(area); }
      area.innerHTML = html;
      window.print();
    });
  }
})();
