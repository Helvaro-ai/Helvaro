'use strict';
/*
 * Eén kenmerk per binnenkomend bericht, op elke logregel (audit L-5).
 *
 * "Wat is er met dit bericht gebeurd?" was loggraafwerk: de webhook, de AI, de
 * Airtable-schrijf en de verzending loggen elk vrije tekst, door elkaar met
 * andere gesprekken op dezelfde instantie. Nu krijgt elke verwerking een kort
 * kenmerk (bv. [wa-3f9c1a]) en staat dat automatisch vóór ELKE console-regel
 * die tijdens die verwerking geschreven wordt -- ook in modules die er niets
 * van weten (_ai, _vehicles, _afspraken, ...). Zoeken op dat kenmerk in de
 * Vercel-logs geeft het hele verhaal van één bericht.
 *
 * Hoe: AsyncLocalStorage draagt het kenmerk mee door elke await, timer en
 * callback van die verwerking. console.log/info/warn/error worden één keer
 * omwikkeld; buiten een verwerking (geen kenmerk) verandert er niets.
 *
 * Het kenmerk is afgeleid van het bericht-id (of willekeurig), nooit van een
 * telefoonnummer of naam: het staat in logs en mag dus niets over de klant
 * verraden.
 */

const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');

const opslag = new AsyncLocalStorage();
let geinstalleerd = false;

function installeer() {
  if (geinstalleerd) return;
  geinstalleerd = true;
  for (const niveau of ['log', 'info', 'warn', 'error']) {
    const origineel = console[niveau].bind(console);
    console[niveau] = function (...args) {
      const s = opslag.getStore();
      if (s && s.id) {
        if (typeof args[0] === 'string') args[0] = `[${s.id}] ${args[0]}`;
        else args.unshift(`[${s.id}]`);
      }
      return origineel(...args);
    };
  }
}

/* Kort, stabiel voor hetzelfde bericht (een herbezorging krijgt hetzelfde
   kenmerk -- handig om dubbels te zien), en zonder persoonsgegevens. */
function maakId(soort, bron) {
  const basis = bron ? String(bron) : crypto.randomBytes(8).toString('hex');
  return `${soort}-${crypto.createHash('sha256').update(basis).digest('hex').slice(0, 6)}`;
}

/** Voert fn uit met dit kenmerk op elke logregel. Geeft fn's resultaat terug. */
function met(id, fn) {
  installeer();
  return opslag.run({ id }, fn);
}

function huidig() {
  const s = opslag.getStore();
  return s ? s.id : '';
}

module.exports = { met, maakId, huidig };
