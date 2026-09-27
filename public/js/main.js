/* ============================================================
   HELVARO — Shared JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initTopbarHoogte();
  initNav();
  initFAQ();
  initReveal();
  initStaggerReveal();
  initWhatsApp();
  initSmoothScroll();
  initContactForm();
  initFaroGids();
  initScrollProgress();
  initCountUp();
  initSpotlight();
  initHeroParallax();
  initCalculator();
  initBooking();
  initTheme();
  initSignature();
  initWordAnim();
  initMagnetic();
  initTilt();
  initCursor();
  initWatermarkParallax();
  initShowcase();
  initAgentbar();
  initNavDrop();
  initVideo();
  initOmzet();
  initNavActief();
});

/* ── Hoogte van de aankondigingsbalk ──────────────────────────────────────
   De nav staat vast op --topbar-h onder de bovenrand. Die hoogte stond als
   vast getal in de CSS, maar de balk breekt op een smalle telefoon of in
   een langere vertaling naar twee regels. Dan lag de nav over de tweede
   regel. We meten dus wat er echt staat. */
function initTopbarHoogte() {
  const bar = document.querySelector('.topbar');
  if (!bar) return;
  const zet = () => {
    document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
  };
  zet();
  window.addEventListener('resize', zet, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(zet);
}

/* ── Waar staan de plaatjes ───────────────────────────────────────────────
   De pagina's staan op drie diepten: de hoofdmap, sectoren/, agents/ en
   koppelingen/, en datzelfde nog eens onder /fr/ /en/ /de/ /es/. Een vast
   pad als "assets/faro/..." klopt dus alleen in de hoofdmap.

   We lezen het voorvoegsel af van een plaatje dat al in de pagina staat.
   Dat pad is door de bouwstap goed gezet, dus het klopt per definitie. */
function assetBasis(el) {
  var src = el && el.getAttribute && el.getAttribute('src');
  if (!src) return '';
  var m = src.match(/^(.*?)assets\//);
  return m ? m[1] : '';
}

/* ============================================================
   WORD ANIM — hero-titel verschijnt woord voor woord
   ============================================================ */
function initWordAnim() {
  const title = document.querySelector('.hero-title');
  if (!title || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let i = 0;
  function wrapWords(node) {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            frag.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement('span');
          span.className = 'w';
          span.style.animationDelay = (i++ * 70) + 'ms';
          span.textContent = part;
          frag.appendChild(span);
        });
        node.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        wrapWords(child);
      }
    });
  }
  wrapWords(title);
}

/* ============================================================
   MAGNETIC — knoppen trekken licht naar de cursor
   ============================================================ */
function initMagnetic() {
  if (window.matchMedia('(hover: none)').matches) return;
  document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('pointermove', e => {
      const r = btn.getBoundingClientRect();
      const dx = (e.clientX - r.left - r.width / 2) / r.width;
      const dy = (e.clientY - r.top - r.height / 2) / r.height;
      btn.style.transform = `translate(${(dx * 8).toFixed(1)}px, ${(dy * 6).toFixed(1)}px)`;
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.transform = '';
    });
  });
}



/* ============================================================
   CURSOR — eigen cursor-dot + ring (desktop)
   ============================================================ */
function initCursor() {
  if (window.matchMedia('(hover: none)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  const ring = document.createElement('div');
  ring.className = 'cursor-ring';
  dot.setAttribute('aria-hidden', 'true');
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(dot, ring);

  let mx = -100, my = -100, rx = -100, ry = -100;
  window.addEventListener('pointermove', e => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.transform = `translate(${mx}px, ${my}px)`;
  }, { passive: true });

  (function loop() {
    rx += (mx - rx) * 0.16;
    ry += (my - ry) * 0.16;
    ring.style.transform = `translate(${rx.toFixed(1)}px, ${ry.toFixed(1)}px)`;
    requestAnimationFrame(loop);
  })();

  document.addEventListener('pointerover', e => {
    ring.classList.toggle('on-link', !!e.target.closest('a, button'));
  });
}

/* ============================================================
   WATERMARK PARALLAX — sectienummers bewegen traag mee
   ============================================================ */
function initWatermarkParallax() {
  const headers = document.querySelectorAll('.section-header[data-num]');
  if (!headers.length) return;
  let ticking = false;
  function update() {
    ticking = false;
    const vh = window.innerHeight;
    headers.forEach(h => {
      const r = h.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      h.style.setProperty('--wm-shift', ((r.top - vh / 2) * 0.12).toFixed(1) + 'px');
    });
  }
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

/* ============================================================
   SIGNATURE — korrel, wordmark en sectienummers (alle pagina's)
   ============================================================ */
function initSignature() {
  // Filmkorrel-overlay
  const grain = document.createElement('div');
  grain.className = 'grain';
  grain.setAttribute('aria-hidden', 'true');
  document.body.appendChild(grain);

  // Footer-wordmark
  const footerInner = document.querySelector('.footer-inner');
  const footerBottom = document.querySelector('.footer-bottom');
  if (footerInner && footerBottom) {
    const wm = document.createElement('div');
    wm.className = 'footer-wordmark';
    wm.setAttribute('aria-hidden', 'true');
    wm.textContent = 'HELVARO';
    footerInner.insertBefore(wm, footerBottom);
  }

  // Sectienummer-watermerken (uit labels als "01 — ...")
  document.querySelectorAll('.section-label').forEach(label => {
    const m = label.textContent.trim().match(/^(\d{2})/);
    const header = label.closest('.section-header');
    if (m && header) header.setAttribute('data-num', m[1]);
  });
}

/* ============================================================
   NAV — sticky scroll + hamburger
   ============================================================ */
function initNav() {
  const nav = document.querySelector('.nav');
  const hamburger = document.querySelector('.nav-hamburger');
  const mobileMenu = document.querySelector('.nav-mobile');

  if (!nav) return;

  // Scroll class
  function onScroll() {
    nav.classList.toggle('scrolled', window.scrollY > 20);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Hamburger toggle
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(isOpen));
      if (isOpen) {
        mobileMenu.classList.add('open');
        document.body.style.overflow = 'hidden';
      } else {
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      }
    });

    // Close on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      });
    });

    // Close on backdrop click
    document.addEventListener('click', e => {
      if (
        mobileMenu.classList.contains('open') &&
        !mobileMenu.contains(e.target) &&
        !hamburger.contains(e.target)
      ) {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }
}

/* ============================================================
   FAQ — accordion
   ============================================================ */
function initFAQ() {
  const items = document.querySelectorAll('.faq-item');
  items.forEach(item => {
    const question = item.querySelector('.faq-question');
    if (!question) return;
    question.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      // Close all
      items.forEach(i => {
        i.classList.remove('open');
        const q = i.querySelector('.faq-question');
        if (q) q.setAttribute('aria-expanded', 'false');
      });
      // Toggle current
      if (!isOpen) {
        item.classList.add('open');
        question.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/* ============================================================
   SCROLL REVEAL — IntersectionObserver
   ============================================================ */
function initReveal() {
  const targets = document.querySelectorAll('.reveal, .reveal-scale');
  if (!targets.length) return;

  const show = el => el.classList.add('visible');

  // Fail-safe: zonder IntersectionObserver (of bij een viewport van 0px hoog,
  // zoals in sommige previews en headless browsers) tonen we alles meteen.
  // Content mag nooit permanent onzichtbaar blijven door een animatie.
  if (!('IntersectionObserver' in window) || !window.innerHeight) {
    targets.forEach(show);
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          show(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  targets.forEach(el => observer.observe(el));

  // Vangnet: wat na 3 seconden nog steeds verborgen is, tonen we alsnog.
  // Beschermt tegen randgevallen waarin de observer nooit afvuurt.
  window.setTimeout(() => {
    targets.forEach(el => {
      if (!el.classList.contains('visible')) show(el);
    });
  }, 3000);
}



/* ============================================================
   SMOOTH SCROLL — anchor links
   ============================================================ */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const id = anchor.getAttribute('href').slice(1);
      if (!id) return;
      const target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const navH = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--nav-h') || '70'
      );
      const top = target.getBoundingClientRect().top + window.scrollY - navH - 16;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

/* ============================================================
   SCROLL PROGRESS BAR
   ============================================================ */
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);

  function update() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

/* ============================================================
   COUNT-UP STATS — animate numbers when scrolled into view
   ============================================================ */
function initCountUp() {
  const els = document.querySelectorAll('[data-target]');
  if (!els.length) return;

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        const el = entry.target;
        const target = parseFloat(el.dataset.target);
        const prefix = el.dataset.prefix || '';
        const suffix = el.dataset.suffix || '';
        const duration = 1300;
        const start = performance.now();

        function tick(now) {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = prefix + Math.round(target * eased) + suffix;
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    },
    { threshold: 0.5 }
  );

  els.forEach(el => observer.observe(el));
}

/* ============================================================
   SPOTLIGHT — cursor-tracking glow on cards
   Enhanced: updates CSS custom properties for the radial gradient
   ============================================================ */
function initSpotlight() {
  if (window.matchMedia('(hover: none)').matches) return;
  const cards = document.querySelectorAll(
    '.feature-card, .proof-card, .pricing-card, .process-step, .comp-col, .form-card, .booking-placeholder, .lek-kaart, .verder-kaart'
  );
  cards.forEach(card => {
    card.classList.add('spot');
    card.addEventListener('pointermove', e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });
}

/* ============================================================
   STAGGER REVEAL — enhanced IntersectionObserver for staggered children
   ============================================================ */
function initStaggerReveal() {
  const containers = document.querySelectorAll('.reveal-stagger, .section-divider');
  if (!containers.length || !('IntersectionObserver' in window)) {
    containers.forEach(c => c.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -30px 0px' }
  );

  containers.forEach(el => observer.observe(el));
}

/* ============================================================
   HERO PARALLAX — glows follow the cursor subtly
   ============================================================ */
function initHeroParallax() {
  if (window.matchMedia('(hover: none)').matches) return;
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const g1 = hero.querySelector('.hero-glow');
  const g2 = hero.querySelector('.hero-glow-2');
  if (!g1) return;

  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    g1.style.transform = `translate(${x * 30}px, ${y * 30}px)`;
    if (g2) g2.style.transform = `translate(${x * -22}px, ${y * -22}px)`;
  });
}

/* ============================================================
   BOEKINGSAGENDA
   Toont de boekingspagina uit Google Agenda in de pagina zelf.
   Die haalt de vrije momenten rechtstreeks uit admins@helvaro.pro,
   dus wat een bezoeker ziet is altijd echt boekbaar en dubbele
   boekingen kunnen niet.
   Ander schema koppelen: pas data-booking aan in meeting.html.
   ============================================================ */
function initBooking() {
  const houder = document.querySelector('.booking-embed[data-booking]');
  if (!houder) return;

  const loader = houder.querySelector('.booking-loading');
  const frame = document.createElement('iframe');
  frame.src = houder.dataset.booking + '?gv=true';
  frame.title = 'Kies een moment voor je werkaudit';
  frame.loading = 'lazy';
  frame.addEventListener('load', () => {
    if (loader) loader.classList.add('hidden');
  });
  houder.appendChild(frame);
}

/* ============================================================
   ROI CALCULATOR — live berekening met eigen cijfers
   ============================================================ */
function initCalculator() {
  const calc = document.querySelector('.calc-card');
  if (!calc) return;

  const leadsInput = calc.querySelector('#calc-leads');
  const valueInput = calc.querySelector('#calc-value');
  const convInput = calc.querySelector('#calc-conv');
  const missInput = calc.querySelector('#calc-miss');
  const result = calc.querySelector('.calc-result-value');
  const outLeads = calc.querySelector('#calc-out-leads');
  const outClients = calc.querySelector('#calc-out-clients');
  if (!leadsInput || !valueInput || !convInput || !result) return;

  const fmt = new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0
  });
  const num = new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 0 });

  function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
  }

  function update() {
    const leads = clamp(parseFloat(leadsInput.value) || 0, 0, 100000);
    const value = clamp(parseFloat(valueInput.value) || 0, 0, 10000000);
    const conv = clamp(parseFloat(convInput.value) || 0, 0, 100);
    // Percentage leads dat niet binnen het uur wordt opgevolgd (instelbaar)
    const missPct = missInput ? clamp(parseFloat(missInput.value) || 0, 0, 100) : 50;

    const missedLeads = leads * (missPct / 100);
    const missedClients = missedLeads * (conv / 100);
    const lost = missedClients * value;

    result.textContent = fmt.format(Math.round(lost));
    if (outLeads) outLeads.textContent = num.format(Math.round(missedLeads));
    if (outClients) outClients.textContent = num.format(Math.round(missedClients));
  }

  [leadsInput, valueInput, convInput, missInput].forEach(input => {
    if (input) input.addEventListener('input', update);
  });
  update();
}

/* ============================================================
   CONTACT FORM — prevent default, show feedback
   ============================================================ */
/* Teksten van het contactformulier in vijf talen */
const FORM_TEKST = {
  nl: { bezig:'Versturen…', gelukt:'Verzonden ✓', fout:'Versturen mislukt',
        leeg:'Vul alle velden in.', email:'Vul een geldig e-mailadres in.',
        gelukt_uitleg:'Bedankt, we nemen binnen 24 uur contact op.',
        fout_uitleg:'Er ging iets mis. Mail ons rechtstreeks op hello@helvaro.pro.' ,
        faro_idle:'Vul je gegevens in, dan zorg ik dat je bericht bij de juiste persoon komt.',
        faro_denkt:'Dat ziet er compleet uit. Klik op verzenden en ik geef het door.',
        faro_klaar:'Verzonden. Iemand van ons leest het en komt bij je terug.' },
  fr: { bezig:'Envoi…', gelukt:'Envoyé ✓', fout:'Échec de l\'envoi',
        leeg:'Veuillez remplir tous les champs.', email:'Saisissez une adresse e-mail valide.',
        gelukt_uitleg:'Merci, nous vous recontactons sous 24 heures.',
        fout_uitleg:'Une erreur est survenue. Écrivez-nous à hello@helvaro.pro.' ,
        faro_idle:'Remplissez vos coordonnées et je veille à ce que votre message arrive au bon endroit.',
        faro_denkt:'Cela a l\'air complet. Cliquez sur envoyer et je le transmets.',
        faro_klaar:'Envoyé. Quelqu\'un de chez nous le lit et vous recontacte.' },
  en: { bezig:'Sending…', gelukt:'Sent ✓', fout:'Sending failed',
        leeg:'Please fill in every field.', email:'Enter a valid email address.',
        gelukt_uitleg:'Thanks, we will get back to you within 24 hours.',
        fout_uitleg:'Something went wrong. Email us directly at hello@helvaro.pro.' ,
        faro_idle:'Fill in your details and I\'ll make sure your message reaches the right person.',
        faro_denkt:'That looks complete. Hit send and I\'ll pass it on.',
        faro_klaar:'Sent. Someone here will read it and get back to you.' },
  de: { bezig:'Wird gesendet…', gelukt:'Gesendet ✓', fout:'Senden fehlgeschlagen',
        leeg:'Bitte füllen Sie alle Felder aus.', email:'Geben Sie eine gültige E-Mail-Adresse ein.',
        gelukt_uitleg:'Danke, wir melden uns innerhalb von 24 Stunden.',
        fout_uitleg:'Etwas ist schiefgelaufen. Schreiben Sie an hello@helvaro.pro.' ,
        faro_idle:'Tragen Sie Ihre Daten ein, dann sorge ich dafür, dass Ihre Nachricht ankommt.',
        faro_denkt:'Das sieht vollständig aus. Klicken Sie auf Senden, ich gebe es weiter.',
        faro_klaar:'Gesendet. Jemand von uns liest es und meldet sich bei Ihnen.' },
  es: { bezig:'Enviando…', gelukt:'Enviado ✓', fout:'Error al enviar',
        leeg:'Rellena todos los campos.', email:'Introduce un correo válido.',
        gelukt_uitleg:'Gracias, te contactamos en menos de 24 horas.',
        fout_uitleg:'Algo salió mal. Escríbenos a hello@helvaro.pro.' ,
        faro_idle:'Rellena tus datos y me aseguro de que tu mensaje llegue a la persona indicada.',
        faro_denkt:'Parece completo. Pulsa enviar y yo lo hago llegar.',
        faro_klaar:'Enviado. Alguien de nuestro equipo lo leerá y te responderá.' }
};

/* ============================================================
   CONTACTFORMULIER
   Verstuurt naar het adres in data-endpoint. Staat dat leeg, dan
   opent het de mailclient van de bezoeker met alles ingevuld, zodat
   een bericht nooit verloren gaat.
   Een endpoint instellen: data-endpoint="https://..." op het formulier.
   ============================================================ */
function initContactForm() {
  const form = document.querySelector('.helvaro-form');
  if (!form) return;

  const btn = form.querySelector('.form-submit');
  const btnTekst = btn ? btn.textContent : '';
  let melding = form.querySelector('.form-status');
  if (!melding) {
    melding = document.createElement('p');
    melding.className = 'form-status';
    melding.setAttribute('role', 'status');
    melding.setAttribute('aria-live', 'polite');
    form.appendChild(melding);
  }

  function taal() {
    const l = (document.documentElement.lang || 'nl').slice(0, 2);
    return FORM_TEKST[l] || FORM_TEKST.nl;
  }

  /* ── Faro bij dit formulier ────────────────────────────────────────
     Zelfde opzet als op de aanmeldpagina: zijn houding IS de statusregel,
     en elke houding zegt hetzelfde in woorden in de regel ernaast. Een
     houding is geen boodschap -- een schermlezer ziet hem niet, en wie
     kleurenblind is leest hem ook niet aan de rand af. */
  const faroVak  = form.querySelector('.signup-faro');
  const faroImg  = document.getElementById('contactFaro');
  const faroLine = document.getElementById('contactFaroLine');
  const FARO_IMG = {
    idle:  'assets/faro/falcon-idle.webp',
    denkt: 'assets/faro/falcon-thinking.webp',
    bezig: 'assets/faro/falcon-generating.webp',
    fout:  'assets/faro/falcon-error.webp',
    klaar: 'assets/faro/falcon-success.webp'
  };
  function zetFaro(toestand, tekst) {
    if (!faroVak || !faroImg || !faroLine) return;
    faroVak.setAttribute('data-faro-state', toestand);
    faroImg.src = assetBasis(faroImg) + (FARO_IMG[toestand] || FARO_IMG.idle);
    const tt = taal();
    faroLine.textContent = tekst || tt['faro_' + toestand] || tt.faro_idle || '';
  }

  function toon(soort, tekst) {
    melding.textContent = tekst;
    melding.className = 'form-status ' + soort;
  }

  function herstel() {
    if (!btn) return;
    btn.textContent = btnTekst;
    btn.disabled = false;
  }

  /* De beginregel staat in het Nederlands in de HTML, als terugval wanneer dit
     script niet laadt. Draait het wel, dan hoort hij de taal van de bezoeker te
     volgen -- de vertaalmachine van de site loopt eenmalig door de DOM en kent
     deze zin niet.

     Precies dezelfde val als in js/signup.js, en ik liep er alsnog in: bij het
     naleven stond er een Nederlandse beginregel op een Engelse pagina, terwijl
     alle andere toestanden wel klopten. Kijken naar het lang-attribuut lost het
     op EN doet meteen het goede wanneer iemand halverwege van taal wisselt met
     de kiezer in de navigatie. */
  function faroBeginregel() {
    const vak = form.querySelector('.signup-faro');
    // Niet overschrijven wanneer Faro iets specifiekers zegt (een fout, of
    // 'bezig') -- alleen de rusttoestand volgt de taal.
    if (!vak || vak.getAttribute('data-faro-state') !== 'idle') return;
    zetFaro('idle');
  }
  faroBeginregel();
  if (window.MutationObserver) {
    new MutationObserver(faroBeginregel).observe(document.documentElement, {
      attributes: true, attributeFilter: ['lang']
    });
  }

  /* Reageren terwijl je typt, niet pas bij verzenden. Zodra alles ingevuld is
     gaat hij van rust naar aandacht: dat is het moment waarop hij iets kan
     betekenen, en het maakt zichtbaar dat het formulier compleet is voordat je
     op de knop drukt. */
  form.addEventListener('input', () => {
    const vak = form.querySelector('.signup-faro');
    if (vak && vak.getAttribute('data-faro-state') === 'bezig') return;
    const velden = ['naam', 'email', 'bedrijf', 'bericht']
      .map(n => (form[n] ? String(form[n].value || '').trim() : ''));
    zetFaro(velden.every(Boolean) ? 'denkt' : 'idle');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const t = taal();

    const naam = (form.naam ? form.naam.value : '').trim();
    const email = (form.email ? form.email.value : '').trim();
    const bedrijf = (form.bedrijf ? form.bedrijf.value : '').trim();
    const bericht = (form.bericht ? form.bericht.value : '').trim();

    if (!naam || !email || !bedrijf || !bericht) {
      toon('error', t.leeg);
      zetFaro('fout', t.leeg);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      toon('error', t.email);
      zetFaro('fout', t.email);
      if (form.email) form.email.focus();
      return;
    }

    const endpoint = (form.dataset.endpoint || '').trim();

    if (!endpoint) {
      // Geen endpoint ingesteld: openen in de mailclient, zo raakt niets kwijt
      const onderwerp = 'Lead-analyse aanvraag — ' + bedrijf;
      const body = naam + ' (' + bedrijf + ')\n' + email + '\n\n' + bericht;
      window.location.href = 'mailto:hello@helvaro.pro?subject=' +
        encodeURIComponent(onderwerp) + '&body=' + encodeURIComponent(body);
      toon('ok', t.gelukt_uitleg);
      /* Bewust GEEN 'klaar': er is niets naar ons verstuurd, alleen het
         mailvenster van de bezoeker geopend. Faro juichen laten om iets dat
         nog moet gebeuren is precies het soort onwaarheid dat de rest van wat
         hij zegt verdacht maakt. */
      zetFaro('bezig');
      return;
    }

    if (btn) { btn.textContent = t.bezig; btn.disabled = true; }
    zetFaro('bezig');
    toon('', '');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ naam, email, bedrijf, bericht })
      });
      if (!res.ok) throw new Error('status ' + res.status);
      if (btn) btn.textContent = t.gelukt;
      toon('ok', t.gelukt_uitleg);
      zetFaro('klaar');
      form.reset();
      setTimeout(herstel, 4000);
    } catch (err) {
      if (btn) btn.textContent = t.fout;
      toon('error', t.fout_uitleg);
      zetFaro('fout', t.fout_uitleg);
      setTimeout(herstel, 4000);
    }
  });
}



/* ============================================================
   THEMA — licht of donker, keuze blijft bewaard.
   Het thema wordt al in de <head> gezet zodat de pagina niet
   even in de verkeerde kleur flitst; hier hangen we enkel de
   knop eraan.
   ============================================================ */
function initTheme() {
  var root = document.documentElement;

  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function apply(theme, animate) {
    if (animate) {
      root.classList.add('theme-anim');
      window.setTimeout(function () { root.classList.remove('theme-anim'); }, 320);
    }
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('helvaro_theme', theme); } catch (e) {}
    /* De browserbalk mee laten kleuren. Stond als twee media-query-metatags in
       de head, maar die keken naar de voorkeur van het BESTURINGSSYSTEEM -- en
       die bepaalt hier niets meer sinds donker de standaard is. */
    var kleurTag = document.querySelector('meta[name="theme-color"]');
    if (kleurTag) kleurTag.setAttribute('content', theme === 'dark' ? '#121212' : '#FFFFFF');
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    });
  }

  // Beginwaarde vastleggen (de head-code zette het attribuut al)
  apply(current(), false);

  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      apply(current() === 'dark' ? 'light' : 'dark', true);
    });
  });
}

/* ============================================================
   WHATSAPP MOCKUP — zelfspelend gesprek met IntersectionObserver
   Berichten verschijnen in volgorde met typindicator, loopt door,
   pauzeert wanneer buiten beeld, respecteert reduced-motion.
   ============================================================ */
function initWhatsApp() {
  const chat = document.querySelector('.wa-chat');
  if (!chat) return;

  const messages = Array.from(chat.querySelectorAll('.wa-msg'));
  const typing = chat.querySelector('.wa-typing');
  if (!messages.length) return;

  // Reduced motion: toon alles statisch
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    messages.forEach(m => m.classList.add('visible'));
    return;
  }

  let loopTimer = null;
  let timeouts = [];
  let isVisible = true;

  function clearAllTimeouts() {
    timeouts.forEach(t => clearTimeout(t));
    timeouts = [];
    if (loopTimer) { clearTimeout(loopTimer); loopTimer = null; }
  }

  function showMessage(index) {
    if (index >= messages.length) return;
    messages[index].classList.add('visible');
    // Sand pulse on the appointment confirmation (last received message with link)
    const bubble = messages[index].querySelector('.wa-bubble-link');
    if (bubble) {
      bubble.classList.add('pulse');
      setTimeout(() => bubble.classList.remove('pulse'), 700);
    }
    chat.scrollTop = chat.scrollHeight;
  }

  function run() {
    if (!isVisible) return;

    // Reset
    clearAllTimeouts();
    messages.forEach(m => m.classList.remove('visible'));
    if (typing) typing.classList.remove('visible');

    // Schedule each message
    messages.forEach((msg, i) => {
      const delay = 1200 + i * 1300;

      // Typing indicator before received messages
      if (msg.classList.contains('received') && typing) {
        timeouts.push(setTimeout(() => {
          if (!isVisible) return;
          typing.classList.add('visible');
          chat.scrollTop = chat.scrollHeight;
        }, delay - 700));
        timeouts.push(setTimeout(() => {
          typing.classList.remove('visible');
        }, delay - 50));
      }

      timeouts.push(setTimeout(() => {
        if (!isVisible) return;
        showMessage(i);
      }, delay));
    });

    // Restart loop after all messages + pause
    const totalDelay = 1200 + messages.length * 1300 + 4000;
    loopTimer = setTimeout(run, totalDelay);
  }

  // IntersectionObserver: pause when off-screen
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          const wasVisible = isVisible;
          isVisible = entry.isIntersecting;
          if (isVisible && !wasVisible) {
            // Came into view: restart
            run();
          } else if (!isVisible && wasVisible) {
            // Left view: pause
            clearAllTimeouts();
          }
        });
      },
      { threshold: 0.3 }
    );
    observer.observe(chat.closest('.phone-wrap') || chat);
  }

  // Start after a short initial delay
  setTimeout(run, 800);
}

/* ============================================================
   TILT — de telefoon kantelt licht mee met de muis
   ============================================================ */
function initTilt() {
  if (window.matchMedia('(hover: none)').matches) return;
  const wrap = document.querySelector('.phone-wrap');
  const hero = document.querySelector('.hero');
  if (!wrap || !hero) return;
  hero.addEventListener('pointermove', e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    wrap.style.transform = `perspective(1000px) rotateY(${(x * 6).toFixed(2)}deg) rotateX(${(-y * 5).toFixed(2)}deg)`;
  });
  hero.addEventListener('pointerleave', () => {
    wrap.style.transform = '';
  });
}


/* ============================================================
   FARO LOOPT MET JE MEE
   Hij verandert van houding per sectie en zegt in één zin waar je naar
   kijkt.

   Wat hier bewust NIET gebeurt: de pagina wordt niet gekaapt. Geen
   scroll-jacking, geen vastgezette secties. Je scrollt zoals je gewend
   bent; hij reageert erop. Andersom is het zijn pagina geworden in
   plaats van die van de bezoeker.

   Wegklikbaar, en dat onthouden we. Iets dat meescrollt en niet weg kan
   is geen gids maar een banner.
   ============================================================ */
var FARO_GIDS = {
  hero: { pose: 'thinking', stem: 'denkt', plek: 'rechtsonder',
              nl: 'Dit is het probleem in één zin: de aanvragen komen al binnen, alleen antwoordt er niemand op tijd.',
              en: 'Here is the problem in one line: the enquiries are already coming in, nobody answers them in time.',
              fr: 'Voilà le problème en une phrase : les demandes arrivent déjà, personne n’y répond à temps.',
              de: 'Das Problem in einem Satz: Die Anfragen kommen längst, nur antwortet niemand rechtzeitig.',
              es: 'El problema en una frase: las solicitudes ya entran, pero nadie responde a tiempo.' },
  stroom: { pose: 'thinking', stem: 'wijst', plek: 'linksonder',
              nl: 'Links komt je koper binnen, rechts staat je agenda. Alles ertussen is Helvaro.',
              en: 'Your buyer comes in on the left, your calendar sits on the right. Everything between the two is Helvaro.',
              fr: 'Votre acheteur arrive à gauche, votre agenda est à droite. Tout ce qui se trouve entre les deux, c’est Helvaro.',
              de: 'Links kommt Ihr Käufer herein, rechts steht Ihr Kalender. Alles dazwischen ist Helvaro.',
              es: 'Tu comprador entra por la izquierda y tu agenda está a la derecha. Todo lo que hay en medio es Helvaro.' },
  probleem: { pose: 'thinking', stem: 'ernstig', plek: 'rechtsmidden',
              nl: 'Drie plekken waar marge weglekt. Geen ervan gaat over te weinig belangstelling.',
              en: 'Three places where margin leaks away. None of them are about too little interest.',
              fr: 'Trois endroits où la marge se perd. Aucun ne concerne un manque d’intérêt.',
              de: 'Drei Stellen, an denen Marge versickert. Keine davon hat mit zu wenig Interesse zu tun.',
              es: 'Tres puntos por donde se escapa margen. Ninguno tiene que ver con falta de interés.' },
  lagen: { pose: 'generating', stem: 'legt uit', plek: 'linksmidden',
              nl: 'Een chatbot doet laag drie en stopt daar. Wij doen ze alle vijf.',
              en: 'A chatbot does layer three and stops there. We do all five.',
              fr: 'Un chatbot fait la troisième couche et s’arrête là. Nous faisons les cinq.',
              de: 'Ein Chatbot macht Schicht drei und hört da auf. Wir machen alle fünf.',
              es: 'Un chatbot hace la capa tres y ahí se para. Nosotros hacemos las cinco.' },
  kenteken: { pose: 'thinking', stem: 'speurt', plek: 'rechtsmidden',
              nl: 'Alles wat over een wagen gezegd wordt, komt uit jouw voorraad. Niets wordt verzonnen.',
              en: 'Everything said about a vehicle comes from your own stock. Nothing is invented.',
              fr: 'Tout ce qui est dit sur un véhicule vient de votre propre stock. Rien n’est inventé.',
              de: 'Alles, was über ein Fahrzeug gesagt wird, kommt aus Ihrem eigenen Bestand. Nichts wird erfunden.',
              es: 'Todo lo que se dice sobre un vehículo sale de tu propio stock. No se inventa nada.' },
  centrum: { pose: 'generating', stem: 'toont', plek: 'linksboven',
              nl: 'Dit scherm is een voorbeeld, geen klantcijfer. Zodra de pilot gemeten is, staan de echte cijfers er.',
              en: 'This screen is an example, not a customer result. The moment the pilot is measured, the real numbers go here.',
              fr: 'Cet écran est un exemple, pas un résultat client. Dès que le pilote sera mesuré, les vrais chiffres apparaîtront ici.',
              de: 'Dieser Bildschirm ist ein Beispiel, kein Kundenergebnis. Sobald der Pilot gemessen ist, stehen hier die echten Zahlen.',
              es: 'Esta pantalla es un ejemplo, no un resultado de cliente. En cuanto midamos el piloto, aquí estarán las cifras reales.' },
  controle: { pose: 'idle', stem: 'nuchter', plek: 'rechtsmidden',
              nl: 'Je verkoper stapt op elk moment in het gesprek. Wat zonder hem mag, zet jij per actietype.',
              en: 'Your salesperson can step into any conversation at any time. What runs without them is yours to set, per action type.',
              fr: 'Votre vendeur peut reprendre n’importe quelle conversation à tout moment. Ce qui se fait sans lui, c’est vous qui le décidez, par type d’action.',
              de: 'Ihr Verkäufer steigt jederzeit ins Gespräch ein. Was ohne ihn läuft, bestimmen Sie je Aktionstyp.',
              es: 'Tu vendedor entra en la conversación cuando quiera. Lo que va sin él lo decides tú, por tipo de acción.' },
  overname: { pose: 'idle', stem: 'nuchter', plek: 'rechtsmidden',
              nl: 'Eén bericht van je verkoper en het systeem zwijgt. De koper merkt geen overdracht.',
              en: 'One message from your salesperson and the system goes quiet. The buyer notices no handover.',
              fr: 'Un message de votre vendeur et le système se tait. L’acheteur ne remarque aucun transfert.',
              de: 'Eine Nachricht Ihres Verkäufers und das System schweigt. Der Käufer merkt von der Übergabe nichts.',
              es: 'Un mensaje de tu vendedor y el sistema calla. El comprador no nota el traspaso.' },
  herkomst: { pose: 'idle', stem: 'rustig', plek: 'linksonder',
              nl: 'Belgisch bedrijf, verwerking binnen de EU. Geen doorverkoper met een Amerikaans dashboard.',
              en: 'Belgian company, processing inside the EU. Not a reseller with an American dashboard.',
              fr: 'Entreprise belge, traitement au sein de l’UE. Pas un revendeur avec un tableau de bord américain.',
              de: 'Belgisches Unternehmen, Verarbeitung innerhalb der EU. Kein Wiederverkäufer mit amerikanischem Dashboard.',
              es: 'Empresa belga, tratamiento dentro de la UE. No un revendedor con un panel estadounidense.' },
  verschil: { pose: 'idle', stem: 'nuchter', plek: 'rechtsboven',
              nl: 'Chatbot, losse tool, systeem. Ze lijken op elkaar tot je ziet wat er in je agenda belandt.',
              en: 'Chatbot, single tool, system. They look alike until you see what actually lands in your calendar.',
              fr: 'Chatbot, outil isolé, système. Ils se ressemblent jusqu’à ce qu’on regarde ce qui arrive vraiment dans l’agenda.',
              de: 'Chatbot, einzelnes Werkzeug, System. Sie ähneln sich, bis man sieht, was wirklich im Kalender landet.',
              es: 'Chatbot, herramienta suelta, sistema. Se parecen hasta que miras qué acaba de verdad en tu agenda.' },
  binnen: { pose: 'generating', stem: 'werkt', plek: 'rechtsonder',
              nl: 'Wat binnenkomt krijgt antwoord. Ook om kwart voor elf, ook op zondag.',
              en: 'Whatever comes in gets an answer. Also at a quarter to eleven, also on a Sunday.',
              fr: 'Tout ce qui arrive reçoit une réponse. Même à vingt-trois heures moins le quart, même le dimanche.',
              de: 'Was hereinkommt, bekommt eine Antwort. Auch um Viertel vor elf, auch sonntags.',
              es: 'Todo lo que entra recibe respuesta. También a las once menos cuarto, también el domingo.' },
  uitgaand: { pose: 'generating', stem: 'port', plek: 'linksonder',
              nl: 'Tussen belangstelling en een handtekening staan drie vragen: rijden, inruilen en betalen.',
              en: 'Between interest and a signature sit three questions: driving it, trading in, and paying for it.',
              fr: 'Entre l’intérêt et la signature, il y a trois questions : l’essai, la reprise et le financement.',
              de: 'Zwischen Interesse und Unterschrift stehen drei Fragen: fahren, in Zahlung geben und bezahlen.',
              es: 'Entre el interés y la firma hay tres preguntas: probarlo, entregar el usado y pagarlo.' },
  vasthouden: { pose: 'generating', stem: 'port', plek: 'rechtsonder',
              nl: 'Een gesprek dat stilvalt is geen afwijzing. Het is werk dat je al betaald hebt.',
              en: 'A conversation that goes quiet is not a rejection. It is work you have already paid for.',
              fr: 'Une conversation qui s’arrête n’est pas un refus. C’est du travail que vous avez déjà payé.',
              de: 'Ein Gespräch, das verstummt, ist keine Absage. Es ist Arbeit, für die Sie schon bezahlt haben.',
              es: 'Una conversación que se apaga no es un no. Es trabajo que ya has pagado.' },
  beginnen: { pose: 'idle', stem: 'nuchter', plek: 'linksmidden',
              nl: 'Begin met één werkstroom. Alles tegelijk aanzetten klinkt efficiënt en werkt zelden.',
              en: 'Start with one workflow. Switching everything on at once sounds efficient and rarely works.',
              fr: 'Commencez par un seul flux. Tout activer d’un coup paraît efficace et fonctionne rarement.',
              de: 'Fangen Sie mit einem Ablauf an. Alles gleichzeitig einzuschalten klingt effizient und klappt selten.',
              es: 'Empieza por un solo flujo. Encenderlo todo a la vez suena eficiente y casi nunca funciona.' },
  dag: { pose: 'thinking', stem: 'ernstig', plek: 'rechtsmidden',
              nl: 'Zes momenten op één donderdag. Geen ervan is op te lossen door harder te werken.',
              en: 'Six moments on a single Thursday. None of them can be fixed by working harder.',
              fr: 'Six moments en un seul jeudi. Aucun ne se règle en travaillant plus dur.',
              de: 'Sechs Momente an einem einzigen Donnerstag. Keiner davon löst sich durch härteres Arbeiten.',
              es: 'Seis momentos en un solo jueves. Ninguno se arregla trabajando más duro.' },
  voorwie: { pose: 'idle', stem: 'eerlijk', plek: 'linksonder',
              nl: 'Rechts staat voor wie dit niet is. Die lijst kost ons klanten en levert er betere op.',
              en: 'On the right is who this is not for. That list costs us customers and brings in better ones.',
              fr: 'À droite, ceux pour qui ce n’est pas fait. Cette liste nous coûte des clients et nous en apporte de meilleurs.',
              de: 'Rechts steht, für wen das nicht ist. Diese Liste kostet uns Kunden und bringt uns bessere.',
              es: 'A la derecha está para quién no es esto. Esa lista nos cuesta clientes y nos trae mejores.' },
  taal: { pose: 'thinking', stem: 'legt uit', plek: 'rechtsboven',
              nl: 'Het weet dat xDrive iets anders is dan quattro. Een algemene assistent stelt algemene vragen.',
              en: 'It knows xDrive is not the same as quattro. A general assistant asks general questions.',
              fr: 'Il sait que xDrive n’est pas quattro. Un assistant généraliste pose des questions générales.',
              de: 'Es weiß, dass xDrive nicht quattro ist. Ein allgemeiner Assistent stellt allgemeine Fragen.',
              es: 'Sabe que xDrive no es quattro. Un asistente genérico hace preguntas genéricas.' },
  grenzen: { pose: 'idle', stem: 'eerlijk', plek: 'rechtsonder',
              nl: 'Geen prijsafspraken, geen inruilbedrag, geen telefoon. Liever nu duidelijk dan in maand drie.',
              en: 'No price deals, no trade-in figure, no phone. Better clear now than in month three.',
              fr: 'Pas de négociation, pas de montant de reprise, pas de téléphone. Mieux vaut être clair maintenant qu’au troisième mois.',
              de: 'Keine Preisabsprachen, kein Inzahlungnahmebetrag, kein Telefon. Lieber jetzt klar als im dritten Monat.',
              es: 'Sin acuerdos de precio, sin importe de tasación, sin teléfono. Mejor claro ahora que en el tercer mes.' },
  werkstroom: { pose: 'generating', stem: 'werkt', plek: 'linksonder',
              nl: 'Dit is één route door hetzelfde systeem. Dezelfde koper, dezelfde wagen, hetzelfde dossier.',
              en: 'This is one route through the same system. Same buyer, same vehicle, same file.',
              fr: 'C’est un parcours dans le même système. Même acheteur, même véhicule, même dossier.',
              de: 'Das ist ein Weg durch dasselbe System. Derselbe Käufer, dasselbe Fahrzeug, dieselbe Akte.',
              es: 'Esta es una ruta por el mismo sistema. El mismo comprador, el mismo vehículo, el mismo expediente.' },
  gesprek: { pose: 'generating', stem: 'toont', plek: 'rechtsmidden',
              nl: 'Zo klinkt het echt. Kort, in jouw toon, en met de wagen erbij waar het over gaat.',
              en: 'This is how it actually sounds. Short, in your tone, and with the vehicle it is about.',
              fr: 'Voilà à quoi cela ressemble vraiment. Court, dans votre ton, et avec le véhicule concerné.',
              de: 'So klingt es wirklich. Kurz, in Ihrem Ton, und mit dem Fahrzeug, um das es geht.',
              es: 'Así suena de verdad. Corto, en tu tono, y con el vehículo del que se trata.' },
  opbrengst: { pose: 'success', stem: 'trots', plek: 'rechtsonder',
              nl: 'Dit is wat het oplevert. Geen percentages zonder bron, wel wat er bij jou verandert.',
              en: 'This is what it returns. No percentages without a source, just what changes for you.',
              fr: 'Voilà ce que cela rapporte. Pas de pourcentages sans source, juste ce qui change chez vous.',
              de: 'Das bringt es. Keine Prozente ohne Quelle, sondern was sich bei Ihnen ändert.',
              es: 'Esto es lo que aporta. Sin porcentajes sin fuente, solo lo que cambia en tu caso.' },
  systeem: { pose: 'generating', stem: 'legt uit', plek: 'linksmidden',
              nl: 'Deze werkstroom staat niet los. Hij deelt geheugen met alle andere.',
              en: 'This workflow does not stand alone. It shares memory with all the others.',
              fr: 'Ce flux n’existe pas isolément. Il partage sa mémoire avec tous les autres.',
              de: 'Dieser Ablauf steht nicht für sich. Er teilt sein Gedächtnis mit allen anderen.',
              es: 'Este flujo no va suelto. Comparte memoria con todos los demás.' },
  agents: { pose: 'success', stem: 'trots', plek: 'linksmidden',
              nl: 'Acht werkstromen, maar één geheugen en één agenda eronder.',
              en: 'Eight workflows, but one shared memory and one calendar underneath.',
              fr: 'Huit flux de travail, mais une seule mémoire et un seul agenda en dessous.',
              de: 'Acht Arbeitsabläufe, aber ein gemeinsames Gedächtnis und ein Kalender darunter.',
              es: 'Ocho flujos de trabajo, pero una sola memoria y una sola agenda debajo.' },
  koppel: { pose: 'idle', stem: 'eerlijk', plek: 'rechtsboven',
              nl: 'Wat live staat noemen we live. Wat nog gebouwd wordt ook.',
              en: 'What is live we call live. What is still being built, we call that too.',
              fr: 'Ce qui est en ligne, nous le disons. Ce qui est encore en construction aussi.',
              de: 'Was live ist, nennen wir live. Was noch gebaut wird, auch.',
              es: 'Lo que está en marcha lo llamamos así. Lo que aún se está construyendo, también.' },
  woorden: { pose: 'idle', stem: 'nuchter', plek: 'linksboven',
              nl: 'Drie woorden met een betekenis. Elders staat alles op één hoop met logo’s erbij.',
              en: 'Three words that mean something. Elsewhere it all goes on one pile with logos beside it.',
              fr: 'Trois mots qui veulent dire quelque chose. Ailleurs, tout est mis dans le même sac avec des logos.',
              de: 'Drei Wörter, die etwas bedeuten. Anderswo landet alles auf einem Haufen, mit Logos daneben.',
              es: 'Tres palabras que significan algo. En otros sitios todo va al mismo montón con logotipos al lado.' },
  zonder: { pose: 'idle', stem: 'nuchter', plek: 'rechtsonder',
              nl: 'Een voorraadbestand, één regel op je site en een agenda. Meer is er niet nodig.',
              en: 'A stock file, one line on your site and a calendar. Nothing more is needed.',
              fr: 'Un fichier de stock, une ligne sur votre site et un agenda. Rien de plus.',
              de: 'Eine Bestandsdatei, eine Zeile auf Ihrer Website und ein Kalender. Mehr braucht es nicht.',
              es: 'Un archivo de stock, una línea en tu web y una agenda. No hace falta más.' },
  volgorde: { pose: 'idle', stem: 'open', plek: 'linksonder',
              nl: 'Autobedrijven bepalen wat er als eerste af is. Bouwen zonder gebruiker levert de verkeerde koppeling op.',
              en: 'Dealerships decide what gets finished first. Building without a user gives you the wrong integration.',
              fr: 'Ce sont les concessions qui décident de ce qui sort en premier. Construire sans utilisateur donne la mauvaise intégration.',
              de: 'Autohäuser bestimmen, was zuerst fertig ist. Ohne Nutzer zu bauen ergibt die falsche Anbindung.',
              es: 'Los concesionarios deciden qué se termina primero. Construir sin usuario da la integración equivocada.' },
  stand: { pose: 'idle', stem: 'eerlijk', plek: 'rechtsboven',
              nl: 'Hier staat wat er vandaag werkelijk is. Inclusief wat er nog niet is.',
              en: 'Here is what actually exists today. Including what does not exist yet.',
              fr: 'Voici ce qui existe réellement aujourd’hui. Y compris ce qui n’existe pas encore.',
              de: 'Hier steht, was es heute wirklich gibt. Einschließlich dessen, was es noch nicht gibt.',
              es: 'Aquí está lo que existe hoy de verdad. Incluido lo que todavía no existe.' },
  doet: { pose: 'generating', stem: 'werkt', plek: 'linksmidden',
              nl: 'Wat deze koppeling doet, in gewone zinnen. Geen functielijst.',
              en: 'What this integration does, in plain sentences. Not a feature list.',
              fr: 'Ce que fait cette intégration, en phrases simples. Pas une liste de fonctions.',
              de: 'Was diese Anbindung tut, in einfachen Sätzen. Keine Funktionsliste.',
              es: 'Lo que hace esta integración, en frases normales. No una lista de funciones.' },
  stapel: { pose: 'thinking', stem: 'legt uit', plek: 'rechtsmidden',
              nl: 'Waar dit in het geheel past. Elke koppeling draagt een stuk van hetzelfde gesprek.',
              en: 'Where this fits in the whole. Every integration carries a piece of the same conversation.',
              fr: 'Où cela s’inscrit dans l’ensemble. Chaque intégration porte une partie de la même conversation.',
              de: 'Wo das ins Ganze passt. Jede Anbindung trägt ein Stück desselben Gesprächs.',
              es: 'Dónde encaja esto en el conjunto. Cada integración lleva una parte de la misma conversación.' },
  vragen: { pose: 'idle', stem: 'open', plek: 'rechtsonder',
              nl: 'De vragen die autobedrijven echt stellen, met het eerlijke antwoord erbij.',
              en: 'The questions dealerships really ask, with the honest answer next to them.',
              fr: 'Les questions que les concessions posent vraiment, avec la réponse honnête à côté.',
              de: 'Die Fragen, die Autohäuser wirklich stellen, mit der ehrlichen Antwort daneben.',
              es: 'Las preguntas que de verdad hacen los concesionarios, con la respuesta honesta al lado.' },
  eerlijk: { pose: 'idle', stem: 'eerlijk', plek: 'linksonder',
              nl: 'Rechts staat wat we niet beweren. Dat is nuttiger dan nog een lijst met voordelen.',
              en: 'On the right is what we do not claim. That is more useful than another list of benefits.',
              fr: 'À droite, ce que nous ne prétendons pas. C’est plus utile qu’une liste d’avantages de plus.',
              de: 'Rechts steht, was wir nicht behaupten. Das ist nützlicher als noch eine Vorteilsliste.',
              es: 'A la derecha está lo que no afirmamos. Eso es más útil que otra lista de ventajas.' },
  ruil: { pose: 'idle', stem: 'open', plek: 'rechtsmidden',
              nl: 'Wat jij inbrengt en wat je terugkrijgt. Je eigen cijfers zijn van jou, ook als je stopt.',
              en: 'What you put in and what you get back. Your own numbers are yours, even if you stop.',
              fr: 'Ce que vous apportez et ce que vous recevez. Vos chiffres vous appartiennent, même si vous arrêtez.',
              de: 'Was Sie einbringen und was Sie zurückbekommen. Ihre Zahlen gehören Ihnen, auch wenn Sie aufhören.',
              es: 'Lo que aportas y lo que recibes. Tus cifras son tuyas, también si lo dejas.' },
  later: { pose: 'idle', stem: 'open', plek: 'linksonder',
              nl: 'Zo gaat een case er hier uitzien. Ontbreekt er een van de zes, dan is het een aanbeveling.',
              en: 'This is what a case will look like here. If one of the six is missing, it is a testimonial.',
              fr: 'Voilà à quoi ressemblera un cas ici. S’il manque l’un des six, c’est une recommandation.',
              de: 'So wird hier eine Fallstudie aussehen. Fehlt einer der sechs Punkte, ist es eine Empfehlung.',
              es: 'Así será un caso aquí. Si falta uno de los seis, es una recomendación.' },
  rest: { pose: 'thinking', stem: 'ernstig', plek: 'linksmidden',
              nl: 'Onbeantwoorde aanvragen zijn het makkelijkst te tellen. Zelden het grootste.',
              en: 'Unanswered enquiries are the easiest to count. Rarely the biggest.',
              fr: 'Les demandes sans réponse sont les plus faciles à compter. Rarement les plus grosses.',
              de: 'Unbeantwortete Anfragen sind am leichtesten zu zählen. Selten die größten.',
              es: 'Las solicitudes sin responder son las más fáciles de contar. Rara vez las mayores.' },
  pilot: { pose: 'idle', stem: 'open', plek: 'rechtsonder',
              nl: 'Wat het bij jou doet, tellen we bij jou. Twee weken ervoor, vier weken erna.',
              en: 'What it does at your business, we count at your business. Two weeks before, four weeks after.',
              fr: 'Ce que cela donne chez vous, nous le comptons chez vous. Deux semaines avant, quatre semaines après.',
              de: 'Was es bei Ihnen bringt, zählen wir bei Ihnen. Zwei Wochen davor, vier Wochen danach.',
              es: 'Lo que hace en tu caso lo contamos en tu caso. Dos semanas antes, cuatro semanas después.' },
  faro: { pose: 'idle', stem: 'nieuwsgierig', plek: 'linksonder',
              nl: 'Dit ben ik. Ik ben niet het product, maar de laag waarin je meeleest, overneemt en vragen stelt.',
              en: 'This is me. I am not the product, but the layer where you read along, take over and ask questions.',
              fr: 'C’est moi. Je ne suis pas le produit, mais la couche où vous suivez, reprenez la main et posez des questions.',
              de: 'Das bin ich. Ich bin nicht das Produkt, sondern die Schicht, in der Sie mitlesen, übernehmen und Fragen stellen.',
              es: 'Este soy yo. No soy el producto, sino la capa en la que lees, tomas el relevo y preguntas.' },
  rekenen: { pose: 'generating', stem: 'rekent', plek: 'rechtsonder',
              nl: 'Vul je eigen cijfers in, dan zie je zwart op wit wat trage opvolging je aan marge kost.',
              en: 'Put in your own numbers and you will see in black and white what slow follow-up costs you in margin.',
              fr: 'Entrez vos propres chiffres et vous verrez noir sur blanc ce qu’un suivi lent vous coûte en marge.',
              de: 'Tragen Sie Ihre eigenen Zahlen ein, dann sehen Sie schwarz auf weiß, was langsames Nachfassen an Marge kostet.',
              es: 'Introduce tus propios números y verás negro sobre blanco lo que cuesta en margen un seguimiento lento.' },
  verder: { pose: 'idle', stem: 'wijst', plek: 'linksmidden',
              nl: 'Wil je dieper, dan staat het hier. Niet op de voorpagina, want dan leest niemand de prijs.',
              en: 'If you want to go deeper, it is all here. Not on the front page, or nobody reaches the price.',
              fr: 'Si vous voulez aller plus loin, c’est ici. Pas en page d’accueil, sinon personne n’atteint le prix.',
              de: 'Wenn Sie tiefer wollen, steht es hier. Nicht auf der Startseite, sonst erreicht niemand den Preis.',
              es: 'Si quieres profundizar, está aquí. No en la portada, o nadie llega al precio.' },
  prijs: { pose: 'idle', stem: 'wijst', plek: 'linksmidden',
              nl: 'Eén prijs, alles inbegrepen. Geen setupkosten en maandelijks opzegbaar.',
              en: 'One price, everything included. No setup fee, cancel monthly.',
              fr: 'Un seul prix, tout compris. Sans frais de mise en route, résiliable chaque mois.',
              de: 'Ein Preis, alles inklusive. Keine Einrichtungsgebühr, monatlich kündbar.',
              es: 'Un solo precio, todo incluido. Sin coste de instalación y cancelable cada mes.' },
  plannen: { pose: 'success', stem: 'trots', plek: 'rechtsboven',
              nl: 'Drie plannen, maandelijks opzegbaar. Geen setupkosten.',
              en: 'Three plans, cancel monthly. No setup fee.',
              fr: 'Trois formules, résiliables chaque mois. Sans frais de mise en route.',
              de: 'Drei Tarife, monatlich kündbar. Keine Einrichtungsgebühr.',
              es: 'Tres planes, cancelables cada mes. Sin coste de instalación.' },
  start: { pose: 'success', stem: 'juicht', plek: 'rechtsonder',
              nl: 'Klaar om te starten? Je staat binnen 72 uur live.',
              en: 'Ready to start? You are live within 72 hours.',
              fr: 'Prêt à démarrer ? Vous êtes en ligne sous 72 heures.',
              de: 'Bereit loszulegen? Sie sind in 72 Stunden live.',
              es: '¿Listo para empezar? Estás en marcha en 72 horas.' }
};

function initFaroGids() {
  var doos = document.getElementById('faroGids');
  var img  = document.getElementById('faroGidsImg');
  var reg  = document.getElementById('faroGidsTekst');
  var weg  = document.getElementById('faroGidsSluit');
  if (!doos || !img || !reg) return;

  /* Wegklikken gold voorgoed: één klik en Faro kwam op dat toestel nooit
     meer terug, zonder enige manier om hem terug te halen. Dat is te zwaar
     voor een kruisje. De keuze houdt nu twee weken stand en vervalt daarna. */
  try {
    var weggeklikt = localStorage.getItem('helvaro_faro_gids');
    if (weggeklikt) {
      var tot = parseInt(weggeklikt, 10);
      if (weggeklikt === 'uit') {           /* oude waarde zonder datum */
        localStorage.removeItem('helvaro_faro_gids');
      } else if (tot && Date.now() < tot) {
        return;
      } else {
        localStorage.removeItem('helvaro_faro_gids');
      }
    }
  } catch (e) {}

  var secties = document.querySelectorAll('[data-gids]');
  if (!secties.length || !('IntersectionObserver' in window)) return;

  var huidig = '';
  function taal() {
    return (document.documentElement.lang || 'nl').slice(0, 2).toLowerCase();
  }
  var ballon = document.getElementById('faroGidsBallon');

  function toon(sleutel) {
    var g = FARO_GIDS[sleutel];
    if (!g || sleutel === huidig) return;
    huidig = sleutel;
    doos.hidden = false;
    var plek = g.plek || 'rechtsonder';
    doos.setAttribute('data-plek', plek);
    doos.setAttribute('data-stem', g.stem || 'rust');
    /* De ballon staat altijd aan de kant van het schermmidden, dus de
       staart wijst naar de valk en niet het beeld uit. */
    /* Hij staat altijd rechtsonder, dus de ballon staat altijd links van
       hem en de punt wijst naar rechts. */
    doos.setAttribute('data-kant', 'rechts');
    img.src = assetBasis(img) + 'assets/faro/falcon-' + g.pose + '.webp';
    reg.textContent = g[taal()] || g.nl;
    /* De ballon opnieuw laten opkomen bij elke nieuwe zin. Zonder dit
       wisselt alleen de tekst en lijkt het alsof er niets gebeurd is. */
    if (ballon && !knop) {
      ballon.style.animation = 'none';
      void ballon.offsetWidth;          // forceer een herstart
      ballon.style.animation = '';
    }
    /* In de balk praat hij niet uit zichzelf: een stip zegt dat er een
       nieuwe zin klaarstaat. Staat de ballon al open, dan wisselt de zin mee. */
    if (knop && !doos.classList.contains('open')) doos.classList.add('nieuw');
  }

  /* ── Op de telefoon: in de navigatiebalk ─────────────────────────────
     Op 375px is er geen hoek van het scherm waar geen tekst langs scrolt.
     Elke vaste plek dekt dus vroeg of laat iets af, ook een kleine valk.
     De enige plek die al bovenop de pagina ligt is de balk zelf. Daar gaat
     hij naast de menuknop staan. Zijn zin opent pas op een tik, als een
     uitklapper onder de balk, en sluit bij scrollen of een tik ernaast. */
  var telefoon = window.matchMedia('(max-width: 720px)');
  var balk = document.querySelector('.nav-inner');
  var hamburger = balk && balk.querySelector('.nav-hamburger');
  var knop = null, thuis = doos.parentNode, naVolgend = doos.nextSibling;
  var LABEL = { nl: 'Tip van Faro', en: 'Tip from Faro', fr: 'Conseil de Faro',
                de: 'Tipp von Faro', es: 'Consejo de Faro' };

  function sluit() {
    if (!knop) return;
    doos.classList.remove('open');
    knop.setAttribute('aria-expanded', 'false');
  }
  function open() {
    doos.classList.add('open');
    doos.classList.remove('nieuw');
    knop.setAttribute('aria-expanded', 'true');
    /* De punt van de ballon wijst naar de valk, waar die ook staat. */
    var nav = doos.closest('.nav');
    if (nav) {
      var n = nav.getBoundingClientRect(), k = knop.getBoundingClientRect();
      doos.style.setProperty('--faro-pijl', Math.max(8, n.right - (k.left + k.width / 2) - 12 - 10) + 'px');
    }
    scrollBij = window.scrollY;
  }
  function inBalk() {
    if (knop || !balk || !hamburger) return;
    knop = document.createElement('button');
    knop.type = 'button';
    knop.className = 'faro-gids-knop';
    knop.setAttribute('aria-expanded', 'false');
    knop.setAttribute('aria-controls', 'faroGidsBallon');
    knop.setAttribute('aria-label', LABEL[taal()] || LABEL.nl);
    knop.appendChild(img);
    doos.appendChild(knop);
    balk.insertBefore(doos, hamburger);
    doos.classList.add('in-balk');
    if (huidig) doos.classList.add('nieuw');
    knop.addEventListener('click', function () {
      if (doos.classList.contains('open')) sluit(); else open();
    });
  }
  function uitBalk() {
    if (!knop) return;
    sluit();
    doos.appendChild(img);
    knop.remove();
    knop = null;
    doos.classList.remove('in-balk', 'nieuw');
    thuis.insertBefore(doos, naVolgend);
  }
  function plaats() {
    if (telefoon.matches && balk && hamburger) inBalk(); else uitBalk();
    /* Een telefoon zonder navigatiebalk (404): dan liever geen Faro dan
       een Faro die de tekst afdekt. */
    doos.classList.toggle('geen-plek', telefoon.matches && !knop);
  }
  plaats();
  if (telefoon.addEventListener) telefoon.addEventListener('change', plaats);
  else if (telefoon.addListener) telefoon.addListener(plaats);

  var scrollBij = 0;
  window.addEventListener('scroll', function () {
    if (knop && doos.classList.contains('open') && Math.abs(window.scrollY - scrollBij) > 60) sluit();
  }, { passive: true });
  document.addEventListener('click', function (e) {
    if (knop && doos.classList.contains('open') && !doos.contains(e.target)) sluit();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && knop && doos.classList.contains('open')) { sluit(); knop.focus(); }
  });

  /* De sectie die het meest in beeld staat wint. Zonder die vergelijking
     springt hij heen en weer op de grens tussen twee secties. */
  var zichtbaar = {};
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      zichtbaar[e.target.dataset.gids] = e.isIntersecting ? e.intersectionRatio : 0;
    });
    var beste = '', hoogste = 0;
    Object.keys(zichtbaar).forEach(function (k) {
      if (zichtbaar[k] > hoogste) { hoogste = zichtbaar[k]; beste = k; }
    });
    if (beste && hoogste > 0.18) toon(beste);
  }, { threshold: [0, 0.18, 0.4, 0.7, 1] });

  secties.forEach(function (el) { obs.observe(el); });

  /* Meewisselen wanneer de bezoeker van taal verandert. */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var was = huidig; huidig = ''; toon(was);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }

  if (weg) {
    weg.addEventListener('click', function () {
      doos.hidden = true;
      obs.disconnect();
      /* Veertien dagen stil, daarna mag hij weer meekijken. */
      try { localStorage.setItem('helvaro_faro_gids', String(Date.now() + 14 * 864e5)); } catch (e) {}
    });
  }
}

/* ── Werkdomeinen als slideshow ─────────────────────────────────────────
   Eén domein tegelijk in beeld. Pijlen, bolletjes, pijltjestoetsen en
   slepen op een touchscreen. Zonder JS staat het eerste domein gewoon
   in beeld en blijft de rest bereikbaar door te scrollen in het spoor. */
function initShowcase() {
  document.querySelectorAll('[data-showcase]').forEach((root) => {
    const track = root.querySelector('[data-showcase-track]');
    const slides = Array.from(root.querySelectorAll('.showcase-slide'));
    const dotsHouder = root.querySelector('[data-showcase-dots]');
    const vorige = root.querySelector('[data-showcase-prev]');
    const volgende = root.querySelector('[data-showcase-next]');
    if (!track || slides.length < 2) return;

    let index = 0;

    const dots = slides.map((_, i) => {
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'showcase-dot';
      d.setAttribute('role', 'tab');
      d.setAttribute('aria-label', 'Domein ' + (i + 1));
      d.addEventListener('click', () => ga(i));
      dotsHouder.appendChild(d);
      return d;
    });

    function ga(n) {
      index = Math.max(0, Math.min(slides.length - 1, n));
      track.style.transform = 'translateX(' + (-index * 100) + '%)';
      dots.forEach((d, i) => d.classList.toggle('active', i === index));
      slides.forEach((s, i) => s.setAttribute('aria-hidden', i === index ? 'false' : 'true'));
      if (vorige) vorige.disabled = index === 0;
      if (volgende) volgende.disabled = index === slides.length - 1;
    }

    if (vorige) vorige.addEventListener('click', () => ga(index - 1));
    if (volgende) volgende.addEventListener('click', () => ga(index + 1));

    root.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { ga(index - 1); e.preventDefault(); }
      if (e.key === 'ArrowRight') { ga(index + 1); e.preventDefault(); }
    });

    /* Slepen. Alleen de horizontale beweging telt, zodat verticaal
       scrollen op een telefoon niet gekaapt wordt. */
    let startX = null, startY = null, bezig = false;
    root.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; bezig = false;
    }, { passive: true });
    root.addEventListener('touchmove', (e) => {
      if (startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!bezig && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) bezig = true;
    }, { passive: true });
    root.addEventListener('touchend', (e) => {
      if (startX !== null && bezig) {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 45) ga(index + (dx < 0 ? 1 : -1));
      }
      startX = null; startY = null; bezig = false;
    });

    ga(0);
  });
}

/* ── Agentbalk ──────────────────────────────────────────────────────────
   De animatie schuift het spoor de halve breedte op. Dat werkt alleen als
   de reeks er twee keer in staat. Hier verdubbeld in plaats van in de
   HTML, zodat elke tekst maar één keer vertaald hoeft te worden. */
function initAgentbar() {
  document.querySelectorAll('[data-agentbar-track]').forEach((track) => {
    if (track.dataset.gedupliceerd) return;
    track.querySelectorAll('.agent-chip').forEach((chip) => {
      const kopie = chip.cloneNode(true);
      kopie.setAttribute('aria-hidden', 'true');
      track.appendChild(kopie);
    });
    track.dataset.gedupliceerd = '1';
  });
}


/* ── Sectorenmenu in de navigatie ───────────────────────────────────────
   Zelfde gedrag als de taalkiezer: klik opent, klik ernaast sluit,
   Escape sluit. Op mobiel klapt het menu gewoon open in de kolom. */
function initNavDrop() {
  const drops = document.querySelectorAll('.navdrop');
  if (!drops.length) return;

  function sluitAlles(behalve) {
    drops.forEach((d) => {
      if (d === behalve) return;
      d.classList.remove('open');
      const t = d.querySelector('.navdrop-toggle');
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }

  drops.forEach((drop) => {
    const toggle = drop.querySelector('.navdrop-toggle');
    if (!toggle) return;
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      sluitAlles(drop);
      const open = drop.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  document.addEventListener('click', () => sluitAlles(null));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') sluitAlles(null);
  });
}

/* ── Video ──────────────────────────────────────────────────────────────
   Er staat eerst alleen een vlak met een afspeelknop. De iframe komt er
   pas als de video echt aan de beurt is, en altijd via
   youtube-nocookie.com. Tot dat moment gaat er geen enkel verzoek naar
   Google, ook niet voor een thumbnail.

   Staat er data-video-auto op het blok, dan start hij vanzelf zodra hij
   half in beeld komt. Dat gebeurt zonder geluid: elke browser blokkeert
   geluid dat uit zichzelf begint, en een marketingpagina die ongevraagd
   begint te praten is sowieso vervelend. Er komt een knop bij om het
   geluid alsnog aan te zetten. Die zet het geluid aan in de lopende
   video, hij begint dus niet opnieuw.

   Wie beweging heeft uitgezet of op een datazuinige verbinding zit,
   krijgt de klikversie. Dan blijft het ook bij nul verzoeken.

   Staat er geen video-ID, dan doet dit niets: het blok is dan met CSS al
   verborgen. */
function initVideo() {
  const YT = 'https://www.youtube-nocookie.com';

  let stil = false, zuinig = false;
  try { stil = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  try { zuinig = !!(navigator.connection && navigator.connection.saveData); } catch (e) {}

  document.querySelectorAll('.ytfacade[data-video-id]').forEach((blok) => {
    const id = (blok.dataset.videoId || '').trim();
    if (!id) return;

    const knop = blok.querySelector('.ytfacade-knop');
    if (!knop) return;

    const titel = blok.dataset.videoTitel || 'Video';
    knop.setAttribute('aria-label', titel);

    const geluidknop = blok.querySelector('.ytfacade-geluid');
    let gestart = false;

    function start(zonderGeluid) {
      if (gestart) return;
      gestart = true;

      const frame = document.createElement('iframe');
      frame.className = 'ytfacade-speler';
      frame.src = YT + '/embed/' + encodeURIComponent(id) +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1' +
        (zonderGeluid ? '&mute=1&enablejsapi=1' : '');
      frame.title = titel;
      frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allowFullscreen = true;
      knop.replaceWith(frame);

      if (!zonderGeluid || !geluidknop) return;

      geluidknop.hidden = false;
      geluidknop.addEventListener('click', () => {
        /* Via de speler-API, zodat de video doorloopt waar hij is. */
        try {
          ['unMute', 'playVideo'].forEach((commando) => {
            frame.contentWindow.postMessage(
              JSON.stringify({ event: 'command', func: commando, args: [] }), YT);
          });
        } catch (e) {}
        geluidknop.hidden = true;
      });
    }

    knop.addEventListener('click', () => start(false));

    if (!blok.hasAttribute('data-video-auto')) return;
    if (stil || zuinig || !('IntersectionObserver' in window)) return;

    const kijker = new IntersectionObserver((rijen) => {
      rijen.forEach((rij) => {
        if (!rij.isIntersecting) return;
        kijker.disconnect();
        start(true);
      });
    }, { threshold: 0.5 });
    kijker.observe(blok);
  });
}

/* ── De omzetcalculator ──────────────────────────────────────────────────
   Staat op /roi.html. Rekent live mee terwijl je typt en zet de ingevulde
   cijfers in de URL, zodat een garagehouder de link met zijn eigen getallen
   kan doorsturen naar een collega. Dat doorsturen is het punt: een
   rekenmachine die niemand deelt, is gewoon een formulier.

   Bewust geen e-mailadres en geen account. Wie zijn cijfers moet afgeven
   voor hij een uitkomst ziet, vult iets willekeurigs in en gelooft de
   uitkomst daarna ook niet meer.
   ─────────────────────────────────────────────────────────────────────── */
function initOmzet() {
  var form = document.getElementById('omzetForm');
  if (!form) return;

  var VELDEN = {
    monteurs:  { el: document.getElementById('rek-monteurs'),  kort: 'm', min: 1, max: 60,    standaard: 3 },
    gemist:    { el: document.getElementById('rek-gemist'),    kort: 'g', min: 0, max: 500,   standaard: 12 },
    omzet:     { el: document.getElementById('rek-omzet'),     kort: 'o', min: 0, max: 20000, standaard: 1800 },
    conversie: { el: document.getElementById('rek-conversie'), kort: 'c', min: 0, max: 100,   standaard: 8 },
    terug:     { el: document.getElementById('rek-terug'),     kort: 't', min: 0, max: 100,   standaard: 60 }
  };

  var uit = {
    maand:     document.getElementById('rek-uit-maand'),
    jaar:      document.getElementById('rek-uit-jaar'),
    monteur:   document.getElementById('rek-uit-monteur'),
    afspraken: document.getElementById('rek-uit-afspraken'),
    pct:       document.getElementById('rek-uit-pct'),
    win:       document.getElementById('rek-uit-win')
  };

  /* Een maand is geen vier weken. 52 / 12 = 4,33. Dat scheelt acht procent
     en dat is precies het soort slordigheid waar iemand je op afrekent. */
  var WEKEN_PER_MAAND = 4.33;

  var euro = new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0
  });
  var getal = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });

  function lees(naam) {
    var v = VELDEN[naam];
    var n = parseFloat(v.el.value);
    if (isNaN(n)) n = v.standaard;
    if (n < v.min) n = v.min;
    if (n > v.max) n = v.max;
    return n;
  }

  function reken() {
    var monteurs  = lees('monteurs');
    var gemist    = lees('gemist');
    var omzet     = lees('omzet');
    var conversie = lees('conversie') / 100;
    var terug     = lees('terug');

    var afspraken = gemist * WEKEN_PER_MAAND * conversie;
    var permaand  = afspraken * omzet;
    var gewonnen  = permaand * (terug / 100);

    uit.maand.textContent     = euro.format(permaand);
    uit.jaar.textContent      = euro.format(permaand * 12);
    uit.monteur.textContent   = euro.format(monteurs > 0 ? permaand / monteurs : 0);
    uit.afspraken.textContent = getal.format(afspraken);
    uit.pct.textContent       = getal.format(terug);
    uit.win.textContent       = euro.format(gewonnen);
  }

  /* ── Cijfers in en uit de URL ──────────────────────────────────────────
     Korte sleutels, want een link die over drie regels loopt deelt niemand. */
  function uitUrl() {
    var q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    Object.keys(VELDEN).forEach(function (naam) {
      var v = VELDEN[naam];
      var w = q.get(v.kort);
      if (w === null || w === '') return;
      var n = parseFloat(w);
      if (isNaN(n)) return;
      v.el.value = Math.min(v.max, Math.max(v.min, n));
    });
  }

  function naarUrl() {
    var q;
    try { q = new URLSearchParams(); } catch (e) { return location.href; }
    Object.keys(VELDEN).forEach(function (naam) {
      q.set(VELDEN[naam].kort, lees(naam));
    });
    return location.origin + location.pathname + '?' + q.toString();
  }

  var deel = document.getElementById('rek-deel');
  var melding = document.getElementById('rek-deel-melding');

  if (deel) {
    deel.addEventListener('click', function () {
      var link = naarUrl();

      /* De adresbalk bijwerken zodat de pagina herladen dezelfde cijfers
         geeft, ook als het kopiëren niet lukt. */
      try { history.replaceState(null, '', link); } catch (e) {}

      function gelukt() {
        if (!melding) return;
        melding.textContent = 'Gekopieerd. Plak de link in een bericht en je collega ziet jouw cijfers.';
        setTimeout(function () { melding.textContent = ''; }, 6000);
      }
      function mislukt() {
        if (!melding) return;
        melding.textContent = 'Kopiëren lukte niet. De link staat nu wel in je adresbalk.';
        setTimeout(function () { melding.textContent = ''; }, 6000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(gelukt, mislukt);
      } else {
        mislukt();
      }
    });
  }

  Object.keys(VELDEN).forEach(function (naam) {
    var el = VELDEN[naam].el;
    if (!el) return;
    el.addEventListener('input', reken);
    el.addEventListener('change', reken);
  });

  form.addEventListener('submit', function (e) { e.preventDefault(); });

  uitUrl();
  reken();
}

/* ── Waar sta ik ─────────────────────────────────────────────────────────
   De navigatie wordt door tools/sync-shell.pl in elke pagina gezet, dus er
   staat nergens met de hand "deze is actief". Dat doen we hier, door het
   pad van elke link te vergelijken met het pad van de pagina zelf.

   Dat werkt meteen ook in /fr/, /en/, /de/ en /es/, omdat de links daar
   relatief blijven en de browser ze binnen dezelfde taalmap oplost.
   ─────────────────────────────────────────────────────────────────────── */
function initNavActief() {
  var hier = location.pathname.replace(/\/index\.html$/, '/');
  if (hier === '') hier = '/';

  function zelfde(a) {
    var pad;
    try { pad = new URL(a.href, location.href).pathname; } catch (e) { return false; }
    pad = pad.replace(/\/index\.html$/, '/');
    return pad === hier;
  }

  var links = document.querySelectorAll('.nav-links a, .nav-mobile a');

  for (var i = 0; i < links.length; i++) {
    var a = links[i];
    if (a.classList.contains('lang-opt')) continue;   /* die heeft zijn eigen merkteken */
    if (a.getAttribute('href') === '#') continue;
    if (!zelfde(a)) continue;

    a.setAttribute('aria-current', 'page');

    if (a.classList.contains('nav-link')) {
      a.classList.add('nav-link-actief');
    } else if (a.classList.contains('navdrop-item')) {
      a.classList.add('navdrop-item-actief');
      /* Ook de knop van het menu waarin hij zit, zodat je op een
         binnenpagina in één blik ziet onder welke kop je zit. */
      var drop = a.closest('.navdrop');
      var knop = drop && drop.querySelector('.navdrop-toggle');
      if (knop) knop.classList.add('nav-link-actief');
    }
  }
}
