'use strict';
/*
 * Welke WhatsApp-templates bestaan er, in welke taal, en is deze klant klaar.
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * Buiten het 24u-venster mag WhatsApp alleen een door Meta GOEDGEKEURDE
 * template versturen. Een template is per taal: `helvaro_lead_alert` in nl_BE
 * en dezelfde in fr_BE zijn twee aparte inzendingen die apart goedgekeurd
 * moeten worden.
 *
 * Tot nu toe stond die kennis in één handgeschreven regel in api/_lang.js:
 *
 *     const TEMPLATE_APPROVED_LANGUAGES = new Set(['nl_BE', 'fr_BE', 'en_US']);
 *
 * Die regel was niet waar. Op de echte WABA stond in augustus 2026 GEEN enkele
 * fr_BE-template, en in en_US alleen Meta's eigen `hello_world`. Een Franstalige
 * klant kreeg dus geen terugval naar het Nederlands -- de code dacht dat Frans
 * goedgekeurd was, stuurde een fr_BE-template die niet bestond, en Meta
 * weigerde hem. Er kwam geen fout in beeld; er kwam alleen nooit een bericht
 * aan. Precies de stilste soort fout.
 *
 * Een handgeschreven lijst die de werkelijkheid moet bijhouden loopt altijd
 * achter. Daarom haalt dit bestand de waarheid bij Meta zelf op.
 *
 * ── Fail-soft, want dit zit in het verzendpad ────────────────────────────────
 * Als Meta niet bereikbaar is (of er is geen management-token geconfigureerd,
 * wat in productie vandaag het geval is) valt alles terug op SNAPSHOT hieronder:
 * de laatst bekende, met de hand geverifieerde toestand. Nooit een throw, nooit
 * een lege lijst -- want een lege lijst zou betekenen "niets is goedgekeurd" en
 * dat zou alle WhatsApp voor alle bestaande klanten stilleggen.
 *
 * ── Wat hier NIET in hoort ───────────────────────────────────────────────────
 * De teksten zelf. Die staan in scripts/create-wa-templates.js, dat ze ook
 * indient. Dit bestand weet alleen WELKE er moeten zijn en of ze er zijn.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* ── De templates die Helvaro echt verstuurt ─────────────────────────────────
 *
 * `env`       de env-var waarmee je de naam overschrijft. Bestaat al, en de
 *             verzendcode leest hem al; dit bestand verandert daar niets aan.
 * `standaard` de naam op de WABA vandaag, gebruikt als de env-var leeg is.
 * `params`    de volgorde waarin de verzendcode de variabelen meegeeft. Staat
 *             hier zodat één plek beschrijft wat {{2}} betekent -- die volgorde
 *             is al een keer omgedraaid geraakt en leverde "je afspraak bij
 *             dinsdag 12 augustus is bevestigd voor KinePraktijk Gent" op.
 * `blokkeert` zonder deze template kan de klant WhatsApp niet gebruiken. Alleen
 *             `intro` blokkeert: zonder begroeting krijgt een nieuwe lead
 *             helemaal niets. De rest degradeert (de klant krijgt zijn melding
 *             per e-mail, een afspraak wordt gemaakt zonder bevestiging).
 */
const VEREIST = Object.freeze({
  intro: Object.freeze({
    env: 'INTRO_TEMPLATE_NAME',
    standaard: 'helvaro_aanvraag_ontvangen',
    params: ['naam', 'ai', 'bedrijf'],
    blokkeert: true,
    wat: 'eerste bericht aan een nieuwe lead',
  }),
  notify: Object.freeze({
    env: 'NOTIFY_TEMPLATE_NAME',
    standaard: 'helvaro_lead_alert',
    params: ['naam', 'telefoon', 'projectcode'],
    blokkeert: false,
    wat: 'melding aan de klant zelf',
  }),
  booking: Object.freeze({
    env: 'BOOKING_TEMPLATE_NAME',
    standaard: 'helvaro_afspraak_bevestiging',
    params: ['naam', 'bedrijf', 'wanneer'],
    blokkeert: false,
    wat: 'afspraakbevestiging',
  }),
  reminder: Object.freeze({
    env: 'REMINDER_TEMPLATE_NAME',
    standaard: 'helvaro_afspraak_herinnering',
    params: ['naam', 'bedrijf', 'wanneer'],
    blokkeert: false,
    wat: 'herinnering 24 uur vooraf',
  }),
  followup: Object.freeze({
    env: 'FOLLOWUP_TEMPLATE_NAME',
    standaard: 'followup_24h',
    params: ['naam'],
    blokkeert: false,
    wat: 'opvolging buiten het 24u-venster',
  }),
  campagne: Object.freeze({
    env: 'CAMPAIGN_TEMPLATE_NAME',
    standaard: 'helvaro_nieuw_aanbod',
    params: ['naam', 'bedrijf', 'aanbod'],
    blokkeert: false,
    wat: 'campagnes',
  }),
});

const SLEUTELS = Object.freeze(Object.keys(VEREIST));

/* De naam die vandaag geldt voor deze template. Env wint, anders de standaard. */
function naamVoor(sleutel) {
  const def = VEREIST[sleutel];
  if (!def) return '';
  return String(process.env[def.env] || '').trim() || def.standaard;
}

/* ── Meta's talen ────────────────────────────────────────────────────────────
 * Uit developers.facebook.com/documentation/business-messaging/whatsapp/
 * templates/supported-languages. Staat hier omdat "die taal kan Meta niet"
 * een ander antwoord aan de klant is dan "die taal moeten we nog indienen":
 * het eerste is een dood spoor, het tweede is werk van een dag.
 */
const META_TALEN = new Set([
  'af', 'sq', 'ar', 'ar_EG', 'ar_AE', 'ar_LB', 'ar_MA', 'ar_QA', 'az', 'be_BY',
  'bn', 'bn_IN', 'bg', 'ca', 'zh_CN', 'zh_HK', 'zh_TW', 'hr', 'cs', 'da',
  'prs_AF', 'nl', 'nl_BE', 'en', 'en_GB', 'en_US', 'en_AE', 'en_AU', 'en_CA',
  'en_GH', 'en_IE', 'en_IN', 'en_JM', 'en_MY', 'en_NZ', 'en_QA', 'en_SG',
  'en_UG', 'en_ZA', 'et', 'fil', 'fi', 'fr', 'fr_BE', 'fr_CA', 'fr_CH',
  'fr_CI', 'fr_MA', 'ka', 'de', 'de_AT', 'de_CH', 'el', 'gu', 'ha', 'he', 'hi',
  'hu', 'id', 'ga', 'it', 'ja', 'kn', 'kk', 'rw_RW', 'ko', 'ky_KG', 'lo', 'lv',
  'lt', 'mk', 'ms', 'ml', 'mr', 'nb', 'ps_AF', 'fa', 'pl', 'pt_BR', 'pt_PT',
  'pa', 'ro', 'ru', 'sr', 'si_LK', 'sk', 'sl', 'es', 'es_AR', 'es_CL', 'es_CO',
  'es_CR', 'es_DO', 'es_EC', 'es_HN', 'es_MX', 'es_PA', 'es_PE', 'es_ES',
  'es_UY', 'sw', 'sv', 'ta', 'te', 'th', 'tr', 'uk', 'ur', 'uz', 'vi', 'zu',
]);

function metaKentTaal(code) {
  return META_TALEN.has(canoniek(code));
}

/* "fr-be" / "fr_BE" / "FR" -> "fr_BE". Meta schrijft de regio met een
   liggend streepje en in hoofdletters; een streepje of kleine letters komt
   terug als "unsupported language". Dezelfde vorm als canonicalTemplateLang in
   api/_lang.js -- bewust hier herhaald zodat dit bestand niets uit _lang.js
   hoeft te halen en _lang.js dus wél uit dit bestand kan halen. */
function canoniek(raw) {
  const s = String(raw || '').trim().replace('-', '_');
  if (!s) return '';
  const [taal, regio] = s.split('_');
  return regio ? `${taal.toLowerCase()}_${regio.toUpperCase()}` : taal.toLowerCase();
}

/* ── Land -> voorgestelde taal ───────────────────────────────────────────────
 * Afgeleid van de `locale` die api/_regio.js al per land bijhoudt ('nl-BE' ->
 * 'nl_BE'), zodat er geen tweede landenlijst ontstaat die uit de pas gaat lopen.
 *
 * Dit is nadrukkelijk een SUGGESTIE. Een Brusselse makelaar kan Franstalig
 * zijn en een Zwitserse klant kan Duits schrijven; wat de klant zelf kiest is
 * de waarheid. Zie taalVanKlant() hieronder.
 */
function taalVoorLand(landcode) {
  let regio = null;
  try {
    regio = require('./_regio.js').land(landcode);
  } catch (_) {
    // _regio.js is er altijd; deze catch bestaat zodat een kapotte require
    // hier geen signup omvergooit.
    regio = null;
  }
  if (!regio || !regio.locale) return 'nl_BE';

  // De locale van _regio.js is een BCP-47 voor DATUM en GELD ('fr-FR', 'de-DE',
  // 'nl-NL'). Meta's talenlijst is een andere lijst: die kent wél 'fr_BE' en
  // 'fr_CA' maar GEEN 'fr_FR', wél 'de_AT' en 'de_CH' maar geen 'de_DE'.
  // Klakkeloos overnemen gaf dus voor zowat elk land buiten België
  // "die taal ondersteunt WhatsApp niet" -- terwijl 'fr' en 'de' er gewoon in
  // staan. Vandaar: probeer de regiovariant, val anders terug op de kale taal.
  const vol = canoniek(regio.locale);
  if (META_TALEN.has(vol)) return vol;
  const kaal = vol.split('_')[0];
  if (META_TALEN.has(kaal)) return kaal;
  return 'nl_BE';
}

/* ── De laatst geverifieerde toestand ────────────────────────────────────────
 * Gebruikt wanneer Meta niet bereikbaar is. Handmatig nagekeken op 2026-09-01
 * tegen graph.facebook.com/v23.0/<WABA>/message_templates.
 *
 * Zet hier NIETS in wat je niet zelf in WhatsApp Manager hebt zien staan. Dit
 * bestand bestaat juist omdat de vorige lijst dingen beweerde die er niet waren.
 */
const SNAPSHOT = Object.freeze({
  'helvaro_aanvraag_ontvangen::nl_BE': 'APPROVED',
  'helvaro_lead_alert::nl_BE': 'APPROVED',
  'helvaro_afspraak_bevestiging::nl_BE': 'APPROVED',
  'helvaro_afspraak_herinnering::nl_BE': 'APPROVED',
  'followup_24h::nl_BE': 'APPROVED',
  'helvaro_nieuwe_lead::nl_BE': 'APPROVED',
});

/* Meta's statussen, en wat ze voor ons betekenen. PAUSED en DISABLED zetten we
   bewust NIET op "klaar": een gepauzeerde template stuurt niets, ook al is hij
   ooit goedgekeurd. */
const KLAAR = 'APPROVED';
const ONDERWEG = new Set(['PENDING', 'IN_APPEAL', 'PENDING_DELETION']);
const GEWEIGERD = new Set(['REJECTED', 'DISABLED', 'PAUSED']);

function duiding(status) {
  const s = String(status || '').toUpperCase();
  if (!s) return 'ontbreekt';
  if (s === KLAAR) return 'klaar';
  if (ONDERWEG.has(s)) return 'onderweg';
  if (GEWEIGERD.has(s)) return 'geweigerd';
  return 'onbekend';
}

/* ── De index ophalen bij Meta ───────────────────────────────────────────────
 * In-memory cache met TTL. Serverless: elke lambda houdt zijn eigen kopie, wat
 * prima is -- de index verandert hooguit een paar keer per week en een lambda
 * leeft minuten.
 */
let cache = null;
let cacheTot = 0;
const TTL_MS = 5 * 60 * 1000;

function uitSnapshot() {
  /* Lege categorieen, geen verzonnen categorieen. Zonder management-token
     weten we ze niet, en een gok over wat iets kost is erger dan een leeg
     veld -- dan ga je erop rekenen. */
  return { bron: 'snapshot', opgehaald: null, templates: Object.assign({}, SNAPSHOT), categorieen: {} };
}

async function haalIndex(opties) {
  const nu = Date.now();
  const forceer = !!(opties && opties.forceer);
  if (!forceer && cache && nu < cacheTot) return cache;

  const waba = String(process.env.WABA_ID || '').trim();
  const token = String(
    process.env.WHATSAPP_MANAGEMENT_TOKEN || process.env.WHATSAPP_TOKEN || ''
  ).trim();

  if (!waba || !token) {
    // Geen verwijt: in productie staat er vandaag geen management-token. De
    // snapshot is dan het beste wat we hebben en dat is bruikbaar.
    const uit = uitSnapshot();
    uit.reden = 'geen WABA_ID of token geconfigureerd';
    cache = uit;
    cacheTot = nu + TTL_MS;
    return uit;
  }

  const url =
    `https://graph.facebook.com/v23.0/${encodeURIComponent(waba)}/message_templates` +
    '?fields=name,language,status,category&limit=200';

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.data)) {
      const err = (data && data.error) || {};
      console.warn(
        `[wa-templates] Meta gaf HTTP ${res.status} (${err.message || 'onbekend'}) — ` +
          'val terug op de snapshot. Een management-token met scope ' +
          'whatsapp_business_management lost dit op.'
      );
      const uit = uitSnapshot();
      uit.reden = `Meta HTTP ${res.status}`;
      cache = uit;
      cacheTot = nu + TTL_MS;
      return uit;
    }

    const templates = {};
    /* ── Categorie erbij, want die kost geld ──────────────────────────────
       Meta rekent PER AFGELEVERD sjabloon, en het tarief hangt aan de
       categorie: in "Rest of Western Europe" (waar Belgie onder valt) is
       MARKETING ~EUR 0,11 en UTILITY ~EUR 0,05. Meer dan een verdubbeling
       voor exact hetzelfde bericht.

       Dat is niet een detail aan de rand: de sjablonen zijn 75 tot 100% van
       wat een lead ons kost (het AI-gesprek is ~EUR 0,024 en het 24u-venster
       is gratis). Het eerste-contactsjabloon gaat naar ELKE lead, dus daar
       staat of valt de marge.

       Deze index vroeg alleen naam, taal en status op. De categorie stond
       dus nergens, en daarmee was de grootste kostenpost van het product
       onzichtbaar in het product zelf.

       Aparte map, geen ander soort waarde in `templates`: die is elders een
       statusstring en dat blijft zo. */
    const categorieen = {};
    for (const t of data.data) {
      if (!t || !t.name || !t.language) continue;
      const sleutel = `${t.name}::${canoniek(t.language)}`;
      templates[sleutel] = String(t.status || '').toUpperCase();
      if (t.category) categorieen[sleutel] = String(t.category).toUpperCase();
    }
    const uit = { bron: 'meta', opgehaald: new Date(nu).toISOString(), templates, categorieen };
    cache = uit;
    cacheTot = nu + TTL_MS;
    return uit;
  } catch (err) {
    console.warn(`[wa-templates] Meta niet bereikbaar (${err.message}) — val terug op de snapshot.`);
    const uit = uitSnapshot();
    uit.reden = err.message;
    cache = uit;
    cacheTot = nu + TTL_MS;
    return uit;
  }
}

/* Alleen voor tests: de cache leegmaken zonder een echte call te doen. */
function _leegCache() {
  cache = null;
  cacheTot = 0;
}

/* ── Is deze taal klaar? ─────────────────────────────────────────────────────
 * Geeft altijd hetzelfde vormpje terug, ook voor een taal die Meta niet kent,
 * zodat de UI nooit hoeft te raden.
 */
/* Welke template-taal hoort bij deze gevraagde taal, gegeven wat er op de WABA
   staat? Bestaande klanten hebben Language 'nl' staan terwijl de goedgekeurde
   templates op 'nl_BE' staan; zonder deze stap zou zo'n klant plots als
   "templates ontbreken" uit de bus komen en dat is precies de regressie die
   deze hele oefening niet mag opleveren.

   Zelfde voorrang als resolveTemplateLanguage() in api/_lang.js:
     1. exact wat gevraagd is        ('nl_BE' -> 'nl_BE')
     2. de kale taal                 ('nl_BE' -> 'nl')
     3. een regiovariant van de kale ('nl'    -> 'nl_BE') */
function kiesTaal(gevraagd, templates) {
  const exact = canoniek(gevraagd);
  if (!exact) return '';

  const heeft = (code) => Object.keys(templates || {}).some((k) => k.endsWith(`::${code}`));
  if (heeft(exact)) return exact;

  const kaal = exact.split('_')[0];
  if (kaal && kaal !== exact && heeft(kaal)) return kaal;

  if (kaal) {
    for (const sleutel of Object.keys(templates || {})) {
      const code = sleutel.split('::')[1] || '';
      if (code.split('_')[0] === kaal) return code;
    }
  }
  return exact;
}

function bekijk(taal, index) {
  const gevraagd = canoniek(taal);
  const templates = (index && index.templates) || {};
  const code = kiesTaal(gevraagd, templates) || gevraagd;

  if (!code) {
    return {
      taal: '', gevraagd, ondersteund: false, klaar: false, reden: 'geen taal ingesteld',
      regels: [], ontbreekt: [], onderweg: [], geweigerd: [],
      bron: (index && index.bron) || 'snapshot',
    };
  }

  if (!META_TALEN.has(code)) {
    return {
      taal: code, gevraagd, ondersteund: false, klaar: false,
      reden: `WhatsApp ondersteunt "${code}" niet als template-taal`,
      regels: [], ontbreekt: [], onderweg: [], geweigerd: [],
      bron: (index && index.bron) || 'snapshot',
    };
  }

  const regels = SLEUTELS.map((sleutel) => {
    const naam = naamVoor(sleutel);
    const status = templates[`${naam}::${code}`] || '';
    return {
      sleutel,
      naam,
      taal: code,
      wat: VEREIST[sleutel].wat,
      blokkeert: VEREIST[sleutel].blokkeert,
      status: status || null,
      toestand: duiding(status),
    };
  });

  const ontbreekt = regels.filter((r) => r.toestand === 'ontbreekt');
  const onderweg = regels.filter((r) => r.toestand === 'onderweg');
  const geweigerd = regels.filter((r) => r.toestand === 'geweigerd');

  // "Klaar" = elke BLOKKERENDE template staat op approved. De rest mag
  // ontbreken: dan valt die functie weg, niet WhatsApp zelf.
  const blokkerend = regels.filter((r) => r.blokkeert);
  const klaar = blokkerend.length > 0 && blokkerend.every((r) => r.toestand === 'klaar');

  let reden = '';
  if (!klaar) {
    const stuk = blokkerend.filter((r) => r.toestand !== 'klaar');
    reden = stuk
      .map((r) => `${r.naam} (${code}) — ${r.toestand}`)
      .join(', ');
  }

  return {
    taal: code, gevraagd, ondersteund: true, klaar, reden,
    regels, ontbreekt, onderweg, geweigerd,
    bron: (index && index.bron) || 'snapshot',
  };
}

/* Het gewone geval: haal de index op en beoordeel één taal. */
async function klaarVoor(taal, opties) {
  const index = await haalIndex(opties);
  return bekijk(taal, index);
}

/* ── De taal van een klant ───────────────────────────────────────────────────
 * De klant kiest zelf; het land is alleen een suggestie bij het invullen. Deze
 * functie legt die voorrang vast op één plek, zodat niemand hem per ongeluk
 * omdraait.
 *
 * Een bestaande klant heeft nog geen Country en soms ook geen Language. Die
 * valt terug op nl_BE, precies zoals vandaag -- er verandert niets voor hem.
 */
function taalVanKlant(clientFields) {
  const f = clientFields || {};
  const gekozen = canoniek(f.Language || f.language || '');
  if (gekozen) return gekozen;
  const land = f.Country || f.country || '';
  if (land) return taalVoorLand(land);
  return 'nl_BE';
}

/* De talen die er vandaag echt toe doen, met hoeveel klanten erachter zitten.
   `klanten` is een lijst van Client Config `fields`-objecten. */
function taalOverzicht(klanten) {
  const per = new Map();
  for (const f of klanten || []) {
    const taal = taalVanKlant(f);
    const land = String((f && (f.Country || f.country)) || '').toUpperCase() || '—';
    const sleutel = `${land}::${taal}`;
    if (!per.has(sleutel)) per.set(sleutel, { land, taal, klanten: 0, namen: [] });
    const rij = per.get(sleutel);
    rij.klanten++;
    const naam = (f && (f['Client Name'] || f.Name)) || '';
    if (naam && rij.namen.length < 20) rij.namen.push(String(naam));
  }
  return [...per.values()].sort((a, b) => b.klanten - a.klanten || a.land.localeCompare(b.land));
}

/* Het interne overzicht: land -> taal -> aantal klanten -> klaar/ontbreekt.
   Eén index-call voor alle rijen; templates zijn niet per klant maar per taal,
   dus twee klanten met dezelfde taal delen dezelfde inzending. */
async function overzicht(klanten, opties) {
  const index = await haalIndex(opties);
  const rijen = taalOverzicht(klanten).map((rij) => {
    const staat = bekijk(rij.taal, index);
    return {
      ...rij,
      klaar: staat.klaar,
      ondersteund: staat.ondersteund,
      reden: staat.reden,
      ontbreekt: staat.ontbreekt.map((r) => r.naam),
      onderweg: staat.onderweg.map((r) => r.naam),
      geweigerd: staat.geweigerd.map((r) => r.naam),
      aantalKlaar: staat.regels.filter((r) => r.toestand === 'klaar').length,
      aantalTotaal: staat.regels.length,
      kosten: kostenVoor(rij.taal, index),
    };
  });
  return { bron: index.bron, opgehaald: index.opgehaald, rijen };
}

/* ── Wat een sjabloon kost ──────────────────────────────────────────────────
 * Meta rekent PER AFGELEVERD sjabloonbericht (zo werkt het sinds juli 2025) en
 * het tarief hangt aan de CATEGORIE. Deze bedragen zijn de lijstprijzen voor
 * "Rest of Western Europe", waar Belgie onder valt, zoals vastgelegd in
 * CREDIT-SYSTEM-DESIGN.md met cijfers van juli 2026.
 *
 * Waarom dit hier staat en niet in een spreadsheet: het verschil tussen de twee
 * categorieen is een factor twee op de grootste kostenpost van het product. Het
 * AI-gesprek kost ~EUR 0,024 en het 24u-venster is gratis; de sjablonen zijn 75
 * tot 100% van wat een lead ons kost. Een sjabloon dat in de verkeerde bak zit,
 * kost dus meer dan al het rekenwerk bij elkaar.
 *
 * Let op: het tarief verschilt per LAND. Voor een klant buiten West-Europa
 * kloppen deze bedragen niet, en dan is dit een indicatie en geen factuur.
 */
const TARIEF_EUR = Object.freeze({
  MARKETING:      0.11,
  UTILITY:        0.05,
  AUTHENTICATION: 0.05,
  SERVICE:        0,      // binnen het 24u-venster: gratis
});

/* Wat de sjablonen van EEN taal per lead kosten, met de categorie erbij.
 *
 * Geeft `categorie: null` wanneer we het niet weten -- zonder management-token
 * levert Meta de categorie niet en dan staat er geen gok. Een onbekend tarief
 * telt als 0 in het totaal EN wordt apart geteld in `onbekend`, zodat een
 * totaal van EUR 0,00 met vijf onbekende sjablonen er niet uitziet als gratis.
 */
function kostenVoor(taal, index) {
  const idx = index || cache || uitSnapshot();
  const cats = idx.categorieen || {};
  const regels = [];
  let totaal = 0, onbekend = 0, marketing = 0;

  for (const sleutel of SLEUTELS) {
    const naam = naamVoor(sleutel);
    if (!naam) continue;
    const k = `${naam}::${canoniek(taal)}`;
    const cat = cats[k] || null;
    const tarief = cat && Object.prototype.hasOwnProperty.call(TARIEF_EUR, cat) ? TARIEF_EUR[cat] : null;
    if (tarief === null) onbekend++; else totaal += tarief;
    if (cat === 'MARKETING') marketing++;
    regels.push({ sleutel, naam, categorie: cat, tariefEur: tarief });
  }

  /* Wat je zou besparen als elk MARKETING-sjabloon UTILITY was. Geen belofte:
     of dat mag hangt af van Meta's regels (UTILITY is een opvolging op iets dat
     de gebruiker zelf startte). Wel het getal dat het gesprek waard maakt. */
  const besparingEur = Math.round(marketing * (TARIEF_EUR.MARKETING - TARIEF_EUR.UTILITY) * 100) / 100;

  return {
    taal: canoniek(taal),
    regels,
    totaalEur: Math.round(totaal * 100) / 100,
    onbekend,
    marketingAantal: marketing,
    besparingAlsUtilityEur: besparingEur,
    bron: idx.bron,
  };
}

/* De talen waarvoor ALLE blokkerende templates goedgekeurd zijn. api/_lang.js
   gebruikt dit in plaats van zijn eigen handgeschreven lijst. Synchroon en
   zonder netwerk, want het zit in het verzendpad: gebaseerd op de snapshot,
   of op de laatste Meta-index als die al een keer opgehaald is. */
function goedgekeurdeTalen() {
  const index = cache || uitSnapshot();
  const talen = new Set();
  for (const sleutel of Object.keys(index.templates)) {
    const taal = sleutel.split('::')[1];
    if (taal) talen.add(taal);
  }
  const uit = new Set();
  for (const taal of talen) {
    if (bekijk(taal, index).klaar) uit.add(taal);
  }
  return uit;
}

module.exports = {
  VEREIST,
  SLEUTELS,
  META_TALEN,
  naamVoor,
  canoniek,
  kiesTaal,
  metaKentTaal,
  taalVoorLand,
  taalVanKlant,
  duiding,
  haalIndex,
  bekijk,
  klaarVoor,
  taalOverzicht,
  overzicht,
  kostenVoor,
  TARIEF_EUR,
  goedgekeurdeTalen,
  _leegCache,
};
