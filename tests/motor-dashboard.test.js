'use strict';
/*
 * Motorsegment, stap 8: dashboard en onboarding.
 *  - de wizardkaart 'Motordealer' (vertical dealership + segment motor), vier talen;
 *  - vw() geeft een motordealer motorwoorden, een autodealer ongewijzigd zijn woorden;
 *  - hvSectorBijVertical blijft 'dealership' vinden voor auto en vindt de motorkaart voor motor;
 *  - het voertuigformulier heeft cc en rijbewijs, alleen getoond voor motor;
 *  - config-get geeft segment, config-save neemt segment aan (whitelist, apart best-effort);
 *  - dashboard.js blijft onder 22.000 regels; het nieuwe clientwerk staat in api/_dash/.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = 'x'; process.env.BASE_AIRTABLE = 'y';

let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 220)}`); ok ? pass++ : fail++; };

const dash = require(BASE + 'api/dashboard.js');
let html = '';
dash({ method: 'GET', url: '/dashboard', headers: {} }, { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
const i18n = require(BASE + 'api/_i18n.js');
const segDash = require(BASE + 'api/_dash/segment.js');
const seg = require(BASE + 'api/_segment.js');

console.log('\nonderdelen en grootte');
{
  const regels = fs.readFileSync(BASE + 'api/dashboard.js', 'utf8').split('\n').length;
  ck('dashboard.js < 22.000 regels', regels < 22000, regels);
  ck('de clientfuncties staan in api/_dash/segment.js, niet in dashboard.js', /function segmentToepassen/.test(segDash.js()) && !/function segmentToepassen/.test(fs.readFileSync(BASE + 'api/dashboard.js', 'utf8')));
  ck('en komen in de pagina terecht', /function segmentToepassen\(\)/.test(html) && /function isMotor\(\)/.test(html));
  ck('segmentnamen client = server', /SEG_BEKEND = \['auto', 'motor'\]/.test(segDash.js()) && seg.BEKEND.join() === 'auto,motor');
}

console.log('\ni18n in vier talen');
{
  const sleutels = ['mot.nav', 'mot.one', 'mot.many', 'mot.One', 'mot.none', 'mot.add', 'mot.testride', 'mot.empty.text', 'mot.desc.ph', 'mot.link.a11y', 'mot.loadFailed',
    'mot.f.type', 'mot.f.cc', 'mot.f.rijbewijs', 'mot.rijbewijs.onbekend', 'markt.motorcycle_dealer.t', 'markt.motorcycle_dealer.s', 'markt.sub.motorcycle_dealer', 'set.markt.motor', 'score.reden.testrit'];
  const ontbreekt = [];
  for (const k of sleutels) for (const l of ['nl', 'fr', 'en', 'de']) if (!i18n.t(l, k) || i18n.t(l, k) === k) ontbreekt.push(l + ':' + k);
  ck('elke nieuwe sleutel bestaat in nl, fr, en, de', ontbreekt.length === 0, ontbreekt);
  ck('motor-woorden bevatten geen autowoord (nl/fr/en/de)',
    ['mot.nav', 'mot.one', 'mot.many', 'mot.none', 'mot.add', 'mot.testride', 'mot.empty.text', 'mot.desc.ph', 'mot.loadFailed', 'markt.motorcycle_dealer.s']
      .every((k) => ['nl', 'fr', 'en', 'de'].every((l) => !/\bauto\b|auto's|voiture|\bcar\b|cars|AutoScout|proefrit|wagen|Fahrzeug|Auto\b/i.test(i18n.t(l, k)))));
}

console.log('\nvw() en de marktkaarten, in een kale sandbox uit de uitgestuurde pagina');
{
  const van = html.indexOf('var hvVertical = ');
  const tot = html.indexOf('async function marktWisselen');
  const stukje = html.slice(van, tot);
  const kaarten = html.slice(html.indexOf('var WIZARD_MARKTEN = ['), html.indexOf('var _wizardConfig = null;'));
  const sandbox = { tr: (k) => k, document: { getElementById: () => null, querySelector: () => null } };
  vm.createContext(sandbox);
  vm.runInContext(kaarten + '\n' + stukje + '\n' + segDash.js() + '\nthis.api = { vw, isMotor, segmentVoorSector, hvSectorBijVertical, set: function (v, s) { hvVertical = v; hvSegment = s; } };', sandbox);
  const a = sandbox.api;
  a.set('dealership', 'auto');
  ck('autodealer: veh.nav / veh.one / veh.testdrive (ongewijzigd)', a.vw('Meer') === 'veh.nav' && a.vw('een') === 'veh.one' && a.vw('afspraak') === 'veh.testdrive' && a.vw('aanbod') === 'veh.stock');
  a.set('dealership', 'motor');
  ck('motordealer: mot.nav / mot.one / mot.testride', a.vw('Meer') === 'mot.nav' && a.vw('een') === 'mot.one' && a.vw('afspraak') === 'mot.testride');
  ck('motordealer: wat niet overschreven is valt terug op de dealerwoorden', a.vw('aanbod') === 'veh.stock' && a.vw('tabel') === 'vehicles');
  a.set('vastgoed', 'motor');
  ck('een segment buiten dealership telt niet: vastgoed blijft vastgoed', a.vw('Meer') === 'nav.properties' && a.isMotor() === false);
  ck('segmentVoorSector: motorcycle_dealer = motor; dealership, real_estate, onbekend = auto',
    a.segmentVoorSector('motorcycle_dealer') === 'motor' && a.segmentVoorSector('dealership') === 'auto' && a.segmentVoorSector('real_estate') === 'auto' && a.segmentVoorSector('???') === 'auto');
  ck('hvSectorBijVertical: dealership blijft dealership (ook zonder segment); motor vindt de motorkaart',
    a.hvSectorBijVertical('dealership') === 'dealership' && a.hvSectorBijVertical('dealership', 'auto') === 'dealership'
    && a.hvSectorBijVertical('dealership', 'motor') === 'motorcycle_dealer' && a.hvSectorBijVertical('vastgoed', 'motor') === 'real_estate');
  const m = vm.runInContext('WIZARD_MARKTEN.filter(function (k) { return k.id === "motorcycle_dealer"; })[0]', sandbox);
  ck('de kaart: vertical dealership, segment motor, geen eigen vertical', m && m.vertical === 'dealership' && m.segment === 'motor');
  ck('de volgorde van de bestaande kaarten is niet veranderd (autohandel voorop)', vm.runInContext('WIZARD_MARKTEN[0].id', sandbox) === 'dealership');
}

console.log('\nhet formulier en de instellingen');
{
  ck('cc en rijbewijs staan in het formulier, standaard verborgen', /id="pd-motor-velden" style="display:none"/.test(html) && /id="pd-f-cc"/.test(html) && /id="pd-f-rijbewijs"/.test(html));
  ck('rijbewijs kent A1, A2, A en "niet ingevuld"', /<option value="">[^<]+<\/option>\s*<option value="A1">A1<\/option><option value="A2">A2<\/option><option value="A">A<\/option>/.test(html));
  ck('opslaan stuurt cc/rijbewijs ALLEEN voor motor mee (auto: ongewijzigde payload)', /cc:\s+isMotor\(\) \? getal\('pd-f-cc'\) : undefined/.test(html) && /rijbewijs:\s+isMotor\(\) \? lees\('pd-f-rijbewijs'\) : undefined/.test(html));
  ck('Instellingen heeft een motordealer-optie', /<option value="motorcycle_dealer">/.test(html));
  ck('markt wisselen stuurt het segment mee', /vertical: nieuweVertical, segment: segmentVoorSector\(gekozen\)/.test(html));
  ck('de wizard bewaart het segment', /segment: segmentVoorSector\(_wizardMarkt\)/.test(html));
  const onb = fs.readFileSync(BASE + 'public/onboard.html', 'utf8');
  ck('/onboard biedt Motordealer aan met label', /<option value="motorcycle_dealer">Motordealer<\/option>/.test(onb) && /motorcycle_dealer: 'Motordealer'/.test(onb));
}

console.log('\nde server');
{
  const leads = fs.readFileSync(BASE + 'api/leads.js', 'utf8');
  ck('config-get geeft segment (leeg = auto)', /segment:\s+_segment\.van\(rec\.fields\)/.test(leads));
  ck('config-save: alleen bekende segmentwaarden, apart best-effort (veld bestaat mogelijk nog niet)',
    /wantsSegmentUpdate = body\.segment !== undefined\s+&& _segment\.BEKEND\.indexOf/.test(leads) && /\[_segment\.VELD\]: _segment\.norm\(body\.segment\)/.test(leads) && !/u\['Vehicle Segment'\]/.test(leads));
  ck('een alleen-segment-save is geen "niets om bij te werken"', /&& !wantsSegmentUpdate\) \{\s+return res\.status\(400\)/.test(leads));
  ck('norm() weigert rommel: wordt auto', seg.norm('boot') === 'auto' && seg.norm(' MOTOR ') === 'motor');
  const wizardNiche = require(BASE + 'api/_vertical.js');
  ck('de wizard-sector motorcycle_dealer leest ook zonder segmentveld als dealership + motor',
    wizardNiche.van({ Niche: 'motorcycle_dealer' }) === 'dealership' && seg.van({ Niche: 'motorcycle_dealer' }) === 'motor');
  ck('en dealership-sector zonder segmentveld blijft auto', seg.van({ Niche: 'dealership' }) === 'auto');
}

console.log(`\n${pass} ok, ${fail} fout`);
process.exit(fail ? 1 : 0);
