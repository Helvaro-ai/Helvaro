'use strict';
/*
 * Voorraadwaarheid — weet Helvaro NU wat er in de voorraad staat, en hoe zeker?
 *
 * ── Het probleem ────────────────────────────────────────────────────────────
 * Een koper vraagt "is de X5 nog vrij?". Wat de assistent daarop zegt moet uit
 * de voorraad komen, niet uit het model, niet uit een vorig gesprek en niet
 * uit een cache. Maar "uit de voorraad" is maar zo goed als de voorraad zelf:
 * kan Helvaro erbij, en is hij recent genoeg?
 *
 * ── Twee soorten bron ───────────────────────────────────────────────────────
 *   native  De dealer beheert zijn voertuigen IN Helvaro (tabel 'vehicles').
 *           Die tabel IS de bron; elke AI-beurt leest hem live. "Synchroniseren"
 *           is hier een lichte gezondheidscontrole: bereikbaar, aantal, en een
 *           inhoudshash om te zien wat er sinds de vorige controle veranderde.
 *   feed    De voorraad staat in een ander systeem (DMS, AutoScout24-export) dat
 *           een CSV-, JSON- of XML-feed aanbiedt. Hier kan Helvaro ACHTER lopen:
 *           versheid is echt, en een verouderde feed mag nooit als actuele
 *           beschikbaarheid gebracht worden.
 *
 * ── Toestanden ──────────────────────────────────────────────────────────────
 *   HEALTHY   laatste geslaagde sync binnen de versheidsdrempel
 *   SYNCING   er loopt een sync (slot jonger dan SLOT_MS)
 *   STALE     versheidsdrempel overschreden (sync wordt aangestoten)
 *   DEGRADED  laatste poging deels mislukt, of mislukt terwijl er nog een
 *             recente geslaagde is
 *   FAILED    laatste poging mislukt en geen bruikbare geslaagde meer
 *   UNKNOWN   nog nooit gecontroleerd
 *
 * ── Wat de assistent ermee doet ─────────────────────────────────────────────
 * vertrouwen() zegt 'bevestigd' of 'onzeker'. Bij 'onzeker' mag de assistent
 * wel helpen (voertuig herkennen, contact vastleggen, lead maken, verkoper
 * waarschuwen) maar NOOIT beschikbaarheid bevestigen. Zie
 * api/_ai/prompts.js voorraadNotitie en api/_kanaal.js.
 *
 * ── Eindcontrole ────────────────────────────────────────────────────────────
 * hercontroleer() leest de voertuigen die in een antwoord zaten OPNIEUW, vlak
 * voor het versturen. Veranderde status, prijs of kilometerstand tussen het
 * schrijven en het versturen = het antwoord gaat niet ongewijzigd weg.
 *
 * ── Meerdere bronnen (2026-10-05) ───────────────────────────────────────────
 * Een dealer kan voorraad uit meer dan één plek halen: zijn website-feed, zijn
 * AutoScout24-profiel, later mobile.de. 'Inventory Source' is dan
 * { bronnen: [ ... ], bewaarDagen, legacyProvider }. De oude vorm (een enkel
 * object met type/provider/url) blijft leesbaar: dat is een lijst van een.
 * saneerBron() levert de eerste synchroniseerbare bron nog steeds als de
 * oude platte velden (type, provider, url, ...), zodat alles wat daar al op
 * leunt (dashboard, cron, tests) ongewijzigd werkt.
 *
 * Welke platformen er bestaan en wat ze kunnen staat in api/_voorraad-providers/.
 * Dit bestand kent GEEN platform: het vraagt het register. Het weet alleen hoe
 * je er meerdere achter elkaar draait (syncBronnen), wat er bij een mislukte
 * bron gebeurt (die is onbekend: niets verandert voor wagens die alleen daar
 * stonden) en hoe de toestand per bron bijgehouden wordt.
 *
 * ── Opslag ──────────────────────────────────────────────────────────────────
 * Client Config: 'Inventory Source' (JSON, instellingen) en 'Inventory State'
 * (JSON, toestand + laatste runs). Geen eigen tabel: één rij per dealer is
 * precies wat dit is.
 */

const crypto = require('crypto');
const vehicles = require('./_vehicles');
const registry = require('./_voorraad-providers');
const credentials = require('./_voorraad-providers/credentials');
const fouten = require('./_voorraad-providers/fouten');
const _listings = require('./_listings');
const feedModule = require('./_voorraad-providers/feed');
const autoscoutModule = require('./_voorraad-providers/autoscout24');
const { isInternIp } = require('./_lib/fetch-website');

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const F_PROJECT = 'fldN4dL0bGgfBOXwM';
const F_SOURCE = 'Inventory Source';
const F_STATE = 'Inventory State';

const TOESTANDEN = Object.freeze(['HEALTHY', 'SYNCING', 'STALE', 'DEGRADED', 'FAILED', 'UNKNOWN']);

/* Standaarddrempels in minuten. Per dealer te overschrijven in Inventory Source.
   native: de controle is goedkoop en de data is live; 15 min is ruim.
   feed:   een feed wordt meestal hooguit elk uur ververst door de bron. */
const STANDAARD = Object.freeze({
  native: { versMin: 15, waarschuwMin: 60, hardMin: 24 * 60 },
  feed:   { versMin: 60, waarschuwMin: 180, hardMin: 12 * 60 },
});

const SLOT_MS = 2 * 60 * 1000;          // een sync die langer duurt geldt als dood
const MAX_SCHRIJF_PER_RUN = 400;         // rest volgt in de volgende run (DEGRADED 'gedeeltelijk')
const GESCHIEDENIS = 10;

/* ── Client Config lezen/schrijven ─────────────────────────────────────── */
function configured() { return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE); }
function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

async function at(pad, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pad}`, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${process.env.API_AIRTABLE}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

async function klantRecord(projectCode) {
  const formule = encodeURIComponent(`{${F_PROJECT}}="${escapeFormula(projectCode)}"`);
  /* Geen fields[]-filter: bestaat 'Inventory State' nog niet (schema-migratie
     nog niet gedraaid), dan geeft een filter erop een 422 in plaats van een
     record zonder dat veld. */
  const r = await at(`${CLIENTS_TABLE}?filterByFormula=${formule}&maxRecords=1`);
  if (!r.ok) {
    const e = new Error('klantrecord ' + r.status);
    e.status = r.status;
    throw e;
  }
  const d = await r.json();
  return (d.records || [])[0] || null;
}

function leesJson(v, standaard) {
  if (!v) return standaard;
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : standaard; } catch { return standaard; }
}

const MAX_BRONNEN = 10;
const STANDAARD_BEWAAR_DAGEN = 14;
const MAX_LISTING_SCHRIJF = 600;        // advertentierijen per run
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;   // een geuploade export: 2 MB

function getal(x, d, min, max) { const n = Number(x); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; }
function maskeerUrl(u) { return u ? String(u).replace(/([?&](?:key|token|apikey|api_key|secret)=)[^&]+/gi, '$1***') : ''; }

/* Een upload-bron: de dealer leverde een exportbestand aan (inventory-upload)
   en gaf geen adres. De bron draagt dat zelf (`upload: true`); een feed zonder
   adres en zonder die markering blijft wat hij was, een onvolledig ingestelde feed.
   De geplande sync slaat een upload-bron over -- er is niets om op te halen -- en
   hij telt niet mee voor de versheid van de voorraad: een bestand veroudert niet
   "op de achtergrond". Krijgt hij later alsnog een adres, dan is hij gewoon een feed. */
function isUploadBron(b) {
  const p = b && registry.get(b.provider);
  return Boolean(p) && p.uploadBaar === true && b.upload === true && !b.url;
}
/* Een bron die de geplande sync echt ophaalt. */
function draaibaarBron(b) {
  return Boolean(b) && b.enabled !== false && registry.kanSyncen(registry.get(b.provider)) && !isUploadBron(b);
}

/* De toestand van een bron voor het scherm. Een dealer van voor de
   meerbronnenvorm heeft alleen de platte velden bovenaan de toestand; die horen
   bij zijn ENE bron (legacyProvider). Zonder deze terugval zegt de kaart van
   een bron "laatste synchronisatie: nooit" terwijl hij elk uur synchroniseert. */
function bronStaatVan(staat, bron, provider) {
  const s = staat || {};
  if (s.bronnen && s.bronnen[provider]) return s.bronnen[provider];
  if (bron && bron.legacyProvider === provider && s.source !== 'native' && (s.lastSuccessAt || s.lastAttemptAt)) {
    return { lastAttemptAt: s.lastAttemptAt, lastSuccessAt: s.lastSuccessAt, lastResult: s.lastResult, count: s.count, lastErrorCode: s.lastErrorCode && s.lastResult === 'failed' ? s.lastErrorCode : '' };
  }
  return undefined;
}

/* De oude enkele bron als een element van de lijst. De provider volgt uit wat de
   dealer koos; een adres dat een provider herkent (een AutoScout24-verkopers-
   profiel) wint, ook als het formulier de provider niet meestuurde. */
function legacyNaarItem(o) {
  const url = String(o.url || '').trim().slice(0, 1000);
  const https = /^https:\/\/\S+$/i.test(url) ? url : '';
  const herkend = registry.lijst().find((p) => typeof p.herkent === 'function' && p.herkent(https));
  const gevraagd = registry.get(String(o.provider || o.type || ''));
  const provider = herkend ? herkend.id
    : (gevraagd && registry.kanSyncen(gevraagd) ? gevraagd.id : 'feed');
  return { provider, url, formaat: o.formaat, verdwenen: o.verdwenen, enabled: true };
}

/** Een bron uit de lijst, gesaneerd door zijn provider. null = onbekende provider. */
function saneerBronItem(o) {
  const r = o && typeof o === 'object' ? o : {};
  const p = registry.get(String(r.provider || '').trim());
  if (!p) return null;
  /* Verdwijnt een voertuig uit een GESLAAGDE bron: standaard 'verkocht' (met
     Sold At, dus 14 dagen VERKOCHT en daarna het archief in). Nooit
     verwijderen -- leads en afspraken hangen eraan. De oude standaard
     'uit aanbod' (met spatie) staat in elke opgeslagen bron omdat bewaarBron()
     de gesaneerde waarde wegschreef; geen dealer koos hem ooit. Daarom leest
     hij als de nieuwe standaard. Wie echt 'uit aanbod' wil, schrijft 'uit_aanbod'. */
  const item = {
    id: p.id,
    provider: p.id,
    enabled: r.enabled !== false,
    verdwenen: r.verdwenen === 'negeren' ? 'negeren' : r.verdwenen === 'uit_aanbod' ? 'uit_aanbod' : 'verkocht',
  };
  Object.assign(item, p.saneer(r));
  if (p.uploadBaar === true && r.upload === true && !item.url) item.upload = true;
  /* Inloggegevens bestaan alleen als sluitend versleutelde waarde; platte tekst
     of iets anders wordt hier nooit overgenomen. */
  if (registry.vraagtCredentials(p)) item.credentials = credentials.isVersleuteld(r.credentials) ? r.credentials : '';
  return item;
}

/** Bron-instellingen, gesaneerd. Onbekende waarden vallen terug op native. */
function saneerBron(ruw) {
  const o = ruw && typeof ruw === 'object' ? ruw : {};
  const ruwe = Array.isArray(o.bronnen) ? o.bronnen
    : (o.type === 'feed' || registry.kanSyncen(registry.get(String(o.type || '')))) ? [legacyNaarItem(o)]
    : [];
  const bronnen = [];
  for (const r of ruwe) {
    const b = saneerBronItem(r);
    /* Een bron per platform: de advertentiesleutel is platform + id. */
    if (b && !bronnen.some((x) => x.provider === b.provider)) bronnen.push(b);
    if (bronnen.length >= MAX_BRONNEN) break;
  }
  /* Een publiceerkanaal (Meta) hoort achteraan: de eerste bron van de lijst is
     de bron van de oude platte velden en van de vlakke toestand van voor de
     meerbronnenvorm. */
  const alleenPub = (b) => Boolean(registry.get(b.provider) && registry.get(b.provider).alleenPubliceren);
  bronnen.sort((a, b) => Number(alleenPub(a)) - Number(alleenPub(b)));
  const actief = bronnen.filter(draaibaarBron);
  /* 'feed' = de voorraad staat (ook) in een ander systeem en kan dus achterlopen.
     Een bron die alleen inloggegevens bewaart en nog niet kan lezen telt niet:
     dan zou de assistent stoppen met bevestigen voor een dealer die gewoon in
     Helvaro werkt. */
  const type = actief.length ? 'feed' : 'native';
  const std = STANDAARD[type];
  const bron = {
    type,
    drempels: {
      versMin: getal(o.drempels && o.drempels.versMin, std.versMin, 1, 7 * 24 * 60),
      waarschuwMin: getal(o.drempels && o.drempels.waarschuwMin, std.waarschuwMin, 1, 14 * 24 * 60),
      hardMin: getal(o.drempels && o.drempels.hardMin, std.hardMin, 5, 30 * 24 * 60),
    },
    bewaarDagen: getal(o.bewaarDagen, STANDAARD_BEWAAR_DAGEN, 1, 365),
    bronnen,
    legacyProvider: registry.get(String(o.legacyProvider || '')) ? String(o.legacyProvider) : ((bronnen.find((b) => registry.kanSyncen(registry.get(b.provider))) || bronnen[0] || {}).provider || 'feed'),
    /* Wagens die de dealer zelf verwijderde: de sync maakt ze niet opnieuw aan.
       Altijd bewaard, ook als er nu geen bron actief is: dezelfde bron kan
       morgen weer aan. */
    uitgeslotenAlle: Array.isArray(o.uitgesloten)
      ? Array.from(new Set(o.uitgesloten.map((x) => String(x || '').trim().slice(0, 140)).filter(Boolean))).slice(-1000)
      : [],
  };
  if (bron.drempels.waarschuwMin < bron.drempels.versMin) bron.drempels.waarschuwMin = bron.drempels.versMin;
  if (bron.drempels.hardMin < bron.drempels.waarschuwMin) bron.drempels.hardMin = bron.drempels.waarschuwMin;
  if (type === 'feed') {
    /* De oude platte velden: de eerste actieve bron. */
    const p = actief[0];
    bron.url = p.url || '';
    bron.formaat = p.formaat || 'auto';
    bron.verdwenen = p.verdwenen;
    bron.provider = p.provider;
    bron.uitgesloten = bron.uitgeslotenAlle;
  }
  return bron;
}

/** Wat in 'Inventory Source' terechtkomt: de nieuwe lijst, plus de oude platte velden zodat terugdraaien veilig is. */
function naarOpslag(bron) {
  const uit = { type: bron.type, bronnen: bron.bronnen, bewaarDagen: bron.bewaarDagen, legacyProvider: bron.legacyProvider, drempels: bron.drempels, uitgesloten: bron.uitgeslotenAlle };
  if (bron.type === 'feed') Object.assign(uit, { provider: bron.provider, url: bron.url, formaat: bron.formaat, verdwenen: bron.verdwenen });
  return uit;
}

async function lees(projectCode) {
  const rec = await klantRecord(projectCode);
  if (!rec) return { rec: null, bron: saneerBron({}), staat: {} };
  const f = rec.fields || {};
  return { rec, bron: saneerBron(leesJson(f[F_SOURCE], {})), staat: leesJson(f[F_STATE], {}) };
}

async function schrijf(recId, velden) {
  const r = await at(`${CLIENTS_TABLE}/${recId}`, { method: 'PATCH', body: { fields: velden } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const e = new Error('state-schrijven ' + r.status + ' ' + txt.slice(0, 160));
    e.status = r.status;
    e.onbekendVeld = /UNKNOWN_FIELD_NAME/.test(txt);
    throw e;
  }
}

/* ── Toestand berekenen (puur) ─────────────────────────────────────────── */
function minutenSinds(iso, nu) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? (nu - t) / 60000 : Infinity;
}

/**
 * @returns {{status, ageMin, waarschuwing:boolean, hardVerlopen:boolean}}
 */
function bereken(staat, bron, nu = Date.now()) {
  const s = staat || {};
  const d = (bron && bron.drempels) || STANDAARD.native;
  const age = minutenSinds(s.lastSuccessAt, nu);
  const slotLeeft = s.slot && (nu - Date.parse(s.slot.at || '')) < SLOT_MS;
  let status;
  if (slotLeeft) status = 'SYNCING';
  else if (!s.lastAttemptAt && !s.lastSuccessAt) status = 'UNKNOWN';
  else if (s.lastResult === 'failed') status = age <= d.hardMin ? 'DEGRADED' : 'FAILED';
  else if (s.lastResult === 'partial') status = 'DEGRADED';
  else if (age > d.versMin) status = 'STALE';
  else status = 'HEALTHY';
  return { status, ageMin: Number.isFinite(age) ? Math.round(age) : null, waarschuwing: age > d.waarschuwMin, hardVerlopen: age > d.hardMin };
}

/**
 * Mag de assistent voorraadfeiten BEVESTIGEN?
 * native: ja zolang de tabel leesbaar is (de beurt leest live); een mislukte
 *         laatste controle maakt het onzeker.
 * feed:   alleen als de laatste geslaagde sync binnen de harde drempel valt en
 *         de laatste poging niet mislukte.
 */
function vertrouwen(staat, bron, nu = Date.now()) {
  const b = bereken(staat, bron, nu);
  if (!bron || bron.type !== 'feed') {
    if (b.status === 'FAILED') return { niveau: 'onzeker', reden: 'voorraad_onbereikbaar', ...b };
    return { niveau: 'bevestigd', reden: '', ...b };
  }
  if (b.status === 'UNKNOWN') return { niveau: 'onzeker', reden: 'nooit_gesynchroniseerd', ...b };
  if (b.status === 'FAILED') return { niveau: 'onzeker', reden: 'sync_mislukt', ...b };
  if (b.hardVerlopen) return { niveau: 'onzeker', reden: 'te_oud', ...b };
  return { niveau: 'bevestigd', reden: '', ...b };
}

/* ── Inhoudshash: wat telt als 'veranderd' ─────────────────────────────── */
function vingerafdruk(v) {
  return [v.code, v.status, v.prijs, v.km, v.merk, v.model, v.uitvoering, v.gearchiveerd ? 1 : 0, v.publiek ? 1 : 0].join('|');
}
function hashVan(lijst) {
  const h = crypto.createHash('sha256');
  for (const v of lijst.slice().sort((a, b) => a.code.localeCompare(b.code))) h.update(vingerafdruk(v) + '\n');
  return h.digest('hex').slice(0, 16);
}

/* ── Slot (best effort: Airtable kent geen compare-and-set) ─────────────── */
async function neemSlot(rec, staat, door) {
  const nu = Date.now();
  if (staat.slot && (nu - Date.parse(staat.slot.at || '')) < SLOT_MS) return null;
  const token = crypto.randomBytes(6).toString('hex');
  const nieuw = Object.assign({}, staat, { slot: { token, at: new Date(nu).toISOString(), door: door || 'systeem' } });
  await schrijf(rec.id, { [F_STATE]: JSON.stringify(nieuw) });
  /* Schrijven-dan-teruglezen, zoals api/_voertuigslot.js bevestigClaim: wie als
     laatste schreef wint; de ander ziet een vreemd token en trekt zich terug. */
  const r = await at(`${CLIENTS_TABLE}/${rec.id}?fields[]=${encodeURIComponent(F_STATE)}`);
  if (r.ok) {
    const d = await r.json();
    const terug = leesJson(d.fields && d.fields[F_STATE], {});
    if (!terug.slot || terug.slot.token !== token) return null;
  }
  return token;
}

/* ── Native ────────────────────────────────────────────────────────────── */

/** native: controleer de tabel, tel, hash, vergelijk met de vorige run. */
async function probeNative(projectCode, vorige) {
  if (!(await vehicles.available())) {
    const reden = vehicles.onbeschikbaarReden();
    const e = new Error(reden === 'geen_tabel' ? 'voertuigentabel bestaat niet' : 'voorraad onbereikbaar');
    e.code = reden || 'onbereikbaar';
    throw e;
  }
  const { vehicles: lijst, afgekapt } = await vehicles.listMetStatus(projectCode, { inclusiefGearchiveerd: true });
  const actief = lijst.filter((v) => !v.gearchiveerd);
  const vorigeCodes = new Map(((vorige && vorige.vingers) || []).map((x) => [x.c, x.h]));
  let changed = 0;
  const nuCodes = new Set();
  const vingers = [];
  for (const v of actief) {
    const h = crypto.createHash('sha1').update(vingerafdruk(v)).digest('hex').slice(0, 10);
    vingers.push({ c: v.code, h });
    nuCodes.add(v.code);
    if (vorigeCodes.size && vorigeCodes.get(v.code) !== h) changed++;
  }
  let removed = 0;
  for (const c of vorigeCodes.keys()) if (!nuCodes.has(c)) removed++;
  return {
    count: actief.length,
    changed, removed, failed: 0,
    version: hashVan(actief),
    vingers: vingers.slice(0, 1500),
    partial: afgekapt,
    notitie: afgekapt ? 'lijst afgekapt op 1000 voertuigen' : '',
  };
}

/* ── Meerdere bronnen: ophalen, verzoenen, schrijven ─────────────────────── */

/* De toestand van een bron uit de vorige run. Een dealer van voor de
   meerbronnenvorm heeft alleen de platte velden; die horen bij zijn ENE bron
   (de eerste in de lijst). */
function vorigeVan(staat, bron, index) {
  const s = staat || {};
  if (s.bronnen && s.bronnen[bron.provider]) return s.bronnen[bron.provider];
  /* De toestand van een dealer die alleen een lokale voorraad had (source native) is geen bron-toestand. */
  if (!s.bronnen && index === 0 && s.source !== 'native') return s;
  return {};
}

/**
 * Alle bronnen van de dealer: elke ophalen (een mislukte bron breekt de rest
 * niet af), dan EEN verzoening over alles, dan schrijven.
 *
 * Gooit alleen als GEEN enkele bron slaagde -- en dan met e.perBron erbij zodat
 * de toestand per bron toch bijgewerkt wordt. Slaagt er minstens een, dan is de
 * run 'partial' en blijft wat de mislukte bron toonde ongemoeid: onbekend is
 * niet verkocht.
 */
async function syncBronnen(projectCode, bron, staat, opties = {}) {
  const _sync = require('./_voorraad-sync');
  /* Een upload: alleen dat platform, met het bestand dat de dealer net gaf. */
  const upload = opties.upload || null;
  const draaibaar = upload
    ? bron.bronnen.filter((b) => b.provider === upload.provider)
    : bron.bronnen.filter(draaibaarBron);
  const perBron = {};
  const budget = Number.isFinite(opties.provider && opties.provider.budgetMs) ? opties.provider.budgetMs : null;
  const t0 = Date.now();

  for (const b of draaibaar) {
    const p = registry.get(b.provider);
    try {
      const rest = budget === null ? {} : { budgetMs: Math.max(15000, budget - (Date.now() - t0)) };
      const feed = upload ? upload.feed : await p.haal(b, rest);
      /* Leeg = de bron is stuk, niet "alle wagens verkocht". Dit gooit, en dan
         komt er voor deze bron geen enkele wagen in aanraking. Regel 1 van
         api/_voorraad-sync.js. */
      if (!feed.voertuigen.length) throw fouten.maakFout('feed bevat geen herkenbare voertuigen', 'feed_leeg');
      perBron[b.provider] = { feed };
    } catch (e) {
      perBron[b.provider] = { fout: e, genorm: p.normaliseerFout(e) };
    }
  }

  const geslaagd = draaibaar.filter((b) => perBron[b.provider].feed);
  const mislukt = draaibaar.filter((b) => perBron[b.provider].fout);
  if (!geslaagd.length) {
    const e = mislukt.length ? perBron[mislukt[0].provider].fout : fouten.maakFout('geen bron om te synchroniseren', 'geen_url');
    e.perBron = perBron;
    throw e;
  }

  /* Incrementeel: precies dezelfde bronnen als de vorige geslaagde run = niets
     te doen. Behalve als de vorige run een daling tegenhield en de dealer die
     nu bevestigt -- dan moet het plan juist wel opnieuw. */
  /* Ook niet overslaan zolang de advertentietabel nog nooit gevuld werd: een
     tabel die na de vorige run werd aangemaakt, blijft anders leeg tot de
     bron toevallig verandert. */
  const ongewijzigd = !opties.bevestigDaling && !mislukt.length && staat.listingsKlaar === true && geslaagd.every((b) => {
    const v = vorigeVan(staat, b, bron.bronnen.indexOf(b));
    return v.feedHash && v.feedHash === perBron[b.provider].feed.hash && v.lastResult === 'ok';
  });
  const versie = geslaagd.length === 1
    ? perBron[geslaagd[0].provider].feed.hash
    : crypto.createHash('sha256').update(geslaagd.map((b) => b.provider + ':' + perBron[b.provider].feed.hash).join('|')).digest('hex').slice(0, 16);
  const telVoertuigen = geslaagd.reduce((n, b) => n + perBron[b.provider].feed.voertuigen.length, 0);
  if (ongewijzigd) {
    for (const b of geslaagd) perBron[b.provider].stand = { nieuw: 0, bijgewerkt: 0, verwijderd: 0, ongewijzigd: true };
    return { count: telVoertuigen, changed: 0, removed: 0, failed: 0, ongewijzigd: true, feedHash: versie, version: staat.version || versie, partial: false, perBron, geslaagd, mislukt };
  }

  /* De hele voorraad, niet de eerste 1000. Wat hier ontbreekt, ziet verzoen()
     als "nieuw" en maakt het een tweede keer aan. Past hij zelfs in 3000 niet,
     dan liever niets doen dan dubbels schrijven (audit M-9). */
  const { vehicles: bestaand, afgekapt: bestaandAfgekapt } = await vehicles.listMetStatus(projectCode, { inclusiefGearchiveerd: true, maxPaginas: 30 });
  if (bestaandAfgekapt) {
    throw fouten.maakFout('voorraad groter dan 3000 wagens; sync gestopt om dubbels te vermijden', 'voorraad_te_groot');
  }
  /* De advertenties. Bestaat de tabel nog niet, dan draait dit zoals voor
     advertenties bestonden (de wagen zelf onthoudt zijn bron) en wordt de tabel
     aangemaakt. Bestaat hij maar is hij niet te lezen: STOPPEN. Zonder te weten
     welk ander platform een wagen nog toont, mag er niets op verkocht. */
  const lijstAdv = await _listings.list(projectCode);
  if (!lijstAdv.beschikbaar && _listings.onbeschikbaarReden() === 'geen_tabel') { try { require('./_schema').ensureLui(); } catch (_) { /* optioneel */ } }
  if (lijstAdv.afgekapt) {
    throw fouten.maakFout('meer dan 3000 advertenties; sync gestopt om dubbels te vermijden', 'voorraad_te_groot');
  }

  const nu = new Date().toISOString();
  const uitgesloten = new Set((bron.uitgeslotenAlle || []).map(String));
  const legacy = bron.legacyProvider;
  const _s = require('./_voorraad-sync');
  const planBronnen = draaibaar.map((b) => {
    const p = registry.get(b.provider);
    const feed = perBron[b.provider].feed;
    const voertuigen = feed
      ? (uitgesloten.size ? feed.voertuigen.filter((f) => !uitgesloten.has(_s.bronIdVoor(b.provider, f.bronId, legacy))) : feed.voertuigen)
      : null;
    return { provider: b.provider, verdwenen: b.verdwenen, kentReservering: p.kentReservering !== false, voertuigen };
  });
  const plan = _sync.verzoenAlles(bestaand, lijstAdv.listings, planBronnen, {
    nu, bevestigDaling: opties.bevestigDaling, legacyProvider: legacy,
    /* Een bestand dat de dealer zelf aanlevert is een momentopname: dalen er
       meer dan de helft van zijn wagens uit weg, dan wacht dat op zijn bevestiging,
       ook bij een kleine voorraad (een feed krijgt die ondergrens van 5 wel). */
    dalingMin: upload ? 1 : undefined,
    geconfigureerd: bron.bronnen.filter((b) => b.enabled).map((b) => b.provider),
    codesToewijzen: true,
    /* Kennen we de advertenties niet (tabel ontbreekt) en draaien er meerdere
       bronnen? Dan weten we van een wagen niet of een ander platform hem nog
       toont: alleen als ALLES geslaagd is mag er iets op verkocht. */
    listingsOnbekend: !lijstAdv.beschikbaar && draaibaar.length > 1,
  });
  const res = await _sync.pasToe(projectCode, plan, { nu, codes: bestaand.map((v) => v.code), max: MAX_SCHRIJF_PER_RUN });
  _sync.logGebeurtenissen(projectCode, plan.gebeurtenissen);
  let advFout = 0;
  try {
    const w = await _listings.schrijf(projectCode, plan.listings, { nu, max: MAX_LISTING_SCHRIJF });
    advFout = w.failed;
  } catch (e) { advFout = plan.listings.length; console.warn('[voorraad] advertenties niet weggeschreven voor', projectCode, e && e.message); }

  const notities = [];
  if (res.afgekapt) notities.push(`gedeeltelijk: ${MAX_SCHRIJF_PER_RUN} van ${res.totaal} wijzigingen, rest in de volgende run`);
  if (plan.dalingGeblokkeerd) notities.push(`${plan.verdwenenAantal} wagens ontbreken ineens in de bron en zijn NIET op verkocht gezet -- controleer de feed`);
  if (mislukt.length) notities.push('bron niet gelezen: ' + mislukt.map((b) => b.provider + ' ' + perBron[b.provider].genorm.code).join(', ') + ' -- niets aangepast voor wagens die daar stonden');
  if (plan.dubbelGemeld) notities.push(`${plan.dubbelGemeld} advertentie(s) pasten op meerdere wagens (zelfde chassisnummer) en zijn niet samengevoegd`);
  if (advFout) notities.push(`${advFout} advertentierij(en) niet weggeschreven`);
  const partial = res.failed > 0 || res.afgekapt || plan.dalingGeblokkeerd || mislukt.length > 0;

  for (const b of geslaagd) {
    const st = plan.perBron[b.provider] || {};
    perBron[b.provider].stand = { nieuw: st.nieuw || 0, bijgewerkt: (st.bijgewerkt || 0), verwijderd: st.verwijderd || 0, gekoppeld: st.gekoppeld || 0, dalingGeblokkeerd: Boolean(st.dalingGeblokkeerd) };
  }
  /* Een bron-eigen telling van wat het platform toont. Bij een bron levert dat
     het aantal uit de feed (zoals voor er meerdere waren); bij meer bronnen het
     aantal verschillende wagens. */
  const gezienTotaal = geslaagd.length === 1 ? telVoertuigen : Object.values(plan.perBron).reduce((n, s) => n + s.gezien, 0);
  return {
    count: gezienTotaal,
    changed: plan.nieuw.length + plan.bijwerken.length,
    removed: plan.weg.length,
    failed: res.failed,
    ongeldig: geslaagd.reduce((n, b) => n + (perBron[b.provider].feed.ongeldig || 0), 0),
    aangemaakt: plan.nieuw.length,
    bijgewerkt: plan.bijwerken.length,
    geadopteerd: plan.geadopteerd,
    verkocht: plan.weg.filter((w) => w.invoer.status === 'verkocht').length,
    ongewijzigdAantal: plan.ongewijzigd,
    dalingGeblokkeerd: plan.dalingGeblokkeerd,
    verdwenenAantal: plan.verdwenenAantal,
    /* Een run met fouten of een tegengehouden daling mag de volgende niet laten
       overslaan: dezelfde bronnen moeten dan opnieuw vergeleken worden. */
    feedHash: partial ? '' : versie,
    version: versie,
    partial,
    listingsKlaar: lijstAdv.beschikbaar === true && !partial,
    notitie: notities.join(' · '),
    perBron, geslaagd, mislukt,
  };
}

/* De toestand per bron die in 'Inventory State' bewaard wordt. */
function bronToestand(vorige, uitkomst, nuIso, ms) {
  const v = vorige || {};
  const basis = { lastAttemptAt: nuIso, durationMs: ms };
  if (!uitkomst) return Object.assign({}, v, basis);
  if (uitkomst.overgeslagen) return Object.assign({}, v, basis, { lastResult: 'skipped', lastErrorCode: '', lastErrorKey: '', lastErrorLegacy: '' });
  if (uitkomst.fout) {
    /* Hoeveel keer op rij deze bron faalde. Een toestand van voor de teller
       met lastResult 'failed' telt als een keer. */
    const eerder = Number(v.fouten) || (v.lastResult === 'failed' ? 1 : 0);
    return Object.assign({}, v, basis, {
      lastResult: 'failed', feedHash: '', fouten: eerder + 1,
      lastErrorCode: uitkomst.genorm.code, lastErrorKey: uitkomst.genorm.sleutel, lastErrorLegacy: uitkomst.genorm.legacy,
    });
  }
  const st = uitkomst.stand || {};
  return Object.assign({}, v, basis, {
    lastResult: 'ok', lastSuccessAt: nuIso, lastErrorCode: '', lastErrorKey: '', lastErrorLegacy: '', fouten: 0,
    count: uitkomst.feed.voertuigen.length,
    imported: st.nieuw || 0, updated: st.bijgewerkt || 0, removed: st.verwijderd || 0,
    feedHash: uitkomst.feed.hash,
  });
}

/* ── Sync: slot, bronnen, toestand wegschrijven ────────────────────────── */
async function sync(projectCode, { door = 'systeem', trigger = 'handmatig', bevestigDaling = false, budgetMs, upload = null } = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new Error('sync zonder projectcode');
  const { rec, bron, staat } = await lees(tenant);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };

  let token;
  try { token = await neemSlot(rec, staat, door); }
  catch (e) {
    if (e.onbekendVeld) { try { require('./_schema').ensureLui(); } catch (_) { /* optioneel */ } }
    return { ok: false, reden: e.onbekendVeld ? 'schema_ontbreekt' : 'slot_mislukt', status: bereken(staat, bron) };
  }
  /* Er loopt al een sync: die hergebruiken in plaats van er een tweede naast
     te zetten. De aanroeper krijgt SYNCING en ziet het resultaat bij de
     volgende controle. */
  if (!token) return { ok: true, hergebruikt: true, ...weergave(staat, bron) };

  const start = Date.now();
  const nuIso = new Date(start).toISOString();
  let resultaat, fout = null, perBron = {};
  try {
    resultaat = (bron.type === 'feed' || upload) ? await syncBronnen(tenant, bron, staat, { bevestigDaling, provider: { budgetMs }, upload }) : await probeNative(tenant, staat);
    if (resultaat && resultaat.perBron) perBron = resultaat.perBron;
  } catch (e) {
    fout = e;
    if (e && e.perBron) perBron = e.perBron;
  }
  const ms = Date.now() - start;
  const genorm = fout ? fouten.normaliseer(fout) : null;
  const run = {
    at: nuIso, trigger, door,
    ok: !fout, ms,
    count: resultaat ? resultaat.count : undefined,
    changed: resultaat ? resultaat.changed : undefined,
    removed: resultaat ? resultaat.removed : undefined,
    failed: resultaat ? resultaat.failed : undefined,
    /* De uitsplitsing die het dashboard toont: "3 nieuw, 1 verkocht". */
    aangemaakt: resultaat ? resultaat.aangemaakt : undefined,
    bijgewerkt: resultaat ? resultaat.bijgewerkt : undefined,
    verkocht: resultaat ? resultaat.verkocht : undefined,
    geadopteerd: resultaat ? resultaat.geadopteerd : undefined,
    daling: resultaat && resultaat.dalingGeblokkeerd ? resultaat.verdwenenAantal : undefined,
    fout: fout ? String(fout.message).slice(0, 200) : undefined,
    code: fout ? (fout.code || 'fout') : undefined,
    foutCode: genorm ? genorm.code : undefined,
  };
  /* Per bron: hoe ging het? Alleen bij een feedrun; native heeft geen bronnen. */
  const bronnenStaat = Object.assign({}, staat.bronnen || {});
  const draaibaar = upload ? bron.bronnen.filter((b) => b.provider === upload.provider)
    : (bron.type === 'feed' ? bron.bronnen.filter((b) => b.enabled && !isUploadBron(b)) : []);
  for (const b of draaibaar) {
    const syncbaar = registry.kanSyncen(registry.get(b.provider));
    const uitkomst = syncbaar ? perBron[b.provider] : { overgeslagen: true };
    bronnenStaat[b.provider] = bronToestand(vorigeVan(staat, b, bron.bronnen.indexOf(b)), uitkomst, nuIso, ms);
    if (resultaat && resultaat.partial) bronnenStaat[b.provider].feedHash = '';
  }
  if (bron.type === 'feed' || upload) run.bronnen = draaibaar.map((b) => ({ p: b.provider, ok: bronnenStaat[b.provider].lastResult !== 'failed', code: bronnenStaat[b.provider].lastErrorCode || undefined }));

  /* Een upload is een aanvulling op de bron, geen nieuwe controle van de hele
     voorraad: hij raakt alleen de toestand van zijn eigen bron en de
     geschiedenis. Een mislukte upload (leeg bestand, onleesbaar) mag de dealer
     niet als "voorraad mislukt" zichtbaar maken, en een geslaagde maakt een
     voorraad die al uren niet gelezen werd niet ineens "vers". */
  const nieuw = upload ? Object.assign({}, staat, {
    slot: null, bronnen: bronnenStaat,
    runs: [run].concat(Array.isArray(staat.runs) ? staat.runs : []).slice(0, GESCHIEDENIS),
  }) : Object.assign({}, staat, {
    source: bron.type,
    lastAttemptAt: nuIso,
    lastResult: fout ? 'failed' : (resultaat.partial ? 'partial' : 'ok'),
    lastError: fout ? run.fout : (resultaat.notitie || ''),
    lastErrorCode: fout ? run.code : '',
    durationMs: run.ms,
    slot: null,
    runs: [run].concat(Array.isArray(staat.runs) ? staat.runs : []).slice(0, GESCHIEDENIS),
  });
  if (!upload && bron.type === 'feed') nieuw.bronnen = bronnenStaat;
  if (!fout && !upload) {
    /* De versheid van het geheel is die van de OUDSTE bron: een platform dat
       niet gelezen kon worden maakt de voorraad niet "vers", ook al lukte de
       andere. Bij een bron is dit gewoon het moment van deze run. */
    const syncbareStaten = draaibaar.filter((b) => registry.kanSyncen(registry.get(b.provider))).map((b) => bronnenStaat[b.provider].lastSuccessAt || '');
    const oudste = bron.type === 'feed' && syncbareStaten.length
      ? (syncbareStaten.every(Boolean) ? syncbareStaten.slice().sort()[0] : '')
      : nuIso;
    Object.assign(nieuw, {
      lastSuccessAt: oudste,
      lastIncrementalAt: resultaat.ongewijzigd ? nuIso : (staat.lastIncrementalAt || ''),
      count: resultaat.count, changed: resultaat.changed, removed: resultaat.removed, failed: resultaat.failed,
      version: resultaat.version,
      generation: (Number(staat.generation) || 0) + (resultaat.version !== staat.version ? 1 : 0),
      feedHash: resultaat.feedHash || '',
      vingers: resultaat.vingers || staat.vingers,
      listingsKlaar: resultaat.ongewijzigd ? staat.listingsKlaar === true : resultaat.listingsKlaar === true,
    });
  }
  try { await schrijf(rec.id, { [F_STATE]: JSON.stringify(nieuw) }); }
  catch (e) { console.error('[voorraad] toestand niet weggeschreven voor', tenant, e.message); }

  /* Een geslaagde controle waarbij niets veranderde is geen gebeurtenis: elke
     paginalading deed er een, en de activiteitenpagina stond vol "Voorraad
     gecontroleerd". Wel loggen als er iets veranderde, bij een fout, of als de
     dealer er zelf op drukte. */
  const stilleControle = !fout && trigger !== 'handmatig'
    && !(run.changed || run.removed || run.failed || run.aangemaakt || run.verkocht || run.daling);
  try {
    if (stilleControle) throw new Error('stil');
    const _activiteit = require('./_activiteit');
    _activiteit.log(tenant, fout ? 'inventory_sync_failed' : 'inventory_synced', {
      details: { bron: bron.type, trigger, count: run.count, changed: run.changed, removed: run.removed, failed: run.failed, aangemaakt: run.aangemaakt, verkocht: run.verkocht, daling: run.daling, code: run.code, foutCode: run.foutCode, ms: run.ms },
    }).catch(() => {});
  } catch (_) { /* logboek optioneel */ }
  /* Technische tekst alleen hier, in de log: de dealer krijgt de genormaliseerde zin. */
  if (fout) console.warn('[voorraad] sync mislukt voor', tenant, bron.type, fout.code || '', fout.message);
  for (const b of draaibaar) {
    const u = perBron[b.provider];
    if (u && u.fout && resultaat) console.warn('[voorraad] bron mislukt voor', tenant, b.provider, u.genorm.code, u.fout.code || '', u.fout.message);
  }
  if (!upload) {
    meldVoorraadAlsNodig(tenant, bron, staat, run, resultaat);
    meldBronAlsNodig(tenant, draaibaar, bronnenStaat, resultaat);
  }
  const antwoord = { ok: !fout, ...weergave(nieuw, bron) };
  if (upload) {
    antwoord.upload = {
      provider: upload.provider,
      ok: !fout,
      foutCode: genorm ? genorm.code : '',
      foutSleutel: genorm ? genorm.sleutel : '',
      aantal: upload.feed.voertuigen.length,
      ongeldig: upload.feed.ongeldig || 0,
      aangemaakt: resultaat ? resultaat.aangemaakt || 0 : 0,
      bijgewerkt: resultaat ? resultaat.bijgewerkt || 0 : 0,
      verkocht: resultaat ? resultaat.verkocht || 0 : 0,
      /* Meer dan de helft van de wagens van dit platform ontbreekt in het bestand:
         niets is op verkocht gezet. Het scherm vraagt of dat klopt en stuurt het
         bestand dan opnieuw met bevestigDaling. */
      dalingGeblokkeerd: Boolean(resultaat && resultaat.dalingGeblokkeerd),
      verdwenenAantal: resultaat && resultaat.dalingGeblokkeerd ? resultaat.verdwenenAantal : 0,
    };
  }
  return antwoord;
}

/* De dealer moet het weten zonder de Voertuigen-pagina open te hebben
   (audit 26/09). Alleen bij een OVERGANG, zodat een feed die een dag plat ligt
   geen 24 meldingen geeft:
     - de tweede mislukte feed-sync op rij (één keer haperen is normaal)
     - een geblokkeerde massale verdwijning (eerste run met die blokkade)
   Push zonder namen; vuur-en-vergeet. */
function meldVoorraadAlsNodig(tenant, bron, staat, run, resultaat) {
  if (!bron || bron.type !== 'feed') return;
  const vorige = (Array.isArray(staat && staat.runs) ? staat.runs : []);
  let tekstSleutel = '', vars;
  if (!run.ok && vorige[0] && vorige[0].ok === false && !(vorige[1] && vorige[1].ok === false)) {
    tekstSleutel = 'push.voorraad.mislukt';
  } else if (run.ok && resultaat && resultaat.dalingGeblokkeerd && !(vorige[0] && vorige[0].daling)) {
    tekstSleutel = 'push.voorraad.daling';
    vars = { aantal: Number(resultaat.verdwenenAantal) || 0 };
  }
  if (!tekstSleutel) return;
  try {
    require('./_push').stuurVertaald({
      projectCode: tenant, titelSleutel: 'push.voorraad.titel', tekstSleutel, vars,
      url: 'https://app.helvaro.pro/dashboard',
    }).catch(() => {});
  } catch (_) { /* push is bijzaak */ }
}

/* Een bron die twee keer op rij faalt terwijl een andere gewoon slaagt: de
   run als geheel is dan "gedeeltelijk", er is geen run-melding, en de dealer
   weet niet dat een platform al uren niet gelezen wordt. Dezelfde regels als
   hierboven: alleen bij de OVERGANG (de tweede mislukking), niet bij elke
   volgende. Is alles mislukt, dan meldt meldVoorraadAlsNodig dat al. */
function meldBronAlsNodig(tenant, draaibaar, bronnenStaat, resultaat) {
  if (!resultaat || !Array.isArray(resultaat.geslaagd) || !resultaat.geslaagd.length) return;
  for (const b of draaibaar || []) {
    const st = bronnenStaat && bronnenStaat[b.provider];
    if (!st || st.lastResult !== 'failed' || st.fouten !== 2) continue;
    const p = registry.get(b.provider);
    try {
      require('./_push').stuurVertaald({
        projectCode: tenant, titelSleutel: 'push.voorraad.titel', tekstSleutel: 'push.voorraad.bron',
        vars: { bron: p ? p.label : b.provider },
        url: 'https://app.helvaro.pro/dashboard',
      }).catch(() => {});
    } catch (_) { /* push is bijzaak */ }
  }
}

/**
 * De versheidscontrole bij inloggen en verversen. Licht: alleen metadata lezen;
 * pas als de voorraad verouderd is (of nooit gecontroleerd) volgt een sync.
 */
async function controleer(projectCode, { door = 'dashboard', trigger = 'verversen' } = {}) {
  const { rec, bron, staat } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  const b = bereken(staat, bron);
  if (b.status === 'HEALTHY' || b.status === 'SYNCING') return { ok: true, gesynct: false, ...weergave(staat, bron) };
  const uit = await sync(projectCode, { door, trigger });
  return Object.assign({ gesynct: !uit.hergebruikt }, uit);
}

/* Eén provider voor de integratiekaart: wat het is, of het verbonden is, wat de
   laatste run deed. Geen inloggegevens, geen vingerafdrukken, nooit de
   geheimen in een feedadres. De foutzin is een i18n-sleutel; de technische
   tekst blijft in de log. */
function providerKaart(p, b, st) {
  const s = st || {};
  const upload = Boolean(b) && isUploadBron(b);
  /* Wat "verbonden" betekent hangt van het soort koppeling af: inloggegevens,
     een klantnummer, een adres -- of een eerder geuploade export. */
  const geconfigureerd = Boolean(b) && (typeof p.isGeconfigureerd === 'function' ? p.isGeconfigureerd(b)
    : registry.vraagtCredentials(p) ? Boolean(b.credentials)
    : p.auth === 'customer_id' ? Boolean(b.customerId)
    : (Boolean(b.url) || upload));
  return Object.assign({
    id: p.id, label: p.label, status: p.status, auth: p.auth,
    alleenPubliceren: p.alleenPubliceren === true,
    adresSoort: p.adresSoort || 'feed',
    /* i18n-sleutels voor de kaart: een eigen wachttekst en een uitleg per platform. */
    wachtSleutel: p.status === 'FEED_REQUIRED' ? (p.wachtSleutel || 'ig.wacht') : '',
    uitlegSleutel: p.uitlegSleutel || '',
    capabilities: p.capabilities,
    kanVerbinden: registry.kanBewaren(p),
    kanSyncen: registry.kanSyncen(p),
    kanUploaden: registry.kanUploaden(p),
    uploadBron: upload,
    geconfigureerd,
    enabled: Boolean(b) && b.enabled,
    heeftCredentials: Boolean(b && b.credentials),
    /* De id's van de dealer zelf (klantnummer, verkoper-id): geen geheimen, wel nodig om te bewerken. */
    klantnummer: b && b.customerId ? String(b.customerId) : '',
    verkoperId: b && b.mobileSellerId ? String(b.mobileSellerId) : '',
    url: b ? maskeerUrl(b.url) : '',
    verdwenen: b ? b.verdwenen : 'verkocht',
    laatsteSync: s.lastAttemptAt || null,
    laatsteSucces: s.lastSuccessAt || null,
    resultaat: s.lastResult || null,
    aantal: Number.isFinite(s.count) ? s.count : null,
    nieuw: Number.isFinite(s.imported) ? s.imported : null,
    bijgewerkt: Number.isFinite(s.updated) ? s.updated : null,
    verwijderd: Number.isFinite(s.removed) ? s.removed : null,
    foutCode: s.lastErrorCode || '',
    foutSleutel: s.lastErrorCode ? (s.lastErrorKey || 'ig.fout.' + s.lastErrorCode) : '',
  }, typeof p.kaartExtra === 'function' ? p.kaartExtra(b) : {});
}

/* De Meta-kaart krijgt het feedadres (alleen als adres en coordinaten er zijn) en,
   als de wagens meegegeven zijn, wat er in de feed zit en wat er waarom uit
   blijft. Het adres bevat de projectcode, die al in elke publieke link staat. */
function verrijkMeta(kaarten, projectCode, voertuigen, clientName) {
  const metaFeed = require('./_voorraad-providers/meta-feed');
  return kaarten.map((k) => {
    if (k.auth !== 'catalog_feed' || !k.meta) return k;
    const klaar = k.geconfigureerd;
    const uit = Object.assign({}, k, { feedUrl: klaar ? metaFeed.feedUrl(projectCode) : '' });
    if (klaar && Array.isArray(voertuigen)) {
      const r = metaFeed.bouw(voertuigen, { code: projectCode, clientName, meta: k.meta });
      uit.feedTelling = { inFeed: r.inFeed, weggelaten: r.weggelaten, redenen: r.redenen, gereserveerd: r.gereserveerd, ontbrekend: r.ontbrekend || [] };
    }
    return uit;
  });
}

/** Wat het dashboard ziet. Geen tokens, geen vingerafdrukken, geen feed-URL-geheimen. */
function weergave(staat, bron) {
  const s = staat || {};
  const b = bereken(s, bron);
  const v = vertrouwen(s, bron);
  return {
    status: b.status,
    ageMin: b.ageMin,
    waarschuwing: b.waarschuwing,
    vertrouwen: v.niveau,
    vertrouwenReden: v.reden,
    bron: bron ? bron.type : 'native',
    drempels: bron ? bron.drempels : STANDAARD.native,
    feed: bron && bron.type === 'feed' ? { url: maskeerUrl(bron.url), formaat: bron.formaat, verdwenen: bron.verdwenen, provider: bron.provider || 'feed' } : null,
    bronnen: bron && Array.isArray(bron.bronnen)
      ? bron.bronnen.map((x) => providerKaart(registry.get(x.provider), x, bronStaatVan(s, bron, x.provider))).filter((k) => k.id)
      : [],
    bewaarDagen: bron && bron.bewaarDagen ? bron.bewaarDagen : STANDAARD_BEWAAR_DAGEN,
    lastSuccessAt: s.lastSuccessAt || null,
    lastAttemptAt: s.lastAttemptAt || null,
    lastIncrementalAt: s.lastIncrementalAt || null,
    lastResult: s.lastResult || null,
    lastError: s.lastError || '',
    lastErrorCode: s.lastErrorCode || '',
    count: Number.isFinite(s.count) ? s.count : null,
    changed: Number.isFinite(s.changed) ? s.changed : null,
    removed: Number.isFinite(s.removed) ? s.removed : null,
    failed: Number.isFinite(s.failed) ? s.failed : null,
    durationMs: s.durationMs || null,
    version: s.version || null,
    generation: s.generation || 0,
    runs: (s.runs || []).slice(0, GESCHIEDENIS),
  };
}

async function status(projectCode) {
  const { rec, bron, staat } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  return { ok: true, ...weergave(staat, bron) };
}

/**
 * Alle bekende platformen voor de integratiepagina, met de stand van deze
 * dealer erbij. Alleen lezen.
 */
async function providersOverzicht(projectCode) {
  const { rec, bron, staat } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  let kaarten = registry.lijst().map((p) => providerKaart(p, bron.bronnen.find((x) => x.provider === p.id) || null, bronStaatVan(staat, bron, p.id)));
  /* De telling voor Meta kost een voertuigenlijst; alleen als Meta klaar staat, en zonder telling als dat mislukt. */
  let voertuigen = null;
  if (kaarten.some((k) => k.auth === 'catalog_feed' && k.geconfigureerd)) {
    try {
      const _v = require('./_vehicles');
      if (await _v.available()) voertuigen = await _v.list(projectCode, { inclusiefGearchiveerd: true });
    } catch (e) { console.warn('[voorraad] Meta-telling mislukt:', e && e.message); }
  }
  kaarten = verrijkMeta(kaarten, projectCode, voertuigen, String((rec.fields && rec.fields['Client Name']) || '').trim());
  return { ok: true, bewaarDagen: bron.bewaarDagen, providers: kaarten };
}

/**
 * Een wagen uit de bron uitsluiten (na verwijderen), zodat de sync hem niet
 * terugzet. bronId is het Source Record ID van de wagen zoals het in de
 * voorraad staat -- voor een tweede platform dus met "<provider>:" ervoor.
 */
async function sluitUit(projectCode, bronId) {
  const id = String(bronId || '').trim();
  if (!id) return { ok: false, reden: 'geen_bronid' };
  const { rec, bron } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  if (bron.type !== 'feed') return { ok: true, overgeslagen: true };
  const nieuw = saneerBron(Object.assign({}, bron, { uitgesloten: (bron.uitgeslotenAlle || []).concat(id) }));
  await schrijf(rec.id, { [F_SOURCE]: JSON.stringify(naarOpslag(nieuw)) });
  return { ok: true };
}

/**
 * Is dit klantnummer al aan een ANDERE dealer gekoppeld?
 *
 * De gegevens van Helvaro als data provider werken voor elk AutoScout24-
 * klantnummer dat Helvaro heeft gemachtigd. Een klantnummer is geen geheim: zonder
 * deze controle kon dealer A het nummer van dealer B invullen en B's voorraad in
 * zijn eigen account lezen. Een nummer hoort bij een dealer; een tweede dealer
 * die hetzelfde nummer opgeeft wordt geweigerd. (Dat is een vangnet, geen
 * bewijs van wie het nummer is: zie docs/integrations/autoscout24_api/AUTH.md.)
 */
async function klantnummerBezet(projectCode, customerId) {
  const naald = '"customerId":' + JSON.stringify(String(customerId));
  const formule = encodeURIComponent(`AND(FIND("${escapeFormula(naald)}", {${F_SOURCE}}), NOT({${F_PROJECT}}="${escapeFormula(projectCode)}"))`);
  const r = await at(`${CLIENTS_TABLE}?filterByFormula=${formule}&maxRecords=1&pageSize=1`);
  if (!r.ok) {
    /* Bestaat het veld nog nergens (schema nog niet gedraaid), dan heeft niemand een nummer. */
    const txt = await r.text().catch(() => '');
    if (r.status === 422 && /UNKNOWN_FIELD_NAME/.test(txt)) return false;
    const e = new Error('klantnummer controleren ' + r.status);
    e.status = r.status;
    throw e;
  }
  const d = await r.json();
  return Array.isArray(d.records) && d.records.length > 0;
}

/**
 * De ids van de advertenties van een verwijderde wagen uitsluiten, op elk
 * platform: een wagen die de dealer zelf wegdeed komt niet terug omdat een
 * tweede platform hem nog toont. Alleen rijen van deze dealer.
 */
async function sluitUitAdvertenties(projectCode, rijen) {
  const tenant = String(projectCode || '').trim();
  const { rec, bron } = await lees(tenant);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  const eigen = (Array.isArray(rijen) ? rijen : []).filter((l) => l && l.projectCode === tenant && l.provider && l.externalId);
  if (!eigen.length || bron.type !== 'feed') return { ok: true, overgeslagen: true };
  const _s = require('./_voorraad-sync');
  const ids = eigen.map((l) => _s.bronIdVoor(l.provider, l.externalId, bron.legacyProvider));
  const nieuw = saneerBron(Object.assign({}, bron, { uitgesloten: (bron.uitgeslotenAlle || []).concat(ids) }));
  await schrijf(rec.id, { [F_SOURCE]: JSON.stringify(naarOpslag(nieuw)) });
  return { ok: true, aantal: ids.length };
}

/* Is dit de platte vorm van het oude formulier ("de voorraadbron instellen")? */
function isLegacyInvoer(invoer) { return invoer && typeof invoer === 'object' && !Array.isArray(invoer.bronnen); }

/**
 * De oude weg: een bron kiezen (native, of een feed/AutoScout24-profiel). Dat
 * formulier kent maar twee soorten, en kiest er een: wat het eerder koos
 * wordt vervangen, wat het niet kent (een API-koppeling) blijft staan.
 */
async function bewaarBron(projectCode, invoer) {
  const { rec, staat, bron: huidig } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  const ruw = isLegacyInvoer(invoer) ? invoer : {};
  const gewenst = saneerBron(Object.assign({}, ruw, { uitgesloten: ruw.uitgesloten ? ruw.uitgesloten : huidig.uitgeslotenAlle }));
  const nieuwItem = gewenst.type === 'feed' ? gewenst.bronnen.find((b) => b.enabled) : null;
  if (gewenst.type === 'feed' && !gewenst.url) return { ok: false, reden: 'ongeldig_adres' };
  /* Wat het formulier beheert: de feed- en profielbronnen. De rest blijft. */
  const formulierBeheerd = (b) => { const p = registry.get(b.provider); return Boolean(p) && p.auth === 'feed_url'; };
  const rest = huidig.bronnen.filter((b) => !formulierBeheerd(b));
  const eerste = huidig.bronnen.findIndex(formulierBeheerd);
  const lijst = rest.slice();
  if (nieuwItem) lijst.splice(eerste >= 0 ? Math.min(eerste, lijst.length) : lijst.length, 0, nieuwItem);
  const bron = saneerBron({ bronnen: lijst, drempels: gewenst.drempels, bewaarDagen: ruw.bewaarDagen !== undefined ? ruw.bewaarDagen : huidig.bewaarDagen, legacyProvider: huidig.bronnen.length ? huidig.legacyProvider : (nieuwItem ? nieuwItem.provider : undefined), uitgesloten: gewenst.uitgeslotenAlle });
  /* Van bron wisselen = de vorige toestand geldt niet meer. */
  const nieuweStaat = Object.assign({}, staat, { feedHash: '', lastResult: staat.lastResult === 'ok' ? 'ok' : staat.lastResult });
  if (nieuweStaat.bronnen && nieuwItem) nieuweStaat.bronnen = Object.assign({}, nieuweStaat.bronnen, { [nieuwItem.provider]: Object.assign({}, nieuweStaat.bronnen[nieuwItem.provider], { feedHash: '' }) });
  await schrijf(rec.id, { [F_SOURCE]: JSON.stringify(naarOpslag(bron)), [F_STATE]: JSON.stringify(nieuweStaat) });
  return { ok: true, ...weergave(nieuweStaat, bron) };
}

/**
 * Een platform instellen vanaf de integratiepagina: adres, inloggegevens, aan
 * of uit, of weghalen. Inloggegevens worden hier versleuteld en komen nooit
 * meer terug.
 *   { provider, url?, formaat?, verdwenen?, enabled?, credentials?, verwijder? }
 *   { bewaarDagen }   (zonder provider: de bewaartermijn van verkochte wagens)
 */
async function bewaarProvider(projectCode, invoer) {
  const { rec, staat, bron: huidig } = await lees(projectCode);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  const inv = invoer && typeof invoer === 'object' ? invoer : {};
  let bronnen = huidig.bronnen.map((b) => Object.assign({}, b));
  let bewaarDagen = huidig.bewaarDagen;
  const nieuweStaat = Object.assign({}, staat);
  let legacyProvider = huidig.bronnen.length ? huidig.legacyProvider : undefined;

  if (inv.bewaarDagen !== undefined) {
    const n = Number(inv.bewaarDagen);
    if (!Number.isFinite(n) || n < 1 || n > 365) return { ok: false, reden: 'ongeldige_bewaartermijn' };
    bewaarDagen = Math.round(n);
  }
  if (inv.provider !== undefined) {
    const p = registry.get(String(inv.provider));
    if (!p) return { ok: false, reden: 'onbekende_provider' };
    if (inv.verwijder === true) {
      bronnen = bronnen.filter((b) => b.provider !== p.id);
    } else {
      /* COMING_SOON en DISABLED: er is niets om te bewaren. */
      if (!registry.kanBewaren(p)) return { ok: false, reden: 'provider_niet_beschikbaar' };
      if (typeof p.valideerInvoer === 'function') {
        const reden = p.valideerInvoer(inv);
        if (reden) return { ok: false, reden };
      }
      const bestaand = bronnen.find((b) => b.provider === p.id);
      const ruw = Object.assign({}, bestaand || {}, { provider: p.id });
      for (const k of ['url', 'formaat', 'verdwenen', 'enabled'].concat(p.velden || [])) if (inv[k] !== undefined) ruw[k] = inv[k];
      /* Het scherm toont een adres met het geheim afgeschermd (token=***). Wie
         dat ongewijzigd terugstuurt, laat het adres zoals het is; een adres
         waar *** nog in staat maar dat anders is, kan nooit werken. */
      if (typeof inv.url === 'string' && bestaand && bestaand.url && inv.url.trim() === maskeerUrl(bestaand.url)) ruw.url = bestaand.url;
      else if (typeof inv.url === 'string' && /=\*{3}/.test(inv.url)) return { ok: false, reden: 'ongeldig_adres' };
      if (registry.vraagtCredentials(p) && inv.credentials !== undefined) {
        const c = credentials.saneer(inv.credentials, p.auth);
        if (!c) return { ok: false, reden: 'ongeldige_gegevens' };
        try { ruw.credentials = credentials.versleutel(c); }
        catch (e) { console.error('[voorraad] inloggegevens niet versleuteld:', e && e.message); return { ok: false, reden: 'geen_versleuteling' }; }
      }
      /* Een bron die alleen een bestand krijgt: markeren, tenzij er een adres is. */
      if (inv.uploadBron === true && registry.kanUploaden(p)) ruw.upload = true;
      const item = saneerBronItem(ruw);
      /* Een eigen veld van het platform (klantnummer, verkoper-id) dat niet door de saneer komt, is fout ingevuld. */
      for (const k of p.velden || []) if (inv[k] !== undefined && String(inv[k]).trim() !== '' && !item[k]) return { ok: false, reden: 'ongeldige_gegevens' };
      if (p.auth === 'customer_id' && !item.customerId) return { ok: false, reden: 'ongeldige_gegevens' };
      if (p.auth === 'customer_id') {
        let bezet;
        try { bezet = await klantnummerBezet(projectCode, item.customerId); }
        catch (e) { console.error('[voorraad] klantnummer niet gecontroleerd:', e && e.message); return { ok: false, reden: 'controle_mislukt' }; }
        if (bezet) return { ok: false, reden: 'klantnummer_bezet' };
      }
      /* Een bron zonder adres kan alleen als de dealer er een bestand voor uploadt. */
      if ((p.auth === 'feed_url' || p.auth === 'csv') && !item.url && !(inv.uploadBron === true && registry.kanUploaden(p))) return { ok: false, reden: 'ongeldig_adres' };
      if (registry.vraagtCredentials(p) && !item.credentials) return { ok: false, reden: 'geen_gegevens' };
      const plek = bronnen.findIndex((b) => b.provider === p.id);
      if (plek >= 0) bronnen[plek] = item; else bronnen.push(item);
      if (legacyProvider === undefined && registry.kanSyncen(p)) legacyProvider = p.id;
      /* Een gewijzigd adres of nieuwe gegevens: opnieuw vergelijken. */
      if (nieuweStaat.bronnen && nieuweStaat.bronnen[p.id]) nieuweStaat.bronnen = Object.assign({}, nieuweStaat.bronnen, { [p.id]: Object.assign({}, nieuweStaat.bronnen[p.id], { feedHash: '' }) });
      nieuweStaat.feedHash = '';
    }
  }
  const bron = saneerBron({ bronnen, bewaarDagen, legacyProvider, drempels: huidig.drempels, uitgesloten: huidig.uitgeslotenAlle });
  await schrijf(rec.id, { [F_SOURCE]: JSON.stringify(naarOpslag(bron)), [F_STATE]: JSON.stringify(nieuweStaat) });
  return { ok: true, ...weergave(nieuweStaat, bron), providers: verrijkMeta(registry.lijst().map((p) => providerKaart(p, bron.bronnen.find((x) => x.provider === p.id) || null, bronStaatVan(nieuweStaat, bron, p.id))), projectCode, null, '') };
}

/**
 * Een exportbestand van de dealer als bron: voor een platform zonder adres dat
 * hij kan geven (Gocar.be heeft geen publieke koppeling), of een DMS dat alleen
 * een bestand levert. Het bestand wordt precies zo gelezen als een feed (CSV,
 * JSON of XML, zelfde kolomnamen, zelfde regels) en loopt door dezelfde sync als
 * elke andere bron -- met een eigen veiligheid: een bestand is een momentopname,
 * dus laat het meer dan de helft van de actieve wagens van dit platform vallen,
 * dan wordt NIETS op verkocht gezet tot de dealer het bevestigt.
 *
 * De tenant komt van de aanroeper (de sessie); niets in `invoer` kiest een dealer.
 * @param {string} projectCode
 * @param {{provider:string, tekst:string, bevestigDaling?:boolean, door?:string, budgetMs?:number}} invoer
 * @returns {Promise<object>} { ok:false, reden } of het resultaat van sync() met `upload` erin
 */
async function syncUpload(projectCode, invoer = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new Error('upload zonder projectcode');
  const p = registry.get(String(invoer.provider || ''));
  if (!p) return { ok: false, reden: 'onbekende_provider' };
  if (!registry.kanUploaden(p)) return { ok: false, reden: 'upload_niet_mogelijk' };
  const tekst = typeof invoer.tekst === 'string' ? invoer.tekst : '';
  if (!tekst.trim()) return { ok: false, reden: 'geen_bestand' };
  if (Buffer.byteLength(tekst, 'utf8') > MAX_UPLOAD_BYTES) return { ok: false, reden: 'bestand_te_groot' };
  let feed;
  try { feed = feedModule.parseFeed(tekst, 'auto', ''); }
  catch (_) { return { ok: false, reden: 'bestand_onleesbaar' }; }
  if (!feed.voertuigen.length) return { ok: false, reden: 'bestand_leeg' };

  /* Heeft de dealer dit platform nog niet als bron, dan wordt het er een zonder adres. */
  const { rec, bron } = await lees(tenant);
  if (!rec) return { ok: false, reden: 'geen_klantrecord' };
  if (!bron.bronnen.some((b) => b.provider === p.id)) {
    const o = await bewaarProvider(tenant, { provider: p.id, uploadBron: true });
    if (!o.ok) return o;
  }
  return sync(tenant, { door: invoer.door || 'dashboard', trigger: 'upload', bevestigDaling: invoer.bevestigDaling === true, budgetMs: invoer.budgetMs, upload: { provider: p.id, feed } });
}

/** Voor de AI-beurt: kan ik voorraadfeiten bevestigen? Faalt veilig naar 'onzeker'. */
async function vertrouwenVoor(projectCode) {
  try {
    const { bron, staat } = await lees(projectCode);
    return vertrouwen(staat, bron);
  } catch (e) {
    return { niveau: 'onzeker', reden: 'status_onbereikbaar', status: 'UNKNOWN' };
  }
}

/* ── Eindcontrole vlak voor versturen ──────────────────────────────────── */

/** Wat van een voertuig in een antwoord terecht kan komen. */
/* Noemt dit antwoord dit voertuig? Op code (V12) of op merk + model. Gedeeld
   door de websiteassistent en WhatsApp, zodat beide kanalen dezelfde wagens
   vlak voor verzenden opnieuw lezen (audit 26/09: WhatsApp las alleen de
   herkende wagen, niet de andere die het antwoord noemde). */
function genoemdIn(antwoord, v) {
  const t = String(antwoord || '').toLowerCase();
  if (!v) return false;
  if (v.code && new RegExp('\\b' + String(v.code).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t)) return true;
  return Boolean(v.merk && v.model && t.includes(String(v.merk).toLowerCase()) && t.includes(String(v.model).toLowerCase()));
}

/* De voertuigen uit een lijst die het antwoord noemt, plus een vast voertuig
   (het herkende) -- als momentopnames, zonder dubbels. */
function genoemdeMomentopnames(antwoord, lijst, vast) {
  const uit = new Map();
  if (vast) uit.set(vast.code, vast);
  for (const v of (lijst || [])) {
    if (v && v.code && !uit.has(v.code) && genoemdIn(antwoord, v)) uit.set(v.code, momentopname(v));
  }
  return Array.from(uit.values());
}

function momentopname(v) {
  if (!v) return null;
  return { code: v.code, status: vehicles.normStatus(v.status), prijs: v.prijs == null ? null : Number(v.prijs), km: v.km == null ? null : Number(v.km), gearchiveerd: v.gearchiveerd === true };
}

/**
 * Lees de voertuigen van een antwoord opnieuw en vergelijk met wat de AI zag.
 * @param {string} projectCode
 * @param {object[]} snapshots  momentopname()-objecten van bij het schrijven
 * @returns {Promise<{ok:boolean, veranderd:object[], onleesbaar:boolean}>}
 */
async function hercontroleer(projectCode, snapshots) {
  const lijst = (snapshots || []).filter(Boolean);
  if (!lijst.length) return { ok: true, veranderd: [], onleesbaar: false };
  const veranderd = [];
  for (const oud of lijst.slice(0, 12)) {
    const gelezen = await vehicles.leesVers(projectCode, oud.code);
    if (!gelezen.gelezen) return { ok: false, veranderd, onleesbaar: true };
    const nu = gelezen.voertuig;
    const vers = momentopname(nu);
    if (!vers) { veranderd.push({ code: oud.code, wat: 'verdwenen', oud, nu: null }); continue; }
    const wat = [];
    if (vers.status !== oud.status) wat.push('status');
    if (vers.prijs !== oud.prijs) wat.push('prijs');
    if (vers.km !== oud.km) wat.push('km');
    if (vers.gearchiveerd !== oud.gearchiveerd) wat.push('gearchiveerd');
    if (wat.length) veranderd.push({ code: oud.code, wat: wat.join(','), oud, nu: vers, voertuig: nu });
  }
  return { ok: veranderd.length === 0, veranderd, onleesbaar: false };
}

/* Een bedrag of kilometerstand zoals hij in een bericht staat: '24.950',
   '24 950', "24'950", '24950'. Duizendtallen weg, dan zoeken op cijfers. */
function noemtGetal(tekst, n) {
  if (n == null || !Number.isFinite(Number(n)) || Number(n) < 100) return false;
  const plat = String(tekst || '').replace(/(\d)[.\s,'\u202f\u00a0](?=\d{3}(?!\d))/g, '$1');
  return new RegExp('(^|\\D)' + String(Math.round(Number(n))) + '(?!\\d)').test(plat);
}

/**
 * Wat er met een klaar antwoord moet gebeuren nadat de voertuigen opnieuw
 * gelezen zijn. Puur; de aanroeper verstuurt.
 *   versturen     niets veranderd dat in dit antwoord staat
 *   onbeschikbaar een voertuig dat vrij was is intussen verkocht, gereserveerd,
 *                 uit aanbod of verdwenen -- het antwoord kan dat niet weten
 *   nakijken      prijs of kilometerstand in het antwoord klopt niet meer, of
 *                 er staat een prijs in en de controle kon niet lezen
 * @param {string} tekst
 * @param {object[]} snapshots  momentopname() van bij het schrijven
 * @param {{veranderd:object[], onleesbaar:boolean}} controle
 */
function beoordeelVoorVerzenden(tekst, snapshots, controle) {
  const lijst = (snapshots || []).filter(Boolean);
  if (!lijst.length || !controle) return { actie: 'versturen', reden: '' };
  if (controle.onleesbaar) {
    const noemtFeit = lijst.some((v) => noemtGetal(tekst, v.prijs) || noemtGetal(tekst, v.km));
    return noemtFeit ? { actie: 'nakijken', reden: 'controle_onleesbaar' } : { actie: 'versturen', reden: 'controle_onleesbaar' };
  }
  let uit = { actie: 'versturen', reden: '' };
  for (const v of controle.veranderd || []) {
    const oud = v.oud || {};
    const nu = v.nu;
    const wasVrij = oud.status === 'beschikbaar' && !oud.gearchiveerd;
    const nuVrij = Boolean(nu) && nu.status === 'beschikbaar' && !nu.gearchiveerd;
    if (wasVrij && !nuVrij) return { actie: 'onbeschikbaar', reden: nu ? ('status:' + nu.status + (nu.gearchiveerd ? ',gearchiveerd' : '')) : 'verdwenen', code: v.code };
    if (nu && nu.prijs !== oud.prijs && noemtGetal(tekst, oud.prijs)) uit = { actie: 'nakijken', reden: 'prijs', code: v.code };
    else if (nu && nu.km !== oud.km && noemtGetal(tekst, oud.km) && uit.actie === 'versturen') uit = { actie: 'nakijken', reden: 'km', code: v.code };
  }
  return uit;
}

/** De regel die de assistent krijgt als de voorraad niet te vertrouwen is. */
function promptNotitie(v) {
  if (!v || v.niveau !== 'onzeker') return '';
  return '\n\nVOORRAADSTATUS: de voorraad kon niet recent gecontroleerd worden. Bevestig NIET dat een voertuig '
    + 'beschikbaar is, noem geen prijs als definitief en plan geen proefrit. Zeg eerlijk dat je de actuele status '
    + 'laat nakijken door het team, en vraag hoe ze het liefst gecontacteerd worden.';
}

module.exports = {
  TOESTANDEN, STANDAARD, MAX_UPLOAD_BYTES,
  bereken, vertrouwen, saneerBron, naarOpslag, weergave,
  controleer, sync, syncUpload, status, bewaarBron, bewaarProvider, providersOverzicht, sluitUit, sluitUitAdvertenties, vertrouwenVoor,
  momentopname, hercontroleer, beoordeelVoorVerzenden, promptNotitie, genoemdIn, genoemdeMomentopnames, meldVoorraadAlsNodig, meldBronAlsNodig,
  // voor tests
  verrijkMeta,
  _test: {
    noemtGetal, hashVan, probeNative, klantnummerBezet, isInternIp, syncBronnen, saneerBronItem, providerKaart, vorigeVan, bronStaatVan, isUploadBron,
    parseCsv: feedModule.parseCsv, parseJson: feedModule.parseJson, parseXml: feedModule.parseXml,
    parseFeed: feedModule.parseFeed, mapRegel: feedModule.mapRegel,
    autoscoutDealerUrl: autoscoutModule.autoscoutDealerUrl, robotsStaatToe: autoscoutModule.robotsStaatToe,
    mapAutoscout: autoscoutModule.mapAutoscout, leesAutoscoutPagina: autoscoutModule.leesAutoscoutPagina,
    haalAutoscout: autoscoutModule.haalAutoscout,
  },
  autoscoutDealerUrl: autoscoutModule.autoscoutDealerUrl,
};
