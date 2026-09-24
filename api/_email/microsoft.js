'use strict';
/*
 * Microsoft 365 / Outlook.com als e-mailprovider (Microsoft Graph).
 *
 * ── Inschakelen ─────────────────────────────────────────────────────────────
 * Registreer een app in Microsoft Entra (Azure) en zet in Vercel:
 *   MS_CLIENT_ID, MS_CLIENT_SECRET   van die app-registratie
 *   MS_REDIRECT_URI                  standaard dezelfde als Google
 *                                    (https://app.helvaro.pro/api/gcal);
 *                                    moet in Entra als redirect-URI staan
 *   MS_TENANT                        optioneel, standaard 'common'
 * Zonder deze variabelen meldt isConfigured() false en toont het dashboard
 * "nog niet beschikbaar" -- er wordt niets gesimuleerd.
 *
 * ── Rechten (gedelegeerd) ───────────────────────────────────────────────────
 *   offline_access  verversingstoken
 *   User.Read       welk adres er gekoppeld is
 *   Mail.Read       inkomende mail lezen
 *   Mail.Send       antwoorden versturen
 * Geen Mail.ReadWrite: Helvaro markeert niets en verplaatst niets.
 *
 * ── Zelfde vorm als Gmail ───────────────────────────────────────────────────
 * haal() geeft exact de vorm van gmail.parseBericht terug, zodat de hele
 * pijplijn (dedup, classificatie, klant, gesprek, lead) ongewijzigd werkt. De
 * "thread" is Graph's conversationId; de cursor is een deltaLink.
 */

const gmail = require('./gmail'); // voor de gedeelde tekstfuncties (citaat, html)

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'offline_access User.Read Mail.Read Mail.Send openid email';

class MailFout extends Error {
  constructor(msg, code, status) { super(msg); this.code = code; this.status = status; }
}

function tenant() { return String(process.env.MS_TENANT || 'common').trim(); }
function redirectUri() { return String(process.env.MS_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || '').trim(); }
function isConfigured() { return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && redirectUri()); }

function getAuthUrl(state) {
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(),
    response_mode: 'query', scope: SCOPES, state, prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${p.toString()}`;
}

async function token(params) {
  const body = new URLSearchParams(Object.assign({
    client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, scope: SCOPES, redirect_uri: redirectUri(),
  }, params));
  const r = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(12000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    const e = new MailFout('Microsoft: ' + (d.error_description || d.error || r.status), d.error === 'invalid_grant' ? 'reauth_required' : 'ms_fout', r.status);
    throw e;
  }
  return d;
}

async function wisselCode(code) {
  const d = await token({ grant_type: 'authorization_code', code });
  return { refreshToken: d.refresh_token || '', accessToken: d.access_token };
}

async function vernieuwToken(refreshToken) {
  const d = await token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return d.access_token;
}

async function api(accessToken, pad, opts = {}) {
  const url = /^https:\/\//.test(pad) ? pad : GRAPH + pad;
  /* Alleen naar Graph zelf: een deltaLink komt van Microsoft, maar we volgen
     nooit een link naar een ander domein. */
  if (!url.startsWith(GRAPH + '/')) throw new MailFout('Onverwachte Graph-link.', 'ms_fout');
  const r = await fetch(url, {
    method: opts.method || 'GET',
    headers: Object.assign({ Authorization: `Bearer ${accessToken}` }, opts.body ? { 'Content-Type': 'application/json' } : {}, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(opts.timeout || 12000),
  });
  if (r.status === 202 || r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = r.status === 401 ? 'reauth_required' : r.status === 403 ? 'geen_toegang' : r.status === 404 ? 'niet_gevonden' : r.status === 429 ? 'te_veel' : 'ms_fout';
    throw new MailFout('Microsoft: ' + ((d.error && d.error.message) || r.status), code, r.status);
  }
  return d;
}

async function profiel(accessToken) {
  const d = await api(accessToken, '/me?$select=mail,userPrincipalName');
  return { email: String(d.mail || d.userPrincipalName || '').toLowerCase(), historyId: '' };
}

/**
 * Nieuwe inboxberichten via delta. Zonder cursor: eerst de huidige stand
 * "leegdrinken" (niets verwerken) zodat een koppeling niet de hele inbox
 * importeert -- net als Gmail vanaf de historyId van het koppelmoment.
 */
async function nieuweBerichten(accessToken, cursor, { max = 25 } = {}) {
  const ids = [];
  let link = cursor || `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=id`;
  const eersteKeer = !cursor;
  let deltaLink = '';
  for (let ronde = 0; ronde < 20 && link; ronde++) {
    const d = await api(accessToken, link, { headers: { Prefer: 'odata.maxpagesize=50' } });
    if (!eersteKeer) for (const m of d.value || []) if (m && m.id && !m['@removed'] && ids.length < max) ids.push(m.id);
    if (d['@odata.deltaLink']) { deltaLink = d['@odata.deltaLink']; break; }
    link = d['@odata.nextLink'] || '';
    if (!eersteKeer && ids.length >= max) { deltaLink = link; break; }
  }
  return { ids, historyId: deltaLink || cursor || '', herstart: eersteKeer, meer: false };
}

function adresVan(r) {
  const e = r && r.emailAddress;
  if (!e) return '';
  return e.name && e.name !== e.address ? `"${String(e.name).replace(/"/g, '')}" <${e.address}>` : String(e.address || '');
}

async function haal(accessToken, id) {
  const d = await api(accessToken, `/me/messages/${encodeURIComponent(id)}?$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,internetMessageHeaders,hasAttachments`, {
    headers: { Prefer: 'outlook.body-content-type="text"' },
  });
  const kop = {};
  for (const h of d.internetMessageHeaders || []) kop[String(h.name).toLowerCase()] = h.value;
  const volledig = String((d.body && d.body.content) || '').replace(/\r\n/g, '\n').trim();
  let bijlagen = [];
  if (d.hasAttachments) {
    try {
      const a = await api(accessToken, `/me/messages/${encodeURIComponent(id)}/attachments?$select=id,name,contentType,size`);
      bijlagen = (a.value || []).filter((x) => x['@odata.type'] !== '#microsoft.graph.itemAttachment').slice(0, 10).map((x) => ({
        id: String(x.id).slice(0, 400), naam: String(x.name || 'bijlage').replace(/[\r\n\\/:*?"<>|]+/g, '_').slice(0, 150),
        type: String(x.contentType || 'application/octet-stream').slice(0, 100), grootte: Number(x.size) || 0,
      }));
    } catch (e) { bijlagen = []; }
  }
  const van = adresVan(d.from);
  return {
    id: d.id, threadId: String(d.conversationId || d.id), labelIds: [],
    rfcId: String(d.internetMessageId || '').trim(),
    antwoordOp: String(kop['in-reply-to'] || '').trim(), referenties: String(kop.references || '').trim(),
    van, vanAdres: String((d.from && d.from.emailAddress && d.from.emailAddress.address) || '').toLowerCase(),
    aan: (d.toRecipients || []).map(adresVan).join(', '), cc: (d.ccRecipients || []).map(adresVan).join(', '),
    onderwerp: String(d.subject || ''), datum: d.receivedDateTime || new Date().toISOString(),
    tekst: gmail._test.zonderCitaat(volledig).slice(0, 20000), volledigeTekst: volledig.slice(0, 50000), bijlagen,
    koppen: {
      autoSubmitted: String(kop['auto-submitted'] || ''), precedence: String(kop.precedence || ''),
      listId: String(kop['list-id'] || ''), listUnsubscribe: String(kop['list-unsubscribe'] || ''),
      xAutoreply: String(kop['x-autoreply'] || kop['x-autorespond'] || ''), returnPath: String(kop['return-path'] || ''),
      xHelvaro: String(kop['x-helvaro'] || ''),
    },
  };
}

/**
 * Antwoorden in de thread: createReply (Graph zet de juiste In-Reply-To en
 * References), tekst erin, X-Helvaro-kop voor de lusbewaking, versturen.
 */
async function verstuur(accessToken, bericht) {
  if (!bericht.antwoordOpExternId) throw new MailFout('Geen bericht om op te antwoorden.', 'geen_ontvanger');
  const pad = `/me/messages/${encodeURIComponent(bericht.antwoordOpExternId)}/createReply`;
  /* Eigen kopregels mogen alleen bij het AANMAKEN; lukt dat niet (oudere
     tenant), dan zonder -- de lusbewaking herkent ons dan nog aan het eigen
     adres. */
  let concept;
  try { concept = await api(accessToken, pad, { method: 'POST', body: { message: { internetMessageHeaders: [{ name: 'X-Helvaro', value: '1' }] } } }); }
  catch (e) { if (e.code === 'reauth_required') throw e; concept = await api(accessToken, pad, { method: 'POST', body: {} }); }
  if (!concept.id) throw new MailFout('Microsoft maakte geen antwoord aan.', 'ms_fout');
  await api(accessToken, `/me/messages/${encodeURIComponent(concept.id)}`, { method: 'PATCH', body: {
    body: { contentType: 'text', content: String(bericht.tekst || '') },
  } });
  await api(accessToken, `/me/messages/${encodeURIComponent(concept.id)}/send`, { method: 'POST' });
  return { id: concept.id, threadId: bericht.threadId || '' };
}

async function haalBijlage(accessToken, berichtId, bijlageId) {
  const d = await api(accessToken, `/me/messages/${encodeURIComponent(berichtId)}/attachments/${encodeURIComponent(bijlageId)}`, { timeout: 20000 });
  return Buffer.from(String(d.contentBytes || ''), 'base64').toString('base64url');
}

module.exports = {
  naam: 'microsoft', beschikbaar: true, SCOPES, MailFout,
  isConfigured, getAuthUrl, wisselCode, vernieuwToken, profiel, nieuweBerichten, haal, verstuur, haalBijlage,
  watch: async () => null, stopWatch: async () => {}, pushTopic: () => '',
  _test: { adresVan },
};
