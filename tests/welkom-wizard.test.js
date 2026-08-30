/*
 * De welkomstwizard: wat een nieuwe klant als eerste ziet.
 *
 * ── Twee systemen die uit elkaar moeten blijven ─────────────────────────────
 * De wizard is systeem A en mag overgeslagen worden. De onboarding-checklist op
 * het dashboard is systeem B en blijft staan. Wie de wizard wegklikt heeft zijn
 * AI nog steeds niet ingesteld, en de checklist is precies de plek die dat
 * zichtbaar houdt. Overslaan mag dus NOOIT de checklist wegnemen.
 *
 * ── Waarom er geen aparte stap-administratie is ─────────────────────────────
 * De checklist leidt zijn vinkjes af uit de echte config (aiName, autoReplyTpl,
 * aiInstructions, Google-token, aantal leads). Slaat de wizard die velden op,
 * dan vinkt de checklist zichzelf af. Eén bron van waarheid; er is niets dat uit
 * de pas kan lopen. Dit bestand controleert dat die afleiding echt werkt.
 *
 * ── Waar "klaar" staat ──────────────────────────────────────────────────────
 * Server-side (Welcome Done op de klantrij), niet in localStorage: anders begint
 * dezelfde klant op zijn telefoon opnieuw bij stap 1. De stap waar hij gebleven
 * is staat wél lokaal -- dat is gemak binnen één sessie, geen waarheid.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

delete require.cache[require.resolve('../api/dashboard.js')];
const dash = require('../api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} },
     { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

console.log('\n— de wizard bestaat en heeft vier stappen —');
ck('checkWelkomWizard staat in de pagina', /async function checkWelkomWizard\(\)/.test(html), null);
ck('vier stappen',
   /WIZARD_STAPPEN = \['intro', 'bedrijf', 'ai', 'klaar'\]/.test(html), null);
ck('met een label per stap in de rail', /WIZARD_LABELS = \{/.test(html), null);
ck('het is een echte dialoog', /overlay\.setAttribute\('role', 'dialog'\)/.test(html), null);
ck('fouten worden hardop gemeld', /fout\.setAttribute\('role', 'alert'\)/.test(html), null);

console.log('\n— Faro leidt rond en wisselt per stap —');
ck('elke stap heeft een eigen mascotte-toestand',
   /intro:\s*'\/faro\/falcon-idle\.webp'/.test(html)
   && /bedrijf:\s*'\/faro\/falcon-thinking\.webp'/.test(html)
   && /ai:\s*'\/faro\/falcon-generating\.webp'/.test(html)
   && /klaar:\s*'\/faro\/falcon-success\.webp'/.test(html), null);
ck('en zegt per stap iets', /gidsTekst\.textContent = \{/.test(html), null);
ck('hij is decoratie voor schermlezers',
   /mascotte\.setAttribute\('aria-hidden', 'true'\)/.test(html), null);

console.log('\n— opslaan loopt via de bestaande route, niet via een eigen eindpunt —');
ck("wizardBewaar gebruikt mode:'config-save'",
   /function wizardBewaar[\s\S]{0,400}mode: 'config-save'/.test(html), null);
ck('en leest de bestaande config met config-get',
   /checkWelkomWizard[\s\S]{0,600}mode: 'config-get'/.test(html), null);

console.log('\n— overslaan zet de wizard uit, maar NIET de checklist —');
{
  const sluit = (html.match(/function wizardSluit\(afgerond\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('wizardSluit zet welcomeDone', /welcomeDone: true/.test(sluit), null);
  ck('en raakt checklistDismissed nergens aan',
     sluit.indexOf('checklistDismissed') === -1, sluit.slice(0, 200));
  ck('de hele wizard raakt checklistDismissed niet aan',
     (html.match(/wizard[\s\S]{0,20000}?checklistDismissed/g) || []).length === 0
     || html.indexOf('checklistDismissed: true') === html.lastIndexOf('checklistDismissed: true'), null);
}

console.log('\n— hij komt niet terug, en niet voor de verkeerde mensen —');
{
  const check = (html.match(/async function checkWelkomWizard\(\) \{[\s\S]*?\n\}/) || [''])[0];
  ck('afgerond -> niet meer tonen', /if \(d\.welcomeDone === true\) return false;/.test(check), null);
  ck('alleen voor een echte klant met projectcode',
     /localStorage\.getItem\('hv-project'\)/.test(check), null);
  ck('een klant die alles al ingevuld heeft krijgt hem niet',
     /var alKlaar = !!\(d\.aiName && d\.autoReplyTpl && d\.aiInstructions\)/.test(check), null);
  ck('en wordt dan meteen afgevinkt', /if \(alKlaar\) \{ wizardBewaar\(\{ welcomeDone: true \}\)/.test(check), null);
}

console.log('\n— hervatten na een herlaadbeurt —');
ck('de stap wordt lokaal onthouden', /function wizardOnthoudStap\(i\)/.test(html), null);
ck('en bij het sluiten weer vergeten', /function wizardVergeetStap\(\)/.test(html), null);
ck('met een grens, zodat een geknoeide waarde niet buiten de reeks valt',
   /n >= 0 && n < WIZARD_STAPPEN\.length/.test(html), null);

console.log('\n— het oude onboardingpad draait niet dubbel —');
ck('checkFirstTimeSetup alleen als de wizard NIET getoond wordt',
   /checkWelkomWizard\(\)\.then\(function \(getoond\) \{[\s\S]{0,120}if \(!getoond\) checkFirstTimeSetup\(\);/.test(html), null);
ck('en ook bij een fout valt hij terug op het oude pad',
   /\.catch\(function \(\) \{ checkFirstTimeSetup\(\); \}\)/.test(html), null);

console.log('\n— invoer wordt gecontroleerd voor hij bewaard wordt —');
ck('een te kort bedrijfsverhaal wordt tegengehouden',
   /over\.length < 20/.test(html), null);
ck('een AI zonder naam ook', /if \(!naam\) \{/.test(html), null);
ck('en een te kort welkomstbericht', /begroet\.length < 10/.test(html), null);

console.log('\n— Escape gooit je werk niet weg —');
ck('Escape sluit alleen op de introstap',
   /if \(e\.key === 'Escape'\) \{[\s\S]{0,200}if \(_wizardStap === 0\) wizardSluit\(false\);/.test(html), null);

console.log('\n— de checklist vinkt zichzelf af uit de config —');
{
  /* Dit is de kern van "geen dubbele waarheid": de wizard schrijft config, en
     getOnboardingChecklistItems() leidt daar zijn vinkjes uit af. Hier draaien
     we die functie echt, met de config zoals de wizard hem achterlaat. */
  const vm = require('vm');
  const m = html.match(/function getOnboardingChecklistItems\(d\) \{[\s\S]*?\n\}/);
  ck('de checklistfunctie staat in de pagina', !!m, null);
  if (m) {
    /* tr() is de vertaalfunctie van de pagina. Die staat buiten het stuk dat we
       hier uitknippen, dus we geven hem mee -- checklistlogica testen we, niet
       de vertaling. Hij geeft de sleutel terug, zodat een gemiste vertaling
       hier zichtbaar blijft in plaats van als lege tekst weg te vallen. */
    const sandbox = { state: { stats: { total: 0 } }, tr: (sleutel) => sleutel };
    vm.createContext(sandbox);
    vm.runInContext(m[0] + '; this.__f = getOnboardingChecklistItems;', sandbox);
    const leeg = sandbox.__f({ emailVerified: true });
    const naWizard = sandbox.__f({
      emailVerified: true,
      aiInstructions: 'Wij zijn makelaarskantoor Teljo in Aalst.',
      aiName: 'Mathis',
      autoReplyTpl: 'Dag! Ik ben Mathis. Waarmee kan ik u helpen?',
    });
    const open = (arr) => arr.filter(i => !i.done).map(i => i.key);
    ck('zonder config staan business en ainame open',
       open(leeg).indexOf('business') > -1 && open(leeg).indexOf('ainame') > -1, open(leeg).join(','));
    ck('met de wizard-velden vinken ze zichzelf af',
       open(naWizard).indexOf('business') === -1 && open(naWizard).indexOf('ainame') === -1, open(naWizard).join(','));
    ck('en gcal + lead blijven staan — overslaan neemt de checklist niet weg',
       open(naWizard).indexOf('gcal') > -1 && open(naWizard).indexOf('lead') > -1, open(naWizard).join(','));
  }
}

console.log('\n— de server bewaart en leest het vinkje —');
{
  const leads = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/leads.js'), 'utf8');
  ck('config-get geeft welcomeDone terug', /welcomeDone:\s*rec\.fields\['fldwlx60muAv60rUg'\]/.test(leads), null);
  ck('config-save schrijft hem weg', /wantsWelcomeDoneUpdate/.test(leads), null);
  /* Airtable weigert een HELE PATCH als één veldnaam niet bestaat. Elk
     "nieuw veld" gaat daarom apart -- anders zou dit het opslaan van aiName en
     de rest onderuit halen. Zie de uitleg bij Match Lead Language in leads.js. */
  ck('en doet dat in een APARTE patch, niet in de gezamenlijke',
     /if \(wantsWelcomeDoneUpdate\) \{[\s\S]{0,400}fldwlx60muAv60rUg/.test(leads), null);
  ck('best-effort: een mislukking laat de rest van de save staan',
     /\[config-save\] "Welcome Done" niet opgeslagen/.test(leads), null);
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
