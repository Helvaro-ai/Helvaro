'use strict';
/*
 * Het uurlijkse voorraadritje (2026-09-26).
 *
 * Helvaro draait op een betaald Vercel-plan; cron hoeft niet één keer per dag.
 * vercel.json roept elk uur /api/cron-followup?taak=voorraad aan. Dat mag:
 *   - alleen dealers met een feed synchroniseren, met DEZELFDE sync als de knop;
 *   - niet archiveren (dat blijft in de dagrun, veertien dagen hebben geen
 *     uurprecisie nodig);
 *   - niets anders doen: geen opvolgberichten, geen herinneringen, geen
 *     retentie -- die horen één keer per dag, en een betaald WhatsApp-sjabloon
 *     elk uur opnieuw proberen is precies wat niet mag gebeuren.
 * En het blijft achter CRON_SECRET.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.CRON_SECRET = 'geheim-test';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const _vertical = require(BASE + 'api/_vertical.js');
const inv = require(BASE + 'api/_inventaris.js');
const vsync = require(BASE + 'api/_voorraad-sync.js');

const syncs = [];
const archief = [];
inv.sync = async (code, o) => { syncs.push({ code, trigger: o && o.trigger, door: o && o.door }); return { ok: true }; };
vsync.archiveerVerkocht = async (code) => { archief.push(code); return { gearchiveerd: 1, klokGestart: 0 }; };

const oproepen = [];
global.fetch = async (url) => {
  const u = String(url);
  oproepen.push(u);
  const json = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('tblPidTrwGRzRt4LZ')) {
    return json({ records: [
      { id: 'r1', fields: { 'Project Code': 'FEEDGARAGE', [_vertical.VELD_ID]: _vertical.DEALERSHIP, 'Inventory Source': JSON.stringify({ type: 'feed', url: 'https://dms.voorbeeld/feed.csv' }) } },
      { id: 'r2', fields: { 'Project Code': 'HANDGARAGE', [_vertical.VELD_ID]: _vertical.DEALERSHIP } },
      { id: 'r3', fields: { 'Project Code': 'MAKELAAR' } },
    ] });
  }
  return json({ records: [] });
};

const cron = require(BASE + 'api/cron-followup.js');

async function roep(query, auth) {
  let status = 200, body = null;
  const res = { setHeader() {}, status(c) { status = c; return this; }, json(d) { body = d; return this; }, end() { return this; }, send(d) { body = d; return this; } };
  await cron({ method: 'GET', url: '/api/cron-followup', query, headers: auth ? { authorization: auth } : {} }, res);
  return { status, body };
}

(async () => {
  console.log('\nde uurrun');
  {
    const zonder = await roep({ taak: 'voorraad' }, '');
    ck('zonder CRON_SECRET: 401', zonder.status === 401, zonder);
    ck('en er is niets gelezen', oproepen.length === 0 && syncs.length === 0, oproepen);

    const r = await roep({ taak: 'voorraad' }, 'Bearer geheim-test');
    ck('met het geheim: 200', r.status === 200, r);
    ck('alleen de feed-dealer wordt gesynct', syncs.length === 1 && syncs[0].code === 'FEEDGARAGE', syncs);
    ck('met dezelfde sync als de knop, gemarkeerd als uurlijks', syncs[0] && syncs[0].trigger === 'uurlijks' && syncs[0].door === 'cron', syncs[0]);
    ck('er wordt NIET gearchiveerd', archief.length === 0, archief);
    ck('twee dealers geteld (de makelaar niet)', r.body && r.body.voorraad && r.body.voorraad.dealers === 2, r.body);
    ck('geen enkele andere taak: alleen Client Config gelezen', oproepen.every((u) => u.includes('tblPidTrwGRzRt4LZ')), oproepen.filter((u) => !u.includes('tblPidTrwGRzRt4LZ')));
  }

  console.log('\nde dagrun-helft (runVoorraad met archiveren)');
  {
    syncs.length = 0; archief.length = 0;
    const v = await cron.runVoorraad(new Date(), { budgetS: 180, trigger: 'dagelijks', archiveren: true });
    ck('de feed-dealer wordt gesynct', syncs.length === 1 && syncs[0].trigger === 'dagelijks', syncs);
    ck('en ELKE dealer wordt gearchiveerd, ook zonder feed', archief.length === 2 && archief.includes('HANDGARAGE'), archief);
    ck('de tellers kloppen', v.gesynct === 1 && v.gearchiveerd === 2, v);
  }

  console.log('\nhet tijdsbudget');
  {
    syncs.length = 0;
    const lang = new Date(Date.now() - 500 * 1000);
    const v = await cron.runVoorraad(lang, { budgetS: 240, trigger: 'uurlijks', archiveren: false });
    ck('over het budget: geen nieuwe dealer meer, wel geteld', syncs.length === 0 && v.overgeslagen === 1, v);
  }

  console.log('\nvercel.json');
  {
    const crons = require(BASE + 'vercel.json').crons;
    const uur = crons.find((c) => c.path === '/api/cron-followup?taak=voorraad');
    ck('de uurrun staat erin', !!uur, crons);
    ck('op :30, niet op :00 (de dagrun om 09:00 synct ook)', uur && uur.schedule === '30 * * * *', uur);
    ck('de dagrun staat er nog', crons.some((c) => c.path === '/api/cron-followup' && c.schedule === '0 9 * * *'));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
