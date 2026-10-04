/*
 * Gmail met alleen "versturen" (2026-10-04). gmail.readonly is een "restricted"
 * scope (jaarlijkse CASA-beoordeling), gmail.send een "sensitive" scope. Een dealer
 * die alleen vanuit zijn eigen adres wil mailen, hoeft dus niet te wachten op de
 * zware verificatie. Deze test draait de echte code met een nep-Google en een
 * nep-Airtable en controleert vooral wat er NIET gebeurt: er wordt nooit gelezen.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };
process.env.API_AIRTABLE = 'x'; process.env.BASE_AIRTABLE = 'appTEST0000000000'; process.env.GOOGLE_CLIENT_ID = 'cid'; process.env.GOOGLE_CLIENT_SECRET = 's';
process.env.GOOGLE_REDIRECT_URI = 'https://app.example/api/gcal'; process.env.SESSION_SECRET = 'test-secret';

(async () => {
  console.log('\nGmail: alleen versturen');
  const email = require('../api/_email/index.js');
  const gm = email.PROVIDERS.gmail, gs = email.PROVIDERS['gmail-send'];
  ck('er is een provider "gmail-send"', !!gs && gs.naam === 'gmail-send' && gs.nietLezen === true);
  ck('de gewone Gmail-koppeling blijft zoals ze was (lezen + versturen)', gm.naam === 'gmail' && !gm.nietLezen && /gmail\.readonly/.test(gm.SCOPES) && /gmail\.send/.test(gm.SCOPES));
  const scopes = gs.SCOPES.split(' ');
  ck('alleen openid, email en gmail.send, geen enkel leesrecht', scopes.length === 3 && scopes.includes('openid') && scopes.includes('email') && scopes.includes('https://www.googleapis.com/auth/gmail.send'), scopes);
  ck('geen readonly, modify, compose of metadata', !/readonly|modify|compose|metadata|mail\.google\.com/.test(gs.SCOPES), gs.SCOPES);
  const url = new URL(gs.getAuthUrl('mail.gs.xyz'));
  ck('de toestemmingsaanvraag bevat die scope en niet de leesscope', url.searchParams.get('scope') === gs.SCOPES && !/readonly/.test(url.searchParams.get('scope')) && url.searchParams.get('state') === 'mail.gs.xyz');
  for (const f of ['profiel', 'nieuweBerichten', 'haal', 'haalBijlage']) {
    let code = ''; try { await gs[f]('tok', 'x'); } catch (e) { code = e.code; }
    ck('lezen faalt luid: ' + f, code === 'alleen_versturen', code);
  }

  /* ── Koppelen ── */
  const gcal = require('../api/_gcal.js');
  const aanroepen = []; const patches = [];
  let client = { id: 'recC', fields: { fldN4dL0bGgfBOXwM: 'DEALERA', 'Client Name': 'Garage Test' } };
  global.fetch = async (url, o = {}) => {
    url = String(url); aanroepen.push((o.method || 'GET') + ' ' + url.replace(/\?.*$/, ''));
    if (/gmail\.googleapis\.com/.test(url) && !/messages\/send/.test(url)) throw new Error('er mag niets gelezen worden: ' + url);
    if (/airtable\.com.*tblPidTrwGRzRt4LZ/.test(url) && (o.method || 'GET') === 'GET') return { ok: true, json: async () => ({ records: [client] }), text: async () => '' };
    if (/airtable\.com.*tblPidTrwGRzRt4LZ/.test(url) && o.method === 'PATCH') { const b = JSON.parse(o.body); patches.push(b.fields); Object.assign(client.fields, b.fields); return { ok: true, json: async () => ({}), text: async () => '' }; }
    if (/messages\/send/.test(url)) { aanroepen.push('SEND ' + o.body); return { ok: true, json: async () => ({ id: 'gm1', threadId: 'th1' }) }; }
    return { ok: true, json: async () => ({ records: [] }), text: async () => '' };
  };
  gcal.exchangeCode = async () => ({ refreshToken: 'refresh-1', accessToken: 'acc-1', email: 'Verkoop@Garage.BE', scope: 'openid email https://www.googleapis.com/auth/gmail.send' });
  gcal.getAccessToken = async () => 'acc-nieuw';
  const mb = require('../api/_email/mailbox.js');
  const uit = await mb.verbind('DEALERA', 'code', 'gmail-send');
  ck('koppelen levert het adres uit de aanmelding (kleine letters)', uit.adres === 'verkoop@garage.be', uit);
  ck('provider en adres worden bewaard, het token versleuteld', patches.some((p) => p['Email Provider'] === 'gmail-send' && p['Email Address'] === 'verkoop@garage.be' && /^v1:/.test(p['Email Token'])), patches);
  ck('bij het koppelen is er geen enkele Gmail-leesaanroep', !aanroepen.some((a) => /gmail\.googleapis/.test(a) && !/send/.test(a)), aanroepen);
  const st = await mb.status('DEALERA');
  ck('de status zegt "alleen versturen"', st.verbonden === true && st.alleenVersturen === true && st.adres === 'verkoop@garage.be', st);
  const sy = await mb.sync('DEALERA', { door: 'test' });
  ck('synchroniseren doet niets (geen Gmail-aanroep) maar breekt niet', sy.verbonden === true && !aanroepen.some((a) => /history|messages\?/.test(a)));

  gcal.exchangeCode = async () => ({ refreshToken: 'r', accessToken: 'a', email: 'x@y.be', scope: 'openid email' });
  let code = ''; try { await mb.verbind('DEALERA', 'c', 'gmail-send'); } catch (e) { code = e.code; }
  ck('zonder het vinkje voor versturen: scope_geweigerd', code === 'scope_geweigerd', code);
  gcal.exchangeCode = async () => ({ refreshToken: 'r', accessToken: 'a', email: '', scope: 'openid email https://www.googleapis.com/auth/gmail.send' });
  code = ''; try { await mb.verbind('DEALERA', 'c', 'gmail-send'); } catch (e) { code = e.code; }
  ck('zonder e-mailadres uit Google: geen koppeling', code === 'geen_adres', code);

  /* ── Een mail naar een lead ── */
  const g = require('../api/_gesprekken.js'); const gedaan = [];
  g.vindOfMaak = async (p, o) => { gedaan.push(['gesprek', o]); return { gesprek: { id: 'G1', projectCode: 'DEALERA', kanaal: 'email', thread: o.thread, recordId: 'recG' }, nieuw: true }; };
  g.bestaatBericht = async () => null;
  g.voegToe = async (p, gesprek, b) => { gedaan.push(['voegToe', b]); return { bericht: Object.assign({ recordId: 'recB' }, b), dubbel: false }; };
  g.werkBerichtBij = async (p, b, v) => { gedaan.push(['bij', v]); };
  patches.length = 0; Object.assign(client.fields, { 'Email Provider': 'gmail-send', 'Email Address': 'verkoop@garage.be', 'Email Token': require('../api/_gcal.js').encryptToken('refresh-1'), 'Email Signature': '' });
  aanroepen.length = 0;
  const r = await mb.verstuurNaarLead('DEALERA', { leadId: 'recLEAD00000000A', aan: 'Lead@Klant.BE', onderwerp: 'Uw aanvraag', tekst: 'Hallo, de BMW is nog beschikbaar.', idem: 'k1' });
  ck('de mail is verzonden en het bericht staat op "verzonden"', r.dubbel === false && gedaan.some((x) => x[0] === 'bij' && x[1].status === 'verzonden' && x[1].externId === 'gm1'), gedaan.map((x) => x[0]));
  const raw = (aanroepen.find((a) => a.startsWith('SEND ')) || '');
  const rfc = Buffer.from(JSON.parse(raw.slice(5)).raw, 'base64url').toString('utf8');
  ck('van = het adres van de dealer, aan = de lead', /From: "Garage Test" <verkoop@garage\.be>/.test(rfc) && /To: lead@klant\.be/.test(rfc), rfc.slice(0, 200));
  ck('geen In-Reply-To of References (het is een nieuwe mail)', !/In-Reply-To|References/.test(rfc));
  ck('het onderwerp staat erin en de eigen kop X-Helvaro (lusbewaking)', /Subject: Uw aanvraag/.test(rfc) && /X-Helvaro: 1/.test(rfc));
  ck('er is geen Gmail-leesaanroep gedaan', !aanroepen.some((a) => /gmail\.googleapis/.test(a) && !/send/.test(a)), aanroepen.filter((a) => !a.startsWith('SEND')));
  for (const [naam, inv, verwacht] of [
    ['lege tekst', { aan: 'a@b.be', onderwerp: 's', tekst: ' ', idem: 'k' }, 'leeg'],
    ['geen onderwerp', { aan: 'a@b.be', onderwerp: ' ', tekst: 't', idem: 'k' }, 'geen_onderwerp'],
    ['ongeldig adres', { aan: 'geen-adres', onderwerp: 's', tekst: 't', idem: 'k' }, 'geen_ontvanger'],
    ['meerdere ontvangers', { aan: 'a@b.be, c@d.be', onderwerp: 's', tekst: 't', idem: 'k' }, 'geen_ontvanger'],
    ['geen idempotentiesleutel', { aan: 'a@b.be', onderwerp: 's', tekst: 't' }, 'geen_idem'],
    ['te lang', { aan: 'a@b.be', onderwerp: 's', tekst: 'x'.repeat(10001), idem: 'k' }, 'te_groot'],
  ]) { let c = ''; try { await mb.verstuurNaarLead('DEALERA', inv); } catch (e) { c = e.code; } ck('geweigerd: ' + naam, c === verwacht, c); }
  const kop = await mb.verstuurNaarLead('DEALERA', { leadId: 'recL', aan: 'a@b.be', onderwerp: 'Hallo\r\nBcc: boos@x.be', tekst: 't', idem: 'k2' }).then(() => aanroepen.filter((a) => a.startsWith('SEND ')).pop());
  const rfc2 = Buffer.from(JSON.parse(kop.slice(5)).raw, 'base64url').toString('utf8');
  ck('een regeleinde in het onderwerp kan geen kop injecteren', !/^Bcc:/m.test(rfc2), rfc2.slice(0, 220));
  Object.assign(client.fields, { 'Email Token': '', 'Email Provider': '' });
  let nv = ''; try { await mb.verstuurNaarLead('DEALERA', { leadId: 'recL', aan: 'a@b.be', onderwerp: 's', tekst: 't', idem: 'k3' }); } catch (e) { nv = e.code; }
  ck('zonder gekoppelde mailbox: niet_verbonden', nv === 'niet_verbonden', nv);

  /* ── De server ── */
  const leads = fs.readFileSync(path.join(__dirname, '..', 'api', 'leads.js'), 'utf8');
  ck('callback "mail.gs." staat vóór de gewone "mail."', leads.indexOf("ruweState.startsWith('mail.gs.')") !== -1 && leads.indexOf("ruweState.startsWith('mail.gs.')") < leads.indexOf("ruweState.startsWith('mail.')"));
  ck('email-connect kiest de state-prefix "mail.gs." voor gmail-send', /body\.provider === 'gmail-send' \? 'mail\.gs\.'/.test(leads));
  const blok = leads.slice(leads.indexOf("case 'email-send-lead'"), leads.indexOf("case 'email-attachment'"));
  ck('email-send-lead: lead moet van deze dealer zijn (projectcode uit de sessie)', /!== projectCode\) return res\.status\(404\)/.test(blok));
  ck('en de ontvanger moet het adres van die lead zijn', /leadMail !== String\(body\.to/.test(blok) && /ontvanger_klopt_niet/.test(blok));
  ck('en een afgemelde lead (STOP) krijgt niets', /_optout\.isAfgemeld\(lf\)/.test(blok) && /afgemeld/.test(blok));
  ck('afkoppelen trekt ook de gmail-send-toestemming in bij Google', /p\.naam === 'gmail' \|\| p\.naam === 'gmail-send'/.test(fs.readFileSync(path.join(__dirname, '..', 'api', '_email', 'mailbox.js'), 'utf8')));
  console.log(`\n  ${pass} ok, ${fail} fout\n`); process.exit(fail ? 1 : 0);
})();
