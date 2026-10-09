// Client-facing lead form page. Personalized per client (AI Name + Client Name)
// served from the Klanten / Client Config Airtable table.
//
// KNOWN SCOPE BOUNDARY (see api/_lang.js): the client's Language field now
// accepts any of the 40 registry languages (api/whatsapp.js's AI conversation
// speaks all of them), but the form-page UI text below (`i18n` object, ~20
// strings + niche hooks) is still hand-translated for nl/fr/en ONLY. A client
// configured with e.g. German still gets this Dutch-fallback form (see the
// `lang` variable below: only 'fr'/'en'/'de'/'nl' are recognized here,
// everything else stays 'nl') while their WhatsApp AI conversation correctly
// speaks German. Translating this file's full UI text to all 40 languages is
// a separate, larger effort intentionally out of scope for the conversation-
// language rollout — flagged here so it isn't mistaken for an oversight.

const _properties = require('./_properties');
const _vehicles   = require('./_vehicles');
const _vertical   = require('./_vertical');
const _errors = require('./_errors');   // gedeelde foutentaxonomie, buitenste vangnet
const _stijl  = require('./_form-stijl'); // vormgeving per klant (Form Style), gesaneerd
const _regio  = require('./_regio');      // land van de dealer: standaard landcode in het telefoonveld
const _bev    = require('./_form-bevestiging'); // het "wat gebeurt er nu"-paneel na versturen

module.exports = _errors.vangAf(async function handler(req, res) {
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
  /* De code wordt door BEIDE modules gevalideerd op dezelfde manier (letters,
     cijfers, punt, streepje), dus welke van de twee hem afkeurt maakt niet uit
     -- maar we weten hier nog niet welke vertical het is, want dat komt pas uit
     het klantrecord hieronder. Vandaar de losse controle. */
  if (!_properties.geldigeCode(pandCode)) pandCode = '';

  // ── Pull client config (best-effort; falls back to defaults on any error) ──
  let aiName       = 'Mathis';
  let clientName   = 'Helvaro';
  let niche        = '';
  /* Leeg leest als vastgoed; zie api/_vertical.js. Valt het klantrecord weg,
     dan gedraagt het formulier zich zoals het zich altijd gedroeg. */
  let vertical     = _vertical.VASTGOED;
  let aiPhotoUrl   = '';
  let brandColor   = '#8A6D3F'; // Helvaro default (warm bronze/sand family — deep enough for white text on solid fills). Overridden per-client by the Brand Color Airtable field.
  let formIntro    = '';
  let leadsThisWeek = 0;
  let lang          = 'nl';   // nl / fr / en. Controls form-page + AI conversation language
  let trustBadges   = '';     // custom 'a | b | c' string, overrides defaults
  let workingHours  = '';     // 'mon-fri 9-18' style; informational for the form-page
  let stijl         = _stijl.saneer({});   // vormgeving per klant; leeg = Helvaro-standaard (donker)
  let dealerLand   = _regio.standaard().land || 'BE';   // landcode die het telefoonveld voorselecteert
  let dealerRegio  = _regio.standaard();                // voor het publieke telefoonnummer (tel:-knop)
  let dealerSiteRuw = '';                               // Client Config "Website" -> knop "Terug naar de website"
  let dealerTelRuw  = '';                               // Client Config "Public Phone" -> knop "Bel ..." (bestaat nog niet overal)
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
          if (lg === 'fr' || lg === 'en' || lg === 'nl' || lg === 'de') lang = lg;
          trustBadges  = (rec.fields['fld4nzMbnQseuGhnN'] || rec.fields['Trust Badges'] || '').toString().trim();
          workingHours = (rec.fields['fldq5oIqw5MG8fKhc'] || rec.fields['Working Hours'] || '').toString().trim();
          stijl        = _stijl.saneer(rec.fields['Form Style'] || '');
          try { dealerRegio = _regio.lees(rec.fields); dealerLand = dealerRegio.land || dealerLand; } catch (_) { /* standaard blijft */ }
          dealerSiteRuw = (rec.fields['fldzBclLhryWQ1veO'] || rec.fields['Website'] || '').toString().trim();
          dealerTelRuw  = (rec.fields['Public Phone'] || '').toString().trim();
          /* In welke markt deze klant zit. Het formulier moet dat weten omdat
             de kaart bovenaan anders een pand zoekt bij een dealer -- en dan
             staat er niets, terwijl de link wel klopte. */
          vertical = _vertical.van(rec.fields);
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
  /* Lokale harness (scripts/faro-dev.js, demo-modus, geen echte Airtable): de
     daar opgeslagen stijl reist mee op het verzoek, zodat opslaan -> voorbeeld
     ook lokaal te zien is. Buiten de demo-modus doet deze regel niets. */
  if (process.env.FARO_DEMO_MODE === '1' && req.lokaleStijl) stijl = _stijl.saneer(req.lokaleStijl);

  /* ── Het pand, als de link er een noemt ────────────────────────────────────
     Dit is waarom deze pagina bestaat in de pandvorm: de bezoeker ziet meteen
     WELKE woning hij aanvraagt, en de lead die eruit komt draagt die code mee
     tot in het WhatsApp-gesprek. Zonder dit moest de AI raden welke van de
     vier panden bedoeld werd.

     Best-effort, net als alles hierboven: valt Airtable weg, dan is er geen
     pandblok en werkt het formulier gewoon. Een storing hoort een lead niet
     tegen te houden. */
  let pand = null;
  let voertuig = null;
  /* De link noemt een voertuig/pand dat WEL bestaat maar niet (meer) getoond
     mag worden (gearchiveerd of niet-publiek). De code gaat dan toch mee met de
     lead -- de dealer ziet welke auto er gevraagd werd -- en de bezoeker krijgt
     een neutrale melding in plaats van een stil, generiek formulier (L-10). */
  let pandNietBeschikbaar = false;
  if (pandCode && vertical === _vertical.DEALERSHIP) {
    /* Een dealer heeft geen panden. Zonder deze tak zoekt het formulier de code
       op in de verkeerde tabel, vindt niets, en toont geen kaart -- terwijl de
       link gewoon klopte. Dat is precies het soort stille fout dat er van
       buiten uitziet als "die link doet het niet". */
    try {
      voertuig = await _vehicles.getByCode(project, pandCode);
      if (voertuig && (!voertuig.publiek || voertuig.gearchiveerd)) { voertuig = null; pandNietBeschikbaar = true; }
    } catch (e) {
      console.warn('[form-page] voertuig ophalen mislukt:', e && e.message);
    }
  } else if (pandCode) {
    try {
      pand = await _properties.getByCode(project, pandCode);
      /* Niet-publiek betekent: wel in het CRM, niet naar buiten. Een makelaar
         die een pand voorbereidt hoort het niet al gedeeld te zien. */
      if (pand && (!pand.publiek || pand.gearchiveerd)) { pand = null; pandNietBeschikbaar = true; }
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

  /* ── Bevestiging na versturen: alleen echte gegevens worden een knop of kaart.
     Zie api/_form-bevestiging.js voor de regels. ───────────────────────────── */
  const bevTekst     = _bev.TEKST[lang] || _bev.TEKST.nl;
  const voertuigOk   = !!(voertuig && _vehicles.kanProefrit(voertuig.status));   // afspraak mogelijk -> voertuigflow
  const voertuigUrl  = voertuig ? _bev.veiligeUrl(voertuig.link) : '';
  const voertuigFoto = voertuig && Array.isArray(voertuig.fotos) ? _bev.veiligeFoto(voertuig.fotos[0]) : '';
  const siteUrl      = _bev.veiligeUrl(dealerSiteRuw);
  const dealerTel    = _bev.dealerTel(dealerTelRuw, dealerRegio, _regio.naarE164);
  /* Tekst met {dealer} invullen, HTML-veilig (eerst escapen, dan invullen). */
  const metDealer    = (tpl) => escHtml(tpl).split('{dealer}').join(safeClientName);

  /* Frans elideert 'de' voor een klinker: "d'Immo Liège", niet "de Immo Liège".

     Dat is geen muggenzifterij. Dit is de EERSTE zin die een Waalse lead van
     dit bedrijf leest, op de pagina waar hij besluit of hij zijn nummer
     achterlaat. Een ontbrekende elisie leest voor een Franstalige meteen als
     buitenlands -- precies het tegenovergestelde van wat dit scherm moet doen.

     Alleen voor klinkers, en met OPZET niet voor de h. Frans kent een h muet
     (d'Hôtel) en een h aspiré (de Hasselt), en welke van de twee het is valt
     niet uit de spelling af te leiden. Een regel die de helft van de tijd fout
     zit is erger dan geen regel: "de Hasselt" is correct, "d'Hasselt" valt op.

     Krulapostrof, want de rest van de Franse teksten hier gebruikt die ook. */
  function beginsMetKlinker(naam) {
    return /^[aeiouyàâäéèêëîïôöùûü]/i.test(String(naam || '').trim());
  }
  /* Voor de <title>: die gaat niet door escHtml. */
  function fransTitelVan(naam) {
    return beginsMetKlinker(naam) ? ' d\u2019' : ' de ';
  }
  /* Voor de bel: alleen in het Frans elideren, in de andere talen gewoon het
     voorzetsel uit de vertaaltabel. */
  function fransVan(voorvoegsel, naam) {
    if (lang !== 'fr') return escHtml(voorvoegsel) + ' ';
    return beginsMetKlinker(naam) ? 'd\u2019' : escHtml(voorvoegsel) + ' ';
  }


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
      labelCountry:    'Land van je nummer',
      placeholderName: 'Jouw naam',
      placeholderPhone:'478 12 34 56',
      btn:             'Stuur',
      btnSuffix:       'mijn gegevens',
      errMissing:      'Vul je naam en telefoonnummer in zodat',
      errMissingTail:  'contact kan opnemen.',
      errGeneric:      'Er ging iets mis. Probeer opnieuw.',
      srvErr: {
        rate_limited:     'Je stuurde net al iets. Probeer het over een minuutje opnieuw.',
        busy:             'Even druk hier. Probeer het over 30 seconden opnieuw.',
        create_failed:    'We konden je gegevens niet opslaan. Probeer het zo nog eens.',
        server_error:     'Er ging iets mis aan onze kant. Probeer het zo nog eens.',
        bad_project:      'Deze formulierlink klopt niet meer. Vraag de nieuwe link op.',
        name_required:    'Vul je naam in.',
        phone_required:   'Vul je telefoonnummer in.',
        consent_required: 'Vink even aan dat we je mogen contacteren.',
        contact_required: 'Vul je WhatsApp-nummer of je e-mailadres in.',
        bad_email:        'Dat e-mailadres klopt niet helemaal. Kijk het even na.',
        bad_phone:        'Dat telefoonnummer herkennen we niet. Gebruik alleen cijfers.',
        unknown_project: 'Deze formulierlink klopt niet (meer). Vraag de nieuwe link op.'
      },
      loading:         'Een momentje...',
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
      altMail:         'Liever geen WhatsApp? Laat je e-mailadres achter',
      labelEmail:      'Je e-mailadres',
      placeholderEmail:'naam@voorbeeld.be',
      errMail:         'Dat e-mailadres klopt niet helemaal. Kijk het even na.',
      errContact:      'Vul je WhatsApp-nummer of je e-mailadres in.',
      consentMidMail:  'mij via WhatsApp of e-mail contacteert. Zie het',
      wegVoertuig:     'Dit voertuig is {status}. Laat gerust je gegevens achter — {ai} laat je weten wat er nog wél in de voorraad staat.',
      wegWoning:       'Deze woning is {status}. Laat gerust je gegevens achter — {ai} laat je weten wat er nog wél beschikbaar is.',
      nietMeerBeschikbaar: 'Dit aanbod is niet meer beschikbaar. Laat gerust je gegevens achter — {ai} laat je weten wat we nu hebben.',
      statusNamen:     { 'gereserveerd': 'gereserveerd', 'verkocht': 'verkocht', 'uit aanbod': 'uit aanbod', 'onder bod': 'onder bod', 'verhuurd': 'verhuurd', 'onbekend': 'onbekend' },
      nicheHooks: {
        dentist:     'Ik help je graag bij je vragen over je gebit of een behandeling.',
        real_estate: 'Ik help je graag verder, of je nu een woning zoekt of er één wil verkopen.',
        lawyer:      'Ik help je graag verder met juridisch advies of een dossier.',
        finance:     'Ik help je graag met je financiële vraag.',
        default:     'Ik help je graag verder. Laat hieronder je gegevens achter en je hoort meteen van me.'
      }
    },
    fr: {
      title:           safeFirstName + fransTitelVan(safeClientName) + safeClientName + ' · Contact',
      meta:            safeFirstName + ' répond en 1 minute via WhatsApp.',
      status:          '● En ligne. Réponse en 1 min',
      intro:           'Bonjour, je suis',
      introMid:        'de',
      typing:          'écrit',
      labelName:       'Comment puis-je vous appeler ?',
      labelPhone:      'Votre numéro WhatsApp',
      labelCountry:    'Pays de votre numéro',
      placeholderName: 'Votre nom',
      placeholderPhone:'478 12 34 56',
      btn:             'Envoyer mes coordonnées à',
      btnSuffix:       '',
      errMissing:      'Saisissez votre nom et votre numéro pour que',
      errMissingTail:  'puisse vous contacter.',
      errGeneric:      "Une erreur s'est produite. Réessayez.",
      srvErr: {
        rate_limited:     'Vous venez déjà d’envoyer quelque chose. Réessayez dans une minute.',
        busy:             'Un peu de monde en ce moment. Réessayez dans 30 secondes.',
        create_failed:    'Nous n’avons pas pu enregistrer vos données. Réessayez dans un instant.',
        server_error:     'Un problème est survenu de notre côté. Réessayez dans un instant.',
        bad_project:      'Ce lien de formulaire n’est plus valable. Demandez le nouveau lien.',
        name_required:    'Indiquez votre nom.',
        phone_required:   'Indiquez votre numéro de téléphone.',
        consent_required: 'Cochez la case pour nous autoriser à vous contacter.',
        contact_required: 'Indiquez votre numéro WhatsApp ou votre adresse e-mail.',
        bad_email:        'Cette adresse e-mail ne semble pas correcte. Vérifiez-la.',
        bad_phone:        'Nous ne reconnaissons pas ce numéro. N’utilisez que des chiffres.',
        unknown_project: 'Ce lien de formulaire n’est pas (ou plus) valable. Demandez le nouveau lien.'
      },
      loading:         'Un instant...',
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
      altMail:         'Pas de WhatsApp ? Laissez votre adresse e-mail',
      labelEmail:      'Votre adresse e-mail',
      placeholderEmail:'nom@exemple.be',
      errMail:         'Cette adresse e-mail ne semble pas correcte. Vérifiez-la.',
      errContact:      'Indiquez votre numéro WhatsApp ou votre adresse e-mail.',
      consentMidMail:  'me contacte via WhatsApp ou par e-mail. Voir la',
      wegVoertuig:     'Ce véhicule est {status}. Laissez vos coordonnées — {ai} vous dira ce qu’il y a encore en stock.',
      wegWoning:       'Ce bien est {status}. Laissez vos coordonnées — {ai} vous dira ce qui est encore disponible.',
      nietMeerBeschikbaar: 'Cette offre n’est plus disponible. Laissez vos coordonnées — {ai} vous dira ce que nous avons actuellement.',
      statusNamen:     { 'gereserveerd': 'réservé', 'verkocht': 'vendu', 'uit aanbod': 'retiré de l’offre', 'onder bod': 'sous offre', 'verhuurd': 'loué', 'onbekend': 'indisponible' },
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
      labelCountry:    'Country of your number',
      placeholderName: 'Your name',
      placeholderPhone:'478 12 34 56',
      btn:             'Send my details to',
      btnSuffix:       '',
      errMissing:      'Please fill in your name and phone number so',
      errMissingTail:  'can reach you.',
      errGeneric:      'Something went wrong. Please try again.',
      srvErr: {
        rate_limited:     'You just sent something. Try again in a minute.',
        busy:             'A bit busy right now. Try again in 30 seconds.',
        create_failed:    'We could not save your details. Try again in a moment.',
        server_error:     'Something went wrong on our side. Try again in a moment.',
        bad_project:      'This form link is no longer valid. Ask for the new link.',
        name_required:    'Enter your name.',
        phone_required:   'Enter your phone number.',
        consent_required: 'Please tick the box so we may contact you.',
        contact_required: 'Enter your WhatsApp number or your email address.',
        bad_email:        'That email address does not look right. Please check it.',
        bad_phone:        'We do not recognise that phone number. Use digits only.',
        unknown_project: 'This form link is not (or no longer) valid. Ask for the new link.'
      },
      loading:         'One moment...',
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
      altMail:         'No WhatsApp? Leave your email address instead',
      labelEmail:      'Your email address',
      placeholderEmail:'name@example.com',
      errMail:         'That email address does not look right. Please check it.',
      errContact:      'Enter your WhatsApp number or your email address.',
      consentMidMail:  'may contact me via WhatsApp or email. See the',
      wegVoertuig:     'This vehicle is {status}. Feel free to leave your details — {ai} will tell you what is still in stock.',
      wegWoning:       'This property is {status}. Feel free to leave your details — {ai} will tell you what is still available.',
      nietMeerBeschikbaar: 'This listing is no longer available. Feel free to leave your details — {ai} will tell you what we have right now.',
      statusNamen:     { 'gereserveerd': 'reserved', 'verkocht': 'sold', 'uit aanbod': 'no longer listed', 'onder bod': 'under offer', 'verhuurd': 'let', 'onbekend': 'unavailable' },
      nicheHooks: {
        dentist:     'I’m happy to help you with any dental questions or treatments.',
        real_estate: 'I’m happy to help, whether you’re looking to buy or sell a property.',
        lawyer:      'I’m happy to help you with legal advice or a case.',
        finance:     'I’m happy to help with your financial question.',
        default:     'I’m happy to help. Drop your details below and you’ll hear from me right away.'
      }
    },
    de: {
      title:           safeFirstName + ' von ' + safeClientName + ' · Kontakt',
      meta:            safeFirstName + ' antwortet innerhalb von 1 Minute über WhatsApp.',
      status:          '● Online. Antwortet in 1 Min.',
      intro:           'Hallo, ich bin',
      introMid:        'von',
      typing:          'schreibt',
      labelName:       'Wie darf ich Sie nennen?',
      labelPhone:      'Ihre WhatsApp-Nummer',
      labelCountry:    'Land Ihrer Nummer',
      placeholderName: 'Ihr Name',
      placeholderPhone:'478 12 34 56',
      btn:             'Meine Daten senden an',
      btnSuffix:       '',
      errMissing:      'Bitte geben Sie Ihren Namen und Ihre Telefonnummer an, damit',
      errMissingTail:  'Sie erreichen kann.',
      errGeneric:      'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
      srvErr: {
        rate_limited:     'Sie haben gerade schon etwas gesendet. Versuchen Sie es in einer Minute erneut.',
        busy:             'Gerade viel los. Versuchen Sie es in 30 Sekunden erneut.',
        create_failed:    'Wir konnten Ihre Daten nicht speichern. Versuchen Sie es gleich noch einmal.',
        server_error:     'Bei uns ist etwas schiefgelaufen. Versuchen Sie es gleich noch einmal.',
        bad_project:      'Dieser Formularlink ist nicht mehr gültig. Fragen Sie nach dem neuen Link.',
        unknown_project:  'Dieser Formularlink ist nicht (mehr) gültig. Fragen Sie nach dem neuen Link.',
        name_required:    'Bitte geben Sie Ihren Namen an.',
        phone_required:   'Bitte geben Sie Ihre Telefonnummer an.',
        consent_required: 'Bitte setzen Sie den Haken, damit wir Sie kontaktieren dürfen.',
        contact_required: 'Geben Sie Ihre WhatsApp-Nummer oder Ihre E-Mail-Adresse an.',
        bad_email:        'Diese E-Mail-Adresse scheint nicht zu stimmen. Bitte prüfen Sie sie.',
        bad_phone:        'Diese Telefonnummer erkennen wir nicht. Bitte nur Ziffern verwenden.'
      },
      loading:         'Einen Moment...',
      trust1:          'Nie Spam',
      trust2:          'Antwort in 1 Min.',
      trust3:          'Unverbindlich',
      poweredBy:       'Powered by',
      socialPre:       'Personen haben',
      socialPost:      'diese Woche um Rat gefragt',
      consentPre:      'Ich bin damit einverstanden, dass',
      consentMid:      'mich über WhatsApp kontaktiert. Siehe die',
      consentLink:     'Datenschutzerklärung',
      consentSuffix:   '.',
      errConsent:      'Setzen Sie den Datenschutz-Haken, um fortzufahren.',
      errPhone:        'Das scheint keine gültige Telefonnummer zu sein. Bitte prüfen Sie sie — die Antwort kommt über WhatsApp.',
      altMail:         'Lieber kein WhatsApp? Hinterlassen Sie Ihre E-Mail-Adresse',
      labelEmail:      'Ihre E-Mail-Adresse',
      placeholderEmail:'name@beispiel.de',
      errMail:         'Diese E-Mail-Adresse scheint nicht zu stimmen. Bitte prüfen Sie sie.',
      errContact:      'Geben Sie Ihre WhatsApp-Nummer oder Ihre E-Mail-Adresse an.',
      consentMidMail:  'mich über WhatsApp oder E-Mail kontaktiert. Siehe die',
      wegVoertuig:     'Dieses Fahrzeug ist {status}. Hinterlassen Sie gerne Ihre Daten — {ai} sagt Ihnen, was noch im Bestand ist.',
      wegWoning:       'Diese Immobilie ist {status}. Hinterlassen Sie gerne Ihre Daten — {ai} sagt Ihnen, was noch verfügbar ist.',
      nietMeerBeschikbaar: 'Dieses Angebot ist nicht mehr verfügbar. Hinterlassen Sie gerne Ihre Daten — {ai} sagt Ihnen, was wir aktuell haben.',
      statusNamen:     { 'gereserveerd': 'reserviert', 'verkocht': 'verkauft', 'uit aanbod': 'nicht mehr im Angebot', 'onder bod': 'in Verhandlung', 'verhuurd': 'vermietet', 'onbekend': 'nicht verfügbar' },
      nicheHooks: {
        dentist:     'Ich helfe Ihnen gerne bei Fragen zu Ihren Zähnen oder einer Behandlung.',
        real_estate: 'Ich helfe Ihnen gerne weiter, ob Sie eine Immobilie suchen oder verkaufen möchten.',
        lawyer:      'Ich helfe Ihnen gerne bei Rechtsfragen oder einem Fall.',
        finance:     'Ich helfe Ihnen gerne bei Ihrer Finanzfrage.',
        default:     'Ich helfe Ihnen gerne weiter. Hinterlassen Sie unten Ihre Daten und Sie hören sofort von mir.'
      }
    }
  };
  const t = i18n[lang] || i18n.nl;

  /* Tekst met {status} en {ai} invullen, HTML-veilig. De status komt uit de
     data (Nederlandse sleutel) en wordt per taal vertaald (audit L-17: dit
     stond hard in het Nederlands op elke taalversie). */
  const vulIn = (tpl, status) => escHtml(tpl)
    .replace('{status}', escHtml((t.statusNamen && t.statusNamen[status]) || status || ''))
    .replace('{ai}', safeFirstName);

  /* Landcodes voor het telefoonveld. Het land van de dealer staat voorgeselecteerd;
     een buitenlandse koper kiest zijn eigen land en tikt zijn nummer zoals hij
     het kent. Wie toch +.. of 00.. intikt, krijgt precies dat nummer. */
  const LANDCODES = [['BE','32'],['NL','31'],['FR','33'],['DE','49'],['LU','352'],['GB','44'],['ES','34'],['IT','39'],['PT','351'],['AT','43'],['CH','41'],['IE','353'],
    ['PL','48'],['RO','40'],['BG','359'],['GR','30'],['HR','385'],['CZ','420'],['SK','421'],['HU','36'],['SI','386'],['DK','45'],['SE','46'],['NO','47'],['FI','358'],
    ['EE','372'],['LV','371'],['LT','370'],['UA','380'],['TR','90'],['MA','212'],['DZ','213'],['TN','216'],['EG','20'],['AE','971'],['SA','966'],['IN','91'],['CN','86'],
    ['US','1'],['CA','1'],['BR','55'],['AU','61'],['ZA','27'],['NG','234'],['AL','355'],['RS','381'],['BA','387'],['MK','389'],['XK','383']];
  let landNamen = null;
  try { landNamen = new Intl.DisplayNames([lang], { type: 'region' }); } catch (_) { landNamen = null; }
  const vlag = (cc) => String.fromCodePoint(...cc.split('').map((c) => 0x1F1E6 + c.charCodeAt(0) - 65));
  const naamLand = (cc) => { try { return (landNamen && landNamen.of(cc)) || cc; } catch (_) { return cc; } };
  const eerst = LANDCODES.find((x) => x[0] === dealerLand) ? dealerLand : 'BE';
  const gesorteerd = LANDCODES.slice().sort((a, b) => (a[0] === eerst ? -1 : b[0] === eerst ? 1 : naamLand(a[0]).localeCompare(naamLand(b[0]), lang)));
  /* Landen zonder nationale 0: daar hoort een 0 vooraan bij het nummer zelf
     (bv. Italiaanse vaste lijnen +39 06...) en mag hij er niet af. */
  const ZONDER_NUL = ['IT', 'ES', 'PT', 'LU', 'GR', 'DK', 'NO', 'EE', 'LV', 'CZ', 'US', 'CA'];
  const eersteBel = (LANDCODES.find((x) => x[0] === eerst) || ['BE', '32'])[1];
  const eersteVlag = vlag(eerst);
  const landOpties = gesorteerd.map(([cc, bel]) =>
    '<option value="' + bel + '" data-land="' + cc + '"' + (ZONDER_NUL.indexOf(cc) !== -1 ? ' data-houd-nul="1"' : '') + (cc === eerst ? ' selected' : '') + '>' + vlag(cc) + ' ' + escHtml(naamLand(cc)) + ' (+' + bel + ')</option>').join('');

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
  ${_stijl.css(stijl, brandColor)}
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--letter);
    background: var(--grond);
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    padding: 24px 16px;
    color: var(--tekst);
  }
  /* Eigen achtergrondafbeelding van de klant: gedimd met de grondkleur,
     zodat de kaart erop leesbaar blijft. */
  body.met-achtergrond {
    background-image: linear-gradient(color-mix(in srgb, var(--grond) 78%, transparent), color-mix(in srgb, var(--grond) 78%, transparent)), var(--achtergrond);
    background-size: cover; background-position: center; background-attachment: fixed;
  }
  .card {
    background: var(--vlak); border: 1px solid var(--lijn);
    border-radius: var(--hoek-kaart);
    width: 100%; max-width: 460px;
    overflow: hidden;
  }
  /* Layout 'vol': geen kaart, het formulier staat direct op de pagina. */
  body.layout-vol { align-items: flex-start; padding-top: 40px; }
  body.layout-vol .card { background: transparent; border: none; max-width: 520px; }
  body.layout-vol .chat-hdr { background: transparent; border-bottom: none; padding-left: 0; padding-right: 0; }
  body.layout-vol .chat-area, body.layout-vol .form-area, body.layout-vol .trust { padding-left: 0; padding-right: 0; }
  body.layout-vol .chat-area { background: transparent; }
  .logo { display: block; max-height: 40px; max-width: 180px; object-fit: contain; margin-bottom: 14px; }
  .voet { text-align: center; font-size: 12px; color: var(--mut); padding: 0 22px 10px; line-height: 1.5; }

  /* WhatsApp-style chat header */
  .chat-hdr {
    background: var(--vlak-2);
    padding: 18px 22px;
    display: flex; align-items: center; gap: 14px;
    border-bottom: 1px solid var(--lijn);
  }
  .avatar {
    width: 48px; height: 48px; border-radius: 50%;
    background: linear-gradient(135deg, var(--brand), var(--brand-dark));
    display: flex; align-items: center; justify-content: center;
    color: var(--on-brand); font-weight: 700; font-size: 19px;
    flex-shrink: 0; position: relative; overflow: visible;
  }
  .avatar img {
    width: 48px; height: 48px; border-radius: 50%;
    object-fit: cover; display: block;
  }
  .online-dot {
    position: absolute; right: 0; bottom: 1px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--ok); border: 2px solid var(--vlak-2);
    box-shadow: 0 0 6px rgba(34,197,94,.7);
    animation: dotPulse 1.6s ease-in-out infinite;
  }
  @keyframes dotPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
  .hdr-text { flex: 1; min-width: 0; }
  .hdr-name { font-size: 15px; font-weight: 700; color: var(--tekst); }

/* De pandkaart. Kleuren komen van de merkkleur van de klant, net als de rest
   van deze pagina, zodat hij er niet uitziet als een advertentie van iemand
   anders. */
.pand-card {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--vlak-2);
  border: 1px solid var(--lijn);
}
.pand-card-foto {
  display: block;
  width: 100%;
  height: 132px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 10px;
  background: var(--vlak-2);
}
.pand-card-adres { font-size: 14px; font-weight: 700; color: var(--tekst); line-height: 1.35; }
.pand-card-plaats { font-size: 12px; color: var(--mut); margin-top: 2px; }
.pand-card-feiten {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px;
}
.pand-card-feit {
  font-size: 11.5px; font-weight: 600; letter-spacing: 0.01em;
  padding: 3px 8px; border-radius: 999px;
  background: var(--brand-faint); color: var(--tekst);
}
.pand-card-prijs { background: var(--brand-soft); color: var(--tekst); }
/* Verkocht of onder bod krijgt zijn eigen vlak. Iemand die het formulier
   invult voor een woning die weg is, hoort dat HIER te lezen en niet pas van
   de AI. */
.pand-card-weg {
  margin-top: 9px; padding: 7px 10px; border-radius: 8px;
  background: rgba(220,120,90,0.16); border: 1px solid rgba(220,120,90,0.32);
  font-size: 12px; line-height: 1.45; color: #FFD9C9;
}
  .hdr-status { font-size: 12px; color: var(--ok); font-weight: 600; }
  .hdr-brand { font-size: 11px; color: var(--mut); margin-top: 2px; }

  /* Chat-style intro bubble */
  .chat-area {
    padding: 22px 22px 8px;
    background: var(--vlak);
  }
  .bubble {
    background: var(--brand-soft); border: 1px solid var(--brand-soft);
    border-bottom-left-radius: 4px; border-radius: 14px;
    padding: 12px 14px; font-size: 14px; line-height: 1.5;
    color: var(--tekst); max-width: 88%; margin-bottom: 6px;
    animation: bubbleIn .35s ease;
  }
  @keyframes bubbleIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .bubble-meta {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--mut); margin-bottom: 14px; padding-left: 4px;
  }
  .typing-dots { display: inline-flex; gap: 3px; align-items: center; margin-left: 2px; }
  .typing-dots span {
    width: 4px; height: 4px; border-radius: 50%;
    background: var(--mut);
    animation: typingDot 1.2s infinite ease-in-out;
  }
  .typing-dots span:nth-child(2) { animation-delay: .15s; }
  .typing-dots span:nth-child(3) { animation-delay: .30s; }
  @keyframes typingDot {
    0%, 60%, 100% { transform: scale(.7); opacity: .3; }
    30%           { transform: scale(1);  opacity: 1; }
  }
  .bubble strong { color: var(--tekst); font-weight: 600; }

  .social-proof {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.18);
    color: var(--mut); padding: 6px 11px; border-radius: 999px;
    font-size: 11px; font-weight: 500;
    margin-bottom: 14px;
  }
  .social-proof .dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--ok);
  }
  .social-proof b { color: var(--ok); font-weight: 700; }

  /* Form */
  .form-area { padding: 6px 22px 24px; }
  label {
    display: block; font-size: 11px; font-weight: 700;
    color: var(--mut); letter-spacing: .08em; text-transform: uppercase;
    margin-bottom: 7px; margin-top: 14px;
  }
  input {
    width: 100%; background: var(--vlak-2);
    border: 1px solid var(--lijn); border-radius: var(--hoek-veld);
    padding: 13px 15px; color: var(--tekst); font-size: 15px;
    font-family: inherit; outline: none;
    transition: border-color .15s, box-shadow .15s;
  }
  input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-faint); }
  /* Telefoon: een veld met de vlag en een pijltje links (de landkeuze), de
     landcode als vaste prefix en dan het nummer. De echte <select> ligt
     onzichtbaar over de vlag: toetsenbord en schermlezer werken gewoon. */
  .tel-veld {
    display: flex; align-items: center; width: 100%;
    background: var(--vlak-2); border: 1px solid var(--lijn); border-radius: var(--hoek-veld);
    transition: border-color .15s, box-shadow .15s;
  }
  .tel-veld:focus-within { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-faint); }
  .tel-land-knop {
    position: relative; display: flex; align-items: center; gap: 6px; flex: 0 0 auto;
    padding: 0 10px 0 14px; align-self: stretch; color: var(--mut);
    border-right: 1px solid var(--lijn); cursor: pointer;
  }
  .tel-vlag { font-size: 20px; line-height: 1; }
  .tel-land-knop select {
    position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;
    font-size: 16px; border: 0;
  }
  .tel-prefix { padding-left: 12px; color: var(--tekst); font-size: 15px; white-space: nowrap; }
  .tel-prefix[hidden] { display: none; }
  .tel-veld input {
    flex: 1 1 auto; min-width: 0; border: 0; background: transparent; box-shadow: none;
    padding-left: 8px;
  }
  .tel-veld input:focus { box-shadow: none; border: 0; }
  /* #666666 gaf 2,74:1 op deze invulvelden -- ruim onder de 4,5:1 die je nodig
     hebt om vlot te lezen. En juist hier staat het voorbeeld van het formaat
     ("0478 12 34 56"), dus de aanwijzing die iemand nodig heeft om zijn nummer
     goed in te tikken was de slechtst leesbare tekst van het scherm.
     #909090 haalt 4,92:1 en blijft duidelijk lichter dan de ingevulde tekst. */
  input::placeholder { color: var(--placeholder); }

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
    background: var(--brand);
    color: var(--on-brand); border: none; border-radius: var(--hoek-knop);
    padding: 14px; font-weight: 700; font-size: 15px;
    font-family: inherit; cursor: pointer; letter-spacing: .2px;
    transition: opacity .15s, box-shadow .2s;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  }
  button:hover:not(:disabled) { background: var(--brand-dark); }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .btn-icon { display: inline-flex; }

  /* De foutmelding is een live region (role="alert" staat op het element zelf).
     Daarom wordt hij getoond op INHOUD en niet met een inline display-stijl:
     een schermlezer kondigt een alert aan op het moment dat er tekst in komt,
     en met :empty valt tonen en aankondigen op hetzelfde moment. Zet je in
     plaats daarvan style.display, dan kan de tekst er al staan voordat het vak
     zichtbaar is en wordt er niets voorgelezen. */
  .error {
    color: var(--fout); font-size: 13px;
    margin-top: 14px; padding: 10px 14px;
    background: rgba(220,38,38,.08); border: 1px solid rgba(220,38,38,.22);
    border-radius: 9px;
  }
  .error:empty { display: none; }

  /* ── Bevestiging: "wat gebeurt er nu" ──────────────────────────────────────
     Alle kleuren uit de tenant-tokens. Tekst staat op --vlak in --tekst of
     --mut (die twee worden bewaakt in api/_form-stijl.js); gevulde vlakken zijn
     --brand met --on-brand. De merkkleur zelf wordt NOOIT als tekstkleur
     gebruikt: een lichte of donkere tenantkleur zou dan onleesbaar worden.
     Status is nooit alleen kleur: elk punt heeft een icoon en een woord. */
  .vh { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
  .card.bevestigd .hdr-status, .card.bevestigd .trust { display: none; }
  .bev { padding: 26px 22px 30px; animation: bevIn .28s ease-out both; }
  .bev[hidden] { display: none; }
  @keyframes bevIn { from { opacity: 0; } to { opacity: 1; } }
  .bev-kop { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
  .bev-vink {
    width: 44px; height: 44px; border-radius: 50%; margin-bottom: 10px;
    display: grid; place-items: center; background: var(--brand); color: var(--on-brand);
  }
  .bev-titel { font-size: 22px; line-height: 1.25; font-weight: 650; letter-spacing: -.01em; color: var(--tekst); overflow-wrap: anywhere; }
  .bev-titel:focus { outline: none; }
  .bev-titel:focus-visible { outline: 2px solid var(--tekst); outline-offset: 4px; border-radius: 4px; }
  .bev-sub { font-size: 14.5px; line-height: 1.55; color: var(--mut); }

  .bev-auto {
    display: flex; align-items: center; gap: 14px; margin-top: 22px; padding: 12px;
    border: 1px solid var(--lijn); border-radius: min(var(--hoek-veld), 16px); background: var(--vlak-2);
  }
  .bev-auto-foto { flex: none; width: 96px; height: 72px; object-fit: cover; border-radius: min(var(--hoek-veld), 10px); background: var(--vlak); }
  .bev-auto-tekst { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .bev-auto-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--mut); }
  .bev-auto-titel {
    font-size: 15px; line-height: 1.35; font-weight: 650; color: var(--tekst); overflow-wrap: anywhere;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .bev-auto-prijs { font-size: 14px; color: var(--tekst); font-variant-numeric: tabular-nums; }

  .bev-stappen { list-style: none; margin: 28px 0 0; padding: 0; display: flex; flex-direction: column; }
  .bev-stap { position: relative; display: flex; gap: 14px; padding-bottom: 22px; }
  .bev-stap:last-child { padding-bottom: 0; }
  .bev-stap::before { content: ""; position: absolute; left: 13px; top: 32px; bottom: 4px; width: 2px; background: var(--lijn); }
  .bev-stap.is-klaar::before { background: var(--brand); }
  .bev-stap:last-child::before { display: none; }
  .bev-punt {
    position: relative; z-index: 1; flex: none; width: 28px; height: 28px; border-radius: 50%;
    display: grid; place-items: center; font-size: 12px; font-weight: 700; line-height: 1; background: var(--vlak);
  }
  .is-klaar .bev-punt { background: var(--brand); color: var(--on-brand); }
  .is-open .bev-punt { border: 2px solid var(--mut); color: var(--mut); }
  .bev-stap-inhoud { min-width: 0; padding-top: 3px; }
  .bev-stap-titel { display: block; font-size: 15px; font-weight: 650; line-height: 1.3; color: var(--tekst); }
  .bev-stap-status {
    display: inline-flex; align-items: center; gap: 5px; margin-top: 6px; padding: 2px 9px 2px 7px;
    border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase;
  }
  .is-klaar .bev-stap-status { background: color-mix(in srgb, var(--brand) 16%, var(--vlak)); color: var(--tekst); }
  .is-open .bev-stap-status { border: 1px solid var(--mut); color: var(--mut); }
  .bev-stap-t { margin-top: 8px; font-size: 13.5px; line-height: 1.5; color: var(--mut); overflow-wrap: anywhere; }

  .bev-acties { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-top: 30px; }
  .bev-cta {
    display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
    min-height: 46px; padding: 10px 20px; border-radius: var(--hoek-knop);
    font: inherit; font-size: 15px; font-weight: 650; text-align: center; text-decoration: none;
    transition: opacity .15s;
  }
  .bev-cta:hover { opacity: .92; }
  .bev-cta-hoofd { background: var(--brand); color: var(--on-brand); border: 1.5px solid var(--brand); }
  .bev-cta-tweede { background: transparent; color: var(--tekst); border: 1.5px solid var(--mut); }
  .bev-cta-nr { font-size: 12px; font-weight: 500; color: var(--mut); }
  .bev-cta-hoofd .bev-cta-nr { color: inherit; }
  .bev-link { display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px; color: var(--tekst); font-size: 14px; text-decoration: underline; text-underline-offset: 3px; }
  .bev-cta:focus-visible, .bev-link:focus-visible { outline: 2px solid var(--tekst); outline-offset: 3px; }
  .bev-minimaal { padding: 28px 22px; font-size: 16px; line-height: 1.5; font-weight: 600; color: var(--tekst); }
  .bev-minimaal:focus { outline: none; }

  /* Brede schermen: horizontale tracker, en de kaart mag ruimer worden. */
  @media (min-width: 720px) {
    body.is-bevestigd .card, body.is-bevestigd.layout-vol .card { max-width: 680px; }
    .bev { padding: 32px 32px 34px; }
    .bev-stappen { flex-direction: row; gap: 18px; margin-top: 32px; }
    .bev-stap { flex: 1 1 0; min-width: 0; flex-direction: column; gap: 12px; padding-bottom: 0; }
    .bev-stap::before { left: 36px; right: -18px; top: 13px; bottom: auto; width: auto; height: 2px; }
    .bev-stap-inhoud { padding-top: 0; }
    .bev-stap-titel { min-height: 2.6em; }
  }
  @media (max-width: 560px) {
    .bev-acties { flex-direction: column; align-items: stretch; }
    .bev-link { justify-content: center; }
    .bev-auto-foto { width: 84px; height: 64px; }
  }
  /* Beweging is een zachte fade en verdwijnt bij wie dat wil. */
  @media (prefers-reduced-motion: reduce) {
    .bev { animation: none; }
    .spin { animation: none; }
  }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: draai .8s linear infinite; }
  @keyframes draai { to { transform: rotate(360deg); } }

  /* "Liever geen WhatsApp?" -- een tekstlink, geen knop die met Stuur
     concurreert. */
  .alt-mail {
    display: block; background: none; border: 0; padding: 4px 0 0; margin: 0 0 2px;
    font: inherit; font-size: 12px; color: var(--brand); text-decoration: underline;
    cursor: pointer; text-align: left;
  }
  .alt-mail[hidden] { display: none; }

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
    font-size: 12px; line-height: 1.5; color: var(--mut);
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
    color: var(--mut); font-size: 11px;
  }
  .trust-item span { font-size: 13px; }
  .powered {
    text-align: center; font-size: 10px; color: var(--mut);
    padding: 6px 0 14px; letter-spacing: .03em;
  }
  .powered a { color: var(--mut); text-decoration: none; }

  @media (max-width: 480px) {
    body { padding: 12px 10px; align-items: flex-start; }
    .card { border-radius: calc(var(--hoek-kaart) * 0.8); }
    .chat-hdr, .chat-area, .form-area { padding-left: 18px; padding-right: 18px; }
  }
/* Honeypot (L-18): buiten beeld, niet display:none -- sommige bots slaan
   verborgen velden over. Een mens ziet en vult dit nooit. */
.hp { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
</style>
</head>
<body class="${stijl.layout === 'vol' ? 'layout-vol' : ''}${stijl.achtergrond ? ' met-achtergrond' : ''}"${stijl.achtergrond ? ` style="--achtergrond:url('${escHtml(stijl.achtergrond)}')"` : ''}>
<div class="card" id="card">
  <div class="vh" id="ok-live" role="status" aria-live="polite" aria-atomic="true"></div>

  <!-- WhatsApp-style header with the AI persona -->
  <div class="chat-hdr" style="${stijl.logoUrl ? 'flex-wrap:wrap' : ''}">
    ${stijl.logoUrl ? `<img class="logo" src="${escHtml(stijl.logoUrl)}" alt="${safeClientName}" style="flex-basis:100%;margin-bottom:${stijl.avatarWeg ? '4px' : '14px'}" onerror="this.remove()">` : ''}
    ${stijl.avatarWeg && stijl.logoUrl ? '' : `<div class="avatar">
      ${aiPhotoUrl
        ? `<img src="${escHtml(aiPhotoUrl)}" alt="${safeAiName}" onerror="this.style.display='none';this.parentNode.insertAdjacentText('afterbegin','${escJs(initial)}')">`
        : escHtml(initial)
      }
      <span class="online-dot" title="${safeFirstName} is online"></span>
    </div>`}
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
    ${voertuig ? `<div class="pand-card">
      ${voertuig.fotos[0] ? `<img class="pand-card-foto" src="${escHtml(voertuig.fotos[0])}" alt="${escHtml(_vehicles.naam(voertuig))}" onerror="this.style.display='none'">` : ''}
      <div class="pand-card-adres">${escHtml(_vehicles.naam(voertuig))}</div>
      ${voertuig.kleur || voertuig.carrosserie ? `<div class="pand-card-plaats">${escHtml([voertuig.carrosserie, voertuig.kleur].filter(Boolean).join(' \u00B7 '))}</div>` : ''}
      <div class="pand-card-feiten">
        ${_vehicles.prijsTekst(voertuig.prijs) ? `<span class="pand-card-feit pand-card-prijs">${escHtml(_vehicles.prijsTekst(voertuig.prijs))}</span>` : ''}
        ${_vehicles.kmTekst(voertuig.km) ? `<span class="pand-card-feit">${escHtml(_vehicles.kmTekst(voertuig.km))}</span>` : ''}
        ${voertuig.inschrijving ? `<span class="pand-card-feit">${escHtml(voertuig.inschrijving)}</span>` : ''}
        ${voertuig.pk ? `<span class="pand-card-feit">${voertuig.pk} pk</span>` : ''}
        ${voertuig.brandstof ? `<span class="pand-card-feit">${escHtml(voertuig.brandstof)}</span>` : ''}
      </div>
      ${!_vehicles.kanProefrit(voertuig.status)
        ? `<div class="pand-card-weg">${vulIn(t.wegVoertuig, voertuig.status)}</div>`
        : ''}
    </div>` : ''}
    ${pandNietBeschikbaar ? `<div class="pand-card"><div class="pand-card-weg">${vulIn(t.nietMeerBeschikbaar, '')}</div></div>` : ''}
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
        ? `<div class="pand-card-weg">${vulIn(t.wegWoning, pand.status)}</div>`
        : ''}
    </div>` : ''}
    <div class="bubble">
      ${stijl.kop
        ? escHtml(stijl.kop)
        /* fransVan i.p.v. escHtml(t.introMid): Frans elideert 'de' voor een
           klinker. Alleen in deze tak -- een eigen kop van de klant blijft
           staan zoals hij hem schreef. */
        : `${escHtml(t.intro)} <strong>${safeFirstName}</strong> ${fransVan(t.introMid, clientName)}<strong>${safeClientName}</strong>.`}<br>
      ${escHtml(introText)}
    </div>
    <div class="bubble-meta">
      ${safeFirstName} ${escHtml(t.typing)}
      <span class="typing-dots"><span></span><span></span><span></span></span>
    </div>
  </div>

  <!-- Form (default visible) -->
  <div class="form-area" id="form">
    <div class="hp" aria-hidden="true"><label for="hp-url">Website</label><input id="hp-url" type="text" name="website_url" tabindex="-1" autocomplete="off" value=""></div>
    <label for="naam">${escHtml(t.labelName)}</label>
    <input id="naam" type="text" placeholder="${escHtml(t.placeholderName)}" autocomplete="name" required>

    <label for="tel">${escHtml(t.labelPhone)}</label>
    <div class="tel-veld">
      <span class="tel-land-knop">
        <span class="tel-vlag" id="tel-vlag" aria-hidden="true">${eersteVlag}</span>
        <svg class="tel-pijl" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        <select id="tel-land" aria-label="${escHtml(t.labelCountry)}" autocomplete="tel-country-code">${landOpties}</select>
      </span>
      <span class="tel-prefix" id="tel-prefix" aria-hidden="true">+${eersteBel}</span>
      <input id="tel" type="tel" placeholder="${escHtml(t.placeholderPhone)}" autocomplete="tel-national" inputmode="tel" required>
    </div>

    <!-- E-mail is een uitwijk, geen tweede verplicht veld: WhatsApp blijft de
         snelle weg. Wie geen WhatsApp wil, klikt en krijgt het veld. -->
    <button type="button" class="alt-mail" id="alt-mail">${escHtml(t.altMail)}</button>
    <div id="mail-wrap" hidden>
      <label for="mail">${escHtml(t.labelEmail)}</label>
      <input id="mail" type="email" placeholder="${escHtml(t.placeholderEmail)}" autocomplete="email" inputmode="email">
    </div>

    <label class="consent-row" for="consent">
      <input id="consent" type="checkbox">
      <span class="consent-text">${escHtml(t.consentPre)} <strong>${escHtml(clientName)}</strong> <span id="consent-mid">${escHtml(t.consentMid)}</span> <a href="https://app.helvaro.pro/privacy" target="_blank" rel="noopener">${escHtml(t.consentLink)}</a>${escHtml(t.consentSuffix)}${stijl.toestemming ? ' ' + escHtml(stijl.toestemming) : ''}</span>
    </label>

    <button id="btn">
      <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.4 0-.6.1-.2.3-.7.9-.9 1.1-.1.1-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.3-.4.1-.2 0-.3 0-.5 0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4 0-.7.3-.3.3-.9.9-.9 2.2 0 1.3.9 2.5 1 2.7.1.1 1.8 2.7 4.3 3.7.6.2 1.1.4 1.4.5.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2-.1-.1-.3-.2-.6-.3z"/>
      </svg>
      ${stijl.knop ? escHtml(stijl.knop) : `${escHtml(t.btn)} ${safeFirstName}${t.btnSuffix ? ' ' + escHtml(t.btnSuffix) : ''}`}
    </button>
    <div class="error" id="err" role="alert" aria-live="assertive"></div>
  </div>

  <!-- Bevestiging: "wat gebeurt er nu". Blijft verborgen tot de server succes meldde.
       De teksten van de stappen worden door het script ingevuld (kanaal en flow
       zijn pas na het antwoord bekend); titels, statuswoorden, de autokaart en
       de knoppen staan hier al, uitsluitend uit echte gegevens. -->
  <section class="bev" id="ok" aria-labelledby="ok-kop" hidden>
    <div class="bev-kop">
      <span class="bev-vink" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
      <h2 class="bev-titel" id="ok-kop" tabindex="-1"></h2>
      <p class="bev-sub" id="ok-sub"></p>
    </div>
    ${voertuig ? `<div class="bev-auto" id="ok-auto">
      ${voertuigFoto ? `<img class="bev-auto-foto" src="${escHtml(voertuigFoto)}" alt="" width="96" height="72" loading="lazy" decoding="async" onerror="this.remove()">` : ''}
      <div class="bev-auto-tekst">
        <span class="bev-auto-label">${escHtml(bevTekst.autoLabel)}</span>
        <strong class="bev-auto-titel">${escHtml(_vehicles.naam(voertuig))}</strong>
        ${voertuigOk
          ? (_vehicles.prijsTekst(voertuig.prijs) ? `<span class="bev-auto-prijs">${escHtml(_vehicles.prijsTekst(voertuig.prijs))}</span>` : '')
          : `<span class="bev-auto-prijs">${escHtml((t.statusNamen && t.statusNamen[voertuig.status]) || '')}</span>`}
      </div>
    </div>` : ''}
    <ol class="bev-stappen" role="list" aria-label="${escHtml(bevTekst.lijst)}">
      ${[1, 2, 3, 4].map((n) => {
        const klaar = n === 1;
        return `<li class="bev-stap ${klaar ? 'is-klaar' : 'is-open'}" data-stap="${n}">
        <span class="bev-punt" aria-hidden="true">${klaar
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : n}</span>
        <div class="bev-stap-inhoud">
          <span class="bev-stap-titel">${escHtml(bevTekst['s' + n])}</span>
          <span class="bev-stap-status">${klaar
            ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>'}${escHtml(klaar ? bevTekst.klaar : bevTekst.open)}</span>
          <p class="bev-stap-t" id="ok-s${n}t"></p>
        </div>
      </li>`;
      }).join('')}
    </ol>
    ${(voertuigUrl || dealerTel || siteUrl) ? `<div class="bev-acties" id="ok-acties">
      ${voertuigUrl ? `<a class="bev-cta bev-cta-hoofd" data-cta="voertuig" href="${escHtml(voertuigUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(bevTekst.ctaAuto)}</a>` : ''}
      ${dealerTel ? `<a class="bev-cta ${voertuigUrl ? 'bev-cta-tweede' : 'bev-cta-hoofd'}" data-cta="bel" href="${escHtml(dealerTel.href)}">${metDealer(bevTekst.ctaBel)}<span class="bev-cta-nr">${escHtml(dealerTel.tekst)}</span></a>` : ''}
      ${siteUrl ? `<a class="bev-link" data-cta="website" href="${escHtml(siteUrl)}" target="_blank" rel="noopener noreferrer">${escHtml(bevTekst.ctaSite)}</a>` : ''}
    </div>` : ''}
  </section>

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
  ${stijl.voet ? `<div class="voet">${escHtml(stijl.voet)}</div>` : ''}
  <div class="powered">${escHtml(t.poweredBy)} <a href="https://helvaro.pro" target="_blank" rel="noopener">Helvaro</a></div>
</div>

<script>
var PROJECT  = '${escJs(project)}';
/* De pand- of voertuigcode reist mee naar de lead, zodat de AI straks weet
   over welke woning of auto dit gesprek gaat. Leeg = het algemene formulier.
   Tot 2026-09-26 ging bij een dealer alleen de pandcode mee -- en die is daar
   altijd leeg, dus elke aanvraag vanaf een autopagina kwam zonder auto aan. */
var PAND     = '${escJs(pand ? pand.code : (voertuig ? voertuig.code : (pandNietBeschikbaar ? pandCode : '')))}';
/* true = de code is wel doorgegeven maar het aanbod is niet meer te zien. */
var PAND_WEG = ${pandNietBeschikbaar ? 'true' : 'false'};
var AI_FIRST = '${escJs(firstName)}';
var DEALER   = '${escJs(clientName)}';
/* true = de pagina is geopend voor een voertuig waarvoor een afspraak kan; dat
   kiest de voertuigflow in de bevestiging. Een verkocht of gereserveerd voertuig
   telt niet: daar past "plan een proefrit" niet bij. */
var HEEFT_VOERTUIG = ${voertuigOk ? 'true' : 'false'};
/* Plek voor een toekomstig verzoektype (proefrit, financiering, terugbellen,
   ...). Er is vandaag geen veld of UI voor; kiesFlow() kent de koppeling al. */
var AANVRAAG_TYPE = '';
/* De teksten van de bevestiging (api/_form-bevestiging.js), in de taal van de
   pagina. Veilig geserialiseerd: dealer- en assistentnamen komen NIET hierin,
   alleen de sjablonen met {dealer}/{ai}/{naam}. */
var BEV_T = ${_bev.jsonVeilig(bevTekst)};
/* Dezelfde functies die de test controleert, letterlijk uit de module. */
var bepaal   = ${_bev.bepaal.toString()};
var kiesFlow = ${_bev.kiesFlow.toString()};
var I18N = {
  errMissing:     '${escJs(t.errMissing)}',
  errMissingTail: '${escJs(t.errMissingTail)}',
  errGeneric:     '${escJs(t.errGeneric)}',
  /* De server stuurt een CODE mee; hier staat de zin die de lead leest, in zijn
     eigen taal. JSON.stringify en niet met de hand ingetypt: deze zinnen staan
     vol apostroffen. */
  srvErr:         ${JSON.stringify(t.srvErr || {})},
  errConsent:     '${escJs(t.errConsent)}',
  errPhone:       '${escJs(t.errPhone)}',
  errMail:        '${escJs(t.errMail)}',
  errContact:     '${escJs(t.errContact)}',
  consentMidMail: '${escJs(t.consentMidMail)}',
  loading:        '${escJs(t.loading)}',
  btn:            '${escJs(t.btn)}',
  btnSuffix:      '${escJs(t.btnSuffix)}'
};
var API = 'https://app.helvaro.pro/api/form/' + encodeURIComponent(PROJECT);

var btn  = document.getElementById('btn');
var err  = document.getElementById('err');
var form = document.getElementById('form');
var ok   = document.getElementById('ok');

/* Wat de knop zegt (en zijn WhatsApp-icoon) zoals de server hem renderde; hier
   bewaard zodat een mislukte poging hem exact terugzet. */
var btnHtml = btn.innerHTML;
/* Eén inzending tegelijk, en nooit een tweede na een geslaagde: de
   herhaalde klik, Enter in een veld, een dubbele tik op mobiel. De server
   ontdubbelt ook (open lead per persoon), dit is de eerste verdedigingslinie. */
var bezig = false;
var verstuurd = false;

/* ── Meldingen naar de pagina eromheen ───────────────────────────────────────
   Wordt de pagina in een iframe getoond, dan krijgt de ouder drie berichten:
     helvaro:lead_form_submitted       de server bevestigde de inzending
     helvaro:lead_confirmation_viewed  het bevestigingspaneel staat op het scherm
     helvaro:confirmation_cta_clicked  er is op een knop in het paneel geklikt
   De inhoud is bewust ZONDER persoonsgegevens: alleen het soort bericht plus
   flow (voertuig|algemeen), kanaal (whatsapp|email|neutraal) en welke knop
   (voertuig|bel|website). Geen naam, nummer, e-mail of id. Daarom is
   targetOrigin '*' hier acceptabel: er valt niets te onderscheppen. De CSP
   (frame-ancestors 'self') laat toch alleen dezelfde origin dit inlijsten.
   Geen derde partij, geen script erbij: postMessage kost niets. */
function meld(type, extra) {
  try {
    if (!window.parent || window.parent === window) return;
    var m = { type: 'helvaro:' + type };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k]; } }
    window.parent.postMessage(m, '*');
  } catch (e) { /* een melding mag de bevestiging nooit breken */ }
}

function vul(tpl, naam) {
  return String(tpl || '').split('{dealer}').join(DEALER).split('{ai}').join(AI_FIRST).split('{naam}').join(naam || '');
}
function zet(id, tekst) { var el = document.getElementById(id); if (el) el.textContent = tekst; }

/* Het paneel tonen. Gooit het ergens, dan vangt klaar() dat op: de inzending is
   dan al gelukt en mag nooit opnieuw. */
function toonBevestiging(d, name, heeftNummer, heeftMail) {
  var T = BEV_T;
  var uit = bepaal(d, { phone: heeftNummer, email: heeftMail });
  var flow = kiesFlow(HEEFT_VOERTUIG, AANVRAAG_TYPE);
  var eerste = String(name || '').split(' ')[0];

  zet('ok-kop', eerste ? vul(T.kop, eerste) : vul(T.kopZonder));
  zet('ok-sub', T.sub);
  zet('ok-s1t', vul(T.s1t));
  zet('ok-s2t', T['s2t_' + flow]);
  zet('ok-s3t', vul(T['s3t_' + uit.stap3]));
  zet('ok-s4t', T['s4t_' + flow]);

  form.style.display = 'none';
  document.getElementById('chat-area').style.display = 'none';
  document.getElementById('card').classList.add('bevestigd');
  document.body.classList.add('is-bevestigd');
  ok.hidden = false;
  zet('ok-live', T.live);

  var kop = document.getElementById('ok-kop');
  if (kop && kop.focus) kop.focus();
  meld('lead_confirmation_viewed', { flow: flow, channel: uit.kanaal });
  return { flow: flow, channel: uit.kanaal };
}

/* Notvoorziening: het paneel lukte niet (onverwachte DOM-fout). De lead staat
   er toch al, dus: een korte, eerlijke bevestiging en geen formulier meer. */
function minimaleBevestiging() {
  try {
    ok.hidden = true;
    form.style.display = 'none';
    document.getElementById('chat-area').style.display = 'none';
    var p = document.createElement('p');
    p.className = 'bev-minimaal';
    p.setAttribute('role', 'status');
    p.tabIndex = -1;
    p.textContent = BEV_T.okMinimaal;
    form.parentNode.insertBefore(p, form);
    p.focus();
  } catch (e) { form.style.display = 'none'; }
}

function klaar(d, name, heeftNummer, heeftMail) {
  verstuurd = true;
  bezig = false;
  var info = null;
  try { info = toonBevestiging(d, name, heeftNummer, heeftMail); } catch (e) { minimaleBevestiging(); }
  meld('lead_form_submitted', info ? { flow: info.flow, channel: info.channel } : null);
}

document.addEventListener('click', function(e) {
  var a = e.target && e.target.closest ? e.target.closest('a[data-cta]') : null;
  if (a) meld('confirmation_cta_clicked', { cta: a.getAttribute('data-cta') });
});

function btnDefault() {
  return I18N.btn + ' ' + AI_FIRST + (I18N.btnSuffix ? ' ' + I18N.btnSuffix : '');
}

var altMail  = document.getElementById('alt-mail');
var mailWrap = document.getElementById('mail-wrap');
var mailModus = false;
altMail.addEventListener('click', function() {
  mailModus = true;
  mailWrap.hidden = false;
  altMail.hidden = true;
  /* Het nummer is nu niet meer verplicht; de toestemming noemt e-mail. */
  document.getElementById('tel').removeAttribute('required');
  var mid = document.getElementById('consent-mid');
  if (mid) mid.textContent = I18N.consentMidMail;
  document.getElementById('mail').focus();
});

/* De landkeuze: vlag en code volgen de gekozen optie. Tikt iemand zelf +.. of
   00.., dan verdwijnt de vaste prefix (zijn nummer heeft er al een). */
(function () {
  var sel = document.getElementById('tel-land');
  var vlagEl = document.getElementById('tel-vlag');
  var prefixEl = document.getElementById('tel-prefix');
  var telEl = document.getElementById('tel');
  if (!sel || !vlagEl || !prefixEl || !telEl) return;
  function bij() {
    var o = sel.options[sel.selectedIndex];
    var tekst = o ? o.textContent : '';
    var vlag = tekst.split(' ')[0];
    if (vlag) vlagEl.textContent = vlag;
    prefixEl.textContent = '+' + sel.value;
    prefixEl.hidden = /^\\s*(\\+|00)/.test(telEl.value);
  }
  sel.addEventListener('change', function () { bij(); telEl.focus(); });
  telEl.addEventListener('input', bij);
  bij();
})();

btn.addEventListener('click', function() {
  if (bezig || verstuurd) return;
  var name    = document.getElementById('naam').value.trim();
  var phoneRuw = document.getElementById('tel').value.trim();
  /* Het nummer met de gekozen landcode ervoor. Wie zelf +.. of 00.. typt,
     bedoelt precies dat nummer; anders valt de nationale 0 weg. */
  var landSel = document.getElementById('tel-land');
  var phone   = phoneRuw;
  if (phoneRuw && landSel && !/^\\s*(\\+|00)/.test(phoneRuw)) {
    var gekozen = landSel.options ? landSel.options[landSel.selectedIndex] : null;
    var houdNul = gekozen && gekozen.getAttribute && gekozen.getAttribute('data-houd-nul') === '1';
    var nationaal = phoneRuw.replace(/[^0-9]/g, '');
    phone = '+' + landSel.value + (houdNul ? nationaal : nationaal.replace(/^0+/, ''));
  }
  var email   = mailModus ? document.getElementById('mail').value.trim() : '';
  var consent = document.getElementById('consent');

  err.textContent   = '';
  if (!name || (!phone && !mailModus)) {
    err.textContent   = I18N.errMissing + ' ' + AI_FIRST + ' ' + I18N.errMissingTail;
    return;
  }
  if (!phone && !email) {
    err.textContent   = I18N.errContact;
    return;
  }
  if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email)) {
    err.textContent   = I18N.errMail;
    document.getElementById('mail').focus();
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
  if (phone && (cijfers.length < 8 || cijfers.length > 15)) {
    err.textContent   = I18N.errPhone;
    document.getElementById('tel').focus();
    return;
  }

  if (consent && !consent.checked) {
    err.textContent   = I18N.errConsent;
    return;
  }

  /* Vanaf hier is er één inzending onderweg. */
  bezig = true;
  btn.innerHTML  = '<span class="spin" aria-hidden="true"></span> ' + I18N.loading;
  btn.disabled   = true;
  btn.setAttribute('aria-busy', 'true');

  fetch(API, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name: name, phone: phone, email: email, bron: 'Advertentie', property: PAND, property_unavailable: PAND_WEG && !!PAND, consent: !!(consent && consent.checked), website_url: (document.getElementById('hp-url') || {}).value || '' })
  })
  .then(function(r) {
    return r.json().catch(function() { return null; }).then(function(d) {
      /* Het antwoord van de server zegt WAT er gaat gebeuren (audit L-07):
         { success, kanaal: whatsapp|email|geen, status: verzonden|niet_verzonden|
         mislukt, bestaand }. De lead is opgeslagen VOORDAT de server success
         meldt (api/form.js), en alleen daarom staat stap 1 op afgerond. Een
         antwoord zonder success:true is geen bevestiging, ook niet bij een 200
         (bijvoorbeeld een tussenliggende proxy): dan blijft het formulier staan. */
      if (r.ok && d && d.success === true) { klaar(d, name, !!phone, !!email); return; }
      /* Eerst de CODE, dan pas de zin van de server. Andersom -- zoals het hier
         ooit stond -- won de Nederlandse serverzin altijd van de vertaalde terugval,
         en las een Waalse lead Nederlands op het formulier van een Waals kantoor.
         4xx = er klopt iets in wat de bezoeker invulde (of een limiet); 5xx of een
         onleesbaar antwoord = onze kant, zijn gegevens zijn ongemoeid. */
      var code = d && d.code;
      var tekst = (code && I18N.srvErr[code])
        || ((r.status >= 500 || r.ok) ? BEV_T.errServer : BEV_T.errControle);
      throw { tekst: tekst };
    });
  })
  .catch(function(e) {
    if (verstuurd) return;
    /* Geen antwoord gekregen (offline, time-out, geblokkeerd): dat is een
       netwerkfout. Alles wat de bezoeker invulde blijft staan; opnieuw proberen
       kan direct. */
    err.textContent   = (e && e.tekst) || BEV_T.errNetwork;
    btn.innerHTML     = btnHtml;
    btn.disabled      = false;
    btn.removeAttribute('aria-busy');
    bezig             = false;
  });
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !verstuurd && !bezig && form.style.display !== 'none') btn.click();
});
</script>
</body>
</html>`);
});
