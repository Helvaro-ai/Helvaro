/*
 * api/_klant.js + api/_gesprekken.js — identiteit en gespreksopslag.
 *
 * Nooit samenvoegen op naam, tegenstrijdige identiteit niet samenvoegen,
 * dubbels door gelijktijdigheid, tenant-isolatie, idempotente berichten.
 * Airtable is een nep in het geheugen die de formules van deze modules
 * begrijpt (AND/OR/NOT, {Veld}="x", LOWER(), LEFT()).
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';

const klant = require(BASE + 'api/_klant.js');
const gesprekken = require(BASE + 'api/_gesprekken.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

/* ── Nep-Airtable ─────────────────────────────────────────────────────── */
const db = { customers: [], conversations: [], messages: [] };
let teller = 0;
let naPost = null; // haak om een race na te bootsen

function evalueer(expr, f) {
  expr = expr.trim();
  const fn = expr.match(/^(AND|OR|NOT)\(([\s\S]*)\)$/);
  if (fn) {
    const args = splitArgs(fn[2]);
    if (fn[1] === 'AND') return args.every((a) => evalueer(a, f));
    if (fn[1] === 'OR') return args.some((a) => evalueer(a, f));
    return !evalueer(args[0], f);
  }
  let m = expr.match(/^LOWER\(\{([^}]+)\}\)="((?:[^"\\]|\\.)*)"$/);
  if (m) return String(f[m[1]] || '').toLowerCase() === unesc(m[2]);
  m = expr.match(/^LEFT\(\{([^}]+)\}, (\d+)\)="((?:[^"\\]|\\.)*)"$/);
  if (m) return String(f[m[1]] || '').slice(0, Number(m[2])) === unesc(m[3]);
  m = expr.match(/^\{([^}]+)\}="((?:[^"\\]|\\.)*)"$/);
  if (m) return String(f[m[1]] == null ? '' : f[m[1]]) === unesc(m[2]);
  throw new Error('nep-airtable snapt formule niet: ' + expr);
}
function unesc(s) { return s.replace(/\\(.)/g, '$1'); }
function splitArgs(s) {
  const uit = []; let diepte = 0, inStr = false, huidig = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { huidig += c; if (c === '\\') { huidig += s[++i]; continue; } if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; huidig += c; continue; }
    if (c === '(') diepte++;
    if (c === ')') diepte--;
    if (c === ',' && diepte === 0) { uit.push(huidig); huidig = ''; continue; }
    huidig += c;
  }
  if (huidig.trim()) uit.push(huidig);
  return uit;
}

global.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const delen = u.pathname.split('/').filter(Boolean); // v0, base, tabel, [id]
  const tabel = decodeURIComponent(delen[2]);
  const id = delen[3];
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });
  if (!db[tabel]) return json({ error: { type: 'TABLE_NOT_FOUND' } }, 404);
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (opts.method === 'POST') {
    const recs = body.records.map((r) => ({ id: 'rec' + String(++teller).padStart(6, '0'), fields: Object.assign({}, r.fields) }));
    db[tabel].push(...recs);
    const antwoord = json({ records: recs });
    if (naPost) { const h = naPost; naPost = null; await h(tabel); }
    return antwoord;
  }
  if (opts.method === 'PATCH') {
    const rec = db[tabel].find((r) => r.id === id);
    if (!rec) return json({ error: 'NOT_FOUND' }, 404);
    Object.assign(rec.fields, body.fields);
    return json(rec);
  }
  let recs = db[tabel].slice();
  const formule = u.searchParams.get('filterByFormula');
  if (formule) recs = recs.filter((r) => evalueer(formule, r.fields));
  return json({ records: recs.slice(0, Number(u.searchParams.get('maxRecords') || u.searchParams.get('pageSize') || 100)) });
};

(async () => {
  console.log('\nnormaliseren');
  ck('e-mail: hoofdletters en spaties', klant.normEmail('  Jan.Peeters@Example.BE ') === 'jan.peeters@example.be');
  ck('e-mail: onzin = leeg', klant.normEmail('jan at example') === '' && klant.normEmail('a@b') === '');
  ck('telefoon: nationaal BE -> 32', klant.normTelefoon('0478 12 34 56') === '32478123456');
  ck('telefoon: +32 en 0032 gelijk', klant.normTelefoon('+32 478 12 34 56') === klant.normTelefoon('0032478123456'));
  ck('telefoon: te kort = leeg', klant.normTelefoon('12345') === '');

  console.log('\nidentiteit');
  let r = await klant.resolve('P1', { email: 'jan@example.be', naam: 'Jan Peeters', leadId: 'recLEAD1', kanaal: 'website' });
  ck('nieuwe klant aangemaakt', r && r.nieuw && r.klant.email === 'jan@example.be' && r.klant.leadIds[0] === 'recLEAD1', r);
  const jan = r.klant;
  r = await klant.resolve('P1', { telefoon: '0478123456', naam: 'Jan Peeters' });
  ck('zelfde naam, ander nummer = NIET samengevoegd', r && r.nieuw && r.klant.id !== jan.id, r);
  const janTel = r.klant;
  r = await klant.resolve('P1', { email: 'JAN@example.be', telefoon: '0499 99 99 99', leadId: 'recLEAD2' });
  ck('zelfde e-mail = zelfde klant', r && !r.nieuw && r.klant.id === jan.id, r);
  ck('tweede kanaal vult het nummer aan', r.klant.telefoon === '32499999999');
  ck('lead gekoppeld zonder de eerste te verliezen', r.klant.leadIds.join() === 'recLEAD1,recLEAD2', r.klant.leadIds);
  r = await klant.resolve('P1', { email: 'jan@example.be', telefoon: '0478123456' });
  ck('e-mail -> A, nummer -> B: conflict, e-mail wint, niets samengevoegd', r && r.conflict === true && r.klant.id === jan.id, r);
  const janRec = db.customers.find((x) => x.fields['Customer ID'] === jan.id);
  ck('bij conflict wordt het nummer van B NIET bij A gezet', janRec.fields.Phone === '32499999999', janRec.fields.Phone);
  r = await klant.resolve('P2', { email: 'jan@example.be' });
  ck('andere dealer = andere klant (tenant-isolatie)', r && r.nieuw && r.klant.projectCode === 'P2', r);
  r = await klant.resolve('P1', { naam: 'Jan Peeters' });
  ck('alleen een naam = geen klantrecord', r === null);
  r = await klant.resolve('P1', { email: 'jan@example.be", {Project Code}="P2' });
  ck('formule-injectie via e-mail wordt geweigerd', r === null);

  /* Race: tussen ons aanmaken en ons opnieuw zoeken maakt een andere instantie
     een ouder record voor hetzelfde adres. */
  naPost = async () => {
    db.customers.unshift({ id: 'rec000000', fields: { 'Customer ID': 'KOUDER', 'Project Code': 'P1', Email: 'race@example.be', 'Lead IDs': '[]', 'Created At': '2020-01-01T00:00:00.000Z' } });
  };
  r = await klant.resolve('P1', { email: 'race@example.be', leadId: 'recLEAD9' });
  ck('race: oudste wint', r && r.klant.id === 'KOUDER' && r.via === 'race', r);
  const verliezer = db.customers.find((x) => x.fields.Email === 'race@example.be' && x.fields['Customer ID'] !== 'KOUDER');
  ck('race: jongere gemarkeerd als duplicaat, niet verwijderd', verliezer && verliezer.fields.Source === 'duplicaat:KOUDER');
  r = await klant.resolve('P1', { email: 'race@example.be' });
  ck('duplicaat wordt daarna nooit meer gekozen', r.klant.id === 'KOUDER');

  console.log('\ngesprekken');
  const a = await gesprekken.vindOfMaak('P1', { kanaal: 'email', thread: 'thr-1', klantId: jan.id, onderwerp: 'BMW X5' });
  ck('gesprek aangemaakt, AI actief', a.nieuw && a.gesprek.controle === 'AI_ACTIVE');
  const a2 = await gesprekken.vindOfMaak('P1', { kanaal: 'email', thread: 'thr-1' });
  ck('zelfde thread = zelfde gesprek', !a2.nieuw && a2.gesprek.id === a.gesprek.id);
  const b = await gesprekken.vindOfMaak('P2', { kanaal: 'email', thread: 'thr-1' });
  ck('zelfde thread bij andere dealer = ander gesprek', b.nieuw && b.gesprek.id !== a.gesprek.id);
  let fout = null;
  try { await gesprekken.vindOfMaak('P1', { kanaal: 'fax', thread: 'x' }); } catch (e) { fout = e.code; }
  ck('onbekend kanaal geweigerd', fout === 'bad_channel');

  console.log('\nberichten');
  let m = await gesprekken.voegToe('P1', a.gesprek, { sleutel: '<abc@mail>', richting: 'in', van: 'jan@example.be', tekst: 'Is de X5 nog vrij?' });
  ck('inkomend bericht bewaard', !m.dubbel && m.bericht.tekst === 'Is de X5 nog vrij?');
  const g = db.conversations.find((x) => x.fields['Conversation ID'] === a.gesprek.id);
  ck('gesprek: ongelezen + laatste richting in', g.fields.Unread === true && g.fields['Last Direction'] === 'in');
  m = await gesprekken.voegToe('P1', a.gesprek, { sleutel: '<abc@mail>', richting: 'in', tekst: 'Is de X5 nog vrij?' });
  ck('zelfde Message-ID opnieuw = dubbel, niets geschreven', m.dubbel && db.messages.length === 1);
  fout = null;
  try { await gesprekken.voegToe('P2', a.gesprek, { sleutel: 'x', tekst: 'y' }); } catch (e) { fout = e.code; }
  ck('bericht in gesprek van andere dealer geweigerd', fout === 'tenant_mismatch');
  const lijstP1 = await gesprekken.berichten('P1', a.gesprek.id);
  const lijstP2 = await gesprekken.berichten('P2', a.gesprek.id);
  ck('berichten lezen is tenant-gescoped', lijstP1.length === 1 && lijstP2.length === 0);

  console.log('\ncontrole');
  const c = await gesprekken.zetControle('P1', a.gesprek.id, 'HUMAN_TAKEOVER', 'Sarah');
  ck('overname gezet met wie en wanneer', c.controle === 'HUMAN_TAKEOVER' && c.controleDoor === 'Sarah' && Boolean(c.controleOp));
  fout = null;
  try { await gesprekken.zetControle('P2', a.gesprek.id, 'PAUSED', 'x'); } catch (e) { fout = e.code; }
  ck('controle op gesprek van andere dealer = niet gevonden', fout === 'not_found');
  fout = null;
  try { await gesprekken.zetControle('P1', a.gesprek.id, 'ROBOT', 'x'); } catch (e) { fout = e.code; }
  ck('onbekende controle geweigerd', fout === 'bad_control');

  console.log('\ngeen tabel');
  const bewaard = db.customers; delete db.customers;
  klant._test.reset();
  r = await klant.resolve('P1', { email: 'x@example.be' });
  ck('ontbrekende klantentabel = null, geen crash', r === null);
  db.customers = bewaard;
  klant._test.reset();

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
