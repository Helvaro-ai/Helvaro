'use strict';
/*
 * Provider 'autoscout24': het publieke verkopersprofiel van de dealer zelf.
 *
 * BETA, en dat woord is eerlijk bedoeld: dit leest een publieke pagina, geen
 * API. Een gewijzigde opmaak of een blokkade zet hem stil (met een duidelijke
 * fout, nooit met een omweg). Hij draait live voor een echte dealer en gedraagt
 * zich sinds de verhuizing uit api/_inventaris.js (2026-10-05) byte-voor-byte
 * hetzelfde; de officiele route is provider 'autoscout24_api' zodra die
 * geactiveerd is, of een feed/export van de dealer (provider 'feed').
 *
 * Geen route: onderstreepje voorop.
 */

const crypto = require('crypto');
const { MAX_FEED_BYTES } = require('./feed');
const { normaliseer } = require('./fouten');
const { kleurUitLink } = require('./waarden');

/* ── AutoScout24-dealerpagina ──────────────────────────────────────────────
 * De dealer geeft het adres van zijn eigen verkopersprofiel
 * (https://www.autoscout24.be/nl/verkopers/<naam>). De publieke pagina bevat
 * de advertenties als gestructureerde data (__NEXT_DATA__), 20 per pagina, met
 * een stabiel advertentie-id. Dat id is de bronId: nooit merk/model/prijs.
 *
 * Wat dit bewust WEL en NIET doet (beslissing 2026-09-27, zie CHANGELOG):
 *   - alleen een verkopersprofiel op een autoscout24-domein, nooit een
 *     willekeurige zoekpagina of een ander domein
 *   - robots.txt wordt elke run gelezen en gerespecteerd
 *   - eerlijke user-agent, één pagina per seconde, hooguit MAX_AS24_PAGINAS
 *   - een blokkade, captcha of 429 = STOPPEN met een duidelijke fout. Geen
 *     omweg, geen andere user-agent, geen herhaalpoging.
 *   - onvolledig gelezen (minder dan 95% van wat de pagina zelf telt) = de
 *     run faalt. Een half gelezen voorraad mag NOOIT wagens op verkocht zetten.
 * Een officiële feed of export van AutoScout24 of het DMS blijft de betere
 * bron; die gaat via de provider 'feed'.
 */
const AS24_HOST = /^(www\.)?autoscout24\.(be|nl|de|at|fr|it|es|lu|com)$/i;
const AS24_PAD = /^\/(?:[a-z]{2}\/)?(verkopers|haendler|professional|professionals|professionnel|professionnels|concessionari|concesionarios|dealers|vendeurs)\/([a-z0-9][a-z0-9-]{1,80})\/?$/i;
const MAX_AS24_PAGINAS = 60;           // 1.200 wagens
const AS24_PAUZE_MS = 1000;
const AS24_PER_PAGINA = 20;            // AutoScout24 toont 20 advertenties per pagina: een kortere pagina is de laatste
const AS24_UA = 'HelvaroInventory/1.0 (+https://helvaro.pro; voorraadsync voor de dealer zelf)';

/** Het verkopersprofiel uit een geplakte link, of null. Query en tracking weg. */
function autoscoutDealerUrl(ruw) {
  let u;
  try { u = new URL(String(ruw || '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || !AS24_HOST.test(u.hostname)) return null;
  const m = AS24_PAD.exec(u.pathname);
  if (!m) return null;
  return { origin: 'https://' + u.hostname.toLowerCase(), pad: u.pathname.replace(/\/$/, ''), slug: m[2].toLowerCase(), url: 'https://' + u.hostname.toLowerCase() + u.pathname.replace(/\/$/, '') };
}

/* robots.txt: de regels voor '*' (en voor onze eigen naam). 404 = alles mag. */
async function robotsStaatToe(origin, pad, haal = fetch) {
  let tekst = '';
  try {
    const r = await haal(origin + '/robots.txt', { headers: { 'User-Agent': AS24_UA }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (r.status === 404) return true;
    if (!r.ok) return false;
    tekst = await r.text();
  } catch { return false; }
  const regels = tekst.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim());
  let geldt = false, vorigeWasUa = false;
  const verboden = [], toegestaan = [];
  for (const l of regels) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
    if (!m) { continue; }
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      const wij = v === '*' || /helvaroinventory/i.test(v);
      geldt = vorigeWasUa ? (geldt || wij) : wij;
      vorigeWasUa = true;
      continue;
    }
    vorigeWasUa = false;
    if (!geldt) continue;
    if (k === 'disallow' && v) verboden.push(v);
    if (k === 'allow' && v) toegestaan.push(v);
  }
  const langste = (lijst) => lijst.filter((p) => pad.startsWith(p)).reduce((a, p) => Math.max(a, p.length), -1);
  return langste(verboden) <= langste(toegestaan) || langste(verboden) === -1;
}

/** Eén AutoScout24-advertentie -> dezelfde vorm als mapRegel(). */
function mapAutoscout(l, origin) {
  if (!l || !l.id || !l.vehicle) return null;
  const v = l.vehicle;
  const prijs = l.prices && l.prices.public && Number(l.prices.public.priceRaw);
  const tekstVan = (x) => (x && x.formatted ? String(x.formatted) : undefined);
  const fotos = (Array.isArray(l.images) ? l.images : [])
    .map((u) => String(u).replace(/\/\d{2,4}x\d{2,4}\.webp$/, '/720x540.webp'))
    .filter((u) => /^https:\/\/prod\.pictures\.autoscout24\.net\/\S{8,400}$/.test(u)).slice(0, 20);
  const link = l.url && /^\/[\w\-/]+$/.test(String(l.url)) ? origin + l.url : undefined;
  /* Het verkopersprofiel levert geen kleur; de slug van de advertentielink soms
     wel (zie kleurUitLink). Afgeleid, dus gemarkeerd: de sync vult hem alleen
     aan waar de wagen nog geen kleur heeft. */
  const kleur = link ? kleurUitLink(link, v.make, v.model) : undefined;
  return {
    bronId: String(l.id).trim().toLowerCase().slice(0, 120),
    /* Het advertentie-id IS het AutoScout-nummer: zo herkent de koppeling met
       andere platformen en de WhatsApp-herkenning (getByAutoscout) dezelfde wagen. */
    autoscout: String(l.id).trim().toLowerCase().slice(0, 40),
    merk: v.make || undefined, model: v.model || undefined,
    uitvoering: v.modelVersionInput ? String(v.modelVersionInput).slice(0, 120) : undefined,
    prijs: Number.isFinite(prijs) && prijs > 0 ? prijs : undefined,
    km: v.mileageInKm && Number.isFinite(Number(v.mileageInKm.raw)) ? Number(v.mileageInKm.raw) : undefined,
    inschrijving: tekstVan(v.firstRegistrationDate),
    brandstof: tekstVan(v.fuelCategory) ? tekstVan(v.fuelCategory).toLowerCase() : undefined,
    transmissie: tekstVan(v.transmissionType) ? tekstVan(v.transmissionType).toLowerCase() : undefined,
    kw: v.powerInKw && Number.isFinite(Number(v.powerInKw.raw)) ? Number(v.powerInKw.raw) : undefined,
    carrosserie: tekstVan(v.bodyType),
    ...(kleur ? { kleur, kleurAfgeleid: true } : {}),
    link, fotos,
    /* AutoScout24 toont alleen wat te koop staat. Aanwezig = beschikbaar;
       verkocht = verdwenen (de gewone verdwijnregel, met de dalingsbeveiliging).
       Een reservering kent AutoScout24 niet: die zet de dealer in Helvaro, en
       de sync laat hem staan (kentReservering: false). */
    status: 'beschikbaar',
  };
}

/** De data uit één pagina, of een fout die zegt waarom niet. */
function leesAutoscoutPagina(html) {
  const m = /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(String(html || ''));
  if (!m) { const e = new Error('AutoScout24 gaf geen voorraadgegevens terug (blokkade of gewijzigde pagina)'); e.code = 'bron_geblokkeerd'; throw e; }
  let d;
  try { d = JSON.parse(m[1]); } catch { const e = new Error('AutoScout24-gegevens onleesbaar'); e.code = 'bron_onleesbaar'; throw e; }
  const pp = d && d.props && d.props.pageProps;
  if (!pp || !Array.isArray(pp.listings)) { const e = new Error('geen advertentielijst op deze pagina (is dit een verkopersprofiel?)'); e.code = 'bron_onleesbaar'; throw e; }
  return { listings: pp.listings, totaal: Number(pp.numberOfResults) || 0 };
}

async function haalAutoscout(bron, opties = {}) {
  const dealer = autoscoutDealerUrl(bron.url);
  if (!dealer) { const e = new Error('dat is geen AutoScout24-verkopersprofiel'); e.code = 'url_geweigerd'; throw e; }
  const haal = opties.fetch || fetch;
  const wacht = opties.wacht || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const budgetTot = Date.now() + (opties.budgetMs || 240000);
  if (!(await robotsStaatToe(dealer.origin, dealer.pad, haal))) {
    const e = new Error('robots.txt van AutoScout24 staat het lezen van deze pagina niet toe'); e.code = 'bron_geweigerd'; throw e;
  }
  const alle = new Map();
  let totaal = 0, paginas = 1, ongeldig = 0, totaalBekend = false;
  for (let p = 1; p <= paginas; p++) {
    if (p > 1) {
      if (Date.now() > budgetTot) { const e = new Error(`tijd op na ${p - 1} van ${paginas} pagina's -- niets aangepast`); e.code = 'bron_onvolledig'; throw e; }
      await wacht(AS24_PAUZE_MS);
    }
    const r = await haal(dealer.url + (p > 1 ? '?page=' + p : ''), { redirect: 'manual', headers: { 'User-Agent': AS24_UA, Accept: 'text/html', 'Accept-Language': 'nl-BE,nl;q=0.9,fr;q=0.8,en;q=0.5' }, signal: AbortSignal.timeout(20000) });
    if (r.status === 403 || r.status === 429 || r.status === 503) { const e = new Error(`AutoScout24 weigerde (HTTP ${r.status}); gestopt zonder omweg`); e.code = 'bron_geblokkeerd'; e.http = r.status; throw e; }
    if (r.status >= 300 && r.status < 400) { const e = new Error('AutoScout24 stuurde door; het profieladres klopt niet meer'); e.code = 'bron_omleiding'; throw e; }
    if (!r.ok) { const e = new Error('AutoScout24 antwoordde HTTP ' + r.status); e.code = 'feed_http'; e.http = r.status; throw e; }
    const html = await r.text();
    if (html.length > MAX_FEED_BYTES) { const e = new Error('pagina groter dan 5 MB'); e.code = 'feed_te_groot'; throw e; }
    const pagina = leesAutoscoutPagina(html);
    if (p === 1) {
      totaal = pagina.totaal;
      totaalBekend = totaal > 0;
      const perPagina = Math.max(1, pagina.listings.length);
      /* Zonder opgegeven totaal (gewijzigde pagina?) is er niets om de
         volledigheid aan te toetsen. Dan doorlezen tot een korte of lege pagina
         (hooguit het maximum), zodat toevoegen en bijwerken compleet zijn --
         maar zie hieronder: verdwijnen mag op zo'n lezing nooit tellen. */
      paginas = totaalBekend ? Math.min(MAX_AS24_PAGINAS, Math.ceil(totaal / perPagina) || 1) : MAX_AS24_PAGINAS;
    }
    const voor = alle.size;
    for (const l of pagina.listings) {
      const m = mapAutoscout(l, dealer.origin);
      if (!m || !m.merk) { ongeldig++; continue; }
      if (!alle.has(m.bronId)) alle.set(m.bronId, m);
    }
    if (!pagina.listings.length) break;
    if (!totaalBekend && (pagina.listings.length < AS24_PER_PAGINA || alle.size === voor)) break;
  }
  const verwacht = Math.min(totaal, MAX_AS24_PAGINAS * 20);
  if (verwacht && alle.size < Math.floor(verwacht * 0.95)) {
    const e = new Error(`maar ${alle.size} van ${verwacht} wagens gelezen -- niets op verkocht gezet`); e.code = 'bron_onvolledig'; throw e;
  }
  /* Is het totaal niet te vertrouwen -- ontbreekt het, is het 0, of is het KLEINER
     dan wat we echt lazen -- dan is de lezing niet te controleren (audit F13).
     Toevoegen en bijwerken mag, maar wat we niet zien is dan onbekend, niet
     verkocht: de sync zet er niets op verkocht (geenVerwijdering). */
  /* Iets MEER lezen dan het opgegeven totaal (een gesponsorde kaart, een
     telling die net achterloopt) is geen onvolledige lezing: wat ontbreekt,
     ontbreekt echt, en de dalingswacht in de sync blijft gelden. Met een harde
     grens (> totaal) stopte het verwijderen dan voorgoed en bleven verkochte
     wagens eeuwig beschikbaar (review 2026-10-09). Alleen een groot verschil
     wijst op een veranderde pagina en blijft wantrouwig. */
  const veelMeer = totaalBekend && alle.size > Math.ceil(totaal * 1.2) + 2;
  if (totaalBekend && alle.size > totaal && !veelMeer) console.warn('[autoscout24] ' + alle.size + ' wagens gelezen, totaal zegt ' + totaal + ' -- klein verschil, verwijderen mag');
  const geenVerwijdering = !totaalBekend || veelMeer;
  const voertuigen = Array.from(alle.values());
  const hash = crypto.createHash('sha256').update(JSON.stringify(voertuigen.map((v) => [v.bronId, v.prijs, v.km, v.uitvoering, v.fotos.length]).sort())).digest('hex').slice(0, 16);
  return Object.assign({ formaat: 'autoscout24', voertuigen, ongeldig, hash, totaalBijBron: totaal },
    geenVerwijdering ? { geenVerwijdering: true, geenVerwijderingReden: totaalBekend ? 'totaal_kleiner_dan_gelezen' : 'totaal_ontbreekt' } : {});
}

const autoscout24 = {
  id: 'autoscout24',
  label: 'AutoScout24 (seller profile)',
  status: 'ACTIVE',
  auth: 'feed_url',
  /* Wat het adres is, voor het formulier: een verkopersprofiel, geen feed. */
  adresSoort: 'profiel',
  kentReservering: false,
  capabilities: { lezen: true, publiceren: false, leads: false },
  saneer(o) {
    const d = autoscoutDealerUrl(o && o.url);
    return { url: d ? d.url : '', formaat: 'auto' };
  },
  /* Herkent een verkopersprofiel aan het adres, ook als het formulier de
     provider niet meestuurt (oude opgeslagen bronnen). */
  herkent(url) { return Boolean(autoscoutDealerUrl(url)); },
  haal: (bron, opties) => haalAutoscout(bron, opties),
  async health(bron) {
    return bron && autoscoutDealerUrl(bron.url) ? { ok: true, toestand: 'ok' } : { ok: false, toestand: 'niet_geconfigureerd' };
  },
  normaliseerFout: normaliseer,
};

module.exports = {
  provider: autoscout24,
  autoscoutDealerUrl, robotsStaatToe, mapAutoscout, leesAutoscoutPagina, haalAutoscout,
};
