# Helvaro AI Workspace — structure

**Status: mounted and runnable locally. Nothing is wired to a real model, a
real database, or real money.**

The workspace is now integrated into `api/dashboard.js` and works end to end
against a scripted provider and fixture data:

```
node scripts/ai-dev.js     →  http://localhost:4321   (click "AI", top centre)
node scripts/ai-check.js   →  static checks, no network
```

In production nothing changes until three env vars are set — `AI_PROVIDER`,
`AI_WORKSPACE_ENABLED`, and (for a real model) an API key. Unset,
`api/ai.js` returns 404 for every request.

Scope decision: **everything except video generation.** Video ships as a
visible-but-empty panel with an explicit "coming soon" rather than a hidden
entry, because a hidden feature is less honest to a paying customer than a
stated one.

This document is the map, the reasoning behind the shape, and the checklist for
finishing it.

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
   ├── claude.js   (not wired)
   ├── openai.js   (not wired)
   └── demo.js     (scripted — local dev, and proof the contract holds)
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
| `api/_ai/tools.js` | 16 tools with real schemas. 9 read / 7 act. Read tools return fixtures in demo mode; production reads unwired. |
| `api/_ai/actions.js` | Gate + validation real; executors stubbed. |
| `api/_ai/store.js` | Full surface; no queries wired. |
| `api/_ai/media.js` | Job lifecycle; providers unwired. |
| `api/_ai/orchestrator.js` | Turn loop complete; stops at the provider. |
| `api/_ai/handler.js` | Dispatch + validation real. |
| `api/_ai/providers/{index,claude,openai}.js` | Contract + mappings real; network calls stubbed. |
| `api/_ai/providers/demo.js` | **Working.** Scripted provider for local dev. |
| `api/_ai/fixtures.js` | **Working.** Sample data behind `AI_DEMO_MODE=1`. |

### UI
| File | Status |
|---|---|
| `api/_ai/ui/index.js` | The five-point seam into `dashboard.js`. |
| `api/_ai/ui/tokens.js` | Complete. Three new tokens. |
| `api/_ai/ui/styles.js` | Complete. Layout, states, responsive. |
| `api/_ai/ui/markup.js` | Complete. Switcher, sidebar, landing, thread, panels. |
| `api/_ai/ui/quick-actions.js` | Complete. Nine actions as data + labels. |
| `api/_ai/ui/client.js` | Complete. State machine, SSE reader, renderers, Images form. |
| `api/_ai/ui/i18n.js` | Complete. nl/fr/en/de, English fallback. |
| `api/_ai/ui/icons.js` | Complete. Monochrome line set. |

### Scripts
| File | Purpose |
|---|---|
| `scripts/ai-dev.js` | Local server. Real code path, scripted provider, fixture data. |
| `scripts/ai-check.js` | Static checks: splice safety, client parse, gate, branding. |

**The UI does not live inside `api/dashboard.js`.** That file is a single
~19,000-line template literal where every backtick and `${` must be escaped —
its own comment at line 16414 warns about this. Several thousand lines of AI
CSS and JS in there would be hostile to edit and hazardous to review. These
modules return plain strings and splice in at five points.

## 4. Wiring checklist

Ordered so each step is independently verifiable.

- [x] **1. Mount the UI.** Five interpolations in `api/dashboard.js` (see
      `api/_ai/ui/index.js` header). Switcher, sidebar, landing, conversation
      view, Images panel and Projects panel all render. Verified round-trip:
      CRM → AI → CRM restores the CRM exactly, and the AI selection survives a
      reload.
- [ ] **2. Mascot assets.** Six `.webp` files at `/ai/falcon-{idle,thinking,generating,video,success,error}.webp`.
      Add a `public/ai/` rewrite in `vercel.json`. CSS handles the motion —
      the assets are stills. **Blocked on the assets**: only the idle render
      exists. Until then the mascot hides itself rather than showing a broken
      image, and a missing state falls back to idle without re-requesting the 404.
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

## 6. Decisions taken since the scaffold

| Decision | Choice | Why |
|---|---|---|
| Scope | Everything except video | Video is the only net-new provider integration and the only real per-unit cost. |
| Language | Follows the user's setting via `api/_lang.js` | UI chrome hand-translated for nl/fr/en/de, English fallback for the other 36. Quick-action *prompts* stay in one language — the reply language comes from `_lang`'s directive, so translating prompts 40 ways would buy nothing. |
| Theme | Inherits the CRM's `[data-theme]` | Both palettes are tokens; switching workspace never changes the user's theme. |
| Icons | **Colour-coded per quick action** (revised) | Initially monochrome; colour was requested. Implemented as one hue per action rather than a decorative wash, so the colour carries information. Scoped to the nine 30px icon chips only — every other icon in the workspace stays monochrome. Recorded as a third deviation in `DESIGN-SYSTEM.md`. |

### Changes made against the approved design, and why

- **Mascot smaller** (72px vs ~170px). Requirement 4 says "subtle and relatively
  small", requirement 11 says "not childish". At the mockup's scale it
  out-competed the input, which is meant to be the page's focus.
- **Switcher active state strengthened.** The mockup's was too quiet to read as
  selected at a glance, and this control carries requirement 18's whole claim
  that there are two co-equal workspaces.
- **Switcher centred on the topbar, not the viewport.** Viewport-centring reads
  visibly left of the content's midpoint because the sidebar holds the left edge.
- **Quick-action icons are colour-coded**, against my initial recommendation and
  at your request. Done properly rather than grudgingly: muted mid-tones tuned to
  sit beside sand, no purple, per-action so the hue means something, separately
  darkened for light mode, and asserted at 3:1 by `scripts/ai-check.js`.
- **Send button glyph is `--on-accent` (dark).** The mockup's pale arrow on
  champagne would not have met contrast, and it is the one control that must
  always be findable.
- **Settings added to the sidebar.** The mockup omitted it; requirement 3 lists it.
- **`Recent AI activity` kept** — it was the design's best addition, and it gives
  the workspace a reason to return to even with no question in mind.
- **CRM page controls hide in AI.** Refresh / CSV-export / last-updated belong to
  the CRM dashboard page and were bleeding into the AI topbar.
- **Below 480px the page title is dropped**, not the switcher. `dashboard.js`'s
  own mobile CSS notes it fought to keep the topbar off 137px; the switcher
  already names the workspace, so the title was the redundant half.

## 7. What still does not happen

- No model is called (`AI_PROVIDER=demo` is scripted; `claude`/`openai` throw `not_wired`).
- No database table is created or written.
- No key is read at import time.
- No money is spent.
- `vercel.json` is untouched.
- No dependency was added to `package.json`.
- `api/dashboard.js` is touched in exactly six places: one `require`, one
  language binding, and the four markup/CSS/JS mount points.

## 8. Known issue, pre-existing

In **light theme the topbar page title is low-contrast** — pale sand on cream.
This is `.gradient-text` in `api/dashboard.js:451`, which resolves to
`color: var(--accent)` in both themes, and it affects every CRM page title
("Dashboard", "Pipeline", …) exactly as much as it affects "Helvaro AI". It
predates this work and I have not touched it, because the fix changes the CRM's
appearance on every page and that was not in scope. Worth fixing separately —
it is a one-line token change.

## 9. Local development

`scripts/ai-dev.js` serves the real dashboard HTML and routes `/api/ai` to the
real handler with a fixed local tenant. Everything in the request path is
production code — same orchestrator, same tool registry, same SSE framing, same
confirmation gate. Three substitutions, each an env var production does not set:

| Var | Effect |
|---|---|
| `AI_PROVIDER=demo` | `api/_ai/providers/demo.js` — scripted responses, real tool calls |
| `AI_DEMO_MODE=1` | `api/_ai/fixtures.js` — sample Belgian leads instead of Airtable |
| `AI_WORKSPACE_ENABLED=1` | the feature flag |

The demo provider does **not** fake tool results: it emits genuine `tool_call`
events, the orchestrator runs the real tool, and the real result comes back. It
is also the third implementation of the provider contract, and the one
structurally unlike the other two — a generator over a local array rather than
HTTP+SSE. That it fits unchanged is the evidence the contract describes a
capability rather than a vendor's shape.

`scripts/ai-check.js` catches the two failure modes this architecture creates
that `node --check api/dashboard.js` cannot see: a stray backtick or `${...}` in
a generated string, and a syntax error in the generated client script — which
kills the entire inline `<script>`, CRM included. Both happened during
development. Run it before any commit touching `api/_ai/ui/`.
