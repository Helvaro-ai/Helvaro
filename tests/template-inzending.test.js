/*
 * Templates indienen vanuit de back-office: dezelfde definities als het
 * script, droogloop zonder `commit`, bestaande overslaan, geen token in het
 * antwoord.
 */
'use strict';
const fs = require('fs'); const path = require('path');
let pass = 0, fail = 0;
const ck = (n, ok, ctx) => { console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`); if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300)); ok ? pass++ : fail++; };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const t = require('../api/_wa-template-teksten');

(async () => {
  console.log('\n— één bron —');
  ck('24 templates (6 x 4 talen), zonder dubbele naam+taal', t.TEMPLATES.length === 24 && new Set(t.TEMPLATES.map((x) => x.name + '::' + x.language)).size === 24);
  ck('elke template heeft evenveel voorbeelden als variabelen', t.TEMPLATES.every((x) => x.examples.length === Math.max(0, ...[...x.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))));
  const script = strip(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'create-wa-templates.js'), 'utf8'));
  ck('het script leest de module en heeft geen eigen TEKSTEN meer', /require\('\.\.\/api\/_wa-template-teksten'\)/.test(script) && !/const TEKSTEN\s*=/.test(script));

  console.log('\n— indienen —');
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || 'GET', body: opts && opts.body ? JSON.parse(opts.body) : null, auth: opts && opts.headers && opts.headers.Authorization });
    if (String(url).includes('message_templates?')) {
      return { ok: true, json: async () => ({ data: [{ name: 'helvaro_nieuw_aanbod', language: 'nl_BE', status: 'APPROVED', category: 'MARKETING' }] }) };
    }
    return { ok: true, json: async () => ({ id: '123', status: 'PENDING' }) };
  };
  const droog = await t.dienIn({ wabaId: '1000', token: 'tok-nooit-echt', alleen: ['helvaro_nieuw_aanbod'], commit: false });
  ck('droogloop maakt niets aan', calls.filter((c) => c.method === 'POST').length === 0);
  ck('bestaande nl_BE wordt overgeslagen, de andere drie zouden aangemaakt worden',
     droog.resultaten.filter((r) => r.action === 'skipped').length === 1 && droog.resultaten.filter((r) => r.action === 'would_create').length === 3, JSON.stringify(droog.resultaten));
  calls.length = 0;
  const echt = await t.dienIn({ wabaId: '1000', token: 'tok-nooit-echt', alleen: ['helvaro_dealer_herinnering'], commit: true });
  ck('met commit: vier POSTs (vier talen)', calls.filter((c) => c.method === 'POST').length === 4, calls.length);
  const post = calls.find((c) => c.method === 'POST');
  ck('payload heeft BODY met voorbeelden en categorie UTILITY', post && post.body.category === 'UTILITY' && post.body.components[0].example.body_text[0].length === 3, post && JSON.stringify(post.body).slice(0, 200));
  ck('en de token staat alleen in de Authorization-header, niet in het resultaat', !JSON.stringify(echt).includes('tok-nooit-echt'));
  ck('een onbekende naam in `alleen` levert niets op', (await t.dienIn({ wabaId: '1000', token: 'x', alleen: ['bestaat_niet'], commit: true })).resultaten.length === 0);

  console.log('\n— de admin-mode —');
  const admin = strip(fs.readFileSync(path.join(__dirname, '..', 'api', 'admin.js'), 'utf8'));
  const i = admin.indexOf("body.mode === 'ops-templates-submit'");
  const blok = admin.slice(i, i + 1600);
  ck('de mode bestaat en eist een admin-token', i > 0 && /isValidAdminToken\(provided, ADMIN_KEY\)/.test(blok));
  ck('commit is expliciet (=== true), geen truthy-string', /commit: body\.commit === true/.test(blok));
  ck('namen in `alleen` worden gevalideerd', /\^\[a-z0-9_\]\{1,80\}\$/.test(blok));
  ck('het antwoord bevat nooit het token', !/token[^\n]*json\(/.test(blok) && /resultaten: uit\.resultaten/.test(blok));

  console.log(`\n${pass} ok, ${fail} fout\n`);
  process.exit(fail ? 1 : 0);
})();
