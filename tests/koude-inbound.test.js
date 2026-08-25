/*
 * Iemand appt uit zichzelf, zonder ooit een formulier te hebben ingevuld.
 *
 * ── Waarom dit bestaat ──────────────────────────────────────────────────────
 * Dat is de weg die een advertentie met klik-naar-WhatsApp of een QR-code
 * oplevert, en hij liep dood: de beller kreeg "vul eerst het formulier in" en
 * werd nooit een lead. Wie op één gedeeld nummer wil launchen zonder eerst op
 * Meta's templategoedkeuring te wachten, heeft precies deze weg nodig.
 *
 * ── En waarom hij aan één telling hangt ─────────────────────────────────────
 * Op een gedeeld nummer is bij een onbekende beller NIET te weten voor welk
 * kantoor hij belt. Behalve als er maar één actieve klant is -- dan heeft de
 * vraag maar één mogelijk antwoord. Zodra er een tweede klant bij komt, valt
 * dit vanzelf terug op het formulierbericht. Geen vlag om te vergeten, geen
 * instelling die kan verouderen.
 *
 * Dat is wat hier bewaakt wordt, want dit is de plek waar deze codebase anders
 * zou gaan doen wat hij nergens doet: de tenant raden.
 */
process.env.API_AIRTABLE  = 'patZelftest';
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.WHATSAPP_TOKEN = 'wa-zelftest';
process.env.PHONE_NUMBER_ID = '111222333';
process.env.WA_APP_SECRET = 'geheim-zelftest';

const fs = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const bron = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

const LEADS   = 'tbliukTnDAbEDcZmt';
const CLIENTS = 'tblPidTrwGRzRt4LZ';

/* De twee functies uit de bron knippen en draaien. Een nabouw zou alleen
   bewijzen dat mijn kopie werkt. */
function laad({ klanten, aangemaakt }) {
  const start = bron.indexOf('let _enigeKlantCache');
  const eind  = bron.indexOf('async function getClientByPhoneNumberId');
  const stuk  = bron.slice(start, eind);

  const calls = [];
  const atFetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: (opts.method || 'GET') });
    if (String(url).indexOf(CLIENTS) !== -1) {
      return { ok: true, json: async () => ({ records: klanten }) };
    }
    if ((opts.method || 'GET') === 'POST') {
      const body = JSON.parse(opts.body || '{}');
      aangemaakt.push(body);
      return { ok: true, json: async () => ({ id: 'recNIEUW', fields: body.fields }) };
    }
    return { ok: true, json: async () => ({ records: [] }) };
  };

  const maak = new Function(
    'atFetch', 'AIRTABLE_BASE', 'AIRTABLE_TOKEN', 'CLIENTS_TABLE', 'LEADS_TABLE',
    'setCachedLead', 'leadCacheKey', 'console',
    `${stuk}; return { enigeActieveKlant, maakLeadUitBinnenkomend, _reset() { _enigeKlantCache = { ts: 0, waarde: null }; } };`
  );
  const stil = { log() {}, warn() {}, error() {} };
  return { api: maak(atFetch, 'appZelftest', 'pat', CLIENTS, LEADS, () => {}, () => 'k', stil), calls };
}

const klant = (code, naam) => ({ id: 'rec' + code, fields: { 'Project Code': code, 'Client Name': naam } });

(async () => {
  console.log('\n— met precies één klant is er niets te raden —');
  let aangemaakt = [];
  let { api } = laad({ klanten: [klant('TELJO', 'Teljo Vastgoed')], aangemaakt });
  let enige = await api.enigeActieveKlant();
  ck('de enige klant wordt gevonden', enige && enige.projectCode === 'TELJO', enige);

  const lead = await api.maakLeadUitBinnenkomend('32470111222', 'hallo, is dat huis nog vrij?', enige);
  ck('er wordt een lead aangemaakt', !!lead && lead.id === 'recNIEUW', lead);
  ck('op de juiste tenant', aangemaakt[0].fields.fldSmczuyUJd26HLe === 'TELJO', aangemaakt[0].fields);
  ck('met het telefoonnummer van de beller',
     aangemaakt[0].fields.fld6YaitW0lMqHUrd === '32470111222', aangemaakt[0].fields);
  ck('en de bron staat op WhatsApp, niet op het formulier',
     aangemaakt[0].fields.fldGoerozqdea4BfU === 'WhatsApp', aangemaakt[0].fields);
  ck('de status begint op new', aangemaakt[0].fields.fld8mkrEWcyq7mUip === 'new');
  /* typecast: 'WhatsApp' bestaat misschien nog niet als keuze in het Bron-veld,
     en Airtable weigert bij een onbekende keuze de HELE create. Dan zou een
     echte lead verloren gaan aan een ontbrekende dropdownoptie. */
  ck('met typecast, anders sloopt een ontbrekende keuze de hele create',
     aangemaakt[0].typecast === true, aangemaakt[0]);

  console.log('\n— toestemming wordt NIET verzonnen —');
  /* Bij het formulier vinkt iemand expliciet aan. Wie zelf appt heeft dat nooit
     gedaan: hij zoekt duidelijk contact, en dat is de grondslag, maar dat is
     iets anders dan gegeven toestemming. Het verschil hoort zichtbaar te zijn. */
  const notities = JSON.parse(aangemaakt[0].fields.fldoLRI5W12ThTls7);
  ck('consent.given staat op false', notities.consent.given === false, notities.consent);
  ck('en er staat bij hoe het contact ontstond',
     notities.consent.via === 'inbound_whatsapp', notities.consent);

  console.log('\n— met twee klanten wordt er niets geraden —');
  aangemaakt = [];
  ({ api } = laad({ klanten: [klant('TELJO', 'Teljo'), klant('IMMO_B', 'Immo B')], aangemaakt }));
  enige = await api.enigeActieveKlant();
  ck('er wordt GEEN enkele klant aangewezen', enige === null, enige);
  ck('en er wordt dus ook geen lead aangemaakt', aangemaakt.length === 0, aangemaakt);

  console.log('\n— en bij nul klanten evenmin —');
  ({ api } = laad({ klanten: [], aangemaakt: [] }));
  ck('geen klant, geen lead', (await api.enigeActieveKlant()) === null);

  console.log('\n— een klant zonder projectcode telt niet mee —');
  /* Een lege projectcode leest verderop in de app als "admin, toon alles". Zo
     iemand mag hier dus zeker geen leads krijgen. */
  ({ api } = laad({ klanten: [{ id: 'recX', fields: { 'Client Name': 'Naamloos' } }], aangemaakt: [] }));
  ck('een klantrij zonder projectcode levert niets op', (await api.enigeActieveKlant()) === null);

  console.log('\n— de telling wordt maar kort onthouden —');
  /* Dit is de schakelaar die vanzelf moet omvallen op de dag dat er een tweede
     klant bij komt. Een lange cache zou dat uitstellen. */
  ck('vijf minuten, niet langer', /ENIGE_KLANT_TTL_MS = 5 \* 60 \* 1000/.test(bron));
  ck('en de vraag is "meer dan één?", niet "hoeveel?"',
     /maxRecords=2/.test(bron.slice(bron.indexOf('async function enigeActieveKlant'),
                                    bron.indexOf('async function maakLeadUitBinnenkomend'))));

  console.log('\n— de weg erheen zit vast aan het gedeelde nummer —');
  /* Komt het bericht binnen op een EIGEN nummer van een klant, dan is de tenant
     al bekend en heeft dit hele pad niets te zoeken. */
  ck('alleen zonder scopedProjectCode', /if \(!lead && !scopedProjectCode\) \{/.test(bron));
  ck('en anders krijgt de beller nog steeds het formulierbericht',
     /vul eerst het contactformulier|formulier in zodat we je verder kunnen helpen/.test(bron));

  console.log('\n— een mislukte create stuurt de beller niet het bos in —');
  const stuk = bron.slice(bron.indexOf('async function maakLeadUitBinnenkomend'),
                          bron.indexOf('async function getClientByPhoneNumberId'));
  ck('bij een fout komt er null terug', /return null;/.test(stuk));
  ck('en dan valt de aanroeper terug op het formulierbericht',
     /if \(!lead\) \{[\s\S]{0,400}sendWA\(phone/.test(bron));

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
