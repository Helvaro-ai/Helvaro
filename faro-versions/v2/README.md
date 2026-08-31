# Faro v2

**Versie:** v2
**Datum:** 2026-08-18
**Aantal commits:** 13

## Waarom deze versie er is

Eigen pagina, echt CRM, en handelen na bevestiging

De grootste sprong. Faro werd van een overlay een eigen pagina, ging de ECHTE leads lezen in plaats van voorbeelddata, en mocht voor het eerst iets DOEN — sturen en inplannen — maar alleen na een bevestiging van de gebruiker.

## Gedragsveranderingen

Van alleen lezen naar lezen en handelen. Bevestigingen overleven een tweede klik. Gesprekken blijven bewaard over een herlaadbeurt.

## Bekende problemen bij oplevering

De bevestigingsvensters zeiden nog niet altijd WAT ze zouden doen; dat is later rechtgezet.

## Commits

Deze versie is afgeleid uit de echte geschiedenis; elke regel is op te zoeken
met `git show <hash>`.

| Commit | Datum | Onderwerp |
|---|---|---|
| `ae16120` | 2026-08-18 | Make Clerk auth survive a DNS-verified production instance |
| `97ff263` | 2026-08-18 | Correct the model: the AI books the appointment, the agent unblocks |
| `8b62a65` | 2026-08-18 | Recent activity: real thumbnails, real timestamps, a carousel that works |
| `727e9ce` | 2026-08-18 | One home page: Faro asks how it can help and says what happened |
| `517f3e0` | 2026-08-18 | Test the app, not the code: two customer-facing features had never worked |
| `51e6953` | 2026-08-18 | Command Center: the layer that answers "what should I do next" |
| `8cbdf08` | 2026-08-18 | Keep conversations across reloads, and catch two regexes the template ate |
| `bd56b98` | 2026-08-18 | Put every size, radius and spacing value on an enforced scale |
| `16b726f` | 2026-08-18 | Faro can now send and schedule, not just propose |
| `46babfa` | 2026-08-18 | Faro reads the real CRM, and confirmations survive a second instance |
| `45c736f` | 2026-08-18 | Faro is its own page, not an overlay |
| `51b8a2d` | 2026-08-18 | Faro: an orb that needs no asset, a named greeting, and visible tool steps |
| `06babf6` | 2026-08-18 | Fix everything the review agents found |

## Gewijzigde bestanden

```
api/_faro/actions.js
api/_faro/data.js
api/_faro/fixtures.js
api/_faro/handler.js
api/_faro/media.js
api/_faro/orchestrator.js
api/_faro/prompt.js
api/_faro/providers/demo.js
api/_faro/tools.js
api/_faro/ui/client.js
api/_faro/ui/i18n.js
api/_faro/ui/icons.js
api/_faro/ui/index.js
api/_faro/ui/markup.js
api/_faro/ui/styles.js
api/_faro/ui/tokens.js
api/faro.js
scripts/faro-check.js
scripts/faro-dev.js
tests/clerk-faro-route.test.js
```

## Teststatus

Vastgesteld op 2026-08-31 op de volledige suite, niet per historische versie —
de tests van toen zijn niet apart bewaard. Op het moment van archiveren:
**54 testbestanden groen, faro-check groen.** De Faro-specifieke bestanden zijn
`tests/faro-writes.test.js`, `tests/faro-sessies.test.js`,
`tests/faro-store-live.test.js`, `tests/clerk-faro-route.test.js` en
`tests/campagnes.test.js`.
