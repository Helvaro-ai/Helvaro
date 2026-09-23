/*
 * api/_schema.js — het migratieplan is additief en idempotent.
 */
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..') + '/';
const schema = require(BASE + 'api/_schema.js');

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + String(JSON.stringify(got)).slice(0, 200)}`);
  ok ? pass++ : fail++;
};

console.log('\nlege base (alleen de bestaande tabellen, zonder nieuwe velden)');
const bestaand = [
  { id: 'tblPidTrwGRzRt4LZ', name: 'Client Config', fields: [{ name: 'Client Name' }] },
  { id: 'tbliukTnDAbEDcZmt', name: 'Leads', fields: [{ name: 'Name' }, { name: 'Email' }] },
  { id: 'tblQAPdjEsh0l7lUe', name: 'vehicles', fields: [{ name: 'Vehicle Code' }] },
];
let p = schema.plan(bestaand);
ck('vier nieuwe tabellen', p.nieuweTabellen.map((t) => t.naam).sort().join() === 'conversations,customers,handoffs,messages', p.nieuweTabellen.map((t) => t.naam));
ck('bestaand Leads.Email wordt NIET opnieuw aangemaakt', !p.nieuweVelden.some((v) => v.label === 'Leads' && v.veld.name === 'Email'));
ck('Leads.Customer ID ontbreekt en komt erbij', p.nieuweVelden.some((v) => v.label === 'Leads' && v.veld.name === 'Customer ID'));
ck('Client Config krijgt de mailbox- en voorraadvelden', ['Email Token', 'Site Key', 'Inventory State'].every((n) => p.nieuweVelden.some((v) => v.label === 'Client Config' && v.veld.name === n)));

console.log('\ntweede run na aanmaken = niets te doen');
const naAanmaak = bestaand.map((t) => ({ ...t, fields: t.fields.slice() }));
for (const [naam, def] of Object.entries(schema.TABELLEN)) naAanmaak.push({ id: 'tblX' + naam, name: naam, fields: def.fields.map((f) => ({ name: f.name })) });
for (const [id, def] of Object.entries(schema.EXTRA_VELDEN)) {
  const t = naAanmaak.find((x) => x.id === id);
  for (const f of def.fields) if (!t.fields.some((x) => x.name === f.name)) t.fields.push({ name: f.name });
}
p = schema.plan(naAanmaak);
ck('geen tabellen', p.nieuweTabellen.length === 0, p.nieuweTabellen);
ck('geen velden', p.nieuweVelden.length === 0, p.nieuweVelden.map((v) => v.label + '.' + v.veld.name));

console.log('\nontbrekende bestaande tabel wordt niet aangemaakt');
p = schema.plan([]);
ck('alleen onze vier tabellen, geen Client Config/Leads', p.nieuweTabellen.length === 4 && !p.nieuweVelden.length);

console.log('\nveiligheid van de definities');
const alleVelden = Object.values(schema.TABELLEN).flatMap((d) => d.fields).concat(Object.values(schema.EXTRA_VELDEN).flatMap((d) => d.fields));
ck('alleen tekst/lang/vink (geen types die typecast of opties vragen)', alleVelden.every((f) => ['singleLineText', 'multilineText', 'checkbox'].includes(f.type)));
ck('het eerste veld van elke nieuwe tabel is een sleutel-tekstveld', Object.values(schema.TABELLEN).every((d) => d.fields[0].type === 'singleLineText'));
ck('elke nieuwe tabel draagt Project Code (tenant)', Object.values(schema.TABELLEN).every((d) => d.fields.some((f) => f.name === 'Project Code')));
ck('ensure zonder configuratie gooit niet', (async () => (await schema.ensure()).reden === 'niet_geconfigureerd')() instanceof Promise);

console.log(`\n  ${pass} ok, ${fail} fout\n`);
process.exit(fail ? 1 : 0);
