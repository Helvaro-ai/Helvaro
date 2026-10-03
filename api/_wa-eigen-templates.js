'use strict';
/* ── Helvaro's sjablonen op het EIGEN nummer van een klant ─────────────────
   Een WhatsApp-sjabloon hoort bij een WABA. Helvaro's goedgekeurde set
   (followup_24h, afspraakbevestiging, ...) staat op Helvaro's eigen WABA. Een
   klant die via Embedded Signup zijn eigen nummer koppelt, zendt vanaf ZIJN
   WABA, en daar stond tot 2026-10-03 geen enkel sjabloon. Gevolg: elk bericht
   buiten het 24u-venster faalde met Meta 132001 ("template name does not exist
   in the translation"), ook al stond het sjabloon bij Helvaro op goedgekeurd.

   Dit dient de hele set in op de WABA van de klant, met het token van de
   klant. Idempotent (dienIn slaat over wat al bestaat, in welke status ook)
   en hooguit eens per zes uur per WABA, zodat een reeks mislukte verzendingen
   Meta niet blijft bestoken. Meta keurt utility-sjablonen meestal binnen
   minuten tot een paar uur goed. */

const _teksten = require('./_wa-template-teksten');
const _lock = require('./_lock');

const ZES_UUR_MS = 6 * 60 * 60 * 1000;

/**
 * @param {{ wabaId: string, token: string }} o
 * @returns {Promise<{ ingediend: number, bestond: number, mislukt: number, overgeslagen?: boolean }>}
 */
async function zorgVoorSjablonen({ wabaId, token }) {
  const waba = String(wabaId || '').trim();
  if (!/^[0-9]{5,25}$/.test(waba) || !token) {
    return { ingediend: 0, bestond: 0, mislukt: 0, overgeslagen: true };
  }
  const eerste = await _lock.eenmalig(`wa-sjablonen:${waba}`, ZES_UUR_MS);
  if (!eerste) return { ingediend: 0, bestond: 0, mislukt: 0, overgeslagen: true };

  const uit = await _teksten.dienIn({ wabaId: waba, token, commit: true });
  const r = uit.resultaten || [];
  const telling = {
    ingediend: r.filter((x) => x.action === 'created').length,
    bestond: r.filter((x) => x.action === 'skipped').length,
    mislukt: r.filter((x) => x.action === 'failed').length,
  };
  console.log('[wa-sjablonen] WABA', waba, '-', JSON.stringify(telling));
  if (telling.mislukt) {
    const eerste = r.find((x) => x.action === 'failed');
    console.warn('[wa-sjablonen] eerste fout:', eerste && eerste.name, eerste && eerste.language, eerste && eerste.error);
  }
  return telling;
}

module.exports = { zorgVoorSjablonen };
