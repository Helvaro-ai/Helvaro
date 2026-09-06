'use strict';
/*
 * Faro — design tokens.
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
 * So this file adds three tokens and changes nothing else. Faro
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
/* ── Faro tokens (extends DESIGN-SYSTEM.md) ────────────────────────── */
:root {
  --warm-sand:      #F4E7C8;
  --champagne:      #D8C49A;
  --deep-sand:      #B89D73;

  /* Derived, so components never compute their own alpha */
  --champagne-dim:  rgba(216, 196, 154, 0.14);
  --champagne-line: rgba(216, 196, 154, 0.32);
  --warm-sand-glow: rgba(244, 231, 200, 0.10);

  /* Faro canvas — one step darker than the CRM's --bg-alt so the
     workspace switch is felt, not just seen. */
  --faro-canvas:      #101010;
  --faro-surface:     #1A1A1A;
  --faro-raised:      #232323;
  --faro-hairline:    rgba(184, 157, 115, 0.16);

  /* The AI input is the visual focus of the landing screen (requirement 4). */
  --faro-input-bg:    #1C1C1C;
  --faro-input-ring:  rgba(244, 231, 200, 0.22);

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

/* ── Er is geen lichte Faro meer ───────────────────────────────────────────
   Hier stond een [data-theme="light"]-blok: een tweede canvas (#FAF8F4), een
   tweede stel negen pictogramkleuren, en een tweede --sand-on-surface. Faro is
   weg op verzoek, en dat is niet alleen minder werk -- het is dezelfde keuze
   die de zijbalk, het merkpaneel en sinds vandaag het inlogscherm al maken.

   Faro IS donker. Hij staat als valk op een donker canvas, de bol op de
   landingspagina gloeit, de invoerbalk heeft een gloedring, de mediakaarten
   liggen op bijna-zwart. Dat op wit zetten is geen thema maar een tweede
   ontwerp -- en het was het enige oppervlak in de app dat er twee had.

   Praktisch gevolg: dit bestand hoeft niet langer twee palettes gelijk te
   houden. Er was er één van de twee die je nooit ziet als je zelf in het
   donker werkt, en juist die viel stil kapot -- de actieve pil van de
   schakelaar heeft in het lichte thema ooit op 1,15:1 gestaan.

   De CRM-kant houdt zijn lichte thema gewoon; #btn-theme in de topbalk
   schakelt die nog steeds. Alleen Faro's eigen werkvlak doet niet meer mee.

   Wat hierboven staat geldt dus altijd. Twee controles in scripts/faro-check.js
   die het lichte palet nameten zijn mee verwijderd. */

/* ═══ Scales ══════════════════════════════════════════════════════════════
   Colour tokens flip with the theme; these do not, so they live outside both
   blocks and are declared once.

   Faro's CSS reached 17 distinct font sizes, 10 radii, and spacing values
   scattered across 23 numbers with more than half of them off any grid. Every
   one of those was a reasonable local decision -- 12.5px because 13 looked a
   touch heavy next to that icon -- and together they are the reason two cards
   built a month apart do not line up. The fix is not taste, it is a closed
   set: pick from the scale, and if nothing on it fits, the scale is wrong and
   changes for everyone.

   scripts/faro-check.js enforces this. A raw px value in a size, radius or
   spacing property fails the build.

   ── Spacing: a 4px grid, with 2 and 6 as deliberate half-steps ─────────────
   Half-steps exist because optical alignment sometimes genuinely needs 2px
   (a hairline offset, an icon nudge) and pretending otherwise just pushes
   people back to raw values. */
:root {
  --sp-05: 2px;
  --sp-1:  4px;
  --sp-15: 6px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;
  --sp-5:  20px;
  --sp-6:  24px;
  --sp-8:  32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;

  /* ── Type: eight steps, and the names say the job, not the number ──────
     Named by role rather than by size so a step can be retuned without every
     call site lying about what it is. --fs-body is the reading size; anything
     smaller is supporting text, anything larger is a heading. */
  --fs-micro: 11px;   /* keyboard hints, counters */
  --fs-tiny:  12px;   /* uppercase labels, chips */
  --fs-small: 13px;   /* secondary text, list rows */
  --fs-meta:  14px;   /* controls, card body */
  --fs-body:  15px;   /* the composer and message text */
  --fs-lead:  19px;   /* section headings */
  --fs-title: 23px;   /* panel titles */
  --fs-display: 30px; /* the landing headline, once */

  /* ── Radius: five, two of them fixed by DESIGN-SYSTEM.md ───────────────
     The 14px button and 18px card are the house rule; the other three exist
     because a chip cannot wear a card's corner. */
  --r-xs:   6px;      /* chips, tags, step marks */
  --r-sm:   10px;     /* small controls, icon buttons */
  --r-md:   14px;     /* buttons — DESIGN-SYSTEM.md */
  --r-lg:   18px;     /* cards, panels — DESIGN-SYSTEM.md */
  --r-full: 999px;    /* pills, avatars */
}
`;
}

module.exports = { css };
