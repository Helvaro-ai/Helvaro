'use strict';
/*
 * Geen Nederlandse tekst meer op een scherm dat een klant ziet.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * Helvaro verkoopt aan Vlaamse, Waalse en Duitstalige bedrijven. Twee van die
 * drie markten lezen geen Nederlands. Toch stond er bij het begin van deze
 * ronde 127 keer een hardgecodeerde Nederlandse zin in het dashboard: lege
 * staten, foutmeldingen, knopteksten die tijdens het laden veranderen, de hele
 * welkomstwizard, en het venster dat een account wist.
 *
 * Ze zijn allemaal vervangen door vertaalsleutels. Deze test zorgt dat het niet
 * terugkruipt -- want dat gebeurt vanzelf: iemand voegt een knop toe, typt de
 * tekst er direct in omdat het "maar even" is, en niemand ziet het tot een
 * Franse klant er tegenaan loopt.
 *
 * ── Wat er WEL Nederlands mag blijven ──────────────────────────────────────
 * De back-office: page-admin en page-founder. Die schermen worden door
 * stripBackoffice uit de HTML van elke klant gehaald, en de enige lezer is
 * Nederlandstalig. Ze vertalen zou werk zijn zonder lezer.
 *
 * De grens loopt dus niet langs "staat er Nederlands in het bestand" maar
 * langs "kan een klant dit zien". Dat is precies wat hieronder gemeten wordt.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail, null, 1) : '')); }
}

const regels = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8').split('\n');

/* De back-officebereiken uit de BRON halen en niet uit vaste regelnummers:
   die schuiven bij elke wijziging op, en dan bewaakt deze test stilletjes de
   verkeerde helft van het bestand. */
function bereik(id) {
  const start = regels.findIndex((r) => r.indexOf('id="' + id + '"') > -1);
  if (start === -1) return null;
  for (let i = start; i < regels.length; i++) if (regels[i].indexOf('</main>') > -1) return [start + 1, i + 1];
  return null;
}
/* De back-office is niet alleen de drie <main>-blokken. Er hangen VENSTERS aan
   die er buiten staan -- de uitnodigingskaart van admin, en de twee
   founder-modals voor prospects en doelen. Zonder die erbij meldde deze test
   zestien "lekken" die stuk voor stuk in een scherm staan dat geen klant ooit
   krijgt (stripBackoffice haalt de pagina's weg, en de modals horen erbij).

   Ze worden op hun WRAPPER herkend en niet op regelnummers: die schuiven bij
   elke wijziging op, en dan bewaakt deze test stilletjes de verkeerde helft. */
function blokVanaf(zoek, sluitKlasse) {
  const start = regels.findIndex((r) => r.indexOf(zoek) > -1);
  if (start === -1) return null;
  let diepte = 0;
  for (let i = start; i < regels.length; i++) {
    diepte += (regels[i].match(/<div/g) || []).length - (regels[i].match(/<\/div>/g) || []).length;
    if (i > start && diepte <= 0) return [start + 1, i + 1];
  }
  return null;
}
/* HELP_ARTICLES staat er apart in. Dat zijn twaalf artikelen van samen 9.325
   tekens lopende tekst -- een ander soort werk dan een knoplabel, en het hoort
   in een eigen module met een eigen vertaling (zie de openstaande punten in
   HELVARO-ARCHITECTUUR). Het is BEWUST uitgezonderd en niet vergeten: zonder
   deze uitzondering zou deze test permanent rood staan op iets wat een aparte
   opdracht is, en dan wordt hij genegeerd in plaats van gelezen. */
function helpBlok() {
  const start = regels.findIndex((r) => /^var HELP_ARTICLES = \[/.test(r));
  if (start === -1) return null;
  let diepte = 0, gestart = false;
  for (let j = start; j < regels.length; j++) {
    diepte += (regels[j].match(/\[/g) || []).length - (regels[j].match(/\]/g) || []).length;
    if (!gestart && diepte > 0) gestart = true;
    if (gestart && diepte <= 0) return [start + 1, j + 1];
  }
  return null;
}

const BO = ['page-admin', 'page-founder', 'page-kosten'].map(bereik)
  .concat([helpBlok()])
  .concat([
    blokVanaf('id="new-client-modal"'),
    blokVanaf('id="pipe-modal-overlay"'),
    blokVanaf('id="goal-modal-overlay"'),
  ])
  .filter(Boolean);
/* De functies die BIJ die schermen horen staan buiten het HTML-blok. */
const BO_FN = /^(async )?function (fdr|loadFounder|loadKosten|loadAdmin|sendCoach|openPipeModal|openGoalModal|getFounderAdvice|initOutreach|renderOutreach|renderMeeting|submitNewClient|adm|kst)/;

/* De regels van een back-officefunctie, met de accolades GETELD. Eerst stond
   hier "tot de eerste regel die met } begint" -- en dat is elke ingesprongen
   afsluiting van een if of een lus niet, maar wel de eerste die er toevallig
   op lijkt. getFounderAdvice viel daardoor halverwege buiten het bereik en
   lekte alsnog. */
function boFunctieRegels() {
  const uit = [];
  for (let i = 0; i < regels.length; i++) {
    if (!BO_FN.test(regels[i])) continue;
    let diepte = 0, gestart = false;
    for (let j = i; j < regels.length; j++) {
      diepte += (regels[j].match(/\{/g) || []).length - (regels[j].match(/\}/g) || []).length;
      if (!gestart && diepte > 0) gestart = true;
      if (gestart && diepte <= 0) { uit.push([i + 1, j + 1]); i = j; break; }
    }
  }
  return uit;
}
const BO_FN_BEREIK = boFunctieRegels();

const NL = /\b(geen|niet|opnieuw|laden|bezig|klaar|opslaan|annuleren|verwijderen|toevoegen|bewerken|sluiten|volgende|vorige|zoeken|zoek|kiezen|versturen|verstuurd|mislukt|gelukt|probeer|instellingen|afspraak|afspraken|gesprek|gesprekken|lead|leads|pand|panden|voertuig|voertuigen|maand|week|vandaag|gisteren|morgen|datum|tijd|naam|telefoon|adres|prijs|status|resultaat|overzicht|totaal|nieuwe?|actief|inactief|uitloggen|inloggen|aanmelden|verbinding|notitie|notities|taak|taken|score|beelden|historiek|boekingen|melding|meldingen)\b/i;
const PAT = [
  /\.textContent\s*=\s*'([^']{3,80})'/g,
  /\.textContent\s*=\s*"([^"]{3,80})"/g,
  /placeholder="([^"$]{3,80})"/g,
  /title="([^"$]{3,80})"/g,
  /aria-label="([^"$]{3,80})"/g,
  />([A-ZÀ-Ý][a-zà-ÿ]{2,}(?:[ ,.][a-zà-ÿ]{2,}){0,7})</g,
];

const inBO = (n) => BO.some(([a, b]) => n >= a && n <= b)
                 || BO_FN_BEREIK.some(([a, b]) => n >= a && n <= b);

const lekken = [];
regels.forEach((r, i) => {
  const n = i + 1;
  if (inBO(n)) return;
  for (const p of PAT) {
    p.lastIndex = 0;
    let m;
    while ((m = p.exec(r))) {
      const t = m[1].trim();
      if (!NL.test(t)) continue;
      /* Gaat het al door de vertaaltabel, dan is het geen lek. */
      if (/\$\{|\btr\(|\bT\(/.test(m[0])) continue;
      lekken.push({ regel: n, tekst: t.slice(0, 56) });
    }
  }
});

console.log('\n  geen hardgecodeerd Nederlands op een klantscherm');
ck('nul lekken', lekken.length === 0, lekken.slice(0, 12));

console.log('\n  en de back-office is bewust overgeslagen');
{
  /* Zonder deze regel zou een test die per ongeluk ALLES overslaat ook groen
     zijn. Er MOET dus back-office gevonden worden -- anders klopt de grens
     niet en meet de test hierboven niets. */
  ck('alle uitgezonderde blokken zijn gevonden', BO.length === 7, BO);
  const boRegels = BO.reduce((n, [a, b]) => n + (b - a), 0);
  ck('en dat is een substantieel stuk bestand', boRegels > 200, boRegels);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
