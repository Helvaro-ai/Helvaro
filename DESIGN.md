---
name: Helvaro
description: Warm sand-and-charcoal CRM for Belgian trade owners who answer, qualify and book WhatsApp leads from their phone.
colors:
  sand: "#E8D7B1"
  warm-sand: "#F4E7C8"
  charcoal: "#1A1A1A"
  ground: "#F3EDE1"
  raised: "#FAF6EE"
  ink-surface: "#EAE2D2"
  edge: "#D9CCB0"
  edge-strong: "#B89D73"
  ink: "#1F1D19"
  ink-muted: "#6B6252"
  ink-disabled: "#A2977F"
  sand-ink: "#6E5320"
  success: "#2F8F4E"
  success-ink: "#226838"
  warning: "#B4661A"
  warning-ink: "#995716"
  error: "#C2352B"
  error-ink: "#A52D25"
typography:
  display:
    fontFamily: "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "'Inter', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.8px"
rounded:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  full: "999px"
  crm-sm: "4px"
  crm-btn: "8px"
  crm-card: "12px"
spacing:
  sp-05: "2px"
  sp-1: "4px"
  sp-15: "6px"
  sp-2: "8px"
  sp-3: "12px"
  sp-4: "16px"
  sp-5: "20px"
  sp-6: "24px"
  sp-8: "32px"
  sp-10: "40px"
  sp-12: "48px"
  sp-16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.warm-sand}"
    rounded: "{rounded.crm-btn}"
    padding: "7px 14px"
  button-secondary:
    backgroundColor: "rgba(255,255,255,0.04)"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.crm-btn}"
    padding: "7px 14px"
  card:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.crm-card}"
    padding: "22px 20px 18px"
  input:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.crm-card}"
    padding: "15px 18px"
---

# Design System: Helvaro

## Overview

**Creative North Star: "The Showroom Sample Board"**

Helvaro is not a screen full of purple-AI gradients pretending to be intelligent, and it is not a cream editorial essay pretending to be a magazine. It is a warm sand board with real product pieces pinned to it in workflow order — the same material logic the marketing site uses (`.impeccable/surfaces/site-index-html.md`), inherited wholesale by the app rather than re-invented for it. Three tone steps carry the whole page (ground → raised → the third, darkest/lightest step), nothing lives between them, and a muted-tan edge does the work a shadow would do elsewhere. Depth is a lift of one tone step plus a border shifting toward the accent, not a diffuse glow underneath.

Sand (`#E8D7B1`) is the one brand accent and it is a *fill*, never type — the ratio on white is ~1.7:1, unreadable, which is why every accent-as-text use routes through a separately tuned ink variant (`--accent-ink`, `--sand-on-surface`). Charcoal and sand form the product's one deliberate two-tone chip, and which one is the fill flips by theme: dark reads sand-on-charcoal, light reads charcoal-on-warm-sand — same two colours, same solid block, inverted. Two structural exceptions to the single-accent rule are recorded, bounded, and contrast-checked rather than left implicit: Command Center's five category tones (hot/ready/risk/value/cold) and Faro's nine quick-action icon hues, each confined to one small chip and never touching text, borders or charts.

Two themes are peers, not an inversion of each other. Dark Helvaro is a warm near-black board under evening light (`#17140F`), not a colour-flipped mirror of the light board (`#F3EDE1`); both were independently measured for contrast (`node scripts/contrast-check.js`, all pairs ≥4.5:1 except the two exempted `text-disabled` pairs). Light is the shipped default (`[data-theme="light"]` is the app's baseline; dark is the alternate a user opts into). One surface deliberately does not follow either theme: the login podium and Faro's own canvas (compose bar, landing, sidebar) stay dark regardless of the app's theme, because they are a stage the brand performs on, not a workspace the user reads all day.

**Key Characteristics:**
- Three tone steps per theme (ground / raised / third step), a tan edge instead of a shadow, and a one-step lift on hover/active — never a floating card.
- Sand fills, an ink variant (measured per surface) carries it as text; the one two-tone chip (sand+charcoal) inverts by theme rather than existing as two different patterns.
- Space Grotesk carries headings and the big tabular numerals; Inter carries everything a user actually reads.
- Status is never colour-only: every badge, chip and status pill in the shipped markup pairs its colour with a translated text label (`T('dash.s.new')`, `T('dash.s.busy')`, `T('dash.s.done')`, …).
- The login podium and Faro's canvas are permanently dark, by name, as the one exception to "the app follows the theme."
- Faro and Command Center run on an enforced closed scale (`--sp-*`, `--r-*`, `--fs-*`; a raw px fails `scripts/faro-check.js`); the CRM dashboard surface — the majority of the shipped product — keeps its own parallel, unenforced rhythm (see Layout and Shapes for the split, recorded honestly rather than smoothed over).

## Colors

Warm, low-saturation, earth-adjacent. Four tonal families exist in the source as 11-stop OKLCH ramps (zand/sand, klei/clay, olijf/olive, steen/stone) so future greys stay warm instead of drifting cool-grey against a sand accent; only sand ships as UI today.

### Primary
- **Sand** (`#E8D7B1`): the one brand accent. Fills only — buttons, active nav pill, selected states, icons, chart fills, highlights. Never set as text directly.
- **Warm Sand** (`#F4E7C8`): a brighter sand used narrowly — the Faro mascot's glow, the AI input's focus ring, and (as `--btn-primary-text`) the primary button's own text in the light theme, sitting on charcoal.
- **Sand-ink** (`#6E5320` light · `#F5ECD7` dark): sand's role as *text*, tuned per surface, never the raw accent hex. Light-theme value was re-measured against the actual tinted chip it sits on (not the bare card) after three earlier attempts landed under 4.5:1; it now clears 4.5:1+ on every surface it appears on, dark and light.

### Neutral
- **Ground** (`#F3EDE1` light · `#17140F` dark): page background, tone step 1. Warm-tinted on purpose in both directions — a cool-grey ground under a sand accent reads dirty, which is the exact defect the light ground was rebuilt to fix (measured contrast against a pure-white ground: 1.0, meaning no visible separation at all).
- **Raised** (`#FAF6EE` light · `#211D16` dark): card/panel surface, tone step 2.
- **Ink-surface** (`#EAE2D2` light · `#120F0B` dark): the third, most-recessed tone step — secondary backgrounds, the permanently-dark sidebar's parent context.
- **Edge** (`#D9CCB0` light · `#3A3327` dark) / **Edge-strong** (`#B89D73` light · `#574B37` dark): the tan border that stands in for a shadow. Deliberately several steps darker than the raised surface it outlines — a border with too little separation from its card reads as no border, which is why the whole "flat" complaint against the pre-Fase-4 palette existed.
- **Ink** (`#1F1D19` light · `#F1E9DA` dark): body text — never pure black or pure white, by standing rule.
- **Ink-muted** (`#6B6252` light · `#A79B85` dark): secondary/supporting text.
- **Ink-disabled** (`#A2977F` light · `#6F6554` dark): disabled text, explicitly exempted from the 4.5:1 floor by `scripts/contrast-check.js` (disabled content is allowed to read as inert).
- **Charcoal** (`#1A1A1A`): the dark half of the one primary-button chip; also `--text-inverse`.

### Status
- **Success** (`#2F8F4E` light fill · `#4CAF6E` dark fill; ink `#226838` light · alias of fill dark).
- **Warning** (`#B4661A` light · `#E8A54A` dark; ink `#995716` light · alias dark).
- **Error** (`#C2352B` light · `#E4665A` dark; ink `#A52D25` light · `#E7756B` dark — the dark fill itself only cleared 4.5:1 against a *bare* card, not the 12%-tinted chip text actually sits on, so the ink was pushed 10% toward white after `contrast-check.js` caught the gap).
- All four are measured against the *chip they actually render on* (a tinted background over the card), not the bare card — this project's contrast script exists specifically because that distinction sank three status inks at once during Fase 4.

### Named Rules
**The Fill-Not-Type Rule.** Sand fills; it is never set as running text. Anywhere sand carries text, it routes through an `-ink` (or `sand-on-surface`) variant measured against the exact surface it sits on.

**The Inverted Chip Rule.** There is exactly one primary-button pattern in this system: a flat, solid two-tone chip, sand-on-charcoal or charcoal-on-warm-sand. Which colour is the fill inverts by theme; the pattern itself — solid block, no tint, no gradient — does not.

**The One-Accent Rule.** Sand is the only brand accent. Two bounded, named, contrast-verified exceptions exist and are not precedent for a third: Command Center's five semantic category tones (`--cmd-hot/ready/risk/value/cold`, literal hex by design since they encode urgency, not brand) and Faro's nine quick-action icon hues (muted mid-tones, confined to a 26px chip, never touching text/borders/charts). Everything else that used to carry its own hue (`--c-blue`, `--c-purple`, `--c-cyan`, `--c-gold`) is now a legacy alias that resolves back to sand.

## Typography

**Display / Heading Font:** Space Grotesk (self-hosted variable, `public/fonts/space-grotesk-var.woff2`, weight range 300–700), falling back to Inter.
**Body Font:** Inter (self-hosted variable, `public/fonts/inter-var.woff2`, weight range 300–700). Both self-hosted specifically so no request ever reaches Google's CDN (GDPR).

**Character:** Space Grotesk is the brand's one point-of-view face — reserved for headings and the big tabular numerals, where the product's confidence needs to show. Inter carries every word a user actually reads, at 700 max weight for Space Grotesk (not 800: "Space Grotesk doesn't need to go heavier, and 700 already reads sturdier than Inter at 800").

### Hierarchy
The role-named scale below (`--fs-*`) is the one place sizes are named and build-enforced — it governs Faro's workspace and Command Center (`scripts/faro-check.js` fails a raw px there). The CRM dashboard surface (the bulk of the shipped product, `api/_dash/styles.js`) reproduces closely matching sizes in **literal pixels** rather than through these tokens (0 of 704 `font-size` declarations reference `var(--fs-*)`) — same rhythm, not the same enforcement. See Layout for the full split.

- **Display** (700, 30px, line-height 1, −0.02em): `--fs-display`. The one Faro landing headline. The CRM's closest analog is `.stat-value` (28px, tabular-nums) — the dashboard numerals that "ARE the product."
- **Headline** (700, 23px): `--fs-title`, panel titles.
- **Title** (700, 19px): `--fs-lead`, section headings.
- **Body** (400–500, 15px, line-height ~1.5): `--fs-body`; `html { font-size: 15px }` sets this as the CRM's actual base too.
- **Label** (600–700, 11–12px, uppercase, 0.6–0.8px tracking): `--fs-tiny`/`--fs-micro`. Tracked-caps labels are a real, reused convention — `.stat-label`, `.form-label`, `.fdr-section-hdr h3`, badge text — not a one-off, and match the direction contract's "charcoal tracked-caps labels for codes" from the site's own showroom board.

Numerals use `font-variant-numeric: tabular-nums` everywhere a figure updates (stat cards, the response-time readout) — introduced when a since-removed display face's zero glyph rendered as a broken box in "€0"/"0%" empty states; Inter's own numerals replaced it rather than reaching for a second display font.

## Layout

The CRM dashboard is a fixed 220px sidebar plus a flexible main column (`margin-left: 220px` on `.main-content`, `min-width: 0` required on both the flex column and `.page-content` so the pipeline kanban's intrinsic width scrolls inside itself instead of pushing the whole layout off-screen). Page content pads at `24px 28px`.

Two rhythms coexist, split cleanly by surface, and that split is recorded rather than resolved:
- **Faro's workspace and Command Center** run on the enforced `--sp-*` scale (a 4px grid: 2/4/6/8/12/16/20/24/32/40/48/64, with 2 and 6 as deliberate optical half-steps) and the `--r-*` radius scale. A raw px in a size, radius or spacing declaration in either surface's stylesheet fails `scripts/faro-check.js` at build time — 19 uses of `var(--sp-*)` in the CRM file are the handful of places the dashboard borrows this scale directly (mostly where Faro's dock is mounted inside it).
- **The CRM dashboard** (`api/_dash/styles.js`, ~9,800 lines, by far the largest of the four stylesheets) is *not* covered by that check and uses literal pixel values throughout: 479 raw `padding`, 50 raw `margin`, 371 raw `gap` declarations against 19 that reference `--sp-*`. The values cluster on roughly the same 2/4px-ish grid by convention, not by enforcement.

Responsive behaviour: the login screen stacks to a single column under 860px and drops its brand panel entirely rather than pushing it below the form (it previously left a 227px empty band under the footer). Touch targets follow WCAG 2.2's 24×24px floor at rest and grow to 44×44px under 480px width for `.btn-icon`, row-action and panel-close controls — several shipped at 14–20px before this pass.

## Elevation & Depth

Flat by rest, tonal by hover — never a floating shadow. `--shadow-card`, `--edge-hi`, `--btn-glow` and `--shadow-glow` are all defined and equal to `none` in both themes; they remain as resolved-empty aliases only because ~9,800 lines still reference them, not because anything renders through them. A card's depth is entirely a 1px tan `--edge` (`--border-c`) plus, on hover, a one-tone-step lift (`translateY(-2px)`) and the border shifting toward the metric's own accent — no shadow is added.

There is exactly one true offset shadow in the system, `--elev-3` (`0 20px 48px rgba(0,0,0,.32)` dark · `rgba(64,52,32,.14)` light, warm-tinted rather than blue-grey), and it is reserved for content that floats fully above the page rather than sitting on it: the modal and the global-search overlay only.

### Named Rules
**The Edge-Not-Shadow Rule.** Depth is a tan border plus a one-tone lift. A diffuse shadow under a resting card is the specific defect this system was rebuilt away from; `--elev-3` is the sole, named exception, for true overlays only.

## Shapes

Two radius scales ship, cleanly split by the same surface boundary as Layout — this is a real fact of the build, not a proposal to unify:

- **Faro / Command Center** (enforced, `--r-*`): `--r-xs` 6px (chips, tags, step marks) · `--r-sm` 10px (small controls, icon buttons) · `--r-md` 14px (buttons) · `--r-lg` 18px (cards, panels) · `--r-full` 999px (pills, avatars). `scripts/faro-check.js` asserts `--r-md === 14px` and `--r-lg === 18px` by name, citing the incumbent `DESIGN-SYSTEM.md`.
- **CRM dashboard** (its own local scale, `--radius-*`, not build-checked): `--radius-sm` 4px · `--radius-btn` 8px · `--radius-card` 12px — deliberately tightened during Fase 4 ("was 8/14/22... a visible tightening across every button and card in the app"). In practice, the CRM's own primary button (`.btn-icon.btn-primary-sm`) renders at **8px**, and its stat cards at **12px** — not the 14px/18px the enforced scale and the incumbent doc state as the house rule. A component moving between the CRM surface and Faro/Command Center should use its own surface's scale, not assume the other's numbers.

Corners are consistently rounded (never sharp, never a full curve except pills/avatars); borders are 1px hairlines in `--edge`/`--edge-strong`, never a heavier rule.

## Components

### Buttons
- **Shape:** CRM buttons at 8px (`--radius-btn`); Faro/Command Center buttons at 14px (`--r-md`). See Shapes.
- **Primary (the one chip):** flat, solid two-tone fill — `--btn-primary-bg`/`--btn-primary-text`, which invert by theme (sand-on-charcoal dark, charcoal-on-warm-sand light). No tint, no gradient, no glow. `.btn-icon.btn-primary-sm`, padding `7px 14px`. Hover is a `brightness(1.08)` filter and the same rim, not a colour or shadow change; active is `brightness(0.96)`.
- **Secondary (icon/ghost):** `.btn-icon` alone — a near-transparent fill (`rgba(255,255,255,0.04)` dark) with a 1px rim (`--btn-rim`, a light-above/dark-below inset pair standing in for a bevel) and `--text-secondary`. Hover tints toward the accent at 14% and lifts the text colour to `--accent-ink`.
- **Focus:** every interactive element gets a 2px `--focus-ring` outline at zero specificity (`:where(...):focus-visible`) as a floor, so anything with its own ring keeps it and anything without one now has one — introduced after a real Tab-key audit found three different, inconsistent focus rings (one literally invisible: `#121212` Chrome default on a dark card, 1.27:1).
- **Press:** buttons nudge `translateY(1px)` on `:active` at the same zero-specificity floor, for the same reason — roughly half the product's ~92 buttons had a press response and half didn't.

### Cards
- **Corner:** 12px (CRM) / 18px (Faro, Command).
- **Background:** `--raised`, flat — no gradient fill (the earlier "card is a gradient plate" trick was explicitly reverted; see Do's and Don'ts).
- **Border:** 1px `--edge`.
- **Elevation:** see Elevation & Depth — a tone-step lift on hover, never a shadow at rest.
- **Per-metric accent:** a stat card binds one `--a`/`--a-soft` pair (from the status/accent palette) that colours its icon chip, its fill bar and a 2px top hairline revealed on hover — the accent never touches the value text itself ("coloured numerals fail contrast and read as decoration rather than data").

### Status (badges / chips)
- **Style:** pill shape (`border-radius: 20px`), a 10%-tinted background, a matching `-ink` text colour, and a 1px border at ~20% tint of the same hue. `in_progress` and `yes` states add a small animated dot inside the pill.
- **The rule that holds everywhere checked:** every status render pairs its colour with a translated text label (`T('dash.s.new')` / `.busy` / `.done`, `val.ja`/`val.nee`) — no instance found of colour carrying status alone.

### Inputs
- **Style:** `--raised` background, 1.5px `--login-field-line`/`--border` stroke, 12px radius (login) — sits *recessed* into its panel on the login stage specifically (`--login-input-bg` one step darker than `--login-panel`).
- **Focus:** border shifts to the accent plus a 4px `rgba(accent, 0.25)` glow ring around the field itself (the one place a soft accent glow is intentional — a focus affordance, not a surface treatment).
- **Error:** border to `--error`, a faint red-tinted background wash, focus ring recolours to `rgba(error, 0.12)`.

### The Login Podium & Faro's Canvas (the theme exception)
Two surfaces do not follow `[data-theme]`, by explicit, recorded decision, and both are permanently dark:
- **The login screen** (`#login-page`, `--login-stage` `#17140F`) — "a podium, not a surface of the app." There is no logged-in user yet to have a theme preference, every new visitor gets the same stage, and one ground plus one logo beats maintaining a second light palette nobody asked for.
- **Faro's own canvas** (`--faro-canvas`/`--faro-surface`/`--faro-raised`, same `#17140F`/`#211D16`/`#2A251C` as Dark Helvaro's ground) — the compose bar, the landing, the permanently-dark sidebar. A light Faro palette existed once (a second canvas colour, a second set of nine icon hues, a second `--sand-on-surface`) and was removed on request rather than maintained as a rarely-seen, silently-breaking twin — its active workspace-switcher segment had shipped at 1.15:1 contrast in light mode before anyone caught it. The CRM side of the app keeps its light theme; only Faro's own workspace stays dark.

## Do's and Don'ts

### Do:
- **Do** fill with sand; carry it as text only through a per-surface `-ink`/`sand-on-surface` variant, never the raw accent hex.
- **Do** lift a card or pill one tone step and/or shift its border toward the accent on hover — never add a shadow to a resting surface.
- **Do** pair every status indicator with a translated text label, not colour alone.
- **Do** keep the login podium and Faro's own canvas dark regardless of the app theme; let the CRM side follow `[data-theme]` as normal.
- **Do** respect `prefers-reduced-motion` on every custom animation — checked and present across all four stylesheets (13 separate media-query blocks).
- **Do** route new Faro or Command Center CSS through `--sp-*`/`--r-*`/`--fs-*` — `scripts/faro-check.js` fails a raw px there; the CRM dashboard has no equivalent check, which is a gap, not a licence to skip tokens there either.
- **Do** measure a status colour's contrast against the actual tinted chip it renders on, not the bare card underneath — the specific mistake `scripts/contrast-check.js` exists to catch, and it has already caught it three times.

### Don't:
- **Don't** use a gradient as a surface fill (card, panel, button). The dark-theme secondary button and the stat card were explicitly reverted off a gradient-fill treatment ("finish-fix 3 verbiedt de 'kaart-is-een-verloop'-truc"). **Known unrepaired exceptions, not a pattern to extend:** the light-theme `.btn-icon` (`[data-theme="light"] .btn-icon`, still `linear-gradient(180deg, --card, --card-elevated)`) and two live primary-button variants (`.fm-btn-primary`, `.ap-btn-primary`, both `linear-gradient(135deg, --accent, --accent-bright)`) still ship a gradient fill the flat `.btn-primary-sm` chip was built to replace. A horizontal two-stop accent gradient *is* an established, separate convention for progress/meter fills only (`.fdr-progress-bar`, `.founder-goal-fill`, `.revenue-goal-bar`, `.score-segment.filled`) — that one is a real, reused pattern and is not the same violation.
- **Don't** add a glow (button, card, or text). `--btn-glow`/`--shadow-glow` are permanently `none`. **Known unrepaired exception:** `.stat-value.cyan/green/orange/blue` and `.analyse-stat-big` still carry a `text-shadow: 0 0 20px` glow in dark mode (light mode already overrides it to `none`) — a leftover from the pre-Fase-4 palette, not a sanctioned effect.
- **Don't** invent a second brand colour. `--c-blue`, `--c-purple`, `--c-cyan`, `--c-gold` are legacy aliases that all resolve to sand; the two bounded status/icon exceptions are named above and are not precedent for a third.
- **Don't** call the product "AI" in customer-facing copy — describe what Faro/Helvaro does instead (PRODUCT.md positioning: Faro is a named product character, not a generic AI feature).
- **Don't** set pure black or pure white as a surface or text colour — every ground, card and text token is warm-tinted off true black/white by design.
- **Don't** borrow the other surface's radius numbers. CRM buttons/cards are 8px/12px; Faro and Command Center are 14px/18px. Moving a component between them without re-checking its radius reproduces the exact "two cards a month apart don't line up" problem the scale was built to prevent.
