/* Dagtaken van het founder-dashboard (Sindi + Teljo).
 *
 * Stond als letterlijke data in api/dashboard.js -- en die bundel (/dashboard.js)
 * wordt aan IEDEREEN geserveerd, ook zonder login, en een jaar lang publiek
 * gecachet. Daarmee lagen namen, e-mailadressen en een telefoonnummer van
 * prospects open. Nu levert api/admin.js deze lijst alleen achter de
 * admin-controle (section=founder&type=dagtaken). */
'use strict';

const DAILY_TASKS = {
  1: [
    { wie: 'Teljo', taak: '10 LinkedIn DMs sturen', detail: 'Template 1. bureaus: CNIP, Ants Agency, Bureau 9000, Nouchka Design, SilverLine Studio, Magelaan' },
    { wie: 'Teljo', taak: 'Pipeline updaten', detail: 'Verplaats wie gereageerd heeft naar Geïnteresseerd in Founder Dashboard' },
    { wie: 'Frade', taak: 'Dashboard checken', detail: 'Login als elke klant. Controleer of leads binnenkomen en correct verwerkt worden' },
    { wie: 'Frade', taak: 'Bugs / verbeteringen fixen', detail: 'Fix eventuele fouten die klanten meldden vorige week' },
    { wie: 'Frade', taak: 'Nieuwe klant voorbereiden', detail: 'Als iemand ja zei vrijdag: account aanmaken via /onboard, formulier instellen' }
  ],
  2: [
    { wie: 'Teljo', taak: '10 LinkedIn DMs sturen', detail: 'Template 2. vastgoed: VICUS Vastgoed (0498 12 37 08), Agence Rosseel, Concordia' },
    { wie: 'Teljo', taak: 'Follow-up maandag', detail: 'Stuur Template 5 naar wie maandag niet gereageerd heeft' },
    { wie: 'Teljo', taak: '5 cold emails sturen', detail: 'info@cnip.be, info@vicusvastgoed.be, info@concordia.be, hello@antsconnect.be, info@bureau9000.be' },
    { wie: 'Frade', taak: 'Calendly integratie testen', detail: 'Test volledige flow: lead → WhatsApp → kwalificatie → Calendly boeking' },
    { wie: 'Frade', taak: 'WhatsApp response testen', detail: 'Stuur test lead via formulier, controleer WhatsApp response tijd' }
  ],
  3: [
    { wie: 'Teljo', taak: 'Demo calls (geboekte afspraken)', detail: 'Gebruik 15-min demo script. Doel: afsluiten op gratis proefperiode' },
    { wie: 'Teljo', taak: 'LinkedIn post publiceren', detail: '"Hoe wij [sector] helpen met AI leadkwalificatie via WhatsApp". vraag Frade voor screenshot' },
    { wie: 'Teljo', taak: '5 extra DMs coaches/consultants', detail: 'Opex Consulting (info@opex.be) en gelijkaardige bedrijven' },
    { wie: 'Frade', taak: 'Screenshot/video demo flow maken', detail: 'Schermopname van de demo flow voor Teljos LinkedIn post' },
    { wie: 'Frade', taak: 'App performance controleren', detail: 'Vercel logs checken, WhatsApp webhook response times controleren' },
    { wie: 'Frade', taak: 'Onboarding flow testen', detail: 'Ga naar app.helvaro.pro/onboard. Test het volledige proces als nieuwe klant' }
  ],
  4: [
    { wie: 'Teljo', taak: 'Follow-up alle openstaande contacten', detail: 'Template 5 naar iedereen zonder definitief antwoord deze week' },
    { wie: 'Teljo', taak: '10 nieuwe DMs sturen', detail: 'Nieuwe bedrijven zoeken via LinkedIn regio Gent/Antwerpen' },
    { wie: 'Teljo', taak: 'Demo calls', detail: 'Geboekte afspraken van eerder deze week' },
    { wie: 'Frade', taak: 'Airtable opruimen', detail: 'Leads controleren, verouderde leads archiveren, kwaliteitscheck' },
    { wie: 'Frade', taak: 'Klant support', detail: 'Beantwoord technische vragen van bestaande klanten via WhatsApp/email' },
    { wie: 'Frade', taak: 'Nieuwe feature / verbetering', detail: '1 concrete verbetering van dashboard, formulier of WhatsApp flow' }
  ],
  5: [
    { wie: 'Frade', taak: 'Founder Dashboard openen', detail: 'Open /founder tab → klik Genereer advies → lees wat AI aanbeveelt' },
    { wie: 'Frade', taak: 'Pipeline updaten', detail: 'Verplaats prospects naar juiste fase, verwijder wie definitief nee zei' },
    { wie: 'Frade', taak: 'Week samenvatting noteren', detail: 'Hoeveel DMs gestuurd, hoeveel demos gehad, hoeveel geïnteresseerd' },
    { wie: 'Teljo', taak: 'Deals afsluiten', detail: 'Bel iedereen die geïnteresseerd is → push naar contract' },
    { wie: 'Teljo', taak: 'Volgende week plannen', detail: 'Bespreek: wie benaderen we maandag, welke sectoren' },
    { wie: 'Beiden', taak: 'Weekly standup (15 min)', detail: 'Wat werkte? Wat niet? Wat aanpassen volgende week?' }
  ]
};

module.exports = { DAILY_TASKS };
