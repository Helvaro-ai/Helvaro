'use strict';
/*
 * Een Faro-gesprek hernoemen, markeren of weggooien.
 *
 * ── Wat er mis was ─────────────────────────────────────────────────────────
 * api/_faro/store.js had de drie functies al compleet -- renameConversation,
 * setFavorite en deleteConversation -- elk met een eigendomscontrole vooraf, en
 * deleteConversation ruimt zelfs de berichten op zodat er geen rijen
 * achterblijven die aan niets meer hangen.
 *
 * api/_faro/handler.js antwoordde erop met:
 *
 *     case 'rename': case 'favorite': case 'delete':
 *       return res.status(501).json({ error: 'Nog niet beschikbaar', code: 'not_wired' });
 *
 * 'not_wired' was waar toen het er stond, en al een tijd niet meer. Gevolg voor
 * een klant: zijn gesprekkenlijst kon alleen groeien -- niet hernoemen, niet
 * markeren, niet weggooien.
 *
 * ── Wat hier bewaakt wordt ─────────────────────────────────────────────────
 * Niet dat de store het kan (dat kon hij al), maar dat de WEG ernaartoe bestaat
 * en dat de drie remmen erop zitten. De belangrijkste is de tenantgrens: de
 * ids in dit systeem worden deels door een model aangeraakt, en een geraden id
 * mag nooit het gesprek van een ander kantoor hernoemen of wissen.
 */
process.env.FARO_WORKSPACE_ENABLED = '1';
process.env.API_AIRTABLE  = process.env.API_AIRTABLE  || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';

const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

let DB, LOG;
function resetDb() {
  DB = {
    conv: [{ id: 'recAAA', f: { project_code: 'MIJN',  title: 'Oud',         favorite: false } },
           { id: 'recBBB', f: { project_code: 'ANDER', title: 'Van de buur', favorite: false } }],
    msg:  [{ id: 'recM1', f: { conversation_id: 'recAAA' } },
           { id: 'recM2', f: { conversation_id: 'recBBB' } }],
  };
  LOG = [];
}

/* Een piepklein stukje Airtable. Genoeg voor filterByFormula, PATCH en DELETE;
   meer nabouwen zou betekenen dat de test iets toetst wat Airtable doet. */
global.fetch = async (url, opts) => {
  const u = new URL(url);
  const tabel = u.pathname.split('/')[3];
  const kort = tabel.indexOf('ai_messages') > -1 ? 'msg' : 'conv';
  const m = (opts && opts.method) || 'GET';
  const idInPad = u.pathname.split('/')[4];
  LOG.push(m + ' ' + kort + (idInPad ? '/' + idInPad : ''));
  if (m === 'DELETE') {
    DB[kort] = DB[kort].filter((r) => r.id !== idInPad);
    return { ok: true, status: 200, json: async () => ({ deleted: true }) };
  }
  if (m === 'PATCH') {
    const r = DB[kort].find((x) => x.id === idInPad);
    Object.assign(r.f, JSON.parse(opts.body).fields);
    return { ok: true, status: 200, json: async () => ({ id: r.id, fields: r.f }) };
  }
  const f = u.searchParams.get('filterByFormula') || '';
  let rijen = DB[kort];
  const pc  = /\{project_code\}="([^"]*)"/.exec(f);      if (pc)  rijen = rijen.filter((r) => r.f.project_code === pc[1]);
  const rid = /RECORD_ID\(\)="([^"]*)"/.exec(f);         if (rid) rijen = rijen.filter((r) => r.id === rid[1]);
  const cid = /\{conversation_id\}="([^"]*)"/.exec(f);   if (cid) rijen = rijen.filter((r) => r.f.conversation_id === cid[1]);
  return { ok: true, status: 200, json: async () => ({ records: rijen.map((r) => ({ id: r.id, fields: r.f })) }) };
};

const handler = require(path.join(BASE, 'api/_faro/handler.js'));
const ctx = { projectCode: 'MIJN', userId: 'u', lang: 'nl' };
function nepRes() {
  const o = { code: null, body: null };
  o.status = (c) => { o.code = c; return o; };
  o.json = (b) => { o.body = b; return o; };
  return o;
}
async function doe(body) {
  const r = nepRes();
  await handler.handle({ method: 'POST', body, headers: {} }, r, ctx);
  return { code: r.code, body: r.body };
}
const conv = (id) => DB.conv.find((c) => c.id === id);

(async () => {
  console.log('\n  de drie geven geen 501 meer');
  {
    resetDb();
    for (const op of ['rename', 'favorite', 'delete']) {
      const r = await doe({ mode: 'faro-conversations', op, id: 'recAAA', title: 'x' });
      ck(op + ' is aangesloten', r.code !== 501 && (r.body || {}).code !== 'not_wired', r);
      resetDb();
    }
  }

  console.log('\n  hernoemen');
  {
    resetDb();
    const r = await doe({ mode: 'faro-conversations', op: 'rename', id: 'recAAA', title: 'Nieuwe naam' });
    ck('een eigen gesprek kan hernoemd', r.code === 200 && conv('recAAA').f.title === 'Nieuwe naam', r.code);
    /* Een gesprek zonder naam is een lege regel in de zijbalk. */
    const leeg = await doe({ mode: 'faro-conversations', op: 'rename', id: 'recAAA', title: '   ' });
    ck('maar niet naar een lege naam', leeg.code === 400 && conv('recAAA').f.title === 'Nieuwe naam', leeg);
    const geenId = await doe({ mode: 'faro-conversations', op: 'rename', title: 'x' });
    ck('en niet zonder id', geenId.code === 400, geenId);
  }

  console.log('\n  favoriet');
  {
    resetDb();
    await doe({ mode: 'faro-conversations', op: 'favorite', id: 'recAAA', favorite: true });
    ck('aanzetten werkt', conv('recAAA').f.favorite === true);
    await doe({ mode: 'faro-conversations', op: 'favorite', id: 'recAAA', favorite: false });
    ck('en uitzetten ook', conv('recAAA').f.favorite === false);
  }

  console.log('\n  verwijderen');
  {
    resetDb();
    const r = await doe({ mode: 'faro-conversations', op: 'delete', id: 'recAAA' });
    ck('het gesprek is weg', r.code === 200 && !conv('recAAA'), r.code);
    /* Berichten hebben geen project_code -- het gesprek is de enige weg
       ernaartoe. Blijven ze staan, dan zijn ze onbereikbaar EN onverwijderbaar. */
    ck('en zijn berichten ook', !DB.msg.find((m) => m.id === 'recM1'), DB.msg.map((m) => m.id));
    const deletes = LOG.filter((l) => l.startsWith('DELETE'));
    ck('berichten gingen eerst', deletes[0].indexOf('msg') > -1, deletes);
  }

  console.log('\n  en de tenantgrens houdt');
  {
    resetDb();
    const h = await doe({ mode: 'faro-conversations', op: 'rename', id: 'recBBB', title: 'Gekaapt' });
    ck('hernoemen van een ander kantoor: 404', h.code === 404, h);
    ck('en de titel is onaangeroerd', conv('recBBB').f.title === 'Van de buur', conv('recBBB').f.title);

    const f = await doe({ mode: 'faro-conversations', op: 'favorite', id: 'recBBB', favorite: true });
    ck('markeren van een ander kantoor: 404', f.code === 404, f);

    const d = await doe({ mode: 'faro-conversations', op: 'delete', id: 'recBBB' });
    ck('wissen van een ander kantoor: 404', d.code === 404, d);
    ck('het gesprek van de buur staat er nog', !!conv('recBBB'));
    ck('en zijn bericht ook', !!DB.msg.find((m) => m.id === 'recM2'));
    /* 404 en niet 403: het verschil zou verklappen dat het id bestaat. */
    ck('het antwoord verklapt niet dat het id bestaat',
      d.body && /niet gevonden/i.test(d.body.error || ''), d.body);
  }

  console.log('\n  en er zijn knoppen voor');
  {
    const client = require('fs').readFileSync(path.join(BASE, 'api/_faro/ui/client.js'), 'utf8');
    ck('de lijst tekent een ster en een menu',
      /data-fav=/.test(client) && /data-menu=/.test(client));
    ck('hernoemen, markeren en wissen zijn aangesloten',
      /faroHernoem/.test(client) && /faroFavoriet/.test(client) && /faroVerwijder/.test(client));
    /* Wissen haalt ook de berichten weg en er is geen prullenbak. */
    ck('wissen vraagt eerst', /faroVerwijder[\s\S]{0,300}window\.confirm/.test(client), null);
    /* Stond het gewiste gesprek open, dan wijst het scherm naar iets dat er
       niet meer is. */
    ck('en start een nieuw gesprek als het open stond',
      /faroState\.conversationId === id[\s\S]{0,120}faroNewConversation/.test(client), null);
  }

  console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('  STUK:', e && e.stack); process.exit(1); });
