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

/* ── Dock ──────────────────────────────────────────────────────────────────
   Faro's entry point: a slim bar along the bottom of every CRM page.

   It replaced a launcher pill in the topbar, and the reason is the whole
   argument for this feature. A pill is a door — you have to decide to open it,
   which means deciding you have a question, which means Faro only ever gets
   used by someone who already thought of using it. A bar with a cursor in it is
   an invitation: it sits in peripheral vision while you look at the pipeline,
   and asking costs one keystroke instead of a click plus a context switch.

   It is a real <input>, not a fake one. Typing goes straight in; Enter opens
   Faro with the message already sending, so the first question never costs the
   user a round trip through an empty screen.

   Rendered as the last flex child of .main-content — NOT fixed-position — so it
   can never overlap page content. .page-content is already `flex:1` with its
   own scroll, so it simply gets shorter. */
function dock(t) {
  return `
    <div class="faro-dock" id="faro-dock">
      <div class="faro-dock__inner">
        <span class="faro-dock__spark">${icon('spark', 15)}</span>
        <input class="faro-dock__input" id="faro-dock-input" type="text"
               autocomplete="off" placeholder="${t('dock.placeholder')}"
               aria-label="${t('dock.placeholder')}">
        <kbd class="faro-dock__kbd" id="faro-dock-kbd"></kbd>
        <button class="faro-dock__open" id="faro-dock-open" aria-haspopup="dialog"
                aria-label="${t('ws.title')}">${icon('arrowUp', 15)}</button>
      </div>
    </div>`;
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
        <!-- Said out loud rather than implied. Conversations are kept in
             localStorage until the server-side store exists, which means they
             do not follow the user to another device and a colleague does not
             see them. A history that silently fails to sync is worse than one
             that says where it lives. -->
        <p class="faro-rail__hint">${t('sb.localOnly')}</p>

        <!-- The "Faro — works on your own business data" badge that used to sit
             here is gone. It said the same thing as the sidebar's Faro button
             two columns to its left, and once Faro became a page those two were
             visible at the same time, on the same screen, saying it twice. -->
      </nav>`;
}

/* ── 4. Landing screen ─────────────────────────────────────────────────────
   Mascot → question → subtext → input → context → quick actions → activity.

   The mascot is deliberately smaller than the mockup's: requirement 4 asked
   for "subtle and relatively small" and requirement 11 for "not childish", and
   at the mockup's scale it out-competed the input, which is supposed to be the
   page's focus. Size lives in CSS so it is one number to revisit. */
function landing(t, opts = {}) {
  return `
      <div class="faro-landing" id="faro-landing">
        <div class="faro-landing__inner">

          <!-- The mark. The orb is CSS -- no asset, no request, no 404 -- and it
               carries the six states on its own, so Faro has a face on a fresh
               checkout where public/faro/ is empty. The falcon renders on top
               of it when the artwork exists; until then the orb IS the mascot,
               which is why it is not decorative and not hidden from the flow. -->
          <div class="faro-mark" id="faro-mark" data-state="idle">
            <span class="faro-orb" aria-hidden="true"></span>
            <img class="faro-mascot" id="faro-mascot" data-state="idle"
                 src="/faro/falcon-idle.webp" alt="" width="72" height="72"
                 draggable="false" onerror="this.classList.add('faro-mascot--missing')">
          </div>

          <!-- Server-rendered as the plain question, which is what a no-JS or
               pre-hydration render shows. The client upgrades the headline to a
               time-aware, named greeting and demotes the question to the line
               below -- it needs the clock and the signed-in name, neither of
               which this request has. Nothing here depends on that upgrade. -->
          <h1 class="faro-landing__title" id="faro-greeting">${t('land.title')}</h1>
          <p class="faro-landing__lead" id="faro-landing-title" hidden>${t('land.title')}</p>
          <p class="faro-landing__sub">${t('land.sub')}</p>

          ${input(t)}
          ${context(t)}

          <!-- What happened. The Command Center's briefing, opportunities, KPIs
               and insights render here (api/_command-ui/markup.js sections()).
               Directly under the ask bar on purpose: the page asks how it can
               help, and immediately shows what it already found. Empty string
               when the Command Center is disabled, which leaves the original
               landing screen exactly as it was. -->
          ${opts.landingExtra || ''}

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
  const panel = (id, title, body, extra) => `
      <div class="faro-panel" id="faro-panel-${id}" hidden>
        <div class="faro-panel__head">
          <h2 class="faro-section__title">${title}</h2>
          ${extra || ''}
        </div>
        ${body}
      </div>`;

  return [
    // Galleries only. Generation lives in the chat — see client.js's
    // "Beelden & Video's — galleries, not generators".
    // The Vergelijking & PDF link is the ONLY route left to the old ai-beeld
    // page, which is no longer in the CRM sidebar. Those two tools were never
    // ported; drop this link and the page becomes unreachable.
    panel('images', t('pn.images'),
      `<div id="faro-images-empty"></div>
       <div class="faro-gallery" id="faro-images-gallery"></div>`,
      `<button class="faro-pill" id="faro-img-advanced">${t('im.advanced')}</button>`),
    panel('videos', t('pn.videos'),
      `<div id="faro-videos-empty"></div>
       <div class="faro-gallery faro-gallery--video" id="faro-videos-gallery"></div>`),
    panel('projects', t('pn.projects'),
      `<div id="faro-projects-list"></div>`),
  ].join('');
}

/* ── Sidebar entry ─────────────────────────────────────────────────────────
   Deliberately NOT a thirteenth nav row. The CRM's nav list was already
   carrying twelve items when Faro was designed, and adding a thirteenth of
   equal weight is what made an overlay look like the only option. This is a
   primary action ABOVE that list -- the same shape as the "new chat" button
   every assistant puts there -- so Faro reads as a mode you enter rather than
   one more report to go and read.

   It lives here, not in dashboard.js, for two reasons: the copy is translated
   like the rest of Faro, and Faro stays removable in one piece. */
function navCta(t) {
  return `
    <button class="faro-nav-cta" id="faro-nav-cta" type="button">
      <span class="faro-nav-cta__mark" aria-hidden="true"></span>
      <span class="faro-nav-cta__text">
        <span class="faro-nav-cta__title">${t('ws.title')}</span>
        <span class="faro-nav-cta__sub">${t('sb.poweredBy')}</span>
      </span>
    </button>`;
}

/* ── The Faro page ─────────────────────────────────────────────────────────
   Faro is its own page, a sibling of the CRM's other .page sections, shown by
   the same navigateTo() that shows Dashboard or Pipeline.

   It was an overlay first -- a dialog floating above whatever CRM page you
   were on. That worked, but it made Faro a thing you visited and dismissed
   rather than a place you work, and it meant two surfaces (the CRM page
   underneath, the dialog above) fighting for the same screen. A page has no
   scrim, no z-index stack, no focus trap to get wrong, and it can be linked
   to and navigated back from like anything else in the app.

   No role="dialog" and no aria-modal any more: neither is true of a page, and
   claiming modality that the page does not enforce is worse for a screen
   reader than claiming nothing. The heading below is the landmark instead. */
function page(t, opts = {}) {
  /* `active` is on the element as rendered: this is the home page, showing
     before any script runs. navigateTo() manages it from there like any
     other .page. */
  return `
    <main class="page-content page faro-page active" id="page-faro">
      <div class="faro-page__body">
        ${rail(t)}
        <div class="faro-page__main">

          <!-- Mobile only. The 208px rail becomes a drawer under 860px -- the
               same move the CRM's own sidebar makes at that width -- and a
               drawer needs a handle. Hidden on desktop, where the rail is
               simply always there. -->
          <button class="faro-page__rail-toggle" id="faro-rail-toggle" aria-label="${t('sb.recent')}">
            ${icon('menu', 16)}
          </button>

          <!-- Autopilot. A state of the assistant rather than part of the
               briefing, so it sits with the page and not in the scroll. -->
          ${opts.headerExtra || ''}

          ${landing(t, opts)}
          ${thread()}
          ${subPages(t)}
        </div>
      </div>
    </main>`;
}

module.exports = { dock, navCta, page, rail, landing, thread, input, context, quickActions, activity, subPages };
