/*
 * De dealership-boekingspoort zit ECHT in het pad -- in api/whatsapp.js en in
 * api/leads.js.
 *
 * ── Waarom een test op de bron ────────────────────────────────────────────────
 * De handlers zelf zijn te groot om met een nepnetwerk van kop tot staart te
 * draaien. Wat hier bewezen wordt is de bedrading: dat de poort wordt
 * aangeroepen VOOR de agendacontrole (de auto is belangrijker dan het tijdstip:
 * een vrij tijdstip op een verkochte auto is nog steeds geen afspraak), dat de
 * nieuwe velden worden geschreven, en dat de oude, smallere rem
 * (kanProefrit op status alleen) niet stiekem is blijven staan.
 *
 * Opmerkingen worden eerst weggeknipt: de code citeert in zijn commentaar de
 * oude situatie, en een test die daarop matcht bewijst niets.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

function bronZonderCommentaar(bestand) {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'api', bestand), 'utf8');
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
}

const wa    = bronZonderCommentaar('whatsapp.js');
const leads = bronZonderCommentaar('leads.js');

console.log('\n— api/whatsapp.js —');
{
  ck('de dealership-boekingspoort wordt geladen', /require\('\.\/_dealer-boeking'\)/.test(wa));

  /* Het BOOK-blok: controleer() VOOR checkSlot(). Beide staan één keer in het
     boekingsblok; de volgorde in de bron is de volgorde van uitvoering. */
  const iControleer = wa.indexOf('_dealerBoeking.controleer(');
  const iCheckSlot  = wa.indexOf('_gcal.checkSlot(');
  ck('controleer() wordt aangeroepen', iControleer !== -1);
  ck('... en wel VOOR de Google-agendacontrole', iControleer !== -1 && iCheckSlot !== -1 && iControleer < iCheckSlot, `${iControleer} vs ${iCheckSlot}`);
  ck('alleen voor dealership', /vertical === _vertical\.DEALERSHIP\)\s*\{\s*dealerControle = await _dealerBoeking\.controleer\(/.test(wa));

  ck('na het aanmaken wordt de race op het voertuig gesloten (naAanmaak)', /_dealerBoeking\.naAanmaak\(\{/.test(wa));
  const iCreate = wa.indexOf('const apptResult = await createAppointment(');
  const iNa     = wa.indexOf('_dealerBoeking.naAanmaak(');
  ck('naAanmaak komt NA createAppointment', iCreate !== -1 && iNa > iCreate, `${iCreate} vs ${iNa}`);

  ck('een geblokkeerd voertuig zet de lead recht', /buildVehicleUnavailableMessage\(effectiveLang\)/.test(wa));
  ck('de idempotentiesleutel van de poort gaat mee in het record', /apptId:\s*dealerControle \? dealerControle\.apptId : undefined/.test(wa));
  ck('het voertuig gaat mee in het record', /vehicleCode:\s*herkendVoertuig \? herkendVoertuig\.code : undefined/.test(wa));

  /* createAppointment schrijft de twee nieuwe velden, alleen als ze gevuld zijn. */
  ck("createAppointment schrijft 'Vehicle Code'", /fields\['Vehicle Code'\]\s*=/.test(wa));
  ck("createAppointment schrijft 'Appointment Type'", /fields\['Appointment Type'\]\s*=/.test(wa));
  ck('een opgegeven apptId wint van de afgeleide', /String\(opgegevenApptId \|\| ''\)\.trim\(\)\s*\|\|/.test(wa));

  /* De rem voor de AI: boekbaar() en niet meer de smallere kanProefrit(). */
  ck('pandBezichtigbaar komt uit boekbaar() ...', /pandBezichtigbaar:\s*herkendVoertuig\s*\?\s*Boolean\(voertuigBoekbaarheid && voertuigBoekbaarheid\.ok\)/.test(wa));
  ck('... en niet meer uit kanProefrit()', !/pandBezichtigbaar:\s*herkendVoertuig\s*\?\s*_vehicles\.kanProefrit\(/.test(wa));
  ck('boekbaar() krijgt de actieve afspraken op het voertuig mee', /_vehicles\.boekbaar\(herkendVoertuig,\s*actieveOpVoertuig\)/.test(wa));
  ck('bij een niet-boekbaar voertuig krijgt de fiche alternatieven', /_vehicles\.alternatieven\(/.test(wa) && /fiche\(herkendVoertuig,\s*kortingsgrenzen,\s*fichecontext\)/.test(wa));

  /* Na een gewonnen boeking: score + melding, nooit ervoor. */
  const iScore = wa.indexOf('_dealerBoeking.scoreNaBoeking(');
  ck('de leadscore wordt na de boeking herberekend', iScore > iNa, `${iScore} vs ${iNa}`);
  ck('de score gaat mee in de melding aan de verkoper', /score:\s*scoreNaBoeking \? scoreNaBoeking\.score : undefined/.test(wa));
  ck('de verkoper wordt verwittigd via de meldingsmodule', /_dealerMelding\.stuurAfspraakMelding\(\{/.test(wa));
  ck('de melding gebruikt de taal van de KLANT (lang), niet die van de lead', /bouwAfspraakBericht\(\{\s*lang,\s*leadNaam/.test(wa));
  ck('een verloren race zet geen leadvlaggen', /if \(!dealerVerloren\) \{\s*await updateLead\(lead\.id, \{\s*fldLeEqwNefdglLis: true/.test(wa));
}

console.log('\n— api/leads.js —');
{
  ck('appointment-create kent vehicleCode en type', /body\.vehicleCode/.test(leads) && /body\.type/.test(leads));
  ck('een onbekend type is een 400', /AFSPRAAK_TYPES\.indexOf\(bodyType\) === -1[\s\S]{0,80}status\(400\)/.test(leads));
  ck('een onbekend voertuig is een 404', /status\(404\)\.json\(\{ error: 'Voertuig niet gevonden' \}\)/.test(leads));
  ck('een niet-boekbaar voertuig is een 409 met code vehicle_unavailable', /status\(409\)\.json\(\{[\s\S]{0,120}code: 'vehicle_unavailable'/.test(leads));
  ck('een lead met een lopende afspraak is een 409 lead_has_appointment', /code: 'lead_has_appointment'/.test(leads));
  ck('al_geboekt geeft het bestaande record terug (idempotent, 200)', /al_geboekt[\s\S]{0,600}status\(200\)\.json\(\{[\s\S]{0,240}alGeboekt: true/.test(leads));
  ck('de poort wordt alleen voor dealership doorlopen', /dealerIsDealership = _vertical\.van\(dealerClientFields\) === _vertical\.DEALERSHIP/.test(leads));
  ck("schrijft 'Vehicle Code' en 'Appointment Type'", /fields\['Vehicle Code'\] = dealerVoertuig\.code/.test(leads) && /fields\['Appointment Type'\] = bodyType/.test(leads));
  ck('naAanmaak sluit de race, verlies is een 409 voertuig_bezet', /_dealerBoeking\.naAanmaak\(\{[\s\S]{0,700}reden: 'voertuig_bezet'/.test(leads));
  ck("mode 'activity-list' bestaat", /mode === 'activity-list'/.test(leads));
  ck('activity-list leest via _activiteit.lijst met de projectcode uit de sessie', /_activiteit\.lijst\(projectCode/.test(leads));
}

console.log(`\n${fail ? 'ROOD' : 'ALLES GROEN'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
