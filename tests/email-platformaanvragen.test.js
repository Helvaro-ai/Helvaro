'use strict';
/*
 * Aanvragen van autoplatformen per e-mail (AutoScout24, 2dehands, Marktplaats,
 * mobile.de) worden een lead die aan de juiste wagen hangt.
 *
 * Alle mails hieronder zijn zelf geschreven (koper@example.com); de echte
 * opmaak van de platformmails is NIET geverifieerd (zie api/_email/platformlead.js).
 * Google en Airtable zijn nep; er gaat niets het net op. De voorraad is een
 * stub per dealer, zodat tenantisolatie meetbaar is: elke zoekopdracht naar een
 * wagen wordt met zijn projectcode opgeslagen.
 */
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'test-token';
process.env.BASE_AIRTABLE = 'appTEST';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-geheim-voor-versleuteling';
process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 'cs'; process.env.GOOGLE_REDIRECT_URI = 'https://app.example/api/gcal';

const { maakNepAirtable } = require('./fixtures/nep-airtable');
const gmail = require(BASE + 'api/_email/gmail.js');
const pl = require(BASE + 'api/_email/platformlead.js');
const _gcal = require(BASE + 'api/_gcal.js');
const _vehicles = require(BASE + 'api/_vehicles.js');
const _listings = require(BASE + 'api/_listings.js');
const _ai = require(BASE + 'api/_ai');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 260)}`);
  ok ? pass++ : fail++;
};
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const gmailBericht = ({ id, threadId, from, replyTo, subject, tekst, html, koppen = {} }) => ({
  id, threadId: threadId || 'T' + id, labelIds: ['INBOX'], internalDate: String(Date.now()),
  payload: {
    mimeType: 'multipart/alternative',
    headers: [
      { name: 'From', value: from }, { name: 'To', value: 'verkoop@garage.example' },
      { name: 'Subject', value: subject || 'Nieuwe aanvraag' }, { name: 'Message-ID', value: `<${id}@mail.example>` },
      ...(replyTo ? [{ name: 'Reply-To', value: replyTo }] : []),
      ...Object.entries(koppen).map(([name, value]) => ({ name, value })),
    ],
    parts: [
      tekst != null ? { mimeType: 'text/plain', body: { data: b64(tekst) } } : null,
      html != null ? { mimeType: 'text/html', body: { data: b64(html) } } : null,
    ].filter(Boolean),
  },
});

const UUID = '1a2b3c4d-1111-2222-3333-444455556666';
const AS24_LINK = `https://www.autoscout24.be/nl/aanbod/bmw-x5-xdrive30d-${UUID}`;

(async () => {
  /* ═════════════ Zuivere functies ═════════════ */
  console.log('\nplatform uit het afzenderadres');
  const p = (a) => { const x = pl.platformVanAdres(a); return x && x.bron; };
  ck('no-reply@mail.autoscout24.be = AutoScout24', p('no-reply@mail.autoscout24.be') === 'AutoScout24');
  ck('autoscout24.de en .nl ook', p('x@autoscout24.de') === 'AutoScout24' && p('x@e.autoscout24.nl') === 'AutoScout24');
  ck('2dehands.be en 2ememain.be', p('info@2dehands.be') === '2dehands' && p('info@mail.2ememain.be') === '2ememain');
  ck('marktplaats.nl en mobile.de', p('a@email.marktplaats.nl') === 'Marktplaats' && p('a@mobile.de') === 'mobile.de');
  ck('een lookalike is geen platform (autoscout24.evil.example)', p('x@autoscout24.evil.example') === null);
  ck('een ander domein dat het woord bevat is geen platform (notautoscout24.be)', p('x@notautoscout24.be') === null && p('x@autoscout24-tips.be') === null && p('x@mijn-marktplaats.nl') === null);
  ck('de naam in het adres telt niet (autoscout24@gmail.com)', p('autoscout24@gmail.com') === null);
  ck('geen adres', p('') === null && p('geenadres') === null);

  console.log('\ncontact: alleen wat er letterlijk staat');
  let c = pl.contactUit({ tekst: 'Naam: Jan Peeters\nE-mail: koper@example.com\nTelefoon: +32 478 12 34 56\nBericht: Is de X5 nog beschikbaar?\nGraag bellen.' }, 'verkoop@garage.example');
  ck('naam, mail, telefoon en bericht uit hun labels', c.naam === 'Jan Peeters' && c.email === 'koper@example.com' && c.telefoon === '+32 478 12 34 56' && c.bericht === 'Is de X5 nog beschikbaar?\nGraag bellen.', c);
  c = pl.contactUit({ antwoordAan: '"Jan" <abc123@reply.marktplaats.nl>', tekst: 'Hallo, is hij nog te koop?' }, '');
  ck('Reply-To (ook een relay-adres van het platform) is het antwoordadres', c.email === 'abc123@reply.marktplaats.nl' && c.naam === '' && c.telefoon === '' && c.bericht === 'Hallo, is hij nog te koop?', c);
  c = pl.contactUit({ antwoordAan: 'noreply@autoscout24.be', tekst: 'E-mail: koper@example.com' }, '');
  ck('een no-reply als Reply-To is geen koper: de E-mail-regel wint', c.email === 'koper@example.com', c);
  c = pl.contactUit({ tekst: 'Mijn vriend jan@example.com weet er meer van. Groet, Piet' }, '');
  ck('een willekeurig adres in de tekst wordt NIET overgenomen', c.email === '' && c.naam === '', c);
  c = pl.contactUit({ tekst: 'Piet hier. Bel me op 0478 12 34 56, of mail naar piet@example.com' }, '');
  ck('telefoon en naam alleen uit een duidelijke regel, niet uit een zin', c.telefoon === '' && c.naam === '' && c.email === '', c);
  c = pl.contactUit({ tekst: 'Name: koper@example.com\nTel: 123' }, '');
  ck('"Naam" met een adres erin, en een te kort nummer: niets', c.naam === '' && c.telefoon === '', c);
  c = pl.contactUit({ antwoordAan: 'verkoop@garage.example', tekst: 'x' }, 'verkoop@garage.example');
  ck('het adres van de dealer zelf is nooit de koper', c.email === '', c);
  c = pl.contactUit({ tekst: 'Nom : Marie Dupont\nTéléphone : 0478/12.34.56' }, '');
  ck('Nom: en Téléphone: (Frans)', c.naam === 'Marie Dupont' && c.telefoon === '0478/12.34.56', c);

  console.log('\nlinks');
  ck('kaal(): www, query, hash en slash vallen weg', pl.kaal('https://www.2dehands.be/a/auto-s/bmw/m1-x5.html/?utm=1#x') === '2dehands.be/a/auto-s/bmw/m1-x5.html');
  const lijst = pl.linksVan({ onderwerp: '', tekst: 'Zie https://www.marktplaats.nl/a/x.html.', links: ['https://click.example/track?u=' + encodeURIComponent(AS24_LINK) + '&x=1', 'mailto:a@b.be'] });
  ck('links uit tekst en html, plus de bestemming achter een tracking-doorverwijzing', lijst.includes('https://www.marktplaats.nl/a/x.html') && lijst.includes(AS24_LINK) && !lijst.some((l) => /^mailto/.test(l)), lijst);

  console.log('\nherken(): wanneer is het een platformaanvraag');
  const mk = (o) => Object.assign({ vanAdres: 'no-reply@mail.autoscout24.be', onderwerp: 'Aanvraag', tekst: '', koppen: {} }, o);
  ck('platform + antwoordadres = ja', !!pl.herken(mk({ antwoordAan: 'koper@example.com' })));
  ck('platform + Naam-regel zonder adres = ja (lead, maar niet te beantwoorden)', !!pl.herken(mk({ tekst: 'Naam: Jan Peeters' })));
  ck('platform zonder enig klantsignaal = nee (nieuwsbrief/melding blijft gewone mail)', pl.herken(mk({ tekst: 'Uw advertentie verloopt binnenkort. https://www.autoscout24.be/' })) === null);
  ck('geen platform = nee, ook niet met een link naar het platform', pl.herken(mk({ vanAdres: 'koper@example.com', antwoordAan: 'koper@example.com', tekst: AS24_LINK })) === null);

  /* ═════════════ De volledige pijplijn ═════════════ */
  const verstuurd = [];
  let gmailBerichten = {};
  let gmailGelezen = 0;
  const { db } = maakNepAirtable(['tblPidTrwGRzRt4LZ', 'tbliukTnDAbEDcZmt', 'customers', 'conversations', 'messages', 'activity'], async (url, opts = {}) => {
    const u = String(url);
    const j = (o, s = 200) => ({ ok: s < 300, status: s, json: async () => o, text: async () => JSON.stringify(o) });
    if (u.includes('oauth2.googleapis.com/token')) return j({ access_token: 'AT' });
    if (u.includes('gmail.googleapis.com') && !u.includes('/messages/send')) gmailGelezen++;
    if (u.includes('/messages/send')) { const b = JSON.parse(opts.body); verstuurd.push(b); return j({ id: 'S' + verstuurd.length, threadId: b.threadId }); }
    if (u.includes('/history?')) return j({ history: [{ messagesAdded: Object.keys(gmailBerichten).map((id) => ({ message: { id } })) }], historyId: '900' });
    const mm = u.match(/\/messages\/([^/?]+)\?format=full/);
    if (mm) return j(gmailBerichten[decodeURIComponent(mm[1])]);
    return j({});
  });
  const clientRij = (code, extra) => ({ id: 'rec' + code, fields: Object.assign({
    fldN4dL0bGgfBOXwM: code, 'Client Name': 'Garage ' + code, 'Email Provider': 'gmail', 'Email Address': code.toLowerCase() + '@garage.example',
    'Email Token': _gcal.encryptToken('REFRESH'), 'Email State': JSON.stringify({ historyId: '100' }), 'Email Auto Reply': false,
  }, extra || {}) });
  db.tblPidTrwGRzRt4LZ.push(clientRij('P1'), clientRij('P2'));
  const mailbox = require(BASE + 'api/_email/mailbox.js');

  /* De voorraad is een stub per dealer; elke vraag wordt met zijn dealer bewaard. */
  const voorraad = {
    P1: [
      { code: 'V7', projectCode: 'P1', merk: 'BMW', model: 'X5', autoscout: UUID, link: AS24_LINK, gearchiveerd: false },
      { code: 'V8', projectCode: 'P1', merk: 'BMW', model: 'X3', autoscout: '', link: '', gearchiveerd: false },
      { code: 'V9', projectCode: 'P1', merk: 'Audi', model: 'A4', autoscout: '', link: 'https://www.mobile.de/nl/voertuig/audi-a4-9999.html', gearchiveerd: false },
    ],
    P2: [{ code: 'V1', projectCode: 'P2', merk: 'BMW', model: 'X5', autoscout: '99999999-aaaa-bbbb-cccc-dddddddddddd', link: '', gearchiveerd: false }],
  };
  const advertenties = {
    P1: [{ provider: 'tweedehands', externalId: 'm1234', url: 'https://www.2dehands.be/a/auto-s/bmw/m1234-bmw-x3.html', vehicleCode: 'V8', status: 'ACTIVE', projectCode: 'P1' }],
    P2: [],
  };
  const vragen = [];
  const echt = { available: _vehicles.available, getByAutoscout: _vehicles.getByAutoscout, getByCode: _vehicles.getByCode, list: _vehicles.list, listings: _listings.list, gen: _ai.generateText };
  _vehicles.available = async () => true;
  _vehicles.getByAutoscout = async (t, id) => { vragen.push(t); return (voorraad[t] || []).find((v) => v.autoscout && v.autoscout === id) || null; };
  _vehicles.getByCode = async (t, code) => { vragen.push(t); return (voorraad[t] || []).find((v) => v.code === code) || null; };
  _vehicles.list = async (t) => { vragen.push(t); return (voorraad[t] || []).slice(); };
  _listings.list = async (t) => { vragen.push(t); return { listings: (advertenties[t] || []).slice(), afgekapt: false, beschikbaar: true }; };
  _ai.generateText = async () => ({ text: 'Dag, bedankt voor uw aanvraag. Een verkoper neemt contact op.' });

  const sync = async (code, berichten) => { gmailBerichten = berichten; return mailbox.sync(code, {}); };
  const leadVan = (code) => db.tbliukTnDAbEDcZmt.filter((l) => l.fields.fldSmczuyUJd26HLe === code);
  const blobVan = (l) => JSON.parse(l.fields.fldoLRI5W12ThTls7 || '{}');
  const gesprekVan = (thread) => db.conversations.find((g) => g.fields['External Thread ID'] === 'gmail:' + thread);

  console.log('\nAutoScout24: link naar een wagen van deze dealer');
  await sync('P1', { a1: gmailBericht({
    id: 'a1', threadId: 'TA1', from: 'AutoScout24 <no-reply@mail.autoscout24.be>', replyTo: 'Jan Peeters <koper@example.com>', subject: 'Nieuwe aanvraag voor uw BMW X5',
    tekst: 'Naam: Jan Peeters\nE-mail: koper@example.com\nTelefoon: +32 478 12 34 56\nBericht: Is de X5 nog beschikbaar?',
    html: `<p>Nieuwe aanvraag</p><a href="https://click.autoscout24.be/t?u=${encodeURIComponent(AS24_LINK + '?utm=mail')}">Bekijk advertentie</a>`,
  }) });
  let leads = leadVan('P1');
  ck('precies één lead', leads.length === 1, leads.length);
  let l = leads[0], f = l.fields;
  ck('Bron = AutoScout24', f.fldGoerozqdea4BfU === 'AutoScout24', f);
  ck('naam uit de Naam-regel, mail uit Reply-To', f.fldbk0LVNckOU0bqA === 'Jan Peeters' && f.Email === 'koper@example.com' && f.Channels === 'email', f);
  ck('wagen V7 op de lead (property in de blob)', blobVan(l).property === 'V7', blobVan(l));
  ck('Listing Provider/ID = autoscout24 + het aanbodnummer', f['Listing Provider'] === 'autoscout24' && f['Listing ID'] === UUID, f);
  ck('het telefoonnummer staat NIET in het telefoonveld (de opvolgcron zou WhatsAppen)', f.fld6YaitW0lMqHUrd === undefined, f);
  ck('het nummer staat wel in de notitie', blobVan(l).notes.some((n) => /\+32 478 12 34 56/.test(n.text)), blobVan(l).notes);
  ck('geen toestemming verzonnen', blobVan(l).consent.given === false && blobVan(l).consent.via === 'inbound_email');
  ck('laatste bericht = de vraag', f['Last Message'] === 'Is de X5 nog beschikbaar?', f['Last Message']);
  let g = gesprekVan('TA1');
  ck('gesprek hangt aan wagen V7 en aan de lead', g && g.fields['Vehicle Code'] === 'V7' && g.fields['Lead ID'] === l.id, g && g.fields);
  const bericht = db.messages.find((mm) => mm.fields['Conversation ID'] === g.fields['Conversation ID']);
  ck('"van" op het bericht is de koper, niet het no-reply (Beantwoorden gaat naar hem)', /koper@example\.com/.test(bericht.fields.From) && !/no-reply/.test(bericht.fields.From), bericht.fields.From);
  ck('de klant is op het echte adres herkend (niet op het no-reply)', db.customers.length === 1 && db.customers[0].fields.Email === 'koper@example.com', db.customers.map((x) => x.fields));
  ck('zonder instelling "automatisch antwoorden" gaat er niets uit', verstuurd.length === 0);

  console.log('\n2dehands: link = advertentie-URL in vehicle_listings');
  await sync('P1', { b1: gmailBericht({
    id: 'b1', threadId: 'TB1', from: '2dehands <info@e.2dehands.be>', replyTo: 'abc123@reply.2dehands.be', subject: 'Reactie op uw advertentie',
    tekst: 'Iemand reageerde op uw advertentie.\nhttps://www.2dehands.be/a/auto-s/bmw/m1234-bmw-x3.html?src=mail\nBericht: Is de wagen nog te koop?',
  }) });
  leads = leadVan('P1');
  ck('tweede lead', leads.length === 2);
  l = leads.find((x) => x.fields.fldGoerozqdea4BfU === '2dehands'); f = l && l.fields;
  ck('Bron = 2dehands, relay-adres als mail', f && f.Email === 'abc123@reply.2dehands.be', f);
  ck('wagen V8 via de advertentie-URL', blobVan(l).property === 'V8', blobVan(l));
  ck('Listing Provider tweedehands, Listing ID m1234', f['Listing Provider'] === 'tweedehands' && f['Listing ID'] === 'm1234', f);
  ck('naam onbekend = leeg, niet verzonnen', f.fldbk0LVNckOU0bqA === '', f.fldbk0LVNckOU0bqA);

  console.log('\nListing URL van de wagen (zonder advertentierij)');
  await sync('P1', { b2: gmailBericht({
    id: 'b2', threadId: 'TB2', from: 'mobile.de <noreply@mobile.de>', replyTo: 'kees@example.com', subject: 'Anfrage',
    tekst: 'Naam: Kees\nBericht: Is de A4 noch verfügbar?\nhttps://www.mobile.de/nl/voertuig/audi-a4-9999.html?ref=mail',
  }) });
  l = leadVan('P1').find((x) => x.fields.fldGoerozqdea4BfU === 'mobile.de');
  ck('Bron = mobile.de, wagen V9 via het Listing URL, provider mobile_de', l && blobVan(l).property === 'V9' && l.fields['Listing Provider'] === 'mobile_de', l && l.fields);

  console.log('\ngeen passende link: lead zonder wagen (nooit gokken)');
  await sync('P1', { c1: gmailBericht({
    id: 'c1', threadId: 'TC1', from: 'Marktplaats <noreply@email.marktplaats.nl>', replyTo: 'xyz@reply.marktplaats.nl', subject: 'Bericht over BMW X5',
    tekst: 'Een bezoeker vraagt naar uw BMW X5 xDrive30d.\nhttps://www.marktplaats.nl/a/auto-s/bmw/m777-onbekend.html',
  }) });
  l = leadVan('P1').find((x) => x.fields.fldGoerozqdea4BfU === 'Marktplaats'); f = l && l.fields;
  ck('wel een lead van Marktplaats', !!l, leadVan('P1').map((x) => x.fields.fldGoerozqdea4BfU));
  ck('maar geen wagen, ook al staat er een BMW X5 in de voorraad en in de tekst', l && !blobVan(l).property && f['Listing Provider'] === undefined && gesprekVan('TC1').fields['Vehicle Code'] === '', { b: l && blobVan(l), g: gesprekVan('TC1').fields });

  console.log('\nlinks naar twee verschillende wagens: niet raden');
  await sync('P1', { c2: gmailBericht({
    id: 'c2', threadId: 'TC2', from: 'AutoScout24 <no-reply@autoscout24.be>', replyTo: 'twee@example.com',
    tekst: `Naam: Twee Wagens\n${AS24_LINK}\nhttps://www.2dehands.be/a/auto-s/bmw/m1234-bmw-x3.html`,
  }) });
  l = leadVan('P1').find((x) => x.fields.Email === 'twee@example.com');
  ck('lead zonder wagen', l && !blobVan(l).property && gesprekVan('TC2').fields['Vehicle Code'] === '', l && blobVan(l));

  console.log('\nniet van een platform = gewone mail');
  const voorLeads = leadVan('P1').length;
  await sync('P1', {
    d1: gmailBericht({ id: 'd1', threadId: 'TD1', from: 'Piet <piet@example.com>', replyTo: 'piet@example.com', subject: 'BMW X5 prijs', tekst: `Wat is de prijs van deze wagen?\n${AS24_LINK}` }),
    d2: gmailBericht({ id: 'd2', threadId: 'TD2', from: 'AutoScout24 <no-reply@autoscout24.evil.example>', replyTo: 'nep@example.com', subject: 'Aanvraag', tekst: `Naam: Nep Platform\nprijs?\n${AS24_LINK}` }),
    d3: gmailBericht({ id: 'd3', threadId: 'TD3', from: 'x <info@notautoscout24.be>', replyTo: 'nep2@example.com', subject: 'Aanvraag', tekst: `Naam: Nep Twee\nprijs?\n${AS24_LINK}` }),
  });
  const nieuweLeads = leadVan('P1').slice(voorLeads);
  ck('de gewone mail met een koopvraag wordt een lead zoals vroeger (Bron E-mail)', nieuweLeads.some((x) => x.fields.Email === 'piet@example.com' && x.fields.fldGoerozqdea4BfU === 'E-mail'), nieuweLeads.map((x) => x.fields));
  ck('een lookalike-domein is gewone mail (no-reply = automatisch, geen lead)', !nieuweLeads.some((x) => ['nep@example.com', 'nep2@example.com'].includes(x.fields.Email)), nieuweLeads.map((x) => x.fields.Email));
  ck('geen enkele lead van die gewone mails heeft een platform als Bron', nieuweLeads.every((x) => x.fields.fldGoerozqdea4BfU === 'E-mail'));

  console.log('\nplatformpost zonder klant: geen lead');
  const voor2 = leadVan('P1').length;
  await sync('P1', {
    e1: gmailBericht({ id: 'e1', threadId: 'TE1', from: 'AutoScout24 <nieuws@autoscout24.be>', subject: 'Uw advertentie verloopt', tekst: `Uw advertentie verloopt binnenkort. ${AS24_LINK}`, koppen: { 'List-Unsubscribe': '<mailto:u@autoscout24.be>' } }),
    e2: gmailBericht({ id: 'e2', threadId: 'TE2', from: 'AutoScout24 <no-reply@autoscout24.be>', replyTo: 'auto@example.com', subject: 'Afwezig', tekst: 'Naam: Machine', koppen: { 'Auto-Submitted': 'auto-replied' } }),
  });
  ck('een melding/nieuwsbrief en een automatisch antwoord maken geen lead', leadVan('P1').length === voor2, leadVan('P1').slice(voor2).map((x) => x.fields));

  console.log('\ntenantisolatie');
  ck('elke zoekopdracht naar een wagen ging met de projectcode van de mailbox (P1)', vragen.length > 0 && vragen.every((t) => t === 'P1'), Array.from(new Set(vragen)));
  voorraad.P1 = [];   // P1 heeft de wagen niet meer; P2 wel een BMW X5 met een ander id
  voorraad.P2.push({ code: 'V2', projectCode: 'P2', merk: 'BMW', model: 'X5', autoscout: UUID, link: AS24_LINK, gearchiveerd: false });
  db.tbliukTnDAbEDcZmt.push({ id: 'recP2LEAD', fields: { fldSmczuyUJd26HLe: 'P2', fld8mkrEWcyq7mUip: 'new', fldbk0LVNckOU0bqA: 'Andere dealer', Email: 'gedeeld@example.com', fldoLRI5W12ThTls7: JSON.stringify({ _v: 1, notes: [] }) } });
  const vragenVoor = vragen.length;
  await sync('P1', { f1: gmailBericht({ id: 'f1', threadId: 'TF1', from: 'AutoScout24 <no-reply@autoscout24.be>', replyTo: 'gedeeld@example.com', tekst: `Naam: Gedeelde Koper\nprijs?\n${AS24_LINK}` }) });
  l = leadVan('P1').find((x) => x.fields.Email === 'gedeeld@example.com');
  ck('de wagen van dealer P2 (zelfde AutoScout24-id) wordt NIET aan een lead van P1 gehangen', l && !blobVan(l).property && gesprekVan('TF1').fields['Vehicle Code'] === '', l && blobVan(l));
  ck('de open lead van dezelfde persoon bij P2 is niet bijgewerkt en er is een eigen lead bij P1', blobVan(db.tbliukTnDAbEDcZmt.find((x) => x.id === 'recP2LEAD')).notes.length === 0 && !!l);
  ck('ook nu alleen P1-zoekopdrachten', vragen.slice(vragenVoor).every((t) => t === 'P1') && vragen.length > vragenVoor, vragen.slice(vragenVoor));
  voorraad.P1 = [
    { code: 'V7', projectCode: 'P1', merk: 'BMW', model: 'X5', autoscout: UUID, link: AS24_LINK, gearchiveerd: false },
  ];

  console.log('\neen open lead per persoon');
  const voor3 = leadVan('P1').length;
  await sync('P1', { h1: gmailBericht({
    id: 'h1', threadId: 'TH1', from: 'AutoScout24 <no-reply@mail.autoscout24.be>', replyTo: 'koper@example.com', subject: 'Nieuwe aanvraag',
    tekst: `Naam: Jan Peeters\nBericht: Kan ik zaterdag langskomen?\n${AS24_LINK}`,
  }) });
  ck('zelfde persoon, nog een open lead: GEEN tweede lead', leadVan('P1').length === voor3, leadVan('P1').length);
  const eerste = leadVan('P1').find((x) => x.fields.Email === 'koper@example.com');
  ck('de bestaande lead kreeg een notitie met de nieuwe vraag', blobVan(eerste).notes.length === 2 && /zaterdag/.test(blobVan(eerste).notes[0].text), blobVan(eerste).notes);
  ck('consent en wagen bleven staan', blobVan(eerste).consent.via === 'inbound_email' && blobVan(eerste).property === 'V7');
  ck('het gesprek hangt aan die lead', gesprekVan('TH1').fields['Lead ID'] === eerste.id);
  /* gesloten lead telt niet */
  eerste.fields.fld8mkrEWcyq7mUip = 'completed';
  await sync('P1', { h2: gmailBericht({ id: 'h2', threadId: 'TH2', from: 'AutoScout24 <no-reply@mail.autoscout24.be>', replyTo: 'koper@example.com', tekst: `Naam: Jan Peeters\nBericht: Ik wil toch nog een proefrit.\n${AS24_LINK}` }) });
  ck('een GESLOTEN lead telt niet: dan een nieuwe lead', leadVan('P1').length === voor3 + 1 && leadVan('P1').filter((x) => x.fields.Email === 'koper@example.com').length === 2);

  console.log('\nafgemeld (opt-out)');
  db.tbliukTnDAbEDcZmt.push({ id: 'recSTOP', fields: { fldSmczuyUJd26HLe: 'P1', fld8mkrEWcyq7mUip: 'completed', fldbk0LVNckOU0bqA: 'Stop Koper', Email: 'stop@example.com', 'Opted Out': true, fldoLRI5W12ThTls7: JSON.stringify({ _v: 1, notes: [] }) } });
  db.tblPidTrwGRzRt4LZ.find((r) => r.fields.fldN4dL0bGgfBOXwM === 'P1').fields['Email Auto Reply'] = true;
  const voor4 = leadVan('P1').length, verstuurdVoor = verstuurd.length;
  await sync('P1', { s1: gmailBericht({ id: 's1', threadId: 'TS1', from: 'AutoScout24 <no-reply@autoscout24.be>', replyTo: 'stop@example.com', tekst: `Naam: Stop Koper\nBericht: prijs?\n${AS24_LINK}` }) });
  ck('afgemeld: geen nieuwe lead', leadVan('P1').length === voor4, leadVan('P1').length);
  ck('afgemeld: geen notitie op zijn lead', blobVan(db.tbliukTnDAbEDcZmt.find((x) => x.id === 'recSTOP')).notes.length === 0);
  ck('afgemeld: geen automatisch antwoord, ook met de instelling AAN', verstuurd.length === verstuurdVoor, verstuurd.length);
  ck('het bericht zelf staat wel in Gesprekken', !!gesprekVan('TS1'));

  console.log('\nautomatisch antwoord: alleen als de dealer het aanzette');
  const verstuurdVoor2 = verstuurd.length;
  await sync('P1', { r1: gmailBericht({ id: 'r1', threadId: 'TR1', from: 'AutoScout24 <no-reply@autoscout24.be>', replyTo: 'nieuw@example.com', tekst: `Naam: Nieuwe Koper\nBericht: prijs?\n${AS24_LINK}` }) });
  ck('instelling AAN: er gaat een antwoord uit', verstuurd.length === verstuurdVoor2 + 1, verstuurd.length);
  const raw = verstuurd.length ? Buffer.from(verstuurd[verstuurd.length - 1].raw, 'base64url').toString('utf8') : '';
  ck('en het gaat naar de koper, niet naar het no-reply van het platform', /^To: nieuw@example\.com/m.test(raw) && !/no-reply/.test(raw), raw.slice(0, 200));
  const verstuurdVoor3 = verstuurd.length;
  await sync('P1', { r2: gmailBericht({ id: 'r2', threadId: 'TR2', from: 'AutoScout24 <no-reply@autoscout24.be>', tekst: `Naam: Zonder Adres\nBericht: prijs?\n${AS24_LINK}` }) });
  const zonder = leadVan('P1').find((x) => x.fields.fldbk0LVNckOU0bqA === 'Zonder Adres');
  ck('zonder antwoordadres staat het no-reply van het platform nergens als e-mail van de lead', zonder && zonder.fields.Email === undefined && blobVan(zonder).email === undefined && !JSON.stringify(zonder.fields).includes('no-reply'), zonder && zonder.fields);
  ck('zonder antwoordadres: wel een lead, GEEN automatisch antwoord', !!zonder && verstuurd.length === verstuurdVoor3, { lead: !!zonder, verstuurd: verstuurd.length });
  let code = '';
  try { await mailbox.verstuurAntwoord('P1', gesprekVan('TR2').fields['Conversation ID'], { tekst: 'Dag', idem: 'k-1' }); } catch (e) { code = e.code; }
  ck('en handmatig beantwoorden kan niet naar het no-reply (geen_ontvanger)', code === 'geen_ontvanger' && verstuurd.length === verstuurdVoor3, code);
  db.tblPidTrwGRzRt4LZ.find((r) => r.fields.fldN4dL0bGgfBOXwM === 'P1').fields['Email Auto Reply'] = false;

  console.log('\nGmail "alleen versturen": er wordt niets gelezen');
  const rijP2 = db.tblPidTrwGRzRt4LZ.find((r) => r.fields.fldN4dL0bGgfBOXwM === 'P2');
  rijP2.fields['Email Provider'] = 'gmail-send';
  const leesVoor = gmailGelezen, voor5 = leadVan('P2').length;
  const st = await sync('P2', { z1: gmailBericht({ id: 'z1', threadId: 'TZ1', from: 'AutoScout24 <no-reply@autoscout24.be>', replyTo: 'z@example.com', tekst: `Naam: Z\nprijs?\n${AS24_LINK}` }) });
  ck('geen enkele Gmail-leesaanroep', gmailGelezen === leesVoor, gmailGelezen - leesVoor);
  ck('geen lead, geen gesprek', leadVan('P2').length === voor5 && !gesprekVan('TZ1'), leadVan('P2').length);
  ck('de status zegt alleen versturen', st.alleenVersturen === true);

  console.log('\nbrongegevens van Gmail');
  const geparsed = gmail._test.parseBericht(gmailBericht({ id: 'x1', from: 'a@autoscout24.be', replyTo: 'Jan <jan@example.com>, ander@example.com', tekst: 'x', html: '<a href="https://a.example/x?a=1&amp;b=2">x</a><a href=\'https://b.example/\'>y</a><a href="mailto:z@z.be">z</a>' }));
  ck('Reply-To wordt gelezen (eerste adres)', geparsed.antwoordAan === 'jan@example.com', geparsed.antwoordAan);
  ck('hrefs uit de html blijven bewaard (htmlNaarTekst gooit ze weg)', geparsed.links.length === 2 && geparsed.links[0] === 'https://a.example/x?a=1&b=2' && geparsed.links[1] === 'https://b.example/', geparsed.links);
  ck('zonder Reply-To: leeg', gmail._test.parseBericht(gmailBericht({ id: 'x2', from: 'a@b.be', tekst: 'x' })).antwoordAan === '');

  _vehicles.available = echt.available; _vehicles.getByAutoscout = echt.getByAutoscout; _vehicles.getByCode = echt.getByCode; _vehicles.list = echt.list;
  _listings.list = echt.listings; _ai.generateText = echt.gen;
  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
