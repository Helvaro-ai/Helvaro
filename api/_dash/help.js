'use strict';
/*
 * Het helpcentrum — twaalf artikelen, vier talen.
 *
 * ── Waarom dit een eigen bestand is ──────────────────────────────────────────
 * Het stond als HELP_ARTICLES midden in api/dashboard.js: 114 regels lopende
 * tekst in het Nederlands, binnen de grote template literal. Twee problemen
 * tegelijk.
 *
 * Ten eerste de taal. Helvaro verkoopt aan Vlaamse, Waalse en Duitstalige
 * bedrijven; twee van die drie markten lezen dit niet. En uitgerekend een
 * helpcentrum is het laatste waar je iemand in een vreemde taal aanspreekt --
 * wie hier komt, is al iets aan het uitzoeken.
 *
 * Ten tweede de plek. Proza hoort niet in een sjabloon waar een backtick de
 * hele app op het inlogscherm zet. Hier is het gewone data, en een vertaler
 * (of de eigenaar) kan een zin aanpassen zonder api/dashboard.js te openen.
 *
 * ── Wat er NIET vertaald is, en waarom ───────────────────────────────────────
 * De `id` van een artikel. Die staat in de zoekindex en in de URL van een
 * gedeelde helplink; vertalen zou elke bestaande link breken en de zoekfunctie
 * per taal iets anders laten vinden.
 *
 * ── De schermnamen komen uit de vertaaltabel ─────────────────────────────────
 * Een artikel dat "Ga naar Dashboard" zegt, moet dezelfde woorden gebruiken als
 * de knop waar de lezer op moet klikken. Vandaar dat `artikelen()` de
 * vertaalfunctie meekrijgt en er `t('nav.dashboard')` in staat in plaats van
 * het woord zelf. Hernoemt iemand een pagina, dan verandert de help mee.
 */

/* Kleine hulp: <strong>-nadruk om een schermnaam heen, zodat de tekst hieronder
   leesbaar blijft. */
const b = (s) => '<strong>' + s + '</strong>';

/**
 * De artikelen voor één taal.
 * @param {(sleutel: string) => string} t  vertaalfunctie, al aan de taal gebonden
 * @param {string} taal                    'nl' | 'fr' | 'en' | 'de'
 */
function artikelen(t, taal) {
  const L = TEKST[taal] || TEKST.nl;
  return L.map(function (a) {
    return {
      id:    a.id,
      sec:   a.sec,
      title: a.title,
      tags:  a.tags,
      /* De body is een functie zodat de schermnamen pas hier ingevuld worden --
         met de t() van de juiste taal. */
      body:  a.body(t, b),
    };
  });
}

/* ── De teksten ──────────────────────────────────────────────────────────────
   Nederlands is de bron: dat is de taal waarin ze geschreven zijn en waarin de
   eigenaar ze nakijkt. De andere drie volgen die tekst, niet andersom. */
const TEKST = {
  nl: [
    { id: 'werking', sec: 'Aan de slag', title: 'Hoe Helvaro werkt',
      tags: 'start uitleg overzicht basis werking hoe',
      body: (t, b) =>
        '<p>Helvaro vangt je binnenkomende leads op en praat er meteen mee, ook ’s avonds en in het weekend. Je krijgt geen ruwe lijst met namen, maar gesprekken die al gevoerd zijn.</p>' +
        '<ol>' +
        '<li>Een lead vult je formulier in of stuurt je een WhatsApp-bericht.</li>' +
        '<li>Je assistent stelt meteen de vragen die jij belangrijk vindt en beantwoordt die van de lead.</li>' +
        '<li>Op basis van die antwoorden krijgt de lead een score en een status: gekwalificeerd of niet.</li>' +
        '<li>Is de lead interessant, dan stuurt je assistent je boekingslink en komt de afspraak in je agenda.</li>' +
        '</ol>' +
        '<p>Jij ziet het resultaat terug op ' + b(t('nav.dashboard')) + ' en ' + b(t('nav.pipeline')) + '. Het volledige gesprek staat onder ' + b(t('nav.conversations')) + '.</p>' },

    { id: 'eerste-lead', sec: 'Aan de slag', title: 'Je eerste lead binnenhalen',
      tags: 'eerste lead testen proberen starten formulier link',
      body: (t, b) =>
        '<p>De snelste manier om Helvaro te testen is je eigen leadformulier invullen.</p>' +
        '<ol>' +
        '<li>Ga naar ' + b(t('nav.dashboard')) + '. Bovenaan staat het blok <em>' + t('dash.form.title') + '</em> met je persoonlijke link.</li>' +
        '<li>Klik op ' + b(t('dash.form.open')) + ' en vul het formulier in met je eigen gegevens.</li>' +
        '<li>Je krijgt binnen enkele seconden het eerste bericht van je assistent.</li>' +
        '</ol>' +
        '<p>De lead verschijnt daarna gewoon in je overzicht, precies zoals een echte klant dat zou doen. Je kunt hem achteraf laten verwijderen.</p>' },

    { id: 'formulier-site', sec: 'Aan de slag', title: 'Het formulier op je website zetten',
      tags: 'formulier website insluiten embed code script knop link site',
      body: (t, b) =>
        '<p>Er zijn twee manieren, en je hoeft geen ontwikkelaar te zijn voor de eerste.</p>' +
        '<p>' + b('1. Gewoon linken.') + ' Kopieer je formulierlink op het dashboard en zet die achter een knop op je site, in je Google-profiel, in je Instagram-bio of onder je e-mailhandtekening. Dit werkt altijd en overal.</p>' +
        '<p>' + b('2. Insluiten op je site.') + ' Onder ' + b(t('nav.form')) + ' vind je een stukje code dat je in je website plakt. Het formulier verschijnt dan als een blok op je eigen pagina, in je eigen huisstijl.</p>' +
        '<p>Weet je niet waar dat moet in je website? Stuur ons de link van je site, dan kijken we mee.</p>' },

    { id: 'ai-instellen', sec: 'Je assistent instellen', title: 'Je assistent aanpassen aan je bedrijf',
      tags: 'ai personality persoonlijkheid naam toon instructies welkomstbericht aanpassen taal',
      body: (t, b) =>
        '<p>Alles daarvoor staat op de pagina ' + b(t('nav.persona')) + '.</p>' +
        '<ul>' +
        '<li>' + b(t('dash.col.name')) + ': hoe je assistent zich voorstelt aan je leads.</li>' +
        '<li>' + b(t('a11y.veld.begroeting')) + ': het allereerste bericht dat een lead ontvangt.</li>' +
        '<li>' + b(t('a11y.veld.instructies')) + ': het belangrijkste veld. Hier zet je wat je bedrijf doet, wat voor jou een goede lead is, en wat je assistent juist niet mag beloven. Hoe concreter, hoe beter de gesprekken.</li>' +
        '<li>' + b('Website en adres') + ': je assistent gebruikt die om vragen over openingsuren, locatie en tarieven te beantwoorden.</li>' +
        '</ul>' +
        '<p>Wijzigingen gelden meteen voor het volgende gesprek. Lopende gesprekken blijven op de oude instellingen doorlopen.</p>' },

    { id: 'whatsapp', sec: 'Je assistent instellen', title: 'Je WhatsApp-nummer koppelen',
      tags: 'whatsapp nummer koppelen meta telefoon aansluiten',
      body: () =>
        '<p>Je assistent werkt meteen via het gedeelde Helvaro-nummer: leads die je formulier invullen krijgen een WhatsApp van je assistent, en jij leest alles mee onder Gesprekken.</p>' +
        '<p>Wil je dat leads je eigen bedrijfsnaam zien? Ga naar Instellingen &gt; WhatsApp en klik op <strong>Nummer koppelen</strong>. Je logt in bij Meta, kiest of maakt je WhatsApp Business-account en bevestigt je nummer. Daarna loopt alles via jouw nummer.</p>' +
        '<p>Lukt het niet, of heb je liever hulp? Laat het ons weten via de knop op je dashboard, dan doen we het samen.</p>' },

    { id: 'agenda', sec: 'Je assistent instellen', title: 'Google Agenda koppelen',
      tags: 'agenda kalender google afspraak boeken beschikbaarheid koppelen',
      body: (t, b) =>
        '<p>Koppel je agenda en je assistent kan echt boeken in plaats van alleen een link te sturen.</p>' +
        '<ol>' +
        '<li>Ga naar ' + b(t('nav.dashboard')) + ' en klik op ' + b(t('chk.gcal.action')) + ' bij Google Agenda. Je kunt het ook via ' + b(t('nav.settings')) + ' doen.</li>' +
        '<li>Log in bij Google en geef toestemming.</li>' +
        '<li>Klaar. Je assistent controleert vanaf nu je vrije momenten voordat hij iets voorstelt.</li>' +
        '</ol>' +
        '<p>Zonder koppeling blijft alles werken, maar dan stuurt je assistent een boekingslink en moet de lead zelf een moment kiezen.</p>' },

    { id: 'overnemen', sec: 'Dagelijks gebruik', title: 'Een gesprek zelf overnemen',
      tags: 'overnemen takeover mens zelf antwoorden pauzeren ai stoppen chatten',
      body: (t, b) =>
        '<p>Soms wil je er zelf in. Dat kan op elk moment.</p>' +
        '<ol>' +
        '<li>Open de lead vanuit ' + b(t('nav.conversations')) + ' of ' + b(t('nav.pipeline')) + '.</li>' +
        '<li>Bovenaan het gesprek staat een balk met de status: ' + b(t('conv.assistentActief')) + ' of ' + b(t('conv.mensAanRoer')) + '.</li>' +
        '<li>Zet hem op <em>' + t('conv.mensAanRoer') + '</em> en je assistent stopt onmiddellijk met antwoorden in dat gesprek.</li>' +
        '</ol>' +
        '<p>Je typt daarna zelf. Zet je de schakelaar terug, dan pikt je assistent het gesprek weer op met alles wat er ondertussen gezegd is.</p>' },

    { id: 'pipeline', sec: 'Dagelijks gebruik', title: 'Werken met de pipeline',
      tags: 'pipeline fase kolom slepen status opvolging kanban',
      body: (t, b) =>
        '<p>De ' + b(t('nav.pipeline')) + ' toont je leads als kaarten in kolommen, van eerste contact tot gewonnen of verloren.</p>' +
        '<p>Sleep een kaart naar een andere kolom om de fase bij te werken. Dat is puur voor jou: de lead merkt er niets van en je assistent verandert er zijn gedrag niet door.</p>' +
        '<p>Klik op een kaart voor het volledige gesprek, de score, en waarom je assistent deze lead wel of niet gekwalificeerd heeft.</p>' },

    { id: 'export', sec: 'Dagelijks gebruik', title: 'Leads exporteren',
      tags: 'export exporteren csv excel downloaden bestand rapport',
      body: (t, b) =>
        '<p>Rechtsboven op het dashboard staat ' + b(t('exp.csv')) + '. Dat downloadt al je leads als bestand dat je in Excel, Numbers of Google Sheets opent.</p>' +
        '<p>Je krijgt naam, telefoon, status, bron, score, urgentie, verwachte waarde, datum en de samenvatting van het gesprek.</p>' +
        '<p>Onder ' + b(t('nav.exports')) + ' vind je daarnaast rapporten per periode.</p>' },

    { id: 'credits', sec: 'Account', title: 'Wat zijn credits?',
      tags: 'credits verbruik limiet kosten opraken tegoed bundel',
      body: () =>
        '<p>Elk bericht dat je assistent namens jou verstuurt, kost een credit. Linksonder in de zijbalk zie je hoeveel je er deze maand gebruikt hebt.</p>' +
        '<p>Zit je tegen je limiet aan, dan waarschuwen we je ruim op tijd. We zetten je assistent nooit zomaar stil zonder iets te zeggen.</p>' +
        '<p>Zie je die balk niet staan? Dan geldt er voor jouw account geen maandlimiet en hoef je hier niet naar te kijken.</p>' +
        '<p>Meer nodig? Mail ons, dan verhogen we het.</p>' },

    { id: 'proef', sec: 'Account', title: 'Proefperiode en abonnement',
      tags: 'proefperiode trial abonnement betalen opzeggen factuur prijs 14 dagen',
      body: () =>
        '<p>Je start met een proefperiode van 14 dagen met alle functies. Je hoeft daarvoor geen kaartgegevens achter te laten.</p>' +
        '<p>Loopt de proef af, dan blijft je account en alles wat erin staat gewoon bestaan. Je assistent stopt alleen met nieuwe gesprekken tot je overstapt.</p>' +
        '<p>Wil je verlengen, overstappen of stoppen? Één mailtje volstaat, er zit geen opzegtermijn aan vast.</p>' },

    { id: 'privacy', sec: 'Account', title: 'Privacy, AVG en gegevens verwijderen',
      tags: 'privacy avg gdpr verwijderen wissen gegevens data bewaren recht vergeten account',
      body: (t, b) =>
        '<p>Je leads zijn van jou. Wij gebruiken ze niet voor iets anders en verkopen ze niet door.</p>' +
        '<p>Vraagt een lead om verwijdering, of wil je één lead weg? Stuur ons het verzoek via de knop hieronder. Je kunt kiezen tussen ' + b('anonimiseren') + ' (naam, nummer en gesprek worden gewist, je statistieken blijven kloppen) en ' + b('volledig verwijderen') + ' (de lead verdwijnt helemaal).</p>' +
        '<p>Wil je je hele ACCOUNT weg, dan doe je dat zelf: ' + b(t('nav.settings')) + ' → ' + b(t('set.danger')) + '. Dat wist meteen alles — je leads, gesprekken, afspraken, aanbod en je inlog — en zegt je abonnement op hetzelfde moment op. Alleen je facturen blijven bij Stripe staan, want die bewaarplicht ligt bij ons.</p>' +
        '<p>Je assistent vertelt eerlijk dat hij een AI is als een lead daarnaar vraagt. Dat is verplicht en staat vast.</p>' },
  ],
  fr: [
    { id: 'werking', sec: 'Pour commencer', title: 'Comment fonctionne Helvaro',
      tags: 'debut demarrer explication apercu base fonctionnement comment',
      body: (t, b) =>
        '<p>Helvaro capte vos prospects entrants et leur parle immédiatement, y compris le soir et le week-end. Vous ne recevez pas une liste brute de noms, mais des conversations déjà menées.</p>' +
        '<ol>' +
        '<li>Un prospect remplit votre formulaire ou vous envoie un message WhatsApp.</li>' +
        '<li>Votre assistant pose aussitôt les questions qui comptent pour vous et répond aux siennes.</li>' +
        '<li>Sur base de ces réponses, le prospect reçoit un score et un statut : qualifié ou non.</li>' +
        '<li>Si le prospect est intéressant, votre assistant envoie votre lien de réservation et le rendez-vous arrive dans votre agenda.</li>' +
        '</ol>' +
        '<p>Vous voyez le résultat sur ' + b(t('nav.dashboard')) + ' et ' + b(t('nav.pipeline')) + '. La conversation complète se trouve sous ' + b(t('nav.conversations')) + '.</p>' },

    { id: 'eerste-lead', sec: 'Pour commencer', title: 'Obtenir votre premier prospect',
      tags: 'premier prospect test essayer demarrer formulaire lien',
      body: (t, b) =>
        '<p>Le moyen le plus rapide de tester Helvaro est de remplir vous-même votre formulaire.</p>' +
        '<ol>' +
        '<li>Allez sur ' + b(t('nav.dashboard')) + '. En haut se trouve le bloc <em>' + t('dash.form.title') + '</em> avec votre lien personnel.</li>' +
        '<li>Cliquez sur ' + b(t('dash.form.open')) + ' et remplissez le formulaire avec vos propres données.</li>' +
        '<li>Vous recevez le premier message de votre assistant en quelques secondes.</li>' +
        '</ol>' +
        '<p>Le prospect apparaît ensuite dans votre aperçu, exactement comme le ferait un vrai client. Vous pouvez le faire supprimer par la suite.</p>' },

    { id: 'formulier-site', sec: 'Pour commencer', title: 'Mettre le formulaire sur votre site',
      tags: 'formulaire site web integrer embed code script bouton lien',
      body: (t, b) =>
        '<p>Il y a deux méthodes, et la première ne demande aucune compétence technique.</p>' +
        '<p>' + b('1. Simplement faire un lien.') + ' Copiez le lien de votre formulaire sur le tableau de bord et placez-le derrière un bouton sur votre site, dans votre fiche Google, dans votre bio Instagram ou sous votre signature e-mail. Cela fonctionne partout, toujours.</p>' +
        '<p>' + b('2. L’intégrer à votre site.') + ' Sous ' + b(t('nav.form')) + ' vous trouverez un morceau de code à coller dans votre site. Le formulaire apparaît alors comme un bloc sur votre propre page, dans votre propre style.</p>' +
        '<p>Vous ne savez pas où le placer ? Envoyez-nous le lien de votre site, nous regarderons avec vous.</p>' },

    { id: 'ai-instellen', sec: 'Configurer votre assistant', title: 'Adapter votre assistant à votre entreprise',
      tags: 'ia personnalite nom ton instructions message bienvenue adapter langue',
      body: (t, b) =>
        '<p>Tout cela se règle sur la page ' + b(t('nav.persona')) + '.</p>' +
        '<ul>' +
        '<li>' + b(t('dash.col.name')) + ' : la façon dont votre assistant se présente à vos prospects.</li>' +
        '<li>' + b(t('a11y.veld.begroeting')) + ' : le tout premier message que reçoit un prospect.</li>' +
        '<li>' + b(t('a11y.veld.instructies')) + ' : le champ le plus important. Vous y indiquez ce que fait votre entreprise, ce qu’est un bon prospect pour vous, et ce que votre assistant ne doit surtout pas promettre. Plus c’est concret, meilleures sont les conversations.</li>' +
        '<li>' + b('Site web et adresse') + ' : votre assistant s’en sert pour répondre aux questions sur les horaires, l’adresse et les tarifs.</li>' +
        '</ul>' +
        '<p>Les modifications s’appliquent dès la conversation suivante. Les conversations en cours continuent avec les anciens réglages.</p>' },

    { id: 'whatsapp', sec: 'Configurer votre assistant', title: 'Connecter votre numéro WhatsApp',
      tags: 'whatsapp numero connecter meta telephone raccorder',
      body: () =>
        '<p>Votre assistant fonctionne tout de suite via le numéro Helvaro partagé : les leads qui remplissent votre formulaire reçoivent un WhatsApp de votre assistant, et vous suivez tout sous Conversations.</p>' +
        '<p>Vous voulez que vos leads voient le nom de votre entreprise ? Allez dans Paramètres &gt; WhatsApp et cliquez sur <strong>Associer un numéro</strong>. Vous vous connectez à Meta, choisissez ou créez votre compte WhatsApp Business et confirmez votre numéro. Ensuite, tout passe par votre numéro.</p>' +
        '<p>Un souci, ou vous préférez de l’aide ? Faites-le-nous savoir via le bouton de votre tableau de bord et nous le faisons ensemble.</p>' },

    { id: 'agenda', sec: 'Configurer votre assistant', title: 'Connecter Google Agenda',
      tags: 'agenda calendrier google rendez-vous reserver disponibilite connecter',
      body: (t, b) =>
        '<p>Connectez votre agenda et votre assistant pourra réellement réserver, au lieu d’envoyer seulement un lien.</p>' +
        '<ol>' +
        '<li>Allez sur ' + b(t('nav.dashboard')) + ' et cliquez sur ' + b(t('chk.gcal.action')) + ' à côté de Google Agenda. Vous pouvez aussi le faire via ' + b(t('nav.settings')) + '.</li>' +
        '<li>Connectez-vous à Google et donnez votre autorisation.</li>' +
        '<li>C’est tout. Votre assistant vérifie désormais vos disponibilités avant de proposer quoi que ce soit.</li>' +
        '</ol>' +
        '<p>Sans connexion, tout continue de fonctionner, mais votre assistant envoie un lien de réservation et le prospect doit choisir lui-même un moment.</p>' },

    { id: 'overnemen', sec: 'Au quotidien', title: 'Reprendre la main sur une conversation',
      tags: 'reprendre main humain repondre soi-meme mettre en pause ia arreter discuter',
      body: (t, b) =>
        '<p>Parfois vous voulez intervenir vous-même. C’est possible à tout moment.</p>' +
        '<ol>' +
        '<li>Ouvrez le prospect depuis ' + b(t('nav.conversations')) + ' ou ' + b(t('nav.pipeline')) + '.</li>' +
        '<li>En haut de la conversation, une barre affiche le statut : ' + b(t('conv.assistentActief')) + ' ou ' + b(t('conv.mensAanRoer')) + '.</li>' +
        '<li>Passez-la sur <em>' + t('conv.mensAanRoer') + '</em> et votre assistant cesse immédiatement de répondre dans cette conversation.</li>' +
        '</ol>' +
        '<p>Vous écrivez ensuite vous-même. Si vous remettez l’interrupteur, votre assistant reprend la conversation avec tout ce qui a été dit entre-temps.</p>' },

    { id: 'pipeline', sec: 'Au quotidien', title: 'Travailler avec le pipeline',
      tags: 'pipeline phase colonne glisser statut suivi kanban',
      body: (t, b) =>
        '<p>Le ' + b(t('nav.pipeline')) + ' affiche vos prospects sous forme de cartes en colonnes, du premier contact jusqu’à gagné ou perdu.</p>' +
        '<p>Faites glisser une carte vers une autre colonne pour mettre la phase à jour. C’est purement pour vous : le prospect ne s’en aperçoit pas et votre assistant ne change pas de comportement pour autant.</p>' +
        '<p>Cliquez sur une carte pour voir la conversation complète, le score, et pourquoi votre assistant a qualifié ce prospect ou non.</p>' },

    { id: 'export', sec: 'Au quotidien', title: 'Exporter vos prospects',
      tags: 'export exporter csv excel telecharger fichier rapport',
      body: (t, b) =>
        '<p>En haut à droite du tableau de bord se trouve ' + b(t('exp.csv')) + '. Cela télécharge tous vos prospects dans un fichier que vous ouvrez avec Excel, Numbers ou Google Sheets.</p>' +
        '<p>Vous obtenez le nom, le téléphone, le statut, la source, le score, l’urgence, la valeur estimée, la date et le résumé de la conversation.</p>' +
        '<p>Sous ' + b(t('nav.exports')) + ' vous trouverez en outre des rapports par période.</p>' },

    { id: 'credits', sec: 'Compte', title: 'Que sont les crédits ?',
      tags: 'credits consommation limite cout epuiser solde forfait',
      body: () =>
        '<p>Chaque message que votre assistant envoie en votre nom coûte un crédit. En bas à gauche de la barre latérale, vous voyez combien vous en avez utilisé ce mois-ci.</p>' +
        '<p>Si vous approchez de votre limite, nous vous prévenons largement à l’avance. Nous n’arrêtons jamais votre assistant sans rien dire.</p>' +
        '<p>Vous ne voyez pas cette barre ? Alors aucune limite mensuelle ne s’applique à votre compte et vous n’avez pas à vous en soucier.</p>' +
        '<p>Besoin de plus ? Écrivez-nous et nous augmentons le plafond.</p>' },

    { id: 'proef', sec: 'Compte', title: 'Période d’essai et abonnement',
      tags: 'essai periode abonnement payer resilier facture prix 14 jours',
      body: () =>
        '<p>Vous démarrez avec une période d’essai de 14 jours, toutes fonctions comprises. Aucune carte bancaire n’est demandée.</p>' +
        '<p>À la fin de l’essai, votre compte et tout ce qu’il contient restent en place. Votre assistant arrête simplement les nouvelles conversations jusqu’à ce que vous passiez à un abonnement.</p>' +
        '<p>Vous souhaitez prolonger, changer de formule ou arrêter ? Un simple e-mail suffit, il n’y a aucun préavis.</p>' },

    { id: 'privacy', sec: 'Compte', title: 'Vie privée, RGPD et suppression des données',
      tags: 'vie privee rgpd gdpr supprimer effacer donnees conserver droit oubli compte',
      body: (t, b) =>
        '<p>Vos prospects vous appartiennent. Nous ne les utilisons pas à d’autres fins et nous ne les revendons pas.</p>' +
        '<p>Un prospect demande la suppression, ou vous voulez retirer une fiche ? Envoyez-nous la demande via le bouton ci-dessous. Vous pouvez choisir entre ' + b('anonymiser') + ' (le nom, le numéro et la conversation sont effacés, vos statistiques restent justes) et ' + b('supprimer entièrement') + ' (le prospect disparaît complètement).</p>' +
        '<p>Vous voulez supprimer tout votre COMPTE ? Vous le faites vous-même : ' + b(t('nav.settings')) + ' → ' + b(t('set.danger')) + '. Cela efface immédiatement tout — vos prospects, conversations, rendez-vous, offres et votre accès — et résilie votre abonnement au même moment. Seules vos factures restent chez Stripe, car cette obligation de conservation nous incombe.</p>' +
        '<p>Votre assistant dit honnêtement qu’il est une IA si un prospect le demande. C’est obligatoire et non modifiable.</p>' },
  ],
  en: [
    { id: 'werking', sec: 'Getting started', title: 'How Helvaro works',
      tags: 'start explanation overview basics how it works',
      body: (t, b) =>
        '<p>Helvaro catches your incoming leads and talks to them straight away, evenings and weekends included. You do not get a raw list of names, but conversations that have already happened.</p>' +
        '<ol>' +
        '<li>A lead fills in your form or sends you a WhatsApp message.</li>' +
        '<li>Your assistant immediately asks the questions that matter to you, and answers theirs.</li>' +
        '<li>Based on those answers the lead gets a score and a status: qualified or not.</li>' +
        '<li>If the lead is worth your time, your assistant sends your booking link and the appointment lands in your calendar.</li>' +
        '</ol>' +
        '<p>You see the result on ' + b(t('nav.dashboard')) + ' and ' + b(t('nav.pipeline')) + '. The full conversation is under ' + b(t('nav.conversations')) + '.</p>' },

    { id: 'eerste-lead', sec: 'Getting started', title: 'Getting your first lead',
      tags: 'first lead test try start form link',
      body: (t, b) =>
        '<p>The fastest way to test Helvaro is to fill in your own lead form.</p>' +
        '<ol>' +
        '<li>Go to ' + b(t('nav.dashboard')) + '. At the top is the <em>' + t('dash.form.title') + '</em> block with your personal link.</li>' +
        '<li>Click ' + b(t('dash.form.open')) + ' and fill in the form with your own details.</li>' +
        '<li>You get the first message from your assistant within seconds.</li>' +
        '</ol>' +
        '<p>The lead then shows up in your overview exactly as a real customer would. You can have it removed afterwards.</p>' },

    { id: 'formulier-site', sec: 'Getting started', title: 'Putting the form on your website',
      tags: 'form website embed code script button link site',
      body: (t, b) =>
        '<p>There are two ways, and the first needs no developer.</p>' +
        '<p>' + b('1. Just link to it.') + ' Copy your form link from the dashboard and put it behind a button on your site, in your Google profile, in your Instagram bio or under your email signature. This works anywhere.</p>' +
        '<p>' + b('2. Embed it on your site.') + ' Under ' + b(t('nav.form')) + ' you will find a piece of code to paste into your website. The form then appears as a block on your own page, in your own styling.</p>' +
        '<p>Not sure where it goes on your site? Send us the link and we will take a look with you.</p>' },

    { id: 'ai-instellen', sec: 'Setting up your assistant', title: 'Tailoring your assistant to your business',
      tags: 'ai personality name tone instructions welcome message customise language',
      body: (t, b) =>
        '<p>All of it lives on the ' + b(t('nav.persona')) + ' page.</p>' +
        '<ul>' +
        '<li>' + b(t('dash.col.name')) + ': how your assistant introduces itself to your leads.</li>' +
        '<li>' + b(t('a11y.veld.begroeting')) + ': the very first message a lead receives.</li>' +
        '<li>' + b(t('a11y.veld.instructies')) + ': the most important field. Put in what your business does, what counts as a good lead for you, and what your assistant must never promise. The more concrete, the better the conversations.</li>' +
        '<li>' + b('Website and address') + ': your assistant uses these to answer questions about opening hours, location and pricing.</li>' +
        '</ul>' +
        '<p>Changes apply from the next conversation onward. Conversations already running continue on the old settings.</p>' },

    { id: 'whatsapp', sec: 'Setting up your assistant', title: 'Connecting your WhatsApp number',
      tags: 'whatsapp number connect meta phone link',
      body: () =>
        '<p>Your assistant works straight away on the shared Helvaro number: leads who fill in your form get a WhatsApp from your assistant, and you follow everything under Conversations.</p>' +
        '<p>Want leads to see your own business name? Go to Settings &gt; WhatsApp and click <strong>Connect number</strong>. You log in with Meta, choose or create your WhatsApp Business account and confirm your number. From then on everything runs through your own number.</p>' +
        '<p>Something not working, or would you rather have help? Let us know through the button on your dashboard and we will do it together.</p>' },

    { id: 'agenda', sec: 'Setting up your assistant', title: 'Connecting Google Calendar',
      tags: 'calendar google appointment booking availability connect',
      body: (t, b) =>
        '<p>Connect your calendar and your assistant can actually book, instead of only sending a link.</p>' +
        '<ol>' +
        '<li>Go to ' + b(t('nav.dashboard')) + ' and click ' + b(t('chk.gcal.action')) + ' next to Google Calendar. You can also do it from ' + b(t('nav.settings')) + '.</li>' +
        '<li>Sign in with Google and grant permission.</li>' +
        '<li>Done. From now on your assistant checks your free slots before proposing anything.</li>' +
        '</ol>' +
        '<p>Without the connection everything keeps working, but your assistant sends a booking link and the lead has to pick a time themselves.</p>' },

    { id: 'overnemen', sec: 'Day to day', title: 'Taking over a conversation yourself',
      tags: 'take over takeover human reply yourself pause ai stop chat',
      body: (t, b) =>
        '<p>Sometimes you want to step in. You can, at any moment.</p>' +
        '<ol>' +
        '<li>Open the lead from ' + b(t('nav.conversations')) + ' or ' + b(t('nav.pipeline')) + '.</li>' +
        '<li>At the top of the conversation is a bar showing the status: ' + b(t('conv.assistentActief')) + ' or ' + b(t('conv.mensAanRoer')) + '.</li>' +
        '<li>Switch it to <em>' + t('conv.mensAanRoer') + '</em> and your assistant stops replying in that conversation immediately.</li>' +
        '</ol>' +
        '<p>You then type yourself. Flip the switch back and your assistant picks the conversation up again, with everything that was said in between.</p>' },

    { id: 'pipeline', sec: 'Day to day', title: 'Working with the pipeline',
      tags: 'pipeline stage column drag status follow-up kanban',
      body: (t, b) =>
        '<p>The ' + b(t('nav.pipeline')) + ' shows your leads as cards in columns, from first contact through to won or lost.</p>' +
        '<p>Drag a card to another column to update the stage. That is purely for you: the lead notices nothing and your assistant does not change its behaviour because of it.</p>' +
        '<p>Click a card for the full conversation, the score, and why your assistant did or did not qualify this lead.</p>' },

    { id: 'export', sec: 'Day to day', title: 'Exporting leads',
      tags: 'export csv excel download file report',
      body: (t, b) =>
        '<p>Top right on the dashboard is ' + b(t('exp.csv')) + '. That downloads all your leads as a file you can open in Excel, Numbers or Google Sheets.</p>' +
        '<p>You get name, phone, status, source, score, urgency, expected value, date and the summary of the conversation.</p>' +
        '<p>Under ' + b(t('nav.exports')) + ' you will also find reports per period.</p>' },

    { id: 'credits', sec: 'Account', title: 'What are credits?',
      tags: 'credits usage limit cost run out balance bundle',
      body: () =>
        '<p>Every message your assistant sends on your behalf costs one credit. Bottom left in the sidebar you can see how many you have used this month.</p>' +
        '<p>If you are getting close to your limit, we warn you well in advance. We never quietly switch your assistant off.</p>' +
        '<p>Do not see that bar? Then no monthly limit applies to your account and you do not need to think about this.</p>' +
        '<p>Need more? Email us and we will raise it.</p>' },

    { id: 'proef', sec: 'Account', title: 'Trial period and subscription',
      tags: 'trial subscription pay cancel invoice price 14 days',
      body: () =>
        '<p>You start with a 14-day trial with every feature included. No card details required.</p>' +
        '<p>When the trial ends, your account and everything in it stays exactly where it is. Your assistant simply stops taking new conversations until you move to a plan.</p>' +
        '<p>Want to extend, switch or stop? One email is enough — there is no notice period.</p>' },

    { id: 'privacy', sec: 'Account', title: 'Privacy, GDPR and deleting data',
      tags: 'privacy gdpr delete erase data retention right to be forgotten account',
      body: (t, b) =>
        '<p>Your leads are yours. We do not use them for anything else and we do not sell them on.</p>' +
        '<p>Does a lead ask to be removed, or do you want one gone? Send us the request through the button below. You can choose between ' + b('anonymising') + ' (name, number and conversation are wiped, your statistics stay correct) and ' + b('full deletion') + ' (the lead disappears entirely).</p>' +
        '<p>Want your whole ACCOUNT gone? You do that yourself: ' + b(t('nav.settings')) + ' → ' + b(t('set.danger')) + '. That wipes everything immediately — your leads, conversations, appointments, listings and your login — and cancels your subscription at the same moment. Only your invoices stay at Stripe, because that retention duty is ours.</p>' +
        '<p>Your assistant says honestly that it is an AI if a lead asks. That is required and cannot be changed.</p>' },
  ],

  de: [
    { id: 'werking', sec: 'Erste Schritte', title: 'So funktioniert Helvaro',
      tags: 'start erklaerung uebersicht grundlagen funktionsweise wie',
      body: (t, b) =>
        '<p>Helvaro fängt Ihre eingehenden Leads ab und spricht sofort mit ihnen — auch abends und am Wochenende. Sie bekommen keine rohe Namensliste, sondern Gespräche, die bereits geführt wurden.</p>' +
        '<ol>' +
        '<li>Ein Lead füllt Ihr Formular aus oder schickt Ihnen eine WhatsApp-Nachricht.</li>' +
        '<li>Ihr Assistent stellt sofort die Fragen, die Ihnen wichtig sind, und beantwortet die des Leads.</li>' +
        '<li>Auf Basis dieser Antworten erhält der Lead eine Bewertung und einen Status: qualifiziert oder nicht.</li>' +
        '<li>Ist der Lead interessant, schickt Ihr Assistent Ihren Buchungslink und der Termin landet in Ihrem Kalender.</li>' +
        '</ol>' +
        '<p>Das Ergebnis sehen Sie auf ' + b(t('nav.dashboard')) + ' und ' + b(t('nav.pipeline')) + '. Das vollständige Gespräch steht unter ' + b(t('nav.conversations')) + '.</p>' },

    { id: 'eerste-lead', sec: 'Erste Schritte', title: 'Ihren ersten Lead erhalten',
      tags: 'erster lead testen ausprobieren starten formular link',
      body: (t, b) =>
        '<p>Am schnellsten testen Sie Helvaro, indem Sie Ihr eigenes Lead-Formular ausfüllen.</p>' +
        '<ol>' +
        '<li>Gehen Sie auf ' + b(t('nav.dashboard')) + '. Ganz oben steht der Block <em>' + t('dash.form.title') + '</em> mit Ihrem persönlichen Link.</li>' +
        '<li>Klicken Sie auf ' + b(t('dash.form.open')) + ' und füllen Sie das Formular mit Ihren eigenen Daten aus.</li>' +
        '<li>Innerhalb weniger Sekunden erhalten Sie die erste Nachricht Ihres Assistenten.</li>' +
        '</ol>' +
        '<p>Der Lead erscheint danach ganz normal in Ihrer Übersicht, genau wie ein echter Kunde. Sie können ihn später löschen lassen.</p>' },

    { id: 'formulier-site', sec: 'Erste Schritte', title: 'Das Formular auf Ihre Website bringen',
      tags: 'formular website einbetten embed code script schaltflaeche link seite',
      body: (t, b) =>
        '<p>Es gibt zwei Wege, und für den ersten brauchen Sie keinen Entwickler.</p>' +
        '<p>' + b('1. Einfach verlinken.') + ' Kopieren Sie Ihren Formularlink im Dashboard und legen Sie ihn hinter eine Schaltfläche auf Ihrer Website, in Ihr Google-Profil, in Ihre Instagram-Bio oder unter Ihre E-Mail-Signatur. Das funktioniert überall.</p>' +
        '<p>' + b('2. Auf Ihrer Seite einbetten.') + ' Unter ' + b(t('nav.form')) + ' finden Sie ein Stück Code, das Sie in Ihre Website einfügen. Das Formular erscheint dann als Block auf Ihrer eigenen Seite, in Ihrem eigenen Stil.</p>' +
        '<p>Sie wissen nicht, wohin damit? Schicken Sie uns den Link Ihrer Seite, dann schauen wir mit.</p>' },

    { id: 'ai-instellen', sec: 'Ihren Assistenten einrichten', title: 'Ihren Assistenten auf Ihr Unternehmen abstimmen',
      tags: 'ki persoenlichkeit name ton anweisungen willkommensnachricht anpassen sprache',
      body: (t, b) =>
        '<p>Alles dafür steht auf der Seite ' + b(t('nav.persona')) + '.</p>' +
        '<ul>' +
        '<li>' + b(t('dash.col.name')) + ': wie Ihr Assistent sich Ihren Leads vorstellt.</li>' +
        '<li>' + b(t('a11y.veld.begroeting')) + ': die allererste Nachricht, die ein Lead bekommt.</li>' +
        '<li>' + b(t('a11y.veld.instructies')) + ': das wichtigste Feld. Hier steht, was Ihr Unternehmen macht, was für Sie ein guter Lead ist und was Ihr Assistent auf keinen Fall versprechen darf. Je konkreter, desto besser die Gespräche.</li>' +
        '<li>' + b('Website und Adresse') + ': damit beantwortet Ihr Assistent Fragen zu Öffnungszeiten, Standort und Preisen.</li>' +
        '</ul>' +
        '<p>Änderungen gelten ab dem nächsten Gespräch. Laufende Gespräche gehen mit den alten Einstellungen weiter.</p>' },

    { id: 'whatsapp', sec: 'Ihren Assistenten einrichten', title: 'Ihre WhatsApp-Nummer verbinden',
      tags: 'whatsapp nummer verbinden meta telefon anschliessen',
      body: () =>
        '<p>Ihr Assistent arbeitet sofort über die gemeinsame Helvaro-Nummer: Leads, die Ihr Formular ausfüllen, erhalten eine WhatsApp von Ihrem Assistenten, und Sie verfolgen alles unter Gespräche.</p>' +
        '<p>Sollen Leads Ihren eigenen Firmennamen sehen? Gehen Sie zu Einstellungen &gt; WhatsApp und klicken Sie auf <strong>Nummer verbinden</strong>. Sie melden sich bei Meta an, wählen oder erstellen Ihr WhatsApp-Business-Konto und bestätigen Ihre Nummer. Danach läuft alles über Ihre eigene Nummer.</p>' +
        '<p>Klappt etwas nicht, oder möchten Sie lieber Hilfe? Sagen Sie uns über die Schaltfläche auf Ihrem Dashboard Bescheid, dann machen wir es gemeinsam.</p>' },

    { id: 'agenda', sec: 'Ihren Assistenten einrichten', title: 'Google Kalender verbinden',
      tags: 'kalender google termin buchen verfuegbarkeit verbinden',
      body: (t, b) =>
        '<p>Verbinden Sie Ihren Kalender, dann kann Ihr Assistent wirklich buchen statt nur einen Link zu schicken.</p>' +
        '<ol>' +
        '<li>Gehen Sie auf ' + b(t('nav.dashboard')) + ' und klicken Sie bei Google Kalender auf ' + b(t('chk.gcal.action')) + '. Es geht auch über ' + b(t('nav.settings')) + '.</li>' +
        '<li>Melden Sie sich bei Google an und erteilen Sie die Berechtigung.</li>' +
        '<li>Fertig. Ihr Assistent prüft ab jetzt Ihre freien Zeiten, bevor er etwas vorschlägt.</li>' +
        '</ol>' +
        '<p>Ohne Verbindung funktioniert alles weiter, aber Ihr Assistent schickt einen Buchungslink und der Lead muss sich selbst einen Termin aussuchen.</p>' },

    { id: 'overnemen', sec: 'Im Alltag', title: 'Ein Gespräch selbst übernehmen',
      tags: 'uebernehmen mensch selbst antworten pausieren ki stoppen chatten',
      body: (t, b) =>
        '<p>Manchmal wollen Sie selbst eingreifen. Das geht jederzeit.</p>' +
        '<ol>' +
        '<li>Öffnen Sie den Lead über ' + b(t('nav.conversations')) + ' oder ' + b(t('nav.pipeline')) + '.</li>' +
        '<li>Oben im Gespräch steht eine Leiste mit dem Status: ' + b(t('conv.assistentActief')) + ' oder ' + b(t('conv.mensAanRoer')) + '.</li>' +
        '<li>Stellen Sie sie auf <em>' + t('conv.mensAanRoer') + '</em> und Ihr Assistent hört in diesem Gespräch sofort auf zu antworten.</li>' +
        '</ol>' +
        '<p>Danach schreiben Sie selbst. Stellen Sie den Schalter zurück, nimmt Ihr Assistent das Gespräch wieder auf — mit allem, was inzwischen gesagt wurde.</p>' },

    { id: 'pipeline', sec: 'Im Alltag', title: 'Mit der Pipeline arbeiten',
      tags: 'pipeline phase spalte ziehen status nachfassen kanban',
      body: (t, b) =>
        '<p>Die ' + b(t('nav.pipeline')) + ' zeigt Ihre Leads als Karten in Spalten, vom ersten Kontakt bis gewonnen oder verloren.</p>' +
        '<p>Ziehen Sie eine Karte in eine andere Spalte, um die Phase zu aktualisieren. Das ist rein für Sie: der Lead merkt nichts davon und Ihr Assistent ändert sein Verhalten dadurch nicht.</p>' +
        '<p>Klicken Sie auf eine Karte für das vollständige Gespräch, die Bewertung und die Begründung, warum Ihr Assistent diesen Lead qualifiziert hat oder nicht.</p>' },

    { id: 'export', sec: 'Im Alltag', title: 'Leads exportieren',
      tags: 'export exportieren csv excel herunterladen datei bericht',
      body: (t, b) =>
        '<p>Rechts oben im Dashboard steht ' + b(t('exp.csv')) + '. Damit laden Sie alle Ihre Leads als Datei herunter, die Sie in Excel, Numbers oder Google Sheets öffnen.</p>' +
        '<p>Sie erhalten Name, Telefon, Status, Quelle, Bewertung, Dringlichkeit, erwarteten Wert, Datum und die Zusammenfassung des Gesprächs.</p>' +
        '<p>Unter ' + b(t('nav.exports')) + ' finden Sie außerdem Berichte pro Zeitraum.</p>' },

    { id: 'credits', sec: 'Konto', title: 'Was sind Credits?',
      tags: 'credits verbrauch limit kosten aufgebraucht guthaben paket',
      body: () =>
        '<p>Jede Nachricht, die Ihr Assistent in Ihrem Namen verschickt, kostet ein Credit. Links unten in der Seitenleiste sehen Sie, wie viele Sie diesen Monat verbraucht haben.</p>' +
        '<p>Nähern Sie sich Ihrem Limit, warnen wir Sie rechtzeitig. Wir schalten Ihren Assistenten nie einfach kommentarlos ab.</p>' +
        '<p>Sie sehen diese Leiste nicht? Dann gilt für Ihr Konto kein Monatslimit und Sie müssen sich darum nicht kümmern.</p>' +
        '<p>Mehr nötig? Schreiben Sie uns, dann erhöhen wir es.</p>' },

    { id: 'proef', sec: 'Konto', title: 'Testphase und Abonnement',
      tags: 'testphase probe abonnement bezahlen kuendigen rechnung preis 14 tage',
      body: () =>
        '<p>Sie starten mit einer Testphase von 14 Tagen, mit allen Funktionen. Kartendaten sind dafür nicht nötig.</p>' +
        '<p>Läuft die Testphase aus, bleiben Ihr Konto und alles darin bestehen. Ihr Assistent nimmt lediglich keine neuen Gespräche mehr an, bis Sie wechseln.</p>' +
        '<p>Verlängern, wechseln oder aufhören? Eine E-Mail genügt, es gibt keine Kündigungsfrist.</p>' },

    { id: 'privacy', sec: 'Konto', title: 'Datenschutz, DSGVO und Daten löschen',
      tags: 'datenschutz dsgvo loeschen daten aufbewahren recht auf vergessenwerden konto',
      body: (t, b) =>
        '<p>Ihre Leads gehören Ihnen. Wir verwenden sie für nichts anderes und verkaufen sie nicht weiter.</p>' +
        '<p>Bittet ein Lead um Löschung, oder wollen Sie einen einzelnen loswerden? Schicken Sie uns die Anfrage über die Schaltfläche unten. Sie können zwischen ' + b('anonymisieren') + ' (Name, Nummer und Gespräch werden gelöscht, Ihre Statistiken bleiben korrekt) und ' + b('vollständig löschen') + ' (der Lead verschwindet ganz) wählen.</p>' +
        '<p>Wollen Sie Ihr ganzes KONTO löschen, machen Sie das selbst: ' + b(t('nav.settings')) + ' → ' + b(t('set.danger')) + '. Das löscht sofort alles — Ihre Leads, Gespräche, Termine, Angebote und Ihren Zugang — und kündigt im selben Moment Ihr Abonnement. Nur Ihre Rechnungen bleiben bei Stripe, denn diese Aufbewahrungspflicht liegt bei uns.</p>' +
        '<p>Ihr Assistent sagt ehrlich, dass er eine KI ist, wenn ein Lead danach fragt. Das ist Pflicht und steht fest.</p>' },
  ],
};

module.exports = { artikelen, TEKST };
