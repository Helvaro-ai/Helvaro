// Client-facing lead form page. Personalized per client (AI Name + Client Name)
// served from the Klanten / Client Config Airtable table.
//
// KNOWN SCOPE BOUNDARY (see api/_lang.js): the client's Language field now
// accepts any of the 40 registry languages (api/whatsapp.js's AI conversation
// speaks all of them), but the form-page UI text below (`i18n` object, ~20
// strings + niche hooks) is still hand-translated for nl/fr/en ONLY. A client
// configured with e.g. German still gets this Dutch-fallback form (see the
// `lang` variable below, unchanged: only 'fr'/'en'/'nl' are recognized here,
// everything else stays 'nl') while their WhatsApp AI conversation correctly
// speaks German. Translating this file's full UI text to all 40 languages is
// a separate, larger effort intentionally out of scope for the conversation-
// language rollout — flagged here so it isn't mistaken for an oversight.

const _properties = require('./_properties');

module.exports = async function handler(req, res) {
  /* Twee vormen:
       /start/TELJO       -- het algemene formulier van de makelaar
       /start/TELJO/P3    -- hetzelfde formulier, maar voor EEN pand
     De tweede is wat er onder een advertentie of op een bordje met QR-code
     komt te staan. Zonder deze splitsing pakte pop() bij die vorm de
     PANDCODE als projectcode, en dan viel het formulier terug op de
     Helvaro-standaard -- een klantloos formulier dat er correct uitziet. */
  const pad = (req.url || '').split('?')[0].split('/').filter(Boolean);
  const naStart = pad[0] === 'start' ? pad.slice(1) : pad.slice(-1);
  let project  = decodeURIComponent(naStart[0] || 'HELVARO').toUpperCase();
  let pandCode = naStart[1] ? decodeURIComponent(naStart[1]).toUpperCase() : '';

  // Strict validation. Only alphanumeric + underscore, prevents XSS in JS context
  if (!/^[A-Z0-9_]{1,50}$/.test(project)) {
    project = 'HELVARO';
  }
  /* Een onbekende of onzinnige pandcode is geen fout maar een lege waarde: het
     formulier werkt dan gewoon zonder pand. Iemand die een QR-code scheef
     scant hoort geen foutpagina te krijgen. */
  if (!_properties.geldigeCode(pandCode)) pandCode = '';

  // ── Pull client config (best-effort; falls back to defaults on any error) ──
  let aiName       = 'Mathis';
  let clientName   = 'Helvaro';
  let niche        = '';
  let aiPhotoUrl   = '';
  let brandColor   = '#8A6D3F'; // Helvaro default (warm bronze/sand family — deep enough for white text on solid fills). Overridden per-client by the Brand Color Airtable field.
  let formIntro    = '';
  let leadsThisWeek = 0;
  let lang          = 'nl';   // nl / fr / en. Controls form-page + AI conversation language
  let trustBadges   = '';     // custom 'a | b | c' string, overrides defaults
  let workingHours  = '';     // 'mon-fri 9-18' style; informational for the form-page
  try {
    const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
    const BASE_ID        = process.env.BASE_AIRTABLE;
    const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';
    const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
    if (AIRTABLE_TOKEN && BASE_ID) {
      const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${project.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
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

      // Social proof. Count leads in last 7 days for this project (best-effort)
      try {
        const ctrl2 = new AbortController();
        const t2 = setTimeout(() => ctrl2.abort(), 2500);
        const since = new Date(Date.now() - 7*86400000).toISOString();
        const leadFormula = encodeURIComponent(
          `AND({fldSmczuyUJd26HLe}="${project.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}",IS_AFTER({fldR0r13EU4RwrtvH},"${since}"))`
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
  } catch { /* silent. Fallback to defaults */ }

  /* ── Het pand, als de link er een noemt ────────────────────────────────────
     Dit is waarom deze pagina bestaat in de pandvorm: de bezoeker ziet meteen
     WELKE woning hij aanvraagt, en de lead die eruit komt draagt die code mee
     tot in het WhatsApp-gesprek. Zonder dit moest de AI raden welke van de
     vier panden bedoeld werd.

     Best-effort, net als alles hierboven: valt Airtable weg, dan is er geen
     pandblok en werkt het formulier gewoon. Een storing hoort een lead niet
     tegen te houden. */
  let pand = null;
  if (pandCode) {
    try {
      pand = await _properties.getByCode(project, pandCode);
      /* Niet-publiek betekent: wel in het CRM, niet naar buiten. Een makelaar
         die een pand voorbereidt hoort het niet al gedeeld te zien. */
      if (pand && (!pand.publiek || pand.gearchiveerd)) pand = null;
    } catch (e) {
      console.warn('[form-page] pand ophalen mislukt:', e && e.message);
    }
  }

  // Compute a contrasting darker shade for the gradient end-stop
  function shadeHex(hex, percent) {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const adj = c => Math.max(0, Math.min(255, Math.round(c * (1 + percent / 100))));
    const toHex = c => c.toString(16).padStart(2, '0');
    return '#' + toHex(adj(r)) + toHex(adj(g)) + toHex(adj(b));
  }
  const brandDark = shadeHex(brandColor, -25);
  // Validate aiPhotoUrl. Accept https URLs OR self-hosted base64 image data URLs
  // (uploaded via dashboard's file picker). Anything else is dropped to prevent
  // injection (no javascript:, no data:text/html, no relative paths).
  if (aiPhotoUrl) {
    const isHttps = /^https:\/\//.test(aiPhotoUrl);
    const isData  = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(aiPhotoUrl);
    if (!isHttps && !isData) aiPhotoUrl = '';
  }

  // Strip control chars + escape for HTML / JS string contexts (defense in depth)
  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // Escape for embedding in a JS string literal. Used in two contexts:
  // 1. Single-quoted strings inside an inline <script> block
  // 2. Single-quoted strings inside an HTML attribute (e.g. onerror="...")
  // Must neutralize </script> (browsers parse the closing tag before JS
  // interprets the string contents) AND double quotes (to not break out of
  // HTML attribute context). Escaping < > / " as \xNN hex codes handles both.
  function escJs(s) {
    return String(s || '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\x22')
      .replace(/</g, '\\x3C')
      .replace(/>/g, '\\x3E')
      .replace(/\//g, '\\x2F');
  }

  const firstName       = aiName.split(/\s+/)[0] || aiName;
  const initial         = (firstName[0] || 'M').toUpperCase();
  const safeAiName      = escHtml(aiName);
  const safeFirstName   = escHtml(firstName);
  const safeClientName  = escHtml(clientName);

  // ── i18n: all UI strings per language ──────────────────────────────────────
  const i18n = {
    nl: {
      title:           safeFirstName + ' van ' + safeClientName + ' · Contact',
      meta:            safeFirstName + ' reageert binnen 1 minuut via WhatsApp.',
      status:          '● Online. Reageert binnen 1 min',
      intro:           'Hallo, ik ben',
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
      consentPre:      'Ik ga akkoord dat',
      consentMid:      'mij via WhatsApp contacteert. Zie het',
      consentLink:     'privacybeleid',
      consentSuffix:   '.',
      errConsent:      'Vink het privacy-vakje aan om verder te gaan.',
      errPhone:        'Dit lijkt geen geldig telefoonnummer. Controleer het even — je krijgt het antwoord via WhatsApp.',
      nicheHooks: {
        dentist:     'Ik help je graag bij je vragen over je gebit of een behandeling.',
        real_estate: 'Ik help je graag verder, of je nu een woning zoekt of er één wil verkopen.',
        lawyer:      'Ik help je graag verder met juridisch advies of een dossier.',
        finance:     'Ik help je graag met je financiële vraag.',
        default:     'Ik help je graag verder. Laat hieronder je gegevens achter en je hoort meteen van me.'
      }
    },
    fr: {
      title:           safeFirstName + ' de ' + safeClientName + ' · Contact',
      meta:            safeFirstName + ' répond en 1 minute via WhatsApp.',
      status:          '● En ligne. Réponse en 1 min',
      intro:           'Bonjour, je suis',
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
      consentPre:      "J'accepte que",
      consentMid:      'me contacte via WhatsApp. Voir la',
      consentLink:     'politique de confidentialité',
      consentSuffix:   '.',
      errConsent:      'Cochez la case de confidentialité pour continuer.',
      errPhone:        "Ce numéro ne semble pas valide. Vérifiez-le — la réponse arrive via WhatsApp.",
      nicheHooks: {
        dentist:     "Je vous aide volontiers avec vos questions sur vos dents ou un traitement.",
        real_estate: "Je vous aide volontiers, que vous cherchiez une maison ou que vous souhaitiez en vendre une.",
        lawyer:      "Je vous aide volontiers avec un conseil juridique ou un dossier.",
        finance:     "Je vous aide volontiers avec votre question financière.",
        default:     "Je vous aide volontiers. Laissez vos coordonnées ci-dessous et je vous contacte tout de suite."
      }
    },
    en: {
      title:           safeFirstName + ' from ' + safeClientName + ' · Contact',
      meta:            safeFirstName + ' replies within 1 minute on WhatsApp.',
      status:          '● Online. Replies in 1 min',
      intro:           "Hello, I'm",
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
      consentPre:      'I agree that',
      consentMid:      'may contact me via WhatsApp. See the',
      consentLink:     'privacy policy',
      consentSuffix:   '.',
      errConsent:      'Tick the privacy box to continue.',
      errPhone:        'That does not look like a valid phone number. Please check it — the reply comes via WhatsApp.',
      nicheHooks: {
        dentist:     'I’m happy to help you with any dental questions or treatments.',
        real_estate: 'I’m happy to help, whether you’re looking to buy or sell a property.',
        lawyer:      'I’m happy to help you with legal advice or a case.',
        finance:     'I’m happy to help with your financial question.',
        default:     'I’m happy to help. Drop your details below and you’ll hear from me right away.'
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
  res.setHeader('Cache-Control', 'no-store');     // always render fresh. Client just changed AI Name
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // SAMEORIGIN, not DENY. The clickjacking protection this exists for is about
  // a THIRD party framing the form to trick someone into submitting it, and
  // same-origin-only stops that completely. DENY also blocked Helvaro's own
  // dashboard, whose Formulier page previews this exact URL in an iframe — so
  // that preview panel rendered blank for every client, in production, since
  // it shipped. The paired frame-ancestors below is what modern browsers
  // actually read; this header is for the ones that do not.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Stond hier niet, op dashboard.js wel. Deze pagina vraagt geen camera,
  // microfoon of locatie, dus zet ze uit.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Ook uit Google: dit is de leadpagina van één specifieke klant, die je via
  // een advertentie of een link deelt. Die hoort niet vindbaar te zijn onder
  // de naam van die klant, en al helemaal niet onder "Helvaro".
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // Zie de uitleg bij dezelfde header in api/dashboard.js. Geen Clerk hier —
  // dit is de publieke leadpagina, die praat alleen met zijn eigen origin.
  // img-src staat https: toe omdat de AI-foto van een klant een externe
  // https-URL mag zijn (gevalideerd in buildAiPhoto).
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    // Het formulier post naar een ABSOLUTE URL (var API hieronder), dus
    // app.helvaro.pro moet er expliciet in staan: op een preview-deploy is
    // 'self' die host niet en zou versturen stilletjes geblokkeerd worden.
    "connect-src 'self' https://app.helvaro.pro",
    // 'self', so the dashboard's own form preview can render. Any other origin
    // is still refused — see the X-Frame-Options note above.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '));
  res.status(200).send(`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t.title}</title>
<meta name="description" content="${t.meta}">
<link rel="icon" href="/favicon.png" type="image/png">
<style>
  /* Self-hosted Inter (GDPR — no request to Google's CDN). Loading a webfont
     from Google's font CDN sends the visitor's IP to Google on every page
     view; a Munich court ruled in 2022 that doing so without consent breaches
     the GDPR. Same treatment as the dashboard, which was fixed earlier. */
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 300 700;
    font-display: swap;
    src: url('/fonts/inter-var.woff2') format('woff2');
  }
</style>
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
    background: radial-gradient(circle at 20% 0%, #1A1A1A 0%, #121212 55%);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px;
    color: #F9F9F9;
  }
  .card {
    background: #1A1A1A; border: 1px solid var(--brand-soft);
    border-radius: 20px;
    width: 100%; max-width: 460px;
    box-shadow: 0 20px 60px rgba(0,0,0,.5);
    overflow: hidden;
  }

  /* WhatsApp-style chat header */
  .chat-hdr {
    background: #232323;
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
    background: #22c55e; border: 2px solid #232323;
    box-shadow: 0 0 6px rgba(34,197,94,.7);
    animation: dotPulse 1.6s ease-in-out infinite;
  }
  @keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  .hdr-text { flex: 1; min-width: 0; }
  .hdr-name { font-size: 15px; font-weight: 700; color: #F9F9F9; }

/* De pandkaart. Kleuren komen van de merkkleur van de klant, net als de rest
   van deze pagina, zodat hij er niet uitziet als een advertentie van iemand
   anders. */
.pand-card {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
}
.pand-card-foto {
  display: block;
  width: 100%;
  height: 132px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 10px;
  background: rgba(255,255,255,0.06);
}
.pand-card-adres { font-size: 14px; font-weight: 700; color: #F5F5F5; line-height: 1.35; }
.pand-card-plaats { font-size: 12px; color: #B9B4A8; margin-top: 2px; }
.pand-card-feiten {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px;
}
.pand-card-feit {
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.01em;
  padding: 3px 8px; border-radius: 999px;
  background: rgba(255,255,255,0.07); color: #E7E3D9;
}
.pand-card-prijs { background: rgba(255,255,255,0.13); color: #FFFFFF; }
/* Verkocht of onder bod krijgt zijn eigen vlak. Iemand die het formulier
   invult voor een woning die weg is, hoort dat HIER te lezen en niet pas van
   de AI. */
.pand-card-weg {
  margin-top: 9px; padding: 7px 10px; border-radius: 8px;
  background: rgba(220,120,90,0.16); border: 1px solid rgba(220,120,90,0.32);
  font-size: 12px; line-height: 1.45; color: #FFD9C9;
}
  .hdr-status { font-size: 12px; color: #22c55e; font-weight: 600; }
  .hdr-brand { font-size: 11px; color: #999999; margin-top: 2px; }

  /* Chat-style intro bubble */
  .chat-area {
    padding: 22px 22px 8px;
    background:
      radial-gradient(circle at 10% 90%, var(--brand-faint) 0%, transparent 60%),
      #1A1A1A;
  }
  .bubble {
    background: var(--brand-soft); border: 1px solid var(--brand-soft);
    border-bottom-left-radius: 4px; border-radius: 14px;
    padding: 12px 14px; font-size: 14px; line-height: 1.5;
    color: #F9F9F9; max-width: 88%; margin-bottom: 6px;
    animation: bubbleIn .35s ease;
  }
  @keyframes bubbleIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .bubble-meta {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; color: #999999; margin-bottom: 14px; padding-left: 4px;
  }
  .typing-dots { display: inline-flex; gap: 3px; align-items: center; margin-left: 2px; }
  .typing-dots span {
    width: 4px; height: 4px; border-radius: 50%;
    background: #999999;
    animation: typingDot 1.2s infinite ease-in-out;
  }
  .typing-dots span:nth-child(2) { animation-delay: .15s; }
  .typing-dots span:nth-child(3) { animation-delay: .30s; }
  @keyframes typingDot {
    0%, 60%, 100% { transform: scale(.7); opacity: .3; }
    30%           { transform: scale(1);  opacity: 1; }
  }
  .bubble strong { color: #F9F9F9; font-weight: 600; }

  .social-proof {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.18);
    color: #999999; padding: 6px 11px; border-radius: 999px;
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
    width: 100%; background: #232323;
    border: 1px solid var(--brand-soft); border-radius: 11px;
    padding: 13px 15px; color: #F9F9F9; font-size: 15px;
    font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-faint); }
  /* #666666 gaf 2,74:1 op deze invulvelden -- ruim onder de 4,5:1 die je nodig
     hebt om vlot te lezen. En juist hier staat het voorbeeld van het formaat
     ("0478 12 34 56"), dus de aanwijzing die iemand nodig heeft om zijn nummer
     goed in te tikken was de slechtst leesbare tekst van het scherm.
     #909090 haalt 4,92:1 en blijft duidelijk lichter dan de ingevulde tekst. */
  input::placeholder { color: #909090; }

  /* iOS Safari zoomt automatisch in zodra een invulveld kleiner is dan 16px.
     Op 15px sprong het formulier dus bij elke tik in het telefoonveld -- precies
     het veld waar het hele product van afhangt. Alleen op touch: met een muis
     is 15px de bedoelde maat en verandert er niets. */
  @media (hover: none) and (pointer: coarse) {
    input { font-size: 16px; }
  }

  /* Links hadden GEEN zichtbare focus. Wie met het toetsenbord invult ziet dan
     niet waar hij staat, en dit is een formulier met een privacylink erin --
     precies de link die iemand wil kunnen vinden voordat hij zijn nummer
     achterlaat. De invoervelden en de knop hadden hun ring al. */
  a:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 3px;
    border-radius: 3px;
  }

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

  /* De foutmelding is een live region (role="alert" staat op het element zelf).
     Daarom wordt hij getoond op INHOUD en niet met een inline display-stijl:
     een schermlezer kondigt een alert aan op het moment dat er tekst in komt,
     en met :empty valt tonen en aankondigen op hetzelfde moment. Zet je in
     plaats daarvan style.display, dan kan de tekst er al staan voordat het vak
     zichtbaar is en wordt er niets voorgelezen. */
  .error {
    color: #FF6B6B; font-size: 13px;
    margin-top: 14px; padding: 10px 14px;
    background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.22);
    border-radius: 9px;
  }
  .error:empty { display: none; }

  /* Success state */
  .success { display: none; padding: 32px 26px 22px; text-align: center; }
  .success .tick {
    width: 64px; height: 64px;
    background: rgba(34,197,94,.12); border: 2px solid rgba(34,197,94,.4);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 18px; font-size: 30px; color: #22c55e;
  }
  .success h3 { font-size: 18px; font-weight: 700; color: #F9F9F9; margin-bottom: 8px; }
  .success p { color: #999999; font-size: 14px; line-height: 1.65; }
  .success strong { color: #22c55e; }
  .success-steps {
    margin-top: 22px; padding: 14px 16px;
    background: rgba(34,197,94,.06); border: 1px solid rgba(34,197,94,.18);
    border-radius: 10px; text-align: left;
  }
  .success-step { display: flex; align-items: center; gap: 10px; padding: 4px 0; font-size: 13px; color: #cfcfcf; }
  .success-step .num {
    width: 20px; height: 20px; border-radius: 50%;
    background: #22c55e; color: #fff; font-size: 11px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }

  /* GDPR consent checkbox row */
  .consent-row {
    display: flex; align-items: flex-start; gap: 9px;
    margin: 14px 0 6px; padding: 10px 12px;
    background: var(--brand-faint); border-radius: 10px;
    cursor: pointer; user-select: none;
  }
  .consent-row input[type="checkbox"] {
    flex-shrink: 0; margin-top: 2px;
    width: 18px; height: 18px; cursor: pointer;
    accent-color: var(--brand);
  }
  /* De toestemmingsregel is een ZIN, geen veldlabel. Hij erft van label{}
     hierboven text-transform:uppercase, letter-spacing en vetdruk -- prima voor
     "JE WHATSAPP NUMMER" van drie woorden, slecht voor drie regels lopende
     tekst. En dit is nou net de zin die juridisch telt: als iemand ergens
     akkoord op geeft, hoort die zin het makkelijkst leesbare op het scherm te
     zijn, niet het moeilijkste. */
  .consent-text {
    font-size: 12px; line-height: 1.5; color: #999999;
    text-transform: none;
    letter-spacing: normal;
    font-weight: 400;
  }
  .consent-text a { color: var(--brand); text-decoration: underline; }
  .consent-text a:hover { opacity: .8; }

  /* Footer trust strip */
  .trust {
    display: flex; align-items: center; justify-content: center;
    gap: 14px; padding: 14px 22px 22px;
    flex-wrap: wrap; border-top: 1px solid var(--brand-faint);
  }
  .trust-item {
    display: inline-flex; align-items: center; gap: 5px;
    color: #999999; font-size: 11px;
  }
  .trust-item span { font-size: 13px; }
  .powered {
    text-align: center; font-size: 10px; color: #666666;
    padding: 6px 0 14px; letter-spacing: .03em;
  }
  .powered a { color: #999999; text-decoration: none; }

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
      <h1 class="hdr-name">${safeAiName}</h1>
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
    ${pand ? `<div class="pand-card">
      ${pand.fotos[0] ? `<img class="pand-card-foto" src="${escHtml(pand.fotos[0])}" alt="${escHtml(pand.adres)}" onerror="this.style.display='none'">` : ''}
      <div class="pand-card-adres">${escHtml(pand.adres)}</div>
      ${pand.plaats || pand.postcode ? `<div class="pand-card-plaats">${escHtml([pand.postcode, pand.plaats].filter(Boolean).join(' '))}</div>` : ''}
      <div class="pand-card-feiten">
        ${_properties.prijsTekst(pand.prijs) ? `<span class="pand-card-feit pand-card-prijs">${escHtml(_properties.prijsTekst(pand.prijs))}</span>` : ''}
        ${pand.slaapkamers ? `<span class="pand-card-feit">${pand.slaapkamers} slaapkamer${pand.slaapkamers === 1 ? '' : 's'}</span>` : ''}
        ${pand.oppervlakte ? `<span class="pand-card-feit">${pand.oppervlakte} m²</span>` : ''}
        ${pand.epc ? `<span class="pand-card-feit">EPC ${escHtml(pand.epc)}</span>` : ''}
      </div>
      ${!_properties.kanBezichtigen(pand.status)
        ? `<div class="pand-card-weg">Deze woning is ${escHtml(pand.status)}. Laat gerust je gegevens achter — ${safeFirstName} laat je weten wat er nog wél beschikbaar is.</div>`
        : ''}
    </div>` : ''}
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
    <input id="naam" type="text" placeholder="${escHtml(t.placeholderName)}" autocomplete="name" required>

    <label for="tel">${escHtml(t.labelPhone)}</label>
    <input id="tel" type="tel" placeholder="${escHtml(t.placeholderPhone)}" autocomplete="tel" inputmode="tel" required>

    <label class="consent-row" for="consent">
      <input id="consent" type="checkbox">
      <span class="consent-text">${escHtml(t.consentPre)} <strong>${escHtml(clientName)}</strong> ${escHtml(t.consentMid)} <a href="https://app.helvaro.pro/privacy" target="_blank" rel="noopener">${escHtml(t.consentLink)}</a>${escHtml(t.consentSuffix)}</span>
    </label>

    <button id="btn">
      <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4 0-.6.1-.2.3-.7.9-.9 1.1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4 0-.7.3-.3.3-.9.9-.9 2.2 0 1.3.9 2.5 1 2.7.1.1 1.8 2.7 4.3 3.7.6.2 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3z"/>
      </svg>
      ${escHtml(t.btn)} ${safeFirstName}${t.btnSuffix ? ' ' + escHtml(t.btnSuffix) : ''}
    </button>
    <div class="error" id="err" role="alert" aria-live="assertive"></div>
  </div>

  <!-- Success -->
  <div class="success" id="ok">
    <div class="tick"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
    <h3>${escHtml(t.thanks)} <span id="ok-name">${escHtml(t.friend)}</span>!</h3>
    <p><strong>${safeFirstName}</strong> ${escHtml(t.successText)}</p>
    <div class="success-steps">
      <div class="success-step"><span class="num">1</span> ${escHtml(t.step1)}</div>
      <div class="success-step"><span class="num">2</span> ${escHtml(t.step2)} ${safeFirstName}${escHtml(t.step2Tail)}</div>
      <div class="success-step"><span class="num">3</span> ${escHtml(t.step3)}</div>
    </div>
  </div>

  <!-- Trust strip. Custom badges from Klanten or fall back to localized defaults -->
  <div class="trust">
    ${trustBadges
      ? trustBadges.split('|').slice(0, 3).map(b => {
          const txt = b.trim();
          if (!txt) return '';
          // First emoji-looking char becomes the icon, rest is the text
          const m = txt.match(/^(\S+)\s+(.+)$/);
          const icon = m ? m[1] : '';
          const text = m ? m[2] : txt;
          return `<div class="trust-item"><span>${escHtml(icon)}</span> ${escHtml(text)}</div>`;
        }).join('')
      : `<div class="trust-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> ${escHtml(t.trust1)}</div>
         <div class="trust-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> ${escHtml(t.trust2)}</div>
         <div class="trust-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ${escHtml(t.trust3)}</div>`
    }
  </div>
  <div class="powered">${escHtml(t.poweredBy)} <a href="https://helvaro.pro" target="_blank" rel="noopener">Helvaro</a></div>
</div>

<script>
var PROJECT  = '${escJs(project)}';
/* De pandcode reist mee naar de lead, zodat de AI straks weet over welke
   woning dit gesprek gaat. Leeg = het algemene formulier. */
var PAND     = '${escJs(pand ? pand.code : '')}';
var AI_FIRST = '${escJs(firstName)}';
var FALLBACK_NAME = '${escJs(t.friend)}';
var I18N = {
  errMissing:     '${escJs(t.errMissing)}',
  errMissingTail: '${escJs(t.errMissingTail)}',
  errGeneric:     '${escJs(t.errGeneric)}',
  errConsent:     '${escJs(t.errConsent)}',
  errPhone:       '${escJs(t.errPhone)}',
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
  var name    = document.getElementById('naam').value.trim();
  var phone   = document.getElementById('tel').value.trim();
  var consent = document.getElementById('consent');

  err.textContent   = '';
  if (!name || !phone) {
    err.textContent   = I18N.errMissing + ' ' + AI_FIRST + ' ' + I18N.errMissingTail;
    return;
  }
  /* Een typefout in het nummer betekent dat deze lead NOOIT antwoord krijgt --
     het hele product levert via WhatsApp. Dat is geen schoonheidsfoutje maar
     een verloren klant, en de makelaar merkt het niet eens.
     Bewust ruim: cijfers, spaties, punten, streepjes, haakjes en een +
     mogen allemaal. Er wordt alleen gekeken of er genoeg CIJFERS overblijven
     om uberhaupt een nummer te kunnen zijn -- 8 tot 15, zoals de ITU-norm.
     Streng valideren op Belgische vormen zou buitenlandse leads weigeren, en
     die zijn juist waardevol. */
  var cijfers = phone.replace(/[^0-9]/g, '');
  if (cijfers.length < 8 || cijfers.length > 15) {
    err.textContent   = I18N.errPhone;
    document.getElementById('tel').focus();
    return;
  }

  if (consent && !consent.checked) {
    err.textContent   = I18N.errConsent;
    return;
  }

  btn.innerHTML  = I18N.loading;
  btn.disabled   = true;

  fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: name, phone: phone, bron: 'Advertentie', property: PAND, consent: !!(consent && consent.checked) })
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
