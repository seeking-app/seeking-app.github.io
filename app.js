/* QUAERENS 尋道 — a series of bite-size theology courses. Plain JS, no build step. */
(function () {
  'use strict';

  // ---------- storage ----------
  // done[id] = {score, of, date, first}; cards[gid] = {due, ivl}; met[gid] = date; days[ymd] = 1;
  // notify[cid] or notify[cid + '/' + mid] = date followed
  var KEY = 'xundao.v1';
  var DAILY_CAP = 1; // one new lesson per course per day
  var DEFAULTS = {
    script: 'hant', fs: 17, done: {}, cards: {}, enrolled: null, notify: {},
    met: null, days: {}, revCap: 20, rev: { d: '', n: 0 },
    remind: '07:30', last: '', recapOn: '', onboarded: false
  };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      return Object.assign({}, DEFAULTS, s || {});
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: keep in memory */ } }
  // data from earlier versions
  if (!S.met) { S.met = {}; Object.keys(S.cards).forEach(function (g) { S.met[g] = S.cards[g].due || ''; }); }
  Object.keys(S.done).forEach(function (id) { if (!S.done[id].first) S.done[id].first = S.done[id].date || ''; });
  if (Object.keys(S.done).length) S.onboarded = true;
  delete S.pace; delete S.paceDefault; delete S.cap;

  // ---------- data ----------
  // D.catalogue: every course (published + planned), display order
  // D.courses[id]: {id, title, modules:[{id, num, title, desc, summary, launch, est, status, part, lessons:[...]}],
  //                 parts (long courses only): [{id, num, title, desc, summary, launch, modules:[ids]} → p.mods]}
  // D.lessonCourse[lessonId] = courseId
  var D = { ui: null, catalogue: [], courses: {}, lessonCourse: {}, glossary: null, gById: {}, lessons: {} };
  function getJSON(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }
  function loadScript(script) {
    var base = 'data/' + script + '/';
    D.lessons = {}; D.courses = {}; D.lessonCourse = {};
    return Promise.all([getJSON(base + 'ui.json'), getJSON(base + 'catalogue.json'), getJSON(base + 'glossary.json')])
      .then(function (r) {
        D.ui = r[0]; D.catalogue = r[1]; D.glossary = r[2]; D.gById = {};
        D.glossary.forEach(function (g) { D.gById[g.id] = g; });
        document.documentElement.lang = script === 'hans' ? 'zh-Hans' : 'zh-Hant';
        document.title = D.ui.appName;
        var pub = D.catalogue.filter(function (c) { return c.status === 'published'; });
        return Promise.all(pub.map(function (c) { return getJSON(base + 'courses/' + c.id + '/course.json'); }));
      })
      .then(function (list) {
        list.forEach(function (course) {
          D.courses[course.id] = course;
          course.modules.forEach(function (m) { m.lessons.forEach(function (l) { l.course = course.id; l.mod = m; D.lessonCourse[l.id] = course.id; }); });
          course.parts = course.parts || [];
          course.parts.forEach(function (p) {
            p.mods = course.modules.filter(function (m) { return p.modules.indexOf(m.id) >= 0; });
            p.mods.forEach(function (m) { m.part = p; });
          });
        });
        initEnrolled();
      });
  }
  function initEnrolled() {
    if (Array.isArray(S.enrolled)) {
      S.enrolled = S.enrolled.filter(function (id) { return D.courses[id]; });
      return;
    }
    var started = Object.keys(D.courses).filter(function (cid) {
      return Object.keys(S.done).some(function (lid) { return D.lessonCourse[lid] === cid; });
    });
    var first = D.catalogue.filter(function (c) { return c.status === 'published'; })[0];
    S.enrolled = started.length ? started : (first ? [first.id] : []);
    save();
  }
  function getLesson(id) {
    if (D.lessons[id]) return Promise.resolve(D.lessons[id]);
    var cid = D.lessonCourse[id];
    if (!cid) return Promise.reject(new Error('unknown lesson ' + id));
    return getJSON('data/' + S.script + '/courses/' + cid + '/lessons/' + id + '.json').then(function (L) { D.lessons[id] = L; return L; });
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function t(key, vars) {
    var s = D.ui[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function today() { return ymd(new Date()); }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function daysSince(s) { if (!s) return 0; var a = new Date(s + 'T00:00:00'), b = new Date(today() + 'T00:00:00'); return Math.round((b - a) / 864e5); }
  function month(s) { var m = /^(\d{4})-(\d{1,2})/.exec(s || ''); return m ? t('monthFmt', { y: m[1], m: +m[2] }) : ''; }
  function meta(cid) { return D.catalogue.filter(function (c) { return c.id === cid; })[0]; }
  function lessonById(id) { var cid = D.lessonCourse[id]; return cid ? allLessons(cid).filter(function (l) { return l.id === id; })[0] : null; }
  function allLessons(cid) {
    var out = [];
    (cid ? [cid] : Object.keys(D.courses)).forEach(function (id) {
      D.courses[id].modules.forEach(function (m) { out = out.concat(m.lessons); });
    });
    return out;
  }
  function available(cid) { return allLessons(cid).filter(function (l) { return l.available; }); }
  function doneCount(cid) { return available(cid).filter(function (l) { return S.done[l.id]; }).length; }
  function nextLesson(cid) {
    var avail = available(cid);
    for (var i = 0; i < avail.length; i++) if (!S.done[avail[i].id]) return avail[i];
    return null;
  }
  function newToday(cid) { var d = today(); return allLessons(cid).filter(function (l) { return S.done[l.id] && S.done[l.id].first === d; }).length; }
  // 'done' | 'open' | 'prev' (an earlier lesson is unfinished) | 'cap' (daily limit reached) | 'prep' (not written yet)
  function lessonState(l) {
    if (!l.available) return 'prep';
    if (S.done[l.id]) return 'done';
    var avail = available(l.course);
    for (var i = 0; i < avail.length && avail[i].id !== l.id; i++) if (!S.done[avail[i].id]) return 'prev';
    if (newToday(l.course) >= DAILY_CAP) return 'cap';
    return 'open';
  }
  function isEnrolled(cid) { return S.enrolled.indexOf(cid) >= 0; }
  function enrol(cid) { if (!isEnrolled(cid)) { S.enrolled.push(cid); save(); } }
  function allDue() { var d = today(); return Object.keys(S.cards).filter(function (id) { return D.gById[id] && S.cards[id].due <= d; }); }
  // review cap: at most S.revCap cards a day, oldest first, so a long absence is spread over several days
  function dueCards() {
    var left = Math.max(0, S.revCap - (S.rev.d === today() ? S.rev.n : 0));
    return allDue().sort(function (a, b) { return S.cards[a].due < S.cards[b].due ? -1 : 1; }).slice(0, left);
  }
  function markDay() { S.days[today()] = 1; S.last = today(); }
  function daysThisMonth() { var p = today().slice(0, 7); return Object.keys(S.days).filter(function (d) { return d.slice(0, 7) === p; }).length; }
  function modName(m) { return t('moduleN', { num: m.num }) + '　' + m.title; }
  // ---------- parts (long courses: course → part → unit → lesson) ----------
  function partLessons(p) { var a = []; p.mods.forEach(function (m) { a = a.concat(m.lessons); }); return a; }
  function partEst(p) { return p.mods.reduce(function (a, m) { return a + m.est; }, 0); }
  function partOpen(p) { return p.mods.some(function (m) { return m.status === 'open'; }); }
  function partComplete(p) { return p.mods.every(moduleComplete); }
  function partLaunch(p) { return p.launch || p.mods.map(function (m) { return m.launch; }).filter(Boolean).sort()[0] || ''; }
  function partById(cid, pid) { var c = D.courses[cid]; return c ? c.parts.filter(function (p) { return p.id === pid; })[0] : null; }
  function partTerms(p) {
    var seen = {}, out = [];
    partLessons(p).forEach(function (l) { (l.termIds || []).forEach(function (g) { if (!seen[g] && D.gById[g] && S.cards[g]) { seen[g] = 1; out.push(g); } }); });
    return out;
  }
  function partHeader(cid, p) {
    var ls = partLessons(p), doneN = ls.filter(function (l) { return S.done[l.id]; }).length, est = partEst(p);
    var open = partOpen(p), done = partComplete(p), key = cid + '/' + p.id, on = !!S.notify[key], ln = partLaunch(p);
    var status = done ? '✓ ' + t('partDoneShort') : open ? t('progressOf', { d: doneN, a: est }) : (ln ? t('launchOn', { d: month(ln) }) : t('moduleTBD'));
    return '<section class="part-head stack gap-8' + (open ? '' : ' planned') + '">' +
      '<div class="row between" style="gap:12px;align-items:flex-end"><div class="stack gap-4" style="min-width:0"><span class="eyebrow">' + esc(t('partN', { num: p.num })) + '</span>' +
      '<h2 class="serif" style="font-size:20px">' + esc(p.title) + '</h2></div><span class="small muted" style="white-space:nowrap">' + esc(status) + '</span></div>' +
      (p.desc ? '<p class="small muted" style="line-height:1.6">' + esc(p.desc) + '</p>' : '') +
      (open ? '<div class="meter" role="img" aria-label="' + doneN + ' / ' + est + '"><div style="width:' + (est ? Math.round(doneN / est * 100) : 0) + '%"></div></div>' : '') +
      (open ? '' : '<button class="notify sm' + (on ? ' on' : '') + '" data-notify="' + key + '" aria-pressed="' + on + '">' + ICON.bell + esc(on ? t('notifyOn') : t('notifyMe')) + '</button>') +
      (done && partTerms(p).length ? '<a class="linkbtn small" href="#/review/' + cid + '/' + p.id + '">' + esc(t('partReview')) + '</a>' : '') + '</section>';
  }
  // QUAERENS logo (道路與十字), generated by logo/make.py
  var LOGO_SM = '<svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g fill="currentColor"><path d="M500.00,967.00 A467.0,467.0 0 1 0 344.83,940.47 L390.80,910.73 L372.74,861.24 A383.0,383.0 0 1 1 500.00,883.00 Z"/><rect x="458.0" y="211" width="84" height="754.11"/><rect x="347" y="336.0" width="306" height="84"/></g></svg>';
  var LOGO_LG = '<svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><mask id="q-cuts-lg" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000"><rect width="1000" height="1000" fill="#fff"/><g fill="none" stroke="#000" stroke-width="19" stroke-linejoin="miter"><polyline points="966.74,515.65 923.51,464.44 882.78,512.83"/><polyline points="515.65,33.26 464.44,76.49 512.83,117.22"/><polyline points="33.26,484.35 76.49,535.56 117.22,487.17"/></g></mask></defs><g fill="currentColor" mask="url(#q-cuts-lg)"><path d="M500.00,955.00 A455.0,455.0 0 1 0 386.89,940.72 L422.00,917.78 L401.81,882.60 A395.0,395.0 0 1 1 500.00,895.00 Z"/><rect x="470.0" y="211" width="60" height="743.01"/><rect x="347" y="348.0" width="306" height="60"/></g></svg>';
  function seal(c, cls) { return '<span class="seal ' + (cls || '') + '" aria-hidden="true">' + esc(c.seal || '道') + '</span>'; }
  // the module after the last one the user can reach; used when all published lessons are read
  function upcomingModule(cid) {
    var mods = D.courses[cid].modules, last = -1;
    function incomplete(m) { return m.status === 'planned' || m.lessons.length < m.est || m.lessons.some(function (l) { return !l.available; }); }
    mods.forEach(function (m, i) { if (m.available) last = i; });
    for (var i = last; i < mods.length; i++) if (i >= 0 && incomplete(mods[i])) return mods[i];
    for (var j = 0; j < mods.length; j++) if (incomplete(mods[j])) return mods[j];
    return null;
  }
  function moduleComplete(m) { return m.lessons.length && m.lessons.length >= m.est && m.lessons.every(function (l) { return l.available && S.done[l.id]; }); }

  var ICON = {
    today: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    course: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    review: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v12"/></svg>',
    glossary: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>'
  };

  // ---------- shell ----------
  var view = document.getElementById('view');
  var tabs = document.getElementById('tabs');
  function renderTabs(active) {
    if (!active) { tabs.classList.add('hidden'); view.classList.add('no-tabs'); return; }
    tabs.classList.remove('hidden'); view.classList.remove('no-tabs');
    var due = dueCards().length;
    var items = [['today', '#/today', t('tabToday')], ['course', '#/course', t('tabCourse')], ['review', '#/review', t('tabReview')], ['glossary', '#/glossary', t('tabGlossary')]];
    tabs.innerHTML = '<div class="tabs-inner">' + items.map(function (it) {
      var cur = it[0] === active ? ' aria-current="page"' : '';
      var count = it[0] === 'review' && due ? '<span class="count">' + due + '</span>' : '';
      return '<a href="' + it[1] + '"' + cur + '>' + ICON[it[0]] + esc(it[2]) + count + '</a>';
    }).join('') + '</div>';
  }
  function setView(html, active) { view.innerHTML = html; renderTabs(active); window.scrollTo(0, 0); }
  function toast(msg) {
    var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2400);
  }
  function applyFont() { document.documentElement.style.setProperty('--fs', S.fs + 'px'); }
  function segHtml(name, opts, cur) {
    return '<div class="seg" style="grid-template-columns:repeat(' + opts.length + ',minmax(0,1fr));width:auto" role="group">' + opts.map(function (o) {
      return '<button data-' + name + '="' + o[0] + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  // ---------- calendar reminder (.ics): works offline, everywhere, no push service ----------
  function downloadICS() {
    var hm = (S.remind || '07:30').split(':'), d = new Date();
    d.setDate(d.getDate() + 1); d.setHours(+hm[0], +hm[1], 0, 0);
    function stamp(x, utc) {
      var p = function (n) { return String(n).padStart(2, '0'); };
      return utc ? x.getUTCFullYear() + p(x.getUTCMonth() + 1) + p(x.getUTCDate()) + 'T' + p(x.getUTCHours()) + p(x.getUTCMinutes()) + '00Z'
        : x.getFullYear() + p(x.getMonth() + 1) + p(x.getDate()) + 'T' + p(x.getHours()) + p(x.getMinutes()) + '00';
    }
    var rule = 'FREQ=DAILY';
    var url = location.href.split('#')[0] + '#/today';
    var ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//xundao//reminder//ZH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:xundao-daily-' + Date.now() + '@xundao', 'DTSTAMP:' + stamp(new Date(), true), 'DTSTART:' + stamp(d), 'DURATION:PT10M',
      'RRULE:' + rule, 'SUMMARY:' + t('icsTitle'), 'DESCRIPTION:' + t('icsDesc') + url, 'URL:' + url,
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + t('icsTitle'), 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'xundao-reminder.ics';
    document.body.appendChild(a); a.click(); a.remove();
    toast(t('calendarToast'));
  }

  // ---------- onboarding ----------
  function screenStart() {
    var anchors = [['07:00', t('anchorMorning')], ['12:30', t('anchorNoon')], ['21:00', t('anchorEvening')]];
    var html = '<div class="stack gap-20 onboard"><div class="brand"><div class="seal lg logo" aria-hidden="true">' + LOGO_LG + '</div><span class="brand-name"><span class="wm-lat">QUAERENS</span><span class="wm-zh">' + esc(t('appName')) + '</span></span></div>' +
      '<h1 class="serif" style="font-size:26px;font-weight:700">' + esc(t('obTitle')) + '</h1><p class="lede">' + esc(t('obText')) + '</p>' +
      '<section class="stack gap-8"><span class="label">' + esc(t('obWhen')) + '</span>' + segHtml('anchor', anchors, S.remind) +
      '<label class="setrow" style="border:0;min-height:44px"><span>' + esc(t('remindTime')) + '</span><input id="rt" type="time" value="' + esc(S.remind) + '" class="time"></label></section>' +
      '<button class="btn ghost-line" id="ics">' + ICON.cal + esc(t('obCalendar')) + '</button>' +
      '<button class="btn" id="go">' + esc(t('obStart')) + '</button></div>';
    setView(html, null);
    view.querySelectorAll('[data-anchor]').forEach(function (b) { b.onclick = function () { S.remind = b.dataset.anchor; save(); screenStart(); }; });
    document.getElementById('rt').onchange = function (e) { S.remind = e.target.value || S.remind; save(); };
    document.getElementById('ics').onclick = downloadICS;
    document.getElementById('go').onclick = function () { S.onboarded = true; S.last = today(); save(); location.hash = '#/today'; route(); };
  }

  // ---------- welcome back (7+ days away) ----------
  function screenRecap() {
    var recent = Object.keys(S.done).filter(function (id) { return D.lessonCourse[id]; })
      .sort(function (a, b) { return (S.done[b].date || '') < (S.done[a].date || '') ? -1 : 1; }).slice(0, 5);
    var html = '<div class="stack gap-20" style="padding-top:24px"><h1 class="serif" style="font-size:26px;font-weight:700">' + esc(t('welcomeBack')) + '</h1>' +
      '<p class="lede">' + esc(t('welcomeBackSub')) + '</p><div class="stack gap-12" id="recap"></div>' +
      (allDue().length ? '<p class="small muted">' + esc(t('recapNote')) + '</p>' : '') +
      '<button class="btn" id="cont">' + esc(t('continue')) + '</button></div>';
    setView(html, null);
    S.recapOn = today(); S.last = today(); save();
    var box = document.getElementById('recap');
    Promise.all(recent.map(function (id) { return getLesson(id).catch(function () { return null; }); })).then(function (ls) {
      box.innerHTML = ls.filter(Boolean).map(function (L) {
        return '<div class="keypoint stack gap-4"><span class="small muted">' + esc(meta(L.course).title) + ' · ' + esc(L.title) + '</span><p class="serif" style="font-size:16px">' + esc(L.keypoint) + '</p></div>';
      }).join('');
    });
    document.getElementById('cont').onclick = function () { location.hash = '#/today'; route(); };
  }

  // ---------- today ----------
  function newContentBanner() {
    var items = [];
    Object.keys(S.notify).forEach(function (k) {
      var p = k.split('/'), c = meta(p[0]);
      if (!c) return;
      if (p.length === 1 && c.status === 'published') { items.push('<a href="#/course/' + c.id + '">' + esc(c.title) + '</a>'); delete S.notify[k]; }
      if (p.length === 2 && D.courses[p[0]]) {
        var m = D.courses[p[0]].modules.filter(function (x) { return x.id === p[1]; })[0];
        if (m && m.status === 'open') { items.push('<a href="#/course/' + c.id + '">' + esc(c.title) + ' · ' + esc(modName(m)) + '</a>'); delete S.notify[k]; }
        var pt = partById(p[0], p[1]);
        if (pt && partOpen(pt)) { items.push('<a href="#/course/' + c.id + '">' + esc(c.title) + ' · ' + esc(t('partN', { num: pt.num }) + '　' + pt.title) + '</a>'); delete S.notify[k]; }
      }
    });
    if (items.length) save();
    return items.length ? '<section class="card banner stack gap-4"><span class="label" style="color:var(--ok)">' + esc(t('newContent')) + '</span>' + items.join('') + '</section>' : '';
  }
  function screenToday() {
    var d = new Date();
    var due = dueCards().length, dm = daysThisMonth();
    var html = '<div class="stack gap-20">' +
      '<header class="top"><div class="brand"><div class="seal logo" aria-hidden="true">' + LOGO_SM + '</div><span class="brand-name"><span class="wm-lat">QUAERENS</span><span class="wm-zh">' + esc(t('appName')) + '</span></span></div>' +
      '<a class="icon-btn" href="#/settings" aria-label="' + esc(t('settings')) + '">' + ICON.gear + '</a></header>' +
      '<div class="stack gap-4"><span class="small muted">' + esc(t('dateFmt', { m: d.getMonth() + 1, d: d.getDate(), w: D.ui.weekdays[d.getDay()] })) +
      (dm ? '　·　' + esc(t('daysThisMonth', { n: dm })) : '') + '</span></div>';
    html += newContentBanner();
    var active = D.catalogue.filter(function (c) { return D.courses[c.id] && isEnrolled(c.id); });
    if (!active.length) {
      html += '<section class="card stack gap-12"><h2 class="serif" style="font-size:20px">' + esc(t('noActive')) + '</h2><p class="lede">' + esc(t('noActiveSub')) + '</p>' +
        '<a class="btn" href="#/course">' + esc(t('browse')) + '</a></section>';
    }
    active.forEach(function (c, i) { html += todayCard(c, i === 0); });
    html += courseStrip();
    html += '<a class="card card-link" href="#/review"><div class="stack gap-4"><span style="font-size:15px;font-weight:500">' + esc(t('reviewCards')) + '</span>' +
      '<span class="small muted">' + esc(due ? t('cardsDue', { n: due }) : t('noCardsDue')) + '</span></div><span class="muted">' + ICON.chev + '</span></a></div>';
    setView(html, 'today');
    view.querySelectorAll('[data-key]').forEach(function (el) {
      getLesson(el.dataset.key).then(function (x) { el.textContent = x.keypoint; }).catch(function () {});
    });
  }
  function moduleDots(m, curId) {
    var n = m.lessons.length, doneN = m.lessons.filter(function (l) { return S.done[l.id]; }).length;
    return '<div class="stack gap-8" style="margin-top:4px"><div class="row between"><span class="small" style="font-weight:500">' + esc(modName(m)) + '</span><span class="small muted">' + doneN + ' / ' + n + '</span></div>' +
      '<div class="dots" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr))" role="img" aria-label="' + doneN + ' / ' + n + '">' +
      m.lessons.map(function (l) { return '<span class="' + (S.done[l.id] ? 'on' : (l.id === curId ? 'cur' : '')) + '"></span>'; }).join('') + '</div></div>';
  }
  function todayCard(c, hero) {
    var L = nextLesson(c.id);
    var head = '<a class="course-head" href="#/course/' + c.id + '">' + seal(c, 'sm') + '<span class="course-name">' + esc(c.title) + '</span><span class="muted">' + ICON.chev + '</span></a>';
    if (!L) {
      var up = upcomingModule(c.id), line = '';
      if (up) {
        var key = c.id + '/' + up.id;
        if (!S.notify[key]) { S.notify[key] = today(); save(); }
        line = up.launch ? t('nextModuleOn', { t: up.title, d: month(up.launch) }) : t('nextModuleTBD', { t: up.title });
      }
      return '<section class="card stack gap-8">' + head + '<h2 class="serif" style="font-size:18px">' + esc(up ? t('endPublished') : t('courseDone')) + '</h2>' +
        (up ? '<p class="small" style="color:var(--ok)">' + ICON.bell + ' ' + esc(line) + '</p><p class="lede">' + esc(t('endPublishedSub')) + '</p>' : '<p class="lede">' + esc(t('courseDoneSub')) + '</p>') + '</section>';
    }
    var st = lessonState(L), m = L.mod;
    var info = '<span class="small muted">' + esc(modName(m)) + ' · ' + esc(t('lessonN', { n: L.n })) + '</span>' +
      '<h2 class="lesson-title">' + esc(L.title) + '</h2>';
    if (st === 'cap') {
      return '<section class="card stack gap-12">' + head + '<h2 class="serif" style="font-size:18px">' + esc(t('capReached')) + '</h2>' +
        '<p class="lede">' + esc(t('capReachedSub')) + '</p><span class="small muted">' + ICON.lock + ' ' + esc(t('nextUp', { t: L.title })) + '</span>' + moduleDots(m, L.id) + '</section>';
    }
    var body = '<p class="lede" data-key="' + L.id + '"></p>' +
      '<div class="row gap-12 small muted"><span>' + esc(t('minutes', { m: L.minutes })) + '</span><span aria-hidden="true">·</span><span>' + esc(t('quizN', { n: 3 })) + '</span></div>';
    return '<section class="card today-card stack gap-12' + (hero ? ' hero' : '') + '" aria-label="' + esc(c.title) + '">' + head + info + body +
      '<a class="btn" href="#/lesson/' + L.id + '">' + esc(t('startReading')) + '</a>' + moduleDots(m, L.id) + '</section>';
  }
  function courseStrip() {
    var rows = D.catalogue.map(function (c) {
      var pub = c.status === 'published';
      var status = !pub ? (c.launch ? t('launchOn', { d: month(c.launch) }) : t('plannedCourses')) : isEnrolled(c.id) ? t('enrolled') + ' · ' + t('progressOf', { d: doneCount(c.id), a: c.available || 0 }) : t('lessonsReady', { a: c.available || 0, t: c.est });
      return '<a class="mini-course' + (pub ? '' : ' planned') + '" href="#/course' + (pub ? '/' + c.id : '') + '">' + seal(c, pub ? 'sm' : 'sm muted') +
        '<span class="stack" style="flex:1;min-width:0"><span class="mc-title">' + esc(c.title) + '</span><span class="small muted">' + esc(status) + '</span></span>' +
        '<span class="muted">' + ICON.chev + '</span></a>';
    }).join('');
    return '<section class="stack gap-8"><div class="row between"><span style="font-size:15px;font-weight:500">' + esc(t('allCourses')) + '</span>' +
      '<a class="small" href="#/course" style="text-decoration:none">' + esc(t('seeAll')) + '</a></div><div class="card mini-list">' + rows + '</div></section>';
  }

  // ---------- catalogue ----------
  function courseCard(c) {
    var body = '<div class="stack gap-4" style="flex:1;min-width:0"><span class="course-name">' + esc(c.title) + '</span>' +
      '<span class="desc">' + esc(c.desc) + '</span>';
    if (c.status === 'published') {
      var a = c.available || 0, dn = doneCount(c.id);
      body += '<span class="small muted">' + esc(isEnrolled(c.id) && dn ? t('progressOf', { d: dn, a: a }) : t('lessonsReady', { a: a, t: c.est })) + '</span>';
      if (isEnrolled(c.id) && a) body += '<div class="meter" role="img" aria-label="' + dn + ' / ' + a + '"><div style="width:' + Math.round(dn / a * 100) + '%"></div></div>';
      body += '</div>';
      return '<a class="card course-card" href="#/course/' + c.id + '">' + seal(c) + body + '<span class="muted">' + ICON.chev + '</span></a>';
    }
    var on = !!S.notify[c.id];
    body += '<span class="small muted">' + esc(c.launch ? t('launchOn', { d: month(c.launch) }) : t('launchTBD')) + '</span>' +
      '<button class="notify' + (on ? ' on' : '') + '" data-notify="' + c.id + '" aria-pressed="' + on + '">' + ICON.bell + esc(on ? t('notifyOn') : t('notifyMe')) + '</button></div>';
    return '<div class="card course-card planned">' + seal(c, 'muted') + body + '</div>';
  }
  function bindNotify(redraw) {
    view.querySelectorAll('[data-notify]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        var id = b.dataset.notify;
        if (S.notify[id]) delete S.notify[id]; else { S.notify[id] = today(); toast(t('notifyToast')); }
        save(); redraw();
      };
    });
  }
  function screenCatalogue() {
    var mine = D.catalogue.filter(function (c) { return c.status === 'published' && isEnrolled(c.id); });
    var other = D.catalogue.filter(function (c) { return c.status === 'published' && !isEnrolled(c.id); });
    var planned = D.catalogue.filter(function (c) { return c.status !== 'published'; });
    var html = '<div class="stack gap-16"><div class="stack gap-4"><h1 class="page-title">' + esc(t('tabCourse')) + '</h1>' +
      '<span class="small muted" style="font-size:14px">' + esc(t('catalogueSub')) + '</span></div>';
    [[mine, 'myCourses'], [other, 'otherCourses'], [planned, 'plannedCourses']].forEach(function (g) {
      if (!g[0].length) return;
      html += '<section class="stack gap-8"><span class="label">' + esc(t(g[1])) + '</span>' + g[0].map(courseCard).join('') + '</section>';
    });
    html += '</div>';
    setView(html, 'course');
    bindNotify(screenCatalogue);
  }

  // ---------- course map: every module, published or planned ----------
  var openMod = {};
  function screenCourse(cid) {
    var course = D.courses[cid], c = meta(cid);
    if (!course) return screenCatalogue();
    var L = nextLesson(cid), mods = course.modules, parts = course.parts;
    if (!openMod[cid]) {
      var first = mods.filter(function (m) { return m.status === 'open'; })[0];
      openMod[cid] = (L ? L.mod : (first || mods[0])).id;
    }
    var total = mods.reduce(function (a, m) { return a + m.est; }, 0);
    var html = '<div class="bar"><div class="bar-inner" style="justify-content:flex-start"><a class="icon-btn" style="color:var(--ink)" href="#/course" aria-label="' + esc(t('back')) + '">' + ICON.back + '</a>' +
      '<span class="bar-title">' + esc(t('tabCourse')) + '</span></div></div>' +
      '<div class="stack gap-16" style="padding-top:20px"><div class="row" style="gap:14px;align-items:flex-start">' + seal(c, 'lg') +
      '<div class="stack gap-4"><h1 class="page-title">' + esc(course.title) + '</h1>' +
      '<span class="small muted" style="font-size:14px">' + esc(parts.length ? t('courseSubParts', { parts: parts.length, modules: mods.length, lessons: total }) : t('courseSub', { modules: mods.length, lessons: total })) + '</span></div></div>' +
      '<p class="lede">' + esc(c.desc) + '</p>';
    if (isEnrolled(cid)) {
      html += '<div class="row between"><span class="small" style="color:var(--ok);font-weight:500">✓ ' + esc(t('enrolled')) + '</span><button class="linkbtn small" id="pause" style="font-size:13px">' + esc(t('pause')) + '</button></div>';
    } else {
      html += '<button class="btn" id="enrol">' + esc(t('enrol')) + '</button>';
    }
    function renderMod(m) {
      var doneN = m.lessons.filter(function (l) { return S.done[l.id]; }).length;
      if (m.id === openMod[cid] && m.lessons.length) {
        html += '<section class="card unit-open stack gap-4"><div class="stack gap-4" style="padding:0 8px 8px"><div class="row between"><h2 class="serif" style="font-size:18px">' + esc(modName(m)) + '</h2>' +
          '<span class="small muted">' + doneN + ' / ' + m.lessons.length + '</span></div>' + (m.desc ? '<span class="small muted">' + esc(m.desc) + '</span>' : '') + '</div>';
        m.lessons.forEach(function (l) {
          var st = lessonState(l), cur = L && L.id === l.id;
          var badge = '<span class="badge' + (st === 'done' ? ' done' : cur ? ' cur' : '') + '" aria-hidden="true">' + (st === 'done' ? '✓' : l.n) + '</span>';
          if (st === 'done' || st === 'open') {
            html += '<a class="lesson-row' + (cur ? ' cur' : '') + '" href="#/lesson/' + l.id + '">' + badge + '<span class="t">' + esc(l.title) + '</span></a>';
          } else {
            var tag = st === 'prep' ? t('inPreparation') : st === 'cap' ? t('lockedCap') : t('lockedPrev');
            html += '<div class="lesson-row off" aria-disabled="true" data-locked="' + st + '">' + badge + '<span class="t">' + esc(l.title) + '</span><span class="tag">' + (st === 'prep' ? '' : ICON.lock + ' ') + esc(tag) + '</span></div>';
          }
        });
        html += '</section>';
      } else {
        var status = m.status === 'open' ? t('lessonsCount', { n: m.lessons.length }) + (doneN ? ' · ✓ ' + doneN : '') :
          (m.launch ? t('launchOn', { d: month(m.launch) }) : t('moduleTBD'));
        var key = cid + '/' + m.id, on = !!S.notify[key];
        html += '<div class="mod-row' + (m.status === 'open' ? '' : ' planned') + '"><button class="unit-row" data-mod="' + m.id + '" aria-expanded="false"><span class="stack" style="flex:1;min-width:0;text-align:left"><span class="n">' + esc(modName(m)) + '</span>' +
          (m.desc ? '<span class="small muted mdesc">' + esc(m.desc) + '</span>' : '') + '</span><span class="small muted">' + esc(status) + '</span></button>' +
          (m.status === 'planned' && !m.part ? '<button class="notify sm' + (on ? ' on' : '') + '" data-notify="' + key + '" aria-pressed="' + on + '">' + ICON.bell + esc(on ? t('notifyOn') : t('notifyMe')) + '</button>' : '') + '</div>';
      }
    }
    if (parts.length) parts.forEach(function (p) { html += partHeader(cid, p); p.mods.forEach(renderMod); });
    else mods.forEach(renderMod);
    html += '</div>';
    setView(html, 'course');
    var en = document.getElementById('enrol');
    if (en) en.onclick = function () { enrol(cid); screenCourse(cid); };
    var pa = document.getElementById('pause');
    if (pa) pa.onclick = function () { S.enrolled = S.enrolled.filter(function (x) { return x !== cid; }); save(); toast(t('paused')); screenCourse(cid); };
    view.querySelectorAll('[data-mod]').forEach(function (b) {
      b.addEventListener('click', function () {
        var m = mods.filter(function (x) { return x.id === b.dataset.mod; })[0];
        if (m && m.lessons.length) { openMod[cid] = m.id; screenCourse(cid); }
        else toast(m && m.launch ? t('launchOn', { d: month(m.launch) }) : t('moduleTBD'));
      });
    });
    view.querySelectorAll('[data-locked]').forEach(function (r) {
      r.onclick = function () { var s = r.dataset.locked; toast(s === 'prev' ? t('lockedToast') : s === 'cap' ? t('capToast') : t('inPreparation')); };
    });
    bindNotify(function () { screenCourse(cid); });
  }

  // ---------- lesson ----------
  function lessonBar(L, extra) {
    var c = meta(L.course), m = lessonById(L.id).mod;
    return '<div class="bar"><div class="bar-inner"><a class="icon-btn" style="color:var(--ink)" href="#/course/' + L.course + '" aria-label="' + esc(t('back')) + '">' + ICON.back + '</a>' +
      '<span class="bar-title">' + esc(c.title) + ' · ' + esc(t('moduleN', { num: m.num })) + ' · ' + L.n + ' / ' + m.lessons.length + '</span>' + (extra || '<span style="width:44px"></span>') + '</div>' +
      '<div class="progress"><div id="readProg" style="width:0%"></div></div></div>';
  }
  // a locked lesson cannot be opened, even from a saved link
  function guard(id) {
    var l = lessonById(id);
    if (!l) { notFound(); return false; }
    var st = lessonState(l);
    if (st === 'done' || st === 'open') return true;
    toast(st === 'prev' ? t('lockedToast') : st === 'cap' ? t('capToast') : t('inPreparation'));
    location.hash = '#/course/' + l.course;
    return false;
  }
  function screenLesson(id) {
    if (!guard(id)) return;
    getLesson(id).then(function (L) {
      L.termIds.forEach(function (g) { if (!S.met[g]) S.met[g] = today(); });
      S.last = today(); save();
      var tools = '<div class="row" style="gap:2px"><button class="a-btn" id="smaller" aria-label="' + esc(t('smaller')) + '" style="font-size:14px">A−</button>' +
        '<button class="a-btn" id="larger" aria-label="' + esc(t('larger')) + '" style="font-size:18px">A+</button>' +
        '<button class="pill" id="script" aria-label="' + esc(t('switchScript')) + '">' + (S.script === 'hans' ? '简｜繁' : '繁｜简') + '</button></div>';
      var body = L.body.map(function (b) {
        if (b.t === 'h') return '<h2 class="h">' + esc(b.text) + '</h2>';
        if (b.t === 'p') return '<p>' + b.html + '</p>';
        var tag = b.t === 'ol' ? 'ol' : 'ul';
        return '<' + tag + '>' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + tag + '>';
      }).join('');
      var teach = L.teaching.map(function (x) {
        return '<div class="stack gap-4">' + (x.src ? '<span class="src">' + esc(x.src) + '</span>' : '') + '<p>' + esc(x.text) + '</p></div>';
      }).join('');
      var chips = L.terms.map(function (name, i) { return '<a class="chip" href="#/glossary/' + L.termIds[i] + '">' + esc(name) + '</a>'; }).join('');
      var html = lessonBar(L, tools) +
        '<article class="article stack gap-20">' +
        '<div class="stack gap-8"><span class="eyebrow" style="font-family:var(--sans)">' + esc(t('lessonN', { n: L.n })) + ' · ' + esc(t('minutes', { m: L.minutes })) + '</span>' +
        '<h1 style="font-weight:700;font-size:28px;line-height:1.35">' + esc(L.title) + '</h1>' +
        (L.scripture ? '<span class="small muted" style="font-family:var(--sans)">' + esc(L.scripture) + '</span>' : '') + '</div>' +
        '<aside class="keypoint stack gap-4"><span class="label" style="font-family:var(--sans)">' + esc(t('keyPoint')) + '</span><p style="font-size:var(--fs)">' + esc(L.keypoint) + '</p></aside>' +
        body +
        '<section class="teaching stack gap-12"><span class="eyebrow" style="font-family:var(--sans)">' + esc(t('teaching')) + '</span>' + teach + '</section>' +
        '<section class="stack gap-8"><span class="label" style="font-family:var(--sans)">' + esc(t('keyTerms')) + '</span><div class="chips">' + chips + '</div></section>' +
        '<section class="meditate stack gap-4"><span class="label" style="font-family:var(--sans)">' + esc(t('meditation')) + '</span><p style="font-size:var(--fs)">' + esc(L.meditation) + '</p></section>' +
        '<a class="btn" href="#/quiz/' + L.id + '" style="font-family:var(--sans)">' + esc(t('toQuiz')) + '</a></article>';
      setView(html, null);
      document.getElementById('smaller').onclick = function () { S.fs = Math.max(15, S.fs - 2); save(); applyFont(); };
      document.getElementById('larger').onclick = function () { S.fs = Math.min(25, S.fs + 2); save(); applyFont(); };
      document.getElementById('script').onclick = function () { switchScript(S.script === 'hans' ? 'hant' : 'hans'); };
      trackReading();
    }).catch(notFound);
  }
  function trackReading() {
    var bar = document.getElementById('readProg');
    function upd() {
      if (!document.body.contains(bar)) { window.removeEventListener('scroll', upd); return; }
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, Math.round(window.scrollY / h * 100)) : 100) + '%';
    }
    window.addEventListener('scroll', upd, { passive: true }); upd();
  }

  // ---------- quiz ----------
  function shuffle(n, seed) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { seed = (seed * 9301 + 49297) % 233280; var k = Math.floor(seed / 233280 * (j + 1)); var tmp = a[j]; a[j] = a[k]; a[k] = tmp; }
    return a;
  }
  function doneScreen(L, score, n) {
    var c = meta(L.course), m = lessonById(L.id).mod, html = '';
    var next = nextLesson(L.course), nst = next ? lessonState(next) : null;
    var P = m.part;
    if (P && moduleComplete(m) && partComplete(P)) {
      var ps = D.courses[L.course].parts, np = ps[ps.indexOf(P) + 1], pl = np ? partLaunch(np) : '';
      var pline = !np ? '' : partOpen(np) ? t('nextPartOpen', { t: np.title }) : pl ? t('nextPartOn', { t: np.title, d: month(pl) }) : t('nextPartTBD', { t: np.title });
      html += '<div class="stamp part" aria-hidden="true">' + esc(c.seal || '道') + '</div><h1 class="serif" style="font-size:24px">' + esc(t('partDone', { num: P.num })) + '</h1>' +
        '<p class="serif" style="font-size:17px;font-weight:600">' + esc(P.title) + '</p>' +
        '<p class="lede">' + esc(P.summary || P.desc) + '</p>' + (pline ? '<p class="small muted">' + esc(pline) + '</p>' : '') +
        (partTerms(P).length ? '<a class="btn ghost-line" href="#/review/' + L.course + '/' + P.id + '" style="margin-top:8px">' + esc(t('partReview')) + '</a>' : '');
    } else if (moduleComplete(m)) {
      var mods = D.courses[L.course].modules, i = mods.indexOf(m), nm = mods[i + 1];
      var nline = !nm ? '' : nm.status === 'open' ? t('nextModuleOpen', { t: nm.title }) : nm.launch ? t('nextModuleOn', { t: nm.title, d: month(nm.launch) }) : t('nextModuleTBD', { t: nm.title });
      html += '<div class="stamp" aria-hidden="true">' + esc(c.seal || '道') + '</div><h1 class="serif" style="font-size:24px">' + esc(t('moduleDone', { num: m.num })) + '</h1>' +
        '<p class="serif" style="font-size:17px;font-weight:600">' + esc(m.title) + '</p>' +
        '<p class="lede">' + esc(m.summary || m.desc) + '</p>' + (nline ? '<p class="small muted">' + esc(nline) + '</p>' : '');
    } else {
      html += '<div class="done-seal" aria-hidden="true">' + esc(c.seal || '道') + '</div><h1 class="serif" style="font-size:24px">' + esc(t('lessonDone', { n: L.n })) + '</h1>';
    }
    html += '<p style="font-size:16px;color:var(--ink-2)">' + esc(t('score', { s: score, t: n })) + '</p>' +
      '<p class="quote" style="margin-top:8px">' + esc(t('closingQuote')) + '<br><span class="small muted" style="font-family:var(--sans)">' + esc(t('closingSrc')) + '</span></p>';
    if (next && nst === 'open') html += '<a class="btn" href="#/lesson/' + next.id + '" style="margin-top:24px">' + esc(t('oneMore')) + '</a><a class="btn ghost" href="#/today">' + esc(t('backToday')) + '</a>';
    else html += (next && nst === 'cap' ? '<p class="small muted" style="margin-top:16px">' + ICON.lock + ' ' + esc(t('capReachedSub')) + '</p>' : '') + '<a class="btn" href="#/today" style="margin-top:24px">' + esc(t('backToday')) + '</a>';
    html += '<button class="btn ghost" id="retry">' + esc(t('retry')) + '</button>';
    return html;
  }
  function screenQuiz(id) {
    if (!guard(id)) return;
    getLesson(id).then(function (L) {
      var st = { qi: 0, picked: null, score: 0, done: false, seed: Date.now() % 233280 };
      function draw() {
        var Q = L.quiz, n = Q.length;
        var head = '<div class="bar"><div class="bar-inner"><a class="icon-btn" style="color:var(--ink)" href="#/lesson/' + L.id + '" aria-label="' + esc(t('close')) + '">' + ICON.x + '</a>' +
          '<span class="bar-title" style="font-size:14px">' + esc(t('quiz')) + (st.done ? '' : ' · ' + (st.qi + 1) + ' / ' + n) + '</span><span style="width:44px"></span></div>' +
          '<div class="qbars" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr));padding:0 12px 10px">' +
          Q.map(function (_, i) { return '<span class="' + (st.done || i < st.qi || (i === st.qi && st.picked !== null) ? 'on' : '') + '"></span>'; }).join('') + '</div></div>';
        if (st.done) {
          setView(head + '<div class="stack gap-16" style="align-items:center;text-align:center;padding:40px 8px 0">' + doneScreen(L, st.score, n) + '</div>', null);
          document.getElementById('retry').onclick = function () { st = { qi: 0, picked: null, score: 0, done: false, seed: (st.seed + 7) % 233280 }; draw(); };
          return;
        }
        var q = Q[st.qi], order = shuffle(q.options.length, st.seed + st.qi), answered = st.picked !== null;
        var opts = order.map(function (oi, pos) {
          var cls = answered && oi === q.answer ? ' right' : (answered && oi === st.picked ? ' wrong' : '');
          return '<button class="opt' + cls + '" data-oi="' + oi + '"' + (answered ? ' disabled' : '') + '><span class="letter" aria-hidden="true">' + 'ABCD'[pos] + '</span><span>' + esc(q.options[oi]) + '</span></button>';
        }).join('');
        var fb = '';
        if (answered) {
          var ok = st.picked === q.answer;
          fb = '<div class="feedback ' + (ok ? 'right' : 'wrong') + '" role="status"><strong>' + esc(ok ? t('correct') : t('incorrect')) + '</strong><p>' + esc(q.explain) + '</p></div>' +
            '<button class="btn" id="next" style="margin-top:8px">' + esc(st.qi < n - 1 ? t('next') : t('finish')) + '</button>';
        }
        setView(head + '<div class="stack gap-12" style="padding-top:24px"><h1 class="prompt" style="margin-bottom:8px">' + esc(q.prompt) + '</h1>' + opts + fb + '</div>', null);
        view.querySelectorAll('.opt').forEach(function (b) {
          b.onclick = function () { var oi = +b.dataset.oi; st.picked = oi; if (oi === q.answer) st.score++; draw(); };
        });
        var nx = document.getElementById('next');
        if (nx) { nx.focus(); nx.onclick = function () { if (st.qi < n - 1) { st.qi++; st.picked = null; } else { finishLesson(L, st.score); st.done = true; } draw(); }; }
      }
      draw();
    }).catch(notFound);
  }
  function finishLesson(L, score) {
    var prev = S.done[L.id];
    S.done[L.id] = { score: score, of: L.quiz.length, date: today(), first: prev ? prev.first : today() };
    enrol(L.course);
    if (!prev) L.termIds.forEach(function (gid) { if (!S.cards[gid]) S.cards[gid] = { due: today(), ivl: 0 }; S.met[gid] = S.met[gid] || today(); });
    markDay(); save();
  }

  // ---------- review ----------
  function screenReview(cid, pid) {
    var P = pid ? partById(cid, pid) : null;
    var queue = P ? partTerms(P) : dueCards();
    var st = { i: 0, back: false, total: queue.length };
    function draw() {
      if (st.i >= queue.length) {
        if (P) {
          setView('<div class="stack gap-16"><h1 class="page-title">' + esc(t('review')) + '</h1><div class="empty stack gap-8"><h2 class="serif" style="font-size:20px">' + esc(t('partReviewDone')) + '</h2><p class="lede">' + esc(t('partN', { num: P.num }) + '　' + P.title) + '</p>' +
            '<a class="btn" href="#/course/' + cid + '" style="margin-top:12px">' + esc(t('backToCourse')) + '</a></div></div>', 'review');
          return;
        }
        setView('<div class="stack gap-16"><h1 class="page-title">' + esc(t('review')) + '</h1><div class="empty stack gap-8"><h2 class="serif" style="font-size:20px">' + esc(t('reviewEmpty')) + '</h2><p class="lede">' + esc(t('reviewEmptySub')) + '</p></div></div>', 'review');
        return;
      }
      var g = D.gById[queue[st.i]], c = S.cards[g.id];
      var ivAgain = 1, ivHard = Math.max(3, Math.round((c.ivl || 1) * 1.2)), ivGood = Math.max(7, Math.round((c.ivl || 2) * 2.5));
      function lab(n) { return n === 1 ? t('tomorrow') : t('inDays', { n: n }); }
      var html = '<div class="stack gap-16"><div class="row between"><h1 class="page-title">' + esc(P ? t('partN', { num: P.num }) + '　' + P.title : t('review')) + '</h1><span class="muted" style="font-size:14px">' + (st.i + 1) + ' / ' + st.total + '</span></div>' +
        '<button class="flash" id="flip" aria-label="' + esc(t('tapToFlip')) + '"><span class="label">' + esc(st.back ? t('explanation') : t('term')) + '</span>' +
        '<span class="term">' + esc(g.term) + '</span><span class="latin">' + esc(g.latin) + '</span>' +
        (st.back ? '<span class="rule" aria-hidden="true"></span><span class="def">' + esc(g.def) + '</span><span class="small muted">' + esc(g.ref) + '</span>' :
          '<span style="margin-top:20px;font-size:14px;color:var(--accent)">' + esc(t('tapToFlip')) + '</span>') + '</button>';
      if (st.back) {
        html += '<div class="rates"><button class="rate" data-iv="' + ivAgain + '">' + esc(t('again')) + '<small>' + esc(lab(ivAgain)) + '</small></button>' +
          '<button class="rate" data-iv="' + ivHard + '">' + esc(t('hard')) + '<small>' + esc(lab(ivHard)) + '</small></button>' +
          '<button class="rate good" data-iv="' + ivGood + '">' + esc(t('good')) + '<small>' + esc(lab(ivGood)) + '</small></button></div>';
      }
      html += '</div>';
      setView(html, 'review');
      document.getElementById('flip').onclick = function () { st.back = !st.back; draw(); };
      view.querySelectorAll('.rate').forEach(function (b) {
        b.onclick = function () {
          var iv = +b.dataset.iv; S.cards[g.id] = { due: addDays(iv), ivl: iv };
          if (S.rev.d !== today()) S.rev = { d: today(), n: 0 };
          if (!P) S.rev.n++;
          markDay(); save(); st.i++; st.back = false; draw();
        };
      });
    }
    draw();
  }

  // ---------- glossary: only terms the user has met in a lesson ----------
  function screenGlossary(focusId) {
    var known = D.glossary.filter(function (g) { return S.met[g.id] || g.id === focusId; });
    var html = '<div class="stack gap-12"><h1 class="page-title">' + esc(t('glossary')) + '</h1>';
    if (!known.length) {
      setView(html + '<div class="empty stack gap-8"><h2 class="serif" style="font-size:20px">' + esc(t('glossaryEmpty')) + '</h2><p class="lede">' + esc(t('glossaryEmptySub')) + '</p></div></div>', 'glossary');
      return;
    }
    html += '<label class="search"><span class="muted" aria-hidden="true">' + ICON.glossary + '</span><input id="q" type="search" placeholder="' + esc(t('searchPlaceholder')) + '" aria-label="' + esc(t('searchPlaceholder')) + '" autocomplete="off"></label>' +
      '<span class="small muted" id="gcount"></span><div id="glist"></div></div>';
    setView(html, 'glossary');
    var lessonTitle = {}; allLessons().forEach(function (l) { lessonTitle[l.id] = l; });
    function list(q) {
      q = (q || '').trim().toLowerCase();
      var items = known.filter(function (g) {
        return !q || g.term.indexOf(q) >= 0 || g.latin.toLowerCase().indexOf(q) >= 0 || (g.aliases || []).some(function (a) { return a.indexOf(q) >= 0; });
      });
      document.getElementById('gcount').textContent = t('termsCount', { n: items.length });
      document.getElementById('glist').innerHTML = items.length ? items.map(function (g) {
        var l = lessonTitle[g.lesson], from = '';
        if (l) {
          var label = meta(l.course).title + '　' + t('lessonN', { n: l.n }) + '　' + l.title;
          var st = lessonState(l);
          from = (st === 'done' || st === 'open') ? '<a class="ref" href="#/lesson/' + l.id + '">' + esc(t('fromLesson', { t: label })) + '</a>' : '<span class="ref">' + esc(t('fromLesson', { t: label })) + '</span>';
        }
        return '<div class="gitem stack gap-4' + (g.id === focusId ? ' hl' : '') + '" id="g-' + g.id + '"><div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap"><span class="term">' + esc(g.term) + '</span><span class="latin">' + esc(g.latin) + '</span></div>' +
          '<p class="def">' + esc(g.def) + '</p><div class="row" style="gap:12px;flex-wrap:wrap"><span class="small muted">' + esc(g.ref) + '</span>' + from + '</div></div>';
      }).join('') : '<p class="muted" style="padding:24px 0">' + esc(t('noResults')) + '</p>';
    }
    list('');
    document.getElementById('q').addEventListener('input', function (e) { list(e.target.value); });
    if (focusId) { var el = document.getElementById('g-' + focusId); if (el) el.scrollIntoView({ block: 'center' }); }
  }

  // ---------- settings ----------
  function screenSettings() {
    var html = '<div class="bar"><div class="bar-inner" style="justify-content:flex-start"><a class="icon-btn" style="color:var(--ink)" href="#/today" aria-label="' + esc(t('back')) + '">' + ICON.back + '</a>' +
      '<h1 class="serif" style="font-size:20px;font-weight:700">' + esc(t('settings')) + '</h1></div></div>' +
      '<div class="stack gap-20" style="padding-top:20px">' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('text')) + '</span><div class="group">' +
      '<div class="setrow"><span style="font-size:16px">' + esc(t('script')) + '</span><div class="seg" role="group" aria-label="' + esc(t('script')) + '">' +
      '<button data-script="hant" aria-pressed="' + (S.script === 'hant') + '">繁體</button><button data-script="hans" aria-pressed="' + (S.script === 'hans') + '">简体</button></div></div>' +
      '<div class="setrow"><span style="font-size:16px">' + esc(t('fontSize')) + '</span><div class="row" style="gap:4px"><button class="a-btn" id="smaller" aria-label="' + esc(t('smaller')) + '" style="font-size:14px">A</button>' +
      '<span id="fsv" class="muted" style="min-width:36px;text-align:center">' + S.fs + '</span><button class="a-btn" id="larger" aria-label="' + esc(t('larger')) + '" style="font-size:22px">A</button></div></div>' +
      '<div class="setrow" style="padding:12px 0"><p class="serif" style="font-size:var(--fs);line-height:1.8">' + esc(t('closingQuote')) + '</p></div></div></section>' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('study')) + '</span><div class="group">' +
      '<div class="setrow"><span style="font-size:16px">' + esc(t('reviewCap')) + '</span>' + segHtml('rcap', [[10, '10'], [20, '20'], [30, '30']], S.revCap) + '</div></div></section>' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('remind')) + '</span><div class="group">' +
      '<label class="setrow"><span style="font-size:16px">' + esc(t('remindTime')) + '</span><input id="rt" type="time" value="' + esc(S.remind) + '" class="time"></label>' +
      '<div class="setrow stack gap-4" style="align-items:flex-start;padding:12px 0"><button class="linkbtn row" id="ics" style="gap:6px">' + ICON.cal + esc(t('addCalendar')) + '</button>' +
      '<span class="small muted">' + esc(t('addCalendarSub')) + '</span></div></div></section>' +
      '<section class="stack gap-8"><div class="group"><div class="setrow"><button class="linkbtn" id="reset">' + esc(t('resetProgress')) + '</button></div></div></section>' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('about')) + '</span><div class="card stack gap-8" style="padding:16px">' +
      '<span class="serif" style="font-weight:700;font-size:17px">' + esc(t('aboutTitle')) + '</span><p class="serif" style="font-size:15px;line-height:1.75;color:var(--ink-2)">' + esc(t('aboutText')) + '</p>' +
      '<span class="small muted">' + esc(t('aboutNote')) + '</span></div></section></div>';
    setView(html, null);
    view.querySelectorAll('[data-script]').forEach(function (b) { b.onclick = function () { switchScript(b.dataset.script); }; });
    view.querySelectorAll('[data-rcap]').forEach(function (b) { b.onclick = function () { S.revCap = +b.dataset.rcap; save(); screenSettings(); }; });
    document.getElementById('rt').onchange = function (e) { S.remind = e.target.value || S.remind; save(); };
    document.getElementById('ics').onclick = downloadICS;
    document.getElementById('smaller').onclick = function () { S.fs = Math.max(15, S.fs - 2); save(); applyFont(); document.getElementById('fsv').textContent = S.fs; };
    document.getElementById('larger').onclick = function () { S.fs = Math.min(25, S.fs + 2); save(); applyFont(); document.getElementById('fsv').textContent = S.fs; };
    document.getElementById('reset').onclick = function () {
      if (window.confirm(t('resetConfirm'))) {
        S.done = {}; S.cards = {}; S.met = {}; S.days = {}; S.rev = { d: '', n: 0 }; S.enrolled = null; save(); initEnrolled(); location.hash = '#/today';
      }
    };
  }

  function notFound() { location.hash = '#/today'; }

  function switchScript(sc) {
    if (sc === S.script) return;
    S.script = sc; save();
    loadScript(sc).then(route);
  }

  // ---------- router ----------
  function route() {
    var h = (location.hash || '#/today').slice(2).split('/');
    if (!S.onboarded) return screenStart();
    // welcome back after 7+ days away (once a day), only for someone who has started
    if ((h[0] === 'today' || h[0] === '') && S.last && daysSince(S.last) >= 7 && S.recapOn !== today() && Object.keys(S.done).length) return screenRecap();
    switch (h[0]) {
      case 'course': return h[1] ? screenCourse(h[1]) : screenCatalogue();
      case 'lesson': return screenLesson(h[1]);
      case 'quiz': return screenQuiz(h[1]);
      case 'review': return screenReview(h[1], h[2]);
      case 'glossary': return screenGlossary(h[1]);
      case 'settings': return screenSettings();
      default: return screenToday();
    }
  }
  window.addEventListener('hashchange', route);

  applyFont();
  loadScript(S.script).then(route).catch(function (e) {
    view.innerHTML = '<p style="padding:40px 0">無法載入內容 / 无法载入内容。<br><small>' + esc(e.message) + '</small></p>';
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      try {
        var hadController = !!navigator.serviceWorker.controller, reloaded = false;
        // when a new build's worker takes over, reload once so the new files are used
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (hadController && !reloaded) { reloaded = true; location.reload(); }
        });
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
          reg.update().catch(function () {});
          document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') reg.update().catch(function () {}); });
        }).catch(function () {});
      } catch (e) { /* unsupported context */ }
    });
  }
})();
