/*
 * Wat Helvaro zelf betaalt.
 *
 * ── Wat hier bewaakt wordt ──────────────────────────────────────────────────
 * Het gaat om ÉÉN eigenschap, en die is makkelijk stilletjes kwijt te raken:
 * een bedrag dat je niet kent mag nooit als nul in een totaal belanden. Een
 * dienst zonder prijs die op 0 staat maakt je maandlasten lager dan ze zijn,
 * en dat is precies de fout waar een kostenoverzicht voor bedoeld was.
 *
 * Daarnaast, en net zo belangrijk:
 *   - de pagina is back-office. Een makelaar hoort leverancierstarieven en de
 *     lijst met sleutels niet in zijn paginabron te vinden.
 *   - er komt NOOIT een sleutelwaarde uit. Alleen "gezet" of "niet gezet".
 *   - een dienst zonder sleutel draait niet en telt dus niet mee -- ook niet
 *     met zijn lijstprijs erbij.
 */
const BASE = require('path').join(__dirname, '..') + '/';

let pass = 0, fail = 0;
const ck = (n, ok, got) => {
  console.log(`  ${ok ? 'OK  ' : 'FOUT'}  ${n}${ok ? '' : '  → ' + JSON.stringify(got)}`);
  ok ? pass++ : fail++;
};

/* Een schone omgeving: geen enkele sleutel gezet, zodat "wat staat er aan"
   hier gemeten wordt en niet uit de machine van de bouwer komt. */
const BEWAARD = {};
const SLEUTELS = ['API_AIRTABLE', 'BASE_AIRTABLE', 'CLERK_SECRET_KEY', 'UPSTASH_REDIS_REST_URL',
                  'WHATSAPP_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENAI',
                  'KLING_ACCESS_KEY', 'STRIPE_SECRET_KEY', 'SMTP_HOST', 'RESEND_API_KEY',
                  'KOSTEN_USD_EUR'];
for (const k of SLEUTELS) { BEWAARD[k] = process.env[k]; delete process.env[k]; }

const K = require(BASE + 'api/_kosten.js');

(async () => {
  console.log('\n— zonder één sleutel draait er bijna niets —');
  K._resetTabelCache();
  let o = await K.overzicht();
  const opId = Object.fromEntries(o.diensten.map((d) => [d.id, d]));

  ck('Vercel staat altijd aan, want daar draait het op', opId.vercel.aan === true);
  ck('Airtable staat uit zonder token', opId.airtable.aan === false, opId.airtable);
  /* Airtable Team is 24 dollar. Staat de dienst uit, dan hoort dat bedrag
     NERGENS in het totaal te zitten -- anders reken je jezelf kosten aan voor
     iets dat niet draait, en dat is dezelfde soort onwaarheid als een dienst
     op nul zetten, alleen de andere kant op. */
  ck('de lijstprijs van een dienst die uit staat telt NIET mee',
     o.vastPerMaand.perMunt.USD === 20, o.vastPerMaand);
  /* Vercel en het domein blijven staan: die twee hangen niet aan een sleutel,
     want de app draait op Vercel en het adres bestaat. Het domein heeft alleen
     geen bedrag, en telt daarom niet mee in het totaal maar wel in "nog
     invullen". */
  ck('alleen wat niet aan een sleutel hangt blijft staan',
     o.diensten.filter((d) => d.aan && d.soort === 'vast').map((d) => d.id).join(',') === 'vercel,smartlead,domein',
     o.diensten.filter((d) => d.aan).map((d) => d.id));

  console.log('\n— met Airtable aan —');
  process.env.API_AIRTABLE = 'patZelftest';
  process.env.BASE_AIRTABLE = 'appZelftest';
  /* De tabel `costs` bestaat niet in deze nagemaakte base: dat pad moet stil
     terugvallen op lijstprijzen, niet stukgaan. */
  global.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => 'NOT_FOUND' });
  K._resetTabelCache();
  o = await K.overzicht();
  const m = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('Airtable staat nu aan', m.airtable.aan === true);
  ck('Vercel Pro staat op de lijstprijs', m.vercel.perMaand === 20 && m.vercel.bron === 'lijstprijs', m.vercel);
  ck('Airtable Team ook', m.airtable.perMaand === 24 && m.airtable.bron === 'lijstprijs', m.airtable);
  ck('samen 44 dollar per maand', o.vastPerMaand.perMunt.USD === 44, o.vastPerMaand);
  ck('en dat is GEEN eurototaal zolang er geen koers gezet is',
     o.vastPerMaand.inEur === null && /KOSTEN_USD_EUR/.test(o.waarschuwing || ''), o.vastPerMaand);
  ck('de ontbrekende tabel wordt gemeld in plaats van genegeerd', o.tabelBestaat === false, o.tabelBestaat);

  console.log('\n— een bedrag dat we niet kennen wordt geen nul —');
  ck('het domein heeft geen bedrag', m.domein.perMaand === null, m.domein);
  ck('en staat op de lijst "nog invullen"', o.nogInvullen.indexOf('Domeinnaam helvaro.pro') !== -1, o.nogInvullen);
  ck('de herkomst zegt eerlijk "onbekend"', m.domein.bron === 'onbekend', m.domein.bron);

  console.log('\n— en dus is er ook geen nettowinst —');
  o = await K.overzicht({ gesprekken: 10, mrrEur: 499 });
  ck('netto blijft leeg zolang een bedrag ontbreekt', o.nettoPerMaandEur === null, o.nettoPerMaandEur);
  /* Dit is de kern van het bestand: liever geen winstcijfer dan een winstcijfer
     dat een deel van je kosten niet kent. */
  ck('de raming staat er wel, apart en als raming gelabeld',
     o.raming && o.raming.totaalEur === 3 && /raming/i.test(o.raming.let_op), o.raming);
  ck('en de omzet is overgenomen zoals hij binnenkwam', o.mrrEur === 499, o.mrrEur);

  console.log('\n— met een koers wordt er wél opgeteld —');
  process.env.KOSTEN_USD_EUR = '0.92';
  K._resetTabelCache();
  o = await K.overzicht();
  ck('44 dollar tegen 0,92 is 40,48 euro', o.vastPerMaand.inEur === 40.48, o.vastPerMaand);
  ck('en de gebruikte koers staat erbij', o.vastPerMaand.koersUsdEur === 0.92, o.vastPerMaand);
  ck('geen waarschuwing meer', o.waarschuwing === null, o.waarschuwing);
  delete process.env.KOSTEN_USD_EUR;

  console.log('\n— jouw eigen bedrag wint van een lijstprijs —');
  /* Jij hebt de factuur; de lijst in de code is hooguit een gok van de bouwer. */
  global.fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ records: [
      { id: 'rec1', fields: { Service: 'airtable', Name: 'Airtable Team (jaar)', Amount: 20, Currency: 'USD', Interval: 'jaar', Seats: 2, Notes: 'per plek' } },
      { id: 'rec2', fields: { Service: 'domein', Amount: 24, Currency: 'EUR', Interval: 'jaar' } },
      { id: 'rec3', fields: { Service: 'vercel', Amount: 999, Currency: 'USD', Interval: 'maand', Active: false } },
      /* Smartlead hangt aan geen enkele sleutel en staat dus altijd aan; zonder
         bedrag zou hij hier eeuwig op "nog invullen" blijven staan. */
      { id: 'rec4', fields: { Service: 'smartlead', Amount: 39, Currency: 'USD', Interval: 'maand' } },
    ] }),
  });
  K._resetTabelCache();
  o = await K.overzicht({ gesprekken: 10, mrrEur: 499 });
  const e = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('een jaarbedrag wordt een maandbedrag', e.airtable.perMaand === 3.33, e.airtable);
  ck('maal het aantal plekken', e.airtable.aantal === 2, e.airtable);
  ck('en de naam mag je zelf zetten', e.airtable.naam === 'Airtable Team (jaar)', e.airtable.naam);
  ck('de herkomst zegt nu "ingevuld"', e.airtable.bron === 'ingevuld', e.airtable.bron);
  ck('het domein heeft nu wel een bedrag', e.domein.perMaand === 2, e.domein);
  /* Een rij met het vinkje uit hoort NIET stilletjes de lijstprijs te
     vervangen -- anders zet je iets uit en verandert je totaal alsnog. */
  ck('een uitgevinkte rij valt terug op de lijstprijs',
     e.vercel.perMaand === 20 && e.vercel.bron === 'lijstprijs', e.vercel);
  ck('nu is er niets meer onbekend', o.nogInvullen.length === 0, o.nogInvullen);

  console.log('\n— een rij zonder bedrag verandert niets —');
  /* Zo staat de productiebase er nu bij: er is voor elke dienst een regel
     aangemaakt met munt, interval en een notitie, maar met een LEEG bedrag --
     zodat de eigenaar alleen nog een getal hoeft te typen. Zo'n lege regel mag
     de lijstprijs niet overrulen en al helemaal geen nul worden. */
  global.fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ records: [
      { id: 'recL', fields: { Service: 'vercel', Name: 'Vercel Pro', Currency: 'USD', Interval: 'maand', Seats: 1, Active: true, Notes: 'Vul Amount in' } },
      { id: 'recM', fields: { Service: 'airtable', Currency: 'USD', Interval: 'maand', Seats: 1, Active: true } },
    ] }),
  });
  K._resetTabelCache();
  o = await K.overzicht();
  const leeg = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('de lijstprijs blijft staan', leeg.vercel.perMaand === 20 && leeg.vercel.bron === 'lijstprijs', leeg.vercel);
  ck('en wordt geen nul', leeg.airtable.perMaand === 24, leeg.airtable);
  ck('het totaal is nog steeds 44', o.vastPerMaand.perMunt.USD === 44, o.vastPerMaand);
  /* De naam uit de tabel mag wel meteen gelden -- die is ingevuld, het bedrag
     niet. */
  ck('een ingevulde naam telt wel', leeg.vercel.naam === 'Vercel Pro', leeg.vercel.naam);

  console.log('\n— Meta rekent per bericht, niet per maand —');
  /* Sinds juli 2025 factureert Meta per verstuurd sjabloonbericht. Een
     stuksprijs is pas een maandbedrag als je weet hoeveel er verstuurd zijn --
     en dat aantal komt uit de records, niet uit een aanname. */
  global.fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ records: [
      { id: 'rec9', fields: { Service: 'whatsapp', Amount: 0.09, Currency: 'EUR', Interval: 'bericht' } },
    ] }),
  });
  K._resetTabelCache();
  o = await K.overzicht({ volumes: { whatsapp: 40 } });
  const w = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('40 berichten à 0,09 is 3,60 per maand', w.whatsapp.perMaand === 3.6, w.whatsapp);
  ck('en het getelde aantal staat erbij', w.whatsapp.gemeten === 40, w.whatsapp.gemeten);
  ck('verbruik telt apart op, niet bij de vaste lasten',
     o.verbruikPerMaand.perMunt.EUR === 3.6 && o.vastPerMaand.perMunt.EUR === undefined,
     { verbruik: o.verbruikPerMaand, vast: o.vastPerMaand });

  /* Zonder telling GEEN bedrag. Een stuksprijs stilzwijgend als maandbedrag
     lezen zou hier 0,09 per maand opleveren -- een getal dat nergens op slaat
     en er wel uitziet alsof het klopt. */
  K._resetTabelCache();
  o = await K.overzicht();
  const z = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('zonder gemeten aantal blijft het bedrag leeg', z.whatsapp.perMaand === null, z.whatsapp);

  console.log('\n— een gemeten verbruik telt mee in het netto —');
  K._resetTabelCache();
  process.env.KOSTEN_USD_EUR = '1';
  o = await K.overzicht({ volumes: { whatsapp: 40 }, gesprekken: 10, mrrEur: 499 });
  /* Vaste lasten: Vercel 20 + Airtable 24 = 44 (koers 1). Het domein heeft geen
     bedrag, dus er hoort GEEN netto te staan -- ook nu niet. */
  ck('nog steeds geen netto zolang het domein leeg is', o.nettoPerMaandEur === null, o.nettoPerMaandEur);
  delete process.env.KOSTEN_USD_EUR;

  console.log('\n— hoeveel is er tot nu toe uitgegeven —');
  /* Niet "hoeveel maanden zitten ertussen" maar hoeveel BETALINGEN er geweest
     zijn. Een abonnement dat op 15 maart begon is die dag voor het eerst
     afgeschreven, dus op 20 maart heb je één keer betaald en niet nul keer. */
  const nu = new Date('2026-08-24T12:00:00Z');
  ck('gestart op 15 maart 2026 = 6 betalingen', K.betalingenSinds('2026-03-15', 'maand', nu) === 6,
     K.betalingenSinds('2026-03-15', 'maand', nu));
  ck('vandaag gestart = 1 betaling', K.betalingenSinds('2026-08-24', 'maand', nu) === 1);
  ck('morgen gestart = nog niets', K.betalingenSinds('2026-08-25', 'maand', nu) === 0);
  /* De 31e bestaat niet in elke maand; de afschrijving valt dan op de laatste
     dag. Zonder die correctie telt zo'n abonnement in februari te weinig. */
  ck('de 31e als startdag telt gewoon door', K.betalingenSinds('2025-01-31', 'maand', nu) === 19,
     K.betalingenSinds('2025-01-31', 'maand', nu));
  ck('een jaarabonnement telt in jaren', K.betalingenSinds('2024-08-24', 'jaar', nu) === 3);
  /* Een tarief per bericht heeft geen ritme: hoe vaak Meta factureert hangt af
     van hoeveel je stuurt, niet van de kalender. */
  ck('een stuksprijs levert geen telling op', K.betalingenSinds('2026-01-01', 'bericht', nu) === null);
  ck('een onleesbare datum ook niet', K.betalingenSinds('ergens in maart', 'maand', nu) === null);
  ck('en een lege datum evenmin', K.betalingenSinds('', 'maand', nu) === null);

  /* Vaste startdatums lieten deze test elke maand opnieuw stuk lopen: met
     '2026-06-01' klopte "3 x 39" in augustus en niet meer in september. De
     Vercel-regel stond op dezelfde manier te wachten om op de 15e om te vallen.
     Reken daarom terug vanaf vandaag. Dag 1 is met opzet: betalingenSinds()
     trekt er een maand af zolang de afschrijvingsdag nog niet gepasseerd is,
     en de eerste is altijd gepasseerd. N maanden geleden = N + 1 betalingen. */
  const maandenGeleden = (n) => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() - n, 1)
      .toISOString().slice(0, 10);
  };

  global.fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ records: [
      { id: 'recA', fields: { Service: 'vercel', Amount: 20, Currency: 'USD', Interval: 'maand', 'Started On': maandenGeleden(5) } },
      { id: 'recB', fields: { Service: 'smartlead', Amount: 39, Currency: 'USD', Interval: 'maand', 'Started On': maandenGeleden(2) } },
      { id: 'recC', fields: { Service: 'airtable', Amount: 24, Currency: 'USD', Interval: 'maand' } },
    ] }),
  });
  K._resetTabelCache();
  o = await K.overzicht();
  const u = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('Smartlead staat in de lijst', !!u.smartlead, Object.keys(u));
  ck('en telt mee zonder sleutel, want er is geen sleutel om te hebben',
     u.smartlead.aan === true, u.smartlead);
  ck('Vercel: 6 betalingen van 20 = 120', u.vercel.uitgegeven === 120 && u.vercel.betalingen === 6, u.vercel);
  /* Juni, juli, augustus = drie afschrijvingen. */
  ck('Smartlead: 3 x 39 = 117', u.smartlead.uitgegeven === 117, u.smartlead);
  ck('Airtable heeft geen startdatum, dus geen totaal', u.airtable.uitgegeven === null, u.airtable);
  ck('en staat apart vermeld', o.uitgegeven.zonderStartdatum.indexOf('Airtable Team') !== -1,
     o.uitgegeven.zonderStartdatum);
  ck('het totaal is 237 dollar, niet meer', o.uitgegeven.perMunt.USD === 237, o.uitgegeven);
  /* De maandlasten blijven ongemoeid: dat is een ander getal en het mag niet
     meebewegen met hoe lang je iets al hebt. */
  ck('en de maandlasten zijn er niet door veranderd', o.vastPerMaand.perMunt.USD === 83,
     o.vastPerMaand);

  console.log('\n— een jaarbedrag wordt niet twaalf keer geteld —');
  /* Drie jaarbetalingen van 120 is 360, niet 36 x 10. Het verschil verdwijnt
     in een totaal zonder dat iemand het ziet. */
  global.fetch = async () => ({
    ok: true, status: 200, text: async () => '',
    json: async () => ({ records: [
      { id: 'recD', fields: { Service: 'domein', Amount: 120, Currency: 'EUR', Interval: 'jaar', 'Started On': '2024-08-24' } },
    ] }),
  });
  K._resetTabelCache();
  o = await K.overzicht();
  const j = Object.fromEntries(o.diensten.map((d) => [d.id, d]));
  ck('3 jaarbetalingen van 120 = 360', j.domein.uitgegeven === 360, j.domein);
  ck('maar per maand is het 10', j.domein.perMaand === 10, j.domein);

  console.log('\n— de sleutels, en wat er NIET uitkomt —');
  process.env.ANTHROPIC_API_KEY = 'sk-ant-geheim-zelftest-abcdefghijklmnop';
  const sl = K.sleutels();
  const ant = sl.find((x) => x.env === 'ANTHROPIC_API_KEY');
  ck('een gezette sleutel wordt herkend', ant && ant.gezet === true, ant);
  ck('maar de WAARDE komt er niet uit',
     JSON.stringify(sl).indexOf('geheim-zelftest') === -1, 'sleutelwaarde lekt');
  /* Ook geen afgekorte staart. Een sleutel is geen statusinformatie. */
  ck('ook geen laatste tekens ervan', JSON.stringify(sl).indexOf('mnop') === -1, 'staart lekt');
  ck('STRIPE_WEBHOOK_SECRET staat in de lijst', sl.some((x) => x.env === 'STRIPE_WEBHOOK_SECRET'));
  ck('en de niet-gezette staan er ook, want hun ontbreken is het nieuws',
     sl.some((x) => x.gezet === false), sl.length);
  delete process.env.ANTHROPIC_API_KEY;

  console.log('\n— de pagina is back-office —');
  const dashboard = require(BASE + 'api/dashboard.js');
  let html = '';
  dashboard({ method: 'GET', url: '/dashboard', headers: {} },
            { setHeader() {}, status() { return this; }, send(b) { html = String(b); }, json() {}, end() {} });
  ck('een klant krijgt de kostenpagina niet', html.indexOf('id="page-kosten"') === -1, null);

  /* Wat er ECHT niet in mag: tarieven, leveranciers, bedragen en de namen van
     omgevingsvariabelen. Dat zijn de gegevens; de rest is opmaak.

     Wat er WEL in blijft staan, en waarom dat mag: de opmaakregels en de twee
     labelteksten ("lijstprijs", "nog invullen") staan in de gedeelde
     stylesheet en het gedeelde script, en stripBackoffice knipt alleen de
     <main>. Daar staat geen enkel gegeven in -- een klasse zonder pagina en
     een woord zonder getal. Zou dat ooit veranderen, dan valt het hier om. */
  for (const geheim of ['Vercel Pro', 'Airtable Team', 'Formagrid', 'Vercel Inc.',
                        'ANTHROPIC_API_KEY', 'STRIPE_WEBHOOK_SECRET', 'KLING_ACCESS_KEY',
                        'Abonnementen', 'Wat Helvaro zelf betaalt, per dienst']) {
    ck(`"${geheim}" staat niet in de HTML van een klant`, html.indexOf(geheim) === -1, geheim);
  }
  /* De knoppen naar de back-office worden pas gemaakt als de sessie admin is
     (mountAdminNav), dus de definitie mag in het script staan -- de knop
     bestaat niet. Dat is hoe Klanten en Founder het ook doen. */
  ck('de navigatieknop wordt pas voor een admin gemaakt',
     /page: 'kosten'[\s\S]{0,80}label: 'Kosten'/.test(html)
     && /function mountAdminNav\(isAdmin\)[\s\S]{0,200}if \(!isAdmin\)/.test(html), null);

  for (const k of SLEUTELS) { if (BEWAARD[k] === undefined) delete process.env[k]; else process.env[k] = BEWAARD[k]; }
  console.log(`\n${pass} geslaagd, ${fail} gefaald`);
  process.exit(fail ? 1 : 0);
})();
