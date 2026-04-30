// Redirects the client to Calendly's OAuth consent page.
// Called from the dashboard: GET /api/calendly-oauth-start?key={clientApiKey}
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const qs     = new URLSearchParams((req.url || '').split('?')[1] || '');
  const apiKey = String(qs.get('key') || '').trim().slice(0, 100);

  if (!apiKey || !/^[A-Za-z0-9\-_]{8,100}$/.test(apiKey)) {
    return res.status(400).send('Ongeldige API key');
  }

  const CLIENT_ID    = process.env.CALENDLY_CLIENT_ID;
  const REDIRECT_URI = process.env.CALENDLY_REDIRECT_URI;

  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send('Calendly OAuth is niet geconfigureerd door de beheerder.');
  }

  // Encode apiKey as state so the callback knows which client is connecting
  const state = Buffer.from(apiKey).toString('base64url');

  const authUrl = new URL('https://auth.calendly.com/oauth/authorize');
  authUrl.searchParams.set('client_id',     CLIENT_ID);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri',  REDIRECT_URI);
  authUrl.searchParams.set('state',         state);

  return res.redirect(302, authUrl.toString());
};
