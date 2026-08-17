'use strict';
/*
 * Helvaro AI — client-side script.
 *
 * Returned as a plain string and spliced into api/dashboard.js's inline
 * <script>. Written in the same style as the rest of that script: no framework,
 * no build step, no module system, ES5 string concatenation throughout.
 *
 * ── One rule that matters more than the rest ─────────────────────────────────
 * Model output is NEVER inserted as HTML. Assistant prose goes in via
 * textContent; every card is built from typed component objects (see
 * api/_ai/schema.js) with hand-written markup and escaped values. A language
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
 * AI_T is injected by ./index.js from ./i18n.js for the user's language.
 * T('key') is the accessor; a missing key returns the key rather than blank.
 */

function js() {
  return `
/* ═══ Helvaro AI workspace ════════════════════════════════════════════════ */
function T(k) {
  return (AI_T && Object.prototype.hasOwnProperty.call(AI_T, k)) ? AI_T[k] : k;
}

var aiState = {
  workspace: 'crm',
  panel: 'chat',
  conversationId: null,
  tier: 'standard',
  streaming: false,
  attachments: [],
  abort: null,
  contextSources: []
};

function aiEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function aiIcon(name, size) {
  var p = AI_ICONS[name];
  if (!p) return '';
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
         'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
         p + '</svg>';
}

/* ── 1. Workspace switching ───────────────────────────────────────────────
   CRM keeps its state: we hide its pages rather than tear them down, so
   switching back is instant and nothing reloads. */
function setWorkspace(ws) {
  if (aiState.workspace === ws) return;
  aiState.workspace = ws;

  document.querySelectorAll('.workspace-switch__btn').forEach(function (b) {
    var on = b.dataset.workspace === ws;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  var crmNav = document.querySelector('.sidebar-nav:not(.ai-sidebar)');
  var aiNav  = document.getElementById('ai-sidebar');
  var aiWs   = document.getElementById('ai-workspace');

  if (ws === 'ai') {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    if (crmNav) crmNav.style.display = 'none';
    if (aiNav) aiNav.classList.add('active');
    if (aiWs) aiWs.classList.add('active');
    var ttl = document.getElementById('topbar-title');
    var sub = document.getElementById('topbar-subtitle');
    if (ttl) ttl.textContent = T('ws.title');
    if (sub) sub.textContent = T('ws.subtitle');
    // Refresh / CSV-export / last-updated belong to the CRM dashboard page and
    // mean nothing here. navigateTo() already owns their visibility per page
    // (dashboard.js: "Show refresh + CSV export only on dashboard"), so we only
    // have to hide them going in — switching back re-runs navigateTo, which
    // restores whatever the destination page wants.
    aiHideCrmPageControls(true);
    // One class on <body> so CSS can react to the active workspace without
    // :has() or sibling-combinator gymnastics across the topbar/main boundary.
    document.body.classList.add('ai-active');
    aiLoadConversations();
    aiLoadContext();
    aiLoadActivity();
    var f = document.getElementById('ai-input-field');
    if (f) f.focus();
  } else {
    if (aiWs) aiWs.classList.remove('active');
    if (aiNav) aiNav.classList.remove('active');
    if (crmNav) crmNav.style.display = '';
    document.body.classList.remove('ai-active');
    navigateTo((typeof state !== 'undefined' && state.currentPage) || 'dashboard');
  }
  try { localStorage.setItem('helvaro:workspace', ws); } catch (e) {}
}

function aiHideCrmPageControls(hide) {
  ['btn-refresh', 'btn-export-csv', 'timestamp-info'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = hide ? 'none' : '';
  });
}

function aiSetPanel(panel) {
  aiState.panel = panel;
  var showChat = panel === 'chat';

  ['images', 'videos', 'projects'].forEach(function (p) {
    var el = document.getElementById('ai-panel-' + p);
    if (el) el.hidden = panel !== p;
  });

  var landing = document.getElementById('ai-landing');
  var thread = document.getElementById('ai-thread');
  var composer = document.getElementById('ai-composer');
  var inThread = Boolean(aiState.conversationId);
  if (landing)  landing.hidden  = !showChat || inThread;
  if (thread)   thread.hidden   = !showChat || !inThread;
  if (composer) composer.hidden = !showChat || !inThread;

  document.querySelectorAll('.ai-sidebar .nav-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.aiPage === panel);
  });

  if (panel === 'images') aiLoadGallery('images');
  if (panel === 'videos') aiLoadGallery('videos');
  if (panel === 'projects') aiLoadProjects();
}

/* ── 11. Mascot state ─────────────────────────────────────────────────────
   Six states driven by what is actually happening. Sources are swapped; CSS
   handles the motion, which keeps it "extremely subtle" and the payload small.
   Only the idle asset exists today — a missing state falls back to idle rather
   than blanking the mascot. */
var AI_MASCOT_SRC = {
  idle:       '/ai/falcon-idle.webp',
  thinking:   '/ai/falcon-thinking.webp',
  generating: '/ai/falcon-generating.webp',
  video:      '/ai/falcon-video.webp',
  success:    '/ai/falcon-success.webp',
  error:      '/ai/falcon-error.webp'
};
var aiMascotMissing = {};

function aiMascot(stateName) {
  var el = document.getElementById('ai-mascot');
  if (!el) return;
  el.dataset.state = stateName;
  var src = AI_MASCOT_SRC[stateName];
  if (!src || aiMascotMissing[stateName]) return;
  el.onerror = function () {
    // Remember the gap so we stop re-requesting a 404 on every state change.
    aiMascotMissing[stateName] = true;
    if (stateName !== 'idle') el.src = AI_MASCOT_SRC.idle;
    else el.classList.add('ai-mascot--missing');
  };
  el.src = src;
}

/* ── 7. Sending a message + streaming the answer ──────────────────────────── */
function aiSend(text) {
  if (aiState.streaming) return;
  text = String(text || '').trim();
  if (!text && !aiState.attachments.length) return;

  aiEnterThread();
  aiAppendUser(text);
  aiClearInput();

  aiState.streaming = true;
  aiSetSendEnabled(false);
  aiMascot('thinking');

  var bubble = aiAppendAssistant();
  var status = aiAppendStatus(bubble, T('st.thinking'));
  aiState.abort = new AbortController();

  fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'ai-chat',
      text: text,
      conversationId: aiState.conversationId,
      tier: aiState.tier,
      attachments: aiState.attachments
    }),
    signal: aiState.abort.signal
  })
    .then(function (r) {
      if (!r.ok || !r.body) throw new Error('stream');
      return aiReadStream(r.body, bubble, status);
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') return;
      aiMascot('error');
      aiRenderComponent(bubble, { type: 'error', message: T('st.error'), retryable: true });
    })
    .finally(function () {
      aiState.streaming = false;
      aiState.abort = null;
      aiSetSendEnabled(true);
      if (status && status.parentNode) status.parentNode.removeChild(status);
    });
}

/* SSE reader. Frames are 'event: <name>\\ndata: <json>\\n\\n'; a chunk boundary
   can land anywhere, so the buffer is consumed only up to the last COMPLETE
   frame and the remainder carried forward. */
function aiReadStream(body, bubble, status) {
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
        if (name) aiHandleEvent(name, data || {}, bubble, status);
      });
      return pump();
    });
  }
  return pump();
}

function aiHandleEvent(name, data, bubble, status) {
  switch (name) {
    case 'start':
      if (data.conversationId && !aiState.conversationId) {
        aiState.conversationId = data.conversationId;
        aiLoadConversations();
      }
      if (data.model) {
        var ml = document.getElementById('ai-model-label');
        if (ml) ml.textContent = data.model;
      }
      break;

    case 'text':
      if (status) status.style.display = 'none';
      // textContent, never innerHTML — see this file's header.
      bubble.querySelector('.ai-msg__text').textContent += data.delta || '';
      aiScrollToEnd();
      break;

    case 'thinking':
      aiMascot(data.state === 'generating' ? 'generating' : 'thinking');
      break;

    case 'tool':
      if (status) {
        status.style.display = '';
        status.querySelector('.ai-status__label').textContent =
          data.state === 'running' ? T('st.searching') : T('st.working');
      }
      break;

    case 'component':
      aiRenderComponent(bubble, data.component);
      break;

    case 'error':
      aiMascot('error');
      aiRenderComponent(bubble, {
        type: 'error', message: data.message || T('st.error'), retryable: data.retryable
      });
      break;

    case 'done':
      aiMascot('success');
      setTimeout(function () { aiMascot('idle'); }, 1800);
      break;
  }
}

/* ── Component rendering ──────────────────────────────────────────────────
   Fixed markup per type. An unknown type renders nothing rather than throwing,
   so an older cached page meeting a newer component degrades quietly. */
function aiRenderComponent(bubble, c) {
  if (!c || !c.type || !bubble) return;
  var wrap = bubble.querySelector('.ai-cards');
  if (!wrap) return;
  var el;
  switch (c.type) {
    case 'lead_card':     el = aiLeadCard(c); break;
    case 'property_card': el = aiPropertyCard(c); break;
    case 'stat_group':    el = aiStatGroup(c); break;
    case 'confirmation':  el = aiConfirmCard(c); break;
    case 'draft':         el = aiDraftCard(c); break;
    case 'media_job':     el = aiMediaCard(c); break;
    case 'error':         el = aiErrorCard(c); break;
    default: return;
  }
  wrap.appendChild(el);
  aiScrollToEnd();
}

function aiLeadCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-card';
  d.innerHTML =
    '<div class="ai-card__name">' + aiEsc(c.name) + '</div>' +
    '<div class="ai-card__budget">' + aiEsc(c.budget) + '</div>' +
    '<div class="ai-card__meta">' + aiEsc(c.timeframe) + '</div>' +
    '<div class="ai-card__tags">' +
      '<span class="ai-tag">' + aiEsc(c.channel) + '</span>' +
      '<span class="ai-tag ai-tag--qualified">' + aiEsc(c.status) + '</span>' +
    '</div>' +
    '<div class="ai-card__actions">' +
      (c.actions || []).map(function (a, i) {
        return '<button class="ai-card__btn' + (i === 0 ? ' ai-card__btn--primary' : '') +
               '" data-lead="' + aiEsc(c.id) + '" data-act="' + aiEsc(a.key) + '">' +
               aiEsc(a.label) + '</button>';
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
    setWorkspace('crm');
    if (btn.dataset.act === 'thread') { navigateTo('gesprekken'); return; }
    navigateTo('dashboard');
    setTimeout(function () { if (typeof openPanel === 'function') openPanel(lead); }, 120);
  });
  return d;
}

/* ── 8. Confirmation gate ─────────────────────────────────────────────────
   Nothing outside Helvaro happens until this button is pressed. The card
   carries only an actionId; the payload stayed on the server. */
function aiConfirmCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-card ai-card--confirm';
  d.innerHTML =
    '<div class="ai-card__name">' + aiEsc(c.title) + '</div>' +
    '<div class="ai-card__meta">' + aiEsc(c.body) + '</div>' +
    '<div class="ai-card__actions">' +
      '<button class="ai-card__btn ai-card__btn--primary" data-confirm="' + aiEsc(c.actionId) + '">' +
        aiEsc(c.confirmLabel || T('st.confirm')) + '</button>' +
      '<button class="ai-card__btn" data-cancel="1">' + aiEsc(c.cancelLabel || T('st.cancel')) + '</button>' +
    '</div>';

  d.addEventListener('click', function (e) {
    var cancel = e.target.closest('[data-cancel]');
    if (cancel) { d.remove(); return; }
    var go = e.target.closest('[data-confirm]');
    if (!go) return;
    var label = go.textContent;
    go.disabled = true;
    go.textContent = T('st.busy');
    aiPost({ mode: 'ai-confirm', actionId: go.dataset.confirm })
      .then(function (r) {
        d.classList.remove('ai-card--confirm');
        d.innerHTML = '<div class="ai-card__meta">' + aiEsc(r.summary || T('st.done')) + '</div>';
        aiMascot('success');
      })
      .catch(function (err) {
        go.disabled = false;
        go.textContent = label;
        var note = document.createElement('div');
        note.className = 'ai-card__meta';
        note.style.color = 'var(--error)';
        note.textContent = (err && err.message) || T('st.error');
        d.appendChild(note);
      });
  });
  return d;
}

function aiPropertyCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-card';
  d.innerHTML =
    '<div class="ai-card__name">' + aiEsc(c.title) + '</div>' +
    '<div class="ai-card__meta">' + aiEsc(c.address) + '</div>' +
    '<div class="ai-card__budget">' + aiEsc(c.price) + '</div>';
  return d;
}

function aiStatGroup(c) {
  var d = document.createElement('div');
  d.className = 'ai-card';
  d.innerHTML = '<div class="ai-card__name">' + aiEsc(c.title) + '</div>' +
    (c.stats || []).map(function (s) {
      return '<div class="ai-card__meta">' + aiEsc(s.label) +
             ': <strong>' + aiEsc(s.value) + '</strong></div>';
    }).join('');
  return d;
}

function aiDraftCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-card';
  d.innerHTML = '<div class="ai-card__name">' + aiEsc(c.title) + '</div>';
  var p = document.createElement('div');
  p.className = 'ai-card__meta';
  p.style.whiteSpace = 'pre-wrap';
  p.textContent = c.body || '';
  d.appendChild(p);
  return d;
}

function aiMediaCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-media';
  d.dataset.job = c.jobId || '';
  if (c.state === 'ready' && c.resultUrl) {
    var fmt = (c.meta && c.meta.format) || '';
    var cls = 'ai-media__img' + (fmt === '9:16' ? ' ai-media__img--9-16' : fmt === '1:1' ? ' ai-media__img--1-1' : '');
    d.innerHTML = (c.kind === 'video'
      ? '<video class="' + cls + '" src="' + aiEsc(c.resultUrl) + '" controls playsinline></video>'
      : '<img class="' + cls + '" src="' + aiEsc(c.resultUrl) + '" alt="">') +
      '<div class="ai-media__bar">' + (c.actions || []).map(function (a) {
        return '<button class="ai-card__btn" data-media="' + aiEsc(a.key) + '">' + aiEsc(a.label) + '</button>';
      }).join('') + '</div>';
  } else {
    d.innerHTML = '<div class="ai-media__img ai-skeleton"></div>';
    if (c.jobId) aiPollJob(c.jobId, d);
  }
  return d;
}

function aiErrorCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-card ai-card--error';
  d.innerHTML = '<div class="ai-card__meta">' + aiEsc(c.message) + '</div>' +
    (c.retryable ? '<div class="ai-card__actions"><button class="ai-card__btn" data-retry="1">' +
      T('st.retry') + '</button></div>' : '');
  return d;
}

/* ── 9/10. Media job polling ──────────────────────────────────────────────
   Generation exceeds the request window, so the card renders a skeleton and
   polls. Backs off so a stuck job does not hammer the endpoint. */
function aiPollJob(jobId, el, attempt) {
  attempt = attempt || 0;
  if (attempt > 60) return;
  setTimeout(function () {
    aiPost({ mode: 'ai-media', op: 'job', jobId: jobId })
      .then(function (r) {
        var job = r.job || {};
        if (job.state === 'ready')  { el.replaceWith(aiMediaCard(job)); return; }
        if (job.state === 'failed') { el.innerHTML = '<div class="ai-card__meta">' + T('st.failed') + '</div>'; return; }
        aiPollJob(jobId, el, attempt + 1);
      })
      .catch(function () { aiPollJob(jobId, el, attempt + 1); });
  }, Math.min(2000 + attempt * 500, 8000));
}

/* ── Thread plumbing ──────────────────────────────────────────────────────── */
function aiEnterThread() {
  var landing = document.getElementById('ai-landing');
  var thread = document.getElementById('ai-thread');
  var composer = document.getElementById('ai-composer');
  if (landing && !landing.hidden) {
    landing.hidden = true;
    thread.hidden = false;
    composer.hidden = false;
    // The input is MOVED, not duplicated — one element, one set of listeners.
    composer.querySelector('.ai-composer__inner').appendChild(document.getElementById('ai-input-form'));
  }
}

function aiAppendUser(text) {
  var d = document.createElement('div');
  d.className = 'ai-msg--user';
  d.textContent = text;
  document.getElementById('ai-thread-inner').appendChild(d);
  aiScrollToEnd();
}

function aiAppendAssistant() {
  var d = document.createElement('div');
  d.className = 'ai-msg--ai';
  d.innerHTML = '<div class="ai-msg__text"></div><div class="ai-cards"></div>';
  document.getElementById('ai-thread-inner').appendChild(d);
  return d;
}

function aiAppendStatus(bubble, label) {
  var s = document.createElement('div');
  s.className = 'ai-status';
  s.innerHTML = '<span class="ai-status__dot"></span><span class="ai-status__label"></span>';
  s.querySelector('.ai-status__label').textContent = label;
  bubble.insertBefore(s, bubble.firstChild);
  return s;
}

function aiScrollToEnd() {
  var t = document.getElementById('ai-thread');
  if (t) t.scrollTop = t.scrollHeight;
}

function aiSetSendEnabled(on) {
  var b = document.getElementById('ai-send');
  var f = document.getElementById('ai-input-field');
  if (b) b.disabled = !on || aiState.streaming || !((f && f.value.trim()) || aiState.attachments.length);
}

function aiClearInput() {
  var f = document.getElementById('ai-input-field');
  if (f) { f.value = ''; f.style.height = 'auto'; }
  aiState.attachments = [];
  var a = document.getElementById('ai-attachments');
  if (a) a.innerHTML = '';
}

/* ── Data loading ─────────────────────────────────────────────────────────
   No CSRF header here: api/dashboard.js's fetch wrapper adds it. */
function aiPost(body) {
  return fetch('/api/ai', {
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

function aiLoadConversations() {
  var list = document.getElementById('ai-convo-list');
  if (!list) return;
  aiPost({ mode: 'ai-conversations', op: 'list' })
    .then(function (r) {
      var convos = r.conversations || [];
      list.innerHTML = convos.map(function (c) {
        return '<button class="ai-convo' + (c.id === aiState.conversationId ? ' active' : '') +
               '" data-convo="' + aiEsc(c.id) + '">' + aiEsc(c.title) + '</button>';
      }).join('');
    })
    .catch(function () { list.innerHTML = ''; });
}

/* ── 6. Helvaro context ───────────────────────────────────────────────────
   Chips come from the backend's own source list, so the indicator cannot claim
   access the assistant does not have. */
function aiLoadContext() {
  var chips = document.getElementById('ai-context-chips');
  if (!chips) return;
  aiPost({ mode: 'ai-context' })
    .then(function (r) {
      aiState.contextSources = r.sources || [];
      chips.innerHTML = aiState.contextSources.filter(function (s) { return s.available; })
        .slice(0, 4)
        .map(function (s) {
          return '<span class="ai-context-chip">' + aiIcon('check', 11) + aiEsc(T('ctx.' + s.key)) + '</span>';
        }).join('');
      aiRenderContextToggles();
    })
    .catch(function () { chips.innerHTML = ''; });
}

function aiRenderContextToggles() {
  var box = document.getElementById('ai-context-toggles');
  if (!box) return;
  box.innerHTML = aiState.contextSources.map(function (s) {
    return '<div class="ai-context-toggle"><span>' + aiEsc(T('ctx.' + s.key)) + '</span>' +
           '<span class="ai-tag' + (s.available ? ' ai-tag--qualified' : '') + '">' +
           (s.available ? aiIcon('check', 11) : '—') + '</span></div>';
  }).join('');
}

/* ── Recent AI activity ───────────────────────────────────────────────────── */
function aiLoadActivity() {
  var track = document.getElementById('ai-activity-track');
  if (!track) return;
  track.innerHTML = '<div class="ai-act-card"><div class="ai-act-card__media ai-skeleton"></div></div>'.repeat(4);
  aiPost({ mode: 'ai-media', op: 'list-activity' })
    .then(function (r) {
      var items = r.activity || [];
      if (!items.length) {
        track.innerHTML = '<div class="ai-empty" style="flex:1">' + T('act.empty') + '</div>';
        return;
      }
      track.innerHTML = '';
      items.forEach(function (i) { track.appendChild(aiActivityCard(i)); });
    })
    .catch(function () { track.innerHTML = ''; });
}

function aiActivityCard(a) {
  var d = document.createElement('div');
  d.className = 'ai-act-card';
  var media;
  if (a.kind === 'text') {
    media = '<div class="ai-act-card__text">' +
              '<span class="ai-act-card__badge">' + aiEsc(a.kind) + '</span>' +
              '<span class="ai-act-card__excerpt">' + aiEsc(a.excerpt || '') + '</span>' +
            '</div>';
  } else if (a.kind === 'video') {
    media = '<div class="ai-act-card__media">' +
      (a.thumbUrl ? '<img src="' + aiEsc(a.thumbUrl) + '" alt="">' : '') +
      '<span class="ai-act-card__badge">' + aiEsc(a.kind) + '</span>' +
      (a.duration ? '<span class="ai-act-card__dur">' + aiEsc(a.duration) + '</span>' : '') +
      '</div>';
  } else {
    media = '<div class="ai-act-card__media">' +
      (a.thumbUrl ? '<img src="' + aiEsc(a.thumbUrl) + '" alt="">' : '') +
      '<span class="ai-act-card__badge">' + aiEsc(a.kind) + '</span></div>';
  }
  d.innerHTML = media +
    '<div class="ai-act-card__meta">' +
      '<div class="ai-act-card__title">' + aiEsc(a.title) + '</div>' +
      '<div class="ai-act-card__sub">' + aiEsc(a.subtitle || '') + '</div>' +
    '</div>';
  return d;
}

/* ── 9. Images workspace ──────────────────────────────────────────────────
   Controls are rendered from the BACKEND's option lists (ai-media/styles), not
   from a copy in the markup, so the style set has one source of truth —
   api/_images.js's PROPERTY_STYLES, which the CRM's existing AI-beeld page
   already uses. Adding a style there makes it appear here with no UI change. */
function aiRenderImageControls() {
  var box = document.getElementById('ai-images-controls');
  if (!box || box.dataset.ready) return;
  aiPost({ mode: 'ai-media', op: 'styles' })
    .then(function (r) {
      box.dataset.ready = '1';
      var styles = r.styles || [];
      var aspects = r.imageAspects || [];
      box.innerHTML =
        '<div class="ai-form">' +
          '<div class="ai-form__row">' +
            '<label class="ai-form__label" for="ai-img-property">' + T('im.property') + '</label>' +
            '<select class="ai-form__select" id="ai-img-property">' +
              '<option value="">' + aiEsc(T('im.propertyNone')) + '</option>' +
            '</select>' +
          '</div>' +
          '<div class="ai-form__drop" id="ai-img-drop">' +
            aiIcon('image', 20) +
            '<span>' + aiEsc(T('im.drop')) + '</span>' +
            '<input type="file" id="ai-img-file" accept="image/*" multiple hidden>' +
          '</div>' +
          '<div class="ai-form__row">' +
            '<label class="ai-form__label" for="ai-img-prompt">' + T('im.describe') + '</label>' +
            '<textarea class="ai-form__area" id="ai-img-prompt" rows="2" placeholder="' +
              aiEsc(T('im.placeholder')) + '"></textarea>' +
          '</div>' +
          '<div class="ai-form__row">' +
            '<label class="ai-form__label">' + T('im.style') + '</label>' +
            '<div class="ai-chips" id="ai-img-styles">' +
              styles.map(function (k, i) {
                return '<button type="button" class="ai-chip' + (i === 0 ? ' active' : '') +
                       '" data-style="' + aiEsc(k) + '">' + aiEsc(T('st.' + k)) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="ai-form__row">' +
            '<label class="ai-form__label">' + T('im.aspect') + '</label>' +
            '<div class="ai-chips" id="ai-img-aspects">' +
              aspects.map(function (a, i) {
                return '<button type="button" class="ai-chip' + (i === 1 ? ' active' : '') +
                       '" data-aspect="' + aiEsc(a) + '">' + aiEsc(a) + '</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="ai-form__foot">' +
            '<button class="ai-card__btn ai-card__btn--primary" id="ai-img-generate">' +
              T('im.generate') + '</button>' +
            '<span class="ai-form__note" id="ai-img-note"></span>' +
          '</div>' +
        '</div>';

      // Single-select chip groups.
      ['ai-img-styles', 'ai-img-aspects'].forEach(function (id) {
        var g = document.getElementById(id);
        if (!g) return;
        g.addEventListener('click', function (e) {
          var c = e.target.closest('.ai-chip');
          if (!c) return;
          g.querySelectorAll('.ai-chip').forEach(function (x) { x.classList.remove('active'); });
          c.classList.add('active');
        });
      });

      var drop = document.getElementById('ai-img-drop');
      var file = document.getElementById('ai-img-file');
      if (drop && file) {
        drop.addEventListener('click', function () { file.click(); });
        ['dragenter', 'dragover'].forEach(function (ev) {
          drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(function (ev) {
          drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('dragover'); });
        });
      }

      var gen = document.getElementById('ai-img-generate');
      if (gen) gen.addEventListener('click', aiGenerateImage);
    })
    .catch(function () { box.innerHTML = ''; });
}

function aiGenerateImage() {
  var note = document.getElementById('ai-img-note');
  var promptEl = document.getElementById('ai-img-prompt');
  var styleEl = document.querySelector('#ai-img-styles .ai-chip.active');
  var aspectEl = document.querySelector('#ai-img-aspects .ai-chip.active');
  if (!promptEl || !promptEl.value.trim()) {
    if (note) note.textContent = T('im.needPrompt');
    return;
  }
  if (note) note.textContent = T('st.busy');
  aiMascot('generating');
  aiPost({
    mode: 'ai-media', op: 'generate-image',
    prompt: promptEl.value.trim(),
    style: styleEl && styleEl.dataset.style,
    aspectRatio: aspectEl && aspectEl.dataset.aspect,
    propertyId: (document.getElementById('ai-img-property') || {}).value || null
  })
    .then(function (r) {
      if (note) note.textContent = '';
      var gal = document.getElementById('ai-images-gallery');
      if (gal && r.job) { aiClearEmpty(gal); gal.prepend(aiMediaCard(r.job)); }
    })
    .catch(function (err) {
      aiMascot('error');
      if (note) note.textContent = (err && err.message) || T('st.error');
    });
}

function aiClearEmpty(el) {
  var e = el.parentNode && el.parentNode.querySelector('.ai-empty');
  if (e) e.remove();
}

function aiLoadGallery(kind) {
  var el = document.getElementById('ai-' + kind + '-gallery');
  if (!el) return;
  if (kind === 'images') aiRenderImageControls();
  el.innerHTML = '<div class="ai-media"><div class="ai-media__img ai-skeleton"></div></div>'.repeat(3);
  aiPost({ mode: 'ai-media', op: kind === 'images' ? 'list-images' : 'list-videos' })
    .then(function (r) {
      var items = r.images || r.videos || [];
      el.innerHTML = '';
      if (!items.length) {
        // An empty gallery must say so — requirement 15's empty states. Videos
        // has its own "coming soon" notice already, so only images needs one.
        if (kind === 'images') {
          var empty = document.createElement('div');
          empty.className = 'ai-empty';
          empty.textContent = T('act.empty');
          el.parentNode.insertBefore(empty, el);
        }
        return;
      }
      items.forEach(function (i) { el.appendChild(aiMediaCard(i)); });
    })
    .catch(function () { el.innerHTML = ''; });
}

function aiLoadProjects() {
  var el = document.getElementById('ai-projects-list');
  if (!el) return;
  aiPost({ mode: 'ai-projects', op: 'list' })
    .then(function (r) {
      var ps = r.projects || [];
      el.innerHTML = ps.length
        ? ps.map(function (p) {
            return '<div class="ai-card"><div class="ai-card__name">' + aiEsc(p.name) + '</div>' +
                   '<div class="ai-card__meta">' + aiEsc(p.subtitle || '') + '</div></div>';
          }).join('')
        : '<div class="ai-empty">' + T('act.empty') + '</div>';
    })
    .catch(function () { el.innerHTML = ''; });
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */
function aiInit() {
  document.querySelectorAll('.workspace-switch__btn').forEach(function (b) {
    b.addEventListener('click', function () { setWorkspace(b.dataset.workspace); });
  });

  var form = document.getElementById('ai-input-form');
  var field = document.getElementById('ai-input-field');

  if (form) form.addEventListener('submit', function (e) { e.preventDefault(); aiSend(field.value); });

  if (field) {
    field.addEventListener('input', function () {
      field.style.height = 'auto';
      field.style.height = Math.min(field.scrollHeight, 200) + 'px';
      aiSetSendEnabled(true);
    });
    // Enter sends, Shift+Enter breaks the line — the convention users expect.
    field.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(field.value); }
    });
  }

  document.querySelectorAll('[data-quick]').forEach(function (b) {
    b.addEventListener('click', function () { aiQuickAction(b.dataset.quick); });
  });

  document.querySelectorAll('.ai-sidebar [data-ai-page]').forEach(function (b) {
    b.addEventListener('click', function () { aiSetPanel(b.dataset.aiPage); });
  });

  var nc = document.getElementById('ai-new-convo');
  if (nc) nc.addEventListener('click', aiNewConversation);

  var list = document.getElementById('ai-convo-list');
  if (list) list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-convo]');
    if (b) aiOpenConversation(b.dataset.convo);
  });

  var next = document.getElementById('ai-activity-next');
  if (next) next.addEventListener('click', function () {
    var tr = document.getElementById('ai-activity-track');
    if (tr) tr.scrollBy({ left: tr.clientWidth * 0.8, behavior: 'smooth' });
  });

  aiWireUploads();
  aiWireContextPanel();

  try {
    if (localStorage.getItem('helvaro:workspace') === 'ai') setWorkspace('ai');
  } catch (e) {}
}

function aiQuickAction(id) {
  var a = AI_QUICK_ACTIONS[id];
  if (!a) return;
  setWorkspace('ai');
  if (a.panel) { aiSetPanel(a.panel); return; }
  aiSetPanel('chat');
  aiSend(a.prompt);
}

function aiNewConversation() {
  if (aiState.abort) aiState.abort.abort();
  aiState.conversationId = null;

  var inner = document.getElementById('ai-thread-inner');
  if (inner) inner.innerHTML = '';
  document.getElementById('ai-thread').hidden = true;
  document.getElementById('ai-composer').hidden = true;

  var landing = document.getElementById('ai-landing');
  landing.hidden = false;
  // Move the input back above the context row, where it started.
  var target = landing.querySelector('.ai-landing__inner');
  target.insertBefore(document.getElementById('ai-input-form'),
                      target.querySelector('.ai-context-row'));

  aiMascot('idle');
  aiSetPanel('chat');
  aiLoadConversations();
  var f = document.getElementById('ai-input-field');
  if (f) f.focus();
}

function aiOpenConversation(id) {
  aiState.conversationId = id;
  aiSetPanel('chat');
  aiEnterThread();
  var inner = document.getElementById('ai-thread-inner');
  inner.innerHTML = '<div class="ai-skeleton" style="height:60px"></div>';
  aiPost({ mode: 'ai-messages', conversationId: id })
    .then(function (r) {
      inner.innerHTML = '';
      (r.messages || []).forEach(function (m) {
        if (m.role === 'user') { aiAppendUser(m.text || ''); return; }
        var b = aiAppendAssistant();
        b.querySelector('.ai-msg__text').textContent = m.text || '';
        (m.components || []).forEach(function (c) { aiRenderComponent(b, c); });
      });
      aiLoadConversations();
    })
    .catch(function () { inner.innerHTML = ''; });
}

/* ── 15. Uploads + drag-and-drop ──────────────────────────────────────────── */
function aiWireUploads() {
  var input = document.getElementById('ai-file-input');
  var btn = document.getElementById('ai-btn-attach');
  var form = document.getElementById('ai-input-form');
  if (!input || !form) return;

  if (btn) btn.addEventListener('click', function () { input.click(); });
  input.addEventListener('change', function () { aiAcceptFiles(input.files); input.value = ''; });

  ['dragenter', 'dragover'].forEach(function (ev) {
    form.addEventListener(ev, function (e) { e.preventDefault(); form.classList.add('dragover'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    form.addEventListener(ev, function (e) { e.preventDefault(); form.classList.remove('dragover'); });
  });
  form.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files) aiAcceptFiles(e.dataTransfer.files);
  });
}

function aiAcceptFiles(files) {
  var strip = document.getElementById('ai-attachments');
  Array.prototype.slice.call(files).forEach(function (f) {
    if (aiState.attachments.length >= 6) return;
    if (!/^image\\//.test(f.type)) return;
    var reader = new FileReader();
    reader.onload = function () {
      aiState.attachments.push({ mediaType: f.type, data: String(reader.result).split(',')[1] });
      var chip = document.createElement('span');
      chip.className = 'ai-tag';
      chip.textContent = f.name;
      strip.appendChild(chip);
      aiSetSendEnabled(true);
    };
    reader.readAsDataURL(f);
  });
}

/* ── 6. Manage panel ──────────────────────────────────────────────────────
   The design's "Manage" button. Currently read-only: it shows what Helvaro AI
   can reach. Making the toggles WRITABLE means a disabled source must cause the
   orchestrator to withhold the matching tools, not merely hide a chip —
   otherwise the control is decorative. That is a backend change, not a UI one. */
function aiWireContextPanel() {
  var btn = document.getElementById('ai-context-btn');
  var panel = document.getElementById('ai-context-panel');
  if (!btn || !panel) return;
  btn.addEventListener('click', function () {
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    panel.hidden = open;
    if (!open && !aiState.contextSources.length) aiLoadContext();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aiInit);
else aiInit();
`;
}

module.exports = { js };
