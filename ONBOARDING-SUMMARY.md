# Self-Serve Onboarding Wizard — Summary

Branch: `feature/vercel-growth`. Function count unchanged (13 files under
`api/`, same as before — `public/onboard.html` is a static asset, not a
serverless function). Everything lives in the existing `onboard` mode of
`api/admin.js` and the existing `public/onboard.html` page.

## Step flow (6 wizard steps + a "what now" confirmation screen)

1. **Bedrijfsbasis** — Client Name*, Website, Adres, Email*, Phone, Niche
   (select), Language (nl/fr/en pills).
2. **De AI** — AI Name, tone-of-voice instructions (max 600 chars, concrete
   placeholder example shown).
3. **Hoe je werkt** — Working Hours (validated `ma-vr 9-18` format), Booking
   Method (`in_chat` | `callback` — see "Deliberate deviation" below),
   Callback Window (shown only if `callback`), Notify Phone (WhatsApp ping),
   Rapport Email (weekly report).
4. **Vertel de AI over je bedrijf** — free text: Diensten & prijzen (600),
   Veelgestelde vragen (600), Wat maakt ons anders (400), Wat mag de AI
   NOOIT zeggen (400). This is the partner's "give it everything up front"
   step.
5. **Look & feel (optioneel, met "Later instellen" skip-knop)** — Brand
   Color, Form Intro Message, Trust Badges, AI Photo URL (https URL only),
   Auto-Reply Template (pre-filled with a working default, not just a
   placeholder, per the spec's "with a good default shown").
6. **Controleren & bevestigen** — full review of every non-empty field,
   grouped by section, then the Projectcode field (auto-derived from the
   company name, editable) and the submit button.
7. **"Wat nu?"** — implemented as the existing success-panel pattern
   (replaces the wizard, not a 7th dot) rather than a 7th numbered step, to
   reuse the app's existing "form panel → success panel" swap convention.
   Shows: login credentials (email + one-time password, or an honest
   "couldn't create login" note — see partial-failure handling), the
   lead-form link (`/start/{PROJECTCODE}`), a link to the dashboard, and an
   explicit paragraph that WhatsApp messages outside the first message / 24h
   window (booking confirmations, reminders, follow-ups) require a
   Meta-approved template and that this is a real approval step (usually a
   few days), not instant, and is not handled automatically at account
   creation.

## Exactly which Airtable fields each step writes

All fields already existed on the live Client Config table (`tblPidTrwGRzRt4LZ`)
before this change — **no new Airtable fields were created.** Field IDs were
cross-verified (not just trusted from `docs/architecture.md`, which is missing
six of them) by grepping every existing call site that reads/writes the same
ID: `api/leads.js`'s `config-get`/`config-save` modes, `api/whatsapp.js`,
`api/cron-followup.js`, `api/form.js`, and `api/form-page.js` all agree on the
same IDs, which only work today if the fields already exist live.

| Step | Field(s) written | Airtable Field ID | Docs status |
|---|---|---|---|
| 1 | Client Name | `fldAnB848Sr5jl6dq` | documented |
| 1 | Website | `fldzBclLhryWQ1veO` | documented |
| 1 | Adres | `fldTvMSdTZOyNgWod` | documented |
| 1 | Email | `fld2GjRvjpsxI8XD0` | documented |
| 1 | Phone | `fldecVolseGXtQaAN` | documented |
| 1 | Niche | `fld0BsPnDbBOkTHzr` | documented |
| 1 | Language | `fld1iiV9XwSbgAACZ` | **not in docs** — verified via leads.js/whatsapp.js/form-page.js |
| 2 | AI Name | `fldRvoe1JMPOtPWC7` | documented |
| 2 + 4 | AI Instructions (combined — see below) | `fld1lqHctRbqFGQf5` | documented |
| 3 | Working Hours | `fldq5oIqw5MG8fKhc` | **not in docs** — verified via leads.js/whatsapp.js/form-page.js |
| 3 | Booking Method | `fldUI9BYO0TplgYlm` | **not in docs** — verified via leads.js/whatsapp.js |
| 3 | Callback Window | `fldKvMVBalSBRQE7H` | **not in docs** — verified via leads.js/whatsapp.js |
| 3 | Notify Phone | `fldZEApe0gfse07AU` | **not in docs** — verified via leads.js/whatsapp.js/form.js |
| 3 | Rapport Email | `fldDBJCN6dVMA8jax` | documented |
| 5 | Brand Color | `fldJAf4aTNlIQVL2q` | documented |
| 5 | Form Intro Message | `fldxZ5spOeIb5omPr` | documented |
| 5 | Trust Badges | `fld4nzMbnQseuGhnN` | **not in docs** — verified via leads.js/form-page.js |
| 5 | AI Photo URL | `fld7L0Iijq7ti6A6w` | documented |
| 5 | Auto-Reply Template | `fldOGdVq6T54xEo6W` | documented |
| — | API Key (server-generated) | `fldhmnzVjrb2AyqJr` | documented |
| — | Project Code | `fldN4dL0bGgfBOXwM` | documented |

I did not edit `docs/architecture.md` (out of scope for this task — it wasn't
asked for), but the six "not in docs" fields above are real, live, existing
fields, not new ones.

## Where step 4's free text lands, and how the AI consumes it

Step 2's tone instructions (max 600 chars) and step 4's four business-context
fields (Diensten & prijzen / FAQs / Onderscheid / Nooit zeggen, capped 600 /
600 / 400 / 400) are combined **server-side** by a new `composeAiInstructions()`
helper in `api/admin.js` into a single structured string, written entirely
into the existing **AI Instructions** field (`fld1lqHctRbqFGQf5`):

```
<tone instructions>

--- Info over het bedrijf (ingevuld tijdens onboarding) ---
Diensten & prijzen:
<...>

Veelgestelde vragen:
<...>

Wat ons onderscheidt:
<...>

Dit mag de AI NOOIT zeggen:
<...>
```

capped defensively at the field's existing 3000-char budget (matches the cap
`api/leads.js`'s `config-save` already applies to this same field), though in
normal use the per-field caps above sum to well under that limit so nothing
gets silently truncated.

**Why AI Instructions and not AI Learned Patterns** (`fldnbM5YKh274ISAl`,
the other field the brief mentioned): `api/cron-followup.js`'s
`runWeeklyLearning()` job **fully REPLACES** that field every Monday
(`PATCH { fields: { fldnbM5YKh274ISAl: newPatterns } }` — a straight
overwrite, not an append). Anything a client typed there during onboarding
would be AI-summarized away and lost within a week. AI Instructions has no
such job touching it and is read on **every single WhatsApp turn**
(`api/whatsapp.js` line ~281: `client.fields['AI Instructions']`, fed straight
into `runAI()`'s system prompt), so it's the only field that guarantees the
business context survives and is available from message #1. This is a
deliberate design choice, not an oversight — flagged explicitly per the task's
"combine sensibly and document your choice."

## Deliberate deviation from the task brief: Booking Method

The brief asked for "Booking Method (calendly | callback), Calendly Link (if
calendly) or Callback Window (if callback)." Reading the live code first
(`api/dashboard.js` around the AI Persona panel, `api/leads.js`'s
`config-save`, `api/whatsapp.js`) showed the product has **already moved off
Calendly**: Booking Method is `in_chat` (AI books directly in WhatsApp) or
`callback` (a colleague calls back), `calendly` is explicitly marked
deprecated in `api/dashboard.js` ("Calendly veld DEPRECATED. Sinds in_chat
booking is dit niet meer actief gebruikt. Hidden input behouden voor
backwards-compat"), and the dashboard's live UI only offers those two radio
options to existing clients. Building a Calendly-choice UI into a brand-new
wizard would onboard new clients onto a path the product has already retired.
The wizard instead offers `in_chat` / `callback` only, matching current
product reality; the deprecated `calendlyLink` field/param is left untouched
and unused by the wizard (still accepted server-side for backwards compat
with the old plain onboarding form and the admin-create path).

## Server-side hardening (mirrors `api/leads.js`'s `config-save` validation exactly)

- `ONBOARD_CODE` gate unchanged — still the first check in the `onboard`
  branch, `safeEqual()` timing-safe compare, unreachable without it.
- Every field the wizard sends is re-validated server-side, independent of
  the browser: project code shape (`^[A-Z0-9_]{2,50}$`), required email
  format (now actually enforced for the `onboard` path — previously
  `api/admin.js` had **no** server-side email format check at all for this
  path), website `http(s)://` shape, working-hours format, phone/E.164-ish
  shape for notify phone, hex shape for brand color, https/data-URL shape and
  size cap for AI photo URL, and callback requiring a callback window.
- A genuine pre-existing bug was found and avoided (not fixed elsewhere,
  out of scope): `api/leads.js`'s working-hours validator requires 3–9 letter
  day codes, but the product's own Dutch default/example is `ma-vr` (2-letter
  codes), and the actual runtime parser (`whatsapp.js`'s
  `isWithinWorkingHours()`) accepts 2-letter Dutch/French day codes fine.
  Copying `leads.js`'s regex verbatim into the wizard would have made the
  wizard's own suggested example chips fail validation. Widened to `{2,9}`
  in the new onboarding code path only; `api/leads.js` itself was left
  untouched (fixing it wasn't asked for and risked scope creep).
- Partial-failure honesty: if the Client Config record is created but the
  matching dashboard login (Users record) fails to create (Airtable error,
  not the "already exists" case, which isn't a failure), the response still
  returns 200 with the real client data (the client config genuinely exists
  and is usable) but adds `warning: "..."`. The wizard's success screen
  detects this and swaps to an amber "with a caveat" panel instead of the
  green success panel, explicitly saying the login couldn't be created —
  instead of silently presenting a broken login as if everything worked.
  (Message: "Klantconfig is aangemaakt, maar het dashboard-login-account kon
  niet automatisch worden aangemaakt. Probeer het opnieuw, of neem contact op
  met Helvaro om je login handmatig te laten instellen.")

## Verification performed (no live credentials, no real API calls)

- `node -c api/admin.js` — clean.
- Extracted the wizard's inline `<script>` and ran `node -c` on it — clean.
- Automated structural checks: all HTML tag pairs balanced (`div`,
  `textarea`, `select`, `label`, `button`), all 35 element IDs referenced
  from JS exist in the HTML, and the 6 `step-N`/`dot-N` pairs align.
- Wrote a throwaway script (deleted after use, per instructions) that
  monkey-patches `global.fetch` (mocked Airtable responses only — never
  touched real Airtable) and stubs `require('bcryptjs')` (not installed in
  this worktree's `node_modules`), then called `api/admin.js`'s handler
  directly with `mode: 'onboard'` bodies to check: wrong/missing invite code
  → 401 (gate intact), missing required fields → 400 with the right Dutch
  error message, invalid project code shape → 400, `callback` booking
  without a window → 400, admin path without `x-api-key` → still 401
  (unaffected by these changes), and a full happy-path payload → verified
  every single Airtable field ID written matches the table above exactly,
  verified the AI Instructions field actually contains all four business-
  context strings plus the tone string combined, verified it stays under
  3000 chars, and verified the response shape (`formUrl`, `dashboardUrl`,
  `userCreated`, `apiKey`).

## Still requires the founder manually

- **Meta WhatsApp template approval** — genuinely cannot be automated by
  this wizard or by any code change. Booking confirmations, 24h+ reminders,
  and stale-conversation follow-ups all require an approved Meta message
  template (`BOOKING_TEMPLATE_NAME`, `REMINDER_TEMPLATE_NAME`,
  `FOLLOWUP_TEMPLATE_NAME` env vars — see `REMINDERS-SUMMARY.md`). The
  wizard's final screen says this plainly instead of implying instant setup.
- **WhatsApp Business number provisioning** — every client currently shares
  the one Meta Graph API phone number (`PHONE_ID` env var); the wizard does
  not provision a dedicated number per client.
- **Welcome email** — deliberately still manual (see the existing
  `sendWelcomeEmail`/comment in `api/admin.js`): the founder copies a
  ready-to-paste text from the dashboard and sends from her own mailbox for
  a personal first touch. The wizard's own "Wat nu?" screen covers the
  client-facing side of this instead (they see their credentials and links
  immediately, without waiting on a manual email).
- **`docs/architecture.md` field-table gaps** — the six field IDs marked
  "not in docs" above are real and verified via code, but were not added to
  the doc (out of scope for this task; flagged here instead).

## Anything unverifiable without live credentials

- Whether Airtable actually accepts `typecast: true` writes to the Niche/
  Booking Method single-select fields for values not yet used on a given
  base (mocked in the throwaway test; the existing `onboard` mode already
  relied on this same `typecast: true` behavior before this change, so risk
  is unchanged, not new).
- Real end-to-end behavior of the Users-table dedupe-by-email lookup at
  scale, and real bcrypt hashing (stubbed in the test since `bcryptjs` isn't
  installed in this worktree's `node_modules` — this worktree currently has
  no `node_modules` at all, so this reflects the environment, not the code).
- Visual rendering in an actual browser — no `node_modules`/dev server were
  available in this worktree, and per the task's constraints no `vercel` CLI
  or deploy was run. Verified structurally instead (balanced tags, all
  referenced IDs present, JS syntax valid) — see "Verification performed"
  above.
