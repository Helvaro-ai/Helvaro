#!/usr/bin/env node
// Controleert of Clerk EN Faro aangezet kunnen worden — voordat je een
// schakelaar omzet.
//
// ── Waarom dit bestaat ───────────────────────────────────────────────────────
// Als er iets mis is met de Clerk-configuratie, faalt de app stil. clerkInit()
// schrijft naar de console en valt terug op het wachtwoordformulier, dus je
// ziet een inlogscherm dat gewoon werkt en merkt niet dat Clerk nooit geladen
// is. Een typefout in de publishable key, een secret key van de verkeerde
// instantie, DNS die maar half doorgekomen is, klanten die nog geen
// Clerk-account hebben: alle vier zien er van buiten identiek uit.
//
// Dit script maakt daar een naam van. Elke controle zegt wat er mis is EN wat
// je eraan doet. Het schrijft niets weg en verandert niets.
//
//   node scripts/preflight.js
//
// Nodig in de omgeving: CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY.
// API_AIRTABLE en BASE_AIRTABLE zijn optioneel — daarmee wordt ook
// gecontroleerd of elke klant in Airtable een Clerk-account heeft. Die staan in
// Vercel meestal als "Sensitive", en dan kan `vercel env pull` ze niet
// teruglezen; het script slaat die controle dan over in plaats van te falen.

const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;

// Zelfde loader als scripts/clerk-sync-users.js: de sleutels staan in Vercel,
// niet in je shell, en horen niet in je shell-geschiedenis terecht te komen.
(function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(__dirname, '..', name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
    console.log(`(omgeving geladen uit ${name})\n`);
    break;
  }
})();

const APP_ORIGIN = 'https://app.helvaro.pro';

let fails = 0, warns = 0;
const line = (icon, label, detail) =>
  console.log(`  ${icon}  ${label}${detail ? '\n        ' + String(detail).replace(/\n/g, '\n        ') : ''}`);

const ok   = (label, detail) => line('OK  ', label, detail);
const warn = (label, detail) => { warns++; line('LET OP', label, detail); };
const fail = (label, detail) => { fails++; line('FOUT', label, detail); };
const head = (t) => console.log(`\n— ${t} —`);

// Een sleutel mag nooit heel in beeld of in een logbestand belanden.
const mask = (v) => {
  const s = String(v || '');
  if (s.length < 12) return '(te kort)';
  return s.slice(0, 11) + '…' + s.slice(-4);
};

// De publishable key IS de Frontend API-host, base64 met een '$' erachter.
// api/dashboard.js doet exact deze berekening om de CSP en de script-URL op te
// bouwen, dus als dit hier misgaat, gaat het daar op dezelfde manier mis.
function hostFromKey(pk) {
  try {
    const decoded = Buffer.from(String(pk).replace(/^pk_(test|live)_/, ''), 'base64').toString('utf8');
    return decoded.replace(/\$$/, '').trim();
  } catch { return ''; }
}

// Een fetch die nooit blijft hangen: een niet-resolvende host is precies het
// geval dat we hier proberen te vangen, en dat mag geen script zijn dat stilvalt.
async function probe(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    return { ok: r.ok, status: r.status, res: r };
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'time-out na 10s' : e.message };
  } finally { clearTimeout(timer); }
}

(async () => {
  console.log('Clerk preflight — er wordt niets gewijzigd.');

  // ── 1. De schakelaar ───────────────────────────────────────────────────────
  head('schakelaar');
  // Dezelfde soepele lezing als api/_clerk.js. Stond hier een strengere
  // controle dan in de app, dan meldde preflight een probleem dat er niet was
  // -- of erger, andersom.
  const enabled = require('../api/_clerk.js').vlagAan(process.env.CLERK_ENABLED);
  if (enabled) ok(`CLERK_ENABLED=${String(process.env.CLERK_ENABLED).trim()} — Clerk is aan`);
  else warn(`CLERK_ENABLED leest als UIT (waarde: ${JSON.stringify(process.env.CLERK_ENABLED || '')}) — de code is aanwezig maar slaapt`,
            'Iedereen logt nu in met het klassieke wachtwoordformulier. Zet dit pas op 1\n'
          + 'als alles hieronder groen is EN clerk-sync-users.js gedraaid heeft.');

  // ── 2. De sleutels ─────────────────────────────────────────────────────────
  head('sleutels');
  const pk = (process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '').trim();
  const sk = (process.env.CLERK_SECRET_KEY || '').trim();

  if (!pk) fail('CLERK_PUBLISHABLE_KEY ontbreekt', 'Te vinden in Clerk → API Keys. Begint met pk_live_ of pk_test_.');
  else if (!/^pk_(test|live)_/.test(pk)) fail('CLERK_PUBLISHABLE_KEY heeft niet de juiste vorm', `Kreeg ${mask(pk)}; verwacht pk_live_… of pk_test_….`);
  else ok(`CLERK_PUBLISHABLE_KEY aanwezig (${mask(pk)})`);

  if (!sk) fail('CLERK_SECRET_KEY ontbreekt', 'Te vinden in Clerk → API Keys. Begint met sk_live_ of sk_test_.');
  else if (!/^sk_(test|live)_/.test(sk)) fail('CLERK_SECRET_KEY heeft niet de juiste vorm', `Kreeg ${mask(sk)}; verwacht sk_live_… of sk_test_….`);
  else ok(`CLERK_SECRET_KEY aanwezig (${mask(sk)})`);

  const pkEnv = (pk.match(/^pk_(test|live)_/) || [])[1];
  const skEnv = (sk.match(/^sk_(test|live)_/) || [])[1];
  if (pkEnv && skEnv) {
    if (pkEnv === skEnv) ok(`beide sleutels zijn van de ${pkEnv}-instantie`);
    else fail(`sleutels van VERSCHILLENDE instanties: publishable=${pkEnv}, secret=${skEnv}`,
              'Dit is de valkuil die er van buiten goed uitziet: het inlogscherm verschijnt en\n'
            + 'werkt, maar de server verifieert het token tegen een andere instantie en wijst\n'
            + 'elke sessie af. Neem beide sleutels uit dezelfde Clerk-omgeving.');
  }

  // ── 3. De Frontend API-host ────────────────────────────────────────────────
  head('frontend api (DNS)');
  const host = pk ? hostFromKey(pk) : '';
  if (!pk) {
    warn('overgeslagen — zonder publishable key valt er geen host af te leiden');
  } else if (!host || !/^[a-z0-9.-]+$/i.test(host)) {
    fail('uit de publishable key komt geen bruikbare hostnaam',
         'api/dashboard.js leidt hier de CSP en de script-URL uit af. Zonder host wordt\n'
       + 'Clerk niet geladen. Controleer of de sleutel volledig gekopieerd is.');
  } else {
    ok(`frontend api host: ${host}`);
    if (pkEnv === 'live' && /\.clerk\.accounts\.dev$/.test(host)) {
      warn('een live sleutel wijst nog naar een accounts.dev-host',
           'Dat is een ontwikkelinstantie. Voor productie hoort dit clerk.<jouw-domein> te zijn.');
    }

    // ── Eerst DNS, dan pas HTTP ────────────────────────────────────────────
    // Deze twee apart houden is het verschil tussen een bruikbaar antwoord en
    // een misleidend antwoord. Draai je dit vanachter een bedrijfsproxy of een
    // firewall die onbekende hosts blokkeert, dan faalt het HTTP-verzoek
    // terwijl er met de DNS niets mis is. Zou dit script dat als één fout
    // rapporteren, dan hield het je tegen op grond van jouw netwerk in plaats
    // van jouw configuratie.
    //
    // De naamresolutie is bovendien precies wat er geverifieerd moest worden.
    let resolves = false;
    try {
      const addrs = await dns.lookup(host, { all: true });
      resolves = addrs.length > 0;
      let chain = [];
      try { chain = await dns.resolveCname(host); } catch { /* A-record, geen CNAME */ }
      const looksLikeClerk = chain.some((c) => /clerk/i.test(c));
      if (chain.length && !looksLikeClerk) {
        warn(`${host} resolvet, maar wijst niet naar Clerk: ${chain.join(', ')}`,
             'Controleer het CNAME-record bij je DNS-provider tegen wat Clerk → Domains toont.');
      } else {
        ok(`${host} resolvet${chain.length ? ' → ' + chain.join(', ') : ''}`);
      }
    } catch (e) {
      fail(`${host} resolvet niet (${e.code || e.message})`,
           'Dit is het DNS-record dat bij Clerk → Domains geverifieerd moet zijn. Staat het\n'
         + 'er net op, dan kan het nog aan het doorkomen zijn — DNS-wijzigingen duren tot\n'
         + 'enkele uren. Zet CLERK_ENABLED niet op 1 tot dit slaagt: de inlogpagina laadt\n'
         + 'clerk.browser.js van deze naam.');
    }

    // De JWKS zijn de publieke sleutels waarmee tokens geverifieerd worden; als
    // dit antwoordt, draait de instantie ook echt.
    const jwks = await probe(`https://${host}/.well-known/jwks.json`);
    if (jwks.ok) {
      const body = await jwks.res.json().catch(() => null);
      const n = body && Array.isArray(body.keys) ? body.keys.length : 0;
      if (n > 0) ok(`DNS resolvet en de instantie antwoordt (${n} verificatiesleutel(s))`);
      else fail('de host antwoordt maar levert geen verificatiesleutels', 'Geen werkende Clerk Frontend API op deze naam.');
    } else if (resolves) {
      // Resolvet wel, antwoordt niet: dat wijst eerder naar het netwerk waar dit
      // script op draait dan naar de Clerk-configuratie. Een 403 of 407 op een
      // CONNECT is de handtekening van een proxy, niet van Clerk.
      warn(`de frontend api antwoordde niet vanaf DEZE machine (${jwks.error || 'HTTP ' + jwks.status})`,
           `Getest: https://${host}/.well-known/jwks.json\n`
         + 'De naam resolvet wel, dus de DNS is in orde. Zit je achter een bedrijfsproxy of\n'
         + 'VPN, dan is dit jouw netwerk en niet je Clerk-configuratie — probeer het van een\n'
         + 'gewone verbinding. Blijft het falen op een open verbinding, dan antwoordt de\n'
         + 'instantie zelf niet.');
    } else {
      fail(`de frontend api is niet bereikbaar (${jwks.error || 'HTTP ' + jwks.status})`,
           `Getest: https://${host}/.well-known/jwks.json`);
    }

    // Precies de URL die api/dashboard.js in de pagina zet. Deze kan falen
    // terwijl de JWKS wel werken, en dan laadt de SDK niet.
    const sdk = await probe(`https://${host}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`, { method: 'GET' });
    if (sdk.ok) ok('clerk.browser.js wordt geserveerd vanaf dezelfde host');
    else if (resolves) warn(`clerk.browser.js niet op te halen vanaf DEZE machine (${sdk.error || 'HTTP ' + sdk.status})`,
                            'Zelfde voorbehoud als hierboven: de naam resolvet, dus dit is waarschijnlijk je\n'
                          + 'eigen netwerk. Controleer het vanaf een open verbinding.');
    else fail(`clerk.browser.js is niet op te halen (${sdk.error || 'HTTP ' + sdk.status})`,
              'De inlogpagina laadt de SDK van deze URL. Faalt dit, dan valt de app terug\n'
            + 'op het klassieke wachtwoordformulier en logt niemand via Clerk in.');
  }

  // ── 4. Werkt de secret key ─────────────────────────────────────────────────
  head('secret key');
  let clerk = null;
  if (!sk) {
    warn('overgeslagen — geen secret key om mee te testen');
  } else {
    try {
      const { createClerkClient } = require('@clerk/backend');
      clerk = createClerkClient({ secretKey: sk });
      const count = await clerk.users.getCount();
      ok(`de secret key werkt — ${count} gebruiker(s) in deze instantie`);
      if (count === 0) {
        warn('er staat nog geen enkele gebruiker in Clerk',
             'Draai scripts/clerk-sync-users.js VOORDAT je CLERK_ENABLED op 1 zet, anders\n'
           + 'komt elke bestaande klant op het scherm "je account wordt klaargezet".');
      }
    } catch (e) {
      fail(`de secret key wordt afgewezen: ${e.message}`, 'Controleer of de sleutel bij dezelfde instantie hoort als de publishable key.');
      clerk = null;
    }
  }

  // ── 5. Wie kan er daadwerkelijk inloggen ───────────────────────────────────
  // projectCode is de tenantsleutel. api/_clerk.js weigert een sessie zonder,
  // dus een Clerk-account zonder projectCode is een account dat netjes inlogt
  // en daarna nergens komt. Dat is precies het geval dat je vóór de omschakeling
  // wilt zien, niet erna.
  head('klanten kunnen inloggen');
  if (clerk) {
    try {
      const withCode = [], without = [];
      let offset = 0;
      for (;;) {
        const page = await clerk.users.getUserList({ limit: 100, offset });
        const rows = page.data || page || [];
        if (!rows.length) break;
        for (const u of rows) {
          const code = (u.publicMetadata || {}).projectCode;
          const email = (u.emailAddresses && u.emailAddresses[0] && u.emailAddresses[0].emailAddress) || u.id;
          (code ? withCode : without).push(email);
        }
        if (rows.length < 100) break;
        offset += 100;
      }
      if (withCode.length) ok(`${withCode.length} account(s) met een projectCode — die kunnen inloggen`);
      if (without.length) {
        fail(`${without.length} account(s) ZONDER projectCode — die komen niet binnen`,
             without.slice(0, 10).join('\n') + (without.length > 10 ? `\n… en nog ${without.length - 10}` : '')
           + '\nOp te lossen met: node scripts/clerk-sync-users.js --apply');
      }
      if (!withCode.length && !without.length) warn('geen accounts om te controleren');
    } catch (e) {
      warn(`gebruikers niet op te halen: ${e.message}`);
    }
  } else {
    warn('overgeslagen — geen werkende secret key');
  }

  // ── 6. Kruiscontrole met Airtable (optioneel) ──────────────────────────────
  head('airtable kruiscontrole');
  if (!process.env.API_AIRTABLE || !process.env.BASE_AIRTABLE) {
    warn('overgeslagen — API_AIRTABLE/BASE_AIRTABLE niet beschikbaar',
         'Die staan in Vercel meestal als "Sensitive" en zijn dan niet terug te lezen met\n'
       + '`vercel env pull`. Niet erg: scripts/clerk-sync-users.js laat in droogloop\n'
       + 'hetzelfde zien.');
  } else if (!clerk) {
    warn('overgeslagen — geen werkende secret key');
  } else {
    try {
      const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';
      // Paginate. Airtable caps a page at 100 rows and hands back an `offset`
      // for the rest. Reading only the first page and then reporting "alle N
      // klanten bestaan in Clerk" is worse than not checking at all: past 100
      // users it green-lights the deploy while every unchecked customer walks
      // into a fresh empty tenant on first sign-in. This check exists purely to
      // prevent that, so it has to see everyone.
      const rows = [];
      let offset = '';
      do {
        const url = `https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${USERS_TABLE}`
                  + `?pageSize=100${offset ? '&offset=' + encodeURIComponent(offset) : ''}`;
        const r = await probe(url, { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
        if (!r.ok) throw new Error(r.error || `Airtable ${r.status}`);
        const d = await r.res.json();
        rows.push(...(d.records || []));
        offset = d.offset || '';
      } while (offset);
      const actief = rows
        .map((rec) => rec.fields || {})
        .filter((f) => (f.fldb8sGE3Bslch8f8 === true || f.Active === true))
        .map((f) => String(f.fldsqiSy41CCDickr || f.Email || '').trim().toLowerCase())
        .filter(Boolean);
      const missing = [];
      for (const email of actief) {
        const found = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
        if (!((found.data || found)[0])) missing.push(email);
      }
      if (!missing.length) ok(`alle ${actief.length} actieve klant(en) uit Airtable bestaan in Clerk`);
      else fail(`${missing.length} van ${actief.length} actieve klant(en) hebben geen Clerk-account`,
                missing.slice(0, 10).join('\n') + '\nOp te lossen met: node scripts/clerk-sync-users.js --apply');
    } catch (e) {
      warn(`kruiscontrole mislukt: ${e.message}`);
    }
  }

  // ── 7. Wat de app zelf zou uitsturen ───────────────────────────────────────
  // Niet nagebouwd maar echt opgevraagd: api/dashboard.js wordt hier met de
  // huidige omgeving uitgevoerd, zodat de CSP die hieronder staat letterlijk de
  // CSP is die een bezoeker krijgt. Zo kan dit script niet gelijk hebben
  // terwijl de app iets anders doet.
  head('wat de app hiermee uitstuurt');
  try {
    delete require.cache[require.resolve('../api/dashboard.js')];
    const handler = require('../api/dashboard.js');
    const headers = {};
    await new Promise((resolve) => {
      handler({ method: 'GET', headers: {}, url: '/dashboard' },
        { setHeader: (k, v) => { headers[k] = v; }, status() { return this; }, send() { resolve(); } });
    });
    const csp = String(headers['Content-Security-Policy'] || '');
    if (host && csp.includes(`https://${host}`)) ok(`de CSP staat ${host} toe`);
    else if (!enabled) warn('de CSP noemt Clerk nog niet — logisch, CLERK_ENABLED staat uit');
    else fail('de CSP staat de Clerk-host NIET toe', 'De browser blokkeert dan clerk.browser.js. Controleer de publishable key.');

    if (enabled && csp.includes('challenges.cloudflare.com')) ok('de CSP staat Clerk\'s bot-protectie toe');
    else if (enabled) fail('challenges.cloudflare.com ontbreekt in de CSP',
                           'Op een productie-instantie staat Smart CAPTCHA standaard aan; zonder deze host\n'
                         + 'blijft het aanmeldformulier hangen op een vakje dat nooit verschijnt.');

    const _clerk = require('../api/_clerk.js');
    const parties = _clerk.authorizedParties();
    if (!parties) warn('authorizedParties staat uit (CLERK_AUTHORIZED_PARTIES is leeg)',
                       'Tokens van elke origin op deze instantie worden dan aanvaard.');
    else if (parties.includes(APP_ORIGIN)) ok(`authorizedParties: ${parties.join(', ')}`);
    else warn(`authorizedParties bevat ${APP_ORIGIN} niet: ${parties.join(', ')}`,
              'Sessies vanaf het echte app-domein worden dan geweigerd.');
  } catch (e) {
    warn(`kon de app niet uitvoeren om dit te controleren: ${e.message}`);
  }

  // ── 8. Faro ────────────────────────────────────────────────────────────────
  // Faro heeft één sleutel nodig die de rest van Helvaro niet gebruikt, en een
  // paar die er al zijn. Zonder deze sectie moest je dat afleiden uit de code.
  /* ── Betalen ────────────────────────────────────────────────────────────────
     Dit is de sectie die bepaalt of een klant zichzelf kan laten worden tot
     betalende klant. Ontbreekt hier iets, dan werkt de app gewoon door -- maar
     dan moet er voor elke nieuwe klant iemand met de hand een plan invullen, en
     dat is precies wat niet meeschaalt. */
  head('betalen');

  const _plans = require('../api/_plans.js');
  const _stripe = require('../api/_stripe.js');
  const stripeSk = (process.env.STRIPE_SECRET_KEY || '').trim();
  const whsec = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();

  if (!stripeSk) {
    warn('STRIPE_SECRET_KEY ontbreekt — er is geen betaalweg',
         'Klanten zien "Binnenkort" bij elk plan, en bijkopen valt terug op een\n'
       + 'aanvraag per mail. Alles werkt, maar elke betaling is handwerk.');
  } else if (!_stripe.configured()) {
    fail(`STRIPE_SECRET_KEY heeft niet de juiste vorm (${mask(stripeSk)})`, 'Verwacht sk_live_… of sk_test_….');
  } else if (/^sk_test_/.test(stripeSk)) {
    warn('STRIPE_SECRET_KEY is een TESTsleutel', 'Echte betalingen komen niet binnen. Prima om te proberen, niet om mee te draaien.');
  } else {
    ok(`STRIPE_SECRET_KEY aanwezig (${mask(stripeSk)}) — live`);
  }

  if (stripeSk && !whsec) {
    /* Dit is de gevaarlijkste combinatie van de twee: betalen lukt, maar de
       credits komen nooit aan. De klant heeft dan betaald en niets gekregen. */
    fail('STRIPE_WEBHOOK_SECRET ontbreekt terwijl betalen AAN staat',
         'De betaling slaagt en de webhook wordt geweigerd — de klant betaalt en\n'
       + 'krijgt niets. Zet in Stripe een webhook naar https://app.helvaro.pro/api/stripe\n'
       + 'met checkout.session.completed, invoice.paid en customer.subscription.deleted.');
  } else if (whsec && !_stripe.webhookConfigured()) {
    fail(`STRIPE_WEBHOOK_SECRET heeft niet de juiste vorm (${mask(whsec)})`, 'Verwacht whsec_….');
  } else if (whsec) {
    ok(`STRIPE_WEBHOOK_SECRET aanwezig (${mask(whsec)})`);
  }

  // Het tarief voor bijkopen hoort gelijk te zijn aan het goedkoopste plan.
  const credits = require('../api/_credits.js');
  const starterPer = _plans.perCredit(_plans.STANDAARD_PLAN);
  if (Math.abs(credits.TOPUP_RATE_EUR - starterPer) < 0.001) {
    ok(`bijkopen kost hetzelfde als een abonnement (EUR ${credits.TOPUP_RATE_EUR}/credit)`);
  } else if (credits.TOPUP_RATE_EUR < starterPer) {
    warn(`bijkopen (EUR ${credits.TOPUP_RATE_EUR}/credit) is GOEDKOPER dan ${_plans.STANDAARD_PLAN} (EUR ${Math.round(starterPer * 10000) / 10000})`,
         'Een klant neemt dan het kleinste plan en koopt eeuwig bij. Zet\n'
       + 'CREDIT_TOPUP_RATE_EUR gelijk aan de planprijs, of haal hem weg zodat hij\n'
       + 'automatisch volgt.');
  } else {
    warn(`bijkopen (EUR ${credits.TOPUP_RATE_EUR}/credit) is DUURDER dan ${_plans.STANDAARD_PLAN} (EUR ${Math.round(starterPer * 10000) / 10000})`,
         'Je straft een klant die meer afneemt dan hij dacht. Zie CREDIT_TOPUP_RATE_EUR.');
  }

  // Zelfaanmelden.
  const openSignup = require('../api/_clerk.js').vlagAan(process.env.PUBLIC_SIGNUP_ENABLED);
  if (openSignup) ok('PUBLIC_SIGNUP_ENABLED staat aan — iemand kan zich zelf aanmelden');
  else warn('PUBLIC_SIGNUP_ENABLED staat uit',
            'Zonder Clerk is er dan GEEN weg naar binnen voor een nieuwe klant: de knop\n'
          + '"Account aanmaken" zegt dan alleen dat aanmelden tijdelijk uit staat.');

  head('faro');

  const faroOn = process.env.FARO_WORKSPACE_ENABLED === '1';
  if (faroOn) ok('FARO_WORKSPACE_ENABLED=1 — Faro is aan');
  else warn('FARO_WORKSPACE_ENABLED staat niet op 1 — Faro is uit',
            'De route geeft dan overal 404. Zet dit pas om NA het uitrollen van deze tak:\n'
          + 'de versie die nu live staat geeft elke ingelogde gebruiker een 401 op de\n'
          + 'Faro-pagina, en dat is precies de pagina waar je na het inloggen landt.');

  // Het model
  const provider = (process.env.FARO_PROVIDER || 'claude').trim().toLowerCase();
  if (provider === 'demo') {
    fail('FARO_PROVIDER=demo — Faro geeft dan verzonnen antwoorden',
         'Bedoeld om lokaal te proberen zonder kosten. Nooit in productie: hij toont\n'
       + 'leads die niet bestaan.');
  } else if (provider === 'openai') {
    warn('FARO_PROVIDER=openai — die adapter is een stub', 'Laat leeg voor Claude, de enige werkende.');
  } else {
    ok('FARO_PROVIDER=claude (standaard)');
  }

  const anth = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (provider === 'claude') {
    if (!anth) {
      fail('ANTHROPIC_API_KEY ontbreekt — dit is Faro\'s brein',
           'De ENIGE sleutel die je erbij moet zetten; de rest heeft Helvaro al.\n'
         + 'Op te halen op console.anthropic.com. Zonder deze zegt Faro niets.');
    } else if (!/^sk-ant-/.test(anth)) {
      warn(`ANTHROPIC_API_KEY heeft een onverwachte vorm (${mask(anth)})`, 'Verwacht sk-ant-….');
    } else {
      ok(`ANTHROPIC_API_KEY aanwezig (${mask(anth)})`);
    }
  }

  // Zonder dit weigert elke bevestigde actie — en dat lijkt op een bug, niet op
  // een ontbrekende variabele.
  if (!process.env.SESSION_SECRET) {
    fail('SESSION_SECRET ontbreekt — Faro mag dan NIETS uitvoeren',
         'Hiermee worden bevestigingen ondertekend. api/_faro/actions.js faalt dicht:\n'
       + 'elk voorstel dat je bevestigt wordt geweigerd. Dat oogt als een kapotte knop.');
  } else {
    ok('SESSION_SECRET aanwezig — bevestigingen kunnen ondertekend worden');
  }

  if (process.env.FARO_DEMO_MODE === '1') {
    fail('FARO_DEMO_MODE=1 — Faro toont fixture-leads die niet bestaan', 'Uit in productie.');
  }

  // Beeld en video: allebei of geen van beide.
  const openai = (process.env.OPENAI_API_KEY || process.env.OPENAI || '').trim();
  const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL_OIDC_TOKEN);
  if (!openai && !blob) {
    ok('geen beeld/video geconfigureerd — chat werkt gewoon, die tools geven een nette foutkaart');
  } else if (openai && blob) {
    ok('beeld en video kunnen: OpenAI-sleutel én opslag aanwezig');
  } else if (openai && !blob) {
    warn('OPENAI_API_KEY zonder opslag (BLOB_READ_WRITE_TOKEN)',
         'Een beeld wordt dan wél gegenereerd — en betaald — maar kan nergens heen.');
  } else {
    warn('opslag aanwezig maar geen OPENAI_API_KEY', 'Beeldgeneratie blijft uit.');
  }

  // De twee tabellen waar gesprekken in gaan.
  if (process.env.API_AIRTABLE && process.env.BASE_AIRTABLE) {
    for (const tbl of ['ai_conversations', 'ai_messages']) {
      const r = await probe(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/${tbl}?pageSize=1`,
                            { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
      if (r.ok) ok(`tabel ${tbl} bestaat`);
      else warn(`tabel ${tbl} niet gevonden (HTTP ${r.status || r.error})`,
                'Gesprekken leven dan alleen in de browser: ze overleven een herlaadbeurt,\n'
              + 'maar niet je laptop. Velden staan in de kop van api/_faro/store.js.');
    }
    /* De pandentabel. Apart, want hij hoort bij een andere functie en de
       boodschap is een andere: zonder deze tabel weet de AI niet over welk
       pand een lead het heeft, en valt hij terug op de website van de klant --
       waar bij vier panden vier prijzen op staan. */
    const rp = await probe(`https://api.airtable.com/v0/${process.env.BASE_AIRTABLE}/properties?pageSize=1`,
                           { headers: { Authorization: `Bearer ${process.env.API_AIRTABLE}` } });
    if (rp.ok) ok('tabel properties bestaat');
    else warn(`tabel properties niet gevonden (HTTP ${rp.status || rp.error})`,
              'De Panden-pagina zegt dat eerlijk en de AI verzint geen panden, maar hij kan\n'
            + 'ook niet weten over welk pand een lead het heeft. Velden staan in de kop van\n'
            + 'api/_properties.js.');
  } else {
    warn('tabellen niet te controleren — Airtable-credentials niet beschikbaar');
  }

  /* ── Video ─────────────────────────────────────────────────────────────────
     Het videomodel staat op kling, en de kling-adapter is geschreven zonder
     toegang tot de documentatie van de leverancier -- zes aannames, elk met een
     naam, in de kop van api/_kling.js. Dit blok zegt in welke van de drie
     toestanden je staat, want ze zien er in de app hetzelfde uit en kosten
     verschillend veel geld. */
  try {
    const mm  = require(path.join(__dirname, '..', 'api', '_media-models.js'));
    const va  = require(path.join(__dirname, '..', 'api', '_video-adapters.js'));
    const vm  = mm.videoModel();
    const adp = vm.adapter || vm.provider;
    const mist = va.missingEnv(adp);

    if (adp === 'demo') {
      fail('het videomodel staat op demo — er komt nooit een echte video uit',
           'HELVARO_VIDEO_MODEL staat op demo-video. Zet hem leeg voor kling-3.');
    } else if (mist.length) {
      warn(`video staat uit: ${mist.join(' + ')} ontbre${mist.length > 1 ? 'ken' : 'ekt'}`,
           'De AI biedt geen video aan en zegt eerlijk dat het niet aanstaat. Er wordt\n'
         + 'niets afgeschreven. Zet de sleutels om video aan te zetten.');
    } else {
      warn(`video staat AAN met ${vm.id}, maar de adapter is nooit tegen de echte API gedraaid`,
           'Draai `node scripts/kling-check.js` -- één echte opdracht, hij zegt per aanname\n'
         + '(A1 tot A6) of hij klopt. Zonder die controle faalt de eerste klantvideo als een\n'
         + '400 die op een storing lijkt. Afschrijven gebeurt pas bij een geslaagde video,\n'
         + 'dus een mislukte poging kost de klant niets.');
    }
  } catch (e) {
    warn('video-instellingen niet te lezen', String(e && e.message).slice(0, 200));
  }

  // Sora heeft een einddatum in de registry.
  try {
    const mm = require(path.join(__dirname, '..', 'api', '_media-models.js'));
    if (typeof mm.isSunsetting === 'function' && mm.isSunsetting()) {
      warn('het videomodel loopt af', 'Zie api/_media-models.js voor de datum en de opvolger.');
    }
  } catch (_) { /* registry niet leesbaar; geen blokkade */ }

  // ── Slot ───────────────────────────────────────────────────────────────────
  console.log('');
  if (fails) {
    console.log(`${fails} probleem/problemen en ${warns} aandachtspunt(en). Zet de schakelaars nog niet om.`);
    process.exit(1);
  }
  if (warns) {
    console.log(`Geen blokkerende problemen, ${warns} aandachtspunt(en) — lees ze na en zet daarna om.`);
    process.exit(0);
  }
  console.log('Alles in orde. Clerk en Faro kunnen aan.');
})().catch((e) => { console.error('\nOnverwachte fout:', e.message); process.exit(1); });
