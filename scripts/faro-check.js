#!/usr/bin/env node
'use strict';
/*
 * Static checks for the Faro. No network, no browser.
 *
 *   node scripts/faro-check.js
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Faro's CSS, markup and client script are generated as STRINGS and
 * spliced into api/dashboard.js's template literal. That buys a clean
 * separation, but it moves two whole classes of error from "compile time" to
 * "the page is blank in production":
 *
 *   1. A stray backtick or ${...} in any generated string is evaluated by
 *      dashboard.js's own literal, corrupting the page.
 *   2. A syntax error in the generated client script kills the ENTIRE inline
 *      <script> — including the CRM's code, which is the paying product. This
 *      is not theoretical: it happened once during development, and the symptom
 *      was the whole dashboard silently losing its JavaScript.
 *
 * Neither is caught by `node --check api/dashboard.js`, because at that point
 * the interpolations have not run yet. So they get checked here, for every
 * translated language, since a translation is exactly the kind of edit that
 * introduces an unescaped apostrophe.
 *
 * Run this before any commit that touches api/_faro/ui/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let failures = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures += 1; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

console.log('\nFaro — static checks\n');

// ── 1. Every module loads ───────────────────────────────────────────────────
console.log('modules');
const MODULES = [
  'config', 'schema', 'stream', 'prompt', 'tools', 'actions', 'store', 'media',
  'orchestrator', 'handler', 'fixtures',
  'providers', 'providers/claude', 'providers/openai', 'providers/demo',
  'ui', 'ui/tokens', 'ui/styles', 'ui/markup', 'ui/client', 'ui/icons',
  'ui/i18n', 'ui/quick-actions',
];
for (const m of MODULES) {
  try { require(path.join('..', 'api', '_faro', m)); } catch (err) { fail(`${m}: ${err.message}`); }
}
if (!failures) pass(`${MODULES.length} modules load`);
try { require('../api/faro'); pass('api/faro.js loads'); } catch (err) { fail(`api/faro.js: ${err.message}`); }

// ── 2. Splice safety, per language ──────────────────────────────────────────
console.log('\nsplice safety (no backticks or ${} in generated strings)');
const ui = require('../api/_faro/ui');
const problems = ui.verify();
if (problems.length) problems.forEach(fail);
else pass('clean across all translated languages');

// ── 3. The generated client script parses, per language ─────────────────────
console.log('\ngenerated client script');
const i18n = require('../api/_faro/ui/i18n');
for (const lang of i18n.TRANSLATED) {
  const tmp = path.join(os.tmpdir(), `helvaro-faro-client-${lang}-${process.pid}.js`);
  try {
    fs.writeFileSync(tmp, ui.forLang(lang).js);
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    pass(`${lang}: parses`);
  } catch (err) {
    const out = (err.stderr && err.stderr.toString()) || err.message;
    fail(`${lang}: ${out.split('\n').slice(0, 4).join(' ').trim()}`);
  } finally {
    fs.existsSync(tmp) && fs.unlinkSync(tmp);
  }
}

// ── 4. dashboard.js still parses with the mount points in place ─────────────
console.log('\ndashboard');
try {
  execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'api', 'dashboard.js')], { stdio: 'pipe' });
  pass('api/dashboard.js parses');
} catch (err) {
  fail(`api/dashboard.js: ${(err.stderr || '').toString().split('\n')[0]}`);
}

// Every mount point must still be present — a merge could silently drop one,
// and the failure mode is a missing workspace rather than an error.
const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
for (const marker of ['${faro.css}', '${faro.navCta}', '${faro.dock}', '${faro.page}', '${faro.js}']) {
  if (dash.indexOf(marker) === -1) fail(`mount point missing: ${marker}`);
}
if (dash.indexOf('_faroUI.forLang') === -1) fail('dashboard.js does not bind a language');

// ── 5. The confirmation gate holds ──────────────────────────────────────────
console.log('\nconfirmation gate');
const tools = require('../api/_faro/tools');
const acts = tools.ALL.filter((t) => t.kind === 'act').map((t) => t.name);
if (!acts.length) fail('no act-tools registered');
else if (acts.every((n) => tools.requiresConfirmation(n))) pass(`${acts.length} act-tools all require confirmation`);
else fail('an act-tool does not require confirmation');

const reads = tools.ALL.filter((t) => t.kind === 'read').map((t) => t.name);
if (reads.some((n) => tools.requiresConfirmation(n))) fail('a read-tool requires confirmation');
else pass(`${reads.length} read-tools run without a gate`);

const creates = tools.ALL.filter((t) => t.kind === 'create').map((t) => t.name);
if (creates.some((n) => tools.requiresConfirmation(n))) fail('a create-tool requires confirmation');
else pass(`${creates.length} create-tools run without a gate`);

// The act set is the security boundary, so it is pinned by name rather than by
// count. Anything that reaches a customer, a calendar or a campaign belongs
// here; adding a tool to this list must be a deliberate, reviewed edit.
const EXPECTED_ACT = ['create_followup', 'schedule_followup', 'create_campaign', 'add_leads_to_campaign'];
const actSet = acts.slice().sort().join(',');
if (actSet !== EXPECTED_ACT.slice().sort().join(',')) {
  fail(`act-tool set changed: expected [${EXPECTED_ACT.join(', ')}], got [${acts.join(', ')}]`);
} else pass('act-tool set unchanged (external-consequence tools only)');

// A staged action must never be reachable from another tenant, and a tampered
// one must not be reachable at all. Proposals are now signed rather than
// stored, so SESSION_SECRET has to be present for staging to be possible —
// a deployment without it refuses to stage instead of signing with nothing,
// which is itself worth asserting.
const actions = require('../api/_faro/actions');
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'faro-check-secret';

const stagedBy = { projectCode: 'A', userId: 'u' };
const id = actions.stage({ ...stagedBy, action: 'create_followup', payload: { leadIds: ['recA'] } });

// Swap the payload, keep the signature: the MAC covers the body, so this must
// not verify. This is the check that would catch someone "optimising" the
// token by moving a field outside the signed portion.
const [signedBody, mac] = id.slice(4).split('.');
const tamperedBody = Buffer.from(
  JSON.stringify({ ...JSON.parse(Buffer.from(signedBody.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()),
                   d: { leadIds: ['recSOMEONE_ELSE'] } }),
).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const forged = `act_${tamperedBody}.${mac}`;

Promise.all([
  actions.execute({ actionId: id, ctx: { projectCode: 'B', userId: 'v' } })
    .then(() => 'cross-tenant execution was NOT blocked')
    .catch((err) => (err.code === 'not_found' ? null : `cross-tenant: unexpected ${err.code}`)),

  actions.execute({ actionId: id, ctx: { projectCode: 'A', userId: 'someone-else' } })
    .then(() => 'cross-USER execution was NOT blocked')
    .catch((err) => (err.code === 'not_found' ? null : `cross-user: unexpected ${err.code}`)),

  actions.execute({ actionId: forged, ctx: stagedBy })
    .then(() => 'a TAMPERED payload was accepted')
    .catch((err) => (err.code === 'not_found' ? null : `tampered: unexpected ${err.code}`)),
]).then((problems) => {
  const real = problems.filter(Boolean);
  if (real.length) real.forEach(fail);
  else pass('signed proposals: cross-tenant, cross-user and tampered all refused');
  finish();
});

/* ── Text on a fixed scrim ───────────────────────────────────────────────────
   A chip whose BACKGROUND is a literal dark rgba sits on dark in both themes,
   so its colour must be literal too. Using a theme token there puts near-black
   text on a near-black pill in light mode — which is how the video duration
   went invisible, silently, in one theme only. */
{
  const css = require('../api/_faro/ui/styles').css()
    + require('../api/_command-ui/styles').css();
  const offenders = [];
  // Rules that set BOTH a hard-coded dark rgba background and a var() colour.
  for (const m of css.matchAll(/\{[^}]*\}/g)) {
    const rule = m[0];
    if (!/background:\s*rgba\(\s*(?:[0-2]?\d|3\d)\s*,/.test(rule)) continue;
    const col = rule.match(/(?:^|[;{\s])color:\s*var\((--[a-z-]+)\)/);
    // --warm-sand and --champagne are the same value in both themes, so they
    // are safe on a fixed scrim; anything else is not.
    if (col && !/--(warm-sand|champagne)\b/.test(col[1])) {
      offenders.push(col[1] + ' on a fixed dark background');
    }
  }
  if (offenders.length) offenders.forEach((o) => fail(`theme-flipping colour on a fixed scrim: ${o}`));
  else pass('text on fixed dark scrims uses literal colours, not flipping tokens');
}

/* ── The AI books, not the agent ─────────────────────────────────────────────
   Appointments are made automatically by the WhatsApp AI inside the
   conversation (api/whatsapp.js step 11b). A "book appointment" action on the
   briefing would tell the agent to do by hand the one thing the product
   already does for them, and would put a viewing in the calendar that the lead
   never agreed to. It was built that way first, so this is checked rather than
   remembered. */
{
  const command = require('../api/_command');
  const now = Date.now();
  const convo = (agoDays) => JSON.stringify([
    { role: 'assistant', content: 'dag', ts: now - (agoDays + 1) * 86400000 },
    { role: 'user', content: 'hoi', ts: now - agoDays * 86400000 },
  ]);
  const base = {
    id: 'r1', naam: 'Test', telefoon: '+32470000000', status: 'Gekwalificeerd',
    qualified: true, reden: '', samenvatting: '', capaciteit: '', urgentie: 'Hoog',
    fit: '', bron: 'Formulier', boekingslinkVerstuurd: false, afspraakGeboekt: false,
    notities: '', aiPaused: false, leadScore: 9, opgepikt: false,
    verwachteWaarde: '€500.000', reactietijd: 30,
    datum: new Date(now - 2 * 86400000).toISOString(), gesprek: convo(0.2),
  };

  const actionFor = (lead) => {
    const built = command.build([lead], { calendarConnected: true });
    const o = built.opportunities[0] || command.analyse([lead], {}).all[0];
    return o && o.action ? o.action.key : 'none';
  };

  const cases = [
    ['qualified, in conversation, no appointment', base, 'follow_up'],
    ['24-hour window shut',                        { ...base, gesprek: convo(3) }, 'call'],
    ['AI paused',                                  { ...base, aiPaused: true }, 'takeover'],
    ['appointment already booked',                 { ...base, afspraakGeboekt: true }, 'review'],
  ];
  const wrong = cases.filter(([, lead, want]) => actionFor(lead) !== want);
  if (wrong.length) {
    wrong.forEach(([name, lead, want]) => fail(`next action for "${name}": expected ${want}, got ${actionFor(lead)}`));
  } else {
    pass('recommended actions match who actually books (the AI, in WhatsApp)');
  }

  // No code path may offer to book on the agent's behalf.
  const engine = fs.readFileSync(path.join(__dirname, '..', 'api', '_command.js'), 'utf8');
  const cmdClient2 = require('../api/_command-ui/client').js();
  if (/key:\s*'book'/.test(engine) || /data-cmd-act="book"/.test(cmdClient2) || /'book'/.test(cmdClient2)) {
    fail('a manual "book appointment" action is back — the WhatsApp AI books, not the agent');
  } else {
    pass('nothing offers to book an appointment by hand');
  }
}

/* ── Embedding contract ──────────────────────────────────────────────────────
   Two things customers actually rely on, both of which were broken and neither
   of which throws anything: a header and a hostname. */
{
  const formPage = fs.readFileSync(path.join(__dirname, '..', 'api', 'form-page.js'), 'utf8');

  // The dashboard previews /start/<code> in an iframe. X-Frame-Options: DENY
  // and frame-ancestors 'none' meant that panel was blank for every client,
  // in production, from the day it shipped.
  if (/X-Frame-Options'\s*,\s*'DENY'/.test(formPage)) {
    fail("form-page sends X-Frame-Options: DENY — the dashboard's own form preview cannot render");
  } else if (/frame-ancestors 'none'/.test(formPage)) {
    fail("form-page sends frame-ancestors 'none' — the dashboard's own form preview cannot render");
  } else if (!/frame-ancestors 'self'/.test(formPage)) {
    fail('form-page no longer restricts frame-ancestors at all');
  } else {
    pass('form page is frameable by Helvaro itself and nobody else');
  }

  // The widget every customer pastes into their own site must not point at a
  // Vercel-generated hostname: that name changes with the project or team and
  // takes every embedded form down silently.
  const widget = fs.readFileSync(path.join(__dirname, '..', 'public', 'form-widget.js'), 'utf8');
  const code = widget.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  if (/vercel\.app/.test(code)) {
    fail('form-widget.js posts to a vercel.app hostname — it changes when the project is renamed');
  } else if (!/originOfScript/.test(code)) {
    fail('form-widget.js no longer derives its API origin from its own script tag');
  } else {
    pass('embed widget posts to its own origin, not a generated hostname');
  }
}

/* ── Command Center ──────────────────────────────────────────────────────────
   Same seam contract as Faro: finished strings spliced into dashboard.js's own
   template literal, so a backtick or an unescaped ${...} in any of them would
   be evaluated by that literal rather than printed. */
{
  const cmdUI = require('../api/_command-ui');
  const problems = cmdUI.verify();
  if (problems.length) problems.forEach((p) => fail(`command-center splice: ${p}`));
  else pass('command center: splice-safe across all translated languages');

  for (const marker of ['${cmd.css}', '${cmd.drawer}', '${cmd.js}']) {
    if (dash.indexOf(marker) === -1) fail(`command-center mount point missing: ${marker}`);
  }

  /* One page, not two. The briefing renders INSIDE Faro's landing screen —
     they answer two halves of the same question, and behind separate nav items
     you had to know which half you wanted before you could look at either.
     These assertions exist because the merge is easy to undo by accident: a
     future edit giving the Command Center its own page again would read like a
     tidy-up in a diff. */
  const faroUI2 = require('../api/_faro/ui');
  const cmdParts = cmdUI.forLang('nl');
  const merged = faroUI2.forLang('nl', {
    force: true,
    landingExtra: cmdParts.sections,
    headerExtra: cmdParts.autopilot,
  }).page;

  if (merged.indexOf('id="cmd-opps"') === -1 || merged.indexOf('id="cmd-brief"') === -1) {
    fail('the briefing no longer renders inside the Faro landing screen');
  } else if (merged.indexOf('id="faro-input-field"') === -1) {
    fail('the ask bar is missing from the merged landing screen');
  } else if (merged.indexOf('id="cmd-autopilot"') === -1) {
    fail('the autopilot control is missing from the Faro header');
  } else if (dash.indexOf('id="page-command"') !== -1) {
    fail('page-command exists again — the Command Center was split back out');
  } else {
    pass('one page: the ask bar and the briefing render together');
  }

  // Faro is the home page. If some future edit re-activates page-dashboard the
  // app silently reverts to being a CRM, and two `active` pages would render on
  // top of each other besides.
  if (!/class="page-content page faro-page active"/.test(merged)) {
    fail('the Faro page is not the active landing page');
  } else if (/<main class="page-content page active" id="page-dashboard">/.test(dash)) {
    fail('page-dashboard is active again — two pages would render at once');
  } else if (!/var hvHome = 'faro';/.test(dash) || dash.indexOf('navigateTo(hvHome)') === -1) {
    // Faro must still be where login LANDS by default. The sidebar switch may
    // send a user who last chose CRM to the dashboard instead, so the literal
    // navigateTo('faro') is gone -- but the default must stay Faro, or the app
    // quietly reverts to being a CRM for everyone.
    fail('login no longer defaults to Faro as the home page');
  } else {
    pass('Faro is the landing page, and the only active one');
  }

  // The whole point of routing actions through Faro is that nothing on this
  // page can reach an external side effect without the confirmation gate.
  const cmdClient = require('../api/_command-ui/client').js();
  for (const forbidden of ['faro-confirm', 'actions.execute', 'sendFreeform', 'graph.facebook.com']) {
    if (cmdClient.indexOf(forbidden) !== -1) {
      fail(`command center client reaches past the confirmation gate: ${forbidden}`);
    }
  }
  if (cmdClient.indexOf('cmdHandToFaro') === -1) {
    fail('command center no longer hands actions to Faro');
  } else {
    pass('command center actions route through Faro and the confirmation gate');
  }
}

/* ── Collapsed regex escapes ─────────────────────────────────────────────────
   client.js is a template literal that EMITS JavaScript, so a lone \s, \w or
   \d inside it is consumed as a string escape and reaches the browser as a
   bare "s", "w" or "d". The regex still compiles, still runs, and quietly means
   something else — .split(/\s+/) became .split(/s+/), which turned "beste
   leads" into "be te lead ", and a step id sanitiser became [^w-], which
   stripped nearly every character so every tool in a turn shared one row and
   the step list only ever showed the last one.

   Neither threw. Neither showed up in a diff. Both survived a browser pass,
   because with one tool and one word you cannot see it. This check reads the
   EMITTED source rather than the file, which is the only place the difference
   is visible. */
{
  const emitted = require('../api/_faro/ui/client').js()
    + '\n' + require('../api/_command-ui/client').js();
  const suspects = [];
  emitted.split('\n').forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');   // a comment may legitimately discuss \s
    // A shorthand that lost its backslash, in the two places it is load-bearing:
    // immediately after a regex delimiter, or inside a character class.
    if (/(?:split|replace|match|test|exec)\(\/[^/\n]*(?:\/[gimsuy]*)?/.test(code)) {
      const rx = code.match(/\/(?:\\.|\[[^\]]*\]|[^/\n\\])+\/[gimsuy]*/g) || [];
      rx.forEach((r) => {
        // \s \w \d \b as bare letters directly after / or [ or [^ — the exact
        // shapes that mean something completely different from the intent.
        if (/\/\^?[swdb][+*{]/.test(r) || /\[\^?[swdb][\]\-+*]/.test(r)) {
          suspects.push(`line ${i + 1}: ${r}  (in: ${code.trim().slice(0, 70)})`);
        }
      });
    }
  });
  if (suspects.length) suspects.forEach((x) => fail(`regex escape collapsed by the template literal — use \\\\s not \\s: ${x}`));
  else pass('no regex escape was swallowed by the template literal');
}

/* ── Design scales ──────────────────────────────────────────────────────────
   Faro's CSS reached 17 distinct font sizes, 10 radii and 23 spacing values,
   more than half of them off any grid. Every one was a defensible local call;
   together they are why two cards built a month apart did not line up. The
   scales in tokens.js are a closed set, and this check is what keeps it closed
   — a raw px in a size, radius or spacing property fails here rather than
   surviving review because a diff of one number looks harmless. */
{
  const css = require('../api/_faro/ui/styles').css()
    + require('../api/_command-ui/styles').css();

  // Strip comments first: a px value inside a note explaining why something is
  // 22px is not a violation, and flagging it teaches people to delete the note.
  const code = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

  const offenders = [];
  const scan = (_label, re) => {
    for (const m of code.matchAll(re)) {
      // 0 needs no token, and percentages/em are outside the grid's remit.
      const raw = m[0];
      const bad = (raw.match(/(?<![\w.])(\d*\.?\d+)px/g) || []).filter((v) => parseFloat(v) !== 0);
      if (bad.length) offenders.push(raw.trim().replace(/\s+/g, ' '));
    }
  };
  scan('font-size', /font-size:[^;}]*?\d*\.?\d+px[^;}]*/g);
  scan('border-radius', /border-radius:[^;}]*?\d*\.?\d+px[^;}]*/g);
  scan('spacing', /\b(?:padding|margin|gap|row-gap|column-gap)(?:-(?:top|bottom|left|right))?:[^;}]*?\d*\.?\d+px[^;}]*/g);

  if (offenders.length) {
    offenders.slice(0, 8).forEach((o) => fail(`off-scale value — use a token: ${o}`));
    if (offenders.length > 8) fail(`…and ${offenders.length - 8} more off-scale values`);
  } else {
    pass('every size, radius and spacing value comes from the scale');
  }

  // The two rules DESIGN-SYSTEM.md states outright, asserted against the token
  // values rather than against every call site.
  const tokens = require('../api/_faro/ui/tokens').css();
  const tok = (name) => (tokens.match(new RegExp(`${name}:\\s*([^;]+);`)) || [])[1];
  if ((tok('--r-md') || '').trim() !== '14px') fail('--r-md must be 14px (DESIGN-SYSTEM.md: buttons)');
  else if ((tok('--r-lg') || '').trim() !== '18px') fail('--r-lg must be 18px (DESIGN-SYSTEM.md: cards)');
  else pass('button radius 14px and card radius 18px match DESIGN-SYSTEM.md');
}

/* Relative luminance / WCAG contrast, from the literal token values. */
function srgb(c) { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
function lum(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return 0.2126 * srgb((n >> 16) & 255) + 0.7152 * srgb((n >> 8) & 255) + 0.0722 * srgb(n & 255);
}
function contrast(a, b) {
  const L1 = lum(a); const L2 = lum(b);
  if (L1 === null || L2 === null) return null;
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}
function tokenValue(css, name, scope) {
  // Last definition wins, which matches the cascade for these single-block themes.
  const block = scope
    ? (css.split(scope)[1] || '').split('}')[0]
    : (css.split(':root')[1] || '').split('}')[0];
  const m = new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`).exec(block);
  return m ? m[1] : null;
}

function finish() {
  // ── 6. Contrast of sand-coloured text on AI surfaces ──────────────────────
  // --warm-sand is near-white: right on #101010, invisible on cream. Anything
  // sand outside the permanently-dark sidebar must use --sand-on-surface, which
  // flips per theme. The switcher's active segment shipped at 1.15:1 in light
  // mode once; this makes that a build failure rather than a screenshot review.
  console.log('\ncontrast');
  const css = require('../api/_faro/ui/tokens').css();
  const pairs = [
    ['dark',  tokenValue(css, '--sand-on-surface'), '#101010'],
    ['light', tokenValue(css, '--sand-on-surface', '[data-theme="light"]'), '#FAF8F4'],
  ];
  for (const [theme, fg, bg] of pairs) {
    if (!fg) { fail(`${theme}: --sand-on-surface not found`); continue; }
    const r = contrast(fg, bg);
    if (r === null) fail(`${theme}: could not compute contrast for ${fg}`);
    else if (r < 4.5) fail(`${theme}: --sand-on-surface ${fg} on ${bg} is ${r.toFixed(2)}:1 (need 4.5)`);
    else pass(`${theme}: sand-on-surface ${r.toFixed(2)}:1`);
  }

  // Every quick-action hue must clear 3:1 against its canvas — icons are
  // non-text content, so 3:1 is the applicable threshold.
  const hues = ['amber', 'slate', 'teal', 'terracotta', 'rose', 'gold', 'green', 'orange', 'sky'];
  for (const [theme, scope, bg] of [['dark', null, '#1A1A1A'], ['light', '[data-theme="light"]', '#FFFFFF']]) {
    const bad = [];
    for (const h of hues) {
      const v = tokenValue(css, `--ic-${h}`, scope);
      const r = v && contrast(v, bg);
      if (!r || r < 3) bad.push(`${h}${r ? ` ${r.toFixed(2)}` : ''}`);
    }
    if (bad.length) fail(`${theme}: icon hues below 3:1 — ${bad.join(', ')}`);
    else pass(`${theme}: all 9 icon hues clear 3:1`);
  }

  // ── 7. No vendor branding may reach the client ────────────────────────────
  console.log('\nbranding (requirement 13)');
  const config = require('../api/_faro/config');
  const labels = config.TIERS.map((t) => config.publicModelLabel(t.key));
  const leaked = labels.filter((l) => /claude|anthropic|openai|gpt/i.test(l));
  if (leaked.length) fail(`public model label leaks a vendor: ${leaked.join(', ')}`);
  else pass('public model labels are Helvaro-branded');

  const clientSrc = ui.forLang('en').js + ui.forLang('en').css + ui.forLang('en').workspace;
  if (/claude|anthropic|openai|gpt-4/i.test(clientSrc)) fail('vendor name present in client-side output');
  else pass('no vendor name in client-side output');

  // ── 8. The Claude adapter's event machine ─────────────────────────────────
  // No network. A synthetic SSE stream, deliberately split in the places that
  // actually break naive parsers: mid-JSON-argument and mid-frame.
  console.log('\nclaude adapter');
  const claude = require('../api/_faro/providers/claude');

  const frames = [
    { type: 'message_start', message: { usage: { input_tokens: 42 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Ik kijk ' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'even.' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu_1', name: 'search_leads' } },
    // The arguments arrive as a JSON STRING in fragments that split mid-key
    // and mid-value — the case that makes incremental parsing fail.
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"minBud' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'get":4000' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '00,"limit":5}' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 17 } },
    { type: 'message_stop' },
  ];
  const wire = frames.map((f) => `event: ${f.type}\ndata: ${JSON.stringify(f)}\n\n`).join('');

  // Feed it in awkward slices so frames straddle chunk boundaries.
  const state = { tool: null, stopReason: null };
  const got = [];
  let buf = '';
  for (let i = 0; i < wire.length; i += 7) {
    buf += wire.slice(i, i + 7);
    const { events, rest } = claude.parseFrames(buf);
    buf = rest;
    for (const e of events) for (const n of claude.handleEvent(e, state)) got.push(n);
  }

  const text = got.filter((e) => e.type === 'text').map((e) => e.text).join('');
  const call = got.find((e) => e.type === 'tool_call');
  const done = got.find((e) => e.type === 'done');
  const usageIn = got.filter((e) => e.type === 'usage').reduce((a, e) => a + e.inputTokens, 0);
  const usageOut = got.filter((e) => e.type === 'usage').reduce((a, e) => a + e.outputTokens, 0);

  if (text !== 'Ik kijk even.') fail(`text reassembly wrong: ${JSON.stringify(text)}`);
  else pass('text reassembles across split chunks');

  if (!call) fail('no tool_call emitted');
  else if (call.name !== 'search_leads' || call.id !== 'tu_1') fail('tool_call identity wrong');
  else if (call.input.minBudget !== 400000 || call.input.limit !== 5) {
    fail(`tool arguments wrong: ${JSON.stringify(call.input)}`);
  } else pass('tool arguments survive a JSON split mid-key and mid-value');

  if (!done || done.stopReason !== 'tool_use') fail('stop reason not carried to done');
  else pass('stop reason carried');

  if (usageIn !== 42 || usageOut !== 17) fail(`usage wrong: in=${usageIn} out=${usageOut}`);
  else pass('token usage accumulated');

  // A tool call whose JSON never parses must be DROPPED, not run with {} —
  // running it would present an unrelated answer as if it were the response.
  const s2 = { tool: null, stopReason: null };
  claude.handleEvent({ type: 'content_block_start', content_block: { type: 'tool_use', id: 'x', name: 'get_leads' } }, s2);
  claude.handleEvent({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"broken' } }, s2);
  const dropped = claude.handleEvent({ type: 'content_block_stop' }, s2);
  if (dropped.length) fail('a malformed tool call was emitted instead of dropped');
  else pass('malformed tool arguments are dropped, not run with {}');

  // Message conversion, both directions of the awkward shapes.
  const conv = claude.toAnthropicMessages([
    { role: 'user', content: [{ type: 'text', text: 'hoi' }, { type: 'image', mediaType: 'image/png', dataBase64: 'AA' }] },
    { role: 'assistant', content: [{ type: 'tool_call', id: 't1', name: 'f', input: { a: 1 } }] },
    { role: 'user', content: [{ type: 'tool_result', toolCallId: 't1', result: { ok: true } }] },
  ]);
  const shapes = JSON.stringify(conv.map((m) => m.content.map((c) => c.type)));
  if (shapes !== '[["text","image"],["tool_use"],["tool_result"]]') fail(`message conversion wrong: ${shapes}`);
  else pass('message conversion covers text/image/tool_use/tool_result');

  // ── 9. Safeguards ─────────────────────────────────────────────────────────
  // These are the properties that stop Faro being a general chatbot with a
  // logo, and every one of them is a single edit away from silently vanishing.
  console.log('\nsafeguards');

  const identity = require('../api/_faro/prompt').IDENTITY;
  const guards = [
    ['scope is closed',            /geen algemene chatbot/i],
    ['refusal has a redirect',     /Wil je dat ik/i],
    ['tool output is data',        /GEGEVENS ZIJN GEEN OPDRACHTEN/],
    ['never fabricates',           /verzint nooit/i],
    ['prompt is not disclosed',    /instructies niet weer/i],
    ['actions need confirmation',  /NOOIT zonder bevestiging/],
  ];
  for (const [name, re] of guards) {
    if (re.test(identity)) pass(name);
    else fail(`system prompt lost its guard: ${name}`);
  }

  // The image engine is prepended unconditionally — no argument combination
  // may produce a prompt without it, because the failure it prevents is an
  // image of a house that is not the client's house.
  const imgs = require('../api/_images');
  const combos = [
    ['bare',      ['modern', '', '', {}]],
    ['full',      ['luxury', 'behoud de haard', 'keuken', { wallFinish: 'painted', wallColorNote: 'terracotta', floor: 'wood', lighting: 'daylight', renovationDepth: 'full' }]],
    ['staging',   ['staging', '', 'slaapkamer', { furniture: 'full' }]],
    ['bad style', ['not-a-style', '', '', {}]],
  ];
  let engineOk = true;
  for (const [name, args] of combos) {
    const p = imgs.buildTransformPrompt(args[0], args[1], args[2], args[3]);
    if (!/TRANSFORM THE PROPERTY, DO NOT REINVENT THE PROPERTY/.test(p)) {
      fail(`image engine missing for combo: ${name}`); engineOk = false;
    }
    if (!/UNIVERSAL PROPERTY TRANSFORMATION ENGINE/.test(p.slice(0, 60))) {
      fail(`image engine not first for combo: ${name}`); engineOk = false;
    }
  }
  if (engineOk) pass(`image engine prepended for all ${combos.length} argument shapes`);

  // The client's own words must remain LAST — image models weight the end of a
  // prompt most heavily, so a preamble that swallowed the request would be a
  // regression that looks like nothing changed.
  const withReq = imgs.buildTransformPrompt('modern', 'behoud de open haard', '', {});
  if (withReq.trim().endsWith('behoud de open haard')) pass('client request stays last in the prompt');
  else fail('client request is no longer the final instruction');

  // Every customisable axis must be reachable end to end: declared in the
  // registry, validated before spending, composed into the prompt, and offered
  // to the model. An axis that exists in only three of those four is a dial
  // the user can turn that changes nothing.
  const toolParams = tools.get('generate_property_image').parameters.properties;
  const axisGaps = [];
  for (const a of imgs.EXTRA_AXES) {
    if (!toolParams[a.key]) axisGaps.push(`${a.key}: not in the tool schema`);
    else if (!toolParams[a.key].enum || toolParams[a.key].enum.length !== a.list.length + 1) {
      axisGaps.push(`${a.key}: schema enum out of sync with its list`);
    }
    if (!imgs.isValidExtraAxis(a.key, a.list[0].key)) axisGaps.push(`${a.key}: validator rejects its own first option`);
    if (imgs.isValidExtraAxis(a.key, 'definitely-not-a-key')) axisGaps.push(`${a.key}: validator accepts anything`);
    const composed = imgs.buildExtraClauses({ [a.key]: a.list[0].key });
    if (!composed.trim()) axisGaps.push(`${a.key}: contributes nothing to the prompt`);
  }
  for (const a of imgs.OBJECT_AXES) {
    if (!toolParams[a.key]) axisGaps.push(`${a.key}: not in the tool schema`);
    if (!imgs.buildExtraClauses({ [a.key]: 'de open haard' }).includes('de open haard')) {
      axisGaps.push(`${a.key}: free text does not reach the prompt`);
    }
  }
  if (axisGaps.length) axisGaps.forEach(fail);
  else pass(`${imgs.EXTRA_AXES.length + imgs.OBJECT_AXES.length} customisable axes wired end to end`);

  // Customisation must never be able to displace the engine.
  const loaded = imgs.buildTransformPrompt('modern', 'doe maar iets', 'woonkamer', {
    palette: 'earth', vibe: 'cozy', material: 'oak', landscaping: 'lush',
    preserve: 'de open haard', remove: 'het behang', add: 'een zwembad',
  });
  if (!/TRANSFORM THE PROPERTY, DO NOT REINVENT THE PROPERTY/.test(loaded)) {
    fail('engine lost when every customisable axis is set');
  } else pass('engine survives every axis being set at once');

  // ── What actually leaves the process ──────────────────────────────────────
  // The checks above assert buildTransformPrompt's RETURN VALUE. That is not
  // what OpenAI receives, and the difference hid two bugs at once: the posted
  // string was capped at 4000 chars (so a ~5.9k engine preamble truncated away
  // every real instruction), and generatePropertyImage's fixed destructure
  // silently dropped the new axes. Both looked fine from buildTransformPrompt.
  // So: assert the composed API prompt, with every axis set.
  const posted = imgs.composeApiPrompt({
    style: 'luxury', customPrompt: 'behoud de open haard', roomType: 'woonkamer',
    wallFinish: 'painted', wallColorNote: 'terracotta', floor: 'wood',
    lighting: 'warm-evening', renovationDepth: 'full',
    palette: 'earth', vibe: 'cozy', material: 'oak', landscaping: 'lush',
    preserve: 'de haard', remove: 'het behang', add: 'een zwembad',
  });
  const mustSurvive = [
    ['engine',       'DO NOT REINVENT THE PROPERTY'],
    ['style',        'luxury renovation'],
    ['room type',    'living room'],
    ['wall colour',  'terracotta'],
    ['floor',        'natural wood'],
    ['lighting',     'warm evening'],
    ['depth',        'FULL RENOVATION'],
    ['palette',      'earth-tone'],
    ['vibe',         'cozy'],
    ['material',     'light oak'],
    ['landscaping',  'lush green'],
    ['preserve',     'de haard'],
    ['remove',       'het behang'],
    ['add',          'een zwembad'],
    ['client words', 'behoud de open haard'],
  ];
  const lost = mustSurvive.filter(([, needle]) => !posted.includes(needle)).map(([name]) => name);
  if (lost.length) fail(`dropped from the POSTED prompt: ${lost.join(', ')}`);
  else pass(`all ${mustSurvive.length} instructions survive into the posted prompt`);

  if (posted.length > imgs.MAX_API_PROMPT_CHARS) {
    fail(`posted prompt ${posted.length} exceeds the ${imgs.MAX_API_PROMPT_CHARS} cap`);
  } else pass(`posted prompt ${posted.length} chars, within the ${imgs.MAX_API_PROMPT_CHARS} cap`);

  // The cap must sit above a fully-loaded prompt with real headroom. A cap that
  // merely fits today is the bug that just happened, one added rule later.
  if (imgs.MAX_API_PROMPT_CHARS < posted.length * 2) {
    fail(`cap ${imgs.MAX_API_PROMPT_CHARS} leaves no headroom over a full prompt (${posted.length})`);
  } else pass('cap leaves headroom over a fully-loaded prompt');

  // Chat has a spend ceiling.
  const cr = require('../api/_credits');
  if (!cr.FEATURES.FARO_CHAT) fail('FARO_CHAT credit feature missing');
  else if (!cr.WEIGHTS[cr.FEATURES.FARO_CHAT]) fail('FARO_CHAT has no weight');
  else pass(`chat metered at ${cr.WEIGHTS[cr.FEATURES.FARO_CHAT]} credits/turn`);

  const orch = fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'orchestrator.js'), 'utf8');
  if (!/checkCredits\(ctx\.projectCode, credits\.FEATURES\.FARO_CHAT\)/.test(orch)) {
    fail('orchestrator does not check credits before the model call');
  } else if (orch.indexOf('checkCredits') > orch.indexOf('provider.streamChat')) {
    fail('credit check runs AFTER the model call');
  } else pass('credits checked before the first model call');

  // A check with no corresponding charge is worse than no check: the balance
  // never moves, so the ceiling can never be reached. This shipped once as a
  // comment while the check above passed.
  if (!/credits\.recordUsage\(\s*ctx\.projectCode,\s*credits\.FEATURES\.FARO_CHAT/.test(orch)) {
    fail('orchestrator never charges for a chat turn — the ceiling can never be reached');
  } else pass('chat turns are actually charged, not just checked');

  // ── Snelkoppelingen praten de taal van de gebruiker ───────────────────────
  // Deze prompts komen als het bericht van de GEBRUIKER in de draad en worden
  // de titel van het gesprek. Ze stonden als vaste Engelse zinnen in de code,
  // zodat een Vlaamse makelaar zichzelf Engels zag praten. Nu i18n-sleutels —
  // en een sleutel die in één taal ontbreekt valt terug op de sleutelnaam zelf,
  // wat er in de draad uitziet als 'qp.campaign'.
  console.log('\nsnelkoppelingen');
  try {
    const qa = require(path.join(__dirname, '..', 'api', '_faro', 'ui', 'quick-actions.js'));
    const i18n = require(path.join(__dirname, '..', 'api', '_faro', 'ui', 'i18n.js'));
    const groups = qa.GROUPS || (Array.isArray(qa) ? qa : Object.values(qa).find(Array.isArray));
    const keys = [];
    (groups || []).forEach((g) => (g.actions || []).forEach((a) => { if (a.promptKey) keys.push(a.promptKey); }));
    const hardcoded = [];
    (groups || []).forEach((g) => (g.actions || []).forEach((a) => { if (a.prompt) hardcoded.push(a.id); }));

    if (hardcoded.length) fail(`snelkoppeling(en) met een vaste prompt i.p.v. een sleutel: ${hardcoded.join(', ')}`);
    else pass(`${keys.length} snelkoppelingen gebruiken een i18n-sleutel`);

    const missing = [];
    for (const lang of i18n.TRANSLATED) {
      const t = i18n.translator(lang);
      for (const k of keys) { const v = t(k); if (!v || v === k) missing.push(`${lang}:${k}`); }
    }
    if (missing.length) fail(`prompt ontbreekt in een taal: ${missing.slice(0, 5).join(', ')}`);
    else pass(`elke prompt bestaat in alle ${i18n.TRANSLATED.length} talen`);
  } catch (e) {
    fail(`snelkoppelingen niet te controleren: ${e.message}`);
  }

  // ── De sterkste controle die er is: parseer wat de browser krijgt ─────────
  // api/dashboard.js is één reusachtige template literal, en de valkuil daarvan
  // is dat een geldig ogende regel iets ANDERS oplevert in de uitvoer. Twee
  // keer eerder gebeurd in dit bestand: een \s in een regex die tot s
  // verschrompelde, en een \' in een string die het aanhalingsteken sloot en
  // de rest van het script meenam.
  //
  // Geen van beide gooide een fout bij het laden van de module — de fout zit in
  // de UITVOER, niet in de bron. Dus wordt de uitvoer hier echt geparseerd.
  console.log('\nuitgestuurde JavaScript');
  try {
    const vm = require('vm');
    const dash = require(path.join(__dirname, '..', 'api', 'dashboard.js'));
    let html = '';
    dash({ method: 'GET', headers: {}, url: '/dashboard' }, {
      setHeader() {}, status() { return this; }, send(b) { html = String(b); },
    });
    if (!html) {
      fail('dashboard leverde geen HTML op');
    } else {
      const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
      let m, n = 0, bad = 0;
      while ((m = re.exec(html)) !== null) {
        n++;
        try { new vm.Script(m[1]); }
        catch (e) { bad++; fail(`inline script #${n} parseert niet: ${e.message}`); }
      }
      if (!n) fail('geen inline script gevonden — is de pagina nog wel opgebouwd?');
      else if (!bad) pass(`${n} inline script(s) parseren zonder fout`);
    }
  } catch (e) {
    fail(`kon de uitgestuurde pagina niet controleren: ${e.message}`);
  }

  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
  process.exit(failures ? 1 : 0);
}
