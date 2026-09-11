/*
 * Twee manieren waarop werk stil verdwijnt.
 *
 * ── 1. Een uitgaande aanroep zonder klok ────────────────────────────────────
 * api/cron-followup.js kreeg op 3 september een atFetch-wrapper met een
 * AbortSignal, en de kop van dat bestand legt precies uit waarom: zonder klok
 * kan één hangende aanroep de hele cron opeten, Vercel kapt na 300 seconden af,
 * en dan heeft de ene helft van de klanten zijn opvolging gehad en de andere
 * niet -- stil, en pas de volgende dag opnieuw geprobeerd.
 *
 * Die wrapper zat alleen op de Airtable-aanroepen. De twee aanroepen die het
 * bericht ECHT versturen -- naar graph.facebook.com -- bleven kale fetch. Dat
 * is de verkeerde kant op: Meta is nu juist de partij die hier is blijven
 * hangen (het dode token in de kop van dat bestand).
 *
 * ── 2. Werk dat na res.end() nog moest gebeuren ─────────────────────────────
 * api/_faro/orchestrator.js boekte de credits af en bewaarde de vraag en het
 * antwoord met fire-and-forget, vlak voor stream.close() -- die res.end() doet.
 * Vercel mag de container daarna bevriezen. "Niet wachten" en "mag wegvallen"
 * zijn niet hetzelfde: een beurt die niet werd afgeboekt was gratis, en een
 * antwoord dat niet werd bewaard is er morgen niet meer.
 *
 * api/whatsapp.js en api/form.js gebruiken waitUntil() al precies hiervoor en
 * leggen dat in hun kop uit. Deze test pint vast dat de drie plekken die het
 * nodig hebben het ook doen, en dat de twee bestanden die het al goed deden zo
 * blijven.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const lees = (p) => fs.readFileSync(BASE + p, 'utf8');

const cron  = lees('api/cron-followup.js');
const orch  = lees('api/_faro/orchestrator.js');
const wa    = lees('api/whatsapp.js');
const form  = lees('api/form.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

/* Commentaar eruit voordat er op code gezocht wordt. In deze codebase staan de
   afwegingen in lange blokken erboven, en die noemen bijna altijd het woord
   waar je op zoekt -- een test die dat meeleest is groen om de verkeerde
   reden. */
const zonderCommentaar = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

console.log('\nUitgaande aanroepen hebben een klok, en werk na het antwoord verdwijnt niet');

console.log('\n  de cron belt Meta niet zonder klok');
{
  const code = zonderCommentaar(cron);

  /* De kern: geen enkele kale fetch( meer in dit bestand behalve de ene die
     IN de wrapper zelf zit. Zo blijft de test ook staan als er morgen een
     derde uitgaande aanroep bij komt. */
  const alleFetches = [...code.matchAll(/(?:^|[^.\w])fetch\s*\(/g)];
  ck('er is precies één kale fetch( over: die binnen atFetch zelf',
    alleFetches.length === 1, { gevonden: alleFetches.length });

  const inWrapper = /async function atFetch\(url, opts\) \{\s*return fetch\(/.test(code);
  ck('en dat is inderdaad de wrapper', inWrapper, null);

  ck('de wrapper zet een AbortSignal',
    /signal:\s*\(opts && opts\.signal\) \|\| AbortSignal\.timeout\(/.test(code), null);

  const m = code.match(/function sendWATemplate\([\s\S]*?\n\}/);
  ck('sendWATemplate bestaat nog', !!m, null);
  /* De klok is verhuisd naar de deur: sendWATemplate is een schil om
     api/_wa-send.js, en dáár staat AbortSignal.timeout(POST_TIMEOUT_MS) op
     elke aanroep. Een eigen atFetch is dus niet meer nodig; wat telt is dat
     de schil niet stiekem weer een kale fetch doet. */
  ck('en verstuurt via de deur, niet via een eigen fetch',
    !!m && /_waSend\.sendTemplateSafe\(/.test(m[0]) && !/\bfetch\(/.test(m[0]), m ? m[0].slice(0, 200) : null);
  const deur = require('fs').readFileSync(require('path').join(__dirname, '..', 'api', '_wa-send.js'), 'utf8');
  ck('en de deur zet een klok op elke Meta-aanroep',
    /signal:\s*AbortSignal\.timeout\(POST_TIMEOUT_MS\)/.test(deur), null);

  /* Een time-out moet als "niet verstuurd" aankomen, niet als een uitzondering
     die de lus opblaast: die boolean is waar cron-eerlijk.test.js op staat. */
  ck('een afgekapte aanroep levert false op, geen crash',
    /TimeoutError[\s\S]{0,400}?throw new SendError\([\s\S]{0,120}?'timeout'/.test(deur)
      && /async function sendTemplateSafe[\s\S]{0,200}?catch \(err\)/.test(deur), null);
}

console.log('\n  de dode tweede verzendfunctie is weg');
{
  const code = zonderCommentaar(cron);
  ck('sendWA() staat niet meer in cron-followup',
    !/function sendWA\s*\(/.test(code), null);
  /* Hij werd nergens aangeroepen en werd ook niet geëxporteerd. Dat vastpinnen,
     want dit is de reden dat hij weg mocht. */
  ck('en wordt ook nergens in dit bestand aangeroepen',
    !/[^A-Za-z]sendWA\s*\(/.test(code.replace(/sendWATemplate\s*\(/g, 'X(')), null);
}

console.log('\n  Faro laat zijn nawerk niet vallen');
{
  const code = zonderCommentaar(orch);

  ck('de orchestrator kent waitUntil',
    /require\('@vercel\/functions'\)/.test(code) && /waitUntil/.test(code), null);

  /* Drie plekken, en ze moeten het ALLE DRIE doen: het afboeken en de twee
     schrijfacties. Eén ervan overslaan is precies de fout die dit bestand had. */
  ck('het afboeken van de credits is aangemeld',
    /waitUntil\(credits\.recordUsage\(/.test(code), null);

  const appends = [...code.matchAll(/store\.appendMessage\(/g)].length;
  const bewaakteAppends = [...code.matchAll(/waitUntil\(store\.appendMessage\(/g)].length;
  ck('en elke appendMessage ook', appends > 0 && appends === bewaakteAppends,
    { appendMessage: appends, metWaitUntil: bewaakteAppends });

  /* Het gevaar zit in de VOLGORDE: aanmelden moet gebeuren vóór res.end(),
     anders is er geen verzoek meer om het aan te hangen.

     Vergelijken met de LAATSTE stream.close en niet met de eerste: er is een
     vroege afsluiting bij "je credits zijn op", en daar valt niets af te boeken
     en niets te bewaren. Die hoort geen waitUntil te hebben. */
  const iLaatsteWait = code.lastIndexOf('waitUntil(');
  const iClose = code.lastIndexOf('stream.close(res');
  ck('en dat gebeurt vóór de stream sluit',
    iLaatsteWait !== -1 && iClose !== -1 && iLaatsteWait < iClose,
    { waitUntil: iLaatsteWait, close: iClose });
}

console.log('\n  de twee bestanden die dit al goed deden, blijven zo');
{
  ck('api/whatsapp.js meldt zijn creditwerk aan',
    /waitUntil\(creditWork\)/.test(zonderCommentaar(wa)), null);
  ck('api/form.js meldt zijn uitgestelde verzending aan',
    /waitUntil\(deferredSend\)/.test(zonderCommentaar(form)), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
