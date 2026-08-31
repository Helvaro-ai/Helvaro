/*
 * Van modeltekst naar WhatsApp-tekst.
 *
 * ── Waarom dit bestaat ──────────────────────────────────────────────────────
 * Een taalmodel schrijft Markdown, ook als je er niet om vraagt. WhatsApp kent
 * Markdown niet — het heeft zijn eigen opmaak met enkele tekens. Zonder deze
 * laag kreeg een lead letterlijk "**Perfect!**" te lezen, met sterretjes en al,
 * in het allereerste bericht waarop hij beslist of hij met een mens praat.
 *
 * Er staat nu ook een regel in de systeemprompt. Die is niet genoeg en daarom
 * niet de enige maatregel: een model dat het één keer op de honderd tóch doet,
 * levert dat lelijke bericht af bij een echte klant. De prompt is de vraag, dit
 * is de garantie.
 *
 * ── Wat hier het zwaarst weegt ──────────────────────────────────────────────
 * De NEGATIEVE gevallen. Een filter dat te gretig vervangt is erger dan geen
 * filter: "3*4" mag geen vet worden, een prijs mag niet veranderen, en een
 * kale URL mag niet verdubbeld worden. Een lead die een verminkt bedrag leest,
 * leest een fout bericht — en dat merkt niemand van ons.
 */
'use strict';

const o = require('../api/_wa-opmaak.js');

let pass = 0, fail = 0;
const ck = (naam, cond, ctx) => {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond && ctx !== undefined) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
};
const gelijk = (naam, invoer, verwacht) => {
  const uit = o.voorWhatsApp(invoer);
  ck(naam, uit === verwacht, { in: invoer, uit, verwacht });
};

console.log('\n— Markdown wordt WhatsApp-opmaak —');
gelijk('**vet** wordt *vet*', '**Perfect!** Ik heb je gegevens.', '*Perfect!* Ik heb je gegevens.');
gelijk('__vet__ ook', '__ook vet__', '*ook vet*');
gelijk('een kop wordt vet', '## Samenvatting', '*Samenvatting*');
gelijk('elk kopniveau', '###### Diep', '*Diep*');
gelijk('streepjes worden bullets', '- een\n- twee', '• een\n• twee');
gelijk('sterretjes als bullet ook', '* een\n* twee', '• een\n• twee');
gelijk('een link krijgt de url erachter',
       'Kijk op [onze site](https://helvaro.pro).', 'Kijk op onze site (https://helvaro.pro).');
gelijk('citaattekens verdwijnen', '> citaat', 'citaat');
gelijk('codeblokken houden hun inhoud', '```js\nconst a = 1;\n```', 'const a = 1;');
gelijk('te veel witregels worden er één', 'A\n\n\n\n\nB', 'A\n\nB');

console.log('\n— en wat NIET aangeraakt mag worden —');
/* Dit is de helft die ertoe doet. Een filter dat te gretig is verandert de
   inhoud van een bericht aan een klant, en dat is erger dan lelijke opmaak. */
gelijk('een vermenigvuldiging blijft heel', 'Prijs is 3*4 euro', 'Prijs is 3*4 euro');
gelijk('reeds correcte WhatsApp-opmaak blijft', 'dit is *al goed*', 'dit is *al goed*');
gelijk('een kale url wordt niet verdubbeld', 'Zie https://helvaro.pro', 'Zie https://helvaro.pro');
gelijk('een bedrag met punt blijft', 'Rond de 450.000 euro.', 'Rond de 450.000 euro.');
gelijk('een streepje midden in een zin is geen bullet',
       'Gent - Brugge is 40 minuten', 'Gent - Brugge is 40 minuten');
gelijk('een telefoonnummer blijft heel', 'Bel +32 478 12 34 56', 'Bel +32 478 12 34 56');
gelijk('een onderstreping in een woord blijft', 'bestand_naam_hier', 'bestand_naam_hier');

console.log('\n— de berichtgrens van WhatsApp —');
{
  /* WhatsApp weigert boven 4096 tekens. Zonder grens verdwijnt het bericht
     volledig: de lead krijgt NIETS en de makelaar ziet alleen een mislukking. */
  const lang = ('Dit is een zin. ').repeat(400);
  const uit = o.voorWhatsApp(lang);
  ck('een te lang bericht wordt ingekort', uit.length <= o.WA_MAX, uit.length);
  ck('en eindigt op een zin, niet midden in een woord', /[.…]$/.test(uit), uit.slice(-40));

  const kort = 'Kort bericht.';
  ck('een kort bericht blijft ongemoeid', o.voorWhatsApp(kort) === kort, o.voorWhatsApp(kort));
}

console.log('\n— beide uitgaande deuren gebruiken hetzelfde filter —');
{
  /* Er zijn er twee: sendWA() in whatsapp.js voor de AI-antwoorden, en
     api/_wa-send.js voor wat Faro na bevestiging verstuurt. Repareer je er maar
     één, dan hangt de opmaak van een lead af van welke route zijn bericht nam. */
  const fs = require('fs');
  const path = require('path');
  const lees = (f) => fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
  const wa = lees('whatsapp.js');
  const send = lees('_wa-send.js');
  ck('whatsapp.js schoont op in sendWA', /_waOpmaak\.voorWhatsApp\(message\)/.test(wa), null);
  ck('en verstuurt de OPGESCHOONDE tekst', /text: \{ body: tekst \}/.test(wa), null);
  ck('_wa-send.js schoont ook op', /_waOpmaak\.naarWhatsAppOpmaak\(text\)/.test(send), null);
  /* Maar _wa-send.js kapt bewust NIET af: daar staat een gebruiker bij die het
     bericht zelf kan inkorten, dus weigeren is daar het eerlijke antwoord. */
  ck('maar weigert daar te lange berichten in plaats van ze in te korten',
     /too_long/.test(send), null);
}

console.log('\n— de prompt vraagt er ook om —');
{
  const prompts = require('../api/_ai/prompts');
  const p = prompts.whatsappGesprek.system({ aiName: 'Mathis', clientName: 'X', ctx: {} });
  ck('de systeemprompt verbiedt Markdown', /Gebruik GEEN Markdown/.test(p), null);
  ck('en legt uit hoe je in WhatsApp benadrukt', /één sterretje/.test(p), null);
}

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
