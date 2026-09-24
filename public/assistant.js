/* ============================================================================
   Helvaro — websiteassistent voor de site van een dealer
   ============================================================================
   Plaatsen (de code staat klaar in het dashboard, Instellingen → Website):

     <script src="https://app.helvaro.pro/assistant.js" data-site="hv_site_..." async></script>

   Op een voertuigpagina optioneel data-vehicle="V12" op dezelfde tag, of
   vanuit de pagina zelf: window.HelvaroAssistant.setVehicle('V12').

   Wat het doet:
     - een knop rechtsonder, een venster met het gesprek
     - voertuigkaartjes die UIT DE VOORRAAD komen (de server stuurt ze mee)
     - bij een concrete koopstap een optioneel kaartje voor e-mail OF telefoon
     - doorsturen naar WhatsApp of e-mail als de dealer dat aanbiedt

   Veiligheid: alle tekst gaat via textContent (nooit innerHTML met inhoud van
   de server of de bezoeker); het venster zit in een eigen shadow DOM, zodat
   het de CSS van de site niet raakt en omgekeerd.
   ============================================================================ */
(function () {
  'use strict';
  if (window.HelvaroAssistant) return;

  var script = document.currentScript || document.querySelector('script[data-site][src*="assistant.js"]');
  if (!script) return;
  var SITE = script.getAttribute('data-site') || '';
  if (!/^hv_site_[a-f0-9]{24}$/.test(SITE)) { console.warn('[helvaro] ongeldige data-site'); return; }
  var API = (script.getAttribute('data-api') || 'https://app.helvaro.pro') + '/api/assistant';
  var voertuig = script.getAttribute('data-vehicle') || '';

  var TAAL = (document.documentElement.lang || navigator.language || 'nl').slice(0, 2).toLowerCase();
  var D = {
    nl: { mTitel: 'Wil je meteen een moment kiezen?', mSub: 'Vrije momenten bij ons. Het team bevestigt je afspraak.', mGeboekt: 'Staat genoteerd: ', mGeen: 'Er zijn nu geen vrije momenten online; het team belt je om er een te prikken.', mNee: 'Later', open: 'Stel je vraag', titel: 'Online assistent', sub: 'Antwoordt meteen, het team volgt op', ph: 'Typ je vraag…', stuur: 'Stuur', sluit: 'Sluiten',
      welkom: 'Hallo! Zoek je een bepaalde wagen, of heb je een vraag over er één? Ik kijk het voor je na in onze voorraad.',
      fout: 'Er ging even iets mis. Probeer het opnieuw.', bezig: 'Aan het typen…', ai: 'Je praat met een AI-assistent. Het team leest mee.',
      cTitel: 'Zal het team je contacteren?', cSub: 'Een e-mailadres óf telefoonnummer is genoeg. Niets verplicht.', cNaam: 'Naam (optioneel)', cMail: 'E-mailadres', cTel: 'Telefoon',
      cOk: 'Doorsturen', cNee: 'Nee, bedankt', cToestemming: 'Ik ga akkoord dat het team me hierover contacteert.', cBedankt: 'Bedankt! Het team neemt snel contact op.', cLeeg: 'Vul een e-mailadres of telefoonnummer in.',
      wa: 'Verder op WhatsApp', mail: 'Verder via e-mail', beschikbaar: 'beschikbaar', status: { gereserveerd: 'gereserveerd', verkocht: 'verkocht', 'uit aanbod': 'niet meer beschikbaar', onbekend: 'status nakijken' }, bekijk: 'Bekijk', km: 'km' },
    fr: { mTitel: 'Voulez-vous choisir un moment tout de suite ?', mSub: 'Nos créneaux libres. L’équipe confirme votre rendez-vous.', mGeboekt: 'C’est noté : ', mGeen: 'Aucun créneau libre en ligne pour le moment ; l’équipe vous appelle pour en fixer un.', mNee: 'Plus tard', open: 'Posez votre question', titel: 'Assistant en ligne', sub: 'Répond tout de suite, l’équipe assure le suivi', ph: 'Votre question…', stuur: 'Envoyer', sluit: 'Fermer',
      welkom: 'Bonjour ! Vous cherchez une voiture précise ou avez une question sur l’une d’elles ? Je regarde dans notre stock.',
      fout: 'Un souci est survenu. Réessayez.', bezig: 'En train d’écrire…', ai: 'Vous parlez avec un assistant IA. L’équipe suit la conversation.',
      cTitel: 'L’équipe peut-elle vous contacter ?', cSub: 'Une adresse e-mail ou un numéro suffit. Rien d’obligatoire.', cNaam: 'Nom (facultatif)', cMail: 'E-mail', cTel: 'Téléphone',
      cOk: 'Envoyer', cNee: 'Non merci', cToestemming: 'J’accepte que l’équipe me contacte à ce sujet.', cBedankt: 'Merci ! L’équipe vous contacte rapidement.', cLeeg: 'Indiquez une adresse e-mail ou un numéro.',
      wa: 'Continuer sur WhatsApp', mail: 'Continuer par e-mail', beschikbaar: 'disponible', status: { gereserveerd: 'réservée', verkocht: 'vendue', 'uit aanbod': 'plus disponible', onbekend: 'statut à vérifier' }, bekijk: 'Voir', km: 'km' },
    en: { mTitel: 'Want to pick a time right away?', mSub: 'Our free slots. The team confirms your appointment.', mGeboekt: 'Booked: ', mGeen: 'No free slots online right now; the team will call you to arrange one.', mNee: 'Later', open: 'Ask a question', titel: 'Online assistant', sub: 'Answers right away, the team follows up', ph: 'Type your question…', stuur: 'Send', sluit: 'Close',
      welkom: 'Hi! Looking for a particular car, or have a question about one? I’ll check our stock for you.',
      fout: 'Something went wrong. Please try again.', bezig: 'Typing…', ai: 'You are chatting with an AI assistant. The team reads along.',
      cTitel: 'Shall the team contact you?', cSub: 'An email address or a phone number is enough. Nothing is required.', cNaam: 'Name (optional)', cMail: 'Email', cTel: 'Phone',
      cOk: 'Send', cNee: 'No thanks', cToestemming: 'I agree that the team may contact me about this.', cBedankt: 'Thanks! The team will be in touch shortly.', cLeeg: 'Enter an email address or a phone number.',
      wa: 'Continue on WhatsApp', mail: 'Continue by email', beschikbaar: 'available', status: { gereserveerd: 'reserved', verkocht: 'sold', 'uit aanbod': 'no longer available', onbekend: 'status being checked' }, bekijk: 'View', km: 'km' },
    de: { mTitel: 'Möchtest du gleich einen Termin wählen?', mSub: 'Unsere freien Zeiten. Das Team bestätigt deinen Termin.', mGeboekt: 'Eingetragen: ', mGeen: 'Gerade keine freien Zeiten online; das Team ruft dich an, um einen zu finden.', mNee: 'Später', open: 'Frage stellen', titel: 'Online-Assistent', sub: 'Antwortet sofort, das Team meldet sich', ph: 'Deine Frage…', stuur: 'Senden', sluit: 'Schließen',
      welkom: 'Hallo! Suchst du ein bestimmtes Auto oder hast du eine Frage dazu? Ich schaue in unserem Bestand nach.',
      fout: 'Da ist etwas schiefgelaufen. Bitte erneut versuchen.', bezig: 'Schreibt…', ai: 'Du chattest mit einem KI-Assistenten. Das Team liest mit.',
      cTitel: 'Soll sich das Team melden?', cSub: 'Eine E-Mail-Adresse oder Telefonnummer reicht. Nichts ist Pflicht.', cNaam: 'Name (optional)', cMail: 'E-Mail', cTel: 'Telefon',
      cOk: 'Senden', cNee: 'Nein, danke', cToestemming: 'Ich bin einverstanden, dass das Team mich dazu kontaktiert.', cBedankt: 'Danke! Das Team meldet sich bald.', cLeeg: 'Gib eine E-Mail-Adresse oder Telefonnummer ein.',
      wa: 'Weiter auf WhatsApp', mail: 'Weiter per E-Mail', beschikbaar: 'verfügbar', status: { gereserveerd: 'reserviert', verkocht: 'verkauft', 'uit aanbod': 'nicht mehr verfügbar', onbekend: 'Status wird geprüft' }, bekijk: 'Ansehen', km: 'km' }
  };
  if (!D[TAAL]) TAAL = 'nl';
  var T = D[TAAL];
  var TT = function (k) { return T[k] || D.nl[k] || k; };

  /* Sessie: willekeurig, lokaal bewaard; geen cookie, geen fingerprint. */
  var SESSIE;
  try { SESSIE = localStorage.getItem('hv_assist_' + SITE); } catch (e) { SESSIE = null; }
  if (!SESSIE || !/^[A-Za-z0-9_-]{16,64}$/.test(SESSIE)) {
    var b = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(b);
    SESSIE = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    try { localStorage.setItem('hv_assist_' + SITE, SESSIE); } catch (e) { /* privévenster: sessie leeft zolang de pagina open is */ }
  }

  var host = document.createElement('div');
  host.setAttribute('data-helvaro-assistant', '');
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var css = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.knop{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:12px 18px;min-height:48px;border:1px solid #2A2A2A;border-radius:999px;background:#1A1A1A;color:#F4E7C8;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.28);transition:transform .12s ease-out}',
    '.knop:active{transform:scale(.97)}.knop:focus-visible{outline:2px solid #E8D7B1;outline-offset:3px}',
    '.venster{position:fixed;right:20px;bottom:84px;z-index:2147483000;width:min(380px,calc(100vw - 32px));height:min(600px,calc(100vh - 110px));display:none;flex-direction:column;background:#121212;color:#F4E7C8;border:1px solid #2A2A2A;border-radius:18px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,.4)}',
    '.venster.open{display:flex}',
    '@media (max-width:520px){.knop.verborgen{display:none}}',
    '@media (max-width:520px){.venster{right:0;left:0;bottom:0;width:100vw;height:calc(100vh - 0px);border-radius:0}.knop{right:16px;bottom:16px}}',
    '.kop{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#1A1A1A;border-bottom:1px solid #2A2A2A}',
    '.kop-t{flex:1;min-width:0}.kop-t b{display:block;font-size:15px}.kop-t span{font-size:12px;color:#B89D73}',
    '.x{background:none;border:0;color:#D8C49A;font-size:22px;line-height:1;cursor:pointer;padding:6px;border-radius:8px}.x:focus-visible{outline:2px solid #E8D7B1}',
    '.lijst{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}',
    '.b{max-width:86%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}',
    '.b.a{align-self:flex-start;background:#1A1A1A;border:1px solid #2A2A2A}',
    '.b.u{align-self:flex-end;background:#E8D7B1;color:#1A1A1A}',
    '.b.s{align-self:center;font-size:12px;color:#B89D73;background:none;padding:2px}',
    '.kaarten{display:flex;flex-direction:column;gap:8px;align-self:stretch}',
    '.kaart{display:flex;gap:10px;padding:10px;border:1px solid #2A2A2A;border-radius:12px;background:#1A1A1A;color:inherit;text-decoration:none}',
    '.kaart img{width:84px;height:62px;object-fit:cover;border-radius:8px;background:#2A2A2A;flex:none}',
    '.kaart-i{min-width:0;display:flex;flex-direction:column;gap:2px;font-size:13px}.kaart-i b{font-size:14px;color:#F4E7C8}',
    '.prijs{color:#E8D7B1;font-weight:700}.st{font-size:11px;color:#B89D73}.st.nee{color:#D8C49A;text-decoration:line-through}',
    '.contact{align-self:stretch;padding:12px;border:1px solid #B89D73;border-radius:12px;background:#1A1A1A;display:flex;flex-direction:column;gap:8px;font-size:13px}',
    '.contact b{font-size:14px}.contact small{color:#B89D73}',
    'input[type=text],input[type=email],input[type=tel]{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #2A2A2A;background:#121212;color:#F4E7C8;font-size:14px}',
    'input:focus{outline:none;border-color:#B89D73}',
    '.rij{display:flex;gap:8px}.rij>*{flex:1}',
    '.akkoord{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:#D8C49A}',
    '.k2{padding:10px 12px;border-radius:10px;border:1px solid #2A2A2A;background:#2A2A2A;color:#F4E7C8;font-size:13px;font-weight:600;cursor:pointer;min-height:40px}',
    '.k2.p{background:#E8D7B1;color:#1A1A1A;border-color:#E8D7B1}.k2:focus-visible{outline:2px solid #E8D7B1;outline-offset:2px}',
    '.over{display:flex;gap:8px;flex-wrap:wrap;align-self:stretch}',
    '.momenten{align-self:stretch;padding:12px;border:1px solid #2A2A2A;border-radius:12px;background:#1A1A1A;display:flex;flex-direction:column;gap:8px;font-size:13px}',
    '.momenten b{font-size:14px}.momenten small{color:#B89D73}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.chip{padding:8px 11px;border-radius:999px;border:1px solid #B89D73;background:transparent;color:#F4E7C8;font-size:13px;cursor:pointer;min-height:36px}',
    '.chip:hover{background:#2A2A2A}.chip:focus-visible{outline:2px solid #E8D7B1;outline-offset:2px}.chip[disabled]{opacity:.5;cursor:progress}',
    '.voet{padding:10px;border-top:1px solid #2A2A2A;background:#1A1A1A}',
    '.invoer{display:flex;gap:8px}.invoer input{flex:1}',
    '.ai{font-size:11px;color:#B89D73;padding:6px 2px 0;text-align:center}',
    '@media (prefers-reduced-motion:reduce){.lijst{scroll-behavior:auto}.knop{transition:none}}'
  ].join('');
  var style = document.createElement('style'); style.textContent = css; root.appendChild(style);

  function el(tag, cls, tekst) { var e = document.createElement(tag); if (cls) e.className = cls; if (tekst != null) e.textContent = tekst; return e; }

  var knop = el('button', 'knop'); knop.type = 'button'; knop.setAttribute('aria-expanded', 'false');
  knop.appendChild(document.createTextNode('\u{1F4AC} ' + TT('open')));
  var venster = el('div', 'venster'); venster.setAttribute('role', 'dialog'); venster.setAttribute('aria-label', TT('titel'));
  var kop = el('div', 'kop'); var kopT = el('div', 'kop-t'); kopT.appendChild(el('b', null, TT('titel'))); var kopSub = el('span', null, TT('sub')); kopT.appendChild(kopSub);
  var sluit = el('button', 'x', '×'); sluit.type = 'button'; sluit.setAttribute('aria-label', TT('sluit'));
  kop.appendChild(kopT); kop.appendChild(sluit);
  var lijst = el('div', 'lijst'); lijst.setAttribute('aria-live', 'polite');
  var voet = el('form', 'voet'); var invoer = el('div', 'invoer');
  var veld = el('input'); veld.type = 'text'; veld.maxLength = 600; veld.placeholder = TT('ph'); veld.setAttribute('aria-label', TT('ph'));
  var stuur = el('button', 'k2 p', TT('stuur')); stuur.type = 'submit';
  invoer.appendChild(veld); invoer.appendChild(stuur); voet.appendChild(invoer); voet.appendChild(el('div', 'ai', TT('ai')));
  venster.appendChild(kop); venster.appendChild(lijst); venster.appendChild(voet);
  root.appendChild(knop); root.appendChild(venster);

  var handoffs = { whatsapp: false, email: false };
  var contactGevraagd = false, bezig = false, geopend = false;

  function bubbel(tekst, wie) { var b = el('div', 'b ' + wie, tekst); lijst.appendChild(b); lijst.scrollTop = lijst.scrollHeight; return b; }

  function toonKaarten(kaarten) {
    if (!kaarten || !kaarten.length) return;
    var w = el('div', 'kaarten');
    kaarten.forEach(function (k) {
      var a = el(k.link ? 'a' : 'div', 'kaart');
      if (k.link) { a.href = k.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      if (k.foto) { var img = el('img'); img.src = k.foto; img.alt = k.naam || ''; img.loading = 'lazy'; a.appendChild(img); }
      var i = el('div', 'kaart-i');
      i.appendChild(el('b', null, k.naam));
      if (k.prijsTekst) i.appendChild(el('span', 'prijs', k.prijsTekst));
      var regel = [k.km != null ? (Number(k.km).toLocaleString(TAAL) + ' ' + TT('km')) : '', k.inschrijving, k.brandstof].filter(Boolean).join(' · ');
      if (regel) i.appendChild(el('span', null, regel));
      i.appendChild(el('span', 'st' + (k.beschikbaar ? '' : ' nee'), k.beschikbaar ? TT('beschikbaar') : ((T.status && T.status[k.status]) || k.status)));
      a.appendChild(i); w.appendChild(a);
    });
    lijst.appendChild(w); lijst.scrollTop = lijst.scrollHeight;
  }

  function vraag(body) {
    body.siteKey = SITE; body.session = SESSIE;
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || TT('fout')); e.code = d.code; throw e; } return d; }); });
  }

  function toonOverdracht() {
    if (!handoffs.whatsapp && !handoffs.email) return;
    if (lijst.querySelector('.over')) return;
    var w = el('div', 'over');
    if (handoffs.whatsapp) {
      var wa = el('button', 'k2', TT('wa')); wa.type = 'button';
      wa.onclick = function () { wa.disabled = true; vraag({ action: 'handoff', target: 'whatsapp' }).then(function (d) { if (d.url) window.open(d.url, '_blank', 'noopener'); }).catch(function (e) { bubbel(e.message, 's'); }).then(function () { wa.disabled = false; }); };
      w.appendChild(wa);
    }
    if (handoffs.email) {
      var ml = el('button', 'k2', TT('mail')); ml.type = 'button';
      ml.onclick = function () { toonContact(true); };
      w.appendChild(ml);
    }
    lijst.appendChild(w);
  }

  function toonContact(vanMail) {
    if (lijst.querySelector('.contact')) return;
    contactGevraagd = true;
    var c = el('form', 'contact'); c.noValidate = true;
    c.appendChild(el('b', null, TT('cTitel'))); c.appendChild(el('small', null, TT('cSub')));
    var naam = el('input'); naam.type = 'text'; naam.placeholder = TT('cNaam'); naam.maxLength = 100; naam.autocomplete = 'name';
    var mail = el('input'); mail.type = 'email'; mail.placeholder = TT('cMail'); mail.maxLength = 254; mail.autocomplete = 'email';
    var tel = el('input'); tel.type = 'tel'; tel.placeholder = TT('cTel'); tel.maxLength = 30; tel.autocomplete = 'tel';
    var rij = el('div', 'rij'); rij.appendChild(mail); if (!vanMail) rij.appendChild(tel);
    var ak = el('label', 'akkoord'); var cb = el('input'); cb.type = 'checkbox'; ak.appendChild(cb); ak.appendChild(el('span', null, TT('cToestemming')));
    var knoppen = el('div', 'rij'); var ok = el('button', 'k2 p', TT('cOk')); ok.type = 'submit'; var nee = el('button', 'k2', TT('cNee')); nee.type = 'button';
    knoppen.appendChild(ok); knoppen.appendChild(nee);
    [naam, rij, ak, knoppen].forEach(function (x) { c.appendChild(x); });
    nee.onclick = function () { c.remove(); };
    c.onsubmit = function (ev) {
      ev.preventDefault();
      if (!mail.value.trim() && !tel.value.trim()) { bubbel(TT('cLeeg'), 's'); return; }
      ok.disabled = true;
      vraag({ action: 'contact', email: mail.value.trim(), phone: tel.value.trim(), name: naam.value.trim(), consent: cb.checked })
        .then(function () { c.remove(); bubbel(TT('cBedankt'), 's'); toonMomenten(); })
        .catch(function (e) { ok.disabled = false; bubbel(e.message, 's'); });
    };
    lijst.appendChild(c); lijst.scrollTop = lijst.scrollHeight; mail.focus();
  }

  /* Vrije momenten: komen van de server (openingsuren, bestaande afspraken,
     Google Agenda). De bezoeker kan alleen een voorgesteld moment kiezen. */
  function toonMomenten() {
    vraag({ action: 'slots' }).then(function (d) {
      var lijstM = (d && d.momenten) || [];
      var w = el('div', 'momenten');
      w.appendChild(el('b', null, TT('mTitel')));
      if (!lijstM.length) { w.appendChild(el('small', null, TT('mGeen'))); lijst.appendChild(w); lijst.scrollTop = lijst.scrollHeight; return; }
      w.appendChild(el('small', null, TT('mSub')));
      var chips = el('div', 'chips');
      lijstM.forEach(function (iso) {
        var label = new Date(iso).toLocaleString(TAAL, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        var chip = el('button', 'chip', label); chip.type = 'button';
        chip.onclick = function () {
          Array.prototype.forEach.call(chips.children, function (x) { x.disabled = true; });
          vraag({ action: 'book', start: iso, vehicle: voertuig || undefined })
            .then(function () { w.remove(); bubbel(TT('mGeboekt') + label, 'a'); })
            .catch(function (e) { bubbel(e.message, 's'); Array.prototype.forEach.call(chips.children, function (x) { x.disabled = false; }); });
        };
        chips.appendChild(chip);
      });
      w.appendChild(chips);
      var later = el('button', 'k2', TT('mNee')); later.type = 'button'; later.onclick = function () { w.remove(); };
      w.appendChild(later);
      lijst.appendChild(w); lijst.scrollTop = lijst.scrollHeight;
    }).catch(function () { /* geen momenten tonen is geen fout voor de bezoeker */ });
  }

  function open() {
    venster.classList.add('open'); knop.setAttribute('aria-expanded', 'true'); knop.classList.add('verborgen');
    if (!geopend) {
      geopend = true;
      bubbel(TT('welkom'), 'a');
      vraag({ action: 'config' }).then(function (d) { handoffs = d.handoffs || handoffs; }).catch(function () { /* stil: chatten kan nog */ });
    }
    setTimeout(function () { veld.focus(); }, 30);
  }
  function dicht() { venster.classList.remove('open'); knop.setAttribute('aria-expanded', 'false'); knop.classList.remove('verborgen'); knop.focus(); }
  knop.onclick = function () { venster.classList.contains('open') ? dicht() : open(); };
  sluit.onclick = dicht;
  venster.addEventListener('keydown', function (e) { if (e.key === 'Escape') dicht(); });

  voet.onsubmit = function (ev) {
    ev.preventDefault();
    var tekst = veld.value.trim();
    if (!tekst || bezig) return;
    bezig = true; stuur.disabled = true; veld.value = '';
    bubbel(tekst, 'u');
    var wacht = bubbel(TT('bezig'), 's');
    vraag({ message: tekst, vehicle: voertuig || undefined, page: location.href.slice(0, 300) })
      .then(function (d) {
        wacht.remove();
        if (d.handoffs) handoffs = d.handoffs;
        if (d.antwoord) bubbel(d.antwoord, 'a');
        toonKaarten(d.kaarten);
        if (d.vraagContact && !contactGevraagd) toonContact(false);
        if (d.vraagContact) toonOverdracht();
      })
      .catch(function (e) { wacht.remove(); bubbel(e.message || TT('fout'), 's'); })
      .then(function () { bezig = false; stuur.disabled = false; veld.focus(); });
  };

  window.HelvaroAssistant = {
    open: open, close: dicht,
    setVehicle: function (code) { voertuig = String(code || '').slice(0, 20); }
  };
})();
