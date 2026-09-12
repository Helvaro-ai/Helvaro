'use strict';
/*
 * Het overzicht voor de dealer-startpagina -- "wat vraagt vandaag aandacht".
 *
 * ── Waarom dit bestaat ────────────────────────────────────────────────────
 * Een verkoper heeft geen tijd om zelf door dertig leads, tien voertuigen en
 * de agenda te bladeren om te ontdekken wie hij moet bellen. Dit bestand
 * rekent dat elke keer opnieuw uit vanuit de bestaande fundamentmodules --
 * niets wordt hier opgeslagen, alles is afgeleid van wat er NU staat.
 *
 * ── Zuivere orkestratie, fail-soft per sectie ────────────────────────────
 * Net als api/_dealer-boeking.js: geen eigen beslissingen over score,
 * koopsignalen of boekbaarheid -- die liggen al vast in api/_leadscore.js,
 * api/_koop.js, api/_wens.js en api/_vehicles.js. Een storing bij het lezen
 * van de afspraken mag de rest niet meeslepen: de UI toont dan liever
 * "afspraken niet geladen" (via `waarschuwingen`) dan een vals gerusstellende
 * nul.
 *
 * ── Aannames ──────────────────────────────────────────────────────────────
 * Geen Airtable-veld voor "verkocht aan DEZE lead" of "dit was een proefrit".
 * Beide funnel-stappen zijn dus afgeleid: verkocht uit het voertuig waar de
 * lead interesse in had (blob.property) dat nu status 'verkocht' heeft,
 * proefrit uit koop.afspraak (api/_koop.js) plus de "verschenen"-vlag die de
 * verkoper zelf zet. Een benadering, de minst ingrijpende keuze zonder een
 * nieuw Airtable-veld aan te maken.
 *
 * ── Tenant, altijd. Geen route ────────────────────────────────────────────
 * `bereken` neemt projectCode als eerste argument; elke onderliggende lezing
 * filtert er zelf ook op. Onderstreepje voorop.
 */

const _leadsRead = require('./_leads-read');
const _vehicles = require('./_vehicles');
const _leadscore = require('./_leadscore');
const _koop = require('./_koop');
const _wens = require('./_wens');

const APPOINTMENTS_TABLE = 'tblD058vEITs1xYFc';

const F = Object.freeze({
  APPT_ID: 'Appointment ID',
  START: 'Start Time',
  CODE: 'Project Code',
  STATUS: 'Status',
  VOERTUIG: 'Vehicle Code',
  TYPE: 'Appointment Type',
  NAAM: 'Lead Name',
  LEAD: 'Lead',
});

function configured() {
  return Boolean(process.env.API_AIRTABLE && process.env.BASE_AIRTABLE);
}

/* Backslash EERST, dan het aanhalingsteken -- andersom escape je je eigen
   escape-teken weer weg. Eigen kopie, net als in elk ander bestand hier. */
function escapeFormula(v) {
  return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function atFetch(url, opts) {
  const r = await fetch(url, opts);
  if (r.status !== 429) return r;
  await new Promise((res) => setTimeout(res, 900 + Math.random() * 300));
  return fetch(url, opts);
}

/* Brussel-dagstring, zelfde reden als api/_leadscore.js brusselsDagStr: een
   afspraak om 01:30 lokale tijd hoort niet als "morgen" te tellen omdat de
   server op UTC draait. */
function brusselsDagStr(datum) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(datum);
  } catch (_) {
    return datum.toISOString().slice(0, 10);
  }
}

/* Kleine, tenant-gefilterde lezing van Appointments binnen een venster.
   `null` bij een leesfout (te onderscheiden van "geen afspraken"), `[]` bij
   een echt lege uitkomst. Eén pagina van 100 volstaat ruim voor één dealer. */
async function leesAfspraken(projectCode, vanafISO, totISO) {
  const tenant = String(projectCode || '').trim();
  if (!tenant || !configured()) return [];
  try {
    const formule = encodeURIComponent(
      `AND({${F.CODE}}="${escapeFormula(tenant)}", IS_AFTER({${F.START}}, "${vanafISO}"), IS_BEFORE({${F.START}}, "${totISO}"))`
    );
    const r = await atFetch(
      `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${APPOINTMENTS_TABLE}`
      + `?filterByFormula=${formule}&pageSize=100`
      + `&sort%5B0%5D%5Bfield%5D=${encodeURIComponent(F.START)}&sort%5B0%5D%5Bdirection%5D=asc`,
      { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } }
    );
    if (!r.ok) {
      console.warn('[dealer-overzicht] afspraken lezen mislukt:', r.status);
      return null;
    }
    const d = await r.json();
    const uit = [];
    for (const rec of (d.records || [])) {
      const f = rec.fields || {};
      /* De formule filtert al op tenant. Nog een keer, zoals overal hier. */
      if (String(f[F.CODE] || '').trim() !== tenant) continue;
      uit.push({
        apptId: String(f[F.APPT_ID] || ''),
        startISO: String(f[F.START] || ''),
        status: String(f[F.STATUS] || ''),
        type: String(f[F.TYPE] || ''),
        voertuigCode: f[F.VOERTUIG] ? _vehicles.normCode(f[F.VOERTUIG]) : '',
        leadNaam: String(f[F.NAAM] || ''),
        leadIds: Array.isArray(f[F.LEAD]) ? f[F.LEAD] : [],
      });
    }
    return uit;
  } catch (e) {
    console.warn('[dealer-overzicht] afspraken exception:', e && e.message);
    return null;
  }
}

function laatste4(tel) {
  const cijfers = String(tel || '').replace(/\D/g, '');
  return cijfers ? cijfers.slice(-4) : undefined;
}

/* Laatste contactmoment: jongste ts in Conversation History (beide
   richtingen -- "is het hier stil", niet wie het laatst schreef). Zonder
   bruikbare geschiedenis valt dit terug op de aanmaakdatum. */
function laatsteContactMs(lead) {
  try {
    const historie = JSON.parse(lead.gesprek || '[]');
    let max = null;
    if (Array.isArray(historie)) {
      for (const m of historie) {
        if (m && typeof m.ts === 'number' && (max === null || m.ts > max)) max = m.ts;
      }
    }
    if (max !== null) return max;
  } catch (_) { /* geen bruikbare geschiedenis */ }
  const created = Date.parse(lead.datum);
  return Number.isFinite(created) ? created : null;
}

function verschenenUitNotities(raw) {
  const t = String(raw || '').trim();
  if (!t.startsWith('{')) return false;
  try {
    const d = JSON.parse(t);
    return !!(d.afspraak && d.afspraak.verschenen === true);
  } catch (_) { return false; }
}

function heeftVerlorenBlob(raw) {
  const t = String(raw || '').trim();
  if (!t.startsWith('{')) return false;
  try {
    const d = JSON.parse(t);
    return !!(d.verloren && typeof d.verloren === 'object');
  } catch (_) { return false; }
}

function pct(n, totaal) {
  return totaal > 0 ? Math.round((n / totaal) * 1000) / 10 : 0;
}

function leegResultaat(nu, waarschuwingen) {
  return {
    vandaag: { hot: 0, warm: 0, afsprakenVandaag: 0, voertuigConflicten: 0, wachtOpOpvolging: 0, financieringKlaar: 0, oudeLeadsMatch: 0 },
    prioriteit: [],
    afsprakenVandaag: [],
    voertuigConflicten: [],
    opvolging: [],
    inventarisMatches: [],
    funnel: { leads: 0, gekwalificeerd: 0, afspraakGevraagd: 0, geboekt: 0, verschenen: 0, proefrit: 0, verkocht: 0, verloren: 0, percentages: null, voldoende: false },
    berekendOp: nu.toISOString(),
    waarschuwingen: waarschuwingen || [],
  };
}

/**
 * Het dagoverzicht van één dealer. Rekent nooit iets uit dat niet uit
 * bestaande data komt, en faalt per sectie in plaats van in zijn geheel.
 *
 * @param {string} projectCode  uit de geverifieerde sessie
 * @param {{nu?: Date}} [opts]  `nu` is injecteerbaar voor testbaarheid
 */
async function bereken(projectCode, opts = {}) {
  const tenant = String(projectCode || '').trim();
  const nu = (opts && opts.nu instanceof Date && !Number.isNaN(opts.nu.getTime())) ? opts.nu : new Date();
  if (!tenant) return leegResultaat(nu, ['tenant']);

  const waarschuwingen = [];

  let leads = [];
  try {
    const { leads: opgehaald } = await _leadsRead.fetchLeads(tenant, {
      token: process.env.API_AIRTABLE, baseId: process.env.BASE_AIRTABLE, maxPages: 6,
    });
    /* fetchLeads filtert al op tenant; nog een keer in JS, riem en bretels. */
    leads = (opgehaald || []).filter((l) => !l.projectCode || l.projectCode === tenant);
  } catch (e) {
    console.warn('[dealer-overzicht] leads lezen mislukt:', e && e.message);
    waarschuwingen.push('leads');
  }

  let voorraad = [];
  try {
    voorraad = await _vehicles.list(tenant);
  } catch (e) {
    console.warn('[dealer-overzicht] voorraad lezen mislukt:', e && e.message);
    waarschuwingen.push('voertuigen');
  }

  const vanaf = new Date(nu.getTime() - 14 * 86400000).toISOString();
  const tot = new Date(nu.getTime() + 90 * 86400000).toISOString();
  const afsprakenRuw = await leesAfspraken(tenant, vanaf, tot);
  const appointments = afsprakenRuw === null ? [] : afsprakenRuw;
  if (afsprakenRuw === null) waarschuwingen.push('afspraken');

  const nuMs = nu.getTime();
  const vandaagStr = brusselsDagStr(nu);
  const voertuigByCode = new Map(voorraad.map((v) => [v.code, v]));

  /* Afspraken groeperen: per lead, per voertuig, en wat er vandaag speelt. */
  const apptByLead = new Map();
  const apptByVehicle = new Map();
  const afsprakenVandaagRuw = [];
  for (const a of appointments) {
    for (const lid of a.leadIds) {
      if (!apptByLead.has(lid)) apptByLead.set(lid, []);
      apptByLead.get(lid).push(a);
    }
    if (a.voertuigCode) {
      if (!apptByVehicle.has(a.voertuigCode)) apptByVehicle.set(a.voertuigCode, []);
      apptByVehicle.get(a.voertuigCode).push(a);
    }
    if (a.status !== 'cancelled' && a.startISO && brusselsDagStr(new Date(a.startISO)) === vandaagStr) {
      afsprakenVandaagRuw.push(a);
    }
  }
  for (const lijst of apptByLead.values()) lijst.sort((x, y) => x.startISO.localeCompare(y.startISO));
  afsprakenVandaagRuw.sort((x, y) => x.startISO.localeCompare(y.startISO));

  function heeftGeboektInDeToekomst(leadId) {
    return (apptByLead.get(leadId) || []).some((a) => a.status === 'booked' && Date.parse(a.startISO) > nuMs);
  }

  /* Score en koopinfo per lead, één keer uitgerekend. */
  const scoreByLead = new Map();
  const koopByLead = new Map();
  for (const lead of leads) {
    scoreByLead.set(lead.id, _leadscore.uitNotities(lead.notities));
    koopByLead.set(lead.id, _koop.uitNotities(lead.notities));
  }

  /* Interesse per voertuig: hoeveel leads noemen deze code (blob.property). */
  const interesseByVehicle = new Map();
  for (const lead of leads) {
    const code = lead.property ? _vehicles.normCode(lead.property) : '';
    if (!code) continue;
    if (!interesseByVehicle.has(code)) interesseByVehicle.set(code, { totaal: 0, hot: 0 });
    const info = interesseByVehicle.get(code);
    info.totaal += 1;
    const sc = scoreByLead.get(lead.id);
    if (sc && sc.temperatuur === 'hot') info.hot += 1;
  }

  /* ── vandaag / hot / warm ────────────────────────────────────────────── */
  let hot = 0, warm = 0;
  for (const sc of scoreByLead.values()) {
    if (sc && sc.temperatuur === 'hot') hot += 1;
    else if (sc && sc.temperatuur === 'warm') warm += 1;
  }

  /* ── voertuigConflicten ──────────────────────────────────────────────── */
  const voertuigConflicten = [];
  for (const [code, info] of interesseByVehicle) {
    const actieveAppts = (apptByVehicle.get(code) || []).filter((a) => a.status === 'booked' && Date.parse(a.startISO) > nuMs);
    const conflict = info.totaal >= 2 || (actieveAppts.length > 0 && info.totaal >= 1);
    if (!conflict) continue;
    const v = voertuigByCode.get(code);
    voertuigConflicten.push({ code, naam: v ? _vehicles.naam(v) : code, aantalLeads: info.totaal });
  }
  voertuigConflicten.sort((a, b) => (b.aantalLeads - a.aantalLeads) || a.code.localeCompare(b.code));

  /* ── opvolging ───────────────────────────────────────────────────────── */
  const opvolging = [];
  const gezienLeadIds = new Set();
  for (const lead of leads) {
    if (lead.status === 'completed' || lead.status === 'verloren') continue;
    if (heeftGeboektInDeToekomst(lead.id)) continue;
    const laatsteMs = laatsteContactMs(lead);
    if (laatsteMs === null) continue;
    if (nuMs - laatsteMs > 48 * 3600 * 1000) {
      opvolging.push({ leadId: lead.id, naam: lead.naam || '', sinds: new Date(laatsteMs).toISOString(), reden: 'stil' });
      gezienLeadIds.add(lead.id);
    }
  }
  const leadsById = new Map(leads.map((l) => [l.id, l]));
  const cutoffMs = nuMs - 14 * 86400000;
  for (const a of appointments) {
    if (a.status !== 'no_show' && a.status !== 'cancelled') continue;
    const startMs = Date.parse(a.startISO);
    if (!Number.isFinite(startMs) || startMs < cutoffMs) continue;
    for (const lid of a.leadIds) {
      if (gezienLeadIds.has(lid)) continue;
      const nieuweBoeking = (apptByLead.get(lid) || []).some((x) => x.status === 'booked' && Date.parse(x.startISO) > startMs);
      if (nieuweBoeking) continue;
      const leadObj = leadsById.get(lid);
      opvolging.push({
        leadId: lid,
        naam: (leadObj && leadObj.naam) || a.leadNaam || '',
        sinds: a.startISO,
        reden: a.status === 'no_show' ? 'no_show' : 'geannuleerd',
      });
      gezienLeadIds.add(lid);
    }
  }

  /* ── financieringKlaar ───────────────────────────────────────────────── */
  let financieringKlaar = 0;
  for (const lead of leads) {
    const koop = koopByLead.get(lead.id);
    if (!koop) continue;
    if ((koop.financiering === 'goedgekeurd' || koop.financiering === 'cash') && !heeftGeboektInDeToekomst(lead.id)) {
      financieringKlaar += 1;
    }
  }

  /* ── inventarisMatches: nieuwe voorraad die bij oude leads past ───────── */
  const dertigDagenMs = nuMs - 30 * 86400000;
  const inventarisMatches = [];
  for (const v of voorraad) {
    if (v.gearchiveerd) continue;
    const aangemaaktMs = Date.parse(v.aangemaakt);
    if (!Number.isFinite(aangemaaktMs) || aangemaaktMs < dertigDagenMs) continue;
    const actief = (apptByVehicle.get(v.code) || []).filter((a) => a.status === 'booked' && Date.parse(a.startISO) > nuMs);
    if (!_vehicles.boekbaar(v, actief).ok) continue;
    let matches = [];
    try { matches = _wens.matchLeads(leads, v, {}); } catch (_) { matches = []; }
    if (matches.length >= 1) inventarisMatches.push({ code: v.code, naam: _vehicles.naam(v), aantal: matches.length });
  }
  inventarisMatches.sort((a, b) => (b.aantal - a.aantal) || a.code.localeCompare(b.code));
  inventarisMatches.splice(10);

  /* ── prioriteit ──────────────────────────────────────────────────────── */
  const kandidaten = [];
  for (const lead of leads) {
    const scoreRaw = scoreByLead.get(lead.id);
    const koopInfo = koopByLead.get(lead.id);
    const gekozenAppt = (apptByLead.get(lead.id) || []).find((a) => a.status === 'booked') || null;
    if (!(scoreRaw && scoreRaw.punten > 0) && !gekozenAppt) continue;

    const voertuigCode = lead.property ? _vehicles.normCode(lead.property) : '';
    const voertuig = voertuigCode ? voertuigByCode.get(voertuigCode) : null;
    const apptVandaag = !!(gekozenAppt && brusselsDagStr(new Date(gekozenAppt.startISO)) === vandaagStr);
    const score = scoreRaw ? scoreRaw.punten : 0;

    const item = {
      leadId: lead.id,
      naam: lead.naam || '',
      score,
      temperatuur: scoreRaw ? scoreRaw.temperatuur : 'cold',
      voertuigCode: voertuigCode || '',
      voertuigNaam: voertuig ? _vehicles.naam(voertuig) : '',
      afspraak: gekozenAppt ? { startISO: gekozenAppt.startISO, type: gekozenAppt.type || '', status: gekozenAppt.status } : null,
      actie: _leadscore.volgendeActie({
        score,
        afspraak: gekozenAppt ? { startISO: gekozenAppt.startISO, status: gekozenAppt.status } : undefined,
        voertuigStatus: voertuig ? voertuig.status : '',
        laatsteContactISO: (() => { const ms = laatsteContactMs(lead); return ms !== null ? new Date(ms).toISOString() : undefined; })(),
        koop: koopInfo || undefined,
        nu,
      }),
      redenen: scoreRaw ? scoreRaw.redenen : [],
    };
    const tel4 = laatste4(lead.telefoon);
    if (tel4) item.telefoonLaatste4 = tel4;

    kandidaten.push({ item, apptVandaag, score });
  }
  kandidaten.sort((a, b) => {
    if (a.apptVandaag !== b.apptVandaag) return a.apptVandaag ? -1 : 1;
    return b.score - a.score;
  });
  const prioriteit = kandidaten.slice(0, 8).map((k) => k.item);

  /* ── funnel ──────────────────────────────────────────────────────────── */
  const leadsTotal = leads.length;
  const gekwalificeerd = leads.filter((l) => l.qualified === true).length;
  const geboekt = leads.filter((l) => l.afspraakGeboekt === true).length;
  const afspraakGevraagd = leads.filter((l) => l.afspraakGeboekt === true || !!(koopByLead.get(l.id) && koopByLead.get(l.id).afspraak)).length;
  const verschenen = leads.filter((l) => verschenenUitNotities(l.notities)).length;
  const proefrit = leads.filter((l) => {
    const k = koopByLead.get(l.id);
    return !!(k && k.afspraak === 'proefrit' && verschenenUitNotities(l.notities));
  }).length;
  let verkocht = 0;
  for (const lead of leads) {
    const code = lead.property ? _vehicles.normCode(lead.property) : '';
    const v = code ? voertuigByCode.get(code) : null;
    if (v && _vehicles.normStatus(v.status) === 'verkocht') verkocht += 1;
  }
  const verloren = leads.filter((l) => l.status === 'verloren' || heeftVerlorenBlob(l.notities)).length;
  const voldoende = leadsTotal >= 10;
  const funnel = {
    leads: leadsTotal, gekwalificeerd, afspraakGevraagd, geboekt, verschenen, proefrit, verkocht, verloren,
    percentages: voldoende ? {
      gekwalificeerd: pct(gekwalificeerd, leadsTotal),
      afspraakGevraagd: pct(afspraakGevraagd, leadsTotal),
      geboekt: pct(geboekt, leadsTotal),
      verschenen: pct(verschenen, leadsTotal),
      proefrit: pct(proefrit, leadsTotal),
      verkocht: pct(verkocht, leadsTotal),
      verloren: pct(verloren, leadsTotal),
    } : null,
    voldoende,
  };

  return {
    vandaag: {
      hot, warm,
      afsprakenVandaag: afsprakenVandaagRuw.length,
      voertuigConflicten: voertuigConflicten.length,
      wachtOpOpvolging: opvolging.length,
      financieringKlaar,
      oudeLeadsMatch: inventarisMatches.reduce((som, m) => som + m.aantal, 0),
    },
    prioriteit,
    afsprakenVandaag: afsprakenVandaagRuw.map((a) => ({
      apptId: a.apptId,
      startISO: a.startISO,
      type: a.type,
      leadNaam: a.leadNaam,
      voertuigCode: a.voertuigCode,
      voertuigNaam: a.voertuigCode && voertuigByCode.has(a.voertuigCode) ? _vehicles.naam(voertuigByCode.get(a.voertuigCode)) : '',
      status: a.status,
    })),
    voertuigConflicten,
    opvolging,
    inventarisMatches,
    funnel,
    berekendOp: nu.toISOString(),
    waarschuwingen,
  };
}

module.exports = {
  F,
  APPOINTMENTS_TABLE,
  bereken,
};
