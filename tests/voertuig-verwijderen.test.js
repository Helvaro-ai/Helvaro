/*
 * Een voertuig voorgoed verwijderen (Sindi, 2026-10-03). Archiveren blijft de
 * voorzichtige standaard. Bij een wagen uit een feed onthoudt Helvaro zijn
 * bron-id, anders zet de volgende uursync hem meteen terug.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
process.env.API_AIRTABLE = 'x'; process.env.BASE_AIRTABLE = 'appTEST0000000000';

(async () => {
  console.log('\nVoertuig verwijderen');
  const gezien = [];
  const rec = { id: 'recV1', fields: { 'Vehicle Code': 'V7', 'Project Code': 'DEALERA', Make: 'BMW', Model: '330e', Source: 'feed', 'Source Record ID': 'as24-123' } };
  global.fetch = async (url, o = {}) => {
    gezien.push({ url: String(url), method: o.method || 'GET' });
    if ((o.method || 'GET') === 'DELETE') return { ok: true, json: async () => ({ deleted: true, id: 'recV1' }) };
    if (/filterByFormula/.test(url)) return { ok: true, json: async () => ({ records: [rec] }) };
    return { ok: true, json: async () => ({ records: [] }) };
  };
  const veh = require('../api/_vehicles.js');
  const uit = await veh.verwijder('DEALERA', 'v7');
  ck('DELETE op precies dat record', gezien.some((g) => g.method === 'DELETE' && /\/vehicles\/recV1$/.test(g.url)), gezien);
  ck('geeft code, bron en bron-id terug', uit.code === 'V7' && uit.bron === 'feed' && uit.bronId === 'as24-123', uit);
  let gooide = '';
  global.fetch = async (url, o = {}) => ({ ok: true, json: async () => ({ records: [] }) });
  try { await veh.verwijder('DEALERA', 'V99'); } catch (e) { gooide = e.code; }
  ck('onbekende code: not_found en niets verwijderd', gooide === 'not_found');
  gooide = '';
  try { await veh.verwijder('', 'V7'); } catch (e) { gooide = e.code; }
  ck('zonder projectcode: geweigerd', gooide === 'no_tenant');

  const inv = require('../api/_inventaris.js');
  const b = inv.saneerBron({ type: 'feed', url: 'https://x.example/f.xml', uitgesloten: ['a', 'a', ' b ', '', null] });
  ck('uitsluitlijst: ontdubbeld en opgeschoond', JSON.stringify(b.uitgesloten) === '["a","b"]', b.uitgesloten);
  ck('native bron heeft geen uitsluitlijst', inv.saneerBron({ type: 'native' }).uitgesloten === undefined);
  ck('de lijst is begrensd op 1000', inv.saneerBron({ type: 'feed', url: 'https://x.example/f.xml', uitgesloten: Array.from({ length: 1500 }, (_, i) => 'id' + i) }).uitgesloten.length === 1000);

  const src = fs.readFileSync(path.join(__dirname, '..', 'api', '_inventaris.js'), 'utf8');
  ck('de sync slaat uitgesloten wagens over vóór het verzoenen', /uitgesloten\.size \? feed\.voertuigen\.filter\(\(f\) => !uitgesloten\.has\(_s\.bronIdVoor\(b\.provider, f\.bronId, legacy\)\)\)/.test(src) && src.indexOf('feed.voertuigen.filter((f) => !uitgesloten') < src.indexOf('_sync.verzoenAlles(bestaand'));
  ck('een nieuwe bronkeuze wist de lijst niet', /huidig\.uitgesloten/.test(src));

  const leads = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');
  const blok = leads.slice(leads.indexOf("body.mode === 'vehicle-delete'"), leads.indexOf("body.mode === 'vehicle-delete'") + 1600);
  ck('de server eist confirm: true', /body\.confirm !== true/.test(blok) && /confirm_required/.test(blok));
  ck('en projectcode uit de sessie, niet uit de body', /!projectCode\) return res\.status\(403\)/.test(blok) && /verwijder\(projectCode, body\.code\)/.test(blok));
  ck('bij een feed-wagen wordt hij uitgesloten', /weg\.bron === 'feed' && weg\.bronId/.test(blok) && /sluitUit\(projectCode, weg\.bronId\)/.test(blok));

  const dash = fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8');
  ck('knop alleen voor dealers, met bevestiging en confirm:true',
    /isDealer\(\) \? '<button class="pd-mini pd-mini--gevaar" onclick="deletePand/.test(dash) && /if \(!confirm\(tr\('pd\.verwijderVraag'\)\)\) return;/.test(dash) && /mode: 'vehicle-delete', code: code, confirm: true/.test(dash));
  const i18n = require('../api/_i18n.js');
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const w = i18n.woordenboek(taal);
    ck(taal + ': knop, vraag en meldingen vertaald', ['btn.verwijderen', 'pd.verwijderVraag', 'pd.verwijderd', 'pd.verwijderdSync'].every((k) => w[k] && w[k] !== k));
  }
  console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
})();
