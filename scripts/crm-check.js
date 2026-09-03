#!/usr/bin/env node
'use strict';
/*
 * Kloppen de CRM-adapters met de echte API's?
 *
 * De adapters in api/_crm/adapters/ zijn geschreven zonder dat de bouwmachine
 * api.hubapi.com, pipedrive.com, salesforce.com of omnicasa.com kon bereiken --
 * de netwerkpolicy laat ze niet door. De vorm van elk verzoek is nagetrokken in
 * openbare documentatie, maar nagetrokken is niet hetzelfde als gedraaid.
 * Precies dat verschil is in deze codebase al eens duur geweest (zie de kop van
 * api/_video-adapters.js), en dit script is de tegenmaatregel.
 *
 *   node scripts/crm-check.js                alles waarvoor sleutels staan
 *   node scripts/crm-check.js hubspot        alleen deze
 *
 * Sleutels komen uit omgevingsvariabelen, niet uit Airtable -- dit is een
 * controle op de ADAPTER, niet op de koppeling van een klant:
 *
 *   HUBSPOT_TOKEN
 *   PIPEDRIVE_DOMEIN         PIPEDRIVE_TOKEN
 *   SALESFORCE_DOMEIN        SALESFORCE_CLIENT_ID   SALESFORCE_CLIENT_SECRET
 *   OMNICASA_SECRET          OMNICASA_BASIS (optioneel)
 *
 * Draaien met een .env: `node --env-file=.env.local scripts/crm-check.js`.
 *
 * -- Er wordt NIETS aangemaakt -----------------------------------------------
 * Alleen test() draait, en die leest. Anders zou een controle rommel achterlaten
 * in het CRM van een echte makelaar, en dan draait niemand hem een tweede keer.
 * Wat test() daardoor NIET bewijst is het schrijfrecht; dat staat per adapter in
 * zijn eigen kop.
 */

const path = require('path');
const crm = require(path.join(__dirname, '..', 'api', '_crm'));

const g = (s) => `\x1b[32m${s}\x1b[0m`;
const r = (s) => `\x1b[31m${s}\x1b[0m`;
const y = (s) => `\x1b[33m${s}\x1b[0m`;
const d = (s) => `\x1b[2m${s}\x1b[0m`;

/* Waar de sleutels vandaan komen. Eén plek, zodat de foutmelding hieronder
   precies dezelfde namen noemt als deze lijst. */
const UIT_OMGEVING = {
  hubspot: () => process.env.HUBSPOT_TOKEN && { token: process.env.HUBSPOT_TOKEN },
  pipedrive: () => process.env.PIPEDRIVE_TOKEN && process.env.PIPEDRIVE_DOMEIN
    && { token: process.env.PIPEDRIVE_TOKEN, domein: process.env.PIPEDRIVE_DOMEIN },
  salesforce: () => process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET
    && process.env.SALESFORCE_DOMEIN && {
      domein: process.env.SALESFORCE_DOMEIN,
      clientId: process.env.SALESFORCE_CLIENT_ID,
      clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
    },
  omnicasa: () => process.env.OMNICASA_SECRET
    && { secret: process.env.OMNICASA_SECRET, basis: process.env.OMNICASA_BASIS || undefined },
  /* De webhook is de enige die WEL iets verstuurt bij een controle: een ping.
     Dat is het punt -- hij bewijst dat het adres bestaat, dat de ontvanger
     draait en dat die onze handtekening accepteert. Er wordt niets aangemaakt. */
  webhook: () => process.env.WEBHOOK_URL
    && { url: process.env.WEBHOOK_URL, secret: process.env.WEBHOOK_SECRET || '' },
};

const NODIG = {
  hubspot:    'HUBSPOT_TOKEN',
  pipedrive:  'PIPEDRIVE_DOMEIN + PIPEDRIVE_TOKEN',
  salesforce: 'SALESFORCE_DOMEIN + SALESFORCE_CLIENT_ID + SALESFORCE_CLIENT_SECRET',
  omnicasa:   'OMNICASA_SECRET (+ OMNICASA_BASIS als je niet op de CRE-API zit)',
  webhook:    'WEBHOOK_URL (+ WEBHOOK_SECRET, of leeg voor een gemaakte sleutel)',
};

(async () => {
  const gevraagd = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const lijst = crm.adapters().filter((a) => !gevraagd.length || gevraagd.includes(a.naam));

  if (!lijst.length) {
    console.log(`\nOnbekend CRM. Keuze: ${crm.adapters().map((a) => a.naam).join(', ')}\n`);
    process.exit(1);
  }

  console.log('\nCRM-controle — er wordt alleen gelezen, er komt niets bij in een CRM.\n');

  let goed = 0, fout = 0, overgeslagen = 0;

  for (const a of lijst) {
    if (!a.beschikbaar) {
      overgeslagen++;
      console.log(`  ${y('N.V.T.')} ${a.label}  adapter bestaat nog niet`);
      console.log(d(`         nodig: ${(a.ontbreekt || []).join(', ')}`));
      continue;
    }

    const cred = (UIT_OMGEVING[a.naam] || (() => null))();
    if (!cred) {
      overgeslagen++;
      console.log(`  ${y('OVER')}   ${a.label}  geen sleutels gezet`);
      console.log(d(`         zet ${NODIG[a.naam]}`));
      continue;
    }

    try {
      const uit = await crm.adapter(a.naam).test(cred);
      goed++;
      console.log(`  ${g('OK  ')}   ${a.label}  ${uit.account || 'verbonden'}`);
      /* Wat test() erbij ontdekte hoort in beeld: als de pijplijn leeg blijft
         komen deals zonder fase binnen, en dat is precies iets wat je hier wilt
         zien en niet pas bij de eerste klant. */
      if (uit.extra && uit.extra.pijplijn) {
        console.log(d(`         pijplijn ${uit.extra.pijplijn.id} met ${uit.extra.pijplijn.stages.length} fasen`));
      } else if (uit.extra && 'pijplijn' in uit.extra) {
        console.log(d('         GEEN pijplijn gevonden — deals komen binnen zonder fase'));
      }
      if (uit.extra && uit.extra.versie) console.log(d(`         API-versie ${uit.extra.versie}`));
      /* Eén keer tonen en nergens anders op te vragen -- daarom hier, waar de
         eigenaar hem kan kopieren naar zijn ontvanger. */
      if (uit.toonEenmalig) console.log(d(`         ondertekeningssleutel (eenmalig): ${uit.toonEenmalig}`));
    } catch (err) {
      fout++;
      console.log(`  ${r('FOUT')}   ${a.label}  ${err.message}`);
      if (err.code)   console.log(d(`         code   ${err.code}`));
      if (err.status) console.log(d(`         status ${err.status}`));
      /* De rauwe tekst van de leverancier. Die mag nooit naar een klant, maar
         hier is het het hele punt: dit is wat er echt terugkwam, en daarmee is
         de aanname in vijf minuten recht te zetten. */
      if (err.detail) console.log(d(`         ${String(err.detail).replace(/\n/g, '\n         ').slice(0, 600)}`));
    }
  }

  console.log(`\n${goed} goed, ${fout} fout, ${overgeslagen} overgeslagen\n`);
  if (fout) {
    console.log('Elke aanname staat met naam in de kop van de adapter in api/_crm/adapters/.');
    console.log('Pas daar aan wat niet klopte en draai dit script opnieuw.\n');
  }
  process.exit(fout ? 1 : 0);
})();
