'use strict';
/*
 * Het Command Center in de taal van de klant.
 *
 * api/_command.js is een zuivere rekenlaag die zijn zinnen in het Nederlands
 * bouwt: categorienamen ("Zet weer in gang"), redenen ("Was betrokken, maar
 * reageert al 5 dagen niet meer."), de kop van "Je grootste kans vandaag".
 * Voor een Engelstalige dealer stond precies de eerste regel van Faro in het
 * Nederlands. De rekenlaag aanpassen op elk van de honderd plekken waar een
 * zin ontstaat zou de rekenregels door de vertaling heen trekken; daarom komt
 * de vertaling er hier ACHTERAAN, op het eindresultaat:
 *
 *   - vaste zinnen: een tabel nl -> en/fr/de (EXACT, dus een nieuwe zin die
 *     hier nog niet in staat blijft gewoon Nederlands in plaats van kapot);
 *   - zinnen met een getal of naam: een patroon met gaten ({1}, {2});
 *   - Nederlands blijft Nederlands, byte voor byte: deze module raakt het niet.
 */

const VAST = {
  'Hoge waarde': ['High value', 'Valeur élevée', 'Hoher Wert'],
  'Waarde': ['Value', 'Valeur', 'Wert'],
  'Sterk gekwalificeerd': ['Strongly qualified', 'Très qualifié', 'Stark qualifiziert'],
  'Kwalificatie': ['Qualification', 'Qualification', 'Qualifizierung'],
  'Wil snel kopen': ['Wants to buy soon', 'Veut acheter rapidement', 'Will bald kaufen'],
  'Hoge urgentie': ['High urgency', 'Urgence élevée', 'Hohe Dringlichkeit'],
  'Sterke betrokkenheid': ['Highly engaged', 'Très impliqué', 'Stark engagiert'],
  'Recent contact': ['Recent contact', 'Contact récent', 'Kürzlicher Kontakt'],
  'Reageerde in de laatste 24 uur': ['Replied in the last 24 hours', 'A répondu ces dernières 24 heures', 'Hat in den letzten 24 Stunden geantwortet'],
  'Lang stil': ['Silent for a while', 'Silencieux depuis longtemps', 'Lange still'],
  'Afspraak staat al': ['Appointment already set', 'Rendez-vous déjà fixé', 'Termin steht bereits'],
  'Er is al een afspraak geboekt': ['An appointment is already booked', 'Un rendez-vous est déjà réservé', 'Es ist bereits ein Termin gebucht'],
  'Verloren': ['Lost', 'Perdu', 'Verloren'],
  'Deze lead is als verloren gemarkeerd': ['This lead is marked as lost', 'Ce lead est marqué comme perdu', 'Dieser Lead ist als verloren markiert'],
  'Geen telefoonnummer': ['No phone number', 'Pas de numéro de téléphone', 'Keine Telefonnummer'],
  'Opvolgen via WhatsApp is niet mogelijk': ['Following up via WhatsApp isn’t possible', 'Le suivi via WhatsApp n’est pas possible', 'Nachfassen über WhatsApp ist nicht möglich'],
  'Wacht op jou': ['Waiting for you', 'Attend votre réponse', 'Wartet auf Sie'],
  'De AI staat op pauze bij deze lead — zolang jij niet antwoordt, antwoordt niemand.': ['The assistant is paused on this lead — until you reply, nobody does.', 'L’assistant est en pause sur ce lead — tant que vous ne répondez pas, personne ne répond.', 'Der Assistent ist bei diesem Lead pausiert — solange Sie nicht antworten, antwortet niemand.'],
  'Zet weer in gang': ['Get it moving again', 'Relancer la conversation', 'Wieder anstoßen'],
  'Gekwalificeerd en nog in gesprek, maar Faro kreeg de afspraak nog niet rond. Eén bericht zet het weer in gang.': ['Qualified and still in conversation, but Faro hasn’t closed the appointment yet. One message gets it moving again.', 'Qualifié et toujours en conversation, mais Faro n’a pas encore fixé le rendez-vous. Un message suffit pour relancer.', 'Qualifiziert und noch im Gespräch, aber Faro hat den Termin noch nicht abgeschlossen. Eine Nachricht bringt es wieder in Gang.'],
  'Hoge prioriteit': ['High priority', 'Priorité haute', 'Hohe Priorität'],
  'Sterk gekwalificeerde koper met duidelijke intentie, zonder afspraak.': ['Strongly qualified buyer with clear intent, no appointment.', 'Acheteur très qualifié avec une intention claire, sans rendez-vous.', 'Stark qualifizierter Käufer mit klarer Absicht, ohne Termin.'],
  'Dreigt af te koelen': ['At risk of going cold', 'Risque de refroidir', 'Droht abzukühlen'],
  'Afgekoeld': ['Gone cold', 'Refroidi', 'Abgekühlt'],
  'Zelf antwoorden': ['Reply yourself', 'Répondre vous-même', 'Selbst antworten'],
  'De AI staat op pauze bij deze lead.': ['The assistant is paused on this lead.', 'L’assistant est en pause sur ce lead.', 'Der Assistent ist bei diesem Lead pausiert.'],
  'Gesprek bekijken': ['View conversation', 'Voir la conversation', 'Gespräch ansehen'],
  'Geen actie mogelijk': ['No action possible', 'Aucune action possible', 'Keine Aktion möglich'],
  'Geen telefoonnummer om op te volgen.': ['No phone number to follow up on.', 'Pas de numéro de téléphone pour le suivi.', 'Keine Telefonnummer zum Nachfassen.'],
  'Deze lead heeft geen contactgegevens.': ['This lead has no contact details.', 'Ce lead n’a pas de coordonnées.', 'Dieser Lead hat keine Kontaktdaten.'],
  'De AI heeft de afspraak al geboekt.': ['The assistant has already booked the appointment.', 'L’assistant a déjà réservé le rendez-vous.', 'Der Assistent hat den Termin bereits gebucht.'],
  'Opvolgen': ['Follow up', 'Faire le suivi', 'Nachfassen'],
  'Bellen': ['Call', 'Appeler', 'Anrufen'],
  'Deze lead heeft nooit zelf geantwoord, dus de AI mag niet appen.': ['This lead never replied, so the assistant may not message them.', 'Ce lead n’a jamais répondu, l’assistant ne peut donc pas lui écrire.', 'Dieser Lead hat nie geantwortet, daher darf der Assistent nicht schreiben.'],
  'Het 24-uursvenster is gesloten, dus de AI kan niet meer appen.': ['The 24-hour window is closed, so the assistant can no longer message.', 'La fenêtre de 24 heures est fermée, l’assistant ne peut donc plus écrire.', 'Das 24-Stunden-Fenster ist geschlossen, daher kann der Assistent nicht mehr schreiben.'],
  'Naamloze lead': ['Unnamed lead', 'Lead sans nom', 'Namenloser Lead'],
  'onder €300k': ['under €300k', 'moins de 300 k€', 'unter 300 Tsd. €'],
  'boven €500k': ['over €500k', 'plus de 500 k€', 'über 500 Tsd. €'],
};

/* Patronen: [regex op het Nederlands, [en, fr, de]] met {1}, {2}, ... voor de vangsten. */
const PATRONEN = [
  [/^Leadscore (.+)$/, ['Lead score {1}', 'Score du lead {1}', 'Lead-Score {1}']],
  [/^Reageerde op (\d+) van (\d+) berichten$/, ['Replied to {1} of {2} messages', 'A répondu à {1} messages sur {2}', 'Hat auf {1} von {2} Nachrichten geantwortet']],
  [/^(\d+) dagen geen reactie$/, ['{1} days without a reply', '{1} jours sans réponse', '{1} Tage keine Antwort']],
  [/^Was betrokken, maar reageert al (\d+) dagen niet meer\.$/, ['Was engaged, but hasn’t replied for {1} days.', 'Était impliqué, mais ne répond plus depuis {1} jours.', 'War engagiert, antwortet aber seit {1} Tagen nicht mehr.']],
  [/^Bovengemiddeld budget voor jouw portefeuille: (.+)\.$/, ['Above-average budget for your portfolio: {1}.', 'Budget supérieur à la moyenne de votre portefeuille : {1}.', 'Überdurchschnittliches Budget für Ihr Portfolio: {1}.']],
  [/^Gekwalificeerd maar al (\d+) dagen stil\.$/, ['Qualified but silent for {1} days.', 'Qualifié mais silencieux depuis {1} jours.', 'Qualifiziert, aber seit {1} Tagen still.']],
  [/^Eén bericht en de AI pakt het gesprek weer op — venster nog (\d+) uur open\.$/, ['One message and the assistant picks the conversation back up — window still open for {1} hours.', 'Un message et l’assistant reprend la conversation — fenêtre encore ouverte {1} heures.', 'Eine Nachricht und der Assistent nimmt das Gespräch wieder auf — Fenster noch {1} Stunden offen.']],
  [/^(.+)-leads converteren (.+)× beter naar een afspraak dan (.+)-leads\.$/, ['{1} leads convert {2}× better to an appointment than {3} leads.', 'Les leads {1} convertissent {2}× mieux en rendez-vous que les leads {3}.', '{1}-Leads werden {2}× besser zum Termin als {3}-Leads.']],
  [/^De meeste gekwalificeerde leads melden zich tussen (.+) en (.+)\.$/, ['Most qualified leads come in between {1} and {2}.', 'La plupart des leads qualifiés arrivent entre {1} et {2}.', 'Die meisten qualifizierten Leads melden sich zwischen {1} und {2}.']],
  [/^(\d+) van (\d+) gekwalificeerde leads\.$/, ['{1} of {2} qualified leads.', '{1} leads qualifiés sur {2}.', '{1} von {2} qualifizierten Leads.']],
  [/^(\d+) gekwalificeerde leads hebben nog geen afspraak\.$/, ['{1} qualified leads still have no appointment.', '{1} leads qualifiés n’ont pas encore de rendez-vous.', '{1} qualifizierte Leads haben noch keinen Termin.']],
  [/^Samen (.+) aan potentiële pipeline\.$/, ['{1} of potential pipeline in total.', '{1} de pipeline potentielle au total.', 'Zusammen {1} potenzielle Pipeline.']],
  [/^Je reactietijd verbeterde met (\d+)% deze week\.$/, ['Your response time improved by {1}% this week.', 'Votre temps de réponse s’est amélioré de {1} % cette semaine.', 'Ihre Reaktionszeit hat sich diese Woche um {1} % verbessert.']],
  [/^Je reactietijd werd (\d+)% trager deze week\.$/, ['Your response time got {1}% slower this week.', 'Votre temps de réponse a augmenté de {1} % cette semaine.', 'Ihre Reaktionszeit ist diese Woche um {1} % langsamer geworden.']],
  [/^(\d+)s deze week tegenover (\d+)s vorige week\.$/, ['{1}s this week versus {2}s last week.', '{1} s cette semaine contre {2} s la semaine dernière.', '{1} s diese Woche gegenüber {2} s letzte Woche.']],
  [/^Je (.+)-leads boeken het vaakst een afspraak\.$/, ['Your {1} leads book an appointment most often.', 'Vos leads {1} réservent le plus souvent un rendez-vous.', 'Ihre {1}-Leads buchen am häufigsten einen Termin.']],
  [/^(\d+) van (\d+) leads in deze categorie\.$/, ['{1} of {2} leads in this category.', '{1} leads sur {2} dans cette catégorie.', '{1} von {2} Leads in dieser Kategorie.']],
];

const IDX = { en: 0, fr: 1, de: 2 };

function zin(tekst, taal) {
  const i = IDX[taal];
  if (i === undefined) return tekst;
  if (Object.prototype.hasOwnProperty.call(VAST, tekst)) return VAST[tekst][i];
  for (const [re, uit] of PATRONEN) {
    const m = re.exec(tekst);
    if (m) return uit[i].replace(/\{(\d)\}/g, (_, n) => m[Number(n)]);
  }
  return tekst;
}

/** De kop van "Je grootste kans vandaag", uit de losse feiten gebouwd. */
function kop(p, taal) {
  const zonder = {
    en: [`${p.name} is a ${p.budget}-buyer`, `${p.name} is a lead`, 'with urgency "{t}"', 'and a lead score of {s}/10', ', and has no appointment yet.'],
    fr: [`${p.name} est un acheteur à ${p.budget}`, `${p.name} est un lead`, 'avec une urgence « {t} »', 'et un score de lead de {s}/10', ', et n’a pas encore de rendez-vous.'],
    de: [`${p.name} ist ein ${p.budget}-Käufer`, `${p.name} ist ein Lead`, 'mit Dringlichkeit „{t}“', 'und einem Lead-Score von {s}/10', ', und hat noch keinen Termin.'],
  }[taal];
  if (!zonder) return null;
  return [
    p.budget ? zonder[0] : zonder[1],
    p.timing ? zonder[2].replace('{t}', p.timing) : null,
    p.score ? zonder[3].replace('{s}', p.score) : null,
  ].filter(Boolean).join(' ') + (p.booked ? '.' : zonder[4]);
}

function diep(waarde, taal) {
  if (typeof waarde === 'string') return zin(waarde, taal);
  if (Array.isArray(waarde)) return waarde.map((x) => diep(x, taal));
  if (waarde && typeof waarde === 'object') {
    const uit = {};
    for (const k of Object.keys(waarde)) {
      // Namen van mensen, tijdstippen en id's blijven staan; alleen tekstvelden gaan door de tabel.
      uit[k] = (k === 'name' || k === 'id' || k === 'phone' || k === 'lineParts') ? waarde[k] : diep(waarde[k], taal);
    }
    return uit;
  }
  return waarde;
}

/** Vertaal een Command Center-resultaat. Nederlands (en onbekend) blijft ongewijzigd. */
function vertaal(resultaat, taal) {
  if (!resultaat || !IDX.hasOwnProperty(taal)) return resultaat;
  const uit = diep(resultaat, taal);
  if (uit && uit.briefing && uit.briefing.top && resultaat.briefing && resultaat.briefing.top && resultaat.briefing.top.lineParts) {
    uit.briefing.top.line = kop(resultaat.briefing.top.lineParts, taal) || resultaat.briefing.top.line;
  }
  return uit;
}

module.exports = { vertaal, zin, kop, VAST, PATRONEN };
