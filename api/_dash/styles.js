'use strict';
/*
 * De stijlen van het dashboard.
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * api/dashboard.js was 28.127 regels en 1,29 MB, en het geheel is EEN template
 * literal. HELVARO-ARCHITECTUUR noemt het opsplitsen daarvan "de grootste
 * openstaande schuld" met "hoog risico" -- terecht, want in dat bestand is een
 * backtick in een commentaar genoeg om de hele app op het inlogscherm te
 * zetten, en dat is echt gebeurd.
 *
 * Dit is de eerste snede, en met opzet de veiligste die er is. Het CSS-blok
 * was 9.477 regels (34% van het bestand) en bevatte:
 *
 *     backticks:        0
 *     backslashes:      0
 *     ${}-invullingen:  0
 *
 * Er valt dus niets aan te ontsnappen en niets om te zetten. De inhoud is
 * letterlijk verplaatst -- geen enkel teken veranderd -- en dat is te bewijzen:
 * de uitgestuurde pagina is in alle vier de talen byte voor byte dezelfde als
 * ervoor. Zie tests/dashboard-splitsing.test.js.
 *
 * ── Wat hier NIET in staat ───────────────────────────────────────────────────
 * De drie stukken die wel invullingen hebben: ${faro.css}, ${cmd.css} en
 * ${_intro.css()}. Die staan aan het eind van het <style>-blok en horen bij
 * hun eigen module; ze blijven in dashboard.js staan waar de waarden bestaan.
 *
 * ── Zelfde vorm als api/_faro/ui/styles.js ──────────────────────────────────
 * Een module met een onderstreepje die een string teruggeeft. Dat patroon
 * bestond hier al voor Faro's UI; deze snede volgt het, zodat er niet twee
 * manieren komen om hetzelfde te doen.
 */

/* Geen invullingen in deze string, en dat hoort zo te blijven. Komt er ooit een
   waarde in die van de klant afhangt, geef hem dan als PARAMETER mee -- een
   ${...} hier zou serverzijdig geevalueerd worden op een plek waar de context
   van dashboard.js niet bestaat. */
const CSS = `/* ============================================================
   SELF-HOSTED FONTS (GDPR — no requests to Google's CDN)
   Inter only. Orbitron was removed 2026-08 — its zero glyph (a squared
   shape with a diagonal slash) rendered as a broken-looking box at
   dashboard sizes, most visibly in "€0" / "0%" / "0 leads" empty states.
   On a dashboard where the numbers ARE the product, that read as the app
   being broken. Inter's numerals are excellent and already loaded, so
   every former Orbitron use now sets font-variant-numeric: tabular-nums
   instead — same "confident data" register, correct zero, columns that
   don't jitter as figures update.
   ============================================================ */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('/fonts/inter-var.woff2') format('woff2');
}
@font-face {
  /* Space Grotesk, self-hosted for the same GDPR reason as Inter. This is the
     brand's heading face — the marketing site loads it from Google, which is
     the leak we already closed here. Variable, so 500/600/700 all come from
     one 22 KB file. */
  font-family: 'Space Grotesk';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('/fonts/space-grotesk-var.woff2') format('woff2');
}
/* ============================================================
   CSS CUSTOM PROPERTIES
   ============================================================ */
:root {
  /* ── Sand Black — the brand, restored ──────────────────────────────────
     An earlier pass moved the accent off #E8D7B1 to a brighter gold and
     recoloured the neutrals cool-blue. The diagnosis behind that was right
     (the surfaces read flat and the warm wash over grey went muddy) but the
     remedy overwrote the brand. These are the real values, from the brand
     guide and from helvaro.pro's own tokens. The flatness is fixed the way
     the marketing site fixes it — with a genuine soft shadow and honest
     borders — not by changing the colours.

     THE CONTRAST RULE, which is the whole reason there are two accent
     tokens: sand is a FILL, never type. #E8D7B1 as text on white is about
     1.7:1, invisible. So --accent-c fills (always with dark text on it) and
     --accent-ink is what you set type in. */
  /* ══ TONALE RAMPS ═══════════════════════════════════════════════════
     Vier families van elf stops, gerekend in OKLCH en niet met de hand
     gekozen. Dat verschil is zichtbaar: in HSL lijkt een reeks gelijkmatig
     terwijl het oog hem als sprongen leest -- geel op 50%% helderheid leest
     veel lichter dan blauw op 50%%. OKLCH-lightness loopt wel gelijk op met
     wat je waarneemt, dus deze trappen staan er als echte trappen.

     Chroma volgt een boog in plaats van een rechte lijn: aan de uiteinden
     minder verzadiging, want een bijna-witte tint op volle chroma wordt
     roze en een bijna-zwarte wordt modderig. Het midden houdt de kleur op
     sterkte.

     ZAND is het merk. KLEI, OLIJF en STEEN zijn aardse begeleiders in
     dezelfde warme hoek van het spectrum -- geen regenboog, en nadrukkelijk
     geen blauw of paars, want die sluit de huisstijl uit.

     Achter elke stop staat waar hij als TEKST mag staan. Dat is geen
     versiering: een kleur die als vulling klopt is niet automatisch
     leesbaar als letter, en dat is precies waar dit bestand al een keer
     op is misgegaan (zand op wit = 1,7:1). */

  --zand-50: #FCF6E9;
  --zand-100: #F5ECD7;
  --zand-200: #E8D7B1;
  --zand-300: #D1C3A2;
  --zand-400: #B9A986;
  --zand-500: #A0916D;
  --zand-600: #867755;
  --zand-700: #6A5C3D;
  --zand-800: #4E4228;
  --zand-900: #322914;
  --zand-950: #1D1607;

  --klei-50: #FFF2E5;
  --klei-100: #FFE5D0;
  --klei-200: #FED0B5;
  --klei-300: #ECB797;
  --klei-400: #D59C79;
  --klei-500: #BC8360;
  --klei-600: #A06A48;
  --klei-700: #805031;
  --klei-800: #61381D;
  --klei-900: #41210A;
  --klei-950: #271002;

  --olijf-50: #F5F9E9;
  --olijf-100: #EBF0D6;
  --olijf-200: #D8DFBD;
  --olijf-300: #C1C9A1;
  --olijf-400: #A8B085;
  --olijf-500: #8F986B;
  --olijf-600: #767E54;
  --olijf-700: #5B623C;
  --olijf-800: #424727;
  --olijf-900: #292D13;
  --olijf-950: #161906;

  --steen-50: #F9F6F1;
  --steen-100: #F1ECE4;
  --steen-200: #E0DACF;
  --steen-300: #CBC3B7;
  --steen-400: #B2AA9D;
  --steen-500: #999184;
  --steen-600: #7F786B;
  --steen-700: #635D51;
  --steen-800: #494339;
  --steen-900: #2E2922;
  --steen-950: #1A1711;

  --bg:            #14120E;
  --bg-alt:        #0F0D09;
  /* Een kaart is nu een VERLOOP en geen vlakke vulling, en dat is het verschil
     tussen 'een vlak met een schaduw eronder' en iets dat licht vangt. Van
     boven iets lichter, naar onder iets donkerder -- precies zoals een plaat
     die onder een lamp ligt.

     Het bereik is 3,5% helderheid. Dat is met opzet nauwelijks te benoemen:
     zie je de overgang als een streep, dan is het te veel. Je moet het merken
     als diepte, niet herkennen als een verloop.

     Dit mag omdat alle 97 gebruiken in dit bestand 'background:' zijn en geen
     enkele 'background-color:' -- nagerekend, niet aangenomen. --card-flat
     blijft bestaan voor het geval er ooit wel een platte kleur nodig is. */
  --card-flat:     #25231F;
  --card:          linear-gradient(180deg, #2A2824 0%, #25231F 55%, #22201C 100%);
  --card-elevated: linear-gradient(180deg, #32302C 0%, #2C2A26 55%, #282623 100%);
  /* De rand stond op #262626 terwijl de kaart op #232323 staat: drie punten
     ertussen, en dan IS er geen rand. Een kaart zonder rand leunt volledig op
     zijn schaduw, en op bijna-zwart doet een schaduw bijna niets -- vandaar
     dat alles vlak aanvoelde. Nu is het verschil zichtbaar zonder dat er een
     lijn OM de kaart komt: het leest als een vouw, niet als een omtrek.
     --divider blijft de zachtste, want een scheiding BINNEN een kaart hoort
     minder te doen dan de kaartrand zelf.
     Staat twee keer, en dat hoort: het tweede blok zet de donkere tokens vast
     voor een paneel dat altijd donker is. Uit elkaar laten lopen is precies
     hoe zoiets stilletjes scheef gaat. */
  --border-c:      #35332F;
  --border-strong: #474540;
  --divider:       #2C2A26;
  --hover-c:       #1E1C18;

  /* Het accent hangt nu aan de ramp in plaats van los te staan. --zand-200 IS
     #E8D7B1 -- die stop is met opzet vastgepind op de merkwaarde, zodat de ramp
     het merk BEVAT en niet benadert. Er verandert dus geen pixel; wat er bij
     komt is dat elke tint ernaast nu een naam heeft en op afstand klopt. */
  --accent-c:        var(--zand-200);
  --accent-hover-c:  #DDCAA1;
  --accent-pressed-c:var(--zand-300);
  --accent-deep:     #C9AE7C;   /* tweede stop in verlopen */
  --accent-ink:      var(--zand-100);   /* accent ALS TEKST, alleen op donker */
  --on-accent:       #121212;   /* always dark type on sand */

  --text-c:        #F9F9F9;
  --text-muted-c:  #B5B5B5;
  --text-disabled: #999999;
  --text-inverse:  #121212;

  --success-c: #22C55E;
  --warning-c: #D4A017;
  --error-c:   #DC2626;
  --info-c:    #B5B5B5;   /* no blue: the brand rules out blue accents */

  /* Semantic colours AS TEXT. Same story as --accent-c vs --accent-ink: a hue
     picked to read as a fill is not automatically legible as type, and the
     place it breaks is a chip that tints the SAME hue behind it — a green
     score on a 15%-green pill. On dark the fill values already clear 4.5:1
     against both the canvas and their own chip, so these are aliases here and
     dark is unchanged; the light block overrides them with darker values. */
  --success-ink: var(--success-c);   /* 6,9:1 op de kaart — prima als tekst */
  --warning-ink: var(--warning-c);  /* 6,6:1 */
  /* Rood is de uitzondering: #DC2626 is hetzelfde in beide thema's en haalt
     op donker maar 3,25:1 op de kaart en 2,95:1 op zijn eigen chip. Als vulling
     klopt het, als tekst niet — precies dezelfde fout als sand op wit, alleen
     de andere kant op. */
  --error-ink:   #F87171;           /* 5,68:1 op de kaart, 5,14:1 op de chip */
  --neutral-ink: #96A2B6;   /* 4,9:1 op de chip waar hij op staat; licht thema maakt hem donkerder */

  --bubble-incoming: #211F1B;

  --accent-rgb:  232,215,177;
  --success-rgb: 34,197,94;
  --warning-rgb: 212,160,23;
  --error-rgb:   220,38,38;
  --info-rgb:    181,181,181;
  --text-rgb:    249,249,249;
  --on-accent-rgb: 18,18,18;

  /* Twee families, zoals de huisstijl voorschrijft: Space Grotesk voor koppen,
     Inter voor alles wat je leest. Space Grotesk valt terug op Inter, dus als
     het woff2-bestand ontbreekt wordt de pagina niet lelijk — alleen minder
     eigen. */
  --font-head: 'Space Grotesk', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  /* 8 / 14 / 22, per the brand's shape language */
  --radius-sm:   8px;
  --radius-btn:  14px;
  --radius-card: 22px;

  /* Twee curves, en dat is nieuw: --ease-spring was LETTERLIJK hetzelfde
     getal als --ease-out. Elke plek die om een veer vroeg kreeg dus dezelfde
     vlakke afremming, en precies dat is wat een interface stroef laat
     aanvoelen -- alles komt tot stilstand alsof het tegen een muur loopt.

     --ease-out blijft ongemoeid: dat is de merkcurve, en die hoort onder alles
     wat gewoon van kleur of positie verandert. --ease-spring krijgt nu een
     echte overshoot: hij schiet een paar procent voorbij zijn eindpunt en valt
     terug. Op iets dat OPKOMT -- een kaart, een paneel, een menu -- leest dat
     als gewicht in plaats van als een animatie.

     Bewust ingehouden (1.16 en niet 1.6): een dashboard waar iemand de hele
     dag in werkt mag niet stuiteren. Je moet het voelen, niet zien. */
  --ease-out:    cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.16, 0.64, 1);
  --dur-fast:    140ms;
  --dur-base:    220ms;
  --dur-enter:   320ms;
  --transition-fast: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition:      all 220ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Soft and deep, never a hard drop. This is what makes a #232323 card read
     as raised on a #121212 page without changing either colour. */
  --elev-0: none;
  /* Drie lagen in plaats van twee, en de verste waaiert ruimer en lichter
     uit. Een echte schaduw heeft een harde kern vlak onder het object en een
     wolk die ver uitloopt; met twee lagen krijg je de kern wel en de wolk
     niet, en dan lijkt een kaart op de pagina GEPLAKT in plaats van dat hij
     erboven hangt. De totale donkerte blijft ongeveer gelijk -- ze is verdeeld
     over meer afstand, niet opgeschroefd. */
  --elev-1: 0 1px 2px rgba(0,0,0,.34), 0 4px 10px rgba(0,0,0,.22), 0 12px 32px rgba(0,0,0,.16);
  --elev-2: 0 2px 4px rgba(0,0,0,.36), 0 8px 20px rgba(0,0,0,.26), 0 24px 56px rgba(0,0,0,.20);
  --elev-3: 0 4px 8px rgba(0,0,0,.40), 0 16px 36px rgba(0,0,0,.32), 0 48px 96px rgba(0,0,0,.26);
  --shadow:      0 1px 2px rgba(0,0,0,.34), 0 6px 16px rgba(0,0,0,.24), 0 18px 44px rgba(0,0,0,.18);
  --shadow-card: 0 1px 2px rgba(0,0,0,.30), 0 5px 14px rgba(0,0,0,.20), 0 16px 40px rgba(0,0,0,.15);
  --shadow-glow: none;

  /* De lichtlip bovenop, plus nieuw: een schaduwlip onderaan. Samen maken ze
     van een rechthoek een plaat met dikte -- licht valt op de bovenrand, de
     onderrand ligt in zijn eigen schaduw. Eén lip alleen leest als een streep;
     twee lezen als een rand.
     Van 0.04 naar 0.07: op een verloop dat zelf al oploopt moest de lip mee
     omhoog, anders verdwijnt hij in de bovenste stop. */
  --edge-hi: inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.22);

  --glass-fill:  rgba(18,18,18,0.78);
  --glass-edge:  rgba(255,255,255,0.06);
  --glass-blur:  saturate(140%) blur(18px);

  /* ── One accent, not a rainbow ──────────────────────────────────────────
     There used to be seven per-card hues here (emerald, blue, purple,
     orange, coral, cyan, gold). The brand rules out purple, indigo and blue
     outright, and a dashboard for someone who handles other people's money
     should not look like a colour wheel. Cards are now differentiated by
     sand at varying strength, with real colour reserved for STATUS: green
     when something succeeded, amber when it needs attention, red when it
     failed. That is information, not decoration. */
  --c-sand:    #E8D7B1;  --c-sand-soft:    rgba(232,215,177,0.10);
  --c-deep:    #C9AE7C;  --c-deep-soft:    rgba(201,174,124,0.10);
  --c-emerald: #22C55E;  --c-emerald-soft: rgba(34,197,94,0.12);
  --c-amber:   #D4A017;  --c-amber-soft:   rgba(212,160,23,0.12);
  --c-coral:   #DC2626;  --c-coral-soft:   rgba(220,38,38,0.12);
  /* Legacy aliases so the ~40 existing var(--c-blue) style references keep
     resolving; they now all land on sand instead of off-brand hues. */
  --c-blue:    var(--c-sand);   --c-blue-soft:   var(--c-sand-soft);
  --c-purple:  var(--c-deep);   --c-purple-soft: var(--c-deep-soft);
  --c-cyan:    var(--c-sand);   --c-cyan-soft:   var(--c-sand-soft);
  --c-orange:  var(--c-amber);  --c-orange-soft: var(--c-amber-soft);
  --c-gold:    var(--c-sand);   --c-gold-soft:   var(--c-sand-soft);

  --grad-gold:    linear-gradient(135deg, #E8D7B1, #C9AE7C);
  --grad-ai:      linear-gradient(135deg, #E8D7B1, #C9AE7C);
  --grad-data:    linear-gradient(135deg, #C9AE7C, #E8D7B1);
  --grad-success: linear-gradient(135deg, #22C55E, #16A34A);

  /* ---- legacy token names (kept so every existing var(--x) in this
     18k-line file resolves without a line-by-line rewrite) ---- */
  --bg-primary:    var(--bg);
  --bg-card:       var(--card);
  --bg-card-alt:   var(--bg-alt);
  --bg-card-hover: var(--hover-c);
  --blue-primary:  var(--accent-c);
  --blue-bright:   var(--accent-hover-c);
  --cyan:          var(--accent-c);
  --green:         var(--success-c);
  --red:           var(--error-c);
  --orange:        var(--warning-c);
  --green-ink:     var(--success-ink);
  --red-ink:       var(--error-ink);
  --orange-ink:    var(--warning-ink);
  --accent:        var(--accent-c);
  --accent-bright: var(--accent-hover-c);

  /* Deze zes ontbraken in dit blok, terwijl er 42 keer naar verwezen wordt.
     Een var() zonder fallback naar iets ongedefinieerds maakt de hele
     declaratie ongeldig, dus die 42 regels deden niets en de eigenschap erfde
     van de ouder — zichtbaar op het inlogscherm, waar de foutmelding daardoor
     bijna-wit op lichtroze stond. Aliassen, geen nieuwe kleuren, zodat ze het
     thema volgen net als de rest hierboven. */
  --error:          var(--error-c);
  --warning:        var(--warning-c);
  --success:        var(--success-c);
  --info:           var(--info-c);
  --accent-hover:   var(--accent-hover-c);
  --accent-pressed: var(--accent-deep);
  --text:          var(--text-c);
  --text-primary:  var(--text-c);
  --text-secondary:var(--text-muted-c);
  --text-muted:    var(--text-muted-c);
  --border:        var(--border-c);
  --border-bright: var(--border-strong);
  --scrollbar-bg:  var(--bg);
  --scrollbar-thumb: var(--border-strong);
  /* De focusring. Zie de regel bij :where(...):focus-visible verderop voor het
     waarom; hier alleen de kleur, want die MOET per thema verschillen: zand
     haalt 10-13:1 op de donkere vlakken en 1,3:1 op de lichte. Een enkele
     kleur die het overal haalt bestaat niet -- nagerekend op alle zes vlakken
     waar een ring kan landen. */
  --focus-ring: #E8D7B1;
  --radius:        var(--radius-btn);
  --radius-s:      var(--radius-sm);
}

[data-theme="light"] {
  /* Taken straight from helvaro.pro's own custom properties, so the app and
     the marketing site are the same product rather than two designs that
     happen to share a logo. */
  /* Hier zat de grootste vlakheid van het hele product: pagina wit, kaart
     wit, verhoogde kaart ook wit. Drie lagen met exact dezelfde kleur, dus
     alles moest komen van een randje van 1px -- en dan leest een dashboard
     als een spreadsheet.

     De pagina wordt nu een warme gebroken tint en de kaart blijft zuiver wit.
     Dat is de omkering die het doet: niet de kaart donkerder maken (dan wordt
     hij vies), maar de GROND eronder terugnemen, zodat wit weer iets
     betekent. De verhoogde kaart blijft ook wit en onderscheidt zich met
     hoogte in plaats van met kleur -- daar is --elev-2 voor.

     Warm en niet neutraalgrijs, want het accent is zand. Een koele grijze
     grond onder een zandgeel accent laat dat accent groezelig lijken; dat is
     exact de fout die bovenaan dit bestand al beschreven staat.

     Gemeten, niet gegokt. Wit-op-wit gaf een contrastverhouding van exact
     1,000 -- wiskundig geen verschil, en dat is letterlijk waarom het vlak
     leek. #FAF9F6 bracht dat op 1,053; deze grond zit op 1,108, ruim dubbel
     zoveel scheiding, met een rood-blauwverschil van 10 punten zodat hij
     hoorbaar warm is en niet grijs. Donkerder dan dit wordt beige. */
  --bg:            #F6F3EC;
  --bg-alt:        #EEE9DE;
  /* Op wit kan het verloop maar een kant op: naar beneden. En het krijgt de
     zandhue mee, want zuiver grijs onder een zandaccent leest koud -- dezelfde
     reden als bij de grond hierboven. 1,6% bereik; nog subtieler dan op donker,
     omdat het oog op wit veel gevoeliger is voor banding. */
  --card-flat:     #FFFFFF;
  --card:          linear-gradient(180deg, #FFFFFF 0%, #FEFDFB 60%, #FCFAF6 100%);
  --card-elevated: linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 55%, #FDFCF9 100%);
  --border-c:      #E7E3DA;
  --border-strong: #D6D0C2;
  --divider:       #EDE9E0;
  --hover-c:       #FAFAF8;

  --accent-c:        #E8D7B1;   /* sand still fills, even on white */
  --accent-hover-c:  #DDCAA1;
  --accent-pressed-c:#D3BE93;
  --accent-deep:     #D3BE93;
  /* Sand as type on white is ~1.7:1. This deeper bronze is the brand's
     answer, and it is the ONLY accent allowed to carry text here.

     Het was #8A6A33, en dat haalde op WIT 5,01:1 -- daar was op gemeten. Maar
     accenttekst staat bijna nooit op wit: hij staat op de getinte vlakken
     eromheen. Alle 32 stukjes tekst die in het lichte thema onder 4,5:1 zaten
     hadden precies deze kleur, en allemaal op zo'n tint:

       op #FFFFFF (puur wit)     5,01:1  ok
       op #EEE9DE (--bg-card-alt) 4,14:1  te weinig
       op #EDE7D9                 4,07:1  te weinig
       op #F3EDE0 t/m #F5F1E8     4,30 - 4,45:1  te weinig

     Dezelfde tint en verzadiging, alleen donkerder tot het overal boven 4,5
     uitkomt met marge: 4,84 op het donkerste vlak, 5,97 op wit. De zijbalk
     hergebruikt --accent-ink niet (nagekeken: nul accenttekst daarbinnen),
     dus donkerder maken raakt dat permanent donkere paneel niet. */
  --accent-ink:      #7E5E27;
  --on-accent:       #121212;

  --text-c:        #111827;
  --text-muted-c:  #4B5563;
  --text-disabled: #6B7280;
  --text-inverse:  #FFFFFF;

  --success-c: #16A34A;
  --warning-c: #B45309;
  --error-c:   #DC2626;
  --info-c:    #6B7280;

  /* Measured against the worst surface each one actually lands on — its own
     15% chip over a white card, which is where the score badges live:
       #166534 on #DCF1E4 = 6.03:1   (was #16A34A at 2.78:1)
       #92400E on #F4E5DA = 5.76:1   (was #B45309 at 4.08:1)
       #B91C1C on #FADEDE = 5.10:1   (was #DC2626 at 3.81:1)
     Fills keep the brighter values above, so the chips still read as green,
     amber and red at a glance. */
  --success-ink: #166534;
  --warning-ink: #92400E;
  --error-ink:   #B91C1C;
  --neutral-ink: #45526B;   /* 2,67:1 -> 7,3:1 on the chip it actually sits on */

  --bubble-incoming: #F3F4F6;

  --accent-rgb:  232,215,177;
  --success-rgb: 22,163,74;
  --warning-rgb: 180,83,9;
  --error-rgb:   220,38,38;
  --info-rgb:    107,114,128;
  --text-rgb:    17,24,39;
  --on-accent-rgb: 18,18,18;

  /* Same single accent on white. The bronze is what shows up as an icon or a
     hairline; the sand is what fills a button under dark text. */
  --c-sand:    #8A6A33;  --c-sand-soft:    rgba(232,215,177,0.30);
  --c-deep:    #6F5427;  --c-deep-soft:    rgba(201,174,124,0.26);
  --c-emerald: #16A34A;  --c-emerald-soft: rgba(22,163,74,0.10);
  --c-amber:   #B45309;  --c-amber-soft:   rgba(180,83,9,0.10);
  --c-coral:   #DC2626;  --c-coral-soft:   rgba(220,38,38,0.10);

  --grad-gold:    linear-gradient(135deg, #E8D7B1, #D3BE93);
  --grad-ai:      linear-gradient(135deg, #E8D7B1, #D3BE93);
  --grad-data:    linear-gradient(135deg, #D3BE93, #E8D7B1);
  --grad-success: linear-gradient(135deg, #16A34A, #4D7C0F);

  --bg-primary:    var(--bg);
  --bg-card:       var(--card);
  --bg-card-alt:   var(--bg-alt);
  --bg-card-hover: var(--hover-c);
  --accent:        var(--accent-c);
  --accent-bright: var(--accent-hover-c);
  --text:          var(--text-c);
  --text-primary:  var(--text-c);
  --text-secondary:var(--text-muted-c);
  --text-muted:    var(--text-muted-c);
  --border:        var(--border-c);
  --border-bright: var(--border-strong);
  --scrollbar-bg:  var(--bg);
  --scrollbar-thumb: var(--border-strong);
  /* Het lichtste warme goud dat op alle drie de lichte vlakken boven 3:1 komt
     (pagina #F6F3EC 3,92:1, kaart wit 4,34:1, kaart-alt #EEE9DE 3,59:1).
     #A8813B lag dichter bij het accent maar bleef op kaart-alt op 2,96:1
     steken, en #9E8242 haalde daar 3,03:1 -- net erboven is niet genoeg
     marge voor iets waar je op moet kunnen zien waar je bent. */
  --focus-ring: #96742F;

  /* The site's own card shadow, verbatim. */
  /* Ook hier drie lagen, en warm getint in plaats van blauwgrijs. Een schaduw
     is licht dat wordt tegengehouden, dus hij hoort de kleur van de grond te
     dragen -- rgba(17,24,39) is koel blauw en dat vecht met een zandaccent op
     een warme grond. De kern is nieuw: op wit was er alleen een verre wolk,
     dus een kaart had geen contactpunt met de pagina en zweefde stuurloos. */
  --shadow:        0 1px 2px rgba(64,52,32,0.06), 0 4px 12px rgba(64,52,32,0.06), 0 16px 40px rgba(64,52,32,0.07);
  --shadow-card:   0 1px 2px rgba(64,52,32,0.05), 0 3px 10px rgba(64,52,32,0.05), 0 14px 36px rgba(64,52,32,0.06);
  --shadow-glow:   none;
  --elev-1: 0 1px 2px rgba(64,52,32,.05), 0 3px 10px rgba(64,52,32,.05), 0 12px 30px rgba(64,52,32,.05);
  --elev-2: 0 1px 3px rgba(64,52,32,.06), 0 6px 18px rgba(64,52,32,.07), 0 22px 52px rgba(64,52,32,.08);
  --elev-3: 0 2px 6px rgba(64,52,32,.08), 0 14px 34px rgba(64,52,32,.10), 0 44px 92px rgba(64,52,32,.12);
  /* A white highlight on a white card is nothing. */
  --edge-hi: none;

  --glass-fill:  rgba(255,255,255,0.80);
  --glass-edge:  rgba(255,255,255,0.90);
  --glass-blur:  saturate(160%) blur(18px);
}

/* ============================================================
   RESET & BASE
   ============================================================ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── Waar ben ik? ────────────────────────────────────────────────────────────
   Met een echte Tab-toets gemeten, want programmatische focus telt in Chrome
   niet als :focus-visible en geeft dus een vals beeld. Wat er te zien was:

     .btn-icon            zandring van de app        (goed)
     .nav-item            eigen ring van de app      (goed)
     .ap-chip             Chrome's eigen ring, #F5ECD7
     .ap-btn / .fm-btn    Chrome's eigen ring, #121212 -- op een donkere kaart
                          1,27:1, oftewel onzichtbaar
     .cal-nav-btn         Chrome's eigen ring, oranje #E59700

   Drie verschillende ringen dus, waarvan een die je op de helft van de app
   niet ziet. Wie met het toetsenbord werkt raakt daar simpelweg kwijt waar hij
   is -- op "Je assistent" zijn dat tien chips, acht knoppen en vijf
   tekstvelden achter elkaar.

   :where() geeft deze regel specificiteit NUL. Dat is met opzet: dit is een
   vloer, geen overheersing. Elke bestaande focusregel wint hier gewoon van, en
   .btn-icon en .nav-item houden dus hun eigen ring. Alleen wie er geen had
   krijgt er een.

   outline en niet box-shadow: box-shadow zou de eigen schaduw van een element
   tijdens focus vervangen, en outline doet niets met de layout. */
:where(button, a[href], input, select, textarea, summary,
       [role="button"], [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--focus-ring, #E8D7B1);
  outline-offset: 2px;
}

/* ── Gebeurde er iets toen ik drukte? ────────────────────────────────────────
   Zelfde meting, zelfde uitkomst als bij de focusring: 33 knoppen gaven een
   duwtje terug en 59 niet, en welke je kreeg hing af van of de knop uit het
   ontwerpsysteem kwam of ter plekke was gemaakt. Op een trage verbinding is
   dat het verschil tussen "hij doet het" en nog een keer klikken.

   Ook hier :where(), dus specificiteit nul: de dertien knoppen die al een
   eigen :active hebben houden die gewoon. Een pixel omlaag is precies wat
   .nav-item al deed -- dit maakt er de huisregel van in plaats van een
   uitzondering.

   :not(:disabled) want een knop die niets doet hoort ook niet te bewegen; dat
   zou juist zeggen dat er wel iets gebeurde. */
:where(button, [role="button"], a[class*="btn"]):active:not(:disabled):not([aria-disabled="true"]) {
  transform: translateY(1px);
}

html { font-size: 15px; }

body {
  font-family: 'Inter', sans-serif;
  /* Very wide, very low-opacity pools instead of one flat fill. Glass has
     nothing to refract over a single solid colour — it just looks like a
     lighter rectangle. These give the blurred layers something to pick
     up, and stop large empty regions reading as dead space. Fixed
     attachment so the field stays put while content scrolls over it,
     which is what sells the layers as separate planes.

     Both pools used to be warm sand over a neutral grey page, which is
     exactly what turned the whole app muddy brown. Now one warm gold
     pool and one cool blue one, opposite corners: the warm side keeps
     the brand present, the cool side stops the page collapsing into a
     single temperature. */
  background:
    radial-gradient(1200px 800px at 10% -12%, rgba(232,215,177,0.10), transparent 62%),
    radial-gradient(1000px 760px at 100% 4%, rgba(155,133,81,0.08), transparent 58%),
    var(--bg-primary);
  background-attachment: fixed;
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
  transition: background 0.3s ease, color 0.3s ease;
}

/* Subtle dot grid. Barely visible, neutral — no colour wash */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image: radial-gradient(circle, rgba(241,237,229,0.045) 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.4;
}

/* Ambient wash. One quiet gold bloom at the top, never a flood */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 40% at 50% -5%, rgba(232,215,177,0.05) 0%, transparent 60%);
  pointer-events: none;
  z-index: 0;
}

/* The two pools on the body element are tuned for a near-black ground.
   Over a light
   page the same alphas turn the top of the screen into a dirty smear, so
   light gets its own, much quieter field: a hint of gold top-left, a hint
   of cool top-right, and otherwise clean paper. */
[data-theme="light"] body {
  background:
    radial-gradient(1100px 720px at 8% -14%, rgba(201,163,78,0.10), transparent 60%),
    radial-gradient(900px 680px at 100% 2%, rgba(155,133,81,0.06), transparent 56%),
    var(--bg-primary);
}

[data-theme="light"] body::before {
  background-image: radial-gradient(circle, rgba(37,33,25,0.05) 1px, transparent 1px);
  background-size: 28px 28px;
  opacity: 0.6;
}

[data-theme="light"] body::after {
  display: block;
  background:
    radial-gradient(ellipse 70% 40% at 50% -10%, rgba(201,163,78,0.06) 0%, transparent 60%);
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: var(--scrollbar-bg); }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 10px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-disabled); }

/* ============================================================
   TYPOGRAPHY
   ============================================================ */
/* Koppen in Space Grotesk, 600-700, -0.02em — dat is wat de huisstijl zegt en
   wat helvaro.pro doet. Een eerdere ronde hier draaide alles op één familie
   (Inter op 800) omdat de vorige tweede letter Orbitron was, en die paste
   nergens bij. Dat argument gold Orbitron, niet het idee van een tweede
   letter: Space Grotesk is juist de kop-letter van het merk, dus de app en de
   site lezen nu als hetzelfde product. 800 gaat naar 700 omdat Space Grotesk
   niet zwaarder gaat en op 700 al steviger oogt dan Inter op 800. */
h1, h2, h3, .display-heading, .page-title, .stat-value, .card-title {
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
}

/* Was a gradient-clip effect (indigo → cyan). A single accent colour reads
   calmer and is the "important number / highlight" use case sand is for. */
.gradient-text {
  background: none;
  -webkit-text-fill-color: currentColor;
  background-clip: initial;
  color: var(--accent-ink);
}

[data-theme="light"] .gradient-text {
  -webkit-text-fill-color: currentColor;
  background: none;
}

/* ============================================================
   LAYOUT
   ============================================================ */
#app { position: relative; z-index: 1; }

.app-layout {
  display: flex;
  min-height: 100vh;
}

.main-content {
  flex: 1;
  /* Zonder dit loopt de Pipeline buiten beeld. Een flex-kind heeft standaard
     min-width:auto en kan dus niet kleiner worden dan zijn INHOUD. Het
     kanbanbord is breder dan het scherm, dus in plaats van dat het bord zelf
     schuift (het heeft overflow-x:auto) groeide deze kolom mee: 1420px bij een
     venster van 1440 met 220px zijbalk, oftewel 205px die je met geen enkele
     scrollbeweging kon bereiken. Weg waren de laatste pipelinekolom en, in de
     kopbalk, de bel en de themaschakelaar.
     min-width:0 geeft de kolom toestemming om te krimpen; pas dan doet de
     overflow-x op het bord waar hij voor bedoeld is. */
  min-width: 0;
  margin-left: 220px;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s ease;
}

.page-content {
  flex: 1;
  /* Zelfde reden als bij .main-content hierboven: ook dit is een flex-kind. */
  min-width: 0;
  padding: 24px 28px;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Een tabel heeft een harde min-content-breedte: kolomkoppen en getallen
   kunnen niet verder krimpen. Op een telefoon liep .source-table daardoor 129px
   buiten beeld, en omdat de pagina zijn overflow verbergt was dat geen
   scrollbalk maar een tabel die stilletjes kolommen kwijtraakte. Eén wrapper
   die zelf scrollt geeft ze terug. */
/* De storingsbalk. display:flex staat op de klasse en niet inline, zodat een
   [hidden] of style.display='none' hem ook echt weg krijgt — een eerdere versie
   van een banner in dit bestand bleef zichtbaar boven een gezonde pagina omdat
   display:flex het van [hidden] won. */
/* Aanraakdoelen. WCAG 2.2 vraagt minimaal 24x24 CSS-pixels voor iets dat je
   moet kunnen raken; deze zaten daaronder — potloodjes en kruisjes van 14 tot
   20 pixels.

   Eerste poging was een onzichtbaar ::after om het raakvlak te vergroten zonder
   de layout te verschuiven. Gemeten met elementFromPoint bleek dat niet te
   werken: op 11px van het midden ving het pseudo-element de klik niet op, want
   een ouder knipt zijn overflow af. Dus gewoon de knop zelf op maat, met het
   icoon gecentreerd zodat hij visueel niet groter oogt. */
#revenue-goal-edit,
.copy-btn,
#dash-checklist-close,
#btn-toggle-apikey,
#panel-copy-phone {
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.crm-error-banner {
  display: none;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin: 0 0 18px;
  padding: 14px 18px;
  border-radius: 12px;
  background: rgba(var(--error-rgb), 0.10);
  border: 1px solid rgba(var(--error-rgb), 0.28);
}
.crm-error-text { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.crm-error-text strong { font-size: 14px; color: var(--error-ink); }
.crm-error-text span { font-size: 13px; color: var(--text-muted); }
.crm-error-retry {
  padding: 8px 14px;
  border-radius: 10px;
  border: 1px solid rgba(var(--error-rgb), 0.35);
  background: none;
  color: var(--error-ink);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.crm-error-retry:hover:not(:disabled) { background: rgba(var(--error-rgb), 0.12); }
.crm-error-retry:disabled { opacity: 0.6; cursor: default; }
.crm-error-retry:focus-visible { outline: 2px solid var(--error-ink); outline-offset: 2px; }

.table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  max-width: 100%;
}
.table-scroll > table { min-width: 460px; }

/* Op de smalste telefoons is de paginamarge zelf het laatste dat nog wint van
   de inhoud: 2x28px is 56px van een scherm van 320. */
@media (max-width: 400px) {
  .page-content { padding: 18px 14px; }
}
@media (max-width: 360px) {
  .page-content { padding: 16px 10px; }
  /* Vangnet voor de laatste paar kaarten en knoppen die op 320px nog een paar
     pixel buiten beeld staken. Liever één regel die zegt "niets is breder dan
     zijn container" dan vijf losse uitzonderingen die de volgende kaart weer
     mist. */
  .page.active .profile-card,
  .page.active .fm-qr-card,
  .page.active .fm-preview-card,
  .page.active .fm-option-card,
  .page.active .cal-day-num,
  .page.active .stat-icon,
  .page.active #chk-whatsapp-mailto,
  .page.active .cal-book-btn {
    max-width: 100%;
    min-width: 0;
  }
  /* De onboarding-checklist zet een lange mailto-link op één regel; op 320px
     steekt die er 35px uit. Breken mag hier: het is een adres, geen knop. */
  .page.active #chk-whatsapp-mailto {
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .page.active .cal-book-btn {
    white-space: normal;
    padding-left: 10px;
    padding-right: 10px;
  }
}

/* ============================================================
   KOSTEN (alleen Helvaro)

   Een rekening, geen dashboard. Vandaar: één kolom, uitgelijnde bedragen met
   tabular-nums zodat je ze onder elkaar kan lezen, en de HERKOMST van elk
   bedrag als klein label ernaast. Dat label is het hele punt van de pagina --
   een lijstprijs en een ingevuld bedrag horen er niet hetzelfde uit te zien.
   ============================================================ */
/* Onderaan ruimte voor de Faro-balk, die vast onder in beeld staat. Zonder
   deze marge legt hij zich over de laatste regel van de laatste lijst. */
.kst-wrap { max-width: 940px; padding-bottom: 96px; }

.kst-top {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 14px;
  margin-bottom: 22px;
}
.kst-kaart {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 18px 20px;
}
.kst-lbl {
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.kst-groot {
  font-family: var(--font-head);
  font-size: 27px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.kst-onder { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

.kst-melding {
  border: 1px solid var(--border);
  border-left: 3px solid var(--warning-c);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  padding: 12px 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-muted);
  margin-bottom: 22px;
}

.kst-blok { margin-bottom: 26px; }
.kst-blok-kop { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.kst-blok-titel { font-size: 15px; font-weight: 700; }
.kst-blok-sub { font-size: 12px; color: var(--text-muted); }

.kst-tabel {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  overflow: hidden;
}
.kst-rij {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 18px;
  align-items: center;
  padding: 13px 18px;
  border-bottom: 1px solid var(--divider);
}
.kst-rij:last-child { border-bottom: none; }
.kst-rij.uit { opacity: .55; }
.kst-naam { font-size: 14px; font-weight: 600; }
.kst-meta { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
.kst-bedrag {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.kst-bedrag.leeg { color: var(--warning-ink); font-weight: 600; font-size: 13px; }

/* Wat deze dienst tot nu toe gekost heeft. Eigen regel onder de omschrijving:
   het is een ander soort getal dan het maandbedrag ernaast, en die twee door
   elkaar lezen is precies wat je hier niet wil. */
.kst-sinds {
  font-size: 12px;
  color: var(--accent-ink);
  margin-top: 5px;
  font-variant-numeric: tabular-nums;
}
.kst-sinds.leeg { color: var(--warning-ink); }

/* De herkomst. Klein, maar het verschil tussen een getal dat je kan geloven en
   een getal dat je moet controleren. */
.kst-bron {
  display: inline-block;
  font-size: 10px;
  letter-spacing: .06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  margin-left: 8px;
  vertical-align: 2px;
}
.kst-bron.ingevuld { color: var(--success-ink); border-color: rgba(var(--success-rgb), .45); }
.kst-bron.lijstprijs { color: var(--neutral-ink); }
.kst-bron.onbekend { color: var(--warning-ink); border-color: rgba(var(--warning-rgb), .45); }

.kst-sleutels {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
}
.kst-sleutel {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 13px;
  font-size: 12px;
}
.kst-stip { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.kst-stip.aan { background: var(--success-c); }
.kst-stip.uit { background: var(--border-strong); }
.kst-env { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.kst-sleutel-dienst { color: var(--text-muted); margin-left: auto; font-size: 11px; }

.kst-ai { margin-top: 12px; font-size: 12px; color: var(--text-muted); line-height: 1.7; }
.kst-leeg { padding: 18px; color: var(--text-muted); font-size: 13px; }

@media (max-width: 560px) {
  .kst-rij { grid-template-columns: 1fr; }
  .kst-bedrag { text-align: left; }
}

/* ============================================================
   LOGIN PAGE. FULL VIEWPORT SPLIT
   ============================================================ */
#login-page {
  /* Het merkpaneel rechts is een podium, geen oppervlak van de app: het blijft
     donker in beide thema's, zoals het logo dat erop staat. Het volgde eerder
     --bg, en dus het thema -- schakelde je naar licht, dan werd de halve
     inlogpagina wit en verdween de merkkant helemaal. Vandaar een eigen token
     in plaats van --bg: het is niet dezelfde kleur die toevallig gelijk is,
     het is een kleur die met opzet niet meebeweegt. */
  --login-stage:      #121212;
  --login-stage-ink:  #F9F9F9;
  --login-stage-dim:  #A9A6A0;

  /* ── Het formulierpaneel is donker ────────────────────────────────────────
     Het was wit, en dat was de enige plek in de app waar het merk zichzelf
     tegensprak: een wit paneel naast een zwart podium, met een gouden logo dat
     op geen van beide dezelfde kleur kon zijn. Daar kwam de plaat onder het
     logo vandaan, daar kwam de inkt-variant vandaan, en daar kwam de regel
     vandaan dat dit paneel "altijd wit" is en het thema niet volgt.

     Nu volgt het het thema nog steeds niet -- maar het staat aan de goede kant.
     Donker is de standaard van de app (initTheme geeft elke nieuwe bezoeker
     dark), het merk is goud-op-zwart, en het gouden logo hoeft nergens meer
     omgekleurd of ingelijst te worden.

     De waarden komen uit het donkere thema van de app zelf, niet uit een nieuw
     palet: #F9F9F9 en #B5B5B5 zijn --text-c en --text-muted-c, #35332F is
     --border-c. Eén uitzondering, hieronder. */
  --login-panel:      #1E1B16;   /* iets opgetild t.o.v. het podium, zodat de
                                    splitsing op desktop zichtbaar blijft */
  --login-panel-lift: #262319;   /* de actieve pil in de segmentschakelaar */
  --login-track:      #17150F;   /* de goot waar die pil in ligt */
  --login-input-bg:   #14120E;   /* het veld ligt VERDIEPT in het paneel */
  --login-border:     #35332F;   /* haarlijnen en scheidingen -- decoratief */
  /* De rand van een BEDIENBAAR ding is iets anders dan een scheidingslijn.
     WCAG 1.4.11 vraagt 3:1 voor de omtrek die een invoerveld herkenbaar maakt,
     en --login-border haalt op dit paneel 1,36:1 -- op een verdiept veld dat
     zelf maar 1,09:1 van het paneel verschilt, is het veld dan niet te vinden.

     Deze rand grenst aan VIER vlakken, en dat is de reden dat hij lichter is
     dan hij op het oog hoeft te zijn: buiten aan het paneel (#1E1B16) of de
     goot (#17150F), binnen aan de veldvulling (#14120E) of -- bij de
     Google-knop en de actieve pil -- aan de opgetilde tint (#262319). Die
     laatste is de strengste, want hij ligt het dichtst bij de rand zelf.
     Gemeten: 3,32 / 3,04 / 3,54 / 3,62. De eerste kandidaat (#6B6862) haalde
     3,09 op het paneel maar 2,83 op de opgetilde tint, en dat is precies de
     rand die je het vaakst ziet. */
  --login-field-line: #706D66;
  --login-text:       #F9F9F9;   /* 16,30:1 op het paneel */
  --login-muted:      #B5B5B5;   /*  8,37:1 */
  --login-placeholder:#9A9489;   /*  6,21:1 op het verdiepte veld */
  /* Zand ALS TEKST op dit paneel. Precies de regel uit CLAUDE.md: --accent-c
     is de vulling, --accent-ink diezelfde kleur als tekst. Nu het paneel
     donker is, is dat gewoon --accent-ink van het donkere thema: 13,60:1.
     Hier stond #8A6D2E -- de diepe tint die nodig was op wit, en die op donker
     juist 2,4:1 zou halen. Eén token verkeerd meeverhuizen en de merkkleur op
     het eerste scherm is onleesbaar. */
  --login-accent-ink: #F0E4C8;
  position: fixed;
  inset: 0;
  display: flex;
  z-index: 1000;
  padding: 0;
  /* Stond op --bg en volgde daarmee het thema, terwijl beide panelen erop dat
     juist NIET doen. Zolang de twee panelen samen 100% vulden zag je dat niet;
     het kwam pas tevoorschijn als er ergens een kier viel -- en dan een lichte
     strook op een verder donker scherm. Nu hetzelfde podium als de merkkant. */
  background: var(--login-stage);
}

#login-page::before { display: none; }
#login-page::after  { display: none; }

/* ── Zolang Clerk laadt ─────────────────────────────────────────────────────
   Ons eigen formulier staat er wel in de HTML (het is het vangnet), maar het
   wordt niet getoond zolang we nog verwachten dat Clerk het overneemt. Anders
   ziet een bezoeker twee inlogschermen na elkaar.

   De titel en de ondertitel gaan mee: Clerks kaart heeft zijn eigen kop, en
   twee koppen die ongeveer hetzelfde zeggen op één paneel is dezelfde fout in
   het klein. De schakelaar Inloggen/Account aanmaken blijft WEL staan -- die
   is van ons, hij werkt met Clerk, en hij is het enige wat een nieuwe bezoeker
   meteen vertelt dat hij hier ook een account kan maken. */
#login-page.clerk-wacht #login-form-wrap { display: none; }
/* De kop en de ondertitel blijven nu WEL staan terwijl Clerk onderweg is.

   Ze gingen mee omdat Clerks kaart een eigen kop had die ongeveer hetzelfde
   zei. Die kop is er niet meer (zie #clerk-signin .cl-header verderop), dus de
   reden is weg -- en er is een reden bij gekomen om ze te laten staan: dit is
   het enige stuk tekst dat er meteen kan zijn. Zonder deze twee regels staat
   het paneel leeg te wachten op een script van een andere host, en dat is
   precies de traagheid die je op dit scherm voelt. */

#clerk-skelet {
  min-height: 320px;
  padding: 8px 0 0;
}
.skelet-regel, .skelet-veld, .skelet-knop {
  background: var(--login-input-bg);
  border-radius: 8px;
}
.skelet-regel { height: 14px; margin-bottom: 10px; }
.skelet-titel  { width: 58%; height: 22px; margin-bottom: 12px; }
.skelet-sub    { width: 78%; margin-bottom: 26px; }
.skelet-veld {
  height: 44px;
  margin-bottom: 16px;
  border: 1px solid var(--login-border);
}
.skelet-knop {
  height: 44px;
  margin-top: 8px;
  background: var(--login-border);
}
/* Een rustige puls, geen glinsterband die over het scherm schuift: dit staat er
   idealiter een halve seconde, en dan hoort het niet de aandacht te trekken. */
@keyframes skelet-puls { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
#clerk-skelet > * { animation: skelet-puls 1.4s ease-in-out infinite; }
#clerk-skelet > *:nth-child(2) { animation-delay: .1s; }
#clerk-skelet > *:nth-child(3) { animation-delay: .2s; }
#clerk-skelet > *:nth-child(4) { animation-delay: .3s; }
#clerk-skelet > *:nth-child(5) { animation-delay: .4s; }
@media (prefers-reduced-motion: reduce) {
  #clerk-skelet > * { animation: none; }
}

/* De regel onder de inlogknop: wachtwoord vergeten en registreren. Kleuren
   uit tokens -- hier stond #6b7280 hardgecodeerd, wat in het lichte thema
   toevallig klopte en verder nergens op sloeg. */
/* ── De segmentschakelaar inloggen / registreren ──────────────────────────
   Twee gelijkwaardige knoppen in één spoor. De actieve krijgt de opgetilde
   tint en de lichtlip; de andere blijft leesbaar maar rustig -- geen grijs
   dat je moet zoeken. Gemeten op het donkere paneel: --login-muted (#B5B5B5)
   op de goot (#17150F) haalt 8,90:1, en de actieve tekst (#F9F9F9) 14,92:1
   op de pil. (Hier stond de meting van het oude witte paneel: #6B6558 op
   #F1EFE9. Allebei die kleuren staan er niet meer.)

   Waarom een spoor en geen twee losse knoppen: zo is te zien dat het één
   keuze is met twee standen, en niet twee dingen die je allebei kunt doen. */
.login-modus {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 3px;
  margin: var(--sp-5) 0 var(--sp-5);
  /* Stond hardgecodeerd op #F1EFE9. Dat is precies het soort waarde dat een
     themawissel overleeft zonder mee te gaan: het paneel werd donker en deze
     goot bleef een lichte balk midden op het scherm. Nu een token. */
  background: var(--login-track);
  border: 1px solid var(--login-field-line);
  border-radius: var(--r-md);
}
.login-modus-knop {
  appearance: none;
  border: 0;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.1px;
  color: var(--login-muted);
  padding: 9px 10px;
  border-radius: calc(var(--r-md) - 4px);
  cursor: pointer;
  transition: background .16s ease, color .16s ease, box-shadow .16s ease;
}
.login-modus-knop:hover { color: var(--login-text); }
.login-modus-knop.actief {
  /* De pil moet OPTILLEN uit de goot. Op --login-panel deed hij dat toen het
     paneel wit was en de goot beige; op een donker paneel zou hij dezelfde
     kleur krijgen als het vlak eromheen en was er geen pil meer te zien --
     de schakelaar zou zijn toestand kwijt zijn. Vandaar een eigen tint. */
  background: var(--login-panel-lift);
  color: var(--login-text);
  /* De schaduw was zwart-op-wit gedacht. Op donker doet zwart niets; een
     lichtlip bovenlangs is wat daar hoogte geeft. */
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.35);
}
.login-modus-knop:focus-visible {
  outline: 2px solid var(--login-accent-ink);
  outline-offset: 1px;
}

/* ── Wat je krijgt, voordat je je e-mailadres achterlaat ─────────────────── */
.login-trust {
  display: flex; flex-wrap: wrap; justify-content: center;
  /* Krap genoeg om op één regel te passen in het paneel van 380px. Brak hij af,
     dan stond "Maandelijks opzegbaar" als losse regel eronder en las het als
     een voetnoot in plaats van als een van de drie. */
  gap: var(--sp-1) var(--sp-3);
  list-style: none; margin: var(--sp-4) 0 0; padding: 0;
  font-size: 12px; color: var(--login-muted);
}
.login-trust li { display: flex; align-items: center; gap: 5px; white-space: nowrap; }
/* Het vinkje is decoratief; de tekst ernaast zegt het al. Vandaar een vorm en
   geen letter, en geen aria-label -- een schermlezer die "vinkje vinkje
   vinkje" voorleest helpt niemand. */
.login-trust li::before {
  content: '';
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--login-accent-ink);
  flex-shrink: 0;
}

.login-links {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin-top: 14px; flex-wrap: wrap;
}
/* 24 hoog, want dit is een losstaande knop onder het inlogformulier en geen
   link midden in een zin -- WCAG 2.5.8 zondert alleen dat tweede uit. Gemeten
   was hij 141x16. tests/raakdoelen.test.js legt die afweging uit voor de drie
   soorten die hetzelfde hadden op "Je assistent". */
.login-link {
  font-size: 13px; color: var(--login-muted); text-decoration: none;
  background: none; border: none; padding: 0; cursor: pointer;
  font-family: inherit;
  min-height: 24px; display: inline-flex; align-items: center;
}
.login-link:hover { color: var(--login-text); text-decoration: underline; }
/* Stond op --login-border: 1,32:1 op wit, dus in de praktijk onzichtbaar.
   Een scheidingsteken dat je niet ziet scheidt niets -- dan kun je hem net zo
   goed weglaten. Nu op de gedempte tekstkleur (5,79:1). */
.login-link-sep { color: var(--login-muted); font-size: 12px; }

/* De themaknop stond hier ooit rechtsboven op het merkpaneel. Hij is weg op
   verzoek: op het inlogscherm valt er niets te wisselen dat de bezoeker helpt
   -- beide panelen zijn donker in beide thema's. Een knop die het scherm waar
   hij op staat niet verandert is een knop die alleen maar vragen oproept. In
   de app zelf blijft #btn-theme staan; die schakelt wel iets. */

/* Full-screen two-panel split. No card, no border-radius */
.login-split {
  display: flex;
  width: 100%;
  height: 100vh;
  border-radius: 0;
  box-shadow: none;
  max-width: none;
}

/* ── LEFT: form panel (42%) ── */
.login-form-side {
  flex: 0 0 42%;
  background: var(--login-panel);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 72px;
  position: relative;
  overflow-y: auto;
}

/* Subtle vertical line separator */
.login-form-side::after {
  content: '';
  position: absolute;
  right: 0;
  top: 10%;
  bottom: 10%;
  width: 1px;
  background: linear-gradient(180deg, transparent, var(--login-border) 30%, var(--login-border) 70%, transparent);
}

/* Form content constrained for readability */
.login-form-inner {
  width: 100%;
  max-width: 380px;
}

/* Logo linksboven op het formulierpaneel.

   Dit blok heeft drie oplossingen gehad voor één probleem -- goud op wit -- en
   ze zijn alle drie weg omdat het paneel niet meer wit is:
     1. het logo kaal op wit (2,87:1, een lichte vlek);
     2. een donkere plaat eronder (contrast opgelost, maar een zwarte doos op
        een licht paneel, vlak boven Clerks eigen kaart);
     3. een inkt-variant van het logo zelf (leesbaar, maar een ander merkteken
        op de plek waar iemand Helvaro voor het eerst ziet).

   Nu staat het echte gouden bestand er kaal op, precies zoals in de zijbalk.
   Eén merkteken, één bestand, geen plaat. */
.login-logo-top {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 0;
  margin-bottom: 44px;
  padding: 0;
  background: none;
  /* Met terugvalwaarde: de schaal-tokens komen uit de Faro-CSS verderop in
     ditzelfde style-blok, en dat blok is leeg als Faro uitstaat. Zonder
     terugval krijgt het plaatje dan scherpe hoeken.
     En nee, de naam van die variabele staat hier bewust niet voluit: een
     dollarteken met accolades in dit bestand is geen tekst maar een
     invulling, en die propte hier de complete tokens-CSS midden in deze
     regel. Precies de val uit CLAUDE.md, en hij is hier echt dichtgeklapt. */
  border-radius: var(--r-lg, 18px);

  /* ── Geen plaat meer ──────────────────────────────────────────────────
     Hier stond een donker vlak onder het logo, en daarvoor een inkt-variant van
     het logo zelf. Allebei waren ze hetzelfde probleem in twee vermommingen:
     het gouden merkteken kan niet op wit. Nagemeten zijn de lichtste lijnen
     #F2CF7F -- 1,50:1 op wit, en de allerlichtste pixel 1,06:1, dus letterlijk
     wit op wit.

     Het paneel is nu donker (zie de tokens bij #login-page), dus het probleem
     bestaat niet meer: op #1E1B16 haalt datzelfde #F2CF7F 11,45:1.

     Dat is de reden om de plaat weg te halen en niet alleen bij te kleuren. Een
     donkere plaat op een donker paneel is een rechthoek die niets scheidt --
     dan zie je een doos om het logo waar geen doos hoort. Het logo staat er nu
     gewoon, zoals in de zijbalk. */
}

.login-logo-top img {
  height: 52px;
  width: auto;
  object-fit: contain;
  display: block;
}

.login-logo-top .brand-name { display: none; }

.login-welcome {
  font-size: 34px;
  /* Zette Inter hier hard, dus de kop-regel bovenaan kwam er niet doorheen en
     juist het eerste dat een klant ziet stond niet in de huisstijlletter. */
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--login-text);
  margin-bottom: 8px;
  line-height: 1.15;
}

.login-subtitle {
  color: var(--login-muted);
  font-size: 15px;
  margin-bottom: 40px;
  line-height: 1.5;
}

.login-divider { display: none; }
.login-logo { display: none; }
.login-title { display: none; }
.login-icon { display: none; }

/* ── RIGHT: brand panel (58%). Calm dark surface, sand accents only ── */
.login-brand-side {
  /* Alles binnen dit paneel rekent voortaan met de DONKERE waarden, ongeacht
     het thema van de pagina.

     Waarom hier en niet per regel: de kaarten, de chatballonnen, de scorebalken
     en de agendategels binnenin gebruiken samen een stuk of tien tokens
     (--text-muted, --border, --card, ...). Zet je het paneel donker vast en
     laat je die tokens meebewegen, dan krijg je in het lichte thema donkere
     tekst op een donker vlak -- onleesbaar, en op precies de plek die een
     nieuwe klant als eerste ziet. Eén blok dat de tokens vastzet, is
     controleerbaar; tien losse uitzonderingen zijn dat niet, en er komt altijd
     een elfde element bij dat vergeten wordt.

     De waarden hieronder zijn letterlijk die uit het donkere thema. */
  --bg:            #14120E;
  --bg-alt:        #0F0D09;
  /* Zelfde verlopen als in :root -- zie de uitleg daar. */
  --card-flat:     #25231F;
  --card:          linear-gradient(180deg, #2A2824 0%, #25231F 55%, #22201C 100%);
  --card-elevated: linear-gradient(180deg, #32302C 0%, #2C2A26 55%, #282623 100%);
  /* De rand stond op #262626 terwijl de kaart op #232323 staat: drie punten
     ertussen, en dan IS er geen rand. Een kaart zonder rand leunt volledig op
     zijn schaduw, en op bijna-zwart doet een schaduw bijna niets -- vandaar
     dat alles vlak aanvoelde. Nu is het verschil zichtbaar zonder dat er een
     lijn OM de kaart komt: het leest als een vouw, niet als een omtrek.
     --divider blijft de zachtste, want een scheiding BINNEN een kaart hoort
     minder te doen dan de kaartrand zelf.
     Staat twee keer, en dat hoort: het tweede blok zet de donkere tokens vast
     voor een paneel dat altijd donker is. Uit elkaar laten lopen is precies
     hoe zoiets stilletjes scheef gaat. */
  --border-c:      #35332F;
  --border-strong: #474540;
  --divider:       #2C2A26;
  --hover-c:       #1E1C18;
  --text-c:        #F9F9F9;
  --text-muted-c:  #B5B5B5;
  --accent-ink:    #F0E4C8;
  --on-accent:     #121212;
  --text:           var(--text-c);
  --text-primary:   var(--text-c);
  --text-secondary: var(--text-muted-c);
  --text-muted:     var(--text-muted-c);
  --border:         var(--border-c);
  --border-bright:  var(--border-strong);
  --surface:        var(--card);

  flex: 1;
  background: var(--login-stage);
  color: var(--login-stage-ink);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 72px;
  position: relative;
  overflow: hidden;
  gap: 0;
}

/* Fine, neutral dot grid. No colour wash */
.login-brand-side::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle, rgba(249,249,249,0.06) 1px, transparent 1px);
  background-size: 32px 32px;
}

/* One restrained sand bloom. Not an "AI glow" — a single, quiet highlight */
.login-brand-side::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 55% 40% at 70% 10%, rgba(232,215,177,0.07) 0%, transparent 60%);
  pointer-events: none;
}

/* Large floating mock card */
.brand-card-mock {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 440px;
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  padding: 32px;
  box-shadow: none;
}

.brand-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 28px;
}

.brand-card-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border);
}

.brand-card-dot:first-child  { background: var(--accent); }
.brand-card-dot:nth-child(2) { background: var(--text-disabled); }

.brand-card-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

/* Stat row */
.brand-stats {
  display: flex;
  gap: 14px;
  margin-bottom: 28px;
}

.brand-stat {
  flex: 1;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 16px 12px;
  text-align: center;
  transition: border-color 0.3s;
}

.brand-stat-num {
  font-variant-numeric: tabular-nums;
  font-size: 26px;
  font-weight: 800;
  color: var(--accent-ink);
  line-height: 1;
  margin-bottom: 4px;
}

.brand-stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
}

/* Bar chart */
.brand-bars {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  height: 72px;
}

.brand-bar {
  flex: 1;
  border-radius: 6px 6px 0 0;
  background: var(--border);
  transition: background 0.3s;
}

.brand-bar.active {
  background: var(--accent);
}

.brand-bar:nth-child(2) { background: var(--divider); }
.brand-bar:nth-child(6) { background: var(--accent-hover); }
.brand-bar:nth-child(8) { background: var(--divider); }

/* Brand tagline */
.brand-tagline {
  position: relative;
  z-index: 1;
  text-align: center;
  padding: 0 20px;
}

.brand-tagline h2 {
  font-size: 24px;
  font-weight: 800;
  color: var(--text);
  margin-bottom: 10px;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.3px;
}

.brand-tagline p {
  font-size: 15px;
  color: var(--text-muted);
  line-height: 1.6;
}

/* ── Slides wrapper ── */
/* ── Het WhatsApp-mockje op het inlogscherm ─────────────────────────────────
   Stond hier eerst een staafgrafiek met 24 / 68% / 12. Die cijfers waren
   verzonnen, ongelabeld, en vertelden een makelaar niet wat dit product doet.
   Een gesprek wel: dit IS het product, en het tijdstip (21:47) draagt het
   argument dat geen enkele tagline zo goed kan maken. */
.login-what {
  margin: 18px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--login-muted, #5B6779);
  max-width: 42ch;
}

.brand-chat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px 2px;
}
.brand-chat-msg {
  max-width: 84%;
  padding: 9px 12px;
  border-radius: 14px;
  font-size: 12px;
  line-height: 1.45;
  position: relative;
}
.brand-chat-msg span { display: block; }
.brand-chat-msg em {
  display: block;
  margin-top: 3px;
  font-style: normal;
  font-size: 10px;
  letter-spacing: 0.02em;
  opacity: 0.55;
}
.brand-chat-msg.in {
  align-self: flex-start;
  background: rgba(255,255,255,0.07);
  color: #EDEDED;
  border-bottom-left-radius: 5px;
}
.brand-chat-msg.out {
  align-self: flex-end;
  background: rgba(var(--accent-rgb), 0.16);
  border: 1px solid rgba(var(--accent-rgb), 0.24);
  color: #F2E9D5;
  border-bottom-right-radius: 5px;
}
.brand-chat-msg.out em { text-align: right; }

.brand-slides-wrap {
  position: relative;
  z-index: 1;
  width: 100%;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.brand-slide {
  position: absolute;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 0.55s cubic-bezier(0.4,0,0.2,1), transform 0.55s cubic-bezier(0.4,0,0.2,1);
  pointer-events: none;
}

.brand-slide.active {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
  position: relative;
}

/* ── Score ring (slide 2) ── */
.brand-score-row {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-top: 4px;
}

.brand-score-ring {
  position: relative;
  flex-shrink: 0;
}

.brand-score-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  font-size: 16px;
  font-weight: 800;
  color: var(--text);
}

.brand-score-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brand-score-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.brand-score-item span {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
}

.brand-score-bar-wrap {
  height: 5px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.brand-score-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 4px;
}

/* ── Agenda (slide 3) ── */
.brand-agenda {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 4px;
}

.brand-agenda-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px 14px;
}

.brand-agenda-time {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-ink);
  min-width: 38px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.brand-agenda-content { flex: 1; }

.brand-agenda-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.brand-agenda-tag {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.brand-agenda-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.brand-agenda-dot.hot  { background: var(--error); }
.brand-agenda-dot.warm { background: var(--warning); }

/* ── Pagination dots ── */
.brand-dots {
  display: flex;
  /* 2 en niet 6: de knop is 4px breder geworden (zie .brand-dot), dus dit
     houdt de hart-op-hart-afstand op dezelfde 26px. */
  gap: 2px;
  justify-content: center;
  align-items: center;
  /* De knoppen zijn nu 24px hoog in plaats van 4; de marge compenseert dat,
     zodat de rij optisch op dezelfde plek blijft staan. */
  margin-top: 10px;
  position: relative;
  z-index: 1;
}

/* Het streepje is 4px hoog, en dat is als aanraakdoel te klein (de richtlijn
   is 24x24). Het streepje zelf laten we met rust -- het hoort een streepje te
   zijn -- maar de KNOP eromheen krijgt hoogte via padding, en het streepje
   wordt getekend met een achtergrond die alleen het midden vult. Zo verandert
   er niets aan wat je ziet en alles aan wat je kunt raken. */
/* De hoogte was hierboven al naar 24 gebracht, de BREEDTE bleef op 20 staan --
   gemeten 20x24, dus nog steeds onder de richtlijn. Nu 24 breed, terwijl het
   streepje 20 blijft (zie de achtergrond hieronder).

   De gap gaat van 6 naar 2 zodat de hart-op-hart-afstand 26px blijft, precies
   wat hij was: 20+6 en 24+2 zijn hetzelfde. Wat je ziet verandert dus niet,
   alleen wat je kunt raken. */
.brand-dot {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 2px;
  background: linear-gradient(var(--border), var(--border)) center / 20px 4px no-repeat;
  border: none;
  cursor: pointer;
  transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
}
button.brand-dot { border: none; padding: 0; }

.brand-dot.active {
  background: linear-gradient(var(--accent), var(--accent)) center / 36px 4px no-repeat;
  width: 36px;
}

/* Login footer */
.login-footer {
  margin-top: auto;
  padding-top: 24px;
  color: var(--text-muted);
  font-size: 12px;
  letter-spacing: 0.3px;
}

.login-footer span {
  color: var(--login-accent-ink);
  font-weight: 600;
}

/* Taalkiezer op het inlogscherm.

   Waarom hij hier moet staan en niet alleen in Instellingen: de schermtaal
   volgde tot nu toe de browser, en veranderen kon je hem pas NA het inloggen.
   Een Vlaamse makelaar met een Engelse Chrome kreeg dus een Engels inlogscherm
   zonder uitweg -- precies op het moment dat hij nog moet beslissen of hij dit
   product vertrouwt.

   Bewust klein en grijs: dit is een ontsnappingsluik, geen keuze die we willen
   opdringen. Wie de goede taal al ziet, hoort hem nauwelijks te merken. */
.login-lang {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.login-lang select {
  appearance: none;
  -webkit-appearance: none;
  /* Een keuzelijst is bedienbaar, dus de rand die hem herkenbaar maakt valt
     onder WCAG 1.4.11 -- vandaar --login-field-line en niet de haarlijn. */
  border: 1px solid var(--login-field-line, rgba(255,255,255,0.22));
  border-radius: 8px;
  background: transparent;
  /* Stond op --text-muted: dat is het token van de APP, dat met het thema
     meebeweegt, op een paneel dat dat juist niet doet. In het lichte thema
     werd deze tekst daarmee donkergrijs op een donker paneel. */
  color: var(--login-muted);
  /* Het uitklaplijstje zelf tekent de browser; zonder dit doet hij dat licht,
     en dan klapt er een wit menu uit een donkere knop. */
  color-scheme: dark;
  font: inherit;
  font-size: 12px;
  padding: 5px 26px 5px 9px;
  cursor: pointer;
  /* Het pijltje als achtergrond, want appearance:none haalt het weg. */
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
}

.login-lang select:hover { color: var(--login-accent-ink); }

/* Op een touchscreen is 26px hoog te klein om betrouwbaar te raken. Op muis en
   toetsenbord blijft hij klein: daar is precisie geen probleem, en groter zou
   hem meer aandacht geven dan hij verdient. */
@media (hover: none) and (pointer: coarse) {
  .login-lang select {
    min-height: 44px;
    padding-top: 10px;
    padding-bottom: 10px;
  }
  /* Zie de opmerking bij .row-action-btn: op een aanraakscherm hoort een
     bedienbaar element minstens 44x44 te zijn. De ICOON blijft even groot;
     alleen het raakvlak groeit, dus de rij ziet er niet anders uit. */
  .row-action-btn { width: 44px; height: 44px; }
  /* Een sluitknop die op de KLEINSTE schermen krimpt is precies verkeerd om.
     Stond op 28px onder 480px; nu blijft hij minstens even groot als de rest. */
  .panel-close { width: 44px; height: 44px; }
  .btn-icon { min-height: 44px; }
}

/* Zichtbare focusring: dit is een van de weinige bedienbare dingen op het
   scherm buiten de inlogkaart, dus wie met het toetsenbord werkt moet hem
   kunnen vinden. */
.login-lang select:focus-visible {
  outline: 2px solid var(--login-accent-ink);
  outline-offset: 2px;
}

/* Responsive: stack on mobile */
@media (max-width: 860px) {
  .login-split { flex-direction: column; height: auto; }
  /* De regel flex:none liet het paneel precies zo hoog worden als zijn inhoud. Het
     merkpaneel eronder staat op display:none, dus onder de laatste voetnoot
     bleef de rest van het scherm over als een kale band in de kleur van
     #login-page -- gemeten 227px zwart onder de footer op een venster van
     1139px. Geen scheiding, geen inhoud, alleen een gat.
     min-height in plaats van height: bij weinig ruimte moet het paneel nog
     steeds mogen groeien en scrollen. */
  .login-form-side { flex: 1 0 auto; min-height: 100%; padding: 36px 24px 48px; align-items: center; }
  .login-form-inner { max-width: 420px; }

  /* Het merkpaneel gaat weg op smal, in plaats van onder het formulier te
     stapelen. Gestapeld kwam het namelijk ONDER de footer terecht -- eerst
     "(c) 2026 Helvaro", daarna nog anderhalf scherm marketing. De pagina werd
     ruim 2.000px hoog op een telefoon van 844.
     Wie op zijn telefoon naar het inlogscherm gaat, wil inloggen; de belofte
     staat al in de regel onder het formulier. */
  .login-brand-side { display: none; }

  /* Het logo was hier even groot als op desktop en duwde het formulier tot
     bijna een derde van het scherm naar beneden. */
  .login-logo-top { margin-bottom: 24px; align-self: center; }
  .login-logo-top img { max-width: 150px; }
}

/* Hier stonden twee light-overschrijvingen voor het inlogscherm. Ze deden al
   niets -- .login-form-side kreeg background: var(--login-panel), wat het
   buiten de media-query ook al had -- en nu het paneel in beide thema's donker
   is, zouden ze alleen maar suggereren dat er nog een lichte variant bestaat.

   Het inlogscherm volgt het thema met opzet niet, om dezelfde reden als het
   merkpaneel ernaast: dit is een podium, geen oppervlak van de app. Er is op
   dit scherm ook geen gebruiker om een voorkeur van te kennen -- initTheme
   heeft nog niets ingelogd om op af te gaan, en elke nieuwe bezoeker krijgt
   toch dark. Eén ondergrond, één logo, geen tweede palet om bij te houden.

   #login-page houdt dus ook in het lichte thema zijn eigen achtergrond. */

/* Hier stonden drie overschrijvingen die het merkpaneel in het lichte thema
   licht maakten -- de chatballonnen kregen donkere tekst, het puntenraster werd
   donker. Dat was een correcte oplossing voor het verkeerde probleem: het
   paneel hoorde helemaal niet licht te worden. Nu het op --login-stage staat en
   in beide thema's donker blijft, zouden deze regels de demo juist ONleesbaar
   maken: donkere tekst op een donker paneel. Ze zijn daarom weg in plaats van
   aangepast. */

.form-group {
  margin-bottom: 18px;
}

.form-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--login-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 15px 18px;
  background: var(--login-input-bg);
  border: 1.5px solid var(--login-field-line);
  border-radius: 12px;
  color: var(--login-text);
  font-size: 15px;
  font-family: 'Inter', sans-serif;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  min-height: 52px;
  touch-action: manipulation;
}

.form-input:hover {
  border-color: var(--accent-hover);
  background: #fff;
}

.form-input:focus {
  border-color: var(--accent);
  background: #fff;
  box-shadow: 0 0 0 4px rgba(232,215,177,0.25);
}

.form-input:focus-visible {
  outline: none;
}

.form-input::placeholder { color: var(--login-placeholder); }

/* Error state for inputs */
.form-input.error {
  border-color: var(--error);
  background: rgba(220,38,38,0.03);
}
.form-input.error:focus {
  box-shadow: 0 0 0 4px rgba(220,38,38,0.12);
}

/* Login footer */
.login-footer {
  text-align: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--login-border);
  color: var(--login-muted);
  font-size: 12px;
  letter-spacing: 0.3px;
}

.login-footer span {
  /* Stond op --accent-pressed: zand op wit, 2,14:1. Dit is de regel die won
     van de eerdere hierboven, dus dit was wat je echt zag. */
  color: var(--login-accent-ink);
  font-weight: 600;
}

.btn-login {
  width: 100%;
  padding: 17px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-btn);
  color: var(--on-accent);
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  cursor: pointer;
  margin-top: 16px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  box-shadow: none;
  min-height: 56px;
  touch-action: manipulation;
}

.btn-login::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--accent-hover);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.btn-login::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  background: rgba(18,18,18,0.12);
  border-radius: 50%;
  transform: translate(-50%, -50%);
  transition: width 0.5s ease, height 0.5s ease;
}

.btn-login:hover::before { opacity: 1; }
.btn-login:hover {
  transform: translateY(-1px);
  box-shadow: var(--elev-1);
}
.btn-login:active {
  transform: translateY(0) scale(0.98);
  background: var(--accent-pressed);
  box-shadow: none;
  transition-duration: var(--dur-fast);
}
.btn-login:active::after {
  width: 200px;
  height: 200px;
}
.btn-login:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(232,215,177,0.35);
}
.btn-login span { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; }

/* Loading state for login button */
.btn-login.loading {
  pointer-events: none;
  opacity: 0.85;
}
.btn-login.loading span { opacity: 0; }
.btn-login.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22px;
  height: 22px;
  margin: -11px 0 0 -11px;
  border: 2px solid rgba(18,18,18,0.25);
  border-top-color: var(--on-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.login-error {
  display: none;
  margin-top: 16px;
  padding: 12px 16px;
  /* Het vlak mag iets zwaarder nu het op donker ligt: 6% rood op bijna-zwart
     is geen vlak meer maar ruis. */
  background: rgba(248,113,113,0.10);
  border: 1px solid rgba(248,113,113,0.32);
  border-radius: 10px;
  /* Deze regel heeft twee keer eerder een onleesbare foutmelding opgeleverd,
     allebei op dezelfde manier: de kleur werd gekozen voor het paneel van
     toen, en het paneel veranderde.

     Eerst stond hier var(--error) -- een custom property die in dit bestand
     nergens bestaat. Een var() zonder fallback maakt de hele declaratie
     ongeldig, dus erfde de tekst #F9F9F9 van de ouder: wit op lichtroze.
     Daarna #B42318, correct op het witte paneel (7,6:1) en nu 2,61:1 op
     #1E1B16 -- opnieuw de enige foutmelding die deze gebruiker te zien
     krijgt, opnieuw onleesbaar.

     Nu dezelfde tint als colorDanger in CLERK_APPEARANCE, zodat onze eigen
     foutmelding en die van Clerk niet uit elkaar kunnen lopen: 6,20:1. */
  color: #F87171;
  font-size: 13px;
  font-weight: 500;
  text-align: center;
  animation: shakeError 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

.login-error.visible { display: flex; align-items: center; justify-content: center; gap: 8px; }

/* Clerk renders its own "Don't have an account? Sign up" footer, which is
   still English and navigates away to a Clerk-hosted page. Setting
   appearance.elements.footerAction did not take, so this targets Clerk's own
   stable cl- classes instead of guessing at appearance keys. Our own in-page
   switch sits directly below and does the same job in Dutch. */
#clerk-signin .cl-footerAction,
#clerk-signin .cl-footerAction__signIn,
#clerk-signin .cl-footerAction__signUp { display: none !important; }

/* De "Secured by Clerk"-balk.

   Die stond als grijze strook PAL onder de hoofdknop -- het laatste wat iemand
   leest voor hij besluit een account te maken. Een merk dat niet van jou is,
   op de plek waar het vertrouwen wordt opgebouwd, en met een grijze vulling
   die de knop erboven visueel afsnijdt.

   Weghalen is toegestaan op een betaald Clerk-plan; op het gratis plan hoort
   het te blijven staan. Staat dit er ooit weer, dan is dat de reden -- en dan
   is het weghalen ervan geen ontwerpkeuze meer maar een licentiekwestie.

   Dezelfde aanpak als de footerAction hierboven: Clerks eigen stabiele
   cl-klassen, niet gokken naar appearance-sleutels. */
#clerk-signin .cl-footer,
#clerk-signin .cl-internal-uyu30o,
#clerk-signin [class*="cl-footer"]:not([class*="cl-footerAction"]) { display: none !important; }

/* ═══ Clerk in Helvaro's vormentaal ═══════════════════════════════════════
   Clerk levert het formulier; wij leveren het paneel. Tot nu toe waren dat
   twee ontwerpen boven elkaar: een witte kaart met een eigen rand en schaduw,
   midden op een wit paneel, met systeemletters ertussen. Het las als een
   widget die op de pagina geplakt was.

   Alles hieronder heeft één doel: de KAART laten verdwijnen en het FORMULIER
   laten staan, in de typografie en de kleuren die het paneel al gebruikt.
   Geen enkele regel verzint een kleur -- ze komen uit de --login-* tokens die
   #login-page hierboven al definieert.

   Waarom CSS en niet appearance.elements: dat is hier al eens geprobeerd voor
   footerAction en het nam niet (zie de opmerking hierboven). appearance blijft
   wel in gebruik voor wat het betrouwbaar doet -- kleuren, letter en radius
   als variabelen, zie CLERK_APPEARANCE. */

/* ── De kaart zelf: weg ────────────────────────────────────────────────────
   Let op de eerste selector, want die is niet vanzelfsprekend: Clerk mount NIET
   in #clerk-signin, hij zet zijn cl-rootBox OP dat element. Host en rootBox
   zijn hetzelfde ding, dus '#clerk-signin .cl-rootBox' (met spatie) raakt niets.

   Dat is meer dan een schoonheidsfoutje. Clerk geeft die rootBox een breedte
   die met de inhoud meebeweegt. Zolang zijn kaart een vaste breedte had viel
   dat niet op; haal die weg en zet de kinderen op 100%, dan wijst die 100%
   naar een ouder die zichzelf om de inhoud vouwt -- en klapt het formulier in
   tot de smalste tekst erin. Gemeten: 195 px in een paneel van 380. */
#clerk-signin,
#clerk-signin .cl-cardBox { width: 100%; box-shadow: none; border: none; background: transparent; }
#clerk-signin .cl-card {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  width: 100%;
  gap: 18px;
  /* Clerk zet hier margin: -1px -1px 0. Dat is zijn eigen truc om de kaart
     over de 1px rand van zijn omhulsel heen te trekken -- correct, zolang die
     rand er is. Wij halen hem hierboven weg (border: none), en dan compenseert
     die negatieve marge niets meer: hij verschuift het HELE Clerk-formulier
     1px omhoog en 1px naar links.

     Gemeten: onze segmentschakelaar stond op x=56,5 en elk Clerk-element --
     de Google-knop, het invoerveld, de hoofdknop -- op x=55,5. Eén pixel scheef
     over de volle hoogte van het formulier, met als zichtbaar gevolg dat de
     bovenrand van de Google-knop onder de schakelaar vandaan piepte. Precies
     de vlek die op het inlogscherm te zien was.

     Niet op te lossen met padding, want de verschuiving zit in de marge; en
     niet met top, want het element is niet gepositioneerd. */
  margin: 0;
}

/* Clerks eigen kop weg. Het paneel heeft er al een, in Space Grotesk en in de
   taal van de klant, en zetModus() wisselt hem mee tussen inloggen en
   registreren. Zie ook eigenFormulier(), waar hij niet langer verborgen wordt. */
#clerk-signin .cl-header { display: none; }

/* ── Google-knop: een rustige tweede keuze ───────────────────────────────── */
#clerk-signin .cl-socialButtonsRoot,
#clerk-signin .cl-socialButtons { width: 100%; gap: 10px; }
#clerk-signin .cl-socialButtonsBlockButton {
  width: 100%;
  height: 46px;
  /* Niet --login-panel: dan heeft de knop dezelfde kleur als het paneel eronder
     en leunt hij volledig op zijn rand. Op wit viel dat niet op; op donker is
     een vlak dat NIET optilt geen knop. Zelfde tint als de actieve pil, zodat
     alles wat je kunt indrukken op dit scherm op dezelfde hoogte ligt. */
  background: var(--login-panel-lift);
  border: 1px solid var(--login-field-line);
  border-radius: 10px;
  box-shadow: none;
  transition: border-color .15s ease, background .15s ease;
}
#clerk-signin .cl-socialButtonsBlockButton:hover {
  background: rgba(232, 215, 177, .10);
  border-color: var(--login-accent-ink);
}
#clerk-signin .cl-socialButtonsBlockButtonText {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--login-text);
}

/* ── Het witte blokje op de Google-knop ─────────────────────────────────────
   Clerk zet een badge op de aanmeldmethode die je de VORIGE keer gebruikte
   ("Last used"). Die badge is niet meegestyled toen dit paneel donker werd,
   dus hij bleef wit met donkere tekst -- een fel blokje dat half over de rand
   van de knop hing en er kapot uitzag.

   Niet verbergen maar meekleuren: het is nuttige informatie op een scherm waar
   iemand twijfelt met welk account hij ook alweer binnenkwam. Wel in de
   gedempte tinten van dit paneel, zodat hij vertelt zonder te schreeuwen.

   position:relative op de knop zelf: de badge wordt absoluut geplaatst, en
   zonder een houvast klom hij naar de kaart eromheen -- dat is precies waarom
   hij over de rand viel. */
#clerk-signin .cl-socialButtonsBlockButton { position: relative; }
#clerk-signin .cl-socialButtonsBlockButton .cl-badge,
#clerk-signin .cl-badge {
  background: var(--login-panel-lift);
  border: 1px solid var(--login-field-line);
  color: var(--login-muted);
  font-family: 'Space Grotesk', sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .04em;
  padding: 2px 7px;
  border-radius: 999px;
  /* Binnen de knop houden. De badge stond rechtsboven half buiten de rand;
     deze twee waarden zetten hem netjes in de rechterhelft, verticaal
     gecentreerd, waar hij de tekst niet raakt. */
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  box-shadow: none;
}

/* ── Scheiding ───────────────────────────────────────────────────────────── */
#clerk-signin .cl-dividerRow { gap: 12px; margin: 4px 0; }
#clerk-signin .cl-dividerLine { background: var(--login-border); height: 1px; }
#clerk-signin .cl-dividerText {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--login-placeholder);
}

/* ── Velden ──────────────────────────────────────────────────────────────
   Exact de vorm van .form-label / .form-input hierboven, zodat het vangnet en
   Clerks formulier niet te onderscheiden zijn. Dat is niet alleen netjes: valt
   Clerk uit, dan wisselt de pagina naar het eigen formulier, en die wissel
   hoort niet op te vallen.

   GEEN regel op .cl-required. Die klasse ziet eruit als het sterretje bij een
   verplicht veld, maar Clerk zet hem op het INVOERVELD zelf. Een display:none
   erop laat het e-mailveld verdwijnen terwijl de knop eronder blijft staan --
   een inlogscherm zonder invoerveld, dat er verder normaal uitziet. */
#clerk-signin .cl-formFieldLabelRow { margin-bottom: 7px; }
#clerk-signin .cl-formFieldLabel {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .09em;
  text-transform: uppercase;
  color: var(--login-muted);
}
#clerk-signin .cl-formFieldInput,
#clerk-signin .cl-input {
  /* min-height en flex staan er niet voor de sier. Het veld is een flexitem in
     een rij die zich om de inhoud vouwt; 'height' alleen wordt daar weggedrukt
     en het veld kwam uit op 33,75 px naast een knop van 48. */
  height: 46px;
  min-height: 46px;
  flex: 0 0 auto;
  box-sizing: border-box;
  padding: 0 14px;
  background: var(--login-input-bg);
  border: 1px solid var(--login-field-line);
  border-radius: 10px;
  font-family: 'Inter', sans-serif;
  font-size: 15px;
  color: var(--login-text);
  box-shadow: none;
  transition: border-color .15s ease, box-shadow .15s ease;
}
#clerk-signin .cl-formFieldInput::placeholder { color: var(--login-placeholder); }
#clerk-signin .cl-formFieldInput:focus,
#clerk-signin .cl-input:focus {
  outline: none;
  border-color: var(--login-accent-ink);
  box-shadow: 0 0 0 3px rgba(232, 215, 177, .30);
}
#clerk-signin .cl-formFieldInputGroup { border-radius: 10px; }
#clerk-signin .cl-formFieldInputShowPasswordButton { color: var(--login-muted); }
#clerk-signin .cl-formFieldInputShowPasswordButton:hover { color: var(--login-text); }

/* ── De hoofdknop ────────────────────────────────────────────────────────
   Zand met donkere inkt, precies zoals .btn-login. Clerk zette hier een bijna
   zwarte knop neer: de enige plek op het scherm waar de merkkleur hoort te
   staan, en juist daar stond hij niet. */
#clerk-signin .cl-formButtonPrimary {
  width: 100%;
  height: 48px;
  margin-top: 4px;
  background: var(--accent-c);
  border: none;
  border-radius: 10px;
  box-shadow: none;
  text-shadow: none;
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: .03em;
  text-transform: none;
  color: #121212;
  transition: background .15s ease, transform .12s ease;
}
#clerk-signin .cl-formButtonPrimary:hover { background: var(--accent-hover-c); }
#clerk-signin .cl-formButtonPrimary:active { transform: translateY(1px); }
#clerk-signin .cl-formButtonPrimary:focus-visible {
  outline: 2px solid var(--login-accent-ink);
  outline-offset: 2px;
}
#clerk-signin .cl-buttonArrowIcon { color: #121212; opacity: .75; }

/* ── Foutmeldingen in dezelfde toon als .login-error ─────────────────────── */
#clerk-signin .cl-formFieldErrorText,
#clerk-signin .cl-formFieldWarningText,
#clerk-signin .cl-alertText {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: #B42318;
}

/* Sign-in / sign-up switch under the Clerk component */
#clerk-toggle {
  text-align: center;
  margin-top: 16px;
  font-size: 13px;
  color: var(--text-disabled);
}
.clerk-toggle-link {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: #8A6714;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.clerk-toggle-link:hover { color: #6d520f; }
.clerk-toggle-link:focus-visible { outline: 2px solid #C9A34E; outline-offset: 2px; border-radius: 4px; }

.login-error::before {
  content: '';
  width: 18px;
  height: 18px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DC2626' stroke-width='2'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='8' x2='12' y2='12'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16'/%3E%3C/svg%3E");
  background-size: contain;
  flex-shrink: 0;
}

@keyframes shakeError {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(6px); }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton, .skeleton::after { animation: none; }
  .login-error { animation: none; }
  .btn-login.loading::after { animation: spin 1.5s linear infinite; }
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* ============================================================
   CALENDAR (WEEK VIEW)
   ============================================================ */
.cal-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.cal-today-btn {
  padding: 7px 16px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.2s;
}
.cal-today-btn:hover { border-color: rgba(var(--accent-rgb),0.5); color: var(--accent-ink); }
.cal-nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}
.cal-nav-btn:hover { border-color: rgba(var(--accent-rgb),0.5); color: var(--accent-ink); }
.cal-range-label {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin-left: 4px;
  font-family: 'Inter', sans-serif;
}
.cal-book-btn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 18px;
  background: var(--accent);
  border-radius: 10px;
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.cal-book-btn:hover { transform: translateY(-1px); box-shadow: none; }

/* Day header row */
.cal-day-headers {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--bg-primary);
}
.cal-gutter { width: 54px; flex-shrink: 0; }
.cal-day-cols-header {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}
/* Zeven dagkolommen plus een gutter van 54px legden een bodem van 425px onder
   de week. Op 390px verdween zondag daardoor volledig en werd zaterdag
   doormidden gesneden — zonder scrollbalk, want de pagina verbergt zijn
   overflow. De gutter (de uren-as) is het enige dat hier gemist kan worden. */
@media (max-width: 480px) {
  .cal-gutter { width: 34px; }
  .cal-day-header-cell { padding: 8px 2px; }
}
.cal-day-header-cell {
  padding: 10px 8px;
  text-align: center;
  border-left: 1px solid var(--border);
}
.cal-day-header-cell .cal-day-name {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.cal-day-header-cell .cal-day-num {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin: 0 auto;
}
.cal-day-header-cell.cal-today .cal-day-num {
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: none;
}
.cal-day-header-cell.cal-today .cal-day-name { color: var(--accent-ink); }

/* Scrollable grid */
.cal-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.cal-scroll-area::-webkit-scrollbar { width: 6px; }
.cal-scroll-area::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.3); border-radius: 4px; }
.cal-time-grid {
  display: flex;
  min-height: 880px;
}
.cal-time-labels {
  width: 58px;
  flex-shrink: 0;
  position: relative;
}
.cal-time-label {
  height: 80px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-right: 10px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
  padding-top: 4px;
  box-sizing: border-box;
  position: relative;
}
.cal-time-label-half {
  position: absolute;
  top: 40px;
  right: 10px;
  font-size: 9px;
  color: var(--text-muted);
  opacity: 0.5;
  font-weight: 500;
}
.cal-day-cols {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  position: relative;
}
.cal-day-col {
  border-left: 1px solid var(--border);
  position: relative;
}
.cal-hour-row {
  height: 80px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  box-sizing: border-box;
  position: relative;
}
.cal-hour-row::after {
  content: '';
  position: absolute;
  left: 0; right: 0;
  top: 40px;
  border-bottom: 1px dashed rgba(255,255,255,0.035);
  pointer-events: none;
}
[data-theme="light"] .cal-hour-row::after {
  border-bottom-color: rgba(0,0,0,0.06);
}
.cal-day-col.cal-today-col { background: rgba(var(--accent-rgb),0.03); }

/* Now line */
.cal-now-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--error);
  z-index: 10;
  pointer-events: none;
}
.cal-now-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -4px;
  width: 10px;
  height: 10px;
  background: var(--error);
  border-radius: 50%;
}

/* Event blocks */
.cal-event {
  position: absolute;
  left: 3px;
  right: 3px;
  border-radius: 10px;
  padding: 6px 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--on-accent);
  cursor: pointer;
  overflow: hidden;
  z-index: 5;
  transition: filter 0.15s, transform 0.12s, box-shadow 0.15s;
  min-height: 28px;
  line-height: 1.3;
  box-shadow: 0 2px 10px rgba(0,0,0,0.28);
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-left: 3px solid rgba(255,255,255,0.35);
}
/* Read-only entries mirrored from the client's own Google Calendar. They
   occupy the slot so nothing gets double-booked, but they are deliberately
   quiet and not clickable — Helvaro doesn't own them and can't edit them. */
.cal-event-external {
  background: repeating-linear-gradient(
    135deg,
    var(--bg-card-alt) 0 6px,
    var(--hover-c) 6px 12px
  );
  color: var(--text-muted-c);
  border-left: 3px solid var(--text-disabled);
  box-shadow: none;
  cursor: default;
  font-weight: 500;
  z-index: 4;
}
.cal-event-external:hover {
  filter: none;
  transform: none;
  box-shadow: none;
  z-index: 4;
}

.cal-event:hover {
  filter: brightness(1.1);
  transform: translateX(-1px) scale(1.018);
  box-shadow: 0 6px 20px rgba(0,0,0,0.38);
  z-index: 10;
}
.cal-event .cal-event-time {
  font-size: 10px;
  font-weight: 800;
  opacity: 1;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.cal-event .cal-event-name {
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-event .cal-event-type {
  font-size: 9px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cal-event .cal-event-dur {
  font-size: 9px;
  font-weight: 600;
  opacity: 0.75;
  white-space: nowrap;
  margin-top: auto;
  padding-top: 2px;
}

/* ============================================================
   PROFILE PAGE
   ============================================================ */
.profile-wrap { width: 100%; display: flex; flex-direction: column; gap: 20px; }

.profile-hero {
  display: flex;
  align-items: center;
  gap: 24px;
  background: rgba(var(--accent-rgb),0.07);
  border: 1px solid rgba(var(--accent-rgb),0.25);
  border-radius: 20px;
  padding: 28px 32px;
}
.profile-avatar-lg {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: var(--on-accent);
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  box-shadow: none;
}
.profile-name-lg {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  margin-bottom: 4px;
  font-family: 'Inter', sans-serif;
}
.profile-email-lg { font-size: 14px; color: var(--text-muted); margin-bottom: 10px; }
.profile-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(var(--accent-rgb),0.15);
  border: 1px solid rgba(var(--accent-rgb),0.3);
  color: var(--accent-ink);
}

.profile-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.profile-stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 18px 20px;
  text-align: center;
}
.profile-stat-card .psv {
  font-size: 28px;
  font-weight: 800;
  color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 6px;
}
.profile-stat-card .psl {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.profile-cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.profile-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 22px 24px;
}
.profile-card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-muted);
  padding: 6px 0;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}
.profile-row:last-child { border-bottom: none; }
.profile-row strong { color: var(--text-primary); font-weight: 600; }

    .profile-section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
      margin-top: 4px;
    }
    .profile-recent-leads {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 24px;
    }
    .profile-recent-lead-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 10px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .profile-recent-lead-row:hover { border-color: var(--accent); }
    .profile-recent-lead-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      background: var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: var(--on-accent); flex-shrink: 0;
    }
    .profile-recent-lead-name { font-size: 14px; font-weight: 600; color: var(--text); flex: 1; }
    .profile-recent-lead-meta { font-size: 12px; color: var(--text-muted); }
    .profile-recent-lead-score {
      font-size: 13px; font-weight: 700; color: var(--accent-ink);
      font-variant-numeric: tabular-nums;
    }
    .profile-quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 8px;
    }
    .profile-action-btn {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 18px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      text-align: left;
    }
    .profile-action-btn:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.06); }
    .profile-action-btn svg { color: var(--accent-ink); flex-shrink: 0; }

/* ============================================================
   FOUNDER DASHBOARD. Cofounder-style layout
   ============================================================ */
.fdr-wrap { max-width: 1060px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
.fdr-section-hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.fdr-section-hdr h3 { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--text-secondary); }
.founder-btn-sm { padding: 6px 14px; background: rgba(var(--accent-rgb),.12); border: 1px solid rgba(var(--accent-rgb),.25); border-radius: 8px; color: var(--accent-ink); font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); }
.founder-btn-sm:hover { background: rgba(var(--accent-rgb),.22); }

/* Hero header */
.fdr-hero { background: rgba(var(--accent-rgb),.08); border: 1px solid rgba(var(--accent-rgb),.22); border-radius: 18px; padding: 28px 32px; display: flex; align-items: center; justify-content: space-between; }
.fdr-hero-left {}
.fdr-day { font-size: 28px; font-weight: 800; letter-spacing: -.5px; color: var(--text-primary); line-height: 1; }
.fdr-date { font-size: 14px; color: var(--text-secondary); margin-top: 4px; }
.fdr-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 8px; }
.fdr-hero-right { text-align: right; }
.fdr-deadline-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: var(--text-muted); }
.fdr-deadline-val { font-size: 18px; font-weight: 800; color: var(--text-primary); margin-top: 2px; }
.fdr-deadline-days { font-size: 12px; color: var(--accent-ink); margin-top: 2px; font-weight: 600; }

/* Two-column main grid */
.fdr-main-grid { display: grid; grid-template-columns: 1fr 340px; gap: 18px; align-items: start; }
.fdr-right-col { display: flex; flex-direction: column; gap: 14px; }

/* Generic panel */
.fdr-panel { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
.fdr-panel-hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-panel-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.fdr-task-progress { font-size: 12px; font-weight: 600; color: var(--text-muted); }
.fdr-refresh-btn { background: none; border: none; color: var(--text-muted); font-size: 15px; cursor: pointer; line-height: 1; padding: 2px 4px; border-radius: 4px; }
.fdr-refresh-btn:hover { color: var(--text-primary); }

/* Checklist */
.fdr-checklist { display: flex; flex-direction: column; }
.fdr-task-row { display: flex; align-items: flex-start; gap: 12px; padding: 13px 18px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background .12s; user-select: none; }
.fdr-task-row:last-child { border-bottom: none; }
.fdr-task-row:hover { background: var(--bg-card-hover); }
.fdr-task-row input[type=checkbox] { display: none; }
.fdr-task-check-icon { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-bright); flex-shrink: 0; margin-top: 2px; transition: all .15s; display: flex; align-items: center; justify-content: center; }
.fdr-task-row.fdr-task-done .fdr-task-check-icon { background: var(--accent); border-color: var(--accent); }
.fdr-task-row.fdr-task-done .fdr-task-check-icon::after { content: ''; width: 5px; height: 9px; border: 2px solid var(--on-accent); border-top: none; border-left: none; transform: rotate(45deg) translateY(-1px); display: block; }
.fdr-task-body { flex: 1; min-width: 0; }
.fdr-task-name { font-size: 14px; font-weight: 500; color: var(--text-primary); line-height: 1.3; }
.fdr-task-detail { font-size: 12px; color: var(--text-muted); margin-top: 3px; line-height: 1.4; }
.fdr-task-row.fdr-task-done .fdr-task-name { text-decoration: line-through; color: var(--text-muted); }
.fdr-wie-badge { flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 20px; margin-top: 2px; }
.fdr-badge-frade { background: rgba(var(--accent-rgb),.15); color: var(--accent-ink); border: 1px solid rgba(var(--accent-rgb),.25); }
.fdr-badge-teljo { background: rgba(var(--warning-rgb),.12); color: var(--warning-ink); border: 1px solid rgba(var(--warning-rgb),.2); }
.fdr-badge-beiden { background: rgba(var(--success-rgb),.1); color: var(--success-ink); border: 1px solid rgba(var(--success-rgb),.2); }
.fdr-progress-bar-wrap { height: 3px; background: var(--bg-card-alt); border-radius: 0 0 var(--radius) var(--radius); overflow: hidden; }
.fdr-progress-bar { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-bright)); transition: width .4s ease; border-radius: 999px; }
.fdr-weekend-msg { padding: 32px 18px; text-align: center; }
.fdr-weekend-icon { font-size: 32px; margin-bottom: 10px; }
.fdr-weekend-txt { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.fdr-weekend-sub { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

/* Stats 2x2 grid (right col) */
.fdr-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-stat { background: var(--bg-card); padding: 14px 12px; }
.fdr-stat-val { font-size: 24px; font-weight: 800; line-height: 1; margin-bottom: 3px; }
.fdr-stat-lbl { font-size: 11px; color: var(--text-secondary); }

/* Goal panel */
.fdr-goal-panel { padding: 16px 18px; }
.fdr-goal-hdr { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 12px; }
.fdr-goal-big { display: flex; align-items: baseline; gap: 4px; margin-bottom: 10px; }
.fdr-goal-current { font-size: 40px; font-weight: 900; color: var(--accent-ink); line-height: 1; }
.fdr-goal-sep { font-size: 22px; color: var(--text-muted); }
.fdr-goal-target { font-size: 22px; font-weight: 700; color: var(--text-primary); }
.fdr-goal-unit { font-size: 13px; color: var(--text-secondary); margin-left: 4px; }
.fdr-goal-bar-wrap { height: 6px; background: var(--bg-card-alt); border-radius: 999px; overflow: hidden; margin-bottom: 6px; }
.fdr-goal-bar-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width .6s ease; }
.fdr-goal-pct { font-size: 11px; color: var(--text-muted); }

/* Pipeline mini */
.fdr-pipe-mini { padding: 14px 18px; }
.fdr-pipe-mini-cols { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.fdr-pipe-mini-item { display: flex; align-items: center; gap: 10px; }
.fdr-pipe-mini-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.fdr-pipe-mini-name { flex: 1; font-size: 12px; color: var(--text-secondary); }
.fdr-pipe-mini-count { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.fdr-won-lost-row { display: flex; gap: 8px; }

/* Full-width pipeline kanban */
.founder-pipeline-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.founder-col { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.founder-col-hdr { padding: 10px 14px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
.founder-col-badge { background: var(--bg-card-alt); border-radius: 20px; padding: 2px 8px; font-size: 11px; }
.founder-col-body { padding: 10px; min-height: 80px; display: flex; flex-direction: column; gap: 8px; }
.founder-card { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; cursor: pointer; transition: border-color .15s; }
.founder-card:hover { border-color: rgba(var(--accent-rgb),.4); }
.founder-card-name { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
.founder-card-meta { font-size: 11px; color: var(--text-secondary); }
.founder-col-add { padding: 8px 10px; border-top: 1px solid var(--border); }
.founder-col-add button { width: 100%; padding: 7px; background: none; border: 1px dashed var(--border-bright); border-radius: 6px; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: var(--transition); }
.founder-col-add button:hover { border-color: var(--accent); color: var(--accent-ink); }
.founder-badge-won  { background: rgba(var(--success-rgb),.12); color: var(--success-ink); border: 1px solid rgba(var(--success-rgb),.2); border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }
.founder-badge-lost { background: rgba(var(--error-rgb),.1); color: var(--error-ink); border: 1px solid rgba(var(--error-rgb),.2); border-radius: 20px; padding: 3px 10px; font-size: 11px; font-weight: 700; }

/* Goals */
.founder-goals-list { display: flex; flex-direction: column; gap: 12px; }
.founder-goal { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; }
.founder-goal-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.founder-goal-name { font-size: 14px; font-weight: 600; }
.founder-goal-nums { font-size: 13px; color: var(--text-secondary); }
.founder-goal-bar { height: 6px; background: var(--bg-card-alt); border-radius: 999px; overflow: hidden; }
.founder-goal-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--accent), var(--accent-bright)); transition: width .6s ease; }
.founder-goal-meta { display: flex; justify-content: space-between; margin-top: 8px; font-size: 11px; color: var(--text-muted); }

/* AI Advice */
.founder-ai-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
.founder-ai-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.founder-ai-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.founder-ai-title { font-size: 15px; font-weight: 700; }
.founder-ai-sub { font-size: 12px; color: var(--text-secondary); }
.founder-ai-output { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 13px; line-height: 1.7; color: var(--text-primary); white-space: pre-wrap; min-height: 60px; display: none; margin-bottom: 14px; }
.founder-ai-output.visible { display: block; }
.founder-ai-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--accent); border: none; border-radius: 10px; color: var(--on-accent); font-size: 13px; font-weight: 700; cursor: pointer; transition: var(--transition); }
.founder-ai-btn:hover:not(:disabled) { background: var(--accent); transform: translateY(-1px); }
.founder-ai-btn:disabled { opacity: .5; cursor: not-allowed; }

/* Modal */
.founder-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 900; display: flex; align-items: center; justify-content: center; padding: 20px; display: none; }
.founder-modal-overlay.open { display: flex; }
.founder-modal { background: var(--card-elevated); border: 1px solid var(--border); border-radius: 16px; padding: 24px; width: 100%; max-width: 420px; box-shadow: var(--elev-3); animation: modal-in 0.2s var(--ease-out); }
.founder-modal h3 { font-size: 16px; font-weight: 700; margin-bottom: 16px; }
.founder-modal-field { margin-bottom: 14px; }
.founder-modal-field label { display: block; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; color: var(--text-secondary); margin-bottom: 6px; }
.founder-modal-field input, .founder-modal-field select, .founder-modal-field textarea { width: 100%; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 14px; font-family: inherit; outline: none; transition: border-color .15s; }
.founder-modal-field input:focus, .founder-modal-field select:focus, .founder-modal-field textarea:focus { border-color: var(--accent); }
.founder-modal-field textarea { resize: vertical; min-height: 80px; }
.founder-modal-field select option { background: var(--bg-card); }
.founder-modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
.founder-modal-cancel { padding: 9px 18px; background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary); font-size: 13px; font-weight: 600; cursor: pointer; }
.founder-modal-save { padding: 9px 18px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 13px; font-weight: 700; cursor: pointer; }
.founder-modal-delete { padding: 9px 18px; background: rgba(var(--error-rgb),.12); border: 1px solid rgba(var(--error-rgb),.25); border-radius: 8px; color: var(--error-ink); font-size: 13px; font-weight: 600; cursor: pointer; margin-right: auto; }

@media (max-width: 960px) {
  .fdr-main-grid { grid-template-columns: 1fr; }
  .fdr-right-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .founder-pipeline-cols { grid-template-columns: 1fr; }
}
@media (max-width: 600px) {
  .fdr-hero { flex-direction: column; gap: 16px; }
  .fdr-hero-right { text-align: left; }
  .fdr-right-col { grid-template-columns: 1fr; }
  .fdr-stats-grid { grid-template-columns: 1fr 1fr; }
}

/* Content Hub */
.fdr-hub-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-hub-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-hub-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-hub-title { font-size: 14px; font-weight: 700; }
.fdr-hub-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.fdr-hub-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--bg-card-alt); }
.fdr-platform-tabs { display: flex; gap: 4px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; padding: 3px; }
.fdr-platform-tab { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; border: none; background: none; color: var(--text-secondary); transition: var(--transition); white-space: nowrap; }
.fdr-platform-tab.active { background: var(--bg-card); color: var(--text-primary); box-shadow: 0 1px 4px rgba(0,0,0,.15); }
.fdr-platform-tab.li-active { color: #0077b5; }
.fdr-platform-tab.ig-active { color: #e1306c; }
.fdr-hub-select { padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; cursor: pointer; }
.fdr-hub-select option { background: var(--bg-card); }
.fdr-hub-gen-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; transition: var(--transition); margin-left: auto; white-space: nowrap; }
.fdr-hub-gen-btn:hover:not(:disabled) { opacity: .88; transform: translateY(-1px); }
.fdr-hub-gen-btn:disabled { opacity: .5; cursor: not-allowed; }
.fdr-hub-body { padding: 16px 18px; }
.fdr-hub-output { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 13px; line-height: 1.8; color: var(--text-primary); white-space: pre-wrap; min-height: 80px; display: none; margin-bottom: 12px; max-height: 420px; overflow-y: auto; }
.fdr-hub-output.visible { display: block; }
.fdr-hub-footer { display: flex; align-items: center; gap: 10px; }
.fdr-hub-copy-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(var(--accent-rgb),.1); border: 1px solid rgba(var(--accent-rgb),.25); border-radius: 8px; color: var(--accent-ink); font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); }
.fdr-hub-copy-btn.visible { display: inline-flex; }
.fdr-hub-copy-btn:hover { background: rgba(var(--accent-rgb),.2); }
.fdr-hub-regen-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary); font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); }
.fdr-hub-regen-btn.visible { display: inline-flex; }
.fdr-hub-regen-btn:hover { color: var(--text-primary); border-color: var(--border-bright); }
.fdr-hub-open-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: var(--transition); text-decoration: none; }
.fdr-hub-open-btn.visible { display: inline-flex; }
.fdr-hub-open-btn.li { background: rgba(10,102,194,.12); border: 1px solid rgba(10,102,194,.3); color: #0a66c2; }
.fdr-hub-open-btn.li:hover { background: rgba(10,102,194,.22); }
.fdr-hub-open-btn.ig { background: rgba(225,48,108,.12); border: 1px solid rgba(225,48,108,.3); color: #e1306c; }
.fdr-hub-open-btn.ig:hover { background: rgba(225,48,108,.22); }
.fdr-dm-open-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(10,102,194,.1); border: 1px solid rgba(10,102,194,.25); border-radius: 8px; color: #0a66c2; font-size: 12px; font-weight: 600; cursor: pointer; text-decoration: none; }
.fdr-dm-open-btn.visible { display: inline-flex; }
.fdr-dm-open-btn:hover { background: rgba(10,102,194,.2); }
.fdr-hub-empty { padding: 24px 0; color: var(--text-muted); font-size: 13px; text-align: center; line-height: 1.6; }
.fdr-hub-platform-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
.fdr-hub-platform-badge.li { background: rgba(0,119,181,.12); color: #0077b5; border: 1px solid rgba(0,119,181,.2); }
.fdr-hub-platform-badge.ig { background: rgba(225,48,108,.1); color: #e1306c; border: 1px solid rgba(225,48,108,.2); }

/* Follow-up urgency */
.founder-card-age { display: inline-block; margin-top: 5px; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
.founder-card-age.age-ok       { background: rgba(var(--success-rgb),.1);  color: var(--success-ink); }
.founder-card-age.age-warning  { background: rgba(var(--warning-rgb),.12); color: var(--warning-ink); }
.founder-card-age.age-critical { background: rgba(var(--error-rgb),.12);  color: var(--error-ink); }
.founder-card.has-urgent       { border-color: rgba(var(--error-rgb),.35); }
.fdr-followup-wrap { display: flex; flex-direction: column; gap: 8px; }
.fdr-followup-item { display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: border-color .15s; }
.fdr-followup-item:hover { border-color: rgba(var(--error-rgb),.4); }
.fdr-followup-item.critical { border-left: 3px solid var(--error); }
.fdr-followup-item.warning  { border-left: 3px solid var(--warning); }
.fdr-followup-name { flex: 1; font-size: 13px; font-weight: 600; }
.fdr-followup-fase { font-size: 10px; padding: 2px 7px; border-radius: 20px; font-weight: 700; }
.fdr-followup-fase.f0 { background: rgba(124,147,196,.14);  color: #7C93C4; }
.fdr-followup-fase.f1 { background: rgba(var(--accent-rgb),.16);  color: var(--accent-ink); }
.fdr-followup-fase.f2 { background: rgba(201,154,108,.16);  color: #C99A6C; }
.fdr-followup-days { font-size: 11px; font-weight: 700; color: var(--error-ink); flex-shrink: 0; }
.fdr-followup-empty { padding: 14px 0; color: var(--text-muted); font-size: 13px; }

/* MRR panel */
.fdr-mrr-panel { padding: 14px 18px; }
.fdr-mrr-hdr { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: var(--text-muted); margin-bottom: 8px; }
.fdr-mrr-val { font-size: 34px; font-weight: 900; color: var(--success-ink); line-height: 1; }
.fdr-mrr-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.fdr-mrr-target { font-size: 12px; color: var(--text-secondary); margin-top: 8px; display: flex; align-items: center; gap: 6px; }
.fdr-mrr-arrow { color: var(--text-muted); }
.fdr-profit-divider { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
.fdr-profit-rows { display: flex; flex-direction: column; gap: 5px; }
.fdr-profit-row { display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
.fdr-profit-row .lbl { color: var(--text-muted); }
.fdr-profit-row .val { font-weight: 600; color: var(--text-primary); }
.fdr-profit-row .val.neg { color: var(--red-ink); }
.fdr-profit-row.total { margin-top: 4px; padding-top: 6px; border-top: 1px solid var(--border); }
.fdr-profit-row.total .lbl { font-weight: 700; color: var(--text-primary); font-size: 13px; }
.fdr-profit-row.total .val { font-size: 16px; font-weight: 900; color: var(--success-ink); }
.fdr-profit-marge { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

/* Outreach tracker */
.fdr-outreach-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-outreach-hdr { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-outreach-title { font-size: 14px; font-weight: 700; }
.fdr-outreach-week { font-size: 11px; color: var(--text-muted); }
.fdr-outreach-body { padding: 16px 18px; }
.fdr-outreach-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.fdr-outreach-card { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 14px; display: flex; align-items: center; gap: 10px; }
.fdr-outreach-num { font-size: 26px; font-weight: 900; line-height: 1; min-width: 32px; }
.fdr-outreach-info { flex: 1; }
.fdr-outreach-name { font-size: 12px; font-weight: 600; }
.fdr-outreach-target { font-size: 11px; color: var(--text-muted); }
.fdr-outreach-plus { background: none; border: 1px solid var(--border); border-radius: 6px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; font-weight: 700; color: var(--text-secondary); transition: var(--transition); flex-shrink: 0; }
.fdr-outreach-plus:hover { background: var(--border); color: var(--text-primary); }
.fdr-outreach-bar-wrap { height: 6px; background: var(--border); border-radius: 999px; overflow: hidden; margin-top: 8px; }
.fdr-outreach-bar-fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width .4s; }
.fdr-outreach-footer { display: flex; justify-content: space-between; align-items: center; }
.fdr-outreach-pct { font-size: 12px; color: var(--text-muted); }
.fdr-outreach-reset { background: none; border: none; font-size: 11px; color: var(--text-muted); cursor: pointer; text-decoration: underline; }
.fdr-outreach-reset:hover { color: var(--red-ink); }

/* Bouw tracker */
.fdr-bouw-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-bouw-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-bouw-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-bouw-title { font-size: 14px; font-weight: 700; }
.fdr-bouw-sub { font-size: 11px; color: var(--text-muted); }
.fdr-bouw-body { padding: 12px 18px; }
.fdr-bouw-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.fdr-bouw-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; transition: var(--transition); }
.fdr-bouw-item:hover { border-color: rgba(var(--accent-rgb),0.27); }
.fdr-bouw-item.done { opacity: .5; }
.fdr-bouw-item.done .fdr-bouw-item-text { text-decoration: line-through; }
.fdr-bouw-cb { width: 16px; height: 16px; border-radius: 4px; border: 1.5px solid var(--border-bright); display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: var(--transition); }
.fdr-bouw-item.done .fdr-bouw-cb { background: var(--accent); border-color: var(--accent); }
.fdr-bouw-item-text { font-size: 13px; flex: 1; }
.fdr-bouw-tag { font-size: 10px; padding: 2px 7px; border-radius: 999px; font-weight: 600; flex-shrink: 0; }
.fdr-bouw-tag.fix { background: rgba(239,68,68,.12); color: var(--red-ink); }
.fdr-bouw-tag.feat { background: rgba(var(--accent-rgb),.12); color: var(--accent-ink); }
.fdr-bouw-tag.test { background: rgba(var(--warning-rgb),.12); color: var(--orange-ink); }
.fdr-bouw-add-row { display: flex; gap: 8px; }
.fdr-bouw-add-input { flex: 1; padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; }
.fdr-bouw-add-btn { padding: 7px 14px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; transition: var(--transition); }
.fdr-bouw-add-btn:hover { opacity: .88; }
.fdr-bouw-progress { font-size: 11px; color: var(--text-muted); margin-bottom: 10px; }

/* Personalized DM generator */
.fdr-dm-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-dm-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-dm-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-dm-title { font-size: 14px; font-weight: 700; }
.fdr-dm-sub { font-size: 11px; color: var(--text-muted); }
.fdr-dm-controls { display: flex; flex-wrap: wrap; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--border); background: var(--bg-card-alt); align-items: center; }
.fdr-dm-select { padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; flex: 1; min-width: 140px; }
.fdr-dm-gen-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 16px; background: var(--accent); border: none; border-radius: 8px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; transition: var(--transition); white-space: nowrap; flex-shrink: 0; }
.fdr-dm-gen-btn:hover:not(:disabled) { opacity: .88; }
.fdr-dm-gen-btn:disabled { opacity: .5; cursor: not-allowed; }
.fdr-dm-body { padding: 16px 18px; }
.fdr-dm-output { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 13px; line-height: 1.75; color: var(--text-primary); white-space: pre-wrap; min-height: 60px; display: none; margin-bottom: 12px; }
.fdr-dm-output.visible { display: block; }
.fdr-dm-copy-btn { display: none; align-items: center; gap: 6px; padding: 7px 14px; background: rgba(var(--accent-rgb),.1); border: 1px solid rgba(var(--accent-rgb),.25); border-radius: 8px; color: var(--accent-ink); font-size: 12px; font-weight: 600; cursor: pointer; }
.fdr-dm-copy-btn.visible { display: inline-flex; }
.fdr-dm-copy-btn:hover { background: rgba(var(--accent-rgb),.2); }
.fdr-dm-empty { padding: 20px 0; color: var(--text-muted); font-size: 13px; text-align: center; }

/* Documenten Hub */
.fdr-docs-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-docs-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); justify-content: space-between; }
.fdr-docs-hdr-left { display: flex; align-items: center; gap: 10px; }
.fdr-docs-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-docs-title { font-size: 14px; font-weight: 700; }
.fdr-docs-sub { font-size: 11px; color: var(--text-muted); }
.fdr-docs-edit-btn { background: none; border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; font-size: 11px; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
.fdr-docs-edit-btn:hover { color: var(--text-primary); border-color: var(--border-bright); }
.fdr-docs-body { padding: 16px 18px; }
.fdr-docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px; }
.fdr-doc-card { background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; cursor: pointer; transition: var(--transition); text-decoration: none; position: relative; }
.fdr-doc-card:hover { border-color: rgba(var(--accent-rgb),0.33); background: rgba(var(--accent-rgb),.05); transform: translateY(-1px); }
.fdr-doc-card-icon { font-size: 22px; }
.fdr-doc-card-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.fdr-doc-card-desc { font-size: 11px; color: var(--text-muted); line-height: 1.4; }
.fdr-doc-card-badge { position: absolute; top: 10px; right: 10px; font-size: 9px; padding: 2px 6px; border-radius: 999px; font-weight: 700; }
.fdr-doc-card-badge.pdf { background: rgba(239,68,68,.12); color: var(--red-ink); }
.fdr-doc-card-badge.slides { background: rgba(var(--warning-rgb),.12); color: var(--orange-ink); }
.fdr-doc-card-badge.drive { background: rgba(var(--success-rgb),.12); color: var(--success-ink); }
.fdr-doc-card-badge.link { background: rgba(var(--accent-rgb),.12); color: var(--accent-ink); }
.fdr-doc-card-nolink { opacity: .5; cursor: default; }
.fdr-doc-card-nolink:hover { transform: none; background: var(--bg-card-alt); border-color: var(--border); }
.fdr-docs-embed-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; margin-bottom: 12px; position: relative; background: var(--bg-card-alt); }
.fdr-docs-embed-placeholder { padding: 32px; text-align: center; color: var(--text-muted); font-size: 13px; }
.fdr-docs-embed-placeholder a { color: var(--accent-ink); text-decoration: underline; cursor: pointer; }
.fdr-docs-cfg { display: none; padding: 14px 18px; border-top: 1px solid var(--border); background: var(--bg-card-alt); }
.fdr-docs-cfg.open { display: block; }
.fdr-docs-cfg-title { font-size: 12px; font-weight: 600; margin-bottom: 10px; }
.fdr-docs-cfg-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.fdr-docs-cfg-lbl { font-size: 11px; color: var(--text-muted); width: 100px; flex-shrink: 0; }
.fdr-docs-cfg-input { flex: 1; padding: 6px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; }
.fdr-docs-cfg-save { padding: 6px 14px; background: var(--accent); border: none; border-radius: 6px; color: var(--on-accent); font-size: 12px; font-weight: 700; cursor: pointer; }

/* ── Persona picker (Frade / Teljo) ─────────────────────────────────────── */
#persona-overlay { position: fixed; inset: 0; background: rgba(15,12,5,.92); backdrop-filter: blur(10px); z-index: 1500; display: none; align-items: center; justify-content: center; }
#persona-overlay.open { display: flex; }
.persona-modal { width: min(440px, 92vw); background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 28px 24px; text-align: center; box-shadow: var(--elev-3); }
.persona-modal h2 { margin: 0 0 6px; font-size: 20px; font-weight: 700; color: var(--text-primary); }
.persona-modal p { margin: 0 0 22px; font-size: 13px; color: var(--text-muted); }
.persona-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.persona-choice { cursor: pointer; background: var(--bg-card-alt); border: 2px solid var(--border); border-radius: 12px; padding: 18px 12px; transition: var(--transition); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.persona-choice:hover { border-color: var(--accent-bright); transform: translateY(-2px); background: rgba(var(--accent-rgb),.08); }
.persona-avatar { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 800; color: var(--on-accent); }
.persona-avatar.frade { background: var(--accent); }
.persona-avatar.teljo { background: var(--accent); }
.persona-name { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.persona-role { font-size: 11px; color: var(--text-muted); }

/* ── Live Klanten panel ─────────────────────────────────────────────────── */
.fdr-live-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; margin-bottom: 20px; }
.fdr-live-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); justify-content: space-between; }
.fdr-live-hdr-left { display: flex; align-items: center; gap: 10px; }
.fdr-live-icon { width: 32px; height: 32px; border-radius: 8px; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fdr-live-title { font-size: 14px; font-weight: 700; }
.fdr-live-sub { font-size: 11px; color: var(--text-muted); }
.fdr-live-count { font-size: 11px; color: var(--text-muted); }
.fdr-live-count .online-num { color: var(--green-ink); font-weight: 700; }
.fdr-live-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fdr-live-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); background: var(--bg-card-alt); }
.fdr-live-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); }
.fdr-live-table tr:last-child td { border-bottom: none; }
.fdr-live-table tr:hover td { background: rgba(var(--accent-rgb),.04); }
.fdr-live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.fdr-live-dot.online { background: var(--success); box-shadow: 0 0 6px rgba(var(--success-rgb),.7); animation: pulseDot 1.6s ease-in-out infinite; }
.fdr-live-dot.offline { background: var(--text-muted-c); }
@keyframes pulseDot { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
.fdr-live-name { font-weight: 600; color: var(--text-primary); }
.fdr-live-meta { font-size: 11px; color: var(--text-muted); }
.fdr-live-stat { font-weight: 600; font-variant-numeric: tabular-nums; }
.fdr-live-mrr { color: var(--green-ink); font-weight: 700; font-variant-numeric: tabular-nums; }
.fdr-live-empty { padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 13px; }
.fdr-live-mrr-input { width: 70px; padding: 4px 6px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-variant-numeric: tabular-nums; text-align: right; }
.fdr-live-mrr-input:focus { outline: none; border-color: var(--accent-bright); }

/* ── Meeting widget ─────────────────────────────────────────────────────── */
.fdr-meeting-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 20px; }
.fdr-meeting-hdr { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.fdr-meeting-icon { font-size: 16px; }
.fdr-meeting-title { font-size: 13px; font-weight: 700; }
.fdr-meeting-when { font-size: 18px; font-weight: 700; color: var(--accent-ink); margin: 4px 0; }
.fdr-meeting-agenda { font-size: 12px; color: var(--text-muted); margin-bottom: 10px; }
.fdr-meeting-row { display: flex; gap: 8px; align-items: center; margin-top: 8px; }
.fdr-meeting-row input { flex: 1; padding: 7px 10px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary); font-size: 12px; font-family: inherit; outline: none; }
.fdr-meeting-row button { padding: 7px 12px; background: var(--accent-bright); border: none; border-radius: 6px; color: var(--on-accent); font-size: 12px; font-weight: 600; cursor: pointer; }
.fdr-meeting-empty { color: var(--text-muted); font-size: 12px; font-style: italic; }

/* ── Persona greeting in hero ───────────────────────────────────────────── */
.fdr-persona-greeting { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.fdr-persona-greeting strong { color: var(--accent-ink); }
.fdr-persona-switch { background: none; border: 1px solid var(--border); color: var(--text-muted); padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer; margin-left: 8px; }
.fdr-persona-switch:hover { color: var(--text-primary); border-color: var(--border-bright); }

/* ── Editable cost panel ────────────────────────────────────────────────── */
.fdr-cost-edit-btn { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 11px; padding: 0 4px; display: inline-flex; align-items: center; vertical-align: middle; }
.fdr-cost-edit-btn:hover { color: var(--accent-ink); }
.fdr-cost-edit-input { width: 60px; padding: 2px 6px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }

/* AI Coach chat */
.fdr-chat-box { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.fdr-chat-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.fdr-chat-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 15px; }
.fdr-chat-hdr-info {}
.fdr-chat-hdr-name { font-size: 14px; font-weight: 700; }
.fdr-chat-hdr-sub { font-size: 11px; color: var(--text-muted); }
.fdr-chat-clear { margin-left: auto; background: none; border: none; color: var(--text-muted); font-size: 11px; cursor: pointer; padding: 4px 8px; border-radius: 6px; }
.fdr-chat-clear:hover { color: var(--text-primary); background: var(--bg-card-alt); }
.fdr-chat-msgs { height: 280px; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
.fdr-chat-bubble { max-width: 82%; padding: 9px 13px; border-radius: 12px; font-size: 13px; line-height: 1.55; }
.fdr-chat-bubble.assistant { background: var(--bg-card-alt); border: 1px solid var(--border); color: var(--text-primary); align-self: flex-start; border-bottom-left-radius: 3px; }
.fdr-chat-bubble.user { background: var(--accent); color: var(--on-accent); align-self: flex-end; border-bottom-right-radius: 3px; }
.fdr-chat-bubble.typing { opacity: .55; font-style: italic; }
.fdr-chat-input-row { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--border); }
.fdr-chat-input { flex: 1; padding: 9px 13px; background: var(--bg-primary); border: 1px solid var(--border); border-radius: 10px; color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s; resize: none; height: 38px; overflow: hidden; }
.fdr-chat-input:focus { border-color: var(--accent); }
.fdr-chat-send { padding: 9px 16px; background: var(--accent); border: none; border-radius: 10px; color: var(--on-accent); font-size: 13px; font-weight: 700; cursor: pointer; transition: var(--transition); flex-shrink: 0; }
.fdr-chat-send:hover:not(:disabled) { background: var(--accent-bright); }
.fdr-chat-send:disabled { opacity: .5; cursor: not-allowed; }

/* ============================================================
   SIDEBAR
   ============================================================ */
.sidebar {
  width: 220px;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  /* Permanently dark in BOTH themes — the anchor the light content area
     sits against. Rebinding the colour tokens here means every child
     (nav labels, icons, dividers, the account block) picks up
     dark-surface values automatically instead of needing its own
     override. The inset highlight is the specular edge that makes the
     pane read as a physical sheet catching light. */
  /* ── Warm, niet blauw ────────────────────────────────────────────────
     Hier stond rgba(15,20,30,0.88): rood 15, groen 20, BLAUW 30. Blauw
     domineerde met vijftien punten, en dat is genoeg om koud te lezen naast
     een app die verder volledig warm is -- de grond is #14120E, het accent is
     zand. De zijbalk stond dus letterlijk in een ander kleurenfamilie dan
     alles waar hij tegenaan ligt.

     Dezelfde behandeling als de vlakken eerder: de HELDERHEID exact gelijk
     gehouden en alleen de hue naar zand gedraaid. Gemeten in OKLCH: L blijft
     0,191, alleen de tint verschuift. Er gaat dus geen contrast verloren --
     de gedempte tekst hierop haalt voor en na precies 6,40:1.

     Het blijft een EIGEN vlak en niet dezelfde kleur als de pagina: iets
     donkerder en met de doorschijnendheid intact, zodat hij als een aparte
     laag leest en niet als een uitsnede. */
  background: rgba(24,20,9,0.88);
  backdrop-filter: saturate(160%) blur(20px);
  -webkit-backdrop-filter: saturate(160%) blur(20px);
  /* The sidebar is dark in BOTH themes, so it rebinds the FULL token set
     and becomes a self-contained dark context. Rebinding only a few of
     them is what caused a run of light-theme bugs in here: the account
     block painted white (it used --bg-card-alt), the client's own name
     rendered at 1.04 contrast (it used --text-primary), and the logout
     button sat at 2.38 (it used --red, which light tunes for white).
     Every alias a child might reach for is covered here on purpose. */
  /* Ook deze zijn warm gemaakt op gelijke helderheid. #E9EEF6 was een koud
     blauwwit en #8D99AC een blauwgrijs -- die laatste werd 185 keer gebruikt
     in de zijbalk en was dus de dominante tekstkleur van het hele paneel. */
  --text:           #F1EDE5;
  --text-c:         #F1EDE5;
  --text-primary:   #F1EDE5;
  --text-muted:     #9E988B;
  --text-muted-c:   #9E988B;
  --text-secondary: #9E988B;
  /* De zijbalk blijft donker in het lichte thema, dus het lichte goud (#96742F,
     4,23:1 hier) zou werken maar is nodeloos zwak. Zand haalt er 12,94:1. */
  --focus-ring:     #E8D7B1;
  --border:      rgba(255,255,255,0.07);
  --border-c:    rgba(255,255,255,0.07);
  --divider:     rgba(255,255,255,0.07);
  --hover:       rgba(255,255,255,0.06);
  --hover-c:     rgba(255,255,255,0.06);
  --bg-card:     transparent;
  --bg-card-alt: rgba(255,255,255,0.05);
  --bg-alt:      rgba(255,255,255,0.05);
  /* Semantic colours in their dark-surface variants — the light theme's
     deepened versions are unreadable against this pane. */
  --red:         #F87171;
  --error-c:     #F87171;
  --error-rgb:   248,113,113;
  --green:       #34D399;
  --success-c:   #34D399;
  --success-rgb: 52,211,153;
  --accent:        #E8D7B1;
  --accent-c:      #E8D7B1;
  --accent-bright: #F2C670;
  --accent-rgb:    231,183,90;
  border-right: 1px solid rgba(255,255,255,0.06);
  box-shadow: inset -1px 0 0 rgba(255,255,255,0.06), 8px 0 32px rgba(25,22,16,0.10);
  display: flex;
  flex-direction: column;
  z-index: 100;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
/* Without backdrop-filter the pane would render see-through and
   unreadable. Literal colour, not var(--bg-card) — that token is
   rebound to transparent inside .sidebar. */
@supports not (backdrop-filter: blur(1px)) {
  .sidebar { background: #181409; }
}

/* ---- Sidebar navigation ---------------------------------------------
   Active = solid gold pill. On a dark pane a filled shape reads
   instantly at a glance, where the old 12%-alpha gradient tint was
   nearly invisible. Higher specificity than the base .nav-item.active
   rule so it wins regardless of source order. */
.sidebar .nav-item {
  color: var(--text-muted);
  border-radius: 10px;
}
.sidebar .nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text);
}
.sidebar .nav-item.active {
  background: var(--grad-gold);
  /* Koud zwart (#0B0F16) op een gouden pil las grijsblauw waar het zwart
     hoorde te zijn. Zelfde helderheid, warme tint: 13,51:1 -> 13,47:1. */
  color: #120F08;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(0,0,0,.30), 0 6px 18px rgba(232,215,177,.26);
}
/* The old rule painted a 3px bar down the left edge. Redundant now that
   the whole item is a filled pill, and it broke the pill's silhouette. */
.sidebar .nav-item.active::before { display: none; }
.sidebar .nav-item.active svg { color: #120F08; stroke: currentColor; }
.sidebar .nav-item:active { transform: translateY(1px); }

.sidebar-logo {
  padding: 26px 20px 22px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.sidebar-logo img {
  height: 44px;
  width: auto;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
}

/* Two flat colourways of the mark (see LOGO-RECOLOR notes) — dark surfaces
   get the pale sand tint, the light surface gets the deeper bronze step so
   it keeps contrast on white/cream. Swapped per theme, never both at once. */
/* Hier stonden twee logo's over elkaar, een lichte en een donkere, waarvan de
   lichte permanent verborgen was — de sidebar is in beide thema's donker, dus
   die wissel had geen functie meer. Een img op display:none wordt door de
   browser nog steeds opgehaald, dus dat kostte elke lading een extra download
   voor niets. Nu één logo: het goud leest op donker én op licht, dus de
   ink/sand-splitsing is sowieso overbodig geworden. */

.sidebar-nav {
  flex: 1;
  padding: 20px 12px;
  overflow-y: auto;
}

.nav-divider {
  height: 1px;
  background: var(--border);
  margin: 10px 6px;
  opacity: 0.55;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  margin-bottom: 4px;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}

/* ═══ Zijbalk: groepen, inklappen, actieve staat ═══════════════════════════
   Twaalf navigatie-items achter elkaar met twee naamloze streepjes ertussen
   dwingt je elke keer de hele lijst te lezen. De groepen bestonden al in de
   broncode als commentaar (Werk / Inzicht / Setup); dit maakt ze zichtbaar. */
.nav-group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  opacity: 0.62;
  padding: 0 14px;
  margin: 14px 0 6px;
  user-select: none;
}
.sidebar-nav > .nav-group-label:first-child { margin-top: 2px; }

/* De actieve pagina had alleen een achtergrondje. Een staaf aan de linkerkant
   leest sneller dan een kleurverschil, en werkt ook als je de kleuren niet
   goed uit elkaar houdt. */
.nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%) scaleY(0);
  width: 3px;
  height: 20px;
  border-radius: 0 3px 3px 0;
  background: var(--accent-c);
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
.nav-item.active::before { transform: translateY(-50%) scaleY(1); }
.nav-item.active { font-weight: 650; }

/* ── Ingeklapt ──────────────────────────────────────────────────────────────
   220px van een 1280px-scherm is 17% van de breedte, permanent, voor een lijst
   die je één keer per pagina gebruikt. Ingeklapt blijft de navigatie volledig
   bruikbaar (icoon + tooltip) en krijgt de inhoud 152px terug. De keuze wordt
   onthouden. */
.sidebar { transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1); }
body.sidebar-collapsed .sidebar { width: 68px; }
body.sidebar-collapsed .main-content,
body.sidebar-collapsed .topbar { margin-left: 68px; }
body.sidebar-collapsed .nav-item { justify-content: center; padding-left: 0; padding-right: 0; gap: 0; }
body.sidebar-collapsed .nav-item > :not(.nav-icon):not(.nav-badge) { display: none; }
body.sidebar-collapsed .nav-item { font-size: 0; }
body.sidebar-collapsed .nav-icon { font-size: 13px; }
/* De Faro-CTA is geen .nav-item maar eigen markup uit api/_faro/ui/markup.js,
   dus die viel buiten de regel hierboven en hield zijn label. */
body.sidebar-collapsed .faro-nav-cta__text { display: none; }
body.sidebar-collapsed .faro-nav-cta { justify-content: center; padding-left: 0; padding-right: 0; }
body.sidebar-collapsed .nav-group-label,
body.sidebar-collapsed .credit-usage-widget,
body.sidebar-collapsed .user-info > div:not(.user-avatar),
body.sidebar-collapsed .user-info > svg,
body.sidebar-collapsed .btn-logout span { display: none; }
body.sidebar-collapsed .user-info { justify-content: center; padding-left: 0; padding-right: 0; }
body.sidebar-collapsed .btn-logout { justify-content: center; }
body.sidebar-collapsed .sidebar-logo img { max-width: 34px; }
body.sidebar-collapsed .nav-badge {
  position: absolute; top: 5px; right: 9px;
  min-width: 7px; height: 7px; padding: 0;
  font-size: 0; border-radius: 50%;
}

/* De tooltip is wat inklappen bruikbaar houdt in plaats van een raadspelletje.
   Alleen ingeklapt, en alleen op apparaten met een muis. */
@media (hover: hover) {
  body.sidebar-collapsed .nav-item[data-label]:hover::after,
  body.sidebar-collapsed .nav-item[data-label]:focus-visible::after {
    content: attr(data-label);
    position: absolute;
    left: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: #1B1B1B;
    color: #F4F4F4;
    border: 1px solid rgba(255,255,255,0.10);
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    z-index: 120;
    box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  }
}

.sidebar-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.sidebar-collapse-btn:hover { background: var(--hover-c); color: var(--text); }
.sidebar-collapse-btn:focus-visible { outline: 2px solid var(--accent-c); outline-offset: 2px; }
.sidebar-collapse-btn svg { transition: transform 0.22s ease; flex-shrink: 0; }
body.sidebar-collapsed .sidebar-collapse-btn span { display: none; }
body.sidebar-collapsed .sidebar-collapse-btn svg { transform: rotate(180deg); }

/* Het accountblok is nu een <button>, dus het heeft de knop-resets nodig die
   een <div> niet had — en een zichtbare focusring, want met de muis was het
   altijd al klikbaar en met het toetsenbord niet te bereiken. */
.user-info {
  border: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  width: 100%;
  /* Expliciet, want dit is een <button>: zonder background pakt Chrome zijn
     eigen knopkleur (#efefef). Op de donkere zijbalk gaf dat een lichtgrijze
     pil met bijna-witte tekst erop — de profielnaam was in het donkere thema
     onzichtbaar. Niet zichtbaar in de berekende stijl van een ouder: de
     UA-stijl staat op het element zelf. */
  background: rgba(255, 255, 255, 0.05);
}
.user-info:focus-visible { outline: 2px solid var(--accent-c); outline-offset: 2px; }

.nav-item:focus-visible {
  outline: 2px solid var(--blue-bright);
  outline-offset: 2px;
}

.nav-item:hover {
  background: rgba(255,255,255,0.05);
  color: var(--text-primary);
}

.nav-item:active {
  transform: scale(0.98);
  transition-duration: var(--dur-fast);
}

.nav-item.active {
  background: linear-gradient(90deg, rgba(var(--accent-rgb), 0.12), rgba(var(--accent-rgb), 0.06));
  color: var(--accent-ink);
  border: none;
  font-weight: 600;
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 15%;
  height: 70%;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: linear-gradient(180deg, var(--blue-primary), var(--blue-bright));
  box-shadow: none;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  opacity: 0.75;
}

.nav-item:hover .nav-icon,
.nav-item.active .nav-icon { opacity: 1; }

.sidebar-bottom {
  padding: 16px 12px;
  border-top: 1px solid var(--border);
}

/* ── Credit usage widget. Hidden by default (display:none inline in the
   HTML) — only shown once loadCreditUsage() confirms the credit system is
   active for this client (allowance configured). See CREDIT-SYSTEM-DESIGN.md
   and api/_credits.js. ─────────────────────────────────────────────────── */
.credit-usage-widget { position: relative; margin-bottom: 10px; }

/* De balk is een KNOP. Wat je altijd ziet is een percentage en een streep --
   meer heeft niemand nodig terwijl hij met iets anders bezig is. De cijfers
   (hoeveel credits, hoeveel gesprekken, hoeveel dagen) staan achter een klik,
   want dat zijn cijfers waar je pas naar kijkt als je ernaar zoekt. */
.credit-usage-btn {
  display: block; width: 100%; text-align: left;
  padding: 8px 10px 10px;
  border-radius: 10px;
  background: transparent; border: 1px solid transparent;
  cursor: pointer; font-family: inherit;
  transition: var(--transition);
}
.credit-usage-btn:hover { background: var(--hover); }
.credit-usage-btn[aria-expanded="true"] { background: var(--hover); border-color: var(--border); }
.credit-usage-btn:focus-visible { outline: 2px solid rgba(var(--accent-rgb),0.55); outline-offset: 1px; }
.credit-usage-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.credit-usage-head .credit-usage-pct { font-weight: 700; font-variant-numeric: tabular-nums; }
.credit-usage-track {
  display: block;
  height: 6px;
  border-radius: 999px;
  background: rgba(255,255,255,0.09);
  overflow: hidden;
}
.credit-usage-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width .4s ease;
  background: var(--green);
}
.credit-usage-fill.amber { background: var(--orange); }
.credit-usage-fill.red   { background: var(--red); }
.credit-usage-head .credit-usage-pct.amber { color: var(--orange); }
.credit-usage-head .credit-usage-pct.red   { color: var(--red); }

/* Het detailvenster. position:fixed en niet absolute: de zijbalk is een eigen
   gestapelde context met blur, en een absoluut venster daarbinnen wordt bij de
   rand afgeknipt. De plaats wordt bij het openen berekend (zie plaatsCreditPop).

   De achtergrond is een vaste kleur en geen token, omdat .sidebar --bg-card op
   transparent zet: dit venster hoort dekkend te zijn, anders lees je de
   navigatie eronder er dwars doorheen. */
.credit-usage-pop {
  position: fixed;
  z-index: 1250;
  width: 264px;
  padding: 14px;
  border-radius: 12px;
  background: #201B11;
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: 0 18px 44px rgba(0,0,0,0.55);
  display: flex; flex-direction: column; gap: 10px;
  animation: modalIn 0.14s ease;
}
.cu-pop-kop {
  display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  font-size: 12px; font-weight: 700; color: var(--text-primary);
}
.cu-pop-kop span { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.cu-pop-kop span.amber { color: var(--orange); }
.cu-pop-kop span.red   { color: var(--red); }
.cu-pop-groot {
  font-size: 17px; font-weight: 700; color: var(--text-primary);
  font-variant-numeric: tabular-nums; line-height: 1.2;
}
.cu-pop-rij { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.cu-pop-let {
  font-size: 12px; line-height: 1.5; color: var(--orange);
  padding: 8px 10px; border-radius: 8px;
  background: rgba(255,255,255,0.05);
}
.cu-pop-knoppen { display: flex; flex-direction: column; gap: 6px; margin-top: 2px; }
.cu-pop-knop {
  display: block; width: 100%; padding: 8px 10px;
  border-radius: 8px; border: 1px solid var(--border);
  background: transparent; color: var(--text-primary);
  font-family: inherit; font-size: 12px; font-weight: 600;
  cursor: pointer; text-align: center; transition: var(--transition);
}
.cu-pop-knop:hover { background: var(--hover); }
.cu-pop-knop.primair {
  border-color: transparent;
  background: var(--accent);
  color: #16130C;   /* warm zwart op zand; was #0E141C, 13,02:1 -> 13,06:1 */
}
.cu-pop-knop.primair:hover { filter: brightness(1.08); }

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  margin-bottom: 8px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--on-accent);
  flex-shrink: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: 11px;
  /* De zijbalk is in BEIDE thema's donker, dus --text-muted krijgt hier een
     eigen waarde per thema (zie de light-override verderop). Nagerekend op de
     samengestelde voet rgb(26,31,39): donker #B5B5B5 en licht #8D99AC halen
     allebei ruim boven 4,5:1. Twee meetmethodes zeiden hier eerst van niet --
     de ene mist gradiënten, de andere leest antialiasing als tekst. */
  color: var(--text-muted);
}

.btn-logout {
  width: 100%;
  padding: 9px 14px;
  background: rgba(255, 69, 96, 0.08);
  border: 1px solid rgba(255, 69, 96, 0.2);
  border-radius: 8px;
  color: var(--red-ink);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-logout:hover {
  background: rgba(255, 69, 96, 0.15);
  border-color: rgba(255, 69, 96, 0.4);
}

/* Sidebar overlay (mobile) */
.sidebar-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 99;
}

.sidebar-overlay.visible { display: block; }

/* ============================================================
   TOPBAR
   ============================================================ */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 28px;
  /* Was a hardcoded rgba(13,17,23,.85) — a near-black bar, which in the
     light theme rendered as a dark slab across the top of a pale page.
     Now themed, so it reads as the same material as the sidebar. */
  background: var(--glass-fill);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--border);
  box-shadow: inset 0 1px 0 var(--glass-edge), 0 4px 20px rgba(20,17,10,0.05);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hamburger {
  display: none;
  background: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 16px;
  transition: var(--transition);
}

.hamburger:hover { background: var(--bg-card-alt); }

/* .page-title is nu een <h1>. De browser geeft die standaard 2em en flinke
   marges; dit blok stond er al voor de <div> en moet die reset dus expliciet
   maken, anders springt de hele topbalk uit elkaar. */
h1.page-title { margin: 0; font-weight: inherit; }

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 200;
  padding: 10px 16px;
  background: var(--card);
  color: var(--text);
  border: 1px solid var(--accent-c);
  border-radius: 0 0 10px 0;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.skip-link:focus {
  left: 0;
}

.page-title {
  font-size: 16px;
  /* Deze regel staat na de kop-regel bovenaan en zou hem anders terugzetten
     naar Inter/800. Zelfde waarden als daar. */
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
  background: none;
  -webkit-background-clip: initial;
  -webkit-text-fill-color: currentColor;
  background-clip: initial;
  color: var(--text);
  transition: opacity 0.2s ease;
}

.page-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 3px;
  transition: opacity 0.2s ease;
  opacity: 0.8;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.timestamp-info {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

/* ══ KNOPPEN ══════════════════════════════════════════════════════════════
   Wat de referentiesets gemeen hebben, en wat hier ontbrak.

   Vier dingen komen in alle vier de voorbeelden terug, en het zijn precies de
   vier die een knop van "vlak vlak met tekst" naar "voorwerp" tillen:

     1. RANDLICHT. Niet een rand van 1px in één kleur rondom, maar een lichte
        bovenrand en een donkere onderrand. Dat is licht van boven, en het is
        het goedkoopste signaal dat iets DIKTE heeft.
     2. VERLOOP. Nooit vlak. Boven iets lichter dan onder.
     3. GLOED IN DE EIGEN KLEUR. Geen neutrale drop shadow maar een bloem in de
        kleur van de knop zelf, onder hem.
     4. ECHTE STATEN. rust / zweef / druk / focus / uit, zichtbaar verschillend.

   Wat hier NIET van overgenomen wordt is de neon. Die sets staan op paars-zwart
   met verzadigde glow; Helvaro is zand op warm zwart en verkoopt vertrouwen,
   geen spektakel. De MECHANIEK is hetzelfde, de sterkte niet: waar de
   voorbeelden een gloed van 40% zetten, staat hier 14%.

   Eén plek, want er zijn 134 knop-selectors in dit bestand. Deze drie tokens
   voeden .btn-icon en zijn varianten, en dat is waar 75 van die selectors
   uiteindelijk op uitkomen. */
:root {
  /* Licht van boven, schaduw van onder. Twee inset-lijnen, geen border. */
  --btn-rim:  inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.24);
  --btn-rim-accent: inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.18);
  /* De gloed. Twee lagen: een korte onder de knop en een wijdere eronder, want
     één laag leest als een rand en niet als licht. */
  --btn-glow: 0 2px 6px rgba(var(--accent-rgb),0.16), 0 8px 22px rgba(var(--accent-rgb),0.14);
}
[data-theme="light"] {
  /* Op wit werkt hetzelfde principe andersom: de bovenrand is niet lichter dan
     wit, dus daar draagt de ONDERrand het verschil. */
  --btn-rim:  inset 0 1px 0 rgba(255,255,255,0.70), inset 0 -1px 0 rgba(64,52,32,0.10);
  --btn-rim-accent: inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(64,52,32,0.14);
  --btn-glow: 0 2px 6px rgba(var(--accent-rgb),0.30), 0 8px 22px rgba(var(--accent-rgb),0.22);
}

.btn-icon {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  /* Een echt verloop: boven lichter, onder donkerder. Hier stond een vlakke
     rgba(255,255,255,0.04). */
  background: linear-gradient(180deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.035) 55%, rgba(255,255,255,0.02) 100%);
  border: 1px solid rgba(255,255,255,0.07);
  box-shadow: var(--btn-rim);
  /* Van --radius-sm (8px) naar --radius-btn (14px): de knopmaat uit het
     ontwerpsysteem, die tot nu toe alleen op grote knoppen stond. De
     referenties gebruiken allemaal een ruimere hoek, en 8px liet deze knoppen
     als invoervelden lezen. */
  border-radius: var(--radius-btn);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}

.btn-icon:hover {
  background: linear-gradient(180deg, rgba(var(--accent-rgb),0.17) 0%, rgba(var(--accent-rgb),0.11) 100%);
  border-color: rgba(var(--accent-rgb),0.28);
  color: var(--accent-ink);
  /* Hier stond box-shadow:none -- de knop verloor bij het zweven juist zijn
     diepte, precies andersom dan het hoort. Nu komt de gloed erbij. */
  box-shadow: var(--btn-rim), var(--btn-glow);
  transform: translateY(-1px);
}

/* Press responds instantly (fast duration, no separate delay) — perceived
   speed matters more here than the animation itself. */
.btn-icon:active {
  transform: translateY(0) scale(0.97);
  transition-duration: var(--dur-fast);
}

.btn-icon:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.25);
  border-color: var(--blue-bright);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
.btn-icon:disabled:hover {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.07);
  color: var(--text-secondary);
}

    /* ── Global Search ── */
    .search-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15,12,5,0.8);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 9000;
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 90px;
    }
    .search-overlay.open { display: flex; animation: searchBgIn 0.15s ease both; }
    @keyframes searchBgIn { from { opacity:0; } to { opacity:1; } }
    .search-modal {
      background: var(--bg-card);
      border: 1px solid var(--border-bright);
      border-radius: var(--radius);
      width: min(660px, 92vw);
      box-shadow: var(--elev-3);
      overflow: hidden;
      position: relative;
      animation: searchModalIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
    }
    /* Match stat-card top glow line */
    .search-modal::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: var(--accent);
      z-index: 1;
    }
    @keyframes searchModalIn { from { transform: translateY(-14px) scale(0.97); opacity:0; } to { transform: none; opacity:1; } }
    .search-modal-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .search-modal-bar svg { color: var(--accent-ink); flex-shrink:0; }
    .search-modal-input {
      flex: 1;
      background: none;
      border: none;
      outline: none;
      font-size: 16px;
      color: var(--text-primary);
      font-family: 'Inter', sans-serif;
    }
    .search-modal-input::placeholder { color: var(--text-secondary); }
    .search-kbd {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 3px 10px;
      font-size: 11px;
      color: var(--text-secondary);
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      white-space: nowrap;
      flex-shrink: 0;
      transition: var(--transition);
    }
    .search-kbd:hover { border-color: var(--accent); color: var(--text-primary); }
    .search-results {
      max-height: 420px;
      overflow-y: auto;
      padding: 6px 0;
    }
    .search-results::-webkit-scrollbar { width: 3px; }
    .search-results::-webkit-scrollbar-track { background: transparent; }
    .search-results::-webkit-scrollbar-thumb { background: var(--border-bright); border-radius: 2px; }
    .search-hint {
      padding: 32px 20px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }
    .search-hint-icon { opacity: 0.3; line-height: 1; color: var(--text-muted); }
    .search-hint-text { font-size: 13px; color: var(--text-secondary); }
    .search-hint-shortcuts { display: flex; gap: 16px; margin-top: 4px; flex-wrap: wrap; justify-content: center; }
    .search-hint-shortcut { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 5px; }
    .search-hint-shortcut kbd {
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      color: var(--text-secondary);
    }
    .search-section-label {
      padding: 10px 20px 3px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--text-muted);
    }
    .search-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 20px;
      cursor: pointer;
      transition: background 0.1s, border-left-color 0.1s;
      border-left: 3px solid transparent;
      user-select: none;
    }
    .search-result-item:hover,
    .search-result-item.active {
      background: var(--bg-card-alt);
      border-left-color: var(--accent);
    }
    .search-result-avatar {
      width: 36px; height: 36px; border-radius: var(--radius-sm);
      background: linear-gradient(135deg, var(--blue-primary), var(--accent-bright));
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700; color: var(--on-accent); flex-shrink: 0;
      letter-spacing: 0.03em;
      box-shadow: none;
    }
    .search-result-body { flex: 1; min-width: 0; }
    .search-result-name {
      font-size: 13px; font-weight: 600; color: var(--text-primary);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-result-name mark {
      background: rgba(var(--accent-rgb),0.2); color: var(--accent-ink);
      font-weight: 700; border-radius: 4px; padding: 0 2px;
    }
    .search-result-meta {
      font-size: 11px; color: var(--text-secondary); margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .search-result-tags {
      display: flex; gap: 5px; align-items: center;
      margin-left: auto; flex-shrink: 0; padding-left: 8px;
    }
    .search-result-badge {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.04em; padding: 2px 7px; border-radius: 20px;
      background: rgba(var(--accent-rgb),0.12); color: var(--accent-ink);
      border: 1px solid rgba(var(--accent-rgb),0.2);
    }
    .search-result-badge.qualified {
      background: rgba(var(--success-rgb),0.1); color: var(--green-ink);
      border-color: rgba(var(--success-rgb),0.2);
    }
    .search-result-score {
      font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--accent-ink);
      background: rgba(var(--accent-rgb),0.1);
      padding: 2px 8px; border-radius: var(--radius-sm);
      border: 1px solid rgba(var(--accent-rgb),0.2);
      white-space: nowrap;
    }
    .search-no-results {
      padding: 36px 20px;
      text-align: center;
      color: var(--text-secondary);
      font-size: 13px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }
    .search-no-results-icon { opacity: 0.3; color: var(--text-muted); }
    .search-footer {
      padding: 9px 20px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 16px;
      align-items: center;
      background: var(--bg-card-alt);
    }
    .search-footer-hint { font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px; }
    .search-footer-hint kbd {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-size: 10px;
      font-family: 'Inter', sans-serif;
      color: var(--text-secondary);
    }
    .search-footer-count { margin-left: auto; font-size: 11px; color: var(--text-muted); }
    /* Search pill in topbar */
    .search-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--bg-card-alt);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text-secondary);
      font-size: 13px;
      cursor: pointer;
      transition: var(--transition);
      min-width: 170px;
      font-family: 'Inter', sans-serif;
    }
    .search-pill:hover { border-color: var(--accent); color: var(--text-primary); background: var(--bg-card-hover); }
    .search-pill svg { flex-shrink: 0; opacity: 0.7; }
    .search-pill-label { flex: 1; text-align: left; }
    .search-pill-kbd {
      font-size: 10px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: 'Inter', sans-serif;
      color: var(--text-muted);
      flex-shrink: 0;
    }
.notif-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background: var(--red);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  border: 2px solid var(--bg-topbar, var(--bg));
  pointer-events: none;
}

/* Notification dropdown */
.notif-wrap { position: relative; display: inline-flex; }
.notif-dropdown {
  position: absolute; top: calc(100% + 8px); right: 0;
  width: 340px; max-width: calc(100vw - 32px);
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow);
  z-index: 200; overflow: hidden;
  animation: notifDdIn 0.14s cubic-bezier(0.4,0,0.2,1);
}
@keyframes notifDdIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.notif-dd-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--border);
  font-size: 13px; font-weight: 700; color: var(--text-primary);
}
.notif-dd-clear {
  background: none; border: none; color: var(--accent-ink);
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.notif-dd-clear:hover { text-decoration: underline; }
.notif-dd-body { max-height: 360px; overflow-y: auto; }
.notif-dd-item {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; cursor: pointer; border-bottom: 1px solid var(--border);
  transition: background 0.12s ease;
}
.notif-dd-item:hover { background: var(--bg-card-hover); }
.notif-dd-item.unread { background: rgba(var(--accent-rgb),0.06); }
.notif-dd-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: var(--accent); opacity: 0;
}
.notif-dd-item.unread .notif-dd-dot { opacity: 1; }
.notif-dd-icon {
  width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-card-alt); color: var(--accent-ink);
}
.notif-dd-icon.hot { background: rgba(var(--success-rgb),0.12); color: var(--green-ink); }
.notif-dd-main { flex: 1; min-width: 0; }
.notif-dd-title {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notif-dd-sub { font-size: 11px; color: var(--text-muted); margin-top: 1px; }
.notif-dd-empty { padding: 28px 14px; text-align: center; color: var(--text-muted); font-size: 13px; }
.notif-dd-foot {
  width: 100%; padding: 11px; background: var(--bg-card-alt); border: none;
  border-top: 1px solid var(--border); color: var(--accent-ink);
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
}
.notif-dd-foot:hover { background: var(--bg-card-hover); }

.btn-icon .icon { font-size: 14px; }

.btn-icon.spin .icon { animation: spin 1s linear infinite; }

@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes cmFadeIn { from { opacity: 0; } to { opacity: 1; } }

/* Generic confirm modal buttons (injected via showConfirmModal) */
.cm-btn:hover { opacity: 0.88; }
.cm-btn:active { transform: translateY(1px); }
.cm-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.3); }
.cm-btn-confirm.danger:focus-visible { box-shadow: 0 0 0 3px rgba(var(--error-rgb),0.3); }
@keyframes modalIn { from { opacity: 0; transform: translateY(-8px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes pulse-glow { 0%,100% { box-shadow: 0 0 0 0 currentColor; opacity: .9; } 50% { box-shadow: 0 0 0 8px transparent; opacity: 1; } }

/* De primaire knop. Hier stond linear-gradient(135deg, X, X) -- twee keer
   DEZELFDE kleur, dus een verloop dat geen verloop is. De syntaxis stond er,
   het effect niet. Nu twee echte stops, van boven naar onder in plaats van
   diagonaal: licht valt van boven, niet van linksboven. */
.btn-primary-sm {
  background: linear-gradient(180deg, rgba(var(--accent-rgb),0.30) 0%, rgba(var(--accent-rgb),0.20) 55%, rgba(var(--accent-rgb),0.15) 100%);
  border-color: rgba(var(--accent-rgb),0.42);
  box-shadow: var(--btn-rim-accent), var(--btn-glow);
  color: var(--accent-ink);
}

.btn-primary-sm:hover {
  background: linear-gradient(180deg, rgba(var(--accent-rgb),0.46) 0%, rgba(var(--accent-rgb),0.34) 55%, rgba(var(--accent-rgb),0.27) 100%);
  border-color: rgba(var(--accent-rgb),0.58);
  /* De gloed groeit bij het zweven; dat is het hele signaal dat hij aanklikbaar
     is, en het kost geen kleurverandering die de tekst minder leesbaar maakt. */
  box-shadow: var(--btn-rim-accent),
              0 3px 10px rgba(var(--accent-rgb),0.26), 0 12px 32px rgba(var(--accent-rgb),0.22);
  color: var(--accent-ink);
}

/* Ingedrukt: de gloed KRIMPT. Een knop die je indrukt komt dichter bij zijn
   ondergrond, dus zijn schaduw wordt korter en harder -- dat is wat een echt
   voorwerp doet, en het leest als indrukken zonder dat er iets beweegt. */
.btn-primary-sm:active {
  box-shadow: var(--btn-rim-accent), 0 1px 3px rgba(var(--accent-rgb),0.30);
}

/* Uit. Geen gloed en geen randlicht: een knop die niets doet, hoort ook niet
   te lijken alsof hij licht vangt. Dat is duidelijker dan alleen opacity, want
   halfdoorzichtig leest ook als "aan het laden". */
.btn-primary-sm:disabled,
.btn-primary-sm:disabled:hover {
  opacity: 0.45;
  cursor: not-allowed;
  background: rgba(var(--accent-rgb), 0.12);
  border-color: rgba(var(--accent-rgb), 0.18);
  box-shadow: none;
  transform: none;
  color: var(--accent-ink);
}

.theme-toggle { font-size: 16px; padding: 8px 10px; }

/* ============================================================
   STATS GRID
   ============================================================ */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 22px 20px 18px;
  position: relative;
  overflow: hidden;
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              background var(--dur-base) var(--ease-out);
  cursor: default;
  box-shadow: var(--edge-hi), var(--shadow-card);
}

/* ---- Per-metric colour -----------------------------------------------
   Each card binds one local --a / --a-soft pair; the icon chip, the fill
   bar and the top hairline all read from it, so a metric's colour is set
   in exactly one place. Colour never touches the value text — coloured
   numerals fail contrast and read as decoration rather than data. */
.stat-card[data-accent="blue"]    { --a: var(--c-blue);    --a-soft: var(--c-blue-soft); }
.stat-card[data-accent="emerald"] { --a: var(--c-emerald); --a-soft: var(--c-emerald-soft); }
.stat-card[data-accent="orange"]  { --a: var(--c-orange);  --a-soft: var(--c-orange-soft); }
.stat-card[data-accent="purple"]  { --a: var(--c-purple);  --a-soft: var(--c-purple-soft); }
.stat-card[data-accent="cyan"]    { --a: var(--c-cyan);    --a-soft: var(--c-cyan-soft); }
.stat-card[data-accent="gold"]    { --a: var(--c-gold);    --a-soft: var(--c-gold-soft); }

/* A 2px bar across the top edge, revealed on hover. At rest the grid stays
   calm; on approach the card identifies itself. */
.stat-card::after {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: var(--a, var(--accent));
  opacity: 0;
  transition: opacity var(--dur-base, .18s) var(--ease-out, ease);
}
.stat-card:hover::after { opacity: 1; }
.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--elev-2, var(--shadow));
  border-color: var(--a, var(--border));
}
.stat-card:active { transform: translateY(0); }

.stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}
.stat-icon {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--a-soft, rgba(0,0,0,.05));
  color: var(--a, var(--accent));
}
.stat-icon svg { width: 16px; height: 16px; display: block; }
.stat-bar-fill { background: var(--a, var(--accent)) !important; }

@media (prefers-reduced-motion: reduce) {
  .stat-card, .stat-card::after { transition: none; }
  .stat-card:hover { transform: none; }
}

/* Stagger the grid in on load — content assembling reads calmer than a
   pop-in, and stays under the 240ms entrance guideline per card. */
@keyframes cardEnter {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stats-grid .stat-card {
  animation: cardEnter var(--dur-enter) var(--ease-out) both;
}
.stats-grid .stat-card:nth-child(1) { animation-delay: 0ms;   }
.stats-grid .stat-card:nth-child(2) { animation-delay: 40ms;  }
.stats-grid .stat-card:nth-child(3) { animation-delay: 80ms;  }
.stats-grid .stat-card:nth-child(4) { animation-delay: 120ms; }
.stats-grid .stat-card:nth-child(5) { animation-delay: 160ms; }
.stats-grid .stat-card:nth-child(6) { animation-delay: 200ms; }

/* Counter animation for stat values */
@keyframes countUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.stat-card .stat-value {
  animation: countUp 0.5s var(--ease-out) forwards;
  animation-delay: 0.1s;
}

/* Subtle top line — one quiet sand hairline, not a two-hue glow */
.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(var(--accent-rgb), 0.35);
  transition: opacity 0.3s ease;
}

/* Corner shimmer removed — was a 60x60 solid-fill block, too heavy for "sand never a flood" */
.stat-card::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 60px;
  height: 60px;
  background: none;
  pointer-events: none;
}

.stat-card:hover {
  border-color: var(--border-bright);
  background: linear-gradient(160deg, var(--bg-card-hover) 0%, var(--bg-card) 100%);
  transform: translateY(-3px) scale(1.01);
  box-shadow: var(--elev-1);
}

.stat-card:active {
  transform: translateY(-1px) scale(1.005);
  transition-duration: var(--dur-fast);
}

.stat-card:hover::before {
  background: rgba(var(--accent-rgb), 0.6);
}

.stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 10px;
}

.stat-value {
  font-variant-numeric: tabular-nums;
  font-size: 28px;
  /* Deze regel staat na de kop-regel; zonder deze drie zou hij terugvallen
     op Inter/800. De grote cijfers zijn juist waar de kop-letter het meest
     doet. */
  font-family: var(--font-head);
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  line-height: 1;
  margin-bottom: 8px;
}

.stat-value.cyan  { color: var(--accent-ink);        text-shadow: 0 0 20px rgba(188,159,95,0.35); }
.stat-value.green { color: var(--green-ink);        text-shadow: 0 0 20px rgba(16,185,129,0.35); }
.stat-value.orange{ color: var(--orange-ink);       text-shadow: 0 0 20px rgba(var(--warning-rgb),0.3); }
.stat-value.blue  { color: var(--accent-ink);  text-shadow: 0 0 20px rgba(159,131,67,0.35); }

.stat-unit {
  font-size: 16px;
  font-weight: 600;
  opacity: 0.45;
  margin-left: 2px;
  letter-spacing: 0;
}

.stat-desc {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.stat-trend {
  margin-top: 4px;
  min-height: 16px;
}

.stat-bar {
  height: 3px;
  background: var(--bg-card-alt);
  border-radius: 2px;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--blue-primary), var(--cyan));
  border-radius: 2px;
  transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
  width: 0%;
}

/* ============================================================
   FILTERS BAR
   ============================================================ */
.filters-bar {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 12px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.search-wrapper {
  position: relative;
  flex: 1;
  min-width: 180px;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  font-size: 14px;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 9px 12px 9px 36px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  transition: var(--transition);
}

.search-input:focus {
  border-color: var(--blue-bright);
  box-shadow: 0 0 0 2px rgba(var(--accent-rgb), 0.12);
}

.search-input::placeholder { color: var(--text-muted); }

.filter-select {
  padding: 9px 12px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  cursor: pointer;
  transition: var(--transition);
  min-width: 130px;
}

/* :focus alleen op border-color was in het donkere thema onzichtbaar — de
   randkleur verschilde te weinig van de rustkleur om als focus te lezen, en
   een tabpas leek daardoor nergens te landen. Nu een echte ring, en
   :focus-visible zodat een muisklik hem niet oproept. */
.filter-select:focus { border-color: var(--accent-c); }
/* box-shadow en geen outline: de regel met outline stond wél in de uitvoer en
   won ook op specificiteit, maar de gemeten breedte bleef 0px — een <select>
   laat zich door de browser maar beperkt opmaken. .cm-btn:focus-visible
   verderop in dit bestand doet het al zo, en dat werkt wel. */
.filter-select:focus-visible,
#search-input:focus-visible {
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.45);
  border-color: var(--accent-c);
}

.filters-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  font-weight: 500;
  white-space: nowrap;
}

.filter-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--blue-primary);
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: var(--on-accent);
}

.btn-reset {
  padding: 8px 12px;
  background: rgba(255, 69, 96, 0.08);
  border: 1px solid rgba(255, 69, 96, 0.2);
  border-radius: 8px;
  color: var(--red-ink);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--transition);
  white-space: nowrap;
  display: none;
}

.btn-reset.visible { display: inline-flex; align-items: center; gap: 4px; }
.btn-reset:hover { background: rgba(255, 69, 96, 0.15); }

.leads-count {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  margin-left: auto;
}

.leads-count strong { color: var(--text-secondary); }

/* ============================================================
   TABLE
   ============================================================ */
.table-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--edge-hi), var(--shadow-card);
  position: relative;
}

.table-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 10%, rgba(135,109,43,0.35) 40%, rgba(188,159,95,0.35) 60%, transparent 90%);
  z-index: 1;
  pointer-events: none;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead tr {
  border-bottom: 1px solid var(--border);
  background: linear-gradient(90deg, rgba(135,109,43,0.05) 0%, rgba(188,159,95,0.02) 100%);
}

th {
  padding: 12px 14px;
  text-align: left;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
}

th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}

th.sortable:hover { color: var(--accent-ink); }
th.sort-active { color: var(--accent-ink); }

.sort-indicator { margin-left: 4px; font-size: 10px; }

tbody tr {
  border-bottom: 1px solid rgba(37, 33, 22, 0.5);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  animation: rowFadeUp 0.35s ease both;
  position: relative;
}

@keyframes rowFadeUp {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

tbody tr:nth-child(even) { background: rgba(255,255,255,0.012); }
tbody tr:hover {
  background: rgba(var(--accent-rgb), 0.08);
  box-shadow: inset 3px 0 0 var(--blue-bright);
  transform: scale(1.002);
}
tbody tr:active { transform: scale(0.998); }
tbody tr:last-child { border-bottom: none; }

/* Row focus state for keyboard navigation */
tbody tr:focus-visible {
  outline: 2px solid var(--blue-bright);
  outline-offset: -2px;
  background: rgba(var(--accent-rgb), 0.1);
}

td {
  padding: 12px 14px;
  font-size: 13px;
  color: var(--text-primary);
  vertical-align: middle;
}

.td-naam { font-weight: 600; max-width: 140px; }
.td-phone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.copy-btn {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: var(--transition);
  position: relative;
}

tr:hover .copy-btn { opacity: 1; }
.copy-btn:hover { color: var(--accent-ink); background: rgba(193, 184, 164, 0.1); }

/* Touch devices have no hover — keep the copy button discoverable/tappable */
@media (hover: none) {
  .copy-btn { opacity: 0.65; }
}

.copy-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--success);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.copy-tooltip.show { opacity: 1; }

/* Badges */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  transition: all 0.15s ease;
  letter-spacing: 0.2px;
}

.badge-new {
  background: rgba(155, 149, 136, 0.12);
  color: var(--neutral-ink);
  border: 1px solid rgba(155,149,136,0.2);
}
.badge-inprogress {
  background: rgba(255, 149, 0, 0.1);
  color: var(--orange-ink);
  border: 1px solid rgba(255,149,0,0.22);
  position: relative;
}
.badge-inprogress::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--orange);
  animation: pulse 1.5s ease-in-out infinite;
}
.badge-done {
  background: rgba(var(--accent-rgb), 0.1);
  color: var(--accent-ink);
  border: 1px solid rgba(var(--accent-rgb),0.22);
}
.badge-yes {
  background: rgba(var(--success-rgb), 0.1);
  color: var(--green-ink);
  border: 1px solid rgba(var(--success-rgb),0.22);
}
.badge-yes::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  box-shadow: 0 0 6px rgba(var(--success-rgb),0.5);
}
.badge-no {
  background: rgba(var(--error-rgb), 0.1);
  color: var(--red-ink);
  border: 1px solid rgba(var(--error-rgb),0.22);
}
.badge-bron {
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--accent-ink);
  border: 1px solid rgba(var(--accent-rgb),0.18);
  font-size: 10px;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

/* Score pill */
.score-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 26px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: default;
  transition: all 0.2s ease;
  padding: 0 6px;
}

.score-pill:hover {
  transform: scale(1.05);
}

.score-green {
  background: rgba(var(--success-rgb), 0.12);
  color: var(--green-ink);
  border: 1px solid rgba(var(--success-rgb),0.25);
  box-shadow: none;
}
.score-orange {
  background: rgba(var(--warning-rgb), 0.12);
  color: var(--orange-ink);
  border: 1px solid rgba(var(--warning-rgb),0.25);
}
.score-red {
  background: rgba(var(--error-rgb), 0.12);
  color: var(--red-ink);
  border: 1px solid rgba(var(--error-rgb),0.25);
}
.score-gray {
  background: rgba(155, 149, 136, 0.08);
  color: var(--text-muted);
  border: 1px solid rgba(155,149,136,0.15);
}

.td-samenvatting {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 12px;
}

.td-arrow { color: var(--text-muted); font-size: 14px; text-align: right; }
tr:hover .td-arrow { color: var(--accent-ink); }

/* Skeleton loading */
.skeleton-row td { padding: 16px 14px; }

/* De vormen van laadvlak() hierboven. Bewust minimaal: het is .skeleton met
   een indeling eromheen, geen tweede animatiesysteem. */
/* flex:1 en width:100% omdat een laadvlak in een flex- of grid-container
   anders inklapt tot de breedte van zijn inhoud. Gemeten op het pipeline-bord:
   42px in een bak van 1164px -- de placeholder was er wel, maar onvindbaar.
   grid-column om dezelfde reden: in de rasters van AI-beeld nam hij anders
   een enkele cel van 117px in beslag in plaats van de volle rij. */
.laadvlak { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; flex: 1 1 auto; width: 100%; min-width: 0; grid-column: 1 / -1; }
.laadvlak--tegel { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
.laadvlak--kolom { flex-direction: row; gap: 14px; align-items: flex-start; }

.laad-rij { display: flex; align-items: center; gap: 10px; }
.laad-bol { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; }
.laad-tekst { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.laad-tegel { height: 62px; border-radius: 10px; }
/* Even breed als een echte pipeline-kolom (.pipeline-col is flex: 0 0 260px).
   Met flex:1 kromp de placeholder mee tot 79px op een telefoon, terwijl er
   daarna kolommen van 260px verschijnen die het bord horizontaal laten
   scrollen. Dan belooft de plaatshouder een andere indeling dan wat er komt,
   en dat is precies wat een plaatshouder-op-vorm hoort te voorkomen. */
.laad-kolom { flex: 0 0 260px; max-width: 100%; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.laad-kaart { height: 54px; border-radius: 10px; }
/* Wat er staat als het wachten voorbij is en er niets kwam. Bewust rustig:
   de banner bovenaan zegt al wat er mis is en waarom -- dit is alleen de plek
   die anders eeuwig had staan schimmeren. */
.laad-mislukt { padding: 14px 2px; color: var(--text-muted); font-size: 13px; }

/* Alleen voor schermlezers. Niet display:none en niet visibility:hidden --
   die twee halen het uit de voorleesvolgorde, en dan is er alsnog niets te
   horen. Dit haalt het uit BEELD en laat het in de boom staan. */
.alleen-voorlezen {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

.skeleton {
  background: linear-gradient(90deg, var(--bg-card-alt) 0%, var(--bg-card-hover) 20%, var(--bg-card-alt) 40%, var(--bg-card-alt) 100%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  border-radius: 6px;
  height: 14px;
  display: block;
  position: relative;
  overflow: hidden;
}

.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent);
  animation: skeleton-shine 1.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 50%; }
  100% { background-position: -200% 50%; }
}

@keyframes skeleton-shine {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

/* Skeleton stat cards */
.stat-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.stat-card-skeleton .skeleton-label {
  height: 12px;
  width: 60%;
  border-radius: 4px;
}
.stat-card-skeleton .skeleton-value {
  height: 32px;
  width: 45%;
  border-radius: 6px;
}
.stat-card-skeleton .skeleton-bar {
  height: 4px;
  width: 100%;
  border-radius: 2px;
  margin-top: 8px;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 72px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-icon {
  font-size: 56px;
  margin-bottom: 12px;
  opacity: 0.25;
  filter: grayscale(0.5);
}
.empty-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: -0.2px;
}
.empty-desc {
  font-size: 14px;
  color: var(--text-muted);
  margin-bottom: 24px;
  max-width: 320px;
  line-height: 1.6;
}
.empty-state-illustration {
  width: 120px;
  height: 120px;
  margin-bottom: 20px;
  border-radius: 50%;
  background: var(--accent);
  border: 1px dashed rgba(var(--accent-rgb),0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  opacity: 0.6;
}

/* ============================================================
   DETAIL PANEL
   ============================================================ */
.panel-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 200;
}

.panel-backdrop.visible { display: block; }

.detail-panel {
  position: fixed;
  right: 0;
  top: 0;
  height: 100vh;
  width: 480px;
  background: var(--card-elevated);
  border-left: 1px solid var(--border);
  /* Directional version of --elev-3 — it slides in from the right edge,
     so the shadow reads leftward instead of the usual centred spread. */
  box-shadow: -6px 0 16px rgba(0,0,0,.32), -24px 0 56px rgba(0,0,0,.28);
  z-index: 201;
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  /* Buiten beeld schuiven verbergt het paneel voor het OOG, niet voor de rest.
     Zonder de regel hieronder bleef het display:flex, visibility:visible en
     opacity:1, en dus bleven zijn knoppen (sluiten, nummer kopieren) gewoon in
     de tabvolgorde staan -- op ELKE pagina, ook op het inlogscherm, waar je met
     Tab in een paneel belandde dat niemand kan zien.

     visibility:hidden haalt het uit de tabvolgorde en bij schermlezers weg, en
     is animeerbaar: door het mee te laten lopen met dezelfde duur blijft de
     uitschuif-animatie zichtbaar in plaats van halverwege te verspringen. */
  visibility: hidden;
  transition: transform var(--dur-enter) var(--ease-out),
              visibility 0s linear var(--dur-enter);
  overflow: hidden;
}

.detail-panel.visible {
  transform: translateX(0);
  visibility: visible;
  /* Bij het OPENEN moet visibility meteen aan, anders schuift er een
     onzichtbaar paneel in beeld. Vandaar hier geen vertraging. */
  transition: transform var(--dur-enter) var(--ease-out),
              visibility 0s linear 0s;
}

.panel-header {
  padding: 24px 24px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: relative;
}

.panel-close {
  position: absolute;
  top: 18px;
  right: 18px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 16px;
  transition: var(--transition);
}

.panel-close:hover { background: rgba(255,69,96,0.1); border-color: var(--red); color: var(--red-ink); }

.panel-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-bottom: 14px;
}

.avatar-green { background: rgba(0, 229, 160, 0.15); color: var(--green-ink); border: 2px solid rgba(0,229,160,0.3); }
.avatar-red { background: rgba(255, 69, 96, 0.15); color: var(--red-ink); border: 2px solid rgba(255,69,96,0.3); }
.avatar-orange { background: rgba(255, 149, 0, 0.15); color: var(--orange-ink); border: 2px solid rgba(255,149,0,0.3); }

.panel-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}

.panel-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.panel-phone {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
}

.panel-copy-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 4px;
  transition: var(--transition);
}

.panel-copy-btn:hover { color: var(--accent-ink); background: rgba(216,188,122,0.1); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 24px;
}

.panel-section {
  margin-bottom: 22px;
}

.panel-section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-ink);
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(216,188,122,0.3), transparent);
}

.panel-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 0;
  border-bottom: 1px solid rgba(37, 33, 22, 0.6);
  font-size: 13px;
  gap: 10px;
}

.panel-row:last-child { border-bottom: none; }
.panel-row-label { color: var(--text-muted); flex-shrink: 0; }
.panel-row-value { color: var(--text-primary); text-align: right; font-weight: 500; }

/* Score bar */
.score-bar-wrapper { display: flex; align-items: center; gap: 10px; }

.score-bar {
  display: flex;
  gap: 3px;
}

.score-segment {
  width: 18px;
  height: 8px;
  border-radius: 2px;
  background: var(--bg-card-alt);
  transition: background 0.3s ease;
}

.score-segment.filled { background: linear-gradient(90deg, var(--blue-primary), var(--cyan)); }
.score-segment.filled.high { background: linear-gradient(90deg, var(--green), var(--cyan)); }
.score-segment.filled.low { background: linear-gradient(90deg, var(--red), var(--orange)); }

.score-number {
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  font-weight: 700;
}

/* Notes */
.notes-textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  resize: vertical;
  outline: none;
  transition: var(--transition);
  margin-bottom: 10px;
}

.notes-textarea:focus { border-color: var(--blue-bright); box-shadow: 0 0 0 2px rgba(168,140,76,0.12); }

.btn-save {
  padding: 10px 20px;
  background: linear-gradient(135deg, var(--blue-primary), var(--blue-bright));
  border: none;
  border-radius: 8px;
  color: var(--on-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.btn-save:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(168,140,76,0.3); }

/* ── CRM feature styles ── */
.panel-inline-input {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-size: 13px;
  padding: 4px 10px;
  width: 100%;
  font-family: 'Inter', sans-serif;
  transition: border-color 0.15s;
}
.panel-inline-input:focus { outline: none; border-color: var(--accent); }

/* Notes */
.panel-notes-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.panel-note-item {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  position: relative;
}
.panel-note-text { font-size: 13px; color: var(--text-primary); line-height: 1.5; white-space: pre-wrap; }
.panel-note-ts { font-size: 10px; color: var(--text-muted); margin-top: 4px; }
.panel-note-delete {
  position: absolute; top: 8px; right: 8px;
  background: none; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted); font-size: 12px; padding: 4px 5px;
  border-radius: 4px; transition: color 0.1s, background 0.1s;
}
.panel-note-delete:hover { color: var(--red-ink); background: rgba(var(--error-rgb),0.08); }
.panel-add-note textarea {
  width: 100%; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 8px 10px; resize: vertical; min-height: 60px;
  transition: border-color 0.15s;
}
.panel-add-note textarea:focus { outline: none; border-color: var(--accent); }
.btn-add-note {
  margin-top: 6px; background: rgba(var(--accent-rgb),0.12); border: 1px solid rgba(var(--accent-rgb),0.25);
  color: var(--accent-ink); border-radius: var(--radius-sm); padding: 6px 14px;
  font-size: 12px; cursor: pointer; font-family: 'Inter',sans-serif; transition: var(--transition);
}
.btn-add-note:hover { background: rgba(var(--accent-rgb),0.2); }

/* Tasks */
.panel-tasks-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.panel-task-item {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
.panel-task-item.done { opacity: 0.55; }
.panel-task-check { width: 16px; height: 16px; cursor: pointer; accent-color: var(--accent); flex-shrink: 0; }
.panel-task-text { flex: 1; font-size: 13px; color: var(--text-primary); }
.panel-task-item.done .panel-task-text { text-decoration: line-through; color: var(--text-muted); }
.panel-task-due {
  font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 20px;
  background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--border);
  white-space: nowrap; flex-shrink: 0;
}
.panel-task-due.overdue { background: rgba(var(--error-rgb),0.1); color: var(--red-ink); border-color: rgba(var(--error-rgb),0.25); }
.panel-task-due.today { background: rgba(var(--warning-rgb),0.1); color: var(--orange-ink); border-color: rgba(var(--warning-rgb),0.25); }
.panel-task-delete {
  background: none; border: none; cursor: pointer; color: var(--text-muted);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  font-size: 12px; padding: 4px 5px; border-radius: 4px; transition: color 0.1s;
}
.panel-task-delete:hover { color: var(--red-ink); }
.panel-add-task { display: flex; gap: 6px; align-items: center; }
.panel-add-task input[type="text"] {
  flex: 1; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 10px; transition: border-color 0.15s;
}
.panel-add-task input[type="text"]:focus { outline: none; border-color: var(--accent); }
.panel-add-task input[type="date"] {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-secondary); font-family: 'Inter',sans-serif;
  font-size: 12px; padding: 7px 8px; width: 130px; transition: border-color 0.15s;
}
.panel-add-task input[type="date"]:focus { outline: none; border-color: var(--accent); }
.btn-add-task {
  background: rgba(var(--accent-rgb),0.12); border: 1px solid rgba(var(--accent-rgb),0.25);
  color: var(--accent-ink); border-radius: var(--radius-sm); padding: 7px 14px;
  font-size: 14px; cursor: pointer; font-family: 'Inter',sans-serif; transition: var(--transition);
}
.btn-add-task:hover { background: rgba(var(--accent-rgb),0.22); }

/* Calls */
.panel-calls-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.panel-call-item {
  display: flex; align-items: flex-start; gap: 10px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 9px 12px;
}
.panel-call-icon { font-size: 14px; margin-top: 1px; flex-shrink: 0; color: var(--accent-ink); display: flex; align-items: center; }
.panel-call-body { flex: 1; min-width: 0; }
.panel-call-meta { font-size: 11px; color: var(--text-muted); margin-bottom: 2px; }
.panel-call-note { font-size: 13px; color: var(--text-primary); line-height: 1.4; }
.panel-log-call { display: flex; gap: 6px; align-items: center; }
.panel-log-call input[type="number"] {
  width: 70px; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 8px; transition: border-color 0.15s;
}
.panel-log-call input[type="text"] {
  flex: 1; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter',sans-serif;
  font-size: 13px; padding: 7px 10px; transition: border-color 0.15s;
}
.panel-log-call input:focus { outline: none; border-color: var(--accent); }
.btn-log-call {
  background: rgba(var(--success-rgb),0.1); border: 1px solid rgba(var(--success-rgb),0.25);
  color: var(--green-ink); border-radius: var(--radius-sm); padding: 7px 14px;
  font-size: 12px; cursor: pointer; font-family: 'Inter',sans-serif;
  white-space: nowrap; transition: var(--transition);
}
.btn-log-call:hover { background: rgba(var(--success-rgb),0.2); }

/* Afspraak Resultaat */
.afspraak-result { display: flex; flex-direction: column; gap: 10px; }
.afspraak-toggle-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.afspraak-toggle-row { display: flex; gap: 8px; }
.afspraak-btn {
  flex: 1; padding: 9px 12px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card-alt);
  color: var(--text-secondary); font-size: 13px; font-weight: 600;
  cursor: pointer; font-family: 'Inter', sans-serif; transition: var(--transition);
  text-align: center;
}
.afspraak-btn:hover { border-color: var(--border-bright); color: var(--text-primary); }
.afspraak-btn.active-yes { background: rgba(var(--success-rgb),0.12); border-color: rgba(var(--success-rgb),0.4); color: var(--green-ink); }
.afspraak-btn.active-no  { background: rgba(var(--error-rgb),0.1);  border-color: rgba(var(--error-rgb),0.35); color: var(--red-ink); }
.afspraak-value-row { display: flex; flex-direction: column; gap: 4px; }
.afspraak-value-label { font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; }
.afspraak-notitie {
  width: 100%; background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary); font-family: 'Inter', sans-serif;
  font-size: 13px; padding: 8px 10px; resize: vertical; min-height: 56px; transition: border-color 0.15s;
}
.afspraak-notitie:focus { outline: none; border-color: var(--accent); }
.afspraak-status-chip {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px;
}
.afspraak-status-chip.yes { background: rgba(var(--success-rgb),0.12); color: var(--green-ink); border: 1px solid rgba(var(--success-rgb),0.25); }
.afspraak-status-chip.no  { background: rgba(var(--error-rgb),0.1);  color: var(--red-ink);   border: 1px solid rgba(var(--error-rgb),0.2); }

/* Taken widget */
.taken-widget { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px; margin-bottom: 16px; }
.taken-widget-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.taken-widget-title { font-size: 13px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.05em; }
.taken-widget-count { font-size: 11px; font-weight: 700; background: rgba(var(--error-rgb),0.15); color: var(--red-ink); padding: 2px 8px; border-radius: 20px; }
.taken-widget-empty { font-size: 13px; color: var(--text-muted); text-align: center; padding: 12px 0; }
.taken-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-radius: var(--radius-sm);
  background: var(--bg-card-alt); border: 1px solid var(--border);
  cursor: pointer; margin-bottom: 6px; transition: border-color 0.15s;
}
.taken-item:hover { border-color: var(--accent); }
.taken-item.overdue { border-color: rgba(var(--error-rgb),0.3); background: rgba(var(--error-rgb),0.04); }
.taken-item-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--orange); flex-shrink: 0; }
.taken-item.overdue .taken-item-dot { background: var(--red); }
.taken-item-body { flex: 1; min-width: 0; }
.taken-item-text { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.taken-item-lead { font-size: 11px; color: var(--text-muted); }
.taken-item-due { font-size: 11px; font-weight: 600; color: var(--orange-ink); white-space: nowrap; flex-shrink: 0; }
.taken-item.overdue .taken-item-due { color: var(--red-ink); }

/* ── Nav badge (new-lead notification) ── */
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  border-radius: 10px;
  background: var(--red);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  padding: 0 4px;
  margin-left: auto;
  animation: pulse-glow 1.5s ease-in-out infinite;
}

/* ── Status select in detail panel ── */
.status-select {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'Inter', sans-serif;
  padding: 5px 10px;
  cursor: pointer;
  outline: none;
  transition: border-color .15s;
}
.status-select:focus { border-color: var(--blue-bright); }

/* ── WhatsApp conversation bubbles ── */
.chat-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
  padding: 4px 0;
}
.chat-bubble {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.chat-bubble.user {
  align-self: flex-start;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-bottom-left-radius: 3px;
  color: var(--text-primary);
}
.chat-bubble.ai {
  align-self: flex-end;
  background: rgba(138,111,46,0.18);
  border: 1px solid rgba(138,111,46,0.3);
  border-bottom-right-radius: 3px;
  color: var(--text-primary);
}
.chat-bubble.ai.manual {
  background: rgba(var(--accent-rgb),0.18);
  border-color: rgba(var(--accent-rgb),0.4);
}
.panel-score-pills {
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end;
  max-width: 65%;
}
.score-pill {
  font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px;
  white-space: nowrap;
}
.score-pill.sp-strong { background: rgba(var(--success-rgb),.14); color: var(--green-ink); border: 1px solid rgba(var(--success-rgb),.3); }
.score-pill.sp-medium { background: rgba(var(--warning-rgb),.14); color: var(--warning-ink);     border: 1px solid rgba(var(--warning-rgb),.3); }
.score-pill.sp-weak   { background: rgba(239,68,68,.14); color: var(--red-ink);   border: 1px solid rgba(239,68,68,.3); }
.score-pill.sp-neutral{ background: var(--bg-card-alt); color: var(--text-muted); border: 1px solid var(--border); }

.panel-suggest-row {
  margin-top: 10px; display: flex; flex-direction: column; gap: 8px;
}
.panel-suggest-btn {
  align-self: flex-start;
  display: inline-flex; align-items: center; gap: 6px;
  background: rgba(var(--accent-rgb),.12); border: 1px solid rgba(var(--accent-rgb),.3);
  color: var(--accent-ink); padding: 6px 12px; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer;
  transition: all .15s ease; font-family: inherit;
}
.panel-suggest-btn:hover { background: rgba(var(--accent-rgb),.22); }
.panel-suggest-btn:disabled { opacity: .55; cursor: wait; }
.panel-suggest-chips {
  display: flex; flex-direction: column; gap: 6px;
}
.panel-suggest-chip {
  text-align: left; cursor: pointer;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-left: 3px solid var(--accent-bright);
  border-radius: 8px; padding: 9px 12px;
  font-size: 12px; line-height: 1.5; color: var(--text-primary);
  font-family: inherit; transition: all .15s ease;
}
.panel-suggest-chip:hover {
  background: rgba(var(--accent-rgb),.08); border-color: var(--accent-bright);
  transform: translateX(2px);
}
/* ── Takeover-balk (assistent actief vs mens aan het roer) ── */
.panel-takeover-bar {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  margin-bottom: 10px; padding: 8px 10px;
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px;
}
.panel-takeover-status {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
  padding: 3px 9px; border-radius: 999px; white-space: nowrap;
}
.panel-takeover-status.active { background: rgba(var(--success-rgb),.14); color: var(--green-ink); border: 1px solid rgba(var(--success-rgb),.3); }
.panel-takeover-status.paused { background: rgba(var(--warning-rgb),.14); color: var(--warning-ink);    border: 1px solid rgba(var(--warning-rgb),.3); }
.panel-takeover-meta { font-size: 11px; color: var(--text-muted); }
.panel-takeover-escalated {
  font-size: 11px; font-weight: 600; color: var(--red-ink);
  background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3);
  padding: 3px 9px; border-radius: 999px; cursor: help;
}
.panel-takeover-btn {
  margin-left: auto; border: none; border-radius: 6px; padding: 6px 12px;
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: opacity .15s ease;
}
.panel-takeover-btn.pause  { background: rgba(var(--warning-rgb),.16); color: var(--warning-ink); border: 1px solid rgba(var(--warning-rgb),.35); }
.panel-takeover-btn.resume { background: rgba(var(--success-rgb),.16);  color: var(--green-ink); border: 1px solid rgba(var(--success-rgb),.35); }
.panel-takeover-btn:hover { opacity: .85; }
.panel-takeover-btn:disabled { opacity: .5; cursor: wait; }

.panel-reply-row {
  display: flex; gap: 8px; margin-top: 10px; align-items: flex-end;
}
.panel-reply-row-paused .panel-reply-input {
  border-color: rgba(var(--warning-rgb),.5); box-shadow: 0 0 0 1px rgba(var(--warning-rgb),.15);
}
.panel-reply-input {
  flex: 1; padding: 10px 12px; background: var(--bg-card-alt);
  border: 1px solid var(--border); border-radius: 10px;
  color: var(--text-primary); font-size: 13px; font-family: inherit;
  resize: vertical; min-height: 44px; max-height: 160px; outline: none;
}
.panel-reply-input:focus { border-color: var(--accent-bright); }
.panel-reply-send {
  background: var(--success);
  border: none; border-radius: 10px; padding: 10px 16px;
  color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0;
  transition: opacity 0.15s ease;
}
.panel-reply-send:hover { opacity: 0.9; }
.panel-reply-send:disabled { opacity: 0.5; cursor: not-allowed; }
.chat-label {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: .8px;
}

/* ── Chart container ── */
.charts-row {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  align-items: flex-start;
}
.chart-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  flex: 1;
  min-width: 0;
}
.chart-card-sm {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  width: 260px;
  flex-shrink: 0;
}
/* Every chart in the app runs with maintainAspectRatio:false and lives in one
   of these. Without a bounded parent Chart.js keeps growing the canvas to fill
   the available space and the bars run off the page; with maintainAspectRatio
   left on, a wide card produced an absurdly tall chart instead. A fixed-height
   parent is the documented requirement for that option, and it also decouples
   chart height from card width. flex:none so a flex-column card can't shrink it. */
.chart-canvas-wrap { position: relative; height: 220px; margin-top: 14px; flex: 0 0 auto; }
.chart-canvas-wrap--sm { height: 180px; }
.chart-canvas-wrap--xs { height: 150px; }
.chart-canvas-wrap > canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important; }
@media (max-width: 768px) {
  .chart-canvas-wrap { height: 180px; }
  .chart-canvas-wrap--sm { height: 160px; }
  .chart-canvas-wrap--xs { height: 140px; }
}

.chart-title {
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 16px;
}

/* ── Actie Nodig widget (waFailed + escalated) ── */
.nb-widget {
  background: var(--bg-card);
  border: 1px solid rgba(var(--error-rgb),0.35);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.nb-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
}
.nb-title {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--red-ink);
}
.nb-count {
  background: rgba(var(--error-rgb),0.15); color: var(--red-ink);
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px; border: 1px solid rgba(var(--error-rgb),0.3);
}
.nb-list { display: flex; flex-direction: column; gap: 8px; }
.nb-item {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-card-alt); border-radius: 10px;
  padding: 10px 12px; cursor: pointer; transition: background .15s;
}
.nb-item:hover { background: var(--bg-card-hover, rgba(255,255,255,.04)); }
.nb-item-info { flex: 1; min-width: 0; }
.nb-item-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.nb-item-sub  { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.nb-item-tag {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
  padding: 2px 7px; border-radius: 999px; white-space: nowrap; margin-right: 2px;
}
.nb-item-tag.tag-waFailed   { background: rgba(var(--error-rgb),.14);  color: var(--red-ink); border: 1px solid rgba(var(--error-rgb),.3); }
.nb-item-tag.tag-escalated { background: rgba(var(--warning-rgb),.14); color: var(--orange-ink); border: 1px solid rgba(var(--warning-rgb),.3); }
.nb-call-btn {
  display: flex; align-items: center; gap: 5px; padding: 6px 12px;
  background: rgba(var(--error-rgb),0.1); border: 1px solid rgba(var(--error-rgb),0.3);
  border-radius: 8px; color: var(--red-ink); font-size: 12px; font-weight: 600;
  text-decoration: none; white-space: nowrap; transition: background 0.15s;
}
.nb-call-btn:hover { background: rgba(var(--error-rgb),0.2); }

.followup-widget {
  background: var(--bg-card);
  border: 1px solid rgba(var(--warning-rgb),0.35);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.followup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.followup-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--orange-ink);
}
.followup-count {
  background: rgba(var(--warning-rgb),0.15);
  color: var(--orange-ink);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  border: 1px solid rgba(var(--warning-rgb),0.3);
}
.followup-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.followup-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.followup-item:hover { border-color: var(--orange); }
.followup-item-name { font-size: 13px; font-weight: 600; color: var(--text); flex: 1; }
.followup-item-meta { font-size: 11px; color: var(--text-muted); }
.followup-item-score { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--orange-ink); }
.followup-call-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  background: rgba(var(--warning-rgb),0.12);
  border: 1px solid rgba(var(--warning-rgb),0.3);
  color: var(--orange-ink);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.followup-call-btn:hover { background: rgba(var(--warning-rgb),0.22); }

/* ── Top Leads Strip ── */
.top-leads-strip {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.top-leads-strip-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.top-leads-strip-title svg { color: var(--orange-ink); }
.top-leads-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.top-lead-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s;
  font-size: 13px;
}
.top-lead-chip:hover { border-color: var(--accent); }
.top-lead-chip-avatar {
  width: 26px; height: 26px; border-radius: 50%;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--on-accent);
}
.top-lead-chip-name { font-weight: 600; color: var(--text); }
.top-lead-chip-score { font-weight: 700; color: var(--accent-ink); font-variant-numeric: tabular-nums; font-size:12px; }

/* ── Today widget ── */
.today-widget {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 16px 20px;
  margin-bottom: 20px;
}
.today-widget-title {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 12px;
}
.today-apt {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}
.today-apt:last-child { border-bottom: none; }
.today-apt-time {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-ink);
  min-width: 48px;
  flex-shrink: 0;
}
.today-apt-name {
  font-size: 13px;
  color: var(--text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.today-apt-type {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}
.today-empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 4px 0;
}

/* ── Nav badge ── */
.nav-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--blue-primary);
  color: var(--on-accent);
  font-size: 10px;
  font-weight: 700;
  margin-left: auto;
  flex-shrink: 0;
}

/* ── Calendar weekend columns ── */
.cal-day-col.cal-weekend-col { background: rgba(0,0,0,0.06); }
[data-theme="light"] .cal-day-col.cal-weekend-col { background: rgba(0,0,0,0.03); }

/* ── Calendar event modal ── */
.cal-modal-overlay {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  z-index: 2000;
  align-items: center;
  justify-content: center;
}
.cal-modal-overlay.open { display: flex; }
.cal-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-bright);
  border-radius: 16px;
  width: 100%;
  max-width: 420px;
  box-shadow: var(--elev-3);
  overflow: hidden;
  animation: modal-in 0.2s cubic-bezier(0.4,0,0.2,1);
}
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.cal-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
}
.cal-modal-header-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}
.cal-modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 6px;
  transition: var(--transition);
}
.cal-modal-close:hover { background: rgba(255,255,255,0.08); color: var(--text-primary); }
.cal-modal-body { padding: 16px 20px 20px; }
.cal-modal-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 0;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}
.cal-modal-row:last-of-type { border-bottom: none; }
.cal-modal-row-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  min-width: 64px;
  padding-top: 1px;
}
.cal-modal-row-val { color: var(--text-primary); flex: 1; }
.cal-modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.cal-modal-btn {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: var(--transition);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.cal-modal-btn-primary {
  background: var(--blue-primary);
  color: var(--on-accent);
}
.cal-modal-btn-primary:hover { background: var(--blue-bright); }
.cal-modal-btn-secondary {
  background: rgba(255,255,255,0.06);
  color: var(--text-secondary);
  border: 1px solid var(--border-bright);
}
.cal-modal-btn-secondary:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.cal-modal-btn-danger {
  background: rgba(var(--error-rgb),0.1);
  color: var(--red-ink);
  border: 1px solid rgba(var(--error-rgb),0.25);
}
.cal-modal-btn-danger:hover { background: rgba(var(--error-rgb),0.2); }

/* ── Admin client cards ── */
.admin-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.admin-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px;
  cursor: pointer;
  transition: border-color .2s, transform .15s;
}
.admin-card:hover { border-color: var(--blue-primary); transform: translateY(-2px); }
.admin-card-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
.admin-card-code { font-size: 11px; color: var(--text-muted); letter-spacing: 1px; margin-bottom: 14px; }
.admin-card-stats { display: flex; gap: 16px; }
.admin-stat { text-align: center; }
.admin-stat-val { font-size: 22px; font-weight: 700; color: var(--accent-ink); }
.admin-stat-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; }

.check-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.check-yes { color: var(--green-ink); }
.check-no { color: var(--red-ink); }

.ai-summary {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 12px;
  background: rgba(var(--accent-rgb), 0.06);
  border-left: 3px solid var(--blue-primary);
  border-radius: 0 8px 8px 0;
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
.toast-container {
  position: fixed;
  /* Lifted clear of the help launcher, which now owns the bottom-right
     corner (24px + 54px button + 12px gap). Toasts stack upward from
     here, so the two never overlap. */
  bottom: 90px;
  right: 24px;
  /* Boven ALLE vensters. Stond op 9999, terwijl de overlays in dit bestand op
     10000, 10050 en 11000 zitten. Gevolg: wie in een venster opslaat, krijgt
     zijn bevestiging achter datzelfde venster te zien -- dus niet.

     Een melding hoort per definitie bovenaan: hij is kort, hij dekt niets af
     (pointer-events staat uit) en hij is het antwoord op iets dat de gebruiker
     zojuist deed. 12000 laat ruimte onder zich voor een toekomstig venster. */
  z-index: 12000;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: none;
}
@media (max-width: 520px) {
  .toast-container { bottom: 82px; right: 16px; left: 16px; }
}

.toast {
  background: var(--card-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 16px;
  min-width: 280px;
  max-width: 360px;
  box-shadow: var(--elev-2);
  pointer-events: all;
  position: relative;
  overflow: hidden;
  animation: toastIn 0.35s var(--ease-spring) both;
}

.toast.dismissing { animation: toastOut 0.3s ease forwards; }

@keyframes toastIn {
  from { opacity: 0; transform: translateX(100%) scale(0.9); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateX(0) scale(1); max-height: 200px; }
  to { opacity: 0; transform: translateX(100%) scale(0.9); max-height: 0; padding: 0; margin: 0; }
}

.toast-success { border-left: 3px solid var(--green); }
.toast-error { border-left: 3px solid var(--red); }
.toast-info { border-left: 3px solid var(--blue-bright); }

.toast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.toast-title {
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toast-success .toast-title { color: var(--green-ink); }
.toast-error .toast-title { color: var(--red-ink); }
.toast-info .toast-title { color: var(--accent-ink); }

.toast-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 14px;
  /* Was 16x19 met padding:2px. Een kruisje om een melding weg te klikken is
     precies iets wat je haastig aantikt; 24x24 is het minimum waarop dat
     betrouwbaar lukt. Het kruisje zelf blijft even groot. */
  padding: 0;
  min-width: 24px;
  min-height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
  line-height: 1;
}

.toast-close:hover { color: var(--text-primary); }

.toast-message { font-size: 13px; color: var(--text-secondary); }

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 0 0 12px 12px;
  animation: toastProgress 3.5s linear forwards;
}

.toast-success .toast-progress { background: var(--green); }
.toast-error .toast-progress { background: var(--red); }
.toast-info .toast-progress { background: var(--blue-bright); }

@keyframes toastProgress {
  from { width: 100%; }
  to { width: 0%; }
}

/* ============================================================
   EXPORTS PAGE
   ============================================================ */
.exports-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.export-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px;
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out);
}

.export-card:hover {
  border-color: var(--border-bright);
  transform: translateY(-2px);
  box-shadow: var(--elev-1);
}

.export-filter-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 20px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.export-filter-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.export-filter-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.export-select {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 13px;
  padding: 7px 28px 7px 10px;
  cursor: pointer;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999999' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.export-select:focus { border-color: var(--accent); }
.export-preview-count {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-muted);
  background: var(--bg-card-alt);
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.export-preview-count #export-count-num {
  font-weight: 700;
  color: var(--accent-ink);
}
/* "Featured" used to mean flood-filling the whole card with sand — heavy,
   and the accent-coloured title (.gradient-text) went unreadable against
   an accent-coloured card (same colour on itself). Sand should mark this
   card as primary without becoming its surface: a solid border plus a
   solid-fill icon (icons are an explicitly allowed sand use) does that
   while keeping the card on the same quiet surface as its siblings. */
.export-card-featured {
  border: 1.5px solid var(--accent) !important;
  background: var(--bg-card) !important;
}
.export-card-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(var(--accent-rgb),0.12);
  border: 1px solid rgba(var(--accent-rgb),0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: var(--accent-ink);
}
.export-card-featured .export-card-icon {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.export-includes {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 14px 0 18px;
}
.export-include-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.export-include-item svg { color: var(--green-ink); flex-shrink: 0; }
.export-card { display: flex; flex-direction: column; }
.export-snapshot {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}
.export-snap-item {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
  text-align: center;
}
.export-snap-val {
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 4px;
}
.export-snap-label {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
}
.export-card-stats {
  grid-column: span 1;
}
.export-card-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}

.export-card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
  line-height: 1.5;
}

.rapport-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.rapport-stat {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
}

.rapport-stat-value {
  font-variant-numeric: tabular-nums;
  font-size: 22px;
  font-weight: 700;
  color: var(--accent-ink);
  margin-bottom: 4px;
}

.rapport-stat-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.7px;
}

.rapport-leads-list { margin-top: 16px; }

.rapport-lead-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}

.rapport-lead-item:last-child { border-bottom: none; }

/* ============================================================
   PIPELINE (KANBAN)
   ============================================================ */
    .pipeline-header-bar {
      padding: 0 24px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .pipeline-summary-chips {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .pipeline-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }
    .pipeline-chip-count {
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      font-weight: 700;
      color: var(--accent-ink);
    }
.pipeline-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
  min-height: calc(100vh - 180px);
  align-items: flex-start;
}
.pipeline-board::-webkit-scrollbar { height: 6px; }
.pipeline-board::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.35); border-radius: 4px; }
.pipeline-col {
  flex: 0 0 260px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.pipeline-col-header {
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
}
.pipeline-col-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  padding: 0 5px;
}
.pipeline-col-body {
  flex: 1;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 80px;
}
.pipeline-card {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.pipeline-card:hover {
  border-color: var(--blue-primary);
  transform: translateY(-1px);
}
    .pipeline-card[draggable="true"] { cursor: grab; }
    .pipeline-card[draggable="true"]:active { cursor: grabbing; opacity: 0.7; }
    .pipeline-col.drag-over {
      background: rgba(var(--accent-rgb),0.08);
      border-color: rgba(var(--accent-rgb),0.4) !important;
      outline: 2px dashed rgba(var(--accent-rgb),0.4);
      outline-offset: -4px;
    }
.pipeline-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pipeline-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.pipeline-score {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 20px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.pipeline-card-phone {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 5px;
}
.pipeline-card-date {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
}
.pipeline-col-header.col-new    { border-top: 2px solid #989287; }
.pipeline-col-header.col-qual   { border-top: 2px solid var(--cyan); }
.pipeline-col-header.col-apt    { border-top: 2px solid var(--green); }
.pipeline-col-header.col-won    { border-top: 2px solid var(--accent); }
.pipeline-col-header.col-lost   { border-top: 2px solid var(--red); }

/* ============================================================
   GESPREKKEN (CONVERSATIONS)
   ============================================================ */
.conv-layout {
  display: flex;
  gap: 0;
  height: calc(100vh - 130px);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.conv-list {
  width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

/* Zonder gesprekken stonden er TWEE lege toestanden naast elkaar: links "Nog
   geen gesprekken" met de uitleg en de knoppen, in een kolom van 300px, en
   rechts 913px die vroeg om een gesprek te selecteren dat niet bestaat. De
   nuttige helft kreeg de smalle kant.
   Met deze klasse verdwijnt de rechterhelft en krijgt de lege toestand de hele
   kaart -- één boodschap, op de plek waar je kijkt. */
.conv-layout.leeg .conv-list {
  width: 100%;
  border-right: none;
  justify-content: center;
}
.conv-layout.leeg .conv-list-header { display: none; }
.conv-layout.leeg .conv-detail { display: none; }
.conv-list-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--text-muted);
  flex-shrink: 0;
}
.conv-list-item {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.12s;
}
.conv-list-item:hover { background: var(--bg-card-alt); }
.conv-list-item.active { background: rgba(var(--accent-rgb),0.08); border-left: 3px solid var(--accent); }
.conv-list-item-name {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
}
.conv-list-item-date { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.conv-list-item-preview { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.conv-detail {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.conv-bubble {
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.55;
  max-width: 80%;
  word-break: break-word;
  margin-bottom: 4px;
}
.conv-bubble.user {
  background: var(--accent);
  color: var(--on-accent);
  margin-left: auto;
  border-bottom-right-radius: 4px;
}
.conv-bubble.assistant {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.conv-bubble-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  margin-bottom: 3px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
/* Faro's beoordeling boven het gesprek. Bewust rustig: een rand, een kleine
   kop en een raster. Geen gloed, geen gradient, geen grote mascotte -- dit is
   het paneel waar iemand in twee seconden wil zien of hij moet bellen. */
.faro-lead {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border, #2A3444);
  background: var(--bg-subtle, rgba(255,255,255,.02));
}
.faro-lead__kop {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; letter-spacing: .02em;
  color: var(--text-muted, #999); text-transform: uppercase;
  margin-bottom: 8px;
}
.faro-lead__kop img { flex-shrink: 0; object-fit: contain; }
.faro-lead__reden { margin: 0 0 10px; font-size: 14px; line-height: 1.55; color: var(--text, #E9EEF6); }
.faro-lead__punten { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-bottom: 10px; }
.faro-lead__punt { display: flex; flex-direction: column; gap: 1px; min-width: 96px; }
.faro-lead__label { font-size: 11px; color: var(--text-muted, #999); }
.faro-lead__waarde { font-size: 13px; color: var(--text, #E9EEF6); font-weight: 500; }
.faro-lead__samenvatting { margin: 0 0 10px; font-size: 12px; line-height: 1.55; color: var(--text-muted, #999); }
.faro-lead__deedkop { font-size: 11px; color: var(--text-muted, #999); margin-bottom: 3px; }
.faro-lead__deed ul { margin: 0; padding-left: 16px; }
.faro-lead__deed li { font-size: 12px; line-height: 1.7; color: var(--text-muted, #999); }
.faro-lead__leeg { margin: 0; font-size: 13px; line-height: 1.55; color: var(--text-muted, #999); }
/* Op smal beeld heeft het gesprek voorrang; het paneel mag dan krimpen. */
@media (max-width: 640px) {
  .faro-lead { padding: 11px 14px; }
  .faro-lead__punten { gap: 5px 14px; }
}

/* Een kaart zonder meting. Kleiner en grijs, zodat hij niet leest als een
   getal van nul. */
.stat-value--leeg {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-muted, #999);
  letter-spacing: 0;
}

.conv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.conv-header {
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-card);
}
.conv-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  color: var(--text-muted);
  font-size: 14px;
}
.conv-empty-icon { opacity: 0.3; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }

/* ============================================================
   ANALYSE (ANALYTICS)
   ============================================================ */
.analyse-grid {
  display: grid;
  /* minmax(0,1fr), niet 1fr. Een 1fr-track heeft impliciet min-width:auto en
     kan dus NIET kleiner worden dan zijn breedste kind — één tabel of één lang
     woord duwt de kolom breder dan de pagina. Gemeten op 390px: de track kwam
     uit op 457,7px in een container van 358px, en omdat .page-content
     overflow-x:hidden heeft werd dat niet afgekapt met een scrollbalk maar
     gewoon onzichtbaar afgesneden. */
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  width: 100%;
  overflow: visible;
}
.analyse-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 22px 24px;
}
.analyse-card-full  { grid-column: 1 / -1; }
.analyse-card-span2 { grid-column: span 2; }
.analyse-card-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.funnel-step {
  margin-bottom: 12px;
}
.funnel-step-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}
.funnel-step-label strong { color: var(--text-primary); font-weight: 700; }
.funnel-step-pct {
  font-size: 11px;
  color: var(--text-muted);
}
.funnel-bar {
  height: 10px;
  background: var(--bg-card-alt);
  border-radius: 4px;
  overflow: hidden;
}
.funnel-bar-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--blue-primary), var(--cyan));
  transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
}
.source-table { width: 100%; border-collapse: collapse; }
.source-table th {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  padding: 6px 10px 10px;
  border-bottom: 1px solid var(--border);
  text-align: left;
}
.source-table td {
  font-size: 13px;
  color: var(--text-primary);
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.source-table tr:last-child td { border-bottom: none; }
.analyse-stat-big {
  font-variant-numeric: tabular-nums;
  font-size: 36px;
  font-weight: 800;
  color: var(--accent-ink);
  line-height: 1;
  margin-bottom: 6px;
  text-shadow: 0 0 20px rgba(188,159,95,0.35);
}
.analyse-stat-label {
  font-size: 12px;
  color: var(--text-muted);
}
.analyse-revenue-row {
  display: flex;
  gap: 16px;
  width: 100%;
  margin-bottom: 16px;
}
.analyse-revenue-card {
  flex: 1;
  min-width: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 22px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* Onder 700px passen drie omzetkaarten niet meer naast elkaar.

   Deze regels stonden VOOR .analyse-revenue-card. Een @media-blok verhoogt de
   specificiteit niet, dus bij gelijke specificiteit wint wat later staat -- en
   dat was de flex-verkorting op de kaart hierboven. De kaarten kregen daardoor
   76px op een telefoon van 390px en de tekst erin werd afgekapt, terwijl de
   regel die dat had moeten voorkomen er gewoon stond. Dat is precies de
   cascadeval uit CLAUDE.md, en het is hier al eerder misgegaan met .btn-icon.

   Vandaar: NA de basisregel. Verplaats dit blok niet naar boven. */
@media (max-width: 700px) {
  .analyse-revenue-row { flex-wrap: wrap; }
  .analyse-revenue-row > * { flex: 1 1 100%; }
}

.analyse-revenue-val {
  font-variant-numeric: tabular-nums;
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1;
}
.analyse-revenue-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-top: 6px;
}
.analyse-revenue-sub {
  font-size: 11px;
  color: var(--text-muted);
}
.analyse-verlies-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.analyse-verlies-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-secondary);
}
.analyse-verlies-count {
  font-weight: 700;
  color: var(--text-primary);
}

/* ============================================================
   ROW QUICK ACTIONS (Feature 2)
   ============================================================ */
.row-actions { display: flex; gap: 4px; align-items: center; opacity: 0; transition: opacity 0.15s; }
.leads-table tr:hover .row-actions { opacity: 1; }

/* Touch devices have no hover — without this the call/WhatsApp quick-action
   icons are permanently invisible (opacity: 0 with no way to trigger it),
   so a phone user has no way to know they exist. Same fix as .copy-btn above. */
@media (hover: none) {
  .row-actions { opacity: 0.65; }
}

/* 28x28 is prima voor een muis en te klein voor een duim. Dit zijn juist de
   knoppen die een makelaar op zijn telefoon gebruikt: bellen of WhatsAppen
   vanaf de leadlijst, tussen twee bezichtigingen door. WCAG vraagt 44x44 voor
   aanraken, en de knop groeit hieronder alleen op aanraakschermen -- op een
   muisscherm blijft de rij net zo compact als hij was. */
.row-action-btn {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
  background: var(--bg-card-alt); cursor: pointer; display: flex;
  align-items: center; justify-content: center; font-size: 13px;
  text-decoration: none; color: var(--text-secondary); transition: var(--transition);
}
.row-action-btn:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.1); }

/* ============================================================
   PANEL QUICK ACTIONS (Feature 3)
   ============================================================ */
.panel-quick-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.panel-quick-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: var(--radius-sm);
  border: 1px solid var(--border); background: var(--bg-card-alt);
  color: var(--text-primary); font-size: 12px; font-weight: 500;
  text-decoration: none; cursor: pointer; transition: var(--transition);
  font-family: 'Inter', sans-serif;
}
.panel-quick-btn:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.08); color: var(--accent-ink); }

/* ============================================================
   LEAD AGE BADGES (Feature 4)
   ============================================================ */
.age-chip {
  font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 20px;
  border: 1px solid var(--border);
}
.age-chip.fresh { display: none; }
.age-chip.warm { background: rgba(var(--success-rgb),0.1); color: var(--green-ink); border-color: rgba(var(--success-rgb),0.2); }
.age-chip.cooling { background: rgba(var(--warning-rgb),0.1); color: var(--orange-ink); border-color: rgba(var(--warning-rgb),0.2); }
.age-chip.cold { background: rgba(var(--error-rgb),0.1); color: var(--red-ink); border-color: rgba(var(--error-rgb),0.2); }
.age-badge-table {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px; margin-left: 6px; vertical-align: middle;
}
.age-badge-warm { background: rgba(var(--success-rgb),0.12); color: var(--green-ink); }
.age-badge-cooling { background: rgba(var(--warning-rgb),0.12); color: var(--orange-ink); }
.age-badge-cold { background: rgba(var(--error-rgb),0.12); color: var(--red-ink); }

/* ============================================================
   REVENUE GOAL CARD (Feature 5)
   ============================================================ */
.revenue-goal-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px 20px; margin-bottom: 16px;
  position: relative; overflow: hidden;
}
.revenue-goal-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px;
  background: var(--accent);
}
.revenue-goal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.revenue-goal-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.revenue-goal-sub { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.revenue-goal-edit { background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.5; transition: opacity 0.15s; }
.revenue-goal-edit:hover { opacity: 1; }
.revenue-goal-amounts { display: flex; align-items: baseline; gap: 6px; margin-bottom: 12px; }
.revenue-goal-current { font-size: 28px; font-weight: 800; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.revenue-goal-slash { font-size: 18px; color: var(--text-muted); }
.revenue-goal-target { font-size: 16px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.revenue-goal-bar-wrap { height: 6px; background: var(--bg-card-alt); border-radius: 4px; overflow: hidden; margin-bottom: 8px; border: 1px solid var(--border); }
.revenue-goal-bar { height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--accent), var(--blue-bright)); transition: width 0.6s cubic-bezier(0.4,0,0.2,1); }
.revenue-goal-pct { font-size: 12px; color: var(--text-secondary); }

/* ============================================================
   INSTELLINGEN (SETTINGS)
   ============================================================ */
/* ── Formulier page ───────────────────────────────────────────────────── */
.fm-wrap { width: 100%; padding: 24px 0; display: flex; flex-direction: column; gap: 18px; }

/* Form stats */
.fm-stats {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.fm-stat-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
  padding: 16px 18px;
  display: flex; flex-direction: column; gap: 4px;
}
.fm-stat-num {
  font-size: 28px; font-weight: 700; color: var(--text-primary);
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.fm-stat-lbl {
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .04em;
}
.fm-stat-delta {
  font-size: 11px; color: var(--text-muted); margin-top: 4px; min-height: 14px;
}
.fm-stat-delta.up   { color: var(--green-ink); }
.fm-stat-delta.down { color: var(--red-ink); }

/* Code actions row (Kopieer + Stuur naar developer side by side) */
.fm-code-actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.fm-code-actions .fm-btn { flex: 1; min-width: 130px; }

.fm-hero {
  background: rgba(var(--accent-rgb),.06);
  border: 1px solid rgba(var(--accent-rgb),.2); border-radius: 16px; padding: 24px 26px;
}
.fm-hero-top { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 16px; }
.fm-hero-icon { font-size: 32px; line-height: 1; }
.fm-hero-text { flex: 1; min-width: 0; }
.fm-hero-title { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-primary); }
.fm-hero-sub { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
.fm-url-row { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap; margin-bottom: 12px; }
.fm-url {
  flex: 1; min-width: 220px; padding: 11px 14px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  color: var(--accent-ink); font-family: monospace; font-size: 13px;
  display: flex; align-items: center;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.fm-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; color: var(--text-primary); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .15s ease; font-family: inherit; text-decoration: none;
}
.fm-btn:hover { border-color: var(--accent-bright); }
.fm-btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-bright)); border-color: transparent; color: var(--on-accent); }
.fm-btn-primary:hover { opacity: .9; }
.fm-btn-full { width: 100%; justify-content: center; margin-top: 8px; }

.fm-share-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.fm-share-lbl { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.fm-share-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 11px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text-muted); font-size: 12px; font-weight: 600;
  text-decoration: none; cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.fm-share-btn:hover { color: var(--accent-ink); border-color: var(--accent-bright); }
.fm-share-btn[id="fm-share-wa"]:hover     { color: #25d366; border-color: #25d366; }
.fm-share-btn[id="fm-share-linkedin"]:hover { color: #0a66c2; border-color: #0a66c2; }

.fm-options-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr));
  gap: 16px;
}
.fm-option-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px 22px; display: flex; flex-direction: column;
}
/* ── De kop van een integratiekaart ───────────────────────────────────────
   Het label AANBEVOLEN stond hier op position:absolute met top:-6px en right:-6px
   in een position:relative kop. Dat werkt zolang de titel kort is; is hij dat
   niet, dan gaat het label er gewoon overheen liggen. Gemeten op het echte
   scherm: "Floating WhatsApp button on your site" werd voor 66% bedekt door
   "RECOMMENDED" -- twee woorden over elkaar, precies op de kaart die de klant
   moet lezen om te kiezen hoe hij het formulier op zijn site zet.

   En het wordt erger per taal, niet beter: het label is vertaald, en
   "AANBEVOLEN" is langer dan "RECOMMENDED". Een absolute plaatsing kan daar
   niet op meebewegen, want ze weet niet hoe breed de buurman is.

   Nu een raster. Het label krijgt een eigen kolom naast de titel, de
   onderregel loopt onder allebei door. De titel kan dan nooit onder het label
   komen, in geen enkele taal en bij geen enkele lengte -- het raster geeft ze
   allebei hun eigen ruimte in plaats van ze op dezelfde plek te leggen.

   Kaarten zonder label doen gewoon mee: die vullen kolom 1 en laten kolom 2
   leeg, wat op auto nul breed is. */
.fm-option-hdr {
  margin-bottom: 12px;
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: 10px;
  row-gap: 4px;
  align-items: start;
}
.fm-option-rec {
  grid-column: 2; grid-row: 1;
  justify-self: end;
  background: rgba(var(--success-rgb),.15); color: var(--green-ink);
  font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px;
  text-transform: uppercase; letter-spacing: .04em;
  border: 1px solid rgba(var(--success-rgb),.3);
  /* Het label mag zelf niet afbreken; het is twee woorden en een afgebroken
     keurmerk leest als een fout. De titel ernaast mag dat wel. */
  white-space: nowrap;
}
.fm-option-title {
  grid-column: 1; grid-row: 1;
  /* Zonder dit weigert een rasteritem smaller te worden dan zijn langste
     woord, en duwt een lange titel het label alsnog van de kaart af. */
  min-width: 0;
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}
.fm-option-sub {
  grid-column: 1 / -1; grid-row: 2;
  font-size: 12px; color: var(--text-muted); line-height: 1.55; margin: 0;
}
.fm-code {
  width: 100%; padding: 11px 12px; background: var(--bg-card-alt);
  border: 1px solid var(--border); border-radius: 8px;
  color: var(--text-primary); font-family: monospace; font-size: 12px; line-height: 1.5;
  resize: none; outline: none; white-space: pre;
}
.fm-code:focus { border-color: var(--accent-bright); }
.fm-instructions {
  margin-top: 12px; font-size: 11px; color: var(--text-muted); line-height: 1.55;
  padding: 10px 12px; background: var(--bg-card-alt); border-radius: 8px;
  border-left: 3px solid var(--accent-bright);
}
.fm-instructions strong { color: var(--text-primary); }
.fm-instructions code {
  background: rgba(var(--accent-rgb),.12); color: var(--accent-ink);
  padding: 1px 5px; border-radius: 4px; font-size: 11px;
}

/* Installation guide accordion */
.fm-guide-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 22px 24px;
}
.fm-guide-hdr { margin-bottom: 12px; }
.fm-guide-item {
  border-top: 1px solid var(--border);
  margin: 0 -24px;
}
.fm-guide-item:last-of-type { border-bottom: 1px solid var(--border); margin-bottom: 14px; }
.fm-guide-item summary {
  cursor: pointer; list-style: none;
  padding: 14px 24px;
  display: flex; align-items: center; gap: 10px;
  user-select: none;
  font-size: 14px; font-weight: 600; color: var(--text-primary);
  transition: background .15s ease;
}
.fm-guide-item summary::-webkit-details-marker { display: none; }
.fm-guide-item summary::after {
  content: ''; margin-left: auto;
  width: 8px; height: 8px;
  border-right: 2px solid var(--text-muted); border-bottom: 2px solid var(--text-muted);
  transform: rotate(-45deg); transition: transform .2s ease;
}
.fm-guide-item[open] summary::after { transform: rotate(45deg); }
.fm-guide-item summary:hover { background: var(--bg-card-alt); }
.fm-guide-item[open] summary { background: rgba(var(--accent-rgb),.06); color: var(--accent-ink); }
.fm-guide-emoji { font-size: 18px; line-height: 1; }
.fm-guide-label { flex: 1; }
.fm-guide-meta { font-size: 11px; font-weight: 500; color: var(--text-muted); font-style: italic; }
.fm-guide-body {
  padding: 4px 24px 20px;
  font-size: 13px; color: var(--text-primary); line-height: 1.65;
}
.fm-guide-body p { margin: 8px 0; }
.fm-guide-body p strong { color: var(--text-primary); }
.fm-guide-body ol { padding-left: 22px; margin: 8px 0; }
.fm-guide-body ol li { margin-bottom: 6px; color: var(--text-primary); }
.fm-guide-body ol li strong { color: var(--accent-ink); font-weight: 600; }
.fm-guide-body code {
  background: var(--bg-card-alt); color: var(--accent-ink);
  padding: 1px 6px; border-radius: 4px; font-size: 12px; font-family: monospace;
}
.fm-guide-tip {
  margin-top: 12px; padding: 10px 14px; border-radius: 8px;
  background: rgba(var(--warning-rgb),.08); border-left: 3px solid var(--warning);
  font-size: 12px; color: var(--text-primary); line-height: 1.55;
}
.fm-guide-tip strong { color: var(--warning-ink); font-weight: 700; }
.fm-guide-test {
  margin-top: 14px; padding: 14px 16px;
  background: rgba(var(--success-rgb),.08); border: 1px solid rgba(var(--success-rgb),.25);
  border-radius: 10px;
  font-size: 13px; color: var(--text-primary); line-height: 1.6;
}
.fm-guide-test strong { display: block; color: var(--green-ink); margin-bottom: 4px; font-weight: 700; }

.fm-bottom-grid {
  display: grid; grid-template-columns: 280px 1fr; gap: 16px; align-items: start;
}
@media (max-width: 900px) { .fm-bottom-grid { grid-template-columns: 1fr; } }
.fm-qr-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px; display: flex; flex-direction: column; align-items: stretch;
}
.fm-qr-frame {
  background: #fff; padding: 16px; border-radius: 12px; margin: 14px 0 8px;
  display: flex; align-items: center; justify-content: center;
}
.fm-preview-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px;
  padding: 20px; display: flex; flex-direction: column;
}
.fm-iframe-wrap {
  margin-top: 12px; height: 560px; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--border); background: var(--bg-card-alt);
}
.fm-iframe-wrap iframe { width: 100%; height: 100%; border: 0; display: block; }

/* ── Onboarding "Klaar!" celebration overlay ──────────────────────────── */
#onb-done-overlay {
  position: fixed; inset: 0;
  background: rgba(15,12,5,.92); backdrop-filter: blur(10px);
  z-index: 2500;
  display: none; align-items: center; justify-content: center;
  padding: 24px;
}
#onb-done-overlay.open { display: flex; animation: onbFade .35s ease; }
@keyframes onbFade { from { opacity: 0; } to { opacity: 1; } }
.onb-done-card {
  width: 100%; max-width: 520px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 18px;
  padding: 36px 32px;
  text-align: center;
  box-shadow: var(--elev-3);
  animation: onbPop .45s cubic-bezier(.34,1.56,.64,1);
}
@keyframes onbPop { from { opacity: 0; transform: translateY(20px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
.onb-done-icon { font-size: 56px; margin-bottom: 12px; animation: onbBounce .8s ease infinite alternate; }
@keyframes onbBounce { from { transform: translateY(0); } to { transform: translateY(-6px); } }
.onb-done-title { margin: 0 0 6px; font-size: 24px; font-weight: 700; color: var(--text-primary); }
.onb-done-sub { margin: 0 0 22px; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
.onb-done-url-card {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px 16px; margin-bottom: 20px;
  text-align: left;
}
.onb-done-url-lbl {
  font-size: 10px; font-weight: 700; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: .08em; margin-bottom: 6px;
}
.onb-done-url {
  display: block; font-family: monospace; font-size: 13px; color: var(--accent-ink);
  background: var(--bg-primary); padding: 8px 11px; border-radius: 6px;
  margin-bottom: 10px; word-break: break-all;
}
.onb-done-copy {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--accent-bright); border: none; border-radius: 6px;
  padding: 7px 12px; color: var(--on-accent); font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: inherit;
}
.onb-done-copy:hover { opacity: .9; }
.onb-done-steps { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; text-align: left; }
.onb-done-step {
  display: flex; align-items: center; gap: 10px;
  background: rgba(var(--accent-rgb),.06); border-radius: 8px; padding: 10px 14px;
  font-size: 13px; color: var(--text-primary);
}
.onb-done-step-num {
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--accent-bright); color: var(--on-accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
}
.onb-done-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.onb-done-btn {
  flex: 1; min-width: 180px; padding: 12px 16px;
  border-radius: 10px; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.onb-done-btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-bright));
  border: none; color: var(--on-accent);
}
.onb-done-btn-primary:hover { opacity: .9; }
.onb-done-btn-secondary {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  color: var(--text-primary);
}
.onb-done-btn-secondary:hover { border-color: var(--accent-bright); color: var(--accent-ink); }

/* ── Dashboard form-link banner ───────────────────────────────────────── */
.dash-formlink {
  display: flex; align-items: center; gap: 12px;
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
  padding: 12px 16px; margin-bottom: 16px;
  flex-wrap: wrap;
}
.dash-formlink-icon { font-size: 20px; line-height: 1; }
.dash-formlink-body { flex: 1; min-width: 200px; display: flex; flex-direction: column; gap: 2px; }
.dash-formlink-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.dash-formlink-url {
  font-family: monospace; font-size: 12px; color: var(--accent-ink);
  background: var(--bg-card-alt); padding: 5px 9px; border-radius: 6px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  display: inline-block; max-width: 100%;
}
.dash-formlink-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.dash-formlink-btn {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 6px;
  padding: 6px 10px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); text-decoration: none; cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.dash-formlink-btn:hover { color: var(--accent-ink); border-color: var(--accent-bright); }

/* ── Trial banner. Hidden by default (display:none inline in the HTML) —
   only shown once loadPlanStatus() confirms this client is on trial or
   expired. See TRIAL-DESIGN.md and api/leads.js's plan-status mode. Two
   colour states via a modifier class: .trial (accent, informative) and
   .expired (amber, "non-alarming" per TRIAL-DESIGN.md §3 — never red/error
   styling, leads are still being captured). ─────────────────────────────── */
.dash-trial-banner {
  display: flex; align-items: center; gap: 12px;
  border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
  flex-wrap: wrap;
}
.dash-trial-banner.trial {
  background: rgba(var(--accent-rgb), .08); border: 1px solid rgba(var(--accent-rgb), .25);
}
.dash-trial-banner.expired {
  background: rgba(var(--warning-rgb), .08); border: 1px solid rgba(var(--warning-rgb), .25);
}
.dash-trial-banner-icon { font-size: 20px; line-height: 1; }
.dash-trial-banner-body { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.dash-trial-banner-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.dash-trial-banner-sub { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.dash-trial-banner-cta {
  display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
  background: var(--accent); color: var(--bg-primary); border: none; border-radius: 6px;
  padding: 8px 14px; font-size: 12px; font-weight: 700;
  text-decoration: none; cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.dash-trial-banner-cta:hover { background: var(--accent-hover); }

/* ── Email-verification banner. Hidden by default (display:none inline) —
   only shown once loadOnboardingChecklist() confirms config-get's
   emailVerified is explicitly false (fails open: absent/blank Airtable
   field or a pre-existing client both read as verified, see api/_verify.js).
   Separate from the onboarding checklist card below on purpose: dismissing
   the checklist is meant to be "I've got the gist, hide the getting-started
   card", but an unverified email is a standing account-recovery risk
   (password-reset is gated on it) — it deserves its own quiet nudge that
   survives a checklist dismiss, not a fully separate visual language, so it
   reuses the trial banner's ".expired" amber treatment (non-alarming, same
   "gentle attention" register per TRIAL-DESIGN.md §3, never red/error). ── */
.dash-verify-banner {
  display: flex; align-items: center; gap: 12px;
  border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
  flex-wrap: wrap;
  background: rgba(var(--warning-rgb), .08); border: 1px solid rgba(var(--warning-rgb), .25);
}
.dash-verify-banner-icon { font-size: 20px; line-height: 1; }
.dash-verify-banner-body { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 2px; }
.dash-verify-banner-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.dash-verify-banner-sub { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.dash-verify-banner-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dash-verify-banner-cta {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--warning-c); color: var(--bg-primary); border: none; border-radius: 6px;
  padding: 8px 14px; font-size: 12px; font-weight: 700;
  cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.dash-verify-banner-cta:hover { opacity: .88; }
.dash-verify-banner-cta:disabled { opacity: .5; cursor: not-allowed; }
.dash-verify-banner-close {
  background: none; border: none; color: var(--text-muted); font-size: 18px;
  line-height: 1; cursor: pointer; padding: 4px 6px; border-radius: 6px; font-family: inherit;
}
.dash-verify-banner-close:hover { background: rgba(var(--warning-rgb), .12); color: var(--text-primary); }

/* ── Onboarding checklist card. Hidden by default — loadOnboardingChecklist()
   reveals it only when there is real, derived work left to do, and it hides
   itself again the instant every item is done OR the client dismisses it.
   Card, not a banner strip (this one carries 5 rows), so it borrows the
   stat-card surface treatment (--bg-card / --border / --shadow-card) rather
   than the thin colour-tinted banner style above. ─────────────────────── */
.dash-checklist {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px 20px 8px; margin-bottom: 16px; box-shadow: var(--edge-hi), var(--shadow-card);
}
.dash-checklist-head { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.dash-checklist-title-wrap { flex: 1; min-width: 160px; }
.dash-checklist-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.dash-checklist-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.dash-checklist-progress-bar {
  width: 120px; height: 6px; border-radius: 999px; background: var(--bg-card-alt);
  overflow: hidden; flex-shrink: 0;
}
.dash-checklist-progress-fill {
  height: 100%; background: var(--grad-gold); border-radius: 999px;
  transition: width var(--dur-base, .25s) var(--ease-out, ease);
}
.dash-checklist-close {
  background: none; border: none; color: var(--text-muted); font-size: 18px;
  line-height: 1; cursor: pointer; padding: 4px 6px; border-radius: 6px; font-family: inherit;
  flex-shrink: 0;
}
.dash-checklist-close:hover { background: var(--bg-card-alt); color: var(--text-primary); }
.dash-checklist-items { display: flex; flex-direction: column; }
.chk-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 0;
  border-top: 1px solid var(--divider);
}
/* Drie waarden per accent, niet twee: de VULLING (--a), het zachte vlak
   (--a-soft) waar het bolletje op staat, en de INKT (--a-ink) waarin het
   teken erin geschreven wordt.

   Er stonden er twee, en het bolletje gebruikte de vulling als letterkleur.
   Gemeten in het lichte thema: het groene rondje van een nog niet afgevinkte
   stap kwam uit op 2,95:1 -- #16A34A op #E8F6ED. Dat is precies de regel uit
   CLAUDE.md, en dit is de derde plek waar hij misging. De afgevinkte variant
   hieronder was al eerder gerepareerd; de NIET-afgevinkte niet, en die is
   degene die je het vaakst ziet. */
.chk-item[data-accent="blue"]    { --a: var(--c-blue);    --a-soft: var(--c-blue-soft);    --a-ink: var(--neutral-ink); }
.chk-item[data-accent="gold"]    { --a: var(--c-gold);    --a-soft: var(--c-gold-soft);    --a-ink: var(--accent-ink); }
.chk-item[data-accent="purple"]  { --a: var(--c-purple);  --a-soft: var(--c-purple-soft);  --a-ink: var(--neutral-ink); }
.chk-item[data-accent="cyan"]    { --a: var(--c-cyan);    --a-soft: var(--c-cyan-soft);    --a-ink: var(--neutral-ink); }
.chk-item[data-accent="emerald"] { --a: var(--c-emerald); --a-soft: var(--c-emerald-soft); --a-ink: var(--success-ink); }
.chk-item-icon {
  flex: 0 0 auto; width: 26px; height: 26px; display: grid; place-items: center;
  border-radius: 50%; background: var(--a-soft, var(--bg-card-alt));
  color: var(--a-ink, var(--text-muted));
  font-size: 13px; font-weight: 700;
}
/* Vulling en inkt uit elkaar: --c-emerald is de VULkleur en haalde als vinkje
   op de zachte groene pil 2,95:1 in het lichte thema. --success-ink is
   dezelfde kleur, afgestemd om als letter te lezen (#166534 in licht). */
.chk-item.chk-done .chk-item-icon { background: var(--c-emerald-soft); color: var(--success-ink); }
.chk-item-body { flex: 1; min-width: 160px; }
.chk-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.chk-item.chk-done .chk-item-title { color: var(--text-muted); text-decoration: line-through; text-decoration-color: var(--border); }
.chk-item-sub { font-size: 12px; color: var(--text-muted); margin-top: 1px; line-height: 1.4; }
.chk-item-action {
  flex-shrink: 0; background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 12px; font-size: 12px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.chk-item-action:hover { border-color: var(--a, var(--accent-bright)); color: var(--a, var(--accent-bright)); }
.chk-whatsapp {
  display: flex; align-items: flex-start; gap: 12px; padding: 12px 0 14px;
  border-top: 1px solid var(--divider); margin-top: 2px;
}
.chk-whatsapp-icon { flex: 0 0 auto; font-size: 18px; line-height: 1.3; }
.chk-whatsapp-body { flex: 1; min-width: 160px; }
.chk-whatsapp-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.chk-whatsapp-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; line-height: 1.5; }
.chk-whatsapp-action {
  flex-shrink: 0; align-self: center; background: none; border: 1px solid var(--border); border-radius: 8px;
  padding: 7px 12px; font-size: 12px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; font-family: inherit; text-decoration: none; display: inline-flex; align-items: center;
  transition: all .15s ease;
}
.chk-whatsapp-action:hover { border-color: var(--accent-bright); color: var(--accent-ink); }
@media (max-width: 640px) {
  .dash-checklist-head { flex-wrap: wrap; }
  .dash-checklist-progress-bar { order: 3; width: 100%; }
  .chk-item { flex-wrap: wrap; }
  .chk-item-action { margin-left: 38px; }
}

/* ── "Vertel over je bedrijf" modal — reuses the founder-modal-overlay
   visual language (dim scrim + centered elevated panel) already used for
   the pipeline/goal modals, so this doesn't invent a second modal system. */
.chk-biz-modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 950;
  display: none; align-items: center; justify-content: center; padding: 20px;
}
.chk-biz-modal-overlay.open { display: flex; }
.chk-biz-modal {
  background: var(--card-elevated); border: 1px solid var(--border); border-radius: 16px;
  padding: 26px 26px 20px; width: 100%; max-width: 540px; max-height: 88vh; overflow-y: auto;
  box-shadow: var(--elev-3);
}
.chk-biz-modal-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.chk-biz-modal-intro { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin-bottom: 20px; }
.chk-biz-field { margin-bottom: 16px; }
.chk-biz-field label { display: block; font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 5px; }
.chk-biz-field-hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
.chk-biz-field textarea {
  width: 100%; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 12px; font-size: 13px; font-family: inherit; color: var(--text-primary);
  resize: vertical; min-height: 64px; transition: border-color .15s ease;
}
.chk-biz-field textarea:focus { outline: none; border-color: var(--accent); }
.chk-biz-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.chk-biz-cancel {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 18px; font-size: 13px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; font-family: inherit;
}
.chk-biz-save {
  background: linear-gradient(135deg, var(--accent), var(--accent-bright)); border: none; border-radius: 10px;
  padding: 10px 18px; font-size: 13px; font-weight: 700; color: var(--on-accent);
  cursor: pointer; font-family: inherit;
}
.chk-biz-save:disabled { opacity: .6; cursor: not-allowed; }

/* ── AI Persoonlijkheid page ──────────────────────────────────────────── */
.ap-wrap { width: 100%; padding: 24px 0; }
.ap-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 28px; align-items: start; }
@media (max-width: 1100px) { .ap-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px)  { .ap-grid { gap: 18px; } }
/* min-width:0 om dezelfde reden als hierboven: een flex-item weigert standaard
   onder zijn min-content-breedte te krimpen. */
.ap-form-col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
.ap-form-col > *, .ap-side-col > * { min-width: 0; max-width: 100%; }
.ap-welcome-banner {
  display: flex; gap: 14px; align-items: flex-start;
  background: linear-gradient(135deg, rgba(var(--success-rgb),.10), rgba(var(--success-rgb),.02));
  border: 1px solid rgba(var(--success-rgb),.3); border-radius: 14px;
  padding: 18px 22px; margin-bottom: 18px;
  animation: apWelcomePop .35s ease;
}
@keyframes apWelcomePop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
.ap-welcome-icon { font-size: 28px; line-height: 1; }
.ap-welcome-body { flex: 1; min-width: 0; }
.ap-welcome-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.ap-welcome-sub { font-size: 12px; color: var(--text-muted); line-height: 1.55; }
.ap-welcome-sub b { color: var(--text-primary); font-weight: 600; }
.ap-welcome-checks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.ap-welcome-chk {
  display: inline-flex; align-items: center; gap: 5px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 9px;
  font-size: 11px; font-weight: 600; color: var(--text-muted);
  transition: all .15s ease;
}
.ap-welcome-chk.done { color: var(--green-ink); border-color: rgba(var(--success-rgb),.4); }
.ap-welcome-chk.done .ap-welcome-chk-icon { color: var(--green-ink); }
.ap-welcome-chk-icon { font-size: 12px; }
.ap-hero { background: rgba(var(--accent-rgb),.06); border: 1px solid rgba(var(--accent-rgb),.2); border-radius: 14px; padding: 22px 24px; }
.ap-hero-title { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: var(--text-primary); }
.ap-hero-sub { margin: 0; font-size: 13px; color: var(--text-muted); line-height: 1.55; }
.ap-field { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; }
.ap-label { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
.ap-label-hint { font-size: 11px; font-weight: 400; color: var(--text-muted); }
.ap-input, .ap-textarea {
  width: 100%; padding: 10px 12px; background: var(--bg-card-alt);
  border: 1px solid var(--border); border-radius: 8px;
  color: var(--text-primary); font-size: 13px; font-family: inherit; outline: none;
  transition: border-color .15s ease;
}
.ap-lang-row { display: flex; gap: 8px; flex-wrap: wrap; }
.ap-lang-opt {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; padding: 9px 13px;
  /* 35px hoog gemeten. Boven de 24 die WCAG vraagt, maar onder wat je met
     een duim comfortabel raakt naast een tweede optie ernaast. */
  min-height: 44px;
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  cursor: pointer; transition: all .15s ease;
}
.ap-lang-opt:hover { border-color: var(--accent-bright); }
.ap-lang-opt input[type="radio"] { margin: 0; flex-shrink: 0; cursor: pointer; accent-color: var(--accent); width: 18px; height: 18px; }
.ap-lang-opt:has(input:checked) {
  background: rgba(var(--accent-rgb),.15);
  border-color: var(--accent-bright);
  color: var(--accent-ink);
}
/* Gemeten op 390px: dit label was 320 breed en 16 HOOG. Het hokje eromheen
   16x16, het aanvinkgebied dus een streepje van zestien pixels. WCAG 2.5.8
   vraagt 24x24 als ondergrens en dit zat eronder; op een telefoon mis je hem
   gewoon. De rij is een label dat het hokje omvat, dus hoogte geven kost
   niets aan de opmaak en maakt het hele lint aanraakbaar. */
.ap-checkbox-row { display: flex; align-items: center; gap: 10px; min-height: 44px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-primary); }
/* De browser tekent een keuzerondje van 13px en een vinkje van 16px. Klein om
   te zien en klein om te raken; accent-color zet ze meteen in de merkkleur in
   plaats van in Chrome-blauw.

   Beide selectors bestonden al -- ik zette er eerst een tweede regel naast en
   die verdween stil onder de bestaande (zelfde specificiteit, de andere stond
   later). Gemeten bleef het vinkje gewoon 16x16. Dus: de bestaande regels
   aangepast, geen nieuwe ernaast. */
.ap-checkbox-row input[type="checkbox"] { margin: 0; flex-shrink: 0; cursor: pointer; accent-color: var(--accent); width: 18px; height: 18px; }
.ap-color-row { display: flex; gap: 8px; align-items: stretch; }
.ap-color-input { flex: 1; font-family: monospace; text-transform: uppercase; }
.ap-color-swatch {
  width: 44px; padding: 0; border: 1px solid var(--border); border-radius: 8px;
  background: transparent; cursor: pointer; appearance: none; -webkit-appearance: none;
}
.ap-color-swatch::-webkit-color-swatch-wrapper { padding: 4px; }
.ap-color-swatch::-webkit-color-swatch { border: none; border-radius: 4px; }
.ap-input:focus, .ap-textarea:focus { border-color: var(--accent-bright); }
.ap-textarea { resize: vertical; min-height: 70px; line-height: 1.55; }
.ap-hint { font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.5; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ap-hint em { color: var(--text-primary); font-style: normal; font-weight: 600; }
/* Deze chips zetten {naam}, {bedrijf} enzovoort in het welkomstbericht. Ze
   waren 19px hoog met 2px padding -- onder de 24x24 van WCAG 2.5.8, en op een
   telefoon is een rij van vier zulke blokjes naast elkaar een loterij.

   Hoogte via padding en niet via min-height, want ze staan in een regel tekst
   (.ap-hint) en moeten daarin blijven meelopen. */
.ap-chip {
  background: rgba(var(--accent-rgb),.12); border: 1px solid rgba(var(--accent-rgb),.25);
  color: var(--accent-ink); padding: 5px 9px; border-radius: 6px;
  font-size: 11px; font-weight: 600; cursor: pointer; font-family: monospace;
  transition: all .15s ease;
}
@media (max-width: 600px) {
  /* Op een telefoon is de duim het aanwijsapparaat, dus daar helemaal naar
     boven de grens. De regel eromheen krijgt wat meer lucht zodat twee chips
     onder elkaar niet tegen elkaar aan komen te liggen. */
  .ap-chip { padding: 8px 12px; font-size: 12px; }
  .ap-hint { gap: 8px; line-height: 1.9; }
}
.ap-chip:hover { background: rgba(var(--accent-rgb),.25); color: var(--text); }

/* AI photo file picker */
.ap-photo-row {
  display: flex; align-items: center; gap: 16px;
  padding: 4px 0;
}
.ap-photo-preview {
  width: 84px; height: 84px; border-radius: 50%;
  background: var(--bg-card-alt); border: 2px dashed var(--border);
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; flex-shrink: 0;
  position: relative;
  transition: border-color .15s ease;
}
.ap-photo-preview.has-photo { border-style: solid; border-color: var(--accent); }
.ap-photo-preview img { width: 100%; height: 100%; object-fit: cover; }
.ap-photo-placeholder {
  font-size: 28px; font-weight: 300; color: var(--text-muted);
}
.ap-photo-controls {
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}
.ap-btn-secondary {
  background: rgba(var(--accent-rgb),.10); color: var(--accent-ink);
  border: 1px solid rgba(var(--accent-rgb),.30); padding: 8px 14px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  transition: all .15s ease; font-family: inherit;
}
.ap-btn-secondary:hover { background: rgba(var(--accent-rgb),.20); }
.ap-btn-link {
  background: transparent; color: var(--text-muted); border: 0;
  font-size: 12px; cursor: pointer; padding: 4px 0;
  text-decoration: underline; font-family: inherit;
}
.ap-btn-link:hover { color: var(--red, var(--error)); }
.ap-photo-advanced {
  margin-top: 10px; font-size: 12px;
}
.ap-photo-advanced summary {
  cursor: pointer; color: var(--text-muted); padding: 4px 0;
  user-select: none;
}
.ap-photo-advanced summary:hover { color: var(--accent-ink); }
.ap-photo-advanced[open] summary { margin-bottom: 8px; }

/* Template inspiration library */
.ap-tpl-wrap { margin-bottom: 12px; }
.ap-tpl-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.ap-tpl-title { font-size: 11px; font-weight: 700; color: var(--accent-ink); text-transform: uppercase; letter-spacing: .06em; }
.ap-tpl-sub { font-size: 11px; color: var(--text-muted); }
.ap-tpl-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}
.ap-tpl-card {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; padding: 10px 12px; cursor: pointer;
  transition: all .15s ease; text-align: left; font-family: inherit;
  display: flex; flex-direction: column; gap: 4px; min-height: 72px;
}
.ap-tpl-card:hover {
  border-color: var(--accent-bright);
  background: rgba(var(--accent-rgb),.06);
  transform: translateY(-1px);
}
.ap-tpl-card.active {
  border-color: var(--accent-bright);
  background: rgba(var(--accent-rgb),.12);
}
.ap-tpl-card.recommended {
  border-color: rgba(var(--success-rgb),.5);
  background: rgba(var(--success-rgb),.05);
  position: relative; padding-top: 22px;
}
.ap-tpl-card-rec {
  position: absolute; top: 4px; left: 8px; right: 8px;
  font-size: 9px; font-weight: 700; color: var(--green-ink);
  text-transform: uppercase; letter-spacing: .04em;
}
.ap-tpl-card-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; color: var(--text-primary);
}
.ap-tpl-card-emoji { font-size: 13px; }
.ap-tpl-card-preview {
  font-size: 11px; color: var(--text-muted); line-height: 1.45;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ap-actions { display: flex; align-items: center; gap: 12px; padding-top: 4px; }
.ap-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 10px 16px; background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; color: var(--text-primary); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all .15s ease; font-family: inherit;
}
.ap-btn:hover { border-color: var(--accent-bright); }
.ap-btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-bright)); border-color: transparent; color: var(--on-accent); }
.ap-btn-primary:hover { opacity: .9; }
.ap-btn:disabled { opacity: .5; cursor: not-allowed; }
.ap-saved-mark { font-size: 12px; color: var(--green-ink); opacity: 0; transition: opacity .25s ease; }
.ap-saved-mark.visible { opacity: 1; }

.ap-preview-col { position: relative; }
.ap-preview-sticky { position: sticky; top: 80px; display: flex; flex-direction: column; gap: 16px; }
.ap-preview-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ap-phone-mock {
  background: #0a1a17; border-radius: 12px; overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  display: flex; flex-direction: column; max-height: 520px;
}
.ap-phone-hdr { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #1f2c2a; border-bottom: 1px solid rgba(255,255,255,.05); }
.ap-phone-back { color: #9B968B; font-size: 22px; line-height: 1; }
.ap-phone-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--accent); color: var(--on-accent);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px;
}
.ap-phone-info { flex: 1; min-width: 0; }
.ap-phone-name { font-size: 14px; font-weight: 600; color: #fff; }
.ap-phone-status { font-size: 11px; color: #9B968B; }
.ap-phone-msgs {
  flex: 1; padding: 16px;
  background: #0e1d1b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M20 20h.01' stroke='%23ffffff09' stroke-width='2'/%3E%3C/svg%3E");
  display: flex; flex-direction: column; gap: 8px; overflow-y: auto;
}
.ap-msg-day-divider { align-self: center; background: rgba(255,255,255,.06); color: #9B968B; font-size: 11px; padding: 3px 10px; border-radius: 999px; margin-bottom: 4px; }
.ap-msg {
  max-width: 80%; padding: 8px 12px; border-radius: 8px;
  font-size: 14px; line-height: 1.4; color: #e8edec;
  white-space: pre-wrap; word-wrap: break-word;
}
.ap-msg-them { align-self: flex-start; background: #1f2c2a; border-bottom-left-radius: 2px; }

.ap-formlink-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ap-formlink-url-row { display: flex; gap: 8px; margin-top: 12px; align-items: stretch; }
.ap-formlink-url {
  flex: 1; min-width: 0; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 8px;
  color: var(--accent-ink); font-size: 12px; font-family: monospace;
  display: flex; align-items: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ap-formlink-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.ap-formlink-link {
  display: inline-flex; align-items: center; gap: 5px;
  background: transparent; border: 1px solid var(--border); border-radius: 6px;
  padding: 6px 10px; font-size: 12px; font-weight: 600;
  color: var(--text-muted); text-decoration: none; cursor: pointer; font-family: inherit;
  transition: all .15s ease;
}
.ap-formlink-link:hover { color: var(--accent-ink); border-color: var(--accent-bright); }
.ap-formlink-qr {
  margin-top: 12px; padding: 14px; background: #fff; border-radius: 10px;
  display: flex; flex-direction: column; align-items: center;
}
.ap-formlink-qr img { display: block; }
.ap-formlink-embed { margin-top: 12px; }
.ap-formlink-embed-code {
  font-family: monospace; font-size: 11px; line-height: 1.5;
  resize: none; white-space: pre; min-height: auto;
}
.ap-test-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
.ap-test-title { font-size: 14px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.ap-test-sub { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; line-height: 1.5; }
.ap-test-row { display: flex; gap: 8px; }
.ap-test-row .ap-input { flex: 1; }
.ap-test-result { font-size: 12px; margin-top: 10px; min-height: 16px; }
.ap-test-result.ok  { color: var(--green-ink); }
.ap-test-result.err { color: var(--red-ink); }

/* ── AI-beeld page (Phase 4 property images) ─────────────────────────────
   Reuses the ap-* token classes above (field/label/hint/chip/btn/tpl-card)
   for visual consistency with AI Persoonlijkheid — only the pieces with no
   existing analog (dropzone, gallery, AI-label badge) get new rules here. */
.pi-dropzone {
  border: 2px dashed var(--border); border-radius: 12px;
  background: var(--bg-card-alt); padding: 20px; text-align: center;
  cursor: pointer; transition: border-color .15s ease, background .15s ease;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  min-height: 140px; justify-content: center;
}
.pi-dropzone:hover, .pi-dropzone.dragover { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.06); }
.pi-dropzone.has-image { border-style: solid; padding: 0; overflow: hidden; }
.pi-dropzone-placeholder { color: var(--text-muted); font-size: 13px; }
.pi-dropzone-placeholder b { color: var(--text-primary); }
.pi-dropzone img { display: block; width: 100%; max-height: 320px; object-fit: contain; background: var(--bg); }
.pi-dropzone-remove {
  margin-top: 8px; background: transparent; color: var(--text-muted); border: 0;
  font-size: 12px; cursor: pointer; text-decoration: underline; font-family: inherit;
}
.pi-dropzone-remove:hover { color: var(--red, var(--error)); }
.pi-style-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.pi-style-card {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 10px;
  padding: 10px 12px; cursor: pointer; text-align: center; font-family: inherit;
  font-size: 12px; font-weight: 700; color: var(--text-primary); transition: all .15s ease;
}
.pi-style-card:hover { border-color: var(--accent-bright); }
.pi-style-card.active { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.15); color: var(--accent-ink); }
.pi-result-wrap { margin-top: 16px; }
.pi-result-img-wrap { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--bg); }
.pi-result-img-wrap img { display: block; width: 100%; }
.pi-ai-badge {
  display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
  color: var(--warning-ink); background: rgba(var(--warning-rgb),.10);
  border: 1px solid rgba(var(--warning-rgb),.3); border-radius: 8px;
  padding: 7px 10px; margin-top: 8px; line-height: 1.4;
}
.pi-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; margin-top: 14px; }
.pi-gallery-item { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--bg-card); }
.pi-gallery-item img { display: block; width: 100%; aspect-ratio: 1; object-fit: cover; }
.pi-gallery-item-body { padding: 8px 10px 10px; }
.pi-gallery-item-style { font-size: 11px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.pi-gallery-item-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.pi-gallery-toggle {
  background: transparent; border: 1px solid var(--border); color: var(--text-muted);
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
  padding: 4px 8px; border-radius: 6px; cursor: pointer; font-family: inherit; transition: all .15s ease;
}
.pi-gallery-toggle:hover { border-color: var(--accent-bright); color: var(--accent-ink); }
.pi-empty { color: var(--text-muted); font-size: 13px; padding: 24px 0; text-align: center; }

/* Room-type chips — smaller sibling of pi-style-card, same visual language */
.pi-roomtype-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
.pi-roomtype-card {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 10px;
  padding: 8px 10px; cursor: pointer; text-align: center; font-family: inherit;
  font-size: 12px; font-weight: 600; color: var(--text-secondary); transition: all .15s ease;
}
.pi-roomtype-card:hover { border-color: var(--accent-bright); }
.pi-roomtype-card.active { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.15); color: var(--accent-ink); font-weight: 700; }
.pi-roomtype-card:disabled, .pi-roomtype-card.disabled {
  opacity: .4; cursor: not-allowed; border-color: var(--border);
}
.pi-roomtype-card:disabled:hover, .pi-roomtype-card.disabled:hover { border-color: var(--border); }

/* Visual-controls: the "Meer opties" panel (furniture/walls/floor/lighting/
   renovation depth). Reuses <details>/<summary> exactly like the AI
   Persoonlijkheid page's .ap-photo-advanced — same collapsed-by-default
   pattern, so uploading a photo + picking a style + clicking Generate stays
   a two-click flow, and every axis in here is a deliberate opt-in. */
.pi-advanced-details { margin-top: 14px; }
.pi-advanced-details > summary {
  cursor: pointer; user-select: none; list-style: none;
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
  color: var(--text-muted); padding: 4px 0;
}
.pi-advanced-details > summary::-webkit-details-marker { display: none; }
.pi-advanced-details > summary:hover { color: var(--accent-ink); }
.pi-advanced-details > summary::before {
  content: '▸'; font-size: 10px; transition: transform .15s ease;
}
.pi-advanced-details[open] > summary::before { transform: rotate(90deg); }
.pi-advanced-body { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }

/* Wall-colour swatches — small curated palette, NOT a free colour picker
   (see api/_images.js's WALL_COLORS header for why). Each chip shows the
   actual colour as a quick visual reference plus the Dutch label. */
.pi-color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.pi-color-card {
  background: var(--bg-card-alt); border: 1px solid var(--border); border-radius: 10px;
  padding: 7px 10px; cursor: pointer; text-align: left; font-family: inherit;
  font-size: 12px; font-weight: 600; color: var(--text-secondary); transition: all .15s ease;
  display: flex; align-items: center; gap: 8px;
}
.pi-color-card:hover { border-color: var(--accent-bright); }
.pi-color-card.active { border-color: var(--accent-bright); background: rgba(var(--accent-rgb),.15); color: var(--accent-ink); font-weight: 700; }
.pi-color-swatch-dot {
  width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,.25); box-shadow: inset 0 0 0 1px rgba(0,0,0,.15);
}
.pi-color-note-input { margin-top: 8px; }

/* Honesty note — shown only when "Volledige renovatie" is selected. Uses the
   warning tokens (same family as the credit-usage bar's 80% state, see
   DESIGN-SYSTEM.md's deliberate warning/accent split) so it reads as an
   active caution, not a neutral hint. */
.pi-honesty-note {
  display: flex; gap: 8px; align-items: flex-start; font-size: 12px; line-height: 1.5;
  color: var(--text-secondary); background: rgba(var(--warning-rgb),.08);
  border: 1px solid rgba(var(--warning-rgb),.28); border-radius: 10px;
  padding: 10px 12px; margin-top: 8px;
}
.pi-honesty-note b { color: var(--warning-ink); }

/* Before/after comparison slider — a single native <input type=range>
   (transparent, full-bleed) drives a clip-path on the "after" image so the
   drag/keyboard/touch handling is the browser's own accessible range input,
   never hand-rolled pointer math. The AI badge stays a separate, always-
   visible element below (never inside the draggable area) so it can never
   be dragged out of view — EU AI Act Art. 50(4), see api/_images.js header. */
.pi-compare-stage {
  position: relative; width: 100%; aspect-ratio: 1; border-radius: 12px; overflow: hidden;
  border: 1px solid var(--border); background: var(--bg);
}
.pi-compare-img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  display: block; pointer-events: none; user-select: none;
}
.pi-compare-after { clip-path: inset(0 0 0 50%); }
.pi-compare-tag {
  position: absolute; top: 8px; font-size: 10px; font-weight: 700; letter-spacing: .04em;
  text-transform: uppercase; padding: 4px 8px; border-radius: 6px;
  background: rgba(0,0,0,.55); color: #fff; pointer-events: none;
}
.pi-compare-tag.before { left: 8px; }
.pi-compare-tag.after { right: 8px; }
.pi-compare-handle {
  position: absolute; top: 0; bottom: 0; width: 2px; left: 50%; transform: translateX(-1px);
  background: var(--accent-bright); pointer-events: none; box-shadow: 0 0 0 1px rgba(0,0,0,.3);
}
.pi-compare-handle::after {
  content: ''; position: absolute; top: 50%; left: 50%; width: 32px; height: 32px;
  border-radius: 50%; background: var(--accent-bright); transform: translate(-50%,-50%);
  box-shadow: 0 2px 6px rgba(0,0,0,.35);
}
.pi-compare-range {
  position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0;
  cursor: ew-resize; -webkit-appearance: none; appearance: none;
}
.pi-result-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }

.settings-wrap { width: 100%; display: flex; flex-direction: column; gap: 20px; }
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.settings-section-title {
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  gap: 20px;
}
.settings-row:last-child { border-bottom: none; }
.settings-label {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
  flex-shrink: 0;
}
.settings-label-sub {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.settings-value {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: right;
}
.settings-input {
  background: var(--bg-card-alt);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  padding: 7px 12px;
  outline: none;
  transition: border-color 0.15s;
  width: 220px;
}
.settings-input:focus { border-color: var(--blue-bright); }
.settings-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-muted);
}
.settings-coming-soon {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(var(--warning-rgb),0.1);
  border: 1px solid rgba(var(--warning-rgb),0.25);
  color: var(--orange-ink);
  letter-spacing: 0.5px;
}
.settings-danger .settings-label { color: var(--red-ink); }
.settings-info-box {
  margin: 0 20px 16px;
  padding: 14px;
  background: rgba(var(--accent-rgb),0.06);
  border-left: 3px solid var(--blue-primary);
  border-radius: 0 8px 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
}
.settings-apikey {
  font-family: monospace;
  font-size: 13px;
  color: var(--text-secondary);
  letter-spacing: 0.5px;
}
.btn-show-key {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  transition: var(--transition);
  margin-left: 8px;
}
.btn-show-key:hover { border-color: var(--blue-bright); color: var(--accent-ink); }

/* ============================================================
   ACTIVITEIT (ACTIVITY FEED)
   ============================================================ */
.activity-feed {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}
.activity-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--border);
  animation: rowFadeUp 0.3s ease both;
}
.activity-item:last-child { border-bottom: none; }
.activity-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 4px;
}
.activity-dot-new       { background: #989287; }
.activity-dot-qualified { background: var(--cyan); box-shadow: 0 0 8px rgba(188,159,95,0.5); }
.activity-dot-booked    { background: var(--green); box-shadow: 0 0 8px rgba(var(--success-rgb),0.5); }
.activity-dot-won       { background: var(--blue-bright); box-shadow: 0 0 8px rgba(var(--accent-rgb),0.5); }
.activity-content { flex: 1; }
.activity-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.activity-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.activity-time {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  margin-top: 2px;
  white-space: nowrap;
}
.activity-feed-wrap {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 20px 24px;
  width: 100%;
}
.activity-feed-header {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-muted);
  margin-bottom: 4px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}

/* ============================================================
   PAGES VISIBILITY
   ============================================================ */
.page { display: none !important; }
.page.active { display: block !important; }
#page-kalender.active { display: flex !important; flex-direction: row; }

/* ── De overgang tussen schermen ──────────────────────────────────────────
   Hier gebeurde niets. Van scherm wisselen was display:none naar
   display:block: een harde knip, waarbij de hele inhoud in één frame vervangen
   wordt. Er is dan geen enkel signaal dat er iets NIEUWS is gekomen -- het oog
   ziet alleen dat alles anders is, en moet zelf uitzoeken of er iets geladen
   is of dat er iets stukging.

   display laat zich niet animeren, dus dit is een keyframe op het binnenkomende
   scherm en geen transition. Hij speelt vanzelf opnieuw bij elke navigatie,
   want .active wordt dan opnieuw gezet.

   Zes pixels en 200 ms. Bewust weinig: dit is gereedschap waar iemand de hele
   dag doorheen klikt, en een overgang die je OPMERKT wordt na de tiende keer
   vertraging. Hij hoort alleen het gat te vullen tussen "ik klikte" en "er
   staat iets anders".

   De beweging gaat OMHOOG, niet opzij. Zijwaarts suggereert een richting
   (vooruit, terug) en die is er niet: de zijbalk is geen volgorde. Omhoog leest
   als "hier komt iets", zonder een verhaal te vertellen dat niet klopt. */
@keyframes paginaBinnen {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.page.active { animation: paginaBinnen var(--dur-base, 220ms) var(--ease-out, cubic-bezier(0.4,0,0.2,1)) both; }

/* Wie beweging heeft uitgezet, krijgt het scherm meteen. Geen halve animatie
   en geen vertraging: dan is de knip juist het gewenste gedrag. */
@media (prefers-reduced-motion: reduce) {
  .page.active { animation: none; }
}
.cal-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
.cal-right-sidebar {
  width: 272px; flex-shrink: 0; border-left: 1px solid var(--border);
  background: var(--bg-card); display: flex; flex-direction: column; overflow: hidden;
}
.cal-sidebar-header {
  padding: 14px 14px 0; display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.cal-sidebar-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-primary); flex: 1;
}
.cal-sidebar-count {
  font-size: 11px; font-weight: 700; padding: 2px 8px;
  border-radius: 20px; background: rgba(var(--error-rgb),0.15); color: var(--red-ink);
}
.cal-sidebar-desc {
  padding: 4px 14px 10px; font-size: 11px; color: var(--text-muted);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cal-sidebar-scroll {
  flex: 1; overflow-y: auto; padding: 10px 10px; display: flex;
  flex-direction: column; gap: 8px;
}
.cal-sidebar-empty {
  padding: 28px 14px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.6;
}
.cal-call-item {
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); padding: 11px 12px; transition: border-color 0.15s;
  cursor: pointer;
}
.cal-call-item:hover { border-color: var(--accent); }
.cal-call-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.cal-call-avatar {
  width: 30px; height: 30px; border-radius: 6px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; font-weight: 700; color: var(--on-accent); flex-shrink: 0;
}
.cal-call-name {
  font-size: 13px; font-weight: 600; color: var(--text-primary);
  flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cal-call-score { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent-ink); }
.cal-call-phone-link {
  display: flex; align-items: center; gap: 7px; padding: 8px 10px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius-sm); margin-bottom: 7px;
  text-decoration: none; color: var(--text-primary);
  font-size: 13px; font-weight: 700; transition: border-color 0.15s, color 0.15s;
  font-family: 'Inter', sans-serif;
}
.cal-call-phone-link:hover { border-color: var(--green); color: var(--green-ink); }
.cal-call-actions { display: flex; gap: 6px; }
.cal-call-btn {
  flex: 1; padding: 6px 6px; border-radius: 6px;
  border: 1px solid var(--border); background: var(--bg-card);
  color: var(--text-secondary); font-size: 11px; font-weight: 600;
  cursor: pointer; text-align: center; text-decoration: none;
  transition: var(--transition); font-family: 'Inter', sans-serif;
  display: flex; align-items: center; justify-content: center; gap: 3px;
}
.cal-call-btn:hover { border-color: var(--accent); color: var(--accent-ink); background: rgba(var(--accent-rgb),0.08); }
.cal-call-btn.primary { background: rgba(var(--accent-rgb),0.1); border-color: rgba(var(--accent-rgb),0.25); color: var(--accent-ink); }
.cal-call-btn.primary:hover { background: rgba(var(--accent-rgb),0.2); }
.cal-hour-row { cursor: default; }
.cal-hour-add {
  display: none; position: absolute; top: 50%; right: 6px; transform: translateY(-50%);
  width: 22px; height: 22px; border-radius: 4px; border: 1px solid rgba(var(--accent-rgb),0.35);
  background: rgba(var(--accent-rgb),0.12); color: var(--accent-ink); font-size: 16px; font-weight: 300;
  cursor: pointer; align-items: center; justify-content: center; line-height: 1;
  transition: background 0.15s;
}
.cal-hour-add:hover { background: rgba(var(--accent-rgb),0.25); }
.cal-hour-row:hover .cal-hour-add { display: flex; }

/* ── Attendance banner ────────────────────────────────────────── */
.cal-attendance-banner {
  display: none; flex-shrink: 0;
  background: linear-gradient(135deg,rgba(var(--warning-rgb),0.08),rgba(var(--warning-rgb),0.03));
  border-bottom: 1px solid rgba(var(--warning-rgb),0.2);
  padding: 10px 16px 12px;
}
.cal-attendance-banner.visible { display: block; }
.cal-att-banner-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  color: var(--orange-ink); margin-bottom: 9px; display: flex; align-items: center; gap: 6px;
}
.cal-att-cards { display: flex; gap: 9px; flex-wrap: wrap; }
.cal-att-card {
  background: var(--bg-card); border: 1px solid rgba(var(--warning-rgb),0.22);
  border-radius: 10px; padding: 10px 12px;
  display: flex; align-items: center; gap: 12px;
  transition: border-color 0.15s;
}
.cal-att-card:hover { border-color: rgba(var(--warning-rgb),0.4); }
.cal-att-info { min-width: 0; }
.cal-att-name { font-size: 13px; font-weight: 700; color: var(--text-primary); }
.cal-att-time { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.cal-att-btns { display: flex; gap: 6px; flex-shrink: 0; }
.cal-att-btn {
  padding: 5px 13px; border-radius: 6px; font-size: 12px; font-weight: 700;
  border: 1px solid; cursor: pointer; transition: var(--transition); font-family:'Inter',sans-serif;
}
.cal-att-btn.yes { background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.3); color: var(--green-ink); }
.cal-att-btn.yes:hover { background:rgba(16,185,129,0.2); }
/* ── Verzetten en annuleren op de afspraakkaart ──────────────────────────
   Dezelfde maat en vorm als de aanwezigheidsknoppen eronder, want het zijn
   even zware acties op dezelfde kaart. 44px hoog: dit staat ook op een
   telefoon, en WCAG 2.5.8 vraagt 24, maar een knop die je per ongeluk raakt
   annuleert hier een afspraak -- dan is ruim beter dan net genoeg. */
.cal-modal-acties {
  display: flex; gap: 8px; margin-top: 14px;
  padding-top: 14px; border-top: 1px solid var(--divider);
}
.cal-act-btn {
  flex: 1; min-height: 44px; padding: 10px 14px;
  background: var(--bg-card-alt); border: 1px solid var(--border-bright);
  border-radius: 10px; color: var(--text); font-family: inherit;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}
.cal-act-btn:hover:not(:disabled) { background: var(--hover); border-color: var(--accent-bright); }
.cal-act-btn:disabled { opacity: .55; cursor: default; }
.cal-act-btn.cal-act-primair { background: var(--accent-c); color: var(--on-accent); border-color: transparent; }
.cal-act-btn.cal-act-danger  { color: var(--red-ink); border-color: rgba(var(--error-rgb),.35); }
.cal-act-btn.cal-act-danger:hover:not(:disabled) { background: rgba(var(--error-rgb),.10); border-color: var(--red-ink); }

.cal-act-form { margin-top: 12px; }
.cal-act-label { display: block; font-size: 12px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
.cal-act-input {
  width: 100%; box-sizing: border-box; min-height: 44px; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--border-bright); border-radius: 10px;
  color: var(--text); font-family: inherit; font-size: 14px;
  /* Zonder dit tekent de browser de datumkiezer in zijn lichte thema: een wit
     kalendertje uit een donker veld. */
  color-scheme: dark;
}
.cal-act-input:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: 2px; }
.cal-act-sub { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-muted); }
.cal-act-rij { display: flex; gap: 8px; margin-top: 12px; }
.cal-act-status { min-height: 18px; margin-top: 8px; font-size: 12px; line-height: 1.45; }

.cal-att-btn.no  { background:rgba(var(--error-rgb),0.1); border-color:rgba(var(--error-rgb),0.3); color: var(--red-ink); }
.cal-att-btn.no:hover  { background:rgba(var(--error-rgb),0.2); }
.cal-att-followup-input, .cal-att-followup-textarea {
  width:100%; box-sizing:border-box; padding:7px 10px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:6px; color:var(--text-primary); font-size:12px;
  font-family:'Inter',sans-serif; outline:none; transition:border-color 0.15s;
}
.cal-att-followup-input:focus, .cal-att-followup-textarea:focus { border-color:var(--accent); }
.cal-att-followup-textarea { resize:vertical; min-height:52px; }
/* Orange pulse dot on calendar events needing attendance */
.cal-event-needs-att {
  position:absolute; top:5px; right:5px; width:8px; height:8px;
  border-radius:50%; background:var(--orange); animation:pulse 1.5s infinite;
}
/* Attendance section in cal event modal */
.cal-modal-att-section {
  margin-top:14px; padding-top:14px; border-top:1px solid var(--border);
}
.cal-modal-att-label {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em;
  color:var(--text-muted); margin-bottom:9px;
}
.cal-modal-att-btns { display:flex; gap:8px; }
.cal-modal-att-result {
  margin-top:14px; padding:9px 14px; border-radius:10px;
  font-size:13px; font-weight:700; display:flex; align-items:center; gap:8px;
}
.cal-modal-att-result.yes { background:rgba(16,185,129,0.1); color: var(--green-ink); }
.cal-modal-att-result.no  { background:rgba(var(--error-rgb),0.1);  color: var(--red-ink);   }
.cal-modal-att-result-edit {
  margin-left:auto; font-size:11px; font-weight:600; cursor:pointer;
  color:var(--text-muted); text-decoration:underline;
}
/* Follow-up form after marking attendance */
.cal-att-followup {
  margin-top:12px; display:flex; flex-direction:column; gap:10px;
  padding:12px; background:var(--bg-card-alt); border-radius:10px;
  border:1px solid var(--border); animation:modalIn 0.15s ease;
}
.cal-att-followup-label {
  font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.07em; color:var(--text-muted);
}
.cal-att-followup-input {
  width:100%; box-sizing:border-box; padding:8px 11px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; color:var(--text-primary); font-size:13px;
  font-family:'Inter',sans-serif; transition:border-color 0.15s; outline:none;
}
.cal-att-followup-input:focus { border-color:var(--accent); }
.cal-att-followup-textarea {
  width:100%; box-sizing:border-box; padding:8px 11px;
  background:var(--bg-card); border:1px solid var(--border);
  border-radius:8px; color:var(--text-primary); font-size:13px;
  font-family:'Inter',sans-serif; transition:border-color 0.15s; outline:none;
  resize:vertical; min-height:72px;
}
.cal-att-followup-textarea:focus { border-color:var(--accent); }
.cal-att-save-btn {
  padding:9px 16px; border-radius:8px; border:none; cursor:pointer;
  background:var(--accent); color: var(--on-accent);
  font-size:13px; font-weight:700; font-family:'Inter',sans-serif;
  transition:filter 0.15s; text-align:center;
}
.cal-att-save-btn:hover { filter:brightness(1.1); }
.cal-att-save-btn:disabled { opacity:0.5; pointer-events:none; }

/* ── Custom booking modal ─────────────────────────────────────── */
/* ── Credits bijkopen ────────────────────────────────────────────────────── */
#koop-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
  display: none; align-items: center; justify-content: center;
}
#koop-overlay.open { display: flex; }
#koop-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); width: min(500px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--elev-3); animation: modalIn 0.18s ease;
}
.koop-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  font-size: 15px; font-weight: 700; color: var(--text-primary); flex-shrink: 0;
}
.koop-body { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 10px; }
.koop-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted);
}
/* De tegels. Vier bedragen die het gros van de keuzes dekken, met eronder wat
   je ervoor krijgt -- een makelaar kiest op "hoeveel gesprekken", niet op
   "hoeveel euro". De getallen komen van de SERVER (mode credit-quote, veld
   presets); hier staat alleen hoe ze eruitzien. */
.koop-tegels { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
@media (min-width: 440px) { .koop-tegels { grid-template-columns: repeat(4, 1fr); } }
.koop-tegel {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 10px 11px; text-align: left;
  border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: transparent; color: var(--text-primary);
  cursor: pointer; font-family: inherit; transition: var(--transition);
}
.koop-tegel:hover { background: var(--bg-card-alt); border-color: rgba(var(--accent-rgb),0.35); }
.koop-tegel:focus-visible { outline: 2px solid rgba(var(--accent-rgb),0.55); outline-offset: 2px; }
.koop-tegel.actief {
  border-color: rgba(var(--accent-rgb),0.55);
  background: rgba(var(--accent-rgb),0.10);
}
.koop-tegel-bedrag { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
.koop-tegel.actief .koop-tegel-bedrag { color: var(--accent-ink); }
.koop-tegel-sub { font-size: 10px; color: var(--text-muted); line-height: 1.4; white-space: nowrap; }
.koop-veld { position: relative; margin-top: 4px; }
.koop-euro {
  position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
  font-size: 15px; font-weight: 600; color: var(--text-muted); pointer-events: none;
}
.koop-input {
  width: 100%; padding: 11px 12px 11px 30px; font-size: 16px; font-weight: 600;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary);
  font-family: inherit; font-variant-numeric: tabular-nums;
}
.koop-input:focus { outline: none; border-color: rgba(var(--accent-rgb),0.5); }
.koop-hint { font-size: 12px; color: var(--text-muted); }

/* De samenvatting. Regels met een label links en een bedrag rechts, en de
   totaalregel apart onderaan -- dat is het getal dat straks van de kaart gaat,
   en het hoort het laatste te zijn wat je leest. */
.koop-uitkomst {
  margin-top: 6px; padding: 14px 16px; border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb),0.08); border: 1px solid rgba(var(--accent-rgb),0.20);
}
.koop-credits {
  font-size: 22px; font-weight: 700; color: var(--accent-ink);
  font-variant-numeric: tabular-nums;
}
.koop-detail { font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-top: 3px; }
.koop-rijen { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.koop-rij {
  display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
  font-size: 12px; color: var(--text-muted);
}
.koop-rij b { font-weight: 500; color: var(--text-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; }
.koop-rij.totaal {
  margin-top: 2px; padding-top: 9px;
  border-top: 1px solid rgba(var(--accent-rgb),0.22);
  font-size: 14px; font-weight: 600; color: var(--text-primary);
}
.koop-rij.totaal b { font-size: 16px; font-weight: 700; color: var(--text-primary); }

/* Het planadvies. Een rustig kaartje, geen banner: het hoort te helpen, niet
   te duwen. De accentkleur zit in de RAND en de kop, nooit als vlak achter
   lopende tekst -- zand op zand leest niet. */
.koop-staffel { display: flex; flex-direction: column; gap: var(--sp-1); margin-top: var(--sp-1); }
.koop-advies {
  display: flex; flex-direction: column; gap: var(--sp-1);
  padding: var(--sp-3);
  border: 1px solid rgba(var(--accent-rgb), 0.30);
  border-radius: var(--r-md);
  background: rgba(var(--accent-rgb), 0.07);
}
.koop-advies strong { font-size: 13px; color: var(--accent-ink); font-weight: 650; }
.koop-advies span   { font-size: 12px; color: var(--text-secondary); line-height: 1.55; }
.koop-uitleg { font-size: 12px; color: var(--text-muted); line-height: 1.5; margin-top: 4px; }

/* ── Facturatie ──────────────────────────────────────────────────────────────
   Kleuren uit tokens, tekst uit de ink-variant van het vlak eronder. Een
   bedrag mag hier nooit slecht leesbaar zijn: dit is de pagina waar een klant
   naar kijkt als hij twijfelt of hij te veel betaalt. */
/* ── De plannen ──────────────────────────────────────────────────────────
   Drie kaarten naast elkaar, met het huidige plan gemarkeerd. Het accent zit
   in de RAND en in de knop, nooit als vlak achter lopende tekst -- zand als
   ondergrond voor een alinea leest niet, en dat is precies de regel waar dit
   project al twee keer op is misgegaan. */
.fa-plannen { display: flex; flex-direction: column; gap: var(--sp-2); }
.fa-plannen-titel { font-size: 16px; font-weight: 650; margin: 0; color: var(--text-primary); }
.fa-plannen-sub   { font-size: 13px; color: var(--text-secondary); margin: 0 0 var(--sp-2); }
.fa-plannen-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sp-3);
}
.fa-plan {
  display: flex; flex-direction: column; gap: var(--sp-2);
  padding: var(--sp-4);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--card);
}
.fa-plan.huidig {
  border-color: rgba(var(--accent-rgb), 0.45);
  box-shadow: 0 0 0 1px rgba(var(--accent-rgb), 0.18);
}
.fa-plan-kop { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
.fa-plan-titel { font-size: 15px; font-weight: 650; color: var(--text-primary); }
.fa-plan-badge {
  font-size: 10px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase;
  color: var(--accent-ink);
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  border-radius: 999px; padding: 2px 8px; white-space: nowrap;
}
.fa-plan-prijs {
  font-size: 26px; font-weight: 700; color: var(--text-primary);
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.fa-plan-prijs span { font-size: 13px; font-weight: 500; color: var(--text-muted); }
.fa-plan-regel { font-size: 13px; color: var(--text-secondary); line-height: 1.55; }
.fa-plan-knop { margin-top: auto; }

.fa-wrap { display: flex; flex-direction: column; gap: 16px; max-width: 940px; }
.fa-top { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 780px) { .fa-top { grid-template-columns: 1fr; } }

.fa-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 18px 20px;
  display: flex; flex-direction: column; gap: 6px;
}
.fa-label {
  font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--text-muted);
}
.fa-kop { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.fa-sub { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }

.fa-plan-naam { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-top: 4px; }
.fa-plan-sub  { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
.fa-plan-acties { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }

.fa-saldo {
  font-size: 30px; font-weight: 700; color: var(--text-primary); margin-top: 4px;
  font-variant-numeric: tabular-nums;
}
.fa-saldo-sub { font-size: 13px; color: var(--text-secondary); }
.fa-balk {
  height: 6px; border-radius: 999px; background: var(--bg-card-alt);
  overflow: hidden; margin-top: 10px;
}
.fa-balk-vul { height: 100%; width: 0; background: var(--accent); transition: width var(--dur-base) var(--ease-out); }
/* Bijna op is een waarschuwing, niet een fout: er werkt nog van alles. */
.fa-balk-vul.fa-bijna { background: rgba(var(--warning-rgb), 0.85); }
.fa-balk-vul.fa-op    { background: rgba(var(--error-rgb), 0.85); }

.fa-rij {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 0; border-top: 1px solid var(--border);
  font-size: 13px;
}
.fa-rij:first-child { border-top: none; }
.fa-rij-naam { flex: 1; min-width: 0; color: var(--text-primary); }
.fa-rij-detail { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.fa-rij-bedrag {
  flex: 0 0 auto; font-weight: 700; font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}
.fa-rij-bedrag.fa-plus { color: var(--success-ink); }
.fa-rij-bedrag.fa-min  { color: var(--text-secondary); }
.fa-rij-datum { flex: 0 0 auto; font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.fa-chip {
  font-size: 10px; font-weight: 700; letter-spacing: 0.03em;
  padding: 2px 7px; border-radius: 999px; flex: 0 0 auto;
  background: var(--bg-card-alt); color: var(--text-secondary);
}
.fa-mini-balk { height: 4px; border-radius: 999px; background: var(--bg-card-alt); margin-top: 6px; overflow: hidden; }
.fa-mini-vul { height: 100%; background: rgba(var(--accent-rgb), 0.7); }

.fa-leeg { font-size: 13px; color: var(--text-muted); padding: 14px 0; line-height: 1.6; }
.fa-notice {
  padding: 14px 16px; border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb),0.08); border: 1px solid rgba(var(--accent-rgb),0.22);
  font-size: 13px; line-height: 1.55; color: var(--text-secondary);
}
.fa-notice strong { color: var(--accent-ink); }
.fa-notice code {
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px;
  padding: 1px 5px; border-radius: 4px; background: rgba(var(--accent-rgb),0.12); color: var(--accent-ink);
}

/* ── Panden ──────────────────────────────────────────────────────────────────
   Kleuren komen uit tokens, en tekst gebruikt de ink-variant van de kleur die
   eronder ligt -- een groene status staat op een groene chip, niet op de kaart
   eronder. Zie CLAUDE.md. */
.pd-wrap { display: flex; flex-direction: column; gap: 18px; }
.pd-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.pd-head-title { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.pd-head-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

.pd-notice {
  padding: 14px 16px; border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb),0.08); border: 1px solid rgba(var(--accent-rgb),0.22);
  font-size: 13px; line-height: 1.55; color: var(--text-secondary);
}
.pd-notice strong { color: var(--accent-ink); }
.pd-notice code {
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px;
  padding: 1px 5px; border-radius: 4px; background: rgba(var(--accent-rgb),0.12); color: var(--accent-ink);
}

.pd-empty {
  padding: 40px 28px; text-align: center;
  border: 1px dashed var(--border); border-radius: var(--radius);
  display: flex; flex-direction: column; align-items: center; gap: 10px;
}
.pd-empty-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.pd-empty-text { font-size: 13px; line-height: 1.6; color: var(--text-muted); max-width: 440px; }

.pd-grid {
  display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}
.pd-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  display: flex; flex-direction: column;
  transition: var(--transition);
}
.pd-card:hover { border-color: rgba(var(--accent-rgb),0.35); }
.pd-card--archived { opacity: 0.55; }
.pd-card-foto {
  width: 100%; height: 150px; object-fit: cover; display: block;
  background: var(--bg-card-alt);
}
.pd-card-foto-leeg {
  height: 150px; display: flex; align-items: center; justify-content: center;
  background: var(--bg-card-alt); color: var(--text-disabled);
}
.pd-card-body { padding: 14px 15px; display: flex; flex-direction: column; gap: 9px; flex: 1; }
.pd-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.pd-card-adres { font-size: 14px; font-weight: 700; color: var(--text-primary); line-height: 1.35; }
.pd-card-plaats { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
.pd-card-code {
  font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; font-weight: 700;
  padding: 3px 7px; border-radius: 6px; flex-shrink: 0;
  background: rgba(var(--accent-rgb),0.12); color: var(--accent-ink);
}
.pd-card-feiten { display: flex; flex-wrap: wrap; gap: 6px; }
.pd-feit {
  font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
  background: var(--bg-card-alt); color: var(--text-secondary);
}
.pd-feit--prijs { background: rgba(var(--accent-rgb),0.14); color: var(--accent-ink); }
/* Status: de vulling is de kleur, de tekst is de ink-variant van diezelfde
   kleur. Zand op wit haalt 1,29:1 -- dit is geen smaakkwestie. */
.pd-status { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; letter-spacing: 0.02em; }
.pd-status--beschikbaar { background: rgba(var(--success-rgb),0.14); color: var(--success-ink); }
.pd-status--bod         { background: rgba(var(--warning-rgb),0.16); color: var(--warning-ink); }
.pd-status--weg         { background: rgba(var(--error-rgb),0.14);   color: var(--error-ink); }

.pd-link-row { display: flex; align-items: center; gap: 8px; margin-top: 2px; }
.pd-link {
  flex: 1; min-width: 0; font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11px; color: var(--text-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 6px 9px; border-radius: 6px; background: var(--bg-card-alt); border: 1px solid var(--border);
}
.pd-card-acties { display: flex; gap: 7px; margin-top: auto; padding-top: 4px; }
.pd-mini {
  flex: 1; font-size: 12px; font-weight: 600; padding: 7px 8px;
  border-radius: var(--radius-sm); border: 1px solid var(--border);
  background: transparent; color: var(--text-secondary); cursor: pointer;
  transition: var(--transition);
}
.pd-mini:hover { background: var(--bg-card-alt); color: var(--text-primary); }
.pd-leads { font-size: 12px; color: var(--text-muted); }
.pd-leads strong { color: var(--text-primary); }

/* Importeren uit een link. Staat bovenaan het venster en mag dat ook zien:
   dit is de weg die een makelaar zou moeten nemen, de losse velden zijn de
   uitwijk. */
/* [hidden] wint hier niet vanzelf. Het HTML-attribuut zet display:none via de
   stylesheet van de BROWSER, en elke eigen display-regel is specifieker en wint
   dus. .pd-import staat op display:flex, dus el.hidden = true deed zichtbaar
   niets -- de balk bleef gewoon staan terwijl de eigenschap wel op true stond.

   Een !important is hier de juiste oplossing en geen luiheid: "verborgen"
   hoort geen onderhandeling te zijn met de rest van de cascade. Beperkt tot de
   twee blokken die echt geschakeld worden, zodat het geen algemene dreun wordt. */
#pd-import[hidden], #pd-vast[hidden], #pd-deal[hidden] { display: none !important; }
/* Idem voor de navigatie: .nav-item staat op display:flex, dus el.hidden = true
   zou daar niets doen. Dit is dezelfde val, twee keer in hetzelfde bestand --
   het is de reden dat "verborgen" nooit een onderhandeling met de cascade mag
   zijn. */
.nav-item[hidden] { display: none !important; }

.pd-import {
  padding: 13px 14px;
  border-radius: var(--radius-sm);
  background: rgba(var(--accent-rgb),0.07);
  border: 1px solid rgba(var(--accent-rgb),0.20);
  display: flex; flex-direction: column; gap: 4px;
}
.pd-import-kop { font-size: 13px; font-weight: 700; color: var(--accent-ink); }
.pd-import-sub { font-size: 12px; line-height: 1.45; color: var(--text-muted); margin-bottom: 6px; }
.pd-import-row { display: flex; gap: 8px; align-items: stretch; }
.pd-import-row .pd-input { flex: 1; min-width: 0; }
.pd-import-row button { flex: 0 0 auto; white-space: nowrap; }
.pd-import-status { font-size: 12px; line-height: 1.5; margin-top: 8px; }
.pd-import-status--bezig { color: var(--text-muted); }
.pd-import-status--ok    { color: var(--success-ink); }
.pd-import-status--fout  { color: var(--error-ink); }
/* Een veld dat de import NIET kon invullen. Geen foutkleur: er is niets mis,
   er staat alleen nog niets -- de makelaar moet er even naar kijken. */
.pd-input--leeg {
  border-color: rgba(var(--warning-rgb),0.45);
  background: rgba(var(--warning-rgb),0.06);
}

/* Het bewerkvenster */
#pd-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
  display: none; align-items: center; justify-content: center;
}
#pd-overlay.open { display: flex; }
#pd-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); width: min(640px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--elev-3); animation: modalIn 0.18s ease;
}
.pd-modal-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
  font-size: 15px; font-weight: 700; color: var(--text-primary);
}
.pd-modal-x {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; color: var(--text-muted);
  font-size: 18px; line-height: 1; transition: var(--transition);
}
.pd-modal-x:hover { background: var(--bg-card-alt); color: var(--text-primary); }
.pd-modal-body {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 12px;
}
.pd-modal-body::-webkit-scrollbar { width: 5px; }
.pd-modal-body::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.3); border-radius: 4px; }
.pd-modal-foot {
  display: flex; justify-content: flex-end; gap: 9px;
  padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0;
}
.pd-modal-err {
  padding: 10px 12px; border-radius: var(--radius-sm);
  background: rgba(var(--error-rgb),0.10); border: 1px solid rgba(var(--error-rgb),0.28);
  color: var(--error-ink); font-size: 12px; line-height: 1.5;
}
.pd-label {
  display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.04em;
  text-transform: uppercase; color: var(--text-muted); margin-bottom: 5px;
}
.pd-input {
  width: 100%; padding: 9px 11px; font-size: 13px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: var(--radius-sm); color: var(--text-primary);
  font-family: inherit; transition: var(--transition);
}
.pd-input:focus { outline: none; border-color: rgba(var(--accent-rgb),0.5); }
.pd-textarea { resize: vertical; line-height: 1.5; }
.pd-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; line-height: 1.45; }
.pd-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.pd-row-3 { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; }
/* pd-row-3 is ondanks zijn naam TWEE kolommen (1fr 2fr) -- hij hoort bij
   postcode + gemeente. Voor drie gelijke velden is een eigen klasse nodig;
   pd-row-3 verbreden zou het pandformulier scheeftrekken. */
.pd-row-3e { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 560px) { .pd-row-3e, .pd-row-4 { grid-template-columns: 1fr 1fr; } }
.pd-row-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.pd-col-2 { grid-column: span 1; }
.pd-checkline { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); cursor: pointer; }
@media (max-width: 620px) {
  .pd-row-2, .pd-row-3, .pd-row-4 { grid-template-columns: 1fr; }
}

#cal-book-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.65); backdrop-filter: blur(6px);
  display: none; align-items: center; justify-content: center;
}
#cal-book-overlay.open { display: flex; }
#cal-book-modal {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); width: min(520px, 96vw); max-height: 90vh;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: var(--elev-3);
  animation: modalIn 0.18s ease;
}
#cal-book-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.cal-book-icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--accent);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
#cal-book-title {
  flex: 1; font-size: 15px; font-weight: 700; color: var(--text-primary); line-height: 1.2;
}
#cal-book-subtitle { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
#cal-book-close {
  width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); transition: var(--transition); flex-shrink: 0;
}
#cal-book-close:hover { background: var(--bg-card-alt); color: var(--text-primary); }
/* Scrollable body */
#cal-book-body {
  flex: 1; overflow-y: auto; padding: 20px;
  display: flex; flex-direction: column; gap: 18px;
}
#cal-book-body::-webkit-scrollbar { width: 5px; }
#cal-book-body::-webkit-scrollbar-thumb { background: rgba(var(--accent-rgb),0.3); border-radius: 4px; }
/* Section label */
.cb-label {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.07em; color: var(--text-muted); margin-bottom: 8px;
}
/* Date nav */
.cb-date-nav {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; padding: 8px 12px;
}
.cb-date-label {
  flex: 1; font-size: 14px; font-weight: 700; color: var(--text-primary); text-align: center;
}
.cb-date-btn {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border);
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); transition: var(--transition);
  font-family: 'Inter',sans-serif;
}
.cb-date-btn:hover { background: var(--bg-card); color: var(--text-primary); border-color: var(--accent); }
/* Slot grid */
.cb-slots {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
}
.cb-slot {
  padding: 10px 8px; border-radius: 10px; border: 1px solid var(--border);
  background: var(--bg-card-alt); color: var(--text-primary);
  font-size: 13px; font-weight: 700; cursor: pointer; text-align: center;
  transition: var(--transition); font-family: 'Inter',sans-serif;
}
.cb-slot:hover { border-color: var(--accent); background: rgba(var(--accent-rgb),0.08); color: var(--accent-ink); }
.cb-slot.selected {
  background: rgba(var(--accent-rgb),0.15); border-color: var(--accent);
  color: var(--accent-ink); box-shadow: 0 0 0 2px rgba(var(--accent-rgb),0.2);
}
.cb-slots-empty {
  grid-column: 1/-1; text-align: center; padding: 24px;
  color: var(--text-muted); font-size: 13px; line-height: 1.6;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
}
.cb-empty-next {
  background: var(--accent); color: var(--on-accent); border: none;
  padding: 9px 18px; border-radius: var(--radius-sm);
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: var(--transition); font-family: inherit;
}
.cb-empty-next:hover { filter: brightness(1.1); transform: translateY(-1px); }
/* Lead search */
.cb-lead-search {
  position: relative;
}
.cb-lead-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; color: var(--text-primary); font-size: 13px;
  font-family: 'Inter',sans-serif; transition: border-color 0.15s; outline: none;
}
.cb-lead-input:focus { border-color: var(--accent); }
.cb-field-input {
  width: 100%; box-sizing: border-box; padding: 9px 12px;
  background: var(--bg-card-alt); border: 1px solid var(--border);
  border-radius: 10px; color: var(--text-primary); font-size: 13px;
  font-family: 'Inter',sans-serif; transition: border-color 0.15s; outline: none;
}
.cb-field-input:focus { border-color: var(--accent); }
.cb-lead-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 10;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; max-height: 160px; overflow-y: auto;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.cb-lead-opt {
  padding: 8px 12px; cursor: pointer; font-size: 13px; color: var(--text-primary);
  border-bottom: 1px solid var(--border); transition: background 0.1s;
  display: flex; align-items: center; gap: 8px;
}
.cb-lead-opt:last-child { border-bottom: none; }
.cb-lead-opt:hover { background: rgba(var(--accent-rgb),0.07); }
.cb-lead-opt-score { font-size: 10px; color: var(--accent-ink); font-weight: 700; margin-left: auto; }
/* Confirm button */
.cb-confirm-wrap { padding-top: 4px; }
.cb-confirm-btn {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 13px; border-radius: 10px;
  background: var(--accent); color: var(--on-accent);
  font-size: 14px; font-weight: 700; cursor: pointer; border: none;
  font-family: 'Inter',sans-serif; transition: filter 0.15s, transform 0.12s;
  text-decoration: none;
}
.cb-confirm-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
.cb-confirm-btn:disabled { opacity: 0.4; pointer-events: none; }
.cb-confirm-note { font-size: 11px; color: var(--text-muted); text-align: center; margin-top: 7px; }
/* Loading / empty states */
.cb-loading {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; padding: 32px;
  color: var(--text-muted); font-size: 13px;
}
.cb-spinner-ring {
  width: 28px; height: 28px; border: 3px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.cb-no-connection {
  padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; line-height: 1.7;
}
.cb-no-connection a { color: var(--accent-ink); font-weight: 600; }
/* Loading spinner for slots refresh */
.cb-slots-loading {
  grid-column: 1/-1; display: flex; align-items: center; justify-content: center;
  gap: 8px; padding: 20px; color: var(--text-muted); font-size: 12px;
}
.cal-book-spinner-ring {
  width: 16px; height: 16px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
#page-profile.active { display: block !important; }

/* ============================================================
   RESPONSIVE - TABLET & MOBILE
   ============================================================ */

/* Large desktop tweaks */
@media (max-width: 1400px) {
  .stats-grid { gap: 14px; }
}

/* Tablet landscape */
@media (max-width: 1200px) {
  .analyse-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .exports-grid { grid-template-columns: repeat(2, 1fr); }
  .profile-cards { grid-template-columns: 1fr 1fr; }
  .charts-row { flex-direction: column; }
  .chart-card-sm { width: 100%; }
}

@media (max-width: 1100px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
}

/* Tablet portrait */
@media (max-width: 1024px) {
  .conv-layout { flex-direction: column; height: auto; min-height: calc(100vh - 130px); }
  .conv-list { width: 100%; max-height: 280px; border-right: none; border-bottom: 1px solid var(--border); }
  .pipeline-board { gap: 12px; }
  .pipeline-col { flex: 0 0 240px; }
  .profile-stats-row { grid-template-columns: repeat(2, 1fr); }
  .cal-right-sidebar { width: 240px; }
}

/* Larger phones / small tablets */
@media (max-width: 900px) {
  .analyse-grid { grid-template-columns: minmax(0, 1fr); }
  .analyse-card-span2 { grid-column: span 1; }
  .profile-cards { grid-template-columns: 1fr; }
  .cal-right-sidebar { display: none; }
  .search-pill-label { display: none; }
  .search-pill { min-width: auto; padding: 8px 10px; }
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.mobile-open {
    transform: translateX(0);
    box-shadow: 4px 0 30px rgba(0, 0, 0, 0.5);
  }

  .main-content {
    margin-left: 0;
  }

  .hamburger { display: flex; align-items: center; justify-content: center; }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    padding: 16px 14px 14px;
  }

  .stat-value {
    font-size: 24px;
  }

  /* Extra bottom padding so the last row of content can always be
     scrolled clear of the floating help launcher, which is fixed and
     would otherwise sit permanently on top of whatever ends the page. */
  .page-content { padding: 16px 16px 96px; }

  .topbar { padding: 12px 16px; }

  .timestamp-info { display: none; }

  /* Wrapped to three lines at 375px and doubled the header height */
  .page-subtitle { display: none; }

  /* A phone has no Cmd key, so the ⌘K hint is both misleading and the
     widest thing in the row. Dropping it lets the five topbar controls
     sit on one line instead of wrapping onto a second. */
  .search-pill-kbd { display: none; }

  /* Let the title give up space before the actions wrap. */
  .topbar-left { min-width: 0; flex-shrink: 1; }
  .page-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Het titelblok is zelf ook een flex-kind met min-width:auto en weigerde
     dus onder zijn tekstbreedte te zakken -- flex-shrink op de ouder alleen
     doet daar niets. */
  .topbar-titel { min-width: 0; }

  .detail-panel {
    width: 100vw;
  }

  .exports-grid {
    grid-template-columns: 1fr;
  }

  .filters-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .filter-select, .search-wrapper { min-width: unset; }

  .leads-count { margin-left: 0; text-align: center; padding-top: 4px; }

  /* Hide less important table columns on mobile */
  .td-samenvatting { display: none; }

  .pipeline-board { padding-bottom: 80px; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .login-form-side { padding: 32px 24px; }
  .login-welcome { font-size: 28px; }
  /* Collapse the topbar actions to icons. This rule existed before but
     only matched <span>s, and these two labels were bare text nodes — so
     the buttons stayed ~110px wide, wrapped onto three rows, and pushed
     the topbar to 137px tall on a 375px phone. */
  .btn-icon span:not(.icon), .btn-label { display: none; }
  /* Icon-only buttons don't need label-sized side padding; trimming this
     plus the gap is what gets all five controls onto a single row at
     375px instead of leaving the theme toggle stranded on its own line. */
  .topbar-right { gap: 4px; }
  .topbar-right .btn-icon, .topbar-right .search-pill { padding-left: 9px; padding-right: 9px; }
  .page-title { font-size: 14px; letter-spacing: 1.5px; }

  /* Lead detail panel — tighter padding + smaller avatar so the header
     doesn't feel cramped on the smallest phones */
  .panel-header { padding: 18px 16px 16px; }
  .panel-body   { padding: 16px; }
  .panel-avatar { width: 48px; height: 48px; font-size: 18px; margin-bottom: 10px; }
  .panel-close  { top: 14px; right: 14px; width: 40px; height: 40px; }

  /* Takeover bar / reply row — allow the send button to sit under the
     textarea instead of squeezing both into ~300px of width */
  .panel-reply-row { flex-wrap: wrap; }
  .panel-reply-send { flex: 1 1 100%; justify-content: center; }
  .panel-takeover-bar { padding: 8px; gap: 6px; }
  .panel-takeover-btn { margin-left: 0; }

  /* Actie Nodig / follow-up / top-leads widgets — match .page-content's
     16px gutter instead of the desktop 20px */
  .nb-widget, .followup-widget, .top-leads-strip, .taken-widget { padding: 14px 16px; }
}

/* ============================================================
   PAGE HIDDEN WHEN LOGGED OUT
   ============================================================ */
#dashboard-app { display: none; }
#dashboard-app.visible { display: flex; flex-direction: column; min-height: 100vh; }

/* ============================================================
   LIGHT MODE COMPONENT OVERRIDES
   ============================================================ */

/* Sidebar gets a white surface with left accent border */
/* The sidebar is now the SAME dark pane in both themes — it is the
   anchor the light content area sits against, and switching it to white
   in light mode was what made the whole page read as one flat sheet.
   These rules used to force it white and tint the active item at 9%
   alpha (near-invisible); both are handled by the .sidebar block above,
   which rebinds the colour tokens for everything inside it. */
[data-theme="light"] .sidebar {
  border-right: 1px solid rgba(255,255,255,0.06);
  box-shadow: inset -1px 0 0 rgba(255,255,255,0.06), 8px 0 32px rgba(25,22,16,0.10);
}

[data-theme="light"] .nav-item:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text);
}

[data-theme="light"] .nav-item.active {
  background: var(--grad-gold);
  /* Zelfde ingreep als in het donkere thema: koud zwart op een gouden pil
     leest grijsblauw. Gelijke helderheid, warme tint: 11,87:1 -> 11,86:1. */
  color: #1F1D18;
}

[data-theme="light"] .nav-item.active::before { display: none; }

/* Topbar: glass, not flat white. 0.72 rather than 0.92 alpha so content
   scrolling underneath actually shows through and the bar reads as a
   pane floating over the page instead of a painted strip. The inset
   highlight is the specular top edge. */
[data-theme="light"] .topbar {
  background: rgba(255,255,255,0.72);
  border-bottom: 1px solid var(--border);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.90), 0 4px 20px rgba(23,19,12,0.05);
}

/* Page titles were gold, which put brand colour on ordinary structural
   text and left nothing louder for actual emphasis. Gold is now reserved
   for the active nav pill, primary actions and money. */
[data-theme="light"] .page-title {
  color: var(--text);
}

/* Knoppen op wit. Zelfde mechaniek als op donker -- randlicht, verloop, gloed
   -- maar de richting van het licht klopt anders niet: op wit kan de bovenrand
   niet lichter dan de ondergrond, dus daar draagt de ONDERrand het verschil.
   Dat zit al in --btn-rim, die in dit blok andere waarden krijgt.

   Hier stond box-shadow:none op de zweefstaat. Dat was consequent met de oude
   opzet (er was geen schaduw om weg te halen) maar het zou nu precies de gloed
   uitzetten die de knop zijn diepte geeft. */
[data-theme="light"] .btn-icon {
  background: linear-gradient(180deg, #FFFFFF 0%, #FBFAF7 100%);
  border: 1px solid var(--border);
  box-shadow: var(--btn-rim);
  color: var(--text-secondary);
}

[data-theme="light"] .btn-icon:hover {
  background: linear-gradient(180deg, rgba(var(--accent-rgb),0.16) 0%, rgba(var(--accent-rgb),0.09) 100%);
  border-color: rgba(var(--accent-rgb),0.32);
  color: var(--accent-ink);
  box-shadow: var(--btn-rim), var(--btn-glow);
}

/* Op wit is het accent een VULLING met donkere tekst erop -- zie de
   contrastregel bovenaan dit bestand: zand als tekst haalt 1,7:1. Het verloop
   loopt daarom binnen het zand zelf, van de lichte stop naar de diepe. */
[data-theme="light"] .btn-primary-sm {
  background: linear-gradient(180deg, var(--zand-100) 0%, var(--accent-c) 55%, var(--accent-deep) 100%);
  border-color: rgba(var(--accent-rgb),0.55);
  box-shadow: var(--btn-rim-accent), var(--btn-glow);
  color: var(--on-accent);
}

[data-theme="light"] .btn-primary-sm:hover {
  background: linear-gradient(180deg, var(--zand-100) 0%, var(--accent-hover-c) 55%, var(--accent-pressed-c) 100%);
  box-shadow: var(--btn-rim-accent),
              0 3px 10px rgba(var(--accent-rgb),0.42), 0 12px 32px rgba(var(--accent-rgb),0.30);
}

[data-theme="light"] .btn-primary-sm:active {
  box-shadow: var(--btn-rim-accent), 0 1px 3px rgba(var(--accent-rgb),0.45);
}

/* Stat cards. White with real depth */
[data-theme="light"] .stat-card {
  background: var(--bg);
  box-shadow: var(--edge-hi), var(--shadow-card);
  border: 1px solid var(--border);
}

[data-theme="light"] .stat-card:hover {
  box-shadow: none;
  border-color: rgba(var(--accent-rgb),0.2);
}

/* Stat value color */
[data-theme="light"] .stat-value {
  color: #0f1117;
}

/* Filters bar */
[data-theme="light"] .filters-bar {
  background: rgba(255,255,255,0.8);
  border: 1px solid var(--border);
  box-shadow: 0 1px 4px rgba(23,19,12,0.04);
}

/* Selects & search */
[data-theme="light"] .filter-select,
[data-theme="light"] .search-input {
  background: var(--bg);
  border-color: var(--border);
  color: var(--text-primary);
}

[data-theme="light"] .filter-select:focus,
[data-theme="light"] .search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb),0.12);
}

/* Lead table */
[data-theme="light"] .leads-table thead th {
  background: var(--bg-card-alt);
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

[data-theme="light"] .leads-table tbody tr:hover {
  background: rgba(var(--accent-rgb),0.04);
  box-shadow: inset 3px 0 0 var(--accent);
}

/* Badge overrides for light */
[data-theme="light"] .badge {
  font-weight: 600;
}

/* Detail panel */
[data-theme="light"] .detail-panel {
  background: var(--bg);
  border-left: 1px solid var(--border);
  box-shadow: -4px 0 20px rgba(23,19,12,0.08);
}

/* Login split in light mode */
[data-theme="light"] .login-split {
  box-shadow: 0 8px 40px rgba(23,19,12,0.14);
}

/* User info bottom of sidebar */
/* No light-theme override here on purpose. The sidebar is dark in BOTH
   themes and rebinds its own surface tokens, so the account block already
   gets the right treatment. The override that used to sit here predated
   the permanently-dark sidebar and painted a white card inside it. */
[data-theme="light"] .user-info {
  background: var(--bg-card-alt);
  border-radius: 10px;
}
[data-theme="light"] .sidebar .user-info { background: rgba(255,255,255,0.05); }

/* De zijbalk BLIJFT donker in het lichte thema — dat is opzet, en .sidebar
   .nav-item zet daarom al een vaste inkt (#8D99AC) los van het thema. De
   voettekst deed dat niet en erfde de paginakleuren: de profielnaam werd
   bijna-zwart (#111827) en Uitloggen kreeg --red-ink, dat in licht #B91C1C
   is — een rood bedoeld voor een WIT vlak. Gemeten op de echte pixels van
   het donkere vlak: 1,86:1 en 1,88:1, allebei ruim onder 4,5:1.
   Meet tegen het oppervlak waar de tekst ECHT op staat. */
[data-theme="light"] .sidebar .user-name { color: var(--text); }
/* Twee vlakken, niet één: "Mijn profiel" staat in het profielblok en dat is
   lichter dan de zijbalkvoet eronder. Eén kleur moet het op allebei halen.

   De vlakken zijn veranderd toen de zijbalk warm werd, dus opnieuw gemeten in
   plaats van de oude cijfers laten staan. Samengesteld komt de voet nu uit op
   #332F24 en het profielblok op #3D392F.

   #B3AD9F is de warme tegenhanger van het blauwgrijze #A3AEC0 dat hier stond:
   dezelfde helderheid, alleen de tint gedraaid. Haalt 5,99:1 op de voet en
   5,14:1 op het profielblok -- praktisch gelijk aan de koude versie (5,98 en
   5,13), dus dit kost geen leesbaarheid. */
[data-theme="light"] .sidebar .user-role { color: #B3AD9F; }
/* Niet --error-ink (#F87171): dat is afgestemd op het KAARTvlak en haalt
   daar 5,68:1, maar op het donkerdere zijbalkvlak (rgb(56,52,60), gemeten op
   de echte pixels) blijft het op 4,40:1 steken — net onder 4,5. Deze tint
   haalt er 5,68:1. */
[data-theme="light"] .sidebar .btn-logout { color: #FB8C8C; }

/* Sidebar bottom button */
[data-theme="light"] .btn-logout {
  background: rgba(var(--error-rgb),0.06);
  border-color: rgba(var(--error-rgb),0.15);
}

[data-theme="light"] .btn-logout:hover {
  background: rgba(var(--error-rgb),0.12);
  border-color: rgba(var(--error-rgb),0.3);
}

/* ── Stat cards: colorful top line + corner glow in light ── */
[data-theme="light"] .stat-card::before {
  background: var(--accent);
  opacity: 0.8;
}

[data-theme="light"] .stat-card::after {
  background: none;
}

[data-theme="light"] .stat-card:hover {
  border-color: rgba(var(--accent-rgb),0.25);
  background: var(--card);
  box-shadow: none;
}

[data-theme="light"] .stat-card:hover::before {
  background: var(--accent);
  opacity: 1;
}

/* Colored stat values. Keep glow but lighter */
[data-theme="light"] .stat-value { text-shadow: none; color: #0f1117; }
[data-theme="light"] .stat-value.cyan   { color: var(--info); text-shadow: none; }
[data-theme="light"] .stat-value.green  { color: var(--success-ink); text-shadow: none; }
[data-theme="light"] .stat-value.orange { color: var(--warning-ink); text-shadow: none; }
[data-theme="light"] .stat-value.blue   { color: var(--info); text-shadow: none; }

/* Stat bar in light */
[data-theme="light"] .stat-bar { background: var(--border); }
[data-theme="light"] .stat-bar-fill { background: var(--accent); }

/* Chart card */
[data-theme="light"] .chart-card,
[data-theme="light"] .chart-card-sm {
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: var(--edge-hi), var(--shadow-card);
}

[data-theme="light"] .chart-title {
  color: var(--text-secondary);
}

/* Today widget */
[data-theme="light"] .today-widget {
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: var(--edge-hi), var(--shadow-card);
}

/* Cal modal */
[data-theme="light"] .cal-modal {
  background: var(--bg);
}
[data-theme="light"] .cal-modal-btn-secondary {
  background: rgba(0,0,0,0.04);
  color: var(--text-secondary);
}
[data-theme="light"] .cal-modal-close:hover { background: rgba(0,0,0,0.06); }

/* Filters bar stronger presence */
[data-theme="light"] .filters-bar {
  background: var(--bg);
  border: 1px solid var(--border);
  box-shadow: 0 1px 6px rgba(23,19,12,0.05);
}

/* Table header row */
[data-theme="light"] .leads-table thead tr {
  background: var(--hover);
}

/* Badge coloring stays vibrant in light */
[data-theme="light"] .badge-bron {
  background: rgba(var(--accent-rgb),0.1);
  color: var(--accent-ink);
  border-color: rgba(var(--accent-rgb),0.2);
}

/* ============================================================
   HELP WIDGET (launcher bottom-right + slide-up panel)

   Deliberately NOT an LLM chat. It answers from a fixed set of
   articles written against features that actually exist in this
   build, and hands off to a human for anything else. A generative
   bot here would confidently invent settings that don't exist and
   turn every wrong answer into a support ticket.
   ============================================================ */
.hv-help-launcher {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  /* Was 9000, gelijk aan de zoek-overlay. Bij gelijke z-index beslist de
     volgorde in de DOM en niet de bedoeling; de hulpknop hoort ONDER een
     geopende zoekbalk te vallen, niet erdoorheen te steken. */
  z-index: 8900;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--grad-gold);
  color: var(--on-accent);
  box-shadow: 0 4px 12px rgba(0,0,0,.28), 0 10px 32px rgba(var(--accent-rgb),.28);
  transition: transform var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.hv-help-launcher:hover {
  transform: translateY(-2px) scale(1.04);
  box-shadow: 0 6px 16px rgba(0,0,0,.32), 0 14px 40px rgba(var(--accent-rgb),.36);
}
.hv-help-launcher:active { transform: translateY(0) scale(.97); }
.hv-help-launcher:focus-visible {
  outline: 2px solid var(--accent-c);
  outline-offset: 3px;
}
/* Two stacked icons, cross-faded — the launcher becomes its own close
   button when the panel is open, which is the pattern people already
   know from every other messenger. */
.hv-help-launcher svg {
  position: absolute;
  transition: opacity var(--dur-fast) var(--ease-out),
              transform var(--dur-base) var(--ease-out);
}
.hv-help-launcher .hv-help-ico-close { opacity: 0; transform: rotate(-90deg) scale(.6); }
.hv-help-launcher.is-open .hv-help-ico-chat  { opacity: 0; transform: rotate(90deg) scale(.6); }
.hv-help-launcher.is-open .hv-help-ico-close { opacity: 1; transform: none; }

/* Unread dot for the first-run nudge. */
.hv-help-launcher::after {
  content: '';
  position: absolute;
  top: 2px; right: 2px;
  width: 12px; height: 12px;
  border-radius: 50%;
  background: var(--c-coral);
  border: 2px solid var(--bg);
  opacity: 0;
  transform: scale(.4);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring);
}
.hv-help-launcher.has-dot::after { opacity: 1; transform: none; }

.hv-help-panel {
  position: fixed;
  right: 24px;
  bottom: 90px;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 560px;
  max-height: calc(100vh - 130px);
  z-index: 9001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  background: var(--card);
  border: 1px solid var(--border-c);
  box-shadow: var(--edge-hi), var(--elev-3);
  opacity: 0;
  transform: translateY(12px) scale(.97);
  transform-origin: bottom right;
  pointer-events: none;
  transition: opacity var(--dur-base) var(--ease-out),
              transform var(--dur-enter) var(--ease-out);
}
.hv-help-panel.is-open {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
@media (prefers-reduced-motion: reduce) {
  .hv-help-launcher, .hv-help-launcher svg, .hv-help-panel { transition: none; }
}

.hv-help-head {
  padding: 18px 18px 14px;
  background: var(--grad-gold);
  color: var(--on-accent);
  flex-shrink: 0;
}
.hv-help-head h2 { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
.hv-help-head p  { font-size: 12px; margin: 0; opacity: .82; }

.hv-help-search { padding: 12px 14px 8px; flex-shrink: 0; }
.hv-help-search input {
  width: 100%;
  padding: 9px 12px;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-c);
  background: var(--bg-alt);
  border: 1px solid var(--border-c);
  border-radius: 10px;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.hv-help-search input:focus {
  outline: none;
  border-color: var(--accent-c);
}
.hv-help-search input::placeholder { color: var(--text-muted-c); }

.hv-help-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 14px 14px;
}
.hv-help-sec {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .6px;
  text-transform: uppercase;
  color: var(--text-muted-c);
  margin: 12px 4px 6px;
}
.hv-help-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 4px;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-c);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out);
}
.hv-help-item:hover {
  background: var(--hover-c);
  border-color: var(--border-c);
}
.hv-help-item:focus-visible { outline: 2px solid var(--accent-c); outline-offset: -1px; }
.hv-help-item svg { flex-shrink: 0; opacity: .5; margin-left: auto; }

.hv-help-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted-c);
}

.hv-help-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 10px;
  padding: 5px 10px 5px 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted-c);
  background: transparent;
  border: 1px solid var(--border-c);
  border-radius: 999px;
  cursor: pointer;
}
.hv-help-back:hover { color: var(--text-c); background: var(--hover-c); }

.hv-help-article h3 { font-size: 15px; font-weight: 700; margin: 0 0 10px; color: var(--text-c); }
.hv-help-article p  { font-size: 13px; line-height: 1.62; color: var(--text-muted-c); margin: 0 0 10px; }
.hv-help-article ol,
.hv-help-article ul { margin: 0 0 12px 18px; }
.hv-help-article li { font-size: 13px; line-height: 1.62; color: var(--text-muted-c); margin-bottom: 6px; }
.hv-help-article strong { color: var(--text-c); font-weight: 600; }
.hv-help-article code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--bg-alt);
  border: 1px solid var(--border-c);
  color: var(--accent-ink);
}

.hv-help-foot {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--divider);
  background: var(--bg-alt);
}
.hv-help-foot a {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 10px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  color: var(--text-c);
  background: var(--card);
  border: 1px solid var(--border-c);
  border-radius: 10px;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.hv-help-foot a:hover { border-color: var(--accent-c); color: var(--accent-ink); }

/* On phones the panel takes the whole screen — a 380px card floating on a
   375px viewport is the classic broken-messenger look. */
@media (max-width: 520px) {
  .hv-help-panel {
    right: 0; bottom: 0; left: 0;
    width: 100%;
    max-width: 100%;
    height: 88vh;
    max-height: 88vh;
    border-radius: 18px 18px 0 0;
    transform-origin: bottom center;
  }
  .hv-help-launcher { right: 16px; bottom: 16px; }
}`;

/** De stijlen, als één string. */
function css() { return CSS; }

module.exports = { css };
