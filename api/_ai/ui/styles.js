'use strict';
/*
 * Helvaro AI — workspace stylesheet.
 *
 * SCAFFOLD: layout, states and responsive behaviour are real; this file is
 * structurally complete and expected to be refined during visual polish.
 *
 * ── Why the CSS lives here and not inside api/dashboard.js ───────────────────
 * dashboard.js is a single ~19,000-line template literal (`const HTML = \`...\``
 * at line 51). Everything written inside it has to escape backticks and
 * ${...} — that file's own comment at line 16414 warns about exactly this.
 * Adding a few thousand lines of AI workspace CSS and JS in there would make
 * the file harder to edit and every dollar sign a hazard.
 *
 * These modules return plain strings from ordinary files, so nothing needs
 * escaping, and dashboard.js splices them in with a single interpolation.
 * The AI workspace stays reviewable as its own diff.
 *
 * ── Class prefix ─────────────────────────────────────────────────────────────
 * Every selector is prefixed `ai-`, with one exception: `.workspace-switch`,
 * which is chrome shared by both workspaces. Nothing here restyles an existing
 * CRM class — the AI workspace must not be able to break the CRM.
 */

function css() {
  return `
/* ═══ Workspace switcher (requirement 1) ═══════════════════════════════════
   Permanent, top-centre, two segments, no dropdown. Absolutely positioned so
   it sits centred on the page regardless of what the topbar title's width is
   doing on either side of it. */
.workspace-switch {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: 12px;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  z-index: 20;
}
.workspace-switch__btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 6px 20px;
  border-radius: 9px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.workspace-switch__btn:hover { color: var(--text); }
.workspace-switch__btn:focus-visible { outline: 2px solid var(--champagne); outline-offset: 2px; }

/* Active state: champagne, restrained — a tint and a hairline, not a fill.
   DESIGN-SYSTEM.md's "Sand is never a flood" applies to champagne too. */
.workspace-switch__btn.active {
  color: var(--warm-sand);
  background: var(--champagne-dim);
  box-shadow: inset 0 0 0 1px var(--champagne-line);
}
.workspace-switch__sep {
  width: 1px;
  height: 16px;
  background: var(--divider);
}

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
   Reuses .sidebar / .nav-item from the CRM so the two workspaces share one
   sidebar language; only the CONTENTS differ. */
.ai-sidebar { display: none; flex-direction: column; height: 100%; }
.ai-sidebar.active { display: flex; }

.ai-sidebar__new {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px 12px;
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
  padding: 8px 20px 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-disabled);
}
.ai-sidebar__convos { overflow-y: auto; flex: 1; min-height: 0; }
.ai-convo {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 20px;
  font-size: 13px;
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

/* ═══ Landing / empty state (requirement 4) ════════════════════════════════ */
.ai-landing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
  overflow-y: auto;
}
.ai-landing__inner { width: 100%; max-width: 720px; }

.ai-mascot {
  width: 88px;                 /* "subtle and relatively small" — requirement 4 */
  height: 88px;
  margin: 0 auto 24px;
  display: block;
  filter: drop-shadow(0 0 24px var(--warm-sand-glow));
  transition: filter 400ms ease, transform 400ms ease;
}
.ai-mascot[data-state="thinking"] { animation: ai-breathe 2.8s ease-in-out infinite; }
.ai-mascot[data-state="success"]  { filter: drop-shadow(0 0 32px var(--warm-sand-glow)); }
.ai-mascot[data-state="error"]    { filter: drop-shadow(0 0 20px rgba(220, 38, 38, 0.18)); }

/* Deliberately tiny amplitude. Requirement 11: "extremely subtle". */
@keyframes ai-breathe {
  0%, 100% { transform: translateY(0)      scale(1);     }
  50%      { transform: translateY(-2px)   scale(1.015); }
}
@media (prefers-reduced-motion: reduce) {
  .ai-mascot, .ai-mascot[data-state="thinking"] { animation: none; transition: none; }
}

.ai-landing__title {
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-align: center;
  color: var(--text);
  margin: 0 0 8px;
}
.ai-landing__sub {
  font-size: 14px;
  text-align: center;
  color: var(--text-muted);
  margin: 0 0 28px;
}

/* ═══ The AI input — the visual focus of the page (requirement 4) ══════════ */
.ai-input {
  background: var(--ai-input-bg);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 14px 16px 10px;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.ai-input:focus-within {
  border-color: var(--champagne);
  box-shadow: 0 0 0 3px var(--ai-input-ring);
}
.ai-input.dragover {
  border-color: var(--warm-sand);
  box-shadow: 0 0 0 3px var(--ai-input-ring);
}
.ai-input__field {
  width: 100%;
  min-height: 24px;
  max-height: 200px;
  resize: none;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 15px;
  line-height: 1.5;
}
.ai-input__field::placeholder { color: var(--text-disabled); }

.ai-input__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}
.ai-input__spacer { flex: 1; }
.ai-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.ai-tool-btn:hover { color: var(--text); background: var(--hover); }
.ai-send {
  width: 34px; height: 34px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 11px;
  border: 0;
  background: var(--accent);
  color: var(--on-accent);
  cursor: pointer;
  transition: background 150ms ease, opacity 150ms ease;
}
.ai-send:disabled { opacity: 0.35; cursor: default; }

/* ═══ Helvaro context indicator (requirement 6) ════════════════════════════ */
.ai-context {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 12px auto 0;
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid var(--ai-hairline);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
}
.ai-context:hover { color: var(--text); border-color: var(--champagne-line); }
.ai-context__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }

/* ═══ Quick actions (requirement 5) ════════════════════════════════════════ */
.ai-quick { margin-top: 32px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.ai-quick__group { min-width: 0; }
.ai-quick__label {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-disabled); margin-bottom: 8px;
}
.ai-quick__action {
  display: block; width: 100%; text-align: left;
  padding: 9px 12px; margin-bottom: 6px;
  border-radius: 12px;
  border: 1px solid var(--ai-hairline);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.ai-quick__action:hover {
  color: var(--text); background: var(--ai-surface); border-color: var(--champagne-line);
}

/* ═══ Conversation view (requirement 7) ════════════════════════════════════ */
.ai-thread { flex: 1; overflow-y: auto; padding: 24px 0 8px; }
.ai-thread__inner { max-width: 760px; margin: 0 auto; padding: 0 24px; }

/* User messages stay minimal — requirement 7. No avatar, no card, no chrome. */
.ai-msg--user {
  margin: 0 0 20px auto;
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  background: var(--ai-raised);
  color: var(--text);
  font-size: 14.5px;
  line-height: 1.55;
  width: fit-content;
}
.ai-msg--ai { margin: 0 0 24px; font-size: 14.5px; line-height: 1.65; color: var(--text); }
.ai-msg__text > p:first-child { margin-top: 0; }
.ai-msg__text > p:last-child  { margin-bottom: 0; }

.ai-status {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--text-muted); margin-bottom: 10px;
}
.ai-status__dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--champagne);
  animation: ai-pulse 1.4s ease-in-out infinite;
}
@keyframes ai-pulse { 0%,100% { opacity: 0.35; } 50% { opacity: 1; } }

/* ═══ Response components ═════════════════════════════════════════════════ */
.ai-cards { display: grid; gap: 10px; margin-top: 14px; }

.ai-card {
  border: 1px solid var(--ai-hairline);
  border-radius: 18px;
  background: var(--ai-surface);
  padding: 14px 16px;
  transition: border-color 150ms ease;
}
.ai-card:hover { border-color: var(--champagne-line); }

.ai-card__name { font-size: 15px; font-weight: 600; color: var(--text); }
.ai-card__budget { font-size: 18px; font-weight: 600; color: var(--warm-sand); margin: 4px 0 2px; }
.ai-card__meta { font-size: 13px; color: var(--text-muted); }
.ai-card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
.ai-tag {
  font-size: 11px; padding: 3px 8px; border-radius: 6px;
  background: var(--ai-raised); color: var(--text-muted);
}
.ai-tag--qualified { background: var(--champagne-dim); color: var(--warm-sand); }
.ai-card__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.ai-card__btn {
  padding: 6px 12px; border-radius: 10px;
  border: 1px solid var(--ai-hairline); background: transparent;
  color: var(--text-muted); font-size: 12.5px; cursor: pointer;
  transition: color 150ms ease, background 150ms ease;
}
.ai-card__btn:hover { color: var(--text); background: var(--ai-raised); }
.ai-card__btn--primary {
  background: var(--accent); color: var(--on-accent); border-color: transparent; font-weight: 600;
}
.ai-card__btn--primary:hover { background: var(--accent-hover); color: var(--on-accent); }

/* Confirmation card — deliberately more prominent than a lead card. It is the
   one component that gates a real-world side effect (requirement 8). */
.ai-card--confirm { border-color: var(--champagne-line); background: var(--champagne-dim); }
.ai-card--confirm .ai-card__name { color: var(--warm-sand); }

/* ═══ Skeletons & errors (requirement 15) ═════════════════════════════════ */
.ai-skeleton {
  border-radius: 12px;
  background: linear-gradient(90deg, var(--ai-surface) 25%, var(--ai-raised) 37%, var(--ai-surface) 63%);
  background-size: 400% 100%;
  animation: ai-shimmer 1.4s ease infinite;
}
@keyframes ai-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
.ai-card--error { border-color: rgba(220,38,38,0.35); }

/* ═══ Media galleries (requirements 9 & 10) ═══════════════════════════════ */
.ai-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.ai-gallery--video { grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.ai-media { border-radius: 18px; overflow: hidden; border: 1px solid var(--ai-hairline); background: var(--ai-surface); }
.ai-media__img { width: 100%; display: block; aspect-ratio: 4 / 3; object-fit: cover; background: var(--ai-raised); }
.ai-media__img--9-16 { aspect-ratio: 9 / 16; }
.ai-media__img--1-1  { aspect-ratio: 1 / 1;  }
.ai-media__bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px; }

/* ═══ Responsive (requirement 16) ═════════════════════════════════════════ */
@media (max-width: 1024px) {
  .ai-quick { grid-template-columns: 1fr; gap: 14px; }
}
@media (max-width: 768px) {
  .workspace-switch { position: static; transform: none; }
  .ai-landing { padding: 24px 16px; }
  .ai-landing__title { font-size: 22px; }
  .ai-mascot { width: 68px; height: 68px; }
  .ai-thread__inner { padding: 0 16px; }
  .ai-msg--user { max-width: 88%; }

  /* Quick actions become one horizontally-scrollable row per group.
     overflow-x lives on the strip, never on the page — requirement 16's
     "no horizontal overflow". */
  .ai-quick__actions {
    display: flex; gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 2px;
  }
  .ai-quick__actions::-webkit-scrollbar { display: none; }
  .ai-quick__action { flex: 0 0 auto; width: auto; margin-bottom: 0; white-space: nowrap; }

  .ai-gallery, .ai-gallery--video { grid-template-columns: 1fr; }
  .ai-cards { grid-template-columns: 1fr; }
}
`;
}

module.exports = { css };
