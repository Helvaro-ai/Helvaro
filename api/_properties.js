'use strict';
/*
 * Panden -- de opslag, en de enige plek die weet wat een pand IS.
 *
 * -- Waarom dit bestaat --------------------------------------------------------
 * Tot nu wist Helvaro niet over welk pand een lead het had. Een makelaar met
 * vier woningen kreeg vier leads binnen die alle vier "die woning" heetten, en
 * de AI kreeg als achtergrond de hele website van de klant plat geslagen tot
 * tekst. Daar staan vier prijzen in. Dus gokte hij, of hij vroeg het na -- en
 * bij een pand dat al verkocht was plande hij vrolijk een bezichtiging.
 *
 * Vanaf hier is een pand een RECORD met een code, een prijs en een status, en
 * krijgt de AI precies dat ene pand mee.
 *
 * -- Geen route ----------------------------------------------------------------
 * Het onderstreepje voorop is geen stijlkeuze: Vercel Hobby staat twaalf
 * functies toe en die zijn op. De panden hangen daarom aan api/leads.js via
 * body.mode, net als alles wat er de laatste tijd bij kwam.
 *
 * -- Tenant, altijd ------------------------------------------------------------
 * Elke functie hier neemt projectCode als EERSTE argument en elke query
 * filtert erop. Er is geen "haal pand X op" zonder eigenaarscontrole: de
 * pandcode staat in een publieke URL en is dus te raden, en een makelaar hoort
 * nooit het pand van een ander te zien -- ook niet per ongeluk, ook niet als
 * twee klanten allebei "P1" gebruiken.
 *
 * De projectCode komt van de aanroeper, uit de GEVERIFIEERDE sessie. Deze
 * module leest nooit een request.
 *
 * -- De tabel bestaat misschien nog niet ---------------------------------------
 * Zolang die er niet is werkt de rest van Helvaro gewoon door: geen panden is
 * hetzelfde als "deze makelaar heeft er nog geen ingevoerd". Wat NIET mag is
 * dat het dashboard omvalt of dat de AI een pand verzint. Zie available().
 *
 * -- DE TABEL AANMAKEN ---------------------------------------------------------
 * Eén tabel in dezelfde Airtable-base, met de naam `properties`. De velden,
 * met hun type:
 *
 *   Property Code    Single line text   P1, P2, VH-2291. Uniek binnen een klant.
 *   Project Code     Single line text   de klant. Hier filtert ALLES op.
 *   Address          Single line text   verplicht
 *   City             Single line text
 *   Postal Code      Single line text
 *   Type             Single select      huis, appartement, grond, commercieel, garage, overig
 *   Transaction      Single select      te koop, te huur
 *   Price            Number             euro, geheel
 *   Bedrooms         Number
 *   Bathrooms        Number
 *   Surface          Number             bewoonbaar, m2
 *   Plot Surface     Number             grond, m2
 *   EPC              Single line text
 *   Year Built       Number
 *   Status           Single select      beschikbaar, onder bod, verkocht, verhuurd, uit aanbod
 *   Description      Long text
 *   Highlights       Long text          één troef per regel
 *   Photo URLs       Long text          één https-adres per regel
 *   Public           Checkbox           zichtbaar op het aanvraagformulier
 *   Archived         Checkbox
 *   Created At       Single line text   ISO-datum
 *   Updated At       Single line text   ISO-datum
 *
 * De Leads-tabel heeft GEEN nieuw veld nodig: de pandcode rijdt mee in de
 * bestaande Notities-blob. Zie api/form.js voor waarom.
 */

const TABEL = 'properties';

/* Veldnamen, geen Airtable-ids: de tabel moet nog aangemaakt worden en heeft
   dus nog geen ids. Airtable accepteert namen net zo goed. Op één plek, zodat
   hernoemen één wijziging is. */
const F = Object.freeze({
  code:        'Property Code',
  project:     'Project Code',
  adres:       'Address',
  plaats:      'City',
  postcode:    'Postal Code',
  type:        'Type',
  transactie:  'Transaction',
  prijs:       'Price',
  slaapkamers: 'Bedrooms',
  badkamers:   'Bathrooms',
  oppervlakte: 'Surface',
  grond:       'Plot Surface',
  epc:         'EPC',
  bouwjaar:    'Year Built',
  status:      'Status',
  omschrijving:'Description',
  troeven:     'Highlights',
  fotos:       'Photo URLs',
  publiek:     'Public',
  gearchiveerd:'Archived',
  aangemaakt:  'Created At',
  bijgewerkt:  'Updated At',
});

/* ── Status ──────────────────────────────────────────────────────────────────
   De status is geen etiket maar een regel. "Verkocht" betekent dat de AI daar
   GEEN bezichtiging voor inplant, hoe graag de lead ook wil -- dezelfde
   gedachte als bij de agenda: nooit iets als beschikbaar tonen wat het niet
   is. Een lead die voor een verkochte woning naar Gent rijdt is een klacht,
   geen lead. */
const STATUS = Object.freeze({
  BESCHIKBAAR: 'beschikbaar',
  ONDER_BOD:   'onder bod',
  VERKOCHT:    'verkocht',
  VERHUURD:    'verhuurd',
  UIT_AANBOD:  'uit aanbod',
});

const ALLE_STATUS = Object.freeze(Object.values(STATUS));

/* Onder bod mag je nog bezichtigen -- makelaars doen dat bewust, voor het geval
   het bod afspringt. Verkocht, verhuurd en uit aanbod niet. */
const BEZICHTIGBAAR = Object.freeze([STATUS.BESCHIKBAAR, STATUS.ONDER_BOD]);

function kanBezichtigen(status) {
  return BEZICHTIGBAAR.indexOf(normStatus(status)) !== -1;
}

function normStatus(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  return ALLE_STATUS.indexOf(v) !== -1 ? v : STATUS.BESCHIKBAAR;
}

const TYPES = Object.freeze(['huis', 'appartement', 'grond', 'commercieel', 'garage', 'overig']);
const TRANSACTIES = Object.freeze(['te koop', 'te huur']);

/* ── Fouten ──────────────────────────────────────────────────────────────── */
class PropertyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PropertyError';
    this.code = code || 'property_error';
  }
}

/* ── Verbinding ──────────────────────────────────────────────────────────── */
function configured() {
  return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

function escapeFormula(val) {
  return String(val == null ? '' : val).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function atFetch(pathAndQuery, options = {}) {
  if (!configured()) throw new PropertyError('Airtable niet geconfigureerd.', 'not_configured');
  const headers = Object.assign(
    { Authorization: `Bearer ${process.env.API_AIRTABLE}` },
    options.body ? { 'Content-Type': 'application/json' } : {},
    options.headers || {}
  );
  /* Harde bovengrens. Het dashboard en het formulier wachten hierop, en een
     trage Airtable mag geen trage pagina worden. */
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number(process.env.PROPERTIES_TIMEOUT_MS || 8000));
  try {
    return await fetch(
      `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pathAndQuery}`,
      Object.assign({}, options, { headers, signal: ctrl.signal })
    );
  } finally {
    clearTimeout(t);
  }
}

/* Onthouden of de tabel bestaat. Eén 404 is genoeg om te weten dat hij er niet
   is; elke beurt opnieuw kijken kost alleen tijd. null = nog niet gekeken. */
let _beschikbaar = null;

async function available() {
  if (_beschikbaar !== null) return _beschikbaar;
  if (!configured()) { _beschikbaar = false; return false; }
  try {
    const r = await atFetch(`${TABEL}?pageSize=1`);
    _beschikbaar = r.ok;
    if (!r.ok) {
      console.warn(`[panden] tabel "${TABEL}" niet gevonden (HTTP ${r.status}) — `
        + 'panden zijn uit tot die tabel bestaat. Zie de kop van api/_properties.js.');
    }
  } catch (e) {
    console.warn('[panden] Airtable onbereikbaar:', e && e.message);
    _beschikbaar = false;
  }
  return _beschikbaar;
}

/** Alleen voor tests: de onthouden uitkomst weggooien. */
function _resetAvailability() { _beschikbaar = null; }

/* ── Vertalen ────────────────────────────────────────────────────────────── */
function getal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function regels(v) {
  return String(v == null ? '' : v)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Airtable-record -> het pand zoals de rest van Helvaro het kent. */
function vanRecord(rec) {
  const f = (rec && rec.fields) || {};
  return {
    id:          rec && rec.id,
    code:        String(f[F.code] || '').trim(),
    projectCode: String(f[F.project] || '').trim(),
    adres:       String(f[F.adres] || '').trim(),
    plaats:      String(f[F.plaats] || '').trim(),
    postcode:    String(f[F.postcode] || '').trim(),
    type:        String(f[F.type] || '').trim(),
    transactie:  String(f[F.transactie] || '').trim() || 'te koop',
    prijs:       getal(f[F.prijs]),
    slaapkamers: getal(f[F.slaapkamers]),
    badkamers:   getal(f[F.badkamers]),
    oppervlakte: getal(f[F.oppervlakte]),
    grond:       getal(f[F.grond]),
    epc:         String(f[F.epc] || '').trim(),
    bouwjaar:    getal(f[F.bouwjaar]),
    status:      normStatus(f[F.status]),
    omschrijving:String(f[F.omschrijving] || '').trim(),
    troeven:     regels(f[F.troeven]),
    fotos:       regels(f[F.fotos]),
    publiek:     f[F.publiek] !== false,
    gearchiveerd:f[F.gearchiveerd] === true,
    aangemaakt:  String(f[F.aangemaakt] || '').trim(),
    bijgewerkt:  String(f[F.bijgewerkt] || '').trim(),
  };
}

/* Wat een klant mag insturen, en wat daarvan overleeft. Alles wat hier niet
   staat wordt genegeerd: een veld dat de UI niet kent hoort niet stilletjes in
   Airtable te belanden. */
function naarVelden(invoer, projectCode) {
  const v = {};
  v[F.project] = projectCode;

  if (invoer.adres        !== undefined) v[F.adres]        = String(invoer.adres || '').trim().slice(0, 200);
  if (invoer.plaats       !== undefined) v[F.plaats]       = String(invoer.plaats || '').trim().slice(0, 100);
  if (invoer.postcode     !== undefined) v[F.postcode]     = String(invoer.postcode || '').trim().slice(0, 20);
  if (invoer.epc          !== undefined) v[F.epc]          = String(invoer.epc || '').trim().slice(0, 40);
  if (invoer.omschrijving !== undefined) v[F.omschrijving] = String(invoer.omschrijving || '').trim().slice(0, 4000);

  if (invoer.type !== undefined) {
    const t = String(invoer.type || '').trim().toLowerCase();
    v[F.type] = TYPES.indexOf(t) !== -1 ? t : 'overig';
  }
  if (invoer.transactie !== undefined) {
    const t = String(invoer.transactie || '').trim().toLowerCase();
    v[F.transactie] = TRANSACTIES.indexOf(t) !== -1 ? t : 'te koop';
  }
  if (invoer.status !== undefined) v[F.status] = normStatus(invoer.status);

  /* Getallen met een dak erop. Niet uit netheid: een prijs van 1e21 komt
     straks in een WhatsApp-bericht naar een echte koper terecht. */
  const grens = { prijs: 100000000, slaapkamers: 50, badkamers: 50, oppervlakte: 100000, grond: 10000000, bouwjaar: 2200 };
  for (const [naam, veld] of [['prijs', F.prijs], ['slaapkamers', F.slaapkamers], ['badkamers', F.badkamers],
                              ['oppervlakte', F.oppervlakte], ['grond', F.grond], ['bouwjaar', F.bouwjaar]]) {
    if (invoer[naam] === undefined) continue;
    const n = getal(invoer[naam]);
    v[veld] = n === null ? null : Math.max(0, Math.min(grens[naam], n));
  }

  if (invoer.troeven !== undefined) {
    const lijst = Array.isArray(invoer.troeven) ? invoer.troeven : regels(invoer.troeven);
    v[F.troeven] = lijst.map((s) => String(s).trim().slice(0, 200)).filter(Boolean).slice(0, 12).join('\n');
  }
  if (invoer.fotos !== undefined) {
    const lijst = Array.isArray(invoer.fotos) ? invoer.fotos : regels(invoer.fotos);
    /* Alleen https. Een http-URL in de fiche wordt straks in een browser
       geladen naast een pagina die wél https is, en dan laadt hij niet. */
    v[F.fotos] = lijst
      .map((s) => String(s).trim())
      .filter((s) => /^https:\/\/[^\s]{5,500}$/.test(s))
      .slice(0, 20).join('\n');
  }
  if (invoer.publiek !== undefined) v[F.publiek] = invoer.publiek !== false;

  return v;
}

/* ── Pandcodes ───────────────────────────────────────────────────────────────
   De code staat in een publieke URL (/start/TELJO/P3), dus hij moet kort en
   voorleesbaar zijn: een makelaar typt hem over van een bordje. Vandaar
   hoofdletters, cijfers en een streepje, meer niet.

   Een eigen referentie mag ook -- veel kantoren hebben er al een ("VH-2291").
   Is er niets meegegeven, dan wordt het P1, P2, P3. */
const CODE_PATROON = /^[A-Z0-9][A-Z0-9-]{0,19}$/;

function normCode(code) {
  return String(code == null ? '' : code).trim().toUpperCase().replace(/\s+/g, '-');
}

function geldigeCode(code) {
  return CODE_PATROON.test(normCode(code));
}

/** De eerstvolgende vrije P-code voor deze klant. */
function volgendeCode(bestaande) {
  let hoogste = 0;
  for (const p of bestaande) {
    const m = /^P(\d+)$/.exec(normCode(p.code));
    if (m) hoogste = Math.max(hoogste, parseInt(m[1], 10));
  }
  return 'P' + (hoogste + 1);
}

/* ── Lezen ───────────────────────────────────────────────────────────────── */

/**
 * Alle panden van één klant.
 * @param {string} projectCode  uit de geverifieerde sessie
 * @param {object} [opties] { inclusiefGearchiveerd, alleenBezichtigbaar, alleenPubliek }
 */
async function list(projectCode, opties = {}) {
  const tenant = String(projectCode || '').trim();
  /* Leeg leest verderop als "toon alles". Hier stopt dat. */
  if (!tenant) throw new PropertyError('Panden opvragen zonder projectcode.', 'no_tenant');
  if (!(await available())) return [];

  const formule = encodeURIComponent(`{${F.project}}="${escapeFormula(tenant)}"`);
  const uit = [];
  let offset = '';
  /* Paginatie: Airtable geeft maximaal 100 records per pagina. Een kantoor met
     honderdvijftig panden mag er niet vijftig kwijtraken -- precies de fout die
     eerder in de preflight zat. Vier pagina's is het dak; daarboven is de
     lijst-UI toch niet meer het juiste gereedschap. */
  for (let ronde = 0; ronde < 4; ronde++) {
    const r = await atFetch(
      `${TABEL}?filterByFormula=${formule}&pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`
    );
    if (!r.ok) {
      console.warn('[panden] lijst mislukt:', r.status);
      throw new PropertyError('Panden konden niet opgehaald worden.', 'read_failed');
    }
    const d = await r.json();
    for (const rec of (d.records || [])) uit.push(vanRecord(rec));
    if (!d.offset) break;
    offset = d.offset;
  }

  let panden = uit.filter((p) => p.projectCode === tenant);   // riem en bretels
  if (!opties.inclusiefGearchiveerd) panden = panden.filter((p) => !p.gearchiveerd);
  if (opties.alleenBezichtigbaar)    panden = panden.filter((p) => kanBezichtigen(p.status));
  if (opties.alleenPubliek)          panden = panden.filter((p) => p.publiek);

  /* Op code, natuurlijk gesorteerd: P2 hoort voor P10 te staan. */
  return panden.sort((a, b) => a.code.localeCompare(b.code, 'nl', { numeric: true }));
}

/**
 * Eén pand, op code, binnen deze klant.
 * Geeft null als het niet bestaat -- dat is geen fout maar een antwoord: de
 * code komt uit een URL die iemand kan verzinnen of verkeerd overtypen.
 */
async function getByCode(projectCode, code) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new PropertyError('Pand opvragen zonder projectcode.', 'no_tenant');
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
  const pand = vanRecord(rec);
  /* De filterformule doet dit al. Nog een keer, want dit is de plek waar een
     fout betekent dat klant A het pand van klant B ziet. */
  if (pand.projectCode !== tenant) return null;
  return pand;
}

/* ── Herkennen uit een gesprek ───────────────────────────────────────────────
 * Voor de lead die gewoon naar het WhatsApp-nummer schrijft zonder ooit een
 * pandlink aan te raken. "Die woning in de Lange Violettestraat" of "de
 * tweede die op jullie site staat, in Gent".
 *
 * Belangrijk: dit BESLIST niets. Het levert een kandidaat. Alleen bij precies
 * één treffer weet je het zeker; bij meer moet de AI het gewoon vragen. Een
 * pand aan de verkeerde lead hangen is erger dan het niet weten.
 */
function matchUitTekst(panden, tekst) {
  const t = String(tekst || '').toLowerCase();
  if (!t.trim() || !panden.length) return { pand: null, kandidaten: [], reden: 'geen_tekst' };

  const treffers = new Map();
  const tel = (p, punten) => treffers.set(p.code, (treffers.get(p.code) || 0) + punten);

  for (const p of panden) {
    /* De code zelf, als hij hem overtypt van een bordje. Met woordgrenzen:
       "P1" mag niet matchen in "P10" of midden in een woord. */
    if (p.code && new RegExp('(^|[^a-z0-9])' + p.code.toLowerCase().replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '([^a-z0-9]|$)').test(t)) tel(p, 10);

    /* De straat. Niet het huisnummer erbij: mensen schrijven "de Lange
       Violettestraat" zonder nummer. */
    const straat = p.adres.replace(/\s*\d+.*$/, '').trim().toLowerCase();
    if (straat.length >= 5 && t.indexOf(straat) !== -1) tel(p, 6);

    /* De plaats telt licht mee: hij onderscheidt alleen als de panden in
       verschillende steden staan. */
    if (p.plaats.length >= 3 && t.indexOf(p.plaats.toLowerCase()) !== -1) tel(p, 2);
  }

  const gescoord = panden
    .map((p) => ({ pand: p, punten: treffers.get(p.code) || 0 }))
    .filter((x) => x.punten > 0)
    .sort((a, b) => b.punten - a.punten);

  if (!gescoord.length) return { pand: null, kandidaten: [], reden: 'geen_treffer' };
  /* Gelijkspel bovenaan is geen antwoord. Twee panden in dezelfde straat komen
     echt voor -- een appartementsgebouw met twee eenheden. */
  if (gescoord.length > 1 && gescoord[0].punten === gescoord[1].punten) {
    return { pand: null, kandidaten: gescoord.map((x) => x.pand), reden: 'meerdere' };
  }
  return { pand: gescoord[0].pand, kandidaten: gescoord.map((x) => x.pand), reden: 'match' };
}

/* ── Schrijven ───────────────────────────────────────────────────────────── */

/**
 * Aanmaken of bijwerken. Zonder code = nieuw, met code = bijwerken.
 * @param {string} projectCode  uit de geverifieerde sessie
 * @param {object} invoer
 */
async function save(projectCode, invoer = {}) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new PropertyError('Pand opslaan zonder projectcode.', 'no_tenant');
  if (!(await available())) {
    throw new PropertyError(
      `De tabel "${TABEL}" bestaat nog niet in Airtable. Zie api/_properties.js voor de velden.`,
      'no_table');
  }

  /* Een pand zonder adres is geen pand: het staat straks in een WhatsApp-
     bericht en op een publieke pagina. */
  const adres = String(invoer.adres || '').trim();
  if (!adres) throw new PropertyError('Een pand heeft minstens een adres nodig.', 'no_address');

  const bestaande = await list(tenant, { inclusiefGearchiveerd: true });
  const nu = new Date().toISOString();

  /* Bijwerken? Dan moet het pand van DEZE klant zijn. De code komt uit een
     formulier en is dus te veranderen door wie het formulier openzet. */
  if (invoer.code) {
    const c = normCode(invoer.code);
    if (!geldigeCode(c)) {
      throw new PropertyError('Een pandcode mag alleen letters, cijfers en streepjes bevatten.', 'bad_code');
    }
    const huidig = bestaande.find((p) => p.code === c);
    if (huidig) {
      const velden = naarVelden(invoer, tenant);
      velden[F.bijgewerkt] = nu;
      const r = await atFetch(`${TABEL}/${huidig.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ fields: velden }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        console.warn('[panden] bijwerken mislukt:', r.status, txt.slice(0, 200));
        throw new PropertyError('Het pand kon niet bijgewerkt worden.', 'write_failed');
      }
      return vanRecord(await r.json());
    }
    /* Een code die hier nog niet bestaat is een NIEUW pand met een eigen
       referentie. Dat mag -- zolang hij niet botst, en dat kan niet, want we
       weten net dat hij vrij is. */
    invoer = Object.assign({}, invoer, { code: c });
  }

  const code = invoer.code ? normCode(invoer.code) : volgendeCode(bestaande);
  const velden = naarVelden(invoer, tenant);
  velden[F.code]       = code;
  velden[F.aangemaakt] = nu;
  velden[F.bijgewerkt] = nu;
  if (velden[F.status] === undefined) velden[F.status] = STATUS.BESCHIKBAAR;
  if (velden[F.publiek] === undefined) velden[F.publiek] = true;

  const r = await atFetch(TABEL, { method: 'POST', body: JSON.stringify({ fields: velden }) });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.warn('[panden] aanmaken mislukt:', r.status, txt.slice(0, 200));
    throw new PropertyError('Het pand kon niet aangemaakt worden.', 'write_failed');
  }
  return vanRecord(await r.json());
}

/**
 * Archiveren, niet verwijderen.
 *
 * Aan een pand hangen leads, gesprekken en afspraken. Het record weggooien
 * maakt van die geschiedenis een verwijzing naar niets -- en dan staat er bij
 * een lead van vorige maand geen pand meer, wat niet te onderscheiden is van
 * "we wisten het nooit".
 */
async function archive(projectCode, code, gearchiveerd = true) {
  const tenant = String(projectCode || '').trim();
  if (!tenant) throw new PropertyError('Pand archiveren zonder projectcode.', 'no_tenant');
  const pand = await getByCode(tenant, code);
  if (!pand) throw new PropertyError('Pand niet gevonden.', 'not_found');

  const velden = {};
  velden[F.gearchiveerd] = gearchiveerd === true;
  velden[F.bijgewerkt]   = new Date().toISOString();
  const r = await atFetch(`${TABEL}/${pand.id}`, { method: 'PATCH', body: JSON.stringify({ fields: velden }) });
  if (!r.ok) throw new PropertyError('Het pand kon niet gearchiveerd worden.', 'write_failed');
  return vanRecord(await r.json());
}

/* ── Presentatie ─────────────────────────────────────────────────────────────
   Deze twee staan hier en niet in de UI, omdat het formulier, het dashboard,
   de AI-prompt en Faro anders elk hun eigen manier krijgen om een prijs op te
   schrijven -- en dan lezen een klant en zijn lead een ander bedrag. */

/** '€ 395.000', of null als er geen prijs bekend is. NOOIT een gok. */
function prijsTekst(prijs) {
  if (prijs === null || prijs === undefined || !Number.isFinite(Number(prijs))) return null;
  return '€ ' + Math.round(Number(prijs)).toLocaleString('nl-BE');
}

/** 'Lange Violettestraat 12, 9000 Gent' -- zonder lege stukken en dubbele komma's. */
function adresTekst(pand) {
  const delen = [pand.adres, [pand.postcode, pand.plaats].filter(Boolean).join(' ')].filter(Boolean);
  return delen.join(', ');
}

/** Korte regel voor een lijst: 'P3 · Lange Violettestraat 12, Gent · € 395.000'. */
function samenvatting(pand) {
  const stukken = [pand.code, adresTekst(pand)];
  const p = prijsTekst(pand.prijs);
  if (p) stukken.push(p);
  if (!kanBezichtigen(pand.status)) stukken.push('(' + pand.status + ')');
  return stukken.filter(Boolean).join(' · ');
}

module.exports = {
  TABEL, F, STATUS, ALLE_STATUS, TYPES, TRANSACTIES, BEZICHTIGBAAR,
  PropertyError,
  available, configured, _resetAvailability,
  list, getByCode, save, archive,
  matchUitTekst, kanBezichtigen, normStatus, normCode, geldigeCode, volgendeCode,
  prijsTekst, adresTekst, samenvatting, vanRecord, naarVelden,
};
