# Faro — mascot asset brief & generation prompts

What the code needs, and prompts to produce it. Paste one prompt per state into
whatever image tool you're using (Midjourney, Higgsfield, Sora, gpt-image, etc).

---

## What the code expects

Six files, at these exact paths:

```
public/faro/falcon-idle.webp        ← the one you already have
public/faro/falcon-thinking.webp
public/faro/falcon-generating.webp
public/faro/falcon-video.webp
public/faro/falcon-success.webp
public/faro/falcon-error.webp
```

Specs:
- **Square**, transparent background, exported as `.webp`
- **512×512 source** is plenty — it renders at 72px on desktop, 56px on mobile
- Keep the bird **identically framed and scaled across all six**. The client
  swaps the `src` in place, so any shift in size or position reads as a jump
  rather than a change of expression.
- Motion is CSS, not the asset. Don't add motion blur or trails.

Until all six exist Faro degrades cleanly: a missing state falls back
to idle, and a missing idle hides the mascot rather than showing a broken image.

No `vercel.json` change is needed — `public/` is already served at the root
(that is how `/fonts/…` and `/vendor/…` work today). Just drop the files in
`public/faro/`.

---

## Two notes before you generate

**1. The existing render is too cute and too big for its slot.** Requirement 11
says "do not make it childish"; the current proportions — large head, large
eyes, chibi body — read as a game mascot. Since it will display at 72px, the
face barely reads anyway, so the silhouette is doing the work. My
recommendation: shrink the eyes noticeably, lengthen the body, sharpen the beak
and brow. Prompts below are written for that correction. If you'd rather keep
the current character exactly, use the **Variant B** line instead and just add
the five missing states.

**2. Keep the palette.** Matte black `#121212` plumage, champagne gold `#D8C49A`
beak and chest emblem, warm sand `#F4E7C8` highlights. No blue, no purple, no
neon rim light.

---

## Base description — reuse verbatim in every prompt

> A stylized 3D-rendered falcon character, matte black plumage (#121212) with
> subtle warm grey feather detail, a champagne gold beak (#D8C49A), and a small
> champagne gold emblem on its chest. Sleek and refined, not cute — narrow
> alert eyes, defined brow, upright confident posture, slightly elongated body.
> Premium soft studio lighting from the upper left, gentle warm sand rim light,
> no harsh reflections. Luxury brand mascot aesthetic — think a high-end real
> estate brand, not a children's cartoon. Centered, full body, front-facing
> three-quarter view. Transparent background. Square composition. Clean, minimal,
> expensive-looking.

**Variant B** (keep the current character, only fix scale): replace the second
sentence with *"Rounded friendly proportions consistent with the existing
Faro falcon character, large expressive eyes, compact body."*

---

## The six states

Append one of these to the base description. Each should be a **small**
deviation — requirement 11 asks for extremely subtle differences, and six
wildly different poses will read as six different birds.

### 1. `falcon-idle`
> Expression: calm, friendly neutral. Wings folded, head level, looking directly
> forward. Completely at rest. This is the default resting state.

### 2. `falcon-thinking`
> Expression: attentive, considering. Head tilted very slightly to one side,
> eyes narrowed a fraction as if listening. A faint warm champagne glow around
> the head, very subtle. Otherwise identical pose to the resting state.

### 3. `falcon-generating`
> Expression: focused, engaged. One wing raised slightly toward a small
> translucent floating rectangular panel beside it, suggesting a property
> photograph being composed. The panel is a simple soft-edged champagne-tinted
> frame — abstract, not a literal photo. Subtle.

### 4. `falcon-video`
> Expression: focused, engaged. Same as the generating state, but the floating
> panel is a wider 16:9 frame with a small champagne gold play triangle centered
> in it. Everything else identical.

### 5. `falcon-success`
> Expression: quietly confident, a hint of satisfaction. Chest slightly
> forward, head raised a fraction, eyes calm. Understated pride — not a grin,
> not a celebration, no sparkles or confetti.

### 6. `falcon-error`
> Expression: mildly concerned, attentive. Head dipped very slightly, brow
> softened, eyes lowered a fraction. Apologetic but composed — not sad, not
> distressed, no tears, no exaggerated frown.

---

## After generating

1. Remove backgrounds if the tool didn't (transparency is required — the page
   background differs between light and dark theme).
2. Confirm all six align: stack them and check the bird doesn't shift or resize.
3. Save to `public/faro/` with the exact filenames above.
5. `node scripts/faro-dev.js`, open Faro (Ctrl/⌘-J), send a message — you
   should see idle → thinking → success as the turn runs.

---

## The other four things I need from you

Not blocking, but each shapes real work:

1. **`Beheren` on the Faro context row** — informational panel, or actual per-source
   on/off toggles? If toggles, disabling Analytics must make the orchestrator
   *withhold `get_analytics` from the model*, not just hide a chip. Currently
   built read-only.
2. **The TEXT card in `Recent gemaakt`** — is listing copy a stored,
   re-openable artifact? If so `api/_faro/store.js` needs an artifacts table I haven't
   scaffolded.
3. **The three `View all` links** (actions, conversations, activity) — do those
   pages exist in the design, or should I build them as filtered inline views?
   Currently they render but go nowhere.
4. **Real estate only?** `DESIGN-SYSTEM.md` describes Belgian clinic owners and
   receptionists; `_images.js` targets Flemish estate agents. If both verticals
   are live, Faro's whole vocabulary points at one of them.
