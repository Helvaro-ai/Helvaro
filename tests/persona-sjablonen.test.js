'use strict';
/*
 * De voorbeeldteksten op "Je assistent": 22 stuks, vier talen.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * AP_TEMPLATES en AP_INSTRUCTION_SNIPPETS stonden als 95 regels Nederlands
 * proza in api/dashboard.js, en ze waren onzichtbaar voor de lektest omdat het
 * geen labels zijn maar DATA: geen textContent, geen attribuut, geen >tekst<.
 * Een Duitse makelaar zag ze in het Nederlands verschijnen op een verder
 * volledig Duits scherm.
 *
 * Je zou kunnen denken dat het niet uitmaakt -- de AI begrijpt elke taal. Maar
 * deze tekst is niet voor de AI. De eigenaar klikt erop, de tekst komt in ZIJN
 * invoerveld, en daarna moet hij hem kunnen lezen en aanpassen. Wie op een knop
 * drukt en er een zin uit krijgt die hij niet kan controleren, plakt hem blind
 * of gebruikt de knop nooit meer.
 *
 * ── Wat hier vooral bewaakt wordt: de PLAATSHOUDERS ────────────────────────
 * {naam}, {ai}, {bedrijf} en {bron} worden elders in de code vervangen. Ze zijn
 * dus geen woorden maar sleutels. Vertaal je {naam} per ongeluk naar {Name},
 * dan wordt hij niet meer vervangen en leest de LEAD letterlijk "{Name}" in
 * zijn eerste bericht -- de eerste indruk van het bedrijf, met een stuk code
 * erin. Dat gaat stil mis: het is geen fout, het is een verkeerd woord.
 */
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 400) : '')); }
}

const mod  = require(path.join(BASE, 'api/_dash/persona-sjablonen.js'));
const bron = require('fs').readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');
const TALEN = ['nl', 'fr', 'en', 'de'];

console.log('\n  vier talen, even veel voorbeelden');
{
  for (const t of TALEN) {
    ck(t + ': 13 welkomstberichten', mod.welkom(t).length === 13, mod.welkom(t).length);
    ck(t + ': 9 instructie-fragmenten', mod.instructies(t).length === 9, mod.instructies(t).length);
  }
  /* Een taal die achterloopt is het voor de hand liggende risico bij vier
     lijsten naast elkaar. */
  const leeg = [];
  for (const t of TALEN) {
    for (const lijst of [mod.welkom(t), mod.instructies(t)]) {
      lijst.forEach((x, i) => { if (!x.label || !x.text || x.text.length < 30) leeg.push(t + '#' + i); });
    }
  }
  ck('geen enkel voorbeeld is leeg of half', leeg.length === 0, leeg);
}

console.log('\n  de plaatshouders blijven in elke taal identiek');
{
  /* DE belangrijkste controle in dit bestand. */
  const PLAATS = /\{[a-zA-Z]+\}/g;
  for (const soort of ['welkom', 'instructies']) {
    const nl = mod[soort]('nl');
    for (const taal of ['fr', 'en', 'de']) {
      const vert = mod[soort](taal);
      const stuk = [];
      vert.forEach((x, i) => {
        const hier = (x.text.match(PLAATS) || []).sort().join(',');
        const daar = (nl[i].text.match(PLAATS) || []).sort().join(',');
        if (hier !== daar) stuk.push({ i: i, nl: daar, [taal]: hier });
      });
      ck(taal + '/' + soort + ': dezelfde plaatshouders als het Nederlands', stuk.length === 0, stuk);
    }
  }
  /* En geen plaatshouder die nergens vervangen wordt: alleen deze vier bestaan. */
  const TOEGESTAAN = ['{naam}', '{ai}', '{bedrijf}', '{bron}'];
  const vreemd = new Set();
  for (const taal of TALEN) {
    for (const lijst of [mod.welkom(taal), mod.instructies(taal)]) {
      for (const x of lijst) for (const p of (x.text.match(PLAATS) || [])) if (TOEGESTAAN.indexOf(p) === -1) vreemd.add(p);
    }
  }
  ck('geen onbekende plaatshouders', vreemd.size === 0, [...vreemd]);
  /* Vervangt de code die vier ook echt? Anders staan ze straks alsnog letterlijk
     in het bericht van een lead. */
  for (const p of TOEGESTAAN) {
    ck('dashboard.js vervangt ' + p, bron.indexOf(p.slice(1, -1)) > -1, p);
  }
}

console.log('\n  echt vertaald, niet gekopieerd');
{
  const NL_WOORDEN = /\b(bedankt voor je|bedankt voor uw|goeiedag|vraag altijd|praat|wagen|gesprek|hier van)\b/i;
  for (const taal of ['fr', 'en', 'de']) {
    for (const soort of ['welkom', 'instructies']) {
      const verdacht = mod[soort](taal).filter((x) => NL_WOORDEN.test(x.text) || NL_WOORDEN.test(x.label));
      ck(taal + '/' + soort + ': geen Nederlandse zinnen blijven staan', verdacht.length === 0, verdacht.map((x) => x.label));
    }
  }
  /* Labels moeten per taal verschillen -- op de handvol na die in twee talen
     toevallig hetzelfde geschreven worden. */
  for (const taal of ['fr', 'en', 'de']) {
    const nl = mod.welkom('nl'), vert = mod.welkom(taal);
    const gelijk = vert.filter((x, i) => x.label === nl[i].label).map((x) => x.label);
    ck(taal + ': de labels zijn vertaald', gelijk.length === 0, gelijk);
  }
}

console.log('\n  de sjablonen belanden ook echt in de pagina');
{
  /* Het patroon dat in dit project al zeven keer voorkwam: gebouwd, getest, en
     nooit aangeroepen. */
  ck('dashboard.js laadt de module', /require\('\.\/_dash\/persona-sjablonen'\)/.test(bron));
  ck('en zet de welkomstberichten erin', /const AP_TEMPLATES = \$\{JSON\.stringify\(_persona\.welkom\(/.test(bron));
  ck('en de instructie-fragmenten', /const AP_INSTRUCTION_SNIPPETS = \$\{JSON\.stringify\(_persona\.instructies\(/.test(bron));
  ck('in de taal van het dashboard', /_persona\.welkom\(_i18n\.kort\(UI_LANG\)\)/.test(bron));
  ck('de oude ingebakken lijsten zijn weg', bron.indexOf("const AP_TEMPLATES = [\n") === -1);
}

console.log('\n  veilig binnen een <script> in de pagina');
{
  /* Deze array gaat als JSON een <script>-blok in. Een tekst met </script> erin
     sluit dat blok vroegtijdig en laat de rest van het dashboard als HTML
     lezen -- een leeg scherm, zonder foutmelding. */
  for (const taal of TALEN) {
    const json = JSON.stringify([mod.welkom(taal), mod.instructies(taal)]);
    ck(taal + ': geen </script> of <!-- in de teksten',
      json.indexOf('</script') === -1 && json.indexOf('<!--') === -1);
    ck(taal + ': de JSON is rond', JSON.parse(json)[0].length === 13);
  }
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
