/*
 * De CRM/Faro-schakelaar: bovenaan de zijbalk, groot, en met Faro's merkteken.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * De schakelaar is niet zomaar een knop: het is de keuze tussen de twee helften
 * van de app. Hij was klein en grijs, en dan vind je hem niet.
 *
 * Wat hier bewaakt wordt, en waarom elk punt er staat:
 *
 *  1. HIJ STAAT BUITEN HET SCROLLENDE DEEL. Van de zijbalk scrollt alleen
 *     .sidebar-nav (gemeten: 758px inhoud in 636px ruimte). Belandt de
 *     schakelaar daarbinnen, dan schuift hij weg zodra iemand door de
 *     navigatie scrollt -- precies de klacht waarmee dit begon.
 *
 *  2. HIJ IS GROOT EN LEESBAAR. --fs-small (13px) was de oude maat en te klein
 *     voor de hoofdschakelaar van de app. En de niet-gekozen kant stond in
 *     --text-muted, wat er een uitgeschakelde knop van maakte terwijl het de
 *     helft van de keuze is.
 *
 *  3. DE BOL STAAT STIL. Op de landingspagina draait en ademt Faro's bol; op
 *     14px naast een woord dat je moet lezen is dat geen sfeer maar geflikker.
 *
 *  4. DE BOL PRAAT NIET MEE. aria-hidden, anders hoort een schermlezer
 *     "afbeelding, Faro" terwijl het pictogram niets toevoegt aan het label.
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}
const kaal = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code   = kaal(fs.readFileSync(BASE + 'api/dashboard.js', 'utf8'));
const css    = kaal(fs.readFileSync(BASE + 'api/_faro/ui/styles.js', 'utf8'));
const markup = kaal(fs.readFileSync(BASE + 'api/_faro/ui/markup.js', 'utf8'));

console.log('\n  hij staat bovenaan de zijbalk, buiten wat scrollt');
{
  const iAside = code.indexOf('<aside class="sidebar"');
  const iCta   = code.indexOf('${faro.navCta}');
  const iNav   = code.indexOf('<nav class="sidebar-nav"');
  const iNavEnd= code.indexOf('</nav>', iNav);
  const iEnd   = code.indexOf('</aside>');
  ck('de schakelaar wordt ingevoegd', iCta > -1);
  ck('binnen de zijbalk', iCta > iAside && iCta < iEnd, { iAside, iCta, iEnd });
  /* Dit is het punt. .sidebar-nav is het enige dat scrollt; erbinnen zou hij
     meeschuiven zodra de navigatie langer is dan het venster. */
  ck('maar BUITEN .sidebar-nav', !(iCta > iNav && iCta < iNavEnd), { iNav, iCta, iNavEnd });
  ck('en ervoor, dus bovenaan', iCta < iNav, { iCta, iNav });
}

console.log('\n  hij is groot genoeg om te vinden');
{
  const blok = /\.hv-switch \{([\s\S]*?)\n\}/.exec(css);
  ck('.hv-switch is gedefinieerd', !!blok);
  ck('en neemt de volle breedte van de zijbalk',
    blok && /width:\s*calc\(100% - 24px\)/.test(blok[1]), blok && blok[1].slice(0, 160));
  ck('twee gelijke helften', blok && /grid-template-columns:\s*1fr 1fr/.test(blok[1]));

  const tab = /\.hv-switch__tab \{([\s\S]*?)\n\}/.exec(css);
  ck('de tabs zijn gedefinieerd', !!tab);
  ck('op leesmaat, niet op bijschriftmaat',
    tab && /font-size:\s*var\(--fs-body\)/.test(tab[1]), tab && tab[1].slice(0, 200));
  ck('de niet-gekozen kant is gewoon leesbaar',
    tab && /color:\s*var\(--text\)/.test(tab[1]) && !/color:\s*var\(--text-muted\)/.test(tab[1]),
    tab && tab[1].slice(0, 200));
}

console.log('\n  Faro draagt zijn eigen merkteken');
{
  /* Deze blok toetste eerst de UITVOERING van het merkteken: een bol, met
     'conic-gradient(from 200deg, var(--champagne)' erin. Toen het merkteken
     Faro's eigen pictogram werd was elk van die vier regels rood, terwijl er
     aan het GEDRAG niets veranderde -- precies de val uit HELVARO-ARCHITECTUUR
     §7 ("toets gedrag, geen bewoording"). Nu toetst het wat het altijd al
     bedoelde: Faro's kant draagt een merkteken, alleen die kant, het praat
     niet mee tegen een schermlezer, en het is op beide kanten zichtbaar. */
  ck('de Faro-kant krijgt een merkteken', /hv-switch__merk/.test(markup));
  /* Alleen Faro. Een pictogram naast allebei zegt niets meer dan de woorden. */
  const cta = /function navCta\(t\) \{[\s\S]*?\n\}/.exec(markup);
  ck('en alleen die kant',
    cta && (cta[0].match(/hv-switch__merk/g) || []).length === 1,
    cta && (cta[0].match(/hv-switch__merk/g) || []).length);
  ck('het merkteken praat niet mee tegen een schermlezer',
    /hv-switch__merk[^>]*aria-hidden="true"/.test(markup));
  /* Een <img> zonder alt laat een schermlezer terugvallen op de bestandsnaam;
     aria-hidden alleen is niet genoeg als hij ooit uit de boom valt. */
  ck('en heeft een lege alt', /hv-switch__merk[^>]*alt=""/.test(markup));
  /* Het is Faro zelf, niet een abstractie ervan. */
  ck('het is Faro zelf', /hv-switch__merk[^>]*faro-icon\.webp/.test(markup));
  /* Zonder afmetingen in de HTML verspringt de schakelaar zodra het plaatje
     binnen is -- in de zijbalk, waar de rest van de navigatie onder staat. */
  ck('met afmetingen, zodat de rij niet verspringt',
    /hv-switch__merk[^>]*width="16"[^>]*height="16"/.test(markup));

  const merk = /\.hv-switch__merk \{([\s\S]*?)\n\}/.exec(css);
  ck('het merkteken is gestyled', !!merk);
  /* Het bestand is vierkant met transparante randen; uitrekken vervormt de
     kop en object-fit houdt hem heel. */
  ck('en wordt niet uitgerekt', merk && /object-fit:\s*contain/.test(merk[1]),
    merk && merk[1].slice(0, 200));
  /* Op deze maat zou een bewegend pictogram naast tekst alleen ruis zijn. */
  ck('het staat stil', merk && !/animation/.test(merk[1]), merk && merk[1].slice(0, 200));
  /* Op de niet-gekozen kant ligt hij op de donkere balk; Faro is bijna zwart,
     dus zonder een zweem licht valt hij daar weg. */
  ck('en blijft zichtbaar op de niet-gekozen kant',
    /\.hv-switch__tab:not\(\.active\) \.hv-switch__merk \{[^}]*(filter|box-shadow)/.test(css));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
