/*
 * De AI-router.
 *
 * Draait volledig op de demo-provider, die het netwerk nooit aanraakt. Alles
 * wat hier getest wordt -- routering, fallback, escalatie, validatie, verbruik,
 * tenantgrenzen -- hangt niet van een leverancier af, en dat is precies het
 * deel dat stil kan breken.
 */
process.env.AI_PROVIDER_FORCE = 'demo';
process.env.AI_CONFIDENCE_MIN = '0.65';

const ai       = require('../api/_ai');
const router   = require('../api/_ai/router');
const registry = require('../api/_ai/registry');
const tasks    = require('../api/_ai/tasks');
const usage    = require('../api/_ai/usage');
const validate = require('../api/_ai/validate');
const qual     = require('../api/_ai/qualification');

const { TASKS } = tasks;
const { TIERS } = registry;

let pass = 0, fail = 0;
function ck(naam, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${naam}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}
async function gooit(naam, fn, code) {
  try { await fn(); ck(naam, false, 'geen fout'); }
  catch (e) { ck(naam, e && e.code === code, { kreeg: e && e.code, verwacht: code, msg: e && e.message }); }
}

const ctx  = { projectCode: 'TELJO',  userId: 'u1' };
const them = { projectCode: 'ANDERE', userId: 'u2' };

// De logregel per aanroep is nuttig in productie en ruis in een test.
const echteLog = console.log;
function stilLoggen(aan) {
  console.log = aan ? echteLog : function (...a) {
    if (String(a[0]) === '[ai]') return;
    echteLog.apply(console, a);
  };
}

(async () => {
  stilLoggen(false);

  console.log('\n— taken worden naar de juiste tier gestuurd —');
  const verwacht = {
    [TASKS.LEAD_CLASSIFICATION]:   TIERS.CHEAP,
    [TASKS.LEAD_EXTRACTION]:       TIERS.CHEAP,
    [TASKS.SUMMARIZE]:             TIERS.CHEAP,
    [TASKS.WHATSAPP_CONVERSATION]: TIERS.CONVERSATIONAL,
    [TASKS.CUSTOMER_QUESTION]:     TIERS.CONVERSATIONAL,
    [TASKS.COMPLEX_REASONING]:     TIERS.REASONING,
    [TASKS.PROPERTY_ANALYSIS]:     TIERS.VISION,
    [TASKS.IMAGE_GENERATION]:      TIERS.IMAGE,
    [TASKS.VIDEO_GENERATION]:      TIERS.VIDEO,
  };
  for (const [taak, tier] of Object.entries(verwacht)) {
    ck(`${taak} -> ${tier}`, tasks.routeVoor(taak).tier === tier, tasks.routeVoor(taak));
  }
  await gooit('een onbekende taak is een fout, geen gok',
    async () => tasks.routeVoor('bestaat_niet'), 'unknown_task');

  console.log('\n— een tenant is verplicht —');
  // Een lege projectcode leest elders als "admin, toon alles"; verbruik zonder
  // tenant is verbruik dat je niet terugvindt als de rekening komt.
  await gooit('zonder tenant weigert de router',
    () => router.generateText({ task: TASKS.SUMMARIZE, ctx: {}, messages: [{ role: 'user', content: 'hoi' }] }),
    'no_tenant');
  await gooit('een lege projectcode telt niet als tenant',
    () => router.generateText({ task: TASKS.SUMMARIZE, ctx: { projectCode: '   ' }, messages: [] }),
    'no_tenant');

  console.log('\n— gewone tekst —');
  usage._reset();
  const a = await router.generateText({ task: TASKS.WHATSAPP_CONVERSATION, ctx,
    messages: [{ role: 'user', content: 'hallo' }] });
  ck('geeft tekst terug', a.text.length > 0, a);
  ck('en zegt welk model het was', !!a.model && !!a.provider, a);
  ck('zonder te escaleren', a.escaleerd === false, a);

  console.log('\n— gestructureerd: alleen een geldig antwoord telt —');
  const schema = qual.EXTRACTIE_SCHEMA;
  const b = await router.generateText({ task: TASKS.LEAD_EXTRACTION, ctx, schema,
    messages: [{ role: 'user', content: '__json__' }] });
  ck('JSON in een codeblok wordt eruit gehaald', b.data && b.data.budget === 300000, b.data);
  ck('en de zekerheid komt mee', b.data.confidence === 0.94, b.data);

  await gooit('kapotte JSON wordt niet doorgelaten',
    () => router.generateText({ task: TASKS.LEAD_EXTRACTION, ctx, schema,
      messages: [{ role: 'user', content: '__kapotte_json__' }] }), 'schema_invalid');

  await gooit('een ontbrekend verplicht veld ook niet',
    () => router.generateText({ task: TASKS.LEAD_EXTRACTION, ctx,
      schema: { budget: { type: 'number', verplicht: true }, confidence: { type: 'number', verplicht: true },
                timeline_months: { type: 'integer', verplicht: true } },
      messages: [{ role: 'user', content: '__mist_veld__' }] }), 'schema_invalid');

  console.log('\n— escalatie gebeurt op BEWIJS —');
  // Een model dat zelf zegt dat het twijfelt (0.2 < 0.65) is bewijs; een lang
  // bericht is dat niet.
  await gooit('een te onzeker antwoord wordt afgekeurd',
    () => router.generateText({ task: TASKS.LEAD_EXTRACTION, ctx, schema,
      messages: [{ role: 'user', content: '__onzeker__' }] }), 'schema_invalid');
  ck('en die taak MAG escaleren', tasks.routeVoor(TASKS.LEAD_EXTRACTION).escaleerbaar === true, null);
  ck('maar beeld niet -- daar is geen duurdere denkstap',
     tasks.routeVoor(TASKS.IMAGE_GENERATION).escaleerbaar === false, null);
  ck('en video ook niet', tasks.routeVoor(TASKS.VIDEO_GENERATION).escaleerbaar === false, null);

  console.log('\n— fallback bij een provider die omvalt —');
  await gooit('een provider die faalt geeft uiteindelijk een eerlijke fout',
    () => router.generateText({ task: TASKS.SUMMARIZE, ctx,
      messages: [{ role: 'user', content: '__faal__' }] }), 'provider_error');
  await gooit('een leeg antwoord telt als mislukt',
    () => router.generateText({ task: TASKS.SUMMARIZE, ctx,
      messages: [{ role: 'user', content: '__leeg__' }] }), 'empty_response');

  console.log('\n— verbruik wordt per tenant bijgehouden —');
  usage._reset();
  await router.generateText({ task: TASKS.WHATSAPP_CONVERSATION, ctx, messages: [{ role: 'user', content: 'a' }] });
  await router.generateText({ task: TASKS.WHATSAPP_CONVERSATION, ctx, messages: [{ role: 'user', content: 'b' }] });
  await router.generateText({ task: TASKS.SUMMARIZE, ctx: them, messages: [{ role: 'user', content: 'c' }] });

  const mij = usage.voorTenant('TELJO');
  const zij = usage.voorTenant('ANDERE');
  ck('mijn tenant telt twee aanroepen', mij.requests === 2, mij);
  ck('de andere tenant een', zij.requests === 1, zij);
  ck('en ze lopen niet door elkaar',
     mij.byTask.whatsapp_conversation.requests === 2 && !mij.byTask.summarize, mij.byTask);
  ck('tokens worden opgeteld', mij.inputTokens > 0 && mij.outputTokens > 0, mij);
  ck('een onbekende tenant geeft niets', usage.voorTenant('BESTAATNIET') === null, null);

  console.log('\n— kosten —');
  ck('een bekend model heeft een prijs',
     registry.kostenUsd({ model: 'claude-haiku-4-5-20251001', inputTokens: 1e6, outputTokens: 0 }) === 1.00, null);
  ck('sonnet is duurder dan haiku',
     registry.kostenUsd({ model: 'claude-sonnet-5', inputTokens: 1e6, outputTokens: 0 })
     > registry.kostenUsd({ model: 'claude-haiku-4-5-20251001', inputTokens: 1e6, outputTokens: 0 }), null);
  ck('een onbekend model geeft null, geen verzonnen getal',
     registry.kostenUsd({ model: 'model-dat-niet-bestaat', inputTokens: 1e6 }) === null, null);

  console.log('\n— het register verzint geen model-ids —');
  // Google en OpenRouter staan leeg omdat hun ids niet te verifieren waren.
  ck('google heeft geen ingevuld tekstmodel',
     registry.modelVoor('google', TIERS.CHEAP) === '', registry.modelVoor('google', TIERS.CHEAP));
  ck('en doet dus niet mee in de keten', registry.kanTier('google', TIERS.CHEAP) === false, null);
  ck('anthropic wel, want dat model draait hier al',
     registry.modelVoor('anthropic', TIERS.CONVERSATIONAL).indexOf('claude') === 0, null);
  ck('watOntbreekt zegt wat er mist',
     registry.watOntbreekt(TIERS.VIDEO).some((x) => x.mist.length > 0), registry.watOntbreekt(TIERS.VIDEO));

  console.log('\n— validatie los —');
  ck('JSON met tekst eromheen wordt gevonden',
     validate.haalJson('Hier is het: {"a":1} -- klaar').a === 1, null);
  ck('een tweede { in een zin erna breekt het niet',
     validate.haalJson('{"a":1} en dan nog {iets}').a === 1, null);
  ck('onzin geeft null', validate.haalJson('geen json hier') === null, null);
  ck('een getal buiten bereik wordt afgekeurd',
     validate.valideer({ n: 500 }, { n: { type: 'number', verplicht: true, max: 100 } }).ok === false, null);
  ck('een waarde buiten de opsomming ook',
     validate.valideer({ s: 'paars' }, { s: { type: 'string', verplicht: true, enum: ['rood', 'blauw'] } }).ok === false, null);

  console.log('\n— kwalificatie is van de REGELS, niet van het model —');
  const goed = qual.beoordeel({ budget: 400000, timeline_months: 3, mortgage_required: true,
    bedrooms: 3, intent: 'high', phone: '+32470111111', confidence: 0.9 });
  ck('een compleet dossier kwalificeert', goed.uitkomst === qual.UITKOMST.GEKWALIFICEERD, goed);
  ck('en krijgt een navertelbare score', goed.score > 5 && goed.score <= 10, goed.score);

  const teLaag = qual.beoordeel({ budget: 60000, timeline_months: 2, phone: '+32470111111', confidence: 0.9 });
  ck('een te laag budget wordt afgewezen', teLaag.uitkomst === qual.UITKOMST.AFGEWEZEN, teLaag);
  ck('met de reden erbij', teLaag.redenen.indexOf(qual.REDEN.BUDGET_TE_LAAG) !== -1, teLaag.redenen);

  const onbekend = qual.beoordeel({ phone: '+32470111111', confidence: 0.9 });
  ck('ontbrekende gegevens zijn TWIJFEL, geen afwijzing',
     onbekend.uitkomst === qual.UITKOMST.TWIJFEL, onbekend);

  // Dit is het hele punt van de scheiding.
  const poging = qual.beoordeel({ budget: 60000, timeline_months: 2, phone: '+32470111111',
    confidence: 0.99, intent: 'high', qualified: true, uitkomst: 'gekwalificeerd' });
  ck('een lead kan zichzelf niet kwalificeren via het model',
     poging.uitkomst === qual.UITKOMST.AFGEWEZEN, poging);

  const strenger = qual.beoordeel({ budget: 200000, timeline_months: 3, phone: '+32470111111', confidence: 0.9 },
    { minBudget: 300000 });
  ck('regels zijn per tenant instelbaar', strenger.uitkomst === qual.UITKOMST.AFGEWEZEN, strenger);

  console.log('\n— de hele weg, van gesprek tot oordeel —');
  usage._reset();
  const eind = await ai.qualifyLead({ ctx, conversation: '__json__', phone: '+32470111111' });
  ck('velden komen van het model', eind.velden.budget === 300000, eind.velden);
  ck('het oordeel komt van de regels', eind.uitkomst === qual.UITKOMST.GEKWALIFICEERD, eind.uitkomst);
  ck('en de gebruikte prompt staat erbij', eind.prompt === 'lead_extraction_v1', eind.prompt);
  ck('het verbruik is geboekt op de juiste tenant', usage.voorTenant('TELJO').requests === 1, null);

  console.log('\n— transformatie-opdracht houdt het pand herkenbaar —');
  const brief = ai.buildTransformationBrief({
    analyse: { room_type: 'woonkamer', materials: ['eiken', 'beton'], camera_perspective: 'vanaf de deur' },
    stijl: 'japandi', wensen: { colors: 'warm beige' } });
  for (const moet of ['camerahoek', 'ramen', 'deuren', 'structurele', 'plattegrond']) {
    ck(`de opdracht beschermt "${moet}"`, brief.prompt.toLowerCase().includes(moet), null);
  }
  ck('de stijl staat erin', /japandi/i.test(brief.prompt), null);
  ck('en een onbekende stijl valt terug op modern',
     /modern/i.test(ai.buildTransformationBrief({ stijl: 'onzin' }).prompt), null);

  stilLoggen(true);
  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
