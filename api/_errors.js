'use strict';
/*
 * Eén foutentaxonomie, in plaats van elke route zijn eigen `{ error: '...' }`.
 *
 * ── Waarom dit bestaat ────────────────────────────────────────────────────────
 * Elke route in api/ ving fouten al netjes af (geen stack trace lekt naar de
 * klant -- dat klopte al overal), maar met 8 routes en tientallen losse catch-
 * blokken had niemand een gedeeld woord voor "dit is een auth-fout" versus "dit
 * is een validatiefout" versus "dit is de betaalprovider die vastzit". Zonder
 * dat woord kan een monitoring-tool, een dashboard-paneel of een mens die de
 * logs leest nooit in één oogopslag zien HOEVEEL van de fouten van vandaag een
 * boekingsfout waren tegenover een integratiestoring.
 *
 * ── Wat dit bestand WEL doet ──────────────────────────────────────────────────
 * Eén klasse per categorie, met een vaste klant-veilige boodschap en een HTTP-
 * status die bij die categorie hoort. `.voorKlant()` geeft precies wat een
 * route naar `res.json()` mag sturen -- nooit `err.message` van een onverwachte
 * fout (die kan een tabelnaam, een interne URL of een deel van een stack trace
 * bevatten), wel de eigen boodschap van een HelvaroError.
 *
 * ── Wat dit bestand NIET doet ─────────────────────────────────────────────────
 * Niets vangen. Dit definieert alleen de klassen en een kleine helper om een
 * ONBEKENDE fout in te pakken; ELKE catch-blok in een route blijft zelf
 * beslissen wat hij vangt en wat hij ermee doet. Een route die dit bestand
 * nooit importeert blijft precies zo werken als vandaag.
 *
 * ── Geen route ────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

/** De negen categorieën uit de brief, met hun HTTP-status en klant-boodschap. */
const CATEGORIEEN = Object.freeze({
  AUTH:           { status: 401, boodschap: 'Log opnieuw in om door te gaan.' },
  AUTHORIZATION:  { status: 403, boodschap: 'Je hebt geen toegang tot dit onderdeel.' },
  VALIDATION:     { status: 400, boodschap: 'Die invoer klopt niet.' },
  INTEGRATION:    { status: 502, boodschap: 'Een gekoppelde dienst is momenteel niet bereikbaar. Probeer het straks opnieuw.' },
  BOOKING:        { status: 409, boodschap: 'Die afspraak kon niet worden vastgelegd. Probeer een ander moment.' },
  PAYMENT:        { status: 402, boodschap: 'Er ging iets mis bij het betalen. Probeer het opnieuw of neem contact op.' },
  GENERATION:     { status: 502, boodschap: 'Het genereren is niet gelukt. Probeer het opnieuw.' },
  DATABASE:       { status: 500, boodschap: 'Er ging iets mis aan onze kant. Probeer het straks opnieuw.' },
  INTERNAL:       { status: 500, boodschap: 'Er ging iets mis aan onze kant. Probeer het straks opnieuw.' },
});

/**
 * Eén Helvaro-fout: een categorie, een klant-veilige boodschap, en optioneel
 * een machine-leesbare `code` (bv. 'slot_conflict') en `details` voor de LOGS
 * -- nooit voor de klant. `oorzaak` is de onderliggende fout (Error of
 * onbekend), bewaard voor console.error, nooit voor `.voorKlant()`.
 */
class HelvaroError extends Error {
  constructor(categorie, opts = {}) {
    const info = CATEGORIEEN[categorie] || CATEGORIEEN.INTERNAL;
    const boodschap = String(opts.boodschap || info.boodschap);
    super(boodschap);
    this.name = 'HelvaroError';
    this.categorie = CATEGORIEEN[categorie] ? categorie : 'INTERNAL';
    this.status = Number.isInteger(opts.status) ? opts.status : info.status;
    this.code = opts.code ? String(opts.code) : undefined;
    this.details = opts.details;
    this.oorzaak = opts.oorzaak;
  }

  /** Precies wat een route naar res.status(this.status).json(...) mag sturen. */
  voorKlant() {
    const uit = { error: this.message };
    if (this.code) uit.code = this.code;
    return uit;
  }

  /** Eén regel voor console.error -- inclusief wat de klant NIET te zien krijgt. */
  voorLog() {
    const oorzaak = this.oorzaak && this.oorzaak.message ? this.oorzaak.message : this.oorzaak;
    return `[${this.categorie}]${this.code ? ' ' + this.code : ''} ${this.message}`
      + (oorzaak ? ` -- oorzaak: ${oorzaak}` : '')
      + (this.details ? ` -- details: ${JSON.stringify(this.details).slice(0, 300)}` : '');
  }
}

/** Eén korte fabrieksfunctie per categorie: errors.validation('...', {...}). */
function maakFabriek(categorie) {
  return (boodschap, opts = {}) => new HelvaroError(categorie, { ...opts, boodschap });
}

/**
 * Een ONBEKENDE fout (iets dat niet zelf al een HelvaroError is) inpakken tot
 * een veilige INTERNAL/DATABASE-fout, zodat een catch-blok altijd hetzelfde
 * kan doen: loggen met .voorLog(), antwoorden met .voorKlant(). Is `err` al
 * een HelvaroError, dan komt hij ongewijzigd terug -- dubbel inpakken zou de
 * eigen categorie en boodschap weggooien.
 */
function inpakken(err, categorie = 'INTERNAL') {
  if (err instanceof HelvaroError) return err;
  return new HelvaroError(categorie, { oorzaak: err });
}

module.exports = {
  HelvaroError,
  CATEGORIEEN,
  inpakken,
  auth:          maakFabriek('AUTH'),
  authorization: maakFabriek('AUTHORIZATION'),
  validation:    maakFabriek('VALIDATION'),
  integration:   maakFabriek('INTEGRATION'),
  booking:       maakFabriek('BOOKING'),
  payment:       maakFabriek('PAYMENT'),
  generation:    maakFabriek('GENERATION'),
  database:      maakFabriek('DATABASE'),
  internal:      maakFabriek('INTERNAL'),
};
