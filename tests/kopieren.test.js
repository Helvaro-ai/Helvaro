/*
 * Kopiëren zegt of het gelukt is.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * navigator.clipboard.writeText() KAN weigeren, en dat is geen zeldzaamheid:
 * geen https, geen toestemming, een webview, of een browser die het alleen
 * toestaat direct na een klik. De belofte wordt dan afgewezen.
 *
 * Op vier plekken werd dat niet opgevangen:
 *
 *   twee zonder .catch    -- het telefoonnummer in de opvolglijst en dat in het
 *                            leadpaneel. Een onafgehandelde belofte, geen
 *                            melding, en niets in het plakbord. Bellen is
 *                            precies waar die schermen voor bestaan.
 *   twee met .catch(() => {})
 *                         -- de uitnodigingslink en de velden in het
 *                            nieuwe-klantscherm. Stilte is hier erger dan een
 *                            fout: je plakt wat er nog in je plakbord stond.
 *
 * En bij SUCCES deden diezelfde twee het omgekeerde van bevestigen: ze zetten
 * de knoptekst op '' -- de knop werd anderhalve tot twee seconden leeg. Het
 * moment waarop je bevestiging wil is het moment waarop het woord verdween.
 *
 * Zes andere plekken deden het al goed. Die staan hier ook in, zodat de twee
 * manieren niet opnieuw uit elkaar lopen.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const dash = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 260)}`);
  ok ? pass++ : fail++;
};

console.log('\nKopiëren naar het plakbord meldt zijn eigen mislukking');

console.log('\n  elke aanroep vangt een weigering op');
{
  /* Per aanroep het stuk erna bekijken. 400 tekens is ruim genoeg voor de
     langste keten hier en kort genoeg om niet in de volgende functie te
     belanden. */
  const sites = [];
  const re = /navigator\.clipboard\.writeText\(/g;
  let m;
  while ((m = re.exec(dash)) !== null) {
    const staart = dash.slice(m.index, m.index + 400);
    sites.push({ index: m.index, heeftCatch: /\.catch\s*\(/.test(staart) });
  }

  ck('er zijn kopieerknoppen om te controleren', sites.length >= 8, { gevonden: sites.length });
  const zonder = sites.filter((s) => !s.heeftCatch);
  ck('en geen enkele laat een weigering vallen', zonder.length === 0,
    { zonderCatch: zonder.length, posities: zonder.map((s) => s.index) });
}

console.log('\n  en niemand slikt de fout stilletjes in');
{
  /* .catch(() => {}) is geen afhandeling, het is verstoppen. Op deze vier
     plekken hoort de gebruiker het te horen -- via een toast, via een
     knoptekst, of met de handmatige terugval (selecteren + execCommand). */
  const leeg = [...dash.matchAll(/navigator\.clipboard\.writeText\([\s\S]{0,400}?\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/g)];
  ck('geen lege .catch achter een kopieeractie', leeg.length === 0,
    { gevonden: leeg.length });
}

console.log('\n  succes bevestigt in plaats van te verdwijnen');
{
  const invite = /function copyInviteLink\(\)[\s\S]*?\n\}/.exec(dash);
  ck('copyInviteLink bestaat', !!invite, null);
  ck('en zet de knop niet leeg', !!invite && !/btn\.textContent = '';/.test(invite[0]),
    invite ? invite[0].slice(0, 200) : null);
  ck('maar bevestigt met een vertaalde tekst',
    !!invite && /btn\.textContent = tr\('tst\.gekopieerd'\)/.test(invite[0]), null);
  /* De tekst die daarna terugkomt stond hardgecodeerd in het Nederlands. */
  ck('en herstelt ook vertaald, niet hardgecodeerd',
    !!invite && !/= 'Kopieer';/.test(invite[0]) && /tr\('dash\.form\.copy'\)/.test(invite[0]),
    invite ? invite[0].slice(-200) : null);

  const veld = /function copyNcField\(srcId, btnId\)[\s\S]*?\n\}/.exec(dash);
  ck('copyNcField bestaat', !!veld, null);
  ck('en doet hetzelfde', !!veld && !/btn\.textContent = '';/.test(veld[0])
    && /btn\.textContent = tr\('tst\.gekopieerd'\)/.test(veld[0]),
    veld ? veld[0].slice(0, 220) : null);
  /* De oorspronkelijke tekst moet wel terugkomen: deze knop staat in een lijst
     waar elk veld zijn eigen opschrift heeft. */
  ck('maar herstelt daarna zijn eigen opschrift',
    !!veld && /const orig = btn\.textContent;/.test(veld[0])
           && /btn\.textContent = orig;/.test(veld[0]), null);
}

console.log('\n  de melding bestaat in alle vier de talen');
{
  const i18n = fs.readFileSync(BASE + 'api/_i18n.js', 'utf8');
  const regel = /'tst\.kopierenMislukt':\s*\{([^}]*)\}/.exec(i18n);
  ck('tst.kopierenMislukt staat in het woordenboek', !!regel, null);
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    ck(`  en heeft een ${taal}-vertaling`,
      !!regel && new RegExp(`\\b${taal}:\\s*'[^']+'`).test(regel[1]), regel && regel[1]);
  }
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
