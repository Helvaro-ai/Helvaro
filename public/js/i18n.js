// Helvaro i18n — automatisch gegenereerd
(function(){
    /* Vertalingen zitten in aparte bestanden onder js/lang/. Alleen de taal
     die de bezoeker nodig heeft wordt opgehaald, dat scheelt zo'n 50 KB. */
  var TR = window.HELVARO_TR || {};
  var geladen = {};
  var huidig = 'nl';
  /* Ophogen zodra een taalbestand wijzigt, anders houdt de browser de oude versie vast. */
  var TAAL_V = '26';
  function laadTaal(lang, klaar){
    if (lang === 'nl' || TR[lang] || geladen[lang]) { klaar(); return; }
    geladen[lang] = true;
    var s = document.createElement('script');
    /* Absoluut pad, niet relatief. Vanaf /sectoren/vastgoed.html zocht een
       relatief pad naar /sectoren/js/lang/en.js, kreeg een 404, en viel de
       pagina stil terug op Nederlands. */
    s.src = '/js/lang/' + lang + '.js?v=' + TAAL_V;
    s.onload = function(){ TR = window.HELVARO_TR || TR; klaar(); };
    s.onerror = function(){ klaar(); };   /* mislukt het, dan blijft Nederlands staan */
    document.head.appendChild(s);
  }

  var LABELS = {nl:'NL',fr:'FR',en:'EN',de:'DE',es:'ES'};
  var HERO = {
    nl: 'Elke voertuigaanvraag. <span class="highlight">Afgehandeld.</span>',
    fr: 'Chaque demande de véhicule. <span class="highlight">Traitée.</span>',
    en: 'Every vehicle enquiry. <span class="highlight">Handled.</span>',
    de: 'Jede Fahrzeuganfrage. <span class="highlight">Bearbeitet.</span>',
    es: 'Cada consulta de vehículo. <span class="highlight">Atendida.</span>'
  };
  /* Titel van het browsertabblad: die staat buiten de <body> en wordt
     dus niet door de tekstwandeling opgepikt. Apart vertalen. */
  /* Elke titel in de HTML staat Nederlands, dus dat is hier ook de sleutel.
     Er stonden vroeger Engelse sleutels, die nooit matchten: het tabblad
     bleef daardoor Nederlands terwijl de pagina wel vertaalde. */
  var TITLES = {
    'AI-agents die je herhaalwerk overnemen \u00b7 Helvaro': {
      fr: 'Des agents IA qui reprennent votre travail r\u00e9p\u00e9titif \u00b7 Helvaro',
      en: 'AI agents that take over your repetitive work \u00b7 Helvaro',
      de: 'KI-Agents, die Ihre Routinearbeit \u00fcbernehmen \u00b7 Helvaro',
      es: 'Agentes de IA que asumen tu trabajo repetitivo \u00b7 Helvaro'
    },
    'Hoe Helvaro werkt \u00b7 AI-agents die je herhaalwerk overnemen': {
      fr: 'Comment fonctionne Helvaro \u00b7 des agents IA qui reprennent votre travail r\u00e9p\u00e9titif',
      en: 'How Helvaro works \u00b7 AI agents that take over your repetitive work',
      de: 'So funktioniert Helvaro \u00b7 KI-Agents, die Ihre Routinearbeit \u00fcbernehmen',
      es: 'C\u00f3mo funciona Helvaro \u00b7 agentes de IA que asumen tu trabajo repetitivo'
    },
    'Plan je gratis werkaudit \u00b7 Helvaro': {
      fr: 'Planifiez votre audit de travail gratuit \u00b7 Helvaro',
      en: 'Book your free work audit \u00b7 Helvaro',
      de: 'Ihr kostenloses Arbeits-Audit planen \u00b7 Helvaro',
      es: 'Agenda tu auditor\u00eda de trabajo gratuita \u00b7 Helvaro'
    },
    'Gratis strategiegesprek plannen \u00b7 Helvaro': {
      fr: 'Planifier un entretien strat\u00e9gique gratuit \u00b7 Helvaro',
      en: 'Book a free strategy call \u00b7 Helvaro',
      de: 'Kostenloses Strategiegespr\u00e4ch planen \u00b7 Helvaro',
      es: 'Agenda una sesi\u00f3n de estrategia gratuita \u00b7 Helvaro'
    },
    'Start je 14 dagen gratis \u00b7 Helvaro': {
      fr: 'Commencez vos 14 jours gratuits \u00b7 Helvaro',
      en: 'Start your 14 free days \u00b7 Helvaro',
      de: 'Starten Sie Ihre 14 Tage gratis \u00b7 Helvaro',
      es: 'Empieza tus 14 d\u00edas gratis \u00b7 Helvaro'
    },
    'Vastgoed \u00b7 Helvaro': {
      fr: 'Immobilier \u00b7 Helvaro',
      en: 'Real estate \u00b7 Helvaro',
      de: 'Immobilien \u00b7 Helvaro',
      es: 'Inmobiliaria \u00b7 Helvaro'
    },
    'Bouw & Renovatie \u00b7 Helvaro': {
      fr: 'Construction et r\u00e9novation \u00b7 Helvaro',
      en: 'Construction & Renovation \u00b7 Helvaro',
      de: 'Bau und Renovierung \u00b7 Helvaro',
      es: 'Construcci\u00f3n y reformas \u00b7 Helvaro'
    },
    'Privacybeleid \u00b7 Helvaro': {
      fr: 'Politique de confidentialit\u00e9 \u00b7 Helvaro',
      en: 'Privacy policy \u00b7 Helvaro',
      de: 'Datenschutzerkl\u00e4rung \u00b7 Helvaro',
      es: 'Pol\u00edtica de privacidad \u00b7 Helvaro'
    }
  };
  var baseTitle = document.title;
  function applyTitle(lang){
    var set = TITLES[baseTitle];
    /* De titel in de HTML staat Nederlands. Hier stond 'en', nog uit de tijd
       dat de brontitel Engels was, waardoor het tabblad Nederlands bleef
       terwijl de pagina Engels werd. */
    document.title = (lang === 'nl' || !set || !set[lang]) ? baseTitle : set[lang];
  }

  /* Zinnen met opmaak erin: die splitsen in losse tekstknopen, waardoor
     alleen de vetgedrukte stukken zouden vertalen. Daarom hier als geheel. */
  var HTML_BLOKKEN = {
    nietBeweren: {
      nl: "Wat we <strong>niet</strong> beweren: dat er nooit een fout gemaakt wordt. Daarom kan je verkoper overnemen en bestaan de goedkeuringen hierboven. Onze modelleveranciers verwerken goedgekeurde context onder hun eigen voorwaarden, en dat zetten we op papier voor we beginnen.",
      fr: "Ce que nous ne prétendons <strong>pas</strong> : qu'aucune erreur n'est jamais commise. C'est pour cela que votre vendeur peut reprendre la main et que les approbations ci-dessus existent. Nos fournisseurs de modèles traitent le contexte approuvé selon leurs propres conditions, et nous le mettons par écrit avant de commencer.",
      en: "What we do <strong>not</strong> claim: that a mistake is never made. That is why your salesperson can take over and why the approvals above exist. Our model providers process approved context under their own terms, and we put that in writing before we start.",
      de: "Was wir <strong>nicht</strong> behaupten: dass nie ein Fehler passiert. Genau dafür kann Ihr Verkäufer übernehmen und dafür gibt es die Freigaben oben. Unsere Modellanbieter verarbeiten freigegebenen Kontext zu ihren eigenen Bedingungen, und das halten wir schriftlich fest, bevor wir anfangen.",
      es: "Lo que <strong>no</strong> afirmamos: que nunca se comete un error. Por eso tu vendedor puede tomar el relevo y por eso existen las aprobaciones de arriba. Nuestros proveedores de modelos procesan el contexto aprobado bajo sus propias condiciones, y lo dejamos por escrito antes de empezar."
    },
    faroTitel: {
      nl: "Je werkstromen doen het werk. <span class=\"highlight\">Faro houdt het in de gaten.</span>",
      fr: "Vos flux font le travail. <span class=\"highlight\">Faro garde l'œil dessus.</span>",
      en: "Your workflows do the work. <span class=\"highlight\">Faro keeps watch over it.</span>",
      de: "Ihre Abläufe machen die Arbeit. <span class=\"highlight\">Faro behält sie im Blick.</span>",
      es: "Tus flujos hacen el trabajo. <span class=\"highlight\">Faro lo vigila.</span>"
    },
    gDataBewaren: {
      nl: "Van je Google-account bewaren we drie dingen: een <strong>vernieuwingstoken</strong> zodat je niet bij elke afspraak opnieuw moet inloggen, het <strong>e-mailadres</strong> van het gekoppelde account en het <strong>agenda-ID</strong> van de agenda die je gekozen hebt.",
      fr: "De votre compte Google, nous conservons trois choses : un <strong>jeton de rafraîchissement</strong> (pour que vous n'ayez pas à vous reconnecter à chaque rendez-vous), l'<strong>adresse e-mail</strong> du compte connecté et l'<strong>identifiant de l'agenda</strong> que vous avez choisi.",
      en: "From your Google account we store three things: a <strong>refresh token</strong> (so you do not have to sign in again for every appointment), the <strong>email address</strong> of the connected account, and the <strong>calendar ID</strong> of the calendar you selected.",
      de: "Von Ihrem Google-Konto speichern wir drei Dinge: ein <strong>Refresh-Token</strong> (damit Sie sich nicht für jeden Termin erneut anmelden müssen), die <strong>E-Mail-Adresse</strong> des verbundenen Kontos und die <strong>Kalender-ID</strong> des von Ihnen gewählten Kalenders.",
      es: "De tu cuenta de Google guardamos tres cosas: un <strong>token de actualización</strong> (para que no tengas que iniciar sesión de nuevo en cada cita), la <strong>dirección de correo</strong> de la cuenta conectada y el <strong>ID del calendario</strong> que has seleccionado."
    },
    gDataInhoud: {
      nl: "<strong>De inhoud van je agenda bewaren we niet.</strong> Open je de agendapagina, dan halen we je afspraken op dat moment bij Google op en sturen we ze rechtstreeks door naar je browser. Ze worden nooit in onze database geschreven, nooit gearchiveerd en nooit gebruikt voor iets anders dan het tonen van die ene weergave. Sluit je de pagina, dan blijft er niets achter.",
      fr: "<strong>Nous ne conservons pas le contenu de votre agenda.</strong> Lorsque vous ouvrez la page Agenda, nous récupérons vos rendez-vous auprès de Google à cet instant et les transmettons directement à votre navigateur. Ils ne sont jamais écrits dans notre base de données, jamais archivés et jamais utilisés pour autre chose que l'affichage de cette vue. Fermez la page et il n'en reste rien.",
      en: "<strong>We do not store the contents of your calendar.</strong> When you open the Calendar page, we fetch your events from Google at that moment and pass them straight through to your browser. They are never written to our database, never archived, and never used for anything beyond rendering that one view. Close the page and nothing remains.",
      de: "<strong>Die Inhalte Ihres Kalenders speichern wir nicht.</strong> Wenn Sie die Kalenderseite öffnen, holen wir Ihre Termine in diesem Moment von Google und reichen sie direkt an Ihren Browser weiter. Sie werden nie in unsere Datenbank geschrieben, nie archiviert und nie für etwas anderes als diese eine Ansicht verwendet. Schließen Sie die Seite, bleibt nichts zurück.",
      es: "<strong>No guardamos el contenido de tu calendario.</strong> Cuando abres la página de calendario, obtenemos tus citas de Google en ese momento y las pasamos directamente a tu navegador. Nunca se escriben en nuestra base de datos, nunca se archivan y nunca se usan para nada más que mostrar esa vista. Cierras la página y no queda nada."
    },
    gDataPrive: {
      nl: "Afspraken die je als <em>privé</em> hebt gemarkeerd, tonen we zonder titel, alleen als &ldquo;Bezet&rdquo;. Dat een moment bezet is, hebben we nodig om dubbele boekingen te voorkomen. Waarom het bezet is, gaat Helvaro niets aan.",
      fr: "Les rendez-vous que vous avez marqués comme <em>privés</em> s'affichent sans titre, uniquement comme &laquo;&nbsp;Occupé&nbsp;&raquo;. Savoir qu'un créneau est pris est nécessaire pour éviter les doubles réservations ; savoir pourquoi ne regarde pas Helvaro.",
      en: "Events you have marked <em>private</em> are shown without their title, only as &ldquo;Busy&rdquo;. That a slot is taken is needed to prevent double bookings; why it is taken is none of Helvaro's business.",
      de: "Termine, die Sie als <em>privat</em> markiert haben, zeigen wir ohne Titel, nur als &bdquo;Belegt&ldquo;. Dass ein Zeitfenster belegt ist, brauchen wir, um Doppelbuchungen zu vermeiden. Warum es belegt ist, geht Helvaro nichts an.",
      es: "Las citas que has marcado como <em>privadas</em> se muestran sin título, solo como &ldquo;Ocupado&rdquo;. Que una franja esté ocupada es necesario para evitar reservas duplicadas; por qué lo está no es asunto de Helvaro."
    },
    gDataOntkoppel: {
      nl: "Je kan op elk moment ontkoppelen via <em>Instellingen &rsaquo; Google Agenda &rsaquo; Ontkoppelen</em> in je Helvaro-dashboard. Helvaro trekt de toestemming dan ook bij Google in en wist het token en het e-mailadres uit onze database. Afspraken die al in je agenda staan, blijven staan. Die zijn van jou.",
      fr: "Vous pouvez vous déconnecter à tout moment via <em>Paramètres &rsaquo; Google Agenda &rsaquo; Déconnecter</em> dans votre tableau de bord Helvaro. Helvaro révoque alors également l'autorisation auprès de Google et supprime le jeton et l'adresse e-mail de notre base de données. Les rendez-vous déjà présents dans votre agenda y restent : ils sont à vous.",
      en: "You can disconnect at any time via <em>Settings &rsaquo; Google Calendar &rsaquo; Disconnect</em> in your Helvaro dashboard. Helvaro then revokes the grant with Google as well and deletes the token and email address from our database. Appointments already in your calendar remain, they are yours.",
      de: "Sie können die Verbindung jederzeit über <em>Einstellungen &rsaquo; Google Kalender &rsaquo; Trennen</em> in Ihrem Helvaro-Dashboard lösen. Helvaro widerruft die Berechtigung dann auch bei Google und löscht Token und E-Mail-Adresse aus unserer Datenbank. Termine, die bereits in Ihrem Kalender stehen, bleiben bestehen. Sie gehören Ihnen.",
      es: "Puedes desconectar en cualquier momento desde <em>Ajustes &rsaquo; Google Calendar &rsaquo; Desconectar</em> en tu panel de Helvaro. Helvaro revoca entonces también el permiso ante Google y borra el token y la dirección de correo de nuestra base de datos. Las citas que ya están en tu calendario se quedan: son tuyas."
    },
    gDataIntrekken: {
      nl: "Je kan de toegang ook rechtstreeks bij Google intrekken via <a href=\"https://myaccount.google.com/permissions\">myaccount.google.com/permissions</a>.",
      fr: "Vous pouvez également révoquer l'accès directement auprès de Google via <a href=\"https://myaccount.google.com/permissions\">myaccount.google.com/permissions</a>.",
      en: "You can also revoke access directly with Google at <a href=\"https://myaccount.google.com/permissions\">myaccount.google.com/permissions</a>.",
      de: "Sie können den Zugriff auch direkt bei Google widerrufen unter <a href=\"https://myaccount.google.com/permissions\">myaccount.google.com/permissions</a>.",
      es: "También puedes revocar el acceso directamente en Google en <a href=\"https://myaccount.google.com/permissions\">myaccount.google.com/permissions</a>."
    },
    gDataLimited: {
      nl: "Het gebruik door Helvaro van informatie ontvangen via Google API's volgt het <a href=\"https://developers.google.com/terms/api-services-user-data-policy\">Google API Services User Data Policy</a>, met inbegrip van de Limited Use-vereisten.",
      fr: "L'utilisation par Helvaro des informations reçues via les API Google respecte le <a href=\"https://developers.google.com/terms/api-services-user-data-policy\">Google API Services User Data Policy</a>, y compris les exigences Limited Use.",
      en: "Helvaro's use of information received from Google APIs will adhere to the <a href=\"https://developers.google.com/terms/api-services-user-data-policy\">Google API Services User Data Policy</a>, including the Limited Use requirements.",
      de: "Die Nutzung von über Google-APIs erhaltenen Informationen durch Helvaro folgt der <a href=\"https://developers.google.com/terms/api-services-user-data-policy\">Google API Services User Data Policy</a>, einschließlich der Limited-Use-Anforderungen.",
      es: "El uso por parte de Helvaro de la información recibida a través de las API de Google se ajusta a la <a href=\"https://developers.google.com/terms/api-services-user-data-policy\">Google API Services User Data Policy</a>, incluidos los requisitos de Limited Use."
    },
    heroSub: {
      nl: 'Helvaro handelt aanvragen af via <strong>je website, WhatsApp en e-mail</strong>. Het weet over welke auto het gaat, kwalificeert de kans, volgt op en boekt de afspraak. <strong>Je verkoper houdt de regie.</strong>',
      fr: 'Helvaro traite les demandes via <strong>votre site, WhatsApp et l\'e-mail</strong>. Il sait de quelle voiture il s\'agit, qualifie l\'opportunité, relance et fixe le rendez-vous. <strong>Votre vendeur garde la main.</strong>',
      en: 'Helvaro handles enquiries from <strong>your website, WhatsApp and email</strong>. It knows which car is meant, qualifies the opportunity, follows up and books the appointment. <strong>Your salesperson stays in control.</strong>',
      de: 'Helvaro bearbeitet Anfragen über <strong>Ihre Website, WhatsApp und E-Mail</strong>. Es weiß, um welches Auto es geht, qualifiziert die Chance, fasst nach und bucht den Termin. <strong>Ihr Verkäufer behält die Regie.</strong>',
      es: 'Helvaro atiende las consultas desde <strong>tu web, WhatsApp y el correo</strong>. Sabe de qué coche se trata, cualifica la oportunidad, hace seguimiento y reserva la cita. <strong>Tu comercial mantiene el control.</strong>'
    }
  };
  function applyHtmlBlokken(lang){
    document.querySelectorAll('[data-i18n-html]').forEach(function(el){
      var set = HTML_BLOKKEN[el.getAttribute('data-i18n-html')];
      if (set && set[lang]) el.innerHTML = set[lang];
    });
  }

  var heroEl = null, heroTouched = false;
  function applyHero(lang){
    if(!heroEl) return;
    if(lang==='nl'){ if(heroTouched){ heroEl.innerHTML = HERO.nl; heroTouched = false; } }
    else { heroEl.innerHTML = HERO[lang] || HERO.nl; heroTouched = true; }
  }
  var norm = function(s){ return s.replace(/\s+/g,' ').trim(); };
  var nodes = [];
  function collect(){
    nodes = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if(!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName.toLowerCase();
        if(tag==='script'||tag==='style'||tag==='noscript') return NodeFilter.FILTER_REJECT;
        if(p.closest && p.closest('.lang-switch')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while(n = walker.nextNode()){
      n.__nl = norm(n.nodeValue);
      n.__raw = n.nodeValue;
      nodes.push(n);
    }
  }
  function apply(lang){
    if (lang !== 'nl' && !TR[lang]) { laadTaal(lang, function(){ apply(lang); }); return; }
    var dict = TR[lang] || null;
    nodes.forEach(function(node){
      if(!node.parentNode){ return; }
      if(lang==='nl' || !dict || dict[node.__nl]==null){
        node.nodeValue = node.__raw;
      } else {
        var raw = node.__raw;
        var lead = raw.match(/^\s*/)[0];
        var trail = raw.match(/\s*$/)[0];
        node.nodeValue = lead + dict[node.__nl] + trail;
      }
    });
    document.documentElement.lang = lang;
    huidig = lang;
    try { localStorage.setItem('helvaro_lang', lang); } catch(e){}
    document.querySelectorAll('.lang-current').forEach(function(c){ c.textContent = LABELS[lang]; });
    document.querySelectorAll('.lang-opt').forEach(function(o){ o.classList.toggle('active', o.getAttribute('data-lang')===lang); });
    applyHero(lang);
    applyTitle(lang);
    applyHtmlBlokken(lang);
    applyPlaceholders(lang, dict);
  }

  /* Placeholders zitten in een attribuut, niet in een tekstknoop, dus die
     ontsnappen aan de TreeWalker. */
  var phNodes = [];
  function collectPlaceholders(root){
    (root || document.body).querySelectorAll('[placeholder]').forEach(function(el){
      if (el.__ph != null) return;
      el.__ph = el.getAttribute('placeholder');
      phNodes.push(el);
    });
  }
  function applyPlaceholders(lang, dict){
    phNodes.forEach(function(el){
      if(!el.isConnected) return;
      var v = (lang==='nl' || !dict) ? null : dict[norm(el.__ph)];
      el.setAttribute('placeholder', v || el.__ph);
    });
  }

  /* Blokken die pas na het laden in de pagina komen, zoals het demo-widget
     dat van app.helvaro.pro wordt gehaald. Nieuwe tekstknopen worden
     opgenomen en meteen in de huidige taal gezet. */
  function collectIn(root){
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(n){
        if(!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if(!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName.toLowerCase();
        if(tag==='script'||tag==='style'||tag==='noscript') return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while(n = walker.nextNode()){
      if(n.__nl != null) continue;
      n.__nl = norm(n.nodeValue);
      n.__raw = n.nodeValue;
      nodes.push(n);
    }
    collectPlaceholders(root);
  }
  /* ----------------------------------------------------------
     Automatische taalkeuze.
     Volgorde: eigen keuze van de bezoeker > ?lang= in de URL >
     browsertaal > tijdzone als landhint > Nederlands.

     Bewust geen IP-geolocatie: dat vereist een externe dienst,
     stuurt het IP van elke bezoeker naar een derde partij (slecht
     te rijmen met onze eigen GDPR-belofte) en vertraagt de pagina.
     Browsertaal en tijdzone komen uit de browser zelf.
     ---------------------------------------------------------- */
  var SUPPORTED = ['nl','fr','en','de','es'];

  /* Tijdzone -> taal. Enkel als de browsertaal niets oplevert. */
  var TZ_LANG = {
    'Europe/Brussels':'nl', 'Europe/Amsterdam':'nl',
    'Europe/Paris':'fr', 'Europe/Monaco':'fr', 'Europe/Luxembourg':'fr',
    'Europe/Madrid':'es', 'Atlantic/Canary':'es', 'Europe/Andorra':'es',
    'Europe/Berlin':'de', 'Europe/Vienna':'de', 'Europe/Zurich':'de'
  };

  function detect(){
    /* 1. ?lang=fr in de URL wint altijd. Een advertentie die naar de Franse
       versie linkt moet dat ook krijgen, ook als de bezoeker eerder wat koos. */
    try {
      var q = (location.search.match(/[?&]lang=([a-zA-Z-]+)/) || [])[1];
      if (q) {
        q = q.slice(0,2).toLowerCase();
        if (SUPPORTED.indexOf(q) >= 0) {
          try { localStorage.setItem('helvaro_lang_set','1'); } catch(err){}
          return q;
        }
      }
    } catch(e){}

    /* 2. Eerdere expliciete keuze van de bezoeker */
    try {
      if (localStorage.getItem('helvaro_lang_set') === '1') {
        var chosen = localStorage.getItem('helvaro_lang');
        if (chosen && SUPPORTED.indexOf(chosen) >= 0) return chosen;
      }
    } catch(e){}

    /* 3. Voorkeurstalen van de browser */
    var langs = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || ''];
    for (var i = 0; i < langs.length; i++) {
      var code = String(langs[i] || '').slice(0,2).toLowerCase();
      if (SUPPORTED.indexOf(code) >= 0) return code;
    }

    /* 4. Tijdzone als landhint */
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (TZ_LANG[tz]) return TZ_LANG[tz];
      /* Buiten Europa is Engels de veiligste gok */
      if (tz && tz.indexOf('Europe/') !== 0) return 'en';
    } catch(e){}

    /* 5. Standaard */
    return 'nl';
  }

  function init(){
    /* Elke taal heeft nu een eigen URL en wordt vooraf vertaald weggeschreven
       door tools/build-langs.pl. In de browser vertalen zou de inhoud laten
       afwijken van de canonical van de pagina, dus dat gebeurt hier niet meer.
       Wat blijft: het openklappen van de kiezer, en de keuze onthouden.

       De vertaalmachinerie hieronder blijft staan voor het demo-widget, dat
       zichzelf pas na het laden opbouwt en geen eigen URL heeft. */
    var vooraf = document.body.getAttribute('data-vertaald');
    huidig = vooraf || 'nl';
    document.documentElement.lang = huidig;

    heroEl = document.querySelector('.hero-title');
    collect();
    collectPlaceholders();
    if (huidig !== 'nl') { laadTaal(huidig, function(){}); }

    /* Het demo-widget rendert zichzelf pas na dit punt. Zodra er inhoud
       verschijnt, wordt die alsnog vertaald. */
    var demo = document.getElementById('helvaro-ai-demo');
    if (demo && window.MutationObserver) {
      var wachtend = null;
      new MutationObserver(function(){
        /* Tijdens het typen verandert er van alles in het widget. Even
           wachten scheelt tientallen rondjes over de hele pagina. */
        clearTimeout(wachtend);
        wachtend = setTimeout(function(){
          collectIn(demo);
          apply(huidig);
        }, 120);
      }).observe(demo, { childList: true, subtree: true });
    }
    document.addEventListener('click', function(e){
      var opt = e.target.closest('.lang-opt');
      if(opt){
        /* De taalkiezer is een echte link geworden: elke taal heeft zijn
           eigen URL. Hier dus niets vertalen, alleen onthouden wat de
           bezoeker koos en de browser laten navigeren. */
        try { localStorage.setItem('helvaro_lang_set','1'); } catch(err){}
        try { localStorage.setItem('helvaro_lang', opt.getAttribute('data-lang')); } catch(err){}
        document.querySelectorAll('.lang-switch').forEach(function(s){ s.classList.remove('open'); });
        return;
      }
      var tog = e.target.closest('.lang-toggle');
      if(tog){ var sw = tog.closest('.lang-switch'); var open = sw.classList.toggle('open'); tog.setAttribute('aria-expanded', open?'true':'false'); e.stopPropagation(); return; }
      document.querySelectorAll('.lang-switch.open').forEach(function(s){ s.classList.remove('open'); });
    });
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
