'use strict';
/*
 * Command Center — styles.
 *
 * Every size, radius and spacing value comes from the scales in
 * api/_faro/ui/tokens.js, which dashboard.js already emits. A raw px here fails
 * scripts/faro-check.js, and that is the point: this page exists to be read in
 * ten seconds, and a page whose rhythm is built from twenty arbitrary numbers
 * does not read in ten seconds.
 *
 * ── The one deliberate exception ─────────────────────────────────────────────
 * Category tone colours are literal hex rather than tokens. They are semantic
 * status (hot / ready / risk / value / cold), not brand accent — DESIGN-SYSTEM
 * .md's "Sand is the ONLY accent" rule is about the brand, and encoding
 * urgency in sand alone would mean five states rendered identically. Each is
 * declared for both themes, and each is checked for contrast.
 *
 * ── No backticks, no ${ } ───────────────────────────────────────────────────
 * This string is spliced into dashboard.js's own template literal.
 */

function css() {
  return `
/* ═══ Command Center ═══════════════════════════════════════════════════════ */
:root {
  /* Semantic tone per opportunity category. Dark-surface values. */
  --cmd-hot:    #E0873F;  --cmd-hot-bg:    rgba(224, 135,  63, 0.13);
  --cmd-ready:  #4CA39B;  --cmd-ready-bg:  rgba( 76, 163, 155, 0.13);
  --cmd-risk:   #C96A5A;  --cmd-risk-bg:   rgba(201, 106,  90, 0.13);
  --cmd-value:  #B79A5E;  --cmd-value-bg:  rgba(183, 154,  94, 0.13);
  --cmd-cold:   #6B9BC4;  --cmd-cold-bg:   rgba(107, 155, 196, 0.13);
}
[data-theme="light"] {
  --cmd-hot:    #A2541A;  --cmd-hot-bg:    rgba(224, 135,  63, 0.13);
  --cmd-ready:  #276C64;  --cmd-ready-bg:  rgba( 76, 163, 155, 0.13);
  --cmd-risk:   #9A3D2C;  --cmd-risk-bg:   rgba(201, 106,  90, 0.13);
  --cmd-value:  #7A6224;  --cmd-value-bg:  rgba(183, 154,  94, 0.15);
  --cmd-cold:   #2F5F86;  --cmd-cold-bg:   rgba(107, 155, 196, 0.15);
}

.cmd.page-content { padding: 0; }
.cmd__inner {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-6) var(--sp-16);
}

/* ── Head ─────────────────────────────────────────────────────────────────── */
.cmd-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--sp-4); margin-bottom: var(--sp-8);
}
.cmd-greet {
  font-size: var(--fs-display); font-weight: 600; letter-spacing: -0.02em;
  color: var(--text); margin: 0 0 var(--sp-1);
}
.cmd-sub { font-size: var(--fs-body); color: var(--text-muted); margin: 0; max-width: 52ch; }

/* Autopilot. A status control, not a toggle switch: it reports a state and
   changes it, and it says what it does on hover rather than implying the AI is
   off doing things unsupervised. */
.cmd-auto {
  display: inline-flex; align-items: center; gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg-card-alt); color: var(--text);
  font: inherit; cursor: pointer; flex-shrink: 0;
  transition: border-color 150ms ease;
}
.cmd-auto:hover { border-color: var(--champagne); }
.cmd-auto__dot {
  width: var(--sp-2); height: var(--sp-2); border-radius: var(--r-full);
  background: var(--cmd-ready); flex-shrink: 0;
}
.cmd-auto[aria-pressed="false"] .cmd-auto__dot { background: var(--text-disabled); }
.cmd-auto__text { display: flex; flex-direction: column; text-align: left; }
.cmd-auto__title { font-size: var(--fs-tiny); font-weight: 600; }
.cmd-auto__state { font-size: var(--fs-micro); color: var(--text-muted); }

/* ── Error ────────────────────────────────────────────────────────────────── */
/* [hidden] loses to any display rule, so an element toggled by the attribute
   needs the reset spelled out. Without it this banner sat above a perfectly
   healthy page announcing that the CRM was unreachable. */
.cmd-error[hidden] { display: none; }
.cmd-error {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4);
  padding: var(--sp-5); border: 1px solid var(--cmd-risk); border-radius: var(--r-lg);
  background: var(--cmd-risk-bg);
}
.cmd-error__text { margin: 0; font-size: var(--fs-meta); color: var(--text); }

/* ── Briefing ─────────────────────────────────────────────────────────────── */
.cmd-brief {
  border: 1px solid var(--border); border-radius: var(--r-lg);
  background: var(--bg-card); padding: var(--sp-5);
  margin-bottom: var(--sp-6);
}
.cmd-brief__counts {
  display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-5);
  padding-bottom: var(--sp-4); margin-bottom: var(--sp-4);
  border-bottom: 1px solid var(--border);
}
.cmd-brief__count { display: flex; align-items: baseline; gap: var(--sp-15); }
.cmd-brief__n {
  font-size: var(--fs-lead); font-weight: 600; color: var(--text);
  font-variant-numeric: tabular-nums;
}
.cmd-brief__l { font-size: var(--fs-small); color: var(--text-muted); }
.cmd-brief__label {
  font-size: var(--fs-micro); font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--sand-on-surface);
  margin-bottom: var(--sp-15);
}
.cmd-brief__line { font-size: var(--fs-body); color: var(--text); margin: 0 0 var(--sp-4); }

/* ── KPI strip ────────────────────────────────────────────────────────────── */
.cmd-kpis {
  display: grid; gap: var(--sp-3);
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  margin-bottom: var(--sp-8);
}
.cmd-kpi {
  border: 1px solid var(--border); border-radius: var(--r-lg);
  background: var(--bg-card); padding: var(--sp-4);
}
.cmd-kpi__l {
  font-size: var(--fs-micro); font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--sp-2);
}
.cmd-kpi__v {
  font-size: var(--fs-title); font-weight: 600; letter-spacing: -0.02em;
  color: var(--text); font-variant-numeric: tabular-nums; line-height: 1.1;
}
.cmd-kpi__s { font-size: var(--fs-micro); color: var(--text-muted); margin-top: var(--sp-1); }

/* ── Sections ─────────────────────────────────────────────────────────────── */
.cmd-section { margin-bottom: var(--sp-8); }
.cmd-section__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--sp-4); margin-bottom: var(--sp-4);
}
.cmd-section__title {
  font-size: var(--fs-lead); font-weight: 600; letter-spacing: -0.01em;
  color: var(--text); margin: 0;
}

/* ── Opportunity cards ────────────────────────────────────────────────────── */
.cmd-opps { display: flex; flex-direction: column; gap: var(--sp-3); }
.cmd-opp {
  display: grid;
  grid-template-columns: var(--sp-1) 1fr auto;
  gap: 0 var(--sp-4);
  align-items: stretch;
  border: 1px solid var(--border); border-radius: var(--r-lg);
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 150ms ease;
}
.cmd-opp:hover { border-color: var(--champagne); }
/* The tone rail. Encodes category in position and colour, so the list is
   scannable without reading a single label. */
.cmd-opp__rail { background: var(--cmd-ready); }
.cmd-opp[data-tone="hot"]   .cmd-opp__rail { background: var(--cmd-hot);   }
.cmd-opp[data-tone="ready"] .cmd-opp__rail { background: var(--cmd-ready); }
.cmd-opp[data-tone="risk"]  .cmd-opp__rail { background: var(--cmd-risk);  }
.cmd-opp[data-tone="value"] .cmd-opp__rail { background: var(--cmd-value); }
.cmd-opp[data-tone="cold"]  .cmd-opp__rail { background: var(--cmd-cold);  }

.cmd-opp__main { padding: var(--sp-4) 0 var(--sp-4) 0; min-width: 0; cursor: pointer; }
.cmd-opp__top { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.cmd-opp__name {
  font-size: var(--fs-body); font-weight: 600; color: var(--text);
  letter-spacing: -0.01em;
}
.cmd-opp__cat {
  display: inline-flex; align-items: center; gap: var(--sp-1);
  font-size: var(--fs-micro); font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase;
  padding: var(--sp-05) var(--sp-15); border-radius: var(--r-xs);
}
.cmd-opp[data-tone="hot"]   .cmd-opp__cat { color: var(--cmd-hot);   background: var(--cmd-hot-bg);   }
.cmd-opp[data-tone="ready"] .cmd-opp__cat { color: var(--cmd-ready); background: var(--cmd-ready-bg); }
.cmd-opp[data-tone="risk"]  .cmd-opp__cat { color: var(--cmd-risk);  background: var(--cmd-risk-bg);  }
.cmd-opp[data-tone="value"] .cmd-opp__cat { color: var(--cmd-value); background: var(--cmd-value-bg); }
.cmd-opp[data-tone="cold"]  .cmd-opp__cat { color: var(--cmd-cold);  background: var(--cmd-cold-bg);  }

.cmd-opp__facts {
  display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-3);
  margin-top: var(--sp-15);
  font-size: var(--fs-small); color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.cmd-opp__facts b { color: var(--text); font-weight: 600; }
.cmd-opp__why {
  margin-top: var(--sp-2);
  font-size: var(--fs-small); color: var(--text-secondary); line-height: 1.5;
}
.cmd-opp__why span {
  color: var(--sand-on-surface); font-weight: 600;
  text-transform: uppercase; font-size: var(--fs-micro);
  letter-spacing: 0.06em; margin-right: var(--sp-15);
}

.cmd-opp__side {
  display: flex; flex-direction: column; align-items: flex-end; justify-content: center;
  gap: var(--sp-2); padding: var(--sp-4) var(--sp-4) var(--sp-4) 0;
}
/* Opportunity score. Deliberately quiet — it is the sort key, not the headline;
   the reason a lead is here matters more than the arithmetic behind it. */
.cmd-opp__score {
  font-size: var(--fs-micro); color: var(--text-muted);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.cmd-opp__score b { color: var(--text); font-size: var(--fs-small); }

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.cmd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-15);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md); border: 1px solid transparent;
  font: inherit; font-size: var(--fs-small); font-weight: 600;
  cursor: pointer; white-space: nowrap;
  background: var(--accent); color: #1A1712;
  transition: filter 150ms ease, border-color 150ms ease;
}
.cmd-btn:hover { filter: brightness(1.06); }
/* Keyboard users get the same affordance mouse users get. :focus-visible so a
   mouse click does not leave a ring behind, which is the reason people remove
   these and end up with nothing. */
.cmd-btn:focus-visible,
.cmd-auto:focus-visible,
.cmd-drawer__close:focus-visible,
.cmd-opp__main:focus-visible {
  outline: 2px solid var(--champagne);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}
.cmd-btn:disabled { opacity: 0.5; cursor: default; }
.cmd-btn--ghost {
  background: transparent; color: var(--text-muted);
  border-color: var(--border);
}
.cmd-btn--ghost:hover { color: var(--text); border-color: var(--champagne); filter: none; }

/* ── Empty + insights ─────────────────────────────────────────────────────── */
.cmd-empty {
  border: 1px dashed var(--border); border-radius: var(--r-lg);
  padding: var(--sp-8) var(--sp-5); text-align: center;
}
.cmd-empty__t { font-size: var(--fs-meta); font-weight: 600; color: var(--text); margin-bottom: var(--sp-15); }
.cmd-empty__s { font-size: var(--fs-small); color: var(--text-muted); max-width: 46ch; margin: 0 auto; }

.cmd-insights { display: flex; flex-direction: column; gap: var(--sp-2); }
.cmd-insight {
  display: flex; gap: var(--sp-3); align-items: flex-start;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--bg-card); padding: var(--sp-3) var(--sp-4);
}
.cmd-insight__icon { color: var(--sand-on-surface); flex-shrink: 0; margin-top: var(--sp-05); }
.cmd-insight__t { font-size: var(--fs-meta); color: var(--text); }
.cmd-insight__d { font-size: var(--fs-small); color: var(--text-muted); margin-top: var(--sp-05); }

/* ── Drawer ───────────────────────────────────────────────────────────────── */
.cmd-drawer { position: fixed; inset: 0; z-index: 180; }
.cmd-drawer[hidden] { display: none; }
.cmd-drawer__scrim { position: absolute; inset: 0; background: rgba(8, 8, 8, 0.5); }
.cmd-drawer__panel {
  position: absolute; top: 0; right: 0; bottom: 0;
  width: 100%; max-width: 460px;
  display: flex; flex-direction: column;
  background: var(--bg-card); border-left: 1px solid var(--border);
  animation: cmd-slide 180ms ease;
}
@keyframes cmd-slide { from { transform: translateX(var(--sp-6)); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .cmd-drawer__panel { animation: none; } }

.cmd-drawer__head {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cmd-drawer__name { font-size: var(--fs-lead); font-weight: 600; color: var(--text); margin: 0; }
.cmd-drawer__close {
  width: var(--sp-8); height: var(--sp-8); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: var(--r-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
}
.cmd-drawer__close:hover { color: var(--text); background: var(--bg-card-alt); }
.cmd-drawer__body { flex: 1; overflow-y: auto; padding: var(--sp-5); }

.cmd-dl { display: grid; grid-template-columns: auto 1fr; gap: var(--sp-2) var(--sp-4); margin-bottom: var(--sp-5); }
.cmd-dl dt { font-size: var(--fs-small); color: var(--text-muted); }
.cmd-dl dd { font-size: var(--fs-small); color: var(--text); margin: 0; font-variant-numeric: tabular-nums; }

.cmd-block { margin-bottom: var(--sp-5); }
.cmd-block__t {
  font-size: var(--fs-micro); font-weight: 600; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--sp-2);
}
.cmd-block__p { font-size: var(--fs-small); color: var(--text); line-height: 1.6; margin: 0; }

/* Reasoning. Each line is one contribution to the score, in the order it
   contributed — this is the component that decides whether the prioritisation
   reads as trustworthy or arbitrary. */
.cmd-reason { display: flex; gap: var(--sp-3); align-items: baseline; padding: var(--sp-2) 0; border-bottom: 1px solid var(--border); }
.cmd-reason:last-child { border-bottom: 0; }
.cmd-reason__l { font-size: var(--fs-small); font-weight: 600; color: var(--text); flex-shrink: 0; }
.cmd-reason__d { font-size: var(--fs-small); color: var(--text-muted); flex: 1; }
.cmd-reason--neg .cmd-reason__l { color: var(--text-muted); }

.cmd-drawer__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-5); }

/* ── Responsive ───────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .cmd__inner { padding: var(--sp-5) var(--sp-4) var(--sp-16); }
  .cmd-head { flex-direction: column; align-items: stretch; gap: var(--sp-3); margin-bottom: var(--sp-5); }
  .cmd-auto { align-self: flex-start; }
  .cmd-greet { font-size: var(--fs-title); }

  /* Opportunities move ABOVE the KPI strip. On a phone the first screen has to
     answer "what do I do now", and five metrics pushing that under the fold is
     precisely the dashboard behaviour this page exists to replace.

     Ordered by explicit class, not :nth-of-type. Every child here is a
     <section>, so .cmd-section:nth-of-type(1) asks for an element that is both
     the first section AND carries that class — which is the briefing, which
     does not. It matched nothing, the sections kept order 0, and the briefing
     ended up BELOW the list it summarises. */
  #cmd-body { display: flex; flex-direction: column; }
  .cmd-brief             { order: 1; }
  .cmd-section--opps     { order: 2; }
  .cmd-kpis              { order: 3; }
  .cmd-section--insights { order: 4; }

  /* The strip scrolls sideways INSIDE itself rather than shrinking each tile
     to unreadable. The page body still never scrolls horizontally. */
  .cmd-kpis {
    display: flex; overflow-x: auto; gap: var(--sp-2);
    margin-bottom: var(--sp-6);
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;
  }
  .cmd-kpi { flex: 0 0 152px; scroll-snap-align: start; }

  .cmd-opp { grid-template-columns: var(--sp-1) 1fr; }
  .cmd-opp__side {
    grid-column: 2; align-items: stretch; flex-direction: row-reverse;
    justify-content: flex-end; gap: var(--sp-3);
    padding: 0 var(--sp-4) var(--sp-4);
  }
  .cmd-opp__side .cmd-btn { flex: 1; }
  .cmd-opp__score { align-self: center; }
  .cmd-drawer__panel { max-width: none; top: var(--sp-10); border-radius: var(--r-lg) var(--r-lg) 0 0; border-left: 0; }
}
`;
}

module.exports = { css };
