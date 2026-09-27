/* ============================================================================
   KANAALSTROOM — één toestel, drie kanalen
   ----------------------------------------------------------------------------
   Eén telefoon die blijft staan terwijl de bezoeker scrollt. Het scherm erin
   wisselt van WhatsApp naar de website naar e-mail, en daarna naar wat die
   drie gemeen hebben.

   WAAROM DE GESPREKKEN HIER STAAN EN NIET IN DE HTML
   De vertaalmolen van deze site leest tekst uit de DOM zodra de pagina laadt.
   Wat wij hierna bouwen bestaat op dat moment nog niet, dus dat zou nooit
   vertaald worden. Daarom staan de gesprekken hier, per taal, als gegevens.
   Bijkomend voordeel: een ander scenario toevoegen is een blok bijschrijven,
   niet de opmaak opnieuw maken.

   OVER DE VOLGORDE
   Welk kanaal actief is, leiden we af uit welk tekstblok het dichtst bij het
   midden van het scherm staat. Dat is een berekening en geen wachtrij, dus
   snel scrollen, terugscrollen of in één keer van boven naar onder springen
   komt altijd op dezelfde toestand uit. Er kan er nooit meer dan één aan
   staan.
   ========================================================================= */
(function () {
  'use strict';

  /* ── De gesprekken ──────────────────────────────────────────────────────
     Per taal, per kanaal. 'van' is 'koper' of 'helvaro'; dat bepaalt aan
     welke kant de bel komt te staan en of er een typindicator voor komt. */
  var SCENARIOS = {
    nl: {
      whatsapp: {
        contact: 'Autohuis Verstraeten',
        status: 'online',
        berichten: [
          { van: 'koper',   tekst: 'Dag, staat die BMW X5 er nog?', tijd: '21:43' },
          { van: 'helvaro', tekst: 'Ja, de X5 xDrive30d uit 2021 staat er nog. 82.000 km, automaat, € 48.900.', tijd: '21:43' },
          { van: 'koper',   tekst: 'Is financiering mogelijk?', tijd: '21:44' },
          { van: 'helvaro', tekst: 'Dat kan. Heb je al een maandbedrag in gedachten?', tijd: '21:44' },
          { van: 'koper',   tekst: 'Rond de 450 euro', tijd: '21:45' },
          { van: 'helvaro', tekst: 'Genoteerd. Zaterdag kan om 11:00 of om 14:00 om hem te bekijken. Wat past het beste?', tijd: '21:45' }
        ]
      },
      website: {
        site: 'autohuis-verstraeten.be',
        wagen: { naam: 'BMW X5 xDrive30d', prijs: '€ 48.900', regel: '2021 · 82.000 km · automaat · diesel' },
        titel: 'Stel je vraag',
        berichten: [
          { van: 'koper',   tekst: 'Staat deze nog te koop?' },
          { van: 'helvaro', tekst: 'Ja, hij staat er nog. Wil je hem deze week komen bekijken?' },
          { van: 'koper',   tekst: 'Donderdagnamiddag zou lukken' },
          { van: 'helvaro', tekst: 'Donderdag kan om 16:30. Op welk nummer mag ik de bevestiging sturen?' }
        ]
      },
      email: {
        van: 'Thomas Peeters',
        aan: 'verkoop@autohuis-verstraeten.be',
        onderwerp: 'BMW X5 2021',
        antwoordLabel: 'Antwoord',
        berichten: [
          { van: 'koper', tijd: 'donderdag 08:30', tekst: 'Goedemorgen,\n\nIk heb interesse in uw BMW X5. Is die nog beschikbaar?\n\nIk zou ook graag weten of u een inruil aanvaardt.\n\nMet vriendelijke groet,\nThomas' },
          { van: 'helvaro', tijd: '08:31', tekst: 'Goedemorgen Thomas,\n\nJa, de BMW X5 xDrive30d uit 2021 is nog beschikbaar. 82.000 km, automaat, € 48.900.\n\nEen inruil kan zeker. Welke wagen zou u willen inruilen, en hoeveel kilometer staat erop?\n\nMet vriendelijke groet' },
          { van: 'koper', tijd: '09:12', tekst: 'Een Audi A4 uit 2018, 134.000 km. Zaterdag kan ik langskomen.' }
        ]
      }
    },

    fr: {
      whatsapp: {
        contact: 'Autohuis Verstraeten',
        status: 'en ligne',
        berichten: [
          { van: 'koper',   tekst: 'Bonjour, la BMW X5 est-elle toujours disponible ?', tijd: '21:43' },
          { van: 'helvaro', tekst: 'Oui, la X5 xDrive30d de 2021 est toujours là. 82 000 km, boîte automatique, 48 900 €.', tijd: '21:43' },
          { van: 'koper',   tekst: 'Le financement est possible ?', tijd: '21:44' },
          { van: 'helvaro', tekst: 'Tout à fait. Vous avez déjà une mensualité en tête ?', tijd: '21:44' },
          { van: 'koper',   tekst: 'Environ 450 euros', tijd: '21:45' },
          { van: 'helvaro', tekst: 'Noté. Samedi, 11:00 ou 14:00 est possible pour la voir. Qu’est-ce qui vous convient ?', tijd: '21:45' }
        ]
      },
      website: {
        site: 'autohuis-verstraeten.be',
        wagen: { naam: 'BMW X5 xDrive30d', prijs: '48 900 €', regel: '2021 · 82 000 km · automatique · diesel' },
        titel: 'Posez votre question',
        berichten: [
          { van: 'koper',   tekst: 'Elle est encore en vente ?' },
          { van: 'helvaro', tekst: 'Oui, elle est toujours là. Vous souhaitez la voir cette semaine ?' },
          { van: 'koper',   tekst: 'Jeudi après-midi, ça irait' },
          { van: 'helvaro', tekst: 'Jeudi, 16:30 est possible. À quel numéro puis-je envoyer la confirmation ?' }
        ]
      },
      email: {
        van: 'Thomas Peeters',
        aan: 'vente@autohuis-verstraeten.be',
        onderwerp: 'BMW X5 2021',
        antwoordLabel: 'Réponse',
        berichten: [
          { van: 'koper', tijd: 'jeudi 08:30', tekst: 'Bonjour,\n\nJe suis intéressé par votre BMW X5. Est-elle toujours disponible ?\n\nJe voudrais également savoir si vous acceptez une reprise.\n\nBien à vous,\nThomas' },
          { van: 'helvaro', tijd: '08:31', tekst: 'Bonjour Thomas,\n\nOui, la BMW X5 xDrive30d de 2021 est toujours disponible. 82 000 km, boîte automatique, 48 900 €.\n\nUne reprise est tout à fait possible. Quel véhicule souhaiteriez-vous reprendre, et quel est son kilométrage ?\n\nBien à vous' },
          { van: 'koper', tijd: '09:12', tekst: 'Une Audi A4 de 2018, 134 000 km. Je peux passer samedi.' }
        ]
      }
    },

    en: {
      whatsapp: {
        contact: 'Autohuis Verstraeten',
        status: 'online',
        berichten: [
          { van: 'koper',   tekst: 'Hi, is that BMW X5 still available?', tijd: '21:43' },
          { van: 'helvaro', tekst: 'Yes, the 2021 X5 xDrive30d is still here. 82,000 km, automatic, €48,900.', tijd: '21:43' },
          { van: 'koper',   tekst: 'Can you finance it?', tijd: '21:44' },
          { van: 'helvaro', tekst: 'We can. Do you have a monthly figure in mind already?', tijd: '21:44' },
          { van: 'koper',   tekst: 'Around 450 euro', tijd: '21:45' },
          { van: 'helvaro', tekst: 'Noted. Saturday works at 11:00 or 14:00 to come and see it. Which suits you best?', tijd: '21:45' }
        ]
      },
      website: {
        site: 'autohuis-verstraeten.be',
        wagen: { naam: 'BMW X5 xDrive30d', prijs: '€48,900', regel: '2021 · 82,000 km · automatic · diesel' },
        titel: 'Ask your question',
        berichten: [
          { van: 'koper',   tekst: 'Is this one still for sale?' },
          { van: 'helvaro', tekst: 'Yes, it is still here. Would you like to see it this week?' },
          { van: 'koper',   tekst: 'Thursday afternoon would work' },
          { van: 'helvaro', tekst: 'Thursday works at 16:30. Which number may I send the confirmation to?' }
        ]
      },
      email: {
        van: 'Thomas Peeters',
        aan: 'sales@autohuis-verstraeten.be',
        onderwerp: 'BMW X5 2021',
        antwoordLabel: 'Reply',
        berichten: [
          { van: 'koper', tijd: 'Thursday 08:30', tekst: 'Good morning,\n\nI am interested in your BMW X5. Is it still available?\n\nI would also like to know whether you accept a trade-in.\n\nKind regards,\nThomas' },
          { van: 'helvaro', tijd: '08:31', tekst: 'Good morning Thomas,\n\nYes, the 2021 BMW X5 xDrive30d is still available. 82,000 km, automatic, €48,900.\n\nA trade-in is certainly possible. Which vehicle would you like to trade in, and what is its mileage?\n\nKind regards' },
          { van: 'koper', tijd: '09:12', tekst: 'A 2018 Audi A4, 134,000 km. I can come by on Saturday.' }
        ]
      }
    },

    de: {
      whatsapp: {
        contact: 'Autohuis Verstraeten',
        status: 'online',
        berichten: [
          { van: 'koper',   tekst: 'Hallo, steht der BMW X5 noch?', tijd: '21:43' },
          { van: 'helvaro', tekst: 'Ja, der X5 xDrive30d von 2021 steht noch da. 82.000 km, Automatik, 48.900 €.', tijd: '21:43' },
          { van: 'koper',   tekst: 'Ist eine Finanzierung möglich?', tijd: '21:44' },
          { van: 'helvaro', tekst: 'Das geht. Haben Sie schon eine Monatsrate im Kopf?', tijd: '21:44' },
          { van: 'koper',   tekst: 'So um die 450 Euro', tijd: '21:45' },
          { van: 'helvaro', tekst: 'Notiert. Samstag geht 11:00 oder 14:00, um ihn anzusehen. Was passt besser?', tijd: '21:45' }
        ]
      },
      website: {
        site: 'autohuis-verstraeten.be',
        wagen: { naam: 'BMW X5 xDrive30d', prijs: '48.900 €', regel: '2021 · 82.000 km · Automatik · Diesel' },
        titel: 'Stellen Sie Ihre Frage',
        berichten: [
          { van: 'koper',   tekst: 'Steht der noch zum Verkauf?' },
          { van: 'helvaro', tekst: 'Ja, er steht noch da. Möchten Sie ihn diese Woche ansehen?' },
          { van: 'koper',   tekst: 'Donnerstagnachmittag würde gehen' },
          { van: 'helvaro', tekst: 'Donnerstag geht 16:30. An welche Nummer darf ich die Bestätigung schicken?' }
        ]
      },
      email: {
        van: 'Thomas Peeters',
        aan: 'verkauf@autohuis-verstraeten.be',
        onderwerp: 'BMW X5 2021',
        antwoordLabel: 'Antwort',
        berichten: [
          { van: 'koper', tijd: 'Donnerstag 08:30', tekst: 'Guten Morgen,\n\nich interessiere mich für Ihren BMW X5. Ist er noch verfügbar?\n\nAußerdem würde ich gern wissen, ob Sie eine Inzahlungnahme akzeptieren.\n\nMit freundlichen Grüßen,\nThomas' },
          { van: 'helvaro', tijd: '08:31', tekst: 'Guten Morgen Thomas,\n\nja, der BMW X5 xDrive30d von 2021 ist noch verfügbar. 82.000 km, Automatik, 48.900 €.\n\nEine Inzahlungnahme ist gut möglich. Welches Fahrzeug möchten Sie in Zahlung geben, und wie viele Kilometer hat es?\n\nMit freundlichen Grüßen' },
          { van: 'koper', tijd: '09:12', tekst: 'Einen Audi A4 von 2018, 134.000 km. Am Samstag kann ich vorbeikommen.' }
        ]
      }
    },

    es: {
      whatsapp: {
        contact: 'Autohuis Verstraeten',
        status: 'en línea',
        berichten: [
          { van: 'koper',   tekst: 'Hola, ¿sigue disponible ese BMW X5?', tijd: '21:43' },
          { van: 'helvaro', tekst: 'Sí, el X5 xDrive30d de 2021 sigue aquí. 82.000 km, automático, 48.900 €.', tijd: '21:43' },
          { van: 'koper',   tekst: '¿Se puede financiar?', tijd: '21:44' },
          { van: 'helvaro', tekst: 'Sí que se puede. ¿Tienes ya una cuota mensual en mente?', tijd: '21:44' },
          { van: 'koper',   tekst: 'Unos 450 euros', tijd: '21:45' },
          { van: 'helvaro', tekst: 'Anotado. El sábado puede ser a las 11:00 o a las 14:00 para verlo. ¿Qué te viene mejor?', tijd: '21:45' }
        ]
      },
      website: {
        site: 'autohuis-verstraeten.be',
        wagen: { naam: 'BMW X5 xDrive30d', prijs: '48.900 €', regel: '2021 · 82.000 km · automático · diésel' },
        titel: 'Haz tu pregunta',
        berichten: [
          { van: 'koper',   tekst: '¿Sigue en venta?' },
          { van: 'helvaro', tekst: 'Sí, sigue aquí. ¿Quieres verlo esta semana?' },
          { van: 'koper',   tekst: 'El jueves por la tarde me vendría bien' },
          { van: 'helvaro', tekst: 'El jueves puede ser a las 16:30. ¿A qué número te envío la confirmación?' }
        ]
      },
      email: {
        van: 'Thomas Peeters',
        aan: 'ventas@autohuis-verstraeten.be',
        onderwerp: 'BMW X5 2021',
        antwoordLabel: 'Respuesta',
        berichten: [
          { van: 'koper', tijd: 'jueves 08:30', tekst: 'Buenos días:\n\nMe interesa su BMW X5. ¿Sigue disponible?\n\nTambién me gustaría saber si aceptan un coche a cambio.\n\nUn saludo,\nThomas' },
          { van: 'helvaro', tijd: '08:31', tekst: 'Buenos días, Thomas:\n\nSí, el BMW X5 xDrive30d de 2021 sigue disponible. 82.000 km, automático, 48.900 €.\n\nAceptar un coche a cambio es perfectamente posible. ¿Qué vehículo querría entregar y cuántos kilómetros tiene?\n\nUn saludo' },
          { van: 'koper', tijd: '09:12', tekst: 'Un Audi A4 de 2018, 134.000 km. El sábado puedo pasarme.' }
        ]
      }
    }
  };

  /* Het vierde paneel gaat over wat de drie kanalen gemeen hebben. Daar het
     scherm leeg laten leest als een storing, dus toont het toestel daar het
     dossier waar de drie gesprekken in samenkomen. Dat is meteen het punt
     van dat paneel. */
  var DOSSIER = {
    nl: { titel: 'Eén dossier', koper: 'Thomas Peeters', via: 'Binnengekomen via',
          regels: [['Wagen', 'BMW X5 xDrive30d'], ['Inruil', 'Audi A4 · 2018'], ['Budget', '± € 450 per maand'], ['Afspraak', 'Zaterdag 14:00']],
          kanalen: ['WhatsApp', 'Website', 'E-mail'],
          voet: 'Eén koper, één wagen. Je verkoper hoeft niets opnieuw te vragen.' },
    fr: { titel: 'Un seul dossier', koper: 'Thomas Peeters', via: 'Arrivé via',
          regels: [['Véhicule', 'BMW X5 xDrive30d'], ['Reprise', 'Audi A4 · 2018'], ['Budget', '± 450 € par mois'], ['Rendez-vous', 'Samedi 14:00']],
          kanalen: ['WhatsApp', 'Site', 'Courriel'],
          voet: 'Un acheteur, un véhicule. Votre vendeur n’a rien à redemander.' },
    en: { titel: 'One file', koper: 'Thomas Peeters', via: 'Came in through',
          regels: [['Vehicle', 'BMW X5 xDrive30d'], ['Trade-in', 'Audi A4 · 2018'], ['Budget', '± €450 per month'], ['Appointment', 'Saturday 14:00']],
          kanalen: ['WhatsApp', 'Website', 'Email'],
          voet: 'One buyer, one vehicle. Your salesperson has to ask nothing twice.' },
    de: { titel: 'Eine Akte', koper: 'Thomas Peeters', via: 'Hereingekommen über',
          regels: [['Fahrzeug', 'BMW X5 xDrive30d'], ['Inzahlungnahme', 'Audi A4 · 2018'], ['Budget', '± 450 € pro Monat'], ['Termin', 'Samstag 14:00']],
          kanalen: ['WhatsApp', 'Website', 'E-Mail'],
          voet: 'Ein Käufer, ein Fahrzeug. Ihr Verkäufer muss nichts erneut fragen.' },
    es: { titel: 'Un solo expediente', koper: 'Thomas Peeters', via: 'Ha entrado por',
          regels: [['Vehículo', 'BMW X5 xDrive30d'], ['Entrega', 'Audi A4 · 2018'], ['Presupuesto', '± 450 € al mes'], ['Cita', 'Sábado 14:00']],
          kanalen: ['WhatsApp', 'Web', 'Correo'],
          voet: 'Un comprador, un vehículo. Tu vendedor no tiene que volver a preguntar nada.' }
  };

  function el(tag, klasse, tekst) {
    var n = document.createElement(tag);
    if (klasse) n.className = klasse;
    if (tekst != null) n.textContent = tekst;
    return n;
  }

  /* ── De drie schermen ──────────────────────────────────────────────── */

  function bouwWhatsapp(data) {
    var wrap = el('div', 'ks-wa');

    var kop = el('div', 'ks-wa-kop');
    kop.appendChild(el('span', 'ks-wa-terug', '‹'));
    kop.appendChild(el('span', 'ks-wa-avatar', data.contact.charAt(0)));
    var wie = el('div', 'ks-wa-wie');
    wie.appendChild(el('span', 'ks-wa-naam', data.contact));
    wie.appendChild(el('span', 'ks-wa-status', data.status));
    kop.appendChild(wie);
    wrap.appendChild(kop);

    var chat = el('div', 'ks-wa-chat');
    data.berichten.forEach(function (b) {
      var rij = el('div', 'ks-bericht ks-' + (b.van === 'koper' ? 'in' : 'uit'));
      rij.appendChild(el('div', 'ks-bel', b.tekst));
      if (b.tijd) rij.appendChild(el('span', 'ks-tijd', b.tijd));
      chat.appendChild(rij);
    });
    var typ = el('div', 'ks-typ');
    typ.appendChild(el('span')); typ.appendChild(el('span')); typ.appendChild(el('span'));
    chat.appendChild(typ);
    wrap.appendChild(chat);
    return wrap;
  }

  function bouwWebsite(data) {
    var wrap = el('div', 'ks-web');

    var balk = el('div', 'ks-web-balk');
    balk.appendChild(el('span', 'ks-web-slot', '●'));
    balk.appendChild(el('span', 'ks-web-url', data.site));
    wrap.appendChild(balk);

    var pagina = el('div', 'ks-web-pagina');

    /* Geen verzonnen autofoto: dit is een plek voor een foto, en dat mag je
       zien. Een echte kiekje van een ander model eronder plakken leest als
       een leugen zodra iemand goed kijkt. */
    var foto = el('div', 'ks-web-foto');
    foto.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 16.5V12l2-5a2 2 0 0 1 1.9-1.3h8.2A2 2 0 0 1 18 7l2 5v4.5"/><path d="M3 16.5h18M4 12h16"/>' +
      '<circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/></svg>';
    pagina.appendChild(foto);

    var info = el('div', 'ks-web-info');
    info.appendChild(el('h4', 'ks-web-naam', data.wagen.naam));
    info.appendChild(el('span', 'ks-web-prijs', data.wagen.prijs));
    info.appendChild(el('span', 'ks-web-regel', data.wagen.regel));
    pagina.appendChild(info);
    wrap.appendChild(pagina);

    var widget = el('div', 'ks-widget');
    var wkop = el('div', 'ks-widget-kop');
    wkop.appendChild(el('span', 'ks-widget-stip'));
    wkop.appendChild(el('span', 'ks-widget-titel', data.titel));
    widget.appendChild(wkop);

    var chat = el('div', 'ks-widget-chat');
    data.berichten.forEach(function (b) {
      var rij = el('div', 'ks-bericht ks-' + (b.van === 'koper' ? 'in' : 'uit'));
      rij.appendChild(el('div', 'ks-bel', b.tekst));
      chat.appendChild(rij);
    });
    var typ = el('div', 'ks-typ');
    typ.appendChild(el('span')); typ.appendChild(el('span')); typ.appendChild(el('span'));
    chat.appendChild(typ);
    widget.appendChild(chat);
    wrap.appendChild(widget);
    return wrap;
  }

  function bouwEmail(data) {
    var wrap = el('div', 'ks-mail');

    var kop = el('div', 'ks-mail-kop');
    kop.appendChild(el('span', 'ks-mail-onderwerp', data.onderwerp));
    kop.appendChild(el('span', 'ks-mail-aan', data.aan));
    wrap.appendChild(kop);

    var lijst = el('div', 'ks-mail-lijst');
    data.berichten.forEach(function (b, i) {
      var kaart = el('div', 'ks-bericht ks-mail-item' + (b.van === 'helvaro' ? ' ks-mail-uit' : ''));
      var regel = el('div', 'ks-mail-regel');
      regel.appendChild(el('span', 'ks-mail-van', b.van === 'helvaro' ? data.antwoordLabel : data.van));
      regel.appendChild(el('span', 'ks-mail-tijd', b.tijd));
      kaart.appendChild(regel);
      var body = el('p', 'ks-mail-body');
      body.textContent = b.tekst;
      kaart.appendChild(body);
      if (i < data.berichten.length - 1) kaart.appendChild(el('span', 'ks-mail-draad'));
      lijst.appendChild(kaart);
    });
    wrap.appendChild(lijst);
    return wrap;
  }

  function bouwDossier(data) {
    var wrap = el('div', 'ks-dos');

    var kop = el('div', 'ks-dos-kop');
    kop.appendChild(el('span', 'ks-dos-titel', data.titel));
    kop.appendChild(el('span', 'ks-dos-koper', data.koper));
    wrap.appendChild(kop);

    var body = el('div', 'ks-dos-body');

    var via = el('div', 'ks-bericht ks-dos-via');
    via.appendChild(el('span', 'ks-dos-label', data.via));
    var rij = el('div', 'ks-dos-kanalen');
    data.kanalen.forEach(function (k) { rij.appendChild(el('span', 'ks-dos-kanaal', k)); });
    via.appendChild(rij);
    body.appendChild(via);

    data.regels.forEach(function (r) {
      var item = el('div', 'ks-bericht ks-dos-regel');
      item.appendChild(el('span', 'ks-dos-label', r[0]));
      item.appendChild(el('span', 'ks-dos-waarde', r[1]));
      body.appendChild(item);
    });

    var voet = el('div', 'ks-bericht ks-dos-voet');
    voet.textContent = data.voet;
    body.appendChild(voet);

    wrap.appendChild(body);
    return wrap;
  }

  var BOUWERS = { whatsapp: bouwWhatsapp, website: bouwWebsite, email: bouwEmail, systeem: bouwDossier };

  /* ── Aansturing ────────────────────────────────────────────────────── */

  function init() {
    var sectie = document.querySelector('.kanaalstroom');
    if (!sectie) return;

    var scherm = sectie.querySelector('.ks-scherm');
    var panelen = Array.prototype.slice.call(sectie.querySelectorAll('.ks-panel'));
    var knoppen = Array.prototype.slice.call(sectie.querySelectorAll('.ks-kanaalknop'));
    if (!scherm || !panelen.length) return;

    var taal = (document.documentElement.lang || 'nl').slice(0, 2);
    var data = SCENARIOS[taal] || SCENARIOS.nl;
    data = Object.assign({}, data, { systeem: DOSSIER[taal] || DOSSIER.nl });
    var rustig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* De drie schermen één keer bouwen en laten staan. Bij elke wissel
       opnieuw opbouwen zou de browser elke keer opnieuw laten rekenen, en
       op een telefoon zie je dat. */
    var weergaven = {};
    ['whatsapp', 'website', 'email', 'systeem'].forEach(function (naam) {
      var v = el('div', 'ks-weergave');
      v.setAttribute('data-weergave', naam);
      v.setAttribute('aria-hidden', 'true');
      v.appendChild(BOUWERS[naam](data[naam]));
      scherm.appendChild(v);
      weergaven[naam] = v;
    });

    var timers = [];
    var actief = null;

    function stop() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    function speel(naam) {
      var v = weergaven[naam];
      if (!v) return;
      var berichten = Array.prototype.slice.call(v.querySelectorAll('.ks-bericht'));
      var typ = v.querySelector('.ks-typ');
      var chat = v.querySelector('.ks-wa-chat, .ks-widget-chat, .ks-mail-lijst');

      berichten.forEach(function (b) { b.classList.remove('zichtbaar'); });
      if (typ) typ.classList.remove('zichtbaar');
      if (chat) chat.scrollTop = 0;

      if (rustig) {
        berichten.forEach(function (b) { b.classList.add('zichtbaar'); });
        return;
      }

      var t = 260;
      berichten.forEach(function (b, i) {
        var vanHelvaro = b.classList.contains('ks-uit') || b.classList.contains('ks-mail-uit');
        /* Een lange mail lees je niet in een halve seconde, dus die krijgt
           meer lucht dan een appje van vier woorden. */
        var lengte = (b.textContent || '').length;
        var leestijd = Math.min(1500, 420 + lengte * 7);

        if (vanHelvaro && typ) {
          var tStart = t;
          timers.push(setTimeout(function () {
            typ.classList.add('zichtbaar');
            if (chat) chat.scrollTop = chat.scrollHeight;
          }, tStart));
          t += 620;
        }
        timers.push(setTimeout(function () {
          if (typ) typ.classList.remove('zichtbaar');
          b.classList.add('zichtbaar');
          if (chat) chat.scrollTop = chat.scrollHeight;
        }, t));
        t += leestijd;
      });
    }

    function zet(naam) {
      if (naam === actief) return;
      actief = naam;
      stop();

      /* Precies één kanaal staat aan. Nooit twee gesprekken tegelijk. */
      Object.keys(weergaven).forEach(function (k) {
        var aan = (k === naam);
        weergaven[k].classList.toggle('aan', aan);
        weergaven[k].setAttribute('aria-hidden', aan ? 'false' : 'true');
      });
      panelen.forEach(function (p) {
        p.classList.toggle('aan', p.getAttribute('data-kanaal') === naam);
      });
      knoppen.forEach(function (k) {
        var aan = k.getAttribute('data-kanaal') === naam;
        k.classList.toggle('aan', aan);
        k.setAttribute('aria-current', aan ? 'true' : 'false');
      });
      sectie.setAttribute('data-actief', naam);

      if (weergaven[naam]) speel(naam);
    }

    /* Welk paneel staat het dichtst bij het midden van het scherm? Dat is
       de toestand. Geen wachtrij, dus springen en terugscrollen geven
       hetzelfde antwoord als rustig naar beneden gaan. */
    function bepaal() {
      /* Op de telefoon staat het toestel bovenaan en kies je zelf een kanaal
         met de knoppen. Scrollen door de uitleg mag die keuze niet
         overschrijven terwijl het toestel uit beeld is. Alleen de eerste
         keer zetten we een beginstand. */
      if (telefoon.matches && actief) return;
      var midden = window.innerHeight / 2;
      var beste = null;
      var kleinste = Infinity;
      panelen.forEach(function (p) {
        var r = p.getBoundingClientRect();
        var afstand = Math.abs((r.top + r.bottom) / 2 - midden);
        if (afstand < kleinste) { kleinste = afstand; beste = p; }
      });
      if (beste) zet(beste.getAttribute('data-kanaal'));
    }

    var wacht = false;
    function opScroll() {
      if (wacht) return;
      wacht = true;
      requestAnimationFrame(function () { wacht = false; bepaal(); });
    }

    /* De waarnemer zet alleen de scrollluisteraar aan en uit. Zo rekenen we
       niets zolang de sectie niet in beeld is.

       De luisteraar hangt aan document in de VANGFASE, niet aan window. Op
       deze site staat overflow-x: hidden op de body, en daardoor scrollt de
       body in plaats van het venster. Een scrollgebeurtenis van een element
       borrelt niet omhoog, dus aan window zou hij nooit afgaan. In de
       vangfase komt hij wel langs, welk element er ook scrollt. */
    var luistert = false;
    var waarnemer = new IntersectionObserver(function (items) {
      var inBeeld = items.some(function (i) { return i.isIntersecting; });
      if (inBeeld && !luistert) {
        document.addEventListener('scroll', opScroll, { passive: true, capture: true });
        luistert = true;
        bepaal();
      } else if (!inBeeld && luistert) {
        document.removeEventListener('scroll', opScroll, { capture: true });
        luistert = false;
        stop();
      }
    }, { rootMargin: '10% 0px 10% 0px' });
    waarnemer.observe(sectie);

    /* Met de knoppen kun je ook springen. Dat is geen navigatie, maar wie
       met een toetsenbord werkt moet er wel bij kunnen. */
    /* Op de telefoon kleeft het toestel niet meer (dan schoof de uitleg
       eronder door). Springen naar het paneel zou het toestel dan uit beeld
       duwen, precies op het moment dat je wilt zien wat er verandert. Daar
       wisselt een knop dus het scherm zelf, en blijft de pagina staan. */
    var telefoon = window.matchMedia('(max-width: 720px)');
    knoppen.forEach(function (k) {
      k.addEventListener('click', function () {
        var naam = k.getAttribute('data-kanaal');
        if (telefoon.matches) { zet(naam); return; }
        var doel = panelen.filter(function (p) { return p.getAttribute('data-kanaal') === naam; })[0];
        if (doel) doel.scrollIntoView({ behavior: rustig ? 'auto' : 'smooth', block: 'center' });
      });
    });

    bepaal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
