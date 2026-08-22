'use strict';
/*
 * Afspraken afzeggen en verzetten -- de enige plek die dat volledig doet.
 *
 * ── Waarom dit bestand bestaat ───────────────────────────────────────────────
 * Een afspraak leeft op vier plaatsen tegelijk, en ze horen bij elkaar:
 *
 *   1. de rij in de Appointments-tabel        (Status: booked / cancelled / ...)
 *   2. het item in de Google-agenda van de makelaar
 *   3. "Appointment Booked" op de lead        (telt mee in de pipeline en de
 *                                              win rate op Analyse)
 *   4. "Booking Link Sent" op de lead         (de rem die voorkomt dat er twee
 *                                              keer geboekt wordt)
 *
 * Er waren drie aanroepers en ze deden elk een ander deel. De ergste: Faro's
 * cancel_appointment haalde het item uit Google en liet de rij op 'booked'
 * staan. De herinneringscron van cron-followup.js filtert op precies dat veld,
 * dus de lead kreeg 24 uur van tevoren netjes een bericht over een afspraak die
 * al niet meer bestond -- en stond voor een dichte deur.
 *
 * Punt 4 is het minst zichtbare en het meest vervelende: wie afzegt zonder die
 * vlag te wissen, maakt van de lead iemand die NOOIT meer een nieuwe afspraak
 * kan boeken in het gesprek. De boekingscode in api/whatsapp.js slaat over
 * zodra hij gezet is. Afzeggen zonder herboeken mogelijk te maken is geen
 * afzeggen, dat is een doodlopende weg.
 *
 * ── Tenant-isolatie ──────────────────────────────────────────────────────────
 * Elke functie wil een projectCode, en die komt bij de aanroeper uit de
 * GEVERIFIEERDE sessie (of, bij WhatsApp, uit het nummer waarop het bericht
 * binnenkwam). Hier wordt hij niet vertrouwd maar gebruikt: elke afspraak wordt
 * eerst opgehaald en vergeleken voordat er iets geschreven wordt. Een lege
 * projectCode schrijft niets -- leeg leest verderop als "admin, toon alles" en
 * dat mag hier nooit "wijzig alles" worden.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const _gcal = require('./_gcal');

const AIRTABLE_BASE      = process.env.BASE_AIRTABLE;
const AIRTABLE_TOKEN     = process.env.API_AIRTABLE;
const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';
const LEADS_TABLE        = 'tbliukTnDAbEDcZmt';
const CLIENTS_TABLE      = 'tblPidTrwGRzRt4LZ';

/* Veld-ids waar ze bestaan: die overleven een hernoeming in Airtable, en dat is
   hier al eens misgegaan met een veld dat stilletjes niet meer geschreven werd. */
const LEAD_AFSPRAAK_GEBOEKT = 'fldyIGNetqcSEkoaK';  // Appointment Booked
const LEAD_BOEKING_VERSTUURD = 'fldLeEqwNefdglLis'; // Booking Link Sent

const F = Object.freeze({
  START:       'Start Time',
  DUUR:        'Duration',
  CODE:        'Project Code',
  LEAD:        'Lead',
  NAAM:        'Lead Name',
  TEL:         'Lead Phone',
  STATUS:      'Status',
  NOTITIES:    'Notes',
  HERINNERING: 'Reminder Sent',
  EVENT:       'Google Event ID',
});

const STATUS = Object.freeze({
  GEBOEKT:     'booked',
  GEANNULEERD: 'cancelled',
  VERZET:      'rescheduled',
  GEWEEST:     'completed',
  NIET_GEKOMEN: 'no_show',
});

function envKlaar() { return Boolean(AIRTABLE_BASE && AIRTABLE_TOKEN); }

function escapeFormula(s) { return String(s == null ? '' : s).replace(/"/g, '\\"'); }

/* Eigen kopie, net als in elk ander bestand hier: één retry op 429 en klaar.
   Airtable knijpt per base, en een afzegging die stukloopt op een limiet is een
   lead die voor een dichte deur staat. */
async function atFetch(url, opts) {
  const r = await fetch(url, opts);
  if (r.status !== 429) return r;
  await new Promise((res) => setTimeout(res, 900 + Math.random() * 300));
  return fetch(url, opts);
}

function atUrl(table, path = '') {
  return `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}${path}`;
}
function atKop(extra) {
  return Object.assign({ Authorization: `Bearer ${AIRTABLE_TOKEN}` }, extra || {});
}

/* Telefoonnummers vergelijken zonder over opmaak te struikelen: +32 470 12 34 56
   en 32470123456 zijn hetzelfde nummer. Alleen cijfers, en de laatste negen
   daarvan -- dat overleeft ook een landcode die er de ene keer wel en de andere
   keer niet bij staat. */
function telSleutel(tel) {
  const cijfers = String(tel || '').replace(/\D+/g, '');
  return cijfers.length > 9 ? cijfers.slice(-9) : cijfers;
}

/**
 * De eerstvolgende geboekte afspraak van één lead.
 *
 * Er wordt gefilterd op tenant, status en tijd in de FORMULE, en pas daarna in
 * JavaScript op de lead zelf. Dat is met opzet: {Lead} is een gekoppeld veld en
 * ARRAYJOIN() daarop geeft de primaire kolom terug, niet het record-id -- een
 * formule die daarop matcht ziet er goed uit en pakt de verkeerde rij zodra
 * twee leads dezelfde naam hebben. Het aantal rijen is klein (de komende
 * veertien dagen van één kantoor), dus het scheelt niets in snelheid.
 *
 * @param {string} projectCode  uit de geverifieerde sessie
 * @param {{leadId?:string, telefoon?:string}} wie
 * @returns {Promise<object|null>} het Airtable-record, of null
 */
async function komendeVoorLead(projectCode, wie = {}) {
  const code = String(projectCode || '').trim();
  if (!code || !envKlaar()) return null;

  const leadId = String(wie.leadId || '').trim();
  const tel    = telSleutel(wie.telefoon);
  if (!leadId && !tel) return null;

  const nu = new Date().toISOString();
  const formule = encodeURIComponent(
    `AND({${F.CODE}}="${escapeFormula(code)}", {${F.STATUS}}="${STATUS.GEBOEKT}", IS_AFTER({${F.START}}, "${nu}"))`
  );

  let records = [];
  try {
    const r = await atFetch(
      atUrl(APPOINTMENTS_TABLE, `?filterByFormula=${formule}&pageSize=100&sort%5B0%5D%5Bfield%5D=Start%20Time&sort%5B0%5D%5Bdirection%5D=asc`),
      { headers: atKop() }
    );
    if (!r.ok) return null;
    records = (await r.json()).records || [];
  } catch (err) {
    console.error('[afspraken] komendeVoorLead mislukt:', err && err.message);
    return null;
  }

  return records.find((rec) => {
    const f = rec.fields || {};
    if (leadId && Array.isArray(f[F.LEAD]) && f[F.LEAD].indexOf(leadId) !== -1) return true;
    if (tel && telSleutel(f[F.TEL]) === tel) return true;
    return false;
  }) || null;
}

/**
 * De Helvaro-afspraak die bij een Google-agenda-item hoort.
 *
 * Faro werkt met het id uit de agenda, want dat is wat de makelaar op zijn
 * scherm ziet. Maar niet elk agenda-item is van ons: hij zet er ook zijn
 * tandarts in. Vindt deze functie niets, dan is dat geen fout -- dan is het
 * gewoon een item dat alleen in Google bestaat, en dan is Google weghalen ook
 * echt alles wat er te doen valt.
 */
async function zoekOpEvent(projectCode, eventId) {
  const code = String(projectCode || '').trim();
  const eid  = String(eventId || '').trim();
  if (!code || !eid || !envKlaar()) return null;
  const formule = encodeURIComponent(
    `AND({${F.CODE}}="${escapeFormula(code)}", {${F.EVENT}}="${escapeFormula(eid)}")`
  );
  try {
    const r = await atFetch(atUrl(APPOINTMENTS_TABLE, `?filterByFormula=${formule}&maxRecords=1`), { headers: atKop() });
    if (!r.ok) return null;
    const rec = ((await r.json()).records || [])[0] || null;
    /* De formule filtert al op tenant, maar dat is één regel tekst die iemand
       bij een volgende wijziging kan aanpassen. De controle staat er daarom ook
       nog eens in code -- die verdwijnt niet per ongeluk. */
    if (rec && rec.fields && rec.fields[F.CODE] !== code) return null;
    return rec;
  } catch (err) {
    console.error('[afspraken] zoekOpEvent mislukt:', err && err.message);
    return null;
  }
}

/** Eén afspraak ophalen en meteen controleren dat hij van deze tenant is. */
async function leesEigen(projectCode, id) {
  const code = String(projectCode || '').trim();
  const rid  = String(id || '').trim();
  if (!code || !/^rec[A-Za-z0-9]{14}$/.test(rid) || !envKlaar()) return null;
  try {
    const r = await atFetch(atUrl(APPOINTMENTS_TABLE, `/${rid}`), { headers: atKop() });
    if (!r.ok) return null;
    const rec = await r.json();
    if (!rec || !rec.fields || rec.fields[F.CODE] !== code) return null;
    return rec;
  } catch (err) {
    console.error('[afspraken] leesEigen mislukt:', err && err.message);
    return null;
  }
}

/* De Google-toegang van één klant. Faalt zacht: geen agenda gekoppeld is geen
   fout, en Google plat mag een afzegging niet tegenhouden -- de afspraak hoort
   dan in Airtable wél weg te zijn. */
async function gcalVoor(projectCode) {
  try {
    if (!_gcal.isConfigured() || !projectCode || !envKlaar()) return { token: '', calId: 'primary' };
    const formule = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
    const r = await atFetch(atUrl(CLIENTS_TABLE, `?filterByFormula=${formule}&maxRecords=1`), { headers: atKop() });
    if (!r.ok) return { token: '', calId: 'primary' };
    const rec = ((await r.json()).records || [])[0];
    const enc = rec && rec.fields && (rec.fields.fldkYmK3jAabvytCF || rec.fields['Google Refresh Token']);
    if (!enc) return { token: '', calId: 'primary' };
    const refresh = _gcal.decryptToken(enc);
    if (!refresh) return { token: '', calId: 'primary' };
    return {
      token: await _gcal.getAccessToken(refresh),
      calId: rec.fields.fldWBxxhGYEZNIMqA || rec.fields['Google Calendar ID'] || 'primary',
    };
  } catch (err) {
    console.error('[afspraken] gcal-toegang mislukt:', err && err.message);
    return { token: '', calId: 'primary' };
  }
}

/* De twee vlaggen op de lead terugzetten.

   Allebei, en niet alleen de eerste. "Appointment Booked" is wat de pipeline en
   de win rate lezen; "Booking Link Sent" is de rem in api/whatsapp.js die zorgt
   dat er niet twee keer geboekt wordt. Blijft die tweede staan na een
   afzegging, dan slaat de boekingscode voorgoed over en kan deze lead nooit
   meer een nieuwe afspraak maken in het gesprek. */
async function wisLeadVlaggen(leadIds) {
  const ids = (Array.isArray(leadIds) ? leadIds : [leadIds]).filter(Boolean);
  if (!ids.length || !envKlaar()) return;
  for (const id of ids) {
    try {
      await atFetch(atUrl(LEADS_TABLE, `/${id}`), {
        method: 'PATCH',
        headers: atKop({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fields: { [LEAD_AFSPRAAK_GEBOEKT]: false, [LEAD_BOEKING_VERSTUURD]: false },
          typecast: true,
        }),
      });
    } catch (err) {
      // De afspraak zelf is al afgezegd; dit mag dat niet ongedaan laten lijken.
      console.error('[afspraken] leadvlaggen wissen mislukt:', err && err.message);
    }
  }
}

function metNotitie(bestaand, regel) {
  const oud = String(bestaand || '').trim();
  const nieuw = `[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${regel}`;
  return (oud ? `${oud}\n${nieuw}` : nieuw).slice(0, 2000);
}

/**
 * Een afspraak afzeggen: overal.
 *
 * Volgorde is niet willekeurig. Airtable eerst, want dat is de bron waar de
 * herinneringscron op filtert -- lukt die niet, dan is er niets afgezegd en
 * hoort de aanroeper dat te weten. Google en de leadvlaggen daarna, best-effort:
 * die mogen een geslaagde afzegging niet als mislukt laten lezen.
 *
 * @param {object} opts
 * @param {string} opts.projectCode  uit de sessie
 * @param {string} [opts.id]         record-id van de afspraak
 * @param {object} [opts.record]     of het record zelf, als je het al hebt
 * @param {string} [opts.reden]      wat de lead zei, kort
 * @param {string} [opts.door]       'lead' | 'makelaar' | 'ai'
 * @returns {Promise<{ok:boolean, reden?:string, afspraak?:object, googleWeg?:boolean}>}
 */
async function annuleer({ projectCode, id, record, reden, door } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return { ok: false, reden: 'geen_tenant' };
  if (!envKlaar()) return { ok: false, reden: 'niet_geconfigureerd' };

  const rec = record && record.fields ? record : await leesEigen(code, id);
  if (!rec) return { ok: false, reden: 'niet_gevonden' };
  if (rec.fields[F.CODE] !== code) return { ok: false, reden: 'andere_tenant' };
  if (rec.fields[F.STATUS] === STATUS.GEANNULEERD) {
    // Twee keer afzeggen is geen fout. Een lead die "sorry, ik kan echt niet"
    // stuurt nadat hij al afgezegd heeft, hoort geen storing te zien.
    return { ok: true, afspraak: rec, alAfgezegd: true };
  }

  const wie = door === 'lead' ? 'de lead' : door === 'makelaar' ? 'de makelaar' : 'de AI';
  const notitie = `Afgezegd door ${wie}${reden ? `: ${String(reden).slice(0, 300)}` : '.'}`;

  try {
    const r = await atFetch(atUrl(APPOINTMENTS_TABLE, `/${rec.id}`), {
      method: 'PATCH',
      headers: atKop({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fields: {
          [F.STATUS]: STATUS.GEANNULEERD,
          [F.NOTITIES]: metNotitie(rec.fields[F.NOTITIES], notitie),
        },
        typecast: true,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error(`[afspraken] annuleren mislukt (HTTP ${r.status}):`, t.slice(0, 300));
      return { ok: false, reden: 'airtable_fout' };
    }
  } catch (err) {
    console.error('[afspraken] annuleren exception:', err && err.message);
    return { ok: false, reden: 'airtable_fout' };
  }

  let googleWeg = false;
  const eventId = rec.fields[F.EVENT];
  if (eventId) {
    try {
      const { token, calId } = await gcalVoor(code);
      if (token) {
        const uit = await _gcal.deleteEvent(token, calId, eventId);
        googleWeg = Boolean(uit && uit.ok);
        if (!googleWeg) console.error('[afspraken] Google-item niet verwijderd:', uit && uit.error);
      }
    } catch (err) {
      console.error('[afspraken] Google-item verwijderen exception:', err && err.message);
    }
  }

  await wisLeadVlaggen(rec.fields[F.LEAD]);

  return { ok: true, afspraak: rec, googleWeg };
}

/**
 * Een afspraak verzetten naar een nieuw moment.
 *
 * "Reminder Sent" gaat bewust weer uit: de herinnering van cron-followup.js
 * filtert daarop, en zonder dit hoort de lead nooit iets over de NIEUWE tijd.
 * Een tweede herinnering voor een echt verzette afspraak is juist gedrag.
 */
async function verzet({ projectCode, id, record, startISO, durationMin } = {}) {
  const code = String(projectCode || '').trim();
  if (!code) return { ok: false, reden: 'geen_tenant' };
  if (!envKlaar()) return { ok: false, reden: 'niet_geconfigureerd' };

  const start = Date.parse(startISO);
  if (!Number.isFinite(start)) return { ok: false, reden: 'ongeldige_tijd' };

  const rec = record && record.fields ? record : await leesEigen(code, id);
  if (!rec) return { ok: false, reden: 'niet_gevonden' };
  if (rec.fields[F.CODE] !== code) return { ok: false, reden: 'andere_tenant' };

  const duur = Math.max(15, Math.min(480, Number(durationMin) || Number(rec.fields[F.DUUR]) || 30));
  const nieuweStart = new Date(start).toISOString();

  try {
    const r = await atFetch(atUrl(APPOINTMENTS_TABLE, `/${rec.id}`), {
      method: 'PATCH',
      headers: atKop({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        fields: {
          [F.START]: nieuweStart,
          [F.DUUR]: duur,
          [F.STATUS]: STATUS.GEBOEKT,
          [F.HERINNERING]: false,
          [F.NOTITIES]: metNotitie(rec.fields[F.NOTITIES], `Verzet naar ${nieuweStart}.`),
        },
        typecast: true,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error(`[afspraken] verzetten mislukt (HTTP ${r.status}):`, t.slice(0, 300));
      return { ok: false, reden: 'airtable_fout' };
    }
  } catch (err) {
    console.error('[afspraken] verzetten exception:', err && err.message);
    return { ok: false, reden: 'airtable_fout' };
  }

  const eventId = rec.fields[F.EVENT];
  if (eventId) {
    try {
      const { token, calId } = await gcalVoor(code);
      if (token) {
        const uit = await _gcal.updateEvent(token, calId, eventId, {
          summary:     `Afspraak: ${rec.fields[F.NAAM] || 'lead'} (Helvaro)`,
          description: `Telefoon: ${rec.fields[F.TEL] || ''}\nProject: ${code}`,
          startISO:    nieuweStart,
          durationMin: duur,
        });
        if (!uit || !uit.ok) console.error('[afspraken] Google-item niet verzet:', uit && uit.error);
      }
    } catch (err) {
      console.error('[afspraken] Google-item verzetten exception:', err && err.message);
    }
  }

  return { ok: true, afspraak: rec, startISO: nieuweStart, durationMin: duur };
}

module.exports = {
  F, STATUS, APPOINTMENTS_TABLE,
  komendeVoorLead, zoekOpEvent, leesEigen, annuleer, verzet, wisLeadVlaggen,
  telSleutel, gcalVoor,
};
