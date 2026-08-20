'use strict';
/*
 * Schemavalidatie voor gestructureerde modelantwoorden.
 *
 * -- Waarom niet Zod ----------------------------------------------------------
 * Zod staat wel in node_modules (versie 4.1.11), maar NIET in package.json:
 * hij komt mee als afhankelijkheid van @clerk/backend. Daarop leunen betekent
 * dat een Clerk-upgrade die zijn interne afhankelijkheid wijzigt hier de
 * validatie sloopt -- en dat merk je pas als een modelantwoord ongecontroleerd
 * doorloopt. Deze codebase heeft geen buildstap en geen eigen deps buiten wat
 * echt nodig is; honderd regels hier is goedkoper dan een verborgen koppeling.
 *
 * -- Wat het moet kunnen -------------------------------------------------------
 * Genoeg om een modelantwoord te vertrouwen: types, verplichte velden, bereik,
 * opsommingen. Geen algemeen validatieframework -- alleen wat de router nodig
 * heeft om te kunnen zeggen "dit antwoord deugt niet, escaleer".
 */

class ValidationError extends Error {
  constructor(message, problemen) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'schema_invalid';
    this.problemen = problemen || [];
  }
}

/* Een veldregel:
     { type: 'number'|'integer'|'string'|'boolean'|'array'|'object',
       verplicht: bool, min, max, enum: [], minLen, maxLen, of: regel } */

function controleerVeld(pad, waarde, regel, problemen) {
  const ontbreekt = waarde === undefined || waarde === null;

  if (ontbreekt) {
    if (regel.verplicht) problemen.push(`${pad}: ontbreekt`);
    return;
  }

  switch (regel.type) {
    case 'number':
    case 'integer': {
      const n = typeof waarde === 'string' && waarde.trim() !== '' ? Number(waarde) : waarde;
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        problemen.push(`${pad}: geen getal (${JSON.stringify(waarde)})`); return;
      }
      if (regel.type === 'integer' && !Number.isInteger(n)) problemen.push(`${pad}: geen geheel getal`);
      if (Number.isFinite(regel.min) && n < regel.min) problemen.push(`${pad}: kleiner dan ${regel.min}`);
      if (Number.isFinite(regel.max) && n > regel.max) problemen.push(`${pad}: groter dan ${regel.max}`);
      break;
    }
    case 'string': {
      if (typeof waarde !== 'string') { problemen.push(`${pad}: geen tekst`); return; }
      if (Number.isFinite(regel.minLen) && waarde.length < regel.minLen) problemen.push(`${pad}: te kort`);
      if (Number.isFinite(regel.maxLen) && waarde.length > regel.maxLen) problemen.push(`${pad}: te lang`);
      if (regel.enum && regel.enum.indexOf(waarde) === -1) {
        problemen.push(`${pad}: "${waarde}" niet toegestaan (${regel.enum.join('|')})`);
      }
      break;
    }
    case 'boolean':
      if (typeof waarde !== 'boolean') problemen.push(`${pad}: geen ja/nee`);
      break;
    case 'array': {
      if (!Array.isArray(waarde)) { problemen.push(`${pad}: geen lijst`); return; }
      if (Number.isFinite(regel.minLen) && waarde.length < regel.minLen) problemen.push(`${pad}: te weinig items`);
      if (Number.isFinite(regel.maxLen) && waarde.length > regel.maxLen) problemen.push(`${pad}: te veel items`);
      if (regel.of) waarde.forEach((v, i) => controleerVeld(`${pad}[${i}]`, v, regel.of, problemen));
      break;
    }
    case 'object': {
      if (typeof waarde !== 'object' || Array.isArray(waarde)) { problemen.push(`${pad}: geen object`); return; }
      if (regel.velden) {
        for (const [k, r] of Object.entries(regel.velden)) controleerVeld(`${pad}.${k}`, waarde[k], r, problemen);
      }
      break;
    }
    default:
      problemen.push(`${pad}: onbekend type "${regel.type}" in het schema zelf`);
  }
}

/**
 * Valideert een object tegen een schema.
 * @returns {{ ok: boolean, problemen: string[], waarde: object }}
 */
function valideer(waarde, schema) {
  const problemen = [];
  if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde)) {
    return { ok: false, problemen: ['antwoord is geen object'], waarde };
  }
  for (const [veld, regel] of Object.entries(schema)) {
    controleerVeld(veld, waarde[veld], regel, problemen);
  }
  return { ok: problemen.length === 0, problemen, waarde };
}

/**
 * Haalt JSON uit een modelantwoord.
 *
 * Modellen zetten er graag ```json omheen, of een zin ervoor ("Hier is de
 * JSON:"). Dat is geen reden om het antwoord weg te gooien -- wel om het
 * netjes eruit te vissen in plaats van JSON.parse op de hele string los te
 * laten en te hopen.
 */
function haalJson(tekst) {
  const s = String(tekst == null ? '' : tekst).trim();
  if (!s) return null;

  // 1. Gewoon proberen.
  try { return JSON.parse(s); } catch (_) { /* door */ }

  // 2. Codeblok eromheen.
  const blok = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (blok) { try { return JSON.parse(blok[1].trim()); } catch (_) { /* door */ } }

  // 3. Het eerste {...} dat in balans is. Niet greedy tot de laatste }, want
  //    een model dat na de JSON nog een zin schrijft met een } erin verpest
  //    dat.
  const start = s.indexOf('{');
  if (start !== -1) {
    let diepte = 0, inString = false, escaped = false;
    for (let i = start; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{') diepte++;
      else if (c === '}') {
        diepte--;
        if (diepte === 0) {
          try { return JSON.parse(s.slice(start, i + 1)); } catch (_) { return null; }
        }
      }
    }
  }
  return null;
}

/**
 * Parse + valideer in een stap. Gooit nooit; de router beslist wat er met een
 * afgekeurd antwoord gebeurt (opnieuw, escaleren, of eerlijk falen).
 */
function parseEnValideer(tekst, schema) {
  const obj = haalJson(tekst);
  if (obj === null) return { ok: false, problemen: ['geen bruikbare JSON in het antwoord'], waarde: null };
  return valideer(obj, schema);
}

module.exports = { valideer, haalJson, parseEnValideer, ValidationError };
