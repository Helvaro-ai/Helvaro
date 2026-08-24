'use strict';
/*
 * Wat Helvaro ZELF betaalt.
 *
 * ── Waarom dit bestaat ───────────────────────────────────────────────────────
 * De vaste kosten stonden tot nu toe als één getal op de Founder-pagina --
 * "-€58" -- en dat getal kwam uit een prompt() in de browser en werd bewaard in
 * localStorage. Dus: onzichtbaar op een tweede toestel, weg bij het legen van
 * je browser, en op geen enkele manier na te rekenen. Je zag een nettowinst die
 * op een schatting van maanden geleden stond.
 *
 * Hier staat het uitgesplitst, per dienst, met bij elk bedrag WAAR het vandaan
 * komt. Dat laatste is het halve punt: een kostenoverzicht waarin een lijstprijs
 * en een gok er hetzelfde uitzien, is een kostenoverzicht dat je gaat geloven.
 *
 * ── Drie soorten getallen, en ze worden nooit door elkaar gehaald ────────────
 *
 *   'lijstprijs'   de gepubliceerde prijs van de leverancier. Vercel Pro en
 *                  Airtable Team staan zo in de lijst hieronder.
 *   'ingevuld'     jij hebt het bedrag zelf gezet (Airtable-tabel `costs`).
 *                  Wint altijd van een lijstprijs -- jij hebt de factuur.
 *   'onbekend'     we weten het niet. Dan staat er GEEN bedrag, en telt de
 *                  dienst als "nog invullen" in plaats van als nul. Een dienst
 *                  op nul zetten omdat je de prijs niet kent, is precies hoe
 *                  een kostenoverzicht te rooskleurig wordt.
 *
 * ── Geen wisselkoers uit de lucht ────────────────────────────────────────────
 * Vercel, Airtable en Anthropic factureren in dollar; de plannen zijn in euro.
 * Er wordt hier GEEN koers verzonnen: de totalen staan per munt naast elkaar.
 * Zet je KOSTEN_USD_EUR, dan komt er een gecombineerd eurototaal bij, mét de
 * koers die ervoor gebruikt is erbij vermeld.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop. Dit hangt aan api/admin.js, achter de admincontrole.
 */

const COSTS_TABLE = 'costs';

/* Veldnamen van de Airtable-tabel. Namen en niet id's: de tabel wordt door de
   eigenaar zelf bijgehouden en mag hernoemd worden zonder deploy. */
const F = Object.freeze({
  dienst:   'Service',
  naam:     'Name',
  bedrag:   'Amount',
  valuta:   'Currency',
  interval: 'Interval',
  aantal:   'Seats',
  actief:   'Active',
  notitie:  'Notes',
});

/*
 * De diensten die Helvaro draaien. Twee soorten:
 *
 *   soort 'vast'     een abonnement: elke maand hetzelfde, of je nu één klant
 *                    hebt of dertig.
 *   soort 'verbruik' je betaalt per aanroep. Het bedrag hangt af van gebruik en
 *                    staat dus NIET in deze lijst -- dat komt uit het gemeten
 *                    verbruik verderop.
 *
 * `env` doet dubbel werk: het vertelt of de dienst überhaupt AAN staat. Staat
 * er geen sleutel, dan draait die dienst niet en betaal je er niets voor. Dat
 * is eerlijker dan een lijst waarop alles staat wat ooit overwogen is.
 */
const DIENSTEN = Object.freeze([
  Object.freeze({
    id: 'vercel',
    naam: 'Vercel Pro',
    leverancier: 'Vercel Inc.',
    soort: 'vast',
    waarvoor: 'Hosting en uitvoering van de hele app.',
    /* USD 20 per teamlid per maand, gepubliceerde prijs. Het aantal leden weet
       dit bestand niet -- vandaar `perStuk`: het totaal is bedrag x aantal, en
       het aantal staat op 1 tot jij iets anders invult. */
    tarief: Object.freeze({ bedrag: 20, valuta: 'USD', interval: 'maand', perStuk: 'teamlid', bron: 'lijstprijs' }),
    /* Geen env-detectie: als dit draait, draait het op Vercel. */
    altijdAan: true,
  }),
  Object.freeze({
    id: 'airtable',
    naam: 'Airtable Team',
    leverancier: 'Formagrid Inc.',
    soort: 'vast',
    waarvoor: 'De database: klanten, leads, gesprekken, grootboek, panden.',
    /* USD 24 per plek per maand bij maandbetaling, USD 20 bij jaarbetaling.
       De maandprijs staat hier als standaard, want dat is de duurdere van de
       twee -- bij een schatting van je eigen kosten is dat de kant om je op te
       vergissen. Betaal je per jaar, zet het bedrag dan op 20. */
    tarief: Object.freeze({ bedrag: 24, valuta: 'USD', interval: 'maand', perStuk: 'plek', bron: 'lijstprijs' }),
    env: ['API_AIRTABLE'],
  }),
  Object.freeze({
    id: 'clerk',
    naam: 'Clerk',
    leverancier: 'Clerk Inc.',
    soort: 'vast',
    waarvoor: 'Inloggen op het dashboard.',
    /* Clerk heeft een gratis laag tot een aantal maandelijks actieve
       gebruikers en rekent daarboven per gebruiker. Met één klant zit je
       vrijwel zeker gratis -- maar "vrijwel zeker" is geen bedrag, dus staat
       er geen. */
    tarief: null,
    env: ['CLERK_SECRET_KEY'],
  }),
  Object.freeze({
    id: 'upstash',
    naam: 'Upstash Redis',
    leverancier: 'Upstash Inc.',
    soort: 'vast',
    waarvoor: 'Tellers voor snelheidsbegrenzing. Zonder deze sleutel telt de app in het geheugen.',
    tarief: null,
    env: ['UPSTASH_REDIS_REST_URL'],
  }),
  Object.freeze({
    id: 'whatsapp',
    naam: 'WhatsApp Business',
    leverancier: 'Meta Platforms Ireland',
    soort: 'verbruik',
    waarvoor: 'Het berichtenverkeer met de leads.',
    /* Meta rekent per gesprek en het tarief verschilt per land en per soort
       gesprek. Eén getal zou hier gewoon fout zijn. */
    tarief: null,
    env: ['WHATSAPP_TOKEN'],
  }),
  Object.freeze({
    id: 'anthropic',
    naam: 'Anthropic (Claude)',
    leverancier: 'Anthropic PBC',
    soort: 'verbruik',
    waarvoor: 'De AI die de gesprekken voert en kwalificeert.',
    tarief: null,
    env: ['ANTHROPIC_API_KEY'],
  }),
  Object.freeze({
    id: 'openai',
    naam: 'OpenAI',
    leverancier: 'OpenAI',
    soort: 'verbruik',
    waarvoor: 'Beeldgeneratie, en spraakberichten uitschrijven als dat aanstaat.',
    tarief: null,
    env: ['OPENAI_API_KEY', 'OPENAI'],
  }),
  Object.freeze({
    id: 'kling',
    naam: 'Kling (video)',
    leverancier: 'Kuaishou',
    soort: 'verbruik',
    waarvoor: 'Videogeneratie. Staat uit zonder deze twee sleutels.',
    tarief: null,
    env: ['KLING_ACCESS_KEY'],
  }),
  Object.freeze({
    id: 'stripe',
    naam: 'Stripe',
    leverancier: 'Stripe',
    soort: 'verbruik',
    waarvoor: 'Betalingen en abonnementen.',
    /* Stripe rekent een percentage plus een vast bedrag per transactie, en dat
       verschilt per kaartsoort en land. Geen maandbedrag. */
    tarief: null,
    env: ['STRIPE_SECRET_KEY'],
  }),
  Object.freeze({
    id: 'email',
    naam: 'E-mail (SMTP + Resend)',
    leverancier: 'Namecheap / Resend',
    soort: 'vast',
    waarvoor: 'Notificatiemails vanaf hello@helvaro.pro.',
    tarief: null,
    env: ['SMTP_HOST', 'RESEND_API_KEY'],
  }),
  Object.freeze({
    id: 'domein',
    naam: 'Domeinnaam helvaro.pro',
    leverancier: 'Registrar',
    soort: 'vast',
    waarvoor: 'Het adres zelf.',
    /* Per jaar, en wat jij betaald hebt weet dit bestand niet. */
    tarief: null,
    altijdAan: true,
  }),
]);

const OP_ID = Object.freeze(DIENSTEN.reduce((a, d) => { a[d.id] = d; return a; }, {}));

/* ── Hulpjes ──────────────────────────────────────────────────────────────── */

function gezet(naam) {
  return !!String(process.env[naam] || '').trim();
}

/** Draait deze dienst? Zonder sleutel draait hij niet en kost hij niets. */
function staatAan(dienst) {
  if (dienst.altijdAan) return true;
  const env = dienst.env || [];
  if (!env.length) return false;
  return env.some(gezet);
}

/** Alles omrekenen naar een maandbedrag. Een jaarabonnement is geen maandpost. */
function perMaand(bedrag, interval) {
  const n = Number(bedrag);
  if (!Number.isFinite(n)) return null;
  const i = String(interval || 'maand').toLowerCase();
  if (i === 'jaar' || i === 'year' || i === 'jaarlijks') return n / 12;
  if (i === 'week') return n * 52 / 12;
  if (i === 'dag' || i === 'day') return n * 365 / 12;
  return n;
}

function koersUsdEur() {
  const v = Number(String(process.env.KOSTEN_USD_EUR || '').trim());
  return Number.isFinite(v) && v > 0 ? v : null;
}

/* ── De ingevulde bedragen uit Airtable ───────────────────────────────────── */

let _tabelBestaat = null;
function _resetTabelCache() { _tabelBestaat = null; }

function airtableAan() {
  return !!(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

/**
 * Leest de tabel `costs`. Bestaat hij niet, dan geeft dit een lege lijst terug
 * en werkt de rest gewoon door op lijstprijzen -- een ontbrekende tabel is
 * geen storing, het is een tabel die nog niet gemaakt is.
 */
async function eigenBedragen() {
  if (!airtableAan() || _tabelBestaat === false) return [];
  try {
    const r = await fetch(
      `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${COSTS_TABLE}?pageSize=100`,
      { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
    if (r.status === 404) { _tabelBestaat = false; return []; }
    if (!r.ok) {
      console.warn(`[kosten] tabel ${COSTS_TABLE} lezen mislukt (HTTP ${r.status})`);
      return [];
    }
    _tabelBestaat = true;
    const d = await r.json();
    return ((d && d.records) || []).map((rec) => {
      const f = rec.fields || {};
      return {
        id: rec.id,
        dienst:   String(f[F.dienst] || '').trim().toLowerCase(),
        naam:     String(f[F.naam] || '').trim(),
        bedrag:   Number.isFinite(Number(f[F.bedrag])) ? Number(f[F.bedrag]) : null,
        valuta:   String(f[F.valuta] || 'EUR').trim().toUpperCase(),
        interval: String(f[F.interval] || 'maand').trim().toLowerCase(),
        aantal:   Number(f[F.aantal]) > 0 ? Number(f[F.aantal]) : 1,
        /* Ontbreekt het vinkje, dan telt de regel mee. Een rij aanmaken en
           hem vervolgens niet zien staan omdat je een vakje vergat, is de
           soort stilte die dit bestand juist moet wegnemen. */
        actief:   f[F.actief] === undefined ? true : !!f[F.actief],
        notitie:  String(f[F.notitie] || '').trim(),
      };
    });
  } catch (err) {
    console.warn('[kosten] eigen bedragen lezen mislukt:', err && err.message);
    return [];
  }
}

/* ── De sleutels ──────────────────────────────────────────────────────────── */

/**
 * Welke sleutels gezet zijn. NOOIT de waarde, ook niet afgekort: dit antwoord
 * gaat over het netwerk naar een browser, en een sleutel hoort daar niet in --
 * ook niet voor een half oog vol.
 */
function sleutels() {
  const uit = [];
  for (const d of DIENSTEN) {
    for (const naam of (d.env || [])) {
      uit.push({ dienst: d.id, dienstNaam: d.naam, env: naam, gezet: gezet(naam) });
    }
  }
  /* Sleutels die geen eigen dienst in de lijst hebben maar wel geld of toegang
     vertegenwoordigen. Ze horen in het overzicht omdat hun ontbreken iets
     stukmaakt, niet omdat ze een factuur hebben. */
  for (const [naam, dienst] of Object.entries({
    KLING_SECRET_KEY:      'kling',
    STRIPE_WEBHOOK_SECRET: 'stripe',
    GOOGLE_AI_API_KEY:     'google',
    OPENROUTER_API_KEY:    'openrouter',
    GOOGLE_CLIENT_SECRET:  'google-agenda',
    CLERK_PUBLISHABLE_KEY: 'clerk',
    CRON_SECRET:           'cron',
    ADMIN_KEY:             'helvaro',
    SESSION_SECRET:        'helvaro',
  })) {
    if (uit.some((x) => x.env === naam)) continue;
    uit.push({ dienst, dienstNaam: dienst, env: naam, gezet: gezet(naam) });
  }
  return uit;
}

/* ── Het gemeten AI-verbruik ──────────────────────────────────────────────── */

/**
 * Wat de AI deze instantie gekost heeft, in USD.
 *
 * De tellers zitten in het geheugen van de draaiende instantie (zie
 * api/_ai/usage.js), dus na een koude start beginnen ze opnieuw. Dat staat
 * erbij, want een laag getal dat voor "rustige maand" wordt aangezien is erger
 * dan geen getal.
 */
function aiVerbruik() {
  try {
    const usage = require('./_ai/usage');
    const alles = usage.alles();
    const t = (alles && alles.totaal) || {};
    return {
      beschikbaar: true,
      sinds: new Date(t.since || Date.now()).toISOString(),
      aanroepen: t.requests || 0,
      kostenUsd: Math.round((t.costUsd || 0) * 10000) / 10000,
      perModel: t.byModel || {},
      perTenant: alles.perTenant || {},
      let_op: 'Tellers uit het geheugen van deze instantie. Een koude start begint opnieuw; dit is geen maandtotaal.',
    };
  } catch (err) {
    return { beschikbaar: false, reden: String((err && err.message) || 'onbekend') };
  }
}

/* ── Alles bij elkaar ─────────────────────────────────────────────────────── */

/**
 * Het volledige kostenbeeld.
 *
 * @param {object} [o]
 * @param {number} [o.gesprekken] aantal leadgesprekken deze periode, uit de
 *        eigen records. Wordt gebruikt voor de MODELRAMING van de variabele
 *        kosten -- apart gehouden van het gemeten verbruik hierboven.
 * @param {number} [o.mrrEur] maandomzet uit lopende plannen.
 */
async function overzicht({ gesprekken = null, mrrEur = null } = {}) {
  const eigen = await eigenBedragen();
  const opDienst = {};
  for (const r of eigen) if (r.dienst) opDienst[r.dienst] = r;

  const regels = [];
  for (const d of DIENSTEN) {
    const mijn = opDienst[d.id];
    const aan = staatAan(d);

    let bedrag = null, valuta = 'EUR', interval = 'maand', aantal = 1, bron = 'onbekend', notitie = '';

    if (mijn && mijn.actief && mijn.bedrag !== null) {
      bedrag = mijn.bedrag; valuta = mijn.valuta; interval = mijn.interval;
      aantal = mijn.aantal; bron = 'ingevuld'; notitie = mijn.notitie;
    } else if (d.tarief) {
      bedrag = d.tarief.bedrag; valuta = d.tarief.valuta;
      interval = d.tarief.interval; bron = d.tarief.bron;
    }

    const maand = bedrag === null ? null : perMaand(bedrag, interval) * (aantal || 1);

    regels.push({
      id: d.id,
      naam: (mijn && mijn.naam) || d.naam,
      leverancier: d.leverancier,
      soort: d.soort,
      waarvoor: d.waarvoor,
      aan,
      bedrag, valuta, interval, aantal,
      perStuk: (d.tarief && d.tarief.perStuk) || null,
      perMaand: maand === null ? null : Math.round(maand * 100) / 100,
      bron,
      notitie,
    });
  }

  /* Alleen wat AAN staat telt mee. Een dienst zonder sleutel draait niet, en
     zijn lijstprijs bij je maandlasten optellen zou je kosten hoger laten
     lijken dan ze zijn -- dezelfde fout als hem op nul zetten, andere kant op. */
  const meetellend = regels.filter((r) => r.aan && r.soort === 'vast');

  const vastPerMunt = {};
  for (const r of meetellend) {
    if (r.perMaand === null) continue;
    vastPerMunt[r.valuta] = Math.round(((vastPerMunt[r.valuta] || 0) + r.perMaand) * 100) / 100;
  }

  const onbekend = meetellend.filter((r) => r.perMaand === null).map((r) => r.naam);

  const koers = koersUsdEur();
  let vastEur = null;
  if (koers) {
    let som = 0;
    for (const [munt, bedrag] of Object.entries(vastPerMunt)) {
      som += munt === 'USD' ? bedrag * koers : bedrag;
    }
    vastEur = Math.round(som * 100) / 100;
  }

  /* De modelraming van de variabele kosten: aantal gesprekken maal wat een
     gesprek ons kost volgens api/_plans.js. Dat is een MODEL, geen factuur --
     vandaar een eigen veld en een eigen woord. */
  const _plans = require('./_plans');
  const raming = gesprekken === null ? null : {
    gesprekken,
    perGesprekEur: _plans.KOSTPRIJS_PER_GESPREK_EUR,
    totaalEur: Math.round(gesprekken * _plans.KOSTPRIJS_PER_GESPREK_EUR * 100) / 100,
    let_op: 'Modelraming uit api/_plans.js, geen gemeten uitgave.',
  };

  /* Nettowinst alleen als beide kanten in euro bekend zijn. Anders geen getal:
     een winstcijfer dat een halve kostenkant mist, is erger dan geen. */
  let netto = null;
  if (mrrEur !== null && vastEur !== null && !onbekend.length) {
    const variabel = raming ? raming.totaalEur : 0;
    netto = Math.round((mrrEur - vastEur - variabel) * 100) / 100;
  }

  return {
    diensten: regels,
    vastPerMaand: { perMunt: vastPerMunt, inEur: vastEur, koersUsdEur: koers },
    nogInvullen: onbekend,
    tabelBestaat: _tabelBestaat !== false,
    tabel: COSTS_TABLE,
    sleutels: sleutels(),
    ai: aiVerbruik(),
    raming,
    mrrEur,
    nettoPerMaandEur: netto,
    /* Zonder koers geen eurototaal, en dat hoort de pagina te weten in plaats
       van zelf iets te vermenigvuldigen. */
    waarschuwing: koers ? null
      : 'Zonder KOSTEN_USD_EUR worden dollars en euro\'s niet opgeteld. De totalen staan per munt.',
  };
}

module.exports = {
  DIENSTEN, OP_ID, COSTS_TABLE, F,
  staatAan, perMaand, sleutels, aiVerbruik, eigenBedragen, overzicht,
  koersUsdEur, _resetTabelCache,
};
