'use strict';
/*
 * Faro — UI assembly.
 *
 * The single seam between Faro and api/dashboard.js.
 *
 * ── How dashboard.js consumes this ───────────────────────────────────────────
 * Five interpolations inside its `const HTML = \`...\`` template literal, with
 * `const faroUI = require('./_faro/ui');` and `const ai = faroUI.forLang(LANG);`
 * near the top of the handler:
 *
 *   1. before </style>                              ${ai.css}
 *   2. inside <header class="topbar">               ${ai.switcher}
 *   3. after the CRM's </nav>, inside .sidebar      ${ai.sidebar}
 *   4. after the last </main>                       ${ai.workspace}
 *   5. before </script>                             ${ai.js}
 *
 * That is the whole integration. Deliberately small: dashboard.js is ~19,000
 * lines and carries the entire paying product, so Faro touches it
 * in five places rather than being woven through it.
 *
 * ── Everything is language-bound at build time ───────────────────────────────
 * forLang(code) returns finished strings. The language is resolved ONCE per
 * request from the user's setting (api/_lang.js), so there is no client-side
 * translation step and no flash of untranslated content.
 *
 * ── Escaping ─────────────────────────────────────────────────────────────────
 * These strings are interpolated INTO a template literal, so any backtick or
 * ${ } they contain would be evaluated by dashboard.js's own literal. They
 * contain neither: CSS has no backticks, markup builders are evaluated HERE
 * before the result is handed over, and client.js is written in ES5 string
 * concatenation for exactly this reason. `verify()` below asserts it.
 *
 * If a future edit needs a literal backtick or ${ } inside client.js's returned
 * source, it must be escaped as \\\` / \\${ — the same constraint
 * api/dashboard.js documents at its line 16414.
 */

const tokens = require('./tokens');
const styles = require('./styles');
const markup = require('./markup');
const client = require('./client');
const icons  = require('./icons');
const quick  = require('./quick-actions');
const i18n   = require('./i18n');
const config = require('../config');

/* What a disabled Faro contributes to the page: nothing at all. The one
   exception is deliberate — see the CSS note in styles.js about #nav-ai-beeld,
   which is only hidden while Faro is ON, so the CRM stays whole when it is off. */
const DISABLED = Object.freeze({ lang: '', css: '', js: '', dock: '', overlay: '' });

/** JSON safe to embed in an inline <script>: neutralises </script> breakout. */
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Everything the dashboard needs, for one language.
 * @param {string} langCode  any api/_lang.js code; unsupported UI languages
 *                           fall back to English (see ./i18n.js).
 */
/**
 * @param {string} langCode
 * @param {object} [opts]
 * @param {boolean} [opts.force]  Build the UI even when the feature flag is
 *   off. Only for checks — config.isEnabled() reads a module-level constant
 *   captured at load, so flipping the env var afterwards does nothing, and a
 *   test that needs the enabled output must say so explicitly rather than
 *   mutating process.env and busting the require cache.
 */
function forLang(langCode, opts = {}) {
  // With the feature off, emit NOTHING. Previously the dock and overlay
  // rendered unconditionally, so a customer with Faro disabled got an inviting
  // ask bar whose every message ended in a generic error — and paid ~108 KB of
  // HTML plus the module's parse cost on every dashboard load for the
  // privilege. The kill switch has to reach the UI, not just the route.
  if (!opts.force && !config.isEnabled()) return DISABLED;

  const lang = i18n.resolve(langCode);
  const t = i18n.translator(lang);

  // Action labels live with their definitions in ./quick-actions.js so a new
  // action ships as one edit; merged into the string table here.
  const strings = Object.assign({}, i18n.table(lang), quick.LABELS[lang] || quick.LABELS.en);
  const tt = (k) => (Object.prototype.hasOwnProperty.call(strings, k) ? strings[k] : t(k));

  // Tier keys + their Helvaro-branded labels. config.js is the only module that
  // knows a tier maps to a vendor model id, and that mapping stays server-side —
  // the client receives capability names ("Standaard"), never model names.
  const tiers = config.TIERS.map((x) => ({
    key: x.key,
    label: config.publicModelLabel(x.key),
    short: x.label,
    hint: x.hint,
  }));

  const bootstrap = [
    `var FARO_T = ${inlineJson(strings)};`,
    `var FARO_ICONS = ${inlineJson(icons.PATHS)};`,
    `var FARO_QUICK_ACTIONS = ${inlineJson(quick.BY_ID)};`,
    `var FARO_TIERS = ${inlineJson(tiers)};`,
    `var FARO_DEFAULT_TIER = ${inlineJson(config.DEFAULT_TIER)};`,
  ].join('\n');

  return {
    lang,
    css: tokens.css() + styles.css(),
    js: `\n${bootstrap}\n${client.js()}`,
    dock: markup.dock(tt),
    overlay: markup.overlay(tt),
  };
}

/**
 * Assert the splice-safety invariant for every language.
 * Cheap enough to run at require time in tests; called by scripts/faro-check.js.
 * Returns the offending pieces rather than throwing, so a caller can report all
 * of them at once.
 */
function verify() {
  const problems = [];
  // Inspect the ENABLED output — that is what ships to a customer with the
  // feature on; the disabled path is empty by definition.
  for (const lang of i18n.TRANSLATED) {
    const out = forLang(lang, { force: true });
    for (const key of ['css', 'js', 'dock', 'overlay']) {
      const s = out[key];
      if (s.indexOf('`') > -1) problems.push(`${lang}/${key}: contains a backtick`);
      if (/(^|[^\\])\$\{/.test(s)) problems.push(`${lang}/${key}: contains an unescaped \${`);
    }
  }
  return problems;
}

module.exports = { forLang, verify };
