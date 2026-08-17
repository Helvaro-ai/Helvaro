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

function finish() {
  // ── 6. No vendor branding may reach the client ────────────────────────────
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
