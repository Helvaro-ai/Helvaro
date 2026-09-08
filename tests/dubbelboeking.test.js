/*
 * Twee afspraken op hetzelfde moment horen niet allebei te lukken.
 *
 * ── Wat er op de live app gebeurde ──────────────────────────────────────────
 * Twee keer exact dezelfde starttijd boeken vanuit het dashboard gaf twee keer
 * HTTP 200 en twee records in Airtable.
 *
 * De conflictcontrole die er al was, zit achter `if (gToken)`: hij vraagt het
 * aan de Google Agenda van de klant. Geen gekoppelde agenda -- een nieuwe
 * klant, of een koppeling die verlopen is; de OAuth staat op Testing en
 * verloopt elke zeven dagen -- en er stond helemaal niets tussen.
 *
 * Dat is de scherpe kant: de bewaking hing aan precies het token waarvan
 * bekend is dat het wekelijks omvalt.
 *
 * ── Waarom het erger is dan twee afspraken ──────────────────────────────────
 * Appointment ID wordt AFGELEID van het tijdstip (PROJECT-JJMMDDUUMM). Beide
 * records kregen dus dezelfde Appointment ID. Alles wat daarop zoekt --
 * annuleren, verzetten, de herinnering -- vindt er twee en kan niet weten
 * welke bedoeld is.
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const leads = require('../api/leads.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const botst = leads.botsendeAfspraak;
const bron  = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');

/* Een Airtable-record zoals de route ze terugkrijgt. */
const rec = (start, duur, status) => ({
  fields: { 'Start Time': start, 'Duration': duur, 'Status': status || 'booked' },
});
const OM_2U = new Date('2026-09-19T14:00:00.000Z').getTime();

console.log('\n— de regel zelf —');
{
  ck('de helper wordt geexporteerd', typeof botst === 'function', typeof botst);

  ck('exact hetzelfde tijdstip botst',
     !!botst([rec('2026-09-19T14:00:00.000Z', 30)], OM_2U, 30), null);

  ck('een afspraak die er half overheen loopt botst',
     !!botst([rec('2026-09-19T14:15:00.000Z', 30)], OM_2U, 30), null);

  /* De vorige begint eerder maar duurt langer -- daarom kijkt de query een
     ruim venster terug en niet alleen vooruit. */
  ck('een langere afspraak die ervoor begint botst ook',
     !!botst([rec('2026-09-19T13:30:00.000Z', 60)], OM_2U, 30), null);

  /* De randen. Precies aansluitend mag: anders kan een makelaar geen twee
     afspraken achter elkaar zetten, en dat is de normale werkdag. */
  ck('precies aansluitend erna botst NIET',
     !botst([rec('2026-09-19T14:30:00.000Z', 30)], OM_2U, 30), null);
  ck('precies aansluitend ervoor botst NIET',
     !botst([rec('2026-09-19T13:30:00.000Z', 30)], OM_2U, 30), null);

  ck('een uur later botst niet',
     !botst([rec('2026-09-19T15:00:00.000Z', 30)], OM_2U, 30), null);
}

console.log('\n— de uitzonderingen —');
{
  /* Zonder deze regel kon een tijdstip nooit meer opnieuw gebruikt worden
     nadat er een keer iets was afgezegd. */
  ck('een geannuleerde afspraak houdt geen plek bezet',
     !botst([rec('2026-09-19T14:00:00.000Z', 30, 'cancelled')], OM_2U, 30), null);
  ck('en dat is hoofdletterongevoelig',
     !botst([rec('2026-09-19T14:00:00.000Z', 30, 'Cancelled')], OM_2U, 30), null);

  /* Een onleesbare tijd is geen BEWEZEN conflict. Daarop weigeren zou een
     agenda kunnen dichtzetten met één stuk rommel in de tabel. */
  ck('een record met een onleesbare tijd blokkeert niets',
     !botst([rec('geen datum', 30)], OM_2U, 30), null);
  ck('een leeg record blokkeert niets', !botst([{}, null], OM_2U, 30), null);
  ck('een lege lijst botst niet', !botst([], OM_2U, 30), null);
  ck('geen lijst botst niet', !botst(undefined, OM_2U, 30), null);

  /* Airtable laat Duration leeg als niemand hem invulde; de route rekent dan
     met 30, en deze regel moet dat ook doen. */
  ck('een lege duur telt als 30 minuten',
     !!botst([rec('2026-09-19T14:20:00.000Z', null)], OM_2U, 30), null);
}

console.log('\n— en hij wordt ook echt gebruikt, op de juiste plek —');
{
  const blok = (bron.match(/if \(body\.mode === 'appointment-create'\)[\s\S]*?const apptId =/) || [''])[0];
  ck('de route roept de helper aan vóór het aanmaken',
     /botsendeAfspraak\(/.test(blok),
     'de controle staat niet meer tussen de invoercontrole en het aanmaken');

  ck('en weigert met 409 en slot_conflict',
     /status\(409\)[\s\S]{0,220}slot_conflict/.test(blok), null);

  /* DIT is de regressie. De Google-controle staat achter `if (gToken)`; deze
     mag daar niet ook achter komen te staan, anders is het gat terug zodra
     de koppeling verloopt. */
  const naGToken = blok.slice(blok.indexOf('botsendeAfspraak('));
  const voorGToken = blok.slice(0, blok.indexOf('botsendeAfspraak('));
  const laatsteIf = voorGToken.lastIndexOf('if (gToken)');
  const sluit = voorGToken.lastIndexOf('} catch (e) {');
  ck('de eigen controle hangt NIET aan een Google-token',
     laatsteIf < sluit,
     'de dubbelcheck lijkt binnen het if (gToken)-blok te staan');

  /* Faalt Airtable, dan boeken we door -- een storing mag geen afspraak
     tegenhouden. Dat moet wel in de logs staan, niet stil. */
  ck('een mislukte controle wordt geluid, niet verzwegen',
     /dubbelcheck[\s\S]{0,120}console\.error|console\.error[\s\S]{0,120}dubbelcheck/.test(blok), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
