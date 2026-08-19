'use strict';
/*
 * Faro — persistence for conversations, messages and projects.
 *
 * SCAFFOLD: full function surface, no queries wired.
 *
 * ── Why Postgres and not Airtable ────────────────────────────────────────────
 * Leads, Client Config, Niche Config and Users live in Airtable. Chat does not
 * belong there: Airtable is rate-limited at 5 requests/second per base and
 * priced per record, and a single AI conversation writes a row per turn plus a
 * row per tool call. Three tables were already moved off Airtable onto the VPS
 * for exactly this kind of write pressure (Marketing Posts, Outreach,
 * Appointments) behind the Airtable-shaped facade in api/_pgapi.js.
 *
 * AI data follows that same path — same facade, same helper, no new database
 * and no new client. Requirement 15's "conversation persistence" is therefore
 * an extension of an existing pattern rather than new infrastructure.
 *
 * ── Tables to create on the VPS ──────────────────────────────────────────────
 *   ai_conversations
 *     id, project_code, user_id, title, project_id (nullable), favorite,
 *     created_at, updated_at, last_message_at
 *
 *   ai_messages
 *     id, conversation_id, role ('user'|'assistant'), content (jsonb: blocks),
 *     components (jsonb), tool_calls (jsonb), tokens_in, tokens_out, created_at
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
  return Boolean(process.env.PG_API_URL && process.env.PG_API_TOKEN);
}

async function available() {
  if (_available !== null) return _available;
  if (!configured()) { _available = false; return false; }
  try {
    const r = await _pg.pgFetch(`${T_CONVERSATIONS}?pageSize=1`);
    // 404 = tabel bestaat niet (nog). 401/403 = verkeerd token; in beide
    // gevallen is doorgaan zinloos maar mag Faro niet omvallen.
    _available = r.ok;
    if (!r.ok) {
      console.warn(`[faro/store] ${T_CONVERSATIONS} niet beschikbaar (HTTP ${r.status}) — gesprekken worden niet bewaard`);
    }
  } catch (e) {
    console.warn('[faro/store] Postgres onbereikbaar:', e && e.message);
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
    const r = await _pg.pgFetch(
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
    const r = await _pg.pgFetch(`${T_CONVERSATIONS}?filterByFormula=${formula}&maxRecords=1`);
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
    const r = await _pg.pgFetch(T_CONVERSATIONS, {
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
    const r = await _pg.pgFetch(`${T_CONVERSATIONS}/${encodeURIComponent(id)}`, {
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
    const list = await _pg.pgFetch(`${T_MESSAGES}?filterByFormula=${formula}&pageSize=100`);
    if (list.ok) {
      const d = await list.json();
      for (const rec of d.records || []) {
        await _pg.pgFetch(`${T_MESSAGES}/${encodeURIComponent(rec.id)}`, { method: 'DELETE' });
      }
    }
    const r = await _pg.pgFetch(`${T_CONVERSATIONS}/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
  const limit = Math.min(200, Math.max(1, opts.limit || 100));
  try {
    const r = await _pg.pgFetch(
      `${T_MESSAGES}?filterByFormula=${formula}&sort[0][field]=created_at&sort[0][direction]=asc&pageSize=${limit}`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.records || []).map(rowToMessage);
  } catch (e) {
    console.warn('[faro/store] listMessages:', e && e.message);
    return [];
  }
}

async function appendMessage(projectCode, conversationId, message) {
  if (!projectCode || !conversationId || !message) return null;
  if (!(await available())) return null;
  const own = await getConversation(projectCode, conversationId);
  if (!own) return null;
  const now = new Date().toISOString();
  try {
    const r = await _pg.pgFetch(T_MESSAGES, {
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
    await _pg.pgFetch(`${T_CONVERSATIONS}/${encodeURIComponent(conversationId)}`, {
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
