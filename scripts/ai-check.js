#!/usr/bin/env node
'use strict';
/*
 * Static checks for the Helvaro AI workspace. No network, no browser.
 *
 *   node scripts/ai-check.js
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The AI workspace's CSS, markup and client script are generated as STRINGS and
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
 * Run this before any commit that touches api/_ai/ui/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let failures = 0;
const fail = (msg) => { console.error(`  ✗ ${msg}`); failures += 1; };
const pass = (msg) => console.log(`  ✓ ${msg}`);

console.log('\nHelvaro AI — static checks\n');

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
  try { require(path.join('..', 'api', '_ai', m)); } catch (err) { fail(`${m}: ${err.message}`); }
}
if (!failures) pass(`${MODULES.length} modules load`);
try { require('../api/ai'); pass('api/ai.js loads'); } catch (err) { fail(`api/ai.js: ${err.message}`); }

// ── 2. Splice safety, per language ──────────────────────────────────────────
console.log('\nsplice safety (no backticks or ${} in generated strings)');
const ui = require('../api/_ai/ui');
const problems = ui.verify();
if (problems.length) problems.forEach(fail);
else pass('clean across all translated languages');

// ── 3. The generated client script parses, per language ─────────────────────
console.log('\ngenerated client script');
const i18n = require('../api/_ai/ui/i18n');
for (const lang of i18n.TRANSLATED) {
  const tmp = path.join(os.tmpdir(), `helvaro-ai-client-${lang}-${process.pid}.js`);
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
for (const marker of ['${ai.css}', '${ai.switcher}', '${ai.sidebar}', '${ai.workspace}', '${ai.js}']) {
  if (dash.indexOf(marker) === -1) fail(`mount point missing: ${marker}`);
}
if (dash.indexOf('_aiUI.forLang') === -1) fail('dashboard.js does not bind a language');

// ── 5. The confirmation gate holds ──────────────────────────────────────────
console.log('\nconfirmation gate');
const tools = require('../api/_ai/tools');
const acts = tools.ALL.filter((t) => t.kind === 'act').map((t) => t.name);
if (!acts.length) fail('no act-tools registered');
else if (acts.every((n) => tools.requiresConfirmation(n))) pass(`${acts.length} act-tools all require confirmation`);
else fail('an act-tool does not require confirmation');

const reads = tools.ALL.filter((t) => t.kind === 'read').map((t) => t.name);
if (reads.some((n) => tools.requiresConfirmation(n))) fail('a read-tool requires confirmation');
else pass(`${reads.length} read-tools run without a gate`);

// A staged action must never be reachable from another tenant.
const actions = require('../api/_ai/actions');
const id = actions.stage({ projectCode: 'A', userId: 'u', action: 'create_followup', payload: {} });
actions.execute({ actionId: id, ctx: { projectCode: 'B', userId: 'v' } })
  .then(() => { fail('cross-tenant action execution was NOT blocked'); finish(); })
  .catch((err) => {
    if (err.code === 'not_found') pass('cross-tenant action execution blocked');
    else fail(`unexpected error for cross-tenant execute: ${err.code}`);
    finish();
  });

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
  const css = require('../api/_ai/ui/tokens').css();
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
  const config = require('../api/_ai/config');
  const labels = config.TIERS.map((t) => config.publicModelLabel(t.key));
  const leaked = labels.filter((l) => /claude|anthropic|openai|gpt/i.test(l));
  if (leaked.length) fail(`public model label leaks a vendor: ${leaked.join(', ')}`);
  else pass('public model labels are Helvaro-branded');

  const clientSrc = ui.forLang('en').js + ui.forLang('en').css + ui.forLang('en').workspace;
  if (/claude|anthropic|openai|gpt-4/i.test(clientSrc)) fail('vendor name present in client-side output');
  else pass('no vendor name in client-side output');

  console.log(failures ? `\n${failures} check(s) failed\n` : '\nall checks passed\n');
  process.exit(failures ? 1 : 0);
}
