'use strict';
/*
 * De bevestiging na het versturen van het leadformulier ("wat gebeurt er nu").
 * Geen netwerk: Airtable en het voertuig zijn nep. De browsergedrag-kant
 * (tracker, dubbelklik, foutherstel) is apart met een echte browser gemeten;
 * hier staat wat zonder browser te bewaken valt.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
process.env.API_AIRTABLE = 'x'; process.env.BASE_AIRTABLE = 'appX';

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  -> ' + String(JSON.stringify(got)).slice(0, 300)}`); ok ? pass++ : fail++; };

let CLIENT = {};
global.fetch = async (url) => {
  const j = (d) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) });
  return String(url).includes('tblPidTrwGRzRt4LZ') ? j({ records: [{ id: 'r', fields: CLIENT }] }) : j({ records: [] });
};
const V = require(BASE + '/api/_vehicles');
let VEH = null;
V.getByCode = async () => VEH;
const page = require(BASE + '/api/form-page.js');
const B = require(BASE + '/api/_form-bevestiging.js');

const basis = { 'Client Name': 'Garage Test', 'AI Name': 'Mathis', Language: 'nl', Vertical: 'dealership' };
const auto = { code: 'V1', publiek: true, gearchiveerd: false, status: 'beschikbaar', merk: 'BMW', model: 'M4', prijs: 5000, fotos: [] };
async function render(client, veh, url) {
  CLIENT = Object.assign({}, basis, client); VEH = veh;
  let html = '';
  await page({ method: 'GET', url: url || (veh ? '/start/GARAGE/V1' : '/start/GARAGE'), query: {}, headers: {} },
    { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, end(b) { if (b) html = String(b); }, json() {} });
  return html;
}

(async () => {
  console.log('\nbepaal(): kanaal en stappen volgen de server');
  {
    const wa = B.bepaal({ success: true, kanaal: 'whatsapp', status: 'verzonden' }, {});
    ck('whatsapp + verzonden -> whatsapp', wa.kanaal === 'whatsapp' && wa.stap3 === 'whatsapp');
    ck('whatsapp + niet_verzonden belooft GEEN whatsapp', B.bepaal({ success: true, kanaal: 'whatsapp', status: 'niet_verzonden' }, { phone: true }).kanaal === 'neutraal');
    ck('whatsapp + mislukt belooft GEEN whatsapp', B.bepaal({ success: true, kanaal: 'whatsapp', status: 'mislukt' }, {}).kanaal === 'neutraal');
    ck('kanaal email -> email', B.bepaal({ success: true, kanaal: 'email', status: 'niet_verzonden' }, {}).stap3 === 'email');
    ck('kanaal geen -> neutraal', B.bepaal({ success: true, kanaal: 'geen', status: 'niet_verzonden' }, {}).stap3 === 'neutraal');
    ck('bestaand wint van kanaal', B.bepaal({ success: true, bestaand: true, kanaal: 'whatsapp', status: 'niet_verzonden' }, {}).stap3 === 'bestaand');
    ck('oudere server: met nummer whatsapp, alleen mail -> email, niets -> neutraal',
      B.bepaal({ success: true }, { phone: true }).kanaal === 'whatsapp' && B.bepaal({ success: true }, { email: true }).kanaal === 'email' && B.bepaal({ success: true }, {}).kanaal === 'neutraal');
    ck('alleen stap 1 is afgerond, altijd', [wa, B.bepaal({ success: true, bestaand: true }, {}), B.bepaal({ success: true, kanaal: 'email' }, {})].every((x) => x.stappen.join() === 'true,false,false,false'));
    ck('zonder success:true is er niets ontvangen', B.bepaal({ kanaal: 'whatsapp', status: 'verzonden' }, {}).ontvangen === false);
    ck('flow: voertuig als er een auto is, anders algemeen, type kan sturen',
      B.kiesFlow(true, '') === 'voertuig' && B.kiesFlow(false, '') === 'algemeen' && B.kiesFlow(false, 'proefrit') === 'voertuig' && B.kiesFlow(true, 'terugbel') === 'algemeen');
  }

  console.log('\nveilige URL en telefoon');
  {
    ck('https blijft, kaal domein krijgt https', B.veiligeUrl('https://a.be/x') === 'https://a.be/x' && B.veiligeUrl('www.garage.be') === 'https://www.garage.be/');
    ck('javascript:, data:, inloggegevens, spaties en onzin vallen weg', ['javascript:alert(1)', 'data:text/html,x', 'https://u:p@a.be', 'a b.be', 'localhost', '', null].every((x) => B.veiligeUrl(x) === ''));
    ck('foto alleen https', B.veiligeFoto('http://a.be/x.jpg') === '' && B.veiligeFoto('https://a.be/x.jpg') !== '');
    const regio = require(BASE + '/api/_regio').standaard();
    const e = require(BASE + '/api/_regio').naarE164;
    const t = B.dealerTel('0478 12 34 56', regio, e);
    ck('echt nummer -> tel:-link', t && /^tel:\+\d{8,15}$/.test(t.href), t);
    ck('onzin of leeg -> geen knop', B.dealerTel('abc', regio, e) === null && B.dealerTel('', regio, e) === null);
  }

  console.log('\nde gerenderde pagina');
  {
    const html = await render({ Website: 'www.garage.be', 'Public Phone': '0478 12 34 56' }, Object.assign({}, auto, { link: 'https://garage.be/bmw', fotos: ['https://img.test/a.jpg'] }));
    ck('exact een stap is afgerond in de markup', (html.match(/class="bev-stap is-klaar"/g) || []).length === 1 && (html.match(/class="bev-stap is-open"/g) || []).length === 3);
    ck('elke stap heeft een statuswoord en een icoon, geen kleur alleen', (html.match(/class="bev-stap-status"/g) || []).length === 4 && />Afgerond</.test(html) && (html.match(/In afwachting</g) || []).length === 3);
    ck('semantische lijst, live region, kop focusbaar', /<ol class="bev-stappen" role="list"/.test(html) && /id="ok-live" role="status" aria-live="polite"/.test(html) && /<h2 class="bev-titel" id="ok-kop" tabindex="-1">/.test(html));
    ck('paneel is verborgen tot succes', /<section class="bev" id="ok" aria-labelledby="ok-kop" hidden>/.test(html));
    ck('reduced motion is gerespecteerd', /prefers-reduced-motion: reduce[\s\S]{0,80}\.bev \{ animation: none/.test(html));
    ck('autokaart met echte data', /bev-auto-titel">BMW M4</.test(html) && /€ 5\.000/.test(html) && /class="bev-auto-foto" src="https:\/\/img.test\/a.jpg"/.test(html));
    ck('drie knoppen met echte doelen', /data-cta="voertuig" href="https:\/\/garage.be\/bmw"/.test(html) && /data-cta="bel" href="tel:\+32478123456"/.test(html) && /data-cta="website" href="https:\/\/www.garage.be\/"/.test(html));
    ck('honeypot en toestemming blijven', /id="hp-url"[^>]*name="hv_veld_leeg"/.test(html) && /id="consent"/.test(html) && /if \(consent && !consent.checked\)/.test(html));
    ck('"Powered by Helvaro" blijft', /Powered by <a href="https:\/\/helvaro.pro"/.test(html));

    const kaal = await render({ Phone: '0499 99 99 99' }, Object.assign({}, auto, { link: '', fotos: [] }));
    ck('zonder gegevens GEEN knoppen (ook niet met het privé-Phone-veld)', !/id="ok-acties"/.test(kaal) && !/href="tel:/.test(kaal) && !/data-cta=/.test(kaal));
    ck('zonder foto geen kapotte afbeelding', !/<img class="bev-auto-foto"/.test(kaal));
    const zonderAuto = await render({}, null);
    ck('zonder voertuig geen autokaart', !/id="ok-auto"/.test(zonderAuto) && /var HEEFT_VOERTUIG = false/.test(zonderAuto));
    const verkocht = await render({}, Object.assign({}, auto, { status: 'verkocht' }));
    ck('verkocht voertuig: algemene flow, geen prijs maar de status', /var HEEFT_VOERTUIG = false/.test(verkocht) && />verkocht</.test(verkocht));
    const kwaad = await render({ 'Client Name': '</script><img src=x onerror=alert(1)>', Website: 'javascript:alert(1)' }, null);
    ck('dealernaam breekt het script niet uit; javascript:-site wordt geen knop', !/<\/script><img/.test(kwaad) && !/javascript:alert/.test(kwaad.replace(/<script>[\s\S]*<\/script>/, '')));
  }

  console.log('\ni18n en uitgestuurde script');
  {
    const sleutels = Object.keys(B.TEKST.nl);
    for (const taal of ['nl', 'fr', 'en', 'de']) {
      const T = B.TEKST[taal];
      ck(taal + ': alle sleutels, geen lege tekst', sleutels.every((k) => typeof T[k] === 'string' && T[k].length > 0) && Object.keys(T).length === sleutels.length, sleutels.filter((k) => !T[k]));
      const html = await render({ Language: taal }, auto);
      ck(taal + ': pagina draagt zijn eigen taal in het script', html.includes('<html lang="' + taal + '">') && html.includes(JSON.stringify(T.okMinimaal).replace(/</g, '\\u003c').slice(1, 12)));
    }
    const html = await render({}, auto);
    const js = html.slice(html.indexOf('<script>'));
    ck('dubbel versturen geblokkeerd (bezig/verstuurd-wacht, disabled, aria-busy)', /if \(bezig \|\| verstuurd\) return;/.test(js) && /btn\.setAttribute\('aria-busy', 'true'\)/.test(js) && /btn\.disabled\s+= true/.test(js));
    ck('Enter kan ook niet dubbel versturen', /e\.key === 'Enter' && !verstuurd && !bezig/.test(js));
    ck('succes pas bij success:true, anders blijft het formulier', /r\.ok && d && d\.success === true/.test(js));
    ck('fout: invoer behouden, 4xx en 5xx/netwerk onderscheiden', /BEV_T\.errControle/.test(js) && /BEV_T\.errServer/.test(js) && /BEV_T\.errNetwork/.test(js) && !/naam'\)\.value\s*=\s*''/.test(js));
    ck('mislukt tonen na geslaagd antwoord valt terug op minimale bevestiging, nooit opnieuw versturen', /try \{ info = toonBevestiging[\s\S]{0,80}catch \(e\) \{ minimaleBevestiging\(\); \}/.test(js) && /if \(verstuurd\) return;/.test(js));
    ck('de ingebedde functies zijn die van de module', js.includes(B.bepaal.toString()) && js.includes(B.kiesFlow.toString()));

    /* postMessage: alleen een vaste lijst sleutels, nooit persoonsgegevens. */
    const meldingen = [...js.matchAll(/meld\('([a-z_]+)'(?:, (\{[^}]*\}|null|info \? \{[^}]*\} : null))?\)/g)];
    ck('drie soorten melding', ['lead_form_submitted', 'lead_confirmation_viewed', 'confirmation_cta_clicked'].every((n) => meldingen.some((m) => m[1] === n)), meldingen.map((m) => m[1]));
    const toegestaan = new Set(['flow', 'channel', 'cta']);
    const sleutelsInMelding = meldingen.flatMap((m) => [...String(m[2] || '').matchAll(/(\w+):/g)].map((x) => x[1]));
    ck('meldingen bevatten alleen flow/channel/cta', sleutelsInMelding.every((k) => toegestaan.has(k)), sleutelsInMelding);
    const meldFn = js.slice(js.indexOf('function meld('), js.indexOf('function vul('));
    ck('meld() verwijst niet naar naam, nummer, e-mail of id', !/\b(name|phone|email|naam|id)\b/.test(meldFn.replace(/\/\*[\s\S]*?\*\//g, '')));
  }

  console.log('\nde server slaat op VOORDAT hij succes meldt');
  {
    const f = fs.readFileSync(BASE + '/api/form.js', 'utf8');
    const aanmaak = f.indexOf('if (!createRes.ok)');
    const succes = f.indexOf('return res.status(200).json({ success: true, id: createData.id');
    ck('aanmaak-fout wordt afgehandeld voor de succesrespons', aanmaak > 0 && succes > aanmaak);
    ck('respons meldt kanaal en status', /\.\.\.kanaalUit/.test(f) && /bestaand: true/.test(f));
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
