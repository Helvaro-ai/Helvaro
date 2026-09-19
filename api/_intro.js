'use strict';
/*
 * Faro — de intro die bij elke start speelt (sinds 16 sep 2026: een échte
 * clip uit de Faro-video, 1,7 s, geluidloos; hij vliegt in en landt).
 * De tekst hieronder beschrijft de oorspronkelijke CSS-versie, die als
 * terugval (bol) blijft bestaan.
 *
 * Twee seconden, groot in beeld: alleen zijn KOP. Hij draait naar je toe, het
 * licht vangt zijn gouden ogen, hij knikt één keer en groet je bij naam. Daarna
 * is hij weg uit de DOM en staat je dashboard er.
 *
 * ── Waarom alleen de kop ─────────────────────────────────────────────────────
 * Op 200 px leest een hele valk als een klein poppetje: je ziet een silhouet en
 * geen gezicht. De ogen zijn het enige deel dat oogcontact maakt, en dat is
 * precies wat een begroeting moet doen. Vandaar public/faro/faro-kop.webp —
 * uitgesneden uit de bronrender van 1254 px, niet opgeschaald uit de 216 px
 * mascotte, want die wordt zacht zodra je hem groot zet.
 *
 * De uitsnede is rond met een uitgevloeide rand. Dat is geen versiering maar een
 * themakwestie: de render staat op zwart, en de valk is óók zwart, dus je kunt
 * de achtergrond niet wegsleutelen zonder zijn silhouet mee te nemen. Een zachte
 * cirkel lost dat op zonder harde stickerrand — op matzwart vloeit hij weg, op
 * wit leest hij als een portretmedaillon. De gouden haarlijn eromheen maakt van
 * die cirkel een bedoelde vorm in plaats van een uitsnede.
 *
 * ── Waarom dit GEEN videobestand is ──────────────────────────────────────────
 * De vraag was "een filmpje van 2 seconden". Dit is CSS geworden, om vier
 * redenen die allemaal op dit specifieke plekje in de app slaan:
 *
 *   1. Gewicht. Eén webp van 24 kB tegenover 300–800 kB voor dezelfde twee
 *      seconden als mp4 — en dat valt precies in de seconde ná het inloggen,
 *      het moment waarop de klant al op zijn leads staat te wachten.
 *   2. Thema. De app heeft een licht én een donker thema (zie [data-theme]).
 *      Een videobestand bakt zijn achtergrond in, dus in licht thema krijg je
 *      een zwart blok. Dit erft --bg en klopt in allebei.
 *   3. Mobiel. Autoplay-video op iOS vraagt muted+playsinline, geeft een
 *      decode-vertraging en soms een zwarte eerste frame. CSS heeft dat niet.
 *   4. Scherpte. Eén bestand op elk toestel, elke DPI, elk formaat.
 *
 * Wil je alsnog een échte mp4 — voor social, de site of een demo — dan is dit
 * bestand de storyboard-bron: dezelfde zes beats, dezelfde timing.
 *
 * ── Wanneer hij speelt (en vooral: wanneer niet) ─────────────────────────────
 * ALLEEN na een echte login. Niet bij elke pagina-verversing.
 *
 * Dat onderscheid bestond al in dashboard.js en we lenen het gewoon:
 * startDashboard(skipRefresh) krijgt `false` als iemand net zijn wachtwoord
 * heeft ingetypt, en `true` op elk pad dat een BESTAANDE sessie herstelt
 * (herladen, tweede tabblad, terugkomen na een uur). Er komt dus geen nieuw
 * contract bij: skipRefresh is al de vlag die "vers ingelogd" van "gewoon
 * terug" scheidt.
 *
 * Zonder die grens speelt een splash bij élke F5, en dan is het binnen een dag
 * niet charmant meer maar traag.
 *
 * ── Hij kan nooit vastlopen ──────────────────────────────────────────────────
 * Een intro die blijft hangen is erger dan geen intro: dan staat de klant voor
 * een dicht scherm terwijl zijn leads eronder klaarstaan. Vandaar drie sloten,
 * onafhankelijk van elkaar:
 *
 *   - animationend op de laag ruimt hem op (de normale weg);
 *   - een harde setTimeout van 3 s ruimt hem óók op, ook als er geen enkele
 *     animatie afgevuurd is (oude browser, animaties uit, tab op de achtergrond
 *     waardoor animationend nooit komt);
 *   - klik of toets slaat hem meteen over.
 *
 * En het dashboard eronder is al zichtbaar en al aan het laden — de intro
 * hangt eroverheen, hij houdt niets tegen.
 *
 * ── Zonder de tekening ───────────────────────────────────────────────────────
 * public/faro/ kan leeg zijn (dat was maandenlang zo, zie de notitie in
 * _faro/ui/client.js). Daarom draagt een CSS-bol de intro als de webp niet
 * laadt: zelfde beweging, zelfde timing, geen gebroken-beeldteken. Precies het
 * patroon dat faro-mascot--missing hiernaast al volgt.
 *
 * ── Escaping ─────────────────────────────────────────────────────────────────
 * Deze strings gaan IN de template-literal van dashboard.js. Dus: geen backtick
 * en geen ${ } in wat hier naar buiten komt. De client-JS staat daarom in
 * ES5-stringconcatenatie, net als _faro/ui/client.js. verify() controleert het.
 */

const _i18n = require('./_faro/ui/i18n');

/* Eén plek voor de timing, zodat de CSS en het opruimen niet uit elkaar kunnen
   lopen. Alles hieronder is afgeleid van deze getallen. */
const T = Object.freeze({
  ring:  { at: 0.05, dur: 0.50 },  // de iris die opengaat
  kop:   { at: 0.10, dur: 1.30 },  // indraaien, scherpstellen, knikken
  sheen: { at: 0.55, dur: 0.50 },  // licht over de gouden ogen
  bloom: { at: 0.75, dur: 0.55 },  // warme gloed erachter
  word:  { at: 1.00, dur: 0.55 },  // de begroeting
  out:   { at: 1.75, dur: 0.35 },  // wegvegen -- de video (1,71 s) is dan net uit
  hard:  3000                       // noodrem in ms
});

/* Groot. Dat was de opdracht, en het is ook de reden dat het een kop werd:
   onder ~150 px verlies je de ogen en daarmee het oogcontact. */
const MAAT = Object.freeze({ kop: 220, stage: 284, ring: 260 });

/* ── CSS ──────────────────────────────────────────────────────────────────── */
function css() {
  return `
/* ═══ Faro-intro — speelt bij elke start, 1,7 s, geluidloos ═══════════════ */
/* Standaard weg, en met een KLASSE aangezet — niet met het hidden-attribuut.

   Dat attribuut werkte hier namelijk niet. De UA-stylesheet zet [hidden] op
   display:none met de laagst mogelijke specificiteit, en een id-selector die
   display:flex zegt wint daar altijd van. Gevolg: de laag stond bij ELKE
   paginalading in beeld en speelde zijn uitgang af, precies het tegenovergestelde
   van "alleen na een verse login". Onzichtbaar in code, meteen zichtbaar zodra
   je de pagina opent.

   Met display:none als grondtoestand kan geen enkele animatie starten voordat
   .fi-aan erbij komt — een element in display:none animeert niet, en begint
   netjes bij frame 0 zodra het wél getoond wordt. Het hidden-attribuut blijft
   staan voor de betekenis, niet voor de opmaak. */
#faro-intro { display: none; }
/* .fi-wacht: de grond staat er al terwijl de clip nog laadt. Zonder deze
   tussenstand stond het dashboard-skelet tot 350 ms in beeld VOOR de intro
   (de laag bleef display:none tot .fi-aan), en dat is precies de flits die de
   eigenaar zag. Zelfde opmaak als .fi-aan, alleen zonder de uitgang. */
#faro-intro.fi-wacht {
  position: fixed;
  inset: 0;
  z-index: 11500;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  background: var(--bg);
}
#faro-intro.fi-wacht .fi-stage,
#faro-intro.fi-wacht .fi-word { visibility: hidden; }
#faro-intro.fi-aan {
  position: fixed;
  inset: 0;
  z-index: 11500;             /* boven inlogscherm (1000), dashboard én de welkomwizard (11000); onder de toasts (12000) */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 30px;
  background: var(--bg);
  cursor: pointer;            /* hij is overslaanbaar, dus dat mag je zien */
  animation: fi-out ${T.out.dur}s cubic-bezier(.4,0,.7,.2) ${T.out.at}s forwards;
}
/* Overslaan: dezelfde uitgang, maar nu. */
#faro-intro.fi-skip { animation: fi-out .18s ease forwards; }

.fi-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: ${MAAT.stage}px;
  height: ${MAAT.stage}px;
}
/* Elk kind van de stage ligt in dezelfde gridcel — geen absolute positionering
   nodig om ze te stapelen, en dus ook niets dat kan verschuiven. */
.fi-stage > * { grid-area: 1 / 1; }

/* De haarlijn om het portret. Twee dingen tegelijk: hij opent als een iris aan
   het begin, en hij maakt van de uitgevloeide cirkel een bedoelde vorm in
   plaats van een uitsnede — vooral op wit, waar de rand anders zweeft. */
.fi-ring {
  width: ${MAAT.ring}px;
  height: ${MAAT.ring}px;
  border: 1px solid var(--accent-c);
  border-radius: 50%;
  opacity: 0;
  animation: fi-ring ${T.ring.dur}s cubic-bezier(.2,.7,.3,1) ${T.ring.at}s both;
}

/* Finish-fix 4: geen gloed als middel, ook niet in het donkere thema --
   deze staat nu net als de lichte variant hieronder altijd uit. */
.fi-bloom {
  width: ${MAAT.stage}px;
  height: ${MAAT.stage}px;
  border-radius: 50%;
  opacity: 0;
  animation: none;
}

/* De kop. Geen slagschaduw: op een uitgevloeide cirkel wordt die modderig.
   Een zachte gloed doet hier wat een schaduw elders doet — hem losmaken van
   de achtergrond. */
.fi-kop {
  width: ${MAAT.kop}px;
  height: ${MAAT.kop}px;
  display: block;
  border-radius: 50%;
  object-fit: cover;
  opacity: 0;
  box-shadow: 0 0 0 1px var(--accent-c);   /* finish-fix 4: alleen de haarlijn, geen halo */
  /* De clip beweegt zelf (hij vliegt in en landt), dus hier alleen een
     fade -- een knik bovenop een landing is dubbel. */
  animation: fi-fade-in .28s ease .05s both;
}
@keyframes fi-fade-in { from { opacity: 0; transform: scale(.96); } to { opacity: 1; transform: none; } }
/* Nog niet geladen of 404: verbergen, de bol neemt het over. */
.fi-kop--missing { visibility: hidden; }

/* De vervangende bol. Draait dezelfde track, zodat het bij een ontbrekend
   bestand niet stiller of anders wordt — alleen abstracter. */
.fi-orb {
  width: ${MAAT.kop - 40}px;
  height: ${MAAT.kop - 40}px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 34% 30%, var(--accent-ink, #F0E4C8) 0%, var(--accent-c) 34%, var(--accent-deep, #C9AE7C) 72%, #8A7350 100%);
  box-shadow: 0 0 0 1px var(--accent-deep, #C9AE7C);
  opacity: 0;
  animation: fi-kop ${T.kop.dur}s cubic-bezier(.22,.9,.28,1) ${T.kop.at}s both;
}
/* Zodra de tekening er staat, is de bol overbodig. */
.fi-stage.is-ready .fi-orb { display: none; }

/* Het licht dat over zijn gezicht trekt. Dit is de beat die de kop verdient en
   de hele valk niet had: de veeg loopt precies over de gouden oogranden en de
   snavel, en dat leest als een blik die oplicht.

   Alleen mét bestand: de maskering leunt op diezelfde webp, dus zonder
   tekening zou dit een rechthoek zijn. Vandaar de .is-ready-poort. */
.fi-sheen { display: none; }
/* Finish-fix 4: de lichtveeg (shine) speelt niet meer -- .fi-sheen blijft
   op display:none staan, ook wanneer de tekening klaar is. */
.fi-stage.is-ready .fi-sheen {
  width: ${MAAT.kop}px;
  height: ${MAAT.kop}px;
  opacity: 0;
}

.fi-word {
  font-family: var(--font-head, 'Space Grotesk', sans-serif);
  font-size: 15px;
  font-weight: 500;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--text-muted-c, #B5B5B5);
  opacity: 0;
  margin: 0;
  animation: fi-word ${T.word.dur}s cubic-bezier(.2,.7,.3,1) ${T.word.at}s both;
}
.fi-word b { color: var(--accent-ink, #F0E4C8); font-weight: 600; }
/* Sand als TÉKST mag alleen op donker (de contrastregel bij --accent-ink).
   Op wit wordt het de diepere tint, die daar wel leesbaar is. */
[data-theme="light"] .fi-word b { color: var(--accent-pressed-c, #C9AE7C); }
/* Op een witte grond doet een warme gloed niets, en dan valt de zwarte rand
   van het portret juist op. Daar dus een zachte schaduw in plaats van gloed. */
[data-theme="light"] .fi-bloom { opacity: 0; animation: none; }
[data-theme="light"] .fi-ring  { border-color: var(--accent-pressed-c, #C9AE7C); }
[data-theme="light"] .fi-kop   { filter: drop-shadow(0 10px 26px rgba(18,18,18,.20)); }

@keyframes fi-ring {
  0%   { opacity: 0;   transform: scale(.42); }
  45%  { opacity: .5; }
  100% { opacity: 0;   transform: scale(1.10); }
}
@keyframes fi-bloom {
  0%   { opacity: 0; transform: scale(.6); }
  40%  { opacity: 1; }
  100% { opacity: 0; transform: scale(1.55); }
}
@keyframes fi-sheen {
  0%   { opacity: 0; transform: translateX(-70%); }
  35%  { opacity: .55; }
  100% { opacity: 0; transform: translateX(70%); }
}
/* Eén spoor voor drie dingen, want twee animaties op dezelfde transform vechten
   om dezelfde eigenschap en de laatste wint meteen:
     0–34%   indraaien — hij komt scherp en draait naar je toe (rotate -3° → 0)
     34–58%  stilstaan  — even niets, anders leest het als onrust
     58–86%  de knik    — één keer zakken en terug: hij ziet je
     86–100% uitrollen  — laatste rest van de knik dempt uit
   Een knik van 7 px op 200 px is klein op papier en groot genoeg in beeld. */
@keyframes fi-kop {
  0%   { opacity: 0; transform: scale(.80) rotate(-3deg); }
  34%  { opacity: 1; transform: scale(1.03) rotate(0deg); }
  46%  { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
  58%  { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
  72%  { opacity: 1; transform: scale(1.005) rotate(.6deg) translateY(7px); }
  86%  { opacity: 1; transform: scale(1) rotate(0deg) translateY(-2px); }
  100% { opacity: 1; transform: scale(1) rotate(0deg) translateY(0); }
}
@keyframes fi-word {
  0%   { opacity: 0; transform: translateY(9px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes fi-out {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(1.045); visibility: hidden; }
}

/* Kleine schermen: 200 px kop naast 30 px marge wordt benauwd onder ~380 px. */
@media (max-width: 380px) {
  .fi-stage { width: 208px; height: 208px; }
  .fi-kop   { width: 158px; height: 158px; }
  .fi-ring  { width: 190px; height: 190px; }
  .fi-bloom { width: 208px; height: 208px; }
  .fi-stage.is-ready .fi-sheen { width: 158px; height: 158px; }
  .fi-orb   { width: 124px; height: 124px; }
}

/* ── Minder beweging ───────────────────────────────────────────────────────
   Geen indraaien, geen knik, geen veeg. Wel een korte, rustige overgang: het
   scherm wisselt nog steeds zichtbaar, alleen zonder dat er iets beweegt.
   Ook korter, want zonder beweging is twee seconden alleen maar wachten. */
@media (prefers-reduced-motion: reduce) {
  #faro-intro.fi-aan { animation: fi-out .35s ease .75s forwards; }
  .fi-kop, .fi-orb  { animation: fi-fade .3s ease .05s both; }
  .fi-word          { animation: fi-fade .3s ease .3s both; }
  .fi-ring, .fi-bloom, .fi-stage.is-ready .fi-sheen { animation: none; opacity: 0; }
  @keyframes fi-fade { from { opacity: 0; } to { opacity: 1; } }
}
`;
}

/* ── Markup ───────────────────────────────────────────────────────────────────
   Zonder src. De <img> krijgt zijn bron pas in JS, en alleen als de intro
   écht speelt — anders haalt élke bezoeker die nooit inlogt de kop op.
   aria-hidden + geen focusbare inhoud: voor een schermlezer bestaat dit niet,
   want er valt niets te lezen dat niet een halve seconde later op de pagina
   zelf staat. */
function markup() {
  return `
<div id="faro-intro" hidden aria-hidden="true">
  <div class="fi-stage" id="fi-stage">
    <span class="fi-ring"></span>
    <span class="fi-bloom"></span>
    <span class="fi-orb"></span>
    <video class="fi-kop fi-kop--missing" id="fi-kop" muted playsinline preload="auto" disablepictureinpicture
           width="${MAAT.kop}" height="${MAAT.kop}" aria-hidden="true"></video>
    <span class="fi-sheen"></span>
  </div>
  <p class="fi-word" id="fi-word"></p>
</div>`;
}

/* ── Client ───────────────────────────────────────────────────────────────────
   ES5-concatenatie, geen backtick, geen ${ } — zie de kop van dit bestand. */
function js(opts = {}) {
  const src = String(opts.src || '/faro/faro-intro.mp4');
  /* De begroeting bestaat al, in vier talen: Faro's eigen landingsscherm
     gebruikt land.greet.morning/afternoon/evening. Die hergebruiken we, want
     twee begroetingen die los van elkaar vertaald worden lopen vroeg of laat
     uit elkaar — en dan zegt de intro iets anders dan het scherm eronder. */
  const t = _i18n.translator(opts.lang || _i18n.FALLBACK);
  const woorden = opts.woorden || {
    ochtend: t('land.greet.morning'),
    middag:  t('land.greet.afternoon'),
    avond:   t('land.greet.evening')
  };
  const J = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

  return `
/* ── Faro-intro ─────────────────────────────────────────────────────────── */
var FI_SRC = ${J(src)};
var FI_WOORDEN = ${J(woorden)};

function faroIntroGroet() {
  var u = new Date().getHours();
  var deel = u < 6 ? FI_WOORDEN.avond : u < 12 ? FI_WOORDEN.ochtend
           : u < 18 ? FI_WOORDEN.middag : FI_WOORDEN.avond;
  /* De naam komt uit de state die de login net gezet heeft. 'Gebruiker' is de
     plaatshouder waar het dashboard mee uitkomt als er geen naam bekend is —
     dat is geen naam, dus dan groeten we zonder. Zelfde lijstje als Faro zelf
     hanteert (_faro/ui/client.js), zodat de twee niet uit elkaar lopen. */
  var naam = '';
  try {
    var n = String((window.state && state.clientName) || '').trim();
    var plaatshouders = ['gebruiker', 'user', 'client account', 'utilisateur', 'benutzer'];
    if (n && plaatshouders.indexOf(n.toLowerCase()) === -1) naam = n.split(' ')[0];
  } catch (e) {}
  return naam ? deel + ', <b>' + faroIntroEsc(naam) + '</b>' : deel;
}

/* De naam komt uit een API-antwoord, dus hij gaat niet ongefilterd in innerHTML. */
function faroIntroEsc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function faroIntro() {
  var laag = document.getElementById('faro-intro');
  if (!laag || laag.dataset.gespeeld) return;   /* nooit twee keer */
  laag.dataset.gespeeld = '1';

  var woord = document.getElementById('fi-word');
  if (woord) woord.innerHTML = faroIntroGroet();

  /* De kop pas nu ophalen, en de lichtveeg pas aanzetten als hij er echt is.
     Mislukt het, dan blijft de bol staan en speelt alles verder gewoon door —
     precies zoals faro-mascot--missing het hiernaast doet. */
  var stage = document.getElementById('fi-stage');
  var kop = document.getElementById('fi-kop');
  var begonnen = false;

  /* De animatie pas starten als de kop binnen is, met een dak van 200 ms.

     Zonder dat dak zou een trage verbinding de intro ophouden, en dat is
     precies het moment waarop de klant zijn leads wil zien. Zonder de wacht
     zag je de bol oplichten en een halve seconde later de kop erin ploppen —
     gemeten op de dev-server, waar 24 kB over localhost al te laat was voor
     frame 0. Tweehonderd milliseconde is korter dan de auth-aanroep die er net
     aan voorafging, dus in de praktijk merkt niemand de wacht; wie hem wel
     haalt, krijgt de bol, en dat is de bedoelde terugval. */
  /* Meteen de grond neerzetten, nog voor de clip er is: zo ziet niemand het
     skelet van het dashboard onder de intro door. Zie .fi-wacht in css(). */
  laag.hidden = false;
  laag.classList.add('fi-wacht');

  var start = function () {
    if (begonnen) return;
    begonnen = true;
    laag.classList.remove('fi-wacht');
    laag.classList.add('fi-aan');
  };

  if (kop && stage) {
    /* De clip: Faro vliegt in en landt, 1,7 s, zonder geluid. Pas tonen als
       hij echt kan spelen; kan hij dat niet (oude browser, autoplay
       geweigerd, bestand weg) dan blijft de bol staan en speelt de rest
       gewoon door. De sheen-laag hoort bij de oude tekening en blijft uit. */
    /* play() pas als hij kan spelen. Meteen na het zetten van src wordt
       een play() door de eigen load() weer afgebroken (AbortError) en dan
       stond hij stil op frame 0 met de laag wel in beeld -- gemeten op de
       dev-server. */
    var speel = function () {
      try {
        var p = kop.play();
        if (p && p.catch) p.catch(function () { /* autoplay geweigerd: stilstaand beeld is ook goed */ });
      } catch (e) {}
    };
    var klaar = function () {
      kop.classList.remove('fi-kop--missing');
      start();
      speel();
    };
    kop.addEventListener('canplay', klaar, { once: true });
    kop.addEventListener('error', function () { start(); }, { once: true });
    kop.muted = true;
    kop.src = FI_SRC;
    kop.load();
    setTimeout(start, 350);
  } else {
    start();
  }

  var weg = function () {
    if (!laag.parentNode) return;
    laag.parentNode.removeChild(laag);
    document.removeEventListener('keydown', overslaan, true);
  };
  var overslaan = function () {
    laag.classList.add('fi-skip');
    setTimeout(weg, 200);
  };

  /* Drie onafhankelijke uitgangen — zie de kop van dit bestand.
     animationend vuurt ook voor de kinderen (ring, kop, woord), dus we
     luisteren alleen naar de uitgang van de laag zelf. */
  laag.addEventListener('animationend', function (e) {
    if (e.target === laag) weg();
  });
  laag.addEventListener('click', overslaan);
  document.addEventListener('keydown', overslaan, true);
  setTimeout(weg, ${T.hard});
}
`;
}

/* Wat dashboard.js's template-literal zou breken, tegenhouden vóór het erin
   gaat — dezelfde controle die _faro/ui/index.js doet. */
function verify() {
  const uit = css() + markup() + js();
  if (uit.indexOf('`') !== -1) throw new Error('_intro.js: backtick in de uitvoer breekt de literal van dashboard.js');
  if (uit.indexOf('${') !== -1) throw new Error('_intro.js: ${ } in de uitvoer wordt door dashboard.js geëvalueerd');
  return true;
}

module.exports = { css, markup, js, verify, T, MAAT };
