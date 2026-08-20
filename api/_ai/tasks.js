'use strict';
/*
 * Taaktypes en welke tier ze krijgen.
 *
 * -- Waarom een taak en niet een model ----------------------------------------
 * Een feature weet wat hij PROBEERT (een lead classificeren, een gesprek
 * voeren, een pand analyseren). Hij weet niet, en hoort niet te weten, welk
 * model daar vandaag het beste bij past. Die vertaling staat hier, op een
 * plek, zodat "alle classificatie naar het goedkope model" een wijziging van
 * een regel is en niet van negen bestanden.
 *
 * -- Waarom deze indeling ------------------------------------------------------
 * Het uitgangspunt is: het goedkoopste model dat de taak betrouwbaar aankan.
 * Escaleren gebeurt op BEWIJS (zie router.js), niet op voorgevoel en al
 * helemaal niet op berichtlengte -- een lang bericht is vaak juist een
 * simpele opsomming, en een kort bericht kan "ik wil van de koop af" zijn.
 */

const { TIERS } = require('./registry');

/** Alle taken die de router kent. Een onbekende taak is een fout, geen gok. */
const TASKS = Object.freeze({
  LEAD_CLASSIFICATION:    'lead_classification',
  LEAD_EXTRACTION:        'lead_extraction',
  LEAD_SCORING:           'lead_scoring',
  WHATSAPP_CONVERSATION:  'whatsapp_conversation',
  WHATSAPP_FOLLOWUP:      'whatsapp_followup',
  APPOINTMENT_ASSISTANCE: 'appointment_assistance',
  CUSTOMER_QUESTION:      'customer_question',
  COMPLEX_REASONING:      'complex_reasoning',
  PROPERTY_ANALYSIS:      'property_analysis',
  PROPERTY_TRANSFORMATION:'property_transformation',
  MARKETING_COPY:         'marketing_copy',
  DOCUMENT_EXTRACTION:    'document_extraction',
  SUMMARIZE:              'summarize',
  IMAGE_GENERATION:       'image_generation',
  VIDEO_GENERATION:       'video_generation',
  /* Helvaro's eigen back-office: het adviespaneel en de coach-chat op de
     founder-pagina. Geen klantverkeer, wel echte kosten -- en dus dezelfde
     boekhouding als de rest. */
  INTERNAL_ASSISTANT:     'internal_assistant',
});

/*
 * Taak -> tier.
 *
 * `escaleerbaar` zegt of dit werk naar reasoning MAG opschalen als het
 * goedkope model faalt. Niet alles mag dat: beeld en video hebben geen
 * duurdere denkstap, en een samenvatting die mislukt hoort opnieuw geprobeerd
 * te worden, niet duurder gemaakt.
 *
 * `structured` zegt of het antwoord JSON hoort te zijn. Dat bepaalt of de
 * validatie in router.js iets te controleren heeft -- en dus of escalatie op
 * BEWIJS kan draaien in plaats van op gevoel.
 */
const ROUTING = Object.freeze({
  [TASKS.LEAD_CLASSIFICATION]:     { tier: TIERS.CHEAP,          escaleerbaar: true,  structured: true  },
  [TASKS.LEAD_EXTRACTION]:         { tier: TIERS.CHEAP,          escaleerbaar: true,  structured: true  },
  [TASKS.LEAD_SCORING]:            { tier: TIERS.CHEAP,          escaleerbaar: true,  structured: true  },
  [TASKS.SUMMARIZE]:               { tier: TIERS.CHEAP,          escaleerbaar: false, structured: false },
  [TASKS.DOCUMENT_EXTRACTION]:     { tier: TIERS.CHEAP,          escaleerbaar: true,  structured: true  },

  [TASKS.WHATSAPP_CONVERSATION]:   { tier: TIERS.CONVERSATIONAL, escaleerbaar: true,  structured: false },
  [TASKS.WHATSAPP_FOLLOWUP]:       { tier: TIERS.CONVERSATIONAL, escaleerbaar: false, structured: false },
  [TASKS.APPOINTMENT_ASSISTANCE]:  { tier: TIERS.CONVERSATIONAL, escaleerbaar: true,  structured: false },
  [TASKS.CUSTOMER_QUESTION]:       { tier: TIERS.CONVERSATIONAL, escaleerbaar: true,  structured: false },
  [TASKS.MARKETING_COPY]:          { tier: TIERS.CONVERSATIONAL, escaleerbaar: false, structured: false },
  [TASKS.INTERNAL_ASSISTANT]:      { tier: TIERS.CONVERSATIONAL, escaleerbaar: false, structured: false },

  [TASKS.COMPLEX_REASONING]:       { tier: TIERS.REASONING,      escaleerbaar: false, structured: false },

  [TASKS.PROPERTY_ANALYSIS]:       { tier: TIERS.VISION,         escaleerbaar: true,  structured: true  },

  [TASKS.PROPERTY_TRANSFORMATION]: { tier: TIERS.IMAGE,          escaleerbaar: false, structured: false },
  [TASKS.IMAGE_GENERATION]:        { tier: TIERS.IMAGE,          escaleerbaar: false, structured: false },
  [TASKS.VIDEO_GENERATION]:        { tier: TIERS.VIDEO,          escaleerbaar: false, structured: false },
});

/*
 * Naar welke credit-feature een taak afschrijft. api/_credits.js blijft de
 * enige plek die credits kent; dit is alleen de vertaling.
 * null = deze taak schrijft niet apart af (hij zit in een grotere beurt).
 */
const CREDIT_FEATURE = Object.freeze({
  [TASKS.WHATSAPP_CONVERSATION]:   'whatsapp_conversation',
  [TASKS.WHATSAPP_FOLLOWUP]:       'whatsapp_conversation',
  [TASKS.IMAGE_GENERATION]:        'image_generation',
  [TASKS.PROPERTY_TRANSFORMATION]: 'image_generation',
  [TASKS.VIDEO_GENERATION]:        'video_generation',
  [TASKS.MARKETING_COPY]:          'marketing_content',
});

class TaskError extends Error {
  constructor(message, code) { super(message); this.name = 'TaskError'; this.code = code || 'task_error'; }
}

function routeVoor(task) {
  const r = ROUTING[task];
  if (!r) throw new TaskError(`Onbekende AI-taak "${task}".`, 'unknown_task');
  return r;
}

function isTask(x) { return Object.prototype.hasOwnProperty.call(ROUTING, x); }

module.exports = { TASKS, ROUTING, CREDIT_FEATURE, TaskError, routeVoor, isTask };
