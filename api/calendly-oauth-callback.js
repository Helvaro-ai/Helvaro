// OAuth callback — Calendly redirects here after the client approves.
// Exchanges the code for tokens and stores them in Airtable.
module.exports = async function handler(req, res) {
  const qs    = new URLSearchParams((req.url || '').split('?')[1] || '');
  const code  = qs.get('code')  || '';
  const state = qs.get('state') || '';
  const oauthError = qs.get('error') || '';

  if (oauthError) {
    console.error('Calendly OAuth denied:', oauthError);
    return res.redirect(302, '/dashboard?calendly=denied');
  }
  if (!code || !state) {
    return res.status(400).send('Ongeldige OAuth callback — code of state ontbreekt.');
  }

  // Decode state → client API key
  let apiKey;
  try {
    apiKey = Buffer.from(state, 'base64url').toString('utf8');
    if (!/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) throw new Error('bad format');
  } catch {
    return res.status(400).send('Ongeldige state parameter.');
  }

  const CLIENT_ID      = process.env.CALENDLY_CLIENT_ID;
  const CLIENT_SECRET  = process.env.CALENDLY_CLIENT_SECRET;
  const REDIRECT_URI   = process.env.CALENDLY_REDIRECT_URI;
  const AIRTABLE_TOKEN = process.env.API_Airtable;
  const BASE_ID        = process.env.BASE_AIRTABLE;
  const CLIENTS_TABLE  = 'tblPidTrwGRzRt4LZ';

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send('Server configuratie ontbreekt.');
  }

  try {
    // ── 1. Exchange code for access + refresh tokens ─────────────────────────
    const tokenRes = await fetch('https://auth.calendly.com/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const txt = await tokenRes.text();
      console.error('Token exchange failed:', tokenRes.status, txt);
      return res.redirect(302, '/dashboard?calendly=error');
    }

    const tok          = await tokenRes.json();
    const accessToken  = tok.access_token;
    const refreshToken = tok.refresh_token;
    const expiresIn    = tok.expires_in || 7200; // seconds (~2h)
    const expiryISO    = new Date(Date.now() + expiresIn * 1000).toISOString();

    // ── 2. Find the client record in Airtable ────────────────────────────────
    const formula = encodeURIComponent(`{API Key}="${escapeFormula(apiKey)}"`);
    const cRes    = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}?filterByFormula=${formula}&maxRecords=1`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );
    const cData = await cRes.json();
    if (!cData.records || cData.records.length === 0) {
      return res.status(404).send('Client niet gevonden in de database.');
    }
    const recordId = cData.records[0].id;

    // ── 3. Store tokens in Airtable ──────────────────────────────────────────
    const patchRes = await fetch(
      `https://api.airtable.com/v0/${BASE_ID}/${CLIENTS_TABLE}/${recordId}`,
      {
        method:  'PATCH',
        headers: {
          Authorization:  `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            'Calendly Access Token':  accessToken,
            'Calendly Refresh Token': refreshToken,
            'Calendly Token Expiry':  expiryISO,
          },
        }),
      }
    );

    if (!patchRes.ok) {
      const txt = await patchRes.text();
      console.error('Airtable PATCH failed:', patchRes.status, txt);
      // Tokens were valid but storage failed — still redirect with partial success
      return res.redirect(302, '/dashboard?calendly=save_error');
    }

    // ── 4. Back to dashboard ──────────────────────────────────────────────────
    return res.redirect(302, '/dashboard?calendly=connected');

  } catch (err) {
    console.error('OAuth callback error:', err.message);
    return res.redirect(302, '/dashboard?calendly=error');
  }
};

function escapeFormula(val) {
  return String(val || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
