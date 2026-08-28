'use strict';
/*
 * Credit / usage accounting for Helvaro's Vercel app (Airtable-backed).
 * Underscore-prefixed filename so Vercel does NOT treat it as a route (same
 * convention as api/_mailer.js, api/_pgapi.js, api/_gcal.js) — the route
 * count stays at 11.
 *
 * Design is fully specified in CREDIT-SYSTEM-DESIGN.md at the worktree root.
 * This file implements it exactly: do not re-derive the weighting or the
 * plan numbers here, they are already decided.
 *
 * ── THE ONE RULE THAT MATTERS MOST ─────────────────────────────────────────
 * Helvaro's promise is "reactie binnen 30 sec, 24/7". A lead conversation
 * (api/whatsapp.js) must NEVER be blocked by this file, no matter how far
 * over budget a client is. checkCredits() below still computes an honest
 * `allowed:false` for an over-limit client on ANY feature (including
 * whatsapp_conversation) — the actual protection is structural: whatsapp.js
 * intentionally never calls checkCredits() at all, only recordUsage() (see
 * its own call site comment). NEVER_BLOCK_FEATURES here is a second,
 * defense-in-depth layer in case a future call site adds a checkCredits()
 * call for a lead-facing feature by mistake.
 *
 * ── FAIL-OPEN vs FAIL-CLOSED (same asymmetry as vps-backend's credits.js
 * and the earlier Airtable proof-of-concept's api/lib/credits.js — read
 * those files' headers for the full rationale if touching this) ───────────
 *   1. A DISCRETIONARY feature (image gen, marketing text, reply
 *      suggestions, founder tools) at/over its limit -> FAIL CLOSED (block).
 *      These are optional; the client can wait for the next period or ask
 *      Sindi for more credits. This is the entire point of the feature.
 *   2. Anything else going wrong — Airtable down, the credit fields not
 *      yet added to the base, a client with no allowance configured,
 *      malformed JSON in one of the envelope fields — -> FAIL OPEN (allow
 *      the call, log once, move on). An accounting hiccup must never
 *      degrade the product itself.
 *
 * ── AIRTABLE HAS NO ATOMIC INCREMENT (read this before touching recordUsage) ──
 * Every recordUsage() call is a plain read-then-write: GET the client's
 * current "Credits Used", add the new credits in JS, PATCH the sum back.
 * Two simultaneous recordUsage() calls for the SAME client (e.g. two leads
 * messaging in the same few hundred ms) can both read the same starting
 * value and both write "old + their own delta", so the second write clobbers
 * the first — the counter ends up under-counted by whichever amount raced.
 * This is a real, acknowledged limitation, not an oversight:
 *   - At Helvaro's current traffic (a handful of concurrent conversations
 *     across the whole platform, not per client) the odds of two calls for
 *     the SAME client landing inside the same read-write window are low.
 *   - It only ever loses counted usage, never invents it — the failure mode
 *     is "client gets slightly more free usage than they should", the same
 *     direction as every other fail-soft decision in this codebase.
 *   - It resolves itself if/when Helvaro moves this billing onto the
 *     VPS/Postgres backend (see vps-backend/server/db/credits.js's own
 *     header — that version wraps the increment in one Postgres statement,
 *     `x = x + $1`, which Postgres's row locking serializes for real).
 * If Helvaro's volume ever grows enough for this to matter, the fix is that
 * migration, not a cleverer Airtable dance.
 *
 * ── STORAGE: NEW Client Config fields, not a new table ──────────────────
 * Owner must add these fields to the Klanten/Client Config table
 * (tblPidTrwGRzRt4LZ) by NAME (this file addresses them by name, never by
 * field ID, because the IDs don't exist yet — same reasoning admin.js's
 * client-creation comment gives for why it uses IDs for fields THAT ALREADY
 * EXIST: field IDs are immune to renames, but you can't know an ID before
 * the field is created). See CREDITS-VERCEL-SUMMARY.md for the exact list.
 * Until the owner adds them, every function in this file degrades to a
 * silent no-op / fail-open — see schemaLooksUnconfigured() below.
 */

const CLIENTS_TABLE = 'tblPidTrwGRzRt4LZ';
const _plan = require('./_plan'); // planstatus: betaalt deze klant nog?

// ── Field names (NOT IDs — see file header) ────────────────────────────────
const FIELD = {
  ALLOWANCE:  'Credit Allowance',          // Number. 0/blank = system inert for this client (fail-open).
  USED:       'Credits Used',              // Number. Running counter, current period.
  PERIOD:     'Credit Period',             // Long text (JSON): {start, alerted80, alerted100, alertedRunaway}
  BY_FEATURE: 'Credit Usage By Feature',   // Long text (JSON): {feature: creditsThisPeriod}
  CEILING:    'Credit Runaway Ceiling',    // Number, optional. Absolute abuse ceiling. Default = allowance * 3.
  /* Bijgekochte credits. Number, mag ontbreken (dan valt addCredits terug op de
     oude weg -- zie daar). Dit veld bestaat omdat bijkopen ANDERS werkt dan een
     abonnement: het abonnement geeft elke maand opnieuw `Credit Allowance`, en
     wat je bijkoopt hoort daar bovenop te komen en NIET mee te resetten. */
  PURCHASED:  'Credit Purchased',
};

// ── Credit weights. See CREDIT-SYSTEM-DESIGN.md §2 for the exact numbers
// and the reasoning behind each. Do not change these without updating that
// doc — the plan allowances (2.000 / 5.000 / 20.000) are calibrated against
// them. ──────────────────────────────────────────────────────────────────
const FEATURES = {
  WHATSAPP_CONVERSATION:   'whatsapp_conversation',   // 20  — billed ONCE per lead, at the first AI turn (see whatsapp.js call site)
  IMAGE_GENERATION:        'image_generation',        // 50
  MARKETING_CONTENT:       'marketing_content',       // 5
  REPLY_SUGGESTION:        'reply_suggestion',        // 2
  // Not in the original 4-row design-doc table (that table only covers
  // client-facing features). Both mapped onto the closest cost analog and
  // documented here rather than silently invented:
  WEEKLY_LEARNING:         'weekly_learning',         // 5  — one Haiku text-gen call per client/week, same cost profile as marketing_content
  FOUNDER_AI_CHAT:         'founder_ai_chat',         // 5  — Sindi's own tools, see FOUNDER note below
  FOUNDER_AI_ADVICE:       'founder_ai_advice',       // 5
  FOUNDER_PERSONALIZED_DM: 'founder_personalized_dm', // 5
  FOUNDER_CONTENT_POST:    'founder_content_post',    // 5  — Herald's social-engine text generation
  FOUNDER_GENERATE_IMAGE:  'founder_generate_image',  // 50 — Herald's social-engine image generation
  // Faro. One charge per USER TURN, not per model call: a turn that runs three
  // tools is still one question the user asked, and charging per internal call
  // would make Faro cost more precisely when it is being most useful. Weight 3
  // sits between reply_suggestion (2, a single short completion) and
  // marketing_content (5) — a Faro turn is a handful of completions plus tool
  // round-trips, and it must stay cheap enough that exploring is not punished.
  // Image generation inside a turn is billed SEPARATELY at image_generation's
  // 50, because that is where the real money goes.
  FARO_CHAT:               'faro_chat',               // 3
  /* Een pand importeren uit een link: één pagina ophalen plus één goedkope
     extractie. Zelfde orde als een Faro-beurt, en met opzet laag: dit is het
     eerste wat een nieuwe klant doet, en die mag niet afgerekend worden op het
     invoeren van zijn eigen aanbod. */
  PROPERTY_IMPORT:         'property_import',         // 3
  // Video. Nog niet aangesloten (api/_faro/actions.js gooit not_wired), en
  // juist daarom staat de prijs er NU al: video is verreweg het duurste dat dit
  // product kan doen, en een tarief bedenken nadat de kraan openstaat is te
  // laat. Zie creditsForVideo() — dit is geen vast getal maar per seconde.
  VIDEO_GENERATION:        'video_generation',
};

const WEIGHTS = {
  [FEATURES.WHATSAPP_CONVERSATION]:   20,
  [FEATURES.IMAGE_GENERATION]:        50,
  [FEATURES.MARKETING_CONTENT]:       5,
  [FEATURES.REPLY_SUGGESTION]:        2,
  [FEATURES.WEEKLY_LEARNING]:         5,
  [FEATURES.FOUNDER_AI_CHAT]:         5,
  [FEATURES.FOUNDER_AI_ADVICE]:       5,
  [FEATURES.FOUNDER_PERSONALIZED_DM]: 5,
  [FEATURES.FOUNDER_CONTENT_POST]:    5,
  [FEATURES.FOUNDER_GENERATE_IMAGE]:  50,
  [FEATURES.FARO_CHAT]:               3,
  [FEATURES.PROPERTY_IMPORT]:         3,
  // Nominale waarde voor een standaardvideo (8s, 720p). De echte afschrijving
  // loopt via creditsForVideo(); dit getal bestaat zodat WEIGHTS volledig is en
  // een aanroeper die het vergeet niet op 0 uitkomt.
  [FEATURES.VIDEO_GENERATION]:        240,
};

/* ── Wat een Faro-beurt kost ──────────────────────────────────────────────────
 * Faro rekende 3 credits per beurt, plat, ongeacht wat die beurt deed. Dat was
 * een verdedigbare keuze toen het "een handvol completions" was, maar de vorm
 * van een beurt is inmiddels anders:
 *
 *   - 17 gereedschapsdefinities gaan in ELK verzoek mee
 *   - de systeemprompt is ~7.600 tekens
 *   - de geschiedenis mag tot 40 beurten teruggaan
 *   - er mogen 8 gereedschapsrondes in één beurt, en elke ronde stuurt de
 *     hele context opnieuw mee
 *   - het standaardmodel is Sonnet, "Precies" is Opus — niet de Haiku waarmee
 *     het WhatsApp-gesprek is doorgerekend in CREDIT-SYSTEM-DESIGN.md §1
 *
 * Eén beurt kan dus acht modelaanroepen zijn met een groeiende context, op een
 * duurder model, voor dezelfde 3 credits. En het wordt erger naarmate Faro
 * NUTTIGER is: meer gereedschappen inzetten kost meer en levert hetzelfde op.
 *
 * De orchestrator telt de echte tokens al (usage.inputTokens/outputTokens) en
 * gaf ze alleen als metadata door. Nu bepalen ze de afschrijving.
 *
 * ── Prijzen ─────────────────────────────────────────────────────────────────
 * Alle drie de modellen staan er nu in, met de lijstprijs van Anthropic als
 * bron. Blijft een model onbekend, dan valt de afschrijving terug op het platte
 * tarief EN wordt er per model één keer luid gewaarschuwd — nooit stilzwijgend
 * te weinig rekenen.
 */
const USD_TO_EUR = 0.92;

// Marge op kostprijs. Beeld staat op ~8x, video op ~1,6x; chat zit ertussenin:
// hoog genoeg om de vaste lasten te dragen, laag genoeg dat doorvragen niet
// bestraft wordt. Eén plek, zodat de eigenaar er één getal voor hoeft te
// veranderen.
const CHAT_MARGIN = 3;

const MODEL_PRICES = Object.freeze({
  // $ per 1M tokens, lijstprijs van Anthropic.
  'claude-haiku-4-5-20251001': { inPerM: 1.00, outPerM: 5.00 },
  /* Sonnet 5 staat hier op de NORMALE prijs, niet op de introprijs van
     $2/$10 die tot en met 31 augustus 2026 geldt. Met de introprijs erin zou
     de afschrijving op 1 september in één nacht 50% te laag worden, precies op
     het moment dat niemand eraan denkt. Nu is ze tot die datum iets aan de
     hoge kant en daarna klopt ze — de kant om op te vergissen als het je eigen
     marge is. */
  'claude-sonnet-5': { inPerM: 3.00, outPerM: 15.00 },
  'claude-opus-5':   { inPerM: 5.00, outPerM: 25.00 },
});

const _priceWarned = new Set();

/**
 * Credits voor één Faro-beurt, op basis van wat hij echt verbruikt heeft.
 * Geeft { credits, costEur, priced } terug. priced=false betekent: prijs
 * onbekend, dit is het oude platte tarief en waarschijnlijk te laag.
 */
function creditsForChatTurn({ inputTokens = 0, outputTokens = 0, model = '' } = {}) {
  const flat = WEIGHTS[FEATURES.FARO_CHAT];
  const price = MODEL_PRICES[model];
  if (!price || price.inPerM == null || price.outPerM == null) {
    if (model && !_priceWarned.has(model)) {
      _priceWarned.add(model);
      console.warn(`[Credits] geen prijs bekend voor model "${model}" — er wordt ${flat} credits per beurt gerekend, `
                 + 'wat vrijwel zeker te weinig is. Zet de prijs in MODEL_PRICES in api/_credits.js.');
    }
    return { credits: flat, costEur: null, priced: false };
  }
  const usd = (Number(inputTokens) || 0) / 1e6 * price.inPerM
            + (Number(outputTokens) || 0) / 1e6 * price.outPerM;
  const costEur = usd * USD_TO_EUR;
  // EUR_PER_CREDIT is de ankerwaarde uit het ontwerpdocument: 1 credit ~ EUR0,015
  // aan kostprijs. Delen door dat anker zet euro's om in credits.
  const raw = Math.ceil((costEur / 0.015) * CHAT_MARGIN);
  // Nooit minder dan het platte tarief: een piepklein vraagje mag goedkoop
  // zijn, maar niet gratis — er zit ook infrastructuur achter.
  return { credits: Math.max(flat, raw), costEur, priced: true };
}

/* ── Wat een video kost ───────────────────────────────────────────────────────
 * api/_media-models.js kent de echte prijs: $0,30 per seconde op 1280x720 en
 * $0,50 per seconde op de bredere formaten. Tegen de basis uit
 * CREDIT-SYSTEM-DESIGN.md (1 credit ~ EUR0,015 kostprijs) levert dat op:
 *
 *    8s 720p            $2,40  = EUR2,21  = 147 credits op kostprijs
 *    8s breed/portret   $4,00  = EUR3,68  = 245 credits op kostprijs
 *
 * Ter vergelijking: een BEELD kost 50 credits en een heel leadgesprek 20.
 * Eén video van acht seconden is dus zeven leadgesprekken, en op het bredere
 * formaat evenveel als de complete proefperiode van 250 credits.
 *
 * Daarom een andere opslag dan bij beeld. Beeld staat bewust op ~8x kostprijs
 * ("de enige echt onbegrensde post"); dezelfde factor op video zou één filmpje
 * op ~1.200 credits brengen — meer dan een halve maand Growth. Dit staat op
 * ongeveer 1,6x kostprijs: genoeg marge om niet te verliezen, laag genoeg dat
 * het bruikbaar blijft.
 *
 * PRODUCTBESLISSING die hier niet gemaakt kan worden: bij 30 credits/seconde
 * kost één standaardvideo 240 van de 250 proefcredits. Een proefklant kan er
 * dus precies één maken. Dat kan de bedoeling zijn (laten proeven) of niet
 * (proefperiode meteen op). Zie CREDIT-SYSTEM-DESIGN.md §6.
 */
const VIDEO_CREDITS_PER_SECOND = { standard: 30, wide: 50 };
const VIDEO_WIDE_SIZES = ['1792x1024', '1024x1792'];

function creditsForVideo({ seconds = 8, size = '1280x720' } = {}) {
  const secs = Math.max(1, Math.min(60, Math.round(Number(seconds) || 8)));
  const rate = VIDEO_WIDE_SIZES.includes(String(size))
    ? VIDEO_CREDITS_PER_SECOND.wide
    : VIDEO_CREDITS_PER_SECOND.standard;
  return secs * rate;
}

// Rough real-cost-per-credit by feature, EUR, derived from
// CREDIT-SYSTEM-DESIGN.md §1-2 (lead conv ~€0.30/20cr, image ~€0.095 avg/50cr,
// marketing text ~€0.01/5cr, reply suggestion ~€0.003/2cr). Used ONLY for the
// admin cost-visibility estimate (getAllUsageSummaries) — never for billing
// or blocking logic. Founder features reuse the ratio of their closest
// client-facing analog (text-gen vs image-gen).
const COST_PER_CREDIT_EUR = {
  [FEATURES.WHATSAPP_CONVERSATION]:   0.30 / 20,
  [FEATURES.IMAGE_GENERATION]:        0.095 / 50,
  [FEATURES.MARKETING_CONTENT]:       0.01 / 5,
  [FEATURES.REPLY_SUGGESTION]:        0.003 / 2,
  [FEATURES.WEEKLY_LEARNING]:         0.01 / 5,
  [FEATURES.FOUNDER_AI_CHAT]:         0.01 / 5,
  [FEATURES.FOUNDER_AI_ADVICE]:       0.01 / 5,
  [FEATURES.FOUNDER_PERSONALIZED_DM]: 0.01 / 5,
  [FEATURES.FOUNDER_CONTENT_POST]:    0.01 / 5,
  [FEATURES.FOUNDER_GENERATE_IMAGE]:  0.095 / 50,
  [FEATURES.FARO_CHAT]:               0.006 / 3,
};

/* ── Credits bijkopen ─────────────────────────────────────────────────────────
 * Zoals bij een API-console: je kiest een BEDRAG, en je ziet meteen wat je
 * ervoor krijgt. Niet een vast pakket, want de ene makelaar heeft twee panden
 * en de andere veertig.
 *
 * -- Waarom dit hier staat en niet in de UI --------------------------------
 * De prijs mag nooit in het dashboard staan: dan rekent de browser uit wat
 * iemand krijgt, en dat is precies het getal dat een klant kan aanpassen.
 * Alles wordt hier berekend en de UI toont alleen de uitkomst.
 *
 * -- Het tarief ---------------------------------------------------------------
 * Afgeleid van het Starter-plan in api/_plans.js: EUR 249,99 voor 3.000
 * credits, dus EUR 0,0833 per credit. Bijkopen kost daarmee exact evenveel als
 * een abonnement, en dat is niet toevallig het enige tarief dat klopt:
 *
 *   te LAAG  -> een klant neemt het kleinste plan en koopt eeuwig bij; je
 *               abonnement wordt een instapfee in plaats van je omzet.
 *   te HOOG  -> je straft iemand die meer afneemt dan hij dacht, precies op
 *               het moment dat het goed met hem gaat.
 *
 * Beide fouten zijn hier al gemaakt. Eerst stond het op EUR 0,50 (zes keer te
 * duur, afgeleid uit een losse opmerking over EUR 1.000 per maand), daarna op
 * EUR 0,025 (drie keer te goedkoop, overgenomen uit het overage-tarief in
 * CREDIT-SYSTEM-DESIGN.md §4 -- dat tarief lag zelf al onder de planprijs).
 * Daarom staat het getal nu NERGENS meer los: het komt uit de plantabel, en
 * verandert de prijspagina, dan verandert dit mee.
 *
 * -- Wat de staffel met je marge doet ----------------------------------------
 * Kostprijs is ~EUR 0,30 per leadgesprek van 20 credits, dus EUR 0,015 per
 * credit. Bij dit tarief houd je over:
 *   geen bonus  EUR 0,0833 per credit -> 82% marge
 *   15% bonus   EUR 0,0725            -> 79%
 * Vrijwel gelijk aan de marge op een abonnement, en dat hoort ook: het is
 * dezelfde dienst. Wil je de staffel niet, zet de percentages hieronder op 0.
 *
 * Alles blijft instelbaar via de omgeving, zodat je je marge kunt bijstellen
 * zonder een deploy.
 */
const _plans = require('./_plans');

const TOPUP_RATE_EUR = Number(process.env.CREDIT_TOPUP_RATE_EUR)
                    || Math.round(_plans.perCredit(_plans.STANDAARD_PLAN) * 10000) / 10000;
const TOPUP_MIN_EUR  = Number(process.env.CREDIT_TOPUP_MIN_EUR  || 25);
const TOPUP_MAX_EUR  = Number(process.env.CREDIT_TOPUP_MAX_EUR  || 5000);

/* Geen volumebonus op bijkopen. Dat is een productbeslissing, geen omissie.

   Er stond een staffel van 5/10/15%. Doorgerekend bleek die precies het
   verkeerde te belonen: voor EUR 249,99 aan bijgekochte credits kreeg je er
   3.151, terwijl het Starter-abonnement voor hetzelfde bedrag 3.000 geeft.
   Bijkopen was dus BETER dan een abonnement, en dan is je abonnement een
   instapfee geworden.

   Volumekorting hoort in de PLANNEN te zitten, en dat doet ze ook: Starter
   kost EUR 0,083 per credit, Growth EUR 0,050 en Scale EUR 0,040. Wie meer
   nodig heeft, hoort door te groeien naar een groter plan -- niet eeuwig bij
   te kopen op het kleinste. Daarom stuurt topupOfferte() hieronder ook een
   suggestie mee zodra een groter plan voordeliger is.

   De staffel zelf blijft bestaan zodat je hem kunt aanzetten zonder een
   codewijziging; de percentages staan alleen op nul. */
const TOPUP_STAFFEL = Object.freeze([
  { vanafEur: 0, bonusPct: 0 },
]);

/* De bedragen die het scherm als tegel aanbiedt. Ze staan HIER en niet in de
   frontend, samen met de rest van de bedragen: een browser die zelf weet welke
   bedragen bestaan is een browser waarin iemand er een verzint. Wat elke tegel
   oplevert wordt ook hier berekend -- zie topupPresets(). */
const TOPUP_PRESETS = Object.freeze([50, 100, 250, 500]);

/**
 * De tegels met hun uitkomst, klaar om te tonen.
 *
 * Bedragen buiten de grenzen vallen weg in plaats van als ongeldige tegel te
 * verschijnen: een knop die je niet mag indrukken is erger dan een knop die er
 * niet is. Verlaagt iemand CREDIT_TOPUP_MAX_EUR, dan verdwijnen de te grote
 * tegels dus vanzelf.
 *
 * @returns {Array<{bedragEur, credits, gesprekken}>}
 */
function topupPresets() {
  return TOPUP_PRESETS
    .map((bedrag) => topupOfferte(bedrag))
    .filter((o) => o.geldig)
    .map((o) => ({ bedragEur: o.bedragEur, credits: o.credits, gesprekken: o.gesprekken }));
}

/**
 * Wat je krijgt voor een bedrag.
 *
 * Geeft ALTIJD een geldig antwoord terug, ook bij onzin -- de aanroeper is een
 * publieke route en mag niet met een fout omvallen omdat iemand "veel" typt.
 *
 * @param {number} bedragEur
 * @returns {{ geldig, bedragEur, basisCredits, bonusPct, bonusCredits, credits, perCredit, gesprekken, reden }}
 */
function topupOfferte(bedragEur) {
  const bedrag = Math.round((Number(bedragEur) || 0) * 100) / 100;
  const leeg = {
    geldig: false, bedragEur: bedrag, basisCredits: 0, bonusPct: 0, bonusCredits: 0,
    credits: 0, perCredit: TOPUP_RATE_EUR, gesprekken: 0, reden: '',
  };
  if (!isFinite(bedrag) || bedrag <= 0)  return { ...leeg, reden: 'geen_bedrag' };
  if (bedrag < TOPUP_MIN_EUR)            return { ...leeg, reden: 'te_laag' };
  if (bedrag > TOPUP_MAX_EUR)            return { ...leeg, reden: 'te_hoog' };
  if (!(TOPUP_RATE_EUR > 0))             return { ...leeg, reden: 'geen_tarief' };

  const basis = Math.floor(bedrag / TOPUP_RATE_EUR);
  const staffel = TOPUP_STAFFEL.find((t) => bedrag >= t.vanafEur) || { bonusPct: 0 };
  const bonus = Math.floor(basis * (staffel.bonusPct / 100));
  const totaal = basis + bonus;

  return {
    geldig: true,
    bedragEur: bedrag,
    basisCredits: basis,
    bonusPct: staffel.bonusPct,
    bonusCredits: bonus,
    credits: totaal,
    /* Wat je effectief betaalt per credit, inclusief bonus. Dit is het getal
       waarmee een klant twee bedragen vergelijkt. */
    perCredit: Math.round((bedrag / totaal) * 1000) / 1000,
    /* Vertaald naar iets dat een makelaar herkent. Een leadgesprek is de
       eenheid waarin hij denkt, niet een credit. */
    gesprekken: Math.floor(totaal / WEIGHTS[FEATURES.WHATSAPP_CONVERSATION]),
    /* Krijgt hij voor ditzelfde geld meer uit een groter plan? Dan zeggen we
       dat. Iemand die maandelijks voor EUR 500 bijkoopt op Starter betaalt zich
       blauw terwijl Growth voor EUR 499 het dubbele geeft -- dat verzwijgen is
       op korte termijn meer omzet en op lange termijn een opzegging. */
    beterPlan: beterPlanVoor(bedrag, totaal),
    reden: '',
  };
}

/* Welk plan geeft meer credits voor (ongeveer) dit bedrag dan bijkopen doet?
   Geeft null als bijkopen gewoon de beste keuze is -- bij kleine bedragen is
   dat zo, en dan hoort er geen verkooppraatje te staan. */
function beterPlanVoor(bedragEur, credits) {
  try {
    const kandidaten = _plans.PLANNEN
      .filter((p) => p.prijsEur <= bedragEur * 1.05 && p.credits > credits)
      .sort((a, b) => b.credits - a.credits);
    if (!kandidaten.length) return null;
    const p = kandidaten[0];
    return { id: p.id, naam: p.naam, prijsEur: p.prijsEur, credits: p.credits, gesprekken: _plans.gesprekken(p.credits) };
  } catch (e) {
    return null;
  }
}

// Features that must NEVER be blocked by checkCredits(), regardless of
// balance. Defense-in-depth — see file header. whatsapp.js never actually
// calls checkCredits() for this feature; this is the backstop if it ever did.
const NEVER_BLOCK_FEATURES = new Set([FEATURES.WHATSAPP_CONVERSATION]);

// Founder-internal pseudo-client. See ai-advice/ai-chat/personalized-dm/
// generate-image/content-post call sites in api/admin.js: these are
// ADMIN_KEY-gated tools Sindi uses herself (business coaching, cold-outreach
// drafting, Herald's autonomous social-media engine) — there is no paying
// client to attribute the spend to. Decision (mirrors vps-backend/server/db/
// credits.js's identical call): bill them to a shared '_internal' pseudo
// project code. Since no Client Config record with Project Code=_internal
// will exist unless Sindi explicitly creates one, every one of these gates
// fails OPEN by default — zero behaviour change to Herald's live posting
// engine or Sindi's own tools today. If she ever wants to cap her own
// internal AI spend, she creates a Client Config row with Project
// Code=_internal and a Credit Allowance, exactly like any real client.
const INTERNAL_PROJECT_CODE = '_internal';

// Rolling period length. 30 days chosen over "calendar month" to avoid
// month-length edge cases (28-31 days) — simpler and deterministic. Not
// specified either way by CREDIT-SYSTEM-DESIGN.md, so documented here as an
// explicit implementation decision.
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// Default runaway ceiling multiplier when Credit Runaway Ceiling is
// blank/0 for a client. See CREDIT-SYSTEM-DESIGN.md §4 "Hard ceiling".
const DEFAULT_RUNAWAY_MULTIPLIER = 3;

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Single-shot fetch, no retries — same rationale as leads.js's atFetch
// (compounding 429 retries across many callers is what caused the original
// Airtable rate-limit spiral). Credit calls are low-frequency relative to
// getLead()/getCachedClient() hot paths.
// Zie de uitleg bij atFetch in api/leads.js. Hier extra van belang: de
// creditcheck zit VOOR elke AI-call, dus een hangende Airtable blokkeert
// anders het hele WhatsApp-antwoord.
const AT_TIMEOUT_MS = 10_000;
async function atFetch(url, opts) {
  return fetch(url, { ...opts, signal: (opts && opts.signal) || AbortSignal.timeout(AT_TIMEOUT_MS) });
}

function envConfigured() {
  return !!(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

// Logged at most once per cold start (module-scoped Set) so an
// unconfigured/inert credit system doesn't spam production logs on every
// WhatsApp message — same "log once, not every call" idea as the reference
// implementations' _warnedThisPeriod / _alertedThisPeriod sets.
const _loggedOnce = new Set();
function logOnce(key, ...args) {
  if (_loggedOnce.has(key)) return;
  _loggedOnce.add(key);
  console.warn(...args);
}

async function getClientRecord(projectCode) {
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  const formula = encodeURIComponent(`{Project Code}="${escapeFormula(projectCode)}"`);
  const url     = `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`;
  const r = await atFetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!r.ok) throw new Error(`getClientRecord(${projectCode}): HTTP ${r.status}`);
  const d = await r.json();
  return (d.records || [])[0] || null;
}

function parseJsonField(raw, fallback) {
  if (!raw) return fallback;
  try {
    const p = JSON.parse(raw);
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : fallback;
  } catch {
    return fallback;
  }
}

// True when the owner has not (yet) added ANY of the credit fields to the
// Client Config schema — Airtable simply omits absent-schema fields from
// record.fields entirely, so "none of the 3 core keys are present" is the
// only observable signal for "field doesn't exist" (vs. "exists but blank
// for this client", which reads identically for a single field but is
// already handled correctly by the allowance<=0 check below either way).
function schemaLooksUnconfigured(fields) {
  return !(FIELD.ALLOWANCE in fields) && !(FIELD.USED in fields) && !(FIELD.PERIOD in fields);
}

// Reads the client's period state and returns EFFECTIVE (rollover-aware)
// numbers without writing anything — checkCredits() must stay read-only so a
// stale period near its boundary never wrongly blocks a call that a
// subsequent recordUsage() would have rolled over anyway.
//
// `rawPeriod` (added for the trial feature, see TRIAL-DESIGN.md §7 / the
// once-only-email marker in api/cron-followup.js's runTrialLifecycle()) is
// the FULL parsed Period JSON object, untouched and NEVER reset on
// rollover — unlike start/used/byFeature/alerted*, which are credit-cycle
// state. This lets a second, unrelated subsystem (the trial cron) store its
// own namespaced key (`trial: {...}`) inside the SAME Credit Period field
// without this file's own writers (recordUsage/maybeAlertThresholds/
// addCredits/resetPeriod below) silently dropping it: every write site now
// spreads `rawPeriod` first, then overrides only the 4 credit-specific keys
// it actually owns. Symmetric contract: the trial cron does the same in
// reverse when it writes its own `trial` key. Neither side needs to know
// the other's schema, both need to know not to reconstruct the field from
// scratch.
function effectivePeriodState(fields) {
  const allowance = Number(fields[FIELD.ALLOWANCE]) || 0;
  const periodRaw = fields[FIELD.PERIOD];
  const period = parseJsonField(periodRaw, null);
  const rawPeriod = (period && typeof period === 'object') ? period : {};
  const now = Date.now();
  const startMs = period && period.start ? Date.parse(period.start) : NaN;
  const stale = !period || !isFinite(startMs) || (now - startMs >= PERIOD_MS);

  const used = stale ? 0 : (Number(fields[FIELD.USED]) || 0);
  const byFeature = stale ? {} : parseJsonField(fields[FIELD.BY_FEATURE], {});
  const alerted = stale
    ? { alerted80: false, alerted100: false, alertedRunaway: false }
    : {
        alerted80:      !!(period && period.alerted80),
        alerted100:     !!(period && period.alerted100),
        alertedRunaway: !!(period && period.alertedRunaway),
      };
  const start = stale ? new Date(now).toISOString() : period.start;

  const ceilingRaw = Number(fields[FIELD.CEILING]) || 0;
  const ceiling = ceilingRaw > 0 ? ceilingRaw : allowance * DEFAULT_RUNAWAY_MULTIPLIER;

  /* Bijgekocht telt NIET mee in `stale`. Dat is het hele punt van het veld: een
     abonnementsperiode loopt af en `used` gaat naar nul, maar wat iemand met
     eigen geld heeft bijgekocht hoort te blijven staan tot hij het opmaakt. */
  const purchased = Math.max(0, Number(fields[FIELD.PURCHASED]) || 0);

  return { allowance, purchased, used, byFeature, start, stale, ceiling, rawPeriod, ...alerted };
}

/*
 * Wat er nog over is.
 *
 * ── Waarom hier een derde getal bij kwam ────────────────────────────────────
 * Bijkopen werkte door de TELLER te verlagen: `used = max(0, used - gekocht)`.
 * Zolang je meer verbruikt had dan je bijkocht klopte dat toevallig. Daarbuiten
 * verdween het verschil zonder een spoor:
 *
 *   400 verbruikt, 6.000 bijgekocht  ->  used = 0. De klant kreeg 400 credits
 *                                        ruimte en betaalde voor 6.000.
 *   0 verbruikt, 6.000 bijgekocht    ->  used = 0. Hij kreeg NIETS.
 *
 * En wat er wel bij kwam verdween alsnog bij de maandelijkse reset, want die
 * zet `used` op nul -- inclusief de "korting" die de bijkoop daar had achtergelaten.
 *
 * Nu is bijgekocht een eigen getal dat optelt bij de maandlimiet en de reset
 * overleeft. `remaining = allowance + purchased - used`.
 */
function summarize(state) {
  const { allowance, used } = state;
  const purchased = Math.max(0, Number(state.purchased) || 0);
  /* allowance 0 betekent "creditsysteem staat uit voor deze klant" (fail-open).
     Dan blijft het Infinity, ook als er bijgekocht is -- anders zou bijkopen bij
     een klant zonder limiet ineens een limiet INVOEREN. */
  const totaal = allowance + purchased;
  const remaining   = allowance > 0 ? Math.max(0, totaal - used) : Infinity;
  const percentUsed = allowance > 0 ? Math.min(100, Math.round((used / totaal) * 100)) : 0;
  return { remaining, percentUsed };
}

/*
 * checkCredits(projectCode, feature) -> Promise<{ allowed, remaining,
 *   percentUsed, message? }>
 * Gate BEFORE a discretionary AI call. Fails OPEN on any infra/config
 * problem. NEVER call this for FEATURES.WHATSAPP_CONVERSATION — see file
 * header; whatsapp.js records usage without checking.
 */
async function checkCredits(projectCode, feature) {
  const code = String(projectCode || '').trim();
  if (!code) return { allowed: true, remaining: Infinity, percentUsed: 0 };
  if (NEVER_BLOCK_FEATURES.has(feature)) return { allowed: true, remaining: Infinity, percentUsed: 0 };

  if (!envConfigured()) {
    logOnce('env', '[Credits] API_AIRTABLE/BASE_AIRTABLE not configured — credit system inert, failing OPEN.');
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  let record;
  try {
    record = await getClientRecord(code);
  } catch (err) {
    // Open falen blijft de juiste keuze — een klant buitensluiten omdat ONZE
    // database niet reageert is erger dan even niet meten. Maar niet zonder
    // grens: zonder deze telling betekende "fail open" letterlijk onbeperkt.
    const lost = unrecordedFor(code);
    if (lost.calls >= UNMETERED_CEILING) {
      console.error(`[Credits] checkCredits(${code}, ${feature}) GEWEIGERD — ${lost.calls} ongemeten aanroepen sinds ${lost.since}`);
      return {
        allowed: false,
        remaining: 0,
        percentUsed: 100,
        reason: 'metering_unavailable',
        message: 'We kunnen je verbruik nu niet bijhouden. Probeer het over enkele minuten opnieuw.',
      };
    }
    console.warn(`[Credits] checkCredits(${code}, ${feature}) lookup failed, failing OPEN (${lost.calls}/${UNMETERED_CEILING} ongemeten):`, err.message);
    return { allowed: true, remaining: Infinity, percentUsed: 0, unmetered: true };
  }
  if (!record) {
    // Client not found under this project code. Not this file's job to
    // decide that's an error (callers already validate the client exists
    // elsewhere) — fail open, nothing to gate.
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  const fields = record.fields || {};
  if (schemaLooksUnconfigured(fields)) {
    logOnce('schema', '[Credits] Credit fields not found on Client Config — credit system inert (see CREDITS-VERCEL-SUMMARY.md to enable).');
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  const state = effectivePeriodState(fields);
  if (state.allowance <= 0) {
    // No allowance configured for THIS client yet — inert for them
    // specifically, even though the fields exist globally. Expected/common
    // state for any client Sindi hasn't onboarded onto credits yet.
    return { allowed: true, remaining: Infinity, percentUsed: 0 };
  }

  /* Betaalt deze klant nog?
   *
   * Dit stond hier niet, en dat was duur. `stop()` zette alleen Plan Status op
   * 'opgezegd' en liet de creditlimiet staan; de periode reset zichzelf elke
   * dertig dagen. Een opgezegde klant hield dus zijn dashboard, en daarmee elke
   * maand opnieuw zijn volle limiet aan beeldgeneratie, video en Faro-chat --
   * bij een omzet van nul. Bij Scale is dat honderden euro's leverancierskosten
   * per maand per dood account.
   *
   * De limiet op nul zetten was NIET de oplossing: in dit bestand betekent een
   * limiet van nul "creditsysteem uit" en dus onbeperkt. De poort hoort hier.
   *
   * Leadgesprekken blijven buiten schot (NEVER_BLOCK_FEATURES hierboven): een
   * lead van een opgezegde klant hoort geen stilte te krijgen, dat is de lead
   * zijn schuld niet. Alleen wat de KLANT zelf aanklikt gaat dicht. */
  const planStatus = _plan.getPlanState(fields);
  if (planStatus.isServiceStopped) {
    console.warn(`[Credits] ${code} heeft status "${planStatus.status}" — discretionaire functie ${feature} geweigerd.`);
    return {
      allowed: false,
      remaining: 0,
      percentUsed: 100,
      reason: 'plan_stopped',
      message: planStatus.status === 'expired'
        ? 'Je proefperiode is voorbij. Kies een plan om dit weer te gebruiken.'
        : 'Je abonnement is gestopt. Kies een plan om dit weer te gebruiken.',
    };
  }

  const { remaining, percentUsed } = summarize(state);
  /* Bijgekocht telt mee. Zonder `+ state.purchased` blokkeert deze regel een
     klant die net credits heeft bijgekocht -- hij heeft betaald en wordt
     alsnog tegengehouden, wat erger is dan geen limiet hebben. */
  const overLimit = state.used >= (state.allowance + state.purchased);
  if (overLimit) {
    console.warn(`[Credits] ${code} is at/over its limit (${state.used}/${state.allowance}+${state.purchased} bijgekocht) — blocking discretionary feature=${feature}.`);
    return {
      allowed: false,
      remaining: 0,
      percentUsed,
      /* Geen "neem contact op met Helvaro". Dat is een klant die wil betalen en
         moet wachten tot iemand wakker is -- precies wat tests/zelfbediening
         bewaakt. Hij kan zelf bijkopen of een groter plan kiezen. */
      message: 'Je AI-credits voor deze periode zijn op. Koop credits bij of kies een groter plan op de Facturatie-pagina.',
    };
  }

  return { allowed: true, remaining, percentUsed };
}

/*
 * recordUsage(projectCode, feature, { credits, tokens, estimatedCostUsd, meta })
 * Fire-and-forget-safe: NEVER throws. Read-modify-write against Airtable —
 * see file header for the documented race. Call this for EVERY feature,
 * including whatsapp_conversation (whatsapp.js never gates on checkCredits,
 * but it must still record usage so the dashboard/admin numbers are real).
 */
/* ── Wat er niet weggeschreven kon worden ────────────────────────────────────
 * recordUsage() mag nooit gooien, dus een mislukte schrijfactie eindigde als
 * een console.error en verder niets. Tijdens een Airtable-storing was AI-inzet
 * daarmee tegelijk ongelimiteerd EN ongemeten: achteraf viel niet eens vast te
 * stellen wat er verbruikt was, want het enige spoor was een logregel zonder
 * bedragen.
 *
 * Deze twee dingen lossen dat op zonder een wachtrij te introduceren:
 *   1. een regel met ALLE velden die nodig zijn om het later opnieuw te boeken,
 *      op één herkenbaar voorvoegsel zodat hij uit de Vercel-logs te vissen is;
 *   2. een tellertje in het geheugen, zodat checkCredits() weet dat er iets
 *      niet klopt en de fail-open niet eindeloos doorloopt.
 */
const _unrecorded = new Map();   // projectCode -> { credits, calls, since }

function noteUnrecorded(code, feature, credits, reason) {
  const cur = _unrecorded.get(code) || { credits: 0, calls: 0, since: new Date().toISOString() };
  cur.credits += credits;
  cur.calls += 1;
  _unrecorded.set(code, cur);
  // Eén regel, alles erin, machinaal terug te lezen.
  console.error('[Credits][RECONCILE] ' + JSON.stringify({
    projectCode: code, feature, credits, reason,
    at: new Date().toISOString(),
    unrecordedTotal: cur.credits, unrecordedCalls: cur.calls, since: cur.since,
  }));
}

/** Wat deze instance kwijt is geraakt. Gelezen door checkCredits(). */
function unrecordedFor(code) {
  return _unrecorded.get(String(code || '').trim()) || { credits: 0, calls: 0, since: null };
}

function clearUnrecorded(code) { _unrecorded.delete(String(code || '').trim()); }

/* Hoeveel beurten er tijdens een storing ongemeten door mogen. Niet nul —
 * een klant buitensluiten omdat ONZE database plat ligt is de verkeerde keuze —
 * maar ook niet oneindig, want dat is precies wat "fail open" vandaag betekent.
 * Ruim genoeg voor een normale werkdag, klein genoeg om weglopende kosten te
 * begrenzen. Per instance, dus de echte grens ligt hoger bij veel instances;
 * dit is een rem, geen slot. */
const UNMETERED_CEILING = 60;

/* ── Waarom hier een wachtrij per klant staat ────────────────────────────────
 * recordUsage() is lezen-wijzigen-schrijven: haal het huidige verbruik op, tel
 * erbij op, schrijf terug. Twee beurten die elkaar overlappen lezen dan
 * allebei dezelfde beginstand en de tweede overschrijft de eerste — één van de
 * twee afschrijvingen verdampt. Bij Faro is dat geen randgeval: één vraag kan
 * meerdere gereedschappen draaien, en een beeld en een chatbeurt worden apart
 * geboekt.
 *
 * Airtable kent geen atomaire ophoging, dus echt oplossen kan hier niet. Wat
 * wel kan: de aanroepen voor DEZELFDE klant achter elkaar zetten in plaats van
 * door elkaar. Dat haalt de races binnen één instance weg, en dat is het
 * leeuwendeel — de verzoeken van één kantoor landen meestal op dezelfde warme
 * instance. Tussen instances blijft het venster bestaan; dat verdwijnt pas met
 * een teller die kan optellen zonder eerst te lezen.
 */
const _queues = new Map();   // projectCode -> Promise-ketting

function serialize(code, task) {
  const prev = _queues.get(code) || Promise.resolve();
  // .catch erin, anders breekt één mislukking de hele ketting voor die klant.
  const next = prev.then(task, task);
  _queues.set(code, next.catch(() => {}));
  // Opruimen zodra deze de laatste in de rij is, anders groeit de Map met elke
  // klant die ooit iets verbruikt heeft.
  next.catch(() => {}).then(() => { if (_queues.get(code) === next.catch(() => {})) _queues.delete(code); });
  return next;
}

async function recordUsage(projectCode, feature, opts = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return;
  return serialize(code, () => recordUsageInner(code, feature, opts));
}

async function recordUsageInner(code, feature, opts = {}) {
  const creditsInt = Math.max(0, Math.round(Number(opts.credits) || 0));
  if (creditsInt <= 0) return;

  if (!envConfigured()) return; // logged once already by checkCredits/other callers if relevant

  /* Dezelfde referentie telt één keer.
   *
   * addCredits() deed dit al; recordUsage() niet, terwijl het de referentie wél
   * accepteerde -- hij werd pas verderop in _ledger.record() bekeken, ná de
   * PATCH die de teller al had opgehoogd. Wat dat kostte: een WhatsApp-gesprek
   * wordt geboekt zodra er één bericht in de historie staat, en die historie
   * wordt alleen bewaard als het antwoord ook echt AANKWAM. Faalde het
   * versturen, dan begon de volgende beurt weer bij één bericht -- en werd er
   * opnieuw twintig credits afgeschreven. Voor een gesprek dat de lead nooit
   * gezien heeft.
   *
   * De controle staat nu vóór de teller, net als bij addCredits. */
  const ref = String(opts.reference || '').trim();
  if (ref) {
    try {
      const _ledger = require('./_ledger');
      const bestaand = await _ledger.zoekOpReferentie(code, ref);
      if (bestaand) return;
    } catch (e) {
      // Niet kunnen controleren mag geen reden zijn om niets te boeken: dan
      // verbruikt iemand gratis. Liever een dubbeling dan een gat.
      console.warn('[Credits] kon niet controleren of dit verbruik al geboekt was, het gaat door:', e && e.message);
    }
  }

  let record;
  try {
    record = await getClientRecord(code);
  } catch (err) {
    console.error(`[Credits] recordUsage(${code}, ${feature}) lookup failed — usage NOT recorded, caller flow continues:`, err.message);
    noteUnrecorded(code, feature, creditsInt, 'lookup_failed');
    return;
  }
  if (!record) return;

  const fields = record.fields || {};
  if (schemaLooksUnconfigured(fields)) return; // inert — nothing to record

  const state = effectivePeriodState(fields);
  const newUsed = state.used + creditsInt;
  const newByFeature = { ...state.byFeature, [feature]: (state.byFeature[feature] || 0) + creditsInt };
  // Spread rawPeriod FIRST so any unrelated namespaced key another subsystem
  // stores in this same field (e.g. the trial cron's `trial: {...}` marker,
  // see effectivePeriodState()'s doc comment) survives this write untouched.
  const newPeriod = {
    ...state.rawPeriod,
    start: state.start,
    alerted80: state.alerted80,
    alerted100: state.alerted100,
    alertedRunaway: state.alertedRunaway,
  };

  try {
    const BASE_ID = process.env.BASE_AIRTABLE;
    const TOKEN   = process.env.API_AIRTABLE;
    const r = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            [FIELD.USED]:       newUsed,
            [FIELD.PERIOD]:     JSON.stringify(newPeriod),
            [FIELD.BY_FEATURE]: JSON.stringify(newByFeature),
          },
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');

      // Eén ontbrekend veld liet hier de HELE update mislukken, en het gevolg
      // was erger dan het lijkt: zonder deze PATCH wordt Credits Used nooit
      // opgehoogd, dus telde het creditplafond niets meer. Dat is precies het
      // omgekeerde van wat een limiet hoort te doen — hij faalde open, stil, en
      // alleen zichtbaar in een console.error. Zo stond het maandenlang: het
      // veld Credit Usage By Feature bestond niet in Airtable.
      //
      // De uitsplitsing per functie is een nice-to-have; de teller is dat niet.
      // Bij een onbekend veld proberen we het daarom opnieuw met alleen de twee
      // velden die echt moeten kloppen. Beter een limiet die telt zonder
      // detailrapportage dan een limiet die niet telt.
      if (r.status === 422 && /UNKNOWN_FIELD_NAME/.test(t)) {
        console.warn(`[Credits] onbekend veld in Client Config — opnieuw zonder de uitsplitsing per functie. Voeg "${FIELD.BY_FEATURE}" toe om die terug te krijgen.`);
        const retry = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
          {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: { [FIELD.USED]: newUsed, [FIELD.PERIOD]: JSON.stringify(newPeriod) },
            }),
          }
        );
        if (retry.ok) return;
        console.error(`[Credits] recordUsage(${code}, ${feature}) ook de beperkte poging faalde (HTTP ${retry.status}) — verbruik NIET geteld`);
        return;
      }

      console.error(`[Credits] recordUsage(${code}, ${feature}) PATCH failed (HTTP ${r.status}) — usage NOT recorded:`, t.slice(0, 200));
      noteUnrecorded(code, feature, creditsInt, `patch_http_${r.status}`);
      return;
    }
  } catch (err) {
    console.error(`[Credits] recordUsage(${code}, ${feature}) PATCH threw — usage NOT recorded:`, err.message);
    noteUnrecorded(code, feature, creditsInt, 'patch_threw');
    return;
  }

  // Gelukt: de storing is voorbij, dus de teller mag terug naar nul. De
  // RECONCILE-regels blijven in het log staan om na te boeken.
  clearUnrecorded(code);

  /* Boek de beweging in het grootboek. PAS HIER, na een geslaagde PATCH: een
     regel schrijven voor een afschrijving die niet doorging maakt de
     geschiedenis onbetrouwbaar, en dat is erger dan geen geschiedenis.

     Fire-and-forget en met opzet niet afgewacht -- het grootboek mag een
     WhatsApp-antwoord nooit vertragen, en als de tabel er niet is gebeurt er
     gewoon niets. api/_ledger.js valt daar zelf netjes op stil.

     De referentie maakt een herhaalde aanroep na een time-out onschadelijk:
     tweemaal dezelfde sleutel is één boeking. */
  try {
    const _ledger = require('./_ledger');
    _ledger.record({
      projectCode: code,
      type: _ledger.TYPE.VERBRUIK,
      credits: creditsInt,
      feature,
      reference: opts.reference || '',
      meta: opts.meta || null,
    }).catch(() => {});
  } catch (e) {
    console.warn('[Credits] grootboek niet bereikbaar:', e && e.message);
  }

  // Threshold alerts (80% / 100% / runaway ceiling), each fires at most once
  // per period. Fire-and-forget — must never affect the caller's flow.
  maybeAlertThresholds(code, { ...state, used: newUsed }, feature).catch(() => {});
}

async function maybeAlertThresholds(projectCode, state, feature) {
  const { allowance, used, ceiling } = state;
  if (allowance <= 0) return;
  const percentUsed = Math.round((used / allowance) * 100);

  const crossed80  = percentUsed >= 80  && !state.alerted80;
  const crossed100 = percentUsed >= 100 && !state.alerted100;
  const crossedRunaway = ceiling > 0 && used >= ceiling && !state.alertedRunaway;

  if (!crossed80 && !crossed100 && !crossedRunaway) return;

  // Re-fetch the record so we PATCH the alerted-flags on top of whatever
  // recordUsage() just wrote, not a stale in-memory copy — a second
  // recordUsage() call could have landed between the PATCH above and this
  // read. Same read-modify-write caveat as everywhere else in this file;
  // worst case here is one extra duplicate alert email, never a missed one
  // in a way that matters (alerts are informational, not enforcement).
  let record;
  try {
    record = await getClientRecord(projectCode);
  } catch (err) {
    console.warn(`[Credits] threshold-alert re-fetch failed for ${projectCode}:`, err.message);
    return;
  }
  if (!record) return;
  const fields = record.fields || {};
  const fresh = effectivePeriodState(fields);
  // Recompute against the fresh row in case usage moved further since our caller's write.
  const freshPercent = fresh.allowance > 0 ? Math.round((fresh.used / fresh.allowance) * 100) : 0;
  const do80  = freshPercent >= 80  && !fresh.alerted80;
  const do100 = freshPercent >= 100 && !fresh.alerted100;
  const doRunaway = fresh.ceiling > 0 && fresh.used >= fresh.ceiling && !fresh.alertedRunaway;
  if (!do80 && !do100 && !doRunaway) return;

  const newPeriod = {
    ...fresh.rawPeriod,
    start: fresh.start,
    alerted80:      fresh.alerted80  || do80,
    alerted100:     fresh.alerted100 || do100,
    alertedRunaway: fresh.alertedRunaway || doRunaway,
  };

  try {
    const BASE_ID = process.env.BASE_AIRTABLE;
    const TOKEN   = process.env.API_AIRTABLE;
    await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { [FIELD.PERIOD]: JSON.stringify(newPeriod) } }),
      }
    );
  } catch (err) {
    console.warn(`[Credits] threshold-alert flag write failed for ${projectCode} (email still attempted):`, err.message);
  }

  const clientName = fields['Client Name'] || fields['fldAnB848Sr5jl6dq'] || projectCode;
  const clientEmail = fields['Rapport Email'] || fields['fldDBJCN6dVMA8jax'] || '';
  const { sendMail } = require('./_mailer');

  if (do80) {
    console.warn(`[Credits] ${projectCode} crossed 80% (${fresh.used}/${fresh.allowance}).`);
    const to = clientEmail || process.env.NOTIFY_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Helvaro] Je zit op 80% van je maandelijkse AI-credits`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
          <h2 style="color:#d97706;margin:0 0 12px">Bijna aan je kredietlimiet</h2>
          <p><strong>${clientName}</strong> heeft <strong>${fresh.used}/${fresh.allowance}</strong> AI-credits gebruikt deze periode.</p>
          <p style="color:#666">Leadgesprekken blijven altijd gewoon doorlopen. Vanaf 100% pauzeert enkel optionele AI (bv. beeldgeneratie) tijdelijk.</p>
        </div>`,
      }).catch(() => {});
    }
  }
  if (do100) {
    console.error(`[Credits] ${projectCode} crossed 100% (${fresh.used}/${fresh.allowance}).`);
    const to = clientEmail || process.env.NOTIFY_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Helvaro] Kredietlimiet bereikt deze periode`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
          <h2 style="color:#e11d48;margin:0 0 12px">Kredietlimiet bereikt</h2>
          <p><strong>${clientName}</strong> heeft <strong>${fresh.used}/${fresh.allowance}</strong> AI-credits gebruikt.</p>
          <p style="color:#666">Leadgesprekken blijven gewoon doorlopen, dat verandert nooit. Optionele AI (beeldgeneratie, extra suggesties) is tijdelijk gepauzeerd tot de volgende periode of een upgrade.</p>
        </div>`,
      }).catch(() => {});
    }
  }
  if (doRunaway) {
    console.error(`[Credits] RUNAWAY: ${projectCode} passed its abuse ceiling (${fresh.used}/${fresh.ceiling}).`);
    const to = process.env.NOTIFY_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Helvaro] Runaway-alert: ${clientName} boven abuse-ceiling`,
        html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:auto;padding:20px;color:#111">
          <h2 style="color:#e11d48;margin:0 0 12px">Runaway credit-gebruik</h2>
          <p><strong>${clientName}</strong> (${projectCode}) zit op <strong>${fresh.used}</strong> credits, boven de ceiling van <strong>${fresh.ceiling}</strong> (${DEFAULT_RUNAWAY_MULTIPLIER}x allowance tenzij handmatig overschreven).</p>
          <p style="color:#666">Dit is puur een misbruik-signaal, geen automatische blokkering. Bekijk het account.</p>
        </div>`,
      }).catch(() => {});
    }
  }
}

// getUsageSummary(projectCode) -> client-dashboard shape, or { active:false }
// when inert/unconfigured (schema absent OR this client has no allowance
// set). Never throws.
async function getUsageSummary(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || !envConfigured()) return { active: false };
  try {
    const record = await getClientRecord(code);
    if (!record) return { active: false };
    const fields = record.fields || {};
    if (schemaLooksUnconfigured(fields)) return { active: false };
    const state = effectivePeriodState(fields);
    if (state.allowance <= 0) return { active: false };

    const { remaining, percentUsed } = summarize(state);
    const daysElapsed = Math.floor((Date.now() - Date.parse(state.start)) / 86400000);
    const daysLeft = Math.max(0, Math.ceil(PERIOD_MS / 86400000) - daysElapsed);
    const leadsRemaining = Math.floor(remaining / WEIGHTS[FEATURES.WHATSAPP_CONVERSATION]);

    return {
      active: true,
      allowance: state.allowance,
      used: state.used,
      remaining,
      percentUsed,
      periodStart: state.start,
      daysLeft,
      leadsRemaining,
      byFeature: state.byFeature,
      overLimit: state.used >= state.allowance,
    };
  } catch (err) {
    console.warn(`[Credits] getUsageSummary(${code}) failed, hiding widget:`, err.message);
    return { active: false };
  }
}

// getAllUsageSummaries() -> [{ projectCode, clientName, ...summary,
//   estimatedCostEur }] for every Client Config record, once the credit
// fields are confirmed to exist SOMEWHERE on the base (see the schemaExists
// check below) — including clients with no allowance set yet (admin needs to
// see "not onboarded onto credits" clients too, unlike the client-facing
// getUsageSummary which hides them). Bounded by client count (Helvaro-scale:
// low dozens) — same "admin is low-frequency" tradeoff as the rest of
// api/admin.js.
async function getAllUsageSummaries() {
  if (!envConfigured()) return [];
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  try {
    const r = await atFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?pageSize=100`,
      { headers: { Authorization: `Bearer ${TOKEN}` } }
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const records = d.records || [];

    // Airtable omits a BLANK field from record.fields even when the column
    // exists in the schema — schemaLooksUnconfigured() is per-record and
    // can't distinguish "this client has no allowance yet" from "the owner
    // never added the columns at all". For THIS function (unlike
    // checkCredits/getUsageSummary, which only ever need a per-client
    // answer) we need the global answer, so it's derived once across every
    // fetched record: if ANY client has ANY of the 3 core keys, the schema
    // exists and every client should be listed (blank ones included, as
    // "no allowance configured yet"). If truly none do, the fields almost
    // certainly haven't been added yet — return [] rather than a list of
    // all-zero rows that would look like real data.
    const schemaExists = records.some(rec => !schemaLooksUnconfigured(rec.fields || {}));
    if (!schemaExists) return [];

    const out = [];
    for (const rec of records) {
      const fields = rec.fields || {};
      const projectCode = fields['Project Code'] || fields['fldN4dL0bGgfBOXwM'] || '';
      const clientName  = fields['Client Name']  || fields['fldAnB848Sr5jl6dq']  || projectCode;
      if (!projectCode) continue;

      const state = effectivePeriodState(fields);
      const { remaining, percentUsed } = summarize(state);
      let estimatedCostEur = 0;
      for (const [feature, credits] of Object.entries(state.byFeature)) {
        estimatedCostEur += (Number(credits) || 0) * (COST_PER_CREDIT_EUR[feature] || 0);
      }
      out.push({
        projectCode,
        clientName,
        allowance: state.allowance,
        used: state.used,
        remaining,
        percentUsed,
        periodStart: state.start,
        byFeature: state.byFeature,
        estimatedCostEur: Math.round(estimatedCostEur * 100) / 100,
        configured: state.allowance > 0,
      });
    }
    return out;
  } catch (err) {
    console.error('[Credits] getAllUsageSummaries failed:', err.message);
    return [];
  }
}

// ── Admin write helpers. These are the ONLY functions in this file that can
// surface an error to the caller (an admin action, not a lead-facing flow) —
// if the credit fields aren't on the schema yet, Airtable's PATCH itself
// will reject the unknown field name and this bubbles up as a clear error
// for the admin UI to show, rather than being swallowed. ───────────────────

async function _patchClientCreditFields(projectCode, fields) {
  const code = String(projectCode || '').trim();
  if (!code) throw new Error('projectCode is verplicht');
  if (!envConfigured()) throw new Error('API_AIRTABLE/BASE_AIRTABLE niet geconfigureerd');
  const record = await getClientRecord(code);
  if (!record) throw new Error(`Geen klant gevonden met Project Code "${code}"`);
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  const r = await atFetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    }
  );
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 300)}`);
  }
  return r.json();
}

async function setAllowance(projectCode, allowance) {
  const n = Math.max(0, Math.round(Number(allowance) || 0));
  return _patchClientCreditFields(projectCode, { [FIELD.ALLOWANCE]: n });
}

// "Add credits" = extra headroom this period = reduce Credits Used (floored
// at 0), same semantics as both reference implementations — a top-up, not a
// permanent allowance change.
async function addCredits(projectCode, n, opts = {}) {
  const code = String(projectCode || '').trim();

  /* Dubbele bijschrijving voorkomen VOOR de teller wordt aangeraakt.

     Het grootboek weigert al een tweede regel met dezelfde referentie, maar dat
     gebeurde PAS onderaan deze functie -- de teller was dan al opgehoogd. Bij
     een betaling is dat het verschil tussen "de webhook kwam twee keer, één
     regel in het overzicht" en "de klant kreeg twee keer credits voor één
     betaling". En Stripe stuurt een gebeurtenis opnieuw zodra hij geen 2xx
     krijgt, dus dit is geen theoretisch geval.

     Kunnen we het niet controleren (grootboektabel bestaat niet, Airtable ligt
     eruit), dan gaat de bijschrijving door: een klant die betaald heeft en
     niets krijgt is erger dan een dubbele boeking, en een dubbele boeking is
     zichtbaar en terug te draaien. */
  const ref = String((opts && opts.reference) || '').trim();
  if (ref) {
    try {
      const _ledger = require('./_ledger');
      const bestaand = await _ledger.zoekOpReferentie(code, ref);
      if (bestaand) {
        console.log(`[Credits] bijschrijving met referentie "${ref}" bestond al — niets gedaan.`);
        return { alGeboekt: true, transactie: bestaand };
      }
    } catch (e) {
      console.warn('[Credits] kon niet controleren of deze bijschrijving al bestond, hij gaat door:', e && e.message);
    }
  }

  const record = await getClientRecord(code);
  if (!record) throw new Error(`Geen klant gevonden met Project Code "${code}"`);
  const fields = record.fields || {};
  const state = effectivePeriodState(fields);
  const bij = Math.max(0, Math.round(Number(n) || 0));

  // Spread rawPeriod first — see effectivePeriodState()'s doc comment: an
  // admin top-up must never wipe an unrelated namespaced key (e.g. the
  // trial cron's once-only-email marker) that happens to live in this same field.
  const periodeJson = JSON.stringify({ ...state.rawPeriod, start: state.start, alerted80: state.alerted80, alerted100: state.alerted100, alertedRunaway: state.alertedRunaway });

  /* Optellen bij het bijgekocht-saldo. Zie summarize() voor waarom dit niet
     langer de teller verlaagt. */
  let uit;
  try {
    uit = await _patchClientCreditFields(projectCode, {
      [FIELD.PURCHASED]: state.purchased + bij,
      [FIELD.PERIOD]: periodeJson,
    });
  } catch (err) {
    /* Bestaat het veld nog niet in Airtable, dan weigert Airtable de HELE patch.
       Dan valt dit terug op de oude manier, want de klant heeft al betaald en
       iets is beter dan niets -- maar het gaat luid het log in MET het bedrag
       dat daarbij verloren gaat, want dat is precies wat niemand ooit zag.
       `node scripts/preflight.js` faalt hier ook hard op. */
    if (!/UNKNOWN_FIELD_NAME|Unknown field/i.test(String(err && err.message))) throw err;
    const kwijt = Math.max(0, bij - state.used);
    console.error(
      `[Credits] veld "${FIELD.PURCHASED}" bestaat niet in Airtable. Terugval op de oude telling voor ${code}: `
      + `${bij} credits bijgeschreven op een verbruik van ${state.used}`
      + (kwijt > 0 ? ` — ${kwijt} CREDITS GAAN VERLOREN. Maak het veld aan.` : '.')
    );
    uit = await _patchClientCreditFields(projectCode, {
      [FIELD.USED]: Math.max(0, state.used - bij),
      [FIELD.PERIOD]: periodeJson,
    });
  }

  /* Ook een bijstorting is een beweging. Zonder deze regel staat er straks in
     het overzicht wel dat er credits bij kwamen, maar niet wanneer of hoeveel.

     'skip-ledger' bestaat voor refundCredits hieronder: die gebruikt addCredits
     alleen om de TELLER bij te werken en boekt zelf een terugbetaling. Zonder
     deze uitzondering stonden er twee regels voor één terugbetaling, en dan
     klopt het saldo in het overzicht niet meer met de werkelijkheid. */
  if (opts && opts.type === 'skip-ledger') return uit;
  try {
    const _ledger = require('./_ledger');
    await _ledger.record({
      projectCode: code,
      type: opts && opts.type === 'purchase' ? _ledger.TYPE.AANKOOP : _ledger.TYPE.CORRECTIE,
      credits: Math.max(0, Math.round(Number(n) || 0)),
      reference: ref,
      note: (opts && opts.note) || 'Credits bijgeschreven',
      meta: (opts && opts.meta) || null,
    });
  } catch (e) {
    console.warn('[Credits] bijstorting niet geboekt in grootboek:', e && e.message);
  }
  return uit;
}

// Admin-triggered CREDIT period reset. Still reads the current record first
// (rather than blind-overwriting) so an unrelated namespaced key stored in
// the same Credit Period field — e.g. the trial cron's once-only-email
// marker (see effectivePeriodState()'s doc comment) — survives an admin
// resetting a client's credit counters. Only the 4 credit-owned keys are
// actually reset; everything else in the envelope passes through untouched.
async function resetPeriod(projectCode) {
  const code = String(projectCode || '').trim();
  let rawPeriod = {};
  try {
    const record = await getClientRecord(code);
    if (record) rawPeriod = effectivePeriodState(record.fields || {}).rawPeriod;
  } catch (err) {
    console.warn(`[Credits] resetPeriod(${code}) pre-read failed, resetting without preserving extra keys:`, err.message);
  }
  /* FIELD.PURCHASED staat hier BEWUST niet bij. Een nieuwe maand geeft de
     maandlimiet opnieuw; wat de klant met eigen geld heeft bijgekocht is van
     hem en blijft staan tot hij het opmaakt. Zet het hier nooit op nul. */
  return _patchClientCreditFields(projectCode, {
    [FIELD.USED]:       0,
    [FIELD.PERIOD]:     JSON.stringify({ ...rawPeriod, start: new Date().toISOString(), alerted80: false, alerted100: false, alertedRunaway: false }),
    [FIELD.BY_FEATURE]: JSON.stringify({}),
  });
}

// ── Trial-lifecycle marker (once-only email/alert tracking) ────────────────
// Piggybacks on the SAME Credit Period field this file already owns, rather
// than a new Airtable field — see TRIAL-DESIGN.md §7 and
// CREDITS-VERCEL-SUMMARY.md's "do NOT add Airtable fields" instruction for
// the trial feature. Stored as a `trial: {day7Sent, day11Sent, expiredSent}`
// sub-object inside the same JSON envelope this file's own alerted80/100/
// runaway flags live in. Only api/cron-followup.js's runTrialLifecycle()
// calls these two — kept here rather than duplicated there, because this
// file already owns every read/write of Credit Period and effectivePeriodState()'s
// rawPeriod-spreading (see its doc comment) is what keeps this safe from a
// concurrent recordUsage() call clobbering it, and vice versa.
//
// Deliberately does NOT gate on schemaLooksUnconfigured() the way the
// credit-specific functions above do: that check answers "have the credit
// fields been added to the Client Config schema at all", which for THIS
// feature is a given (Credit Period already exists — see TRIAL-DESIGN.md
// §6.5, it's one of the fields the credit system rollout already added).
// If it somehow doesn't, the PATCH below fails naturally and the caller's
// try/catch handles it exactly like any other Airtable error.
async function getTrialMarkers(projectCode) {
  const code = String(projectCode || '').trim();
  if (!code || !envConfigured()) return {};
  try {
    const record = await getClientRecord(code);
    if (!record) return {};
    const state = effectivePeriodState(record.fields || {});
    return (state.rawPeriod && typeof state.rawPeriod.trial === 'object') ? state.rawPeriod.trial : {};
  } catch (err) {
    console.warn(`[Credits] getTrialMarkers(${code}) failed, treating as "nothing sent yet":`, err.message);
    return {};
  }
}

// Merges `patch` into the existing `trial` sub-object. Re-reads the record
// fresh immediately before writing (same pattern as maybeAlertThresholds()
// above) so this doesn't clobber a concurrent credit write, and vice versa.
// Throws on genuine failure (network/Airtable error) — callers in
// cron-followup.js wrap this in try/catch and treat a failure as "email
// sent, marker not persisted" (logged, not fatal): the bounded downside is
// a possible duplicate email on the NEXT cron run, never a service-state
// change, matching this file's own documented Airtable-race risk appetite.
async function setTrialMarker(projectCode, patch) {
  const code = String(projectCode || '').trim();
  if (!code) return false;
  if (!envConfigured()) return false;
  const record = await getClientRecord(code);
  if (!record) return false;
  const fields = record.fields || {};
  const state = effectivePeriodState(fields);
  const currentTrial = (state.rawPeriod && typeof state.rawPeriod.trial === 'object') ? state.rawPeriod.trial : {};
  const newPeriod = {
    ...state.rawPeriod,
    start: state.start,
    alerted80: state.alerted80,
    alerted100: state.alerted100,
    alertedRunaway: state.alertedRunaway,
    trial: { ...currentTrial, ...patch },
  };
  const BASE_ID = process.env.BASE_AIRTABLE;
  const TOKEN   = process.env.API_AIRTABLE;
  const r = await atFetch(
    `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${record.id}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { [FIELD.PERIOD]: JSON.stringify(newPeriod) } }),
    }
  );
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(`Airtable PATCH ${r.status}: ${t.slice(0, 200)}`);
  }
  return true;
}

/**
 * Een afschrijving terugdraaien omdat de actie erna alsnog mislukte.
 *
 * Dit bestond niet. De regel was "afschrijven doen we PAS na een geslaagde
 * actie", en dat dekt het meeste -- maar niet alles: een video die na het
 * afschrijven bij de leverancier stukloopt, of een beeld dat gemaakt is maar
 * niet opgeslagen kon worden. Zonder terugbetaling betaalt de klant daarvoor.
 *
 * De reden is verplicht en komt in het grootboek te staan, zodat een klant die
 * ernaar vraagt een antwoord krijgt in plaats van een getal.
 */
async function refundCredits(projectCode, credits, reason, opts = {}) {
  const code = String(projectCode || '').trim();
  const aantal = Math.max(0, Math.round(Number(credits) || 0));
  if (!code || aantal <= 0) return null;
  if (!String(reason || '').trim()) {
    console.warn('[Credits] terugbetaling zonder reden geweigerd voor', code);
    return null;
  }

  // De teller: minder verbruikt betekent meer ruimte, precies zoals addCredits.
  try {
    await addCredits(code, aantal, { type: 'skip-ledger' });
  } catch (err) {
    console.error('[Credits] terugbetaling kon de teller niet bijwerken:', err && err.message);
    return null;
  }

  try {
    const _ledger = require('./_ledger');
    return await _ledger.refund({
      projectCode: code, credits: aantal, reason,
      feature: opts.feature || '', reference: opts.reference || '',
    });
  } catch (e) {
    console.warn('[Credits] terugbetaling niet geboekt in grootboek:', e && e.message);
    return null;
  }
}

module.exports = {
  refundCredits,
  topupOfferte, beterPlanVoor, TOPUP_RATE_EUR, TOPUP_MIN_EUR, TOPUP_MAX_EUR, TOPUP_STAFFEL,
  topupPresets, TOPUP_PRESETS,
  unrecordedFor, clearUnrecorded, UNMETERED_CEILING,
  creditsForVideo, VIDEO_CREDITS_PER_SECOND,
  creditsForChatTurn, MODEL_PRICES, CHAT_MARGIN,
  FEATURES,
  WEIGHTS,
  FIELD,
  INTERNAL_PROJECT_CODE,
  checkCredits,
  recordUsage,
  getUsageSummary,
  getAllUsageSummaries,
  setAllowance,
  addCredits,
  resetPeriod,
  getTrialMarkers,
  setTrialMarker,
};
