// Language registry — single source of truth shared with api/whatsapp.js,
// api/leads.js, api/cron-followup.js, api/admin.js. Injected below as a
// plain JSON array into the client-side script (AP_LANGUAGES) so the
// dashboard's language picker always matches exactly what the AI
// conversation actually supports — no separately hand-maintained list here.
const _lang = require('./_lang');

// ── Helvaro AI workspace ────────────────────────────────────────────────────
// The AI workspace's CSS, markup and client script live in api/_ai/ui/* rather
// than inline below. This file is a single ~19,000-line template literal where
// every backtick and ${...} must be escaped (see the note at the inline-script
// boundary further down); several thousand more lines of AI CSS and JS in here
// would be hostile to edit and hazardous to review. Those modules return plain
// strings and splice in at five points, marked "AI WORKSPACE" below.
//
// ai.* is bound to ONE language per request, resolved from the user's setting
// through the same registry the WhatsApp AI uses — no client-side translation
// step and no flash of untranslated content.
const _aiUI = require('./_ai/ui');

module.exports = async function handler(req, res) {
  // Native/English names only — never leak internal registry fields
  // (formality, directive builders, etc) into client-side HTML/JS.
  // Escape '<' so a (hypothetical, never expected) native name containing
  // "</script>" can't break out of the inline <script> block below — same
  // defensive intent as api/form-page.js's escJs() neutralizing </script>.
  const AP_LANGUAGES_JSON = JSON.stringify(_lang.listForPicker()).replace(/</g, '\\u003c');

  // Dashboard UI language. DASHBOARD_LANG lets an operator force one; otherwise
  // the registry default applies until a per-user preference exists to read.
  const AI_LANG = _lang.normalizeLanguageCode(process.env.DASHBOARD_LANG || _lang.DEFAULT_CODE);
  const ai = _aiUI.forLang(AI_LANG);

  // Support contact for the help widget. The WhatsApp route is opt-in: no
  // personal number is ever hardcoded here, so the button simply doesn't
  // render unless SUPPORT_WA is configured. Digits only (wa.me format,
  // e.g. 32XXXXXXXXX) — anything else is dropped rather than rendered as
  // a broken link.
  const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || 'hello@helvaro.pro').trim();
  const SUPPORT_WA    = String(process.env.SUPPORT_WA || '').replace(/[^0-9]/g, '');
  const SUPPORT_EMAIL_ATTR = SUPPORT_EMAIL.replace(/[<>"'&]/g, '');

  // ── Clerk (optional) ──────────────────────────────────────────────────────
  // Only rendered when CLERK_ENABLED=1 and a publishable key is present, so the
  // page is byte-identical to before until the switch is thrown.
  //
  // The publishable key is public by design and safe to inline; it also encodes
  // the Frontend API host as base64 of "host$", which is where clerk.browser.js
  // is served from. Deriving it beats asking for a second env var that could
  // drift out of sync with the key.
  // Accept both names. Clerk's own quick-start hands out the Next.js variable
  // (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY), so that is what ends up pasted into
  // Vercel even on a project that is not Next.js — and then nothing works, with
  // no error to explain why. Reading either spelling costs nothing and removes
  // a failure mode that is invisible from the outside.
  const CLERK_PK_RAW = process.env.CLERK_PUBLISHABLE_KEY
                    || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
                    || '';
  const CLERK_ON = process.env.CLERK_ENABLED === '1' && !!CLERK_PK_RAW;
  const CLERK_PK = CLERK_ON ? String(CLERK_PK_RAW).replace(/[<>"'&]/g, '') : '';
  let CLERK_HOST = '';
  if (CLERK_ON) {
    try {
      CLERK_HOST = Buffer.from(CLERK_PK.replace(/^pk_(test|live)_/, ''), 'base64')
        .toString('utf8').replace(/\$+$/, '').replace(/[^a-zA-Z0-9.-]/g, '');
    } catch { CLERK_HOST = ''; }
  }
  const CLERK_READY = CLERK_ON && !!CLERK_HOST;
  const HTML = `<!DOCTYPE html>
<html lang="nl" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Helvaro. AI Lead Kwalificatie</title>
<link rel="icon" href="/favicon.png" type="image/png">
<script src="/vendor/chart.umd.min.js"></script>
<style>
/* ============================================================
   SELF-HOSTED FONTS (GDPR — no requests to Google's CDN)
   Inter only. Orbitron was removed 2026-08 — its zero glyph (a squared
   shape with a diagonal slash) rendered as a broken-looking box at
   dashboard sizes, most visibly in "€0" / "0%" / "0 leads" empty states.
   On a dashboard where the numbers ARE the product, that read as the app
   being broken. Inter's numerals are excellent and already loaded, so
   every former Orbitron use now sets font-variant-numeric: tabular-nums
   instead — same "confident data" register, correct zero, columns that
   don't jitter as figures update.
   ============================================================ */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('/fonts/inter-var.woff2') format('woff2');
}
@font-face {
  /* Space Grotesk, self-hosted for the same GDPR reason as Inter. This is the
     brand's heading face — the marketing site loads it from Google, which is
     the leak we already closed here. Variable, so 500/600/700 all come from
     one 22 KB file. */
  font-family: 'Space Grotesk';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('/fonts/space-grotesk-var.woff2') format('woff2');
}
/* ============================================================
   CSS CUSTOM PROPERTIES
   ============================================================ */
:root {
  /* ── Sand Black — the brand, restored ──────────────────────────────────
     An earlier pass moved the accent off #E8D7B1 to a brighter gold and
     recoloured the neutrals cool-blue. The diagnosis behind that was right
     (the surfaces read flat and the warm wash over grey went muddy) but the
     remedy overwrote the brand. These are the real values, from the brand
     guide and from helvaro.pro's own tokens. The flatness is fixed the way
     the marketing site fixes it — with a genuine soft shadow and honest
     borders — not by changing the colours.

     THE CONTRAST RULE, which is the whole reason there are two accent
     tokens: sand is a FILL, never type. #E8D7B1 as text on white is about
     1.7:1, invisible. So --accent-c fills (always with dark text on it) and
     --accent-ink is what you set type in. */
  --bg:            #121212;
  --bg-alt:        #0D0D0D;
  --card:          #232323;
  --card-elevated: #2A2A2A;
  --border-c:      #262626;
  --border-strong: #333333;
  --divider:       #262626;
  --hover-c:       #1C1C1C;

  --accent-c:        #E8D7B1;   /* sand — fills, buttons, icons */
  --accent-hover-c:  #DDCAA1;
  --accent-pressed-c:#C9AE7C;
  --accent-deep:     #C9AE7C;   /* second stop in gradients */
  --accent-ink:      #F0E4C8;   /* accent AS TEXT, on dark only */
  --on-accent:       #121212;   /* always dark type on sand */

  --text-c:        #F9F9F9;
  --text-muted-c:  #B5B5B5;
  --text-disabled: #999999;
  --text-inverse:  #121212;

  --success-c: #22C55E;
  --warning-c: #D4A017;
  --error-c:   #DC2626;
  --info-c:    #B5B5B5;   /* no blue: the brand rules out blue accents */

  --bubble-incoming: #1F1F1F;

  --accent-rgb:  232,215,177;
  --success-rgb: 34,197,94;
  --warning-rgb: 212,160,23;
  --error-rgb:   220,38,38;
  --info-rgb:    181,181,181;
  --text-rgb:    249,249,249;
  --on-accent-rgb: 18,18,18;

  /* Twee families, zoals de huisstijl voorschrijft: Space Grotesk voor koppen,
     Inter voor alles wat je leest. Space Grotesk valt terug op Inter, dus als
     het woff2-bestand ontbreekt wordt de pagina niet lelijk — alleen minder
     eigen. */
  --font-head: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* 8 / 14 / 22, per the brand's shape language */
  --radius-sm:   8px;
  --radius-btn:  14px;
  --radius-card: 22px;

  /* One easing for everything, the brand's own curve. Slow and subtle. */
  --ease-out:    cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast:    140ms;
  --dur-base:    220ms;
  --dur-enter:   320ms;
  --transition-fast: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition:      all 220ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Soft and deep, never a hard drop. This is what makes a #232323 card read
     as raised on a #121212 page without changing either colour. */
  --elev-0: none;
  --elev-1: 0 2px 8px rgba(0,0,0,.30), 0 8px 24px rgba(0,0,0,.24);
  --elev-2: 0 4px 12px rgba(0,0,0,.34), 0 16px 40px rgba(0,0,0,.30);
  --elev-3: 0 8px 20px rgba(0,0,0,.40), 0 32px 72px rgba(0,0,0,.38);
  --shadow:      0 2px 8px rgba(0,0,0,.30), 0 12px 34px rgba(0,0,0,.26);
  --shadow-card: 0 2px 8px rgba(0,0,0,.26), 0 10px 34px rgba(0,0,0,.22);
  --shadow-glow: none;

  /* 1px specular lip. On near-black surfaces a drop shadow alone barely
     registers; this is what sells a card as a physical plane. */
  --edge-hi: inset 0 1px 0 rgba(255,255,255,0.04);

  --glass-fill:  rgba(18,18,18,0.78);
  --glass-edge:  rgba(255,255,255,0.06);
  --glass-blur:  saturate(140%) blur(18px);

  /* ── One accent, not a rainbow ──────────────────────────────────────────
     There used to be seven per-card hues here (emerald, blue, purple,
     orange, coral, cyan, gold). The brand rules out purple, indigo and blue
     outright, and a dashboard for someone who handles other people's money
     should not look like a colour wheel. Cards are now differentiated by
     sand at varying strength, with real colour reserved for STATUS: green
     when something succeeded, amber when it needs attention, red when it
     failed. That is information, not decoration. */
  --c-sand:    #E8D7B1;  --c-sand-soft:    rgba(232,215,177,0.10);
  --c-deep:    #C9AE7C;  --c-deep-soft:    rgba(201,174,124,0.10);
  --c-emerald: #22C55E;  --c-emerald-soft: rgba(34,197,94,0.12);
  --c-amber:   #D4A017;  --c-amber-soft:   rgba(212,160,23,0.12);
  --c-coral:   #DC2626;  --c-coral-soft:   rgba(220,38,38,0.12);
  /* Legacy aliases so the ~40 existing var(--c-blue) style references keep
     resolving; they now all land on sand instead of off-brand hues. */
  --c-blue:    var(--c-sand);   --c-blue-soft:   var(--c-sand-soft);
  --c-purple:  var(--c-deep);   --c-purple-soft: var(--c-deep-soft);
  --c-cyan:    var(--c-sand);   --c-cyan-soft:   var(--c-sand-soft);
  --c-orange:  var(--c-amber);  --c-orange-soft: var(--c-amber-soft);
  --c-gold:    var(--c-sand);   --c-gold-soft:   var(--c-sand-soft);

  --grad-gold:    linear-gradient(135deg, #E8D7B1, #C9AE7C);
  --grad-ai:      linear-gradient(135deg, #E8D7B1, #C9AE7C);
  --grad-data:    linear-gradient(135deg, #C9AE7C, #E8D7B1);
  --grad-success: linear-gradient(135deg, #22C55E, #16A34A);

  /* ---- legacy token names (kept so every existing var(--x) in this
     18k-line file resolves without a line-by-line rewrite) ---- */
  --bg-primary:    var(--bg);
  --bg-card:       var(--card);
  --bg-card-alt:   var(--bg-alt);
  --bg-card-hover: var(--hover-c);
  --blue-primary:  var(--accent-c);
  --blue-bright:   var(--accent-hover-c);
  --cyan:          var(--accent-c);
  --green:         var(--success-c);
  --red:           var(--error-c);
  --orange:        var(--warning-c);
  --accent:        var(--accent-c);
  --accent-bright: var(--accent-hover-c);

  /* Deze zes ontbraken in dit blok, terwijl er 42 keer naar verwezen wordt.
     Een var() zonder fallback naar iets ongedefinieerds maakt de hele
     declaratie ongeldig, dus die 42 regels deden niets en de eigenschap erfde
     van de ouder — zichtbaar op het inlogscherm, waar de foutmelding daardoor
     bijna-wit op lichtroze stond. Aliassen, geen nieuwe kleuren, zodat ze het
     thema volgen net als de rest hierboven. */
  --error:          var(--error-c);
  --warning:        var(--warning-c);
  --success:        var(--success-c);
  --info:           var(--info-c);
  --accent-hover:   var(--accent-hover-c);
  --accent-pressed: var(--accent-deep);
  --text:          var(--text-c);
  --text-primary:  var(--text-c);
  --text-secondary:var(--text-muted-c);
  --text-muted:    var(--text-muted-c);
  --border:        var(--border-c);
  --border-bright: var(--border-strong);
  --scrollbar-bg:  var(--bg);
  --scrollbar-thumb: var(--border-strong);
  --radius:        var(--radius-btn);
  --radius-s:      var(--radius-sm);
}

[data-theme="light"] {
  /* Taken straight from helvaro.pro's own custom properties, so the app and
     the marketing site are the same product rather than two designs that
     happen to share a logo. */
  --bg:            #FFFFFF;
  --bg-alt:        #F7F7F7;
  --card:          #FFFFFF;
  --card-elevated: #FFFFFF;
  --border-c:      #E5E7EB;
  --border-strong: #D1D5DB;
  --divider:       #E5E7EB;
  --hover-c:       #FAFAF8;

  --accent-c:        #E8D7B1;   /* sand still fills, even on white */
  --accent-hover-c:  #DDCAA1;
  --accent-pressed-c:#D3BE93;
  --accent-deep:     #D3BE93;
  /* Sand as type on white is ~1.7:1. This deeper bronze is the brand's
     answer, and it is the ONLY accent allowed to carry text here. */
  --accent-ink:      #8A6A33;
  --on-accent:       #121212;

  --text-c:        #111827;
  --text-muted-c:  #4B5563;
  --text-disabled: #6B7280;
  --text-inverse:  #FFFFFF;

  --success-c: #16A34A;
  --warning-c: #B45309;
  --error-c:   #DC2626;
  --info-c:    #6B7280;

  --bubble-incoming: #F3F4F6;

  --accent-rgb:  232,215,177;
  --success-rgb: 22,163,74;
  --warning-rgb: 180,83,9;
  --error-rgb:   220,38,38;
  --info-rgb:    107,114,128;
  --text-rgb:    17,24,39;
  --on-accent-rgb: 18,18,18;

  /* Same single accent on white. The bronze is what shows up as an icon or a
     hairline; the sand is what fills a button under dark text. */
  --c-sand:    #8A6A33;  --c-sand-soft:    rgba(232,215,177,0.30);
  --c-deep:    #6F5427;  --c-deep-soft:    rgba(201,174,124,0.26);
  --c-emerald: #16A34A;  --c-emerald-soft: rgba(22,163,74,0.10);
  --c-amber:   #B45309;  --c-amber-soft:   rgba(180,83,9,0.10);
  --c-coral:   #DC2626;  --c-coral-soft:   rgba(220,38,38,0.10);

  --grad-gold:    linear-gradient(135deg, #E8D7B1, #D3BE93);
  --grad-ai:      linear-gradient(135deg, #E8D7B1, #D3BE93);
  --grad-data:    linear-gradient(135deg, #D3BE93, #E8D7B1);
  --grad-success: linear-gradient(135deg, #16A34A, #4D7C0F);

  --bg-primary:    var(--bg);
  --bg-card:       var(--card);
  --bg-card-alt:   var(--bg-alt);
  --bg-card-hover: var(--hover-c);
  --accent:        var(--accent-c);
  --accent-bright: var(--accent-hover-c);
  --text:          var(--text-c);
  --text-primary:  var(--text-c);
  --text-secondary:var(--text-muted-c);
  --text-muted:    var(--text-muted-c);
  --border:        var(--border-c);
  --border-bright: var(--border-strong);
  --scrollbar-bg:  var(--bg);
  --scrollbar-thumb: var(--border-strong);

  /* The site's own card shadow, verbatim. */
  --shadow:        0 10px 34px rgba(17,24,39,0.08);
  --shadow-card:   0 10px 34px rgba(17,24,39,0.08);
  --shadow-glow:   none;
  --elev-1: 0 4px 14px rgba(17,24,39,.06);
  --elev-2: 0 10px 34px rgba(17,24,39,.08);
  --elev-3: 0 24px 64px rgba(17,24,39,.12);
  /* A white highlight on a white card is nothing. */
  --edge-hi: none;

  --glass-fill:  rgba(255,255,255,0.80);
  --glass-edge:  rgba(255,255,255,0.90);
  --glass-blur:  saturate(160%) blur(18px);
}

/* ============================================================
   RESET & BASE
   ============================================================ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html { font-size: 15px; }

body {
  font-family: 'Inter', sans-serif;
  /* Very wide, very low-opacity pools instead of one flat fill. Glass has
     nothing to refract over a single solid colour — it just looks like a
     lighter rectangle. These give the blurred layers something to pick
     up, and stop large empty regions reading as dead space. Fixed
     attachment so the field stays put while content scrolls over it,
     which is what sells the layers as separate planes.

     Both pools used to be warm sand over a neutral grey page, which is
     exactly what turned the whole app muddy brown. Now one warm gold
     pool and one cool blue one, opposite corners: the warm side keeps
     the brand present, the cool side stops the page collapsing into a
     single temperature. */
  background:
    radial-gradient(1200px 800px at 10% -12%, rgba(232,215,177,0.10), transparent 62%),
    radial-gradient(1000px 760px at 100% 4%, rgba(79,124,255,0.08), transparent 58%),
    var(--bg-primary);
  background-attachment: fixed;
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
  transition: background 0.3s ease, color 0.3s ease;
}

/* Subtle dot grid. Barely visible, neutral — no colour wash */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, rgba(233,238,246,0.045) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

/* Ambient wash. One quiet gold bloom at the top, never a flood */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 40% at 50% -5%, rgba(232,215,177,0.05) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
}

/* The two pools on the body element are tuned for a near-black ground.
   Over a light
   page the same alphas turn the top of the screen into a dirty smear, so
   light gets its own, much quieter field: a hint of gold top-left, a hint
   of cool top-right, and otherwise clean paper. */
[data-theme="light"] body {
  background:
    radial-gradient(1100px 720px at 8% -14%, rgba(201,163,78,0.10), transparent 60%),
    radial-gradient(900px 680px at 100% 2%, rgba(79,124,255,0.06), transparent 56%),
    var(--bg-primary);
}

[data-theme="light"] body::before {
  background-image: radial-gradient(circle, rgba(27,34,45,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.6;
}

[data-theme="light"] body::after {
  display: block;
  background:
    radial-gradient(ellipse 70% 40% at 50% -10%, rgba(201,163,78,0.06) 0%, transparent 60%);
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--scrollbar-bg); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-disabled); }

/* ============================================================
   TYPOGRAPHY
   ============================================================ */
/* Koppen in Space Grotesk, 600-700, -0.02em — dat is wat de huisstijl zegt en
   wat helvaro.pro doet. Een eerdere ronde hier draaide alles op één familie
   (Inter op 800) omdat de vorige tweede letter Orbitron was, en die paste
   nergens bij. Dat argument gold Orbitron, niet het idee van een tweede
   letter: Space Grotesk is juist de kop-letter van het merk, dus de app en de
   site lezen nu als hetzelfde product. 800 gaat naar 700 omdat Space Grotesk
   niet zwaarder gaat en op 700 al steviger oogt dan Inter op 800. */
h1, h2, h3, .display-heading, .page-title, .stat-value, .card-title {
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
}

/* Was a gradient-clip effect (indigo → cyan). A single accent colour reads
   calmer and is the "important number / highlight" use case sand is for. */
.gradient-text {
  background: none;
  -webkit-text-fill-color: currentColor;
  background-clip: initial;
  color: var(--accent);
}

[data-theme="light"] .gradient-text {
  -webkit-text-fill-color: var(--accent);
  background: none;
  color: var(--accent);
}

/* ============================================================
   LAYOUT
   ============================================================ */
#app { position: relative; z-index: 1; }

.app-layout {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  margin-left: 220px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s ease;
}

.page-content {
  flex: 1;
  padding: 24px 28px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* ============================================================
   LOGIN PAGE. FULL VIEWPORT SPLIT
   ============================================================ */
#login-page {
  --login-panel:      #FFFFFF;
  --login-input-bg:   #F7F6F2;
  --login-border:     #E4E0D6;
  --login-text:       #18160F;
  --login-muted:      #6B6558;
  --login-placeholder:#A39C8C;
  position: fixed;
  inset: 0;
  display: flex;
  z-index: 1000;
  padding: 0;
  background: var(--bg);
}

#login-page::before { display: none; }
#login-page::after  { display: none; }

/* Full-screen two-panel split. No card, no border-radius */
.login-split {
  display: flex;
  width: 100%;
  height: 100vh;
  border-radius: 0;
  box-shadow: none;
  max-width: none;
}

/* ── LEFT: form panel (42%) ── */
.login-form-side {
  flex: 0 0 42%;
  background: var(--login-panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 72px;
  position: relative;
  overflow-y: auto;
}

/* Subtle vertical line separator */
.login-form-side::after {
  content: '';
  position: absolute;
  right: 0;
  top: 10%;
  bottom: 10%;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--login-border) 30%, var(--login-border) 70%, transparent);
}

/* Form content constrained for readability */
.login-form-inner {
  width: 100%;
  max-width: 380px;
}

/* Logo top-left of panel */
.login-logo-top {
  display: flex;
  align-items: center;
  gap: 0;
  margin-bottom: 48px;
}

.login-logo-top img {
  height: 88px;
  width: auto;
  object-fit: contain;
  display: block;
}

.login-logo-top .brand-name { display: none; }

.login-welcome {
  font-size: 34px;
  /* Zette Inter hier hard, dus de kop-regel bovenaan kwam er niet doorheen en
     juist het eerste dat een klant ziet stond niet in de huisstijlletter. */
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--login-text);
  margin-bottom: 8px;
  line-height: 1.15;
}

.login-subtitle {
  color: var(--login-muted);
  font-size: 15px;
  margin-bottom: 40px;
  line-height: 1.5;
}

.login-divider { display: none; }
.login-logo { display: none; }
.login-title { display: none; }
.login-icon { display: none; }

/* ── RIGHT: brand panel (58%). Calm dark surface, sand accents only ── */
.login-brand-side {
  flex: 1;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 72px;
  position: relative;
  overflow: hidden;
  gap: 0;
}

/* Fine, neutral dot grid. No colour wash */
.login-brand-side::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(249,249,249,0.06) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* One restrained sand bloom. Not an "AI glow" — a single, quiet highlight */
.login-brand-side::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 55% 40% at 70% 10%, rgba(232,215,177,0.07) 0%, transparent 60%);
  pointer-events: none;
}

/* Large floating mock card */
.brand-card-mock {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 32px;
  box-shadow: none;
}

.brand-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.brand-card-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border);
}

.brand-card-dot:first-child  { background: var(--accent); }
.brand-card-dot:nth-child(2) { background: var(--text-disabled); }

.brand-card-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

/* Stat row */
.brand-stats {
  display: flex;
  gap: 14px;
  margin-bottom: 28px;
}

.brand-stat {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  transition: border-color 0.3s;
}

.brand-stat-num {
  font-variant-numeric: tabular-nums;
  font-size: 26px;
  font-weight: 800;
  color: var(--accent);
  line-height: 1;
  margin-bottom: 4px;
}

.brand-stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
}

/* Bar chart */
.brand-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 72px;
}

.brand-bar {
  flex: 1;
  border-radius: 6px 6px 0 0;
  background: var(--border);
  transition: background 0.3s;
}

.brand-bar.active {
  background: var(--accent);
}

.brand-bar:nth-child(2) { background: var(--divider); }
.brand-bar:nth-child(6) { background: var(--accent-hover); }
.brand-bar:nth-child(8) { background: var(--divider); }

/* Brand tagline */
.brand-tagline {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 0 20px;
}

.brand-tagline h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 10px;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.3px;
}

.brand-tagline p {
  font-size: 15px;
  color: var(--text-muted);
  line-height: 1.6;
}

/* ── Slides wrapper ── */
.brand-slides-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-slide {
  position: absolute;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.55s cubic-bezier(0.4,0,0.2,1), transform 0.55s cubic-bezier(0.4,0,0.2,1);
  pointer-events: none;
}

.brand-slide.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  position: relative;
}

/* ── Score ring (slide 2) ── */
.brand-score-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 4px;
}

.brand-score-ring {
  position: relative;
  flex-shrink: 0;
}

.brand-score-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  font-weight: 800;
  color: var(--text);
}

.brand-score-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand-score-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand-score-item span {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.brand-score-bar-wrap {
  height: 5px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.brand-score-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
}

/* ── Agenda (slide 3) ── */
.brand-agenda {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.brand-agenda-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
}

.brand-agenda-time {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  min-width: 38px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.brand-agenda-content { flex: 1; }

.brand-agenda-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.brand-agenda-tag {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.brand-agenda-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.brand-agenda-dot.hot  { background: var(--error); }
.brand-agenda-dot.warm { background: var(--warning); }

/* ── Pagination dots ── */
.brand-dots {
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: 20px;
  position: relative;
  z-index: 1;
}

.brand-dot {
  width: 20px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  border: none;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
}
button.brand-dot { border: none; padding: 0; }

.brand-dot.active {
  background: var(--accent);
  width: 36px;
}

/* Login footer */
.login-footer {
  margin-top: auto;
  padding-top: 24px;
  color: var(--text-muted);
  font-size: 11.5px;
  letter-spacing: 0.3px;
}

.login-footer span {
  color: var(--accent);
  font-weight: 600;
}

/* Responsive: stack on mobile */
@media (max-width: 860px) {
  .login-split { flex-direction: column; height: auto; }
  .login-form-side { flex: none; padding: 52px 40px; align-items: center; }
  .login-form-inner { max-width: 420px; }
  .login-brand-side { flex: none; min-height: 300px; padding: 48px 40px; }
  .brand-card-mock { max-width: 380px; }
}

/* Light mode adjustments — the split login already reads as a light-form
   panel; keep it consistent so toggling app theme never breaks it */
[data-theme="light"] .login-form-side {
  background: var(--login-panel);
}

[data-theme="light"] #login-page {
  background: var(--bg);
}

.form-group {
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--login-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 15px 18px;
  background: var(--login-input-bg);
  border: 1.5px solid var(--login-border);
  border-radius: 12px;
  color: var(--login-text);
  font-size: 15px;
  font-family: 'Inter', sans-serif;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  min-height: 52px;
  touch-action: manipulation;
}

.form-input:hover {
  border-color: var(--accent-hover);
  background: #fff;
}

.form-input:focus {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(232,215,177,0.25);
}

.form-input:focus-visible {
  outline: none;
}

.form-input::placeholder { color: var(--login-placeholder); }

/* Error state for inputs */
.form-input.error {
  border-color: var(--error);
  background: rgba(220,38,38,0.03);
}
.form-input.error:focus {
  box-shadow: 0 0 0 4px rgba(220,38,38,0.12);
}

/* Login footer */
.login-footer {
  text-align: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--login-border);
  color: var(--login-muted);
  font-size: 11.5px;
  letter-spacing: 0.3px;
}

.login-footer span {
  color: var(--accent-pressed);
  font-weight: 600;
}

.btn-login {
  width: 100%;
  padding: 17px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-btn);
  color: var(--on-accent);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: pointer;
  margin-top: 16px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: none;
  min-height: 56px;
  touch-action: manipulation;
}

.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-hover);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.btn-login::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(18,18,18,0.12);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.5s ease, height 0.5s ease;
}

.btn-login:hover::before { opacity: 1; }
.btn-login:hover {
  transform: translateY(-1px);
  box-shadow: var(--elev-1);
}
.btn-login:active {
  transform: translateY(0) scale(0.98);
  background: var(--accent-pressed);
  box-shadow: none;
  transition-duration: var(--dur-fast);
}
.btn-login:active::after {
  width: 200px;
  height: 200px;
}
.btn-login:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(232,215,177,0.35);
}
.btn-login span { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; }

/* Loading state for login button */
.btn-login.loading {
  pointer-events: none;
  opacity: 0.85;
}
.btn-login.loading span { opacity: 0; }
.btn-login.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid rgba(18,18,18,0.25);
  border-top-color: var(--on-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.login-error {
  display: none;
  margin-top: 16px;
  padding: 12px 16px;
  background: rgba(220,38,38,0.06);
  border: 1px solid rgba(220,38,38,0.2);
  border-radius: 10px;
  /* Stond op var(--error), en --error bestaat nergens in dit bestand. Een
     var() zonder fallback naar een ongedefinieerde custom property maakt de
     declaratie ongeldig, dus erfde de tekst de kleur van de ouder: #F9F9F9 op
     een lichtroze vlak. De enige foutmelding die de gebruiker op het
     inlogscherm te zien krijgt, was dus onleesbaar. Vaste waarde, want dit
     paneel is altijd licht (zie --login-text) en volgt het thema niet. */
  color: #B42318;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  animation: shakeError 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.login-error.visible { display: flex; align-items: center; justify-content: center; gap: 8px; }

/* Clerk renders its own "Don't have an account? Sign up" footer, which is
   still English and navigates away to a Clerk-hosted page. Setting
   appearance.elements.footerAction did not take, so this targets Clerk's own
   stable cl- classes instead of guessing at appearance keys. Our own in-page
   switch sits directly below and does the same job in Dutch. */
#clerk-signin .cl-footerAction,
#clerk-signin .cl-footerAction__signIn,
#clerk-signin .cl-footerAction__signUp { display: none !important; }

/* Sign-in / sign-up switch under the Clerk component */
#clerk-toggle {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: #6b7280;
}
.clerk-toggle-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: #8A6714;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.clerk-toggle-link:hover { color: #6d520f; }
.clerk-toggle-link:focus-visible { outline: 2px solid #C9A34E; outline-offset: 2px; border-radius: 3px; }

.login-error::before {
  content: '';
  width: 18px;
  height: 18px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DC2626' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='8' x2='12' y2='12'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16'/%3E%3C/svg%3E");
  background-size: contain;
  flex-shrink: 0;
}

@keyframes shakeError {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton, .skeleton::after { animation: none; }
  .login-error { animation: none; }
  .btn-login.loading::after { animation: spin 1.5s linear infinite; }
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* ============================================================
   CALENDAR (WEEK VIEW)
   ============================================================ */
.cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.cal-today-btn {
  padding: 7px 16px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.2s;
}
.cal-today-btn:hover { border-color: rgba(var(--accent-rgb),0.5); color: var(--accent-bright); }
.cal-nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}
.cal-nav-btn:hover { border-color: rgba(var(--accent-rgb),0.5); color: var(--accent-bright); }
.cal-range-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-left: 4px;
  font-family: 'Inter', sans-serif;
}
.cal-book-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--accent);
  border-radius: 10px;
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.cal-book-btn:hover { transform: translateY(-1px); box-shadow: none; }

/* Day header row */
.cal-day-headers {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.cal-gutter { width: 54px; flex-shrink: 0; }
.cal-day-cols-header {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}
.cal-day-header-cell {
  padding: 10px 8px;
  text-align: center;
  border-left: 1px solid var(--border);
}
.cal-day-header-cell .cal-day-name {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.cal-day-header-cell .cal-day-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin: 0 auto;
}
.cal-day-header-cell.cal-today .cal-day-num {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: none;
}
.cal-day-header-cell.cal-today .cal-day-name { color: var(--accent-bright); }

/* Scrollable grid */
.cal-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.cal-scroll-area::-webkit-scrollbar { width: 6px; }
.cal-scroll-area::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.3); border-radius: 3px; }
.cal-time-grid {
  display: flex;
  min-height: 880px;
}
.cal-time-labels {
  width: 58px;
  flex-shrink: 0;
  position: relative;
}
.cal-time-label {
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-right: 10px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  padding-top: 4px;
  box-sizing: border-box;
  position: relative;
}
.cal-time-label-half {
  position: absolute;
  top: 40px;
  right: 10px;
  font-size: 9px;
  color: var(--text-muted);
  opacity: 0.5;
  font-weight: 500;
}
.cal-day-cols {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  position: relative;
}
.cal-day-col {
  border-left: 1px solid var(--border);
  position: relative;
}
.cal-hour-row {
  height: 80px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  box-sizing: border-box;
  position: relative;
}
.cal-hour-row::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  top: 40px;
  border-bottom: 1px dashed rgba(255,255,255,0.035);
  pointer-events: none;
}
[data-theme="light"] .cal-hour-row::after {
  border-bottom-color: rgba(0,0,0,0.06);
}
.cal-day-col.cal-today-col { background: rgba(var(--accent-rgb),0.03); }

/* Now line */
.cal-now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--error);
  z-index: 10;
  pointer-events: none;
}
.cal-now-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -4px;
  width: 10px;
  height: 10px;
  background: var(--error);
  border-radius: 50%;
}

/* Event blocks */
.cal-event {
  position: absolute;
  left: 3px;
  right: 3px;
  border-radius: 9px;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--on-accent);
  cursor: pointer;
  overflow: hidden;
  z-index: 5;
  transition: filter 0.15s, transform 0.12s, box-shadow 0.15s;
  min-height: 28px;
  line-height: 1.3;
  box-shadow: 0 2px 10px rgba(0,0,0,0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 3px solid rgba(255,255,255,0.35);
}
/* Read-only entries mirrored from the client's own Google Calendar. They
   occupy the slot so nothing gets double-booked, but they are deliberately
   quiet and not clickable — Helvaro doesn't own them and can't edit them. */
.cal-event-external {
  background: repeating-linear-gradient(
    135deg,
    var(--bg-card-alt) 0 6px,
    var(--hover-c) 6px 12px
  );
  color: var(--text-muted-c);
  border-left: 3px solid var(--text-disabled);
  box-shadow: none;
  cursor: default;
  font-weight: 500;
  z-index: 4;
}
.cal-event-external:hover {
  filter: none;
  transform: none;
  box-shadow: none;
  z-index: 4;
}

.cal-event:hover {
  filter: brightness(1.1);
  transform: translateX(-1px) scale(1.018);
  box-shadow: 0 6px 20px rgba(0,0,0,0.38);
  z-index: 10;
}
.cal-event .cal-event-time {
  font-size: 10px;
  font-weight: 800;
  opacity: 1;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.cal-event .cal-event-name {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-event .cal-event-type {
  font-size: 9px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-event .cal-event-dur {
  font-size: 9px;
  font-weight: 600;
  opacity: 0.75;
  white-space: nowrap;
  margin-top: auto;
  padding-top: 2px;
}

/* ============================================================
   PROFILE PAGE
   ============================================================ */
.profile-wrap { width: 100%; display: flex; flex-direction: column; gap: 20px; }

.profile-hero {
  display: flex;
  align-items: center;
  gap: 24px;
  background: rgba(var(--accent-rgb),0.07);
  border: 1px solid rgba(var(--accent-rgb),0.25);
  border-radius: 20px;
  padding: 28px 32px;
}
.profile-avatar-lg {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: var(--on-accent);
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  box-shadow: none;
}
.profile-name-lg {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-family: 'Inter', sans-serif;
}
.profile-email-lg { font-size: 14px; color: var(--text-muted); margin-bottom: 10px; }
.profile-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(var(--accent-rgb),0.15);
  border: 1px solid rgba(var(--accent-rgb),0.3);
  color: var(--accent-bright);
}

.profile-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.profile-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px 20px;
  text-align: center;
}
.profile-stat-card .psv {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 6px;
}
.profile-stat-card .psl {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.profile-cards {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
}
.profile-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px 24px;
}
.profile-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.profile-row:last-child { border-bottom: none; }
.profile-row strong { color: var(--text-primary); font-weight: 600; }

    .profile-section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
      margin-top: 4px;
    }
    .profile-recent-leads {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }
    .profile-recent-lead-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .profile-recent-lead-row:hover { border-color: var(--accent); }
    .profile-recent-lead-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: var(--on-accent); flex-shrink: 0;
    }
    .profile-recent-lead-name { font-size: 14px; font-weight: 600; color: var(--text); flex: 1; }
    .profile-recent-lead-meta { font-size: 12px; color: var(--text-muted); }
    .profile-recent-lead-score {
      font-size: 13px; font-weight: 700; color: var(--accent);
      font-variant-numeric: tabular-nums;
    }
    .profile-quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 8px;
    }
    .profile-action-btn {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      text-align: left;
    }
    .profile-action-btn:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.06); }
    .profile-action-btn svg { color: var(--accent); flex-shrink: 0; }

/* ============================================================
   FOUNDER DASHBOARD. Cofounder-style layout
   ============================================================ */
.fdr-wrap { max-width: 1060px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
.fdr-section-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.fdr-section-hdr h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text-secondary); }
.founder-btn-sm { padding: 6px 14px; background: rgba(var(--accent-rgb),.12); border: 1px solid rgba(var(--accent-rgb),.25); border-radius: 8px; color: var(--accent-bright); font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); }
.founder-btn-sm:hover { background: rgba(var(--accent-rgb),.22); }

/* Hero header */
.fdr-hero { background: rgba(var(--accent-rgb),.08); border: 1px solid rgba(var(--accent-rgb),.22); border-radius: 18px; padding: 28px 32px; display: flex; align-items: center; justify-content: space-between; }
.fdr-hero-left {}
.fdr-day { font-size: 28px; font-weight: 800; letter-spacing: -.5px; color: var(--text-primary); line-height: 1; }
.fdr-date { font-size: 14px; color: var(--text-secondary); margin-top: 4px; }
.fdr-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.fdr-hero-right { text-align: right; }
.fdr-deadline-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: var(--text-muted); }
.fdr-deadline-val { font-size: 18px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.fdr-deadline-days { font-size: 12px; color: var(--accent-bright); margin-top: 2px; font-weight: 600; }

/* Two-column main grid */
.fdr-main-grid { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
.fdr-right-col { display: flex; flex-direction: column; gap: 14px; }

/* Generic panel */
.fdr-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
.fdr-panel-hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-panel-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.fdr-task-progress { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.fdr-refresh-btn { background: none; border: none; color: var(--text-muted); font-size: 15px; cursor: pointer; line-height: 1; padding: 2px 4px; border-radius: 5px; }
.fdr-refresh-btn:hover { color: var(--text-primary); }

/* Checklist */
.fdr-checklist { display: flex; flex-direction: column; }
.fdr-task-row { display: flex; align-items: flex-start; gap: 12px; padding: 13px 18px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; user-select: none; }
.fdr-task-row:last-child { border-bottom: none; }
.fdr-task-row:hover { background: var(--bg-card-hover); }
.fdr-task-row input[type=checkbox] { display: none; }
.fdr-task-check-icon { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-bright); flex-shrink: 0; margin-top: 2px; transition: all .15s; display: flex; align-items: center; justify-content: center; }
.fdr-task-row.fdr-task-done .fdr-task-check-icon { background: var(--accent); border-color: var(--accent); }
.fdr-task-row.fdr-task-done .fdr-task-check-icon::after { content: ''; width: 5px; height: 9px; border: 2px solid var(--on-accent); border-top: none; border-left: none; transform: rotate(45deg) translateY(-1px); display: block; }
.fdr-task-body { flex: 1; min-width: 0; }
.fdr-task-name { font-size: 14px; font-weight: 500; color: var(--text-primary); line-height: 1.3; }
.fdr-task-detail { font-size: 12px; color: var(--text-muted); margin-top: 3px; line-height: 1.4; }
.fdr-task-row.fdr-task-done .fdr-task-name { text-decoration: line-through; color: var(--text-muted); }
.fdr-wie-badge { flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; margin-top: 2px; }
.fdr-badge-frade { background: rgba(var(--accent-rgb),.15); color: var(--accent-bright); border: 1px solid rgba(var(--accent-rgb),.25); }
.fdr-badge-teljo { background: rgba(var(--warning-rgb),.12); color: var(--warning); border: 1px solid rgba(var(--warning-rgb),.2); }
.fdr-badge-beiden { background: rgba(var(--success-rgb),.1); color: var(--success); border: 1px solid rgba(var(--success-rgb),.2); }
.fdr-progress-bar-wrap { height: 3px; background: var(--bg-card-alt); border-radius: 0 0 var(--radius) var(--radius); overflow: hidden; }
.fdr-progress-bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-bright)); transition: width .4s ease; border-radius: 99px; }
.fdr-weekend-msg { padding: 32px 18px; text-align: center; }
.fdr-weekend-icon { font-size: 32px; margin-bottom: 10px; }
.fdr-weekend-txt { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.fdr-weekend-sub { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

/* Stats 2x2 grid (right col) */
.fdr-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-stat { background: var(--bg-card); padding: 14px 12px; }
.fdr-stat-val { font-size: 24px; font-weight: 800; line-height: 1; margin-bottom: 3px; }
.fdr-stat-lbl { font-size: 11px; color: var(--text-secondary); }

/* Goal panel */
.fdr-goal-panel { padding: 16px 18px; }
.fdr-goal-hdr { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; }
.fdr-goal-big { display: flex; align-items: baseline; gap: 4px; margin-bottom: 10px; }
.fdr-goal-current { font-size: 40px; font-weight: 900; color: var(--accent-bright); line-height: 1; }
.fdr-goal-sep { font-size: 22px; color: var(--text-muted); }
.fdr-goal-target { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.fdr-goal-unit { font-size: 13px; color: var(--text-secondary); margin-left: 4px; }
.fdr-goal-bar-wrap { height: 6px; background: var(--bg-card-alt); border-radius: 99px; overflow: hidden; margin-bottom: 6px; }
.fdr-goal-bar-fill { height: 100%; border-radius: 99px; background: var(--accent); transition: width .6s ease; }
.fdr-goal-pct { font-size: 11px; color: var(--text-muted); }

/* Pipeline mini */
.fdr-pipe-mini { padding: 14px 18px; }
.fdr-pipe-mini-cols { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.fdr-pipe-mini-item { display: flex; align-items: center; gap: 10px; }
.fdr-pipe-mini-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.fdr-pipe-mini-name { flex: 1; font-size: 12px; color: var(--text-secondary); }
.fdr-pipe-mini-count { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.fdr-won-lost-row { display: flex; gap: 8px; }

/* Full-width pipeline kanban */
.founder-pipeline-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.founder-col { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.founder-col-hdr { padding: 10px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.founder-col-badge { background: var(--bg-card-alt); border-radius: 20px; padding: 2px 8px; font-size: 11px; }
.founder-col-body { padding: 10px; min-height: 80px; display: flex; flex-direction: column; gap: 8px; }
.founder-card { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; cursor: pointer; transition: border-color .15s; }
.founder-card:hover { border-color: rgba(var(--accent-rgb),.4); }
.founder-card-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.founder-card-meta { font-size: 11px; color: var(--text-secondary); }
.founder-col-add { padding: 8px 10px; border-top: 1px solid var(--border); }
.founder-col-add button { width: 100%; padding: 7px; background: none; border: 1px dashed var(--border-bright); border-radius: 7px; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: var(--transition); }
.founder-col-add button:hover { border-color: var(--accent); color: var(--accent); }
.founder-badge-won  { background: rgba(var(--success-rgb),.12); color: var(--success); border: 1px solid rgba(var(--success-rgb),.2); border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }
.founder-badge-lost { background: rgba(var(--error-rgb),.1); color: var(--error); border: 1px solid rgba(var(--error-rgb),.2); border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }

/* Goals */
.founder-goals-list { display: flex; flex-direction: column; gap: 12px; }
.founder-goal { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.founder-goal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.founder-goal-name { font-size: 14px; font-weight: 600; }
.founder-goal-nums { font-size: 13px; color: var(--text-secondary); }
.founder-goal-bar { height: 6px; background: var(--bg-card-alt); border-radius: 99px; overflow: hidden; }
.founder-goal-fill { height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--accent), var(--accent-bright)); transition: width .6s ease; }
.founder-goal-meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; color: var(--text-muted); }

/* AI Advice */
.founder-ai-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.founder-ai-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.founder-ai-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.founder-ai-title { font-size: 15px; font-weight: 700; }
.founder-ai-sub { font-size: 12px; color: var(--text-secondary); }
.founder-ai-output { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 13px; line-height: 1.7; color: var(--text-primary); white-space: pre-wrap; min-height: 60px; display: none; margin-bottom: 14px; }
.founder-ai-output.visible { display: block; }
.founder-ai-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--accent); border: none; border-radius: 9px; color: var(--on-accent); font-size: 13px; font-weight: 700; cursor: pointer; transition: var(--transition); }
.founder-ai-btn:hover:not(:disabled) { background: var(--accent); transform: translateY(-1px); }
.founder-ai-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Modal */
.founder-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 20px; display: none; }
.founder-modal-overlay.open { display: flex; }
.founder-modal { background: var(--card-elevated); border: 1px solid var(--border); border-radius: 16px; padding: 24px; width: 100%; max-width: 420px; box-shadow: var(--elev-3); animation: modal-in 0.2s var(--ease-out); }
.founder-modal h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
.founder-modal-field { margin-bottom: 14px; }
.founder-modal-field label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-secondary); margin-bottom: 6px; }
.founder-modal-field input, .founder-modal-field select, .founder-modal-field textarea { width: 100%; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 14px; font-family: inherit; outline: none; transition: border-color .15s; }
.founder-modal-field input:focus, .founder-modal-field select:focus, .founder-modal-field textarea:focus { border-color: var(--accent); }
.founder-modal-field textarea { resize: vertical; min-height: 80px; }
.founder-modal-field select option { background: var(--bg-card); }
.founder-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
.founder-modal-cancel { padding: 9px 18px; background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; }
.founder-modal-save { padding: 9px 18px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 13px; font-weight: 700; cursor: pointer; }
.founder-modal-delete { padding: 9px 18px; background: rgba(var(--error-rgb),.12); border: 1px solid rgba(var(--error-rgb),.25); border-radius: 8px; color: var(--error); font-size: 13px; font-weight: 600; cursor: pointer; margin-right: auto; }

@media (max-width: 960px) {
  .fdr-main-grid { grid-template-columns: 1fr; }
  .fdr-right-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .founder-pipeline-cols { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .fdr-hero { flex-direction: column; gap: 16px; }
  .fdr-hero-right { text-align: left; }
  .fdr-right-col { grid-template-columns: 1fr; }
  .fdr-stats-grid { grid-template-columns: 1fr 1fr; }
}

/* Content Hub */
.fdr-hub-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-hub-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-hub-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-hub-title { font-size: 14px; font-weight: 700; }
.fdr-hub-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.fdr-hub-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--bg-card-alt); }
.fdr-platform-tabs { display: flex; gap: 4px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
.fdr-platform-tab { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; background: none; color: var(--text-secondary); transition: var(--transition); white-space: nowrap; }
.fdr-platform-tab.active { background: var(--bg-card); color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,.15); }
.fdr-platform-tab.li-active { color: #0077b5; }
.fdr-platform-tab.ig-active { color: #e1306c; }
.fdr-hub-select { padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; cursor: pointer; }
.fdr-hub-select option { background: var(--bg-card); }
.fdr-hub-gen-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; transition: var(--transition); margin-left: auto; white-space: nowrap; }
.fdr-hub-gen-btn:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
.fdr-hub-gen-btn:disabled { opacity: .5; cursor: not-allowed; }
.fdr-hub-body { padding: 16px 18px; }
.fdr-hub-output { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 13px; line-height: 1.8; color: var(--text-primary); white-space: pre-wrap; min-height: 80px; display: none; margin-bottom: 12px; max-height: 420px; overflow-y: auto; }
.fdr-hub-output.visible { display: block; }
.fdr-hub-footer { display: flex; align-items: center; gap: 10px; }
.fdr-hub-copy-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(var(--accent-rgb),.1); border: 1px solid rgba(var(--accent-rgb),.25); border-radius: 8px; color: var(--accent-bright); font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); }
.fdr-hub-copy-btn.visible { display: inline-flex; }
.fdr-hub-copy-btn:hover { background: rgba(var(--accent-rgb),.2); }
.fdr-hub-regen-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); }
.fdr-hub-regen-btn.visible { display: inline-flex; }
.fdr-hub-regen-btn:hover { color: var(--text-primary); border-color: var(--border-bright); }
.fdr-hub-open-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); text-decoration: none; }
.fdr-hub-open-btn.visible { display: inline-flex; }
.fdr-hub-open-btn.li { background: rgba(10,102,194,.12); border: 1px solid rgba(10,102,194,.3); color: #0a66c2; }
.fdr-hub-open-btn.li:hover { background: rgba(10,102,194,.22); }
.fdr-hub-open-btn.ig { background: rgba(225,48,108,.12); border: 1px solid rgba(225,48,108,.3); color: #e1306c; }
.fdr-hub-open-btn.ig:hover { background: rgba(225,48,108,.22); }
.fdr-dm-open-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(10,102,194,.1); border: 1px solid rgba(10,102,194,.25); border-radius: 8px; color: #0a66c2; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none; }
.fdr-dm-open-btn.visible { display: inline-flex; }
.fdr-dm-open-btn:hover { background: rgba(10,102,194,.2); }
.fdr-hub-empty { padding: 24px 0; color: var(--text-muted); font-size: 13px; text-align: center; line-height: 1.6; }
.fdr-hub-platform-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.fdr-hub-platform-badge.li { background: rgba(0,119,181,.12); color: #0077b5; border: 1px solid rgba(0,119,181,.2); }
.fdr-hub-platform-badge.ig { background: rgba(225,48,108,.1); color: #e1306c; border: 1px solid rgba(225,48,108,.2); }

/* Follow-up urgency */
.founder-card-age { display: inline-block; margin-top: 5px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
.founder-card-age.age-ok       { background: rgba(var(--success-rgb),.1);  color: var(--success); }
.founder-card-age.age-warning  { background: rgba(var(--warning-rgb),.12); color: var(--warning); }
.founder-card-age.age-critical { background: rgba(var(--error-rgb),.12);  color: var(--error); }
.founder-card.has-urgent       { border-color: rgba(var(--error-rgb),.35); }
.fdr-followup-wrap { display: flex; flex-direction: column; gap: 8px; }
.fdr-followup-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: border-color .15s; }
.fdr-followup-item:hover { border-color: rgba(var(--error-rgb),.4); }
.fdr-followup-item.critical { border-left: 3px solid var(--error); }
.fdr-followup-item.warning  { border-left: 3px solid var(--warning); }
.fdr-followup-name { flex: 1; font-size: 13px; font-weight: 600; }
.fdr-followup-fase { font-size: 10px; padding: 2px 7px; border-radius: 20px; font-weight: 700; }
.fdr-followup-fase.f0 { background: rgba(124,147,196,.14);  color: #7C93C4; }
.fdr-followup-fase.f1 { background: rgba(var(--accent-rgb),.16);  color: var(--accent); }
.fdr-followup-fase.f2 { background: rgba(201,154,108,.16);  color: #C99A6C; }
.fdr-followup-days { font-size: 11px; font-weight: 700; color: var(--error); flex-shrink: 0; }
.fdr-followup-empty { padding: 14px 0; color: var(--text-muted); font-size: 13px; }

/* MRR panel */
.fdr-mrr-panel { padding: 14px 18px; }
.fdr-mrr-hdr { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: var(--text-muted); margin-bottom: 8px; }
.fdr-mrr-val { font-size: 34px; font-weight: 900; color: var(--success); line-height: 1; }
.fdr-mrr-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.fdr-mrr-target { font-size: 12px; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; gap: 6px; }
.fdr-mrr-arrow { color: var(--text-muted); }
.fdr-profit-divider { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
.fdr-profit-rows { display: flex; flex-direction: column; gap: 5px; }
.fdr-profit-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.fdr-profit-row .lbl { color: var(--text-muted); }
.fdr-profit-row .val { font-weight: 600; color: var(--text-primary); }
.fdr-profit-row .val.neg { color: var(--red); }
.fdr-profit-row.total { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border); }
.fdr-profit-row.total .lbl { font-weight: 700; color: var(--text-primary); font-size: 13px; }
.fdr-profit-row.total .val { font-size: 16px; font-weight: 900; color: var(--success); }
.fdr-profit-marge { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

/* Outreach tracker */
.fdr-outreach-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-outreach-hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-outreach-title { font-size: 14px; font-weight: 700; }
.fdr-outreach-week { font-size: 11px; color: var(--text-muted); }
.fdr-outreach-body { padding: 16px 18px; }
.fdr-outreach-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.fdr-outreach-card { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.fdr-outreach-num { font-size: 26px; font-weight: 900; line-height: 1; min-width: 32px; }
.fdr-outreach-info { flex: 1; }
.fdr-outreach-name { font-size: 12px; font-weight: 600; }
.fdr-outreach-target { font-size: 11px; color: var(--text-muted); }
.fdr-outreach-plus { background: none; border: 1px solid var(--border); border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; font-weight: 700; color: var(--text-secondary); transition: var(--transition); flex-shrink: 0; }
.fdr-outreach-plus:hover { background: var(--border); color: var(--text-primary); }
.fdr-outreach-bar-wrap { height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; margin-top: 8px; }
.fdr-outreach-bar-fill { height: 100%; border-radius: 99px; background: var(--accent); transition: width .4s; }
.fdr-outreach-footer { display: flex; justify-content: space-between; align-items: center; }
.fdr-outreach-pct { font-size: 12px; color: var(--text-muted); }
.fdr-outreach-reset { background: none; border: none; font-size: 11px; color: var(--text-muted); cursor: pointer; text-decoration: underline; }
.fdr-outreach-reset:hover { color: var(--red); }

/* Bouw tracker */
.fdr-bouw-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-bouw-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-bouw-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-bouw-title { font-size: 14px; font-weight: 700; }
.fdr-bouw-sub { font-size: 11px; color: var(--text-muted); }
.fdr-bouw-body { padding: 12px 18px; }
.fdr-bouw-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.fdr-bouw-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: var(--transition); }
.fdr-bouw-item:hover { border-color: rgba(var(--accent-rgb),0.27); }
.fdr-bouw-item.done { opacity: .5; }
.fdr-bouw-item.done .fdr-bouw-item-text { text-decoration: line-through; }
.fdr-bouw-cb { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--border-bright); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: var(--transition); }
.fdr-bouw-item.done .fdr-bouw-cb { background: var(--accent); border-color: var(--accent); }
.fdr-bouw-item-text { font-size: 13px; flex: 1; }
.fdr-bouw-tag { font-size: 10px; padding: 2px 7px; border-radius: 99px; font-weight: 600; flex-shrink: 0; }
.fdr-bouw-tag.fix { background: rgba(239,68,68,.12); color: var(--red); }
.fdr-bouw-tag.feat { background: rgba(var(--accent-rgb),.12); color: var(--accent-bright); }
.fdr-bouw-tag.test { background: rgba(var(--warning-rgb),.12); color: var(--orange); }
.fdr-bouw-add-row { display: flex; gap: 8px; }
.fdr-bouw-add-input { flex: 1; padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; }
.fdr-bouw-add-btn { padding: 7px 14px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; transition: var(--transition); }
.fdr-bouw-add-btn:hover { opacity: .88; }
.fdr-bouw-progress { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }

/* Personalized DM generator */
.fdr-dm-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-dm-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-dm-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-dm-title { font-size: 14px; font-weight: 700; }
.fdr-dm-sub { font-size: 11px; color: var(--text-muted); }
.fdr-dm-controls { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--bg-card-alt); align-items: center; }
.fdr-dm-select { padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; flex: 1; min-width: 140px; }
.fdr-dm-gen-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; transition: var(--transition); white-space: nowrap; flex-shrink: 0; }
.fdr-dm-gen-btn:hover:not(:disabled) { opacity: .88; }
.fdr-dm-gen-btn:disabled { opacity: .5; cursor: not-allowed; }
.fdr-dm-body { padding: 16px 18px; }
.fdr-dm-output { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 13px; line-height: 1.75; color: var(--text-primary); white-space: pre-wrap; min-height: 60px; display: none; margin-bottom: 12px; }
.fdr-dm-output.visible { display: block; }
.fdr-dm-copy-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(var(--accent-rgb),.1); border: 1px solid rgba(var(--accent-rgb),.25); border-radius: 8px; color: var(--accent-bright); font-size: 12px; font-weight: 600; cursor: pointer; }
.fdr-dm-copy-btn.visible { display: inline-flex; }
.fdr-dm-copy-btn:hover { background: rgba(var(--accent-rgb),.2); }
.fdr-dm-empty { padding: 20px 0; color: var(--text-muted); font-size: 13px; text-align: center; }

/* Documenten Hub */
.fdr-docs-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-docs-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); justify-content: space-between; }
.fdr-docs-hdr-left { display: flex; align-items: center; gap: 10px; }
.fdr-docs-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-docs-title { font-size: 14px; font-weight: 700; }
.fdr-docs-sub { font-size: 11px; color: var(--text-muted); }
.fdr-docs-edit-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; font-size: 11px; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
.fdr-docs-edit-btn:hover { color: var(--text-primary); border-color: var(--border-bright); }
.fdr-docs-body { padding: 16px 18px; }
.fdr-docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
.fdr-doc-card { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: var(--transition); text-decoration: none; position: relative; }
.fdr-doc-card:hover { border-color: rgba(var(--accent-rgb),0.33); background: rgba(var(--accent-rgb),.05); transform: translateY(-1px); }
.fdr-doc-card-icon { font-size: 22px; }
.fdr-doc-card-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.fdr-doc-card-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.fdr-doc-card-badge { position: absolute; top: 10px; right: 10px; font-size: 9px; padding: 2px 6px; border-radius: 99px; font-weight: 700; }
.fdr-doc-card-badge.pdf { background: rgba(239,68,68,.12); color: var(--red); }
.fdr-doc-card-badge.slides { background: rgba(var(--warning-rgb),.12); color: var(--orange); }
.fdr-doc-card-badge.drive { background: rgba(var(--success-rgb),.12); color: var(--success); }
.fdr-doc-card-badge.link { background: rgba(var(--accent-rgb),.12); color: var(--accent-bright); }
.fdr-doc-card-nolink { opacity: .5; cursor: default; }
.fdr-doc-card-nolink:hover { transform: none; background: var(--bg-card-alt); border-color: var(--border); }
.fdr-docs-embed-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 12px; position: relative; background: var(--bg-card-alt); }
.fdr-docs-embed-placeholder { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }
.fdr-docs-embed-placeholder a { color: var(--accent-bright); text-decoration: underline; cursor: pointer; }
.fdr-docs-cfg { display: none; padding: 14px 18px; border-top: 1px solid var(--border); background: var(--bg-card-alt); }
.fdr-docs-cfg.open { display: block; }
.fdr-docs-cfg-title { font-size: 12px; font-weight: 600; margin-bottom: 10px; }
.fdr-docs-cfg-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.fdr-docs-cfg-lbl { font-size: 11px; color: var(--text-muted); width: 100px; flex-shrink: 0; }
.fdr-docs-cfg-input { flex: 1; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 7px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; }
.fdr-docs-cfg-save { padding: 6px 14px; background: var(--accent); border: none; border-radius: 7px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; }

/* ── Persona picker (Frade / Teljo) ─────────────────────────────────────── */
#persona-overlay { position: fixed; inset: 0; background: rgba(8,12,20,.92); backdrop-filter: blur(10px); z-index: 1500; display: none; align-items: center; justify-content: center; }
#persona-overlay.open { display: flex; }
.persona-modal { width: min(440px, 92vw); background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 28px 24px; text-align: center; box-shadow: var(--elev-3); }
.persona-modal h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: var(--text-primary); }
.persona-modal p { margin: 0 0 22px; font-size: 13px; color: var(--text-muted); }
.persona-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.persona-choice { cursor: pointer; background: var(--bg-card-alt); border: 2px solid var(--border); border-radius: 12px; padding: 18px 12px; transition: var(--transition); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.persona-choice:hover { border-color: var(--accent-bright); transform: translateY(-2px); background: rgba(var(--accent-rgb),.08); }
.persona-avatar { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: var(--on-accent); }
.persona-avatar.frade { background: var(--accent); }
.persona-avatar.teljo { background: var(--accent); }
.persona-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.persona-role { font-size: 11px; color: var(--text-muted); }

/* ── Live Klanten panel ─────────────────────────────────────────────────── */
.fdr-live-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 20px; }
.fdr-live-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); justify-content: space-between; }
.fdr-live-hdr-left { display: flex; align-items: center; gap: 10px; }
.fdr-live-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-live-title { font-size: 14px; font-weight: 700; }
.fdr-live-sub { font-size: 11px; color: var(--text-muted); }
.fdr-live-count { font-size: 11px; color: var(--text-muted); }
.fdr-live-count .online-num { color: var(--green); font-weight: 700; }
.fdr-live-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fdr-live-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); background: var(--bg-card-alt); }
.fdr-live-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); }
.fdr-live-table tr:last-child td { border-bottom: none; }
.fdr-live-table tr:hover td { background: rgba(var(--accent-rgb),.04); }
.fdr-live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.fdr-live-dot.online { background: var(--success); box-shadow: 0 0 6px rgba(var(--success-rgb),.7); animation: pulseDot 1.6s ease-in-out infinite; }
.fdr-live-dot.offline { background: #4b5563; }
@keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
.fdr-live-name { font-weight: 600; color: var(--text-primary); }
.fdr-live-meta { font-size: 11px; color: var(--text-muted); }
.fdr-live-stat { font-weight: 600; font-variant-numeric: tabular-nums; }
.fdr-live-mrr { color: var(--green); font-weight: 700; font-variant-numeric: tabular-nums; }
.fdr-live-empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.fdr-live-mrr-input { width: 70px; padding: 4px 6px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
.fdr-live-mrr-input:focus { outline: none; border-color: var(--accent-bright); }

/* ── Meeting widget ─────────────────────────────────────────────────────── */
.fdr-meeting-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 20px; }
.fdr-meeting-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.fdr-meeting-icon { font-size: 16px; }
.fdr-meeting-title { font-size: 13px; font-weight: 700; }
.fdr-meeting-when { font-size: 18px; font-weight: 700; color: var(--accent-bright); margin: 4px 0; }
.fdr-meeting-agenda { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
.fdr-meeting-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.fdr-meeting-row input { flex: 1; padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 7px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; }
.fdr-meeting-row button { padding: 7px 12px; background: var(--accent-bright); border: none; border-radius: 7px; color: var(--on-accent); font-size: 12px; font-weight: 600; cursor: pointer; }
.fdr-meeting-empty { color: var(--text-muted); font-size: 12px; font-style: italic; }

/* ── Persona greeting in hero ───────────────────────────────────────────── */
.fdr-persona-greeting { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.fdr-persona-greeting strong { color: var(--accent-bright); }
.fdr-persona-switch { background: none; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; margin-left: 8px; }
.fdr-persona-switch:hover { color: var(--text-primary); border-color: var(--border-bright); }

/* ── Editable cost panel ────────────────────────────────────────────────── */
.fdr-cost-edit-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 11px; padding: 0 4px; display: inline-flex; align-items: center; vertical-align: middle; }
.fdr-cost-edit-btn:hover { color: var(--accent-bright); }
.fdr-cost-edit-input { width: 60px; padding: 2px 6px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 5px; color: var(--text-primary); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }

/* AI Coach chat */
.fdr-chat-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-chat-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-chat-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 15px; }
.fdr-chat-hdr-info {}
.fdr-chat-hdr-name { font-size: 14px; font-weight: 700; }
.fdr-chat-hdr-sub { font-size: 11px; color: var(--text-muted); }
.fdr-chat-clear { margin-left: auto; background: none; border: none; color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.fdr-chat-clear:hover { color: var(--text-primary); background: var(--bg-card-alt); }
.fdr-chat-msgs { height: 280px; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.fdr-chat-bubble { max-width: 82%; padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.55; }
.fdr-chat-bubble.assistant { background: var(--bg-card-alt); border: 1px solid var(--border); color: var(--text-primary); align-self: flex-start; border-bottom-left-radius: 3px; }
.fdr-chat-bubble.user { background: var(--accent); color: var(--on-accent); align-self: flex-end; border-bottom-right-radius: 3px; }
.fdr-chat-bubble.typing { opacity: .55; font-style: italic; }
.fdr-chat-input-row { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border); }
.fdr-chat-input { flex: 1; padding: 9px 13px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s; resize: none; height: 38px; overflow: hidden; }
.fdr-chat-input:focus { border-color: var(--accent); }
.fdr-chat-send { padding: 9px 16px; background: var(--accent); border: none; border-radius: 10px; color: var(--on-accent); font-size: 13px; font-weight: 700; cursor: pointer; transition: var(--transition); flex-shrink: 0; }
.fdr-chat-send:hover:not(:disabled) { background: var(--accent-bright); }
.fdr-chat-send:disabled { opacity: .5; cursor: not-allowed; }

/* ============================================================
   SIDEBAR
   ============================================================ */
.sidebar {
  width: 220px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  /* Permanently dark in BOTH themes — the anchor the light content area
     sits against. Rebinding the colour tokens here means every child
     (nav labels, icons, dividers, the account block) picks up
     dark-surface values automatically instead of needing its own
     override. The inset highlight is the specular edge that makes the
     pane read as a physical sheet catching light. */
  background: rgba(15,20,30,0.88);
  backdrop-filter: saturate(160%) blur(20px);
  -webkit-backdrop-filter: saturate(160%) blur(20px);
  /* The sidebar is dark in BOTH themes, so it rebinds the FULL token set
     and becomes a self-contained dark context. Rebinding only a few of
     them is what caused a run of light-theme bugs in here: the account
     block painted white (it used --bg-card-alt), the client's own name
     rendered at 1.04 contrast (it used --text-primary), and the logout
     button sat at 2.38 (it used --red, which light tunes for white).
     Every alias a child might reach for is covered here on purpose. */
  --text:           #E9EEF6;
  --text-c:         #E9EEF6;
  --text-primary:   #E9EEF6;
  --text-muted:     #8D99AC;
  --text-muted-c:   #8D99AC;
  --text-secondary: #8D99AC;
  --border:      rgba(255,255,255,0.07);
  --border-c:    rgba(255,255,255,0.07);
  --divider:     rgba(255,255,255,0.07);
  --hover:       rgba(255,255,255,0.06);
  --hover-c:     rgba(255,255,255,0.06);
  --bg-card:     transparent;
  --bg-card-alt: rgba(255,255,255,0.05);
  --bg-alt:      rgba(255,255,255,0.05);
  /* Semantic colours in their dark-surface variants — the light theme's
     deepened versions are unreadable against this pane. */
  --red:         #F87171;
  --error-c:     #F87171;
  --error-rgb:   248,113,113;
  --green:       #34D399;
  --success-c:   #34D399;
  --success-rgb: 52,211,153;
  --accent:        #E8D7B1;
  --accent-c:      #E8D7B1;
  --accent-bright: #F2C670;
  --accent-rgb:    231,183,90;
  border-right: 1px solid rgba(255,255,255,0.06);
  box-shadow: inset -1px 0 0 rgba(255,255,255,0.06), 8px 0 32px rgba(20,22,28,0.10);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
/* Without backdrop-filter the pane would render see-through and
   unreadable. Literal colour, not var(--bg-card) — that token is
   rebound to transparent inside .sidebar. */
@supports not (backdrop-filter: blur(1px)) {
  .sidebar { background: #0F141E; }
}

/* ---- Sidebar navigation ---------------------------------------------
   Active = solid gold pill. On a dark pane a filled shape reads
   instantly at a glance, where the old 12%-alpha gradient tint was
   nearly invisible. Higher specificity than the base .nav-item.active
   rule so it wins regardless of source order. */
.sidebar .nav-item {
  color: #8D99AC;
  border-radius: 10px;
}
.sidebar .nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: #E9EEF6;
}
.sidebar .nav-item.active {
  background: var(--grad-gold);
  color: #0B0F16;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0,0,0,.30), 0 6px 18px rgba(232,215,177,.26);
}
/* The old rule painted a 3px bar down the left edge. Redundant now that
   the whole item is a filled pill, and it broke the pill's silhouette. */
.sidebar .nav-item.active::before { display: none; }
.sidebar .nav-item.active svg { color: #0B0F16; stroke: currentColor; }
.sidebar .nav-item:active { transform: translateY(1px); }

.sidebar-logo {
  padding: 26px 20px 22px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.sidebar-logo img {
  height: 44px;
  width: auto;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}

/* Two flat colourways of the mark (see LOGO-RECOLOR notes) — dark surfaces
   get the pale sand tint, the light surface gets the deeper bronze step so
   it keeps contrast on white/cream. Swapped per theme, never both at once. */
/* Hier stonden twee logo's over elkaar, een lichte en een donkere, waarvan de
   lichte permanent verborgen was — de sidebar is in beide thema's donker, dus
   die wissel had geen functie meer. Een img op display:none wordt door de
   browser nog steeds opgehaald, dus dat kostte elke lading een extra download
   voor niets. Nu één logo: het goud leest op donker én op licht, dus de
   ink/sand-splitsing is sowieso overbodig geworden. */

.sidebar-nav {
  flex: 1;
  padding: 20px 12px;
  overflow-y: auto;
}

.nav-divider {
  height: 1px;
  background: var(--border);
  margin: 10px 6px;
  opacity: 0.55;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  margin-bottom: 4px;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}

.nav-item:focus-visible {
  outline: 2px solid var(--blue-bright);
  outline-offset: 2px;
}

.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.nav-item:active {
  transform: scale(0.98);
  transition-duration: var(--dur-fast);
}

.nav-item.active {
  background: linear-gradient(90deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.06));
  color: var(--blue-bright);
  border: none;
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--blue-primary), var(--blue-bright));
  box-shadow: none;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.75;
}

.nav-item:hover .nav-icon,
.nav-item.active .nav-icon { opacity: 1; }

.sidebar-bottom {
  padding: 16px 12px;
  border-top: 1px solid var(--border);
}

/* ── Credit usage widget. Hidden by default (display:none inline in the
   HTML) — only shown once loadCreditUsage() confirms the credit system is
   active for this client (allowance configured). See CREDIT-SYSTEM-DESIGN.md
   and api/_credits.js. ─────────────────────────────────────────────────── */
.credit-usage-widget {
  padding: 10px 10px 12px;
  margin-bottom: 10px;
  border-radius: 10px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
}
.credit-usage-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.credit-usage-head .credit-usage-pct { font-weight: 700; }
.credit-usage-track {
  height: 6px;
  border-radius: 99px;
  background: var(--bg-card);
  overflow: hidden;
  margin-bottom: 6px;
}
.credit-usage-fill {
  height: 100%;
  border-radius: 99px;
  transition: width .4s ease;
  background: var(--green);
}
.credit-usage-fill.amber { background: var(--orange); }
.credit-usage-fill.red   { background: var(--red); }
.credit-usage-head .credit-usage-pct.amber { color: var(--orange); }
.credit-usage-head .credit-usage-pct.red   { color: var(--red); }
.credit-usage-sub {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.5;
}
.credit-usage-upgrade {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--blue-bright);
  text-decoration: none;
  cursor: pointer;
}
.credit-usage-upgrade:hover { text-decoration: underline; }

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  margin-bottom: 8px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--on-accent);
  flex-shrink: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11px;
  color: var(--text-muted);
}

.btn-logout {
  width: 100%;
  padding: 9px 14px;
  background: rgba(255, 69, 96, 0.08);
  border: 1px solid rgba(255, 69, 96, 0.2);
  border-radius: 8px;
  color: var(--red);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-logout:hover {
  background: rgba(255, 69, 96, 0.15);
  border-color: rgba(255, 69, 96, 0.4);
}

/* Sidebar overlay (mobile) */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 99;
}

.sidebar-overlay.visible { display: block; }

/* ============================================================
   TOPBAR
   ============================================================ */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  /* Was a hardcoded rgba(13,17,23,.85) — a near-black bar, which in the
     light theme rendered as a dark slab across the top of a pale page.
     Now themed, so it reads as the same material as the sidebar. */
  background: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--border);
  box-shadow: inset 0 1px 0 var(--glass-edge), 0 4px 20px rgba(20,17,10,0.05);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hamburger {
  display: none;
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 16px;
  transition: var(--transition);
}

.hamburger:hover { background: var(--bg-card-alt); }

.page-title {
  font-size: 16px;
  /* Deze regel staat na de kop-regel bovenaan en zou hem anders terugzetten
     naar Inter/800. Zelfde waarden als daar. */
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: none;
  -webkit-background-clip: initial;
  -webkit-text-fill-color: currentColor;
  background-clip: initial;
  color: var(--text);
  transition: opacity 0.2s ease;
}

.page-subtitle {
  font-size: 11.5px;
  color: var(--text-muted);
  margin-top: 3px;
  transition: opacity 0.2s ease;
  opacity: 0.8;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.timestamp-info {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.btn-icon {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}

.btn-icon:hover {
  background: rgba(var(--accent-rgb),0.12);
  border-color: rgba(var(--accent-rgb),0.25);
  color: var(--blue-bright);
  box-shadow: none;
  transform: translateY(-1px);
}

/* Press responds instantly (fast duration, no separate delay) — perceived
   speed matters more here than the animation itself. */
.btn-icon:active {
  transform: translateY(0) scale(0.97);
  transition-duration: var(--dur-fast);
}

.btn-icon:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.25);
  border-color: var(--blue-bright);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.btn-icon:disabled:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.07);
  color: var(--text-secondary);
}

    /* ── Global Search ── */
    .search-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8,12,20,0.8);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9000;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 90px;
    }
    .search-overlay.open { display: flex; animation: searchBgIn 0.15s ease both; }
    @keyframes searchBgIn { from { opacity:0; } to { opacity:1; } }
    .search-modal {
      background: var(--bg-card);
      border: 1px solid var(--border-bright);
      border-radius: var(--radius);
      width: min(660px, 92vw);
      box-shadow: var(--elev-3);
      overflow: hidden;
      position: relative;
      animation: searchModalIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
    }
    /* Match stat-card top glow line */
    .search-modal::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: var(--accent);
      z-index: 1;
    }
    @keyframes searchModalIn { from { transform: translateY(-14px) scale(0.97); opacity:0; } to { transform: none; opacity:1; } }
    .search-modal-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .search-modal-bar svg { color: var(--accent); flex-shrink:0; }
    .search-modal-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      font-size: 16px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
    }
    .search-modal-input::placeholder { color: var(--text-secondary); }
    .search-kbd {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px 10px;
      font-size: 11px;
      color: var(--text-secondary);
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      white-space: nowrap;
      flex-shrink: 0;
      transition: var(--transition);
    }
    .search-kbd:hover { border-color: var(--accent); color: var(--text-primary); }
    .search-results {
      max-height: 420px;
      overflow-y: auto;
      padding: 6px 0;
    }
    .search-results::-webkit-scrollbar { width: 3px; }
    .search-results::-webkit-scrollbar-track { background: transparent; }
    .search-results::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }
    .search-hint {
      padding: 32px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .search-hint-icon { opacity: 0.3; line-height: 1; color: var(--text-muted); }
    .search-hint-text { font-size: 13px; color: var(--text-secondary); }
    .search-hint-shortcuts { display: flex; gap: 16px; margin-top: 4px; flex-wrap: wrap; justify-content: center; }
    .search-hint-shortcut { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
    .search-hint-shortcut kbd {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      color: var(--text-secondary);
    }
    .search-section-label {
      padding: 10px 20px 3px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .search-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      cursor: pointer;
      transition: background 0.1s, border-left-color 0.1s;
      border-left: 3px solid transparent;
      user-select: none;
    }
    .search-result-item:hover,
    .search-result-item.active {
      background: var(--bg-card-alt);
      border-left-color: var(--accent);
    }
    .search-result-avatar {
      width: 36px; height: 36px; border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--blue-primary), var(--accent-bright));
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: var(--on-accent); flex-shrink: 0;
      letter-spacing: 0.03em;
      box-shadow: none;
    }
    .search-result-body { flex: 1; min-width: 0; }
    .search-result-name {
      font-size: 13px; font-weight: 600; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-result-name mark {
      background: rgba(var(--accent-rgb),0.2); color: var(--accent-bright);
      font-weight: 700; border-radius: 3px; padding: 0 2px;
    }
    .search-result-meta {
      font-size: 11px; color: var(--text-secondary); margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-result-tags {
      display: flex; gap: 5px; align-items: center;
      margin-left: auto; flex-shrink: 0; padding-left: 8px;
    }
    .search-result-badge {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.04em; padding: 2px 7px; border-radius: 20px;
      background: rgba(var(--accent-rgb),0.12); color: var(--blue-bright);
      border: 1px solid rgba(var(--accent-rgb),0.2);
    }
    .search-result-badge.qualified {
      background: rgba(var(--success-rgb),0.1); color: var(--green);
      border-color: rgba(var(--success-rgb),0.2);
    }
    .search-result-score {
      font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--blue-bright);
      background: rgba(var(--accent-rgb),0.1);
      padding: 2px 8px; border-radius: var(--radius-sm);
      border: 1px solid rgba(var(--accent-rgb),0.2);
      white-space: nowrap;
    }
    .search-no-results {
      padding: 36px 20px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 13px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .search-no-results-icon { opacity: 0.3; color: var(--text-muted); }
    .search-footer {
      padding: 9px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 16px;
      align-items: center;
      background: var(--bg-card-alt);
    }
    .search-footer-hint { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
    .search-footer-hint kbd {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      color: var(--text-secondary);
    }
    .search-footer-count { margin-left: auto; font-size: 11px; color: var(--text-muted); }
    /* Search pill in topbar */
    .search-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition);
      min-width: 170px;
      font-family: 'Inter', sans-serif;
    }
    .search-pill:hover { border-color: var(--accent); color: var(--text-primary); background: var(--bg-card-hover); }
    .search-pill svg { flex-shrink: 0; opacity: 0.7; }
    .search-pill-label { flex: 1; text-align: left; }
    .search-pill-kbd {
      font-size: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: 'Inter', sans-serif;
      color: var(--text-muted);
      flex-shrink: 0;
    }
.notif-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--red);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  border: 2px solid var(--bg-topbar, var(--bg));
  pointer-events: none;
}

/* Notification dropdown */
.notif-wrap { position: relative; display: inline-flex; }
.notif-dropdown {
  position: absolute; top: calc(100% + 8px); right: 0;
  width: 340px; max-width: calc(100vw - 32px);
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow);
  z-index: 200; overflow: hidden;
  animation: notifDdIn 0.14s cubic-bezier(0.4,0,0.2,1);
}
@keyframes notifDdIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.notif-dd-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--border);
  font-size: 13px; font-weight: 700; color: var(--text-primary);
}
.notif-dd-clear {
  background: none; border: none; color: var(--accent-bright);
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.notif-dd-clear:hover { text-decoration: underline; }
.notif-dd-body { max-height: 360px; overflow-y: auto; }
.notif-dd-item {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; cursor: pointer; border-bottom: 1px solid var(--border);
  transition: background 0.12s ease;
}
.notif-dd-item:hover { background: var(--bg-card-hover); }
.notif-dd-item.unread { background: rgba(var(--accent-rgb),0.06); }
.notif-dd-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent); opacity: 0;
}
.notif-dd-item.unread .notif-dd-dot { opacity: 1; }
.notif-dd-icon {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-card-alt); color: var(--accent-bright);
}
.notif-dd-icon.hot { background: rgba(var(--success-rgb),0.12); color: var(--green); }
.notif-dd-main { flex: 1; min-width: 0; }
.notif-dd-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notif-dd-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.notif-dd-empty { padding: 28px 14px; text-align: center; color: var(--text-muted); font-size: 13px; }
.notif-dd-foot {
  width: 100%; padding: 11px; background: var(--bg-card-alt); border: none;
  border-top: 1px solid var(--border); color: var(--accent-bright);
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.notif-dd-foot:hover { background: var(--bg-card-hover); }

.btn-icon .icon { font-size: 14px; }

.btn-icon.spin .icon { animation: spin 1s linear infinite; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes cmFadeIn { from { opacity: 0; } to { opacity: 1; } }

/* Generic confirm modal buttons (injected via showConfirmModal) */
.cm-btn:hover { opacity: 0.88; }
.cm-btn:active { transform: translateY(1px); }
.cm-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.3); }
.cm-btn-confirm.danger:focus-visible { box-shadow: 0 0 0 3px rgba(var(--error-rgb),0.3); }
@keyframes modalIn { from { opacity: 0; transform: translateY(-8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes pulse-glow { 0%,100% { box-shadow: 0 0 0 0 currentColor; opacity: .9; } 50% { box-shadow: 0 0 0 8px transparent; opacity: 1; } }

.btn-primary-sm {
  background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--accent-rgb), 0.2));
  border-color: var(--blue-primary);
  color: var(--blue-bright);
}

.btn-primary-sm:hover {
  background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.35), rgba(var(--accent-rgb), 0.35));
  color: var(--cyan);
}

.btn-primary-sm:disabled,
.btn-primary-sm:disabled:hover {
  opacity: 0.5;
  cursor: not-allowed;
  background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.2), rgba(var(--accent-rgb), 0.2));
  color: var(--blue-bright);
}

.theme-toggle { font-size: 16px; padding: 8px 10px; }

/* ============================================================
   STATS GRID
   ============================================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 20px 18px;
  position: relative;
  overflow: hidden;
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              background var(--dur-base) var(--ease-out);
  cursor: default;
  box-shadow: var(--edge-hi), var(--shadow-card);
}

/* ---- Per-metric colour -----------------------------------------------
   Each card binds one local --a / --a-soft pair; the icon chip, the fill
   bar and the top hairline all read from it, so a metric's colour is set
   in exactly one place. Colour never touches the value text — coloured
   numerals fail contrast and read as decoration rather than data. */
.stat-card[data-accent="blue"]    { --a: var(--c-blue);    --a-soft: var(--c-blue-soft); }
.stat-card[data-accent="emerald"] { --a: var(--c-emerald); --a-soft: var(--c-emerald-soft); }
.stat-card[data-accent="orange"]  { --a: var(--c-orange);  --a-soft: var(--c-orange-soft); }
.stat-card[data-accent="purple"]  { --a: var(--c-purple);  --a-soft: var(--c-purple-soft); }
.stat-card[data-accent="cyan"]    { --a: var(--c-cyan);    --a-soft: var(--c-cyan-soft); }
.stat-card[data-accent="gold"]    { --a: var(--c-gold);    --a-soft: var(--c-gold-soft); }

/* A 2px bar across the top edge, revealed on hover. At rest the grid stays
   calm; on approach the card identifies itself. */
.stat-card::after {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: var(--a, var(--accent));
  opacity: 0;
  transition: opacity var(--dur-base, .18s) var(--ease-out, ease);
}
.stat-card:hover::after { opacity: 1; }
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--elev-2, var(--shadow));
  border-color: var(--a, var(--border));
}
.stat-card:active { transform: translateY(0); }

.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.stat-icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--a-soft, rgba(0,0,0,.05));
  color: var(--a, var(--accent));
}
.stat-icon svg { width: 16px; height: 16px; display: block; }
.stat-bar-fill { background: var(--a, var(--accent)) !important; }

@media (prefers-reduced-motion: reduce) {
  .stat-card, .stat-card::after { transition: none; }
  .stat-card:hover { transform: none; }
}

/* Stagger the grid in on load — content assembling reads calmer than a
   pop-in, and stays under the 240ms entrance guideline per card. */
@keyframes cardEnter {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stats-grid .stat-card {
  animation: cardEnter var(--dur-enter) var(--ease-out) both;
}
.stats-grid .stat-card:nth-child(1) { animation-delay: 0ms;   }
.stats-grid .stat-card:nth-child(2) { animation-delay: 40ms;  }
.stats-grid .stat-card:nth-child(3) { animation-delay: 80ms;  }
.stats-grid .stat-card:nth-child(4) { animation-delay: 120ms; }
.stats-grid .stat-card:nth-child(5) { animation-delay: 160ms; }
.stats-grid .stat-card:nth-child(6) { animation-delay: 200ms; }

/* Counter animation for stat values */
@keyframes countUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-card .stat-value {
  animation: countUp 0.5s var(--ease-out) forwards;
  animation-delay: 0.1s;
}

/* Subtle top line — one quiet sand hairline, not a two-hue glow */
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(var(--accent-rgb), 0.35);
  transition: opacity 0.3s ease;
}

/* Corner shimmer removed — was a 60x60 solid-fill block, too heavy for "sand never a flood" */
.stat-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 60px;
  height: 60px;
  background: none;
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-bright);
  background: linear-gradient(160deg, var(--bg-card-hover) 0%, var(--bg-card) 100%);
  transform: translateY(-3px) scale(1.01);
  box-shadow: var(--elev-1);
}

.stat-card:active {
  transform: translateY(-1px) scale(1.005);
  transition-duration: var(--dur-fast);
}

.stat-card:hover::before {
  background: rgba(var(--accent-rgb), 0.6);
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 10px;
}

.stat-value {
  font-variant-numeric: tabular-nums;
  font-size: 28px;
  /* Deze regel staat na de kop-regel; zonder deze drie zou hij terugvallen
     op Inter/800. De grote cijfers zijn juist waar de kop-letter het meest
     doet. */
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: 8px;
}

.stat-value.cyan  { color: var(--cyan);        text-shadow: 0 0 20px rgba(6,182,212,0.35); }
.stat-value.green { color: var(--green);        text-shadow: 0 0 20px rgba(16,185,129,0.35); }
.stat-value.orange{ color: var(--orange);       text-shadow: 0 0 20px rgba(var(--warning-rgb),0.3); }
.stat-value.blue  { color: var(--blue-bright);  text-shadow: 0 0 20px rgba(59,130,246,0.35); }

.stat-unit {
  font-size: 16px;
  font-weight: 600;
  opacity: 0.45;
  margin-left: 2px;
  letter-spacing: 0;
}

.stat-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.stat-trend {
  margin-top: 4px;
  min-height: 16px;
}

.stat-bar {
  height: 3px;
  background: var(--bg-card-alt);
  border-radius: 2px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue-primary), var(--cyan));
  border-radius: 2px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  width: 0%;
}

/* ============================================================
   FILTERS BAR
   ============================================================ */
.filters-bar {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.search-wrapper {
  position: relative;
  flex: 1;
  min-width: 180px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  transition: var(--transition);
}

.search-input:focus {
  border-color: var(--blue-bright);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
}

.search-input::placeholder { color: var(--text-muted); }

.filter-select {
  padding: 9px 12px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  cursor: pointer;
  transition: var(--transition);
  min-width: 130px;
}

.filter-select:focus { border-color: var(--blue-bright); }

.filters-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--blue-primary);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: var(--on-accent);
}

.btn-reset {
  padding: 8px 12px;
  background: rgba(255, 69, 96, 0.08);
  border: 1px solid rgba(255, 69, 96, 0.2);
  border-radius: 8px;
  color: var(--red);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  display: none;
}

.btn-reset.visible { display: inline-flex; align-items: center; gap: 4px; }
.btn-reset:hover { background: rgba(255, 69, 96, 0.15); }

.leads-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  margin-left: auto;
}

.leads-count strong { color: var(--text-secondary); }

/* ============================================================
   TABLE
   ============================================================ */
.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--edge-hi), var(--shadow-card);
  position: relative;
}

.table-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(37,99,235,0.35) 40%, rgba(6,182,212,0.35) 60%, transparent 90%);
  z-index: 1;
  pointer-events: none;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead tr {
  border-bottom: 1px solid var(--border);
  background: linear-gradient(90deg, rgba(37,99,235,0.05) 0%, rgba(6,182,212,0.02) 100%);
}

th {
  padding: 12px 14px;
  text-align: left;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
}

th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}

th.sortable:hover { color: var(--cyan); }
th.sort-active { color: var(--cyan); }

.sort-indicator { margin-left: 4px; font-size: 10px; }

tbody tr {
  border-bottom: 1px solid rgba(15, 32, 64, 0.5);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  animation: rowFadeUp 0.35s ease both;
  position: relative;
}

@keyframes rowFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

tbody tr:nth-child(even) { background: rgba(255,255,255,0.012); }
tbody tr:hover {
  background: rgba(var(--accent-rgb), 0.08);
  box-shadow: inset 3px 0 0 var(--blue-bright);
  transform: scale(1.002);
}
tbody tr:active { transform: scale(0.998); }
tbody tr:last-child { border-bottom: none; }

/* Row focus state for keyboard navigation */
tbody tr:focus-visible {
  outline: 2px solid var(--blue-bright);
  outline-offset: -2px;
  background: rgba(var(--accent-rgb), 0.1);
}

td {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-primary);
  vertical-align: middle;
}

.td-naam { font-weight: 600; max-width: 140px; }
.td-phone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.copy-btn {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: var(--transition);
  position: relative;
}

tr:hover .copy-btn { opacity: 1; }
.copy-btn:hover { color: var(--cyan); background: rgba(165, 180, 252, 0.1); }

/* Touch devices have no hover — keep the copy button discoverable/tappable */
@media (hover: none) {
  .copy-btn { opacity: 0.65; }
}

.copy-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--success);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.copy-tooltip.show { opacity: 1; }

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
  letter-spacing: 0.2px;
}

.badge-new {
  background: rgba(138, 150, 170, 0.12);
  color: #8a96aa;
  border: 1px solid rgba(138,150,170,0.2);
}
.badge-inprogress {
  background: rgba(255, 149, 0, 0.1);
  color: var(--orange);
  border: 1px solid rgba(255,149,0,0.22);
  position: relative;
}
.badge-inprogress::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--orange);
  animation: pulse 1.5s ease-in-out infinite;
}
.badge-done {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--blue-bright);
  border: 1px solid rgba(var(--accent-rgb),0.22);
}
.badge-yes {
  background: rgba(var(--success-rgb), 0.1);
  color: var(--green);
  border: 1px solid rgba(var(--success-rgb),0.22);
}
.badge-yes::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 6px rgba(var(--success-rgb),0.5);
}
.badge-no {
  background: rgba(var(--error-rgb), 0.1);
  color: var(--red);
  border: 1px solid rgba(var(--error-rgb),0.22);
}
.badge-bron {
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--blue-bright);
  border: 1px solid rgba(var(--accent-rgb),0.18);
  font-size: 10px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* Score pill */
.score-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 26px;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: default;
  transition: all 0.2s ease;
  padding: 0 6px;
}

.score-pill:hover {
  transform: scale(1.05);
}

.score-green {
  background: rgba(var(--success-rgb), 0.12);
  color: var(--green);
  border: 1px solid rgba(var(--success-rgb),0.25);
  box-shadow: none;
}
.score-orange {
  background: rgba(var(--warning-rgb), 0.12);
  color: var(--orange);
  border: 1px solid rgba(var(--warning-rgb),0.25);
}
.score-red {
  background: rgba(var(--error-rgb), 0.12);
  color: var(--red);
  border: 1px solid rgba(var(--error-rgb),0.25);
}
.score-gray {
  background: rgba(138, 150, 170, 0.08);
  color: var(--text-muted);
  border: 1px solid rgba(138,150,170,0.15);
}

.td-samenvatting {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}

.td-arrow { color: var(--text-muted); font-size: 14px; text-align: right; }
tr:hover .td-arrow { color: var(--cyan); }

/* Skeleton loading */
.skeleton-row td { padding: 16px 14px; }

.skeleton {
  background: linear-gradient(90deg, var(--bg-card-alt) 0%, var(--bg-card-hover) 20%, var(--bg-card-alt) 40%, var(--bg-card-alt) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  border-radius: 6px;
  height: 14px;
  display: block;
  position: relative;
  overflow: hidden;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: skeleton-shine 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
}

@keyframes skeleton-shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Skeleton stat cards */
.stat-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat-card-skeleton .skeleton-label {
  height: 12px;
  width: 60%;
  border-radius: 4px;
}
.stat-card-skeleton .skeleton-value {
  height: 32px;
  width: 45%;
  border-radius: 6px;
}
.stat-card-skeleton .skeleton-bar {
  height: 4px;
  width: 100%;
  border-radius: 2px;
  margin-top: 8px;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 72px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 12px;
  opacity: 0.25;
  filter: grayscale(0.5);
}
.empty-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: -0.2px;
}
.empty-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
  max-width: 320px;
  line-height: 1.6;
}
.empty-state-illustration {
  width: 120px;
  height: 120px;
  margin-bottom: 20px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px dashed rgba(var(--accent-rgb),0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  opacity: 0.6;
}

/* ============================================================
   DETAIL PANEL
   ============================================================ */
.panel-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 200;
}

.panel-backdrop.visible { display: block; }

.detail-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100vh;
  width: 480px;
  background: var(--card-elevated);
  border-left: 1px solid var(--border);
  /* Directional version of --elev-3 — it slides in from the right edge,
     so the shadow reads leftward instead of the usual centred spread. */
  box-shadow: -6px 0 16px rgba(0,0,0,.32), -24px 0 56px rgba(0,0,0,.28);
  z-index: 201;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--dur-enter) var(--ease-out);
  overflow: hidden;
}

.detail-panel.visible { transform: translateX(0); }

.panel-header {
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: relative;
}

.panel-close {
  position: absolute;
  top: 18px;
  right: 18px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 16px;
  transition: var(--transition);
}

.panel-close:hover { background: rgba(255,69,96,0.1); border-color: var(--red); color: var(--red); }

.panel-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-bottom: 14px;
}

.avatar-green { background: rgba(0, 229, 160, 0.15); color: var(--green); border: 2px solid rgba(0,229,160,0.3); }
.avatar-red { background: rgba(255, 69, 96, 0.15); color: var(--red); border: 2px solid rgba(255,69,96,0.3); }
.avatar-orange { background: rgba(255, 149, 0, 0.15); color: var(--orange); border: 2px solid rgba(255,149,0,0.3); }

.panel-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-phone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.panel-copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 4px;
  transition: var(--transition);
}

.panel-copy-btn:hover { color: var(--cyan); background: rgba(0,212,255,0.1); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 24px;
}

.panel-section {
  margin-bottom: 22px;
}

.panel-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--cyan);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(0,212,255,0.3), transparent);
}

.panel-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(15, 32, 64, 0.6);
  font-size: 13px;
  gap: 10px;
}

.panel-row:last-child { border-bottom: none; }
.panel-row-label { color: var(--text-muted); flex-shrink: 0; }
.panel-row-value { color: var(--text-primary); text-align: right; font-weight: 500; }

/* Score bar */
.score-bar-wrapper { display: flex; align-items: center; gap: 10px; }

.score-bar {
  display: flex;
  gap: 3px;
}

.score-segment {
  width: 18px;
  height: 8px;
  border-radius: 2px;
  background: var(--bg-card-alt);
  transition: background 0.3s ease;
}

.score-segment.filled { background: linear-gradient(90deg, var(--blue-primary), var(--cyan)); }
.score-segment.filled.high { background: linear-gradient(90deg, var(--green), var(--cyan)); }
.score-segment.filled.low { background: linear-gradient(90deg, var(--red), var(--orange)); }

.score-number {
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  font-weight: 700;
}

/* Notes */
.notes-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  resize: vertical;
  outline: none;
  transition: var(--transition);
  margin-bottom: 10px;
}

.notes-textarea:focus { border-color: var(--blue-bright); box-shadow: 0 0 0 2px rgba(43,143,255,0.12); }

.btn-save {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  border: none;
  border-radius: 8px;
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.btn-save:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(43,143,255,0.3); }

/* ── CRM feature styles ── */
.panel-inline-input {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  padding: 4px 10px;
  width: 100%;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.15s;
}
.panel-inline-input:focus { outline: none; border-color: var(--accent); }

/* Notes */
.panel-notes-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.panel-note-item {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  position: relative;
}
.panel-note-text { font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
.panel-note-ts { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
.panel-note-delete {
  position: absolute; top: 8px; right: 8px;
  background: none; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 12px; padding: 4px 5px;
  border-radius: 4px; transition: color 0.1s, background 0.1s;
}
.panel-note-delete:hover { color: var(--red); background: rgba(var(--error-rgb),0.08); }
.panel-add-note textarea {
  width: 100%; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 8px 10px; resize: vertical; min-height: 60px;
  transition: border-color 0.15s;
}
.panel-add-note textarea:focus { outline: none; border-color: var(--accent); }
.btn-add-note {
  margin-top: 6px; background: rgba(var(--accent-rgb),0.12); border: 1px solid rgba(var(--accent-rgb),0.25);
  color: var(--accent); border-radius: var(--radius-sm); padding: 6px 14px;
  font-size: 12px; cursor: pointer; font-family: 'Inter',sans-serif; transition: var(--transition);
}
.btn-add-note:hover { background: rgba(var(--accent-rgb),0.2); }

/* Tasks */
.panel-tasks-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.panel-task-item {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.panel-task-item.done { opacity: 0.55; }
.panel-task-check { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0; }
.panel-task-text { flex: 1; font-size: 13px; color: var(--text-primary); }
.panel-task-item.done .panel-task-text { text-decoration: line-through; color: var(--text-muted); }
.panel-task-due {
  font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 20px;
  background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--border);
  white-space: nowrap; flex-shrink: 0;
}
.panel-task-due.overdue { background: rgba(var(--error-rgb),0.1); color: var(--red); border-color: rgba(var(--error-rgb),0.25); }
.panel-task-due.today { background: rgba(var(--warning-rgb),0.1); color: var(--orange); border-color: rgba(var(--warning-rgb),0.25); }
.panel-task-delete {
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-size: 12px; padding: 4px 5px; border-radius: 4px; transition: color 0.1s;
}
.panel-task-delete:hover { color: var(--red); }
.panel-add-task { display: flex; gap: 6px; align-items: center; }
.panel-add-task input[type="text"] {
  flex: 1; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 10px; transition: border-color 0.15s;
}
.panel-add-task input[type="text"]:focus { outline: none; border-color: var(--accent); }
.panel-add-task input[type="date"] {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-secondary); font-family: 'Inter',sans-serif;
  font-size: 12px; padding: 7px 8px; width: 130px; transition: border-color 0.15s;
}
.panel-add-task input[type="date"]:focus { outline: none; border-color: var(--accent); }
.btn-add-task {
  background: rgba(var(--accent-rgb),0.12); border: 1px solid rgba(var(--accent-rgb),0.25);
  color: var(--accent); border-radius: var(--radius-sm); padding: 7px 14px;
  font-size: 14px; cursor: pointer; font-family: 'Inter',sans-serif; transition: var(--transition);
}
.btn-add-task:hover { background: rgba(var(--accent-rgb),0.22); }

/* Calls */
.panel-calls-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.panel-call-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 9px 12px;
}
.panel-call-icon { font-size: 14px; margin-top: 1px; flex-shrink: 0; color: var(--accent-bright); display: flex; align-items: center; }
.panel-call-body { flex: 1; min-width: 0; }
.panel-call-meta { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.panel-call-note { font-size: 13px; color: var(--text-primary); line-height: 1.4; }
.panel-log-call { display: flex; gap: 6px; align-items: center; }
.panel-log-call input[type="number"] {
  width: 70px; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 8px; transition: border-color 0.15s;
}
.panel-log-call input[type="text"] {
  flex: 1; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 10px; transition: border-color 0.15s;
}
.panel-log-call input:focus { outline: none; border-color: var(--accent); }
.btn-log-call {
  background: rgba(var(--success-rgb),0.1); border: 1px solid rgba(var(--success-rgb),0.25);
  color: var(--green); border-radius: var(--radius-sm); padding: 7px 14px;
  font-size: 12px; cursor: pointer; font-family: 'Inter',sans-serif;
  white-space: nowrap; transition: var(--transition);
}
.btn-log-call:hover { background: rgba(var(--success-rgb),0.2); }

/* Afspraak Resultaat */
.afspraak-result { display: flex; flex-direction: column; gap: 10px; }
.afspraak-toggle-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.afspraak-toggle-row { display: flex; gap: 8px; }
.afspraak-btn {
  flex: 1; padding: 9px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card-alt);
  color: var(--text-secondary); font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: 'Inter', sans-serif; transition: var(--transition);
  text-align: center;
}
.afspraak-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
.afspraak-btn.active-yes { background: rgba(var(--success-rgb),0.12); border-color: rgba(var(--success-rgb),0.4); color: var(--green); }
.afspraak-btn.active-no  { background: rgba(var(--error-rgb),0.1);  border-color: rgba(var(--error-rgb),0.35); color: var(--red); }
.afspraak-value-row { display: flex; flex-direction: column; gap: 4px; }
.afspraak-value-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.afspraak-notitie {
  width: 100%; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter', sans-serif;
  font-size: 13px; padding: 8px 10px; resize: vertical; min-height: 56px; transition: border-color 0.15s;
}
.afspraak-notitie:focus { outline: none; border-color: var(--accent); }
.afspraak-status-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
}
.afspraak-status-chip.yes { background: rgba(var(--success-rgb),0.12); color: var(--green); border: 1px solid rgba(var(--success-rgb),0.25); }
.afspraak-status-chip.no  { background: rgba(var(--error-rgb),0.1);  color: var(--red);   border: 1px solid rgba(var(--error-rgb),0.2); }

/* Taken widget */
.taken-widget { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; }
.taken-widget-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.taken-widget-title { font-size: 13px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em; }
.taken-widget-count { font-size: 11px; font-weight: 700; background: rgba(var(--error-rgb),0.15); color: var(--red); padding: 2px 8px; border-radius: 20px; }
.taken-widget-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px 0; }
.taken-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: var(--radius-sm);
  background: var(--bg-card-alt); border: 1px solid var(--border);
  cursor: pointer; margin-bottom: 6px; transition: border-color 0.15s;
}
.taken-item:hover { border-color: var(--accent); }
.taken-item.overdue { border-color: rgba(var(--error-rgb),0.3); background: rgba(var(--error-rgb),0.04); }
.taken-item-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); flex-shrink: 0; }
.taken-item.overdue .taken-item-dot { background: var(--red); }
.taken-item-body { flex: 1; min-width: 0; }
.taken-item-text { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.taken-item-lead { font-size: 11px; color: var(--text-muted); }
.taken-item-due { font-size: 11px; font-weight: 600; color: var(--orange); white-space: nowrap; flex-shrink: 0; }
.taken-item.overdue .taken-item-due { color: var(--red); }

/* ── Nav badge (new-lead notification) ── */
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  margin-left: auto;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

/* ── Status select in detail panel ── */
.status-select {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Inter', sans-serif;
  padding: 5px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color .15s;
}
.status-select:focus { border-color: var(--blue-bright); }

/* ── WhatsApp conversation bubbles ── */
.chat-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}
.chat-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.chat-bubble.user {
  align-self: flex-start;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-bottom-left-radius: 3px;
  color: var(--text-primary);
}
.chat-bubble.ai {
  align-self: flex-end;
  background: rgba(30,111,217,0.18);
  border: 1px solid rgba(30,111,217,0.3);
  border-bottom-right-radius: 3px;
  color: var(--text-primary);
}
.chat-bubble.ai.manual {
  background: rgba(var(--accent-rgb),0.18);
  border-color: rgba(var(--accent-rgb),0.4);
}
.panel-score-pills {
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end;
  max-width: 65%;
}
.score-pill {
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 99px;
  white-space: nowrap;
}
.score-pill.sp-strong { background: rgba(var(--success-rgb),.14); color: var(--green); border: 1px solid rgba(var(--success-rgb),.3); }
.score-pill.sp-medium { background: rgba(var(--warning-rgb),.14); color: var(--warning);     border: 1px solid rgba(var(--warning-rgb),.3); }
.score-pill.sp-weak   { background: rgba(239,68,68,.14); color: var(--red);   border: 1px solid rgba(239,68,68,.3); }
.score-pill.sp-neutral{ background: var(--bg-card-alt); color: var(--text-muted); border: 1px solid var(--border); }

.panel-suggest-row {
  margin-top: 10px; display: flex; flex-direction: column; gap: 8px;
}
.panel-suggest-btn {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(var(--accent-rgb),.12); border: 1px solid rgba(var(--accent-rgb),.3);
  color: var(--accent-bright); padding: 6px 12px; border-radius: 7px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all .15s ease; font-family: inherit;
}
.panel-suggest-btn:hover { background: rgba(var(--accent-rgb),.22); }
.panel-suggest-btn:disabled { opacity: .55; cursor: wait; }
.panel-suggest-chips {
  display: flex; flex-direction: column; gap: 6px;
}
.panel-suggest-chip {
  text-align: left; cursor: pointer;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-left: 3px solid var(--accent-bright);
  border-radius: 8px; padding: 9px 12px;
  font-size: 12px; line-height: 1.5; color: var(--text-primary);
  font-family: inherit; transition: all .15s ease;
}
.panel-suggest-chip:hover {
  background: rgba(var(--accent-rgb),.08); border-color: var(--accent-bright);
  transform: translateX(2px);
}
/* ── Takeover bar (AI actief vs Mens aan het roer) ── */
.panel-takeover-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 10px; padding: 8px 10px;
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px;
}
.panel-takeover-status {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  padding: 3px 9px; border-radius: 99px; white-space: nowrap;
}
.panel-takeover-status.active { background: rgba(var(--success-rgb),.14); color: var(--green); border: 1px solid rgba(var(--success-rgb),.3); }
.panel-takeover-status.paused { background: rgba(var(--warning-rgb),.14); color: var(--warning);    border: 1px solid rgba(var(--warning-rgb),.3); }
.panel-takeover-meta { font-size: 11px; color: var(--text-muted); }
.panel-takeover-escalated {
  font-size: 11px; font-weight: 600; color: var(--red);
  background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3);
  padding: 3px 9px; border-radius: 99px; cursor: help;
}
.panel-takeover-btn {
  margin-left: auto; border: none; border-radius: 7px; padding: 6px 12px;
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: opacity .15s ease;
}
.panel-takeover-btn.pause  { background: rgba(var(--warning-rgb),.16); color: var(--warning); border: 1px solid rgba(var(--warning-rgb),.35); }
.panel-takeover-btn.resume { background: rgba(var(--success-rgb),.16);  color: var(--green); border: 1px solid rgba(var(--success-rgb),.35); }
.panel-takeover-btn:hover { opacity: .85; }
.panel-takeover-btn:disabled { opacity: .5; cursor: wait; }

.panel-reply-row {
  display: flex; gap: 8px; margin-top: 10px; align-items: flex-end;
}
.panel-reply-row-paused .panel-reply-input {
  border-color: rgba(var(--warning-rgb),.5); box-shadow: 0 0 0 1px rgba(var(--warning-rgb),.15);
}
.panel-reply-input {
  flex: 1; padding: 10px 12px; background: var(--bg-card-alt);
  border: 1px solid var(--border); border-radius: 10px;
  color: var(--text-primary); font-size: 13px; font-family: inherit;
  resize: vertical; min-height: 44px; max-height: 160px; outline: none;
}
.panel-reply-input:focus { border-color: var(--accent-bright); }
.panel-reply-send {
  background: var(--success);
  border: none; border-radius: 10px; padding: 10px 16px;
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  transition: opacity 0.15s ease;
}
.panel-reply-send:hover { opacity: 0.9; }
.panel-reply-send:disabled { opacity: 0.5; cursor: not-allowed; }
.chat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: .8px;
}

/* ── Chart container ── */
.charts-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  align-items: flex-start;
}
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  flex: 1;
  min-width: 0;
}
.chart-card-sm {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  width: 260px;
  flex-shrink: 0;
}
.chart-title {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 16px;
}

/* ── Actie Nodig widget (waFailed + escalated) ── */
.nb-widget {
  background: var(--bg-card);
  border: 1px solid rgba(var(--error-rgb),0.35);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.nb-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.nb-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--red);
}
.nb-count {
  background: rgba(var(--error-rgb),0.15); color: var(--red);
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px; border: 1px solid rgba(var(--error-rgb),0.3);
}
.nb-list { display: flex; flex-direction: column; gap: 8px; }
.nb-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-card-alt); border-radius: 10px;
  padding: 10px 12px; cursor: pointer; transition: background .15s;
}
.nb-item:hover { background: var(--bg-card-hover, rgba(255,255,255,.04)); }
.nb-item-info { flex: 1; min-width: 0; }
.nb-item-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.nb-item-sub  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.nb-item-tag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
  padding: 2px 7px; border-radius: 99px; white-space: nowrap; margin-right: 2px;
}
.nb-item-tag.tag-waFailed   { background: rgba(var(--error-rgb),.14);  color: var(--red); border: 1px solid rgba(var(--error-rgb),.3); }
.nb-item-tag.tag-escalated { background: rgba(var(--warning-rgb),.14); color: var(--orange); border: 1px solid rgba(var(--warning-rgb),.3); }
.nb-call-btn {
  display: flex; align-items: center; gap: 5px; padding: 6px 12px;
  background: rgba(var(--error-rgb),0.1); border: 1px solid rgba(var(--error-rgb),0.3);
  border-radius: 8px; color: var(--red); font-size: 12px; font-weight: 600;
  text-decoration: none; white-space: nowrap; transition: background 0.15s;
}
.nb-call-btn:hover { background: rgba(var(--error-rgb),0.2); }

.followup-widget {
  background: var(--bg-card);
  border: 1px solid rgba(var(--warning-rgb),0.35);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.followup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.followup-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--orange);
}
.followup-count {
  background: rgba(var(--warning-rgb),0.15);
  color: var(--orange);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  border: 1px solid rgba(var(--warning-rgb),0.3);
}
.followup-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.followup-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.followup-item:hover { border-color: var(--orange); }
.followup-item-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
.followup-item-meta { font-size: 11px; color: var(--text-muted); }
.followup-item-score { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--orange); }
.followup-call-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 7px;
  background: rgba(var(--warning-rgb),0.12);
  border: 1px solid rgba(var(--warning-rgb),0.3);
  color: var(--orange);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.followup-call-btn:hover { background: rgba(var(--warning-rgb),0.22); }

/* ── Top Leads Strip ── */
.top-leads-strip {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.top-leads-strip-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.top-leads-strip-title svg { color: var(--orange); }
.top-leads-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.top-lead-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
  font-size: 13px;
}
.top-lead-chip:hover { border-color: var(--accent); }
.top-lead-chip-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--on-accent);
}
.top-lead-chip-name { font-weight: 600; color: var(--text); }
.top-lead-chip-score { font-weight: 700; color: var(--accent); font-variant-numeric: tabular-nums; font-size:12px; }

/* ── Today widget ── */
.today-widget {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 20px;
}
.today-widget-title {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.today-apt {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.today-apt:last-child { border-bottom: none; }
.today-apt-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--blue-bright);
  min-width: 48px;
  flex-shrink: 0;
}
.today-apt-name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.today-apt-type {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.today-empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* ── Nav badge ── */
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--blue-primary);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 700;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Calendar weekend columns ── */
.cal-day-col.cal-weekend-col { background: rgba(0,0,0,0.06); }
[data-theme="light"] .cal-day-col.cal-weekend-col { background: rgba(0,0,0,0.03); }

/* ── Calendar event modal ── */
.cal-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 2000;
  align-items: center;
  justify-content: center;
}
.cal-modal-overlay.open { display: flex; }
.cal-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--elev-3);
  overflow: hidden;
  animation: modal-in 0.2s cubic-bezier(0.4,0,0.2,1);
}
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.cal-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.cal-modal-header-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.cal-modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  transition: var(--transition);
}
.cal-modal-close:hover { background: rgba(255,255,255,0.08); color: var(--text-primary); }
.cal-modal-body { padding: 16px 20px 20px; }
.cal-modal-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.cal-modal-row:last-of-type { border-bottom: none; }
.cal-modal-row-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  min-width: 64px;
  padding-top: 1px;
}
.cal-modal-row-val { color: var(--text-primary); flex: 1; }
.cal-modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.cal-modal-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: var(--transition);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cal-modal-btn-primary {
  background: var(--blue-primary);
  color: var(--on-accent);
}
.cal-modal-btn-primary:hover { background: var(--blue-bright); }
.cal-modal-btn-secondary {
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary);
  border: 1px solid var(--border-bright);
}
.cal-modal-btn-secondary:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.cal-modal-btn-danger {
  background: rgba(var(--error-rgb),0.1);
  color: var(--red);
  border: 1px solid rgba(var(--error-rgb),0.25);
}
.cal-modal-btn-danger:hover { background: rgba(var(--error-rgb),0.2); }

/* ── Admin client cards ── */
.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.admin-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: border-color .2s, transform .15s;
}
.admin-card:hover { border-color: var(--blue-primary); transform: translateY(-2px); }
.admin-card-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.admin-card-code { font-size: 11px; color: var(--text-muted); letter-spacing: 1px; margin-bottom: 14px; }
.admin-card-stats { display: flex; gap: 16px; }
.admin-stat { text-align: center; }
.admin-stat-val { font-size: 22px; font-weight: 700; color: var(--blue-bright); }
.admin-stat-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.check-yes { color: var(--green); }
.check-no { color: var(--red); }

.ai-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 12px;
  background: rgba(var(--accent-rgb), 0.06);
  border-left: 3px solid var(--blue-primary);
  border-radius: 0 8px 8px 0;
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
.toast-container {
  position: fixed;
  /* Lifted clear of the help launcher, which now owns the bottom-right
     corner (24px + 54px button + 12px gap). Toasts stack upward from
     here, so the two never overlap. */
  bottom: 90px;
  right: 24px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
@media (max-width: 520px) {
  .toast-container { bottom: 82px; right: 16px; left: 16px; }
}

.toast {
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  min-width: 280px;
  max-width: 360px;
  box-shadow: var(--elev-2);
  pointer-events: all;
  position: relative;
  overflow: hidden;
  animation: toastIn 0.35s var(--ease-spring) both;
}

.toast.dismissing { animation: toastOut 0.3s ease forwards; }

@keyframes toastIn {
  from { opacity: 0; transform: translateX(100%) scale(0.9); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateX(0) scale(1); max-height: 200px; }
  to { opacity: 0; transform: translateX(100%) scale(0.9); max-height: 0; padding: 0; margin: 0; }
}

.toast-success { border-left: 3px solid var(--green); }
.toast-error { border-left: 3px solid var(--red); }
.toast-info { border-left: 3px solid var(--blue-bright); }

.toast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.toast-title {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toast-success .toast-title { color: var(--green); }
.toast-error .toast-title { color: var(--red); }
.toast-info .toast-title { color: var(--blue-bright); }

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 14px;
  padding: 2px;
  transition: color 0.2s;
  line-height: 1;
}

.toast-close:hover { color: var(--text-primary); }

.toast-message { font-size: 13px; color: var(--text-secondary); }

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 0 0 12px 12px;
  animation: toastProgress 3.5s linear forwards;
}

.toast-success .toast-progress { background: var(--green); }
.toast-error .toast-progress { background: var(--red); }
.toast-info .toast-progress { background: var(--blue-bright); }

@keyframes toastProgress {
  from { width: 100%; }
  to { width: 0%; }
}

/* ============================================================
   EXPORTS PAGE
   ============================================================ */
.exports-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.export-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out);
}

.export-card:hover {
  border-color: var(--border-bright);
  transform: translateY(-2px);
  box-shadow: var(--elev-1);
}

.export-filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.export-filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.export-filter-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.export-select {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  padding: 7px 28px 7px 10px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.export-select:focus { border-color: var(--accent); }
.export-preview-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-card-alt);
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.export-preview-count #export-count-num {
  font-weight: 700;
  color: var(--accent);
}
/* "Featured" used to mean flood-filling the whole card with sand — heavy,
   and the accent-coloured title (.gradient-text) went unreadable against
   an accent-coloured card (same colour on itself). Sand should mark this
   card as primary without becoming its surface: a solid border plus a
   solid-fill icon (icons are an explicitly allowed sand use) does that
   while keeping the card on the same quiet surface as its siblings. */
.export-card-featured {
  border: 1.5px solid var(--accent) !important;
  background: var(--bg-card) !important;
}
.export-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(var(--accent-rgb),0.12);
  border: 1px solid rgba(var(--accent-rgb),0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: var(--accent);
}
.export-card-featured .export-card-icon {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.export-includes {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 14px 0 18px;
}
.export-include-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.export-include-item svg { color: var(--green); flex-shrink: 0; }
.export-card { display: flex; flex-direction: column; }
.export-snapshot {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
.export-snap-item {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
}
.export-snap-val {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 4px;
}
.export-snap-label {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
}
.export-card-stats {
  grid-column: span 1;
}
.export-card-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}

.export-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}

.rapport-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.rapport-stat {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.rapport-stat-value {
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  font-weight: 700;
  color: var(--cyan);
  margin-bottom: 4px;
}

.rapport-stat-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.rapport-leads-list { margin-top: 16px; }

.rapport-lead-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.rapport-lead-item:last-child { border-bottom: none; }

/* ============================================================
   PIPELINE (KANBAN)
   ============================================================ */
    .pipeline-header-bar {
      padding: 0 24px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pipeline-summary-chips {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pipeline-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .pipeline-chip-count {
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent);
    }
.pipeline-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
  min-height: calc(100vh - 180px);
  align-items: flex-start;
}
.pipeline-board::-webkit-scrollbar { height: 6px; }
.pipeline-board::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.35); border-radius: 3px; }
.pipeline-col {
  flex: 0 0 260px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pipeline-col-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
}
.pipeline-col-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  padding: 0 5px;
}
.pipeline-col-body {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 80px;
}
.pipeline-card {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.pipeline-card:hover {
  border-color: var(--blue-primary);
  transform: translateY(-1px);
}
    .pipeline-card[draggable="true"] { cursor: grab; }
    .pipeline-card[draggable="true"]:active { cursor: grabbing; opacity: 0.7; }
    .pipeline-col.drag-over {
      background: rgba(var(--accent-rgb),0.08);
      border-color: rgba(var(--accent-rgb),0.4) !important;
      outline: 2px dashed rgba(var(--accent-rgb),0.4);
      outline-offset: -4px;
    }
.pipeline-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pipeline-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pipeline-score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.pipeline-card-phone {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 5px;
}
.pipeline-card-date {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}
.pipeline-col-header.col-new    { border-top: 2px solid #8b949e; }
.pipeline-col-header.col-qual   { border-top: 2px solid var(--cyan); }
.pipeline-col-header.col-apt    { border-top: 2px solid var(--green); }
.pipeline-col-header.col-won    { border-top: 2px solid var(--accent); }
.pipeline-col-header.col-lost   { border-top: 2px solid var(--red); }

/* ============================================================
   GESPREKKEN (CONVERSATIONS)
   ============================================================ */
.conv-layout {
  display: flex;
  gap: 0;
  height: calc(100vh - 130px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.conv-list {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.conv-list-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.conv-list-item {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.12s;
}
.conv-list-item:hover { background: var(--bg-card-alt); }
.conv-list-item.active { background: rgba(var(--accent-rgb),0.08); border-left: 3px solid var(--accent); }
.conv-list-item-name {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.conv-list-item-date { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.conv-list-item-preview { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.conv-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  max-width: 80%;
  word-break: break-word;
  margin-bottom: 4px;
}
.conv-bubble.user {
  background: var(--accent);
  color: var(--on-accent);
  margin-left: auto;
  border-bottom-right-radius: 4px;
}
.conv-bubble.assistant {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.conv-bubble-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.conv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.conv-header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
}
.conv-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--text-muted);
  font-size: 14px;
}
.conv-empty-icon { opacity: 0.3; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }

/* ============================================================
   ANALYSE (ANALYTICS)
   ============================================================ */
.analyse-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  width: 100%;
  overflow: visible;
}
.analyse-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px;
}
.analyse-card-full  { grid-column: 1 / -1; }
.analyse-card-span2 { grid-column: span 2; }
.analyse-card-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.funnel-step {
  margin-bottom: 12px;
}
.funnel-step-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.funnel-step-label strong { color: var(--text-primary); font-weight: 700; }
.funnel-step-pct {
  font-size: 11px;
  color: var(--text-muted);
}
.funnel-bar {
  height: 10px;
  background: var(--bg-card-alt);
  border-radius: 5px;
  overflow: hidden;
}
.funnel-bar-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--blue-primary), var(--cyan));
  transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
}
.source-table { width: 100%; border-collapse: collapse; }
.source-table th {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 6px 10px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.source-table td {
  font-size: 13px;
  color: var(--text-primary);
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.source-table tr:last-child td { border-bottom: none; }
.analyse-stat-big {
  font-variant-numeric: tabular-nums;
  font-size: 36px;
  font-weight: 800;
  color: var(--cyan);
  line-height: 1;
  margin-bottom: 6px;
  text-shadow: 0 0 20px rgba(6,182,212,0.35);
}
.analyse-stat-label {
  font-size: 12px;
  color: var(--text-muted);
}
.analyse-revenue-row {
  display: flex;
  gap: 16px;
  width: 100%;
  margin-bottom: 16px;
}
.analyse-revenue-card {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.analyse-revenue-val {
  font-variant-numeric: tabular-nums;
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.analyse-revenue-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-top: 6px;
}
.analyse-revenue-sub {
  font-size: 11px;
  color: var(--text-muted);
}
.analyse-verlies-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.analyse-verlies-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}
.analyse-verlies-count {
  font-weight: 700;
  color: var(--text-primary);
}

/* ============================================================
   ROW QUICK ACTIONS (Feature 2)
   ============================================================ */
.row-actions { display: flex; gap: 4px; align-items: center; opacity: 0; transition: opacity 0.15s; }
.leads-table tr:hover .row-actions { opacity: 1; }

/* Touch devices have no hover — without this the call/WhatsApp quick-action
   icons are permanently invisible (opacity: 0 with no way to trigger it),
   so a phone user has no way to know they exist. Same fix as .copy-btn above. */
@media (hover: none) {
  .row-actions { opacity: 0.65; }
}

.row-action-btn {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--bg-card-alt); cursor: pointer; display: flex;
  align-items: center; justify-content: center; font-size: 13px;
  text-decoration: none; color: var(--text-secondary); transition: var(--transition);
}
.row-action-btn:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.1); }

/* ============================================================
   PANEL QUICK ACTIONS (Feature 3)
   ============================================================ */
.panel-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.panel-quick-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card-alt);
  color: var(--text-primary); font-size: 12px; font-weight: 500;
  text-decoration: none; cursor: pointer; transition: var(--transition);
  font-family: 'Inter', sans-serif;
}
.panel-quick-btn:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.08); color: var(--accent); }

/* ============================================================
   LEAD AGE BADGES (Feature 4)
   ============================================================ */
.age-chip {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 20px;
  border: 1px solid var(--border);
}
.age-chip.fresh { display: none; }
.age-chip.warm { background: rgba(var(--success-rgb),0.1); color: var(--green); border-color: rgba(var(--success-rgb),0.2); }
.age-chip.cooling { background: rgba(var(--warning-rgb),0.1); color: var(--orange); border-color: rgba(var(--warning-rgb),0.2); }
.age-chip.cold { background: rgba(var(--error-rgb),0.1); color: var(--red); border-color: rgba(var(--error-rgb),0.2); }
.age-badge-table {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle;
}
.age-badge-warm { background: rgba(var(--success-rgb),0.12); color: var(--green); }
.age-badge-cooling { background: rgba(var(--warning-rgb),0.12); color: var(--orange); }
.age-badge-cold { background: rgba(var(--error-rgb),0.12); color: var(--red); }

/* ============================================================
   REVENUE GOAL CARD (Feature 5)
   ============================================================ */
.revenue-goal-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px 20px; margin-bottom: 16px;
  position: relative; overflow: hidden;
}
.revenue-goal-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: var(--accent);
}
.revenue-goal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.revenue-goal-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.revenue-goal-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.revenue-goal-edit { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.5; transition: opacity 0.15s; }
.revenue-goal-edit:hover { opacity: 1; }
.revenue-goal-amounts { display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px; }
.revenue-goal-current { font-size: 28px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.revenue-goal-slash { font-size: 18px; color: var(--text-muted); }
.revenue-goal-target { font-size: 16px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.revenue-goal-bar-wrap { height: 6px; background: var(--bg-card-alt); border-radius: 3px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border); }
.revenue-goal-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), var(--blue-bright)); transition: width 0.6s cubic-bezier(0.4,0,0.2,1); }
.revenue-goal-pct { font-size: 12px; color: var(--text-secondary); }

/* ============================================================
   INSTELLINGEN (SETTINGS)
   ============================================================ */
/* ── Formulier page ───────────────────────────────────────────────────── */
.fm-wrap { width: 100%; padding: 24px 0; display: flex; flex-direction: column; gap: 18px; }

/* Form stats */
.fm-stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.fm-stat-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 4px;
}
.fm-stat-num {
  font-size: 28px; font-weight: 700; color: var(--text-primary);
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.fm-stat-lbl {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .04em;
}
.fm-stat-delta {
  font-size: 11px; color: var(--text-muted); margin-top: 4px; min-height: 14px;
}
.fm-stat-delta.up   { color: var(--green); }
.fm-stat-delta.down { color: var(--red); }

/* Code actions row (Kopieer + Stuur naar developer side by side) */
.fm-code-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.fm-code-actions .fm-btn { flex: 1; min-width: 130px; }

.fm-hero {
  background: rgba(var(--accent-rgb),.06);
  border: 1px solid rgba(var(--accent-rgb),.2); border-radius: 16px; padding: 24px 26px;
}
.fm-hero-top { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
.fm-hero-icon { font-size: 32px; line-height: 1; }
.fm-hero-text { flex: 1; min-width: 0; }
.fm-hero-title { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-primary); }
.fm-hero-sub { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
.fm-url-row { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; margin-bottom: 12px; }
.fm-url {
  flex: 1; min-width: 220px; padding: 11px 14px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  color: var(--accent-bright); font-family: monospace; font-size: 13px;
  display: flex; align-items: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.fm-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 9px; color: var(--text-primary); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .15s ease; font-family: inherit; text-decoration: none;
}
.fm-btn:hover { border-color: var(--accent-bright); }
.fm-btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-bright)); border-color: transparent; color: var(--on-accent); }
.fm-btn-primary:hover { opacity: .9; }
.fm-btn-full { width: 100%; justify-content: center; margin-top: 8px; }

.fm-share-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fm-share-lbl { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.fm-share-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 11px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 7px; color: var(--text-muted); font-size: 12px; font-weight: 600;
  text-decoration: none; cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.fm-share-btn:hover { color: var(--accent-bright); border-color: var(--accent-bright); }
.fm-share-btn[id="fm-share-wa"]:hover     { color: #25d366; border-color: #25d366; }
.fm-share-btn[id="fm-share-linkedin"]:hover { color: #0a66c2; border-color: #0a66c2; }

.fm-options-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
  gap: 16px;
}
.fm-option-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px 22px; display: flex; flex-direction: column;
}
.fm-option-hdr { margin-bottom: 12px; position: relative; }
.fm-option-rec {
  position: absolute; top: -6px; right: -6px;
  background: rgba(var(--success-rgb),.15); color: var(--green);
  font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 99px;
  text-transform: uppercase; letter-spacing: .04em;
  border: 1px solid rgba(var(--success-rgb),.3);
}
.fm-option-title { font-size: 15px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.fm-option-sub { font-size: 12px; color: var(--text-muted); line-height: 1.55; margin: 0; }
.fm-code {
  width: 100%; padding: 11px 12px; background: var(--bg-card-alt);
  border: 1px solid var(--border); border-radius: 8px;
  color: var(--text-primary); font-family: monospace; font-size: 12px; line-height: 1.5;
  resize: none; outline: none; white-space: pre;
}
.fm-code:focus { border-color: var(--accent-bright); }
.fm-instructions {
  margin-top: 12px; font-size: 11px; color: var(--text-muted); line-height: 1.55;
  padding: 10px 12px; background: var(--bg-card-alt); border-radius: 8px;
  border-left: 3px solid var(--accent-bright);
}
.fm-instructions strong { color: var(--text-primary); }
.fm-instructions code {
  background: rgba(var(--accent-rgb),.12); color: var(--accent-bright);
  padding: 1px 5px; border-radius: 4px; font-size: 11px;
}

/* Installation guide accordion */
.fm-guide-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 22px 24px;
}
.fm-guide-hdr { margin-bottom: 12px; }
.fm-guide-item {
  border-top: 1px solid var(--border);
  margin: 0 -24px;
}
.fm-guide-item:last-of-type { border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.fm-guide-item summary {
  cursor: pointer; list-style: none;
  padding: 14px 24px;
  display: flex; align-items: center; gap: 10px;
  user-select: none;
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  transition: background .15s ease;
}
.fm-guide-item summary::-webkit-details-marker { display: none; }
.fm-guide-item summary::after {
  content: ''; margin-left: auto;
  width: 8px; height: 8px;
  border-right: 2px solid var(--text-muted); border-bottom: 2px solid var(--text-muted);
  transform: rotate(-45deg); transition: transform .2s ease;
}
.fm-guide-item[open] summary::after { transform: rotate(45deg); }
.fm-guide-item summary:hover { background: var(--bg-card-alt); }
.fm-guide-item[open] summary { background: rgba(var(--accent-rgb),.06); color: var(--accent-bright); }
.fm-guide-emoji { font-size: 18px; line-height: 1; }
.fm-guide-label { flex: 1; }
.fm-guide-meta { font-size: 11px; font-weight: 500; color: var(--text-muted); font-style: italic; }
.fm-guide-body {
  padding: 4px 24px 20px;
  font-size: 13px; color: var(--text-primary); line-height: 1.65;
}
.fm-guide-body p { margin: 8px 0; }
.fm-guide-body p strong { color: var(--text-primary); }
.fm-guide-body ol { padding-left: 22px; margin: 8px 0; }
.fm-guide-body ol li { margin-bottom: 6px; color: var(--text-primary); }
.fm-guide-body ol li strong { color: var(--accent-bright); font-weight: 600; }
.fm-guide-body code {
  background: var(--bg-card-alt); color: var(--accent-bright);
  padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: monospace;
}
.fm-guide-tip {
  margin-top: 12px; padding: 10px 14px; border-radius: 8px;
  background: rgba(var(--warning-rgb),.08); border-left: 3px solid var(--warning);
  font-size: 12px; color: var(--text-primary); line-height: 1.55;
}
.fm-guide-tip strong { color: var(--warning); font-weight: 700; }
.fm-guide-test {
  margin-top: 14px; padding: 14px 16px;
  background: rgba(var(--success-rgb),.08); border: 1px solid rgba(var(--success-rgb),.25);
  border-radius: 10px;
  font-size: 13px; color: var(--text-primary); line-height: 1.6;
}
.fm-guide-test strong { display: block; color: var(--green); margin-bottom: 4px; font-weight: 700; }

.fm-bottom-grid {
  display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start;
}
@media (max-width: 900px) { .fm-bottom-grid { grid-template-columns: 1fr; } }
.fm-qr-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px; display: flex; flex-direction: column; align-items: stretch;
}
.fm-qr-frame {
  background: #fff; padding: 16px; border-radius: 12px; margin: 14px 0 8px;
  display: flex; align-items: center; justify-content: center;
}
.fm-preview-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px; display: flex; flex-direction: column;
}
.fm-iframe-wrap {
  margin-top: 12px; height: 560px; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--border); background: var(--bg-card-alt);
}
.fm-iframe-wrap iframe { width: 100%; height: 100%; border: 0; display: block; }

/* ── Onboarding "Klaar!" celebration overlay ──────────────────────────── */
#onb-done-overlay {
  position: fixed; inset: 0;
  background: rgba(8,12,20,.92); backdrop-filter: blur(10px);
  z-index: 2500;
  display: none; align-items: center; justify-content: center;
  padding: 24px;
}
#onb-done-overlay.open { display: flex; animation: onbFade .35s ease; }
@keyframes onbFade { from { opacity: 0; } to { opacity: 1; } }
.onb-done-card {
  width: 100%; max-width: 520px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 18px;
  padding: 36px 32px;
  text-align: center;
  box-shadow: var(--elev-3);
  animation: onbPop .45s cubic-bezier(.34,1.56,.64,1);
}
@keyframes onbPop { from { opacity: 0; transform: translateY(20px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
.onb-done-icon { font-size: 56px; margin-bottom: 12px; animation: onbBounce .8s ease infinite alternate; }
@keyframes onbBounce { from { transform: translateY(0); } to { transform: translateY(-6px); } }
.onb-done-title { margin: 0 0 6px; font-size: 24px; font-weight: 700; color: var(--text-primary); }
.onb-done-sub { margin: 0 0 22px; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
.onb-done-url-card {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; margin-bottom: 20px;
  text-align: left;
}
.onb-done-url-lbl {
  font-size: 10px; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px;
}
.onb-done-url {
  display: block; font-family: monospace; font-size: 13px; color: var(--accent-bright);
  background: var(--bg-primary); padding: 8px 11px; border-radius: 7px;
  margin-bottom: 10px; word-break: break-all;
}
.onb-done-copy {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--accent-bright); border: none; border-radius: 7px;
  padding: 7px 12px; color: var(--on-accent); font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.onb-done-copy:hover { opacity: .9; }
.onb-done-steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; text-align: left; }
.onb-done-step {
  display: flex; align-items: center; gap: 10px;
  background: rgba(var(--accent-rgb),.06); border-radius: 8px; padding: 10px 14px;
  font-size: 13px; color: var(--text-primary);
}
.onb-done-step-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent-bright); color: var(--on-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.onb-done-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.onb-done-btn {
  flex: 1; min-width: 180px; padding: 12px 16px;
  border-radius: 10px; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.onb-done-btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-bright));
  border: none; color: var(--on-accent);
}
.onb-done-btn-primary:hover { opacity: .9; }
.onb-done-btn-secondary {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  color: var(--text-primary);
}
.onb-done-btn-secondary:hover { border-color: var(--accent-bright); color: var(--accent-bright); }

/* ── Dashboard form-link banner ───────────────────────────────────────── */
.dash-formlink {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
  padding: 12px 16px; margin-bottom: 16px;
  flex-wrap: wrap;
}
.dash-formlink-icon { font-size: 20px; line-height: 1; }
.dash-formlink-body { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.dash-formlink-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.dash-formlink-url {
  font-family: monospace; font-size: 12px; color: var(--accent-bright);
  background: var(--bg-card-alt); padding: 5px 9px; border-radius: 6px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: inline-block; max-width: 100%;
}
.dash-formlink-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dash-formlink-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 7px;
  padding: 6px 10px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); text-decoration: none; cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.dash-formlink-btn:hover { color: var(--accent-bright); border-color: var(--accent-bright); }

/* ── Trial banner. Hidden by default (display:none inline in the HTML) —
   only shown once loadPlanStatus() confirms this client is on trial or
   expired. See TRIAL-DESIGN.md and api/leads.js's plan-status mode. Two
   colour states via a modifier class: .trial (accent, informative) and
   .expired (amber, "non-alarming" per TRIAL-DESIGN.md §3 — never red/error
   styling, leads are still being captured). ─────────────────────────────── */
.dash-trial-banner {
  display: flex; align-items: center; gap: 12px;
  border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
  flex-wrap: wrap;
}
.dash-trial-banner.trial {
  background: rgba(var(--accent-rgb), .08); border: 1px solid rgba(var(--accent-rgb), .25);
}
.dash-trial-banner.expired {
  background: rgba(var(--warning-rgb), .08); border: 1px solid rgba(var(--warning-rgb), .25);
}
.dash-trial-banner-icon { font-size: 20px; line-height: 1; }
.dash-trial-banner-body { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.dash-trial-banner-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.dash-trial-banner-sub { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.dash-trial-banner-cta {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  background: var(--accent); color: var(--bg-primary); border: none; border-radius: 7px;
  padding: 8px 14px; font-size: 12px; font-weight: 700;
  text-decoration: none; cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.dash-trial-banner-cta:hover { background: var(--accent-hover); }

/* ── Email-verification banner. Hidden by default (display:none inline) —
   only shown once loadOnboardingChecklist() confirms config-get's
   emailVerified is explicitly false (fails open: absent/blank Airtable
   field or a pre-existing client both read as verified, see api/_verify.js).
   Separate from the onboarding checklist card below on purpose: dismissing
   the checklist is meant to be "I've got the gist, hide the getting-started
   card", but an unverified email is a standing account-recovery risk
   (password-reset is gated on it) — it deserves its own quiet nudge that
   survives a checklist dismiss, not a fully separate visual language, so it
   reuses the trial banner's ".expired" amber treatment (non-alarming, same
   "gentle attention" register per TRIAL-DESIGN.md §3, never red/error). ── */
.dash-verify-banner {
  display: flex; align-items: center; gap: 12px;
  border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
  flex-wrap: wrap;
  background: rgba(var(--warning-rgb), .08); border: 1px solid rgba(var(--warning-rgb), .25);
}
.dash-verify-banner-icon { font-size: 20px; line-height: 1; }
.dash-verify-banner-body { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.dash-verify-banner-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.dash-verify-banner-sub { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.dash-verify-banner-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dash-verify-banner-cta {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--warning-c); color: var(--bg-primary); border: none; border-radius: 7px;
  padding: 8px 14px; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.dash-verify-banner-cta:hover { opacity: .88; }
.dash-verify-banner-cta:disabled { opacity: .5; cursor: not-allowed; }
.dash-verify-banner-close {
  background: none; border: none; color: var(--text-muted); font-size: 18px;
  line-height: 1; cursor: pointer; padding: 4px 6px; border-radius: 6px; font-family: inherit;
}
.dash-verify-banner-close:hover { background: rgba(var(--warning-rgb), .12); color: var(--text-primary); }

/* ── Onboarding checklist card. Hidden by default — loadOnboardingChecklist()
   reveals it only when there is real, derived work left to do, and it hides
   itself again the instant every item is done OR the client dismisses it.
   Card, not a banner strip (this one carries 5 rows), so it borrows the
   stat-card surface treatment (--bg-card / --border / --shadow-card) rather
   than the thin colour-tinted banner style above. ─────────────────────── */
.dash-checklist {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px 20px 8px; margin-bottom: 16px; box-shadow: var(--edge-hi), var(--shadow-card);
}
.dash-checklist-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.dash-checklist-title-wrap { flex: 1; min-width: 160px; }
.dash-checklist-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.dash-checklist-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.dash-checklist-progress-bar {
  width: 120px; height: 6px; border-radius: 999px; background: var(--bg-card-alt);
  overflow: hidden; flex-shrink: 0;
}
.dash-checklist-progress-fill {
  height: 100%; background: var(--grad-gold); border-radius: 999px;
  transition: width var(--dur-base, .25s) var(--ease-out, ease);
}
.dash-checklist-close {
  background: none; border: none; color: var(--text-muted); font-size: 18px;
  line-height: 1; cursor: pointer; padding: 4px 6px; border-radius: 6px; font-family: inherit;
  flex-shrink: 0;
}
.dash-checklist-close:hover { background: var(--bg-card-alt); color: var(--text-primary); }
.dash-checklist-items { display: flex; flex-direction: column; }
.chk-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 0;
  border-top: 1px solid var(--divider);
}
.chk-item[data-accent="blue"]    { --a: var(--c-blue);    --a-soft: var(--c-blue-soft); }
.chk-item[data-accent="gold"]    { --a: var(--c-gold);    --a-soft: var(--c-gold-soft); }
.chk-item[data-accent="purple"]  { --a: var(--c-purple);  --a-soft: var(--c-purple-soft); }
.chk-item[data-accent="cyan"]    { --a: var(--c-cyan);    --a-soft: var(--c-cyan-soft); }
.chk-item[data-accent="emerald"] { --a: var(--c-emerald); --a-soft: var(--c-emerald-soft); }
.chk-item-icon {
  flex: 0 0 auto; width: 26px; height: 26px; display: grid; place-items: center;
  border-radius: 50%; background: var(--a-soft, var(--bg-card-alt)); color: var(--a, var(--text-muted));
  font-size: 13px; font-weight: 700;
}
.chk-item.chk-done .chk-item-icon { background: var(--c-emerald-soft); color: var(--c-emerald); }
.chk-item-body { flex: 1; min-width: 160px; }
.chk-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.chk-item.chk-done .chk-item-title { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--border); }
.chk-item-sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; line-height: 1.4; }
.chk-item-action {
  flex-shrink: 0; background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 12px; font-size: 12px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.chk-item-action:hover { border-color: var(--a, var(--accent-bright)); color: var(--a, var(--accent-bright)); }
.chk-whatsapp {
  display: flex; align-items: flex-start; gap: 12px; padding: 12px 0 14px;
  border-top: 1px solid var(--divider); margin-top: 2px;
}
.chk-whatsapp-icon { flex: 0 0 auto; font-size: 18px; line-height: 1.3; }
.chk-whatsapp-body { flex: 1; min-width: 160px; }
.chk-whatsapp-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.chk-whatsapp-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; line-height: 1.5; }
.chk-whatsapp-action {
  flex-shrink: 0; align-self: center; background: none; border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 12px; font-size: 12px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; font-family: inherit; text-decoration: none; display: inline-flex; align-items: center;
  transition: all .15s ease;
}
.chk-whatsapp-action:hover { border-color: var(--accent-bright); color: var(--accent-bright); }
@media (max-width: 640px) {
  .dash-checklist-head { flex-wrap: wrap; }
  .dash-checklist-progress-bar { order: 3; width: 100%; }
  .chk-item { flex-wrap: wrap; }
  .chk-item-action { margin-left: 38px; }
}

/* ── "Vertel over je bedrijf" modal — reuses the founder-modal-overlay
   visual language (dim scrim + centered elevated panel) already used for
   the pipeline/goal modals, so this doesn't invent a second modal system. */
.chk-biz-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 950;
  display: none; align-items: center; justify-content: center; padding: 20px;
}
.chk-biz-modal-overlay.open { display: flex; }
.chk-biz-modal {
  background: var(--card-elevated); border: 1px solid var(--border); border-radius: 16px;
  padding: 26px 26px 20px; width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto;
  box-shadow: var(--elev-3);
}
.chk-biz-modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.chk-biz-modal-intro { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px; }
.chk-biz-field { margin-bottom: 16px; }
.chk-biz-field label { display: block; font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 5px; }
.chk-biz-field-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.chk-biz-field textarea {
  width: 100%; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 12px; font-size: 13px; font-family: inherit; color: var(--text-primary);
  resize: vertical; min-height: 64px; transition: border-color .15s ease;
}
.chk-biz-field textarea:focus { outline: none; border-color: var(--accent); }
.chk-biz-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.chk-biz-cancel {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 18px; font-size: 13px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; font-family: inherit;
}
.chk-biz-save {
  background: linear-gradient(135deg, var(--accent), var(--accent-bright)); border: none; border-radius: 10px;
  padding: 10px 18px; font-size: 13px; font-weight: 700; color: var(--on-accent);
  cursor: pointer; font-family: inherit;
}
.chk-biz-save:disabled { opacity: .6; cursor: not-allowed; }

/* ── AI Persoonlijkheid page ──────────────────────────────────────────── */
.ap-wrap { width: 100%; padding: 24px 0; }
.ap-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 28px; align-items: start; }
@media (max-width: 1100px) { .ap-grid { grid-template-columns: 1fr; } }
.ap-form-col { display: flex; flex-direction: column; gap: 18px; }
.ap-welcome-banner {
  display: flex; gap: 14px; align-items: flex-start;
  background: linear-gradient(135deg, rgba(var(--success-rgb),.10), rgba(var(--success-rgb),.02));
  border: 1px solid rgba(var(--success-rgb),.3); border-radius: 14px;
  padding: 18px 22px; margin-bottom: 18px;
  animation: apWelcomePop .35s ease;
}
@keyframes apWelcomePop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.ap-welcome-icon { font-size: 28px; line-height: 1; }
.ap-welcome-body { flex: 1; min-width: 0; }
.ap-welcome-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.ap-welcome-sub { font-size: 12px; color: var(--text-muted); line-height: 1.55; }
.ap-welcome-sub b { color: var(--text-primary); font-weight: 600; }
.ap-welcome-checks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.ap-welcome-chk {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 9px;
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  transition: all .15s ease;
}
.ap-welcome-chk.done { color: var(--green); border-color: rgba(var(--success-rgb),.4); }
.ap-welcome-chk.done .ap-welcome-chk-icon { color: var(--green); }
.ap-welcome-chk-icon { font-size: 12px; }
.ap-hero { background: rgba(var(--accent-rgb),.06); border: 1px solid rgba(var(--accent-rgb),.2); border-radius: 14px; padding: 22px 24px; }
.ap-hero-title { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-primary); }
.ap-hero-sub { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
.ap-field { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
.ap-label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.ap-label-hint { font-size: 11px; font-weight: 400; color: var(--text-muted); }
.ap-input, .ap-textarea {
  width: 100%; padding: 10px 12px; background: var(--bg-card-alt);
  border: 1px solid var(--border); border-radius: 8px;
  color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none;
  transition: border-color .15s ease;
}
.ap-lang-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ap-lang-opt {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 9px; padding: 9px 13px;
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; transition: all .15s ease;
}
.ap-lang-opt:hover { border-color: var(--accent-bright); }
.ap-lang-opt input[type="radio"] { margin: 0; cursor: pointer; accent-color: var(--accent); }
.ap-lang-opt:has(input:checked) {
  background: rgba(var(--accent-rgb),.15);
  border-color: var(--accent-bright);
  color: var(--accent-bright);
}
.ap-checkbox-row { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-primary); }
.ap-checkbox-row input[type="checkbox"] { margin: 0; cursor: pointer; accent-color: var(--accent); width: 16px; height: 16px; }
.ap-color-row { display: flex; gap: 8px; align-items: stretch; }
.ap-color-input { flex: 1; font-family: monospace; text-transform: uppercase; }
.ap-color-swatch {
  width: 44px; padding: 0; border: 1px solid var(--border); border-radius: 8px;
  background: transparent; cursor: pointer; appearance: none; -webkit-appearance: none;
}
.ap-color-swatch::-webkit-color-swatch-wrapper { padding: 4px; }
.ap-color-swatch::-webkit-color-swatch { border: none; border-radius: 5px; }
.ap-input:focus, .ap-textarea:focus { border-color: var(--accent-bright); }
.ap-textarea { resize: vertical; min-height: 70px; line-height: 1.55; }
.ap-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.5; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ap-hint em { color: var(--text-primary); font-style: normal; font-weight: 600; }
.ap-chip {
  background: rgba(var(--accent-rgb),.12); border: 1px solid rgba(var(--accent-rgb),.25);
  color: var(--accent-bright); padding: 2px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: monospace;
  transition: all .15s ease;
}
.ap-chip:hover { background: rgba(var(--accent-rgb),.25); color: var(--text); }

/* AI photo file picker */
.ap-photo-row {
  display: flex; align-items: center; gap: 16px;
  padding: 4px 0;
}
.ap-photo-preview {
  width: 84px; height: 84px; border-radius: 50%;
  background: var(--bg-card-alt); border: 2px dashed var(--border);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; flex-shrink: 0;
  position: relative;
  transition: border-color .15s ease;
}
.ap-photo-preview.has-photo { border-style: solid; border-color: var(--accent); }
.ap-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
.ap-photo-placeholder {
  font-size: 28px; font-weight: 300; color: var(--text-muted);
}
.ap-photo-controls {
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}
.ap-btn-secondary {
  background: rgba(var(--accent-rgb),.10); color: var(--accent-bright);
  border: 1px solid rgba(var(--accent-rgb),.30); padding: 8px 14px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all .15s ease; font-family: inherit;
}
.ap-btn-secondary:hover { background: rgba(var(--accent-rgb),.20); }
.ap-btn-link {
  background: transparent; color: var(--text-muted); border: 0;
  font-size: 12px; cursor: pointer; padding: 4px 0;
  text-decoration: underline; font-family: inherit;
}
.ap-btn-link:hover { color: var(--red, var(--error)); }
.ap-photo-advanced {
  margin-top: 10px; font-size: 12px;
}
.ap-photo-advanced summary {
  cursor: pointer; color: var(--text-muted); padding: 4px 0;
  user-select: none;
}
.ap-photo-advanced summary:hover { color: var(--accent-bright); }
.ap-photo-advanced[open] summary { margin-bottom: 8px; }

/* Template inspiration library */
.ap-tpl-wrap { margin-bottom: 12px; }
.ap-tpl-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.ap-tpl-title { font-size: 11px; font-weight: 700; color: var(--accent-bright); text-transform: uppercase; letter-spacing: .06em; }
.ap-tpl-sub { font-size: 11px; color: var(--text-muted); }
.ap-tpl-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.ap-tpl-card {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 9px; padding: 10px 12px; cursor: pointer;
  transition: all .15s ease; text-align: left; font-family: inherit;
  display: flex; flex-direction: column; gap: 4px; min-height: 72px;
}
.ap-tpl-card:hover {
  border-color: var(--accent-bright);
  background: rgba(var(--accent-rgb),.06);
  transform: translateY(-1px);
}
.ap-tpl-card.active {
  border-color: var(--accent-bright);
  background: rgba(var(--accent-rgb),.12);
}
.ap-tpl-card.recommended {
  border-color: rgba(var(--success-rgb),.5);
  background: rgba(var(--success-rgb),.05);
  position: relative; padding-top: 22px;
}
.ap-tpl-card-rec {
  position: absolute; top: 4px; left: 8px; right: 8px;
  font-size: 9px; font-weight: 700; color: var(--green);
  text-transform: uppercase; letter-spacing: .04em;
}
.ap-tpl-card-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: var(--text-primary);
}
.ap-tpl-card-emoji { font-size: 13px; }
.ap-tpl-card-preview {
  font-size: 11px; color: var(--text-muted); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ap-actions { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
.ap-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 9px; color: var(--text-primary); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .15s ease; font-family: inherit;
}
.ap-btn:hover { border-color: var(--accent-bright); }
.ap-btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-bright)); border-color: transparent; color: var(--on-accent); }
.ap-btn-primary:hover { opacity: .9; }
.ap-btn:disabled { opacity: .5; cursor: not-allowed; }
.ap-saved-mark { font-size: 12px; color: var(--green); opacity: 0; transition: opacity .25s ease; }
.ap-saved-mark.visible { opacity: 1; }

.ap-preview-col { position: relative; }
.ap-preview-sticky { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 16px; }
.ap-preview-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ap-phone-mock {
  background: #0a1a17; border-radius: 12px; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  display: flex; flex-direction: column; max-height: 520px;
}
.ap-phone-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #1f2c2a; border-bottom: 1px solid rgba(255,255,255,.05); }
.ap-phone-back { color: #8b9a98; font-size: 22px; line-height: 1; }
.ap-phone-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--accent); color: var(--on-accent);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
}
.ap-phone-info { flex: 1; min-width: 0; }
.ap-phone-name { font-size: 14px; font-weight: 600; color: #fff; }
.ap-phone-status { font-size: 11px; color: #8b9a98; }
.ap-phone-msgs {
  flex: 1; padding: 16px;
  background: #0e1d1b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20h.01' stroke='%23ffffff09' stroke-width='2'/%3E%3C/svg%3E");
  display: flex; flex-direction: column; gap: 8px; overflow-y: auto;
}
.ap-msg-day-divider { align-self: center; background: rgba(255,255,255,.06); color: #8b9a98; font-size: 11px; padding: 3px 10px; border-radius: 99px; margin-bottom: 4px; }
.ap-msg {
  max-width: 80%; padding: 8px 12px; border-radius: 8px;
  font-size: 14px; line-height: 1.4; color: #e8edec;
  white-space: pre-wrap; word-wrap: break-word;
}
.ap-msg-them { align-self: flex-start; background: #1f2c2a; border-bottom-left-radius: 2px; }

.ap-formlink-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ap-formlink-url-row { display: flex; gap: 8px; margin-top: 12px; align-items: stretch; }
.ap-formlink-url {
  flex: 1; min-width: 0; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px;
  color: var(--accent-bright); font-size: 12px; font-family: monospace;
  display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ap-formlink-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.ap-formlink-link {
  display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid var(--border); border-radius: 7px;
  padding: 6px 10px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); text-decoration: none; cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.ap-formlink-link:hover { color: var(--accent-bright); border-color: var(--accent-bright); }
.ap-formlink-qr {
  margin-top: 12px; padding: 14px; background: #fff; border-radius: 10px;
  display: flex; flex-direction: column; align-items: center;
}
.ap-formlink-qr img { display: block; }
.ap-formlink-embed { margin-top: 12px; }
.ap-formlink-embed-code {
  font-family: monospace; font-size: 11px; line-height: 1.5;
  resize: none; white-space: pre; min-height: auto;
}
.ap-test-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ap-test-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.ap-test-sub { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; line-height: 1.5; }
.ap-test-row { display: flex; gap: 8px; }
.ap-test-row .ap-input { flex: 1; }
.ap-test-result { font-size: 12px; margin-top: 10px; min-height: 16px; }
.ap-test-result.ok  { color: var(--green); }
.ap-test-result.err { color: var(--red); }

/* ── AI-beeld page (Phase 4 property images) ─────────────────────────────
   Reuses the ap-* token classes above (field/label/hint/chip/btn/tpl-card)
   for visual consistency with AI Persoonlijkheid — only the pieces with no
   existing analog (dropzone, gallery, AI-label badge) get new rules here. */
.pi-dropzone {
  border: 2px dashed var(--border); border-radius: 12px;
  background: var(--bg-card-alt); padding: 20px; text-align: center;
  cursor: pointer; transition: border-color .15s ease, background .15s ease;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  min-height: 140px; justify-content: center;
}
.pi-dropzone:hover, .pi-dropzone.dragover { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.06); }
.pi-dropzone.has-image { border-style: solid; padding: 0; overflow: hidden; }
.pi-dropzone-placeholder { color: var(--text-muted); font-size: 13px; }
.pi-dropzone-placeholder b { color: var(--text-primary); }
.pi-dropzone img { display: block; width: 100%; max-height: 320px; object-fit: contain; background: var(--bg); }
.pi-dropzone-remove {
  margin-top: 8px; background: transparent; color: var(--text-muted); border: 0;
  font-size: 12px; cursor: pointer; text-decoration: underline; font-family: inherit;
}
.pi-dropzone-remove:hover { color: var(--red, var(--error)); }
.pi-style-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.pi-style-card {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 9px;
  padding: 10px 12px; cursor: pointer; text-align: center; font-family: inherit;
  font-size: 12px; font-weight: 700; color: var(--text-primary); transition: all .15s ease;
}
.pi-style-card:hover { border-color: var(--accent-bright); }
.pi-style-card.active { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.15); color: var(--accent-bright); }
.pi-result-wrap { margin-top: 16px; }
.pi-result-img-wrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--bg); }
.pi-result-img-wrap img { display: block; width: 100%; }
.pi-ai-badge {
  display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  color: var(--warning); background: rgba(var(--warning-rgb),.10);
  border: 1px solid rgba(var(--warning-rgb),.3); border-radius: 8px;
  padding: 7px 10px; margin-top: 8px; line-height: 1.4;
}
.pi-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-top: 14px; }
.pi-gallery-item { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-card); }
.pi-gallery-item img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
.pi-gallery-item-body { padding: 8px 10px 10px; }
.pi-gallery-item-style { font-size: 11px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.pi-gallery-item-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.pi-gallery-toggle {
  background: transparent; border: 1px solid var(--border); color: var(--text-muted);
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
  padding: 4px 8px; border-radius: 6px; cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.pi-gallery-toggle:hover { border-color: var(--accent-bright); color: var(--accent-bright); }
.pi-empty { color: var(--text-muted); font-size: 13px; padding: 24px 0; text-align: center; }

/* Room-type chips — smaller sibling of pi-style-card, same visual language */
.pi-roomtype-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.pi-roomtype-card {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 9px;
  padding: 8px 10px; cursor: pointer; text-align: center; font-family: inherit;
  font-size: 12px; font-weight: 600; color: var(--text-secondary); transition: all .15s ease;
}
.pi-roomtype-card:hover { border-color: var(--accent-bright); }
.pi-roomtype-card.active { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.15); color: var(--accent-bright); font-weight: 700; }
.pi-roomtype-card:disabled, .pi-roomtype-card.disabled {
  opacity: .4; cursor: not-allowed; border-color: var(--border);
}
.pi-roomtype-card:disabled:hover, .pi-roomtype-card.disabled:hover { border-color: var(--border); }

/* Visual-controls: the "Meer opties" panel (furniture/walls/floor/lighting/
   renovation depth). Reuses <details>/<summary> exactly like the AI
   Persoonlijkheid page's .ap-photo-advanced — same collapsed-by-default
   pattern, so uploading a photo + picking a style + clicking Generate stays
   a two-click flow, and every axis in here is a deliberate opt-in. */
.pi-advanced-details { margin-top: 14px; }
.pi-advanced-details > summary {
  cursor: pointer; user-select: none; list-style: none;
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: var(--text-muted); padding: 4px 0;
}
.pi-advanced-details > summary::-webkit-details-marker { display: none; }
.pi-advanced-details > summary:hover { color: var(--accent-bright); }
.pi-advanced-details > summary::before {
  content: '▸'; font-size: 10px; transition: transform .15s ease;
}
.pi-advanced-details[open] > summary::before { transform: rotate(90deg); }
.pi-advanced-body { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }

/* Wall-colour swatches — small curated palette, NOT a free colour picker
   (see api/_images.js's WALL_COLORS header for why). Each chip shows the
   actual colour as a quick visual reference plus the Dutch label. */
.pi-color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.pi-color-card {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 9px;
  padding: 7px 10px; cursor: pointer; text-align: left; font-family: inherit;
  font-size: 12px; font-weight: 600; color: var(--text-secondary); transition: all .15s ease;
  display: flex; align-items: center; gap: 8px;
}
.pi-color-card:hover { border-color: var(--accent-bright); }
.pi-color-card.active { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.15); color: var(--accent-bright); font-weight: 700; }
.pi-color-swatch-dot {
  width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,.25); box-shadow: inset 0 0 0 1px rgba(0,0,0,.15);
}
.pi-color-note-input { margin-top: 8px; }

/* Honesty note — shown only when "Volledige renovatie" is selected. Uses the
   warning tokens (same family as the credit-usage bar's 80% state, see
   DESIGN-SYSTEM.md's deliberate warning/accent split) so it reads as an
   active caution, not a neutral hint. */
.pi-honesty-note {
  display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5;
  color: var(--text-secondary); background: rgba(var(--warning-rgb),.08);
  border: 1px solid rgba(var(--warning-rgb),.28); border-radius: 9px;
  padding: 10px 12px; margin-top: 8px;
}
.pi-honesty-note b { color: var(--warning); }

/* Before/after comparison slider — a single native <input type=range>
   (transparent, full-bleed) drives a clip-path on the "after" image so the
   drag/keyboard/touch handling is the browser's own accessible range input,
   never hand-rolled pointer math. The AI badge stays a separate, always-
   visible element below (never inside the draggable area) so it can never
   be dragged out of view — EU AI Act Art. 50(4), see api/_images.js header. */
.pi-compare-stage {
  position: relative; width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--border); background: var(--bg);
}
.pi-compare-img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  display: block; pointer-events: none; user-select: none;
}
.pi-compare-after { clip-path: inset(0 0 0 50%); }
.pi-compare-tag {
  position: absolute; top: 8px; font-size: 10px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; padding: 4px 8px; border-radius: 6px;
  background: rgba(0,0,0,.55); color: #fff; pointer-events: none;
}
.pi-compare-tag.before { left: 8px; }
.pi-compare-tag.after { right: 8px; }
.pi-compare-handle {
  position: absolute; top: 0; bottom: 0; width: 2px; left: 50%; transform: translateX(-1px);
  background: var(--accent-bright); pointer-events: none; box-shadow: 0 0 0 1px rgba(0,0,0,.3);
}
.pi-compare-handle::after {
  content: ''; position: absolute; top: 50%; left: 50%; width: 32px; height: 32px;
  border-radius: 50%; background: var(--accent-bright); transform: translate(-50%,-50%);
  box-shadow: 0 2px 6px rgba(0,0,0,.35);
}
.pi-compare-range {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0;
  cursor: ew-resize; -webkit-appearance: none; appearance: none;
}
.pi-result-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }

.settings-wrap { width: 100%; display: flex; flex-direction: column; gap: 20px; }
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.settings-section-title {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  gap: 20px;
}
.settings-row:last-child { border-bottom: none; }
.settings-label {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}
.settings-label-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.settings-value {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: right;
}
.settings-input {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  padding: 7px 12px;
  outline: none;
  transition: border-color 0.15s;
  width: 220px;
}
.settings-input:focus { border-color: var(--blue-bright); }
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.settings-coming-soon {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(var(--warning-rgb),0.1);
  border: 1px solid rgba(var(--warning-rgb),0.25);
  color: var(--orange);
  letter-spacing: 0.5px;
}
.settings-danger .settings-label { color: var(--red); }
.settings-info-box {
  margin: 0 20px 16px;
  padding: 14px;
  background: rgba(var(--accent-rgb),0.06);
  border-left: 3px solid var(--blue-primary);
  border-radius: 0 8px 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
}
.settings-apikey {
  font-family: monospace;
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.btn-show-key {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  transition: var(--transition);
  margin-left: 8px;
}
.btn-show-key:hover { border-color: var(--blue-bright); color: var(--blue-bright); }

/* ============================================================
   ACTIVITEIT (ACTIVITY FEED)
   ============================================================ */
.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}
.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
  animation: rowFadeUp 0.3s ease both;
}
.activity-item:last-child { border-bottom: none; }
.activity-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.activity-dot-new       { background: #8b949e; }
.activity-dot-qualified { background: var(--cyan); box-shadow: 0 0 8px rgba(6,182,212,0.5); }
.activity-dot-booked    { background: var(--green); box-shadow: 0 0 8px rgba(var(--success-rgb),0.5); }
.activity-dot-won       { background: var(--blue-bright); box-shadow: 0 0 8px rgba(var(--accent-rgb),0.5); }
.activity-content { flex: 1; }
.activity-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.activity-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.activity-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-top: 2px;
  white-space: nowrap;
}
.activity-feed-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  width: 100%;
}
.activity-feed-header {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 4px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

/* ============================================================
   PAGES VISIBILITY
   ============================================================ */
.page { display: none !important; }
.page.active { display: block !important; }
#page-kalender.active { display: flex !important; flex-direction: row; }
.cal-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.cal-right-sidebar {
  width: 272px; flex-shrink: 0; border-left: 1px solid var(--border);
  background: var(--bg-card); display: flex; flex-direction: column; overflow: hidden;
}
.cal-sidebar-header {
  padding: 14px 14px 0; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.cal-sidebar-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-primary); flex: 1;
}
.cal-sidebar-count {
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px; background: rgba(var(--error-rgb),0.15); color: var(--red);
}
.cal-sidebar-desc {
  padding: 4px 14px 10px; font-size: 11px; color: var(--text-muted);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cal-sidebar-scroll {
  flex: 1; overflow-y: auto; padding: 10px 10px; display: flex;
  flex-direction: column; gap: 8px;
}
.cal-sidebar-empty {
  padding: 28px 14px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.6;
}
.cal-call-item {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 11px 12px; transition: border-color 0.15s;
  cursor: pointer;
}
.cal-call-item:hover { border-color: var(--accent); }
.cal-call-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cal-call-avatar {
  width: 30px; height: 30px; border-radius: 7px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--on-accent); flex-shrink: 0;
}
.cal-call-name {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-call-score { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); }
.cal-call-phone-link {
  display: flex; align-items: center; gap: 7px; padding: 8px 10px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-sm); margin-bottom: 7px;
  text-decoration: none; color: var(--text-primary);
  font-size: 13px; font-weight: 700; transition: border-color 0.15s, color 0.15s;
  font-family: 'Inter', sans-serif;
}
.cal-call-phone-link:hover { border-color: var(--green); color: var(--green); }
.cal-call-actions { display: flex; gap: 6px; }
.cal-call-btn {
  flex: 1; padding: 6px 6px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-secondary); font-size: 11px; font-weight: 600;
  cursor: pointer; text-align: center; text-decoration: none;
  transition: var(--transition); font-family: 'Inter', sans-serif;
  display: flex; align-items: center; justify-content: center; gap: 3px;
}
.cal-call-btn:hover { border-color: var(--accent); color: var(--accent); background: rgba(var(--accent-rgb),0.08); }
.cal-call-btn.primary { background: rgba(var(--accent-rgb),0.1); border-color: rgba(var(--accent-rgb),0.25); color: var(--accent); }
.cal-call-btn.primary:hover { background: rgba(var(--accent-rgb),0.2); }
.cal-hour-row { cursor: default; }
.cal-hour-add {
  display: none; position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
  width: 22px; height: 22px; border-radius: 5px; border: 1px solid rgba(var(--accent-rgb),0.35);
  background: rgba(var(--accent-rgb),0.12); color: var(--accent); font-size: 16px; font-weight: 300;
  cursor: pointer; align-items: center; justify-content: center; line-height: 1;
  transition: background 0.15s;
}
.cal-hour-add:hover { background: rgba(var(--accent-rgb),0.25); }
.cal-hour-row:hover .cal-hour-add { display: flex; }

/* ── Attendance banner ────────────────────────────────────────── */
.cal-attendance-banner {
  display: none; flex-shrink: 0;
  background: linear-gradient(135deg,rgba(var(--warning-rgb),0.08),rgba(var(--warning-rgb),0.03));
  border-bottom: 1px solid rgba(var(--warning-rgb),0.2);
  padding: 10px 16px 12px;
}
.cal-attendance-banner.visible { display: block; }
.cal-att-banner-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--orange); margin-bottom: 9px; display: flex; align-items: center; gap: 6px;
}
.cal-att-cards { display: flex; gap: 9px; flex-wrap: wrap; }
.cal-att-card {
  background: var(--bg-card); border: 1px solid rgba(var(--warning-rgb),0.22);
  border-radius: 10px; padding: 10px 12px;
  display: flex; align-items: center; gap: 12px;
  transition: border-color 0.15s;
}
.cal-att-card:hover { border-color: rgba(var(--warning-rgb),0.4); }
.cal-att-info { min-width: 0; }
.cal-att-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cal-att-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.cal-att-btns { display: flex; gap: 6px; flex-shrink: 0; }
.cal-att-btn {
  padding: 5px 13px; border-radius: 7px; font-size: 12px; font-weight: 700;
  border: 1px solid; cursor: pointer; transition: var(--transition); font-family:'Inter',sans-serif;
}
.cal-att-btn.yes { background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.3); color:var(--green); }
.cal-att-btn.yes:hover { background:rgba(16,185,129,0.2); }
.cal-att-btn.no  { background:rgba(var(--error-rgb),0.1); border-color:rgba(var(--error-rgb),0.3); color:var(--red); }
.cal-att-btn.no:hover  { background:rgba(var(--error-rgb),0.2); }
.cal-att-followup-input, .cal-att-followup-textarea {
  width:100%; box-sizing:border-box; padding:7px 10px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:7px; color:var(--text-primary); font-size:12px;
  font-family:'Inter',sans-serif; outline:none; transition:border-color 0.15s;
}
.cal-att-followup-input:focus, .cal-att-followup-textarea:focus { border-color:var(--accent); }
.cal-att-followup-textarea { resize:vertical; min-height:52px; }
/* Orange pulse dot on calendar events needing attendance */
.cal-event-needs-att {
  position:absolute; top:5px; right:5px; width:8px; height:8px;
  border-radius:50%; background:var(--orange); animation:pulse 1.5s infinite;
}
/* Attendance section in cal event modal */
.cal-modal-att-section {
  margin-top:14px; padding-top:14px; border-top:1px solid var(--border);
}
.cal-modal-att-label {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em;
  color:var(--text-muted); margin-bottom:9px;
}
.cal-modal-att-btns { display:flex; gap:8px; }
.cal-modal-att-result {
  margin-top:14px; padding:9px 14px; border-radius:9px;
  font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px;
}
.cal-modal-att-result.yes { background:rgba(16,185,129,0.1); color:var(--green); }
.cal-modal-att-result.no  { background:rgba(var(--error-rgb),0.1);  color:var(--red);   }
.cal-modal-att-result-edit {
  margin-left:auto; font-size:11px; font-weight:600; cursor:pointer;
  color:var(--text-muted); text-decoration:underline;
}
/* Follow-up form after marking attendance */
.cal-att-followup {
  margin-top:12px; display:flex; flex-direction:column; gap:10px;
  padding:12px; background:var(--bg-card-alt); border-radius:10px;
  border:1px solid var(--border); animation:modalIn 0.15s ease;
}
.cal-att-followup-label {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-muted);
}
.cal-att-followup-input {
  width:100%; box-sizing:border-box; padding:8px 11px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; color:var(--text-primary); font-size:13px;
  font-family:'Inter',sans-serif; transition:border-color 0.15s; outline:none;
}
.cal-att-followup-input:focus { border-color:var(--accent); }
.cal-att-followup-textarea {
  width:100%; box-sizing:border-box; padding:8px 11px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; color:var(--text-primary); font-size:13px;
  font-family:'Inter',sans-serif; transition:border-color 0.15s; outline:none;
  resize:vertical; min-height:72px;
}
.cal-att-followup-textarea:focus { border-color:var(--accent); }
.cal-att-save-btn {
  padding:9px 16px; border-radius:8px; border:none; cursor:pointer;
  background:var(--accent); color: var(--on-accent);
  font-size:13px; font-weight:700; font-family:'Inter',sans-serif;
  transition:filter 0.15s; text-align:center;
}
.cal-att-save-btn:hover { filter:brightness(1.1); }
.cal-att-save-btn:disabled { opacity:0.5; pointer-events:none; }

/* ── Custom booking modal ─────────────────────────────────────── */
#cal-book-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
  display: none; align-items: center; justify-content: center;
}
#cal-book-overlay.open { display: flex; }
#cal-book-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); width: min(520px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--elev-3);
  animation: modalIn 0.18s ease;
}
#cal-book-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cal-book-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
#cal-book-title {
  flex: 1; font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.2;
}
#cal-book-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
#cal-book-close {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); transition: var(--transition); flex-shrink: 0;
}
#cal-book-close:hover { background: var(--bg-card-alt); color: var(--text-primary); }
/* Scrollable body */
#cal-book-body {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 18px;
}
#cal-book-body::-webkit-scrollbar { width: 5px; }
#cal-book-body::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.3); border-radius: 3px; }
/* Section label */
.cb-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 8px;
}
/* Date nav */
.cb-date-nav {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; padding: 8px 12px;
}
.cb-date-label {
  flex: 1; font-size: 14px; font-weight: 700; color: var(--text-primary); text-align: center;
}
.cb-date-btn {
  width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); transition: var(--transition);
  font-family: 'Inter',sans-serif;
}
.cb-date-btn:hover { background: var(--bg-card); color: var(--text-primary); border-color: var(--accent); }
/* Slot grid */
.cb-slots {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.cb-slot {
  padding: 10px 8px; border-radius: 9px; border: 1px solid var(--border);
  background: var(--bg-card-alt); color: var(--text-primary);
  font-size: 13px; font-weight: 700; cursor: pointer; text-align: center;
  transition: var(--transition); font-family: 'Inter',sans-serif;
}
.cb-slot:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.08); color: var(--accent); }
.cb-slot.selected {
  background: rgba(var(--accent-rgb),0.15); border-color: var(--accent);
  color: var(--accent); box-shadow: 0 0 0 2px rgba(var(--accent-rgb),0.2);
}
.cb-slots-empty {
  grid-column: 1/-1; text-align: center; padding: 24px;
  color: var(--text-muted); font-size: 13px; line-height: 1.6;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.cb-empty-next {
  background: var(--accent); color: var(--on-accent); border: none;
  padding: 9px 18px; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: var(--transition); font-family: inherit;
}
.cb-empty-next:hover { filter: brightness(1.1); transform: translateY(-1px); }
/* Lead search */
.cb-lead-search {
  position: relative;
}
.cb-lead-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 9px; color: var(--text-primary); font-size: 13px;
  font-family: 'Inter',sans-serif; transition: border-color 0.15s; outline: none;
}
.cb-lead-input:focus { border-color: var(--accent); }
.cb-field-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 9px; color: var(--text-primary); font-size: 13px;
  font-family: 'Inter',sans-serif; transition: border-color 0.15s; outline: none;
}
.cb-field-input:focus { border-color: var(--accent); }
.cb-lead-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 9px; max-height: 160px; overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.cb-lead-opt {
  padding: 8px 12px; cursor: pointer; font-size: 13px; color: var(--text-primary);
  border-bottom: 1px solid var(--border); transition: background 0.1s;
  display: flex; align-items: center; gap: 8px;
}
.cb-lead-opt:last-child { border-bottom: none; }
.cb-lead-opt:hover { background: rgba(var(--accent-rgb),0.07); }
.cb-lead-opt-score { font-size: 10px; color: var(--accent); font-weight: 700; margin-left: auto; }
/* Confirm button */
.cb-confirm-wrap { padding-top: 4px; }
.cb-confirm-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 13px; border-radius: 10px;
  background: var(--accent); color: var(--on-accent);
  font-size: 14px; font-weight: 700; cursor: pointer; border: none;
  font-family: 'Inter',sans-serif; transition: filter 0.15s, transform 0.12s;
  text-decoration: none;
}
.cb-confirm-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
.cb-confirm-btn:disabled { opacity: 0.4; pointer-events: none; }
.cb-confirm-note { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 7px; }
/* Loading / empty states */
.cb-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; padding: 32px;
  color: var(--text-muted); font-size: 13px;
}
.cb-spinner-ring {
  width: 28px; height: 28px; border: 3px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.cb-no-connection {
  padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.7;
}
.cb-no-connection a { color: var(--accent); font-weight: 600; }
/* Loading spinner for slots refresh */
.cb-slots-loading {
  grid-column: 1/-1; display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 20px; color: var(--text-muted); font-size: 12px;
}
.cal-book-spinner-ring {
  width: 16px; height: 16px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
#page-profile.active { display: block !important; }

/* ============================================================
   RESPONSIVE - TABLET & MOBILE
   ============================================================ */

/* Large desktop tweaks */
@media (max-width: 1400px) {
  .stats-grid { gap: 14px; }
}

/* Tablet landscape */
@media (max-width: 1200px) {
  .analyse-grid { grid-template-columns: repeat(2, 1fr); }
  .exports-grid { grid-template-columns: repeat(2, 1fr); }
  .profile-cards { grid-template-columns: 1fr 1fr; }
  .charts-row { flex-direction: column; }
  .chart-card-sm { width: 100%; }
}

@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Tablet portrait */
@media (max-width: 1024px) {
  .conv-layout { flex-direction: column; height: auto; min-height: calc(100vh - 130px); }
  .conv-list { width: 100%; max-height: 280px; border-right: none; border-bottom: 1px solid var(--border); }
  .pipeline-board { gap: 12px; }
  .pipeline-col { flex: 0 0 240px; }
  .profile-stats-row { grid-template-columns: repeat(2, 1fr); }
  .cal-right-sidebar { width: 240px; }
}

/* Larger phones / small tablets */
@media (max-width: 900px) {
  .analyse-grid { grid-template-columns: 1fr; }
  .analyse-card-span2 { grid-column: span 1; }
  .profile-cards { grid-template-columns: 1fr; }
  .cal-right-sidebar { display: none; }
  .search-pill-label { display: none; }
  .search-pill { min-width: auto; padding: 8px 10px; }
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
    box-shadow: 4px 0 30px rgba(0, 0, 0, 0.5);
  }

  .main-content {
    margin-left: 0;
  }

  .hamburger { display: flex; align-items: center; justify-content: center; }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    padding: 16px 14px 14px;
  }

  .stat-value {
    font-size: 24px;
  }

  /* Extra bottom padding so the last row of content can always be
     scrolled clear of the floating help launcher, which is fixed and
     would otherwise sit permanently on top of whatever ends the page. */
  .page-content { padding: 16px 16px 96px; }

  .topbar { padding: 12px 16px; }

  .timestamp-info { display: none; }

  /* Wrapped to three lines at 375px and doubled the header height */
  .page-subtitle { display: none; }

  /* A phone has no Cmd key, so the ⌘K hint is both misleading and the
     widest thing in the row. Dropping it lets the five topbar controls
     sit on one line instead of wrapping onto a second. */
  .search-pill-kbd { display: none; }

  /* Let the title give up space before the actions wrap. */
  .topbar-left { min-width: 0; flex-shrink: 1; }
  .page-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .detail-panel {
    width: 100vw;
  }

  .exports-grid {
    grid-template-columns: 1fr;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .filter-select, .search-wrapper { min-width: unset; }

  .leads-count { margin-left: 0; text-align: center; padding-top: 4px; }

  /* Hide less important table columns on mobile */
  .td-samenvatting { display: none; }

  .pipeline-board { padding-bottom: 80px; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .login-form-side { padding: 32px 24px; }
  .login-welcome { font-size: 28px; }
  /* Collapse the topbar actions to icons. This rule existed before but
     only matched <span>s, and these two labels were bare text nodes — so
     the buttons stayed ~110px wide, wrapped onto three rows, and pushed
     the topbar to 137px tall on a 375px phone. */
  .btn-icon span:not(.icon), .btn-label { display: none; }
  /* Icon-only buttons don't need label-sized side padding; trimming this
     plus the gap is what gets all five controls onto a single row at
     375px instead of leaving the theme toggle stranded on its own line. */
  .topbar-right { gap: 4px; }
  .topbar-right .btn-icon, .topbar-right .search-pill { padding-left: 9px; padding-right: 9px; }
  .page-title { font-size: 14px; letter-spacing: 1.5px; }

  /* Lead detail panel — tighter padding + smaller avatar so the header
     doesn't feel cramped on the smallest phones */
  .panel-header { padding: 18px 16px 16px; }
  .panel-body   { padding: 16px; }
  .panel-avatar { width: 48px; height: 48px; font-size: 18px; margin-bottom: 10px; }
  .panel-close  { top: 14px; right: 14px; width: 28px; height: 28px; }

  /* Takeover bar / reply row — allow the send button to sit under the
     textarea instead of squeezing both into ~300px of width */
  .panel-reply-row { flex-wrap: wrap; }
  .panel-reply-send { flex: 1 1 100%; justify-content: center; }
  .panel-takeover-bar { padding: 8px; gap: 6px; }
  .panel-takeover-btn { margin-left: 0; }

  /* Actie Nodig / follow-up / top-leads widgets — match .page-content's
     16px gutter instead of the desktop 20px */
  .nb-widget, .followup-widget, .top-leads-strip, .taken-widget { padding: 14px 16px; }
}

/* ============================================================
   PAGE HIDDEN WHEN LOGGED OUT
   ============================================================ */
#dashboard-app { display: none; }
#dashboard-app.visible { display: flex; flex-direction: column; min-height: 100vh; }

/* ============================================================
   LIGHT MODE COMPONENT OVERRIDES
   ============================================================ */

/* Sidebar gets a white surface with left accent border */
/* The sidebar is now the SAME dark pane in both themes — it is the
   anchor the light content area sits against, and switching it to white
   in light mode was what made the whole page read as one flat sheet.
   These rules used to force it white and tint the active item at 9%
   alpha (near-invisible); both are handled by the .sidebar block above,
   which rebinds the colour tokens for everything inside it. */
[data-theme="light"] .sidebar {
  border-right: 1px solid rgba(255,255,255,0.06);
  box-shadow: inset -1px 0 0 rgba(255,255,255,0.06), 8px 0 32px rgba(20,22,28,0.10);
}

[data-theme="light"] .nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: #E9EEF6;
}

[data-theme="light"] .nav-item.active {
  background: var(--grad-gold);
  color: #1B1D22;
}

[data-theme="light"] .nav-item.active::before { display: none; }

/* Topbar: glass, not flat white. 0.72 rather than 0.92 alpha so content
   scrolling underneath actually shows through and the bar reads as a
   pane floating over the page instead of a painted strip. The inset
   highlight is the specular top edge. */
[data-theme="light"] .topbar {
  background: rgba(255,255,255,0.72);
  border-bottom: 1px solid var(--border);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.90), 0 4px 20px rgba(15,17,40,0.05);
}

/* Page titles were gold, which put brand colour on ordinary structural
   text and left nothing louder for actual emphasis. Gold is now reserved
   for the active nav pill, primary actions and money. */
[data-theme="light"] .page-title {
  color: var(--text);
}

/* Topbar buttons. Dark on white */
[data-theme="light"] .btn-icon {
  background: rgba(15,17,40,0.04);
  border: 1px solid var(--border);
  color: var(--text-secondary);
}

[data-theme="light"] .btn-icon:hover {
  background: rgba(var(--accent-rgb),0.08);
  border-color: rgba(var(--accent-rgb),0.25);
  color: var(--accent);
  box-shadow: none;
}

[data-theme="light"] .btn-primary-sm {
  background: var(--accent);
  border-color: rgba(var(--accent-rgb),0.4);
  color: var(--on-accent);
}

[data-theme="light"] .btn-primary-sm:hover {
  background: var(--accent);
}

/* Stat cards. White with real depth */
[data-theme="light"] .stat-card {
  background: #ffffff;
  box-shadow: var(--edge-hi), var(--shadow-card);
  border: 1px solid var(--border);
}

[data-theme="light"] .stat-card:hover {
  box-shadow: none;
  border-color: rgba(var(--accent-rgb),0.2);
}

/* Stat value color */
[data-theme="light"] .stat-value {
  color: #0f1117;
}

/* Filters bar */
[data-theme="light"] .filters-bar {
  background: rgba(255,255,255,0.8);
  border: 1px solid var(--border);
  box-shadow: 0 1px 4px rgba(15,17,40,0.04);
}

/* Selects & search */
[data-theme="light"] .filter-select,
[data-theme="light"] .search-input {
  background: #ffffff;
  border-color: var(--border);
  color: var(--text-primary);
}

[data-theme="light"] .filter-select:focus,
[data-theme="light"] .search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.12);
}

/* Lead table */
[data-theme="light"] .leads-table thead th {
  background: var(--bg-card-alt);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

[data-theme="light"] .leads-table tbody tr:hover {
  background: rgba(var(--accent-rgb),0.04);
  box-shadow: inset 3px 0 0 var(--accent);
}

/* Badge overrides for light */
[data-theme="light"] .badge {
  font-weight: 600;
}

/* Detail panel */
[data-theme="light"] .detail-panel {
  background: #ffffff;
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 20px rgba(15,17,40,0.08);
}

/* Login split in light mode */
[data-theme="light"] .login-split {
  box-shadow: 0 8px 40px rgba(15,17,40,0.14);
}

/* User info bottom of sidebar */
/* No light-theme override here on purpose. The sidebar is dark in BOTH
   themes and rebinds its own surface tokens, so the account block already
   gets the right treatment. The override that used to sit here predated
   the permanently-dark sidebar and painted a white card inside it. */
[data-theme="light"] .user-info {
  background: var(--bg-card-alt);
  border-radius: 10px;
}
[data-theme="light"] .sidebar .user-info { background: rgba(255,255,255,0.05); }

/* Sidebar bottom button */
[data-theme="light"] .btn-logout {
  background: rgba(var(--error-rgb),0.06);
  border-color: rgba(var(--error-rgb),0.15);
}

[data-theme="light"] .btn-logout:hover {
  background: rgba(var(--error-rgb),0.12);
  border-color: rgba(var(--error-rgb),0.3);
}

/* ── Stat cards: colorful top line + corner glow in light ── */
[data-theme="light"] .stat-card::before {
  background: var(--accent);
  opacity: 0.8;
}

[data-theme="light"] .stat-card::after {
  background: none;
}

[data-theme="light"] .stat-card:hover {
  border-color: rgba(var(--accent-rgb),0.25);
  background: var(--card);
  box-shadow: none;
}

[data-theme="light"] .stat-card:hover::before {
  background: var(--accent);
  opacity: 1;
}

/* Colored stat values. Keep glow but lighter */
[data-theme="light"] .stat-value { text-shadow: none; color: #0f1117; }
[data-theme="light"] .stat-value.cyan   { color: var(--info); text-shadow: none; }
[data-theme="light"] .stat-value.green  { color: var(--success); text-shadow: none; }
[data-theme="light"] .stat-value.orange { color: var(--warning); text-shadow: none; }
[data-theme="light"] .stat-value.blue   { color: var(--info); text-shadow: none; }

/* Stat bar in light */
[data-theme="light"] .stat-bar { background: var(--border); }
[data-theme="light"] .stat-bar-fill { background: var(--accent); }

/* Chart card */
[data-theme="light"] .chart-card,
[data-theme="light"] .chart-card-sm {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: var(--edge-hi), var(--shadow-card);
}

[data-theme="light"] .chart-title {
  color: var(--text-secondary);
}

/* Today widget */
[data-theme="light"] .today-widget {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: var(--edge-hi), var(--shadow-card);
}

/* Cal modal */
[data-theme="light"] .cal-modal {
  background: #ffffff;
}
[data-theme="light"] .cal-modal-btn-secondary {
  background: rgba(0,0,0,0.04);
  color: var(--text-secondary);
}
[data-theme="light"] .cal-modal-close:hover { background: rgba(0,0,0,0.06); }

/* Filters bar stronger presence */
[data-theme="light"] .filters-bar {
  background: #ffffff;
  border: 1px solid var(--border);
  box-shadow: 0 1px 6px rgba(15,17,40,0.05);
}

/* Table header row */
[data-theme="light"] .leads-table thead tr {
  background: var(--hover);
}

/* Badge coloring stays vibrant in light */
[data-theme="light"] .badge-bron {
  background: rgba(var(--accent-rgb),0.1);
  color: var(--accent);
  border-color: rgba(var(--accent-rgb),0.2);
}

/* ============================================================
   HELP WIDGET (launcher bottom-right + slide-up panel)

   Deliberately NOT an LLM chat. It answers from a fixed set of
   articles written against features that actually exist in this
   build, and hands off to a human for anything else. A generative
   bot here would confidently invent settings that don't exist and
   turn every wrong answer into a support ticket.
   ============================================================ */
.hv-help-launcher {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad-gold);
  color: var(--on-accent);
  box-shadow: 0 4px 12px rgba(0,0,0,.28), 0 10px 32px rgba(var(--accent-rgb),.28);
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.hv-help-launcher:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 6px 16px rgba(0,0,0,.32), 0 14px 40px rgba(var(--accent-rgb),.36);
}
.hv-help-launcher:active { transform: translateY(0) scale(.97); }
.hv-help-launcher:focus-visible {
  outline: 2px solid var(--accent-c);
  outline-offset: 3px;
}
/* Two stacked icons, cross-faded — the launcher becomes its own close
   button when the panel is open, which is the pattern people already
   know from every other messenger. */
.hv-help-launcher svg {
  position: absolute;
  transition: opacity var(--dur-fast) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
}
.hv-help-launcher .hv-help-ico-close { opacity: 0; transform: rotate(-90deg) scale(.6); }
.hv-help-launcher.is-open .hv-help-ico-chat  { opacity: 0; transform: rotate(90deg) scale(.6); }
.hv-help-launcher.is-open .hv-help-ico-close { opacity: 1; transform: none; }

/* Unread dot for the first-run nudge. */
.hv-help-launcher::after {
  content: '';
  position: absolute;
  top: 2px; right: 2px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--c-coral);
  border: 2px solid var(--bg);
  opacity: 0;
  transform: scale(.4);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring);
}
.hv-help-launcher.has-dot::after { opacity: 1; transform: none; }

.hv-help-panel {
  position: fixed;
  right: 24px;
  bottom: 90px;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 560px;
  max-height: calc(100vh - 130px);
  z-index: 9001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  background: var(--card);
  border: 1px solid var(--border-c);
  box-shadow: var(--edge-hi), var(--elev-3);
  opacity: 0;
  transform: translateY(12px) scale(.97);
  transform-origin: bottom right;
  pointer-events: none;
  transition: opacity var(--dur-base) var(--ease-out),
              transform var(--dur-enter) var(--ease-out);
}
.hv-help-panel.is-open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
  .hv-help-launcher, .hv-help-launcher svg, .hv-help-panel { transition: none; }
}

.hv-help-head {
  padding: 18px 18px 14px;
  background: var(--grad-gold);
  color: var(--on-accent);
  flex-shrink: 0;
}
.hv-help-head h2 { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
.hv-help-head p  { font-size: 12.5px; margin: 0; opacity: .82; }

.hv-help-search { padding: 12px 14px 8px; flex-shrink: 0; }
.hv-help-search input {
  width: 100%;
  padding: 9px 12px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-c);
  background: var(--bg-alt);
  border: 1px solid var(--border-c);
  border-radius: 10px;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.hv-help-search input:focus {
  outline: none;
  border-color: var(--accent-c);
}
.hv-help-search input::placeholder { color: var(--text-muted-c); }

.hv-help-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 14px 14px;
}
.hv-help-sec {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: .6px;
  text-transform: uppercase;
  color: var(--text-muted-c);
  margin: 12px 4px 6px;
}
.hv-help-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 4px;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-c);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out);
}
.hv-help-item:hover {
  background: var(--hover-c);
  border-color: var(--border-c);
}
.hv-help-item:focus-visible { outline: 2px solid var(--accent-c); outline-offset: -1px; }
.hv-help-item svg { flex-shrink: 0; opacity: .5; margin-left: auto; }

.hv-help-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted-c);
}

.hv-help-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 10px;
  padding: 5px 10px 5px 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted-c);
  background: transparent;
  border: 1px solid var(--border-c);
  border-radius: 99px;
  cursor: pointer;
}
.hv-help-back:hover { color: var(--text-c); background: var(--hover-c); }

.hv-help-article h3 { font-size: 15px; font-weight: 700; margin: 0 0 10px; color: var(--text-c); }
.hv-help-article p  { font-size: 13px; line-height: 1.62; color: var(--text-muted-c); margin: 0 0 10px; }
.hv-help-article ol,
.hv-help-article ul { margin: 0 0 12px 18px; }
.hv-help-article li { font-size: 13px; line-height: 1.62; color: var(--text-muted-c); margin-bottom: 6px; }
.hv-help-article strong { color: var(--text-c); font-weight: 600; }
.hv-help-article code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--bg-alt);
  border: 1px solid var(--border-c);
  color: var(--accent-ink);
}

.hv-help-foot {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--divider);
  background: var(--bg-alt);
}
.hv-help-foot a {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: none;
  color: var(--text-c);
  background: var(--card);
  border: 1px solid var(--border-c);
  border-radius: 10px;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.hv-help-foot a:hover { border-color: var(--accent-c); color: var(--accent-ink); }

/* On phones the panel takes the whole screen — a 380px card floating on a
   375px viewport is the classic broken-messenger look. */
@media (max-width: 520px) {
  .hv-help-panel {
    right: 0; bottom: 0; left: 0;
    width: 100%;
    max-width: 100%;
    height: 88vh;
    max-height: 88vh;
    border-radius: 18px 18px 0 0;
    transform-origin: bottom center;
  }
  .hv-help-launcher { right: 16px; bottom: 16px; }
}

/* ═══ AI WORKSPACE (api/_ai/ui/styles.js + tokens.js) ═══ */
${ai.css}
</style>
    <!-- jspdf (117 KB gecomprimeerd) en qrcode (13 KB) stonden hier als gewone
         script-tags en blokkeerden dus elke pagina-opbouw, terwijl ze alleen
         nodig zijn als iemand een PDF exporteert of de QR-code van zijn
         formulier bekijkt. Dat is een kleine minderheid van de bezoeken.
         Ze worden nu geladen zodra de browser niets beters te doen heeft (zie
         loadVendorsWhenIdle onderaan het script). De bestaande guards in
         exportPDF() en renderQrDataUrl() vangen het zeldzame geval af dat
         iemand klikt voordat het laden klaar is. -->
</head>
<body>

<!-- ============================================================
     LOGIN PAGE
     ============================================================ -->
<div id="login-page">
  <div class="login-split">

    <!-- LEFT: Form side -->
    <div class="login-form-side">
      <div class="login-form-inner">
        <div class="login-logo-top">
          <img src="/logo.png" alt="Helvaro">
        </div>

        <h1 class="login-welcome">Welkom terug!</h1>
        <p class="login-subtitle">Voer je gegevens in om toegang te krijgen tot je dashboard</p>

        <!-- Everything from here to the closing tag is the built-in form.
             mountClerkSignIn() hides this wrapper and reveals #clerk-signin
             instead, so the logo, heading and split-screen showcase stay put
             and only the form itself is swapped. -->
        <div id="login-form-wrap">
        <div class="form-group">
          <label class="form-label" for="login-email">E-mailadres</label>
          <input class="form-input" type="email" id="login-email" placeholder="naam@bedrijf.nl" autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Wachtwoord</label>
          <div style="position:relative">
            <input class="form-input" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" style="padding-right:44px" aria-describedby="login-error">
            <button type="button" id="btn-toggle-pw" aria-label="Wachtwoord tonen" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:4px;color:#6b7280;display:flex;align-items:center" onclick="(function(){var i=document.getElementById('login-password');var b=document.getElementById('btn-toggle-pw');if(i.type==='password'){i.type='text';b.setAttribute('aria-label','Wachtwoord verbergen');b.innerHTML='<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94\\'></path><path d=\\'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19\\'></path><line x1=\\'1\\' y1=\\'1\\' x2=\\'23\\' y2=\\'23\\'></line></svg>';}else{i.type='password';b.setAttribute('aria-label','Wachtwoord tonen');b.innerHTML='<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\\'></path><circle cx=\\'12\\' cy=\\'12\\' r=\\'3\\'></circle></svg>'; }})()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
          </div>
        </div>
        <button class="btn-login" id="btn-login" aria-label="Inloggen"><span>Inloggen <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:6px"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></button>
        <div class="login-error" id="login-error" role="alert" aria-live="assertive"></div>

        <div style="text-align:center;margin-top:14px"><a href="/forgot-password" style="font-size:13px;color:#6b7280;text-decoration:none">Wachtwoord vergeten?</a></div>
        </div><!-- /login-form-wrap -->

        <!-- Clerk mounts sign-in OR sign-up here. Hidden until it does. -->
        <div id="clerk-signin" style="display:none;min-height:320px"></div>
        <!-- Switch between the two, kept in our own page so the user never
             leaves the branded login screen for a Clerk-hosted one. -->
        <div id="clerk-toggle" style="display:none"></div>

        <div class="login-footer">Beveiligd door <span>Helvaro</span> &mdash; AI Platform ${new Date().getFullYear()}</div>
      </div>
    </div>

    <!-- RIGHT: Brand side with 3 slides -->
    <div class="login-brand-side">
      <div class="brand-slides-wrap">

        <!-- Slide 1: Lead Overzicht -->
        <div class="brand-slide active" data-slide="0">
          <div class="brand-card-mock">
            <div class="brand-card-header">
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <span class="brand-card-title">Lead Overzicht</span>
            </div>
            <div class="brand-stats">
              <div class="brand-stat">
                <div class="brand-stat-num">24</div>
                <div class="brand-stat-label">Leads</div>
              </div>
              <div class="brand-stat">
                <div class="brand-stat-num">68%</div>
                <div class="brand-stat-label">Conversie</div>
              </div>
              <div class="brand-stat">
                <div class="brand-stat-num">12</div>
                <div class="brand-stat-label">Afspraken</div>
              </div>
            </div>
            <div class="brand-bars">
              <div class="brand-bar" style="height:30%"></div>
              <div class="brand-bar" style="height:55%"></div>
              <div class="brand-bar" style="height:40%"></div>
              <div class="brand-bar" style="height:70%"></div>
              <div class="brand-bar active" style="height:100%"></div>
              <div class="brand-bar" style="height:85%"></div>
              <div class="brand-bar" style="height:60%"></div>
              <div class="brand-bar" style="height:90%"></div>
            </div>
          </div>
          <div class="brand-tagline">
            <h2>Naadloze werkomgeving</h2>
            <p>Alles wat je nodig hebt in één krachtig AI-platform</p>
          </div>
        </div>

        <!-- Slide 2: AI Kwalificatie -->
        <div class="brand-slide" data-slide="1">
          <div class="brand-card-mock">
            <div class="brand-card-header">
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <span class="brand-card-title">AI Kwalificatie</span>
            </div>
            <div class="brand-score-row">
              <div class="brand-score-ring">
                <svg viewBox="0 0 80 80" width="80" height="80">
                  <defs>
                    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="var(--accent)"/>
                      <stop offset="100%" stop-color="#DDCAA1"/>
                    </linearGradient>
                  </defs>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(var(--accent-rgb),0.18)" stroke-width="8"/>
                  <circle cx="40" cy="40" r="32" fill="none" stroke="url(#ringGrad)" stroke-width="8"
                    stroke-dasharray="134" stroke-dashoffset="40" stroke-linecap="round"
                    transform="rotate(-90 40 40)" filter="drop-shadow(0 0 4px rgba(var(--accent-rgb),0.6))"/>
                </svg>
                <div class="brand-score-label">70%</div>
              </div>
              <div class="brand-score-items">
                <div class="brand-score-item">
                  <div class="brand-score-bar-wrap"><div class="brand-score-bar-fill" style="width:85%"></div></div>
                  <span>Budget fit</span>
                </div>
                <div class="brand-score-item">
                  <div class="brand-score-bar-wrap"><div class="brand-score-bar-fill" style="width:60%"></div></div>
                  <span>Urgentie</span>
                </div>
                <div class="brand-score-item">
                  <div class="brand-score-bar-wrap"><div class="brand-score-bar-fill" style="width:72%"></div></div>
                  <span>Beslisser</span>
                </div>
              </div>
            </div>
          </div>
          <div class="brand-tagline">
            <h2>Slimme AI-scoring</h2>
            <p>Elke lead automatisch gekwalificeerd en gescoord</p>
          </div>
        </div>

        <!-- Slide 3: Afspraken -->
        <div class="brand-slide" data-slide="2">
          <div class="brand-card-mock">
            <div class="brand-card-header">
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <div class="brand-card-dot"></div>
              <span class="brand-card-title">Aankomende Afspraken</span>
            </div>
            <div class="brand-agenda">
              <div class="brand-agenda-item">
                <div class="brand-agenda-time">09:00</div>
                <div class="brand-agenda-content">
                  <div class="brand-agenda-name">Thomas B.</div>
                  <div class="brand-agenda-tag">Kennismaking</div>
                </div>
                <div class="brand-agenda-dot hot"></div>
              </div>
              <div class="brand-agenda-item">
                <div class="brand-agenda-time">11:30</div>
                <div class="brand-agenda-content">
                  <div class="brand-agenda-name">Laura V.</div>
                  <div class="brand-agenda-tag">Demo call</div>
                </div>
                <div class="brand-agenda-dot warm"></div>
              </div>
              <div class="brand-agenda-item">
                <div class="brand-agenda-time">14:00</div>
                <div class="brand-agenda-content">
                  <div class="brand-agenda-name">Marco S.</div>
                  <div class="brand-agenda-tag">Follow-up</div>
                </div>
                <div class="brand-agenda-dot warm"></div>
              </div>
            </div>
          </div>
          <div class="brand-tagline">
            <h2>Altijd overzicht</h2>
            <p>Je agenda en leads op één plek, altijd up-to-date</p>
          </div>
        </div>

      </div>

      <!-- Dots -->
      <div class="brand-dots" id="brand-dots" role="tablist" aria-label="Slideshow navigatie">
        <button class="brand-dot active" data-target="0" role="tab" aria-selected="true" aria-label="Slide 1"></button>
        <button class="brand-dot" data-target="1" role="tab" aria-selected="false" aria-label="Slide 2"></button>
        <button class="brand-dot" data-target="2" role="tab" aria-selected="false" aria-label="Slide 3"></button>
      </div>
    </div>

  </div>
</div>

<!-- ============================================================
     DASHBOARD APP
     ============================================================ -->
<div id="dashboard-app">

  <!-- Sidebar overlay (mobile) -->
  <div class="sidebar-overlay" id="sidebar-overlay"></div>

  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <img src="/logo.png" alt="Helvaro">
    </div>
    <nav class="sidebar-nav">
      <!-- ── Werk (dagelijks) ── -->
      <button class="nav-item active" data-page="dashboard" id="nav-dashboard">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></span>
        Dashboard
      </button>
      <button class="nav-item" data-page="pipeline" id="nav-pipeline">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="4" height="18" rx="1"/><rect x="10" y="3" width="4" height="18" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg></span>
        Pipeline
      </button>
      <button class="nav-item" data-page="gesprekken" id="nav-gesprekken">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
        Gesprekken
      </button>
      <button class="nav-item" data-page="kalender" id="nav-kalender">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        Kalender
        <span class="nav-badge" id="cal-nav-badge" style="display:none">0</span>
      </button>

      <!-- ── Inzicht ── -->
      <div class="nav-divider"></div>
      <button class="nav-item" data-page="resultaten" id="nav-resultaten">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span>
        Resultaten
      </button>
      <button class="nav-item" data-page="analyse" id="nav-analyse">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg></span>
        Analyse
      </button>
      <button class="nav-item" data-page="activiteit" id="nav-activiteit">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></span>
        Activiteit
      </button>
      <button class="nav-item" data-page="exports" id="nav-exports">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></span>
        Exports
      </button>
      <button class="nav-item" data-page="ai-beeld" id="nav-ai-beeld">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></span>
        AI-beeld
      </button>

      <!-- ── Setup (zelden) ── -->
      <div class="nav-divider"></div>
      <button class="nav-item" data-page="formulier" id="nav-formulier">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="7" y1="9"  x2="17" y2="9"/><line x1="7" y1="13" x2="17" y2="13"/><line x1="7" y1="17" x2="12" y2="17"/></svg></span>
        Formulier
      </button>
      <button class="nav-item" data-page="ai-persona" id="nav-ai-persona">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="12" cy="11" r="1.6" fill="currentColor"/></svg></span>
        AI Persoonlijkheid
      </button>
      <button class="nav-item" data-page="instellingen" id="nav-instellingen">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
        Instellingen
      </button>

      <!-- ── Admin-only (verborgen voor gewone klanten) ── -->
      <button class="nav-item" data-page="admin" id="nav-admin" style="display:none">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
        Klanten
      </button>
      <button class="nav-item" data-page="founder" id="nav-founder" style="display:none">
        <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>
        Founder
      </button>
    </nav>

    <!-- AI WORKSPACE: the AI sidebar. Same .sidebar shell, different contents;
         .sidebar-bottom below (credits, account, logout) is SHARED. -->
${ai.sidebar}

    <div class="sidebar-bottom">
      <!-- Credit usage widget. Hidden until loadCreditUsage() confirms the
           credit system is active for this client — inert (display:none)
           by default, matches CREDIT-SYSTEM-DESIGN.md's "never punitive,
           always visible once active" bar. -->
      <div class="credit-usage-widget" id="credit-usage-widget" style="display:none">
        <div class="credit-usage-head">
          <span>AI-credits</span>
          <span class="credit-usage-pct" id="credit-usage-pct">0%</span>
        </div>
        <div class="credit-usage-track">
          <div class="credit-usage-fill" id="credit-usage-fill" style="width:0%"></div>
        </div>
        <div class="credit-usage-sub" id="credit-usage-sub">—</div>
      </div>
      <div class="user-info" id="user-info-btn" onclick="navigateTo('profile')" style="cursor:pointer;" title="Bekijk profiel">
        <div class="user-avatar" id="user-avatar">HV</div>
        <div>
          <div class="user-name" id="user-name">Gebruiker</div>
          <div class="user-role">Client Account</div>
        </div>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;opacity:0.4;flex-shrink:0"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      <button id="btn-back-admin" onclick="backToAdmin()" style="display:none;width:100%;padding:9px 12px;margin-bottom:6px;background:rgba(var(--accent-rgb),0.12);border:1px solid rgba(var(--accent-rgb),0.3);border-radius:8px;color:var(--accent-bright);font-size:12px;font-weight:600;cursor:pointer;display:none;align-items:center;gap:7px">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Klantenoverzicht
      </button>
      <button class="btn-logout" id="btn-logout"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> Uitloggen</button>
    </div>
  </aside>

  <!-- Main Content -->
  <div class="main-content">

    <!-- Topbar -->
    <header class="topbar">
      <!-- AI WORKSPACE: CRM | AI switcher (api/_ai/ui/markup.js) -->
${ai.switcher}
      <div class="topbar-left">
        <button class="hamburger" id="hamburger" aria-label="Menu"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
        <div>
          <div class="page-title display-heading gradient-text" id="topbar-title">Dashboard</div>
          <div class="page-subtitle" id="topbar-subtitle">Overzicht van je gekwalificeerde leads</div>
        </div>
      </div>
      <div class="topbar-right">
        <span class="timestamp-info" id="timestamp-info">Bijgewerkt zojuist</span>
        <button class="btn-icon" id="btn-refresh" title="Vernieuwen" aria-label="Vernieuwen">
          <span class="icon">↻</span>
          <span class="btn-label">Vernieuwen</span>
        </button>
        <button class="btn-icon btn-primary-sm" id="btn-export-csv" title="CSV Export" aria-label="Exporteer leads als CSV">
          <span class="icon">⇓</span>
          <span class="btn-label">CSV Export</span>
        </button>
            <button class="search-pill" id="btn-search" title="Zoeken (Ctrl+K)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <span class="search-pill-label">Zoeken...</span>
              <kbd class="search-pill-kbd">⌘K</kbd>
            </button>
            <div class="notif-wrap">
              <button class="btn-icon" id="btn-notif" title="Notificaties" style="position:relative">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
                <span class="notif-badge" id="notif-badge" style="display:none">0</span>
              </button>
              <div class="notif-dropdown" id="notif-dropdown" style="display:none">
                <div class="notif-dd-head">
                  <span>Meldingen</span>
                  <button class="notif-dd-clear" id="notif-dd-clear" onclick="clearNotifs()">Alles gelezen</button>
                </div>
                <div class="notif-dd-body" id="notif-dd-body"></div>
                <button class="notif-dd-foot" onclick="closeNotifDropdown();navigateTo('activiteit')">Alle activiteit bekijken</button>
              </div>
            </div>
        <button class="btn-icon theme-toggle" id="btn-theme" title="Wissel thema" style="padding:8px 10px"></button>
      </div>
    </header>

    <!-- Dashboard Page -->
    <main class="page-content page active" id="page-dashboard">

      <!-- Trial banner. Hidden until loadPlanStatus() confirms this client
           is on trial or expired — see TRIAL-DESIGN.md and
           api/leads.js's plan-status mode. -->
      <div class="dash-trial-banner" id="dash-trial-banner" style="display:none">
        <div class="dash-trial-banner-icon" id="dash-trial-banner-icon"></div>
        <div class="dash-trial-banner-body">
          <div class="dash-trial-banner-title" id="dash-trial-banner-title">—</div>
          <div class="dash-trial-banner-sub" id="dash-trial-banner-sub">—</div>
        </div>
        <a class="dash-trial-banner-cta" id="dash-trial-banner-cta" href="#" target="_blank" rel="noopener">Upgrade</a>
      </div>

      <!-- Email-verification banner. Hidden until loadOnboardingChecklist()
           confirms config-get's emailVerified is explicitly false. Separate
           from the checklist card below — see the CSS comment above
           .dash-verify-banner for why this survives a checklist dismiss. -->
      <div class="dash-verify-banner" id="dash-verify-banner" style="display:none">
        <div class="dash-verify-banner-icon">✉</div>
        <div class="dash-verify-banner-body">
          <div class="dash-verify-banner-title">Bevestig je e-mailadres</div>
          <div class="dash-verify-banner-sub">Check je inbox voor de bevestigingsmail. Dit is alleen nodig zodat je later je wachtwoord kan resetten als je dat ooit vergeet — verder werkt alles al gewoon.</div>
        </div>
        <div class="dash-verify-banner-actions">
          <button class="dash-verify-banner-cta" id="dash-verify-banner-resend" onclick="resendVerificationFromBanner()">Stuur opnieuw</button>
          <button class="dash-verify-banner-close" onclick="dismissVerifyBanner()" title="Verbergen voor deze sessie">×</button>
        </div>
      </div>

      <!-- Onboarding checklist. Hidden until loadOnboardingChecklist() has a
           config-get response — items and progress are rendered entirely by
           JS (renderOnboardingChecklist()) from LIVE, derived app state, not
           a stored "completed" flag. Auto-hides itself once every item is
           done, or when the client dismisses it (dash-checklist-close). -->
      <div class="dash-checklist" id="dash-checklist" style="display:none">
        <div class="dash-checklist-head">
          <div class="dash-checklist-title-wrap">
            <div class="dash-checklist-title">Aan de slag met Helvaro</div>
            <div class="dash-checklist-sub" id="dash-checklist-progress-label">0 van 5 klaar</div>
          </div>
          <div class="dash-checklist-progress-bar"><div class="dash-checklist-progress-fill" id="dash-checklist-progress-fill" style="width:0%"></div></div>
          <button class="dash-checklist-close" id="dash-checklist-close" onclick="dismissChecklist()" title="Verbergen">×</button>
        </div>
        <div class="dash-checklist-items" id="dash-checklist-items">
          <!-- rendered by renderOnboardingChecklist() -->
        </div>
        <div class="chk-whatsapp">
          <div class="chk-whatsapp-icon">💬</div>
          <div class="chk-whatsapp-body">
            <div class="chk-whatsapp-title">WhatsApp-nummer koppelen</div>
            <div class="chk-whatsapp-sub">Dit stel je niet zelf in. Meta moet je nummer eerst goedkeuren, en dat regelen wij voor je. Duurt meestal een paar dagen. Je hoeft nu niets te doen, we nemen contact op zodra het kan. Laat het gerust weten als je er al klaar voor bent, dan pakken we het sneller op.</div>
          </div>
          <a class="chk-whatsapp-action" id="chk-whatsapp-mailto" href="mailto:${SUPPORT_EMAIL_ATTR}?subject=WhatsApp%20koppelen&body=Hallo%2C%0A%0AIk%20wil%20graag%20mijn%20WhatsApp-nummer%20laten%20koppelen%20aan%20Helvaro.%0A%0ABedrijf%3A%20" target="_blank" rel="noopener">Laat het weten</a>
        </div>
      </div>

      <!-- Form Link banner. Quick access to the lead form URL -->
      <div class="dash-formlink" id="dash-formlink">
        <div class="dash-formlink-icon"></div>
        <div class="dash-formlink-body">
          <div class="dash-formlink-label">Jouw lead-formulier</div>
          <code class="dash-formlink-url" id="dash-formlink-url">—</code>
        </div>
        <div class="dash-formlink-actions">
          <button class="dash-formlink-btn" onclick="copyFormLink()" title="Kopieer link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Kopieer
          </button>
          <a class="dash-formlink-btn" id="dash-formlink-open" target="_blank" rel="noopener">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open
          </a>
          <button class="dash-formlink-btn" onclick="navigateTo('formulier')" title="QR-code, embed-code, deel-opties">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Meer opties
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="stats-grid" id="stats-grid">
        <!-- Skeleton stats -->
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
      </div>

      <!-- Charts row -->
      <div class="charts-row">
        <div class="chart-card">
          <div class="chart-title">Leads per week (laatste 8 weken)</div>
          <canvas id="leads-chart" height="80"></canvas>
        </div>
        <div class="chart-card-sm" id="bron-chart-wrap">
          <div class="chart-title">Leads per bron</div>
          <canvas id="bron-chart" height="160"></canvas>
        </div>
      </div>

      <!-- Vandaag widget -->
      <div class="today-widget" id="today-widget" style="display:none">
        <div class="today-widget-title">Vandaag</div>
        <div id="today-widget-body"><span class="today-empty">Geen afspraken vandaag</span></div>
      </div>

      <!-- Revenue Goal Card -->
      <div class="revenue-goal-card" id="revenue-goal-card">
        <div class="revenue-goal-header">
          <div>
            <div class="revenue-goal-label">Omzet Doel</div>
            <div class="revenue-goal-sub" id="revenue-goal-sub">deze maand</div>
          </div>
          <button class="revenue-goal-edit" id="revenue-goal-edit" title="Doel aanpassen" aria-label="Omzetdoel aanpassen"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        </div>
        <div class="revenue-goal-amounts">
          <span class="revenue-goal-current" id="revenue-goal-current">€0</span>
          <span class="revenue-goal-slash">/</span>
          <span class="revenue-goal-target" id="revenue-goal-target">€5.000</span>
        </div>
        <div class="revenue-goal-bar-wrap">
          <div class="revenue-goal-bar" id="revenue-goal-bar" style="width:0%"></div>
        </div>
        <div class="revenue-goal-pct" id="revenue-goal-pct">0% van doel bereikt</div>
      </div>

      <!-- Follow-up Queue -->
      <div class="followup-widget" id="followup-widget" style="display:none">
        <div class="followup-header">
          <div class="followup-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92"/></svg>
            Opvolging Nodig
          </div>
          <span class="followup-count" id="followup-count">0</span>
        </div>
        <div class="followup-list" id="followup-list"></div>
      </div>

      <!-- Actie Nodig Widget (waFailed + escalated — reuse of the old "Niet bereikbaar" widget) -->
      <div class="nb-widget" id="nb-widget" style="display:none">
        <div class="nb-header">
          <div class="nb-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 5a10.94 10.94 0 0114.06 14.06M10.71 5.05A16 16 0 0122.56 9M1.42 9a16 16 0 0114.26 2.26M5.33 14a16 16 0 006.39 6.6M9 5a8 8 0 017.94 7"/></svg>
            Actie nodig
          </div>
          <span class="nb-count" id="nb-count">0</span>
        </div>
        <div class="nb-list" id="nb-list"></div>
      </div>

      <!-- Taken Widget -->
      <div class="taken-widget" id="taken-widget" style="display:none">
        <div class="taken-widget-header">
          <span class="taken-widget-title">Openstaande Taken</span>
          <span class="taken-widget-count" id="taken-widget-count">0</span>
        </div>
        <div id="taken-widget-list"></div>
      </div>

      <!-- Top Leads Strip -->
      <div class="top-leads-strip" id="top-leads-strip" style="display:none">
        <div class="top-leads-strip-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          Top Leads
        </div>
        <div class="top-leads-list" id="top-leads-list"></div>
      </div>

      <!-- Filters Bar -->
      <div class="filters-bar">
        <div class="search-wrapper">
          <span class="search-icon"></span>
          <input class="search-input" id="search-input" type="text" placeholder="Zoek op naam of telefoonnummer...">
        </div>
        <select class="filter-select" id="filter-status">
          <option value="">Alle statussen</option>
          <option value="new">Nieuw</option>
          <option value="in_progress">Bezig</option>
          <option value="completed">Klaar</option>
        </select>
        <select class="filter-select" id="filter-qualified">
          <option value="">Alle leads</option>
          <option value="true">Gekwalificeerd</option>
          <option value="false">Niet gekwalificeerd</option>
        </select>
        <select class="filter-select" id="filter-bron">
          <option value="">Alle bronnen</option>
        </select>
        <select class="filter-select" id="filter-opgepikt">
          <option value="">Opgepikt: Alle</option>
          <option value="true">Opgepikt</option>
          <option value="false">Niet opgepikt</option>
        </select>
        <span class="filters-label">
          Filters
          <span class="filter-badge" id="filter-badge" style="display:none">0</span>
        </span>
        <button class="btn-reset" id="btn-reset-filters">Reset</button>
        <span class="leads-count" id="leads-count"></span>
      </div>

      <!-- Table -->
      <div class="table-card">
        <div class="table-wrapper">
          <table class="leads-table">
            <thead>
              <tr>
                <th class="sortable" data-col="naam">Naam <span class="sort-indicator" data-col="naam"></span></th>
                <th>Telefoon</th>
                <th>Status</th>
                <th>Gekw.</th>
                <th>Bron</th>
                <th>Samenvatting</th>
                <th class="sortable" data-col="leadScore">Score <span class="sort-indicator" data-col="leadScore"></span></th>
                <th>Opgepikt</th>
                <th class="sortable" data-col="datum">Datum <span class="sort-indicator" data-col="datum"></span></th>
                <th></th>
                <th>Acties</th>
              </tr>
            </thead>
            <tbody id="leads-tbody">
              <!-- Skeleton rows -->
              <tr class="skeleton-row"><td><div class="skeleton" style="width:90px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:60px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:70px"></div></td><td><div class="skeleton" style="width:140px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:80px"></div></td><td><div class="skeleton" style="width:110px"></div></td><td><div class="skeleton" style="width:55px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:65px"></div></td><td><div class="skeleton" style="width:160px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:105px"></div></td><td><div class="skeleton" style="width:65px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:70px"></div></td><td><div class="skeleton" style="width:130px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:75px"></div></td><td><div class="skeleton" style="width:100px"></div></td><td><div class="skeleton" style="width:58px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:68px"></div></td><td><div class="skeleton" style="width:150px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:85px"></div></td><td><div class="skeleton" style="width:108px"></div></td><td><div class="skeleton" style="width:62px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:72px"></div></td><td><div class="skeleton" style="width:145px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
              <tr class="skeleton-row"><td><div class="skeleton" style="width:95px"></div></td><td><div class="skeleton" style="width:102px"></div></td><td><div class="skeleton" style="width:60px"></div></td><td><div class="skeleton" style="width:40px"></div></td><td><div class="skeleton" style="width:66px"></div></td><td><div class="skeleton" style="width:155px"></div></td><td><div class="skeleton" style="width:30px"></div></td><td><div class="skeleton" style="width:50px"></div></td><td><div class="skeleton" style="width:80px"></div></td><td></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Resultaten Page (ROI / value reporting) -->
    <main class="page-content page" id="page-resultaten">
      <div class="export-filter-bar">
        <div class="export-filter-group">
          <label class="export-filter-label">Periode</label>
          <select class="export-select" id="resultaten-period" onchange="loadResultaten()">
            <option value="this_month" selected>Deze maand</option>
            <option value="last_30_days">Afgelopen 30 dagen</option>
            <option value="all_time">Alle tijd</option>
          </select>
        </div>
        <div class="export-preview-count" id="resultaten-period-range">—</div>
      </div>

      <div class="stats-grid" id="resultaten-grid">
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
        <div class="stat-card"><div class="stat-label">Laden...</div><div class="stat-value"><div class="skeleton" style="width:60%;height:28px"></div></div></div>
      </div>

      <p style="color:var(--text-muted);font-size:12px;margin-top:16px;max-width:640px;line-height:1.6">
        "Verwachte pipeline waarde" is een door jou ingeschatte waarde per lead — geen omzet die Helvaro voor jou gegenereerd heeft.
      </p>
    </main>

    <!-- Exports Page -->
    <main class="page-content page" id="page-exports">

      <!-- Export filter bar -->
      <div class="export-filter-bar">
        <div class="export-filter-group">
          <label class="export-filter-label">Periode</label>
          <select class="export-select" id="export-period" onchange="updateExportPreview()">
            <option value="7">Afgelopen 7 dagen</option>
            <option value="30" selected>Afgelopen 30 dagen</option>
            <option value="90">Afgelopen 90 dagen</option>
            <option value="all">Alle tijd</option>
          </select>
        </div>
        <div class="export-filter-group">
          <label class="export-filter-label">Status</label>
          <select class="export-select" id="export-status" onchange="updateExportPreview()">
            <option value="all">Alle leads</option>
            <option value="qualified">Alleen gekwalificeerd</option>
            <option value="unqualified">Niet gekwalificeerd</option>
          </select>
        </div>
        <div class="export-preview-count" id="export-preview-count">
          <span id="export-count-num">—</span> leads geselecteerd
        </div>
      </div>

      <div class="exports-grid">

        <!-- CSV Export Card -->
        <div class="export-card export-card-featured">
          <div class="export-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div class="export-card-title display-heading gradient-text">CSV Export</div>
          <p class="export-card-desc">Download gefilterde leads als CSV voor Excel, Google Sheets of je CRM.</p>
          <div class="export-includes">
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Naam &amp; contactgegevens</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Kwalificatiescores</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> AI samenvattingen</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Bronnaam &amp; datum</div>
          </div>
          <button class="btn-icon btn-primary-sm export-btn" id="btn-download-csv" style="width:100%;justify-content:center;padding:13px;margin-top:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV downloaden
          </button>
        </div>

        <!-- Weekly Rapport Card -->
        <div class="export-card">
          <div class="export-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
          </div>
          <div class="export-card-title display-heading gradient-text">Weekrapport</div>
          <p class="export-card-desc">Gedetailleerd overzicht met statistieken en gekwalificeerde leads van de afgelopen 7 dagen.</p>
          <div class="export-includes">
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Leads &amp; conversie stats</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Gekwalificeerde leads lijst</div>
            <div class="export-include-item"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> AI scores &amp; samenvattingen</div>
          </div>
          <button class="btn-icon btn-primary-sm" id="btn-load-rapport" style="width:100%;justify-content:center;padding:13px;margin-top:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
            Rapport laden
          </button>
          <div id="rapport-content" style="display:none;margin-top:20px">
            <button class="btn-icon btn-primary-sm" id="btn-download-pdf" style="width:100%;justify-content:center;padding:10px;margin-bottom:16px;background:rgba(var(--error-rgb),0.1);border-color:rgba(var(--error-rgb),0.3);color:var(--error)" onclick="exportPDF()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Downloaden als PDF
            </button>
            <div class="rapport-stats" id="rapport-stats"></div>
            <div id="rapport-leads-section"></div>
          </div>
          <div id="rapport-skeleton" style="display:none;margin-top:20px">
            <div class="rapport-stats">
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
              <div class="rapport-stat"><div class="skeleton" style="height:28px;margin-bottom:8px"></div><div class="skeleton" style="width:60%"></div></div>
            </div>
          </div>
        </div>

        <!-- Quick Stats Card -->
        <div class="export-card export-card-stats">
          <div class="export-card-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          </div>
          <div class="export-card-title display-heading gradient-text">Snapshot</div>
          <p class="export-card-desc">Live overzicht van je geselecteerde periode.</p>
          <div class="export-snapshot" id="export-snapshot">
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-total">—</div>
              <div class="export-snap-label">Totaal leads</div>
            </div>
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-qualified">—</div>
              <div class="export-snap-label">Gekwalificeerd</div>
            </div>
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-rate">—</div>
              <div class="export-snap-label">Conversie %</div>
            </div>
            <div class="export-snap-item">
              <div class="export-snap-val" id="snap-avg-score">—</div>
              <div class="export-snap-label">Gem. Score</div>
            </div>
          </div>
        </div>

      </div>
    </main>

    <main class="page-content page" id="page-admin">
      <div id="admin-content">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <span style="font-size:13px;color:var(--text-muted)" id="admin-client-count"></span>
          <button class="btn-icon btn-primary-sm" onclick="openNewClientModal()" style="display:flex;align-items:center;gap:6px;padding:9px 16px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nieuwe klant
          </button>
        </div>
        <div class="admin-grid" id="admin-grid">
          <div style="color:var(--text-muted);font-size:14px">Klanten laden...</div>
        </div>
      </div>
    </main>

    <!-- New client modal -->
    <div id="new-client-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;padding:16px">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:28px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div>
            <h3 style="font-size:17px;margin-bottom:2px">Nieuwe klant uitnodigen</h3>
            <p style="color:var(--text-muted);font-size:13px">De klant ontvangt een e-mail en maakt zelf zijn account aan.</p>
          </div>
          <button onclick="closeNewClientModal()" style="background:none;border:none;color:var(--text-muted);font-size:20px;cursor:pointer;padding:4px;line-height:1"></button>
        </div>

        <!-- ── INVITE BY EMAIL (primary) ── -->
        <div id="nc-invite-panel">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div>
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:6px">E-mailadres klant *</label>
              <input id="nc-inv-email" type="email" placeholder="klant@bedrijf.be" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:6px">Naam <span style="font-weight:400;text-transform:none">(optioneel)</span></label>
              <input id="nc-inv-name" type="text" placeholder="Jan Janssen" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
            </div>
          </div>

          <div id="nc-inv-error" style="display:none;color:var(--red);font-size:13px;padding:10px 12px;background:rgba(var(--error-rgb),0.1);border-radius:8px;margin-top:12px"></div>
          <div id="nc-inv-success" style="display:none;background:rgba(var(--success-rgb),.08);border:1px solid rgba(var(--success-rgb),.25);border-radius:8px;padding:12px 14px;margin-top:12px;font-size:13px;color:var(--green)">
            Uitnodiging verzonden! De klant ontvangt een e-mail met de registratielink.
          </div>

          <button id="nc-inv-btn" onclick="sendClientInvite()" style="width:100%;margin-top:14px;padding:12px;background:var(--accent);border:none;border-radius:8px;color: var(--on-accent);font-size:14px;font-weight:600;cursor:pointer">
            Stuur uitnodigingsmail
          </button>

          <!-- Fallback: copy link -->
          <div id="nc-invite-link-row" style="display:none;margin-top:14px">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Of kopieer de link handmatig:</div>
            <div style="display:flex;gap:8px;align-items:center">
              <code id="nc-invite-link" style="flex:1;font-size:11px;background:var(--bg-primary);padding:6px 8px;border-radius:6px;word-break:break-all;color:var(--accent-bright);border:1px solid var(--border)"></code>
              <button onclick="copyInviteLink()" id="nc-invite-copy" style="flex-shrink:0;padding:5px 10px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:11px;font-weight:600;cursor:pointer">Kopieer</button>
            </div>
          </div>
          <div id="nc-invite-missing" style="display:none;background:rgba(var(--error-rgb),.08);border:1px solid rgba(var(--error-rgb),.2);border-radius:8px;padding:10px 12px;margin-top:12px;font-size:12px;color:var(--error)">
            Stel <code>ONBOARD_CODE</code> in als omgevingsvariabele op Vercel om uitnodigingen te activeren.
          </div>
        </div>

        <!-- ── DIVIDER + MANUAL TOGGLE ── -->
        <div style="display:flex;align-items:center;gap:12px;margin:20px 0">
          <div style="flex:1;height:1px;background:var(--border)"></div>
          <button onclick="toggleManualCreate()" id="nc-manual-toggle" style="background:none;border:none;color:var(--text-muted);font-size:12px;cursor:pointer;white-space:nowrap;padding:0">Zelf aanmaken ▾</button>
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>

        <!-- ── MANUAL CREATE (secondary, collapsed) ── -->
        <div id="nc-manual-panel" style="display:none">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div>
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:6px">Naam klant *</label>
              <input id="nc-name" type="text" placeholder="bijv. Immo Janssen" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:6px">Projectcode * <span style="font-weight:400;text-transform:none">(letters, cijfers, _)</span></label>
              <input id="nc-code" type="text" placeholder="IMMO_JANSSEN" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none;font-family:monospace;text-transform:uppercase">
            </div>
            <div>
              <label style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:6px">E-mail <span style="font-weight:400;text-transform:none">(welkomstmail)</span></label>
              <input id="nc-email" type="email" placeholder="klant@bedrijf.be" style="width:100%;padding:10px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:14px;outline:none">
            </div>
            <!-- Calendly veld DEPRECATED. Hidden input voor backwards compat. -->
            <input id="nc-calendly" type="hidden" value="">
            <div id="nc-error" style="display:none;color:var(--red);font-size:13px;padding:10px 12px;background:rgba(var(--error-rgb),0.1);border-radius:8px"></div>
            <div id="nc-success" style="display:none;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:10px;padding:14px">
              <div style="font-weight:600;margin-bottom:10px;color:var(--green)">Klant aangemaakt</div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">Stuur zelf de welkomstmail vanuit je eigen mailbox. Klik op de knop hieronder om een kant-en-klare tekst te kopiëren.</div>

              <!-- Login credentials (only shown when user record was created. Primary action!) -->
              <div id="nc-result-login-block" style="display:none;background:rgba(var(--accent-rgb),.08);border:1px solid rgba(var(--accent-rgb),.25);border-radius:8px;padding:10px 12px;margin-bottom:10px">
                <div style="font-size:11px;color:var(--accent-bright);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Login credentials</div>
                <div style="font-size:12px;display:flex;flex-direction:column;gap:4px">
                  <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--text-muted);width:70px">E-mail:</span><code id="nc-result-email" style="flex:1;background:var(--bg-primary);padding:3px 7px;border-radius:4px;font-size:11px"></code><button onclick="copyNcField('nc-result-email','nc-copy-email')" id="nc-copy-email" style="flex-shrink:0;padding:3px 8px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:10px;cursor:pointer">Kopieer</button></div>
                  <div style="display:flex;align-items:center;gap:6px"><span style="color:var(--text-muted);width:70px">Wachtwoord:</span><code id="nc-result-pw" style="flex:1;background:var(--bg-primary);padding:3px 7px;border-radius:4px;font-size:12px;color:var(--accent-bright);font-weight:600;letter-spacing:.5px"></code><button onclick="copyNcField('nc-result-pw','nc-copy-pw')" id="nc-copy-pw" style="flex-shrink:0;padding:3px 8px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:5px;color:var(--text-primary);font-size:10px;cursor:pointer">Kopieer</button></div>
                </div>
                <div style="font-size:10px;color:var(--text-muted);margin-top:6px">Klant moet wijzigen via <em>Wachtwoord vergeten</em> na 1ste login.</div>
              </div>

              <div style="font-size:12px;display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
                <div><span style="color:var(--text-muted)">API Key: </span><code id="nc-result-key" style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;font-size:11px"></code></div>
                <div><span style="color:var(--text-muted)">Formulier: </span><a id="nc-result-url" href="#" target="_blank" style="color:var(--accent-bright)"></a></div>
              </div>

              <!-- Manual welcome-email helpers -->
              <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
                <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Welkomstmail (zelf versturen)</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button id="nc-copy-mail-btn" onclick="copyWelcomeEmail()" style="flex:1;min-width:140px;padding:9px 12px;background:var(--accent);border:none;border-radius:7px;color: var(--on-accent);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Kopieer mailtekst
                  </button>
                  <a id="nc-open-mail-btn" href="#" style="flex:1;min-width:140px;padding:9px 12px;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:7px;color:var(--text-primary);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;text-decoration:none">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    Open in mail-app
                  </a>
                </div>
              </div>
            </div>
            <button id="nc-submit" onclick="submitNewClient()" style="width:100%;padding:12px;background:var(--accent);border:none;border-radius:8px;color: var(--on-accent);font-size:14px;font-weight:600;cursor:pointer">Aanmaken</button>
          </div>
        </div>

      </div>
    </div>

    <main class="page-content page" id="page-kalender" style="padding:0;height:calc(100vh - 56px);overflow:hidden;">

      <!-- Calendar main area -->
      <div class="cal-main">
        <!-- Calendar toolbar -->
        <div class="cal-toolbar">
          <button class="cal-today-btn" onclick="calToday()">Vandaag</button>
          <button class="cal-nav-btn" onclick="calPrev()" aria-label="Vorige week" title="Vorige week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button class="cal-nav-btn" onclick="calNext()" aria-label="Volgende week" title="Volgende week">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>
          <span id="cal-range-label" class="cal-range-label"></span>
          <button id="kalender-open-btn" class="cal-book-btn" onclick="openCalBookModal(new Date().toISOString().slice(0,10),null)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Boek afspraak
          </button>
        </div>

        <!-- Attendance banner. Appears 5h after appointment -->
        <div class="cal-attendance-banner" id="cal-attendance-banner">
          <div class="cal-att-banner-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            Afspraken zonder resultaat
          </div>
          <div class="cal-att-cards" id="cal-att-cards"></div>
        </div>

        <!-- Day headers -->
        <div class="cal-day-headers">
          <div class="cal-gutter"></div>
          <div id="cal-day-cols-header" class="cal-day-cols-header"></div>
        </div>

        <!-- Scrollable time grid -->
        <div class="cal-scroll-area" id="cal-scroll-area">
          <div class="cal-time-grid">
            <div class="cal-time-labels" id="cal-time-labels"></div>
            <div class="cal-day-cols" id="cal-day-cols"></div>
          </div>
        </div>
      </div>

      <!-- Te Bellen sidebar -->
      <div class="cal-right-sidebar">
        <div class="cal-sidebar-header">
          <span class="cal-sidebar-title">Te Bellen</span>
          <span class="cal-sidebar-count" id="cal-sidebar-count">0</span>
        </div>
        <div class="cal-sidebar-desc">Gekwalificeerd · nog geen afspraak</div>
        <div class="cal-sidebar-scroll" id="cal-sidebar-list">
          <div class="cal-sidebar-empty">Laden...</div>
        </div>
      </div>

    </main>

    <!-- Pipeline Page -->
    <main class="page-content page" id="page-pipeline">
      <div class="pipeline-header-bar">
        <div id="pipeline-summary" class="pipeline-summary-chips"></div>
      </div>
      <div class="pipeline-board" id="pipeline-board">
        <div style="color:var(--text-muted);font-size:14px">Pipeline laden...</div>
      </div>
    </main>

    <!-- Gesprekken Page -->
    <main class="page-content page" id="page-gesprekken" style="padding:0">
      <div class="conv-layout">
        <div class="conv-list" id="conv-list">
          <div class="conv-list-header">Gesprekken</div>
          <div id="conv-list-body">
            <div style="padding:20px;color:var(--text-muted);font-size:13px">Laden...</div>
          </div>
        </div>
        <div class="conv-detail" id="conv-detail">
          <div class="conv-empty">
            <div class="conv-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <div>Selecteer een gesprek</div>
          </div>
        </div>
      </div>
    </main>

    <!-- Analyse Page -->
    <main class="page-content page" id="page-analyse">
      <!-- Revenue Analytics Row -->
      <div class="analyse-revenue-row" id="analyse-revenue-row">
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-omzet-val">€0</div>
          <div class="analyse-revenue-label">Gesloten Omzet</div>
          <div class="analyse-revenue-sub">afspraken die kwamen</div>
        </div>
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-gem-val">€0</div>
          <div class="analyse-revenue-label">Gem. Deal Waarde</div>
          <div class="analyse-revenue-sub" id="analyse-gem-sub">0 deals met waarde</div>
        </div>
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-showup-val" style="color:var(--green)">—</div>
          <div class="analyse-revenue-label">Show-up Rate</div>
          <div class="analyse-revenue-sub" id="analyse-showup-sub">van geboekte afspraken</div>
        </div>
        <div class="analyse-revenue-card">
          <div class="analyse-revenue-val" id="analyse-winrate-val" style="color:var(--green)">0%</div>
          <div class="analyse-revenue-label">Win Rate</div>
          <div class="analyse-revenue-sub">verloren vs totaal</div>
          <div class="analyse-verlies-list" id="analyse-verlies-list"></div>
        </div>
      </div>
      <div class="analyse-grid" id="analyse-grid">
        <!-- Funnel -->
        <div class="analyse-card">
          <div class="analyse-card-title">Conversie Funnel</div>
          <div id="funnel-content"><div style="color:var(--text-muted);font-size:13px">Laden...</div></div>
        </div>
        <!-- Source Performance -->
        <div class="analyse-card">
          <div class="analyse-card-title">Prestaties per Bron</div>
          <div id="source-table-wrap"><div style="color:var(--text-muted);font-size:13px">Laden...</div></div>
        </div>
        <!-- Days of week chart -->
        <div class="analyse-card">
          <div class="analyse-card-title">Leads per Weekdag</div>
          <canvas id="analyse-days-chart" height="120"></canvas>
        </div>
        <!-- Lead score distribution. Spans 2 cols -->
        <div class="analyse-card analyse-card-span2">
          <div class="analyse-card-title">Score Verdeling</div>
          <canvas id="analyse-score-chart" height="100"></canvas>
        </div>
        <!-- Avg response time. Col 3 beside score chart -->
        <div class="analyse-card">
          <div class="analyse-card-title">Gemiddelde Reactietijd</div>
          <div id="analyse-response-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding-top:16px">
            <div class="analyse-stat-big" id="analyse-response-val">—</div>
            <div class="analyse-stat-label">seconden gemiddeld</div>
            <div style="margin-top:20px;width:100%">
              <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Conversie samenvatting</div>
              <div id="analyse-conv-summary" style="display:flex;flex-direction:column;gap:8px"></div>
            </div>
          </div>
        </div>
        <!-- Hours chart (full width) -->
        <div class="analyse-card analyse-card-full">
          <div class="analyse-card-title">Leads per Uur van de Dag</div>
          <canvas id="analyse-hours-chart" height="70"></canvas>
        </div>
      </div>
    </main>

    <!-- AI-beeld Page (Phase 4 — AI property visualisation images) -->
    <main class="page-content page" id="page-ai-beeld">
      <div class="ap-wrap">
        <div class="ap-hero" style="margin-bottom:18px">
          <h2 class="ap-hero-title">AI Vastgoedbeelden</h2>
          <p class="ap-hero-sub">Upload een foto van een pand en laat de AI een visualisatie genereren in een gekozen stijl. Handig voor listings en sociale media.</p>
        </div>

        <div class="ap-field">
          <label class="ap-label">Foto van het pand<span class="ap-label-hint">PNG, JPG of WebP — grote foto's worden automatisch verkleind</span></label>
          <div class="pi-dropzone" id="pi-dropzone" onclick="document.getElementById('pi-file-input').click()">
            <div class="pi-dropzone-placeholder" id="pi-dropzone-placeholder">
              <div style="font-size:26px;line-height:1">+</div>
              <div><b>Klik om een foto te kiezen</b><br>of sleep een bestand hierheen</div>
            </div>
          </div>
          <input type="file" id="pi-file-input" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="handlePiFile(this)">
          <div class="ap-hint"><button type="button" class="ap-btn-link" id="pi-remove-btn" style="display:none" onclick="removePiUpload()">Foto verwijderen</button></div>
        </div>

        <div class="ap-field" style="margin-top:14px">
          <label class="ap-label">Stijl</label>
          <div class="pi-style-grid" id="pi-style-grid">
            <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Stijlen laden...</div>
          </div>
        </div>

        <div class="ap-field" style="margin-top:14px">
          <label class="ap-label">Type ruimte <span class="ap-label-hint">optioneel — voor gerichtere resultaten (bv. geen bank in een badkamer). Ook voor buiten: gevel, tuin, terras</span></label>
          <div class="pi-roomtype-grid" id="pi-roomtype-grid">
            <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Laden...</div>
          </div>
        </div>

        <!-- Meer opties — collapsed by default, exactly like AI Persoonlijkheid's
             "Geavanceerd" pattern, so foto -> stijl -> genereren blijft twee klikken.
             Elke sub-optie hieronder heeft "Automatisch" als standaard. -->
        <details class="pi-advanced-details" id="pi-advanced-details">
          <summary>Meer opties (meubels, muren, vloer, sfeer, renovatiediepte)</summary>
          <div class="pi-advanced-body">

            <div class="ap-field">
              <label class="ap-label">Meubels <span class="ap-label-hint">hoeveel inrichting mag de AI tonen</span></label>
              <div class="pi-roomtype-grid" id="pi-furniture-grid">
                <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Laden...</div>
              </div>
            </div>

            <div class="ap-field">
              <label class="ap-label">Muurafwerking <span class="ap-label-hint">optioneel</span></label>
              <div class="pi-roomtype-grid" id="pi-wallfinish-grid">
                <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Laden...</div>
              </div>
              <div id="pi-wallcolor-wrap" style="display:none;margin-top:10px">
                <label class="ap-label" style="margin-bottom:6px">Muurkleur <span class="ap-label-hint">gecureerd palet — geen vrij kleurveld, dat botst vaak met het AI-model</span></label>
                <div class="pi-color-grid" id="pi-wallcolor-grid"></div>
                <input type="text" id="pi-wallcolor-note" class="ap-input pi-color-note-input" maxlength="80" placeholder="Optionele nuance, bv. 'met een accentwand'">
              </div>
            </div>

            <div class="ap-field">
              <label class="ap-label">Vloer <span class="ap-label-hint">optioneel</span></label>
              <div class="pi-roomtype-grid" id="pi-floor-grid">
                <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Laden...</div>
              </div>
            </div>

            <div class="ap-field">
              <label class="ap-label">Lichtsfeer <span class="ap-label-hint">optioneel</span></label>
              <div class="pi-roomtype-grid" id="pi-lighting-grid">
                <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Laden...</div>
              </div>
            </div>

            <div class="ap-field">
              <label class="ap-label">Renovatiediepte <span class="ap-label-hint">hoe ver mag de visualisatie gaan</span></label>
              <div class="pi-roomtype-grid" id="pi-renovation-grid">
                <div class="pi-empty" style="grid-column:1/-1;padding:8px 0">Laden...</div>
              </div>
              <div class="pi-honesty-note" id="pi-honesty-note" style="display:none">
                <span>⚠</span>
                <span><b>Gebruik dit eerlijk.</b> "Volledige renovatie" toont een aspirational sfeerbeeld, geen belofte over de werkelijke staat van de woning. Gebruik dit als inspiratie in je advertising, niet als vervanging voor een eerlijke beschrijving van de huidige staat — de AI-labeling hieronder blijft sowieso altijd zichtbaar.</span>
              </div>
            </div>

          </div>
        </details>

        <div class="ap-field" style="margin-top:14px">
          <label class="ap-label">Extra instructies <span class="ap-label-hint">optioneel</span></label>
          <textarea id="pi-custom-prompt" class="ap-textarea" rows="2" maxlength="500" placeholder="Bv: behoud de open haard, gebruik warmere kleuren"></textarea>
        </div>

        <div class="ap-actions" style="margin-top:14px">
          <button class="ap-btn ap-btn-primary" id="pi-generate-btn" onclick="generatePiImage()">Genereer AI-beeld</button>
        </div>
        <div class="ap-hint" style="margin-top:6px">Tip: je kan de stijl, het kamertype of de instructies aanpassen en opnieuw klikken — dezelfde foto blijft gebruikt totdat je een nieuwe uploadt.</div>

        <div class="pi-result-wrap" id="pi-result-wrap" style="display:none">
          <div class="ap-field">
            <label class="ap-label">Resultaat <span class="ap-label-hint">sleep de schuifregelaar om voor/na te vergelijken</span></label>
            <div class="pi-compare-stage" id="pi-compare-stage">
              <img class="pi-compare-img" id="pi-compare-before" alt="Voor (originele foto)">
              <img class="pi-compare-img pi-compare-after" id="pi-compare-after" alt="Na (AI-visualisatie)">
              <div class="pi-compare-tag before">Voor</div>
              <div class="pi-compare-tag after">Na (AI)</div>
              <div class="pi-compare-handle" id="pi-compare-handle"></div>
              <input type="range" class="pi-compare-range" id="pi-compare-range" min="0" max="100" value="50" oninput="updatePiCompare(this.value)" aria-label="Sleep om voor en na te vergelijken">
            </div>
            <div class="pi-ai-badge">⚠ <span id="pi-result-label"></span></div>
            <div class="pi-result-actions">
              <button type="button" class="ap-btn ap-btn-secondary" onclick="downloadPiResult()">Download afbeelding</button>
              <button type="button" class="ap-btn ap-btn-secondary" onclick="downloadPiComparePDF()">Download vergelijking (PDF)</button>
            </div>
          </div>
        </div>

        <div class="ap-field" style="margin-top:14px">
          <label class="ap-label">Eerder gegenereerd</label>
          <div id="pi-gallery"><div class="pi-empty">Laden...</div></div>
        </div>
      </div>
    </main>

    <!-- AI Persoonlijkheid Page -->
    <main class="page-content page" id="page-ai-persona">
      <div class="ap-wrap">

        <!-- First-time setup banner (only shown when essential fields are empty) -->
        <div class="ap-welcome-banner" id="ap-welcome-banner" style="display:none">
          <div class="ap-welcome-icon"></div>
          <div class="ap-welcome-body">
            <div class="ap-welcome-title">Welkom bij Helvaro! Eerst even dit invullen.</div>
            <div class="ap-welcome-sub">
              Vul minimaal je <b>AI naam</b>, een <b>welkomstbericht</b> en je <b>website</b> of <b>AI-instructies</b> in.
              Daarna werkt je AI vanaf de eerste lead. Je kan alles later nog aanpassen.
            </div>
            <div class="ap-welcome-checks" id="ap-welcome-checks"></div>
          </div>
        </div>

        <div class="ap-grid">
          <!-- LEFT: form -->
          <div class="ap-form-col">
            <div class="ap-hero">
              <h2 class="ap-hero-title">Jouw AI Persoonlijkheid</h2>
              <p class="ap-hero-sub">Hier bepaal je hoe jouw AI communiceert met leads op WhatsApp. Wijzigingen zijn meteen actief.</p>
            </div>

            <!-- AI Name -->
            <div class="ap-field">
              <label class="ap-label">
                AI naam
                <span class="ap-label-hint">de naam die leads zien in elk bericht</span>
              </label>
              <input id="ap-name" type="text" class="ap-input" placeholder="Sara De Vos" maxlength="60">
              <div class="ap-hint">Tip: gebruik de naam van een echte medewerker. Leads voelen dat ze met een mens chatten. Laat leeg voor standaard <em>Mathis Willems</em>.</div>
            </div>

            <!-- Auto-Reply Template -->
            <div class="ap-field">
              <label class="ap-label">
                Welkomstbericht
                <span class="ap-label-hint">eerste WhatsApp dat een lead ontvangt</span>
              </label>

              <!-- Inspiration library: clickable templates -->
              <div class="ap-tpl-wrap">
                <div class="ap-tpl-header">
                  <span class="ap-tpl-title">Inspiratie</span>
                  <span class="ap-tpl-sub">klik een sjabloon om in te vullen</span>
                </div>
                <div class="ap-tpl-grid" id="ap-tpl-grid"></div>
              </div>

              <textarea id="ap-template" class="ap-textarea" rows="3" placeholder="Hey {naam}! {ai} hier van {bedrijf}. Zag dat je je gegevens achterliet. Wat bracht je bij ons?" maxlength="1000"></textarea>
              <div class="ap-hint">
                Beschikbare placeholders:
                <button type="button" class="ap-chip" onclick="apInsertPlaceholder('{naam}')">{naam}</button>
                <button type="button" class="ap-chip" onclick="apInsertPlaceholder('{bedrijf}')">{bedrijf}</button>
                <button type="button" class="ap-chip" onclick="apInsertPlaceholder('{ai}')">{ai}</button>
                <button type="button" class="ap-chip" onclick="apInsertPlaceholder('{project}')">{project}</button>
                <button type="button" class="ap-chip" onclick="apInsertPlaceholder('{bron}')">{bron}</button>
              </div>
            </div>

            <!-- AI Instructions -->
            <div class="ap-field">
              <label class="ap-label">
                Extra instructies voor de AI
                <span class="ap-label-hint">tone of voice + do's & don'ts</span>
              </label>

              <!-- Inspiration library for instructions -->
              <div class="ap-tpl-wrap">
                <div class="ap-tpl-header">
                  <span class="ap-tpl-title">Inspiratie</span>
                  <span class="ap-tpl-sub">klik om aan je instructies toe te voegen</span>
                </div>
                <div class="ap-tpl-grid" id="ap-instr-grid"></div>
              </div>

              <textarea id="ap-instructions" class="ap-textarea" rows="5" placeholder="Bv: Praat informeel. Stuur nooit prijzen via WhatsApp. Vraag altijd naar het project, de timing en het budget. Vermijd technisch jargon." maxlength="3000"></textarea>
              <div class="ap-hint">De AI volgt deze regels in elk gesprek. Werkt het beste in korte zinnen.</div>
            </div>

            <!-- AI Learned Patterns — wekelijks automatisch ge-update -->
            <div class="ap-field" id="ap-learned-field" style="display:none">
              <label class="ap-label">
                Geleerde patronen
                <span class="ap-label-hint">automatisch ge-update elke maandag o.b.v. afgelopen 7 dagen</span>
              </label>
              <textarea id="ap-learned" class="ap-textarea" rows="6" maxlength="1500" style="background:rgba(var(--accent-rgb),0.04);border-color:rgba(var(--accent-rgb),0.25)"></textarea>
              <div class="ap-hint">
                De AI analyseert wekelijks welke gesprekken het beste werkten en past z'n vragen aan. Je kan dit veld zelf wissen of bewerken.
                <button type="button" class="ap-chip" onclick="clearLearnedPatterns()" style="margin-left:auto">Wissen</button>
              </div>
            </div>

            <!-- Website -->
            <div class="ap-field">
              <label class="ap-label">
                Website
                <span class="ap-label-hint">de AI gebruikt deze als context</span>
              </label>
              <input id="ap-website" type="url" class="ap-input" placeholder="https://www.bedrijf.be">
              <div class="ap-hint">De AI leest je site bij elk gesprek om over jouw diensten te kunnen praten.</div>
            </div>

            <!-- Address -->
            <div class="ap-field">
              <label class="ap-label">
                Adres
                <span class="ap-label-hint">wordt mee gestuurd bij afspraakbevestiging</span>
              </label>
              <input id="ap-address" type="text" class="ap-input" placeholder="Kerkstraat 12, 9000 Gent">
            </div>

            <!-- Calendly veld DEPRECATED. Sinds in_chat booking is dit niet meer
                 actief gebruikt. Hidden input behouden voor backwards-compat zodat
                 oude config-save calls niet crashen. -->
            <input id="ap-calendly" type="hidden" value="">

            <!-- Notifications: WhatsApp number + Email -->
            <div class="ap-field">
              <label class="ap-label">
                Notificatie WhatsApp-nummer
                <span class="ap-label-hint">krijgt een ping bij nieuwe + gekwalificeerde leads</span>
              </label>
              <input id="ap-notify-phone" type="tel" class="ap-input" placeholder="+32 466 35 84 27" inputmode="tel" autocomplete="tel" maxlength="30">
              <div class="ap-hint">Internationaal formaat (begint met <code>+32</code> voor België). Leeg = geen WhatsApp ping.</div>
            </div>

            <div class="ap-field">
              <label class="ap-label">
                Notificatie e-mail
                <span class="ap-label-hint">e-mail bij elke gekwalificeerde lead + escalatie</span>
              </label>
              <input id="ap-report-email" type="email" class="ap-input" placeholder="jij@bedrijf.be" inputmode="email" autocomplete="email" maxlength="100">
              <div class="ap-hint">Krijgt direct e-mail wanneer de AI een gekwalificeerde lead doorgeeft of hulp nodig heeft. Leeg = geen e-mail.</div>
            </div>

            <!-- Booking Method -->
            <div class="ap-field">
              <label class="ap-label">
                Wat moet er gebeuren als een lead gekwalificeerd is?
                <span class="ap-label-hint">kies hoe je de overdracht doet</span>
              </label>
              <div class="ap-lang-row">
                <label class="ap-lang-opt"><input type="radio" name="ap-booking" id="ap-booking-in_chat" value="in_chat"> <span>AI boekt direct in WhatsApp</span></label>
                <label class="ap-lang-opt"><input type="radio" name="ap-booking" id="ap-booking-callback" value="callback"> <span>Een collega contacteert ze</span></label>
              </div>
              <div class="ap-hint" id="ap-booking-hint-in_chat" style="display:none;">De AI vraagt aan de lead welk moment past, stelt een concrete tijd voor, en boekt het na bevestiging direct in je agenda. Geen externe tool nodig. Zorg dat je werkuren ingevuld zijn.</div>
              <div class="ap-hint" id="ap-booking-hint-callback" style="display:none;">De AI zegt tegen de lead dat een collega hen contacteert. Geen agenda nodig. Jij krijgt een melding op je notificatie-nummer.</div>
            </div>

            <!-- Callback Window (only shown if callback selected) -->
            <div class="ap-field" id="ap-callback-window-wrap" style="display:none;">
              <label class="ap-label">
                Wanneer contacteer je terug?
                <span class="ap-label-hint">deze tekst wordt naar de lead gestuurd</span>
              </label>
              <input id="ap-callback-window" type="text" class="ap-input" placeholder="binnen 30 minuten" maxlength="100">
              <div class="ap-hint">
                Voorbeelden:
                <button type="button" class="ap-chip" onclick="document.getElementById('ap-callback-window').value='binnen 30 minuten'">binnen 30 minuten</button>
                <button type="button" class="ap-chip" onclick="document.getElementById('ap-callback-window').value='binnen 1 uur'">binnen 1 uur</button>
                <button type="button" class="ap-chip" onclick="document.getElementById('ap-callback-window').value='vandaag nog'">vandaag nog</button>
                <button type="button" class="ap-chip" onclick="document.getElementById('ap-callback-window').value='binnen 24 uur'">binnen 24 uur</button>
              </div>
            </div>

            <!-- Language -->
            <div class="ap-field">
              <label class="ap-label">
                Taal van je leads
                <span class="ap-label-hint">bepaalt taal van lead-form + WhatsApp gesprek</span>
              </label>
              <select id="ap-lang-select" class="ap-input"></select>
              <div class="ap-hint">Standaardtaal waarin de AI antwoordt, ongeacht wat de lead schrijft (tenzij je hieronder taal-matching aanzet). Wijzig je dit: vanaf het volgende gesprek werkt het.</div>
              <label class="ap-checkbox-row" style="margin-top:14px">
                <input type="checkbox" id="ap-match-lead-lang">
                <span>Antwoord in de taal van de lead</span>
              </label>
              <div class="ap-hint">Optioneel. De AI herkent per bericht in welke taal de lead schrijft en antwoordt daarin — met de taal hierboven als terugval wanneer dat onduidelijk is. Handig als je leads in meerdere talen binnenkrijgt (bv. NL, FR, EN in Brussel).</div>
            </div>

            <!-- Working Hours -->
            <div class="ap-field">
              <label class="ap-label">
                Werkuren
                <span class="ap-label-hint">context voor de AI. Gesprek loopt altijd door</span>
              </label>
              <input id="ap-hours" type="text" class="ap-input" placeholder="ma-vr 9-18">
              <div class="ap-hint">
                Format: <span id="ap-hours-format-list"><code>ma-vr 9-18</code>, <code>ma-za 8-20</code>, <code>di-za 10-18</code></span>. De AI is 24/7 actief. Werkuren worden alleen genoemd om verwachtingen te zetten ("we bellen morgen vanaf 9u terug").
                Voorbeelden:
                <span id="ap-hours-chips"></span>
              </div>
            </div>

            <!-- Trust Badges -->
            <div class="ap-field">
              <label class="ap-label">
                Trust badges onderaan formulier
                <span class="ap-label-hint">max 3, gescheiden met |</span>
              </label>
              <input id="ap-badges" type="text" class="ap-input" placeholder="15 jaar ervaring | ISO-gecertificeerd | Lokaal Gent" maxlength="300">
              <div class="ap-hint">
                Vervang de standaard badges (Geen spam / Reactie binnen 1 min / Vrijblijvend) met eigen sociaal bewijs. Eerste emoji is het icoon, rest is de tekst.
              </div>
            </div>

            <!-- AI Photo: file picker (with URL fallback) -->
            <div class="ap-field">
              <label class="ap-label">
                Foto van je AI-persoon
                <span class="ap-label-hint">PNG / JPG / WebP. Wordt automatisch bijgeknipt</span>
              </label>
              <div class="ap-photo-row">
                <div class="ap-photo-preview" id="ap-photo-preview" aria-label="Voorbeeld AI foto">
                  <span class="ap-photo-placeholder">+</span>
                </div>
                <div class="ap-photo-controls">
                  <input type="file" id="ap-photo-file" accept="image/png,image/jpeg,image/webp" style="display:none" onchange="handlePhotoFile(this)">
                  <button type="button" class="ap-btn ap-btn-secondary" onclick="document.getElementById('ap-photo-file').click()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Foto kiezen
                  </button>
                  <button type="button" class="ap-btn ap-btn-link" id="ap-photo-remove" onclick="removePhoto()" style="display:none">Verwijderen</button>
                </div>
              </div>
              <input id="ap-photo" type="hidden">
              <details class="ap-photo-advanced">
                <summary>Geavanceerd: externe URL plakken</summary>
                <input id="ap-photo-url" type="url" class="ap-input" placeholder="https://..." oninput="handlePhotoUrlInput(this)">
                <div class="ap-hint">Optioneel. Link naar een foto die je elders host (bv. CDN). Wordt overschreven zodra je een bestand kiest.</div>
              </details>
            </div>

            <!-- Brand Color -->
            <div class="ap-field">
              <label class="ap-label">
                Brand-kleur
                <span class="ap-label-hint">accenten op je lead-formulier</span>
              </label>
              <div class="ap-color-row">
                <input id="ap-color" type="text" class="ap-input ap-color-input" placeholder="#E8D7B1" maxlength="7">
                <input id="ap-color-pick" type="color" class="ap-color-swatch" value="#E8D7B1">
              </div>
              <div class="ap-hint">Hex-code (bv. <code>#16a34a</code>). Vertegenwoordigt jouw bedrijfskleur op de lead-form knoppen + accenten. Leeg = standaard zand.</div>
            </div>

            <!-- Form Intro Message -->
            <div class="ap-field">
              <label class="ap-label">
                Tekst op de lead-form (optioneel)
                <span class="ap-label-hint">eigen welkomstboodschap</span>
              </label>
              <textarea id="ap-form-intro" class="ap-textarea" rows="2" placeholder="Hey ik help je graag. Laat hieronder je gegevens achter en je hoort meteen van me." maxlength="600"></textarea>
              <div class="ap-hint">Verschijnt als chat-bubbel bovenaan je lead-form (onder de avatar). Leeg = automatische sector-tekst. Placeholders: <code>{ai}</code>, <code>{bedrijf}</code>.</div>
            </div>

            <!-- Save button row -->
            <div class="ap-actions">
              <button class="ap-btn ap-btn-primary" id="ap-save-btn" onclick="saveAiPersona()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Opslaan
              </button>
              <span class="ap-saved-mark" id="ap-saved-mark">Opgeslagen</span>
            </div>
          </div>

          <!-- RIGHT: live preview + test send -->
          <div class="ap-preview-col">
            <div class="ap-preview-sticky">
              <div class="ap-preview-card">
                <div class="ap-phone-mock">
                  <div class="ap-phone-hdr">
                    <div class="ap-phone-back">‹</div>
                    <div class="ap-phone-avatar" id="ap-preview-avatar">M</div>
                    <div class="ap-phone-info">
                      <div class="ap-phone-name" id="ap-preview-name">Mathis Willems</div>
                      <div class="ap-phone-status">online</div>
                    </div>
                  </div>
                  <div class="ap-phone-msgs">
                    <div class="ap-msg-day-divider">Vandaag</div>
                    <div class="ap-msg ap-msg-them" id="ap-preview-bubble">Hey Jan! Mathis hier van Bedrijf. Zag dat je je gegevens achterliet. Wat bracht je bij ons?</div>
                  </div>
                </div>
              </div>

              <!-- Test send -->
              <div class="ap-test-card">
                <div class="ap-test-title">Stuur jezelf een test</div>
                <p class="ap-test-sub">Voer je telefoonnummer in. Je krijgt het welkomstbericht via WhatsApp.</p>
                <div class="ap-test-row">
                  <input id="ap-test-phone" type="tel" inputmode="tel" autocomplete="tel" class="ap-input" placeholder="0466 35 84 27">
                  <button class="ap-btn" id="ap-test-btn" onclick="sendTestMessage()">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Test
                  </button>
                </div>
                <div class="ap-test-result" id="ap-test-result"></div>
              </div>

              <!-- Form Link compact card. Points to dedicated Formulier page -->
              <div class="ap-formlink-card">
                <div class="ap-test-title">Jouw lead-formulier</div>
                <p class="ap-test-sub">Deel deze link via je website, advertenties of socials.</p>
                <div class="ap-formlink-url-row">
                  <code class="ap-formlink-url" id="ap-formlink-url">—</code>
                  <button class="ap-btn" onclick="copyFormLink()" title="Kopieer link">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Kopieer
                  </button>
                </div>
                <div class="ap-formlink-actions">
                  <button class="ap-formlink-link" onclick="navigateTo('formulier')">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    QR, embed-code &amp; meer →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Formulier Page. Share your lead form link in 3 ways -->
    <main class="page-content page" id="page-formulier">
      <div class="fm-wrap">

        <!-- Form submission stats. What's the form actually delivering -->
        <div class="fm-stats">
          <div class="fm-stat-card">
            <div class="fm-stat-num" id="fm-stat-week">—</div>
            <div class="fm-stat-lbl">Aanvragen deze week</div>
            <div class="fm-stat-delta" id="fm-stat-week-delta"></div>
          </div>
          <div class="fm-stat-card">
            <div class="fm-stat-num" id="fm-stat-month">—</div>
            <div class="fm-stat-lbl">Aanvragen deze maand</div>
            <div class="fm-stat-delta" id="fm-stat-month-delta"></div>
          </div>
          <div class="fm-stat-card">
            <div class="fm-stat-num" id="fm-stat-total">—</div>
            <div class="fm-stat-lbl">Totaal aanvragen</div>
            <div class="fm-stat-delta" id="fm-stat-total-sub"></div>
          </div>
          <div class="fm-stat-card">
            <div class="fm-stat-num" id="fm-stat-conv">—%</div>
            <div class="fm-stat-lbl">Gekwalificeerd</div>
            <div class="fm-stat-delta" id="fm-stat-conv-sub"></div>
          </div>
        </div>

        <!-- Hero card with the URL itself -->
        <div class="fm-hero">
          <div class="fm-hero-top">
            <div class="fm-hero-icon"></div>
            <div class="fm-hero-text">
              <h2 class="fm-hero-title">Jouw lead-formulier</h2>
              <p class="fm-hero-sub">Iedereen die dit formulier invult krijgt automatisch een WhatsApp van je AI en verschijnt in je Dashboard.</p>
            </div>
          </div>
          <div class="fm-url-row">
            <code class="fm-url" id="fm-url">—</code>
            <button class="fm-btn fm-btn-primary" onclick="copyFormLink()" title="Kopieer link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Kopieer link
            </button>
            <a class="fm-btn" id="fm-open" target="_blank" rel="noopener">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open in nieuw tabblad
            </a>
          </div>
          <!-- Quick share -->
          <div class="fm-share-row">
            <span class="fm-share-lbl">Snel delen:</span>
            <a class="fm-share-btn" id="fm-share-wa"     target="_blank" rel="noopener" title="Deel via WhatsApp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4 0-.6.1-.2.3-.7.9-.9 1.1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4 0-.7.3-.3.3-.9.9-.9 2.2 0 1.3.9 2.5 1 2.7.1.1 1.8 2.7 4.3 3.7.6.2 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3z"/><path d="M12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.6 1.4 5.1L2 22l5-1.3c1.4.8 3.1 1.3 5 1.3 5.5 0 10-4.5 10-10S17.5 2 12 2zm0 18c-1.7 0-3.3-.5-4.6-1.3l-.3-.2-3 .8.8-2.9-.2-.3C3.8 14.9 3.2 13.5 3.2 12c0-4.8 4-8.8 8.8-8.8s8.8 4 8.8 8.8-3.9 8.8-8.8 8.8z"/></svg>
              WhatsApp
            </a>
            <a class="fm-share-btn" id="fm-share-email"   title="Deel via e-mail">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              E-mail
            </a>
            <a class="fm-share-btn" id="fm-share-sms"     title="Deel via SMS">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              SMS
            </a>
            <a class="fm-share-btn" id="fm-share-linkedin" target="_blank" rel="noopener" title="Deel op LinkedIn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
              LinkedIn
            </a>
          </div>
        </div>

        <!-- Three integration options as cards -->
        <div class="fm-options-grid">

          <!-- Option 1: Widget script (recommended) -->
          <div class="fm-option-card">
            <div class="fm-option-hdr">
              <span class="fm-option-rec">Aanbevolen</span>
              <div class="fm-option-title">Drijvende WhatsApp-knop op je site</div>
              <p class="fm-option-sub">Eén regel code. Toont een ronde "chat met ons" knop rechtsonder op elke pagina. Klant klikt → formulier opent als pop-up.</p>
            </div>
            <textarea class="fm-code" id="fm-code-widget" readonly rows="3"></textarea>
            <div class="fm-code-actions">
              <button class="fm-btn fm-btn-full" onclick="fmCopy('fm-code-widget')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Kopieer code
              </button>
              <button class="fm-btn fm-btn-full" onclick="fmEmailDev('widget')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Stuur naar developer
              </button>
            </div>
            <div class="fm-instructions">
              <strong>Hoe te plakken:</strong> open de HTML van je website, plak deze regel net vóór de afsluitende <code>&lt;/body&gt;</code> tag. Werkt op WordPress, Shopify, Wix, Squarespace en elke andere site.
            </div>
          </div>

          <!-- Option 2: Iframe embed -->
          <div class="fm-option-card">
            <div class="fm-option-hdr">
              <div class="fm-option-title">Inbouwen als pagina-onderdeel</div>
              <p class="fm-option-sub">Toont het formulier <em>direct</em> op je pagina (geen pop-up). Goed voor een "neem contact op" sectie of een landingspagina.</p>
            </div>
            <textarea class="fm-code" id="fm-code-iframe" readonly rows="3"></textarea>
            <div class="fm-code-actions">
              <button class="fm-btn fm-btn-full" onclick="fmCopy('fm-code-iframe')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Kopieer code
              </button>
              <button class="fm-btn fm-btn-full" onclick="fmEmailDev('iframe')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                Stuur naar developer
              </button>
            </div>
            <div class="fm-instructions">
              <strong>Hoe te plakken:</strong> plak op de plek waar je het formulier wil tonen. Meestal in een "Contact" of "Aanvraag" sectie. Hoogte (<code>height="640"</code>) is aanpasbaar.
            </div>
          </div>

          <!-- Option 3: Direct link -->
          <div class="fm-option-card">
            <div class="fm-option-hdr">
              <div class="fm-option-title">Alleen de link</div>
              <p class="fm-option-sub">Voor advertenties, e-mail handtekening, socials of WhatsApp-bio. Klant opent een eigen pagina met enkel het formulier.</p>
            </div>
            <textarea class="fm-code" id="fm-code-link" readonly rows="1"></textarea>
            <button class="fm-btn fm-btn-full" onclick="fmCopy('fm-code-link')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Kopieer link
            </button>
            <div class="fm-instructions">
              <strong>Gebruik in:</strong> Facebook / Google Ads, e-mail handtekening, Instagram bio, LinkedIn berichten, visitekaartjes (samen met de QR-code hieronder).
            </div>
          </div>
        </div>

        <!-- Installation guide. Platform-specific step-by-step -->
        <div class="fm-guide-card">
          <div class="fm-guide-hdr">
            <div class="fm-option-title">Installatie-handleiding per platform</div>
            <p class="fm-option-sub">Klik op het platform dat je gebruikt voor een stap-voor-stap uitleg. Werkt op ALLE moderne websites.</p>
          </div>

          <!-- WordPress -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">WordPress</span>
              <span class="fm-guide-meta">2 manieren</span>
            </summary>
            <div class="fm-guide-body">
              <p><strong>Optie A. Via plugin (makkelijkst, géén code in je theme):</strong></p>
              <ol>
                <li>In WP dashboard → <strong>Plugins</strong> → <strong>Nieuwe plugin</strong></li>
                <li>Zoek naar <em>"Insert Headers and Footers"</em> (door WPBeginner) → <strong>Installeer</strong> → <strong>Activeer</strong></li>
                <li>Ga naar <strong>Instellingen</strong> → <strong>Insert Headers and Footers</strong></li>
                <li>Plak de Drijvende WhatsApp-knop code in het veld <strong>"Scripts in Footer"</strong></li>
                <li>Klik <strong>Save</strong>. klaar! Ververs je site, je ziet de knop rechtsonder.</li>
              </ol>
              <p><strong>Optie B. Direct in theme (voor developers):</strong></p>
              <ol>
                <li>WP dashboard → <strong>Uiterlijk</strong> → <strong>Theme Editor</strong></li>
                <li>Open <code>footer.php</code> in de rechter kolom</li>
                <li>Plak de code <em>vlak voor</em> de <code>&lt;/body&gt;</code> tag</li>
                <li>Klik <strong>Bestand bijwerken</strong></li>
              </ol>
              <div class="fm-guide-tip"><strong>Tip:</strong> Optie A overleeft theme-updates. Optie B niet. Kies daarom A tenzij je weet wat je doet.</div>
            </div>
          </details>

          <!-- Shopify -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">Shopify</span>
              <span class="fm-guide-meta">~2 min</span>
            </summary>
            <div class="fm-guide-body">
              <ol>
                <li>Shopify admin → <strong>Online Store</strong> → <strong>Themes</strong></li>
                <li>Bij je actieve thema, klik <strong>...</strong> → <strong>Edit code</strong></li>
                <li>In de linker kolom onder <strong>Layout</strong>, open <code>theme.liquid</code></li>
                <li>Scroll naar beneden tot je de <code>&lt;/body&gt;</code> tag vindt</li>
                <li>Plak de Drijvende WhatsApp-knop code op de regel <em>vlak boven</em> <code>&lt;/body&gt;</code></li>
                <li>Klik <strong>Save</strong> rechtsboven</li>
              </ol>
              <div class="fm-guide-tip">De knop verschijnt op élke pagina van je winkel. Productpagina's, collectiepagina's, blog, alles.</div>
            </div>
          </details>

          <!-- Wix -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">Wix</span>
              <span class="fm-guide-meta">~3 min</span>
            </summary>
            <div class="fm-guide-body">
              <ol>
                <li>Open je Wix editor of dashboard</li>
                <li>Ga naar <strong>Settings</strong> (Instellingen) → <strong>Custom Code</strong> (Aangepaste code)</li>
                <li>Klik <strong>+ Add Custom Code</strong> (Voeg code toe)</li>
                <li>Plak de Drijvende WhatsApp-knop code in het tekstvak</li>
                <li>Geef het een naam: bv. <em>"Helvaro Lead Form"</em></li>
                <li>Bij <strong>Add Code to Pages</strong>: kies <strong>All Pages</strong> + <strong>Load code once</strong></li>
                <li>Bij <strong>Place Code in</strong>: kies <strong>Body. End</strong></li>
                <li>Klik <strong>Apply</strong> → publiceer je site</li>
              </ol>
              <div class="fm-guide-tip">Custom Code werkt enkel op <strong>Wix Premium</strong> plans (vanaf €4/mnd). Free Wix-sites ondersteunen geen custom code. Gebruik dan de directe link of QR-code.</div>
            </div>
          </details>

          <!-- Squarespace -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji">⬛</span>
              <span class="fm-guide-label">Squarespace</span>
              <span class="fm-guide-meta">~2 min</span>
            </summary>
            <div class="fm-guide-body">
              <ol>
                <li>Squarespace dashboard → kies je site</li>
                <li>Ga naar <strong>Settings</strong> → <strong>Advanced</strong> → <strong>Code Injection</strong></li>
                <li>Plak de Drijvende WhatsApp-knop code in het veld <strong>"Footer"</strong></li>
                <li>Klik <strong>Save</strong> bovenaan</li>
              </ol>
              <div class="fm-guide-tip">Code Injection is beschikbaar vanaf het <strong>Business</strong> plan. Op Personal plan: gebruik een <em>Code Block</em> in een sectie, of gebruik enkel de directe link.</div>
            </div>
          </details>

          <!-- Webflow -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">Webflow</span>
              <span class="fm-guide-meta">~2 min</span>
            </summary>
            <div class="fm-guide-body">
              <ol>
                <li>Open je Webflow project</li>
                <li>Klik op het <strong>Settings</strong> (tandwiel) icoon links</li>
                <li>Ga naar tabblad <strong>Custom Code</strong></li>
                <li>Plak de Drijvende WhatsApp-knop code in het veld <strong>"Footer Code"</strong></li>
                <li>Klik <strong>Save Changes</strong></li>
                <li>Klik <strong>Publish</strong> rechtsboven om live te zetten</li>
              </ol>
              <div class="fm-guide-tip">Footer Code wordt op élke pagina ingeladen. Voor een test: publiceer eerst naar je <code>.webflow.io</code> subdomain.</div>
            </div>
          </details>

          <!-- Framer -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">Framer</span>
              <span class="fm-guide-meta">~2 min</span>
            </summary>
            <div class="fm-guide-body">
              <ol>
                <li>Open je Framer site</li>
                <li>Klik op <strong>Site Settings</strong> (de drie streepjes linksboven → Settings)</li>
                <li>Ga naar <strong>General</strong> → scroll naar <strong>Custom Code</strong></li>
                <li>Plak de Drijvende WhatsApp-knop code in het veld <strong>"End of &lt;body&gt; tag"</strong></li>
                <li>Klik <strong>Save</strong> en daarna <strong>Publish</strong></li>
              </ol>
            </div>
          </details>

          <!-- Google Sites -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">Google Sites</span>
              <span class="fm-guide-meta">enkel iframe</span>
            </summary>
            <div class="fm-guide-body">
              <p>Google Sites ondersteunt geen <code>&lt;script&gt;</code> tags. Daarom werkt de drijvende WhatsApp-knop niet. Gebruik in plaats daarvan de <strong>iframe embed</strong>:</p>
              <ol>
                <li>Open je Google Sites pagina</li>
                <li>Klik <strong>Insert</strong> → <strong>Embed</strong></li>
                <li>Kies tabblad <strong>Embed code</strong></li>
                <li>Plak de iframe-code (de tweede optie hierboven)</li>
                <li>Klik <strong>Next</strong> → <strong>Insert</strong></li>
                <li>Pas de grootte aan zoals gewenst → <strong>Publish</strong></li>
              </ol>
              <div class="fm-guide-tip">Alternatief: deel gewoon de <strong>directe link</strong> in een knop of menu-item.</div>
            </div>
          </details>

          <!-- Generic HTML -->
          <details class="fm-guide-item">
            <summary>
              <span class="fm-guide-emoji"></span>
              <span class="fm-guide-label">Custom HTML / eigen code</span>
              <span class="fm-guide-meta">developers</span>
            </summary>
            <div class="fm-guide-body">
              <ol>
                <li>Open het HTML-bestand van je site (meestal <code>index.html</code> of een gedeelde footer template)</li>
                <li>Plak de Drijvende WhatsApp-knop code <em>vlak vóór</em> de <code>&lt;/body&gt;</code> tag</li>
                <li>Deploy/upload naar je hosting (FTP, Vercel, Netlify, GitHub Pages, …)</li>
              </ol>
              <p>Voor frameworks zoals <strong>Next.js / React / Vue</strong>: voeg het toe in de root layout file (<code>_app.tsx</code>, <code>App.vue</code>, …) met een <code>useEffect</code> die de script-tag dynamisch invoegt, of via <code>next/script</code> met <code>strategy="afterInteractive"</code>.</p>
              <div class="fm-guide-tip">Voor Next.js: <code>&lt;Script src="https://app.helvaro.pro/form-widget.js" data-project="..." data-name="..." strategy="afterInteractive" /&gt;</code></div>
            </div>
          </details>

          <!-- Test instructions -->
          <div class="fm-guide-test">
            <strong>Hoe weet ik of het werkt?</strong>
            Open je site in een privé/incognito venster. Wacht 2 seconden. Je moet een ronde blauwe chat-knop rechtsonder zien staan. Klik erop. Het Helvaro formulier opent als pop-up. Vul een test-aanvraag in om te checken of het lead in je dashboard verschijnt.
          </div>
        </div>

        <!-- QR + preview side by side -->
        <div class="fm-bottom-grid">
          <div class="fm-qr-card">
            <div class="fm-option-hdr">
              <div class="fm-option-title">QR-code</div>
              <p class="fm-option-sub">Scanbaar met elke smartphone-camera. Print op flyers, beursstanden, etalage-stickers, visitekaartjes.</p>
            </div>
            <div class="fm-qr-frame">
              <img id="fm-qr-img" alt="QR-code naar formulier" width="240" height="240">
            </div>
            <a class="fm-btn fm-btn-full" id="fm-qr-download" download="lead-formulier-qr.png">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download als PNG
            </a>
          </div>

          <div class="fm-preview-card">
            <div class="fm-option-hdr">
              <div class="fm-option-title">Voorbeeld</div>
              <p class="fm-option-sub">Zo ziet je formulier eruit voor een lead.</p>
            </div>
            <div class="fm-iframe-wrap">
              <iframe id="fm-preview-iframe" loading="lazy" title="Voorbeeld van het formulier"></iframe>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Instellingen Page -->
    <main class="page-content page" id="page-instellingen">
      <div class="settings-wrap">
        <!-- AI Instellingen -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            AI Instellingen
          </div>
          <div class="settings-info-box">
            Pas de AI-naam, welkomstbericht, werkuren en boekingsmodus aan via de <a href="#" onclick="navigateTo('ai-persona');return false;" style="color:var(--accent);text-decoration:none">AI Persoonlijkheid</a> pagina. Hulp nodig? <a href="mailto:${SUPPORT_EMAIL_ATTR}" style="color:var(--accent);text-decoration:none">${SUPPORT_EMAIL_ATTR}</a>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">AI Naam</div>
              <div class="settings-label-sub">De naam die je AI-assistent gebruikt</div>
            </div>
            <div class="settings-value" id="set-ai-name">Helvaro AI</div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Boekingsmodus</div>
              <div class="settings-label-sub">Hoe afspraken worden ingepland</div>
            </div>
            <div class="settings-value" id="set-calendly-url" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">AI boekt in WhatsApp</div>
          </div>
        </div>

        <!-- Notificaties -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Notificaties
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Wekelijks rapport e-mail</div>
              <div class="settings-label-sub">Elke maandag een samenvatting van leads + conversie naar je notificatie-mail</div>
            </div>
            <div class="settings-toggle">
              <span style="font-size:12px;color:var(--green);font-weight:600;display:inline-flex;align-items:center;gap:6px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Actief
              </span>
            </div>
          </div>
        </div>

        <!-- Account -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Account
          </div>
          <div class="settings-row">
            <div class="settings-label">Naam</div>
            <div class="settings-value" id="set-naam">—</div>
          </div>
          <div class="settings-row">
            <div class="settings-label">E-mail</div>
            <div class="settings-value" id="set-email">—</div>
          </div>
          <div class="settings-row">
            <div class="settings-label">Plan</div>
            <div class="settings-value">
              <span style="display:inline-flex;align-items:center;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:600;background:rgba(var(--accent-rgb),0.15);border:1px solid rgba(var(--accent-rgb),0.3);color:var(--accent-bright)">Pro</span>
            </div>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">API Sleutel</div>
              <div class="settings-label-sub">Gebruik dit voor directe API-toegang</div>
            </div>
            <div>
              <span class="settings-apikey" id="set-apikey-display">••••••••</span>
              <button class="btn-show-key" id="btn-toggle-apikey">Toon</button>
            </div>
          </div>
        </div>

        <!-- Support -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Support
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Hulp nodig?</div>
              <div class="settings-label-sub">Ons team helpt je graag verder</div>
            </div>
            <a href="mailto:${SUPPORT_EMAIL_ATTR}" class="btn-icon" style="text-decoration:none;border-color:rgba(var(--accent-rgb),0.35);color:var(--accent);background:rgba(var(--accent-rgb),0.08)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              Mail sturen
            </a>
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">E-mailadres support</div>
              <div class="settings-label-sub">Bereikbaar op werkdagen</div>
            </div>
            <div class="settings-value"><a href="mailto:${SUPPORT_EMAIL_ATTR}" style="color:var(--accent);text-decoration:none">${SUPPORT_EMAIL_ATTR}</a></div>
          </div>
        </div>

        <!-- Google Agenda -->
        <div class="settings-section">
          <div class="settings-section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Google Agenda
          </div>
          <div class="settings-row">
            <div>
              <div class="settings-label">Koppel je Google Agenda</div>
              <div class="settings-label-sub" id="gcal-status-sub">Zo checkt de AI je beschikbaarheid en zet geboekte afspraken automatisch in je agenda.</div>
            </div>
            <div id="gcal-actions">
              <button class="btn-icon" id="btn-gcal-connect" onclick="connectGoogleCalendar()" style="border-color:rgba(var(--accent-rgb),0.35);color:var(--accent);background:rgba(var(--accent-rgb),0.08)">Koppel Google Agenda</button>
              <button class="btn-icon" id="btn-gcal-disconnect" onclick="disconnectGoogleCalendar()" style="display:none;border-color:rgba(var(--error-rgb),0.35);color:var(--red);background:rgba(var(--error-rgb),0.08)">Ontkoppel</button>
            </div>
          </div>
        </div>

        <!-- Gevaar zone -->
        <div class="settings-section">
          <div class="settings-section-title" style="color:var(--red)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Gevaar zone
          </div>
          <div class="settings-row settings-danger">
            <div>
              <div class="settings-label">Uitloggen</div>
              <div class="settings-label-sub">Beëindig je huidige sessie</div>
            </div>
            <button class="btn-icon" onclick="logout()" style="border-color:rgba(var(--error-rgb),0.35);color:var(--red);background:rgba(var(--error-rgb),0.08)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Uitloggen
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Activiteit Page -->
    <main class="page-content page" id="page-activiteit">
      <div class="activity-feed-wrap">
        <div class="activity-feed-header">Recente Activiteit</div>
        <div class="activity-feed" id="activity-feed">
          <div style="padding:20px 0;color:var(--text-muted);font-size:13px">Laden...</div>
        </div>
      </div>
    </main>

    <!-- Profile page -->
    <main class="page-content page" id="page-profile">
      <div class="profile-wrap">
        <!-- Hero card -->
        <div class="profile-hero">
          <div class="profile-avatar-lg" id="profile-avatar-lg">HV</div>
          <div>
            <div class="profile-name-lg" id="profile-name-lg">Gebruiker</div>
            <div class="profile-email-lg" id="profile-email-lg">—</div>
            <span class="profile-badge">Client Account</span>
          </div>
        </div>

        <!-- Stats row -->
        <div class="profile-stats-row" id="profile-stats-row"></div>

        <!-- Info cards -->
        <div class="profile-cards">
          <div class="profile-card">
            <div class="profile-card-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Account
            </div>
            <div class="profile-row"><span>Naam</span><strong id="pf-naam">—</strong></div>
            <div class="profile-row"><span>E-mail</span><strong id="pf-email">—</strong></div>
            <div class="profile-row"><span>Type</span><strong>Client Account</strong></div>
          </div>

          <div class="profile-card">
            <div class="profile-card-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Boekingssysteem
            </div>
            <div class="profile-row"><span>Status</span><span id="pf-cal-status" style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:20px;background:rgba(var(--success-rgb),0.15);color:var(--success);">Actief</span></div>
            <div class="profile-row"><span>Modus</span>
              <span id="pf-calendly" style="color:var(--text-primary);font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px;">AI boekt direct in WhatsApp gesprek</span>
            </div>
            <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap;">
              <button onclick="navigateTo('kalender')" style="display:inline-flex;align-items:center;gap:6px;padding:9px 18px;background:var(--accent);border:none;border-radius:10px;color: var(--on-accent);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Open agenda
              </button>
              <!-- Hidden elementen voor backwards compat. Oude JS in renderProfile() refereert ze nog. -->
              <a id="pf-connect-btn" href="#" style="display:none"></a>
              <a id="pf-calendly-open" href="#" style="display:none"></a>
            </div>
          </div>

          <div class="profile-card">
            <div class="profile-card-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Activiteit
            </div>
            <div class="profile-row"><span>Totaal leads</span><strong id="pf-total">—</strong></div>
            <div class="profile-row"><span>Gekwalificeerd</span><strong id="pf-qual">—</strong></div>
            <div class="profile-row"><span>Afspraken</span><strong id="pf-booked">—</strong></div>
            <div class="profile-row"><span>Conversie</span><strong id="pf-conv">—</strong></div>
          </div>
        </div>

        <!-- Recent Leads on Profile -->
        <div class="profile-section-title">Recente Leads</div>
        <div class="profile-recent-leads" id="profile-recent-leads">
          <div style="color:var(--text-muted);font-size:13px">Laden...</div>
        </div>

        <!-- Quick Actions -->
        <div class="profile-section-title">Snelle Acties</div>
        <div class="profile-quick-actions">
          <button class="profile-action-btn" onclick="navigateTo('dashboard')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Naar Dashboard
          </button>
          <button class="profile-action-btn" onclick="navigateTo('kalender')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Kalender Bekijken
          </button>
          <button class="profile-action-btn" onclick="navigateTo('gesprekken')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Gesprekken
          </button>
          <button class="profile-action-btn" onclick="navigateTo('exports')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Data Exporteren
          </button>
        </div>
      </div>
    </main>

    <!-- ─── Founder Dashboard ─── -->
    <main class="page-content page" id="page-founder">
      <div class="fdr-wrap">

        <!-- Hero header: day + deadline -->
        <div class="fdr-hero">
          <div class="fdr-hero-left">
            <div class="fdr-day" id="fdr-dayname">—</div>
            <div class="fdr-date" id="fdr-date">—</div>
            <div class="fdr-subtitle">Helvaro. Roadmap naar 5 klanten</div>
            <div class="fdr-persona-greeting" id="fdr-persona-greeting"></div>
          </div>
          <div class="fdr-hero-right">
            <div class="fdr-deadline-label">Deadline</div>
            <div class="fdr-deadline-val" id="fdr-deadline-val">—</div>
            <div class="fdr-deadline-days" id="fdr-days-left">— dagen</div>
          </div>
        </div>

        <!-- Main two-column grid -->
        <div class="fdr-main-grid">

          <!-- LEFT: daily checklist -->
          <div class="fdr-panel fdr-panel-checklist">
            <div class="fdr-panel-hdr">
              <span class="fdr-panel-title">Checklist van Vandaag</span>
              <span class="fdr-task-progress" id="fdr-task-progress">0 / 0 voltooid</span>
            </div>
            <div class="fdr-checklist" id="fdr-checklist">
              <div style="padding:24px 18px;color:var(--text-muted);font-size:13px">Laden...</div>
            </div>
            <div class="fdr-progress-bar-wrap">
              <div class="fdr-progress-bar" id="fdr-progress-bar" style="width:0%"></div>
            </div>
          </div>

          <!-- RIGHT: stats + goal + pipeline mini -->
          <div class="fdr-right-col">

            <!-- Stats 2x2 -->
            <div class="fdr-stats-grid fdr-panel">
              <div class="fdr-stat"><div class="fdr-stat-val" id="f-stat-clients" style="color:var(--accent-bright)">—</div><div class="fdr-stat-lbl">Klanten</div></div>
              <div class="fdr-stat"><div class="fdr-stat-val" id="f-stat-leads" style="color:var(--green)">—</div><div class="fdr-stat-lbl">Leads/mnd</div></div>
              <div class="fdr-stat"><div class="fdr-stat-val" id="f-stat-qual" style="color:var(--orange)">—%</div><div class="fdr-stat-lbl">Gekwalificeerd</div></div>
              <div class="fdr-stat"><div class="fdr-stat-val" id="f-stat-new" style="color:var(--red)">—</div><div class="fdr-stat-lbl">Ongelezen</div></div>
            </div>

            <!-- Goal: 5 clients -->
            <div class="fdr-panel fdr-goal-panel">
              <div class="fdr-goal-hdr">
                <span>Doel. 5 klanten voor 20 jun</span>
                <button class="fdr-refresh-btn" onclick="loadFounderData(true)">↻</button>
              </div>
              <div class="fdr-goal-big">
                <span class="fdr-goal-current" id="fdr-goal-current">0</span>
                <span class="fdr-goal-sep">/</span>
                <span class="fdr-goal-target">5</span>
                <span class="fdr-goal-unit">klanten</span>
              </div>
              <div class="fdr-goal-bar-wrap">
                <div class="fdr-goal-bar-fill" id="fdr-goal-bar" style="width:0%"></div>
              </div>
              <div class="fdr-goal-pct" id="fdr-goal-pct">0% bereikt</div>
            </div>

            <!-- MRR + Profit -->
            <div class="fdr-panel fdr-mrr-panel">
              <div class="fdr-mrr-hdr">Maandelijks Inkomen (MRR)</div>
              <div class="fdr-mrr-val" id="fdr-mrr-val">€0</div>
              <div class="fdr-mrr-sub" id="fdr-mrr-sub">0 betalende klanten</div>
              <div class="fdr-mrr-target">
                <span class="fdr-mrr-arrow">→</span>
                <span id="fdr-mrr-target">Doel: €5.000/mnd bij 5 klanten</span>
              </div>
              <hr class="fdr-profit-divider">
              <div class="fdr-profit-rows">
                <div class="fdr-profit-row"><span class="lbl">Vaste kosten <button class="fdr-cost-edit-btn" onclick="editCost('fixed')" title="Bewerk"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button></span><span class="val neg" id="fdr-cost-fixed">-€58</span></div>
                <div class="fdr-profit-row"><span class="lbl">Variabele kosten <button class="fdr-cost-edit-btn" onclick="editCost('variable')" title="Bewerk"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg></button></span><span class="val neg" id="fdr-cost-var">-€0</span></div>
                <div class="fdr-profit-row total"><span class="lbl">Nettowinst</span><span class="val" id="fdr-profit-val">€0</span></div>
              </div>
              <div class="fdr-profit-marge" id="fdr-profit-marge">Marge: —%</div>
            </div>

            <!-- Pipeline mini summary -->
            <div class="fdr-panel fdr-pipe-mini">
              <div class="fdr-panel-title" style="margin-bottom:12px">Pipeline</div>
              <div class="fdr-pipe-mini-cols" id="fdr-pipe-mini-cols"></div>
              <div class="fdr-won-lost-row">
                <span class="founder-badge-won" id="pipe-won-badge">0 Gewonnen</span>
                <span class="founder-badge-lost" id="pipe-lost-badge">0 Verloren</span>
              </div>
            </div>

          </div>
        </div>

        <!-- Follow-up alerts -->
        <div id="fdr-followup-section" style="display:none">
          <div class="fdr-section-hdr">
            <h3>Vandaag opvolgen</h3>
            <span style="font-size:11px;color:var(--text-muted)" id="fdr-followup-count"></span>
          </div>
          <div class="fdr-followup-wrap" id="fdr-followup-list"></div>
        </div>

        <!-- Full-width Pipeline kanban -->
        <div>
          <div class="fdr-section-hdr">
            <h3>Sales Pipeline</h3>
          </div>
          <div class="founder-pipeline-cols">
            <div class="founder-col">
              <div class="founder-col-hdr" style="border-top:3px solid #7C93C4">Gecontacteerd<span class="founder-col-badge" id="pipe-count-0">0</span></div>
              <div class="founder-col-body" id="pipe-col-0"></div>
              <div class="founder-col-add"><button onclick="openPipeModal(null,'Gecontacteerd')">+ Toevoegen</button></div>
            </div>
            <div class="founder-col">
              <div class="founder-col-hdr" style="border-top:3px solid var(--accent)">Geïnteresseerd<span class="founder-col-badge" id="pipe-count-1">0</span></div>
              <div class="founder-col-body" id="pipe-col-1"></div>
              <div class="founder-col-add"><button onclick="openPipeModal(null,'Geïnteresseerd')">+ Toevoegen</button></div>
            </div>
            <div class="founder-col">
              <div class="founder-col-hdr" style="border-top:3px solid #C99A6C">Beslissing<span class="founder-col-badge" id="pipe-count-2">0</span></div>
              <div class="founder-col-body" id="pipe-col-2"></div>
              <div class="founder-col-add"><button onclick="openPipeModal(null,'Beslissing')">+ Toevoegen</button></div>
            </div>
          </div>
        </div>

        <!-- Doelen -->
        <div>
          <div class="fdr-section-hdr">
            <h3>Doelen</h3>
            <button class="founder-btn-sm" onclick="openGoalModal(null)">+ Doel</button>
          </div>
          <div class="founder-goals-list" id="founder-goals-list">
            <div style="color:var(--text-muted);font-size:13px">Laden...</div>
          </div>
        </div>

        <!-- AI Advice -->
        <div class="founder-ai-box">
          <div class="founder-ai-header">
            <div class="founder-ai-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            </div>
            <div>
              <div class="founder-ai-title">Wat moet ik nu doen?</div>
              <div class="founder-ai-sub">AI-advies op basis van je huidige metrics</div>
            </div>
          </div>
          <div class="founder-ai-output" id="founder-ai-output"></div>
          <button class="founder-ai-btn" id="founder-ai-btn" onclick="getFounderAdvice()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Genereer advies
          </button>
        </div>

        <!-- Content Hub: LinkedIn + Instagram -->
        <div class="fdr-hub-box">
          <div class="fdr-hub-hdr">
            <div class="fdr-hub-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <div>
              <div class="fdr-hub-title">Content Hub</div>
              <div class="fdr-hub-sub" id="fdr-hub-sub">LinkedIn & Instagram posts. Klaar om te plaatsen</div>
            </div>
          </div>

          <!-- Controls: platform + type + sector + generate -->
          <div class="fdr-hub-controls">
            <div class="fdr-platform-tabs">
              <button class="fdr-platform-tab active li-active" id="fdr-tab-li" onclick="setHubPlatform('linkedin')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                LinkedIn
              </button>
              <button class="fdr-platform-tab" id="fdr-tab-ig" onclick="setHubPlatform('instagram')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                Instagram
              </button>
            </div>

            <select class="fdr-hub-select" id="fdr-hub-type">
              <option value="pijnpunt">Pijnpunt</option>
              <option value="feature">Feature highlight</option>
              <option value="resultaat">Resultaten & cijfers</option>
              <option value="vergelijking">Oud vs Helvaro</option>
              <option value="founder">Founder story</option>
              <option value="update">Week update</option>
            </select>

            <select class="fdr-hub-select" id="fdr-hub-sector">
              <option value="">Sector van vandaag</option>
              <option value="marketingbureaus en digitale agencies">Marketingbureaus</option>
              <option value="vastgoedkantoren en immobureaus">Vastgoed</option>
              <option value="business coaches en consultants">Coaches & Consultants</option>
              <option value="KMO's en ondernemers in Gent/Antwerpen">KMO's Gent/Antwerpen</option>
              <option value="verzekeringskantoren">Verzekeringen</option>
              <option value="recruitmentbureaus">Recruitment</option>
              <option value="automotive dealers">Automotive</option>
            </select>

            <button class="fdr-hub-gen-btn" id="fdr-hub-btn" onclick="generateContentPost()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Genereer
            </button>
          </div>

          <!-- Output -->
          <div class="fdr-hub-body">
            <div class="fdr-hub-output" id="fdr-hub-output"></div>
            <div class="fdr-hub-empty" id="fdr-hub-empty">
              Kies een platform, type en sector. Klik op Genereer.<br>
              De post wordt gecached en staat morgen automatisch klaar met nieuwe content.
            </div>
            <div class="fdr-hub-footer">
              <button class="fdr-hub-copy-btn" id="fdr-hub-copy" onclick="copyContentPost()">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                Kopieer
              </button>
              <button class="fdr-hub-regen-btn" id="fdr-hub-regen" onclick="generateContentPost(true)">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                Nieuwe versie
              </button>
              <span class="fdr-hub-platform-badge li" id="fdr-hub-badge" style="display:none"></span>
              <a class="fdr-hub-open-btn li" id="fdr-hub-open-li" href="https://www.linkedin.com/post/new/" target="_blank" rel="noopener">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                Open LinkedIn
              </a>
              <a class="fdr-hub-open-btn ig" id="fdr-hub-open-ig" href="https://www.instagram.com/" target="_blank" rel="noopener">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                Open Instagram
              </a>
            </div>
          </div>
        </div>

        <!-- Personalized DM Generator -->
        <div class="fdr-dm-box">
          <div class="fdr-dm-hdr">
            <div class="fdr-dm-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div>
              <div class="fdr-dm-title">Gepersonaliseerde DM / Email</div>
              <div class="fdr-dm-sub">Kies een prospect. AI schrijft een bericht op maat</div>
            </div>
          </div>
          <div class="fdr-dm-controls">
            <select class="fdr-dm-select" id="fdr-dm-prospect" style="flex:2">
              <option value="">Kies een prospect uit de pipeline...</option>
            </select>
            <select class="fdr-dm-select" id="fdr-dm-platform" style="flex:1;min-width:110px">
              <option value="linkedin">LinkedIn DM</option>
              <option value="email">Cold Email</option>
            </select>
            <button class="fdr-dm-gen-btn" id="fdr-dm-btn" onclick="generateDm()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              Genereer
            </button>
          </div>
          <div class="fdr-dm-body">
            <div class="fdr-dm-output" id="fdr-dm-output"></div>
            <div class="fdr-dm-empty" id="fdr-dm-empty">Selecteer een bedrijf hierboven. De DM wordt geschreven op basis van hun sector, fase en eventuele notities.</div>
            <button class="fdr-dm-copy-btn" id="fdr-dm-copy" onclick="copyDm()">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              Kopieer
            </button>
            <a class="fdr-dm-open-btn" id="fdr-dm-open-li" href="https://www.linkedin.com/messaging/" target="_blank" rel="noopener">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Open LinkedIn
            </a>
          </div>
        </div>

        <!-- Outreach Tracker (Teljo) -->
        <div class="fdr-outreach-box">
          <div class="fdr-outreach-hdr">
            <div>
              <div class="fdr-outreach-title">Outreach Teller. Teljo</div>
              <div class="fdr-outreach-week" id="fdr-outreach-week">Week van —</div>
            </div>
            <button class="fdr-outreach-reset" onclick="resetOutreach()">Week resetten</button>
          </div>
          <div class="fdr-outreach-body">
            <div class="fdr-outreach-grid" id="fdr-outreach-grid">
              <div class="fdr-outreach-card">
                <div class="fdr-outreach-num" id="or-dms" style="color:var(--accent)">0</div>
                <div class="fdr-outreach-info">
                  <div class="fdr-outreach-name">LinkedIn DMs</div>
                  <div class="fdr-outreach-target">Doel: 20/week</div>
                </div>
                <button class="fdr-outreach-plus" onclick="logOutreach('dms')">+</button>
              </div>
              <div class="fdr-outreach-card">
                <div class="fdr-outreach-num" id="or-emails" style="color:#0a66c2">0</div>
                <div class="fdr-outreach-info">
                  <div class="fdr-outreach-name">Cold Emails</div>
                  <div class="fdr-outreach-target">Doel: 10/week</div>
                </div>
                <button class="fdr-outreach-plus" onclick="logOutreach('emails')">+</button>
              </div>
              <div class="fdr-outreach-card">
                <div class="fdr-outreach-num" id="or-demos" style="color:var(--success)">0</div>
                <div class="fdr-outreach-info">
                  <div class="fdr-outreach-name">Demo's gehad</div>
                  <div class="fdr-outreach-target">Doel: 3/week</div>
                </div>
                <button class="fdr-outreach-plus" onclick="logOutreach('demos')">+</button>
              </div>
              <div class="fdr-outreach-card">
                <div class="fdr-outreach-num" id="or-follows" style="color:var(--warning)">0</div>
                <div class="fdr-outreach-info">
                  <div class="fdr-outreach-name">Follow-ups</div>
                  <div class="fdr-outreach-target">Doel: 10/week</div>
                </div>
                <button class="fdr-outreach-plus" onclick="logOutreach('follows')">+</button>
              </div>
            </div>
            <div class="fdr-outreach-footer">
              <span class="fdr-outreach-pct" id="or-total-pct">Totaal: 0 acties. 0% van weekdoel (43)</span>
              <span></span>
            </div>
            <div class="fdr-outreach-bar-wrap" style="margin-top:10px">
              <div class="fdr-outreach-bar-fill" id="or-bar" style="width:0%"></div>
            </div>
          </div>
        </div>

        <!-- Bouw Tracker (Frade) -->
        <div class="fdr-bouw-box">
          <div class="fdr-bouw-hdr">
            <div class="fdr-bouw-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            </div>
            <div>
              <div class="fdr-bouw-title">Bouw Tracker. Frade</div>
              <div class="fdr-bouw-sub">Technische taken. Vink af wat klaar is</div>
            </div>
          </div>
          <div class="fdr-bouw-body">
            <div class="fdr-bouw-progress" id="fdr-bouw-progress">0/0 taken afgewerkt</div>
            <div class="fdr-bouw-list" id="fdr-bouw-list"></div>
            <div class="fdr-bouw-add-row">
              <input class="fdr-bouw-add-input" id="fdr-bouw-input" type="text" placeholder="Nieuwe taak toevoegen..." onkeydown="if(event.key==='Enter')addBouwItem()">
              <button class="fdr-bouw-add-btn" onclick="addBouwItem()">+ Toevoegen</button>
            </div>
          </div>
        </div>

        <!-- Documenten Hub -->
        <div class="fdr-docs-box">
          <div class="fdr-docs-hdr">
            <div class="fdr-docs-hdr-left">
              <div class="fdr-docs-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <div>
                <div class="fdr-docs-title">Documenten & Presentaties</div>
                <div class="fdr-docs-sub">Gedeeld tussen Frade &amp; Teljo. Altijd online bereikbaar</div>
              </div>
            </div>
            <button class="fdr-docs-edit-btn" onclick="toggleDocsConfig()">Links instellen</button>
          </div>
          <div class="fdr-docs-body">
            <!-- Embedded presentation -->
            <div class="fdr-docs-embed-wrap" id="fdr-docs-embed-wrap">
              <div class="fdr-docs-embed-placeholder" id="fdr-docs-embed-placeholder">
                Plak een Google Slides of Canva embed-link via <a onclick="toggleDocsConfig()">Links instellen</a> om de presentatie hier te tonen.
              </div>
            </div>
            <!-- Document cards -->
            <div class="fdr-docs-grid" id="fdr-docs-grid">
              <a class="fdr-doc-card fdr-doc-card-nolink" id="fdr-doc-pitch" target="_blank" rel="noopener">
                <span class="fdr-doc-card-badge slides">Slides</span>
                <div class="fdr-doc-card-icon"></div>
                <div class="fdr-doc-card-name">Pitch Deck</div>
                <div class="fdr-doc-card-desc">Presentatie voor investeerders & klanten</div>
              </a>
              <a class="fdr-doc-card fdr-doc-card-nolink" id="fdr-doc-contract" target="_blank" rel="noopener">
                <span class="fdr-doc-card-badge pdf">PDF</span>
                <div class="fdr-doc-card-icon"></div>
                <div class="fdr-doc-card-name">Contracten</div>
                <div class="fdr-doc-card-desc">Klantcontracten. 3 maanden + maandelijks</div>
              </a>
              <a class="fdr-doc-card fdr-doc-card-nolink" id="fdr-doc-prijslijst" target="_blank" rel="noopener">
                <span class="fdr-doc-card-badge pdf">PDF</span>
                <div class="fdr-doc-card-icon"></div>
                <div class="fdr-doc-card-name">Prijslijst</div>
                <div class="fdr-doc-card-desc">Helvaro €1.000/maand · alles inbegrepen</div>
              </a>
              <a class="fdr-doc-card fdr-doc-card-nolink" id="fdr-doc-drive" target="_blank" rel="noopener">
                <span class="fdr-doc-card-badge drive">Drive</span>
                <div class="fdr-doc-card-icon"></div>
                <div class="fdr-doc-card-name">Google Drive</div>
                <div class="fdr-doc-card-desc">Alle bestanden, sjablonen en assets</div>
              </a>
            </div>
          </div>
          <!-- Config panel (hidden by default) -->
          <div class="fdr-docs-cfg" id="fdr-docs-cfg">
            <div class="fdr-docs-cfg-title">Links instellen (opgeslagen voor Frade &amp; Teljo)</div>
            <div class="fdr-docs-cfg-row">
              <span class="fdr-docs-cfg-lbl">Presentatie embed</span>
              <input class="fdr-docs-cfg-input" id="cfg-embed" placeholder="Google Slides of Canva embed URL (iframe src=...)">
            </div>
            <div class="fdr-docs-cfg-row">
              <span class="fdr-docs-cfg-lbl">Pitch Deck link</span>
              <input class="fdr-docs-cfg-input" id="cfg-pitch" placeholder="https://docs.google.com/presentation/...">
            </div>
            <div class="fdr-docs-cfg-row">
              <span class="fdr-docs-cfg-lbl">Contracten link</span>
              <input class="fdr-docs-cfg-input" id="cfg-contract" placeholder="https://drive.google.com/...">
            </div>
            <div class="fdr-docs-cfg-row">
              <span class="fdr-docs-cfg-lbl">Prijslijst link</span>
              <input class="fdr-docs-cfg-input" id="cfg-prijslijst" placeholder="https://drive.google.com/...">
            </div>
            <div class="fdr-docs-cfg-row">
              <span class="fdr-docs-cfg-lbl">Google Drive</span>
              <input class="fdr-docs-cfg-input" id="cfg-drive" placeholder="https://drive.google.com/drive/folders/...">
            </div>
            <div class="fdr-docs-cfg-row" style="justify-content:flex-end">
              <button class="fdr-docs-cfg-save" onclick="saveDocsConfig()">Opslaan</button>
            </div>
          </div>
        </div>

        <!-- Live Klanten -->
        <div class="fdr-live-box">
          <div class="fdr-live-hdr">
            <div class="fdr-live-hdr-left">
              <div class="fdr-live-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
              </div>
              <div>
                <div class="fdr-live-title">Live Klanten</div>
                <div class="fdr-live-sub">Online status, ancienniteit, leads &amp; afspraken per klant</div>
              </div>
            </div>
            <div class="fdr-live-count" id="fdr-live-count">—</div>
          </div>
          <div style="overflow-x:auto">
            <table class="fdr-live-table" id="fdr-live-table">
              <thead>
                <tr>
                  <th>Klant</th>
                  <th>Status</th>
                  <th>Bij ons</th>
                  <th style="text-align:right">Leads</th>
                  <th style="text-align:right">Afspraken</th>
                  <th style="text-align:right">MRR</th>
                </tr>
              </thead>
              <tbody id="fdr-live-tbody">
                <tr><td colspan="6" class="fdr-live-empty">Laden...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Meeting met partner -->
        <div class="fdr-meeting-box">
          <div class="fdr-meeting-hdr">
            <span class="fdr-meeting-icon"></span>
            <span class="fdr-meeting-title">Volgende meeting met partner</span>
          </div>
          <div id="fdr-meeting-display">
            <div class="fdr-meeting-when" id="fdr-meeting-when">—</div>
            <div class="fdr-meeting-agenda" id="fdr-meeting-agenda">Geen meeting gepland</div>
          </div>
          <div class="fdr-meeting-row">
            <input type="datetime-local" id="fdr-meeting-date">
            <input type="text" id="fdr-meeting-topic" placeholder="Agenda (bv. Cijfers + sales review)">
            <button onclick="saveMeeting()">Opslaan</button>
          </div>
        </div>

        <!-- AI Coach Chat -->
        <div class="fdr-chat-box">
          <div class="fdr-chat-hdr">
            <div class="fdr-chat-avatar"></div>
            <div class="fdr-chat-hdr-info">
              <div class="fdr-chat-hdr-name">Helvaro Coach</div>
              <div class="fdr-chat-hdr-sub">Vraag me alles over strategie, sales of outreach</div>
            </div>
            <button class="fdr-chat-clear" onclick="clearCoachChat()">Wis chat</button>
          </div>
          <div class="fdr-chat-msgs" id="fdr-chat-msgs">
            <div class="fdr-chat-bubble assistant">Dag! Ik ben je Helvaro business coach. Stel me een vraag over sales, outreach, demo's of strategie. Ik geef je direct concrete stappen.</div>
          </div>
          <div class="fdr-chat-input-row">
            <textarea class="fdr-chat-input" id="fdr-chat-input" placeholder="Stel een vraag..." rows="1" onkeydown="chatInputKeydown(event)"></textarea>
            <button class="fdr-chat-send" id="fdr-chat-send" onclick="sendCoachMessage()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>

      </div>
    </main>

    <!-- AI WORKSPACE: the workspace itself (api/_ai/ui/markup.js) -->
${ai.workspace}

    <!-- Persona picker (Frade / Teljo). shown right after login -->
    <div id="persona-overlay">
      <div class="persona-modal">
        <h2>Wie ben je?</h2>
        <p>Kies je profiel om je persoonlijke taken &amp; overzicht te zien.</p>
        <div class="persona-choices">
          <div class="persona-choice" onclick="setPersona('Frade')">
            <div class="persona-avatar frade">F</div>
            <div class="persona-name">Frade</div>
            <div class="persona-role">Tech &amp; product</div>
          </div>
          <div class="persona-choice" onclick="setPersona('Teljo')">
            <div class="persona-avatar teljo">T</div>
            <div class="persona-name">Teljo</div>
            <div class="persona-role">Sales &amp; outreach</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Onboarding "Klaar!" celebration overlay (shown once after first setup) -->
    <div id="onb-done-overlay">
      <div class="onb-done-card">
        <div class="onb-done-icon"></div>
        <h2 class="onb-done-title">Je AI is live!</h2>
        <p class="onb-done-sub">Vanaf nu krijgt elke lead die jouw formulier invult direct een persoonlijk WhatsApp-bericht. Automatisch gekwalificeerd.</p>
        <div class="onb-done-url-card">
          <div class="onb-done-url-lbl">DEEL DEZE LINK</div>
          <code class="onb-done-url" id="onb-done-url">—</code>
          <button class="onb-done-copy" onclick="copyFormLink()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Kopieer
          </button>
        </div>
        <div class="onb-done-steps">
          <div class="onb-done-step"><span class="onb-done-step-num">1</span> Plak de link in je website, advertentie of bio</div>
          <div class="onb-done-step"><span class="onb-done-step-num">2</span> Stuur jezelf een test-aanvraag</div>
          <div class="onb-done-step"><span class="onb-done-step-num">3</span> Je leads verschijnen automatisch in je Dashboard</div>
        </div>
        <div class="onb-done-actions">
          <button class="onb-done-btn onb-done-btn-secondary" onclick="closeOnboardingDone(); navigateTo('formulier');">
            Formulier &amp; installatie →
          </button>
          <button class="onb-done-btn onb-done-btn-primary" onclick="closeOnboardingDone(); navigateTo('dashboard');">
            Naar mijn Dashboard →
          </button>
        </div>
      </div>
    </div>

    <!-- Pipeline Modal -->
    <div class="founder-modal-overlay" id="pipe-modal-overlay">
      <div class="founder-modal">
        <h3 id="pipe-modal-title">Prospect toevoegen</h3>
        <div class="founder-modal-field"><label>Naam *</label><input id="pm-naam" type="text" placeholder="Jan Janssen"></div>
        <div class="founder-modal-field"><label>Bedrijf</label><input id="pm-bedrijf" type="text" placeholder="Acme BV"></div>
        <div class="founder-modal-field"><label>E-mail</label><input id="pm-email" type="email" placeholder="jan@acme.be"></div>
        <div class="founder-modal-field"><label>Fase</label>
          <select id="pm-fase">
            <option>Gecontacteerd</option>
            <option>Geïnteresseerd</option>
            <option>Beslissing</option>
            <option>Gewonnen</option>
            <option>Verloren</option>
          </select>
        </div>
        <div class="founder-modal-field"><label>Notities</label><textarea id="pm-notities" placeholder="Aantekeningen..."></textarea></div>
        <div class="founder-modal-actions">
          <button class="founder-modal-delete" id="pm-delete-btn" style="display:none" onclick="deletePipeRecord()">Verwijderen</button>
          <button class="founder-modal-cancel" onclick="closePipeModal()">Annuleren</button>
          <button class="founder-modal-save" onclick="savePipeRecord()">Opslaan</button>
        </div>
      </div>
    </div>

    <!-- Goal Modal -->
    <div class="founder-modal-overlay" id="goal-modal-overlay">
      <div class="founder-modal">
        <h3 id="goal-modal-title">Doel toevoegen</h3>
        <div class="founder-modal-field"><label>Doel *</label><input id="gm-doel" type="text" placeholder="5 betalende klanten"></div>
        <div class="founder-modal-field"><label>Target (getal)</label><input id="gm-target" type="number" placeholder="5" min="0"></div>
        <div class="founder-modal-field"><label>Eenheid</label><input id="gm-eenheid" type="text" placeholder="klanten / € MRR / leads"></div>
        <div class="founder-modal-field"><label>Deadline</label><input id="gm-deadline" type="date"></div>
        <div class="founder-modal-actions">
          <button class="founder-modal-delete" id="gm-delete-btn" style="display:none" onclick="deleteGoalRecord()">Verwijderen</button>
          <button class="founder-modal-cancel" onclick="closeGoalModal()">Annuleren</button>
          <button class="founder-modal-save" onclick="saveGoalRecord()">Opslaan</button>
        </div>
      </div>
    </div>

  </div>
</div>

<!-- Global Search Overlay -->
<div class="search-overlay" id="search-overlay">
  <div class="search-modal" id="search-modal">
    <div class="search-modal-bar">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input class="search-modal-input" id="search-modal-input" type="text" placeholder="Zoek op naam, telefoon, bron of samenvatting..." autocomplete="off" spellcheck="false">
      <kbd class="search-kbd" id="search-esc-btn">Esc</kbd>
    </div>
    <div class="search-results" id="search-results">
      <div class="search-hint">
        <div class="search-hint-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
        <div class="search-hint-text">Begin met typen om leads te zoeken</div>
        <div class="search-hint-shortcuts">
          <span class="search-hint-shortcut"><kbd>↑↓</kbd> navigeren</span>
          <span class="search-hint-shortcut"><kbd>↵</kbd> openen</span>
          <span class="search-hint-shortcut"><kbd>Esc</kbd> sluiten</span>
        </div>
      </div>
    </div>
    <div class="search-footer" id="search-footer" style="display:none">
      <span class="search-footer-hint"><kbd>↑↓</kbd> navigeren</span>
      <span class="search-footer-hint"><kbd>↵</kbd> openen</span>
      <span class="search-footer-hint"><kbd>Esc</kbd> sluiten</span>
      <span class="search-footer-count" id="search-footer-count"></span>
    </div>
  </div>
</div>

<!-- Booking Modal (handmatig afspraak inplannen vanuit kalender) -->
<div id="cal-book-overlay" onclick="if(event.target===this)closeCalBookModal()">
  <div id="cal-book-modal">
    <div id="cal-book-header">
      <div class="cal-book-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </div>
      <div style="flex:1;min-width:0">
        <div id="cal-book-title">Afspraak inplannen</div>
        <div id="cal-book-subtitle"></div>
      </div>
      <button id="cal-book-close" onclick="closeCalBookModal()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <!-- Body is rendered dynamically by JS -->
    <div id="cal-book-body"></div>
  </div>
</div>

<!-- Detail Panel -->
<div class="panel-backdrop" id="panel-backdrop"></div>
<div class="detail-panel" id="detail-panel">
  <div class="panel-header">
    <button class="panel-close" id="panel-close" aria-label="Sluiten"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    <div class="panel-avatar" id="panel-avatar">HV</div>
    <div class="panel-name display-heading" id="panel-name">Lead naam</div>
    <div class="panel-meta">
      <div class="panel-phone">
        <span></span>
        <span id="panel-phone">—</span>
        <button class="panel-copy-btn" id="panel-copy-phone" title="Kopieer nummer">⧉</button>
      </div>
      <span id="panel-bron-badge"></span>
    </div>
  </div>
  <div class="panel-body" id="panel-body"></div>
</div>

<!-- Calendar Event Modal -->
<div class="cal-modal-overlay" id="cal-event-modal" onclick="closeCalModal(event)">
  <div class="cal-modal" id="cal-modal-inner">
    <div class="cal-modal-header">
      <div class="cal-modal-header-title" id="cal-modal-title">Afspraak</div>
      <button class="cal-modal-close" onclick="closeCalModal()">&times;</button>
    </div>
    <div class="cal-modal-body" id="cal-modal-body"></div>
  </div>
</div>

<!-- "Vertel over je bedrijf" modal — onboarding checklist item. Writes to
     AI Instructions (fld1lqHctRbqFGQf5), NEVER to AI Learned Patterns —
     the weekly learning cron (api/cron-followup.js's runWeeklyLearning())
     fully overwrites that field every Monday, so anything typed there would
     be silently destroyed within a week. See config-save's aiInstructions
     handling in api/leads.js. -->
<div class="chk-biz-modal-overlay" id="chk-biz-modal-overlay" onclick="if(event.target===this) closeBusinessInfoModal()">
  <div class="chk-biz-modal">
    <div class="chk-biz-modal-title">Vertel over je bedrijf</div>
    <div class="chk-biz-modal-intro">Dit is wat je AI gebruikt om leads te beantwoorden — hoe meer je hier invult, hoe beter je AI jouw klanten écht helpt in plaats van generiek te antwoorden. Een paar zinnen per vraag is al genoeg.</div>
    <div class="chk-biz-field">
      <label for="chk-biz-what">Wat doet je bedrijf?</label>
      <textarea id="chk-biz-what" maxlength="400" placeholder="Bijv. Wij zijn een tandartspraktijk in Gent, gespecialiseerd in implantaten en cosmetische tandheelkunde."></textarea>
    </div>
    <div class="chk-biz-field">
      <label for="chk-biz-goodlead">Wat is een goede lead voor jou?</label>
      <textarea id="chk-biz-goodlead" maxlength="300" placeholder="Bijv. Iemand die binnen 30 min. wil langskomen, of een concrete klacht/vraag heeft — geen studenten die rondvragen."></textarea>
    </div>
    <div class="chk-biz-field">
      <label for="chk-biz-notdoes">Wat doet je bedrijf NIET?</label>
      <textarea id="chk-biz-notdoes" maxlength="300" placeholder="Bijv. Wij doen geen spoedgevallen buiten de uren, en geen behandelingen bij kinderen onder 12."></textarea>
    </div>
    <div class="chk-biz-field">
      <label for="chk-biz-never">Openingsuren &amp; dingen die de AI NOOIT mag beloven</label>
      <textarea id="chk-biz-never" maxlength="300" placeholder="Bijv. Open ma-vr 9-18. Beloof nooit een exacte prijs of dat een behandeling 100% pijnloos is."></textarea>
      <div class="chk-biz-field-hint">Dit wordt toegevoegd aan je AI Instructies — je bestaande instructies (indien aanwezig) blijven staan, dit komt erbij.</div>
    </div>
    <div class="chk-biz-modal-actions">
      <button class="chk-biz-cancel" onclick="closeBusinessInfoModal()">Annuleren</button>
      <button class="chk-biz-save" id="chk-biz-save-btn" onclick="saveBusinessInfoFromChecklist()">Opslaan</button>
    </div>
  </div>
</div>

<!-- Toast Container -->
<div class="toast-container" id="toast-container"></div>

<!-- ============================================================
     HELP WIDGET. Rendered for logged-in users only (shown by
     startDashboard, hidden on the login screen) — see initHelpWidget().
     ============================================================ -->
<button class="hv-help-launcher" id="hv-help-launcher" type="button"
        aria-label="Hulp en ondersteuning" aria-expanded="false"
        aria-controls="hv-help-panel" style="display:none">
  <svg class="hv-help-ico-chat" width="23" height="23" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>
  </svg>
  <svg class="hv-help-ico-close" width="21" height="21" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
</button>

<div class="hv-help-panel" id="hv-help-panel" role="dialog"
     aria-labelledby="hv-help-title" aria-hidden="true">
  <div class="hv-help-head">
    <h2 id="hv-help-title">Hoe kunnen we helpen?</h2>
    <p>Zoek een antwoord, of stuur ons een bericht.</p>
  </div>
  <div class="hv-help-search">
    <input id="hv-help-q" type="search" autocomplete="off" spellcheck="false"
           placeholder="Zoek in de hulp..." aria-label="Zoek in de hulp">
  </div>
  <div class="hv-help-body" id="hv-help-body"></div>
  <div class="hv-help-foot">
    <a id="hv-help-mail" href="mailto:${SUPPORT_EMAIL_ATTR}?subject=Vraag%20over%20Helvaro">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>
      </svg>
      Mail ons
    </a>${SUPPORT_WA ? `
    <a id="hv-help-wa" href="https://wa.me/${SUPPORT_WA}" target="_blank" rel="noopener noreferrer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/>
      </svg>
      WhatsApp
    </a>` : ''}
  </div>
</div>

<script>
/* ============================================================
   LANGUAGE REGISTRY (server-injected — see api/_lang.js, single source of
   truth also used by api/whatsapp.js's AI conversation). [{code,native,english}]
   ============================================================ */
const AP_LANGUAGES = ${AP_LANGUAGES_JSON};

/* ============================================================
   CLERK (optioneel — leeg tenzij CLERK_ENABLED=1)

   No React and no build step here, so this uses Clerk's vanilla SDK and
   deliberately does NOT rely on Clerk's __session cookie: that needs DNS
   records on a production instance before it is set on our own domain. Instead
   the page asks the SDK for a fresh JWT and sends it as a Bearer header, which
   api/_clerk.js already accepts. Works immediately on test keys, and survives
   the move to a production instance without a code change.

   getToken() returns a short-lived token and refreshes it as needed, so it is
   called per request rather than cached.
   ============================================================ */
const CLERK_READY = ${CLERK_READY ? 'true' : 'false'};
let _clerkLoaded = null;

async function clerkInit() {
  if (!CLERK_READY) return null;
  if (_clerkLoaded) return _clerkLoaded;
  _clerkLoaded = new Promise(function (resolve) {
    var sc = document.createElement('script');
    sc.async = true;
    sc.crossOrigin = 'anonymous';
    sc.setAttribute('data-clerk-publishable-key', '${CLERK_PK}');
    sc.src = 'https://${CLERK_HOST}/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    sc.onload = async function () {
      try { await window.Clerk.load({ afterSignOutUrl: '/dashboard', localization: CLERK_NL }); resolve(window.Clerk); }
      catch (e) { console.error('[clerk] laden mislukt', e); resolve(null); }
    };
    sc.onerror = function () { console.error('[clerk] script kon niet geladen worden'); resolve(null); };
    document.head.appendChild(sc);
  });
  return _clerkLoaded;
}

async function clerkToken() {
  if (!CLERK_READY || !window.Clerk || !window.Clerk.session) return '';
  try { return (await window.Clerk.session.getToken()) || ''; } catch (e) { return ''; }
}

// Clerk's own components, dropped into the existing login panel so the page
// keeps its layout, logo and split-screen showcase. Clerk supplies the forms
// and the flows (password reset, email verification); we supply the frame.
//
// Both sign-in AND sign-up are mounted on demand: without the sign-up view a
// new client has no way to create an account at all, which is the whole point
// of moving to a hosted identity provider.
var CLERK_APPEARANCE = {
  variables: {
    colorPrimary: '#C9A34E',
    colorBackground: 'transparent',
    borderRadius: '12px',
    fontFamily: 'Inter, sans-serif',
  },
  elements: {
    card: { boxShadow: 'none', border: 'none' },
    // Clerk ships its own "Don't have an account? Sign up" footer, which
    // navigates to a Clerk-hosted page and leaves our branded screen. We
    // already have an in-page switch under the component, so hiding this
    // removes both the duplicate and the exit.
    footerAction: { display: 'none' },
    footer: { display: 'none' },
  },
};

// Clerk's UI is English out of the box. Only the strings that actually show up
// on these two screens are translated — a full locale bundle would be dead
// weight for a sign-in box with four fields.
var CLERK_NL = {
  socialButtonsBlockButton: 'Doorgaan met {{provider|titleize}}',
  dividerText: 'of',
  formFieldLabel__emailAddress: 'E-mailadres',
  formFieldLabel__password: 'Wachtwoord',
  formFieldInputPlaceholder__emailAddress: 'naam@bedrijf.be',
  formFieldInputPlaceholder__password: 'Je wachtwoord',
  formButtonPrimary: 'Doorgaan',
  footerActionLink__useAnotherMethod: 'Andere manier proberen',
  backButton: 'Terug',
  signIn: {
    start: { title: 'Inloggen bij Helvaro', subtitle: 'Welkom terug. Log in om verder te gaan.' },
    password: { title: 'Vul je wachtwoord in', subtitle: 'Voer het wachtwoord van je account in' },
    forgotPasswordAlternativeMethods: { label__alternativeMethods: 'Of log op een andere manier in' },
    forgotPassword: { title: 'Wachtwoord vergeten', subtitle_email: 'We sturen je een code per e-mail' },
  },
  signUp: {
    start: { title: 'Account aanmaken', subtitle: 'Vul je gegevens in om te beginnen' },
    emailCode: { title: 'Bevestig je e-mailadres', subtitle: 'Vul de code in die we je gestuurd hebben' },
  },
  formFieldAction__forgotPassword: 'Wachtwoord vergeten?',
  unstable__errors: {
    form_password_incorrect: 'Verkeerd wachtwoord. Probeer het opnieuw.',
    form_identifier_not_found: 'We kennen dit e-mailadres niet.',
  },
};

function clerkHost() {
  var host = document.getElementById('clerk-signin');
  if (!host) return null;
  var form = document.getElementById('login-form-wrap');
  if (form) form.style.display = 'none';
  // Clerk's card carries its own title and subtitle, so ours would be the
  // second heading on the same panel saying roughly the same thing.
  var wel = document.querySelector('.login-welcome');
  var sub = document.querySelector('.login-subtitle');
  if (wel) wel.style.display = 'none';
  if (sub) sub.style.display = 'none';
  host.style.display = 'block';
  // Unmount whatever is there before mounting the other view, otherwise Clerk
  // stacks two forms on top of each other when you toggle back and forth.
  try {
    if (host.dataset.mounted === 'signin')      window.Clerk.unmountSignIn(host);
    else if (host.dataset.mounted === 'signup') window.Clerk.unmountSignUp(host);
  } catch (e) {}
  host.innerHTML = '';
  return host;
}

function mountClerkSignIn(clerk) {
  var host = clerkHost();
  if (!host) return;
  try {
    clerk.mountSignIn(host, CLERK_APPEARANCE);
    host.dataset.mounted = 'signin';
    setClerkToggle('signin');
  } catch (e) { console.error('[clerk] sign-in kon niet gemonteerd worden', e); }
}

function mountClerkSignUp(clerk) {
  var host = clerkHost();
  if (!host) return;
  try {
    clerk.mountSignUp(host, CLERK_APPEARANCE);
    host.dataset.mounted = 'signup';
    setClerkToggle('signup');
  } catch (e) { console.error('[clerk] sign-up kon niet gemonteerd worden', e); }
}

// Clerk's components carry their own "already have an account?" links, but
// those navigate to Clerk-hosted pages by default. This keeps the switch inside
// our own page so the user never leaves the branded login screen.
function setClerkToggle(view) {
  var el = document.getElementById('clerk-toggle');
  if (!el) return;
  el.innerHTML = '';
  var span = document.createElement('span');
  span.textContent = view === 'signin' ? 'Nog geen account? ' : 'Heb je al een account? ';
  var link = document.createElement('button');
  link.type = 'button';
  link.className = 'clerk-toggle-link';
  link.textContent = view === 'signin' ? 'Account aanmaken' : 'Inloggen';
  link.addEventListener('click', function () {
    if (view === 'signin') mountClerkSignUp(window.Clerk);
    else                   mountClerkSignIn(window.Clerk);
  });
  el.appendChild(span);
  el.appendChild(link);
  el.style.display = 'block';
}

// Shown when Clerk says who you are but no client has been assigned to you.
// This is a normal step in a business where accounts are set up by hand, not a
// failure — so it reads as a status, offers a way out, and does not pretend
// something went wrong.
function showTenantPending(clerk) {
  var login = document.getElementById('login-page');
  var app   = document.getElementById('dashboard-app');
  if (app) app.classList.remove('visible');
  if (login) login.style.display = 'flex';

  var host = document.getElementById('clerk-signin');
  var toggle = document.getElementById('clerk-toggle');
  var form = document.getElementById('login-form-wrap');
  if (form) form.style.display = 'none';
  if (toggle) toggle.style.display = 'none';
  if (!host) return;
  try {
    if (host.dataset.mounted === 'signin') window.Clerk.unmountSignIn(host);
    else if (host.dataset.mounted === 'signup') window.Clerk.unmountSignUp(host);
  } catch (e) {}
  host.dataset.mounted = '';
  host.style.display = 'block';
  host.innerHTML = '';

  var email = '';
  try { email = (clerk && clerk.user && clerk.user.primaryEmailAddress &&
                 clerk.user.primaryEmailAddress.emailAddress) || ''; } catch (e) {}

  var wrap = document.createElement('div');
  wrap.style.cssText = 'text-align:center;padding:8px 4px';

  var h = document.createElement('h2');
  h.textContent = 'Je account wordt klaargezet';
  h.style.cssText = 'font-size:19px;font-weight:700;margin:0 0 10px;color:#1B222D';

  var p1 = document.createElement('p');
  p1.textContent = 'Je bent aangemeld' + (email ? ' als ' + email : '') +
    '. We koppelen je account nu aan je bedrijf, zodat je alleen je eigen leads ziet. Dat doen we met de hand, meestal binnen een werkdag.';
  p1.style.cssText = 'font-size:13.5px;line-height:1.6;color:#5B6779;margin:0 0 8px';

  var p2 = document.createElement('p');
  p2.textContent = 'Je hoeft niets te doen. Zodra het klaar is kun je gewoon inloggen.';
  p2.style.cssText = 'font-size:13.5px;line-height:1.6;color:#5B6779;margin:0 0 18px';

  var actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:center;flex-wrap:wrap';

  var mail = document.createElement('a');
  // %0A rather than a newline escape: this file is one big template
  // literal, so a backslash-n here would collapse into a real line break
  // inside the emitted string and break the script.
  mail.href = 'mailto:${SUPPORT_EMAIL_ATTR}'
            + '?subject=' + encodeURIComponent('Account klaarzetten')
            + '&body=Hallo%2C%0A%0AIk%20heb%20me%20aangemeld'
            + (email ? '%20met%20' + encodeURIComponent(email) : '')
            + '%20en%20wacht%20op%20toegang.%0A%0A';
  mail.textContent = 'Vraag ernaar';
  mail.style.cssText = 'padding:9px 16px;border:1px solid #E2E7F0;border-radius:10px;font-size:13px;font-weight:600;color:#1B222D;text-decoration:none';

  var out = document.createElement('button');
  out.type = 'button';
  out.textContent = 'Uitloggen';
  out.style.cssText = 'padding:9px 16px;border:1px solid #E2E7F0;border-radius:10px;font-size:13px;font-weight:600;color:#5B6779;background:none;cursor:pointer';
  out.addEventListener('click', clerkSignOut);

  actions.appendChild(mail);
  actions.appendChild(out);
  wrap.appendChild(h); wrap.appendChild(p1); wrap.appendChild(p2); wrap.appendChild(actions);
  host.appendChild(wrap);
}

async function clerkSignOut() {
  try { if (window.Clerk) await window.Clerk.signOut(); } catch (e) {}
  window.location.href = '/dashboard';
}


/* ============================================================
   CSRF — one fetch wrapper instead of 45 call sites

   The session now rides in an httpOnly cookie, which the browser attaches
   automatically. That is what makes CSRF possible at all, so every
   state-changing call has to echo back the readable hv_csrf cookie in a
   header; the server compares the two (double-submit, see api/_session.js).
   Wrapping fetch once means no call site has to remember, and any code added
   later is covered by default.
   ============================================================ */
(function () {
  function csrfToken() {
    var m = /(?:^|;\\s*)hv_csrf=([^;]*)/.exec(document.cookie || '');
    try { return m ? decodeURIComponent(m[1]) : ''; } catch (e) { return m ? m[1] : ''; }
  }
  var _fetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var method = String(init.method || 'GET').toUpperCase();
    var url    = typeof input === 'string' ? input : (input && input.url) || '';
    var sameOrigin = url.indexOf('http') !== 0 || url.indexOf(location.origin) === 0;
    if (sameOrigin && method !== 'GET' && method !== 'HEAD') {
      var t = csrfToken();
      if (t) {
        var h = new Headers(init.headers || {});
        if (!h.has('x-csrf-token')) h.set('x-csrf-token', t);
        init.headers = h;
      }
    }
    // Clerk: attach a fresh bearer token to every same-origin API call. Async,
    // so the wrapper returns a promise chain here rather than calling through
    // directly. Only when Clerk is actually on — otherwise this is dead weight.
    if (CLERK_READY && sameOrigin && url.indexOf('/api/') > -1) {
      return clerkToken().then(function (tok) {
        if (tok) {
          var hh = new Headers(init.headers || {});
          if (!hh.has('authorization')) hh.set('authorization', 'Bearer ' + tok);
          init.headers = hh;
        }
        return _fetch(input, init);
      });
    }
    return _fetch(input, init);
  };
})();

/* ============================================================
   QR CODE (self-hosted — GDPR: client/project data used to be sent
   to api.qrserver.com in the URL query string; now rendered fully
   client-side via the vendored qrcode.js encoder, no network call).
   ============================================================ */
function renderQrDataUrl(text, sizePx, marginModules) {
  if (typeof qrcode === 'undefined' || !text) return '';
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  const moduleCount = qr.getModuleCount();
  const margin = (marginModules == null) ? 4 : marginModules;
  const totalModules = moduleCount + margin * 2;
  const cell = Math.max(1, Math.floor(sizePx / totalModules));
  const canvasSize = cell * totalModules;
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = '#000000';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect((col + margin) * cell, (row + margin) * cell, cell, cell);
      }
    }
  }
  return canvas.toDataURL('image/png');
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  apiKey: '',
  leads: [],
  filteredLeads: [],
  sortCol: 'datum',
  sortAsc: false,
  searchQ: '',
  lastFetch: null,
  currentPage: 'dashboard',
  activeLead: null,
  clientName: '',
  calendlyUrl: '',
  userEmail:   '',
  stats: null,
  knownLeadIds: null,
  newLeadCount: 0,
  adminLoaded: false,
  adminClients: [],
  adminApiKey: '',
  leadsChart: null,
  bronChart: null,
  analyseDaysChart: null,
  analyseScoreChart: null,
  analyseHoursChart: null,
};

const API_BASE = '/api';

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */
// Escape user data before inserting into innerHTML. Prevents XSS
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape a value for embedding inside a JS string literal that itself
// sits inside an inline HTML event-handler attribute (e.g. onclick="fn('...')").
// escHtml alone is NOT enough there: the browser HTML-decodes the attribute
// value BEFORE handing it to the JS parser as event-handler source, so
// escHtml turning a quote into &#39; just decodes back into a literal quote
// right where the JS engine reads it. escJs instead neutralizes the actual
// break-out characters (quotes, angle brackets, slash) as \\xNN hex escapes
// so nothing decodes back into a syntactically meaningful character.
// Ported from api/form-page.js's escJs() -- keep both in sync if either changes.
function escJs(s) {
  return String(s || '')
    .replace(/[\\x00-\\x1F\\x7F]/g, '')
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/'/g, "\\\\'")
    .replace(/"/g, '\\\\x22')
    .replace(/</g, '\\\\x3C')
    .replace(/>/g, '\\\\x3E')
    .replace(/\\//g, '\\\\x2F');
}

// Map AI qualification rating (Dutch + English variants) to a color class
function scorePillCls(v) {
  const s = String(v || '').toLowerCase();
  if (/(strong|hoog|high|goed|sterk)/.test(s))          return 'sp-strong';
  if (/(medium|gemiddeld|moderate|gemiddel)/.test(s))   return 'sp-medium';
  if (/(weak|laag|low|poor|zwak)/.test(s))              return 'sp-weak';
  return 'sp-neutral';
}

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeAgo(date) {
  if (!date) return 'onbekend';
  const diff = Math.floor((Date.now() - date) / 60000);
  if (diff < 1) return 'zojuist';
  if (diff === 1) return '1 minuut geleden';
  if (diff < 60) return \`\${diff} minuten geleden\`;
  const h = Math.floor(diff / 60);
  return h === 1 ? '1 uur geleden' : \`\${h} uur geleden\`;
}

function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function animateCounter(el, target, suffix = '') {
  const num = parseFloat(String(target).replace(/[^0-9.]/g, '')) || 0;
  const isFloat = String(target).includes('.');
  const decimals = isFloat ? (String(target).split('.')[1] || '').length : 0;
  const duration = 1000;
  const start = performance.now();
  // Preserve inner suffix span if present
  const unitSpan = el.querySelector('.stat-unit');
  function setNum(val) {
    const formatted = decimals > 0 ? val.toFixed(decimals) : Math.floor(val);
    if (unitSpan) {
      el.firstChild.textContent = formatted;
    } else {
      el.textContent = formatted + suffix;
    }
  }
  // Set initial node if unitSpan exists
  if (unitSpan && !el.firstChild.nodeType === Node.TEXT_NODE) {
    el.insertBefore(document.createTextNode('0'), unitSpan);
  } else if (unitSpan) {
    el.firstChild.textContent = '0';
  }
  // Respect prefers-reduced-motion: the CSS catch-all already collapses
  // transition/animation durations, but this counter is a JS rAF loop, so
  // it needs its own check — jump straight to the final value instead.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setNum(num);
    return;
  }
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    setNum(num * eased);
    if (progress < 1) requestAnimationFrame(step);
    else setNum(num);
  }
  requestAnimationFrame(step);
}

/* ============================================================
   TOAST SYSTEM
   ============================================================ */
function toast(message, type = 'info', title = null) {
  const container = document.getElementById('toast-container');
  const icons = {
    success: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>',
    error:   '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info:    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  const titles = { success: 'Gelukt', error: 'Fout', info: 'Info' };
  const el = document.createElement('div');
  el.className = \`toast toast-\${type}\`;
  el.innerHTML = \`
    <div class="toast-header">
      <span class="toast-title">\${icons[type]}\${title ? escHtml(title) : titles[type]}</span>
      <button class="toast-close" onclick="dismissToast(this.closest('.toast'))" aria-label="Sluiten"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="toast-message">\${escHtml(message)}</div>
    <div class="toast-progress"></div>
  \`;
  container.appendChild(el);
  const timer = setTimeout(() => dismissToast(el), 3500);
  el._timer = timer;
}

function dismissToast(el) {
  if (!el || el.classList.contains('dismissing')) return;
  clearTimeout(el._timer);
  el.classList.add('dismissing');
  setTimeout(() => el.remove(), 300);
}

/* ============================================================
   THEME. Locked dark to match helvaro.pro brand
   ============================================================ */
function initTheme() {
  // Dark is de default. Alleen als de gebruiker zelf bewust naar light is
  // geswitcht (opgeslagen 'light') tonen we light. Nieuwe/onbekende
  // bezoekers krijgen dark.
  const saved = localStorage.getItem('hv-theme') === 'light' ? 'light' : 'dark';
  applyTheme(saved);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = theme === 'dark'
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  localStorage.setItem('hv-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Re-render chart with correct theme colors
  setTimeout(renderChart, 50);
}

/* ============================================================
   AUTH
   ============================================================ */
const AUTH_URL = '/api/auth';

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// The session token is deliberately NOT persisted to localStorage any more.
// It lives in an httpOnly cookie the server sets at login (api/_session.js),
// which script cannot read — so an XSS anywhere in this file can no longer
// walk off with a working 7-day session. state.apiKey is kept in memory only,
// so the existing x-api-key call sites keep working within a page life; after
// a reload the cookie authenticates instead. The remaining keys below are
// non-secret display data (which client, which project, which email).
function saveSession(apiKey, clientName, projectCode, email) {
  localStorage.setItem('hv-client', clientName || '');
  localStorage.setItem('hv-project', projectCode || '');
  localStorage.setItem('hv-exp', String(Date.now() + SESSION_TTL));
  if (email) localStorage.setItem('hv-email', email);
  state.apiKey     = apiKey;
  state.clientName = clientName || '';
  state.userEmail  = email || localStorage.getItem('hv-email') || '';
}

function clearSession() {
  ['hvk', 'hv-client', 'hv-project', 'hv-exp', 'hv-email'].forEach(k => localStorage.removeItem(k)); // 'hvk' kept in the list so any token left by an older build is cleaned up
  state.apiKey     = '';
  state.clientName = '';
  state.userEmail  = '';
}

function tryAutoLogin() {
  // There is no readable token any more, so this can only make an optimistic
  // guess: if we still hold the non-secret session markers and they haven't
  // expired, show the dashboard and let the first API call settle it. The
  // httpOnly cookie is what actually authenticates; if it is gone or invalid
  // the call returns 401 and handleAuthExpired() drops back to the login page.
  const exp    = parseInt(localStorage.getItem('hv-exp') || '0', 10);
  const marker = localStorage.getItem('hv-client') || localStorage.getItem('hv-project');
  if (!marker) return false;
  if (Date.now() > exp) { clearSession(); return false; }
  // Sentinel, not a real token. Seven call sites gate on state.apiKey being
  // truthy (including the polling loop), so leaving it empty would silently
  // stop the whole dashboard from refreshing after a reload. The value is
  // never what authenticates: the server reads the httpOnly cookie first and
  // only falls back to this header, where it simply fails verification and
  // yields a 401 -> login, which is exactly the right outcome when the
  // cookie is gone.
  state.apiKey     = 'cookie-session';
  state.clientName = localStorage.getItem('hv-client') || '';
  state.userEmail  = localStorage.getItem('hv-email')  || '';
  return true;
}

// Ask for confirmation before logging out. Voorkomt accidental clicks
// (vooral op mobile waar de Uitloggen-knop dicht bij andere navigatie zit).
function logout() {
  showConfirmModal({
    title:   'Uitloggen?',
    message: 'Je wordt teruggebracht naar het loginscherm. Je leads en instellingen blijven bewaard.',
    confirmText: 'Ja, uitloggen',
    cancelText:  'Annuleren',
    danger: true,
    onConfirm: performLogout
  });
}

function performLogout() {
  // Wis ALLE state. Vorige versie liet onboarding-flags en pagina-caches
  // staan, waardoor de volgende user (op zelfde computer) soms in een
  // half-vorige-sessie staat kon belanden.
  hideHelpWidget();
  clearSession();
  state.leads = [];
  state.stats = null;
  state.userEmail = '';
  state.lastFetch = 0;
  state.adminLoaded = false;
  // Sessie-flags wissen (one-time triggers per login)
  try {
    sessionStorage.removeItem('hv-setup-checked');
    sessionStorage.removeItem('hv-setup-pending');
    sessionStorage.removeItem('hv-setup-missing');
  } catch {}
  // Cached page-state objects resetten (AP_STATE.loaded zorgt voor refetch)
  try { if (typeof AP_STATE !== 'undefined') AP_STATE.loaded = false; } catch {}
  // Stop polling/heartbeats. Voorkomt 401-spam tijdens login pagina
  try { stopPresencePing && stopPresencePing(); } catch {}
  // UI terug naar login
  document.getElementById('dashboard-app').classList.remove('visible');
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.remove('visible');
  // Reset login knop state (voor het geval de spinner nog draait)
  const btn = document.getElementById('btn-login');
  if (btn) {
    btn.disabled = false;
    btn.classList.remove('loading');
    const span = btn.querySelector('span');
    if (span) span.textContent = 'Inloggen';
  }
}

// Generic confirmation modal. Injected dynamically so it doesn't pollute HTML.
// Matches the project's modal style (dark overlay, rounded card, gap-12).
// Esc/click-outside cancels; Enter confirms. Returns nothing. Uses callbacks.
function showConfirmModal({ title, message, confirmText, cancelText, danger, onConfirm, onCancel }) {
  // Remove any existing instance first (defensive)
  const existing = document.getElementById('confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;animation:cmFadeIn .15s ease-out';

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--card,#161D28);border:1px solid var(--border,#2A3444);border-radius:18px;padding:24px;width:100%;max-width:400px;box-shadow:none';

  const titleEl = document.createElement('h3');
  titleEl.textContent = title || 'Weet je het zeker?';
  titleEl.style.cssText = 'margin:0 0 8px;font-size:17px;color:var(--text,#E9EEF6)';

  const msgEl = document.createElement('p');
  msgEl.textContent = message || '';
  msgEl.style.cssText = 'margin:0 0 22px;font-size:13px;color:var(--text-muted,#999);line-height:1.5';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = cancelText || 'Annuleren';
  cancelBtn.className = 'cm-btn cm-btn-cancel';
  cancelBtn.style.cssText = 'padding:9px 16px;background:var(--card-elevated,#1E2735);border:1px solid var(--border,#2A3444);border-radius:14px;color:var(--text,#E9EEF6);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:var(--transition,all .2s ease)';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = confirmText || 'Ja, ga door';
  confirmBtn.className = 'cm-btn cm-btn-confirm' + (danger ? ' danger' : '');
  const confirmBg = danger ? 'var(--error,#F87171)' : 'var(--accent,#E8D7B1)';
  const confirmFg = danger ? '#fff' : 'var(--on-accent,#0B0F16)';
  confirmBtn.style.cssText = 'padding:9px 16px;background:' + confirmBg + ';border:0;border-radius:14px;color:' + confirmFg + ';font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:var(--transition,all .2s ease)';

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', keyHandler);
  }
  function keyHandler(e) {
    if (e.key === 'Escape') { close(); if (onCancel) onCancel(); }
    if (e.key === 'Enter')  { close(); if (onConfirm) onConfirm(); }
  }
  cancelBtn.addEventListener('click', () => { close(); if (onCancel) onCancel(); });
  confirmBtn.addEventListener('click', () => { close(); if (onConfirm) onConfirm(); });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { close(); if (onCancel) onCancel(); } });
  document.addEventListener('keydown', keyHandler);

  row.appendChild(cancelBtn);
  row.appendChild(confirmBtn);
  card.appendChild(titleEl);
  card.appendChild(msgEl);
  card.appendChild(row);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  // Auto-focus the confirm button so Enter works without clicking
  setTimeout(() => confirmBtn.focus(), 50);
}

/* ============================================================
   API CALLS
   ============================================================ */
async function fetchLeads() {
  // Hard 10s timeout. zonder dit kan een trage Airtable de login-spinner
  // eindeloos laten draaien. We tonen liever een lege dashboard met retry
  // dan een knop die nooit antwoord geeft.
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const resp = await fetch(\`\${API_BASE}/leads\`, {
      headers: { 'x-api-key': state.apiKey },
      signal: ctrl.signal
    });
    if (resp.status === 401) { handleAuthExpired(); throw new Error('Sessie verlopen'); }
    if (resp.status === 403) {
      // Distinguish "you exist but have no client yet" from a real failure —
      // see TENANT_PENDING in api/leads.js.
      const body = await resp.json().catch(() => ({}));
      if (body && body.code === 'TENANT_PENDING') window.__hvTenantPending = true;
      throw new Error('API fout: 403');
    }
    if (!resp.ok) throw new Error(\`API fout: \${resp.status}\`);
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Called when any authenticated fetch returns 401. token expired or invalidated.
// Wipes the session and shows the login screen so the user can re-auth.
let _authExpiredHandled = false;
function handleAuthExpired() {
  if (_authExpiredHandled) return;
  _authExpiredHandled = true;
  try { toast('Je sessie is verlopen. Log opnieuw in', 'info'); } catch (e) {}
  setTimeout(() => {
    try { clearSession(); } catch (e) {}
    try { sessionStorage.removeItem('hv-setup-checked'); } catch (e) {}
    const dashEl = document.getElementById('dashboard-app');
    const loginEl = document.getElementById('login-page');
    if (dashEl) dashEl.classList.remove('visible');
    if (loginEl) loginEl.style.display = 'flex';
    hideHelpWidget();
    const emailEl = document.getElementById('login-email');
    if (emailEl) emailEl.focus();
    _authExpiredHandled = false;
  }, 600);
}

async function fetchRapport() {
  const resp = await fetch(\`\${API_BASE}/leads?rapport=week\`, {
    headers: { 'x-api-key': state.apiKey }
  });
  if (resp.status === 401) { handleAuthExpired(); throw new Error('Sessie verlopen'); }
  if (!resp.ok) throw new Error(\`API fout: \${resp.status}\`);
  return resp.json();
}

async function patchLead(id, fields) {
  const resp = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'x-api-key': state.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields)
  });
  if (!resp.ok) throw new Error(\`Opslaan mislukt: \${resp.status}\`);
  return resp.json();
}

function parseNotities(lead) {
  const raw = (lead.notities || '').trim();
  const empty = { notes: [], tasks: [], calls: [], afspraak: null };
  if (!raw || !raw.startsWith('{')) {
    return { ...empty, notes: raw ? [{ id: 'legacy', text: raw, ts: lead.datum || new Date().toISOString() }] : [] };
  }
  try {
    const d = JSON.parse(raw);
    return {
      ...d,
      notes:    Array.isArray(d.notes) ? d.notes : [],
      tasks:    Array.isArray(d.tasks) ? d.tasks : [],
      calls:    Array.isArray(d.calls) ? d.calls : [],
      afspraak: d.afspraak || null
    };
  } catch { return empty; }
}

function serializeNotities(data) {
  // Spread first so keys the dashboard doesn't know about (consent, waFailed,
  // etc. — written by form.js / whatsapp.js / cron-followup.js) round-trip
  // through a save instead of being dropped. The known keys are then always
  // re-applied on top so they stay in their canonical shape.
  const obj = { ...data, _v: 1, notes: data.notes || [], tasks: data.tasks || [], calls: data.calls || [] };
  if (data.afspraak !== undefined) obj.afspraak = data.afspraak;
  return JSON.stringify(obj);
}

async function saveNotitiesData(leadId, data) {
  const json = serializeNotities(data);
  return patchLead(leadId, { notities: json });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'zojuist';
  if (mins < 60) return mins + 'm geleden';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'u geleden';
  return Math.floor(hrs / 24) + 'd geleden';
}

function taskDueLabel(due) {
  if (!due) return { label: '', cls: '' };
  const today = new Date().toISOString().slice(0, 10);
  if (due < today) return { label: 'Verlopen', cls: 'overdue' };
  if (due === today) return { label: 'Vandaag', cls: 'today' };
  const d = new Date(due);
  return { label: d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }), cls: '' };
}

async function patchStatus(id, status) {
  const resp = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'x-api-key': state.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  if (!resp.ok) throw new Error(\`Status opslaan mislukt: \${resp.status}\`);
  return resp.json();
}

function exportCSV() {
  const btn = document.getElementById('btn-download-csv');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  fetch(\`\${API_BASE}/leads\`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
    body:    JSON.stringify({ mode: 'csv-export' })
  })
    .then(r => {
      if (r.status === 401) { handleAuthExpired && handleAuthExpired(); throw new Error('Sessie verlopen'); }
      if (!r.ok) throw new Error('Export mislukt');
      const ts = new Date().toISOString().slice(0, 10);
      const cd = r.headers.get('Content-Disposition') || '';
      const m  = cd.match(/filename="([^"]+)"/);
      return r.blob().then(blob => ({ blob, fname: (m && m[1]) || ('helvaro-leads-' + ts + '.csv') }));
    })
    .then(({ blob, fname }) => {
      const burl = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = burl;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(burl);
      toast('CSV-bestand is gedownload', 'success');
    })
    .catch(err => toast(err.message || 'Export mislukt', 'error'))
    .finally(() => { if (btn) { btn.disabled = false; btn.style.opacity = ''; } });
}

/* ============================================================
   REFRESH DATA
   ============================================================ */
// ── LocalStorage lead cache ────────────────────────────────────────────────
// Persists the last successful Airtable response so the dashboard stays
// populated across page reloads even when Airtable is temporarily rate-limited.
const LS_LEADS_KEY = 'hvk_leads_cache';
const LS_LEADS_TTL = 24 * 60 * 60 * 1000; // 24 hours
function saveLeadsToLS(leads, stats) {
  try { localStorage.setItem(LS_LEADS_KEY, JSON.stringify({ leads, stats, ts: Date.now() })); } catch {}
}
function loadLeadsFromLS() {
  try {
    const c = JSON.parse(localStorage.getItem(LS_LEADS_KEY) || '{}');
    if (c.leads && c.leads.length > 0 && Date.now() - (c.ts || 0) < LS_LEADS_TTL) return c;
  } catch {}
  return null;
}

// Populate the small Form Link banner above the dashboard stats grid.
// Idempotent. Safe to call from refreshData() every cycle.
function populateDashFormLink() {
  const urlEl  = document.getElementById('dash-formlink-url');
  const openEl = document.getElementById('dash-formlink-open');
  const wrap   = document.getElementById('dash-formlink');
  if (!urlEl || !openEl) return;
  const url = (typeof getFormUrl === 'function') ? getFormUrl() : '';
  if (!url) { if (wrap) wrap.style.display = 'none'; return; }
  if (wrap) wrap.style.display = '';
  urlEl.textContent = url;
  openEl.href = url;
}

async function refreshData(skipFetch = false) {
  populateDashFormLink();
  const btn = document.getElementById('btn-refresh');
  if (btn) btn.classList.add('spin');

  try {
    if (!skipFetch) {
      const data = await fetchLeads();

      if (data.rateLimited || data.stale) {
        // Airtable is busy. Keep whatever data we already have in state.
        // Fall back to localStorage if state is empty (e.g. First load after reload).
        if (!state.leads || state.leads.length === 0) {
          const lsCache = loadLeadsFromLS();
          if (lsCache) {
            state.leads = lsCache.leads;
            state.stats = lsCache.stats || {};
          }
        }
        const ts = document.getElementById('timestamp-info');
        if (ts) ts.textContent = data.stale ? 'Gecachte data (Airtable bezet)' : 'Tijdelijk bezet. Vorige data weergegeven';
        // Still re-render with whatever we have (so UI shows cached data)
      } else {
        // Fresh successful response. Update state and persist to localStorage
        state.leads    = data.leads || [];
        state.stats    = data.stats || {};
        state.clientName  = data.client?.naam    || 'Gebruiker';
        state.calendlyUrl = data.client?.calendly || '';
        state.lastFetch   = Date.now();
        if (state.leads.length > 0) saveLeadsToLS(state.leads, state.stats);
      }
    }
    // When skipFetch=true, state is already populated by init(). go straight to render

    updateUserInfo();
    renderStats();
    applyFilters();
    updateTimestamp();
    renderChart();
    renderBronChart();
    detectNewLeads(state.leads);
    loadCreditUsage(); // internally throttled — safe to call every refreshData()
    loadPlanStatus();  // internally throttled — safe to call every refreshData()
    loadOnboardingChecklist(); // internally throttled — safe to call every refreshData(); needs state.stats, so runs after renderStats() above
    if (state.currentPage === 'exports') updateExportPreview();

    // Top leads strip
    const topStrip = document.getElementById('top-leads-strip');
    const topList  = document.getElementById('top-leads-list');
    if (topStrip && topList && state.leads && state.leads.length > 0) {
      const top5 = [...state.leads]
        .filter(l => l.leadScore != null)
        .sort((a,b) => (b.leadScore || 0) - (a.leadScore || 0))
        .slice(0, 6);
      if (top5.length > 0) {
        topStrip.style.display = 'block';
        topList.innerHTML = top5.map(l => {
          const name = l.naam || 'Onbekend';
          const score = l.leadScore ?? '—';
          const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
          return \`<div class="top-lead-chip" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escJs(String(l.id))}');if(lead)openPanel(lead);})()">
            <div class="top-lead-chip-avatar">\${initials}</div>
            <span class="top-lead-chip-name">\${escHtml(name.split(' ')[0])}</span>
            <span class="top-lead-chip-score">\${score}</span>
          </div>\`;
        }).join('');
      }
    }
    // Follow-up queue
    const followupWidget = document.getElementById('followup-widget');
    const followupList   = document.getElementById('followup-list');
    const followupCount  = document.getElementById('followup-count');
    if (followupWidget && followupList) {
      const needsFollowup = (state.leads || [])
        .filter(l => l.qualified === true && !l.afspraakGeboekt)
        .sort((a,b) => (b.leadScore||0) - (a.leadScore||0))
        .slice(0, 5);
      if (needsFollowup.length > 0) {
        followupWidget.style.display = 'block';
        if (followupCount) followupCount.textContent = needsFollowup.length;
        followupList.innerHTML = needsFollowup.map(l => {
          const name = l.naam || 'Onbekend';
          const score = l.leadScore ?? '—';
          const bron  = l.bron || 'Onbekende bron';
          return \`<div class="followup-item" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escJs(String(l.id))}');if(lead)openPanel(lead);})()">
            <div style="flex:1;min-width:0">
              <div class="followup-item-name">\${escHtml(name)}</div>
              <div class="followup-item-meta">\${escHtml(bron)}</div>
            </div>
            <span class="followup-item-score">\${score}</span>
            <button class="followup-call-btn" onclick="event.stopPropagation();if(navigator.clipboard)navigator.clipboard.writeText('\${escJs(l.telefoon||'')}').then(()=>toast('Nummer gekopieerd','success'))">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07"/><path d="M1 1l22 22"/></svg>
              Kopieer
            </button>
          </div>\`;
        }).join('');
      } else {
        followupWidget.style.display = 'none';
      }
    }

    // Niet bereikbaar widget
    renderNietBereikbaar();

    // Taken widget
    renderTakenWidget();

    // Revenue goal card
    renderRevenueGoal();

    // Bell: count leads from last 24h as "new"
    const bell = document.getElementById('notif-badge');
    if (bell) {
      const fresh = (state.leads||[]).filter(l => l.datum && new Date(l.datum) > new Date(Date.now()-86400000)).length;
      if (fresh > 0) { bell.style.display='flex'; bell.textContent=fresh>9?'9+':fresh; bell.dataset.count=fresh; }
      else { bell.style.display='none'; }
    }
  } catch (err) {
    const ts = document.getElementById('timestamp-info');
    if (ts) ts.textContent = 'Verbinding mislukt. Opnieuw proberen over 90s';
    console.warn('refreshData error:', err.message);
  } finally {
    if (btn) btn.classList.remove('spin');
  }
}

/* ============================================================
   UPDATE TIMESTAMP
   ============================================================ */
function updateTimestamp() {
  const el = document.getElementById('timestamp-info');
  if (el && state.lastFetch) {
    el.textContent = 'Bijgewerkt ' + timeAgo(state.lastFetch);
  }
}

setInterval(updateTimestamp, 60000);
// Poll for new leads every 5 minutes with random startup jitter (30–90s) so
// multiple dashboard sessions never fire simultaneously and stay well below
// Airtable's 5 req/s base-level rate limit.
const POLL_INTERVAL = 10 * 60 * 1000; // 10 minutes. Halved Airtable polling load
const pollJitter    = Math.random() * 60000 + 30000; // 30–90s startup offset
setTimeout(() => {
  if (state.apiKey) refreshData();
  setInterval(() => { if (state.apiKey) refreshData(); }, POLL_INTERVAL);
}, pollJitter);

/* ============================================================
   NEW LEAD NOTIFICATIONS (Feature 1)
   ============================================================ */
function detectNewLeads(leads) {
  const ids = new Set(leads.map(l => l.id));
  if (state.knownLeadIds === null) {
    // First load. Just store IDs, no notification
    state.knownLeadIds = ids;
    return;
  }
  const fresh = leads.filter(l => !state.knownLeadIds.has(l.id));
  state.knownLeadIds = ids;
  if (fresh.length === 0) return;

  state.newLeadCount += fresh.length;
  updateNavBadge();

  // Browser notification
  if (Notification.permission === 'granted') {
    fresh.forEach(l => {
      new Notification('Nieuwe lead. ' + (l.naam || 'Onbekend'), {
        body: 'Telefoon: ' + (l.telefoon || '—'),
        icon: '/favicon.png'
      });
    });
  }
  toast(\`\${fresh.length} nieuwe lead\${fresh.length > 1 ? 's' : ''} binnengekomen!\`, 'info');

  // Update notification bell
  const badge = document.getElementById('notif-badge');
  if (badge) {
    const unread = parseInt(badge.dataset.count || '0') + fresh.length;
    if (unread > 0) {
      badge.style.display = 'flex';
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.dataset.count = unread;
    }
  }
}

function updateNavBadge() {
  const nav = document.getElementById('nav-dashboard');
  if (!nav) return;
  let badge = nav.querySelector('.nav-badge');
  if (state.newLeadCount === 0) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; nav.appendChild(badge); }
  badge.textContent = state.newLeadCount;
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ============================================================
   LEADS CHART (Feature 7)
   ============================================================ */
function renderChart() {
  const canvas = document.getElementById('leads-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  // Build weekly buckets for last 8 weeks
  const weeks = [];
  const counts = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(start.getDate() - (i + 1) * 7);
    const end = new Date(now);
    end.setDate(end.getDate() - i * 7);
    const label = \`W\${8 - i}\`;
    const count = state.leads.filter(l => {
      const d = new Date(l.datum);
      return d >= start && d < end;
    }).length;
    weeks.push(label);
    counts.push(count);
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  // Leads are blue in the semantic palette. A vertical gradient makes a
  // bar read as a solid object catching light instead of a flat block of
  // colour — the single cheapest thing that stops a chart looking like a
  // default library render.
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
  grad.addColorStop(0, 'rgba(79,124,255,0.95)');
  grad.addColorStop(1, 'rgba(79,124,255,0.35)');
  const gradHover = ctx.createLinearGradient(0, 0, 0, canvas.height || 240);
  gradHover.addColorStop(0, 'rgba(79,124,255,1)');
  gradHover.addColorStop(1, 'rgba(6,182,212,0.55)');

  if (state.leadsChart) state.leadsChart.destroy();
  state.leadsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: weeks,
      datasets: [{
        label: 'Leads',
        data: counts,
        backgroundColor: grad,
        borderWidth: 0,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 44,
        hoverBackgroundColor: gradHover
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      // Respect the OS setting rather than animating regardless.
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? false
        : { duration: 700, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? 'rgba(27,29,34,0.94)' : 'rgba(20,22,28,0.94)',
          titleColor: '#fff',
          bodyColor: '#E7EAF0',
          borderColor: 'rgba(79,124,255,0.5)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
          callbacks: {
            label: (i) => \` \${i.parsed.y} lead\${i.parsed.y === 1 ? '' : 's'}\`
          }
        }
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: isLight ? '#6B7280' : '#9AA3B2', font: { size: 11 } }
        },
        y: {
          border: { display: false },
          grid: { color: isLight ? 'rgba(45,42,38,0.06)' : 'rgba(255,255,255,0.05)' },
          ticks: { color: isLight ? '#6B7280' : '#9AA3B2', stepSize: 1, font: { size: 11 } },
          beginAtZero: true
        }
      }
    }
  });
}

/* ============================================================
   BRON DONUT CHART
   ============================================================ */
function renderBronChart() {
  const wrap   = document.getElementById('bron-chart-wrap');
  const canvas = document.getElementById('bron-chart');
  if (!wrap || !canvas || typeof Chart === 'undefined') return;

  // Count leads by bron
  const counts = {};
  state.leads.forEach(l => {
    if (l.bron) counts[l.bron] = (counts[l.bron] || 0) + 1;
  });
  const labels = Object.keys(counts);
  if (labels.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const palette = ['#E8D7B1','#E8D7B1','#34D399','#C9AE7C','#C9AE7C','#8D99AC'];
  const data    = labels.map(k => counts[k]);
  const colors  = labels.map((_, i) => palette[i % palette.length]);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';

  if (state.bronChart) state.bronChart.destroy();
  state.bronChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      responsive: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: isLight ? '#5c6478' : '#8b949e',
            font: { size: 11 },
            boxWidth: 10,
            padding: 8
          }
        }
      }
    }
  });
}

/* ============================================================
   ADMIN. MULTI-CLIENT (Feature 4)
   ============================================================ */
async function loadAdminClients() {
  const grid = document.getElementById('admin-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="color:var(--text-muted);font-size:14px">Klanten laden...</div>';
  try {
    const resp = await fetch(\`\${API_BASE}/admin\`, { headers: { 'x-api-key': state.apiKey } });
    if (!resp.ok) throw new Error('Geen toegang');
    const data = await resp.json();
    const clients = data.clients || [];
    if (clients.length === 0) { grid.innerHTML = '<div style="color:var(--text-muted)">Geen klanten gevonden.</div>'; return; }
    // Store clients in state so we can look up by index (never expose apiKey in DOM)
    state.adminClients = clients;
    const countEl = document.getElementById('admin-client-count');
    if (countEl) countEl.textContent = clients.length + ' klant' + (clients.length !== 1 ? 'en' : '');
    grid.innerHTML = clients.map((c, i) => \`
      <div class="admin-card" onclick="switchToClient(\${i})">
        <div class="admin-card-name">\${escHtml(c.naam)}</div>
        <div class="admin-card-code">\${escHtml(c.projectCode)}</div>
        <div class="admin-card-stats">
          <div class="admin-stat"><div class="admin-stat-val">\${c.totalLeads}</div><div class="admin-stat-lbl">Leads</div></div>
          <div class="admin-stat"><div class="admin-stat-val" style="color:var(--red)">\${c.newLeads}</div><div class="admin-stat-lbl">Nieuw</div></div>
          <div class="admin-stat"><div class="admin-stat-val" style="color:var(--green)">\${c.qualified}</div><div class="admin-stat-lbl">Gekwal.</div></div>
        </div>
      </div>
    \`).join('');
  } catch (err) {
    grid.innerHTML = \`<div style="color:var(--red);font-size:14px">\${escHtml(err.message)}</div>\`;
  }
}

async function openNewClientModal() {
  // Reset invite panel
  document.getElementById('nc-inv-email').value = '';
  document.getElementById('nc-inv-name').value  = '';
  document.getElementById('nc-inv-error').style.display   = 'none';
  document.getElementById('nc-inv-success').style.display = 'none';
  document.getElementById('nc-inv-btn').disabled    = false;
  document.getElementById('nc-inv-btn').textContent = 'Stuur uitnodigingsmail';

  // Reset manual panel
  document.getElementById('nc-name').value     = '';
  document.getElementById('nc-code').value     = '';
  document.getElementById('nc-email').value    = '';
  document.getElementById('nc-calendly').value = '';
  document.getElementById('nc-error').style.display   = 'none';
  document.getElementById('nc-success').style.display = 'none';
  document.getElementById('nc-submit').disabled    = false;
  document.getElementById('nc-submit').textContent = 'Aanmaken';
  document.getElementById('nc-manual-panel').style.display = 'none';
  document.getElementById('nc-manual-toggle').textContent  = 'Zelf aanmaken ▾';

  // Invite link row starts hidden until the authenticated fetch below
  // resolves. The raw ONBOARD_CODE is never sent to the browser — the
  // server hands back a ready-made link instead (api/admin.js, mode
  // 'invite-link'). Previously this code was embedded directly into the
  // page's rendered HTML (window.__hOnboard), readable by anyone who
  // loaded /dashboard, authenticated or not.
  document.getElementById('nc-invite-link-row').style.display  = 'none';
  document.getElementById('nc-invite-missing').style.display   = 'none';

  document.getElementById('new-client-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('nc-inv-email').focus(), 50);

  try {
    const resp = await fetch(\`\${API_BASE}/admin\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'invite-link' })
    });
    if (resp.status === 401) { handleAuthExpired(); return; }
    const data = await resp.json().catch(() => ({}));
    const link = resp.ok ? (data.inviteLink || '') : '';
    if (link) {
      document.getElementById('nc-invite-link').textContent  = link;
      document.getElementById('nc-invite-link').dataset.link = link;
      document.getElementById('nc-invite-link-row').style.display  = 'block';
      document.getElementById('nc-invite-missing').style.display   = 'none';
    } else {
      document.getElementById('nc-invite-link-row').style.display  = 'none';
      document.getElementById('nc-invite-missing').style.display   = 'block';
    }
  } catch {
    document.getElementById('nc-invite-link-row').style.display  = 'none';
    document.getElementById('nc-invite-missing').style.display   = 'block';
  }
}

function toggleManualCreate() {
  const panel  = document.getElementById('nc-manual-panel');
  const toggle = document.getElementById('nc-manual-toggle');
  const open   = panel.style.display !== 'none';
  panel.style.display  = open ? 'none' : 'block';
  toggle.textContent   = open ? 'Zelf aanmaken ▾' : 'Zelf aanmaken ▴';
}

async function sendClientInvite() {
  // Normaliseer het adres: strip zero-width tekens, nbsp en ALLE whitespace
  // (autofill- en plak-artefacten die de validatie onterecht lieten falen),
  // en lowercase. Een geldig e-mailadres bevat nooit spaties, dus dit is veilig.
  const email = (document.getElementById('nc-inv-email').value || '')
    .replace(/[​-‍﻿ ]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  const name  = document.getElementById('nc-inv-name').value.trim();
  const errEl = document.getElementById('nc-inv-error');
  const sucEl = document.getElementById('nc-inv-success');
  const btn   = document.getElementById('nc-inv-btn');

  errEl.style.display = 'none';
  sucEl.style.display = 'none';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Vul een geldig e-mailadres in.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Versturen...';

  try {
    const resp = await fetch('/api/admin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'invite', email, name })
    });
    const data = await resp.json();
    if (!resp.ok) {
      errEl.textContent = data.message || data.error || 'Verzenden mislukt. Probeer opnieuw.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Stuur uitnodigingsmail';
    } else {
      sucEl.style.display = 'block';
      btn.textContent = 'Verzonden';
      setTimeout(() => { btn.disabled = false; btn.textContent = 'Nog een sturen'; }, 3000);
    }
  } catch {
    errEl.textContent = 'Netwerkfout. Controleer je verbinding.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Stuur uitnodigingsmail';
  }
}

function copyInviteLink() {
  const link = document.getElementById('nc-invite-link')?.dataset.link;
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById('nc-invite-copy');
    btn.textContent = '';
    setTimeout(() => { btn.textContent = 'Kopieer'; }, 2000);
  }).catch(() => {});
}

function closeNewClientModal() {
  document.getElementById('new-client-modal').style.display = 'none';
}

// Auto-fill project code from client name
document.addEventListener('DOMContentLoaded', () => {
  const nameEl = document.getElementById('nc-name');
  const codeEl = document.getElementById('nc-code');
  if (nameEl && codeEl) {
    nameEl.addEventListener('input', () => {
      if (!codeEl._edited) {
        codeEl.value = nameEl.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
      }
    });
    codeEl.addEventListener('input', () => { codeEl._edited = true; });
  }
  document.getElementById('new-client-modal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('new-client-modal')) closeNewClientModal();
  });
});

async function submitNewClient() {
  const btn     = document.getElementById('nc-submit');
  const errEl   = document.getElementById('nc-error');
  const succEl  = document.getElementById('nc-success');
  const name     = document.getElementById('nc-name').value.trim();
  const code     = document.getElementById('nc-code').value.trim().toUpperCase();
  const email    = document.getElementById('nc-email').value.trim();
  const calendly = document.getElementById('nc-calendly').value.trim();

  errEl.style.display = 'none';
  if (!name || !code) { errEl.textContent = 'Naam en projectcode zijn verplicht.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.textContent = 'Aanmaken...';
  try {
    const resp = await fetch('/api/admin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ clientName: name, projectCode: code, email, calendlyLink: calendly })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.message || data.error || 'Aanmaken mislukt.'; errEl.style.display = 'block'; btn.disabled = false; btn.textContent = 'Aanmaken'; return; }

    document.getElementById('nc-result-key').textContent = data.apiKey;
    const urlEl = document.getElementById('nc-result-url');
    urlEl.textContent = data.formUrl;
    urlEl.href = data.formUrl;
    // Show login credentials block if a User record was also created
    if (data.userCreated && data.loginPassword) {
      document.getElementById('nc-result-email').textContent = email;
      document.getElementById('nc-result-pw').textContent    = data.loginPassword;
      document.getElementById('nc-result-login-block').style.display = '';
    }
    // Stash the data the manual-mail helpers need (kept off-DOM so closeNewClientModal can clear it)
    state.ncWelcome = {
      clientName: name,
      projectCode: code,
      email,
      formUrl: data.formUrl,
      loginPassword: data.userCreated ? data.loginPassword : ''
    };
    // Pre-fill the mailto: link's href so 1-klik opens the user's mail app
    const openBtn = document.getElementById('nc-open-mail-btn');
    if (openBtn) openBtn.href = buildWelcomeMailto(state.ncWelcome);
    succEl.style.display = 'block';
    btn.textContent = 'Sluiten';
    btn.disabled = false;
    btn.onclick = () => { closeNewClientModal(); state.adminLoaded = false; loadAdminClients(); };
  } catch {
    errEl.textContent = 'Netwerkfout. Probeer opnieuw.';
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Aanmaken';
  }
}

// Build the ready-to-paste welcome email text (plain text, no HTML. Fits any mailbox)
function buildWelcomeEmailText(d) {
  if (!d || !d.clientName) return '';
  const lines = [
    'Hé ' + d.clientName + ',',
    '',
    'Welkom bij Helvaro. Je account staat klaar.',
    '',
    'Dashboard: https://app.helvaro.pro/dashboard'
  ];
  if (d.loginPassword) {
    lines.push('Login: ' + d.email);
    lines.push('Wachtwoord: ' + d.loginPassword);
    lines.push('   (wijzig dit via "Wachtwoord vergeten" na de eerste login)');
  }
  lines.push('');
  lines.push('Jouw lead-formulier:');
  lines.push('   ' + d.formUrl);
  lines.push('   Plak deze URL in je Facebook/Google ads, op je website, of in je e-mail handtekening.');
  lines.push('');
  lines.push('Eerste 3 stappen:');
  lines.push('   1. Log in op je dashboard');
  lines.push('   2. Open AI Persoonlijkheid en pas de AI-naam + welkomstbericht aan');
  lines.push('   3. Test zelf je formulier. Je krijgt direct WhatsApp van je AI');
  lines.push('');
  lines.push('Vragen? Antwoord gewoon op deze mail.');
  lines.push('');
  lines.push('— Sindi @ Helvaro');
  return lines.join('\\n');
}

function buildWelcomeMailto(d) {
  if (!d || !d.email) return '#';
  const subject = encodeURIComponent('Welkom bij Helvaro. Je account is klaar');
  const body    = encodeURIComponent(buildWelcomeEmailText(d).replace(/\\\\n/g, '\\n'));
  return 'mailto:' + encodeURIComponent(d.email) + '?subject=' + subject + '&body=' + body;
}

function copyWelcomeEmail() {
  const d = state.ncWelcome;
  if (!d) return;
  const txt = buildWelcomeEmailText(d).replace(/\\\\n/g, '\\n');
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById('nc-copy-mail-btn');
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = 'Gekopieerd. Plak in je mail';
    setTimeout(() => { btn.innerHTML = orig; }, 2500);
  }).catch(() => toast('Kopiëren mislukt. Kopieer handmatig', 'error'));
}

function copyNcField(srcId, btnId) {
  const txt = document.getElementById(srcId)?.textContent || '';
  if (!txt) return;
  navigator.clipboard.writeText(txt).then(() => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = '';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {});
}

function switchToClient(index) {
  const client = state.adminClients && state.adminClients[index];
  if (!client || !client.apiKey) return;
  state.adminApiKey = state.adminApiKey || state.apiKey; // save admin token before overwriting
  state.apiKey = client.apiKey;
  state.knownLeadIds = null;
  state.adminLoaded = false;
  const backBtn = document.getElementById('btn-back-admin');
  if (backBtn) { backBtn.style.display = 'flex'; }
  navigateTo('dashboard');
  refreshData();
}

function backToAdmin() {
  if (state.adminApiKey) state.apiKey = state.adminApiKey; // restore admin token
  state.adminLoaded = false;
  navigateTo('admin');
  const backBtn = document.getElementById('btn-back-admin');
  if (backBtn) backBtn.style.display = 'none';
}

/* ============================================================
   UPDATE TIMESTAMP
   ============================================================ */
function updateUserInfo() {
  const nameEl = document.getElementById('user-name');
  const avatarEl = document.getElementById('user-avatar');
  if (nameEl) nameEl.textContent = state.clientName;
  if (avatarEl) avatarEl.textContent = getInitials(state.clientName);
}

/* ============================================================
   RENDER STATS
   ============================================================ */
function renderStats() {
  const s = state.stats || {};
  const total = s.total || 0;
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  // Trend: compare this week vs last week
  const now = Date.now();
  const weekMs = 7 * 86400000;
  const thisWeekLeads = (state.leads || []).filter(l => l.datum && new Date(l.datum) > new Date(now - weekMs));
  const lastWeekLeads = (state.leads || []).filter(l => l.datum && new Date(l.datum) > new Date(now - 2*weekMs) && new Date(l.datum) <= new Date(now - weekMs));
  const thisWeekQual  = thisWeekLeads.filter(l => l.qualified).length;
  const lastWeekQual  = lastWeekLeads.filter(l => l.qualified).length;
  const thisWeekBooked = thisWeekLeads.filter(l => l.afspraakGeboekt).length;
  const lastWeekBooked = lastWeekLeads.filter(l => l.afspraakGeboekt).length;
  const trendDiff = (a, b) => {
    const d = a - b;
    if (d === 0) return '<span style="color:var(--text-muted);font-size:11px">— zelfde</span>';
    const arrow = d > 0 ? '↑' : '↓';
    const col = d > 0 ? 'var(--green)' : 'var(--red)';
    return \`<span style="color:\${col};font-size:11px;font-weight:700">\${arrow} \${Math.abs(d)} vs vorige week</span>\`;
  };

  const cards = [
    {
      label: 'Totaal Leads',
      value: s.total || 0,
      suffix: '',
      desc: 'Alle ontvangen leads',
      color: '',
      fill: 100,
      trend: trendDiff(thisWeekLeads.length, lastWeekLeads.length)
    },
    {
      label: 'Gekwalificeerd',
      value: s.qualified || 0,
      suffix: '',
      desc: 'Door AI gekwalificeerd',
      color: 'cyan',
      fill: total ? Math.round((s.qualified / total) * 100) : 0,
      trend: trendDiff(thisWeekQual, lastWeekQual)
    },
    {
      label: 'Afspraken',
      value: s.booked || 0,
      suffix: '',
      desc: 'Geboekte afspraken',
      color: 'green',
      fill: total ? Math.round((s.booked / total) * 100) : 0,
      trend: trendDiff(thisWeekBooked, lastWeekBooked)
    },
    {
      label: 'Conversie',
      value: s.conversionRate || 0,
      suffix: '%',
      desc: 'Van lead naar afspraak',
      color: 'orange',
      fill: s.conversionRate || 0,
      trend: ''
    },
    {
      label: 'Deze Maand',
      value: s.thisMonth || 0,
      suffix: '',
      desc: 'Nieuwe leads deze maand',
      color: 'blue',
      fill: total ? Math.round(((s.thisMonth || 0) / total) * 100) : 0,
      trend: ''
    },
    {
      label: 'Gem. Reactie',
      value: s.avgResponseTime || 0,
      suffix: 'u',
      desc: 'Gemiddelde reactietijd',
      color: '',
      fill: 60,
      trend: ''
    }
  ];

  // Each metric carries its own colour + glyph so the grid can be read at
  // a glance without parsing six labels. Keyed on label so the card
  // objects above stay untouched. Icons are inline SVG on purpose — an
  // icon package would mean a CDN, and every external origin was removed
  // from this app for GDPR reasons.
  const META = {
    'Totaal Leads':   { a: 'blue',    i: '<path d="M3 7h18M3 12h18M3 17h12"/>' },
    'Gekwalificeerd': { a: 'emerald', i: '<path d="M20 6 9 17l-5-5"/>' },
    'Afspraken':      { a: 'orange',  i: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>' },
    'Conversie':      { a: 'purple',  i: '<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>' },
    'Deze Maand':     { a: 'gold',    i: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
    'Gem. Reactie':   { a: 'cyan',    i: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>' }
  };

  grid.innerHTML = cards.map(c => {
    const m = META[c.label] || { a: 'blue', i: '<circle cx="12" cy="12" r="9"/>' };
    return \`
    <div class="stat-card" data-accent="\${m.a}">
      <div class="stat-head">
        <div class="stat-label">\${c.label}</div>
        <span class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\${m.i}</svg></span>
      </div>
      <div class="stat-value \${c.color}" data-target="\${c.value}" data-suffix="\${c.suffix}">0\${c.suffix ? \`<span class="stat-unit">\${c.suffix}</span>\` : ''}</div>
      <div class="stat-desc">\${c.desc}</div>
      <div class="stat-trend">\${c.trend || ''}</div>
      <div class="stat-bar">
        <div class="stat-bar-fill" data-fill="\${c.fill}"></div>
      </div>
    </div>\`;
  }).join('');

  // Animate counters
  grid.querySelectorAll('.stat-value[data-target]').forEach(el => {
    const target = parseFloat(el.dataset.target);
    const suffix = el.dataset.suffix || '';
    animateCounter(el, target, suffix);
  });

  // Animate bars
  requestAnimationFrame(() => {
    grid.querySelectorAll('.stat-bar-fill').forEach(el => {
      el.style.width = el.dataset.fill + '%';
    });
  });
}

/* ============================================================
   RESULTATEN (ROI / VALUE REPORTING)
   ============================================================
   Client-facing "what did Helvaro deliver this month" panel. Backed by
   api/leads.js mode=report-summary — see REPORTING-SUMMARY.md for the exact
   definition of every metric. Never invents/projects revenue: every number
   here is a direct aggregation of what Airtable already contains, and
   "pipeline waarde" is explicitly labeled as a client-entered ESTIMATE, not
   revenue Helvaro generated. */
async function loadResultaten() {
  const grid = document.getElementById('resultaten-grid');
  if (!grid) return;
  const period = document.getElementById('resultaten-period')?.value || 'this_month';

  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'report-summary', period })
    });
    if (!r.ok) { toast('Kan resultaten niet laden', 'error'); return; }
    const d = await r.json();
    renderResultaten(d);
  } catch (err) {
    toast('Netwerkfout bij laden resultaten', 'error');
  }
}

// Trend delta vs the previous equivalent period. null on either side means
// "no data to compare" — render nothing rather than a misleading 0%.
// opts.lowerIsBetter flips the green/red so e.g. a faster response time
// (lower seconds) still shows green.
function resultatenTrend(curr, prev, opts) {
  opts = opts || {};
  if (curr == null || prev == null) return '';
  const diff = curr - prev;
  const epsilon = opts.epsilon || 0.05;
  if (Math.abs(diff) < epsilon) {
    return '<span style="color:var(--text-muted);font-size:11px">— gelijk aan vorige periode</span>';
  }
  const arrow = diff > 0 ? '↑' : '↓';
  const good  = opts.lowerIsBetter ? diff < 0 : diff > 0;
  const col   = good ? 'var(--green)' : 'var(--red)';
  const shown = opts.round1 ? Math.abs(Math.round(diff * 10) / 10) : Math.abs(Math.round(diff));
  const suffix = opts.suffix || '';
  return \`<span style="color:\${col};font-size:11px;font-weight:700">\${arrow} \${shown}\${suffix} vs vorige periode</span>\`;
}

function renderResultaten(d) {
  const grid = document.getElementById('resultaten-grid');
  const rangeEl = document.getElementById('resultaten-period-range');
  if (!grid || !d) return;
  const c = d.current  || {};
  const p = d.previous || null; // null for 'all_time' — no previous period exists

  if (rangeEl) {
    const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    rangeEl.textContent = (c.from && c.to) ? \`\${fmtDate(c.from)} — \${fmtDate(c.to)}\` : '';
  }

  // Brand-new client / genuinely empty period: show a friendly empty state
  // instead of a wall of zeroes and em-dashes (matches the leads-table empty state).
  const hasAnyData = c.leadsReceived || c.qualifiedCount || c.appointmentsBooked || c.pipelineValueTotal;
  if (!hasAnyData) {
    grid.innerHTML = \`
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-state-illustration" style="width:88px;height:88px;font-size:32px">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="1.8"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
        </div>
        <div class="empty-title">Nog geen resultaten</div>
        <div class="empty-desc">Zodra Helvaro leads voor je kwalificeert, verschijnen de cijfers hier automatisch — meestal binnen enkele dagen na de eerste aanvraag.</div>
      </div>
    \`;
    return;
  }

  const fmtEuro = v => v == null ? '—' : '€' + Math.round(v).toLocaleString('nl-NL');
  const fmtNum  = v => v == null ? '—' : v;
  const fmtSec  = v => v == null ? 'geen data' : (v < 60 ? Math.round(v) + 's' : Math.round(v / 60) + 'm');

  const cards = [
    {
      label: 'Leads Ontvangen',
      value: fmtNum(c.leadsReceived),
      desc:  'in geselecteerde periode',
      trend: p ? resultatenTrend(c.leadsReceived, p.leadsReceived) : ''
    },
    {
      label: 'Gekwalificeerd',
      value: fmtNum(c.qualifiedCount),
      color: 'cyan',
      desc:  c.qualifiedRate != null ? \`\${c.qualifiedRate}% van de leads\` : 'geen data',
      trend: p ? resultatenTrend(c.qualifiedCount, p.qualifiedCount) : ''
    },
    {
      label: 'Afspraken Geboekt',
      value: fmtNum(c.appointmentsBooked),
      color: 'green',
      desc:  'geboekte afspraken',
      trend: p ? resultatenTrend(c.appointmentsBooked, p.appointmentsBooked) : ''
    },
    {
      label: 'Verwachte Pipeline Waarde',
      value: fmtEuro(c.pipelineValueTotal),
      color: 'orange',
      desc:  c.pipelineValueCount ? \`\${c.pipelineValueCount} lead(s) met schatting\` : 'nog geen schattingen',
      trend: p ? resultatenTrend(c.pipelineValueTotal, p.pipelineValueTotal) : ''
    },
    {
      label: 'Gem. Lead Score',
      value: c.avgLeadScore == null ? '—' : c.avgLeadScore,
      color: 'blue',
      desc:  c.avgLeadScoreCount ? \`o.b.v. \${c.avgLeadScoreCount} leads\` : 'geen data',
      trend: p ? resultatenTrend(c.avgLeadScore, p.avgLeadScore, { round1: true }) : ''
    },
    {
      label: 'Gem. Reactietijd',
      value: fmtSec(c.avgResponseTime),
      desc:  c.avgResponseTimeCount ? \`o.b.v. \${c.avgResponseTimeCount} leads\` : 'geen data',
      trend: p ? resultatenTrend(c.avgResponseTime, p.avgResponseTime, { lowerIsBetter: true }) : ''
    }
  ];

  grid.innerHTML = cards.map(cd => \`
    <div class="stat-card">
      <div class="stat-label">\${cd.label}</div>
      <div class="stat-value \${cd.color || ''}">\${cd.value}</div>
      <div class="stat-desc">\${cd.desc}</div>
      <div class="stat-trend">\${cd.trend || ''}</div>
    </div>
  \`).join('');
}

/* ============================================================
   CREDIT USAGE WIDGET (sidebar, always-on while active)
   ============================================================
   Backed by api/leads.js mode=credit-usage -> api/_credits.js. Stays
   display:none forever for any client the credit system is inert for
   (no Airtable fields yet, or no allowance configured) — see
   CREDIT-SYSTEM-DESIGN.md §5 and _credits.js's file header. Never punitive:
   over-limit just switches the bar red and shows an upgrade nudge, it never
   blocks anything from this widget's own code (blocking, where it happens
   at all, lives server-side in the discretionary-feature call sites). */
let _creditUsageLastFetch = 0;
const CREDIT_USAGE_MIN_INTERVAL = 4 * 60 * 1000; // throttle: at most 1 fetch / 4 min, refreshData() polls every 10 min anyway

async function loadCreditUsage(force) {
  if (!state.apiKey) return;
  const now = Date.now();
  if (!force && now - _creditUsageLastFetch < CREDIT_USAGE_MIN_INTERVAL) return;
  _creditUsageLastFetch = now;
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'credit-usage' })
    });
    if (!r.ok) return; // fail silent — widget just stays hidden/stale, never an error toast
    const d = await r.json();
    renderCreditUsage(d);
  } catch (err) {
    // Network hiccup: leave the widget in whatever state it was already in.
  }
}

function renderCreditUsage(d) {
  const widget = document.getElementById('credit-usage-widget');
  if (!widget) return;
  if (!d || !d.active) { widget.style.display = 'none'; return; }

  widget.style.display = '';
  const pct = Math.max(0, Math.min(999, d.percentUsed || 0));
  const state2 = pct >= 100 ? 'red' : (pct >= 80 ? 'amber' : '');

  const pctEl  = document.getElementById('credit-usage-pct');
  const fillEl = document.getElementById('credit-usage-fill');
  const subEl  = document.getElementById('credit-usage-sub');

  if (pctEl) {
    pctEl.textContent = pct + '%';
    pctEl.className = 'credit-usage-pct' + (state2 ? ' ' + state2 : '');
  }
  if (fillEl) {
    fillEl.style.width = Math.min(100, pct) + '%';
    fillEl.className = 'credit-usage-fill' + (state2 ? ' ' + state2 : '');
  }
  if (subEl) {
    const used = (d.used || 0).toLocaleString('nl-BE');
    const allowance = (d.allowance || 0).toLocaleString('nl-BE');
    const leadsLeft = Math.max(0, d.leadsRemaining || 0);
    const daysLeft = d.daysLeft != null ? d.daysLeft : null;
    let line = \`\${used} / \${allowance} credits · nog ~\${leadsLeft} leadgesprekken\`;
    if (daysLeft != null) line += \` · \${daysLeft}d over in periode\`;
    if (d.overLimit) {
      subEl.innerHTML = line + '<a class="credit-usage-upgrade" href="mailto:${SUPPORT_EMAIL_ATTR}?subject=Credit%20limiet%20verhogen">Limiet bereikt — vraag een upgrade aan →</a>';
    } else {
      subEl.textContent = line;
    }
  }
}

/* ============================================================
   TRIAL BANNER (Dashboard page, top of main content)
   ============================================================
   Backed by api/leads.js mode=plan-status -> api/_plan.js. Stays
   display:none for any client whose plan is active/cancelled/paused, or
   for the fail-open default (blank Plan Status) every pre-trial client
   already has — see TRIAL-DESIGN.md §7. Same throttle pattern as
   loadCreditUsage() above: safe to call on every refreshData(). */
let _planStatusLastFetch = 0;
const PLAN_STATUS_MIN_INTERVAL = 4 * 60 * 1000; // throttle: at most 1 fetch / 4 min

async function loadPlanStatus(force) {
  if (!state.apiKey) return;
  const now = Date.now();
  if (!force && now - _planStatusLastFetch < PLAN_STATUS_MIN_INTERVAL) return;
  _planStatusLastFetch = now;
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'plan-status' })
    });
    if (!r.ok) return; // fail silent — banner just stays hidden/stale, never an error toast
    const d = await r.json();
    renderPlanBanner(d);
  } catch (err) {
    // Network hiccup: leave the banner in whatever state it was already in.
  }
}

function renderPlanBanner(d) {
  const banner = document.getElementById('dash-trial-banner');
  if (!banner) return;
  if (!d || !d.show) { banner.style.display = 'none'; return; }

  const iconEl  = document.getElementById('dash-trial-banner-icon');
  const titleEl = document.getElementById('dash-trial-banner-title');
  const subEl   = document.getElementById('dash-trial-banner-sub');
  const ctaEl   = document.getElementById('dash-trial-banner-cta');

  banner.style.display = '';
  banner.className = 'dash-trial-banner ' + (d.status === 'expired' ? 'expired' : 'trial');

  if (d.status === 'expired') {
    if (iconEl)  iconEl.textContent = '⏸';
    if (titleEl) titleEl.textContent = 'Je proefperiode is afgelopen';
    // Deliberately non-alarming per TRIAL-DESIGN.md §3: leads are still
    // captured, only the AI auto-reply stopped. Never phrased as an error.
    if (subEl)   subEl.textContent = 'Nieuwe leads komen gewoon binnen en blijven zichtbaar hierboven — de AI beantwoordt ze alleen niet langer automatisch op WhatsApp.';
    if (ctaEl) {
      ctaEl.textContent = 'Heractiveer account';
      ctaEl.href = 'mailto:${SUPPORT_EMAIL_ATTR}?subject=Reactivatie%20account';
    }
  } else {
    const daysLeft = d.daysLeft != null ? d.daysLeft : null;
    if (iconEl)  iconEl.textContent = '🎁';
    if (titleEl) titleEl.textContent = daysLeft != null
      ? \`Nog \${daysLeft} dag\${daysLeft === 1 ? '' : 'en'} proefperiode\`
      : 'Je proefperiode loopt';
    if (subEl)   subEl.textContent = 'Alle functies zijn beschikbaar. Wil je blijven gebruiken na je proefperiode? Upgrade wanneer je klaar bent.';
    if (ctaEl) {
      ctaEl.textContent = 'Upgrade nu';
      ctaEl.href = 'mailto:${SUPPORT_EMAIL_ATTR}?subject=Upgrade%20na%20proefperiode';
    }
  }
}

/* ============================================================
   ONBOARDING CHECKLIST + EMAIL-VERIFICATION BANNER
   Backed by api/leads.js mode=config-get (emailVerified, aiInstructions,
   aiName, autoReplyTpl, gcalConnected, checklistDismissed) plus
   state.stats.total (already loaded by refreshData() — no extra fetch for
   the lead-count item). Every item's done/not-done is DERIVED from that
   live data on every render, never a separately stored "completed" flag,
   so it can never drift out of sync and self-heals if something is later
   undone. The ONLY persisted checklist state is the dismiss flag itself
   (config-save mode, checklistDismissed:true -> Airtable checkbox
   "Onboarding Checklist Dismissed", fldNKMaiCKYpT3hxM). Same throttle
   pattern as loadPlanStatus() above — safe to call on every refreshData().
   ============================================================ */
let _checklistLastFetch = 0;
const CHECKLIST_MIN_INTERVAL = 4 * 60 * 1000;
let _checklistConfigCache = null; // last config-get response — reused by the "Vertel over je bedrijf" modal so it can append rather than clobber

async function loadOnboardingChecklist(force) {
  if (!state.apiKey) return;
  const now = Date.now();
  if (!force && now - _checklistLastFetch < CHECKLIST_MIN_INTERVAL) return;
  _checklistLastFetch = now;
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'config-get' })
    });
    if (!r.ok) return; // fail silent — card/banner just stay hidden/stale, never an error toast
    const d = await r.json();
    _checklistConfigCache = d;
    renderVerifyBanner(d);
    renderOnboardingChecklist(d);
  } catch (err) {
    // Network hiccup: leave whatever was already rendered.
  }
}

/* ── Email-verification banner ───────────────────────────────────────────
   Fails open by construction: config-get's emailVerified only reads false
   when the Airtable record explicitly holds 'pending' (see api/_verify.js).
   A missing field or a pre-existing client both read as verified, so this
   banner can never wrongly nag someone who was never part of this flow. */
function renderVerifyBanner(d) {
  const banner = document.getElementById('dash-verify-banner');
  if (!banner) return;
  const dismissedThisSession = sessionStorage.getItem('hv-verify-banner-dismissed') === '1';
  if (!d || d.emailVerified !== false || dismissedThisSession) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = '';
}
// Session-only dismiss (sessionStorage, not Airtable) — deliberately not the
// same permanence as the checklist's dismiss. An unverified email is a
// standing account-recovery risk, so it reappears next visit if still
// unverified rather than being silenced forever by one click.
function dismissVerifyBanner() {
  sessionStorage.setItem('hv-verify-banner-dismissed', '1');
  const banner = document.getElementById('dash-verify-banner');
  if (banner) banner.style.display = 'none';
}
async function resendVerificationFromBanner() {
  await sendVerificationEmailNow(document.getElementById('dash-verify-banner-resend'));
}
async function resendVerificationFromChecklist() {
  await sendVerificationEmailNow(null);
}
async function sendVerificationEmailNow(btn) {
  const email = state.userEmail || '';
  if (!email) { toast('Kon je e-mailadres niet vinden. Log opnieuw in.', 'error'); return; }
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Versturen...'; }
  try {
    const r = await fetch(\`\${API_BASE}/auth\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ mode: 'resend-verification', email })
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d && d.ok) {
      toast(d.message || 'Verificatiemail verstuurd', 'success');
      if (d.alreadyVerified) loadOnboardingChecklist(true); // refresh so the item/banner clears
    } else {
      toast((d && d.error) || 'Versturen mislukt, probeer later opnieuw', 'error');
    }
  } catch (err) {
    toast('Netwerkfout. Probeer later opnieuw', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ── Onboarding checklist card ─────────────────────────────────────────── */
function getOnboardingChecklistItems(d) {
  const leadCount = (state.stats && state.stats.total) || 0;
  return [
    {
      key: 'email', accent: 'blue', title: 'E-mailadres bevestigen',
      done: d.emailVerified === true,
      todoSub: 'Check je inbox voor de bevestigingsmail.',
      doneSub: 'Bevestigd',
      actionLabel: 'Stuur opnieuw',
    },
    {
      key: 'business', accent: 'gold', title: 'Vertel over je bedrijf',
      done: !!(d.aiInstructions && d.aiInstructions.trim()),
      todoSub: 'Dit is wat je AI gebruikt om leads te beantwoorden — hoe meer context, hoe beter ze jouw klanten helpt.',
      doneSub: 'Ingevuld — je AI kent je bedrijf',
      actionLabel: 'Vertel het',
    },
    {
      key: 'ainame', accent: 'purple', title: 'Geef je AI een naam',
      done: !!((d.aiName && d.aiName.trim()) && (d.autoReplyTpl && d.autoReplyTpl.trim())),
      todoSub: 'Kies een naam en een welkomstbericht, zodat leads meteen weten met wie ze praten.',
      doneSub: 'Ingesteld',
      actionLabel: 'Instellen',
    },
    {
      key: 'gcal', accent: 'cyan', title: 'Koppel je Google Agenda',
      done: d.gcalConnected === true,
      todoSub: 'Dan checkt je AI automatisch je beschikbaarheid en zet boekingen meteen in je agenda.',
      doneSub: 'Gekoppeld',
      actionLabel: 'Koppelen',
    },
    {
      key: 'lead', accent: 'emerald', title: 'Ontvang je eerste lead',
      done: leadCount > 0,
      todoSub: 'Deel je formulierlink — zodra er een lead binnenkomt, vink je dit vanzelf af.',
      doneSub: leadCount > 0 ? (\`\${leadCount} lead\${leadCount === 1 ? '' : 's'} binnen\`) : 'Binnen',
      actionLabel: 'Bekijk formulier',
    },
  ];
}

function chkItemAction(key) {
  if (key === 'email') resendVerificationFromChecklist();
  else if (key === 'business') openBusinessInfoModal();
  else if (key === 'ainame') navigateTo('ai-persona');
  else if (key === 'gcal') connectGoogleCalendar();
  else if (key === 'lead') navigateTo('formulier');
}

function renderOnboardingChecklist(d) {
  const wrap = document.getElementById('dash-checklist');
  if (!wrap || !d) return;

  // Airtable omits an unchecked/never-touched checkbox from the record
  // entirely — blank/missing reads as false === not dismissed, the correct
  // default for every client. Only an explicit true hides it permanently.
  if (d.checklistDismissed === true) { wrap.style.display = 'none'; return; }

  const items = getOnboardingChecklistItems(d);
  const doneCount = items.filter(function(it) { return it.done; }).length;

  // Everything a client can self-serve is done — the card has done its job.
  if (doneCount === items.length) { wrap.style.display = 'none'; return; }

  wrap.style.display = '';
  const label = document.getElementById('dash-checklist-progress-label');
  if (label) label.textContent = \`\${doneCount} van \${items.length} klaar\`;
  const fill = document.getElementById('dash-checklist-progress-fill');
  if (fill) fill.style.width = Math.round((doneCount / items.length) * 100) + '%';

  const itemsEl = document.getElementById('dash-checklist-items');
  if (itemsEl) {
    itemsEl.innerHTML = items.map(function(it) {
      return \`<div class="chk-item\${it.done ? ' chk-done' : ''}" data-accent="\${it.accent}">
        <div class="chk-item-icon">\${it.done ? '✓' : '○'}</div>
        <div class="chk-item-body">
          <div class="chk-item-title">\${escHtml(it.title)}</div>
          <div class="chk-item-sub">\${escHtml(it.done ? it.doneSub : it.todoSub)}</div>
        </div>
        \${it.done ? '' : \`<button class="chk-item-action" onclick="chkItemAction('\${it.key}')">\${escHtml(it.actionLabel)}</button>\`}
      </div>\`;
    }).join('');
  }

  const mailtoEl = document.getElementById('chk-whatsapp-mailto');
  if (mailtoEl && state.clientName) {
    mailtoEl.href = \`mailto:${SUPPORT_EMAIL_ATTR}?subject=WhatsApp%20koppelen&body=Hallo%2C%0A%0AIk%20wil%20graag%20mijn%20WhatsApp-nummer%20laten%20koppelen%20aan%20Helvaro.%0A%0ABedrijf%3A%20\${encodeURIComponent(state.clientName)}\`;
  }
}

function dismissChecklist() {
  const wrap = document.getElementById('dash-checklist');
  if (wrap) wrap.style.display = 'none';
  fetch(\`\${API_BASE}/leads\`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
    body:    JSON.stringify({ mode: 'config-save', checklistDismissed: true })
  }).catch(function() {}); // best-effort — card is already hidden locally either way
}

/* ── "Vertel over je bedrijf" modal ──────────────────────────────────────
   Writes to AI Instructions, NEVER to AI Learned Patterns — the weekly
   learning cron (api/cron-followup.js's runWeeklyLearning()) fully
   overwrites that field every Monday, so anything typed there would be
   silently destroyed within a week. Appends to any existing AI Instructions
   content rather than overwriting it, so a client who already wrote
   something (manually, or on the AI Persoonlijkheid page) never loses it. */
function openBusinessInfoModal() {
  const overlay = document.getElementById('chk-biz-modal-overlay');
  if (overlay) overlay.classList.add('open');
}
function closeBusinessInfoModal() {
  const overlay = document.getElementById('chk-biz-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}
async function saveBusinessInfoFromChecklist() {
  const what     = document.getElementById('chk-biz-what').value.trim();
  const goodLead = document.getElementById('chk-biz-goodlead').value.trim();
  const notDoes  = document.getElementById('chk-biz-notdoes').value.trim();
  const never    = document.getElementById('chk-biz-never').value.trim();
  if (!what && !goodLead && !notDoes && !never) {
    toast('Vul minstens één veld in', 'error');
    return;
  }
  const parts = [];
  if (what)     parts.push(\`Over het bedrijf:\\n\${what}\`);
  if (goodLead) parts.push(\`Een goede lead:\\n\${goodLead}\`);
  if (notDoes)  parts.push(\`Wat we NIET doen:\\n\${notDoes}\`);
  if (never)    parts.push(\`Openingsuren & wat de AI nooit mag beloven:\\n\${never}\`);
  const composedBlock = parts.join('\\n\\n');

  const existing = (_checklistConfigCache && _checklistConfigCache.aiInstructions) || '';
  const combined = (existing.trim()
    ? \`\${existing.trim()}\\n\\n--- Toegevoegd via de opstart-checklist ---\\n\${composedBlock}\`
    : composedBlock
  ).slice(0, 3000); // same cap config-save already enforces server-side

  const btn = document.getElementById('chk-biz-save-btn');
  const original = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Opslaan...'; }
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'config-save', aiInstructions: combined })
    });
    if (!r.ok) { toast('Opslaan mislukt, probeer opnieuw', 'error'); return; }
    toast('Opgeslagen — je AI gebruikt dit meteen', 'success');
    closeBusinessInfoModal();
    ['chk-biz-what', 'chk-biz-goodlead', 'chk-biz-notdoes', 'chk-biz-never'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    loadOnboardingChecklist(true);
  } catch (err) {
    toast('Netwerkfout. Probeer later opnieuw', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

/* ============================================================
   FILTERS & SEARCH
   ============================================================ */
function getActiveFilterCount() {
  let count = 0;
  if (state.searchQ) count++;
  if (document.getElementById('filter-status')?.value) count++;
  if (document.getElementById('filter-qualified')?.value) count++;
  if (document.getElementById('filter-bron')?.value) count++;
  if (document.getElementById('filter-opgepikt')?.value) count++;
  return count;
}

function populateBronFilter() {
  const sel = document.getElementById('filter-bron');
  if (!sel) return;
  const bronnen = [...new Set(state.leads.map(l => l.bron).filter(Boolean))].sort();
  const current = sel.value;
  sel.innerHTML = '<option value="">Alle bronnen</option>' +
    bronnen.map(b => \`<option value="\${b}"\${b === current ? ' selected' : ''}>\${b}</option>\`).join('');
}

function applyFilters() {
  const q = state.searchQ.toLowerCase();
  const statusF = document.getElementById('filter-status')?.value || '';
  const qualF = document.getElementById('filter-qualified')?.value || '';
  const bronF = document.getElementById('filter-bron')?.value || '';
  const opgepiktF = document.getElementById('filter-opgepikt')?.value || '';

  state.filteredLeads = state.leads.filter(l => {
    if (q && !((l.naam || '').toLowerCase().includes(q)) && !((l.telefoon || '').toLowerCase().includes(q))) return false;
    if (statusF && l.status !== statusF) return false;
    if (qualF !== '' && String(l.qualified) !== qualF) return false;
    if (bronF && l.bron !== bronF) return false;
    if (opgepiktF !== '' && String(l.opgepikt) !== opgepiktF) return false;
    return true;
  });

  sortLeads();
  renderTable();
  updateFilterUI();
  populateBronFilter();
  renderCalSidebar();
  if (state.currentPage === 'kalender') renderAppointments();
}

function sortLeads() {
  const col = state.sortCol;
  const asc = state.sortAsc;
  state.filteredLeads.sort((a, b) => {
    let av = a[col], bv = b[col];
    if (col === 'datum') { av = new Date(av || 0); bv = new Date(bv || 0); }
    else if (col === 'leadScore') { av = av || 0; bv = bv || 0; }
    else { av = (av || '').toString().toLowerCase(); bv = (bv || '').toString().toLowerCase(); }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });
}

function updateFilterUI() {
  const count = getActiveFilterCount();
  const badge = document.getElementById('filter-badge');
  const resetBtn = document.getElementById('btn-reset-filters');
  const leadsCount = document.getElementById('leads-count');

  if (badge) { badge.textContent = count; badge.style.display = count ? 'inline-flex' : 'none'; }
  if (resetBtn) { count > 0 ? resetBtn.classList.add('visible') : resetBtn.classList.remove('visible'); }
  if (leadsCount) {
    leadsCount.innerHTML = \`<strong>\${state.filteredLeads.length}</strong> / \${state.leads.length} leads\`;
  }

  // Update sort indicators
  document.querySelectorAll('.sort-indicator').forEach(el => {
    const col = el.dataset.col;
    const th = el.closest('th');
    if (col === state.sortCol) {
      el.textContent = state.sortAsc ? '↑' : '↓';
      th.classList.add('sort-active');
    } else {
      el.textContent = '';
      th.classList.remove('sort-active');
    }
  });
}

function resetFilters() {
  state.searchQ = '';
  document.getElementById('search-input').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-qualified').value = '';
  document.getElementById('filter-bron').value = '';
  document.getElementById('filter-opgepikt').value = '';
  applyFilters();
}

/* ============================================================
   RENDER TABLE
   ============================================================ */
function statusBadge(status) {
  const map = {
    'new': '<span class="badge badge-new">Nieuw</span>',
    'in_progress': '<span class="badge badge-inprogress">Bezig</span>',
    'completed': '<span class="badge badge-done">Klaar</span>'
  };
  return map[status] || \`<span class="badge badge-new">\${status || '—'}</span>\`;
}

function qualBadge(lead) {
  if (lead.status === 'in_progress') return '<span class="badge badge-inprogress">Bezig</span>';
  if (lead.qualified === true) return '<span class="badge badge-yes">Ja</span>';
  if (lead.qualified === false) return '<span class="badge badge-no">Nee</span>';
  return '<span class="badge badge-new">—</span>';
}

function scorePill(score) {
  if (score === null || score === undefined || score === 0) return '<span class="score-pill score-gray" title="Geen score">—</span>';
  const cls = score >= 8 ? 'score-green' : score >= 5 ? 'score-orange' : 'score-red';
  const title = score >= 8 ? 'Uitstekende match' : score >= 5 ? 'Gemiddelde match' : 'Slechte match';
  return \`<span class="score-pill \${cls}" title="\${title}">\${score}</span>\`;
}

function scoreBar(score) {
  if (score == null || score === '') return '<span style="color:var(--text-muted)">—</span>';
  const n = parseInt(score) || 0;
  const color = n >= 8 ? 'var(--success)' : n >= 5 ? 'var(--warning)' : 'var(--error)';
  const pct = Math.round(n / 10 * 100);
  return \`<div style="display:flex;align-items:center;gap:6px">
    <div style="width:40px;height:5px;background:var(--bg-card-alt);border-radius:3px;overflow:hidden">
      <div style="width:\${pct}%;height:100%;background:\${color};border-radius:3px"></div>
    </div>
    <span style="font-size:12px;font-weight:700;color:\${color};font-variant-numeric: tabular-nums;">\${n}</span>
  </div>\`;
}

function renderTable() {
  const tbody = document.getElementById('leads-tbody');
  if (!tbody) return;

  if (state.leads.length === 0) {
    tbody.innerHTML = \`<tr><td colspan="11" style="padding:60px 20px;text-align:center">
      <div style="max-width:400px;margin:0 auto">
        <div style="width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;background: var(--accent);border:1px dashed rgba(var(--accent-rgb),0.3)">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="1.8"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:8px">Welkom bij Helvaro!</div>
        <div style="font-size:14px;color:var(--text-muted);line-height:1.7;margin-bottom:24px">Je AI-assistent staat klaar om leads te kwalificeren. Zodra de eerste gesprekken binnenkomen, verschijnen ze hier automatisch.</div>
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left;background:var(--bg-card-alt);border:1px solid var(--border);border-radius:12px;padding:20px">
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--green);font-weight:700;flex-shrink:0">1.</span><span style="font-size:13px;color:var(--text-muted)">Deel je WhatsApp-nummer of website link met potentiële klanten</span></div>
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--green);font-weight:700;flex-shrink:0">2.</span><span style="font-size:13px;color:var(--text-muted)">Helvaro AI voert het gesprek en kwalificeert automatisch</span></div>
          <div style="display:flex;gap:10px;align-items:flex-start"><span style="color:var(--green);font-weight:700;flex-shrink:0">3.</span><span style="font-size:13px;color:var(--text-muted)">Gekwalificeerde leads verschijnen hier met score en samenvatting</span></div>
        </div>
        <div style="margin-top:20px;font-size:12px;color:var(--text-muted)">Hulp nodig? Mail ons via <a href="mailto:${SUPPORT_EMAIL_ATTR}" style="color:var(--accent)">${SUPPORT_EMAIL_ATTR}</a></div>
      </div>
    </td></tr>\`;
    return;
  }

  if (state.filteredLeads.length === 0) {
    const hasFilters = getActiveFilterCount() > 0;
    tbody.innerHTML = \`
      <tr>
        <td colspan="11">
          <div class="empty-state">
            <div class="empty-state-illustration" style="width:88px;height:88px;font-size:32px">
              \${hasFilters
                ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="8" x2="14" y2="14"/><line x1="14" y1="8" x2="8" y2="14"/></svg>'
                : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--blue-bright)" stroke-width="1.8"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>'
              }
            </div>
            <div class="empty-title">\${hasFilters ? 'Geen resultaten gevonden' : 'Geen leads beschikbaar'}</div>
            <div class="empty-desc">\${hasFilters ? 'Pas je filters aan of reset ze.' : 'Er zijn nog geen leads in het systeem.'}</div>
            \${hasFilters ? '<button class="btn-icon" onclick="resetFilters()" style="margin:0 auto">Reset filters</button>' : ''}
          </div>
        </td>
      </tr>
    \`;
    return;
  }

  tbody.innerHTML = state.filteredLeads.map((lead, i) => {
    const delay = i < 10 ? \`style="animation-delay:\${i * 40}ms"\` : '';
    // Age badge for table
    const ageDays = leadAgeDays(lead);
    const ageClass = leadAgeClass(ageDays);
    const ageBadge = ageClass === 'fresh' ? '' :
      ageClass === 'warm' ? \`<span class="age-badge-table age-badge-warm">\${ageDays}d</span>\` :
      ageClass === 'cooling' ? \`<span class="age-badge-table age-badge-cooling">\${ageDays}d</span>\` :
      \`<span class="age-badge-table age-badge-cold">\${ageDays}d</span>\`;
    // Quick action buttons
    const rawPhone = (lead.telefoon || '').replace(/\\D/g, '');
    const waPhone = rawPhone.startsWith('0') ? '32' + rawPhone.slice(1) : rawPhone;
    const waLink = waPhone ? 'https://wa.me/' + waPhone : '#';
    const telLink = lead.telefoon ? 'tel:' + escHtml(lead.telefoon) : '#';
    return \`
      <tr data-id="\${lead.id}" \${delay}>
        <td class="td-naam">\${escHtml(lead.naam) || '—'}\${ageBadge}</td>
        <td>
          <div class="td-phone">
            \${escHtml(lead.telefoon) || '—'}
            \${lead.telefoon ? \`
              <button class="copy-btn" data-phone="\${escHtml(lead.telefoon)}" title="Kopieer">⧉
                <span class="copy-tooltip">Gekopieerd!</span>
              </button>\` : ''}
          </div>
        </td>
        <td>\${statusBadge(lead.status)}</td>
        <td>\${qualBadge(lead)}</td>
        <td>\${lead.bron ? \`<span class="badge badge-bron">\${escHtml(lead.bron)}</span>\` : '—'}</td>
        <td class="td-samenvatting" title="\${escHtml(lead.samenvatting)}">\${escHtml(lead.samenvatting) || '—'}</td>
        <td>\${scoreBar(lead.leadScore)}</td>
        <td>\${lead.opgepikt ? '<span style="color:var(--green);display:inline-flex" title="Opgepikt"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>' : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="white-space:nowrap;font-size:12px;color:var(--text-secondary)">\${formatDate(lead.datum)}</td>
        <td class="td-arrow">›</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <a class="row-action-btn" href="\${telLink}" title="Bellen"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></a>
            <a class="row-action-btn" href="\${waLink}" target="_blank" rel="noopener" title="WhatsApp"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></a>
          </div>
        </td>
      </tr>
    \`;
  }).join('');
}

/* ============================================================
   TABLE EVENT DELEGATION
   ============================================================ */
document.getElementById('leads-tbody').addEventListener('click', function(e) {
  // Copy phone button
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    e.stopPropagation();
    const phone = copyBtn.dataset.phone;
    if (phone && navigator.clipboard) {
      navigator.clipboard.writeText(phone).then(() => {
        const tip = copyBtn.querySelector('.copy-tooltip');
        if (tip) { tip.classList.add('show'); setTimeout(() => tip.classList.remove('show'), 1500); }
      }).catch(() => toast('Kopiëren mislukt', 'error'));
    }
    return;
  }

  // Row click → open detail panel
  const row = e.target.closest('tr[data-id]');
  if (row) {
    const id = row.dataset.id;
    const lead = state.leads.find(l => String(l.id) === String(id));
    if (lead) openPanel(lead);
  }
});

/* ============================================================
   SORT HEADERS
   ============================================================ */
document.querySelectorAll('th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (state.sortCol === col) {
      state.sortAsc = !state.sortAsc;
    } else {
      state.sortCol = col;
      state.sortAsc = col === 'naam';
    }
    applyFilters();
  });
});

/* ============================================================
   DETAIL PANEL
   ============================================================ */
function openPanel(lead) {
  state.activeLead = lead;

  // Avatar
  const avatar = document.getElementById('panel-avatar');
  avatar.textContent = getInitials(lead.naam);
  avatar.className = 'panel-avatar ' + (
    lead.qualified ? 'avatar-green' :
    lead.status === 'in_progress' ? 'avatar-orange' : 'avatar-red'
  );

  document.getElementById('panel-name').textContent = lead.naam || '—';
  document.getElementById('panel-phone').textContent = lead.telefoon || '—';

  const bronBadge = document.getElementById('panel-bron-badge');
  const panelAgeDays = leadAgeDays(lead);
  const panelAgeClass = leadAgeClass(panelAgeDays);
  bronBadge.innerHTML = (lead.bron ? \`<span class="badge badge-bron">\${escHtml(lead.bron)}</span>\` : '') +
    \`<span class="age-chip age-\${panelAgeClass}">\${panelAgeDays}d oud</span>\`;

  // Copy phone
  const copyPhoneBtn = document.getElementById('panel-copy-phone');
  copyPhoneBtn.onclick = () => {
    if (lead.telefoon && navigator.clipboard) {
      navigator.clipboard.writeText(lead.telefoon).then(() => toast('Telefoonnummer gekopieerd', 'success'));
    }
  };

  // Build panel body
  const scoreNum = lead.leadScore || 0;
  const scoreClass = scoreNum >= 8 ? 'high' : scoreNum >= 5 ? '' : 'low';
  const scoreSegments = Array.from({ length: 10 }, (_, i) =>
    \`<div class="score-segment \${i < scoreNum ? 'filled ' + scoreClass : ''}"></div>\`
  ).join('');

  let bodyHTML = '';

  // Kwalificatie section
  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Kwalificatie</div>
      <div class="panel-row">
        <span class="panel-row-label">Status</span>
        <span class="panel-row-value">
          <select class="status-select" id="panel-status-select">
            <option value="new"         \${lead.status === 'new'         ? 'selected' : ''}>Nieuw</option>
            <option value="in_progress" \${lead.status === 'in_progress' ? 'selected' : ''}>Bezig</option>
            <option value="completed"   \${lead.status === 'completed'   ? 'selected' : ''}>Klaar</option>
            <option value="verloren"    \${lead.status === 'verloren'    ? 'selected' : ''}>Verloren</option>
          </select>
        </span>
      </div>
      <div class="panel-row" id="verloren-reden-row" style="display:\${lead.status === 'verloren' ? 'flex' : 'none'}">
        <span class="panel-row-label">Verlies reden</span>
        <span class="panel-row-value">
          <select class="status-select" id="panel-verlies-reden">
            <option value="">— Kies reden —</option>
            <option value="Prijs te hoog"       \${lead.reden === 'Prijs te hoog'       ? 'selected' : ''}>Prijs te hoog</option>
            <option value="Geen timing"          \${lead.reden === 'Geen timing'          ? 'selected' : ''}>Geen timing</option>
            <option value="Concurrent gekozen"   \${lead.reden === 'Concurrent gekozen'   ? 'selected' : ''}>Concurrent gekozen</option>
            <option value="Geen interesse"       \${lead.reden === 'Geen interesse'       ? 'selected' : ''}>Geen interesse</option>
            <option value="Geen reactie"         \${lead.reden === 'Geen reactie'         ? 'selected' : ''}>Geen reactie</option>
            <option value="Andere reden"         \${lead.reden === 'Andere reden'         ? 'selected' : ''}>Andere reden</option>
          </select>
        </span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Gekwalificeerd</span>
        <span class="panel-row-value">\${qualBadge(lead)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Score</span>
        <span class="panel-row-value">
          <div class="score-bar-wrapper">
            <div class="score-bar">\${scoreSegments}</div>
            <span class="score-number \${scoreNum >= 8 ? 'cyan' : scoreNum >= 5 ? '' : ''}" style="color:\${scoreNum >= 8 ? 'var(--green)' : scoreNum >= 5 ? 'var(--orange)' : scoreNum > 0 ? 'var(--red)' : 'var(--text-muted)'}">\${scoreNum}</span>
          </div>
        </span>
      </div>
      \${(lead.fit || lead.capaciteit || lead.urgentie) ? \`
        <div class="panel-row">
          <span class="panel-row-label">Waarom \${scoreNum}/10</span>
          <span class="panel-row-value panel-score-pills">
            \${lead.fit        ? \`<span class="score-pill \${scorePillCls(lead.fit)}"        title="Fit met je doelgroep">Fit: \${escHtml(lead.fit)}</span>\` : ''}
            \${lead.capaciteit ? \`<span class="score-pill \${scorePillCls(lead.capaciteit)}" title="Budget / koopkracht">Capaciteit: \${escHtml(lead.capaciteit)}</span>\` : ''}
            \${lead.urgentie   ? \`<span class="score-pill \${scorePillCls(lead.urgentie)}"   title="Hoe snel ze beslissen">Urgentie: \${escHtml(lead.urgentie)}</span>\` : ''}
          </span>
        </div>
      \` : ''}
      <div class="panel-row">
        <span class="panel-row-label">Deal waarde (€)</span>
        <span class="panel-row-value" style="flex:1;max-width:160px">
          <input type="text" class="panel-inline-input" id="panel-deal-input" placeholder="€0" value="\${escHtml(lead.verwachteWaarde || '')}">
        </span>
      </div>
    </div>
  \`;

  // Reden section (if exists)
  if (lead.reden) {
    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">Reden</div>
        <div class="ai-summary">\${escHtml(lead.reden)}</div>
      </div>
    \`;
  }

  // AI Samenvatting (if exists)
  if (lead.samenvatting) {
    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">AI Samenvatting</div>
        <div class="ai-summary">\${escHtml(lead.samenvatting)}</div>
      </div>
    \`;
  }

  // Details section
  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Details</div>
      <div class="panel-row">
        <span class="panel-row-label">Datum</span>
        <span class="panel-row-value">\${formatDate(lead.datum)}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Bron</span>
        <span class="panel-row-value">\${escHtml(lead.bron) || '—'}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Opgepikt</span>
        <span class="panel-row-value \${lead.opgepikt ? 'check-yes' : 'check-no'}">\${lead.opgepikt ? 'Ja' : 'Nee'}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Boekingslink verstuurd</span>
        <span class="panel-row-value \${lead.boekingslinkVerstuurd ? 'check-yes' : 'check-no'}">\${lead.boekingslinkVerstuurd ? 'Ja' : 'Nee'}</span>
      </div>
      <div class="panel-row">
        <span class="panel-row-label">Afspraak geboekt</span>
        <span class="panel-row-value \${lead.afspraakGeboekt ? 'check-yes' : 'check-no'}">\${lead.afspraakGeboekt ? 'Ja' : 'Nee'}</span>
      </div>
    </div>
  \`;

  // Snelle Acties section (Feature 3)
  (function() {
    const naam = encodeURIComponent(lead.naam || '');
    const naamRaw = lead.naam || '';
    const rawPhone = (lead.telefoon || '').replace(/\\D/g, '');
    const waPhone = rawPhone.startsWith('0') ? '32' + rawPhone.slice(1) : rawPhone;
    const waLink = waPhone
      ? 'https://wa.me/' + waPhone + '?text=Hallo%20' + naam + '%2C%20bedankt%20voor%20uw%20interesse.'
      : '#';
    const opvolgingBody = encodeURIComponent('Hallo ' + naamRaw + ', bedankt voor uw interesse. Ik wilde even opvolgen over ons gesprek. Wanneer schikt het u voor een korte call?');
    const offerteBody = encodeURIComponent('Hallo ' + naamRaw + ', zoals besproken stuur ik u hierbij meer informatie over onze diensten. Heeft u nog vragen?');
    const mailtoOpvolging = 'mailto:?subject=Opvolging%20' + naam + '&body=' + opvolgingBody;
    const mailtoOfferte = 'mailto:?subject=Offerte%20' + naam + '&body=' + offerteBody;
    const telLink = lead.telefoon ? 'tel:' + escHtml(lead.telefoon) : '#';
    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">Snelle Acties</div>
        <div class="panel-quick-actions">
          <a class="panel-quick-btn" href="\${telLink}">Bellen</a>
          <a class="panel-quick-btn" href="\${waLink}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="panel-quick-btn email-btn" href="\${mailtoOpvolging}">Opvolging</a>
          <a class="panel-quick-btn email-btn" href="\${mailtoOfferte}">Offerte</a>
        </div>
      </div>
    \`;
  })();

  // Notities parsed once here (moved up from below) — the takeover bar in the
  // conversation section right below needs it to know if AI is paused/who's
  // driving, and it's the same object the Notes/Tasks/Calls sections further
  // down already relied on.
  const nData = parseNotities(lead);

  // Conversation replay section + takeover bar + 2-way reply box
  if (lead.gesprek || lead.telefoon) {
    let bubbles = '';
    try {
      const msgs = JSON.parse(lead.gesprek || '[]');
      bubbles = msgs.map(m => {
        const isUser = m.role === 'user';
        const tag    = isUser ? 'Lead' : (m.manual ? (m.template ? 'Jij (template)' : 'Jij') : 'AI');
        const cls    = isUser ? 'user' : (m.manual ? 'ai manual' : 'ai');
        return \`<div><div class="chat-label">\${tag}</div><div class="chat-bubble \${cls}" dir="auto">\${m.content.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>')}</div></div>\`;
      }).join('');
    } catch { /* invalid JSON, skip */ }
    if (!bubbles) bubbles = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">Nog geen gesprek.</div>';

    // ── Takeover bar: who's driving this conversation right now ─────────────
    // aiPaused lives in the same Notities envelope as waFailed/escalated (see
    // parseNotities/serializeNotities above — unknown keys round-trip fine).
    // api/whatsapp.js's processMessage() checks this flag on every inbound
    // message and skips the AI reply while it's set.
    const aiPaused   = nData.aiPaused && typeof nData.aiPaused === 'object';
    const pausedMeta = aiPaused
      ? \`sinds \${relativeTime(nData.aiPaused.at)}\${nData.aiPaused.by ? ' · ' + escHtml(nData.aiPaused.by) : ''}\`
      : '';
    const escalatedBadge = (nData.escalated && !aiPaused)
      ? \`<span class="panel-takeover-escalated" title="\${escHtml(nData.escalated.question || '')}">Escalatie: wacht op reactie</span>\`
      : '';

    bodyHTML += \`
      <div class="panel-section">
        <div class="panel-section-title">WhatsApp Gesprek</div>
        <div class="panel-takeover-bar" id="panel-takeover-bar">
          <span class="panel-takeover-status \${aiPaused ? 'paused' : 'active'}">
            \${aiPaused ? 'Mens aan het roer' : 'AI actief'}
          </span>
          \${pausedMeta ? \`<span class="panel-takeover-meta">\${pausedMeta}</span>\` : ''}
          \${escalatedBadge}
          <button class="panel-takeover-btn \${aiPaused ? 'resume' : 'pause'}" id="panel-takeover-btn" onclick="toggleAiPause()">
            \${aiPaused ? 'Geef AI terug' : 'Neem over'}
          </button>
        </div>
        <div class="chat-wrap" id="panel-chat-wrap">\${bubbles}</div>
        <div class="panel-suggest-row" id="panel-suggest-row">
          <button class="panel-suggest-btn" id="panel-suggest-btn" onclick="loadReplySuggestions()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            AI suggesties voor antwoord
          </button>
          <div class="panel-suggest-chips" id="panel-suggest-chips"></div>
        </div>
        <div class="panel-reply-row \${aiPaused ? 'panel-reply-row-paused' : ''}">
          <textarea class="panel-reply-input" id="panel-reply-input" rows="2" placeholder="\${aiPaused ? 'Jij bent nu aan het roer — antwoord aan ' + escHtml(lead.naam || 'de lead') + '...' : 'Antwoord aan ' + escHtml(lead.naam || 'de lead') + ' via WhatsApp...'}" maxlength="2000"></textarea>
          <button class="panel-reply-send" id="panel-reply-send" onclick="sendWhatsAppReply()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Verstuur
          </button>
        </div>
      </div>
    \`;
  }

  // Notes section (timestamped)
  function renderNotesList(notes) {
    if (!notes.length) return '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Nog geen notities</div>';
    return notes.map(n => \`<div class="panel-note-item">
      <div class="panel-note-text">\${escHtml(n.text)}</div>
      <div class="panel-note-ts">\${relativeTime(n.ts)}</div>
      <button class="panel-note-delete" data-note-id="\${escHtml(n.id)}" aria-label="Verwijderen"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
    </div>\`).join('');
  }
  function renderTasksList(tasks) {
    if (!tasks.length) return '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Geen taken</div>';
    return tasks.map(t => {
      const dl = taskDueLabel(t.due);
      return \`<div class="panel-task-item\${t.done ? ' done' : ''}" data-task-id="\${escHtml(t.id)}">
        <input type="checkbox" class="panel-task-check" \${t.done ? 'checked' : ''}>
        <span class="panel-task-text">\${escHtml(t.text)}</span>
        \${dl.label ? \`<span class="panel-task-due \${dl.cls}">\${dl.label}</span>\` : ''}
        <button class="panel-task-delete" data-task-id="\${escHtml(t.id)}" aria-label="Verwijderen"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
      </div>\`;
    }).join('');
  }
  function renderCallsList(calls) {
    if (!calls.length) return '<div style="color:var(--text-muted);font-size:12px;padding:4px 0">Geen gesprekken gelogd</div>';
    return calls.map(c => \`<div class="panel-call-item">
      <div class="panel-call-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg></div>
      <div class="panel-call-body">
        <div class="panel-call-meta">\${c.duur} min &bull; \${relativeTime(c.ts)}</div>
        \${c.notitie ? \`<div class="panel-call-note">\${escHtml(c.notitie)}</div>\` : ''}
      </div>
    </div>\`).join('');
  }

  // Afspraak Resultaat. Only show when appointment is booked
  if (lead.afspraakGeboekt) {
    const af = nData.afspraak || {};
    const isYes = af.verschenen === true;
    const isNo  = af.verschenen === false;
    bodyHTML += \`
    <div class="panel-section" id="afspraak-result-section">
      <div class="panel-section-title">Afspraak Resultaat</div>
      <div class="afspraak-result">
        <div>
          <div class="afspraak-toggle-label">Verschenen?</div>
          <div class="afspraak-toggle-row" style="margin-top:6px">
            <button class="afspraak-btn\${isYes ? ' active-yes' : ''}" id="btn-afspraak-ja">Ja, verschenen</button>
            <button class="afspraak-btn\${isNo  ? ' active-no'  : ''}" id="btn-afspraak-nee">No-show</button>
          </div>
        </div>
        <div class="afspraak-value-row">
          <div class="afspraak-value-label">Gesloten waarde</div>
          <input type="text" class="panel-inline-input" id="afspraak-waarde" placeholder="€0" value="\${escHtml(af.gesloten || '')}">
        </div>
        <div>
          <div class="afspraak-value-label" style="margin-bottom:4px">Resultaat notitie</div>
          <textarea class="afspraak-notitie" id="afspraak-notitie" placeholder="Hoe ging het gesprek?">\${escHtml(af.notitie || '')}</textarea>
        </div>
        <button class="btn-add-note" id="btn-save-afspraak">Opslaan</button>
      </div>
    </div>\`;
  }

  bodyHTML += \`
    <div class="panel-section">
      <div class="panel-section-title">Notities</div>
      <div class="panel-notes-list" id="panel-notes-list">\${renderNotesList(nData.notes)}</div>
      <div class="panel-add-note">
        <textarea id="panel-note-input" placeholder="Notitie toevoegen..." rows="2"></textarea>
        <button class="btn-add-note" id="btn-add-note">+ Toevoegen</button>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Taken</div>
      <div class="panel-tasks-list" id="panel-tasks-list">\${renderTasksList(nData.tasks)}</div>
      <div class="panel-add-task">
        <input type="text" id="panel-task-input" placeholder="Nieuwe taak...">
        <input type="date" id="panel-task-date">
        <button class="btn-add-task" id="btn-add-task">+</button>
      </div>
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Belgeschiedenis</div>
      <div class="panel-calls-list" id="panel-calls-list">\${renderCallsList(nData.calls)}</div>
      <div class="panel-log-call">
        <input type="number" id="panel-call-duur" placeholder="Min." min="1">
        <input type="text" id="panel-call-note" placeholder="Aantekeningen...">
        <button class="btn-log-call" id="btn-log-call">Loggen</button>
      </div>
    </div>
  \`;

  document.getElementById('panel-body').innerHTML = bodyHTML;

  // Helper to persist and re-render notities
  async function persistNotities(data) {
    const json = serializeNotities(data);
    const idx = state.leads.findIndex(l => l.id === lead.id);
    if (idx !== -1) state.leads[idx].notities = json;
    state.activeLead.notities = json;
    await saveNotitiesData(lead.id, data);
    renderTakenWidget();
  }

  // Status change handler
  const statusSelect = document.getElementById('panel-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', async () => {
      const newStatus = statusSelect.value;
      const redenRow = document.getElementById('verloren-reden-row');
      if (redenRow) redenRow.style.display = newStatus === 'verloren' ? 'flex' : 'none';
      try {
        await patchStatus(lead.id, newStatus);
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].status = newStatus;
        state.activeLead.status = newStatus;
        applyFilters();
        toast('Status bijgewerkt', 'success');
      } catch (err) {
        toast(err.message, 'error');
        statusSelect.value = lead.status; // revert on error
      }
    });
  }

  // Afspraak Resultaat handlers
  if (lead.afspraakGeboekt) {
    async function saveAfspraak() {
      const data = parseNotities(state.activeLead);
      data.afspraak = data.afspraak || {};
      const waarde = (document.getElementById('afspraak-waarde')?.value || '').trim();
      const notitie = (document.getElementById('afspraak-notitie')?.value || '').trim();
      if (waarde) data.afspraak.gesloten = waarde;
      if (notitie) data.afspraak.notitie = notitie;
      await persistNotities(data);
      // Also update verwachteWaarde if closed value entered
      if (waarde) {
        await patchLead(lead.id, { dealWaarde: waarde });
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].verwachteWaarde = waarde;
        state.activeLead.verwachteWaarde = waarde;
      }
      toast('Afspraak resultaat opgeslagen', 'success');
    }

    function setVerschenen(val) {
      const data = parseNotities(state.activeLead);
      data.afspraak = { ...(data.afspraak || {}), verschenen: val };
      persistNotities(data).then(() => toast(val ? 'Verschenen opgeslagen' : 'No-show opgeslagen', 'success'));
      // Update button styles immediately
      const jaBtn  = document.getElementById('btn-afspraak-ja');
      const neeBtn = document.getElementById('btn-afspraak-nee');
      if (jaBtn)  { jaBtn.classList.toggle('active-yes', val === true);  jaBtn.classList.remove('active-no'); }
      if (neeBtn) { neeBtn.classList.toggle('active-no', val === false); neeBtn.classList.remove('active-yes'); }
    }

    const jaBtn  = document.getElementById('btn-afspraak-ja');
    const neeBtn = document.getElementById('btn-afspraak-nee');
    const saveBtn = document.getElementById('btn-save-afspraak');
    if (jaBtn)   jaBtn.addEventListener('click', () => setVerschenen(true));
    if (neeBtn)  neeBtn.addEventListener('click', () => setVerschenen(false));
    if (saveBtn) saveBtn.addEventListener('click', saveAfspraak);
  }

  // Verlies reden handler
  const verliesRedenSelect = document.getElementById('panel-verlies-reden');
  if (verliesRedenSelect) {
    verliesRedenSelect.addEventListener('change', async () => {
      const reden = verliesRedenSelect.value;
      try {
        await patchLead(lead.id, { verliesReden: reden });
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].reden = reden;
        state.activeLead.reden = reden;
        toast('Verliesreden opgeslagen', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Deal waarde handler
  const dealInput = document.getElementById('panel-deal-input');
  if (dealInput) {
    dealInput.addEventListener('blur', async () => {
      const val = dealInput.value.trim();
      try {
        await patchLead(lead.id, { dealWaarde: val });
        const idx = state.leads.findIndex(l => l.id === lead.id);
        if (idx !== -1) state.leads[idx].verwachteWaarde = val;
        state.activeLead.verwachteWaarde = val;
        toast('Deal waarde opgeslagen', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  // Notes: add note
  const btnAddNote = document.getElementById('btn-add-note');
  if (btnAddNote) {
    btnAddNote.addEventListener('click', async () => {
      const inp = document.getElementById('panel-note-input');
      const text = inp ? inp.value.trim() : '';
      if (!text) return;
      const data = parseNotities(state.activeLead);
      const note = { id: 'n_' + Date.now(), text, ts: new Date().toISOString() };
      data.notes = [note, ...data.notes];
      try {
        await persistNotities(data);
        if (inp) inp.value = '';
        const list = document.getElementById('panel-notes-list');
        if (list) list.innerHTML = renderNotesList(data.notes);
        toast('Notitie toegevoegd', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Notes: delete note (event delegation)
  const notesList = document.getElementById('panel-notes-list');
  if (notesList) {
    notesList.addEventListener('click', async e => {
      const btn = e.target.closest('.panel-note-delete');
      if (!btn) return;
      const nid = btn.dataset.noteId;
      const data = parseNotities(state.activeLead);
      data.notes = data.notes.filter(n => n.id !== nid);
      try {
        await persistNotities(data);
        notesList.innerHTML = renderNotesList(data.notes);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Tasks: add task
  const btnAddTask = document.getElementById('btn-add-task');
  if (btnAddTask) {
    btnAddTask.addEventListener('click', async () => {
      const inp = document.getElementById('panel-task-input');
      const dateInp = document.getElementById('panel-task-date');
      const text = inp ? inp.value.trim() : '';
      if (!text) return;
      const data = parseNotities(state.activeLead);
      const task = { id: 't_' + Date.now(), text, due: dateInp ? dateInp.value : '', done: false, ts: new Date().toISOString() };
      data.tasks = [task, ...data.tasks];
      try {
        await persistNotities(data);
        if (inp) inp.value = '';
        if (dateInp) dateInp.value = '';
        const list = document.getElementById('panel-tasks-list');
        if (list) list.innerHTML = renderTasksList(data.tasks);
        toast('Taak toegevoegd', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Tasks: toggle done + delete (event delegation)
  const tasksList = document.getElementById('panel-tasks-list');
  if (tasksList) {
    tasksList.addEventListener('change', async e => {
      const cb = e.target.closest('.panel-task-check');
      if (!cb) return;
      const item = cb.closest('.panel-task-item');
      const tid = item ? item.dataset.taskId : null;
      if (!tid) return;
      const data = parseNotities(state.activeLead);
      const task = data.tasks.find(t => t.id === tid);
      if (task) task.done = cb.checked;
      try {
        await persistNotities(data);
        tasksList.innerHTML = renderTasksList(data.tasks);
      } catch (err) { toast(err.message, 'error'); }
    });
    tasksList.addEventListener('click', async e => {
      const btn = e.target.closest('.panel-task-delete');
      if (!btn) return;
      const tid = btn.dataset.taskId;
      const data = parseNotities(state.activeLead);
      data.tasks = data.tasks.filter(t => t.id !== tid);
      try {
        await persistNotities(data);
        tasksList.innerHTML = renderTasksList(data.tasks);
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Calls: log call
  const btnLogCall = document.getElementById('btn-log-call');
  if (btnLogCall) {
    btnLogCall.addEventListener('click', async () => {
      const duurInp = document.getElementById('panel-call-duur');
      const noteInp = document.getElementById('panel-call-note');
      const duur = duurInp ? parseInt(duurInp.value) || 0 : 0;
      const notitie = noteInp ? noteInp.value.trim() : '';
      const data = parseNotities(state.activeLead);
      const call = { id: 'c_' + Date.now(), duur, notitie, ts: new Date().toISOString() };
      data.calls = [call, ...data.calls];
      try {
        await persistNotities(data);
        if (duurInp) duurInp.value = '';
        if (noteInp) noteInp.value = '';
        const list = document.getElementById('panel-calls-list');
        if (list) list.innerHTML = renderCallsList(data.calls);
        toast('Gesprek gelogd', 'success');
      } catch (err) { toast(err.message, 'error'); }
    });
  }

  // Show panel
  document.getElementById('panel-backdrop').classList.add('visible');
  document.getElementById('detail-panel').classList.add('visible');
}

function closePanel() {
  document.getElementById('panel-backdrop').classList.remove('visible');
  document.getElementById('detail-panel').classList.remove('visible');
  state.activeLead = null;
}

// ── Send a manual WhatsApp reply from the lead panel ─────────────────────────
// ── Onboarding "Klaar!" celebration overlay ──────────────────────────────
function showOnboardingDone() {
  const url = (typeof getFormUrl === 'function') ? getFormUrl() : '';
  const urlEl = document.getElementById('onb-done-url');
  if (urlEl) urlEl.textContent = url || '(geen link beschikbaar)';
  const ov = document.getElementById('onb-done-overlay');
  if (ov) ov.classList.add('open');
}
function closeOnboardingDone() {
  const ov = document.getElementById('onb-done-overlay');
  if (ov) ov.classList.remove('open');
}

// ── AI reply suggestions for the WhatsApp chat ──────────────────────────────
async function loadReplySuggestions() {
  const lead    = state.activeLead;
  const btn     = document.getElementById('panel-suggest-btn');
  const chips   = document.getElementById('panel-suggest-chips');
  if (!lead || !btn || !chips) return;
  // Disable while loading
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="40 60"/></svg> AI denkt na...';
  chips.innerHTML = '';
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'suggest-replies', leadId: lead.id })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast(d.message || d.error || 'Suggesties opvragen mislukt', 'error');
      return;
    }
    const replies = Array.isArray(d.replies) ? d.replies : [];
    if (!replies.length) { toast('Geen suggesties beschikbaar', 'info'); return; }
    chips.innerHTML = replies.map(text =>
      '<button type="button" class="panel-suggest-chip" onclick="useSuggestedReply(this)" data-text="' +
      escHtml(text).replace(/"/g, '&quot;') + '">' + escHtml(text) + '</button>'
    ).join('');
  } catch (err) {
    toast('Netwerkfout. Probeer opnieuw', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

function useSuggestedReply(chipEl) {
  const text = chipEl.getAttribute('data-text') || chipEl.textContent || '';
  const ta = document.getElementById('panel-reply-input');
  if (!ta) return;
  ta.value = text;
  ta.focus();
  // Clear chips so the row is clean once they picked one
  const chips = document.getElementById('panel-suggest-chips');
  if (chips) chips.innerHTML = '';
}

async function sendWhatsAppReply() {
  const input = document.getElementById('panel-reply-input');
  const btn   = document.getElementById('panel-reply-send');
  const wrap  = document.getElementById('panel-chat-wrap');
  const lead  = state.activeLead;
  if (!input || !btn || !lead) return;
  const text = input.value.trim();
  if (!text) return;
  if (!lead.telefoon) { toast('Lead heeft geen telefoonnummer', 'error'); return; }

  btn.disabled = true;
  const original = btn.innerHTML;
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><circle cx="12" cy="12" r="10" stroke-dasharray="40 60"/></svg> Versturen...';
  try {
    const r = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(lead.id)}\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ message: text })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast(d.message || d.error || 'Versturen mislukt', 'error');
      return;
    }
    // Optimistic: render the just-sent bubble right away. A template send
    // (24h window closed) delivered an approved template, NOT the typed
    // text — label it so the thread never implies the lead read \`text\`.
    const sentTag = d.viaTemplate ? 'Jij (template)' : 'Jij';
    const html = '<div><div class="chat-label">' + sentTag + '</div><div class="chat-bubble ai manual" dir="auto">' +
      text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>') + '</div></div>';
    if (wrap) wrap.insertAdjacentHTML('beforeend', html);
    // Keep the lead object's gesprek in sync so re-opening the panel still shows it
    lead.gesprek = JSON.stringify(d.history || []);
    // The server also cleared any 'escalated' Notities marker on success —
    // mirror that locally so the takeover badge disappears without a refetch.
    const ndAfterReply = parseNotities(lead);
    if (ndAfterReply.escalated) {
      delete ndAfterReply.escalated;
      lead.notities = serializeNotities(ndAfterReply);
    }
    input.value = '';
    toast(d.viaTemplate
      ? 'Buiten het 24u-venster: een goedgekeurde template werd gestuurd (niet je eigen tekst)'
      : 'Verzonden via WhatsApp', d.viaTemplate ? 'info' : 'success');
  } catch (err) {
    toast('Netwerkfout. Probeer opnieuw', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function toggleAiPause() {
  const lead = state.activeLead;
  const btn  = document.getElementById('panel-takeover-btn');
  if (!lead || !btn) return;
  const nData   = parseNotities(lead);
  const pausing = !(nData.aiPaused && typeof nData.aiPaused === 'object');

  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = pausing ? 'Overnemen...' : 'Teruggeven...';
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: pausing ? 'ai-pause' : 'ai-resume', leadId: lead.id })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.message || d.error || 'Actie mislukt', 'error'); return; }

    // Keep the lead object's Notities in sync (same pattern as sendWhatsAppReply
    // above) so the panel re-render below reflects the new state immediately,
    // without waiting for the next dashboard poll.
    const merged = { ...nData };
    if (pausing) merged.aiPaused = { at: new Date().toISOString(), by: state.clientName || 'dashboard' };
    else delete merged.aiPaused;
    lead.notities = serializeNotities(merged);

    toast(pausing
      ? 'Je hebt het gesprek overgenomen. De AI reageert niet meer op deze lead'
      : 'AI staat weer aan voor deze lead', 'success');
    openPanel(lead); // re-render the panel with the updated takeover bar
  } catch (err) {
    toast('Netwerkfout. Probeer opnieuw', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

/* ============================================================
   ACTIE NODIG WIDGET (waFailed + escalated takeover-needed leads)
   Reuses/extends the original "Niet bereikbaar" widget rather than
   inventing a separate inbox — escalated leads (AI asked for human help,
   api/whatsapp.js's mergeEscalatedFlag) surface right alongside leads WhatsApp
   couldn't deliver to (mergeWaFailedFlag), since both need the same action:
   someone opens the lead and takes over.
   ============================================================ */
function renderNietBereikbaar() {
  const widget  = document.getElementById('nb-widget');
  const listEl  = document.getElementById('nb-list');
  const countEl = document.getElementById('nb-count');
  if (!widget || !listEl) return;

  const needsAction = (state.leads || [])
    .map(lead => ({ lead, data: parseNotities(lead) }))
    .filter(({ data }) => data.waFailed === true || (data.escalated && typeof data.escalated === 'object'));

  if (needsAction.length === 0) {
    widget.style.display = 'none';
    return;
  }

  widget.style.display = '';
  if (countEl) countEl.textContent = needsAction.length;

  // Escalations (someone is actively waiting on a promised 30-min callback)
  // read as more time-sensitive than a lead we simply couldn't reach — show
  // those first.
  needsAction.sort((a, b) => (b.data.escalated ? 1 : 0) - (a.data.escalated ? 1 : 0));

  listEl.innerHTML = needsAction.map(({ lead, data }) => {
    // Fields already flattened by api/leads.js's GET mapping (naam/telefoon/
    // datum), NOT the raw Airtable 'fields' object — this widget previously
    // read lead.fields[...], which is always undefined on these mapped
    // lead objects and silently produced "(onbekend)"/no phone every time.
    const name     = lead.naam || '(onbekend)';
    const rawPhone = (lead.telefoon || '').replace(/\D/g, '');
    const telHref  = rawPhone ? 'tel:+' + rawPhone : '#';
    const dateStr  = lead.datum ? new Date(lead.datum).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' }) : '';
    const isEscalated = data.escalated && typeof data.escalated === 'object';
    const tag = isEscalated
      ? '<span class="nb-item-tag tag-escalated" title="' + escHtml(data.escalated.question || '') + '">Escalatie</span>'
      : '<span class="nb-item-tag tag-waFailed">Niet bereikbaar</span>';
    return \`<div class="nb-item" onclick="(function(){var l=state.leads.find(function(x){return String(x.id)==='\${escJs(String(lead.id))}';});if(l)openPanel(l);})()">
      <div class="nb-item-info">
        <div>\${tag}<span class="nb-item-name">\${escHtml(name)}</span></div>
        \${dateStr ? \`<span class="nb-item-sub">\${dateStr}</span>\` : ''}
      </div>
      <a class="nb-call-btn" href="\${telHref}" onclick="event.stopPropagation()">Bellen</a>
    </div>\`;
  }).join('');
}

/* ============================================================
   TAKEN WIDGET
   ============================================================ */
function renderTakenWidget() {
  const widget = document.getElementById('taken-widget');
  const listEl = document.getElementById('taken-widget-list');
  const countEl = document.getElementById('taken-widget-count');
  if (!widget || !listEl) return;

  const today = new Date().toISOString().slice(0, 10);
  const items = [];
  (state.leads || []).forEach(lead => {
    const data = parseNotities(lead);
    (data.tasks || []).forEach(t => {
      if (t.done) return;
      if (!t.due || t.due > today) {
        // include today and overdue only
        if (t.due !== today && t.due > today) return;
      }
      items.push({ lead, task: t });
    });
  });

  // Sort: overdue first, then today
  items.sort((a, b) => {
    if (a.task.due < b.task.due) return -1;
    if (a.task.due > b.task.due) return 1;
    return 0;
  });

  if (items.length === 0) {
    widget.style.display = 'none';
    return;
  }

  widget.style.display = 'block';
  if (countEl) countEl.textContent = items.length;

  listEl.innerHTML = items.map(({ lead, task }) => {
    const isOverdue = task.due < today;
    const dueLbl = isOverdue ? 'Verlopen' : 'Vandaag';
    return \`<div class="taken-item\${isOverdue ? ' overdue' : ''}" onclick="(function(){navigateTo('dashboard');setTimeout(function(){var l=state.leads.find(function(x){return String(x.id)==='\${escJs(String(lead.id))}';});if(l)openPanel(l);},120);})()">
      <div class="taken-item-dot"></div>
      <div class="taken-item-body">
        <div class="taken-item-text">\${escHtml(task.text)}</div>
        <div class="taken-item-lead">\${escHtml(lead.naam || '—')}</div>
      </div>
      <div class="taken-item-due">\${dueLbl}</div>
    </div>\`;
  }).join('');
}

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('panel-backdrop').addEventListener('click', closePanel);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const bookOverlay = document.getElementById('cal-book-overlay');
    if (bookOverlay && bookOverlay.classList.contains('open')) { closeCalBookModal(); return; }
    closePanel();
  }
});

/* ============================================================
   NAVIGATION
   ============================================================ */

/* ── Calendar event modal ── */
function openCalEvent(idx) {
  const ev = calState.lastEvents && calState.lastEvents[idx];
  if (!ev) return;
  const overlay = document.getElementById('cal-event-modal');
  const body    = document.getElementById('cal-modal-body');
  const title   = document.getElementById('cal-modal-title');
  if (!overlay || !body) return;

  const start  = new Date(ev.startTime);
  const end    = new Date(ev.endTime);
  const fmtT   = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  const fmtD   = d => d.toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });

  title.textContent = escHtml(ev.name || 'Afspraak');

  const durMin  = Math.round((end - start) / 60000) || 30;
  const durH    = Math.floor(durMin / 60);
  const durM    = durMin % 60;
  const durLbl  = durH > 0 ? (durM > 0 ? \`\${durH}u \${durM}min\` : \`\${durH}u\`) : \`\${durMin}min\`;
  const rows = [
    { label: 'Datum',    val: fmtD(start) },
    { label: 'Tijd',     val: fmtT(start) + ' – ' + fmtT(end) },
    { label: 'Duur',     val: durLbl },
    { label: 'Type',     val: ev.eventType || '—' },
    { label: 'Telefoon', val: ev.phone     || '—' },
    ...(ev.notes ? [{ label: 'Notities', val: ev.notes }] : [])
  ].map(r => \`<div class="cal-modal-row"><span class="cal-modal-row-label">\${r.label}</span><span class="cal-modal-row-val">\${escHtml(String(r.val))}</span></div>\`).join('');

  // Note: this used to also render joinUrl/rescheduleUrl/cancelUrl buttons for
  // Calendly-hosted events. Calendly was removed (see "Calendly is verwijderd"
  // below) and the current Appointments-table populator never sets those
  // fields, so the buttons were permanently dead. Removed rather than left as
  // an unvalidated-scheme href sink (escHtml does not block javascript: URLs)
  // waiting to be silently reactivated with unsanitised data.

  // Attendance section for past events (>5h ago)
  let attSection = '';
  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  if (start.getTime() < fiveHoursAgo) {
    const ml = matchLeadToEvent(ev.name);
    if (ml) {
      const nd  = parseNotities(ml);
      const v   = nd.afspraak ? nd.afspraak.verschenen : undefined;
      const lid = escHtml(String(ml.id));
      // Same id, escaped for use inside an onclick="...('...')" JS-string
      // context instead of a plain HTML attribute -- see escJs() comment above.
      const lidJs = escJs(String(ml.id));
      const gesloten = nd.afspraak?.gesloten || '';
      const notitie  = escHtml(nd.afspraak?.notitie || '');

      if (v === true) {
        // Already marked as came. Show result + stored deal info
        attSection = \`<div class="cal-modal-att-section">
          <div class="cal-modal-att-label">Afspraak resultaat</div>
          <div class="cal-modal-att-result yes">
            Gekomen
            <span class="cal-modal-att-result-edit" onclick="calAttStartEdit('\${lidJs}',true)">Bewerken</span>
          </div>
          \${gesloten ? \`<div style="font-size:12px;color:var(--green);font-weight:600;margin-top:6px;">Deal: \${escHtml(gesloten)}</div>\` : ''}
          \${nd.afspraak?.notitie ? \`<div style="font-size:12px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;">\${escHtml(nd.afspraak.notitie)}</div>\` : ''}
        </div>\`;
      } else if (v === false) {
        // Already marked as no-show. Show result + reason
        attSection = \`<div class="cal-modal-att-section">
          <div class="cal-modal-att-label">Afspraak resultaat</div>
          <div class="cal-modal-att-result no">
            Niet gekomen
            <span class="cal-modal-att-result-edit" onclick="calAttStartEdit('\${lidJs}',false)">Bewerken</span>
          </div>
          \${nd.afspraak?.notitie ? \`<div style="font-size:12px;color:var(--text-muted);margin-top:4px;white-space:pre-wrap;">\${escHtml(nd.afspraak.notitie)}</div>\` : ''}
        </div>\`;
      } else {
        // Not yet marked. Show buttons
        attSection = \`<div class="cal-modal-att-section" id="cal-att-section-\${lid}">
          <div class="cal-modal-att-label">Kwam deze persoon?</div>
          <div class="cal-modal-att-btns">
            <button class="cal-att-btn yes" onclick="calAttShowForm('\${lidJs}',true)">Gekomen</button>
            <button class="cal-att-btn no"  onclick="calAttShowForm('\${lidJs}',false)">Niet gekomen</button>
          </div>
        </div>\`;
      }
    }
  }

  body.innerHTML = rows + attSection;
  overlay.classList.add('open');
}

/* Show follow-up form inside the calendar event modal */
function calAttShowForm(leadId, verschenen) {
  const section = document.getElementById('cal-att-section-' + leadId);
  if (!section) return;

  if (verschenen) {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat. Gekomen</div>
      <div class="cal-att-followup" id="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Hebben ze iets gekocht? (optioneel)</div>
          <input id="cal-att-deal" class="cal-att-followup-input" type="text" placeholder="bijv. €1.500 of Pakket Pro" />
        </div>
        <div>
          <div class="cal-att-followup-label">Notities over het gesprek</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea" placeholder="Wat is er besproken? Volgende stap?"></textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escJs(leadId)}',true)">
          Opslaan
        </button>
      </div>\`;
  } else {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat. Niet gekomen</div>
      <div class="cal-att-followup" id="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Reden / notitie (optioneel)</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea" placeholder="bijv. Geen antwoord, verkeerd nummer, wil herplannen..."></textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escJs(leadId)}',false)">
          Opslaan
        </button>
      </div>\`;
  }
}

/* Re-open form for editing already-saved attendance */
function calAttStartEdit(leadId, verschenen) {
  const section = document.querySelector('.cal-modal-att-section');
  if (!section) return;
  section.id = 'cal-att-section-' + leadId;
  const lead = (state.leads || []).find(l => String(l.id) === leadId);
  const nd = lead ? parseNotities(lead) : {};

  if (verschenen) {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat. Gekomen</div>
      <div class="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Deal waarde</div>
          <input id="cal-att-deal" class="cal-att-followup-input" type="text" value="\${escHtml(nd.afspraak?.gesloten||'')}" placeholder="bijv. €1.500" />
        </div>
        <div>
          <div class="cal-att-followup-label">Notities</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea">\${escHtml(nd.afspraak?.notitie||'')}</textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escJs(leadId)}',true)">Opslaan</button>
      </div>\`;
  } else {
    section.innerHTML = \`
      <div class="cal-modal-att-label">Afspraak resultaat. Niet gekomen</div>
      <div class="cal-att-followup">
        <div>
          <div class="cal-att-followup-label">Notitie</div>
          <textarea id="cal-att-note" class="cal-att-followup-textarea">\${escHtml(nd.afspraak?.notitie||'')}</textarea>
        </div>
        <button class="cal-att-save-btn" onclick="calAttSave('\${escJs(leadId)}',false)">Opslaan</button>
      </div>\`;
  }
}

async function calAttSave(leadId, verschenen) {
  const dealEl = document.getElementById('cal-att-deal');
  const noteEl = document.getElementById('cal-att-note');
  const btn    = document.querySelector('.cal-att-save-btn');
  const deal   = dealEl ? dealEl.value.trim() : '';
  const note   = noteEl ? noteEl.value.trim() : '';

  if (btn) { btn.disabled = true; btn.textContent = 'Opslaan...'; }

  await markAttendance(leadId, verschenen, deal, note);

  // Close modal
  const overlay = document.getElementById('cal-event-modal');
  if (overlay) overlay.classList.remove('open');
}

function closeCalModal(e) {
  if (e && e.target !== document.getElementById('cal-event-modal')) return;
  const overlay = document.getElementById('cal-event-modal');
  if (overlay) overlay.classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { const o = document.getElementById('cal-event-modal'); if (o) o.classList.remove('open'); } });

/* ── Today widget ── */
function renderTodayWidget(events) {
  const widget = document.getElementById('today-widget');
  const body   = document.getElementById('today-widget-body');
  if (!widget || !body) return;
  widget.style.display = '';

  const todayStr = new Date().toDateString();
  const todayEvs = (events || []).filter(ev => new Date(ev.startTime).toDateString() === todayStr)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  if (todayEvs.length === 0) {
    body.innerHTML = '<span class="today-empty">Geen afspraken vandaag</span>';
    return;
  }
  body.innerHTML = todayEvs.map(ev => {
    const s    = new Date(ev.startTime);
    const e    = new Date(ev.endTime);
    const fmtT = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    return \`<div class="today-apt">
      <span class="today-apt-time">\${fmtT(s)}</span>
      <span class="today-apt-name">\${escHtml(ev.name || 'Afspraak')}</span>
      <span class="today-apt-type">\${escHtml(ev.eventType || '')}</span>
    </div>\`;
  }).join('');
}

/* ── Cal nav badge ── */
function updateCalBadge(events) {
  const badge  = document.getElementById('cal-nav-badge');
  if (!badge) return;
  const todayStr = new Date().toDateString();
  const count    = (events || []).filter(ev => new Date(ev.startTime).toDateString() === todayStr).length;
  if (count === 0) { badge.style.display = 'none'; return; }
  badge.textContent = count;
  badge.style.display = 'inline-flex';
}

/* ── Week Calendar ── */
const CAL_START_HOUR = 8;
const CAL_HOURS      = 13;   // 8 AM. 9 PM
const CAL_ROW_H      = 80;

const calState = { weekStart: null, cache: {}, lastEvents: [] };

function calGetMonday(d) {
  const dt = new Date(d);
  const diff = dt.getDay() === 0 ? -6 : 1 - dt.getDay();
  dt.setDate(dt.getDate() + diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

function calToday() { calState.weekStart = calGetMonday(new Date()); renderCalendar(); }
function calPrev()  { calState.weekStart.setDate(calState.weekStart.getDate() - 7); renderCalendar(); }
function calNext()  { calState.weekStart.setDate(calState.weekStart.getDate() + 7); renderCalendar(); }

/* ── Custom Calendly booking modal ──────────────────────────── */
const calBookState = {
  date:          '',        // YYYY-MM-DD
  selectedSlot:  null,      // ISO string
  selectedLead:  null,      // lead object
  slots:         [],
  loading:       false,
  bookName:      '',        // pre-fill for Calendly
  bookEmail:     '',        // pre-fill for Calendly
};

function bookSlot(dateStr, hour) {
  openCalBookModal(dateStr, null);
}

function openCalBookModal(dateStr, prefillLead) {
  const overlay = document.getElementById('cal-book-overlay');
  if (!overlay) return;

  // Set initial state. Je kan geen afspraak in het verleden boeken, dus snap
  // een datum die al voorbij is naar vandaag.
  const today = new Date().toISOString().slice(0, 10);
  let initialDate = dateStr || today;
  if (initialDate < today) initialDate = today;
  calBookState.date         = initialDate;
  calBookState.selectedSlot = null;
  calBookState.bookPhone    = prefillLead ? (prefillLead.telefoon || '') : '';
  calBookState.selectedLead = prefillLead || null;
  calBookState.slots        = [];
  calBookState.bookName     = prefillLead ? (prefillLead.naam || '') : '';
  calBookState.bookEmail    = prefillLead ? (prefillLead.email || '') : '';

  // Update subtitle
  const subtitle = document.getElementById('cal-book-subtitle');
  if (subtitle) {
    const nl  = ['zo','ma','di','wo','do','vr','za'];
    const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const d   = new Date(calBookState.date + 'T12:00:00');
    const day = nl[d.getDay()];
    subtitle.textContent = day.charAt(0).toUpperCase() + day.slice(1) + ' ' + d.getDate() + ' ' + mns[d.getMonth()];
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCalBookBody();
  fetchCalSlots();
}

function closeCalBookModal() {
  const overlay = document.getElementById('cal-book-overlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCalBookBody() {
  const body = document.getElementById('cal-book-body');
  if (!body) return;

  const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const nl  = ['zo','ma','di','wo','do','vr','za'];
  const d   = new Date(calBookState.date + 'T12:00:00');
  const dateLbl = nl[d.getDay()].charAt(0).toUpperCase() + nl[d.getDay()].slice(1) + ' ' + d.getDate() + ' ' + mns[d.getMonth()];

  // Date nav
  const dateNavHtml = \`<div>
    <div class="cb-label">Datum</div>
    <div class="cb-date-nav">
      <button class="cb-date-btn" onclick="calBookNavDate(-1)" aria-label="Vorige dag" title="Vorige dag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="cb-date-label">\${dateLbl}</div>
      <button class="cb-date-btn" onclick="calBookNavDate(1)" aria-label="Volgende dag" title="Volgende dag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>
  </div>\`;

  // Slots
  let slotsHtml;
  if (calBookState.loading) {
    slotsHtml = \`<div class="cb-slots"><div class="cb-slots-loading"><div class="cal-book-spinner-ring"></div> Beschikbare tijden laden...</div></div>\`;
  } else if (calBookState.slots.length === 0) {
    slotsHtml = \`<div class="cb-slots"><div class="cb-slots-empty">
      Geen vrije tijden op \${dateLbl}.
      <button class="cb-empty-next" onclick="calBookNavDate(1)">Probeer volgende dag →</button>
    </div></div>\`;
  } else {
    slotsHtml = \`<div class="cb-slots">\${calBookState.slots.map(slot => {
      const t     = new Date(slot.startTime);
      const hh    = String(t.getHours()).padStart(2,'0');
      const mm    = String(t.getMinutes()).padStart(2,'0');
      const sel   = slot.startTime === calBookState.selectedSlot ? ' selected' : '';
      const isoEsc = escHtml(slot.startTime);
      return \`<button class="cb-slot\${sel}" onclick="calBookSelectSlot('\${isoEsc}')">\${hh}:\${mm}</button>\`;
    }).join('')}</div>\`;
  }

  // Lead picker + name/email (shown when slot selected)
  let leadHtml = '';
  if (calBookState.selectedSlot) {
    const qualified = (state.leads || [])
      .filter(l => l.qualified)
      .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0))
      .slice(0, 30);
    leadHtml = \`<div>
      <div class="cb-label">Koppel aan lead <span style="font-weight:400;text-transform:none;letter-spacing:0">(optioneel)</span></div>
      <div class="cb-lead-search">
        <input class="cb-lead-input" id="cb-lead-input" type="text"
          placeholder="Zoek op naam..."
          value="\${escHtml(calBookState.selectedLead ? (calBookState.selectedLead.naam || '') : '')}"
          oninput="calBookFilterLeads(this.value)"
          onfocus="calBookFilterLeads(this.value)"
        />
        <div class="cb-lead-dropdown" id="cb-lead-dropdown" style="display:none">
          \${qualified.map(l => {
            const lid    = escHtml(String(l.id));
            const name   = escHtml(l.naam || 'Onbekend');
            const score  = l.leadScore || '';
            return \`<div class="cb-lead-opt" onclick="calBookPickLead('\${lid}')">
              <span>\${name}</span>
              \${score ? \`<span class="cb-lead-opt-score">\${score}</span>\` : ''}
            </div>\`;
          }).join('')}
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:2px">
      <div>
        <div class="cb-label">Naam</div>
        <input class="cb-field-input" id="cb-book-name" type="text" placeholder="Volledige naam"
          value="\${escHtml(calBookState.bookName)}"
          oninput="calBookState.bookName=this.value" />
      </div>
      <div>
        <div class="cb-label">Telefoon</div>
        <input class="cb-field-input" id="cb-book-phone" type="tel" placeholder="+32 466 35 84 27"
          value="\${escHtml(calBookState.bookPhone || '')}"
          oninput="calBookState.bookPhone=this.value" />
      </div>
    </div>\`;
  }

  // Confirm button — boekt direct in Airtable Appointments tabel
  let confirmHtml = '';
  if (calBookState.selectedSlot) {
    const t  = new Date(calBookState.selectedSlot);
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    confirmHtml = \`<div class="cb-confirm-wrap">
      <button id="cb-confirm-btn" class="cb-confirm-btn" onclick="calBookConfirm()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        Boek afspraak om \${hh}:\${mm}
      </button>
      <div class="cb-confirm-note">Afspraak wordt direct opgeslagen in je agenda</div>
    </div>\`;
  }

  body.innerHTML = dateNavHtml +
    \`<div><div class="cb-label">Beschikbare tijden</div>\${slotsHtml}</div>\` +
    leadHtml + confirmHtml;
}

// Parse een werkuren-string ('ma-vr 9-18', 'mon-sat 8-20', '9-18') naar
// { startHour, endHour }. Pakt het LAATSTE getal-streepje-getal paar (de
// uren komen na de dagen, die ook een streepje hebben). null = onbekend.
function parseWorkHours(str) {
  if (!str) return null;
  const all = String(str).match(/(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})/g);
  if (!all || !all.length) return null;
  const m = all[all.length - 1].match(/(\\d{1,2})\\s*[-–]\\s*(\\d{1,2})/);
  const sh = parseInt(m[1], 10), eh = parseInt(m[2], 10);
  if (sh >= 0 && eh <= 24 && sh < eh) return { startHour: sh, endHour: eh };
  return null;
}
// Werkuren toepassen op state (null = fallback 9-18 in fetchCalSlots).
// workHoursLoaded markeert dat we de config al gezien hebben.
function applyWorkHours(str) { state.workHours = parseWorkHours(str); state.workHoursLoaded = true; }

async function fetchCalSlots() {
  // Geen Calendly meer. Genereer slots client-side op basis van werkuren
  // (default 9-18 elke 30 min) en markeer welke al bezet zijn obv bestaande
  // appointments uit dezelfde dag.
  calBookState.loading = true;
  calBookState.slots   = [];
  renderCalBookBody();

  try {
    // Werkuren nog niet geladen? Haal de config één keer op zodat de slots
    // de openingsuren respecteren, ook als de gebruiker AI Persoonlijkheid
    // deze sessie nog niet bezocht heeft. workHoursLoaded voorkomt herhaalde
    // fetches wanneer er bewust geen werkuren zijn ingesteld.
    if (!state.workHoursLoaded) {
      try {
        const cr = await fetch(\`\${API_BASE}/leads\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
          body: JSON.stringify({ mode: 'config-get' })
        });
        if (cr.ok) { const cd = await cr.json(); applyWorkHours(cd.workingHours); }
      } catch {}
    }
    // 1. Haal afspraken voor deze dag op
    const dayStart = new Date(calBookState.date + 'T00:00:00');
    const dayEnd   = new Date(calBookState.date + 'T23:59:59');
    const resp = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'appointments-list', from: dayStart.toISOString(), to: dayEnd.toISOString() })
    });
    const data = await resp.json();
    const existing = (data.appointments || []).map(r => {
      const f = r.fields || {};
      const start = new Date(f['Start Time']);
      const durMin = parseInt(f['Duration']) || 30;
      return { start: start.getTime(), end: start.getTime() + durMin*60*1000 };
    });

    // 2. Genereer kandidaat-slots binnen de werkuren van de klant.
    //    state.workHours = { startHour, endHour } afgeleid uit klantconfig,
    //    valt terug op 9-18 als niet bekend.
    const wh = state.workHours || { startHour: 9, endHour: 18 };
    const slots = [];
    const SLOT_DURATION_MIN = 30;
    for (let h = wh.startHour; h < wh.endHour; h++) {
      for (let m = 0; m < 60; m += SLOT_DURATION_MIN) {
        const slotStart = new Date(calBookState.date + 'T' + String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':00');
        const slotEnd   = slotStart.getTime() + SLOT_DURATION_MIN*60*1000;
        // Filter: overlap met bestaande afspraak = niet beschikbaar
        const overlap = existing.some(e => slotStart.getTime() < e.end && slotEnd > e.start);
        // Filter: tijd in het verleden = niet beschikbaar
        const past = slotStart.getTime() < Date.now();
        if (overlap || past) continue;
        // VELD-NAAM moet 'startTime' zijn (renderCalBookBody leest slot.startTime)
        slots.push({
          startTime: slotStart.toISOString(),
          duration:  SLOT_DURATION_MIN
        });
      }
    }

    calBookState.slots        = slots;
    calBookState.loading      = false;
    renderCalBookBody();
  } catch (e) {
    console.error('[fetchCalSlots]', e);
    calBookState.loading = false;
    calBookState.slots   = [];
    renderCalBookBody();
  }
}

function calBookSelectSlot(iso) {
  calBookState.selectedSlot = calBookState.selectedSlot === iso ? null : iso;
  renderCalBookBody();
}

// Bevestig handmatige boeking. Roept appointment-create endpoint aan.
async function calBookConfirm() {
  if (!calBookState.selectedSlot) return;
  const name  = (calBookState.bookName  || '').trim();
  const phone = (calBookState.bookPhone || '').trim();
  if (!name) {
    toast('Vul een naam in', 'error');
    return;
  }
  const btn = document.getElementById('cb-confirm-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerText = 'Bezig...'; }
  try {
    const resp = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({
        mode:      'appointment-create',
        startTime: calBookState.selectedSlot,
        duration:  30,
        leadId:    calBookState.selectedLead ? calBookState.selectedLead.id : null,
        leadName:  name,
        leadPhone: phone,
        notes:     'Handmatig geboekt vanuit dashboard'
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      toast(data.message || data.error || 'Boeken mislukt', 'error');
      if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerText = 'Boek afspraak'; }
      return;
    }
    toast('Afspraak geboekt', 'success');
    closeCalBookModal();
    // Refresh calendar view
    calState.cache = {};   // invalideer cache
    if (typeof renderAppointments === 'function') renderAppointments();
  } catch (err) {
    toast('Boeken mislukt. ' + (err.message || ''), 'error');
    if (btn) { btn.disabled = false; btn.style.opacity = ''; btn.innerText = 'Boek afspraak'; }
  }
}

function calBookNavDate(delta) {
  const d = new Date(calBookState.date + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  const newDate = d.toISOString().slice(0, 10);
  // Niet terug in het verleden navigeren.
  const today = new Date().toISOString().slice(0, 10);
  if (newDate < today) return;
  calBookState.date         = newDate;
  calBookState.selectedSlot = null;

  // Update subtitle
  const nl  = ['zo','ma','di','wo','do','vr','za'];
  const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const day = nl[d.getDay()];
  const subtitle = document.getElementById('cal-book-subtitle');
  if (subtitle) subtitle.textContent = day.charAt(0).toUpperCase() + day.slice(1) + ' ' + d.getDate() + ' ' + mns[d.getMonth()];

  fetchCalSlots();
}

function calBookFilterLeads(q) {
  const dropdown = document.getElementById('cb-lead-dropdown');
  if (!dropdown) return;
  const lower = (q || '').toLowerCase();
  const opts   = dropdown.querySelectorAll('.cb-lead-opt');
  let visible  = 0;
  opts.forEach(opt => {
    const name = opt.querySelector('span') ? opt.querySelector('span').textContent.toLowerCase() : '';
    const show  = !lower || name.includes(lower);
    opt.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  dropdown.style.display = visible > 0 ? 'block' : 'none';
}

function calBookPickLead(leadId) {
  const lead = (state.leads || []).find(l => String(l.id) === leadId);
  calBookState.selectedLead = lead || null;
  if (lead) {
    calBookState.bookName  = lead.naam  || calBookState.bookName;
    calBookState.bookEmail = lead.email || calBookState.bookEmail;
  }
  const input    = document.getElementById('cb-lead-input');
  const dropdown = document.getElementById('cb-lead-dropdown');
  if (input)    input.value = lead ? (lead.naam || '') : '';
  if (dropdown) dropdown.style.display = 'none';
  // Update name/email inputs if already rendered
  const nameInput  = document.getElementById('cb-book-name');
  const emailInput = document.getElementById('cb-book-email');
  if (nameInput  && lead && lead.naam)  nameInput.value  = lead.naam;
  if (emailInput && lead && lead.email) emailInput.value = lead.email;
}


// Hide lead dropdown when clicking outside
document.addEventListener('click', e => {
  const dd = document.getElementById('cb-lead-dropdown');
  const inp = document.getElementById('cb-lead-input');
  if (dd && inp && !dd.contains(e.target) && e.target !== inp) {
    dd.style.display = 'none';
  }
});

function renderCalSidebar() {
  const listEl  = document.getElementById('cal-sidebar-list');
  const countEl = document.getElementById('cal-sidebar-count');
  if (!listEl) return;

  const leads = (state.leads || []).filter(l => l.qualified && !l.afspraakGeboekt)
    .sort((a, b) => (b.leadScore || 0) - (a.leadScore || 0));

  if (countEl) countEl.textContent = leads.length;

  if (leads.length === 0) {
    listEl.innerHTML = \`<div class="cal-sidebar-empty">Alle gekwalificeerde leads hebben een afspraak!</div>\`;
    return;
  }

  listEl.innerHTML = leads.map(l => {
    const name     = l.naam || 'Onbekend';
    const initials = name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0,2).toUpperCase() || 'HV';
    const phone    = l.telefoon || '';
    const score    = l.leadScore || '';
    const rawPhone = phone.replace(/\D/g,'');
    const waPhone  = rawPhone.startsWith('0') ? '32' + rawPhone.slice(1) : rawPhone;
    const waLink   = \`https://wa.me/\${waPhone}?text=\${encodeURIComponent('Hallo ' + name + ', ik wilde graag een afspraak inplannen. Wanneer schikt het u?')}\`;
    const idStr    = escHtml(String(l.id));
    return \`<div class="cal-call-item" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${idStr}');if(lead)openPanel(lead);})()">
      <div class="cal-call-header">
        <div class="cal-call-avatar">\${escHtml(initials)}</div>
        <span class="cal-call-name">\${escHtml(name)}</span>
        \${score !== '' ? \`<span class="cal-call-score">\${score}</span>\` : ''}
      </div>
      \${phone ? \`<a class="cal-call-phone-link" href="tel:\${escHtml(phone)}" onclick="event.stopPropagation()">
        <span></span> \${escHtml(phone)}
      </a>\` : '<div style="font-size:11px;color:var(--text-muted);margin-bottom:7px">Geen telefoonnummer</div>'}
      <div class="cal-call-actions">
        \${phone ? \`<a class="cal-call-btn" href="tel:\${escHtml(phone)}" onclick="event.stopPropagation()">Bellen</a>\` : ''}
        \${waPhone ? \`<a class="cal-call-btn" href="\${escHtml(waLink)}" target="_blank" onclick="event.stopPropagation()">WA</a>\` : ''}
        <button class="cal-call-btn primary" onclick="event.stopPropagation();openCalBookModal(new Date().toISOString().slice(0,10),(state.leads||[]).find(x=>String(x.id)==='\${idStr}'))">Boeken</button>
      </div>
    </div>\`;
  }).join('');
}

/* ── Attendance tracking ─────────────────────────────────────── */
function matchLeadToEvent(evName) {
  const n = (evName || '').toLowerCase().replace(/\s+/g,' ').trim();
  if (!n) return null;
  const leads = state.leads || [];
  // Exact match first
  let found = leads.find(l => (l.naam||'').toLowerCase().replace(/\s+/g,' ').trim() === n);
  if (found) return found;
  // Partial: every word of event name appears in lead name (or vice versa)
  const evWords = n.split(' ').filter(w => w.length > 2);
  found = leads.find(l => {
    const ln = (l.naam||'').toLowerCase();
    return evWords.length > 0 && evWords.every(w => ln.includes(w));
  });
  return found || null;
}

function renderAttendanceBanner() {
  const banner = document.getElementById('cal-attendance-banner');
  const cards  = document.getElementById('cal-att-cards');
  if (!banner || !cards) return;

  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  const events = calState.lastEvents || [];

  const pending = [];
  events.forEach(ev => {
    if (new Date(ev.startTime).getTime() > fiveHoursAgo) return;
    const lead = matchLeadToEvent(ev.name);
    if (!lead) return;
    const nData = parseNotities(lead);
    const v = nData.afspraak ? nData.afspraak.verschenen : undefined;
    if (v === true || v === false) return; // already marked
    pending.push({ ev, lead });
  });

  if (pending.length === 0) { banner.classList.remove('visible'); return; }
  banner.classList.add('visible');

  const mns = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  const nl  = ['zo','ma','di','wo','do','vr','za'];

  cards.innerHTML = pending.map(({ ev, lead }) => {
    const start   = new Date(ev.startTime);
    const dayLbl  = nl[start.getDay()] + ' ' + start.getDate() + ' ' + mns[start.getMonth()];
    const timeLbl = String(start.getHours()).padStart(2,'0') + ':' + String(start.getMinutes()).padStart(2,'0');
    const idStr   = escHtml(String(lead.id));
    return \`<div class="cal-att-card" id="cal-att-card-\${idStr}">
      <div class="cal-att-info">
        <div class="cal-att-name">\${escHtml(lead.naam || ev.name || '?')}</div>
        <div class="cal-att-time">\${dayLbl} · \${timeLbl}</div>
      </div>
      <div class="cal-att-btns" id="cal-att-btns-\${idStr}">
        <button class="cal-att-btn yes" onclick="bannerAttYes('\${idStr}')">Gekomen</button>
        <button class="cal-att-btn no"  onclick="markAttendance('\${idStr}',false,'','');renderAttendanceBanner()">Niet</button>
      </div>
    </div>\`;
  }).join('');
}

async function markAttendance(leadId, verschenen, gesloten, notitie) {
  const lead = (state.leads || []).find(l => String(l.id) === String(leadId));
  if (!lead) return;

  const nData = parseNotities(lead);
  const geslotenClean = String(gesloten || '').trim();
  const notitieClean  = String(notitie  || '').trim();
  nData.afspraak = Object.assign({}, nData.afspraak || {}, {
    verschenen,
    ...(gesloten !== undefined ? { gesloten: geslotenClean } : {}),
    ...(notitie  !== undefined ? { notitie:  notitieClean  } : {}),
  });
  const notitiesStr = serializeNotities(nData);

  // Optimistic update in state
  lead.notities = notitiesStr;
  // If deal value entered → also update verwachteWaarde so revenue goal updates immediately
  if (geslotenClean) lead.verwachteWaarde = geslotenClean;

  const card = document.getElementById('cal-att-card-' + leadId);
  if (card) { card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }

  try {
    const fields = { notities: notitiesStr };
    if (geslotenClean) fields.dealWaarde = geslotenClean;
    await patchLead(leadId, fields);
    toast(verschenen ? 'Opgeslagen. Gekomen' : 'Opgeslagen. Niet gekomen', 'success');
  } catch(e) {
    toast('Opslaan mislukt', 'error');
    if (card) { card.style.opacity = '1'; card.style.pointerEvents = ''; }
    return;
  }

  // Auto-update revenue goal tracker
  renderRevenueGoal();
  renderAttendanceBanner();
  if (calState.lastEvents) renderAttendanceDots();
}

/* Expand banner card to ask deal + note when "Gekomen" clicked */
function bannerAttYes(leadId) {
  const btnsEl = document.getElementById('cal-att-btns-' + leadId);
  if (!btnsEl) return;
  btnsEl.outerHTML = \`<div id="cal-att-form-\${escHtml(leadId)}" style="margin-top:8px;display:flex;flex-direction:column;gap:7px;width:100%">
    <input id="cal-att-deal-\${escHtml(leadId)}" class="cal-att-followup-input" type="text" placeholder="Deal waarde (bijv. €1.500)" style="font-size:12px;padding:7px 10px" />
    <textarea id="cal-att-note-\${escHtml(leadId)}" class="cal-att-followup-textarea" placeholder="Notities over het gesprek..." style="font-size:12px;min-height:56px;padding:7px 10px"></textarea>
    <div style="display:flex;gap:6px">
      <button class="cal-att-save-btn" style="flex:1;padding:7px" onclick="bannerAttSave('\${escJs(leadId)}')">Opslaan</button>
      <button class="cal-att-btn no" style="flex:0 0 auto" onclick="markAttendance('\${escJs(leadId)}',false,'','');renderAttendanceBanner()">Niet</button>
    </div>
  </div>\`;
}

async function bannerAttSave(leadId) {
  const dealEl = document.getElementById('cal-att-deal-' + leadId);
  const noteEl = document.getElementById('cal-att-note-' + leadId);
  const deal   = dealEl ? dealEl.value.trim() : '';
  const note   = noteEl ? noteEl.value.trim() : '';
  await markAttendance(leadId, true, deal, note);
}

function renderAttendanceDots() {
  // Re-render just the event dots without full calendar refresh
  const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
  (calState.lastEvents || []).forEach((ev, idx) => {
    const el = document.querySelector(\`[data-ev-idx="\${idx}"]\`);
    if (!el) return;
    const dot = el.querySelector('.cal-event-needs-att');
    if (new Date(ev.startTime).getTime() < fiveHoursAgo) {
      const lead = matchLeadToEvent(ev.name);
      if (lead) {
        const nData = parseNotities(lead);
        const v = nData.afspraak ? nData.afspraak.verschenen : undefined;
        if (v !== true && v !== false) {
          if (!dot) { const d = document.createElement('div'); d.className='cal-event-needs-att'; el.appendChild(d); }
          return;
        }
      }
    }
    if (dot) dot.remove();
  });
}

function renderAppointments() {
  if (!calState.weekStart) calState.weekStart = calGetMonday(new Date());
  renderCalSidebar();
  renderCalendar();
}

async function renderCalendar() {
  const ws = calState.weekStart;
  if (!ws) return;

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(ws); d.setDate(d.getDate() + i); return d;
  });

  // Range label
  const startM = days[0].toLocaleDateString('nl-NL', { month: 'short' });
  const endM   = days[6].toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  const label  = startM === days[6].toLocaleDateString('nl-NL', { month: 'short' })
    ? days[0].toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
    : startM + '. ' + endM;
  const rangeEl = document.getElementById('cal-range-label');
  if (rangeEl) rangeEl.textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const today    = new Date(); today.setHours(0,0,0,0);
  const dayNames = ['ZO','MA','DI','WO','DO','VR','ZA'];

  // Day headers
  const headerEl = document.getElementById('cal-day-cols-header');
  if (headerEl) {
    headerEl.innerHTML = days.map(d => {
      const isToday = d.getTime() === today.getTime();
      return \`<div class="cal-day-header-cell\${isToday ? ' cal-today' : ''}">
        <div class="cal-day-name">\${dayNames[d.getDay()]}</div>
        <div class="cal-day-num">\${d.getDate()}</div>
      </div>\`;
    }).join('');
  }

  // Time labels (with half-hour ticks)
  const timeLabels = document.getElementById('cal-time-labels');
  if (timeLabels) {
    timeLabels.innerHTML = Array.from({ length: CAL_HOURS }, (_, i) => {
      const h   = CAL_START_HOUR + i;
      const lbl = h < 12 ? h + ':00' : (h === 12 ? '12:00' : (h - 12) + ':00');
      const halfLbl = h < 11 ? (h) + ':30' : (h === 11 ? '11:30' : (h === 12 ? '12:30' : (h - 12) + ':30'));
      return \`<div class="cal-time-label">\${lbl}<span class="cal-time-label-half">\${halfLbl}</span></div>\`;
    }).join('');
  }

  // Render skeleton columns immediately, then fill events
  const colsEl = document.getElementById('cal-day-cols');
  if (!colsEl) return;

  const renderCols = (events) => {
    const eventColors = ['#E8D7B1','#E8D7B1','#C9AE7C','#34D399','#C9AE7C'];

    // Store events for modal lookup
    calState.lastEvents = events;

    // Update today widget and nav badge
    renderTodayWidget(events);
    updateCalBadge(events);
    renderAttendanceBanner();

    colsEl.innerHTML = days.map(d => {
      const isToday   = d.getTime() === today.getTime();
      const dow       = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const dateStr = d.toISOString().slice(0, 10);
      const rows = Array.from({ length: CAL_HOURS }, (_, hIdx) => {
        const h = CAL_START_HOUR + hIdx;
        return \`<div class="cal-hour-row"><button class="cal-hour-add" onclick="bookSlot('\${dateStr}',\${h})" title="Boek afspraak \${h}:00">+</button></div>\`;
      }).join('');

      let nowLine = '';
      if (isToday) {
        const now = new Date();
        const mins = (now.getHours() - CAL_START_HOUR) * 60 + now.getMinutes();
        if (mins >= 0 && mins < CAL_HOURS * 60)
          nowLine = \`<div class="cal-now-line" style="top:\${Math.round((mins / 60) * CAL_ROW_H)}px"></div>\`;
      }

      // Events for this day
      const dayDate   = d.toDateString();
      const dayEvents = events.filter(ev => new Date(ev.startTime).toDateString() === dayDate);

      const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
      const evHtml = dayEvents.map(ev => {
        const evIdx    = events.indexOf(ev);
        const start    = new Date(ev.startTime);
        const end      = new Date(ev.endTime);
        const startMin = (start.getHours() - CAL_START_HOUR) * 60 + start.getMinutes();
        const durMin   = Math.round((end - start) / 60000) || 30;
        const top      = Math.round((startMin / 60) * CAL_ROW_H);
        const height   = Math.max(Math.round((durMin / 60) * CAL_ROW_H) - 3, 28);
        const color    = eventColors[(ev.name || '').charCodeAt(0) % eventColors.length];
        const hh       = String(start.getHours()).padStart(2,'0');
        const mm       = String(start.getMinutes()).padStart(2,'0');
        const endHH    = String(end.getHours()).padStart(2,'0');
        const endMM    = String(end.getMinutes()).padStart(2,'0');
        const fullName = escHtml(ev.name || 'Afspraak');
        const eventTypeTxt = escHtml(ev.eventType || '');
        // Duration label
        const durH   = Math.floor(durMin / 60);
        const durM   = durMin % 60;
        const durLbl = durH > 0
          ? (durM > 0 ? \`\${durH}u \${durM}min\` : \`\${durH}u\`)
          : \`\${durMin}min\`;
        // Orange dot: past event where matched lead has no attendance marked
        let attDot = '';
        if (start.getTime() < fiveHoursAgo) {
          const ml = matchLeadToEvent(ev.name);
          if (ml) {
            const nd = parseNotities(ml);
            const v  = nd.afspraak ? nd.afspraak.verschenen : undefined;
            if (v !== true && v !== false) attDot = '<div class="cal-event-needs-att"></div>';
          }
        }
        // Adaptive body based on available height
        let bodyHtml;
        if (height < 30) {
          // Tiny: just start time
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm}</div>\`;
        } else if (height < 50) {
          // Small: time + name
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm}. \${endHH}:\${endMM}</div><div class="cal-event-name">\${fullName}</div>\`;
        } else if (height < 72) {
          // Medium: time range + name + duration
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm}. \${endHH}:\${endMM}</div><div class="cal-event-name">\${fullName}</div><div class="cal-event-dur">⏱ \${durLbl}</div>\`;
        } else {
          // Tall: full info
          bodyHtml = \`<div class="cal-event-time">\${hh}:\${mm}. \${endHH}:\${endMM}</div><div class="cal-event-name">\${fullName}</div>\${eventTypeTxt ? \`<div class="cal-event-type">\${eventTypeTxt}</div>\` : ''}<div class="cal-event-dur">⏱ \${durLbl}</div>\`;
        }
        // Google entries are read-only context, not Helvaro appointments:
        // muted, hatched, no click handler. Making them look like bookings
        // would be worse than not showing them at all.
        if (ev.external) {
          return \`<div class="cal-event cal-event-external" style="top:\${top}px;height:\${height}px;position:relative;" title="\${fullName} · \${hh}:\${mm}–\${endHH}:\${endMM} (uit je Google Agenda)">\${bodyHtml}</div>\`;
        }
        return \`<div class="cal-event" data-ev-idx="\${evIdx}" style="top:\${top}px;height:\${height}px;background:linear-gradient(135deg,\${color},\${color}cc);cursor:pointer;position:relative;" title="\${fullName} · \${hh}:\${mm}–\${endHH}:\${endMM} (\${durLbl})" onclick="openCalEvent(\${evIdx})">\${bodyHtml}\${attDot}</div>\`;
      }).join('');

      const colClass = \`cal-day-col\${isToday ? ' cal-today-col' : ''}\${isWeekend ? ' cal-weekend-col' : ''}\`;
      return \`<div class="\${colClass}">\${rows}\${nowLine}\${evHtml}</div>\`;
    }).join('');

    // Scroll to current hour on first load (1 hour context above, clamped to 0)
    const scrollEl = document.getElementById('cal-scroll-area');
    if (scrollEl && scrollEl.dataset.scrolled !== '1') {
      scrollEl.dataset.scrolled = '1';
      const curHour = new Date().getHours();
      if (curHour >= CAL_START_HOUR && curHour < CAL_START_HOUR + CAL_HOURS) {
        scrollEl.scrollTop = Math.max(0, (curHour - CAL_START_HOUR - 1) * CAL_ROW_H);
      } else {
        scrollEl.scrollTop = 0;
      }
    }
  };

  // Draw skeleton first
  renderCols([]);

  // Fetch real events from Calendly API
  const weekKey = ws.toISOString().slice(0, 10);
  if (calState.cache[weekKey]) return renderCols(calState.cache[weekKey]);

  try {
    const minISO = days[0].toISOString();
    const end    = new Date(days[6]); end.setHours(23, 59, 59, 999);
    const maxISO = end.toISOString();
    // Lees uit nieuwe custom Appointments tabel (Calendly is verwijderd).
    // Convert Airtable records naar het formaat dat renderCols() verwacht.
    const resp = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'appointments-list', from: minISO, to: maxISO })
    });
    if (resp.ok) {
      const data = await resp.json();
      const events = (data.appointments || []).map(r => {
        const f = r.fields || {};
        const start = new Date(f['Start Time']);
        const durMin = parseInt(f['Duration']) || 30;
        const end = new Date(start.getTime() + durMin*60*1000);
        const status = f['Status'] || 'booked';
        const source = f['Source'] || 'manual';
        // FIELD NAMES MOETEN MATCH met renderCols (gebruikt startTime/endTime).
        // Plus 'eventType' tag (status/source) zodat user ziet "AI geboekt" of "Geannuleerd".
        const sourceLabel = source === 'ai_chat' ? 'AI geboekt' : (source === 'manual' ? 'Handmatig' : 'Import');
        const eventType   = status === 'cancelled' ? 'Geannuleerd' : (status === 'no_show' ? 'No-show' : sourceLabel);
        return {
          id:        r.id,
          name:      f['Lead Name'] || 'Afspraak',
          phone:     f['Lead Phone'] || '',
          startTime: start.toISOString(),
          endTime:   end.toISOString(),
          eventType,
          status,
          source,
          notes:     f['Notes'] || ''
        };
      });
      // Merge the client's real Google Calendar entries in alongside
      // Helvaro's own bookings. Before this the week looked emptier than it
      // was, and nothing stopped a client booking straight over their own
      // meetings. Tagged 'Google agenda' and marked external so the two are
      // never confused — these are read-only and not Helvaro appointments.
      const external = (data.externalEvents || []).map(function (e) {
        const st = new Date(e.start);
        const en = e.end ? new Date(e.end) : new Date(st.getTime() + 30 * 60 * 1000);
        return {
          id:        'g_' + (e.id || Math.random().toString(36).slice(2)),
          name:      e.title || 'Bezet',
          phone:     '',
          startTime: st.toISOString(),
          endTime:   en.toISOString(),
          eventType: 'Google agenda',
          status:    'external',
          source:    'google',
          external:  true,
          allDay:    !!e.allDay,
          notes:     ''
        };
      // All-day entries would otherwise paint over the entire column and
      // bury the actual appointments underneath them.
      }).filter(function (e) { return !e.allDay; });

      const merged = events.concat(external)
        .sort(function (a, b) { return new Date(a.startTime) - new Date(b.startTime); });

      calState.cache[weekKey] = merged;
      renderCols(merged);
    }
  } catch (e) { /* stay with empty */ }
}

/* ── Profile page ── */
function renderProfile() {
  const s = state;
  // Avatar
  const initials = (s.clientName || 'HV').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const avEl = document.getElementById('profile-avatar-lg');
  const nameEl = document.getElementById('profile-name-lg');
  const emailEl = document.getElementById('profile-email-lg');
  if (avEl)    avEl.textContent   = initials;
  if (nameEl)  nameEl.textContent = s.clientName || '—';
  if (emailEl) emailEl.textContent = s.userEmail || localStorage.getItem('hv-email') || '—';

  // Booking systeem: nu ingebouwd (in-chat), geen externe service meer.
  const statusEl = document.getElementById('pf-cal-status');
  const btnEl    = document.getElementById('pf-connect-btn');
  const openEl   = document.getElementById('pf-calendly-open');
  const pfCal    = document.getElementById('pf-calendly');
  if (statusEl) {
    statusEl.textContent = 'Actief';
    statusEl.style.background = 'rgba(16,185,129,0.15)';
    statusEl.style.color = 'var(--success)';
  }
  if (btnEl)  btnEl.style.display  = 'none';   // connect-knop verbergen
  if (openEl) openEl.style.display = 'none';   // externe link verbergen
  if (pfCal)  pfCal.textContent = 'AI boekt direct in WhatsApp gesprek';

  // Info rows
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('pf-naam',   s.clientName || '—');
  set('pf-email',  s.userEmail  || localStorage.getItem('hv-email') || '—');

  // Stats
  const st = s.stats || {};
  set('pf-total',  st.total          || (s.leads||[]).length || '0');
  set('pf-qual',   st.qualified      || (s.leads||[]).filter(l=>l.qualified).length || '0');
  set('pf-booked', st.booked         || (s.leads||[]).filter(l=>l.afspraakGeboekt).length || '0');
  set('pf-conv',   (st.conversionRate||0) + '%');

  // Recent leads on profile
  const recentEl = document.getElementById('profile-recent-leads');
  if (recentEl) {
    const recents = (state.leads || []).slice(0, 5);
    if (recents.length === 0) {
      recentEl.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Geen leads gevonden</div>';
    } else {
      recentEl.innerHTML = recents.map(l => {
        const name  = l.fields?.['Naam'] || l.naam || 'Onbekend';
        const score = l.fields?.['Score'] ?? l.leadScore ?? '—';
        const bron  = l.fields?.['Bron'] || l.bron || '';
        const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
        const qual = l.fields?.['Qualified'] === true || l.qualified === true || (l.fields?.['Score'] >= 7) || l.leadScore >= 7;
        return \`<div class="profile-recent-lead-row" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escJs(String(l.id))}');if(lead){navigateTo('dashboard');setTimeout(function(){openPanel(lead);},120);}})()">
          <div class="profile-recent-lead-avatar">\${initials}</div>
          <div style="flex:1;min-width:0">
            <div class="profile-recent-lead-name">\${escHtml(name)}</div>
            <div class="profile-recent-lead-meta">\${escHtml(bron || 'Onbekende bron')}</div>
          </div>
          \${qual ? '<span style="font-size:10px;padding:3px 8px;border-radius:20px;background:rgba(var(--success-rgb),0.15);color:var(--success);font-weight:700">&#10003; Gekw.</span>' : ''}
          <div class="profile-recent-lead-score">\${score}</div>
        </div>\`;
      }).join('');
    }
  }

  // Stats row
  const statsRow = document.getElementById('profile-stats-row');
  if (statsRow) {
    const items = [
      { v: st.total     || (s.leads||[]).length || 0, l: 'Leads' },
      { v: st.qualified || (s.leads||[]).filter(l=>l.qualified).length || 0, l: 'Gekwalificeerd' },
      { v: st.booked    || (s.leads||[]).filter(l=>l.afspraakGeboekt).length || 0, l: 'Afspraken' },
      { v: (st.conversionRate||0) + '%', l: 'Conversie' }
    ];
    statsRow.innerHTML = items.map(i =>
      \`<div class="profile-stat-card"><div class="psv">\${i.v}</div><div class="psl">\${i.l}</div></div>\`
    ).join('');
  }
}

function navigateTo(page) {
  state.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById(\`page-\${page}\`);
  const navEl = document.getElementById(\`nav-\${page}\`);
  if (pageEl) pageEl.classList.add('active');
  if (navEl) navEl.classList.add('active');

  const titles = {
    dashboard:    { title: 'Dashboard',     sub: 'Overzicht van je gekwalificeerde leads' },
    exports:      { title: 'Exports',       sub: 'Rapporten en data-export' },
    kalender:     { title: 'Kalender',      sub: 'Je afspraken en beschikbaarheid' },
    admin:        { title: 'Klanten',       sub: 'Overzicht van alle klanten' },
    profile:      { title: 'Profiel',       sub: 'Je accountgegevens en statistieken' },
    pipeline:     { title: 'Pipeline',      sub: 'Kanban overzicht van je leads' },
    gesprekken:   { title: 'Gesprekken',    sub: 'AI-conversaties met je leads' },
    resultaten:   { title: 'Resultaten',    sub: 'Wat Helvaro deze periode heeft opgeleverd' },
    analyse:      { title: 'Analyse',       sub: 'Statistieken en prestatieanalyse' },
    instellingen: { title: 'Instellingen',  sub: 'Beheer je accountinstellingen' },
    activiteit:   { title: 'Activiteit',    sub: 'Recente gebeurtenissen en updates' },
    founder:      { title: 'Founder',       sub: 'Jouw startup. Alles in één oogopslag' },
    'ai-beeld':   { title: 'AI-beeld',      sub: 'Genereer AI-visualisaties van je panden' },
    formulier:    { title: 'Formulier',     sub: 'Je lead-formulier en aanvraagstatistieken' },
    'ai-persona': { title: 'AI Persoonlijkheid', sub: 'Pas de stem en werkwijze van je AI aan' }
  };

  const t = titles[page] || { title: page, sub: '' };
  document.getElementById('topbar-title').textContent = t.title;
  document.getElementById('topbar-subtitle').textContent = t.sub;

  // Show refresh + CSV export only on dashboard
  const isDash = page === 'dashboard';
  const btnRefresh = document.getElementById('btn-refresh');
  const btnExport  = document.getElementById('btn-export-csv');
  const tsInfo     = document.getElementById('timestamp-info');
  if (btnRefresh) btnRefresh.style.display = isDash ? '' : 'none';
  if (btnExport)  btnExport.style.display  = isDash ? '' : 'none';
  if (tsInfo)     tsInfo.style.display     = isDash ? '' : 'none';

  // Load admin page on first visit
  if (page === 'admin' && !state.adminLoaded) {
    state.adminLoaded = true;
    loadAdminClients();
  }

  if (page === 'kalender')     renderAppointments();
  if (page === 'profile')      renderProfile();
  if (page === 'resultaten')   loadResultaten();
  if (page === 'pipeline')     renderPipeline();
  if (page === 'gesprekken')   renderGesprekken();
  if (page === 'analyse')      renderAnalyse();
  if (page === 'instellingen') renderInstellingen();
  if (page === 'ai-persona')   loadAiPersona();
  if (page === 'formulier')    loadFormulier();
  if (page === 'exports')      updateExportPreview();
  if (page === 'activiteit')   renderActiviteit();
  if (page === 'founder')      loadFounderData();
  if (page === 'ai-beeld')     loadAiBeeldPage();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => navigateTo(btn.dataset.page));
});

/* ============================================================
   MOBILE SIDEBAR
   ============================================================ */
document.getElementById('hamburger').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
});

/* ============================================================
   SEARCH & FILTER LISTENERS
   ============================================================ */
const debouncedSearch = debounce((val) => {
  state.searchQ = val;
  applyFilters();
}, 200);

document.getElementById('search-input').addEventListener('input', e => debouncedSearch(e.target.value));

['filter-status', 'filter-qualified', 'filter-bron', 'filter-opgepikt'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => applyFilters());
});

document.getElementById('btn-reset-filters').addEventListener('click', resetFilters);

/* ============================================================
   TOPBAR BUTTONS
   ============================================================ */
document.getElementById('btn-refresh').addEventListener('click', refreshData);
document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
document.getElementById('btn-theme').addEventListener('click', toggleTheme);
document.getElementById('btn-logout').addEventListener('click', logout);

const bellBtn = document.getElementById('btn-notif');
if (bellBtn) {
  bellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('notif-dropdown');
    if (!dd) { navigateTo('activiteit'); return; }
    if (dd.style.display === 'none') openNotifDropdown();
    else closeNotifDropdown();
  });
  // Klik buiten de dropdown sluit hem
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('notif-dropdown');
    const wrap = document.querySelector('.notif-wrap');
    if (dd && dd.style.display !== 'none' && wrap && !wrap.contains(e.target)) closeNotifDropdown();
  });
}

function openNotifDropdown() {
  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;
  renderNotifDropdown();
  dd.style.display = 'block';
}
function closeNotifDropdown() {
  const dd = document.getElementById('notif-dropdown');
  if (dd) dd.style.display = 'none';
}
function clearNotifs() {
  const badge = document.getElementById('notif-badge');
  if (badge) { badge.style.display = 'none'; badge.dataset.count = '0'; }
  state.newLeadCount = 0;
  // Markeer alle huidige lead-ids als 'gezien' zodat ze niet meer als unread tonen
  try { localStorage.setItem('hv-notif-seen', JSON.stringify([...(state.knownLeadIds || [])])); } catch {}
  renderNotifDropdown();
  updateNavBadge && updateNavBadge();
}

// Rendert de meldingen-dropdown: recente leads, gekwalificeerde bovenaan
// gemarkeerd. Werkt volledig in-app, onafhankelijk van e-mail/DNS.
function renderNotifDropdown() {
  const body = document.getElementById('notif-dd-body');
  if (!body) return;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('hv-notif-seen') || '[]'); } catch {}
  const seenSet = new Set(seen);

  const leads = [...(state.leads || [])]
    .sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0))
    .slice(0, 10);

  if (leads.length === 0) {
    body.innerHTML = '<div class="notif-dd-empty">Nog geen meldingen.<br>Nieuwe leads verschijnen hier.</div>';
    return;
  }

  body.innerHTML = leads.map(l => {
    const id     = escHtml(String(l.id));
    const name   = escHtml(l.naam || 'Onbekende lead');
    const qual   = l.qualified === true || (l.leadScore || 0) >= 7;
    const unread = !seenSet.has(l.id);
    const score  = l.leadScore != null ? l.leadScore : '';
    const phone  = escHtml(l.telefoon || '');
    const when   = notifTimeAgo(l.datum);
    const sub    = qual
      ? ('Gekwalificeerd' + (score !== '' ? ' · score ' + score : '') + (when ? ' · ' + when : ''))
      : ((phone || 'Nieuwe lead') + (when ? ' · ' + when : ''));
    const icon = qual
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
    return \`<div class="notif-dd-item\${unread ? ' unread' : ''}" onclick="notifOpenLead('\${id}')">
      <span class="notif-dd-dot"></span>
      <span class="notif-dd-icon\${qual ? ' hot' : ''}">\${icon}</span>
      <span class="notif-dd-main">
        <span class="notif-dd-title">\${name}</span>
        <span class="notif-dd-sub">\${sub}</span>
      </span>
    </div>\`;
  }).join('');
}

function notifOpenLead(id) {
  closeNotifDropdown();
  const lead = (state.leads || []).find(x => String(x.id) === String(id));
  if (lead) { navigateTo('dashboard'); setTimeout(() => { try { openPanel(lead); } catch {} }, 120); }
}

// Relatieve tijd uit een ISO/date string (de bestaande timeAgo() verwacht een
// numerieke timestamp; deze accepteert strings veilig).
function notifTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'net nu';
  if (mins < 60) return mins + ' min geleden';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' uur geleden';
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'gisteren' : days + ' dagen geleden';
}

  // Global search
  const searchBtn = document.getElementById('btn-search');
  if (searchBtn) searchBtn.addEventListener('click', openSearch);

  // Close when clicking outside the modal
  const searchOverlay = document.getElementById('search-overlay');
  if (searchOverlay) {
    searchOverlay.addEventListener('mousedown', e => {
      const modal = document.getElementById('search-modal');
      if (modal && !modal.contains(e.target)) closeSearch();
    });
  }

  // Esc button in modal
  const searchEscBtn = document.getElementById('search-esc-btn');
  if (searchEscBtn) searchEscBtn.addEventListener('click', closeSearch);

  document.addEventListener('keydown', e => {
    const overlay = document.getElementById('search-overlay');
    const isOpen = overlay && overlay.classList.contains('open');
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); isOpen ? closeSearch() : openSearch(); return; }
    if (e.key === 'Escape' && isOpen) { e.stopPropagation(); closeSearch(); return; }
    if (!isOpen) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = document.querySelectorAll('#search-results .search-result-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') _searchActiveIndex = (_searchActiveIndex + 1) % items.length;
      else _searchActiveIndex = (_searchActiveIndex - 1 + items.length) % items.length;
      _searchUpdateActive();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const items = document.querySelectorAll('#search-results .search-result-item');
      const idx = _searchActiveIndex >= 0 ? _searchActiveIndex : 0;
      if (items[idx]) items[idx].click();
    }
  });

  const searchInput = document.getElementById('search-modal-input');
  if (searchInput) {
    searchInput.addEventListener('input', runGlobalSearch);
    // Reset active index on new input
    searchInput.addEventListener('keydown', e => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') _searchActiveIndex = -1;
    });
  }

/* ============================================================
   EXPORTS PAGE
   ============================================================ */
document.getElementById('btn-load-rapport').addEventListener('click', async () => {
  const btn = document.getElementById('btn-load-rapport');
  const skeleton = document.getElementById('rapport-skeleton');
  const content = document.getElementById('rapport-content');

  btn.disabled = true;
  btn.innerHTML = '<span class="icon" style="animation:spin 1s linear infinite;display:inline-block">↻</span> Laden...';
  skeleton.style.display = 'block';
  content.style.display = 'none';

  try {
    const data = await fetchRapport();
    const r = data.rapport || {};
    const stats = data.stats || {};

    document.getElementById('rapport-stats').innerHTML = \`
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.totaal ?? stats.total ?? 0}</div><div class="rapport-stat-label">Totaal leads</div></div>
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.gekwalificeerd ?? stats.qualified ?? 0}</div><div class="rapport-stat-label">Gekwalificeerd</div></div>
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.afspraken ?? stats.booked ?? 0}</div><div class="rapport-stat-label">Afspraken</div></div>
      <div class="rapport-stat"><div class="rapport-stat-value">\${r.conversie ?? stats.conversionRate ?? 0}%</div><div class="rapport-stat-label">Conversie</div></div>
    \`;

    const qualLeads = (data.leads || []).filter(l => l.qualified);
    let leadsHTML = '';
    if (qualLeads.length > 0) {
      leadsHTML = \`
        <div class="panel-section-title" style="margin-top:16px">Gekwalificeerde leads</div>
        <div class="rapport-leads-list">
          \${qualLeads.map(l => \`
            <div class="rapport-lead-item">
              <span>\${escHtml(l.naam) || '—'}</span>
              <span>\${scorePill(l.leadScore)}</span>
            </div>
          \`).join('')}
        </div>
      \`;
    }
    document.getElementById('rapport-leads-section').innerHTML = leadsHTML;

    skeleton.style.display = 'none';
    content.style.display = 'block';
    toast('Weekrapport geladen', 'success');
  } catch (err) {
    skeleton.style.display = 'none';
    toast('Rapport laden mislukt: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="icon">↻</span> Rapport opnieuw laden';
  }
});

document.getElementById('btn-download-csv').addEventListener('click', exportCSV);

/* ============================================================
   LOGIN LOGIC
   ============================================================ */
async function startDashboard(skipRefresh = false) {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('dashboard-app').classList.add('visible');
  requestNotificationPermission();
  initHelpWidget();

  // Admin reveal. Sidebar's 'Klanten' (and Founder) tabs only show when the
  // user logged in with the ADMIN_KEY. We detect this from the session payload:
  // admin sessions have clientName='Admin' AND an empty projectCode.
  const isAdmin = (state.clientName === 'Admin') && !localStorage.getItem('hv-project');
  const adminBtn   = document.getElementById('nav-admin');
  const founderBtn = document.getElementById('nav-founder');
  if (isAdmin) {
    if (adminBtn)   adminBtn.style.display   = '';
    if (founderBtn) founderBtn.style.display = '';
  } else {
    if (adminBtn)   adminBtn.style.display   = 'none';
    if (founderBtn) founderBtn.style.display = 'none';
  }

  // Calendly OAuth was removed along with the integration itself — nothing
  // redirects with a ?calendly= param anymore (the live Google Calendar
  // OAuth flow below uses ?gcal=, see api/leads.js's handleGcal callback).
  // This declaration stays; the block that used to read the calendly param
  // from it was dead (unreachable) and has been removed.
  const urlParams = new URLSearchParams(window.location.search);

  // Handle Google Agenda OAuth redirect params (?gcal=... from api/leads.js's
  // handleGcal callback, reached via the /api/gcal rewrite).
  const gcalResult = urlParams.get('gcal');
  if (gcalResult) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    const gcalMsgs = {
      connected:         ['Google Agenda gekoppeld! Beschikbaarheid en boekingen worden nu gesynchroniseerd.', 'success', 'Gekoppeld'],
      denied:             ['Koppeling geannuleerd.', 'info', 'Geannuleerd'],
      error:              ['Er is iets misgegaan bij het koppelen. Probeer het opnieuw.', 'error', 'Fout'],
      invalid_state:      ['Koppeling verlopen, probeer opnieuw.', 'error', 'Fout'],
      unconfigured:       ['Google Agenda is nog niet geconfigureerd.', 'info', 'Niet beschikbaar'],
      client_not_found:   ['Account niet gevonden, probeer opnieuw.', 'error', 'Fout'],
    };
    const m = gcalMsgs[gcalResult] || ['Google Agenda', 'info', null];
    setTimeout(() => toast(m[0], m[1], m[2]), 600);
    if (gcalResult === 'connected') setTimeout(() => navigateTo('instellingen'), 800);
  }

  // Start presence heartbeat. So the standalone Founder dashboard can show
  // who's currently logged in on app.helvaro.pro.
  startPresencePing();

  // Render altijd. refreshData(skipFetch) skipt alléén de netwerk-call wanneer
  // skipFetch=true (state is dan al door init() gevuld), maar rendert ALTIJD
  // (renderStats, charts, lijst). Vroeger sloegen we refreshData hier helemaal
  // over bij skipRefresh=true → skeletons bleven op 'LADEN...' tot je handmatig
  // op Vernieuwen klikte. Nu rendert hij meteen met de al-geladen data.
  // Niet awaiten zodat trage Airtable de UI niet blokkeert.
  refreshData(skipRefresh).catch(() => {});

  // First-time setup check: if essential AI config is missing, route to the
  // AI Persoonlijkheid page with a welcome banner so they finish onboarding.
  // Runs after refreshData so leads load in the background while they fill it in.
  if (!sessionStorage.getItem('hv-setup-checked')) {
    sessionStorage.setItem('hv-setup-checked', '1');
    checkFirstTimeSetup();
  }
}

// Fire a config-get; if essential fields are empty, force-navigate to the
// AI Persoonlijkheid page and show a "welkom!" banner explaining what to fill.
// Once the user clicks "Opslaan" on AI Persoonlijkheid we set hv-onboarded in
// localStorage so we never auto-redirect them again. Even if some 'essential'
// field is still empty (they made a conscious choice to leave it blank).
async function checkFirstTimeSetup() {
  try {
    if (localStorage.getItem('hv-onboarded') === '1') return;
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'config-get' })
    });
    if (!r.ok) return;
    const d = await r.json();
    // What "essential" means: AI Name, welcome template, and either website or
    // AI instructions (so the AI has SOMETHING to ground itself on).
    const missing = [];
    if (!d.aiName)         missing.push('aiName');
    if (!d.autoReplyTpl)   missing.push('autoReplyTpl');
    if (!d.website && !d.aiInstructions) missing.push('grounding');
    if (missing.length === 0) {
      // Config is already complete on this device too. Promote them to "onboarded"
      // so future logins on this browser skip the check entirely.
      localStorage.setItem('hv-onboarded', '1');
      return;
    }

    // Remember which fields were missing so the page can prioritize them
    sessionStorage.setItem('hv-setup-missing', JSON.stringify(missing));
    sessionStorage.setItem('hv-setup-pending', '1');
    setTimeout(() => navigateTo('ai-persona'), 300);
  } catch { /* silent. Not critical */ }
}

document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('login-password').addEventListener('keydown', e => {
  // Guard: don't fire a second request while a countdown is in progress
  if (e.key === 'Enter' && !document.getElementById('btn-login').disabled) handleLogin();
});
document.getElementById('login-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-password').focus();
});

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.remove('visible');

  if (!email) {
    errEl.textContent = 'Vul je e-mailadres in.';
    errEl.classList.add('visible');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.querySelector('span').textContent = 'Inloggen...';
  btn.classList.add('loading');
  btn.disabled = true;

  try {
    const authResp = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const authData = await authResp.json();

    // 503 = Airtable temporarily rate-limited. Auto-retry with countdown so the
    // user never has to click INLOGGEN again and can't accidentally spam requests.
    if (authResp.status === 503) {
      let remaining = authData.retryAfter || 30;
      errEl.textContent = \`Even geduld. Opnieuw proberen in \${remaining}s...\`;
      errEl.classList.add('visible');
      const tick = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(tick);
          btn.querySelector('span').textContent = 'Inloggen...';
          btn.classList.add('loading');
          handleLogin();
        } else {
          errEl.textContent = \`Even geduld. Opnieuw proberen in \${remaining}s...\`;
        }
      }, 1000);
      return; // btn stays disabled during countdown
    }

    if (!authResp.ok) {
      errEl.textContent = authData.error || 'Inloggen mislukt.';
      errEl.classList.add('visible');
      btn.querySelector('span').textContent = 'Inloggen';
      btn.classList.remove('loading');
      btn.disabled = false;
      return;
    }
    saveSession(authData.apiKey, authData.clientName, authData.projectCode, email);
    state.clientName = authData.clientName || email.split('@')[0];
    state.leads      = [];
    state.stats      = {};
    state.lastFetch  = 0;

    // Login is geslaagd — toon dashboard ONMIDDELLIJK. Leads worden async
    // geladen in startDashboard(skipRefresh=false) → refreshData(). Vroeger
    // wachtten we tot fetchLeads klaar was (kon 1–10s extra zijn op trage
    // Airtable). Spinner blijft dus alleen tijdens auth zelf (~0.5s).
    await startDashboard();
  } catch (err) {
    errEl.textContent = 'Verbindingsfout. Probeer opnieuw.';
    errEl.classList.add('visible');
    btn.querySelector('span').textContent = 'Inloggen';
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/* ============================================================
   PIPELINE (KANBAN)
   ============================================================ */
let _searchActiveIndex = -1;

function _highlightMatch(text, q) {
  if (!q || !text) return escHtml(text || '');
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return escHtml(text);
  return escHtml(text.slice(0, idx)) + \`<mark>\${escHtml(text.slice(idx, idx + q.length))}</mark>\` + escHtml(text.slice(idx + q.length));
}

function openSearch() {
  const overlay = document.getElementById('search-overlay');
  if (!overlay) return;
  _searchActiveIndex = -1;
  overlay.classList.add('open');
  document.getElementById('search-footer')?.style && (document.getElementById('search-footer').style.display = 'none');
  setTimeout(() => {
    const inp = document.getElementById('search-modal-input');
    if (inp) { inp.focus(); inp.select(); }
  }, 40);
}

function closeSearch() {
  const overlay = document.getElementById('search-overlay');
  if (overlay) overlay.classList.remove('open');
  const inp = document.getElementById('search-modal-input');
  if (inp) inp.value = '';
  const resultsEl = document.getElementById('search-results');
  if (resultsEl) resultsEl.innerHTML = \`<div class="search-hint"><div class="search-hint-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div class="search-hint-text">Begin met typen om leads te zoeken</div><div class="search-hint-shortcuts"><span class="search-hint-shortcut"><kbd>↑↓</kbd> navigeren</span><span class="search-hint-shortcut"><kbd>↵</kbd> openen</span><span class="search-hint-shortcut"><kbd>Esc</kbd> sluiten</span></div></div>\`;
  const footer = document.getElementById('search-footer');
  if (footer) footer.style.display = 'none';
  _searchActiveIndex = -1;
}

function _searchOpenLead(leadId) {
  closeSearch();
  const lead = state.leads.find(x => String(x.id) === String(leadId));
  if (!lead) return;
  navigateTo('dashboard');
  setTimeout(() => openPanel(lead), 120);
}

function _searchUpdateActive() {
  const items = document.querySelectorAll('#search-results .search-result-item');
  items.forEach((el, i) => {
    el.classList.toggle('active', i === _searchActiveIndex);
    if (i === _searchActiveIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function runGlobalSearch() {
  const q = (document.getElementById('search-modal-input')?.value || '').trim();
  const resultsEl = document.getElementById('search-results');
  const footer = document.getElementById('search-footer');
  const countEl = document.getElementById('search-footer-count');
  if (!resultsEl) return;
  _searchActiveIndex = -1;

  if (!q) {
    resultsEl.innerHTML = \`<div class="search-hint"><div class="search-hint-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div class="search-hint-text">Begin met typen om leads te zoeken</div><div class="search-hint-shortcuts"><span class="search-hint-shortcut"><kbd>↑↓</kbd> navigeren</span><span class="search-hint-shortcut"><kbd>↵</kbd> openen</span><span class="search-hint-shortcut"><kbd>Esc</kbd> sluiten</span></div></div>\`;
    if (footer) footer.style.display = 'none';
    return;
  }

  const ql = q.toLowerCase();
  const matches = (state.leads || []).filter(l =>
    (l.naam || '').toLowerCase().includes(ql) ||
    (l.telefoon || '').toLowerCase().includes(ql) ||
    (l.bron || '').toLowerCase().includes(ql) ||
    (l.samenvatting || '').toLowerCase().includes(ql) ||
    (l.status || '').toLowerCase().includes(ql)
  ).slice(0, 12);

  if (matches.length === 0) {
    resultsEl.innerHTML = \`<div class="search-no-results"><div class="search-no-results-icon"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg></div><div>Geen leads gevonden voor "<strong>\${escHtml(q)}</strong>"</div></div>\`;
    if (footer) footer.style.display = 'none';
    return;
  }

  const html = [\`<div class="search-section-label">Leads (\${matches.length})</div>\`];
  matches.forEach((l, i) => {
    const name = l.naam || 'Onbekend';
    const initials = name.split(' ').filter(Boolean).map(w=>w[0]).join('').slice(0,2).toUpperCase() || 'HV';
    const score = l.leadScore !== null && l.leadScore !== undefined ? l.leadScore : '';
    const phonePart = l.telefoon ? \`\${l.telefoon}\` : '';
    const bronPart = l.bron ? \`· \${l.bron}\` : '';
    const datePart = l.datum ? \`· \${new Date(l.datum).toLocaleDateString('nl-NL',{day:'numeric',month:'short'})}\` : '';
    const meta = [phonePart, bronPart, datePart].filter(Boolean).join(' ');
    const isQualified = l.qualified === true || l.qualified === 'true' || l.qualified === 1;
    const hasAppointment = l.afspraakGeboekt === true || l.afspraakGeboekt === 'true' || l.afspraakGeboekt === 1;
    const namePart = _highlightMatch(name, ql !== q ? q : ql);
    const idStr = escHtml(String(l.id));
    html.push(\`<div class="search-result-item" data-lead-id="\${idStr}" onclick="_searchOpenLead('\${idStr}')">
      <div class="search-result-avatar">\${escHtml(initials)}</div>
      <div class="search-result-body">
        <div class="search-result-name">\${namePart}</div>
        <div class="search-result-meta">\${escHtml(meta)}</div>
      </div>
      <div class="search-result-tags">
        \${isQualified ? \`<span class="search-result-badge qualified">Qualified</span>\` : ''}
        \${hasAppointment ? \`<span class="search-result-badge">Afspraak</span>\` : ''}
        \${score !== '' ? \`<span class="search-result-score">\${score}</span>\` : ''}
      </div>
    </div>\`);
  });

  resultsEl.innerHTML = html.join('');
  if (footer) {
    footer.style.display = 'flex';
    if (countEl) countEl.textContent = matches.length + ' resultaat' + (matches.length !== 1 ? 'en' : '');
  }
}

let _pipelineDragId = null;

function pipelineDragStart(event, leadId) {
  _pipelineDragId = String(leadId);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(leadId));
}

const PIPELINE_STAGE_LABELS = { new: 'Nieuw', qualified: 'Gekwalificeerd', afspraak: 'Afspraak', won: 'Gewonnen', lost: 'Verloren' };

// Derives which pipeline column a lead currently renders in. Mirrors the
// column filters in renderPipeline() below, ordered most-specific-first so
// it matches actual render output even on legacy/inconsistent data (e.g. a
// lead with opgepikt=true always renders under "won" regardless of the
// other booleans, because the qualified/afspraak filters both require
// !opgepikt). Used to no-op a drop onto the column a card is already in,
// and to decide what to roll back to if the PATCH fails.
function pipelineStageOf(lead) {
  if (!lead) return 'new';
  if (lead.opgepikt === true) return 'won';
  if (lead.afspraakGeboekt === true) return 'afspraak';
  if (lead.qualified === true) return 'qualified';
  if (lead.qualified === false && lead.status === 'completed') return 'lost';
  return 'new';
}

// Mirrors the field write-set api/leads.js applies server-side for each
// pipelineStage value (see the PATCH handler's "Pipeline stage transition"
// block) so the optimistic UI update renders the card in the same column
// the server will confirm.
function applyPipelineStageLocally(lead, stage) {
  switch (stage) {
    case 'qualified':
      lead.qualified = true; lead.afspraakGeboekt = false; lead.opgepikt = false;
      break;
    case 'afspraak':
      lead.qualified = true; lead.afspraakGeboekt = true; lead.opgepikt = false;
      break;
    case 'won':
      lead.qualified = true; lead.afspraakGeboekt = true; lead.opgepikt = true;
      break;
    case 'lost':
      lead.qualified = false; lead.afspraakGeboekt = false; lead.opgepikt = false;
      lead.status = 'completed';
      break;
    case 'new':
    default:
      lead.qualified = false; lead.afspraakGeboekt = false; lead.opgepikt = false;
      if (lead.status === 'completed') lead.status = 'in_progress';
      break;
  }
}

async function patchPipelineStage(id, stage) {
  const resp = await fetch(\`\${API_BASE}/leads?id=\${encodeURIComponent(id)}\`, {
    method: 'PATCH',
    headers: { 'x-api-key': state.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipelineStage: stage })
  });
  if (!resp.ok) throw new Error(\`Pipeline fase opslaan mislukt: \${resp.status}\`);
  return resp.json();
}

async function pipelineDrop(event, newStage) {
  event.preventDefault();
  document.querySelectorAll('.pipeline-col').forEach(c => c.classList.remove('drag-over'));
  const leadId = _pipelineDragId || event.dataTransfer.getData('text/plain');
  if (!leadId) return;
  _pipelineDragId = null;

  const lead = state.leads.find(l => String(l.id) === String(leadId));
  if (!lead || pipelineStageOf(lead) === newStage) return;

  // Snapshot so a failed PATCH can be rolled back exactly.
  const prev = { qualified: lead.qualified, afspraakGeboekt: lead.afspraakGeboekt, opgepikt: lead.opgepikt, status: lead.status };

  // Optimistic update, using the same write-set the server will apply.
  applyPipelineStageLocally(lead, newStage);
  renderPipeline();

  // Persist. The success toast only fires once the server confirms — showing
  // it immediately (the previous behavior) meant a failed save still showed
  // "success" followed by an error toast, which is worse than no optimistic
  // feedback. On failure, roll the card back to its previous column.
  try {
    await patchPipelineStage(lead.id, newStage);
    toast('Lead verplaatst naar ' + (PIPELINE_STAGE_LABELS[newStage] || newStage), 'success');
  } catch (e) {
    Object.assign(lead, prev);
    renderPipeline();
    toast('Kon lead niet verplaatsen', 'error');
  }
}

function renderPipeline() {
  const board = document.getElementById('pipeline-board');
  if (!board) return;

  const leads = state.leads;
  const cols = [
    {
      id: 'new',
      label: 'Nieuw',
      cls: 'col-new',
      leads: leads.filter(l => !l.qualified && !l.afspraakGeboekt && !l.opgepikt && !(l.qualified === false && l.status === 'completed'))
    },
    {
      id: 'qualified',
      label: 'Gekwalificeerd',
      cls: 'col-qual',
      leads: leads.filter(l => l.qualified === true && !l.afspraakGeboekt && !l.opgepikt)
    },
    {
      id: 'afspraak',
      label: 'Afspraak',
      cls: 'col-apt',
      leads: leads.filter(l => l.afspraakGeboekt === true && !l.opgepikt)
    },
    {
      id: 'won',
      label: 'Gewonnen',
      cls: 'col-won',
      leads: leads.filter(l => l.opgepikt === true)
    },
    {
      id: 'lost',
      label: 'Verloren',
      cls: 'col-lost',
      leads: leads.filter(l => l.qualified === false && l.status === 'completed')
    }
  ];

  board.innerHTML = cols.map(col => {
    const cards = col.leads.map(l => {
      const sc = l.leadScore || 0;
      const scCls = sc >= 8 ? 'score-green' : sc >= 5 ? 'score-orange' : sc > 0 ? 'score-red' : 'score-gray';
      const dateStr = l.datum ? new Date(l.datum).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) : '';
      return \`<div class="pipeline-card" draggable="true" ondragstart="pipelineDragStart(event,'\${escJs(String(l.id))}')" onclick="(function(){var lead=state.leads.find(x=>String(x.id)==='\${escJs(String(l.id))}');if(lead)openPanel(lead);})()">
        <div class="pipeline-card-name">\${escHtml(l.naam) || '—'}</div>
        <div class="pipeline-card-meta">
          \${sc > 0 ? \`<span class="pipeline-score \${scCls}">\${sc}</span>\` : ''}
          \${l.bron ? \`<span class="badge badge-bron" style="font-size:10px">\${escHtml(l.bron)}</span>\` : ''}
          <span class="pipeline-card-date">\${dateStr}</span>
        </div>
        \${l.telefoon ? \`<div class="pipeline-card-phone">\${escHtml(l.telefoon)}</div>\` : ''}
      </div>\`;
    }).join('');

    return \`<div class="pipeline-col" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="pipelineDrop(event,'\${col.id}')">
      <div class="pipeline-col-header \${col.cls}">
        \${col.label}
        <span class="pipeline-col-count">\${col.leads.length}</span>
      </div>
      <div class="pipeline-col-body">\${cards || \`<div style="color:var(--text-muted);font-size:12px;padding:8px 4px">Geen leads</div>\`}</div>
    </div>\`;
  }).join('');

  // Summary chips
  const summaryEl = document.getElementById('pipeline-summary');
  if (summaryEl) {
    const colNames = ['Nieuw', 'Gekwalificeerd', 'Afspraak', 'Gewonnen', 'Verloren'];
    const colCounts = {};
    cols.forEach(c => { colCounts[c.label] = c.leads.length; });
    const total = (state.leads || []).length;
    // Pipeline deal value: sum verwachteWaarde of non-verloren leads
    const pipelineValue = (state.leads || [])
      .filter(l => l.status !== 'verloren')
      .reduce((sum, l) => sum + parseDealValue(l.verwachteWaarde), 0);
    const valueFormatted = pipelineValue > 0
      ? '€' + pipelineValue.toLocaleString('nl-NL', { maximumFractionDigits: 0 })
      : null;
    summaryEl.innerHTML = \`<div class="pipeline-chip"><span>Totaal</span><span class="pipeline-chip-count">\${total}</span></div>\`
      + colNames.map(c => \`<div class="pipeline-chip"><span>\${c}</span><span class="pipeline-chip-count">\${colCounts[c] || 0}</span></div>\`).join('')
      + (valueFormatted ? \`<div class="pipeline-chip"><span>Pipeline waarde</span><span class="pipeline-chip-count" style="color:var(--green)">\${valueFormatted}</span></div>\` : '');
  }
}

/* ============================================================
   GESPREKKEN (CONVERSATIONS)
   ============================================================ */
function renderGesprekken() {
  const listBody = document.getElementById('conv-list-body');
  if (!listBody) return;

  // Field name is 'gesprek' — that is what api/leads.js actually returns
  // (see its lead mapper, which sets gesprek from 'Conversation History').
  // This used to read l.conversatieGeschiedenis, a property nothing has
  // ever set, so the filter rejected every lead and the whole Gesprekken
  // page read "Geen gesprekken gevonden" in production, while the exact
  // same data rendered fine in the lead detail panel (already on .gesprek).
  const withConvs = state.leads.filter(l => {
    if (!l.gesprek) return false;
    try { const p = JSON.parse(l.gesprek); return Array.isArray(p) && p.length > 0; }
    catch { return false; }
  }).sort((a, b) => new Date(b.datum || 0) - new Date(a.datum || 0));

  if (withConvs.length === 0) {
    listBody.innerHTML = \`<div style="padding:20px;color:var(--text-muted);font-size:13px">Geen gesprekken gevonden</div>\`;
    return;
  }

  listBody.innerHTML = withConvs.map(l => {
    let preview = '';
    try {
      const msgs = JSON.parse(l.gesprek);
      const last = msgs[msgs.length - 1];
      preview = last ? (last.content || '').slice(0, 50) + ((last.content || '').length > 50 ? '...' : '') : '';
    } catch {}
    const dateStr = l.datum ? new Date(l.datum).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) : '';
    return \`<div class="conv-list-item" id="conv-item-\${escHtml(String(l.id))}" onclick="openConversation('\${escJs(String(l.id))}')" >
      <div class="conv-list-item-name">
        <span>\${escHtml(l.naam) || '—'}</span>
        <span class="conv-list-item-date">\${dateStr}</span>
      </div>
      <div class="conv-list-item-preview">\${escHtml(preview)}</div>
    </div>\`;
  }).join('');
}

function openConversation(leadId) {
  const lead = state.leads.find(l => String(l.id) === String(leadId));
  if (!lead) return;

  // Mark active
  document.querySelectorAll('.conv-list-item').forEach(el => el.classList.remove('active'));
  const activeItem = document.getElementById(\`conv-item-\${leadId}\`);
  if (activeItem) activeItem.classList.add('active');

  const detail = document.getElementById('conv-detail');
  if (!detail) return;

  let msgs = [];
  try { msgs = JSON.parse(lead.gesprek || '[]'); } catch {}

  const bubbles = msgs.map(m => {
    const isUser = m.role === 'user';
    const label = isUser ? 'Lead' : 'AI';
    const content = (m.content || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\\n/g,'<br>');
    return \`<div>
      <div class="conv-bubble-label">\${label}</div>
      <div class="conv-bubble \${isUser ? 'user' : 'assistant'}" dir="auto">\${content}</div>
    </div>\`;
  }).join('');

  const scoreNum = lead.leadScore || 0;
  const scCls = scoreNum >= 8 ? 'score-green' : scoreNum >= 5 ? 'score-orange' : scoreNum > 0 ? 'score-red' : 'score-gray';

  detail.innerHTML = \`
    <div class="conv-header">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      \${escHtml(lead.naam) || '—'}
      \${scoreNum > 0 ? \`<span class="score-pill \${scCls}" style="margin-left:auto">\${scoreNum}</span>\` : ''}
    </div>
    <div class="conv-messages">\${bubbles || \`<div class="conv-empty"><div class="conv-empty-icon"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div><div>Geen berichten</div></div>\`}</div>
  \`;

  // Scroll to bottom
  const msgs_el = detail.querySelector('.conv-messages');
  if (msgs_el) setTimeout(() => { msgs_el.scrollTop = msgs_el.scrollHeight; }, 50);
}

/* ============================================================
   HELPER: PARSE DEAL VALUE
   ============================================================ */
function parseDealValue(v) {
  if (!v) return 0;
  let s = String(v).replace(/[€\\s]/g, '');
  // Belgian/Dutch number format: '.' = thousands separator, ',' = decimal
  // separator (e.g. "€ 2.750,00" = 2750). If a comma is present, any '.'
  // before it is a thousands separator and gets stripped; the comma then
  // becomes the decimal point. If there's no comma, treat all '.' as
  // thousands separators too (e.g. "1.500" = 1500, not 1.5) — this format
  // never uses '.' as a decimal point.
  s = s.includes(',') ? s.replace(/\\.(?=.*,)/g, '').replace(',', '.') : s.replace(/\\./g, '');
  return parseFloat(s) || 0;
}

/* ============================================================
   HELPER: LEAD AGE
   ============================================================ */
function leadAgeDays(lead) {
  if (!lead.datum) return 0;
  return Math.floor((Date.now() - new Date(lead.datum).getTime()) / 86400000);
}
function leadAgeClass(days) {
  if (days < 1) return 'fresh';
  if (days <= 3) return 'warm';
  if (days <= 7) return 'cooling';
  return 'cold';
}

/* ============================================================
   FEATURE 5: REVENUE GOAL
   ============================================================ */
function renderRevenueGoal() {
  const goal = parseFloat(localStorage.getItem('helvaro_revenue_goal') || '5000') || 5000;
  const current = (state.leads || []).reduce((sum, l) => {
    if (l.qualified || l.afspraakGeboekt) sum += parseDealValue(l.verwachteWaarde);
    return sum;
  }, 0);
  const pct = Math.min(100, Math.round(current / goal * 100));
  const fmt = v => '€' + new Intl.NumberFormat('nl-NL').format(Math.round(v));

  const el = document.getElementById('revenue-goal-current');
  const tgt = document.getElementById('revenue-goal-target');
  const bar = document.getElementById('revenue-goal-bar');
  const pctEl = document.getElementById('revenue-goal-pct');
  if (el) el.textContent = fmt(current);
  if (tgt) tgt.textContent = fmt(goal);
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct >= 100
      ? 'var(--success)'
      : pct >= 50
        ? 'var(--accent)'
        : 'var(--warning)';
  }
  if (pctEl) pctEl.textContent = pct + '% van doel bereikt';
}

(function setupRevenueGoalEdit() {
  const editBtn = document.getElementById('revenue-goal-edit');
  if (!editBtn) return;
  editBtn.addEventListener('click', function() {
    const current = parseFloat(localStorage.getItem('helvaro_revenue_goal') || '5000') || 5000;
    const input = prompt('Nieuw omzetdoel (€):', current);
    if (input === null) return;
    const val = parseFloat(input.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val > 0) {
      localStorage.setItem('helvaro_revenue_goal', String(val));
      renderRevenueGoal();
    }
  });
})();

/* ============================================================
   ANALYSE (ANALYTICS)
   ============================================================ */
function renderAnalyse() {
  const leads = state.leads;

  // Revenue & Afspraak Analytics
  (function() {
    const fmt = v => '€' + new Intl.NumberFormat('nl-NL').format(Math.round(v));

    // Gesloten omzet: sum from afspraak.gesloten for leads that showed up
    let geslotenOmzet = 0;
    let verschenenCount = 0;
    let noShowCount = 0;
    const bookedLeads = leads.filter(l => l.afspraakGeboekt);
    bookedLeads.forEach(l => {
      const nd = parseNotities(l);
      if (nd.afspraak) {
        if (nd.afspraak.verschenen === true) {
          verschenenCount++;
          geslotenOmzet += parseDealValue(nd.afspraak.gesloten || l.verwachteWaarde);
        } else if (nd.afspraak.verschenen === false) {
          noShowCount++;
        }
      }
    });

    // Fallback: if no attendance tracked yet, use qualified/booked deal values
    const trackedTotal = verschenenCount + noShowCount;
    const omzetEl = document.getElementById('analyse-omzet-val');
    if (omzetEl) omzetEl.textContent = fmt(geslotenOmzet);

    // Show-up rate
    const showupEl = document.getElementById('analyse-showup-val');
    const showupSubEl = document.getElementById('analyse-showup-sub');
    if (showupEl) {
      if (trackedTotal === 0) {
        showupEl.textContent = '—';
        showupEl.style.color = 'var(--text-muted)';
        if (showupSubEl) showupSubEl.textContent = 'nog geen bijgehouden';
      } else {
        const rate = Math.round(verschenenCount / trackedTotal * 100);
        showupEl.textContent = rate + '%';
        showupEl.style.color = rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--orange)' : 'var(--red)';
        if (showupSubEl) showupSubEl.textContent = verschenenCount + ' van ' + trackedTotal + ' geboekt';
      }
    }

    // Gem deal waarde
    const leadsMetWaarde = leads.filter(l => parseDealValue(l.verwachteWaarde) > 0);
    const gemDeal = leadsMetWaarde.length
      ? leadsMetWaarde.reduce((s, l) => s + parseDealValue(l.verwachteWaarde), 0) / leadsMetWaarde.length
      : 0;
    const gemEl = document.getElementById('analyse-gem-val');
    if (gemEl) gemEl.textContent = fmt(gemDeal);
    const gemSubEl = document.getElementById('analyse-gem-sub');
    if (gemSubEl) gemSubEl.textContent = leadsMetWaarde.length + ' deals met waarde';

    // Win rate
    const verlorenCount = leads.filter(l => l.status === 'verloren').length;
    const winRate = leads.length > 0 ? Math.round(100 - (verlorenCount / leads.length * 100)) : 100;
    const wrEl = document.getElementById('analyse-winrate-val');
    if (wrEl) {
      wrEl.textContent = winRate + '%';
      wrEl.style.color = winRate >= 70 ? 'var(--green)' : winRate >= 40 ? 'var(--orange)' : 'var(--red)';
    }

    // Verlies redenen top 3
    const redenMap = {};
    leads.filter(l => l.status === 'verloren' && l.reden).forEach(l => {
      redenMap[l.reden] = (redenMap[l.reden] || 0) + 1;
    });
    const top3 = Object.entries(redenMap).sort((a,b) => b[1]-a[1]).slice(0,3);
    const verliesEl = document.getElementById('analyse-verlies-list');
    if (verliesEl) {
      verliesEl.innerHTML = top3.length ? top3.map(([r, c]) => \`
        <div class="analyse-verlies-row">
          <span>\${escHtml(r)}</span>
          <span class="analyse-verlies-count">\${c}</span>
        </div>
      \`).join('') : '<div style="font-size:11px;color:var(--text-muted)">Geen verliesdata</div>';
    }

    // Update funnel with verschenen step
    const funnelBooked = bookedLeads.length;
    const funnelVerschenen = verschenenCount;
    const total = leads.length;
  })();

  // Funnel. Includes verschenen step
  const total = leads.length;
  const qualified = leads.filter(l => l.qualified).length;
  const booked = leads.filter(l => l.afspraakGeboekt).length;
  const won = leads.filter(l => l.opgepikt).length;
  // Count verschenen from notities
  const verschenenFunnel = leads.filter(l => {
    if (!l.afspraakGeboekt) return false;
    try { const nd = parseNotities(l); return nd.afspraak && nd.afspraak.verschenen === true; } catch { return false; }
  }).length;

  const funnelSteps = [
    { label: 'Totaal leads',      count: total,             pct: 100 },
    { label: 'Gekwalificeerd',    count: qualified,          pct: total   ? Math.round((qualified / total) * 100) : 0 },
    { label: 'Afspraak geboekt',  count: booked,             pct: total   ? Math.round((booked    / total) * 100) : 0 },
    { label: 'Verschenen',        count: verschenenFunnel,   pct: booked  ? Math.round((verschenenFunnel / booked) * 100) : 0, note: 'van geboekt' },
    { label: 'Gewonnen',          count: won,                pct: total   ? Math.round((won / total) * 100) : 0 }
  ];

  const funnelEl = document.getElementById('funnel-content');
  if (funnelEl) {
    funnelEl.innerHTML = funnelSteps.map(s => \`
      <div class="funnel-step">
        <div class="funnel-step-label">
          <span>\${s.label} <strong>\${s.count}</strong>\${s.note ? \`<span style="font-size:10px;color:var(--text-muted);margin-left:4px">(\${s.note})</span>\` : ''}</span>
          <span class="funnel-step-pct">\${s.pct}%</span>
        </div>
        <div class="funnel-bar"><div class="funnel-bar-fill" style="width:\${s.pct}%"></div></div>
      </div>
    \`).join('');
  }

  // Source performance table
  const sourceMap = {};
  leads.forEach(l => {
    const src = l.bron || 'Onbekend';
    if (!sourceMap[src]) sourceMap[src] = { total: 0, qual: 0, scores: [] };
    sourceMap[src].total++;
    if (l.qualified) sourceMap[src].qual++;
    if (l.leadScore) sourceMap[src].scores.push(l.leadScore);
  });

  const sourceEl = document.getElementById('source-table-wrap');
  if (sourceEl) {
    const rows = Object.entries(sourceMap).sort((a,b) => b[1].total - a[1].total).map(([src, d]) => {
      const conv = d.total ? Math.round((d.qual / d.total) * 100) : 0;
      const avg = d.scores.length ? (d.scores.reduce((a,b) => a+b, 0) / d.scores.length).toFixed(1) : '—';
      return \`<tr>
        <td>\${escHtml(src)}</td>
        <td style="text-align:center">\${d.total}</td>
        <td style="text-align:center">\${d.qual}</td>
        <td style="text-align:center">\${conv}%</td>
        <td style="text-align:center">\${avg}</td>
      </tr>\`;
    }).join('');
    sourceEl.innerHTML = \`<table class="source-table">
      <thead><tr>
        <th>Bron</th><th>Totaal</th><th>Gekwal.</th><th>Conversie</th><th>Gem. Score</th>
      </tr></thead>
      <tbody>\${rows || \`<tr><td colspan="5" style="color:var(--text-muted)">Geen data</td></tr>\`}</tbody>
    </table>\`;
  }

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const gridColor = isLight ? 'rgba(201,168,94,0.06)' : 'rgba(255,255,255,0.05)';
  const tickColor = isLight ? '#5c6478' : '#6a85b0';

  // Days of week chart
  const dayCanvas = document.getElementById('analyse-days-chart');
  if (dayCanvas && typeof Chart !== 'undefined') {
    const dayLabels = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
    const dayCounts = [0,0,0,0,0,0,0];
    leads.forEach(l => {
      if (!l.datum) return;
      const d = new Date(l.datum);
      if (isNaN(d)) return;
      const dow = (d.getDay() + 6) % 7; // 0=Mon
      dayCounts[dow]++;
    });
    if (state.analyseDaysChart) state.analyseDaysChart.destroy();
    state.analyseDaysChart = new Chart(dayCanvas, {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [{ label: 'Leads', data: dayCounts, backgroundColor: 'rgba(232,215,177,0.45)', borderColor: '#E8D7B1', borderWidth: 1, borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, beginAtZero: true } }
      }
    });
  }

  // Score distribution chart
  const scoreCanvas = document.getElementById('analyse-score-chart');
  if (scoreCanvas && typeof Chart !== 'undefined') {
    const scoreLabels = ['1','2','3','4','5','6','7','8','9','10'];
    const scoreCounts = [0,0,0,0,0,0,0,0,0,0];
    leads.forEach(l => { if (l.leadScore && l.leadScore >= 1 && l.leadScore <= 10) scoreCounts[l.leadScore - 1]++; });
    const scoreColors = scoreLabels.map((_, i) => i >= 7 ? 'rgba(34,197,94,0.5)' : i >= 4 ? 'rgba(232,135,30,0.5)' : 'rgba(220,38,38,0.45)');
    if (state.analyseScoreChart) state.analyseScoreChart.destroy();
    state.analyseScoreChart = new Chart(scoreCanvas, {
      type: 'bar',
      data: {
        labels: scoreLabels,
        datasets: [{ label: 'Leads', data: scoreCounts, backgroundColor: scoreColors, borderRadius: 5 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, beginAtZero: true } }
      }
    });
  }

  // Hours chart
  const hoursCanvas = document.getElementById('analyse-hours-chart');
  if (hoursCanvas && typeof Chart !== 'undefined') {
    const hourBuckets = ['0-4u','4-8u','8-12u','12-16u','16-20u','20-24u'];
    const hourCounts = [0,0,0,0,0,0];
    leads.forEach(l => {
      if (!l.datum) return;
      const d = new Date(l.datum);
      if (isNaN(d)) return;
      const bucket = Math.min(Math.floor(d.getHours() / 4), 5);
      hourCounts[bucket]++;
    });
    if (state.analyseHoursChart) state.analyseHoursChart.destroy();
    state.analyseHoursChart = new Chart(hoursCanvas, {
      type: 'bar',
      data: {
        labels: hourBuckets,
        datasets: [{ label: 'Leads', data: hourCounts, backgroundColor: 'rgba(232,215,177,0.4)', borderColor: '#E8D7B1', borderWidth: 1, borderRadius: 6 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } },
        scales: { x: { grid: { color: gridColor }, ticks: { color: tickColor } }, y: { grid: { color: gridColor }, ticks: { color: tickColor, stepSize: 1 }, beginAtZero: true } }
      }
    });
  }

  // Avg response time
  const rtEl = document.getElementById('analyse-response-val');
  if (rtEl) {
    // reactietijd, not responseTime — api/leads.js maps 'Response Time (sec)'
    // to reactietijd. Reading responseTime gave NaN for every lead, which the
    // >0 filter then dropped, so this tile showed "—" forever even though the
    // dashboard's own stat card computed the same average correctly.
    const rts = leads.map(l => Number(l.reactietijd)).filter(n => n > 0);
    const avg = rts.length ? Math.round(rts.reduce((a,b) => a+b, 0) / rts.length) : 0;
    if (avg > 3600) {
      rtEl.textContent = (avg / 3600).toFixed(1) + 'u';
      const lbl = document.querySelector('#analyse-response-wrap .analyse-stat-label');
      if (lbl) lbl.textContent = 'uur gemiddeld';
    } else if (avg > 0) {
      rtEl.textContent = avg;
    } else {
      rtEl.textContent = '—';
    }
  }

  // Conversion summary mini-rows
  const convSummary = document.getElementById('analyse-conv-summary');
  if (convSummary && leads.length > 0) {
    const total   = leads.length;
    const qual    = leads.filter(l => l.qualified).length;
    const booked  = leads.filter(l => l.afspraakGeboekt).length;
    const won     = leads.filter(l => l.status === 'completed' && l.qualified).length;
    const items   = [
      { label: 'Gekwalificeerd', val: qual,   pct: Math.round(qual/total*100),   color: 'var(--info)' },
      { label: 'Afspraak',       val: booked, pct: Math.round(booked/total*100), color: 'var(--success)' },
      { label: 'Gewonnen',       val: won,    pct: Math.round(won/total*100),    color: 'var(--accent)' },
    ];
    convSummary.innerHTML = items.map(it => \`
      <div style="display:flex;align-items:center;gap:8px;font-size:12px">
        <span style="color:var(--text-muted);flex:1">\${it.label}</span>
        <div style="flex:2;background:var(--bg-card-alt);border-radius:4px;height:6px;overflow:hidden">
          <div style="width:\${it.pct}%;height:100%;background:\${it.color};border-radius:4px;transition:width 0.4s"></div>
        </div>
        <span style="font-weight:700;color:var(--text);min-width:28px;text-align:right">\${it.val}</span>
      </div>\`).join('');
  }
}

function exportPDF() {
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    toast('PDF bibliotheek nog niet geladen, probeer opnieuw', 'error');
    return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const leads = state.leads || [];
  const qualified = leads.filter(l => l.qualified);
  const total = leads.length;
  const now = new Date().toLocaleDateString('nl-NL', { day:'2-digit', month:'long', year:'numeric' });
  const clientName = state.clientName || 'Client';

  // Header
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, 210, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Helvaro. Lead Rapport', 14, 12);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(clientName + ' · ' + now, 14, 20);

  // Stats row
  doc.setTextColor(30, 30, 40);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  let y = 38;
  const stats = [
    { label: 'Totaal leads', val: total },
    { label: 'Gekwalificeerd', val: qualified.length },
    { label: 'Afspraken', val: leads.filter(l=>l.afspraakGeboekt).length },
    { label: 'Conversie', val: total ? Math.round(qualified.length/total*100)+'%' : '0%' },
  ];
  stats.forEach((st, i) => {
    const x = 14 + i * 46;
    doc.setFillColor(245, 246, 255);
    doc.roundedRect(x, y, 44, 18, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica','bold');
    doc.setTextColor(79,70,229);
    doc.text(String(st.val), x + 22, y + 10, { align:'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica','normal');
    doc.setTextColor(100,100,120);
    doc.text(st.label, x + 22, y + 15, { align:'center' });
  });

  // Qualified leads table
  y = 68;
  doc.setFontSize(12);
  doc.setFont('helvetica','bold');
  doc.setTextColor(30,30,40);
  doc.text('Gekwalificeerde Leads', 14, y);
  y += 6;

  // Table header
  doc.setFillColor(79,70,229);
  doc.rect(14, y, 182, 7, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(8);
  doc.setFont('helvetica','bold');
  doc.text('Naam', 16, y+5);
  doc.text('Telefoon', 66, y+5);
  doc.text('Bron', 106, y+5);
  doc.text('Score', 146, y+5);
  doc.text('Datum', 166, y+5);
  y += 7;

  qualified.slice(0, 25).forEach((l, i) => {
    if (y > 270) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(248,248,252); doc.rect(14, y, 182, 7, 'F'); }
    doc.setTextColor(30,30,40);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    const naam = (l.naam || '—').slice(0,28);
    const tel  = (l.telefoon || '—').slice(0,18);
    const bron = (l.bron || '—').slice(0,18);
    const sc   = String(l.leadScore || '—');
    const dat  = l.datum ? new Date(l.datum).toLocaleDateString('nl-NL',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—';
    doc.text(naam, 16, y+5);
    doc.text(tel,  66, y+5);
    doc.text(bron, 106, y+5);
    doc.setFont('helvetica','bold');
    doc.setTextColor(79,70,229);
    doc.text(sc, 152, y+5, { align:'center' });
    doc.setFont('helvetica','normal');
    doc.setTextColor(30,30,40);
    doc.text(dat, 166, y+5);
    y += 7;
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150,150,160);
  doc.text('Gegenereerd door Helvaro · ${SUPPORT_EMAIL_ATTR}', 14, 287);

  doc.save('helvaro-rapport-' + new Date().toISOString().slice(0,10) + '.pdf');
  toast('PDF gedownload', 'success');
}

/* ============================================================
   EXPORTS
   ============================================================ */
function updateExportPreview() {
  const periodVal = document.getElementById('export-period')?.value || '30';
  const period = parseInt(periodVal);
  const statusFilter = document.getElementById('export-status')?.value || 'all';
  const leads = state.leads || [];
  const cutoff = periodVal === 'all' || isNaN(period) ? null : new Date(Date.now() - period * 86400000);

  const filtered = leads.filter(l => {
    if (cutoff) {
      const created = l.datum ? new Date(l.datum) : null;
      if (!created || created < cutoff) return false;
    }
    const isQual = l.qualified === true || l.leadScore >= 7;
    if (statusFilter === 'qualified')   return isQual;
    if (statusFilter === 'unqualified') return !isQual;
    return true;
  });

  const countEl = document.getElementById('export-count-num');
  if (countEl) countEl.textContent = filtered.length;

  const total     = filtered.length;
  const qualified = filtered.filter(l => l.qualified === true || l.leadScore >= 7).length;
  const rate      = total > 0 ? Math.round(qualified / total * 100) : 0;
  const scores    = filtered.map(l => l.leadScore).filter(s => typeof s === 'number');
  const avgScore  = scores.length > 0 ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1) : '—';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('snap-total',     total);
  set('snap-qualified', qualified);
  set('snap-rate',      rate + '%');
  set('snap-avg-score', avgScore);
}

/* ============================================================
   INSTELLINGEN (SETTINGS)
   ============================================================ */
// ── AI Persoonlijkheid page ─────────────────────────────────────────────────
const AP_STATE = { loaded: false, saving: false };

// Pre-built welkomstbericht templates. Clients click to inspire/apply.
// Each item: { emoji, label, sub (1-line tone), text (with placeholders) }
const AP_TEMPLATES = [
  {
    emoji: '', label: 'Vriendelijk',
    text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor je interesse. Wat bracht je naar ons?'
  },
  {
    emoji: '', label: 'Professioneel',
    text: 'Goeiedag {naam}, dit is {ai} van {bedrijf}. Bedankt voor uw aanvraag. Mag ik u enkele korte vragen stellen om u beter te kunnen helpen?'
  },
  {
    emoji: '', label: 'Kort & krachtig',
    text: 'Hey {naam}! {ai} hier. Heb je 2 minuten voor 3 snelle vragen?'
  },
  {
    emoji: '', label: 'Vraaggericht',
    text: 'Hey {naam}! Ik zag je interesse in {bedrijf} via {bron}. Waar mag ik je het beste mee helpen vandaag?'
  },
  {
    emoji: '', label: 'Voor renovatie/bouw',
    text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor je aanvraag. Om je goed te kunnen helpen: kan je kort vertellen wat het project is en wanneer je het wil starten?'
  },
  {
    emoji: '', label: 'Voor zorg/medisch',
    text: 'Goeiedag {naam}, dit is {ai} van {bedrijf}. We helpen u graag verder. Voor welke behandeling of vraag heeft u contact opgenomen?'
  },
  {
    emoji: '', label: 'Voor vastgoed',
    text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor uw interesse. Bent u op zoek naar een woning, of wil u er één verkopen?'
  },
  {
    emoji: '', label: 'Voor advocaten',
    text: 'Goeiedag {naam}, met {ai} van {bedrijf}. Bedankt voor uw contactopname. Kan u in een paar zinnen schetsen waarover u advies zoekt?'
  },
  {
    emoji: '', label: 'Vertrouwen + sociaal',
    text: 'Hey {naam}! {ai} hier van {bedrijf}. Leuk dat je ons gevonden hebt. We hielpen deze maand al 12 klanten met hetzelfde. Wat is jouw situatie?'
  },
  {
    emoji: '', label: 'Direct kwalificeren',
    text: 'Hallo {naam}, met {ai} van {bedrijf}. Voor we verder gaan: heb je al een budget in gedachten en wanneer wil je beginnen?'
  },
  {
    emoji: '', label: 'Voor autohandel',
    text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor je interesse. Welke wagen had je in gedachten. En zoek je benzine, diesel, hybride of elektrisch?'
  },
  {
    emoji: '', label: 'Voor garage/onderhoud',
    text: 'Goeiedag {naam}, dit is {ai} van {bedrijf}. Wat is er aan de hand met de wagen, en welk merk/model is het? Dan plannen we snel iets in.'
  },
  {
    emoji: '', label: 'Voor carrosserie',
    text: 'Hey {naam}! {ai} van {bedrijf}. Bedankt voor je bericht. Wat is er gebeurd met de wagen, en gaat het via de verzekering of betaal je zelf?'
  }
];

// AI Instructions starter snippets. Clients click one or more to APPEND to
// their instructions (combinable, unlike welcome which replaces).
const AP_INSTRUCTION_SNIPPETS = [
  {
    emoji: '', label: 'Praat informeel',
    text: 'Praat informeel met "je/jij". geen "u". Houd zinnen kort en gebruik geen jargon.'
  },
  {
    emoji: '', label: 'Praat formeel',
    text: 'Praat in u-vorm. Wees beleefd, zakelijk en gestructureerd in elk antwoord.'
  },
  {
    emoji: '', label: 'Geen prijzen via WhatsApp',
    text: 'Stuur NOOIT exacte prijzen of offertes via WhatsApp. Verwijs altijd door naar een telefoongesprek of demo voor pricing.'
  },
  {
    emoji: '', label: 'Vraag altijd 3 dingen',
    text: 'Vraag in elk gesprek expliciet naar: (1) het project of de behoefte, (2) de timing/urgentie, (3) het budget. Stel maximaal één vraag per bericht.'
  },
  {
    emoji: '', label: 'Sluit altijd af met een actie',
    text: 'Sluit ELK gesprek af met een concrete vervolgactie: een afspraak voorstellen, een offerte beloven, of een terugbeltijd vragen.'
  },
  {
    emoji: '', label: 'Diskwalificeer snel',
    text: 'Als het duidelijk geen fit is (geen budget, geen interesse, verkeerde regio), wees vriendelijk maar stop het gesprek snel. Geen tijd verspillen.'
  },
  {
    emoji: '', label: 'Auto: vraag merk + model',
    text: 'Vraag altijd naar (1) merk en model van de wagen, (2) bouwjaar of kilometerstand, (3) brandstof (benzine/diesel/hybride/elektrisch). Deze 3 dingen heb je nodig vóór elk vervolg.'
  },
  {
    emoji: '', label: 'Auto: financiering & inruil',
    text: 'Vraag actief of de lead financiering nodig heeft (lening/leasing) en of er een wagen ter inruil is. Geef nooit zelf prijzen. Verwijs naar showroom of telefoongesprek.'
  },
  {
    emoji: '', label: 'Auto: keuring & onderhoud',
    text: 'Bij onderhoud/garage-vragen: vraag naar (1) symptomen of foutmelding, (2) wanneer het probleem begon, (3) laatste keuring of grote beurt. Stel afspraak binnen 1 week voor.'
  }
];

// ── AI Photo file picker ──────────────────────────────────────────────────────
// Klant kiest een lokale PNG/JPG/WebP → canvas resize naar 256x256 (center-crop) →
// JPEG quality 0.85 → base64 data URL → opgeslagen in het bestaande ap-photo veld.
// Resultaat: ~25-50 KB, past makkelijk in Airtable cell limit + form-page HTML.
const AP_PHOTO_MAX_SIZE = 256;       // px (avatar is 84-200px max, 256 = retina-safe)
const AP_PHOTO_MAX_BYTES = 200 * 1024;  // matches the server-side cap

function setPhotoPreview(dataUrlOrHttps) {
  const prev   = document.getElementById('ap-photo-preview');
  const remove = document.getElementById('ap-photo-remove');
  const hidden = document.getElementById('ap-photo');
  if (!prev) return;
  if (dataUrlOrHttps) {
    prev.innerHTML = '<img src="' + dataUrlOrHttps.replace(/"/g, '&quot;') + '" alt="AI foto">';
    prev.classList.add('has-photo');
    if (remove) remove.style.display = '';
    if (hidden) hidden.value = dataUrlOrHttps;
  } else {
    prev.innerHTML = '<span class="ap-photo-placeholder">+</span>';
    prev.classList.remove('has-photo');
    if (remove) remove.style.display = 'none';
    if (hidden) hidden.value = '';
  }
}

function handlePhotoFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\\/(png|jpe?g|webp)$/i.test(file.type)) {
    toast('Alleen PNG, JPG of WebP toegestaan', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('Bestand te groot (max 8 MB). kies een kleinere foto', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Center-crop to a square, then scale down to AP_PHOTO_MAX_SIZE
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width  - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        const target = Math.min(AP_PHOTO_MAX_SIZE, minSide);
        const canvas = document.createElement('canvas');
        canvas.width  = target;
        canvas.height = target;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, target, target);
        // Try JPEG quality 0.85 first; bump down if too big
        let dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        if (dataUrl.length > AP_PHOTO_MAX_BYTES) dataUrl = canvas.toDataURL('image/jpeg', 0.70);
        if (dataUrl.length > AP_PHOTO_MAX_BYTES) dataUrl = canvas.toDataURL('image/jpeg', 0.55);
        if (dataUrl.length > AP_PHOTO_MAX_BYTES) { toast('Foto te complex om te comprimeren. Kies een kleinere', 'error'); return; }
        setPhotoPreview(dataUrl);
        const urlField = document.getElementById('ap-photo-url');
        if (urlField) urlField.value = '';  // file wins over external URL
        toast('Foto klaar. Vergeet niet op te slaan', 'success');
      } catch (err) {
        console.error(err);
        toast('Kon de foto niet verwerken', 'error');
      }
    };
    img.onerror = () => toast('Kon de foto niet laden', 'error');
    img.src = e.target.result;
  };
  reader.onerror = () => toast('Bestand kon niet gelezen worden', 'error');
  reader.readAsDataURL(file);
}

function handlePhotoUrlInput(input) {
  const v = (input.value || '').trim();
  if (v && /^https:\\/\\//.test(v)) {
    setPhotoPreview(v);
  } else if (!v) {
    setPhotoPreview('');
  }
}

function removePhoto() {
  setPhotoPreview('');
  const file    = document.getElementById('ap-photo-file');
  const urlField = document.getElementById('ap-photo-url');
  if (file) file.value = '';
  if (urlField) urlField.value = '';
}

// Localized work-hours preset examples. Adapt to the client's chosen lead language.
// IMPORTANT: any of these (NL ma/di/wo/do/vr/za/zo, FR lun/mar/mer/jeu/ven/sam/dim,
// EN mon/tue/wed/thu/fri/sat/sun) is parsed correctly by the backend.
const AP_HOURS_PRESETS = {
  nl: { placeholder: 'ma-vr 9-18', chips: ['ma-vr 9-18', 'ma-za 8-20', 'di-za 10-18'] },
  fr: { placeholder: 'lun-ven 9-18', chips: ['lun-ven 9-18', 'lun-sam 8-20', 'mar-sam 10-18'] },
  en: { placeholder: 'mon-fri 9-18', chips: ['mon-fri 9-18', 'mon-sat 8-20', 'tue-sat 10-18'] }
};

// Klant wist 'Geleerde patronen' veld. Volgende maandag wordt 't opnieuw
// gegenereerd. Reset niet direct opgeslagen — klant moet nog op Opslaan klikken.
function clearLearnedPatterns() {
  const ta = document.getElementById('ap-learned');
  if (ta) ta.value = '';
  toast('Wijziging geladen — klik Opslaan om te bevestigen', 'info');
}

/* ============================================================
   AI-BEELD PAGE (Phase 4 — AI property visualisation images)
   ============================================================
   Backed by api/leads.js modes property-styles / property-list /
   property-generate -> api/_images.js. Every image record returned or
   rendered here carries a mandatory aiLabel (api/_images.js's
   buildImageRecord() — never omittable server-side) which this page
   ALWAYS shows as a visible caption, never just alt-text (EU AI Act
   Art. 50(4), see _images.js's file header). */
let piStyles = [];
let piStylesLoaded = false;
let piUploadDataUrl = '';
let piSelectedStyle = '';
let piRoomTypes = [];
let piSelectedRoomType = ''; // '' = "Automatisch" (no room-type fragment — AI infers from the photo)
let piGalleryList = [];      // last-rendered gallery, kept for the download/toggle button handlers
let piLastResult = null;     // { image, sourceDataUrl } of the most recently generated result — for download/PDF

// ── Visual-controls axes (all optional, "Automatisch" = '' default) except
// renovation depth, which defaults to the honest 'light' choice — see
// api/_images.js's RENOVATION_DEPTHS header for why that one isn't a silent
// "let the AI decide". Lists load from the SAME 'property-styles' response
// as piStyles/piRoomTypes above (one round trip, see loadPiStyles()). ─────
let piFurnitureLevels = [];
let piSelectedFurniture = '';
let piWallFinishes = [];
let piSelectedWallFinish = '';
let piWallColors = [];
let piSelectedWallColor = '';
let piFloorTypes = [];
let piSelectedFloor = '';
let piLightingMoods = [];
let piSelectedLighting = '';
let piRenovationDepths = [];
let piSelectedRenovationDepth = 'light';

async function loadAiBeeldPage() {
  if (!state.apiKey) return;
  if (!piStylesLoaded) {
    piStylesLoaded = true;
    loadPiStyles();
  }
  // Gallery can change between visits (another tab/device generated one) —
  // always refresh, no "loaded once" gate needed for a single cheap read.
  loadPiGallery();
}

async function loadPiStyles() {
  const grid = document.getElementById('pi-style-grid');
  const roomGrid = document.getElementById('pi-roomtype-grid');
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'property-styles' })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (grid) grid.innerHTML = '<div class="pi-empty" style="grid-column:1/-1">Stijlen laden mislukt</div>';
      if (roomGrid) roomGrid.innerHTML = '';
      return;
    }
    piStyles = Array.isArray(d.styles) ? d.styles : [];
    piRoomTypes = Array.isArray(d.roomTypes) ? d.roomTypes : [];
    piFurnitureLevels = Array.isArray(d.furnitureLevels) ? d.furnitureLevels : [];
    piWallFinishes = Array.isArray(d.wallFinishes) ? d.wallFinishes : [];
    piWallColors = Array.isArray(d.wallColors) ? d.wallColors : [];
    piFloorTypes = Array.isArray(d.floorTypes) ? d.floorTypes : [];
    piLightingMoods = Array.isArray(d.lightingMoods) ? d.lightingMoods : [];
    piRenovationDepths = Array.isArray(d.renovationDepths) ? d.renovationDepths : [];
    if (d.defaultRenovationDepth) piSelectedRenovationDepth = d.defaultRenovationDepth;
    if (!piStyles.length) {
      if (grid) grid.innerHTML = '<div class="pi-empty" style="grid-column:1/-1">Geen stijlen beschikbaar</div>';
    } else {
      if (!piSelectedStyle) piSelectedStyle = piStyles[0].key;
      renderPiStyleGrid();
    }
    renderPiRoomTypeGrid();
    renderPiFurnitureGrid();
    renderPiWallFinishGrid();
    renderPiWallColorGrid();
    renderPiFloorGrid();
    renderPiLightingGrid();
    renderPiRenovationGrid();
  } catch (err) {
    if (grid) grid.innerHTML = '<div class="pi-empty" style="grid-column:1/-1">Netwerkfout</div>';
    if (roomGrid) roomGrid.innerHTML = '<div class="pi-empty" style="grid-column:1/-1">Netwerkfout</div>';
  }
}

function renderPiStyleGrid() {
  const grid = document.getElementById('pi-style-grid');
  if (!grid) return;
  grid.innerHTML = piStyles.map(s =>
    '<button type="button" class="pi-style-card' + (s.key === piSelectedStyle ? ' active' : '') +
    '" onclick="selectPiStyle(this)" data-key="' + escHtml(s.key) + '">' + escHtml(s.label) + '</button>'
  ).join('');
}

function selectPiStyle(el) {
  piSelectedStyle = el.getAttribute('data-key') || '';
  renderPiStyleGrid();
  // The "staging" style's whole purpose is furnishing an empty room — an
  // explicit "Leeg" furniture pick would directly contradict it (see
  // api/_images.js's buildTransformPrompt() contradiction-handling comment,
  // which mirrors this same guard server-side as defense in depth). Rather
  // than let a client create that nonsense combination, the furniture grid
  // disables "Leeg" while staging is active and resets the selection if it
  // was already chosen.
  if (piSelectedStyle === 'staging' && piSelectedFurniture === 'empty') {
    piSelectedFurniture = '';
    toast('"Leeg" is niet te combineren met de stijl "Lege ruimte inrichten" — teruggezet op automatisch', 'info');
  }
  renderPiFurnitureGrid();
}

// Room-type chips — an "Automatisch" chip (key '') is always first and is
// the default selection, so nobody is forced to pick a room type to
// generate an image (matches the pre-existing, still-supported behaviour).
function renderPiRoomTypeGrid() {
  const grid = document.getElementById('pi-roomtype-grid');
  if (!grid) return;
  const items = [{ key: '', label: 'Automatisch' }].concat(piRoomTypes);
  grid.innerHTML = items.map(r =>
    '<button type="button" class="pi-roomtype-card' + (r.key === piSelectedRoomType ? ' active' : '') +
    '" onclick="selectPiRoomType(this)" data-key="' + escHtml(r.key) + '">' + escHtml(r.label) + '</button>'
  ).join('');
}

function selectPiRoomType(el) {
  piSelectedRoomType = el.getAttribute('data-key') || '';
  renderPiRoomTypeGrid();
}

// ── Furniture amount — same chip pattern as room type, reuses the
// .pi-roomtype-grid/.pi-roomtype-card classes (identical visual language,
// no reason for a parallel CSS block). "Leeg" is disabled while the active
// style is "staging" — see selectPiStyle()'s contradiction-guard comment. */
function renderPiFurnitureGrid() {
  const grid = document.getElementById('pi-furniture-grid');
  if (!grid) return;
  const items = [{ key: '', label: 'Automatisch' }].concat(piFurnitureLevels);
  grid.innerHTML = items.map(f => {
    const disabled = f.key === 'empty' && piSelectedStyle === 'staging';
    return '<button type="button" class="pi-roomtype-card' + (f.key === piSelectedFurniture ? ' active' : '') + (disabled ? ' disabled' : '') +
      '"' + (disabled ? ' disabled title="Niet te combineren met de stijl Lege ruimte inrichten"' : ' onclick="selectPiFurniture(this)"') +
      ' data-key="' + escHtml(f.key) + '">' + escHtml(f.label) + '</button>';
  }).join('');
}

function selectPiFurniture(el) {
  piSelectedFurniture = el.getAttribute('data-key') || '';
  renderPiFurnitureGrid();
}

// ── Wall finish — the colour swatch sub-picker only appears once
// "Geschilderd" is chosen (colour is meaningless for wallpaper/brick/
// plaster). Toggling away from "Geschilderd" clears any chosen colour/note
// so a stale, inapplicable choice never lingers into the next generation. */
function renderPiWallFinishGrid() {
  const grid = document.getElementById('pi-wallfinish-grid');
  if (!grid) return;
  const items = [{ key: '', label: 'Automatisch' }].concat(piWallFinishes);
  grid.innerHTML = items.map(w =>
    '<button type="button" class="pi-roomtype-card' + (w.key === piSelectedWallFinish ? ' active' : '') +
    '" onclick="selectPiWallFinish(this)" data-key="' + escHtml(w.key) + '">' + escHtml(w.label) + '</button>'
  ).join('');
  const wrap = document.getElementById('pi-wallcolor-wrap');
  if (wrap) wrap.style.display = piSelectedWallFinish === 'painted' ? '' : 'none';
}

function selectPiWallFinish(el) {
  piSelectedWallFinish = el.getAttribute('data-key') || '';
  if (piSelectedWallFinish !== 'painted') {
    piSelectedWallColor = '';
    const note = document.getElementById('pi-wallcolor-note');
    if (note) note.value = '';
  }
  renderPiWallFinishGrid();
  renderPiWallColorGrid();
}

// Curated palette, not a free colour field — see api/_images.js's
// WALL_COLORS header for why. The optional note input next to this grid is
// a short NUANCE on the chosen swatch, not a second open prompt field.
function renderPiWallColorGrid() {
  const grid = document.getElementById('pi-wallcolor-grid');
  if (!grid) return;
  const swatchHex = { white: '#FFFFFF', offwhite: '#F3EDE2', greige: '#C9C6BF', sand: '#D9C6A5', sage: '#8FA78E', navy: '#1F2A44' };
  grid.innerHTML = piWallColors.map(c =>
    '<button type="button" class="pi-color-card' + (c.key === piSelectedWallColor ? ' active' : '') +
    '" onclick="selectPiWallColor(this)" data-key="' + escHtml(c.key) + '">' +
      '<span class="pi-color-swatch-dot" style="background:' + (swatchHex[c.key] || '#999') + '"></span>' +
      escHtml(c.label) +
    '</button>'
  ).join('');
}

function selectPiWallColor(el) {
  const key = el.getAttribute('data-key') || '';
  piSelectedWallColor = (key === piSelectedWallColor) ? '' : key; // click again to deselect back to "automatisch"
  renderPiWallColorGrid();
}

// ── Floor ────────────────────────────────────────────────────────────────
function renderPiFloorGrid() {
  const grid = document.getElementById('pi-floor-grid');
  if (!grid) return;
  const items = [{ key: '', label: 'Automatisch' }].concat(piFloorTypes);
  grid.innerHTML = items.map(f =>
    '<button type="button" class="pi-roomtype-card' + (f.key === piSelectedFloor ? ' active' : '') +
    '" onclick="selectPiFloor(this)" data-key="' + escHtml(f.key) + '">' + escHtml(f.label) + '</button>'
  ).join('');
}

function selectPiFloor(el) {
  piSelectedFloor = el.getAttribute('data-key') || '';
  renderPiFloorGrid();
}

// ── Lighting / mood ──────────────────────────────────────────────────────
function renderPiLightingGrid() {
  const grid = document.getElementById('pi-lighting-grid');
  if (!grid) return;
  const items = [{ key: '', label: 'Automatisch' }].concat(piLightingMoods);
  grid.innerHTML = items.map(l =>
    '<button type="button" class="pi-roomtype-card' + (l.key === piSelectedLighting ? ' active' : '') +
    '" onclick="selectPiLighting(this)" data-key="' + escHtml(l.key) + '">' + escHtml(l.label) + '</button>'
  ).join('');
}

function selectPiLighting(el) {
  piSelectedLighting = el.getAttribute('data-key') || '';
  renderPiLightingGrid();
}

// ── Renovation depth — NOT an "Automatisch" axis (see api/_images.js's
// RENOVATION_DEPTHS header): it always has one of the two real values
// selected, defaulting to the honest "Lichte opfrisbeurt". The honesty note
// only appears once "Volledige renovatie" is deliberately chosen. ────────
function renderPiRenovationGrid() {
  const grid = document.getElementById('pi-renovation-grid');
  if (!grid) return;
  grid.innerHTML = piRenovationDepths.map(r =>
    '<button type="button" class="pi-roomtype-card' + (r.key === piSelectedRenovationDepth ? ' active' : '') +
    '" onclick="selectPiRenovation(this)" data-key="' + escHtml(r.key) + '">' + escHtml(r.label) + '</button>'
  ).join('');
  const note = document.getElementById('pi-honesty-note');
  if (note) note.style.display = piSelectedRenovationDepth === 'full' ? '' : 'none';
}

function selectPiRenovation(el) {
  piSelectedRenovationDepth = el.getAttribute('data-key') || 'light';
  renderPiRenovationGrid();
}

// Server hard-caps the decoded upload at 3MB (api/_images.js's
// MAX_UPLOAD_BYTES — a base64 JSON body against Vercel's ~4.5MB platform
// request limit, NOT vps's multipart 10MB; see that file's comment for the
// full reasoning). A raw phone photo is routinely 3-8MB, so this downscales
// + recompresses client-side first — same canvas technique as
// handlePhotoFile() above, tuned for a much bigger target since this feeds
// an AI edit model, not a small avatar circle. Users pick any photo and
// never have to think about the limit; only pathological cases (already
// maximally compressed at target size) still fail, with a clear message.
const PI_MAX_DIMENSION = 1600;                     // px, long edge — plenty for a 1024x1024 AI edit
const PI_MAX_DATA_URL_LENGTH = 3 * 1024 * 1024 * 4 / 3; // ~4MB base64 text ≈ server's 3MB decoded cap, with margin

function handlePiFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!/^image\\/(png|jpe?g|webp)$/i.test(file.type)) { toast('Alleen PNG, JPG of WebP toegestaan', 'error'); return; }
  if (file.size > 30 * 1024 * 1024) { toast('Bestand te groot om te verwerken. Kies een kleinere foto', 'error'); return; }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, PI_MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        let dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        if (dataUrl.length > PI_MAX_DATA_URL_LENGTH) dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        if (dataUrl.length > PI_MAX_DATA_URL_LENGTH) dataUrl = canvas.toDataURL('image/jpeg', 0.60);
        if (dataUrl.length > PI_MAX_DATA_URL_LENGTH) { toast('Foto te complex om te verwerken. Kies een eenvoudigere of kleinere foto', 'error'); return; }
        piUploadDataUrl = dataUrl;
        renderPiDropzone();
      } catch (err) {
        console.error(err);
        toast('Kon de foto niet verwerken', 'error');
      }
    };
    img.onerror = () => toast('Kon de foto niet laden', 'error');
    img.src = e.target.result;
  };
  reader.onerror = () => toast('Bestand kon niet gelezen worden', 'error');
  reader.readAsDataURL(file);
}

function renderPiDropzone() {
  const zone = document.getElementById('pi-dropzone');
  const removeBtn = document.getElementById('pi-remove-btn');
  if (!zone) return;
  if (piUploadDataUrl) {
    zone.classList.add('has-image');
    zone.innerHTML = '<img src="' + piUploadDataUrl.replace(/"/g, '&quot;') + '" alt="Geüploade foto">';
    if (removeBtn) removeBtn.style.display = '';
  } else {
    zone.classList.remove('has-image');
    zone.innerHTML = '<div class="pi-dropzone-placeholder" id="pi-dropzone-placeholder"><div style="font-size:26px;line-height:1">+</div><div><b>Klik om een foto te kiezen</b><br>of sleep een bestand hierheen</div></div>';
    if (removeBtn) removeBtn.style.display = 'none';
  }
}

function removePiUpload(evt) {
  if (evt) evt.stopPropagation();
  piUploadDataUrl = '';
  const fileInput = document.getElementById('pi-file-input');
  if (fileInput) fileInput.value = '';
  renderPiDropzone();
}

async function loadPiGallery() {
  const wrap = document.getElementById('pi-gallery');
  if (!wrap) return;
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'property-list' })
    });
    if (!r.ok) { wrap.innerHTML = '<div class="pi-empty">Kon galerij niet laden</div>'; return; }
    const d = await r.json().catch(() => ({}));
    renderPiGallery(Array.isArray(d.images) ? d.images : []);
  } catch (err) {
    wrap.innerHTML = '<div class="pi-empty">Netwerkfout</div>';
  }
}

// Rewritten as plain string concatenation (no template-literal interpolation)
// rather than the previous backtick block — this whole page is itself one
// giant JS template literal server-side (see api/dashboard.js's top-level
// \`const HTML = \\\`...\\\`\`), so every backtick/\${} used INSIDE this inline
// <script> has to be escaped there; concatenation sidesteps that class of
// bug entirely for the parts touched here.
function renderPiGallery(list) {
  const wrap = document.getElementById('pi-gallery');
  if (!wrap) return;
  piGalleryList = list;
  if (!list.length) { wrap.innerHTML = '<div class="pi-empty">Nog geen AI-beelden gegenereerd</div>'; return; }
  const cards = list.map(function (img, i) {
    // Older records (persisted before the visual-controls axes existed)
    // simply have no furniture/wallFinish/floor/lighting/renovationDepth*
    // fields — filter(Boolean) below degrades those gracefully to just
    // style + room type, same as before this feature.
    const metaBits = [
      img.styleLabel || img.style, img.roomTypeLabel, img.furnitureLabel, img.wallFinishLabel,
      img.floorLabel, img.lightingLabel, img.renovationDepthLabel,
    ].filter(Boolean);
    const meta = metaBits.length ? metaBits.join(' · ') : 'Aangepast';
    const safeAfter = (img.url || '').replace(/"/g, '&quot;');
    const safeBefore = (img.sourceUrl || '').replace(/"/g, '&quot;');
    // Older records (persisted before this feature) have no sourceUrl —
    // hide the voor/na toggle for those rather than offering a broken one.
    const toggleBtn = img.sourceUrl
      ? '<button type="button" class="pi-gallery-toggle" onclick="togglePiGalleryImage(' + i + ')" id="pi-gallery-toggle-' + i + '">Bekijk voor</button>'
      : '<span></span>';
    return '<div class="pi-gallery-item">' +
        '<img src="' + safeAfter + '" alt="AI-gegenereerde visualisatie" id="pi-gallery-img-' + i + '" ' +
          'data-after="' + safeAfter + '" data-before="' + safeBefore + '" data-showing="after">' +
        '<div class="pi-gallery-item-body">' +
          '<div class="pi-gallery-item-style">' + escHtml(meta) + '</div>' +
          '<div class="pi-ai-badge">⚠ ' + escHtml(img.aiLabel || '') + '</div>' +
          '<div class="pi-gallery-item-actions">' + toggleBtn +
            '<button type="button" class="pi-gallery-toggle" onclick="downloadPiGalleryImage(' + i + ')">Download</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }).join('');
  wrap.innerHTML = '<div class="pi-gallery-grid">' + cards + '</div>';
}

function togglePiGalleryImage(i) {
  const el = document.getElementById('pi-gallery-img-' + i);
  const btn = document.getElementById('pi-gallery-toggle-' + i);
  if (!el) return;
  const showingAfter = el.getAttribute('data-showing') === 'after';
  el.src = showingAfter ? el.getAttribute('data-before') : el.getAttribute('data-after');
  el.setAttribute('data-showing', showingAfter ? 'before' : 'after');
  if (btn) btn.textContent = showingAfter ? 'Bekijk na (AI)' : 'Bekijk voor';
}

function downloadPiGalleryImage(i) {
  const img = piGalleryList[i];
  if (!img || !img.url) { toast('Afbeelding niet gevonden', 'error'); return; }
  downloadImageUrl(img.url, piFilename(img, 'ai-beeld'));
}

async function generatePiImage() {
  const btn = document.getElementById('pi-generate-btn');
  if (!btn) return;
  if (!piUploadDataUrl) { toast('Upload eerst een foto', 'error'); return; }
  if (!piSelectedStyle) { toast('Kies een stijl', 'error'); return; }

  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite;vertical-align:-2px;margin-right:6px"><circle cx="12" cy="12" r="10" stroke-dasharray="40 60"/></svg>AI genereert (kan tot een minuut duren)...';

  // Kept OUTSIDE the try so it survives into the catch/finally scope below —
  // needed so a failed request doesn't leave piLastResult pointing at a
  // half-updated state (it simply stays whatever it was before this call).
  const sourceDataUrlAtRequestTime = piUploadDataUrl;

  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({
        mode:             'property-generate',
        dataUrl:          piUploadDataUrl,
        style:            piSelectedStyle,
        roomType:         piSelectedRoomType,
        furniture:        piSelectedFurniture,
        wallFinish:       piSelectedWallFinish,
        wallColor:        piSelectedWallColor,
        wallColorNote:    (document.getElementById('pi-wallcolor-note') || {}).value || '',
        floor:            piSelectedFloor,
        lighting:         piSelectedLighting,
        renovationDepth:  piSelectedRenovationDepth,
        customPrompt: (document.getElementById('pi-custom-prompt') || {}).value || ''
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (d.error === 'credit_limit_reached') {
        toast(d.message || 'Je AI-credits voor deze periode zijn op', 'error');
      } else {
        toast(d.error || 'AI-beeldgeneratie mislukt', 'error');
      }
      return;
    }
    const img = d.image;
    if (!img || !img.url) { toast('AI gaf geen beeld terug', 'error'); return; }

    piLastResult = { image: img, sourceDataUrl: sourceDataUrlAtRequestTime };

    const resultWrap  = document.getElementById('pi-result-wrap');
    const resultLabel = document.getElementById('pi-result-label');
    if (resultWrap) resultWrap.style.display = '';
    renderPiCompare(sourceDataUrlAtRequestTime, img.url);
    if (resultLabel) resultLabel.textContent = img.aiLabel || '';

    toast('AI-beeld gegenereerd', 'success');
    loadPiGallery();
  } catch (err) {
    toast('Netwerkfout. Probeer opnieuw', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// ── Before/after comparison slider ──────────────────────────────────────
// A single native <input type=range> overlays the whole image (see the
// .pi-compare-range CSS — full-bleed, opacity:0) so drag, click-anywhere,
// touch AND keyboard arrows all work for free via the browser's own range
// input; this function just mirrors its value onto the "after" image's
// clip-path and the decorative handle line. No hand-rolled pointer/touch
// event math, nothing to get subtly wrong across devices.
function updatePiCompare(value) {
  const after  = document.getElementById('pi-compare-after');
  const handle = document.getElementById('pi-compare-handle');
  if (after)  after.style.clipPath = 'inset(0 0 0 ' + value + '%)';
  if (handle) handle.style.left = value + '%';
}

function renderPiCompare(beforeUrl, afterUrl) {
  const before = document.getElementById('pi-compare-before');
  const after  = document.getElementById('pi-compare-after');
  const range  = document.getElementById('pi-compare-range');
  if (before) before.src = beforeUrl || '';
  if (after)  after.src  = afterUrl || '';
  if (range)  range.value = 50;
  updatePiCompare(50);
}

// ── Download / share ─────────────────────────────────────────────────────
// A sensible, greppable filename beats the browser's default random blob
// name when an agent drops this straight into a listing folder.
function piFilename(img, prefix) {
  const stamp = (img && img.createdAt ? img.createdAt : new Date().toISOString()).slice(0, 10);
  const bits = [prefix, img && img.style, img && img.roomType, stamp].filter(Boolean);
  return 'helvaro-' + bits.join('-').toLowerCase().replace(/[^a-z0-9-]+/g, '-') + '.png';
}

// Fetch + blob + object URL, NOT a plain <a href> — the image lives on a
// different origin (Vercel Blob), so a bare download attribute is silently
// ignored by browsers cross-origin; this makes "Download" actually save the
// file instead of just opening it. Falls back to opening a tab so the user
// can always still save manually — never a dead end (matches this feature's
// existing fail-soft posture).
async function downloadImageUrl(url, filename) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename || 'helvaro-ai-beeld.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(objUrl); }, 4000);
  } catch (err) {
    window.open(url, '_blank');
    toast('Automatisch downloaden lukte niet — afbeelding geopend in een nieuw tabblad', 'info');
  }
}

function downloadPiResult() {
  if (!piLastResult || !piLastResult.image || !piLastResult.image.url) { toast('Geen AI-beeld om te downloaden', 'error'); return; }
  downloadImageUrl(piLastResult.image.url, piFilename(piLastResult.image, 'ai-beeld'));
}

// data: URL -> {jsPDF format string}. Client uploads are always re-encoded
// as JPEG by handlePiFile() above and generated results are always PNG (see
// api/_images.js's generatePropertyImage()), so this only ever needs to
// disambiguate those two in practice — kept generic rather than hardcoded
// so it stays correct if either side's encoding ever changes.
function dataUrlFormat(dataUrl) {
  const m = /^data:image\\/(png|jpe?g|webp)/i.exec(dataUrl || '');
  if (!m) return 'PNG';
  const t = m[1].toLowerCase();
  return t === 'png' ? 'PNG' : (t === 'webp' ? 'WEBP' : 'JPEG');
}

function urlToDataURL(url) {
  return fetch(url)
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
    .then(function (blob) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () { resolve(reader.result); };
        reader.onerror = function () { reject(new Error('read failed')); };
        reader.readAsDataURL(blob);
      });
    });
}

// One-page before/after PDF sheet, ready to drop into a listing. Reuses the
// jsPDF UMD build already loaded for exportPDF() above, but with the actual
// Sand/enterprise-dark brand palette (DESIGN-SYSTEM.md) rather than that
// older report's purple header. The AI disclaimer is rendered as its own
// filled, always-visible banner — never a caption so small it could be
// missed — matching the same "never buried" rule as the on-screen badge.
async function downloadPiComparePDF() {
  if (!piLastResult || !piLastResult.image || !piLastResult.image.url) { toast('Geen AI-beeld om te exporteren', 'error'); return; }
  if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
    toast('PDF bibliotheek nog niet geladen, probeer opnieuw', 'error');
    return;
  }
  const img = piLastResult.image;
  const beforeDataUrl = piLastResult.sourceDataUrl;
  if (!beforeDataUrl) {
    toast('Originele foto niet meer beschikbaar voor vergelijking. Download het AI-beeld apart.', 'error');
    return;
  }

  let afterDataUrl;
  try {
    afterDataUrl = await urlToDataURL(img.url);
  } catch (err) {
    toast('Kon het AI-beeld niet inladen voor de PDF. Download de afbeelding apart.', 'error');
    return;
  }

  try {
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const clientName = state.clientName || 'Client';
    const now = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.setFillColor(18, 18, 18);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setTextColor(232, 215, 177);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Helvaro. AI Vastgoedbeeld', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(249, 249, 249);
    doc.text(clientName + ' · ' + now, 14, 19);

    let y = 36;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 30, 30);
    doc.text('Voor', 14, y);
    doc.text('Na (AI-visualisatie)', 110, y);
    y += 4;

    doc.addImage(beforeDataUrl, dataUrlFormat(beforeDataUrl), 14, y, 88, 88, undefined, 'FAST');
    doc.addImage(afterDataUrl, dataUrlFormat(afterDataUrl), 110, y, 88, 88, undefined, 'FAST');
    y += 94;

    doc.setFillColor(232, 135, 30);
    doc.roundedRect(14, y, 182, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const label = img.aiLabel || 'AI-visualisatie — werkelijke staat van de woning kan afwijken';
    doc.text(doc.splitTextToSize('⚠ ' + label, 176), 17, y + 5);
    y += 20;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const meta = [];
    if (img.styleLabel) meta.push('Stijl: ' + img.styleLabel);
    if (img.roomTypeLabel) meta.push('Ruimte: ' + img.roomTypeLabel);
    if (meta.length) doc.text(meta.join('   ·   '), 14, y);

    doc.save('helvaro-vergelijking-' + (img.style || 'ai-beeld') + '-' + new Date().toISOString().slice(0, 10) + '.pdf');
  } catch (err) {
    console.error('[downloadPiComparePDF]', err);
    toast('PDF maken is mislukt. Download de afbeeldingen apart.', 'error');
  }
}

// Drag & drop onto the dropzone (click-to-upload already wired via the
// input's onclick in the HTML; this only adds the drag path on top).
document.addEventListener('DOMContentLoaded', () => {
  const zone = document.getElementById('pi-dropzone');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(evt => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(evt => zone.addEventListener(evt, (e) => { e.preventDefault(); zone.classList.remove('dragover'); }));
  zone.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    const fileInput = document.getElementById('pi-file-input');
    if (fileInput) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      handlePiFile(fileInput);
    }
  });
});

// Renders the language <select> from the server-injected AP_LANGUAGES
// registry (native names, see api/_lang.js). Idempotent — safe to call once.
function renderApLangSelect() {
  const sel = document.getElementById('ap-lang-select');
  if (!sel || sel.options.length) return;
  sel.innerHTML = AP_LANGUAGES.map(l =>
    '<option value="' + l.code + '">' + escHtml(l.native) + (l.native !== l.english ? ' (' + escHtml(l.english) + ')' : '') + '</option>'
  ).join('');
}

function syncHoursLocaleUI() {
  const sel = document.getElementById('ap-lang-select');
  const lang = (sel && sel.value) || 'nl';
  // Working-hours day-abbreviation parsing (whatsapp.js's isWithinWorkingHours)
  // only recognizes Dutch/French/English day codes today — every other
  // language falls back to the English preset ('mon-fri' etc, which always
  // parses correctly regardless of the client's own conversation language).
  const preset = AP_HOURS_PRESETS[lang] || AP_HOURS_PRESETS.en;
  const input = document.getElementById('ap-hours');
  if (input) input.setAttribute('placeholder', preset.placeholder);
  const fmt = document.getElementById('ap-hours-format-list');
  if (fmt) fmt.innerHTML = preset.chips.map(c => '<code>' + c + '</code>').join(', ');
  const chips = document.getElementById('ap-hours-chips');
  if (chips) {
    chips.innerHTML = preset.chips.map(c =>
      '<button type="button" class="ap-chip" onclick="document.getElementById(\\'ap-hours\\').value=\\'' + c + '\\'">' + c + '</button>'
    ).join(' ');
  }
}

// Show/hide the callback-window input + de juiste hint, op basis van radio keuze.
// In-chat = AI vraagt + boekt direct in WhatsApp (geen callback window nodig).
// Callback = collega belt terug binnen X tijd (callback window veld zichtbaar).
function syncBookingMethodUI() {
  const callbackChecked = document.getElementById('ap-booking-callback')?.checked;
  const wrap   = document.getElementById('ap-callback-window-wrap');
  const hintCh = document.getElementById('ap-booking-hint-in_chat');
  const hintCb = document.getElementById('ap-booking-hint-callback');
  if (wrap)   wrap.style.display   = callbackChecked ? '' : 'none';
  if (hintCh) hintCh.style.display = callbackChecked ? 'none' : '';
  if (hintCb) hintCb.style.display = callbackChecked ? '' : 'none';
}

function renderApInstructionSnippets() {
  const wrap = document.getElementById('ap-instr-grid');
  if (!wrap) return;
  wrap.innerHTML = AP_INSTRUCTION_SNIPPETS.map((s, i) => {
    return '<button type="button" class="ap-tpl-card" onclick="appendApInstruction(' + i + ')">' +
      '<span class="ap-tpl-card-label"><span class="ap-tpl-card-emoji">' + s.emoji + '</span>' + escHtml(s.label) + '</span>' +
      '<span class="ap-tpl-card-preview">' + escHtml(s.text) + '</span>' +
    '</button>';
  }).join('');
}

function appendApInstruction(idx) {
  const s = AP_INSTRUCTION_SNIPPETS[idx];
  if (!s) return;
  const ta = document.getElementById('ap-instructions');
  if (!ta) return;
  const cur = ta.value.trim();
  // De-dup: don't add the same snippet twice
  if (cur.includes(s.text)) {
    toast('Deze regel staat er al in', 'info');
    return;
  }
  ta.value = cur ? (cur + '\\n' + s.text) : s.text;
  ta.focus();
  ta.scrollTop = ta.scrollHeight;
}

// Suggest the best welcome template based on the client's Niche.
const AP_NICHE_TO_TEMPLATE = {
  real_estate: 6,   // Voor vastgoed
  dentist:     5,   // Voor zorg/medisch
  lawyer:      7,   // Voor advocaten
  finance:     1,   // Professioneel
  // 'other' / unknown → no suggestion
};

function renderApTemplates() {
  const wrap = document.getElementById('ap-tpl-grid');
  if (!wrap) return;
  // Sort so the niche-recommended template is first if applicable
  const niche = AP_STATE.niche || '';
  const recommendedIdx = AP_NICHE_TO_TEMPLATE[niche];
  wrap.innerHTML = AP_TEMPLATES.map((t, i) => {
    const preview = t.text.replace(/\\{naam\\}/g, 'Jan').replace(/\\{bedrijf\\}/g, 'jouw bedrijf')
      .replace(/\\{ai\\}/g, 'Sara').replace(/\\{project\\}/g, '...').replace(/\\{bron\\}/g, 'website');
    const isRec = (recommendedIdx === i);
    return '<button type="button" class="ap-tpl-card' + (isRec ? ' recommended' : '') + '" data-tpl-idx="' + i + '" onclick="applyApTemplate(' + i + ')">' +
      (isRec ? '<span class="ap-tpl-card-rec">Aanbevolen voor jouw sector</span>' : '') +
      '<span class="ap-tpl-card-label"><span class="ap-tpl-card-emoji">' + t.emoji + '</span>' + escHtml(t.label) + '</span>' +
      '<span class="ap-tpl-card-preview">' + escHtml(preview) + '</span>' +
    '</button>';
  }).join('');
  highlightActiveTemplate();
}

function applyApTemplate(idx) {
  const t = AP_TEMPLATES[idx];
  if (!t) return;
  const ta = document.getElementById('ap-template');
  if (!ta) return;
  ta.value = t.text;
  ta.focus();
  highlightActiveTemplate();
  renderPersonaPreview();
}

function highlightActiveTemplate() {
  const ta = document.getElementById('ap-template');
  if (!ta) return;
  const current = ta.value.trim();
  document.querySelectorAll('#ap-tpl-grid .ap-tpl-card').forEach(card => {
    const idx = Number(card.getAttribute('data-tpl-idx'));
    const match = AP_TEMPLATES[idx] && AP_TEMPLATES[idx].text === current;
    card.classList.toggle('active', !!match);
  });
}

async function loadAiPersona() {
  // Render the instructions library (doesn't depend on server data)
  if (!AP_STATE.instrRendered) { renderApInstructionSnippets(); AP_STATE.instrRendered = true; }
  // Wire up live preview + active-template highlight once (idempotent)
  if (!AP_STATE.wired) {
    ['ap-name', 'ap-template'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { renderPersonaPreview(); if (id === 'ap-template') highlightActiveTemplate(); });
    });
    // Also re-render the welcome-checks banner as the user fills in fields
    ['ap-name', 'ap-template', 'ap-instructions', 'ap-website'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateWelcomeBannerChecks);
    });
    // Live-validate Opslaan availability
    ['ap-name', 'ap-template'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', refreshSaveButton);
    });
    // Booking-method radio toggles the callback-window field + hint visibility
    ['ap-booking-in_chat', 'ap-booking-callback'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', syncBookingMethodUI);
    });
    // Language select re-localizes the work-hours presets (chips + placeholder)
    renderApLangSelect();
    const apLangSelect = document.getElementById('ap-lang-select');
    if (apLangSelect) apLangSelect.addEventListener('change', syncHoursLocaleUI);
    // Sync color picker <-> text input
    const apColor = document.getElementById('ap-color');
    const apPick  = document.getElementById('ap-color-pick');
    if (apColor && apPick) {
      apColor.addEventListener('input', () => {
        const v = apColor.value.trim();
        if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
          apPick.value = (v.startsWith('#') ? v : '#' + v).toLowerCase();
        }
      });
      apPick.addEventListener('input', () => { apColor.value = apPick.value.toUpperCase(); });
    }
    AP_STATE.wired = true;
  }
  populateFormLink();   // builds URL + QR + embed snippet from localStorage
  // Always re-fetch. Config may have changed elsewhere
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'config-get' })
    });
    if (!r.ok) { toast('Kan instellingen niet laden', 'error'); return; }
    const d = await r.json();
    AP_STATE.clientName = d.clientName || state.clientName || 'Bedrijf';
    AP_STATE.niche      = d.sector || '';
    document.getElementById('ap-name').value         = d.aiName         || '';
    document.getElementById('ap-template').value     = d.autoReplyTpl   || '';
    document.getElementById('ap-instructions').value = d.aiInstructions || '';
    document.getElementById('ap-website').value      = d.website        || '';
    document.getElementById('ap-address').value      = d.address        || '';
    document.getElementById('ap-calendly').value     = d.calendlyLink   || '';
    document.getElementById('ap-photo').value        = d.aiPhotoUrl     || '';
    // Photo preview: show the current avatar; also fill the URL textbox when it's an external link
    setPhotoPreview(d.aiPhotoUrl || '');
    const apPhotoUrlField = document.getElementById('ap-photo-url');
    if (apPhotoUrlField) apPhotoUrlField.value = (d.aiPhotoUrl && /^https:\\/\\//.test(d.aiPhotoUrl)) ? d.aiPhotoUrl : '';
    document.getElementById('ap-hours').value        = d.workingHours   || '';
    document.getElementById('ap-badges').value       = d.trustBadges    || '';
    // Werkuren toepassen op de boeking-slots (gedeelde helper).
    applyWorkHours(d.workingHours);
    // Booking method + callback window
    // 'calendly' is deprecated. Wordt nu naar in_chat geremapped voor backwards compat.
    const apBookingVal = (d.bookingMethod === 'callback') ? 'callback' : 'in_chat';
    const apBookingRadio = document.getElementById('ap-booking-' + apBookingVal);
    if (apBookingRadio) apBookingRadio.checked = true;
    document.getElementById('ap-callback-window').value = d.callbackWindow || '';
    document.getElementById('ap-notify-phone').value    = d.notifyPhone    || '';
    document.getElementById('ap-report-email').value    = d.reportEmail    || '';
    // Learned patterns: alleen tonen als er iets te tonen valt (na eerste maandag)
    const learnedField = document.getElementById('ap-learned-field');
    const learnedTa    = document.getElementById('ap-learned');
    if (d.learnedPatterns && d.learnedPatterns.trim()) {
      if (learnedTa)    learnedTa.value = d.learnedPatterns;
      if (learnedField) learnedField.style.display = '';
    } else {
      if (learnedField) learnedField.style.display = 'none';
    }
    syncBookingMethodUI();
    renderApLangSelect();
    const apLangCodes = AP_LANGUAGES.map(l => l.code);
    const apLangVal = apLangCodes.includes(d.language) ? d.language : 'nl';
    const apLangSelectEl = document.getElementById('ap-lang-select');
    if (apLangSelectEl) apLangSelectEl.value = apLangVal;
    const apMatchLeadLangEl = document.getElementById('ap-match-lead-lang');
    if (apMatchLeadLangEl) apMatchLeadLangEl.checked = !!d.matchLeadLanguage;
    syncHoursLocaleUI(); // re-sync now the select actually holds the loaded language
    const apColor = document.getElementById('ap-color');
    const apPick  = document.getElementById('ap-color-pick');
    if (apColor) apColor.value = d.brandColor || '';
    if (apPick && /^#?[0-9a-fA-F]{6}$/.test(d.brandColor || '')) {
      apPick.value = (d.brandColor.startsWith('#') ? d.brandColor : ('#' + d.brandColor)).toLowerCase();
    }
    document.getElementById('ap-form-intro').value   = d.formIntro      || '';
    AP_STATE.loaded = true;
    // Re-render templates now that we know the niche (for the "Aanbevolen" badge)
    renderApTemplates();
    renderPersonaPreview();
    highlightActiveTemplate();
    showFirstTimeBannerIfNeeded();
    refreshSaveButton();
  } catch (err) {
    toast('Netwerkfout. Probeer later opnieuw', 'error');
  }
}

// Show the welcome banner when this is the first-time setup path
function showFirstTimeBannerIfNeeded() {
  const banner = document.getElementById('ap-welcome-banner');
  if (!banner) return;
  const pending = sessionStorage.getItem('hv-setup-pending') === '1';
  if (!pending) { banner.style.display = 'none'; return; }
  banner.style.display = 'flex';
  updateWelcomeBannerChecks();
}

function updateWelcomeBannerChecks() {
  const banner = document.getElementById('ap-welcome-banner');
  const checks = document.getElementById('ap-welcome-checks');
  if (!banner || !checks || banner.style.display === 'none') return;
  const name = document.getElementById('ap-name').value.trim();
  const tpl  = document.getElementById('ap-template').value.trim();
  const web  = document.getElementById('ap-website').value.trim();
  const instr= document.getElementById('ap-instructions').value.trim();
  const items = [
    { k: 'AI naam',          done: !!name },
    { k: 'Welkomstbericht',  done: !!tpl },
    { k: 'Website OF instructies', done: !!web || !!instr }
  ];
  checks.innerHTML = items.map(it =>
    '<span class="ap-welcome-chk' + (it.done ? ' done' : '') + '">' +
      '<span class="ap-welcome-chk-icon">' + (it.done ? '' : '○') + '</span>' +
      escHtml(it.k) +
    '</span>'
  ).join('');
  // When all 3 are done, hide the banner after save (so it disappears
  // gracefully when they hit Opslaan and re-validate)
  if (items.every(i => i.done)) {
    setTimeout(() => {
      // only hide if still all done at hide-time
      const stillDone = items.every(i => i.done);
      if (stillDone && sessionStorage.getItem('hv-setup-pending') === '1') {
        sessionStorage.removeItem('hv-setup-pending');
      }
    }, 800);
  }
}

function apInsertPlaceholder(token) {
  const ta = document.getElementById('ap-template');
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = start + token.length;
  renderPersonaPreview();
}

function renderPersonaPreview() {
  const aiName = (document.getElementById('ap-name').value.trim() || 'Mathis Willems');
  const tpl    = (document.getElementById('ap-template').value.trim() ||
                  'Hey {naam}! {ai} hier van {bedrijf}. Zag dat je je gegevens achterliet. Wat bracht je bij ons?');
  const company = AP_STATE.clientName || 'Bedrijf';
  const filled = tpl
    .replace(/\\{naam\\}/g,    'Jan')
    .replace(/\\{bedrijf\\}/g, company)
    .replace(/\\{ai\\}/g,      aiName)
    .replace(/\\{project\\}/g, 'PROJ_CODE')
    .replace(/\\{bron\\}/g,    'Website');
  document.getElementById('ap-preview-name').textContent   = aiName;
  document.getElementById('ap-preview-avatar').textContent = (aiName[0] || 'M').toUpperCase();
  document.getElementById('ap-preview-bubble').textContent = filled;
}

async function saveAiPersona() {
  if (AP_STATE.saving) return;
  AP_STATE.saving = true;
  const btn = document.getElementById('ap-save-btn');
  const mark = document.getElementById('ap-saved-mark');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Opslaan...'; }
  if (mark) mark.classList.remove('visible');
  try {
    const body = {
      mode:           'config-save',
      aiName:         document.getElementById('ap-name').value.trim(),
      autoReplyTpl:   document.getElementById('ap-template').value.trim(),
      aiInstructions: document.getElementById('ap-instructions').value.trim(),
      website:        document.getElementById('ap-website').value.trim(),
      address:        document.getElementById('ap-address').value.trim(),
      calendlyLink:   document.getElementById('ap-calendly').value.trim(),
      aiPhotoUrl:     document.getElementById('ap-photo').value.trim(),
      brandColor:     document.getElementById('ap-color').value.trim(),
      formIntro:      document.getElementById('ap-form-intro').value.trim(),
      language:       (document.getElementById('ap-lang-select') || {}).value || 'nl',
      matchLeadLanguage: !!(document.getElementById('ap-match-lead-lang') || {}).checked,
      workingHours:   document.getElementById('ap-hours').value.trim().toLowerCase(),
      trustBadges:    document.getElementById('ap-badges').value.trim(),
      bookingMethod:  (document.querySelector('input[name="ap-booking"]:checked') || {}).value || 'in_chat',
      callbackWindow: document.getElementById('ap-callback-window').value.trim(),
      notifyPhone:    document.getElementById('ap-notify-phone').value.trim(),
      reportEmail:    document.getElementById('ap-report-email').value.trim(),
      learnedPatterns: (document.getElementById('ap-learned') || {}).value || ''
    };
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast(d.message || d.error || 'Opslaan mislukt', 'error'); return; }
    // Werkuren meteen toepassen op de boeking-slots, zonder paginavernieuwing.
    applyWorkHours(body.workingHours);
    // Mark them as onboarded. Future logins skip the auto-redirect to this page,
    // regardless of which fields are still empty (their conscious choice).
    try { localStorage.setItem('hv-onboarded', '1'); } catch {}
    if (mark) {
      mark.classList.add('visible');
      setTimeout(() => mark.classList.remove('visible'), 2500);
    }
    toast('Instellingen opgeslagen. Live in elk volgend gesprek', 'success');
    // First-time setup? Show celebration screen + clear the banner.
    if (sessionStorage.getItem('hv-setup-pending') === '1') {
      sessionStorage.removeItem('hv-setup-pending');
      const banner = document.getElementById('ap-welcome-banner');
      if (banner) banner.style.display = 'none';
      showOnboardingDone();
      return;
    }
    // Returning user: just take them back to the dashboard.
    setTimeout(() => navigateTo('dashboard'), 900);
  } catch (err) {
    toast('Netwerkfout. Probeer opnieuw', 'error');
  } finally {
    AP_STATE.saving = false;
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

// ── Form link helpers ────────────────────────────────────────────────────
function getProjectCode() {
  // Read from localStorage (saved on login). Fallback to API_BASE-relative blank.
  try { return localStorage.getItem('hv-project') || ''; } catch (e) { return ''; }
}
function getFormUrl() {
  const code = getProjectCode();
  if (!code) return '';
  return 'https://app.helvaro.pro/start/' + encodeURIComponent(code);
}
// ── Formulier page ────────────────────────────────────────────────────────
function loadFormulier() {
  const url      = getFormUrl();
  const code     = getProjectCode();
  const cname    = state.clientName || code || 'Helvaro';
  const urlEl    = document.getElementById('fm-url');
  const openEl   = document.getElementById('fm-open');
  if (!urlEl) return;
  if (!url) {
    urlEl.textContent = '(geen project code beschikbaar. Log opnieuw in)';
    return;
  }
  urlEl.textContent = url;
  if (openEl) openEl.href = url;

  // Code snippets
  const widget = '<script src="https://app.helvaro.pro/form-widget.js" data-project="' + code + '" data-name="' + cname.replace(/"/g, '&quot;') + '"><\\/script>';
  const iframe = '<iframe src="' + url + '" width="100%" height="640" frameborder="0" style="border:0;border-radius:12px;max-width:560px"></iframe>';
  const setCode = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setCode('fm-code-widget', widget);
  setCode('fm-code-iframe', iframe);
  setCode('fm-code-link',   url);

  // QR code — generated locally, no data sent to a third party
  const qrDataUrl = renderQrDataUrl(url, 480, 2);
  const qrImg = document.getElementById('fm-qr-img');
  const qrDl  = document.getElementById('fm-qr-download');
  if (qrImg) qrImg.src = qrDataUrl;
  if (qrDl)  qrDl.href = qrDataUrl;

  // Iframe preview
  const preview = document.getElementById('fm-preview-iframe');
  if (preview && preview.src !== url) preview.src = url;

  // Stats from already-fetched leads
  populateFormStats();

  // Share buttons
  const shareText = encodeURIComponent('Hey! Vul je gegevens hier in dan kom ik snel bij je terug: ' + url);
  const wa  = document.getElementById('fm-share-wa');
  const em  = document.getElementById('fm-share-email');
  const sms = document.getElementById('fm-share-sms');
  const li  = document.getElementById('fm-share-linkedin');
  if (wa)  wa.href  = 'https://wa.me/?text=' + shareText;
  if (em)  em.href  = 'mailto:?subject=' + encodeURIComponent('Vul snel dit formulier in') + '&body=' + shareText;
  if (sms) sms.href = 'sms:?&body=' + shareText;
  if (li)  li.href  = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(url);
}

function populateFormStats() {
  // Read from the already-fetched leads array on state. Same data as the
  // dashboard. No new API call needed.
  const leads = (state && state.leads) || [];
  const total = leads.length;

  const now = new Date();
  const weekStart = new Date(); weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevWeekStart = new Date(); prevWeekStart.setDate(now.getDate() - 14);
  const prevWeekEnd   = new Date(); prevWeekEnd.setDate(now.getDate() - 7);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd   = monthStart;

  const cntInRange = (a, b) => leads.filter(l => {
    if (!l.datum) return false;
    const d = new Date(l.datum);
    return d >= a && d < b;
  }).length;

  const week        = cntInRange(weekStart, new Date(now.getTime() + 86400000));
  const prevWeek    = cntInRange(prevWeekStart, prevWeekEnd);
  const month       = cntInRange(monthStart, new Date(now.getTime() + 86400000));
  const prevMonth   = cntInRange(prevMonthStart, prevMonthEnd);
  const qualified   = leads.filter(l => l.qualified).length;
  const convPct     = total > 0 ? Math.round((qualified / total) * 100) : 0;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setDelta = (id, cur, prev) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'fm-stat-delta';
    if (prev === 0 && cur === 0) { el.textContent = 'Nog geen historiek'; return; }
    if (prev === 0) { el.textContent = '↑ Eerste deze periode'; el.classList.add('up'); return; }
    const diff = cur - prev;
    const pct  = Math.round((diff / prev) * 100);
    if (diff > 0)      { el.textContent = '↑ ' + Math.abs(pct) + '% vs vorige';   el.classList.add('up');  }
    else if (diff < 0) { el.textContent = '↓ ' + Math.abs(pct) + '% vs vorige';   el.classList.add('down'); }
    else               { el.textContent = '— gelijk aan vorige'; }
  };

  set('fm-stat-week',  week);
  set('fm-stat-month', month);
  set('fm-stat-total', total);
  set('fm-stat-conv',  convPct + '%');
  setDelta('fm-stat-week-delta',  week,  prevWeek);
  setDelta('fm-stat-month-delta', month, prevMonth);

  const totalSub = document.getElementById('fm-stat-total-sub');
  if (totalSub) totalSub.textContent = total === 0 ? 'Nog geen aanvragen ontvangen' : qualified + ' gekwalificeerd';
  const convSub = document.getElementById('fm-stat-conv-sub');
  if (convSub) convSub.textContent = total === 0 ? '—' : qualified + ' van ' + total;
}

// Email handoff. Opens the user's mail client with a pre-filled message to
// forward to their web developer. Includes the snippet + per-platform tips.
function fmEmailDev(kind) {
  const url   = getFormUrl();
  const code  = getProjectCode();
  const cname = state.clientName || code || 'Helvaro';
  let codeText = '';
  let subject  = '';
  let intro    = '';
  let tips     = '';

  if (kind === 'widget') {
    codeText = '<script src="https://app.helvaro.pro/form-widget.js" data-project="' + code + '" data-name="' + cname + '"><\\/script>';
    subject  = 'Helvaro lead-formulier. Drijvende WhatsApp-knop installeren';
    intro    = 'Hallo,\\n\\nWil je deze script-tag op onze website plakken? Het is een drijvende WhatsApp-knop die rechtsonder op elke pagina verschijnt. Bezoekers klikken erop en vullen het formulier in.\\n\\n';
    tips     = '\\n\\nWaar plakken: vlak vóór de afsluitende </body> tag, op alle pagina\\'s.\\n\\nWordPress: gebruik plugin "Insert Headers and Footers" → veld "Scripts in Footer".\\nShopify: theme.liquid net voor </body>.\\nWebflow: Site Settings → Custom Code → Footer Code.\\nCustom site: in de gedeelde footer/layout template.\\n\\nAls je een test wil doen voor live-zetten: vul een fake aanvraag in, dan zie ik die direct in mijn dashboard.\\n\\nBedankt!';
  } else if (kind === 'iframe') {
    codeText = '<iframe src="' + url + '" width="100%" height="640" frameborder="0" style="border:0;border-radius:12px;max-width:560px"></iframe>';
    subject  = 'Helvaro lead-formulier. Iframe embed installeren';
    intro    = 'Hallo,\\n\\nWil je deze iframe op onze website plakken? Het toont het Helvaro lead-formulier direct in de pagina (bijvoorbeeld op de Contact-pagina).\\n\\n';
    tips     = '\\n\\nWaar plakken: op de plek waar je het formulier wil tonen (Contact-sectie, landingspagina, …).\\nHoogte aanpasbaar via height="640".\\nWidth 100% past zich aan de container aan.\\n\\nAls je een test wil doen voor live-zetten: vul een fake aanvraag in, dan zie ik die direct in mijn dashboard.\\n\\nBedankt!';
  } else {
    return;
  }

  const body    = intro + codeText + tips;
  // mailto: requires URL-encoded subject + body; %0A for newlines
  const mailto  = 'mailto:?subject=' + encodeURIComponent(subject) +
                  '&body=' + encodeURIComponent(body);
  window.location.href = mailto;
}

function fmCopy(id) {
  const el = document.getElementById(id);
  if (!el || !el.value) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(el.value)
      .then(() => toast('Code gekopieerd ', 'success'))
      .catch(() => { el.select(); document.execCommand('copy'); toast('Code gekopieerd', 'success'); });
  } else {
    el.select(); document.execCommand('copy');
    toast('Code gekopieerd', 'success');
  }
}

function populateFormLink() {
  const url = getFormUrl();
  const urlEl = document.getElementById('ap-formlink-url');
  const openEl = document.getElementById('ap-formlink-open');
  const qrImg = document.getElementById('ap-formlink-qr-img');
  const embed = document.getElementById('ap-formlink-embed-code');
  if (!url) {
    if (urlEl) urlEl.textContent = '(geen project code beschikbaar. Log opnieuw in)';
    return;
  }
  if (urlEl)  urlEl.textContent = url;
  if (openEl) openEl.href       = url;
  if (qrImg)  qrImg.src         = renderQrDataUrl(url, 240, 0);
  if (embed) {
    // Simple iframe embed. Works on any HTML site
    embed.value = '<iframe src="' + url + '" width="100%" height="640" frameborder="0" style="border:0;border-radius:12px;max-width:560px"></iframe>';
  }
}
function copyFormLink() {
  const url = getFormUrl();
  if (!url) return;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url)
      .then(() => toast('Link gekopieerd ', 'success'))
      .catch(() => toast('Kopiëren mislukt. Selecteer handmatig', 'error'));
  }
}
// Disable Opslaan button when essentials are empty
function refreshSaveButton() {
  const btn  = document.getElementById('ap-save-btn');
  if (!btn) return;
  const name = (document.getElementById('ap-name').value || '').trim();
  const tpl  = (document.getElementById('ap-template').value || '').trim();
  // Require at least AI naam + welkomstbericht
  const ok = name.length > 0 && tpl.length > 0;
  btn.disabled = !ok;
  btn.title = ok ? '' : 'Vul minstens AI naam en welkomstbericht in';
}

async function sendTestMessage() {
  const phoneEl = document.getElementById('ap-test-phone');
  const btn     = document.getElementById('ap-test-btn');
  const result  = document.getElementById('ap-test-result');
  const phone   = phoneEl.value.trim();
  if (!phone) { result.className = 'ap-test-result err'; result.textContent = 'Voer een telefoonnummer in.'; return; }

  // Use the live-rendered preview bubble text. Already has placeholders substituted
  const message = document.getElementById('ap-preview-bubble').textContent;
  if (!message) { result.className = 'ap-test-result err'; result.textContent = 'Bericht is leeg.'; return; }

  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = 'Versturen...'; }
  result.className = 'ap-test-result';
  result.textContent = '';
  try {
    const r = await fetch(\`\${API_BASE}/leads\`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'test-message', phone, message })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      result.className = 'ap-test-result err';
      result.textContent = '' + (d.message || d.error || 'Versturen mislukt');
      return;
    }
    result.className = 'ap-test-result ok';
    result.textContent = 'Verzonden naar +' + d.sentTo + '. check je WhatsApp!';
  } catch (err) {
    result.className = 'ap-test-result err';
    result.textContent = 'Netwerkfout. Probeer opnieuw';
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

function renderInstellingen() {
  const s = state;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('set-naam', s.clientName || '—');
  set('set-email', s.userEmail || localStorage.getItem('hv-email') || '—');
  // Boekingsmodus is statisch (AI boekt in WhatsApp). Niet overschrijven met '—'.

  // API key masked display
  const keyEl = document.getElementById('set-apikey-display');
  const toggleBtn = document.getElementById('btn-toggle-apikey');
  if (keyEl && toggleBtn) {
    const key = s.apiKey || '';
    const masked = key.length > 8 ? key.slice(0, 8) + '••••••••' : '••••••••';
    keyEl.textContent = masked;
    let showing = false;
    toggleBtn.onclick = () => {
      showing = !showing;
      keyEl.textContent = showing ? key : masked;
      toggleBtn.textContent = showing ? 'Verberg' : 'Toon';
    };
  }
  loadGcalStatus();
}

/* ============================================================
   GOOGLE AGENDA (per-client OAuth connect)
   ============================================================ */
async function loadGcalStatus() {
  var sub  = document.getElementById('gcal-status-sub');
  var cBtn = document.getElementById('btn-gcal-connect');
  var dBtn = document.getElementById('btn-gcal-disconnect');
  if (!sub) return;
  try {
    var r = await fetch(API_BASE + '/gcal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'status' })
    });
    var d = await r.json();
    if (d && d.connected) {
      sub.textContent = 'Gekoppeld' + (d.email ? ' — ' + d.email : '') + '. Afspraken worden gesynct met je Google Agenda.';
      if (cBtn) cBtn.style.display = 'none';
      if (dBtn) dBtn.style.display = '';
    } else {
      sub.textContent = 'Zo checkt de AI je beschikbaarheid en zet geboekte afspraken automatisch in je agenda.';
      if (cBtn) cBtn.style.display = '';
      if (dBtn) dBtn.style.display = 'none';
    }
  } catch (e) { /* leave default text */ }
}
// Fetches the (server-signed) Google consent URL first, then navigates the
// browser there. We can't do a bare GET navigation straight to /api/gcal,
// because this app authenticates every dashboard call via the x-api-key
// header (no session cookie) — a top-level navigation can't carry a custom
// header. Fetching first keeps the session token out of any URL.
async function connectGoogleCalendar() {
  try {
    var r = await fetch(API_BASE + '/gcal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'connect' })
    });
    var d = await r.json();
    if (d && d.url) { window.location.href = d.url; return; }
    toast('Koppelen mislukt, probeer opnieuw', 'error');
  } catch (e) { toast('Koppelen mislukt, probeer opnieuw', 'error'); }
}
async function disconnectGoogleCalendar() {
  try {
    await fetch(API_BASE + '/gcal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'disconnect' })
    });
  } catch (e) {}
  loadGcalStatus();
  try { toast('Google Agenda ontkoppeld', 'success'); } catch (e) {}
}

/* ============================================================
   ACTIVITEIT (ACTIVITY FEED)
   ============================================================ */
function renderActiviteit() {
  const feed = document.getElementById('activity-feed');
  if (!feed) return;

  const events = [];

  state.leads.forEach(l => {
    const baseDate = l.datum ? new Date(l.datum) : null;
    if (baseDate && !isNaN(baseDate)) {
      events.push({ type: 'new', date: baseDate, lead: l });
    }
    if (l.qualified === true && baseDate) {
      events.push({ type: 'qualified', date: new Date(baseDate.getTime() + 1000), lead: l });
    }
    if (l.afspraakGeboekt === true && baseDate) {
      events.push({ type: 'booked', date: new Date(baseDate.getTime() + 2000), lead: l });
    }
    if (l.opgepikt === true && baseDate) {
      events.push({ type: 'won', date: new Date(baseDate.getTime() + 3000), lead: l });
    }
  });

  events.sort((a, b) => b.date - a.date);
  const recent = events.slice(0, 50);

  if (recent.length === 0) {
    feed.innerHTML = \`<div class="activity-item"><div style="color:var(--text-muted);font-size:13px">Nog geen activiteit</div></div>\`;
    return;
  }

  function relTime(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60) return 'zojuist';
    if (diff < 3600) return Math.floor(diff / 60) + 'm geleden';
    if (diff < 86400) return Math.floor(diff / 3600) + 'u geleden';
    if (diff < 172800) return 'gisteren';
    return date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' });
  }

  const typeMap = {
    new:       { dotCls: 'activity-dot-new',       title: l => \`Nieuwe lead: \${escHtml(l.naam) || '—'}\`,       sub: l => l.telefoon ? \`\${escHtml(l.telefoon)}\` : '' },
    qualified: { dotCls: 'activity-dot-qualified',  title: l => \`Lead gekwalificeerd: \${escHtml(l.naam) || '—'}\`, sub: l => l.leadScore ? \`Score: \${l.leadScore}\` : '' },
    booked:    { dotCls: 'activity-dot-booked',     title: l => \`Afspraak geboekt: \${escHtml(l.naam) || '—'}\`, sub: () => 'Afspraak ingepland via Calendly' },
    won:       { dotCls: 'activity-dot-won',        title: l => \`Lead opgevolgd: \${escHtml(l.naam) || '—'}\`,    sub: l => l.verwachteWaarde ? \`Waarde: \${escHtml(l.verwachteWaarde)}\` : '' }
  };

  feed.innerHTML = recent.map(ev => {
    const tm = typeMap[ev.type];
    if (!tm) return '';
    return \`<div class="activity-item">
      <div class="activity-dot \${tm.dotCls}"></div>
      <div class="activity-content">
        <div class="activity-title">\${tm.title(ev.lead)}</div>
        \${tm.sub(ev.lead) ? \`<div class="activity-sub">\${tm.sub(ev.lead)}</div>\` : ''}
      </div>
      <div class="activity-time">\${relTime(ev.date)}</div>
    </div>\`;
  }).join('');
}

/* ============================================================
   FOUNDER DASHBOARD
   ============================================================ */
const founderState = {
  pipeline: [],
  goals:    [],
  clients:  0,
  loaded:   false,
  _pipeEditId: null,
  _goalEditId: null
};

async function loadFounderData(force) {
  if (founderState.loaded && !force) return;
  founderState.loaded = true;

  // Metrics from admin endpoint (clients + lead stats)
  try {
    const r = await fetch('/api/admin', { headers: { 'x-api-key': state.apiKey } });
    if (r.ok) {
      const d = await r.json();
      const clients = d.clients || [];
      founderState.clients = clients.length;
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      let totalLeads = 0, newLeads = 0, qualLeads = 0;
      clients.forEach(c => {
        totalLeads += (c.totalLeads || 0);
        newLeads   += (c.newLeads   || 0);
        qualLeads  += (c.qualified  || 0);
      });
      const qualPct = totalLeads > 0 ? Math.round(qualLeads / totalLeads * 100) : 0;
      document.getElementById('f-stat-clients').textContent = founderState.clients;
      document.getElementById('f-stat-leads').textContent   = totalLeads;
      document.getElementById('f-stat-qual').textContent    = qualPct + '%';
      document.getElementById('f-stat-new').textContent     = newLeads;
      founderState._metrics = { clients: founderState.clients, leadsMonth: totalLeads, qualified: qualPct, newLeads };
      founderState._clientList = clients;
      renderLiveClients(clients);  // populate Live Klanten table + recompute MRR/profit
      updateGoalPanel();
    }
  } catch (e) { /* ignore */ }

  // Pipeline
  try {
    const r = await fetch('/api/admin?section=founder&type=pipeline', { headers: { 'x-api-key': state.apiKey } });
    if (r.ok) {
      const d = await r.json();
      founderState.pipeline = d.pipeline || [];
      renderFounderPipeline();
    }
  } catch (e) { /* ignore */ }

  // Goals
  try {
    const r = await fetch('/api/admin?section=founder&type=goals', { headers: { 'x-api-key': state.apiKey } });
    if (r.ok) {
      const d = await r.json();
      founderState.goals = d.goals || [];
      renderFounderGoals();
    }
  } catch (e) { /* ignore */ }

  // Header + checklist + goal panel + chat + linkedin
  initFounderHeader();
  renderDailyChecklist();
  updateGoalPanel();
  initLinkedInSection();
  loadChatHistory();
  initOutreachTracker();
  initBouwTracker();
  initDocsHub();
  renderMeeting();
  updatePersonaGreeting();
}

function cardAgeDays(aangemaakt) {
  if (!aangemaakt) return 0;
  return Math.floor((Date.now() - new Date(aangemaakt).getTime()) / 86400000);
}

function renderFounderPipeline() {
  const stages = ['Gecontacteerd', 'Geïnteresseerd', 'Beslissing'];
  // urgency thresholds per stage (days)
  const thresholds = { 'Gecontacteerd': 5, 'Geïnteresseerd': 3, 'Beslissing': 2 };
  stages.forEach((stage, idx) => {
    const cards = founderState.pipeline.filter(p => p.fase === stage);
    document.getElementById('pipe-count-' + idx).textContent = cards.length;
    const body = document.getElementById('pipe-col-' + idx);
    body.innerHTML = cards.map(p => {
      const days = cardAgeDays(p.aangemaakt);
      const thresh = thresholds[stage] || 5;
      var ageClass = days >= thresh * 2 ? 'age-critical' : days >= thresh ? 'age-warning' : 'age-ok';
      var ageLabel = days === 0 ? 'Vandaag' : days + (days === 1 ? ' dag' : ' dagen');
      var urgent = days >= thresh ? ' has-urgent' : '';
      return '<div class="founder-card' + urgent + '" onclick="openPipeModal(\\'' + escJs(p.id) + '\\')">' +
        '<div class="founder-card-name">' + escHtml(p.naam || p.bedrijf || '—') + '</div>' +
        (p.bedrijf && p.naam ? '<div class="founder-card-meta">' + escHtml(p.bedrijf) + '</div>' : '') +
        (p.email ? '<div class="founder-card-meta">' + escHtml(p.email) + '</div>' : '') +
        '<span class="founder-card-age ' + ageClass + '">' + ageLabel + '</span>' +
      '</div>';
    }).join('');
  });
  const won  = founderState.pipeline.filter(p => p.fase === 'Gewonnen').length;
  const lost = founderState.pipeline.filter(p => p.fase === 'Verloren').length;
  document.getElementById('pipe-won-badge').textContent  = '' + won  + ' Gewonnen';
  document.getElementById('pipe-lost-badge').textContent = '' + lost + ' Verloren';
  renderPipeMini();
  renderFollowUpAlerts();
  updateMrrWidget();
  populateDmDropdown();
}

function renderFollowUpAlerts() {
  var thresholds = { 'Gecontacteerd': 5, 'Geïnteresseerd': 3, 'Beslissing': 2 };
  var faseIdx    = { 'Gecontacteerd': 'f0', 'Geïnteresseerd': 'f1', 'Beslissing': 'f2' };
  var urgent = founderState.pipeline
    .filter(function(p) { return thresholds[p.fase] && cardAgeDays(p.aangemaakt) >= thresholds[p.fase]; })
    .sort(function(a, b) {
      var ta = thresholds[a.fase] || 99, tb = thresholds[b.fase] || 99;
      return ta - tb || cardAgeDays(b.aangemaakt) - cardAgeDays(a.aangemaakt);
    });

  var section = document.getElementById('fdr-followup-section');
  var list    = document.getElementById('fdr-followup-list');
  var count   = document.getElementById('fdr-followup-count');
  if (!section || !list) return;

  if (!urgent.length) { section.style.display = 'none'; return; }
  section.style.display = '';
  if (count) count.textContent = urgent.length + ' prospect' + (urgent.length > 1 ? 's' : '') + ' wachten op actie';

  list.innerHTML = urgent.map(function(p) {
    var days   = cardAgeDays(p.aangemaakt);
    var thresh = thresholds[p.fase] || 5;
    var cls    = days >= thresh * 2 ? 'critical' : 'warning';
    var fi     = faseIdx[p.fase] || 'f0';
    return '<div class="fdr-followup-item ' + cls + '" onclick="openPipeModal(\\'' + escJs(p.id) + '\\')">' +
      '<div class="fdr-followup-name">' + escHtml(p.naam || p.bedrijf || '—') + (p.bedrijf && p.naam ? ' <span style="font-weight:400;color:var(--text-muted)">— ' + escHtml(p.bedrijf) + '</span>' : '') + '</div>' +
      '<span class="fdr-followup-fase ' + fi + '">' + escHtml(p.fase) + '</span>' +
      '<span class="fdr-followup-days">' + days + 'd</span>' +
    '</div>';
  }).join('');
}

function updateMrrWidget() {
  var avgMrr   = 1000;  // Helvaro single tier. €1.000/maand alles inbegrepen
  var fixedCost = 58;   // Vercel €18 + Airtable €20 + Resend €18 + domein €2
  var varPerClient = 34; // WhatsApp API ~€30 + Anthropic API ~€4
  var won      = founderState.pipeline.filter(function(p) { return p.fase === 'Gewonnen'; }).length;
  var clients  = founderState.clients || 0;
  var total    = Math.max(won, clients);
  var mrr      = total * avgMrr;
  var varCost  = total * varPerClient;
  var profit   = mrr - fixedCost - varCost;
  var marge    = mrr > 0 ? Math.round((profit / mrr) * 100) : 0;

  var valEl    = document.getElementById('fdr-mrr-val');
  var subEl    = document.getElementById('fdr-mrr-sub');
  var varEl    = document.getElementById('fdr-cost-var');
  var profEl   = document.getElementById('fdr-profit-val');
  var margeEl  = document.getElementById('fdr-profit-marge');

  if (valEl)  valEl.textContent  = '€' + mrr.toLocaleString('nl-BE');
  if (subEl)  subEl.textContent  = total + ' betalende klant' + (total === 1 ? '' : 'en');
  if (varEl)  varEl.textContent  = '-€' + varCost.toLocaleString('nl-BE');
  if (profEl) {
    profEl.textContent = (profit >= 0 ? '€' : '-€') + Math.abs(profit).toLocaleString('nl-BE');
    profEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--red)';
  }
  if (margeEl) margeEl.textContent = 'Marge: ' + (mrr > 0 ? marge + '%' : '—%') + ' • variabel €' + varPerClient + '/klant';
}

function populateDmDropdown() {
  var sel = document.getElementById('fdr-dm-prospect');
  if (!sel) return;
  var active = founderState.pipeline.filter(function(p) {
    return p.fase !== 'Gewonnen' && p.fase !== 'Verloren';
  }).sort(function(a, b) {
    // sort by urgency: Beslissing first, then Geïnteresseerd, then Gecontacteerd
    var order = { 'Beslissing': 0, 'Geïnteresseerd': 1, 'Gecontacteerd': 2 };
    return (order[a.fase] || 9) - (order[b.fase] || 9);
  });
  var cur = sel.value;
  sel.innerHTML = '<option value="">Kies een prospect uit de pipeline...</option>' +
    active.map(function(p) {
      var label = escHtml((p.bedrijf || p.naam || '—') + '. ' + p.fase);
      return '<option value="' + escHtml(p.id) + '">' + label + '</option>';
    }).join('');
  if (cur) sel.value = cur;
}

// ── Personalized DM Generator ──────────────────────────────────────────────
async function generateDm() {
  var sel  = document.getElementById('fdr-dm-prospect');
  var plt  = document.getElementById('fdr-dm-platform');
  var btn  = document.getElementById('fdr-dm-btn');
  var out    = document.getElementById('fdr-dm-output');
  var emp    = document.getElementById('fdr-dm-empty');
  var copy   = document.getElementById('fdr-dm-copy');
  var openLi = document.getElementById('fdr-dm-open-li');
  if (!sel || !sel.value) { toast('Kies eerst een prospect', 'error'); return; }

  var rec = founderState.pipeline.find(function(p) { return p.id === sel.value; });
  if (!rec) return;

  var platform = plt ? plt.value : 'linkedin';
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Genereren...'; }
  if (out) out.classList.remove('visible');
  if (copy) copy.classList.remove('visible');
  if (openLi) openLi.classList.remove('visible');

  try {
    var r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({
        mode: 'personalized-dm',
        bedrijf:  rec.bedrijf || rec.naam,
        sector:   rec.sector  || '',
        fase:     rec.fase,
        platform: platform,
        notities: rec.notities || '',
        dagen:    cardAgeDays(rec.aangemaakt)
      })
    });
    var d = await r.json();
    if (!r.ok) { toast(d.message || d.error || 'Genereren mislukt', 'error'); }
    else {
      if (out) { out.textContent = d.message; out.classList.add('visible'); }
      if (emp) emp.style.display = 'none';
      if (copy) copy.classList.add('visible');
      if (openLi) {
        if (platform === 'email') {
          openLi.href = 'mailto:';
          openLi.innerHTML = 'Open E-mail';
        } else {
          openLi.href = 'https://www.linkedin.com/messaging/';
          openLi.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg> Open LinkedIn';
        }
        openLi.classList.add('visible');
      }
    }
  } catch (e) { toast('Netwerkfout', 'error'); }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Genereer';
  }
}

function copyDm() {
  var out = document.getElementById('fdr-dm-output');
  if (!out || !out.textContent) return;
  navigator.clipboard.writeText(out.textContent).then(function() {
    toast('Bericht gekopieerd! ', 'success');
  }).catch(function() { toast('Kopiëren mislukt', 'error'); });
}

function renderFounderGoals() {
  const el = document.getElementById('founder-goals-list');
  if (!founderState.goals.length) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0">Geen doelen ingesteld. Klik op "+ Doel" om te beginnen.</div>';
    return;
  }
  const today = new Date();
  el.innerHTML = founderState.goals.map(g => {
    const current = g.eenheid.toLowerCase().includes('klant') ? founderState.clients : 0;
    const pct     = g.target > 0 ? Math.min(100, Math.round(current / g.target * 100)) : 0;
    const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - today) / 86400000) : null;
    return '<div class="founder-goal" onclick="openGoalModal(\\'' + escJs(g.id) + '\\')" style="cursor:pointer">' +
      '<div class="founder-goal-top">' +
        '<div class="founder-goal-name">' + escHtml(g.doel) + '</div>' +
        '<div class="founder-goal-nums">' + current + ' / ' + g.target + ' ' + escHtml(g.eenheid) + '</div>' +
      '</div>' +
      '<div class="founder-goal-bar"><div class="founder-goal-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="founder-goal-meta">' +
        '<span>' + pct + '%</span>' +
        (daysLeft !== null ? '<span>' + (daysLeft >= 0 ? daysLeft + ' dagen' : 'Verlopen') + '</span>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Daily Checklist (auto-populated per day of week, localStorage, daily reset) ──
var DAILY_TASKS = {
  1: [
    { wie: 'Teljo', taak: '10 LinkedIn DMs sturen', detail: 'Template 1. bureaus: CNIP, Ants Agency, Bureau 9000, Nouchka Design, SilverLine Studio, Magelaan' },
    { wie: 'Teljo', taak: 'Pipeline updaten', detail: 'Verplaats wie gereageerd heeft naar Geïnteresseerd in Founder Dashboard' },
    { wie: 'Frade', taak: 'Dashboard checken', detail: 'Login als elke klant. Controleer of leads binnenkomen en correct verwerkt worden' },
    { wie: 'Frade', taak: 'Bugs / verbeteringen fixen', detail: 'Fix eventuele fouten die klanten meldden vorige week' },
    { wie: 'Frade', taak: 'Nieuwe klant voorbereiden', detail: 'Als iemand ja zei vrijdag: account aanmaken via /onboard, formulier instellen' }
  ],
  2: [
    { wie: 'Teljo', taak: '10 LinkedIn DMs sturen', detail: 'Template 2. vastgoed: VICUS Vastgoed (0498 12 37 08), Agence Rosseel, Concordia' },
    { wie: 'Teljo', taak: 'Follow-up maandag', detail: 'Stuur Template 5 naar wie maandag niet gereageerd heeft' },
    { wie: 'Teljo', taak: '5 cold emails sturen', detail: 'info@cnip.be, info@vicusvastgoed.be, info@concordia.be, hello@antsconnect.be, info@bureau9000.be' },
    { wie: 'Frade', taak: 'Calendly integratie testen', detail: 'Test volledige flow: lead → WhatsApp → kwalificatie → Calendly boeking' },
    { wie: 'Frade', taak: 'WhatsApp response testen', detail: 'Stuur test lead via formulier, controleer WhatsApp response tijd' }
  ],
  3: [
    { wie: 'Teljo', taak: 'Demo calls (geboekte afspraken)', detail: 'Gebruik 15-min demo script. Doel: afsluiten op gratis proefperiode' },
    { wie: 'Teljo', taak: 'LinkedIn post publiceren', detail: '"Hoe wij [sector] helpen met AI leadkwalificatie via WhatsApp". vraag Frade voor screenshot' },
    { wie: 'Teljo', taak: '5 extra DMs coaches/consultants', detail: 'Opex Consulting (info@opex.be) en gelijkaardige bedrijven' },
    { wie: 'Frade', taak: 'Screenshot/video demo flow maken', detail: 'Schermopname van de demo flow voor Teljos LinkedIn post' },
    { wie: 'Frade', taak: 'App performance controleren', detail: 'Vercel logs checken, WhatsApp webhook response times controleren' },
    { wie: 'Frade', taak: 'Onboarding flow testen', detail: 'Ga naar app.helvaro.pro/onboard. Test het volledige proces als nieuwe klant' }
  ],
  4: [
    { wie: 'Teljo', taak: 'Follow-up alle openstaande contacten', detail: 'Template 5 naar iedereen zonder definitief antwoord deze week' },
    { wie: 'Teljo', taak: '10 nieuwe DMs sturen', detail: 'Nieuwe bedrijven zoeken via LinkedIn regio Gent/Antwerpen' },
    { wie: 'Teljo', taak: 'Demo calls', detail: 'Geboekte afspraken van eerder deze week' },
    { wie: 'Frade', taak: 'Airtable opruimen', detail: 'Leads controleren, verouderde leads archiveren, kwaliteitscheck' },
    { wie: 'Frade', taak: 'Klant support', detail: 'Beantwoord technische vragen van bestaande klanten via WhatsApp/email' },
    { wie: 'Frade', taak: 'Nieuwe feature / verbetering', detail: '1 concrete verbetering van dashboard, formulier of WhatsApp flow' }
  ],
  5: [
    { wie: 'Frade', taak: 'Founder Dashboard openen', detail: 'Open /founder tab → klik Genereer advies → lees wat AI aanbeveelt' },
    { wie: 'Frade', taak: 'Pipeline updaten', detail: 'Verplaats prospects naar juiste fase, verwijder wie definitief nee zei' },
    { wie: 'Frade', taak: 'Week samenvatting noteren', detail: 'Hoeveel DMs gestuurd, hoeveel demos gehad, hoeveel geïnteresseerd' },
    { wie: 'Teljo', taak: 'Deals afsluiten', detail: 'Bel iedereen die geïnteresseerd is → push naar contract' },
    { wie: 'Teljo', taak: 'Volgende week plannen', detail: 'Bespreek: wie benaderen we maandag, welke sectoren' },
    { wie: 'Beiden', taak: 'Weekly standup (15 min)', detail: 'Wat werkte? Wat niet? Wat aanpassen volgende week?' }
  ]
};

function initFounderHeader() {
  var days       = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
  var months     = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
  var monthsShort = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
  var now = new Date();
  var dn = document.getElementById('fdr-dayname');
  var dt = document.getElementById('fdr-date');
  var dl = document.getElementById('fdr-days-left');
  var dv = document.getElementById('fdr-deadline-val');
  if (dn) dn.textContent = days[now.getDay()];
  if (dt) dt.textContent = now.getDate() + ' ' + months[now.getMonth()] + ' ' + now.getFullYear();
  // Single source of truth for the roadmap deadline — drives both the
  // displayed date and the countdown, so they can never drift apart.
  var deadline = new Date('2026-06-20');
  if (dv) dv.textContent = deadline.getDate() + ' ' + monthsShort[deadline.getMonth()] + ' ' + deadline.getFullYear();
  var daysLeft = Math.ceil((deadline - now) / 86400000);
  if (dl) dl.textContent = daysLeft > 0 ? daysLeft + ' dagen resterend' : 'Deadline voorbij';
}

function renderDailyChecklist() {
  var day = new Date().getDay();
  var tasks = DAILY_TASKS[day];
  var el = document.getElementById('fdr-checklist');
  if (!el) return;

  if (!tasks || !tasks.length) {
    el.innerHTML = '<div class="fdr-weekend-msg"><div class="fdr-weekend-icon"></div><div class="fdr-weekend-txt">Weekend. Geniet ervan!</div><div class="fdr-weekend-sub">Maandag: 10 LinkedIn DMs + dashboard checken + pipeline updaten</div></div>';
    updateChecklistProgress(0, 0);
    return;
  }

  var today = new Date().toISOString().slice(0, 10);
  var raw = localStorage.getItem('hv-daily-tasks-v2');
  var stored = {};
  try { stored = JSON.parse(raw) || {}; } catch (e) { stored = {}; }
  if (stored._date !== today) stored = { _date: today };

  var persona = (typeof getPersona === 'function') ? getPersona() : '';
  el.innerHTML = tasks.map(function(t, i) {
    var done = stored['task-' + i] || false;
    var wieClass = t.wie === 'Frade' ? 'fdr-badge-frade' : (t.wie === 'Teljo' ? 'fdr-badge-teljo' : 'fdr-badge-beiden');
    // Dim tasks that aren't for the current persona (and aren't "beiden")
    var mine = !persona || t.wie === 'Beiden' || t.wie === persona;
    var dimStyle = mine ? '' : ' style="opacity:.45"';
    return '<label class="fdr-task-row' + (done ? ' fdr-task-done' : '') + '"' + dimStyle + ' for="fdr-cb-' + i + '">' +
      '<input type="checkbox" id="fdr-cb-' + i + '"' + (done ? ' checked' : '') + ' onchange="toggleDailyTask(' + i + ')">' +
      '<div class="fdr-task-check-icon"></div>' +
      '<div class="fdr-task-body">' +
        '<div class="fdr-task-name">' + escHtml(t.taak) + '</div>' +
        '<div class="fdr-task-detail">' + escHtml(t.detail) + '</div>' +
      '</div>' +
      '<span class="fdr-wie-badge ' + wieClass + '">' + escHtml(t.wie) + '</span>' +
    '</label>';
  }).join('');

  var doneCount = tasks.filter(function(_, i) { return stored['task-' + i]; }).length;
  updateChecklistProgress(doneCount, tasks.length);
}

function toggleDailyTask(idx) {
  var today = new Date().toISOString().slice(0, 10);
  var raw = localStorage.getItem('hv-daily-tasks-v2');
  var stored = {};
  try { stored = JSON.parse(raw) || {}; } catch (e) { stored = {}; }
  if (stored._date !== today) stored = { _date: today };
  var cb = document.getElementById('fdr-cb-' + idx);
  stored['task-' + idx] = cb ? cb.checked : false;
  localStorage.setItem('hv-daily-tasks-v2', JSON.stringify(stored));
  var row = cb ? cb.closest('.fdr-task-row') : null;
  if (row) row.classList.toggle('fdr-task-done', stored['task-' + idx]);
  var day = new Date().getDay();
  var tasks = DAILY_TASKS[day] || [];
  var doneCount = tasks.filter(function(_, i) { return stored['task-' + i]; }).length;
  updateChecklistProgress(doneCount, tasks.length);
}

function updateChecklistProgress(done, total) {
  var pEl = document.getElementById('fdr-task-progress');
  var bEl = document.getElementById('fdr-progress-bar');
  if (pEl) pEl.textContent = done + ' / ' + total + ' voltooid';
  var pct = total > 0 ? Math.round(done / total * 100) : 0;
  if (bEl) bEl.style.width = pct + '%';
}

function renderPipeMini() {
  var el = document.getElementById('fdr-pipe-mini-cols');
  if (!el) return;
  var stages = [
    { name: 'Gecontacteerd', color: '#7C93C4' },
    { name: 'Geinteresseerd', color: '#E8D7B1' },
    { name: 'Beslissing', color: '#C99A6C' }
  ];
  el.innerHTML = stages.map(function(s) {
    var count = founderState.pipeline.filter(function(p) {
      return p.fase === s.name || p.fase === 'Geïnteresseerd' && s.name === 'Geinteresseerd';
    }).length;
    return '<div class="fdr-pipe-mini-item">' +
      '<div class="fdr-pipe-mini-dot" style="background:' + s.color + '"></div>' +
      '<div class="fdr-pipe-mini-name">' + escHtml(s.name) + '</div>' +
      '<div class="fdr-pipe-mini-count">' + count + '</div>' +
    '</div>';
  }).join('');
}

function updateGoalPanel() {
  var current = founderState.clients;
  var target = 5;
  var pct = Math.min(100, Math.round(current / target * 100));
  var gcEl = document.getElementById('fdr-goal-current');
  var gbEl = document.getElementById('fdr-goal-bar');
  var gpEl = document.getElementById('fdr-goal-pct');
  if (gcEl) gcEl.textContent = current;
  if (gbEl) gbEl.style.width = pct + '%';
  if (gpEl) gpEl.textContent = pct + '% bereikt';
}

// ── Pipeline Modal ────────────────────────────────────────────────────────
function openPipeModal(id, defaultFase) {
  founderState._pipeEditId = id;
  const overlay = document.getElementById('pipe-modal-overlay');
  const title   = document.getElementById('pipe-modal-title');
  const delBtn  = document.getElementById('pm-delete-btn');
  if (id) {
    const rec = founderState.pipeline.find(p => p.id === id);
    title.textContent = 'Prospect bewerken';
    document.getElementById('pm-naam').value     = rec ? rec.naam     : '';
    document.getElementById('pm-bedrijf').value  = rec ? rec.bedrijf  : '';
    document.getElementById('pm-email').value    = rec ? rec.email    : '';
    document.getElementById('pm-fase').value     = rec ? rec.fase     : 'Gecontacteerd';
    document.getElementById('pm-notities').value = rec ? rec.notities : '';
    delBtn.style.display = '';
  } else {
    title.textContent = 'Prospect toevoegen';
    document.getElementById('pm-naam').value     = '';
    document.getElementById('pm-bedrijf').value  = '';
    document.getElementById('pm-email').value    = '';
    document.getElementById('pm-fase').value     = defaultFase || 'Gecontacteerd';
    document.getElementById('pm-notities').value = '';
    delBtn.style.display = 'none';
  }
  overlay.classList.add('open');
}

function closePipeModal() {
  document.getElementById('pipe-modal-overlay').classList.remove('open');
}

async function savePipeRecord() {
  const naam     = document.getElementById('pm-naam').value.trim();
  const bedrijf  = document.getElementById('pm-bedrijf').value.trim();
  const email    = document.getElementById('pm-email').value.trim();
  const fase     = document.getElementById('pm-fase').value;
  const notities = document.getElementById('pm-notities').value.trim();
  if (!naam) { toast('Naam is verplicht', 'error'); return; }
  const mode = founderState._pipeEditId ? 'pipeline-update' : 'pipeline-create';
  const body  = { mode, naam, bedrijf, email, fase, notities };
  if (founderState._pipeEditId) body.id = founderState._pipeEditId;
  try {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { toast(d.message || d.error || 'Fout', 'error'); return; }
    closePipeModal();
    founderState.loaded = false;
    await loadFounderData(true);
    toast(mode === 'pipeline-create' ? 'Prospect toegevoegd' : 'Bijgewerkt', 'success');
  } catch { toast('Netwerkfout', 'error'); }
}

async function deletePipeRecord() {
  if (!founderState._pipeEditId) return;
  if (!confirm('Prospect verwijderen?')) return;
  try {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey }, body: JSON.stringify({ mode: 'pipeline-delete', id: founderState._pipeEditId }) });
    if (!r.ok) { toast('Verwijderen mislukt', 'error'); return; }
    closePipeModal();
    founderState.loaded = false;
    await loadFounderData(true);
    toast('Verwijderd', 'success');
  } catch { toast('Netwerkfout', 'error'); }
}

// ── Goal Modal ────────────────────────────────────────────────────────────
function openGoalModal(id) {
  founderState._goalEditId = id;
  const overlay = document.getElementById('goal-modal-overlay');
  const title   = document.getElementById('goal-modal-title');
  const delBtn  = document.getElementById('gm-delete-btn');
  if (id) {
    const g = founderState.goals.find(x => x.id === id);
    title.textContent = 'Doel bewerken';
    document.getElementById('gm-doel').value     = g ? g.doel     : '';
    document.getElementById('gm-target').value   = g ? g.target   : '';
    document.getElementById('gm-eenheid').value  = g ? g.eenheid  : '';
    document.getElementById('gm-deadline').value = g ? g.deadline : '';
    delBtn.style.display = '';
  } else {
    title.textContent = 'Doel toevoegen';
    document.getElementById('gm-doel').value     = '';
    document.getElementById('gm-target').value   = '';
    document.getElementById('gm-eenheid').value  = '';
    document.getElementById('gm-deadline').value = '';
    delBtn.style.display = 'none';
  }
  overlay.classList.add('open');
}

function closeGoalModal() {
  document.getElementById('goal-modal-overlay').classList.remove('open');
}

async function saveGoalRecord() {
  const doel     = document.getElementById('gm-doel').value.trim();
  const target   = Number(document.getElementById('gm-target').value) || 0;
  const eenheid  = document.getElementById('gm-eenheid').value.trim();
  const deadline = document.getElementById('gm-deadline').value;
  if (!doel) { toast('Doel is verplicht', 'error'); return; }
  const body = { mode: 'goal-save', doel, target, eenheid, deadline, actief: true };
  if (founderState._goalEditId) body.id = founderState._goalEditId;
  try {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) { toast(d.message || d.error || 'Fout', 'error'); return; }
    closeGoalModal();
    founderState.loaded = false;
    await loadFounderData(true);
    toast('Doel opgeslagen', 'success');
  } catch { toast('Netwerkfout', 'error'); }
}

async function deleteGoalRecord() {
  if (!founderState._goalEditId) return;
  if (!confirm('Doel verwijderen?')) return;
  try {
    const r = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey }, body: JSON.stringify({ mode: 'goal-delete', id: founderState._goalEditId }) });
    if (!r.ok) { toast('Verwijderen mislukt', 'error'); return; }
    closeGoalModal();
    founderState.loaded = false;
    await loadFounderData(true);
    toast('Verwijderd', 'success');
  } catch { toast('Netwerkfout', 'error'); }
}

// ── Content Hub (LinkedIn + Instagram) ────────────────────────────────────
var hubState = { platform: 'linkedin' };

var HUB_DAY_LABELS = {
  1: 'Maandag · Verzekeringen',
  2: 'Dinsdag · Vastgoed',
  3: 'Woensdag · Recruitment',
  4: 'Donderdag · B2B SaaS',
  5: 'Vrijdag · Coaching',
  6: 'Zaterdag · Automotive',
  0: 'Zondag · Leadgeneratie'
};

function initLinkedInSection() {
  // Set day label in subtitle
  var day = new Date().getDay();
  var sub = document.getElementById('fdr-hub-sub');
  if (sub) sub.textContent = HUB_DAY_LABELS[day] || 'LinkedIn & Instagram';

  // Restore cached post for today
  var today = new Date().toISOString().slice(0, 10);
  var cacheKey = 'hv-hub-post-' + hubState.platform + '-' + today;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (e) {}
  if (cached && cached.post) showContentPost(cached.post);
}

function setHubPlatform(platform) {
  hubState.platform = platform;
  var liTab = document.getElementById('fdr-tab-li');
  var igTab = document.getElementById('fdr-tab-ig');
  if (liTab) liTab.classList.toggle('active', platform === 'linkedin');
  if (liTab) liTab.classList.toggle('li-active', platform === 'linkedin');
  if (igTab) igTab.classList.toggle('active', platform === 'instagram');
  if (igTab) igTab.classList.toggle('ig-active', platform === 'instagram');
  // Try load cached post for this platform
  var today = new Date().toISOString().slice(0, 10);
  var out = document.getElementById('fdr-hub-output');
  var empty = document.getElementById('fdr-hub-empty');
  var copy = document.getElementById('fdr-hub-copy');
  var regen = document.getElementById('fdr-hub-regen');
  var badge = document.getElementById('fdr-hub-badge');
  var openLi = document.getElementById('fdr-hub-open-li');
  var openIg = document.getElementById('fdr-hub-open-ig');
  if (out) out.classList.remove('visible');
  if (empty) empty.style.display = '';
  if (copy) copy.classList.remove('visible');
  if (regen) regen.classList.remove('visible');
  if (badge) badge.style.display = 'none';
  if (openLi) openLi.classList.remove('visible');
  if (openIg) openIg.classList.remove('visible');
  var cacheKey = 'hv-hub-post-' + platform + '-' + today;
  var cached = null;
  try { cached = JSON.parse(localStorage.getItem(cacheKey) || 'null'); } catch (e) {}
  if (cached && cached.post) showContentPost(cached.post);
}

function showContentPost(text) {
  var out = document.getElementById('fdr-hub-output');
  var empty = document.getElementById('fdr-hub-empty');
  var copy = document.getElementById('fdr-hub-copy');
  var regen = document.getElementById('fdr-hub-regen');
  var badge = document.getElementById('fdr-hub-badge');
  var openLi = document.getElementById('fdr-hub-open-li');
  var openIg = document.getElementById('fdr-hub-open-ig');
  if (out) { out.textContent = text; out.classList.add('visible'); }
  if (empty) empty.style.display = 'none';
  if (copy) copy.classList.add('visible');
  if (regen) regen.classList.add('visible');
  if (badge) {
    badge.style.display = '';
    badge.className = 'fdr-hub-platform-badge ' + (hubState.platform === 'instagram' ? 'ig' : 'li');
    badge.textContent = hubState.platform === 'instagram' ? 'Instagram' : 'LinkedIn';
  }
  if (hubState.platform === 'instagram') {
    if (openIg) openIg.classList.add('visible');
    if (openLi) openLi.classList.remove('visible');
  } else {
    if (openLi) openLi.classList.add('visible');
    if (openIg) openIg.classList.remove('visible');
  }
}

async function generateContentPost(forceNew) {
  var btn = document.getElementById('fdr-hub-btn');
  var out = document.getElementById('fdr-hub-output');
  var typeEl = document.getElementById('fdr-hub-type');
  var sectorEl = document.getElementById('fdr-hub-sector');
  var contentType = typeEl ? typeEl.value : 'pijnpunt';
  var sector = sectorEl ? sectorEl.value : '';

  if (btn) { btn.disabled = true; btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Genereren...'; }
  if (out) out.classList.remove('visible');

  try {
    var payload = { mode: 'content-post', platform: hubState.platform, contentType: contentType };
    if (sector) payload.sector = sector;
    var r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify(payload)
    });
    var d = await r.json();
    if (!r.ok) { toast(d.message || d.error || 'Genereren mislukt', 'error'); }
    else {
      showContentPost(d.post);
      if (!forceNew) {
        var today = new Date().toISOString().slice(0, 10);
        var cacheKey = 'hv-hub-post-' + hubState.platform + '-' + today;
        localStorage.setItem(cacheKey, JSON.stringify({ post: d.post, type: contentType }));
      }
    }
  } catch (e) { toast('Netwerkfout', 'error'); }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Genereer';
  }
}

function copyContentPost() {
  var out = document.getElementById('fdr-hub-output');
  if (!out || !out.textContent) return;
  navigator.clipboard.writeText(out.textContent).then(function() {
    toast('Gekopieerd! ', 'success');
  }).catch(function() { toast('Kopiëren mislukt', 'error'); });
}

// ── AI Coach Chat ──────────────────────────────────────────────────────────
var chatHistory = [];

function loadChatHistory() {
  try {
    var raw = sessionStorage.getItem('hv-coach-chat');
    if (raw) {
      chatHistory = JSON.parse(raw) || [];
      var msgsEl = document.getElementById('fdr-chat-msgs');
      if (msgsEl && chatHistory.length) {
        // Clear default welcome bubble only if we have real history
        msgsEl.innerHTML = '';
        chatHistory.forEach(function(m) { appendChatBubble(m.role, m.content, false); });
        msgsEl.scrollTop = msgsEl.scrollHeight;
      }
    }
  } catch (e) {}
}

function appendChatBubble(role, text, scroll) {
  var msgsEl = document.getElementById('fdr-chat-msgs');
  if (!msgsEl) return;
  var div = document.createElement('div');
  div.className = 'fdr-chat-bubble ' + role;
  div.textContent = text;
  msgsEl.appendChild(div);
  if (scroll !== false) msgsEl.scrollTop = msgsEl.scrollHeight;
  return div;
}

function chatInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoachMessage(); }
}

async function sendCoachMessage() {
  var input = document.getElementById('fdr-chat-input');
  var sendBtn = document.getElementById('fdr-chat-send');
  if (!input) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = '';

  chatHistory.push({ role: 'user', content: text });
  appendChatBubble('user', text);

  var typingBubble = appendChatBubble('assistant', 'Aan het denken...', true);
  if (typingBubble) typingBubble.classList.add('typing');
  if (sendBtn) sendBtn.disabled = true;

  try {
    var r = await fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'ai-chat', messages: chatHistory.slice(-20) })
    });
    var d = await r.json();
    if (typingBubble) typingBubble.remove();
    if (!r.ok) {
      appendChatBubble('assistant', 'Fout: ' + (d.message || d.error || 'Onbekende fout'));
    } else {
      chatHistory.push({ role: 'assistant', content: d.reply });
      appendChatBubble('assistant', d.reply);
      try { sessionStorage.setItem('hv-coach-chat', JSON.stringify(chatHistory.slice(-40))); } catch (e) {}
    }
  } catch (e) {
    if (typingBubble) typingBubble.remove();
    appendChatBubble('assistant', 'Netwerkfout. Probeer opnieuw.');
  }

  if (sendBtn) sendBtn.disabled = false;
  input.focus();
}

function clearCoachChat() {
  chatHistory = [];
  sessionStorage.removeItem('hv-coach-chat');
  var msgsEl = document.getElementById('fdr-chat-msgs');
  if (msgsEl) msgsEl.innerHTML = '<div class="fdr-chat-bubble assistant">Chat gewist. Hoe kan ik je helpen?</div>';
}

// ── AI Advice ─────────────────────────────────────────────────────────────
async function getFounderAdvice() {
  const btn = document.getElementById('founder-ai-btn');
  const out = document.getElementById('founder-ai-output');
  btn.disabled = true;
  btn.textContent = 'Genereren...';
  out.classList.remove('visible');

  const stages = founderState.pipeline.reduce((acc, p) => {
    acc[p.fase] = (acc[p.fase] || 0) + 1;
    return acc;
  }, {});

  const context = Object.assign({}, founderState._metrics || {}, {
    pipeContacted:  stages['Gecontacteerd']  || 0,
    pipeInterested: stages['Geïnteresseerd'] || 0,
    pipeDecision:   stages['Beslissing']     || 0,
    pipeWon:        stages['Gewonnen']       || 0,
    goals: founderState.goals
  });

  try {
    const r = await fetch('/api/admin', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body:    JSON.stringify({ mode: 'ai-advice', context })
    });
    const d = await r.json();
    if (!r.ok) { toast(d.message || d.error || 'AI fout', 'error'); } else {
      out.textContent = d.advice;
      out.classList.add('visible');
    }
  } catch { toast('Netwerkfout', 'error'); }

  btn.disabled = false;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Genereer advies';
}

// Close modals on overlay click
document.getElementById('pipe-modal-overlay').addEventListener('click', function(e) { if (e.target === this) closePipeModal(); });
document.getElementById('goal-modal-overlay').addEventListener('click', function(e) { if (e.target === this) closeGoalModal(); });

/* ============================================================
   HELP WIDGET

   A fixed set of articles, not a generative bot. Every article below
   describes something that exists in THIS build and was checked against
   the code before being written (notably: lead-erasure is admin-only in
   api/leads.js, so the privacy article says "vraag het aan" rather than
   promising a button the client doesn't have). An LLM answering these
   questions instead would invent plausible settings that don't exist,
   and each wrong answer becomes a support ticket for a one-person team.

   Bodies are author-written static HTML. Nothing user-supplied is ever
   interpolated into them, and the search query is never echoed back into
   the DOM as markup — the empty state uses textContent.
   ============================================================ */
var HELP_ARTICLES = [
  { id: 'werking', sec: 'Aan de slag', title: 'Hoe Helvaro werkt',
    tags: 'start uitleg overzicht basis werking hoe',
    body:
      // Curly apostrophe on purpose: this whole file is a template literal,
      // so a backslash-escaped \\' would collapse to a bare ' in the emitted
      // script and break the string it lives in.
      '<p>Helvaro vangt je binnenkomende leads op en praat er meteen mee, ook ’s avonds en in het weekend. Je krijgt geen ruwe lijst met namen, maar gesprekken die al gevoerd zijn.</p>' +
      '<ol>' +
      '<li>Een lead vult je formulier in of stuurt je een WhatsApp-bericht.</li>' +
      '<li>De AI stelt meteen de vragen die jij belangrijk vindt en beantwoordt die van de lead.</li>' +
      '<li>Op basis van die antwoorden krijgt de lead een score en een status: gekwalificeerd of niet.</li>' +
      '<li>Is de lead interessant, dan stuurt de AI je boekingslink en komt de afspraak in je agenda.</li>' +
      '</ol>' +
      '<p>Jij ziet het resultaat terug op <strong>Dashboard</strong> en <strong>Pipeline</strong>. Het volledige gesprek staat onder <strong>Gesprekken</strong>.</p>' },

  { id: 'eerste-lead', sec: 'Aan de slag', title: 'Je eerste lead binnenhalen',
    tags: 'eerste lead testen proberen starten formulier link',
    body:
      '<p>De snelste manier om Helvaro te testen is je eigen leadformulier invullen.</p>' +
      '<ol>' +
      '<li>Ga naar <strong>Dashboard</strong>. Bovenaan staat het blok <em>Jouw lead-formulier</em> met je persoonlijke link.</li>' +
      '<li>Klik op <strong>Open</strong> en vul het formulier in met je eigen gegevens.</li>' +
      '<li>Je krijgt binnen enkele seconden het eerste bericht van je AI.</li>' +
      '</ol>' +
      '<p>De lead verschijnt daarna gewoon in je overzicht, precies zoals een echte klant dat zou doen. Je kunt hem achteraf laten verwijderen.</p>' },

  { id: 'formulier-site', sec: 'Aan de slag', title: 'Het formulier op je website zetten',
    tags: 'formulier website insluiten embed code script knop link site',
    body:
      '<p>Er zijn twee manieren, en je hoeft geen ontwikkelaar te zijn voor de eerste.</p>' +
      '<p><strong>1. Gewoon linken.</strong> Kopieer je formulierlink op het dashboard en zet die achter een knop op je site, in je Google-profiel, in je Instagram-bio of onder je e-mailhandtekening. Dit werkt altijd en overal.</p>' +
      '<p><strong>2. Insluiten op je site.</strong> Onder <strong>Formulier</strong> vind je een stukje code dat je in je website plakt. Het formulier verschijnt dan als een blok op je eigen pagina, in je eigen huisstijl.</p>' +
      '<p>Weet je niet waar dat moet in je website? Stuur ons de link van je site, dan kijken we mee.</p>' },

  { id: 'ai-instellen', sec: 'Je AI instellen', title: 'De AI aanpassen aan je bedrijf',
    tags: 'ai personality persoonlijkheid naam toon instructies welkomstbericht aanpassen taal',
    body:
      '<p>Alles daarvoor staat op de pagina <strong>AI Persoonlijkheid</strong>.</p>' +
      '<ul>' +
      '<li><strong>Naam</strong>: hoe je AI zich voorstelt aan je leads.</li>' +
      '<li><strong>Welkomstbericht</strong>: het allereerste bericht dat een lead ontvangt.</li>' +
      '<li><strong>Instructies</strong>: het belangrijkste veld. Hier zet je wat je bedrijf doet, wat voor jou een goede lead is, en wat de AI juist niet mag beloven. Hoe concreter, hoe beter de gesprekken.</li>' +
      '<li><strong>Website en adres</strong>: de AI gebruikt die om vragen over openingsuren, locatie en tarieven te beantwoorden.</li>' +
      '</ul>' +
      '<p>Wijzigingen gelden meteen voor het volgende gesprek. Lopende gesprekken blijven op de oude instellingen doorlopen.</p>' },

  { id: 'whatsapp', sec: 'Je AI instellen', title: 'Je WhatsApp-nummer koppelen',
    tags: 'whatsapp nummer koppelen meta telefoon aansluiten',
    body:
      '<p>Dit stel je niet zelf in, en dat is geen beperking van Helvaro. Meta moet elk zakelijk WhatsApp-nummer eerst goedkeuren, en dat traject regelen wij voor je.</p>' +
      '<p>Het duurt meestal een paar dagen. Je hoeft ondertussen niets te doen, we nemen contact op zodra het kan.</p>' +
      '<p>Ben je er al klaar voor? Laat het weten via de knop op je dashboard of mail ons, dan pakken we het sneller op.</p>' +
      '<p>Tot dan werkt je leadformulier gewoon: leads komen binnen en de AI praat met ze via het formulier.</p>' },

  { id: 'agenda', sec: 'Je AI instellen', title: 'Google Agenda koppelen',
    tags: 'agenda kalender google afspraak boeken beschikbaarheid koppelen',
    body:
      '<p>Koppel je agenda en de AI kan echt boeken in plaats van alleen een link te sturen.</p>' +
      '<ol>' +
      '<li>Ga naar <strong>Dashboard</strong> en klik op <strong>Koppelen</strong> bij Google Agenda. Je kunt het ook via <strong>Instellingen</strong> doen.</li>' +
      '<li>Log in bij Google en geef toestemming.</li>' +
      '<li>Klaar. De AI controleert vanaf nu je vrije momenten voordat hij iets voorstelt.</li>' +
      '</ol>' +
      '<p>Zonder koppeling blijft alles werken, maar dan stuurt de AI een boekingslink en moet de lead zelf een moment kiezen.</p>' },

  { id: 'overnemen', sec: 'Dagelijks gebruik', title: 'Een gesprek zelf overnemen',
    tags: 'overnemen takeover mens zelf antwoorden pauzeren ai stoppen chatten',
    body:
      '<p>Soms wil je er zelf in. Dat kan op elk moment.</p>' +
      '<ol>' +
      '<li>Open de lead vanuit <strong>Gesprekken</strong> of <strong>Pipeline</strong>.</li>' +
      '<li>Bovenaan het gesprek staat een balk met de status: <strong>AI actief</strong> of <strong>Mens aan het roer</strong>.</li>' +
      '<li>Zet hem op <em>Mens aan het roer</em> en de AI stopt onmiddellijk met antwoorden in dat gesprek.</li>' +
      '</ol>' +
      '<p>Je typt daarna zelf. Zet je de schakelaar terug, dan pikt de AI het gesprek weer op met alles wat er ondertussen gezegd is.</p>' },

  { id: 'pipeline', sec: 'Dagelijks gebruik', title: 'Werken met de pipeline',
    tags: 'pipeline fase kolom slepen status opvolging kanban',
    body:
      '<p>De <strong>Pipeline</strong> toont je leads als kaarten in kolommen, van eerste contact tot gewonnen of verloren.</p>' +
      '<p>Sleep een kaart naar een andere kolom om de fase bij te werken. Dat is puur voor jou: de lead merkt er niets van en de AI verandert er zijn gedrag niet door.</p>' +
      '<p>Klik op een kaart voor het volledige gesprek, de score, en waarom de AI deze lead wel of niet gekwalificeerd heeft.</p>' },

  { id: 'export', sec: 'Dagelijks gebruik', title: 'Leads exporteren',
    tags: 'export exporteren csv excel downloaden bestand rapport',
    body:
      '<p>Rechtsboven op het dashboard staat <strong>CSV Export</strong>. Dat downloadt al je leads als bestand dat je in Excel, Numbers of Google Sheets opent.</p>' +
      '<p>Je krijgt naam, telefoon, status, bron, score, urgentie, verwachte waarde, datum en de samenvatting van het gesprek.</p>' +
      '<p>Onder <strong>Exports</strong> vind je daarnaast rapporten per periode.</p>' },

  { id: 'credits', sec: 'Account', title: 'Wat zijn AI-credits?',
    tags: 'credits verbruik limiet kosten opraken tegoed bundel',
    body:
      '<p>Elk AI-bericht dat namens jou verstuurd wordt, kost een credit. Linksonder in de zijbalk zie je hoeveel je er deze maand gebruikt hebt.</p>' +
      '<p>Zit je tegen je limiet aan, dan waarschuwen we je ruim op tijd. We zetten je AI nooit zomaar stil zonder iets te zeggen.</p>' +
      '<p>Zie je die balk niet staan? Dan geldt er voor jouw account geen maandlimiet en hoef je hier niet naar te kijken.</p>' +
      '<p>Meer nodig? Mail ons, dan verhogen we het.</p>' },

  { id: 'proef', sec: 'Account', title: 'Proefperiode en abonnement',
    tags: 'proefperiode trial abonnement betalen opzeggen factuur prijs 14 dagen',
    body:
      '<p>Je start met een proefperiode van 14 dagen met alle functies. Je hoeft daarvoor geen kaartgegevens achter te laten.</p>' +
      '<p>Loopt de proef af, dan blijft je account en alles wat erin staat gewoon bestaan. De AI stopt alleen met nieuwe gesprekken tot je overstapt.</p>' +
      '<p>Wil je verlengen, overstappen of stoppen? Eén mailtje volstaat, er zit geen opzegtermijn aan vast.</p>' },

  { id: 'privacy', sec: 'Account', title: 'Privacy, AVG en leads verwijderen',
    tags: 'privacy avg gdpr verwijderen wissen gegevens data bewaren recht vergeten',
    body:
      '<p>Je leads zijn van jou. Wij gebruiken ze niet voor iets anders en verkopen ze niet door.</p>' +
      '<p>Vraagt een lead om verwijdering, of wil je zelf iets weg? Stuur ons het verzoek via de knop hieronder. Verwijderen gebeurt bij ons handmatig en niet met een knop in je dashboard, juist omdat het onomkeerbaar is en we willen dat er iemand naar kijkt.</p>' +
      '<p>Je kunt kiezen tussen <strong>anonimiseren</strong> (naam, nummer en gesprek worden gewist, je statistieken blijven kloppen) en <strong>volledig verwijderen</strong> (de lead verdwijnt helemaal).</p>' +
      '<p>Je AI vertelt eerlijk dat hij een AI is als een lead daarnaar vraagt. Dat is verplicht en staat vast.</p>' }
];

var _helpOpen = false;
var _helpInited = false;

function _helpPlain(html) {
  var d = document.createElement('div');
  d.innerHTML = html;
  return (d.textContent || '').toLowerCase();
}

function renderHelpList(query) {
  var body = document.getElementById('hv-help-body');
  if (!body) return;
  var q = String(query || '').trim().toLowerCase();
  var hits = HELP_ARTICLES.filter(function (a) {
    if (!q) return true;
    return (a.title + ' ' + a.tags + ' ' + _helpPlain(a.body)).toLowerCase().indexOf(q) > -1;
  });

  body.innerHTML = '';

  if (!hits.length) {
    var empty = document.createElement('div');
    empty.className = 'hv-help-empty';
    // textContent, not innerHTML — the query is user input and must never
    // be parsed as markup, even inside our own panel.
    empty.textContent = 'Niets gevonden. Stuur ons gerust een bericht, we antwoorden meestal dezelfde dag.';
    body.appendChild(empty);
    return;
  }

  var lastSec = '';
  hits.forEach(function (a) {
    if (a.sec !== lastSec) {
      lastSec = a.sec;
      var h = document.createElement('div');
      h.className = 'hv-help-sec';
      h.textContent = a.sec;
      body.appendChild(h);
    }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hv-help-item';
    var label = document.createElement('span');
    label.textContent = a.title;
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend',
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>');
    btn.addEventListener('click', function () { renderHelpArticle(a.id); });
    body.appendChild(btn);
  });
}

function renderHelpArticle(id) {
  var a = HELP_ARTICLES.filter(function (x) { return x.id === id; })[0];
  if (!a) return renderHelpList('');
  var body = document.getElementById('hv-help-body');
  if (!body) return;

  body.innerHTML = '';
  var back = document.createElement('button');
  back.type = 'button';
  back.className = 'hv-help-back';
  back.insertAdjacentHTML('afterbegin',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>');
  back.appendChild(document.createTextNode('Alle onderwerpen'));
  back.addEventListener('click', function () {
    var qEl = document.getElementById('hv-help-q');
    renderHelpList(qEl ? qEl.value : '');
  });
  body.appendChild(back);

  var art = document.createElement('div');
  art.className = 'hv-help-article';
  // Static, author-written HTML from HELP_ARTICLES above. No user input
  // reaches this string.
  art.innerHTML = '<h3></h3>' + a.body;
  art.querySelector('h3').textContent = a.title;
  body.appendChild(art);
  body.scrollTop = 0;
}

function openHelp() {
  var panel = document.getElementById('hv-help-panel');
  var btn   = document.getElementById('hv-help-launcher');
  if (!panel || !btn) return;
  _helpOpen = true;
  panel.classList.add('is-open');
  panel.setAttribute('aria-hidden', 'false');
  btn.classList.add('is-open');
  btn.classList.remove('has-dot');
  btn.setAttribute('aria-expanded', 'true');
  try { localStorage.setItem('hv-help-seen', '1'); } catch (e) {}
  var q = document.getElementById('hv-help-q');
  if (q) { q.value = ''; }
  renderHelpList('');
  // Only pull focus on pointer-capable screens; on mobile this would fling
  // the keyboard open before the user has read anything.
  if (q && window.matchMedia('(min-width: 521px)').matches) setTimeout(function () { q.focus(); }, 80);
}

function closeHelp() {
  var panel = document.getElementById('hv-help-panel');
  var btn   = document.getElementById('hv-help-launcher');
  if (!panel || !btn) return;
  _helpOpen = false;
  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');
  btn.classList.remove('is-open');
  btn.setAttribute('aria-expanded', 'false');
}

function toggleHelp() { if (_helpOpen) closeHelp(); else openHelp(); }

function initHelpWidget() {
  var btn = document.getElementById('hv-help-launcher');
  if (!btn) return;
  btn.style.display = 'flex';

  if (_helpInited) return;
  _helpInited = true;

  var seen = false;
  try { seen = localStorage.getItem('hv-help-seen') === '1'; } catch (e) {}
  if (!seen) btn.classList.add('has-dot');

  btn.addEventListener('click', toggleHelp);

  var q = document.getElementById('hv-help-q');
  if (q) q.addEventListener('input', function () { renderHelpList(q.value); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _helpOpen) { closeHelp(); btn.focus(); }
  });

  // Click-away. Registered in the CAPTURE phase on purpose: opening an
  // article replaces the panel's contents synchronously inside the item's
  // own click handler, so by the time a bubble-phase listener ran, the
  // clicked button was already detached and panel.contains(e.target) came
  // back false — every article click closed the panel. Capture runs before
  // the target handler, while the node is still in the tree.
  // The launcher is excluded because it has its own toggle handler and
  // would otherwise close-then-immediately-reopen.
  document.addEventListener('click', function (e) {
    if (!_helpOpen) return;
    var panel = document.getElementById('hv-help-panel');
    if (!panel) return;
    if (panel.contains(e.target) || btn.contains(e.target)) return;
    closeHelp();
  }, true);

  renderHelpList('');
}

function hideHelpWidget() {
  var btn = document.getElementById('hv-help-launcher');
  closeHelp();
  if (btn) btn.style.display = 'none';
}

/* ============================================================
   INIT
   ============================================================ */
(async function init() {
  initTheme();

  // ── Clerk owns sign-in when it is on ────────────────────────────────────
  // Returns early so none of the legacy session logic below runs: no
  // localStorage markers, no tryAutoLogin, no custom login form. Clerk decides
  // whether we are signed in, and the API is reached with its bearer token.
  if (CLERK_READY) {
    const clerk = await clerkInit();
    if (!clerk) {
      // Clerk stond aan maar laadde niet: script geblokkeerd, storing bij
      // Clerk, of — het geval dat dit echt liet zien — een productie-instantie
      // waarvan de DNS nog niet staat, zodat clerk.<domein> niet resolvet.
      //
      // Hier stond een return met "inloggen is tijdelijk niet beschikbaar".
      // Dat maakte het erger dan nodig: het wachtwoordformulier bleef zichtbaar
      // maar kreeg nooit een handler, dus je zag een inlogscherm dat niet
      // reageerde, en NIEMAND kon nog in de app — ook niet met een geldig
      // wachtwoord. Terwijl de server beide manieren gewoon accepteert: als
      // Clerk er niet is geeft clerkToken() een lege string terug en valt elke
      // API-call terug op de gewone sessie.
      //
      // Dus niet stoppen, maar doorvallen naar de klassieke inlog. Eén
      // externe partij die eruit ligt hoort het product niet te sluiten.
      console.warn('[clerk] niet geladen — terug naar de klassieke inlog met e-mail en wachtwoord');
      const el = document.getElementById('clerk-signin');
      if (el) el.style.display = 'none';
      const wrap = document.getElementById('login-form-wrap');
      if (wrap) wrap.style.display = 'block';
      // en verder met het legacy-pad hieronder (geen return)
    } else {
      if (!clerk.user) {
        document.getElementById('login-page').style.display = 'flex';
        mountClerkSignIn(clerk);
        return;
      }
      // Signed in. The tenant comes from the server, not from anything the page
      // could tamper with — state.clientName is only ever used as a label.
      state.clientName = clerk.user.publicMetadata?.clientName || '';
      state.userEmail  = clerk.user.primaryEmailAddress?.emailAddress || '';
      state.apiKey     = 'clerk-session';   // sentinel; see tryAutoLogin's note
      let data = null;
      try {
        data = await fetchLeads();
      } catch (e) {
        // A signed-in user who has not been assigned to a client yet. Their
        // credentials are fine; there is simply nothing for them to see. Saying
        // "login mislukt" here would be both wrong and alarming.
        if (String(e && e.message || '').indexOf('403') > -1 || window.__hvTenantPending) {
          showTenantPending(clerk);
          return;
        }
        data = null;
      }
      state.leads = (data && data.leads) || [];
      state.stats = (data && data.stats) || {};
      state.lastFetch = Date.now();
      await startDashboard(true);
      return;
    }
  }

  // ?reset. Wis sessie en toon login (escape hatch voor geblokkeerde sessies)
  const _initParams = new URLSearchParams(window.location.search);
  if (_initParams.get('reset') !== null) {
    clearSession();
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // Auto-login from onboarding link: ?welcome=APIKEY&name=NAME&project=CODE
  const _welcomeKey = _initParams.get('welcome');
  if (_welcomeKey) {
    const _wName    = decodeURIComponent(_initParams.get('name')    || '');
    const _wProject = decodeURIComponent(_initParams.get('project') || '');
    window.history.replaceState({}, document.title, window.location.pathname); // clean URL
    saveSession(_welcomeKey, _wName, _wProject, '');
    try {
      const data = await fetchLeads();
      if (!data.rateLimited && !data.stale) {
        state.leads    = data.leads || [];
        state.stats    = data.stats || {};
        state.clientName = _wName || data.client?.naam || 'Gebruiker';
        state.lastFetch  = Date.now();
        if (state.leads.length > 0) saveLeadsToLS(state.leads, state.stats);
      }
    } catch { state.leads = []; state.stats = {}; }
    await startDashboard(true);
    return;
  }

  if (tryAutoLogin()) {
    // Small random delay (0–4s) so multiple tabs opened at once don't all hit
    // Airtable in the same second.  localStorage data renders immediately; the
    // fetch just refreshes it a moment later.
    const lsImmediate = loadLeadsFromLS();
    if (lsImmediate) {
      state.leads = lsImmediate.leads;
      state.stats = lsImmediate.stats || {};
    }
    await new Promise(r => setTimeout(r, Math.random() * 4000));

    // Fetch leads. On rate-limit or error fall back to localStorage so the
    // dashboard shows cached data immediately instead of blank zeros.
    try {
      const data = await fetchLeads();
      if (!data.rateLimited && !data.stale) {
        state.leads    = data.leads || [];
        state.stats    = data.stats || {};
        state.clientName  = state.clientName || data.client?.naam || 'Gebruiker';
        state.lastFetch   = Date.now();
        if (state.leads.length > 0) saveLeadsToLS(state.leads, state.stats);
      } else {
        // Rate-limited. Try localStorage first, then accept empty state
        const lsCache = loadLeadsFromLS();
        if (lsCache) { state.leads = lsCache.leads; state.stats = lsCache.stats || {}; }
        else { state.leads = []; state.stats = {}; }
        state.lastFetch = 0;
      }
    } catch {
      // Network error. Same localStorage fallback
      const lsCache = loadLeadsFromLS();
      if (lsCache) { state.leads = lsCache.leads; state.stats = lsCache.stats || {}; }
      else { state.leads = []; state.stats = {}; }
      state.lastFetch = 0;
    }
    // Pass skipRefresh=true. State already populated above, no second Airtable call needed
    await startDashboard(true);
  } else {
    document.getElementById('login-page').style.display = 'flex';
    initLoginSlideshow();
  }
})();

/* ============================================================
   LOGIN SLIDESHOW
   ============================================================ */
function initLoginSlideshow() {
  const slides = document.querySelectorAll('.brand-slide');
  const dots   = document.querySelectorAll('#brand-dots .brand-dot');
  if (!slides.length) return;

  let current = 0;
  let timer = null;

  function goTo(idx) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    if (dots[current].getAttribute('aria-selected') !== null) dots[current].setAttribute('aria-selected', 'false');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
    if (dots[current].getAttribute('aria-selected') !== null) dots[current].setAttribute('aria-selected', 'true');
  }

  function start() {
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  function restart() {
    clearInterval(timer);
    start();
  }

  // Dot click
  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); restart(); });
  });

  start();
}

// ── Documenten Hub ────────────────────────────────────────────────────────
var DOCS_KEY = 'hv-docs-config-v1';

function loadDocsConfig() {
  try { return JSON.parse(localStorage.getItem(DOCS_KEY) || '{}'); } catch(e) { return {}; }
}

function initDocsHub() {
  var cfg = loadDocsConfig();
  // Fill config inputs
  ['embed','pitch','contract','prijslijst','drive'].forEach(function(k) {
    var el = document.getElementById('cfg-' + k);
    if (el && cfg[k]) el.value = cfg[k];
  });
  renderDocsHub(cfg);
}

function renderDocsHub(cfg) {
  cfg = cfg || loadDocsConfig();
  // Embed
  var wrap = document.getElementById('fdr-docs-embed-wrap');
  var placeholder = document.getElementById('fdr-docs-embed-placeholder');
  if (wrap && cfg.embed) {
    placeholder.style.display = 'none';
    var existing = wrap.querySelector('iframe');
    if (!existing) {
      var iframe = document.createElement('iframe');
      iframe.src = cfg.embed;
      iframe.style.cssText = 'width:100%;height:480px;border:none;display:block;';
      iframe.allowFullscreen = true;
      wrap.appendChild(iframe);
    } else {
      existing.src = cfg.embed;
    }
  } else if (placeholder) {
    placeholder.style.display = '';
    var old = wrap ? wrap.querySelector('iframe') : null;
    if (old) old.remove();
  }
  // Cards
  var cardMap = { pitch: 'fdr-doc-pitch', contract: 'fdr-doc-contract', prijslijst: 'fdr-doc-prijslijst', drive: 'fdr-doc-drive' };
  Object.keys(cardMap).forEach(function(k) {
    var card = document.getElementById(cardMap[k]);
    if (!card) return;
    if (cfg[k]) {
      card.href = cfg[k];
      card.classList.remove('fdr-doc-card-nolink');
    } else {
      card.removeAttribute('href');
      card.classList.add('fdr-doc-card-nolink');
    }
  });
}

function toggleDocsConfig() {
  var panel = document.getElementById('fdr-docs-cfg');
  if (panel) panel.classList.toggle('open');
}

function saveDocsConfig() {
  var cfg = {};
  ['embed','pitch','contract','prijslijst','drive'].forEach(function(k) {
    var el = document.getElementById('cfg-' + k);
    if (el && el.value.trim()) cfg[k] = el.value.trim();
  });
  try { localStorage.setItem(DOCS_KEY, JSON.stringify(cfg)); } catch(e) {}
  renderDocsHub(cfg);
  toggleDocsConfig();
  toast('Links opgeslagen', 'success');
}

// ── Outreach Tracker ───────────────────────────────────────────────────────
var OUTREACH_TARGETS = { dms: 20, emails: 10, demos: 3, follows: 10 };
var OUTREACH_TOTAL_TARGET = 43;

function getOutreachKey() {
  var d = new Date();
  var jan1 = new Date(d.getFullYear(), 0, 1);
  var week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return 'hv-outreach-w' + d.getFullYear() + '-' + week;
}

function loadOutreachData() {
  try { return JSON.parse(localStorage.getItem(getOutreachKey()) || 'null') || { dms:0, emails:0, demos:0, follows:0 }; }
  catch(e) { return { dms:0, emails:0, demos:0, follows:0 }; }
}

function saveOutreachData(data) {
  try { localStorage.setItem(getOutreachKey(), JSON.stringify(data)); } catch(e) {}
}

function initOutreachTracker() {
  var d = new Date();
  var weekEl = document.getElementById('fdr-outreach-week');
  if (weekEl) {
    var monOffset = (d.getDay() + 6) % 7;
    var mon = new Date(d); mon.setDate(d.getDate() - monOffset);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var fmt = function(dt) { return dt.getDate() + '/' + (dt.getMonth()+1); };
    weekEl.textContent = 'Week van ' + fmt(mon) + ' → ' + fmt(sun);
  }
  renderOutreach();
}

function renderOutreach() {
  var data = loadOutreachData();
  var total = data.dms + data.emails + data.demos + data.follows;
  var pct   = Math.min(100, Math.round((total / OUTREACH_TOTAL_TARGET) * 100));
  ['dms','emails','demos','follows'].forEach(function(k) {
    var el = document.getElementById('or-' + k);
    if (el) el.textContent = data[k];
  });
  var pctEl = document.getElementById('or-total-pct');
  if (pctEl) pctEl.textContent = 'Totaal: ' + total + ' acties. ' + pct + '% van weekdoel (' + OUTREACH_TOTAL_TARGET + ')';
  var bar = document.getElementById('or-bar');
  if (bar) bar.style.width = pct + '%';
}

function logOutreach(type) {
  var data = loadOutreachData();
  data[type] = (data[type] || 0) + 1;
  saveOutreachData(data);
  renderOutreach();
  toast('+1 ' + { dms:'LinkedIn DM', emails:'Cold Email', demos:"Demo", follows:'Follow-up' }[type], 'success');
}

function resetOutreach() {
  try { localStorage.removeItem(getOutreachKey()); } catch(e) {}
  renderOutreach();
  toast('Week gereset', 'success');
}

// ── Bouw Tracker ──────────────────────────────────────────────────────────
var BOUW_DEFAULT = [
  { text: 'Calendly integratie end-to-end testen', tag: 'test', done: false },
  { text: 'WhatsApp webhook response tijd checken', tag: 'test', done: false },
  { text: 'Onboarding flow testen als nieuwe klant', tag: 'test', done: false },
  { text: 'Vercel logs. Errors controleren', tag: 'fix', done: false },
  { text: 'Airtable leads opruimen & archiveren', tag: 'fix', done: false },
  { text: 'Dashboard performance optimaliseren', tag: 'feat', done: false },
  { text: 'Nieuwe feature implementeren (sprint)', tag: 'feat', done: false }
];

function loadBouwItems() {
  try { return JSON.parse(localStorage.getItem('hv-bouw-items') || 'null') || JSON.parse(JSON.stringify(BOUW_DEFAULT)); }
  catch(e) { return JSON.parse(JSON.stringify(BOUW_DEFAULT)); }
}

function saveBouwItems(items) {
  try { localStorage.setItem('hv-bouw-items', JSON.stringify(items)); } catch(e) {}
}

function initBouwTracker() { renderBouwList(); }

function renderBouwList() {
  var items = loadBouwItems();
  var list  = document.getElementById('fdr-bouw-list');
  var prog  = document.getElementById('fdr-bouw-progress');
  if (!list) return;
  var done  = items.filter(function(i) { return i.done; }).length;
  if (prog) prog.textContent = done + '/' + items.length + ' taken afgewerkt';
  list.innerHTML = items.map(function(item, idx) {
    return '<div class="fdr-bouw-item' + (item.done ? ' done' : '') + '" onclick="toggleBouwItem(' + idx + ')">' +
      '<div class="fdr-bouw-cb">' + (item.done ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" stroke-width="3.5"><polyline points="20 6 9 17 4 12"/></svg>' : '') + '</div>' +
      '<span class="fdr-bouw-item-text">' + escHtml(item.text) + '</span>' +
      '<span class="fdr-bouw-tag ' + item.tag + '">' + item.tag + '</span>' +
    '</div>';
  }).join('');
}

function toggleBouwItem(idx) {
  var items = loadBouwItems();
  if (items[idx]) items[idx].done = !items[idx].done;
  saveBouwItems(items);
  renderBouwList();
}

function addBouwItem() {
  var input = document.getElementById('fdr-bouw-input');
  if (!input || !input.value.trim()) return;
  var items = loadBouwItems();
  items.push({ text: input.value.trim(), tag: 'feat', done: false });
  saveBouwItems(items);
  input.value = '';
  renderBouwList();
}

// ── Persona (Frade / Teljo) ───────────────────────────────────────────────
var PERSONA_KEY = 'hv-founder-user';
function getPersona() {
  try { return localStorage.getItem(PERSONA_KEY) || ''; } catch (e) { return ''; }
}
function setPersona(name) {
  try { localStorage.setItem(PERSONA_KEY, name); } catch (e) {}
  var ov = document.getElementById('persona-overlay');
  if (ov) ov.classList.remove('open');
  updatePersonaGreeting();
  // Re-render checklist with personalized filter
  if (typeof renderDailyChecklist === 'function') renderDailyChecklist();
}
function showPersonaPicker() {
  var ov = document.getElementById('persona-overlay');
  if (ov) ov.classList.add('open');
}
function clearPersona() {
  try { localStorage.removeItem(PERSONA_KEY); } catch (e) {}
  showPersonaPicker();
}
function updatePersonaGreeting() {
  var el = document.getElementById('fdr-persona-greeting');
  if (!el) return;
  var p = getPersona();
  if (!p) { el.innerHTML = ''; return; }
  el.innerHTML = 'Welkom <strong>' + escHtml(p) + '</strong>. jouw taken zijn gemarkeerd. <button class="fdr-persona-switch" onclick="clearPersona()">wissel</button>';
}

// ── Live Klanten ──────────────────────────────────────────────────────────
var MRR_KEY = 'hv-client-mrr-v1';
function loadMrrMap() {
  try { return JSON.parse(localStorage.getItem(MRR_KEY) || '{}'); } catch (e) { return {}; }
}
function saveMrrMap(map) {
  try { localStorage.setItem(MRR_KEY, JSON.stringify(map)); } catch (e) {}
}
function setClientMrr(id, amount) {
  var map = loadMrrMap();
  var n = Number(amount) || 0;
  if (n <= 0) delete map[id]; else map[id] = n;
  saveMrrMap(map);
  renderMrrTotalsFromMap();
}
function fmtEuro(n) {
  return '€' + Math.round(n).toLocaleString('nl-BE');
}
function fmtTenure(firstLeadDate) {
  if (!firstLeadDate) return '—';
  var then = new Date(firstLeadDate);
  if (isNaN(then.getTime())) return '—';
  var months = Math.max(0, Math.floor((Date.now() - then.getTime()) / (30 * 86400000)));
  if (months < 1) {
    var days = Math.floor((Date.now() - then.getTime()) / 86400000);
    return days + (days === 1 ? ' dag' : ' dagen');
  }
  return months + (months === 1 ? ' maand' : ' maanden');
}
function renderLiveClients(clients) {
  var tbody = document.getElementById('fdr-live-tbody');
  var count = document.getElementById('fdr-live-count');
  if (!tbody) return;
  if (!clients || !clients.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="fdr-live-empty">Nog geen klanten.</td></tr>';
    if (count) count.textContent = '';
    return;
  }
  var ONLINE_WINDOW = 5 * 60 * 1000; // 5 min
  var now = Date.now();
  var mrrMap = loadMrrMap();
  var onlineCount = 0;
  var rows = clients.map(function(c) {
    var isOnline = c.lastSeen && (now - c.lastSeen) < ONLINE_WINDOW;
    if (isOnline) onlineCount++;
    var statusTxt = isOnline ? 'Online' :
      (c.lastSeen ? 'Laatst ' + relTime(c.lastSeen) : 'Nooit ingelogd');
    var mrr = mrrMap[c.id] || 0;
    return '<tr>' +
      '<td><div class="fdr-live-name">' + escHtml(c.naam || '—') + '</div>' +
        '<div class="fdr-live-meta">' + escHtml(c.projectCode || '') + '</div></td>' +
      '<td><span class="fdr-live-dot ' + (isOnline ? 'online' : 'offline') + '"></span>' +
        '<span style="font-size:12px;color:' + (isOnline ? 'var(--green)' : 'var(--text-muted)') + '">' + statusTxt + '</span></td>' +
      '<td class="fdr-live-stat">' + fmtTenure(c.firstLeadDate) + '</td>' +
      '<td class="fdr-live-stat" style="text-align:right">' + (c.totalLeads || 0) + '</td>' +
      '<td class="fdr-live-stat" style="text-align:right">' + (c.appointments || 0) + '</td>' +
      '<td style="text-align:right"><input class="fdr-live-mrr-input" type="number" min="0" step="1" value="' + mrr + '" onchange="setClientMrr(\\'' + escHtml(c.id) + '\\', this.value)" placeholder="€"></td>' +
    '</tr>';
  }).join('');
  tbody.innerHTML = rows;
  if (count) count.innerHTML = '<span class="online-num">' + onlineCount + '</span> / ' + clients.length + ' online';
  renderMrrTotalsFromMap();
}
function relTime(ts) {
  var diff = Date.now() - ts;
  if (diff < 60_000) return 'net';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' min';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' u';
  return Math.floor(diff / 86400_000) + ' d';
}
function renderMrrTotalsFromMap() {
  var map = loadMrrMap();
  var total = 0, count = 0;
  Object.keys(map).forEach(function(k) { if (map[k] > 0) { total += map[k]; count++; } });
  var v = document.getElementById('fdr-mrr-val');
  var s = document.getElementById('fdr-mrr-sub');
  if (v) v.textContent = fmtEuro(total);
  if (s) s.textContent = count + ' betalende ' + (count === 1 ? 'klant' : 'klanten');
  renderProfit(total);
}
function renderProfit(mrr) {
  var costs = loadCosts();
  var fixed = costs.fixed || 0;
  var variable = costs.variable || 0;
  var profit = mrr - fixed - variable;
  var fEl = document.getElementById('fdr-cost-fixed');
  var vEl = document.getElementById('fdr-cost-var');
  var pEl = document.getElementById('fdr-profit-val');
  var mEl = document.getElementById('fdr-profit-marge');
  if (fEl) fEl.textContent = '-' + fmtEuro(fixed);
  if (vEl) vEl.textContent = '-' + fmtEuro(variable);
  if (pEl) {
    pEl.textContent = (profit >= 0 ? '' : '-') + fmtEuro(Math.abs(profit));
    pEl.style.color = profit >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (mEl) {
    var margin = mrr > 0 ? Math.round((profit / mrr) * 100) : 0;
    mEl.textContent = 'Marge: ' + margin + '%';
  }
}

// ── Costs (editable on click) ─────────────────────────────────────────────
var COSTS_KEY = 'hv-costs-v1';
function loadCosts() {
  try { return JSON.parse(localStorage.getItem(COSTS_KEY) || '{"fixed":58,"variable":0}'); }
  catch (e) { return { fixed: 58, variable: 0 }; }
}
function saveCosts(c) { try { localStorage.setItem(COSTS_KEY, JSON.stringify(c)); } catch (e) {} }
function editCost(kind) {
  var current = loadCosts();
  var label = kind === 'fixed' ? 'Vaste kosten' : 'Variabele kosten';
  var v = prompt(label + ' per maand (€):', current[kind] || 0);
  if (v === null) return;
  var n = Math.max(0, Math.round(Number(v) || 0));
  current[kind] = n;
  saveCosts(current);
  renderMrrTotalsFromMap();
}

// ── Meeting widget ────────────────────────────────────────────────────────
var MEETING_KEY = 'hv-meeting-v1';
function loadMeeting() {
  try { return JSON.parse(localStorage.getItem(MEETING_KEY) || 'null'); } catch (e) { return null; }
}
function saveMeeting() {
  var dt = document.getElementById('fdr-meeting-date');
  var tp = document.getElementById('fdr-meeting-topic');
  if (!dt || !dt.value) { toast('Kies een datum', 'warning'); return; }
  var m = { when: dt.value, topic: (tp && tp.value || '').trim() };
  try { localStorage.setItem(MEETING_KEY, JSON.stringify(m)); } catch (e) {}
  renderMeeting();
  toast('Meeting opgeslagen', 'success');
}
function renderMeeting() {
  var m = loadMeeting();
  var w = document.getElementById('fdr-meeting-when');
  var a = document.getElementById('fdr-meeting-agenda');
  var dt = document.getElementById('fdr-meeting-date');
  var tp = document.getElementById('fdr-meeting-topic');
  if (!w) return;
  if (!m || !m.when) {
    w.textContent = '—';
    if (a) { a.textContent = 'Geen meeting gepland'; a.className = 'fdr-meeting-empty'; }
    return;
  }
  var when = new Date(m.when);
  if (isNaN(when.getTime())) { w.textContent = '—'; return; }
  var diffMs = when.getTime() - Date.now();
  var inDays = Math.ceil(diffMs / 86400000);
  var datePart = when.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' });
  var timePart = when.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });
  var rel = inDays < 0 ? '(voorbij)' : inDays === 0 ? '(vandaag)' : inDays === 1 ? '(morgen)' : '(over ' + inDays + ' dagen)';
  w.textContent = datePart + ' • ' + timePart + ' ' + rel;
  if (a) {
    a.className = 'fdr-meeting-agenda';
    a.textContent = m.topic ? 'Agenda: ' + m.topic : 'Geen agenda ingesteld';
  }
  if (dt) dt.value = m.when;
  if (tp) tp.value = m.topic || '';
}

// ── Presence ping (every 60s while logged in) ─────────────────────────────
var _presenceTimer = null;
function startPresencePing() {
  if (_presenceTimer) return;
  function ping() {
    if (!state.apiKey) return;
    fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': state.apiKey },
      body: JSON.stringify({ mode: 'presence-ping', clientName: state.clientName || '' })
    }).catch(function() { /* silent */ });
  }
  ping();                              // fire immediately
  _presenceTimer = setInterval(ping, 60_000);
}

function stopPresencePing() {
  if (_presenceTimer) { clearInterval(_presenceTimer); _presenceTimer = null; }
}

/* ============================================================
   ZWARE BIBLIOTHEKEN PAS LADEN ALS DE PAGINA STAAT
   ============================================================
   jspdf en qrcode stonden als gewone script-tags in de <head>. Samen 130 KB
   gecomprimeerd (jspdf 117, qrcode 13) die de browser eerst moest binnenhalen,
   parsen en uitvoeren voordat er ook maar iets in beeld kwam — terwijl ze
   alleen nodig zijn bij een PDF-export of het bekijken van de formulier-QR.
   Op de meeste bezoeken wordt geen van beide ooit aangeraakt.

   Nu laden ze pas wanneer de browser klaar is met het echte werk. Twee vangnetten
   houden dit veilig:
   - requestIdleCallback bestaat niet in Safari, vandaar de setTimeout-terugval.
   - Klikt iemand sneller dan het laden, dan vangen de bestaande guards in
     exportPDF() en renderQrDataUrl() dat af met een nette melding in plaats van
     een crash. Daarom hoefden die functies zelf niet async te worden — dat zou
     een lange keten aanroepen hebben geraakt voor een winst van niks.
   ============================================================ */
function loadVendorScript(src) {
  return new Promise(function (resolve) {
    if (document.querySelector('script[src="' + src + '"]')) return resolve(true);
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload  = function () { resolve(true); };
    // Faalt zacht: zonder de bibliotheek werkt de rest van het dashboard
    // gewoon door, alleen die ene knop meldt straks dat hij niet klaar is.
    s.onerror = function () { console.warn('[vendor] kon niet laden:', src); resolve(false); };
    document.head.appendChild(s);
  });
}

function loadVendorsWhenIdle() {
  var go = function () {
    loadVendorScript('/vendor/qrcode.js');
    loadVendorScript('/vendor/jspdf.umd.min.js');
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(go, { timeout: 4000 });
  } else {
    setTimeout(go, 1500);
  }
}

if (document.readyState === 'complete') loadVendorsWhenIdle();
else window.addEventListener('load', loadVendorsWhenIdle);

/* ═══ AI WORKSPACE (api/_ai/ui/client.js) ═══ */
${ai.js}
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // 'no-cache', niet 'no-store'. Het verschil is niet cosmetisch: no-store
  // verbiedt de browser om de pagina überhaupt te bewaren, dus haalde elke
  // navigatie — refresh, terugknop, nieuw tabblad — de volledige 200 KB opnieuw
  // op. Terwijl deze HTML voor iedereen identiek is en per deploy verandert;
  // alle persoonlijke gegevens komen los binnen via /api/leads.
  //
  // Met no-cache mag de browser hem bewaren maar moet hij elke keer navragen.
  // Vercel zet al een ETag, dus dat navragen levert een 304 zonder body op:
  // dezelfde versheid, bijna geen verkeer. 'private' blijft staan zodat geen
  // enkele tussenliggende proxy hem deelt.
  res.setHeader('Cache-Control', 'private, no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Uit Google houden. Dit is een ingelogde applicatie, geen pagina die je in
  // zoekresultaten wil. Het stond er niet, en omdat www.helvaro.pro per ongeluk
  // aan dit Vercel-project hangt, indexeerde Google dit inlogscherm als het
  // hoofdresultaat voor "helvaro" — met de wizardteksten als omschrijving,
  // in plaats van de marketingsite.
  //
  // Bewust GEEN robots.txt-blokkade erbij: die zou het crawlen verbieden,
  // waardoor Google deze header nooit ziet en de al geïndexeerde URL blijft
  // staan. Crawlen mag, indexeren niet — zo verdwijnt hij vanzelf.
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  // Content-Security-Policy.
  //
  // 'unsafe-inline' is niet te vermijden: deze pagina is één groot inline
  // script plus ~170 onclick-attributen en ~395 inline style-attributen. Dat
  // wegwerken is een echte refactor, geen header. De CSP stopt dus GEEN
  // geïnjecteerd inline script — dat blijft het werk van escHtml(). Wat hij wel
  // doet: een <script src="https://kwaadaardig..."> weren, wegsluizen van data
  // naar een vreemde host blokkeren (connect-src), plugins uitzetten, en
  // framing verbieden naast de bestaande X-Frame-Options.
  //
  // Clerk is de reden dat dit niet zomaar 'self' kan zijn: de inlogpagina laadt
  // clerk.browser.js van de Frontend API-host en praat daar daarna mee. Die
  // host staat hieronder alleen in de lijst als Clerk ook echt aanstaat, zodat
  // de policy niet losser is dan nodig. Zonder deze twee regels is inloggen
  // stuk — het script wordt dan geblokkeerd, niet de aanvaller.
  const clerkSrc = CLERK_READY ? ` https://${CLERK_HOST}` : '';
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${clerkSrc}`,
    `connect-src 'self'${clerkSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",       // Vercel Blob + Clerk-avatars
    "font-src 'self' data:",             // zelf gehost, geen Google Fonts (AVG)
    "worker-src 'self' blob:",           // Clerk gebruikt een blob-worker
    "frame-src 'self'" + clerkSrc,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));

  res.status(200).send(HTML);
};
