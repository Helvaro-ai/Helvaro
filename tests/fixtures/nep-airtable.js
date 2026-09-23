/*
 * Nep-Airtable in het geheugen voor tests. Begrijpt de formules die
 * api/_klant.js, api/_gesprekken.js en api/_email/mailbox.js gebruiken:
 * AND/OR/NOT, {Veld}="x", LOWER({Veld})="x", LEFT({Veld}, n)="x".
 * Installeert zichzelf als global.fetch; niet-Airtable-adressen gaan naar
 * `andere(url, opts)`.
 */
'use strict';

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

function maakNepAirtable(tabellen, andere) {
  const db = {};
  for (const t of tabellen) db[t] = [];
  const haken = { naPost: null };
  let teller = 0;
  const json = (o, status = 200) => ({ ok: status < 300, status, json: async () => o, text: async () => JSON.stringify(o) });

  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    if (u.hostname !== 'api.airtable.com') return andere ? andere(url, opts) : json({}, 599);
    const delen = u.pathname.split('/').filter(Boolean); // v0, base, tabel, [id]
    const tabel = decodeURIComponent(delen[2]);
    const id = delen[3];
    if (!db[tabel]) return json({ error: { type: 'TABLE_NOT_FOUND' } }, 404);
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (opts.method === 'POST') {
      const lijst = body.records || [{ fields: body.fields }];
      const recs = lijst.map((r) => ({ id: 'rec' + String(++teller).padStart(6, '0'), fields: Object.assign({}, r.fields) }));
      db[tabel].push(...recs);
      if (haken.naPost) { const h = haken.naPost; haken.naPost = null; await h(tabel); }
      return json(body.records ? { records: recs } : recs[0]);
    }
    if (opts.method === 'PATCH') {
      const rec = db[tabel].find((r) => r.id === id);
      if (!rec) return json({ error: 'NOT_FOUND' }, 404);
      Object.assign(rec.fields, body.fields);
      return json(rec);
    }
    if (id) {
      const rec = db[tabel].find((r) => r.id === id);
      return rec ? json(rec) : json({ error: 'NOT_FOUND' }, 404);
    }
    let recs = db[tabel].slice();
    const formule = u.searchParams.get('filterByFormula');
    if (formule) recs = recs.filter((r) => evalueer(formule, r.fields));
    return json({ records: recs.slice(0, Number(u.searchParams.get('maxRecords') || u.searchParams.get('pageSize') || 100)) });
  };
  return { db, haken };
}

module.exports = { maakNepAirtable, evalueer };
