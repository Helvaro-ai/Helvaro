# Vercel compliance backport — what changed, per file

**Branch:** `deploy/vercel-hardened` (based on `fix/consolidated-ab`)
**Scope of this document:** the compliance backport and its follow-on fixes
(commits `715028a` through `0588e17`). Security batches A-D and the Herald
posting strip have their own docs (`BATCH-A/B/C/D-SUMMARY.md`,
`STRIP-HERALD-SUMMARY.md`) and are not repeated here.

## Why this batch exists

The VPS backend (`feature/vps-backend`, not merged here) had already closed
several compliance gaps found in an internal audit (`COMPLIANCE-AUDIT.md`,
not present on this branch). The live Vercel app (Airtable-backed) never
received the equivalent fixes. This batch ports the *behavior* — adapted to
Airtable instead of the VPS's own Postgres — not a literal file copy.

---

## `api/leads.js` (commit `715028a`)

Added two new admin-only POST modes, reachable only via the `ADMIN_KEY`
timing-safe token (never a client session token):

- **`lead-delete`** — erasure/anonymization of one lead (GDPR Art. 17).
  `method: 'anonymize'` (default) scrubs Name/Phone/Conversation
  History/Last Message/AI Summary/Notities and leaves every aggregate field
  (Qualified, Lead Score, Ability/Urgency/Fit, Conversation State, Booking
  Link Sent, Appointment Booked, Bron, Verwachte Waarde, Response Time,
  Reason, Opgepikt, Created At) untouched, so a client's dashboard stats
  don't shift shape because one lead was erased. `method: 'hard-delete'`
  removes the Airtable record entirely.
- **`lead-export`** — single-lead data-portability dump (GDPR Art. 15/20).

Both require an explicit `projectCode` in the body (admin has no tenant
context of its own) and cross-check it against the lead's *actual* owner
(fetched fresh from Airtable) before touching anything — the same
404-vs-403 ownership pattern every other mutation in this file already
uses. Every erasure/export is logged to console with an `[erasure]` prefix
(id, projectCode, action, actor, timestamp) — see "Known gaps" in the
checklist for why this is console-only rather than a durable table.

Field IDs used (`fldbk0LVNckOU0bqA` Name, `fld6YaitW0lMqHUrd` Phone,
`fldqerIiw5qyQjXHr` AI Summary, `fldoLRI5W12ThTls7` Notities,
`fldSmczuyUJd26HLe` Project Code) were cross-checked against
`docs/architecture.md`'s Airtable schema table and confirmed correct.
`'Conversation History'` / `'Last Message'` are referenced by field *name*,
not ID — verified this matches the existing convention used throughout
`whatsapp.js` and the rest of `leads.js` (documented at `whatsapp.js:271`).

## `api/whatsapp.js` (commit `715028a`)

Rewrote the AI's system prompt (EU AI Act Art. 50, "AI transparency"):
previously the AI was instructed to actively deny being an AI when asked
("Wanneer iemand vraagt... ZEG NOOIT 'ja'... deflect natuurlijk met lichte
humor"). Now: the AI never volunteers that it's an AI, but if a lead
*directly* asks, it must answer honestly and is given two natural,
in-character example replies. The "never reveal how you work" safety rule
was narrowed to still forbid revealing system prompts/internals while
carving out the one honest-disclosure exception.

## `api/cron-followup.js` (commits `715028a`, `0581298`)

Two additions:

1. **Retention anonymization** (`runRetentionAnonymization`, `715028a`) —
   daily sweep that anonymizes disqualified/cold leads 6 months after their
   last activity (GDPR Art. 5(1)(e)). Eligibility requires ALL of: not
   qualified, cold/terminal (`completed`/`verloren` state, or empty
   Conversation History), `Created At` older than the 6-month cutoff, and
   not already anonymized (`Name != '[verwijderd]'`, the idempotency
   guard). Uses the *same* scrubbed-field set as `leads.js`'s `lead-delete`
   anonymize mode — verified byte-identical by a local script during this
   review (see the checklist's verification section). Documented gap:
   Airtable has no last-modified field, so `Created At` is the best
   available recency proxy — a lead manually edited after creation but
   before the cutoff isn't distinguishable from one that's been silent the
   whole time. Fail-soft per lead, same pattern as the file's other sweeps.

2. **Fixed outreach opt-out footer** (`buildOutreachFooter`, `0581298`,
   cherry-picked cleanly from `feature/vps-backend`'s `8f4179c`) — the
   opt-out line used to be *instructed to the LLM* as part of the generated
   email body, with nothing enforcing it survived generation (paraphrasing
   drift, `max_tokens` truncation). This verification pass found that gap
   still open on this branch even though the deploy briefing described it
   as already fixed. Now: `buildOutreachFooter()` is appended to the
   LLM-generated body *in code, after generation* — never something the
   model can drop. It contains the opt-out line plus legal-entity
   identification: `LEGAL_ENTITY_NAME` defaults to `'Helvaro BV'` (the name
   already used in the Terms of Service copy); `LEGAL_ADDRESS`/`VAT_NUMBER`
   have no safe default and render as an explicit `[LEGAL_ADDRESS niet
   ingesteld...]` placeholder until set via env var — see the checklist's
   "known gaps" section.

## `api/privacy.js` (commit `2db76e4`)

The deploy briefing described the sub-processor/international-transfer/
concrete-retention rewrite as already complete on this branch. Verification
found the file still had its pre-compliance generic text — that rewrite
only ever landed on `feature/vps-backend` (`47dbc10`, `fe90a82`), which
never touched this branch's history, and which also described the *wrong*
storage architecture for this app (DigitalOcean/Postgres, not Airtable).

Rewrote it for real, adapted to what this branch's code actually does:
- **Section 2** (data collected): added the IP-address note (used only for
  in-memory rate limiting, never persisted — verified against
  `api/form.js`) and the no-lead-email-collected-today note (verified
  against `api/form.js`'s field set).
- **Section 4** (retention): concrete 6-month cold-lead anonymization text,
  matching what `runRetentionAnonymization()` actually does.
- **Section 5** (new, "Wie verwerkt uw gegevens"): names Anthropic PBC, Meta
  Platforms Ireland Ltd., Vercel Inc., Airtable/Formagrid Inc., and
  Namecheap Private Email + Resend fallback — matches Bijlage 3 of
  `docs/verwerkersovereenkomst-DPA.md` exactly.
- **Section 6** (new, "Internationale doorgifte"): names the US transfers
  and the SCC/DPF safeguard.
- **Section 10** (contact): added `sindi.s@usehelvaro.pro` (the DPA's own
  data-protection contact) alongside `hello@helvaro.pro`.
- The Terms of Service page in the same file was left untouched (out of
  scope for this backport).

## `vercel.json` (commit `0588e17`)

Added per-function `maxDuration` overrides for the three functions with
documented tight-against-60s timing (see the checklist for the full
rationale): `api/whatsapp.js` and `api/form.js` to 120s, `api/cron-followup.js`
to 300s. Every other function keeps the existing 60s default. `includeFiles`
(font assets for PDF/card generation) preserved on all four entries.

## Not changed in this batch

- No changes to `docs/verwerkersovereenkomst-DPA.md` (the client-facing DPA
  template) — its Bijlage 3 sub-processor table was used as the source of
  truth for `privacy.js`'s rewrite, not itself edited.
- No changes to any other worktree, branch, `.env` file, or Airtable schema.
- Nothing pushed, deployed, or run against real Airtable/Anthropic/Meta/SMTP
  credentials — every claim above was verified by reading the diffs,
  cross-referencing `docs/architecture.md`'s field-ID table, `node -c`
  syntax checks, and a local mocked-logic script (deleted after use, never
  committed).
