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

/* ── Drie die er later alsnog uit kwamen ─────────────────────────────────────
 * Bovenstaande drie zijn gevonden door de bron te lezen. Deze drie zijn
 * gevonden door de app in Chromium te openen en elk zichtbaar element op te
 * meten, op 1440 en op 390. Dat verschil is de les: een grep vindt alleen wat
 * je al vermoedde.
 *
 *   .faro-rail__viewall   187x14 -- "Bekijk alle gesprekken", onderaan de rail.
 *   .login-link           141x16 -- "Wachtwoord vergeten?" onder het formulier.
 *                         Geen link in lopende tekst, dus de uitzondering van
 *                         2.5.8 geldt hier niet.
 *   .brand-dot             20x24 -- de streepjes van de carrousel. Iemand had
 *                         de HOOGTE al naar 24 gebracht en het commentaar
 *                         erboven noemt "24x24" met zoveel woorden; alleen de
 *                         breedte bleef op 20 staan. Half af telt niet.
 */
console.log('\n  en de drie die pas in de browser opvielen');
{
  const faro = fs.readFileSync(BASE + 'api/_faro/ui/styles.js', 'utf8');
  const rail = /\.faro-rail__viewall \{([^}]*)\}/.exec(faro);
  ck('.faro-rail__viewall bestaat', !!rail);
  /* --sp-6 IS 24px, dus dit blijft op de ontwerpschaal die faro-check bewaakt. */
  ck('en is minstens 24 hoog via de schaal',
    rail && /min-height:\s*var\(--sp-6\)/.test(rail[1]), rail && rail[1].trim());

  const link = /\.login-link \{([^}]*)\}/.exec(code);
  ck('.login-link bestaat', !!link);
  ck('en is minstens 24 hoog', link && /min-height:\s*24px/.test(link[1]), link && link[1].trim());

  const dot = /\.brand-dot \{([^}]*)\}/.exec(code);
  ck('.brand-dot bestaat', !!dot);
  ck('en is nu ook 24 BREED, niet alleen hoog',
    dot && /width:\s*24px/.test(dot[1]) && /height:\s*24px/.test(dot[1]), dot && dot[1].trim());
  /* Het streepje moet 20 blijven: de knop groeit, het beeld niet. */
  ck('terwijl het streepje 20 blijft',
    dot && /center \/ 20px 4px/.test(dot[1]), dot && dot[1].trim());
  /* En de hart-op-hart-afstand blijft 26px: 20+6 was het, 24+2 is het. */
  const dots = /\.brand-dots \{([^}]*)\}/.exec(code);
  ck('en de rij houdt dezelfde hart-op-hart-afstand',
    dots && /gap:\s*2px/.test(dots[1]), dots && dots[1].trim());
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
