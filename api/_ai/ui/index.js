'use strict';
/*
 * Helvaro AI — UI assembly.
 *
 * SCAFFOLD: complete. This is the single seam between the AI workspace and
 * api/dashboard.js.
 *
 * ── How dashboard.js consumes this ───────────────────────────────────────────
 * Four interpolations inside its `const HTML = \`...\`` template literal, and
 * nothing else:
 *
 *   1. in <style>, after the existing token block:   ${aiUI.css()}
 *   2. inside the topbar, centred:                   ${aiUI.switcher()}
 *   3. inside <aside class="sidebar">, after the
 *      existing <nav class="sidebar-nav">:           ${aiUI.sidebar()}
 *   4. after the last <main class="page">:           ${aiUI.workspace()}
 *   5. at the end of the inline <script>:            ${aiUI.js()}
 *
 * with `const aiUI = require('./_ai/ui');` at the top of the handler.
 *
 * That is the whole integration. It is deliberately small: dashboard.js is
 * ~19,000 lines and carries the entire paying product, so the AI workspace
 * touches it in five places rather than being woven through it.
 *
 * ── Escaping ─────────────────────────────────────────────────────────────────
 * These strings are interpolated INTO a template literal, so any backtick or
 * ${ } they contain would be evaluated by dashboard.js's own literal. They
 * contain neither — CSS uses no backticks, the markup builders use ordinary
 * string concatenation at call time (the template literals inside markup.js
 * are evaluated HERE, before the result is handed over), and client.js is
 * written in ES5 string concatenation for exactly this reason.
 *
 * If a future edit needs a backtick or a ${ } inside client.js's returned
 * source, it must be escaped as \\\` / \\${ — the same constraint api/dashboard.js
 * documents at its line 16414.
 */

const tokens  = require('./tokens');
const styles  = require('./styles');
const markup  = require('./markup');
const client  = require('./client');
const quick   = require('./quick-actions');

/** All AI workspace CSS: token extensions first, then components. */
function css() {
  return tokens.css() + styles.css();
}

/**
 * All AI workspace JavaScript.
 * The quick-action table is injected as JSON rather than duplicated by hand,
 * so the buttons rendered by markup.js and the prompts fired by client.js can
 * never drift apart — they read the same object.
 */
function js() {
  const table = JSON.stringify(quick.BY_ID).replace(/</g, '\\u003c');
  return `\nvar AI_QUICK_ACTIONS = ${table};\n` + client.js();
}

module.exports = {
  css,
  js,
  switcher: markup.switcher,
  sidebar: markup.sidebar,
  workspace: markup.workspace,
};
