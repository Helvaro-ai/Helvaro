// Serialisatie per klant, en de videoprijs.
process.env.API_AIRTABLE='stub'; process.env.BASE_AIRTABLE='stub';
const BASE=require('path').join(__dirname,'..')+'/';

// Een nagebootste Airtable die de race ZOU laten zien: lezen duurt even, en
// schrijven overschrijft blind. Zonder serialisatie verdwijnt er een boeking.
let used = 0, reads = 0, writes = 0, inFlight = 0, maxInFlight = 0;
global.fetch = async (url, opts) => {
  const method = (opts && opts.method) || 'GET';
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
