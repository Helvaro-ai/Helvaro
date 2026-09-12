/*
 * api/_voertuigslot.js -- afspraakbescherming per voertuig: schrijf eerst,
 * verifieer daarna. Praat met een NAGEMAAKTE Airtable: fetch wordt vervangen,
 * net als in tests/wa-send-deur.test.js.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-nooit-echt';
process.env.BASE_AIRTABLE = 'apptest00000000';
const slot = require('../api/_voertuigslot.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

const echteFetch = global.fetch;
const herstel = () => { global.fetch = echteFetch; };

console.log('\n— idempotentieSleutel —');
{
  const basis = { projectCode: 'tenantA', startISO: '2026-09-19T14:00:00.000Z', leadId: 'lead1', voertuigCode: 'V1' };
  const k1 = slot.idempotentieSleutel(basis);
  const k2 = slot.idempotentieSleutel({ ...basis });
  ck('zelfde invoer geeft zelfde sleutel', k1 !== '' && k1 === k2, JSON.stringify({ k1, k2 }));

  const kAnderLead = slot.idempotentieSleutel({ ...basis, leadId: 'lead2' });
  ck('een ander lead, zelfde tijdstip en voertuig -> andere sleutel', kAnderLead !== k1, JSON.stringify({ k1, kAnderLead }));

  const kAnderVoertuig = slot.idempotentieSleutel({ ...basis, voertuigCode: 'V2' });
  ck('een ander voertuig, zelfde tijdstip en lead -> ook een andere sleutel', kAnderVoertuig !== k1, JSON.stringify({ k1, kAnderVoertuig }));

  const kZonder = slot.idempotentieSleutel({ projectCode: 'tenantA', startISO: '2026-09-19T14:00:00.000Z' });
  ck('zonder lead/voertuig is de sleutel enkel PROJECT-YYMMDDHHMM',
     kZonder === 'tenantA-2609191400', kZonder);

  ck('een ongeldige datum geeft een lege sleutel',
     slot.idempotentieSleutel({ projectCode: 'tenantA', startISO: 'niet-een-datum' }) === '', null);
  ck('geen projectCode geeft ook een lege sleutel',
     slot.idempotentieSleutel({ startISO: '2026-09-19T14:00:00.000Z' }) === '', null);
  ck('helemaal niets meegeven gooit niet en geeft een lege sleutel',
     slot.idempotentieSleutel() === '', null);
}

(async () => {
  console.log('\n— actieveAfspraken: de query en de dubbele tenant-check —');
  {
    let laatsteUrl = '';
    global.fetch = async (url) => {
      laatsteUrl = String(url);
      return {
        ok: true, status: 200,
        json: async () => ({
          records: [
            { id: 'a1', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
            /* Hoort niet bij tenantA -- ook al zou de Airtable-formule dit al
               filteren, de JS-kant moet het zelf ook vangen. */
            { id: 'a2', fields: { 'Project Code': 'tenantB', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T09:00:00.000Z' } },
          ],
        }),
      };
    };

    const afspraken = await slot.actieveAfspraken('tenantA', 'V1');
    ck('de opgevraagde URL bevat de project code', laatsteUrl.includes('tenantA'), laatsteUrl);
    ck('de opgevraagde URL bevat de voertuigcode', laatsteUrl.includes('V1'), laatsteUrl);
    ck('de opgevraagde URL filtert op status "booked"', laatsteUrl.includes('booked'), laatsteUrl);
    ck('een record van een andere Project Code wordt gedropt, ook al kwam het terug van de API',
       afspraken.length === 1 && afspraken[0].id === 'a1', JSON.stringify(afspraken));
  }

  console.log('\n— bevestigClaim(a): een andere afspraak is er eerder bij -> eigen record verliest —');
  {
    let patchCalled = false, patchBody = null;
    global.fetch = async (url, opts) => {
      if (opts && opts.method === 'PATCH') {
        patchCalled = true; patchBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return {
        ok: true, status: 200,
        json: async () => ({
          records: [
            { id: 'own1', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
            { id: 'other1', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T09:00:00.000Z' } },
          ],
        }),
      };
    };
    const rA = await slot.bevestigClaim('tenantA', 'V1', 'own1');
    ck('eigen record verliest: ok=false, reden=voertuig_bezet, winnaar=other1',
       rA.ok === false && rA.reden === 'voertuig_bezet' && rA.winnaar === 'other1', JSON.stringify(rA));
    ck('het eigen record wordt gePATCHt naar cancelled', patchCalled === true && patchBody.fields['Status'] === 'cancelled', JSON.stringify(patchBody));
  }

  console.log('\n— bevestigClaim(b): eigen record is het vroegste -> gewoon ok, geen PATCH —');
  {
    let patchCalled = false;
    global.fetch = async (url, opts) => {
      if (opts && opts.method === 'PATCH') { patchCalled = true; return { ok: true, status: 200, json: async () => ({}) }; }
      return {
        ok: true, status: 200,
        json: async () => ({
          records: [
            { id: 'own2', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T08:00:00.000Z' } },
            { id: 'other2', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T09:00:00.000Z' } },
          ],
        }),
      };
    };
    const rB = await slot.bevestigClaim('tenantA', 'V1', 'own2');
    ck('eigen record wint: ok=true, geen reden', rB.ok === true && !rB.reden, JSON.stringify(rB));
    ck('geen PATCH als het eigen record wint', patchCalled === false, patchCalled);
  }

  console.log('\n— bevestigClaim(c): gelijke Created At -> kleinste record-id wint —');
  {
    let patchCalled = false, patchBody = null;
    global.fetch = async (url, opts) => {
      if (opts && opts.method === 'PATCH') { patchCalled = true; patchBody = JSON.parse(opts.body); return { ok: true, status: 200, json: async () => ({}) }; }
      return {
        ok: true, status: 200,
        json: async () => ({
          records: [
            { id: 'zzz', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
            { id: 'aaa', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
          ],
        }),
      };
    };
    const rC = await slot.bevestigClaim('tenantA', 'V1', 'zzz');
    ck('eigen "zzz" verliest van "aaa" bij een gelijke Created At (kleinste id wint)',
       rC.ok === false && rC.winnaar === 'aaa', JSON.stringify(rC));
    ck('...en wordt dus wel degelijk geannuleerd', patchCalled === true && patchBody.fields['Status'] === 'cancelled', null);

    /* Omgekeerd: eigen record heeft nu de kleinste id -> eigen wint. */
    patchCalled = false;
    global.fetch = async (url, opts) => {
      if (opts && opts.method === 'PATCH') { patchCalled = true; return { ok: true, status: 200, json: async () => ({}) }; }
      return {
        ok: true, status: 200,
        json: async () => ({
          records: [
            { id: 'aaa', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
            { id: 'zzz', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
          ],
        }),
      };
    };
    const rC2 = await slot.bevestigClaim('tenantA', 'V1', 'aaa');
    ck('eigen "aaa" (kleinste id) wint bij dezelfde gelijke Created At', rC2.ok === true, JSON.stringify(rC2));
    ck('...en wordt niet gePATCHt', patchCalled === false, patchCalled);
  }

  console.log('\n— bevestigClaim(d): een leesfout (HTTP 500) is fail-open, niet fail-hard —');
  {
    global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const rD = await slot.bevestigClaim('tenantA', 'V1', 'own3');
    ck('HTTP 500 bij het verifiëren -> {ok:true, geverifieerd:false}, de boeking blijft staan',
       rD.ok === true && rD.geverifieerd === false, JSON.stringify(rD));

    global.fetch = async () => { throw new Error('netwerk weg'); };
    const rD2 = await slot.bevestigClaim('tenantA', 'V1', 'own3b');
    ck('een netwerkfout (exception) is ook fail-open',
       rD2.ok === true && rD2.geverifieerd === false, JSON.stringify(rD2));
  }

  console.log('\n— bevestigClaim(e): een andere afspraak zonder Created At telt niet als "eerder" —');
  {
    let patchCalled = false;
    global.fetch = async (url, opts) => {
      if (opts && opts.method === 'PATCH') { patchCalled = true; return { ok: true, status: 200, json: async () => ({}) }; }
      return {
        ok: true, status: 200,
        json: async () => ({
          records: [
            { id: 'own4', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked', 'Created At': '2026-09-10T10:00:00.000Z' } },
            { id: 'other4', fields: { 'Project Code': 'tenantA', 'Vehicle Code': 'V1', 'Status': 'booked' } },   // geen Created At
          ],
        }),
      };
    };
    const rE = await slot.bevestigClaim('tenantA', 'V1', 'own4');
    ck('een concurrent zonder bewezen tijdstip kan het eigen record niet laten verliezen',
       rE.ok === true, JSON.stringify(rE));
    ck('...dus ook geen PATCH', patchCalled === false, patchCalled);
  }

  herstel();

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
