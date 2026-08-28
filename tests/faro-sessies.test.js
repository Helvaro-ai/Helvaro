/*
 * Oude Faro-gesprekken laadden niet, of maar half.
 *
 * ── Twee fouten, allebei zichtbaar als "het gesprek is leeg" ────────────────
 *
 * 1. api/_faro/store.js dbFetch() riep ZICHZELF aan zodra de Postgres-backend
 *    geconfigureerd was:
 *
 *        if (backend() === 'pg') return dbFetch(pathAndQuery, options);
 *
 *    Dat is oneindige recursie. Elke query eindigde in een RangeError, die
 *    available() netjes opving en omzette in _available=false. Vanaf dat moment
 *    meldde Faro voor de rest van de instance "gesprekken leven alleen in de
 *    browser": niets werd bewaard, en oude gesprekken kwamen leeg terug.
 *    _pgapi was al geïmporteerd maar werd nergens gebruikt.
 *
 * 2. listMessages() haalde één pagina op met pageSize tot 200. Airtable weigert
 *    alles boven 100 met een 422, en `if (!r.ok) return []` maakte daar een leeg
 *    gesprek van. En zonder doorpaginering kreeg een gesprek van meer dan 100
 *    berichten alleen de OUDSTE honderd terug -- juist het recente deel ontbrak.
 *
 * ── Wat hier bewaakt wordt ──────────────────────────────────────────────────
 * De echte store draait tegen een nagebootste Airtable, zodat paginering,
 * pageSize en eigendom gemeten worden in plaats van gelezen.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-token';
process.env.BASE_AIRTABLE = 'test-base';
delete process.env.PG_API_URL;
delete process.env.PG_API_TOKEN;
delete process.env.FARO_DEMO_MODE;

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

// ── Nagebootste Airtable ────────────────────────────────────────────────────
// Legt elke opgevraagde URL vast en dient records uit met een offset-cursor,
// precies zoals Airtable dat doet. Weigert pageSize > 100 met een 422, ook
// precies zoals Airtable dat doet -- anders test dit de bug niet.
function installFakeAirtable({ messageCount = 0, conversations = [] } = {}) {
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    const u = new URL(String(url));
    const pageSize = parseInt(u.searchParams.get('pageSize') || '100', 10);
    const table = u.pathname.split('/').pop();

    if (pageSize > 100) {
      return { ok: false, status: 422, json: async () => ({ error: 'PAGE_SIZE_TOO_LARGE' }) };
    }
    if (table === 'ai_conversations') {
      const formula = decodeURIComponent(u.searchParams.get('filterByFormula') || '');
      const recs = conversations
        .filter(c => formula.indexOf(`"${c.project_code}"`) !== -1)
        .filter(c => formula.indexOf('RECORD_ID()') === -1 || formula.indexOf(`"${c.id}"`) !== -1)
        .map(c => ({ id: c.id, fields: { project_code: c.project_code, title: c.title || '' } }));
      return { ok: true, status: 200, json: async () => ({ records: recs }) };
    }
    if (table === 'ai_messages') {
      const offset = parseInt(u.searchParams.get('offset') || '0', 10);
      const slice = [];
      for (let i = offset; i < Math.min(offset + pageSize, messageCount); i++) {
        slice.push({ id: 'msg' + i, fields: { role: 'user', content: 'bericht ' + i, created_at: '2026-01-01' } });
      }
      const next = offset + slice.length;
      return {
        ok: true, status: 200,
        json: async () => ({ records: slice, ...(next < messageCount ? { offset: String(next) } : {}) }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ records: [] }) };
  };
  return calls;
}

function freshStore() {
  for (const k of Object.keys(require.cache)) {
    if (k.indexOf('_faro') !== -1 || k.indexOf('_pgapi') !== -1) delete require.cache[k];
  }
  return require('../api/_faro/store.js');
}

(async () => {
  console.log('\n— dbFetch roept zichzelf niet meer aan —');
  {
    /* Dit moet meten dat de query de database ECHT bereikt. Alleen kijken of er
       geen RangeError naar buiten komt is niet genoeg: available() vangt hem op
       en geeft een lege lijst terug, en dat is precies wat een onbereikbare
       database ook doet. Met de recursie erin haalt hij dus 0 gesprekken op en
       zonder recursie 1 — daar zit het verschil. */
    process.env.PG_API_URL   = 'https://pg.invalid';
    process.env.PG_API_TOKEN = 'token';
    const calls = installFakeAirtable({
      conversations: [{ id: 'convPG', project_code: 'TELJO', title: 'via postgres' }],
    });
    const store = freshStore();
    const result = await store.listConversations('TELJO', {});

    ck('de query bereikt de database (1 gesprek terug, niet 0)',
       Array.isArray(result) && result.length === 1, JSON.stringify(result));
    ck('en gaat naar de PG-host, niet naar Airtable',
       calls.length > 0 && calls.every(c => c.indexOf('pg.invalid') !== -1),
       JSON.stringify(calls.slice(0, 2)));
    ck('via het /v0/-pad van de facade',
       calls.length > 0 && calls[0].indexOf('/v0/ai_conversations') !== -1, calls[0]);

    delete process.env.PG_API_URL;
    delete process.env.PG_API_TOKEN;
  }

  console.log('\n— pageSize blijft binnen wat Airtable accepteert —');
  {
    const calls = installFakeAirtable({
      messageCount: 250,
      conversations: [{ id: 'convA', project_code: 'TELJO' }],
    });
    const store = freshStore();
    const msgs = await store.listMessages('TELJO', 'convA', { limit: 200 });

    const sizes = calls
      .filter(c => c.indexOf('ai_messages') !== -1)
      .map(c => parseInt(new URL(c).searchParams.get('pageSize') || '0', 10));
    ck('geen enkele query vraagt meer dan 100 records',
       sizes.length > 0 && sizes.every(s => s <= 100), JSON.stringify(sizes));
    ck('en er komt niet 0 terug door een 422',
       msgs.length > 0, msgs.length);
  }

  console.log('\n— een lang gesprek komt compleet terug, niet alleen het begin —');
  {
    installFakeAirtable({
      messageCount: 250,
      conversations: [{ id: 'convA', project_code: 'TELJO' }],
    });
    const store = freshStore();
    const msgs = await store.listMessages('TELJO', 'convA', { limit: 1000 });
    // rowToMessage() normaliseert content naar tekstblokken; daar leest dit uit.
    const tekst = (m) => (m && m.content && m.content[0] && m.content[0].text) || '';
    ck('alle 250 berichten', msgs.length === 250, msgs.length);
    ck('het eerste bericht klopt', tekst(msgs[0]) === 'bericht 0', tekst(msgs[0]));
    ck('en het LAATSTE ook — dat was juist het deel dat ontbrak',
       tekst(msgs[249]) === 'bericht 249', tekst(msgs[249]));
    ck('de volgorde klopt over de paginagrenzen heen',
       msgs.every((m, i) => tekst(m) === 'bericht ' + i),
       msgs.slice(98, 102).map(tekst).join(' | '));
    ck('en er staan geen dubbele berichten in',
       new Set(msgs.map(m => m.id)).size === 250, new Set(msgs.map(m => m.id)).size);
  }

  console.log('\n— precies op de paginagrens —');
  {
    for (const n of [99, 100, 101]) {
      installFakeAirtable({ messageCount: n, conversations: [{ id: 'c', project_code: 'TELJO' }] });
      const store = freshStore();
      const msgs = await store.listMessages('TELJO', 'c', { limit: 1000 });
      ck(`${n} berichten → ${n} terug`, msgs.length === n, msgs.length);
    }
  }

  console.log('\n— en een ander kantoor komt er nog steeds niet bij —');
  {
    installFakeAirtable({
      messageCount: 50,
      conversations: [{ id: 'convA', project_code: 'TELJO' }],
    });
    const store = freshStore();

    const vreemd = await store.getConversation('ANDER-KANTOOR', 'convA');
    ck('getConversation met een geraden id geeft null', vreemd === null, vreemd);

    const berichten = await store.listMessages('ANDER-KANTOOR', 'convA', {});
    ck('en listMessages geeft niets, niet de 50 berichten',
       Array.isArray(berichten) && berichten.length === 0, berichten.length);

    const eigen = await store.getConversation('TELJO', 'convA');
    ck('de eigenaar zelf komt er wel bij', !!eigen, eigen);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
