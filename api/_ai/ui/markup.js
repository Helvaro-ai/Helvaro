'use strict';
/*
 * Helvaro AI — workspace markup.
 *
 * SCAFFOLD: structurally complete. Every element the client script addresses
 * exists here with its final id/class. Content that comes from the backend
 * (conversations, cards, galleries) is rendered by client.js into the
 * containers below.
 *
 * Returns plain strings spliced into api/dashboard.js's HTML template literal.
 * Because these are ordinary files rather than text inside that template,
 * nothing here needs backtick or ${} escaping.
 *
 * ── Language ─────────────────────────────────────────────────────────────────
 * The dashboard is Dutch; requirement text is English. Visible strings follow
 * the product (Dutch), matching every other page in api/dashboard.js. The
 * English headings in the brief map as:
 *   "What are we working on?"   → "Waar werken we aan?"
 *   "Ask Helvaro anything…"     → "Vraag Helvaro alles…"
 */

const QUICK_ACTIONS = require('./quick-actions');

/* ── 1. Workspace switcher ─────────────────────────────────────────────────
   Mounted in the topbar. Two buttons, no <select>, no popover — requirement 1
   is explicit that this must not be a dropdown. role="tablist" is the honest
   ARIA mapping: two panels, one visible at a time. */
function switcher() {
  return `
  <div class="workspace-switch" role="tablist" aria-label="Werkruimte">
    <button class="workspace-switch__btn active" role="tab" aria-selected="true"
            id="ws-crm" data-workspace="crm">CRM</button>
    <span class="workspace-switch__sep" aria-hidden="true"></span>
    <button class="workspace-switch__btn" role="tab" aria-selected="false"
            id="ws-ai" data-workspace="ai">AI</button>
  </div>`;
}

/* ── 3. AI sidebar ─────────────────────────────────────────────────────────
   Replaces the CRM nav inside the SAME .sidebar shell — the logo, the bottom
   user block and the mobile drawer behaviour are inherited untouched, which is
   what requirement 3's "keep the existing Helvaro sidebar" means in practice.

   Recent conversations are rendered by client.js from real data; the six items
   in the brief are seed examples, not hardcoded rows. */
function sidebar() {
  return `
  <nav class="sidebar-nav ai-sidebar" id="ai-sidebar">

    <button class="ai-sidebar__new" id="ai-new-convo">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nieuw gesprek
    </button>

    <button class="nav-item" id="ai-nav-search" data-ai-page="search">
      <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
      Zoeken
    </button>
    <button class="nav-item" id="ai-nav-recent" data-ai-page="recent">
      <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg></span>
      Recent
    </button>
    <button class="nav-item" id="ai-nav-favorites" data-ai-page="favorites">
      <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
      Favorieten
    </button>
    <button class="nav-item" id="ai-nav-projects" data-ai-page="projects">
      <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg></span>
      Projecten
    </button>

    <div class="nav-divider"></div>

    <div class="ai-sidebar__section">Maken</div>
    <button class="nav-item" id="ai-nav-images" data-ai-page="images">
      <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>
      Beelden
    </button>
    <button class="nav-item" id="ai-nav-videos" data-ai-page="videos">
      <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="14" height="14" rx="2"/><polygon points="22 7 16 12 22 17"/></svg></span>
      Video's
    </button>

    <div class="nav-divider"></div>

    <div class="ai-sidebar__section">Recent</div>
    <div class="ai-sidebar__convos" id="ai-convo-list">
      <!-- rendered by client.js; skeleton rows while loading -->
    </div>

    <div class="sidebar-bottom">
      <button class="nav-item" id="ai-nav-settings">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
        Instellingen
      </button>
      <button class="nav-item" id="ai-nav-account">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></span>
        Account
      </button>
    </div>
  </nav>`;
}

/* ── 4/5/6. Landing screen ─────────────────────────────────────────────────
   Mascot → question → subtext → input → context indicator → quick actions.
   The input sits above the quick actions and carries the focus ring, which is
   what makes it "the visual focus of the page" (requirement 4). */
function landing() {
  return `
  <div class="ai-landing" id="ai-landing">
    <div class="ai-landing__inner">

      <img class="ai-mascot" id="ai-mascot" data-state="idle"
           src="/ai/falcon-idle.webp" alt="" width="88" height="88" draggable="false">

      <h1 class="ai-landing__title">Waar werken we aan?</h1>
      <p class="ai-landing__sub">Vraag Helvaro alles over je leads, panden, gesprekken of marketing.</p>

      ${input()}

      <div style="text-align:center">
        <button class="ai-context" id="ai-context-btn" aria-expanded="false">
          <span class="ai-context__dot" aria-hidden="true"></span>
          Helvaro-context
          <span style="color:var(--text-disabled)">Leads · Panden · Gesprekken · Analytics</span>
        </button>
      </div>

      ${quickActions()}
    </div>
  </div>`;
}

/* The input is shared between the landing screen and the conversation view —
   one component, two mount points, so behaviour cannot drift between them. */
function input() {
  return `
  <form class="ai-input" id="ai-input-form">
    <textarea class="ai-input__field" id="ai-input-field" rows="1"
              placeholder="Vraag Helvaro alles…" autocomplete="off"></textarea>

    <div class="ai-input__attachments" id="ai-attachments"></div>

    <div class="ai-input__bar">
      <button type="button" class="ai-tool-btn" id="ai-btn-attach" title="Bestand toevoegen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
        Bijlage
      </button>
      <button type="button" class="ai-tool-btn" id="ai-btn-property">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        Pand
      </button>
      <button type="button" class="ai-tool-btn" id="ai-btn-commands" title="Commando's">/</button>

      <span class="ai-input__spacer"></span>

      <button type="button" class="ai-tool-btn" id="ai-model-btn" aria-haspopup="listbox">
        Helvaro AI · Standaard
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      <button type="submit" class="ai-send" id="ai-send" disabled aria-label="Versturen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
      </button>
    </div>

    <input type="file" id="ai-file-input" accept="image/*" multiple hidden>
  </form>`;
}

/* ── 5. Quick actions ──────────────────────────────────────────────────────
   Definitions live in ./quick-actions.js because both this markup and the
   client's click handler need them, and the prompt each one sends is the
   contract between them. */
function quickActions() {
  const group = (g) => `
    <div class="ai-quick__group">
      <div class="ai-quick__label">${g.label}</div>
      <div class="ai-quick__actions">
        ${g.actions.map((a) => `<button class="ai-quick__action" data-quick="${a.id}">${a.label}</button>`).join('')}
      </div>
    </div>`;
  return `<div class="ai-quick">${QUICK_ACTIONS.GROUPS.map(group).join('')}</div>`;
}

/* ── 7. Conversation view ──────────────────────────────────────────────────
   Hidden until the first message is sent, at which point the landing screen
   is swapped for this and the input moves into the composer slot. */
function thread() {
  return `
  <div class="ai-thread" id="ai-thread" hidden>
    <div class="ai-thread__inner" id="ai-thread-inner"></div>
  </div>
  <div class="ai-composer" id="ai-composer" hidden>
    <div class="ai-thread__inner"><!-- input is moved here on first send --></div>
  </div>`;
}

/* ── 9/10/12. Sub-workspaces ───────────────────────────────────────────────
   Each is its own panel inside the AI workspace, switched by the sidebar.
   Controls are laid out here; their option lists are populated from
   api/_ai/media.js via the ai-media/styles call, so the style list has ONE
   source of truth rather than a copy in the markup. */
function subPages() {
  return `
  <div class="ai-panel" id="ai-panel-images" hidden>
    <div class="ai-panel__controls" id="ai-images-controls"></div>
    <div class="ai-gallery" id="ai-images-gallery"></div>
  </div>

  <div class="ai-panel" id="ai-panel-videos" hidden>
    <div class="ai-panel__controls" id="ai-videos-controls"></div>
    <div class="ai-gallery ai-gallery--video" id="ai-videos-gallery"></div>
  </div>

  <div class="ai-panel" id="ai-panel-projects" hidden>
    <div id="ai-projects-list"></div>
  </div>`;
}

/* The whole workspace, mounted as a sibling of the CRM's .page sections. */
function workspace() {
  return `
  <div class="ai-workspace" id="ai-workspace">
    ${landing()}
    ${thread()}
    ${subPages()}
  </div>`;
}

module.exports = { switcher, sidebar, workspace, landing, thread, input, quickActions, subPages };
