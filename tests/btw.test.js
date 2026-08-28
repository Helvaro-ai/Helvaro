/*
 * Eén bedrijf, één account — afgedwongen op het moment dat er betaald wordt.
 *
 * ── De keuzes die hier bewaakt worden ───────────────────────────────────────
 *
 * 1. Het btw-nummer wordt gevraagd bij het ABONNEMENT, niet bij het aanmaken
 *    van een account. Een proefaccount hoeft er geen. Bots tegenhouden gebeurt
 *    elders (Clerk + api/_signup-guard.js); btw-nummers zijn openbaar en
 *    filteren geen bots.
 *
 * 2. Normaliseren vóór alles. "BE 0123.456.749" en "0123456749" zijn hetzelfde
 *    bedrijf. Zonder dat is uniciteit een wassen neus: dan maak je gewoon een
 *    tweede account met puntjes erin.
 *
 * 3. VIES zegt "bestaat niet" -> weigeren. VIES antwoordt niet -> doorlaten en
 *    markeren. Een storing bij een EU-dienst mag geen betalende klant
 *    tegenhouden; dezelfde asymmetrie als in api/_credits.js.
 *
 * 4. Uniciteit met claim-then-verify. Airtable kent geen unieke index, dus
 *    "kijk of hij bestaat, schrijf hem dan weg" laat twee gelijktijdige
 *    aanvragen allebei door -- ze zien allebei niets. Eerst schrijven, dan
 *    terugkijken wie de oudste claim heeft, beslist door Airtable's eigen
 *    createdTime. Die test staat hieronder als een ECHTE race.
 */
'use strict';

process.env.API_AIRTABLE  = 'test-token';
process.env.BASE_AIRTABLE = 'test-base';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};

const vat = require('../api/_vat.js');

// ── Nagebootste Airtable met een echte tabel in het geheugen ────────────────
function bootsAirtableNa(rijen) {
  const db = new Map(rijen.map(r => [r.id, r]));
  let tijd = 0;
  global.fetch = async (url, opts) => {
    const u = String(url);
    // VIES
    if (u.indexOf('ec.europa.eu') !== -1) {
      if (global.__vies === 'stil') { await new Promise(r => setTimeout(r, 50)); throw new Error('netwerk'); }
      return { ok: true, status: 200, json: async () => ({ isValid: global.__vies !== 'ongeldig', name: 'Test BV' }) };
    }
    const m = /\/([a-zA-Z0-9]+)(\?|$)/.exec(u.split('/v0/test-base/')[1] ? '/' + u.split('/v0/test-base/')[1] : '');
    // PATCH op één record
    if (opts && opts.method === 'PATCH') {
      const id = u.split('/').pop();
      const velden = JSON.parse(opts.body).fields;
      const rij = db.get(id);
      if (!rij) return { ok: false, status: 404, text: async () => 'nf' };
      Object.assign(rij.fields, velden);
      if (!rij.createdTime) rij.createdTime = new Date(1700000000000 + (tijd++)).toISOString();
      return { ok: true, status: 200, json: async () => rij };
    }
    // GET met filterByFormula
    const f = decodeURIComponent((/filterByFormula=([^&]+)/.exec(u) || [])[1] || '');
    let uit = [...db.values()];
    let mm;
    if ((mm = /\{VAT\}="([^"]*)"/.exec(f)))          uit = uit.filter(r => (r.fields.VAT || '') === mm[1]);
    else if ((mm = /\{Project Code\}="([^"]*)"/.exec(f))) uit = uit.filter(r => r.fields['Project Code'] === mm[1]);
    return { ok: true, status: 200, json: async () => ({ records: uit }) };
  };
  return db;
}

(async () => {
  console.log('\n— normaliseren: dezelfde onderneming is hetzelfde nummer —');
  {
    const zelfde = ['BE 0123.456.749', 'be0123456749', '0123 456 749', 'BE-0123-456-749', '  BE0123456749  '];
    const uit = zelfde.map(v => vat.normaliseer(v));
    ck('vijf schrijfwijzen geven één nummer', new Set(uit).size === 1, uit.join(' | '));
    ck('en dat is BE0123456749', uit[0] === 'BE0123456749', uit[0]);
    ck('een Belg zonder de leidende nul telt niet als tweede bedrijf',
       vat.normaliseer('BE123456749') === 'BE0123456749', vat.normaliseer('BE123456749'));
    ck('zonder landcode wordt BE aangenomen (Vlaamse markt)',
       vat.normaliseer('0123456749') === 'BE0123456749', vat.normaliseer('0123456749'));
    ck('GR wordt EL, want zo heet het bij VIES',
       vat.normaliseer('GR123456789') === 'EL123456789', vat.normaliseer('GR123456789'));
    ck('leeg blijft leeg', vat.normaliseer('') === '' && vat.normaliseer(null) === '', null);
  }

  console.log('\n— de vorm wordt lokaal gecontroleerd —');
  {
    ck('een geldig Belgisch nummer',      vat.vormOk('BE0123456749').ok === true, null);
    ck('een geldig Nederlands nummer',    vat.vormOk('NL123456789B01').ok === true, null);
    ck('een cijfer te weinig faalt',      vat.vormOk('BE012345674').ok === false, null);
    ck('een niet-EU landcode faalt',      vat.vormOk('US123456789').ok === false, null);
    ck('en meldt dat als onbekend_land',  vat.vormOk('US123456789').reden === 'onbekend_land', null);
  }

  console.log('\n— VIES: een duidelijk NEE weigert, een storing niet —');
  {
    bootsAirtableNa([{ id: 'recA', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'TELJO' } }]);

    global.__vies = 'ongeldig';
    let r = await vat.controleerEnClaim({ projectCode: 'TELJO', vat: 'BE0123456749' });
    ck('VIES zegt nee -> geweigerd', r.ok === false && r.code === 'bestaat_niet', JSON.stringify(r));

    global.__vies = 'stil';
    r = await vat.controleerEnClaim({ projectCode: 'TELJO', vat: 'BE0123456749', viesTimeoutMs: 80 });
    ck('VIES ligt eruit -> tóch doorgelaten', r.ok === true, JSON.stringify(r));
    ck('maar gemarkeerd als ongecontroleerd', r.gecontroleerd === false, r.gecontroleerd);

    global.__vies = 'geldig';
    r = await vat.controleerEnClaim({ projectCode: 'TELJO', vat: 'BE0123456749' });
    ck('VIES zegt ja -> door en gecontroleerd', r.ok === true && r.gecontroleerd === true, JSON.stringify(r));
  }

  console.log('\n— een leeg of onzinnig nummer komt er niet door —');
  {
    bootsAirtableNa([{ id: 'recA', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'TELJO' } }]);
    global.__vies = 'geldig';
    for (const [invoer, code] of [['', 'ontbreekt'], ['   ', 'ontbreekt'], ['BE1', 'vorm'], ['US123456789', 'onbekend_land']]) {
      const r = await vat.controleerEnClaim({ projectCode: 'TELJO', vat: invoer });
      ck(`"${invoer || '(leeg)'}" -> ${code}`, r.ok === false && r.code === code, JSON.stringify(r));
    }
  }

  console.log('\n— hetzelfde nummer bij een tweede bedrijf wordt geweigerd —');
  {
    bootsAirtableNa([
      { id: 'recEerste', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'EERSTE', VAT: 'BE0123456749' } },
      { id: 'recTweede', createdTime: '2026-06-01T00:00:00Z', fields: { 'Project Code': 'TWEEDE' } },
    ]);
    global.__vies = 'geldig';
    const r = await vat.controleerEnClaim({ projectCode: 'TWEEDE', vat: 'BE 0123.456.749' });
    ck('geweigerd', r.ok === false && r.code === 'in_gebruik', JSON.stringify(r));
    ck('met een melding die uitlegt wat te doen',
       /al bij een ander Helvaro-account/.test(r.melding || ''), r.melding);
  }

  console.log('\n— en de eigenaar mag zijn eigen nummer opnieuw opgeven —');
  {
    bootsAirtableNa([
      { id: 'recA', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'TELJO', VAT: 'BE0123456749' } },
    ]);
    global.__vies = 'geldig';
    const r = await vat.controleerEnClaim({ projectCode: 'TELJO', vat: 'BE0123456749' });
    ck('geen "in gebruik" tegen jezelf', r.ok === true, JSON.stringify(r));
  }

  console.log('\n— de race: twee bedrijven tegelijk, hetzelfde nummer —');
  {
    /* Dit is waarom claim-then-verify bestaat. Kijken-dan-schrijven zou hier
       allebei doorlaten: op het moment van kijken heeft nog niemand iets. */
    const db = bootsAirtableNa([
      { id: 'recX', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'X' } },
      { id: 'recY', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'Y' } },
    ]);
    global.__vies = 'geldig';
    const [rx, ry] = await Promise.all([
      vat.controleerEnClaim({ projectCode: 'X', vat: 'BE0123456749' }),
      vat.controleerEnClaim({ projectCode: 'Y', vat: 'BE0123456749' }),
    ]);
    const geslaagd = [rx, ry].filter(r => r.ok).length;
    ck('precies één van de twee slaagt', geslaagd === 1, `X:${rx.ok} Y:${ry.ok}`);
    ck('de ander krijgt "in gebruik"',
       [rx, ry].some(r => !r.ok && r.code === 'in_gebruik'), JSON.stringify([rx.code, ry.code]));

    const metVat = [...db.values()].filter(r => (r.fields.VAT || '') === 'BE0123456749');
    ck('en er staat maar ÉÉN rij met dat nummer in de tabel',
       metVat.length === 1, metVat.map(r => r.id).join(','));
  }

  console.log('\n— een ontbrekend Airtable-veld meldt zich, en blokkeert niet stil —');
  {
    bootsAirtableNa([{ id: 'recA', createdTime: '2026-01-01T00:00:00Z', fields: { 'Project Code': 'TELJO' } }]);
    global.__vies = 'geldig';
    const echt = global.fetch;
    global.fetch = async (u, o) => {
      if (o && o.method === 'PATCH') return { ok: false, status: 422, text: async () => 'UNKNOWN_FIELD_NAME' };
      return echt(u, o);
    };
    const r = await vat.controleerEnClaim({ projectCode: 'TELJO', vat: 'BE0123456749' });
    ck('code veld_ontbreekt', r.ok === false && r.code === 'veld_ontbreekt', JSON.stringify(r));
    ck('en een melding zonder technisch jargon',
       !/Airtable|422|UNKNOWN/.test(r.melding || ''), r.melding);
  }

  console.log('\n— en de betaalroute vraagt er ook echt om —');
  {
    const leads = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/leads.js'), 'utf8');
    const i = leads.indexOf("body.mode === 'plan-checkout'");
    const blok = leads.slice(i, i + 2600);
    ck('plan-checkout roept controleerEnClaim aan', /controleerEnClaim\(/.test(blok), null);
    ck('vóór de Stripe-sessie wordt aangemaakt',
       blok.indexOf('controleerEnClaim') < blok.indexOf('createSubscription'), null);
    ck('een dubbel nummer geeft 409, de rest 400',
       /409 : 400/.test(blok), null);
    // Aanmelden mag er NIET om vragen.
    const guard = require('fs').readFileSync(require('path').join(__dirname, '..', 'api/_signup-guard.js'), 'utf8');
    ck('het aanmeldpad vraagt geen btw-nummer', !/\bvat\b/i.test(guard.replace(/private|innovat/gi, '')), null);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
