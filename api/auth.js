const AIRTABLE_TOKEN = process.env.API_Airtable;
const BASE_ID = process.env.BASE_AIRTABLE;

const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';
const CLIENT_CONFIG_TABLE = 'tblPidTrwGRzRt4LZ';

const FIELDS = {
  email: 'fldsqiSy41CCDickr',
  passwordHash: 'fldqi8JWgFgJF4X4R',
  clientName: 'fldmKwegSUj1joru3',
  projectCode: 'fldbrCpBuQjJBfZsv',
  apiKey: 'fldxZMgVXSy7EShDL',
  active: 'fldb8sGE3Bslch8f8',
};

const AIRTABLE_BASE = `https://api.airtable.com/v0/${BASE_ID}`;

function airtableHeaders() {
  return {
    Authorization: `Bearer ${AIRTABLE_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function airtableFetch(path, options = {}) {
  const res = await fetch(`${AIRTABLE_BASE}${path}`, {
    ...options,
    headers: { ...airtableHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Airtable ${res.status}: ${text}`);
  }
  return res.json();
}

async function findUser(email) {
  const formula = encodeURIComponent(`{${FIELDS.email}} = '${email.replace(/'/g, "\\'")}'`);
  const data = await airtableFetch(`/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`);
  return data.records?.[0] || null;
}

async function findActiveUser(email, password) {
  const formula = encodeURIComponent(
    `AND({${FIELDS.email}} = '${email.replace(/'/g, "\\'")}', {${FIELDS.passwordHash}} = '${password.replace(/'/g, "\\'")}', {${FIELDS.active}} = 1)`
  );
  const data = await airtableFetch(`/${USERS_TABLE}?filterByFormula=${formula}&maxRecords=1`);
  return data.records?.[0] || null;
}

async function findClientConfig(projectCode) {
  const formula = encodeURIComponent(`{Project Code} = '${projectCode.replace(/'/g, "\\'")}'`);
  const data = await airtableFetch(`/${CLIENT_CONFIG_TABLE}?filterByFormula=${formula}&maxRecords=1`);
  return data.records?.[0] || null;
}

async function createUser({ email, password, clientName, projectCode, apiKey }) {
  const data = await airtableFetch(`/${USERS_TABLE}`, {
    method: 'POST',
    body: JSON.stringify({
      records: [{
        fields: {
          [FIELDS.email]: email,
          [FIELDS.passwordHash]: password,
          [FIELDS.clientName]: clientName,
          [FIELDS.projectCode]: projectCode,
          [FIELDS.apiKey]: apiKey,
          [FIELDS.active]: true,
        },
      }],
    }),
  });
  return data.records?.[0] || null;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, register, name, projectCode } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mailadres en wachtwoord zijn verplicht.' });
  }

  try {
    // ── REGISTRATION DISABLED — accounts are created by Helvaro ─────────
    if (register === true) {
      return res.status(403).json({ error: 'Registratie is niet beschikbaar. Neem contact op met Helvaro.' });
    }

    // ── LOGIN ─────────────────────────────────────────────────────────────
    const user = await findActiveUser(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Verkeerd e-mailadres of wachtwoord.' });
    }

    const f = user.fields;
    return res.status(200).json({
      success: true,
      apiKey: f[FIELDS.apiKey],
      clientName: f[FIELDS.clientName],
      projectCode: f[FIELDS.projectCode],
    });
  } catch (err) {
    console.error('[auth]', err.message);
    return res.status(500).json({ error: 'Serverfout. Probeer later opnieuw.' });
  }
}
