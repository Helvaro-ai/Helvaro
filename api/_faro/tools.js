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
const fixtures = require('./fixtures');
const images = require('../_images');
const credits = require('../_credits');

const NOT_WIRED = 'not_wired';

/** Marks a stub result so mock data is never mistaken for real CRM data. */
function stub(summary, data, components = []) {
  return { summary, data, components, _stub: NOT_WIRED };
}

// ─────────────────────────────────────────────────────────────────────────────
// READ TOOLS — CRM knowledge. Wire these to the existing Airtable/Postgres
// reads already used by api/leads.js; do NOT re-implement queries here.
// ─────────────────────────────────────────────────────────────────────────────

const readTools = [
  {
    name: 'get_leads',
    kind: 'read',
    description: 'Haal de meest recente leads op. Gebruik search_leads wanneer de gebruiker filtert op budget, timing, status of kanaal.',
    parameters: {
      type: 'object',
      properties: {
        limit:  { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        status: { type: 'string', enum: ['new', 'qualified', 'contacted', 'won', 'lost'] },
      },
    },
    // WIRE TO: api/leads.js Airtable read, filtered by ctx.projectCode.
    async run(args, _ctx) {
      if (fixtures.isEnabled()) {
        const leads = fixtures.searchLeads({ status: args.status, limit: args.limit || 10 });
        return stub(`${leads.length} leads gevonden.`, { leads }, leads.map(fixtures.leadCard));
      }
      return stub('Geen leads gevonden.', { leads: [] }, []);
    },
  },

  {
    name: 'search_leads',
    kind: 'read',
    description: 'Zoek leads op budget, aankooptermijn, status, kanaal of trefwoord. Dit is de tool achter vragen als "leads met budget boven 400k die binnen 3 maanden willen kopen".',
    parameters: {
      type: 'object',
      properties: {
        minBudget:   { type: 'integer', description: 'Minimum budget in euro' },
        maxBudget:   { type: 'integer', description: 'Maximum budget in euro' },
        timeframe:   { type: 'string', enum: ['0-1m', '1-3m', '3-6m', '6m+'] },
        status:      { type: 'string', enum: ['new', 'qualified', 'contacted', 'won', 'lost'] },
        channel:     { type: 'string', enum: ['whatsapp', 'form', 'phone', 'email'] },
        query:       { type: 'string', description: 'Vrije tekst — naam, adres of trefwoord' },
        limit:       { type: 'integer', minimum: 1, maximum: 50, default: 10 },
      },
    },
    // WIRE TO: Airtable filterByFormula built server-side from these fields.
    // Never interpolate `query` into a formula unescaped — api/_credits.js's
    // escapeFormula() is the existing helper for this.
    async run(args, _ctx) {
      if (fixtures.isEnabled()) {
        const leads = fixtures.searchLeads(args);
        return stub(
          leads.length ? `${leads.length} leads gevonden.` : 'Geen leads passen bij deze filters.',
          { leads },
          leads.map(fixtures.leadCard),
        );
      }
      return stub('Geen resultaten (nog niet aangesloten).', { leads: [] }, []);
    },
  },

  {
    name: 'get_lead',
    kind: 'read',
    description: 'Haal één lead op met volledige details en kwalificatiegegevens.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    async run(_args, _ctx) { return stub('Lead niet gevonden.', { lead: null }); },
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
    async run(_args, _ctx) { return stub('Pand niet gevonden.', { property: null }); },
  },

  {
    name: 'get_conversation',
    kind: 'read',
    description: 'Haal het volledige WhatsApp-gesprek met een lead op.',
    parameters: {
      type: 'object',
      properties: { leadId: { type: 'string' } },
      required: ['leadId'],
    },
    async run(_args, _ctx) { return stub('Geen gesprek gevonden.', { messages: [] }); },
  },

  {
    name: 'search_conversations',
    kind: 'read',
    description: 'Zoek in gesprekken op trefwoord of periode. Gebruik dit voor "vat de gesprekken van vandaag samen".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        since: { type: 'string', description: 'ISO-datum' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
    },
    async run(_args, _ctx) {
      if (fixtures.isEnabled()) {
        return stub('3 gesprekken vragen opvolging.',
          { conversations: fixtures.CONVERSATIONS },
          fixtures.searchLeads({ limit: 3 }).map(fixtures.leadCard));
      }
      return stub('Geen gesprekken gevonden.', { conversations: [] });
    },
  },

  {
    name: 'get_pipeline',
    kind: 'read',
    description: 'Haal de pipeline op: aantal leads en waarde per fase.',
    parameters: { type: 'object', properties: {} },
    // WIRE TO: the same aggregation the CRM pipeline page already renders.
    async run(_args, _ctx) {
      if (fixtures.isEnabled()) {
        return stub('Pipeline opgehaald.', { stages: fixtures.PIPELINE },
          [schema.statGroup({ title: 'Pipeline', stats: fixtures.PIPELINE })]);
      }
      return stub('Pipeline niet beschikbaar.', { stages: [] });
    },
  },

  {
    name: 'get_analytics',
    kind: 'read',
    description: 'Haal prestatiecijfers op over een periode: nieuwe leads, kwalificatiegraad, responstijd, conversie.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', '7d', '30d', '90d'], default: '30d' },
      },
    },
    async run(_args, _ctx) {
      if (fixtures.isEnabled()) {
        return stub('Cijfers opgehaald.', { metrics: fixtures.ANALYTICS },
          [schema.statGroup({ title: 'Prestaties (30 dagen)', stats: fixtures.ANALYTICS })]);
      }
      return stub('Cijfers niet beschikbaar.', { metrics: {} });
    },
  },

  {
    name: 'get_calendar',
    kind: 'read',
    description: 'Haal komende afspraken en vrije momenten op.',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', minimum: 1, maximum: 30, default: 7 } },
    },
    // WIRE TO: api/_gcal.js — the integration already exists.
    async run(_args, _ctx) { return stub('Agenda niet beschikbaar.', { events: [] }); },
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
  {
    name: 'create_followup',
    kind: 'act',
    description: 'Stel een opvolgbericht op voor één of meer leads. Het bericht wordt NIET verstuurd — de gebruiker bevestigt eerst.',
    parameters: {
      type: 'object',
      properties: {
        leadIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        tone:    { type: 'string', enum: ['warm', 'zakelijk', 'kort'], default: 'warm' },
        intent:  { type: 'string', description: 'Wat het bericht moet bereiken' },
      },
      required: ['leadIds'],
    },
    async run(args, _ctx) {
      return stub(
        `Opvolgbericht voorbereid voor ${args.leadIds.length} lead(s). Wacht op bevestiging.`,
        { pending: true },
        [schema.confirmation({
          action: 'create_followup',
          title: 'Opvolgberichten versturen?',
          body: `${args.leadIds.length} lead(s) ontvangen een bericht via WhatsApp.`,
          confirmLabel: 'Versturen',
          payload: args,
        })],
      );
    },
  },

  {
    name: 'schedule_followup',
    kind: 'act',
    description: 'Plan een opvolgmoment in de agenda. Wordt pas aangemaakt na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        leadId: { type: 'string' },
        when:   { type: 'string', description: 'ISO-datum/tijd' },
        note:   { type: 'string' },
      },
      required: ['leadId', 'when'],
    },
    // WIRE TO: api/_gcal.js event creation, post-confirmation.
    async run(args, _ctx) {
      return stub('Afspraak voorbereid. Wacht op bevestiging.', { pending: true },
        [schema.confirmation({
          action: 'schedule_followup',
          title: 'Afspraak inplannen?',
          body: 'Dit maakt een item aan in je gekoppelde agenda.',
          confirmLabel: 'Inplannen',
          payload: args,
        })]);
    },
  },

  {
    name: 'create_campaign',
    kind: 'act',
    description: 'Bereid een marketingcampagne voor rond een pand: teksten, beelden, video en een leadselectie. Wordt pas uitgevoerd na bevestiging.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: { type: 'string' },
        channels:   { type: 'array', items: { type: 'string', enum: ['whatsapp', 'email', 'social'] } },
        leadIds:    { type: 'array', items: { type: 'string' } },
        angle:      { type: 'string', description: 'Invalshoek of doelgroep' },
      },
      required: ['propertyId'],
    },
    async run(args, _ctx) {
      return stub('Campagne voorbereid. Wacht op bevestiging.', { pending: true },
        [schema.confirmation({
          action: 'create_campaign',
          title: 'Campagne aanmaken?',
          body: 'Helvaro maakt de campagne aan met de voorbereide teksten en media.',
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

  {
    name: 'write_listing',
    kind: 'create',
    description: 'Schrijf de verkooptekst voor een pand. Levert een concept op dat de gebruiker kan bewerken.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: { type: 'string' },
        length:     { type: 'string', enum: ['kort', 'normaal', 'uitgebreid'], default: 'normaal' },
        tone:       { type: 'string', enum: ['luxe', 'zakelijk', 'warm'], default: 'luxe' },
      },
      required: ['propertyId'],
    },
    // Drafting text changes nothing outside Helvaro, so this one resolves to a
    // draft component rather than a confirmation — publishing it is a separate,
    // confirmed step.
    async run(_args, _ctx) { return stub('Concept niet beschikbaar.', { draft: null }); },
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
    kind: 'create',
    description: 'Genereer een korte marketingvideo voor een pand.',
    parameters: {
      type: 'object',
      properties: {
        propertyId:  { type: 'string' },
        sourceImageIds: { type: 'array', items: { type: 'string' } },
        prompt:      { type: 'string' },
        durationSec: { type: 'integer', enum: [10, 15, 30], default: 15 },
        format:      { type: 'string', enum: ['9:16', '16:9', '1:1'], default: '9:16' },
        style:       { type: 'string' },
        music:       { type: 'string' },
      },
      required: ['prompt'],
    },
    async run(_args, _ctx) { return stub('Videogeneratie nog niet aangesloten.', { jobId: null }); },
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
