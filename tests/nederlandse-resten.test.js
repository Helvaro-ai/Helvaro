'use strict';
/*
 * Geen Nederlandse zinnen meer in de klantschermen.
 *
 * ── Waarom deze test bestaat ───────────────────────────────────────────────
 * Vier eerdere rondes vertaalwerk lieten 34 zinnen staan. Niet omdat ze
 * verstopt zaten, maar omdat ze pas VERSCHIJNEN in een toestand die een
 * paginascan nooit bereikt:
 *
 *   - een validatiefout  ("Vul je btw-nummer in.")
 *   - een modaal dat je zelf moet openen  ("Nog één ding")
 *   - een afgelopen proefperiode  ("Je proefperiode is afgelopen")
 *   - een leeg zoekresultaat  ("Niets gevonden...")
 *
 * De Duitse en Franse sweeps liepen over vijftien gerenderde pagina's en
 * vonden niets, want geen van die toestanden stond aan. Een schone sweep
 * bewees alleen dat de gelukkige weg vertaald was.
 *
 * Erger: verschillende ervan stonden NAAST een regel die wél tr() gebruikte.
 * In hetzelfde venster, in dezelfde functie. Het scherm was half vertaald en
 * niemand zag het, omdat je er alleen komt als er iets misgaat.
 *
 * ── Wat hier bewaakt wordt ─────────────────────────────────────────────────
 * Elke toewijzing aan zichtbare tekst die een Nederlandse ZIN bevat, buiten de
 * beheerdersschermen. Statisch, dus onafhankelijk van welke toestand toevallig
 * aanstaat -- precies het gat dat de browsersweeps lieten vallen.
 *
 * ── Wat hier BEWUST buiten valt ────────────────────────────────────────────
 * De founder-/beheerschermen (`fdr-`, `nc-invite`, de Drive-koppeling). Sindi
 * is daar de enige gebruiker en die schermen horen Nederlands te zijn. Ze
 * vertalen zou werk zijn dat niemand leest.
 */
const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ck(wat, ok, detail) {
  if (ok) { pass++; console.log('  OK    ' + wat); }
  else    { fail++; console.log('  FOUT  ' + wat + (detail !== undefined ? '\n        ' + JSON.stringify(detail).slice(0, 500) : '')); }
}

const regels = fs.readFileSync(path.join(BASE, 'api/dashboard.js'), 'utf8').split('\n');
const i18n   = require(path.join(BASE, 'api/_i18n.js'));

/* De beheerdersgebieden, op naam herkend in plaats van op regelnummer: een
   vast bereik loopt achter zodra er iets boven wordt ingevoegd, en dan dekt
   deze test stilletjes het verkeerde stuk bestand af. */
function inBeheergebied(L) {
  /* Terugzoeken naar de dichtstbijzijnde functie- of sectiekop erboven. */
  for (let i = L - 1; i >= 0 && i > L - 400; i--) {
    const r = regels[i];
    if (/FOUNDER DASHBOARD/.test(r)) return true;
    if (/Google Drive-koppeling \(beheerder\)/.test(r)) return true;
    if (/^\s*(?:async\s+)?function\s+(sendClientInvite|copyInviteLink|resetInvite|renderOutreach|initOutreachTracker|renderMeeting)\b/.test(r)) return true;
    if (/id="nc-invite-panel"/.test(r)) return true;
    /* Een founder-element in dezelfde regel telt ook. */
  }
  return /fdr-|nc-inv/.test(regels[L - 1]);
}

/* Twee of meer Nederlandse functiewoorden = een zin, niet een losse term.
   Eén woord geeft te veel valse meldingen op dingen als 'Naam' of 'Van'. */
const FUNCTIEWOORDEN = /\b(je|jouw|uw|een|het|de|van|voor|met|naar|niet|geen|nog|wel|dit|deze|die|dat|en|als|om|te|op|aan|bij|zijn|is|wordt|worden|kan|kun|moet|hebt|heeft|hebben|vul|kies|schrijf|stuur)\b/gi;

console.log('\n  geen Nederlandse zinnen in zichtbare tekst');
{
  const resten = [];
  regels.forEach((r, i) => {
    const L = i + 1;
    if (/^\s*(\/\/|\*|\/\*)/.test(r)) return;             // commentaar mag Nederlands zijn
    if (inBeheergebied(L)) return;
    const pat = /(?:textContent|innerText|innerHTML|placeholder|title|alt)\s*=\s*'([^']{6,})'/g;
    let m;
    while ((m = pat.exec(r))) {
      const t = m[1];
      if (/^[a-z][a-z0-9]*\.[a-z]/i.test(t)) return;      // een vertaalsleutel
      if (/^[<\\${]/.test(t)) continue;                   // markup of interpolatie
      if ((t.match(FUNCTIEWOORDEN) || []).length < 2) continue;
      resten.push(L + ': ' + t.slice(0, 64));
    }
  });
  ck('nul Nederlandse zinnen buiten de beheerschermen', resten.length === 0, resten);
}

console.log('\n  en de sleutels die ervoor in de plaats kwamen bestaan echt');
{
  /* Een tr()-aanroep naar een sleutel die niet bestaat geeft de SLEUTEL op het
     scherm ('btw.titel' in plaats van 'Nog één ding'). Dat is zichtbaarder dan
     Nederlands maar wel net zo stuk, en een typefout in een sleutelnaam valt
     verder nergens op. */
  const bron = regels.join('\n');
  const gebruikt = [...new Set([...bron.matchAll(/\btr\('([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]))];
  ck('er worden sleutels gebruikt', gebruikt.length > 100, gebruikt.length);
  const nl = i18n.woordenboek('nl');
  /* Een sleutel die op een punt eindigt is geen sleutel maar een VOORVOEGSEL:
     tr('inv.status.' + status). De naam is pas compleet als de code draait,
     dus hier valt niet te controleren of de hele sleutel bestaat. Wat wel kan:
     nagaan dat er uberhaupt sleutels met dat voorvoegsel zijn. Dat vangt een
     typefout in het vaste deel ('inv.staus.'), en dat is het stuk dat een mens
     intikt. De losse waarde erachter komt uit de data. */
  const voorvoegsels = gebruikt.filter((k) => k.endsWith('.'));
  const volledig     = gebruikt.filter((k) => !k.endsWith('.'));
  const onbekend = volledig.filter((k) => !Object.prototype.hasOwnProperty.call(nl, k));
  ck('elke volledige tr()-sleutel staat in het woordenboek', onbekend.length === 0, onbekend);
  const alleSleutels = Object.keys(nl);
  const loosVoorvoegsel = voorvoegsels.filter((v) => !alleSleutels.some((k) => k.indexOf(v) === 0));
  ck('elk samengesteld voorvoegsel heeft sleutels', loosVoorvoegsel.length === 0, loosVoorvoegsel);
}

console.log('\n  de nieuwe sleutels zijn in vier talen vertaald');
{
  const NIEUW = [
    'log.evenGeduld', 'log.mailVerplicht', 'log.pending.titel', 'log.pending.tekst', 'log.pending.tekstMail',
    'sup.telKort', 'trial.over.titel', 'trial.over.sub', 'trial.over.cta',
    'wiz.regio.verplicht', 'wiz.regio.hint', 'wiz.regio.andereTaal', 'wiz.bedrijf.kort',
    'wiz.welkomst.kort', 'wiz.markt.titel', 'wiz.markt.sub',
    'btw.titel', 'btw.uitleg', 'btw.planTerugval', 'btw.naarBetalen', 'btw.verplicht', 'btw.mislukt',
    'koop.bedragOngeldig',
    'fa.plan.proef', 'fa.plan.teGaan', 'fa.plan.teGaanDag', 'fa.plan.proefVoorbij',
    'fa.plan.neemContact', 'fa.plan.opNaamVan', 'fa.geschiedenisUit',
    'veh.import.kop', 'veh.import.sub', 'veh.merkModelNodig', 'hv.help.nietsGevonden',
  ];
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const mist = NIEUW.filter((k) => !i18n.t(taal, k) || i18n.t(taal, k) === k);
    ck(taal + ': alle ' + NIEUW.length + ' sleutels bestaan', mist.length === 0, mist);
  }
  /* En echt vertaald. Vier kolommen naast elkaar nodigen uit tot kopiëren, en
     een gekopieerde Nederlandse zin is precies het probleem dat deze hele test
     moet voorkomen -- alleen dan met een sleutel ervoor. */
  for (const taal of ['fr', 'en', 'de']) {
    const gelijk = NIEUW.filter((k) => i18n.t(taal, k) === i18n.t('nl', k));
    ck(taal + ': geen zin is nog Nederlands', gelijk.length === 0, gelijk);
  }
}

console.log('\n  de plaatshouders overleven de vertaling');
{
  /* {email}, {plan}, {naam}, {land}, {n} moeten in elke taal STAAN. Verdwijnt
     er een in het Duits, dan mist de Duitse klant precies het stuk informatie
     waar de zin om draait -- zijn eigen e-mailadres, zijn planNaam. */
  const MET_VAR = {
    'log.pending.tekstMail': '{email}',
    'btw.uitleg':            '{plan}',
    'fa.plan.teGaan':        '{n}',
    'fa.plan.opNaamVan':     '{naam}',
    'wiz.regio.andereTaal':  '{land}',
  };
  for (const [k, v] of Object.entries(MET_VAR)) {
    const mist = ['nl', 'fr', 'en', 'de'].filter((taal) => i18n.t(taal, k).indexOf(v) === -1);
    ck(k + ' houdt ' + v + ' in alle talen', mist.length === 0, mist);
  }
}

console.log('\n  de btw-modal gebruikt de plan-terugval, niet een kale zin');
{
  const bron = regels.join('\n');
  /* Stond er 'je abonnement' hardgecodeerd achter een ||, dan kreeg een Duitse
     klant een Duitse zin met een Nederlands staartje. */
  ck('planNaam valt terug op een vertaalde term',
    /tr\('btw\.uitleg', \{ plan: planNaam \|\| tr\('btw\.planTerugval'\) \}\)/.test(bron), null);
}

console.log('\n  de landenlijst spreekt de taal van de pagina');
{
  /* Dit is het scherm waar een nieuwe klant zijn land kiest -- het eerste dat
     hij invult. De namen stonden alleen in het Nederlands in api/_regio.js, dus
     een Franstalige zocht zijn land tussen 'Frankrijk' en 'Duitsland'.

     De pagina echt RENDEREN per taal, want de vorige versie van deze fix zag er
     in de broncode goed uit en leverde toch vier keer Nederlands: de code stond
     boven de declaratie van UI_LANG, wat een ReferenceError gaf die door een
     try/catch naar de Nederlandse terugval werd geslikt. Een statische controle
     had dat nooit gezien. */
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  const render = (taal) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + taal, headers: {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    const m = /const REGIO_LANDEN = (\[[\s\S]*?\]);/.exec(html);
    return m ? JSON.parse(m[1]) : null;
  };

  const VERWACHT = { nl: 'Frankrijk', fr: 'France', en: 'France', de: 'Frankreich' };
  const perTaal = {};
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const lijst = render(taal);
    ck(taal + ': de landenlijst staat in de pagina', !!lijst && lijst.length > 10, lijst && lijst.length);
    if (!lijst) continue;
    perTaal[taal] = lijst;
    const fr = lijst.find((l) => l.code === 'FR');
    ck(taal + ": Frankrijk heet '" + VERWACHT[taal] + "'", fr && fr.naam === VERWACHT[taal], fr && fr.naam);
  }

  /* De drie andere talen mogen niet identiek aan het Nederlands zijn -- precies
     de stand die de kapotte versie opleverde. */
  if (perTaal.nl) {
    for (const taal of ['fr', 'en', 'de']) {
      if (!perTaal[taal]) continue;
      const zelfde = perTaal[taal].every((l, i) => l.naam === perTaal.nl[i].naam);
      ck(taal + ': de lijst is niet gewoon de Nederlandse', !zelfde, null);
    }
  }

  /* En de taalkoppeling is NIET meegeveranderd. Die bepaalt welke
     WhatsApp-template Meta moet goedkeuren; een verschuiving daar is een
     functionele fout, geen cosmetische. */
  if (perTaal.nl && perTaal.fr) {
    const zelfdeTalen = perTaal.fr.every((l, i) => l.taal === perTaal.nl[i].taal && l.code === perTaal.nl[i].code);
    ck('code en taal per land blijven gelijk over talen heen', zelfdeTalen, null);
  }
}

console.log('\n  het aanbodformulier spreekt de taal van de pagina');
{
  /* Het venster waarin een makelaar een pand of een dealer een wagen invoert.
     Drieentwintig labels en negen keuzelijstregels stonden in het Nederlands,
     tussen regels die al \${T(...)} gebruikten. Half vertaald, en het half dat
     ontbrak is precies het deel dat je INVULT. */
  delete require.cache[require.resolve('../api/dashboard.js')];
  const dash = require('../api/dashboard.js');
  const render = (taal) => {
    let html = '';
    dash({ method: 'GET', url: '/dashboard?lang=' + taal, headers: {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
    return html;
  };
  const per = {};
  for (const taal of ['nl', 'fr', 'en', 'de']) per[taal] = render(taal);

  /* 1. Geen enkel label mag nog hardgecodeerd zijn. */
  for (const taal of ['nl', 'fr', 'en', 'de']) {
    const labels = [...per[taal].matchAll(/<label class="pd-label"[^>]*>([^<]+)<\/label>/g)].map((m) => m[1].trim());
    ck(taal + ': er staan labels in het formulier', labels.length >= 20, labels.length);
  }
  const nlLabels = [...per.nl.matchAll(/<label class="pd-label"[^>]*>([^<]+)<\/label>/g)].map((m) => m[1].trim());
  for (const taal of ['fr', 'de']) {
    const l = [...per[taal].matchAll(/<label class="pd-label"[^>]*>([^<]+)<\/label>/g)].map((m) => m[1].trim());
    const zelfde = l.filter((x, i) => x === nlLabels[i]);
    /* Sommige woorden zijn in beide talen gelijk (Status, Adres/Adresse,
       Type, Carrosserie). Dat mag; wat niet mag is dat de HELE lijst gelijk is. */
    ck(taal + ': de labels zijn grotendeels anders dan het Nederlands',
       zelfde.length < nlLabels.length / 2, zelfde.slice(0, 8));
  }

  /* 2. DIT is de belangrijke. De value-attributen gaan naar Airtable. Wie een
     keuzelijst vertaalt door de value mee te nemen, maakt de opslag stuk en
     ziet op het scherm niets bijzonders -- tot een pand als 'vendu' wordt
     weggeschreven en geen enkel filter hem nog vindt. */
  /* Alleen de keuzelijsten VAN DIT FORMULIER. De eerste versie pakte elke
     <option> op de pagina en meldde daardoor de TAALKIEZER als fout: die laat
     de huidige taal weg, dus zijn waarden verschillen per taal en dat hoort zo.
     Een test die iets goeds afkeurt wordt weggeklikt, en dan vangt hij het
     echte geval ook niet meer. */
  const waarden = (html) => {
    const uit = [];
    for (const blok of html.matchAll(/<select[^>]*id="(pd-f-[a-z]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
      for (const o of blok[2].matchAll(/<option value="([^"]*)">/g)) uit.push(blok[1] + "=" + o[1]);
    }
    return uit;
  };
  const nlW = waarden(per.nl);
  ck('er staan keuzelijstwaarden in', nlW.length >= 20, nlW.length);
  for (const taal of ['fr', 'en', 'de']) {
    const w = waarden(per[taal]);
    const gelijk = w.length === nlW.length && w.every((x, i) => x === nlW[i]);
    ck(taal + ': GEEN ENKELE option-value is meevertaald', gelijk,
       gelijk ? null : w.filter((x, i) => x !== nlW[i]).slice(0, 6));
  }

  /* 3. En de tekst ernaast is wel vertaald. */
  const tekstVan = (html, v) => {
    const m = new RegExp('<option value="' + v.replace(/[.*+?^\${}()|[\]\\]/g, '\\\\$&') + '">([^<]*)<').exec(html);
    return m ? m[1] : null;
  };
  const PROEF = { 'benzine': { fr: 'essence', de: 'Benzin' }, 'verhuurd': { fr: 'lou\u00e9', de: 'vermietet' }, 'automaat': { fr: 'automatique', de: 'Automatik' } };
  for (const [v, verw] of Object.entries(PROEF)) {
    for (const taal of ['fr', 'de']) {
      ck(taal + ": '" + v + "' toont '" + verw[taal] + "'", tekstVan(per[taal], v) === verw[taal], tekstVan(per[taal], v));
    }
  }

  /* 4. EPC heet in Walloni\u00eb PEB. Geen vertaling maar de naam van een ander
     gewestelijk certificaat; een Franstalige makelaar zoekt PEB. */
  ck('fr: EPC heet PEB', /<label class="pd-label"[^>]*>PEB<\/label>/.test(per.fr), null);
  ck('nl: en blijft EPC', /<label class="pd-label"[^>]*>EPC<\/label>/.test(per.nl), null);
}

console.log('\n  ' + pass + ' ok, ' + fail + ' fout\n');
process.exit(fail ? 1 : 0);
