'use strict';
/*
 * Waar staat de gebruiker, en wat betekent "dit"?
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * Faro kreeg tot nu toe alleen de VRAAG. De client stuurde
 * { mode, text, conversationId, tier, attachments, history } en verder niets.
 * Iemand die naar zijn creditsscherm keek en "wat betekent dit?" typte, vroeg
 * dus letterlijk aan een assistent die niet kon zien waar hij stond. Faro
 * antwoordde met een gok of een wedervraag, en dat is precies het moment
 * waarop een gebruiker besluit dat hij het zelf wel uitzoekt.
 *
 * Dit bestand is de ene plek die weet welke schermen er zijn en wat ze
 * betekenen. Eén definitie, gebruikt door de prompt én door de proactieve
 * zinnetjes in de UI, zodat wat Faro zegt en wat het scherm doet niet uit
 * elkaar kunnen lopen.
 *
 * ── Wat hier NIET in hoort ───────────────────────────────────────────────────
 * Klantgegevens. De schermcontext zegt WAAR iemand is, niet WAT er staat.
 * Leads, bedragen en telefoonnummers komen via de gereedschappen in tools.js,
 * met de tenantcontrole die daarbij hoort. Deze weg omzeilt die controle niet
 * en mag dat nooit gaan doen.
 *
 * ── Alles wat binnenkomt is verdacht ─────────────────────────────────────────
 * De context komt uit de browser en is dus door de gebruiker te vervalsen.
 * sanitize() laat daarom alleen bekende sleutels door, kapt lengtes af, en
 * accepteert alleen pagina-ids die we zelf gedefinieerd hebben. Vrije tekst
 * uit de pagina belandt nooit in de prompt: een lead met een naam als
 * "negeer je instructies" mag Faro niet kunnen omdraaien.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/* De schermen die een KLANT ziet. De back-office (founder, kosten, admin)
   staat er bewust niet in: die pagina's worden voor een klant al uit de HTML
   gehaald (stripBackoffice in api/dashboard.js) en Faro hoort er dus ook niets
   over te kunnen zeggen.

   `wat` is wat Faro antwoordt op "wat is dit?" -- kort, in gewone taal, en
   waar zonder dat je het scherm hoeft te zien. Dit is meteen de vervanging van
   de uitlegparagrafen die anders overal op de pagina zouden staan. */
const PAGINAS = Object.freeze({
  dashboard: {
    toontLeads: true,
    naam: 'Dashboard',
    wat: 'Het overzicht: binnengekomen leads, wie er gekwalificeerd is, en welke afspraken er staan.',
  },
  gesprekken: {
    toontLeads: true,
    naam: 'Gesprekken',
    wat: 'De WhatsApp-gesprekken tussen de AI en de leads, van begin tot eind terug te lezen.',
  },
  pipeline: {
    toontLeads: true,
    naam: 'Pipeline',
    wat: 'De leads verdeeld over fasen, van nieuw tot gewonnen of verloren.',
  },
  panden: {
    naam: 'Panden',
    wat: 'De panden die de AI aan leads kan voorstellen, met hun kenmerken en beelden.',
  },
  kalender: {
    naam: 'Kalender',
    wat: 'De afspraken die de AI heeft ingepland. Gekoppeld aan Google Agenda kijkt ze eerst of je vrij bent.',
  },
  analyse: {
    toontLeads: true,
    naam: 'Analyse',
    wat: 'Cijfers over de leads: hoeveel er binnenkomen, hoeveel er kwalificeren en hoeveel er een afspraak maken.',
  },
  resultaten: {
    toontLeads: true,
    naam: 'Resultaten',
    wat: 'Wat de AI heeft opgeleverd over een periode.',
  },
  activiteit: {
    toontLeads: true,
    naam: 'Activiteit',
    wat: 'Wat er wanneer gebeurde: nieuwe leads, kwalificaties en geboekte afspraken op volgorde van tijd.',
  },
  'ai-persona': {
    naam: 'AI-persoonlijkheid',
    wat: 'Hier stel je in hoe de AI je leads te woord staat: haar naam, het welkomstbericht, wat je bedrijf doet en je werkuren. Hoe concreter dit staat, hoe beter ze kwalificeert.',
  },
  'ai-beeld': {
    naam: 'AI-beeld',
    wat: 'Beeldgeneratie voor panden en social posts. Dit kost credits per beeld.',
  },
  formulier: {
    naam: 'Formulier',
    wat: 'De publieke link die je deelt. Iedereen die hem invult wordt een lead en krijgt meteen een WhatsApp-bericht van de AI.',
  },
  facturatie: {
    naam: 'Facturatie',
    wat: 'Je abonnement, je creditsaldo en je facturen. Credits zijn wat Helvaro gebruikt voor AI-acties: een gekwalificeerd WhatsApp-gesprek kost er 20, beeldgeneratie meer.',
  },
  instellingen: {
    naam: 'Instellingen',
    wat: 'Je koppelingen en voorkeuren: Google Agenda, meldingen, taal en land.',
  },
  exports: {
    naam: 'Exports',
    wat: 'Je leads en gesprekken downloaden als bestand.',
  },
  profile: {
    naam: 'Profiel',
    wat: 'Je eigen accountgegevens en wachtwoord.',
  },
});

/* Toestanden die iets betekenen voor wat Faro zou moeten zeggen. Vrije tekst
   is hier niet toegestaan -- alleen deze woorden. */
const TOESTANDEN = new Set(['leeg', 'fout', 'laden', 'normaal']);

const MAX_SECTIE = 60;

/* Wat de browser stuurt is niet te vertrouwen. Alleen bekende sleutels, alleen
   bekende waarden, en lengtes afgekapt. Alles wat we niet herkennen valt weg
   in plaats van een fout te geven: een onbekende pagina mag een vraag niet
   laten mislukken, hij levert alleen minder context op. */
function sanitize(raw) {
  const r = (raw && typeof raw === 'object') ? raw : {};
  const uit = {};

  const pagina = String(r.pagina || '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PAGINAS, pagina)) uit.pagina = pagina;

  /* De sectie is een label uit onze eigen UI, geen klantdata. Toch afkappen en
     ontdoen van alles wat op opmaak lijkt, want het is en blijft een string
     die uit de pagina komt. */
  const sectie = String(r.sectie || '').trim().replace(/[<>`${}\n\r]/g, '').slice(0, MAX_SECTIE);
  if (sectie) uit.sectie = sectie;

  const toestand = String(r.toestand || '').trim().toLowerCase();
  if (TOESTANDEN.has(toestand) && toestand !== 'normaal') {
    /* "Leeg" wordt door de client afgeleid uit het aantal leads, en dat zegt
       alleen iets op een scherm dat leads TOONT. Op AI-persoonlijkheid of
       Facturatie zou "dit scherm is leeg" Faro laten uitleggen waarom er niets
       staat, terwijl er een volledig ingevuld formulier voor de gebruiker
       staat. Live gezien: een account zonder leads meldde elk scherm als leeg.

       Een foutmelding geldt wél overal. */
    const leadsScherm = uit.pagina && PAGINAS[uit.pagina] && PAGINAS[uit.pagina].toontLeads;
    if (toestand !== 'leeg' || leadsScherm) uit.toestand = toestand;
  }

  // Booleans over de eigen inrichting. Geen waarden, alleen aan of uit.
  if (typeof r.onboardingKlaar === 'boolean') uit.onboardingKlaar = r.onboardingKlaar;
  if (typeof r.agendaGekoppeld === 'boolean') uit.agendaGekoppeld = r.agendaGekoppeld;
  if (typeof r.whatsappKlaar === 'boolean') uit.whatsappKlaar = r.whatsappKlaar;

  return uit;
}

/* De promptregels. Kort gehouden: dit gaat bij ELKE vraag mee, dus elke zin
   die niets toevoegt kost bij elk bericht opnieuw tokens.

   Geen blok als er niets bruikbaars is -- dan liever helemaal zwijgen dan een
   kopje "Waar de gebruiker staat" met niets eronder. */
function render(ui) {
  if (!ui || !ui.pagina) return '';
  const def = PAGINAS[ui.pagina];
  if (!def) return '';

  const regels = [
    '── Waar de gebruiker nu staat ──',
    `Scherm: ${def.naam}. ${def.wat}`,
  ];

  if (ui.sectie) regels.push(`Onderdeel: ${ui.sectie}.`);

  if (ui.toestand === 'leeg') {
    regels.push('Dit scherm is nu leeg. Leg uit wat er komt te staan en wat de gebruiker daarvoor moet doen.');
  } else if (ui.toestand === 'fout') {
    regels.push('Er staat een foutmelding op dit scherm. Help de gebruiker die op te lossen.');
  }

  if (ui.onboardingKlaar === false) {
    regels.push('De inrichting is nog niet af.');
  }
  if (ui.agendaGekoppeld === false) {
    regels.push('Google Agenda is niet gekoppeld, dus er worden geen afspraken ingepland.');
  }
  if (ui.whatsappKlaar === false) {
    regels.push('De WhatsApp-berichten van deze klant zijn nog niet goedgekeurd in zijn taal.');
  }

  /* De belangrijkste regel van het blok. Zonder deze aanwijzing beantwoordt het
     model "wat betekent dit?" alsnog met "waar doel je op?", omdat het de
     context wel KRIJGT maar niet doorheeft dat het die mag gebruiken om het
     aanwijzend voornaamwoord op te lossen. */
  regels.push(
    'Verwijst de gebruiker naar "dit", "hier" of "deze pagina", dan bedoelt hij dit scherm. ' +
    'Vraag niet waar hij op doelt; antwoord meteen over dit scherm.'
  );

  return regels.join('\n');
}

module.exports = { PAGINAS, sanitize, render };
