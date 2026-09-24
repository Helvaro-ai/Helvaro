'use strict';
/*
 * De kwaliteitsscore van Meta bij een eigen WhatsApp-nummer.
 *
 * ── Wat er mis was ──────────────────────────────────────────────────────────
 * De statusregel plakte de rauwe waarde uit de Graph API achteraan:
 *
 *     Gekoppeld · +32... · Cya · UNKNOWN
 *
 * UNKNOWN is Meta's antwoord voor een nummer met te weinig berichtgeschiedenis.
 * Er is niets mis en er valt niets te doen. Maar in hoofdletters achter je eigen
 * telefoonnummer leest het als een storing -- en het stond er in het Engels op
 * een verder vertaald scherm.
 *
 * Sindi liep dit op film tegen het lijf: ze ontkoppelde haar nummer, doorliep
 * de hele embedded signup van Meta opnieuw, en kreeg exact dezelfde regel
 * terug. Precies wat je doet als je denkt dat er iets kapot is. Er was niets
 * kapot; het scherm zei het alleen verkeerd.
 *
 * ── De regel die hier nu geldt ─────────────────────────────────────────────
 * Alleen iets zeggen als er iets te DOEN is.
 *
 *   UNKNOWN  -> niets. Nog geen geschiedenis, geen actie.
 *   GREEN    -> niets. De gezonde stand hoeft niet gevierd te worden.
 *   YELLOW   -> zeggen wat het is en waar het meestal vandaan komt.
 *   RED      -> zeggen dat Meta kan beperken of blokkeren, en wat te doen.
 *
 * Dat is dezelfde afspraak als bij de credits: niet dreigen als er niets aan de
 * hand is, wél duidelijk zijn zodra het telt.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const dash = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');
const css  = require(path.join(BASE, 'api/_dash/styles.js')).css();
const i18n = require(path.join(BASE, 'api/_i18n.js'));

console.log('\n  de rauwe waarde staat niet meer in de statusregel');
{
  /* DIT is de regressie. Komt `+ (n.quality ? ' · ' + n.quality : '')` terug,
     dan staat UNKNOWN er weer -- zonder dat er iets stukgaat. */
  ck('n.quality wordt niet meer achter de status geplakt',
    !/\+ \(n\.quality \? '[^']*' \+ n\.quality : ''\)/.test(dash), null);
  ck('de status toont nog wel nummer en naam',
    /tr\('set\.waes\.done'\)[\s\S]{0,200}n\.number[\s\S]{0,120}n\.name/.test(dash), null);
}

console.log('\n  alleen geel en rood krijgen een zin');
{
  ck('RED kiest de ernstige sleutel',   /kwaliteit === 'RED' \? 'set\.waes\.kwaliteit\.rood'/.test(dash), null);
  ck('YELLOW kiest de milde sleutel',   /kwaliteit === 'YELLOW' \? 'set\.waes\.kwaliteit\.geel'/.test(dash), null);
  /* De else-tak is een LEGE sleutel, en die leidt tot een lege, verborgen
     regel. Zou daar een derde sleutel staan, dan praat het scherm weer over
     iets waar niets aan te doen is. */
  ck('al het andere krijgt geen sleutel', /: ''\);\s*\n\s*kwalEl\.textContent = kwalSleutel \? tr\(kwalSleutel\) : '';/.test(dash), null);
  ck('en wordt verborgen', /kwalEl\.style\.display = kwalSleutel \? '' : 'none';/.test(dash), null);
}

console.log('\n  de twee zinnen bestaan in vier talen');
{
  for (const k of ['set.waes.kwaliteit.geel', 'set.waes.kwaliteit.rood']) {
    const per = ['nl', 'fr', 'en', 'de'].map((l) => i18n.t(l, k));
    ck(k + ' bestaat in vier talen', per.every((w) => w && w !== k), per.map((w) => w.slice(0, 20)));
    ck(k + ' is echt vertaald', new Set(per).size === 4);
  }
  /* De rode zin moet zeggen wat er kan gebeuren. Zonder dat is het een kleurtje
     zonder gevolg, en dan onderneemt niemand iets. */
  const GEVOLG = { nl: /beperken|blokkeren/i, fr: /limiter|bloquer/i, en: /restrict|block/i, de: /einschränken|sperren/i };
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    ck(taal + ': rood noemt beperking of blokkade',
      GEVOLG[taal].test(i18n.t(taal, 'set.waes.kwaliteit.rood')), i18n.t(taal, 'set.waes.kwaliteit.rood').slice(0, 70));
  }
}

console.log('\n  het element bestaat en is standaard onzichtbaar');
{
  ck('er is een plek om het in te zetten', /id="set-waes-kwaliteit"/.test(dash));
  ck('en hij start verborgen', /id="set-waes-kwaliteit" style="display:none"/.test(dash));
  ck('met een eigen stijl', /\.set-waes-kwaliteit \{/.test(css));
  ck('en een ernstige variant', /\.set-waes-kwaliteit\.ernstig \{/.test(css));
}

console.log('\n  de bron levert de waarde nog steeds aan');
{
  /* Niet weghalen uit api/_waes.js: de waarde is nog steeds nodig om te kunnen
     beslissen of er iets getoond moet worden. Alleen de WEERGAVE is veranderd. */
  const waes = fs.readFileSync(path.join(BASE, 'api/_waes.js'), 'utf8');
  ck('_waes.js vraagt quality_rating nog op', /quality_rating/.test(waes));
  ck('en geeft hem door als quality', /quality:\s*d\.quality_rating/.test(waes));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
