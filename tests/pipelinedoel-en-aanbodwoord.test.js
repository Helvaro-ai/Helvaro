/*
 * Twee kleinere dingen uit de doorloop op productie.
 *
 * ── 1. Het pipelinedoel liep via een kale prompt() ──────────────────────────
 * Drie dingen mis. Hij BLOKKEERT de pagina -- tijdens de test stond de tab
 * twee keer volledig stil tot de dialoog weggeklikt werd. Hij is niet te
 * vertalen: er stond hardgecodeerd 'Nieuw pipelinedoel (€):' midden in een
 * scherm dat verder netjes door tr() gaat. En sommige mobiele browsers
 * onderdrukken prompt() helemaal, waardoor de knop daar gewoon niets deed.
 *
 * Wat hier NIET mee opgelost is: het doel staat nog steeds alleen in
 * localStorage. Op een ander apparaat begin je weer bij €5000. Dat vraagt een
 * veld op Client Config en dus een schemawijziging, en dat is geen opruimactie.
 * De modal ZEGT dat nu, in plaats van te doen alsof het bewaard is -- die
 * eerlijkheid wordt hieronder bewaakt.
 *
 * ── 2. "property image" op een autohandel ───────────────────────────────────
 * De lege staat van Faro-projecten zei "Generate your first property image or
 * listing", ook op een dealership-account. Zelfde soort fout als de kop in de
 * topbalk (zie tests/aanbodwoord-topbalk.test.js), maar hier is de translator
 * niet vertical-bewust en zou hem dat maken een flinke verbouwing zijn voor
 * één zin. Daarom neutraal geformuleerd: correct voor allebei de markten.
 */
'use strict';

const fs      = require('fs');
const path    = require('path');
const i18n    = require('../api/_i18n.js');
const faroUI  = require('../api/_faro/ui/i18n.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const bron = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
/* Alleen code, geen commentaar: de uitleg bij deze reparatie noemt prompt()
   om te vertellen waarom hij weg is. Zonder deze stap slaat de test aan op
   zijn eigen verantwoording.

   Ook HTML-commentaar eruit. dashboard.js zet de hele pagina op in template-
   strings, en daar staat toelichting in <!-- ... --> die net zo goed proza is
   als /* ... *\/. Zonder die stap telde deze test een zin over een oude
   prompt() mee als code. */
const code = bron
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .split('\n').filter((r) => !/^\s*\/\//.test(r)).join('\n');

console.log('\n— het pipelinedoel gebruikt geen blokkerende dialoog meer —');
{
  const blok = (code.match(/function setupRevenueGoalEdit\(\)[\s\S]*?\}\)\(\);/) || [''])[0];
  ck('de doel-bewerker bestaat nog', blok.length > 0, null);
  ck('hij roept showConfirmModal aan', /showConfirmModal\(/.test(blok), blok.slice(0, 200));
  ck('en geen prompt() meer', !/(?<![\w.])prompt\s*\(/.test(blok), blok.slice(0, 200));

  ck('de teksten komen uit de vertaaltabel',
     /tr\('goal\.edit\.title'\)/.test(blok)
       && /tr\('goal\.edit\.label'\)/.test(blok)
       && /tr\('goal\.edit\.uitleg'\)/.test(blok), blok.slice(0, 300));

  /* De enige prompt() die mag blijven staat op de Kosten-pagina: die is
     admin-only en wordt uit de HTML van een klant geknipt (stripBackoffice).
     Komt er ooit een prompt() bij op een KLANTscherm, dan valt deze om. */
  const alle = [...code.matchAll(/(?<![\w.])prompt\s*\(/g)];
  ck('er is hoogstens nog één prompt() over, en die is admin-only',
     alle.length <= 1, 'gevonden: ' + alle.length);
}

console.log('\n— de vertalingen bestaan in alle vier de talen —');
{
  for (const sleutel of ['goal.edit.title', 'goal.edit.label', 'goal.edit.uitleg']) {
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const v = i18n.t(taal, sleutel);
      ck(`${sleutel} (${taal}) is vertaald`,
         !!v && v !== sleutel && v !== taal, v);
    }
  }
  /* De uitleg moet ECHT zeggen dat het lokaal blijft. Anders is de modal een
     mooiere verpakking van dezelfde stille aanname. */
  ck('de uitleg zegt dat het doel op dit apparaat blijft',
     /apparaat/i.test(i18n.t('nl', 'goal.edit.uitleg'))
       && /device/i.test(i18n.t('en', 'goal.edit.uitleg')), null);
}

console.log('\n— showConfirmModal kan een invoerveld tonen —');
{
  ck('de modal accepteert inputLabel', /inputLabel/.test(code), null);
  ck('en geeft de ingevulde waarde door aan onConfirm',
     /onConfirm\(v\)/.test(code), null);
  /* Een label dat nergens aan hangt leest een schermlezer niet voor -- dat is
     precies de fout die op het aanmeldscherm 29 keer stond. */
  ck('het label hangt aan het invoerveld',
     /setAttribute\('for',\s*inputEl\.id\)/.test(code), null);
}

console.log('\n— geen "pand" meer in een lege staat die ook een dealer ziet —');
{
  for (const taal of ['nl', 'en', 'fr', 'de']) {
    const t = faroUI.translator(taal);
    const zin = t('act.empty');
    ck(`${taal}: de lege staat is vertaald`, !!zin && zin !== 'act.empty', zin);
    ck(`${taal}: hij noemt geen pand/property/bien/Objekt`,
       !/pand|property|de bien|Objektbild/i.test(zin), zin);
  }
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
