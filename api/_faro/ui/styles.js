'use strict';
/*
 * Faro — workspace stylesheet.
 *
 * ── Why the CSS lives here and not inside api/dashboard.js ───────────────────
 * dashboard.js is a single ~19,000-line template literal (`const HTML = \`...\``
 * at line 51). Everything written inside it must escape backticks and ${...} —
 * that file's own comment at line 16414 warns about exactly this. Adding a few
 * thousand lines of Faro CSS in there would make it harder to edit and
 * every dollar sign a hazard.
 *
 * These modules return plain strings from ordinary files, so nothing needs
 * escaping, and Faro stays reviewable as its own diff.
 *
 * ── Class prefix ─────────────────────────────────────────────────────────────
 * Every selector is prefixed `faro-`. Nothing here restyles an existing CRM
 * class, so Faro cannot break the CRM — which matters more now that Faro
 * renders on top of a live CRM page rather than replacing it.
 *
 * ── Theme ────────────────────────────────────────────────────────────────────
 * No theme is hardcoded. Every colour is a token, and the tokens are defined
 * for both themes in ./tokens.js, so the workspace simply inherits whatever
 * [data-theme] the user already set in the CRM. Switching workspace never
 * changes their theme.
 */

function css() {
  return `
/* ═══ Dock ════════════════════════════════════════════════════════════════
   The ask bar along the bottom of every page. A flex child of .main-content,
   never fixed — .page-content is flex:1 with its own scroll, so the page
   simply gets shorter and nothing is ever hidden behind this. */
.faro-dock {
  flex-shrink: 0;
  /* Sticky, not fixed. Fixed would float over the page and hide whatever is
     under it; as a sticky flex child the bar still OCCUPIES its space at the
     end of the document — so nothing is ever covered — while pinning to the
     viewport bottom on any page taller than the screen. Without this it sat
     at y=1225 on a 900px viewport, i.e. you had to scroll to find the thing
     whose entire purpose is being in peripheral vision. */
  position: sticky;
  bottom: 0;
  z-index: 40;
  padding: var(--sp-3) var(--sp-6) var(--sp-4);
  background: var(--bg);
  border-top: 1px solid var(--border);
}
.faro-dock__inner {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  max-width: 940px;
  margin: 0 auto;
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
  border-radius: var(--r-md);
  background: var(--faro-input-bg);
  border: 1px solid var(--border);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.faro-dock__inner:focus-within {
  border-color: var(--champagne);
  box-shadow: 0 0 0 3px var(--faro-input-ring);
}
.faro-dock__spark { display: inline-flex; color: var(--champagne); flex-shrink: 0; }
.faro-dock__input {
  flex: 1; min-width: 0;
  border: 0; outline: 0; background: transparent;
  color: var(--text); font: inherit; font-size: var(--fs-meta);
}
.faro-dock__input::placeholder { color: var(--text-disabled); }
.faro-dock__kbd {
  flex-shrink: 0;
  font: inherit; font-size: var(--fs-micro);
  padding: var(--sp-05) var(--sp-15); border-radius: var(--r-xs);
  border: 1px solid var(--border);
  color: var(--text-disabled);
}
.faro-dock__open {
  width: 30px; height: 30px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--r-sm); border: 0;
  background: var(--accent); color: var(--on-accent);
  cursor: pointer; transition: background 150ms ease;
}
.faro-dock__open:hover { background: var(--accent-hover); }

/* Faro owns image generation, so the CRM's AI-beeld nav entry is redundant
   while Faro is on. It is hidden HERE rather than deleted from the markup,
   because this stylesheet only ships when the feature is enabled: switch Faro
   off and the CRM gets its navigation — and that paid feature — back. */
#nav-ai-beeld { display: none !important; }

/* One page sets its own height inline (calc(100vh - 56px), the calendar), so
   it does not participate in the flex shrink and would push the dock off the
   bottom. Subtract the dock here rather than editing the CRM's inline style. */
#page-kalender { height: calc(100vh - 56px - 62px) !important; }

/* On the Faro page the dock is redundant -- the page has its own, larger
   composer -- and two live composers on screen is one too many. Hidden, not
   dimmed: a 40%-opacity input still looks clickable and still takes a tab
   stop. .main-content is a flex column, so removing it also gives the page
   back the height the dock was reserving. */
body.faro-open .faro-dock { display: none; }

/* ═══ The Faro page ═══════════════════════════════════════════════════════
   Faro is a .page like Dashboard or Pipeline, so the CRM's own page machinery
   sizes and shows it. What this adds is the internal split -- rail beside
   main -- and the fact that it must fill the viewport rather than flow: the
   thread scrolls inside itself, the composer stays pinned at the bottom, and
   the page as a whole never scrolls.

   The height matches #page-kalender's above: the topbar is 56px, and the dock
   is gone here so its 62px does not need subtracting. */
.faro-page.page-content {
  padding: 0;
  /* flex:0 0 auto, not the .page-content default of flex:1. With flex-grow on
     and a flex-basis of 0, the flex algorithm — not the height below — decides
     the box, so the page grew to fit the landing screen's own content, which
     made .main-content taller than the viewport, which grew the page again.
     Pinning the basis breaks that loop; the landing and thread scroll inside. */
  flex: 0 0 auto;
  height: calc(100vh - 56px);
  overflow: hidden;
}
.faro-page__body { display: flex; height: 100%; min-height: 0; }
/* Desktop keeps the rail permanently visible, so the handle only exists on
   narrow screens — see the 860px breakpoint. */
.faro-page__rail-toggle {
  display: none;
  position: absolute;
  top: 10px; left: 10px;
  z-index: 5;
  width: 32px; height: 32px;
  align-items: center; justify-content: center;
  border-radius: var(--r-sm);
  border: 1px solid var(--faro-hairline);
  background: var(--faro-raised);
  color: var(--text-muted);
  cursor: pointer;
}
.faro-page__rail-toggle:hover { color: var(--text); }
.faro-page__main {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

/* ═══ Sidebar entry ═══════════════════════════════════════════════════════
   A primary action above the nav list, not a thirteenth row inside it. The orb
   mark is the same gradient recipe as the landing screen's, at 22px, so the
   button carries Faro's identity without shipping an icon for it.

   ⚠ Every colour here comes from the CRM's token set, not Faro's. The sidebar
   is permanently dark in BOTH themes and rebinds --text/--border/--hover/
   --bg-card-alt to dark-surface values for its children; Faro's own
   --faro-raised and --faro-hairline are :root tokens that flip with the theme
   and are NOT rebound. Using them here painted a light surface under
   dark-context text, and in light theme the button read at roughly 1:1 —
   the title was invisible. --champagne is safe: it is the same value in both
   themes, and raw sand is legible inside this permanently-dark pane (which is
   exactly what --sand-on-surface exists to handle everywhere else). */
.faro-nav-cta {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: calc(100% - 24px);
  margin: 0 var(--sp-3) var(--sp-4);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg-card-alt);
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 150ms ease, background 150ms ease;
}
.faro-nav-cta:hover { border-color: var(--champagne); background: var(--hover); }
.faro-nav-cta.active {
  border-color: var(--champagne);
  background: var(--hover);
  box-shadow: 0 0 0 3px rgba(244, 231, 200, 0.10);
}
.faro-nav-cta__mark {
  flex: 0 0 auto;
  width: 22px; height: 22px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%),
    conic-gradient(from 200deg, var(--champagne), var(--warm-sand), #b9975b, var(--champagne));
  /* Literal, not --warm-sand-glow: that token flips for light backgrounds and
     this one always sits on the dark sidebar. */
  box-shadow: 0 0 12px rgba(244, 231, 200, 0.18);
}
.faro-nav-cta__text { display: flex; flex-direction: column; min-width: 0; }
.faro-nav-cta__title { font-size: var(--fs-small); font-weight: 600; letter-spacing: -0.01em; color: var(--text); }
.faro-nav-cta__sub {
  font-size: var(--fs-micro); color: var(--text-muted); margin-top: var(--sp-05);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ═══ Rail — Faro's own nav, inside the page ══════════════════════════════
   This is what keeps conversations, Images and Projects reachable without any
   of them appearing in the CRM sidebar. */
.faro-rail {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: var(--sp-4) 0 var(--sp-3);
  border-right: 1px solid var(--faro-hairline);
  background: var(--faro-surface);
}
.faro-rail__new {
  display: flex; align-items: center; justify-content: center; gap: var(--sp-2);
  margin: 0 var(--sp-3) var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--r-sm);
  border: 0;
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-small); font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}
.faro-rail__new:hover { background: var(--accent-hover); }

.faro-rail__item {
  display: flex; align-items: center; gap: var(--sp-2);
  width: 100%; text-align: left;
  padding: var(--sp-2) var(--sp-4);
  border: 0; background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-small);
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.faro-rail__item:hover { color: var(--text); background: var(--hover); }
.faro-rail__item.active { color: var(--sand-on-surface); background: var(--champagne-dim); }
.faro-rail__icon { display: inline-flex; opacity: 0.85; }

.faro-rail__section {
  padding: var(--sp-4) var(--sp-4) var(--sp-15);
  font-size: var(--fs-micro); font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--text-disabled);
}
.faro-rail__convos { overflow-y: auto; flex: 1 1 auto; min-height: 30px; }
.faro-convo {
  display: block; width: 100%; text-align: left;
  padding: var(--sp-15) var(--sp-4);
  font-size: var(--fs-small); color: var(--text-muted);
  background: transparent; border: 0; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color 150ms ease, background 150ms ease;
}
.faro-convo:hover { color: var(--text); background: var(--hover); }
.faro-convo.active { color: var(--sand-on-surface); background: var(--champagne-dim); }

.faro-rail__viewall {
  margin: var(--sp-1) var(--sp-4) 0; padding: 0;
  background: none; border: 0;
  color: var(--text-disabled); font-size: var(--fs-tiny); text-align: left; cursor: pointer;
  transition: color 150ms ease;
}
.faro-rail__hint {
  margin: var(--sp-05) var(--sp-3) 0;
  font-size: var(--fs-micro);
  color: var(--text-muted);
  line-height: 1.4;
}
.faro-rail__viewall:hover { color: var(--accent); }


/* ═══ Landing (requirement 4) ══════════════════════════════════════════════ */
.faro-landing { flex: 1; overflow-y: auto; padding: var(--sp-8) var(--sp-6) var(--sp-10); }
.faro-landing__inner { width: 100%; max-width: 720px; margin: 0 auto; }

/* Mascot. Smaller than the design's — requirement 4 asks for "subtle and
   relatively small" and requirement 11 for "not childish", and at the mockup's
   size it out-competed the input, which is supposed to be the page's focus.
   One number to revisit if that judgement is wrong. */
.faro-mascot {
  position: relative;          /* above the orb, which is the grid's other cell */
  width: 72px;
  height: 72px;
  margin: 0;                   /* .faro-mark owns the spacing now */
  display: block;
  filter: drop-shadow(0 0 20px var(--warm-sand-glow));
  transition: filter 400ms ease, transform 400ms ease;
}
/* If the asset is missing, hide rather than show a broken-image glyph —
   only the idle render exists today. */
.faro-mascot--missing { visibility: hidden; }
.faro-mascot[data-state="thinking"] { animation: faro-breathe 2.8s ease-in-out infinite; }
.faro-mascot[data-state="success"]  { filter: drop-shadow(0 0 28px var(--warm-sand-glow)); }
.faro-mascot[data-state="error"]    { filter: drop-shadow(0 0 18px rgba(220, 38, 38, 0.18)); }

/* Deliberately tiny amplitude. Requirement 11: "extremely subtle". */
@keyframes faro-breathe {
  0%, 100% { transform: translateY(0)    scale(1);     }
  50%      { transform: translateY(-2px) scale(1.015); }
}
@media (prefers-reduced-motion: reduce) {
  .faro-mascot, .faro-mascot[data-state="thinking"] { animation: none; transition: none; }
}

/* ── The orb ────────────────────────────────────────────────────────────────
   A mark built entirely from gradients: no asset to ship, nothing to 404, and
   it themes itself from the same two custom properties as everything else.
   It exists because public/faro/ is empty on a fresh checkout, which left the
   landing screen with a headline and no face at all.

   Three stacked layers do the work: a soft outer bloom, a rotating conic sheen
   that reads as light moving across a curved surface, and a small offset
   highlight that fixes the light source to the upper left -- the same
   direction the falcon brief specifies, so the two can coexist. */
.faro-mark {
  position: relative;
  width: 72px; height: 72px;
  margin: 0 auto var(--sp-5);
  display: grid; place-items: center;
}
.faro-orb {
  position: absolute; inset: 0;
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 42%),
    conic-gradient(from 200deg, var(--champagne), var(--warm-sand), #b9975b, var(--champagne));
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.10) inset,
    0 8px 28px var(--warm-sand-glow);
  animation: faro-orb-spin 14s linear infinite, faro-orb-breathe 5.2s ease-in-out infinite;
}
/* The bloom. Separate element would be another node; a pseudo keeps it free. */
.faro-orb::after {
  content: ''; position: absolute; inset: -34%;
  border-radius: 50%;
  background: radial-gradient(circle, var(--warm-sand-glow) 0%, rgba(0,0,0,0) 68%);
  opacity: 0.85; pointer-events: none;
}

/* States. Each is a change of tempo or bloom, never of shape -- the same
   "extremely subtle" rule the falcon brief is written to. */
.faro-mark[data-state="thinking"]   .faro-orb { animation-duration: 4s, 2.4s; }
.faro-mark[data-state="generating"] .faro-orb { animation-duration: 2.6s, 1.5s; }
.faro-mark[data-state="video"]      .faro-orb { animation-duration: 2.6s, 1.5s; }
.faro-mark[data-state="success"]    .faro-orb { box-shadow: 0 0 0 1px rgba(255,255,255,0.16) inset, 0 8px 40px var(--warm-sand-glow); }
.faro-mark[data-state="error"]      .faro-orb {
  background:
    radial-gradient(circle at 34% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 42%),
    conic-gradient(from 200deg, #8a7a63, #6f6152, #8a7a63);
  animation-play-state: paused;
}
/* When the falcon artwork exists it sits on the orb; the orb then reads as the
   glow behind it rather than as the mark itself. */
.faro-mark:has(.faro-mascot:not(.faro-mascot--missing)) .faro-orb { opacity: 0.5; }

@keyframes faro-orb-spin    { to { transform: rotate(360deg); } }
@keyframes faro-orb-breathe {
  0%, 100% { box-shadow: 0 0 0 1px rgba(255,255,255,0.10) inset, 0 8px 24px var(--warm-sand-glow); }
  50%      { box-shadow: 0 0 0 1px rgba(255,255,255,0.14) inset, 0 8px 34px var(--warm-sand-glow); }
}
@media (prefers-reduced-motion: reduce) {
  .faro-orb, .faro-mark[data-state] .faro-orb { animation: none; }
}

.faro-landing__title {
  font-size: var(--fs-display); font-weight: 600; letter-spacing: -0.02em;
  text-align: center; color: var(--text); margin: 0 0 var(--sp-2);
}
/* The question, once the headline above it has become a greeting. Sits between
   title and sub in weight so the eye still lands on it before the input. */
.faro-landing__lead {
  font-size: var(--fs-body); font-weight: 500; text-align: center;
  color: var(--text); margin: 0 0 var(--sp-15);
}
.faro-landing__sub {
  font-size: var(--fs-meta); text-align: center; color: var(--text-muted); margin: 0 0 var(--sp-6);
}

/* ═══ The input — the visual focus of the panel ═══════════════════════════ */
.faro-input {
  position: relative;
  background: var(--faro-input-bg);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-4) var(--sp-4) var(--sp-3);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
/* Ambient glow. A soft sand bloom sitting UNDER the composer, so the input
   reads as the lit object on the page rather than one more bordered box. It
   sits just BELOW the box rather than behind it: a negative z-index would put
   it behind the panel's own background and render it invisible, and isolating
   the input to fix that would hide it behind the input instead. Blur is on a
   gradient, not a filter -- filter would promote a layer and cost a repaint on
   every keystroke. */
.faro-input::before {
  content: ''; position: absolute;
  left: 8%; right: 8%; top: 100%; height: 56px;
  transform: translateY(-10px);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, var(--warm-sand-glow) 0%, rgba(0,0,0,0) 70%);
  opacity: 0.6;
  transition: opacity 220ms ease, transform 220ms ease;
  pointer-events: none;
}
.faro-input:focus-within::before { opacity: 1; transform: translateY(-10px) scale(1.06); }
.faro-input:focus-within,
.faro-input.dragover {
  border-color: var(--champagne);
  box-shadow: 0 0 0 3px var(--faro-input-ring);
}

/* ── Step list ──────────────────────────────────────────────────────────────
   Every tool the model runs gets a row that STAYS. The single status line it
   replaces overwrote itself, so a three-tool turn showed only whichever tool
   happened to be last -- the user could not tell whether Faro had read their
   pipeline before answering, which is exactly the thing that makes an answer
   trustworthy. */
.faro-steps {
  margin: 0 0 var(--sp-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-2) var(--sp-3) var(--sp-2) var(--sp-3);
  background: var(--faro-input-bg);
  display: inline-flex; flex-direction: column; gap: var(--sp-05);
  /* Hugs its rows. Stretched to the bubble width a single step reads as an
     empty banner rather than a line of progress. */
  width: fit-content; max-width: 100%; align-self: flex-start;
}
.faro-step {
  display: flex; align-items: center; gap: var(--sp-2);
  font-size: var(--fs-small); color: var(--text-muted);
  padding: var(--sp-1) var(--sp-05); line-height: 1.4;
}
.faro-step__mark {
  flex: 0 0 auto; width: 14px; height: 14px;
  display: grid; place-items: center;
}
.faro-step__mark::before {
  content: ''; width: 9px; height: 9px; border-radius: 50%;
  background: var(--border);
}
.faro-step[data-state="running"] .faro-step__mark::before {
  background: var(--champagne);
  animation: faro-step-pulse 1.1s ease-in-out infinite;
}
.faro-step[data-state="done"]   .faro-step__mark::before { background: var(--champagne); }
.faro-step[data-state="failed"] .faro-step__mark::before { background: #dc2626; }
.faro-step[data-state="done"]   { color: var(--text); }
.faro-step[data-state="failed"] { color: var(--text); }
@keyframes faro-step-pulse {
  0%, 100% { transform: scale(1);   opacity: 1;    }
  50%      { transform: scale(0.6); opacity: 0.45; }
}
@media (prefers-reduced-motion: reduce) {
  .faro-step[data-state="running"] .faro-step__mark::before { animation: none; }
  .faro-input::before { transition: none; }
}
.faro-input__field {
  width: 100%; min-height: 24px; max-height: 200px; resize: none;
  border: 0; outline: 0; background: transparent; color: var(--text);
  font: inherit; font-size: var(--fs-body); line-height: 1.5;
}
.faro-input__field::placeholder { color: var(--text-disabled); }

.faro-input__attachments { display: flex; flex-wrap: wrap; gap: var(--sp-15); }
.faro-input__attachments:not(:empty) { margin-top: var(--sp-2); }

.faro-input__bar { display: flex; align-items: center; gap: var(--sp-15); margin-top: var(--sp-3); }
.faro-input__spacer { flex: 1; }

.faro-tool-btn {
  display: inline-flex; align-items: center; gap: var(--sp-15);
  padding: var(--sp-15) var(--sp-3); border-radius: var(--r-sm);
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: var(--fs-small); cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.faro-tool-btn:hover { color: var(--text); background: var(--faro-raised); border-color: var(--champagne-line); }
.faro-tool-btn--icon { padding: var(--sp-15) var(--sp-2); }
.faro-model-btn { font-weight: 500; }

/* Send button. Dark glyph on champagne — the light arrow in the design would
   not have met contrast against this fill, and this is the one control the
   user must always be able to find. --on-accent is the token for exactly this. */
/* Stopmodus: dezelfde knop, duidelijk andere betekenis. Rood zou hier "fout"
   suggereren terwijl stoppen een normale keuze is, dus neutraal met een rand —
   het verschil zit in de vorm (vierkant) en het label. */
.faro-send--stop {
  background: var(--surface-2) !important;
  color: var(--text) !important;
  border: 1px solid var(--border) !important;
}
.faro-send--stop:hover { background: var(--surface-3) !important; }

.faro-send {
  width: 34px; height: 34px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: var(--r-sm); border: 0;
  background: var(--accent); color: var(--on-accent);
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
}
.faro-send:hover:not(:disabled) { background: var(--accent-hover); }
.faro-send:disabled { opacity: 0.3; cursor: default; }

/* ═══ Faro context (requirement 6) ════════════════════════════════════════ */
.faro-context-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2);
  margin-top: var(--sp-4); padding: 0 var(--sp-05);
}
.faro-context-row__label { font-size: var(--fs-tiny); color: var(--text-muted); }
.faro-context-row__chips { display: flex; flex-wrap: wrap; gap: var(--sp-15); flex: 1; }
.faro-context-chip {
  display: inline-flex; align-items: center; gap: var(--sp-15);
  padding: var(--sp-1) var(--sp-3); border-radius: var(--r-full);
  border: 1px solid var(--faro-hairline);
  font-size: var(--fs-tiny); color: var(--text-muted);
}
.faro-context-chip svg { color: var(--success); }
.faro-context-chip--off { opacity: 0.45; }
.faro-context-chip--off svg { color: var(--text-disabled); }

.faro-context-row__manage {
  padding: var(--sp-1) var(--sp-3); border-radius: var(--r-full);
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: var(--fs-tiny); cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}
.faro-context-row__manage:hover { color: var(--text); border-color: var(--champagne-line); }

.faro-context-panel {
  margin-top: var(--sp-3); padding: var(--sp-4) var(--sp-4);
  border: 1px solid var(--faro-hairline); border-radius: var(--r-md);
  background: var(--faro-surface);
}
.faro-context-panel__note { margin: 0 0 var(--sp-3); font-size: var(--fs-small); color: var(--text-muted); }
.faro-context-toggle {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-2) 0; font-size: var(--fs-small); color: var(--text);
  border-top: 1px solid var(--divider);
}
.faro-context-toggle:first-child { border-top: 0; }

/* ═══ Sections ════════════════════════════════════════════════════════════ */
.faro-section { margin-top: var(--sp-8); }
.faro-section__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--sp-3); margin-bottom: var(--sp-4);
}
.faro-section__title {
  margin: 0; font-size: var(--fs-lead); font-weight: 600;
  letter-spacing: -0.01em; color: var(--text);
}
.faro-pill {
  padding: var(--sp-15) var(--sp-3); border-radius: var(--r-full);
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: var(--fs-tiny); cursor: pointer; white-space: nowrap;
  transition: color 150ms ease, border-color 150ms ease;
}
.faro-pill:hover { color: var(--text); border-color: var(--champagne-line); }

/* ═══ Quick actions (requirement 5) ═══════════════════════════════════════ */
.faro-quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4); }
.faro-quick__group {
  min-width: 0;
  border: 1px solid var(--faro-hairline);
  border-radius: var(--r-lg);
  background: var(--faro-surface);
  padding: var(--sp-4);
}
.faro-quick__label {
  font-size: var(--fs-small); font-weight: 600; color: var(--text); margin-bottom: var(--sp-3);
}
.faro-quick__action {
  display: flex; align-items: center; gap: var(--sp-3);
  width: 100%; text-align: left;
  padding: var(--sp-3) var(--sp-3); margin-bottom: var(--sp-15);
  border-radius: var(--r-md);
  border: 1px solid transparent;
  background: var(--faro-raised);
  color: var(--text-muted);
  font-size: var(--fs-small);
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.faro-quick__action:last-child { margin-bottom: 0; }
.faro-quick__action:hover { color: var(--text); border-color: var(--champagne-line); }
/* Icon chips. Colour is scoped to exactly this element — 26px, inside a quick
   action, nowhere else in the product. See ./tokens.js for why the hues are
   muted and why purple is absent. */
.faro-quick__icon {
  display: inline-flex; flex-shrink: 0;
  width: 30px; height: 30px; align-items: center; justify-content: center;
  border-radius: var(--r-sm);
  background: var(--champagne-dim);
  color: var(--deep-sand);
  transition: background 150ms ease, color 150ms ease;
}
.faro-quick__icon--amber      { background: var(--ic-amber-bg);      color: var(--ic-amber);      }
.faro-quick__icon--slate      { background: var(--ic-slate-bg);      color: var(--ic-slate);      }
.faro-quick__icon--teal       { background: var(--ic-teal-bg);       color: var(--ic-teal);       }
.faro-quick__icon--terracotta { background: var(--ic-terracotta-bg); color: var(--ic-terracotta); }
.faro-quick__icon--rose       { background: var(--ic-rose-bg);       color: var(--ic-rose);       }
.faro-quick__icon--gold       { background: var(--ic-gold-bg);       color: var(--ic-gold);       }
.faro-quick__icon--green      { background: var(--ic-green-bg);      color: var(--ic-green);      }
.faro-quick__icon--orange     { background: var(--ic-orange-bg);     color: var(--ic-orange);     }
.faro-quick__icon--sky        { background: var(--ic-sky-bg);        color: var(--ic-sky);        }
.faro-quick__text { flex: 1; min-width: 0; }
.faro-quick__chev { flex-shrink: 0; opacity: 0.3; transition: opacity 150ms ease, transform 150ms ease; }
.faro-quick__action:hover .faro-quick__chev { opacity: 0.8; transform: translateX(2px); }

/* ═══ Recently created ════════════════════════════════════════════════════ */
.faro-activity { position: relative; }
.faro-activity__track {
  display: flex; gap: var(--sp-3);
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  /* Room for the card's own hover lift, so it is not clipped by the scroller. */
  padding: var(--sp-05) var(--sp-05) var(--sp-2);
}
.faro-activity__track::-webkit-scrollbar { display: none; }

/* The arrow floats over the last card rather than beside the row: putting it
   outside would either eat page width or hang into the gutter, and this
   section already sits at the container edge. */
.faro-activity__nav {
  position: absolute; right: calc(var(--sp-05) * -1); top: 38%;
  width: var(--sp-8); height: var(--sp-8); border-radius: var(--r-full);
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--faro-hairline);
  background: var(--faro-surface); color: var(--text-muted);
  box-shadow: 0 var(--sp-05) var(--sp-3) rgba(0,0,0,0.28);
  cursor: pointer; transition: color 150ms ease, border-color 150ms ease, transform 150ms ease;
}
.faro-activity__nav:hover { color: var(--text); border-color: var(--champagne); }
.faro-activity__nav[hidden] { display: none; }
/* At the end it points back to the start rather than pretending there is more. */
.faro-activity__nav[data-at-end="1"] svg { transform: scaleX(-1); }

.faro-act-card {
  flex: 0 0 216px; scroll-snap-align: start;
  border: 1px solid var(--faro-hairline); border-radius: var(--r-lg);
  background: var(--faro-surface); overflow: hidden;
  cursor: pointer;
  transition: border-color 150ms ease, transform 150ms ease;
}
.faro-act-card:hover { border-color: var(--champagne-line); transform: translateY(calc(var(--sp-05) * -1)); }
.faro-act-card:focus-visible { outline: 2px solid var(--champagne); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .faro-act-card:hover { transform: none; } }

/* 4:3, so a room photo reads as a room. The surface underneath is what shows
   while the image loads and if it never does — a plain panel with a badge on
   it, rather than a browser's broken-image glyph. */
.faro-act-card__media {
  position: relative; aspect-ratio: 4 / 3;
  background: var(--faro-raised);
  display: flex; align-items: center; justify-content: center;
}
.faro-act-card__media img,
.faro-act-card__media video { width: 100%; height: 100%; object-fit: cover; display: block; }

.faro-act-card__badge {
  position: absolute; top: var(--sp-2); left: var(--sp-2);
  padding: var(--sp-05) var(--sp-2); border-radius: var(--r-xs);
  background: rgba(18,18,18,0.72); color: var(--warm-sand);
  font-size: var(--fs-micro); font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
  backdrop-filter: blur(2px);
}
.faro-act-card__dur {
  position: absolute; top: var(--sp-2); right: var(--sp-2);
  padding: var(--sp-05) var(--sp-2); border-radius: var(--r-xs);
  /* Literal white, not var(--text). This chip sits on a dark scrim in BOTH
     themes, so a token that flips with the theme puts near-black text on a
     near-black pill — the duration was invisible in light mode. Same reason
     the badge above uses --warm-sand rather than an accent that flips. */
  background: rgba(18,18,18,0.72); color: #F4F1EA;
  font-size: var(--fs-micro); font-variant-numeric: tabular-nums;
  backdrop-filter: blur(2px);
}
/* Play marker, centred. Marks a video as a video without needing the word. */
.faro-act-card__play {
  position: absolute; inset: 0; margin: auto;
  width: var(--sp-8); height: var(--sp-8); border-radius: var(--r-full);
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(18,18,18,0.62); color: #FFF;
  backdrop-filter: blur(2px);
}

/* TEXT artifacts have no image — the copy itself is the preview, faded at the
   bottom so a long excerpt reads as continuing rather than as cut off. */
.faro-act-card__media--text {
  display: block;
  padding: var(--sp-8) var(--sp-3) var(--sp-3);
  overflow: hidden;
}
.faro-act-card__excerpt {
  margin: 0;
  font-size: var(--fs-tiny); line-height: 1.55; color: var(--text-muted);
}
.faro-act-card__media--text::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: var(--sp-8);
  background: linear-gradient(to bottom, rgba(0,0,0,0), var(--faro-raised));
  pointer-events: none;
}

.faro-act-card__meta { padding: var(--sp-3); }
.faro-act-card__title {
  font-size: var(--fs-small); font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.faro-act-card__sub {
  font-size: var(--fs-micro); color: var(--text-muted); margin-top: var(--sp-05);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ═══ Conversation view (requirement 7) ═══════════════════════════════════ */
.faro-thread { flex: 1; overflow-y: auto; padding: var(--sp-6) 0 var(--sp-2); min-height: 0; }
.faro-thread__inner { max-width: 760px; margin: 0 auto; padding: 0 var(--sp-6); }
.faro-composer { flex-shrink: 0; border-top: 1px solid var(--faro-hairline); padding: var(--sp-4) var(--sp-6) var(--sp-4); }
.faro-composer__inner { max-width: 760px; margin: 0 auto; }

/* User messages stay minimal — requirement 7. No avatar, no chrome. */
.faro-msg--user {
  margin: 0 0 var(--sp-5) auto; max-width: 78%; width: fit-content;
  padding: var(--sp-3) var(--sp-4); border-radius: var(--r-lg) var(--r-lg) var(--r-xs) var(--r-lg);
  background: var(--faro-raised); color: var(--text);
  font-size: var(--fs-meta); line-height: 1.55; white-space: pre-wrap;
}
.faro-msg--ai { margin: 0 0 var(--sp-6); font-size: var(--fs-meta); line-height: 1.65; color: var(--text); }
.faro-msg__text { white-space: pre-wrap; }
.faro-msg__thumb {
  display: block;
  max-width: 220px; max-height: 160px;
  border-radius: var(--r-sm);
  margin-bottom: var(--sp-2);
}
.faro-msg__thumb:last-child { margin-bottom: 0; }

.faro-status {
  display: inline-flex; align-items: center; gap: var(--sp-2);
  font-size: var(--fs-small); color: var(--text-muted); margin-bottom: var(--sp-3);
}
.faro-status__dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--champagne);
  animation: faro-pulse 1.4s ease-in-out infinite;
}
@keyframes faro-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

/* ═══ Response components ═════════════════════════════════════════════════ */
.faro-cards { display: grid; gap: var(--sp-3); }
.faro-cards:not(:empty) { margin-top: var(--sp-4); }

.faro-card {
  border: 1px solid var(--faro-hairline); border-radius: var(--r-lg);
  background: var(--faro-surface); padding: var(--sp-4) var(--sp-4);
  transition: border-color 150ms ease;
}
.faro-card:hover { border-color: var(--champagne-line); }
.faro-card__name { font-size: var(--fs-body); font-weight: 600; color: var(--text); }
.faro-card__budget { font-size: var(--fs-lead); font-weight: 600; color: var(--deep-sand); margin: var(--sp-1) 0 var(--sp-05); }
.faro-card__meta { font-size: var(--fs-small); color: var(--text-muted); line-height: 1.5; }
.faro-card__tags { display: flex; flex-wrap: wrap; gap: var(--sp-15); margin: var(--sp-3) 0 0; }
.faro-tag {
  font-size: var(--fs-micro); padding: var(--sp-1) var(--sp-2); border-radius: var(--r-xs);
  background: var(--faro-raised); color: var(--text-muted);
}
.faro-tag--qualified { background: var(--champagne-dim); color: var(--deep-sand); }
.faro-card__actions { display: flex; flex-wrap: wrap; gap: var(--sp-15); margin-top: var(--sp-3); }
.faro-card__btn {
  padding: var(--sp-15) var(--sp-3); border-radius: var(--r-sm);
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: var(--fs-small); cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.faro-card__btn:hover { color: var(--text); background: var(--faro-raised); }
.faro-card__btn--primary {
  background: var(--accent); color: var(--on-accent);
  border-color: transparent; font-weight: 600;
}
.faro-card__btn--primary:hover { background: var(--accent-hover); color: var(--on-accent); }
.faro-card__btn:disabled { opacity: 0.5; cursor: default; }

/* Confirmation card — deliberately more prominent than a lead card. It is the
   one component gating a real-world side effect (requirement 8). */
.faro-card--confirm { border-color: var(--champagne-line); background: var(--champagne-dim); }
.faro-card--confirm .faro-card__name { color: var(--deep-sand); }

/* ═══ Skeletons, empties, errors (requirement 15) ═════════════════════════ */
.faro-skeleton {
  border-radius: var(--r-md);
  background: linear-gradient(90deg, var(--faro-surface) 25%, var(--faro-raised) 37%, var(--faro-surface) 63%);
  background-size: 400% 100%;
  animation: faro-shimmer 1.4s ease infinite;
}
@keyframes faro-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .faro-skeleton { animation: none; } }

.faro-empty {
  padding: var(--sp-5); border: 1px dashed var(--faro-hairline); border-radius: var(--r-lg);
  color: var(--text-disabled); font-size: var(--fs-small); text-align: center;
}
.faro-card--error { border-color: rgba(220,38,38,0.35); }

/* ═══ Panels & galleries (requirements 9, 10, 12) ═════════════════════════ */
.faro-panel { flex: 1; overflow-y: auto; padding: var(--sp-6) var(--sp-6) var(--sp-16); }
/* These sub-pages are toggled by the hidden attribute, which any display rule
   above would silently defeat — hence the explicit reset. */
.faro-panel[hidden] { display: none; }
.faro-panel__head {
  max-width: 980px; margin: 0 auto var(--sp-4);
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3);
}
.faro-panel__controls, .faro-gallery, #faro-projects-list { max-width: 980px; margin: 0 auto; }
.faro-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-4); }
.faro-gallery--video { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.faro-gallery:empty { display: none; }
.faro-media { border-radius: var(--r-lg); overflow: hidden; border: 1px solid var(--faro-hairline); background: var(--faro-surface); }
.faro-media__img { width: 100%; display: block; aspect-ratio: 4 / 3; object-fit: cover; background: var(--faro-raised); }
.faro-media__img--9-16 { aspect-ratio: 9 / 16; }
.faro-media__img--1-1  { aspect-ratio: 1 / 1;  }
.faro-media__bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-15); padding: var(--sp-3) var(--sp-3); }

/* Before/after toggle, sitting on the image itself rather than in the button
   row — it changes what you are looking at, so it belongs on the thing it
   changes. */
.faro-media__frame { position: relative; }
.faro-media__ba {
  position: absolute; left: 10px; bottom: 10px;
  padding: var(--sp-15) var(--sp-3); border-radius: var(--r-full);
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(18,18,18,0.72);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  color: #F4E7C8; font: inherit; font-size: var(--fs-tiny); font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}
.faro-media__ba:hover { background: rgba(18,18,18,0.88); }
.faro-media__ba.active { background: var(--accent); color: var(--on-accent); border-color: transparent; }

/* ═══ Menu — the model tier picker ════════════════════════════════════════ */
.faro-input__bar { position: relative; }
.faro-menu {
  position: absolute; bottom: calc(100% + 8px); right: 44px;
  min-width: 208px; z-index: 30;
  padding: var(--sp-15);
  border: 1px solid var(--faro-hairline); border-radius: var(--r-md);
  background: var(--faro-raised);
  box-shadow: 0 8px 28px rgba(0,0,0,0.28);
}
.faro-menu__item {
  display: block; width: 100%; text-align: left;
  padding: var(--sp-2) var(--sp-3); border: 0; border-radius: var(--r-sm);
  background: transparent; cursor: pointer;
  transition: background 150ms ease;
}
.faro-menu__item:hover { background: var(--hover); }
.faro-menu__item.active { background: var(--champagne-dim); }
.faro-menu__label { display: block; font-size: var(--fs-small); font-weight: 600; color: var(--text); }
.faro-menu__item.active .faro-menu__label { color: var(--sand-on-surface); }
.faro-menu__hint { display: block; font-size: var(--fs-tiny); color: var(--text-muted); margin-top: var(--sp-05); }

/* ═══ Gallery empty states ════════════════════════════════════════════════
   These have to teach, not just report emptiness: generation moved to the chat
   and a user landing here may not know that yet. */
.faro-empty--cta { padding: var(--sp-8) var(--sp-5); }
.faro-empty__title { font-size: var(--fs-meta); font-weight: 600; color: var(--text); margin-bottom: var(--sp-15); }
.faro-empty__hint { font-size: var(--fs-small); color: var(--text-muted); margin-bottom: var(--sp-4); line-height: 1.5; }

/* ═══ Responsive (requirement 16) ═════════════════════════════════════════ */
@media (max-width: 1100px) {
  .faro-quick { grid-template-columns: 1fr; }
}

@media (max-width: 860px) {
  /* The 208px rail does not fit, so it becomes a drawer inside the page —
     the same move the CRM sidebar already makes at this width. */
  .faro-page__rail-toggle { display: inline-flex; }
  .faro-rail {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    z-index: 4;
    transform: translateX(-100%);
    transition: transform 180ms ease;
    box-shadow: 0 0 40px rgba(0,0,0,0.4);
  }
  .faro-rail.open { transform: none; }
  .faro-page__body { position: relative; }
}

@media (prefers-reduced-motion: reduce) { .faro-rail { transition: none; } }

@media (max-width: 768px) {
  /* Extra top padding clears the rail handle pinned at the top left. */
  .faro-landing { padding: var(--sp-12) var(--sp-4) var(--sp-10); }
  .faro-landing__title { font-size: var(--fs-title); }
  .faro-landing__sub { font-size: var(--fs-small); }
  .faro-mark { width: 56px; height: 56px; margin-bottom: var(--sp-4); }
  .faro-mascot { width: 56px; height: 56px; }
  .faro-landing__lead { font-size: var(--fs-body); }

  .faro-thread__inner { padding: 0 var(--sp-4); }
  .faro-composer { padding: var(--sp-3) var(--sp-4) var(--sp-4); }
  .faro-msg--user { max-width: 88%; }

  /* The control row does not fit at 390px with five items and text labels, and
     the one being pushed off the edge was Send — the single control
     requirement 16 says must "remain easily accessible". So on narrow screens
     the tool buttons go icon-only and Send may never shrink. */
  .faro-input { padding: var(--sp-3) var(--sp-3) var(--sp-2); }
  .faro-input__bar { gap: var(--sp-1); flex-wrap: nowrap; }
  .faro-tool-btn { padding: var(--sp-15) var(--sp-2); }
  .faro-tool-btn span:not(.faro-input__spacer) { display: none; }
  .faro-model-btn { min-width: 0; overflow: hidden; }
  .faro-model-btn #faro-model-label {
    display: inline; max-width: 84px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .faro-send { margin-left: auto; }

  /* Quick actions become one horizontally-scrollable row per group. overflow-x
     lives on the strip, never the page — requirement 16's "no horizontal
     overflow". */
  .faro-quick__actions {
    display: flex; gap: var(--sp-2); overflow-x: auto;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: var(--sp-05);
  }
  .faro-quick__actions::-webkit-scrollbar { display: none; }
  .faro-quick__action { flex: 0 0 auto; width: auto; margin-bottom: 0; white-space: nowrap; }
  .faro-quick__chev { display: none; }

  /* Wrapping put the manage button mid-chip-run. Stack instead. */
  .faro-context-row { flex-direction: column; align-items: flex-start; gap: var(--sp-15); }
  .faro-context-row__chips { width: 100%; }

  .faro-gallery, .faro-gallery--video, .faro-cards { grid-template-columns: 1fr; }
  /* The arrow goes; a thumb swipes the row on a phone. */
  .faro-activity__nav { display: none; }
  .faro-act-card { flex-basis: 176px; }
  .faro-section { margin-top: var(--sp-6); }

}

/* Phones. The launcher must survive a crowded topbar without pushing the theme
   toggle onto a second row, so it drops to icon-only. */
@media (max-width: 768px) {
  .faro-dock { padding: var(--sp-2) var(--sp-4) var(--sp-3); }
  .faro-dock__inner { padding: var(--sp-15) var(--sp-15) var(--sp-15) var(--sp-3); }
  .faro-dock__kbd { display: none; }
  #page-kalender { height: calc(100vh - 56px - 58px) !important; }
}
`;
}

module.exports = { css };
