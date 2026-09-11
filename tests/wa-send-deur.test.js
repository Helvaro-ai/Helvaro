/*
 * De enige deur naar WhatsApp: wat er gebeurt als Meta nee zegt.
 *
 * ── Wat er op 9 september gebeurde ──────────────────────────────────────────
 * Elke uitgaande verzending -- intro, eigenaarsmelding, opvolging, handmatig
 * antwoord -- faalde op dezelfde muur:
 *
 *   {"message":"Authentication Error","code":190,"type":"OAuthException"}
 *
 * Code 190 is een verlopen of ongeldig token. De gebruiker zag "Versturen van
 * goedgekeurde template mislukt" -- dezelfde tekst als bij een verkeerd nummer,
 * een gepauzeerd sjabloon of een gesloten venster. Niets aan die tekst zei dat
 * het aan het token lag en dat de BEHEERDER moest ingrijpen.
 *
 * ── Vijf kopieen van dezelfde fetch ─────────────────────────────────────────
 * api/_wa-send.js heette al "de enige deur". Daarnaast stonden er eigen
 * fetches in leads.js (twee), cron-followup.js en whatsapp.js. Drie ervan
 * zonder time-out, geen enkele met nummer-normalisatie, elk met een ander
 * logvoorvoegsel -- de intro uit form.js logde als [appointment-create].
 * Drie zijn nu dunne schillen om de deur; whatsapp.js houdt zijn eigen
 * afkapping (bewust, zie de kop van _wa-send.js) maar deelt versie en
 * foutvertaling.
 *
 * Deze test praat met een NAGEMAAKTE Meta: fetch wordt vervangen. Dat is de
 * enige manier om code 190, 131047 en een time-out te zien zonder een echt
 * nummer aan te raken.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

process.env.WHATSAPP_TOKEN  = 'test-token-nooit-echt';
process.env.PHONE_NUMBER_ID = '100000000000000';
const wa = require('../api/_wa-send.js');

/* De nagemaakte Meta. Elke test zet neer wat hij terug wil krijgen. */
const echteFetch = global.fetch;
let laatsteAanroep = null;
function nepMeta(status, body, opties) {
  global.fetch = async (url, init) => {
    laatsteAanroep = { url: String(url), init, body: JSON.parse(init.body) };
    if (opties && opties.gooi) throw opties.gooi;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}
const herstel = () => { global.fetch = echteFetch; };
const metaFout = (code, message, type) =>
  ({ error: { code, message: message || 'x', type: type || 'OAuthException', fbtrace_id: 'AbC123' } });

console.log('\n— wat Meta terugzegt wordt vertaald, niet doorgegeven —');
{
  const gevallen = [
    [190,    'token_invalid',      true,  'verlopen token'],
    [10,     'permission_denied',  true,  'geen rechten'],
    [133010, 'phone_unregistered', true,  'nummer niet geregistreerd'],
    [132001, 'template_not_found', true,  'sjabloon bestaat niet'],
    [132015, 'template_paused',    true,  'sjabloon gepauzeerd'],
    [132012, 'template_params',    true,  'verkeerd aantal variabelen'],
    [131047, 'window_closed',      false, 'venster dicht'],
    [131026, 'recipient_invalid',  false, 'ontvanger kan niet ontvangen'],
    [130429, 'rate_limit',         false, 'te veel tegelijk'],
    [131056, 'pair_rate_limit',    false, 'te veel naar dit nummer'],
    [999999, 'rejected',           false, 'onbekende code'],
  ];
  for (const [meta, code, eigenaar, naam] of gevallen) {
    const k = wa.classificeer(meta);
    ck(`Meta ${meta} (${naam}) -> ${code}, beheerder=${eigenaar}`,
       k.code === code && k.owner === eigenaar, JSON.stringify(k));
  }
  ck('een vertaalde melding is nooit de ruwe Meta-tekst',
     !/OAuthException|Authentication Error/.test(wa.classificeer(190).msg), wa.classificeer(190).msg);
}

console.log('\n— sendTemplateSafe gooit nooit, en zegt waarom —');
(async () => {
  nepMeta(401, metaFout(190, 'Error validating access token'));
  let r = await wa.sendTemplateSafe({ to: '+32 470 00 00 01', template: 'helvaro_aanvraag_ontvangen', lang: 'nl_BE', params: ['Jan'] });
  ck('verlopen token: ok=false, code=token_invalid', r.ok === false && r.code === 'token_invalid', JSON.stringify(r));
  ck('  ...ownerAction=true', r.ownerAction === true, null);
  ck('  ...metaCode=190 gaat mee', r.metaCode === 190, r.metaCode);
  ck('  ...fbtrace gaat mee (voor Meta-support)', r.fbtrace === 'AbC123', r.fbtrace);
  ck('  ...en de reden is leesbaar', /beheerder|token/i.test(r.reason), r.reason);

  nepMeta(400, metaFout(131047, 'Re-engagement message'));
  r = await wa.sendTemplateSafe({ to: '32470000001', template: 'x', lang: 'nl_BE' });
  ck('gesloten venster: code=window_closed, geen beheerdersactie', r.code === 'window_closed' && r.ownerAction === false, JSON.stringify(r));

  nepMeta(200, { messages: [{ id: 'wamid.HBgL' }] });
  r = await wa.sendTemplateSafe({ to: '32470000001', template: 'helvaro_aanvraag_ontvangen', lang: 'nl_BE', params: ['Jan', 'Mathis', 'Helvaro'] });
  ck('geslaagd: ok=true met messageId', r.ok === true && r.messageId === 'wamid.HBgL', JSON.stringify(r));

  console.log('\n— wat er precies naar Meta gaat —');
  ck('de URL gebruikt de gedeelde Graph-versie',
     laatsteAanroep.url.includes(`/${wa.GRAPH_VERSION}/`), laatsteAanroep.url);
  ck('en dat is niet meer v19',
     !/v19\.0/.test(laatsteAanroep.url) && wa.GRAPH_VERSION !== 'v19.0', wa.GRAPH_VERSION);
  ck('het nummer is genormaliseerd naar alleen cijfers',
     laatsteAanroep.body.to === '32470000001', laatsteAanroep.body.to);
  ck('type=template met naam en taalcode',
     laatsteAanroep.body.type === 'template'
       && laatsteAanroep.body.template.name === 'helvaro_aanvraag_ontvangen'
       && laatsteAanroep.body.template.language.code === 'nl_BE', JSON.stringify(laatsteAanroep.body.template));
  ck('drie variabelen worden drie body-parameters',
     laatsteAanroep.body.template.components[0].parameters.length === 3
       && laatsteAanroep.body.template.components[0].parameters[0].text === 'Jan', null);
  ck('het token staat in de header en niet in de body',
     /^Bearer /.test(laatsteAanroep.init.headers.Authorization) && !JSON.stringify(laatsteAanroep.body).includes('test-token'), null);
  ck('er is een time-out op de aanroep',
     laatsteAanroep.init.signal instanceof AbortSignal, null);

  nepMeta(200, { messages: [{ id: 'wamid.X' }] });
  await wa.sendTemplateSafe({ to: '32470000001', template: 't', lang: 'nl_BE', token: 'per-klant-token' });
  ck('een meegegeven token wint van de env-var',
     laatsteAanroep.init.headers.Authorization === 'Bearer per-klant-token', laatsteAanroep.init.headers.Authorization);

  console.log('\n— wat geweigerd wordt VOORDAT er iets naar Meta gaat —');
  let aangeroepen = false;
  global.fetch = async () => { aangeroepen = true; return { ok: true, status: 200, json: async () => ({}) }; };

  r = await wa.sendTemplateSafe({ to: '32470000001', template: 't', optedOut: true });
  ck('afgemelde lead: geweigerd, Meta nooit aangeroepen', r.code === 'opted_out' && !aangeroepen, JSON.stringify(r));

  r = await wa.sendFreeformSafe({ to: '32470000001', text: 'hoi', windowOpen: false });
  ck('vrij bericht buiten het venster: geweigerd, Meta nooit aangeroepen', r.code === 'window_closed' && !aangeroepen, JSON.stringify(r));

  r = await wa.sendTemplateSafe({ to: '12', template: 't' });
  ck('te kort nummer: geweigerd, Meta nooit aangeroepen', r.code === 'invalid_phone' && !aangeroepen, JSON.stringify(r));

  r = await wa.sendFreeformSafe({ to: '32470000001', text: '   ', windowOpen: true });
  ck('leeg bericht: geweigerd', r.code === 'empty' && !aangeroepen, JSON.stringify(r));

  r = await wa.sendFreeformSafe({ to: '32470000001', text: 'x'.repeat(5000), windowOpen: true });
  ck('te lang bericht: geweigerd in plaats van stil afgekapt', r.code === 'too_long' && !aangeroepen, JSON.stringify(r));

  console.log('\n— netwerk en time-out —');
  nepMeta(0, null, { gooi: Object.assign(new Error('fetch failed'), { name: 'TypeError' }) });
  r = await wa.sendTemplateSafe({ to: '32470000001', template: 't' });
  ck('netwerkfout: code=network, gooit niet', r.ok === false && r.code === 'network', JSON.stringify(r));

  nepMeta(0, null, { gooi: Object.assign(new Error('aborted'), { name: 'TimeoutError' }) });
  r = await wa.sendTemplateSafe({ to: '32470000001', template: 't' });
  ck('time-out: code=timeout -- apart, want dan weet je NIET of Meta het kreeg',
     r.ok === false && r.code === 'timeout', JSON.stringify(r));

  herstel();

  console.log('\n— de kopieen zijn schillen om de deur geworden —');
  {
    const lees = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const code = (p) => lees(p).replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').filter((r) => !/^\s*\/\//.test(r)).join('\n');
    const leads = code('api/leads.js'), cron = code('api/cron-followup.js');

    ck('leads.js: sendWATemplate delegeert', /sendWATemplate[\s\S]{0,700}_waSend\.sendTemplateSafe/.test(leads), null);
    ck('cron-followup.js: sendWATemplate delegeert', /sendWATemplate[\s\S]{0,700}_waSend\.sendTemplateSafe/.test(cron), null);
    ck('de handmatige reply gebruikt de deur voor het sjabloon', /const tplR = await _waSend\.sendTemplateSafe/.test(leads), null);
    ck('en voor het vrije bericht', /const vrijR = await _waSend\.sendFreeformSafe/.test(leads), null);
    ck('en het testbericht ook', /const testR = await _waSend\.sendFreeformSafe/.test(leads), null);

    /* De regressie: de enige losse /messages-fetch buiten de deur mag die van
       whatsapp.js zijn (eigen afkapping, bewust). Komt er ergens een nieuwe
       bij, dan valt dit om. */
    const losse = [];
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'api')).filter((n) => n.endsWith('.js'))) {
      const s = code('api/' + f);
      const n = (s.match(/graph\.facebook\.com\/[^`'"]*\/messages`/g) || []).length;
      if (n && f !== '_wa-send.js' && f !== 'whatsapp.js') losse.push(`${f} (${n})`);
    }
    ck('geen losse /messages-aanroep buiten _wa-send.js en whatsapp.js', losse.length === 0, losse.join(', '));

    ck('de handmatige reply geeft de reden en de code door aan het scherm',
       /error: tplR\.reason, code: tplR\.code[\s\S]{0,60}ownerAction: tplR\.ownerAction/.test(leads), null);
    ck('...met 503 als de beheerder moet ingrijpen',
       /tplR\.ownerAction \? 503 : 502/.test(leads), null);
    ck('een dubbel bericht binnen een minuut krijgt 409 en gaat niet naar Meta',
       /duplicate_send/.test(leads) && leads.indexOf('duplicate_send') < leads.indexOf('const tplR = await _waSend'), null);
    ck('geen enkel bestand gebruikt nog Graph v19',
       !fs.readdirSync(path.join(__dirname, '..', 'api')).some((n) => n.endsWith('.js') && /v19\.0/.test(code('api/' + n))), null);
  }

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
