/*
 * api/_errors.js -- de gedeelde foutentaxonomie.
 *
 * Puur en zonder Airtable: elke categorie krijgt de juiste status en een
 * klant-veilige boodschap, en een onverwachte fout lekt nooit zijn eigen
 * message() naar de klant.
 */
'use strict';

const errors = require('../api/_errors.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 300));
  ok ? pass++ : fail++;
};

console.log('\n— elke categorie heeft een status en een fabriek —');
{
  const gevallen = [
    ['auth', 401], ['authorization', 403], ['validation', 400],
    ['integration', 502], ['booking', 409], ['payment', 402],
    ['generation', 502], ['database', 500], ['internal', 500],
  ];
  for (const [naam, status] of gevallen) {
    const e = errors[naam]('test');
    ck(`${naam} geeft status ${status}`, e.status === status, e.status);
    ck(`${naam} is een HelvaroError`, e instanceof errors.HelvaroError, e);
  }
}

console.log('\n— voorKlant() lekt nooit een oorzaak —');
{
  const onderliggend = new Error('SELECT * FROM credit_transactions WHERE token=sk_live_xxx faalde');
  const e = errors.database('Er ging iets mis aan onze kant. Probeer het straks opnieuw.', { oorzaak: onderliggend });
  const klant = e.voorKlant();
  ck('de klant-boodschap bevat de onderliggende fout niet', !JSON.stringify(klant).includes('sk_live'), klant);
  ck('voorKlant() geeft alleen error (en optioneel code)',
     Object.keys(klant).every((k) => k === 'error' || k === 'code'), klant);
  ck('voorLog() bevat de oorzaak WEL, voor de server-logs',
     e.voorLog().includes('SELECT * FROM credit_transactions'), e.voorLog());
}

console.log('\n— code komt mee als hij gezet is —');
{
  const e = errors.booking('Dat moment is al bezet.', { code: 'slot_conflict' });
  ck('code staat in voorKlant()', e.voorKlant().code === 'slot_conflict', e.voorKlant());
}

console.log('\n— inpakken() ──');
{
  const echt = new Error('Airtable timeout');
  const ingepakt = errors.inpakken(echt, 'INTEGRATION');
  ck('een gewone Error wordt een HelvaroError', ingepakt instanceof errors.HelvaroError, ingepakt);
  ck('met de gevraagde categorie', ingepakt.categorie === 'INTEGRATION', ingepakt.categorie);
  ck('en de klant-boodschap lekt de onderliggende fout niet',
     !JSON.stringify(ingepakt.voorKlant()).includes('Airtable timeout'), ingepakt.voorKlant());

  const albekend = errors.validation('Ongeldige startTime');
  ck('een HelvaroError komt ongewijzigd terug uit inpakken()',
     errors.inpakken(albekend) === albekend, null);

  const onbekend = errors.inpakken('geen Error-object, gewoon een string');
  ck('een niet-Error wordt ook veilig ingepakt (valt terug op INTERNAL)',
     onbekend instanceof errors.HelvaroError && onbekend.categorie === 'INTERNAL', onbekend);
}

console.log('\n— een aangepaste status blijft mogelijk —');
{
  const e = errors.validation('Ongeldig afspraaktype', { status: 422 });
  ck('opts.status overschrijft de standaardstatus van de categorie', e.status === 422, e.status);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
