const crypto = require('crypto');

// Single-shot Airtable fetch — no retries on 429.
//
// Root-cause (2026-05-14): multiple dashboard tabs each polling every 90 s,
// with 2-retry atFetch, generated 4–5 simultaneous Airtable calls and kept
// Airtable permanently rate-limited in a self-reinforcing cycle.
//
// Fix: one attempt only for everything.  On 429 → return immediately →
// serve stale cache (polling) or surface error (PATCH) → wait the natural
// interval before trying again.  No rapid retries that extend the ban.
async function atFetch(url, opts) {
  return fetch(url, opts);
}

// Client config cache by API key — 30 min TTL
// Legacy (pre-session-token) keys still hit Airtable on a cold instance;
// longer TTL means the warm-instance path covers far more polls before
// needing to refresh, reducing Airtable noise that competes with auth.js.
const _clientCache = new Map();
const CLIENT_TTL   = 30 * 60 * 1000;

// Leads response cache by projectCode.
// On Airtable 429, serves the last-known-good response so the dashboard
// stays populated instead of showing an error.  We always try Airtable
// first; the cache is only used when Airtable refuses (429) or errors.
// MAX_STALE_MS caps how old the stale data can be — after 1 hour we'd
// rather show an empty state than leads from yesterday.
const _leadsCache = new Map();
const MAX_STALE_MS = 60 * 60 * 1000; // 1 hour
function getCachedLeads(code) {
  return _leadsCache.get(code) || null; // { payload, ts } — caller checks freshness
}
function setCachedLeads(code, payload) {
  _leadsCache.set(code, { payload, ts: Date.now() });
}
function getCachedClient(key) {
  const e = _clientCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CLIENT_TTL) { _clientCache.delete(key); return null; }
  return e.record;
}
function setCachedClient(key, record) {
  _clientCache.set(key, { record, ts: Date.now() });
}

// Rate limiter — 120 req / 60s per IP (allows normal polling, blocks hammering)
const _rl = new Map();
function isRateLimited(ip, max = 120, windowMs = 60_000) {
  const now  = Date.now();
  const hits = (_rl.get(ip) || []).filter(t => now - t < windowMs);
  hits.push(now);
  _rl.set(ip, hits);
  if (_rl.size > 2000) { for (const [k, v] of _rl) if (!v.some(t => now - t < windowMs)) _rl.delete(k); }
  return hits.length > max;
}

function safeEqual(a, b) {
  try {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch { return false; }
}

function isAdminToken(provided, adminKey) {
  if (!adminKey || !provided) return false;
  const expected = crypto.createHmac('sha256', adminKey).update('helvaro-admin-v1').digest('hex');
  return safeEqual(provided, expected);
}

// ── Session token verification ─────────────────────────────────────────────────
// Tokens are signed by auth.js; verifying locally saves one Airtable call per
// request for every client — no env vars needed, works at any scale.
function sessionSecret() {
  const base = process.env.SESSION_SECRET || process.env.ADMIN_KEY || 'helvaro-default-v1';
  return crypto.createHmac('sha256', base).update('helvaro-session-v1').digest('hex');
}
function verifySession(token) {
  try {
    if (typeof token !== 'string' || !token.startsWith('hvs1.')) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [, payload, sig] = parts;
    if (!payload || !sig) return null;
    const secret   = sessionSecret();
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    const a = Buffer.from(sig,      'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && Date.now() > data.exp) return null;
    return data;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://app.helvaro.pro');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Te veel verzoeken. Probeer later opnieuw.' });

  const AIRTABLE_TOKEN = process.env.API_AIRTABLE;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const LEADS_TABLE    = 'tbliukTnDAbEDcZmt';
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  // ── Auth ────────────────────────────────────────────────────────────────────
  // Accept up to 2 KB to accommodate signed session tokens (~400 chars)
  const raw = String(req.headers['x-api-key'] || '').trim().slice(0, 2048);
  if (!raw) return res.status(401).json({ error: 'API key ontbreekt' });

  let projectCode = '', clientName = '', calendlyLink = '';

  // Path A: signed session token — verify locally, zero Airtable calls
  const session = verifySession(raw);
  if (session) {
    projectCode  = session.projectCode  || '';
    clientName   = session.clientName   || '';
    calendlyLink = session.calendlyLink || '';
  } else {
    // Path B: legacy API key (admin derived token or old sessions before this deploy)
    if (!/^[A-Za-z0-9\-_]{8,100}$/.test(raw)) {
      return res.status(401).json({ error: 'Ongeldige API key' });
    }

    // Admin token — timing-safe check against the derived token (not the raw key)
    if (isAdminToken(raw, process.env.ADMIN_KEY)) {
      return res.status(200).json({
        leads: [],
        stats: { total: 0, qualified: 0, booked: 0, conversionRate: 0, thisMonth: 0, avgResponseTime: 0 },
        client: { naam: 'Admin', calendly: '' }
      });
    }

    // Airtable Clients table lookup (with 5-min in-memory cache as last resort)
    try {
      let client = getCachedClient(raw);
      if (!client) {
        const formula = encodeURIComponent(`{API Key}="${escapeFormula(raw)}"`);
        const cRes    = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (cRes.status === 429) {
          return res.status(503).json({ error: 'Systeem is druk. Probeer over 30 seconden opnieuw.' });
        }
        const cData = await cRes.json();
        if (!cData.records || cData.records.length === 0) {
          return res.status(401).json({ error: 'Ongeldige API key' });
        }
        client = cData.records[0];
        setCachedClient(raw, client);
      }
      projectCode  = client.fields['fldN4dL0bGgfBOXwM'] || client.fields['Project Code']  || '';
      clientName   = client.fields['fldAnB848Sr5jl6dq'] || client.fields['Client Name']   || '';
      calendlyLink = client.fields['fldNEj1ysRgINOOtr'] || client.fields['Calendly Link'] || '';
    } catch (err) {
      console.error('Leads auth error:', err.message);
      return res.status(500).json({ error: 'Database fout. Probeer later opnieuw.' });
    }
  }

  // ── PATCH — save notes ──────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    try {
      const pqs     = (req.url || '').split('?')[1] || '';
      const pParams = new URLSearchParams(pqs);
      let recordId  = pParams.get('id') || '';

      // Fallback: last URL segment
      if (!recordId) {
        const p    = (req.url || '').split('?')[0].split('/').filter(Boolean);
        recordId   = p[p.length - 1] || '';
      }

      // Strict Airtable record ID format: rec + 14 alphanumeric chars
      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
        return res.status(400).json({ error: 'Ongeldig record ID' });
      }

      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};

      const fields = {};
      if (body.notities !== undefined) fields['fldoLRI5W12ThTls7'] = String(body.notities).slice(0, 8000);
      if (body.status   !== undefined) {
        const allowed = ['new', 'in_progress', 'completed', 'verloren'];
        if (allowed.includes(body.status)) fields['fld8mkrEWcyq7mUip'] = body.status;
      }
      if (body.dealWaarde   !== undefined) fields['fldv7qOYvCN1xJfiR'] = String(body.dealWaarde).slice(0, 200);
      if (body.verliesReden !== undefined) fields['fld3NhSENma0okbT7'] = String(body.verliesReden).slice(0, 500);
      if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'Geen velden om bij te werken' });

      // SECURITY: verify the lead belongs to the authenticated client BEFORE
      // mutating. Without this, anyone with a valid session token could PATCH
      // any lead in the system as long as they knew/guessed the record ID.
      // Admin tokens bypass (already short-circuited earlier with empty leads).
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        const ownCheck = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!ownCheck.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const ownData = await ownCheck.json();
        const ownProject = ownData.fields?.['fldSmczuyUJd26HLe'] || ownData.fields?.['Project Code'] || '';
        if (ownProject !== projectCode) {
          return res.status(403).json({ error: 'Geen toegang tot deze lead' });
        }
      } catch (err) {
        console.error('[leads PATCH] ownership check failed:', err.message);
        return res.status(500).json({ error: 'Server fout' });
      }

      const pRes  = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields })
        }
      );
      const pData = await pRes.json();
      if (!pRes.ok) {
        console.error('Airtable PATCH error:', pRes.status);
        return res.status(500).json({ error: 'Opslaan mislukt. Probeer later opnieuw.' });
      }

      // ── Deal-closed email notification ──────────────────────────────────────
      if (body.dealWaarde) {
        const leadName = pData.fields?.['fldbk0LVNckOU0bqA'] || pData.fields?.['Name'] || '(onbekend)';
        sendResendEmail({
          subject: `Deal gesloten - ${escHtml(leadName)} (${escHtml(body.dealWaarde)})`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:auto">
              <h2 style="color:#16a34a">Deal gesloten</h2>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px;color:#666">Lead</td><td style="padding:8px;font-weight:600">${escHtml(leadName)}</td></tr>
                <tr><td style="padding:8px;color:#666">Waarde</td><td style="padding:8px;font-weight:700;color:#16a34a">${escHtml(body.dealWaarde)}</td></tr>
                <tr><td style="padding:8px;color:#666">Client</td><td style="padding:8px">${escHtml(clientName)}</td></tr>
              </table>
              <a href="https://app.helvaro.pro/dashboard" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#16a34a;color:#fff;border-radius:8px;text-decoration:none">Open Dashboard</a>
            </div>`
        }).catch(() => {});
      }

      return res.status(200).json(pData);
    } catch (err) {
      console.error('PATCH error:', err.message);
      return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
    }
  }

  // ── POST handlers ──────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    // ── A. config-get / config-save (AI Persona settings page) ───────────────
    // Authenticated by the same session/api-key flow; only allows the client
    // to read/write THEIR own Klanten record. Whitelisted fields only.
    if (body.mode === 'config-get' || body.mode === 'config-save') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        // Look up the client's Klanten record by Project Code (field ID fldN4dL0bGgfBOXwM)
        const formula = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
        const cRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!cRes.ok) return res.status(500).json({ error: 'Klant niet gevonden' });
        const cData = await cRes.json();
        const rec   = (cData.records || [])[0];
        if (!rec) return res.status(404).json({ error: 'Klantrecord niet gevonden' });

        // ── GET current config ──
        if (body.mode === 'config-get') {
          return res.status(200).json({
            aiName:         rec.fields['fldRvoe1JMPOtPWC7'] || rec.fields['AI Name']             || '',
            autoReplyTpl:   rec.fields['fldOGdVq6T54xEo6W'] || rec.fields['Auto-Reply Template'] || '',
            aiInstructions: rec.fields['fld1lqHctRbqFGQf5'] || rec.fields['AI Instructions']     || '',
            website:        rec.fields['fldzBclLhryWQ1veO'] || rec.fields['Website']             || '',
            address:        rec.fields['fldTvMSdTZOyNgWod'] || rec.fields['Adres']               || '',
            sector:         rec.fields['fld0BsPnDbBOkTHzr'] || rec.fields['Niche']               || '',
            calendlyLink:   rec.fields['fldNEj1ysRgINOOtr'] || rec.fields['Calendly Link']       || '',
            clientName:     rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name']         || '',
            aiPhotoUrl:     rec.fields['fld7L0Iijq7ti6A6w'] || rec.fields['AI Photo URL']        || '',
            brandColor:     rec.fields['fldJAf4aTNlIQVL2q'] || rec.fields['Brand Color']         || '',
            formIntro:      rec.fields['fldxZ5spOeIb5omPr'] || rec.fields['Form Intro Message']  || '',
            language:       rec.fields['fld1iiV9XwSbgAACZ'] || rec.fields['Language']            || 'nl',
            workingHours:   rec.fields['fldq5oIqw5MG8fKhc'] || rec.fields['Working Hours']       || '',
            trustBadges:    rec.fields['fld4nzMbnQseuGhnN'] || rec.fields['Trust Badges']        || '',
            bookingMethod:  (rec.fields['fldUI9BYO0TplgYlm'] || rec.fields['Booking Method'] || 'calendly').toString().toLowerCase(),
            callbackWindow: rec.fields['fldKvMVBalSBRQE7H'] || rec.fields['Callback Window']     || '',
            notifyPhone:    rec.fields['fldZEApe0gfse07AU'] || rec.fields['Notify Phone']        || '',
            reportEmail:    rec.fields['fldDBJCN6dVMA8jax'] || rec.fields['Rapport Email']       || ''
          });
        }

        // ── SAVE config (PATCH whitelisted fields only) ──
        const u = {};
        if (body.aiName         !== undefined) u.fldRvoe1JMPOtPWC7 = String(body.aiName).trim().slice(0, 60);
        if (body.autoReplyTpl   !== undefined) u.fldOGdVq6T54xEo6W = String(body.autoReplyTpl).trim().slice(0, 1000);
        if (body.aiInstructions !== undefined) u.fld1lqHctRbqFGQf5 = String(body.aiInstructions).trim().slice(0, 3000);
        if (body.website        !== undefined) u.fldzBclLhryWQ1veO = String(body.website).trim().slice(0, 500);
        if (body.address        !== undefined) u.fldTvMSdTZOyNgWod = String(body.address).trim().slice(0, 300);
        if (body.calendlyLink   !== undefined) u.fldNEj1ysRgINOOtr = String(body.calendlyLink).trim().slice(0, 500);
        // sector goes to Niche (singleSelect) — typecast:true lets unknown values pass
        if (body.sector         !== undefined) u.fld0BsPnDbBOkTHzr = String(body.sector).trim().slice(0, 100);
        // Form personalization fields (shown on the lead form page)
        if (body.aiPhotoUrl     !== undefined) {
          // Allow EITHER an external https URL OR a self-hosted base64 data URL
          // (uploaded via the file picker in dashboard). Data URLs are capped at
          // 200 KB to keep Airtable cells reasonable and form-page HTML lean.
          const raw = String(body.aiPhotoUrl).trim();
          const isHttps = /^https:\/\//.test(raw);
          const isData  = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(raw);
          if (raw === '') {
            u.fld7L0Iijq7ti6A6w = '';
          } else if (isHttps && raw.length <= 500) {
            u.fld7L0Iijq7ti6A6w = raw;
          } else if (isData && raw.length <= 200 * 1024) {
            u.fld7L0Iijq7ti6A6w = raw;
          } else {
            // Unknown format / too big — silently drop (don't error, just don't update)
            console.warn('[config-save] aiPhotoUrl rejected: invalid format or >200KB');
          }
        }
        if (body.brandColor     !== undefined) {
          const v = String(body.brandColor).trim().slice(0, 8);
          u.fldJAf4aTNlIQVL2q = (v === '' || /^#?[0-9a-fA-F]{6}$/.test(v)) ? v : '';
        }
        if (body.formIntro      !== undefined) u.fldxZ5spOeIb5omPr = String(body.formIntro).trim().slice(0, 600);
        if (body.language       !== undefined) {
          const v = String(body.language).trim().toLowerCase();
          if (v === 'nl' || v === 'fr' || v === 'en') u.fld1iiV9XwSbgAACZ = v;
        }
        if (body.workingHours   !== undefined) {
          // Lightweight format validation — must match 'days hours' or be empty
          const v = String(body.workingHours).trim().toLowerCase().slice(0, 60);
          if (v === '' || /^[a-z]{3,9}\s*[-–]\s*[a-z]{3,9}\s+\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?$/.test(v)) {
            u.fldq5oIqw5MG8fKhc = v;
          }
        }
        if (body.trustBadges    !== undefined) u.fld4nzMbnQseuGhnN = String(body.trustBadges).trim().slice(0, 300);
        if (body.bookingMethod  !== undefined) {
          const v = String(body.bookingMethod).trim().toLowerCase();
          if (v === 'calendly' || v === 'callback') u.fldUI9BYO0TplgYlm = v;
        }
        if (body.callbackWindow !== undefined) u.fldKvMVBalSBRQE7H = String(body.callbackWindow).trim().slice(0, 100);
        if (body.notifyPhone    !== undefined) {
          // Light phone validation — must start with + or digits, allow spaces / dashes
          const v = String(body.notifyPhone).trim().slice(0, 30);
          if (v === '' || /^[+]?[0-9][0-9\s\-().]{6,29}$/.test(v)) u.fldZEApe0gfse07AU = v;
        }
        if (body.reportEmail    !== undefined) {
          const v = String(body.reportEmail).trim().slice(0, 100);
          if (v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) u.fldDBJCN6dVMA8jax = v;
        }
        if (Object.keys(u).length === 0) return res.status(400).json({ error: 'Niets om bij te werken' });

        const upRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${rec.id}`,
          {
            method:  'PATCH',
            headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fields: u, typecast: true })
          }
        );
        if (!upRes.ok) {
          const txt = await upRes.text().catch(() => '');
          console.error('[config-save] update failed', upRes.status, txt.slice(0, 300));
          return res.status(500).json({ error: 'Opslaan mislukt' });
        }
        // Invalidate the client cache so the next leads fetch sees fresh values
        try { setCachedClient(raw, { ...rec, fields: { ...rec.fields, ...u } }); } catch {}
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('[config] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── A2. csv-export — download all leads for this client as CSV ──────────
    // body: { mode: 'csv-export' }
    // Returns text/csv with UTF-8 BOM (so Excel renders accents correctly).
    if (body.mode === 'csv-export') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      try {
        // Fetch all leads for this project — paginate manually if >100
        const all = [];
        let offset = '';
        for (let page = 0; page < 20; page++) {  // hard cap 2000 leads
          const formula = encodeURIComponent(`{Project Code}="${projectCode.replace(/"/g, '\\"')}"`);
          const url = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&pageSize=100&sort%5B0%5D%5Bfield%5D=Created%20At&sort%5B0%5D%5Bdirection%5D=desc${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
          const r = await atFetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
          if (!r.ok) break;
          const d = await r.json();
          all.push(...(d.records || []));
          if (!d.offset) break;
          offset = d.offset;
        }
        // Build CSV — quote fields, escape internal quotes by doubling them
        const csvEscape = (v) => {
          const s = String(v == null ? '' : v).replace(/\r?\n/g, ' ').replace(/"/g, '""');
          return `"${s}"`;
        };
        const headers = ['Datum', 'Naam', 'Telefoon', 'Bron', 'Status', 'Gekwalificeerd', 'Lead Score', 'Ability', 'Urgency', 'Fit', 'Samenvatting', 'Reden', 'Booking Sent', 'Opgepikt', 'Verwachte Waarde', 'Notities'];
        const rows = [headers.map(csvEscape).join(',')];
        for (const rec of all) {
          const f = rec.fields || {};
          rows.push([
            f['Created At'] || '', f['Name'] || '', f['Phone'] || '', f['Bron'] || '',
            f['Conversation State'] || '', f['Qualified'] ? 'ja' : 'nee',
            f['Lead Score'] || '', f['Ability'] || '', f['Urgency'] || '', f['Fit'] || '',
            f['AI Summary'] || '', f['Reason'] || '',
            f['Booking Link Sent'] ? 'ja' : 'nee', f['Opgepikt'] ? 'ja' : 'nee',
            f['Verwachte Waarde'] || '', f['Notities'] || ''
          ].map(csvEscape).join(','));
        }
        const csv = '﻿' + rows.join('\r\n');  // BOM for Excel
        const ts  = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="helvaro-leads-${projectCode}-${ts}.csv"`);
        return res.status(200).send(csv);
      } catch (err) {
        console.error('[csv-export] error:', err.message);
        return res.status(500).json({ error: 'Export mislukt' });
      }
    }

    // ── B. test-message — send a one-off WhatsApp to a phone number ─────────
    // body: { mode: 'test-message', phone: '32466358427', message: '...' }
    if (body.mode === 'test-message') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      let phone = String(body.phone || '').replace(/[\s\-\(\)\.]/g, '');
      if      (phone.startsWith('00')) phone = phone.slice(2);
      else if (phone.startsWith('+'))  phone = phone.slice(1);
      else if (phone.startsWith('0'))  phone = '32' + phone.slice(1);
      if (!/^\d{8,15}$/.test(phone))   return res.status(400).json({ error: 'Ongeldig telefoonnummer' });
      const message = String(body.message || '').trim().slice(0, 2000);
      if (!message) return res.status(400).json({ error: 'Bericht is leeg' });

      const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
      const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
      if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
        return res.status(500).json({ error: 'WhatsApp configuratie ontbreekt op de server' });
      }
      try {
        const waRes = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
          method:  'POST',
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } })
        });
        const waData = await waRes.json().catch(() => ({}));
        if (!waRes.ok || waData.error) {
          console.error('[test-message] WA failed:', JSON.stringify(waData.error || waData).slice(0, 300));
          return res.status(502).json({ error: waData.error?.message || 'WhatsApp versturen mislukt' });
        }
        return res.status(200).json({ ok: true, sentTo: phone });
      } catch (err) {
        return res.status(500).json({ error: 'Netwerkfout — probeer opnieuw' });
      }
    }

    // ── B2. suggest-replies — AI generates 3 short WhatsApp reply ideas ─────
    // POST { mode: 'suggest-replies', leadId: 'recXXX' }
    // Reads the lead's Conversation History, sends to Claude with the client's
    // AI Name + Client Name + AI Instructions, returns 3 short Dutch replies.
    if (body.mode === 'suggest-replies') {
      if (!projectCode) return res.status(403).json({ error: 'Geen client context' });
      const leadId = String(body.leadId || '').trim();
      if (!/^rec[A-Za-z0-9]{14}$/.test(leadId)) return res.status(400).json({ error: 'Ongeldig lead ID' });
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'AI niet beschikbaar' });
      try {
        // Fetch the lead — verify ownership + read history
        const lRes = await atFetch(
          `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${leadId}`,
          { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
        );
        if (!lRes.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
        const lead = await lRes.json();
        if ((lead.fields?.['fldSmczuyUJd26HLe'] || lead.fields?.['Project Code']) !== projectCode) {
          return res.status(403).json({ error: 'Geen toegang' });
        }
        let history = [];
        const stored = lead.fields?.['Conversation History'];
        if (stored) { try { history = JSON.parse(stored); } catch {} }
        const leadName = lead.fields?.['fldbk0LVNckOU0bqA'] || lead.fields?.['Name'] || '';
        // Look up the client's AI config (cached client may already have it)
        let aiName = 'Mathis', clientName2 = clientName || 'het bedrijf', aiInstr = '';
        try {
          const formula2 = encodeURIComponent(`{fldN4dL0bGgfBOXwM}="${escapeFormula(projectCode)}"`);
          const cRes2 = await atFetch(
            `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula2}&maxRecords=1`,
            { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
          );
          if (cRes2.ok) {
            const cd = await cRes2.json();
            const rec = (cd.records || [])[0];
            if (rec) {
              aiName      = rec.fields['fldRvoe1JMPOtPWC7'] || rec.fields['AI Name']         || aiName;
              clientName2 = rec.fields['fldAnB848Sr5jl6dq'] || rec.fields['Client Name']     || clientName2;
              aiInstr     = rec.fields['fld1lqHctRbqFGQf5'] || rec.fields['AI Instructions'] || '';
            }
          }
        } catch {}
        // Build the prompt
        const convText = history.slice(-12).map(m => {
          const role = m.role === 'user' ? 'Klant' : (m.manual ? 'Jij eerder' : 'AI eerder');
          return role + ': ' + String(m.content || '').slice(0, 500);
        }).join('\n');
        const sysPrompt =
          'Je bent ' + aiName + ' van ' + clientName2 + '. Je helpt de salesmedewerker met 3 verschillende, korte WhatsApp-antwoorden die ze nu naar de lead "' + (leadName || 'de lead') + '" zou kunnen sturen. ' +
          (aiInstr ? 'Volg deze stijl-regels: ' + aiInstr.slice(0, 800) + ' ' : '') +
          'Antwoord ALLEEN met geldig JSON: {"replies":["...","...","..."]}. Elk antwoord max 200 tekens. Antwoorden zijn verschillend van toon (bv. vriendelijk / direct / vraag-stellend). Geen uitleg buiten de JSON.';
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method:  'POST',
          headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            model:      'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system:     sysPrompt,
            messages:   [{ role: 'user', content: 'Recente gespreksgeschiedenis:\n\n' + (convText || '(nog geen berichten)') }]
          })
        });
        if (!aiRes.ok) {
          const t = await aiRes.text().catch(() => '');
          console.error('[suggest-replies] anthropic failed', aiRes.status, t.slice(0, 300));
          return res.status(502).json({ error: 'AI niet bereikbaar' });
        }
        const ad = await aiRes.json();
        const txt = ad.content?.[0]?.text || '';
        let parsed = null;
        try { parsed = JSON.parse(txt); } catch {
          // Tolerant: extract first {...} block
          const m = txt.match(/\{[\s\S]*\}/);
          if (m) { try { parsed = JSON.parse(m[0]); } catch {} }
        }
        const replies = (parsed && Array.isArray(parsed.replies)) ? parsed.replies.filter(s => typeof s === 'string').slice(0, 3) : [];
        if (!replies.length) return res.status(502).json({ error: 'AI gaf geen suggesties terug' });
        return res.status(200).json({ replies });
      } catch (err) {
        console.error('[suggest-replies] error:', err.message);
        return res.status(500).json({ error: 'Serverfout' });
      }
    }

    // ── C. existing: send a WhatsApp reply on an existing lead (2-way chat) ─
    // POST /api/leads?id=recXXX  body: { message: "text" }
    try {
      const qs     = (req.url || '').split('?')[1] || '';
      const params = new URLSearchParams(qs);
      const recordId = params.get('id') || '';

      if (!/^rec[A-Za-z0-9]{14}$/.test(recordId)) {
        return res.status(400).json({ error: 'Ongeldig record ID' });
      }

      const message = String(body.message || '').trim().slice(0, 2000);
      if (!message) return res.status(400).json({ error: 'Bericht is leeg' });

      // Fetch the lead — verify it belongs to the authenticated client (security)
      const lRes = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
      );
      if (!lRes.ok) return res.status(404).json({ error: 'Lead niet gevonden' });
      const lead = await lRes.json();
      const leadProject = lead.fields?.['fldSmczuyUJd26HLe'] || lead.fields?.['Project Code'] || '';
      if (!projectCode || leadProject !== projectCode) {
        return res.status(403).json({ error: 'Geen toegang tot deze lead' });
      }
      const phone = lead.fields?.['fld6YaitW0lMqHUrd'] || lead.fields?.['Phone'] || '';
      if (!phone) return res.status(400).json({ error: 'Lead heeft geen telefoonnummer' });

      // Send WhatsApp via Meta Graph API
      const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
      const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
      if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
        return res.status(500).json({ error: 'WhatsApp configuratie ontbreekt op de server' });
      }
      const waRes = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: message } })
      });
      const waData = await waRes.json().catch(() => ({}));
      if (!waRes.ok || waData.error) {
        console.error('[leads reply] WhatsApp send failed:', JSON.stringify(waData.error || waData));
        return res.status(502).json({ error: 'WhatsApp versturen mislukt', details: waData.error?.message || 'onbekend' });
      }

      // Append to Conversation History so dashboard shows it immediately.
      // Use role 'assistant' with a 'manual:true' marker so we can style it differently.
      let history = [];
      const stored = lead.fields?.['Conversation History'];
      if (stored) { try { history = JSON.parse(stored); } catch {} }
      history.push({ role: 'assistant', content: message, manual: true, ts: Date.now() });
      if (history.length > 50) history = history.slice(-50);

      const updateRes = await atFetch(
        `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}/${recordId}`,
        {
          method:  'PATCH',
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fields: { 'Conversation History': JSON.stringify(history) } })
        }
      );
      if (!updateRes.ok) {
        console.warn('[leads reply] history update failed (message was sent)', updateRes.status);
      }
      return res.status(200).json({ ok: true, history });
    } catch (err) {
      console.error('POST reply error:', err.message);
      return res.status(500).json({ error: 'Serverfout — probeer opnieuw' });
    }
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // ── GET — fetch all leads (paginated) ───────────────────────────────────────
  // Try cache first — on 429 we return stale payload so the dashboard stays alive.
  const leadsCache = getCachedLeads(projectCode);
  const cacheAge   = leadsCache ? Date.now() - leadsCache.ts : Infinity;

  let allLeads = [];
  let usedStale = false;
  try {
    // Use field ID (fldSmczuyUJd26HLe = Project Code) — field IDs are stable,
    // field names can be renamed in Airtable without breaking the query.
    const formula = encodeURIComponent(`{fldSmczuyUJd26HLe}="${escapeFormula(projectCode)}"`);
    let offset    = '';
    do {
      // Do NOT use returnFieldsByFieldId=true here — Airtable returns field names
      // as response keys by default, and two fields (Conversation History, Last
      // Message) have no known field IDs.  Filter formula and sort still use field
      // IDs — those work regardless of this parameter.
      const url  = `https://api.airtable.com/v0/${BASE_ID}/${LEADS_TABLE}?filterByFormula=${formula}&sort[0][field]=fldR0r13EU4RwrtvH&sort[0][direction]=desc&pageSize=100${offset ? '&offset=' + offset : ''}`;
      // Single-shot fetch — NO retries.  Retrying on 429 causes overlapping
      // bursts from multiple sessions that keep Airtable permanently limited.
      // On 429 we fall through to the stale cache immediately.
      const lRes = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      if (lRes.status === 429) {
        const retryAfter = lRes.headers.get('retry-after') || '?';
        const body429    = await lRes.text().catch(() => '');
        // Airtable now returns {"errors":[{"error":"RATE_LIMIT_REACHED",...}]}
        let errType = '?';
        try { const p = JSON.parse(body429); errType = p?.errors?.[0]?.error || p?.error?.type || p?.type || '?'; } catch {}
        console.warn('[leads] 429 retryAfter=' + retryAfter + ' type=' + errType);
        if (leadsCache && cacheAge < MAX_STALE_MS) {
          console.warn('[leads] 429 — serving stale cache (age ' + Math.round(cacheAge / 1000) + 's)');
          usedStale = true;
          break;
        }
        console.warn('[leads] 429 — no usable cache, returning empty payload');
        return res.status(200).json({
          leads: [], stats: { total:0, qualified:0, booked:0, conversionRate:0, thisMonth:0, avgResponseTime:0, avgLeadScore:0 },
          client: { naam: clientName, calendly: calendlyLink }, rateLimited: true
        });
      }
      const lData = await lRes.json();
      if (!lRes.ok) {
        console.error(`[leads] Airtable ${lRes.status}:`, JSON.stringify(lData).slice(0, 300));
        throw new Error('Airtable ' + lRes.status);
      }
      allLeads = allLeads.concat(lData.records || []);
      offset   = lData.offset || '';
    } while (offset);
  } catch (err) {
    console.error('Leads fetch error:', err.message);
    if (leadsCache && cacheAge < MAX_STALE_MS) {
      console.warn('Leads error — serving stale cache as fallback (age ' + Math.round(cacheAge / 1000) + 's)');
      return res.status(200).json({ ...leadsCache.payload, stale: true });
    }
    // Unknown error, no usable cache — return empty rather than 500 so the dashboard
    // stays alive and retries on the next poll cycle.
    console.warn('Leads error, no usable cache — returning empty payload');
    return res.status(200).json({
      leads: [], stats: { total:0, qualified:0, booked:0, conversionRate:0, thisMonth:0, avgResponseTime:0, avgLeadScore:0 },
      client: { naam: clientName, calendly: calendlyLink }, error: err.message
    });
  }

  // Serve stale cache when 429 was hit mid-pagination
  if (usedStale) {
    return res.status(200).json({ ...leadsCache.payload, stale: true });
  }

  // ── Field helpers ───────────────────────────────────────────────────────────
  function str(v)  { if (!v) return ''; if (typeof v === 'object' && v.name) return v.name; return String(v); }
  function bool(v) { return v === true || v === 1; }
  function num(v)  { return typeof v === 'number' ? v : parseFloat(v) || 0; }

  const leads = allLeads.map(r => {
    const f = r.fields;
    return {
      id:                    r.id,
      naam:                  f.fldbk0LVNckOU0bqA          || f.Name                    || '',
      telefoon:              f.fld6YaitW0lMqHUrd           || f.Phone                   || '',
      status:                str(f.fld8mkrEWcyq7mUip       || f['Conversation State']),
      qualified:             bool(f.fld0hAZJ5wgaXrNTn      || f.Qualified),
      reden:                 f.fld3NhSENma0okbT7           || f.Reason                  || '',
      samenvatting:          f.fldqerIiw5qyQjXHr           || f['AI Summary']           || '',
      capaciteit:            str(f.fldrfbTopJvZEYSKP        || f.Ability),
      urgentie:              str(f.fldlyLH1DKrWyG3Tr        || f.Urgency),
      fit:                   str(f.fldqNxsPshvZEBeLr        || f.Fit),
      bron:                  str(f.fldGoerozqdea4BfU        || f.Bron),
      boekingslinkVerstuurd: bool(f.fldLeEqwNefdglLis       || f['Booking Link Sent']),
      afspraakGeboekt:       bool(f.fldyIGNetqcSEkoaK       || f['Appointment Booked']),
      notities:              f.fldoLRI5W12ThTls7            || f.Notities               || '',
      gesprek:               f['Conversation History']       || '',
      leadScore:             num(f.fldpzQgMuWJLjogiD        || f['Lead Score']),
      opgepikt:              bool(f.fld86JQHB6dbuutA7       || f.Opgepikt),
      verwachteWaarde:       f.fldv7qOYvCN1xJfiR            || f['Verwachte Waarde']    || '',
      reactietijd:           num(f.fldUJJ8oSmAMQ9wB3        || f['Response Time (sec)']),
      datum:                 f.fldR0r13EU4RwrtvH            || f['Created At']          || r.createdTime || ''
    };
  });

  // ── Stats ───────────────────────────────────────────────────────────────────
  const now            = new Date();
  const total          = leads.length;
  const qualified      = leads.filter(l => l.qualified).length;
  const booked         = leads.filter(l => l.afspraakGeboekt).length;
  const conversionRate = total > 0 ? Math.round((booked / total) * 1000) / 10 : 0;
  const thisMonth      = leads.filter(l => {
    const d = new Date(l.datum);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const times          = leads.map(l => l.reactietijd).filter(v => v > 0);
  const avgResponseTime = times.length > 0
    ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
    : 0;
  const avgLeadScore   = leads.length > 0
    ? Math.round(leads.reduce((a, l) => a + (l.leadScore || 0), 0) / leads.length)
    : 0;
  const stats = { total, qualified, booked, conversionRate, thisMonth, avgResponseTime, avgLeadScore };

  // ── Query params ────────────────────────────────────────────────────────────
  const qs     = (req.url || '').split('?')[1] || '';
  const params = new URLSearchParams(qs);

  // CSV export
  if (params.get('export') === 'true') {
    const esc  = v => '"' + String(v || '').replace(/"/g, '""') + '"';
    const hdrs = ['Naam','Telefoon','Status','Gekwalificeerd','Bron','Score','Urgentie','Capaciteit','Fit','Verwachte Waarde','Datum','Samenvatting'];
    const rows = leads.map(l => [
      l.naam, l.telefoon, l.status, l.qualified ? 'Ja' : 'Nee',
      l.bron, l.leadScore, l.urgentie, l.capaciteit, l.fit,
      l.verwachteWaarde,
      l.datum ? new Date(l.datum).toLocaleDateString('nl-BE') : '',
      l.samenvatting
    ].map(esc).join(';'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=helvaro-leads.csv');
    return res.status(200).send([hdrs.join(';'), ...rows].join('\n'));
  }

  // Weekly rapport
  if (params.get('rapport') === 'week') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const wLeads  = leads.filter(l => l.datum && new Date(l.datum) >= sevenDaysAgo);
    const wTotal  = wLeads.length;
    const wQual   = wLeads.filter(l => l.qualified).length;
    const wBooked = wLeads.filter(l => l.afspraakGeboekt).length;
    const wConv   = wTotal > 0 ? Math.round((wBooked / wTotal) * 1000) / 10 : 0;
    const mn  = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
    const van = `${sevenDaysAgo.getDate()} ${mn[sevenDaysAgo.getMonth()]}`;
    const tot = `${now.getDate()} ${mn[now.getMonth()]} ${now.getFullYear()}`;
    // Warm the 429-fallback cache so the regular dashboard view benefits
    // even when the most recent request to leads.js was a rapport request.
    setCachedLeads(projectCode, { leads, stats, client: { naam: clientName, calendly: calendlyLink } });
    return res.status(200).json({
      rapport: {
        periode:              `${van} - ${tot}`,
        totaalLeads:          wTotal,
        gekwalificeerd:       wQual,
        afspraken:            wBooked,
        conversie:            wConv,
        gekwalificeerdeLijst: wLeads.filter(l => l.qualified)
          .map(l => ({ naam: l.naam, telefoon: l.telefoon, samenvatting: l.samenvatting, leadScore: l.leadScore }))
      },
      leads, stats, client: { naam: clientName, calendly: calendlyLink }
    });
  }

  const responsePayload = { leads, stats, client: { naam: clientName, calendly: calendlyLink } };
  setCachedLeads(projectCode, responsePayload); // warm cache for 429 fallback

  // Cache the response at the browser level so all open tabs share one response
  // for 2 minutes instead of each hitting Airtable independently.
  // Vary: x-api-key ensures different users never share each other's cached data.
  res.setHeader('Cache-Control', 'private, max-age=120');
  res.setHeader('Vary', 'x-api-key');
  return res.status(200).json(responsePayload);
};

// Escape double-quotes and backslashes for Airtable formula strings
function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Escape HTML entities for safe embedding in email HTML
function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Resend email helper ──────────────────────────────────────────────────────
async function sendResendEmail({ subject, html }) {
  const key  = process.env.RESEND_API_KEY;
  const to   = process.env.NOTIFY_EMAIL;
  if (!key) { console.warn('[resend leads] skipped: RESEND_API_KEY missing'); return; }
  if (!to)  { console.warn('[resend leads] skipped: NOTIFY_EMAIL missing');   return; }
  const from = process.env.RESEND_FROM || 'Helvaro <noreply@helvaro.pro>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to: [to], subject, html })
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      console.error('[resend leads] failed', r.status, body.slice(0, 400));
    }
  } catch (err) {
    console.error('[resend leads] network error:', err && err.message);
  }
}
