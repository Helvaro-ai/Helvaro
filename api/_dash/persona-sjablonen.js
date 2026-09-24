'use strict';
/*
 * De voorbeeldteksten op de pagina "Je assistent" -- 22 stuks, vier talen.
 *
 * ── Waarom dit een eigen bestand is ──────────────────────────────────────────
 * Ze stonden als AP_TEMPLATES en AP_INSTRUCTION_SNIPPETS midden in
 * api/dashboard.js: 95 regels Nederlands proza in de grote template literal.
 *
 * En ze waren onzichtbaar voor de lektest, om een reden die het onthouden waard
 * is: het zijn geen labels maar DATA. Geen textContent, geen attribuut, geen
 * >tekst<. Een Duitse makelaar zag ze gewoon in het Nederlands verschijnen op
 * een verder volledig Duits scherm.
 *
 * ── Waarom ze vertaald horen te zijn ─────────────────────────────────────────
 * Je zou kunnen denken: de AI begrijpt elke taal, dus wat maakt het uit. Maar
 * deze tekst is niet voor de AI. De eigenaar klikt erop, de tekst komt in ZIJN
 * invoerveld, en daarna moet hij hem kunnen lezen en aanpassen. Een Waalse
 * makelaar die op een knop drukt en er een Nederlandse zin uit krijgt die hij
 * niet kan controleren, plakt hem er ofwel blind in ofwel gebruikt de knop
 * nooit meer.
 *
 * ── Wat er NIET vertaald is ─────────────────────────────────────────────────
 * De plaatshouders {naam}, {ai}, {bedrijf} en {bron}. Die worden elders in de
 * code vervangen en zijn dus geen woorden maar sleutels. Vertalen zou ze stil
 * onvervangbaar maken -- de lezer krijgt dan letterlijk "{Name}" te zien.
 * De test bewaakt dat ze in elke taal identiek blijven.
 */

/** Welkomstberichten: de eigenaar kiest er EEN, hij vervangt wat er stond. */
function welkom(taal) {
  return (WELKOM[taal] || WELKOM.nl).map(function (t) { return { emoji: '', label: t.label, text: t.text }; });
}

/** Instructie-fragmenten: de eigenaar kan er MEERDERE achter elkaar plakken. */
function instructies(taal) {
  return (INSTRUCTIES[taal] || INSTRUCTIES.nl).map(function (t) { return { emoji: '', label: t.label, text: t.text }; });
}

/* ── Welkomstberichten ────────────────────────────────────────────────────── */
const WELKOM = {
  nl: [
    { label: 'Vriendelijk',           text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor je interesse. Wat bracht je naar ons?' },
    { label: 'Professioneel',         text: 'Goeiedag {naam}, dit is {ai} van {bedrijf}. Bedankt voor uw aanvraag. Mag ik u enkele korte vragen stellen om u beter te kunnen helpen?' },
    { label: 'Kort & krachtig',       text: 'Hey {naam}! {ai} hier. Heb je 2 minuten voor 3 snelle vragen?' },
    { label: 'Vraaggericht',          text: 'Hey {naam}! Ik zag je interesse in {bedrijf} via {bron}. Waar mag ik je het beste mee helpen vandaag?' },
    { label: 'Voor renovatie/bouw',   text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor je aanvraag. Om je goed te kunnen helpen: kan je kort vertellen wat het project is en wanneer je het wil starten?' },
    { label: 'Voor zorg/medisch',     text: 'Goeiedag {naam}, dit is {ai} van {bedrijf}. We helpen u graag verder. Voor welke behandeling of vraag heeft u contact opgenomen?' },
    { label: 'Voor vastgoed',         text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor uw interesse. Bent u op zoek naar een woning, of wilt u er één verkopen?' },
    { label: 'Voor advocaten',        text: 'Goeiedag {naam}, met {ai} van {bedrijf}. Bedankt voor uw contactopname. Kan u in een paar zinnen schetsen waarover u advies zoekt?' },
    { label: 'Vertrouwen + sociaal',  text: 'Hey {naam}! {ai} hier van {bedrijf}. Leuk dat je ons gevonden hebt. We hielpen deze maand al 12 klanten met hetzelfde. Wat is jouw situatie?' },
    { label: 'Direct kwalificeren',   text: 'Hallo {naam}, met {ai} van {bedrijf}. Voor we verder gaan: heb je al een budget in gedachten en wanneer wil je beginnen?' },
    { label: 'Voor autohandel',       text: 'Hey {naam}! {ai} hier van {bedrijf}. Bedankt voor je interesse. Welke wagen had je in gedachten. En zoek je benzine, diesel, hybride of elektrisch?' },
    { label: 'Voor garage/onderhoud', text: 'Goeiedag {naam}, dit is {ai} van {bedrijf}. Wat is er aan de hand met de wagen, en welk merk/model is het? Dan plannen we snel iets in.' },
    { label: 'Voor carrosserie',      text: 'Hey {naam}! {ai} van {bedrijf}. Bedankt voor je bericht. Wat is er gebeurd met de wagen, en gaat het via de verzekering of betaal je zelf?' },
  ],
  fr: [
    { label: 'Chaleureux',            text: 'Bonjour {naam} ! Ici {ai} de {bedrijf}. Merci pour votre intérêt. Qu’est-ce qui vous amène ?' },
    { label: 'Professionnel',         text: 'Bonjour {naam}, ici {ai} de {bedrijf}. Merci pour votre demande. Puis-je vous poser quelques courtes questions afin de mieux vous aider ?' },
    { label: 'Court et direct',       text: 'Bonjour {naam} ! Ici {ai}. Avez-vous 2 minutes pour 3 questions rapides ?' },
    { label: 'Axé sur la question',   text: 'Bonjour {naam} ! J’ai vu votre intérêt pour {bedrijf} via {bron}. Comment puis-je vous aider au mieux aujourd’hui ?' },
    { label: 'Rénovation/construction', text: 'Bonjour {naam} ! Ici {ai} de {bedrijf}. Merci pour votre demande. Pour bien vous aider : pouvez-vous décrire brièvement le projet et quand vous souhaitez commencer ?' },
    { label: 'Santé/médical',         text: 'Bonjour {naam}, ici {ai} de {bedrijf}. Nous vous aidons volontiers. Pour quel traitement ou quelle question nous avez-vous contactés ?' },
    { label: 'Immobilier',            text: 'Bonjour {naam} ! Ici {ai} de {bedrijf}. Merci pour votre intérêt. Cherchez-vous un logement, ou souhaitez-vous en vendre un ?' },
    { label: 'Avocats',               text: 'Bonjour {naam}, ici {ai} de {bedrijf}. Merci de nous avoir contactés. Pouvez-vous décrire en quelques phrases le sujet sur lequel vous cherchez conseil ?' },
    { label: 'Confiance + social',    text: 'Bonjour {naam} ! Ici {ai} de {bedrijf}. Content que vous nous ayez trouvés. Ce mois-ci, nous avons déjà aidé 12 clients dans le même cas. Quelle est votre situation ?' },
    { label: 'Qualifier directement', text: 'Bonjour {naam}, ici {ai} de {bedrijf}. Avant d’aller plus loin : avez-vous déjà un budget en tête et quand souhaitez-vous commencer ?' },
    { label: 'Concession auto',       text: 'Bonjour {naam} ! Ici {ai} de {bedrijf}. Merci pour votre intérêt. Quelle voiture aviez-vous en tête ? Et cherchez-vous essence, diesel, hybride ou électrique ?' },
    { label: 'Garage/entretien',      text: 'Bonjour {naam}, ici {ai} de {bedrijf}. Quel est le problème avec la voiture, et de quelle marque/quel modèle s’agit-il ? Nous planifions rapidement quelque chose.' },
    { label: 'Carrosserie',           text: 'Bonjour {naam} ! Ici {ai} de {bedrijf}. Merci pour votre message. Qu’est-il arrivé à la voiture, et cela passe-t-il par l’assurance ou payez-vous vous-même ?' },
  ],
  en: [
    { label: 'Friendly',              text: 'Hey {naam}! This is {ai} from {bedrijf}. Thanks for your interest. What brought you to us?' },
    { label: 'Professional',          text: 'Good day {naam}, this is {ai} from {bedrijf}. Thank you for your enquiry. May I ask you a few short questions so I can help you better?' },
    { label: 'Short and sharp',       text: 'Hey {naam}! {ai} here. Do you have 2 minutes for 3 quick questions?' },
    { label: 'Question-led',          text: 'Hey {naam}! I saw your interest in {bedrijf} via {bron}. What can I best help you with today?' },
    { label: 'Renovation/building',   text: 'Hey {naam}! This is {ai} from {bedrijf}. Thanks for your enquiry. So I can help properly: could you briefly describe the project and when you want to start?' },
    { label: 'Care/medical',          text: 'Good day {naam}, this is {ai} from {bedrijf}. We are happy to help. Which treatment or question did you contact us about?' },
    { label: 'Property',              text: 'Hey {naam}! This is {ai} from {bedrijf}. Thanks for your interest. Are you looking for a home, or do you want to sell one?' },
    { label: 'Lawyers',               text: 'Good day {naam}, this is {ai} from {bedrijf}. Thank you for getting in touch. Could you outline in a few sentences what you are seeking advice on?' },
    { label: 'Trust + social proof',  text: 'Hey {naam}! This is {ai} from {bedrijf}. Glad you found us. We have already helped 12 customers with the same thing this month. What is your situation?' },
    { label: 'Qualify straight away', text: 'Hello {naam}, this is {ai} from {bedrijf}. Before we go further: do you have a budget in mind, and when would you like to start?' },
    { label: 'Car dealership',        text: 'Hey {naam}! This is {ai} from {bedrijf}. Thanks for your interest. Which car did you have in mind? And are you after petrol, diesel, hybrid or electric?' },
    { label: 'Garage/servicing',      text: 'Good day {naam}, this is {ai} from {bedrijf}. What is wrong with the car, and which make/model is it? Then we will book something in quickly.' },
    { label: 'Body shop',             text: 'Hey {naam}! {ai} from {bedrijf}. Thanks for your message. What happened to the car, and is it going through insurance or are you paying yourself?' },
  ],
  de: [
    { label: 'Freundlich',            text: 'Hallo {naam}! Hier ist {ai} von {bedrijf}. Danke für Ihr Interesse. Was führt Sie zu uns?' },
    { label: 'Professionell',         text: 'Guten Tag {naam}, hier ist {ai} von {bedrijf}. Danke für Ihre Anfrage. Darf ich Ihnen ein paar kurze Fragen stellen, um Ihnen besser helfen zu können?' },
    { label: 'Kurz und knapp',        text: 'Hallo {naam}! {ai} hier. Haben Sie 2 Minuten für 3 kurze Fragen?' },
    { label: 'Fragenorientiert',      text: 'Hallo {naam}! Ich habe Ihr Interesse an {bedrijf} über {bron} gesehen. Womit kann ich Ihnen heute am besten helfen?' },
    { label: 'Renovierung/Bau',       text: 'Hallo {naam}! Hier ist {ai} von {bedrijf}. Danke für Ihre Anfrage. Damit ich gut helfen kann: Können Sie kurz sagen, worum es im Projekt geht und wann Sie starten möchten?' },
    { label: 'Gesundheit/Medizin',    text: 'Guten Tag {naam}, hier ist {ai} von {bedrijf}. Wir helfen Ihnen gerne weiter. Wegen welcher Behandlung oder Frage haben Sie uns kontaktiert?' },
    { label: 'Immobilien',            text: 'Hallo {naam}! Hier ist {ai} von {bedrijf}. Danke für Ihr Interesse. Suchen Sie eine Wohnung, oder möchten Sie eine verkaufen?' },
    { label: 'Anwälte',               text: 'Guten Tag {naam}, hier ist {ai} von {bedrijf}. Danke für Ihre Kontaktaufnahme. Können Sie in ein paar Sätzen schildern, wozu Sie Beratung suchen?' },
    { label: 'Vertrauen + sozial',    text: 'Hallo {naam}! Hier ist {ai} von {bedrijf}. Schön, dass Sie uns gefunden haben. Diesen Monat haben wir bereits 12 Kunden mit demselben Anliegen geholfen. Wie ist Ihre Situation?' },
    { label: 'Direkt qualifizieren',  text: 'Hallo {naam}, hier ist {ai} von {bedrijf}. Bevor wir weitermachen: Haben Sie schon ein Budget im Kopf, und wann möchten Sie beginnen?' },
    { label: 'Autohandel',            text: 'Hallo {naam}! Hier ist {ai} von {bedrijf}. Danke für Ihr Interesse. An welches Auto hatten Sie gedacht? Und suchen Sie Benzin, Diesel, Hybrid oder Elektro?' },
    { label: 'Werkstatt/Wartung',     text: 'Guten Tag {naam}, hier ist {ai} von {bedrijf}. Was ist mit dem Auto los, und um welche Marke/welches Modell handelt es sich? Dann planen wir schnell etwas ein.' },
    { label: 'Karosserie',            text: 'Hallo {naam}! {ai} von {bedrijf}. Danke für Ihre Nachricht. Was ist mit dem Auto passiert, und läuft das über die Versicherung oder zahlen Sie selbst?' },
  ],
};

/* ── Instructie-fragmenten ────────────────────────────────────────────────── */
const INSTRUCTIES = {
  nl: [
    { label: 'Praat informeel',              text: 'Praat informeel met "je/jij". geen "u". Houd zinnen kort en gebruik geen jargon.' },
    { label: 'Praat formeel',                text: 'Praat in u-vorm. Wees beleefd, zakelijk en gestructureerd in elk antwoord.' },
    { label: 'Geen prijzen via WhatsApp',    text: 'Stuur NOOIT exacte prijzen of offertes via WhatsApp. Verwijs altijd door naar een telefoongesprek of demo voor pricing.' },
    { label: 'Vraag altijd 3 dingen',        text: 'Vraag in elk gesprek expliciet naar: (1) het project of de behoefte, (2) de timing/urgentie, (3) het budget. Stel maximaal één vraag per bericht.' },
    { label: 'Sluit altijd af met een actie', text: 'Sluit ELK gesprek af met een concrete vervolgactie: een afspraak voorstellen, een offerte beloven, of een terugbeltijd vragen.' },
    { label: 'Diskwalificeer snel',          text: 'Als het duidelijk geen fit is (geen budget, geen interesse, verkeerde regio), wees vriendelijk maar stop het gesprek snel. Geen tijd verspillen.' },
    { label: 'Auto: vraag merk + model',     text: 'Vraag altijd naar (1) merk en model van de wagen, (2) bouwjaar of kilometerstand, (3) brandstof (benzine/diesel/hybride/elektrisch). Deze 3 dingen heb je nodig vóór elk vervolg.' },
    { label: 'Auto: financiering & inruil',  text: 'Vraag actief of de lead financiering nodig heeft (lening/leasing) en of er een wagen ter inruil is. Geef nooit zelf prijzen. Verwijs naar showroom of telefoongesprek.' },
    { label: 'Auto: keuring & onderhoud',    text: 'Bij onderhoud/garage-vragen: vraag naar (1) symptomen of foutmelding, (2) wanneer het probleem begon, (3) laatste keuring of grote beurt. Stel afspraak binnen 1 week voor.' },
  ],
  fr: [
    { label: 'Parler de façon informelle',   text: 'Tutoyez le lead. Restez décontracté, gardez les phrases courtes et évitez le jargon.' },
    { label: 'Parler de façon formelle',     text: 'Vouvoyez toujours. Soyez poli, professionnel et structuré dans chaque réponse.' },
    { label: 'Pas de prix via WhatsApp',     text: 'N’envoyez JAMAIS de prix exacts ou de devis via WhatsApp. Renvoyez toujours vers un appel téléphonique ou une démo pour les tarifs.' },
    { label: 'Toujours demander 3 choses',   text: 'Demandez explicitement dans chaque conversation : (1) le projet ou le besoin, (2) le timing/l’urgence, (3) le budget. Posez au maximum une question par message.' },
    { label: 'Toujours finir par une action', text: 'Terminez CHAQUE conversation par une action concrète : proposer un rendez-vous, promettre un devis, ou demander un créneau de rappel.' },
    { label: 'Disqualifier rapidement',      text: 'Si ce n’est manifestement pas adapté (pas de budget, pas d’intérêt, mauvaise région), restez aimable mais arrêtez vite la conversation. Ne perdez pas de temps.' },
    { label: 'Auto : marque + modèle',       text: 'Demandez toujours (1) la marque et le modèle de la voiture, (2) l’année ou le kilométrage, (3) le carburant (essence/diesel/hybride/électrique). Ces 3 éléments sont nécessaires avant toute suite.' },
    { label: 'Auto : financement & reprise', text: 'Demandez activement si le lead a besoin d’un financement (prêt/leasing) et s’il y a une voiture à reprendre. Ne donnez jamais de prix vous-même. Renvoyez vers le showroom ou un appel.' },
    { label: 'Auto : contrôle & entretien',  text: 'Pour les questions d’entretien/garage : demandez (1) les symptômes ou le message d’erreur, (2) quand le problème a commencé, (3) le dernier contrôle technique ou grand entretien. Proposez un rendez-vous sous 1 semaine.' },
  ],
  en: [
    { label: 'Speak informally',             text: 'Keep it casual and use first names. Keep sentences short and avoid jargon.' },
    { label: 'Speak formally',               text: 'Stay formal and polite. Be businesslike and structured in every reply.' },
    { label: 'No prices over WhatsApp',      text: 'NEVER send exact prices or quotes over WhatsApp. Always point to a phone call or demo for pricing.' },
    { label: 'Always ask 3 things',          text: 'In every conversation, explicitly ask for: (1) the project or need, (2) the timing/urgency, (3) the budget. Ask at most one question per message.' },
    { label: 'Always close with an action',  text: 'End EVERY conversation with a concrete next step: propose an appointment, promise a quote, or ask for a callback time.' },
    { label: 'Disqualify quickly',           text: 'If it is clearly not a fit (no budget, no interest, wrong region), stay friendly but end the conversation quickly. Do not waste time.' },
    { label: 'Car: ask make + model',        text: 'Always ask for (1) the make and model of the car, (2) the year or mileage, (3) the fuel type (petrol/diesel/hybrid/electric). You need these 3 before anything else.' },
    { label: 'Car: finance & trade-in',      text: 'Actively ask whether the lead needs finance (loan/lease) and whether there is a car to trade in. Never give prices yourself. Refer to the showroom or a phone call.' },
    { label: 'Car: MOT & servicing',         text: 'For servicing/garage questions, ask for (1) the symptoms or warning light, (2) when the problem started, (3) the last MOT or major service. Propose an appointment within 1 week.' },
  ],
  de: [
    { label: 'Locker sprechen',              text: 'Duzen Sie den Lead. Bleiben Sie locker, halten Sie die Sätze kurz und vermeiden Sie Fachjargon.' },
    { label: 'Förmlich sprechen',            text: 'Siezen Sie immer. Seien Sie höflich, sachlich und in jeder Antwort strukturiert.' },
    { label: 'Keine Preise über WhatsApp',   text: 'Senden Sie NIEMALS genaue Preise oder Angebote über WhatsApp. Verweisen Sie für Preise immer auf ein Telefongespräch oder eine Demo.' },
    { label: 'Immer 3 Dinge fragen',         text: 'Fragen Sie in jedem Gespräch ausdrücklich nach: (1) dem Projekt oder Bedarf, (2) dem Zeitpunkt/der Dringlichkeit, (3) dem Budget. Stellen Sie höchstens eine Frage pro Nachricht.' },
    { label: 'Immer mit einer Aktion enden', text: 'Beenden Sie JEDES Gespräch mit einem konkreten nächsten Schritt: einen Termin vorschlagen, ein Angebot zusagen, oder eine Rückrufzeit erfragen.' },
    { label: 'Schnell disqualifizieren',     text: 'Wenn es offensichtlich nicht passt (kein Budget, kein Interesse, falsche Region), bleiben Sie freundlich, beenden Sie das Gespräch aber schnell. Keine Zeit verschwenden.' },
    { label: 'Auto: Marke + Modell fragen',  text: 'Fragen Sie immer nach (1) Marke und Modell des Autos, (2) Baujahr oder Kilometerstand, (3) Kraftstoff (Benzin/Diesel/Hybrid/Elektro). Diese 3 Angaben brauchen Sie vor allem Weiteren.' },
    { label: 'Auto: Finanzierung & Inzahlung', text: 'Fragen Sie aktiv, ob der Lead eine Finanzierung braucht (Kredit/Leasing) und ob ein Auto in Zahlung gegeben wird. Nennen Sie nie selbst Preise. Verweisen Sie auf den Showroom oder ein Telefongespräch.' },
    { label: 'Auto: TÜV & Wartung',          text: 'Bei Wartungs-/Werkstattfragen: fragen Sie nach (1) Symptomen oder Fehlermeldung, (2) wann das Problem begann, (3) letztem TÜV oder großer Inspektion. Schlagen Sie einen Termin innerhalb 1 Woche vor.' },
  ],
};

module.exports = { welkom, instructies, WELKOM, INSTRUCTIES };
