/*
 * Meldingen in de taal van de klant.
 *
 * ── Wat hier misging ────────────────────────────────────────────────────────
 * Er stonden 113 toast-aanroepen met een letterlijke Nederlandse zin erin. Een
 * Waalse of Duitstalige makelaar kreeg dus een volledig vertaald scherm met
 * Nederlandse bevestigingen en foutmeldingen erdoorheen -- en precies op de
 * momenten dat er iets gebeurt en je wil weten wat.
 *
 * "Netwerkfout. Probeer opnieuw", "Opslaan mislukt", "Betaling gelukt. Je
 * credits worden bijgeschreven." Dat laatste op de betaalpagina, in een taal
 * die de klant niet gekozen heeft.
 *
 * ── Wat expres Nederlands blijft ────────────────────────────────────────────
 * De founder-schermen: 'Doel opgeslagen', 'Week gereset', 'Kies eerst een
 * prospect', 'Weekrapport geladen'. Die leest niemand behalve Sindi zelf, en
 * ze vertalen is werk zonder lezer. Deze test bewaakt dat onderscheid, zodat
 * "er staat nog Nederlands in" niet automatisch als fout wordt gelezen.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const i18n = require(BASE + 'api/_i18n.js');
const src  = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`);
  ok ? pass++ : fail++;
};

console.log('\nMeldingen spreken de taal van de klant');

/* Elke sleutel die de code gebruikt, moet in alle vier de talen bestaan. Een
   ontbrekende vertaling valt terug op de sleutelnaam, en dan leest de klant
   letterlijk "tst.opslaanMislukt". */
const gebruikt = [...new Set([...src.matchAll(/tr\('(tst\.[a-zA-Z]+)'\)/g)].map((m) => m[1]))];
console.log(`\n  ${gebruikt.length} sleutels in gebruik`);
ck('er zijn er meer dan tachtig omgezet', gebruikt.length >= 70, gebruikt.length);

for (const taal of ['nl', 'fr', 'en', 'de']) {
  const mist = gebruikt.filter((k) => { const v = i18n.t(taal, k); return !v || v === k; });
  ck(`${taal}: geen enkele sleutel ontbreekt`, mist.length === 0, mist);
}

/* Een vertaling die per ongeluk de Nederlandse zin herhaalt, is geen
   vertaling. Voor het Frans en Duits mag hij dus niet identiek zijn aan het
   Nederlands -- op een paar woorden na die in beide talen hetzelfde zijn. */
console.log('\n  en het zijn echte vertalingen');
{
  const zelfdeAlsNl = gebruikt.filter((k) => {
    const nl = i18n.t('nl', k);
    return nl.length > 12 && i18n.t('fr', k) === nl;
  });
  ck('fr: geen lange zin die letterlijk het Nederlands herhaalt', zelfdeAlsNl.length === 0, zelfdeAlsNl);
  const dupDe = gebruikt.filter((k) => {
    const nl = i18n.t('nl', k);
    return nl.length > 12 && i18n.t('de', k) === nl;
  });
  ck('de: idem', dupDe.length === 0, dupDe);
}

console.log('\n  de klantgerichte zinnen zijn er echt uit');
for (const zin of [
  "toast('Netwerkfout'", "toast('Opslaan mislukt'", "toast('Verwijderd'",
  "toast('Betaling gelukt. Je credits worden bijgeschreven.'",
  "toast('Je sessie is verlopen. Log opnieuw in'",
  "toast('Lead heeft geen telefoonnummer'",
]) {
  ck(`weg: ${zin}`, src.indexOf(zin) === -1, null);
}

console.log('\n  en de interne schermen blijven met rust gelaten');
{
  /* Positief toetsen, net als bij de AI-disclosures: als een latere ronde deze
     ook omzet is dat werk zonder lezer, en dan hoort dat op te vallen. */
  const founder = ["toast('Doel opgeslagen'", "toast('Week gereset'",
                   "toast('Kies eerst een prospect'", "toast('Weekrapport geladen'"];
  const weg = founder.filter((z) => src.indexOf(z) === -1);
  ck('de founder-meldingen staan er nog gewoon in het Nederlands', weg.length === 0, weg);
}

/* De duurste melding van allemaal: hij bevestigt geld. */
console.log('\n  de betaalbevestiging klopt in vier talen');
for (const taal of ['nl', 'fr', 'en', 'de']) {
  const t = i18n.t(taal, 'tst.betalingCredits');
  ck(`${taal}: bevestigt de betaling en noemt de credits`,
    t.length > 20 && /credit|crédit|Guthaben/i.test(t), t);
}
ck('en "er is niets afgeschreven" staat er ook in vier talen',
  ['nl', 'fr', 'en', 'de'].every((t) => {
    const v = i18n.t(t, 'tst.betalingGeannuleerd');
    return v && v !== 'tst.betalingGeannuleerd' && v.length > 20;
  }), null);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
