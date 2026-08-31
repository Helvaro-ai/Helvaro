'use strict';
/* ── Van modeltekst naar WhatsApp-tekst ──────────────────────────────────────
 * Een taalmodel schrijft Markdown, ook als je het niet vraagt. WhatsApp kent
 * Markdown niet: het heeft zijn EIGEN opmaak met enkele tekens.
 *
 *   Markdown          WhatsApp        wat de lead zag zonder deze functie
 *   **Budget**        *Budget*        **Budget**   (met sterretjes en al)
 *   ## Kopje          *Kopje*         ## Kopje
 *   - punt            • punt          - punt
 *   [site](https://)  site (https://) [site](https://)
 *
 * Dit stond nergens in de prompt en werd nergens opgeschoond, dus alles wat het
 * model aan opmaak bedacht kwam letterlijk bij de lead terecht. Dat is precies
 * het bericht waarop iemand beslist of hij met een mens praat.
 *
 * Waarom hier, in sendWA, en niet bij het opstellen van het antwoord: dit is de
 * enige deur waar een bericht doorheen gaat. Zet je het een laag hoger, dan
 * moet elke aanroeper eraan denken -- en er zijn er zeventien. De sjablonen uit
 * _lang.js zijn al schoon; die veranderen hierdoor niet, want er valt niets op
 * te schonen.
 *
 * Er is bewust GEEN prompt-only oplossing. "Gebruik geen Markdown" in de prompt
 * helpt, en staat er nu ook bij, maar een model dat het één keer op de honderd
 * toch doet levert een lelijk bericht af bij een echte klant. De regel in de
 * code haalt die honderdste weg.
 */
function naarWhatsAppOpmaak(ruw) {
  let t = String(ruw == null ? '' : ruw);

  // Codeblokken eerst: de inhoud blijft, de hekjes gaan weg. Anders zouden de
  // regels hieronder in de code zelf gaan zitten wroeten.
  t = t.replace(/```[a-z]*\n?([\s\S]*?)```/gi, '$1');

  // Koppen worden vet. WhatsApp heeft geen kopniveaus, dus alle niveaus gelijk.
  t = t.replace(/^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm, '*$1*');

  // **vet** en __vet__ -> *vet*. Moet VOOR de opsommingsregel, anders ziet die
  // de sterretjes aan voor een bulletteken.
  t = t.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '*$1*');
  t = t.replace(/__(?=\S)([\s\S]*?\S)__/g, '*$1*');

  // Links: de tekst met de url erachter, want een lead kan niet op opmaak
  // klikken die er niet is. Is de tekst de url zelf, dan niet verdubbelen.
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, tekst, url) => (
    tekst.trim() === url.trim() ? url : `${tekst} (${url})`
  ));

  // Opsommingen. De spatie erachter is wat dit onderscheidt van *vet*.
  t = t.replace(/^[ \t]*[-*+][ \t]+/gm, '• ');

  // Citaatstreepjes betekenen niets in WhatsApp.
  t = t.replace(/^[ \t]*>[ \t]?/gm, '');

  // Horizontale lijnen bestaan niet.
  t = t.replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '');

  // Opruimen: spaties aan het regeleinde, en meer dan één lege regel achter
  // elkaar. Een bericht met vier witregels leest als een fout.
  t = t.replace(/[ \t]+$/gm, '');
  t = t.replace(/\n{3,}/g, '\n\n');

  return t.trim();
}

/* WhatsApp weigert een tekstbericht boven 4096 tekens. Zonder deze grens
   verdwijnt zo'n bericht volledig -- de lead krijgt NIETS en de makelaar ziet
   alleen een mislukte verzending. Afkappen op een zinseinde als dat kan, want
   midden in een woord stoppen leest als een storing. */
const WA_MAX = 4096;
function kapAfOpZin(t, max) {
  if (t.length <= max) return t;
  const ruimte = max - 1;
  const knip = t.slice(0, ruimte);
  const eind = Math.max(knip.lastIndexOf('. '), knip.lastIndexOf('\n'), knip.lastIndexOf('! '), knip.lastIndexOf('? '));
  return (eind > ruimte * 0.6 ? knip.slice(0, eind + 1) : knip).trim() + '…';
}


/**
 * De enige functie die aanroepers nodig hebben: opschonen én binnen de
 * berichtgrens brengen, in die volgorde. Opschonen kan de tekst korter maken,
 * dus afkappen hoort daarna -- andersom zou je afkappen op tekens die daarna
 * alsnog verdwijnen.
 */
function voorWhatsApp(ruw) {
  return kapAfOpZin(naarWhatsAppOpmaak(ruw), WA_MAX);
}

module.exports = { voorWhatsApp, naarWhatsAppOpmaak, kapAfOpZin, WA_MAX };
