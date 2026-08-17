'use strict';
/*
 * Helvaro AI — workspace stylesheet.
 *
 * ── Why the CSS lives here and not inside api/dashboard.js ───────────────────
 * dashboard.js is a single ~19,000-line template literal (`const HTML = \`...\``
 * at line 51). Everything written inside it must escape backticks and ${...} —
 * that file's own comment at line 16414 warns about exactly this. Adding a few
 * thousand lines of AI workspace CSS in there would make it harder to edit and
 * every dollar sign a hazard.
 *
 * These modules return plain strings from ordinary files, so nothing needs
 * escaping, and the AI workspace stays reviewable as its own diff.
 *
 * ── Class prefix ─────────────────────────────────────────────────────────────
 * Every selector is prefixed `ai-`, with one exception: `.workspace-switch`,
 * which is chrome shared by both workspaces. Nothing here restyles an existing
 * CRM class, so the AI workspace cannot break the CRM.
 *
 * ── Theme ────────────────────────────────────────────────────────────────────
 * No theme is hardcoded. Every colour is a token, and the tokens are defined
 * for both themes in ./tokens.js, so the workspace simply inherits whatever
 * [data-theme] the user already set in the CRM. Switching workspace never
 * changes their theme.
 */

function css() {
  return `
/* ═══ Workspace switcher (requirement 1) ═══════════════════════════════════
   Permanent, no dropdown. Centred within the TOPBAR — i.e. within the content
   area — rather than the viewport, because the sidebar occupies the left edge
   and viewport-centring reads visibly left of the content's midpoint.
   .topbar is already position:sticky, so it is a positioning context. */
.workspace-switch {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  z-index: 5;
}
.workspace-switch__btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 6px 22px;
  border-radius: 9px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.workspace-switch__btn:hover { color: var(--text); }
.workspace-switch__btn:focus-visible { outline: 2px solid var(--champagne); outline-offset: 2px; }

/* Active state. The design's version was too quiet to read as "selected" at a
   glance — and this control carries requirement 18's entire claim that there
   are two co-equal workspaces. So: champagne text, a tint, a hairline AND a
   bottom rule. Still restrained (no fill), but unmistakable. */
.workspace-switch__btn.active {
  color: var(--sand-on-surface);
  background: var(--champagne-dim);
  box-shadow: inset 0 0 0 1px var(--champagne-line),
              inset 0 -2px 0 0 var(--champagne);
}
.workspace-switch__sep { width: 1px; height: 15px; background: var(--divider); }

/* ═══ Workspace canvas ═════════════════════════════════════════════════════ */
.ai-workspace {
  display: none;
  flex-direction: column;
  height: calc(100vh - 56px);
  background: var(--ai-canvas);
  overflow: hidden;
}
.ai-workspace.active { display: flex; }

/* ═══ AI sidebar (requirement 3) ═══════════════════════════════════════════
   Reuses .sidebar / .nav-item from the CRM so both workspaces share one
   sidebar language; only the CONTENTS differ. */
.ai-sidebar { display: none; flex-direction: column; height: 100%; min-height: 0; }
.ai-sidebar.active { display: flex; }

.ai-sidebar__new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 0 12px 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 600;
  border: 0;
  cursor: pointer;
  transition: background 150ms ease;
}
.ai-sidebar__new:hover { background: var(--accent-hover); }
.ai-sidebar__new:active { background: var(--accent-pressed); }

.ai-sidebar__section {
  padding: 10px 20px 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-disabled);
}
.ai-sidebar__convos { overflow-y: auto; flex: 1 1 auto; min-height: 40px; }
.ai-convo {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 20px;
  font-size: 12.5px;
  color: var(--text-muted);
  background: transparent;
  border: 0;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 150ms ease, background 150ms ease;
}
.ai-convo:hover { color: var(--text); background: var(--hover); }
.ai-convo.active { color: var(--warm-sand); background: var(--champagne-dim); }

.ai-sidebar__viewall {
  margin: 4px 20px 0;
  padding: 0;
  background: none;
  border: 0;
  color: var(--text-disabled);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: color 150ms ease;
}
.ai-sidebar__viewall:hover { color: var(--accent); }

.ai-sidebar__tail { margin-top: auto; padding-top: 10px; flex-shrink: 0; }
.ai-sidebar__badge {
  margin: 10px 12px 4px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--champagne-dim);
  border: 1px solid var(--champagne-line);
}
.ai-sidebar__badge-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--warm-sand);
}
.ai-sidebar__badge-sub { font-size: 10.5px; color: var(--text-muted); margin-top: 2px; line-height: 1.35; }

/* ═══ Landing (requirement 4) ══════════════════════════════════════════════ */
.ai-landing { flex: 1; overflow-y: auto; padding: 40px 24px 64px; }
.ai-landing__inner { width: 100%; max-width: 760px; margin: 0 auto; }

/* Mascot. Smaller than the design's — requirement 4 asks for "subtle and
   relatively small" and requirement 11 for "not childish", and at the mockup's
   size it out-competed the input, which is supposed to be the page's focus.
   One number to revisit if that judgement is wrong. */
.ai-mascot {
  width: 72px;
  height: 72px;
  margin: 0 auto 20px;
  display: block;
  filter: drop-shadow(0 0 20px var(--warm-sand-glow));
  transition: filter 400ms ease, transform 400ms ease;
}
/* If the asset is missing, hide rather than show a broken-image glyph —
   only the idle render exists today. */
.ai-mascot--missing { visibility: hidden; }
.ai-mascot[data-state="thinking"] { animation: ai-breathe 2.8s ease-in-out infinite; }
.ai-mascot[data-state="success"]  { filter: drop-shadow(0 0 28px var(--warm-sand-glow)); }
.ai-mascot[data-state="error"]    { filter: drop-shadow(0 0 18px rgba(220, 38, 38, 0.18)); }

/* Deliberately tiny amplitude. Requirement 11: "extremely subtle". */
@keyframes ai-breathe {
  0%, 100% { transform: translateY(0)    scale(1);     }
  50%      { transform: translateY(-2px) scale(1.015); }
}
@media (prefers-reduced-motion: reduce) {
  .ai-mascot, .ai-mascot[data-state="thinking"] { animation: none; transition: none; }
}

.ai-landing__title {
  font-size: 30px; font-weight: 600; letter-spacing: -0.02em;
  text-align: center; color: var(--text); margin: 0 0 8px;
}
.ai-landing__sub {
  font-size: 14px; text-align: center; color: var(--text-muted); margin: 0 0 26px;
}

/* ═══ The AI input — the visual focus of the page ══════════════════════════ */
.ai-input {
  background: var(--ai-input-bg);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 14px 16px 10px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.ai-input:focus-within,
.ai-input.dragover {
  border-color: var(--champagne);
  box-shadow: 0 0 0 3px var(--ai-input-ring);
}
.ai-input__field {
  width: 100%; min-height: 24px; max-height: 200px; resize: none;
  border: 0; outline: 0; background: transparent; color: var(--text);
  font: inherit; font-size: 15px; line-height: 1.5;
}
.ai-input__field::placeholder { color: var(--text-disabled); }

.ai-input__attachments { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-input__attachments:not(:empty) { margin-top: 8px; }

.ai-input__bar { display: flex; align-items: center; gap: 6px; margin-top: 10px; }
.ai-input__spacer { flex: 1; }

.ai-tool-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 11px; border-radius: 10px;
  border: 1px solid var(--ai-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.ai-tool-btn:hover { color: var(--text); background: var(--ai-raised); border-color: var(--champagne-line); }
.ai-tool-btn--icon { padding: 6px 8px; }
.ai-model-btn { font-weight: 500; }

/* Send button. Dark glyph on champagne — the light arrow in the design would
   not have met contrast against this fill, and this is the one control the
   user must always be able to find. --on-accent is the token for exactly this. */
.ai-send {
  width: 34px; height: 34px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 11px; border: 0;
  background: var(--accent); color: var(--on-accent);
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
}
.ai-send:hover:not(:disabled) { background: var(--accent-hover); }
.ai-send:disabled { opacity: 0.3; cursor: default; }

/* ═══ Helvaro context (requirement 6) ═════════════════════════════════════ */
.ai-context-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-top: 14px; padding: 0 2px;
}
.ai-context-row__label { font-size: 12px; color: var(--text-muted); }
.ai-context-row__chips { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
.ai-context-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--ai-hairline);
  font-size: 11.5px; color: var(--text-muted);
}
.ai-context-chip svg { color: var(--success); }
.ai-context-chip--off { opacity: 0.45; }
.ai-context-chip--off svg { color: var(--text-disabled); }

.ai-context-row__manage {
  padding: 4px 12px; border-radius: 999px;
  border: 1px solid var(--ai-hairline); background: transparent;
  color: var(--text-muted); font-size: 11.5px; cursor: pointer;
  transition: color 150ms ease, border-color 150ms ease;
}
.ai-context-row__manage:hover { color: var(--text); border-color: var(--champagne-line); }

.ai-context-panel {
  margin-top: 10px; padding: 14px 16px;
  border: 1px solid var(--ai-hairline); border-radius: 14px;
  background: var(--ai-surface);
}
.ai-context-panel__note { margin: 0 0 10px; font-size: 12.5px; color: var(--text-muted); }
.ai-context-toggle {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 0; font-size: 13px; color: var(--text);
  border-top: 1px solid var(--divider);
}
.ai-context-toggle:first-child { border-top: 0; }

/* ═══ Sections ════════════════════════════════════════════════════════════ */
.ai-section { margin-top: 34px; }
.ai-section__head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 14px;
}
.ai-section__title {
  margin: 0; font-size: 17px; font-weight: 600;
  letter-spacing: -0.01em; color: var(--text);
}
.ai-pill {
  padding: 5px 13px; border-radius: 999px;
  border: 1px solid var(--ai-hairline); background: transparent;
  color: var(--text-muted); font-size: 12px; cursor: pointer; white-space: nowrap;
  transition: color 150ms ease, border-color 150ms ease;
}
.ai-pill:hover { color: var(--text); border-color: var(--champagne-line); }

/* ═══ Quick actions (requirement 5) ═══════════════════════════════════════ */
.ai-quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.ai-quick__group {
  min-width: 0;
  border: 1px solid var(--ai-hairline);
  border-radius: 18px;
  background: var(--ai-surface);
  padding: 14px;
}
.ai-quick__label {
  font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 10px;
}
.ai-quick__action {
  display: flex; align-items: center; gap: 10px;
  width: 100%; text-align: left;
  padding: 10px 11px; margin-bottom: 6px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: var(--ai-raised);
  color: var(--text-muted);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.ai-quick__action:last-child { margin-bottom: 0; }
.ai-quick__action:hover { color: var(--text); border-color: var(--champagne-line); }
/* Icon chips. Colour is scoped to exactly this element — 26px, inside a quick
   action, nowhere else in the product. See ./tokens.js for why the hues are
   muted and why purple is absent. */
.ai-quick__icon {
  display: inline-flex; flex-shrink: 0;
  width: 30px; height: 30px; align-items: center; justify-content: center;
  border-radius: 9px;
  background: var(--champagne-dim);
  color: var(--deep-sand);
  transition: background 150ms ease, color 150ms ease;
}
.ai-quick__icon--amber      { background: var(--ic-amber-bg);      color: var(--ic-amber);      }
.ai-quick__icon--slate      { background: var(--ic-slate-bg);      color: var(--ic-slate);      }
.ai-quick__icon--teal       { background: var(--ic-teal-bg);       color: var(--ic-teal);       }
.ai-quick__icon--terracotta { background: var(--ic-terracotta-bg); color: var(--ic-terracotta); }
.ai-quick__icon--rose       { background: var(--ic-rose-bg);       color: var(--ic-rose);       }
.ai-quick__icon--gold       { background: var(--ic-gold-bg);       color: var(--ic-gold);       }
.ai-quick__icon--green      { background: var(--ic-green-bg);      color: var(--ic-green);      }
.ai-quick__icon--orange     { background: var(--ic-orange-bg);     color: var(--ic-orange);     }
.ai-quick__icon--sky        { background: var(--ic-sky-bg);        color: var(--ic-sky);        }
.ai-quick__text { flex: 1; min-width: 0; }
.ai-quick__chev { flex-shrink: 0; opacity: 0.3; transition: opacity 150ms ease, transform 150ms ease; }
.ai-quick__action:hover .ai-quick__chev { opacity: 0.8; transform: translateX(2px); }

/* ═══ Recent AI activity ══════════════════════════════════════════════════ */
.ai-activity { position: relative; }
.ai-activity__track {
  display: flex; gap: 14px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 4px;
}
.ai-activity__track::-webkit-scrollbar { display: none; }
.ai-activity__nav {
  position: absolute; right: -6px; top: 50%; transform: translateY(-50%);
  width: 30px; height: 30px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--ai-hairline);
  background: var(--ai-surface); color: var(--text-muted);
  cursor: pointer; transition: color 150ms ease;
}
.ai-activity__nav:hover { color: var(--text); }

.ai-act-card {
  flex: 0 0 200px; scroll-snap-align: start;
  border: 1px solid var(--ai-hairline); border-radius: 16px;
  background: var(--ai-surface); overflow: hidden;
  cursor: pointer; transition: border-color 150ms ease;
}
.ai-act-card:hover { border-color: var(--champagne-line); }
.ai-act-card__media { position: relative; aspect-ratio: 4 / 3; background: var(--ai-raised); }
.ai-act-card__media img,
.ai-act-card__media video { width: 100%; height: 100%; object-fit: cover; display: block; }
.ai-act-card__badge {
  position: absolute; top: 8px; left: 8px;
  padding: 2px 7px; border-radius: 5px;
  background: rgba(18,18,18,0.72); color: var(--warm-sand);
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase;
}
.ai-act-card__dur {
  position: absolute; top: 8px; right: 8px;
  padding: 2px 7px; border-radius: 5px;
  background: rgba(18,18,18,0.72); color: var(--text);
  font-size: 10px; font-variant-numeric: tabular-nums;
}
/* TEXT artifacts have no image — the copy itself is the preview. Position
   relative so the badge anchors to this block rather than overlapping the copy. */
.ai-act-card__text {
  position: relative;
  padding: 34px 12px 12px;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: var(--ai-raised);
}
.ai-act-card__excerpt {
  display: block;
  font-size: 11.5px; line-height: 1.5; color: var(--text-muted);
}
.ai-act-card__meta { padding: 10px 12px; }
.ai-act-card__title {
  font-size: 12.5px; font-weight: 600; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ai-act-card__sub { font-size: 11px; color: var(--text-disabled); margin-top: 2px; }

/* ═══ Conversation view (requirement 7) ═══════════════════════════════════ */
.ai-thread { flex: 1; overflow-y: auto; padding: 28px 0 8px; min-height: 0; }
.ai-thread__inner { max-width: 760px; margin: 0 auto; padding: 0 24px; }
.ai-composer { flex-shrink: 0; border-top: 1px solid var(--ai-hairline); padding: 14px 24px 18px; }
.ai-composer__inner { max-width: 760px; margin: 0 auto; }

/* User messages stay minimal — requirement 7. No avatar, no chrome. */
.ai-msg--user {
  margin: 0 0 20px auto; max-width: 78%; width: fit-content;
  padding: 10px 14px; border-radius: 16px 16px 4px 16px;
  background: var(--ai-raised); color: var(--text);
  font-size: 14.5px; line-height: 1.55; white-space: pre-wrap;
}
.ai-msg--ai { margin: 0 0 26px; font-size: 14.5px; line-height: 1.65; color: var(--text); }
.ai-msg__text { white-space: pre-wrap; }

.ai-status {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px;
}
.ai-status__dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--champagne);
  animation: ai-pulse 1.4s ease-in-out infinite;
}
@keyframes ai-pulse { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }

/* ═══ Response components ═════════════════════════════════════════════════ */
.ai-cards { display: grid; gap: 10px; }
.ai-cards:not(:empty) { margin-top: 14px; }

.ai-card {
  border: 1px solid var(--ai-hairline); border-radius: 18px;
  background: var(--ai-surface); padding: 14px 16px;
  transition: border-color 150ms ease;
}
.ai-card:hover { border-color: var(--champagne-line); }
.ai-card__name { font-size: 15px; font-weight: 600; color: var(--text); }
.ai-card__budget { font-size: 19px; font-weight: 600; color: var(--deep-sand); margin: 4px 0 2px; }
.ai-card__meta { font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.ai-card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
.ai-tag {
  font-size: 11px; padding: 3px 8px; border-radius: 6px;
  background: var(--ai-raised); color: var(--text-muted);
}
.ai-tag--qualified { background: var(--champagne-dim); color: var(--deep-sand); }
.ai-card__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.ai-card__btn {
  padding: 6px 12px; border-radius: 10px;
  border: 1px solid var(--ai-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.ai-card__btn:hover { color: var(--text); background: var(--ai-raised); }
.ai-card__btn--primary {
  background: var(--accent); color: var(--on-accent);
  border-color: transparent; font-weight: 600;
}
.ai-card__btn--primary:hover { background: var(--accent-hover); color: var(--on-accent); }
.ai-card__btn:disabled { opacity: 0.5; cursor: default; }

/* Confirmation card — deliberately more prominent than a lead card. It is the
   one component gating a real-world side effect (requirement 8). */
.ai-card--confirm { border-color: var(--champagne-line); background: var(--champagne-dim); }
.ai-card--confirm .ai-card__name { color: var(--deep-sand); }

/* ═══ Skeletons, empties, errors (requirement 15) ═════════════════════════ */
.ai-skeleton {
  border-radius: 12px;
  background: linear-gradient(90deg, var(--ai-surface) 25%, var(--ai-raised) 37%, var(--ai-surface) 63%);
  background-size: 400% 100%;
  animation: ai-shimmer 1.4s ease infinite;
}
@keyframes ai-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .ai-skeleton { animation: none; } }

.ai-empty {
  padding: 22px; border: 1px dashed var(--ai-hairline); border-radius: 16px;
  color: var(--text-disabled); font-size: 13px; text-align: center;
}
.ai-card--error { border-color: rgba(220,38,38,0.35); }

/* ═══ Panels & galleries (requirements 9, 10, 12) ═════════════════════════ */
.ai-panel { flex: 1; overflow-y: auto; padding: 28px 24px 64px; }
.ai-panel__head { max-width: 980px; margin: 0 auto 16px; }
.ai-panel__controls, .ai-gallery, #ai-projects-list { max-width: 980px; margin: 0 auto; }
.ai-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.ai-gallery--video { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.ai-gallery:empty { display: none; }
.ai-media { border-radius: 18px; overflow: hidden; border: 1px solid var(--ai-hairline); background: var(--ai-surface); }
.ai-media__img { width: 100%; display: block; aspect-ratio: 4 / 3; object-fit: cover; background: var(--ai-raised); }
.ai-media__img--9-16 { aspect-ratio: 9 / 16; }
.ai-media__img--1-1  { aspect-ratio: 1 / 1;  }
.ai-media__bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }

/* ═══ Menu — the model tier picker ════════════════════════════════════════ */
.ai-input__bar { position: relative; }
.ai-menu {
  position: absolute; bottom: calc(100% + 8px); right: 44px;
  min-width: 208px; z-index: 30;
  padding: 5px;
  border: 1px solid var(--ai-hairline); border-radius: 14px;
  background: var(--ai-raised);
  box-shadow: 0 8px 28px rgba(0,0,0,0.28);
}
.ai-menu__item {
  display: block; width: 100%; text-align: left;
  padding: 8px 10px; border: 0; border-radius: 10px;
  background: transparent; cursor: pointer;
  transition: background 150ms ease;
}
.ai-menu__item:hover { background: var(--hover); }
.ai-menu__item.active { background: var(--champagne-dim); }
.ai-menu__label { display: block; font-size: 13px; font-weight: 600; color: var(--text); }
.ai-menu__item.active .ai-menu__label { color: var(--sand-on-surface); }
.ai-menu__hint { display: block; font-size: 11.5px; color: var(--text-muted); margin-top: 1px; }

/* ═══ Forms — the Images/Videos workspace controls ════════════════════════ */
.ai-form {
  border: 1px solid var(--ai-hairline); border-radius: 18px;
  background: var(--ai-surface); padding: 18px; margin-bottom: 20px;
}
.ai-form__row { margin-bottom: 14px; }
.ai-form__label {
  display: block; font-size: 12px; font-weight: 600;
  color: var(--text-muted); margin-bottom: 6px;
}
.ai-form__select, .ai-form__area {
  width: 100%; padding: 9px 11px;
  background: var(--ai-input-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 12px;
  font: inherit; font-size: 13.5px; outline: 0;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.ai-form__area { resize: vertical; line-height: 1.5; }
.ai-form__select:focus, .ai-form__area:focus {
  border-color: var(--champagne); box-shadow: 0 0 0 3px var(--ai-input-ring);
}

/* Drag-and-drop target for property photos (requirement 15). */
.ai-form__drop {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  padding: 22px; margin-bottom: 14px;
  border: 1px dashed var(--ai-hairline); border-radius: 14px;
  color: var(--text-disabled); font-size: 13px; cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease, background 150ms ease;
}
.ai-form__drop:hover { color: var(--text-muted); border-color: var(--champagne-line); }
.ai-form__drop.dragover {
  border-color: var(--champagne); color: var(--sand-on-surface); background: var(--champagne-dim);
}

.ai-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-chip {
  padding: 6px 12px; border-radius: 999px;
  border: 1px solid var(--ai-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.ai-chip:hover { color: var(--text); border-color: var(--champagne-line); }
.ai-chip.active {
  background: var(--champagne-dim); border-color: var(--champagne-line); color: var(--deep-sand);
  font-weight: 600;
}
.ai-form__foot { display: flex; align-items: center; gap: 12px; margin-top: 18px; }
.ai-form__note { font-size: 12.5px; color: var(--text-muted); }

/* ═══ Responsive (requirement 16) ═════════════════════════════════════════ */
@media (max-width: 1100px) {
  .ai-quick { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  /* The switcher joins the flex row rather than floating over a narrow bar. */
  .workspace-switch { position: static; transform: none; flex-shrink: 0; }
  .workspace-switch__btn { padding: 6px 16px; }

  .ai-landing { padding: 24px 16px 56px; }
  .ai-landing__title { font-size: 23px; }
  .ai-landing__sub { font-size: 13px; }
  .ai-mascot { width: 56px; height: 56px; margin-bottom: 16px; }

  .ai-thread__inner { padding: 0 16px; }
  .ai-composer { padding: 12px 16px 16px; }
  .ai-msg--user { max-width: 88%; }

  /* The control row does not fit at 390px with five items and text labels, and
     the one that was getting pushed off the edge was Send — the single control
     requirement 16 says must "remain easily accessible". So on narrow screens
     the tool buttons go icon-only and Send is pinned as the last flex item that
     may never shrink. */
  .ai-input { padding: 12px 12px 8px; }
  .ai-input__bar { gap: 4px; flex-wrap: nowrap; }
  .ai-tool-btn { padding: 6px 8px; }
  .ai-tool-btn span:not(.ai-input__spacer) { display: none; }
  .ai-btn-label { display: none; }
  /* The model selector keeps its label but yields space before Send does. */
  .ai-model-btn { min-width: 0; overflow: hidden; }
  .ai-model-btn #ai-model-label {
    display: inline; max-width: 84px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .ai-send { margin-left: auto; }

  /* Quick actions become one horizontally-scrollable row per group.
     overflow-x lives on the strip, never the page — requirement 16's
     "no horizontal overflow". */
  .ai-quick__actions {
    display: flex; gap: 8px; overflow-x: auto;
    scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 2px;
  }
  .ai-quick__actions::-webkit-scrollbar { display: none; }
  .ai-quick__action { flex: 0 0 auto; width: auto; margin-bottom: 0; white-space: nowrap; }
  .ai-quick__chev { display: none; }

  /* Wrapping put "Beheren" in the middle of the chip run. Stack instead. */
  .ai-context-row { flex-direction: column; align-items: flex-start; gap: 6px; }
  .ai-context-row__chips { width: 100%; }

  .ai-gallery, .ai-gallery--video, .ai-cards { grid-template-columns: 1fr; }
  .ai-activity__nav { display: none; }
  .ai-act-card { flex-basis: 168px; }
  .ai-section { margin-top: 26px; }
  .ai-panel { padding: 20px 16px 56px; }
}

/* Phones. api/dashboard.js's own mobile CSS notes it fought to keep the topbar
   from growing to 137px on a 375px screen; adding a permanent switcher to that
   row would undo that, and the row was wrapping the theme toggle onto a second
   line. Below 480px the page title is dropped instead: the switcher already
   names the workspace, so the title was the redundant half. */
@media (max-width: 480px) {
  .topbar { flex-wrap: nowrap; gap: 8px; }
  .workspace-switch { order: -1; padding: 2px; }
  .workspace-switch__btn { padding: 5px 12px; font-size: 12.5px; }
  body.ai-active .topbar-left > div { display: none; }
  .topbar-left { flex: 0 1 auto; }
}
`;
}

module.exports = { css };
