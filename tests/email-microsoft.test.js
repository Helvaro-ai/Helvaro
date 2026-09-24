/*
 * api/_email/microsoft.js via de gedeelde mailbox-pijplijn: koppelen (inbox
 * leegdrinken), delta-sync, zelfde classificatie/lead/thread als Gmail,
 * antwoorden via createReply, bijlagen. Microsoft Graph is nep.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-geheim-voor-versleuteling';
process.env.MS_CLIENT_ID = 'ms-id'; process.env.MS_CLIENT_SECRET = 'ms-secret'; process.env.MS_REDIRECT_URI = 'https://app.example/api/gcal';

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const ms = require(BASE + 'api/_email/microsoft.js');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`); ok ? pass++ : fail++; };

const G = 'https://graph.microsoft.com/v1.0';
let inbox = [{ id: 'oud1' }, { id: 'oud2' }];
let nieuw = [];
const berichten = {};
const verstuurd = [];
const bericht = (id, van, onderwerp, tekst, extra = {}) => Object.assign({
  id, conversationId: 'CONV-' + id, internetMessageId: `<${id}@outlook.example>`, subject: onderwerp,
  from: { emailAddress: { name: van.split('@')[0], address: van } }, toRecipients: [{ emailAddress: { address: 'verkoop@garage.example' } }],
  receivedDateTime: new Date().toISOString(), body: { contentType: 'text', content: tekst }, internetMessageHeaders: [], hasAttachments: false,
}, extra);

(async () => {
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'customers', 'conversations', 'messages', 'activity'], async (url, opts = {}) => {
    const u = String(url);
    const j = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('login.microsoftonline.com') && u.endsWith('/token')) return j({ access_token: 'MSAT', refresh_token: 'MSRT' });
    if (u === G + '/me?$select=mail,userPrincipalName') return j({ mail: 'Verkoop@Garage.example' });
    if (u === G + '/me/mailFolders/inbox/messages/delta?$deltatoken=D1') { const v = nieuw.map((m) => ({ id: m.id })); nieuw = []; return j({ value: v, '@odata.deltaLink': G + '/me/mailFolders/inbox/messages/delta?$deltatoken=D1' }); }
    if (u.startsWith(G + '/me/mailFolders/inbox/messages/delta')) return j({ value: inbox.map((m) => ({ id: m.id })), '@odata.deltaLink': G + '/me/mailFolders/inbox/messages/delta?$deltatoken=D1' });
    let m = u.match(/\/me\/messages\/([^/?]+)\/attachments\/([^/?]+)$/);
    if (m) return j({ contentBytes: Buffer.from('BIJLAGE ' + m[2]).toString('base64') });
    m = u.match(/\/me\/messages\/([^/?]+)\/attachments\?/);
    if (m) return j({ value: [{ id: 'AT1', name: 'offerte.pdf', contentType: 'application/pdf', size: 1024, '@odata.type': '#microsoft.graph.fileAttachment' }] });
    m = u.match(/\/me\/messages\/([^/?]+)\/createReply$/);
    if (m) { verstuurd.push({ stap: 'createReply', op: m[1], body: JSON.parse(opts.body || '{}') }); return j({ id: 'CONCEPT-' + m[1] }); }
    m = u.match(/\/me\/messages\/(CONCEPT-[^/?]+)\/send$/);
    if (m) { verstuurd.push({ stap: 'send', id: m[1] }); return { ok: true, status: 202, json: async () => ({}), text: async () => '' }; }
    m = u.match(/\/me\/messages\/(CONCEPT-[^/?]+)$/);
    if (m && opts.method === 'PATCH') { verstuurd.push({ stap: 'patch', body: JSON.parse(opts.body) }); return j({}); }
    m = u.match(/\/me\/messages\/([^/?]+)\?\$select=/);
    if (m) return j(berichten[decodeURIComponent(m[1])]);
    return j({});
  });
  db.tblPidTrwGRzRt4LZ.push({ id: 'recC', fields: { fldN4dL0bGgfBOXwM: 'P1', 'Client Name': 'Garage' } });
  const mailbox = require(BASE + 'api/_email/mailbox.js');

  console.log('\nkoppelen');
  const auth = mailbox.authUrl('microsoft', 'mail.ms.x');
  ck('autorisatie-URL bij Microsoft met Mail.Send en offline_access', /login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/authorize/.test(auth) && /Mail\.Send/.test(decodeURIComponent(auth)) && /offline_access/.test(decodeURIComponent(auth)));
  await mailbox.verbind('P1', 'CODE', 'microsoft');
  const cfg = db.tblPidTrwGRzRt4LZ[0].fields;
  ck('provider microsoft, adres, token versleuteld', cfg['Email Provider'] === 'microsoft' && cfg['Email Address'] === 'verkoop@garage.example' && /^v1:/.test(cfg['Email Token']));
  ck('bestaande inbox leeggedronken (deltaLink bewaard, niets geïmporteerd)', /deltatoken=D1/.test(JSON.parse(cfg['Email State']).historyId) && db.messages.length === 0);

  console.log('\nsynchroniseren');
  berichten.n1 = bericht('n1', 'jan@example.be', 'BMW X5', 'Is de BMW X5 nog beschikbaar? Proefrit?', { hasAttachments: true });
  berichten.n2 = bericht('n2', 'news@brand.example', 'Nieuws', 'Nieuwe modellen', { internetMessageHeaders: [{ name: 'List-Unsubscribe', value: '<mailto:x>' }] });
  nieuw = [{ id: 'n1' }, { id: 'n2' }];
  const st = await mailbox.sync('P1', {});
  ck('1 klantmail, 1 nieuwsbrief overgeslagen', st.tellers.ontvangen === 1 && st.tellers.overgeslagen === 1, st.tellers);
  const g = db.conversations.find((c) => c.fields['External Thread ID'] === 'microsoft:CONV-n1');
  ck('gesprek per Outlook-conversatie, met microsoft-prefix', Boolean(g));
  ck('lead aangemaakt voor de koper', db.tbliukTnDAbEDcZmt.length === 1);
  const inMsg = db.messages.find((m) => m.fields['External ID'] === 'n1');
  ck('bijlage-metadata bewaard', JSON.parse(inMsg.fields.Meta).bijlagen[0].naam === 'offerte.pdf');

  console.log('\nantwoorden en bijlagen');
  const uit = await mailbox.verstuurAntwoord('P1', g.fields['Conversation ID'], { tekst: 'Dag Jan, ja hoor.', idem: 'k1', door: 'Sarah' });
  ck('createReply op het juiste bericht, dan tekst, dan send', verstuurd.map((v) => v.stap).join(',') === 'createReply,patch,send' && verstuurd[0].op === 'n1', verstuurd);
  ck('X-Helvaro-kop meegegeven bij aanmaken', JSON.stringify(verstuurd[0].body).includes('X-Helvaro'));
  ck('tekst in het antwoord', verstuurd[1].body.body.content === 'Dag Jan, ja hoor.');
  ck('bericht als verzonden bewaard', !uit.dubbel && db.messages.some((m) => m.fields['Message Key'] === 'uit:k1' && m.fields.Status === 'verzonden'));
  const b = await mailbox.bijlage('P1', g.fields['Conversation ID'], 'n1', 'AT1');
  ck('bijlage opgehaald uit Graph', Buffer.from(b.data, 'base64').toString() === 'BIJLAGE AT1' && b.naam === 'offerte.pdf');

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
