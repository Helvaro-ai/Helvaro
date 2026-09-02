'use strict';
/*
 * Wat heeft Faro echt gedaan?
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * Het dashboard, de activiteitenlijst en de leadpagina vertellen alle drie iets
 * over wat er met een lead gebeurd is. Zonder één bron gaan die drie na een paar
 * maanden verschillende dingen zeggen over dezelfde lead, en dan geloof je geen
 * van drieën meer. Dit is die ene bron: van leadrecords naar zinnen in Faro's
 * stem.
 *
 * Puur. Geen netwerk, geen Airtable, geen tijdzone-magie. Erin gaan de leads
 * die api/_leads-read.js al gemapt heeft, eruit komen gebeurtenissen en
 * beoordelingen. Daardoor is het te testen zonder een base.
 *
 * ── WAT HIER NIET IN HOORT: DE TELLINGEN ─────────────────────────────────────
 * Dit bestand telde eerst ook zelf hoeveel leads er gekwalificeerd en geboekt
 * waren. Dat was een tweede implementatie van iets dat al bestond:
 * api/_command.js doet precies dat in overview(), inclusief de omzetkant, en
 * gaat er expliciet prat op dat elk getal "arithmetic over records that exist"
 * is. Twee tellers op hetzelfde product zijn twee getallen die na een half jaar
 * niet meer gelijk zijn, en dan gelooft niemand er nog een.
 *
 * Dus: tellen doet _command.js. Dit bestand doet het VERTELLEN -- wat er
 * gebeurde, in Faro's stem, en wat hij van één lead vindt. Dat bestond nog niet:
 * de activiteitenlijst stond in api/dashboard.js in systeemtaal ("Lead
 * gekwalificeerd:"), en beweerde bovendien dat afspraken via Calendly liepen,
 * wat al een tijd niet meer klopt.
 *
 * ── DE REGEL: NOOIT DOEN ALSOF ───────────────────────────────────────────────
 * Faro mag alleen zeggen dat hij iets gedaan heeft als het ECHT is vastgelegd.
 * Dat is geen stijlkeuze. Een assistent die één keer zegt "ik heb Sarah
 * opgevolgd" terwijl er niets verstuurd is, is daarna nooit meer te vertrouwen
 * -- en dan is elke andere regel op het scherm ook verdacht.
 *
 * Concreet, want dit is precies waar het misging bij het ontwerp:
 *
 *   WAT WE WEL WETEN            veld
 *   -----------------------------------------------------------------
 *   er kwam een lead binnen     datum
 *   Faro kwalificeerde hem      qualified (+ reden, capaciteit, urgentie, fit)
 *   Faro stuurde een boekingslink boekingslinkVerstuurd
 *   er staat een afspraak       afspraakGeboekt
 *   Faro is gestopt, mens nodig aiPaused
 *
 *   WAT WE NIET WETEN
 *   ---------------------------------------------------------------------
 *   OPVOLGINGEN. api/cron-followup.js stuurt ze wel degelijk, maar legt
 *   daarvoor alleen `Conversation State = 'in_progress'` vast. Datzelfde
 *   veld krijgt dezelfde waarde wanneer de LEAD antwoordt. Uit het record
 *   is dus niet af te leiden of Faro iets gestuurd heeft of dat er iemand
 *   terugschreef -- en een telling "7 opvolgingen verstuurd" zou dus voor
 *   een deel verzonnen zijn.
 *
 *   Daarom staat opvolging hier NIET in. Wie hem wil tonen, legt eerst een
 *   veld aan ("Followup Sent At", datum) en zet dat in cron-followup.js
 *   naast de bestaande State-PATCH. Dan pas mag het scherm het beweren.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* De gebeurtenissen die we uit een leadrecord kunnen AFLEIDEN, met per soort
   of het een handeling van Faro was of iets dat hem overkwam. Dat onderscheid
   bepaalt de zin: "Faro kwalificeerde Jan" tegenover "Jan kwam binnen".

   `sleutel` verwijst naar api/_i18n.js, zodat de tekst in vier talen bestaat
   en er hier geen Nederlands in de code staat. */
const SOORTEN = Object.freeze({
  nieuw:      { vanFaro: false, sleutel: 'faro.act.nieuw',      urgent: false },
  gekwalificeerd: { vanFaro: true, sleutel: 'faro.act.gekwalificeerd', urgent: false },
  boekingslink:   { vanFaro: true, sleutel: 'faro.act.boekingslink',   urgent: false },
  geboekt:    { vanFaro: true,  sleutel: 'faro.act.geboekt',    urgent: false },
  aandacht:   { vanFaro: true,  sleutel: 'faro.act.aandacht',   urgent: true  },
});

/* ── Faro's toestanden ──────────────────────────────────────────────────────
 * De opdracht vraagt om elf benoemde toestanden (idle, working, celebrating,
 * needs_attention, sleeping...). Er zijn ZES tekeningen: idle, thinking,
 * generating, video, success, error.
 *
 * Elf poses tekenen kan ik niet, en elf namen op zes bestanden plakken zonder
 * dat op te schrijven is de soort halfheid waar later niemand meer uitkomt.
 * Dus: de betekenissen bestaan wel degelijk -- de code kan om
 * 'appointment_booked' vragen -- en deze tabel zegt eerlijk welke tekening
 * daarbij hoort. Komt er ooit echte kunst bij, dan is dit het enige bestand
 * dat wijzigt.
 *
 * `rust` markeert de toestanden waarin Faro klein en stil hoort te blijven.
 * De opdracht is daar expliciet over: levend, niet druk.
 */
const TOESTANDEN = Object.freeze({
  idle:              { pose: 'idle',       rust: true  },
  sleeping:          { pose: 'idle',       rust: true  },   // geen eigen tekening
  working:           { pose: 'generating', rust: false },
  thinking:          { pose: 'thinking',   rust: false },
  listening:         { pose: 'thinking',   rust: true  },   // geen eigen tekening
  new_lead:          { pose: 'thinking',   rust: false },   // geen eigen tekening
  follow_up:         { pose: 'generating', rust: false },   // geen eigen tekening
  qualified:         { pose: 'success',    rust: false },
  appointment_booked:{ pose: 'success',    rust: false },
  celebrating:       { pose: 'success',    rust: false },
  success:           { pose: 'success',    rust: false },
  warning:           { pose: 'error',      rust: false },   // geen eigen tekening
  needs_attention:   { pose: 'error',      rust: false },
  error:             { pose: 'error',      rust: false },
});

/* De tekening bij een toestand. Onbekend valt terug op idle in plaats van op
   niets: een gebroken plaatje is erger dan een rustige valk. */
function pose(toestand) {
  const t = TOESTANDEN[String(toestand || '').trim()];
  return (t && t.pose) || 'idle';
}

/* Welke toestand hoort bij een gebeurtenis uit gebeurtenissen()? Zo hoeft de UI
   die koppeling niet zelf te verzinnen. */
const SOORT_TOESTAND = Object.freeze({
  nieuw: 'new_lead',
  gekwalificeerd: 'qualified',
  boekingslink: 'working',
  geboekt: 'appointment_booked',
  aandacht: 'needs_attention',
});

/* Wat Faro over een lead weet, in de volgorde waarin het gelezen hoort te
   worden: eerst of hij het kan betalen, dan wanneer, dan of het past.

   Staat hier als TABEL en niet als losse regels code, omdat het dashboard
   dezelfde volgorde en dezelfde labels nodig heeft. Twee lijsten die hetzelfde
   moeten zeggen, zeggen na een half jaar iets anders. */
const BEOORDELING_VELDEN = Object.freeze([
  { veld: 'capaciteit', sleutel: 'faro.beoordeling.capaciteit' },
  { veld: 'urgentie',   sleutel: 'faro.beoordeling.urgentie' },
  { veld: 'fit',        sleutel: 'faro.beoordeling.fit' },
  { veld: 'bron',       sleutel: 'faro.beoordeling.bron' },
  { veld: 'property',   sleutel: 'faro.beoordeling.pand' },
]);

/* Wat Faro voor deze lead DEED. Alleen velden die de backend echt zet -- zie
   de header over waarom opvolging hier ontbreekt. */
const DEED_REGELS = Object.freeze([
  { veld: 'datum',                 sleutel: 'faro.deed.gesprek' },
  { veld: 'qualified',             sleutel: 'faro.deed.gekwalificeerd' },
  { veld: 'boekingslinkVerstuurd', sleutel: 'faro.deed.boekingslink' },
  { veld: 'afspraakGeboekt',       sleutel: 'faro.deed.geboekt' },
  { veld: 'aiPaused',              sleutel: 'faro.deed.gestopt' },
]);

function alsDatum(waarde) {
  if (!waarde) return null;
  const d = waarde instanceof Date ? waarde : new Date(waarde);
  return isNaN(d.getTime()) ? null : d;
}

/* ── De gebeurtenissen ──────────────────────────────────────────────────────
 * Chronologisch, nieuwste eerst.
 *
 * EEN EERLIJKE TIJDSTEMPEL BESTAAT HIER NIET. Airtable legt per lead één datum
 * vast: wanneer hij binnenkwam. Wanneer hij gekwalificeerd werd of wanneer de
 * afspraak geboekt is, staat nergens. De oude activiteitenlijst loste dat op
 * door er 1, 2 en 3 seconden bij op te tellen -- puur om de volgorde binnen één
 * lead kloppend te krijgen.
 *
 * Dat gedrag blijft, want het is de enige manier om de gebeurtenissen van één
 * lead in de juiste volgorde te tonen. Maar `geschat: true` gaat mee naar
 * buiten, zodat de UI "rond" kan zeggen in plaats van een precisie te suggereren
 * die er niet is.
 */
function gebeurtenissen(leads, opties) {
  const lijst = Array.isArray(leads) ? leads : [];
  const max = (opties && opties.max) || 50;
  const uit = [];

  for (const l of lijst) {
    if (!l) continue;
    const d = alsDatum(l.datum);
    if (!d) continue;
    const t = d.getTime();

    uit.push({ soort: 'nieuw', datum: d, geschat: false, lead: l });
    if (l.qualified === true) {
      uit.push({ soort: 'gekwalificeerd', datum: new Date(t + 1000), geschat: true, lead: l });
    }
    if (l.boekingslinkVerstuurd === true) {
      uit.push({ soort: 'boekingslink', datum: new Date(t + 2000), geschat: true, lead: l });
    }
    if (l.afspraakGeboekt === true) {
      uit.push({ soort: 'geboekt', datum: new Date(t + 3000), geschat: true, lead: l });
    }
    if (l.aiPaused === true) {
      uit.push({ soort: 'aandacht', datum: new Date(t + 4000), geschat: true, lead: l });
    }
  }

  uit.sort((a, b) => b.datum - a.datum);
  return uit.slice(0, max);
}

/* ── Faro's beoordeling van één lead ────────────────────────────────────────
 * Alleen velden die de AI zelf heeft ingevuld. Leeg blijft leeg: een
 * beoordeling met verzonnen zekerheid is erger dan geen beoordeling.
 *
 * Geeft `punten` terug (de losse bevindingen) en `redenen` (waarom hij
 * gekwalificeerd is). Wie niets heeft, krijgt niets -- dan toont de UI
 * "hier weet ik nog niets over" en dat is een eerlijk antwoord.
 */
function beoordeling(lead) {
  const l = lead || {};
  const punten = [];

  const voegToe = (sleutel, waarde) => {
    const v = String(waarde == null ? '' : waarde).trim();
    if (v) punten.push({ sleutel, waarde: v });
  };

  for (const rij of BEOORDELING_VELDEN) voegToe(rij.sleutel, l[rij.veld]);

  const samenvattingTekst = String(l.samenvatting || '').trim();
  const redenTekst = String(l.reden || '').trim();

  return {
    gekwalificeerd: l.qualified === true,
    /* Waarom. Komt letterlijk uit het Reason-veld dat de AI zelf schreef --
       niet uit een sjabloon dat wij eromheen verzinnen. */
    reden: redenTekst,
    samenvatting: samenvattingTekst,
    punten,
    // Weet Faro eigenlijk wel iets van deze lead?
    leeg: punten.length === 0 && !samenvattingTekst && !redenTekst,
    aandachtNodig: l.aiPaused === true,
  };
}

/* Wat Faro voor DEZE lead daadwerkelijk gedaan heeft, in volgorde. Zelfde
   regel als hierboven: alleen wat vastligt. */
function watFaroDeed(lead) {
  const l = lead || {};
  return DEED_REGELS
    .filter((rij) => (rij.veld === 'datum' ? !!l.datum : l[rij.veld] === true))
    .map((rij) => rij.sleutel);
}

module.exports = {
  SOORTEN,
  TOESTANDEN,
  SOORT_TOESTAND,
  pose,
  BEOORDELING_VELDEN,
  DEED_REGELS,
  gebeurtenissen,
  beoordeling,
  watFaroDeed,
};
