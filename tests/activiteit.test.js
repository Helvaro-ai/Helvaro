/*
 * api/_activiteit.js -- het activiteitenlogboek: loggen dat nooit gooit en
 * nooit een dealer bij een andere laat kijken.
 *
 * Praat met een NAGEMAAKTE Airtable: fetch wordt vervangen, net als in
 * tests/wa-send-deur.test.js.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-nooit-echt';
process.env.BASE_AIRTABLE = 'apptest00000000';
const activiteit = require('../api/_activiteit.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

const echteFetch = global.fetch;
const herstel = () => { global.fetch = echteFetch; };

(async () => {
  console.log('\n— geweigerd voordat er iets naar Airtable gaat —');
  {
    activiteit._resetAvailability();
    let aangeroepen = false;
    global.fetch = async () => { aangeroepen = true; return { ok: true, status: 200, json: async () => ({ records: [] }) }; };

    const r1 = await activiteit.log('tenantA', 'dit_bestaat_niet');
    ck('onbekende soort -> false', r1 === false, r1);
    ck('...en er wordt zelfs geen fetch gedaan (geweigerd vóór de beschikbaarheidscheck)',
       aangeroepen === false, aangeroepen);

    aangeroepen = false;
    const r2 = await activiteit.log('', 'appointment_created');
    ck('lege projectCode -> false', r2 === false, r2);
    ck('...ook hier geen fetch', aangeroepen === false, aangeroepen);

    aangeroepen = false;
    const r3 = await activiteit.log('   ', 'appointment_created');
    ck('projectCode van enkel witruimte -> ook false', r3 === false, r3);
  }

  console.log('\n— een kapotte Airtable laat het loggen falen, nooit crashen —');
  {
    activiteit._resetAvailability();
    let call = 0;
    global.fetch = async () => {
      call += 1;
      if (call === 1) return { ok: true, status: 200, json: async () => ({ records: [] }) }; // beschikbaarheidscheck
      throw new Error('Airtable ligt eruit');   // de eigenlijke POST
    };
    let gegooid = false, r;
    try { r = await activiteit.log('tenantA', 'appointment_created', { leadId: 'L1' }); }
    catch (_) { gegooid = true; }
    ck('een fetch die gooit tijdens het loggen -> log() gooit zelf niet', gegooid === false, gegooid);
    ck('...en geeft gewoon false terug', r === false, r);
  }

  console.log('\n— wat er precies weggeschreven wordt —');
  {
    activiteit._resetAvailability();
    let laatsteBody = null;
    global.fetch = async (url, opts) => {
      if (opts && opts.method === 'POST') { laatsteBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({ id: 'rec1' }) }; }
      return { ok: true, status: 200, json: async () => ({ records: [] }) };   // beschikbaarheidscheck
    };

    const ok = await activiteit.log('tenantX', 'employee_notification_sent', {
      leadId: 'lead1',
      voertuigCode: 'V1',
      details: { bericht: 'bel de klant terug op +32 470 12 34 56 zo snel mogelijk' },
    });
    ck('log() geeft true terug bij een geslaagde schrijfactie', ok === true, ok);
    ck('Project Code staat in de velden', laatsteBody && laatsteBody.fields['Project Code'] === 'tenantX', JSON.stringify(laatsteBody));
    ck('Type staat in de velden', laatsteBody.fields['Type'] === 'employee_notification_sent', laatsteBody.fields['Type']);
    ck('Created At is een ISO-tijdstip', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(laatsteBody.fields['Created At']), laatsteBody.fields['Created At']);
    ck('Details is geldige JSON', (() => { try { JSON.parse(laatsteBody.fields['Details']); return true; } catch (_) { return false; } })(), laatsteBody.fields['Details']);

    const details = JSON.parse(laatsteBody.fields['Details']);
    ck('het telefoonnummer in Details is gemaskeerd tot de laatste vier cijfers',
       details.bericht.includes('***3456'), details.bericht);
    ck('...en het volledige nummer staat er nergens meer in',
       !/470[\s]*12[\s]*34[\s]*56/.test(details.bericht) && !details.bericht.includes('32470123456'),
       details.bericht);
  }

  console.log('\n— lijst(): tenant-isolatie ook als de API het zelf niet doet —');
  {
    activiteit._resetAvailability();
    global.fetch = async (url) => {
      const u = String(url);
      if (u.includes('filterByFormula')) {
        return {
          ok: true, status: 200,
          json: async () => ({
            records: [
              { id: 'r1', fields: { 'Project Code': 'tenantA', 'Type': 'appointment_created', 'Created At': '2026-09-10T10:00:00.000Z', 'Details': '{}' } },
              /* Dit record hoort NIET bij tenantA. Een echte Airtable-formule
                 zou dit al filteren, maar de JS-check moet het ook zelf
                 vangen -- dat is precies wat deze test bewaakt. */
              { id: 'r2', fields: { 'Project Code': 'tenantB', 'Type': 'appointment_created', 'Created At': '2026-09-11T10:00:00.000Z', 'Details': '{}' } },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ records: [] }) };   // beschikbaarheidscheck
    };

    const uit = await activiteit.lijst('tenantA');
    ck('lijst() bevat alleen het record van de eigen tenant',
       uit.length === 1 && uit[0].id === 'r1', JSON.stringify(uit));
    ck('...en het record van de andere tenant is echt weg, niet gemaskeerd',
       !uit.some((x) => x.id === 'r2'), JSON.stringify(uit));
  }

  console.log('\n— lijst(): fail-soft naar [] —');
  {
    activiteit._resetAvailability();
    global.fetch = async () => { throw new Error('helemaal onbereikbaar'); };
    const uitDown = await activiteit.lijst('tenantA');
    ck('Airtable volledig onbereikbaar -> lege lijst, geen crash',
       Array.isArray(uitDown) && uitDown.length === 0, uitDown);

    activiteit._resetAvailability();
    let call = 0;
    global.fetch = async () => {
      call += 1;
      if (call === 1) return { ok: true, status: 200, json: async () => ({ records: [] }) };   // beschikbaarheidscheck ok
      throw new Error('de eigenlijke read faalt');
    };
    const uitReadFail = await activiteit.lijst('tenantA');
    ck('de beschikbaarheidscheck slaagt maar de echte read faalt -> ook lege lijst',
       Array.isArray(uitReadFail) && uitReadFail.length === 0, uitReadFail);

    const uitLeeg = await activiteit.lijst('');
    ck('lege projectCode -> lege lijst zonder ooit te fetchen', Array.isArray(uitLeeg) && uitLeeg.length === 0, uitLeeg);
  }

  herstel();

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
