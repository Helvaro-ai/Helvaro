'use strict';
/*
 * Faro — tool registry.
 *
 * SCAFFOLD: every tool is declared with its real JSON Schema and its real
 * result shape, but the implementations are stubs returning representative
 * mock data. Requirement 14 asks for exactly this: "the UI should already be
 * designed around these capabilities even if some backend functions are mocked
 * initially." Wiring a tool later means replacing one `run` body — its schema,
 * its result shape and everything the UI does with it stay put.
 *
 * ── The one distinction that shapes this whole file ──────────────────────────
 * Tools are split into READ and ACT.
 *
 *   kind: 'read'   — safe, idempotent, executed immediately.
 *   kind: 'create' — makes an ASSET FOR THE USER (an image, a draft). Executed
 *                    immediately, like read. It costs credits, but the credit
 *                    system is the guard for cost; a confirm dialog is not.
 *   kind: 'act'    — reaches OUTSIDE Helvaro, or changes a customer-facing
 *                    record. NEVER executed on the model's say-so. Returns a
 *                    *proposal*; the user confirms in the UI; only then does
 *                    api/_faro/actions.js execute it.
 *
 * ── Why 'create' is not gated ────────────────────────────────────────────────
 * Generation moved into the chat, so "make this living room modern" should
 * produce an image the way asking Claude or ChatGPT for one does — not pop a
 * confirmation first. Nothing leaves the building when an image is generated:
 * no customer is messaged, no calendar is written, nothing is published. The
 * cost is real, and it is handled where cost belongs — api/_credits.js blocks
 * the call before a paid API is touched.
 *
 * The line is therefore "does this have a consequence outside Helvaro", not
 * "does this cost money". Sending a WhatsApp message to a lead, booking a
 * calendar slot and creating a campaign are gated. Drawing a picture is not.
 *
 * That split is requirement 8's "ask for confirmation before executing external
 * actions", made structural rather than a prompt instruction. A prompt can be
 * talked out of asking; a registry that has no execution path for an unconfirmed
 * act-tool cannot. `run` on an act-tool builds the proposal and stops — it has
 * no access to the executor at all.
 *
 * ── Tenant scoping is not optional and not the model's business ──────────────
 * Every `run` receives ctx = { projectCode, userId, lang }. The model never
 * supplies a tenant — it cannot see one and cannot pass one. A tool that
 * queried by a model-supplied projectCode would be one prompt injection away
 * from cross-tenant data access. Filters come from the model; identity comes
 * from the session, always.
 *
 * ── Result shape ─────────────────────────────────────────────────────────────
 * Every run resolves to:
 *   { summary, data, components }
 *     summary    — short natural-language line fed back to the model
 *     data       — structured payload the model may reason over
 *     components — UI cards to render (see ./schema.js); [] when there's nothing
 *                  to show. This is what makes responses rich rather than a
 *                  wall of text (requirement 7).
 */

const schema = require('./schema');
const writes = require('./writes');
const fixtures = require('./fixtures');
const images = require('../_images');
const data = require('./data');
const pricing = require('./pricing');
const credits = require('../_credits');
const mediaModels = require('../_media-models');
const properties = require('../_properties');
const vehicles   = require('../_vehicles');

const NOT_WIRED = 'not_wired';

/** Marks a stub result so mock data is never mistaken for real CRM data. */
function stub(summary, data, components = []) {
  return { summary, data, components, _stub: NOT_WIRED };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ TOOLS — CRM knowledge. Wire these to the existing Airtable/Postgres
// reads already used by api/leads.js; do NOT re-implement queries here.
// ─────────────────────────────────────────────────────────────────────────────

/* ── Turning a CRM lead into a card ──────────────────────────────────────────
   One function, so every tool that returns leads returns the same card. The
   channel and status vocabularies are the schema's, not Airtable's; mapping
   happens here rather than in the renderer, which should not have to know what
   a Flemish single-select says this week. */
function toChannelKey(bron) {
  const b = String(bron || '').toLowerCase();
  if (b.indexOf('whats') !== -1) return 'whatsapp';
  if (b.indexOf('form') !== -1 || b.indexOf('website') !== -1) return 'form';
  if (b.indexOf('tel') !== -1 || b.indexOf('phone') !== -1) return 'phone';
  if (b.indexOf('mail') !== -1) return 'email';
  return 'form';
}

function toStatusKey(lead) {
  if (lead.afspraakGeboekt) return 'booked';
  if (lead.qualified) return 'qualified';
  if (lead.opgepikt) return 'contacted';
  return 'new';
}

/* Money, in the format the rest of the product prints it. Intl rather than a
   hand-rolled replace, so a 7-figure value groups correctly. */
const EUR = new Intl.NumberFormat('nl-BE', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
function money(n) {
  return Number.isFinite(n) && n > 0 ? EUR.format(n) : '';
}

/* Human date/time for a calendar entry. Belgian conventions, 24-hour clock,
   and an explicit weekday because "dinsdag 14:00" is what someone reads off a
   calendar -- a bare ISO string is not an answer. */
const WHEN_DAY = new Intl.DateTimeFormat('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' });
const WHEN_TIME = new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit', hour12: false });
function formatWhen(iso, allDay) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t);
  return allDay ? WHEN_DAY.format(d) : `${WHEN_DAY.format(d)} ${WHEN_TIME.format(d)}`;
}

function leadToCard(lead) {
  const budget = data.parseBudget(lead.verwachteWaarde);
  return schema.leadCard({
    id: lead.id,
    name: lead.naam || 'Naamloze lead',
    // Show the agent's own words when the number cannot be parsed, rather than
    // a blank -- "in overleg" is information, and blanking it looks like a bug.
    budget: money(budget) || String(lead.verwachteWaarde || ''),
    timeframe: lead.urgentie || '',
    channel: toChannelKey(lead.bron),
    status: toStatusKey(lead),
    note: lead.samenvatting || lead.reden || '',
  });
}

/* Everything a tool hands back to the MODEL about a lead. Deliberately not the
   whole record: the phone number and the full conversation blob are not needed
   to answer "who are my best leads", and every field here is one the model may
   quote back to the user. */
function leadForModel(lead) {
  return {
    id: lead.id,
    naam: lead.naam,
    score: lead.leadScore,
    gekwalificeerd: lead.qualified,
    afspraakGeboekt: lead.afspraakGeboekt,
    opgepikt: lead.opgepikt,
    bron: lead.bron,
    urgentie: lead.urgentie,
    capaciteit: lead.capaciteit,
    fit: lead.fit,
    budget: data.parseBudget(lead.verwachteWaarde),
    budgetTekst: lead.verwachteWaarde,
    status: lead.status,
    samenvatting: lead.samenvatting,
    datum: lead.datum,
  };
}

/* Every read tool is wrapped in this. A tool that throws inside the
   orchestrator becomes "Tool mislukt", which the model then explains away in
   prose -- so the two failures that are NOT a lookup miss get their own honest
   answer instead: the CRM being unreachable, and the CRM not being configured.
   Neither may ever be reported as "no results". */
function readTool(name, run) {
  return async function (args, ctx) {
    try {
      return await run(args || {}, ctx);
    } catch (err) {
      if (err instanceof data.DataUnavailable) {
        return {
          summary: `KAN NIET LEZEN: ${err.message} Zeg dit tegen de gebruiker. Verzin geen cijfers.`,
          data: { unavailable: true },
          components: [],
        };
      }
      console.error(`[faro/tools] ${name} failed:`, err && err.message);
      throw err;
    }
  };
}

/** A note appended to a summary when the underlying page cap was hit. */
function truncationNote(truncated) {
  return truncated
    ? ' (gebaseerd op de meest recente leads, niet het volledige archief)'
    : '';
}

const readTools = [
  {
    /* De spiegel van get_properties, voor dealers. Twee gereedschappen en niet
       een met een schakelaar: het model kiest zelf welk gereedschap het pakt,
       en de beschrijving is wat die keuze stuurt. Een gedeeld "get_aanbod" zou
       een beschrijving nodig hebben die over panden EN auto's gaat, en dan
       pakt het model hem ook in het verkeerde geval. Twee scherpe
       beschrijvingen werken beter dan een vage.

       Een makelaar die dit gereedschap toch aanroept krijgt geen fout maar een
       leeg antwoord met uitleg -- hij heeft nu eenmaal geen voertuigen. */
    name: 'get_vehicles',
    kind: 'read',
    description:
      'Haal de voorraad van deze autodealer op: merk, model, uitvoering, prijs, kilometerstand, ' +
      'bouwjaar, brandstof en status. Gebruik dit zodra de gebruiker het over een auto, een wagen, ' +
      'een voertuig of "mijn voorraad" heeft, en ook wanneer je wil weten welk voertuig bij een lead ' +
      'hoort. Verzin nooit een voertuig dat hier niet uit komt.',
    parameters: {
      type: 'object',
      properties: {
        code:   { type: 'string', description: 'Een specifieke referentie, bijvoorbeeld V3.' },
        status: { type: 'string', enum: ['beschikbaar', 'gereserveerd', 'verkocht', 'uit aanbod'],
                  description: 'Alleen voertuigen met deze status.' },
        alleenAanbod: { type: 'boolean', default: false,
                        description: 'Alleen wat nu nog te rijden is (beschikbaar of gereserveerd).' },
      },
    },
    run: readTool('get_vehicles', async (args, ctx) => {
      /* De tabel kan er nog niet zijn. Dan is het antwoord "voertuigen staan
         nog uit", niet een lege lijst -- want een lege lijst leest het model
         als "deze dealer heeft geen voorraad", en dat vertelt hij dan door. */
      if (!(await vehicles.available())) {
        return stub(
          'De voertuigenlijst is nog niet aangezet voor deze klant. Zeg dat je de voorraad niet kunt '
          + 'inzien en verzin geen voertuigen.', { unavailable: true });
      }
      const alle = await vehicles.list(ctx.projectCode, { alleenRijdbaar: args.alleenAanbod === true });
      const code = args.code ? vehicles.normCode(args.code) : '';
      const gefilterd = alle.filter((v) => {
        if (code && v.code !== code) return false;
        if (args.status && v.status !== vehicles.normStatus(args.status)) return false;
        return true;
      });

      if (!gefilterd.length) {
        return {
          summary: alle.length
            ? 'Geen voertuig past bij deze filter. De dealer heeft er ' + alle.length + '.'
            : 'Deze dealer heeft nog geen voertuigen ingevoerd.',
          data: { vehicles: [], totaal: alle.length },
          components: [],
        };
      }

      return {
        summary: gefilterd.length + ' voertuig' + (gefilterd.length === 1 ? '' : 'en') + ': '
          + gefilterd.slice(0, 8).map((v) => vehicles.samenvatting(v)).join(' / '),
        data: {
          vehicles: gefilterd.map((v) => ({
            code: v.code, merk: v.merk, model: v.model, uitvoering: v.uitvoering,
            prijs: v.prijs, km: v.km, inschrijving: v.inschrijving, brandstof: v.brandstof,
            transmissie: v.transmissie, kw: v.kw, pk: v.pk, kleur: v.kleur,
            status: v.status, link: v.link,
            /* De kortingsvelden gaan NIET mee. Faro's dashboardkant praat met
               de dealer, niet met een koper -- maar deze gegevens komen in een
               modelcontext terecht, en kortingsruimte is precies het getal dat
               daar niet hoeft rond te slingeren. Wie het wil zien, ziet het op
               het voertuigscherm. */
          })),
          totaal: alle.length,
        },
        components: [],
      };
    }),
  },
  {
    /* ── Wie zocht dit? ────────────────────────────────────────────────────
       De functie waar de hele wensen-machinerie voor bestaat. Een koper vroeg
       twee maanden geleden naar een Mercedes van 2019 onder de 100.000 km, die
       stond er toen niet, en het gesprek liep dood. Nu rijdt er precies zo een
       binnen -- en zonder dit gereedschap legt niemand dat verband.

       Die lead was al betaald: gevonden, aangesproken, gekwalificeerd. Hem
       opnieuw bereiken kost een sjabloonbericht van ongeveer elf cent. Een
       nieuwe lead kost een veelvoud.

       LEZEND en niet handelend. Er gaat hier niets naar buiten; dit levert een
       lijst met namen en redenen. Wie er daarna een bericht krijgt en wat
       daarin staat, loopt via create_campaign -- dat al bestaat, al achter een
       bevestiging zit, en al rekening houdt met wie zich heeft afgemeld. */
    name: 'find_buyers',
    kind: 'read',
    description:
      'Zoek eerdere kopers die precies dit voertuig zochten. Gebruik dit wanneer er een auto '
      + 'binnenkomt of wanneer de dealer vraagt wie hij moet bellen over een wagen. Geeft namen '
      + 'met een score en de reden waarom ze passen. Verstuurt niets.',
    parameters: {
      type: 'object',
      properties: {
        code:     { type: 'string', description: 'De referentie van het voertuig, bijvoorbeeld V3.' },
        minScore: { type: 'integer', minimum: 0, maximum: 100, default: 55,
                    description: 'Hoe goed de match minstens moet zijn. Standaard 55.' },
      },
      required: ['code'],
    },
    run: readTool('find_buyers', async (args, ctx) => {
      if (ctx.vertical !== 'dealership') {
        return stub('Dit account werkt niet met voertuigen. Vraag naar panden of leads.', { unavailable: true });
      }
      if (!(await vehicles.available())) {
        return stub('De voertuigenlijst is nog niet aangezet voor deze klant.', { unavailable: true });
      }

      const auto = await vehicles.getByCode(ctx.projectCode, args.code);
      if (!auto) {
        return { summary: 'Dat voertuig staat niet in deze voorraad. Vraag om welke wagen het gaat.',
                 data: { matches: [] }, components: [] };
      }

      const wens = require('../_wens');
      const { leads } = await data.leadsFor(ctx);
      const treffers = wens.matchLeads(leads, auto, { minScore: Number(args.minScore) || 55, max: 10 });

      if (!treffers.length) {
        return {
          summary: 'Niemand in je leads zocht iets als de ' + vehicles.naam(auto) + '. '
            + 'Dat kan ook betekenen dat er nog weinig wensen zijn opgeslagen -- die vult je '
            + 'assistent vanzelf aan naarmate er meer gesprekken lopen.',
          data: { matches: [], voertuig: auto.code },
          components: [],
        };
      }

      return {
        summary: treffers.length + ' ' + (treffers.length === 1 ? 'koper zocht' : 'kopers zochten')
          + ' iets als de ' + vehicles.naam(auto) + ': '
          + treffers.slice(0, 4).map((t) => (t.naam || 'onbekend') + ' (' + t.score + '%)').join(', ')
          + '.',
        data: {
          voertuig: { code: auto.code, naam: vehicles.naam(auto), prijs: auto.prijs, status: auto.status },
          matches: treffers.map((t) => ({
            leadId: t.leadId, naam: t.naam, score: t.score,
            redenen: t.redenen,
            zocht: wens.omschrijf(t.wens),
            sinds: t.sinds,
            /* Het telefoonnummer gaat NIET mee. Faro heeft het niet nodig om te
               zeggen wie je moet bellen, en een nummer in een modelcontext is
               een nummer dat daar niet hoeft rond te slingeren. De verzendweg
               zoekt het zelf op aan de hand van het lead-id. */
          })),
        },
        components: [],
      };
    }),
  },
  {
    name: 'get_properties',
    kind: 'read',
    description:
      'Haal het aanbod van deze makelaar op: adres, prijs, slaapkamers, oppervlakte en status. Gebruik dit ' +
      'zodra de gebruiker het over een pand, een woning, een appartement of "mijn aanbod" heeft, en ook ' +
      'wanneer je wil weten welk pand bij een lead hoort. Verzin nooit een pand dat hier niet uit komt.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: properties.ALLE_STATUS.slice(),
                  description: 'Alleen panden met deze status.' },
        code:   { type: 'string', description: 'Een specifieke referentie, bijvoorbeeld P3.' },
        alleenAanbod: { type: 'boolean', default: false,
                        description: 'Alleen wat nu nog te bezichtigen is (beschikbaar of onder bod).' },
      },
    },
    run: readTool('get_properties', async (args, ctx) => {
      /* De tabel kan er nog niet zijn. Dan is het antwoord "panden staan nog
         uit", niet een lege lijst -- want een lege lijst leest het model als
         "deze makelaar heeft geen aanbod", en dat vertelt hij dan door. */
      if (!(await properties.available())) {
        return stub(
          'De pandenlijst is nog niet aangezet voor deze klant. Zeg dat je het aanbod niet kunt inzien '
          + 'en verzin geen panden.', { unavailable: true });
      }
      const alle = await properties.list(ctx.projectCode, { alleenBezichtigbaar: args.alleenAanbod === true });
      const code = args.code ? properties.normCode(args.code) : '';
      const gefilterd = alle.filter((p) => {
        if (code && p.code !== code) return false;
        if (args.status && p.status !== properties.normStatus(args.status)) return false;
        return true;
      });

      if (!gefilterd.length) {
        return {
          summary: alle.length
            ? 'Geen pand past bij deze filter. De makelaar heeft er ' + alle.length + '.'
            : 'Deze makelaar heeft nog geen panden ingevoerd.',
          data: { properties: [], totaal: alle.length },
          components: [],
        };
      }

      /* Hoeveel leads per pand. Dezelfde rijen die de rest van Faro leest, dus
         geen tweede waarheid over hetzelfde getal. */
      let perPand = {};
      try {
        const { leads } = await data.leadsFor(ctx);
        for (const l of leads) {
          const c = String(l.property || '').toUpperCase();
          if (c) perPand[c] = (perPand[c] || 0) + 1;
        }
      } catch (_) { perPand = {}; }

      return {
        summary: gefilterd.length + ' pand' + (gefilterd.length === 1 ? '' : 'en') + ': '
          + gefilterd.slice(0, 8).map((p) => properties.samenvatting(p)).join(' / '),
        data: {
          properties: gefilterd.map((p) => ({
            code: p.code, adres: p.adres, plaats: p.plaats, type: p.type, transactie: p.transactie,
            prijs: p.prijs, slaapkamers: p.slaapkamers, oppervlakte: p.oppervlakte, epc: p.epc,
            status: p.status, bezichtigbaar: properties.kanBezichtigen(p.status),
            leads: perPand[p.code] || 0,
          })),
          totaal: alle.length,
        },
        components: gefilterd.slice(0, 12).map((p) => schema.propertyCard({
          id: p.code,
          title: p.adres || p.code,
          address: [p.postcode, p.plaats].filter(Boolean).join(' '),
          price: properties.prijsTekst(p.prijs) || '',
          imageUrl: (p.fotos && p.fotos[0]) || '',
          specs: [
            p.slaapkamers ? p.slaapkamers + ' slk' : '',
            p.oppervlakte ? p.oppervlakte + ' m2' : '',
            p.epc ? 'EPC ' + p.epc : '',
            p.status,
            (perPand[p.code] || 0) + ' leads',
          ].filter(Boolean),
        })),
      };
    }),
  },

  {
    name: 'get_leads',
    kind: 'read',
    description: 'Haal de meest recente of best scorende leads op. Gebruik search_leads wanneer de gebruiker filtert op budget, timing, status of kanaal.',
    parameters: {
      type: 'object',
      properties: {
        limit:  { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        status: { type: 'string', enum: ['new', 'qualified', 'contacted', 'won', 'lost'] },
        sort:   { type: 'string', enum: ['score', 'recent'], default: 'score',
                  description: 'score = beste leads eerst, recent = nieuwste eerst' },
      },
    },
    run: readTool('get_leads', async (args, ctx) => {
      if (fixtures.isEnabled()) {
        const leads = fixtures.searchLeads({ status: args.status, limit: args.limit || 10 });
        return stub(`${leads.length} leads gevonden.`, { leads }, leads.map(fixtures.leadCard));
      }
      const { leads, truncated } = await data.leadsFor(ctx);
      const { matches, total } = data.filterLeads(leads, {
        status: args.status, limit: args.limit || 10, sort: args.sort || 'score',
      });
      if (!matches.length) {
        return {
          summary: leads.length
            ? `Geen van de ${leads.length} leads past bij deze filter.`
            : 'Deze klant heeft nog geen leads in het CRM.',
          data: { leads: [], totalInCrm: leads.length },
          components: [],
        };
      }
      return {
        summary: `${matches.length} van ${total} leads${truncationNote(truncated)}.`,
        data: { leads: matches.map(leadForModel), total, totalInCrm: leads.length },
        components: matches.map(leadToCard),
      };
    }),
  },

  {
    name: 'search_leads',
    kind: 'read',
    description: 'Zoek leads op budget, aankooptermijn, status, kanaal, score of trefwoord. Dit is de tool achter vragen als "leads met budget boven 400k die binnen 3 maanden willen kopen".',
    parameters: {
      type: 'object',
      properties: {
        minBudget:   { type: 'integer', description: 'Minimum budget in euro' },
        maxBudget:   { type: 'integer', description: 'Maximum budget in euro' },
        minScore:    { type: 'integer', minimum: 1, maximum: 10, description: 'Minimale leadscore' },
        timeframe:   { type: 'string', enum: ['0-1m', '1-3m', '3-6m', '6m+'] },
        status:      { type: 'string', enum: ['new', 'qualified', 'contacted', 'won', 'lost'] },
        channel:     { type: 'string', enum: ['whatsapp', 'form', 'phone', 'email'] },
        qualifiedOnly: { type: 'boolean' },
        query:       { type: 'string', description: 'Vrije tekst — naam, adres of trefwoord' },
        limit:       { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
    },
    run: readTool('search_leads', async (args, ctx) => {
      if (fixtures.isEnabled()) {
        const leads = fixtures.searchLeads(args);
        return stub(
          leads.length ? `${leads.length} leads gevonden.` : 'Geen leads passen bij deze filters.',
          { leads }, leads.map(fixtures.leadCard),
        );
      }
      const { leads, truncated } = await data.leadsFor(ctx);
      const { matches, total } = data.filterLeads(leads, args);
      if (!matches.length) {
        return {
          summary: `Geen van de ${leads.length} leads past bij deze filters. `
            + 'Let op: leads zonder ingevuld budget tellen niet mee bij een budgetfilter.',
          data: { leads: [], totalInCrm: leads.length },
          components: [],
        };
      }
      return {
        summary: `${matches.length} van ${total} passende leads${truncationNote(truncated)}.`,
        data: { leads: matches.map(leadForModel), total, totalInCrm: leads.length },
        components: matches.map(leadToCard),
      };
    }),
  },

  {
    name: 'get_lead',
    kind: 'read',
    description: 'Haal één lead op met volledige details en kwalificatiegegevens. Werkt met een lead-id of met een naam.',
    parameters: {
      type: 'object',
      properties: {
        id:   { type: 'string', description: 'Lead-id uit een eerdere tool' },
        name: { type: 'string', description: 'Naam, wanneer je geen id hebt' },
      },
    },
    run: readTool('get_lead', async (args, ctx) => {
      if (fixtures.isEnabled()) return stub('Lead niet gevonden.', { lead: null });
      const { leads } = await data.leadsFor(ctx);
      const lead = data.findLead(leads, { leadId: args.id, name: args.name });
      if (!lead) {
        return {
          summary: `Geen lead gevonden voor ${args.id || args.name || 'deze zoekopdracht'}.`,
          data: { lead: null }, components: [],
        };
      }
      return {
        summary: `Lead ${lead.naam}: score ${lead.leadScore || '?'}/10, `
          + `${lead.qualified ? 'gekwalificeerd' : 'nog niet gekwalificeerd'}, `
          + `${lead.afspraakGeboekt ? 'afspraak geboekt' : 'geen afspraak'}.`,
        data: {
          lead: { ...leadForModel(lead), notities: lead.notities, reden: lead.reden },
          heeftGesprek: Boolean(lead.gesprek),
        },
        components: [leadToCard(lead)],
      };
    }),
  },

  {
    name: 'get_opportunities',
    kind: 'read',
    description: 'Haal de kansen op die nu actie verdienen, met kansscore, categorie, uitleg en de aanbevolen volgende stap. Dit is dezelfde prioritering die het Command Center toont. Gebruik dit voor "wat moet ik vandaag doen", "handel alles af", en om uit te leggen waarom een lead belangrijk is.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['ready_to_book', 'high_priority', 'at_risk', 'high_value', 'gone_cold'],
          description: 'Beperk tot één categorie. Leeg = alle kansen.',
        },
        limit: { type: 'integer', minimum: 1, maximum: 25, default: 10 },
      },
    },
    /* Reuses api/_command.js rather than re-deriving anything. Two rankings of
       the same leads that disagree is worse than one imperfect ranking: the
       user would be told one thing by the page and another by the assistant,
       about the same lead, in the same minute. */
    run: readTool('get_opportunities', async (args, ctx) => {
      const command = require('../_command');
      const { leads } = await data.leadsFor(ctx);
      if (!leads.length) {
        return { summary: 'Deze klant heeft nog geen leads in het CRM.', data: { opportunities: [] }, components: [] };
      }

      // Whether booking may be recommended depends on the calendar actually
      // being connected — the same condition the Command Center applies.
      let calendarConnected = false;
      try { calendarConnected = Boolean(await data.gcalAccessFor(ctx)); } catch (_) { /* fail-soft */ }

      const built = command.build(leads, { calendarConnected });
      let list = built.opportunities;
      if (args.category) list = list.filter((o) => o.category === args.category);
      list = list.slice(0, Math.max(1, Math.min(25, args.limit || 10)));

      if (!list.length) {
        return {
          summary: args.category
            ? `Geen kansen in de categorie ${args.category}.`
            : 'Er staat op dit moment niets open dat actie vraagt.',
          data: { opportunities: [], totalOpportunities: built.totalOpportunities },
          components: [],
        };
      }

      return {
        summary: `${list.length} van ${built.totalOpportunities} kansen. `
          + list.map((o) => `${o.name} (${o.categoryLabel}, kansscore ${o.score}, aanbevolen: ${o.action.label})`).join('; ')
          + '. Elke aanbevolen actie is al gecheckt op uitvoerbaarheid — stel niets voor dat hier niet staat.',
        data: {
          opportunities: list.map((o) => ({
            id: o.id, naam: o.name, kansscore: o.score, categorie: o.categoryLabel,
            waarom: o.why, budget: o.budget, leadscore: o.leadScore,
            gekwalificeerd: o.qualified, dagenStil: o.silentDays,
            aanbevolenActie: o.action.key, actieReden: o.action.reason,
            redenen: o.reasons.map((r) => `${r.label}: ${r.detail}`),
          })),
          totalOpportunities: built.totalOpportunities,
        },
        components: list.slice(0, 6).map((o) => {
          const lead = data.findLead(leads, { leadId: o.id });
          return lead ? leadToCard(lead) : null;
        }).filter(Boolean),
      };
    }),
  },

  {
    name: 'get_property',
    kind: 'read',
    description: 'Haal een pand op met adres, prijs, kenmerken en gekoppelde media.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    /* Still honest about being unwired: this CRM has no property table. Panden
       exist as free text on a lead and as generated images, both of which other
       tools already reach. Saying so out loud beats inventing a house. */
    async run(_args, _ctx) {
      return {
        summary: 'Er is geen pandendatabank in dit CRM. Panden staan als tekst bij de lead. '
          + 'Gebruik get_lead of search_leads met een trefwoord.',
        data: { property: null, unsupported: true },
        components: [],
      };
    },
  },

  {
    name: 'get_conversation',
    kind: 'read',
    description: 'Haal het volledige WhatsApp-gesprek met een lead op.',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        name:   { type: 'string', description: 'Naam, wanneer je geen id hebt' },
      },
    },
    run: readTool('get_conversation', async (args, ctx) => {
      if (fixtures.isEnabled()) return stub('Geen gesprek gevonden.', { messages: [] });
      const { leads } = await data.leadsFor(ctx);
      const lead = data.findLead(leads, { leadId: args.leadId, name: args.name });
      if (!lead) {
        return { summary: 'Die lead bestaat niet in dit CRM.', data: { messages: [] }, components: [] };
      }
      const messages = data.parseConversation(lead.gesprek);
      if (!messages.length) {
        return {
          summary: `Er is nog geen WhatsApp-gesprek met ${lead.naam}.`,
          data: { messages: [], lead: leadForModel(lead) },
          components: [leadToCard(lead)],
        };
      }
      return {
        summary: `Gesprek met ${lead.naam}: ${messages.length} berichten.`,
        data: { messages, lead: leadForModel(lead) },
        components: [leadToCard(lead)],
      };
    }),
  },

  {
    name: 'search_conversations',
    kind: 'read',
    description: 'Zoek in gesprekken op trefwoord, of haal de leads op die opvolging nodig hebben. Gebruik dit voor "vat de gesprekken van vandaag samen" en "wie moet ik opvolgen".',
    parameters: {
      type: 'object',
      properties: {
        query:          { type: 'string' },
        needsFollowUp:  { type: 'boolean', description: 'Alleen gekwalificeerde leads zonder afspraak' },
        since:          { type: 'string', description: 'ISO-datum' },
        limit:          { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
    },
    run: readTool('search_conversations', async (args, ctx) => {
      if (fixtures.isEnabled()) {
        return stub('3 gesprekken vragen opvolging.',
          { conversations: fixtures.CONVERSATIONS },
          fixtures.searchLeads({ limit: 3 }).map(fixtures.leadCard));
      }
      const { leads } = await data.leadsFor(ctx);
      let found = data.searchConversations(leads, {
        query: args.query, needsFollowUp: args.needsFollowUp, limit: args.limit || 20,
      });
      if (args.since) {
        const from = Date.parse(args.since);
        if (Number.isFinite(from)) found = found.filter((l) => Date.parse(l.datum) >= from);
      }
      if (!found.length) {
        return {
          summary: args.needsFollowUp
            ? 'Er staan geen gekwalificeerde leads zonder afspraak open.'
            : 'Geen gesprekken gevonden die hierbij passen.',
          data: { conversations: [] }, components: [],
        };
      }
      return {
        summary: `${found.length} ${found.length === 1 ? 'gesprek' : 'gesprekken'}.`,
        data: {
          conversations: found.map((l) => ({
            ...leadForModel(l),
            laatsteBerichten: data.parseConversation(l.gesprek).slice(-6),
          })),
        },
        components: found.slice(0, 8).map(leadToCard),
      };
    }),
  },

  {
    name: 'get_pipeline',
    kind: 'read',
    description: 'Haal de pipeline op: aantal leads en waarde per fase.',
    parameters: { type: 'object', properties: {} },
    run: readTool('get_pipeline', async (_args, ctx) => {
      if (fixtures.isEnabled()) {
        return stub('Pipeline opgehaald.', { stages: fixtures.PIPELINE },
          [schema.statGroup({ title: 'Pipeline', stats: fixtures.PIPELINE })]);
      }
      const { leads, truncated } = await data.leadsFor(ctx);
      if (!leads.length) {
        return { summary: 'Deze klant heeft nog geen leads in het CRM.', data: { stages: [] }, components: [] };
      }
      const stages = data.pipeline(leads);
      const stats = stages.map((s) => ({
        label: s.label,
        value: String(s.count),
        sub: money(s.value) || '—',
      }));
      return {
        summary: stages.map((s) => `${s.label}: ${s.count}`).join(', ')
          + `. Totale waarde ${money(stages.reduce((t, s) => t + s.value, 0)) || 'onbekend'}`
          + truncationNote(truncated) + '.',
        data: {
          stages: stages.map((s) => ({ key: s.key, label: s.label, count: s.count, value: s.value })),
        },
        components: [schema.statGroup({ title: 'Pipeline', stats })],
      };
    }),
  },

  {
    name: 'get_price_advice',
    kind: 'read',
    description:
      'Prijsadvies voor een pand of segment, op basis van de budgetten die je eigen leads noemden. '
      + 'Geeft mediaan, spreiding en een aanbevolen vraagprijs. Let op: dit is VRAAGZIJDE '
      + '(wat kopers zeggen te willen betalen), geen verkoopstatistiek en geen marktwaarde. '
      + 'Noem die grens altijd als je dit gebruikt.',
    parameters: {
      type: 'object',
      properties: {
        segment: {
          type: 'string',
          description:
            'Waar het over gaat, in gewone woorden: "gent 3 slaapkamers", "appartement oostende". '
            + 'Alle woorden moeten in de lead voorkomen. Leeg = alle leads.',
        },
        days: {
          type: 'integer',
          description: 'Hoeveel dagen terug meetellen. 0 = alles. Standaard 180.',
          default: 180,
        },
      },
    },
    run: readTool('get_price_advice', async (args, ctx) => {
      const { leads, truncated } = await data.leadsFor(ctx);
      const segment = String(args.segment || '').trim();
      const days = Number.isFinite(Number(args.days)) ? Number(args.days) : pricing.DEFAULT_DAYS;

      const advies = pricing.advise({ leads, segment, days });
      const v = advies.vraagzijde;

      /* De samenvatting is wat het model te lezen krijgt, dus de grens tussen
         vraagzijde en marktwaarde staat er letterlijk in. Zonder die zin gaat
         een taalmodel er vroeg of laat "de markt zegt" van maken, en dan staat
         er een verzonnen zekerheid in een chat waar een makelaar een
         vraagprijs op baseert. */
      const grens =
        ' Dit zijn budgetten uit je eigen gesprekken (vraagzijde), GEEN verkoopcijfers en GEEN '
        + 'marktwaarde. Zeg dat er ook bij.';

      if (!v.aantalMetBudget || !v.betrouwbaar) {
        return {
          summary: (v.reden || 'Te weinig gegevens voor een prijsadvies.')
            + ' Geef GEEN vraagprijs; zeg eerlijk dat de basis te smal is.' + grens,
          data: { advies },
          components: [],
        };
      }

      const stats = [
        { label: 'ADVIES',    value: pricing.eur(advies.aanbevolenPrijs) },
        { label: 'MEDIAAN',   value: pricing.eur(v.mediaan) },
        { label: 'MIDDENMOOT', value: pricing.eur(v.p25) + ' - ' + pricing.eur(v.p75) },
        { label: 'BUDGETTEN', value: String(v.aantalMetBudget) },
      ];

      return {
        summary:
          'Prijsadvies voor "' + (segment || 'alle leads') + '": ' + pricing.eur(advies.aanbevolenPrijs)
          + ' (p75). Mediaan ' + pricing.eur(v.mediaan) + ' over ' + v.aantalMetBudget + ' budgetten.'
          + truncationNote(truncated) + grens,
        data: { advies },
        components: [
          schema.statGroup({
            title: 'Prijsadvies - ' + (segment || 'alle leads') + ' (vraagzijde, eigen leads)',
            stats,
          }),
        ],
      };
    }),
  },

  /* ── De stem van het kantoor, opvraagbaar ──────────────────────────────────
     Er was geen enkele manier om te LEZEN hoe dit kantoor klinkt.
     update_ai_persona kon wel schrijven. Gevolg: Faro kon de instellingen van
     een makelaar overschrijven zonder ze ooit gezien te hebben, en de belofte
     "Faro kent je toon, je aanbod en je sector" had niets onder zich.

     Het contextblok in prompt.js zet deze gegevens al bij elke beurt in de
     prompt. Deze tool bestaat daarnaast om twee redenen: het model kan er
     expliciet naar teruggrijpen voordat het advertentieteksten schrijft, en
     de makelaar kan vragen "wat weet jij over ons?" en een eerlijk antwoord
     krijgen in plaats van een samenvatting uit het geheugen. */
  {
    name: 'get_brand_voice',
    kind: 'read',
    description:
      'Haal op hoe dit kantoor klinkt: naam, sector, website, de naam van de WhatsApp-AI, '
      + 'de eigen huisstijl-instructies, werkuren, sociaal bewijs en wat er de laatste weken '
      + 'het beste werkte. Gebruik dit VOORDAT je advertentieteksten, campagnes of pandteksten '
      + 'schrijft, zodat alles in dezelfde stem staat.',
    parameters: { type: 'object', properties: {} },
    run: readTool('get_brand_voice', async (_args, ctx) => {
      let stem;
      try {
        stem = await writes.readBrandVoice(ctx);
      } catch (err) {
        /* Eerlijk leeg is beter dan verzonnen vol: zegt deze tool niets, dan
           gaat het model zelf een huisstijl bedenken en klinkt elke klant
           hetzelfde. */
        return stub('De kantoorgegevens konden niet gelezen worden. Schrijf niets in een '
          + 'verzonnen huisstijl -- vraag de gebruiker hoe ze willen klinken.', { stem: null }, []);
      }

      const labels = {
        naam: 'Kantoor', sector: 'Sector', website: 'Website', aiNaam: 'WhatsApp-AI heet',
        instructies: 'Huisstijl en werkwijze', werkuren: 'Werkuren', formIntro: 'Formuliertekst',
        badges: 'Sociaal bewijs', taal: 'Taal van de leads', geleerd: 'Wat het beste werkte',
      };
      const ingevuld = Object.keys(labels).filter((k) => stem[k]);
      if (!ingevuld.length) {
        return stub('Dit kantoor heeft nog geen huisstijl ingevuld. Vraag naar de toon, het aanbod '
          + 'en de sector voordat je iets schrijft -- en bied aan het op te slaan met '
          + 'update_ai_persona.', { stem: {} }, []);
      }

      const regels = ingevuld.map((k) => `${labels[k]}: ${stem[k]}`);
      /* Welke velden LEEG zijn is bruikbare informatie: dan kan het model er
         gericht naar vragen in plaats van eromheen te schrijven. */
      const leeg = Object.keys(labels).filter((k) => !stem[k]).map((k) => labels[k]);
      return stub(
        regels.join('\n') + (leeg.length ? `\n\nNog niet ingevuld: ${leeg.join(', ')}.` : ''),
        { stem, ingevuld: ingevuld.length, leeg: leeg.length },
        []);
    }),
  },

  {
    name: 'get_analytics',
    kind: 'read',
    description: 'Haal prestatiecijfers op: nieuwe leads, kwalificatiegraad, responstijd, conversie en prestaties per kanaal.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', '7d', '30d', '90d', 'all'], default: '30d' },
      },
    },
    run: readTool('get_analytics', async (args, ctx) => {
      if (fixtures.isEnabled()) {
        return stub('Cijfers opgehaald.', { metrics: fixtures.ANALYTICS },
          [schema.statGroup({ title: 'Prestaties (30 dagen)', stats: fixtures.ANALYTICS })]);
      }
      const { leads, truncated } = await data.leadsFor(ctx);
      if (!leads.length) {
        return { summary: 'Nog geen leads, dus nog geen cijfers.', data: { metrics: {} }, components: [] };
      }

      const DAYS = { today: 1, '7d': 7, '30d': 30, '90d': 90 };
      const period = args.period || '30d';
      const days = DAYS[period];
      const scoped = days
        ? leads.filter((l) => {
            const t = Date.parse(l.datum);
            return Number.isFinite(t) && t >= Date.now() - days * 86400000;
          })
        : leads;

      if (!scoped.length) {
        return {
          summary: `Geen leads in deze periode (${period}). Over alle tijd zijn het er ${leads.length}.`,
          data: { metrics: {}, period, totalInCrm: leads.length }, components: [],
        };
      }

      const m = data.analytics(scoped);
      const stats = [
        { label: 'Leads',            value: String(m.total) },
        { label: 'Gekwalificeerd',   value: String(m.qualified), sub: m.total ? Math.round((m.qualified / m.total) * 100) + '%' : '' },
        { label: 'Afspraken',        value: String(m.booked),    sub: m.conversionRate + '% conversie' },
        { label: 'Gem. score',       value: String(m.avgLeadScore) + '/10' },
        { label: 'Gem. reactietijd', value: m.avgResponseTime ? m.avgResponseTime + 's' : '—' },
        { label: 'Pipelinewaarde',   value: money(m.pipelineValue) || '—' },
      ];
      return {
        summary: `Periode ${period}: ${m.total} leads, ${m.qualified} gekwalificeerd, `
          + `${m.booked} afspraken (${m.conversionRate}% conversie)${truncationNote(truncated)}.`,
        data: { metrics: m, period },
        components: [schema.statGroup({ title: `Prestaties (${period})`, stats })],
      };
    }),
  },

  {
    name: 'get_calendar',
    kind: 'read',
    description: 'Haal de komende afspraken op uit Google Agenda. Valt terug op de afspraken die in het CRM staan aangevinkt wanneer de agenda niet gekoppeld is.',
    parameters: {
      type: 'object',
      properties: {
        days:  { type: 'integer', minimum: 1, maximum: 30, default: 7 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
    },
    /* Google Calendar first, CRM booking flags second, and it always says
       which one it used. The two answer different questions -- Calendar knows
       when, the CRM only knows that -- so quietly substituting one for the
       other would let the model tell someone a time that does not exist. */
    run: readTool('get_calendar', async (args, ctx) => {
      const days = args.days || 7;
      const cal = await data.calendarEvents(ctx, { days });

      if (cal.source === 'google') {
        const events = cal.events.slice(0, args.limit || 20);
        if (!events.length) {
          return {
            summary: `Google Agenda is gekoppeld en er staat niets in de komende ${days} dagen.`,
            data: { events: [], source: 'google' }, components: [],
          };
        }
        const stats = events.slice(0, 6).map((e) => ({
          label: e.title || 'Bezet',
          value: formatWhen(e.start, e.allDay),
          sub: e.allDay ? 'hele dag' : formatWhen(e.end, false),
        }));
        return {
          summary: `${events.length} afspraken in de komende ${days} dagen, uit Google Agenda.`,
          data: { events, source: 'google' },
          components: [schema.statGroup({ title: `Agenda (${days} dagen)`, stats })],
        };
      }

      const { leads } = await data.leadsFor(ctx);
      const booked = data.bookedAppointments(leads, { limit: args.limit || 20 });
      const why = cal.reason === 'not_connected'
        ? 'Google Agenda is niet gekoppeld voor deze klant'
        : cal.reason === 'unreachable'
          ? 'Google Agenda was niet bereikbaar'
          : 'Google Agenda is niet geconfigureerd';

      if (!booked.length) {
        return {
          summary: `${why}, en er staan geen afspraken aangevinkt in het CRM.`,
          data: { events: [], source: 'none', reason: cal.reason }, components: [],
        };
      }
      return {
        summary: `${why}. Uit het CRM: ${booked.length} leads met een afspraak aangevinkt. `
          + 'Dit zijn GEEN tijdstippen — noem geen uren, die staan alleen in de agenda.',
        data: { appointments: booked.map(leadForModel), source: 'crm', reason: cal.reason },
        components: booked.slice(0, 8).map(leadToCard),
      };
    }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ACT TOOLS — these build a PROPOSAL. They never execute.
// Exactly four, and the test for membership is "does this have a consequence
// outside Helvaro": a message reaches a customer, a calendar slot is booked, a
// campaign goes out. Drafting and generating are 'create' and run immediately.
// The returned confirmation component is what the user approves in the UI;
// api/_faro/actions.js is the only module that can carry it out.
// ─────────────────────────────────────────────────────────────────────────────

const actTools = [
  /* ── De CRM-schrijfacties ───────────────────────────────────────────────────
     Alles wat je in de app kunt aanklikken hoort ook vraagbaar te zijn. Deze
     vier dekken de gaten die overbleven: een lead verplaatsen, er iets bij
     schrijven, hem weggooien, en de stem van de AI bijstellen.

     Alle vier zijn kind:'act', dus ze STELLEN VOOR en voeren niets uit. Het
     uitvoeren gebeurt in api/_faro/actions.js nadat de gebruiker op de
     bevestigingskaart klikt, en pas daar wordt api/_faro/writes.js aangeroepen
     -- dat als enige de tenant-eigendom van de rij nog eens controleert. */
  {
    /* ── Aanbod toevoegen ─────────────────────────────────────────────────
       Dit is waar het makkelijk moet worden. De dealer plakt een
       AutoScout24-link in de chat en Faro doet de rest -- geen formulier, geen
       overtypen. Werkt ook zonder link: wie "zet er een BMW M4 van 74.999 in"
       typt, krijgt dezelfde bevestigingskaart.

       kind:'act' en niet 'create': er komt een RIJ bij in de voorraad die
       straks meegaat in gesprekken met echte kopers. Dat hoort achter een
       bevestiging te zitten, ook als Faro het goed gelezen heeft. Een model dat
       rechtstreeks in de voorraad schrijft, zet er vroeg of laat een auto in
       die niet bestaat -- en dan staat de dealer tegen een koper te liegen over
       iets wat hij nooit heeft ingevoerd.

       Eén gereedschap voor allebei de markten. De vertical bepaalt hier wat er
       gebeurt, niet het model: die komt uit het klantrecord, dus een makelaar
       kan hier geen voertuig mee aanmaken en omgekeerd. */
    name: 'add_listing',
    kind: 'act',
    description:
      'Voeg iets toe aan het aanbod van deze klant: een pand voor een makelaar, een voertuig voor '
      + 'een autodealer. Geef OFWEL een link naar de advertentiepagina (AutoScout24, Immoweb, ...) '
      + 'en dan lees ik die zelf uit, OFWEL de velden die je al weet. Bij een link hoef je verder '
      + 'niets in te vullen. Wordt pas doorgevoerd na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        link: { type: 'string', description: 'Link naar de advertentie. Als die er is, hoeft de rest niet.' },
        merk: { type: 'string', description: 'Voertuig: merk, bv. BMW.' },
        model: { type: 'string', description: 'Voertuig: model, bv. M4.' },
        uitvoering: { type: 'string', description: 'Voertuig: uitvoering, bv. Competition xDrive.' },
        km: { type: 'number', description: 'Voertuig: kilometerstand.' },
        inschrijving: { type: 'string', description: 'Voertuig: eerste inschrijving als MM/JJJJ.' },
        adres: { type: 'string', description: 'Pand: het adres.' },
        plaats: { type: 'string', description: 'Pand: de gemeente.' },
        prijs: { type: 'number', description: 'De vraagprijs in euro.' },
      },
    },
    run: async (args, ctx) => {
      const _vertical = require('../_vertical');
      const vertical = ctx && ctx.vertical ? ctx.vertical : _vertical.VASTGOED;
      const dealer = vertical === _vertical.DEALERSHIP;

      let velden = {};
      let gelezen = null;
      const link = String((args && args.link) || '').trim();

      if (link && dealer) {
        /* De pagina uitlezen. Mislukt dat, dan is dat GEEN fout: de dealer
           krijgt gewoon de kaart met wat hij zelf meegaf, plus de link. Beter
           een half ingevulde fiche die hij afmaakt dan een foutmelding. */
        try {
          const vehicles = require('../_vehicles');
          gelezen = await vehicles.importeerUitLink(ctx.projectCode, link, { userId: (ctx && ctx.userId) || 'faro' });
          velden = Object.assign({}, gelezen.concept);
        } catch (e) {
          console.warn('[add_listing] link uitlezen mislukt:', e && e.code, e && e.message);
          velden.link = link;
        }
      } else if (link) {
        velden.link = link;
      }

      /* Wat het model zelf meegaf WINT van wat er op de pagina stond. Wie
         zegt "die BMW maar dan voor 72.000" bedoelt 72.000, ook als de
         advertentie 74.999 zegt. */
      for (const k of ['merk', 'model', 'uitvoering', 'km', 'inschrijving', 'adres', 'plaats', 'prijs']) {
        const v = args && args[k];
        if (v !== undefined && v !== null && String(v).trim() !== '') velden[k] = v;
      }

      const naam = dealer
        ? [velden.merk, velden.model, velden.uitvoering].filter(Boolean).join(' ').trim()
        : String(velden.adres || '').trim();

      if (!naam) {
        return {
          summary: dealer
            ? 'Ik weet nog niet welke auto het is. Geef een AutoScout24-link, of merk en model.'
            : 'Ik weet nog niet welk pand het is. Geef een link naar het zoekertje, of het adres.',
          data: { pending: false }, components: [],
        };
      }

      /* Wat er nog ontbreekt, staat op de kaart. Dat is het verschil tussen
         behulpzaam en je laten zoeken: de dealer ziet meteen wat hij nog moet
         aanvullen in plaats van het te moeten opmerken. */
      const regels = [];
      if (velden.prijs) regels.push('Prijs: \u20AC ' + Math.round(Number(velden.prijs)).toLocaleString('nl-BE'));
      if (dealer) {
        if (velden.km || velden.km === 0) regels.push('Kilometerstand: ' + Math.round(Number(velden.km)).toLocaleString('nl-BE') + ' km');
        if (velden.inschrijving) regels.push('Eerste inschrijving: ' + velden.inschrijving);
        if (velden.brandstof)    regels.push('Brandstof: ' + velden.brandstof);
        if (velden.transmissie)  regels.push('Transmissie: ' + velden.transmissie);
        if (velden.kw)           regels.push('Vermogen: ' + velden.kw + ' kW');
        if (velden.kleur)        regels.push('Kleur: ' + velden.kleur);
        if (velden.autoscout)    regels.push('Aanbodnummer herkend, dus WhatsApp-leads uit die advertentie worden automatisch aan deze auto gekoppeld.');
      } else if (velden.plaats) {
        regels.push('Gemeente: ' + velden.plaats);
      }
      if (gelezen && gelezen.ontbreekt && gelezen.ontbreekt.length) {
        regels.push('Nog aan te vullen: ' + gelezen.ontbreekt.join(', ') + '.');
      }
      if (gelezen && gelezen.confidence && gelezen.confidence < 0.5) {
        regels.push('Ik was hier niet zeker van -- kijk het even na voor je bevestigt.');
      }

      return {
        summary: 'Klaar om ' + naam + ' aan ' + (dealer ? 'je voorraad' : 'je aanbod') + ' toe te voegen. Wacht op bevestiging.',
        data: { pending: true },
        components: [schema.confirmation({
          action: 'add_listing',
          title: (dealer ? 'Voertuig toevoegen: ' : 'Pand toevoegen: ') + naam,
          body: regels.length ? regels.join('\n') : 'Nog geen verdere gegevens -- je kunt ze na het toevoegen aanvullen.',
          confirmLabel: 'Toevoegen',
          payload: { vertical, velden },
        })],
      };
    },
  },
  {
    name: 'set_lead_status',
    kind: 'act',
    description:
      'Zet een lead op een andere status: new, in_progress, completed of verloren. '
      + 'Bij "verloren" mag je een reden meegeven. Wordt pas doorgevoerd na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Het record-id van de lead.' },
        status: { type: 'string', enum: ['new', 'in_progress', 'completed', 'verloren'] },
        lossReason: {
          type: 'string',
          enum: ['Prijs te hoog', 'Geen timing', 'Concurrent gekozen', 'Geen interesse', 'Geen reactie', 'Andere reden'],
          description: 'Alleen bij status "verloren".',
        },
      },
      required: ['leadId', 'status'],
    },
    async run(args, ctx) {
      const { leads } = await data.leadsFor(ctx);
      const lead = data.findLead(leads, { leadId: args.leadId });
      // Nu al opzoeken, niet pas bij het uitvoeren: een bevestigingskaart voor
      // een lead die niet bestaat is een klik die alleen op een fout kan
      // uitlopen.
      if (!lead) {
        return { summary: 'Die lead staat niet in dit account. Vraag om welke lead het gaat.',
                 data: { pending: false }, components: [] };
      }
      const labels = { new: 'Nieuw', in_progress: 'In behandeling', completed: 'Gewonnen', verloren: 'Verloren' };
      const naar = labels[args.status] || args.status;
      return {
        summary: `Klaar om ${lead.naam} op "${naar}" te zetten. Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'set_lead_status',
          title: 'Status aanpassen?',
          body: `${lead.naam}\n${lead.status || 'onbekend'} -> ${naar}`
            + (args.lossReason ? `\nReden: ${args.lossReason}` : ''),
          confirmLabel: 'Aanpassen',
          payload: { leadId: lead.id, status: args.status, lossReason: args.lossReason || undefined },
        })],
      };
    },
  },

  {
    name: 'add_lead_note',
    kind: 'act',
    description:
      'Schrijf een notitie bij een lead. De notitie wordt toegevoegd onder wat er al staat, '
      + 'met datum ervoor. Wordt pas opgeslagen na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        note:   { type: 'string', description: 'De notitie zelf.' },
      },
      required: ['leadId', 'note'],
    },
    async run(args, ctx) {
      const note = String(args.note || '').trim();
      if (!note) {
        return { summary: 'Er is geen notitietekst. Vraag wat er genoteerd moet worden.',
                 data: { pending: false }, components: [] };
      }
      const { leads } = await data.leadsFor(ctx);
      const lead = data.findLead(leads, { leadId: args.leadId });
      if (!lead) {
        return { summary: 'Die lead staat niet in dit account.', data: { pending: false }, components: [] };
      }
      return {
        summary: `Notitie klaar voor ${lead.naam}. Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'add_lead_note',
          title: 'Notitie opslaan?',
          body: `${lead.naam}\n\n${note}`,
          confirmLabel: 'Opslaan',
          payload: { leadId: lead.id, note },
        })],
      };
    },
  },

  {
    name: 'delete_lead',
    kind: 'act',
    description:
      'Verwijder een lead definitief uit het CRM. Onomkeerbaar. Gebruik dit alleen als de '
      + 'gebruiker er expliciet om vraagt, en nooit uit jezelf.',
    parameters: {
      type: 'object',
      properties: { leadId: { type: 'string' } },
      required: ['leadId'],
    },
    async run(args, ctx) {
      const { leads } = await data.leadsFor(ctx);
      const lead = data.findLead(leads, { leadId: args.leadId });
      if (!lead) {
        return { summary: 'Die lead staat niet in dit account.', data: { pending: false }, components: [] };
      }
      /* De kaart zegt wat er weggaat en dat het niet terugkomt. Een
         bevestiging die alleen "Weet je het zeker?" vraagt laat de gebruiker
         raden wat hij bevestigt. */
      return {
        summary: `Klaar om ${lead.naam} te verwijderen. Dit is onomkeerbaar. Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'delete_lead',
          title: 'Lead verwijderen?',
          body: `${lead.naam}${lead.telefoon ? ' - ' + lead.telefoon : ''}\n\n`
            + 'Het gesprek, de samenvatting en de notities gaan mee. Dit kan niet ongedaan gemaakt worden.',
          confirmLabel: 'Definitief verwijderen',
          payload: { leadId: lead.id },
        })],
      };
    },
  },

  {
    name: 'update_ai_persona',
    kind: 'act',
    description:
      'Pas aan hoe de WhatsApp-AI zich gedraagt: naam, welkomstbericht, instructies, werkuren, '
      + 'of de introtekst van het leadformulier. Geef alleen mee wat er moet veranderen. '
      + 'Wordt pas opgeslagen na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        aiName:         { type: 'string', description: 'De naam waarmee de AI zich voorstelt.' },
        autoReplyTpl:   { type: 'string', description: 'Het eerste bericht dat een lead krijgt.' },
        aiInstructions: { type: 'string', description: 'Vrije instructies over toon en werkwijze.' },
        workingHours:   { type: 'string', description: 'Bijvoorbeeld "ma-vr 9-18".' },
        formIntro:      { type: 'string', description: 'De introtekst boven het leadformulier.' },
      },
    },
    async run(args, _ctx) {
      const velden = ['aiName', 'autoReplyTpl', 'aiInstructions', 'workingHours', 'formIntro'];
      const patch = {};
      for (const k of velden) if (args[k] !== undefined) patch[k] = String(args[k]);
      if (!Object.keys(patch).length) {
        return { summary: 'Er is niets meegegeven om aan te passen. Vraag wat er moet veranderen.',
                 data: { pending: false }, components: [] };
      }
      const labels = {
        aiName: 'AI-naam', autoReplyTpl: 'Welkomstbericht', aiInstructions: 'AI-instructies',
        workingHours: 'Werkuren', formIntro: 'Formuliertekst',
      };
      /* De kaart toont de nieuwe WAARDE en niet alleen de veldnaam: "AI-naam
         wordt aangepast" laat je klikken zonder te weten waarin. */
      const regels = Object.keys(patch).map((k) => {
        const v = patch[k];
        return labels[k] + ': ' + (v.length > 140 ? v.slice(0, 140) + '...' : v || '(leeg)');
      });
      return {
        summary: `Klaar om ${regels.length} instelling(en) aan te passen. Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'update_ai_persona',
          title: 'Instellingen aanpassen?',
          body: regels.join('\n\n'),
          confirmLabel: 'Opslaan',
          payload: patch,
        })],
      };
    },
  },

  {
    name: 'move_appointment',
    kind: 'act',
    description:
      'Verzet een bestaande afspraak naar een ander tijdstip. Gebruik get_calendar om het '
      + 'eventId te vinden. Wordt pas verzet na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        eventId:     { type: 'string', description: 'Het id uit get_calendar.' },
        when:        { type: 'string', description: 'Nieuwe starttijd als ISO-datum/tijd.' },
        durationMin: { type: 'integer', minimum: 15, maximum: 480, default: 60 },
      },
      required: ['eventId', 'when'],
    },
    async run(args, ctx) {
      const startMs = Date.parse(args.when);
      if (!Number.isFinite(startMs)) {
        return { summary: `"${args.when}" is geen geldige datum/tijd. Vraag wanneer precies.`,
                 data: { pending: false }, components: [] };
      }
      if (startMs < Date.now() - 60000) {
        return { summary: 'Dat tijdstip ligt in het verleden. Vraag om een moment in de toekomst.',
                 data: { pending: false }, components: [] };
      }
      // De afspraak eerst opzoeken, zodat de kaart kan tonen WAT er verzet
      // wordt en niet alleen een id.
      const cal = await data.calendarEvents(ctx, { days: 60 });
      if (cal.source !== 'google') {
        return {
          summary: cal.reason === 'not_connected'
            ? 'Google Agenda is niet gekoppeld, dus er valt niets te verzetten.'
            : 'Google Agenda is nu niet bereikbaar.',
          data: { pending: false }, components: [],
        };
      }
      const ev = (cal.events || []).find((e) => e && e.id === args.eventId);
      if (!ev) {
        return { summary: 'Die afspraak staat niet in de agenda. Noem get_calendar om te kijken wat er staat.',
                 data: { pending: false }, components: [] };
      }
      const durationMin = Math.max(15, Math.min(480, args.durationMin || 60));
      return {
        summary: `Klaar om "${ev.title || 'afspraak'}" te verzetten. Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'move_appointment',
          title: 'Afspraak verzetten?',
          body: `${ev.title || 'Afspraak'}\n${formatWhen(ev.start, false)}`
            + `\n-> ${formatWhen(new Date(startMs).toISOString(), false)} - ${durationMin} min`,
          confirmLabel: 'Verzetten',
          payload: { eventId: ev.id, startISO: new Date(startMs).toISOString(), durationMin },
        })],
      };
    },
  },

  {
    name: 'cancel_appointment',
    kind: 'act',
    description:
      'Zeg een afspraak af en haal hem uit de agenda. Let op: de lead krijgt hier GEEN bericht over. '
      + 'Wordt pas afgezegd na bevestiging.',
    parameters: {
      type: 'object',
      properties: { eventId: { type: 'string' } },
      required: ['eventId'],
    },
    async run(args, ctx) {
      const cal = await data.calendarEvents(ctx, { days: 60 });
      if (cal.source !== 'google') {
        return {
          summary: cal.reason === 'not_connected'
            ? 'Google Agenda is niet gekoppeld, dus er valt niets af te zeggen.'
            : 'Google Agenda is nu niet bereikbaar.',
          data: { pending: false }, components: [],
        };
      }
      const ev = (cal.events || []).find((e) => e && e.id === args.eventId);
      if (!ev) {
        return { summary: 'Die afspraak staat niet in de agenda.', data: { pending: false }, components: [] };
      }
      return {
        summary: `Klaar om "${ev.title || 'afspraak'}" af te zeggen. Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'cancel_appointment',
          title: 'Afspraak afzeggen?',
          body: `${ev.title || 'Afspraak'}\n${formatWhen(ev.start, false)}\n\n`
            + 'De lead krijgt hier geen bericht over.',
          confirmLabel: 'Afzeggen',
          payload: { eventId: ev.id },
        })],
      };
    },
  },

  {
    name: 'create_followup',
    kind: 'act',
    description: 'Stel een opvolgbericht op voor één of meer leads en vraag bevestiging om het via WhatsApp te versturen. Schrijf het bericht zelf en geef het mee in `message`. Het wordt pas verstuurd nadat de gebruiker bevestigt.',
    parameters: {
      type: 'object',
      properties: {
        leadIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 25 },
        message: { type: 'string', description: 'Het volledige bericht, in de taal van de lead. Persoonlijk, kort, en zonder placeholders.' },
        intent:  { type: 'string', description: 'Wat het bericht moet bereiken' },
      },
      required: ['leadIds', 'message'],
    },
    /* Checks the 24-hour window BEFORE proposing, not after confirming.
     *
     * Meta only allows a free-form WhatsApp message within 24 hours of the
     * lead's own last message; outside it the API rejects the send. Learning
     * that at execution time would mean showing the user a confirmation for
     * something that cannot happen, then failing after they clicked it. So the
     * proposal itself says which leads are actually reachable, and the
     * confirmation card only covers those.
     */
    async run(args, ctx) {
      const message = String(args.message || '').trim();
      if (!message) {
        return {
          summary: 'Geen bericht meegegeven. Schrijf het opvolgbericht zelf en geef het mee in `message`.',
          data: { pending: false }, components: [],
        };
      }
      if (message.length > 900) {
        return {
          summary: 'Bericht te lang voor WhatsApp-opvolging. Houd het onder 900 tekens.',
          data: { pending: false }, components: [],
        };
      }

      let leads;
      try {
        ({ leads } = await data.leadsFor(ctx));
      } catch (err) {
        if (err instanceof data.DataUnavailable) {
          return {
            summary: `KAN NIET LEZEN: ${err.message} Er is niets voorbereid.`,
            data: { pending: false }, components: [],
          };
        }
        throw err;
      }

      const reachable = [];
      const blocked = [];
      for (const id of args.leadIds.slice(0, 25)) {
        const lead = data.findLead(leads, { leadId: id, name: id });
        if (!lead) { blocked.push({ id, naam: null, reason: 'unknown_lead' }); continue; }
        if (!lead.telefoon) { blocked.push({ id, naam: lead.naam, reason: 'no_phone' }); continue; }
        const win = data.messagingWindow(lead);
        if (!win.open) { blocked.push({ id, naam: lead.naam, reason: win.reason }); continue; }
        reachable.push({ id: lead.id, naam: lead.naam, telefoon: lead.telefoon, hoursLeft: win.hoursLeft });
      }

      const why = {
        unknown_lead: 'bestaat niet in dit CRM',
        no_phone: 'heeft geen telefoonnummer',
        window_closed: 'reageerde langer dan 24 uur geleden — WhatsApp staat dan alleen een goedgekeurde template toe',
        no_inbound_timestamp: 'heeft nog nooit zelf een bericht gestuurd, dus het 24-uursvenster is nooit geopend',
      };
      const blockedLine = blocked.length
        ? ' Niet bereikbaar: ' + blocked.map((b) => `${b.naam || b.id} (${why[b.reason] || b.reason})`).join('; ') + '.'
        : '';

      if (!reachable.length) {
        return {
          summary: 'Geen van deze leads kan nu een vrij WhatsApp-bericht ontvangen.' + blockedLine
            + ' Vertel dit eerlijk; stel niet voor om het toch te proberen.',
          data: { pending: false, blocked }, components: [],
        };
      }

      return {
        summary: `Opvolgbericht klaar voor ${reachable.length} lead(s).${blockedLine} Wacht op bevestiging.`,
        data: { pending: true, reachable, blocked },
        components: [schema.confirmation({
          action: 'create_followup',
          title: reachable.length === 1
            ? `Bericht sturen naar ${reachable[0].naam}?`
            : `Bericht sturen naar ${reachable.length} leads?`,
          body: `${message}\n\n— via WhatsApp naar: ${reachable.map((r) => r.naam).join(', ')}`,
          confirmLabel: 'Versturen',
          // Only ids and the message travel. Phone numbers are re-resolved at
          // execution time from the tenant's own rows, so a modified payload
          // cannot redirect a message to an arbitrary number.
          payload: { leadIds: reachable.map((r) => r.id), message, intent: args.intent || '' },
        })],
      };
    },
  },

  {
    name: 'schedule_followup',
    kind: 'act',
    description: 'Zet een HERINNERING voor de gebruiker zelf in hun Google Agenda — bijvoorbeeld "bel Karel donderdag". Gebruik dit NIET om een bezichtiging met een lead te boeken: dat doet de WhatsApp-AI zelf in het gesprek, met de agenda erbij. Wordt pas aangemaakt nadat de gebruiker bevestigt.',
    parameters: {
      type: 'object',
      properties: {
        leadId:      { type: 'string', description: 'Optioneel: de lead waar dit over gaat.' },
        title:       { type: 'string', description: 'Titel van het agenda-item.' },
        when:        { type: 'string', description: 'Starttijd als ISO-datum/tijd, bv. 2026-08-21T14:00:00' },
        durationMin: { type: 'integer', minimum: 15, maximum: 480, default: 60 },
        note:        { type: 'string' },
      },
      required: ['when'],
    },
    /* This books nothing with a lead. Viewings are booked by the WhatsApp AI
       inside the conversation, where it reads the lead's proposed time, checks
       the client's calendar and confirms in the thread (api/whatsapp.js step
       11b). What this creates is the AGENT'S own reminder — the "call Karel
       Thursday" kind — which is why nothing here messages anybody.

       Validates the time and the connection BEFORE proposing: a confirmation
       card for a calendar that is not connected, or for a date the model
       hallucinated, is a click that can only end in an error. */
    async run(args, ctx) {
      const startMs = Date.parse(args.when);
      if (!Number.isFinite(startMs)) {
        return {
          summary: `"${args.when}" is geen geldige datum/tijd. Vraag de gebruiker wanneer precies.`,
          data: { pending: false }, components: [],
        };
      }
      if (startMs < Date.now() - 60000) {
        return {
          summary: 'Dat tijdstip ligt in het verleden. Vraag om een moment in de toekomst.',
          data: { pending: false }, components: [],
        };
      }

      const cal = await data.calendarEvents(ctx, { days: 1 });
      if (cal.source !== 'google') {
        return {
          summary: cal.reason === 'not_connected'
            ? 'Google Agenda is niet gekoppeld voor deze klant, dus er kan niets ingepland worden. '
              + 'Wijs de gebruiker naar Instellingen om de agenda te koppelen.'
            : 'Google Agenda is nu niet bereikbaar, dus er kan niets ingepland worden.',
          data: { pending: false, reason: cal.reason }, components: [],
        };
      }

      let lead = null;
      if (args.leadId) {
        try {
          const { leads } = await data.leadsFor(ctx);
          lead = data.findLead(leads, { leadId: args.leadId });
        } catch (_) { /* the appointment stands without the lead's name */ }
      }

      const durationMin = Math.max(15, Math.min(480, args.durationMin || 60));
      const title = String(args.title || '').trim()
        || (lead ? `Opvolging ${lead.naam}` : 'Opvolging');

      return {
        summary: `Agenda-item "${title}" klaar voor ${formatWhen(new Date(startMs).toISOString(), false)}. Wacht op bevestiging.`,
        data: { pending: true, startMs, durationMin, title },
        components: [schema.confirmation({
          action: 'schedule_followup',
          title: 'Inplannen in je agenda?',
          body: `${title}\n${formatWhen(new Date(startMs).toISOString(), false)} · ${durationMin} min`
            + (lead ? `\nLead: ${lead.naam}` : '')
            + (args.note ? `\n${args.note}` : ''),
          confirmLabel: 'Inplannen',
          payload: {
            title, startISO: new Date(startMs).toISOString(), durationMin,
            note: args.note || '', leadId: args.leadId || null,
          },
        })],
      };
    },
  },

  {
    name: 'create_campaign',
    kind: 'act',
    description: 'Stel een campagne samen voor dit kantoor: een naam, de campagnetekst, een invalshoek, kanalen en een leadselectie. SCHRIJF DE TEKST ZELF en geef hem mee in `message` -- deze tool bewaart hem, hij schrijft niet voor jou. De campagne wordt alleen AANGEMAAKT; er gaat niets de deur uit. Wordt pas uitgevoerd na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        /* `name` is verplicht en `propertyId` niet, andersom dan eerst.
           Een campagne heeft altijd een naam nodig om later terug te vinden;
           een pand niet -- "leads die zes maanden niets gehoord hebben" is een
           campagne zonder pand, en api/_campagnes.js kon dat allang aan. */
        name:       { type: 'string', description: 'Korte herkenbare naam, bv. "Villa Knokke - najaarsactie"' },
        message:    { type: 'string', description: 'De volledige campagnetekst, klaar om te gebruiken. Schrijf hem zelf.' },
        propertyId: { type: 'string', description: 'Pandcode wanneer de campagne over een specifiek pand gaat (P1, VH-2291). Optioneel.' },
        channels:   { type: 'array', items: { type: 'string', enum: ['whatsapp', 'email', 'social'] } },
        leadIds:    { type: 'array', items: { type: 'string' } },
        angle:      { type: 'string', description: 'Invalshoek of doelgroep' },
      },
      required: ['name'],
    },
    async run(args, _ctx) {
      // Een bevestigingspoort die niet zegt WAT hij gaat doen, is geen poort.
      // Hier stond alleen "Helvaro maakt de campagne aan met de voorbereide
      // teksten en media" — geen pand, geen kanalen, geen doelgroep, geen
      // aantal leads — met daaronder een knop die het echt doet. Je kunt dan
      // niet bevestigen, alleen maar hopen.
      const kanaalNamen = { whatsapp: 'WhatsApp', email: 'e-mail', social: 'sociale media' };
      const kanalen = (args.channels || []).map((c) => kanaalNamen[c] || c);
      const regels = [];
      if (args.name)       regels.push(`Naam: ${args.name}`);
      if (args.propertyId) regels.push(`Pand: ${args.propertyId}`);
      if (kanalen.length)  regels.push(`Kanalen: ${kanalen.join(', ')}`);
      if (args.angle)      regels.push(`Invalshoek: ${args.angle}`);
      /* De TEKST hoort in de poort, want dat is het enige wat de klant straks
         leest. Afgekapt op 300 tekens: een poort die je moet scrollen om de
         knop te vinden wordt weggeklikt in plaats van gelezen. */
      if (args.message) {
        const t = String(args.message).trim();
        regels.push(`\nTekst:\n${t.length > 300 ? t.slice(0, 300) + '\u2026' : t}`);
      }
      regels.push((args.leadIds && args.leadIds.length)
        ? `Doelgroep: ${args.leadIds.length} geselecteerde lead(s)`
        : 'Doelgroep: nog geen leads geselecteerd');

      return stub('Campagne voorbereid. Wacht op bevestiging.', { pending: true },
        [schema.confirmation({
          action: 'create_campaign',
          title: 'Campagne aanmaken?',
          body: regels.join('\n') + '\n\nEr wordt nog niets verstuurd — de campagne wordt alleen aangemaakt.',
          confirmLabel: 'Aanmaken',
          payload: args,
        })]);
    },
  },

  {
    name: 'add_leads_to_campaign',
    kind: 'act',
    description: 'Voeg geselecteerde leads toe aan een bestaande campagne. Wordt pas uitgevoerd na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        campaignId: { type: 'string' },
        leadIds:    { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
      required: ['campaignId', 'leadIds'],
    },
    async run(args, _ctx) {
      return stub('Leads voorbereid om toe te voegen.', { pending: true },
        [schema.confirmation({
          action: 'add_leads_to_campaign',
          title: 'Leads toevoegen aan campagne?',
          body: `${args.leadIds.length} lead(s) worden toegevoegd.`,
          confirmLabel: 'Toevoegen',
          payload: args,
        })]);
    },
  },

  /* ── Advertentieteksten voor Meta en Google ────────────────────────────────
     De site belooft "ad copy, hooks en varianten om te testen". Daar stond
     niets tegenover: write_listing levert EEN pandtekst, en dat is iets anders
     dan drie varianten van een advertentie binnen een tekenlimiet.

     Waarom de limieten hier gecontroleerd worden en niet alleen in de
     beschrijving staan: een model schrijft met plezier een Google-kop van 45
     tekens. Die wordt door Google geweigerd, en dat merkt de makelaar pas in
     Ads Manager -- ver van hier, zonder dat iets naar deze tekst wijst. De
     limieten zijn geen stijladvies maar de regels van het platform, dus ze
     horen geteld te worden op de plek waar de tekst gemaakt wordt.

     Er wordt NIETS gepubliceerd. Dit levert concepten op, net als
     write_listing: kind 'create', geen bevestigingspoort, want er verandert
     niets buiten Helvaro. Naar Meta of Google duwen zou een aparte,
     bevestigde stap zijn met een advertentieaccount eraan. */
  {
    name: 'write_ad_copy',
    kind: 'create',
    description:
      'Lever advertentieteksten op als bewerkbare concepten, met meerdere varianten om te testen. '
      + 'SCHRIJF DE TEKSTEN ZELF en geef ze mee in `variants` -- deze tool telt de tekens, '
      + 'bewaart ze en toont ze; hij schrijft niet voor jou. '
      + 'Roep eerst get_brand_voice aan zodat de teksten in de stem van dit kantoor staan. '
      + 'Er wordt niets gepubliceerd.',
    parameters: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['meta', 'google'],
                    description: 'meta = Facebook/Instagram, google = Google Ads (zoeknetwerk).' },
        angle:    { type: 'string', description: 'De invalshoek of doelgroep die deze set test.' },
        variants: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          description: 'Meerdere varianten om tegen elkaar te testen. Varieer de HOEK, niet alleen de woorden.',
          items: {
            type: 'object',
            properties: {
              headline: { type: 'string', description: 'De kop. Google max 30 tekens, Meta max 40.' },
              body:     { type: 'string', description: 'De tekst. Google max 90 tekens, Meta ~125 voor het afkappen.' },
              hook:     { type: 'string', description: 'Optioneel: de haak of hoek van deze variant in een paar woorden.' },
            },
            required: ['headline', 'body'],
          },
        },
      },
      required: ['platform', 'variants'],
    },
    async run(args, _ctx) {
      /* De echte limieten van de platforms, augustus 2026. Google weigert
         hierboven; Meta kapt af in de feed -- vandaar 'max' en 'afkap'. */
      const LIMIETEN = {
        google: { headline: 30, body: 90,  hard: true,
                  naam: 'Google Ads', uitleg: 'Google WEIGERT teksten boven de limiet.' },
        meta:   { headline: 40, body: 125, hard: false,
                  naam: 'Meta (Facebook/Instagram)', uitleg: 'Meta kapt langere tekst af in de feed met "meer weergeven".' },
      };
      const platform = String(args.platform || '').toLowerCase();
      const L = LIMIETEN[platform];
      if (!L) {
        return { summary: 'Kies platform "meta" of "google".', data: { draft: null }, components: [] };
      }

      const varianten = Array.isArray(args.variants) ? args.variants.slice(0, 8) : [];
      if (!varianten.length) {
        return {
          summary: 'Geen varianten meegegeven. Schrijf de advertentieteksten zelf en geef ze mee in `variants`.',
          data: { draft: null }, components: [],
        };
      }

      const teLang = [];
      /* Apart bijgehouden, want een variant kan TWEE overtredingen hebben (kop
         en tekst). Tellen op teLang.length zou dan "2 varianten te lang"
         melden terwijl het er een is -- en een makelaar die er twee gaat zoeken
         vindt er maar een en vertrouwt de melding daarna niet meer. */
      const variantenTeLang = new Set();
      const regels = varianten.map((v, n) => {
        const kop  = String((v && v.headline) || '').trim();
        const body = String((v && v.body) || '').trim();
        const haak = String((v && v.hook) || '').trim();
        if (kop.length  > L.headline) { teLang.push(`variant ${n + 1} kop (${kop.length}/${L.headline})`); variantenTeLang.add(n); }
        if (body.length > L.body)     { teLang.push(`variant ${n + 1} tekst (${body.length}/${L.body})`); variantenTeLang.add(n); }
        return [
          `${n + 1}. ${haak ? haak + ' — ' : ''}${kop}   [${kop.length}/${L.headline}]`,
          `   ${body}   [${body.length}/${L.body}]`,
        ].join('\n');
      });

      /* De uitkomst zegt WELKE variant te lang is en hoeveel. "Sommige teksten
         zijn te lang" laat de makelaar zelf tellen; dit is precies het soort
         werk dat de computer hoort te doen. */
      const waarschuwing = teLang.length
        ? `\n\nTE LANG: ${teLang.join(', ')}. ${L.uitleg}`
        : '';

      const titel = `${L.naam}${args.angle ? ' — ' + args.angle : ''}`;
      return {
        summary: `${varianten.length} advertentievariant(en) voor ${L.naam} opgeleverd`
          + (variantenTeLang.size
              ? `, waarvan ${variantenTeLang.size} boven de limiet`
              : ', alle binnen de limiet')
          + '. Er is niets gepubliceerd.',
        data: { platform, variants: varianten.length, variantenTeLang: variantenTeLang.size, overtredingen: teLang.length },
        components: [schema.draft({
          id: 'ad-' + Date.now(),
          title: titel,
          body: regels.join('\n\n') + waarschuwing,
          meta: { platform, varianten: varianten.length, binnenLimiet: variantenTeLang.size === 0 },
        })],
      };
    },
  },

  {
    name: 'write_listing',
    kind: 'create',
    description: 'Lever een geschreven pandtekst op als bewerkbaar concept. Schrijf de tekst zelf en geef hem mee in `body` — deze tool bewaart en toont hem, hij schrijft niet voor jou. Gebruik get_lead of search_leads eerst wanneer de tekst over een bestaande lead gaat.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Korte titel, bv. "Villa Knokke-Heist — 4 slaapkamers"' },
        body:  { type: 'string', description: 'De volledige verkooptekst, klaar om te publiceren.' },
        leadId: { type: 'string', description: 'Optioneel: de lead waar deze tekst bij hoort.' },
        length: { type: 'string', enum: ['kort', 'normaal', 'uitgebreid'], default: 'normaal' },
        tone:   { type: 'string', enum: ['luxe', 'zakelijk', 'warm'], default: 'luxe' },
      },
      required: ['title', 'body'],
    },
    /* The model writes the copy; this tool packages it.
     *
     * The obvious alternative -- a second model call inside the tool, driven by
     * a propertyId -- was what the stub was shaped for, and it is wrong twice.
     * There is no property table for a propertyId to point at, and the model
     * that already has the whole conversation (the brief, the lead, the three
     * corrections the user made two messages ago) would be handing a summary of
     * all that to a second model with none of it. Writing is what the model is
     * for; the tool's job is to turn the text into an artifact the user can see
     * and edit, which is exactly how a chat assistant's documents work.
     *
     * Drafting changes nothing outside Helvaro, so this is 'create', not 'act'.
     * Publishing it anywhere would be a separate, confirmed step.
     */
    async run(args, ctx) {
      const title = String(args.title || '').trim();
      const body = String(args.body || '').trim();
      if (!body) {
        return {
          summary: 'Geen tekst meegegeven. Schrijf de pandtekst zelf en geef hem mee in `body`.',
          data: { draft: null }, components: [],
        };
      }

      // Bounded so one turn cannot push an unbounded blob into the transcript
      // that every later turn then pays for in input tokens.
      const MAX = 6000;
      const text = body.length > MAX ? body.slice(0, MAX) : body;

      const meta = [];
      if (args.tone) meta.push(args.tone);
      if (args.length) meta.push(args.length);

      let leadName = '';
      if (args.leadId) {
        try {
          const { leads } = await data.leadsFor(ctx);
          const lead = data.findLead(leads, { leadId: args.leadId });
          if (lead) { leadName = lead.naam; meta.push(lead.naam); }
        } catch (_) { /* the draft is still valid without the lead's name */ }
      }

      return {
        summary: `Pandtekst "${title || 'concept'}" opgeleverd (${text.length} tekens)`
          + (body.length > MAX ? ', ingekort' : '') + '.',
        data: { draft: { title, body: text, leadId: args.leadId || null, leadName } },
        components: [schema.draft({
          id: 'listing-' + Date.now().toString(36),
          title: title || 'Pandtekst',
          body: text,
          meta: meta.join(' · '),
        })],
      };
    },
  },
];

/*
 * Build generate_property_image's JSON Schema from api/_images.js's option
 * arrays. Enum VALUES are the keys the backend validates against; the Dutch
 * labels go in the description so the model can match them to what a user
 * actually types ("zachtgroen", "warm avondlicht").
 */
function enumOf(list, hint) {
  return {
    type: 'string',
    enum: [''].concat(list.map((x) => x.key)),
    description: `${hint} Keuzes: ${list.map((x) => `${x.key} (${x.label})`).join(', ')}. Leeg = automatisch.`,
  };
}

function imageParams() {
  return {
    type: 'object',
    properties: {
      style: {
        type: 'string',
        enum: images.PROPERTY_STYLES.map((x) => x.key),
        description: `De gewenste stijl. Verplicht. Keuzes: ${images.PROPERTY_STYLES.map((x) => `${x.key} (${x.label})`).join(', ')}. Gebruik 'staging' wanneer een LEGE ruimte ingericht moet worden.`,
      },
      prompt: {
        type: 'string',
        description: 'De vraag van de gebruiker in hun eigen woorden. Neem details op die nergens anders passen, zoals "behoud de open haard" of "meer planten".',
      },
      roomType:        enumOf(images.ROOM_TYPES, 'Welke ruimte op de foto staat.'),
      renovationDepth: {
        type: 'string',
        enum: images.RENOVATION_DEPTHS.map((x) => x.key),
        description: `Hoe ingrijpend. Keuzes: ${images.RENOVATION_DEPTHS.map((x) => `${x.key} (${x.label})`).join(', ')}. Kies 'full' bij woorden als verbouwen of renoveren, 'light' bij opfrissen of restylen.`,
      },
      furniture:  enumOf(images.FURNITURE_LEVELS, 'Hoeveel meubilair.'),
      wallFinish: enumOf(images.WALL_FINISHES, "De muurafwerking. Zet op 'painted' zodra de gebruiker een kleur noemt."),
      wallColor:  enumOf(images.WALL_COLORS, 'De dichtstbijzijnde muurkleur uit de lijst. Staat de gevraagde kleur er niet bij, laat dit leeg en gebruik wallColorNote.'),
      wallColorNote: {
        type: 'string',
        maxLength: 80,
        description: "De gevraagde kleur in de woorden van de gebruiker, bv. 'terracotta', 'RAL 7016' of 'zelfde tint als de kastjes'. Werkt alleen samen met wallFinish 'painted'.",
      },
      floor:    enumOf(images.FLOOR_TYPES, 'Het vloertype.'),
      lighting: enumOf(images.LIGHTING_MOODS, 'De lichtsfeer.'),

      // The client-customisable axes, straight from the registry — palette,
      // vibe, material, landscaping today, and whatever is added tomorrow
      // without an edit here.
      ...Object.fromEntries(images.EXTRA_AXES.map((a) => [a.key, enumOf(a.list, `${a.label}.`)])),

      // Free text: the things a list can never enumerate.
      ...Object.fromEntries(images.OBJECT_AXES.map((a) => [a.key, {
        type: 'string',
        maxLength: images.MAX_OBJECT_NOTE_LENGTH,
        description: `${a.label}: wat de gebruiker specifiek genoemd heeft, in hun eigen woorden. Bijvoorbeeld 'de open haard' of 'het gele behang'. Leeg laten als ze niets noemen.`,
      }])),
    },
    required: ['style'],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA TOOLS
// Images are wired and run inside the turn — an image edit finishes well within
// the 60s function budget, so the user gets the picture in the reply rather
// than a placeholder that resolves later.
// Video is not wired: no provider is chosen, and nothing useful finishes in 60s,
// so when it lands it will be a polled job (see ./media.js).
// ─────────────────────────────────────────────────────────────────────────────

const mediaTools = [
  {
    name: 'generate_property_image',
    kind: 'create',
    description:
      'Verbouw of restyle een pandfoto die de gebruiker heeft meegestuurd. Gebruik dit zodra iemand een foto ' +
      'stuurt en vraagt om een renovatie, restyling, andere kleur, andere vloer, andere sfeer of een ingerichte ' +
      'versie van een lege ruimte. Vertaal wat de gebruiker schrijft naar de velden hieronder — hoe meer je ' +
      'invult, hoe dichter het resultaat bij de vraag ligt. Laat een veld leeg als de gebruiker er niets over ' +
      'zegt; dan bepaalt het systeem het zelf. Noemt de gebruiker een kleur voor de muren, zet dan wallFinish ' +
      "op 'painted' en schrijf de kleur in de woorden van de gebruiker in wallColorNote — ook als die kleur " +
      'niet in de lijst wallColor staat. Vertaal ook sfeer en kleurgevoel: "warm en gezellig" is vibe cozy, ' +
      '"aardetinten" is palette earth, "veel eiken" is material oak. Noemt de gebruiker iets dat moet blijven ' +
      "of weg moet — \"behoud de open haard\", \"weg met dat behang\" — zet dat in preserve of remove.",
    // The schema is BUILT from api/_images.js's own option arrays, so every
    // enum is exactly what the backend will accept and the labels the model
    // reads are the labels the user sees.
    //
    // This is the difference between the feature working and not. With free
    // strings the model guesses ("luxurious", "hardwood", "sage-green") and
    // every near-miss is a 400 the user experiences as "it just failed".
    // With enums it cannot emit an invalid key at all, and a style added to
    // PROPERTY_STYLES becomes available to the model with no edit here.
    parameters: imageParams(),
    async run(args, ctx) {
      const photo = (ctx.attachments || [])[0];
      if (!photo) {
        return stub('Geen foto meegestuurd. Vraag de gebruiker om een pandfoto toe te voegen.', { needsPhoto: true });
      }
      try {
        const record = await images.generateForClient(ctx.projectCode, {
          dataUrl: `data:${photo.mediaType};base64,${photo.data}`,
          style: args.style,
          // The user's own phrasing, verbatim. buildTransformPrompt appends it
          // as "Additional client instructions", which is what carries the
          // things no enum can express — "behoud de open haard", "meer planten".
          customPrompt: args.prompt || '',
          roomType: args.roomType || '',
          renovationDepth: args.renovationDepth || '',
          furniture: args.furniture || '',
          wallFinish: args.wallFinish || '',
          wallColor: args.wallColor || '',
          // Free text, capped at 80 chars by _images.js. This is how a colour
          // outside the six keys survives — "terracotta", "RAL 7016", "dezelfde
          // groentint als de keukenkastjes".
          wallColorNote: args.wallColorNote || '',
          floor: args.floor || '',
          lighting: args.lighting || '',
          // Registry-driven, so a new axis flows through with no edit here.
          ...Object.fromEntries(images.EXTRA_AXES.map((a) => [a.key, args[a.key] || ''])),
          ...Object.fromEntries(images.OBJECT_AXES.map((a) => [a.key, args[a.key] || ''])),
        }, { credits });

        return {
          summary: 'Beeld gegenereerd.',
          data: { image: record },
          components: [schema.mediaJob({
            jobId: record.id, kind: 'image', state: 'ready',
            resultUrl: record.url,
            // sourceUrl drives the before/after toggle on the card. It is
            // best-effort upstream, so the card must cope with it being absent.
            meta: { sourceUrl: record.sourceUrl || null, style: args.style },
            // Only actions that work today. schema.mediaJob's fuller default
            // set includes save-to-property and variation, which are not wired
            // — offering them here would be four buttons where two do anything.
            actions: [{ key: 'download', label: 'Downloaden' }],
          })],
        };
      } catch (err) {
        // Surface the failure BOTH ways. The summary goes back to the model so
        // it can explain in its own words; the error card goes to the screen so
        // the user is never left with a half-sentence and nothing else. Out of
        // credits and missing-key are the two that will actually happen.
        const message = err.message || 'Beeldgeneratie mislukt.';
        return {
          summary: message,
          data: { error: true },
          components: [schema.errorCard({
            message,
            retryable: err.code !== 'credit_limit_reached',
            code: err.code || 'image_failed',
          })],
        };
      }
    },
  },

  {
    name: 'generate_property_video',
    /* 'act' en niet 'create', anders dan bij beeld. Een video kost 150 tot 300
       credits -- meer dan een halve dag leadgesprekken -- en start een opdracht
       bij een leverancier die niet meer te annuleren is. Dat hoort achter een
       klik, niet achter een zin. */
    kind: 'act',
    description: 'Genereer een korte marketingvideo voor een pand.',
    parameters: {
      type: 'object',
      properties: {
        propertyId:  { type: 'string' },
        sourceImageIds: { type: 'array', items: { type: 'string' } },
        prompt:      { type: 'string' },
        // Driven by the model registry, not by literals. These used to read
        // [10, 15, 30] while every wired model accepts only 4, 8 or 12 —
        // meaning EVERY duration the model could choose was one the provider
        // would reject. An enum that cannot produce a valid value is worse
        // than no enum: it reads as a working feature right up to the 400.
        durationSec: {
          type: 'integer',
          enum: mediaModels.videoModel().durationsSec,
          default: mediaModels.videoModel().defaultDurationSec,
        },
        format:      { type: 'string', enum: ['9:16', '16:9', '1:1'], default: '9:16' },
        style:       { type: 'string' },
        music:       { type: 'string' },
      },
      required: ['prompt'],
    },
    async run(args, _ctx) {
      const prompt = String(args.prompt || '').trim();
      if (!prompt) {
        return { summary: 'Er is nog geen beschrijving voor de video. Vraag wat er te zien moet zijn.',
                 data: { pending: false }, components: [] };
      }

      const model   = mediaModels.videoModel();
      const seconds = mediaModels.nearestDuration(model, args.durationSec);
      /* Het model denkt in beeldverhouding omdat een gebruiker dat doet; de
         registry en de leveranciers denken in pixels. Hier vertaald, en
         nearestSize() maakt er daarna een maat van die dit model echt kent. */
      const FORMATEN = { '9:16': '720x1280', '16:9': '1280x720', '1:1': '1024x1024' };
      const size = mediaModels.nearestSize(model, FORMATEN[String(args.format || '9:16')]);

      const kosten = credits.creditsForVideo({ seconds, size });

      return {
        summary: `Klaar om een video van ${seconds} seconden te maken (${kosten} credits). Wacht op bevestiging.`,
        data: { pending: true },
        components: [schema.confirmation({
          action: 'generate_property_video',
          title: 'Video maken?',
          // Het aantal credits staat op de kaart zelf. Wie op "Maken" klikt
          // hoort te weten wat het kost voordat hij klikt, niet erna.
          body: `${prompt}\n\n${seconds} seconden - ${args.format || '9:16'} - ${kosten} credits`,
          confirmLabel: 'Maken',
          payload: { prompt, seconds, size, propertyId: args.propertyId || undefined },
        })],
      };
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────

const ALL = [...readTools, ...actTools, ...mediaTools];
const BY_NAME = new Map(ALL.map((t) => [t.name, t]));

/** Definitions handed to the provider — schema only, never the run functions. */
function definitions() {
  return ALL.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
}

function get(name) {
  return BY_NAME.get(name) || null;
}

/** True when the tool must not run without explicit user confirmation. */
function requiresConfirmation(name) {
  const t = get(name);
  return Boolean(t && t.kind === 'act');
}

module.exports = { definitions, get, requiresConfirmation, ALL };
