# 14-day free trial — design

The pricing page promises "Start 14 dagen gratis · Geen setup-kosten · Maandelijks
opzegbaar". This is how that works technically and commercially.

## 1. No credit card up front

Helvaro sells high-touch B2B to Belgian practice owners at ~EUR249/mo, with a
handful of clients converted personally — not self-serve volume. A card wall
before the prospect has seen a single lead qualified is friction at exactly the
wrong moment, and at this client count conversion is a phone call, not a webhook.
Card-up-front raises trial *quality* and auto-converts, but craters signup rate;
that trade only pays at volume Helvaro doesn't have yet. Revisit at ~20+ clients.

## 2. The trial is the FULL product

No crippled tier. A trial that can't prove the value doesn't convert. New trial
clients get the Starter allowance (2.000 credits ~= 100 leadgesprekken) — in 14
days a typical practice uses a fraction of that, so **time is the binding
constraint, not credits**, which is the correct pressure.

## 3. What happens at day 14 — the decision that matters most

Most trials get this wrong in one of two directions: hard-stop everything (their
leads go unanswered, they blame Helvaro, relationship burned) or keep serving
free (no conversion pressure, ever).

**Helvaro's answer: capture continues, automation stops.**

| | During trial | After expiry |
|---|---|---|
| Lead form still accepts leads | yes | **yes** |
| Lead saved + visible in dashboard | yes | **yes** |
| AI answers the lead on WhatsApp | yes | **no** |
| Conversation already in flight | — | **finishes normally** |
| Reminders / campaigns / AI features | yes | no |

Rationale: the client never *loses* anything — no lead disappears, their website
keeps working, nothing looks broken to their own customers. What they lose is the
automation, and they see it: a dashboard full of captured-but-unanswered leads is
the value gap made visible and honest. That converts far better than an error
screen, and it doesn't damage their business on the way out.

**Never abandon an in-flight conversation.** If a real person is mid-chat when the
clock runs out, the AI finishes that conversation. Cutting a human off mid-sentence
reads as a broken product, not a paywall.

## 4. Touchpoints (the conversion sequence)

| When | What | To whom |
|---|---|---|
| Day 0 | Welcome + setup nudge (the onboarding wizard's "what happens next") | client |
| **Day 7** | **"Wat Helvaro deze week deed"** — real numbers from their own data | client |
| **Day 11** | "Nog 3 dagen" + the same numbers | client **+ alert to Sindi** |
| Day 14 | Expired -> capture-only mode | client + alert to Sindi |
| Day 14-21 | Reactivation is one admin action (Plan Status -> active) | — |

**Day 11 is the conversion moment** — it exists to trigger Sindi's phone call, not
to automate the close.

## 5. The ROI report IS the sales pitch

The day-7 and day-11 emails reuse the Resultaten reporting already built. A message
that says *"In 11 dagen: 23 leads, 14 gekwalificeerd, 6 afspraken, EUR 12.400
verwachte pipeline"* is the entire value proposition expressed in the prospect's own
data. Nothing a salesperson writes beats that. (Same honesty rule applies: pipeline
value is their own estimate, never described as revenue Helvaro generated.)

## 6. Airtable fields (created 2026-07-30, live base)

| Field | Type | Purpose |
|---|---|---|
| `Plan Status` | singleSelect | trial / active / expired / cancelled / paused. **Blank = treated as `active`** so every existing client is unaffected. |
| `Trial Ends At` | dateTime (Europe/Brussels) | Set to start + 14 days at onboarding. Blank = no trial. |
| `Credit Allowance` | number | 2.000 seeded at onboarding. |
| `Credits Used` | number | App-managed. |
| `Credit Period` | multilineText | App-managed JSON (period start + which alerts fired). |

## 7. Safety rules for the implementation

- **Blank `Plan Status` means active.** Existing clients have no value in this
  field; they must never be treated as expired. Fail OPEN on anything ambiguous.
- Expiry is evaluated from `Trial Ends At`; if that field is missing or unparseable,
  treat the client as active (fail open) and log it.
- The daily cron flips `trial` -> `expired` and sends the alerts; the webhook path
  reads the current state on every message and must not depend on the cron having run.
- Every trial email is fail-soft: a mail failure must never change the client's
  service state.
