# Helvaro design system — Sand / Enterprise Dark

Premium enterprise SaaS. Reference points: Linear, Stripe, Notion, Vercel, Apple HIG.
**Not** a consumer AI app. No purple gradients, no blue AI glow, no neon, no
glassmorphism, no heavy shadows, no rainbow. If unsure: remove clutter, add whitespace.

## Tokens (implement as CSS custom properties, never hardcode)

### Surfaces
| Token | Value | Use |
|---|---|---|
| `--bg` | `#121212` | main background, sidebar |
| `--bg-alt` | `#1A1A1A` | secondary background |
| `--card` | `#232323` | cards, inputs |
| `--card-elevated` | `#2B2B2B` | raised cards, modals |
| `--border` | `#333333` | borders, chart grid |
| `--divider` | `#2A2A2A` | dividers |
| `--hover` | `#1E1E1E` | sidebar/row hover |

### Brand — Sand (the ONLY accent)
| Token | Value |
|---|---|
| `--accent` | `#E8D7B1` |
| `--accent-hover` | `#DDCAA1` |
| `--accent-pressed` | `#D3BE90` |
| `--on-accent` | `#121212` (text on sand) |

**Sand is a luxury accent, never a flood.** Only: primary buttons, active nav,
selected state, icons, progress, charts, important numbers, highlights.

### Text
| Token | Value |
|---|---|
| `--text` | `#F9F9F9` |
| `--text-muted` | `#999999` |
| `--text-disabled` | `#666666` |
| `--text-inverse` | `#121212` |

### Status
| Token | Value | Note |
|---|---|---|
| `--success` | `#22C55E` | |
| `--warning` | `#E8871E` | **deliberate deviation — see below** |
| `--error` | `#DC2626` | |
| `--info` | `#60A5FA` | |

### Shape & motion
- Buttons radius **14px**, cards radius **18px**. No shadows (use borders).

### Scales (enforced)

Sizes, radii and spacing come from a closed set of tokens declared in
`api/_faro/ui/tokens.js`. `scripts/faro-check.js` fails on a raw `px` value in
any `font-size`, `border-radius`, `padding`, `margin` or `gap` — so this is a
build rule, not a convention.

| Scale | Tokens | Notes |
|---|---|---|
| Spacing | `--sp-05 … --sp-16` (2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64) | A 4px grid. `--sp-05` (2px) and `--sp-15` (6px) are deliberate half-steps for optical alignment — without them people go back to raw values. |
| Type | `--fs-micro` 11 · `--fs-tiny` 12 · `--fs-small` 13 · `--fs-meta` 14 · `--fs-body` 15 · `--fs-lead` 19 · `--fs-title` 23 · `--fs-display` 30 | Named by role, not by size, so a step can be retuned without every call site lying about what it is. |
| Radius | `--r-xs` 6 · `--r-sm` 10 · `--r-md` 14 · `--r-lg` 18 · `--r-full` 999 | `--r-md` and `--r-lg` are the button and card rules above; the check asserts both against the token values. |

**If nothing on the scale fits, the scale is wrong.** Change the token, which
changes it everywhere, rather than reaching for a one-off number. That is the
whole point: Faro's CSS had reached 17 distinct font sizes, 10 radii and 23
spacing values with more than half off any grid. Each was a defensible local
decision, and together they were why two cards built a month apart did not line
up.
- Transitions 150–250ms, fade/scale/slide only. Nothing flashy.
- Inputs: bg `--card`, border `--border`, **focus border `--accent`**,
  placeholder `--text-disabled`.

### WhatsApp conversation view
- Background `--bg`; incoming bubble `#1F1F1F` with white text;
  outgoing bubble `--accent` with `--on-accent` text.

## Two deliberate deviations from the brief

1. **Warning changed `#D4A017` → `#E8871E`.** The specified warning is
   golden-amber, essentially the same hue family as the Sand brand accent —
   a user could not reliably tell "this is a warning" from "this is a
   highlight". Status colours must be unambiguous against the accent, so
   warning is shifted toward orange. Same intent, functionally distinguishable.
   (This matters concretely: the credit-usage bar goes amber at 80% — it must
   not read as a normal sand highlight.)

2. **Implemented as tokens with a light variant left cheap.** The palette ships
   dark-only as specified and dark is the default. But every value is a CSS
   custom property under `:root` / `[data-theme]`, not a hardcoded hex, so a
   light variant is a token swap rather than a second rewrite. Reason: the
   real users are Belgian practice owners and receptionists working in bright
   clinics on mixed hardware — dark-only all day is a genuine accessibility
   risk for that audience, and Stripe/Notion (two of the stated references) are
   light-first for exactly that reason. Not overriding the brief; keeping the
   door open at near-zero cost.

## Third deviation — quick-action icon hues (AI workspace only)

The rule above says Sand is the only accent. The AI workspace's nine
quick-action icons break it, deliberately and on request, and the exception is
recorded here rather than left to be discovered.

Tokens live in `api/_ai/ui/tokens.js` as `--ic-*`. What keeps this from becoming
a second palette:

- **Scope is one element.** A 30px icon chip inside a quick action. The hues
  never touch text, borders, buttons, charts, status, or any CRM surface.
- **Muted mid-tones only.** Each reads as tinted metal, not a highlighter, so
  nine in a row still look like one palette.
- **No purple; blue only as slate.** The brief rules out "generic AI purple/blue
  gradients" and that instinct survives even though solid fills are not gradients.
- **Per-action, not decorative.** One hue per action means the colour carries
  information — an agent learns "amber is my hot leads" and stops reading the
  label. A single global accent would have been decoration.
- **Both themes, both verified.** Light-mode values are separately darkened;
  `scripts/ai-check.js` asserts every hue clears 3:1 against its canvas.

Everything else in the AI workspace remains Sand.

### A trap this exposed

`--warm-sand` (#F4E7C8) is near-white. It is correct on the dark canvas and on
the permanently-dark sidebar, and **invisible on the light canvas** — the
workspace switcher's active segment shipped at 1.15:1 in light mode before this
was caught. Sand-coloured text that sits on an AI *surface* rather than inside
the sidebar must use `--sand-on-surface`, which flips per theme.
`scripts/ai-check.js` now asserts 4.5:1 for it in both themes.

## Implementation rule
Do **not** find-and-replace hex values. Introduce the token layer first, map
every existing hardcoded colour to a token, then set token values. That makes
this recolour reviewable and the next one trivial.
