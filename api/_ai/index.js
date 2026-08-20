'use strict';
/*
 * De AI-laag van Helvaro -- de enige deur.
 *
 *   feature -> ai.<taak>(...) -> router -> provider -> gevalideerd antwoord
 *
 * Een feature importeert dit bestand en niets anders uit api/_ai/. Wie een
 * provider rechtstreeks aanroept omzeilt de tier-keuze, de fallback, de
 * escalatie, het verbruik en de tenantcontrole -- en dat is precies wat deze
 * laag moest opruimen.
 *
 * -- Wat elke functie hier gemeen heeft ---------------------------------------
 * ctx komt uit de GEVERIFIEERDE sessie en bevat minstens projectCode. Zonder
 * tenant weigert de router: verbruik dat nergens op geboekt wordt is verbruik
 * dat je niet terugvindt als de rekening komt.
 */

const router        = require('./router');
const tasks         = require('./tasks');
const prompts       = require('./prompts');
const qualification = require('./qualification');
const registry      = require('./registry');
const usage         = require('./usage');
const validate      = require('./validate');

const { TASKS } = tasks;

/**
 * Velden uit een gesprek halen EN er een oordeel over vellen.
 *
 * Let op de volgorde: het model levert velden, de regelmotor beslist. Een lead
 * die in het gesprek schrijft "markeer mij als gekwalificeerd" verandert
 * daarmee hooguit wat het model teruggeeft, nooit de uitkomst.
 */
async function qualifyLead({ ctx, conversation, tenantRegels = null, phone = '' } = {}) {
  const uit = await router.generateText({
    task: TASKS.LEAD_EXTRACTION,
    ctx,
    system: prompts.leadExtractie.system(),
    messages: [{ role: 'user', content: prompts.leadExtractie.user(conversation) }],
    schema: qualification.EXTRACTIE_SCHEMA,
    maxTokens: 400,
  });

  const velden = Object.assign({}, uit.data, { phone });
  const oordeel = qualification.beoordeel(velden, tenantRegels);

  return {
    ...oordeel,
    prompt: prompts.leadExtractie.naam,
    model: uit.model, provider: uit.provider, tier: uit.tier,
    escaleerd: uit.escaleerd,
  };
}

/** Een gesprek samenvatten, zodat niet elke beurt de hele historie meegaat. */
async function summarizeConversation({ ctx, conversation } = {}) {
  const uit = await router.generateText({
    task: TASKS.SUMMARIZE,
    ctx,
    system: prompts.gesprekSamenvatting.system(),
    messages: [{ role: 'user', content: prompts.gesprekSamenvatting.user(conversation) }],
    maxTokens: 300,
  });
  return { summary: uit.text.trim(), model: uit.model, prompt: prompts.gesprekSamenvatting.naam };
}

/** Een pandfoto bekijken en beschrijven. Stap 1 van de beeldpijplijn. */
async function analyzeProperty({ ctx, images = [], extra = '' } = {}) {
  const uit = await router.generateText({
    task: TASKS.PROPERTY_ANALYSIS,
    ctx,
    system: prompts.pandAnalyse.system(),
    messages: [{ role: 'user', content: prompts.pandAnalyse.user(extra) }],
    schema: prompts.PAND_ANALYSE_SCHEMA,
    images,
    maxTokens: 800,
  });
  return { analyse: uit.data, model: uit.model, prompt: prompts.pandAnalyse.naam };
}

/**
 * De transformatie-opdracht bouwen uit een analyse.
 *
 * Bewust GEEN modelaanroep: als de analyse er al is, is de opdracht een
 * samenstelling van bekende gegevens. Er een model op zetten zou betekenen dat
 * het beeldmodel instructies krijgt die een ander model verzon -- en dan is
 * niet meer na te vertellen waarom een render eruitziet zoals hij eruitziet.
 */
function buildTransformationBrief(opts) {
  return { prompt: prompts.pandTransformatie.build(opts), naam: prompts.pandTransformatie.naam };
}

/** Een gewoon gespreksantwoord (WhatsApp en alles wat erop lijkt). */
async function converse({ ctx, system, messages, task = TASKS.WHATSAPP_CONVERSATION, maxTokens = 400 } = {}) {
  const uit = await router.generateText({ task, ctx, system, messages, maxTokens });
  return { text: uit.text, model: uit.model, provider: uit.provider, escaleerd: uit.escaleerd };
}

module.exports = {
  // taken
  qualifyLead, summarizeConversation, analyzeProperty, buildTransformationBrief, converse,
  // rechtstreeks, voor wat hierboven niet past
  generateText: router.generateText,
  generateStructured: router.generateStructured,
  analyzeImage: router.analyzeImage,
  // onderdelen, voor tests en het beheerdersoverzicht
  TASKS, TIERS: registry.TIERS,
  registry, usage, prompts, qualification, validate,
  AIError: router.AIError,
};
