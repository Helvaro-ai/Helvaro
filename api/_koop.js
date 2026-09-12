'use strict';
/*
 * Wat een dealership-lead over zijn AANKOOP zegt -- financiering, termijn,
 * intentie, budget en een eventuele inruilwagen.
 *
 * ── Waarom dit los staat van api/_wens.js ────────────────────────────────────
 * _wens.js gaat over WELKE auto iemand zoekt (merk, model, budget-als-filter).
 * Dit bestand gaat over HOE die aankoop eruitziet: heeft hij de financiering
 * al rond, wil hij deze maand nog rijden of oriënteert hij zich pas, en heeft
 * hij iets om in te ruilen. Dat is geen matchcriterium voor een auto -- het is
 * de basis van api/_leadscore.js, die er een getal en een vervolgactie van
 * maakt. Twee verschillende vragen door elkaar zetten in één blob maakt straks
 * geen van beide functies te lezen.
 *
 * ── Waarom de koopinfo in de Notities-blob staat ─────────────────────────────
 * Zelfde plek als de wens en de aanbodcode. Geen nieuw Airtable-veld, dus geen
 * migratie en geen 422 op een tabel waar het veld nog niet bestaat -- zie de
 * kop van api/_wens.js, dezelfde reden geldt hier woordelijk.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const FINANCIERING = Object.freeze(['cash', 'goedgekeurd', 'nodig']);
const TERMIJN       = Object.freeze(['kort', 'middel', 'lang']);
const INTENTIE      = Object.freeze(['sterk', 'matig', 'laag']);
/* Wat voor afspraak de klant ZELF vroeg -- niet wat er uiteindelijk geboekt
   werd (dat staat al op de Appointment zelf), maar het SIGNAAL dat hij erom
   vroeg. Zelfde vier waarden als api/_dealer-boeking.js AFSPRAAK_TYPES; die
   twee lijsten moeten gelijk blijven lopen, want dit veld voedt zowel de
   prompt (KOOP_OPDRACHT) als het BOOK-type in api/whatsapp.js. */
const AFSPRAAK      = Object.freeze(['proefrit', 'bezichtiging', 'ophaling', 'gesprek']);

const VELDEN = Object.freeze(['financiering', 'termijn', 'intentie', 'budget', 'maandbudget', 'inruil', 'afspraak']);

function getal(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function tekst(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 60);
}

function enumWaarde(v, toegestaan) {
  const s = tekst(v, 20).toLowerCase();
  return toegestaan.indexOf(s) !== -1 ? s : '';
}

/**
 * De inruilwagen opschonen, of null als er niets bruikbaars in zit.
 * Geen enum op merk/model/staat: dat zijn vrije tekstvelden, net als bij
 * api/_wens.js -- een dealer typt "SUV, wat gedeukt" en geen van die twee
 * woorden hoort op een witte lijst te staan.
 */
function normaliseerInruil(ruw) {
  if (!ruw || typeof ruw !== 'object') return null;
  const i = {};
  if (tekst(ruw.merk))        i.merk        = tekst(ruw.merk, 40).toLowerCase();
  if (tekst(ruw.model))       i.model       = tekst(ruw.model, 40).toLowerCase();
  if (tekst(ruw.brandstof))   i.brandstof   = tekst(ruw.brandstof, 20).toLowerCase();
  if (tekst(ruw.transmissie)) i.transmissie = tekst(ruw.transmissie, 20).toLowerCase();
  if (tekst(ruw.staat))       i.staat       = tekst(ruw.staat, 80).toLowerCase();

  const j = getal(ruw.jaar);
  /* Zelfde bereik als minJaar in api/_wens.js: alles erbuiten is een typfout. */
  if (j !== null && j >= 1950 && j <= 2100) i.jaar = Math.round(j);

  const k = getal(ruw.km);
  if (k !== null) i.km = Math.round(k);

  return Object.keys(i).length ? i : null;
}

/**
 * Koopinformatie opschonen tot een vaste vorm.
 *
 * Anders dan api/_wens.js VULT dit altijd alle zes velden -- '' voor een
 * onbekende of ontbrekende enum, null voor een ontbrekend getal of een
 * ontbrekende inruil. Dat is met opzet: een dashboardkaart die `koop.termijn`
 * leest mag geen `undefined` op het scherm krijgen omdat de lead nog nooit
 * iets over timing zei.
 *
 * Geeft null terug als ER NIETS BRUIKBAARS IN ZIT -- een lege koop opslaan
 * zou de score straks overal op nul laten uitkomen zonder dat iemand dat kan
 * onderscheiden van "nog niet gevraagd".
 */
function normaliseer(ruw) {
  if (!ruw || typeof ruw !== 'object') return null;

  const financiering = enumWaarde(ruw.financiering, FINANCIERING);
  const termijn       = enumWaarde(ruw.termijn, TERMIJN);
  const intentie       = enumWaarde(ruw.intentie, INTENTIE);
  const afspraak       = enumWaarde(ruw.afspraak, AFSPRAAK);

  const budgetRuw = getal(ruw.budget);
  const budget = budgetRuw !== null ? Math.round(budgetRuw) : null;

  const maandRuw = getal(ruw.maandbudget);
  const maandbudget = maandRuw !== null ? Math.round(maandRuw) : null;

  const inruil = normaliseerInruil(ruw.inruil);

  if (!financiering && !termijn && !intentie && !afspraak && budget === null && maandbudget === null && !inruil) {
    return null;
  }

  return { financiering, termijn, intentie, budget, maandbudget, inruil, afspraak };
}

/** De koopinfo uit een Notities-blob halen. Werpt nooit. */
function uitNotities(raw) {
  const t = raw ? String(raw).trim() : '';
  if (!t.startsWith('{')) return null;
  try {
    const d = JSON.parse(t);
    return normaliseer(d && d.koop);
  } catch (_) { return null; }
}

/**
 * De koopinfo IN een Notities-blob zetten, zonder de rest te slopen.
 * Zelfde merge-contract als api/_wens.js naarNotities: notities, taken,
 * gesprekken, property, wens en de escalatievlag blijven staan.
 * Geeft null als er niets verandert, zodat de aanroeper een overbodige
 * Airtable-schrijfactie kan overslaan.
 */
function naarNotities(raw, koop) {
  const schoon = normaliseer(koop);
  if (!schoon) return null;
  const t = raw ? String(raw).trim() : '';
  let data = { _v: 1, notes: [], tasks: [], calls: [] };
  let handled = false;
  if (t.startsWith('{')) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === 'object') { data = { ...data, ...parsed }; handled = true; }
    } catch (_) { /* kapotte JSON: hieronder als oude platte tekst bewaren */ }
  }
  if (!handled && t) {
    data.notes = [{ id: 'legacy', text: t, ts: new Date().toISOString() }];
  }
  if (JSON.stringify(data.koop || null) === JSON.stringify(schoon)) return null;
  data.koop = schoon;
  data.koopAt = new Date().toISOString();
  return JSON.stringify(data);
}

const FINANCIERING_TEKST = Object.freeze({
  cash: 'cash', goedgekeurd: 'financiering goedgekeurd', nodig: 'financiering nog nodig',
});
const TERMIJN_TEKST = Object.freeze({
  kort: 'wil snel kopen', middel: 'termijn: enkele maanden', lang: 'termijn: langere termijn',
});

/** De koopinfo in gewone woorden, voor op een kaart of in een prompt. Nooit "undefined". */
function omschrijf(koop) {
  const k = normaliseer(koop);
  if (!k) return '';
  const d = [];
  if (k.financiering) d.push(FINANCIERING_TEKST[k.financiering]);
  if (k.termijn)       d.push(TERMIJN_TEKST[k.termijn]);
  if (k.intentie)       d.push('intentie: ' + k.intentie);
  if (k.budget !== null)       d.push('budget tot € ' + k.budget.toLocaleString('nl-BE'));
  if (k.maandbudget !== null)   d.push('maandbudget € ' + k.maandbudget.toLocaleString('nl-BE'));
  if (k.inruil) {
    const naam = [k.inruil.merk, k.inruil.model].filter(Boolean).join(' ');
    d.push('inruil' + (naam ? ': ' + naam : ''));
  }
  return d.join(', ');
}

module.exports = {
  VELDEN,
  FINANCIERING,
  TERMIJN,
  INTENTIE,
  AFSPRAAK,
  normaliseer,
  uitNotities,
  naarNotities,
  omschrijf,
};
