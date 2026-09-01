/*
 * Faro weet waar je staat.
 *
 * ── Wat hier bewezen wordt ──────────────────────────────────────────────────
 * Faro kreeg tot nu toe alleen de vraag, niet het scherm. Wie op zijn
 * creditspagina "wat betekent dit?" typte, vroeg dat aan een assistent die
 * niet kon zien waar hij stond -- en kreeg een wedervraag terug. Dit bestand
 * bewaakt de drie dingen die daaraan veranderd zijn, en vooral de grens die er
 * bij hoort.
 *
 * 1. DE GRENS. De context komt uit de browser en is dus door de gebruiker te
 *    vervalsen. Er mag alleen door wat wij zelf gedefinieerd hebben: bekende
 *    pagina's, bekende toestanden, afgekapte lengtes. Een onbekende sleutel
 *    verdwijnt, een back-officepagina verdwijnt, en vrije tekst wordt ontdaan
 *    van alles wat op opmaak lijkt. Zonder die grens is dit een tweede,
 *    ongecontroleerde weg naar de systeemprompt.
 *
 * 2. WAAR, NIET WAT. De schermcontext zegt op welk scherm iemand staat, nooit
 *    wat erop staat. Leads en bedragen lopen via tools.js, met de
 *    tenantcontrole die daarbij hoort. Deze weg omzeilt die controle niet.
 *
 * 3. HET AANWIJZEND VOORNAAMWOORD. Context meegeven is niet genoeg: zonder de
 *    expliciete instructie dat "dit" naar dit scherm verwijst, vraagt het model
 *    alsnog waar de gebruiker op doelt. Dat is de hele functie van de feature,
 *    dus die zin wordt hier vastgelegd.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

const BASE = require('path').join(__dirname, '..') + '/';
const scherm = require(BASE + 'api/_faro/scherm.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nFaro — schermcontext');

// ── 1. De grens ────────────────────────────────────────────────────────────
console.log('\n  alles uit de browser is verdacht');

ck('een bekende pagina komt door',
  scherm.sanitize({ pagina: 'facturatie' }).pagina === 'facturatie', null);

/* De back-office wordt voor een klant al uit de HTML gehaald (stripBackoffice).
   Faro hoort er dus ook niets over te kunnen zeggen, ook niet als iemand het
   pagina-id zelf in het verzoek zet. */
for (const verboden of ['founder', 'kosten', 'admin']) {
  ck(`de back-officepagina "${verboden}" wordt geweigerd`,
    scherm.sanitize({ pagina: verboden }).pagina === undefined,
    scherm.sanitize({ pagina: verboden }));
}
ck('een verzonnen pagina wordt geweigerd',
  scherm.sanitize({ pagina: 'bestaat-niet' }).pagina === undefined, null);

ck('een onbekende sleutel verdwijnt',
  scherm.sanitize({ pagina: 'dashboard', apiKey: 'geheim', leads: [1, 2] }).apiKey === undefined,
  scherm.sanitize({ pagina: 'dashboard', apiKey: 'geheim' }));

ck('alleen bekende toestanden komen door',
  scherm.sanitize({ pagina: 'dashboard', toestand: 'kaboem' }).toestand === undefined, null);
ck('"leeg" komt wel door',
  scherm.sanitize({ pagina: 'dashboard', toestand: 'leeg' }).toestand === 'leeg', null);
/* 'normaal' zegt niets en hoort dus geen promptregels op te leveren. */
ck('"normaal" levert geen toestand op',
  scherm.sanitize({ pagina: 'dashboard', toestand: 'normaal' }).toestand === undefined, null);

/* "Leeg" leidt de client af uit het aantal leads. Op een scherm dat geen leads
   toont zegt dat niets: live gezien meldde een account zonder leads ook
   AI-persoonlijkheid en Facturatie als "leeg", waarop Faro zou gaan uitleggen
   waarom er niets staat terwijl er een vol formulier voor de gebruiker staat. */
ck('"leeg" telt alleen op een scherm dat leads toont',
  scherm.sanitize({ pagina: 'dashboard', toestand: 'leeg' }).toestand === 'leeg'
  && scherm.sanitize({ pagina: 'ai-persona', toestand: 'leeg' }).toestand === undefined
  && scherm.sanitize({ pagina: 'facturatie', toestand: 'leeg' }).toestand === undefined,
  [scherm.sanitize({ pagina: 'ai-persona', toestand: 'leeg' }),
   scherm.sanitize({ pagina: 'facturatie', toestand: 'leeg' })]);
ck('een foutmelding telt wel op elk scherm',
  scherm.sanitize({ pagina: 'ai-persona', toestand: 'fout' }).toestand === 'fout', null);

const langeSectie = scherm.sanitize({ pagina: 'dashboard', sectie: 'x'.repeat(500) }).sectie;
ck('een lange sectie wordt afgekapt', langeSectie.length === 60, langeSectie.length);

/* De sectie komt uit de pagina. Zelfs al is het onze eigen UI: er mag niets
   doorheen dat de promptstructuur kan breken. */
const vuil = scherm.sanitize({ pagina: 'dashboard', sectie: 'a<script>b`c${d}e\nf' }).sectie;
ck('opmaaktekens worden uit de sectie gehaald',
  !/[<>`${}\n]/.test(vuil), vuil);

ck('booleans blijven booleans', (() => {
  const u = scherm.sanitize({ pagina: 'dashboard', onboardingKlaar: 'ja' });
  return u.onboardingKlaar === undefined;
})(), null);

ck('rommel in plaats van een object loopt niet stuk',
  JSON.stringify(scherm.sanitize(null)) === '{}'
  && JSON.stringify(scherm.sanitize('tekst')) === '{}'
  && JSON.stringify(scherm.sanitize(42)) === '{}', null);

// ── 2. Waar, niet wat ──────────────────────────────────────────────────────
console.log('\n  waar iemand staat, niet wat er staat');

const alles = scherm.sanitize({
  pagina: 'gesprekken',
  leadNaam: 'Jan Janssens',
  telefoon: '+32...',
  saldo: 4200,
  gesprek: 'volledige transcriptie',
});
ck('klantgegevens komen er niet doorheen',
  Object.keys(alles).join(',') === 'pagina', Object.keys(alles));

// ── 3. Wat Faro te horen krijgt ────────────────────────────────────────────
console.log('\n  de promptregels');

const leeg = scherm.render(scherm.sanitize({}));
ck('geen pagina levert geen blok op (liever zwijgen dan een leeg kopje)',
  leeg === '', leeg);

const fact = scherm.render(scherm.sanitize({ pagina: 'facturatie' }));
ck('het scherm wordt bij naam genoemd', /Facturatie/.test(fact), fact);
ck('en uitgelegd in gewone taal', /credit/i.test(fact), fact);

/* De kern van de hele feature. */
ck('"dit" wordt expliciet aan dit scherm gekoppeld',
  /"dit".*bedoelt hij dit scherm/is.test(fact), fact);
ck('en het model wordt verboden terug te vragen',
  /Vraag niet waar hij op doelt/i.test(fact), fact);

const leegScherm = scherm.render(scherm.sanitize({ pagina: 'dashboard', toestand: 'leeg' }));
ck('een leeg scherm krijgt een eigen instructie',
  /leeg/i.test(leegScherm) && /wat er komt te staan/i.test(leegScherm), leegScherm);

const foutScherm = scherm.render(scherm.sanitize({ pagina: 'dashboard', toestand: 'fout' }));
ck('een foutmelding ook', /foutmelding/i.test(foutScherm), foutScherm);

const nietAf = scherm.render(scherm.sanitize({ pagina: 'dashboard', onboardingKlaar: false }));
ck('een onafgemaakte inrichting wordt gemeld', /inrichting is nog niet af/i.test(nietAf), nietAf);
ck('een AFGEMAAKTE inrichting wordt NIET gemeld (dat is ruis)',
  !/inrichting is nog niet af/i.test(scherm.render(scherm.sanitize({ pagina: 'dashboard', onboardingKlaar: true }))), null);

// ── 4. Elk klantscherm is uitlegbaar ───────────────────────────────────────
console.log('\n  elk scherm kan zichzelf uitleggen');
const paginas = Object.keys(scherm.PAGINAS);
ck(`alle ${paginas.length} klantschermen hebben een naam en een uitleg`,
  paginas.every((k) => scherm.PAGINAS[k].naam && scherm.PAGINAS[k].wat
    && scherm.PAGINAS[k].wat.length > 30),
  paginas.filter((k) => !scherm.PAGINAS[k].wat || scherm.PAGINAS[k].wat.length <= 30));
ck('en elk levert een bruikbaar blok op',
  paginas.every((k) => scherm.render({ pagina: k }).length > 80), null);

// ── 5. De bedrading ────────────────────────────────────────────────────────
console.log('\n  de bedrading klopt');
const uiJs = require(BASE + 'api/_faro/ui').forLang('nl').js;
ck('de client verzamelt de context', /function faroSchermContext/.test(uiJs), null);
ck('en stuurt hem mee met elke vraag', /context: faroSchermContext\(\)/.test(uiJs), null);
/* `state` is een const op modulescope in dashboard.js en staat NIET op window.
   `window.state && state.currentPage` gaf daarom altijd undefined en de context
   vertrok zonder pagina -- precies het enige dat hij moest meenemen. Live
   gevonden, want een unittest op de bron had dit nooit gezien. */
ck('de client leest state via typeof, niet via window.state',
   /typeof state !== 'undefined'/.test(uiJs) && !/window\.state && state\.currentPage/.test(uiJs), null);

ck('de client stuurt GEEN leads of saldi mee',
  !/context:[\s\S]{0,400}state\.leads\[/.test(uiJs), null);

// ── 6. Proactieve tips: de remmen ──────────────────────────────────────────
console.log('\n  Faro zegt af en toe iets, en houdt zich in');

/* De opdracht was expliciet: "Keep proactive messages limited. Never spam the
   user." Dat is geen stijlkwestie maar het verschil tussen een assistent en
   een pop-up, dus de drie remmen worden hier vastgehouden. */
ck('hoogstens drie tips per sessie', /FARO_TIP_MAX = 3/.test(uiJs), null);
ck('een tip die je gezien hebt komt niet terug',
  /lijst\.indexOf\(sleutel\) !== -1 \|\| lijst\.length >= FARO_TIP_MAX/.test(uiJs), null);
ck('in sessionStorage, niet localStorage (een tip is geen instelling)',
  /sessionStorage\.setItem\('faro-tips'/.test(uiJs) && !/localStorage[^\n]*faro-tips/.test(uiJs), null);
ck('geen opslag beschikbaar betekent zwijgen, niet herhalen',
  /catch \(e\) \{[\s\S]{0,260}return true;/.test(uiJs), null);
ck('wegklikken kan', /faroVerbergTip/.test(uiJs), null);
ck('en zelf typen laat hem ook verdwijnen',
  /dockInput\.addEventListener\('focus', faroVerbergTip\)/.test(uiJs), null);
ck('staat Faro al open, dan zwijgt de balk',
  /if \(faroState\.open\) \{ doos\.hidden = true; return; \}/.test(uiJs), null);
ck('een kapotte tip breekt de navigatie niet',
  /try \{ faroDockTip\(\); \} catch/.test(uiJs), null);

/* Prioriteit: een onafgemaakte inrichting gaat voor uitleg over het scherm
   waar je toevallig staat. */
ck('een onafgemaakte inrichting heeft voorrang',
  /if \(ctx\.onboardingKlaar === false\) return \{ sleutel: 'onboarding'/.test(uiJs), null);
ck('en niet elk scherm heeft een tip (alleen waar iets te zeggen valt)',
  /return null;/.test(uiJs), null);

const i18nFaro = require(BASE + 'api/_faro/ui/i18n.js');
ck('elke tip bestaat in alle vier de UI-talen', i18nFaro.TRANSLATED.every((l) => {
  const tab = i18nFaro.table(l);
  return ['tip.onboarding', 'tip.leeg', 'tip.persona', 'tip.formulier',
          'tip.facturatie', 'tip.agenda', 'tip.sluit'].every((k) => tab[k] && tab[k].length > 2);
}), i18nFaro.TRANSLATED.filter((l) => !i18nFaro.table(l)['tip.leeg']));

const faroCss = require(BASE + 'api/_faro/ui').forLang('nl').css;
ck('beweging wordt uitgezet voor wie dat gevraagd heeft',
  /prefers-reduced-motion: reduce\)[\s\S]{0,400}faro-dock__hintmark \{ animation: none/.test(faroCss), null);
ck('de tip is een regel in de dock, geen zwevende ballon over de pagina',
  !/\.faro-dock__hint \{[^}]*position:\s*fixed/.test(faroCss), null);

const promptSrc = require('fs').readFileSync(BASE + 'api/_faro/prompt.js', 'utf8');
ck('de prompt neemt het blok op', /scherm\.render\(ctx\.ui\)/.test(promptSrc), null);
const handlerSrc = require('fs').readFileSync(BASE + 'api/_faro/handler.js', 'utf8');
ck('de handler maakt de context eerst schoon',
  /ctx\.ui = scherm\.sanitize\(body\.context\)/.test(handlerSrc), null);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
