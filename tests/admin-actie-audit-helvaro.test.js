/*
 * Admin action audit voor mutaties ZONDER tenant (brief §39-40: "audit every
 * admin endpoint" -- niet "elke admin endpoint met een klant").
 *
 * api/admin.js's founder-modi (eigen salespipeline, doelen, WhatsApp-
 * templates indienen, het eigen Drive-account, een uitnodigingsmail) hebben
 * geen projectCode om een spoor op te boeken -- logAdminAction() loggde ze
 * daarom voorheen HELEMAAL NIET. Dat was zelf het gat: "elke admin-mutatie"
 * geldt ook voor mutaties zonder klant. Deze test bewijst dat zulke mutaties
 * nu wél een spoor achterlaten, onder de tenant-loze partitie '_HELVARO'.
 */
'use strict';

process.env.ADMIN_KEY = 'test-admin-sleutel-niet-echt';
process.env.BASE_AIRTABLE = 'appZelftest';
process.env.API_AIRTABLE = 'patZelftest';

const crypto = require('crypto');
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 300)}`);
  ok ? pass++ : fail++;
};

const ADMIN_TOKEN = crypto
  .createHmac('sha256', process.env.ADMIN_KEY)
  .update('helvaro-admin-v1')
  .digest('hex');

const ACTIVITEIT_TABLE = 'tblzZSLA5wp60WVZm';
const PIPELINE_TABLE = 'tblihBS81FqGUZoY1';
const GOALS_TABLE = 'tblAFVa64xoHmp942';

const posted = [];
global.fetch = async (url, opts) => {
  const u = String(url);
  const method = (opts && opts.method) || 'GET';
  if (method === 'POST' && u.includes(ACTIVITEIT_TABLE)) {
    posted.push(JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ id: 'recNieuw' }), text: async () => '' };
  }
  if (u.includes(ACTIVITEIT_TABLE) && u.endsWith('pageSize=1')) {
    return { ok: true, status: 200, json: async () => ({ records: [] }), text: async () => '' };
  }
  if (method === 'POST' && u.includes(PIPELINE_TABLE)) {
    return { ok: true, status: 200, json: async () => ({ id: 'recPipeline1' }), text: async () => '' };
  }
  if (method === 'DELETE' && u.includes(GOALS_TABLE)) {
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  }
  return { ok: true, status: 200, text: async () => '', json: async () => ({ records: [] }) };
};

const admin = require(BASE + 'api/admin.js');
const _activiteit = require(BASE + 'api/_activiteit.js');
_activiteit._resetAvailability();

let _ipTeller = 0;
function roep(body, token) {
  const ip = '198.51.100.' + (_ipTeller++ % 250);
  return new Promise((klaar) => {
    let code = 0, payload = null;
    const res = {
      setHeader() {}, getHeader() { return null; },
      status(c) { code = c; return this; },
      json(b) { payload = b; klaar({ code, body: payload }); return this; },
      send(b) { payload = b; klaar({ code, body: payload }); return this; },
      end() { klaar({ code, body: payload }); },
    };
    const headers = { 'content-type': 'application/json', 'x-forwarded-for': ip };
    if (token) headers['x-api-key'] = token;
    admin({ method: 'POST', url: '/api/admin', headers, body }, res);
  });
}

(async () => {
  console.log('\nAdmin action audit — mutaties zonder tenant (_HELVARO)');

  console.log('\n  pipeline-create logt onder _HELVARO, niet stilzwijgend');
  {
    posted.length = 0;
    const r = await roep({ mode: 'pipeline-create', naam: 'Test Prospect' }, ADMIN_TOKEN);
    ck('de mutatie zelf lukt', r.code === 200 && r.body.success === true, r);
    await new Promise((res) => setTimeout(res, 20));
    const rec = posted.find((p) => p.fields && p.fields['Type'] === 'admin_action_performed');
    ck('er staat een admin_action_performed-record klaar', !!rec, posted);
    if (rec) {
      ck('onder de tenant-loze partitie _HELVARO', rec.fields['Project Code'] === '_HELVARO', rec.fields);
      const details = JSON.parse(rec.fields['Details'] || '{}');
      ck('met de juiste actie', details.actor === 'admin' && details.action === 'pipeline-create', details);
    }
  }

  console.log('\n  goal-delete logt ook onder _HELVARO');
  {
    posted.length = 0;
    const r = await roep({ mode: 'goal-delete', id: 'recDoelXYZ1234567' }, ADMIN_TOKEN);
    ck('de mutatie zelf lukt', r.code === 200 && r.body.success === true, r);
    await new Promise((res) => setTimeout(res, 20));
    const rec = posted.find((p) => p.fields && p.fields['Type'] === 'admin_action_performed');
    ck('er staat een admin_action_performed-record klaar', !!rec, posted);
    if (rec) {
      ck('onder de tenant-loze partitie _HELVARO', rec.fields['Project Code'] === '_HELVARO', rec.fields);
    }
  }

  console.log('\n  zonder geldige admin-sleutel blijft alles op 401, ook deze modi');
  {
    const r1 = await roep({ mode: 'pipeline-create', naam: 'X' });
    ck('pipeline-create zonder sleutel geeft 401', r1.code === 401, r1);
    const r2 = await roep({ mode: 'goal-delete', id: 'recX' }, 'niet-de-sleutel');
    ck('goal-delete met verkeerde sleutel geeft 401', r2.code === 401, r2);
  }

  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
