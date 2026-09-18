/*
 * Generatiejob-persistentie voor beeld, deel 2: dezelfde garantie als
 * tests/video-job-idempotency.test.js, maar dan voor api/_images.js's
 * generateForClient().
 *
 * ── Waarom dit apart van video moest ────────────────────────────────────────
 * Beeldgeneratie is SYNCHROON (geen poll-lus zoals video) en had daarom nog
 * geen "duplicate submit met dezelfde idempotencyKey levert dezelfde job
 * terug" -- credits.recordUsage() dedupliceerde al op `reference: image:${jobId}`
 * (zie tests/credit-referenties.test.js), maar dat beschermde alleen het
 * grootboek van de klant. Een herhaalde aanroep met hetzelfde jobId riep
 * generatePropertyImage() nog gewoon opnieuw aan -- Helvaro betaalde OpenAI
 * twee keer voor twee VERSCHILLENDE resultaten van "één" klik.
 *
 * ── Waarom deze test OpenAI/Vercel Blob niet nabootst ───────────────────────
 * generateForClient() heeft geen deps-injectie voor generatePropertyImage()
 * of de Blob-upload (in tegenstelling tot credits, dat wel via deps.credits
 * gaat) -- die volledige keten nabouwen zou een groot, breekbaar mocksysteem
 * zijn voor iets dat vandaag nul testdekking heeft, en dat is een apart gat.
 * In plaats daarvan wordt de cache direct gezaaid (_seedImageJobCache, zoals
 * media.js's _job() voor video) en bewezen dat een cache-hit ECHT vroeg
 * terugkeert: deps.credits.checkCredits gooit met opzet een fout als hij
 * wordt aangeroepen, dus als de test slaagt zonder die fout is bewezen dat
 * geen enkele betaalde stap (validatie, credit-check, generatie) draaide.
 */
'use strict';

const images = require('../api/_images');

let pass = 0, fail = 0;
function ck(name, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}

// Gooit zodra hij wordt aangeroepen -- een cache-hit mag hier nooit komen.
const boobyTrappedCredits = {
  checkCredits: async () => { throw new Error('checkCredits werd aangeroepen -- geen cache-hit, dus wel een echte (betaalde) poging'); },
  recordUsage: async () => { throw new Error('recordUsage werd aangeroepen -- geen cache-hit'); },
};

(async () => {
  console.log('\n— duplicate submit, zelfde jobId: dezelfde job terug, geen nieuwe poging —');
  images._resetImageJobs();
  const gecachet = { url: 'https://blob.example/result-abc.png', style: 'warm', meta: { roomType: 'living' } };
  images._seedImageJobCache('TELJO', 'klik-42', gecachet);

  let teruggekregen, fout = null;
  try {
    teruggekregen = await images.generateForClient('TELJO', { jobId: 'klik-42' }, { credits: boobyTrappedCredits });
  } catch (e) { fout = e; }
  ck('geen fout -- de cache-hit slaat de hele betaalde keten over', !fout, fout && fout.message);
  ck('en levert precies het gecachete record terug', teruggekregen === gecachet, teruggekregen);

  console.log('\n— zelfde jobId, een ANDERE tenant: geen cross-tenant hit —');
  images._resetImageJobs();
  images._seedImageJobCache('TELJO', 'klik-99', gecachet);
  let andereTenantFout = null;
  try {
    // ANDERE projectCode, zelfde jobId -- moet NIET de TELJO-cache raken, dus
    // valt door naar de echte validatie en struikelt daar (geen dataUrl).
    await images.generateForClient('ANDERE_TENANT', { jobId: 'klik-99' }, { credits: boobyTrappedCredits });
  } catch (e) { andereTenantFout = e; }
  ck('een andere tenant met hetzelfde jobId krijgt GEEN cache-hit (loopt door naar echte validatie en faalt daar)',
     !!andereTenantFout && !/checkCredits werd aangeroepen/.test(andereTenantFout.message), andereTenantFout && andereTenantFout.message);

  console.log('\n— zonder jobId: geen dedup, elke aanroep is een nieuwe poging (zoals altijd) —');
  images._resetImageJobs();
  let zonderJobIdFout = null;
  try {
    await images.generateForClient('TELJO', {}, { credits: boobyTrappedCredits });
  } catch (e) { zonderJobIdFout = e; }
  // Zonder jobId slaat generateForClient de cache-check bewust over (zie de
  // `if (callerJobId)`-guard) en loopt door naar echte validatie -- die faalt
  // hier op de ontbrekende stijl/afbeelding, NIET op de booby-trapped credits.
  ck('geen cache-kortsluiting zonder caller-jobId', !!zonderJobIdFout && !/checkCredits werd aangeroepen/.test(zonderJobIdFout.message), zonderJobIdFout && zonderJobIdFout.message);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
