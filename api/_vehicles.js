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
});

class VehicleError extends Error {
  constructor(bericht, code) { super(bericht); this.name = 'VehicleError'; this.code = code; }
}

/* ── Status ──────────────────────────────────────────────────────────────────
 * Alleen 'beschikbaar' en 'gereserveerd' laten een proefrit toe. Gereserveerd
 * mag omdat een reservering afspringt en de dealer dan blij is dat er nog
 * iemand achter staat -- maar Faro hoort er wel eerlijk bij te zeggen dat er al
 * iemand op zit, net zoals 'onder bod' bij een pand.
 *
 * Dit is een REM in de code, geen instructie aan het model. Een prompt is een
 * verzoek; dit is een regel.
 */
const RIJDBARE_STATUS = Object.freeze(['beschikbaar', 'gereserveerd']);

function normStatus(s) {
  const v = String(s == null ? '' : s).trim().toLowerCase();
  const bekend = ['beschikbaar', 'gereserveerd', 'verkocht', 'uit aanbod'];
  return bekend.indexOf(v) !== -1 ? v : 'beschikbaar';
}

function kanProefrit(status) { return RIJDBARE_STATUS.indexOf(normStatus(status)) !== -1; }

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

async function available() {
  if (_beschikbaar !== null) return _beschikbaar;
  if (!configured()) { _beschikbaar = false; return false; }
  try {
    const r = await atFetch(`${TABEL}?pageSize=1`);
    _beschikbaar = r.ok;
    if (!r.ok) {
      console.warn(`[voertuigen] tabel "${TABEL}" niet gevonden (HTTP ${r.status}) — `
        + 'voertuigen zijn uit tot die tabel bestaat. Zie de kop van api/_vehicles.js.');
    }
  } catch (e) {
    console.warn('[voertuigen] Airtable onbereikbaar:', e && e.message);
    _beschikbaar = false;
  }
  return _beschikbaar;
}

function _resetAvailability() { _beschikbaar = null; }

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
  /* Vier pagina's van 100. Een dealer met meer dan 400 auto's in de etalage
     heeft een voorraadsysteem nodig en geen lijstscherm -- zie de kop. */
  for (let ronde = 0; ronde < 4; ronde++) {
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
  }

  let autos = uit.filter((v) => v.projectCode === tenant);   // riem en bretels
  if (!opties.inclusiefGearchiveerd) autos = autos.filter((v) => !v.gearchiveerd);
  if (opties.alleenRijdbaar)         autos = autos.filter((v) => kanProefrit(v.status));
  if (opties.alleenPubliek)          autos = autos.filter((v) => v.publiek);

  return autos.sort((a, b) => a.code.localeCompare(b.code, 'nl', { numeric: true }));
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

  return velden;
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
    const r = await atFetch(`${TABEL}/${bestaand.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: velden, typecast: true }),
    });
    if (!r.ok) {
      console.warn('[voertuigen] bijwerken mislukt:', r.status, await r.text().catch(() => ''));
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

  if (bestaande.some((v) => v.code === velden[F.code])) {
    throw new VehicleError('Die voertuigcode bestaat al.', 'duplicate_code');
  }

  const r = await atFetch(TABEL, {
    method: 'POST',
    body: JSON.stringify({ fields: velden, typecast: true }),
  });
  if (!r.ok) {
    console.warn('[voertuigen] aanmaken mislukt:', r.status, await r.text().catch(() => ''));
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
  TABEL,
  F,
  VehicleError,
  RIJDBARE_STATUS,
  normStatus,
  kanProefrit,
  configured,
  available,
  _resetAvailability,
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
  prijsTekst,
  kmTekst,
  vermogenTekst,
  naam,
  samenvatting,
};
