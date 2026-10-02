(function () {
  'use strict';

  var script = document.currentScript ||
    [].slice.call(document.querySelectorAll('script')).find(function (s) {
      return s.src && s.src.indexOf('form-widget') !== -1;
    });

  var PROJECT_CODE    = (script && script.getAttribute('data-project'))  || 'HELVARO';
  var CLIENT_NAME     = (script && script.getAttribute('data-name'))     || 'Helvaro';
  var CUSTOM_ENDPOINT = (script && script.getAttribute('data-endpoint'))  || '';

  // CLIENT_NAME comes from a script tag attribute this widget is embedded
  // with on clients' own sites. It is concatenated into innerHTML below, so
  // it must be HTML-escaped first — otherwise a CMS that templates
  // data-name from user-editable content turns this into DOM-XSS on the
  // client's site. Same escaping api/form-page.js's escHtml() applies to
  // the identical field server-side.
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var SAFE_CLIENT_NAME = escHtml(CLIENT_NAME);

  /* Taal: expliciet (data-lang), anders die van de pagina, anders die van de
     browser. Onbekend of Nederlands: Nederlands, want dit is voor Belgische kantoren. */
  var TAAL = String((script && script.getAttribute('data-lang')) || document.documentElement.lang || navigator.language || 'nl').slice(0, 2).toLowerCase();
  var D = {
    nl: { aria: 'Contact opnemen', sluit: 'Sluiten', sub: 'Vul je gegevens in en wij nemen<br>contact op via WhatsApp', naam: 'Naam', naamPh: 'Jouw naam', tel: 'Telefoonnummer',
          akkoord1: 'Ik ga akkoord dat ', akkoord2: ' mij via WhatsApp contacteert. Zie het ', privacy: 'privacybeleid', stuur: 'VERSTUUR', stuurt: 'VERSTUREN\u2026',
          bedankt: 'Bedankt!', bedanktTxt: 'We nemen binnenkort contact op via WhatsApp.', eNaam: 'Vul je naam en telefoonnummer in.', ePriv: 'Vink het privacy-vakje aan om verder te gaan.', eMis: 'Oeps, er ging iets mis. Probeer het opnieuw.' },
    fr: { aria: 'Nous contacter', sluit: 'Fermer', sub: 'Laissez vos coordonnées et nous vous<br>contactons via WhatsApp', naam: 'Nom', naamPh: 'Votre nom', tel: 'Numéro de téléphone',
          akkoord1: 'J’accepte que ', akkoord2: ' me contacte via WhatsApp. Voir la ', privacy: 'politique de confidentialité', stuur: 'ENVOYER', stuurt: 'ENVOI\u2026',
          bedankt: 'Merci !', bedanktTxt: 'Nous vous contacterons bientôt via WhatsApp.', eNaam: 'Saisissez votre nom et votre numéro de téléphone.', ePriv: 'Cochez la case de confidentialité pour continuer.', eMis: 'Oups, une erreur est survenue. Réessayez.' },
    en: { aria: 'Get in touch', sluit: 'Close', sub: 'Fill in your details and we’ll<br>contact you via WhatsApp', naam: 'Name', naamPh: 'Your name', tel: 'Phone number',
          akkoord1: 'I agree that ', akkoord2: ' may contact me via WhatsApp. See the ', privacy: 'privacy policy', stuur: 'SEND', stuurt: 'SENDING\u2026',
          bedankt: 'Thank you!', bedanktTxt: 'We’ll be in touch shortly via WhatsApp.', eNaam: 'Please enter your name and phone number.', ePriv: 'Tick the privacy box to continue.', eMis: 'Oops, something went wrong. Please try again.' },
    de: { aria: 'Kontakt aufnehmen', sluit: 'Schließen', sub: 'Geben Sie Ihre Daten ein, wir melden<br>uns per WhatsApp', naam: 'Name', naamPh: 'Ihr Name', tel: 'Telefonnummer',
          akkoord1: 'Ich bin einverstanden, dass ', akkoord2: ' mich per WhatsApp kontaktiert. Siehe die ', privacy: 'Datenschutzerklärung', stuur: 'SENDEN', stuurt: 'WIRD GESENDET\u2026',
          bedankt: 'Danke!', bedanktTxt: 'Wir melden uns in Kürze per WhatsApp.', eNaam: 'Bitte geben Sie Ihren Namen und Ihre Telefonnummer ein.', ePriv: 'Setzen Sie das Häkchen für den Datenschutz, um fortzufahren.', eMis: 'Hoppla, etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.' }
  };
  var L = D[TAAL] || D.nl;

  /* Build the API endpoint.
     Order: an explicit data-endpoint, then THIS SCRIPT'S OWN ORIGIN, then the
     product domain.

     The origin is derived from the script tag because that is the one host
     that is guaranteed correct: the customer pasted a <script src> pointing at
     wherever Helvaro actually lives, so the API lives there too. It was
     hardcoded to a Vercel-generated hostname
     (helvaro-helvaros-projects.vercel.app) — a name Vercel derives from the
     project and team and will change if either is renamed, at which point
     every customer's embedded form silently stops submitting, on their site,
     with no error anyone at Helvaro would see. It also put a third-party-
     looking domain in the network traffic of every client's website. */
  function originOfScript() {
    try {
      if (script && script.src) return new URL(script.src, location.href).origin;
    } catch (e) { /* fall through */ }
    return '';
  }
  var API_ORIGIN = originOfScript() || 'https://app.helvaro.pro';
  var API_ENDPOINT = CUSTOM_ENDPOINT ||
    (API_ORIGIN + '/api/form/' + encodeURIComponent(PROJECT_CODE));

  /* ── Styles ───────────────────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent =
        '#hv-btn{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;' +
    'background:linear-gradient(135deg,#1e6fd9,#00d4ff);border:none;cursor:pointer;' +
    'box-shadow:0 4px 20px rgba(30,111,217,.5);z-index:9999;display:flex;align-items:center;' +
    'justify-content:center;transition:transform .2s,box-shadow .2s}' +
    '#hv-btn:hover{transform:scale(1.1);box-shadow:0 6px 28px rgba(30,111,217,.7)}' +
    '#hv-overlay{position:fixed;inset:0;background:rgba(3,8,18,.85);backdrop-filter:blur(8px);' +
    '-webkit-backdrop-filter:blur(8px);z-index:10000;display:none;align-items:center;' +
    'justify-content:center;padding:16px;box-sizing:border-box}' +
    '#hv-overlay.open{display:flex}' +
    '#hv-card{background:#060e1f;border:1px solid rgba(30,111,217,.4);border-radius:16px;' +
    'padding:32px;width:100%;max-width:400px;box-shadow:0 0 60px rgba(30,111,217,.15);' +
    'position:relative;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;animation:hvIn .25s ease}' +
    '@keyframes hvIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}' +
    '#hv-x{position:absolute;top:12px;right:12px;background:rgba(255,255,255,.06);border:none;' +
    'color:#6a85b0;width:28px;height:28px;border-radius:7px;cursor:pointer;font-size:14px;' +
    'display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}' +
    '#hv-x:hover{background:rgba(255,69,96,.15);color:#ff4560}' +
    '.hv-logo{text-align:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;font-size:22px;font-weight:700;' +
    'background:linear-gradient(135deg,#fff,#00d4ff);-webkit-background-clip:text;' +
    '-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:2px;margin-bottom:6px}' +
    '.hv-sub{text-align:center;color:#6a85b0;font-size:13px;margin-bottom:22px;line-height:1.5}' +
    '.hv-lbl{display:block;font-size:11px;font-weight:600;color:#00d4ff;letter-spacing:1.2px;' +
    'text-transform:uppercase;margin-bottom:7px}' +
    '.hv-inp{width:100%;background:#0a1628;border:1px solid rgba(30,111,217,.25);border-radius:8px;' +
    'padding:12px 14px;color:#e8f0ff;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;margin-bottom:15px;' +
    'outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}' +
    '.hv-inp:focus{border-color:rgba(43,143,255,.6);box-shadow:0 0 0 3px rgba(43,143,255,.1)}' +
    '.hv-inp::placeholder{color:#3d5070}' +
    '#hv-send{width:100%;background:linear-gradient(135deg,#1e6fd9,#0099cc);color:#fff;border:none;' +
    'border-radius:8px;padding:13px;font-weight:600;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
    'cursor:pointer;letter-spacing:.4px;transition:box-shadow .2s,opacity .15s;margin-top:4px}' +
    '#hv-send:hover:not(:disabled){box-shadow:0 0 20px rgba(30,111,217,.5)}' +
    '#hv-send:disabled{opacity:.6;cursor:not-allowed}' +
    '#hv-ok{text-align:center;display:none;padding:8px 0}' +
    '.hv-tick{width:52px;height:52px;background:rgba(0,229,160,.12);border:2px solid rgba(0,229,160,.3);' +
    'border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:22px}' +
    '.hv-ok-txt{color:#e8f0ff;font-size:14px;line-height:1.6}' +
    '.hv-ok-txt strong{color:#00e5a0}' +
    '#hv-err{color:#ff4560;font-size:12px;margin-top:10px;padding:10px 12px;' +
    'background:rgba(255,69,96,.1);border:1px solid rgba(255,69,96,.2);border-radius:8px;display:none}' +
    '.hv-consent-row{display:flex;align-items:flex-start;gap:8px;margin:2px 0 15px;cursor:pointer;user-select:none}' +
    '.hv-consent-row input[type="checkbox"]{flex-shrink:0;margin-top:2px;width:16px;height:16px;cursor:pointer;accent-color:#1e6fd9}' +
    '.hv-consent-row span{font-size:11px;line-height:1.5;color:#6a85b0}' +
    '.hv-consent-row a{color:#00d4ff;text-decoration:underline}';
  document.head.appendChild(css);

  /* ── HTML ─────────────────────────────────────────────────────────────── */
  var el = document.createElement('div');
  el.innerHTML =
    '<button id="hv-btn" aria-label="' + L.aria + '">' +
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none">' +
    '<path d="M20 2H4C2.9 2 2 2.9 2 4V22L6 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="white"/>' +
    '</svg></button>' +
    '<div id="hv-overlay" role="dialog" aria-modal="true">' +
    '<div id="hv-card">' +
    '<button id="hv-x" aria-label="' + L.sluit + '">\u2715</button>' +
    '<div class="hv-logo">' + SAFE_CLIENT_NAME + '</div>' +
    '<p class="hv-sub">' + L.sub + '</p>' +
    '<div id="hv-form">' +
    '<label class="hv-lbl" for="hv-naam">' + L.naam + '</label>' +
    '<input class="hv-inp" id="hv-naam" type="text" placeholder="' + L.naamPh + '" autocomplete="name">' +
    '<label class="hv-lbl" for="hv-tel">' + L.tel + '</label>' +
    '<input class="hv-inp" id="hv-tel" type="tel" placeholder="0478 12 34 56" autocomplete="tel">' +
    '<label class="hv-consent-row" for="hv-consent">' +
    '<input type="checkbox" id="hv-consent">' +
    '<span>' + L.akkoord1 + SAFE_CLIENT_NAME + L.akkoord2 +
    '<a href="https://app.helvaro.pro/privacy" target="_blank" rel="noopener">' + L.privacy + '</a>.</span>' +
    '</label>' +
    '<button id="hv-send">' + L.stuur + '</button>' +
    '<div id="hv-err"></div>' +
    '</div>' +
    '<div id="hv-ok">' +
    '<div class="hv-tick">\u2713</div>' +
    '<p class="hv-ok-txt"><strong>' + L.bedankt + '</strong><br>' + L.bedanktTxt + ' \uD83D\uDCAC</p>' +
    '</div>' +
    '</div></div>';
  document.body.appendChild(el);

  /* ── Logic ────────────────────────────────────────────────────────────── */
  var btn     = document.getElementById('hv-btn');
  var overlay = document.getElementById('hv-overlay');
  var xBtn    = document.getElementById('hv-x');
  var form    = document.getElementById('hv-form');
  var sendBtn = document.getElementById('hv-send');
  var okEl    = document.getElementById('hv-ok');
  var errEl   = document.getElementById('hv-err');
  var naamEl  = document.getElementById('hv-naam');
  var telEl   = document.getElementById('hv-tel');
  var consentEl = document.getElementById('hv-consent');

  function open()  { overlay.classList.add('open'); naamEl.focus(); }
  function close() { overlay.classList.remove('open'); }

  btn.addEventListener('click', open);
  xBtn.addEventListener('click', close);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  naamEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  telEl.addEventListener('keydown',  function (e) { if (e.key === 'Enter') submit(); });
  sendBtn.addEventListener('click', submit);

  function submit() {
    errEl.style.display = 'none';
    var name  = naamEl.value.trim();
    var phone = telEl.value.trim();
    if (!name || !phone) {
      errEl.textContent   = L.eNaam;
      errEl.style.display = 'block';
      return;
    }
    if (!consentEl.checked) {
      errEl.textContent   = L.ePriv;
      errEl.style.display = 'block';
      return;
    }
    sendBtn.textContent = L.stuurt;
    sendBtn.disabled    = true;

    // POST to endpoint — project code is in the URL path, not in the body
    fetch(API_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name: name, phone: phone, bron: 'Website', consent: consentEl.checked })
    })
    .then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Serverfout'); });
      form.style.display = 'none';
      okEl.style.display = 'block';
    })
    .catch(function () {
      errEl.textContent   = L.eMis;
      errEl.style.display = 'block';
      sendBtn.textContent = L.stuur;
      sendBtn.disabled    = false;
    });
  }
})();
