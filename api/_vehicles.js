'use strict';
/*
 * Voertuigen -- de opslag, en de enige plek die weet wat een auto IS.
 *
 * ── Waarom dit bestaat, en waarom het op _properties.js lijkt ───────────────
 * Helvaro krijgt er een tweede markt bij. Een dealer heeft precies hetzelfde
 * probleem als een makelaar had: een lead schrijft "is die M4 nog vrij?" en de
 * AI wist niet over welke auto het ging, dus gokte hij, of hij vroeg het na --
 * en bij een auto die al verkocht was plande hij vrolijk een proefrit.
 *
 * Dit bestand is met opzet de spiegel van api/_properties.js: dezelfde vorm,
 * dezelfde tenant-regel, dezelfde terugval als de tabel er niet is. Dat is geen
 * luiheid maar het punt van een vertical -- de dealership deelt WhatsApp,
 * credits, facturatie, agenda, leads en gesprekken met vastgoed, en alleen WAT
 * er verkocht wordt verschilt. Twee bestanden die er anders uitzien voor
 * hetzelfde probleem worden twee bestanden die anders KAPOT gaan.
 *
 * ── Tenant, altijd ──────────────────────────────────────────────────────────
 * Elke functie neemt projectCode als EERSTE argument en elke query filtert
 * erop. Er is geen "haal voertuig X op" zonder eigenaarscontrole: de
 * voertuigcode kan in een publieke link staan en is dus te raden, en een dealer
 * hoort nooit de voorraad van een ander te zien.
 *
 * De projectCode komt van de aanroeper, uit de GEVERIFIEERDE sessie. Deze
 * module leest nooit een request.
 *
 * ── De tabel bestaat misschien nog niet ─────────────────────────────────────
 * Zolang die er niet is werkt de rest van Helvaro gewoon door: geen voertuigen
 * is hetzelfde als "deze dealer heeft er nog geen ingevoerd". Wat NIET mag is
 * dat het dashboard omvalt of dat de AI een auto verzint. Zie available().
 *
 * ── Geen route ──────────────────────────────────────────────────────────────
 * Onderstreepje voorop: Vercel Hobby staat twaalf functies toe en die zijn op.
 * De voertuigen hangen aan api/leads.js via body.mode, net als de panden.
 */

const { fetchPage } = require('./_lib/fetch-website');

const TABEL = 'vehicles';

/* Veldnamen en geen ids: de tabel is net aangemaakt en Airtable accepteert
   namen net zo goed. Op één plek, zodat hernoemen één wijziging is. */
const F = Object.freeze({
  code:        'Vehicle Code',
  project:     'Project Code',
  merk:        'Make',
  model:       'Model',
  uitvoering:  'Variant',
  prijs:       'Price',
  km:          'Mileage',
  inschrijving:'Registration',
  brandstof:   'Fuel',
  transmissie: 'Transmission',
  kw:          'Power KW',
  carrosserie: 'Body',
  kleur:       'Color',
  link:        'Listing URL',
  autoscout:   'AutoScout ID',
  status:      'Status',
  maxKorting:  'Max Discount EUR',
  faroKorting: 'Faro Discount Limit EUR',
  omschrijving:'Description',
  troeven:     'Highlights',
  fotos:       'Photo URLs',
  publiek:     'Public',
  gearchiveerd:'Archived',
  aangemaakt:  'Created At',
  bijgewerkt:  'Updated At',
  /* Herkomst (automotive engine, 2026-09-23): 'feed' voor voertuigen die uit
     een voorraadfeed komen (api/_inventaris.js), leeg voor handwerk. De feed
     raakt alleen zijn EIGEN voertuigen aan -- zie Source Record ID. */
  bron:        'Source',
  bronId:      'Source Record ID',
  gesynct:     'Synced At',
  /* Wanneer de wagen VERKOCHT werd. Wordt gezet op de overgang naar verkocht en
     gewist als hij terug in de verkoop gaat -- nooit uit de lucht gegrepen,
     altijd een echte statuswijziging. Zie verkochtOvergang() hieronder. */
  verkochtOp:  'Sold At',
});

class VehicleError extends Error {
  constructor(bericht, code) { super(bericht); this.name = 'VehicleError'; this.code = code; }
}

/* ── Status ──────────────────────────────────────────────────────────────────
 * Alleen 'beschikbaar' laat een proefrit toe. Dat was even anders: eerst mocht
 * 'gereserveerd' ook, met de gedachte dat een reservering kan afspringen en de
 * dealer dan blij is dat er nog iemand achter staat. Maar de spec is
 * aangescherpt: een gereserveerd voertuig mag GEEN tweede afspraak krijgen
 * zolang die reservering staat -- twee kopers die allebei denken dat "hun"
 * proefrit voor dezelfde auto is ingepland, is een ergere ochtend voor de
 * dealer dan een gemiste kans op een reservering die toch afspringt. Zie ook
 * `boekbaar()` verderop, die dezelfde regel toepast op het boeken zelf.
 *
 * Dit is een REM in de code, geen instructie aan het model. Een prompt is een
 * verzoek; dit is een regel.
 */
const RIJDBARE_STATUS = Object.freeze(['beschikbaar']);

/* Leeg = 'beschikbaar': zo is elk voertuig in Helvaro aangemaakt (save() zet
   het zo), en een dealer die de status nooit aanraakte ziet op zijn scherm ook
   'beschikbaar'. Maar een ONBEKENDE waarde -- een typefout, een feedwaarde die
   we niet kennen -- is geen beschikbaarheid. Dat was hij wel, tot 2026-09-23:
   alles wat niet herkend werd las als 'beschikbaar', en de assistent bood er
   een proefrit op aan. Nu 'onbekend': niet boekbaar, niet te bevestigen. */
const BEKENDE_STATUS = Object.freeze(['beschikbaar', 'gereserveerd', 'verkocht', 'uit aanbod', 'onbekend']);
function normStatus(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  if (!v) return 'beschikbaar';
  return BEKENDE_STATUS.indexOf(v) !== -1 ? v : 'onbekend';
}

function kanProefrit(status) { return RIJDBARE_STATUS.indexOf(normStatus(status)) !== -1; }

/**
 * DE enige plek die beslist of een voertuig NU geboekt mag worden.
 *
 * Waarom dit een aparte functie is naast `kanProefrit`: die laatste kijkt
 * alleen naar de status van het voertuig zelf. Boekbaarheid hangt ook af van
 * wat er al gepland staat -- een 'beschikbaar' voertuig met een actieve
 * afspraak morgenvroeg is voor NU niet vrij, ook al is de status prima. Alles
 * wat een tweede afspraak op hetzelfde voertuig zou willen aanmaken (WhatsApp,
 * dashboard, Faro) hoort hier eerst langs te komen, in plaats van zelf een
 * losse combinatie van status-checks te verzinnen.
 *
 * @param {object|null} voertuig
 * @param {object[]} [actieveAfspraken]  geboekte, toekomstige afspraken op DIT
 *                                       voertuig (zie api/_voertuigslot.js
 *                                       actieveAfspraken) -- mag leeg zijn.
 * @returns {{ok:boolean, reden: null|'verkocht'|'uit_aanbod'|'gereserveerd'|'afspraak_bestaat'|'onbekend'}}
 */
function boekbaar(voertuig, actieveAfspraken) {
  if (!voertuig) return { ok: false, reden: 'onbekend' };

  const status = normStatus(voertuig.status);
  if (status === 'verkocht')    return { ok: false, reden: 'verkocht' };
  if (status === 'uit aanbod')  return { ok: false, reden: 'uit_aanbod' };
  if (status === 'gereserveerd') return { ok: false, reden: 'gereserveerd' };
  if (status === 'onbekend')    return { ok: false, reden: 'onbekend' };

  const afspraken = Array.isArray(actieveAfspraken) ? actieveAfspraken : [];
  if (afspraken.length > 0) return { ok: false, reden: 'afspraak_bestaat' };

  return { ok: true, reden: null };
}

/**
 * De §6 operationele status van een voertuig -- afgeleid, nooit opgeslagen.
 * Dit is wat een verkoper op een kaart ziet en verschilt van `voertuig.status`
 * zodra er interesse of een afspraak bijkomt zonder dat de dealer zelf de
 * status hoeft aan te passen.
 *
 * @param {object|null} voertuig
 * @param {object[]} [actieveAfspraken]
 * @param {number}   [aantalGeinteresseerd]  aantal leads dat matcht (zie api/_wens.js)
 */
function operationeleStatus(voertuig, actieveAfspraken, aantalGeinteresseerd) {
  if (!voertuig) return 'beschikbaar';

  const status = normStatus(voertuig.status);
  if (status === 'verkocht')     return 'verkocht';
  if (status === 'uit aanbod')   return 'uit aanbod';
  if (status === 'gereserveerd') return 'gereserveerd';

  const afspraken = Array.isArray(actieveAfspraken) ? actieveAfspraken : [];
  if (afspraken.length > 0) return 'afspraak';

  if ((Number(aantalGeinteresseerd) || 0) > 0) return 'interesse';

  return 'beschikbaar';
}

/**
 * Andere auto's in de voorraad die passen bij een auto die net wegviel
 * (verkocht, uit aanbod) of bij een wens die niemand nu kan invullen.
 *
 * Ranking, sterkste eerst -- met gewichten die zo gekozen zijn dat een hogere
 * trap NOOIT door een stapeling van lagere trappen ingehaald kan worden:
 *   1. zelfde merk EN model    2. zelfde merk    3. zelfde carrosserie
 *   4. prijs binnen 20%        5. bouwjaar binnen 2 jaar
 *   6. zelfde brandstof        7. zelfde transmissie
 *   8. past bij de wens (api/_wens.js scoor), als laatste duwtje bij een gelijkspel.
 *
 * Geeft nooit het voertuig zelf terug, en nooit iets dat niet `boekbaar` is --
 * met een LEGE afsprakenlijst, zoals de aanroeper hier ook moet doen: of een
 * alternatief zelf al een afspraak heeft is aan de aanroeper om te bepalen.
 *
 * @param {object[]} voorraad         zoals `list()` teruggeeft
 * @param {object}   context
 * @param {object}   [context.voertuig]  het voertuig dat wegviel
 * @param {object}   [context.wens]      zie api/_wens.js normaliseer()
 * @param {number}   [max=3]
 * @returns {{voertuig:object, punten:number, redenen:string[]}[]}
 */
function alternatieven(voorraad, context, max) {
  const ctx = context || {};
  const lijst = Array.isArray(voorraad) ? voorraad : [];
  const doel = ctx.voertuig || null;
  const wens = ctx.wens || null;
  const doelCode = doel ? normCode(doel.code) : '';
  const limiet = Math.max(0, Number(max) || 3);

  const kandidaten = [];
  for (const v of lijst) {
    if (!v || !v.code) continue;
    if (doelCode && normCode(v.code) === doelCode) continue;
    if (!boekbaar(v, []).ok) continue;

    let punten = 0;
    const redenen = [];

    if (doel) {
      const merkGelijk = !!(doel.merk && v.merk && String(v.merk).toLowerCase() === String(doel.merk).toLowerCase());
      const modelGelijk = !!(doel.model && v.model && String(v.model).toLowerCase() === String(doel.model).toLowerCase());
      if (merkGelijk && modelGelijk) { punten += 1000; redenen.push('zelfde merk en model'); }
      else if (merkGelijk) { punten += 400; redenen.push('zelfde merk'); }

      if (doel.carrosserie && v.carrosserie
          && String(v.carrosserie).toLowerCase() === String(doel.carrosserie).toLowerCase()) {
        punten += 100; redenen.push('zelfde carrosserie');
      }

      const doelPrijs = getal(doel.prijs);
      const vPrijs = getal(v.prijs);
      if (doelPrijs !== null && doelPrijs > 0 && vPrijs !== null && Math.abs(vPrijs - doelPrijs) <= doelPrijs * 0.2) {
        punten += 40; redenen.push('prijs binnen 20%');
      }

      const doelJaar = Number((String(doel.inschrijving || '').match(/(19|20)\d{2}/) || [])[0]);
      const vJaar = Number((String(v.inschrijving || '').match(/(19|20)\d{2}/) || [])[0]);
      if (Number.isFinite(doelJaar) && Number.isFinite(vJaar) && Math.abs(vJaar - doelJaar) <= 2) {
        punten += 16; redenen.push('bouwjaar binnen 2 jaar');
      }

      if (doel.brandstof && v.brandstof && String(v.brandstof).toLowerCase() === String(doel.brandstof).toLowerCase()) {
        punten += 6; redenen.push('zelfde brandstof');
      }
      if (doel.transmissie && v.transmissie
          && String(v.transmissie).toLowerCase() === String(doel.transmissie).toLowerCase()) {
        punten += 2; redenen.push('zelfde transmissie');
      }
    }

    if (wens) {
      try {
        const m = require('./_wens').scoor(wens, v);
        /* Gewicht ruim onder de kleinste trap hierboven (2): dit mag bij een
           gelijkspel de doorslag geven, nooit een hogere trap inhalen. */
        if (m && m.score > 0) { punten += m.score / 100; redenen.push('past bij wens'); }
      } catch (_) { /* _wens is optioneel voor alternatieven */ }
    }

    kandidaten.push({ voertuig: v, punten, redenen });
  }

  kandidaten.sort((a, b) => {
    if (b.punten !== a.punten) return b.punten - a.punten;
    return normCode(a.voertuig.code).localeCompare(normCode(b.voertuig.code));   // deterministisch gelijkspel
  });

  return kandidaten.slice(0, limiet);
}

/**
 * De voorraad in de volgorde die er voor DEZE koper toe doet.
 *
 * De lijst die het model ziet als het niet weet welke auto bedoeld wordt, was
 * de eerste twaalf op code. Een dealer met zestig auto's en een koper die "een
 * automaat SUV tot 25.000" vraagt, kreeg V1 tot V12 -- toevallig drie
 * bestelwagens en een cabrio -- en het model moest daarmee antwoorden.
 *
 * Volgorde: eerst de auto's die hij zelf noemde maar niet eenduidig ("die
 * Golf" bij drie Golfs), dan wat bij zijn wens past (beste eerst), dan de rest
 * op code. Er valt niets weg: wat niet past staat onderaan, niet uit beeld.
 *
 * @param {object[]} voorraad
 * @param {{wens?:object, kandidaten?:object[]}} [context]
 * @returns {{lijst:object[], genoemd:Set<string>, passend:Set<string>}}
 */
function rangschik(voorraad, context) {
  const ctx = context || {};
  const lijst = Array.isArray(voorraad) ? voorraad.filter((v) => v && v.code) : [];
  const genoemdeCodes = (ctx.kandidaten || []).map((k) => k && normCode(k.code)).filter(Boolean);
  const genoemd = new Set();
  const passend = new Set();
  let _wens = null;
  if (ctx.wens) { try { _wens = require('./_wens'); } catch (_) { _wens = null; } }

  const gescoord = lijst.map((v) => {
    const code = normCode(v.code);
    let punten = 0;
    const plek = genoemdeCodes.indexOf(code);
    if (plek !== -1) { punten += 1e6 - plek; genoemd.add(code); }
    if (_wens) {
      const m = _wens.scoor(ctx.wens, v);
      if (m && m.score > 0) {
        punten += m.score;
        /* 'Passend' is strenger dan een score: alles wat hij met NAAM vroeg --
           model, brandstof, versnellingsbak, carrosserie -- moet kloppen. Een
           manuele hatchback binnen budget is geen "automaat SUV tot 25.000",
           hoe hoog de prijs ook scoort. Wat bijna past staat wel vooraan in
           de rest van de lijst. */
        const w = m.wens;
        const allesKlopt = (!w.model || String(v.model || '').toLowerCase().indexOf(w.model) !== -1)
          && ['brandstof', 'transmissie', 'carrosserie'].every((k) => !w[k] || _wens.zelfdeSoort(k, v[k], w[k]));
        if (allesKlopt) { punten += 1000; passend.add(code); }
      }
    }
    return { v, code, punten };
  });
  gescoord.sort((a, b) => (b.punten - a.punten) || a.code.localeCompare(b.code, 'nl', { numeric: true }));
  return { lijst: gescoord.map((x) => x.v), genoemd, passend };
}

/* ── Airtable ────────────────────────────────────────────────────────────── */
function configured() {
  return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

function escapeFormula(val) {
  /* Backslash EERST, dan het aanhalingsteken -- andersom escape je je eigen
     escape-teken weer weg. */
  return String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function atFetch(pathAndQuery, options = {}) {
  if (!configured()) throw new VehicleError('Airtable niet geconfigureerd.', 'not_configured');
  const headers = Object.assign(
    { Authorization: `Bearer ${process.env.API_AIRTABLE}` },
    options.body ? { 'Content-Type': 'application/json' } : {},
    options.headers || {}
  );
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.VEHICLES_TIMEOUT_MS || 8000));
  try {
    return await fetch(
      `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pathAndQuery}`,
      Object.assign({}, options, { headers, signal: ctrl.signal })
    );
  } finally {
    clearTimeout(t);
  }
}

let _beschikbaar = null;

/* Onthouden of de tabel er is -- maar alleen een JA voor altijd. Een NEE werd
   hier ook voorgoed onthouden, en dat was fout: één afgebroken verzoek bij een
   koude start ("This operation was aborted", een time-out) zette _beschikbaar
   op false voor de rest van het leven van deze instance, en de app zei dan
   "de tabel bestaat nog niet" over een tabel die er gewoon staat. Gezien op de
   live app op 2026-09-13, op de Voorraad-pagina.

   Nu: ja = klaar; nee = na dertig seconden opnieuw kijken. En de REDEN gaat
   mee (geen_tabel bij een 404, onbereikbaar bij al het andere), zodat een
   scherm het verschil kan zeggen tussen "nog inrichten" en "even niet". */
let _beschikbaarTot = 0;
let _beschikbaarReden = '';
const HERPROBEER_MS = 30 * 1000;

async function available() {
  if (_beschikbaar === true) return true;
  if (_beschikbaar === false && Date.now() < _beschikbaarTot) return false;
  if (!configured()) { _beschikbaar = false; _beschikbaarTot = Infinity; _beschikbaarReden = 'niet_geconfigureerd'; return false; }
  try {
    const r = await atFetch(`${TABEL}?pageSize=1`);
    _beschikbaar = r.ok;
    if (!r.ok) {
      _beschikbaarTot = Date.now() + HERPROBEER_MS;
      _beschikbaarReden = r.status === 404 ? 'geen_tabel' : 'onbereikbaar';
      console.warn(`[voertuigen] tabel "${TABEL}" niet leesbaar (HTTP ${r.status}) -- over 30 s opnieuw.`);
    } else {
      _beschikbaarReden = '';
    }
  } catch (e) {
    console.warn('[voertuigen] Airtable onbereikbaar (over 30 s opnieuw):', e && e.message);
    _beschikbaar = false;
    _beschikbaarTot = Date.now() + HERPROBEER_MS;
    _beschikbaarReden = 'onbereikbaar';
  }
  return _beschikbaar;
}

/** Waarom available() nee zei: 'geen_tabel' | 'onbereikbaar' | 'niet_geconfigureerd' | ''. */
function onbeschikbaarReden() { return _beschikbaar === true ? '' : _beschikbaarReden; }

function _resetAvailability() { _beschikbaar = null; _beschikbaarTot = 0; _beschikbaarReden = ''; }

/* ── Vertalen ────────────────────────────────────────────────────────────── */
function getal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function regels(v) {
  return String(v == null ? '' : v).split('\n').map((s) => s.trim()).filter(Boolean);
}

/* kW naar pk. Afgeleid en niet apart bewaard, zodat de twee nooit uit elkaar
   kunnen lopen -- een dealer die 375 kW invult en 500 pk erbij typt heeft één
   van de twee fout, en dan staat er een verkeerd getal in een verkoopgesprek. */
function pk(kw) {
  const n = getal(kw);
  return n === null ? null : Math.round(n * 1.35962);
}

/** Airtable-record -> het voertuig zoals de rest van Helvaro het kent. */
function vanRecord(rec) {
  const f = (rec && rec.fields) || {};
  const kw = getal(f[F.kw]);
  return {
    id:          rec && rec.id,
    code:        String(f[F.code] || '').trim(),
    projectCode: String(f[F.project] || '').trim(),
    merk:        String(f[F.merk] || '').trim(),
    model:       String(f[F.model] || '').trim(),
    uitvoering:  String(f[F.uitvoering] || '').trim(),
    prijs:       getal(f[F.prijs]),
    km:          getal(f[F.km]),
    inschrijving:String(f[F.inschrijving] || '').trim(),
    brandstof:   String(f[F.brandstof] || '').trim(),
    transmissie: String(f[F.transmissie] || '').trim(),
    kw,
    pk:          pk(kw),
    carrosserie: String(f[F.carrosserie] || '').trim(),
    kleur:       String(f[F.kleur] || '').trim(),
    link:        String(f[F.link] || '').trim(),
    autoscout:   String(f[F.autoscout] || '').trim(),
    status:      normStatus(f[F.status]),
    maxKorting:  getal(f[F.maxKorting]),
    faroKorting: getal(f[F.faroKorting]),
    omschrijving:String(f[F.omschrijving] || '').trim(),
    troeven:     regels(f[F.troeven]),
    fotos:       regels(f[F.fotos]),
    publiek:     f[F.publiek] !== false,
    gearchiveerd:f[F.gearchiveerd] === true,
    aangemaakt:  String(f[F.aangemaakt] || '').trim(),
    bijgewerkt:  String(f[F.bijgewerkt] || '').trim(),
    bron:        String(f[F.bron] || '').trim(),
    bronId:      String(f[F.bronId] || '').trim(),
    gesynct:     String(f[F.gesynct] || '').trim(),
    verkochtOp:  String(f[F.verkochtOp] || '').trim(),
  };
}

/* ── Codes ───────────────────────────────────────────────────────────────── */
function normCode(code) {
  return String(code == null ? '' : code).trim().toUpperCase().slice(0, 24);
}

function geldigeCode(code) {
  const c = normCode(code);
  return c.length >= 1 && c.length <= 24 && /^[A-Z0-9][A-Z0-9._-]*$/.test(c);
}

function volgendeCode(bestaande) {
  /* V1, V2, V3... De hoogste V-nummer plus een. Eigen referenties van de
     dealer (bv. STOCK-119) tellen niet mee -- die hebben geen reeks. */
  let hoogste = 0;
  for (const c of (bestaande || [])) {
    const m = /^V(\d+)$/.exec(normCode(c));
    if (m) hoogste = Math.max(hoogste, Number(m[1]));
  }
  return 'V' + (hoogste + 1);
}

/* ── Lezen ───────────────────────────────────────────────────────────────── */
async function list(projectCode, opties = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new VehicleError('Voertuigen opvragen zonder projectcode.', 'no_tenant');
  if (!(await available())) return [];

  const formule = encodeURIComponent(`{${F.project}}="${escapeFormula(tenant)}"`);
  const uit = [];
  let offset = '';
  /* Tien pagina's van 100 (was vier). Wat daarboven ligt wordt niet stil
     weggelaten: listMetStatus() hieronder zegt dat de lijst afgekapt is, en de
     voorraadstatus (api/_inventaris.js) meldt het. */
  let afgekapt = false;
  for (let ronde = 0; ronde < 10; ronde++) {
    const r = await atFetch(
      `${TABEL}?filterByFormula=${formule}&pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`
    );
    if (!r.ok) {
      console.warn('[voertuigen] lijst mislukt:', r.status);
      throw new VehicleError('Voertuigen konden niet opgehaald worden.', 'read_failed');
    }
    const d = await r.json();
    for (const rec of (d.records || [])) uit.push(vanRecord(rec));
    if (!d.offset) break;
    offset = d.offset;
    if (ronde === 9) afgekapt = true;
  }
  if (afgekapt) console.warn('[voertuigen] lijst afgekapt op 1000 voor', tenant);
  _laatsteAfgekapt.set(tenant, afgekapt);

  let autos = uit.filter((v) => v.projectCode === tenant);   // riem en bretels
  if (!opties.inclusiefGearchiveerd) autos = autos.filter((v) => !v.gearchiveerd);
  if (opties.alleenRijdbaar)         autos = autos.filter((v) => kanProefrit(v.status));
  if (opties.alleenPubliek)          autos = autos.filter((v) => v.publiek);

  return autos.sort((a, b) => a.code.localeCompare(b.code, 'nl', { numeric: true }));
}

/**
 * Zoals getByCode, maar met onderscheid tussen "bestaat niet (meer)" en "kon
 * niet gelezen worden". De eindcontrole voor verzenden en de boekingspoort
 * hebben dat verschil nodig: een verdwenen voertuig is niet boekbaar, een
 * Airtable-hapering zegt niets over het voertuig.
 * @returns {Promise<{gelezen:boolean, voertuig:object|null}>}
 */
async function leesVers(projectCode, code) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) return { gelezen: false, voertuig: null };
  const c = normCode(code);
  if (!geldigeCode(c)) return { gelezen: true, voertuig: null };
  try {
    if (!(await available())) return { gelezen: false, voertuig: null };
    const formule = encodeURIComponent(
      `AND({${F.project}}="${escapeFormula(tenant)}", UPPER({${F.code}})="${escapeFormula(c)}")`
    );
    const r = await atFetch(`${TABEL}?filterByFormula=${formule}&maxRecords=1`);
    if (!r.ok) return { gelezen: false, voertuig: null };
    const d = await r.json();
    const rec = (d.records || [])[0];
    if (!rec) return { gelezen: true, voertuig: null };
    const auto = vanRecord(rec);
    if (auto.projectCode !== tenant) return { gelezen: true, voertuig: null };
    return { gelezen: true, voertuig: auto };
  } catch (e) {
    return { gelezen: false, voertuig: null };
  }
}

const _laatsteAfgekapt = new Map();
/** list() plus de vraag of de lijst volledig is. */
async function listMetStatus(projectCode, opties = {}) {
  const vehicles = await list(projectCode, opties);
  return { vehicles, afgekapt: _laatsteAfgekapt.get(String(projectCode || '').trim()) === true };
}

async function getByCode(projectCode, code) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new VehicleError('Voertuig opvragen zonder projectcode.', 'no_tenant');
  const c = normCode(code);
  if (!geldigeCode(c)) return null;
  if (!(await available())) return null;

  const formule = encodeURIComponent(
    `AND({${F.project}}="${escapeFormula(tenant)}", UPPER({${F.code}})="${escapeFormula(c)}")`
  );
  const r = await atFetch(`${TABEL}?filterByFormula=${formule}&maxRecords=1`);
  if (!r.ok) return null;
  const d = await r.json();
  const rec = (d.records || [])[0];
  if (!rec) return null;
  const auto = vanRecord(rec);
  /* De formule doet dit al. Nog een keer, want dit is de plek waar een fout
     betekent dat dealer A de auto van dealer B ziet. */
  if (auto.projectCode !== tenant) return null;
  return auto;
}

/**
 * Eén voertuig op zijn AutoScout24-aanbodnummer.
 *
 * Dit is DE koppeling van de hele vertical. AutoScout24 zet een link in het
 * voorgevulde WhatsApp-bericht, api/_autoscout.js haalt daar het nummer uit, en
 * hier wordt het een auto. Geen enkele vraag aan de koper nodig.
 */
async function getByAutoscout(projectCode, aanbodId) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new VehicleError('Voertuig opvragen zonder projectcode.', 'no_tenant');
  const id = String(aanbodId || '').trim();
  if (!id) return null;
  if (!(await available())) return null;

  const formule = encodeURIComponent(
    `AND({${F.project}}="${escapeFormula(tenant)}", {${F.autoscout}}="${escapeFormula(id)}")`
  );
  const r = await atFetch(`${TABEL}?filterByFormula=${formule}&maxRecords=1`);
  if (!r.ok) return null;
  const d = await r.json();
  const rec = (d.records || [])[0];
  if (!rec) return null;
  const auto = vanRecord(rec);
  if (auto.projectCode !== tenant) return null;
  return auto;
}

/* ── Herkennen uit een gesprek ───────────────────────────────────────────────
 * Voor de koper die gewoon naar het nummer schrijft, zonder link. "Is die M4
 * nog beschikbaar?" of "de zwarte Golf van 2021".
 *
 * Dit BESLIST niets; het levert een kandidaat. Bij twijfel moet Faro het
 * gewoon vragen -- een proefrit voor de verkeerde auto kost de dealer een
 * ochtend en de koper zijn vertrouwen.
 */
function matchUitTekst(autos, tekst) {
  const t = String(tekst || '').toLowerCase();
  if (!t.trim() || !autos.length) return { voertuig: null, kandidaten: [], reden: 'geen_tekst' };

  const esc = (s) => s.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const heeftWoord = (naald) => {
    if (!naald || naald.length < 2) return false;
    return new RegExp('(^|[^a-z0-9])' + esc(naald) + '([^a-z0-9]|$)').test(t);
  };

  const punten = new Map();
  const tel = (v, n) => punten.set(v.code, (punten.get(v.code) || 0) + n);

  for (const v of autos) {
    /* De voertuigcode, als hij hem overtypt. Met woordgrenzen: V1 mag niet
       matchen in V10. */
    if (v.code && heeftWoord(v.code)) tel(v, 10);

    /* Het aanbodnummer, als het los in de tekst staat. */
    if (v.autoscout && t.indexOf(v.autoscout.toLowerCase()) !== -1) tel(v, 12);

    /* Model is het sterkste natuurlijke signaal: "de M4", "die Golf". Merk
       alleen telt licht -- een dealer heeft er vaak twintig van hetzelfde
       merk, dus "BMW" onderscheidt niets. */
    if (v.model && heeftWoord(v.model)) tel(v, 7);
    if (v.merk  && heeftWoord(v.merk))  tel(v, 2);

    /* De uitvoering onderscheidt juist wél sterk als hij genoemd wordt:
       "Competition" hangt aan één auto in de voorraad. Woord voor woord, want
       niemand typt de volledige uitvoering over. */
    for (const w of v.uitvoering.split(/\s+/)) {
      if (w.length >= 3 && heeftWoord(w)) tel(v, 4);
    }

    /* Kleur en bouwjaar zijn zwakke signalen die pas iets doen als de rest
       gelijk staat -- precies waar ze voor bedoeld zijn. */
    if (v.kleur && v.kleur.length >= 3 && heeftWoord(v.kleur)) tel(v, 2);
    const jaar = (v.inschrijving.match(/(19|20)\d{2}/) || [])[0];
    if (jaar && t.indexOf(jaar) !== -1) tel(v, 2);
  }

  const gescoord = autos
    .map((v) => ({ voertuig: v, punten: punten.get(v.code) || 0 }))
    .filter((x) => x.punten > 0)
    .sort((a, b) => b.punten - a.punten);

  if (!gescoord.length) return { voertuig: null, kandidaten: [], reden: 'geen_treffer' };
  /* Gelijkspel bovenaan is geen antwoord. Twee identieke Golfs in de voorraad
     is bij een dealer eerder regel dan uitzondering. */
  if (gescoord.length > 1 && gescoord[0].punten === gescoord[1].punten) {
    return { voertuig: null, kandidaten: gescoord.map((x) => x.voertuig), reden: 'meerdere' };
  }
  return { voertuig: gescoord[0].voertuig, kandidaten: gescoord.map((x) => x.voertuig), reden: 'match' };
}

/* ── Schrijven ───────────────────────────────────────────────────────────── */
function naarVelden(invoer, projectCode) {
  const v = invoer || {};
  const tekst = (x, max) => String(x == null ? '' : x).trim().slice(0, max || 200);
  const nummer = (x) => {
    const n = Number(x);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const velden = { [F.project]: String(projectCode || '').trim() };
  const zet = (sleutel, waarde) => { if (waarde !== null && waarde !== '') velden[sleutel] = waarde; };

  zet(F.merk,        tekst(v.merk, 60));
  zet(F.model,       tekst(v.model, 60));
  zet(F.uitvoering,  tekst(v.uitvoering, 120));
  zet(F.prijs,       nummer(v.prijs));
  zet(F.km,          nummer(v.km));
  zet(F.inschrijving,tekst(v.inschrijving, 10));
  zet(F.brandstof,   tekst(v.brandstof, 30).toLowerCase());
  zet(F.transmissie, tekst(v.transmissie, 30).toLowerCase());
  zet(F.kw,          nummer(v.kw));
  zet(F.carrosserie, tekst(v.carrosserie, 40));
  zet(F.kleur,       tekst(v.kleur, 40));
  zet(F.link,        tekst(v.link, 500));
  zet(F.autoscout,   tekst(v.autoscout, 40));
  zet(F.omschrijving,tekst(v.omschrijving, 4000));
  zet(F.maxKorting,  nummer(v.maxKorting));
  zet(F.faroKorting, nummer(v.faroKorting));

  if (v.status)  velden[F.status] = normStatus(v.status);
  if (Array.isArray(v.troeven)) velden[F.troeven] = v.troeven.map((s) => String(s).trim()).filter(Boolean).join('\n');
  if (Array.isArray(v.fotos))   velden[F.fotos]   = v.fotos.map((s) => String(s).trim()).filter(Boolean).join('\n');
  if (typeof v.publiek === 'boolean')      velden[F.publiek] = v.publiek;
  if (typeof v.gearchiveerd === 'boolean') velden[F.gearchiveerd] = v.gearchiveerd;
  /* Alleen de feed zet herkomst. Een handmatige save laat deze velden weg, zodat
     hij ook werkt op een base waar de schema-migratie nog niet draaide. */
  if (v.bron)    velden[F.bron]    = tekst(v.bron, 20);
  if (v.bronId)  velden[F.bronId]  = tekst(v.bronId, 120);
  if (v.gesynct) velden[F.gesynct] = tekst(v.gesynct, 40);
  /* Alleen als de aanroeper het EXPLICIET meegeeft ('' = wissen). Zelfde reden
     als hierboven: een base zonder het veld mag een gewone save niet breken. */
  if (v.verkochtOp !== undefined) velden[F.verkochtOp] = v.verkochtOp ? tekst(v.verkochtOp, 40) : '';

  return velden;
}

/**
 * Wat er met Sold At moet gebeuren bij een statuswijziging.
 *
 *   naar verkocht, was het niet     -> nu            (de verkoop begint te tellen)
 *   blijft verkocht                 -> ongewijzigd   (de klok loopt door, NIET resetten)
 *   uit verkocht, stond een datum   -> ''            (terug in de verkoop: wissen)
 *   verder                          -> undefined     (niets aanraken)
 *
 * 'Blijft verkocht' laat de datum met rust. Een sync die elke dag opnieuw
 * "verkocht" ziet mag de veertien dagen niet elke dag opnieuw laten beginnen,
 * anders wordt een verkochte wagen nooit gearchiveerd.
 */
function verkochtOvergang(oudeStatus, nieuweStatus, oudVerkochtOp, nu) {
  const oud = normStatus(oudeStatus), nieuw = normStatus(nieuweStatus);
  if (nieuw === 'verkocht' && oud !== 'verkocht') return nu;
  if (nieuw === 'verkocht' && oud === 'verkocht') return oudVerkochtOp ? undefined : nu;
  if (nieuw !== 'verkocht' && oudVerkochtOp) return '';
  return undefined;
}

/* Airtable weigert een HELE schrijfactie als er één veld in staat dat niet
   bestaat. Sold At is nieuw; zolang de schema-migratie niet draaide mag een
   gewone save daar niet op stuklopen. Eén keer opnieuw zonder dat veld. */
function onbekendVerkochtVeld(status, tekstAntwoord) {
  return status === 422 && /UNKNOWN_FIELD_NAME/.test(tekstAntwoord) && /Sold At/.test(tekstAntwoord);
}

async function save(projectCode, invoer = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new VehicleError('Voertuig opslaan zonder projectcode.', 'no_tenant');
  if (!(await available())) {
    throw new VehicleError('De voertuigentabel bestaat nog niet.', 'no_table');
  }

  const nu = new Date().toISOString();
  const code = normCode(invoer.code);

  /* Een AutoScout-link levert het aanbodnummer gratis. Doen we hier en niet in
     de UI, zodat het ook klopt als een voertuig via een import of een script
     binnenkomt. Vereist geen netwerk: het nummer staat in de URL zelf. */
  const invoer2 = Object.assign({}, invoer);
  if (!invoer2.autoscout && invoer2.link) {
    try {
      const as = require('./_autoscout');
      const gevonden = as.aanbodIdUit(invoer2.link);
      if (gevonden) invoer2.autoscout = gevonden;
    } catch (_) { /* _autoscout is optioneel voor opslaan */ }
  }

  if (code) {
    const bestaand = await getByCode(tenant, code);
    if (!bestaand) throw new VehicleError('Voertuig niet gevonden.', 'not_found');
    const velden = naarVelden(invoer2, tenant);
    velden[F.bijgewerkt] = nu;
    delete velden[F.code];   // een code verandert niet; leads hangen eraan
    /* Zet de dealer hem op verkocht, dan begint de bewaartermijn te lopen --
       net zoals bij een verkoop die uit de feed komt. Anders zou een met de
       hand verkochte wagen nooit gearchiveerd worden. */
    if (invoer2.status !== undefined) {
      const vo = verkochtOvergang(bestaand.status, invoer2.status, bestaand.verkochtOp, nu);
      if (vo !== undefined) velden[F.verkochtOp] = vo;
    }
    const patch = (v) => atFetch(`${TABEL}/${bestaand.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: v, typecast: true }),
    });
    let r = await patch(velden);
    let fout = '';
    if (!r.ok) {
      fout = await r.text().catch(() => '');
      if (F.verkochtOp in velden && onbekendVerkochtVeld(r.status, fout)) {
        delete velden[F.verkochtOp];
        r = await patch(velden);
        fout = r.ok ? '' : await r.text().catch(() => '');
      }
    }
    if (!r.ok) {
      console.warn('[voertuigen] bijwerken mislukt:', r.status, fout);
      throw new VehicleError('Voertuig kon niet bijgewerkt worden.', 'write_failed');
    }
    return vanRecord(await r.json());
  }

  /* Nieuw. De code wordt hier bepaald en niet door de klant: twee voertuigen
     met dezelfde code binnen één dealer maakt getByCode dubbelzinnig. */
  const bestaande = await list(tenant, { inclusiefGearchiveerd: true });
  const velden = naarVelden(invoer2, tenant);
  velden[F.code]       = invoer.eigenCode && geldigeCode(invoer.eigenCode)
    ? normCode(invoer.eigenCode)
    : volgendeCode(bestaande.map((v) => v.code));
  velden[F.status]     = velden[F.status] || 'beschikbaar';
  velden[F.aangemaakt] = nu;
  velden[F.bijgewerkt] = nu;
  if (velden[F.status] === 'verkocht' && !velden[F.verkochtOp]) velden[F.verkochtOp] = nu;

  if (bestaande.some((v) => v.code === velden[F.code])) {
    throw new VehicleError('Die voertuigcode bestaat al.', 'duplicate_code');
  }

  const post = (v) => atFetch(TABEL, {
    method: 'POST',
    body: JSON.stringify({ fields: v, typecast: true }),
  });
  let r = await post(velden);
  let fout = '';
  if (!r.ok) {
    fout = await r.text().catch(() => '');
    if (F.verkochtOp in velden && onbekendVerkochtVeld(r.status, fout)) {
      delete velden[F.verkochtOp];
      r = await post(velden);
      fout = r.ok ? '' : await r.text().catch(() => '');
    }
  }
  if (!r.ok) {
    console.warn('[voertuigen] aanmaken mislukt:', r.status, fout);
    throw new VehicleError('Voertuig kon niet aangemaakt worden.', 'write_failed');
  }
  return vanRecord(await r.json());
}

async function archive(projectCode, code, gearchiveerd = true) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new VehicleError('Voertuig archiveren zonder projectcode.', 'no_tenant');
  const bestaand = await getByCode(tenant, code);
  if (!bestaand) throw new VehicleError('Voertuig niet gevonden.', 'not_found');
  /* Nooit verwijderen: er kunnen leads en afspraken aan hangen, en een
     verkochte auto hoort in de geschiedenis te blijven staan. */
  const r = await atFetch(`${TABEL}/${bestaand.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: { [F.gearchiveerd]: gearchiveerd === true, [F.bijgewerkt]: new Date().toISOString() },
      typecast: true,
    }),
  });
  if (!r.ok) throw new VehicleError('Voertuig kon niet gearchiveerd worden.', 'write_failed');
  return vanRecord(await r.json());
}

/* ── Uit een advertentielink ─────────────────────────────────────────────────
 *
 * De dealer plakt een AutoScout24-link en krijgt een ingevulde fiche terug. Dat
 * is het hele punt: een voorraad met de hand overtypen is werk dat niemand doet,
 * en een voorraad die niet klopt maakt Faro onbetrouwbaar tegenover een koper.
 *
 * ── Waarom dit WEL een pagina ophaalt, en het gesprek niet ───────────────────
 * In api/_autoscout.js staat uitdrukkelijk dat er tijdens een LEADGESPREK geen
 * pagina wordt opgehaald. Dat blijft zo, en dit spreekt het niet tegen -- het
 * zijn twee heel verschillende momenten:
 *
 *   In het gesprek  telt elke seconde, want een koper wacht op antwoord, en een
 *                   trage of geblokkeerde oproep betekent geen antwoord.
 *   Hier            wacht de DEALER zelf, hij drukte er zelf op, en als het
 *                   mislukt vult hij het met de hand in. Kost hem tien seconden,
 *                   geen deal.
 *
 * ── Levert een CONCEPT, geen record ─────────────────────────────────────────
 * Er wordt hier niets weggeschreven. De dealer kijkt ernaar en drukt daarna pas
 * op opslaan. Een model dat rechtstreeks in de voorraad schrijft, zet er
 * vroeg of laat een auto in die niet bestaat -- en dan is het de dealer die
 * tegen een koper staat te liegen over iets wat hij nooit heeft ingevoerd.
 */
async function importeerUitLink(projectCode, url, opties = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new VehicleError('Voertuig importeren zonder projectcode.', 'no_tenant');

  const link = String(url || '').trim();
  if (!link) throw new VehicleError('Geen link meegegeven.', 'no_url');
  if (link.length > 2000) throw new VehicleError('Die link is te lang.', 'bad_url');
  if (!/^https?:\/\//i.test(link)) {
    throw new VehicleError('Een link moet met http:// of https:// beginnen.', 'bad_url');
  }

  /* De controle op interne adressen zit in fetchPage en wordt daar bij ELKE
     omleiding herhaald -- dat is de plek die telt, want een link kan naar een
     intern adres omleiden nadat hij er publiek uitzag. */
  const pagina = await fetchPage(link, { tag: '[voertuig-import]', maxChars: 14000, maxRedirects: 2 });
  if (!pagina || !pagina.text || pagina.text.length < 120) {
    throw new VehicleError(
      'Die pagina kon ik niet lezen. Sommige sites tonen hun inhoud pas na een cookiemelding. '
      + 'Vul het voertuig dan met de hand in, of probeer een andere link naar dezelfde auto.',
      'unreadable');
  }

  const _ai = require('./_ai');
  let uit;
  try {
    uit = await _ai.generateText({
      task: _ai.TASKS.VEHICLE_IMPORT,
      ctx: { projectCode: tenant, userId: opties.userId || 'dashboard' },
      system: _ai.prompts.voertuigImport.system(),
      messages: [{ role: 'user', content: _ai.prompts.voertuigImport.user(pagina) }],
      schema: _ai.prompts.VOERTUIG_IMPORT_SCHEMA,
      maxTokens: 900,
    });
  } catch (err) {
    console.warn('[voertuig-import] model faalde:', err && err.code, err && err.message);
    throw new VehicleError('Het uitlezen van die pagina lukte niet. Probeer het zo meteen opnieuw.', 'ai_failed');
  }

  const d = (uit && uit.data) || {};
  const kies = (waarde, toegestaan) => {
    const v = String(waarde || '').trim().toLowerCase();
    return toegestaan.indexOf(v) !== -1 ? v : '';
  };

  /* De foto's komen van de PAGINA, niet van het model. Een model dat een
     afbeeldings-URL "onthoudt" verzint er een die niet bestaat, en dan staat er
     een gebroken plaatje op het aanvraagformulier van een echte klant. */
  const fotos = (pagina.images || []).slice(0, 8);

  /* Het aanbodnummer komt uit de URL en niet uit het model: het staat er
     letterlijk in, en dit is de sleutel waarmee een binnenkomend
     WhatsApp-bericht straks aan deze auto gekoppeld wordt. Daar hoort geen
     gok in te zitten. */
  let autoscout = '';
  try { autoscout = require('./_autoscout').aanbodIdUit(link); } catch (_) { autoscout = ''; }

  const concept = {
    merk:         String(d.merk || '').trim(),
    model:        String(d.model || '').trim(),
    uitvoering:   String(d.uitvoering || '').trim(),
    prijs:        getal(d.prijs),
    km:           getal(d.km),
    inschrijving: String(d.inschrijving || '').trim(),
    brandstof:    kies(d.brandstof, ['benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng', 'waterstof', 'overig']),
    transmissie:  kies(d.transmissie, ['automaat', 'handgeschakeld']),
    kw:           getal(d.kw),
    carrosserie:  String(d.carrosserie || '').trim(),
    kleur:        String(d.kleur || '').trim(),
    omschrijving: String(d.omschrijving || '').trim(),
    troeven:      Array.isArray(d.troeven) ? d.troeven.map((t) => String(t).trim()).filter(Boolean).slice(0, 6) : [],
    fotos,
    link,
    autoscout,
    status:       'beschikbaar',
  };

  return {
    concept,
    /* Hoe zeker het model was, en of dit uberhaupt een autoadvertentie leek.
       De aanroeper beslist wat hij daarmee doet -- deze functie oordeelt niet,
       want "te onzeker" hangt af van wie het vraagt. */
    confidence: Number(d.confidence) || 0,
    /* Wat er ONTBREEKT. Dit is het verschil tussen een importfunctie die
       behulpzaam is en een die je laat zoeken: de dealer ziet meteen welke
       velden hij zelf nog moet aanvullen in plaats van ze te moeten opmerken. */
    ontbreekt: ['merk', 'model', 'prijs', 'km', 'inschrijving']
      .filter((k) => concept[k] === null || concept[k] === '' || concept[k] === undefined),
    bron: link,
    model_gebruikt: (uit && uit.model) || '',
  };
}

/* ── Tekst ───────────────────────────────────────────────────────────────── */
function prijsTekst(prijs) {
  const n = getal(prijs);
  return n === null ? '' : '€ ' + Math.round(n).toLocaleString('nl-BE');
}

function kmTekst(km) {
  const n = getal(km);
  return n === null ? '' : Math.round(n).toLocaleString('nl-BE') + ' km';
}

function vermogenTekst(kw) {
  const n = getal(kw);
  return n === null ? '' : n + ' kW / ' + pk(n) + ' pk';
}

/** "BMW M4 Competition xDrive" -- de naam zoals een mens hem zegt. */
function naam(voertuig) {
  if (!voertuig) return '';
  return [voertuig.merk, voertuig.model, voertuig.uitvoering].filter(Boolean).join(' ').trim();
}

/** Eén regel voor een lijst: naam, prijs, km, jaar. */
function samenvatting(voertuig) {
  if (!voertuig) return '';
  return [naam(voertuig), prijsTekst(voertuig.prijs), kmTekst(voertuig.km), voertuig.inschrijving]
    .filter(Boolean).join(' | ');
}

module.exports = {
  BEKENDE_STATUS, listMetStatus, leesVers,
  /* Voor de voorraadsync (api/_inventaris.js): batch-schrijven zonder per
     voertuig list() te herhalen. Niet voor andere aanroepers. */
  verkochtOvergang,
  _intern: { atFetch: (...a) => atFetch(...a), TABEL, F, naarVelden, vanRecord, volgendeCode, onbekendVerkochtVeld },
  TABEL,
  F,
  VehicleError,
  RIJDBARE_STATUS,
  normStatus,
  kanProefrit,
  boekbaar,
  operationeleStatus,
  alternatieven,
  rangschik,
  configured,
  available,
  _resetAvailability, onbeschikbaarReden,
  vanRecord,
  naarVelden,
  normCode,
  geldigeCode,
  volgendeCode,
  pk,
  list,
  getByCode,
  getByAutoscout,
  matchUitTekst,
  save,
  archive,
  importeerUitLink,
  prijsTekst,
  kmTekst,
  vermogenTekst,
  naam,
  samenvatting,
};
