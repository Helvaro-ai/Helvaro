#!/usr/bin/env node
'use strict';
/* Parses the design tokens straight out of api/_dash/styles.js (both themes)
 * and prints WCAG contrast ratios for the pairs that matter most: body text
 * on the three surfaces, accent text, the four status inks on their chip
 * surfaces, the primary button, and the sidebar active pill. Run after any
 * token edit -- `node scripts/contrast-check.js`. Flags anything under
 * 4.5:1 (3:1 for large/bold text) with FAIL. */
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '../api/_dash/styles.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments so nothing in prose is parsed as a declaration

function block(re) {
  const start = css.search(re);
  if (start === -1) throw new Error('block not found: ' + re);
  const open = css.indexOf('{', start);
  let depth = 1, i = open + 1;
  while (depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
  return css.slice(open + 1, i - 1);
}

function parseVars(text) {
  const map = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(text))) map[m[1]] = m[2].trim();
  return map;
}

const rootVars = parseVars(block(/:root\s*{/));
const lightVars = Object.assign({}, rootVars, parseVars(block(/\[data-theme="light"\]\s*{/)));

function resolve(map, name, seen = new Set()) {
  if (seen.has(name)) return null;
  seen.add(name);
  const raw = map[name];
  if (!raw) return null;
  const varMatch = raw.match(/^var\(\s*--([\w-]+)\s*(?:,.+)?\)$/);
  if (varMatch) return resolve(map, varMatch[1], seen);
  const hex = raw.match(/#[0-9A-Fa-f]{6}/);
  return hex ? hex[0] : raw;
}
function allHex(map, name) { return (map[name] || '').match(/#[0-9A-Fa-f]{6}/g) || []; }

const toRGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [r, g, b].map(f);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function ratio(hexA, hexB) {
  const [lA, lB] = [luminance(toRGB(hexA)), luminance(toRGB(hexB))].sort((a, b) => b - a);
  return (lA + 0.05) / (lB + 0.05);
}
function composite(fgHex, alpha, bgHex) {
  const fg = toRGB(fgHex), bg = toRGB(bgHex);
  const mixed = fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
  return '#' + mixed.map((c) => c.toString(16).padStart(2, '0')).join('');
}

function report(label, map) {
  console.log(`\n=== ${label} ===`);
  const bg = resolve(map, 'bg'), card = resolve(map, 'card'), bgAlt = resolve(map, 'bg-alt');
  const surfaces = { bg, card, 'bg-alt': bgAlt };
  const texts = { text: resolve(map, 'text-c'), 'text-muted': resolve(map, 'text-muted-c'), 'text-disabled': resolve(map, 'text-disabled') };
  const rows = [];
  for (const [tName, tHex] of Object.entries(texts))
    for (const [sName, sHex] of Object.entries(surfaces))
      // text-disabled is WCAG 1.4.3-exempt (inactive UI component text) --
      // printed for visibility, never flagged as a real failure.
      rows.push([`${tName} / ${sName}`, tHex, sHex, 4.5, tName === 'text-disabled']);
  for (const s of ['bg', 'card']) rows.push([`accent-ink / ${s}`, resolve(map, 'accent-ink'), surfaces[s], 4.5]);
  for (const status of ['success', 'warning', 'error']) {
    const chip = composite(resolve(map, `${status}-c`), 0.12, card);
    rows.push([`${status}-ink / ${status}-chip`, resolve(map, `${status}-ink`), chip, 4.5]);
  }
  rows.push(['neutral-ink / neutral-chip', resolve(map, 'neutral-ink'), composite(resolve(map, 'c-sand'), map === lightVars ? 0.3 : 0.1, card), 4.5]);
  rows.push(['btn-primary-text / btn-primary-bg', resolve(map, 'btn-primary-text'), resolve(map, 'btn-primary-bg'), 4.5]);
  const goldStops = allHex(map, 'grad-gold');
  const navColor = map === lightVars ? '#1F1D18' : '#120F08';
  goldStops.forEach((stop, i) => rows.push([`sidebar-active-text / gold-stop-${i + 1}`, navColor, stop, 4.5]));

  for (const [label2, fg, bgHex, min, exempt] of rows) {
    const r = ratio(fg, bgHex);
    const flag = r >= min ? 'ok' : exempt ? 'exempt' : 'FAIL';
    console.log(`${flag.padEnd(6)} ${r.toFixed(2)}:1  ${label2}  (${fg} on ${bgHex}, need >=${min})`);
  }
}

report('DARK', rootVars);
report('LIGHT', lightVars);
