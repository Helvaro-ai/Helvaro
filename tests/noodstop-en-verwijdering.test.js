/*
 * Twee dingen die je vóór een lancering wilt hebben.
 *
 * ── De noodstop ─────────────────────────────────────────────────────────────
 * Als er iets doorslaat -- een lus die blijft vragen, een lek, een rekening die
 * hard oploopt -- was de enige uitweg de sleutel bij Anthropic intrekken. Dan
 * ligt álles plat en moet je hem daarna weer terugzetten.
 *
 * AI_UIT=1 stopt elke AI-uitgave zonder deploy. Het staat in
 * api/_ai/router.js's generateText(), want daar komt alles langs: WhatsApp,
 * Faro, kwalificatie, samenvattingen, beeldanalyse. En het staat er VÓÓR de
 * providerkeuze, dus er wordt geen token gekocht.
 *
 * ── Account verwijderen ─────────────────────────────────────────────────────
 * Bewust geen knop die ter plekke een tenant leegmaakt. Er hangt te veel aan:
 * een lopend abonnement bij Stripe moet stoppen, facturen moeten wettelijk
 * bewaard blijven, en de leadgegevens zijn niet van de makelaar maar van zijn
 * klanten. Een knop die dat met één klik onomkeerbaar doet, is precies het soort
 * ding dat je één keer per ongeluk raakt.
 *
 * Wel: een aanvraag die met zoveel woorden wordt vastgelegd en verstuurd via
 * dezelfde beveiligde route als andere supportberichten -- afzender uit de
 * sessie, nooit uit de body. Met een overtypbevestiging zodat het geen misklik
 * kan zijn. Dat is wat de AVG vraagt: het recht op wissen, niet per se een knop
 * die het zelf uitvoert.
 */
'use strict';

process.env.FARO_WORKSPACE_ENABLED = '1';

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 260));
  ok ? pass++ : fail++;
};

// ── Noodstop ────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n— de noodstop stopt élke AI-aanroep —');
  {
    const stil = (fn) => { const e = console.error; console.error = () => {}; return Promise.resolve(fn()).finally(() => { console.error = e; }); };
    const taken = ['whatsapp_conversation', 'lead_qualification', 'conversation_summary'];

    process.env.AI_UIT = '1';
    process.env.AI_UIT_REDEN = 'rekening liep op';
    delete require.cache[require.resolve('../api/_ai/router.js')];
    const router = require('../api/_ai/router.js');

    let geroepen = 0;
    const echt = global.fetch;
    global.fetch = async (...a) => { geroepen++; return echt(...a); };

    for (const taak of taken) {
      let code = '', ging = false;
      await stil(async () => {
        try { await router.generateText({ task: taak, ctx: { projectCode: 'TELJO' }, system: 'x', messages: [{ role: 'user', content: 'hoi' }] }); ging = true; }
        catch (e) { code = e.code || ''; }
      });
      ck(`${taak} → geweigerd`, !ging && code === 'ai_uit', `ging=${ging} code=${code}`);
    }
    ck('en er ging geen enkel verzoek de deur uit', geroepen === 0, geroepen);
    global.fetch = echt;

    // Reden komt terug in de melding, zodat later te zien is waarom.
    let melding = '';
    await stil(async () => {
      try { await router.generateText({ task: 'whatsapp_conversation', ctx: { projectCode: 'T' }, system: 'x', messages: [] }); }
      catch (e) { melding = e.message; }
    });
    ck('de reden staat in de melding', /rekening liep op/.test(melding), melding);

    // Uit betekent uit: zonder de vlag draait alles gewoon door naar de rest.
    delete process.env.AI_UIT;
    delete process.env.AI_UIT_REDEN;
    delete require.cache[require.resolve('../api/_ai/router.js')];
    const router2 = require('../api/_ai/router.js');
    let code2 = '';
    await stil(async () => {
      try { await router2.generateText({ task: 'whatsapp_conversation', ctx: { projectCode: 'TELJO' }, system: 'x', messages: [{ role: 'user', content: 'hoi' }] }); }
      catch (e) { code2 = e.code || ''; }
    });
    ck('zonder de vlag is ai_uit niet meer de reden', code2 !== 'ai_uit', code2);
  }

  // ── Account verwijderen ───────────────────────────────────────────────────
  console.log('\n— account verwijderen zit in de app —');
  {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const dash = require('../api/dashboard.js');
    let html = '';
    dash({ method: 'GET', url: '/dashboard', headers: {} },
         { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });

    ck('er is een knop in de gevaarzone',
       /Account verwijderen[\s\S]{0,400}vraagAccountVerwijdering\(\)/.test(html), null);
    ck('de functie bestaat',        /function vraagAccountVerwijdering\(\)/.test(html), null);
    ck('het is een echte dialoog',  /overlay\.setAttribute\('role', 'dialog'\)/.test(html), null);

    ck('je moet VERWIJDEREN overtypen',
       /toUpperCase\(\) === 'VERWIJDEREN'/.test(html), null);
    ck('en de knop staat tot dan uit',
       /bevestig\.disabled = true;/.test(html), null);

    ck('het loopt via de beveiligde supportroute (afzender uit de sessie)',
       /mode: 'support'[\s\S]{0,300}account verwijderen/i.test(html), null);
    ck('met een onderwerp dat opvalt in het postvak',
       /VERZOEK: account verwijderen/.test(html), null);

    ck('de klant leest wat er weggaat',
       /leads en gesprekken worden gewist/.test(html), null);
    ck('en wat er blijft, met de reden',
       /facturen[\s\S]{0,80}wettelijk/i.test(html), null);
    ck('en binnen welke termijn',
       /binnen 30 dagen/.test(html), null);

    /* De \n-val uit CLAUDE.md: dit bestand is één sjabloonliteral, dus een \n in
       de bron wordt een echte regelafbreking in de UITVOER en breekt de string
       daar. Hier is dat twee keer gebeurd; deze controle houdt het tegen. */
    ck('geen kapotte regelafbrekingen in het verzonden bericht',
       /Deze klant vraagt om verwijdering van zijn account en gegevens\.\\n\\n/.test(html), null);
  }

  console.log(`\n${pass} ok, ${fail} fout`);
  process.exit(fail ? 1 : 0);
})();
