'use strict';
/*
 * Eén kenmerk per bericht op elke logregel (audit L-5): api/_trace.js.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  process.stdout.write(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 240)}\n`);
  ok ? pass++ : fail++;
};

/* Vang wat console schrijft ZONDER de omwikkeling van _trace te omzeilen:
   we vervangen de onderliggende stdout-schrijver, niet console.log zelf. */
const gevangen = [];
const echt = process.stdout.write.bind(process.stdout);
const echtErr = process.stderr.write.bind(process.stderr);
function vang(fn) {
  gevangen.length = 0;
  process.stdout.write = (s) => { gevangen.push(String(s)); return true; };
  process.stderr.write = (s) => { gevangen.push(String(s)); return true; };
  return Promise.resolve(fn()).finally(() => { process.stdout.write = echt; process.stderr.write = echtErr; });
}

const trace = require('../api/_trace.js');

(async () => {
  process.stdout.write('\nKenmerk per bericht\n');

  const id = trace.maakId('wa', 'wamid.HBgLMzI0NzgxMjM0NTY3FQIAEhg');
  ck('vorm: soort + 6 hex', /^wa-[0-9a-f]{6}$/.test(id), id);
  ck('hetzelfde bericht krijgt hetzelfde kenmerk (herbezorging herkenbaar)', trace.maakId('wa', 'wamid.HBgLMzI0NzgxMjM0NTY3FQIAEhg') === id);
  ck('ander bericht, ander kenmerk', trace.maakId('wa', 'wamid.ander') !== id);
  const telId = trace.maakId('wa', '32470123456');
  ck('bevat nooit het nummer zelf', !/3247|0123|456/.test(telId), telId);
  ck('zonder bron: willekeurig maar geldig', /^form-[0-9a-f]{6}$/.test(trace.maakId('form')));

  await vang(() => trace.met('wa-abc123', async () => {
    console.log('[WhatsApp] start');
    await new Promise((r) => setTimeout(r, 5));
    console.warn('na een timer');
    await Promise.resolve().then(() => console.error({ fout: 'object als eerste argument' }));
    ck('huidig() kent het kenmerk', trace.huidig() === 'wa-abc123');
  }));
  const alles = gevangen.join('');
  ck('gewone regel krijgt het kenmerk', alles.includes('[wa-abc123] [WhatsApp] start'), alles);
  ck('ook na een await en een timer', alles.includes('[wa-abc123] na een timer'), alles);
  ck('ook als het eerste argument geen tekst is', /\[wa-abc123\] \{ fout/.test(alles), alles);

  await vang(() => { console.log('buiten een verwerking'); });
  ck('buiten een verwerking: niets erbij', gevangen.join('') === 'buiten een verwerking\n', gevangen.join(''));

  const a = trace.met('wa-aaaaaa', () => new Promise((r) => setTimeout(() => r(trace.huidig()), 10)));
  const b = trace.met('wa-bbbbbb', () => new Promise((r) => setTimeout(() => r(trace.huidig()), 1)));
  const [ra, rb] = await Promise.all([a, b]);
  ck('twee gelijktijdige berichten lopen niet door elkaar', ra === 'wa-aaaaaa' && rb === 'wa-bbbbbb', [ra, rb]);

  const bron = (f) => fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
  ck('WhatsApp-verwerking loopt onder een kenmerk', /_trace\.met\(traceId, \(\) => \{[\s\S]{0,200}processMessage\(/.test(bron('whatsapp.js')));
  ck('formulier, websitechat en voorraadfeed ook', /_trace\.met\(_trace\.maakId\(soort\), \(\) => formHandler\(req, res\)\)/.test(bron('form.js')));

  process.stdout.write(`\n  ${pass} ok, ${fail} fout\n\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
