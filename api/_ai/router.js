'use strict';
/*
 * De AI-router.
 *
 * Elke AI-aanroep in Helvaro hoort hier langs te komen. Een feature zegt WAT
 * hij wil (een taak uit tasks.js) en met welke tenant; de router kiest het
 * model, probeert de volgende provider als er een omvalt, escaleert naar een
 * duurder model als het goedkope aantoonbaar faalt, en schrijft weg wat het
 * gekost heeft.
 *
 * -- Wat hier BEWUST niet gebeurt ---------------------------------------------
 * De router beslist niets over de business. Hij levert tekst of een
 * gevalideerd object; of een lead gekwalificeerd is bepaalt de regelmotor in
 * qualification.js. Een taalmodel dat "gekwalificeerd: ja" zegt, zegt daarmee
 * niets -- het levert velden, Helvaro trekt de conclusie.
 *
 * -- Escalatie op bewijs -------------------------------------------------------
 * Opschalen naar een duurder model gebeurt alleen als er iets AANWIJSBAAR mis
 * is: geen bruikbare JSON, een veld dat ontbreekt, een waarde buiten bereik, of
 * een zelfgerapporteerde zekerheid onder de drempel. Niet op berichtlengte --
 * een lang bericht is vaak een opsomming, en "ik wil eronderuit" is kort.
 */

const registry = require('./registry');
const tasks    = require('./tasks');
const validate = require('./validate');
const usage    = require('./usage');

const { TIERS } = registry;

class AIError extends Error {
  constructor(message, code, extra) {
    super(message);
    this.name = 'AIError';
    this.code = code || 'ai_error';
    Object.assign(this, extra || {});
  }
}

/* Onder deze zelfgerapporteerde zekerheid vertrouwen we een gestructureerd
   antwoord niet. Een model dat zelf zegt dat het twijfelt heeft meestal
   gelijk. Instelbaar, want de juiste waarde hangt af van hoe duur een fout is. */
const CONFIDENCE_DREMPEL = Number(process.env.AI_CONFIDENCE_MIN || 0.65);

/* Harde bovengrens op pogingen, zodat een kapotte provider geen lus wordt die
   de rekening laat oplopen. Telt ALLE pogingen: fallback en escalatie samen. */
const MAX_POGINGEN = Math.max(1, Number(process.env.AI_MAX_ATTEMPTS || 4));

function adapterVoor(providerId) {
  // Lazy: een provider die niet gebruikt wordt, hoeft ook niet geladen.
  return require('./providers')(providerId);
}

/**
 * Eén poging bij één provider. Geeft { tekst, usage } of gooit.
 */
async function eenPoging({ providerId, tier, system, messages, maxTokens, signal, images }) {
  const model = registry.modelVoor(providerId, tier);
  if (!model) throw new AIError(`Provider ${providerId} heeft geen model voor tier ${tier}.`, 'no_model');
  const adapter = adapterVoor(providerId);
  const begonnen = Date.now();
  const out = await adapter.generateText({ model, system, messages, maxTokens, signal, images });
  return {
    providerId, model, tier,
    tekst: (out && out.text) || '',
    inputTokens:  (out && out.inputTokens)  || 0,
    outputTokens: (out && out.outputTokens) || 0,
    latencyMs: Date.now() - begonnen,
  };
}

/**
 * Tekst genereren.
 *
 * @param {object} opts
 * @param {string} opts.task     een waarde uit tasks.TASKS
 * @param {object} opts.ctx      { projectCode, userId } uit de GEVERIFIEERDE sessie
 * @param {string} opts.system   systeemprompt
 * @param {Array}  opts.messages [{ role, content }]
 * @param {object} [opts.schema] als gezet: antwoord moet hieraan voldoen
 */
async function generateText(opts = {}) {
  const { task, ctx = {}, system = '', messages = [], maxTokens = 1024, schema = null, signal, images } = opts;

  const route = tasks.routeVoor(task);            // gooit bij onbekende taak
  const tenant = String(ctx.projectCode || '').trim();
  /* Een lege tenant leest elders in deze codebase als "admin, toon alles". Hier
     zou het betekenen dat verbruik nergens op geboekt wordt -- dus weigeren. */
  if (!tenant) throw new AIError('AI-aanroep zonder tenant.', 'no_tenant');

  const pogingen = [];
  let laatsteFout = null;

  // De keten voor de tier, en daarachter -- als de taak dat mag -- de
  // reasoning-keten. Zo is escalatie gewoon "verderop in dezelfde lijst".
  const primair = registry.keten(route.tier).map((p) => ({ providerId: p, tier: route.tier, reden: 'primair' }));
  const escalatie = route.escaleerbaar && route.tier !== TIERS.REASONING
    ? registry.keten(TIERS.REASONING).map((p) => ({ providerId: p, tier: TIERS.REASONING, reden: 'escalatie' }))
    : [];

  const keten = primair.concat(escalatie);
  if (!keten.length) {
    throw new AIError(
      `Geen enkele provider is geconfigureerd voor tier "${route.tier}". `
      + `Ontbreekt: ${JSON.stringify(registry.watOntbreekt(route.tier))}`,
      'no_provider');
  }

  for (const stap of keten.slice(0, MAX_POGINGEN)) {
    let poging;
    try {
      poging = await eenPoging({ ...stap, system, messages, maxTokens, signal, images });
    } catch (err) {
      laatsteFout = err;
      pogingen.push({ ...stap, ok: false, fout: (err && err.message || '').slice(0, 160) });
      // Een provider die omvalt: door naar de volgende. Dat is fallback.
      continue;
    }

    // Zonder schema is elk niet-leeg antwoord goed genoeg.
    if (!schema) {
      if (poging.tekst.trim()) {
        await usage.record({ ctx, task, ...poging, status: 'ok', pogingen: pogingen.length + 1 });
        return { text: poging.tekst, model: poging.model, provider: poging.providerId,
                 tier: poging.tier, escaleerd: stap.reden === 'escalatie', pogingen: pogingen.length + 1 };
      }
      laatsteFout = new AIError('Leeg antwoord.', 'empty_response');
      pogingen.push({ ...stap, ok: false, fout: 'leeg antwoord' });
      continue;
    }

    // Met schema: valideren, en pas DAN besluiten of dit goed genoeg is.
    const res = validate.parseEnValideer(poging.tekst, schema);
    const zekerheid = res.waarde && typeof res.waarde.confidence === 'number' ? res.waarde.confidence : null;
    const teOnzeker = zekerheid !== null && zekerheid < CONFIDENCE_DREMPEL;

    if (res.ok && !teOnzeker) {
      await usage.record({ ctx, task, ...poging, status: 'ok', pogingen: pogingen.length + 1 });
      return { data: res.waarde, text: poging.tekst, model: poging.model, provider: poging.providerId,
               tier: poging.tier, escaleerd: stap.reden === 'escalatie', pogingen: pogingen.length + 1 };
    }

    // Dit is het bewijs waarop geëscaleerd wordt.
    const reden = teOnzeker ? [`zekerheid ${zekerheid} < ${CONFIDENCE_DREMPEL}`] : res.problemen;
    pogingen.push({ ...stap, ok: false, fout: reden.join('; ').slice(0, 160) });
    laatsteFout = new AIError('Antwoord voldeed niet aan het schema.', 'schema_invalid', { problemen: reden });
    await usage.record({ ctx, task, ...poging, status: 'invalid', pogingen: pogingen.length });
  }

  throw new AIError(
    'Geen enkele provider gaf een bruikbaar antwoord.',
    (laatsteFout && laatsteFout.code) || 'all_failed',
    { pogingen, oorzaak: laatsteFout && laatsteFout.message });
}

/** Gestructureerd antwoord. Zelfde weg, maar een schema is verplicht. */
async function generateStructured(opts = {}) {
  if (!opts.schema) throw new AIError('generateStructured zonder schema.', 'no_schema');
  const uit = await generateText(opts);
  return uit.data;
}

/** Een foto laten bekijken. Zelfde router, tier vision. */
async function analyzeImage(opts = {}) {
  return generateText({ ...opts, task: opts.task || tasks.TASKS.PROPERTY_ANALYSIS });
}

module.exports = {
  generateText, generateStructured, analyzeImage,
  AIError, CONFIDENCE_DREMPEL, MAX_POGINGEN,
};
