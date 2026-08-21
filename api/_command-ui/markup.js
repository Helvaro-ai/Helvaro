'use strict';
/*
 * Command Center — server-rendered shell.
 *
 * Everything below the greeting is filled by the client from one request, so
 * this file emits structure and empty containers rather than content. That is
 * deliberate: the page must never ship a number the server has not read from
 * the tenant's own records, and a server-rendered placeholder figure is
 * exactly how fake data ends up in a screenshot.
 *
 * Reading order is the whole design: what needs attention, why, what Helvaro
 * recommends, one action. The revenue strip sits ABOVE the opportunities on
 * desktop and BELOW them on mobile (see styles.js) — on a phone the answer to
 * "what do I do now" has to be the first thing on screen, and five KPIs pushing
 * it under the fold defeats the point of the page.
 */

const ICONS = {
  flame:    'M12 2s1 3-1 5-3 2-3 5a4 4 0 0 0 8 0c0-2-1-3-1-5 2 1 3 3 3 5a6 6 0 1 1-12 0c0-5 6-6 6-10z',
  calendar: 'M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  alert:    'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  euro:     'M18 7a6 6 0 1 0 0 10M3 12h9M3 9h9',
  snow:     'M12 2v20M4.9 6.5l14.2 11M19.1 6.5 4.9 17.5',
  spark:    'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  arrow:    'M5 12h14M13 6l6 6-6 6',
  close:    'M18 6 6 18M6 6l12 12',
  chart:    'M3 3v18h18M7 15l4-4 3 3 5-6',
};

function icon(name, size) {
  const d = ICONS[name] || ICONS.spark;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" `
    + `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

/* ── The briefing, rendered INSIDE Faro's landing screen ────────────────────
   These used to be their own page. Faro and the Command Center answered two
   halves of the same question -- "what happened" and "what do I do about it"
   -- from opposite sides of a nav item, and you had to know which half you
   wanted before you could look at either. They are one screen now: the ask bar
   at the top, what happened underneath it.

   No <main> and no page wrapper: these sections are spliced into the Faro
   landing (api/_faro/ui/markup.js landing()), which owns the scroll container
   and the width. */
function sections(t) {
  return `
        <!-- Error. Shown instead of the briefing, never alongside a blank one:
             an empty briefing reads as a quiet morning, which is the opposite
             of "we could not reach your CRM". -->
        <div class="cmd-error" id="cmd-error" hidden>
          <p class="cmd-error__text" id="cmd-error-text">${t('err.unavailable')}</p>
          <button class="cmd-btn cmd-btn--ghost" id="cmd-retry">${t('err.retry')}</button>
        </div>

        <div id="cmd-body" hidden>
          <section class="cmd-brief" id="cmd-brief" hidden>
            <div class="cmd-brief__counts" id="cmd-brief-counts"></div>
            <div class="cmd-brief__top" id="cmd-brief-top"></div>
          </section>

          <section class="cmd-section cmd-section--opps">
            <div class="cmd-section__head">
              <h2 class="cmd-section__title">${t('opp.title')}</h2>
              <button class="cmd-btn cmd-btn--ghost" id="cmd-review-all">${t('opp.all')}</button>
            </div>
            <div class="cmd-opps" id="cmd-opps"></div>
          </section>

          <section class="cmd-kpis" id="cmd-kpis" aria-label="${t('kpi.pipeline')}"></section>

          <section class="cmd-section cmd-section--insights">
            <div class="cmd-section__head">
              <h2 class="cmd-section__title">${t('insight.title')}</h2>
            </div>
            <div class="cmd-insights" id="cmd-insights"></div>
          </section>
        </div>`;
}

/* The Autopilot control. Rendered into Faro's header rather than the landing
   body, because it is a state of the assistant rather than a part of the
   briefing. */
function autopilot(t) {
  return `
          <button class="cmd-auto" id="cmd-autopilot" type="button" aria-pressed="true"
                  title="${t('auto.explain')}">
            <span class="cmd-auto__dot" aria-hidden="true"></span>
            <span class="cmd-auto__text">
              <span class="cmd-auto__title">${t('auto.title')}</span>
              <span class="cmd-auto__state" id="cmd-auto-state">${t('auto.active')}</span>
            </span>
          </button>`;
}

/* The lead drawer. A page-level overlay, so it is mounted beside the Faro page
   rather than inside its scroll container. */
function drawer(t) {
  return `
      <aside class="cmd-drawer" id="cmd-drawer" hidden aria-label="${t('drawer.openLead')}">
        <div class="cmd-drawer__scrim" id="cmd-drawer-scrim"></div>
        <div class="cmd-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="cmd-drawer-name">
          <header class="cmd-drawer__head">
            <h3 class="cmd-drawer__name" id="cmd-drawer-name"></h3>
            <button class="cmd-drawer__close" id="cmd-drawer-close" aria-label="${t('drawer.close')}">
              ${icon('close', 16)}
            </button>
          </header>
          <div class="cmd-drawer__body" id="cmd-drawer-body"></div>
        </div>
      </aside>`;
}

module.exports = { sections, autopilot, drawer, icon, ICONS };
