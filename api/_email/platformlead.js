'use strict';
/*
 * Aanvragen van autoplatformen (AutoScout24, 2dehands/2ememain, Marktplaats,
 * mobile.de) die per e-mail binnenkomen, als lead die aan de juiste wagen hangt.
 *
 * ── Wat dit is ──────────────────────────────────────────────────────────────
 * De mailbox-sync (api/_email/mailbox.js) maakt van binnenkomende mail al
 * gesprekken en bij koopintentie een lead. Een platformmail valt daar tussendoor:
 * hij komt van een no-reply-adres van het platform (dus "automatisch"), de
 * koper staat in Reply-To of in de tekst, en de wagen staat als link in de
 * mail. Deze module herkent zo'n mail, haalt eruit wat er ECHT in staat, en
 * zoekt de wagen. De sync blijft de regisseur; hier staat alleen wat
 * platformspecifiek is.
 *
 * ── Wanneer is het een platformaanvraag ─────────────────────────────────────
 * Alleen als de AFZENDER van een platform is (registreerbaar domein exact
 * autoscout24.*, 2dehands.be, 2ememain.be, marktplaats.nl of mobile.de) EN er een
 * klantsignaal in staat: een antwoordadres (Reply-To of een duidelijke
 * "E-mail:"-regel), of een duidelijke "Naam:"- of telefoonregel. Zonder dat is
 * het een nieuwsbrief, een "uw advertentie verloopt"-melding of een bevestiging
 * van het platform, en blijft het gewone mail (de bestaande regels beslissen).
 * Een link naar een wagen van deze dealer is GEEN voorwaarde: zonder passende
 * link wordt het een lead van dat platform zonder wagen.
 *
 * ── De wagen: nooit gokken ──────────────────────────────────────────────────
 *   1. AutoScout24-aanbodlink -> api/_autoscout.js aanbodIdUit -> getByAutoscout
 *   2. een link die genormaliseerd gelijk is aan een advertentie-URL in
 *      vehicle_listings (api/_listings.js) van DEZE dealer
 *   3. een link die gelijk is aan het Listing URL (link) van een wagen van deze dealer
 * Alle links worden bekeken. Geen treffer, of links naar meerdere VERSCHILLENDE
 * wagens: geen wagen. Er
 * wordt nooit op merk of model uit de tekst geraden (dat doet de gewone mail wel).
 * Elke zoekopdracht krijgt de projectcode van de aanroeper mee; niets komt uit
 * de mail.
 *
 * ── Wat er uit de mail komt, en niets anders ────────────────────────────────
 *   email     Reply-To (ook een relay-adres van het platform), anders een
 *             duidelijke "E-mail:"-regel. Nooit een willekeurig adres uit de tekst.
 *   naam      alleen uit een regel "Naam:" / "Name:" / "Nom:"
 *   telefoon  alleen uit een duidelijke telefoonregel
 *   bericht   na een "Bericht:"-label, anders de hele (ontcitaatte) tekst
 * Het telefoonnummer gaat NIET in het telefoonveld van de lead maar in de
 * notitie: dat veld is het WhatsApp-nummer, en de opvolgcron stuurt een
 * WhatsApp-sjabloon naar elke 'nieuwe' lead mét nummer. Wie alleen per mail
 * schreef heeft daar geen toestemming voor gegeven.
 *
 * ── Eén open lead per persoon, afmelding ────────────────────────────────────
 * Bestaat er voor dit e-mailadres al een open lead bij deze dealer, dan wordt
 * die bijgewerkt (notitie, ontbrekende wagen) in plaats van een tweede te
 * maken. Staat er een lead van die persoon op afgemeld ('Opted Out'), dan komt
 * er geen lead bij, geen notitie en geen automatisch antwoord.
 *
 * Geen route: onderstreepje voorop.
 */

const _optout = require('../_optout');
const _autoscout = require('../_autoscout');

/* ── Platformen ──────────────────────────────────────────────────────────── */

/* provider = de sleutel in vehicle_listings en op de lead ('Listing Provider',
   zelfde ids als api/_voorraad-providers/index.js); bron = wat in 'Bron' komt.
   Het zijn merknamen en blijven dus in elke schermtaal zo staan (bronLabel in
   het dashboard vertaalt alleen de Nederlandse standaardwaarden). */
const PLATFORMEN = Object.freeze([
  { id: 'autoscout24', provider: 'autoscout24', bron: 'AutoScout24', domein: /^autoscout24\.[a-z]{2,3}$/ },
  { id: 'tweedehands', provider: 'tweedehands', bron: '2dehands', domein: /^2dehands\.be$/ },
  { id: 'tweedemain', provider: 'tweedehands', bron: '2ememain', domein: /^2ememain\.be$/ },
  { id: 'marktplaats', provider: 'marktplaats', bron: 'Marktplaats', domein: /^marktplaats\.nl$/ },
  { id: 'mobile_de', provider: 'mobile_de', bron: 'mobile.de', domein: /^mobile\.de$/ },
]);

/** Het registreerbare domein (laatste twee labels): mail.autoscout24.be -> autoscout24.be. */
function registreerbaar(host) {
  const delen = String(host || '').toLowerCase().replace(/\.+$/, '').split('.').filter(Boolean);
  return delen.length >= 2 ? delen.slice(-2).join('.') : delen.join('.');
}

function platformVanHost(host) {
  const d = registreerbaar(host);
  return PLATFORMEN.find((p) => p.domein.test(d)) || null;
}

/** Het platform van een afzenderadres, of null. Exact op het registreerbare domein. */
function platformVanAdres(adres) {
  const a = String(adres || '').trim().toLowerCase();
  const at = a.lastIndexOf('@');
  if (at < 1) return null;
  return platformVanHost(a.slice(at + 1));
}

/* ── Links ───────────────────────────────────────────────────────────────── */

/** Genormaliseerd: host zonder www, pad, zonder query/hash/slash, kleine letters. */
function kaal(u) {
  try {
    const x = new URL(String(u));
    if (!/^https?:$/.test(x.protocol)) return '';
    return (x.hostname.toLowerCase().replace(/^www\./, '') + x.pathname.replace(/\/+$/, '')).toLowerCase();
  } catch (_) { return ''; }
}

/**
 * Alle links in de mail: de hrefs uit de html (m.links), de links in de tekst, en
 * de bestemming achter een tracking-doorverwijzing (een queryparameter die zelf
 * een http(s)-adres is). Uniek, hoogstens 40.
 */
function linksVan(m) {
  const bron = [].concat(Array.isArray(m.links) ? m.links : [], _autoscout.linksUit(`${m.onderwerp || ''}\n${m.volledigeTekst || m.tekst || ''}`));
  const uit = [];
  const zie = new Set();
  const voeg = (l) => {
    const s = String(l || '').trim();
    if (!/^https?:\/\//i.test(s) || zie.has(s) || uit.length >= 40) return;
    zie.add(s); uit.push(s);
  };
  for (const l of bron) {
    voeg(l);
    try {
      for (const waarde of new URL(String(l)).searchParams.values()) if (/^https?:\/\//i.test(waarde)) voeg(waarde);
    } catch (_) { /* geen geldige URL: negeren */ }
  }
  return uit;
}

/* ── Contact uit de mail ─────────────────────────────────────────────────── */

const MAILADRES = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;
const GEEN_ANTWOORD = /^(no-?reply|noreply|do-?not-?reply|mailer-daemon|postmaster|bounce[s]?|notifications?|alerts?)([@+.-]|$)/i;

function eersteAdres(v) {
  const eerste = String(v || '').split(',')[0];
  const m = eerste.match(/<([^>]+)>/);
  return (m ? m[1] : eerste).trim().toLowerCase();
}

function bruikbaarAdres(a, eigen) {
  const s = String(a || '').trim().toLowerCase();
  if (!s || s.length > 254 || !MAILADRES.test(s)) return '';
  if (GEEN_ANTWOORD.test(s.split('@')[0])) return '';
  if (eigen && s === String(eigen).toLowerCase()) return '';
  return s;
}

const RE_MAIL = /^[ \t]*(?:e-?mail(?:adres)?|courriel|e-?mail-?adresse)[ \t]*[:：][ \t]*<?([^\s<>]+@[^\s<>]+)>?[ \t]*$/im;
const RE_NAAM = /^[ \t]*(?:naam|name|nom)[ \t]*[:：][ \t]*(.{2,100})$/im;
const RE_TEL = /^[ \t]*(?:telefoon(?:nummer)?|tel\.?|telefon(?:nummer)?|t[eé]l[eé]phone|phone|mobiel|gsm|mobile|handy)[ \t]*[:：][ \t]*(\+?[\d(][\d\s().\/-]{6,24})[ \t]*$/im;
const RE_BERICHT = /^[ \t]*(?:bericht|message|nachricht|vraag)[ \t]*[:：][ \t]*([\s\S]+)$/im;

function schoon(s) { return String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim(); }

function naamVan(tekst) {
  const m = RE_NAAM.exec(tekst);
  if (!m) return '';
  const n = schoon(m[1]).replace(/^[*_"']+|[*_"']+$/g, '').trim();
  /* Een adres, link of lege waarde is geen naam. */
  if (!n || /[@<>]|https?:|www\./i.test(n) || !/[a-zà-ÿ]/i.test(n)) return '';
  return n.slice(0, 100);
}

function telefoonVan(tekst) {
  const m = RE_TEL.exec(tekst);
  if (!m) return '';
  const cijfers = m[1].replace(/\D/g, '');
  return cijfers.length >= 8 && cijfers.length <= 15 ? schoon(m[1]).slice(0, 30) : '';
}

/**
 * Wat de mail zegt over de koper. Alleen wat er letterlijk staat.
 * @returns {{email:string, naam:string, telefoon:string, bericht:string}}
 */
function contactUit(m, eigenAdres) {
  const tekst = String(m.tekst || '');
  let email = bruikbaarAdres(m.antwoordAan ? eersteAdres(m.antwoordAan) : '', eigenAdres);
  if (!email) {
    const r = RE_MAIL.exec(tekst);
    email = r ? bruikbaarAdres(r[1], eigenAdres) : '';
  }
  const b = RE_BERICHT.exec(tekst);
  const bericht = (b ? b[1] : tekst).replace(/\r\n/g, '\n').trim().slice(0, 2000);
  return { email, naam: naamVan(tekst), telefoon: telefoonVan(tekst), bericht };
}

/**
 * Is dit een aanvraag van een autoplatform? Zuivere functie, geen netwerk.
 * @returns {null | {platform, contact, links}}  null = gewone mail
 */
function herken(m, { eigenAdres = '' } = {}) {
  if (!m) return null;
  const platform = platformVanAdres(m.vanAdres);
  if (!platform) return null;
  const contact = contactUit(m, eigenAdres);
  /* Het klantsignaal: zonder dit is het platformpost, geen koper. */
  if (!contact.email && !contact.naam && !contact.telefoon) return null;
  return { platform, contact, links: linksVan(m) };
}

/**
 * De classificatie voor een platformaanvraag. De gewone regels (api/_email/
 * index.js analyseer) blijven gelden voor wat NOOIT een lead is: eigen mail,
 * automatische antwoorden, facturen en de lusbewaking. Wat zij "nieuwsbrief"
 * of "overig" noemen (het platform zet vaak een List-Unsubscribe op zijn
 * meldingen; een koop-loze eerste zin is geen reden om een koper te negeren) is
 * hier een lead -- want het klantsignaal is al vastgesteld in herken().
 * Automatisch antwoorden kan alleen met een antwoordadres.
 */
function beoordeel(plat, analyse, { bekendeKlant = false } = {}) {
  if (['eigen', 'automatisch', 'factuur'].indexOf(analyse.classificatie) !== -1) return analyse;
  const lus = /^lusbewaking/.test(analyse.reden || '');
  return {
    classificatie: bekendeKlant ? 'klant' : 'lead',
    maaktLead: true,
    magAutoAntwoord: !lus && Boolean(plat.contact.email),
    reden: lus ? analyse.reden : 'aanvraag via ' + plat.platform.bron,
  };
}

/* ── De wagen ────────────────────────────────────────────────────────────── */

/**
 * De wagen van DEZE dealer waar de mail over gaat, of null. Zie de kop.
 * @returns {Promise<null|{voertuig, listing:{provider,externalId}, via:string}>}
 */
async function koppelVoertuig(projectCode, plat) {
  const tenant = String(projectCode || '').trim();
  if (!tenant || !plat || !plat.links.length) return null;
  const _vehicles = require('../_vehicles');
  const _listings = require('../_listings');
  const gevonden = new Map();   // voertuigcode -> { voertuig, listing, via }
  const nu = (v, listing, via) => {
    if (v && v.projectCode === tenant && v.code && !gevonden.has(v.code)) gevonden.set(v.code, { voertuig: v, listing, via });
  };
  try {
    if (!(await _vehicles.available())) return null;

    /* 1. AutoScout24-aanbodnummer. */
    const nogOpen = [];
    for (const l of plat.links) {
      const id = _autoscout.aanbodIdUit(l);
      const v = id ? await _vehicles.getByAutoscout(tenant, id) : null;
      if (v) nu(v, { provider: 'autoscout24', externalId: id }, 'aanbodnummer');
      else nogOpen.push(l);
    }

    /* 2 en 3. Wat nog niet op een nummer werd herkend: een link die gelijk is aan
       een advertentie-URL (vehicle_listings) of aan het Listing URL van een
       wagen van deze dealer. De startpagina van het platform (geen pad) is
       geen advertentie. */
    const doel = new Set(nogOpen.map(kaal).filter((k) => k.indexOf('/') > 0));
    if (doel.size) {
      const adv = await _listings.list(tenant).catch(() => ({ listings: [] }));
      const viaAdvertentie = new Set();
      for (const rij of adv.listings || []) {
        if (!rij.url || !rij.vehicleCode || !doel.has(kaal(rij.url))) continue;
        viaAdvertentie.add(kaal(rij.url));
        nu(await _vehicles.getByCode(tenant, rij.vehicleCode), { provider: rij.provider, externalId: rij.externalId }, 'advertentie');
      }
      if (nogOpen.some((l) => doel.has(kaal(l)) && !viaAdvertentie.has(kaal(l)))) {
        const voorraad = await _vehicles.list(tenant, { inclusiefGearchiveerd: true });
        for (const v of voorraad) {
          if (!v.link || !doel.has(kaal(v.link)) || viaAdvertentie.has(kaal(v.link))) continue;
          const bronLink = nogOpen.find((l) => kaal(l) === kaal(v.link)) || v.link;
          const p = platformVanHost((() => { try { return new URL(bronLink).hostname; } catch (_) { return ''; } })()) || plat.platform;
          nu(v, { provider: p.provider, externalId: _autoscout.aanbodIdUit(bronLink) || '' }, 'link');
        }
      }
    }
  } catch (e) {
    /* Lukt het zoeken niet, dan een lead zonder wagen. Liever dat dan niets. */
    console.warn('[platformlead] wagen zoeken mislukt:', e && e.message);
    return null;
  }
  /* Links naar meerdere verschillende wagens: niet raden. */
  return gevonden.size === 1 ? Array.from(gevonden.values())[0] : null;
}

/* ── Leads ───────────────────────────────────────────────────────────────── */

const LEADS = 'tbliukTnDAbEDcZmt';
const F_PROJECT = 'fldSmczuyUJd26HLe';
const F_STATUS = 'fld8mkrEWcyq7mUip';
const F_NOTITIES = 'fldoLRI5W12ThTls7';
const F_AANGEMAAKT = 'fldR0r13EU4RwrtvH';
const GESLOTEN = ['completed', 'verloren', 'lost', 'won', 'gewonnen'];

function escapeFormula(v) { return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }
async function at(pad, opts = {}) {
  return fetch(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${pad}`, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${process.env.API_AIRTABLE}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}
const veld = (f, id, naam) => (f[id] !== undefined ? f[id] : f[naam]);

/**
 * De leads van deze dealer met dit e-mailadres (kolom Email of de Notities-blob
 * van het formulier). Alleen e-mail: het telefoonveld is het WhatsApp-nummer
 * en een platformmail brengt dat niet mee.
 * @returns {Promise<{open:object|null, afgemeld:boolean}>}  gooit bij een opzoekfout
 */
async function zoekLeads(projectCode, email) {
  const tenant = String(projectCode || '').trim();
  const mail = String(email || '').trim().toLowerCase();
  if (!tenant || !mail) return { open: null, afgemeld: false };
  const inBlob = `FIND("${escapeFormula('"email":"' + mail + '"')}", LOWER({${F_NOTITIES}}&""))`;
  const perKolom = `LOWER({Email})="${escapeFormula(mail)}"`;
  const vraag = async (wie) => at(`${LEADS}?filterByFormula=${encodeURIComponent(`AND({${F_PROJECT}}="${escapeFormula(tenant)}", ${wie})`)}&maxRecords=10`);
  let r = await vraag(`OR(${perKolom}, ${inBlob})`);
  /* De kolom Email bestaat misschien nog niet (schema-migratie): dan alleen de blob. */
  if (!r.ok && r.status === 422) r = await vraag(inBlob);
  if (!r.ok) throw new Error('Airtable ' + r.status);
  const recs = ((await r.json()).records || [])
    .filter((x) => String(veld(x.fields || {}, F_PROJECT, 'Project Code') || '') === tenant);   // tweede slot: tenant
  const afgemeld = recs.some((x) => _optout.isAfgemeld(x.fields));
  const open = recs
    .filter((x) => GESLOTEN.indexOf(String((veld(x.fields || {}, F_STATUS, 'Conversation State') || '')).toLowerCase()) === -1)
    .sort((a, b) => (Date.parse(veld(b.fields || {}, F_AANGEMAAKT, 'Created At') || '') || 0) - (Date.parse(veld(a.fields || {}, F_AANGEMAAKT, 'Created At') || '') || 0))[0] || null;
  return { open, afgemeld };
}

function naamVoertuig(v) { return [v.merk, v.model].filter(Boolean).join(' ').trim(); }

/** De notitie bij een binnengekomen aanvraag: waar, over welke wagen, en wat er stond. */
function notitieTekst(plat, voertuig) {
  const c = plat.contact;
  const regels = [`Aanvraag via ${plat.platform.bron}${voertuig ? ` voor ${naamVoertuig(voertuig) || 'een wagen'} (${voertuig.code})` : ' (wagen niet herkend)'}.`];
  if (c.telefoon) regels.push(`Telefoon (uit de mail): ${c.telefoon}`);
  if (c.bericht) regels.push(c.bericht.slice(0, 600));
  return regels.join('\n');
}

/**
 * Een open lead bijwerken: notitie erbij, wagen en e-mail aanvullen als die
 * ontbraken. Alles wat al in Notities staat (aiPaused, taken) blijft staan.
 * false = niet te doen (Notities is vrije tekst): dan een nieuwe lead.
 */
async function werkLeadBij(lead, plat, voertuig, listing) {
  const f = lead.fields || {};
  const ruw = String(veld(f, F_NOTITIES, 'Notities') || '');
  let blob;
  try { blob = ruw ? JSON.parse(ruw) : {}; } catch (_) { blob = null; }
  if (!blob || typeof blob !== 'object' || Array.isArray(blob)) return false;
  const notes = Array.isArray(blob.notes) ? blob.notes : [];
  notes.unshift({ id: 'n_' + Date.now(), text: notitieTekst(plat, voertuig), ts: new Date().toISOString() });
  const nieuw = Object.assign({}, blob, { _v: 1, notes, tasks: blob.tasks || [], calls: blob.calls || [] });
  if (voertuig && !blob.property) nieuw.property = voertuig.code;
  if (plat.contact.email && !blob.email) nieuw.email = plat.contact.email;
  const velden = { [F_NOTITIES]: JSON.stringify(nieuw).slice(0, 95000), 'Last Message': String(plat.contact.bericht || '').slice(0, 500) };
  let r = await at(`${LEADS}/${lead.id}`, { method: 'PATCH', body: { fields: velden, typecast: true } });
  /* 'Last Message' bestaat niet in elke base: de notitie is belangrijker. */
  if (!r.ok && r.status === 422) r = await at(`${LEADS}/${lead.id}`, { method: 'PATCH', body: { fields: { [F_NOTITIES]: velden[F_NOTITIES] }, typecast: true } });
  if (!r.ok) throw new Error('Airtable ' + r.status);
  /* Het advertentie-id: alleen aanvullen, nooit over een bekend id heen (zelfde
     regel als bij WhatsApp). Apart, want de velden bestaan misschien nog niet. */
  if (listing && listing.provider && !String(f['Listing Provider'] || '').trim()) {
    const lf = { 'Listing Provider': listing.provider };
    if (listing.externalId) lf['Listing ID'] = listing.externalId;
    await at(`${LEADS}/${lead.id}`, { method: 'PATCH', body: { fields: lf, typecast: true } }).catch(() => {});
  }
  return true;
}

/**
 * Zorg dat deze aanvraag op een lead staat. `maakLead` is de aanmaker van de
 * mailbox (die kent de veld-id's van Leads), zodat er één plek is die een
 * mail-lead aanmaakt.
 * @returns {Promise<{leadId:string, nieuw:boolean, afgemeld:boolean}>}
 */
async function zorgVoorLead(projectCode, plat, m, voertuig, listing, maakLead) {
  let gevonden = { open: null, afgemeld: false };
  try { gevonden = await zoekLeads(projectCode, plat.contact.email); }
  catch (e) { console.warn('[platformlead] open lead opzoeken mislukt, nieuwe lead:', e && e.message); }   // liever een dubbele dan een verloren aanvraag
  if (gevonden.afgemeld) return { leadId: '', nieuw: false, afgemeld: true };
  if (gevonden.open) {
    const gelukt = await werkLeadBij(gevonden.open, plat, voertuig, listing).catch((e) => { console.warn('[platformlead] lead bijwerken mislukt, nieuwe lead:', e && e.message); return false; });
    if (gelukt) return { leadId: gevonden.open.id, nieuw: false, afgemeld: false };
  }
  const lead = await maakLead(projectCode, m, plat.contact.naam, {
    bron: plat.platform.bron, email: plat.contact.email, listing,
    property: voertuig ? voertuig.code : '', notitie: notitieTekst(plat, voertuig), laatsteBericht: plat.contact.bericht,
  });
  return { leadId: lead && lead.id ? lead.id : '', nieuw: Boolean(lead && lead.id), afgemeld: false };
}

/** Het "van"-adres dat op het bericht komt: de koper (voor Beantwoorden), niet het no-reply van het platform. */
function vanVoor(plat) {
  const c = plat.contact;
  if (!c.email) return '';
  const n = c.naam.replace(/["<>\r\n]/g, '');
  return n ? `"${n}" <${c.email}>` : c.email;
}

module.exports = {
  PLATFORMEN, registreerbaar, platformVanAdres, platformVanHost, kaal, linksVan, contactUit,
  herken, beoordeel, koppelVoertuig, zoekLeads, werkLeadBij, zorgVoorLead, vanVoor, notitieTekst,
};
