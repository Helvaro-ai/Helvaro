'use strict';
/*
 * Command Center — client script.
 *
 * ── Escaping ─────────────────────────────────────────────────────────────────
 * The returned string is spliced into api/dashboard.js's own template literal,
 * so it may contain NO backtick and no unescaped ${ }. Everything below is ES5
 * string concatenation for that reason, and a regex needs \\s rather than \s —
 * a lone escape is swallowed by the outer literal and reaches the browser
 * meaning something else. scripts/faro-check.js asserts both.
 *
 * ── What this file does NOT do ───────────────────────────────────────────────
 * It sends no WhatsApp message, books no appointment and charges no credit. It
 * routes to the systems that already do those things: the follow-up and
 * booking buttons hand the opportunity to Faro, which proposes through the
 * existing HMAC confirmation gate. There is deliberately no path from a
 * Command Center click to an external side effect that skips that gate.
 */

function js() {
  return `
/* ═══ Command Center ═══════════════════════════════════════════════════════ */
function CT(k, fallback) {
  if (CMD_T && Object.prototype.hasOwnProperty.call(CMD_T, k)) return CMD_T[k];
  return fallback || k;
}
function CTn(k, n) { return CT(k).replace('{n}', String(n)); }

var cmdState = { data: null, loading: false, loaded: false, autopilot: true, byId: {}, lastFocus: null };

function cmdEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Money, formatted the way the rest of the product formats it. Compact above a
   million because a KPI tile is not the place for nine digits. */
function cmdEur(n) {
  if (!n || !isFinite(n) || n <= 0) return '—';
  if (n >= 1000000) {
    var m = (n / 1000000);
    return '€' + (m % 1 === 0 ? m.toFixed(0) : m.toFixed(2).replace('.', ',')) + 'M';
  }
  if (n >= 1000) return '€' + Math.round(n / 1000) + 'k';
  return '€' + n;
}

function cmdIcon(name, size) {
  var P = CMD_ICON_PATHS;
  var d = P[name] || P.spark;
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' +
         'aria-hidden="true"><path d="' + d + '"/></svg>';
}

/* ── Loading ──────────────────────────────────────────────────────────────────
   One request, on first visit to the page. Not on every navigation: the
   analysis is arithmetic over the same rows the dashboard already polls, and
   re-running it because someone clicked back is spend without benefit. */
function cmdLoad(force) {
  if (cmdState.loading) return;
  if (cmdState.loaded && !force) return;
  cmdState.loading = true;

  var err = document.getElementById('cmd-error');
  var body = document.getElementById('cmd-body');

  cmdApiPost({ mode: 'command-center' })
    .then(function (r) {
      cmdState.loading = false;
      cmdState.loaded = true;
      cmdState.data = r;
      cmdState.byId = {};
      (r.opportunities || []).forEach(function (o) { cmdState.byId[o.id] = o; });
      if (err) err.hidden = true;
      if (body) body.hidden = false;
      cmdRender();
    })
    .catch(function (e) {
      cmdState.loading = false;
      if (body) body.hidden = true;
      if (err) {
        err.hidden = false;
        var txt = document.getElementById('cmd-error-text');
        if (txt) txt.textContent = (e && e.message) || CT('err.unavailable');
      }
      // Faro's own greeting stays put — the page saying good evening and then
      // admitting it cannot read the CRM is honest. A blank page is not.
    });
}

/* Uses the dashboard's own authenticated fetch conventions — same session
   header, same CSRF handling — rather than inventing a second transport. */
function cmdApiPost(payload) {
  return fetch(API_BASE + '/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) {
      if (!r.ok) throw new Error(j.error || CT('err.unavailable'));
      return j;
    });
  });
}

/* ── Render ───────────────────────────────────────────────────────────────── */
function cmdRender() {
  var d = cmdState.data;
  if (!d) return;
  cmdRenderBrief(d);
  cmdRenderKpis(d);
  cmdRenderOpps(d);
  cmdRenderInsights(d);
}

function cmdRenderBrief(d) {
  var box = document.getElementById('cmd-brief');
  var counts = document.getElementById('cmd-brief-counts');
  var top = document.getElementById('cmd-brief-top');
  if (!box || !counts || !top) return;

  var b = d.briefing || {};
  var c = b.counts || {};

  // With nothing to report the briefing hides rather than printing a row of
  // zeros: "0 kansen · 0 afspraken" is a worse answer than the empty state
  // below it, which explains what would put something here.
  if (!b.top && !c.appointments) { box.hidden = true; return; }
  box.hidden = false;

  var items = [
    { n: c.opportunities || 0, l: CT('brief.opportunities') },
    { n: c.appointments || 0, l: CT('brief.appointments') },
    { n: c.atRisk || 0, l: CT('brief.atRisk') },
    { n: cmdEur(c.potentialPipeline), l: CT('brief.pipeline') }
  ];
  counts.innerHTML = items.map(function (i) {
    return '<span class="cmd-brief__count"><span class="cmd-brief__n">' + cmdEsc(i.n) +
           '</span><span class="cmd-brief__l">' + cmdEsc(i.l) + '</span></span>';
  }).join('');

  top.innerHTML = b.top
    ? '<div class="cmd-brief__label">' + cmdEsc(CT('brief.title')) + '</div>' +
      '<p class="cmd-brief__line">' + cmdEsc(b.top.line) + '</p>' +
      '<button class="cmd-btn" data-cmd-brief="' + cmdEsc(b.top.id) + '">' +
        cmdEsc(CT('brief.review')) + '</button>'
    : '';
}

function cmdRenderKpis(d) {
  var box = document.getElementById('cmd-kpis');
  if (!box) return;
  var o = d.overview || {};
  var rec = d.recovered || {};

  var tiles = [];
  // Only shown when budgets actually exist. A confident €0 on the headline
  // metric is worse than the tile not being there.
  if (o.hasBudgetData) {
    tiles.push({ l: CT('kpi.pipeline'), v: cmdEur(o.potentialPipeline), s: CT('kpi.pipelineSub') });
  }
  tiles.push({ l: CT('kpi.qualified'), v: String(o.qualified || 0), s: '' });
  tiles.push({ l: CT('kpi.appointments'), v: String(o.appointments || 0), s: CT('kpi.appointmentsSub') });
  tiles.push({ l: CT('kpi.conversion'), v: (o.conversion || 0) + '%', s: CT('kpi.conversionSub') });
  if (rec.count > 0 && rec.potentialValue > 0) {
    // Labelled potential pipeline, never revenue. The distinction is the whole
    // reason this metric is defensible.
    tiles.push({ l: CT('kpi.recovered'), v: cmdEur(rec.potentialValue), s: CT('kpi.recoveredSub') });
  }
  if (o.avgResponseTime > 0) {
    tiles.push({ l: CT('kpi.response'), v: Math.round(o.avgResponseTime) + 's', s: '' });
  }

  box.innerHTML = tiles.map(function (t) {
    return '<div class="cmd-kpi"><div class="cmd-kpi__l">' + cmdEsc(t.l) + '</div>' +
           '<div class="cmd-kpi__v">' + cmdEsc(t.v) + '</div>' +
           (t.s ? '<div class="cmd-kpi__s">' + cmdEsc(t.s) + '</div>' : '') + '</div>';
  }).join('');
}

function cmdRenderOpps(d) {
  var box = document.getElementById('cmd-opps');
  if (!box) return;
  var list = d.opportunities || [];

  if (!list.length) {
    box.innerHTML = '<div class="cmd-empty"><div class="cmd-empty__t">' + cmdEsc(CT('opp.empty')) +
      '</div><div class="cmd-empty__s">' + cmdEsc(CT('opp.emptySub')) + '</div></div>';
    return;
  }

  box.innerHTML = list.map(function (o) {
    var facts = [];
    if (o.budget) facts.push('<b>' + cmdEsc(cmdEur(o.budget)) + '</b>');
    else if (o.budgetText) facts.push(cmdEsc(o.budgetText));
    if (o.timing) facts.push(cmdEsc(o.timing));
    if (o.leadScore) facts.push(cmdEsc(CT('opp.leadScore')) + ' <b>' + cmdEsc(o.leadScore) + '</b>');
    if (!o.booked) facts.push(cmdEsc(CT('opp.noAppointment')));
    if (o.silentDays != null && o.silentDays >= 2) facts.push(cmdEsc(CTn('opp.silent', o.silentDays)));

    var actionable = o.action && o.action.key !== 'none';
    return '' +
      '<article class="cmd-opp" data-tone="' + cmdEsc(o.categoryTone) + '" data-opp="' + cmdEsc(o.id) + '">' +
        '<div class="cmd-opp__rail"></div>' +
        '<div class="cmd-opp__main" data-cmd-open="' + cmdEsc(o.id) + '" role="button" tabindex="0">' +
          '<div class="cmd-opp__top">' +
            '<span class="cmd-opp__name">' + cmdEsc(o.name) + '</span>' +
            '<span class="cmd-opp__cat">' + cmdEsc(o.categoryLabel) + '</span>' +
          '</div>' +
          '<div class="cmd-opp__facts">' + facts.join('<span>·</span>') + '</div>' +
          (o.why ? '<div class="cmd-opp__why"><span>' + cmdEsc(CT('opp.why')) + '</span>' +
                   cmdEsc(o.why) + '</div>' : '') +
        '</div>' +
        '<div class="cmd-opp__side">' +
          (actionable
            ? '<button class="cmd-btn" data-cmd-act="' + cmdEsc(o.action.key) + '" data-cmd-id="' +
              cmdEsc(o.id) + '">' + cmdEsc(CT('act.' + o.action.key, o.action.label)) + '</button>'
            : '<span class="cmd-opp__score">' + cmdEsc(CT('act.none')) + '</span>') +
          '<span class="cmd-opp__score">' + cmdEsc(CT('opp.score')) + ' <b>' + cmdEsc(o.score) + '</b></span>' +
        '</div>' +
      '</article>';
  }).join('');
}

function cmdRenderInsights(d) {
  var box = document.getElementById('cmd-insights');
  if (!box) return;
  var list = d.insights || [];
  if (!list.length) {
    box.innerHTML = '<div class="cmd-empty"><div class="cmd-empty__t">' + cmdEsc(CT('insight.empty')) +
      '</div><div class="cmd-empty__s">' + cmdEsc(CT('insight.emptySub')) + '</div></div>';
    return;
  }
  box.innerHTML = list.map(function (i) {
    return '<div class="cmd-insight"><span class="cmd-insight__icon">' + cmdIcon('spark', 15) + '</span>' +
      '<div><div class="cmd-insight__t">' + cmdEsc(i.text) + '</div>' +
      (i.detail ? '<div class="cmd-insight__d">' + cmdEsc(i.detail) + '</div>' : '') + '</div></div>';
  }).join('');
}

/* ── Drawer ───────────────────────────────────────────────────────────────── */
function cmdOpenDrawer(id) {
  var o = cmdState.byId[id];
  if (!o) return;
  var drawer = document.getElementById('cmd-drawer');
  var name = document.getElementById('cmd-drawer-name');
  var body = document.getElementById('cmd-drawer-body');
  if (!drawer || !body) return;

  if (name) name.textContent = o.name;

  var last = o.silentDays == null ? CT('drawer.never')
    : (o.silentDays === 0 ? CT('drawer.today')
      : (o.silentDays === 1 ? CT('drawer.yesterday') : CTn('drawer.daysAgo', o.silentDays)));

  var rows = [
    [CT('drawer.budget'), o.budget ? cmdEur(o.budget) : (o.budgetText || '—')],
    [CT('drawer.timing'), o.timing || '—'],
    [CT('drawer.source'), o.source || '—'],
    [CT('drawer.status'), o.qualified ? CT('drawer.qualified') : CT('drawer.notQualified')],
    [CT('drawer.lastContact'), last],
    [CT('opp.leadScore'), o.leadScore ? o.leadScore + '/10' : '—'],
    [CT('opp.score'), o.score + '/100']
  ];

  var html = '<dl class="cmd-dl">' + rows.map(function (r) {
    return '<dt>' + cmdEsc(r[0]) + '</dt><dd>' + cmdEsc(r[1]) + '</dd>';
  }).join('') + '</dl>';

  if (o.summary) {
    html += '<div class="cmd-block"><div class="cmd-block__t">' + cmdEsc(CT('drawer.summary')) +
            '</div><p class="cmd-block__p">' + cmdEsc(o.summary) + '</p></div>';
  }

  // The reasoning. Without this the score is an assertion; with it the user can
  // disagree with a specific line, which is what makes it trustworthy.
  if (o.reasons && o.reasons.length) {
    html += '<div class="cmd-block"><div class="cmd-block__t">' + cmdEsc(CT('drawer.reasoning')) + '</div>' +
      o.reasons.map(function (r) {
        return '<div class="cmd-reason' + (r.negative ? ' cmd-reason--neg' : '') + '">' +
          '<span class="cmd-reason__l">' + cmdEsc(r.label) + '</span>' +
          '<span class="cmd-reason__d">' + cmdEsc(r.detail) + '</span></div>';
      }).join('') + '</div>';
  }

  if (o.action) {
    html += '<div class="cmd-block"><div class="cmd-block__t">' + cmdEsc(CT('drawer.recommended')) +
            '</div><p class="cmd-block__p">' + cmdEsc(CT('act.' + o.action.key, o.action.label)) +
            ' — ' + cmdEsc(o.action.reason) + '</p></div>';
  }

  var acts = [];
  if (o.action && o.action.key !== 'none') {
    acts.push('<button class="cmd-btn" data-cmd-act="' + cmdEsc(o.action.key) + '" data-cmd-id="' +
      cmdEsc(o.id) + '">' + cmdEsc(CT('act.' + o.action.key, o.action.label)) + '</button>');
  }
  acts.push('<button class="cmd-btn cmd-btn--ghost" data-cmd-act="ask" data-cmd-id="' + cmdEsc(o.id) + '">' +
    cmdEsc(CT('act.ask')) + '</button>');
  if (o.hasConversation) {
    acts.push('<button class="cmd-btn cmd-btn--ghost" data-cmd-act="review" data-cmd-id="' + cmdEsc(o.id) + '">' +
      cmdEsc(CT('drawer.openConvo')) + '</button>');
  }
  html += '<div class="cmd-drawer__actions">' + acts.join('') + '</div>';

  body.innerHTML = html;
  drawer.hidden = false;

  /* Focus moves INTO the drawer. Without this a keyboard user opens a panel
     they cannot reach: the next Tab continues from the card behind it, through
     content the scrim has covered. Remember where we came from so Escape hands
     it back. */
  cmdState.lastFocus = document.activeElement;
  var firstBtn = drawer.querySelector('.cmd-drawer__actions .cmd-btn') ||
                 document.getElementById('cmd-drawer-close');
  if (firstBtn) firstBtn.focus();
}

function cmdCloseDrawer() {
  var d = document.getElementById('cmd-drawer');
  if (!d || d.hidden) return;
  d.hidden = true;
  if (cmdState.lastFocus && cmdState.lastFocus.focus) {
    try { cmdState.lastFocus.focus(); } catch (e) { /* node detached */ }
  }
  cmdState.lastFocus = null;
}

/* Keep Tab inside the drawer while it is open. It is aria-modal, and a modal
   whose focus leaks is worse than one that never claimed to be modal. */
function cmdTrapFocus(e) {
  var d = document.getElementById('cmd-drawer');
  if (!d || d.hidden || e.key !== 'Tab') return;
  var f = [].slice.call(d.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
    .filter(function (el) { return el.offsetParent !== null; });
  if (!f.length) return;
  var first = f[0];
  var last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* Korte melding. Gebruikt de toast van het CRM als die er is, zodat dit er
   niet als een tweede meldsysteem uitziet; anders een nette terugval. */
function cmdNotify(msg) {
  if (typeof toast === 'function') { try { toast(msg, 'info'); return; } catch (e) {} }
  var el = document.createElement('div');
  el.className = 'cmd-notify';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 4000);
}

/* ── Actions ──────────────────────────────────────────────────────────────────
   Every consequential action is handed to Faro, which proposes it through the
   existing HMAC-signed confirmation gate. Nothing here sends, books or charges
   directly, and there is no path from a click on this page to an external side
   effect that skips that gate. */
function cmdAct(key, id) {
  var o = cmdState.byId[id];
  if (!o) return;

  if (key === 'review' || key === 'takeover') {
    // Beide landen in het gespreksoverzicht: daar leest een mens de draad, en
    // daar typt hij bij een gepauzeerde lead zelf het antwoord.
    //
    // Hier stond alleen navigateTo('gesprekken'), wat je op een lijst zette met
    // niets geselecteerd — "Selecteer een gesprek" — terwijl je de lead net in
    // handen had. Je moest hem dus opnieuw opzoeken. Nu wordt het gesprek van
    // deze lead meteen geopend.
    cmdCloseDrawer();
    navigateTo('gesprekken');
    if (typeof openConversation === 'function') {
      setTimeout(function () { try { openConversation(o.id); } catch (e) {} }, 80);
    }
    return;
  }
  if (key === 'call') {
    var digits = (o.phone || '').replace(/[^0-9+]/g, '');
    if (digits) { window.location.href = 'tel:' + digits; return; }
    // Zonder nummer deed deze knop letterlijk niets: geen melding, geen
    // verandering. Een knop met het woord "Bellen" erop die niets doet is
    // erger dan geen knop, want je gaat ervan uit dat het gelukt is.
    cmdNotify('Van ' + o.name + ' hebben we geen telefoonnummer. Open het gesprek om te reageren.');
    return;
  }

  var prompt;
  if (key === 'follow_up') {
    // The AI books the viewing itself once the conversation restarts, so the
    // message asks for a nudge — not for a proposed time. Asking Faro to
    // "propose a viewing" would have it negotiate a slot in text that the
    // WhatsApp AI is about to negotiate again, with the calendar in hand.
    prompt = 'Schrijf een kort, persoonlijk opvolgbericht voor ' + o.name +
      ' dat het gesprek weer op gang brengt, zodat de AI de afspraak kan afronden. ' +
      'Vraag me om bevestiging voor je het verstuurt. Context: ' + cmdContextLine(o);
  } else {
    prompt = 'Waarom is ' + o.name + ' nu belangrijk, en wat raad je aan? Context: ' + cmdContextLine(o);
  }

  cmdCloseDrawer();
  cmdHandToFaro(prompt);
}

/* The context Faro receives. Facts the Command Center already computed, so
   Faro does not re-derive them — and phrased as data rather than instruction,
   because everything here originates from CRM records the model should treat
   as information, not as commands. */
function cmdContextLine(o) {
  var bits = ['lead-id ' + o.id];
  if (o.budget) bits.push('budget ' + cmdEur(o.budget));
  if (o.timing) bits.push('timing ' + o.timing);
  if (o.leadScore) bits.push('leadscore ' + o.leadScore + '/10');
  bits.push(o.qualified ? 'gekwalificeerd' : 'nog niet gekwalificeerd');
  bits.push(o.booked ? 'afspraak geboekt' : 'geen afspraak');
  if (o.silentDays != null) bits.push(o.silentDays + ' dagen geen reactie');
  if (o.categoryLabel) bits.push('categorie ' + o.categoryLabel);
  return bits.join(', ') + '.';
}

/* One assistant, not two. The Command Center hands context to the Faro that
   already exists, with its tools, its tenant scoping and its confirmation
   gate. */
function cmdHandToFaro(text) {
  if (typeof faroSend !== 'function') {
    // Faro staat uit of is niet geladen. Dit was een stille return, waardoor
    // ELKE knop in de briefing niets deed zonder ook maar iets te melden.
    cmdNotify('Faro is nu niet beschikbaar. Probeer het zo opnieuw.');
    return;
  }
  if (typeof faroState === 'object' && faroState && faroState.streaming) {
    // faroSend() weigert tijdens een lopende stream, óók stilzwijgend. Vanuit
    // een knop moet je dat te horen krijgen in plaats van het te raden.
    cmdNotify('Faro is nog bezig met het vorige antwoord.');
    return;
  }
  // Already on the Faro page in the merged layout; faroOpen() is a no-op then
  // and a navigation when the user is somewhere else in the CRM. Either way
  // faroSend() takes over: it swaps the landing for the thread.
  if (typeof faroOpen === 'function') faroOpen();
  setTimeout(function () { faroSend(text); }, 60);
}

/* "Handle everything." Faro finds the actionable opportunities itself through
   its own tools rather than being handed a list to trust, and proposes each
   consequential action for confirmation. */
function cmdReviewAll() {
  var d = cmdState.data;
  var n = d ? (d.totalOpportunities || 0) : 0;
  cmdHandToFaro(
    'Overloop mijn openstaande kansen. Zoek de leads die opvolging nodig hebben, ' +
    'groepeer ze per type actie, en stel per groep voor wat je zou doen. ' +
    'Vraag bevestiging voor alles wat naar buiten gaat. ' +
    (n ? 'Het Command Center telt er op dit moment ' + n + '.' : '')
  );
}

/* ── Automatisch bijwerken ────────────────────────────────────────────────────
   Een zichtbare stand, per browser bewaard. Bepaalt of het Command Center bij
   het openen opnieuw analyseert. Hij geeft het model geen uitvoerpad — dat
   blijft hoe dan ook achter de bevestigingspoort — en schrijft nooit naar
   bestaande klantinstellingen.

   Dit heette "Autopilot", en dat was het probleem: de knop stuurt geen enkel
   verzoek naar de server, en dat is ook precies goed, want hij hoort niets aan
   te sturen. Maar met "Autopilot · Gepauzeerd" erop leek het alsof je de AI
   stilzette die elke binnenkomende WhatsApp-lead beantwoordt. Iemand die vóór
   een vakantie op pauze drukt en aanneemt dat het stil is, komt bedrogen uit.
   De naam dekt nu de lading; de AI stilzetten doe je per lead. */
function cmdSetAutopilot(on) {
  cmdState.autopilot = !!on;
  try { localStorage.setItem('hv-autopilot', on ? '1' : '0'); } catch (e) { /* private mode */ }
  var btn = document.getElementById('cmd-autopilot');
  var lbl = document.getElementById('cmd-auto-state');
  if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  if (lbl) lbl.textContent = on ? CT('auto.active') : CT('auto.paused');
  if (on) cmdLoad(true);
}

function cmdInit() {
  var saved = '1';
  try { saved = localStorage.getItem('hv-autopilot'); } catch (e) { saved = '1'; }
  cmdSetAutopilot(saved === null || saved === '1');

  document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-cmd-open]');
    if (open) { cmdOpenDrawer(open.getAttribute('data-cmd-open')); return; }

    var act = e.target.closest('[data-cmd-act]');
    if (act) {
      e.stopPropagation();
      cmdAct(act.getAttribute('data-cmd-act'), act.getAttribute('data-cmd-id'));
      return;
    }

    var brief = e.target.closest('[data-cmd-brief]');
    if (brief) { cmdOpenDrawer(brief.getAttribute('data-cmd-brief')); return; }

    if (e.target.closest('#cmd-drawer-close') || e.target.closest('#cmd-drawer-scrim')) {
      cmdCloseDrawer(); return;
    }
    if (e.target.closest('#cmd-review-all')) { cmdReviewAll(); return; }
    if (e.target.closest('#cmd-retry')) { cmdLoad(true); return; }
    if (e.target.closest('#cmd-autopilot')) { cmdSetAutopilot(!cmdState.autopilot); return; }
  });

  // Keyboard parity: the cards are role="button", so they must answer to keys.
  document.addEventListener('keydown', function (e) {
    cmdTrapFocus(e);
    if (e.key === 'Escape') { cmdCloseDrawer(); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var open = e.target && e.target.closest && e.target.closest('[data-cmd-open]');
    if (open) { e.preventDefault(); cmdOpenDrawer(open.getAttribute('data-cmd-open')); }
  });
}
`;
}

module.exports = { js };
