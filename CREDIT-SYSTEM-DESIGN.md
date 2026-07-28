# Credit system — design & pricing analysis

Grounded in real 2026 costs, not guesses. Anchored to the live pricing page
(Starter EUR149 / 2.000 credits ~100 gesprekken · Growth EUR349 / 5.000 ~250 +
AI-beeld · Scale EUR699+ / onbeperkt fair-use).

---

## 1. What a lead actually costs

**Inputs (verified July 2026):**
- Meta bills **per delivered template message** (changed July 2025). Belgium sits
  in "Rest of Western Europe": MARKETING ~EUR0.11, UTILITY ~EUR0.05 per message.
- **Service window is FREE** — once the lead replies, the 24h window costs EUR0.
  This is the single most important fact: *the AI conversation itself is nearly free.*
- Claude Haiku 4.5: $1/1M input, $5/1M output -> ~EUR0.003 per AI turn,
  ~EUR0.024 for an 8-turn conversation.
- OpenAI `gpt-image-1`: ~EUR0.04 (medium) to ~EUR0.15 (high) per image.

**Two lead archetypes:**

| | Engaged lead (replies) | Silent lead (never replies) |
|---|---|---|
| First-contact template | EUR0.11 | EUR0.11 |
| AI conversation | EUR0.024 (free window) | EUR0 (no conversation) |
| Confirmation + reminder | EUR0.10 | — |
| Nurture templates (~3.5 avg of max 6) | — | EUR0.18 |
| **Total** | **~EUR0.23** | **~EUR0.29** |

**Counter-intuitive but important: a lead who ignores you costs MORE than one who
converts.** Silent leads consume paid templates and never open a free window.

**Blended (~40% engage): ~EUR0.26/lead. Round to EUR0.30 for safety.**

## 2. What a credit is worth

Keep the page's existing anchor: **1 lead conversation = 20 credits**
(2000/100 and 5000/250 both = 20 — already consistent, don't change it).

=> **1 credit ~= EUR0.015 of real cost.**

| Action | Credits | Real cost | Rationale |
|---|---|---|---|
| Lead conversation (full lifecycle) | **20** | ~EUR0.30 | The anchor. Matches the page. |
| AI image generation | **50** | EUR0.04-0.15 | Priced ABOVE cost deliberately: it's the Growth differentiator and the one genuinely unbounded risk. |
| Marketing content generation (text) | **5** | ~EUR0.01 | Cheap, encourage use. |
| Manual/extra AI reply suggestion | **2** | ~EUR0.003 | Nominal. |

One shared pool (not separate buckets). It's simpler AND the incentive is right:
a client burning credits on images has fewer for leads — leads are the core product.

## 3. Are the plan allowances right? (yes, mostly)

| Plan | Price | Credits | Real cost if fully used | Gross margin |
|---|---|---|---|---|
| Starter | EUR149 | 2.000 (~100 gesprekken) | ~EUR30 | **~80%** |
| Growth | EUR349 | 5.000 (~250 + images) | ~EUR75-90 | **~75%** |
| Scale | EUR699+ | "onbeperkt (fair-use)" | **UNBOUNDED** | **unknown** |

**Starter and Growth are well calibrated — leave them.**

**Scale is the real risk.** "Unlimited" with no defined ceiling is where a SaaS
loses money. Define fair-use numerically (recommend **20.000 credits/month**,
~1000 gesprekken, ~EUR300 cost, still ~57% margin) and state that beyond it you
review usage together. That is normal, honest, and enforceable.

## 4. What happens when they run out — the critical UX decision

**NEVER hard-stop a lead conversation.** Helvaro's entire promise is "reactie
binnen 30 sec, 24/7". If a real prospect messages a client's business and gets
silence because of an internal credit counter, that is catastrophic: the client
loses a customer, blames Helvaro, and churns. The saved cost (EUR0.30) is
nothing against the lost account.

**Tiered response instead:**

| Usage | What happens |
|---|---|
| **80%** | Dashboard bar turns amber. Email: "je zit op 80%". |
| **100%** | Bar red. Email + dashboard prompt to upgrade. **Image generation STOPS** (discretionary, client can wait). **Lead conversations CONTINUE.** |
| **>100%** | Overage billed at **EUR25 per 1.000 extra credits** (~EUR15 cost => ~40% margin), OR auto-upgrade to the next plan — whichever the client prefers, set per client. |
| **Hard ceiling** | A configurable absolute cap (e.g. 3x plan) purely as runaway/abuse protection, with an alert to Sindi — not a routine limit. |

Rationale: stop the *discretionary* spend (images), protect the *core* promise
(lead replies), and convert overage into revenue rather than either eating it or
breaking the product.

## 5. The visible bar (client-facing)

In the dashboard, always visible:
- A progress bar: credits used / plan total, with the % and colour state
  (green <80%, amber 80-100%, red >100%).
- **Human units, not just credits**: "1.240 / 2.000 credits · nog ~38 leadgesprekken"
  — clients think in leads, not credits.
- Days left in the billing period (so "80% on day 5" reads differently from
  "80% on day 27").
- When over: a clear, non-punitive upgrade CTA, not an error state.

Also an admin view for Sindi: usage across all clients, who's trending over,
estimated real cost per client (so margin is visible per account).

## 6. Honest limitation on Airtable

The VPS/Postgres version increments usage atomically inside a transaction.
**Airtable has no atomic increment** — the Vercel implementation must
read-modify-write, so two simultaneous conversations for the same client can
race and under-count by one. At Helvaro's volume (a handful of concurrent
conversations) this is acceptable, and it errs toward under-charging, never
over-charging. It must be documented in code, not hidden — and it resolves
itself when the app moves to the VPS/Postgres backend.
