'use strict';
/*
 * Faro's foutmeldingen in de taal van de makelaar.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * api/_faro/ui/client.js deed dit:
 *
 *     if (!r.ok) throw new Error(j.error || T('st.error'));
 *
 * Precies dezelfde fout als op het lead-formulier (zie
 * tests/formulier-foutmeldingen.test.js): er WAS een vertaalde terugval, maar
 * j.error stond er altijd en dat was een hardgecodeerde Nederlandse zin uit
 * api/_faro/handler.js. Een Duitse makelaar kreeg "Gesprek niet gevonden" in
 * een paneel dat verder volledig Duits was.
 *
 * Twee keer dezelfde fout in twee bestanden is geen toeval maar een patroon:
 * `serverzin || vertaling` leest als een nette terugval en is het tegendeel.
 * De vertaling komt er nooit aan te pas.
 *
 * ── De valkuil die hier specifiek was ──────────────────────────────────────
 * Faro's T(k, fallback) geeft bij een onbekende sleutel NIET niets terug, maar
 * het laatste stukje van de sleutel met een hoofdletter -- bedoeld om 'ctx.images'
 * niet als "ctx.images" te tonen. Een naïeve `T('srv.' + code, '') || j.error`
 * zou daardoor "Convo_weg" op het scherm zetten in plaats van door te vallen
 * naar de zin van de server. Vandaar de expliciete hasOwnProperty-controle,
 * en vandaar dat die hieronder getest wordt met een code die niet bestaat.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 300) : '')); }
}

/* De ROUTE (api/faro.js) hoort er ook bij, niet alleen de handler eronder.
   Daar zitten de drie antwoorden die een gebruiker het vaakst krijgt zonder
   dat Faro ooit begint: sessie verlopen, account nog niet ingericht, en de
   dienst even weg. Ze buiten deze test houden zou betekenen dat precies de
   meest voorkomende foutmeldingen ongecontroleerd blijven. */
const handler = fs.readFileSync(path.join(BASE, 'api/_faro/handler.js'), 'utf8')
              + '\n' + fs.readFileSync(path.join(BASE, 'api/faro.js'), 'utf8');
const client  = fs.readFileSync(path.join(BASE, 'api/_faro/ui/client.js'), 'utf8');
const i18n    = require(path.join(BASE, 'api/_faro/ui/i18n.js'));

const TALEN = ['nl', 'fr', 'en', 'de'];
/* De codes uit de handler halen in plaats van ze hier over te typen: een
   handmatige lijst loopt achter zodra iemand een fout toevoegt, en dan bewaakt
   deze test precies die nieuwe niet. */
const CODES = [...new Set([...handler.matchAll(/code: '([A-Za-z_]+)'/g)].map((m) => m[1]))];

console.log('\n  elke fout van de server heeft een code');
{
  ck('er zijn codes gevonden', CODES.length >= 7, CODES);
  /* Elke foutretour moet er een hebben. Eén vergeten return valt terug op de
     Nederlandse zin en dan is de Duitse makelaar net zo ver. */
  const zonder = [...handler.matchAll(/res\.status\((?:4|5)\d\d\)\.json\(\{([^}]*)\}/g)]
    .map((m) => m[1].trim())
    /* Waar in het object de code staat maakt niet uit -- de eerste versie van
       deze regel eiste hem VOORAAN en meldde daardoor drie retours die hem al
       hadden. Een test die iets goeds fout rekent wordt weggeklikt. */
    .filter((t) => !/code:\s*'[A-Za-z_]+'/.test(t))
    /* 405 bereikt geen gebruiker: dat is een verkeerd verzoek van een script,
       niet iemand die op een knop drukt. */
    .filter((t) => t.indexOf('Method not allowed') === -1)
    .map((t) => t.slice(0, 70));
  ck('geen enkele foutretour zonder code', zonder.length === 0, zonder);
}

console.log('\n  en elke code een zin in vier talen');
{
  for (const taal of TALEN) {
    const tab = i18n.table(taal);
    const mist = CODES.filter((c) => !Object.prototype.hasOwnProperty.call(tab, 'srv.' + c));
    ck(taal + ': alle ' + CODES.length + ' codes vertaald', mist.length === 0, mist);
  }
  /* En echt vertaald, niet geplakt. Vier tabellen naast elkaar nodigen uit tot
     kopiëren; zonder deze controle staat er over een maand Nederlands in het
     Duits en valt dat pas bij een klant op. */
  for (const taal of ['fr', 'en', 'de']) {
    const tab = i18n.table(taal), nl = i18n.table('nl');
    /* Alleen vergelijken wat er IS: een ontbrekende sleutel is undefined in
       beide tabellen en zou hier als "identiek" tellen -- dan meldt deze regel
       een vertaalfout terwijl de controle hierboven het echte probleem al
       precies benoemt. */
    const gelijk = CODES.filter((c) => tab['srv.' + c] !== undefined
                                    && tab['srv.' + c] === nl['srv.' + c]);
    ck(taal + ': geen zin is nog Nederlands', gelijk.length === 0, gelijk);
  }
}

console.log('\n  de client kiest de code boven de serverzin');
{
  /* DIT is de regressie. Draait iemand het terug naar `j.error || ...`, dan
     wint de Nederlandse zin weer zonder dat er iets stukgaat. */
  ck('j.error wordt niet meer als eerste getoond',
    !/throw new Error\(j\.error \|\|/.test(client), null);
  ck('de code wordt eerst opgezocht',
    /hasOwnProperty\.call\(FARO_T, sl\)/.test(client), null);
  ck('en de serverzin blijft de terugval',
    /vertaald \|\| \(j && j\.error\) \|\| T\('st\.error'\)/.test(client), null);
}

console.log('\n  de uitgestuurde code doet het ook echt');
{
  /* Niet de bron lezen maar de functie DRAAIEN, per taal, met een echt
     antwoord van de server. Dat is het verschil tussen "de regel staat er"
     en "de makelaar leest zijn eigen taal". */
  const bron = client.js ? client.js() : require(path.join(BASE, 'api/_faro/ui/client.js')).js();
  const m = /var sl = j && j\.code[\s\S]*?throw new Error\(vertaald \|\| \(j && j\.error\) \|\| T\('st\.error'\)\);/.exec(bron);
  ck('het foutpad staat in het uitgestuurde script', !!m);

  if (m) {
    for (const taal of TALEN) {
      const FARO_T = i18n.table(taal);
      const T = (k, fb) => (Object.prototype.hasOwnProperty.call(FARO_T, k) ? FARO_T[k]
        : (fb || (String(k).split('.').pop().charAt(0).toUpperCase() + String(k).split('.').pop().slice(1))));
      /* Het echte fragment uitvoeren, met dezelfde namen als in de browser. */
      const draai = new Function('j', 'FARO_T', 'T', `
        try { ${m[0].replace('throw new Error(', 'return (')} } catch (e) { return e.message; }
      `);
      const uit = draai({ code: 'convo_weg', error: 'Gesprek niet gevonden' }, FARO_T, T);
      ck(taal + ': een bekende code geeft de vertaalde zin',
        uit === i18n.table(taal)['srv.convo_weg'], uit);
    }

    /* En de valkuil: een code die hier nog geen vertaling heeft mag NIET als
       "Iets_nieuws" op het scherm komen. */
    const FARO_T = i18n.table('de');
    const T = (k, fb) => (Object.prototype.hasOwnProperty.call(FARO_T, k) ? FARO_T[k] : (fb || 'X'));
    const draai = new Function('j', 'FARO_T', 'T', `
      try { ${m[0].replace('throw new Error(', 'return (')} } catch (e) { return e.message; }
    `);
    const onbekend = draai({ code: 'iets_nieuws', error: 'Iets ging mis' }, FARO_T, T);
    ck('een onbekende code valt terug op de zin van de server',
      onbekend === 'Iets ging mis', onbekend);
    const geenCode = draai({ error: 'Kaal antwoord' }, FARO_T, T);
    ck('en een antwoord zonder code ook', geenCode === 'Kaal antwoord', geenCode);
    const leeg = draai({}, FARO_T, T);
    ck('een leeg antwoord geeft de algemene fout in de juiste taal',
      leeg === i18n.table('de')['st.error'], leeg);
  }
}

console.log('\n  de gesprekstitel komt uit de vertaaltabel');
{
  /* sb.new bestond al in vier talen en werd hier niet gebruikt: de titel boven
     een nieuw gesprek stond hardgecodeerd op 'Nieuw gesprek', naast een knop
     die uit dezelfde tabel al "Neues Gespräch" zei. Hetzelfde
     gebouwd-maar-niet-aangesloten dat in dit project al vaker langskwam. */
  ck('de titel gebruikt T(sb.new)', /T\('sb\.new', 'Nieuw gesprek'\)/.test(client), null);
  ck('en staat er niet meer kaal in',
    !/conversationTitle = !t0 \? 'Nieuw gesprek'/.test(client), null);
  for (const taal of TALEN) {
    ck(taal + ': sb.new bestaat', !!i18n.table(taal)['sb.new'], i18n.table(taal)['sb.new']);
  }
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
