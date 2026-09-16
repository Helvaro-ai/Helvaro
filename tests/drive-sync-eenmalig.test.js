/*
 * De Drive-sync maakt niets dubbel.
 *
 * Op 2026-09-16 liepen twee synchronisaties tegelijk (knop + tweede aanroep,
 * 22:25 en 22:26). Allebei lazen een lege bestandenlijst en maakten alles
 * dubbel aan: twee mappen Klanten, twee Changelogs, twee sheets. Drie regels
 * sindsdien: één sync tegelijk (slot), eerst zoeken op naam en dan pas maken,
 * en wat er dubbel staat gaat naar de prullenbak (nooit definitief weg).
 */
'use strict';

process.env.API_AIRTABLE = 'patZelftest';
process.env.BASE_AIRTABLE = 'appZelftest';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

/* ── Nep-Google en nep-Airtable ─────────────────────────────────────────── */
const drive = [];            // {id, name, mimeType, parents, trashed, created}
let volgnr = 0;
const settings = {};         // key -> {id, value}
let aangemaakt = 0;
const MAP = 'application/vnd.google-apps.folder';

function seed(name, mimeType, parent) {
  const id = 'f' + (++volgnr);
  drive.push({ id, name, mimeType, parents: [parent || 'root'], trashed: false, created: volgnr });
  aangemaakt++;
  return id;
}
function json(status, body) { return { ok: status < 300, status, json: async () => body }; }

function driveQuery(q) {
  const naam = (q.match(/name = '((?:[^'\\]|\\.)*)'/) || [])[1];
  const mime = (q.match(/mimeType = '([^']+)'/) || [])[1];
  const parent = (q.match(/'([^']+)' in parents/) || [])[1];
  return drive.filter((f) => !f.trashed
    && (!naam || f.name === naam.replace(/\\'/g, "'"))
    && (!mime || f.mimeType === mime)
    && (!parent || f.parents.includes(parent))).sort((a, b) => a.created - b.created);
}

global.fetch = async (url, opts = {}) => {
  const m = (opts.method || 'GET').toUpperCase();
  // Airtable
  if (/api\.airtable\.com/.test(url)) {
    if (/admin_settings|tblGHCz8YGLf6mOr9/.test(url)) {
      if (m === 'GET') {
        const key = decodeURIComponent((url.match(/filterByFormula=([^&]+)/) || [])[1] || '').match(/\{key\}="([^"]+)"/);
        const s = key && settings[key[1]];
        return json(200, { records: s ? [{ id: s.id, fields: { key: key[1], value: s.value } }] : [] });
      }
      const f = JSON.parse(opts.body).fields;
      settings[f.key] = { id: settings[f.key] ? settings[f.key].id : 'rec' + f.key, value: f.value };
      return json(200, { id: settings[f.key].id, fields: f });
    }
    if (/Client|tbl/.test(url) && m === 'GET' && !/Leads/.test(url)) {
      return json(200, { records: [{ id: 'recK', fields: { 'Project Code': 'AAA', 'Client Name': 'Kine Gent', Language: 'nl', Country: 'BE' } }] });
    }
    return json(200, { records: [] });
  }
  // Google Drive
  if (/googleapis\.com\/drive\/v3\/files\?q=/.test(url)) {
    const q = decodeURIComponent(url.match(/q=([^&]+)/)[1]);
    return json(200, { files: driveQuery(q).map((f) => ({ id: f.id, createdTime: String(f.created) })) });
  }
  let mm;
  if ((mm = url.match(/googleapis\.com\/drive\/v3\/files\/([^?]+)/))) {
    const f = drive.find((x) => x.id === decodeURIComponent(mm[1]));
    if (!f) return json(404, { error: { message: 'weg' } });
    if (m === 'PATCH') {
      const b = JSON.parse(opts.body || '{}'); if (b.trashed) f.trashed = true;
      const add = (url.match(/addParents=([^&]+)/) || [])[1], rem = (url.match(/removeParents=([^&]+)/) || [])[1];
      if (add || rem) f.parents = f.parents.filter((x) => x !== decodeURIComponent(rem || '')).concat(add ? [decodeURIComponent(add)] : []);
      return json(200, { id: f.id });
    }
    return json(200, { id: f.id, trashed: f.trashed });
  }
  if (/googleapis\.com\/upload\/drive\/v3\/files\/([^?]+)/.test(url) && m === 'PATCH') {
    const id = decodeURIComponent(url.match(/files\/([^?]+)/)[1]);
    return drive.find((x) => x.id === id) ? json(200, { id }) : json(404, { error: { message: 'weg' } });
  }
  if (/googleapis\.com\/upload\/drive\/v3\/files\?/.test(url) && m === 'POST') {
    const meta = JSON.parse(String(opts.body).match(/\{[\s\S]*?\}(?=\r\n--)/)[0]);
    return json(200, { id: seed(meta.name, meta.mimeType, (meta.parents || [])[0]) });
  }
  if (/googleapis\.com\/drive\/v3\/files\?fields=id/.test(url) && m === 'POST') {
    const meta = JSON.parse(opts.body);
    return json(200, { id: seed(meta.name, meta.mimeType, (meta.parents || [])[0]) });
  }
  return json(500, { error: { message: 'onbekende url ' + url } });
};

const _gcal = require('../api/_gcal');
_gcal.decryptToken = () => 'refresh';
_gcal.getAccessToken = async () => 'toegang';
const _drive = require('../api/_drive');

(async () => {
  settings.drive_refresh_token = { id: 'r1', value: 'x' };
  settings.drive_email = { id: 'r2', value: 'sindi@example.test' };

  console.log('\n— de puinhoop van 16 september: alles dubbel, lege bestandenlijst —');
  const map = seed('Helvaro Admin', MAP, 'root');
  const k1 = seed('Klanten', MAP, map);
  const k2 = seed('Klanten', MAP, map);
  const c1 = seed('Helvaro — Changelog', 'application/vnd.google-apps.document', map);
  const c2 = seed('Helvaro — Changelog', 'application/vnd.google-apps.document', map);
  seed('Kine Gent (AAA)', 'application/vnd.google-apps.document', k2);
  const voor = aangemaakt;

  const v = await _drive.sync();
  const levend = (naam) => drive.filter((f) => f.name === naam && !f.trashed);
  ck('geen tweede map Helvaro Admin', levend('Helvaro Admin').length === 1 && levend('Helvaro Admin')[0].id === map);
  ck('de oudste Changelog blijft, de andere gaat naar de prullenbak',
    levend('Helvaro — Changelog').length === 1 && levend('Helvaro — Changelog')[0].id === c1 && drive.find((f) => f.id === c2).trashed);
  ck('één klantdocument over', levend('Kine Gent (AAA)').length === 1, JSON.stringify(levend('Kine Gent (AAA)')));
  ck('één map Klanten over, de dubbele is weggegooid', levend('Klanten').length === 1, JSON.stringify(levend('Klanten')));
  ck('en het klantdocument staat in de overgebleven map',
    levend('Kine Gent (AAA)')[0].parents.includes(levend('Klanten')[0].id), JSON.stringify(levend('Kine Gent (AAA)')));
  ck('nieuwe bestanden alleen voor wat er nog niet was (Klanten-sheet, Kosten, Founder)',
    aangemaakt - voor === 3, aangemaakt - voor);
  ck('en het verslag telt op wat er opgeruimd is', v.opgeruimd >= 2, v.opgeruimd);
  ck('geen fouten', v.fouten.length === 0, JSON.stringify(v.fouten));

  console.log('\n— nog een keer: niets nieuws —');
  const tussen = aangemaakt;
  const v2 = await _drive.sync();
  ck('tweede sync maakt niets aan', aangemaakt === tussen, aangemaakt - tussen);
  ck('en ruimt niets op', v2.opgeruimd === 0, v2.opgeruimd);
  ck('het slot is weer vrij', !settings.drive_sync_lock.value);

  console.log('\n— twee tegelijk —');
  settings.drive_sync_lock = { id: 'r9', value: new Date().toISOString() };
  let fout = null;
  try { await _drive.sync(); } catch (e) { fout = e; }
  ck('de tweede krijgt een nette melding', fout && fout.code === 'bezig', fout && fout.message);
  settings.drive_sync_lock = { id: 'r9', value: new Date(Date.now() - 11 * 60 * 1000).toISOString() };
  fout = null;
  try { await _drive.sync(); } catch (e) { fout = e; }
  ck('een verlopen slot (>10 min) blokkeert niet', !fout, fout && fout.message);

  console.log(`\n${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
