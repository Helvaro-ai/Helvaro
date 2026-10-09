'use strict';
/* Een geblokkeerde voorraaddaling gaf maar één push (bij de overgang). Bleef de
 * blokkade staan, dan hoorde de dealer niets meer terwijl verkochte wagens
 * beschikbaar en boekbaar bleven (review 2026-10-09). Nu: één herinnering per
 * volle dag dat de blokkade aanhoudt. */
const assert = require('assert');
const path = require('path');
const { dagHerinnering } = require(path.join(__dirname, '..', 'api', '_inventaris.js'))._test;
const uur = 3600 * 1000;
const t0 = Date.parse('2026-10-09T10:30:00Z');
const iso = (h) => new Date(t0 + h * uur).toISOString();
// geschiedenis: nieuwste eerst, alle runs geblokkeerd sinds t0
const vorige = (laatsteUur) => Array.from({ length: laatsteUur + 1 }, (_, i) => ({ at: iso(laatsteUur - i), daling: 2 }));
assert.strictEqual(dagHerinnering({ at: iso(1) }, vorige(0)), false, 'na 1 uur: geen herinnering');
assert.strictEqual(dagHerinnering({ at: iso(23) }, vorige(22)), false, 'na 23 uur: nog niet');
assert.strictEqual(dagHerinnering({ at: iso(24) }, vorige(23)), true, 'na 24 uur: herinnering');
assert.strictEqual(dagHerinnering({ at: iso(25) }, vorige(24)), false, 'het uur erna niet opnieuw');
assert.strictEqual(dagHerinnering({ at: iso(48) }, vorige(47)), true, 'na 48 uur: tweede herinnering');
assert.strictEqual(dagHerinnering({ at: iso(24) }, [{ at: iso(23) }]), false, 'vorige run niet geblokkeerd: geen herinnering (de overgang meldt al)');
console.log('voorraad-daling-herinnering: ok');
