'use strict';
/*
 * Helvaro AI — tool registry.
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
 *   kind: 'read'  — safe, idempotent, executed immediately by the orchestrator.
 *   kind: 'act'   — changes something, or reaches outside Helvaro. NEVER
 *                   executed on the model's say-so. Returns a *proposal*; the
 *                   user confirms it in the UI; only then does api/_ai/actions.js
 *                   execute it.
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
    async run(_args, _ctx) {
      return stub('8 leads gevonden.', { leads: [] }, []);
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
    async run(_args, _ctx) {
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
    async run(_args, _ctx) { return stub('Geen gesprekken gevonden.', { conversations: [] }); },
  },

  {
    name: 'get_pipeline',
    kind: 'read',
    description: 'Haal de pipeline op: aantal leads en waarde per fase.',
    parameters: { type: 'object', properties: {} },
    // WIRE TO: the same aggregation the CRM pipeline page already renders.
    async run(_args, _ctx) { return stub('Pipeline niet beschikbaar.', { stages: [] }); },
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
    async run(_args, _ctx) { return stub('Cijfers niet beschikbaar.', { metrics: {} }); },
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
// The returned confirmation component is what the user approves in the UI;
// api/_ai/actions.js is the only module that can carry it out.
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
    kind: 'act',
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

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA TOOLS — image generation already exists in api/_images.js; video does
// not exist yet anywhere in this repo. Both are metered and both are slow, so
// both return a JOB, never a finished asset. See ./media.js.
// ─────────────────────────────────────────────────────────────────────────────

const mediaTools = [
  {
    name: 'generate_property_image',
    kind: 'act',
    description: 'Genereer een AI-visualisatie van een pand in een gekozen stijl.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: { type: 'string' },
        sourceImageId: { type: 'string', description: 'Bestaande foto om te transformeren' },
        prompt: { type: 'string' },
        style:  { type: 'string', description: 'Stijlsleutel uit api/_images.js PROPERTY_STYLES' },
        aspectRatio: { type: 'string', enum: ['1:1', '4:3', '3:2', '16:9'], default: '4:3' },
      },
      required: ['prompt'],
    },
    // WIRE TO: api/_images.js — do NOT reimplement. It already handles the
    // OpenAI image-edit call, Vercel Blob storage under property/${projectCode}/,
    // credit metering and the AI-disclaimer label.
    async run(_args, _ctx) { return stub('Beeldgeneratie nog niet aangesloten.', { jobId: null }); },
  },

  {
    name: 'generate_property_video',
    kind: 'act',
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
