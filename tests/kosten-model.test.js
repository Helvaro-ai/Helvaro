/*
 * Het providerkostenmodel: één plek voor eenheidsprijzen, en elke prijs
 * draagt een 'bijgewerkt'-datum.
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * api/_ai/registry.js kende al PRICING voor tekst/beeld-modellen en
 * api/_media-models.js kende al costUsd() per beeld-/videomodel. Wat ontbrak:
 * WhatsApp-conversatieprijzen (Meta's per-conversation billing) en een
 * uniforme manier om te zien HOE OUD een prijs is. Deze test bewaakt beide
 * toevoegingen, en dat er geen derde, losse prijzentabel is bijgekomen.
 */
'use strict';

const registry = require('../api/_ai/registry');
const models   = require('../api/_media-models');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\n— WhatsApp-conversatieprijzen ─────────────────────────────');
ck('marketing kost meer dan utility', registry.WA_PRICING_EUR.marketing.perConversation > registry.WA_PRICING_EUR.utility.perConversation, registry.WA_PRICING_EUR);
ck('service is gratis (klant opent zelf het gesprek)', registry.WA_PRICING_EUR.service.perConversation === 0, registry.WA_PRICING_EUR.service);
ck('elke categorie draagt een bijgewerkt-datum', Object.values(registry.WA_PRICING_EUR).every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.bijgewerkt)), registry.WA_PRICING_EUR);
ck('elke categorie is gemarkeerd als schatting, niet als lijstprijs',
   Object.values(registry.WA_PRICING_EUR).every((p) => p.bron === 'schatting'), registry.WA_PRICING_EUR);

ck('waKostenEur(utility) geeft het echte getal terug', registry.waKostenEur('utility') === registry.WA_PRICING_EUR.utility.perConversation);
ck('waKostenEur is ongevoelig voor hoofdletters', registry.waKostenEur('UTILITY') === registry.WA_PRICING_EUR.utility.perConversation);
ck('een onbekende categorie geeft null, geen verzonnen 0', registry.waKostenEur('bestaat-niet') === null);

console.log('\n— AI-tekstprijzen dragen ook een bijgewerkt-datum ─────────');
for (const [model, p] of Object.entries(registry.PRICING)) {
  ck(`${model} heeft bijgewerkt + bron`, /^\d{4}-\d{2}-\d{2}$/.test(p.bijgewerkt) && !!p.bron, p);
}

console.log('\n— Media-modellen dragen ook een bijgewerkt-datum ──────────');
for (const [id, m] of Object.entries(models.IMAGE_MODELS)) {
  ck(`beeldmodel ${id} heeft bijgewerkt`, /^\d{4}-\d{2}-\d{2}$/.test(m.bijgewerkt), m.bijgewerkt);
}
for (const [id, m] of Object.entries(models.VIDEO_MODELS)) {
  ck(`videomodel ${id} heeft bijgewerkt`, /^\d{4}-\d{2}-\d{2}$/.test(m.bijgewerkt), m.bijgewerkt);
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
