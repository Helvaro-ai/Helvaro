'use strict';
/*
 * Helvaro AI — workspace markup.
 *
 * Returns plain strings spliced into api/dashboard.js's HTML template literal.
 * Because these are ordinary files rather than text inside that template,
 * nothing here needs backtick or ${} escaping.
 *
 * Every builder takes a translator `t` from ./i18n.js. Nothing is hardcoded in
 * a single language — the workspace follows the user's language setting, the
 * same registry (api/_lang.js) the WhatsApp AI already uses.
 *
 * ── Matched to the approved design, with these deliberate differences ────────
 * 1. Icons are monochrome line art, not the mockup's blue/green/orange. See
 *    ./icons.js for why.
 * 2. The switcher is centred within the TOPBAR (so, within the content area)
 *    rather than the viewport. Viewport-centring puts it visibly left of the
 *    content's midpoint because the sidebar occupies the left edge.
 * 3. Settings is present in the sidebar — the mockup omitted it, but
 *    requirement 3 lists it.
 * 4. The account block is NOT duplicated here. api/dashboard.js's existing
 *    .sidebar-bottom (credits widget, user info, logout) is shared by both
 *    workspaces, which is the whole point of "keep the existing sidebar".
 */

const QA = require('./quick-actions');
const { icon } = require('./icons');

/* ── 1. Workspace switcher ─────────────────────────────────────────────────
   Two buttons, no <select>, no popover — requirement 1 is explicit that this
   must not be a dropdown. role="tablist" is the honest ARIA mapping: two
   panels, one visible at a time. */
function switcher(t) {
  return `
      <div class="workspace-switch" role="tablist" aria-label="${t('ws.title')}">
        <button class="workspace-switch__btn active" role="tab" aria-selected="true"
                id="ws-crm" data-workspace="crm">${t('ws.crm')}</button>
        <span class="workspace-switch__sep" aria-hidden="true"></span>
        <button class="workspace-switch__btn" role="tab" aria-selected="false"
                id="ws-ai" data-workspace="ai">${t('ws.ai')}</button>
      </div>`;
}

/* ── 3. AI sidebar ─────────────────────────────────────────────────────────
   Replaces the CRM nav inside the SAME .sidebar shell, so the logo, the
   account block and the mobile drawer behaviour are inherited untouched.

   Recent conversations are rendered by client.js from real data — the items in
   the design were sample content, not a fixed list. */
function sidebar(t) {
  const navItem = (id, ic, label, page) => `
      <button class="nav-item" id="ai-nav-${id}"${page ? ` data-ai-page="${page}"` : ''}>
        <span class="nav-icon">${icon(ic, 16)}</span>${label}
      </button>`;

  return `
    <nav class="sidebar-nav ai-sidebar" id="ai-sidebar">

      <button class="ai-sidebar__new" id="ai-new-convo">
        ${icon('plus', 14)}${t('sb.new')}
      </button>

      ${navItem('search', 'search', t('sb.search'), 'search')}
      ${navItem('recent', 'clock', t('sb.recent'), 'recent')}
      ${navItem('favorites', 'star', t('sb.favorites'), 'favorites')}
      ${navItem('projects', 'folder', t('sb.projects'), 'projects')}

      <div class="nav-divider"></div>
      <div class="ai-sidebar__section">${t('sb.tools')}</div>
      ${navItem('images', 'image', t('sb.images'), 'images')}
      ${navItem('videos', 'video', t('sb.videos'), 'videos')}

      <div class="nav-divider"></div>
      <div class="ai-sidebar__section">${t('sb.conversations')}</div>
      <div class="ai-sidebar__convos" id="ai-convo-list"></div>
      <button class="ai-sidebar__viewall" id="ai-view-all-convos">${t('sb.viewAllConvos')}</button>

      <div class="ai-sidebar__tail">
        ${navItem('settings', 'settings', t('sb.settings'), 'settings')}
        <div class="ai-sidebar__badge">
          <div class="ai-sidebar__badge-title">${icon('spark', 12)} ${t('ws.title')}</div>
          <div class="ai-sidebar__badge-sub">${t('sb.poweredBy')}</div>
        </div>
      </div>
    </nav>`;
}

/* ── 4. Landing screen ─────────────────────────────────────────────────────
   Mascot → question → subtext → input → context → quick actions → activity.

   The mascot is deliberately smaller than the mockup's: requirement 4 asked
   for "subtle and relatively small" and requirement 11 for "not childish", and
   at the mockup's scale it out-competed the input, which is supposed to be the
   page's focus. Size lives in CSS so it is one number to revisit. */
function landing(t) {
  return `
      <div class="ai-landing" id="ai-landing">
        <div class="ai-landing__inner">

          <img class="ai-mascot" id="ai-mascot" data-state="idle"
               src="/ai/falcon-idle.webp" alt="" width="72" height="72"
               draggable="false" onerror="this.classList.add('ai-mascot--missing')">

          <h1 class="ai-landing__title">${t('land.title')}</h1>
          <p class="ai-landing__sub">${t('land.sub')}</p>

          ${input(t)}
          ${context(t)}
          ${quickActions(t)}
          ${activity(t)}
        </div>
      </div>`;
}

/* The input is shared between the landing screen and the conversation view —
   one element, moved rather than duplicated, so behaviour cannot drift. */
function input(t) {
  return `
      <form class="ai-input" id="ai-input-form">
        <textarea class="ai-input__field" id="ai-input-field" rows="1"
                  placeholder="${t('in.placeholder')}" autocomplete="off"
                  aria-label="${t('in.placeholder')}"></textarea>

        <div class="ai-input__attachments" id="ai-attachments"></div>

        <div class="ai-input__bar">
          <button type="button" class="ai-tool-btn ai-tool-btn--icon" id="ai-btn-attach"
                  title="${t('in.attach')}" aria-label="${t('in.attach')}">${icon('paperclip', 15)}</button>
          <button type="button" class="ai-tool-btn" id="ai-btn-property">
            ${icon('home', 14)}<span>${t('in.property')}</span>
          </button>
          <button type="button" class="ai-tool-btn" id="ai-btn-commands">
            ${icon('slash', 14)}<span>${t('in.command')}</span>
          </button>

          <span class="ai-input__spacer"></span>

          <button type="button" class="ai-tool-btn ai-model-btn" id="ai-model-btn" aria-haspopup="listbox">
            ${icon('spark', 13)}<span id="ai-model-label">${t('ws.title')}</span>${icon('chevron', 12)}
          </button>

          <button type="submit" class="ai-send" id="ai-send" disabled aria-label="${t('in.send')}">
            ${icon('arrowUp', 16)}
          </button>
        </div>

        <input type="file" id="ai-file-input" accept="image/*" multiple hidden>
      </form>`;
}

/* ── 6. Helvaro context ────────────────────────────────────────────────────
   Chips are rendered by client.js from the backend's own source list, so the
   badge can never claim access the assistant does not actually have.

   `Manage` came from the design, not the brief. It is wired as a panel that
   toggles sources; a disabled source must cause the orchestrator to WITHHOLD
   the matching tools, not merely hide a chip — otherwise the control is
   decorative. See api/_ai/prompt.js contextSources(). */
function context(t) {
  return `
      <div class="ai-context-row">
        <span class="ai-context-row__label">${t('ctx.label')}</span>
        <div class="ai-context-row__chips" id="ai-context-chips"></div>
        <button class="ai-context-row__manage" id="ai-context-btn" aria-expanded="false">
          ${t('ctx.manage')}
        </button>
      </div>
      <div class="ai-context-panel" id="ai-context-panel" hidden>
        <p class="ai-context-panel__note">${t('ctx.explain')}</p>
        <div id="ai-context-toggles"></div>
      </div>`;
}

/* ── 5. Quick actions ─────────────────────────────────────────────────────── */
function quickActions(t) {
  const row = (a) => `
          <button class="ai-quick__action" data-quick="${a.id}">
            <span class="ai-quick__icon">${icon(a.icon, 16)}</span>
            <span class="ai-quick__text">${t(a.labelKey)}</span>
            <span class="ai-quick__chev">${icon('chevronR', 14)}</span>
          </button>`;

  const group = (g) => `
        <div class="ai-quick__group">
          <div class="ai-quick__label">${t(g.labelKey)}</div>
          <div class="ai-quick__actions">${g.actions.map(row).join('')}</div>
        </div>`;

  return `
      <div class="ai-section">
        <div class="ai-section__head">
          <h2 class="ai-section__title">${t('qa.title')}</h2>
          <button class="ai-pill" id="ai-view-all-actions">${t('qa.viewAll')}</button>
        </div>
        <div class="ai-quick">${QA.GROUPS.map(group).join('')}</div>
      </div>`;
}

/* ── Recent AI activity ────────────────────────────────────────────────────
   Not in the brief — it came from the design, and it is the best idea there.
   A landing screen with nothing on it gives an agent no reason to return; a
   strip of what the AI has already produced does. Horizontally scrollable,
   which is also what requirement 16 asks of this pattern on mobile.

   Note the TEXT card type: listing copy is a stored, re-openable artifact,
   not just chat output. That is a store.js concern, flagged in the docs. */
function activity(t) {
  return `
      <div class="ai-section">
        <div class="ai-section__head">
          <h2 class="ai-section__title">${t('act.title')}</h2>
          <button class="ai-pill" id="ai-view-all-activity">${t('act.viewAll')}</button>
        </div>
        <div class="ai-activity" id="ai-activity">
          <div class="ai-activity__track" id="ai-activity-track"></div>
          <button class="ai-activity__nav" id="ai-activity-next" aria-label="${t('act.viewAll')}">
            ${icon('chevronR', 16)}
          </button>
        </div>
      </div>`;
}

/* ── 7. Conversation view ─────────────────────────────────────────────────── */
function thread() {
  return `
      <div class="ai-thread" id="ai-thread" hidden>
        <div class="ai-thread__inner" id="ai-thread-inner"></div>
      </div>
      <div class="ai-composer" id="ai-composer" hidden>
        <div class="ai-composer__inner"><!-- input is moved here on first send --></div>
      </div>`;
}

/* ── 9/10/12. Sub-workspaces ──────────────────────────────────────────────
   Controls are populated from api/_ai/media.js via the ai-media/styles call so
   the style list has ONE source of truth rather than a copy in the markup.

   Videos ships as a visible-but-empty panel with an explicit "coming soon",
   per the deferral decision. A hidden entry would be less honest to a paying
   customer than a stated one. */
function subPages(t) {
  const panel = (id, title, body) => `
      <div class="ai-panel" id="ai-panel-${id}" hidden>
        <div class="ai-panel__head"><h2 class="ai-section__title">${title}</h2></div>
        ${body}
      </div>`;

  return [
    panel('images', t('pn.images'),
      `<div class="ai-panel__controls" id="ai-images-controls"></div>
       <div class="ai-gallery" id="ai-images-gallery"></div>`),
    panel('videos', t('pn.videos'),
      `<div class="ai-empty" id="ai-videos-empty">${t('pn.soon')}</div>
       <div class="ai-gallery ai-gallery--video" id="ai-videos-gallery"></div>`),
    panel('projects', t('pn.projects'),
      `<div id="ai-projects-list"></div>`),
  ].join('');
}

/** The whole workspace, mounted as a sibling of the CRM's .page sections. */
function workspace(t) {
  return `
    <div class="ai-workspace" id="ai-workspace">
      ${landing(t)}
      ${thread()}
      ${subPages(t)}
    </div>`;
}

module.exports = { switcher, sidebar, workspace, landing, thread, input, context, quickActions, activity, subPages };
