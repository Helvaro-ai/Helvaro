'use strict';
/*
 * Wat het afhandelen van leads Helvaro WERKELIJK kost -- WhatsApp, AI en
 * infrastructuur apart, per dealer, per maand en per dag.
 *
 * ── Waarom niet api/_ai/usage.js ─────────────────────────────────────────────
 * Die telt in het geheugen van één Vercel-instantie: bij elke koude start
 * begint de teller opnieuw en twee instanties zien elkaar niet. Voor "wat
 * kostte deze dealer deze maand" is dat onbruikbaar. Dit boekt in Upstash met
 * HINCRBY (atomair, geen race zoals bij Airtable) en houdt daarnaast een
 * geheugenkopie, zodat het zonder Redis nog steeds iets zegt per instantie.
 * Faalt open: een storing in de boekhouding stopt nooit een bericht.
 *
 * ── Drie soorten getallen, nooit door elkaar ─────────────────────────────────
 *   geschat      tarief x aantal, op het moment van verzenden
 *   bevestigd    Meta's eigen statuswebhook zegt of een bericht betaald was
 *                (pricing.billable). Dat WINT zodra het er is.
 *   onbekend     geen tarief ingesteld = GEEN bedrag. Nul zou liegen.
 * Meta stuurt in de webhook geen eurobedrag, alleen of en in welke categorie
 * een bericht betaald is. Het eurobedrag blijft dus categorietarief x aantal,
 * maar het AANTAL betaalde berichten is wel de echte telling.
 *
 * ── Geld in hele micro-euro's ────────────────────────────────────────────────
 * HINCRBY kent alleen gehele getallen. 0,04 euro = 40.000 micro-euro. Geen
 * kommagetallen die in de optelling afdrijven.
 *
 * ── Geen wisselkoers uit de lucht ────────────────────────────────────────────
 * AI wordt in dollar gefactureerd, WhatsApp in euro. Samentellen kan alleen als
 * KOSTEN_USD_EUR gezet is (dezelfde instelling als api/_kosten.js). Anders
 * staan ze naast elkaar en is er GEEN totaal.
 */

const rl = require('./_ratelimit');
const _registry = require('./_ai/registry');

const MIKRO = 1e6;
const TTL_MAAND_S = 400 * 24 * 3600;   // ruim een jaar
const TTL_DAG_S   = 120 * 24 * 3600;
const TTL_BERICHT_S = 7 * 24 * 3600;
const TIMEOUT_MS = 1500;

/* ── Tarieven ─────────────────────────────────────────────────────────────── */

/* Meta rekent sinds 2025 per bericht, niet meer per gesprek, en het tarief
   hangt af van het land van de ontvanger. Wat hier staat zijn de bestaande
   schattingen uit api/_ai/registry.js; zet WA_RATE_<CATEGORIE>_EUR om het met
   het tarief van je eigen factuur te overschrijven. */
function tarief(categorie) {
  const cat = String(categorie || '').toLowerCase();
  const sleutel = 'WA_RATE_' + cat.toUpperCase() + '_EUR';
  const env = process.env[sleutel];
  if (env !== undefined && env !== '' && Number.isFinite(Number(env))) return Number(env);
  return _registry.waKostenEur(cat);   // null als de categorie niet bestaat
}

const eur = (mikro) => Math.round(mikro) / MIKRO;
const mikroVan = (euro) => (Number.isFinite(euro) ? Math.round(euro * MIKRO) : 0);

/* ── Wat Meta in een statusbericht zegt over de factuur ───────────────────── */

const VRIJE_CATEGORIEEN = new Set(['service', 'free_customer_service', 'free_entry_point', 'referral_conversion']);

/**
 * Een statusobject van Meta ({id, status, recipient_id, pricing:{billable,
 * pricing_model, category, type}}) omzetten naar een vast formaat.
 * `bekend` = Meta zei iets over de factuur; zonder dat blijft het een schatting.
 */
function normaliseerStatus(s) {
  const p = (s && s.pricing) || {};
  const bekend = typeof p.billable === 'boolean';
  const categorie = String(p.category || '').toLowerCase() || null;
  const type = String(p.type || '').toLowerCase() || null;
  const gratisType = !!(type && type.indexOf('free') === 0);
  const billable = bekend && p.billable === true && !gratisType && !VRIJE_CATEGORIEEN.has(categorie);
  return {
    id: (s && s.id) || null,
    status: (s && s.status) || null,
    ontvanger: (s && s.recipient_id) || null,
    bekend, billable,
    categorie: categorie && categorie.indexOf('authentication') === 0 ? 'authentication' : categorie,
    model: p.pricing_model || null,
    type,
    ts: (s && Number(s.timestamp) * 1000) || null,
  };
}

/* ── Opslag: Redis + geheugenkopie ────────────────────────────────────────── */

const _geheugen = new Map();   // sleutel -> { veld: getal }
const _berichten = new Map();  // berichtId -> index
const MAX_GEHEUGEN = 4000;

function geheugenAf(sleutel) {
  if (!_geheugen.has(sleutel)) {
    if (_geheugen.size >= MAX_GEHEUGEN) _geheugen.delete(_geheugen.keys().next().value);
    _geheugen.set(sleutel, {});
  }
  return _geheugen.get(sleutel);
}

function redisKlaar() { return rl.configured(); }

async function redis(commando) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${rl.restBase()}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commando),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('upstash ' + r.status);
    const out = await r.json();
    if (!Array.isArray(out)) throw new Error('onverwacht antwoord');
    return out.map((o) => (o && o.error ? (() => { throw new Error(String(o.error)); })() : o && o.result));
  } finally {
    clearTimeout(t);
  }
}

const maandSleutel = (tenant, nu) => `hv:wa:m:${tenant}:${new Date(nu).toISOString().slice(0, 7)}`;
const dagSleutel   = (tenant, nu) => `hv:wa:d:${tenant}:${new Date(nu).toISOString().slice(0, 10)}`;
const veilig = (t) => String(t || '').trim().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || '_onbekend';

/**
 * Tellers ophogen. `delta` = { veld: geheel getal }. Schrijft maand en dag.
 * Faalt nooit: de boekhouding mag een bericht niet tegenhouden.
 */
async function tel(tenant, delta, nu = Date.now()) {
  try {
    const t = veilig(tenant);
    const velden = Object.entries(delta || {}).filter(([, v]) => Number.isFinite(v) && v !== 0);
    if (!velden.length) return;
    const sleutels = [[maandSleutel(t, nu), TTL_MAAND_S], [dagSleutel(t, nu), TTL_DAG_S]];
    for (const [sleutel] of sleutels) {
      const g = geheugenAf(sleutel);
      for (const [k, v] of velden) g[k] = (g[k] || 0) + Math.round(v);
    }
    if (!redisKlaar()) return;
    const cmd = [];
    for (const [sleutel, ttl] of sleutels) {
      for (const [k, v] of velden) cmd.push(['HINCRBY', sleutel, k, String(Math.round(v))]);
      cmd.push(['EXPIRE', sleutel, String(ttl)]);
    }
    await redis(cmd);
  } catch (err) {
    console.warn('[wa-kosten] boeken mislukt (bericht is wel gegaan):', err && err.message);
  }
}

/* ── Boeken: de vier gebeurtenissen ───────────────────────────────────────── */

/** Een bericht van de klant. `nieuwGesprek` = eerste bericht van een nieuwe lead. */
async function boekInkomend(tenant, { nieuwGesprek = false, klantStartte = true, nu } = {}) {
  return tel(tenant, {
    in: 1,
    ...(nieuwGesprek ? { conv: 1, ...(klantStartte ? { conv_klant: 1 } : {}) } : {}),
  }, nu);
}

/**
 * Een uitgaand bericht, op het moment van verzenden.
 * @param {string} o.soort  'service' (vrij bericht) | 'template'
 * @param {string} o.categorie  voor templates: 'utility' | 'marketing' | 'authentication'
 * @param {boolean} o.vensterOpen  stond het servicevenster open toen we verzonden
 */
async function boekUitgaand(tenant, o = {}) {
  const sjabloon = o.soort === 'template';
  const cat = sjabloon ? String(o.categorie || 'utility').toLowerCase() : 'service';
  // Een vrij bericht binnen het venster is gratis. Een utility-sjabloon BINNEN
  // een open venster ook (Meta rekent die dan niet) -- daarom weegt vensterOpen mee.
  const verwachtBetaald = sjabloon && !(cat === 'utility' && o.vensterOpen === true);
  const t = sjabloon ? tarief(cat) : 0;
  const geschat = verwachtBetaald && t !== null ? mikroVan(t) : 0;
  const delta = {
    uit: 1,
    [verwachtBetaald ? 'uit_bill' : 'uit_vrij']: 1,
    ...(sjabloon ? { tpl: 1, ['tpl_' + cat]: 1 } : {}),
    est_u: geschat,
  };
  if (verwachtBetaald && t === null) delta.tarief_onbekend = 1;
  await tel(tenant, delta, o.nu);
  // Index voor de statuswebhook: die kent het bericht-id, niet de tenant.
  if (o.berichtId) await onthoudBericht(o.berichtId, { t: veilig(tenant), c: cat, w: o.vensterOpen === true ? 1 : 0, e: geschat, b: verwachtBetaald ? 1 : 0, ts: o.nu || Date.now() });
}

async function onthoudBericht(id, index) {
  _berichten.set(id, index);
  if (_berichten.size > 5000) _berichten.delete(_berichten.keys().next().value);
  if (!redisKlaar()) return;
  try { await redis([['SET', 'hv:wa:msg:' + id, JSON.stringify(index), 'EX', String(TTL_BERICHT_S)]]); }
  catch (e) { /* de statusboeking valt dan terug op het tenant dat de webhook zelf kent */ }
}

async function leesBericht(id) {
  if (_berichten.has(id)) return _berichten.get(id);
  if (!redisKlaar()) return null;
  try {
    const [r] = await redis([['GET', 'hv:wa:msg:' + id]]);
    return r ? JSON.parse(r) : null;
  } catch (e) { return null; }
}

/** Eénmalig per bericht-id (statuswebhooks komen meerdere keren per bericht). */
async function eersteKeer(sleutel) {
  const lok = eersteKeer._lokaal || (eersteKeer._lokaal = new Set());
  if (lok.has(sleutel)) return false;
  lok.add(sleutel);
  if (lok.size > 20000) lok.delete(lok.values().next().value);
  if (!redisKlaar()) return true;
  try {
    const [r] = await redis([['SET', 'hv:wa:eenmalig:' + sleutel, '1', 'NX', 'EX', String(TTL_BERICHT_S)]]);
    return r === 'OK';
  } catch (e) { return true; }   // faal open: liever een dubbele telling dan een gemiste
}

/**
 * Meta's statusbericht verwerken: dit is de ECHTE factuurstatus.
 * Alleen het eerste statusbericht met prijsinformatie per bericht telt.
 * @returns {Promise<{geboekt:boolean, reden?:string}>}
 */
async function boekStatus(status, { tenant: terugval } = {}) {
  const s = normaliseerStatus(status);
  if (!s.id) return { geboekt: false, reden: 'geen_id' };
  if (s.status === 'failed') return { geboekt: false, reden: 'mislukt' };
  if (!s.bekend) return { geboekt: false, reden: 'geen_prijsinformatie' };
  if (!(await eersteKeer('bill:' + s.id))) return { geboekt: false, reden: 'al_geboekt' };

  const idx = await leesBericht(s.id);
  const tenant = (idx && idx.t) || terugval;
  if (!tenant) return { geboekt: false, reden: 'tenant_onbekend' };

  const cat = s.categorie || (idx && idx.c) || 'utility';
  const t = s.billable ? tarief(cat === 'service' ? 'utility' : cat) : 0;
  const werkelijk = s.billable && t !== null ? mikroVan(t) : 0;
  const delta = {
    act_n: 1,
    act_u: werkelijk,
    est_bevestigd_u: idx ? idx.e : 0,
  };
  if (s.billable) { delta.act_bill = 1; delta['bill_' + (cat === 'service' ? 'utility' : cat)] = 1; }
  else delta.act_vrij = 1;
  // Onze aanname klopte niet: wij dachten gratis, Meta rekende. Dat is de
  // alarmbel voor "de venstersberekening faalt".
  if (idx && !idx.b && s.billable) delta.mismatch_betaald = 1;
  if (idx && idx.b && !s.billable) delta.mismatch_gratis = 1;
  if (s.billable && t === null) delta.tarief_onbekend = 1;
  await tel(tenant, delta, s.ts || Date.now());
  return { geboekt: true, billable: s.billable, categorie: cat, tenant };
}

/** Eén AI-aanroep. USD en EUR blijven gescheiden, zie de kop. */
async function boekAi(tenant, { costUsd = 0, costEur = 0, tokens = 0, nu } = {}) {
  return tel(tenant, { ai_n: 1, ai_usd_u: mikroVan(costUsd), ai_eur_u: mikroVan(costEur), ai_tok: Math.round(tokens) }, nu);
}

/** Overige gebeurtenissen met één woord. */
const GEBEURTENIS = Object.freeze({
  lead: 'leads', gekwalificeerd: 'kwal', afspraak: 'afspr', overdracht: 'overdracht',
  opvolging: 'followup_gestuurd', opvolging_onderdrukt: 'followup_onderdrukt',
  duplicaat: 'dup_geblokkeerd', limiet: 'limiet_geraakt', sjabloon_fout: 'template_fout',
  infra: 'infra_n', webhook: 'webhook_n', cron: 'cron_n',
});
async function boek(tenant, gebeurtenis, aantal = 1, nu) {
  const veld = GEBEURTENIS[gebeurtenis];
  if (!veld) return;
  return tel(tenant, { [veld]: aantal }, nu);
}

/* ── Lezen: het overzicht ─────────────────────────────────────────────────── */

async function leesTellers(sleutel) {
  const lokaal = _geheugen.get(sleutel) || {};
  if (!redisKlaar()) return { ...lokaal };
  try {
    const [r] = await redis([['HGETALL', sleutel]]);
    const uit = {};
    if (Array.isArray(r)) for (let i = 0; i < r.length; i += 2) uit[r[i]] = Number(r[i + 1]);
    return uit;
  } catch (e) {
    return { ...lokaal };
  }
}

const deel = (a, b) => (b > 0 ? a / b : null);
const rond = (x, d = 4) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d);

/**
 * Van ruwe tellers naar het overzicht. Zuiver, dus ook voor simulaties.
 */
function overzichtUit(c) {
  const g = (k) => Number(c[k]) || 0;
  const usdEur = Number(process.env.KOSTEN_USD_EUR);
  const koers = Number.isFinite(usdEur) && usdEur > 0 ? usdEur : null;
  const infraTarief = Number(process.env.WA_INFRA_EUR_PER_AANROEP);
  const infraBekend = Number.isFinite(infraTarief) && process.env.WA_INFRA_EUR_PER_AANROEP !== undefined && process.env.WA_INFRA_EUR_PER_AANROEP !== '';

  // WhatsApp: bevestigde berichten tellen met Meta's factuurstatus, de rest met
  // de schatting van het moment van verzenden.
  const metaGeschat = g('est_u');
  const metaBeste = metaGeschat - g('est_bevestigd_u') + g('act_u');
  const dekking = deel(g('act_n'), g('uit'));
  const aiEur = g('ai_eur_u') + (koers ? g('ai_usd_u') * koers : 0);
  const aiTotaalBekend = g('ai_usd_u') === 0 || koers !== null;
  const infra = infraBekend ? mikroVan(infraTarief * g('infra_n')) : null;

  const totaalDelen = [metaBeste, aiTotaalBekend ? aiEur : null, infra];
  const volledig = totaalDelen.every((x) => x !== null);
  const totaalMikro = totaalDelen.reduce((s, x) => s + (x === null ? 0 : x), 0);

  const leads = g('leads'), conv = g('conv'), afspr = g('afspr'), kwal = g('kwal');
  const per = (n) => (n > 0 ? rond(eur(totaalMikro) / n) : null);

  return {
    volumes: {
      leads, gesprekken: conv, klantGestartGesprekken: g('conv_klant'), gekwalificeerd: kwal,
      afspraken: afspr, overdrachten: g('overdracht'),
      berichtenIn: g('in'), berichtenUit: g('uit'),
      aiInteracties: g('ai_n'),
    },
    whatsapp: {
      gratisServiceberichten: g('uit_vrij'),
      betaaldGeschat: g('uit_bill'),
      sjablonen: { totaal: g('tpl'), utility: g('tpl_utility'), marketing: g('tpl_marketing'), authentication: g('tpl_authentication') },
      betaaldBevestigd: g('act_bill'),
      gratisBevestigd: g('act_vrij'),
      betaaldPercentage: rond(deel(g('uit_bill'), g('uit')), 4),
      betaaldPercentageBevestigd: rond(deel(g('act_bill'), g('act_n')), 4),
      gratisPercentage: rond(deel(g('uit_vrij'), g('uit')), 4),
      bevestigingsdekking: rond(dekking, 4),          // aandeel berichten waarvan Meta de factuurstatus meldde
      kostenGeschatEur: eur(metaGeschat),
      kostenBevestigdEur: eur(g('act_u')),
      kostenBesteEur: eur(metaBeste),
      afwijkingen: { dachtGratisMaarBetaald: g('mismatch_betaald'), dachtBetaaldMaarGratis: g('mismatch_gratis') },
      tariefOntbreekt: g('tarief_onbekend'),
    },
    ai: { aanroepen: g('ai_n'), tokens: g('ai_tok'), kostenUsd: eur(g('ai_usd_u')), kostenEur: eur(g('ai_eur_u')), kostenTotaalEur: aiTotaalBekend ? eur(aiEur) : null },
    infrastructuur: { aanroepen: g('infra_n'), webhooks: g('webhook_n'), cronRuns: g('cron_n'), kostenEur: infra === null ? null : eur(infra), bron: infraBekend ? 'WA_INFRA_EUR_PER_AANROEP' : 'onbekend (stel WA_INFRA_EUR_PER_AANROEP in)' },
    opvolging: { gestuurd: g('followup_gestuurd'), onderdrukt: g('followup_onderdrukt') },
    veiligheid: { duplicatenGeblokkeerd: g('dup_geblokkeerd'), limietGeraakt: g('limiet_geraakt'), sjabloonFouten: g('template_fout') },
    kosten: {
      totaalVariabelEur: eur(totaalMikro),
      volledig,                                       // false = minstens één onderdeel ontbreekt of is onbekend
      perLeadEur: per(leads),
      perGesprekEur: per(conv),
      perGekwalificeerdeLeadEur: per(kwal),
      perAfspraakEur: per(afspr),
      per100LeadsEur: leads > 0 ? rond(eur(totaalMikro) / leads * 100, 2) : null,
    },
    efficiency: {
      aiAanroepenPerLead: rond(deel(g('ai_n'), leads), 2),
      berichtenPerLead: rond(deel(g('uit') + g('in'), leads), 2),
      betaaldePerLead: rond(deel(g('uit_bill'), leads), 3),
      gratisPercentage: rond(deel(g('uit_vrij'), g('uit')), 4),
    },
  };
}

/** Overzicht voor één dealer. `periode`: 'YYYY-MM' (maand) of 'YYYY-MM-DD' (dag). */
async function overzicht(tenant, periode) {
  const t = veilig(tenant);
  const p = String(periode || new Date().toISOString().slice(0, 7));
  const sleutel = p.length === 7 ? `hv:wa:m:${t}:${p}` : `hv:wa:d:${t}:${p}`;
  const c = await leesTellers(sleutel);
  return Object.assign({ tenant: t, periode: p }, overzichtUit(c));
}

/* ── Veiligheidsrails en alarmen ──────────────────────────────────────────── */

/*
 * Dagquota per dealer. Dit zijn RAILS, geen gebruiksgrenzen: ze staan hoog en
 * houden alleen automatisch verkeer tegen als er iets is misgegaan. Een
 * ANTWOORD op een inkomend bericht wordt er nooit door tegengehouden (zie
 * besluit() in _wa-router.js).
 */
const STANDAARD_LIMIETEN = Object.freeze({ uitgaand: 5000, sjablonen: 1000, ai: 8000, opvolgingen: 1000 });

function limieten(tenantOverrides) {
  const uit = { ...STANDAARD_LIMIETEN };
  for (const k of Object.keys(uit)) {
    const env = process.env['WA_LIMIET_' + k.toUpperCase()];
    if (env !== undefined && env !== '' && Number.isFinite(Number(env))) uit[k] = Number(env);
    if (tenantOverrides && Number.isFinite(tenantOverrides[k])) uit[k] = tenantOverrides[k];
  }
  return uit;
}

/** Hoeveel er vandaag nog kan, in de vorm die besluit() verwacht. */
async function resterend(tenant, tenantOverrides, nu = Date.now()) {
  const l = limieten(tenantOverrides);
  const c = await leesTellers(dagSleutel(veilig(tenant), nu));
  return {
    outboundLeft: l.uitgaand - (c.uit || 0),
    templateLeft: l.sjablonen - (c.tpl || 0),
    followupLeft: l.opvolgingen - (c.followup_gestuurd || 0),
    aiLeft: l.ai - (c.ai_n || 0),
  };
}

/**
 * Wat is er opvallend t.o.v. de gewone gang van zaken? Zuiver.
 * @param {object} vandaag overzicht van een dag
 * @param {object} basis   overzicht over een eerdere periode (bv. de vorige 7 dagen samen)
 */
function bepaalAlarmen(vandaag, basis, drempels = {}) {
  const d = Object.assign({ minBerichten: 30, betaaldSprong: 0.15, sjabloonSprong: 2.5, aiSprong: 2.5, kostPerLeadMax: null, minLeads: 10 }, drempels);
  const alarmen = [];
  const w = vandaag.whatsapp, bw = basis && basis.whatsapp;
  const uitVandaag = vandaag.volumes.berichtenUit;

  if (uitVandaag >= d.minBerichten && bw && basis.volumes.berichtenUit >= d.minBerichten) {
    const nu = w.betaaldPercentage || 0, voor = bw.betaaldPercentage || 0;
    if (nu - voor >= d.betaaldSprong) {
      alarmen.push({ soort: 'betaald_percentage', ernst: 'hoog', tekst: `Het betaalde WhatsApp-aandeel steeg van ${Math.round(voor * 100)}% naar ${Math.round(nu * 100)}%.` });
    }
  }
  if (bw && basis.volumes.berichtenUit >= d.minBerichten) {
    const tNu = w.sjablonen.totaal, tVoor = bw.sjablonen.totaal;
    if (tVoor > 0 && tNu / Math.max(1, uitVandaag) > d.sjabloonSprong * (tVoor / Math.max(1, basis.volumes.berichtenUit))) {
      alarmen.push({ soort: 'sjablonen', ernst: 'middel', tekst: 'Er worden veel meer sjablonen gebruikt dan gewoonlijk.' });
    }
    const aiNu = vandaag.ai.aanroepen / Math.max(1, vandaag.volumes.leads), aiVoor = basis.ai.aanroepen / Math.max(1, basis.volumes.leads);
    if (vandaag.volumes.leads >= d.minLeads && aiVoor > 0 && aiNu > d.aiSprong * aiVoor) {
      alarmen.push({ soort: 'ai_kosten', ernst: 'middel', tekst: `AI-aanroepen per lead stegen van ${aiVoor.toFixed(1)} naar ${aiNu.toFixed(1)}.` });
    }
  }
  if (w.afwijkingen.dachtGratisMaarBetaald > 0) {
    alarmen.push({ soort: 'venster_logica', ernst: 'hoog', tekst: `${w.afwijkingen.dachtGratisMaarBetaald} bericht(en) die wij als gratis boekten, rekende Meta wél: de venstersberekening klopt niet.` });
  }
  if (vandaag.veiligheid.duplicatenGeblokkeerd >= 5) {
    alarmen.push({ soort: 'duplicaten', ernst: 'middel', tekst: `${vandaag.veiligheid.duplicatenGeblokkeerd} dubbele verzendingen geblokkeerd vandaag.` });
  }
  if (vandaag.veiligheid.sjabloonFouten >= 3) {
    alarmen.push({ soort: 'sjabloon_geweigerd', ernst: 'hoog', tekst: `${vandaag.veiligheid.sjabloonFouten} sjabloonverzendingen werden geweigerd.` });
  }
  if (uitVandaag >= d.minBerichten && w.bevestigingsdekking !== null && w.bevestigingsdekking < 0.2) {
    alarmen.push({ soort: 'billing_data_ontbreekt', ernst: 'middel', tekst: 'Meta meldt de factuurstatus van bijna geen bericht meer: de bevestigde kosten kloppen niet.' });
  }
  if (d.kostPerLeadMax !== null && vandaag.volumes.leads >= d.minLeads && vandaag.kosten.perLeadEur !== null && vandaag.kosten.perLeadEur > d.kostPerLeadMax) {
    alarmen.push({ soort: 'kost_per_lead', ernst: 'hoog', tekst: `Kosten per lead zijn €${vandaag.kosten.perLeadEur.toFixed(2)} (drempel €${d.kostPerLeadMax.toFixed(2)}).` });
  }
  return alarmen;
}

/**
 * Vandaag tegenover de zeven dagen ervoor, voor één dealer. Dit is wat de
 * dagelijkse cron en het adminscherm aanroepen.
 */
async function alarmenVoor(tenant, drempels, nu = Date.now()) {
  const t = veilig(tenant);
  const dag = (n) => new Date(nu - n * 86400000).toISOString().slice(0, 10);
  const vandaag = await overzicht(t, dag(0));
  const som = {};
  for (let n = 1; n <= 7; n++) {
    const c = await leesTellers(`hv:wa:d:${t}:${dag(n)}`);
    for (const [k, v] of Object.entries(c)) som[k] = (som[k] || 0) + v;
  }
  const basis = Object.assign({ tenant: t, periode: 'vorige_7_dagen' }, overzichtUit(som));
  return { vandaag, basis, alarmen: bepaalAlarmen(vandaag, basis, drempels) };
}

/** Alleen voor tests. */
function _reset() { _geheugen.clear(); _berichten.clear(); if (eersteKeer._lokaal) eersteKeer._lokaal.clear(); }

module.exports = {
  tarief, normaliseerStatus,
  boekInkomend, boekUitgaand, boekStatus, boekAi, boek, tel,
  overzicht, overzichtUit, leesTellers, alarmenVoor,
  limieten, resterend, bepaalAlarmen, STANDAARD_LIMIETEN,
  maandSleutel, dagSleutel, _reset, _geheugen,
};
