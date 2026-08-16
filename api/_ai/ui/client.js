'use strict';
/*
 * Helvaro AI — client-side script.
 *
 * SCAFFOLD: the state machine, SSE reader, renderers and event wiring are
 * written out; network calls hit endpoints that are inert until
 * AI_WORKSPACE_ENABLED=1, so the workspace renders and navigates but does not
 * yet answer.
 *
 * Returned as a plain string and spliced into api/dashboard.js's inline
 * <script>. Written in the same style as the rest of that script: no
 * framework, no build step, no module system.
 *
 * ── One rule that matters more than the rest ─────────────────────────────────
 * Model output is NEVER inserted as HTML. Assistant prose goes in via
 * textContent; every card is built from typed component objects (see
 * api/_ai/schema.js) with hand-written markup and escaped values. A language
 * model writing into innerHTML — with lead conversations, which contain text
 * strangers sent us, flowing through its context — is an XSS hole with an
 * attacker-influenced input. There is no case where model text becomes markup.
 */

function js() {
  return `
/* ═══ Helvaro AI workspace ════════════════════════════════════════════════ */
var aiState = {
  workspace: 'crm',          // 'crm' | 'ai'
  panel: 'chat',             // 'chat' | 'images' | 'videos' | 'projects'
  conversationId: null,
  tier: 'standard',
  streaming: false,
  attachments: [],
  abort: null
};

function aiEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── 1. Workspace switching ───────────────────────────────────────────────
   CRM stays one click away and keeps its state: we hide its pages rather than
   tear them down, so switching back is instant and nothing reloads. */
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
    document.getElementById('topbar-title').textContent = 'Helvaro AI';
    document.getElementById('topbar-subtitle').textContent = 'Je AI-werkruimte';
    aiLoadConversations();
    var f = document.getElementById('ai-input-field');
    if (f) f.focus();
  } else {
    if (aiWs) aiWs.classList.remove('active');
    if (aiNav) aiNav.classList.remove('active');
    if (crmNav) crmNav.style.display = '';
    navigateTo(state.currentPage || 'dashboard');
  }
  try { localStorage.setItem('helvaro:workspace', ws); } catch (e) {}
}

/* ── Sub-panels inside AI ─────────────────────────────────────────────────── */
function aiSetPanel(panel) {
  aiState.panel = panel;
  var chat = document.getElementById('ai-landing');
  var thread = document.getElementById('ai-thread');
  var showChat = panel === 'chat';

  ['images', 'videos', 'projects'].forEach(function (p) {
    var el = document.getElementById('ai-panel-' + p);
    if (el) el.hidden = panel !== p;
  });
  if (chat) chat.hidden = !showChat || Boolean(aiState.conversationId);
  if (thread) thread.hidden = !showChat || !aiState.conversationId;

  document.querySelectorAll('.ai-sidebar .nav-item').forEach(function (n) {
    n.classList.toggle('active', n.dataset.aiPage === panel);
  });

  if (panel === 'images')   aiLoadGallery('images');
  if (panel === 'videos')   aiLoadGallery('videos');
  if (panel === 'projects') aiLoadProjects();
}

/* ── 11. Mascot state ─────────────────────────────────────────────────────
   Six states, driven by what is actually happening. Sources are swapped, not
   animated frame-by-frame — CSS handles the motion, which keeps it "extremely
   subtle" and keeps the payload small. */
var AI_MASCOT_SRC = {
  idle:       '/ai/falcon-idle.webp',
  thinking:   '/ai/falcon-thinking.webp',
  generating: '/ai/falcon-generating.webp',
  video:      '/ai/falcon-video.webp',
  success:    '/ai/falcon-success.webp',
  error:      '/ai/falcon-error.webp'
};
function aiMascot(state) {
  var el = document.getElementById('ai-mascot');
  if (!el) return;
  el.dataset.state = state;
  if (AI_MASCOT_SRC[state]) el.src = AI_MASCOT_SRC[state];
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
  var status = aiAppendStatus(bubble, 'Denkt na…');

  aiState.abort = new AbortController();

  fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
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
      aiRenderComponent(bubble, {
        type: 'error',
        message: 'Er ging iets mis. Probeer het opnieuw.',
        retryable: true
      });
    })
    .finally(function () {
      aiState.streaming = false;
      aiState.abort = null;
      aiSetSendEnabled(true);
      if (status && status.parentNode) status.parentNode.removeChild(status);
    });
}

/* SSE reader. Frames are 'event: <name>\\ndata: <json>\\n\\n'; a chunk boundary
   can land anywhere, so the buffer is only consumed up to the last complete
   frame. */
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
      break;

    case 'text': {
      if (status) status.style.display = 'none';
      var t = bubble.querySelector('.ai-msg__text');
      // textContent, never innerHTML — see this file's header.
      t.textContent += data.delta || '';
      aiScrollToEnd();
      break;
    }

    case 'thinking':
      aiMascot(data.state === 'generating' ? 'generating' : 'thinking');
      break;

    case 'tool':
      if (status) {
        status.style.display = '';
        status.querySelector('.ai-status__label').textContent =
          data.state === 'running' ? 'Zoekt in je CRM…' : 'Verwerkt…';
      }
      break;

    case 'component':
      aiRenderComponent(bubble, data.component);
      break;

    case 'error':
      aiMascot('error');
      aiRenderComponent(bubble, {
        type: 'error', message: data.message, retryable: data.retryable
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
  if (!c || !c.type) return;
  var wrap = bubble.querySelector('.ai-cards');
  var el;

  switch (c.type) {
    case 'lead_card':    el = aiLeadCard(c); break;
    case 'property_card':el = aiPropertyCard(c); break;
    case 'stat_group':   el = aiStatGroup(c); break;
    case 'confirmation': el = aiConfirmCard(c); break;
    case 'draft':        el = aiDraftCard(c); break;
    case 'media_job':    el = aiMediaCard(c); break;
    case 'error':        el = aiErrorCard(c); break;
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
  // "the user should never need to leave Helvaro" (requirement 17) is easiest
  // to honour by not duplicating the destination.
  d.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var lead = (state.leads || []).find(function (l) { return String(l.id) === btn.dataset.lead; });
    if (!lead) return;
    if (btn.dataset.act === 'open')    { setWorkspace('crm'); navigateTo('dashboard'); setTimeout(function () { openPanel(lead); }, 120); }
    if (btn.dataset.act === 'thread')  { setWorkspace('crm'); navigateTo('gesprekken'); }
    if (btn.dataset.act === 'contact') { setWorkspace('crm'); navigateTo('dashboard'); setTimeout(function () { openPanel(lead); }, 120); }
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
        aiEsc(c.confirmLabel) + '</button>' +
      '<button class="ai-card__btn" data-cancel="1">' + aiEsc(c.cancelLabel || 'Annuleren') + '</button>' +
    '</div>';

  d.addEventListener('click', function (e) {
    if (e.target.dataset.cancel) { d.remove(); return; }
    var id = e.target.dataset.confirm;
    if (!id) return;
    e.target.disabled = true;
    e.target.textContent = 'Bezig…';
    aiPost({ mode: 'ai-confirm', actionId: id })
      .then(function (r) {
        d.classList.remove('ai-card--confirm');
        d.innerHTML = '<div class="ai-card__meta">' + aiEsc(r.summary || 'Uitgevoerd.') + '</div>';
        aiMascot('success');
      })
      .catch(function (err) {
        e.target.disabled = false;
        e.target.textContent = aiEsc(c.confirmLabel);
        aiRenderComponent(d.closest('.ai-msg--ai'), {
          type: 'error', message: (err && err.message) || 'Actie mislukt.', retryable: true
        });
      });
  });
  return d;
}

function aiPropertyCard(c) { var d = document.createElement('div'); d.className = 'ai-card';
  d.innerHTML = '<div class="ai-card__name">' + aiEsc(c.title) + '</div>' +
                '<div class="ai-card__meta">' + aiEsc(c.address) + '</div>' +
                '<div class="ai-card__budget">' + aiEsc(c.price) + '</div>'; return d; }

function aiStatGroup(c) { var d = document.createElement('div'); d.className = 'ai-card';
  d.innerHTML = '<div class="ai-card__name">' + aiEsc(c.title) + '</div>' +
    (c.stats || []).map(function (s) {
      return '<div class="ai-card__meta">' + aiEsc(s.label) + ': <strong>' + aiEsc(s.value) + '</strong></div>';
    }).join(''); return d; }

function aiDraftCard(c) { var d = document.createElement('div'); d.className = 'ai-card';
  d.innerHTML = '<div class="ai-card__name">' + aiEsc(c.title) + '</div>';
  var p = document.createElement('div'); p.className = 'ai-card__meta';
  p.textContent = c.body || ''; d.appendChild(p); return d; }

function aiMediaCard(c) { var d = document.createElement('div'); d.className = 'ai-media';
  d.dataset.job = c.jobId || '';
  if (c.state === 'ready' && c.resultUrl) {
    d.innerHTML = (c.kind === 'video'
      ? '<video class="ai-media__img" src="' + aiEsc(c.resultUrl) + '" controls playsinline></video>'
      : '<img class="ai-media__img" src="' + aiEsc(c.resultUrl) + '" alt="">') +
      '<div class="ai-media__bar">' + (c.actions || []).map(function (a) {
        return '<button class="ai-card__btn" data-media="' + aiEsc(a.key) + '">' + aiEsc(a.label) + '</button>';
      }).join('') + '</div>';
  } else {
    d.innerHTML = '<div class="ai-media__img ai-skeleton"></div>';
    if (c.jobId) aiPollJob(c.jobId, d);
  }
  return d; }

function aiErrorCard(c) {
  var d = document.createElement('div');
  d.className = 'ai-card ai-card--error';
  d.innerHTML = '<div class="ai-card__meta">' + aiEsc(c.message) + '</div>' +
    (c.retryable ? '<div class="ai-card__actions"><button class="ai-card__btn" data-retry="1">Opnieuw</button></div>' : '');
  return d;
}

/* ── 9/10. Media job polling ──────────────────────────────────────────────
   Image and video generation exceed the request window, so the card renders a
   skeleton and polls. Backs off so a stuck job does not hammer the endpoint. */
function aiPollJob(jobId, el, attempt) {
  attempt = attempt || 0;
  if (attempt > 60) return;
  setTimeout(function () {
    aiPost({ mode: 'ai-media', op: 'job', jobId: jobId })
      .then(function (r) {
        var job = r.job || {};
        if (job.state === 'ready')  { el.replaceWith(aiMediaCard(job)); return; }
        if (job.state === 'failed') { el.innerHTML = '<div class="ai-card__meta">Generatie mislukt.</div>'; return; }
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
    composer.querySelector('.ai-thread__inner').appendChild(document.getElementById('ai-input-form'));
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
  if (b) b.disabled = !on || !(f && f.value.trim());
}

function aiClearInput() {
  var f = document.getElementById('ai-input-field');
  if (f) { f.value = ''; f.style.height = 'auto'; }
  aiState.attachments = [];
  var a = document.getElementById('ai-attachments');
  if (a) a.innerHTML = '';
}

/* ── Data loading ─────────────────────────────────────────────────────────── */
function aiPost(body) {
  return fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrfToken() },
    body: JSON.stringify(body)
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error || 'Mislukt');
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
      if (!convos.length) { list.innerHTML = ''; return; }
      list.innerHTML = convos.map(function (c) {
        return '<button class="ai-convo' + (c.id === aiState.conversationId ? ' active' : '') +
               '" data-convo="' + aiEsc(c.id) + '">' + aiEsc(c.title) + '</button>';
      }).join('');
    })
    .catch(function () { list.innerHTML = ''; });
}

function aiLoadGallery(kind) {
  var el = document.getElementById('ai-' + kind + '-gallery');
  if (!el) return;
  el.innerHTML = '<div class="ai-media"><div class="ai-media__img ai-skeleton"></div></div>'.repeat(3);
  aiPost({ mode: 'ai-media', op: kind === 'images' ? 'list-images' : 'list-videos' })
    .then(function (r) {
      var items = r.images || r.videos || [];
      el.innerHTML = '';
      items.forEach(function (i) { el.appendChild(aiMediaCard(i)); });
    })
    .catch(function () { el.innerHTML = ''; });
}

function aiLoadProjects() {
  var el = document.getElementById('ai-projects-list');
  if (!el) return;
  aiPost({ mode: 'ai-projects', op: 'list' })
    .then(function (r) {
      el.innerHTML = (r.projects || []).map(function (p) {
        return '<div class="ai-card"><div class="ai-card__name">' + aiEsc(p.name) + '</div></div>';
      }).join('');
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

  aiWireUploads();
  aiWireContextPopover();

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
  document.getElementById('ai-thread-inner').innerHTML = '';
  document.getElementById('ai-thread').hidden = true;
  document.getElementById('ai-composer').hidden = true;
  var landing = document.getElementById('ai-landing');
  landing.hidden = false;
  landing.querySelector('.ai-landing__inner')
    .insertBefore(document.getElementById('ai-input-form'), document.getElementById('ai-context-btn').parentNode);
  aiMascot('idle');
  aiSetPanel('chat');
}

function aiOpenConversation(id) {
  aiState.conversationId = id;
  aiEnterThread();
  var inner = document.getElementById('ai-thread-inner');
  inner.innerHTML = '<div class="ai-skeleton" style="height:64px"></div>';
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
      aiState.attachments.push({
        mediaType: f.type,
        data: String(reader.result).split(',')[1]
      });
      var chip = document.createElement('span');
      chip.className = 'ai-tag';
      chip.textContent = f.name;
      strip.appendChild(chip);
      aiSetSendEnabled(true);
    };
    reader.readAsDataURL(f);
  });
}

/* ── 6. Context popover ───────────────────────────────────────────────────── */
function aiWireContextPopover() {
  var btn = document.getElementById('ai-context-btn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    var open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    if (open) return;
    aiPost({ mode: 'ai-context' }).then(function (r) {
      // The badge reports what the backend ACTUALLY exposes, so it can never
      // claim access the assistant does not have.
      console.info('Helvaro context', r.sources);
    }).catch(function () {});
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aiInit);
else aiInit();
`;
}

module.exports = { js };
