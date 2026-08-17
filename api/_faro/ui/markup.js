'use strict';
/*
 * Faro — workspace markup.
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
 * 1. Quick-action icons are colour-coded per action (see ./quick-actions.js
 *    `hue` and ./tokens.js --ic-*). Every OTHER icon in the workspace stays
 *    monochrome on currentColor — the colour is scoped to the nine action
 *    chips, which is what keeps it from becoming a second palette.
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

/* ── Launcher ──────────────────────────────────────────────────────────────
   Faro's ONLY entry point. A pill in the topbar, not a sidebar item and not a
   workspace switcher.

   Why: the CRM sidebar already carries twelve items. Adding a thirteenth to
   reach an assistant is the wrong trade, and a CRM|AI switcher was worse — it
   split the product into two worlds when the whole value of this thing is that
   it lives inside the one you are already in. The launcher costs no nav weight,
   is reachable from every page, and Faro opens ON TOP of whatever you were
   looking at rather than replacing it. */
function launcher(t) {
  return `
      <button class="faro-launch" id="faro-launch" aria-haspopup="dialog" aria-expanded="false">
        ${icon('spark', 14)}
        <span class="faro-launch__label">${t('ws.title')}</span>
        <kbd class="faro-launch__kbd" id="faro-launch-kbd"></kbd>
      </button>`;
}

/* ── Overlay rail ──────────────────────────────────────────────────────────
   Faro's own navigation, INSIDE the overlay. This is what keeps conversations,
   Images and Projects reachable without any of them touching the CRM sidebar. */
function rail(t) {
  const item = (id, ic, label, page) => `
        <button class="faro-rail__item" id="faro-nav-${id}" data-faro-page="${page}">
          <span class="faro-rail__icon">${icon(ic, 15)}</span>${label}
        </button>`;

  return `
      <nav class="faro-rail">
        <button class="faro-rail__new" id="faro-new-convo">
          ${icon('plus', 14)}${t('sb.new')}
        </button>

        ${item('chat', 'message', t('sb.recent'), 'chat')}
        ${item('images', 'image', t('sb.images'), 'images')}
        ${item('videos', 'video', t('sb.videos'), 'videos')}
        ${item('projects', 'folder', t('sb.projects'), 'projects')}

        <div class="faro-rail__section">${t('sb.conversations')}</div>
        <div class="faro-rail__convos" id="faro-convo-list"></div>
        <button class="faro-rail__viewall" id="faro-view-all-convos">${t('sb.viewAllConvos')}</button>

        <div class="faro-rail__tail">
          <div class="faro-rail__badge">
            <div class="faro-rail__badge-title">${icon('spark', 12)} ${t('ws.title')}</div>
            <div class="faro-rail__badge-sub">${t('sb.poweredBy')}</div>
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
      <div class="faro-landing" id="faro-landing">
        <div class="faro-landing__inner">

          <img class="faro-mascot" id="faro-mascot" data-state="idle"
               src="/faro/falcon-idle.webp" alt="" width="72" height="72"
               draggable="false" onerror="this.classList.add('faro-mascot--missing')">

          <h1 class="faro-landing__title">${t('land.title')}</h1>
          <p class="faro-landing__sub">${t('land.sub')}</p>

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
      <form class="faro-input" id="faro-input-form">
        <textarea class="faro-input__field" id="faro-input-field" rows="1"
                  placeholder="${t('in.placeholder')}" autocomplete="off"
                  aria-label="${t('in.placeholder')}"></textarea>

        <div class="faro-input__attachments" id="faro-attachments"></div>

        <div class="faro-input__bar">
          <button type="button" class="faro-tool-btn faro-tool-btn--icon" id="faro-btn-attach"
                  title="${t('in.attach')}" aria-label="${t('in.attach')}">${icon('paperclip', 15)}</button>
          <button type="button" class="faro-tool-btn" id="faro-btn-property">
            ${icon('home', 14)}<span>${t('in.property')}</span>
          </button>
          <button type="button" class="faro-tool-btn" id="faro-btn-commands">
            ${icon('slash', 14)}<span>${t('in.command')}</span>
          </button>

          <span class="faro-input__spacer"></span>

          <button type="button" class="faro-tool-btn faro-model-btn" id="faro-model-btn" aria-haspopup="listbox">
            ${icon('spark', 13)}<span id="faro-model-label">${t('ws.title')}</span>${icon('chevron', 12)}
          </button>

          <button type="submit" class="faro-send" id="faro-send" disabled aria-label="${t('in.send')}">
            ${icon('arrowUp', 16)}
          </button>
        </div>

        <input type="file" id="faro-file-input" accept="image/*" multiple hidden>
      </form>`;
}

/* ── 6. Helvaro context ────────────────────────────────────────────────────
   Chips are rendered by client.js from the backend's own source list, so the
   badge can never claim access the assistant does not actually have.

   `Manage` came from the design, not the brief. It is wired as a panel that
   toggles sources; a disabled source must cause the orchestrator to WITHHOLD
   the matching tools, not merely hide a chip — otherwise the control is
   decorative. See api/_faro/prompt.js contextSources(). */
function context(t) {
  return `
      <div class="faro-context-row">
        <span class="faro-context-row__label">${t('ctx.label')}</span>
        <div class="faro-context-row__chips" id="faro-context-chips"></div>
        <button class="faro-context-row__manage" id="faro-context-btn" aria-expanded="false">
          ${t('ctx.manage')}
        </button>
      </div>
      <div class="faro-context-panel" id="faro-context-panel" hidden>
        <p class="faro-context-panel__note">${t('ctx.explain')}</p>
        <div id="faro-context-toggles"></div>
      </div>`;
}

/* ── 5. Quick actions ─────────────────────────────────────────────────────── */
function quickActions(t) {
  const row = (a) => `
          <button class="faro-quick__action" data-quick="${a.id}">
            <span class="faro-quick__icon faro-quick__icon--${a.hue}">${icon(a.icon, 16)}</span>
            <span class="faro-quick__text">${t(a.labelKey)}</span>
            <span class="faro-quick__chev">${icon('chevronR', 14)}</span>
          </button>`;

  const group = (g) => `
        <div class="faro-quick__group">
          <div class="faro-quick__label">${t(g.labelKey)}</div>
          <div class="faro-quick__actions">${g.actions.map(row).join('')}</div>
        </div>`;

  return `
      <div class="faro-section">
        <div class="faro-section__head">
          <h2 class="faro-section__title">${t('qa.title')}</h2>
          <button class="faro-pill" id="faro-view-all-actions">${t('qa.viewAll')}</button>
        </div>
        <div class="faro-quick">${QA.GROUPS.map(group).join('')}</div>
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
      <div class="faro-section">
        <div class="faro-section__head">
          <h2 class="faro-section__title">${t('act.title')}</h2>
          <button class="faro-pill" id="faro-view-all-activity">${t('act.viewAll')}</button>
        </div>
        <div class="faro-activity" id="faro-activity">
          <div class="faro-activity__track" id="faro-activity-track"></div>
          <button class="faro-activity__nav" id="faro-activity-next" aria-label="${t('act.viewAll')}">
            ${icon('chevronR', 16)}
          </button>
        </div>
      </div>`;
}

/* ── 7. Conversation view ─────────────────────────────────────────────────── */
function thread() {
  return `
      <div class="faro-thread" id="faro-thread" hidden>
        <div class="faro-thread__inner" id="faro-thread-inner"></div>
      </div>
      <div class="faro-composer" id="faro-composer" hidden>
        <div class="faro-composer__inner"><!-- input is moved here on first send --></div>
      </div>`;
}

/* ── 9/10/12. Sub-workspaces ──────────────────────────────────────────────
   Controls are populated from api/_faro/media.js via the faro-media/styles call so
   the style list has ONE source of truth rather than a copy in the markup.

   Videos ships as a visible-but-empty panel with an explicit "coming soon",
   per the deferral decision. A hidden entry would be less honest to a paying
   customer than a stated one. */
function subPages(t) {
  const panel = (id, title, body) => `
      <div class="faro-panel" id="faro-panel-${id}" hidden>
        <div class="faro-panel__head"><h2 class="faro-section__title">${title}</h2></div>
        ${body}
      </div>`;

  return [
    panel('images', t('pn.images'),
      `<div class="faro-panel__controls" id="faro-images-controls"></div>
       <div class="faro-gallery" id="faro-images-gallery"></div>`),
    panel('videos', t('pn.videos'),
      `<div class="faro-empty" id="faro-videos-empty">${t('pn.soon')}</div>
       <div class="faro-gallery faro-gallery--video" id="faro-videos-gallery"></div>`),
    panel('projects', t('pn.projects'),
      `<div id="faro-projects-list"></div>`),
  ].join('');
}

/* ── The overlay ───────────────────────────────────────────────────────────
   Mounted once, as a sibling of the CRM's .page sections, and hidden until
   launched. It sits ABOVE the CRM rather than replacing it: the page you were
   on is still there, untouched, when you close Faro.

   role="dialog" + aria-modal is the honest mapping — while Faro is open it is
   the only interactive surface, and Escape closes it. */
function overlay(t) {
  return `
    <div class="faro-overlay" id="faro-overlay" hidden>
      <div class="faro-overlay__scrim" id="faro-scrim"></div>
      <div class="faro-dialog" role="dialog" aria-modal="true" aria-label="${t('ws.title')}">

        <header class="faro-dialog__head">
          <button class="faro-dialog__rail-toggle" id="faro-rail-toggle" aria-label="${t('sb.recent')}">
            ${icon('menu', 16)}
          </button>
          <div class="faro-dialog__title">
            ${icon('spark', 15)}<span>${t('ws.title')}</span>
          </div>
          <div class="faro-dialog__sub" id="faro-dialog-sub">${t('ws.subtitle')}</div>
          <button class="faro-dialog__close" id="faro-close" aria-label="${t('st.close')}">
            ${icon('close', 16)}
          </button>
        </header>

        <div class="faro-dialog__body">
          ${rail(t)}
          <div class="faro-dialog__main">
            ${landing(t)}
            ${thread()}
            ${subPages(t)}
          </div>
        </div>
      </div>
    </div>`;
}

module.exports = { launcher, overlay, rail, landing, thread, input, context, quickActions, activity, subPages };
