#!/usr/bin/env node
// Zet een nieuw changelog-kopje klaar, gevuld met de commits sinds de vorige.
//
//   node scripts/changelog.js            # toon wat er nog niet in staat
//   node scripts/changelog.js --release  # zet "Nog niet uitgerold" om naar een datum
//
// ── Waarom een script en niet gewoon typen ───────────────────────────────────
// Omdat een changelog die met de hand bijgehouden moet worden er na drie drukke
// dagen niet meer is. Dit haalt de commits op die nog niet vermeld staan en zet
// ze onder het juiste kopje, zodat er alleen nog iets van gemaakt hoeft te
// worden — en dat laatste is precies het deel dat een mens moet doen.
//
// Wat dit NIET doet: commit-onderwerpen recyclen als changelog-regels. Een
// commit legt uit waarom de code veranderde; een changelog-regel zegt wat er
// voor de gebruiker anders is. Dat zijn twee verschillende teksten.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FILE = path.join(__dirname, '..', 'CHANGELOG.md');
const UNRELEASED = /^## Nog niet uitgerold.*$/m;

function git(cmd) {
  try { return execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function defaultBranch() {
  const r = git('git symbolic-ref --quiet --short refs/remotes/origin/HEAD');
  return r ? r.replace(/^origin\//, '') : 'main';
}

const md = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
const base = defaultBranch();
const branch = git('git rev-parse --abbrev-ref HEAD');
// Formaat tussen aanhalingstekens: de pijp is anders een SHELL-pipe en git-
// uitvoer verdwijnt in een commando dat "%s" heet.
const commits = git(`git log --format="%h|%s" origin/${base}..HEAD`)
  .split('\n').filter(Boolean)
  .map((l) => { const i = l.indexOf('|'); return { sha: l.slice(0, i), subject: l.slice(i + 1) }; });

if (process.argv.includes('--release')) {
  if (!UNRELEASED.test(md)) {
    console.error('Geen "Nog niet uitgerold"-kop gevonden om vrij te geven.');
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const out = md.replace(UNRELEASED, `## ${today}`)
                .replace(/^\d+ commits die nog niet op `[^`]+` staan\.[\s\S]*?\n\n/m, '');
  fs.writeFileSync(FILE, out);
  console.log(`"Nog niet uitgerold" is nu "## ${today}".`);
  console.log('Zet er een nieuw kopje boven zodra er weer werk begint.');
  process.exit(0);
}

// ── Rapport ─────────────────────────────────────────────────────────────────
console.log(`\ntak      ${branch}`);
console.log(`basis    origin/${base}`);
console.log(`commits  ${commits.length} niet op ${base}\n`);

if (!commits.length) {
  console.log('Niets te melden.\n');
  process.exit(0);
}

// ── Wat is er nog niet beschreven ───────────────────────────────────────────
// Niet zoeken naar sha's IN de tekst: een changelog-regel hoort juist niet op
// een commit te lijken, en één regel dekt vaak drie commits. In plaats daarvan
// staat onderaan het bestand een merkteken met de laatst beschreven commit.
const MARK = /<!-- changelog-tot: ([0-9a-f]{7,40}) -->/;
const marked = (md.match(MARK) || [])[1];

let pending = commits;
if (marked) {
  const idx = commits.findIndex((c) => c.sha.startsWith(marked) || marked.startsWith(c.sha));
  if (idx > -1) pending = commits.slice(0, idx);   // git log is nieuwste-eerst
  else console.log(`(merkteken ${marked} staat niet in deze reeks — alles wordt getoond)\n`);
}

if (!pending.length) {
  console.log('Alles tot en met het merkteken is beschreven.\n');
} else {
  console.log(`${pending.length} commit(s) nog niet beschreven:\n`);
  for (const c of pending) console.log(`  ${c.sha}  ${c.subject}`);
  console.log('\nZet ze onder "## Nog niet uitgerold" — als GEVOLG, niet als commit-tekst.');
  console.log('Vraag per regel: wat merkt de gebruiker hiervan, en moet hij iets doen?');
  console.log(`\nDaarna het merkteken bijwerken naar:  <!-- changelog-tot: ${commits[0].sha} -->\n`);
}

if (!UNRELEASED.test(md)) {
  console.log('LET OP: er is geen "## Nog niet uitgerold"-kop. Maak die eerst aan.\n');
}
