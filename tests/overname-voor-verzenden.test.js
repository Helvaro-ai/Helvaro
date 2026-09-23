/*
 * Overname vlak voor het versturen (2026-09-23).
 *
 * De AI-pauze ('Neem over') werd alleen aan het begin van een WhatsApp-beurt
 * gecontroleerd. Tussen die controle en het versturen zitten de AI-aanroep en
 * de antwoordpauze. Nu: vlak voor sendWA wordt de lead vers gelezen; staat de
 * pauze of de afmelding er dan, dan vertrekt het antwoord NIET. En alles wat
 * daarna Notities/historie schrijft, bouwt op die verse versie -- zodat een
 * pauze of handmatig antwoord van tijdens de beurt niet overschreven wordt.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

const src = fs.readFileSync(BASE + 'api/whatsapp.js', 'utf8');

console.log('\nvolgorde in processMessage');
{
  const iAi    = src.indexOf('const aiResponse = await runAI(');
  const iVers  = src.indexOf('const vers = await verseLeadVoorVerzenden(lead.id);');
  const iPauze = src.indexOf("const pauzeNu = getAiPauseInfo(vers.fields[NOTITIES_FIELD] || vers.fields['Notities']);");
  const iRet   = src.indexOf('return;', iPauze);
  const iSend  = src.indexOf('const sendOk = await sendWA(phone, replyText, clientPhoneNumberId);');
  ck('verse lezing NA de AI-aanroep', iAi !== -1 && iVers > iAi, { iAi, iVers });
  ck('verse lezing VOOR het versturen', iVers !== -1 && iSend > iVers, { iVers, iSend });
  ck('pauze op de verse versie gecontroleerd', iPauze > iVers && iPauze < iSend);
  ck('bij pauze stopt de beurt vóór sendWA', iRet > iPauze && iRet < iSend);
  ck('afmelding tijdens de beurt telt ook', /const afgemeldNu = _optout\.isAfgemeld\(vers\.fields\);/.test(src));
  ck('lead.fields wordt de verse versie (merges bouwen daarop)', src.indexOf('lead.fields = vers.fields;') > iVers && src.indexOf('lead.fields = vers.fields;') < iSend);
  ck('het ingehouden antwoord wordt gelogd', src.includes("'ai_reply_withheld'"));
  ck('het model krijgt maximaal 20 beurten', src.includes('await runAI(history.slice(-20), aiInstructions,'));
  ck('opslag houdt 50 beurten (zelfde als handmatig)', src.includes('if (history.length > 50) history = history.slice(-50);'));
}

console.log('\nvoegInkomendToe');
{
  process.env.FARO_WORKSPACE_ENABLED = '1';
  const { voegInkomendToe } = require(BASE + 'api/whatsapp.js')._test;
  const item = { role: 'user', content: 'Is de X5 er nog?', ts: 1000, mid: 'wamid.A' };
  const vers = JSON.stringify([{ role: 'assistant', content: 'Hoi!' }, { role: 'assistant', content: 'Ja, handmatig antwoord', manual: true }]);
  const h = voegInkomendToe(vers, item);
  ck('verse regels blijven (ook het handmatige antwoord)', h.length === 3 && h[1].manual === true, h);
  ck('het inkomende bericht staat achteraan', h[2] === item);
  const al = voegInkomendToe(JSON.stringify([item]), item);
  ck('niet dubbel als het er al staat (mid)', al.length === 1, al);
  ck('kapotte historie → alleen het bericht', voegInkomendToe('{kapot', item).length === 1);
  ck('lege historie → alleen het bericht', voegInkomendToe('', item).length === 1);
}

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
