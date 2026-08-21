'use strict';
/*
 * AI-modelregister -- de ENIGE plek die een modelnaam kent.
 *
 * -- Waarom dit bestaat --------------------------------------------------------
 * Voor deze laag stonden er negen losse Anthropic-aanroepen in de codebase, elk
 * met een hardgecodeerd model-id, en daarnaast nog OpenAI-aanroepen in
 * _images.js en admin.js. Een model wisselen betekende negen bestanden
 * doorzoeken en hopen dat je er geen vergat. Erger: elke aanroep gebruikte het
 * GOEDKOOPSTE model dat er was, ook voor werk waar dat niet voor deugt, en
 * duurdere modellen werden nergens overwogen.
 *
 * -- Tiers, geen modelnamen ----------------------------------------------------
 * Features vragen om een TAAK (zie tasks.js). De router vertaalt die naar een
 * tier, en pas hier wordt daar een provider + model van gemaakt. Een feature
 * noemt dus nooit een vendor of een versienummer.
 *
 *   cheap          hoog volume, simpel: classificatie, extractie, samenvatten
 *   conversational  het WhatsApp-gesprek en alles wat erop lijkt
 *   reasoning      alleen als het goedkope model het aantoonbaar niet redt
 *   vision         een foto bekijken en beschrijven
 *   image          beeld maken of bewerken
 *   video          video maken
 *
 * -- Elk id komt uit configuratie ---------------------------------------------
 * De standaardwaarden hieronder zijn modellen die deze codebase AL gebruikt en
 * waarvan het gebruik dus bewezen is. Alles is te overschrijven met een
 * omgevingsvariabele, zodat een nieuw model aanzetten geen deploy van nieuwe
 * code vraagt.
 *
 * BEWUST NIET INGEVULD: er staan hier geen model-ids in die ik niet kon
 * verifieren. Ik kon vanaf deze machine geen enkele leveranciersdocumentatie
 * bereiken (de proxy blokkeert ze), en een verzonnen id faalt niet bij het
 * schrijven maar bij de eerste echte klant, als een 400 die op een storing
 * lijkt. Google-tiers staan daarom leeg: zet GOOGLE_MODEL_CHEAP en vrienden en
 * ze doen mee. Zolang ze leeg zijn slaat de router die provider over.
 */

/** Tier-namen, zodat een typefout een fout is en geen stille misroutering. */
const TIERS = Object.freeze({
  CHEAP:          'cheap',
  CONVERSATIONAL: 'conversational',
  REASONING:      'reasoning',
  VISION:         'vision',
  IMAGE:          'image',
  VIDEO:          'video',
});

function env(naam, standaard) {
  const v = String(process.env[naam] || '').trim();
  return v || standaard || '';
}

/*
 * Prijzen in USD per miljoen tokens, of per generatie/seconde voor media.
 * Eén plek, zodat een prijswijziging geen zoektocht door de business-logica is.
 *
 * De token-prijzen voor Claude staan al in api/_credits.js MODEL_PRICES, dat de
 * credits berekent. Die blijft de bron voor het AFSCHRIJVEN; dit is de bron
 * voor het RAPPORTEREN van kosten per aanroep. Ze uit elkaar houden is
 * bewust: credits zijn wat de klant betaalt, kosten zijn wat jij betaalt.
 */
const PRICING = Object.freeze({
  // Anthropic, lijstprijs.
  'claude-haiku-4-5-20251001': { inPerM: 1.00,  outPerM: 5.00 },
  'claude-haiku-4-5':          { inPerM: 1.00,  outPerM: 5.00 },
  'claude-sonnet-5':           { inPerM: 3.00,  outPerM: 15.00 },
  'claude-opus-5':             { inPerM: 5.00,  outPerM: 25.00 },
  // OpenAI beeld: per generatie, afhankelijk van kwaliteit (zie _media-models.js).
  'gpt-image-2':               { perImage: { low: 0.006, medium: 0.053, high: 0.211 } },
});

/**
 * Een providerdefinitie: welke modellen hij per tier levert en wat hij kan.
 * Een leeg model-id betekent "deze provider doet deze tier niet" -- de router
 * slaat hem dan over in plaats van een lege string naar een API te sturen.
 */
const PROVIDERS = Object.freeze({
  anthropic: Object.freeze({
    id: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    kanTekst: true,
    kanBeeld: false,
    kanVideo: false,
    modellen: Object.freeze({
      [TIERS.CHEAP]:          env('ANTHROPIC_MODEL_CHEAP',  'claude-haiku-4-5-20251001'),
      [TIERS.CONVERSATIONAL]: env('ANTHROPIC_MODEL_CONV',   'claude-haiku-4-5-20251001'),
      [TIERS.REASONING]:      env('ANTHROPIC_MODEL_REASON', 'claude-sonnet-5'),
      [TIERS.VISION]:         env('ANTHROPIC_MODEL_VISION', 'claude-haiku-4-5-20251001'),
      [TIERS.IMAGE]:          '',
      [TIERS.VIDEO]:          '',
    }),
  }),

  openai: Object.freeze({
    id: 'openai',
    envKey: 'OPENAI_API_KEY',
    kanTekst: true,
    kanBeeld: true,
    kanVideo: false,
    modellen: Object.freeze({
      // Tekst-tiers leeg gelaten: deze codebase gebruikt OpenAI vandaag alleen
      // voor beeld. Een tekstmodel-id invullen dat hier nooit is aangeroepen
      // zou een gok zijn.
      [TIERS.CHEAP]:          env('OPENAI_MODEL_CHEAP',  ''),
      [TIERS.CONVERSATIONAL]: env('OPENAI_MODEL_CONV',   ''),
      [TIERS.REASONING]:      env('OPENAI_MODEL_REASON', ''),
      [TIERS.VISION]:         env('OPENAI_MODEL_VISION', ''),
      [TIERS.IMAGE]:          env('OPENAI_MODEL_IMAGE',  'gpt-image-2'),
      [TIERS.VIDEO]:          '',
    }),
  }),

  /* Google. Alles leeg tot iemand de ids zet: ik kon ze niet verifieren.
     Zodra GOOGLE_AI_API_KEY en minstens een model-id gezet zijn, doet deze
     provider mee zonder codewijziging. */
  google: Object.freeze({
    id: 'google',
    envKey: 'GOOGLE_AI_API_KEY',
    kanTekst: true,
    kanBeeld: false,
    kanVideo: true,
    modellen: Object.freeze({
      [TIERS.CHEAP]:          env('GOOGLE_MODEL_CHEAP',  ''),
      [TIERS.CONVERSATIONAL]: env('GOOGLE_MODEL_CONV',   ''),
      [TIERS.REASONING]:      env('GOOGLE_MODEL_REASON', ''),
      [TIERS.VISION]:         env('GOOGLE_MODEL_VISION', ''),
      [TIERS.IMAGE]:          '',
      [TIERS.VIDEO]:          env('GOOGLE_MODEL_VIDEO',  ''),
    }),
  }),

  /* OpenRouter: optioneel, nooit verplicht. Hij verkoopt dezelfde modellen door
     met een opslag, dus hij is nuttig als uitwijk en voor modellen die je
     nergens anders bereikt -- niet als fundament. */
  openrouter: Object.freeze({
    id: 'openrouter',
    envKey: 'OPENROUTER_API_KEY',
    kanTekst: true,
    kanBeeld: false,
    kanVideo: false,
    modellen: Object.freeze({
      [TIERS.CHEAP]:          env('OPENROUTER_MODEL_CHEAP',  ''),
      [TIERS.CONVERSATIONAL]: env('OPENROUTER_MODEL_CONV',   ''),
      [TIERS.REASONING]:      env('OPENROUTER_MODEL_REASON', ''),
      [TIERS.VISION]:         env('OPENROUTER_MODEL_VISION', ''),
      [TIERS.IMAGE]:          '',
      [TIERS.VIDEO]:          '',
    }),
  }),

  /* Scripted, raakt het netwerk nooit aan. Hiermee is de hele router te testen
     zonder sleutel en zonder rekening. */
  demo: Object.freeze({
    id: 'demo',
    envKey: '',
    kanTekst: true,
    kanBeeld: true,
    kanVideo: true,
    modellen: Object.freeze({
      [TIERS.CHEAP]: 'demo', [TIERS.CONVERSATIONAL]: 'demo', [TIERS.REASONING]: 'demo',
      [TIERS.VISION]: 'demo', [TIERS.IMAGE]: 'demo', [TIERS.VIDEO]: 'demo',
    }),
  }),
});

/*
 * Voorkeursvolgorde per tier. De router loopt deze af en pakt de eerste
 * provider die (a) een model heeft voor die tier en (b) een sleutel heeft.
 * De rest van de lijst is meteen de fallback-keten.
 *
 * Volgorde is "goedkoopste die het aankan, eerst" -- behalve bij reasoning,
 * waar kwaliteit de reden van bestaan is.
 */
const VOORKEUR = Object.freeze({
  [TIERS.CHEAP]:          ['google', 'anthropic', 'openrouter'],
  [TIERS.CONVERSATIONAL]: ['anthropic', 'google', 'openrouter'],
  [TIERS.REASONING]:      ['anthropic', 'openai', 'google', 'openrouter'],
  [TIERS.VISION]:         ['google', 'anthropic', 'openrouter'],
  [TIERS.IMAGE]:          ['openai'],
  [TIERS.VIDEO]:          ['google'],
});

/** Heeft deze provider zijn sleutel? De demo-provider heeft er geen nodig. */
function heeftSleutel(providerId) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  if (!p.envKey) return true;
  return !!String(process.env[p.envKey] || '').trim();
}

/** Kan deze provider deze tier daadwerkelijk bedienen? */
function kanTier(providerId, tier) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  const model = p.modellen[tier];
  return !!model && heeftSleutel(providerId);
}

/**
 * De keten voor een tier: alle bruikbare providers, in voorkeursvolgorde.
 * Leeg betekent: niets geconfigureerd. De router maakt daar een duidelijke
 * fout van, geen stille terugval op iets anders.
 */
function keten(tier) {
  const lijst = VOORKEUR[tier] || [];
  const uit = lijst.filter((id) => kanTier(id, tier));
  // De demo-provider staat nooit in VOORKEUR: hij hoort alleen te draaien als
  // iemand hem expliciet kiest, nooit als stille uitwijk voor een echte klant.
  if (String(process.env.AI_PROVIDER_FORCE || '').trim()) {
    const forced = String(process.env.AI_PROVIDER_FORCE).trim();
    return kanTier(forced, tier) ? [forced] : [];
  }
  return uit;
}

/** Het model-id voor een provider + tier. */
function modelVoor(providerId, tier) {
  const p = PROVIDERS[providerId];
  return (p && p.modellen[tier]) || '';
}

/** Geschatte kosten in USD. Onbekend model -> null, nooit een verzonnen getal. */
function kostenUsd({ model, inputTokens = 0, outputTokens = 0, images = 0, quality = 'medium' } = {}) {
  const prijs = PRICING[model];
  if (!prijs) return null;
  if (prijs.perImage) {
    const per = prijs.perImage[quality];
    return Number.isFinite(per) ? per * (images || 1) : null;
  }
  if (!Number.isFinite(prijs.inPerM) || !Number.isFinite(prijs.outPerM)) return null;
  return (Number(inputTokens) || 0) / 1e6 * prijs.inPerM
       + (Number(outputTokens) || 0) / 1e6 * prijs.outPerM;
}

/** Wat er ontbreekt om een tier te kunnen draaien -- voor preflight en logs. */
function watOntbreekt(tier) {
  const lijst = VOORKEUR[tier] || [];
  return lijst.map((id) => {
    const p = PROVIDERS[id];
    const model = modelVoor(id, tier);
    return {
      provider: id,
      heeftModel: !!model,
      heeftSleutel: heeftSleutel(id),
      mist: [!model ? 'model-id' : null, !heeftSleutel(id) ? (p.envKey || 'sleutel') : null].filter(Boolean),
    };
  });
}

module.exports = {
  TIERS, PROVIDERS, PRICING, VOORKEUR,
  heeftSleutel, kanTier, keten, modelVoor, kostenUsd, watOntbreekt,
};
