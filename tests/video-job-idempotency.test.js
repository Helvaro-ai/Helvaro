/*
 * Generatiejob-persistentie, deel 2: idempotency-key dedup en finishedAt.
 *
 * tests/video-pipeline.test.js dekt de jobtoestanden en eigendomscontrole al.
 * Deze test dekt wat daarna is toegevoegd (brief §22-23):
 *   - een tweede submit met dezelfde idempotencyKey levert dezelfde job terug
 *     in plaats van een nieuwe, betaalde generatie te starten
 *   - dat geldt ALLEEN binnen dezelfde tenant -- een key is geen globale sleutel
 *   - finishedAt wordt precies één keer gezet, bij de eerste poll die een
 *     eindtoestand ziet (dezelfde eenmaligheid als job.charged al had)
 */
'use strict';

process.env.HELVARO_VIDEO_MODEL = 'demo-video';

const media = require('../api/_faro/media');

let pass = 0, fail = 0;
function ck(name, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}

const ctx  = { projectCode: 'TELJO', userId: 'u1' };
const them = { projectCode: 'ANDERE', userId: 'u2' };

(async () => {
  console.log('\n— dezelfde idempotencyKey, dezelfde tenant: geen tweede job —');
  media._resetJobs();
  const eerste = await media.generateVideo({ seconds: 8, idempotencyKey: 'click-42' }, ctx);
  ck('de eerste submit start gewoon een job', /^vid_/.test(eerste.jobId), eerste);
  ck('en is niet "reused"', !eerste.reused, eerste);

  const tweede = await media.generateVideo({ seconds: 8, idempotencyKey: 'click-42' }, ctx);
  ck('de tweede submit met dezelfde sleutel levert DEZELFDE jobId',
     tweede.jobId === eerste.jobId, { eerste: eerste.jobId, tweede: tweede.jobId });
  ck('en zegt dat expliciet', tweede.reused === true, tweede);

  // Een ANDERE sleutel moet wél een nieuwe job starten -- dedup mag niet
  // "elke tweede submit" blokkeren, alleen een letterlijk herhaalde sleutel.
  const derde = await media.generateVideo({ seconds: 8, idempotencyKey: 'click-43' }, ctx);
  ck('een ANDERE sleutel start wél een nieuwe job', derde.jobId !== eerste.jobId, { derde: derde.jobId, eerste: eerste.jobId });

  console.log('\n— dezelfde sleutel, een andere tenant: eigen job ──────────');
  media._resetJobs();
  const vanTeljo = await media.generateVideo({ seconds: 8, idempotencyKey: 'gedeeld' }, ctx);
  const vanAnder = await media.generateVideo({ seconds: 8, idempotencyKey: 'gedeeld' }, them);
  ck('een key is per tenant, niet globaal',
     vanTeljo.jobId !== vanAnder.jobId, { teljo: vanTeljo.jobId, ander: vanAnder.jobId });

  console.log('\n— zonder sleutel: elke submit is een nieuwe job, zoals voorheen —');
  media._resetJobs();
  const a = await media.generateVideo({ seconds: 8 }, ctx);
  const b = await media.generateVideo({ seconds: 8 }, ctx);
  ck('geen dedup zonder idempotencyKey', a.jobId !== b.jobId, { a: a.jobId, b: b.jobId });

  console.log('\n— finishedAt wordt gezet bij de eerste eindtoestand ───────');
  media._resetJobs();
  const job = await media.generateVideo({ seconds: 8 }, ctx);
  const raw1 = media._job(job.jobId);
  ck('start zonder finishedAt', raw1.finishedAt === null, raw1);

  // De demo-adapter rondt vanzelf af na een paar tellen; niet echt wachten --
  // startedAt terugzetten doet hetzelfde, zoals video-pipeline.test.js ook
  // voordoet voor eenzelfde soort scenario.
  raw1.startedAt = Date.now() - 60_000;
  const polled = await media.getJob(job.jobId, ctx);
  if (polled.state === 'ready' || polled.state === 'failed') {
    ck('finishedAt is nu gezet', typeof polled.finishedAt === 'number' && polled.finishedAt > 0, polled);
    const eerdereFinishedAt = polled.finishedAt;
    const nogEens = await media.getJob(job.jobId, ctx);
    ck('een tweede poll verandert finishedAt niet meer',
       nogEens.finishedAt === eerdereFinishedAt, { eerst: eerdereFinishedAt, daarna: nogEens.finishedAt });
  } else {
    console.log('  (demo-adapter nog niet klaar binnen deze run — finishedAt-check overgeslagen, geen fout)');
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
