#!/usr/bin/env node
// Provisions Clerk users from the Airtable Users table.
//
// projectCode is the tenant key: it decides which client's leads a session can
// see. Under the old system it was baked into a token this server signed, so it
// could not be wrong. Under Clerk it lives in user.publicMetadata, and this
// script is the only thing that puts it there. Everything downstream trusts it.
//
// Dry-run by default. Nothing is written unless you pass --apply.
//
//   node scripts/clerk-sync-users.js            # show what would happen
//   node scripts/clerk-sync-users.js --apply    # actually write
//
// Needs, in the environment:
//   CLERK_SECRET_KEY   API_AIRTABLE   BASE_AIRTABLE
//
// Existing Clerk users are matched by email and updated in place, so running
// this twice is harmless. It never deletes anyone.

const { createClerkClient } = require('@clerk/backend');

const USERS_TABLE = 'tbl2hrPW7gIx5XF4S';
const F = {
  email:    'fldsqiSy41CCDickr',
  client:   'fldmKwegSUj1joru3',
  project:  'fldbrCpBuQjJBfZsv',
  active:   'fldb8sGE3Bslch8f8',
};

const APPLY = process.argv.includes('--apply');

function need(name) {
  const v = process.env[name];
  if (!v) { console.error(`Ontbrekende omgevingsvariabele: ${name}`); process.exit(1); }
  return v;
}

async function airtableUsers() {
  const token  = need('API_AIRTABLE');
  const baseId = need('BASE_AIRTABLE');
  const out = [];
  let offset = '';
  do {
    const url = `https://api.airtable.com/v0/${baseId}/${USERS_TABLE}?pageSize=100${offset ? '&offset=' + offset : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    for (const rec of d.records || []) {
      const f = rec.fields || {};
      out.push({
        id:          rec.id,
        email:       String(f[F.email]   || f.Email          || '').trim().toLowerCase(),
        clientName:  String(f[F.client]  || f['Client Name'] || '').trim(),
        projectCode: String(f[F.project] || f['Project Code']|| '').trim(),
        active:      f[F.active] === true || f.Active === true,
      });
    }
    offset = d.offset || '';
  } while (offset);
  return out;
}

(async () => {
  const clerk = createClerkClient({ secretKey: need('CLERK_SECRET_KEY') });
  const users = await airtableUsers();

  console.log(`${users.length} gebruiker(s) in Airtable\n`);
  if (!APPLY) console.log('DROOGLOOP — er wordt niets weggeschreven. Voeg --apply toe om echt te synchroniseren.\n');

  let created = 0, updated = 0, skipped = 0;

  for (const u of users) {
    const label = u.email || `(record ${u.id})`;

    // Refusing here is the whole point: a Clerk user without projectCode is
    // rejected at login (api/_clerk.js fails closed), so provisioning one
    // without it would just create an account that cannot sign in — and an
    // empty projectCode elsewhere in the API means "show everything".
    if (!u.email || !u.projectCode) {
      console.log(`  OVERGESLAGEN  ${label} — ${!u.email ? 'geen e-mailadres' : 'geen projectCode'}`);
      skipped++;
      continue;
    }
    if (!u.active) {
      console.log(`  OVERGESLAGEN  ${label} — niet actief in Airtable`);
      skipped++;
      continue;
    }

    const metadata = { projectCode: u.projectCode, clientName: u.clientName };

    let existing = null;
    try {
      const found = await clerk.users.getUserList({ emailAddress: [u.email], limit: 1 });
      existing = (found.data || found)[0] || null;
    } catch (e) {
      console.log(`  FOUT          ${label} — opzoeken mislukt: ${e.message}`);
      skipped++;
      continue;
    }

    if (existing) {
      const cur = existing.publicMetadata || {};
      if (cur.projectCode === metadata.projectCode && cur.clientName === metadata.clientName) {
        console.log(`  ONGEWIJZIGD   ${label} — projectCode ${u.projectCode}`);
        continue;
      }
      console.log(`  BIJWERKEN     ${label} — projectCode ${cur.projectCode || '(leeg)'} -> ${u.projectCode}`);
      if (APPLY) await clerk.users.updateUserMetadata(existing.id, { publicMetadata: metadata });
      updated++;
    } else {
      console.log(`  AANMAKEN      ${label} — projectCode ${u.projectCode}`);
      if (APPLY) {
        await clerk.users.createUser({
          emailAddress: [u.email],
          publicMetadata: metadata,
          skipPasswordRequirement: true,   // people set a password via Clerk's own flow
        });
      }
      created++;
    }
  }

  console.log(`\nAangemaakt: ${created}  Bijgewerkt: ${updated}  Overgeslagen: ${skipped}`);
  if (!APPLY && (created || updated)) console.log('Draai opnieuw met --apply om dit door te voeren.');
})().catch(e => { console.error('\nGefaald:', e.message); process.exit(1); });
