// Client-facing lead form page — personalized per client (AI Name + Client Name)
// served from the Klanten / Client Config Airtable table.

module.exports = async function handler(req, res) {
  const code = (req.url || '').split('/').filter(Boolean).pop() || 'HELVARO';
  let project = decodeURIComponent(code).toUpperCase();

  // Strict validation — only alphanumeric + underscore, prevents XSS in JS context
  if (!/^[A-Z0-9_]{1,50}$/.test(project)) {
    project = 'HELVARO';
  }

  // ── Pull client config (best-effort; falls back to defaults on any error) ──
  let aiName       = 'Mathis';
  let clientName   = 'Helvaro';
  let niche        = '';
  let aiPhotoUrl   = '';
  let brandColor   = '#6366f1';
  let formIntro    = '';
  let leadsThisWeek = 0;
  let lang          = 'nl';   // nl / fr / en — controls form-page + AI conversation language
  let trustBadges   = '';     // custom 'a | b | c' string, overrides defaults
  let workingHours  = '';     // 'mon-fri 9-18' style; informational for the form-page
  try {
    const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
    const BASE_ID        = process.env.BASE_AIRTABLE;
    const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
    const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
    if (AIRTABLE_TOKEN && BASE_ID) {
      const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${project.replace(/"/g, '\\"')}"`);
      // 3-second hard cap so a slow Airtable can't slow down the form-page render
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 3000);
      const r = await fetch(
        `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, signal: ctrl.signal }
      ).catch(() => null);
      clearTimeout(t);
      if (r && r.ok) {
        const d = await r.json().catch(() => ({}));
        const rec = (d.records || [])[0];
        if (rec) {
          aiName     = (rec.fields['fldRvoe1JMPOtPWC7'] || rec.fields['AI Name']     || aiName).toString().trim().slice(0, 60) || aiName;
          clientName = (rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name'] || clientName).toString().trim().slice(0, 100) || clientName;
          niche      = (rec.fields['fld0BsPnDbBOkTHzr'] || rec.fields['Niche']        || '').toString().trim();
          aiPhotoUrl = (rec.fields['fld7L0Iijq7ti6A6w'] || rec.fields['AI Photo URL'] || '').toString().trim();
          const bc   = (rec.fields['fldJAf4aTNlIQVL2q'] || rec.fields['Brand Color']  || '').toString().trim();
          if (/^#?[0-9a-fA-F]{6}$/.test(bc)) brandColor = bc.startsWith('#') ? bc : ('#' + bc);
          formIntro  = (rec.fields['fldxZ5spOeIb5omPr'] || rec.fields['Form Intro Message'] || '').toString().trim();
          const lg   = (rec.fields['fld1iiV9XwSbgAACZ'] || rec.fields['Language'] || '').toString().trim().toLowerCase();
          if (lg === 'fr' || lg === 'en' || lg === 'nl') lang = lg;
          trustBadges  = (rec.fields['fld4nzMbnQseuGhnN'] || rec.fields['Trust Badges'] || '').toString().trim();
          workingHours = (rec.fields['fldq5oIqw5MG8fKhc'] || rec.fields['Working Hours'] || '').toString().trim();
        }
      }

      // Social proof — count leads in last 7 days for this project (best-effort)
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 2500);
        const since = new Date(Date.now() - 7*86400000).toISOString();
        const leadFormula = encodeURIComponent(
          `AND({fldSmczuyUJd26HLe}="${project.replace(/"/g, '\\"')}",IS_AFTER({fldR0r13EU4RwrtvH},"${since}"))`
        );
        const lRes = await fetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${leadFormula}&fields[]=fldR0r13EU4RwrtvH&pageSize=100`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` }, signal: ctrl2.signal }
        ).catch(() => null);
        clearTimeout(t2);
        if (lRes && lRes.ok) {
          const ld = await lRes.json().catch(() => ({}));
          leadsThisWeek = (ld.records || []).length;
        }
      } catch { /* silent */ }
    }
  } catch { /* silent — fallback to defaults */ }

  // Compute a contrasting darker shade for the gradient end-stop
  function shadeHex(hex, percent) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const adj = c => Math.max(0, Math.min(255, Math.round(c * (1 + percent / 100))));
    const toHex = c => c.toString(16).padStart(2, '0');
    return '#' + toHex(adj(r)) + toHex(adj(g)) + toHex(adj(b));
  }
  const brandDark = shadeHex(brandColor, -25);
  // Validate aiPhotoUrl — only allow https URLs to prevent injection
  if (aiPhotoUrl && !/^https:\/\//.test(aiPhotoUrl)) aiPhotoUrl = '';

  // Strip control chars + escape for HTML / JS string contexts (defense in depth)
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escJs(s) { return String(s || '').replace(/[\x00-\x1F\x7F]/g, '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  const firstName       = aiName.split(/\s+/)[0] || aiName;
  const initial         = (firstName[0] || 'M').toUpperCase();
  const safeAiName      = escHtml(aiName);
  const safeFirstName   = escHtml(firstName);
  const safeClientName  = escHtml(clientName);

  // ── i18n: all UI strings per language ──────────────────────────────────────
  const i18n = {
    nl: {
      title:           safeFirstName + ' van ' + safeClientName + ' — neem contact op',
      meta:            safeFirstName + ' reageert binnen 1 minuut via WhatsApp.',
      status:          '● Online — reageert binnen 1 min',
      intro:           'Hey 👋 ik ben',
      introMid:        'van',
      typing:          'typt',
      labelName:       'Hoe mag ik je noemen?',
      labelPhone:      'Je WhatsApp nummer',
      placeholderName: 'Jouw naam',
      placeholderPhone:'0478 12 34 56',
      btn:             'Stuur',
      btnSuffix:       'mijn gegevens',
      errMissing:      'Vul je naam en telefoonnummer in zodat',
      errMissingTail:  'contact kan opnemen.',
      errGeneric:      'Er ging iets mis. Probeer opnieuw.',
      loading:         'Een momentje...',
      thanks:          'Bedankt,',
      friend:          'vriend',
      successText:     'stuurt je nu een persoonlijk bericht via WhatsApp.',
      step1:           'Check je WhatsApp binnen 1 min',
      step2:           'Beantwoord',
      step2Tail:       "'s vraag",
      step3:           'We plannen een afspraak als jij wil',
      trust1:          'Geen spam, ooit',
      trust2:          'Reactie binnen 1 min',
      trust3:          'Vrijblijvend',
      poweredBy:       'Powered by',
      socialPre:       'mensen vroegen',
      socialPost:      'deze week om advies',
      nicheHooks: {
        dentist:     'Ik help je graag bij je vragen over je gebit of een behandeling.',
        real_estate: 'Ik help je graag verder, of je nu een woning zoekt of er één wil verkopen.',
        lawyer:      'Ik help je graag verder met juridisch advies of een dossier.',
        finance:     'Ik help je graag met je financiële vraag.',
        default:     'Ik help je graag verder — laat hieronder je gegevens achter en je hoort meteen van me.'
      }
    },
    fr: {
      title:           safeFirstName + ' de ' + safeClientName + ' — prenez contact',
      meta:            safeFirstName + ' répond en 1 minute via WhatsApp.',
      status:          '● En ligne — réponse en 1 min',
      intro:           'Salut 👋 je suis',
      introMid:        'de',
      typing:          'écrit',
      labelName:       'Comment puis-je vous appeler ?',
      labelPhone:      'Votre numéro WhatsApp',
      placeholderName: 'Votre nom',
      placeholderPhone:'0478 12 34 56',
      btn:             'Envoyer mes coordonnées à',
      btnSuffix:       '',
      errMissing:      'Saisissez votre nom et votre numéro pour que',
      errMissingTail:  'puisse vous contacter.',
      errGeneric:      "Une erreur s'est produite. Réessayez.",
      loading:         'Un instant...',
      thanks:          'Merci,',
      friend:          'à vous',
      successText:     'vous envoie un message personnel via WhatsApp.',
      step1:           'Vérifiez WhatsApp dans 1 minute',
      step2:           'Répondez à la question de',
      step2Tail:       '',
      step3:           'Nous planifions un rendez-vous si vous voulez',
      trust1:          'Pas de spam, jamais',
      trust2:          'Réponse en 1 min',
      trust3:          'Sans engagement',
      poweredBy:       'Propulsé par',
      socialPre:       'personnes ont demandé conseil à',
      socialPost:      'cette semaine',
      nicheHooks: {
        dentist:     "Je vous aide volontiers avec vos questions sur vos dents ou un traitement.",
        real_estate: "Je vous aide volontiers, que vous cherchiez une maison ou que vous souhaitiez en vendre une.",
        lawyer:      "Je vous aide volontiers avec un conseil juridique ou un dossier.",
        finance:     "Je vous aide volontiers avec votre question financière.",
        default:     "Je vous aide volontiers — laissez vos coordonnées ci-dessous et je vous contacte tout de suite."
      }
    },
    en: {
      title:           safeFirstName + ' from ' + safeClientName + ' — get in touch',
      meta:            safeFirstName + ' replies within 1 minute on WhatsApp.',
      status:          '● Online — replies in 1 min',
      intro:           "Hey 👋 I'm",
      introMid:        'from',
      typing:          'typing',
      labelName:       'What should I call you?',
      labelPhone:      'Your WhatsApp number',
      placeholderName: 'Your name',
      placeholderPhone:'+32 478 12 34 56',
      btn:             'Send my details to',
      btnSuffix:       '',
      errMissing:      'Please fill in your name and phone number so',
      errMissingTail:  'can reach you.',
      errGeneric:      'Something went wrong. Please try again.',
      loading:         'One moment...',
      thanks:          'Thanks,',
      friend:          'friend',
      successText:     "is sending you a personal WhatsApp message now.",
      step1:           'Check WhatsApp within 1 minute',
      step2:           "Answer",
      step2Tail:       "'s question",
      step3:           "We'll plan a meeting if you want",
      trust1:          'No spam, ever',
      trust2:          'Reply within 1 min',
      trust3:          'No commitment',
      poweredBy:       'Powered by',
      socialPre:       'people asked',
      socialPost:      'for advice this week',
      nicheHooks: {
        dentist:     'I’m happy to help you with any dental questions or treatments.',
        real_estate: 'I’m happy to help, whether you’re looking to buy or sell a property.',
        lawyer:      'I’m happy to help you with legal advice or a case.',
        finance:     'I’m happy to help with your financial question.',
        default:     'I’m happy to help — drop your details below and you’ll hear from me right away.'
      }
    }
  };
  const t = i18n[lang] || i18n.nl;

  // Custom Form Intro Message overrides the language default; supports {naam}/{bedrijf}/{ai} placeholders
  let introText = formIntro || t.nicheHooks[niche] || t.nicheHooks.default;
  introText = introText
    .replace(/\{ai\}/g,      aiName)
    .replace(/\{bedrijf\}/g, clientName)
    .replace(/\{firstname\}/g, aiName.split(/\s+/)[0]);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');     // always render fresh — client just changed AI Name
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.status(200).send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t.title}</title>
<meta name="description" content="${t.meta}">
<link rel="icon" href="/favicon.png" type="image/png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --brand: ${brandColor};
    --brand-dark: ${brandDark};
    --brand-soft: ${brandColor}1a;
    --brand-faint: ${brandColor}0d;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    background: radial-gradient(circle at 20% 0%, #1a2540 0%, #050811 55%);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px;
    color: #e8eef7;
  }
  .card {
    background: #0b1224; border: 1px solid var(--brand-soft);
    border-radius: 20px;
    width: 100%; max-width: 460px;
    box-shadow: 0 20px 60px rgba(0,0,0,.5);
    overflow: hidden;
  }

  /* WhatsApp-style chat header */
  .chat-hdr {
    background: #14233f;
    padding: 18px 22px;
    display: flex; align-items: center; gap: 14px;
    border-bottom: 1px solid var(--brand-soft);
  }
  .avatar {
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, var(--brand), var(--brand-dark));
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 19px;
    flex-shrink: 0; position: relative; overflow: visible;
  }
  .avatar img {
    width: 48px; height: 48px; border-radius: 50%;
    object-fit: cover; display: block;
  }
  .online-dot {
    position: absolute; right: 0; bottom: 1px;
    width: 12px; height: 12px; border-radius: 50%;
    background: #22c55e; border: 2px solid #14233f;
    box-shadow: 0 0 6px rgba(34,197,94,.7);
    animation: dotPulse 1.6s ease-in-out infinite;
  }
  @keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  .hdr-text { flex: 1; min-width: 0; }
  .hdr-name { font-size: 15px; font-weight: 700; color: #fff; }
  .hdr-status { font-size: 12px; color: #22c55e; font-weight: 600; }
  .hdr-brand { font-size: 11px; color: #6a85b0; margin-top: 2px; }

  /* Chat-style intro bubble */
  .chat-area {
    padding: 22px 22px 8px;
    background:
      radial-gradient(circle at 10% 90%, var(--brand-faint) 0%, transparent 60%),
      #0b1224;
  }
  .bubble {
    background: var(--brand-soft); border: 1px solid var(--brand-soft);
    border-bottom-left-radius: 4px; border-radius: 14px;
    padding: 12px 14px; font-size: 14px; line-height: 1.5;
    color: #e8eef7; max-width: 88%; margin-bottom: 6px;
    animation: bubbleIn .35s ease;
  }
  @keyframes bubbleIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .bubble-meta {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; color: #6a85b0; margin-bottom: 14px; padding-left: 4px;
  }
  .typing-dots { display: inline-flex; gap: 3px; align-items: center; margin-left: 2px; }
  .typing-dots span {
    width: 4px; height: 4px; border-radius: 50%;
    background: #6a85b0;
    animation: typingDot 1.2s infinite ease-in-out;
  }
  .typing-dots span:nth-child(2) { animation-delay: .15s; }
  .typing-dots span:nth-child(3) { animation-delay: .30s; }
  @keyframes typingDot {
    0%, 60%, 100% { transform: scale(.7); opacity: .3; }
    30%           { transform: scale(1);  opacity: 1; }
  }
  .bubble strong { color: #fff; font-weight: 600; }

  .social-proof {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.18);
    color: #c5d4e8; padding: 6px 11px; border-radius: 999px;
    font-size: 11px; font-weight: 500;
    margin-bottom: 14px;
  }
  .social-proof .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #22c55e; box-shadow: 0 0 5px rgba(34,197,94,.6);
  }
  .social-proof b { color: #22c55e; font-weight: 700; }

  /* Form */
  .form-area { padding: 6px 22px 24px; }
  label {
    display: block; font-size: 11px; font-weight: 700;
    color: var(--brand); letter-spacing: .08em; text-transform: uppercase;
    margin-bottom: 7px; margin-top: 14px;
    filter: brightness(1.4);
  }
  input {
    width: 100%; background: #0a1320;
    border: 1px solid var(--brand-soft); border-radius: 11px;
    padding: 13px 15px; color: #e8eef7; font-size: 15px;
    font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-faint); }
  input::placeholder { color: #3d5070; }

  button {
    width: 100%; margin-top: 18px;
    background: linear-gradient(135deg, var(--brand), var(--brand-dark));
    color: #fff; border: none; border-radius: 11px;
    padding: 14px; font-weight: 700; font-size: 15px;
    font-family: inherit; cursor: pointer; letter-spacing: .2px;
    transition: opacity .15s, box-shadow .2s;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  }
  button:hover:not(:disabled) { box-shadow: 0 6px 24px var(--brand-soft); filter: brightness(1.08); }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .btn-icon { display: inline-flex; }

  .error {
    display: none; color: #ff6378; font-size: 13px;
    margin-top: 14px; padding: 10px 14px;
    background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.22);
    border-radius: 9px;
  }

  /* Success state */
  .success { display: none; padding: 32px 26px 22px; text-align: center; }
  .success .tick {
    width: 64px; height: 64px;
    background: rgba(34,197,94,.12); border: 2px solid rgba(34,197,94,.4);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 18px; font-size: 30px; color: #22c55e;
  }
  .success h3 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
  .success p { color: #a0b8d8; font-size: 14px; line-height: 1.65; }
  .success strong { color: #22c55e; }
  .success-steps {
    margin-top: 22px; padding: 14px 16px;
    background: rgba(34,197,94,.06); border: 1px solid rgba(34,197,94,.18);
    border-radius: 10px; text-align: left;
  }
  .success-step { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13px; color: #c5d4e8; }
  .success-step .num {
    width: 20px; height: 20px; border-radius: 50%;
    background: #22c55e; color: #fff; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  /* Footer trust strip */
  .trust {
    display: flex; align-items: center; justify-content: center;
    gap: 14px; padding: 14px 22px 22px;
    flex-wrap: wrap; border-top: 1px solid var(--brand-faint);
  }
  .trust-item {
    display: inline-flex; align-items: center; gap: 5px;
    color: #6a85b0; font-size: 11px;
  }
  .trust-item span { font-size: 13px; }
  .powered {
    text-align: center; font-size: 10px; color: #3d5070;
    padding: 6px 0 14px; letter-spacing: .03em;
  }
  .powered a { color: #6a85b0; text-decoration: none; }

  @media (max-width: 480px) {
    body { padding: 12px 10px; align-items: flex-start; }
    .card { border-radius: 16px; }
    .chat-hdr, .chat-area, .form-area { padding-left: 18px; padding-right: 18px; }
  }
</style>
</head>
<body>
<div class="card">

  <!-- WhatsApp-style header with the AI persona -->
  <div class="chat-hdr">
    <div class="avatar">
      ${aiPhotoUrl
        ? `<img src="${escHtml(aiPhotoUrl)}" alt="${safeAiName}" onerror="this.style.display='none';this.parentNode.insertAdjacentText('afterbegin','${escJs(initial)}')">`
        : escHtml(initial)
      }
      <span class="online-dot" title="${safeFirstName} is online"></span>
    </div>
    <div class="hdr-text">
      <div class="hdr-name">${safeAiName}</div>
      <div class="hdr-status">${escHtml(t.status)}</div>
      <div class="hdr-brand">${safeClientName}</div>
    </div>
  </div>

  <!-- Chat-bubble intro -->
  <div class="chat-area" id="chat-area">
    ${leadsThisWeek >= 3
      ? `<div class="social-proof"><span class="dot"></span> <b>${leadsThisWeek}</b> ${escHtml(t.socialPre)} ${safeFirstName} ${escHtml(t.socialPost)}</div>`
      : ''
    }
    <div class="bubble">
      ${escHtml(t.intro)} <strong>${safeFirstName}</strong> ${escHtml(t.introMid)} <strong>${safeClientName}</strong>.<br>
      ${escHtml(introText)}
    </div>
    <div class="bubble-meta">
      ${safeFirstName} ${escHtml(t.typing)}
      <span class="typing-dots"><span></span><span></span><span></span></span>
    </div>
  </div>

  <!-- Form (default visible) -->
  <div class="form-area" id="form">
    <label for="naam">${escHtml(t.labelName)}</label>
    <input id="naam" type="text" placeholder="${escHtml(t.placeholderName)}" autocomplete="name">

    <label for="tel">${escHtml(t.labelPhone)}</label>
    <input id="tel" type="tel" placeholder="${escHtml(t.placeholderPhone)}" autocomplete="tel" inputmode="tel">

    <button id="btn">
      <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4 0-.6.1-.2.3-.7.9-.9 1.1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4 0-.7.3-.3.3-.9.9-.9 2.2 0 1.3.9 2.5 1 2.7.1.1 1.8 2.7 4.3 3.7.6.2 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3z"/>
      </svg>
      ${escHtml(t.btn)} ${safeFirstName}${t.btnSuffix ? ' ' + escHtml(t.btnSuffix) : ''}
    </button>
    <div class="error" id="err"></div>
  </div>

  <!-- Success -->
  <div class="success" id="ok">
    <div class="tick">✓</div>
    <h3>${escHtml(t.thanks)} <span id="ok-name">${escHtml(t.friend)}</span>!</h3>
    <p><strong>${safeFirstName}</strong> ${escHtml(t.successText)}</p>
    <div class="success-steps">
      <div class="success-step"><span class="num">1</span> ${escHtml(t.step1)}</div>
      <div class="success-step"><span class="num">2</span> ${escHtml(t.step2)} ${safeFirstName}${escHtml(t.step2Tail)}</div>
      <div class="success-step"><span class="num">3</span> ${escHtml(t.step3)}</div>
    </div>
  </div>

  <!-- Trust strip — custom badges from Klanten or fall back to localized defaults -->
  <div class="trust">
    ${trustBadges
      ? trustBadges.split('|').slice(0, 3).map(b => {
          const txt = b.trim();
          if (!txt) return '';
          // First emoji-looking char becomes the icon, rest is the text
          const m = txt.match(/^(\S+)\s+(.+)$/);
          const icon = m ? m[1] : '✓';
          const text = m ? m[2] : txt;
          return `<div class="trust-item"><span>${escHtml(icon)}</span> ${escHtml(text)}</div>`;
        }).join('')
      : `<div class="trust-item"><span>🔒</span> ${escHtml(t.trust1)}</div>
         <div class="trust-item"><span>⚡</span> ${escHtml(t.trust2)}</div>
         <div class="trust-item"><span>🤝</span> ${escHtml(t.trust3)}</div>`
    }
  </div>
  <div class="powered">${escHtml(t.poweredBy)} <a href="https://app.helvaro.pro" target="_blank" rel="noopener">Helvaro</a></div>
</div>

<script>
var PROJECT  = '${escJs(project)}';
var AI_FIRST = '${escJs(firstName)}';
var FALLBACK_NAME = '${escJs(t.friend)}';
var I18N = {
  errMissing:     '${escJs(t.errMissing)}',
  errMissingTail: '${escJs(t.errMissingTail)}',
  errGeneric:     '${escJs(t.errGeneric)}',
  loading:        '${escJs(t.loading)}',
  btn:            '${escJs(t.btn)}',
  btnSuffix:      '${escJs(t.btnSuffix)}'
};
var API = 'https://app.helvaro.pro/api/form/' + encodeURIComponent(PROJECT);

var btn  = document.getElementById('btn');
var err  = document.getElementById('err');
var form = document.getElementById('form');
var ok   = document.getElementById('ok');

function btnDefault() {
  return I18N.btn + ' ' + AI_FIRST + (I18N.btnSuffix ? ' ' + I18N.btnSuffix : '');
}

btn.addEventListener('click', function() {
  var name  = document.getElementById('naam').value.trim();
  var phone = document.getElementById('tel').value.trim();

  err.style.display = 'none';
  if (!name || !phone) {
    err.textContent   = I18N.errMissing + ' ' + AI_FIRST + ' ' + I18N.errMissingTail;
    err.style.display = 'block';
    return;
  }

  btn.innerHTML  = I18N.loading;
  btn.disabled   = true;

  fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: name, phone: phone, bron: 'Advertentie' })
  })
  .then(function(r) {
    if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || I18N.errGeneric); });
    var firstName = name.split(' ')[0];
    var okName = document.getElementById('ok-name');
    if (okName) okName.textContent = firstName || FALLBACK_NAME;
    form.style.display = 'none';
    document.getElementById('chat-area').style.display = 'none';
    ok.style.display   = 'block';
  })
  .catch(function(e) {
    err.textContent   = e.message || I18N.errGeneric;
    err.style.display = 'block';
    btn.innerHTML     = btnDefault();
    btn.disabled      = false;
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && form.style.display !== 'none') btn.click();
});
</script>
</body>
</html>`);
};
