'use strict';
/*
 * Campagnes: een pand onder de aandacht brengen bij een selectie leads.
 *
 * ── Wat dit WEL is ───────────────────────────────────────────────────────────
 * De opslag en de administratie. Een campagne aanmaken, er leads aan hangen,
 * zien wat de stand is, en per lead bijhouden of er al iets naartoe is. Dat is
 * het deel dat volledig van ons is en dus nu al kan werken.
 *
 * ── Wat dit bewust NIET is ───────────────────────────────────────────────────
 * Het VERSTUREN. Dat kan niet zonder twee dingen die niet in deze codebase
 * liggen:
 *
 *   1. Een goedgekeurde WhatsApp-template. Een campagnebericht valt vrijwel
 *      altijd buiten het 24-uursvenster (dat is nu juist waarom je een campagne
 *      doet), en dan staat Meta alleen een vooraf goedgekeurde template toe.
 *      Een vrij bericht wordt daar geweigerd -- dat is geen instelling die wij
 *      kunnen omzetten.
 *   2. Meta's marketing-categorie op die template, met alles wat daaraan hangt
 *      qua kosten en limieten.
 *
 * Daarom stopt deze module bij `klaar_voor_verzending` en zet hij per lead een
 * rij klaar. Wie de template heeft, hoeft alleen nog `verstuur()` te schrijven
 * -- en die vindt de rem tegen dubbel versturen en de afmeldcontrole dan al
 * staan. Precies dezelfde afweging als bij de videoprovider: de weg eromheen
 * bouwen zodat er niets meer te bedenken valt als het stuk erbij komt.
 *
 * ── De afmelding is geen bijzaak ─────────────────────────────────────────────
 * Een campagne is precies de plek waar je een afmelding negeert zonder het te
 * merken: je selecteert honderd leads en stuurt. `selecteerLeads()` gooit de
 * afgemelde er daarom hier al uit, en api/_wa-send.js weigert ze daarna nog een
 * keer. Twee remmen, want dit is het scenario waarin één fout honderd mensen
 * raakt en het gedeelde WhatsApp-nummer in gevaar brengt.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const _optout = require('./_optout');

const AIRTABLE_BASE   = process.env.BASE_AIRTABLE;
const AIRTABLE_TOKEN  = process.env.API_AIRTABLE;
const CAMPAGNES_TABLE = 'campaigns';   // op naam: deze tabel is nieuw en heeft nog geen vaste id
const LEADS_TABLE     = 'tbliukTnDAbEDcZmt';

const F = Object.freeze({
  NAAM:      'Name',
  CODE:      'Project Code',
  PAND:      'Property Code',
  STATUS:    'Status',
  KANALEN:   'Channels',
  INVALSHOEK:'Angle',
  BERICHT:   'Message',
  LEADS:     'Lead IDs',        // long text, JSON-array met record-ids
  VERSTUURD: 'Sent Count',
  GEMAAKT:   'Created At',
  NOTITIES:  'Notes',
});

/*
 * De toestanden van een campagne.
 *
 * `klaar` is bewust het eindstation van wat deze code kan. Er is geen 'bezig'
 * of 'verstuurd' die we zelf zetten zonder ooit iets verstuurd te hebben --
 * een status die liegt is erger dan een status die eerlijk zegt dat hij wacht.
 */
const STATUS = Object.freeze({
  CONCEPT:     'concept',
  KLAAR:       'klaar_voor_verzending',
  VERSTUURD:   'verstuurd',
  GESTOPT:     'gestopt',
});

class CampagneError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CampagneError';
    this.code = code || 'campagne_fout';
  }
}

function envKlaar() { return Boolean(AIRTABLE_BASE && AIRTABLE_TOKEN); }

function escapeFormula(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function atFetch(url, opts) {
  const r = await fetch(url, opts);
  if (r.status !== 429) return r;
  await new Promise((res) => setTimeout(res, 900 + Math.random() * 300));
  return fetch(url, opts);
}

function url(tabel, pad = '') {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(tabel)}${pad}`;
}
function kop(extra) {
  return Object.assign({ Authorization: `Bearer ${AIRTABLE_TOKEN}` }, extra || {});
}

/* De tabel bestaat mogelijk nog niet. Eén keer per instantie vaststellen en
   onthouden, zodat niet elke aanroep een 404 uitlokt -- en met een duidelijke
   fout naar boven, want "campagnes werken niet" is iets anders dan "er zijn
   geen campagnes". */
let _tabelBestaat = null;
async function tabelBeschikbaar() {
  if (_tabelBestaat !== null) return _tabelBestaat;
  if (!envKlaar()) { _tabelBestaat = false; return false; }
  try {
    const r = await atFetch(url(CAMPAGNES_TABLE, '?maxRecords=1'), { headers: kop() });
    _tabelBestaat = r.ok;
    if (!r.ok) {
      console.warn(`[campagnes] tabel "${CAMPAGNES_TABLE}" niet gevonden (HTTP ${r.status}). `
        + 'Campagnes blijven uit tot hij bestaat; zie de kop van api/_campagnes.js voor de velden.');
    }
  } catch (e) {
    console.warn('[campagnes] tabel niet te bereiken:', e && e.message);
    _tabelBestaat = false;
  }
  return _tabelBestaat;
}

/** Alleen voor tests: de onthouden uitkomst weggooien. */
function _resetTabelCache() { _tabelBestaat = null; }

/**
 * De leads die een campagne mag raken.
 *
 * Filtert op tenant EN gooit afgemelde leads eruit. Dat tweede is de reden dat
 * deze functie bestaat in plaats van dat de aanroeper zelf een lijst id's
 * doorgeeft: een campagne is precies de plek waar je honderd mensen tegelijk
 * aanschrijft, en dus ook de plek waar één gemiste afmelding honderd keer
 * misgaat.
 *
 * @param {string} projectCode  uit de geverifieerde sessie
 * @param {string[]} leadIds    de gewenste selectie
 * @returns {Promise<{toegestaan:string[], afgemeld:string[], vreemd:string[]}>}
 */
async function selecteerLeads(projectCode, leadIds) {
  const code = String(projectCode || '').trim();
  const ids = [...new Set((Array.isArray(leadIds) ? leadIds : []).filter(Boolean))].slice(0, 200);
  const leeg = { toegestaan: [], afgemeld: [], vreemd: [] };
  if (!code || !ids.length || !envKlaar()) return leeg;

  const formule = encodeURIComponent(`OR(${ids.map((id) => `RECORD_ID()="${escapeFormula(id)}"`).join(',')})`);
  let records = [];
  try {
    const r = await atFetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/${LEADS_TABLE}?filterByFormula=${formule}&pageSize=200`,
      { headers: kop() });
    if (!r.ok) throw new CampagneError('Leads niet op te halen.', 'lookup_failed');
    records = (await r.json()).records || [];
  } catch (err) {
    console.error('[campagnes] leads ophalen mislukt:', err && err.message);
    throw new CampagneError('De leads konden niet opgehaald worden.', 'lookup_failed');
  }

  const uit = { toegestaan: [], afgemeld: [], vreemd: [] };
  const gevonden = new Set();
  for (const rec of records) {
    gevonden.add(rec.id);
    const f = rec.fields || {};
    /* Tenantcontrole in code, niet alleen in de formule. De formule filtert
       hier op RECORD_ID en NIET op projectcode -- dat kan ook niet, want dan
       zou een lead van een ander kantoor gewoon niet gevonden worden en als
       "bestaat niet" tellen in plaats van als "niet van jou". */
    if ((f['Project Code'] || '') !== code) { uit.vreemd.push(rec.id); continue; }
    if (_optout.isAfgemeld(f)) { uit.afgemeld.push(rec.id); continue; }
    uit.toegestaan.push(rec.id);
  }
  // Een id dat helemaal niet bestaat telt als vreemd: onbekend en van een
  // ander kantoor horen naar buiten toe hetzelfde te lezen.
  for (const id of ids) if (!gevonden.has(id)) uit.vreemd.push(id);
  return uit;
}

/**
 * Een campagne aanmaken.
 *
 * @param {object} o
 * @param {string} o.projectCode   uit de sessie
 * @param {string} o.naam
 * @param {string} [o.pandCode]
 * @param {string[]} [o.kanalen]
 * @param {string} [o.invalshoek]
 * @param {string} [o.bericht]
 * @param {string[]} [o.leadIds]
 */
async function maak({ projectCode, naam, pandCode, kanalen, invalshoek, bericht, leadIds } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) throw new CampagneError('Geen projectcode.', 'geen_tenant');
  if (!(await tabelBeschikbaar())) {
    throw new CampagneError(
      'Campagnes staan nog niet aan: de tabel "campaigns" bestaat niet in Airtable.',
      'tabel_ontbreekt');
  }

  const selectie = await selecteerLeads(code, leadIds || []);

  const velden = {
    [F.NAAM]:    String(naam || '').trim().slice(0, 120) || 'Naamloze campagne',
    [F.CODE]:    code,
    [F.STATUS]:  selectie.toegestaan.length ? STATUS.KLAAR : STATUS.CONCEPT,
    [F.LEADS]:   JSON.stringify(selectie.toegestaan),
    [F.GEMAAKT]: new Date().toISOString(),
    [F.VERSTUURD]: 0,
  };
  if (pandCode)   velden[F.PAND] = String(pandCode).trim().slice(0, 40);
  if (invalshoek) velden[F.INVALSHOEK] = String(invalshoek).slice(0, 500);
  if (bericht)    velden[F.BERICHT] = String(bericht).slice(0, 4000);
  if (Array.isArray(kanalen) && kanalen.length) velden[F.KANALEN] = kanalen.join(', ');

  /* Wat er is weggelaten en waarom, in de campagne zelf. Anders vraagt de
     makelaar zich over een week af waarom hij 47 en geen 50 leads ziet. */
  const opmerkingen = [];
  if (selectie.afgemeld.length) opmerkingen.push(`${selectie.afgemeld.length} lead(s) overgeslagen: afgemeld.`);
  if (selectie.vreemd.length)   opmerkingen.push(`${selectie.vreemd.length} lead(s) overgeslagen: niet gevonden in dit account.`);
  if (opmerkingen.length) velden[F.NOTITIES] = opmerkingen.join(' ');

  const r = await atFetch(url(CAMPAGNES_TABLE), {
    method: 'POST',
    headers: kop({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fields: velden, typecast: true }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error(`[campagnes] aanmaken mislukt (HTTP ${r.status}):`, t.slice(0, 300));
    throw new CampagneError('De campagne kon niet aangemaakt worden.', 'aanmaken_mislukt');
  }
  const d = await r.json();
  return {
    id: d.id,
    naam: velden[F.NAAM],
    status: velden[F.STATUS],
    aantalLeads: selectie.toegestaan.length,
    afgemeld: selectie.afgemeld.length,
    nietGevonden: selectie.vreemd.length,
  };
}

/** Eén campagne ophalen, met de tenantcontrole in code. */
async function leesEigen(projectCode, id) {
  const code = String(projectCode || '').trim();
  const rid = String(id || '').trim();
  if (!code || !rid || !envKlaar()) return null;
  if (!(await tabelBeschikbaar())) return null;
  try {
    const r = await atFetch(url(CAMPAGNES_TABLE, `/${encodeURIComponent(rid)}`), { headers: kop() });
    if (!r.ok) return null;
    const rec = await r.json();
    if (!rec || !rec.fields || rec.fields[F.CODE] !== code) return null;
    return rec;
  } catch (err) {
    console.error('[campagnes] lezen mislukt:', err && err.message);
    return null;
  }
}

/** Leads toevoegen aan een bestaande campagne. Dubbelen tellen één keer. */
async function voegLeadsToe({ projectCode, campagneId, leadIds } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) throw new CampagneError('Geen projectcode.', 'geen_tenant');

  const rec = await leesEigen(code, campagneId);
  if (!rec) throw new CampagneError('Die campagne staat niet in dit account.', 'niet_gevonden');
  if (rec.fields[F.STATUS] === STATUS.GESTOPT) {
    throw new CampagneError('Deze campagne is gestopt.', 'gestopt');
  }

  const selectie = await selecteerLeads(code, leadIds || []);

  let bestaand = [];
  try { bestaand = JSON.parse(rec.fields[F.LEADS] || '[]'); } catch (_) { bestaand = []; }
  if (!Array.isArray(bestaand)) bestaand = [];

  const voor = new Set(bestaand);
  const nieuw = selectie.toegestaan.filter((id) => !voor.has(id));
  const samen = [...bestaand, ...nieuw];

  const r = await atFetch(url(CAMPAGNES_TABLE, `/${rec.id}`), {
    method: 'PATCH',
    headers: kop({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      fields: {
        [F.LEADS]: JSON.stringify(samen),
        [F.STATUS]: samen.length ? STATUS.KLAAR : rec.fields[F.STATUS],
      },
      typecast: true,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    console.error(`[campagnes] leads toevoegen mislukt (HTTP ${r.status}):`, t.slice(0, 300));
    throw new CampagneError('De leads konden niet toegevoegd worden.', 'toevoegen_mislukt');
  }

  return {
    id: rec.id,
    toegevoegd: nieuw.length,
    alAanwezig: selectie.toegestaan.length - nieuw.length,
    afgemeld: selectie.afgemeld.length,
    nietGevonden: selectie.vreemd.length,
    totaal: samen.length,
  };
}

/** De campagnes van één klant, nieuwste eerst. */
async function lijst(projectCode, { limiet = 25 } = {}) {
  const code = String(projectCode || '').trim();
  if (!code || !envKlaar()) return [];
  if (!(await tabelBeschikbaar())) return [];
  const formule = encodeURIComponent(`{${F.CODE}}="${escapeFormula(code)}"`);
  try {
    const r = await atFetch(
      url(CAMPAGNES_TABLE, `?filterByFormula=${formule}&pageSize=${Math.min(100, Math.max(1, limiet))}`
        + '&sort%5B0%5D%5Bfield%5D=Created%20At&sort%5B0%5D%5Bdirection%5D=desc'),
      { headers: kop() });
    if (!r.ok) return [];
    return ((await r.json()).records || [])
      .filter((rec) => (rec.fields || {})[F.CODE] === code)
      .map((rec) => {
        let leads = [];
        try { leads = JSON.parse(rec.fields[F.LEADS] || '[]'); } catch (_) { leads = []; }
        return {
          id: rec.id,
          naam: rec.fields[F.NAAM] || '',
          status: rec.fields[F.STATUS] || STATUS.CONCEPT,
          pandCode: rec.fields[F.PAND] || '',
          kanalen: rec.fields[F.KANALEN] || '',
          aantalLeads: Array.isArray(leads) ? leads.length : 0,
          verstuurd: Number(rec.fields[F.VERSTUURD]) || 0,
          gemaaktOp: rec.fields[F.GEMAAKT] || '',
          notities: rec.fields[F.NOTITIES] || '',
        };
      });
  } catch (err) {
    console.error('[campagnes] lijst mislukt:', err && err.message);
    return [];
  }
}

/** Een campagne stoppen. Onomkeerbaar in de zin dat hij niets meer verstuurt. */
async function stop({ projectCode, campagneId } = {}) {
  const rec = await leesEigen(projectCode, campagneId);
  if (!rec) throw new CampagneError('Die campagne staat niet in dit account.', 'niet_gevonden');
  const r = await atFetch(url(CAMPAGNES_TABLE, `/${rec.id}`), {
    method: 'PATCH',
    headers: kop({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ fields: { [F.STATUS]: STATUS.GESTOPT }, typecast: true }),
  });
  if (!r.ok) throw new CampagneError('De campagne kon niet gestopt worden.', 'stoppen_mislukt');
  return { id: rec.id, status: STATUS.GESTOPT };
}

module.exports = {
  F, STATUS, CAMPAGNES_TABLE, CampagneError,
  tabelBeschikbaar, selecteerLeads, maak, leesEigen, voegLeadsToe, lijst, stop,
  _resetTabelCache,
};
