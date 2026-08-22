// De plantabel is de enige plek waar een prijs staat. Deze test bewaakt dat:
// de getallen moeten kloppen met de prijspagina, en alles wat ervan afhangt
// moet meebewegen in plaats van een eigen kopie te houden.
process.env.API_AIRTABLE = 'stub';
process.env.BASE_AIRTABLE = 'stub';

const BASE = require('path').join(__dirname, '..') + '/';
const plans = require(BASE + 'api/_plans.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\n— de getallen van de prijspagina —');
// Bron: helvaro.pro, augustus 2026. Wijzigt de site, dan hoort deze test te
// falen tot _plans.js is bijgewerkt -- dat is precies waarvoor hij er is.
const verwacht = {
  starter: { prijsEur: 249.99, credits: 3000,  gesprekken: 150 },
  growth:  { prijsEur: 499,    credits: 10000, gesprekken: 500 },
  scale:   { prijsEur: 799,    credits: 20000, gesprekken: 1000 },
};
for (const [id, v] of Object.entries(verwacht)) {
  const p = plans.plan(id);
  ck(`${id}: € ${v.prijsEur}`, p && p.prijsEur === v.prijsEur, p && p.prijsEur);
  ck(`${id}: ${v.credits} credits`, p && p.credits === v.credits, p && p.credits);
  ck(`${id}: ~${v.gesprekken} gesprekken`, plans.gesprekken(v.credits) === v.gesprekken, plans.gesprekken(v.credits));
}

console.log('\n— het anker: 20 credits per gesprek —');
// Dit is waarom "3.000 credits" en "±150 gesprekken" op dezelfde kaart kunnen
// staan zonder dat iemand hoeft te rekenen. Loopt dit uit de pas met het
// gewicht in _credits.js, dan liegt de prijspagina.
const credits = require(BASE + 'api/_credits.js');
ck('_plans en _credits zijn het eens over wat een gesprek kost',
   plans.CREDITS_PER_GESPREK === credits.WEIGHTS[credits.FEATURES.WHATSAPP_CONVERSATION],
   { plans: plans.CREDITS_PER_GESPREK, credits: credits.WEIGHTS[credits.FEATURES.WHATSAPP_CONVERSATION] });

console.log('\n— bijkopen kost hetzelfde als een abonnement —');
// De fout die hier twee keer gemaakt is. Te laag en bijkopen ondermijnt je
// abonnement; te hoog en je straft groei. Gelijk is het enige dat klopt.
const starterPerCredit = plans.perCredit('starter');
ck('het tarief voor bijkopen volgt het Starter-tarief',
   Math.abs(credits.TOPUP_RATE_EUR - starterPerCredit) < 0.001,
   { topup: credits.TOPUP_RATE_EUR, starter: starterPerCredit });

const o = credits.topupOfferte(249.99);
ck('voor de prijs van Starter krijg je ongeveer Starter aan credits',
   Math.abs(o.credits - 3000) <= 5, o);

console.log('\n— marges —');
// Geen verzonnen getallen: dit rekent met de kostprijs uit CREDIT-SYSTEM-DESIGN.md.
for (const id of ['starter', 'growth', 'scale']) {
  const p = plans.plan(id);
  const m = plans.marge(p.prijsEur, p.credits);
  ck(`${id} houdt meer dan de helft over (${Math.round(m * 100)}%)`, m > 0.5, m);
}
// De staffel mag de marge niet onder die van een abonnement duwen.
const groot = credits.topupOfferte(1000);
const margeGroot = plans.marge(groot.bedragEur, groot.credits);
ck('ook met de hoogste volumebonus blijft de marge boven 50%', margeGroot > 0.5, margeGroot);

console.log('\n— onzin geeft geen onzin terug —');
ck('een onbekend plan geeft null', plans.plan('platinum') === null);
ck('en per credit dan 0', plans.perCredit('platinum') === 0);
ck('marge op nul euro bestaat niet', plans.marge(0, 1000) === null);

console.log('\n— wat het scherm krijgt —');
const pub = plans.publiek();
ck('drie plannen', pub.length === 3, pub.length);
ck('elk met een aantal gesprekken erbij', pub.every(p => p.gesprekken > 0), pub);
ck('en niets dat de browser zelf moet uitrekenen', pub.every(p => typeof p.perCredit === 'number'), pub);

console.log(`\n${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
