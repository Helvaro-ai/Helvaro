'use strict';
/*
 * Helvaro AI — persistence for conversations, messages and projects.
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

const T_CONVERSATIONS = 'ai_conversations';
const T_MESSAGES      = 'ai_messages';
const T_PROJECTS      = 'ai_projects';
const T_PROJECT_LINKS = 'ai_project_links';

const NOT_WIRED = () => {
  throw new Error('ai/store: not wired — VPS tables not yet created');
};

// ── Conversations ────────────────────────────────────────────────────────────

/** Most recent conversations for the sidebar's "Recent" list. */
async function listConversations(_projectCode, _opts = {}) {
  // { limit = 20, favoritesOnly = false, projectId = null }
  return []; // stub: empty sidebar rather than a crash
}

async function getConversation(_projectCode, _id) { return null; }

async function createConversation(_projectCode, _userId, _opts = {}) { NOT_WIRED(); }

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

async function renameConversation(_projectCode, _id, _title) { NOT_WIRED(); }
async function setFavorite(_projectCode, _id, _favorite) { NOT_WIRED(); }
async function deleteConversation(_projectCode, _id) { NOT_WIRED(); }

// ── Messages ─────────────────────────────────────────────────────────────────

/** Ordered messages, oldest first. Used to rehydrate a conversation. */
async function listMessages(_projectCode, _conversationId, _opts = {}) { return []; }

async function appendMessage(_projectCode, _conversationId, _message) { NOT_WIRED(); }

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

async function listProjects(_projectCode) { return []; }
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
  listConversations, getConversation, createConversation,
  renameConversation, setFavorite, deleteConversation, deriveTitle,
  listMessages, appendMessage, windowForModel,
  listProjects, getProject, createProject, linkToProject, getProjectContents,
  _pg,
};
