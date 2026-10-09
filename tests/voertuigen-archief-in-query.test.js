'use strict';
/* Gearchiveerde wagens worden nooit verwijderd. list() haalde ze toch op en
 * filterde ze pas daarna weg, waardoor ze de paginalimiet (10 x 100) opaten en
 * een dealer met een lange verkoopgeschiedenis actieve wagens uit zijn lijst
 * zag vallen. Nu laat Airtable ze weg, behalve als de aanroeper ze vraagt. */
const assert = require('assert');
const path = require('path');
process.env.BASE_AIRTABLE = 'appTest'; process.env.API_AIRTABLE = 'patTest';
const formules = [];
global.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const m = /filterByFormula=([^&]*)/.exec(u);
  if (m) formules.push(m[1]);
  return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
};
const v = require(path.join(__dirname, '..', 'api', '_vehicles.js'));
(async () => {
  await v.list('DEALER1');
  assert.ok(/NOT\(\{Archived\}\)/.test(formules.pop()), 'zonder archief: Airtable filtert gearchiveerde wagens');
  await v.list('DEALER1', { inclusiefGearchiveerd: true });
  assert.ok(!/Archived/.test(formules.pop()), 'met archief: geen archieffilter');
  console.log('voertuigen-archief-in-query: ok');
})().catch(e => { console.error(e); process.exit(1); });
