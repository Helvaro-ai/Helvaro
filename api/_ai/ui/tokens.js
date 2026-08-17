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

  /* ── Quick-action icon hues ───────────────────────────────────────────────
     One hue per action, families per group. These are the ONE deliberate
     exception to DESIGN-SYSTEM.md's "Sand is the only accent", added on
     request, so they are bounded on purpose:

       - Muted and mid-toned, never saturated. Each reads as a tinted metal,
         not a highlighter — so nine of them in a row still look like one
         palette rather than a toolbar from a different app.
       - No purple, and blue only in a slate-leaning form. Requirement 2 rules
         out "generic AI purple/blue gradients", and that instinct survives
         even though solid icon fills are not gradients.
       - Confined to a 26px icon chip inside a quick action. They never appear
         on text, borders, buttons, charts or status. Sand remains the accent
         everywhere else in the product.
       - Each hue is paired with its own tint so the chip background is derived
         from the glyph rather than guessed. */
  --ic-amber:       #E0A03F;   /* hot leads — heat */
  --ic-slate:       #6B9BC4;   /* pipeline — data */
  --ic-teal:        #4CA39B;   /* conversations */
  --ic-terracotta:  #D08A6A;   /* property image */
  --ic-rose:        #BE7B8D;   /* property video */
  --ic-gold:        #C9B285;   /* listing copy — closest to brand */
  --ic-green:       #5FA877;   /* follow-up — go */
  --ic-orange:      #D9884A;   /* campaign — broadcast */
  --ic-sky:         #6FA9C7;   /* calls */

  /* Sand text that sits on an AI SURFACE (canvas, topbar, composer) rather than
     inside the permanently-dark sidebar. --warm-sand is near-white: correct on
     #101010, invisible on cream. Anything sand-coloured outside the sidebar
     must use this token, which flips with the theme. The switcher's active
     segment measured 1.15:1 in light mode before this existed — on the one
     control that carries the whole two-workspace claim. */
  --sand-on-surface: #F4E7C8;

  --ic-amber-bg:      rgba(224, 160,  63, 0.18);
  --ic-slate-bg:      rgba(107, 155, 196, 0.18);
  --ic-teal-bg:       rgba( 76, 163, 155, 0.18);
  --ic-terracotta-bg: rgba(208, 138, 106, 0.18);
  --ic-rose-bg:       rgba(190, 123, 141, 0.18);
  --ic-gold-bg:       rgba(201, 178, 133, 0.20);
  --ic-green-bg:      rgba( 95, 168, 119, 0.18);
  --ic-orange-bg:     rgba(217, 136,  74, 0.18);
  --ic-sky-bg:        rgba(111, 169, 199, 0.18);
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

  /* The icon hues are darkened for light mode. The dark-theme values are tuned
     to sit on #1A1A1A; on white they read washed out and lose the contrast the
     glyph needs. Same hues, deeper. Tints stay low-alpha and work on both. */
  --ic-amber:       #B87A22;
  --ic-slate:       #3F7099;
  --ic-teal:        #2E7B74;
  --ic-terracotta:  #A85F3F;
  --ic-rose:        #955264;
  --ic-gold:        #8F7A4C;
  --ic-green:       #3B7D53;
  --ic-orange:      #AE5F26;
  --ic-sky:         #437E9E;

  /* Deep enough to clear 4.5:1 on the light canvas while still reading as sand
     rather than brown text. */
  --sand-on-surface: #6B5836;
}
`;
}

module.exports = { css };
