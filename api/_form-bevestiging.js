'use strict';
/* ── De bevestiging na het versturen van het leadformulier ────────────────────
   api/form-page.js toont na een geslaagde inzending een "wat gebeurt er nu"-
   paneel met een tracker van vier stappen. Deze module bevat alles wat DAARIN
   beslist wordt, zodat het los van een browser te testen is:

     - bepaal()    welk kanaal de bezoeker mag verwachten en welke stappen af
                   zijn, uitsluitend op basis van wat de server terugmeldde;
     - kiesFlow()  voertuig- of algemene flow (en de plek waar een toekomstig
                   verzoektype kan aansluiten);
     - TEKST       de teksten in nl/fr/en/de (Nederlands is de bron);
     - veiligeUrl / dealerTel  alleen echte, geldige gegevens worden een knop.

   bepaal() en kiesFlow() zijn bewust zelfstandige functies zonder verwijzing
   naar iets buiten henzelf: form-page.js zet ze via toString() letterlijk in de
   uitgestuurde pagina. Eén bron, dus wat de test controleert is exact wat de
   browser draait. Houd ze daarom ES5 en vrij van closures.

   De harde regels, en waarom:
     1. Stap 1 is ALLEEN afgerond omdat de server `success: true` zei. De
        pagina bevestigt dus nooit iets wat niet is opgeslagen.
     2. Stap 2 tot en met 4 zijn NOOIT afgerond. Niemand heeft de aanvraag al
        bekeken; dat claimen is precies de vals-urgentie die we niet willen.
     3. Stap 3 belooft alleen het kanaal dat ook echt gebruikt wordt. Een
        WhatsApp wordt alleen beloofd bij kanaal=whatsapp EN status=verzonden;
        bij een al bestaande lead gaat er bewust geen tweede bericht uit. */

/** Zelfstandig (wordt in de pagina ingebed). */
function bepaal(d, ctx) {
  d = d || {};
  ctx = ctx || {};
  var kanaal;
  if (d.kanaal) {
    if (d.kanaal === 'whatsapp' && d.status === 'verzonden') kanaal = 'whatsapp';
    else if (d.kanaal === 'email') kanaal = 'email';
    else kanaal = 'neutraal';
  } else if (ctx.phone) {
    /* Oudere server zonder kanaalvelden: het oude gedrag. */
    kanaal = 'whatsapp';
  } else if (ctx.email) {
    kanaal = 'email';
  } else {
    kanaal = 'neutraal';
  }
  return {
    ontvangen: d.success === true,
    kanaal: kanaal,
    /* Welke zin stap 3 krijgt. Een bestaande lead wint van het kanaal: die
       krijgt geen nieuw bericht, wel een opvolging door het team. */
    stap3: d.bestaand ? 'bestaand' : kanaal,
    /* Alleen stap 1 is af. Vast en bewust niet uit de respons af te leiden. */
    stappen: [true, false, false, false],
  };
}

/** Zelfstandig (wordt in de pagina ingebed).
    Een toekomstig verzoektype (proefrit, beschikbaarheid, financiering,
    terugbelverzoek) sluit hier aan door `type` mee te geven; er is vandaag geen
    veld of UI voor, dus de flow volgt uit de data: heeft de pagina een auto
    waarvoor een afspraak kan, dan de voertuigflow, anders de algemene. */
function kiesFlow(heeftVoertuig, type) {
  var PER_TYPE = { proefrit: 'voertuig', beschikbaarheid: 'voertuig', financiering: 'voertuig', terugbel: 'algemeen' };
  if (type && PER_TYPE[type]) return PER_TYPE[type];
  return heeftVoertuig ? 'voertuig' : 'algemeen';
}

/** Een link wordt alleen een knop als het een echte http(s)-URL is. Kale
    domeinen ("www.garage.be") krijgen https. Geen inloggegevens in de URL. */
function veiligeUrl(ruw) {
  let s = String(ruw == null ? '' : ruw).trim();
  if (!s || s.length > 500 || /\s/.test(s)) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s.replace(/^\/\//, '');
  let u;
  try { u = new URL(s); } catch (_) { return ''; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (u.username || u.password) return '';
  if (!/\./.test(u.hostname) || /[<>"'`]/.test(s)) return '';
  return u.href;
}

/** Alleen https voor afbeeldingen (de pagina draait zelf op https). */
function veiligeFoto(ruw) {
  const u = veiligeUrl(ruw);
  return /^https:\/\//.test(u) ? u : '';
}

/** Het publieke telefoonnummer van de dealer, of ''.
    Bewust NIET het "Phone"-veld van de klant (dat is het nummer waarmee de
    eigenaar zich aanmeldde) en NIET het meldnummer: beide zijn privé en horen
    niet op een openbare pagina. Alleen "Public Phone" telt, en dat veld moet
    de dealer zelf invullen. Geeft {href, tekst} of null. */
function dealerTel(ruw, regio, naarE164) {
  const s = String(ruw == null ? '' : ruw).trim().slice(0, 40);
  if (!s) return null;
  const e164 = naarE164(s, regio);
  if (!/^\d{8,15}$/.test(e164)) return null;
  return { href: 'tel:+' + e164, tekst: s.replace(/[<>"'`]/g, '') };
}

const TEKST = {
  nl: {
    kop: 'Alles geregeld, {naam}', kopZonder: 'Alles geregeld',
    sub: 'We hebben je aanvraag ontvangen. Zo gaat het verder.',
    live: 'Je aanvraag is ontvangen.',
    lijst: 'Voortgang van je aanvraag',
    s1: 'Aanvraag ontvangen', s1t: 'Je aanvraag is bij {dealer} binnengekomen.',
    s2: 'Aanvraag bekeken', s2t_voertuig: 'Het team controleert of de auto beschikbaar is.', s2t_algemeen: 'Het team leest je aanvraag na.',
    s3: 'Het team neemt contact op',
    s3t_whatsapp: 'Je krijgt een WhatsApp-bericht van {ai} van {dealer}.',
    s3t_email: 'Het team van {dealer} neemt per e-mail contact met je op.',
    s3t_neutraal: 'Het team van {dealer} neemt contact met je op.',
    s3t_bestaand: 'Het team van {dealer} heeft je aanvraag al en neemt contact met je op.',
    s4: 'Volgende stap', s4t_voertuig: 'Een bezichtiging of proefrit afspreken.', s4t_algemeen: 'Verder met je aanvraag.',
    klaar: 'Afgerond', open: 'In afwachting',
    autoLabel: 'Je aanvraag voor',
    ctaAuto: 'Bekijk de auto', ctaBel: 'Bel {dealer}', ctaSite: 'Terug naar de website',
    errNetwork: 'Geen verbinding. Je gegevens staan nog hier, probeer het opnieuw.',
    errServer: 'Er ging iets mis aan onze kant. Je gegevens staan nog hier, probeer het zo nog eens.',
    errControle: 'Controleer je gegevens en probeer opnieuw.',
    okMinimaal: 'Bedankt! We hebben je aanvraag ontvangen.',
  },
  fr: {
    kop: 'Tout est en ordre, {naam}', kopZonder: 'Tout est en ordre',
    sub: 'Nous avons bien reçu votre demande. Voici la suite.',
    live: 'Votre demande a bien été reçue.',
    lijst: 'Avancement de votre demande',
    s1: 'Demande reçue', s1t: 'Votre demande est bien arrivée chez {dealer}.',
    s2: 'Demande examinée', s2t_voertuig: 'L’équipe vérifie si le véhicule est disponible.', s2t_algemeen: 'L’équipe relit votre demande.',
    s3: 'L’équipe vous contacte',
    s3t_whatsapp: 'Vous recevrez un message WhatsApp de {ai} ({dealer}).',
    s3t_email: 'Quelqu’un chez {dealer} vous contactera par e-mail.',
    s3t_neutraal: 'Quelqu’un chez {dealer} vous contactera.',
    s3t_bestaand: 'Chez {dealer}, l’équipe a déjà votre demande et vous contactera.',
    s4: 'Étape suivante', s4t_voertuig: 'Convenir d’une visite ou d’un essai.', s4t_algemeen: 'Poursuivre votre demande.',
    klaar: 'Terminé', open: 'En attente',
    autoLabel: 'Votre demande pour',
    ctaAuto: 'Voir le véhicule', ctaBel: 'Appeler {dealer}', ctaSite: 'Retour au site web',
    errNetwork: 'Pas de connexion. Vos données sont toujours là, réessayez.',
    errServer: 'Un problème est survenu de notre côté. Vos données sont toujours là, réessayez dans un instant.',
    errControle: 'Vérifiez vos données et réessayez.',
    okMinimaal: 'Merci ! Nous avons bien reçu votre demande.',
  },
  en: {
    kop: 'You’re all set, {naam}', kopZonder: 'You’re all set',
    sub: 'We’ve received your request. Here’s what happens next.',
    live: 'Your request has been received.',
    lijst: 'Progress of your request',
    s1: 'Request received', s1t: 'Your request has reached {dealer}.',
    s2: 'Request reviewed', s2t_voertuig: 'The team checks whether the car is available.', s2t_algemeen: 'The team reads through your request.',
    s3: 'The team contacts you',
    s3t_whatsapp: 'You’ll get a WhatsApp message from {ai} at {dealer}.',
    s3t_email: 'The team at {dealer} will follow up by email.',
    s3t_neutraal: 'The team at {dealer} will get in touch with you.',
    s3t_bestaand: 'The team at {dealer} already has your request and will follow up.',
    s4: 'Next step', s4t_voertuig: 'Arrange a viewing or test drive.', s4t_algemeen: 'Continue with your request.',
    klaar: 'Completed', open: 'Pending',
    autoLabel: 'Your request for',
    ctaAuto: 'View vehicle', ctaBel: 'Call {dealer}', ctaSite: 'Back to the website',
    errNetwork: 'No connection. Your details are still here, please try again.',
    errServer: 'Something went wrong on our side. Your details are still here, try again in a moment.',
    errControle: 'Check your details and try again.',
    okMinimaal: 'Thanks! We have received your request.',
  },
  de: {
    kop: 'Alles in Ordnung, {naam}', kopZonder: 'Alles in Ordnung',
    sub: 'Wir haben Ihre Anfrage erhalten. So geht es weiter.',
    live: 'Ihre Anfrage ist eingegangen.',
    lijst: 'Fortschritt Ihrer Anfrage',
    s1: 'Anfrage eingegangen', s1t: 'Ihre Anfrage ist bei {dealer} angekommen.',
    s2: 'Anfrage geprüft', s2t_voertuig: 'Das Team prüft, ob das Fahrzeug verfügbar ist.', s2t_algemeen: 'Das Team sieht sich Ihre Anfrage an.',
    s3: 'Das Team meldet sich',
    s3t_whatsapp: 'Sie erhalten eine WhatsApp-Nachricht von {ai} bei {dealer}.',
    s3t_email: 'Das Team von {dealer} meldet sich per E-Mail bei Ihnen.',
    s3t_neutraal: 'Das Team von {dealer} meldet sich bei Ihnen.',
    s3t_bestaand: 'Das Team von {dealer} hat Ihre Anfrage bereits und meldet sich bei Ihnen.',
    s4: 'Nächster Schritt', s4t_voertuig: 'Besichtigung oder Probefahrt vereinbaren.', s4t_algemeen: 'Mit Ihrer Anfrage fortfahren.',
    klaar: 'Abgeschlossen', open: 'Ausstehend',
    autoLabel: 'Ihre Anfrage zu',
    ctaAuto: 'Fahrzeug ansehen', ctaBel: '{dealer} anrufen', ctaSite: 'Zurück zur Website',
    errNetwork: 'Keine Verbindung. Ihre Angaben sind noch da, bitte versuchen Sie es erneut.',
    errServer: 'Bei uns ist etwas schiefgelaufen. Ihre Angaben sind noch da, versuchen Sie es gleich noch einmal.',
    errControle: 'Bitte prüfen Sie Ihre Angaben und versuchen Sie es erneut.',
    okMinimaal: 'Danke! Wir haben Ihre Anfrage erhalten.',
  },
};

/** JSON dat veilig in een <script> past: geen </script>, geen U+2028/9. */
function jsonVeilig(w) {
  return JSON.stringify(w)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

module.exports = { bepaal, kiesFlow, veiligeUrl, veiligeFoto, dealerTel, TEKST, jsonVeilig };
