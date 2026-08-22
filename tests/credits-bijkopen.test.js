/*
 * Bijgekochte credits: krijgt de klant waarvoor hij betaalt, en houdt hij het?
 *
 * ── Waarom deze test bestaat ────────────────────────────────────────────────
 * Bijkopen werkte door de VERBRUIKSTELLER te verlagen: `used = max(0, used - n)`.
 * Er was geen saldo, alleen een teller. Zolang je meer verbruikt had dan je
 * bijkocht klopte de uitkomst toevallig, en dat is precies het geval dat getest
 * werd (1.000 verbruikt, 600 bijgekocht). Daarbuiten:
 *
 *   400 verbruikt, 6.000 gekocht  ->  used = 0.   De klant betaalde voor 6.000
 *                                                  en kreeg 400 ruimte terug.
 *   0 verbruikt, 6.000 gekocht    ->  used = 0.   Hij kreeg NIETS.
 *
 * En wat er wel bij kwam verdween bij de maandelijkse reset, want die zet de
 * teller op nul -- inclusief de ruimte die de aankoop daar had achtergelaten.
 *
 * Deze test legt de drie eigenschappen vast die dat onmogelijk maken:
 *   1. wat je koopt krijg je, ongeacht wat je al verbruikt had;
 *   2. het telt OP bij de maandlimiet, het vervangt hem niet;
 *   3. het overleeft de periodereset.
 */
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE  = 'patZelftest';

const BASE = require('path').join(__dirname, '..') + '/';
const credits = require(BASE + 'api/_credits.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

/* summarize() is niet geëxporteerd -- het is intern. checkCredits() is de deur
   die de rest van de app gebruikt, dus daar wordt doorheen getest: dat bewijst
   ook meteen dat de poort zelf het bijgekochte saldo meeneemt. */
function klantRij({ allowance = 3000, used = 0, purchased = 0, status = 'active', periodeStart = new Date().toISOString() } = {}) {
  return {
    id: 'recKLANT',
    fields: {
      'Project Code': 'TENANT_A',
      'Credit Allowance': allowance,
      'Credits Used': used,
      'Credit Purchased': purchased,
      'Credit Period': JSON.stringify({ start: periodeStart }),
      'Plan Status': status,
    },
  };
}

let laatstePatch = null;
let veldBestaat = true;

function nepAirtable(rij) {
  laatstePatch = null;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if ((opts.method || 'GET') === 'PATCH') {
      const body = JSON.parse(opts.body || '{}');
      /* Airtable weigert een HELE patch zodra er één onbekend veld in staat.
         Dat is de val die in deze codebase al eens een teller stil heeft laten
         stoppen met tellen, en het is precies wat er gebeurt zolang de eigenaar
         het nieuwe veld nog niet heeft aangemaakt. */
      if (!veldBestaat && Object.keys(body.fields || {}).includes('Credit Purchased')) {
        return { ok: false, status: 422,
                 text: async () => '{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"Credit Purchased\\""}}',
                 json: async () => ({ error: { type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "Credit Purchased"' } }) };
      }
      laatstePatch = body.fields;
      Object.assign(rij.fields, body.fields);
      return { ok: true, status: 200, json: async () => ({ id: rij.id, fields: rij.fields }), text: async () => '{}' };
    }
    if (/tblPidTrwGRzRt4LZ/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ records: [rij] }), text: async () => '' };
    }
    // Grootboek: leeg, zodat de dubbelboeking-controle niets vindt.
    return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
  };
}

(async () => {
  console.log('\n— je krijgt waarvoor je betaalt —');

  // Het geval dat vroeger toevallig goed ging.
  let rij = klantRij({ allowance: 3000, used: 1000 });
  nepAirtable(rij);
  await credits.addCredits('TENANT_A', 600, { reference: 'stripe:a1' });
  let c = await credits.checkCredits('TENANT_A', credits.FEATURES.IMAGE_GENERATION);
  ck('3000 limiet, 1000 verbruikt, 600 gekocht -> 2600 over', c.remaining === 2600, c);

  // Het geval dat vroeger geld liet verdampen.
  rij = klantRij({ allowance: 3000, used: 400 });
  nepAirtable(rij);
  await credits.addCredits('TENANT_A', 6000, { reference: 'stripe:a2' });
  c = await credits.checkCredits('TENANT_A', credits.FEATURES.IMAGE_GENERATION);
  ck('3000 limiet, 400 verbruikt, 6000 gekocht -> 8600 over (was: 3000)',
     c.remaining === 8600, c);

  // Het ergste geval: kopen vlak na een reset.
  rij = klantRij({ allowance: 3000, used: 0 });
  nepAirtable(rij);
  await credits.addCredits('TENANT_A', 6000, { reference: 'stripe:a3' });
  c = await credits.checkCredits('TENANT_A', credits.FEATURES.IMAGE_GENERATION);
  ck('niets verbruikt, 6000 gekocht -> 9000 over (was: 3000, de aankoop verdween)',
     c.remaining === 9000, c);

  console.log('\n— en je houdt het —');
  rij = klantRij({ allowance: 3000, used: 2500, purchased: 5000 });
  nepAirtable(rij);
  await credits.resetPeriod('TENANT_A');
  ck('de periodereset zet het verbruik op nul', rij.fields['Credits Used'] === 0, rij.fields);
  ck('maar raakt het bijgekochte saldo NIET aan',
     rij.fields['Credit Purchased'] === 5000, rij.fields);
  ck('en de reset schrijft dat veld ook niet mee',
     laatstePatch && !('Credit Purchased' in laatstePatch), laatstePatch);

  console.log('\n— de limiet houdt rekening met wat je bijkocht —');
  rij = klantRij({ allowance: 3000, used: 3000, purchased: 0 });
  nepAirtable(rij);
  c = await credits.checkCredits('TENANT_A', credits.FEATURES.IMAGE_GENERATION);
  ck('op de limiet zonder bijkoop: geblokkeerd', c.allowed === false, c);

  rij = klantRij({ allowance: 3000, used: 3000, purchased: 2000 });
  nepAirtable(rij);
  c = await credits.checkCredits('TENANT_A', credits.FEATURES.IMAGE_GENERATION);
  ck('op de limiet MAAR met 2000 bijgekocht: gewoon door', c.allowed === true, c);
  ck('en er staat 2000 open', c.remaining === 2000, c);

  console.log('\n— een opgezegde klant verbruikt niets meer —');
  for (const status of ['cancelled', 'expired']) {
    rij = klantRij({ allowance: 20000, used: 0, status });
    nepAirtable(rij);
    c = await credits.checkCredits('TENANT_A', credits.FEATURES.IMAGE_GENERATION);
    ck(`status "${status}": beeldgeneratie geweigerd`, c.allowed === false, c);
    ck(`   met een reden en een weg vooruit`,
       c.reason === 'plan_stopped' && /plan/i.test(c.message || ''), c);
  }
  /* Maar de lead van die klant hoort geen stilte te krijgen. Dat is zijn schuld
     niet, en een stilgevallen gesprek is het ergste wat dit product kan doen. */
  rij = klantRij({ allowance: 20000, used: 0, status: 'cancelled' });
  nepAirtable(rij);
  c = await credits.checkCredits('TENANT_A', credits.FEATURES.WHATSAPP_CONVERSATION);
  ck('maar een leadgesprek loopt gewoon door', c.allowed === true, c);

  console.log('\n— zolang het veld nog niet in Airtable staat —');
  /* De eigenaar moet "Credit Purchased" nog aanmaken. Tot dan mag een betaling
     niet ronduit mislukken -- de klant heeft al betaald. Hij valt terug op de
     oude telling, en dat gaat luid het log in. */
  veldBestaat = false;
  rij = klantRij({ allowance: 3000, used: 1000 });
  nepAirtable(rij);
  let ging = true;
  try { await credits.addCredits('TENANT_A', 600, { reference: 'stripe:b1' }); }
  catch (e) { ging = false; }
  ck('de bijschrijving mislukt niet', ging === true);
  ck('en valt terug op de oude telling', rij.fields['Credits Used'] === 400, rij.fields);
  veldBestaat = true;

  console.log('\n— dezelfde betaling twee keer telt één keer —');
  /* Stripe stuurt een webhook opnieuw als hij geen 200 kreeg. Deze controle
     stond er al en moet blijven staan; hij wordt hier bewaakt omdat de weg
     eromheen net herschreven is. */
  rij = klantRij({ allowance: 3000, used: 1000 });
  let grootboek = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if ((opts.method || 'GET') === 'PATCH') {
      Object.assign(rij.fields, JSON.parse(opts.body || '{}').fields);
      return { ok: true, status: 200, json: async () => ({ fields: rij.fields }), text: async () => '{}' };
    }
    if (/tblPidTrwGRzRt4LZ/.test(u)) return { ok: true, status: 200, json: async () => ({ records: [rij] }), text: async () => '' };
    if ((opts.method || 'GET') === 'POST') {
      grootboek.push(JSON.parse(opts.body || '{}'));
      return { ok: true, status: 200, json: async () => ({ id: 'recTX' }), text: async () => '{}' };
    }
    // Grootboek-zoekopdracht: geef terug wat er al geboekt is.
    const ref = decodeURIComponent(u).match(/"(stripe:[^"]+)"/);
    const treffer = ref && grootboek.length ? [{ id: 'recTX', fields: { Referentie: ref[1] } }] : [];
    return { ok: true, status: 200, json: async () => ({ records: treffer }), text: async () => '' };
  };
  await credits.addCredits('TENANT_A', 600, { reference: 'stripe:zelfde', type: 'purchase' });
  const naEerste = rij.fields['Credit Purchased'];
  await credits.addCredits('TENANT_A', 600, { reference: 'stripe:zelfde', type: 'purchase' });
  ck('de tweede keer schrijft niets bij', rij.fields['Credit Purchased'] === naEerste,
     { na1: naEerste, na2: rij.fields['Credit Purchased'] });

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
