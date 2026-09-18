'use strict';
/*
 * Google Drive voor de back-office (beheerder).
 *
 * De beheerder koppelt één keer zijn Google-account (sindi@helvaro.pro);
 * daarna schrijft Helvaro zijn eigen administratie als losse documenten in
 * een map "Helvaro Admin" op die Drive, en houdt ze bij:
 *
 *   Helvaro — Klanten       (Sheet)   alle klanten, plan, leads, verbruik
 *   Klanten/<naam> (<code>) (Doc)     één document per klant
 *   Helvaro — Kosten        (Sheet)   vaste kosten, variabel, per maand
 *   Helvaro — Founder       (Doc)     doelen, sales-pipeline
 *   Helvaro — Changelog     (Doc)     wat er in het product veranderde
 *
 * Elk document wordt bijgewerkt op zijn eigen bestand-id: de link blijft
 * dezelfde, de inhoud vernieuwt (knop "Synchroniseer nu", en dagelijks
 * vanuit de cron). Verwijdert iemand een bestand op Drive, dan maakt de
 * volgende sync hem opnieuw aan.
 *
 * ── Waarom via de OAuth-client van de agenda ─────────────────────────────
 * Dezelfde GOOGLE_CLIENT_ID/SECRET en dezelfde redirect-URI als de
 * agenda-koppeling van klanten (api/_gcal.js), met een eigen scope
 * (drive.file: alleen bestanden die deze app zelf aanmaakte). Zo hoeft er
 * niets bij in Google Cloud. De callback komt binnen op /api/gcal en wordt
 * daar op de state-prefix "drive." herkend (api/leads.js handleGcal).
 *
 * ── Waar de koppeling staat ──────────────────────────────────────────────
 * Airtable-tabel admin_settings (sleutel/waarde): het refresh-token
 * versleuteld (zelfde sleutel als de agenda-tokens), het e-mailadres, de
 * map-id, de bestand-id's (json) en het tijdstip van de laatste sync.
 * Niet in een env-var: dan moet er iemand een geheim plakken, en de sync
 * moet zijn bestand-id's zelf kunnen bijhouden.
 *
 * ── Geen SDK ─────────────────────────────────────────────────────────────
 * Drie REST-aanroepen (files.create met multipart, files.update, files.get),
 * en Google converteert HTML naar een Doc en CSV naar een Sheet. Geen Docs-
 * of Sheets-API, geen extra scope, geen extra pakket op Vercel Hobby.
 */

const crypto = require('crypto');
const _gcal = require('./_gcal');

const T_SETTINGS = 'tblGHCz8YGLf6mOr9';
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const LEADS_TABLE = 'tbliukTnDAbEDcZmt';
const MYSTARTUP_BASE = 'appjJW396QWRaNOVi';
const PIPELINE_TABLE = 'tblihBS81FqGUZoY1';
const GOALS_TABLE = 'tblAFVa64xoHmp942';

const SCOPE = ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'].join(' ');
const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const MAP_NAAM = 'Helvaro Admin';
const STATE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20000;

const MIME = Object.freeze({
  map:   'application/vnd.google-apps.folder',
  doc:   'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
});

class DriveFout extends Error {
  constructor(bericht, code) { super(bericht); this.name = 'DriveFout'; this.code = code || 'drive_fout'; }
}

function isConfigured() { return _gcal.isConfigured(); }

/* ── Airtable-instellingen ──────────────────────────────────────────────── */
function atKeys() {
  const token = process.env.API_AIRTABLE, baseId = process.env.BASE_AIRTABLE;
  if (!token || !baseId) throw new DriveFout('Airtable niet geconfigureerd.', 'geen_airtable');
  return { token, baseId };
}
async function atFetch(url, opts = {}) {
  const { token } = atKeys();
  return fetch(url, {
    ...opts,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
}
async function settingRecord(key) {
  const { baseId } = atKeys();
  const f = encodeURIComponent(`{key}="${String(key).replace(/"/g, '\\"')}"`);
  const r = await atFetch(`https://api.airtable.com/v0/${baseId}/${T_SETTINGS}?filterByFormula=${f}&maxRecords=1`);
  if (!r.ok) throw new DriveFout(`Airtable ${r.status} bij het lezen van admin_settings.`, 'lezen_mislukt');
  return ((await r.json()).records || [])[0] || null;
}
async function getSetting(key) {
  const rec = await settingRecord(key);
  return rec ? String((rec.fields && rec.fields.value) || '') : '';
}
async function setSetting(key, value) {
  const { baseId } = atKeys();
  const rec = await settingRecord(key);
  const fields = { key, value: String(value == null ? '' : value), updated_at: new Date().toISOString() };
  const r = rec
    ? await atFetch(`https://api.airtable.com/v0/${baseId}/${T_SETTINGS}/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ fields }) })
    : await atFetch(`https://api.airtable.com/v0/${baseId}/${T_SETTINGS}`, { method: 'POST', body: JSON.stringify({ fields }) });
  if (!r.ok) throw new DriveFout(`Airtable ${r.status} bij het schrijven van admin_settings.`, 'schrijven_mislukt');
}

/* ── OAuth ──────────────────────────────────────────────────────────────── */
function secret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY;
  if (!base) throw new DriveFout('SESSION_SECRET ontbreekt.', 'geen_secret');
  return crypto.createHmac('sha256', base).update('helvaro-drive-state-v1').digest('hex');
}
function signState() {
  const payload = Buffer.from(JSON.stringify({ t: Date.now(), n: crypto.randomBytes(6).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `drive.${payload}.${sig}`;
}
function isDriveState(state) { return String(state || '').startsWith('drive.'); }
function verifyState(state) {
  try {
    const [, payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return false;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    const a = Buffer.from(sig, 'base64url'), b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Boolean(data.t) && Date.now() - data.t < STATE_TTL_MS;
  } catch { return false; }
}
function authUrl() {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: signState(),
  });
  return `${OAUTH_AUTH}?${p.toString()}`;
}

/** Callback: code -> refresh-token, versleuteld opgeslagen. Geeft het e-mailadres. */
async function connect(code) {
  const { refreshToken, email } = await _gcal.exchangeCode(code);
  if (!refreshToken) throw new DriveFout('Google gaf geen refresh-token terug.', 'geen_refresh');
  await setSetting('drive_refresh_token', _gcal.encryptToken(refreshToken));
  await setSetting('drive_email', email || '');
  return email || '';
}

async function disconnect() {
  const enc = await getSetting('drive_refresh_token');
  if (enc) { try { await _gcal.revokeToken(_gcal.decryptToken(enc)); } catch (_) { /* intrekken is best-effort */ } }
  await setSetting('drive_refresh_token', '');
  await setSetting('drive_email', '');
  /* Map en bestanden blijven op Drive staan -- dat is van de beheerder, niet
     van ons. Alleen de id's vergeten we, zodat een nieuwe koppeling schoon
     begint. */
  await setSetting('drive_folder_id', '');
  await setSetting('drive_files', '');
}

async function accessToken() {
  const enc = await getSetting('drive_refresh_token');
  if (!enc) throw new DriveFout('Drive is niet gekoppeld.', 'niet_gekoppeld');
  const refresh = _gcal.decryptToken(enc);
  if (!refresh) throw new DriveFout('Het opgeslagen token is niet leesbaar; koppel opnieuw.', 'token_onleesbaar');
  const token = await _gcal.getAccessToken(refresh);
  if (!token) throw new DriveFout('Google gaf geen toegang (token verlopen?); koppel opnieuw.', 'token_verlopen');
  return token;
}

/* ── Drive REST ─────────────────────────────────────────────────────────── */
async function gapi(token, method, url, body, headers) {
  const r = await fetch(url, {
    method,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: Object.assign({ Authorization: `Bearer ${token}` }, headers || {}),
    body,
  });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new DriveFout(`Drive ${r.status}: ${(d.error && d.error.message) || 'onbekend'}`, r.status === 404 ? 'weg' : 'drive_fout');
    e.status = r.status;
    throw e;
  }
  return d;
}

function multipart(metadata, contentType, content) {
  const boundary = 'hv' + crypto.randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
    Buffer.from(content, 'utf8'),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return { body, headers: { 'Content-Type': `multipart/related; boundary=${boundary}` } };
}

async function bestaat(token, id) {
  if (!id) return false;
  try {
    const d = await gapi(token, 'GET', `${DRIVE}/files/${encodeURIComponent(id)}?fields=id,trashed`);
    return Boolean(d.id) && !d.trashed;
  } catch { return false; }
}

/* Alle niet-weggegooide bestanden met deze naam (en optioneel dit type of
   deze map). De scope drive.file laat alleen zien wat deze app zelf maakte,
   dus een gelijknamig bestand van de gebruiker zelf komt hier nooit in. */
async function zoek(token, naam, { mime, parent } = {}) {
  const q = [`name = '${String(naam).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, 'trashed = false'];
  if (mime) q.push(`mimeType = '${mime}'`);
  if (parent) q.push(`'${parent}' in parents`);
  const d = await gapi(token, 'GET', `${DRIVE}/files?q=${encodeURIComponent(q.join(' and '))}&orderBy=createdTime&fields=files(id,createdTime)&pageSize=50`);
  return (d.files || []).map((f) => f.id);
}

/* Naar de prullenbak, nooit definitief: daar staat het nog 30 dagen. */
async function prullenbak(token, id) {
  await gapi(token, 'PATCH', `${DRIVE}/files/${encodeURIComponent(id)}?fields=id`, JSON.stringify({ trashed: true }), { 'Content-Type': 'application/json' });
}

/* Twee synchronisaties die tegelijk liepen (2026-09-16, 22:25 en 22:26)
   zagen allebei een lege bestandenlijst en maakten alles dubbel aan. Vandaar:
   eerst zoeken op naam, dan pas maken -- en wat er dubbel staat gaat naar de
   prullenbak, het oudste exemplaar blijft. */
async function ontdubbel(token, naam, houd, { mime } = {}) {
  const ids = await zoek(token, naam, { mime });
  const weg = ids.filter((id) => id !== houd);
  for (const id of weg) { try { await prullenbak(token, id); } catch { /* volgende keer opnieuw */ } }
  return weg.length;
}

async function vindOfMaakMap(token, naam, parent) {
  const ids = await zoek(token, naam, { mime: MIME.map, parent: parent || 'root' });
  if (ids.length) return ids[0];
  return maakMap(token, naam, parent);
}

async function maakMap(token, naam, parent) {
  const meta = { name: naam, mimeType: MIME.map };
  if (parent) meta.parents = [parent];
  const d = await gapi(token, 'POST', `${DRIVE}/files?fields=id`, JSON.stringify(meta), { 'Content-Type': 'application/json' });
  return d.id;
}

/** Maakt of vernieuwt één document; geeft de bestand-id terug. */
async function upsert(token, { id, naam, googleMime, contentType, content, parent }) {
  const mp = multipart({ name: naam, mimeType: googleMime, parents: parent ? [parent] : undefined }, contentType, content);
  if (id && await bestaat(token, id)) {
    /* Bijwerken: metadata zonder parents (die mag je niet zomaar herzetten),
       wel de naam, zodat een hernoemde klant ook op Drive hernoemd wordt. */
    const mp2 = multipart({ name: naam, mimeType: googleMime }, contentType, content);
    const d = await gapi(token, 'PATCH', `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=multipart&fields=id`, mp2.body, mp2.headers);
    return d.id || id;
  }
  const bestaande = await zoek(token, naam, { mime: googleMime });
  if (bestaande.length) {
    const mp2 = multipart({ name: naam, mimeType: googleMime }, contentType, content);
    const d = await gapi(token, 'PATCH', `${UPLOAD}/files/${encodeURIComponent(bestaande[0])}?uploadType=multipart&fields=id`, mp2.body, mp2.headers);
    return d.id || bestaande[0];
  }
  const d = await gapi(token, 'POST', `${UPLOAD}/files?uploadType=multipart&fields=id`, mp.body, mp.headers);
  return d.id;
}

function docUrl(id) { return `https://docs.google.com/document/d/${id}/edit`; }
function sheetUrl(id) { return `https://docs.google.com/spreadsheets/d/${id}/edit`; }
function mapUrl(id) { return `https://drive.google.com/drive/folders/${id}`; }

/* ── Inhoud ─────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function csv(rijen) {
  return rijen.map((r) => r.map((v) => {
    const s = String(v == null ? '' : v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}
function eur(n) { return n == null || !Number.isFinite(Number(n)) ? '' : '€ ' + Number(n).toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function datum(iso) { return iso ? String(iso).slice(0, 10) : ''; }
function nu() { return new Date().toLocaleString('nl-BE', { timeZone: 'Europe/Brussels' }); }
function html(titel, body) {
  return `<html><head><meta charset="utf-8"><title>${esc(titel)}</title></head><body style="font-family:Arial,sans-serif;font-size:11pt">`
    + `<h1>${esc(titel)}</h1><p style="color:#777">Bijgewerkt door Helvaro op ${esc(nu())}. Dit document wordt automatisch overschreven; eigen notities hier gaan verloren.</p>`
    + body + '</body></html>';
}
function tabel(koppen, rijen) {
  return '<table border="1" cellpadding="4" style="border-collapse:collapse">'
    + '<tr>' + koppen.map((k) => `<th align="left">${esc(k)}</th>`).join('') + '</tr>'
    + rijen.map((r) => '<tr>' + r.map((v) => `<td>${esc(v)}</td>`).join('') + '</tr>').join('')
    + '</table>';
}

async function alleRijen(baseId, tabel, query) {
  const uit = [];
  let offset = '';
  for (let i = 0; i < 30; i++) {
    const r = await atFetch(`https://api.airtable.com/v0/${baseId}/${tabel}?${query}${offset ? '&offset=' + encodeURIComponent(offset) : ''}`);
    if (!r.ok) throw new DriveFout(`Airtable ${r.status} bij ${tabel}.`, 'lezen_mislukt');
    const d = await r.json();
    uit.push(...(d.records || []));
    if (!d.offset) break;
    offset = d.offset;
  }
  return uit;
}

/** Klanten + leadcijfers per klant, uit dezelfde velden als de Klanten-pagina. */
async function verzamelKlanten() {
  const { baseId } = atKeys();
  const _plan = require('./_plan');
  const _plans = require('./_plans');
  const klanten = (await alleRijen(baseId, CLIENTS_TABLE, 'pageSize=100'))
    .map((rec) => rec.fields || {})
    .filter((f) => f['Project Code']);
  /* Op veld-id, dezelfde ids als de Klanten-pagina in api/admin.js: die
     overleven een hernoeming in Airtable. */
  const L = { project: 'fldSmczuyUJd26HLe', staat: 'fld8mkrEWcyq7mUip', gekwal: 'fld0hAZJ5wgaXrNTn', afspraak: 'fldyIGNetqcSEkoaK', aangemaakt: 'fldR0r13EU4RwrtvH', naam: 'fldbk0LVNckOU0bqA', score: 'fldpzQgMuWJLjogiD' };
  const leads = await alleRijen(baseId, LEADS_TABLE,
    'pageSize=100&returnFieldsByFieldId=true&' + Object.values(L).map((id) => 'fields%5B%5D=' + id).join('&'));
  const perProject = {};
  for (const rec of leads) {
    const f = rec.fields || {};
    const p = String(f[L.project] || '');
    if (!p) continue;
    const s = perProject[p] || (perProject[p] = { totaal: 0, nieuw: 0, gekwalificeerd: 0, afspraken: 0, laatste: '', recent: [] });
    s.totaal++;
    if (f[L.staat] === 'new') s.nieuw++;
    if (f[L.gekwal] === true) s.gekwalificeerd++;
    if (f[L.afspraak] === true) s.afspraken++;
    const c = String(f[L.aangemaakt] || '');
    if (c > s.laatste) s.laatste = c;
    s.recent.push({ naam: f[L.naam] || '', datum: c, score: f[L.score] == null ? '' : f[L.score], staat: f[L.staat] || '', gekwalificeerd: f[L.gekwal] === true });
  }
  return klanten.map((f) => {
    const code = String(f['Project Code']);
    const staat = (() => { try { return _plan.getPlanState(f); } catch { return null; } })();
    const plan = (() => { try { return _plans.plan(f['Plan ID']); } catch { return null; } })();
    const st = perProject[code] || { totaal: 0, nieuw: 0, gekwalificeerd: 0, afspraken: 0, laatste: '', recent: [] };
    st.recent.sort((a, b) => (b.datum > a.datum ? 1 : -1));
    return {
      code,
      naam: f['Client Name'] || '',
      email: f['Email'] || f['Rapport Email'] || '',
      land: f['Country'] || '',
      taal: f['Language'] || '',
      sector: f['Sector'] || '',
      vertical: f['Vertical'] || '',
      plan: plan ? plan.naam : (f['Plan ID'] || ''),
      planStatus: staat ? staat.status : (f['Plan Status'] || ''),
      trialEindigt: datum(f['Trial Ends At']),
      aiNaam: f['AI Name'] || '',
      credits: f['Credit Allowance'] == null ? '' : f['Credit Allowance'],
      creditsGebruikt: f['Credits Used'] == null ? '' : f['Credits Used'],
      aangemaakt: datum(f['Created At'] || f['Created']),
      notities: f['Notes'] || '',
      stats: st,
    };
  });
}

async function verzamelKosten() {
  const _kosten = require('./_kosten');
  const o = await _kosten.overzicht({});
  return o;
}

async function verzamelFounder() {
  const { token } = atKeys();
  const h = { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  const uit = { pipeline: [], doelen: [] };
  try {
    const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${PIPELINE_TABLE}?pageSize=100`, h);
    if (r.ok) uit.pipeline = ((await r.json()).records || []).map((rec) => rec.fields || {});
  } catch (_) { /* pipeline is optioneel */ }
  try {
    const r = await fetch(`https://api.airtable.com/v0/${MYSTARTUP_BASE}/${GOALS_TABLE}?pageSize=100`, h);
    if (r.ok) uit.doelen = ((await r.json()).records || []).map((rec) => rec.fields || {});
  } catch (_) { /* doelen zijn optioneel */ }
  return uit;
}

function changelogHtml() {
  let md = '';
  try { md = require('fs').readFileSync(require('path').join(__dirname, '..', 'CHANGELOG.md'), 'utf8'); } catch { return '<p>Geen changelog gevonden.</p>'; }
  /* Alleen de eerste ~40 kopjes: dit is een leesdocument, geen archief. */
  const regels = md.split('\n');
  const uit = [];
  let koppen = 0;
  for (const r of regels) {
    if (/^## /.test(r)) { koppen++; if (koppen > 40) break; uit.push(`<h2>${esc(r.slice(3))}</h2>`); continue; }
    if (/^### /.test(r)) { uit.push(`<h3>${esc(r.slice(4))}</h3>`); continue; }
    if (/^# /.test(r)) continue;
    if (/^---/.test(r)) continue;
    if (/^- /.test(r)) { uit.push(`<li>${esc(r.slice(2))}</li>`); continue; }
    if (r.trim() === '') { uit.push('<p></p>'); continue; }
    uit.push(`<p>${esc(r).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>')}</p>`);
  }
  return uit.join('\n');
}

/* ── De sync ────────────────────────────────────────────────────────────── */
const SYNC_SLOT_MS = 10 * 60 * 1000;

async function sync() {
  /* Eén tegelijk. De knop op de Founder-pagina en de cron kunnen samenvallen;
     de tweede krijgt een nette melding in plaats van een dubbele set. */
  const slot = await getSetting('drive_sync_lock');
  if (slot && Date.now() - Date.parse(slot) < SYNC_SLOT_MS) {
    throw new DriveFout('Er loopt al een synchronisatie; probeer over een paar minuten opnieuw.', 'bezig');
  }
  await setSetting('drive_sync_lock', new Date().toISOString());
  try {
    return await syncBinnenSlot();
  } finally {
    try { await setSetting('drive_sync_lock', ''); } catch { /* verloopt vanzelf */ }
  }
}

async function syncBinnenSlot() {
  const token = await accessToken();
  let mapId = await getSetting('drive_folder_id');
  if (!(await bestaat(token, mapId))) {
    mapId = await vindOfMaakMap(token, MAP_NAAM);
    await setSetting('drive_folder_id', mapId);
  }
  let files = {};
  try { files = JSON.parse(await getSetting('drive_files') || '{}') || {}; } catch { files = {}; }
  const verslag = { bestanden: [], fouten: [], opgeruimd: 0 };
  const zet = async (sleutel, opties) => {
    try {
      const id = await upsert(token, Object.assign({ id: files[sleutel] }, opties));
      files[sleutel] = id;
      verslag.bestanden.push({ sleutel, naam: opties.naam, url: opties.googleMime === MIME.sheet ? sheetUrl(id) : docUrl(id) });
      try { verslag.opgeruimd += await ontdubbel(token, opties.naam, id, { mime: opties.googleMime }); } catch { /* cosmetisch */ }
    } catch (e) {
      verslag.fouten.push({ sleutel, naam: opties.naam, fout: e && e.message });
    }
  };

  /* 1. Klanten */
  let klanten = [];
  try { klanten = await verzamelKlanten(); } catch (e) { verslag.fouten.push({ sleutel: 'klanten', fout: e && e.message }); }
  if (klanten.length) {
    const rijen = [['Projectcode', 'Naam', 'E-mail', 'Land', 'Taal', 'Sector', 'Plan', 'Planstatus', 'Proef tot', 'Assistent', 'Credits', 'Credits gebruikt', 'Leads', 'Nieuw', 'Gekwalificeerd', 'Afspraken', 'Laatste lead', 'Klant sinds']];
    for (const k of klanten) {
      rijen.push([k.code, k.naam, k.email, k.land, k.taal, k.sector, k.plan, k.planStatus, k.trialEindigt, k.aiNaam, k.credits, k.creditsGebruikt,
        k.stats.totaal, k.stats.nieuw, k.stats.gekwalificeerd, k.stats.afspraken, datum(k.stats.laatste), k.aangemaakt]);
    }
    await zet('klanten', { naam: 'Helvaro — Klanten', googleMime: MIME.sheet, contentType: 'text/csv', content: csv(rijen), parent: mapId });

    /* Eén document per klant, in een submap. */
    let klantMap = files['_map_klanten'];
    if (!(await bestaat(token, klantMap))) {
      try { klantMap = await vindOfMaakMap(token, 'Klanten', mapId); files['_map_klanten'] = klantMap; }
      catch (e) { verslag.fouten.push({ sleutel: '_map_klanten', fout: e && e.message }); klantMap = mapId; }
    }
    for (const k of klanten) {
      const body =
        tabel(['Veld', 'Waarde'], [
          ['Projectcode', k.code], ['Naam', k.naam], ['E-mail', k.email], ['Land / taal', `${k.land} / ${k.taal}`],
          ['Sector', k.sector], ['Plan', `${k.plan} (${k.planStatus})`], ['Proefperiode tot', k.trialEindigt],
          ['Naam assistent', k.aiNaam], ['Credits', `${k.creditsGebruikt || 0} van ${k.credits || '-'}`], ['Klant sinds', k.aangemaakt],
        ])
        + '<h2>Leads</h2>'
        + tabel(['Totaal', 'Nieuw', 'Gekwalificeerd', 'Afspraken', 'Laatste lead'],
          [[k.stats.totaal, k.stats.nieuw, k.stats.gekwalificeerd, k.stats.afspraken, datum(k.stats.laatste)]])
        + '<h3>Laatste 25 leads</h3>'
        + tabel(['Datum', 'Naam', 'Score', 'Staat', 'Gekwalificeerd'],
          k.stats.recent.slice(0, 25).map((l) => [datum(l.datum), l.naam, l.score, l.staat, l.gekwalificeerd ? 'ja' : '']))
        + (k.notities ? `<h2>Notities</h2><p>${esc(k.notities).replace(/\n/g, '<br>')}</p>` : '');
      await zet('klant:' + k.code, {
        naam: `${k.naam || k.code} (${k.code})`, googleMime: MIME.doc, contentType: 'text/html',
        content: html(`Klant — ${k.naam || k.code}`, body), parent: klantMap,
      });
    }
  }

  /* 2. Kosten */
  try {
    const o = await verzamelKosten();
    const regels = o.diensten || [];
    const rijen = [['Dienst', 'Leverancier', 'Soort', 'Waarvoor', 'Aan', 'Bedrag', 'Valuta', 'Interval', 'Aantal', 'Per maand', 'Gestart', 'Uitgegeven tot nu', 'Bron']];
    for (const r of regels) {
      rijen.push([r.naam, r.leverancier, r.soort, r.waarvoor, r.aan ? 'ja' : 'nee', r.bedrag == null ? '' : r.bedrag, r.valuta || '', r.interval || '', r.aantal || '',
        r.perMaand == null ? '' : r.perMaand, datum(r.gestart), r.uitgegeven == null ? '' : r.uitgegeven, typeof r.bron === 'string' ? r.bron : (r.bedrag == null ? 'nog invullen' : 'lijstprijs')]);
    }
    rijen.push([]);
    const munt = (obj) => Object.entries((obj && obj.perMunt) || {}).map(([m, v]) => `${m} ${v}`).join(' · ');
    rijen.push(['Vaste kosten per maand', '', '', munt(o.vastPerMaand), '', o.vastPerMaand && o.vastPerMaand.inEur != null ? o.vastPerMaand.inEur : '', 'EUR']);
    rijen.push(['Verbruik per maand', '', '', munt(o.verbruikPerMaand), '', o.verbruikPerMaand && o.verbruikPerMaand.inEur != null ? o.verbruikPerMaand.inEur : '', 'EUR']);
    rijen.push(['Uitgegeven tot nu', '', '', munt(o.uitgegeven), '', o.uitgegeven && o.uitgegeven.inEur != null ? o.uitgegeven.inEur : '', 'EUR']);
    if (o.nettoPerMaandEur != null) rijen.push(['Netto per maand', '', '', '', '', o.nettoPerMaandEur, 'EUR']);
    await zet('kosten', { naam: 'Helvaro — Kosten', googleMime: MIME.sheet, contentType: 'text/csv', content: csv(rijen), parent: mapId });
  } catch (e) { verslag.fouten.push({ sleutel: 'kosten', fout: e && e.message }); }

  /* 3. Founder */
  try {
    const f = await verzamelFounder();
    const betalend = klanten.filter((k) => k.planStatus === 'active').length;
    const body =
      '<h2>Stand</h2>' + tabel(['Klanten', 'Betalend', 'Leads totaal'], [[klanten.length, betalend, klanten.reduce((s, k) => s + k.stats.totaal, 0)]])
      + '<h2>Doelen</h2>' + tabel(['Doel', 'Target', 'Eenheid', 'Deadline', 'Actief'], f.doelen.map((d) => [d['Doel'], d['Target'], d['Eenheid'], datum(d['Deadline']), d['Actief'] ? 'ja' : '']))
      + '<h2>Sales-pipeline</h2>' + tabel(['Naam', 'Bedrijf', 'E-mail', 'Fase', 'Aangemaakt', 'Notities'], f.pipeline.map((p) => [p['Naam'], p['Bedrijf'], p['Email'], p['Fase'], datum(p['Aangemaakt']), p['Notities']]));
    await zet('founder', { naam: 'Helvaro — Founder', googleMime: MIME.doc, contentType: 'text/html', content: html('Helvaro — Founder', body), parent: mapId });
  } catch (e) { verslag.fouten.push({ sleutel: 'founder', fout: e && e.message }); }

  /* 4. Changelog */
  await zet('changelog', { naam: 'Helvaro — Changelog', googleMime: MIME.doc, contentType: 'text/html', content: html('Helvaro — Changelog', changelogHtml()), parent: mapId });

  /* Dubbele submappen 'Klanten': wat erin staat verhuist naar de echte map,
     de lege dubbele gaat naar de prullenbak. */
  try {
    const echt = files['_map_klanten'];
    for (const id of await zoek(token, 'Klanten', { mime: MIME.map, parent: mapId })) {
      if (!echt || id === echt) continue;
      const inhoud = await gapi(token, 'GET', `${DRIVE}/files?q=${encodeURIComponent(`'${id}' in parents and trashed = false`)}&fields=files(id)&pageSize=100`);
      for (const f of inhoud.files || []) {
        await gapi(token, 'PATCH', `${DRIVE}/files/${encodeURIComponent(f.id)}?addParents=${encodeURIComponent(echt)}&removeParents=${encodeURIComponent(id)}&fields=id`, '{}', { 'Content-Type': 'application/json' });
      }
      await prullenbak(token, id); verslag.opgeruimd++;
    }
  } catch { /* cosmetisch */ }

  await setSetting('drive_files', JSON.stringify(files));
  await setSetting('drive_last_sync', new Date().toISOString());
  verslag.map = mapUrl(mapId);
  return verslag;
}

/*
 * "gekoppeld" zegt alleen dat er ooit een token is opgeslagen -- niet dat het
 * nog werkt. Zelfde les als api/leads.js gcal-status (mode 'status', zie de
 * uitgebreide opmerking daar): Google laat een verversingstoken na zeven
 * dagen verlopen zolang het toestemmingsscherm op "Testing" staat, en zonder
 * een echte poging bleef dit scherm "gekoppeld" tonen terwijl elke sync al
 * dagen stil faalde. Daarom hier dezelfde aanpak: één keer echt proberen als
 * er iets gekoppeld staat. Dit endpoint wordt zelden geopend (admin-only), dus
 * de extra aanroep naar Google is geen kostenprobleem.
 */
async function status() {
  const configured = isConfigured();
  const email = configured ? await getSetting('drive_email') : '';
  const gekoppeld = Boolean(email) && Boolean(await getSetting('drive_refresh_token'));

  let verbonden = null;      // null = niet gecontroleerd (niet gekoppeld, dus n.v.t.)
  let laatsteFoutCode = '';
  if (gekoppeld) {
    try {
      await accessToken();
      verbonden = true;
    } catch (e) {
      verbonden = false;
      laatsteFoutCode = (e && e.code) || 'onbekend';
    }
  }

  let files = {};
  try { files = JSON.parse(await getSetting('drive_files') || '{}') || {}; } catch { files = {}; }
  const mapId = await getSetting('drive_folder_id');
  const bestanden = Object.entries(files)
    .filter(([k]) => !k.startsWith('_map'))
    .map(([k, id]) => ({ sleutel: k, url: k === 'klanten' || k === 'kosten' ? sheetUrl(id) : docUrl(id) }));
  return {
    configured, gekoppeld, email,
    verbonden, laatsteFoutCode,
    map: mapId ? mapUrl(mapId) : '',
    bestanden,
    laatsteSync: await getSetting('drive_last_sync'),
  };
}

module.exports = { isConfigured, authUrl, isDriveState, verifyState, connect, disconnect, sync, status, DriveFout };
