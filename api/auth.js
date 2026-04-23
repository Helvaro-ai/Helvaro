const BASE  = process.env.BASE_AIRTABLE;
const TOKEN = process.env.API_Airtable;

const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';

const UF = {
  email:       'fldsqiSy41CCDickr',
  password:    'fldqi8JWgFgJF4X4R',
  clientName:  'fldmKwegSUj1joru3',
  projectCode: 'fldbrCpBuQjJBfZsv',
  apiKey:      'fldxZMgVXSy7EShDL',
  active:      'fldb8sGE3Bslch8f8',
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

async function airtable(path, opts = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body     = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { email, password, register } = body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mailadres en wachtwoord zijn verplicht.' });
  }

  // Registration is disabled — accounts are created by Helvaro
  if (register === true) {
    return res.status(403).json({ error: 'Registratie is niet beschikbaar. Neem contact op met Helvaro.' });
  }

  try {
    const safe    = (s) => s.replace(/"/g, '\\"');
    const formula = encodeURIComponent(
      `AND({${UF.email}}="${safe(email)}",{${UF.password}}="${safe(password)}",{${UF.active}}=1)`
    );
    const data = await airtable(`/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`);
    const user = data.records?.[0];

    if (!user) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord.' });
    }

    const f = user.fields;
    return res.status(200).json({
      success:     true,
      apiKey:      f[UF.apiKey],
      clientName:  f[UF.clientName],
      projectCode: f[UF.projectCode],
    });
  } catch (err) {
    console.error('[auth]', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
}
