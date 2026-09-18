/*
 * Ledgerreferentie op elke afschrijving die er nog geen had.
 *
 * ── Waarom dit bestaat ────────────────────────────────────────────────────────
 * api/_credits.js's recordUsage() dedupliceert al op `opts.reference` --
 * bewezen door tests/stripe-webhook.test.js (Stripe-events) en
 * tests/credits-accounting.test.js (gelijktijdige boekingen binnen één
 * instantie via de serialize()-rij). Maar die twee dekken maar twee van de
 * ~10 plekken die recordUsage() aanroepen. De rest (AI-beeldgeneratie, de
 * founder-tools, reply-suggesties, de wekelijkse learning-cron, Faro's video-
 * en chatverbruik) had GEEN referentie -- dus buiten de serialize()-rij van
 * één instantie om (een tweede Vercel-instantie, of een echte HTTP-retry) kon
 * diezelfde generatie of dat gesprek dubbel geboekt worden.
 *
 * ── Twee soorten bewijs hieronder ─────────────────────────────────────────────
 * 1. FUNCTIONEEL: recordUsage() twee keer aanroepen met precies de referentie-
 *    VORM die elke plek nu produceert, tegen een nagebootste Airtable+grootboek
 *    (zelfde patroon als stripe-webhook.test.js), en meten dat er maar één
 *    boeking staat. Dit bewijst het onderliggende mechanisme voor elke
 *    referentie-familie, zonder de volledige aanroepketen (Faro's orchestrator,
 *    de wekelijkse cron, ...) na te moeten bouwen.
 * 2. STRUCTUREEL: de brontekst van elk bestand doorzoeken op de exacte
 *    `reference:`-regel die bij die recordUsage()-aanroep hoort, en dat die
 *    referentie is opgebouwd uit iets STABIELS (een id, een datum, een
 *    berichtenaantal) -- niet uit Math.random()/Date.now() binnen de
 *    afschrijving zelf, wat een 'referentie' zou zijn die bij elke aanroep
 *    toch weer anders is en dus niets dedupliceert.
 */
'use strict';

process.env.API_AIRTABLE  = 'stub';
process.env.BASE_AIRTABLE = 'stub';

const fs   = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

/* Zelfde nabootsing als tests/stripe-webhook.test.js's nepBase(): een
   grootboek dat écht op Reference dedupliceert, en een klantrij die altijd
   bruikbaar terugkomt. */
function nepBase() {
  const staat = { grootboek: [], patches: [] };
  global.fetch = async (url, init) => {
    const u = String(url);
    const method = (init && init.method) || 'GET';
    if (u.includes('credit_transactions')) {
      if (method === 'GET') {
        const ref = (decodeURIComponent(u).match(/\{Reference\}\s*=\s*"([^"]*)"/) || [])[1];
        const gevonden = ref ? staat.grootboek.filter((r) => r.ref === ref) : [];
        return { ok: true, status: 200, text: async () => '',
                 json: async () => ({ records: gevonden.map((r) => ({ id: 'rec' + r.ref, fields: {} })) }) };
      }
      const f = JSON.parse(init.body).fields;
      staat.grootboek.push({ ref: f['Reference'], type: f['Type'], credits: f['Credits'] });
      return { ok: true, status: 200, text: async () => '', json: async () => ({ id: 'recNieuw', fields: f }) };
    }
    if (method === 'PATCH') {
      staat.patches.push(JSON.parse(init.body).fields);
      return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
    }
    return { ok: true, status: 200, text: async () => '',
             json: async () => ({ records: [{ id: 'rec1', fields: {
               'Project Code': 'TELJO', 'Credit Allowance': 3000, 'Credits Used': 0,
               'Credit Period': JSON.stringify({ start: new Date().toISOString() }),
               'Credit Usage By Feature': '{}' } }] }) };
  };
  return staat;
}

async function tweeKeer(credits, reference) {
  await credits.recordUsage('TELJO', credits.FEATURES.IMAGE_GENERATION, { credits: 5, reference });
  await credits.recordUsage('TELJO', credits.FEATURES.IMAGE_GENERATION, { credits: 5, reference });
}

(async () => {
  console.log('\n— functioneel: elke referentie-vorm dedupliceert een herhaalde boeking —');
  {
    const families = [
      ['image:',               'image:job-abc123'],
      ['founder:advice:',      'founder:advice:req-1'],
      ['founder:chat:',        'founder:chat:req-2'],
      ['founder:content-post:', 'founder:content-post:req-3'],
      ['founder:personalized-dm:', 'founder:personalized-dm:req-4'],
      ['suggest:',             'suggest:recLead1:4'],
      ['learning:',            'learning:TELJO:2026-09-18'],
      ['video:',               'video:vid-job-9'],
      ['faro:',                'faro:conv-1:3'],
    ];
    for (const [naam, ref] of families) {
      delete require.cache[require.resolve(BASE + 'api/_credits.js')];
      delete require.cache[require.resolve(BASE + 'api/_ledger.js')];
      const staat = nepBase();
      const credits = require(BASE + 'api/_credits.js');
      await tweeKeer(credits, ref);
      ck(`${naam} referentie -- tweemaal aanroepen boekt één keer`,
         staat.grootboek.length === 1, staat.grootboek);
    }
  }

  console.log('\n— structureel: elke plek geeft nu echt een referentie mee —');
  {
    const gevallen = [
      { bestand: 'api/_images.js', omschrijving: 'AI-beeldgeneratie (property-generate)',
        anker: /credits\.recordUsage\(projectCode, credits\.FEATURES\.IMAGE_GENERATION, \{[\s\S]{0,300}?reference: `image:\$\{jobId\}`/ },
      { bestand: 'api/admin.js', omschrijving: 'founder ai-advice',
        anker: /credits\.recordUsage\(credits\.INTERNAL_PROJECT_CODE, credits\.FEATURES\.FOUNDER_AI_ADVICE, \{[\s\S]{0,200}?reference: `founder:advice:\$\{aiAdviceRequestId\}`/ },
      { bestand: 'api/admin.js', omschrijving: 'founder ai-chat',
        anker: /credits\.recordUsage\(credits\.INTERNAL_PROJECT_CODE, credits\.FEATURES\.FOUNDER_AI_CHAT, \{[\s\S]{0,200}?reference: `founder:chat:\$\{aiChatRequestId\}`/ },
      { bestand: 'api/admin.js', omschrijving: 'founder content-post',
        anker: /credits\.recordUsage\(credits\.INTERNAL_PROJECT_CODE, credits\.FEATURES\.FOUNDER_CONTENT_POST, \{[\s\S]{0,200}?reference: `founder:content-post:\$\{contentPostRequestId\}`/ },
      { bestand: 'api/admin.js', omschrijving: 'founder personalized-dm',
        anker: /credits\.recordUsage\(credits\.INTERNAL_PROJECT_CODE, credits\.FEATURES\.FOUNDER_PERSONALIZED_DM, \{[\s\S]{0,200}?reference: `founder:personalized-dm:\$\{dmRequestId\}`/ },
      { bestand: 'api/leads.js', omschrijving: 'suggest-replies',
        anker: /credits\.recordUsage\(projectCode, credits\.FEATURES\.REPLY_SUGGESTION, \{[\s\S]{0,700}?reference: `suggest:\$\{leadId\}:\$\{history\.length\}`/ },
      { bestand: 'api/cron-followup.js', omschrijving: 'wekelijkse learning-cron',
        anker: /credits\.recordUsage\(projectCode, credits\.FEATURES\.WEEKLY_LEARNING, \{[\s\S]{0,1300}?reference: `learning:\$\{projectCode\}:\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}`/ },
      { bestand: 'api/_faro/media.js', omschrijving: 'Faro video-generatie',
        anker: /credits\.recordUsage\(job\.projectCode, credits\.FEATURES\.VIDEO_GENERATION, \{[\s\S]{0,100}?reference: `video:\$\{job\.jobId\}`/ },
      { bestand: 'api/_faro/orchestrator.js', omschrijving: 'Faro chatverbruik per beurt',
        anker: /credits\.recordUsage\(ctx\.projectCode, credits\.FEATURES\.FARO_CHAT, \{[\s\S]{0,800}?reference: `faro:\$\{conversationId\}:\$\{history\.length\}`/ },
    ];
    for (const g of gevallen) {
      const bron = fs.readFileSync(path.join(__dirname, '..', g.bestand), 'utf8');
      ck(`${g.bestand} (${g.omschrijving}) geeft een stabiele reference mee`,
         g.anker.test(bron), 'patroon niet gevonden -- bestand herschreven of referentie verwijderd');
    }
  }

  console.log('\n— geen van de nieuwe referenties leunt op ruwe randomness in de afschrijving zelf —');
  {
    // De randomUUID()-aanroepen in admin.js staan bij BINNENKOMST van de
    // mode-handler (vóór de credit-check en de AI-aanroep), niet in de
    // recordUsage()-aanroep zelf -- dat is precies het verschil tussen "één
    // keer bepaald" en "verzonnen bij de afschrijving".
    const adminBron = fs.readFileSync(path.join(__dirname, '..', 'api/admin.js'), 'utf8');
    const recordUsageMetRandom = /credits\.recordUsage\([^)]*crypto\.randomUUID/;
    ck('geen enkele recordUsage()-aanroep genereert zelf een random id inline',
       !recordUsageMetRandom.test(adminBron), null);
  }

  console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
