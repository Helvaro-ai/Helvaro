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

/* ── Kleur uit de advertentielink ────────────────────────────────────────────
 * AutoScout24 levert in het verkopersprofiel geen kleur, maar de link naar de
 * advertentie draagt vaak wel een kleurwoord in de slug:
 *   .../aanbod/mercedes-benz-eqa-250-amg-line-electrique-blanc-<uuid>
 * Dat woord is in de taal van de advertentie (fr/nl/de/en/it). Hier wordt het
 * Nederlands: wit, zwart, grijs, ...
 *
 * Bewust zuinig: liever geen kleur dan een verkeerde.
 *   - alleen HELE slugwoorden (nooit een stuk van "bluehdi" of "rouge-line")
 *   - alleen NA de merk- en modelwoorden aan het begin van de slug
 *   - precies EEN verschillend kleurwoord; twee kleuren (tweekleurig, of een
 *     uitvoering die "Black Edition" heet naast een echte kleur) = niets
 *   - een kleurwoord naast een uitvoeringswoord ("black edition", "red line",
 *     "blue motion") is een uitvoering, geen kleur: dan ook niets
 * Het resultaat is een AFGELEIDE kleur: de sync zet hem alleen op een wagen
 * die nog geen kleur heeft en overschrijft nooit wat de dealer zelf invulde
 * (zie verzoenAlles in api/_voorraad-sync.js). */
const KLEUREN = Object.freeze({
  wit: ['wit', 'blanc', 'blanche', 'weiss', 'weis', 'white', 'bianco', 'bianca'],
  zwart: ['zwart', 'noir', 'noire', 'schwarz', 'black', 'nero', 'nera'],
  grijs: ['grijs', 'gris', 'grise', 'grau', 'grey', 'gray', 'grigio', 'grigia'],
  antraciet: ['antraciet', 'anthracite', 'anthrazit', 'antracite'],
  zilver: ['zilver', 'argent', 'argente', 'silber', 'silver', 'argento'],
  blauw: ['blauw', 'bleu', 'bleue', 'blau', 'blue', 'blu'],
  rood: ['rood', 'rouge', 'rot', 'red', 'rosso', 'rossa'],
  groen: ['groen', 'vert', 'verte', 'gruen', 'grun', 'green', 'verde'],
  geel: ['geel', 'jaune', 'gelb', 'yellow', 'giallo', 'gialla'],
  oranje: ['oranje', 'orange', 'arancione', 'arancio'],
  bruin: ['bruin', 'brun', 'brune', 'marron', 'braun', 'brown', 'marrone'],
  beige: ['beige'],
  paars: ['paars', 'violet', 'violette', 'lila', 'purple', 'viola'],
  roze: ['roze', 'rose', 'rosa', 'pink'],
  goud: ['goud', 'dore', 'gold', 'oro'],
  bordeaux: ['bordeaux'],
  turquoise: ['turquoise', 'turchese'],
});
const KLEUR_WOORD = (() => {
  const m = new Map();
  for (const [nl, woorden] of Object.entries(KLEUREN)) for (const w of woorden) m.set(w, nl);
  return m;
})();
/* Woorden waar een kleurwoord een uitvoering van maakt, geen kleur. */
const UITVOERING_BUUR = new Set(['edition', 'line', 'pack', 'package', 'design', 'look', 'series', 'serie', 'collection', 'label', 'motion', 'special', 'limited', 'efficiency']);
const SLUG_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function slugWoorden(x) {
  return String(x == null ? '' : x).toLowerCase().replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
}

/**
 * De kleur (Nederlands woord) uit een advertentielink, of undefined.
 * @param {string} link   de advertentie-URL
 * @param {string} merk   merk van de wagen (de slug begint daarmee)
 * @param {string} model  model van de wagen
 */
function kleurUitLink(link, merk, model) {
  let pad;
  try { pad = new URL(String(link || '')).pathname; } catch { return undefined; }
  const segment = pad.split('/').filter(Boolean).pop() || '';
  let slug;
  try { slug = decodeURIComponent(segment); } catch { slug = segment; }
  slug = slug.replace(SLUG_UUID, ' ');
  const woorden = slugWoorden(slug);
  const merkWoorden = slugWoorden(merk);
  if (!woorden.length || !merkWoorden.length) return undefined;

  /* De slug moet beginnen met het merk, anders is hij van een vorm die we niet kennen. */
  const eigen = new Set(merkWoorden.concat(slugWoorden(model)));
  if (!merkWoorden.every((w, i) => woorden[i] === w)) return undefined;
  let start = merkWoorden.length;
  while (start < woorden.length && eigen.has(woorden[start])) start++;

  const gevonden = new Set();
  for (let i = start; i < woorden.length; i++) {
    const nl = KLEUR_WOORD.get(woorden[i]);
    if (!nl) continue;
    const buren = [woorden[i - 1], woorden[i + 1]];
    if (buren.some((b) => b && UITVOERING_BUUR.has(b))) return undefined;
    gevonden.add(nl);
  }
  return gevonden.size === 1 ? Array.from(gevonden)[0] : undefined;
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
const VERSIE = 2;

module.exports = { VERSIE, BRANDSTOF, TRANSMISSIE, KLEUREN, brandstof, transmissie, kleurUitLink, voertuig };
