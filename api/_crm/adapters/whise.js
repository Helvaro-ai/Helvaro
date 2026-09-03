'use strict';
/*
 * Whise -- NOG NIET GESCHREVEN, en dat is een keuze.
 *
 * -- Waarom hier geen code staat ---------------------------------------------
 * api/_video-adapters.js legt in zijn kop uit waarom de runway-adapter er niet
 * is: "een adapter schrijven op een herinnering aan een API geeft een endpoint
 * dat er goed uitziet, een auth-header die net anders heet, en een pollvorm die
 * niet bestaat. Dat faalt niet bij het schrijven maar bij de eerste echte
 * klant." Datzelfde geldt hier, en sterker, want dit schrijft naar het CRM van
 * een makelaarskantoor.
 *
 * Voor HubSpot, Pipedrive en Salesforce is de vorm na te trekken in openbare
 * documentatie. Voor Omnicasa is het TRANSPORT na te trekken (adres, pad,
 * sleutel-in-pad) en zijn alleen de veldnamen een aanname, die in één object
 * staat. Voor Whise is geen van beide gelukt: hun documentatie gaat alleen naar
 * partners met een sleutel.
 *
 * -- Wat er WEL is uitgezocht ------------------------------------------------
 * Uit de open-source PHP-client fw4-bvba/whise-api, die Whise zelf noemt:
 *   - authenticatie gaat via een access token dat je ophaalt met een
 *     gebruikersnaam en wachtwoord; in de client heet dat
 *     requestAccessToken(username, password), en het gaat als POST naar het
 *     pad 'token'.
 *   - het token wordt daarna meegestuurd bij elke aanroep.
 *   - er is een contacts-endpoint met een upsert-operatie (contacts/upsert) --
 *     dus ontdubbelen doet Whise zelf, wat prettiger is dan bij de rest.
 *   - er zijn daarnaast estates, calendars en activities.
 *   - onder de token-laag zit nog een tweede stap: admin/clients/token, omdat
 *     een partneraccount meerdere kantoren kan bedienen. Welke van de twee
 *     tokens waar hoort, is niet uit de client af te lezen.
 *
 * -- Wat er ontbreekt om dit af te maken -------------------------------------
 *   1. De basis-URL. Nergens in een openbare bron; de PHP-client zet hem in een
 *      adapterklasse die niet openbaar staat.
 *   2. De vorm van de token-body: welke velden, en of het clientId + secret is
 *      of username + password (de client suggereert het tweede).
 *   3. De vorm van contacts/upsert: veldnamen, of het genest is onder een
 *      wrapper, en welk veld de ontdubbeling stuurt (telefoon? e-mail? -- en
 *      Helvaro heeft alleen telefoon).
 *   4. Hoe een kantoor (ClientId/OfficeId) wordt meegegeven.
 *
 * Punt 1 tot en met 4 staan in de documentatie die een klant met een
 * Whise-account zelf kan opvragen. Eén klant met een sleutel en die PDF is
 * genoeg om dit bestand af te maken: de rest van de koppeling -- de neutrale
 * vorm, de opslag, het ontdubbelen, het scherm, de tests -- staat er al en
 * verandert niet.
 */

const { CrmError } = require('../http');

const NAAM = 'Whise';

const ONTBREEKT = [
  'de basis-URL van de API',
  'de velden van het token-verzoek',
  'de velden van contacts/upsert',
  'hoe het kantoor (ClientId) wordt meegegeven',
];

function weiger() {
  throw new CrmError(
    'De Whise-koppeling is nog niet beschikbaar. We hebben van Whise nog nodig: '
    + ONTBREEKT.join(', ') + '. Heb je een Whise-account met API-documentatie? '
    + 'Stuur die door, dan zetten we de koppeling aan.',
    { code: 'nog_niet_beschikbaar' },
  );
}

/* Geen invoervelden: een scherm dat om een sleutel vraagt die nergens heen gaat
   is erger dan een scherm dat zegt dat het er nog niet is. */
const velden = [];

async function test() { return weiger(); }
async function duwLead() { return weiger(); }
async function duwNotitie() { return weiger(); }

module.exports = {
  naam: 'whise',
  label: NAAM,
  velden,
  beschikbaar: false,
  ontbreekt: ONTBREEKT,
  test, duwLead, duwNotitie,
};
