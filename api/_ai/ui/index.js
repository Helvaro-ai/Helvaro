'use strict';
/*
 * Helvaro AI — UI assembly.
 *
 * The single seam between the AI workspace and api/dashboard.js.
 *
 * ── How dashboard.js consumes this ───────────────────────────────────────────
 * Five interpolations inside its `const HTML = \`...\`` template literal, with
 * `const aiUI = require('./_ai/ui');` and `const ai = aiUI.forLang(LANG);`
 * near the top of the handler:
 *
 *   1. before </style>                              ${ai.css}
 *   2. inside <header class="topbar">               ${ai.switcher}
 *   3. after the CRM's </nav>, inside .sidebar      ${ai.sidebar}
 *   4. after the last </main>                       ${ai.workspace}
 *   5. before </script>                             ${ai.js}
 *
 * That is the whole integration. Deliberately small: dashboard.js is ~19,000
 * lines and carries the entire paying product, so the AI workspace touches it
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

/** JSON safe to embed in an inline <script>: neutralises </script> breakout. */
function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Everything the dashboard needs, for one language.
 * @param {string} langCode  any api/_lang.js code; unsupported UI languages
 *                           fall back to English (see ./i18n.js).
 */
function forLang(langCode) {
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
    `var AI_T = ${inlineJson(strings)};`,
    `var AI_ICONS = ${inlineJson(icons.PATHS)};`,
    `var AI_QUICK_ACTIONS = ${inlineJson(quick.BY_ID)};`,
    `var AI_TIERS = ${inlineJson(tiers)};`,
    `var AI_DEFAULT_TIER = ${inlineJson(config.DEFAULT_TIER)};`,
  ].join('\n');

  return {
    lang,
    css: tokens.css() + styles.css(),
    js: `\n${bootstrap}\n${client.js()}`,
    switcher: markup.switcher(tt),
    sidebar: markup.sidebar(tt),
    workspace: markup.workspace(tt),
  };
}

/**
 * Assert the splice-safety invariant for every language.
 * Cheap enough to run at require time in tests; called by scripts/ai-check.js.
 * Returns the offending pieces rather than throwing, so a caller can report all
 * of them at once.
 */
function verify() {
  const problems = [];
  for (const lang of i18n.TRANSLATED) {
    const out = forLang(lang);
    for (const key of ['css', 'js', 'switcher', 'sidebar', 'workspace']) {
      const s = out[key];
      if (s.indexOf('`') > -1) problems.push(`${lang}/${key}: contains a backtick`);
      if (/(^|[^\\])\$\{/.test(s)) problems.push(`${lang}/${key}: contains an unescaped \${`);
    }
  }
  return problems;
}

module.exports = { forLang, verify };
