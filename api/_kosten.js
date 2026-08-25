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
 * ── Alles loopt per maand ────────────────────────────────────────────────────
 * De eigenaar betaalt elk abonnement en elke API maandelijks, niet per jaar
 * (bevestigd augustus 2026). Daarom staat 'maand' overal als standaard en is
 * de maandprijs van Airtable Team de juiste -- niet het jaartarief. Verandert
 * dat ooit, dan is Interval in de tabel `costs` de plek: die deelt een
 * jaarbedrag door twaalf en dan hoeft er in de code niets te veranderen.
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
  gestart:  'Started On',
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
       De eigenaar betaalt per maand (bevestigd augustus 2026), dus 24 is hier
       het juiste getal en niet het lagere jaartarief. Het stond hier al op de
       maandprijs, om een andere reden: bij een schatting van je eigen kosten
       is te hoog de kant om je op te vergissen. */
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
    waarvoor: 'Videogeneratie. Staat uit zonder KLING_API_KEY (of het oude paar KLING_ACCESS_KEY + KLING_SECRET_KEY).',
    tarief: null,
    /* Twee geldige manieren, dus twee namen: staat er één van, dan draait de
       dienst en hoort hij als "aan" in het overzicht. Zou hier alleen de
       nieuwe naam staan, dan meldde de Kosten-pagina "uit" voor een account
       dat het legacy paar gebruikt -- en dan klopt het overzicht niet. */
    env: ['KLING_API_KEY', 'KLING_ACCESS_KEY'],
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
    id: 'smartlead',
    naam: 'Smartlead',
    leverancier: 'Smartlead.ai',
    soort: 'vast',
    waarvoor: 'Koude e-mailcampagnes om zelf klanten te werven. Staat BUITEN de app.',
    /* Geen sleutel om op te detecteren, en dat is hier geen omissie: Helvaro
       praat niet met Smartlead. Het is een abonnement dat de eigenaar betaalt
       en dat dus in dit overzicht hoort, maar het draait niet mee in de code.
       Vandaar altijdAan -- anders zou hij als "staat uit" tussen de diensten
       staan die wel een sleutel missen, en dat is een ander verhaal. */
    tarief: null,
    altijdAan: true,
    extern: true,
  }),
  Object.freeze({
    id: 'domein',
    naam: 'Domeinnaam helvaro.pro',
    leverancier: 'Registrar',
    soort: 'vast',
    waarvoor: 'Het adres zelf.',
    /* Wat een registrar rekent weet dit bestand niet -- dat verschilt per
       registrar en per extensie. De rij in `costs` staat op maand, zoals al het
       andere; is jouw domein een jaarpost, dan zet je Interval op jaar en wordt
       het bedrag door twaalf gedeeld. */
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

/**
 * Alles omrekenen naar een maandbedrag. Een jaarabonnement is geen maandpost.
 *
 * 'bericht' is geen tijdsinterval maar een STUKSPRIJS: dat is hoe Meta sinds
 * juli 2025 afrekent -- per verstuurd sjabloonbericht, met een tarief per
 * categorie en per land. Een stuksprijs kan alleen een maandbedrag worden als
 * je weet hoeveel er verstuurd zijn; zonder dat aantal geeft dit null terug in
 * plaats van te doen alsof het er één was.
 */
function perMaand(bedrag, interval, aantalPerMaand) {
  const n = Number(bedrag);
  if (!Number.isFinite(n)) return null;
  const i = String(interval || 'maand').toLowerCase();
  if (i === 'bericht' || i === 'stuk' || i === 'message') {
    /* Number(null) is 0 en 0 is een eindig getal, dus een simpele isFinite-
       controle liet een ONBEKEND aantal als NUL door: tarief x 0 = 0, en dan
       stond er netjes "EUR 0,00 per maand" bij een dienst waarvan we het
       volume niet kennen. Precies de leugen die dit bestand moet voorkomen. */
    if (aantalPerMaand === null || aantalPerMaand === undefined || aantalPerMaand === '') return null;
    const stuks = Number(aantalPerMaand);
    return Number.isFinite(stuks) ? n * stuks : null;
  }
  if (i === 'jaar' || i === 'year' || i === 'jaarlijks') return n / 12;
  if (i === 'week') return n * 52 / 12;
  if (i === 'dag' || i === 'day') return n * 365 / 12;
  return n;
}

/**
 * Hoeveel keer is deze dienst gefactureerd sinds de startdatum?
 *
 * Niet "hoeveel maanden zitten ertussen", maar hoeveel BETALINGEN er geweest
 * zijn -- dat is een ander getal en het is het getal dat je zoekt. Een
 * abonnement dat op 15 maart begon is op 15 maart voor het eerst afgeschreven,
 * dus op 20 maart heb je één keer betaald en niet nul keer. En op 14 april nog
 * steeds één keer: de tweede afschrijving is er dan nog niet geweest.
 *
 * @returns {number|null} aantal betalingen, of null bij een onbruikbare datum
 */
function betalingenSinds(start, interval, nu = new Date()) {
  if (!start) return null;
  const s = start instanceof Date ? start : new Date(String(start));
  if (isNaN(s.getTime())) return null;
  if (s.getTime() > nu.getTime()) return 0;      // begint pas

  const i = String(interval || 'maand').toLowerCase();
  /* Een stuksprijs heeft geen ritme: hoe vaak Meta factureert hangt af van hoe
     veel je stuurt, niet van de kalender. Daar valt niets terug te rekenen. */
  if (i === 'bericht' || i === 'stuk' || i === 'message') return null;

  if (i === 'jaar' || i === 'year' || i === 'jaarlijks') {
    let jaren = nu.getFullYear() - s.getFullYear();
    const verjaardagGehad = (nu.getMonth() > s.getMonth())
      || (nu.getMonth() === s.getMonth() && nu.getDate() >= s.getDate());
    if (!verjaardagGehad) jaren -= 1;
    return jaren + 1;
  }
  if (i === 'week') return Math.floor((nu - s) / (7 * 86400000)) + 1;
  if (i === 'dag' || i === 'day') return Math.floor((nu - s) / 86400000) + 1;

  // maand
  let maanden = (nu.getFullYear() - s.getFullYear()) * 12 + (nu.getMonth() - s.getMonth());
  /* De 31e van een maand met 30 dagen bestaat niet; de afschrijving valt dan op
     de laatste dag. Zonder deze regel telt zo'n abonnement in februari een
     betaling te weinig. */
  const laatsteDagNu = new Date(nu.getFullYear(), nu.getMonth() + 1, 0).getDate();
  const dagDezeMaand = Math.min(s.getDate(), laatsteDagNu);
  if (nu.getDate() < dagDezeMaand) maanden -= 1;
  return maanden + 1;
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
        gestart:  f[F.gestart] ? String(f[F.gestart]) : null,
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
async function overzicht({ gesprekken = null, mrrEur = null, volumes = {} } = {}) {
  const eigen = await eigenBedragen();
  const opDienst = {};
  for (const r of eigen) if (r.dienst) opDienst[r.dienst] = r;

  const regels = [];
  for (const d of DIENSTEN) {
    const mijn = opDienst[d.id];
    const zelfIngevuld = !!(mijn && mijn.actief && mijn.bedrag !== null);
    /* Een ingevuld bedrag telt als bewijs dat de dienst draait, ook als de
       sleuteldetectie zegt van niet. Jij hebt de factuur; die weegt zwaarder
       dan een omgevingsvariabele die hier toevallig niet zichtbaar is. Zonder
       deze regel verdween een ingevulde Meta-factuur uit het totaal zodra
       WHATSAPP_TOKEN even niet gelezen kon worden. */
    const aan = staatAan(d) || zelfIngevuld;

    let bedrag = null, valuta = 'EUR', interval = 'maand', aantal = 1, bron = 'onbekend', notitie = '';

    if (zelfIngevuld) {
      bedrag = mijn.bedrag; valuta = mijn.valuta; interval = mijn.interval;
      aantal = mijn.aantal; bron = 'ingevuld'; notitie = mijn.notitie;
    } else if (d.tarief) {
      bedrag = d.tarief.bedrag; valuta = d.tarief.valuta;
      interval = d.tarief.interval; bron = d.tarief.bron;
    }

    /* Voor een stuksprijs is het gemeten aantal van DEZE dienst nodig. Staat
       dat er niet, dan blijft het bedrag leeg -- zie perMaand(). */
    const gemeten = Object.prototype.hasOwnProperty.call(volumes, d.id) ? volumes[d.id] : null;
    const gerekend = bedrag === null ? null : perMaand(bedrag, interval, gemeten);
    const maand = gerekend === null ? null : gerekend * (aantal || 1);

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
      /* Wat er van deze dienst geteld is, en waaruit. Staat naast het bedrag
         zodat je kan nagaan waar het vandaan komt in plaats van het te moeten
         geloven. */
      gemeten: gemeten === null ? null : gemeten,
      bron,
      notitie,
      /* Sinds wanneer je dit betaalt, en wat het bij elkaar gekost heeft. Alleen
         als er een startdatum EN een bedrag is -- een van de twee alleen levert
         geen som op, en een halve som is hier erger dan geen. */
      gestart: (mijn && mijn.gestart) || null,
      betalingen: null,
      uitgegeven: null,
    });
  }

  /* ── Wat er tot nu toe uitgegeven is ──────────────────────────────────────
     Het aantal betalingen maal het bedrag. Bewust NIET maal het maandbedrag:
     een jaarabonnement dat drie keer betaald is, kostte drie keer het
     jaarbedrag -- niet 36 keer een twaalfde. Dat verschil is precies het soort
     rekenfout dat in een totaal onzichtbaar blijft. */
  const nu = new Date();
  for (const r of regels) {
    if (!r.gestart || r.bedrag === null) continue;
    const n = betalingenSinds(r.gestart, r.interval, nu);
    if (n === null) continue;
    r.betalingen = n;
    r.uitgegeven = Math.round(n * r.bedrag * (r.aantal || 1) * 100) / 100;
  }

  const uitgegevenPerMunt = {};
  for (const r of regels) {
    if (r.uitgegeven === null || !r.aan) continue;
    uitgegevenPerMunt[r.valuta] =
      Math.round(((uitgegevenPerMunt[r.valuta] || 0) + r.uitgegeven) * 100) / 100;
  }
  /* Welke diensten wél een bedrag hebben maar geen startdatum: die ontbreken in
     het totaal, en dat hoort te zien te zijn. */
  const zonderStartdatum = regels
    .filter((r) => r.aan && r.bedrag !== null && !r.gestart)
    .map((r) => r.naam);

  /* Alleen wat AAN staat telt mee. Een dienst zonder sleutel draait niet, en
     zijn lijstprijs bij je maandlasten optellen zou je kosten hoger laten
     lijken dan ze zijn -- dezelfde fout als hem op nul zetten, andere kant op. */
  const meetellend = regels.filter((r) => r.aan && r.soort === 'vast');

  const vastPerMunt = {};
  for (const r of meetellend) {
    if (r.perMaand === null) continue;
    vastPerMunt[r.valuta] = Math.round(((vastPerMunt[r.valuta] || 0) + r.perMaand) * 100) / 100;
  }

  /* Verbruiksdiensten tellen apart op. Ze horen NIET bij de vaste lasten -- een
     maand zonder leads kost je hier niets -- maar ze horen wel in de nettowinst
     terecht te komen zodra je er een bedrag van weet. Dat gebeurde niet: een
     ingevulde Meta-factuur stond wel op het scherm en nergens in een totaal. */
  const verbruikend = regels.filter((r) => r.aan && r.soort === 'verbruik');
  const verbruikPerMunt = {};
  for (const r of verbruikend) {
    if (r.perMaand === null) continue;
    verbruikPerMunt[r.valuta] = Math.round(((verbruikPerMunt[r.valuta] || 0) + r.perMaand) * 100) / 100;
  }

  const onbekend = meetellend.filter((r) => r.perMaand === null).map((r) => r.naam);

  const koers = koersUsdEur();
  const naarEur = (perMunt) => {
    if (!koers) return null;
    let som = 0;
    for (const [munt, bedrag] of Object.entries(perMunt)) {
      som += munt === 'USD' ? bedrag * koers : bedrag;
    }
    return Math.round(som * 100) / 100;
  };
  const vastEur = naarEur(vastPerMunt);
  const verbruikEur = naarEur(verbruikPerMunt);

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
    /* Wat je van je verbruik WEET gaat eraf; wat je er alleen van kan RAMEN
       ook, maar alleen als er geen gemeten bedrag is -- anders trek je
       dezelfde kosten twee keer af. */
    const gemetenVerbruik = verbruikEur !== null ? verbruikEur : 0;
    const variabel = gemetenVerbruik > 0 ? gemetenVerbruik : (raming ? raming.totaalEur : 0);
    netto = Math.round((mrrEur - vastEur - variabel) * 100) / 100;
  }

  return {
    diensten: regels,
    vastPerMaand: { perMunt: vastPerMunt, inEur: vastEur, koersUsdEur: koers },
    verbruikPerMaand: { perMunt: verbruikPerMunt, inEur: verbruikEur },
    uitgegeven: {
      perMunt: uitgegevenPerMunt,
      inEur: naarEur(uitgegevenPerMunt),
      zonderStartdatum,
    },
    volumes,
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
  staatAan, perMaand, betalingenSinds, sleutels, aiVerbruik, eigenBedragen,
  overzicht, koersUsdEur, _resetTabelCache,
};
