'use strict';
/*
 * AutoScout24-verkopersprofiel als voorraadbron (2026-09-27).
 *
 * De dealer plakt zijn profieladres; Helvaro leest de publieke pagina's
 * (20 wagens per pagina, stabiel advertentie-id) en de gewone sync-motor doet
 * de rest. Hier: de adrescontrole, robots.txt, het omzetten van een advertentie,
 * het pagineren en -- belangrijkst -- dat een blokkade of een half gelezen
 * voorraad NOOIT wagens op verkocht zet. Daarna de scenario's uit de opdracht
 * op de verzoen-stap.
 */
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
process.env.API_AIRTABLE = process.env.API_AIRTABLE || 'test';
process.env.BASE_AIRTABLE = process.env.BASE_AIRTABLE || 'test';
let pass = 0, fail = 0;
const ck = (n, ok, got) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got).slice(0, 300)}`); ok ? pass++ : fail++; };

const inv = require(BASE + 'api/_inventaris.js');
const T = inv._test;
const sync = require(BASE + 'api/_voorraad-sync.js');
const P1 = fs.readFileSync(BASE + 'tests/fixtures/autoscout-dealer-p1.html', 'utf8');

/* Een nagemaakte AutoScout24: `totaal` wagens, 20 per pagina, afgeleid van
   echte advertenties uit de fixture (andere id's). */
const echt = T.leesAutoscoutPagina(P1).listings;
function nepSite({ totaal = 45, faalOpPagina = 0, faalStatus = 429, robots = 'User-agent: *\nDisallow: /dealerarea/\n', dubbel = false, tekort = 0 } = {}) {
  const alle = Array.from({ length: totaal }, (_, i) => {
    const b = JSON.parse(JSON.stringify(echt[i % echt.length]));
    b.id = 'id-' + String(i).padStart(4, '0');
    b.url = '/nl/aanbod/wagen-' + b.id;
    b.prices.public.priceRaw = 10000 + i;
    return b;
  });
  const gevraagd = [];
  const haal = async (url) => {
    gevraagd.push(String(url));
    if (/robots\.txt$/.test(url)) return { ok: true, status: 200, text: async () => robots };
    const p = Number((/[?&]page=(\d+)/.exec(url) || [])[1] || 1);
    if (faalOpPagina === p) return { ok: false, status: faalStatus, text: async () => 'nee' };
    let stuk = alle.slice((p - 1) * 20, p * 20);
    if (dubbel && p === 2) stuk = stuk.concat(alle.slice(0, 3));      // dezelfde wagens nog eens
    if (tekort && p === 2) stuk = stuk.slice(0, 20 - tekort);
    const json = { props: { pageProps: { listings: stuk, numberOfResults: totaal } } };
    return { ok: true, status: 200, text: async () => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(json)}</script>` };
  };
  return { haal, gevraagd };
}
const bron = { url: 'https://www.autoscout24.be/nl/verkopers/provan-motors' };
const snel = { wacht: async () => {} };

(async () => {
  console.log('\n— welk adres mag —');
  ck('het profiel uit een link met tracking wordt schoongemaakt',
    (T.autoscoutDealerUrl('https://www.autoscout24.be/nl/verkopers/provan-motors?atype=C&gclid=x') || {}).url === 'https://www.autoscout24.be/nl/verkopers/provan-motors');
  ck('Duitse Händlerseite mag', !!T.autoscoutDealerUrl('https://www.autoscout24.de/haendler/autohaus-x'));
  for (const slecht of ['http://www.autoscout24.be/nl/verkopers/x', 'https://evil.example/nl/verkopers/x', 'https://www.autoscout24.be.evil.example/nl/verkopers/x',
    'https://www.autoscout24.be/nl/aanbod/jaguar-xf-123', 'https://www.autoscout24.be/lst/bmw', 'https://www.autoscout24.be/nl/verkopers/../dealerarea']) {
    ck('geweigerd: ' + slecht, T.autoscoutDealerUrl(slecht) === null);
  }
  const b = inv.saneerBron({ type: 'feed', url: 'https://www.autoscout24.be/nl/verkopers/provan-motors?x=1' });
  ck('het Franse profielpad /fr/professional/<naam> wordt herkend (Sindi, 2026-10-03)',
    (T.autoscoutDealerUrl('https://www.autoscout24.be/fr/professional/renga-occasion?x=1') || {}).url === 'https://www.autoscout24.be/fr/professional/renga-occasion');
  ck('en als feed ingevuld wordt het toch een autoscout24-bron',
    (inv.saneerBron({ type: 'feed', url: 'https://www.autoscout24.be/fr/professional/renga-occasion' }) || {}).provider === 'autoscout24');
  ck('saneerBron herkent het profiel als provider autoscout24', b.provider === 'autoscout24' && b.url === 'https://www.autoscout24.be/nl/verkopers/provan-motors', b);
  ck('een gewone feed blijft provider feed', inv.saneerBron({ type: 'feed', url: 'https://dms.example/feed.xml' }).provider === 'feed');

  console.log('\n— robots.txt —');
  const robots = (tekst) => async () => ({ ok: true, status: 200, text: async () => tekst });
  ck('verkopers niet verboden: mag', await T.robotsStaatToe('https://x', '/nl/verkopers/a', robots('User-agent: *\nDisallow: /dealerarea/')));
  ck('verkopers verboden voor *: mag niet', !(await T.robotsStaatToe('https://x', '/nl/verkopers/a', robots('User-agent: *\nDisallow: /nl/verkopers/'))));
  ck('verbod alleen voor een andere bot: mag', await T.robotsStaatToe('https://x', '/nl/verkopers/a', robots('User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nDisallow: /entry/')));
  ck('robots onbereikbaar (500): voorzichtig, mag niet', !(await T.robotsStaatToe('https://x', '/nl/verkopers/a', async () => ({ ok: false, status: 500, text: async () => '' }))));

  console.log('\n— een advertentie omzetten —');
  const m = T.mapAutoscout(echt[0], 'https://www.autoscout24.be');
  ck('stabiel id als bronId (niet merk/model/prijs)', m.bronId === echt[0].id.toLowerCase());
  ck('merk, model, prijs en km komen mee', !!(m.merk && m.model && m.prijs > 0 && Number.isFinite(m.km)), m);
  ck('foto’s in een grotere maat', m.fotos.length > 0 && m.fotos.every((u) => /\/720x540\.webp$/.test(u)), m.fotos);
  ck('link is absoluut en op het AutoScout24-domein', /^https:\/\/www\.autoscout24\.be\/nl\/aanbod\//.test(m.link), m.link);
  ck('status: beschikbaar (aanwezig = te koop)', m.status === 'beschikbaar');
  let fout = null; try { T.leesAutoscoutPagina('<html>Please verify you are human</html>'); } catch (e) { fout = e; }
  ck('een captcha- of blokkadepagina is een fout, geen lege voorraad', fout && fout.code === 'bron_geblokkeerd', fout && fout.code);

  console.log('\n— pagineren —');
  let site = nepSite({ totaal: 45 });
  let pauzes = 0;
  const uit = await T.haalAutoscout(bron, { fetch: site.haal, wacht: async () => { pauzes++; } });
  ck('alle 45 wagens over 3 pagina’s', uit.voertuigen.length === 45, uit.voertuigen.length);
  ck('een pauze tussen de pagina’s', pauzes === 2, pauzes);
  ck('robots.txt eerst gelezen', /robots\.txt$/.test(site.gevraagd[0]), site.gevraagd);
  site = nepSite({ totaal: 45, dubbel: true });
  ck('dubbele advertenties in de bron: één keer', (await T.haalAutoscout(bron, { fetch: site.haal, ...snel })).voertuigen.length === 45);

  console.log('\n— wat NOOIT tot "verkocht" mag leiden —');
  for (const [naam, opt, code] of [['429 op pagina 2', { faalOpPagina: 2, faalStatus: 429 }, 'bron_geblokkeerd'],
                                    ['403 op pagina 1', { faalOpPagina: 1, faalStatus: 403 }, 'bron_geblokkeerd'],
                                    ['pagina 2 half gelezen', { tekort: 15 }, 'bron_onvolledig'],
                                    ['robots verbiedt het', { robots: 'User-agent: *\nDisallow: /nl/verkopers/' }, 'bron_geweigerd']]) {
    site = nepSite(Object.assign({ totaal: 45 }, opt));
    let e = null; try { await T.haalAutoscout(bron, { fetch: site.haal, ...snel }); } catch (x) { e = x; }
    ck(`${naam}: de run faalt (${code}) in plaats van een kleinere voorraad te geven`, e && e.code === code, e && e.code);
  }
  site = nepSite({ robots: 'User-agent: *\nDisallow: /nl/verkopers/' });
  try { await T.haalAutoscout(bron, { fetch: site.haal, ...snel }); } catch (_) { /* verwacht */ }
  ck('bij een robots-verbod wordt geen enkele verkoperspagina opgevraagd', site.gevraagd.every((u) => /robots\.txt$/.test(u)), site.gevraagd);
  let tijdFout = null;
  try { await T.haalAutoscout(bron, { fetch: nepSite({ totaal: 45 }).haal, wacht: async () => {}, budgetMs: -1 }); } catch (e) { tijdFout = e; }
  ck('tijd op halverwege: faalt, zet niets op verkocht', tijdFout && tijdFout.code === 'bron_onvolledig', tijdFout && tijdFout.code);

  console.log('\n— de scenario’s op de sync-stap —');
  const nu = '2026-09-27T10:00:00.000Z';
  const bestaandVan = (lijst) => lijst.map((f, i) => Object.assign({ id: 'rec' + i, code: 'V' + (i + 1), bron: 'feed', bronId: f.bronId, gearchiveerd: false, publiek: true }, f));
  site = nepSite({ totaal: 10 });
  const bronLijst = (await T.haalAutoscout(bron, { fetch: site.haal, ...snel })).voertuigen;
  const bestaand = bestaandVan(bronLijst.slice(0, 9));                       // wagen 10 is nieuw
  bestaand[1] = Object.assign({}, bestaand[1], { prijs: bestaand[1].prijs + 500 });   // prijs gewijzigd in de bron
  bestaand[2] = Object.assign({}, bestaand[2], { km: 1 });                    // km gewijzigd
  bestaand[3] = Object.assign({}, bestaand[3], { status: 'gereserveerd' });   // dealer reserveerde
  bestaand[4] = Object.assign({}, bestaand[4], { status: 'verkocht', verkochtOp: '2026-09-25T00:00:00.000Z' });  // verkocht, nu terug
  const verdwenen = Object.assign(bestaandVan([{ bronId: 'weg-1', merk: 'Audi', model: 'A4', status: 'beschikbaar' }])[0], { id: 'recWEG', code: 'V99' });
  const plan = sync.verzoen(bestaand.concat([verdwenen]), bronLijst, { nu, verdwenen: 'verkocht', kentReservering: false });
  const bij = (code) => plan.bijwerken.find((b) => b.code === code);
  ck('1. nieuwe wagen verschijnt', plan.nieuw.length === 1 && plan.nieuw[0].bronId === bronLijst[9].bronId, plan.nieuw.length);
  ck('2. prijswijziging', bij('V2') && bij('V2').wijzigingen.includes('prijs'));
  ck('3. kilometerwijziging', bij('V3') && bij('V3').wijzigingen.includes('km'));
  ck('4a. reservering van de dealer blijft staan', !bij('V4') || !bij('V4').wijzigingen.includes('status'), bij('V4'));
  ck('5. verdwenen wagen: verkocht, niet gewist', plan.weg.some((w) => w.code === 'V99' && w.invoer.status === 'verkocht'), plan.weg);
  ck('6. wagen die terug verschijnt: weer beschikbaar', bij('V5') && bij('V5').invoer.status === 'beschikbaar' && bij('V5').wijzigingen.includes('status'), bij('V5'));
  const planMetFeed = sync.verzoen([Object.assign({}, bestaand[3])], [bronLijst[3]], { nu, kentReservering: true });
  ck('4b. een feed die WEL reserveringen kent mag hem wel terugzetten', planMetFeed.bijwerken.some((b) => b.wijzigingen.includes('status')));

  console.log('\n— een abnormaal kleine bron —');
  const groot = bestaandVan(Array.from({ length: 203 }, (_, i) => ({ bronId: 'g' + i, merk: 'VW', model: 'Golf', status: 'beschikbaar', prijs: 1000 + i })));
  const klein = groot.slice(0, 17).map((v) => ({ bronId: v.bronId, merk: v.merk, model: v.model, status: 'beschikbaar', prijs: v.prijs }));
  const p2 = sync.verzoen(groot, klein, { nu, verdwenen: 'verkocht', kentReservering: false });
  ck('203 → 17: niets op verkocht, geblokkeerd tot een mens bevestigt', p2.dalingGeblokkeerd === true && p2.weg.length === 0 && p2.verdwenenAantal === 186, { g: p2.dalingGeblokkeerd, w: p2.weg.length, v: p2.verdwenenAantal });

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
