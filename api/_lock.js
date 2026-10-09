'use strict';
/*
 * Sloten over alle instanties heen (audit L-1).
 *
 * Airtable kent geen transacties en geen unieke sleutels. Wat binnen één
 * Vercel-instantie al veilig was (een Map, een rij per lead), was dat niet
 * zodra twee instanties hetzelfde deden: twee bezorgingen van één WhatsApp-
 * bericht, of twee klanten die op dezelfde seconde hetzelfde uur boeken.
 *
 * Dit gebruikt dezelfde Upstash-REST-verbinding als api/_ratelimit.js.
 *
 * ── Faalt open, bewust ────────────────────────────────────────────────────────
 * Zonder Upstash, of als Upstash niet antwoordt, doet dit NIETS en gaat alles
 * zoals voorheen (de bestaande controles per instantie en in Airtable blijven
 * staan). Een slot dat bij een Redis-storing boekingen of klantberichten
 * tegenhoudt, is erger dan het randgeval dat het oplost.
 *
 * Twee vormen:
 *   eenmalig(sleutel, ttlMs)      -> true als dit de eerste is, false als een
 *                                   andere instantie hem al had
 *   metSlot(sleutel, ttlMs, fn)   -> voert fn uit terwijl het slot vastligt;
 *                                   { bezet: true } als het na een paar korte
 *                                   pogingen nog steeds vastligt
 */

const crypto = require('crypto');
const rl = require('./_ratelimit');

const TIMEOUT_MS = 1200;
const VRIJGEEF_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

function klaar() {
  return rl.configured();
}

async function pijplijn(commando) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${rl.restBase()}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([commando]),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('upstash ' + r.status);
    const out = await r.json();
    if (!Array.isArray(out) || !out[0]) throw new Error('onverwacht antwoord');
    if (out[0].error) throw new Error(String(out[0].error));
    return out[0].result;
  } finally {
    clearTimeout(t);
  }
}

function volledig(sleutel) {
  return 'hv:lock:' + String(sleutel).slice(0, 200);
}

/** SET NX PX. 'ok' = genomen, 'bezet' = had een ander al, 'onbekend' = geen Redis of storing. */
async function neem(sleutel, ttlMs, waarde) {
  if (!klaar()) return 'onbekend';
  try {
    const res = await pijplijn(['SET', volledig(sleutel), waarde, 'NX', 'PX', String(Math.max(1000, Math.round(ttlMs)))]);
    return res === 'OK' ? 'ok' : 'bezet';
  } catch (e) {
    console.warn('[lock] Upstash niet bruikbaar, verder zonder gedeeld slot:', rl.veiligeMelding(e));
    return 'onbekend';
  }
}

async function eenmalig(sleutel, ttlMs) {
  const uit = await neem(sleutel, ttlMs, '1');
  return uit !== 'bezet';
}

/* Een eenmalig()-claim weer loslaten, bv. als de verwerking mislukte en een
   herbezorging het opnieuw moet mogen proberen. Stil bij een storing. */
async function vergeet(sleutel) {
  if (!klaar()) return;
  await pijplijn(['DEL', volledig(sleutel)]).catch(() => {});
}

async function metSlot(sleutel, ttlMs, fn, opties = {}) {
  const pogingen = opties.pogingen == null ? 4 : opties.pogingen;
  const pauze = opties.pauzeMs == null ? 250 : opties.pauzeMs;
  const waarde = crypto.randomBytes(12).toString('hex');
  let uit = await neem(sleutel, ttlMs, waarde);
  for (let i = 1; uit === 'bezet' && i < pogingen; i++) {
    await new Promise((r) => setTimeout(r, pauze * i));
    uit = await neem(sleutel, ttlMs, waarde);
  }
  if (uit === 'bezet') return { bezet: true };
  try {
    return { bezet: false, resultaat: await fn() };
  } finally {
    if (uit === 'ok') {
      /* Alleen ons eigen slot vrijgeven: is de TTL verlopen en heeft een
         ander het intussen, dan blijft dat van hem. */
      const vrij = pijplijn(['EVAL', VRIJGEEF_SCRIPT, '1', volledig(sleutel), waarde]).catch(() => {});
      /* Een lang slot (de voorraadsync, minuten) mag niet blijven liggen omdat
         de lambda bevroor voor het vrijgeefverzoek weg was: dan mag de aanroeper
         erop wachten. Standaard niet: korte sloten hoeven dat niet. */
      if (opties.wachtOpVrijgave) await vrij;
    }
  }
}

/* Een tijdslot kort claimen, over alle boekingspaden heen (website, WhatsApp,
   dashboard). De vrij-controle van elk pad leest Airtable; twee paden die in
   dezelfde seconde controleren zien allebei "vrij". De claim ligt vast tot de
   eerste boeking in Airtable staat -- daarna ziet elke controle haar gewoon.
   Mislukt het aanmaken, dan geeft los() hem meteen weer vrij.
   Geeft { genomen, los }; genomen is true bij 'ok' en bij 'onbekend' (geen
   Redis): dan blijft alles zoals voorheen. */
async function claim(sleutel, ttlMs, eigenaar) {
  const wie = String(eigenaar || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const waarde = (wie ? wie + ':' : '') + crypto.randomBytes(12).toString('hex');
  const uit = await neem(sleutel, ttlMs, waarde);
  /* Dezelfde lead die twee keer klikt, of een WhatsApp-herbezorging voor
     dezelfde lead, is geen concurrent: die laten we door, zodat de gewone
     "al geboekt"-logica verderop hem afhandelt. */
  if (uit === 'bezet' && wie) {
    const houder = await pijplijn(['GET', volledig(sleutel)]).catch(() => null);
    if (typeof houder === 'string' && houder.indexOf(wie + ':') === 0) {
      return { genomen: true, los: async () => {} };
    }
  }
  return {
    genomen: uit !== 'bezet',
    los: async () => {
      if (uit !== 'ok') return;
      await pijplijn(['EVAL', VRIJGEEF_SCRIPT, '1', volledig(sleutel), waarde]).catch(() => {});
    },
  };
}

function slotSleutel(projectCode, startISO) {
  const ms = Date.parse(startISO);
  return 'slot:' + String(projectCode || '').trim() + ':' + (Number.isFinite(ms) ? new Date(ms).toISOString() : String(startISO));
}

const SLOT_CLAIM_MS = 60 * 1000;

module.exports = { eenmalig, vergeet, metSlot, claim, slotSleutel, SLOT_CLAIM_MS, _test: { neem, volledig } };
