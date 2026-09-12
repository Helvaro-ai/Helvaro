/*
 * api/_vehicles.js -- boekbaar(), operationeleStatus(), alternatieven() en
 * kanProefrit(). Puur bestand, geen fetch: alles hier is gewoon input -> output.
 */
'use strict';

const vehicles = require('../api/_vehicles.js');

let pass = 0, fail = 0;
const ck = (n, ok, ctx) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}`);
  if (!ok && ctx !== undefined) console.log('        ' + String(ctx).slice(0, 400));
  ok ? pass++ : fail++;
};

console.log('\n— boekbaar(): de volgorde van prioriteit —');
{
  ck('geen voertuig -> onbekend',
     JSON.stringify(vehicles.boekbaar(null)) === JSON.stringify({ ok: false, reden: 'onbekend' }), null);

  ck('verkocht -> geweigerd met reden verkocht',
     JSON.stringify(vehicles.boekbaar({ status: 'verkocht' })) === JSON.stringify({ ok: false, reden: 'verkocht' }), null);

  ck('uit aanbod -> geweigerd met reden uit_aanbod',
     JSON.stringify(vehicles.boekbaar({ status: 'uit aanbod' })) === JSON.stringify({ ok: false, reden: 'uit_aanbod' }), null);

  ck('gereserveerd -> geweigerd met reden gereserveerd',
     JSON.stringify(vehicles.boekbaar({ status: 'gereserveerd' })) === JSON.stringify({ ok: false, reden: 'gereserveerd' }), null);

  ck('beschikbaar maar met een actieve afspraak -> geweigerd met reden afspraak_bestaat',
     JSON.stringify(vehicles.boekbaar({ status: 'beschikbaar' }, [{ id: 'a1' }])) === JSON.stringify({ ok: false, reden: 'afspraak_bestaat' }), null);

  ck('beschikbaar zonder afspraken -> ok',
     JSON.stringify(vehicles.boekbaar({ status: 'beschikbaar' }, [])) === JSON.stringify({ ok: true, reden: null }), null);

  ck('beschikbaar, geen afsprakenlijst meegegeven -> ok (lege lijst als default)',
     vehicles.boekbaar({ status: 'beschikbaar' }).ok === true, null);

  /* De volgorde is een prioriteit, geen los-van-elkaar lijstje: status-redenen
     winnen ALTIJD van "er is al een afspraak", ook als beide waar zijn. */
  ck('verkocht MET een actieve afspraak geeft nog steeds "verkocht" (niet afspraak_bestaat)',
     vehicles.boekbaar({ status: 'verkocht' }, [{ id: 'a1' }]).reden === 'verkocht', null);
  ck('gereserveerd MET een actieve afspraak geeft nog steeds "gereserveerd"',
     vehicles.boekbaar({ status: 'gereserveerd' }, [{ id: 'a1' }]).reden === 'gereserveerd', null);
}

console.log('\n— kanProefrit —');
{
  ck('kanProefrit("gereserveerd") is false', vehicles.kanProefrit('gereserveerd') === false, null);
  ck('kanProefrit("verkocht") is false', vehicles.kanProefrit('verkocht') === false, null);
  ck('kanProefrit("uit aanbod") is false', vehicles.kanProefrit('uit aanbod') === false, null);
  ck('kanProefrit("beschikbaar") is wel true', vehicles.kanProefrit('beschikbaar') === true, null);
}

console.log('\n— operationeleStatus(): alle zes uitkomsten —');
{
  ck('geen voertuig -> beschikbaar (veilige default)',
     vehicles.operationeleStatus(null) === 'beschikbaar', null);

  ck('status verkocht -> "verkocht"',
     vehicles.operationeleStatus({ status: 'verkocht' }) === 'verkocht', null);

  ck('status uit aanbod -> "uit aanbod"',
     vehicles.operationeleStatus({ status: 'uit aanbod' }) === 'uit aanbod', null);

  ck('status gereserveerd -> "gereserveerd"',
     vehicles.operationeleStatus({ status: 'gereserveerd' }) === 'gereserveerd', null);

  ck('beschikbaar met een actieve afspraak -> "afspraak"',
     vehicles.operationeleStatus({ status: 'beschikbaar' }, [{ id: 'a1' }]) === 'afspraak', null);

  ck('beschikbaar zonder afspraak maar met interesse -> "interesse"',
     vehicles.operationeleStatus({ status: 'beschikbaar' }, [], 3) === 'interesse', null);

  ck('beschikbaar zonder afspraak en zonder interesse -> "beschikbaar"',
     vehicles.operationeleStatus({ status: 'beschikbaar' }, [], 0) === 'beschikbaar', null);

  /* Zelfde prioriteit als boekbaar(): een afspraak wint van "interesse". */
  ck('een actieve afspraak wint van interesse (niet allebei tegelijk tonen)',
     vehicles.operationeleStatus({ status: 'beschikbaar' }, [{ id: 'a1' }], 5) === 'afspraak', null);
}

console.log('\n— alternatieven(): ranking, uitsluiting, determinisme —');
{
  const doel = {
    code: 'V1', merk: 'BMW', model: '3 Serie', carrosserie: 'sedan',
    prijs: 30000, inschrijving: '2020', brandstof: 'diesel', transmissie: 'automaat', status: 'verkocht',
  };

  /* zelfde merk EN model, prijs binnen 20%, bouwjaar binnen 2 jaar, zelfde
     brandstof en transmissie -> de hoogste trap. */
  const zelfdeMerkModel = {
    code: 'V2', merk: 'BMW', model: '3 Serie', carrosserie: 'sedan',
    prijs: 31000, inschrijving: '2021', brandstof: 'diesel', transmissie: 'automaat', status: 'beschikbaar',
  };
  /* alleen zelfde merk, verder niets gemeenschappelijk -> een trap lager. */
  const zelfdeMerk = {
    code: 'V3', merk: 'BMW', model: '5 Serie', carrosserie: 'break',
    prijs: 100000, inschrijving: '2010', brandstof: 'benzine', transmissie: 'manueel', status: 'beschikbaar',
  };
  /* ander merk, alleen dezelfde carrosserie -> nog een trap lager. */
  const zelfdeCarrosserie = {
    code: 'V4', merk: 'Audi', model: 'A6', carrosserie: 'sedan',
    prijs: 90000, inschrijving: '2005', brandstof: 'benzine', transmissie: 'manueel', status: 'beschikbaar',
  };
  /* zelfde merk+model als het doel, dus zou #1 zijn qua score -- maar is
     verkocht, dus moet volledig ontbreken in de uitkomst. */
  const verkochtVariant = {
    code: 'V5', merk: 'BMW', model: '3 Serie', carrosserie: 'sedan',
    prijs: 30500, inschrijving: '2020', brandstof: 'diesel', transmissie: 'automaat', status: 'verkocht',
  };
  /* zelfde verhaal, maar gereserveerd in plaats van verkocht. */
  const gereserveerdVariant = {
    code: 'V6', merk: 'BMW', model: '3 Serie', carrosserie: 'sedan',
    prijs: 30200, inschrijving: '2020', brandstof: 'diesel', transmissie: 'automaat', status: 'gereserveerd',
  };

  const voorraad = [doel, zelfdeMerkModel, zelfdeMerk, zelfdeCarrosserie, verkochtVariant, gereserveerdVariant];

  const uit = vehicles.alternatieven(voorraad, { voertuig: doel }, 10);
  const codes = uit.map((x) => x.voertuig.code);

  ck('het doelvoertuig zelf zit er niet in', !codes.includes('V1'), codes);
  ck('een verkochte concurrent zit er niet in, ook al matcht hij perfect', !codes.includes('V5'), codes);
  ck('een gereserveerde concurrent zit er ook niet in', !codes.includes('V6'), codes);
  ck('de drie overgebleven kandidaten staan er alle drie in', codes.length === 3 && ['V2', 'V3', 'V4'].every((c) => codes.includes(c)), codes);
  ck('ranking: zelfde merk+model (V2) staat bovenaan', codes[0] === 'V2', codes);
  ck('ranking: zelfde merk alleen (V3) staat op de tweede plaats', codes[1] === 'V3', codes);
  ck('ranking: zelfde carrosserie alleen (V4) staat als laatste', codes[2] === 'V4', codes);

  const redenenV2 = uit.find((x) => x.voertuig.code === 'V2').redenen;
  ck('V2 krijgt de reden "prijs binnen 20%" (31000 t.o.v. 30000)', redenenV2.includes('prijs binnen 20%'), redenenV2);
  const redenenV3 = uit.find((x) => x.voertuig.code === 'V3').redenen;
  ck('V3 (prijs 100000 t.o.v. 30000) krijgt die prijsreden NIET', !redenenV3.includes('prijs binnen 20%'), redenenV3);

  ck('max wordt gerespecteerd: met max=2 komen alleen de beste twee terug',
     vehicles.alternatieven(voorraad, { voertuig: doel }, 2).map((x) => x.voertuig.code).join(',') === 'V2,V3', null);

  const eersteRonde = JSON.stringify(vehicles.alternatieven(voorraad, { voertuig: doel }, 10));
  const tweedeRonde = JSON.stringify(vehicles.alternatieven(voorraad, { voertuig: doel }, 10));
  ck('twee aanroepen met dezelfde invoer geven exact dezelfde volgorde (deterministisch)',
     eersteRonde === tweedeRonde, null);

  ck('lege voorraad geeft een lege lijst', JSON.stringify(vehicles.alternatieven([], { voertuig: doel })) === '[]', null);
  ck('geen context geeft ook nette output (geen crash)', Array.isArray(vehicles.alternatieven(voorraad, {})), null);
}

console.log(`\n${fail === 0 ? 'ALLES GROEN' : 'ER IS IETS STUK'} — ${pass} ok, ${fail} fout\n`);
process.exit(fail === 0 ? 0 : 1);
