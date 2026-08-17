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
/* ═══ Launcher ════════════════════════════════════════════════════════════
   A pill in the topbar. Not a nav item — the CRM sidebar already carries
   twelve, and a thirteenth to reach an assistant is the wrong trade. Sand
   hairline, not a filled button: it should read as available, not as the
   loudest thing in the bar. */
.faro-launch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-radius: 999px;
  border: 1px solid var(--champagne-line);
  background: var(--champagne-dim);
  color: var(--sand-on-surface);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 150ms ease, border-color 150ms ease;
}
.faro-launch:hover { background: var(--champagne-line); border-color: var(--champagne); }
.faro-launch:focus-visible { outline: 2px solid var(--champagne); outline-offset: 2px; }
.faro-launch__kbd {
  font: inherit;
  font-size: 10.5px;
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid var(--champagne-line);
  opacity: 0.75;
}

/* ═══ Overlay ═════════════════════════════════════════════════════════════
   Faro sits ABOVE the CRM. The page underneath is untouched and still there
   when the overlay closes — that is the whole point of not being a workspace. */
.faro-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 28px;
}
.faro-overlay[hidden] { display: none; }

.faro-overlay__scrim {
  position: absolute;
  inset: 0;
  background: rgba(8, 8, 8, 0.58);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  opacity: 0;
  transition: opacity 180ms ease;
}
.faro-overlay.open .faro-overlay__scrim { opacity: 1; }

.faro-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 1120px;
  height: 100%;
  max-height: 860px;
  border-radius: 22px;
  border: 1px solid var(--faro-hairline);
  background: var(--faro-canvas);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.45);
  overflow: hidden;
  opacity: 0;
  transform: translateY(8px) scale(0.995);
  transition: opacity 180ms ease, transform 180ms ease;
}
.faro-overlay.open .faro-dialog { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .faro-overlay__scrim, .faro-dialog { transition: none; }
}

.faro-dialog__head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--faro-hairline);
  flex-shrink: 0;
}
.faro-dialog__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.faro-dialog__title svg { color: var(--champagne); }
.faro-dialog__sub { font-size: 12.5px; color: var(--text-muted); flex: 1; }
/* Rail toggle. Desktop shows the rail permanently, so this only exists on
   narrow screens — same pattern as the CRM's own sidebar drawer. */
.faro-dialog__rail-toggle {
  display: none;
  width: 30px; height: 30px; flex-shrink: 0;
  align-items: center; justify-content: center;
  border-radius: 9px; border: 1px solid transparent;
  background: transparent; color: var(--text-muted); cursor: pointer;
}
.faro-dialog__rail-toggle:hover { color: var(--text); background: var(--faro-raised); }

.faro-dialog__close {
  width: 30px; height: 30px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.faro-dialog__close:hover { color: var(--text); background: var(--faro-raised); }

.faro-dialog__body { display: flex; flex: 1; min-height: 0; }
.faro-dialog__main { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }

/* ═══ Rail — Faro's own nav, inside the overlay ═══════════════════════════
   This is what keeps conversations, Images and Projects reachable without any
   of them appearing in the CRM sidebar. */
.faro-rail {
  width: 208px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 14px 0 10px;
  border-right: 1px solid var(--faro-hairline);
  background: var(--faro-surface);
}
.faro-rail__new {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  margin: 0 12px 12px;
  padding: 9px 12px;
  border-radius: 11px;
  border: 0;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 12.5px; font-weight: 600;
  cursor: pointer;
  transition: background 150ms ease;
}
.faro-rail__new:hover { background: var(--accent-hover); }

.faro-rail__item {
  display: flex; align-items: center; gap: 9px;
  width: 100%; text-align: left;
  padding: 8px 16px;
  border: 0; background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.faro-rail__item:hover { color: var(--text); background: var(--hover); }
.faro-rail__item.active { color: var(--sand-on-surface); background: var(--champagne-dim); }
.faro-rail__icon { display: inline-flex; opacity: 0.85; }

.faro-rail__section {
  padding: 14px 16px 5px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--text-disabled);
}
.faro-rail__convos { overflow-y: auto; flex: 1 1 auto; min-height: 30px; }
.faro-convo {
  display: block; width: 100%; text-align: left;
  padding: 6px 16px;
  font-size: 12.5px; color: var(--text-muted);
  background: transparent; border: 0; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  transition: color 150ms ease, background 150ms ease;
}
.faro-convo:hover { color: var(--text); background: var(--hover); }
.faro-convo.active { color: var(--sand-on-surface); background: var(--champagne-dim); }

.faro-rail__viewall {
  margin: 4px 16px 0; padding: 0;
  background: none; border: 0;
  color: var(--text-disabled); font-size: 12px; text-align: left; cursor: pointer;
  transition: color 150ms ease;
}
.faro-rail__viewall:hover { color: var(--accent); }

.faro-rail__tail { margin-top: auto; padding-top: 10px; flex-shrink: 0; }
.faro-rail__badge {
  margin: 0 12px;
  padding: 9px 11px;
  border-radius: 11px;
  background: var(--champagne-dim);
  border: 1px solid var(--champagne-line);
}
.faro-rail__badge-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--sand-on-surface);
}
.faro-rail__badge-sub { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; line-height: 1.35; }

/* ═══ Landing (requirement 4) ══════════════════════════════════════════════ */
.faro-landing { flex: 1; overflow-y: auto; padding: 32px 24px 44px; }
.faro-landing__inner { width: 100%; max-width: 720px; margin: 0 auto; }

/* Mascot. Smaller than the design's — requirement 4 asks for "subtle and
   relatively small" and requirement 11 for "not childish", and at the mockup's
   size it out-competed the input, which is supposed to be the page's focus.
   One number to revisit if that judgement is wrong. */
.faro-mascot {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
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

.faro-landing__title {
  font-size: 30px; font-weight: 600; letter-spacing: -0.02em;
  text-align: center; color: var(--text); margin: 0 0 8px;
}
.faro-landing__sub {
  font-size: 14px; text-align: center; color: var(--text-muted); margin: 0 0 26px;
}

/* ═══ The input — the visual focus of the panel ═══════════════════════════ */
.faro-input {
  background: var(--faro-input-bg);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 14px 16px 10px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.faro-input:focus-within,
.faro-input.dragover {
  border-color: var(--champagne);
  box-shadow: 0 0 0 3px var(--faro-input-ring);
}
.faro-input__field {
  width: 100%; min-height: 24px; max-height: 200px; resize: none;
  border: 0; outline: 0; background: transparent; color: var(--text);
  font: inherit; font-size: 15px; line-height: 1.5;
}
.faro-input__field::placeholder { color: var(--text-disabled); }

.faro-input__attachments { display: flex; flex-wrap: wrap; gap: 6px; }
.faro-input__attachments:not(:empty) { margin-top: 8px; }

.faro-input__bar { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.faro-input__spacer { flex: 1; }

.faro-tool-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px; border-radius: 10px;
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.faro-tool-btn:hover { color: var(--text); background: var(--faro-raised); border-color: var(--champagne-line); }
.faro-tool-btn--icon { padding: 6px 8px; }
.faro-model-btn { font-weight: 500; }

/* Send button. Dark glyph on champagne — the light arrow in the design would
   not have met contrast against this fill, and this is the one control the
   user must always be able to find. --on-accent is the token for exactly this. */
.faro-send {
  width: 34px; height: 34px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 11px; border: 0;
  background: var(--accent); color: var(--on-accent);
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
}
.faro-send:hover:not(:disabled) { background: var(--accent-hover); }
.faro-send:disabled { opacity: 0.3; cursor: default; }

/* ═══ Faro context (requirement 6) ════════════════════════════════════════ */
.faro-context-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-top: 14px; padding: 0 2px;
}
.faro-context-row__label { font-size: 12px; color: var(--text-muted); }
.faro-context-row__chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.faro-context-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--faro-hairline);
  font-size: 11.5px; color: var(--text-muted);
}
.faro-context-chip svg { color: var(--success); }
.faro-context-chip--off { opacity: 0.45; }
.faro-context-chip--off svg { color: var(--text-disabled); }

.faro-context-row__manage {
  padding: 4px 12px; border-radius: 999px;
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: 11.5px; cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}
.faro-context-row__manage:hover { color: var(--text); border-color: var(--champagne-line); }

.faro-context-panel {
  margin-top: 10px; padding: 14px 16px;
  border: 1px solid var(--faro-hairline); border-radius: 14px;
  background: var(--faro-surface);
}
.faro-context-panel__note { margin: 0 0 10px; font-size: 12.5px; color: var(--text-muted); }
.faro-context-toggle {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0; font-size: 13px; color: var(--text);
  border-top: 1px solid var(--divider);
}
.faro-context-toggle:first-child { border-top: 0; }

/* ═══ Sections ════════════════════════════════════════════════════════════ */
.faro-section { margin-top: 34px; }
.faro-section__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 14px;
}
.faro-section__title {
  margin: 0; font-size: 17px; font-weight: 600;
  letter-spacing: -0.01em; color: var(--text);
}
.faro-pill {
  padding: 5px 13px; border-radius: 999px;
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: 12px; cursor: pointer; white-space: nowrap;
  transition: color 150ms ease, border-color 150ms ease;
}
.faro-pill:hover { color: var(--text); border-color: var(--champagne-line); }

/* ═══ Quick actions (requirement 5) ═══════════════════════════════════════ */
.faro-quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.faro-quick__group {
  min-width: 0;
  border: 1px solid var(--faro-hairline);
  border-radius: 18px;
  background: var(--faro-surface);
  padding: 14px;
}
.faro-quick__label {
  font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;
}
.faro-quick__action {
  display: flex; align-items: center; gap: 10px;
  width: 100%; text-align: left;
  padding: 10px 11px; margin-bottom: 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--faro-raised);
  color: var(--text-muted);
  font-size: 12.5px;
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
  border-radius: 9px;
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
  display: flex; gap: 14px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.faro-activity__track::-webkit-scrollbar { display: none; }
.faro-activity__nav {
  position: absolute; right: -6px; top: 50%; transform: translateY(-50%);
  width: 30px; height: 30px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--faro-hairline);
  background: var(--faro-surface); color: var(--text-muted);
  cursor: pointer; transition: color 150ms ease;
}
.faro-activity__nav:hover { color: var(--text); }

.faro-act-card {
  flex: 0 0 200px; scroll-snap-align: start;
  border: 1px solid var(--faro-hairline); border-radius: 16px;
  background: var(--faro-surface); overflow: hidden;
  cursor: pointer; transition: border-color 150ms ease;
}
.faro-act-card:hover { border-color: var(--champagne-line); }
.faro-act-card__media { position: relative; aspect-ratio: 4 / 3; background: var(--faro-raised); }
.faro-act-card__media img,
.faro-act-card__media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.faro-act-card__badge {
  position: absolute; top: 8px; left: 8px;
  padding: 2px 7px; border-radius: 5px;
  background: rgba(18,18,18,0.72); color: var(--warm-sand);
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
}
.faro-act-card__dur {
  position: absolute; top: 8px; right: 8px;
  padding: 2px 7px; border-radius: 5px;
  background: rgba(18,18,18,0.72); color: var(--text);
  font-size: 10px; font-variant-numeric: tabular-nums;
}
/* TEXT artifacts have no image — the copy itself is the preview. Position
   relative so the badge anchors to this block rather than overlapping the copy. */
.faro-act-card__text {
  position: relative;
  padding: 34px 12px 12px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--faro-raised);
}
.faro-act-card__excerpt {
  display: block;
  font-size: 11.5px; line-height: 1.5; color: var(--text-muted);
}
.faro-act-card__meta { padding: 10px 12px; }
.faro-act-card__title {
  font-size: 12.5px; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.faro-act-card__sub { font-size: 11px; color: var(--text-disabled); margin-top: 2px; }

/* ═══ Conversation view (requirement 7) ═══════════════════════════════════ */
.faro-thread { flex: 1; overflow-y: auto; padding: 28px 0 8px; min-height: 0; }
.faro-thread__inner { max-width: 760px; margin: 0 auto; padding: 0 24px; }
.faro-composer { flex-shrink: 0; border-top: 1px solid var(--faro-hairline); padding: 14px 24px 18px; }
.faro-composer__inner { max-width: 760px; margin: 0 auto; }

/* User messages stay minimal — requirement 7. No avatar, no chrome. */
.faro-msg--user {
  margin: 0 0 20px auto; max-width: 78%; width: fit-content;
  padding: 10px 14px; border-radius: 16px 16px 4px 16px;
  background: var(--faro-raised); color: var(--text);
  font-size: 14.5px; line-height: 1.55; white-space: pre-wrap;
}
.faro-msg--ai { margin: 0 0 26px; font-size: 14.5px; line-height: 1.65; color: var(--text); }
.faro-msg__text { white-space: pre-wrap; }

.faro-status {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px;
}
.faro-status__dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--champagne);
  animation: faro-pulse 1.4s ease-in-out infinite;
}
@keyframes faro-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

/* ═══ Response components ═════════════════════════════════════════════════ */
.faro-cards { display: grid; gap: 10px; }
.faro-cards:not(:empty) { margin-top: 14px; }

.faro-card {
  border: 1px solid var(--faro-hairline); border-radius: 18px;
  background: var(--faro-surface); padding: 14px 16px;
  transition: border-color 150ms ease;
}
.faro-card:hover { border-color: var(--champagne-line); }
.faro-card__name { font-size: 15px; font-weight: 600; color: var(--text); }
.faro-card__budget { font-size: 19px; font-weight: 600; color: var(--deep-sand); margin: 4px 0 2px; }
.faro-card__meta { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.faro-card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.faro-tag {
  font-size: 11px; padding: 3px 8px; border-radius: 6px;
  background: var(--faro-raised); color: var(--text-muted);
}
.faro-tag--qualified { background: var(--champagne-dim); color: var(--deep-sand); }
.faro-card__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.faro-card__btn {
  padding: 6px 12px; border-radius: 10px;
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
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
  border-radius: 12px;
  background: linear-gradient(90deg, var(--faro-surface) 25%, var(--faro-raised) 37%, var(--faro-surface) 63%);
  background-size: 400% 100%;
  animation: faro-shimmer 1.4s ease infinite;
}
@keyframes faro-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .faro-skeleton { animation: none; } }

.faro-empty {
  padding: 22px; border: 1px dashed var(--faro-hairline); border-radius: 16px;
  color: var(--text-disabled); font-size: 13px; text-align: center;
}
.faro-card--error { border-color: rgba(220,38,38,0.35); }

/* ═══ Panels & galleries (requirements 9, 10, 12) ═════════════════════════ */
.faro-panel { flex: 1; overflow-y: auto; padding: 28px 24px 64px; }
/* The shell sets display on .faro-dialog*, but these sub-pages are toggled by
   the hidden attribute — which any display rule would silently defeat. */
.faro-panel[hidden] { display: none; }
.faro-panel__head { max-width: 980px; margin: 0 auto 16px; }
.faro-panel__controls, .faro-gallery, #faro-projects-list { max-width: 980px; margin: 0 auto; }
.faro-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.faro-gallery--video { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.faro-gallery:empty { display: none; }
.faro-media { border-radius: 18px; overflow: hidden; border: 1px solid var(--faro-hairline); background: var(--faro-surface); }
.faro-media__img { width: 100%; display: block; aspect-ratio: 4 / 3; object-fit: cover; background: var(--faro-raised); }
.faro-media__img--9-16 { aspect-ratio: 9 / 16; }
.faro-media__img--1-1  { aspect-ratio: 1 / 1;  }
.faro-media__bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }

/* ═══ Menu — the model tier picker ════════════════════════════════════════ */
.faro-input__bar { position: relative; }
.faro-menu {
  position: absolute; bottom: calc(100% + 8px); right: 44px;
  min-width: 208px; z-index: 30;
  padding: 5px;
  border: 1px solid var(--faro-hairline); border-radius: 14px;
  background: var(--faro-raised);
  box-shadow: 0 8px 28px rgba(0,0,0,0.28);
}
.faro-menu__item {
  display: block; width: 100%; text-align: left;
  padding: 8px 10px; border: 0; border-radius: 10px;
  background: transparent; cursor: pointer;
  transition: background 150ms ease;
}
.faro-menu__item:hover { background: var(--hover); }
.faro-menu__item.active { background: var(--champagne-dim); }
.faro-menu__label { display: block; font-size: 13px; font-weight: 600; color: var(--text); }
.faro-menu__item.active .faro-menu__label { color: var(--sand-on-surface); }
.faro-menu__hint { display: block; font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }

/* ═══ Forms — the Images/Videos workspace controls ════════════════════════ */
.faro-form {
  border: 1px solid var(--faro-hairline); border-radius: 18px;
  background: var(--faro-surface); padding: 18px; margin-bottom: 20px;
}
.faro-form__row { margin-bottom: 14px; }
.faro-form__label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-muted); margin-bottom: 6px;
}
.faro-form__select, .faro-form__area {
  width: 100%; padding: 9px 11px;
  background: var(--faro-input-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 12px;
  font: inherit; font-size: 13.5px; outline: 0;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.faro-form__area { resize: vertical; line-height: 1.5; }
.faro-form__select:focus, .faro-form__area:focus {
  border-color: var(--champagne); box-shadow: 0 0 0 3px var(--faro-input-ring);
}

/* Drag-and-drop target for property photos (requirement 15). */
.faro-form__drop {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 22px; margin-bottom: 14px;
  border: 1px dashed var(--faro-hairline); border-radius: 14px;
  color: var(--text-disabled); font-size: 13px; cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.faro-form__drop:hover { color: var(--text-muted); border-color: var(--champagne-line); }
.faro-form__drop.dragover {
  border-color: var(--champagne); color: var(--sand-on-surface); background: var(--champagne-dim);
}

.faro-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.faro-chip {
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--faro-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.faro-chip:hover { color: var(--text); border-color: var(--champagne-line); }
.faro-chip.active {
  background: var(--champagne-dim); border-color: var(--champagne-line); color: var(--deep-sand);
  font-weight: 600;
}
.faro-form__foot { display: flex; align-items: center; gap: 12px; margin-top: 18px; }

/* Source-photo preview. Capped so a portrait shot cannot push the controls off
   the panel — this is a thumbnail confirming what was picked, not the result. */
.faro-form__preview {
  display: block;
  max-height: 180px;
  border-radius: 12px;
  margin-bottom: 14px;
  border: 1px solid var(--faro-hairline);
}
.faro-form__preview[hidden] { display: none; }
.faro-form__note { font-size: 12.5px; color: var(--text-muted); flex: 1; }
.faro-form__link {
  background: none; border: 0; padding: 0;
  color: var(--text-muted); font: inherit; font-size: 12.5px;
  text-decoration: underline; text-underline-offset: 3px;
  cursor: pointer; white-space: nowrap;
  transition: color 150ms ease;
}
.faro-form__link:hover { color: var(--accent); }

/* ═══ Responsive (requirement 16) ═════════════════════════════════════════ */
@media (max-width: 1100px) {
  .faro-quick { grid-template-columns: 1fr; }
}

@media (max-width: 860px) {
  /* The overlay goes full-bleed. A centred card with margins on a phone wastes
     the only screen space there is. */
  .faro-overlay { padding: 0; }
  .faro-dialog { max-width: none; max-height: none; border-radius: 0; border: 0; }

  /* The 208px rail does not fit, so it becomes a drawer inside the panel —
     the same move the CRM sidebar already makes at this width. */
  .faro-dialog__rail-toggle { display: inline-flex; }
  .faro-rail {
    position: absolute;
    top: 0; bottom: 0; left: 0;
    z-index: 4;
    transform: translateX(-100%);
    transition: transform 180ms ease;
    box-shadow: 0 0 40px rgba(0,0,0,0.4);
  }
  .faro-rail.open { transform: none; }
  .faro-dialog__body { position: relative; }
}

@media (prefers-reduced-motion: reduce) { .faro-rail { transition: none; } }

@media (max-width: 768px) {
  .faro-landing { padding: 22px 16px 44px; }
  .faro-landing__title { font-size: 23px; }
  .faro-landing__sub { font-size: 13px; }
  .faro-mascot { width: 56px; height: 56px; margin-bottom: 16px; }

  .faro-thread__inner { padding: 0 16px; }
  .faro-composer { padding: 12px 16px 16px; }
  .faro-msg--user { max-width: 88%; }

  /* The control row does not fit at 390px with five items and text labels, and
     the one being pushed off the edge was Send — the single control
     requirement 16 says must "remain easily accessible". So on narrow screens
     the tool buttons go icon-only and Send may never shrink. */
  .faro-input { padding: 12px 12px 8px; }
  .faro-input__bar { gap: 4px; flex-wrap: nowrap; }
  .faro-tool-btn { padding: 6px 8px; }
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
    display: flex; gap: 8px; overflow-x: auto;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 2px;
  }
  .faro-quick__actions::-webkit-scrollbar { display: none; }
  .faro-quick__action { flex: 0 0 auto; width: auto; margin-bottom: 0; white-space: nowrap; }
  .faro-quick__chev { display: none; }

  /* Wrapping put the manage button mid-chip-run. Stack instead. */
  .faro-context-row { flex-direction: column; align-items: flex-start; gap: 6px; }
  .faro-context-row__chips { width: 100%; }

  .faro-gallery, .faro-gallery--video, .faro-cards { grid-template-columns: 1fr; }
  .faro-activity__nav { display: none; }
  .faro-act-card { flex-basis: 168px; }
  .faro-section { margin-top: 26px; }

  .faro-dialog__head { padding: 12px 14px; }
  .faro-dialog__sub { display: none; }
}

/* Phones. The launcher must survive a crowded topbar without pushing the theme
   toggle onto a second row, so it drops to icon-only. */
@media (max-width: 480px) {
  .faro-launch { padding: 7px 9px; }
  .faro-launch__label, .faro-launch__kbd { display: none; }
}
`;
}

module.exports = { css };
