# Helvaro AI Workspace — structure

**Status: scaffold. Nothing executes.** Every module below exists with its real
interface; the bodies that would call a model, write to the database or spend
money throw `not_wired` or return empty. `AI_WORKSPACE_ENABLED` is unset, so
`api/ai.js` returns 404 for every request regardless.

This document is the map, the reasoning behind the shape, and the checklist for
turning it on.

---

## 1. What was already here

The single most important finding: **most of this is an extension, not a new
build.** Before writing anything, the existing repo gave us:

| Already exists | Where | What it means for this work |
|---|---|---|
| The design palette | `DESIGN-SYSTEM.md` | Matte Black, Charcoal and Sand are already tokens with a documented "Sand is never a flood" rule. Requirement 2's palette is this palette plus three unnamed values. We added three tokens, not a design system. |
| AI property images | `api/_images.js` | OpenAI image-**edit** on the client's real photo, tenant-scoped Vercel Blob storage, credit metering, a style list, an AI-disclaimer label. Requirement 9 is ~70% built. |
| A model-calling engine | `runAI()`, `api/whatsapp.js:1111` | The WhatsApp qualification brain. Not reusable as a general assistant, but the reference for how this repo calls providers (plain `fetch`, no SDK). |
| A metered public AI endpoint | `api/_demo-chat.js` | The template for layered cost control: length cap → turn cap → rate limit → credits. |
| Calendar | `api/_gcal.js` | Requirement 8's "schedule a follow-up tomorrow". |
| Credits | `api/_credits.js` | The hard spending ceiling everything must share. |
| A Postgres escape hatch | `api/_pgapi.js` | Three tables already moved off Airtable for write pressure. Chat belongs on this path. |
| Client routing | `navigateTo()`, `api/dashboard.js:14498` | Toggles `.page` sections. The workspace switcher hooks in here. |

What did **not** exist: any video pipeline, any conversation storage, and the
3D falcon mascot.

## 2. Architecture

```
Browser — api/dashboard.js inline script + api/_ai/ui/*
   │  CRM | AI switcher → setWorkspace('ai')
   ▼
api/ai.js ......................... route: session + CSRF only, 50 lines
   ▼
api/_ai/handler.js ................ mode dispatch, validation, rate limit
   ▼
api/_ai/orchestrator.js ........... turn loop, tool loop, streaming
   ▼
api/_ai/providers/index.js ........ one interface
   ├── claude.js
   └── openai.js
        ▲
        │ tools
api/_ai/tools.js .................. read tools run; act tools only propose
   ▼
api/_ai/actions.js ................ the ONLY module that executes an act
```

### The three decisions that shape everything else

**1. Act-tools cannot execute.**
`tools.js` splits tools into `read` (run immediately) and `act` (build a
proposal and stop). The orchestrator has no execution path for an act-tool —
`actions.js` does, and it only accepts an `actionId` the user clicked. This
makes requirement 8's "ask for confirmation before executing external actions"
structural rather than a prompt instruction. It matters because `get_conversation`
returns text that strangers sent us over WhatsApp; that text reaches the model's
context, and a prompt that can be argued with is not a control.

**2. The model never authors UI.**
Requirement 7 wants lead cards, not text. The tempting shortcut — let the model
emit HTML or markdown — is rejected: it puts model output into `innerHTML` with
attacker-influenced text upstream, it lets the model reference record ids it
invented, and layout drifts every turn. Instead tools emit typed component
objects (`api/_ai/schema.js`), the client renders each type with fixed markup,
and every id came from our own database read. Model prose goes in via
`textContent`, always.

**3. The provider is never visible.**
`config.js` is the only module that knows which vendor is active or what the
model id is. `publicModelLabel()` returns `"Helvaro AI · Standaard"`. Provider
errors are converted to `ProviderError` with safe text before they can reach a
response, because vendor error strings name models and sometimes echo request
content. Requirement 13 is enforced at a seam, not by remembering.

### Why a second provider adapter exists before it is needed

`openai.js` is written now, unwired, because an abstraction with one
implementation is unproven. OpenAI differs from Claude in four ways that would
each have leaked into the orchestrator if only one adapter existed: system
prompt as a message, tool results as separate messages, `tool_calls` with
stringified arguments, and data-URI images. Writing both mappings side by side
is what keeps the contract honest.

## 3. Files

### Backend
| File | Status |
|---|---|
| `api/ai.js` | Route. Real, but 404s while disabled. |
| `api/_ai/config.js` | Complete. Provider/model/limits/branding. |
| `api/_ai/schema.js` | Complete. Component builders. |
| `api/_ai/stream.js` | Complete. SSE transport. |
| `api/_ai/prompt.js` | Structure done, context block stubbed. |
| `api/_ai/tools.js` | All 15 tools declared with real schemas; bodies mocked. |
| `api/_ai/actions.js` | Gate + validation real; executors stubbed. |
| `api/_ai/store.js` | Full surface; no queries wired. |
| `api/_ai/media.js` | Job lifecycle; providers unwired. |
| `api/_ai/orchestrator.js` | Turn loop complete; stops at the provider. |
| `api/_ai/handler.js` | Dispatch + validation real. |
| `api/_ai/providers/{index,claude,openai}.js` | Contract + mappings real; network calls stubbed. |

### UI
| File | Status |
|---|---|
| `api/_ai/ui/index.js` | The five-point seam into `dashboard.js`. |
| `api/_ai/ui/tokens.js` | Complete. Three new tokens. |
| `api/_ai/ui/styles.js` | Complete. Layout, states, responsive. |
| `api/_ai/ui/markup.js` | Complete. Switcher, sidebar, landing, thread, panels. |
| `api/_ai/ui/quick-actions.js` | Complete. Nine actions as data. |
| `api/_ai/ui/client.js` | Complete. State machine, SSE reader, renderers. |

**The UI does not live inside `api/dashboard.js`.** That file is a single
~19,000-line template literal where every backtick and `${` must be escaped —
its own comment at line 16414 warns about this. Several thousand lines of AI
CSS and JS in there would be hostile to edit and hazardous to review. These
modules return plain strings and splice in at five points.

## 4. Wiring checklist

Ordered so each step is independently verifiable.

- [ ] **1. Mount the UI.** Five interpolations in `api/dashboard.js` (see
      `api/_ai/ui/index.js` header). Switcher works, workspace renders, nothing
      answers. This is the visual sign-off point.
- [ ] **2. Mascot assets.** Six `.webp` files at `/ai/falcon-{idle,thinking,generating,video,success,error}.webp`.
      Add a `public/ai/` rewrite in `vercel.json`. CSS handles the motion —
      the assets are stills.
- [ ] **3. VPS tables.** `ai_conversations`, `ai_messages`, `ai_projects`,
      `ai_project_links` (columns in `api/_ai/store.js` header), then wire
      `store.js` through `_pgapi`.
- [ ] **4. Pending actions table.** `actions.js` currently holds proposals in
      memory, which does not survive a cold start. Must be a table before launch.
- [ ] **5. Claude adapter.** Implement `streamChat`. Set `ANTHROPIC_API_KEY`.
- [ ] **6. Read tools.** Wire the nine read tools to existing Airtable/Postgres
      reads. Never re-implement a query that `api/leads.js` already has.
- [ ] **7. Credits + rate limit.** Meter chat turns through `api/_credits.js`.
- [ ] **8. Enable.** `AI_WORKSPACE_ENABLED=1`. Chat works end to end.
- [ ] **9. Act tools.** Executors in `actions.js`, wired to `whatsapp.js` send,
      `_gcal.js`, campaign records. Outbound AI messages must pass the same
      opt-out and quiet-hours checks as any other message.
- [ ] **10. Images.** Extend `PROPERTY_STYLES` in `api/_images.js` with
      contemporary, minimal, classic, warm, architectural. Wire `media.js`
      to its existing generate path. Build the Images panel controls.
- [ ] **11. Video.** Choose a provider. Net-new; see the open questions.
- [ ] **12. Projects.** Largely a view over what steps 3–11 produce.
- [ ] **13. OpenAI adapter.** Proves the swap works.

## 5. Open questions

1. **Video provider.** Nothing in this repo does video. Requirements: server-side
   key, image-to-video from the property's own photos, a job/webhook model
   (nothing useful finishes inside `vercel.json`'s 60s cap), and a known
   per-generation cost to price into credits.
2. **Mascot production.** No asset exists in the repo. Generate, or supply?
3. **Route vs. mode dispatch.** `api/ai.js` is the 11th deployed function.
   `api/_images.js`'s header shows the project deliberately holds this number
   down. `handler.js` works unchanged either way — it can be dispatched from
   `api/leads.js` by `body.mode` for zero extra functions if the count binds.
4. **Language.** UI strings are Dutch, matching the rest of the dashboard. The
   brief was written in English; confirm Dutch is right for the AI workspace too.

## 6. What this scaffold deliberately does not do

- No model is called.
- No database table is created or written.
- No key is read at import time.
- `api/dashboard.js` is untouched — the CRM is byte-identical.
- `vercel.json` is untouched.
- No dependency was added to `package.json`.

Turning any of this on is a deliberate, reviewable step, not a side effect of
this code being present.
