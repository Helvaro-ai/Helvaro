// Draait api/_faro/store.js tegen de ECHTE base. Ruimt alles op wat hij maakt.
// LIVE-test: praat met de ECHTE Airtable-base en maakt records aan. Draait
// alleen met credentials in de omgeving, en ruimt in een finally-blok alles op
// wat hij zelf gemaakt heeft — ook als er halverwege iets misgaat.
//
//   vercel env pull .env.local
//   node tests/faro-store-live.test.js
//
// Slaat zichzelf over als er geen credentials zijn, zodat hij in een gewone
// testronde niet rood wordt.
const fs = require('fs'), path = require('path');
(function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(__dirname, '..', name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    break;
  }
})();
if (!process.env.API_AIRTABLE || !process.env.BASE_AIRTABLE) {
  console.log('\nOVERGESLAGEN — API_AIRTABLE/BASE_AIRTABLE niet gezet.');
  console.log('Haal ze op met: npx vercel env pull .env.local');
  process.exit(0);
}
const s = require(path.join(__dirname, '..', 'api/_faro/store.js'));
let pass=0, fail=0;
const ck=(n,ok,got)=>{console.log(`  ${ok?'OK  ':'FOUT'}  ${n}${ok?'':'  → '+JSON.stringify(got)}`);ok?pass++:fail++;};
const A='ZZ_TEST_A_'+Date.now(), B='ZZ_TEST_B_'+Date.now();
let convA=null, convB=null;
(async()=>{
  try {
    ck('store ziet een database', s.configured(), s.configured());
    ck('en de tabel bestaat', await s.available(), await s.available());

    convA = await s.createConversation(A, 'user_a', { title: 'Testgesprek A' });
    ck('gesprek aanmaken', !!(convA && convA.id), convA);
    convB = await s.createConversation(B, 'user_b', { title: 'Testgesprek B' });
    ck('tweede tenant ook', !!(convB && convB.id), convB);

    const readA = await s.getConversation(A, convA.id);
    ck('eigen gesprek terugleesbaar', readA && readA.title === 'Testgesprek A', readA);

    // De belangrijkste: tenant B mag het gesprek van A NIET zien, ook niet met de exacte id.
    const cross = await s.getConversation(B, convA.id);
    ck('andere tenant krijgt null met de JUISTE id', cross === null, cross);

    const listA = await s.listConversations(A, {});
    ck('lijst bevat alleen eigen gesprekken', listA.length === 1 && listA[0].id === convA.id, listA.map(c=>c.title));

    const m1 = await s.appendMessage(A, convA.id, { role: 'user', content: [{type:'text',text:'hallo'}] });
    const m2 = await s.appendMessage(A, convA.id, { role: 'assistant', content: [{type:'text',text:'dag!'}], tokensIn: 12, tokensOut: 5 });
    ck('berichten wegschrijven', !!(m1 && m2), { m1: !!m1, m2: !!m2 });

    const msgs = await s.listMessages(A, convA.id);
    ck('berichten terug in volgorde', msgs.length === 2 && msgs[0].role === 'user' && msgs[1].role === 'assistant', msgs.map(m=>m.role));
    ck('inhoud overleeft de rondgang', msgs[0].content[0] && msgs[0].content[0].text === 'hallo', msgs[0].content);

    const crossMsgs = await s.listMessages(B, convA.id);
    ck('andere tenant leest GEEN berichten', crossMsgs.length === 0, crossMsgs);

    const renamed = await s.renameConversation(A, convA.id, 'Hernoemd');
    ck('hernoemen werkt', renamed && renamed.title === 'Hernoemd', renamed);
    const crossRename = await s.renameConversation(B, convA.id, 'GEKAAPT');
    ck('andere tenant kan NIET hernoemen', crossRename === null, crossRename);
    const after = await s.getConversation(A, convA.id);
    ck('en de titel is niet gekaapt', after.title === 'Hernoemd', after.title);
  } catch (e) {
    console.log('  FOUT  onverwacht:', e.message); fail++;
  } finally {
    // Opruimen, ook als er iets misging.
    try { if (convA) await s.deleteConversation(A, convA.id); } catch(e){}
    try { if (convB) await s.deleteConversation(B, convB.id); } catch(e){}
    const leftA = convA ? await s.getConversation(A, convA.id) : null;
    ck('opgeruimd', leftA === null, leftA);
    console.log(`\n${pass} geslaagd, ${fail} gefaald`);
    process.exit(fail?1:0);
  }
})();
