'use strict';
/* Een Faro-beurt eindigt nooit zonder tekst (live gezien 2026-10-10: elf leads
 * "frade", het model zocht tot het plafond van gereedschapsrondes en de beurt
 * eindigde met alleen kaartjes). Nep-provider die altijd weer een tool vraagt. */
const assert = require('assert');
const path = require('path');
const F = path.join(__dirname, '..', 'api', '_faro');
const providers = require(path.join(F, 'providers'));
let rondes = 0;
providers.getProvider = () => ({
  async *streamChat() { rondes++; yield { type: 'tool_call', id: 't' + rondes, name: 'search_leads', input: { q: 'frade' } }; yield { type: 'done', usage: { inputTokens: 10, outputTokens: 5 } }; },
});
const prompt = require(path.join(F, 'prompt')); prompt.build = async () => 'systeem';
const tools = require(path.join(F, 'tools'));
tools.definitions = () => [{ name: 'search_leads' }];
tools.get = () => ({ run: async () => ({ summary: '11 leads', components: [{ type: 'lead', naam: 'frade' }] }) });
const store = require(path.join(F, 'store'));
store.windowForModel = (h, u) => [{ role: 'user', content: u }];
store.appendMessage = async () => {}; store.createConversation = async () => ({ id: 'c1' }); store.deriveTitle = () => 't';
const credits = require(path.join(__dirname, '..', 'api', '_credits.js'));
credits.checkCredits = async () => ({ allowed: true }); credits.recordUsage = async () => {};
credits.creditsForChatTurn = () => ({ credits: 1, costEur: 0, realCostEur: 0, priced: true });
const { runTurn } = require(path.join(F, 'orchestrator.js'));
const events = [];
const res = { write(s) { events.push(String(s)); return true; }, setHeader() {}, writeHead() {}, end() {}, flushHeaders() {}, on() {} };
(async () => {
  await runTurn({ res, ctx: { projectCode: 'TEST01', userId: 'u1', lang: 'nl' }, conversationId: 'c1', history: [], userContent: [{ type: 'text', text: 'Voeg een notitie toe aan frade' }], tier: 'standard' });
  const alles = events.join('');
  assert.ok(rondes >= 2, 'het model vroeg herhaaldelijk tools: ' + rondes);
  assert.ok(/specifieker/.test(alles), 'de beurt eindigt met tekst, niet stil');
  console.log('faro-geen-stille-beurt: ok (' + rondes + ' rondes)');
})().catch((e) => { console.error(e); process.exit(1); });
