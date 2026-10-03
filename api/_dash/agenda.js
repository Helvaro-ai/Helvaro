'use strict';
/*
 * De agenda van het dashboard (client-side): dag, week, maand en lijst, met
 * zoom en sneltoetsen. Eigen bestand sinds 2026-10-03: api/dashboard.js is één
 * grote template literal en zat aan zijn grens (tests/dashboard-splitsing).
 *
 * Hoe het erin komt: de functie hieronder wordt NOOIT op de server uitgevoerd.
 * js() geeft de broncode van haar romp terug, en api/dashboard.js plakt die in
 * het clientscript. Zo is dit gewone JavaScript: geen dubbele escapes, geen
 * backticks die de template breken. De romp gebruikt de globale namen van het
 * dashboard (tr, escHtml, LOCALE, lokaleDatum, state, API_BASE, ...).
 */
/* eslint-disable no-undef, no-unused-vars */
function client() {
/* ── Agenda: dag, week, maand en lijst (2026-10-03) ──────────────────────────
   Tot vandaag kende de agenda alleen een week van 08:00 tot 21:00, met vaste
   rijhoogte. Een afspraak om 07:30 of 21:30 viel er onzichtbaar buiten, en
   twee afspraken op hetzelfde uur werden zo smal dat er "12:30. 13:0 k"
   overbleef. Nu: vier weergaven, zoomen (knoppen, Ctrl/Cmd + scrollen,
   + en -), een urenas die meegroeit met de vroegste en laatste afspraak, en
   sneltoetsen (T, pijltjes, D/W/M/L). Weergave en zoom blijven bewaard. */
const CAL_ZOOM = [32, 48, 64, 80, 112, 144];   // pixels per uur
const CAL_VIEWS = ['day', 'week', 'month', 'list'];
const CAL_LIST_DAGEN = 30;
const CAL_KLEUREN = ['#E8D7B1', '#D9C49A', '#C9AE7C'];

const calState = { weekStart: null, anchor: null, view: 'week', zoom: 3, cache: {}, lastEvents: [], teken: 0 };
(function () {
  try {
    var v = localStorage.getItem('hv-cal-view');
    if (CAL_VIEWS.indexOf(v) !== -1) calState.view = v;
    var z = parseInt(localStorage.getItem('hv-cal-zoom'), 10);
    if (z >= 0 && z < CAL_ZOOM.length) calState.zoom = z;
  } catch (e) { /* bijzaak */ }
})();

function calRowH() { return CAL_ZOOM[calState.zoom] || 80; }

function calGetMonday(d) {
  const dt = new Date(d);
  const diff = dt.getDay() === 0 ? -6 : 1 - dt.getDay();
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function calAnchor() {
  if (!calState.anchor) {
    /* Wie de agenda via de oude weg opende (calState.weekStart gezet) houdt die week. */
    calState.anchor = calState.weekStart ? new Date(calState.weekStart) : new Date();
    calState.anchor.setHours(0, 0, 0, 0);
  }
  return calState.anchor;
}

function calZet(d) {
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  calState.anchor = a;
  calState.weekStart = calGetMonday(a);
  return renderCalendar();
}

function calToday() { return calZet(new Date()); }

function calStap(richting) {
  const a = new Date(calAnchor());
  if (calState.view === 'day') a.setDate(a.getDate() + richting);
  else if (calState.view === 'week') a.setDate(a.getDate() + 7 * richting);
  else if (calState.view === 'month') { a.setDate(1); a.setMonth(a.getMonth() + richting); }
  else a.setDate(a.getDate() + CAL_LIST_DAGEN * richting);
  return calZet(a);
}
function calPrev() { return calStap(-1); }
function calNext() { return calStap(1); }

function calView(v) {
  if (CAL_VIEWS.indexOf(v) === -1) return;
  /* Van weergave wisselen vanuit een bereik waarin vandaag ligt: begin bij
     vandaag, niet bij de maandag van die week (een week die eind september
     begint, opende anders september in plaats van oktober). */
  if (v !== calState.view) {
    const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
    if (calBereik().some(function (d) { return d.getTime() === vandaag.getTime(); })) calState.anchor = vandaag;
  }
  calState.view = v;
  try { localStorage.setItem('hv-cal-view', v); } catch (e) { /* bijzaak */ }
  const sc = document.getElementById('cal-scroll-area');
  if (sc) sc.dataset.scrolled = '';
  return renderCalendar();
}

function calNaarDag(iso) {
  const p = String(iso || '').split('-');
  if (p.length !== 3) return;
  calState.view = 'day';
  try { localStorage.setItem('hv-cal-view', 'day'); } catch (e) { /* bijzaak */ }
  const sc = document.getElementById('cal-scroll-area');
  if (sc) sc.dataset.scrolled = '';
  return calZet(new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
}

/* Zoomen houdt het uur onder de cursor (of bovenaan) op zijn plek. */
async function calZoom(stap, ankerY) {
  const z = Math.max(0, Math.min(CAL_ZOOM.length - 1, calState.zoom + stap));
  if (z === calState.zoom) return;
  const oud = calRowH();
  const sc = document.getElementById('cal-scroll-area');
  const y = typeof ankerY === 'number' ? ankerY : 0;
  const uurOnder = sc ? (sc.scrollTop + y) / oud : 0;
  calState.zoom = z;
  try { localStorage.setItem('hv-cal-zoom', String(z)); } catch (e) { /* bijzaak */ }
  await renderCalendar();
  if (sc) sc.scrollTop = Math.max(0, uurOnder * calRowH() - y);
}

function calBereik() {
  const a = calAnchor();
  let van, aantal;
  if (calState.view === 'day') { van = new Date(a); aantal = 1; }
  else if (calState.view === 'week') { van = calGetMonday(a); aantal = 7; }
  else if (calState.view === 'month') {
    const eerste = new Date(a.getFullYear(), a.getMonth(), 1);
    const laatste = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    van = calGetMonday(eerste);
    const tot = Math.round((laatste - van) / 86400000) + 1;
    aantal = Math.ceil(tot / 7) * 7;
  } else { van = new Date(a); aantal = CAL_LIST_DAGEN; }
  const dagen = [];
  for (let i = 0; i < aantal; i++) {
    const d = new Date(van.getFullYear(), van.getMonth(), van.getDate() + i);
    dagen.push(d);
  }
  return dagen;
}

function calLabel(dagen) {
  const v = calState.view;
  const a = calAnchor();
  let label;
  try {
    if (v === 'day') label = a.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    else if (v === 'month') label = a.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
    else {
      const eerste = dagen[0], laatste = dagen[dagen.length - 1];
      const zelfdeMaand = eerste.getMonth() === laatste.getMonth() && eerste.getFullYear() === laatste.getFullYear();
      label = (v === 'week' && zelfdeMaand)
        ? eerste.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })
        : new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).formatRange(eerste, laatste);
    }
  } catch (e) {
    label = dagen[0].toLocaleDateString(LOCALE) + ' – ' + dagen[dagen.length - 1].toLocaleDateString(LOCALE);
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function calUur(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

async function calHaal(dagen) {
  const sleutel = lokaleDatum(dagen[0]) + '_' + dagen.length;
  if (calState.cache[sleutel]) return calState.cache[sleutel];
  const eind = new Date(dagen[dagen.length - 1]); eind.setHours(23, 59, 59, 999);
  const resp = await fetch(API_BASE + '/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
    body: JSON.stringify({ mode: 'appointments-list', from: dagen[0].toISOString(), to: eind.toISOString() })
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const eigen = (data.appointments || []).map(function (r) {
    const f = r.fields || {};
    const start = new Date(f['Start Time']);
    const durMin = parseInt(f['Duration'], 10) || 30;
    const end = new Date(start.getTime() + durMin * 60000);
    const status = f['Status'] || 'booked';
    const source = f['Source'] || 'manual';
    const bron = source === 'ai_chat' ? tr('cal.bron.assistent') : (source === 'manual' ? tr('cal.bron.handmatig') : tr('cal.bron.import'));
    const eventType = status === 'cancelled' ? tr('cal.st.geannuleerd') : (status === 'no_show' ? tr('cal.st.noshow') : bron);
    return {
      id: r.id, name: f['Lead Name'] || tr('cal.afspraak'), phone: f['Lead Phone'] || '',
      startTime: start.toISOString(), endTime: end.toISOString(),
      eventType: eventType, status: status, source: source, notes: f['Notes'] || ''
    };
  });
  /* De echte Google-afspraken van de klant ernaast: alleen-lezen, nooit
     verward met Helvaro-afspraken. Hele-dagitems overschilderen anders een
     volledige kolom en verbergen de echte afspraken eronder. */
  const extern = (data.externalEvents || []).map(function (e) {
    const st = new Date(e.start);
    const en = e.end ? new Date(e.end) : new Date(st.getTime() + 30 * 60000);
    return {
      id: 'g_' + (e.id || Math.random().toString(36).slice(2)),
      name: e.title || tr('cal.bezet'), phone: '',
      startTime: st.toISOString(), endTime: en.toISOString(),
      eventType: tr('cal.googleAgenda'), status: 'external', source: 'google',
      external: true, allDay: !!e.allDay, notes: ''
    };
  }).filter(function (e) { return !e.allDay; });
  const samen = eigen.concat(extern).sort(function (a, b) { return new Date(a.startTime) - new Date(b.startTime); });
  calState.cache[sleutel] = samen;
  return samen;
}

/* Tijdraster voor dag en week. De urenas loopt standaard van 08:00 tot
   21:00 en groeit mee met de vroegste start en het laatste einde. */
function calTekenTijd(dagen, events, klaar) {
  const rowH = calRowH();
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
  const dagSet = {};
  dagen.forEach(function (d) { dagSet[d.toDateString()] = true; });
  let startUur = 8, eindUur = 21;
  events.forEach(function (ev) {
    const s = new Date(ev.startTime), e = new Date(ev.endTime);
    if (!dagSet[s.toDateString()]) return;
    startUur = Math.min(startUur, s.getHours());
    const eu = e.toDateString() !== s.toDateString() ? 24 : e.getHours() + (e.getMinutes() ? 1 : 0);
    eindUur = Math.max(eindUur, eu);
  });
  startUur = Math.max(0, startUur); eindUur = Math.min(24, eindUur);
  const uren = eindUur - startUur;

  const dayNames = [0, 1, 2, 3, 4, 5, 6].map(function (d) {
    return new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(LOCALE, { weekday: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase();
  });
  const kolommen = 'repeat(' + dagen.length + ', minmax(0, 1fr))';

  const headerEl = document.getElementById('cal-day-cols-header');
  if (headerEl) {
    headerEl.style.gridTemplateColumns = kolommen;
    headerEl.innerHTML = dagen.map(function (d) {
      const isToday = d.getTime() === vandaag.getTime();
      /* In de week is de dagkop een knop naar die dag. */
      const inhoud = '<div class="cal-day-name">' + dayNames[d.getDay()] + '</div><div class="cal-day-num">' + d.getDate() + '</div>';
      return calState.view === 'week'
        ? '<button type="button" class="cal-day-header-cell cal-day-header-knop' + (isToday ? ' cal-today' : '') + '" onclick="calNaarDag(\'' + lokaleDatum(d) + '\')" title="' + escHtml(d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })) + '">' + inhoud + '</button>'
        : '<div class="cal-day-header-cell' + (isToday ? ' cal-today' : '') + '">' + inhoud + '</div>';
    }).join('');
  }

  const timeLabels = document.getElementById('cal-time-labels');
  if (timeLabels) {
    /* 24-uurs, zoals de rest van de app. Het halfuur alleen als er plaats is. */
    timeLabels.innerHTML = Array.from({ length: uren }, function (_, i) {
      const h = String(startUur + i).padStart(2, '0');
      return '<div class="cal-time-label">' + h + ':00' + (rowH >= 64 ? '<span class="cal-time-label-half">' + h + ':30</span>' : '') + '</div>';
    }).join('');
  }

  const colsEl = document.getElementById('cal-day-cols');
  if (!colsEl) return;
  colsEl.style.gridTemplateColumns = kolommen;
  const grid = colsEl.parentElement;
  if (grid) grid.style.minHeight = (uren * rowH) + 'px';
  const vijfUurGeleden = Date.now() - 5 * 3600000;

  colsEl.innerHTML = dagen.map(function (d) {
    const isToday = d.getTime() === vandaag.getTime();
    const dow = d.getDay();
    const dateStr = lokaleDatum(d);
    const rows = Array.from({ length: uren }, function (_, i) {
      const h = startUur + i;
      return '<div class="cal-hour-row"><button class="cal-hour-add" onclick="bookSlot(\'' + dateStr + '\',' + h + ')" title="' + escHtml(tr('cal.boekUur', { u: String(h).padStart(2, '0') + ':00' })) + '">+</button></div>';
    }).join('');

    let nowLine = '';
    if (isToday) {
      const nu = new Date();
      const mins = (nu.getHours() - startUur) * 60 + nu.getMinutes();
      if (mins >= 0 && mins < uren * 60) nowLine = '<div class="cal-now-line" style="top:' + Math.round((mins / 60) * rowH) + 'px"></div>';
    }

    const dagEvents = events.filter(function (ev) { return new Date(ev.startTime).toDateString() === d.toDateString(); });
    /* Overlappende afspraken naast elkaar, per groep die elkaar raakt: een
       afspraak om 09:00 deelt zijn breedte niet meer met een om 16:00. */
    const gesorteerd = dagEvents.slice().sort(function (a, b) { return new Date(a.startTime) - new Date(b.startTime); });
    const plek = new Map();
    let groep = [], groepEind = 0, banen = [];
    const sluitGroep = function () {
      groep.forEach(function (ev) { plek.get(ev).van = banen.length; });
      groep = []; banen = [];
    };
    gesorteerd.forEach(function (ev) {
      const s = new Date(ev.startTime).getTime();
      const e = new Date(ev.endTime).getTime() || s + 30 * 60000;
      if (groep.length && s >= groepEind) sluitGroep();
      let i = banen.findIndex(function (eindT) { return eindT <= s; });
      if (i === -1) { i = banen.length; banen.push(0); }
      banen[i] = e;
      plek.set(ev, { baan: i, van: 1 });
      groep.push(ev);
      groepEind = Math.max(groepEind, e);
    });
    sluitGroep();

    const evHtml = dagEvents.map(function (ev) {
      const evIdx = events.indexOf(ev);
      const start = new Date(ev.startTime), end = new Date(ev.endTime);
      const startMin = (start.getHours() - startUur) * 60 + start.getMinutes();
      const durMin = Math.round((end - start) / 60000) || 30;
      const top = Math.round((startMin / 60) * rowH);
      const height = Math.max(Math.round((durMin / 60) * rowH) - 2, 22);
      const p = plek.get(ev) || { baan: 0, van: 1 };
      /* Overlap: in de dagweergave naast elkaar (er is breedte genoeg). In de
         week trapsgewijs, zoals Google Agenda: elke volgende afspraak schuift
         een stukje op en ligt erboven, zodat elke naam leesbaar blijft. Naast
         elkaar bleef er bij drie afspraken "12:3" over. */
      const week = dagen.length > 1;
      let breed = '';
      if (p.van > 1 && !week) breed = 'left:calc(' + (p.baan * 100 / p.van).toFixed(3) + '% + 2px);right:auto;width:calc(' + (100 / p.van).toFixed(3) + '% - 4px);';
      else if (p.van > 1) breed = 'left:' + (3 + p.baan * 14) + 'px;right:3px;z-index:' + (5 + p.baan) + ';';
      const smal = p.van > 3 && !week;
      const naam = escHtml(ev.name || tr('cal.afspraak'));
      const tijd = calUur(start) + '–' + calUur(end);
      const titel = (ev.name || tr('cal.afspraak')) + ' · ' + tijd + (ev.eventType ? ' · ' + ev.eventType : '');
      let body;
      if (height < 40 || smal) {
        /* Eén regel: begintijd en naam, de rest via de tooltip en een klik. */
        body = '<div class="cal-event-regel"><span class="cal-event-time">' + calUur(start) + '</span> <span class="cal-event-name">' + naam + '</span></div>';
      } else {
        body = '<div class="cal-event-time">' + tijd + '</div><div class="cal-event-name">' + naam + '</div>'
          + (height >= 64 && ev.eventType ? '<div class="cal-event-type">' + escHtml(ev.eventType) + '</div>' : '');
      }
      let klasse = 'cal-event' + (smal || height < 40 ? ' cal-event--compact' : '') + (ev.status === 'cancelled' ? ' cal-event--geannuleerd' : '');
      if (ev.external) {
        return '<div class="' + klasse + ' cal-event-external" style="top:' + top + 'px;height:' + height + 'px;' + breed + '" title="' + escHtml(titel) + '">' + body + '</div>';
      }
      let attDot = '';
      if (start.getTime() < vijfUurGeleden) {
        const ml = matchLeadToEvent(ev.name);
        if (ml) {
          const nd = parseNotities(ml);
          const v = nd.afspraak ? nd.afspraak.verschenen : undefined;
          if (v !== true && v !== false) attDot = '<div class="cal-event-needs-att"></div>';
        }
      }
      const kleur = CAL_KLEUREN[(ev.name || '').charCodeAt(0) % CAL_KLEUREN.length] || CAL_KLEUREN[0];
      return '<button type="button" class="' + klasse + '" data-ev-idx="' + evIdx + '" style="top:' + top + 'px;height:' + height + 'px;' + breed + 'background:' + kleur + ';" title="' + escHtml(titel) + '" onclick="openCalEvent(' + evIdx + ')">' + body + attDot + '</button>';
    }).join('');

    const colClass = 'cal-day-col' + (isToday ? ' cal-today-col' : '') + (dow === 0 || dow === 6 ? ' cal-weekend-col' : '');
    return '<div class="' + colClass + '">' + rows + nowLine + evHtml + '</div>';
  }).join('');

  /* Bij het openen: naar een uur voor nu, of naar de eerste afspraak. */
  const scrollEl = document.getElementById('cal-scroll-area');
  if (klaar && scrollEl && scrollEl.dataset.scrolled !== '1') {
    scrollEl.dataset.scrolled = '1';
    const nu = new Date();
    const inBeeld = dagen.some(function (d) { return d.toDateString() === nu.toDateString(); });
    const eerste = events.find(function (ev) { return dagSet[new Date(ev.startTime).toDateString()]; });
    let uur = inBeeld ? nu.getHours() - 1 : (eerste ? new Date(eerste.startTime).getHours() - 1 : startUur);
    scrollEl.scrollTop = Math.max(0, (Math.max(uur, startUur) - startUur) * rowH);
  }
}

function calTekenMaand(dagen, events) {
  const el = document.getElementById('cal-alt-view');
  if (!el) return;
  const a = calAnchor();
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
  const namen = [1, 2, 3, 4, 5, 6, 0].map(function (d) {
    return new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString(LOCALE, { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
  });
  const perDag = {};
  events.forEach(function (ev, i) {
    const k = new Date(ev.startTime).toDateString();
    (perDag[k] = perDag[k] || []).push(i);
  });
  const weken = dagen.length / 7;
  const cellen = dagen.map(function (d) {
    const iso = lokaleDatum(d);
    const lijst = perDag[d.toDateString()] || [];
    const buiten = d.getMonth() !== a.getMonth();
    const isVandaag = d.getTime() === vandaag.getTime();
    const max = 3;
    const chips = lijst.slice(0, max).map(function (i) {
      const ev = events[i];
      const st = new Date(ev.startTime);
      const kl = 'cal-chip' + (ev.external ? ' cal-chip--extern' : '') + (ev.status === 'cancelled' ? ' cal-chip--geannuleerd' : '');
      const inhoud = '<span class="cal-chip-tijd">' + calUur(st) + '</span><span class="cal-chip-naam">' + escHtml(ev.name || tr('cal.afspraak')) + '</span>';
      const titel = escHtml((ev.name || '') + ' · ' + calUur(st) + '–' + calUur(new Date(ev.endTime)));
      return ev.external
        ? '<span class="' + kl + '" title="' + titel + '">' + inhoud + '</span>'
        : '<button type="button" class="' + kl + '" title="' + titel + '" onclick="openCalEvent(' + i + ')">' + inhoud + '</button>';
    }).join('');
    const meer = lijst.length > max
      ? '<button type="button" class="cal-maand-meer" onclick="calNaarDag(\'' + iso + '\')">' + escHtml(tr('cal.meer', { n: lijst.length - max })) + '</button>'
      : '';
    return '<div class="cal-maand-dag' + (buiten ? ' cal-maand-dag--buiten' : '') + (isVandaag ? ' cal-maand-dag--vandaag' : '') + '">'
      + '<div class="cal-maand-dagkop">'
      + '<button type="button" class="cal-maand-num" onclick="calNaarDag(\'' + iso + '\')" title="' + escHtml(d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })) + '">' + d.getDate() + '</button>'
      + '<button type="button" class="cal-maand-plus" onclick="openCalBookModal(\'' + iso + '\',null)" title="' + escHtml(tr('cal.book')) + '" aria-label="' + escHtml(tr('cal.book')) + '">+</button>'
      + '</div>' + chips + meer + '</div>';
  }).join('');
  el.innerHTML = '<div class="cal-maand">'
    + '<div class="cal-maand-kop">' + namen.map(function (n) { return '<div>' + escHtml(n) + '</div>'; }).join('') + '</div>'
    + '<div class="cal-maand-grid" style="grid-template-rows:repeat(' + weken + ', minmax(0, 1fr))">' + cellen + '</div>'
    + '</div>';
}

function calTekenLijst(dagen, events) {
  const el = document.getElementById('cal-alt-view');
  if (!el) return;
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0);
  const morgen = new Date(vandaag); morgen.setDate(morgen.getDate() + 1);
  const perDag = {};
  events.forEach(function (ev, i) {
    const k = new Date(ev.startTime).toDateString();
    (perDag[k] = perDag[k] || []).push(i);
  });
  let html = '';
  dagen.forEach(function (d) {
    const lijst = perDag[d.toDateString()];
    if (!lijst || !lijst.length) return;
    const voor = d.getTime() === vandaag.getTime() ? tr('dash.today') + ' · ' : (d.getTime() === morgen.getTime() ? tr('cal.morgen') + ' · ' : '');
    const kop = d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    html += '<section class="cal-lijst-dag"><h3 class="cal-lijst-kop">' + escHtml(voor + kop.charAt(0).toUpperCase() + kop.slice(1))
      + '<span class="cal-lijst-aantal">' + lijst.length + '</span></h3>';
    lijst.forEach(function (i) {
      const ev = events[i];
      const st = new Date(ev.startTime), en = new Date(ev.endTime);
      const kl = 'cal-lijst-rij' + (ev.external ? ' cal-lijst-rij--extern' : '') + (ev.status === 'cancelled' ? ' cal-lijst-rij--geannuleerd' : '');
      const inhoud = '<span class="cal-lijst-tijd">' + calUur(st) + '–' + calUur(en) + '</span>'
        + '<span class="cal-lijst-naam">' + escHtml(ev.name || tr('cal.afspraak')) + (ev.phone ? '<span class="cal-lijst-tel">' + escHtml(ev.phone) + '</span>' : '') + '</span>'
        + '<span class="cal-lijst-type">' + escHtml(ev.eventType || '') + '</span>';
      html += ev.external
        ? '<div class="' + kl + '">' + inhoud + '</div>'
        : '<button type="button" class="' + kl + '" onclick="openCalEvent(' + i + ')">' + inhoud + '</button>';
    });
    html += '</section>';
  });
  if (!html) {
    html = '<div class="cal-lijst-leeg"><div class="cal-lijst-leeg-titel">' + escHtml(tr('cal.lijst.leeg')) + '</div>'
      + '<button type="button" class="cal-today-btn" onclick="openCalBookModal(lokaleDatum(new Date()),null)">' + escHtml(tr('cal.book')) + '</button></div>';
  }
  el.innerHTML = '<div class="cal-lijst">' + html + '</div>';
}

async function renderCalendar() {
  calAnchor();
  calState.weekStart = calGetMonday(calState.anchor);
  const view = calState.view;
  const dagen = calBereik();
  const tijd = view === 'day' || view === 'week';

  CAL_VIEWS.forEach(function (v) {
    const b = document.getElementById('cal-view-' + v);
    if (b) b.setAttribute('aria-pressed', v === view ? 'true' : 'false');
  });
  const zoomGroep = document.getElementById('cal-zoom');
  if (zoomGroep) zoomGroep.hidden = !tijd;
  const zIn = document.getElementById('cal-zoom-in'), zUit = document.getElementById('cal-zoom-uit');
  if (zIn) zIn.disabled = calState.zoom >= CAL_ZOOM.length - 1;
  if (zUit) zUit.disabled = calState.zoom <= 0;
  const page = document.getElementById('page-kalender');
  if (page) { page.style.setProperty('--cal-row-h', calRowH() + 'px'); page.dataset.calView = view; }
  const rangeEl = document.getElementById('cal-range-label');
  if (rangeEl) rangeEl.textContent = calLabel(dagen);
  const vorige = document.getElementById('cal-vorige'), volgende = document.getElementById('cal-volgende');
  const stapNaam = { day: ['cal.vorigeDag', 'cal.volgendeDagKort'], week: ['cal.prev', 'cal.next'], month: ['cal.vorigeMaand', 'cal.volgendeMaand'], list: ['cal.vorigePeriode', 'cal.volgendePeriode'] }[view];
  if (vorige) { vorige.title = tr(stapNaam[0]); vorige.setAttribute('aria-label', tr(stapNaam[0])); }
  if (volgende) { volgende.title = tr(stapNaam[1]); volgende.setAttribute('aria-label', tr(stapNaam[1])); }

  const koppen = document.querySelector('#page-kalender .cal-day-headers');
  const scroll = document.getElementById('cal-scroll-area');
  const alt = document.getElementById('cal-alt-view');
  if (koppen) koppen.hidden = !tijd;
  if (scroll) scroll.hidden = !tijd;
  if (alt) alt.hidden = tijd;

  const teken = function (events, klaar) {
    if (view === 'month') calTekenMaand(dagen, events);
    else if (view === 'list') calTekenLijst(dagen, events);
    else calTekenTijd(dagen, events, klaar);
  };

  const sleutel = lokaleDatum(dagen[0]) + '_' + dagen.length;
  const uitCache = calState.cache[sleutel];
  if (!uitCache) teken([], false);
  const nr = ++calState.teken;
  let events = uitCache || null;
  if (!events) {
    try { events = await calHaal(dagen); } catch (e) { events = null; }
  }
  /* Een tragere, oudere aanvraag mag een nieuwere weergave niet overschrijven. */
  if (nr !== calState.teken || !events) return;
  calState.lastEvents = events;
  const vandaag = new Date().toDateString();
  if (dagen.some(function (d) { return d.toDateString() === vandaag; })) {
    renderTodayWidget(events);
    updateCalBadge(events);
  }
  renderAttendanceBanner();
  teken(events, true);
}

/* Sneltoetsen, alleen op de agendapagina en nooit tijdens het typen. */
document.addEventListener('keydown', function (e) {
  const page = document.getElementById('page-kalender');
  if (!page || !page.classList.contains('active')) return;
  const t = e.target;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || ''))) return;
  if (document.querySelector('.cal-modal-overlay.open, .cal-modal-overlay.active')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 't' || k === 'T') { e.preventDefault(); calToday(); }
  else if (k === 'ArrowLeft') { e.preventDefault(); calPrev(); }
  else if (k === 'ArrowRight') { e.preventDefault(); calNext(); }
  else if (k === 'd' || k === 'D') calView('day');
  else if (k === 'w' || k === 'W') calView('week');
  else if (k === 'm' || k === 'M') calView('month');
  else if (k === 'l' || k === 'L') calView('list');
  else if (k === '+' || k === '=') calZoom(1);
  else if (k === '-' || k === '_') calZoom(-1);
});

/* Ctrl/Cmd + scrollen (en knijpen op een trackpad) zoomt het tijdraster. */
(function calWielKoppel() {
  const sc = document.getElementById('cal-scroll-area');
  if (!sc) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', calWielKoppel); return; }
  let rust = 0;
  sc.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const nu = Date.now();
    if (nu - rust < 120) return;
    rust = nu;
    const r = sc.getBoundingClientRect();
    calZoom(e.deltaY < 0 ? 1 : -1, e.clientY - r.top);
  }, { passive: false });
})();
}

const BRON = (function () {
  const s = client.toString();
  return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
})();

module.exports = { js: () => BRON };
