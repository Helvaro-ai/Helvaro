// ── WhatsApp Embedded Signup ─────────────────────────────────────────────────
// Laat een klant zijn EIGEN WhatsApp-nummer aan Helvaro koppelen, in plaats van
// mee te liften op het gedeelde Helvaro-nummer.
//
// Waarom dit ertoe doet: op het gedeelde nummer ziet de lead "Helvaro" in plaats
// van de naam van de klant, en delen alle klanten één verzendlimiet en één
// kwaliteitsscore bij Meta. Eén klant die klachten oploopt trekt dus iedereen
// mee omlaag. Met een eigen nummer staat elke klant op zijn eigen rekening.
//
// ── Wat er gebeurt ───────────────────────────────────────────────────────────
// 1. De klant klikt op een knop; Meta's popup regelt account, nummer en
//    verificatie. Wij zien dat proces niet en willen dat ook niet zien.
// 2. Terug komen drie dingen: een eenmalige `code`, een `waba_id` en een
//    `phone_number_id`.
// 3. Wij wisselen die code voor een token, abonneren onze app op de WABA (anders
//    krijgen we geen webhooks van dat nummer) en registreren het nummer voor de
//    Cloud API (anders kan het niet zenden).
// 4. Het phone_number_id gaat op Client Config. Vanaf dat moment pakt de
//    bestaande verzendcode in form.js, leads.js en cron-followup.js dat nummer
//    automatisch op — daar hoeft niets voor te veranderen.
//
// ── Waar dit op wacht ────────────────────────────────────────────────────────
// Embedded Signup werkt alleen met Advanced Access op whatsapp_business_management
// via App Review (Tech Provider). Tot die goedkeuring binnen is geeft Meta een
// foutmelding in de popup. De code hieronder is compleet; alleen de toestemming
// ontbreekt nog. isConfigured() is daarom de schakelaar: zonder de env-vars
// toont het dashboard de knop niet eens.

const crypto = require('crypto');

const GRAPH = 'https://graph.facebook.com/v19.0';
const TIMEOUT_MS = 15_000;

function appId()     { return process.env.META_APP_ID || ''; }
// Hergebruikt bewust WA_APP_SECRET: dat IS het app-secret, het wordt alleen
// elders gebruikt om webhook-handtekeningen te controleren. Een tweede env-var
// met dezelfde waarde is een tweede plek om fout te lopen.
function appSecret() { return process.env.WA_APP_SECRET || process.env.META_APP_SECRET || ''; }
function configId()  { return process.env.META_ES_CONFIG_ID || ''; }

function isConfigured() {
  return !!(appId() && appSecret() && configId());
}

// Meta eist een 6-cijferige pincode bij het registreren van een nummer, en
// vraagt die opnieuw als het nummer later opnieuw geregistreerd moet worden.
// Afgeleid in plaats van willekeurig, zodat een tweede poging dezelfde pin
// gebruikt en we hem nergens hoeven op te slaan — een opgeslagen pin is een
// geheim erbij dat we anders moeten beschermen.
function derivePin(phoneNumberId) {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || '';
  if (!base) throw new Error('SESSION_SECRET ontbreekt — kan geen pin afleiden');
  const h = crypto.createHmac('sha256', base + '|wa-pin').update(String(phoneNumberId)).digest();
  return String(h.readUInt32BE(0) % 1000000).padStart(6, '0');
}

async function graph(path, { method = 'GET', token, body, query } = {}) {
  const url = new URL(GRAPH + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body)  headers['Content-Type'] = 'application/json';

  const r = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Meta's foutmeldingen zijn bruikbaar en horen bij de ops-logs, maar niet
    // ongefilterd naar de browser — vandaar dat de caller een eigen, nette
    // tekst teruggeeft en dit alleen logt.
    const msg = (data && data.error && (data.error.error_user_msg || data.error.message)) || ('http ' + r.status);
    const err = new Error(msg);
    err.metaCode = data && data.error && data.error.code;
    throw err;
  }
  return data;
}

// Stap 1: eenmalige code -> business token. Dit token hoort bij de WABA van de
// klant en wordt hier alleen gebruikt om te abonneren en te registreren; we
// slaan het NIET op. Na die twee calls hebben we het niet meer nodig, want
// verzenden gebeurt met Helvaro's eigen systeemtoken zodra de app op de WABA
// geabonneerd is. Een token dat je niet bewaart kan ook niet lekken.
async function exchangeCode(code) {
  const d = await graph('/oauth/access_token', {
    query: { client_id: appId(), client_secret: appSecret(), code },
  });
  if (!d.access_token) throw new Error('geen access_token in Meta-antwoord');
  return d.access_token;
}

// Stap 2: zonder dit abonnement krijgt Helvaro geen enkele webhook van dit
// nummer — de klant zou berichten kunnen versturen maar nooit een antwoord
// zien binnenkomen.
async function subscribeApp(wabaId, token) {
  return graph(`/${encodeURIComponent(wabaId)}/subscribed_apps`, { method: 'POST', token });
}

// Stap 3: registreren bij de Cloud API. Zonder dit weigert Meta elke verzending
// vanaf dit nummer.
async function registerPhone(phoneNumberId, token) {
  return graph(`/${encodeURIComponent(phoneNumberId)}/register`, {
    method: 'POST',
    token,
    body: { messaging_product: 'whatsapp', pin: derivePin(phoneNumberId) },
  });
}

// Voor het dashboard: welk nummer is er nu eigenlijk gekoppeld? Zonder dit zou
// de klant alleen een phone_number_id zien, en daar heeft niemand iets aan.
async function getPhoneInfo(phoneNumberId, token) {
  try {
    const d = await graph(`/${encodeURIComponent(phoneNumberId)}`, {
      token: token || process.env.WHATSAPP_TOKEN,
      query: { fields: 'display_phone_number,verified_name,quality_rating' },
    });
    return {
      number:   d.display_phone_number || '',
      name:     d.verified_name || '',
      quality:  d.quality_rating || '',
    };
  } catch (e) {
    // Niet fataal: de koppeling bestaat, we kunnen alleen het label niet ophalen.
    console.warn('[waes] nummerinfo ophalen mislukt:', e && e.message);
    return { number: '', name: '', quality: '' };
  }
}

// De volledige afhandeling na de popup. Volgorde is niet vrijblijvend:
// abonneren moet vóór registreren, anders mist Helvaro de webhooks van de
// registratie zelf. Faalt een van beide, dan slaan we NIETS op — een half
// gekoppeld nummer dat wel in Airtable staat maar niet kan zenden is erger dan
// geen koppeling, want dan denkt de app dat de klant een eigen nummer heeft en
// valt hij niet meer terug op het gedeelde nummer.
async function completeSignup({ code, wabaId, phoneNumberId }) {
  const token = await exchangeCode(code);
  await subscribeApp(wabaId, token);
  await registerPhone(phoneNumberId, token);
  const info = await getPhoneInfo(phoneNumberId, token);
  return { wabaId, phoneNumberId, ...info };
}

module.exports = {
  isConfigured, appId, configId,
  exchangeCode, subscribeApp, registerPhone, getPhoneInfo, completeSignup,
  derivePin,
};
