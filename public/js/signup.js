/* ============================================================
   AANMELDEN — koppeling naar de applicatie
   ------------------------------------------------------------
   De marketingsite maakt zelf geen accounts aan. Het account
   wordt gemaakt in de beveiligde omgeving van de app. Deze
   pagina vangt het e-mailadres op, valideert het, en stuurt de
   bezoeker door met dat adres alvast ingevuld.

   Sinds 31-08-2026 gaat dit naar app.helvaro.pro/signup en NIET meer
   naar accounts.helvaro.pro/sign-up.

   Waarom: dat laatste is Clerk's eigen portaal. Dat werkt, maar het is
   onze site niet. Het staat in het Engels ("Create your account"), in
   Clerks paarse standaardthema, zonder ons logo, zonder een woord over
   de proefperiode van veertien dagen. Een Vlaamse makelaar klikt dus
   vanaf een Nederlandse pagina door naar een Engels paars formulier van
   een partij waar hij nog nooit van gehoord heeft -- precies op het
   moment dat hij beslist of hij ons vertrouwt.

   app.helvaro.pro/signup toont hetzelfde registratieformulier van Clerk,
   maar in ons eigen scherm: logo, huisstijl, het promopaneel ernaast, en
   in de taal van de bezoeker. De inloglink op deze site wijst al naar
   app.helvaro.pro, dus dit maakt het ook consistent.

   De parameter email_address blijft werken: die pagina vult het adres
   voor in het formulier.
   Wil je de bestemming wijzigen, pas dan alleen SIGNUP_URL aan.
   ============================================================ */
(function () {
  'use strict';

  /* ── Teksten die JAVASCRIPT zet ───────────────────────────────────────────
     De vertaalmachine van de site (js/i18n.js) loopt eenmalig door de DOM en
     vervangt wat er dan staat. Alles wat hierna door script wordt gezet, mist
     hij -- en dat is precies alles op deze pagina dat ertoe doet: de
     validatiefouten en de regels van Faro.

     Gevolg vóór deze versie: een Franse bezoeker vulde een fout adres in en
     kreeg een Nederlandse foutmelding. Dat is geen schoonheidsfoutje op de
     enige pagina waar iemand zijn e-mailadres achterlaat.

     Vijf talen, net als de taalkiezer. Onbekend of ontbrekend valt terug op
     Nederlands -- de brontaal van de site. */
  var TEKST = {
    nl: {
      leeg:    'Vul je e-mailadres in om verder te gaan.',
      ongeldig:'Dit e-mailadres lijkt niet te kloppen. Controleer het even.',
      bezig:   'Een moment…',
      idle:    'Ik sta klaar. Vul je e-mailadres in, dan zet ik de rest voor je op.',
      denkt:   'Ziet er goed uit. Klik op verder, dan maken we je account aan.',
      klaar:   'Top. Ik breng je naar het aanmeldscherm.',
    },
    en: {
      leeg:    'Enter your email address to continue.',
      ongeldig:'That email address does not look right. Please check it.',
      bezig:   'One moment…',
      idle:    'I am ready. Enter your email and I will set up the rest for you.',
      denkt:   'Looks good. Click continue and we will create your account.',
      klaar:   'Great. Taking you to the sign-up screen.',
    },
    fr: {
      leeg:    'Saisissez votre adresse e-mail pour continuer.',
      ongeldig:'Cette adresse e-mail semble incorrecte. Vérifiez-la.',
      bezig:   'Un instant…',
      idle:    'Je suis prêt. Saisissez votre e-mail et je m’occupe du reste.',
      denkt:   'Ça a l’air bon. Cliquez sur continuer et nous créons votre compte.',
      klaar:   'Parfait. Je vous emmène vers l’inscription.',
    },
    de: {
      leeg:    'Geben Sie Ihre E-Mail-Adresse ein, um fortzufahren.',
      ongeldig:'Diese E-Mail-Adresse sieht nicht richtig aus. Bitte prüfen Sie sie.',
      bezig:   'Einen Moment…',
      idle:    'Ich bin bereit. Geben Sie Ihre E-Mail ein, den Rest übernehme ich.',
      denkt:   'Sieht gut aus. Klicken Sie auf Weiter, dann legen wir Ihr Konto an.',
      klaar:   'Sehr gut. Ich bringe Sie zur Anmeldung.',
    },
    es: {
      leeg:    'Introduce tu dirección de correo para continuar.',
      ongeldig:'Esta dirección de correo no parece correcta. Revísala.',
      bezig:   'Un momento…',
      idle:    'Estoy listo. Introduce tu correo y yo preparo el resto.',
      denkt:   'Tiene buena pinta. Pulsa continuar y creamos tu cuenta.',
      klaar:   'Perfecto. Te llevo a la pantalla de registro.',
    },
  };

  function t(sleutel) {
    var taal = (document.documentElement.lang || 'nl').slice(0, 2).toLowerCase();
    var tabel = TEKST[taal] || TEKST.nl;
    return tabel[sleutel] || TEKST.nl[sleutel] || '';
  }

  var SIGNUP_URL = 'https://app.helvaro.pro/signup';
  var EMAIL_PARAM = 'email_address';

  /* ── Faro ─────────────────────────────────────────────────────────────────
     Zijn houding is de statusregel van dit formulier. Vier toestanden, en
     elke toestand zegt hetzelfde in WOORDEN in de regel ernaast -- een
     houding is geen boodschap, en een schermlezer ziet hem niet.

     De poses komen uit dezelfde set als in de app, zodat het dezelfde Faro
     is en niet een tweede karakter dat er toevallig op lijkt. */
  var FARO = {
    idle:  { img: 'assets/faro/falcon-idle.webp',
             tekst: null },   // uit t('idle'), zie zetFaro
    denkt: { img: 'assets/faro/falcon-thinking.webp',
             tekst: null },   // uit t('denkt')
    fout:  { img: 'assets/faro/falcon-error.webp',
             tekst: '' },   // de tekst is de validatiefout zelf, die is specifieker
    /* 'bezig' hoorde er al te zijn. Bij het versturen sprong Faro meteen op
       'klaar' -- juichen terwijl er nog niets gelukt was, en terwijl de knop
       ernaast wel gewoon 'Een moment...' zei. Twee dingen die tegelijk iets
       anders beweren over hetzelfde moment, en de vrolijkste van de twee was
       de leugen. Nu werkt hij zichtbaar tijdens het doorsturen. */
    bezig: { img: 'assets/faro/falcon-generating.webp',
             tekst: null },   // uit t('bezig')
    klaar: { img: 'assets/faro/falcon-success.webp',
             tekst: null },   // uit t('klaar')
  };

  var faroVak  = document.querySelector('.signup-faro');
  var faroImg  = document.getElementById('signupFaro');
  var faroLine = document.getElementById('signupFaroLine');

  function zetFaro(toestand, tekst) {
    if (!faroVak || !faroImg || !faroLine) return;
    var f = FARO[toestand] || FARO.idle;
    if (faroVak.getAttribute('data-faro-state') === toestand && !tekst) return;
    faroVak.setAttribute('data-faro-state', toestand);
    faroImg.src = f.img;
    /* Meegegeven tekst wint (dat is de specifieke validatiefout); anders de
       vaste regel bij deze houding, in de taal van de bezoeker. */
    faroLine.textContent = tekst || t(toestand) || '';
  }

  var form = document.getElementById('signupForm');
  if (!form) return;

  var input = document.getElementById('signupEmail');
  var error = document.getElementById('signupError');
  var button = form.querySelector('.signup-submit');

  // Bewust ruim: e-mailvalidatie die te streng is, weigert echte adressen.
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function showError(message) {
    zetFaro('fout', message);
    error.textContent = message;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function clearError() {
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  }

  /* De beginregel staat in het Nederlands in de HTML, als terugval wanneer dit
     script niet laadt. Draait het wel, dan volgt hij de taal van de bezoeker --
     de vertaalmachine van de site pakt hem niet op, want die loopt eenmalig
     door de DOM en kent deze zin niet.

     Een setTimeout(0) was hier eerst, en dat was een race die ik live zag
     verliezen: i18n.js zet document.documentElement.lang ook tijdens het laden,
     soms later dan wij. Dan stond er Nederlands op een Engelse pagina.

     Kijken naar het lang-attribuut lost dat op EN doet meteen het goede
     wanneer de bezoeker halverwege van taal wisselt met de kiezer in de
     navigatie -- dan hoort Faro mee te wisselen, niet in de vorige taal te
     blijven staan. */
  function beginregel() {
    var vak = document.querySelector('.signup-faro');
    // Niet overschrijven wanneer Faro iets specifiekers zegt (een fout,
    // of "ik breng je erheen") -- alleen de rusttoestand volgt de taal.
    if (!vak || vak.getAttribute('data-faro-state') !== 'idle') return;
    zetFaro('idle', t('idle'));
  }
  beginregel();
  if (window.MutationObserver) {
    new MutationObserver(beginregel)
      .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  input.addEventListener('input', function () {
    clearError();
    /* Meedenken zodra het adres KAN kloppen, niet bij elke toetsaanslag:
       een vogel die per letter van houding wisselt is een tic, geen hulp. */
    zetFaro(EMAIL_RE.test((input.value || '').trim()) ? 'denkt' : 'idle');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var email = (input.value || '').trim();

    if (!email) {
      showError(t('leeg'));
      return;
    }
    if (!EMAIL_RE.test(email)) {
      showError(t('ongeldig'));
      return;
    }

    clearError();
    zetFaro('bezig');
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = t('bezig');

    var url;
    try {
      url = new URL(SIGNUP_URL);
      url.searchParams.set(EMAIL_PARAM, email);
    } catch (e) {
      // Kan de URL niet opgebouwd worden, ga dan zonder parameter door
      // in plaats van de bezoeker te laten stranden.
      window.location.href = SIGNUP_URL;
      return;
    }

    window.location.href = url.toString();
  });

})();
