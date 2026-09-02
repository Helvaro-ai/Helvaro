/*
 * Eén bericht, één antwoord.
 *
 * ── Waarom dit ertoe doet ───────────────────────────────────────────────────
 * Meta stuurt een webhook opnieuw wanneer wij te traag antwoorden. Zonder
 * ontdubbeling antwoordt de assistent twee keer op hetzelfde bericht van een
 * lead. Dat is geen cosmetisch probleem: de lead ziet een bot die zichzelf
 * herhaalt, het gesprek loopt uit de hand, en het kost twee keer credits.
 *
 * ── Wat er al was, en wat eraan ontbrak ─────────────────────────────────────
 * _dedupSeen() is een Map in het geheugen van EEN instantie, en opDeRij()
 * serialiseert ook alleen binnen een instantie. Op Vercel schaalt deze functie
 * uit: twee bezorgingen van hetzelfde bericht kunnen op twee instanties landen
 * en dan ziet geen van beide de ander. De opmerking in de code was eerlijk over
 * het koude-start-geval, maar noemde het uitschalen niet.
 *
 * Nu draagt elke inkomende regel in de gespreksgeschiedenis het bericht-id, en
 * die geschiedenis is gedeeld. Staat het id er al in, dan is het bericht al
 * beantwoord.
 *
 * ── Wat dit NIET oplost ─────────────────────────────────────────────────────
 * Twee ECHT gelijktijdige bezorgingen lezen allebei een geschiedenis zonder het
 * id en gaan allebei door. Airtable kent geen unieke sleutel om dat mee af te
 * dwingen. Dit haalt het geval weg dat in de praktijk voorkomt -- de trage
 * herbezorging -- en niet meer dan dat.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const src  = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

console.log('\nEén bericht, één antwoord');

console.log('\n  het id komt echt binnen');
/* Dit is de eerste versie van deze fix bijna fataal geworden: de controle stond
   in processMessage() en verwees naar `message`, dat daar niet bestaat. Dan
   gooit ELK inkomend bericht een ReferenceError en krijgt geen enkele lead nog
   antwoord. node --check ziet dat niet -- het is geldige syntaxis. */
ck('processMessage neemt het bericht-id als parameter aan',
  /async function processMessage\(phone, text, scopedProjectCode, inkomendId\)/.test(src), null);
ck('en de aanroeper geeft message.id door',
  /processMessage\(phone, text, scopedProjectCode, message\.id\)/.test(src), null);
{
  /* Geen enkele verwijzing naar `message.` binnen processMessage, behalve
     aiResponse.message -- dat is een ander object. */
  const start = src.indexOf('async function processMessage(');
  const rest  = src.slice(start + 10);
  const m     = rest.match(/\n(?:async )?function [A-Za-z0-9_]+\s*\(/);
  const blok  = src.slice(start, start + 10 + (m ? m.index : rest.length));
  const los   = blok.split('\n').filter((l) =>
    /\bmessage\./.test(l) && !/aiResponse\.message/.test(l) && !/^\s*(\/\/|\*)/.test(l.trim()));
  ck('geen losse verwijzing naar `message` binnen processMessage', los.length === 0, los);
}

console.log('\n  de controle staat voor het opslaan');
{
  const iCheck = src.indexOf('history.some((h) => h && h.mid === inkomendId)');
  const iPush  = src.indexOf("history.push({ role: 'user', content: text");
  ck('de historie wordt op het id gecontroleerd', iCheck !== -1, iCheck);
  ck('en dat gebeurt VOOR de regel wordt toegevoegd', iCheck !== -1 && iCheck < iPush,
    { check: iCheck, push: iPush });
  ck('de nieuwe regel draagt het id mee', /ts: Date\.now\(\), mid: inkomendId \|\| undefined/.test(src), null);
}

console.log('\n  en het gedraagt zich zoals bedoeld');
{
  /* De beslissing los nagerekend, met dezelfde uitdrukking als in de code. */
  const alBeantwoord = (history, id) => !!(id && history.some((h) => h && h.mid === id));

  const historie = [
    { role: 'user', content: 'hallo', ts: 1, mid: 'wamid.AAA' },
    { role: 'assistant', content: 'dag!', ts: 2 },
  ];
  ck('een herbezorging van hetzelfde bericht wordt overgeslagen',
    alBeantwoord(historie, 'wamid.AAA') === true, null);
  ck('een NIEUW bericht gaat gewoon door',
    alBeantwoord(historie, 'wamid.BBB') === false, null);

  /* Oude gesprekken hebben geen mid. Die moeten door naar het oude gedrag:
     liever een keer dubbel dan een lead die niets hoort. */
  const oud = [{ role: 'user', content: 'hallo', ts: 1 }, { role: 'assistant', content: 'dag!', ts: 2 }];
  ck('een gesprek van voor deze wijziging blijft gewoon werken',
    alBeantwoord(oud, 'wamid.AAA') === false, null);
  ck('zonder bericht-id wordt er niets overgeslagen',
    alBeantwoord(historie, '') === false && alBeantwoord(historie, undefined) === false, null);
  ck('rommel in de historie laat het niet omvallen',
    alBeantwoord([null, undefined, 'x', { mid: 'wamid.AAA' }], 'wamid.AAA') === true, null);
}

console.log('\n  het geheugenslot blijft ook bestaan');
ck('_dedupSeen is er nog — dit komt erbij, niet in de plaats',
  /function _dedupSeen\(id\)/.test(src) && /_dedupSeen\(message\.id\)/.test(src), null);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
