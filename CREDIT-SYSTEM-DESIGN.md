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

The VPS/Postgres version incremented usage atomically inside a transaction.
**Airtable has no atomic increment** — the Vercel implementation must
read-modify-write, so two simultaneous charges for the same client can race and
under-count. It errs toward under-charging, never over-charging.

Two things changed since this was written, and the VPS is not one of them —
that machine has been destroyed, so "it resolves itself when the app moves to
Postgres" is no longer a plan, it is a decision nobody has made yet.

**Measured, not assumed.** Against a stubbed Airtable with a 20ms read, five
concurrent charges of 3 credits recorded as **3, not 15** — four of five
vanished. The old note said "under-count by one"; at Faro's concurrency it is
closer to "count one of five". Faro made this worse than it was: one question
can run several tools, and a chat turn and an image are billed separately.

**What now happens.** `recordUsage()` serialises per project code: charges for
the same client queue behind each other instead of interleaving. That removes
the race *within one instance*, which is the bulk of it, since one agency's
requests generally land on the same warm instance. The window between instances
remains and cannot be closed without a counter that can add without reading
first.

## 7. Video — priced before it is wired

Video generation does not work yet (`api/_faro/actions.js` throws `not_wired`),
which is exactly why the price exists now: it is by far the most expensive thing
this product can do, and a rate invented after the tap is open is invented too
late.

Real cost from `api/_media-models.js`: $0.30/second at 1280x720, $0.50/second on
the wider formats. Against this document's anchor of ~EUR0.015 per credit:

| | Real cost | At cost | Charged |
|---|---|---|---|
| 8s, 1280x720 | ~EUR2.21 | 147 credits | **240** |
| 8s, 1792x1024 | ~EUR3.68 | 245 credits | **400** |
| 4s, 1280x720 | ~EUR1.10 | 74 credits | **120** |

For scale: an image is 50 credits and a **whole lead conversation is 20**. One
eight-second video is therefore worth twelve lead conversations.

Images sit at roughly 8x cost deliberately — §2 calls them "the one genuinely
unbounded risk". Video cannot take the same multiplier: it would put one clip at
~1,200 credits, more than half a month of Growth. It is priced at ~1.6x instead.

**A decision this document cannot make for you.** At 30 credits/second, one
standard video costs 240 of a trial's 250 credits. A trial customer can make
exactly one and then has nothing left for leads. That may be the intent — let
them see it work once — or it may be a trial that ends the moment it is used.
Options, none obviously right: leave it, exclude video from trials entirely, or
give trials a smaller video budget of their own.


## 8. Faro chat — charged on what it actually uses

Faro billed a flat 3 credits per turn. That was defensible when a turn was "a
handful of completions". It is not the shape of a turn any more:

- 17 tool definitions ride along in **every** request
- the system prompt is ~7,600 characters
- history reaches back up to 40 turns
- up to 8 tool rounds per turn, each resending the whole context
- the default model is **Sonnet**, and "Precies" is **Opus** — not the Haiku
  §1 costed the WhatsApp conversation with

So one turn can be eight model calls against a growing context on a pricier
model, for the same 3 credits. Worse, the loss grows exactly when Faro is most
useful: reaching for more tools costs more and earns the same.

Measured on **Haiku**, the cheapest model available:

| Turn | Real cost | Old charge | Now |
|---|---|---|---|
| Short question (3k in / 500 out) | ~EUR0.005 | 3 | 3 |
| Heavy, 8 tool rounds (60k in / 4k out) | ~EUR0.074 | 3 | **15** |

The orchestrator already counted the tokens and threw them away as metadata.
They now set the charge, at 3x cost — between video's 1.6x and images' 8x.

**Two prices are missing and only you can supply them.** `MODEL_PRICES` in
`api/_credits.js` has Haiku from §1 and `null` for `claude-sonnet-5` and
`claude-opus-5`. While they are null, those turns fall back to the flat 3
credits and log a loud warning per model. That is deliberate: a guessed price
that under-charges silently is worse than an obvious gap. **Sonnet is the
default tier**, so today the majority of real turns are on the fallback.

Put the real per-million input/output prices in and the accounting closes.

## 9. Where the margin actually stands

At full consumption, and assuming every weight covers its cost:

| Plan | Price | Credits | Cost | Margin |
|---|---|---|---|---|
| Starter | EUR149 | 2,000 | EUR30 | EUR119 (80%) |
| Growth | EUR349 | 5,000 | EUR75 | EUR274 (79%) |

That 80% only holds if each weight covers its own cost. Coverage per action:

| Action | Credits | Real cost | Coverage |
|---|---|---|---|
| Lead conversation | 20 | EUR0.300 | 1.0x |
| Image | 50 | EUR0.095 | 7.9x |
| Video, 8s 720p | 240 | EUR2.210 | 1.6x |
| Faro turn, short | 3 | EUR0.005 | 9.0x |
| Faro turn, 8 rounds | 15 | EUR0.074 | 3.0x |

Two things stand out.

**The lead conversation runs at 1.0x — no margin at all.** It is the anchor, so
the plan price carries it rather than the weight. That works while leads are the
bulk of usage, because images and short chat turns subsidise them. It stops
working if a client's mix shifts toward video, which sits at 1.6x.

**A Scale plan is "unlimited fair-use" with no ceiling in the code.** At EUR699,
video alone reaches cost at roughly 316 clips a month. That is a lot — but it is
not enforced anywhere, and "fair use" is not a number. Worth setting one.
