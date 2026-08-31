'use strict';
/*
 * Faro — client-side script.
 *
 * Returned as a plain string and spliced into api/dashboard.js's inline
 * <script>. Written in the same style as the rest of that script: no framework,
 * no build step, no module system, ES5 string concatenation throughout.
 *
 * ── One rule that matters more than the rest ─────────────────────────────────
 * Model output is NEVER inserted as HTML. Assistant prose goes in via
 * textContent; every card is built from typed component objects (see
 * api/_faro/schema.js) with hand-written markup and escaped values. A language
 * model writing into innerHTML — with lead conversations, which contain text
 * strangers sent us, flowing through its context — is an XSS hole with an
 * attacker-influenced input. There is no case where model text becomes markup.
 *
 * ── CSRF is already handled ──────────────────────────────────────────────────
 * api/dashboard.js wraps window.fetch (see its "CSRF — one fetch wrapper
 * instead of 45 call sites" block) and attaches x-csrf-token to every
 * same-origin non-GET automatically. This file therefore sets no CSRF header:
 * doing so would duplicate work already done and drift if that wrapper changes.
 *
 * ── Strings ──────────────────────────────────────────────────────────────────
 * FARO_T is injected by ./index.js from ./i18n.js for the user's language.
 * T('key') is the accessor; a missing key returns the key rather than blank.
 *
 * ── Galleries, not generators ────────────────────────────────────────────────
 * Beelden and Video's used to carry an eight-axis generation form. They do not
 * any more: you generate by asking in the chat — attach a photo, say what you
 * want, the picture comes back in the reply — and the panels are the library
 * you open to look at what you already made. That is the same split the
 * general-purpose assistants use, and it was the right one here for a concrete
 * reason: the form stood between the user and a sentence they could just type,
 * and the model can set every one of those eight axes from "maak deze woonkamer
 * modern en luxueus, warme verlichting, houten vloer".
 *
 * NOTE: this header does NOT ship. Everything inside js()'s returned template
 * literal does, including its comments — so no vendor name may appear in there.
 * scripts/faro-check.js enforces that, and caught exactly this mistake once.
 */

function js() {
  return `
/* ═══ Faro ════════════════════════════════════════════════ */
function T(k, fallback) {
  if (FARO_T && Object.prototype.hasOwnProperty.call(FARO_T, k)) return FARO_T[k];
  /* A missing key used to render its own name -- the context row literally read
     "ctx.images" in all four languages. Prefer a caller-supplied fallback, and
     otherwise show the last segment rather than the dotted key. */
  if (fallback) return fallback;
  var seg = String(k).split('.').pop();
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

/* Cmd/Ctrl + this opens Faro. K is already the CRM's lead search. The dock's
   badge is rendered from this same constant, so it cannot advertise a shortcut
   that does not work. */
var FARO_HOTKEY = 'j';

function faroHotkeyLabel() {
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  return (mac ? '⌘' : 'Ctrl+') + FARO_HOTKEY.toUpperCase();
}

var faroState = {
  open: false,
  panel: 'chat',
  conversationId: null,
  tier: 'standard',
  streaming: false,
  attachments: [],
  abort: null,
  contextSources: [],
  inThread: false,
  restoringFocus: false,
  lastSent: '',
  lastAttachments: [],
  lastFocus: null,
  // Where leaving Faro goes back to. Set when Faro is entered, never empty.
  returnPage: 'dashboard',
  conversationTitle: '',
  turnComponents: []
};

function faroEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function faroIcon(name, size) {
  var p = FARO_ICONS[name];
  if (!p) return '';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
         p + '</svg>';
}

/* ── Open / close ─────────────────────────────────────────────────────────
   Faro is a PAGE, not an overlay. Opening it is navigateTo('faro') and closing
   it is navigateTo(wherever you were) -- the same mechanism the CRM already
   uses for Dashboard or Pipeline, so there is no second show/hide system, no
   scrim, no z-index stack and no focus trap to get wrong.

   faroState.open is still the single source of truth for "is Faro showing",
   because plenty of code below needs to know; it is now kept in sync with the
   page rather than with a hidden attribute. faroSyncPage() is what the CRM's
   navigateTo() calls so that leaving Faro by ANY route -- a sidebar click, the
   back button, a deep link -- runs the same teardown as pressing Escape. */
function faroOpen() {
  if (faroState.open) return;

  // Where to go back to. Captured before navigating, and defaulted rather than
  // left empty: closing Faro must always land somewhere real, even if Faro was
  // the first page shown after login.
  faroState.returnPage = (window.state && state.currentPage && state.currentPage !== 'faro')
    ? state.currentPage : 'dashboard';

  // NOT the dock input. Restoring focus to it on close re-fires its own focus
  // handler, which reopens Faro on the same tick -- Faro became impossible to
  // leave by any route once entered from the dock, which is the primary way in.
  var active = document.activeElement;
  faroState.lastFocus = (active && active.id === 'faro-dock-input') ? null : active;

  if (typeof navigateTo === 'function') navigateTo('faro');
  faroSyncPage();

  var input = document.getElementById('faro-input-field');
  if (input) input.focus();
}

function faroClose() {
  if (!faroState.open) return;
  var back = faroState.returnPage || 'dashboard';
  if (typeof navigateTo === 'function') navigateTo(back);
  faroSyncPage();

  if (faroState.lastFocus && faroState.lastFocus.focus) {
    // Guard the restore: any element that opens Faro on focus would otherwise
    // re-trigger it here.
    faroState.restoringFocus = true;
    try { faroState.lastFocus.focus(); } catch (e) { /* detached node */ }
    faroState.restoringFocus = false;
  }
}

/* Reconcile Faro's own state with whichever page is actually showing. Called
   after every navigation, including ones Faro did not initiate -- that is the
   point. Idempotent, so calling it twice for one navigation is harmless. */
function faroSyncPage() {
  var el = document.getElementById('page-faro');
  var showing = !!(el && el.classList.contains('active'));
  if (showing === faroState.open) return;
  faroState.open = showing;

  document.body.classList.toggle('faro-open', showing);
  var cta = document.getElementById('faro-nav-cta');
  if (cta) cta.classList.toggle('active', showing);
  var opener = document.getElementById('faro-dock-open');
  if (opener) opener.setAttribute('aria-expanded', showing ? 'true' : 'false');

  if (showing) {
    faroApplyGreeting();
    /* Niets ophalen zolang er niemand ingelogd is.
       faroInit() draait op DOMContentLoaded, dus ook op het inlogscherm. Stond
       page-faro daar toevallig op 'active', dan vuurde dit drie verzoeken af
       naar /api/faro met niemand achter de knoppen. In de productielogs was dat
       152x een 401 -- ruis die precies lijkt op een kapotte sessie, en die het
       zoeken naar de echte inloglus flink vertroebeld heeft.

       De dashboard-app die zichtbaar is, is het eerlijkste signaal dat er
       iemand binnen is: die klasse wordt pas gezet nadat de sessie bevestigd
       is. */
    if (faroIngelogd()) {
      faroLoadConversations();
      faroLoadContext();
      faroLoadActivity();
    }
  } else if (faroState.abort) {
    // A generation in flight is abandoned rather than left running invisibly
    // against a page nobody is looking at.
    faroState.abort.abort();
    faroState.abort = null;
  }
}

/* Is er iemand ingelogd? De dashboard-app krijgt de klasse 'visible' pas nadat
   de sessie bevestigd is, dus dit is het signaal met de minste aannames --
   geen eigen kopie van de sessiestand die uit de pas kan lopen. */
function faroIngelogd() {
  var d = document.getElementById('dashboard-app');
  return !!(d && d.classList.contains('visible'));
}

function faroToggle() { faroState.open ? faroClose() : faroOpen(); }

function faroSetPanel(panel) {
  faroState.panel = panel;
  var showChat = panel === 'chat';

  ['images', 'videos', 'projects'].forEach(function (p) {
    var el = document.getElementById('faro-panel-' + p);
    if (el) el.hidden = panel !== p;
  });

  var landing = document.getElementById('faro-landing');
  var thread = document.getElementById('faro-thread');
  var composer = document.getElementById('faro-composer');
  var inThread = faroState.inThread;
  if (landing)  landing.hidden  = !showChat || inThread;
  // Re-resolved every time the landing appears: the clock moves and the CRM
  // fills #user-name asynchronously, so a once-at-init read would show
  // "Goedemiddag" at 9pm to whoever left the tab open.
  if (landing && !landing.hidden) faroApplyGreeting();
  if (thread)   thread.hidden   = !showChat || !inThread;
  if (composer) composer.hidden = !showChat || !inThread;

  document.querySelectorAll('.faro-rail__item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.faroPage === panel);
  });

  if (panel === 'images') faroLoadGallery('images');
  if (panel === 'videos') faroLoadGallery('videos');
  if (panel === 'projects') faroLoadProjects();
}

/* ── 11. Mascot state ─────────────────────────────────────────────────────
   Six states driven by what is actually happening. Sources are swapped; CSS
   handles the motion, which keeps it "extremely subtle" and the payload small.
   Only the idle asset exists today — a missing state falls back to idle rather
   than blanking the mascot. */
/* Er zit vandaag GEEN enkel mascotte-bestand in de repo: public/faro/ bestaat
   niet eens. De code hieronder ving dat al netjes af -- hij valt terug op de
   CSS-bol -- maar hij deed dat pas NA een mislukte request, en dus haalde elke
   sessie van elke klant een 404 op voordat hij het opgaf. Dat is geen kapotte
   pagina, wel een verzoek dat nooit iets kan opleveren, in het log van iedereen.

   Zet dit op true zodra de bestanden er zijn; dan doet de rest hieronder weer
   wat hij altijd al deed, inclusief de terugval per ontbrekende toestand.

   De bestanden staan er nu: public/faro/falcon-*.webp, zes toestanden, samen
   54 KB. Uitgesneden uit de renders in FARO_Helvaro_AI_Assets (achtergrond weg,
   echte alfa -- de drop-shadow in styles.js volgt die vorm, dus een vierkant
   beeld zou een vierkante gloed geven). Op hoogte genormaliseerd zodat de valk
   niet van formaat springt als de toestand wisselt. */
var FARO_MASCOT_ASSETS = true;

var FARO_MASCOT_SRC = {
  idle:       '/faro/falcon-idle.webp',
  thinking:   '/faro/falcon-thinking.webp',
  generating: '/faro/falcon-generating.webp',
  video:      '/faro/falcon-video.webp',
  success:    '/faro/falcon-success.webp',
  error:      '/faro/falcon-error.webp'
};
var faroMascotMissing = {};

function faroMascot(stateName) {
  // The orb carries the state whether or not the artwork exists -- it is the
  // mark on a checkout with an empty public/faro/, so it cannot depend on the
  // <img> being there.
  var mark = document.getElementById('faro-mark');
  if (mark) mark.dataset.state = stateName;

  var el = document.getElementById('faro-mascot');
  if (!el) return;
  el.dataset.state = stateName;
  if (!FARO_MASCOT_ASSETS) {
    // Geen bestanden aan boord: meteen de bol, zonder eerst een 404 te halen.
    el.classList.add('faro-mascot--missing');
    return;
  }
  var src = FARO_MASCOT_SRC[stateName];
  if (!src || faroMascotMissing[stateName]) return;
  /* De klasse staat vanaf de SERVER op de <img> (zie markup.js): zo vraagt een
     checkout zonder bestanden er ook geen op. Alleen: hier werd hij nooit meer
     weggehaald, dus zelfs mét bestanden bleef de mascotte onzichtbaar. Pas na
     een geslaagde load weghalen -- dan blijft een ontbrekend bestand nog steeds
     netjes verborgen in plaats van een gebroken-beeld-teken te tonen. */
  el.onload = function () { el.classList.remove('faro-mascot--missing'); };
  el.onerror = function () {
    // Clear the handler BEFORE the fallback assignment. Without this, idle's own
    // 404 re-entered this closure with stateName still set to the original
    // state, reassigned idle, and looped — measured at ~800 requests in seven
    // seconds against the current repo, where no mascot asset exists at all.
    el.onerror = null;
    faroMascotMissing[stateName] = true;
    if (stateName !== 'idle' && !faroMascotMissing.idle) {
      el.src = FARO_MASCOT_SRC.idle;
    } else {
      faroMascotMissing.idle = true;
      el.classList.add('faro-mascot--missing');
    }
  };
  el.src = src;
}

/* ── Greeting ────────────────────────────────────────────────────────────────
   A named, time-aware headline. The name is read from the CRM's own user chip
   rather than passed in: this module renders server-side, one request before
   the session is known, and reaching for the rendered DOM keeps the coupling
   to a single element id instead of a new contract. The placeholder the CRM
   ships with ("Gebruiker") is not a name and is treated as absent. */
var FARO_NAME_PLACEHOLDERS = ['gebruiker', 'user', 'client account', 'utilisateur', 'benutzer'];

function faroFirstName() {
  var raw = '';
  var el = document.getElementById('user-name');
  if (el) raw = (el.textContent || '').trim();
  if (!raw) { try { raw = (localStorage.getItem('hv-client') || '').trim(); } catch (e) { raw = ''; } }
  if (!raw || FARO_NAME_PLACEHOLDERS.indexOf(raw.toLowerCase()) !== -1) return '';
  var first = raw.split(/\\s+/)[0];
  // A company name ("Immo Vandenberghe BVBA") reads badly after "Goedemiddag,";
  // a single leading token is the safe half of it either way.
  return first.length > 24 ? '' : first;
}

function faroGreeting() {
  var h = new Date().getHours();
  var key = h < 12 ? 'land.greet.morning' : h < 18 ? 'land.greet.afternoon' : 'land.greet.evening';
  var name = faroFirstName();
  return T(key) + (name ? ', ' + name : '');
}

function faroApplyGreeting() {
  var head = document.getElementById('faro-greeting');
  var lead = document.getElementById('faro-landing-title');
  if (!head || !lead) return;
  var g = faroGreeting();
  if (!g) return;                       // no clock-free fallback needed: T() always returns something
  head.textContent = g;
  lead.hidden = false;                  // the question moves down a line, it does not disappear
}

/* ── Step list ───────────────────────────────────────────────────────────────
   One persistent row per tool the model runs, replacing a status line that
   overwrote itself. Rows are keyed by tool name, so a tool called twice in one
   turn updates its row instead of stacking a duplicate. */
function faroSteps(bubble) {
  var box = bubble.querySelector('.faro-steps');
  if (!box) {
    box = document.createElement('div');
    box.className = 'faro-steps';
    bubble.insertBefore(box, bubble.firstChild);
  }
  return box;
}

function faroStep(bubble, name, state) {
  var box = faroSteps(bubble);
  // \\w, not \w. This whole file is a template literal, so a lone \w is an
  // escape that collapses to a bare "w" -- making this [^w-], which strips
  // nearly every character. Every tool in a turn then produced the SAME id and
  // shared one row, so the step list silently reported only the last one.
  var id = 'step-' + String(name).replace(/[^\\w-]/g, '');
  var row = box.querySelector('[data-step="' + id + '"]');
  if (!row) {
    row = document.createElement('div');
    row.className = 'faro-step';
    row.setAttribute('data-step', id);
    // textContent for the label -- the tool name comes off the wire.
    row.innerHTML = '<span class="faro-step__mark"></span><span class="faro-step__label"></span>';
    row.querySelector('.faro-step__label').textContent = T('tool.' + name, name);
    box.appendChild(row);
  }
  row.dataset.state = state;
  faroScrollToEnd();
}

/* ── 7. Sending a message + streaming the answer ──────────────────────────── */
function faroSend(text) {
  if (faroState.streaming) return;
  text = String(text || '').trim();
  if (!text && !faroState.attachments.length) return;

  // Snapshot the attachments BEFORE clearing the composer. faroClearInput()
  // resets faroState.attachments, and the request body used to be built after
  // it ran — so every attached photo was silently dropped on the way out and
  // generate_property_image never received one. Read the state you are about
  // to reset, then reset it.
  var attachments = faroState.attachments.slice();

  faroEnterThread();
  faroAppendUser(text, attachments);
  faroClearInput();

  // Kept so the error card's Retry has something to resend. Retry re-sends the
  // TEXT rather than replaying the failed request, because a stream that died
  // part-way may already have persisted a partial assistant message; a fresh
  // turn is the only state we can reason about.
  faroState.lastSent = text;
  faroState.lastAttachments = attachments;

  faroState.streaming = true;
  faroSetSendEnabled(false);
  faroMascot('thinking');

  var bubble = faroAppendAssistant();
  var status = faroAppendStatus(bubble, T('st.thinking'));
  faroState.abort = new AbortController();

  fetch('/api/faro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'faro-chat',
      text: text,
      conversationId: faroState.conversationId,
      tier: faroState.tier,
      attachments: attachments,
      // Zolang de servertabellen niet bestaan is DIT de geschiedenis. De server
      // gebruikt hem alleen als hij het gesprek zelf niet kent en zijn opslag
      // niet beschikbaar is; kent hij het wel, dan wint de server altijd. Zie
      // clientHistory() in api/_faro/handler.js voor wat er overgenomen wordt.
      history: faroState.conversationId ? (faroLsMessages(faroState.conversationId) || []) : []
    }),
    signal: faroState.abort.signal
  })
    .then(function (r) {
      /* 429 apart. Zonder dit kreeg iemand die te snel klikte dezelfde melding
         als bij een crash -- met een knop "opnieuw proberen" die meteen weer
         faalt, want de limiet is nog niet voorbij. Dan lijkt de app stuk
         terwijl er niets stuk is.

         Ook niet als "opnieuw te proberen" gemarkeerd: de enige juiste actie is
         even wachten, en een knop die dat niet doet nodigt uit tot doorklikken. */
      if (r.status === 429) { var e = new Error('ratelimit'); e.faroCode = 'ratelimit'; throw e; }
      if (!r.ok || !r.body) throw new Error('stream');
      return faroReadStream(r.body, bubble, status);
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') return;
      var teSnel = err && err.faroCode === 'ratelimit';
      faroMascot('error');
      faroRenderComponent(bubble, {
        type: 'error',
        message: T(teSnel ? 'st.ratelimit' : 'st.error'),
        retryable: !teSnel
      });
    })
    .finally(function () {
      faroState.streaming = false;
      faroState.abort = null;
      faroSetSendEnabled(true);
      // A stream that ends without a done frame never cleared this, leaving the
      // mascot stuck in its error face until the next turn.
      setTimeout(function () { if (!faroState.streaming) faroMascot('idle'); }, 1800);
      if (status && status.parentNode) status.parentNode.removeChild(status);
    });
}

/* SSE reader. Frames are 'event: <name>\\ndata: <json>\\n\\n'; a chunk boundary
   can land anywhere, so the buffer is consumed only up to the last COMPLETE
   frame and the remainder carried forward. */
function faroReadStream(body, bubble, status) {
  var reader = body.getReader();
  var decoder = new TextDecoder();
  var buf = '';

  function pump() {
    return reader.read().then(function (res) {
      if (res.done) return;
      buf += decoder.decode(res.value, { stream: true });

      var parts = buf.split('\\n\\n');
      buf = parts.pop();

      parts.forEach(function (frame) {
        var name = null, data = null;
        frame.split('\\n').forEach(function (line) {
          if (line.indexOf('event: ') === 0) name = line.slice(7).trim();
          else if (line.indexOf('data: ') === 0) { try { data = JSON.parse(line.slice(6)); } catch (e) {} }
        });
        if (name) faroHandleEvent(name, data || {}, bubble, status);
      });
      return pump();
    });
  }
  return pump();
}

function faroHandleEvent(name, data, bubble, status) {
  switch (name) {
    case 'start':
      if (data.conversationId && !faroState.conversationId) {
        faroState.conversationId = data.conversationId;
        faroLoadConversations();
      }
      // The server's store is a scaffold and mints no id, so local history
      // would have nothing to file the turn under. Mint one here, 'local-'
      // prefixed so it is obvious which side owns it and so a future server id
      // can never collide with one of these.
      if (!faroState.conversationId) {
        faroState.conversationId = 'local-' + Date.now().toString(36) + '-'
          + Math.random().toString(36).slice(2, 8);
      }
      // Titled from the user's own first message: instant, free, predictable,
      // and the same rule store.js's deriveTitle() uses server-side.
      if (!faroState.conversationTitle) {
        var t0 = String(faroState.lastSent || '').trim().replace(/\\s+/g, ' ');
        faroState.conversationTitle = !t0 ? 'Nieuw gesprek'
          : (t0.length <= 48 ? t0 : t0.slice(0, 47) + '…');
      }
      if (data.model) {
        var ml = document.getElementById('faro-model-label');
        if (ml) ml.textContent = data.model;
      }
      break;

    case 'text':
      if (status) status.style.display = 'none';
      // textContent, never innerHTML — see this file's header.
      bubble.querySelector('.faro-msg__text').textContent += data.delta || '';
      faroScrollToEnd();
      break;

    case 'thinking':
      faroMascot(data.state === 'generating' ? 'generating' : 'thinking');
      break;

    case 'tool':
      // The generic spinner is for the phase BEFORE any tool is known. Once a
      // tool has a name there is a real row to show, so the spinner retires.
      if (status) status.style.display = 'none';
      if (data.name) faroStep(bubble, data.name, data.state || 'running');
      break;

    case 'component':
      faroSafeRender(bubble, data.component);
      // Kept alongside the rendered node so the turn can be written to local
      // history without reading the DOM back into component objects.
      if (data.component) (faroState.turnComponents = faroState.turnComponents || []).push(data.component);
      break;

    case 'error':
      faroMascot('error');
      faroRenderComponent(bubble, {
        type: 'error', message: data.message || T('st.error'), retryable: data.retryable
      });
      break;

    case 'done':
      faroMascot('success');
      setTimeout(function () { faroMascot('idle'); }, 1800);
      /* Het saldo meteen bijwerken. loadCreditUsage() zit op een rem van vier
         minuten en werd alleen door refreshData() aangeroepen, dat elke tien
         minuten draait -- dus een beurt kostte wel credits maar de teller in
         het CRM bleef staan tot je ergens anders heen klikte of verversde. Je
         zag je verbruik dus altijd te laag. force=true slaat de rem over; dit
         is een gebruikersactie, geen poll. */
      try { if (typeof loadCreditUsage === 'function') loadCreditUsage(true); } catch (e) {}
      faroLsSave(
        faroState.conversationId,
        faroState.conversationTitle,
        faroState.lastSent,
        (bubble.querySelector('.faro-msg__text') || {}).textContent || '',
        faroState.turnComponents || []
      );
      faroState.turnComponents = [];
      faroLoadConversations();
      break;
  }
}

/* ── Component rendering ──────────────────────────────────────────────────
   Fixed markup per type. An unknown type renders nothing rather than throwing,
   so an older cached page meeting a newer component degrades quietly. */
function faroRenderComponent(bubble, c) {
  if (!c || !c.type || !bubble) return;
  var wrap = bubble.querySelector('.faro-cards');
  if (!wrap) return;
  var el;
  switch (c.type) {
    case 'lead_card':     el = faroLeadCard(c); break;
    case 'property_card': el = faroPropertyCard(c); break;
    case 'stat_group':    el = faroStatGroup(c); break;
    case 'confirmation':  el = faroConfirmCard(c); break;
    case 'draft':         el = faroDraftCard(c); break;
    case 'media_job':     el = faroMediaCard(c); break;
    case 'error':         el = faroErrorCard(c); break;
    default: return;
  }
  wrap.appendChild(el);
  faroScrollToEnd();
}

/* Rendering one component must never kill the turn. Before this, a throw inside
   a card builder escaped the SSE pump, rejected the fetch chain and surfaced as
   a failed turn with a Retry — after the credits were already spent. */
function faroSafeRender(bubble, component) {
  try {
    faroRenderComponent(bubble, component);
  } catch (err) {
    console.error('[faro] component render failed:', err && err.message);
  }
}

function faroLeadCard(c) {
  var d = document.createElement('div');
  d.className = 'faro-card';
  d.innerHTML =
    '<div class="faro-card__name">' + faroEsc(c.name) + '</div>' +
    '<div class="faro-card__budget">' + faroEsc(c.budget) + '</div>' +
    '<div class="faro-card__meta">' + faroEsc(c.timeframe) + '</div>' +
    '<div class="faro-card__tags">' +
      '<span class="faro-tag">' + faroEsc(c.channel) + '</span>' +
      '<span class="faro-tag faro-tag--qualified">' + faroEsc(c.status) + '</span>' +
    '</div>' +
    '<div class="faro-card__actions">' +
      (c.actions || []).map(function (a, i) {
        return '<button class="faro-card__btn' + (i === 0 ? ' faro-card__btn--primary' : '') +
               '" data-lead="' + faroEsc(c.id) + '" data-act="' + faroEsc(a.key) + '">' +
               faroEsc(a.label) + '</button>';
      }).join('') +
    '</div>';

  // Reuses the CRM's own lead panel rather than building a second one —
  // requirement 17's "never need to leave Helvaro" is easiest to honour by not
  // duplicating the destination.
  d.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var lead = ((typeof state !== 'undefined' && state.leads) || []).find(function (l) {
      return String(l.id) === btn.dataset.lead;
    });
    if (!lead) return;
    // Close Faro and land on the record in the CRM underneath. No workspace to
    // leave — the page was there the whole time.
    faroClose();
    if (btn.dataset.act === 'thread') { navigateTo('gesprekken'); return; }
    navigateTo('dashboard');
    setTimeout(function () { if (typeof openPanel === 'function') openPanel(lead); }, 160);
  });
  return d;
}

/* ── 8. Confirmation gate ─────────────────────────────────────────────────
   Nothing outside Helvaro happens until this button is pressed. The card
   carries only an actionId; the payload stayed on the server. */
function faroConfirmCard(c) {
  var d = document.createElement('div');
  d.className = 'faro-card faro-card--confirm';
  d.innerHTML =
    '<div class="faro-card__name">' + faroEsc(c.title) + '</div>' +
    '<div class="faro-card__meta">' + faroEsc(c.body) + '</div>' +
    '<div class="faro-card__actions">' +
      '<button class="faro-card__btn faro-card__btn--primary" data-confirm="' + faroEsc(c.actionId) + '">' +
        faroEsc(c.confirmLabel || T('st.confirm')) + '</button>' +
      '<button class="faro-card__btn" data-cancel="1">' + faroEsc(c.cancelLabel || T('st.cancel')) + '</button>' +
    '</div>';

  d.addEventListener('click', function (e) {
    var cancel = e.target.closest('[data-cancel]');
    if (cancel) { d.remove(); return; }
    var go = e.target.closest('[data-confirm]');
    if (!go) return;
    var label = go.textContent;
    go.disabled = true;
    go.textContent = T('st.busy');
    faroPost({ mode: 'faro-confirm', actionId: go.dataset.confirm })
      .then(function (r) {
        d.classList.remove('faro-card--confirm');
        d.innerHTML = '<div class="faro-card__meta">' + faroEsc(r.summary || T('st.done')) + '</div>';
        faroMascot('success');
      })
      .catch(function (err) {
        go.disabled = false;
        go.textContent = label;
        var note = document.createElement('div');
        note.className = 'faro-card__meta';
        note.style.color = 'var(--error)';
        note.textContent = (err && err.message) || T('st.error');
        d.appendChild(note);
      });
  });
  return d;
}

function faroPropertyCard(c) {
  var d = document.createElement('div');
  d.className = 'faro-card';
  d.innerHTML =
    '<div class="faro-card__name">' + faroEsc(c.title) + '</div>' +
    '<div class="faro-card__meta">' + faroEsc(c.address) + '</div>' +
    '<div class="faro-card__budget">' + faroEsc(c.price) + '</div>';
  return d;
}

function faroStatGroup(c) {
  var d = document.createElement('div');
  d.className = 'faro-card';
  d.innerHTML = '<div class="faro-card__name">' + faroEsc(c.title) + '</div>' +
    (c.stats || []).map(function (s) {
      return '<div class="faro-card__meta">' + faroEsc(s.label) +
             ': <strong>' + faroEsc(s.value) + '</strong></div>';
    }).join('');
  return d;
}

function faroDraftCard(c) {
  var d = document.createElement('div');
  d.className = 'faro-card';
  d.innerHTML = '<div class="faro-card__name">' + faroEsc(c.title) + '</div>';
  var p = document.createElement('div');
  p.className = 'faro-card__meta';
  p.style.whiteSpace = 'pre-wrap';
  p.textContent = c.body || '';
  d.appendChild(p);
  return d;
}

function faroMediaCard(c) {
  var d = document.createElement('div');
  d.className = 'faro-media';
  d.dataset.job = c.jobId || '';

  if (c.state !== 'ready' || !c.resultUrl) {
    d.innerHTML = '<div class="faro-media__img faro-skeleton"></div>';
    if (c.jobId) faroPollJob(c.jobId, d);
    return d;
  }

  var fmt = (c.meta && c.meta.format) || '';
  var cls = 'faro-media__img' +
    (fmt === '9:16' ? ' faro-media__img--9-16' : fmt === '1:1' ? ' faro-media__img--1-1' : '');
  var before = (c.meta && c.meta.sourceUrl) || null;

  d.innerHTML =
    '<div class="faro-media__frame">' +
      (c.kind === 'video'
        ? '<video class="' + cls + '" src="' + faroEsc(c.resultUrl) + '" controls playsinline></video>'
        : '<img class="' + cls + '" src="' + faroEsc(c.resultUrl) + '" alt="">') +
      // The original photo is already stored alongside the result, so showing
      // the comparison costs nothing and it is the thing an agent actually
      // wants to see — "is this still recognisably my room?"
      (before ? '<button type="button" class="faro-media__ba" data-ba>' + T('md.before') + '</button>' : '') +
    '</div>' +
    '<div class="faro-media__bar">' + (c.actions || []).map(function (a) {
      return '<button class="faro-card__btn" data-media="' + faroEsc(a.key) + '">' + faroEsc(a.label) + '</button>';
    }).join('') +
    '<span class="faro-form__note" data-media-note></span></div>';

  if (before) {
    var img = d.querySelector('img, video');
    var btn = d.querySelector('[data-ba]');
    var showing = 'after';
    btn.addEventListener('click', function () {
      showing = showing === 'after' ? 'before' : 'after';
      img.src = showing === 'before' ? before : c.resultUrl;
      btn.textContent = showing === 'before' ? T('md.after') : T('md.before');
      btn.classList.toggle('active', showing === 'before');
    });
    // Preload so the first toggle is instant rather than a flash of nothing.
    var pre = new Image(); pre.src = before;
  }

  faroWireMediaActions(d, c);
  return d;
}

/* Media card buttons. Download and Preview work entirely client-side; the rest
   call their backend op and surface whatever the server says, so a button is
   honest today and becomes real with no UI change.

   This function was deleted in a refactor while its call site stayed, which
   made faroMediaCard throw a ReferenceError for every ready image — inside the
   SSE frame loop, so the whole turn failed and offered a Retry that would spend
   the credits again. It was invisible locally because generation cannot succeed
   without an API key, so a ready card never rendered. faro-check.js now asserts
   every function the client calls is defined. */
function faroWireMediaActions(card, c) {
  var note = card.querySelector('[data-media-note]');
  card.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-media]');
    if (!btn) return;
    var act = btn.dataset.media;

    if (act === 'download' && c.resultUrl) {
      var a = document.createElement('a');
      a.href = c.resultUrl;
      a.download = (c.meta && c.meta.filename) || ('helvaro-' + (c.jobId || 'asset'));
      a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    if (act === 'preview' && c.resultUrl) {
      var v = card.querySelector('video');
      if (v) { v.paused ? v.play() : v.pause(); return; }
      window.open(c.resultUrl, '_blank', 'noopener');
      return;
    }

    var op = act === 'save' ? 'save-to-property'
           : act === 'variation' ? (c.kind === 'video' ? 'generate-video' : 'generate-image')
           : null;
    if (!op) { if (note) note.textContent = T('pn.soon'); return; }

    btn.disabled = true;
    if (note) note.textContent = T('st.busy');
    faroPost({ mode: 'faro-media', op: op, jobId: c.jobId, propertyId: (c.meta && c.meta.propertyId) || null })
      .then(function (r) { btn.disabled = false; if (note) note.textContent = r.summary || T('st.done'); })
      .catch(function (err) { btn.disabled = false; if (note) note.textContent = (err && err.message) || T('st.error'); });
  });
}

function faroErrorCard(c) {
  var d = document.createElement('div');
  d.className = 'faro-card faro-card--error';
  d.innerHTML = '<div class="faro-card__meta">' + faroEsc(c.message) + '</div>' +
    (c.retryable ? '<div class="faro-card__actions"><button class="faro-card__btn" data-retry="1">' +
      T('st.retry') + '</button></div>' : '');

  // A Retry button that does nothing is worse than no Retry button.
  var btn = d.querySelector('[data-retry]');
  if (btn) btn.addEventListener('click', function () {
    var text = faroState.lastSent;
    if (!text) return;
    faroState.attachments = (faroState.lastAttachments || []).slice();
    // Drop the failed exchange so the thread does not accumulate dead turns.
    var msg = d.closest('.faro-msg--ai');
    if (msg) msg.remove();
    var prevUser = document.querySelectorAll('#faro-thread-inner .faro-msg--user');
    if (prevUser.length) prevUser[prevUser.length - 1].remove();
    faroSend(text);
  });
  return d;
}

/* ── 9/10. Media job polling ──────────────────────────────────────────────
   Generation exceeds the request window, so the card renders a skeleton and
   polls. Backs off so a stuck job does not hammer the endpoint. */
function faroPollJob(jobId, el, attempt) {
  attempt = attempt || 0;
  if (attempt > 60) return;
  setTimeout(function () {
    faroPost({ mode: 'faro-media', op: 'job', jobId: jobId })
      .then(function (r) {
        var job = r.job || {};
        if (job.state === 'ready')  { el.replaceWith(faroMediaCard(job)); return; }
        if (job.state === 'failed') { el.innerHTML = '<div class="faro-card__meta">' + T('st.failed') + '</div>'; return; }
        faroPollJob(jobId, el, attempt + 1);
      })
      .catch(function () { faroPollJob(jobId, el, attempt + 1); });
  }, Math.min(2000 + attempt * 500, 8000));
}

/* ── Thread plumbing ──────────────────────────────────────────────────────── */
function faroEnterThread() {
  var landing = document.getElementById('faro-landing');
  var thread = document.getElementById('faro-thread');
  var composer = document.getElementById('faro-composer');
  faroState.inThread = true;
  if (landing && !landing.hidden) {
    landing.hidden = true;
    thread.hidden = false;
    composer.hidden = false;
    // The input is MOVED, not duplicated — one element, one set of listeners.
    composer.querySelector('.faro-composer__inner').appendChild(document.getElementById('faro-input-form'));
  }
}

function faroAppendUser(text, attachments) {
  var d = document.createElement('div');
  d.className = 'faro-msg--user';

  // Thumbnails first, then the text — the user should see what they sent, and
  // an image-generation turn is meaningless without it.
  (attachments || []).forEach(function (a) {
    var img = document.createElement('img');
    img.className = 'faro-msg__thumb';
    img.src = 'data:' + a.mediaType + ';base64,' + a.data;
    img.alt = '';
    d.appendChild(img);
  });

  var t = document.createElement('div');
  t.textContent = text;
  d.appendChild(t);

  document.getElementById('faro-thread-inner').appendChild(d);
  faroScrollToEnd();
}

function faroAppendAssistant() {
  var d = document.createElement('div');
  d.className = 'faro-msg--ai';
  /* Klein merkteken bij een antwoord, zodat in een lange draad meteen te zien
     is wie er praat. Bewust het kop-icoon en niet de hele mascotte: op 22px is
     een heel figuurtje een vlek, en een avatar bij elk bericht mag het gesprek
     niet gaan domineren. Decoratief, dus aria-hidden -- de rol staat al in de
     tekst zelf. */
  d.innerHTML = '<img class="faro-msg__ai-avatar" src="/faro/faro-icon.webp" alt="" aria-hidden="true" width="22" height="22">'
              + '<div class="faro-msg__text"></div><div class="faro-cards"></div>';
  document.getElementById('faro-thread-inner').appendChild(d);
  return d;
}

function faroAppendStatus(bubble, label) {
  var s = document.createElement('div');
  s.className = 'faro-status';
  s.innerHTML = '<span class="faro-status__dot"></span><span class="faro-status__label"></span>';
  s.querySelector('.faro-status__label').textContent = label;
  bubble.insertBefore(s, bubble.firstChild);
  return s;
}

function faroScrollToEnd() {
  var t = document.getElementById('faro-thread');
  if (t) t.scrollTop = t.scrollHeight;
}

/* Tijdens het streamen was deze knop simpelweg uitgeschakeld: je kon niets
   sturen, niets afbreken, en Enter deed zwijgend niets. Een antwoord dat de
   verkeerde kant op gaat moest je uitzitten.

   Dezelfde knop wordt nu een stopknop. Dat lost twee dingen tegelijk op — je
   krijgt de controle terug, en het is meteen zichtbaar WAAROM je niet kunt
   versturen. */
function faroSetSendEnabled(on) {
  var b = document.getElementById('faro-send');
  var f = document.getElementById('faro-input-field');
  if (!b) return;
  if (faroState.streaming) {
    b.disabled = false;
    b.dataset.mode = 'stop';
    b.setAttribute('aria-label', T('in.stop'));
    b.title = T('in.stop');
    b.classList.add('faro-send--stop');
    b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>';
    return;
  }
  if (b.dataset.mode === 'stop') {
    b.dataset.mode = 'send';
    b.classList.remove('faro-send--stop');
    b.setAttribute('aria-label', T('in.send'));
    b.title = '';
    b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
  }
  b.disabled = !on || !((f && f.value.trim()) || faroState.attachments.length);
}

/* Afbreken op verzoek van de gebruiker. Anders dan het afbreken bij het sluiten
   van het paneel laat dit staan wat er al binnen was: een half antwoord is
   soms precies genoeg, en het weggooien voelt als straf voor het stoppen. */
function faroStop() {
  if (!faroState.streaming || !faroState.abort) return;
  try { faroState.abort.abort(); } catch (e) {}
  faroState.abort = null;
  faroState.streaming = false;
  faroSetSendEnabled(true);
  faroMascot('idle');
}

function faroClearInput() {
  var f = document.getElementById('faro-input-field');
  if (f) { f.value = ''; f.style.height = 'auto'; }
  faroState.attachments = [];
  faroRenderAttachments();
}

/* ── Data loading ─────────────────────────────────────────────────────────
   No CSRF header here: api/dashboard.js's fetch wrapper adds it. */
function faroPost(body) {
  /* Gordel naast de bretels. Elke achtergrondaanroep van Faro loopt hierlangs;
     komt er ooit een nieuwe loader bij die de controle hierboven vergeet, dan
     levert die geen 401-ruis meer op maar een stille, afgehandelde afwijzing. */
  if (!faroIngelogd()) return Promise.reject(new Error('niet ingelogd'));
  return fetch('/api/faro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error || T('st.error'));
      return j;
    });
  });
}

/* ── Local conversation history ───────────────────────────────────────────────
   Faro's server-side store (api/_faro/store.js) needs three tables on the VPS
   that do not exist yet, so every reload threw the conversation away. This
   keeps it in localStorage instead.

   What that honestly is: history for THIS browser. It does not follow you to
   your phone and a colleague does not see it. That is a real limitation, and
   the rail says so rather than implying sync. It is still the difference
   between "my chat from this morning is gone" and "it is where I left it".

   The server stays authoritative: faroLoadConversations merges and anything
   the server returns wins on id collision, so the day those tables exist this
   becomes a cache and nothing else has to change.

   Namespaced by project code, because one browser can sign into two tenants
   and one agency's conversation titles must never surface under another's. */
var FARO_LS_VERSION = 1;
var FARO_MAX_CONVOS = 25;
var FARO_MAX_MSGS = 60;

function faroLsKey() {
  var project = '';
  try { project = localStorage.getItem('hv-project') || ''; } catch (e) { project = ''; }
  return 'faro-convos-v' + FARO_LS_VERSION + ':' + (project || 'anon');
}

function faroLsRead() {
  try {
    var raw = localStorage.getItem(faroLsKey());
    var parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Corrupt, private mode, or hand-edited: behave as if there were no
    // history rather than breaking the panel.
    return [];
  }
}

function faroLsWrite(convos) {
  try {
    localStorage.setItem(faroLsKey(), JSON.stringify(convos.slice(0, FARO_MAX_CONVOS)));
    return true;
  } catch (e) {
    // Quota. Halve it and try once; a browser that still refuses simply gets no
    // local history, which is where we started.
    try {
      localStorage.setItem(faroLsKey(), JSON.stringify(convos.slice(0, Math.floor(FARO_MAX_CONVOS / 2))));
      return true;
    } catch (e2) { return false; }
  }
}

/** Record one completed exchange. Called after the turn ends, never mid-stream:
    a half-arrived assistant message is not worth restoring. */
function faroLsSave(id, title, userText, assistantText, components) {
  if (!id) return;
  var convos = faroLsRead();
  var found = null;
  for (var i = 0; i < convos.length; i++) if (convos[i].id === id) { found = convos[i]; break; }
  if (!found) {
    found = { id: id, title: title || userText || 'Gesprek', createdAt: Date.now(), messages: [] };
    convos.unshift(found);
  }
  found.updatedAt = Date.now();
  if (userText) found.messages.push({ role: 'user', text: userText });
  found.messages.push({ role: 'assistant', text: assistantText || '', components: components || [] });
  if (found.messages.length > FARO_MAX_MSGS) found.messages = found.messages.slice(-FARO_MAX_MSGS);

  convos.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  faroLsWrite(convos);
}

function faroLsList() {
  return faroLsRead().map(function (c) { return { id: c.id, title: c.title, local: true }; });
}

function faroLsMessages(id) {
  var convos = faroLsRead();
  for (var i = 0; i < convos.length; i++) if (convos[i].id === id) return convos[i].messages || [];
  return null;
}

function faroRenderConvoList(convos) {
  var list = document.getElementById('faro-convo-list');
  if (!list) return;
  list.innerHTML = convos.map(function (c) {
    return '<button class="faro-convo' + (c.id === faroState.conversationId ? ' active' : '') +
           '" data-convo="' + faroEsc(c.id) + '">' + faroEsc(c.title) + '</button>';
  }).join('');
}

function faroLoadConversations() {
  var list = document.getElementById('faro-convo-list');
  if (!list) return;

  // Local first, so the list is populated before the round trip rather than
  // flashing empty every time the panel opens.
  var local = faroLsList();
  faroRenderConvoList(local);

  faroPost({ mode: 'faro-conversations', op: 'list' })
    .then(function (r) {
      var server = r.conversations || [];
      // Server wins on id collision: once the VPS tables exist it is the source
      // of truth and the local copy is only a cache.
      var seen = {};
      server.forEach(function (c) { seen[c.id] = true; });
      faroRenderConvoList(server.concat(local.filter(function (c) { return !seen[c.id]; })));
    })
    .catch(function () { faroRenderConvoList(local); });
}

/* ── 6. Helvaro context ───────────────────────────────────────────────────
   Chips come from the backend's own source list, so the indicator cannot claim
   access the assistant does not have. */
function faroLoadContext() {
  var chips = document.getElementById('faro-context-chips');
  if (!chips) return;
  faroPost({ mode: 'faro-context' })
    .then(function (r) {
      faroState.contextSources = r.sources || [];
      chips.innerHTML = faroState.contextSources.filter(function (s) { return s.available; })
        .slice(0, 4)
        .map(function (s) {
          return '<span class="faro-context-chip">' + faroIcon('check', 11) + faroEsc(T('ctx.' + s.key, s.label)) + '</span>';
        }).join('');
      faroRenderContextToggles();
    })
    .catch(function () { chips.innerHTML = ''; });
}

function faroRenderContextToggles() {
  var box = document.getElementById('faro-context-toggles');
  if (!box) return;
  box.innerHTML = faroState.contextSources.map(function (s) {
    return '<div class="faro-context-toggle"><span>' + faroEsc(T('ctx.' + s.key, s.label)) + '</span>' +
           '<span class="faro-tag' + (s.available ? ' faro-tag--qualified' : '') + '">' +
           (s.available ? faroIcon('check', 11) : '—') + '</span></div>';
  }).join('');
}

/* ── Recent AI activity ───────────────────────────────────────────────────── */
function faroLoadActivity() {
  var track = document.getElementById('faro-activity-track');
  if (!track) return;
  track.innerHTML = '<div class="faro-act-card"><div class="faro-act-card__media faro-skeleton"></div></div>'.repeat(4);
  faroPost({ mode: 'faro-media', op: 'list-activity' })
    .then(function (r) {
      var items = r.activity || [];
      if (!items.length) {
        track.innerHTML = '<div class="faro-empty" style="flex:1">' + T('act.empty') + '</div>';
        return;
      }
      track.innerHTML = '';
      items.forEach(function (i) { track.appendChild(faroActivityCard(i)); });
      faroWireActivityNav();
    })
    .catch(function () { track.innerHTML = ''; });
}

/* Relative time, from the record's own timestamp rather than a pre-formatted
   string. The server used to send "5 min geleden" already rendered, which is
   wrong twice: it is a string that ages while the page is open, and it cannot
   be translated. */
function faroAgo(ms) {
  var t = Number(ms) || 0;
  if (!t) return '';
  var mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return T('ago.now');
  if (mins < 60) return T('ago.min').replace('{n}', mins);
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return T('ago.hour').replace('{n}', hrs);
  var days = Math.floor(hrs / 24);
  return T('ago.day').replace('{n}', days);
}

function faroActivityCard(a) {
  var d = document.createElement('div');
  d.className = 'faro-act-card';
  d.setAttribute('data-kind', a.kind || 'image');
  // Every card opens its gallery, whether or not the record carries a URL —
  // an id is enough, and a card that looks clickable and is not is worse than
  // one that never offered.
  var ref = a.url || a.id || '';
  if (ref) { d.setAttribute('role', 'button'); d.tabIndex = 0; d.setAttribute('data-act-open', ref); }

  var media;
  if (a.kind === 'text') {
    media = '<div class="faro-act-card__media faro-act-card__media--text">' +
              '<span class="faro-act-card__badge">' + faroEsc(T('kind.text')) + '</span>' +
              '<p class="faro-act-card__excerpt">' + faroEsc(a.excerpt || '') + '</p>' +
            '</div>';
  } else {
    /* The image itself is the card. loading="lazy" because a landing screen
       can carry a dozen of these and none of them is above the fold on a
       phone; the onerror leaves the badge on a plain surface rather than a
       browser's broken-image glyph. */
    media = '<div class="faro-act-card__media">' +
      (a.thumbUrl
        ? '<img src="' + faroEsc(a.thumbUrl) + '" alt="" loading="lazy" ' +
          'onerror="this.remove()">'
        : '') +
      '<span class="faro-act-card__badge">' +
        faroEsc(T(a.kind === 'video' ? 'kind.video' : 'kind.image')) + '</span>' +
      (a.kind === 'video'
        ? '<span class="faro-act-card__play" aria-hidden="true">' + faroIcon('play', 13) + '</span>' +
          (a.duration ? '<span class="faro-act-card__dur">' + faroEsc(a.duration) + '</span>' : '')
        : '') +
      '</div>';
  }

  // Subtitle is assembled here, not sent pre-rendered: the property and the
  // age are two facts, and only one of them ages while the page is open.
  var sub = [a.subtitle, faroAgo(a.createdAt)].filter(Boolean).join(' · ');

  d.innerHTML = media +
    '<div class="faro-act-card__meta">' +
      '<div class="faro-act-card__title">' + faroEsc(a.title) + '</div>' +
      (sub ? '<div class="faro-act-card__sub">' + faroEsc(sub) + '</div>' : '') +
    '</div>';
  return d;
}

/* The carousel. One card-width per press, and the arrow hides at the end
   rather than sitting there doing nothing — a control that no longer works but
   still looks like a control is worse than no control. */
function faroWireActivityNav() {
  var track = document.getElementById('faro-activity-track');
  var next = document.getElementById('faro-activity-next');
  if (!track || !next || next.dataset.wired) return;
  next.dataset.wired = '1';

  var step = function () {
    var card = track.querySelector('.faro-act-card');
    return card ? card.getBoundingClientRect().width + 14 : 240;
  };
  var sync = function () {
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    var fits = track.scrollWidth <= track.clientWidth + 4;
    next.hidden = fits;
    next.setAttribute('data-at-end', atEnd ? '1' : '0');
  };

  next.addEventListener('click', function () {
    // Wrap at the end, so the arrow keeps meaning something on a short list.
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    track.scrollBy({ left: atEnd ? -track.scrollLeft : step(), behavior: 'smooth' });
  });
  track.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  sync();
}

/* ── 9/10. Beelden & Video's — galleries, not generators ──────────────────
   Generation happens in the chat; these panels are where you go to LOOK at
   what you already made. See this module's file header for why.

   Listing still goes through /api/leads property-list — the same endpoint the
   old AI-beeld page used. */
function faroLeadsPost(body) {
  var headers = { 'Content-Type': 'application/json' };
  if (typeof state !== 'undefined' && state.apiKey) headers['x-api-key'] = state.apiKey;
  return fetch(API_BASE + '/leads', { method: 'POST', headers: headers, body: JSON.stringify(body) })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.message || j.error || T('st.error'));
        return j;
      });
    });
}

/* An empty gallery has to teach, not just say "nothing here" — the whole point
   of the move is that the user may not know generation now lives in the chat. */
function faroGalleryEmpty(kind) {
  var d = document.createElement('div');
  d.className = 'faro-empty faro-empty--cta';
  d.innerHTML =
    '<div class="faro-empty__title">' + faroEsc(T(kind === 'videos' ? 'gal.emptyVideo' : 'gal.emptyImage')) + '</div>' +
    '<div class="faro-empty__hint">' + faroEsc(T(kind === 'videos' ? 'gal.hintVideo' : 'gal.hintImage')) + '</div>' +
    (kind === 'images'
      ? '<button class="faro-card__btn faro-card__btn--primary" data-goto-chat>' + T('gal.ask') + '</button>'
      : '');
  var go = d.querySelector('[data-goto-chat]');
  if (go) go.addEventListener('click', function () {
    faroSetPanel('chat');
    var f = document.getElementById('faro-input-field');
    if (f) { f.value = T('gal.seed'); f.focus(); faroSetSendEnabled(true); }
  });
  return d;
}

function faroClearEmpty(el) {
  var e = el.parentNode && el.parentNode.querySelector('.faro-empty');
  if (e) e.remove();
}

function faroLoadGallery(kind) {
  var el = document.getElementById('faro-' + kind + '-gallery');
  var box = document.getElementById('faro-' + kind + '-empty');
  if (!el) return;
  if (box) box.innerHTML = '';
  el.innerHTML = '<div class="faro-media"><div class="faro-media__img faro-skeleton"></div></div>'.repeat(3);

  var load = kind === 'images'
    ? faroLeadsPost({ mode: 'property-list' }).then(function (r) {
        return (r.images || []).map(function (i) {
          return { jobId: i.id, kind: 'image', state: 'ready', resultUrl: i.url, meta: {},
                   actions: [{ key: 'download', label: T('st.download') }] };
        });
      })
    : faroPost({ mode: 'faro-media', op: 'list-videos' }).then(function (r) { return r.videos || []; });

  load
    .then(function (items) {
      el.innerHTML = '';
      if (!items.length) { if (box) box.appendChild(faroGalleryEmpty(kind)); return; }
      items.forEach(function (i) { el.appendChild(faroMediaCard(i)); });
    })
    .catch(function (err) {
      el.innerHTML = '';
      if (box) {
        var e = document.createElement('div');
        e.className = 'faro-empty';
        e.textContent = (err && err.message) || T('st.error');
        box.appendChild(e);
      }
    });
}

function faroLoadProjects() {
  var el = document.getElementById('faro-projects-list');
  if (!el) return;
  faroPost({ mode: 'faro-projects', op: 'list' })
    .then(function (r) {
      var ps = r.projects || [];
      el.innerHTML = ps.length
        ? ps.map(function (p) {
            return '<div class="faro-card"><div class="faro-card__name">' + faroEsc(p.name) + '</div>' +
                   '<div class="faro-card__meta">' + faroEsc(p.subtitle || '') + '</div></div>';
          }).join('')
        : '<div class="faro-empty">' + T('act.empty') + '</div>';
    })
    .catch(function () { el.innerHTML = ''; });
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */
function faroInit() {
  /* De mascotte in zijn rusttoestand zetten. Dit werd nergens gedaan: de <img>
     komt met de klasse faro-mascot--missing van de server -- zodat een checkout
     zonder bestanden er geen enkele ophaalt -- en alleen faroMascot() haalt hem
     er weer af. Die werd echter pas aangeroepen bij een toestandswissel
     (denken, fout, succes), dus met de bestanden aan boord bleef de mascotte
     onzichtbaar tot je een vraag stelde. Niet in faroOpen(): die keert meteen
     terug als het paneel al open is, en dat is bij het laden van de pagina het
     geval. */
  faroMascot('idle');

  // ── Dock ────────────────────────────────────────────────────────────────
  // Typing here is the primary way in. Enter opens Faro AND sends, so the
  // first question never costs a round trip through an empty screen.
  var dockInput = document.getElementById('faro-dock-input');
  var dockOpen  = document.getElementById('faro-dock-open');
  var dockKbd   = document.getElementById('faro-dock-kbd');

  function fromDock(send) {
    var text = dockInput ? dockInput.value.trim() : '';
    if (dockInput) dockInput.value = '';
    faroOpen();
    if (send && text) {
      faroSetPanel('chat');
      // Let the overlay paint before the stream starts, or the first tokens
      // land in a panel the user has not seen yet.
      setTimeout(function () { faroSend(text); }, 60);
    } else if (text) {
      var f = document.getElementById('faro-input-field');
      if (f) { f.value = text; f.focus(); faroSetSendEnabled(true); }
    }
  }

  if (dockKbd) dockKbd.textContent = faroHotkeyLabel();
  if (dockOpen) dockOpen.addEventListener('click', function () { fromDock(true); });
  if (dockInput) {
    dockInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); fromDock(true); }
      if (e.key === 'Escape') dockInput.blur();
    });
    // Clicking the bar opens Faro without sending, carrying anything typed.
    dockInput.addEventListener('focus', function () {
      if (!faroState.open && !faroState.restoringFocus) fromDock(false);
    });
  }


  /* ── CRM / AI switch ─────────────────────────────────────────────────────
     Move the rail OUT of the Faro page and INTO the CRM sidebar, once, on
     boot. Before this, Faro's rail and the CRM nav were two separate columns
     visible at the same time; the app looked like it had two sidebars because
     it did. Moving it means the two navs are siblings in one column and the
     mode decides which is displayed -- no duplicated markup, and every
     listener already bound to the rail keeps working because it is the same
     element, not a copy. */
  var hvSidebar = document.querySelector('.sidebar');
  var hvNav     = document.querySelector('.sidebar-nav');
  var hvRail    = document.querySelector('.faro-rail');
  if (hvSidebar && hvNav && hvRail && hvRail.parentNode !== hvSidebar) {
    hvNav.parentNode.insertBefore(hvRail, hvNav.nextSibling);
  }

  var HV_MODE_KEY = 'hv-mode';

  function hvSetMode(mode, navigate, persist) {
    var ai = mode === 'ai';
    document.body.classList.toggle('hv-mode-ai', ai);
    document.body.classList.toggle('hv-mode-crm', !ai);

    var tabs = document.querySelectorAll('.hv-switch__tab');
    for (var i = 0; i < tabs.length; i++) {
      var on = tabs[i].getAttribute('data-mode') === mode;
      tabs[i].classList.toggle('active', on);
      tabs[i].setAttribute('aria-checked', on ? 'true' : 'false');
      // Roving tabindex: a radiogroup is ONE tab stop, arrows move inside it.
      tabs[i].setAttribute('tabindex', on ? '0' : '-1');
    }
    /* Only an explicit choice is remembered. Writing on the boot restore too
       turned "no preference yet" into "CRM" on the very first load: this ran
       before startDashboard read the key, so the default home page silently
       stopped being Faro for every new user. */
    if (persist) { try { localStorage.setItem(HV_MODE_KEY, mode); } catch (e) {} }

    if (!navigate) return;
    if (ai) { faroOpen(); return; }
    // Leaving AI returns you to the CRM page you were last on, not always the
    // dashboard -- switching away and back should not lose your place.
    var back = faroState.lastCrmPage || 'dashboard';
    if (typeof navigateTo === 'function') navigateTo(back);
  }
  window.hvSetMode = hvSetMode;

  var hvTabs = document.querySelectorAll('.hv-switch__tab');
  for (var ti = 0; ti < hvTabs.length; ti++) {
    hvTabs[ti].addEventListener('click', function () {
      hvSetMode(this.getAttribute('data-mode'), true, true);
    });
    hvTabs[ti].addEventListener('keydown', function (e) {
      var k = e.key;
      if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'ArrowUp' && k !== 'ArrowDown') return;
      e.preventDefault();
      var next = this.getAttribute('data-mode') === 'crm' ? 'ai' : 'crm';
      hvSetMode(next, true, true);
      var el = document.getElementById('hv-switch-' + next);
      if (el) el.focus();
    });
  }

  // Land where you left off. Guarded: a stored 'ai' is worthless if Faro is
  // not actually on this page.
  var hvStored = null;
  try { hvStored = localStorage.getItem(HV_MODE_KEY); } catch (e) {}
  if (hvStored === 'ai' && !document.getElementById('page-faro')) hvStored = null;
  /* navigate:true in BOTH directions, deliberately: setting the mode without
     moving the page would leave the CRM nav next to whatever section happened
     to carry .active in the markup (Faro's page ships with it, being the home
     screen). The switch and the content have to agree.

     This does NOT fight the setup redirect in dashboard.js, which sends a
     tenant with incomplete AI config to AI Persoonlijkheid on a 300ms timer.
     That runs after this and still wins, which is right -- finishing setup
     matters more than restoring the last mode. */
  if (hvStored) {
    hvSetMode(hvStored, true, false);
  } else {
    // No preference yet: paint a mode class so the sidebar is not unstyled,
    // but let startDashboard choose the landing page (Faro). The navigateTo
    // wrapper above then moves the switch to match whatever it picked.
    hvSetMode('crm', false, false);
  }

  /* Faro is shown by the CRM's navigateTo(), which knows nothing about Faro.
     Wrapping it is what makes leaving by ANY route -- a sidebar click, a
     button deep in a lead panel, the topbar logo -- run the same teardown as
     pressing Escape. Wrapped rather than edited so dashboard.js keeps one
     definition of navigateTo and Faro stays removable in one piece. */
  if (typeof window.navigateTo === 'function' && !window.navigateTo.__faroWrapped) {
    var crmNavigate = window.navigateTo;
    window.navigateTo = function (page) {
      // Remember the last CRM page so the switch can bring you back to it.
      if (page !== 'faro') faroState.lastCrmPage = page;
      var out = crmNavigate.apply(this, arguments);
      faroSyncPage();
      // Any route into or out of Faro -- a lead panel button, the topbar
      // logo, a hotkey -- moves the switch with it, so the control never
      // disagrees with the page you are looking at.
      if (typeof window.hvSetMode === 'function') {
        window.hvSetMode(page === 'faro' ? 'ai' : 'crm', false);
      }
      return out;
    };
    window.navigateTo.__faroWrapped = true;
  }

  // Mobile: the rail is a drawer. Picking anything inside it closes it again,
  // or it would sit on top of the thing you just navigated to.
  // Reaches the old ai-beeld page for its before/after slider and PDF export —
  // the two things not ported into Faro. Remove with the page once they are.
  var adv = document.getElementById('faro-img-advanced');
  if (adv) adv.addEventListener('click', function () { faroClose(); navigateTo('ai-beeld'); });

  var railToggle = document.getElementById('faro-rail-toggle');
  var rail = document.querySelector('.faro-rail');
  if (railToggle && rail) {
    railToggle.addEventListener('click', function () { rail.classList.toggle('open'); });
    rail.addEventListener('click', function (e) {
      if (e.target.closest('[data-faro-page], [data-convo], #faro-new-convo')) rail.classList.remove('open');
    });
  }

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === FARO_HOTKEY) {
      e.preventDefault(); faroToggle(); return;
    }
    if (e.key === 'Escape' && faroState.open) {
      // Let an open popover inside Faro close first.
      var menu = document.querySelector('.faro-menu:not([hidden])');
      if (menu) return;
      // Escape leaves Faro and lands back where you came from. On a page this
      // is a convenience rather than the only way out, which is the point.
      faroClose();
    }
  });

  var form = document.getElementById('faro-input-form');
  var field = document.getElementById('faro-input-field');

  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var b = document.getElementById('faro-send');
    if (b && b.dataset.mode === 'stop') { faroStop(); return; }
    faroSend(field.value);
  });

  if (field) {
    field.addEventListener('input', function () {
      field.style.height = 'auto';
      field.style.height = Math.min(field.scrollHeight, 200) + 'px';
      faroSetSendEnabled(true);
    });
    // Enter sends, Shift+Enter breaks the line — the convention users expect.
    field.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); faroSend(field.value); }
    });
  }

  document.querySelectorAll('[data-quick]').forEach(function (b) {
    b.addEventListener('click', function () { faroQuickAction(b.dataset.quick); });
  });

  document.querySelectorAll('[data-faro-page]').forEach(function (b) {
    b.addEventListener('click', function () { faroSetPanel(b.dataset.faroPage); });
  });

  /* Recent-activity cards. An image opens the Beelden panel — the gallery is
     where assets live, and dropping someone onto a raw blob URL loses every
     control around it. */
  document.addEventListener('click', function (e) {
    var card = e.target.closest && e.target.closest('[data-act-open]');
    if (!card) return;
    var kind = card.getAttribute('data-kind');
    faroSetPanel(kind === 'video' ? 'videos' : 'images');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var card = e.target && e.target.closest && e.target.closest('[data-act-open]');
    if (!card) return;
    e.preventDefault();
    faroSetPanel(card.getAttribute('data-kind') === 'video' ? 'videos' : 'images');
  });

  var nc = document.getElementById('faro-new-convo');
  if (nc) nc.addEventListener('click', faroNewConversation);

  var list = document.getElementById('faro-convo-list');
  if (list) list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-convo]');
    if (b) faroOpenConversation(b.dataset.convo);
  });

  var next = document.getElementById('faro-activity-next');
  if (next) next.addEventListener('click', function () {
    var tr = document.getElementById('faro-activity-track');
    if (tr) tr.scrollBy({ left: tr.clientWidth * 0.8, behavior: 'smooth' });
  });

  faroWireUploads();
  faroWireContextPanel();
  faroWireModelPicker();

  // Deliberately NOT restored across reloads. A workspace is a place you live
  // in; an overlay is something you opened. Re-opening it on every page load
  // would put Faro in front of the CRM the user actually came back for.
}

function faroQuickAction(id) {
  var a = FARO_QUICK_ACTIONS[id];
  if (!a) return;
  faroOpen();
  if (a.panel) { faroSetPanel(a.panel); return; }
  faroSetPanel('chat');
  // promptKey i.p.v. een vaste zin: de prompt komt als het bericht van de
  // gebruiker in de draad, dus hij hoort in diens eigen taal te staan.
  faroSend(a.promptKey ? T(a.promptKey) : a.prompt);
}

function faroNewConversation() {
  if (faroState.abort) faroState.abort.abort();
  faroState.conversationId = null;
  faroState.conversationTitle = '';
  faroState.turnComponents = [];
  faroState.inThread = false;

  var inner = document.getElementById('faro-thread-inner');
  if (inner) inner.innerHTML = '';
  document.getElementById('faro-thread').hidden = true;
  document.getElementById('faro-composer').hidden = true;

  var landing = document.getElementById('faro-landing');
  landing.hidden = false;
  // Move the input back above the context row, where it started.
  var target = landing.querySelector('.faro-landing__inner');
  target.insertBefore(document.getElementById('faro-input-form'),
                      target.querySelector('.faro-context-row'));

  faroMascot('idle');
  faroSetPanel('chat');
  faroLoadConversations();
  var f = document.getElementById('faro-input-field');
  if (f) f.focus();
}

function faroOpenConversation(id) {
  faroState.conversationId = id;
  // Carry the existing title, so continuing a thread does not retitle it from
  // whatever the next message happens to say.
  faroState.conversationTitle = (faroLsList().filter(function (c) { return c.id === id; })[0] || {}).title || '';
  faroState.turnComponents = [];
  faroState.inThread = true;
  faroSetPanel('chat');
  faroEnterThread();
  var inner = document.getElementById('faro-thread-inner');
  inner.innerHTML = '<div class="faro-skeleton" style="height:60px"></div>';
  var render = function (messages) {
    inner.innerHTML = '';
    (messages || []).forEach(function (m) {
      if (m.role === 'user') { faroAppendUser(m.text || ''); return; }
      var b = faroAppendAssistant();
      b.querySelector('.faro-msg__text').textContent = m.text || '';
      (m.components || []).forEach(function (c) { faroSafeRender(b, c); });
    });
    faroLoadConversations();
  };

  faroPost({ mode: 'faro-messages', conversationId: id })
    .then(function (r) {
      // An empty server response means "not stored there", not "empty
      // conversation" -- the store is a scaffold. Fall through to the local
      // copy rather than showing a blank thread for something the user can
      // plainly see in the list.
      var server = r.messages || [];
      render(server.length ? server : (faroLsMessages(id) || []));
    })
    .catch(function () { render(faroLsMessages(id) || []); });
}

/* ── 15. Uploads + drag-and-drop ──────────────────────────────────────────── */
function faroWireUploads() {
  var input = document.getElementById('faro-file-input');
  var btn = document.getElementById('faro-btn-attach');
  var form = document.getElementById('faro-input-form');
  if (!input || !form) return;

  if (btn) btn.addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { faroAcceptFiles(input.files); input.value = ''; });

  ['dragenter', 'dragover'].forEach(function (ev) {
    form.addEventListener(ev, function (e) { e.preventDefault(); form.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    form.addEventListener(ev, function (e) { e.preventDefault(); form.classList.remove('dragover'); });
  });
  form.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) faroAcceptFiles(e.dataTransfer.files);
  });
}

function faroAcceptFiles(files) {
  var rejected = 0;
  Array.prototype.slice.call(files).forEach(function (f) {
    if (faroState.attachments.length >= 6) { rejected++; return; }
    if (!/^image\\//.test(f.type)) { rejected++; return; }
    var reader = new FileReader();
    reader.onload = function () {
      faroState.attachments.push({
        mediaType: f.type,
        data: String(reader.result).split(',')[1],
        name: f.name,
        // De data-URL bewaren voor het miniatuurtje. Kost niets extra: hij is
        // er al, en de bytes gaan toch mee in het verzoek.
        preview: String(reader.result),
      });
      faroRenderAttachments();
      faroSetSendEnabled(true);
    };
    reader.readAsDataURL(f);
  });
  // Stil weigeren laat je raden waarom je pdf niet verschijnt.
  if (rejected) {
    var msg = faroState.attachments.length >= 6
      ? 'Maximaal 6 afbeeldingen per bericht.'
      : 'Alleen afbeeldingen kunnen mee.';
    if (typeof toast === 'function') { try { toast(msg, 'info'); } catch (e) {} }
  }
}

/* De strip werd één keer opgebouwd bij het toevoegen, zonder manier om iets
   weg te halen: verkeerde foto erbij betekende het hele bericht opnieuw
   beginnen. Nu wordt hij uit de state hertekend, zodat de indexen na een
   verwijdering blijven kloppen. */
function faroRenderAttachments() {
  var strip = document.getElementById('faro-attachments');
  if (!strip) return;
  strip.innerHTML = '';
  faroState.attachments.forEach(function (a, i) {
    var chip = document.createElement('span');
    chip.className = 'faro-tag faro-attach';

    if (a.preview) {
      var img = document.createElement('img');
      img.className = 'faro-attach__thumb';
      img.src = a.preview;
      img.alt = '';
      chip.appendChild(img);
    }

    var label = document.createElement('span');
    label.className = 'faro-attach__name';
    label.textContent = a.name || 'afbeelding';
    chip.appendChild(label);

    var rm = document.createElement('button');
    rm.type = 'button';
    rm.className = 'faro-attach__rm';
    rm.setAttribute('data-remove', String(i));
    rm.setAttribute('aria-label', 'Verwijder ' + (a.name || 'afbeelding'));
    rm.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    rm.addEventListener('click', function () {
      faroState.attachments.splice(i, 1);
      faroRenderAttachments();
      faroSetSendEnabled(true);
    });
    chip.appendChild(rm);

    strip.appendChild(chip);
  });
}

/* ── Model selector ───────────────────────────────────────────────────────
   Capability tiers, not model names: the user picks "Snel" or "Precies" and
   config.js alone knows which vendor model that resolves to (requirement 13).
   The list is injected server-side as FARO_TIERS. */
function faroWireModelPicker() {
  var btn = document.getElementById('faro-model-btn');
  if (!btn) return;

  faroState.tier = FARO_DEFAULT_TIER;
  var pop = document.createElement('div');
  pop.className = 'faro-menu';
  pop.hidden = true;
  pop.setAttribute('role', 'listbox');
  pop.innerHTML = FARO_TIERS.map(function (t) {
    return '<button type="button" class="faro-menu__item" role="option" data-tier="' + faroEsc(t.key) + '">' +
             '<span class="faro-menu__label">' + faroEsc(t.short) + '</span>' +
             '<span class="faro-menu__hint">' + faroEsc(t.hint) + '</span>' +
           '</button>';
  }).join('');
  btn.parentNode.insertBefore(pop, btn.nextSibling);

  function setTier(key) {
    var t = FARO_TIERS.filter(function (x) { return x.key === key; })[0];
    if (!t) return;
    faroState.tier = key;
    var lbl = document.getElementById('faro-model-label');
    if (lbl) lbl.textContent = t.label;
    pop.querySelectorAll('.faro-menu__item').forEach(function (i) {
      i.classList.toggle('active', i.dataset.tier === key);
    });
  }
  setTier(FARO_DEFAULT_TIER);

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    btn.setAttribute('aria-expanded', pop.hidden ? 'false' : 'true');
  });
  pop.addEventListener('click', function (e) {
    var i = e.target.closest('[data-tier]');
    if (!i) return;
    setTier(i.dataset.tier);
    pop.hidden = true;
  });
  // Click-away. Registered once, on document, rather than per-open.
  document.addEventListener('click', function (e) {
    if (pop.hidden) return;
    if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) pop.hidden = true;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !pop.hidden) pop.hidden = true;
  });
}

/* ── 6. Manage panel ──────────────────────────────────────────────────────
   The design's "Manage" button. Currently read-only: it shows what Faro
   can reach. Making the toggles WRITABLE means a disabled source must cause the
   orchestrator to withhold the matching tools, not merely hide a chip —
   otherwise the control is decorative. That is a backend change, not a UI one. */
function faroWireContextPanel() {
  var btn = document.getElementById('faro-context-btn');
  var panel = document.getElementById('faro-context-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', function () {
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.hidden = open;
    if (!open && !faroState.contextSources.length) faroLoadContext();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', faroInit);
else faroInit();
`;
}

module.exports = { js };
