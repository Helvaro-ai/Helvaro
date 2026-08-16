'use strict';
/*
 * Helvaro AI — design tokens.
 *
 * SCAFFOLD: complete. Pure CSS, nothing to wire.
 *
 * ── Why this is an extension, not a new palette ──────────────────────────────
 * DESIGN-SYSTEM.md already defines Matte Black (#121212), Charcoal (#1A1A1A)
 * and Sand (#E8D7B1) as the product's palette, with the standing rule that Sand
 * is "a luxury accent, never a flood". Requirement 2's colour list is that same
 * palette plus two values the token layer never named: Warm Sand (#F4E7C8),
 * Champagne Gold (#D8C49A) and Deep Sand (#B89D73).
 *
 * So this file adds three tokens and changes nothing else. The AI workspace
 * inherits every existing surface, text and status token, which is what makes
 * it read as an expansion of Helvaro rather than a second product bolted on
 * (requirement 18).
 *
 * DESIGN-SYSTEM.md's implementation rule applies here too: never hardcode a
 * hex in a component, always go through a token.
 *
 * ── Where the new tokens are allowed ─────────────────────────────────────────
 * champagne — the active workspace-switcher segment, and only that. It is the
 *             one place in the product that needs an accent distinguishable
 *             from Sand-as-selection, because the switcher is always visible
 *             and Sand is already the "selected nav item" signal.
 * warm-sand — the mascot's glow and the AI input's focus ring. Slightly
 *             brighter than Sand so a focused input reads as alive without a
 *             blue focus ring, which requirement 2 rules out.
 * deep-sand — borders and dividers inside AI surfaces, where plain --border
 *             disappears against the darker AI canvas.
 */

function css() {
  return `
/* ── Helvaro AI tokens (extends DESIGN-SYSTEM.md) ────────────────────────── */
:root {
  --warm-sand:      #F4E7C8;
  --champagne:      #D8C49A;
  --deep-sand:      #B89D73;

  /* Derived, so components never compute their own alpha */
  --champagne-dim:  rgba(216, 196, 154, 0.14);
  --champagne-line: rgba(216, 196, 154, 0.32);
  --warm-sand-glow: rgba(244, 231, 200, 0.10);

  /* AI workspace canvas — one step darker than the CRM's --bg-alt so the
     workspace switch is felt, not just seen. */
  --ai-canvas:      #101010;
  --ai-surface:     #1A1A1A;
  --ai-raised:      #232323;
  --ai-hairline:    rgba(184, 157, 115, 0.16);

  /* The AI input is the visual focus of the landing screen (requirement 4). */
  --ai-input-bg:    #1C1C1C;
  --ai-input-ring:  rgba(244, 231, 200, 0.22);
}

/* The light theme keeps the same accents; only the canvas flips. The AI
   workspace is not exempt from the light variant DESIGN-SYSTEM.md deliberately
   kept cheap — see its "two deliberate deviations", point 2. */
[data-theme="light"] {
  --ai-canvas:      #FAF8F4;
  --ai-surface:     #FFFFFF;
  --ai-raised:      #F4F1EA;
  --ai-hairline:    rgba(184, 157, 115, 0.24);
  --ai-input-bg:    #FFFFFF;
  --warm-sand-glow: rgba(184, 157, 115, 0.10);
}
`;
}

module.exports = { css };
