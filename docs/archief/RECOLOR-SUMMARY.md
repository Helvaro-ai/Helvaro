# Recolor Summary — Sand / Enterprise Dark

Branch `feature/vercel-growth`, worktree `vercel-features`. Recolors the client
dashboard and every client/prospect-facing surface off the default Tailwind
indigo/purple palette onto the Sand / Enterprise Dark system defined in
`DESIGN-SYSTEM.md`. Visual only — no behavior, data-flow, or logic changes.

Commits (chronological): `6ede245` → `e56eeae` (13 commits, all prefixed
`style(ui):`).

## Token layer introduced

`api/dashboard.js` already had a partial CSS custom-property layer at
`:root` (`--bg-primary`, `--accent`, `--text-primary`, …) — most of the
15,877-line file already consumed colors through `var()`. Rather than
rename those and touch every call site, the token layer was rebuilt in
place:

- **New canonical tokens** (the ones named in `DESIGN-SYSTEM.md`): `--bg`,
  `--bg-alt`, `--card`, `--card-elevated`, `--border-c`, `--divider`,
  `--hover-c`, `--accent-c` / `--accent-hover-c` / `--accent-pressed-c`,
  `--on-accent`, `--text-c` / `--text-muted-c` / `--text-disabled`,
  `--success-c` / `--warning-c` / `--error-c` / `--info-c`,
  `--bubble-incoming`, `--radius-btn` (14px), `--radius-card` (18px).
- **RGB-triplet companions** (`--accent-rgb: 232,215,177`, plus
  `--success-rgb`/`--warning-rgb`/`--error-rgb`/`--info-rgb`/`--text-rgb`)
  so translucent tints (`rgba(var(--accent-rgb), 0.12)`) work — CSS
  custom properties can't nest a hex color inside `rgba()`, only a
  comma-separated triplet.
- **Legacy aliases** (`--bg-primary: var(--bg)`, `--accent: var(--accent-c)`,
  `--blue-primary: var(--accent-c)`, `--green: var(--success-c)`, etc.) —
  every one of the ~450 existing `var(--old-name)` call sites across the
  file now resolves through these aliases to the new palette without a
  single line-by-line rewrite. This is also why the diff is smaller than
  "71 unique hex" would suggest: most of the file was already tokenized,
  it was just pointed at the wrong palette.
- `[data-theme="light"]` gets the same tokens with a light value set
  (`--bg: #F7F5F0`, `--accent-c: #C9A85E`, …) so the existing theme
  toggle keeps working — per `DESIGN-SYSTEM.md`'s "light left cheap"
  note, this wasn't polished beyond making it functionally correct.
- `api/form-page.js`, `public/onboard.html`, `api/demo.js` each got the
  same token *pattern* (their own small `:root` block) since they're
  independent documents with their own `<style>`.

## Per-area before → after

- **Login page** (`#login-page` block, ~450 lines): full rebuild. Killed
  the purple gradient CTA (`linear-gradient(135deg, #4f46e5, #6366f1 50%,
  #818cf8)`), the 4-layer indigo/cyan glow-orb backdrop, the glassmorphic
  `backdrop-filter: blur(28px)` floating card, and every gradient-clipped
  heading. Replaced with: white form panel / calm `--bg` dark panel split
  (kept — legitimate Stripe/Linear pattern), one restrained single-stop
  sand bloom (`rgba(232,215,177,0.045)`), flat `var(--card-elevated)` +
  border for the mock card, sand-only CTA with `var(--on-accent)` text.
- **Global chrome**: ambient `body::before/::after` dot-grid + "Linear-style
  indigo bloom" → neutral dot-grid + one quiet sand wash (was explicitly
  named in the brief as the "blue AI glow" anti-pattern).
- **Component sweep** (buttons, badges, pills, icon chips, progress bars,
  focus rings, calendar, pipeline, Frade/Founder Hub sub-panels, chat
  bubbles, notifications, modals): ~250 raw hex/`rgba()` declarations and
  97 `linear-gradient()`/`radial-gradient()` calls mechanically swept —
  indigo/purple/sky/teal decorative two-tone gradients flattened to a
  single `var(--accent)` (icons, buttons, progress bars are the
  spec-sanctioned sand use cases); green/red/amber gradients flattened to
  their matching status token.
- **WhatsApp conversation view** (`.chat-bubble` in the lead panel):
  incoming (`.user`) → `background: var(--hover)`-family neutral (spec
  says `#1F1F1F`, implemented as `--bubble-incoming`), outgoing (`.ai`,
  `.ai.manual`) → `var(--accent)` / `var(--on-accent)`, matching spec
  exactly instead of the old blue-vs-teal AI/manual distinction.
- **Credit usage bar**: already correctly wired to `var(--green)` /
  `var(--orange)` / `var(--red)` once those aliased to the new tokens —
  confirms the deliberate warning-color deviation (`#E8871E` instead of
  the briefed `#D4A017`) reads as distinct from the sand accent at 80%
  usage, per `DESIGN-SYSTEM.md`.
- **Chart.js configs** (lead trend bar, source donut, score distribution,
  days/hours charts): these render to `<canvas>`, which cannot resolve
  CSS custom properties. My first mechanical sweep pass regressed this —
  it replaced literal `rgba(99,102,241,X)` JS *strings* with
  `rgba(var(--accent-rgb),X)`, which is invalid inside a canvas fillStyle
  and would have silently broken every chart. Caught in verification,
  reverted to literal hex/rgb mirroring the new tokens (documented inline
  as intentionally-hardcoded). The multi-category palettes (lead-source
  donut, calendar event colors) were redesigned from raw Tailwind hues to
  a muted 5–6 color "enterprise categorical" set (`#E8D7B1`, `#7C93C4`,
  `#8FA888`, `#C99A6C`, `#A78BA0`, `#8B949E`) instead of just re-hueing
  indigo → sand for a data-differentiation use case that never needed to
  be single-accent.
- **Pipeline/funnel stage colors** (`.fdr-followup-fase`, pipeline column
  headers, `renderPipeMini`): unified the 3-stage legend (was raw
  `#60a5fa` / `#fbbf24` / `#f97316` duplicated in 3 places — CSS, inline
  `style=`, and a JS `stages` array) to the same muted categorical family
  for consistency.
- **`form-page.js`** (client-facing lead form, brand-critical): default
  `brandColor` fallback changed from `#6366f1` to `#8A6D3F` — a deep
  warm bronze in the sand family, deliberately *not* the pale `#E8D7B1`
  accent, because this color is used as a **solid fill with white text**
  throughout that file (avatar, CTA button) and pale sand would fail
  contrast there. Verified `#8A6D3F` vs white ≈ 4.84:1 (AA). The
  per-client `Brand Color` Airtable override is untouched — same
  validation regex, same code path, only the *default* changed. Cool
  navy body chrome (`#0d0f1a`, `#e8eef7`, `#6a85b0`, `#3d5070`) warmed to
  the neutral dark palette (`#121212`/`#F9F9F9`/`#999999`/`#666666`).
- **`onboard.html`** (6-step wizard): had its own clean `:root` already —
  repointed the 12 token values, fixed the 3 raw indigo literals that
  weren't tokenized (ambient bg gradient, brand-color default
  placeholder + swatch, one `.pill-opt.checked` tint).
- **`privacy.js`** (Terms/Privacy, light page, no indigo present): warmed
  the generic web-blue link color (`#0066cc`) and cold grays (`#111`/
  `#444`/`#999`/`#eee`) to the warm neutral family (`#8A6D3F` link,
  `#18160F`/`#4A453C`/`#8A8478`/`#E4E0D6`) for brand consistency. Left
  the page light-first (appropriate for a legal document read outside
  the app).
- **`demo.js`** (widget test page): killed the cyan gradient-text
  wordmark (`linear-gradient(135deg, #fff, #00d4ff)`, `#00d4ff` badges)
  and navy card, replaced with the dark/sand palette.

## Bugs found and fixed during verification (not in the original ask, but
caused by or exposed during this work — documented for honesty)

1. **Chart.js `rgba(var(--accent-rgb))` regression** — my own mechanical
   sweep introduced this (canvas can't resolve CSS vars); fixed before
   first commit's verification pass by reverting those specific spots to
   literal hex/rgb.
2. **Corrupted gradient declarations** — a regex bug in my own flattening
   script (non-greedy paren matching stopped at the first nested `)`
   inside an `rgba(...)` argument) corrupted 15 `background:` declarations
   into invalid CSS with a dangling `)`. Caught by a paren-balance sweep
   over the whole `<style>` block, all 15 repaired to clean flat
   `var(--accent)` values.
3. **White text on sand backgrounds** — ~20 instances where a `color:
   #fff`/`white` was paired (same line or same rule) with a background
   that resolved to `var(--accent)`/`var(--accent-bright)` — invisible or
   near-invisible under the old dark indigo, genuinely broken under the
   new pale sand. Fixed to `var(--on-accent)`. Includes 8 inline SVG
   icons (`stroke="#fff"`) sitting inside sand icon badges.
4. **Sand-flooded "hero" panels** (`.fdr-hero`, `.fm-hero`, `.ap-hero`,
   `.profile-hero`) — these had been simplified by my gradient-flattening
   pass to a **solid** `background: var(--accent)` fill on large content
   panels containing `var(--text-primary)`/`var(--text-muted)` body text.
   That's both illegible (light text on light sand) and a direct
   violation of "sand is a luxury accent, never a flood." Caught only by
   actually rendering the app and looking — this is exactly why the
   render-verification step exists, not just grepping for hex. Fixed to
   a subtle `rgba(var(--accent-rgb), 0.06–0.08)` tint with a matching
   soft border, same visual "highlighted panel" intent, correct contrast.
5. **`.stat-card::after` "corner shimmer"** — a decorative 60×60px pseudo-
   element that was originally an 8%-opacity radial gradient got
   flattened to a 100%-opacity solid sand square by the same corruption
   bug — a visibly broken gold block in the corner of all 6 dashboard
   stat cards. Removed (this was pure decoration; "if unsure, remove
   decoration" per the design brief).
6. **`[data-theme="light"] .nav-item.active` / `.btn-primary-sm`** — two
   pre-existing duplicate CSS rules (same selector declared twice at
   different points in the file, later one winning the cascade) that set
   `background: var(--accent)` with `color: var(--accent)` from the
   earlier, non-overridden rule — invisible text. This pattern **pre-dates
   this work** (confirmed against the pre-recolor baseline: old indigo
   accent-on-accent was already broken, just less visually loud). Fixed
   because I was already touching these exact selectors' siblings.
   `.page-title` also had its own leftover white→blue gradient-text-clip
   effect that the generic `.gradient-text` fix didn't cover — flattened
   to solid `var(--text)`.

Bugs 4–6 were found by actually rendering the dashboard with a throwaway
Playwright harness against mock lead data (dark theme, light theme,
mobile viewport, lead panel, Resultaten empty state, Kalender, Profiel,
Instellingen) rather than by reading the diff — several would not have
been caught by grep-only verification.

## Verification results

- `node -c` on `api/dashboard.js`, `api/form-page.js`, `api/privacy.js`,
  `api/demo.js`: **all pass**.
- **ID integrity**: 345 unique literal `getElementById`/`querySelector`
  targets extracted from `dashboard.js`; all resolve to markup except 5,
  and those 5 are confirmed present (at proportionally the same spots) in
  the pre-recolor baseline commit — pre-existing, not introduced here
  (3 are genuinely dead `getElementById` calls with no matching markup
  anywhere; `confirm-modal`'s id is set dynamically via `el.id = ...`,
  not static markup).
- `getElementById(` occurrences: **569 → 569** (identical, baseline vs.
  now).
- `querySelector(` occurrences: **22 → 22** (identical).
- `escHtml(` occurrences: **150 → 150** in `dashboard.js`, **37 → 37** in
  `form-page.js` (identical; counted via occurrence count, not line
  count — some lines call it more than once, so `grep -c` alone
  undercounts). No escaping/rendering path was touched.
- `api/*.js` route count (excluding `_*` helpers): **11**, unchanged —
  no new route files.
- External origins: diffed every added line across all 5 changed files
  for `http://`/`https://`/`cdn`/`fonts.googleapis`/`@import` — the only
  match is the standard `http://www.w3.org/2000/svg` XML namespace inside
  an inline `data:` SVG (not a network request). Zero new CDN/font/import
  origins. (Note: `dashboard.js`'s and `demo.js`'s pre-existing Google
  Fonts `<link>` tags predate this work and were not touched or removed —
  out of scope for a color-only pass, flagged here for visibility.)
- Rendered and screenshotted: login (desktop), dashboard (desktop +
  mobile + light theme), lead detail panel, Profiel, Resultaten (empty
  state), Kalender, Instellingen — via a throwaway Node/Playwright
  harness in the scratchpad (deleted after use, never committed).

## Deliberately left alone

- **Third-party brand colors** kept verbatim: WhatsApp `#25d366`,
  Instagram `#e1306c`, LinkedIn `#0a66c2`/`#0077b5` — used on the social
  channel badges and the Founder Hub's LinkedIn/Instagram content tabs.
  These represent real external platforms; recoloring them to sand would
  make them unrecognizable, not "on brand."
- **`.ap-phone-mock`** (the WhatsApp-preview mockup widget in Formulier)
  kept its authentic WhatsApp dark-green chrome (`#0a1a17`/`#1f2c2a`) —
  it's simulating the real external WhatsApp app UI for a live preview,
  not Helvaro's own product chrome, so staying visually accurate to
  WhatsApp itself is the right call.
- **Score-tier gradients** (`.score-segment.filled.high/.low`, revenue
  goal bar tiers) keep multi-token gradients (success→info, error→warning)
  where they represent genuine data gradation, not decoration.
- **Modal box-shadow** (`0 24px 80px rgba(0,0,0,0.5)`) — one neutral
  black elevation shadow kept on the true modal overlay, since "no
  shadows, use borders" reads best as a card-chrome rule; a floating
  modal benefits from one soft cast shadow for legibility over arbitrary
  page content. Every other decorative/glow shadow (~15 instances) was
  removed to `none`.
- Small "live" status-dot pulses (`.fdr-live-dot.online`,
  `.activity-dot-*`) kept their tiny (6–8px) glow — a functional
  "online/live" affordance, not a decorative lift shadow.
- 4 leftover `-webkit-background-clip: text` rules that already resolved
  to a *flat* `var(--accent)` (no longer an actual gradient) were
  simplified to plain `color:` for cleanliness, but this was optional —
  zero visual difference either way.

## Known visual debt not fixed (honest list)

- **Light theme** works and is now bug-free (was actively broken before
  this pass — see "Bugs found" above) but wasn't given the same design
  attention as dark. It's the "cheap door left open" per
  `DESIGN-SYSTEM.md`, not a polished second theme.
- **`.score-segment`** and a handful of other data-gradation gradients
  still use 2-token linear gradients (e.g. `success → info`). These are
  functional, not decorative, and were left as a judgment call rather
  than flattened — worth a second look if "no gradients, ever" turns out
  to be a harder rule than the brief implies.
- **Duplicate CSS selectors**: found at least 3 cases
  (`.stat-card:hover`, `.nav-item.active` in light, `.sidebar-logo`
  overrides) where the same selector is declared twice at different
  points in this 15k-line file, with the later one silently winning.
  Fixed the ones that produced visible bugs; did not do a full audit for
  more (the file is large enough that there are likely others that
  happen to not matter today).
- **Google Fonts `<link>` tags** in `dashboard.js` and `demo.js` predate
  this work and were not removed — technically in tension with "self-hosts
  vendor assets" but out of scope for a recolor.
- Branch `feature/vercel-growth` received concurrent unrelated commits
  from another session during this work (credit system, reminder
  pagination, a cross-feature bug fix) — none touched the 5 files in this
  recolor's scope, no conflicts, but flagging for transparency since the
  git history is interleaved.
