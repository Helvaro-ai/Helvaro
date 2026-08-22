/*
 * Videogeneratie, van bevestiging tot afschrijving.
 *
 * Wat hier bewezen wordt is precies het deel dat NIET van de leverancier
 * afhangt, en dat is het deel dat geld kost:
 *
 *   - een video wordt pas gestart na een bevestiging (de tool stelt voor, de
 *     executor voert uit);
 *   - er wordt niets afgeschreven bij het insturen;
 *   - er wordt precies één keer afgeschreven, op de eerste poll die 'ready'
 *     ziet, ook als de client daarna doorpolt;
 *   - een MISLUKTE video kost niets;
 *   - een klant met te weinig credits kan geen video van 300 starten.
 *
 * De adapter is hier de demo-adapter, maar het MODEL is kling-3. Dat is met
 * opzet: de demo-adapter kost per definitie niets, en dan zou de afschrijving
 * die deze test hoort te bewaken nooit gebeuren.
 */
process.env.HELVARO_VIDEO_MODEL = 'kling-3';

const BASE = require('path').join(__dirname, '..') + '/';
const adapters = require(BASE + 'api/_video-adapters.js');
const credits  = require(BASE + 'api/_credits.js');
const media    = require(BASE + 'api/_faro/media.js');
const actions  = require(BASE + 'api/_faro/actions.js');
const tools    = require(BASE + 'api/_faro/tools.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

// ── De leverancier vervangen door de demo-adapter ───────────────────────────
adapters.ADAPTERS.kling = adapters.ADAPTERS.demo;

// ── De boekhouding onderscheppen ────────────────────────────────────────────
const geboekt = [];
credits.recordUsage = async (code, feature, opts) => { geboekt.push({ code, feature, credits: opts && opts.credits }); };
let saldo = 100000;
credits.checkCredits = async () => ({ allowed: saldo > 0, remaining: saldo, percentUsed: 0 });

const ctx = { projectCode: 'TENANT_A', userId: 'u1' };

// De demo-adapter loopt op wandkloktijd. In plaats van te wachten zetten we de
// starttijd van de job terug -- zo is 'ready' er meteen, zonder sleep().
function spoelVooruit(jobId) {
  return media._job(jobId);
}

(async () => {
  console.log('\n— de tool stelt voor, en voert niets uit —');
  const tool = tools.ALL ? tools.ALL.find((t) => t.name === 'generate_property_video')
                         : (tools.TOOLS || []).find((t) => t.name === 'generate_property_video');
  ck('de video-tool bestaat', !!tool, Object.keys(tools));
  ck('en is een act-tool (dus achter een bevestiging)', tool && tool.kind === 'act', tool && tool.kind);

  const voorstel = await tool.run({ prompt: 'rustige pan door de woonkamer', durationSec: 5, format: '16:9' }, ctx);
  const kaart = (voorstel.components || [])[0];
  ck('er komt een bevestigingskaart', kaart && kaart.type === 'confirmation', kaart);
  ck('met het aantal credits erop', kaart && /credits/.test(kaart.body), kaart && kaart.body);
  ck('en er is nog niets geboekt', geboekt.length === 0, geboekt);

  const kosten = credits.creditsForVideo({ seconds: 5, size: '1280x720' });
  ck('een video van 5 seconden kost 150 credits', kosten === 150, kosten);

  console.log('\n— te weinig credits: geen opdracht —');
  saldo = 40;
  let code = '';
  try {
    await actions.EXECUTORS.generate_property_video(kaart.payload, ctx);
  } catch (e) { code = e.code; }
  ck('een tekort wordt geweigerd', code === 'credit_limit_reached', code);
  ck('en er is niets ingestuurd', geboekt.length === 0, geboekt);

  console.log('\n— genoeg credits: de job start —');
  saldo = 100000;
  const uit = await actions.EXECUTORS.generate_property_video(kaart.payload, ctx);
  const job = (uit.components || [])[0];
  ck('er komt een media_job-kaart terug', job && job.type === 'media_job', job);
  ck('in de wachtrij', job && job.state === 'queued', job);
  ck('met het aantal credits in de meta', job && job.meta.credits === kosten, job && job.meta);
  ck('en nog steeds niets afgeschreven', geboekt.length === 0, geboekt);

  console.log('\n— pollen tot klaar —');
  const rec = spoelVooruit(job.jobId);
  ck('de job staat in de tabel', !!rec, job.jobId);
  rec.startedAt = Date.now() - 10000;   // ver genoeg terug voor de demo-adapter

  let stand = await media.getJob(job.jobId, ctx);
  ck('hij is klaar', stand.state === 'ready', stand);
  ck('nu pas is er afgeschreven', geboekt.length === 1, geboekt);
  ck('en precies het juiste bedrag', geboekt[0] && geboekt[0].credits === kosten, geboekt);
  ck('bij de juiste tenant', geboekt[0] && geboekt[0].code === 'TENANT_A', geboekt);

  // De client polt elke paar seconden door. Dat mag geen tweede rekening zijn.
  await media.getJob(job.jobId, ctx);
  await media.getJob(job.jobId, ctx);
  ck('doorpollen boekt niet nog een keer', geboekt.length === 1, geboekt);

  console.log('\n— een andere tenant ziet de job niet —');
  const vreemd = await media.getJob(job.jobId, { projectCode: 'TENANT_B', userId: 'u2' });
  ck('en krijgt geen url', vreemd.state === 'failed' && !vreemd.url, vreemd);

  console.log('\n— een MISLUKTE video kost niets —');
  geboekt.length = 0;
  const mislukt = await media.generateVideo({ prompt: 'x', seconds: 5, size: '1280x720' }, ctx);
  const rec2 = spoelVooruit(mislukt.jobId);
  rec2.providerJobId = 'demo_fail_1';   // de demo-adapter faalt hierop altijd
  rec2.startedAt = Date.now() - 10000;
  const stand2 = await media.getJob(mislukt.jobId, ctx);
  ck('hij is mislukt', stand2.state === 'failed', stand2);
  ck('en er is niets afgeschreven', geboekt.length === 0, geboekt);

  console.log('\n— zonder adapter: eerlijk, en gratis —');
  adapters.ADAPTERS.kling = { async submit() { const e = new Error('nog niet'); e.code = 'adapter_not_implemented'; throw e; },
                              async poll() { throw new Error('nog niet'); } };
  code = ''; let bericht = '';
  try { await actions.EXECUTORS.generate_property_video(kaart.payload, ctx); }
  catch (e) { code = e.code; bericht = e.message; }
  ck('dat leest als "staat nog niet aan", niet als een storing', code === 'not_wired', code);
  ck('en het zegt erbij dat er niets betaald is', /niets in rekening/.test(bericht), bericht);
  ck('en dat klopt ook', geboekt.length === 0, geboekt);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
