/*
 * Een eerder gesprek openen hoort het gesprek te tonen -- met tekst, en met
 * een invoerveld eronder.
 *
 * ── Wat er op de live app gebeurde (2026-09-13) ─────────────────────────────
 * Elk eerder gesprek opende als een draad van LEGE bubbels, zonder tekstvak.
 * Twee oorzaken, allebei hieronder vastgelegd zodat ze niet terugkomen:
 *
 *   1. api/_faro/store.js gaf per bericht alleen `content`-blokken terug; de
 *      client tekent `text`. De server antwoordde wel (dus de lokale kopie
 *      werd niet gebruikt), maar met niets dat de client kon tonen.
 *   2. faroEnterThread() verhuisde het invoerveld alleen als de landing nog
 *      zichtbaar was -- en faroOpenConversation had die net verborgen.
 *
 * Plus: de ingeklapte zijbalk kende de Faro-kant niet en knipte alles af.
 */
'use strict';

process.env.FARO_DEMO_MODE = '1';
process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test-nooit-echt';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'apptest00000000';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n— 1. de server geeft tekst en componenten terug —');
{
  /* rowToMessage is niet geexporteerd; listMessages in demo-stand loopt langs
     de fixtures en niet langs rowToMessage. Daarom rechtstreeks op de bron:
     de vorm die de client leest moet in de rij zitten. */
  const bron = strip(fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'store.js'), 'utf8'));
  const i = bron.indexOf('function rowToMessage');
  const body = bron.slice(i, bron.indexOf('\n}\n', i));
  ck('rowToMessage zet een platte text uit de text-blokken', /text:\s*blokken\.filter/.test(body), body.slice(0, 200));
  ck('rowToMessage geeft components terug', /components:\s*Array\.isArray\(components\)/.test(body));
  ck('een kapotte components-kolom wordt een lege lijst, geen crash', /components = \[\];/.test(body));
}

console.log('\n— 2. de client tekent tekst uit blokken en verhuist het invoerveld altijd —');
{
  const client = strip(fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'ui', 'client.js'), 'utf8'));
  const enter = client.slice(client.indexOf('function faroEnterThread()'), client.indexOf('function faroAppendUser('));
  ck('faroEnterThread verhuist het veld op basis van waar het STAAT, niet of de landing zichtbaar is',
     /form\.parentElement !== doel/.test(enter) && !/!landing\.hidden\)/.test(enter), enter.slice(0, 300));
  const open = client.slice(client.indexOf('function faroOpenConversation('), client.indexOf('function faroWireUploads('));
  ck('een bericht zonder text wordt uit zijn content-blokken gelezen', /m\.content\.filter/.test(open));
  ck('een leeg gesprek krijgt een uitleg in plaats van een leeg scherm', /convo\.geenBerichten/.test(open));
  ck('opgeslagen antwoorden worden met opmaak getekend', /faroRenderMarkdown\(b\.querySelector/.test(open));
  ck('de opmaak bouwt DOM-knopen en geen innerHTML met modeltekst',
     /function faroRenderMarkdown/.test(client) && !/faroRenderMarkdown[\s\S]{0,3000}innerHTML\s*=/.test(client.slice(client.indexOf('function faroInline'), client.indexOf('function faroEnterThread'))));
}

console.log('\n— 3. de vier talen kennen de nieuwe zin —');
{
  const i18n = require('../api/_faro/ui/i18n.js');
  for (const lang of ['nl', 'fr', 'en', 'de']) {
    const t = i18n.translator ? i18n.translator(lang) : null;
    const zin = t ? t('convo.geenBerichten') : (i18n.STRINGS && i18n.STRINGS[lang] && i18n.STRINGS[lang]['convo.geenBerichten']);
    ck(`convo.geenBerichten bestaat in ${lang}`, typeof zin === 'string' && zin.length > 10 && zin !== 'convo.geenBerichten', zin);
  }
}

console.log('\n— 4. de ingeklapte zijbalk kent de Faro-kant —');
{
  const css = strip(fs.readFileSync(path.join(__dirname, '..', 'api', '_faro', 'ui', 'styles.js'), 'utf8'));
  ck('gesprekkenlijst gaat weg bij inklappen', /body\.sidebar-collapsed \.faro-rail__convos[^{]*\{\s*display:\s*none/.test(css)
     || /body\.sidebar-collapsed \.faro-rail__section,[\s\S]{0,200}display: none/.test(css));
  ck('navigatieknoppen tonen alleen hun pictogram', /body\.sidebar-collapsed \.faro-rail__item \{[^}]*font-size: 0/.test(css));
  ck('de CRM/Faro-schakelaar stapelt verticaal', /body\.sidebar-collapsed \.hv-switch \{[^}]*grid-template-columns: 1fr;/.test(css));
  const cmd = strip(fs.readFileSync(path.join(__dirname, '..', 'api', '_command-ui', 'styles.js'), 'utf8'));
  ck('de autopilot-knop verdwijnt zodra de landing weg is (hij hing over het gesprek)',
     /#faro-landing\[hidden\]\) \.cmd-auto \{ display: none; \}/.test(cmd));
}

console.log('\n— 5. één hapering is geen storing —');
{
  const dash = strip(fs.readFileSync(path.join(__dirname, '..', 'api', 'dashboard.js'), 'utf8'));
  const i = dash.indexOf('function hvVerbindingsfout');
  const fn = dash.slice(i, i + 600);
  ck('de eerste mislukking wordt stil opnieuw geprobeerd', /_verbindingPogingen === 1/.test(fn) && /setTimeout/.test(fn), fn.slice(0, 200));
  ck('een 503 van de CRM slaat de stille poging over', /crmDown/.test(fn));
  ck('refreshData gebruikt de nieuwe drempel', /hvVerbindingsfout\(err\)/.test(dash));
  ck('de banner staat niet IN de Faro-pagina', /\.page\.active:not\(\.faro-page\)/.test(dash));
  ck('terugkerende verbinding ververst meteen', /addEventListener\('online'/.test(dash));
}

console.log(`\n${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
