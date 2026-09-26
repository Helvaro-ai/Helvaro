'use strict';
/*
 * De auto van de websiteaanvraag komt aan bij de AI.
 *
 * Spec-test 14: een lead van de website van de dealer hoort aan het voertuig
 * vast te hangen. Spec-test 15: vraagt een bezoeker naar een verkochte auto,
 * dan hoort hij te horen dat hij verkocht is.
 *
 * Twee fouten zaten er tot 2026-09-26 tussen, allebei stil:
 *   1. api/form-page.js stuurde bij een dealer alleen de PANDcode mee -- die is
 *      daar altijd leeg. Elke aanvraag vanaf een autopagina kwam zonder auto.
 *   2. api/_autoscout.js herken() las de code op de lead niet. "Is hij nog
 *      beschikbaar?" leverde dus "welke auto bedoelt u?" op.
 *
 * Airtable is een nep-fetch in het geheugen; er gaat niets over het net.
 */
const path = require('path');
const fs = require('fs');
const BASE = path.join(__dirname, '..') + '/';

process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN || 'test-token';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

const _vertical = require(BASE + 'api/_vertical.js');
const vehicles = require(BASE + 'api/_vehicles.js');
const autoscout = require(BASE + 'api/_autoscout.js');
const prompts = require(BASE + 'api/_ai/prompts.js');

/* ── De voorraad van twee dealers ─────────────────────────────────────────── */
const auto = (code, project, velden) => ({
  id: 'rec' + project + code,
  fields: Object.assign({ 'Vehicle Code': code, 'Project Code': project, Status: 'beschikbaar' }, velden),
});
const VOORRAAD = [
  auto('V1', 'GARAGE', { Make: 'Volkswagen', Model: 'Golf', Variant: 'GTI', Price: 24950 }),
  auto('V2', 'GARAGE', { Make: 'Volkswagen', Model: 'Polo', Price: 15950 }),
  auto('V3', 'GARAGE', { Make: 'BMW', Model: '320d', Variant: 'Touring', Price: 31950 }),
  /* Verkocht en al gearchiveerd: staat niet meer in de publieke lijst. */
  auto('V4', 'GARAGE', { Make: 'Audi', Model: 'A4', Status: 'verkocht', Archived: true, 'Sold At': '2026-09-01T10:00:00.000Z' }),
  /* Verkocht, nog binnen de veertien dagen. */
  auto('V5', 'GARAGE', { Make: 'Skoda', Model: 'Octavia', Status: 'verkocht', 'Sold At': '2026-09-24T10:00:00.000Z' }),
  /* Een andere dealer met dezelfde code. */
  auto('V9', 'ANDER', { Make: 'Porsche', Model: '911' }),
];

function formuleVan(url) {
  const m = /filterByFormula=([^&]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : '';
}
function past(rec, formule) {
  const p = /\{Project Code\}="([^"]*)"/.exec(formule);
  if (p && rec.fields['Project Code'] !== p[1]) return false;
  const c = /UPPER\(\{Vehicle Code\}\)="([^"]*)"/.exec(formule);
  if (c && String(rec.fields['Vehicle Code']).toUpperCase() !== c[1]) return false;
  return true;
}

const CLIENT = { id: 'recCLIENT', fields: { [_vertical.VELD_ID]: _vertical.DEALERSHIP, 'Client Name': 'Garage Test', 'AI Name': 'Faro' } };

global.fetch = async (url) => {
  const u = String(url);
  const json = (d, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => d, text: async () => JSON.stringify(d) });
  if (u.includes('/vehicles')) {
    const f = formuleVan(u);
    let recs = VOORRAAD.filter((r) => past(r, f));
    const max = /maxRecords=(\d+)/.exec(u);
    if (max) recs = recs.slice(0, Number(max[1]));
    if (/pageSize=1(&|$)/.test(u) && !f) recs = recs.slice(0, 1);
    return json({ records: recs });
  }
  if (u.includes('tblPidTrwGRzRt4LZ')) return json({ records: [CLIENT] });
  return json({ records: [] });
};

(async () => {
  console.log('\nherken(): de auto die al op de lead staat');
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Hallo, is hij nog beschikbaar?', { leadCode: 'V3' });
    ck('"is hij nog beschikbaar?" + V3 op de lead -> V3', r.voertuig && r.voertuig.code === 'V3', r.voertuig && r.voertuig.code);
    ck('en zegt waarom: via de lead', r.via === 'lead', r.via);
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Hallo, is hij nog beschikbaar?', {});
    ck('zonder leadcode: niets (dan vraagt Faro het)', r.voertuig === null, r.voertuig && r.voertuig.code);
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Hebben jullie ook een Polo?', { leadCode: 'V3' });
    ck('de tekst noemt alleen een ANDERE auto -> die andere', r.voertuig && r.voertuig.code === 'V2', r.voertuig && r.voertuig.code);
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Is die BMW 320d nog te koop, of anders de Golf?', { leadCode: 'V3' });
    ck('de tekst noemt de auto van de lead (ook) -> de auto van de lead', r.voertuig && r.voertuig.code === 'V3', r.voertuig && r.voertuig.code);
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Nog beschikbaar?', { leadCode: 'v3 ' });
    ck('code wordt genormaliseerd (kleine letters, spatie)', r.voertuig && r.voertuig.code === 'V3');
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Nog beschikbaar?', { leadCode: 'V9' });
    ck('code van een ANDERE dealer -> niets', r.voertuig === null, r.voertuig);
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Nog beschikbaar?', { leadCode: 'V77' });
    ck('code die niet (meer) bestaat -> niets, geen fout', r.voertuig === null);
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Nog beschikbaar?', { leadCode: '"; DROP' });
    ck('onzin-code -> niets', r.voertuig === null);
  }

  console.log('\nspec-test 15: een verkochte auto');
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Staat hij er nog?', { leadCode: 'V4' });
    ck('gearchiveerd en verkocht, niet in de publieke lijst -> toch gevonden', r.voertuig && r.voertuig.code === 'V4', r.voertuig);
    const b = vehicles.boekbaar(r.voertuig, []);
    ck('niet boekbaar, reden verkocht', b.ok === false && b.reden === 'verkocht', b);
    const fiche = prompts.voertuigen.fiche(r.voertuig, {}, { boekbaar: b, alternatieven: [] });
    ck('de fiche zegt het de AI: verkocht, geen proefrit', /dit voertuig is verkocht/.test(fiche) && /GEEN proefrit/.test(fiche), fiche.slice(-400));
  }
  {
    const r = await autoscout.herken(vehicles, 'GARAGE', 'Is de Octavia nog beschikbaar?', {});
    ck('verkocht binnen de 14 dagen: uit de tekst herkend', r.voertuig && r.voertuig.code === 'V5', r.voertuig && r.voertuig.code);
    ck('en ook niet boekbaar', vehicles.boekbaar(r.voertuig, []).reden === 'verkocht');
  }

  console.log('\nspec-test 14: het formulier op de autopagina stuurt de auto mee');
  {
    delete require.cache[require.resolve(BASE + 'api/form-page.js')];
    const page = require(BASE + 'api/form-page.js');
    let html = '';
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
      send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {},
    };
    await page({ method: 'GET', url: '/start/GARAGE/V3', query: {}, headers: {} }, res);
    ck('de pagina rendert', html.length > 1000, html.slice(0, 200));
    ck('de autokaart staat erop', /BMW/.test(html) && /320d/.test(html));
    ck('en de code V3 gaat mee met de aanvraag', /var PAND\s*=\s*'V3';/.test(html), (/var PAND[^\n]*/.exec(html) || [''])[0]);
  }
  {
    /* Een pand-link bij een dealer die naar niets wijst blijft leeg. */
    delete require.cache[require.resolve(BASE + 'api/form-page.js')];
    const page = require(BASE + 'api/form-page.js');
    let html = '';
    await page({ method: 'GET', url: '/start/GARAGE/V77', query: {}, headers: {} },
      { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {} });
    ck('onbekende code: geen code mee', /var PAND\s*=\s*'';/.test(html), (/var PAND[^\n]*/.exec(html) || [''])[0]);
  }
  {
    const formSrc = fs.readFileSync(BASE + 'api/form.js', 'utf8');
    ck('api/form.js bewaart de code op de lead (property in de Notities-blob)',
      /pand \? \{ property: pand \} : \{\}/.test(formSrc));
    ck('en laat een voertuigcode als V3 door', /\^\[A-Z0-9\]\[A-Z0-9-\]\{0,19\}\$/.test(formSrc) && /^[A-Z0-9][A-Z0-9-]{0,19}$/.test('V3'));
  }

  console.log('\nde WhatsApp-kant geeft de code door');
  {
    const wa = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');
    ck('herken() krijgt de leadcode uit de Notities-blob',
      /leadCode = blob && blob\.property \? String\(blob\.property\) : ''/.test(wa)
      && /_autoscout\.herken\(_vehicles, projectCode, koperTekst, \{ leadCode \}\)/.test(wa));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
