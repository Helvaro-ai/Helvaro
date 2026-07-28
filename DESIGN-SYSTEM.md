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

## Implementation rule
Do **not** find-and-replace hex values. Introduce the token layer first, map
every existing hardcoded colour to a token, then set token values. That makes
this recolour reviewable and the next one trivial.
