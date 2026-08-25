/*
 * De Kling-adapter.
 *
 * LET OP wat deze test wel en niet bewijst.
 *
 * WEL: het ondertekenen (HS256 is deterministisch, dus de handtekening is na te
 * rekenen), de vertaling van pixelmaat naar beeldverhouding, de duurafronding,
 * en de hele toestandsmachine van poll() -- inclusief de gevallen waarin Kling
 * iets teruggeeft dat we niet verwachten.
 *
 * NIET: of de endpoints, veldnamen en antwoordvorm kloppen met de echte API.
 * Die machine kan api.klingai.com niet bereiken. Dat is precies waarvoor
 * scripts/kling-check.js bestaat, en waarom elke aanname in api/_kling.js een
 * naam heeft (A1 tot en met A6).
 *
 * Waar deze test dus echt op let: dat een onverwacht antwoord NOOIT stil als
 * "mislukt" wordt afgedaan. Een video die verloren gaat omdat wij een veld
 * anders noemen dan de leverancier, is een klant die betaalde credits kwijt is
 * en een fout ziet die bij Kling lijkt te liggen.
 */
process.env.KLING_ACCESS_KEY = 'AK_zelftest';
process.env.KLING_SECRET_KEY = 'SK_zelftest';

const crypto = require('crypto');
const BASE = require('path').join(__dirname, '..') + '/';
const K = require(BASE + 'api/_kling.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

console.log('\n— A1: het token, nagerekend —');
const nu = 1700000000;
const token = K.maakToken({ accessKey: 'AK_zelftest', secretKey: 'SK_zelftest', nu });
const [h, p, s] = token.split('.');

function ontcijfer(deel) {
  return JSON.parse(Buffer.from(deel.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}
ck('drie delen', token.split('.').length === 3, token);
ck('header zegt HS256', ontcijfer(h).alg === 'HS256', ontcijfer(h));
ck('iss is de access key', ontcijfer(p).iss === 'AK_zelftest', ontcijfer(p));
ck('exp ligt een half uur vooruit', ontcijfer(p).exp === nu + 1800, ontcijfer(p));
// nbf in het verleden: klokken lopen niet gelijk, en "nog niet geldig" geeft
// dezelfde foutcode als een verkeerde handtekening. Dat kost een uur zoeken.
ck('nbf ligt iets in het verleden', ontcijfer(p).nbf < nu, ontcijfer(p));

// De handtekening zelf, onafhankelijk nagerekend.
const verwacht = crypto.createHmac('sha256', 'SK_zelftest').update(`${h}.${p}`).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
ck('de handtekening klopt', s === verwacht, { kreeg: s, verwacht });

// Geen base64-padding en geen tekens die een URL breken.
ck('url-veilige base64', !/[+/=]/.test(token), token);

/* Lege argumenten vallen terug op de omgeving -- dat is het normale pad, want
   in productie geeft niemand de sleutels mee. De echte vraag is: gebeurt er
   iets zinnigs als ze NERGENS staan. Dus de omgeving even leeg. */
let wierp = '';
const bewaardAK = process.env.KLING_ACCESS_KEY, bewaardSK = process.env.KLING_SECRET_KEY;
delete process.env.KLING_ACCESS_KEY; delete process.env.KLING_SECRET_KEY;
try { K.maakToken(); } catch (e) { wierp = e.code; }
ck('zonder sleutels, nergens, geen token', wierp === 'not_configured', wierp);
ck('en configured() weet dat ook', K.configured() === false, K.configured());
process.env.KLING_ACCESS_KEY = bewaardAK; process.env.KLING_SECRET_KEY = bewaardSK;
ck('met sleutels weer wel', K.configured() === true, K.configured());

/* De nieuwe weg: één sleutel, rechtstreeks als Bearer. Kling geeft die sinds
   kort in plaats van het paar, en een account dat vandaag wordt aangemaakt
   ziet het paar nooit meer. Zolang authToken() de JWT bleef bouwen, kreeg je
   een 401 die eruitziet als een verlopen abonnement. */
const bewaardKey = process.env.KLING_API_KEY;
delete process.env.KLING_ACCESS_KEY; delete process.env.KLING_SECRET_KEY;
process.env.KLING_API_KEY = 'api-key-kling-Zelftest123';
ck('één sleutel is genoeg om geconfigureerd te heten', K.configured() === true);
ck('en die gaat ONGEWIJZIGD mee, niet als JWT',
   K.authToken() === 'api-key-kling-Zelftest123', K.authToken());
ck('de gekozen methode heet api_key', K.authMethode() === 'api_key', K.authMethode());

/* Staan ze allebei, dan wint de nieuwe -- anders blijft een account dat net is
   overgezet stilletjes de oude weg nemen, met een paar dat Kling misschien al
   ingetrokken heeft. */
process.env.KLING_ACCESS_KEY = bewaardAK; process.env.KLING_SECRET_KEY = bewaardSK;
ck('naast het legacy paar wint de nieuwe sleutel',
   K.authToken() === 'api-key-kling-Zelftest123', K.authToken());
if (bewaardKey) process.env.KLING_API_KEY = bewaardKey; else delete process.env.KLING_API_KEY;
ck('zonder die sleutel is het weer een JWT van drie delen',
   K.authToken().split('.').length === 3 && K.authMethode() === 'jwt');

console.log('\n— A6: maat en duur —');
ck('1280x720 is 16:9',  K.aspect('1280x720') === '16:9', K.aspect('1280x720'));
ck('720x1280 is 9:16',  K.aspect('720x1280') === '9:16', K.aspect('720x1280'));
ck('1024x1024 is 1:1',  K.aspect('1024x1024') === '1:1', K.aspect('1024x1024'));
ck('onzin valt terug op 16:9', K.aspect('groot') === '16:9', K.aspect('groot'));
ck('5 seconden blijft 5',  K.duur(5) === '5', K.duur(5));
ck('10 seconden blijft 10', K.duur(10) === '10', K.duur(10));
// Naar beneden afronden: te lang is duurder dan wat de klant koos.
ck('8 seconden wordt 5, niet 10', K.duur(8) === '5', K.duur(8));
ck('30 seconden wordt 10', K.duur(30) === '10', K.duur(30));

// ── Een nagemaakte Kling ────────────────────────────────────────────────────
let laatste = null;
function nepKling(antwoord, { status = 200, ruw = null } = {}) {
  global.fetch = async (url, opts) => {
    laatste = { url: String(url), method: (opts && opts.method) || 'GET',
                auth: opts && opts.headers && opts.headers.Authorization,
                body: opts && opts.body ? JSON.parse(opts.body) : null };
    const tekst = ruw !== null ? ruw : JSON.stringify(antwoord);
    return { ok: status < 400, status, text: async () => tekst };
  };
}

(async () => {
  console.log('\n— A2 + A3: een opdracht insturen —');
  nepKling({ code: 0, message: 'SUCCEED', data: { task_id: 'taak123', task_status: 'submitted' } });
  let r = await K.kling.submit({ prompt: 'een woonkamer', seconds: 5, size: '1280x720' });
  ck('er komt een job-id terug', /taak123/.test(r.providerJobId), r);
  ck('tekst-naar-video endpoint', /\/v1\/videos\/text2video$/.test(laatste.url), laatste.url);
  ck('met een bearer-token', /^Bearer ey/.test(laatste.auth || ''), laatste.auth);
  ck('de prompt gaat mee', laatste.body.prompt === 'een woonkamer', laatste.body);
  ck('duur als string', laatste.body.duration === '5', laatste.body);
  ck('formaat als beeldverhouding', laatste.body.aspect_ratio === '16:9', laatste.body);

  nepKling({ code: 0, data: { task_id: 'taak456' } });
  r = await K.kling.submit({ prompt: 'maak dit modern', imageUrl: 'https://x/y.jpg', seconds: 10, size: '720x1280' });
  ck('met een beeld: image2video', /\/v1\/videos\/image2video$/.test(laatste.url), laatste.url);
  ck('het beeld gaat mee', laatste.body.image === 'https://x/y.jpg', laatste.body);
  ck('9:16 bij een staand formaat', laatste.body.aspect_ratio === '9:16', laatste.body);
  // Het endpoint zit in de id, anders moet poll() raden.
  ck('de id onthoudt welk endpoint het was', r.providerJobId.startsWith('i:'), r.providerJobId);

  console.log('\n— een opdracht zonder prompt —');
  let code = '';
  try { await K.kling.submit({ prompt: '   ' }); } catch (e) { code = e.code; }
  ck('wordt geweigerd voordat er een aanroep is', code === 'no_prompt', code);

  console.log('\n— als A3 niet klopt —');
  nepKling(null, { ruw: '<html>gateway timeout</html>' });
  code = '';
  let bericht = '';
  try { await K.kling.submit({ prompt: 'x' }); } catch (e) { code = e.code; bericht = e.message; }
  ck('geen JSON geeft een duidelijke fout', code === 'bad_response', code);
  ck('en die noemt de aanname bij naam', /A3/.test(bericht), bericht);

  nepKling({ code: 0, message: 'ok', data: {} });
  code = '';
  try { await K.kling.submit({ prompt: 'x' }); } catch (e) { code = e.code; }
  ck('geen task_id geeft een duidelijke fout', code === 'no_task_id', code);

  nepKling({ code: 1101, message: 'account exception' }, { status: 401 });
  code = '';
  try { await K.kling.submit({ prompt: 'x' }); } catch (e) { code = e.code; }
  ck('een weigering van Kling komt door', code === 'rejected', code);

  console.log('\n— A4 + A5: de toestandsmachine —');
  const gevallen = [
    ['submitted',  'queued'],
    ['processing', 'running'],
    ['failed',     'failed'],
  ];
  for (const [status, verwachtState] of gevallen) {
    nepKling({ code: 0, data: { task_status: status, task_status_msg: 'reden' } });
    const uit = await K.kling.poll({ providerJobId: 't:taak123' });
    ck(`${status} -> ${verwachtState}`, uit.state === verwachtState, uit);
  }

  nepKling({ code: 0, data: { task_status: 'succeed',
                              task_result: { videos: [{ url: 'https://cdn/x.mp4' }] } } });
  let uit = await K.kling.poll({ providerJobId: 't:taak123' });
  ck('succeed geeft de url', uit.state === 'ready' && uit.url === 'https://cdn/x.mp4', uit);

  nepKling({ code: 0, data: { task_status: 'succeed' } });
  uit = await K.kling.poll({ providerJobId: 't:taak123' });
  ck('klaar zonder url is een eerlijke fout', uit.state === 'failed' && /A5/.test(uit.error), uit);

  console.log('\n— het gevaarlijkste geval: een status die we niet kennen —');
  /* Als Kling ooit een nieuwe status introduceert, mag die NIET als mislukt
     gelden. Dan gooien we een video weg die gewoon nog bezig is, en de klant is
     zijn credits kwijt aan een fout die bij ons zit. */
  nepKling({ code: 0, data: { task_status: 'queueing_for_gpu' } });
  uit = await K.kling.poll({ providerJobId: 't:taak123' });
  ck('een onbekende status telt als "nog bezig", niet als mislukt',
     uit.state === 'running', uit);

  console.log('\n— en een netwerkhapering ook niet —');
  /* De opdracht loopt door aan Kling's kant. 'failed' teruggeven zou de job
     afbreken voor iets dat een seconde later gewoon werkt. */
  global.fetch = async () => { throw new Error('ECONNRESET'); };
  uit = await K.kling.poll({ providerJobId: 't:taak123' });
  ck('een netwerkfout telt als "nog bezig"', uit.state === 'running', uit);

  console.log('\n— poll weet welk endpoint het was —');
  nepKling({ code: 0, data: { task_status: 'processing' } });
  await K.kling.poll({ providerJobId: 'i:taak456' });
  ck('een beeld-job vraagt image2video op', /image2video\/taak456$/.test(laatste.url), laatste.url);
  await K.kling.poll({ providerJobId: 't:taak123' });
  ck('een tekst-job vraagt text2video op', /text2video\/taak123$/.test(laatste.url), laatste.url);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
