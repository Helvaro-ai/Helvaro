/*
 * STOP betekent STOP — op elke verzendroute.
 *
 * ── Wat er misging ──────────────────────────────────────────────────────────
 * Er zijn vier plekken die WhatsApp versturen. Drie keken of de lead zich had
 * afgemeld; de vierde niet:
 *
 *   api/cron-followup.js   -> _optout.isAfgemeld() vóór het versturen   ✓
 *   api/_wa-send.js        -> weigerBijAfmelding() ingebouwd            ✓
 *   api/whatsapp.js        -> vangt STOP binnenkomend af                ✓
 *   api/leads.js (manual)  -> GEEN controle                             ✗
 *
 * Vanuit het dashboard kon een operator dus alsnog iemand aanschrijven die
 * STOP had getypt: buiten het 24u-venster met een sjabloon, erbinnen met een
 * vrij bericht. Allebei.
 *
 * ── Waarom dit meer is dan één vervelende lead ──────────────────────────────
 * Het WhatsApp-nummer is gedeeld tussen alle klanten. Een klacht bij Meta over
 * dit nummer raakt iedereen die erop zit, en een blokkade legt ze allemaal
 * tegelijk stil. De kosten van deze fout landen dus niet bij de klant die hem
 * maakt.
 */
'use strict';

const fs   = require('fs');
const BASE = require('path').join(__dirname, '..') + '/';
const leads  = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
const cron   = fs.readFileSync(BASE + 'api/cron-followup.js', 'utf8');
const waSend = fs.readFileSync(BASE + 'api/_wa-send.js', 'utf8');
const optout = require(BASE + 'api/_optout.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(got).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

console.log('\nSTOP betekent STOP, op elke route');

console.log('\n  de handmatige antwoordroute controleert het nu ook');
{
  ck('leads.js kent _optout', /require\('\.\/_optout'\)/.test(leads), null);
  ck('en weigert een afgemelde lead', /_optout\.isAfgemeld\(lead\.fields\)/.test(leads), null);
  ck('met een 409 en een uitleg, geen stille no-op',
    /isAfgemeld\(lead\.fields\)\) \{[\s\S]{0,260}?status\(409\)[\s\S]{0,200}?afgemeld/.test(leads), null);

  /* Het gevaarlijkste detail: de controle moet VOOR beide verzendpaden staan.
     Buiten het venster gaat er een sjabloon uit, erbinnen een vrij bericht.
     Staat de controle tussen die twee in, dan is de helft nog steeds lek. */
  const iCheck = leads.indexOf('_optout.isAfgemeld(lead.fields)');
  const iTpl   = leads.indexOf('const tplSent = await sendWATemplate(phone');
  /* Let op WELKE freeform-send je pakt: er zijn er twee met identieke code.
     De eerste hoort bij mode 'test-message' -- de operator die een testbericht
     naar zijn EIGEN nummer stuurt, geen lead, dus daar geldt afmelding niet.
     De tweede is de handmatige reply. indexOf() vond de verkeerde en maakte
     deze test rood terwijl de code klopte. */
  const iVrij  = leads.lastIndexOf("type: 'text', text: { body: message }");
  ck('de controle staat vóór het sjabloonpad', iCheck !== -1 && iCheck < iTpl, { iCheck, iTpl });
  ck('en vóór het vrije-berichtpad van de handmatige reply', iCheck !== -1 && iCheck < iVrij, { iCheck, iVrij });
  /* De testbericht-route hoort er NIET achter te zitten: dat is de operator
     die zijn eigen nummer test. Positief vastleggen, zodat een latere ronde
     hem niet 'voor de consistentie' ook dichtzet. */
  ck('de testbericht-route blijft ongemoeid (eigen nummer, geen lead)',
    leads.indexOf("type: 'text', text: { body: message }") < iCheck, null);
}

console.log('\n  de andere routes blijven het ook doen');
{
  ck('cron-followup kijkt ernaar', /_optout\.isAfgemeld\(lead\.fields\)/.test(cron), null);
  ck('_wa-send heeft het ingebouwd',
    /weigerBijAfmelding\(optedOut, 'template'\)/.test(waSend)
    && /weigerBijAfmelding\(optedOut, 'freeform'\)|weigerBijAfmelding\(optedOut,/.test(waSend), null);
}

console.log('\n  en de herkenning zelf klopt');
{
  ck('een aangevinkte afmelding telt', optout.isAfgemeld({ 'Opted Out': true }) === true, null);
  ck('geen veld is niet afgemeld', optout.isAfgemeld({}) === false, null);
  ck('een leeg record laat het niet omvallen', optout.isAfgemeld(null) === false, null);
  /* Wie STOP typt moet herkend worden, ook met rommel eromheen. */
  ck('"STOP" wordt herkend', optout.isAfmelding('STOP') === true, null);
  ck('"stop maar" ook', optout.isAfmelding('stop maar') === true, null);
  ck('gewone tekst niet', optout.isAfmelding('ik wil graag een afspraak') === false, null);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
