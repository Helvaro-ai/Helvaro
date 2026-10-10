'use strict';
/* Een geblokkeerde voorraaddaling gaf maar één push (bij de overgang). Bleef de
 * blokkade staan, dan hoorde de dealer niets meer terwijl verkochte wagens
 * beschikbaar en boekbaar bleven (review 2026-10-09). Nu: één herinnering per
 * volle dag dat de blokkade aanhoudt.
 *
 * De eerste versie las het begin uit de rungeschiedenis -- maar die houdt maar
 * tien runs bij, dus "24 uur" werd in productie nooit bereikt (review 2,
 * 2026-10-10). Deze test bootst productie na: geschiedenis van hoogstens tien
 * runs, het begin uit staat.dalingSinds. */
const assert = require('assert');
const path = require('path');
const { dagHerinnering } = require(path.join(__dirname, '..', 'api', '_inventaris.js'))._test;
const uur = 3600 * 1000;
const t0 = Date.parse('2026-10-09T10:30:00Z');
const iso = (h) => new Date(t0 + h * uur).toISOString();

const herinneringen = [];
let runs = [{ at: iso(0), daling: 2 }];          // run 0: de overgang (die meldt al apart)
const sinds = iso(0);                              // wat de sync in staat.dalingSinds zet
for (let h = 1; h <= 120; h++) {
  const run = { at: iso(h), daling: 2 };
  if (dagHerinnering(run, runs, sinds)) herinneringen.push(h);
  runs = [run].concat(runs).slice(0, 10);          // GESCHIEDENIS = 10, zoals in productie
}
assert.deepStrictEqual(herinneringen, [24, 48, 72, 96, 120], 'één herinnering per volle dag: ' + herinneringen.join(','));

// Zonder dalingSinds (oude staat) valt het terug op de geschiedenis; geen herinnering zolang die korter is dan een dag.
assert.strictEqual(dagHerinnering({ at: iso(5) }, [{ at: iso(4), daling: 2 }]), false);
// Vorige run niet geblokkeerd: geen herinnering (de overgang zelf meldt al).
assert.strictEqual(dagHerinnering({ at: iso(24) }, [{ at: iso(23) }], null), false);

// De sync bewaart en wist dalingSinds.
const bron = require('fs').readFileSync(path.join(__dirname, '..', 'api', '_inventaris.js'), 'utf8');
assert.ok(/nieuw\.dalingSinds = staat\.dalingSinds \|\| run\.at;/.test(bron), 'begin van de blokkade wordt bewaard');
assert.ok(/else delete nieuw\.dalingSinds;/.test(bron), 'en gewist zodra de blokkade weg is');
assert.ok(/dagHerinnering\(run, vorige, staat && staat\.dalingSinds\)/.test(bron), 'de melding gebruikt het bewaarde begin');
console.log('voorraad-daling-herinnering: ok');
