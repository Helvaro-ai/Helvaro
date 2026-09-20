'use strict';
/* ── Het WhatsApp-token van een klant met een eigen nummer ─────────────────
   Embedded Signup levert per klant een 'business integration system user
   access token' op (verloopt niet). Dat token hoort bij de WABA van de
   KLANT, en het is het enige waarmee Helvaro op dat nummer mag zenden: het
   gedeelde WHATSAPP_TOKEN is van Helvaro's eigen portfolio en kent de WABA
   van de klant niet, tenzij Meta de systeemgebruiker erop zet (dat proberen
   we ook, zie _waes.koppelSysteemgebruiker, maar daar rekenen we niet op).

   Tot 2026-09-20 gooide wa-es-complete dit token weg. Een klant kon dan wel
   koppelen, maar elk bericht vanaf zijn nummer liep op een permissiefout.

   Opslag: versleuteld (AES-256-GCM, sleutel afgeleid van SESSION_SECRET) in
   Client Config "WhatsApp Token" (fldxF2PEFmNCEspr8). Lezen gaat per
   phone_number_id, lui en gecachet: de eerste verzending vanaf een eigen
   nummer kost één Airtable-lookup, daarna tien minuten niets. */

const crypto = require('crypto');

const BASE_ID       = process.env.BASE_AIRTABLE;
const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const F_TOKEN = 'fldxF2PEFmNCEspr8';
const F_PNID  = 'fldbrhlSrsmlJwcYr';
const CACHE_MS = 10 * 60 * 1000;
const PREFIX = 'wa1.';

const _cache = new Map(); // pnid -> { token, ts }

function sleutel() {
  const basis = process.env.SESSION_SECRET || process.env.ADMIN_KEY || '';
  if (!basis) throw new Error('SESSION_SECRET ontbreekt: kan WhatsApp-token niet versleutelen');
  return crypto.createHash('sha256').update('helvaro-wa-token-v1:' + basis).digest();
}

function versleutel(token) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', sleutel(), iv);
  const enc = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64url');
}

function ontsleutel(blob) {
  const s = String(blob || '');
  if (!s.startsWith(PREFIX)) return '';
  try {
    const buf = Buffer.from(s.slice(PREFIX.length), 'base64url');
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = crypto.createDecipheriv('aes-256-gcm', sleutel(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch (e) {
    console.error('[wa-token] ontsleutelen mislukt:', e && e.message);
    return '';
  }
}

/** Direct na het koppelen: niet wachten tot de cache het ophaalt. */
function onthoud(phoneNumberId, token) {
  if (phoneNumberId && token) _cache.set(String(phoneNumberId), { token, ts: Date.now() });
}
function vergeet(phoneNumberId) { _cache.delete(String(phoneNumberId)); }

/** Het token voor dit nummer, of '' als het een gedeeld/onbekend nummer is. */
async function voorNummer(phoneNumberId) {
  const pnid = String(phoneNumberId || '').trim();
  if (!pnid) return '';
  const hit = _cache.get(pnid);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.token;
  if (!BASE_ID || !AIRTABLE_TOKEN) return '';
  let token = '';
  try {
    const formula = encodeURIComponent(`{${F_PNID}}="${pnid.replace(/"/g, '')}"`);
    const r = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1&fields[]=${F_TOKEN}&returnFieldsByFieldId=true`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, signal: AbortSignal.timeout(5000) }
    );
    const d = await r.json().catch(() => ({}));
    const rec = (d.records || [])[0];
    token = rec ? ontsleutel(rec.fields[F_TOKEN]) : '';
  } catch (e) {
    console.warn('[wa-token] lookup mislukt voor nummer', pnid, '-', e && e.message);
    return hit ? hit.token : '';
  }
  _cache.set(pnid, { token, ts: Date.now() });
  return token;
}

module.exports = { versleutel, ontsleutel, onthoud, vergeet, voorNummer, F_TOKEN, F_PNID };
