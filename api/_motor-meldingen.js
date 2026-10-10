'use strict';
/*
 * Teksten die een websitebezoeker van een MOTORdealer te zien krijgt, in vier
 * talen. Voor motor bestond er alleen Nederlands (en daar stond bij een
 * verdwenen voertuig nog "wagen"); een Franstalige bezoeker las dus
 * Nederlands, en een Nederlandstalige een autowoord bij een motor.
 *
 * Auto gebruikt dit NIET: de autoteksten in api/_webboeking.js en
 * api/_assistent.js blijven letterlijk zoals ze waren. Deze module wordt alleen
 * geraadpleegd als het segment motor is.
 */

const TALEN = ['nl', 'fr', 'en', 'de'];

const TEKSTEN = Object.freeze({
  geen_contact: {
    nl: 'Laat eerst een e-mailadres of telefoonnummer achter.',
    fr: 'Laissez d’abord une adresse e-mail ou un numéro de téléphone.',
    en: 'Please leave an email address or phone number first.',
    de: 'Bitte hinterlassen Sie zuerst eine E-Mail-Adresse oder Telefonnummer.',
  },
  bad_time: {
    nl: 'Ongeldig tijdstip.',
    fr: 'Horaire non valide.',
    en: 'Invalid time.',
    de: 'Ungültige Uhrzeit.',
  },
  slot_intussen: {
    nl: 'Dat moment is intussen niet meer vrij. Kies een ander.',
    fr: 'Ce créneau n’est entre-temps plus libre. Choisissez-en un autre.',
    en: 'That time is no longer available. Please pick another.',
    de: 'Dieser Termin ist inzwischen nicht mehr frei. Bitte wählen Sie einen anderen.',
  },
  slot_net: {
    nl: 'Dat moment wordt net door iemand anders geboekt. Kies een ander.',
    fr: 'Ce créneau vient d’être réservé par quelqu’un d’autre. Choisissez-en un autre.',
    en: 'Someone else is booking that time right now. Please pick another.',
    de: 'Dieser Termin wird gerade von jemand anderem gebucht. Bitte wählen Sie einen anderen.',
  },
  voertuig_weg: {
    nl: 'Deze motor staat niet meer in het aanbod.',
    fr: 'Cette moto ne figure plus dans l’offre.',
    en: 'This motorcycle is no longer in our stock.',
    de: 'Dieses Motorrad ist nicht mehr im Angebot.',
  },
  heeft_afspraak: {
    nl: 'Je hebt al een afspraak staan; het team neemt contact op.',
    fr: 'Vous avez déjà un rendez-vous ; l’équipe vous contactera.',
    en: 'You already have an appointment; the team will be in touch.',
    de: 'Sie haben bereits einen Termin; das Team meldet sich bei Ihnen.',
  },
  voertuig_niet_beschikbaar: {
    nl: 'Deze motor kan nu geen testrit meer krijgen. Het team stelt een alternatief voor.',
    fr: 'Cette moto ne peut plus faire l’objet d’un essai routier. L’équipe vous proposera une alternative.',
    en: 'This motorcycle can no longer be booked for a test ride. The team will suggest an alternative.',
    de: 'Für dieses Motorrad ist keine Probefahrt mehr möglich. Das Team schlägt Ihnen eine Alternative vor.',
  },
  opslaan: {
    nl: 'De afspraak kon niet bewaard worden. Probeer het zo opnieuw.',
    fr: 'Le rendez-vous n’a pas pu être enregistré. Réessayez dans un instant.',
    en: 'The appointment could not be saved. Please try again in a moment.',
    de: 'Der Termin konnte nicht gespeichert werden. Bitte versuchen Sie es gleich noch einmal.',
  },
  status_veranderd: {
    nl: 'Die motor is net van status veranderd. Ik laat het team je de actuele stand en vergelijkbare opties bezorgen.',
    fr: 'Le statut de cette moto vient de changer. Je demande à l’équipe de vous donner la situation actuelle et des options comparables.',
    en: 'That motorcycle has just changed status. I will have the team send you the current situation and comparable options.',
    de: 'Der Status dieses Motorrads hat sich gerade geändert. Ich lasse das Team Ihnen den aktuellen Stand und vergleichbare Optionen zukommen.',
  },
  nakijken: {
    nl: 'Ik laat het team de actuele gegevens van deze motor even nakijken, dan ben je zeker.',
    fr: 'Je demande à l’équipe de vérifier les données actuelles de cette moto, pour que vous soyez sûr.',
    en: 'I will have the team double-check the current details of this motorcycle, so you can be sure.',
    de: 'Ich lasse das Team die aktuellen Daten dieses Motorrads prüfen, damit Sie sicher sein können.',
  },
});

/** De tekst in de taal van de bezoeker; onbekende taal = Nederlands, onbekende sleutel = ''. */
function melding(sleutel, taal) {
  const rij = TEKSTEN[sleutel];
  if (!rij) return '';
  const t = String(taal || 'nl').slice(0, 2).toLowerCase();
  return rij[TALEN.indexOf(t) !== -1 ? t : 'nl'];
}

module.exports = { TEKSTEN, TALEN, melding };
