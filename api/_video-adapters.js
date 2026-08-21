'use strict';
/*
 * Video-adapters -- de enige plek die weet HOE een leverancier aangesproken
 * wordt.
 *
 * -- Waarom dit los staat van api/_media-models.js ---------------------------
 * Dat bestand zegt WELK model, wat het kost en wat het aankan. Dit zegt hoe je
 * er een opdracht heen stuurt en hoe je hoort dat hij klaar is. Die twee lopen
 * niet gelijk op: een leverancier kan zijn prijs veranderen zonder zijn API te
 * veranderen, en andersom.
 *
 * -- De vorm van een adapter -------------------------------------------------
 *
 *   submit({ model, prompt, imageUrl, seconds, size })
 *     -> { providerJobId }              opdracht ingediend
 *
 *   poll({ model, providerJobId })
 *     -> { state: 'queued'|'running'|'ready'|'failed', url?, error? }
 *
 * Meer niet. De job zelf, de eigendomscontrole, de credits en de opslag zitten
 * in api/_faro/media.js; een adapter weet niets van tenants.
 *
 * -- Waarom kling en runway hieronder WEIGEREN in plaats van te gokken -------
 * Ik kon hun documentatie niet lezen vanaf deze machine. Een adapter schrijven
 * op basis van een herinnering aan een API betekent: een endpoint dat er goed
 * uitziet, een auth-header die net anders heet, en een pollvorm die niet
 * bestaat. Dat faalt niet bij het schrijven maar bij de eerste echte klant, en
 * dan als een 400 die op een storing lijkt.
 *
 * Dus staat er hier een expliciete weigering met daarin precies wat er nodig
 * is. Aansluiten is: de vier regels van submit() en poll() invullen volgens de
 * documentatie van de leverancier, en de test in tests/video-pipeline.test.js
 * van 'demo' op 'kling' zetten.
 */

class AdapterError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AdapterError';
    this.code = code || 'adapter_error';
  }
}

/* Wat elke echte adapter nodig heeft voordat hij iets kan. Apart, zodat de
   preflight en de foutmelding hetzelfde lijstje gebruiken. */
const REQUIRED_ENV = Object.freeze({
  kling:  ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
  runway: ['RUNWAY_API_KEY'],
  demo:   [],
});

function notImplemented(name) {
  const env = REQUIRED_ENV[name] || [];
  return {
    async submit() {
      throw new AdapterError(
        `De ${name}-adapter is nog niet geschreven. Nodig: ${env.join(' + ')}, plus de `
        + 'endpoint-, auth- en pollvorm uit de documentatie van de leverancier. '
        + 'Zie de kop van api/_video-adapters.js.',
        'adapter_not_implemented',
      );
    },
    async poll() {
      throw new AdapterError(`De ${name}-adapter is nog niet geschreven.`, 'adapter_not_implemented');
    },
  };
}

/*
 * De demo-adapter. Raakt het netwerk nooit aan en kost niets.
 *
 * Hij is er niet alleen voor het gemak: alles OM de leverancier heen -- de
 * creditcontrole, de jobstatus, de eigendomscontrole, het pollen, wat de
 * gebruiker ziet terwijl hij wacht -- is hiermee echt te testen. Toen video
 * "niet aangesloten" was, was dat allemaal ongetest, en dat is precies het
 * deel dat NIET van de leverancier afhangt.
 *
 * De tijd loopt op wandkloktijd, zodat een test hem kan versnellen door de
 * job een oudere starttijd te geven in plaats van echt te wachten.
 */
const DEMO_MS = 2500;

const demo = {
  async submit({ seconds = 8 } = {}) {
    return { providerJobId: 'demo_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8), seconds };
  },
  async poll({ providerJobId, startedAt } = {}) {
    if (!providerJobId) return { state: 'failed', error: 'geen job-id' };
    // Een opdracht die met 'demo_fail' begint faalt altijd, zodat de
    // foutafhandeling ook een pad heeft om langs te lopen.
    if (String(providerJobId).indexOf('demo_fail') === 0) {
      return { state: 'failed', error: 'demo: opzettelijke fout' };
    }
    const age = Date.now() - (Number(startedAt) || 0);
    if (age < DEMO_MS * 0.4) return { state: 'queued' };
    if (age < DEMO_MS)       return { state: 'running' };
    return {
      state: 'ready',
      // Geen echt bestand: een demo mag er niet uitzien alsof er iets gemaakt
      // is dat je kunt downloaden.
      url: 'demo://video/' + providerJobId,
    };
  },
};

const ADAPTERS = {
  demo,
  kling:  notImplemented('kling'),
  runway: notImplemented('runway'),
  /* Sora had wel een adapter kunnen hebben -- de API is bekend en de sleutel
     staat er al. Bewust niet gedaan: het model verdwijnt op 2026-09-24, en een
     werkende weg naar een leverancier die over een maand stopt nodigt uit om
     hem toch aan te zetten. */
  openai: notImplemented('openai'),
};

/** De adapter voor een modelrecord uit api/_media-models.js. */
function forModel(model) {
  const name = (model && (model.adapter || model.provider)) || '';
  const a = ADAPTERS[name];
  if (!a) throw new AdapterError(`Onbekende video-adapter "${name}".`, 'unknown_adapter');
  return a;
}

/** Ontbrekende env-variabelen voor een adapter, voor preflight en foutmelding. */
function missingEnv(name) {
  return (REQUIRED_ENV[name] || []).filter((k) => !String(process.env[k] || '').trim());
}

module.exports = { ADAPTERS, AdapterError, REQUIRED_ENV, forModel, missingEnv, DEMO_MS };
