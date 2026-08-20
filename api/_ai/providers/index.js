'use strict';
/*
 * Provider-adapters voor de AI-router.
 *
 * -- Het contract --------------------------------------------------------------
 * Elke adapter is een object met:
 *
 *   async generateText({ model, system, messages, maxTokens, images, signal })
 *     -> { text, inputTokens, outputTokens }
 *
 * Meer niet. De router weet niets van een vendor-vorm; een adapter weet niets
 * van tenants, credits of taken. Dat is de hele scheiding.
 *
 * -- Waarom dit los staat van api/_faro/providers/ ----------------------------
 * Die adapters zijn STREAMING generatoren voor de chat-werkomgeving: ze yielden
 * tekst-, tool- en usage-gebeurtenissen zodat een antwoord letter voor letter
 * in beeld verschijnt. Dat is de juiste vorm daar en de verkeerde hier: de
 * router wordt aangeroepen door WhatsApp-webhooks en cron-taken, die een heel
 * antwoord willen en geen stroom. Ze samenvoegen zou betekenen dat elke
 * aanroeper een generator moet leegdrinken voor een antwoord dat in een keer
 * kon komen.
 *
 * Ze delen wel de leverancier en de sleutel; alleen de vorm verschilt.
 *
 * -- Fouten --------------------------------------------------------------------
 * Een adapter gooit ProviderError, nooit een rauwe vendorfout: die dragen
 * modelnamen en soms de inhoud van het verzoek, en geen van beide hoort bij een
 * gebruiker terecht te komen.
 */

class ProviderError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'ProviderError';
    this.code = code || 'provider_error';
    this.status = status || 0;
  }
}

const TIMEOUT_MS = Math.max(5000, Number(process.env.AI_TIMEOUT_MS || 60000));

/* Elke aanroep krijgt een deadline. Zonder dit kan een provider die blijft
   hangen een Vercel-functie tot zijn maxDuration bezet houden -- en bij
   WhatsApp betekent dat een lead die geen antwoord krijgt. */
async function fetchMetTimeout(url, opts, signal) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => ac.abort(), { once: true });
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new ProviderError('Verzoek duurde te lang.', 'timeout');
    throw new ProviderError('Kon de provider niet bereiken.', 'unreachable');
  } finally {
    clearTimeout(t);
  }
}

/* ── Anthropic ───────────────────────────────────────────────────────────────
   Exact de vorm die deze codebase al negen keer gebruikt (whatsapp.js,
   leads.js, admin.js, cron-followup.js), nu op één plek. */
const anthropic = {
  async generateText({ model, system = '', messages = [], maxTokens = 1024, images, signal } = {}) {
    const key = String(process.env.ANTHROPIC_API_KEY || '').trim();
    if (!key) throw new ProviderError('ANTHROPIC_API_KEY ontbreekt.', 'no_key');

    // Beeld meesturen: Anthropic verwacht blokken binnen het laatste
    // gebruikersbericht.
    let msgs = messages;
    if (images && images.length) {
      const blokken = images.slice(0, 4).map((im) => ({
        type: 'image',
        source: { type: 'base64', media_type: im.mediaType || 'image/jpeg', data: im.dataBase64 },
      }));
      const kopie = messages.slice();
      const laatste = kopie[kopie.length - 1];
      const tekst = laatste && typeof laatste.content === 'string' ? laatste.content : '';
      kopie[kopie.length - 1] = { role: 'user', content: blokken.concat([{ type: 'text', text: tekst }]) };
      msgs = kopie;
    }

    const r = await fetchMetTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: msgs }),
    }, signal);

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) {
      const m = (data.error && data.error.message) || ('HTTP ' + r.status);
      // Statuscode meenemen: 429 en 5xx horen een andere provider te krijgen,
      // 400 is onze eigen fout en dan helpt uitwijken niet.
      throw new ProviderError('Anthropic weigerde het verzoek.', r.status === 429 ? 'rate_limited' : 'provider_error', r.status);
    }
    const text = (data.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      inputTokens:  (data.usage && data.usage.input_tokens)  || 0,
      outputTokens: (data.usage && data.usage.output_tokens) || 0,
    };
  },
};

/* ── OpenAI ──────────────────────────────────────────────────────────────────
   Tekst via chat/completions. Deze codebase gebruikt OpenAI vandaag alleen voor
   beeld; deze adapter bestaat zodat de reasoning-tier een tweede been heeft
   zodra er een model-id geconfigureerd wordt. */
const openai = {
  async generateText({ model, system = '', messages = [], maxTokens = 1024, signal } = {}) {
    const key = String(process.env.OPENAI_API_KEY || '').trim();
    if (!key) throw new ProviderError('OPENAI_API_KEY ontbreekt.', 'no_key');
    if (!model) throw new ProviderError('Geen OpenAI-tekstmodel geconfigureerd.', 'no_model');

    const msgs = (system ? [{ role: 'system', content: system }] : []).concat(
      messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : String(m.content || '') })));

    const r = await fetchMetTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: msgs, max_completion_tokens: maxTokens }),
    }, signal);

    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.error) {
      throw new ProviderError('OpenAI weigerde het verzoek.', r.status === 429 ? 'rate_limited' : 'provider_error', r.status);
    }
    const keuze = (data.choices || [])[0];
    return {
      text: (keuze && keuze.message && keuze.message.content) || '',
      inputTokens:  (data.usage && data.usage.prompt_tokens)     || 0,
      outputTokens: (data.usage && data.usage.completion_tokens) || 0,
    };
  },
};

/* ── Google en OpenRouter ────────────────────────────────────────────────────
   BEWUST NIET GESCHREVEN. Ik kon vanaf deze machine geen documentatie van
   beide bereiken (de proxy blokkeert ai.google.dev en openrouter.ai), en een
   adapter schrijven op een herinnering aan een API levert een endpoint dat er
   goed uitziet, een auth-header die net anders heet en een antwoordvorm die
   niet bestaat. Dat faalt niet tijdens het schrijven maar bij de eerste echte
   klant, als een 400 die op een storing lijkt.

   De registry laat ze daarom leeg, waardoor de router ze overslaat. Zodra de
   documentatie er is: vul generateText hieronder in volgens hetzelfde contract
   en zet de model-ids in de omgeving. Er verandert verder niets. */
function nietGeschreven(naam, watNodig) {
  return {
    async generateText() {
      throw new ProviderError(
        `De ${naam}-adapter is nog niet geschreven. Nodig: ${watNodig}. `
        + 'Zie de kop van api/_ai/providers/index.js.',
        'adapter_not_implemented');
    },
  };
}

/* ── Demo ────────────────────────────────────────────────────────────────────
   Raakt het netwerk nooit aan. Hiermee is de hele router te testen -- routering,
   fallback, escalatie, validatie, verbruik -- zonder sleutel en zonder rekening.

   Hij luistert naar een paar stuurwoorden zodat een test elk pad kan uitlokken. */
const demo = {
  async generateText({ system = '', messages = [], model } = {}) {
    const laatste = messages.length ? messages[messages.length - 1] : { content: '' };
    const inhoud = String(typeof laatste.content === 'string' ? laatste.content : '').toLowerCase();

    if (inhoud.includes('__faal__')) throw new ProviderError('demo: opzettelijke fout.', 'provider_error', 500);
    if (inhoud.includes('__leeg__')) return { text: '', inputTokens: 5, outputTokens: 0 };
    if (inhoud.includes('__kapotte_json__')) {
      return { text: '{ "budget": ', inputTokens: 10, outputTokens: 4 };
    }
    if (inhoud.includes('__onzeker__')) {
      return { text: JSON.stringify({ budget: 300000, timeline_months: 3, mortgage_required: true,
        bedrooms: 2, intent: 'high', confidence: 0.2 }), inputTokens: 20, outputTokens: 30 };
    }
    if (inhoud.includes('__mist_veld__')) {
      return { text: JSON.stringify({ budget: 300000, confidence: 0.9 }), inputTokens: 20, outputTokens: 12 };
    }
    if (inhoud.includes('__json__')) {
      return { text: '```json\n' + JSON.stringify({ budget: 300000, timeline_months: 3,
        mortgage_required: true, bedrooms: 2, intent: 'high', confidence: 0.94 }) + '\n```',
        inputTokens: 25, outputTokens: 40 };
    }
    return { text: 'demo-antwoord (' + (model || 'demo') + ')', inputTokens: 12, outputTokens: 8 };
  },
};

const ADAPTERS = {
  anthropic,
  openai,
  google:     nietGeschreven('google',     'GOOGLE_AI_API_KEY + de model-ids + hun API-documentatie'),
  openrouter: nietGeschreven('openrouter', 'OPENROUTER_API_KEY + de model-ids + hun API-documentatie'),
  demo,
};

function adapterVoor(providerId) {
  const a = ADAPTERS[providerId];
  if (!a) throw new ProviderError(`Onbekende provider "${providerId}".`, 'unknown_provider');
  return a;
}

module.exports = adapterVoor;
module.exports.ADAPTERS = ADAPTERS;
module.exports.ProviderError = ProviderError;
module.exports.TIMEOUT_MS = TIMEOUT_MS;
