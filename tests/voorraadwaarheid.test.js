/*
 * api/_inventaris.js — voorraadwaarheid.
 *
 * Toestanden, vertrouwen, feed-parsing, de eindcontrole voor verzenden (de
 * verkocht-race en de prijswijziging), dubbele sync en een falende bron.
 * Airtable is een nep-fetch in het geheugen; er gaat niets over het net.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-token';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'appTEST';

const vehicles = require(BASE + 'api/_vehicles.js');
const inv = require(BASE + 'api/_inventaris.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};
const minGeleden = (m) => new Date(Date.now() - m * 60000).toISOString();

(async () => {
  console.log('\ntoestanden');
  const native = inv.saneerBron({});
  ck('nooit gecontroleerd = UNKNOWN', inv.bereken({}, native).status === 'UNKNOWN');
  ck('vers = HEALTHY', inv.bereken({ lastAttemptAt: minGeleden(2), lastSuccessAt: minGeleden(2), lastResult: 'ok' }, native).status === 'HEALTHY');
  ck('over de drempel = STALE', inv.bereken({ lastAttemptAt: minGeleden(30), lastSuccessAt: minGeleden(30), lastResult: 'ok' }, native).status === 'STALE');
  ck('gedeeltelijk = DEGRADED', inv.bereken({ lastAttemptAt: minGeleden(1), lastSuccessAt: minGeleden(1), lastResult: 'partial' }, native).status === 'DEGRADED');
  ck('mislukt met recente geslaagde = DEGRADED', inv.bereken({ lastAttemptAt: minGeleden(1), lastSuccessAt: minGeleden(60), lastResult: 'failed' }, native).status === 'DEGRADED');
  ck('mislukt zonder bruikbare geslaagde = FAILED', inv.bereken({ lastAttemptAt: minGeleden(1), lastResult: 'failed' }, native).status === 'FAILED');
  ck('levend slot = SYNCING', inv.bereken({ slot: { token: 'x', at: minGeleden(0.5) }, lastSuccessAt: minGeleden(90) }, native).status === 'SYNCING');
  ck('dood slot telt niet', inv.bereken({ slot: { token: 'x', at: minGeleden(10) }, lastAttemptAt: minGeleden(10), lastSuccessAt: minGeleden(10), lastResult: 'ok' }, native).status === 'HEALTHY');

  console.log('\nvertrouwen');
  const feed = inv.saneerBron({ type: 'feed', url: 'https://dms.example/feed.csv' });
  ck('native gezond = bevestigd', inv.vertrouwen({ lastAttemptAt: minGeleden(1), lastSuccessAt: minGeleden(1), lastResult: 'ok' }, native).niveau === 'bevestigd');
  ck('native nooit gecontroleerd = bevestigd (tabel wordt live gelezen)', inv.vertrouwen({}, native).niveau === 'bevestigd');
  ck('native FAILED = onzeker', inv.vertrouwen({ lastAttemptAt: minGeleden(1), lastResult: 'failed' }, native).niveau === 'onzeker');
  ck('feed nooit gesynct = onzeker', inv.vertrouwen({}, feed).niveau === 'onzeker');
  ck('feed ouder dan harde drempel = onzeker', inv.vertrouwen({ lastAttemptAt: minGeleden(13 * 60), lastSuccessAt: minGeleden(13 * 60), lastResult: 'ok' }, feed).reden === 'te_oud');
  ck('feed STALE maar binnen harde drempel = bevestigd', inv.vertrouwen({ lastAttemptAt: minGeleden(90), lastSuccessAt: minGeleden(90), lastResult: 'ok' }, feed).niveau === 'bevestigd');
  ck('promptNotitie alleen bij onzeker', inv.promptNotitie({ niveau: 'onzeker' }).includes('Bevestig NIET') && inv.promptNotitie({ niveau: 'bevestigd' }) === '');

  console.log('\nbron-instellingen');
  ck('http-feed geweigerd', inv.saneerBron({ type: 'feed', url: 'http://x.example/f' }).url === '');
  ck('onbekend type = native', inv.saneerBron({ type: 'ftp' }).type === 'native');
  const d = inv.saneerBron({ drempels: { versMin: 90, waarschuwMin: 10, hardMin: 2 } }).drempels;
  ck('drempels blijven oplopend', d.versMin <= d.waarschuwMin && d.waarschuwMin <= d.hardMin, d);
  const w = inv.weergave({}, inv.saneerBron({ type: 'feed', url: 'https://dms.example/feed.csv?token=GEHEIM&x=1' }));
  ck('feed-token niet naar het dashboard', !JSON.stringify(w).includes('GEHEIM'), w.feed);

  console.log('\nfeeds lezen');
  const T = inv._test;
  const csv = 'Stocknumber;Make;Model;Price;Mileage;Status\n"A1";BMW;"X5; xDrive";"24.950";45 000;sold\nA2;Audi;A4;19950;80000;\nA2;Audi;A4 dubbel;1;1;\n;Opel;Corsa;5000;1;\n';
  const pc = T.parseFeed(csv, 'auto', 'text/csv');
  ck('csv: puntkomma en aanhalingstekens', pc.voertuigen[0].model === 'X5; xDrive', pc.voertuigen[0]);
  ck('csv: prijs 24.950 = 24950', pc.voertuigen[0].prijs === 24950, pc.voertuigen[0].prijs);
  ck('csv: sold = verkocht', pc.voertuigen[0].status === 'verkocht');
  ck('csv: geen status = beschikbaar', pc.voertuigen[1].status === 'beschikbaar');
  ck('csv: dubbele id en regel zonder id vallen weg', pc.voertuigen.length === 2 && pc.ongeldig === 2, pc);
  const pj = T.parseFeed(JSON.stringify({ data: { x: 1 }, vehicles: [{ id: 7, brand: 'Kia', model: 'EV6', availability: 'op bestelling' }] }), 'auto', 'application/json');
  ck('json: geneste lijst gevonden', pj.voertuigen.length === 1 && pj.voertuigen[0].merk === 'Kia');
  ck('json: onbekende status = onbekend, nooit beschikbaar', pj.voertuigen[0].status === 'onbekend');
  const xml = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><feed><vehicle><id>9</id><make><![CDATA[Volvo & co]]></make><model>&e;</model></vehicle></feed>';
  const px = T.parseFeed(xml, 'auto', 'application/xml');
  ck('xml: CDATA gelezen', px.voertuigen[0] && px.voertuigen[0].merk === 'Volvo & co', px.voertuigen[0]);
  ck('xml: entiteiten worden niet uitgevouwen (geen XXE)', px.voertuigen[0] && px.voertuigen[0].model === '&e;', px.voertuigen[0]);
  ck('interne adressen herkend', ['10.0.0.1', '127.0.0.1', '169.254.169.254', '192.168.1.2', '172.20.0.1', '::1', 'fd00::1'].every(T.isInternIp) && !T.isInternIp('8.8.8.8'));

  console.log('\neindcontrole voor verzenden');
  const oud = { code: 'V12', status: 'beschikbaar', prijs: 24950, km: 45000, gearchiveerd: false };
  const antwoord = 'De V12 is nog beschikbaar, € 24.950 met 45.000 km. Zaterdag een proefrit?';
  ck('niets veranderd = versturen', inv.beoordeelVoorVerzenden(antwoord, [oud], { veranderd: [], onleesbaar: false }).actie === 'versturen');
  ck('verkocht tijdens de beurt = onbeschikbaar',
    inv.beoordeelVoorVerzenden(antwoord, [oud], { veranderd: [{ code: 'V12', oud, nu: Object.assign({}, oud, { status: 'verkocht' }) }] }).actie === 'onbeschikbaar');
  ck('verdwenen = onbeschikbaar', inv.beoordeelVoorVerzenden(antwoord, [oud], { veranderd: [{ code: 'V12', oud, nu: null }] }).actie === 'onbeschikbaar');
  ck('prijs gewijzigd en genoemd = nakijken',
    inv.beoordeelVoorVerzenden(antwoord, [oud], { veranderd: [{ code: 'V12', oud, nu: Object.assign({}, oud, { prijs: 23950 }) }] }).reden === 'prijs');
  ck('prijs gewijzigd maar niet genoemd = versturen',
    inv.beoordeelVoorVerzenden('Wanneer wil je langskomen?', [oud], { veranderd: [{ code: 'V12', oud, nu: Object.assign({}, oud, { prijs: 23950 }) }] }).actie === 'versturen');
  ck('km gewijzigd en genoemd = nakijken',
    inv.beoordeelVoorVerzenden(antwoord, [oud], { veranderd: [{ code: 'V12', oud, nu: Object.assign({}, oud, { km: 46000 }) }] }).reden === 'km');
  ck('controle onleesbaar + prijs in tekst = nakijken', inv.beoordeelVoorVerzenden(antwoord, [oud], { veranderd: [], onleesbaar: true }).actie === 'nakijken');
  ck('controle onleesbaar zonder feiten = versturen', inv.beoordeelVoorVerzenden('Top, tot zaterdag!', [oud], { veranderd: [], onleesbaar: true }).actie === 'versturen');

  /* hercontroleer met een nagebootste verse lezing. */
  const echtLeesVers = vehicles.leesVers;
  vehicles.leesVers = async () => ({ gelezen: true, voertuig: Object.assign({}, oud, { status: 'Verkocht' }) });
  let h = await inv.hercontroleer('P1', [oud]);
  ck('race: verse lezing ziet verkocht', !h.ok && h.veranderd[0].wat === 'status' && h.veranderd[0].nu.status === 'verkocht', h);
  vehicles.leesVers = async () => ({ gelezen: false, voertuig: null });
  h = await inv.hercontroleer('P1', [oud]);
  ck('Airtable-hapering = onleesbaar, niet "verdwenen"', h.onleesbaar === true && h.veranderd.length === 0, h);
  vehicles.leesVers = echtLeesVers;

  console.log('\nsync: dubbel, native, falende bron');
  /* Nep-Airtable: één Client Config-record, PATCH schrijft terug. */
  let record = { id: 'recC1', fields: {} };
  let patches = 0;
  const echtFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('tblPidTrwGRzRt4LZ/recC1') && opts.method === 'PATCH') {
      patches++;
      Object.assign(record.fields, JSON.parse(opts.body).fields);
      return json(record);
    }
    if (u.includes('tblPidTrwGRzRt4LZ/recC1')) return json(record);
    if (u.includes('tblPidTrwGRzRt4LZ')) return json({ records: [record] });
    return json({ records: [] }); // activiteitenlog e.d.
  };
  const echt = { available: vehicles.available, listMetStatus: vehicles.listMetStatus, onbeschikbaarReden: vehicles.onbeschikbaarReden };
  vehicles.available = async () => true;
  vehicles.listMetStatus = async () => ({ vehicles: [oud, { code: 'V13', status: 'gereserveerd', prijs: 1, km: 1 }], afgekapt: false });

  let r = await inv.sync('P1', { door: 'test' });
  ck('native sync slaagt en telt', r.ok && r.status === 'HEALTHY' && r.count === 2, r);
  ck('slot is na afloop vrij', JSON.parse(record.fields['Inventory State']).slot === null);
  const versie1 = r.version;

  /* Dubbele sync: er loopt er al een (vers slot van een andere instantie). */
  const s = JSON.parse(record.fields['Inventory State']);
  s.slot = { token: 'ander', at: new Date().toISOString(), door: 'andere-instantie' };
  record.fields['Inventory State'] = JSON.stringify(s);
  const voor = patches;
  r = await inv.sync('P1', { door: 'test' });
  ck('tweede sync hergebruikt de lopende, schrijft niets', r.hergebruikt === true && r.status === 'SYNCING' && patches === voor, { r, patches, voor });
  s.slot = null; record.fields['Inventory State'] = JSON.stringify(s);

  /* Versie verandert alleen als de inhoud verandert. */
  r = await inv.sync('P1', {});
  ck('zelfde voorraad = zelfde versie', r.version === versie1);
  vehicles.listMetStatus = async () => ({ vehicles: [Object.assign({}, oud, { prijs: 23950 })], afgekapt: false });
  r = await inv.sync('P1', {});
  ck('prijswijziging = nieuwe versie + changed', r.version !== versie1 && r.changed === 1 && r.removed === 1, r);

  /* Falende bron. */
  vehicles.available = async () => false;
  vehicles.onbeschikbaarReden = () => 'onbereikbaar';
  r = await inv.sync('P1', {});
  ck('bron onbereikbaar = geen ok, DEGRADED (recente geslaagde bestaat)', r.ok === false && r.status === 'DEGRADED' && r.lastErrorCode === 'onbereikbaar', r);
  ck('laatste geslaagde blijft bewaard', Boolean(r.lastSuccessAt));
  ck('run-geschiedenis bijgehouden', Array.isArray(r.runs) && r.runs[0].ok === false && r.runs.length >= 4, r.runs && r.runs.length);

  /* controleer(): gezond = geen sync. */
  vehicles.available = async () => true;
  vehicles.listMetStatus = async () => ({ vehicles: [oud], afgekapt: false });
  await inv.sync('P1', {});
  const p0 = patches;
  r = await inv.controleer('P1', {});
  ck('controleer bij gezonde voorraad synchroniseert niet', r.gesynct === false && patches === p0, { r, patches, p0 });

  Object.assign(vehicles, echt);
  global.fetch = echtFetch;

  console.log('\nbedrading (bron)');
  const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
  const iGuard = wa.indexOf('_inventaris.beoordeelVoorVerzenden(replyText');
  const iSend = wa.indexOf('const sendOk = await sendWA(phone, replyText');
  ck('whatsapp: eindcontrole staat VOOR het versturen', iGuard > 0 && iSend > iGuard);
  ck('whatsapp: onzekere voorraad blokkeert boeken', /voorraadVertrouwen\.niveau === 'onzeker'/.test(wa));
  const db = fs.readFileSync(BASE + 'api/_dealer-boeking.js', 'utf8');
  ck('boekingspoort leest het voertuig vers', db.includes('_vehicles.leesVers(code, voertuig.code)'));
  const cron = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
  const iCheck = cron.indexOf("_veh.leesVers(projectCode, vehicleCodeV)");
  const iStuur = cron.indexOf('const remOk = await sendWATemplate(');
  ck('herinnering: voertuig vers gelezen VOOR het versturen', iCheck > 0 && iStuur > iCheck);
  ck('herinnering: verkocht/uit aanbod/verdwenen = niet sturen', /stV === 'verkocht' \|\| stV === 'uit aanbod'/.test(cron) && /herinnering_tegengehouden/.test(cron));

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
