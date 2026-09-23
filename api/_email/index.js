'use strict';
/*
 * E-mail: providers en de beslissing wat er met een binnenkomende mail gebeurt.
 *
 * ── Providers ───────────────────────────────────────────────────────────────
 *   gmail      Gmail en Google Workspace. Echt, via de Google-OAuth-client.
 *   microsoft  Microsoft 365 / Outlook. NOG NIET GEBOUWD: er is geen Azure-app
 *              geregistreerd. Hij staat in de lijst zodat het dashboard eerlijk
 *              kan zeggen dat hij er nog niet is, niet om iets te simuleren.
 *
 * ── Classificatie (puur, regels) ────────────────────────────────────────────
 * Regels en geen model: een nieuwsbrief herkennen aan List-Unsubscribe is
 * zekerder én gratis. Het resultaat bepaalt drie dingen:
 *   maaktLead        alleen bij koopintentie (of een klant die al bekend is)
 *   magAutoAntwoord  nooit op automatische mail, nieuwsbrieven, facturen,
 *                    eigen mail, of als de lusbewaking zegt dat het genoeg is
 *   reden            voor het logboek, zodat "waarom antwoordde hij niet"
 *                    te beantwoorden is
 */

const PROVIDERS = {
  gmail: require('./gmail'),
  microsoft: {
    naam: 'microsoft', beschikbaar: false,
    isConfigured: () => false,
    getAuthUrl() { const e = new Error('Microsoft 365 is nog niet beschikbaar.'); e.code = 'niet_beschikbaar'; throw e; },
  },
};

function provider(naam) { return PROVIDERS[naam] || null; }

const KOOP = /\b(auto|wagen|voertuig|occasie|occasion|tweedehands|proefrit|testrit|test ?drive|prijs|kost|beschikbaar|nog vrij|inruil|overname|financier|lening|leasing|lease|offerte|bod|korting|garantie|kilometerstand|km-stand|bouwjaar|keuring|afspraak|bezichtig|langskomen|voiture|essai|disponible|reprise|financement|devis|prix|car|vehicle|available|trade-?in|finance|quote|price|appointment|fahrzeug|probefahrt|verfügbar|inzahlungnahme|angebot|preis)\b/i;
const FACTUUR = /\b(factuur|facture|invoice|rechnung|betalingsherinnering|rappel de paiement|payment reminder|receipt|ontvangstbewijs|creditnota|credit note|bestelbevestiging|order confirmation)\b/i;
const NOREPLY = /^(no-?reply|noreply|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?|notifications?|alerts?)[@+.-]/i;

/**
 * @param {object} m        geparst bericht (gmail.parseBericht-vorm)
 * @param {object} context  { eigenAdres, bekendeKlant:boolean, aiAntwoordenRecent:number, laatsteUitgaandMs:number|null }
 * @returns {{classificatie, maaktLead, magAutoAntwoord, reden}}
 */
function analyseer(m, context = {}) {
  const k = m.koppen || {};
  const van = String(m.vanAdres || '').toLowerCase();
  const eigen = String(context.eigenAdres || '').toLowerCase();
  const tekst = `${m.onderwerp || ''}\n${m.tekst || ''}`;

  if (eigen && van === eigen) return uit('eigen', false, false, 'van de dealer zelf');
  if (k.xHelvaro) return uit('automatisch', false, false, 'bevat X-Helvaro (eigen bericht teruggekaatst)');
  if (k.autoSubmitted && !/^no$/i.test(k.autoSubmitted.trim())) return uit('automatisch', false, false, 'Auto-Submitted: ' + k.autoSubmitted);
  if (k.xAutoreply) return uit('automatisch', false, false, 'X-Autoreply');
  if (/^(bulk|junk|list|auto_reply)$/i.test(String(k.precedence || '').trim())) return uit('automatisch', false, false, 'Precedence: ' + k.precedence);
  if (/^<\s*>$/.test(String(k.returnPath || '').trim())) return uit('automatisch', false, false, 'lege Return-Path (bounce)');
  if (NOREPLY.test(van)) return uit('automatisch', false, false, 'no-reply-afzender');
  if (/^(automatisch antwoord|auto(matic)? ?reply|out of office|afwezig|absence|abwesenheit|réponse automatique|delivery status notification|undeliverable|onbestelbaar)/i.test(String(m.onderwerp || '').trim())) {
    return uit('automatisch', false, false, 'onderwerp van een automatisch antwoord');
  }
  if (k.listId || k.listUnsubscribe) return uit('nieuwsbrief', false, false, 'List-Id/List-Unsubscribe');
  if (FACTUUR.test(tekst)) return uit('factuur', false, false, 'factuur of bevestiging');

  const koop = KOOP.test(tekst);
  const klasse = context.bekendeKlant ? 'klant' : (koop ? 'lead' : 'overig');
  const maaktLead = klasse === 'lead';

  /* Lusbewaking: ook op een echte klant niet eindeloos automatisch
     antwoorden. Drie AI-antwoorden per gesprek per 24 uur, en niet binnen
     twee minuten na het vorige uitgaande bericht (dat is een machine die
     terugpraat, geen mens). */
  if ((context.aiAntwoordenRecent || 0) >= 3) return uit(klasse, maaktLead, false, 'lusbewaking: 3 AI-antwoorden in 24 uur');
  if (context.laatsteUitgaandMs != null && context.laatsteUitgaandMs < 2 * 60 * 1000) return uit(klasse, maaktLead, false, 'lusbewaking: antwoord binnen 2 minuten na ons bericht');
  if (klasse === 'overig') return uit(klasse, false, false, 'geen koopintentie herkend');
  return uit(klasse, maaktLead, true, '');
}

function uit(classificatie, maaktLead, magAutoAntwoord, reden) { return { classificatie, maaktLead, magAutoAntwoord, reden }; }

module.exports = { PROVIDERS, provider, analyseer };
