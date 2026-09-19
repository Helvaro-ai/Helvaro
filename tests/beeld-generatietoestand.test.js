'use strict';
/* De generatietoestand op de AI-beeld-pagina: één zichtbare kaart tijdens het
   maken (onbepaald, geen verzonnen procenten), een eerlijke mislukt-toestand
   met één knop, en hetzelfde jobId bij "Opnieuw proberen" zodat
   api/_images.js een herhaalde aanvraag herkent en nooit twee keer aanrekent. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
const css  = fs.readFileSync(path.join(__dirname, '..', 'api', '_dash', 'styles.js'), 'utf8');
const i18n = require('../api/_i18n.js');

let ok = 0;
function check(naam, cond) { assert.ok(cond, naam); ok++; }

check('generatiekaart staat in de markup',            dash.includes('id="pi-gen"'));
check('retry-knop hergebruikt de opdracht',            dash.includes('onclick="generatePiImage(true)"'));
check('jobId gaat mee in de aanvraag',                  /jobId:\s*piGenJobId/.test(dash));
check('nieuwe klik = nieuw jobId, retry = zelfde',      dash.includes("if (!opnieuw || !piGenJobId)"));
check('dubbelklik wordt geweigerd terwijl er iets loopt', dash.includes('if (btn.disabled) return;'));
check('geen verzonnen percentage',                      !/pi-gen[^\n]*%/.test(dash));
check('geen hard-coded "AI genereert" meer in de knop', !dash.includes('AI genereert (kan tot een minuut duren)'));
check('sweep is onbepaald (infinite)',                  /pi-sweep 2\.2s ease-in-out infinite/.test(css));
check('reduced motion zet de sweep uit',                /prefers-reduced-motion[\s\S]*\.pi-gen\.is-bezig \.pi-gen-sweep \{ animation: none/.test(css));

for (const k of ['pi.gen.bezig', 'pi.gen.sub', 'pi.gen.mislukt', 'pi.gen.misluktSub', 'pi.gen.opnieuw', 'pi.gen.bezigKnop', 'pi.gen.sec']) {
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const v = i18n.t(taal, k);
    check(`i18n ${k} in ${taal}`, typeof v === 'string' && v.length > 0 && v !== k);
  }
  check(`i18n ${k} noemt het product geen AI (nl)`, !/\bAI\b/.test(i18n.t('nl', k)));
}

console.log(`${ok} geslaagd, 0 gefaald`);
