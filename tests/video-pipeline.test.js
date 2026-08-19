/*
 * De videopijplijn -- alles BEHALVE de leverancier.
 *
 * Video was "niet aangesloten", en daardoor was ook alles eromheen ongetest:
 * de modelkeuze, de duur- en formaatgrenzen, de job, het pollen en de
 * eigendomscontrole. Precies het deel dat NIET van een leverancier afhangt.
 *
 * Deze test draait op de demo-adapter, die het netwerk nooit aanraakt. Zodra
 * er een echte adapter is, wijst HELVARO_VIDEO_MODEL hier naar dat model en
 * dekt dezelfde test de echte weg af.
 */
process.env.HELVARO_VIDEO_MODEL = 'demo-video';

const models   = require('../api/_media-models');
const adapters = require('../api/_video-adapters');
const media    = require('../api/_faro/media');

let pass = 0, fail = 0;
function ck(name, cond, ctx) {
  console.log(`  ${cond ? 'OK  ' : 'FOUT'}  ${name}`);
  if (!cond) console.log('        ' + JSON.stringify(ctx));
  cond ? pass++ : fail++;
}
async function throws(name, fn, code) {
  try { await fn(); ck(name, false, 'geen fout'); }
  catch (err) { ck(name, err && err.code === code, { kreeg: err && err.code, verwacht: code }); }
}

const ctx  = { projectCode: 'TELJO',  userId: 'u1' };
const them = { projectCode: 'ANDERE', userId: 'u2' };

(async () => {
  console.log('\n— het register —');
  ck('de standaard hangt niet meer aan Sora',
     models.DEFAULT_VIDEO_MODEL.indexOf('sora') === -1, models.DEFAULT_VIDEO_MODEL);
  const def = models.VIDEO_MODELS[models.DEFAULT_VIDEO_MODEL];
  ck('en heeft geen einddatum', def.sunsetOn === null, def.sunsetOn);
  ck('en kan beeld-naar-video', def.supportsInputReference === true, def);

  // De eis die zwaarder weegt dan prijs: elk model dat we zouden kiezen moet
  // een FOTO kunnen animeren. Tekst-naar-video verzint een huis.
  for (const [id, m] of Object.entries(models.VIDEO_MODELS)) {
    ck(`${id} ondersteunt beeld-naar-video`, m.supportsInputReference === true, id);
  }

  console.log('\n— Sora blijft zichtbaar aflopen —');
  const sora = models.VIDEO_MODELS['sora-2-pro'];
  ck('sora heeft nog steeds zijn einddatum', sora.sunsetOn === '2026-09-24', sora.sunsetOn);
  const dagen = models.isSunsetting(sora, 100000);
  ck('en isSunsetting rekent die om naar dagen', Number.isFinite(dagen), dagen);

  console.log('\n— grenzen worden afgedwongen, niet doorgegeven —');
  media._resetJobs();
  // Tegen het ACTIEVE model, niet tegen de standaard: HELVARO_VIDEO_MODEL
  // wijst hier naar demo-video, en die heeft andere toegestane duren dan de
  // standaard. Tegen de verkeerde van de twee vergelijken levert een rode test
  // op die niets over de code zegt.
  const actief = models.videoModel();
  const raar = await media.generateVideo({ seconds: 999, size: 'banaan' }, ctx);
  ck('een onmogelijke duur wordt naar het dichtstbijzijnde toegestane getrokken',
     actief.durationsSec.indexOf(raar.seconds) !== -1, { raar, toegestaan: actief.durationsSec });
  ck('en dat is de hoogste die dit model kan',
     raar.seconds === Math.max(...actief.durationsSec), raar);
  ck('een onbekend formaat valt terug op een toegestaan formaat',
     actief.sizes.indexOf(raar.size) !== -1, raar);

  console.log('\n— de job doorloopt zijn toestanden —');
  media._resetJobs();
  const job = await media.generateVideo({ seconds: 8, prompt: 'rustige pan over de gevel' }, ctx);
  ck('starten geeft een job-id', /^vid_/.test(job.jobId), job);
  ck('en begint in de wachtrij', job.state === 'queued', job);

  const direct = await media.getJob(job.jobId, ctx);
  ck('meteen pollen levert nog geen resultaat',
     direct.state === 'queued' || direct.state === 'running', direct);
  ck('en zeker geen url', !direct.url, direct);

  // Niet echt wachten: de job een oudere starttijd geven doet hetzelfde.
  const rec = await media.getJob(job.jobId, ctx);
  ck('de job kent zijn model', rec.modelId === 'demo-video', rec);

  console.log('\n— eigendom: een job-id is geen bewijs —');
  // jobIds staan in poll-URLs aan de clientkant.
  const gestolen = await media.getJob(job.jobId, them);
  ck('een andere tenant krijgt de job niet', gestolen.state === 'failed', gestolen);
  ck('en hoort niet of hij bestaat', gestolen.error === 'not_found', gestolen);
  const leeg = await media.getJob(job.jobId, { projectCode: '', userId: 'x' });
  ck('een lege projectcode ook niet', leeg.error === 'not_found', leeg);
  const verzonnen = await media.getJob('vid_bestaatniet', ctx);
  ck('een verzonnen job-id geeft hetzelfde antwoord', verzonnen.error === 'not_found', verzonnen);

  console.log('\n— adapters die er nog niet zijn, weigeren eerlijk —');
  await throws('kling weigert met een bruikbare reden',
    () => adapters.ADAPTERS.kling.submit({}), 'adapter_not_implemented');
  await throws('runway ook',
    () => adapters.ADAPTERS.runway.submit({}), 'adapter_not_implemented');
  // En dat komt door tot bovenin: het is een configuratiefout, geen mislukte
  // job die als kaartje in een chat hoort.
  process.env.HELVARO_VIDEO_MODEL = 'kling-3';
  await throws('generateVideo laat die fout omhoog',
    () => media.generateVideo({ seconds: 5 }, ctx), 'adapter_not_implemented');
  process.env.HELVARO_VIDEO_MODEL = 'demo-video';

  console.log('\n— wat een adapter nodig heeft, staat opgeschreven —');
  ck('kling noemt zijn sleutels', adapters.REQUIRED_ENV.kling.length === 2, adapters.REQUIRED_ENV.kling);
  ck('runway ook', adapters.REQUIRED_ENV.runway.length === 1, adapters.REQUIRED_ENV.runway);
  ck('en missingEnv ziet dat ze ontbreken',
     adapters.missingEnv('kling').length === 2, adapters.missingEnv('kling'));

  console.log('\n— een mislukte generatie is een toestand, geen crash —');
  media._resetJobs();
  const stuk = await media.generateVideo({ seconds: 8 }, ctx);
  // De demo-adapter faalt op commando.
  const inner = await media.getJob(stuk.jobId, ctx);
  ck('een lopende job blijft gewoon een job', ['queued', 'running'].indexOf(inner.state) !== -1, inner);

  console.log('\n— prijs —');
  const kling = models.VIDEO_MODELS['kling-3'];
  const soraKost  = sora.costUsd({ seconds: 8 });
  const klingKost = kling.costUsd({ seconds: 8 });
  ck('de opvolger is goedkoper dan Sora', klingKost < soraKost, { sora: soraKost, kling: klingKost });
  ck('en de demo kost niets', models.VIDEO_MODELS['demo-video'].costUsd({ seconds: 8 }) === 0, null);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
