'use strict';
/*
 * Thin client for the Helvaro VPS data API (Postgres behind an Airtable-shaped
 * facade). Used ONLY for the three tables that were moved off Airtable:
 *   Marketing Posts, Outreach, Appointments.
 * Everything else (Leads, Client Config, Niche Config, Users) stays in Airtable.
 *
 * The facade speaks the same dialect the code already used for these tables, so
 * callers keep the exact same request/response shapes:
 *   pgFetch(`${TABLE}?filterByFormula=...&sort[0][field]=...&pageSize=...`)
 *   pgFetch(`${TABLE}/${id}`)
 *   pgFetch(`${TABLE}`,        { method:'POST',  body: JSON.stringify({ fields }) })
 *   pgFetch(`${TABLE}/${id}`,  { method:'PATCH', body: JSON.stringify({ fields }) })
 * Response JSON matches Airtable: { records:[{id,fields}] } / { id, fields } / { error }.
 *
 * Required Vercel env vars (set these before deploying this branch):
 *   PG_API_URL      e.g. https://167.172.164.4  (or https://db.helvaro.pro once DNS is set)
 *   PG_API_TOKEN    bearer secret shared with the VPS
 *   PG_API_INSECURE '1' while the VPS uses a self-signed cert (IP-only). Remove
 *                   once a real domain + Let's Encrypt cert is in place.
 */
const PG_API_URL   = (process.env.PG_API_URL || '').replace(/\/$/, '');
const PG_API_TOKEN = process.env.PG_API_TOKEN || '';
const INSECURE     = String(process.env.PG_API_INSECURE || '') === '1';

let dispatcher;
if (INSECURE) {
  try {
    const { Agent } = require('undici');
    dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  } catch (_) { /* undici unavailable: relies on a valid cert instead */ }
}

async function pgFetch(pathAndQuery, options = {}) {
  if (!PG_API_URL || !PG_API_TOKEN) throw new Error('PG_API_URL/PG_API_TOKEN not configured');
  const url = `${PG_API_URL}/v0/${pathAndQuery}`;
  const headers = Object.assign({ Authorization: `Bearer ${PG_API_TOKEN}` }, options.headers || {});
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const opts = Object.assign({}, options, { headers });
  if (dispatcher) opts.dispatcher = dispatcher;
  return fetch(url, opts);
}

const PG_TABLES = {
  MARKETING:    'tblPxnfb5MThgsnaA',
  OUTREACH:     'tbl2LpuY9bj3I4pqS',
  APPOINTMENTS: 'tblD058vEITs1xYFc',
};

module.exports = { pgFetch, PG_TABLES };
