'use strict';
/*
 * De eigenaar waarschuwen als de AI-provider geweigerd wordt omdat het saldo op
 * is ("Your credit balance is too low to access the Anthropic API").
 *
 * Live gevonden op 2 oktober: elke Faro-vraag gaf "Er ging iets mis", en de
 * reden (saldo op) stond nergens zichtbaar. Hetzelfde saldo dekt ook de
 * WhatsApp-assistent: een leeg saldo betekent dat elke lead die schrijft
 * zonder antwoord blijft -- en niemand merkt het tot een klant belt. Dit mailt
 * daarom zodra het gebeurt, hoogstens één keer per uur.
 *
 * Faalt nooit: een mislukte waarschuwing mag het verzoek dat al mislukt is niet
 * ook nog laten ontsporen.
 */

const BETAALFOUT = /credit balance|billing|insufficient[_ ]quota|exceeded your current quota|payment required|purchase credits|plans & billing/i;
const UUR = 60 * 60 * 1000;
let _laatst = 0;

/** Is dit een "saldo op"-melding van een AI-provider? */
function isBetaalfout(boodschap, status) {
  return status === 402 || BETAALFOUT.test(String(boodschap || ''));
}

/**
 * @param {string} bron  waar het misging ("Anthropic via de WhatsApp-assistent", "Faro")
 * @param {string} boodschap  wat de provider zei (alleen in de mail aan de eigenaar)
 * @param {{ nu?: number, stuur?: Function }} [opties]  alleen voor tests
 * @returns {Promise<boolean>} true als er een mail is verstuurd
 */
async function meldBetaalfout(bron, boodschap, opties = {}) {
  try {
    if (!isBetaalfout(boodschap)) return false;
    const nu = opties.nu || Date.now();
    if (nu - _laatst < UUR) return false;                 // per instantie, ook zonder Redis
    const lock = require('./_lock');
    if (!(await lock.eenmalig('ai-saldo-alarm', UUR))) return false;   // en over instanties heen
    _laatst = nu;
    const aan = process.env.NOTIFY_EMAIL || process.env.OPS_EMAIL || 'hello@helvaro.pro';
    const stuur = opties.stuur || require('./_mailer').sendMail;
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await stuur({
      to: aan,
      subject: '[KRITIEK] AI-saldo op: de assistent en Faro kunnen niet meer antwoorden',
      html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:20px">
        <h2 style="color:#dc2626;margin:0 0 12px">Het AI-saldo is op</h2>
        <p>De AI-provider weigert verzoeken omdat het saldo te laag is. Zolang dat zo blijft:</p>
        <ul><li>krijgen leads die op WhatsApp schrijven <strong>geen antwoord</strong> van de assistent;</li>
            <li>werkt Faro niet ("Er ging iets mis");</li>
            <li>mislukken beeld- en voertuiganalyses.</li></ul>
        <p style="background:#fef2f2;padding:12px;border-radius:8px;color:#b91c1c"><strong>Actie:</strong> open <a href="https://console.anthropic.com/settings/billing">console.anthropic.com → Plans &amp; Billing</a> en voeg saldo toe (of zet automatisch bijvullen aan).</p>
        <p style="color:#666;font-size:13px">Bron: ${esc(bron)}<br>Melding van de provider: ${esc(String(boodschap).slice(0, 240))}</p>
        <p style="color:#666;font-size:13px">Je krijgt deze mail hoogstens één keer per uur.</p></div>`,
    });
    return true;
  } catch (e) {
    console.warn('[ai-alarm] waarschuwing versturen mislukte:', e && e.message);
    return false;
  }
}

function _reset() { _laatst = 0; }

module.exports = { meldBetaalfout, isBetaalfout, _reset };
