'use strict';
/*
 * Thin client for the Helvaro VPS data API (Postgres behind an Airtable-shaped
 * facade).
 *
 * ── LEES DIT EERST (2026-08-19) ─────────────────────────────────────────────
 * DE VPS IS VERNIETIGD. Hij heeft bestaan; de eigenaar heeft de machine
 * opgeheven. Deze module praat dus met een adres waar niets meer staat, en dat
 * heeft twee soorten gevolgen: dingen die niet meer werken, en één ding dat
 * gevaarlijk is zolang de omgevingsvariabelen nog gezet staan.
 *
 * ── GEVAARLIJK: haal PG_API_URL, PG_API_TOKEN en PG_API_INSECURE uit Vercel ──
 * PG_API_URL wees naar een kaal IP-adres (167.172.164.4). IP-adressen van
 * opgeheven servers worden door de provider opnieuw uitgedeeld. Staat de
 * variabele er nog, dan stuurt Helvaro PG_API_TOKEN als bearer naar wie dat
 * adres nu ook heeft — en met PG_API_INSECURE=1 staat certificaatcontrole uit,
 * dus er is niets dat merkt dat het een andere machine is.
 *
 * Weghalen is de fix. Deze module valt dan netjes stil in plaats van een
 * geheim naar een vreemde te sturen.
 *
 * ── Wat er kapot is ─────────────────────────────────────────────────────────
 *
 *   • Elke pgFetch() gooit "PG_API_URL/PG_API_TOKEN not configured". Elke
 *     aanroeper vangt dat netjes af en geeft een leeg resultaat terug, dus het
 *     lijkt overal alsof er simpelweg geen data is.
 *   • De marketingpijplijn in api/admin.js (list-content, update-content,
 *     generate-image, social-health, personal) schrijft en leest hier. Die
 *     schrijft dus niets weg en leest niets terug.
 *   • api/cron-followup.js's kop zegt dat social posting is verhuisd naar een
 *     VPS-dienst "Herald", en STRIP-HERALD-SUMMARY.md beschrijft hoe 438
 *     regels posting-code uit Vercel zijn GESLOOPT omdat Herald het zou
 *     overnemen. Zonder VPS post er dus helemaal niets.
 *
 * ── Wat er met de machine verdwenen is ──────────────────────────────────────
 * Marketing Posts en Outreach stonden er wél op: die records zijn weg en staan
 * nergens anders. Appointments NIET — ondanks wat de kop hieronder beweert
 * praten api/whatsapp.js, api/cron-followup.js en api/leads.js daarvoor
 * rechtstreeks met Airtable (tblD058vEITs1xYFc). Afspraken zijn dus veilig; de
 * bewering dat drie tabellen "van Airtable af zijn" gold er maar voor twee.
 *
 * Deze module blijft staan omdat api/admin.js hem nog aanroept en netjes
 * faalt. Bouw er niets nieuws op zonder eerst te controleren of PG_API_URL
 * echt gezet is — configured() hieronder is daarvoor.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Oorspronkelijke bedoeling, ter referentie: gebruikt voor de drie tabellen
 * die van Airtable af zouden gaan (Marketing Posts, Outreach, Appointments).
 * Everything else (Leads, Client Config, Niche Config, Users) stays in Airtable.
 *
 * The facade speaks the same dialect the code already used for these tables, so
 * callers keep the exact same request/response shapes:
 *   pgFetch(`${TABLE}?filterByFormula=...&sort[0][field]=...&pageSize=...`)
 *   pgFetch(`${TABLE}/${id}`)
 *   pgFetch(`${TABLE}`,        { method:'POST',  body: JSON.stringify({ fields }) })
 *   pgFetch(`${TABLE}/${id}`,  { method:'PATCH', body: JSON.stringify({ fields }) })
 * Response JSON matches Airtable: { records:[{id,fields}] } / { id, fields } / { error }.
 *
 * Required Vercel env vars (set these before deploying this branch):
 *   PG_API_URL      e.g. https://167.172.164.4  (or https://db.helvaro.pro once DNS is set)
 *   PG_API_TOKEN    bearer secret shared with the VPS
 *   PG_API_INSECURE '1' while the VPS uses a self-signed cert (IP-only). Remove
 *                   once a real domain + Let's Encrypt cert is in place.
 */
const PG_API_URL   = (process.env.PG_API_URL || '').replace(/\/$/, '');
const PG_API_TOKEN = process.env.PG_API_TOKEN || '';
const INSECURE     = String(process.env.PG_API_INSECURE || '') === '1';

let dispatcher;
if (INSECURE) {
  console.warn('[pgapi] PG_API_INSECURE=1 — TLS-certificaten worden NIET gecontroleerd. ' +
               'Dit hoorde tijdelijk te zijn zolang de VPS een zelfondertekend certificaat had. ' +
               'Die VPS bestaat niet meer: haal deze variabele weg.');
  try {
    const { Agent } = require('undici');
    dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  } catch (_) { /* undici unavailable: relies on a valid cert instead */ }
}

/** Of er überhaupt een backend geconfigureerd is. Bestond niet, waardoor elke
 *  aanroeper hetzelfde moest raden uit een exception. */
function configured() {
  return Boolean(PG_API_URL && PG_API_TOKEN);
}

let _warnedUnconfigured = false;

/* Tien seconden, want een adres zonder machine antwoordt niet met een fout maar
   met stilte. Zonder deze grens wachtte elke aanroep op het TCP-timeout van het
   platform; api/cron-followup.js mag 300 seconden draaien en acht aanroepen in
   api/admin.js zitten in serie. Eén opgeheven server kon zo een hele functie
   opeten in plaats van meteen te falen. */
const PG_TIMEOUT_MS = 10000;

async function pgFetch(pathAndQuery, options = {}) {
  if (!configured()) {
    // Eén luide regel per instance in plaats van een stille exception die
    // acht keer in een try/catch verdwijnt. Dit is precies hoe een hele
    // marketingpijplijn maandenlang "leeg" kon lijken in plaats van "kapot".
    if (!_warnedUnconfigured) {
      _warnedUnconfigured = true;
      console.error('[pgapi] PG_API_URL/PG_API_TOKEN niet gezet — er is geen database achter deze module. ' +
                    'Alles wat hierop leunt (marketingposts, outreach, social-health) doet niets. Zie de kop van api/_pgapi.js.');
    }
    throw new Error('PG_API_URL/PG_API_TOKEN not configured');
  }
  const url = `${PG_API_URL}/v0/${pathAndQuery}`;
  const headers = Object.assign({ Authorization: `Bearer ${PG_API_TOKEN}` }, options.headers || {});
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const opts = Object.assign({}, options, { headers });
  if (dispatcher) opts.dispatcher = dispatcher;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PG_TIMEOUT_MS);
  opts.signal = ctrl.signal;
  try {
    return await fetch(url, opts);
  } finally {
    clearTimeout(timer);
  }
}

const PG_TABLES = {
  MARKETING:    'tblPxnfb5MThgsnaA',
  OUTREACH:     'tbl2LpuY9bj3I4pqS',
  APPOINTMENTS: 'tblD058vEITs1xYFc',
};

module.exports = { pgFetch, PG_TABLES, configured };
