'use strict';
/*
 * Boeken vanuit de websiteassistent.
 *
 * ── Alleen echte vrije momenten ─────────────────────────────────────────────
 * De bezoeker kiest uit momenten die deze module zelf voorstelt: binnen de
 * openingsuren van de dealer ('Working Hours', zelfde notatie als WhatsApp:
 * 'ma-vr 9-18'), zonder een bestaande afspraak in Helvaro, en -- als de
 * agenda gekoppeld is -- zonder bezet blok in Google Agenda. Een tijdstip dat
 * NIET in die lijst staat, wordt geweigerd: de browser kan geen willekeurig
 * moment boeken.
 *
 * ── Dezelfde poort als overal ───────────────────────────────────────────────
 * Het voertuig gaat door api/_dealer-boeking.js controleer() (vers gelezen,
 * geen dubbele afspraak voor dezelfde lead, reservering/verkocht = nee), net
 * als in het dashboard en in WhatsApp. Daarna naAanmaak() voor het slot op de
 * wagen en het logboek.
 *
 * ── Alleen met contactgegevens ──────────────────────────────────────────────
 * Een boeking hoort bij een lead: eerst het contactkaartje (e-mail of
 * telefoon), dan pas een moment. Zo kan het team altijd bevestigen of
 * verzetten.
 */

const _afspraken = require('./_afspraken');
const _gcal = require('./_gcal');

const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';
const TZ = 'Europe/Brussels';
const DUUR_MIN = 30;
const STANDAARD_UREN = 'ma-za 9-18';

function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
async function at(pad, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pad}`, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${process.env.API_AIRTABLE}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

class BoekFout extends Error {
  constructor(msg, code, status) { super(msg); this.code = code; this.status = status || 409; }
}

/* ── Openingsuren (puur) ───────────────────────────────────────────────── */
const DAGEN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ALIAS = { ma: 'mon', di: 'tue', wo: 'wed', do: 'thu', vr: 'fri', za: 'sat', zo: 'sun',
  lun: 'mon', mar: 'tue', mer: 'wed', jeu: 'thu', ven: 'fri', sam: 'sat', dim: 'sun' };
function dag(d) { const l = String(d).toLowerCase(); return DAGEN.indexOf(ALIAS[l] || ALIAS[l.slice(0, 3)] || l.slice(0, 3)); }

/** 'ma-vr 9-18' -> { van:1, tot:5, begin:9, eind:18 }; onleesbaar -> null. */
function parseUren(spec) {
  const m = String(spec || '').toLowerCase().trim().match(/^([a-z]+)\s*[-–]\s*([a-z]+)\s+(\d{1,2})(?::(\d{2}))?\s*[-–]\s*(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const van = dag(m[1]), tot = dag(m[2]);
  if (van < 0 || tot < 0) return null;
  return { van, tot, begin: Number(m[3]) + (m[4] ? Number(m[4]) / 60 : 0), eind: Number(m[5]) + (m[6] ? Number(m[6]) / 60 : 0) };
}

/** Datum-onderdelen van een moment in Brussel. */
function brussel(ms) {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms)).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  return { j: Number(p.year), m: Number(p.month), d: Number(p.day), wd: DAGEN.indexOf(String(p.weekday).toLowerCase().slice(0, 3)), u: Number(p.hour) % 24 };
}

/**
 * Kandidaat-momenten: elk heel uur binnen de openingsuren, vanaf `minVoor`
 * minuten na nu, over `dagen` dagen. Puur (nu is een parameter).
 */
function kandidaten(spec, { nu = Date.now(), dagen = 7, minVoor = 120, duur = DUUR_MIN } = {}) {
  const uren = parseUren(spec) || parseUren(STANDAARD_UREN);
  const uit = [];
  for (let i = 0; i <= dagen; i++) {
    const b = brussel(nu + i * 864e5);
    const inRange = uren.van <= uren.tot ? (b.wd >= uren.van && b.wd <= uren.tot) : (b.wd >= uren.van || b.wd <= uren.tot);
    if (!inRange) continue;
    for (let h = Math.ceil(uren.begin); h + duur / 60 <= uren.eind; h++) {
      const naief = `${b.j}-${String(b.m).padStart(2, '0')}-${String(b.d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`;
      const iso = _afspraken.corrigeerNaarBrusselseTijd(naief, TZ);
      const ms = Date.parse(iso);
      if (Number.isFinite(ms) && ms >= nu + minVoor * 60000) uit.push(new Date(ms).toISOString());
    }
  }
  return uit;
}

function overlapt(startMs, duur, blokken) {
  const eind = startMs + duur * 60000;
  return (blokken || []).some((b) => startMs < Date.parse(b.end) && eind > Date.parse(b.start));
}

/* ── Vrije momenten ────────────────────────────────────────────────────── */

async function klantVelden(projectCode) {
  const formule = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
  const r = await at(`tblPidTrwGRzRt4LZ?filterByFormula=${formule}&maxRecords=1`);
  if (!r.ok) return {};
  const rec = ((await r.json()).records || [])[0];
  return (rec && rec.fields) || {};
}

/**
 * @returns {Promise<{momenten:string[], agenda:boolean}>} hoogstens `max`,
 *   gespreid over de dagen (eerste vrije per dagdeel).
 */
async function vrijeMomenten(projectCode, { max = 8, nu = Date.now(), alle: allesTerug = false } = {}) {
  const t = String(projectCode || '').trim();
  const velden = await klantVelden(t);
  const spec = String(velden.fldq5oIqw5MG8fKhc || velden['Working Hours'] || '').trim();
  const alle = kandidaten(spec, { nu });
  if (!alle.length) return { momenten: [], agenda: false };
  const van = alle[0], tot = new Date(Date.parse(alle[alle.length - 1]) + DUUR_MIN * 60000).toISOString();

  /* Bestaande afspraken in Helvaro in dat venster. */
  let bestaande = [];
  try {
    const f = encodeURIComponent(`AND({Project Code}="${escapeFormula(t)}", IS_AFTER({Start Time}, "${new Date(Date.parse(van) - 4 * 3600e3).toISOString()}"), IS_BEFORE({Start Time}, "${tot}"))`);
    const r = await at(`${APPOINTMENTS_TABLE}?filterByFormula=${f}&pageSize=100`);
    if (r.ok) bestaande = (await r.json()).records || [];
  } catch (e) { bestaande = []; }

  /* Google Agenda: bezette blokken, of null als het niet te controleren viel.
     null = niet raden: dan tellen alleen de afspraken in Helvaro. */
  let bezet = [], agenda = false;
  try {
    const g = await _afspraken.gcalVoor(t);
    if (g.token) {
      const blokken = await _gcal.freeBusy(g.token, g.calId, van, tot);
      if (Array.isArray(blokken)) { bezet = blokken; agenda = true; }
    }
  } catch (e) { /* zonder agenda */ }

  const vrij = alle.filter((iso) => {
    const ms = Date.parse(iso);
    return !_afspraken.botsendeAfspraak(bestaande, ms, DUUR_MIN) && !overlapt(ms, DUUR_MIN, bezet);
  });
  /* Voor de boekingscontrole: ALLE vrije momenten, niet de gespreide selectie. */
  if (allesTerug) return { momenten: vrij, agenda };
  /* Spreiden: eerst één per dag (ochtend of middag), dan aanvullen. */
  const gekozen = [], dagGezien = new Set();
  for (const iso of vrij) {
    const b = brussel(Date.parse(iso)); const sleutel = `${b.j}-${b.m}-${b.d}-${b.u < 13 ? 'v' : 'n'}`;
    if (!dagGezien.has(sleutel)) { dagGezien.add(sleutel); gekozen.push(iso); }
    if (gekozen.length >= max) break;
  }
  return { momenten: gekozen.sort(), agenda };
}

/* ── Boeken ────────────────────────────────────────────────────────────── */

/**
 * @param {string} projectCode  uit de site key, nooit uit de browser
 * @param {{startISO, voertuigCode?, leadId, naam?, telefoon?, notitie?}} o
 */
async function boek(projectCode, o = {}) {
  const t = String(projectCode || '').trim();
  if (!o.leadId) throw new BoekFout('Laat eerst een e-mailadres of telefoonnummer achter.', 'geen_contact', 400);
  const start = new Date(o.startISO);
  if (isNaN(start.getTime())) throw new BoekFout('Ongeldig tijdstip.', 'bad_time', 400);

  /* Het gekozen moment moet NU nog vrij zijn -- opnieuw berekend, niet wat de
     browser ooit kreeg. */
  const { momenten } = await vrijeMomenten(t, { alle: true });
  if (momenten.indexOf(start.toISOString()) === -1) throw new BoekFout('Dat moment is intussen niet meer vrij. Kies een ander.', 'slot_bezet');

  const _vehicles = require('./_vehicles');
  const _dealerBoeking = require('./_dealer-boeking');
  let voertuig = null, apptId = '';
  if (o.voertuigCode) {
    voertuig = await _vehicles.getByCode(t, o.voertuigCode).catch(() => null);
    if (!voertuig) throw new BoekFout('Deze wagen staat niet meer in het aanbod.', 'vehicle_unavailable');
    const controle = await _dealerBoeking.controleer({ projectCode: t, voertuig, leadId: o.leadId, telefoon: o.telefoon || '', startISO: start.toISOString() });
    if (!controle.ok) {
      if (controle.reden === 'al_geboekt') return { ok: true, alGeboekt: true, startISO: start.toISOString() };
      if (controle.reden === 'lead_heeft_afspraak') throw new BoekFout('Je hebt al een afspraak staan; het team neemt contact op.', 'lead_has_appointment');
      throw new BoekFout('Deze wagen kan nu geen proefrit meer krijgen. Het team stelt een alternatief voor.', 'vehicle_unavailable');
    }
    apptId = controle.apptId;
  }
  if (!apptId) {
    const d = start;
    apptId = `${t}-${String(d.getUTCFullYear()).slice(-2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}`;
  }

  const fields = {
    'Appointment ID': apptId, 'Start Time': start.toISOString(), Duration: DUUR_MIN, 'Project Code': t,
    'Lead Name': String(o.naam || '').slice(0, 100), 'Lead Phone': String(o.telefoon || '').slice(0, 30),
    Status: 'booked', Source: 'website', Notes: String(o.notitie || 'Geboekt via de websiteassistent').slice(0, 2000),
    'Created At': new Date().toISOString(), Lead: [o.leadId],
  };
  if (voertuig) { fields['Vehicle Code'] = voertuig.code; fields['Appointment Type'] = 'proefrit'; }
  const r = await at(APPOINTMENTS_TABLE, { method: 'POST', body: { fields, typecast: true } });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.error('[webboeking] afspraak aanmaken mislukt', r.status, txt.slice(0, 200));
    throw new BoekFout('De afspraak kon niet bewaard worden. Probeer het zo opnieuw.', 'opslaan', 502);
  }
  const rec = await r.json();

  if (voertuig) {
    try { await _dealerBoeking.naAanmaak({ projectCode: t, voertuig, recordId: rec.id, apptId, leadId: o.leadId }); }
    catch (e) { console.warn('[webboeking] naAanmaak:', e && e.message); }
  }
  /* Google Agenda: best effort, net als het dashboard. */
  try {
    const g = await _afspraken.gcalVoor(t);
    if (g.token) {
      const ev = await _gcal.createEvent(g.token, g.calId, {
        summary: (voertuig ? 'Proefrit ' + _vehicles.naam(voertuig) : 'Afspraak') + (o.naam ? ' — ' + o.naam : '') + ' (Helvaro)',
        description: `Geboekt via de websiteassistent.\nTelefoon: ${o.telefoon || ''}`,
        startISO: start.toISOString(), durationMin: DUUR_MIN,
      });
      if (ev && ev.ok && ev.eventId) await at(`${APPOINTMENTS_TABLE}/${rec.id}`, { method: 'PATCH', body: { fields: { 'Google Event ID': ev.eventId } } }).catch(() => {});
    }
  } catch (e) { console.warn('[webboeking] agenda-afspraak overgeslagen:', e && e.message); }

  try {
    require('./_push').stuurVertaald({ projectCode: t, titelSleutel: 'push.web.boek.titel', tekstSleutel: 'push.web.boek.tekst',
      vars: { naam: String(o.naam || o.telefoon || '').slice(0, 60), wanneer: start.toLocaleString('nl-BE', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) },
      url: 'https://app.helvaro.pro/dashboard' }).catch(() => {});
  } catch (e) { /* melding is bijzaak */ }
  return { ok: true, startISO: start.toISOString(), apptId };
}

module.exports = { vrijeMomenten, boek, BoekFout, _test: { parseUren, kandidaten, overlapt, brussel } };
