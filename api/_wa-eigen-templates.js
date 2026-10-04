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
   en in rondes van ~25 seconden die elk verdergaan waar de vorige stopte. Meta keurt utility-sjablonen meestal binnen
   minuten tot een paar uur goed. */

const _teksten = require('./_wa-template-teksten');
const _lock = require('./_lock');

/* Een korte vergrendeling: alleen om te voorkomen dat twee tegelijk lopende
   verzoeken dezelfde WABA dubbel bestoken. Eerst stond hier zes uur, en een
   ronde die door de 60-secondengrens werd afgebroken kon daardoor pas na zes uur
   verder. Nu gaat elke ronde door waar de vorige ophield. */
const SLOT_MS = 30 * 1000;
const RONDE_BUDGET_MS = 25 * 1000;

/**
 * @param {{ wabaId: string, token: string }} o
 * @returns {Promise<{ ingediend: number, bestond: number, mislukt: number, overgeslagen?: boolean }>}
 */
async function zorgVoorSjablonen({ wabaId, token }) {
  const waba = String(wabaId || '').trim();
  if (!/^[0-9]{5,25}$/.test(waba) || !token) {
    return { ingediend: 0, bestond: 0, mislukt: 0, overgeslagen: true };
  }
  const eerste = await _lock.eenmalig(`wa-sjablonen-ronde:${waba}`, SLOT_MS);
  if (!eerste) return { ingediend: 0, bestond: 0, mislukt: 0, overgeslagen: true };

  const uit = await _teksten.dienIn({ wabaId: waba, token, commit: true, budgetMs: RONDE_BUDGET_MS });
  const r = uit.resultaten || [];
  const telling = {
    ingediend: r.filter((x) => x.action === 'created').length,
    bestond: r.filter((x) => x.action === 'skipped').length,
    mislukt: r.filter((x) => x.action === 'failed').length,
    uitgesteld: r.filter((x) => x.action === 'deferred').length,
  };
  console.log('[wa-sjablonen] WABA', waba, '-', JSON.stringify(telling));
  if (telling.mislukt) {
    const eerste = r.find((x) => x.action === 'failed');
    console.warn('[wa-sjablonen] eerste fout:', eerste && eerste.name, eerste && eerste.language, eerste && eerste.error);
  }
  return telling;
}

/* ── De toestand op de WABA van de klant zelf ─────────────────────────────
   De instellingenpagina las tot 2026-10-04 de toestand van HELVARO's WABA, en
   meldde bij een klant met een eigen nummer dus "klaar" terwijl er op zijn eigen
   WABA geen enkel sjabloon stond. Dit leest de echte lijst van zijn WABA, en
   dient wat ontbreekt meteen in (hooguit eens per zes uur). Zo hoeft er niet
   eerst een antwoord te mislukken voordat er iets gebeurt. */
const _tpl = require('./_wa-templates');

/**
 * @param {{ wabaId: string, token: string, taal: string }} o
 * @returns {Promise<object>} dezelfde vorm als _wa-templates.bekijk(), plus
 *          ingediend (aantal zojuist ingediend) en fout bij een onleesbare lijst.
 */
async function toestand({ wabaId, token, taal }) {
  const waba = String(wabaId || '').trim();
  let lijst;
  try {
    lijst = await _teksten.listTemplates(waba, token);
  } catch (e) {
    console.warn('[wa-sjablonen] lijst op eigen WABA mislukt:', waba, e && e.message);
    return { ..._tpl.bekijk(taal, { templates: {}, bron: 'eigen-onbekend' }), klaar: false, onbekend: true, fout: String(e && e.message || e).slice(0, 200), ingediend: 0 };
  }
  const maakIndex = (items) => {
    const templates = {};
    for (const t of items) if (t && t.name && t.language) templates[`${t.name}::${t.language}`] = String(t.status || '').toUpperCase();
    return { templates, bron: 'eigen' };
  };
  let staat = _tpl.bekijk(taal, maakIndex(lijst));
  let ingediend = 0;
  if (staat.ondersteund && staat.ontbreekt.length) {
    try {
      const r = await zorgVoorSjablonen({ wabaId: waba, token });
      ingediend = r.ingediend || 0;
      if (ingediend) staat = _tpl.bekijk(taal, maakIndex(await _teksten.listTemplates(waba, token)));
    } catch (e) {
      console.warn('[wa-sjablonen] indienen vanuit de instellingen mislukt:', e && e.message);
    }
  }
  /* bezig = er is zojuist iets ingediend en er ontbreekt nog wat: het scherm
     vraagt dan zelf nog een ronde. Zonder nieuwe indiening (alles mislukt, of
     een vergrendeling) nooit "bezig", anders blijft het scherm eindeloos draaien. */
  return { ...staat, ingediend, bezig: ingediend > 0 && staat.ontbreekt.length > 0 };
}

module.exports = { zorgVoorSjablonen, toestand };
