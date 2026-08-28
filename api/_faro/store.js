'use strict';
/*
 * Faro — persistence for conversations, messages and projects.
 *
 * SCAFFOLD: full function surface, no queries wired.
 *
 * ── Waar dit heen schrijft ───────────────────────────────────────────────────
 * Oorspronkelijk: naar een VPS met Postgres, via de Airtable-vormige façade in
 * api/_pgapi.js. Die VPS bestaat niet — bevestigd door de eigenaar op
 * 2026-08-19; zie de kop van api/_pgapi.js.
 *
 * Omdat die façade Airtable-dialect spreekt, waren de queries hieronder al in
 * precies de vorm die Airtable zelf ook accepteert. Er hoefde dus geen enkele
 * query te veranderen: alleen het TRANSPORT kiest nu zelf waar het heen gaat.
 *   1. is PG_API_URL/PG_API_TOKEN gezet, dan die (voor als er ooit een
 *      Postgres bij komt — dan verandert hier verder niets);
 *   2. anders Airtable, want dat is de database die er wel is;
 *   3. en bestaat de tabel daar nog niet, dan valt Faro terug op de
 *      geschiedenis die de browser bijhoudt.
 *
 * Het bezwaar uit de oude kop blijft waar en is bewust geaccepteerd: Airtable
 * is 5 requests/seconde per base en rekent per record, en een gesprek schrijft
 * een rij per beurt. Voor een handvol kantoren met tientallen beurten per dag
 * is dat ruim binnen de marge. Wordt dat ooit krap, dan is stap 1 hierboven de
 * uitweg zonder de rest te hoeven aanraken.
 *
 * ── Tabellen die hiervoor moeten bestaan ─────────────────────────────────────
 * In Airtable, met precies deze veldnamen (de code leest ze letterlijk):
 *
 *   ai_conversations
 *     project_code     Single line text   ← de tenantsleutel, verplicht
 *     user_id          Single line text
 *     title            Single line text
 *     project_id       Single line text   (mag leeg)
 *     favorite         Checkbox
 *     created_at       Single line text   (ISO-8601)
 *     last_message_at  Single line text   (ISO-8601, sorteersleutel zijbalk)
 *
 *   ai_messages
 *     conversation_id  Single line text   ← record-id uit ai_conversations
 *     role             Single line text   ('user' of 'assistant')
 *     content          Long text          (JSON: blokken)
 *     components       Long text          (JSON)
 *     tool_calls       Long text          (JSON)
 *     tokens_in        Number
 *     tokens_out       Number
 *     created_at       Single line text   (ISO-8601, sorteersleutel)
 *
 * Datums bewust als tekst: de code schrijft en vergelijkt ISO-strings, en een
 * Airtable-datumveld normaliseert die stilletjes naar een andere precisie.
 *
 *   ai_projects                     -- requirement 12
 *     id, project_code, name, property_id, status, created_at, updated_at
 *
 *   ai_project_links                -- what a project gathers
 *     id, project_id, kind ('conversation'|'lead'|'image'|'video'|'listing'|'campaign'),
 *     ref_id, created_at
 *
 * ── Tenant scoping ───────────────────────────────────────────────────────────
 * EVERY function takes projectCode and EVERY query filters on it. There is no
 * "get by id" that does not also check ownership: an AI feature whose ids are
 * partly model-influenced must not have a lookup path where a guessed id
 * returns another agency's conversation.
 */

const _pg = require('../_pgapi');
const fixtures = require('./fixtures');

/* Namen, geen Airtable-ids: een tabel die nog aangemaakt moet worden heeft nog
   geen id, en Airtable accepteert de naam net zo goed in het pad. Wie ze later
   hernoemt breekt dit — daarom staan ze hier op één plek. */
const T_CONVERSATIONS = 'ai_conversations';
const T_MESSAGES      = 'ai_messages';
const T_PROJECTS      = 'ai_projects';
const T_PROJECT_LINKS = 'ai_project_links';

/* ── Beschikbaarheid ─────────────────────────────────────────────────────────
 * De tabellen hierboven bestaan pas op de VPS als ze daar aangemaakt zijn. Tot
 * die tijd moet Faro NIET stuk zijn — hij moet alleen niets onthouden tussen
 * sessies. Dat onderscheid is het hele verschil tussen "je gesprek is weg als
 * je de browser sluit" en "je kunt precies één vraag stellen".
 *
 * available() onthoudt de uitkomst per instance: één 404 op de tabel betekent
 * dat hij er niet is, en dan hoeft niet elke beurt het opnieuw te proberen.
 * null = nog niet gekeken.
 */
let _available = null;

function configured() {
  return Boolean(
    (process.env.PG_API_URL && process.env.PG_API_TOKEN) ||
    (process.env.API_AIRTABLE && process.env.BASE_AIRTABLE)
  );
}

/* Eén deur naar buiten, zodat elke query hieronder onveranderd blijft. De
   paden zijn Airtable-dialect (filterByFormula, sort[0][field], pageSize), wat
   allebei de bestemmingen begrijpen. */
function backend() {
  /* Keek alleen of de variabelen GEZET waren. Sinds de VPS opgeheven is, is dat
     de verkeerde vraag: een teruggeplakte oude waarde wijst naar een kaal IP van
     een machine die niet meer bestaat, en dan zouden alle gesprekken daarheen
     gestuurd worden in plaats van naar Airtable. _pg.configured() weigert zo'n
     doel nu (zie de kop van api/_pgapi.js), dus dit volgt dat oordeel. */
  return _pg.configured() ? 'pg' : 'airtable';
}

async function dbFetch(pathAndQuery, options = {}) {
  /* Stond hier als `return dbFetch(pathAndQuery, options)` — dat riep zichzelf
     aan met dezelfde argumenten. Met PG_API_URL/PG_API_TOKEN gezet liep élke
     Faro-query daarom vast op een RangeError (stack overflow) in plaats van de
     database te bereiken. available() ving die op, zette _available=false, en
     Faro meldde voor de rest van de instance "gesprekken leven alleen in de
     browser": gesprekken werden niet bewaard en oude gesprekken laadden leeg.
     _pgapi was al geïmporteerd maar werd nergens gebruikt. */
  if (backend() === 'pg') return _pg.pgFetch(pathAndQuery, options);
  const baseId = process.env.BASE_AIRTABLE;
  const token = process.env.API_AIRTABLE;
  if (!baseId || !token) throw new Error('store: geen database geconfigureerd');
  const headers = Object.assign(
    { Authorization: `Bearer ${token}` },
    options.body ? { 'Content-Type': 'application/json' } : {},
    options.headers || {}
  );
  return fetch(`https://api.airtable.com/v0/${baseId}/${pathAndQuery}`,
               Object.assign({}, options, { headers }));
}

async function available() {
  if (_available !== null) return _available;
  if (!configured()) { _available = false; return false; }
  try {
    const r = await dbFetch(`${T_CONVERSATIONS}?pageSize=1`);
    // 404 = tabel bestaat niet (nog). 401/403 = verkeerd token; in beide
    // gevallen is doorgaan zinloos maar mag Faro niet omvallen.
    _available = r.ok;
    if (!r.ok) {
      console.warn(`[faro/store] tabel ${T_CONVERSATIONS} niet gevonden in ${backend()} (HTTP ${r.status}) — ` +
                   'gesprekken leven alleen in de browser tot die tabel bestaat');
    }
  } catch (e) {
    console.warn(`[faro/store] ${backend()} onbereikbaar:`, e && e.message);
    _available = false;
  }
  return _available;
}

/* Airtable-vormige façade: velden komen terug onder `fields`. */
function rowToConversation(rec) {
  const f = (rec && rec.fields) || {};
  return {
    id: rec.id,
    projectCode: f.project_code || '',
    userId: f.user_id || '',
    title: f.title || 'Nieuw gesprek',
    projectId: f.project_id || null,
    // project_name bestaat NIET als kolom en levert dus altijd ''. Bewust zo
    // gelaten: projecten zijn nog niet aangesloten (createProject roept
    // NOT_WIRED aan), en een kolom aanmaken voor een functie die nog niet
    // bestaat is een lege belofte in de base. Zodra projecten er zijn: veld
    // toevoegen, hier verandert dan niets.
    projectName: f.project_name || '',
    favorite: f.favorite === true,
    createdAt: f.created_at || '',
    lastMessageAt: f.last_message_at || f.created_at || '',
  };
}

function rowToMessage(rec) {
  const f = (rec && rec.fields) || {};
  let content = f.content;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { content = [{ type: 'text', text: String(f.content) }]; }
  }
  return {
    id: rec.id,
    role: f.role === 'assistant' ? 'assistant' : 'user',
    content: Array.isArray(content) ? content : [],
    createdAt: f.created_at || '',
  };
}

/* Formule-escaping, zelfde regel als api/_leads-read.js. */
function esc(v) {
  return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const NOT_WIRED = () => {
  throw new Error('ai/store: not wired — VPS tables not yet created');
};

// ── Conversations ────────────────────────────────────────────────────────────

/** Most recent conversations for the sidebar's "Recent" list. */
async function listConversations(projectCode, opts = {}) {
  if (fixtures.isEnabled()) return fixtures.CONVERSATIONS.slice();
  if (!projectCode) throw new Error('store.listConversations: projectCode is required');
  if (!(await available())) return [];
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const clauses = [`{project_code}="${esc(projectCode)}"`];
  if (opts.favoritesOnly) clauses.push('{favorite}=TRUE()');
  if (opts.projectId) clauses.push(`{project_id}="${esc(opts.projectId)}"`);
  const formula = encodeURIComponent(clauses.length > 1 ? `AND(${clauses.join(',')})` : clauses[0]);
  try {
    const r = await dbFetch(
      `${T_CONVERSATIONS}?filterByFormula=${formula}&sort[0][field]=last_message_at&sort[0][direction]=desc&pageSize=${limit}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.records || []).map(rowToConversation);
  } catch (e) {
    console.warn('[faro/store] listConversations:', e && e.message);
    return [];
  }
}

/* Geen "haal op by id" zonder eigendomscontrole. De ids in dit systeem worden
   deels door een model aangeraakt, en een geraden id mag nooit het gesprek van
   een ander kantoor teruggeven — daarom filtert dit op project_code en niet
   alleen op de id in het pad. */
async function getConversation(projectCode, id) {
  if (fixtures.isEnabled()) {
    return fixtures.CONVERSATIONS.find((c) => c.id === id) || null;
  }
  if (!projectCode || !id) return null;
  if (!(await available())) return null;
  const formula = encodeURIComponent(`AND({project_code}="${esc(projectCode)}",RECORD_ID()="${esc(id)}")`);
  try {
    const r = await dbFetch(`${T_CONVERSATIONS}?filterByFormula=${formula}&maxRecords=1`);
    if (!r.ok) return null;
    const d = await r.json();
    const rec = (d.records || [])[0];
    return rec ? rowToConversation(rec) : null;
  } catch (e) {
    console.warn('[faro/store] getConversation:', e && e.message);
    return null;
  }
}

async function createConversation(projectCode, userId, opts = {}) {
  if (!projectCode) throw new Error('store.createConversation: projectCode is required');
  if (!(await available())) return null;
  const now = new Date().toISOString();
  try {
    const r = await dbFetch(T_CONVERSATIONS, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          project_code: projectCode,
          user_id: String(userId || ''),
          title: String(opts.title || 'Nieuw gesprek').slice(0, 120),
          project_id: opts.projectId || null,
          favorite: false,
          created_at: now,
          last_message_at: now,
        },
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return rowToConversation(d);
  } catch (e) {
    console.warn('[faro/store] createConversation:', e && e.message);
    return null;
  }
}

/**
 * Title a conversation from its first user message.
 * Deliberately derived from the user's own words rather than a second model
 * call: it is instant, free, and predictable. The sidebar in requirement 3
 * shows exactly this kind of title ("Villa campagne — Knokke").
 */
function deriveTitle(firstUserMessage) {
  const t = String(firstUserMessage || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Nieuw gesprek';
  return t.length <= 48 ? t : `${t.slice(0, 47)}…`;
}

/* Elk van deze drie controleert EERST het eigendom via getConversation() en
   patcht daarna pas. Zonder die stap zou een geraden id genoeg zijn om het
   gesprek van een ander kantoor te hernoemen of te verwijderen. */
async function patchConversation(projectCode, id, fields) {
  const own = await getConversation(projectCode, id);
  if (!own) return null;
  try {
    const r = await dbFetch(`${T_CONVERSATIONS}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    });
    if (!r.ok) return null;
    return rowToConversation(await r.json());
  } catch (e) {
    console.warn('[faro/store] patchConversation:', e && e.message);
    return null;
  }
}

async function renameConversation(projectCode, id, title) {
  return patchConversation(projectCode, id, { title: String(title || '').slice(0, 120) });
}

async function setFavorite(projectCode, id, favorite) {
  return patchConversation(projectCode, id, { favorite: Boolean(favorite) });
}

async function deleteConversation(projectCode, id) {
  const own = await getConversation(projectCode, id);
  if (!own) return false;
  try {
    // Berichten eerst: een gesprek weghalen en de berichten laten staan levert
    // rijen op die aan niets meer hangen en die niemand ooit nog opruimt.
    const formula = encodeURIComponent(`{conversation_id}="${esc(id)}"`);
    const list = await dbFetch(`${T_MESSAGES}?filterByFormula=${formula}&pageSize=100`);
    if (list.ok) {
      const d = await list.json();
      for (const rec of d.records || []) {
        await dbFetch(`${T_MESSAGES}/${encodeURIComponent(rec.id)}`, { method: 'DELETE' });
      }
    }
    const r = await dbFetch(`${T_CONVERSATIONS}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return r.ok;
  } catch (e) {
    console.warn('[faro/store] deleteConversation:', e && e.message);
    return false;
  }
}

// ── Messages ─────────────────────────────────────────────────────────────────

/** Ordered messages, oldest first. Used to rehydrate a conversation. */
async function listMessages(projectCode, conversationId, opts = {}) {
  if (fixtures.isEnabled()) {
    return (fixtures.MESSAGES && fixtures.MESSAGES[conversationId]) || [];
  }
  if (!projectCode || !conversationId) return [];
  if (!(await available())) return [];
  // Eigendom via het gesprek, niet via het bericht: zo hoeft project_code niet
  // op elke berichtrij herhaald te worden en kan hij ook niet uit de pas lopen.
  const own = await getConversation(projectCode, conversationId);
  if (!own) return [];
  const formula = encodeURIComponent(`{conversation_id}="${esc(conversationId)}"`);

  /* Twee dingen zaten hier fout, allebei zichtbaar als "het oude gesprek laadt
     niet".

     1. pageSize mocht tot 200. Airtable weigert alles boven 100 met een 422,
        en `if (!r.ok) return []` maakte daar een leeg gesprek van in plaats van
        een fout. Geen aanroeper gaf een limit mee, dus het lag op scherp zonder
        af te gaan.
     2. Er werd één pagina opgehaald en verder niets. Bij meer dan 100 berichten
        kreeg je de OUDSTE honderd (gesorteerd oplopend) en ontbrak juist het
        recente deel — precies het stuk waaraan je ziet of het gesprek geladen is.

     Nu wordt er doorgepagineerd op de offset-cursor. HARD_CAP begrenst wat één
     verzoek kan opvragen; windowForModel() knipt daarna alsnog terug voor het
     model. */
  const PAGE_SIZE = 100;              // Airtable's maximum, niet een keuze
  const HARD_CAP  = 1000;             // 10 pagina's; daarboven is het geen gesprek meer
  const limit = Math.min(HARD_CAP, Math.max(1, opts.limit || 100));

  const out = [];
  let offset = '';
  try {
    do {
      const page = Math.min(PAGE_SIZE, limit - out.length);
      const q = `${T_MESSAGES}?filterByFormula=${formula}`
              + `&sort[0][field]=created_at&sort[0][direction]=asc&pageSize=${page}`
              + (offset ? `&offset=${encodeURIComponent(offset)}` : '');
      const r = await dbFetch(q);
      if (!r.ok) {
        /* Een halve lijst stilzwijgend teruggeven zou een afgekapt gesprek als
           compleet presenteren. Bij de eerste pagina is er niets; bij een latere
           houden we wat we hebben, want dat is beter dan niets — maar het wordt
           wel gemeld. */
        console.warn(`[faro/store] listMessages: HTTP ${r.status} na ${out.length} bericht(en)`);
        break;
      }
      const d = await r.json();
      for (const rec of (d.records || [])) out.push(rowToMessage(rec));
      offset = d.offset || '';
    } while (offset && out.length < limit);
    return out;
  } catch (e) {
    console.warn('[faro/store] listMessages:', e && e.message);
    return out;
  }
}

async function appendMessage(projectCode, conversationId, message) {
  if (!projectCode || !conversationId || !message) return null;
  if (!(await available())) return null;
  const own = await getConversation(projectCode, conversationId);
  if (!own) return null;
  const now = new Date().toISOString();
  try {
    const r = await dbFetch(T_MESSAGES, {
      method: 'POST',
      body: JSON.stringify({
        fields: {
          conversation_id: conversationId,
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: JSON.stringify(message.content || []),
          components: JSON.stringify(message.components || []),
          tool_calls: JSON.stringify(message.toolCalls || []),
          tokens_in: Number(message.tokensIn) || 0,
          tokens_out: Number(message.tokensOut) || 0,
          created_at: now,
        },
      }),
    });
    if (!r.ok) return null;
    // De zijbalk sorteert op last_message_at; zonder deze regel zakt een actief
    // gesprek langzaam naar beneden terwijl er juist in gepraat wordt.
    await dbFetch(`${T_CONVERSATIONS}/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields: { last_message_at: now } }),
    }).catch(() => {});
    return rowToMessage(await r.json());
  } catch (e) {
    console.warn('[faro/store] appendMessage:', e && e.message);
    return null;
  }
}

/**
 * Trim history to the model's window.
 * Keeps the most recent turns; a tool_result block is never kept without the
 * tool_call it answers, because both Claude and OpenAI reject that pairing.
 */
function windowForModel(messages, maxTurns) {
  const slice = messages.slice(-maxTurns);
  while (slice.length && slice[0].content?.some?.((b) => b.type === 'tool_result')) slice.shift();
  return slice;
}

// ── Projects (requirement 12) ────────────────────────────────────────────────

async function listProjects(_projectCode) {
  if (fixtures.isEnabled()) return fixtures.PROJECTS.slice();
  return [];
}
async function getProject(_projectCode, _id) { return null; }
async function createProject(_projectCode, _data) { NOT_WIRED(); }
async function linkToProject(_projectCode, _projectId, _kind, _refId) { NOT_WIRED(); }

/**
 * Everything a project gathers, for the project detail view: conversations,
 * property, generated images and videos, listing copy, leads and campaigns.
 */
async function getProjectContents(_projectCode, _projectId) {
  return { conversations: [], leads: [], images: [], videos: [], listings: [], campaigns: [] };
}

module.exports = {
  T_CONVERSATIONS, T_MESSAGES, T_PROJECTS, T_PROJECT_LINKS,
  available, configured,
  listConversations, getConversation, createConversation,
  renameConversation, setFavorite, deleteConversation, deriveTitle,
  listMessages, appendMessage, windowForModel,
  listProjects, getProject, createProject, linkToProject, getProjectContents,
  _pg,
};
