/*
 * De cron mag niet melden wat hij niet verstuurd heeft.
 *
 * ── Wat er misging, en het gebeurde LIVE ────────────────────────────────────
 * cron-followup.js had een eigen sendWATemplate die de fout keurig logde en in
 * ALLE gevallen `undefined` teruggaf. Geslaagd en mislukt zagen er voor de
 * aanroeper dus identiek uit. Beide lussen deden daarna onvoorwaardelijk
 * `sent++` en zetten de naam van de lead in de dagmail.
 *
 * Op het moment van schrijven is het Meta-token dood ("session has been
 * invalidated because the user changed their password", 401 in de Vercel-logs).
 * Elke ochtend om 09:00 kreeg Sindi dus een mail die met naam en toenaam
 * meldde welke leads waren opgevolgd, terwijl er niets de deur uit ging.
 *
 * Een rapport dat niet kan weten of het waar is, is erger dan geen rapport: je
 * stopt met controleren.
 *
 * ── Waarom api/leads.js dit al goed deed ────────────────────────────────────
 * Die heeft zijn EIGEN sendWATemplate die wel een boolean teruggeeft
 * (api/form.js doet er `const waOk = await ...` mee). Twee implementaties van
 * hetzelfde, waarvan er een stilletjes loog. Dat die uit elkaar konden lopen is
 * het echte probleem; deze test pint in elk geval het gedrag van beide vast.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const cron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

console.log('\nDe cron meldt alleen wat echt verstuurd is');

console.log('\n  de verzendfunctie zegt of het gelukt is');
{
  const m = cron.match(/function sendWATemplate\(to, templateName, lang, params, phoneNumberId, token\) \{[\s\S]*?\n\}/);
  ck('sendWATemplate staat in cron-followup', !!m, null);
  const f = m ? m[0] : '';
  ck('geeft false terug bij een fout van Meta', /return false;/.test(f), null);
  ck('geeft true terug bij succes', /return true;/.test(f), null);
  ck('en vangt ook de netwerkfout af met false',
    /catch\(err => \{[\s\S]{0,220}?return false;/.test(f), null);
}

console.log('\n  en de lussen lezen dat antwoord ook echt');
{
  ck('de opvolglus vangt het resultaat op',
    /const waOk = await sendWATemplate\(phone,/.test(cron), null);
  ck('en telt niet mee wat mislukte',
    /if \(!waOk\) \{[\s\S]{0,200}?continue;/.test(cron), null);
  /* Het gevaarlijkste geval: sent++ dat NIET achter de controle staat. */
  const naSent = cron.slice(cron.indexOf('const waOk = await sendWATemplate'));
  const iGuard = naSent.indexOf('if (!waOk)');
  const iSent  = naSent.indexOf('sent++');
  ck('de controle staat VOOR het optellen', iGuard !== -1 && iGuard < iSent, { iGuard, iSent });

  ck('de herinneringslus doet hetzelfde',
    /const remOk = await sendWATemplate\(normalizedPhone,/.test(cron)
    && /if \(!remOk\) \{ skipped\+\+; continue; \}/.test(cron), null);
}

console.log('\n  de dagmail vertelt ook de mislukkingen');
{
  ck('mislukte verzendingen worden bijgehouden', /const nietVerstuurd = \[\];/.test(cron), null);
  ck('de mail gaat ook uit als er NIETS gelukt is',
    /if \(sent > 0 \|\| nietVerstuurd\.length > 0\)/.test(cron), null);
  ck('het onderwerp zegt het wanneer er iets misging',
    /MISLUKT vandaag/.test(cron), null);
  ck('en de mail noemt de vermoedelijke oorzaak',
    /verlopen WhatsApp-token/.test(cron), null);
}

/* api/leads.js deed dit al goed. Dat vastpinnen, zodat de twee niet opnieuw
   uit elkaar lopen -- en zodat wie ze ooit samenvoegt weet welke kant klopt. */
console.log('\n  de andere implementatie blijft ook eerlijk');
{
  const m = leads.match(/(?:async )?function sendWATemplate\([\s\S]{0,1800}?\n\}/);
  ck('api/leads.js heeft zijn eigen sendWATemplate', !!m, null);
  ck('en die geeft ook een resultaat terug in plaats van niets',
    !!m && /return (?:true|false|!!|ok|r\.ok|Boolean)/.test(m[0]), m ? m[0].slice(-160) : null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
