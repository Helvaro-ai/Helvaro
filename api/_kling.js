'use strict';
/*
 * De Kling-adapter: opdracht insturen en de status opvragen.
 *
 * ══ LEES DIT EERST ═══════════════════════════════════════════════════════════
 *
 * De vorm van de verzoeken hieronder is NIET geverifieerd tegen de echte API.
 * De machine waarop dit geschreven is kan api.klingai.com niet bereiken -- de
 * uitgaande proxy weigert die host -- dus zijn de endpoints, de veldnamen en de
 * antwoordvorm afgeleid uit wat ik van Kling's publieke API weet, niet uit hun
 * documentatie op het moment van schrijven.
 *
 * Dat is precies het soort code dat pas bij je eerste klant faalt, en dan als
 * een 400 die op een storing lijkt. Daarom drie dingen:
 *
 *   1. Elke aanname staat hieronder met een naam, zodat je weet WAT je nakijkt.
 *   2. `node scripts/kling-check.js` doet één echte aanroep en zegt per aanname
 *      of hij klopt. Dat is één commando en een halve minuut.
 *   3. Antwoorden die niet de verwachte vorm hebben, worden NIET stil als
 *      "mislukt" behandeld. Er komt een fout uit die de ECHTE body laat zien,
 *      want anders zoek je naar een probleem bij Kling dat bij ons zit.
 *
 * AANNAMES, in volgorde van hoe erg het is als ze fout zijn:
 *
 *   A1  Auth is een JWT (HS256), ondertekend met KLING_SECRET_KEY, met
 *       {iss: accessKey, exp: nu+30min, nbf: nu-5s}, meegestuurd als
 *       Authorization: Bearer <jwt>.
 *   A2  Tekst naar video:  POST /v1/videos/text2video
 *       Beeld naar video:  POST /v1/videos/image2video
 *   A3  Het antwoord is {code, message, data:{task_id, task_status}}, waarbij
 *       code === 0 slagen betekent.
 *   A4  Status opvragen: GET /v1/videos/{text2video|image2video}/{task_id}
 *   A5  task_status is een van submitted|processing|succeed|failed, en bij
 *       succeed staat de video op data.task_result.videos[0].url.
 *   A6  duration gaat mee als string in seconden ("5" of "10"), en het formaat
 *       als aspect_ratio ("16:9", "9:16", "1:1") -- niet als pixelmaat.
 *
 * Wat WEL geverifieerd is: het ondertekenen zelf. HS256 is deterministisch en
 * tests/kling.test.js rekent de handtekening na tegen een bekende waarde. Faalt
 * A1 straks, dan is het niet de wiskunde maar de vorm van de payload.
 *
 * -- Geen route ---------------------------------------------------------------
 * Onderstreepje voorop.
 */

const crypto = require('crypto');

/* Zowel het wereldwijde als het Singapore-eindpunt bestaan. Instelbaar, want
   welke van de twee je hoort te gebruiken hangt af van waar je account staat --
   en dat is niet iets om in code vast te leggen. */
const BASIS = (process.env.KLING_API_BASE || 'https://api.klingai.com').replace(/\/$/, '');

class KlingError extends Error {
  constructor(message, code, extra) {
    super(message);
    this.name = 'KlingError';
    this.code = code || 'kling_error';
    if (extra) Object.assign(this, extra);
  }
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * A1: het token.
 *
 * Apart en exporteerbaar zodat het te testen is zonder netwerk -- HS256 is
 * deterministisch, dus dit stuk kan wél bewezen worden.
 */
function maakToken({ accessKey, secretKey, nu = Math.floor(Date.now() / 1000) } = {}) {
  const ak = String(accessKey || process.env.KLING_ACCESS_KEY || '').trim();
  const sk = String(secretKey || process.env.KLING_SECRET_KEY || '').trim();
  if (!ak || !sk) throw new KlingError('KLING_ACCESS_KEY of KLING_SECRET_KEY ontbreekt.', 'not_configured');

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  /* nbf een paar seconden in het verleden: klokken lopen niet gelijk, en een
     token dat "nog niet geldig" is faalt met dezelfde foutcode als een verkeerd
     ondertekend token. Dat kost een uur zoeken. */
  const payload = b64url(JSON.stringify({ iss: ak, exp: nu + 1800, nbf: nu - 5 }));
  const sig = b64url(crypto.createHmac('sha256', sk).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function configured() {
  return !!(String(process.env.KLING_ACCESS_KEY || '').trim()
         && String(process.env.KLING_SECRET_KEY || '').trim());
}

/* A6: Kling denkt in beeldverhoudingen, niet in pixels. De rest van Helvaro
   denkt in "1280x720", omdat dat is wat een gebruiker kiest. Hier vertaald, op
   één plek, zodat er nergens anders een tweede tabel ontstaat. */
function aspect(size) {
  const s = String(size || '').trim();
  const m = s.match(/^(\d+)x(\d+)$/);
  if (!m) return '16:9';
  const b = Number(m[1]), h = Number(m[2]);
  if (!b || !h) return '16:9';
  const v = b / h;
  if (Math.abs(v - 1) < 0.05) return '1:1';
  return v > 1 ? '16:9' : '9:16';
}

/* Kling accepteert alleen bepaalde lengtes. Naar beneden afronden en niet naar
   boven: te lang is duurder dan de klant koos, en dat is de fout die je niet
   wil maken. */
function duur(seconds) {
  const n = Number(seconds) || 5;
  return n >= 10 ? '10' : '5';
}

async function roep(pad, { method = 'GET', body = null } = {}) {
  const token = maakToken();
  const r = await fetch(`${BASIS}${pad}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const tekst = await r.text().catch(() => '');
  let data = null;
  try { data = tekst ? JSON.parse(tekst) : null; } catch (_) { /* geen JSON */ }

  if (!data || typeof data !== 'object') {
    /* A3 klopt niet. Niet stil doorgaan: dan zoek je straks naar een fout bij
       Kling die hier zit. De echte body gaat mee, afgekapt. */
    throw new KlingError(
      `Kling gaf geen JSON terug (HTTP ${r.status}). Aanname A3 klopt niet — zie de kop van api/_kling.js.`,
      'bad_response', { httpStatus: r.status, body: tekst.slice(0, 400) });
  }
  if (!r.ok || (data.code !== 0 && data.code !== undefined && data.code !== null)) {
    throw new KlingError(
      `Kling weigerde het verzoek: ${data.message || 'geen reden'} (HTTP ${r.status}, code ${data.code}).`,
      'rejected', { httpStatus: r.status, klingCode: data.code, body: tekst.slice(0, 400) });
  }
  return data;
}

/* Welk endpoint: met een beeld erbij is het beeld-naar-video. Onthouden in de
   job-id, want poll() krijgt die context niet mee. */
function pad(metBeeld) { return metBeeld ? '/v1/videos/image2video' : '/v1/videos/text2video'; }

const kling = {
  /**
   * A2 + A3. Geeft { providerJobId } terug, waarin het endpoint verstopt zit
   * zodat poll() weet waar hij moet kijken.
   */
  async submit({ model, prompt, imageUrl, seconds, size } = {}) {
    if (!configured()) throw new KlingError('Kling is niet aangesloten.', 'not_configured');
    const tekst = String(prompt || '').trim();
    if (!tekst) throw new KlingError('Een video zonder prompt.', 'no_prompt');

    const metBeeld = !!String(imageUrl || '').trim();
    const body = {
      model_name: (model && model.klingModel) || 'kling-v1',
      prompt: tekst.slice(0, 2500),
      duration: duur(seconds),
      aspect_ratio: aspect(size),
      /* cfg_scale bepaalt hoe strak het model de prompt volgt. 0,5 is Kling's
         eigen standaard; hier expliciet zodat een wijziging aan hun kant niet
         stilletjes ons resultaat verandert. */
      cfg_scale: 0.5,
      mode: 'std',
    };
    if (metBeeld) body.image = String(imageUrl).trim();

    const uit = await roep(pad(metBeeld), { method: 'POST', body });
    const taak = (uit.data && uit.data.task_id) || uit.task_id;
    if (!taak) {
      throw new KlingError(
        'Kling gaf geen task_id terug. Aanname A3 klopt niet — zie de kop van api/_kling.js.',
        'no_task_id', { body: JSON.stringify(uit).slice(0, 400) });
    }
    /* Het endpoint in de id, gescheiden door een dubbele punt. poll() splitst
       hem weer. Zonder dit zou poll() moeten raden of het t2v of i2v was, en
       dat gaat één op de twee keer mis. */
    return { providerJobId: `${metBeeld ? 'i' : 't'}:${taak}` };
  },

  /** A4 + A5. */
  async poll({ providerJobId } = {}) {
    if (!configured()) throw new KlingError('Kling is niet aangesloten.', 'not_configured');
    const ruw = String(providerJobId || '');
    if (!ruw) return { state: 'failed', error: 'geen job-id' };

    const metBeeld = ruw.startsWith('i:');
    const taak = ruw.replace(/^[ti]:/, '');

    let uit;
    try {
      uit = await roep(`${pad(metBeeld)}/${encodeURIComponent(taak)}`);
    } catch (e) {
      /* Een netwerkhapering mag geen mislukte video maken: de opdracht loopt
         gewoon door aan Kling's kant. 'running' teruggeven laat de poller het
         zo weer proberen. Alleen een expliciete weigering is echt mislukt. */
      if (e.code === 'rejected') return { state: 'failed', error: e.message };
      return { state: 'running' };
    }

    const d = uit.data || {};
    const status = String(d.task_status || '').toLowerCase();

    if (status === 'succeed' || status === 'succeeded') {
      const videos = (d.task_result && d.task_result.videos) || [];
      const url = videos[0] && videos[0].url;
      if (!url) {
        return { state: 'failed',
                 error: 'Kling zegt klaar maar geeft geen video-url. Aanname A5 klopt niet — zie api/_kling.js.' };
      }
      return { state: 'ready', url };
    }
    if (status === 'failed') {
      return { state: 'failed', error: d.task_status_msg || 'Kling meldt mislukt zonder reden.' };
    }
    if (status === 'submitted') return { state: 'queued' };
    if (status === 'processing') return { state: 'running' };

    /* Een status die we niet kennen. NIET als mislukt behandelen -- dan gooi je
       een video weg die misschien gewoon nog bezig is. Wel luid loggen, want
       dit betekent dat A5 niet meer klopt. */
    console.warn(`[kling] onbekende task_status "${d.task_status}" voor ${taak} — aanname A5 nakijken.`);
    return { state: 'running' };
  },
};

module.exports = { kling, maakToken, configured, aspect, duur, KlingError, BASIS };
