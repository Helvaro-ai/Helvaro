/*
 * WhatsApp-kostenmotor: servicevenster, berichtrouter, opvolgbeslisser,
 * duurzame kostenboekhouding en de simulatie op dealervolume.
 *
 * Scenario's A t/m I uit de opdracht staan hieronder met dezelfde letter.
 * Een nep-Upstash in het geheugen (HINCRBY, EXPIRE, HGETALL, SET NX EX, GET)
 * zodat het Redis-pad echt doorlopen wordt, niet alleen de geheugenkopie.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}`);
  ok ? pass++ : fail++;
};

/* ── Nep-Upstash ──────────────────────────────────────────────────────────── */
const hashes = new Map(), strings = new Map();
let opdrachten = 0, aanroepen = 0;
global.fetch = async (url, opts = {}) => {
  aanroepen++;
  const batch = JSON.parse(opts.body || '[]');
  const out = batch.map((c) => {
    opdrachten++;
    const [naam, sleutel, ...a] = c;
    if (naam === 'HINCRBY') { const h = hashes.get(sleutel) || {}; h[a[0]] = (h[a[0]] || 0) + Number(a[1]); hashes.set(sleutel, h); return { result: h[a[0]] }; }
    if (naam === 'EXPIRE') return { result: 1 };
    if (naam === 'HGETALL') { const h = hashes.get(sleutel) || {}; return { result: Object.entries(h).flatMap(([k, v]) => [k, String(v)]) }; }
    if (naam === 'GET') return { result: strings.has(sleutel) ? strings.get(sleutel) : null };
    if (naam === 'SET') {
      const nx = a.includes('NX');
      if (nx && strings.has(sleutel)) return { result: null };
      strings.set(sleutel, a[0]); return { result: 'OK' };
    }
    return { result: null };
  });
  return { ok: true, status: 200, json: async () => out };
};
process.env.UPSTASH_REDIS_REST_URL = 'https://nep.upstash.test';
process.env.UPSTASH_REDIS_REST_TOKEN = 'nep-token';
delete process.env.KOSTEN_USD_EUR;

const R = require('../api/_wa-router.js');
const K = require('../api/_wa-kosten.js');
const U = R.ACTIE;
const NU = Date.UTC(2026, 9, 2, 12, 0, 0);
const UUR = 3600 * 1000;

(async () => {
  console.log('\n1. Het servicevenster');
  ck('geen inkomend bericht = dicht', R.venster(null, NU).open === false);
  ck('10 minuten geleden = open', R.venster(NU - 10 * 60000, NU).open === true);
  ck('23u59 = open, 24u01 = dicht', R.venster(NU - 23.99 * UUR, NU).open && !R.venster(NU - 24.02 * UUR, NU).open);
  ck('verloopt precies 24u na het laatste KLANTBERICHT', R.venster(NU - UUR, NU).verlooptOp === NU - UUR + 24 * UUR);
  ck('laatsteInkomend negeert onze eigen berichten',
    R.laatsteInkomend([{ role: 'user', ts: 5 }, { role: 'assistant', ts: 99 }, { role: 'user', ts: 7 }]) === 7);
  const verlengd = R.venster(R.laatsteInkomend([{ role: 'user', ts: NU - 30 * UUR }, { role: 'user', ts: NU - 2 * UUR }]), NU);
  ck('een nieuw klantbericht verlengt het venster', verlengd.open === true && verlengd.msOver > 21 * UUR, verlengd);

  console.log('\nA. AutoScout-klant schrijft als eerste');
  const A = R.besluit({ purpose: 'reply', nowMs: NU, lastInboundMs: NU - 5000, templateAvailable: true });
  ck('antwoord = gewoon vrij bericht, geen sjabloon', A.actie === U.VRIJ_BERICHT && A.billable === false, A);

  console.log('\nB. Klant antwoordt na 10 minuten');
  const B = R.besluit({ purpose: 'reply', nowMs: NU, lastInboundMs: NU - 10 * 60000, templateAvailable: true });
  ck('nog steeds gratis en zonder sjabloon', B.actie === U.VRIJ_BERICHT && !B.billable, B);
  const Bf = R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: NU - 10 * 60000, templateAvailable: true });
  ck('zelfs een opvolging binnen het venster is een vrij bericht (niet het betaalde sjabloon)', Bf.actie === U.VRIJ_BERICHT, Bf);

  console.log('\nC. Klant antwoordt pas na het venster');
  const C = R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: NU - 30 * UUR, templateAvailable: true, templateCategory: 'utility' });
  ck('venster dicht: alleen een utility-sjabloon, als betaald gemarkeerd', C.actie === U.UTILITY_TEMPLATE && C.billable === true && C.categorie === 'utility', C);
  const Cm = R.besluit({ purpose: 'marketing', nowMs: NU, lastInboundMs: null, templateAvailable: true, templateCategory: 'marketing' });
  ck('marketing buiten het venster = ander sjabloon', Cm.actie === U.ANDER_TEMPLATE, Cm);
  const Cz = R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: NU - 30 * UUR, templateAvailable: false });
  ck('geen goedgekeurd sjabloon = niets sturen (nooit vrije tekst buiten het venster)', Cz.actie === U.NIET_STUREN && Cz.reden === 'venster_dicht_geen_sjabloon', Cz);

  console.log('\nD. Afspraak geboekt');
  const D = R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: NU - 30 * UUR, booked: true, templateAvailable: true });
  ck('opvolging stopt', D.actie === U.NIET_STUREN && D.reden === 'afspraak_staat', D);
  ck('maar een herinnering bij die afspraak gaat wel door',
    R.besluit({ purpose: 'reminder', nowMs: NU, lastInboundMs: NU - 30 * UUR, booked: true, templateAvailable: true }).actie === U.UTILITY_TEMPLATE);
  const Dv = R.volgOpBesluit({ nowMs: NU, booked: true, lastInboundMs: NU - 40 * UUR, lastOutboundMs: NU - 39 * UUR });
  ck('opvolgbeslisser stopt ook', Dv.doen === false && Dv.reden === 'afspraak_staat', Dv);

  console.log('\nE. Voertuig verkocht');
  const E = R.besluit({ purpose: 'reply', nowMs: NU, lastInboundMs: NU - 1000, vehicleSold: true });
  ck('klant krijgt een antwoord, gemarkeerd zodat de AI niets beweert dat niet klopt', E.actie === U.VRIJ_BERICHT && E.vlaggen.includes('voertuig_verkocht'), E);
  ck('opvolging over een verkocht voertuig stopt',
    R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: NU - 30 * UUR, vehicleSold: true, templateAvailable: true }).reden === 'voertuig_verkocht');

  console.log('\nF. Verkoper neemt over');
  ck('antwoord gaat naar de verkoper', R.besluit({ purpose: 'reply', nowMs: NU, lastInboundMs: NU - 1000, humanTakeover: true }).actie === U.OVERDRACHT);
  ck('geplande berichten verdwijnen', R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: NU - 1000, humanTakeover: true, templateAvailable: true }).actie === U.NIET_STUREN);
  ck('afmelding wint van alles', R.besluit({ purpose: 'reply', nowMs: NU, lastInboundMs: NU - 1000, optedOut: true }).reden === 'afgemeld');

  console.log('\nOpvolgbeslisser');
  const basis = { nowMs: NU, lastInboundMs: NU - 3 * 86400000, lastOutboundMs: NU - 2.9 * 86400000, lastInboundText: 'prima, bedankt' };
  ck('stilte na ons bericht = opvolgen', R.volgOpBesluit({ ...basis, lastInboundMs: NU - 4 * 86400000, lastOutboundMs: NU - 3 * 86400000 }).doen === true);
  ck('klant schreef NA ons laatste bericht = wij moeten antwoorden, niet opvolgen',
    R.volgOpBesluit({ ...basis, lastInboundMs: NU - UUR, lastOutboundMs: NU - 5 * UUR }).reden === 'klant_wacht_op_ons');
  ck('"niet geïnteresseerd" stopt', R.volgOpBesluit({ ...basis, lastInboundText: 'Ik ben niet meer geïnteresseerd' }).reden === 'niet_geinteresseerd');
  const denk = R.volgOpBesluit({ ...basis, lastInboundText: 'Ik denk er even over na', lastInboundMs: NU - 1 * 86400000, lastOutboundMs: NU - 23 * UUR });
  ck('"ik denk erover na" wacht, laagdrempelig later', denk.doen === false && denk.reden === 'bedenktijd' && denk.wanneerMs > NU, denk);
  ck('"kan ik zaterdag?" is de afspraakflow, geen opvolging', R.volgOpBesluit({ ...basis, lastInboundText: 'Kan ik zaterdag langskomen?' }).reden === 'afspraakflow_loopt');
  ck('maximum aantal opvolgingen', R.volgOpBesluit({ ...basis, opvolgingenGestuurd: 1 }).reden === 'maximum_bereikt' && R.volgOpBesluit({ ...basis, opvolgingenGestuurd: 1, maxOpvolgingen: 2 }).doen === false ? true : R.volgOpBesluit({ ...basis, opvolgingenGestuurd: 1, maxOpvolgingen: 2, lastInboundMs: NU - 4 * 86400000, lastOutboundMs: NU - 3 * 86400000 }).doen === true);
  ck('niet twee keer tegelijk', R.volgOpBesluit({ ...basis, opvolgingGepland: true }).reden === 'al_gepland');
  ck('te snel na ons laatste bericht', R.volgOpBesluit({ ...basis, lastInboundMs: NU - 9 * UUR, lastOutboundMs: NU - 8.5 * UUR - 3 * UUR }).doen !== undefined);
  ck('intenties: bevestiging / beschikbaarheid / overig',
    R.intentie('Thanks!') === 'bevestiging' && R.intentie('Is the BMW still available?') === 'beschikbaarheid' && R.intentie('Wat is de kilometerstand?') === 'overig');

  console.log('\nVeiligheidsrails');
  const lim = { outboundLeft: 0, templateLeft: 5, followupLeft: 5 };
  ck('automatisch verkeer wordt uitgesteld als het dagquotum op is',
    R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: null, templateAvailable: true, limits: lim }).actie === U.UITSTELLEN);
  const bijLimiet = R.besluit({ purpose: 'reply', nowMs: NU, lastInboundMs: NU - 1000, limits: lim });
  ck('een nieuwe klant wordt NOOIT laten wachten, ook niet bij een vol quotum',
    bijLimiet.actie === U.VRIJ_BERICHT && bijLimiet.vlaggen.includes('quotum_overschreden_toch_beantwoord'), bijLimiet);

  console.log('\nG. Idempotentie (webhook-herbezorging)');
  const sl = (extra) => R.idempotentieSleutel({ tenant: 'T', conversation: 'c1', event: 'antwoord', target: '3247', nowMs: NU, ...extra });
  ck('dezelfde gebeurtenis binnen de emmer = dezelfde sleutel', sl() === sl({ nowMs: NU + 60000 }));
  ck('een ander doel of gebeurtenis = andere sleutel', sl() !== sl({ event: 'opvolging' }) && sl() !== sl({ target: '3248' }));
  ck('een latere, legitieme opvolging komt wel door', sl() !== sl({ nowMs: NU + 24 * UUR }));

  console.log('\nMeta-factuurstatus');
  K._reset(); hashes.clear(); strings.clear();
  const n1 = K.normaliseerStatus({ id: 'w1', status: 'sent', pricing: { billable: false, pricing_model: 'PMP', category: 'service', type: 'free_customer_service' } });
  ck('service-bericht = gratis', n1.bekend && !n1.billable && n1.categorie === 'service', n1);
  const n2 = K.normaliseerStatus({ id: 'w2', status: 'sent', pricing: { billable: true, pricing_model: 'PMP', category: 'utility' } });
  ck('utility buiten het venster = betaald', n2.billable && n2.categorie === 'utility', n2);
  ck('billable:true maar type free_* = toch gratis', !K.normaliseerStatus({ id: 'w3', pricing: { billable: true, category: 'utility', type: 'free_entry_point' } }).billable);
  ck('zonder pricing = onbekend (blijft een schatting)', K.normaliseerStatus({ id: 'w4', status: 'sent' }).bekend === false);

  await K.boekUitgaand('DEALER1', { soort: 'service', vensterOpen: true, berichtId: 'wamid.S1', nu: NU });
  await K.boekUitgaand('DEALER1', { soort: 'template', categorie: 'utility', vensterOpen: false, berichtId: 'wamid.T1', nu: NU });
  const st1 = await K.boekStatus({ id: 'wamid.S1', status: 'sent', timestamp: NU / 1000, pricing: { billable: false, category: 'service', pricing_model: 'PMP', type: 'free_customer_service' } });
  const st2 = await K.boekStatus({ id: 'wamid.T1', status: 'sent', timestamp: NU / 1000, pricing: { billable: true, category: 'utility', pricing_model: 'PMP' } });
  ck('status wordt aan de dealer gekoppeld via het bericht-id (geen lead-opzoeking)', st1.geboekt && st1.tenant === 'DEALER1' && st2.geboekt, [st1, st2]);
  const dubbel = await K.boekStatus({ id: 'wamid.T1', status: 'delivered', timestamp: NU / 1000, pricing: { billable: true, category: 'utility', pricing_model: 'PMP' } });
  ck('dezelfde factuurstatus telt maar één keer (delivered na sent)', dubbel.geboekt === false && dubbel.reden === 'al_geboekt', dubbel);
  const o1 = await K.overzicht('DEALER1', '2026-10');
  ck('overzicht: 1 gratis, 1 betaald, beide bevestigd', o1.whatsapp.gratisServiceberichten === 1 && o1.whatsapp.betaaldGeschat === 1 && o1.whatsapp.betaaldBevestigd === 1 && o1.whatsapp.bevestigingsdekking === 1, o1.whatsapp);
  ck('bevestigde kosten = één utility-sjabloon', o1.whatsapp.kostenBevestigdEur === K.tarief('utility'), o1.whatsapp);
  ck('geen afwijking tussen onze aanname en Meta', o1.whatsapp.afwijkingen.dachtGratisMaarBetaald === 0);

  // Onze aanname klopt niet: wij dachten gratis, Meta rekent
  await K.boekUitgaand('DEALER1', { soort: 'service', vensterOpen: true, berichtId: 'wamid.X', nu: NU });
  await K.boekStatus({ id: 'wamid.X', status: 'sent', timestamp: NU / 1000, pricing: { billable: true, category: 'utility', pricing_model: 'PMP' } });
  const o2 = await K.overzicht('DEALER1', '2026-10');
  ck('"dachten gratis, Meta rekende" wordt geteld (alarm voor een kapotte vensterlogica)', o2.whatsapp.afwijkingen.dachtGratisMaarBetaald === 1, o2.whatsapp.afwijkingen);

  console.log('\nKosten: WhatsApp, AI en infrastructuur apart');
  await K.boekAi('DEALER1', { costUsd: 0.002, tokens: 900, nu: NU });
  const oAi = await K.overzicht('DEALER1', '2026-10');
  ck('AI staat apart in dollar', oAi.ai.kostenUsd === 0.002 && oAi.ai.aanroepen === 1, oAi.ai);
  ck('zonder wisselkoers is er GEEN gecombineerd totaal (geen verzonnen getal)', oAi.ai.kostenTotaalEur === null && oAi.kosten.volledig === false, oAi.kosten);
  ck('infrastructuur zonder tarief = onbekend, niet nul', oAi.infrastructuur.kostenEur === null);
  process.env.KOSTEN_USD_EUR = '0.9'; process.env.WA_INFRA_EUR_PER_AANROEP = '0.0001';
  await K.boek('DEALER1', 'infra', 100, NU);
  const oVol = await K.overzicht('DEALER1', '2026-10');
  ck('met koers en tarief: volledig totaal', oVol.kosten.volledig === true && oVol.infrastructuur.kostenEur === 0.01, oVol.kosten);
  delete process.env.KOSTEN_USD_EUR; delete process.env.WA_INFRA_EUR_PER_AANROEP;

  console.log('\nHet overzicht beantwoordt: wat kostte het ons werkelijk?');
  K._reset(); hashes.clear(); strings.clear();
  for (let i = 0; i < 10; i++) await K.boek('D2', 'lead', 1, NU);
  await K.boek('D2', 'afspraak', 2, NU); await K.boek('D2', 'gekwalificeerd', 5, NU);
  for (let i = 0; i < 10; i++) await K.boekInkomend('D2', { nieuwGesprek: true, nu: NU });
  for (let i = 0; i < 18; i++) await K.boekUitgaand('D2', { soort: 'service', vensterOpen: true, nu: NU });
  for (let i = 0; i < 2; i++) await K.boekUitgaand('D2', { soort: 'template', categorie: 'utility', vensterOpen: false, nu: NU });
  const o = await K.overzicht('D2', '2026-10');
  ck('leads, klantgestart, berichten, gratis, betaald', o.volumes.leads === 10 && o.volumes.klantGestartGesprekken === 10 && o.volumes.berichtenUit === 20 && o.whatsapp.gratisServiceberichten === 18 && o.whatsapp.betaaldGeschat === 2, o);
  ck('betaald percentage = 10%', o.whatsapp.betaaldPercentage === 0.1, o.whatsapp.betaaldPercentage);
  const verwacht = 2 * K.tarief('utility');
  ck('Meta-kosten = 2 sjablonen', Math.abs(o.whatsapp.kostenBesteEur - verwacht) < 1e-9, o.whatsapp.kostenBesteEur);
  ck('kosten per lead, per gesprek, per afspraak, per 100 leads',
    o.kosten.perLeadEur === Math.round(verwacht / 10 * 1e4) / 1e4 && o.kosten.perAfspraakEur === Math.round(verwacht / 2 * 1e4) / 1e4 && o.kosten.per100LeadsEur === Math.round(verwacht / 10 * 100 * 100) / 100, o.kosten);

  console.log('\nH/I. Simulatie op dealervolume (klant start in ~90% van de gevallen)');
  // Deterministisch (seed), zodat een afwijking altijd reproduceerbaar is.
  const maakRng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const simuleer = async (leads, tenant) => {
    const rng = maakRng(leads * 7 + 11);
    const verzonden = new Set();
    let dubbelGeblokkeerd = 0;
    const betaaldPerDoel = { reminder: 0, followup: 0 };
    const start = Date.now();
    const cmd0 = opdrachten;
    for (let i = 0; i < leads; i++) {
      const t0 = NU - 20 * 86400000 + Math.floor(rng() * 18 * 86400000);
      const klantStart = rng() < 0.9;
      await K.boek(tenant, 'lead', 1, t0);
      let laatsteIn = null, afspraak = false, opvolgingen = 0, laatsteUit = null;
      let t = t0;
      const stuur = async (doel, extra) => {
        const b = R.besluit({ purpose: doel, nowMs: t, lastInboundMs: laatsteIn, booked: afspraak, templateAvailable: true, templateCategory: 'utility', ...extra });
        // Elke verzending met idempotentiesleutel; een herbezorging (10%) moet geblokkeerd worden.
        const sleutel = R.idempotentieSleutel({ tenant, conversation: 'c' + i, event: doel + ':' + (extra && extra.n || 0), target: 'p' + i, nowMs: t });
        const herbezorgd = rng() < 0.1;
        for (let poging = 0; poging < (herbezorgd ? 2 : 1); poging++) {
          if (verzonden.has(sleutel)) { dubbelGeblokkeerd++; await K.boek(tenant, 'duplicaat', 1, t); continue; }
          verzonden.add(sleutel);
          if (b.actie === U.VRIJ_BERICHT) await K.boekUitgaand(tenant, { soort: 'service', vensterOpen: true, nu: t });
          else if (b.actie === U.UTILITY_TEMPLATE) betaaldPerDoel[doel] = (betaaldPerDoel[doel] || 0) + 1, await K.boekUitgaand(tenant, { soort: 'template', categorie: 'utility', vensterOpen: false, nu: t });
          else if (b.actie === U.NIET_STUREN) await K.boek(tenant, 'opvolging_onderdrukt', 1, t);
          if (b.actie !== U.NIET_STUREN) laatsteUit = t;
        }
        return b;
      };
      if (klantStart) {
        laatsteIn = t; await K.boekInkomend(tenant, { nieuwGesprek: true, nu: t });
        await K.boek(tenant, 'webhook', 1, t);
        await stuur('reply');                                 // één gebundeld antwoord
        const beurten = rng() < 0.7 ? 1 + Math.floor(rng() * 3) : 0;
        for (let b = 0; b < beurten; b++) {                   // klant reageert binnen minuten
          t += Math.floor(rng() * 20) * 60000; laatsteIn = t;
          await K.boekInkomend(tenant, { nieuwGesprek: false, nu: t });
          await stuur('reply', { n: b + 1 });
        }
        if (rng() < 0.3) { afspraak = true; await K.boek(tenant, 'afspraak', 1, t); await K.boek(tenant, 'gekwalificeerd', 1, t); }
        else if (beurten > 0 && rng() < 0.5) await K.boek(tenant, 'gekwalificeerd', 1, t);
        if (afspraak) { t += 30 * UUR; await stuur('reminder', { booked: true, n: 1 }); }  // herinnering: venster dan dicht
        else if (beurten === 0 || rng() < 0.4) {                                          // stilgevallen: opvolgbeslisser
          for (let o = 0; o < 3; o++) {
            t += 26 * UUR;
            const v = R.volgOpBesluit({ nowMs: t, lastInboundMs: laatsteIn, lastOutboundMs: laatsteUit, opvolgingenGestuurd: opvolgingen, lastInboundText: 'ok' });
            if (!v.doen) { await K.boek(tenant, 'opvolging_onderdrukt', 1, t); continue; }
            const b = await stuur('followup', { n: ++opvolgingen });
            if (b.actie !== U.NIET_STUREN) await K.boek(tenant, 'opvolging', 1, t);
          }
        }
      } else {
        await K.boek(tenant, 'webhook', 1, t);                // formulierlead: klant schreef nooit, venster is dicht
        const b = await stuur('followup', { n: 1 });
        if (b.actie !== U.NIET_STUREN) await K.boek(tenant, 'opvolging', 1, t);
      }
      await K.boekAi(tenant, { costUsd: 0.0009 * (1 + Math.floor(rng() * 3)), tokens: 1200, nu: t });
      await K.boek(tenant, 'infra', 6, t);
    }
    return { ms: Date.now() - start, redisOpdrachten: opdrachten - cmd0, dubbelGeblokkeerd, betaaldPerDoel };
  };

  const rijen = [];
  for (const n of [500, 1000, 2000, 3000, 5000]) {
    K._reset(); hashes.clear(); strings.clear(); opdrachten = 0; aanroepen = 0;
    const sim = await simuleer(n, 'SIM' + n);
    // Maand over alle dagen heen: het volume valt in september en oktober.
    const som = {};
    for (const [sl, h] of hashes) if (sl.startsWith('hv:wa:m:SIM' + n + ':')) for (const [k, v] of Object.entries(h)) som[k] = (som[k] || 0) + v;
    const ov = K.overzichtUit(som);
    rijen.push({ n, ov, sim, aanroepen });
    ck(`${n} leads: boekhouding sluit (uit = gratis + betaald)`, ov.volumes.berichtenUit === ov.whatsapp.gratisServiceberichten + ov.whatsapp.betaaldGeschat, ov.volumes);
    ck(`${n} leads: alle ${n} leads geteld, ${ov.volumes.klantGestartGesprekken} klantgestart`, ov.volumes.leads === n && ov.volumes.klantGestartGesprekken > n * 0.85 && ov.volumes.klantGestartGesprekken < n * 0.95, ov.volumes);
    ck(`${n} leads: de herbezorgingen zijn allemaal geblokkeerd (${sim.dubbelGeblokkeerd})`, sim.dubbelGeblokkeerd > 0 && ov.veiligheid.duplicatenGeblokkeerd === sim.dubbelGeblokkeerd, [sim.dubbelGeblokkeerd, ov.veiligheid]);
    // Een derde betaald klinkt veel, maar het is een aandeel van een HOOP gratis berichten: per lead is het ~1 sjabloon.
    ck(`${n} leads: betaald aandeel blijft onder de 40% (${Math.round(ov.whatsapp.betaaldPercentage * 100)}%) en onder de 1,3 sjablonen per lead`, ov.whatsapp.betaaldPercentage < 0.4 && ov.efficiency.betaaldePerLead < 1.3, [ov.whatsapp.betaaldPercentage, ov.efficiency.betaaldePerLead]);
    ck(`${n} leads: schaalt lineair (${Math.round(sim.redisOpdrachten / n)} Redis-opdrachten per lead)`, sim.redisOpdrachten / n < 120, sim.redisOpdrachten / n);
  }
  const lineair = rijen.map((r) => r.sim.redisOpdrachten / r.n);
  ck('Redis-werk per lead blijft gelijk van 500 tot 5000 (geen kwadratisch gedrag)', Math.max(...lineair) / Math.min(...lineair) < 1.1, lineair);
  ck('5000 leads in een redelijke tijd', rijen[4].sim.ms < 30000, rijen[4].sim.ms);

  console.log('\n  volume | betaald% | gratis | betaald | Meta €  | AI $   | €/lead | €/100 leads | dubbel geblokkeerd');
  for (const r of rijen) {
    const w = r.ov.whatsapp;
    console.log(`  ${String(r.n).padStart(6)} | ${String(Math.round(w.betaaldPercentage * 100) + '%').padStart(8)} | ${String(w.gratisServiceberichten).padStart(6)} | ${String(w.betaaldGeschat).padStart(7)} | ${w.kostenBesteEur.toFixed(2).padStart(7)} | ${r.ov.ai.kostenUsd.toFixed(2).padStart(6)} | ${String(r.ov.kosten.perLeadEur).padStart(6)} | ${String(r.ov.kosten.per100LeadsEur).padStart(11)} | ${r.sim.dubbelGeblokkeerd}`);
  }

  const bd = rijen[3].sim.betaaldPerDoel;
  console.log(`\n  Betaalde sjablonen bij 3000 leads, naar doel: opvolging ${bd.followup}, herinnering ${bd.reminder}`);

  console.log('\nAlarmen');
  const mk = (uit, bet, tpl, leads, ai) => K.overzichtUit({ uit, uit_bill: bet, uit_vrij: uit - bet, tpl, leads, ai_n: ai, act_n: uit, act_bill: bet, in: uit });
  const basisO = Object.assign({ tenant: 'x' }, mk(400, 32, 32, 100, 200));
  const sprongO = Object.assign({ tenant: 'x' }, mk(100, 31, 31, 30, 60));
  const al = K.bepaalAlarmen(sprongO, basisO);
  ck('betaald aandeel van 8% naar 31% geeft een alarm', al.some((a) => a.soort === 'betaald_percentage' && /8%.*31%/.test(a.tekst)), al);
  ck('een rustige dag geeft geen alarm', K.bepaalAlarmen(Object.assign({ tenant: 'x' }, mk(100, 8, 8, 30, 60)), basisO).length === 0);
  const vl = Object.assign({ tenant: 'x' }, K.overzichtUit({ uit: 50, uit_vrij: 50, mismatch_betaald: 3, act_n: 50, in: 50 }));
  ck('"dachten gratis, Meta rekende" is een alarm', K.bepaalAlarmen(vl, null).some((a) => a.soort === 'venster_logica'));
  const geenData = Object.assign({ tenant: 'x' }, K.overzichtUit({ uit: 100, uit_vrij: 100, act_n: 2, in: 100 }));
  ck('verdwijnende Meta-factuurdata is een alarm', K.bepaalAlarmen(geenData, null).some((a) => a.soort === 'billing_data_ontbreekt'));
  const dure = Object.assign({ tenant: 'x' }, K.overzichtUit({ uit: 100, uit_bill: 100, tpl: 100, tpl_utility: 100, leads: 20, est_u: 100 * 40000, act_n: 100, act_bill: 100, in: 20 }));
  ck('kosten per lead boven de drempel', K.bepaalAlarmen(dure, null, { kostPerLeadMax: 0.1 }).some((a) => a.soort === 'kost_per_lead'));

  console.log('\nDagquota');
  K._reset(); hashes.clear(); strings.clear();
  process.env.WA_LIMIET_SJABLONEN = '3';
  for (let i = 0; i < 3; i++) await K.boekUitgaand('LIM', { soort: 'template', categorie: 'utility', vensterOpen: false, nu: NU });
  const rest = await K.resterend('LIM', null, NU);
  ck('quotum zichtbaar en op', rest.templateLeft === 0 && rest.outboundLeft > 1000, rest);
  ck('de router houdt het automatische sjabloon dan tegen',
    R.besluit({ purpose: 'followup', nowMs: NU, lastInboundMs: null, templateAvailable: true, limits: rest }).reden === 'dagquotum_sjablonen');
  delete process.env.WA_LIMIET_SJABLONEN;

  console.log('\nFaalt open zonder Redis');
  const urlWas = process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_URL;
  K._reset();
  await K.boekUitgaand('NOREDIS', { soort: 'service', vensterOpen: true, nu: NU });
  const zr = await K.overzicht('NOREDIS', '2026-10');
  ck('zonder Redis telt de geheugenkopie nog, zonder fout', zr.volumes.berichtenUit === 1, zr.volumes);
  process.env.UPSTASH_REDIS_REST_URL = urlWas;
  global.fetch = async () => { throw new Error('netwerk plat'); };
  let gooit = false;
  try { await K.boekUitgaand('PLAT', { soort: 'service', vensterOpen: true, nu: NU }); await K.boekAi('PLAT', { costUsd: 1 }); } catch (e) { gooit = true; }
  ck('een storing bij Redis laat een bericht nooit mislukken', gooit === false);

  console.log('\nAangesloten op de bestaande paden');
  const bron = (f) => fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
  ck('sendWA boekt het antwoord als gratis service', /boekUitgaand\(boekCtx\.projectCode, \{\s*soort: 'service', vensterOpen: true/.test(bron('whatsapp.js')));
  ck('het hoofdantwoord geeft de dealer mee', /sendWA\(phone, replyText, clientPhoneNumberId, \{ projectCode \}\)/.test(bron('whatsapp.js')));
  ck('inkomende berichten worden geteld', /boekInkomend\(projectCode/.test(bron('whatsapp.js')));
  ck('Meta-factuurstatus wordt vóór de vroege return van "sent" opgevangen', bron('whatsapp.js').indexOf('boekStatus(status') < bron('whatsapp.js').indexOf("if (state === 'sent') return;"));
  ck('sjablonen en vrije berichten via de ene deur worden geboekt', /boekKosten\(projectCode, \{ soort: 'service'/.test(bron('_wa-send.js')) && /soort: 'template'/.test(bron('_wa-send.js')));
  ck('AI-gebruik gaat naar de duurzame boekhouding', /_wa-kosten'\)\.boekAi/.test(bron('_ai/usage.js')));
  ck('de cron beslist via de router en gebruikt één venstersdefinitie', /_waRouter\.besluit\(\{\s*purpose: 'followup'/.test(bron('cron-followup.js')) && /_waRouter\.venster\(lastInboundMs/.test(bron('cron-followup.js')));
  ck('adminmodus wa-kosten bestaat achter de admincontrole', /mode === 'wa-kosten'[\s\S]{0,200}isValidAdminToken/.test(bron('admin.js')));

  console.log(`\n  ${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
