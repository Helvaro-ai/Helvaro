'use strict';
/*
 * Brandstof en transmissie in Helvaro's eigen woorden.
 *
 * Elk platform levert zijn eigen taal: AutoScout24 geeft op een Franstalig
 * profiel "Electrique" en "Boîte automatique", mobile.de "ELECTRICITY", een
 * DMS-feed "Benzin" of "petrol". Het bewerkvenster, de filters op de website
 * en de assistent kennen alleen de vaste waarden hieronder (dezelfde als de
 * keuzelijst in het voertuigformulier). Zonder deze stap stond de keuzelijst
 * leeg bij elke gesynchroniseerde wagen.
 *
 * Herkend = de vaste waarde. Niet herkend = de oorspronkelijke tekst blijft
 * staan: liever een onbekend woord dan een verzonnen brandstof.
 *
 * Geen route: onderstreepje voorop.
 */

const BRANDSTOF = Object.freeze(['benzine', 'diesel', 'hybride', 'plug-in hybride', 'elektrisch', 'lpg', 'cng', 'waterstof', 'overig']);
const TRANSMISSIE = Object.freeze(['automaat', 'handgeschakeld']);

function plat(x) {
  return String(x == null ? '' : x).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** @returns {string|undefined} */
function brandstof(x) {
  const t = plat(x);
  if (!t) return undefined;
  if (BRANDSTOF.indexOf(t) !== -1) return t;
  const elektrisch = /elektr|electr|\bev\b|\bbev\b/.test(t);
  const benzine = /benzin|gasoline|petrol|essence|super\b|\bbenz/.test(t);
  const diesel = /diesel/.test(t);
  if (/plug|phev|rechargeable|oplaadbaar/.test(t)) return 'plug-in hybride';
  if (/hybri/.test(t) || (elektrisch && (benzine || diesel))) return 'hybride';
  if (elektrisch) return 'elektrisch';
  if (diesel) return 'diesel';
  if (benzine) return 'benzine';
  if (/\blpg\b|autogas|gpl/.test(t)) return 'lpg';
  if (/\bcng\b|aardgas|erdgas|gaz naturel|\bgnc\b/.test(t)) return 'cng';
  if (/waterstof|hydrog|wasserstoff|hydrogene/.test(t)) return 'waterstof';
  return String(x).trim().toLowerCase().slice(0, 30);
}

/** @returns {string|undefined} */
function transmissie(x) {
  const t = plat(x);
  if (!t) return undefined;
  if (TRANSMISSIE.indexOf(t) !== -1) return t;
  if (/automa|automatik|dsg|tiptronic|cvt|s-?tronic|semi/.test(t)) return 'automaat';
  if (/manu|handgesch|schalt|\bhand\b|mecanique/.test(t)) return 'handgeschakeld';
  return String(x).trim().toLowerCase().slice(0, 30);
}

/** Een genormaliseerde bronregel; de rest blijft ongemoeid. */
function voertuig(v) {
  if (!v || typeof v !== 'object') return v;
  const uit = Object.assign({}, v);
  if (v.brandstof !== undefined) uit.brandstof = brandstof(v.brandstof);
  if (v.transmissie !== undefined) uit.transmissie = transmissie(v.transmissie);
  return uit;
}

/* Ophogen als de regels hierboven veranderen: de volgende sync vergelijkt dan
   elke wagen opnieuw in plaats van een ongewijzigde bron over te slaan. */
const VERSIE = 1;

module.exports = { VERSIE, BRANDSTOF, TRANSMISSIE, brandstof, transmissie, voertuig };
