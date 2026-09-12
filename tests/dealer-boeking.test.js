/*
 * api/_dealer-boeking.js -- DE boekingspoort voor de dealership-vertical.
 *
 * ── Wat hier bewezen wordt ────────────────────────────────────────────────────
 * Dit bestand is zuivere orkestratie: het roept de fundamentmodules
 * (_voertuigslot, _vehicles, _wens, _koop, _leadscore, _activiteit) aan in een
 * vaste volgorde. In plaats van hun eigen gedrag opnieuw te bewijzen (dat doen
 * tests/voertuigslot.test.js, tests/voertuig-boekbaar.test.js,
 * tests/leadscore.test.js, tests/koop.test.js al), monkeypatcht dit bestand ze
 * en controleert of controleer()/naAanmaak()/scoreNaBoeking() ze in de juiste
 * volgorde aanroepen en de juiste uitkomst teruggeven -- inclusief de
 * activiteitenlog die elke blokkade zelf moet achterlaten.
 *
 * Monkeypatchen kan hier omdat _dealer-boeking.js de fundamentmodules altijd
 * via hun NAAMRUIMTE aanroept (`_voertuigslot.actieveAfspraken(...)`, niet een
 * losgetrokken destructuring) -- exact dezelfde stijl als tests/dealership.test.js
 * al gebruikt voor api/_vehicles.js en api/_properties.js.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-nooit-echt';
process.env.BASE_AIRTABLE = 'apptest00000000';

const _voertuigslot = require('../api/_voertuigslot');
const _activiteit    = require('../api/_activiteit');
const dealerBoeking  = require('../api/_dealer-boeking');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

/* ── Originelen bewaren, zodat elke test met een schone lei begint ──────────── */
const orig = {
  actieveVoorLead:    _voertuigslot.actieveVoorLead,
  actieveAfspraken:   _voertuigslot.actieveAfspraken,
  idempotentieSleutel:_voertuigslot.idempotentieSleutel,
  zoekOpSleutel:      _voertuigslot.zoekOpSleutel,
  bevestigClaim:      _voertuigslot.bevestigClaim,
  log:                _activiteit.log,
};

let logCalls = [];
function resetMocks() {
  logCalls = [];
  _voertuigslot.actieveVoorLead     = async () => null;
  _voertuigslot.actieveAfspraken    = async () => [];
  _voertuigslot.idempotentieSleutel = () => 'ZZ-2609191400-abcd';
  _voertuigslot.zoekOpSleutel       = async () => null;
  _voertuigslot.bevestigClaim       = async () => ({ ok: true });
  _activiteit.log = async (projectCode, soort, opts) => {
    logCalls.push({ projectCode, soort, opts });
    return true;
  };
}
function herstelAlles() {
  _voertuigslot.actieveVoorLead     = orig.actieveVoorLead;
  _voertuigslot.actieveAfspraken    = orig.actieveAfspraken;
  _voertuigslot.idempotentieSleutel = orig.idempotentieSleutel;
  _voertuigslot.zoekOpSleutel       = orig.zoekOpSleutel;
  _voertuigslot.bevestigClaim       = orig.bevestigClaim;
  _activiteit.log = orig.log;
}

const VOERTUIG = { code: 'V1', merk: 'BMW', model: 'M4', prijs: 74999, status: 'beschikbaar' };

(async () => {
  console.log('\n— standaardType —');
  {
    ck('dealership -> proefrit', dealerBoeking.standaardType('dealership') === 'proefrit');
    ck('vastgoed -> bezichtiging', dealerBoeking.standaardType('vastgoed') === 'bezichtiging');
    ck('iets anders -> gesprek', dealerBoeking.standaardType('bouw') === 'gesprek');
  }

  console.log('\n— controleer: blokkeert op een lead die al een afspraak heeft —');
  {
    resetMocks();
    const bestaand = { id: 'apptExisting', fields: { 'Appointment ID': 'ZZ-OUD' } };
    _voertuigslot.actieveVoorLead = async () => bestaand;
    const r = await dealerBoeking.controleer({
      projectCode: 'ZZ', leadId: 'lead1', telefoon: '32470000000', startISO: '2026-09-19T14:00:00.000Z',
    });
    ck('ok:false, reden lead_heeft_afspraak', r.ok === false && r.reden === 'lead_heeft_afspraak', JSON.stringify(r));
    ck('bestaand komt mee', r.bestaand === bestaand, JSON.stringify(r.bestaand));
    ck('soort duplicate_lead_blocked', r.soort === 'duplicate_lead_blocked', r.soort);
    ck('het blok logt zichzelf als duplicate_lead_blocked',
      logCalls.some((c) => c.soort === 'duplicate_lead_blocked'), JSON.stringify(logCalls));
    /* Dit blok wint van het voertuigblok: er wordt niet eens naar het voertuig
       gekeken zolang de lead al iets lopen heeft. */
    ck('een voertuigcheck komt er dan niet eens aan te pas (geen enkele voertuig-soort gelogd)',
      !logCalls.some((c) => /vehicle_/.test(c.soort)), JSON.stringify(logCalls));
  }

  console.log('\n— controleer: afspraakAfgezegd=true slaat de duplicate-lead-check over —');
  {
    resetMocks();
    _voertuigslot.actieveVoorLead = async () => ({ id: 'zouBlokkeren' });
    const r = await dealerBoeking.controleer({
      projectCode: 'ZZ', leadId: 'lead1', telefoon: '32470000000',
      startISO: '2026-09-19T14:00:00.000Z', afspraakAfgezegd: true,
    });
    ck('geen lead_heeft_afspraak meer, want de lead zegde net af', r.reden !== 'lead_heeft_afspraak', JSON.stringify(r));
    ck('en het loopt gewoon door naar ok:true', r.ok === true, JSON.stringify(r));
  }

  console.log('\n— controleer: verkocht/uit aanbod/gereserveerd/afspraak_bestaat -> geblokkeerd + juiste soort —');
  {
    const gevallen = [
      { status: 'verkocht',     reden: 'verkocht',         soort: 'vehicle_sold_blocked' },
      { status: 'uit aanbod',   reden: 'uit_aanbod',       soort: 'vehicle_unavailable_blocked' },
      { status: 'gereserveerd', reden: 'gereserveerd',     soort: 'vehicle_reserved_blocked' },
    ];
    for (const g of gevallen) {
      resetMocks();
      const r = await dealerBoeking.controleer({
        projectCode: 'ZZ', voertuig: Object.assign({}, VOERTUIG, { status: g.status }),
        leadId: 'lead1', telefoon: '32470000000', startISO: '2026-09-19T14:00:00.000Z',
      });
      ck(`${g.status}: ok:false reden=${g.reden}`, r.ok === false && r.reden === g.reden, JSON.stringify(r));
      ck(`${g.status}: soort=${g.soort}`, r.soort === g.soort, r.soort);
      ck(`${g.status}: gelogd als ${g.soort}`, logCalls.some((c) => c.soort === g.soort), JSON.stringify(logCalls));
      ck(`${g.status}: EN appointment_protection_triggered gelogd`,
        logCalls.some((c) => c.soort === 'appointment_protection_triggered'), JSON.stringify(logCalls));
    }

    console.log('\n— controleer: een bestaande actieve afspraak op het voertuig zelf (afspraak_bestaat) —');
    resetMocks();
    _voertuigslot.actieveAfspraken = async () => [{ id: 'anderelead-afspraak' }];
    const rBestaat = await dealerBoeking.controleer({
      projectCode: 'ZZ', voertuig: VOERTUIG, leadId: 'lead1', telefoon: '32470000000',
      startISO: '2026-09-19T14:00:00.000Z',
    });
    ck('ok:false reden=afspraak_bestaat', rBestaat.ok === false && rBestaat.reden === 'afspraak_bestaat', JSON.stringify(rBestaat));
    ck('soort=duplicate_vehicle_blocked', rBestaat.soort === 'duplicate_vehicle_blocked', rBestaat.soort);
    ck('gelogd als duplicate_vehicle_blocked', logCalls.some((c) => c.soort === 'duplicate_vehicle_blocked'), JSON.stringify(logCalls));
  }

  console.log('\n— controleer: idempotentie -- al_geboekt als de sleutel al bestaat —');
  {
    resetMocks();
    const bestaandeAfspraak = { id: 'apptAlBestaand', fields: { 'Appointment ID': 'ZZ-2609191400-abcd' } };
    _voertuigslot.zoekOpSleutel = async (code, apptId) => (apptId === 'ZZ-2609191400-abcd' ? bestaandeAfspraak : null);
    const r = await dealerBoeking.controleer({
      projectCode: 'ZZ', voertuig: VOERTUIG, leadId: 'lead1', telefoon: '32470000000',
      startISO: '2026-09-19T14:00:00.000Z',
    });
    ck('ok:false reden=al_geboekt', r.ok === false && r.reden === 'al_geboekt', JSON.stringify(r));
    ck('bestaand komt mee', r.bestaand === bestaandeAfspraak, JSON.stringify(r.bestaand));
    ck('al_geboekt heeft geen soort (het is geen blokkade om te loggen)', r.soort === undefined, r.soort);
  }

  console.log('\n— controleer: alles vrij -> ok:true met een deterministische apptId —');
  {
    resetMocks();
    _voertuigslot.idempotentieSleutel = (o) => `${o.projectCode}-vaste-sleutel`;
    const r = await dealerBoeking.controleer({
      projectCode: 'ZZ', voertuig: VOERTUIG, leadId: 'lead1', telefoon: '32470000000',
      startISO: '2026-09-19T14:00:00.000Z',
    });
    ck('ok:true', r.ok === true, JSON.stringify(r));
    ck('apptId komt exact van idempotentieSleutel', r.apptId === 'ZZ-vaste-sleutel', r.apptId);
    ck('actieveOpVoertuig komt mee (leeg in dit geval)', Array.isArray(r.actieveOpVoertuig) && r.actieveOpVoertuig.length === 0, JSON.stringify(r.actieveOpVoertuig));
  }

  console.log('\n— controleer: geen projectCode -> fail-soft naar onbekend, nooit gooien —');
  {
    resetMocks();
    const r = await dealerBoeking.controleer({});
    ck('ok:false reden=onbekend', r.ok === false && r.reden === 'onbekend', JSON.stringify(r));
  }

  console.log('\n— naAanmaak: verliest de race -> duplicate_vehicle_blocked + appointment_creation_failed —');
  {
    resetMocks();
    _voertuigslot.bevestigClaim = async () => ({ ok: false, reden: 'voertuig_bezet', winnaar: 'ander-record' });
    const r = await dealerBoeking.naAanmaak({
      projectCode: 'ZZ', voertuig: VOERTUIG, recordId: 'eigenRecord', apptId: 'ZZ-appt', leadId: 'lead1',
    });
    ck('ok:false reden=voertuig_bezet', r.ok === false && r.reden === 'voertuig_bezet', JSON.stringify(r));
    ck('duplicate_vehicle_blocked gelogd', logCalls.some((c) => c.soort === 'duplicate_vehicle_blocked'), JSON.stringify(logCalls));
    ck('appointment_creation_failed gelogd', logCalls.some((c) => c.soort === 'appointment_creation_failed'), JSON.stringify(logCalls));
    ck('geen appointment_created gelogd bij verlies', !logCalls.some((c) => c.soort === 'appointment_created'), JSON.stringify(logCalls));
  }

  console.log('\n— naAanmaak: wint -> appointment_created, geverifieerd true —');
  {
    resetMocks();
    _voertuigslot.bevestigClaim = async () => ({ ok: true });
    const r = await dealerBoeking.naAanmaak({
      projectCode: 'ZZ', voertuig: VOERTUIG, recordId: 'eigenRecord', apptId: 'ZZ-appt', leadId: 'lead1',
    });
    ck('ok:true geverifieerd:true', r.ok === true && r.geverifieerd === true, JSON.stringify(r));
    ck('appointment_created gelogd', logCalls.some((c) => c.soort === 'appointment_created'), JSON.stringify(logCalls));
  }

  console.log('\n— naAanmaak: fail-open bij een leesfout (geverifieerd expliciet false) blijft ok:true —');
  {
    resetMocks();
    _voertuigslot.bevestigClaim = async () => ({ ok: true, geverifieerd: false });
    const r = await dealerBoeking.naAanmaak({
      projectCode: 'ZZ', voertuig: VOERTUIG, recordId: 'eigenRecord', apptId: 'ZZ-appt', leadId: 'lead1',
    });
    ck('ok:true maar geverifieerd:false wordt doorgegeven', r.ok === true && r.geverifieerd === false, JSON.stringify(r));
  }

  console.log('\n— naAanmaak: zonder voertuig (geen catalogus) -> altijd ok, niets te verifiëren —');
  {
    resetMocks();
    let bevestigClaimAangeroepen = false;
    _voertuigslot.bevestigClaim = async () => { bevestigClaimAangeroepen = true; return { ok: true }; };
    const r = await dealerBoeking.naAanmaak({ projectCode: 'ZZ', recordId: 'eigenRecord', apptId: 'ZZ-appt', leadId: 'lead1' });
    ck('ok:true geverifieerd:false', r.ok === true && r.geverifieerd === false, JSON.stringify(r));
    ck('bevestigClaim wordt niet eens aangeroepen zonder voertuig', bevestigClaimAangeroepen === false);
    ck('appointment_created wordt toch gelogd', logCalls.some((c) => c.soort === 'appointment_created'), JSON.stringify(logCalls));
  }

  console.log('\n— scoreNaBoeking: geboekt + type geven punten, en een tweede identieke call levert niets nieuws —');
  {
    const eerste = dealerBoeking.scoreNaBoeking({ notitiesRaw: '', voertuigCode: 'V1', type: 'proefrit' });
    ck('score > 0 (voertuig + proefrit)', eerste.uitkomst.score > 0, eerste.uitkomst.score);
    ck('temperatuur is gezet', !!eerste.uitkomst.temperatuur, eerste.uitkomst.temperatuur);
    ck('er komt een nieuwe Notities-blob uit', typeof eerste.nieuweNotities === 'string' && eerste.nieuweNotities.startsWith('{'), eerste.nieuweNotities);

    const tweede = dealerBoeking.scoreNaBoeking({ notitiesRaw: eerste.nieuweNotities, voertuigCode: 'V1', type: 'proefrit' });
    ck('exact dezelfde signalen -> geen nieuwe blob (null)', tweede.nieuweNotities === null, tweede.nieuweNotities);
    ck('de score zelf blijft wel consistent', tweede.uitkomst.score === eerste.uitkomst.score, JSON.stringify(tweede.uitkomst));
  }

  herstelAlles();

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
