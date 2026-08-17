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
 */

function js() {
  return `
/* ═══ Faro ════════════════════════════════════════════════ */
function T(k) {
  return (FARO_T && Object.prototype.hasOwnProperty.call(FARO_T, k)) ? FARO_T[k] : k;
}

/* Cmd/Ctrl + this opens Faro. K is already the CRM's lead search. */
var FARO_HOTKEY = 'j';

var faroState = {
  open: false,
  panel: 'chat',
  conversationId: null,
  tier: 'standard',
  streaming: false,
  attachments: [],
  abort: null,
  contextSources: [],
  lastSent: '',
  lastFocus: null
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
   Faro opens ON TOP of the CRM. Nothing about the page underneath changes: no
   nav is hidden, no .page is deactivated, no title is rewritten. Close it and
   you are exactly where you were, mid-scroll, with the same lead panel open.

   That is the whole difference from the workspace switcher this replaces —
   there is no second mode to be in, and no state to restore on the way back. */
function faroOpen() {
  if (faroState.open) return;
  faroState.open = true;

  var el = document.getElementById('faro-overlay');
  var launch = document.getElementById('faro-launch');
  if (!el) return;

  // Remember what had focus so Escape can hand it back — the launcher is in the
  // topbar, and a keyboard user who opened with ⌘K should not be dumped at the
  // top of the document on close.
  faroState.lastFocus = document.activeElement;

  el.hidden = false;
  // Next frame, so the transition has a from-state to animate out of.
  requestAnimationFrame(function () { el.classList.add('open'); });
  document.body.classList.add('faro-open');
  if (launch) launch.setAttribute('aria-expanded', 'true');

  faroLoadConversations();
  faroLoadContext();
  faroLoadActivity();

  var input = document.getElementById('faro-input-field');
  if (input) input.focus();
}

function faroClose() {
  if (!faroState.open) return;
  faroState.open = false;

  var el = document.getElementById('faro-overlay');
  var launch = document.getElementById('faro-launch');
  if (el) {
    el.classList.remove('open');
    // Wait out the transition before hiding, or the panel vanishes instead of
    // fading. Matches the 180ms in styles.js.
    setTimeout(function () { if (!faroState.open) el.hidden = true; }, 180);
  }
  document.body.classList.remove('faro-open');
  if (launch) launch.setAttribute('aria-expanded', 'false');

  // A generation in flight is abandoned rather than left running invisibly.
  if (faroState.abort) { faroState.abort.abort(); faroState.abort = null; }

  if (faroState.lastFocus && faroState.lastFocus.focus) faroState.lastFocus.focus();
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
  var inThread = Boolean(faroState.conversationId);
  if (landing)  landing.hidden  = !showChat || inThread;
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
  var el = document.getElementById('faro-mascot');
  if (!el) return;
  el.dataset.state = stateName;
  var src = FARO_MASCOT_SRC[stateName];
  if (!src || faroMascotMissing[stateName]) return;
  el.onerror = function () {
    // Remember the gap so we stop re-requesting a 404 on every state change.
    faroMascotMissing[stateName] = true;
    if (stateName !== 'idle') el.src = FARO_MASCOT_SRC.idle;
    else el.classList.add('faro-mascot--missing');
  };
  el.src = src;
}

/* ── 7. Sending a message + streaming the answer ──────────────────────────── */
function faroSend(text) {
  if (faroState.streaming) return;
  text = String(text || '').trim();
  if (!text && !faroState.attachments.length) return;

  faroEnterThread();
  faroAppendUser(text);
  faroClearInput();

  // Kept so the error card's Retry has something to resend. Retry re-sends the
  // TEXT rather than replaying the failed request, because a stream that died
  // part-way may already have persisted a partial assistant message; a fresh
  // turn is the only state we can reason about.
  faroState.lastSent = text;

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
      attachments: faroState.attachments
    }),
    signal: faroState.abort.signal
  })
    .then(function (r) {
      if (!r.ok || !r.body) throw new Error('stream');
      return faroReadStream(r.body, bubble, status);
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') return;
      faroMascot('error');
      faroRenderComponent(bubble, { type: 'error', message: T('st.error'), retryable: true });
    })
    .finally(function () {
      faroState.streaming = false;
      faroState.abort = null;
      faroSetSendEnabled(true);
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
      if (status) {
        status.style.display = '';
        status.querySelector('.faro-status__label').textContent =
          data.state === 'running' ? T('st.searching') : T('st.working');
      }
      break;

    case 'component':
      faroRenderComponent(bubble, data.component);
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
  if (c.state === 'ready' && c.resultUrl) {
    var fmt = (c.meta && c.meta.format) || '';
    var cls = 'faro-media__img' + (fmt === '9:16' ? ' faro-media__img--9-16' : fmt === '1:1' ? ' faro-media__img--1-1' : '');
    d.innerHTML = (c.kind === 'video'
      ? '<video class="' + cls + '" src="' + faroEsc(c.resultUrl) + '" controls playsinline></video>'
      : '<img class="' + cls + '" src="' + faroEsc(c.resultUrl) + '" alt="">') +
      '<div class="faro-media__bar">' + (c.actions || []).map(function (a) {
        return '<button class="faro-card__btn" data-media="' + faroEsc(a.key) + '">' + faroEsc(a.label) + '</button>';
      }).join('') +
      '<span class="faro-form__note" data-media-note></span></div>';
    faroWireMediaActions(d, c);
  } else {
    d.innerHTML = '<div class="faro-media__img faro-skeleton"></div>';
    if (c.jobId) faroPollJob(c.jobId, d);
  }
  return d;
}

/* Media card buttons. Download and Preview work entirely client-side; the rest
   need backend ops that are not wired yet, so they call them and surface
   whatever the server says. That way the button is honest today ("not yet
   available") and becomes real with no UI change. */
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
      .then(function (r) {
        btn.disabled = false;
        if (note) note.textContent = r.summary || T('st.done');
      })
      .catch(function (err) {
        btn.disabled = false;
        if (note) note.textContent = (err && err.message) || T('st.error');
      });
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
  if (landing && !landing.hidden) {
    landing.hidden = true;
    thread.hidden = false;
    composer.hidden = false;
    // The input is MOVED, not duplicated — one element, one set of listeners.
    composer.querySelector('.faro-composer__inner').appendChild(document.getElementById('faro-input-form'));
  }
}

function faroAppendUser(text) {
  var d = document.createElement('div');
  d.className = 'faro-msg--user';
  d.textContent = text;
  document.getElementById('faro-thread-inner').appendChild(d);
  faroScrollToEnd();
}

function faroAppendAssistant() {
  var d = document.createElement('div');
  d.className = 'faro-msg--ai';
  d.innerHTML = '<div class="faro-msg__text"></div><div class="faro-cards"></div>';
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

function faroSetSendEnabled(on) {
  var b = document.getElementById('faro-send');
  var f = document.getElementById('faro-input-field');
  if (b) b.disabled = !on || faroState.streaming || !((f && f.value.trim()) || faroState.attachments.length);
}

function faroClearInput() {
  var f = document.getElementById('faro-input-field');
  if (f) { f.value = ''; f.style.height = 'auto'; }
  faroState.attachments = [];
  var a = document.getElementById('faro-attachments');
  if (a) a.innerHTML = '';
}

/* ── Data loading ─────────────────────────────────────────────────────────
   No CSRF header here: api/dashboard.js's fetch wrapper adds it. */
function faroPost(body) {
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

function faroLoadConversations() {
  var list = document.getElementById('faro-convo-list');
  if (!list) return;
  faroPost({ mode: 'faro-conversations', op: 'list' })
    .then(function (r) {
      var convos = r.conversations || [];
      list.innerHTML = convos.map(function (c) {
        return '<button class="faro-convo' + (c.id === faroState.conversationId ? ' active' : '') +
               '" data-convo="' + faroEsc(c.id) + '">' + faroEsc(c.title) + '</button>';
      }).join('');
    })
    .catch(function () { list.innerHTML = ''; });
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
          return '<span class="faro-context-chip">' + faroIcon('check', 11) + faroEsc(T('ctx.' + s.key)) + '</span>';
        }).join('');
      faroRenderContextToggles();
    })
    .catch(function () { chips.innerHTML = ''; });
}

function faroRenderContextToggles() {
  var box = document.getElementById('faro-context-toggles');
  if (!box) return;
  box.innerHTML = faroState.contextSources.map(function (s) {
    return '<div class="faro-context-toggle"><span>' + faroEsc(T('ctx.' + s.key)) + '</span>' +
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
    })
    .catch(function () { track.innerHTML = ''; });
}

function faroActivityCard(a) {
  var d = document.createElement('div');
  d.className = 'faro-act-card';
  var media;
  if (a.kind === 'text') {
    media = '<div class="faro-act-card__text">' +
              '<span class="faro-act-card__badge">' + faroEsc(a.kind) + '</span>' +
              '<span class="faro-act-card__excerpt">' + faroEsc(a.excerpt || '') + '</span>' +
            '</div>';
  } else if (a.kind === 'video') {
    media = '<div class="faro-act-card__media">' +
      (a.thumbUrl ? '<img src="' + faroEsc(a.thumbUrl) + '" alt="">' : '') +
      '<span class="faro-act-card__badge">' + faroEsc(a.kind) + '</span>' +
      (a.duration ? '<span class="faro-act-card__dur">' + faroEsc(a.duration) + '</span>' : '') +
      '</div>';
  } else {
    media = '<div class="faro-act-card__media">' +
      (a.thumbUrl ? '<img src="' + faroEsc(a.thumbUrl) + '" alt="">' : '') +
      '<span class="faro-act-card__badge">' + faroEsc(a.kind) + '</span></div>';
  }
  d.innerHTML = media +
    '<div class="faro-act-card__meta">' +
      '<div class="faro-act-card__title">' + faroEsc(a.title) + '</div>' +
      '<div class="faro-act-card__sub">' + faroEsc(a.subtitle || '') + '</div>' +
    '</div>';
  return d;
}

/* ── 9. Beelden ───────────────────────────────────────────────────────────
   Faro's image panel drives the SAME endpoints the CRM's AI-beeld page drove:
   /api/leads with modes property-styles / property-list / property-generate.

   That is deliberate and worth stating plainly, because the tempting
   alternative — a faro-media generate op calling api/_images.js directly —
   would have to re-implement the guard chain that lives in api/leads.js:
   eight option-axis validations, upload parsing with a 3MB decoded cap, an
   isConfigured() fail-soft, a credit check before the paid call, and the
   concurrent generate + source-upload. Two copies of that WILL drift, and the
   copy that drifts is the one that spends money. So Faro calls the proven path
   instead of owning a second one.

   All the option lists come from the property-styles response, so the axes are
   rendered generically — adding one in api/_images.js makes it appear here with
   no change to this file. */
var FARO_IMG_AXES = [
  { key: 'style',            field: 'styles',            labelKey: 'im.style',      required: true  },
  { key: 'roomType',         field: 'roomTypes',         labelKey: 'im.roomType'   },
  { key: 'renovationDepth',  field: 'renovationDepths',  labelKey: 'im.depth',      required: true  },
  { key: 'furniture',        field: 'furnitureLevels',   labelKey: 'im.furniture'  },
  { key: 'wallFinish',       field: 'wallFinishes',      labelKey: 'im.wallFinish' },
  { key: 'wallColor',        field: 'wallColors',        labelKey: 'im.wallColor'  },
  { key: 'floor',            field: 'floorTypes',        labelKey: 'im.floor'      },
  { key: 'lighting',         field: 'lightingMoods',     labelKey: 'im.lighting'   }
];

var faroImgOpts = null;
var faroImgUpload = null;   // data URL of the source photo

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

function faroRenderImageControls() {
  var box = document.getElementById('faro-images-controls');
  if (!box || box.dataset.ready) return;
  faroLeadsPost({ mode: 'property-styles' })
    .then(function (r) {
      box.dataset.ready = '1';
      faroImgOpts = r;

      var axes = FARO_IMG_AXES.filter(function (a) { return (r[a.field] || []).length; }).map(function (a) {
        var opts = r[a.field] || [];
        // An optional axis gets an explicit "automatisch" choice rather than a
        // blank — the backend's contract is that empty means "let the AI
        // decide", and that should be a thing you can pick, not a thing you
        // achieve by not picking.
        var chips = (a.required ? [] : [{ key: '', label: T('im.auto') }]).concat(opts);
        var preset = a.key === 'renovationDepth' ? (r.defaultRenovationDepth || '') : (a.required ? opts[0].key : '');
        return '<div class="faro-form__row"><label class="faro-form__label">' + aiT(a.labelKey) + '</label>' +
          '<div class="faro-chips" data-axis="' + a.key + '">' +
            chips.map(function (o) {
              return '<button type="button" class="faro-chip' + (o.key === preset ? ' active' : '') +
                     '" data-value="' + faroEsc(o.key) + '">' + faroEsc(o.label) + '</button>';
            }).join('') +
          '</div></div>';
      }).join('');

      box.innerHTML =
        '<div class="faro-form">' +
          '<div class="faro-form__drop" id="faro-img-drop">' +
            faroIcon('image', 20) +
            '<span id="faro-img-droplabel">' + faroEsc(T('im.drop')) + '</span>' +
            '<input type="file" id="faro-img-file" accept="image/*" hidden>' +
          '</div>' +
          '<img class="faro-form__preview" id="faro-img-preview" alt="" hidden>' +
          axes +
          '<div class="faro-form__row">' +
            '<label class="faro-form__label" for="faro-img-prompt">' + T('im.describe') + '</label>' +
            '<textarea class="faro-form__area" id="faro-img-prompt" rows="2" maxlength="500" placeholder="' +
              faroEsc(T('im.placeholder')) + '"></textarea>' +
          '</div>' +
          '<div class="faro-form__foot">' +
            '<button class="faro-card__btn faro-card__btn--primary" id="faro-img-generate">' +
              T('im.generate') + '</button>' +
            '<span class="faro-form__note" id="faro-img-note"></span>' +
            '<button class="faro-form__link" id="faro-img-advanced">' + T('im.advanced') + '</button>' +
          '</div>' +
        '</div>';

      box.querySelectorAll('.faro-chips').forEach(function (g) {
        g.addEventListener('click', function (e) {
          var c = e.target.closest('.faro-chip');
          if (!c) return;
          g.querySelectorAll('.faro-chip').forEach(function (x) { x.classList.remove('active'); });
          c.classList.add('active');
          faroSyncWallColour();
        });
      });
      faroSyncWallColour();
      faroWireImageUpload();

      var gen = document.getElementById('faro-img-generate');
      if (gen) gen.addEventListener('click', faroGenerateImage);

      // The before/after comparison slider and the comparison PDF export were
      // not ported into Faro, so the old page is kept for them and reached from
      // here. It is no longer in the CRM sidebar. Remove this link once those
      // two are ported and the page can be deleted.
      var adv = document.getElementById('faro-img-advanced');
      if (adv) adv.addEventListener('click', function () {
        faroClose();
        navigateTo('ai-beeld');
      });
    })
    .catch(function (err) {
      box.innerHTML = '<div class="faro-empty">' + faroEsc((err && err.message) || T('st.error')) + '</div>';
    });
}

function aiT(k) { return T(k); }

function faroAxisValue(key) {
  var g = document.querySelector('.faro-chips[data-axis="' + key + '"] .faro-chip.active');
  return g ? g.dataset.value : '';
}

/* Wall colour only means anything when the finish is painted — api/leads.js
   nulls it out otherwise, so showing it would offer a control that silently
   does nothing. */
function faroSyncWallColour() {
  var row = document.querySelector('.faro-chips[data-axis="wallColor"]');
  if (!row) return;
  var painted = faroAxisValue('wallFinish') === 'painted';
  row.closest('.faro-form__row').style.display = painted ? '' : 'none';
}

/* The source photo is downscaled in the browser before upload. The endpoint
   caps the DECODED payload at 3MB against Vercel's ~4.5MB request limit, and a
   modern phone photo blows straight through that. */
function faroWireImageUpload() {
  var drop = document.getElementById('faro-img-drop');
  var file = document.getElementById('faro-img-file');
  if (!drop || !file) return;

  drop.addEventListener('click', function () { file.click(); });
  file.addEventListener('change', function () { if (file.files[0]) faroAcceptPhoto(file.files[0]); });
  ['dragenter', 'dragover'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files[0]) faroAcceptPhoto(e.dataTransfer.files[0]);
  });
}

function faroAcceptPhoto(f) {
  if (!/^image\\//.test(f.type)) return;
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 1536;
      var w = img.width, h = img.height;
      if (w > max || h > max) {
        var r = Math.min(max / w, max / h);
        w = Math.round(w * r); h = Math.round(h * r);
      }
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      faroImgUpload = c.toDataURL('image/jpeg', 0.85);

      var prev = document.getElementById('faro-img-preview');
      if (prev) { prev.src = faroImgUpload; prev.hidden = false; }
      var lbl = document.getElementById('faro-img-droplabel');
      if (lbl) lbl.textContent = f.name;
    };
    img.src = String(reader.result);
  };
  reader.readAsDataURL(f);
}

function faroGenerateImage() {
  var note = document.getElementById('faro-img-note');
  var gen  = document.getElementById('faro-img-generate');
  if (!faroImgUpload) { if (note) note.textContent = T('im.needPhoto'); return; }

  if (note) note.textContent = T('st.busy');
  if (gen) gen.disabled = true;
  faroMascot('generating');

  var payload = {
    mode: 'property-generate',
    dataUrl: faroImgUpload,
    wallColorNote: '',
    customPrompt: (document.getElementById('faro-img-prompt') || {}).value || ''
  };
  FARO_IMG_AXES.forEach(function (a) { payload[a.key] = faroAxisValue(a.key); });

  faroLeadsPost(payload)
    .then(function (d) {
      if (gen) gen.disabled = false;
      if (note) note.textContent = '';
      faroMascot('success');
      var img = d.image;
      var gal = document.getElementById('faro-images-gallery');
      if (img && img.url && gal) {
        faroClearEmpty(gal);
        gal.prepend(faroMediaCard({
          jobId: img.id, kind: 'image', state: 'ready', resultUrl: img.url,
          meta: { propertyId: null },
          actions: [{ key: 'download', label: T('st.download') }]
        }));
      }
    })
    .catch(function (err) {
      if (gen) gen.disabled = false;
      faroMascot('error');
      if (note) note.textContent = (err && err.message) || T('st.error');
    });
}

function faroClearEmpty(el) {
  var e = el.parentNode && el.parentNode.querySelector('.faro-empty');
  if (e) e.remove();
}

function faroLoadGallery(kind) {
  var el = document.getElementById('faro-' + kind + '-gallery');
  if (!el) return;
  if (kind === 'images') faroRenderImageControls();
  el.innerHTML = '<div class="faro-media"><div class="faro-media__img faro-skeleton"></div></div>'.repeat(3);
  var load = kind === 'images'
    ? faroLeadsPost({ mode: 'property-list' }).then(function (r) {
        return { images: (r.images || []).map(function (i) {
          return { jobId: i.id, kind: 'image', state: 'ready', resultUrl: i.url,
                   meta: {}, actions: [{ key: 'download', label: T('st.download') }] };
        }) };
      })
    : faroPost({ mode: 'faro-media', op: 'list-videos' });

  load
    .then(function (r) {
      var items = r.images || r.videos || [];
      el.innerHTML = '';
      if (!items.length) {
        // An empty gallery must say so — requirement 15's empty states. Videos
        // has its own "coming soon" notice already, so only images needs one.
        if (kind === 'images') {
          var empty = document.createElement('div');
          empty.className = 'faro-empty';
          empty.textContent = T('act.empty');
          el.parentNode.insertBefore(empty, el);
        }
        return;
      }
      items.forEach(function (i) { el.appendChild(faroMediaCard(i)); });
    })
    .catch(function () { el.innerHTML = ''; });
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
  var launch = document.getElementById('faro-launch');
  if (launch) launch.addEventListener('click', faroToggle);

  var scrim = document.getElementById('faro-scrim');
  if (scrim) scrim.addEventListener('click', faroClose);

  var closeBtn = document.getElementById('faro-close');
  if (closeBtn) closeBtn.addEventListener('click', faroClose);

  // Mobile: the rail is a drawer. Picking anything inside it closes it again,
  // or it would sit on top of the thing you just navigated to.
  var railToggle = document.getElementById('faro-rail-toggle');
  var rail = document.querySelector('.faro-rail');
  if (railToggle && rail) {
    railToggle.addEventListener('click', function () { rail.classList.toggle('open'); });
    rail.addEventListener('click', function (e) {
      if (e.target.closest('[data-faro-page], [data-convo], #faro-new-convo')) rail.classList.remove('open');
    });
  }

  // The CRM's search pill already owns Cmd/Ctrl-K, so Faro takes J. The pill
  // label is written from the SAME constant that the handler matches on, so the
  // badge can never advertise a shortcut that does not work.
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  var kbd = document.getElementById('faro-launch-kbd');
  if (kbd) kbd.textContent = (mac ? '⌘' : 'Ctrl+') + FARO_HOTKEY.toUpperCase();

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key || '').toLowerCase() === FARO_HOTKEY) {
      e.preventDefault(); faroToggle(); return;
    }
    if (e.key === 'Escape' && faroState.open) {
      // Let an open popover inside Faro close first.
      var menu = document.querySelector('.faro-menu:not([hidden])');
      if (menu) return;
      faroClose();
    }
  });

  var form = document.getElementById('faro-input-form');
  var field = document.getElementById('faro-input-field');

  if (form) form.addEventListener('submit', function (e) { e.preventDefault(); faroSend(field.value); });

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
  faroSend(a.prompt);
}

function faroNewConversation() {
  if (faroState.abort) faroState.abort.abort();
  faroState.conversationId = null;

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
  faroSetPanel('chat');
  faroEnterThread();
  var inner = document.getElementById('faro-thread-inner');
  inner.innerHTML = '<div class="faro-skeleton" style="height:60px"></div>';
  faroPost({ mode: 'faro-messages', conversationId: id })
    .then(function (r) {
      inner.innerHTML = '';
      (r.messages || []).forEach(function (m) {
        if (m.role === 'user') { faroAppendUser(m.text || ''); return; }
        var b = faroAppendAssistant();
        b.querySelector('.faro-msg__text').textContent = m.text || '';
        (m.components || []).forEach(function (c) { faroRenderComponent(b, c); });
      });
      faroLoadConversations();
    })
    .catch(function () { inner.innerHTML = ''; });
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
  var strip = document.getElementById('faro-attachments');
  Array.prototype.slice.call(files).forEach(function (f) {
    if (faroState.attachments.length >= 6) return;
    if (!/^image\\//.test(f.type)) return;
    var reader = new FileReader();
    reader.onload = function () {
      faroState.attachments.push({ mediaType: f.type, data: String(reader.result).split(',')[1] });
      var chip = document.createElement('span');
      chip.className = 'faro-tag';
      chip.textContent = f.name;
      strip.appendChild(chip);
      faroSetSendEnabled(true);
    };
    reader.readAsDataURL(f);
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
