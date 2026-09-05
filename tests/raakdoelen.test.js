/*
 * Wat je met een duim moet kunnen raken.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Op 390px doorgemeten. WCAG 2.5.8 (AA) vraagt 24x24 CSS-pixels als ONDERGRENS
 * voor iets wat je aanwijst; Apple en Android houden 44 en 48 aan als wat
 * comfortabel is. Onder de 24 zaten er drie soorten, allemaal op "Je
 * assistent" -- precies het scherm waar een nieuwe klant zijn AI instelt:
 *
 *   .ap-chip           19px hoog. Dit zijn {naam}, {bedrijf}, {ai} enzovoort,
 *                      die je aantikt om ze in het welkomstbericht te zetten.
 *                      Vier van die blokjes naast elkaar op een telefoon is
 *                      een loterij.
 *   .ap-checkbox-row   het label was 320 BREED en 16 HOOG. Het aanvinkgebied
 *                      was dus een streepje.
 *   input[radio/check] 13x13 en 16x16, de standaardmaat van de browser.
 *
 * En één die er WEL onder zit maar goed is zoals hij is: "hello@helvaro.pro"
 * als link midden in een zin. Inline links in lopende tekst zijn expliciet
 * uitgezonderd in 2.5.8 -- ze een blokhoogte geven zou de alinea uit elkaar
 * trekken voor niets.
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
const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');
const code = dash.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n  de rijen waar je op tikt zijn hoog genoeg');
{
  const rij = /\.ap-checkbox-row \{([^}]*)\}/.exec(code);
  ck('.ap-checkbox-row bestaat', !!rij);
  ck('en is minstens 44 hoog', rij && /min-height:\s*44px/.test(rij[1]), rij && rij[1].trim());

  const taal = /\.ap-lang-opt \{([^}]*)\}/.exec(code);
  ck('.ap-lang-opt ook', taal && /min-height:\s*44px/.test(taal[1]), taal && taal[1].trim());
}

console.log('\n  de vakjes zelf zijn groter dan wat de browser tekent');
{
  const vink = /\.ap-checkbox-row input\[type="checkbox"\] \{([^}]*)\}/.exec(code);
  ck('het vinkje is gestyled', !!vink);
  ck('en is 18px, niet de standaard 16', vink && /width:\s*18px/.test(vink[1]) && /height:\s*18px/.test(vink[1]), vink && vink[1].trim());
  /* Deze regel staat LATER in het bestand dan de rondje-regel en heeft
     dezelfde specificiteit. Een tweede regel erboven zetten deed niets --
     gemeten bleef het vinkje 16x16. Daarom staat de maat hier en niet daar. */
  const rondje = /\.ap-lang-opt input\[type="radio"\] \{([^}]*)\}/.exec(code);
  ck('het keuzerondje ook', rondje && /width:\s*18px/.test(rondje[1]), rondje && rondje[1].trim());
  ck('allebei in de merkkleur, niet Chrome-blauw',
    vink && /accent-color:\s*var\(--accent\)/.test(vink[1]) &&
    rondje && /accent-color:\s*var\(--accent\)/.test(rondje[1]));
}

console.log('\n  de invoegbare stukjes zijn geen speldenprikken meer');
{
  const chip = /\.ap-chip \{([^}]*)\}/.exec(code);
  ck('.ap-chip bestaat', !!chip);
  /* Via padding en niet via min-height: ze staan in een regel lopende tekst
     (.ap-hint) en moeten daarin blijven meelopen. */
  const pad = chip && /padding:\s*(\d+)px\s+(\d+)px/.exec(chip[1]);
  ck('met meer lucht dan de 2px van eerst', pad && Number(pad[1]) >= 5, pad && pad[0]);

  const mob = /@media \(max-width: 600px\) \{[\s\S]{0,400}?\.ap-chip \{([^}]*)\}/.exec(code);
  ck('en op een telefoon nog wat meer', !!mob, mob && mob[1]);
  const pad2 = mob && /padding:\s*(\d+)px/.exec(mob[1]);
  ck('genoeg om de 24px te halen', pad2 && Number(pad2[1]) >= 8, pad2 && pad2[0]);
  /* Twee chips onder elkaar mogen elkaar niet raken, anders verplaats je het
     probleem van "te klein" naar "je raakt de verkeerde". */
  ck('en de regel eromheen kreeg lucht', /\.ap-hint \{[^}]*line-height:\s*1\.9/.test(code));
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
