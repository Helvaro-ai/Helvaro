/*
 * De WhatsApp-boekingskant van tests/dubbelboeking.test.js.
 *
 * api/leads.js's dashboard-route ('appointment-create') kreeg een eigen,
 * Airtable-gebaseerde dubbelcheck nadat bleek dat de Google-agendacontrole
 * alleen draait `if (gToken)` -- zonder gekoppelde agenda (nieuwe klant, of
 * een verlopen koppeling; de OAuth staat op Testing en verloopt elke zeven
 * dagen) stond er helemaal niets tussen twee afspraken op hetzelfde moment.
 *
 * api/whatsapp.js's in-chat BOOK-blok had die tweede laag niet: het leunde
 * volledig op checkSlot() tegen Google. Dit bestand bewaakt dat de eigen
 * controle (api/_afspraken.js botsendeAfspraak/rondTijdstip) ook daar staat,
 * en niet verstopt achter `if (gToken)`.
 */
'use strict';

const fs        = require('fs');
const path      = require('path');
const _afspraken = require('../api/_afspraken.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

const bron = fs.readFileSync(path.join(__dirname, '..', 'api', 'whatsapp.js'), 'utf8');

console.log('\n— de gedeelde regel —');
{
  ck('_afspraken.botsendeAfspraak wordt geexporteerd',
     typeof _afspraken.botsendeAfspraak === 'function', typeof _afspraken.botsendeAfspraak);
  ck('_afspraken.rondTijdstip wordt geexporteerd',
     typeof _afspraken.rondTijdstip === 'function', typeof _afspraken.rondTijdstip);

  const rec = (start, duur, status) => ({ fields: { 'Start Time': start, 'Duration': duur, 'Status': status || 'booked' } });
  const OM_2U = new Date('2026-09-19T14:00:00.000Z').getTime();

  ck('exact hetzelfde tijdstip botst',
     !!_afspraken.botsendeAfspraak([rec('2026-09-19T14:00:00.000Z', 30)], OM_2U, 30), null);
  ck('precies aansluitend botst niet',
     !_afspraken.botsendeAfspraak([rec('2026-09-19T14:30:00.000Z', 30)], OM_2U, 30), null);
  ck('een geannuleerde afspraak houdt geen plek bezet',
     !_afspraken.botsendeAfspraak([rec('2026-09-19T14:00:00.000Z', 30, 'cancelled')], OM_2U, 30), null);
}

console.log('\n— en hij wordt ook echt gebruikt in het BOOK-blok —');
{
  const m = bron.match(/else if \(!bookingSent && appt\.start\) \{[\s\S]*?await createAppointment\(\{/);
  ck('het BOOK-blok is gevonden in api/whatsapp.js', !!m, 'de omliggende code is herschreven -- test bijwerken');
  const blok = m ? m[0] : '';

  ck('het blok roept _afspraken.rondTijdstip aan',
     /_afspraken\.rondTijdstip\(/.test(blok), null);
  ck('het blok roept _afspraken.botsendeAfspraak aan',
     /_afspraken\.botsendeAfspraak\(/.test(blok), null);

  /* DIT is de regressie die deze test moet vangen. De Google-controle staat
     achter `if (gToken)`; de eigen controle mag daar niet ook achter komen te
     staan, anders is het gat terug zodra de koppeling verloopt of ontbreekt. */
  const eigenIdx = blok.indexOf('_afspraken.rondTijdstip(');
  const voorEigen = blok.slice(0, eigenIdx);
  const laatsteIfGToken = voorEigen.lastIndexOf('if (gToken)');
  const laatsteSluitHaak = voorEigen.lastIndexOf('\n      }\n\n');
  ck('de eigen controle hangt NIET binnen het if (gToken)-blok',
     eigenIdx > -1 && (laatsteIfGToken === -1 || laatsteSluitHaak > laatsteIfGToken),
     'de dubbelcheck lijkt binnen if (gToken) te staan');

  ck('een mislukte controle wordt geluid, niet verzwegen',
     /dubbelcheck[\s\S]{0,160}console\.error|console\.error[\s\S]{0,160}dubbelcheck/.test(blok), null);

  ck('een botsing zet slotTaken, zodat de bestaande weigerroute (bericht + owner-melding) hergebruikt wordt',
     /if \(botst\) slotTaken = true;/.test(blok), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
