/*
 * E-mail als kanaal: Gmail-parsing, veilig versturen, classificatie en
 * lusbewaking, de inkomende pijplijn (dedup, thread, klant, lead) en
 * idempotent versturen. Google en Airtable zijn nep; er gaat niets het net op.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-geheim-voor-versleuteling';

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const gmail = require(BASE + 'api/_email/gmail.js');
const email = require(BASE + 'api/_email/index.js');
const _gcal = require(BASE + 'api/_gcal.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`);
  ok ? pass++ : fail++;
};
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const gmailBericht = ({ id, threadId = 'T1', from, subject, tekst, html, koppen = {}, labelIds = ['INBOX'], messageId }) => ({
  id, threadId, labelIds, internalDate: String(Date.now()),
  payload: {
    mimeType: 'multipart/alternative',
    headers: [
      { name: 'From', value: from }, { name: 'To', value: 'verkoop@garage.example' },
      { name: 'Subject', value: subject }, { name: 'Message-ID', value: messageId || `<${id}@mail.example>` },
      ...Object.entries(koppen).map(([name, value]) => ({ name, value })),
    ],
    parts: [
      tekst != null ? { mimeType: 'text/plain', body: { data: b64(tekst) } } : null,
      html != null ? { mimeType: 'text/html', body: { data: b64(html) } } : null,
    ].filter(Boolean),
  },
});

(async () => {
  console.log('\ngmail: lezen');
  const P = gmail._test;
  let m = P.parseBericht(gmailBericht({ id: 'm1', from: '"Jan Peeters" <Jan@Example.be>', subject: '=?utf-8?B?' + Buffer.from('Vraag over de Škoda').toString('base64') + '?=',
    tekst: 'Is de Škoda nog beschikbaar?\n\nOp ma 21 sep 2026 schreef Garage:\n> Beste Jan' }));
  ck('afzenderadres genormaliseerd', m.vanAdres === 'jan@example.be');
  ck('onderwerp RFC2047 gedecodeerd', m.onderwerp === 'Vraag over de Škoda', m.onderwerp);
  ck('citaat eraf', m.tekst === 'Is de Škoda nog beschikbaar?', m.tekst);
  m = P.parseBericht(gmailBericht({ id: 'm2', from: 'a@b.be', subject: 'x', html: '<p>Hallo<br>wereld</p><script>alert(1)</script>' }));
  ck('alleen html -> leesbare tekst zonder script', m.tekst === 'Hallo\nwereld', m.tekst);

  console.log('\ngmail: versturen');
  const raw = P.bouwRfc822({ van: 'verkoop@garage.example', aan: 'jan@example.be', onderwerp: 'Re: prijs\r\nBcc: aanvaller@evil.example', tekst: 'Dag Jan', antwoordOp: '<m1@mail.example>', referenties: '<m0@mail.example>' });
  ck('geen kop-injectie via onderwerp', !/\r\nBcc:/i.test(raw), raw.slice(0, 200));
  ck('threading-koppen gezet', /In-Reply-To: <m1@mail\.example>/.test(raw) && /References: <m0@mail\.example> <m1@mail\.example>/.test(raw));
  ck('X-Helvaro-kop voor lusherkenning', /X-Helvaro: 1/.test(raw));
  ck('niet-ASCII onderwerp gecodeerd', /Subject: =\?UTF-8\?B\?/.test(P.bouwRfc822({ van: 'a@b.be', aan: 'c@d.be', onderwerp: 'Één vraag', tekst: 'x' })));

  console.log('\nclassificatie en lusbewaking');
  const koop = { vanAdres: 'jan@example.be', onderwerp: 'BMW X5', tekst: 'Is de wagen nog beschikbaar? Ik wil een proefrit.', koppen: {} };
  let a = email.analyseer(koop, { eigenAdres: 'verkoop@garage.example' });
  ck('koopintentie = lead + mag antwoorden', a.classificatie === 'lead' && a.maaktLead && a.magAutoAntwoord, a);
  a = email.analyseer(Object.assign({}, koop, { koppen: { listUnsubscribe: '<mailto:x>' } }), {});
  ck('nieuwsbrief = geen lead, geen antwoord', a.classificatie === 'nieuwsbrief' && !a.maaktLead && !a.magAutoAntwoord);
  a = email.analyseer(Object.assign({}, koop, { koppen: { autoSubmitted: 'auto-replied' } }), {});
  ck('Auto-Submitted = automatisch, nooit antwoorden', a.classificatie === 'automatisch' && !a.magAutoAntwoord);
  a = email.analyseer(Object.assign({}, koop, { onderwerp: 'Out of office: BMW X5' }), {});
  ck('afwezigheidsmelding herkend', a.classificatie === 'automatisch');
  a = email.analyseer(Object.assign({}, koop, { koppen: { xHelvaro: '1' } }), {});
  ck('eigen teruggekaatst bericht = lus, geen antwoord', !a.magAutoAntwoord);
  a = email.analyseer(Object.assign({}, koop, { vanAdres: 'noreply@leasing.example' }), {});
  ck('no-reply-afzender = automatisch', a.classificatie === 'automatisch');
  a = email.analyseer(Object.assign({}, koop, { onderwerp: 'Factuur 2026-118' }), {});
  ck('factuur = geen lead', a.classificatie === 'factuur' && !a.maaktLead);
  a = email.analyseer(Object.assign({}, koop, { vanAdres: 'verkoop@garage.example' }), { eigenAdres: 'verkoop@garage.example' });
  ck('eigen adres = eigen', a.classificatie === 'eigen');
  a = email.analyseer(koop, { aiAntwoordenRecent: 3 });
  ck('3 AI-antwoorden in 24u = stop met automatisch antwoorden', a.maaktLead && !a.magAutoAntwoord && /lusbewaking/.test(a.reden));
  a = email.analyseer(koop, { laatsteUitgaandMs: 30 * 1000 });
  ck('antwoord 30 s na ons bericht = geen automatisch antwoord', !a.magAutoAntwoord);
  a = email.analyseer({ vanAdres: 'x@y.be', onderwerp: 'Hallo', tekst: 'Wat zijn jullie openingsuren?', koppen: {} }, {});
  ck('geen koopintentie = overig, geen lead', a.classificatie === 'overig' && !a.maaktLead && !a.magAutoAntwoord);
  a = email.analyseer({ vanAdres: 'x@y.be', onderwerp: 'Re: afspraak', tekst: 'Prima, tot dan.', koppen: {} }, { bekendeKlant: true });
  ck('bekende klant = klant, geen nieuwe lead', a.classificatie === 'klant' && !a.maaktLead);
  ck('Microsoft zegt eerlijk dat hij er niet is', email.provider('microsoft').beschikbaar === false);

  console.log('\ninkomende pijplijn');
  const verstuurd = [];
  let gmailBerichten = {};
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'customers', 'conversations', 'messages', 'activity'], async (url, opts = {}) => {
    const u = String(url);
    const j = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('oauth2.googleapis.com/token')) return j({ access_token: 'AT' });
    if (u.includes('/messages/send')) { const b = JSON.parse(opts.body); verstuurd.push(b); return j({ id: 'S' + verstuurd.length, threadId: b.threadId }); }
    if (u.includes('/history?')) return j({ history: [{ messagesAdded: Object.keys(gmailBerichten).map((id) => ({ message: { id } })) }], historyId: '200' });
    const mm = u.match(/\/messages\/([^/?]+)\?format=full/);
    if (mm) return j(gmailBerichten[decodeURIComponent(mm[1])]);
    return j({});
  });
  process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'cs'; process.env.GOOGLE_REDIRECT_URI = 'https://app.example/api/gcal';
  db.tblPidTrwGRzRt4LZ.push({ id: 'recCLIENT', fields: {
    fldN4dL0bGgfBOXwM: 'P1', 'Client Name': 'Garage Test', 'Email Provider': 'gmail', 'Email Address': 'verkoop@garage.example',
    'Email Token': _gcal.encryptToken('REFRESH'), 'Email State': JSON.stringify({ historyId: '100' }), 'Email Auto Reply': false,
  } });
  const mailbox = require(BASE + 'api/_email/mailbox.js');
  gmailBerichten = {
    g1: gmailBericht({ id: 'g1', threadId: 'T1', from: 'Jan <jan@example.be>', subject: 'BMW X5', tekst: 'Is de X5 nog beschikbaar? Proefrit zaterdag?' }),
    g2: gmailBericht({ id: 'g2', threadId: 'T2', from: 'News <news@brand.example>', subject: 'Nieuwe modellen', tekst: 'Bekijk onze nieuwe auto', koppen: { 'List-Unsubscribe': '<mailto:u@brand.example>' } }),
  };
  let st = await mailbox.sync('P1', {});
  ck('sync ok, 1 ontvangen, 1 overgeslagen', st.laatsteResultaat === 'ok' && st.tellers.ontvangen === 1 && st.tellers.overgeslagen === 1, st);
  ck('lead aangemaakt voor de koper, niet voor de nieuwsbrief', db.tbliukTnDAbEDcZmt.length === 1 && db.tbliukTnDAbEDcZmt[0].fields.Email === 'jan@example.be');
  ck('klant herkend op e-mail', db.customers.some((c) => c.fields.Email === 'jan@example.be'));
  ck('historyId opgeschoven', JSON.parse(db.tblPidTrwGRzRt4LZ[0].fields['Email State']).historyId === '200');
  ck('auto-antwoord UIT = niets verstuurd', verstuurd.length === 0);
  st = await mailbox.sync('P1', {});
  ck('tweede sync: zelfde berichten = dubbel, niets nieuws', st.tellers.dubbel === 2 && db.messages.length === 2 && db.tbliukTnDAbEDcZmt.length === 1, st.tellers);

  gmailBerichten = { g3: gmailBericht({ id: 'g3', threadId: 'T1', from: 'Jan <jan@example.be>', subject: 'Re: BMW X5', tekst: 'En wat is de prijs?' }) };
  await mailbox.sync('P1', {});
  const gesprekkenT1 = db.conversations.filter((c) => c.fields['External Thread ID'] === 'gmail:T1');
  ck('zelfde Gmail-thread = zelfde gesprek', gesprekkenT1.length === 1);
  ck('tweede mail in thread maakt geen tweede lead', db.tbliukTnDAbEDcZmt.length === 1);

  console.log('\nversturen (idempotent)');
  const gid = gesprekkenT1[0].fields['Conversation ID'];
  let uit = await mailbox.verstuurAntwoord('P1', gid, { tekst: 'Dag Jan, de X5 kost ...', idem: 'klik-1', door: 'Sarah' });
  ck('verstuurd in de juiste thread', verstuurd.length === 1 && verstuurd[0].threadId === 'T1' && !uit.dubbel);
  const rawUit = Buffer.from(verstuurd[0].raw, 'base64url').toString('utf8');
  ck('antwoord op de laatste klantmail (In-Reply-To)', /In-Reply-To: <g3@mail\.example>/.test(rawUit));
  uit = await mailbox.verstuurAntwoord('P1', gid, { tekst: 'Dag Jan, de X5 kost ...', idem: 'klik-1', door: 'Sarah' });
  ck('dubbelklik (zelfde sleutel) = één mail', uit.dubbel && verstuurd.length === 1);
  const g = db.conversations.find((c) => c.fields['Conversation ID'] === gid);
  ck('zelf antwoorden = gesprek overgenomen', g.fields.Control === 'HUMAN_TAKEOVER' && g.fields['Control By'] === 'Sarah');
  let fout = null;
  try { await mailbox.verstuurAntwoord('P2', gid, { tekst: 'x', idem: 'k2' }); } catch (e) { fout = e.code; }
  ck('gesprek van andere dealer = niet gevonden (of geen account)', fout === 'not_found' || fout === 'geen_klantrecord', fout);

  console.log('\nconcept uit instructie');
  const _ai = require(BASE + 'api/_ai');
  const echtGen = _ai.generateText;
  let gezienePrompt = null;
  _ai.generateText = async (opts) => { gezienePrompt = opts; return { text: 'Dag Jan,\n\nZaterdag om 10u past perfect. Tot dan!' }; };
  const c = await mailbox.concept('P1', gid, { instructie: 'zeg dat zaterdag 10u kan' });
  ck('concept is een volledige mail', /Zaterdag om 10u/.test(c.tekst) && /^Re:/.test(c.onderwerp), c);
  ck('instructie staat apart en wordt als instructie gemarkeerd', /INSTRUCTIE VAN DE VERKOPER:\nzeg dat zaterdag 10u kan/.test(gezienePrompt.messages[0].content));
  ck('systeemprompt verbiedt het citeren van de instructie', /citeer ze nooit/.test(gezienePrompt.system));
  ck('instructie NIET als bericht opgeslagen', !db.messages.some((mm) => /zeg dat zaterdag/.test(mm.fields.Body || '')));
  console.log('\nvoertuig in de mail + automatisch antwoord met eindcontrole');
  const _autoscout = require(BASE + 'api/_autoscout.js');
  const _veh = require(BASE + 'api/_vehicles.js');
  const echtHerken = _autoscout.herken, echtGet = _veh.getByCode, echtLees = _veh.leesVers;
  const auto = { code: 'V7', merk: 'BMW', model: 'X5', status: 'beschikbaar', prijs: 54950, km: 61000, gearchiveerd: false };
  let versStatus = 'beschikbaar';
  _autoscout.herken = async () => ({ voertuig: auto, via: 'merk' });
  _veh.getByCode = async () => Object.assign({}, auto);
  _veh.leesVers = async () => ({ gelezen: true, voertuig: Object.assign({}, auto, { status: versStatus }) });
  _ai.generateText = async () => ({ text: 'Dag Piet, de BMW X5 is beschikbaar voor € 54.950.' });
  db.tblPidTrwGRzRt4LZ[0].fields['Email Auto Reply'] = true;
  const voorVerstuurd = verstuurd.length;
  gmailBerichten = { g4: gmailBericht({ id: 'g4', threadId: 'T4', from: 'Piet <piet@example.be>', subject: 'BMW X5', tekst: 'Is de BMW X5 nog beschikbaar?' }) };
  await mailbox.sync('P1', {});
  const g4 = db.conversations.find((c) => c.fields['External Thread ID'] === 'gmail:T4');
  ck('wagen herkend en aan het gesprek gehangen', g4 && g4.fields['Vehicle Code'] === 'V7', g4 && g4.fields);
  ck('beschikbaar: automatisch antwoord verstuurd', verstuurd.length === voorVerstuurd + 1);
  versStatus = 'verkocht';
  const voor2 = verstuurd.length;
  gmailBerichten = { g5: gmailBericht({ id: 'g5', threadId: 'T5', from: 'Kris <kris@example.be>', subject: 'BMW X5 prijs', tekst: 'Wat kost de BMW X5?' }) };
  await mailbox.sync('P1', {});
  ck('verkocht vlak voor verzenden: GEEN automatisch antwoord', verstuurd.length === voor2);
  _autoscout.herken = echtHerken; _veh.getByCode = echtGet; _veh.leesVers = echtLees;
  _ai.generateText = echtGen;

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
