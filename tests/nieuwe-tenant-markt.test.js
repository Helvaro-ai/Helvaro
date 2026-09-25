'use strict';
/*
 * Een NIEUWE klant begint als dealership. Een BESTAANDE blijft vastgoed.
 *
 * ── Waarom dit twee verschillende dingen zijn ───────────────────────────────
 * api/_vertical.js leest een leeg Vertical/Niche-veld als vastgoed. Dat is
 * geen smaak maar een vangnet: elke klant van voor de verticals heeft die
 * velden leeg, en zou leeg iets anders gaan betekenen, dan neemt Helvaro op de
 * dag van uitrol elke makelaar zijn pandcontext af. Zijn aanbodscherm
 * verdwijnt, Faro herkent zijn panden niet meer, en er gaat niets stuk dat een
 * foutmelding oplevert.
 *
 * Sindi stuurt sinds 2026-09-25 op de dealermarkt en wil dat nieuwe klanten
 * als dealer beginnen. De veilige manier om dat te doen is NIET de terugval
 * omdraaien, maar bij het AANMAKEN een expliciete waarde wegschrijven. Een
 * nieuwe rij is per definitie geen bestaande rij.
 *
 * Vandaar twee constanten die makkelijk door elkaar te halen zijn:
 *
 *   VASTGOED          de terugval voor een leeg of onbekend veld  -- vast
 *   STANDAARD_NIEUW   wat een nieuw record expliciet meekrijgt    -- dealership
 *
 * Deze test bewaakt precies dat onderscheid. Wordt de terugval ooit
 * "verbeterd" naar dealership, dan valt hier iets om in plaats van bij een
 * klant.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

const v = require(path.join(BASE, 'api/_vertical.js'));

console.log('\n  de terugval voor bestaande klanten blijft vastgoed');
{
  /* DIT is de regel die nooit mag kantelen. Elke variant van "niets ingevuld". */
  ck('leeg record',            v.van({}) === v.VASTGOED, v.van({}));
  ck('beide velden leeg',      v.van({ [v.VELD_ID]: '', [v.NICHE_VELD_ID]: '' }) === v.VASTGOED);
  ck('velden op null',         v.van({ [v.VELD_ID]: null, [v.NICHE_VELD_ID]: null }) === v.VASTGOED);
  ck('onbekende waarde',       v.van({ [v.VELD_ID]: 'iets nieuws' }) === v.VASTGOED);
  ck('geen record',            v.van(null) === v.VASTGOED);
  /* En expliciet vastgoed blijft natuurlijk vastgoed. */
  ck('expliciet vastgoed',     v.van({ [v.VELD_ID]: 'vastgoed' }) === v.VASTGOED);
}

console.log('\n  een nieuw record krijgt dealership mee');
{
  ck('STANDAARD_NIEUW is dealership', v.STANDAARD_NIEUW === v.DEALERSHIP, v.STANDAARD_NIEUW);
  /* En is NIET hetzelfde als de terugval -- anders is deze hele constructie
     zinloos en merkt niemand het. */
  ck('en is iets anders dan de terugval', v.STANDAARD_NIEUW !== v.VASTGOED);

  const nieuw = {};
  nieuw[v.VELD_ID]       = v.STANDAARD_NIEUW;
  nieuw[v.NICHE_VELD_ID] = v.STANDAARD_NIEUW;
  ck('zo\'n record leest als dealership', v.van(nieuw) === v.DEALERSHIP, v.van(nieuw));
  ck('en heeft een aanbod', v.heeftAanbod(v.van(nieuw)) === true);
}

console.log('\n  beide aanmaakpaden zetten het veld echt');
{
  /* Zonder dit staat de constante er wel, maar schrijft niemand hem weg -- het
     gebouwd-maar-niet-aangesloten dat in dit project al vaker langskwam. */
  const clerk = fs.readFileSync(path.join(BASE, 'api/_clerk.js'), 'utf8');
  ck('_clerk.js importeert _vertical',   /require\('\.\/_vertical'\)/.test(clerk), null);
  ck('_clerk.js schrijft Vertical weg',  /\[_vertical\.VELD_ID\]:\s*_vertical\.STANDAARD_NIEUW/.test(clerk), null);
  ck('_clerk.js schrijft Niche weg',     /\[_vertical\.NICHE_VELD_ID\]:\s*_vertical\.STANDAARD_NIEUW/.test(clerk), null);

  const admin = fs.readFileSync(path.join(BASE, 'api/admin.js'), 'utf8');
  ck('admin.js valt terug op STANDAARD_NIEUW', /sector \|\| _vertNieuw\.STANDAARD_NIEUW/.test(admin), null);
  ck('admin.js zet Vertical ook',              /fields\[_vertNieuw\.VELD_ID\]/.test(admin), null);
  /* Een opgegeven sector moet WINNEN -- anders kan Sindi geen makelaar meer
     onboarden zonder achteraf in Airtable te gaan klikken. */
  ck('een opgegeven sector wint nog steeds',   /sector\s*\n?\s*\?\s*_vertNieuw\.van\(/.test(admin), null);
}

console.log('\n  de keuze van de klant wint over de standaard');
{
  /* De inrichtingsassistent schrijft de gekozen markt weg. Kiest een makelaar
     "Vastgoed", dan moet dat het veld overschrijven -- de standaard is een
     startpunt, geen slot. */
  const dash = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');
  ck('de wizard bewaart de gekozen markt',
    /wizardBewaar\(\{[^}]*vertical/.test(dash) || /vertical:\s*gekozen\.vertical/.test(dash), null);

  /* En de resolutie respecteert dat: een expliciete keuze slaat de standaard. */
  for (const [gekozen, verwacht] of [['vastgoed', v.VASTGOED], ['dealership', v.DEALERSHIP], ['keuken', 'keuken']]) {
    ck('gekozen ' + gekozen + ' leest terug als ' + verwacht,
      v.van({ [v.VELD_ID]: gekozen }) === verwacht, v.van({ [v.VELD_ID]: gekozen }));
  }
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
