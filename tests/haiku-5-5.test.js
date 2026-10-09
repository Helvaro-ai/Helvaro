/*
 * Haiku 4.5 -> Haiku 5.5 (model-id `claude-haiku-5-5`).
 *
 * Nooit de echte API: global.fetch is hier overal een stub die de body vastlegt.
 * Gedekt: de request-body (thinking uit, effort laag, max_tokens x1,3, geen
 * temperature/top_p/top_k, Sonnet ongewijzigd), een antwoord dat met een
 * thinking-blok begint, refusal, max_tokens zonder tekst, de prijs (incl. de
 * >100k-staffel), de nieuwe standaardmodellen, Faro's streaming-pad en --
 * zakelijk het belangrijkste -- dat de klant-credits per Faro-beurt NIET
 * veranderen door de goedkopere provider.
 */
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.AI_PROVIDER_FORCE = '';
delete process.env.ANTHROPIC_MODEL_CHEAP; delete process.env.ANTHROPIC_MODEL_CONV;
delete process.env.ANTHROPIC_MODEL_VISION; delete process.env.FARO_MODEL_FAST;
process.env.API_AIRTABLE = 'stub'; process.env.BASE_AIRTABLE = 'stub';

const registry = require('../api/_ai/registry');
const adapterVoor = require('../api/_ai/providers');
const credits = require('../api/_credits');
const faroConfig = require('../api/_faro/config');
const faro = require('../api/_faro/providers/claude');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

let laatsteBody = null;
function stubFetch(antwoord) {
  global.fetch = async (url, opts) => {
    laatsteBody = JSON.parse(opts.body);
    return { ok: true, status: 200, json: async () => antwoord };
  };
}
const anthropic = adapterVoor('anthropic');
const MSG = [{ role: 'user', content: 'hallo' }];

(async () => {
  console.log('\n— standaardmodellen —');
  ck('cheap/conv/vision staan op claude-haiku-5-5',
     ['cheap', 'conversational', 'vision'].every((t) => registry.modelVoor('anthropic', t) === 'claude-haiku-5-5'),
     registry.PROVIDERS.anthropic.modellen);
  ck('reasoning blijft Sonnet', registry.modelVoor('anthropic', 'reasoning') === 'claude-sonnet-5', null);
  process.env.FARO_PROVIDER = 'claude';
  ck('Faro "fast" staat op claude-haiku-5-5', faroConfig.modelFor('fast') === 'claude-haiku-5-5', faroConfig.modelFor('fast'));
  ck('Faro standaard/precies onveranderd',
     faroConfig.modelFor('standard') === 'claude-sonnet-5' && faroConfig.modelFor('precise') === 'claude-opus-5', null);

  console.log('\n— request-body: Haiku 5.5 —');
  stubFetch({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 2 } });
  await anthropic.generateText({ model: 'claude-haiku-5-5', system: 's', messages: MSG, maxTokens: 350 });
  const hb = laatsteBody;
  ck('thinking uit', hb.thinking && hb.thinking.type === 'disabled', hb);
  ck('effort low', hb.output_config && hb.output_config.effort === 'low', hb);
  ck('max_tokens 350 -> 455 (x1,3, naar boven)', hb.max_tokens === 455, hb.max_tokens);
  ck('400 -> 520', (await anthropic.generateText({ model: 'claude-haiku-5-5', messages: MSG, maxTokens: 400 }), laatsteBody.max_tokens === 520), laatsteBody.max_tokens);
  ck('geen temperature / top_p / top_k',
     !('temperature' in hb) && !('top_p' in hb) && !('top_k' in hb), Object.keys(hb));
  ck('model-id exact zonder datum', hb.model === 'claude-haiku-5-5', hb.model);

  console.log('\n— request-body: Sonnet/Opus byte-identiek —');
  for (const m of ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001']) {
    const verwacht = JSON.stringify({ model: m, max_tokens: 350, system: 's', messages: [{ role: 'user', content: 'hallo' }] });
    let raw = null;
    global.fetch = async (u, o) => { raw = o.body; return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'x' }] }) }; };
    await anthropic.generateText({ model: m, system: 's', messages: MSG, maxTokens: 350 });
    ck(`${m}: body gelijk aan het oude formaat`, raw === verwacht, raw);
  }

  console.log('\n— geen prefill (assistant-beurt laatst) —');
  stubFetch({ content: [{ type: 'text', text: 'ok' }] });
  await anthropic.generateText({ model: 'claude-haiku-5-5', messages: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }], maxTokens: 100 });
  ck('Haiku 5.5: laatste beurt is user', laatsteBody.messages[laatsteBody.messages.length - 1].role === 'user', laatsteBody.messages);
  await anthropic.generateText({ model: 'claude-haiku-5-5', messages: [{ role: 'assistant', content: 'hoi' }, { role: 'user', content: 'a' }], maxTokens: 100 });
  ck('gesprek dat met assistant begint eindigt nog steeds op user', laatsteBody.messages[laatsteBody.messages.length - 1].role === 'user' && laatsteBody.messages[0].role === 'user', laatsteBody.messages);

  console.log('\n— antwoord met thinking-blok eerst —');
  stubFetch({ content: [{ type: 'thinking', thinking: 'hmm', signature: 'x' }, { type: 'text', text: 'Hallo!' }],
              stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 4 } });
  const r1 = await anthropic.generateText({ model: 'claude-haiku-5-5', messages: MSG, maxTokens: 100 });
  ck('alleen de tekst, geen thinking', r1.text === 'Hallo!' && r1.inputTokens === 9 && r1.outputTokens === 4, r1);

  console.log('\n— refusal / max_tokens zonder tekst —');
  stubFetch({ content: [], stop_reason: 'refusal', usage: { input_tokens: 3, output_tokens: 0 } });
  let fout = null;
  try { await anthropic.generateText({ model: 'claude-haiku-5-5', messages: MSG, maxTokens: 100 }); } catch (e) { fout = e; }
  ck('refusal -> ProviderError met code refusal', fout && fout.name === 'ProviderError' && fout.code === 'refusal', fout && fout.code);
  stubFetch({ content: [{ type: 'thinking', thinking: 'lang' }], stop_reason: 'max_tokens' });
  fout = null;
  try { await anthropic.generateText({ model: 'claude-haiku-5-5', messages: MSG, maxTokens: 100 }); } catch (e) { fout = e; }
  ck('max_tokens zonder tekst -> fout', fout && fout.name === 'ProviderError' && fout.code === 'max_tokens_empty', fout && fout.code);
  stubFetch({ content: [{ type: 'text', text: 'half antwoo' }], stop_reason: 'max_tokens' });
  const r2 = await anthropic.generateText({ model: 'claude-haiku-5-5', messages: MSG, maxTokens: 100 });
  ck('max_tokens MET tekst blijft een antwoord', r2.text === 'half antwoo', r2);

  console.log('\n— prijs —');
  const p = (i, o, m = 'claude-haiku-5-5') => registry.kostenUsd({ model: m, inputTokens: i, outputTokens: o });
  ck('100k in = $0,01', Math.abs(p(100000, 0) - 0.01) < 1e-9, p(100000, 0));
  ck('100k in + 1M uit = 0,01 + 0,50', Math.abs(p(100000, 1e6) - 0.51) < 1e-9, p(100000, 1e6));
  ck('exact 100.000 valt nog in de lage staffel', Math.abs(p(100000, 0) - 0.01) < 1e-9, p(100000, 0));
  ck('100.001 -> hele verzoek tegen 0,50 / 2,50', Math.abs(p(100001, 1e6) - (100001 / 1e6 * 0.50 + 2.50)) < 1e-9, p(100001, 1e6));
  ck('typische beurt 10k/700 = $0,00135', Math.abs(p(10000, 700) - 0.00135) < 1e-9, p(10000, 700));
  ck('4.5 blijft 1,00 / 5,00', registry.kostenUsd({ model: 'claude-haiku-4-5-20251001', inputTokens: 1e6, outputTokens: 1e6 }) === 6, null);
  ck('prijsrij draagt bron + datum', registry.PRICING['claude-haiku-5-5'].bron === 'lijstprijs' && registry.PRICING['claude-haiku-5-5'].bijgewerkt === '2026-10-09', null);

  console.log('\n— klant-credits per Faro-beurt ongewijzigd —');
  for (const [i, o] of [[3000, 500], [10000, 700], [60000, 4000], [150000, 4000]]) {
    const oud = credits.creditsForChatTurn({ inputTokens: i, outputTokens: o, model: 'claude-haiku-4-5-20251001' });
    const nieuw = credits.creditsForChatTurn({ inputTokens: i, outputTokens: o, model: 'claude-haiku-5-5' });
    ck(`${i}/${o}: credits gelijk (${oud.credits})`, nieuw.credits === oud.credits && nieuw.priced === true, { oud: oud.credits, nieuw: nieuw.credits });
  }
  const t = credits.creditsForChatTurn({ inputTokens: 10000, outputTokens: 700, model: 'claude-haiku-5-5' });
  ck('echte kost (rapport) is de 5.5-prijs, 10x lager dan de credit-referentie',
     Math.abs(t.realCostEur - 0.00135 * 0.92) < 1e-9 && t.realCostEur < t.costEur / 9, t);
  ck('kostenrapport (usage) gebruikt de echte prijs', Math.abs(registry.kostenUsd({ model: 'claude-haiku-5-5', inputTokens: 100000 }) - 0.01) < 1e-9, null);
  ck('creditModel van andere modellen is onveranderd', registry.creditModel('claude-sonnet-5') === 'claude-sonnet-5', null);

  console.log('\n— Faro (streaming) —');
  function sse(events) { return events.map((e) => 'event: x\ndata: ' + JSON.stringify(e) + '\n\n').join(''); }
  function stubStream(events) {
    global.fetch = async (url, opts) => {
      laatsteBody = JSON.parse(opts.body);
      const bytes = new TextEncoder().encode(sse(events));
      let gedaan = false;
      return { ok: true, status: 200, body: { getReader: () => ({
        read: async () => (gedaan ? { done: true } : (gedaan = true, { done: false, value: bytes })),
        cancel: () => {},
      }) } };
    };
  }
  async function drain(model) {
    const uit = [];
    for await (const ev of faro.streamChat({ system: 's', messages: [{ role: 'user', content: [{ type: 'text', text: 'hoi' }] }], tools: [], model })) uit.push(ev);
    return uit;
  }
  stubStream([
    { type: 'message_start', message: { usage: { input_tokens: 7 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'denken' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'sig' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Dag' } },
    { type: 'content_block_stop', index: 1 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ]);
  const ev = await drain('claude-haiku-5-5');
  ck('Faro-body: thinking uit + effort low', laatsteBody.thinking.type === 'disabled' && laatsteBody.output_config.effort === 'low', laatsteBody);
  ck('Faro-body: max_tokens 4096 -> 5325', laatsteBody.max_tokens === 5325, laatsteBody.max_tokens);
  ck('Faro-body: geen temperature/top_p/top_k', !('temperature' in laatsteBody) && !('top_p' in laatsteBody) && !('top_k' in laatsteBody), null);
  ck('thinking-deltas worden genegeerd, tekst komt door',
     ev.filter((e) => e.type === 'text').map((e) => e.text).join('') === 'Dag' && !ev.some((e) => /think/.test(JSON.stringify(e))), ev);
  await drain('claude-sonnet-5');
  ck('Faro Sonnet: geen thinking/output_config, max_tokens 4096',
     !('thinking' in laatsteBody) && !('output_config' in laatsteBody) && laatsteBody.max_tokens === 4096, laatsteBody);
  stubStream([
    { type: 'message_start', message: { usage: { input_tokens: 7 } } },
    { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0 } },
    { type: 'message_stop' },
  ]);
  fout = null;
  try { await drain('claude-haiku-5-5'); } catch (e) { fout = e; }
  ck('Faro: refusal -> ProviderError code refusal, niet retryable', fout && fout.code === 'refusal' && fout.retryable === false, fout && fout.code);

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
