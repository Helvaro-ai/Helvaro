/*
 * Marge is de helft van de vergelijking die er nog niet stond.
 *
 * ── Waarom dit bestaat ──────────────────────────────────────────────────────
 * getAllUsageSummaries() had de opmerking "for margin visibility" erboven en
 * gaf verbruik plus geschatte kosten terug -- maar geen opbrengst. Daarmee zag
 * een klant die verlies draait er precies zo uit als een die dat niet doet.
 *
 * Drie dingen moeten kloppen om dit eerlijk te maken, en alle drie zijn hier
 * een aparte test waard:
 *
 *  1. Btw eruit. De plannen staan INCLUSIEF 21%; btw is geen omzet. Met het
 *     bedrag incl. zou elke marge er ~17% te mooi uitzien -- precies de kant
 *     waarop je jezelf niet wil vergissen.
 *  2. De afgesproken prijs wint van de lijstprijs. Scale is een vanafprijs.
 *  3. Geen plan geeft null, niet nul. "Onbekend" en "verliesgevend" zijn twee
 *     verschillende gesprekken.
 *
 * ── En de sjabloonkosten ────────────────────────────────────────────────────
 * Meta rekent per afgeleverd sjabloon: MARKETING ~EUR 0,11, UTILITY ~EUR 0,05.
 * De sjablonen zijn 75-100% van wat een lead kost (AI is ~EUR 0,024, het
 * 24u-venster is gratis). De index vroeg die categorie niet op, dus de grootste
 * kostenpost van het product was onzichtbaar in het product.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const plans = require(BASE + 'api/_plans.js');
const tpl   = require(BASE + 'api/_wa-templates.js');
const credits = fs.readFileSync(BASE + 'api/_credits.js', 'utf8');
const waTpl   = fs.readFileSync(BASE + 'api/_wa-templates.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};

console.log('\nMarge per klant');

console.log('\n  de opbrengst zit er nu bij');
ck('het overzicht kent de planprijs', /fields\['Plan ID'\]/.test(credits), null);
ck('en de afgesproken prijs wint van de lijstprijs',
  /afgesprokenIncl > 0 \? afgesprokenIncl : \(plan \? plan\.prijsEur : 0\)/.test(credits), null);
ck('btw wordt eruit gerekend', /1 \+ _plans\.BTW_PCT \/ 100/.test(credits), null);
ck('marge = omzet excl. btw min de geschatte kosten',
  /margeEur\s*=\s*omzetExcl === null \? null : .*omzetExcl - kosten/.test(credits), null);
ck('geen plan geeft null, geen nul',
  /omzetExcl = prijsIncl > 0 \? .* : null/.test(credits), null);

console.log('\n  en de rekensom klopt onafhankelijk nagerekend');
{
  /* Growth: EUR 499 incl. 21% btw. Excl = 499 / 1,21 = 412,40.
     Bij 10.000 credits vol verbruikt is onze kostprijs EUR 150 (0,015/credit).
     Marge hoort dus EUR 262,40 te zijn, ofwel 63,6%. */
  const growth = plans.plan('growth');
  const excl = Math.round((growth.prijsEur / 1.21) * 100) / 100;
  const kost = plans.kostprijsEur(growth.credits);
  ck('Growth excl. btw is EUR 412,40', excl === 412.40, excl);
  ck('kostprijs bij vol verbruik is EUR 150', kost === 150, kost);
  ck('marge is dus EUR 262,40', Math.round((excl - kost) * 100) / 100 === 262.40, excl - kost);
  /* De valkuil die deze test moet vangen: met het bedrag INCL. btw zou de
     marge EUR 349 lijken in plaats van EUR 262 -- 33% te hoog. */
  ck('en met btw erin zou het er EUR 87 te mooi uitzien',
    Math.round((growth.prijsEur - kost - (excl - kost)) * 100) / 100 === 86.60,
    growth.prijsEur - excl);
}

console.log('\nWat een sjabloon kost');

console.log('\n  de categorie wordt opgehaald');
ck('de Meta-call vraagt category op', /fields=name,language,status,category/.test(waTpl), null);
ck('en bewaart hem apart van de status', /const categorieen = \{\};/.test(waTpl), null);
ck('de snapshot verzint geen categorieen', /categorieen: \{\}/.test(waTpl), null);

console.log('\n  de tarieven staan vast en kloppen met het ontwerpdocument');
ck('MARKETING is EUR 0,11', tpl.TARIEF_EUR.MARKETING === 0.11, tpl.TARIEF_EUR);
ck('UTILITY is EUR 0,05',   tpl.TARIEF_EUR.UTILITY === 0.05, tpl.TARIEF_EUR);
ck('het gratis 24u-venster is 0', tpl.TARIEF_EUR.SERVICE === 0, tpl.TARIEF_EUR);
ck('MARKETING is meer dan het dubbele van UTILITY',
  tpl.TARIEF_EUR.MARKETING / tpl.TARIEF_EUR.UTILITY > 2, null);

console.log('\n  onbekend is niet hetzelfde als gratis');
{
  const k = tpl.kostenVoor('nl_BE');
  ck('zonder management-token zijn de categorieen onbekend', k.onbekend > 0, k.onbekend);
  ck('en dat wordt apart geteld, niet als EUR 0 verzwegen',
    k.totaalEur === 0 && k.onbekend === k.regels.length, { totaal: k.totaalEur, onbekend: k.onbekend });
  ck('elke regel noemt zijn sjabloon', k.regels.every((r) => !!r.naam), null);
  ck('een onbekende categorie geeft tariefEur null, geen 0',
    k.regels.every((r) => r.categorie === null && r.tariefEur === null), k.regels[0]);
}

console.log('\n  de besparing wordt berekend, niet beloofd');
ck('besparingAlsUtilityEur bestaat', 'besparingAlsUtilityEur' in tpl.kostenVoor('nl_BE'), null);
ck('en is 0 zolang er geen MARKETING-sjabloon bekend is',
  tpl.kostenVoor('nl_BE').besparingAlsUtilityEur === 0, null);
ck('de code zegt erbij dat het geen belofte is',
  /Geen belofte/.test(waTpl) && /hangt af van Meta/.test(waTpl), null);

console.log('\n  de configuratie die de kostprijs zichtbaar maakt, wordt gecontroleerd');
{
  /* Dit is de reden dat bovenstaande maanden niets deed zonder dat het opviel.
     _wa-templates.js heeft TWEE dingen nodig -- een WABA-id en een token -- en
     valt zonder een van beide terug op de momentopname in de code. Verzenden
     blijft dan gewoon werken, dus er gaat geen belletje af. In productie stond
     WABA_ID nergens; preflight controleerde WHATSAPP_TOKEN, PHONE_NUMBER_ID,
     WA_APP_SECRET en WA_VERIFY_TOKEN, maar deze niet. Het vangnet had een gat
     op precies de plek waar de grootste kostenpost zichtbaar had moeten zijn.

     Deze test kijkt naar gedrag, niet naar de tekst van de melding: leest de
     controle die variabele, en behandelt de code hem als vereist naast het
     token. Herformuleer de waarschuwing gerust; haal de controle weg en dit
     wordt rood. */
  const pre = fs.readFileSync(BASE + 'scripts/preflight.js', 'utf8');
  ck('preflight leest WABA_ID uit de omgeving',
    /process\.env\.WABA_ID\b/.test(pre), null);   // \b, anders matcht WABA_ID_UIT ook
  ck('en heeft een tak voor het geval hij ontbreekt',
    /if \(!waBaId\)/.test(pre), null);

  /* Het token is NIET verplicht apart: de code valt terug op WHATSAPP_TOKEN.
     Dat mag alleen zo blijven zolang die terugval echt in de code staat --
     anders is de melding een leugen. */
  ck('_wa-templates valt terug op WHATSAPP_TOKEN als er geen beheer-token is',
    /WHATSAPP_MANAGEMENT_TOKEN\s*\|\|\s*process\.env\.WHATSAPP_TOKEN/.test(waTpl), null);
  ck('en doet zonder WABA_ID geen enkele oproep naar Meta',
    /if \(!waba \|\| !token\)/.test(waTpl), null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
