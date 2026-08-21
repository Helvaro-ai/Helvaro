// Serialisatie per klant, en de videoprijs.
process.env.API_AIRTABLE='stub'; process.env.BASE_AIRTABLE='stub';
const BASE=require('path').join(__dirname,'..')+'/';

// Een nagebootste Airtable die de race ZOU laten zien: lezen duurt even, en
// schrijven overschrijft blind. Zonder serialisatie verdwijnt er een boeking.
let used = 0, reads = 0, writes = 0, inFlight = 0, maxInFlight = 0;
/* Alleen lezingen van de KLANTRIJ tellen mee voor inFlight.

   Sinds api/_ledger.js bestaat leest recordUsage ook het grootboek, en die
   lezing valt buiten het geserialiseerde stuk (hij is fire-and-forget, zodat
   het grootboek een WhatsApp-antwoord nooit vertraagt). Die lezing overlapt
   dus met de volgende boeking -- en dat is prima: wat NIET mag overlappen is
   het lezen-en-terugschrijven van de TELLER, want daar verdwijnt anders een
   boeking. Deze test mat eerder "geen enkele GET overlapt" als benadering
   daarvan; die benadering klopte tot er een tweede soort GET bij kwam. */
function isKlantLezing(url) {
  return !String(url).includes('credit_transactions');
}

global.fetch = async (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  if (method === 'GET' && !isKlantLezing(url)) {
    // grootboek: bestaat niet in deze test, en telt niet mee.
    return { ok:false, status:404, json: async () => ({}), text: async () => '' };
  }
  if (method === 'GET') {
    inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); reads++;
    const snapshot = used;
    await new Promise(r => setTimeout(r, 20));   // leesvertraging
    inFlight--;
    return { ok:true, status:200, json: async () => ({ records:[{ id:'rec1', fields:{
      'Credit Allowance': 100000, 'Credits Used': snapshot,
      'Credit Period': JSON.stringify({start:new Date().toISOString()}),
      'Credit Usage By Feature': '{}',
    }}]}), text: async () => '' };
  }
  if (method === 'PATCH') {
    writes++;
    const body = JSON.parse(opts.body);
    used = body.fields['Credits Used'];
    return { ok:true, status:200, json: async () => ({}), text: async () => '' };
  }
  return { ok:true, status:200, json: async () => ({}), text: async () => '' };
};

const c = require(BASE+'api/_credits.js');
let pass=0, fail=0;
const ck=(n,ok,got)=>{console.log(`  ${ok?'OK  ':'FOUT'}  ${n}${ok?'':'  → '+JSON.stringify(got)}`);ok?pass++:fail++;};

(async () => {
  console.log('\n— videoprijs —');
  ck('8s 720p kost 240',            c.creditsForVideo({seconds:8,size:'1280x720'}) === 240, c.creditsForVideo({seconds:8,size:'1280x720'}));
  ck('breed formaat kost meer',     c.creditsForVideo({seconds:8,size:'1792x1024'}) === 400, c.creditsForVideo({seconds:8,size:'1792x1024'}));
  ck('duur telt mee',               c.creditsForVideo({seconds:4}) === 120, c.creditsForVideo({seconds:4}));
  ck('onzin valt terug op 8s',      c.creditsForVideo({seconds:'nonsens'}) === 240, c.creditsForVideo({seconds:'nonsens'}));
  ck('duur is begrensd op 60s',     c.creditsForVideo({seconds:9999}) === 60*30, c.creditsForVideo({seconds:9999}));
  ck('een video kost meer dan 7 leadgesprekken', c.creditsForVideo({}) > 7*c.WEIGHTS[c.FEATURES.WHATSAPP_CONVERSATION], null);

  console.log('\n— chat wordt op echt verbruik afgerekend —');
  const klein = c.creditsForChatTurn({inputTokens:3000, outputTokens:500, model:'claude-haiku-4-5-20251001'});
  const zwaar = c.creditsForChatTurn({inputTokens:60000, outputTokens:4000, model:'claude-haiku-4-5-20251001'});
  ck('een korte vraag blijft op het minimum', klein.credits === c.WEIGHTS[c.FEATURES.FARO_CHAT], klein);
  ck('een zware beurt kost meer dan een korte', zwaar.credits > klein.credits, {klein:klein.credits, zwaar:zwaar.credits});
  ck('en er hangt een echte kostprijs aan',    zwaar.costEur > 0 && zwaar.priced === true, zwaar);
  // Dit is het hele punt: 8 gereedschapsrondes kostten evenveel als één regel.
  ck('zwaar is minstens 4x het oude platte tarief', zwaar.credits >= 4 * c.WEIGHTS[c.FEATURES.FARO_CHAT], zwaar);

  console.log('\n— elk model dat Faro echt gebruikt heeft een prijs —');
  // Sonnet is het standaardmodel en Opus is "Precies". Stonden die op null,
  // dan viel juist de MEERDERHEID van de beurten terug op het platte tarief.
  for (const m of ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5']) {
    const r = c.creditsForChatTurn({inputTokens:10000, outputTokens:700, model:m});
    ck(m + ' wordt echt geprijsd', r.priced === true && r.costEur > 0, r);
  }
  // Duurder model = duurdere beurt, bij exact hetzelfde verbruik.
  const opHaiku  = c.creditsForChatTurn({inputTokens:10000, outputTokens:700, model:'claude-haiku-4-5-20251001'});
  const opSonnet = c.creditsForChatTurn({inputTokens:10000, outputTokens:700, model:'claude-sonnet-5'});
  const opOpus   = c.creditsForChatTurn({inputTokens:10000, outputTokens:700, model:'claude-opus-5'});
  ck('duurder model kost meer credits',
     opOpus.credits > opSonnet.credits && opSonnet.credits > opHaiku.credits,
     {haiku: opHaiku.credits, sonnet: opSonnet.credits, opus: opOpus.credits});

  console.log('\n— onbekende prijs rekent niet stilzwijgend te weinig —');
  // Een model dat hier NIET in MODEL_PRICES staat. Dit gebeurt echt zodra er
  // een nieuw model wordt aangezet en niemand aan de prijstabel denkt.
  const onbekend = c.creditsForChatTurn({inputTokens:60000, outputTokens:4000, model:'claude-toekomst-9'});
  ck('valt terug op het platte tarief', onbekend.credits === c.WEIGHTS[c.FEATURES.FARO_CHAT], onbekend);
  ck('en markeert zichzelf als niet-geprijsd', onbekend.priced === false, onbekend);
  ck('zonder een kostprijs te verzinnen',      onbekend.costEur === null, onbekend);

  console.log('\n— gelijktijdige boekingen voor DEZELFDE klant —');
  used = 0; reads = 0; writes = 0; maxInFlight = 0;
  await Promise.all([1,2,3,4,5].map(() =>
    c.recordUsage('KLANT_A', c.FEATURES.FARO_CHAT, { credits: 3 })));
  ck('alle vijf boekingen geteld (5 x 3 = 15)', used === 15, {used, reads, writes});
  ck('lezen gebeurde niet door elkaar heen',    maxInFlight === 1, {maxInFlight});

  console.log('\n— twee klanten blokkeren elkaar niet —');
  used = 0; maxInFlight = 0;
  const t0 = Date.now();
  await Promise.all([
    c.recordUsage('KLANT_B', c.FEATURES.FARO_CHAT, { credits: 3 }),
    c.recordUsage('KLANT_C', c.FEATURES.FARO_CHAT, { credits: 3 }),
  ]);
  ck('parallel, dus niet twee keer de leesvertraging', Date.now()-t0 < 38, Date.now()-t0);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail?1:0);
})();
