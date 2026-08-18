'use strict';
/*
 * Command Center — UI assembly.
 *
 * The seam between the Command Center and api/dashboard.js, built to exactly
 * the pattern api/_faro/ui/index.js established: this module returns finished
 * strings, dashboard.js interpolates them at four points, and nothing about
 * the Command Center is woven through that 19,000-line file.
 *
 * ── Splice safety ────────────────────────────────────────────────────────────
 * These strings land INSIDE dashboard.js's own template literal, so a backtick
 * or an unescaped ${ } here would be evaluated by that literal. verify() below
 * asserts neither appears, per language, and scripts/faro-check.js runs it.
 * The client script is therefore written in ES5 string concatenation, and any
 * regex in it needs \\s rather than \s — a lone escape is swallowed by the
 * outer literal and reaches the browser meaning something else entirely.
 *
 * ── Why it reuses Faro's tokens rather than declaring its own ────────────────
 * Colour, spacing, type and radius all come from api/_faro/ui/tokens.js, which
 * dashboard.js already emits. A second token block would be a second source of
 * truth for the same design system, and the check that enforces the scales
 * would have two files to police instead of one.
 */

const styles = require('./styles');
const markup = require('./markup');
const client = require('./client');
const icons  = require('./markup');
const i18n   = require('./i18n');

const DISABLED = Object.freeze({ lang: '', css: '', js: '', page: '', nav: '' });

function inlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Everything the dashboard needs, for one language.
 * @param {string} langCode
 * @param {object} [opts]
 * @param {boolean} [opts.enabled] default true; false emits nothing at all.
 */
function forLang(langCode, opts = {}) {
  if (opts.enabled === false) return DISABLED;

  const lang = i18n.resolve(langCode);
  const strings = i18n.table(lang);
  const t = (k) => (Object.prototype.hasOwnProperty.call(strings, k) ? strings[k] : k);

  return {
    lang,
    css: styles.css(),
    js: [
      '',
      `var CMD_T = ${inlineJson(strings)};`,
      `var CMD_ICON_PATHS = ${inlineJson(icons.ICONS)};`,
      client.js(),
    ].join('\n'),
    page: markup.page(t),
    nav: markup.nav(t),
  };
}

/** Splice-safety invariant, asserted for every language. */
function verify() {
  const problems = [];
  for (const lang of i18n.TRANSLATED) {
    const out = forLang(lang);
    for (const key of ['css', 'js', 'page', 'nav']) {
      const s = out[key];
      if (s.indexOf('`') > -1) problems.push(`${lang}/${key}: contains a backtick`);
      if (/(^|[^\\])\$\{/.test(s)) problems.push(`${lang}/${key}: contains an unescaped \${`);
    }
  }
  return problems;
}

module.exports = { forLang, verify };
