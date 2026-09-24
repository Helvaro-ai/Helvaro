'use strict';
/*
 * Gmail / Google Workspace als e-mailprovider.
 *
 * Hergebruikt de Google-OAuth-client van de agenda (api/_gcal.js): dezelfde
 * client-id, redirect-URI, versleuteling van het verversingstoken en
 * tokenverversing. Alleen de scopes verschillen, en de callback herkent een
 * mailbox-koppeling aan de state-prefix "mail." (api/leads.js handleGcal).
 *
 * ── Scopes ──────────────────────────────────────────────────────────────────
 *   gmail.readonly  lezen van inkomende mail (history + messages.get)
 *   gmail.send      versturen namens de dealer
 * Allebei "restricted" bij Google: zolang de OAuth-app niet geverifieerd is,
 * werkt dit alleen voor testgebruikers die in de Google Cloud-console staan.
 * Dat staat eerlijk in het dashboard; er wordt niets gesimuleerd.
 *
 * ── Geen gmail.modify ───────────────────────────────────────────────────────
 * Helvaro markeert niets als gelezen en verplaatst niets in de mailbox van de
 * dealer. De mailbox blijft van hem; Helvaro leest mee en antwoordt.
 */

const _gcal = require('../_gcal');

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

class MailFout extends Error {
  constructor(msg, code, status) { super(msg); this.code = code; this.status = status; }
}

function isConfigured() { return _gcal.isConfigured(); }

function getAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

async function api(accessToken, pad, opts = {}) {
  const r = await fetch(API + pad, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${accessToken}` }, opts.body ? { 'Content-Type': 'application/json' } : {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeout || 12000),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    const reden = (d && d.error && (d.error.status || d.error.message)) || ('http ' + r.status);
    const code = r.status === 401 ? 'reauth_required' : r.status === 403 ? 'geen_toegang' : r.status === 404 ? 'niet_gevonden' : r.status === 429 ? 'te_veel' : 'gmail_fout';
    throw new MailFout('Gmail: ' + reden, code, r.status);
  }
  return r.json();
}

async function profiel(accessToken) {
  const d = await api(accessToken, '/profile');
  return { email: String(d.emailAddress || '').toLowerCase(), historyId: String(d.historyId || '') };
}

/**
 * Nieuwe inkomende berichten sinds historyId. Is die te oud (Gmail bewaart
 * history ongeveer een week), dan valt dit terug op "inbox, laatste 2 dagen"
 * en zegt dat met `herstart: true`. Dedup gebeurt verderop op Message-ID.
 */
async function nieuweBerichten(accessToken, historyId, { max = 25 } = {}) {
  const ids = new Set();
  let nieuwHistoryId = historyId;
  if (historyId) {
    try {
      let pageToken = '';
      for (let ronde = 0; ronde < 5 && ids.size < max; ronde++) {
        const q = new URLSearchParams({ startHistoryId: historyId, historyTypes: 'messageAdded', labelId: 'INBOX', maxResults: '100' });
        if (pageToken) q.set('pageToken', pageToken);
        const d = await api(accessToken, '/history?' + q.toString());
        for (const h of d.history || []) for (const m of h.messagesAdded || []) if (m.message && m.message.id) ids.add(m.message.id);
        if (d.historyId) nieuwHistoryId = String(d.historyId);
        if (!d.nextPageToken) break;
        pageToken = d.nextPageToken;
      }
      return { ids: Array.from(ids).slice(0, max), historyId: nieuwHistoryId, herstart: false, meer: ids.size > max };
    } catch (e) {
      if (e.code !== 'niet_gevonden') throw e;
    }
  }
  const q = new URLSearchParams({ q: 'in:inbox newer_than:2d', maxResults: String(max) });
  const d = await api(accessToken, '/messages?' + q.toString());
  const p = await profiel(accessToken);
  return { ids: (d.messages || []).map((m) => m.id), historyId: p.historyId, herstart: true, meer: Boolean(d.nextPageToken) };
}

/* ── MIME ──────────────────────────────────────────────────────────────── */

function b64url(s) { return Buffer.from(String(s || ''), 'base64url').toString('utf8'); }

/** =?utf-8?B?...?= en =?utf-8?Q?...?= in kopregels. */
function decodeerKop(v) {
  return String(v || '').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, tekst) => {
    try {
      if (enc.toUpperCase() === 'B') return Buffer.from(tekst, 'base64').toString(/utf-?8/i.test(cs) ? 'utf8' : 'latin1');
      const bytes = tekst.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (__, h) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, 'latin1').toString(/utf-?8/i.test(cs) ? 'utf8' : 'latin1');
    } catch (e) { return tekst; }
  });
}

function htmlNaarTekst(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

/** De leesbare tekst van een Gmail-payload: text/plain eerst, anders html. */
function tekstUit(payload) {
  let plat = '', html = '';
  const loop = (deel, diepte) => {
    if (!deel || diepte > 8) return;
    const mime = String(deel.mimeType || '').toLowerCase();
    const isBijlage = deel.filename && deel.filename.length > 0;
    if (!isBijlage && deel.body && deel.body.data) {
      if (mime === 'text/plain' && !plat) plat = b64url(deel.body.data);
      else if (mime === 'text/html' && !html) html = b64url(deel.body.data);
    }
    for (const p of deel.parts || []) loop(p, diepte + 1);
  };
  loop(payload, 0);
  return (plat || htmlNaarTekst(html)).replace(/\r\n/g, '\n').trim();
}

/** Het geciteerde deel onder "Op ... schreef ...:" / "On ... wrote:" eraf. */
function zonderCitaat(tekst) {
  const regels = String(tekst || '').split('\n');
  const stop = regels.findIndex((r) => /^(On|Op|Le|Am)\s.+(wrote|schreef|a écrit|schrieb)\b.*:\s*$/i.test(r.trim()) || /^-{2,}\s*(Original Message|Oorspronkelijk bericht|Message d'origine)/i.test(r.trim()) || /^>/.test(r));
  return (stop > 0 ? regels.slice(0, stop) : regels).join('\n').trim();
}

function adres(v) {
  const m = String(v || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(v || '')).trim().toLowerCase();
}

function parseBericht(d) {
  const kop = {};
  for (const h of (d.payload && d.payload.headers) || []) kop[String(h.name).toLowerCase()] = h.value;
  const volledig = tekstUit(d.payload);
  return {
    id: d.id, threadId: d.threadId, labelIds: d.labelIds || [],
    rfcId: String(kop['message-id'] || '').trim(),
    antwoordOp: String(kop['in-reply-to'] || '').trim(),
    referenties: String(kop.references || '').trim(),
    van: decodeerKop(kop.from || ''), vanAdres: adres(kop.from),
    aan: decodeerKop(kop.to || ''), cc: decodeerKop(kop.cc || ''),
    onderwerp: decodeerKop(kop.subject || ''),
    datum: d.internalDate ? new Date(Number(d.internalDate)).toISOString() : new Date().toISOString(),
    tekst: zonderCitaat(volledig).slice(0, 20000),
    volledigeTekst: volledig.slice(0, 50000),
    koppen: {
      autoSubmitted: String(kop['auto-submitted'] || ''), precedence: String(kop.precedence || ''),
      listId: String(kop['list-id'] || ''), listUnsubscribe: String(kop['list-unsubscribe'] || ''),
      xAutoreply: String(kop['x-autoreply'] || kop['x-autorespond'] || ''), returnPath: String(kop['return-path'] || ''),
      xHelvaro: String(kop['x-helvaro'] || ''),
    },
  };
}

async function haal(accessToken, id) {
  const d = await api(accessToken, `/messages/${encodeURIComponent(id)}?format=full`);
  return parseBericht(d);
}

/* ── Versturen ─────────────────────────────────────────────────────────── */

/** Geen CR/LF in een kopregel: anders kan een onderwerp een Bcc: toevoegen. */
function kopVeilig(v) { return String(v || '').replace(/[\r\n]+/g, ' ').trim(); }

function kopCodeer(v) {
  const s = kopVeilig(v);
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}

function bouwRfc822({ van, aan, cc, onderwerp, tekst, antwoordOp, referenties, messageId }) {
  const regels = [
    `From: ${kopVeilig(van)}`,
    `To: ${kopVeilig(aan)}`,
  ];
  if (cc) regels.push(`Cc: ${kopVeilig(cc)}`);
  regels.push(`Subject: ${kopCodeer(onderwerp)}`);
  if (messageId) regels.push(`Message-ID: ${kopVeilig(messageId)}`);
  if (antwoordOp) regels.push(`In-Reply-To: ${kopVeilig(antwoordOp)}`);
  if (referenties || antwoordOp) regels.push(`References: ${kopVeilig([referenties, antwoordOp].filter(Boolean).join(' '))}`);
  /* Eigen kop: een antwoord op dit bericht dat automatisch terugkomt (een
     afwezigheidsmelding die ons citeert) is zo herkenbaar als lus. */
  regels.push('X-Helvaro: 1');
  regels.push('MIME-Version: 1.0');
  regels.push('Content-Type: text/plain; charset=UTF-8');
  regels.push('Content-Transfer-Encoding: base64');
  regels.push('');
  regels.push(Buffer.from(String(tekst || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'));
  return regels.join('\r\n');
}

async function verstuur(accessToken, bericht) {
  const raw = Buffer.from(bouwRfc822(bericht), 'utf8').toString('base64url');
  const body = { raw };
  if (bericht.threadId) body.threadId = bericht.threadId;
  const d = await api(accessToken, '/messages/send', { method: 'POST', body, timeout: 20000 });
  return { id: d.id, threadId: d.threadId };
}

/* ── Push (Google Cloud Pub/Sub) ─────────────────────────────────────────
   Gmail meldt nieuwe mail op een Pub/Sub-topic (GMAIL_PUBSUB_TOPIC, bv.
   projects/<id>/topics/helvaro-gmail). Het topic moet publicatierecht geven
   aan gmail-api-push@system.gserviceaccount.com; de push-subscription wijst
   naar /api/gcal?action=mailpush&token=<GMAIL_PUSH_TOKEN>. Een watch verloopt
   na 7 dagen; de dagelijkse cron vernieuwt hem. Zonder topic: gewoon polling. */
function pushTopic() { return String(process.env.GMAIL_PUBSUB_TOPIC || '').trim(); }

async function watch(accessToken) {
  const topicName = pushTopic();
  if (!topicName) return null;
  const d = await api(accessToken, '/watch', { method: 'POST', body: { topicName, labelIds: ['INBOX'], labelFilterBehavior: 'include' } });
  return { historyId: String(d.historyId || ''), verloopt: d.expiration ? new Date(Number(d.expiration)).toISOString() : '' };
}

async function stopWatch(accessToken) {
  try { await api(accessToken, '/stop', { method: 'POST', body: {} }); } catch (e) { /* al gestopt of token weg */ }
}

module.exports = {
  naam: 'gmail', beschikbaar: true, SCOPES, MailFout,
  isConfigured, getAuthUrl, profiel, nieuweBerichten, haal, verstuur, watch, stopWatch, pushTopic,
  _test: { parseBericht, tekstUit, zonderCitaat, decodeerKop, bouwRfc822, kopVeilig, adres, htmlNaarTekst },
};
