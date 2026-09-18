/*
 * api/_ai/usage.js registreert sinds deze pas niet meer alleen tekst-
 * aanroepen (via de router), maar ook beeld, video en WhatsApp-sends -- met
 * een zelf meegegeven kostprijs (costUsdOverride/costEurOverride) in plaats
 * van registry.kostenUsd(), dat voor een videomodel of een WA-categorie toch
 * null zou teruggeven.
 *
 * Wat deze test bewaakt:
 *   - de bestaande tekst-weg (router.js) blijft ongewijzigd werken
 *   - een override wint altijd van registry.kostenUsd()
 *   - USD en EUR worden nooit bij elkaar opgeteld (twee aparte totalen)
 *   - alles.totaal.byKind splitst text/image/video/whatsapp uit elkaar
 */
'use strict';

const usage = require('../api/_ai/usage');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

(async () => {
  usage._reset();

  console.log('\n— de bestaande tekst-weg blijft werken ────────────────────');
  await usage.record({
    ctx: { projectCode: 'TELJO' }, task: 'lead_qualification', providerId: 'anthropic',
    model: 'claude-haiku-4-5-20251001', tier: 'cheap',
    inputTokens: 1000, outputTokens: 500, latencyMs: 800, status: 'ok',
  });
  let t = usage.voorTenant('TELJO');
  ck('een tekstaanroep telt mee', t.requests === 1, t);
  ck('en heeft een USD-kost uit de registry', t.costUsd > 0, t.costUsd);
  ck('kind valt terug op text', t.byKind.text && t.byKind.text.requests === 1, t.byKind);

  console.log('\n— beeld: costUsdOverride wint van de registry ─────────────');
  usage._reset();
  await usage.record({
    ctx: { projectCode: 'TELJO' }, task: 'image_generation', providerId: 'openai',
    model: 'gpt-image-2', kind: 'image', images: 1, quality: 'medium',
    costUsdOverride: 0.053, status: 'ok',
  });
  t = usage.voorTenant('TELJO');
  ck('de override-prijs is precies wat werd meegegeven', t.costUsd === 0.053, t.costUsd);
  ck('kind=image staat apart van text', t.byKind.image.requests === 1 && !t.byKind.text, t.byKind);

  console.log('\n— video: een model dat de registry niet kent, kost toch iets ─');
  usage._reset();
  await usage.record({
    ctx: { projectCode: 'DEALER1' }, task: 'video_generation', providerId: 'kling',
    model: 'kling-3', kind: 'video', costUsdOverride: 0.50, status: 'ok',
  });
  t = usage.voorTenant('DEALER1');
  ck('kling-3 staat niet in registry.PRICING, en toch een kost',
     require('../api/_ai/registry').kostenUsd({ model: 'kling-3' }) === null && t.costUsd === 0.50,
     { registryKende: require('../api/_ai/registry').kostenUsd({ model: 'kling-3' }), geregistreerd: t.costUsd });

  console.log('\n— WhatsApp: EUR en USD blijven twee aparte totalen ────────');
  usage._reset();
  await usage.record({
    ctx: { projectCode: 'DEALER1' }, task: 'whatsapp_template_send', providerId: 'meta',
    model: 'wa:utility', kind: 'whatsapp', costEurOverride: 0.04, status: 'ok',
  });
  t = usage.voorTenant('DEALER1');
  ck('costEur is gevuld', t.costEur === 0.04, t.costEur);
  ck('costUsd blijft op 0 -- er werd geen USD-prijs meegegeven, dus niets verzonnen', t.costUsd === 0, t.costUsd);

  console.log('\n— alles() splitst byKind correct op, over tenants heen ────');
  usage._reset();
  await usage.record({ ctx: { projectCode: 'A' }, task: 't', providerId: 'anthropic', model: 'claude-haiku-4-5', inputTokens: 100, outputTokens: 50, status: 'ok' });
  await usage.record({ ctx: { projectCode: 'B' }, task: 'image_generation', providerId: 'openai', model: 'gpt-image-2', kind: 'image', costUsdOverride: 0.05, status: 'ok' });
  await usage.record({ ctx: { projectCode: 'B' }, task: 'video_generation', providerId: 'kling', model: 'kling-3', kind: 'video', costUsdOverride: 0.5, status: 'ok' });
  const alles = usage.alles();
  ck('drie aanroepen, drie soorten', alles.totaal.byKind.text.requests === 1 && alles.totaal.byKind.image.requests === 1 && alles.totaal.byKind.video.requests === 1, alles.totaal.byKind);
  ck('en het totaal telt gewoon op', alles.totaal.requests === 3, alles.totaal.requests);
  ck('twee tenants staan los van elkaar', alles.tenants === 2 && Object.keys(alles.perTenant).sort().join(',') === 'A,B', alles.perTenant);

  console.log('\n— reference: een herhaalde registratie telt niet dubbel ───');
  usage._reset();
  await usage.record({
    ctx: { projectCode: 'DEALER1' }, task: 'video_generation', providerId: 'kling',
    model: 'kling-3', kind: 'video', costUsdOverride: 0.50, status: 'ok',
    reference: 'video:vid_abc',
  });
  // Zelfde scenario als api/_faro/media.js creditsVoorVideo(): twee
  // instanties zien dezelfde job tegelijk als 'ready' en registreren allebei
  // -- de tweede met dezelfde reference mag niet nogmaals optellen.
  await usage.record({
    ctx: { projectCode: 'DEALER1' }, task: 'video_generation', providerId: 'kling',
    model: 'kling-3', kind: 'video', costUsdOverride: 0.50, status: 'ok',
    reference: 'video:vid_abc',
  });
  t = usage.voorTenant('DEALER1');
  ck('een herhaalde reference telt maar één keer mee', t.requests === 1 && t.costUsd === 0.50, t);

  await usage.record({
    ctx: { projectCode: 'DEALER1' }, task: 'video_generation', providerId: 'kling',
    model: 'kling-3', kind: 'video', costUsdOverride: 0.50, status: 'ok',
    reference: 'video:vid_ANDERE',
  });
  t = usage.voorTenant('DEALER1');
  ck('een ANDERE reference telt wél apart mee', t.requests === 2 && t.costUsd === 1.00, t);

  usage._reset();
  await usage.record({ ctx: { projectCode: 'DEALER1' }, task: 'lead_qualification', providerId: 'anthropic', model: 'claude-haiku-4-5', inputTokens: 10, outputTokens: 5, status: 'ok' });
  await usage.record({ ctx: { projectCode: 'DEALER1' }, task: 'lead_qualification', providerId: 'anthropic', model: 'claude-haiku-4-5', inputTokens: 10, outputTokens: 5, status: 'ok' });
  t = usage.voorTenant('DEALER1');
  ck('zonder reference telt elke aanroep gewoon apart, zoals altijd', t.requests === 2, t);

  console.log('\n— een mislukte registratie werpt nooit ────────────────────');
  usage._reset();
  let threw = false;
  try {
    await usage.record({ ctx: null, task: undefined, model: undefined });
  } catch (e) { threw = true; }
  ck('record() gooit niet, ook niet met rare invoer', !threw, threw);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
