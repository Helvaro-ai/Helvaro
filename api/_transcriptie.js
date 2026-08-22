'use strict';
/*
 * Spraakberichten uitschrijven.
 *
 * ── Standaard UIT, en dat is de kern ─────────────────────────────────────────
 * Dit kost geld per bericht. Whisper rekent ongeveer $0,006 per minuut; een
 * spraakbericht van een halve minuut is dus een halve cent. Klein bedrag,
 * maar het loopt op met het aantal leads en het is niet ingecalculeerd in de
 * creditprijs van een gesprek. Wie dat wil, hoort dat zelf te beslissen -- niet
 * te ontdekken op een factuur.
 *
 * Daarom: `WHATSAPP_TRANSCRIBE=1` en anders gebeurt er niets. Zonder die vlag
 * doet Helvaro wat het nu ook doet -- vriendelijk zeggen dat het niet kan
 * beluisteren en vragen om het te typen. Dat werkt, en het kost niets.
 *
 * ── Waarom het toch gebouwd is ───────────────────────────────────────────────
 * Omdat "vraag of je het wil typen" een lead kost die net zijn hele situatie
 * heeft ingesproken. Op WhatsApp is een spraakbericht van een minuut normaler
 * dan een alinea tekst, zeker bij oudere kopers. Die inspreken en dan te horen
 * krijgen "kan je dat typen" is precies het moment waarop iemand afhaakt.
 *
 * ── De weg ───────────────────────────────────────────────────────────────────
 *   1. Meta geeft in de webhook een media-id, geen bestand.
 *   2. GET /{media-id} levert een tijdelijke URL (geldig ~5 minuten).
 *   3. Die URL ophalen MET het bearer-token -- zonder token krijg je een 401,
 *      en dat is de val waar iedereen één keer in trapt.
 *   4. Bytes naar Whisper.
 *
 * Faalt er iets, dan geeft dit '' terug en valt de aanroeper terug op de
 * bestaande tekst. Een lead hoort nooit een technische fout te zien voor iets
 * dat wij niet konden lezen.
 *
 * ── Geen route ───────────────────────────────────────────────────────────────
 * Onderstreepje voorop.
 */

const GRAPH_VERSION = 'v19.0';

/* Boven deze grens niet proberen. Een spraakbericht van tien minuten is geen
   vraag over een pand maar iets anders, en het kost dan ook tien keer zoveel.
   Meta staat 16 MB toe voor audio; dit is ruim onder wat een normaal
   spraakbericht ooit haalt. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_SECONDEN = 300;

function aan() {
  const vlag = String(process.env.WHATSAPP_TRANSCRIBE || '').trim().toLowerCase();
  if (!/^(1|true|yes|on|ja|aan)$/.test(vlag)) return false;
  return Boolean(sleutel() && process.env.WHATSAPP_TOKEN);
}

function sleutel() {
  return process.env.OPENAI_API_KEY || process.env.OPENAI || '';
}

/** Het model. Instelbaar, want dit is precies het soort keuze dat verandert. */
function model() {
  return String(process.env.WHATSAPP_TRANSCRIBE_MODEL || '').trim() || 'whisper-1';
}

async function metTimeout(url, opts, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Een spraakbericht uitschrijven.
 *
 * @param {object} o
 * @param {string} o.mediaId    het id uit de webhook
 * @param {number} [o.seconden] de duur die Meta meestuurt, als die er is
 * @param {string} [o.taal]     ISO 639-1, helpt Whisper maar is niet verplicht
 * @returns {Promise<string>}   de tekst, of '' als het niet gelukt is
 */
async function schrijfUit({ mediaId, seconden, taal } = {}) {
  if (!aan()) return '';
  const id = String(mediaId || '').trim();
  if (!id) return '';

  if (Number.isFinite(Number(seconden)) && Number(seconden) > MAX_SECONDEN) {
    console.warn(`[transcriptie] ${Math.round(seconden)}s is te lang, overgeslagen`);
    return '';
  }

  const token = process.env.WHATSAPP_TOKEN;

  try {
    // 1. Het media-id omzetten naar een tijdelijke URL.
    const metaR = await metTimeout(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } }, 8000);
    if (!metaR.ok) {
      console.warn(`[transcriptie] media-info mislukt (HTTP ${metaR.status})`);
      return '';
    }
    const meta = await metaR.json();
    if (!meta || !meta.url) return '';
    if (Number(meta.file_size) > MAX_BYTES) {
      console.warn(`[transcriptie] bestand te groot (${meta.file_size} bytes), overgeslagen`);
      return '';
    }

    /* 2. Downloaden MET het bearer-token. Die URL staat op een CDN van Meta en
          weigert zonder token met een 401 -- dat ziet eruit als een verlopen
          link en is het niet. */
    const bytesR = await metTimeout(meta.url, { headers: { Authorization: `Bearer ${token}` } }, 15000);
    if (!bytesR.ok) {
      console.warn(`[transcriptie] downloaden mislukt (HTTP ${bytesR.status})`);
      return '';
    }
    const buf = Buffer.from(await bytesR.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return '';

    // 3. Naar Whisper.
    const form = new FormData();
    const type = meta.mime_type || 'audio/ogg';
    const ext = type.indexOf('mp4') !== -1 ? 'mp4' : type.indexOf('mpeg') !== -1 ? 'mp3' : 'ogg';
    form.append('file', new Blob([buf], { type }), `spraak.${ext}`);
    form.append('model', model());
    /* De taal meegeven als we hem kennen: dat scheelt fouten bij korte
       fragmenten, waar Whisper anders weleens de verkeerde taal kiest en een
       Nederlandse zin als Duits uitschrijft. */
    if (taal && /^[a-z]{2}$/i.test(taal)) form.append('language', String(taal).toLowerCase());

    const wR = await metTimeout('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sleutel()}` },
      body: form,
    }, 30000);
    if (!wR.ok) {
      const t = await wR.text().catch(() => '');
      console.warn(`[transcriptie] Whisper weigerde (HTTP ${wR.status}):`, t.slice(0, 200));
      return '';
    }
    const uit = await wR.json();
    const tekst = String((uit && uit.text) || '').trim();
    /* Whisper geeft op stilte of ruis soms een losse punt of een verzonnen
       zinnetje terug. Onder de drie tekens is het geen vraag over een pand. */
    return tekst.length >= 3 ? tekst.slice(0, 2000) : '';
  } catch (err) {
    console.warn('[transcriptie] mislukt:', err && err.message);
    return '';
  }
}

module.exports = { aan, schrijfUit, model, MAX_BYTES, MAX_SECONDEN, GRAPH_VERSION };
