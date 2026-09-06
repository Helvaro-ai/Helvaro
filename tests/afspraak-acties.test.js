'use strict';
/*
 * Een afspraak verzetten of annuleren vanuit de kalender.
 *
 * ── Waarom dit bestand er is ────────────────────────────────────────────────
 * api/leads.js kende 'appointment-update' allang: mét tenantcontrole, mét het
 * opnieuw scherpstellen van de herinnering bij een nieuwe tijd. Er was alleen
 * geen knop. De vórige knoppen waren Calendly-links en zijn weggehaald toen
 * Calendly eruit ging; de vervanging is nooit aangesloten.
 *
 * Gevolg: een makelaar kon een afspraak wél maken en niet meer kwijt. Dat is
 * precies het soort gat dat geen enkele test vindt, want alles wat er WEL is
 * werkt -- er ontbrak iets.
 *
 * Wat hier bewaakt wordt is dus niet "de code doet iets" maar "de weg van knop
 * naar server bestaat nog", plus de vier remmen eromheen.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail) : '')); }
}

const bron = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8');
const leads = fs.readFileSync(path.join(BASE, 'api/leads.js'), 'utf8');
const i18n  = fs.readFileSync(path.join(BASE, 'api/_i18n.js'), 'utf8');

console.log('\n  de weg van knop naar server');
{
  ck('de server kent appointment-update',
    /body\.mode === 'appointment-update'/.test(leads));
  /* DIT is de regressie. Deze regel was er niet, en daardoor was al het
     bovenstaande onbereikbaar. */
  ck('en de client roept hem nu ook aan',
    /mode: 'appointment-update'/.test(bron));
  ck('er zijn knoppen op de afspraakkaart',
    /calVerzetOpen\(/.test(bron) && /calAnnuleerOpen\(/.test(bron));
  ck('verzetten stuurt een nieuwe starttijd',
    /startTime: nieuw\.toISOString\(\)/.test(bron));
  ck('annuleren stuurt de status cancelled',
    /calAnnuleerDoe[\s\S]{0,200}status: 'cancelled'/.test(bron));
}

console.log('\n  de remmen');
{
  /* Alleen op wat nog komt. Een afspraak van gisteren verzetten betekent
     niets, en daar staat de aanwezigheidsvraag al. */
  ck('knoppen alleen bij een TOEKOMSTIGE afspraak',
    /const toekomst = start\.getTime\(\) > Date\.now\(\)/.test(bron)
    && /if \(toekomst && ev\.id && ev\.status !== 'cancelled'\)/.test(bron), null);
  ck('en niet bij een al geannuleerde afspraak',
    /ev\.status !== 'cancelled'/.test(bron));
  ck('en niet zonder record-id',
    /toekomst && ev\.id &&/.test(bron));
  /* Een afspraak naar het verleden verzetten laat hem uit beeld verdwijnen en
     de herinnering nooit meer afgaan. Tegenhouden vóór het verzoek, niet erna. */
  ck('verzetten naar het verleden wordt geweigerd',
    /if \(nieuw\.getTime\(\) < Date\.now\(\)\)[\s\S]{0,220}return;/.test(bron), null);
}

console.log('\n  eerlijk over wat er NIET gebeurt');
{
  /* De lead krijgt geen bericht: daarvoor is een goedgekeurd WhatsApp-sjabloon
     nodig en dat is er niet. Dat verzwijgen zou een makelaar laten denken dat
     zijn klant op de hoogte is -- en dan staat hij er over een week alleen.
     HELVARO-ARCHITECTUUR §6: nooit doen alsof. */
  for (const [taal, stuk] of [['nl', 'géén bericht'], ['fr', 'PAS informé'], ['en', 'NOT notified'], ['de', 'NICHT benachrichtigt']]) {
    ck(taal + ': de kaart zegt dat de lead niets hoort',
      i18n.indexOf(stuk) !== -1, stuk);
  }
  ck('en de tekst staat ook echt op het annuleerpaneel',
    /calAnnuleerOpen[\s\S]{0,400}cal\.ev\.cancelSub/.test(bron), null);
}

console.log('\n  vier talen, zoals de rest van dit scherm');
{
  const sleutels = ['cal.ev.date', 'cal.ev.time', 'cal.ev.dur', 'cal.ev.type',
                    'cal.ev.phone', 'cal.ev.notes', 'cal.ev.move', 'cal.ev.cancel'];
  for (const s of sleutels) {
    const m = new RegExp("'" + s.replace('.', '\\.') + "':\\s*\\{([^}]*)\\}").exec(i18n);
    const heeftVier = m && ['nl:', 'fr:', 'en:', 'de:'].every((t) => m[1].indexOf(t) !== -1);
    ck(s + ' bestaat in vier talen', !!heeftVier, m && m[1].slice(0, 90));
  }
  /* De labels stonden hardgecodeerd: 'Datum', 'Tijd', 'Duur', 'Telefoon'. */
  ck('geen hardgecodeerde Nederlandse labels meer op de kaart',
    !/\{ label: 'Datum'/.test(bron) && !/\{ label: 'Telefoon'/.test(bron), null);
  /* En de datum zelf. 'nl-NL' hier gaf een Franse makelaar "maandag 8
     september" op de kaart van zijn eigen afspraak. */
  ck('de datum volgt de taal van de pagina',
    /const fmtD   = d => d\.toLocaleDateString\(LOCALE,/.test(bron), null);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
