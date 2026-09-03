/*
 * De publieke demo op de website.
 *
 * ── Waarom deze test bestaat ────────────────────────────────────────────────
 * De demo deed het NOOIT. Elke bezoeker die hem probeerde kreeg "even een
 * technische hapering", en niemand wist het, want:
 *
 *   1. api/_demo-chat.js riep runAI aan zonder projectCode mee te geven.
 *   2. api/_ai/router.js weigert elke aanroep zonder tenant (terecht — een lege
 *      tenant leest elders in deze codebase als "admin, toon alles").
 *   3. runAI VANGT die fout zelf af en geeft een storingsbericht terug in
 *      plaats van te gooien. De demo-module zag dus een geslaagde aanroep met
 *      een vriendelijk excuus erin.
 *
 * Drie lagen die elk voor zich verdedigbaar zijn, en samen een kapotte
 * verkoopdemo die geen enkele foutmelding oplevert in de module waar het
 * misgaat. Gevonden in de Vercel-logs ("[WhatsApp] AI-router fout: no_tenant"),
 * niet in de code.
 *
 * Wat hier getoetst wordt is dus niet "runAI werkt" maar: KRIJGT runAI wat hij
 * nodig heeft. Dat is de naad die brak.
 */
process.env.DEMO_CHAT_ENABLED = '1';
process.env.DEMO_PROJECT_CODE = process.env.DEMO_PROJECT_CODE || 'HELVARO';
process.env.AI_PROVIDER_FORCE = 'demo';

const BASE = require('path').join(__dirname, '..') + '/';
const demo = require(BASE + 'api/_demo-chat.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

/* Een minimale req/res, en deps die niets echts aanraken. */
function nepRes() {
  const r = { _status: 0, _json: null, headers: {} };
  r.status = (c) => { r._status = c; return r; };
  r.json = (j) => { r._json = j; return r; };
  r.end = () => r;
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}

function nepDeps(vangst) {
  return {
    async runAI(history, instructions, naam, aiName, clientName, website, address, lang, ctx) {
      vangst.ctx = ctx;
      vangst.aangeroepen = true;
      return { done: false, message: 'Dag! Waar ben je naar op zoek?' };
    },
    async getClientByCode(code) {
      vangst.klantOpgevraagd = code;
      return { id: 'recKLANT', fields: { 'Client Name': 'Testkantoor', 'AI Name': 'Mathis' } };
    },
    async atFetch() { return { ok: true, json: async () => ({ records: [] }) }; },
  };
}

(async () => {
  console.log('\n— de demo geeft de AI een tenant mee —');
  const vangst = {};
  const res = nepRes();
  await demo.handleDemoChat(
    { method: 'POST', headers: {}, body: { message: 'Ik zoek een woning in Gent', history: [] } },
    res,
    nepDeps(vangst),
  );

  ck('runAI is aangeroepen', vangst.aangeroepen === true, vangst);
  /* DE assertie. Zonder dit is de hele demo een excuusbericht. */
  ck('en kreeg een projectcode mee',
     Boolean(vangst.ctx && String(vangst.ctx.projectCode || '').trim()), vangst.ctx);
  ck('dezelfde die voor de creditcheck gebruikt wordt',
     vangst.ctx && vangst.ctx.projectCode === vangst.klantOpgevraagd,
     { aanAI: vangst.ctx && vangst.ctx.projectCode, aanClient: vangst.klantOpgevraagd });
  ck('de bezoeker krijgt een echt antwoord, geen storingsbericht',
     Boolean(res._json && res._json.reply && !/hapering|storing/i.test(res._json.reply)),
     res._json);

  /* De andere helft van de naad -- dat de router een lege tenant WEIGERT --
     staat al in tests/ai-router.test.js (regel 71-75). Die hier overschrijven
     zou twee tests geven die hetzelfde bewaken en samen uit de pas kunnen
     lopen. Deze test bewaakt alleen de kant die brak: dat de demo hem meegeeft.

     Mijn eerste versie riep router.run() aan; die functie bestaat niet (het is
     generateText). De assertie was dus rood om een reden die niets met het
     product te maken had -- precies waarom een rode test die je "even" groen
     maakt gevaarlijk is. */

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
