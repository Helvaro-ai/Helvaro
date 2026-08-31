# Faro v1

**Versie:** v1
**Datum:** 2026-08-17
**Aantal commits:** 7

## Waarom deze versie er is

Faro wordt een assistent in plaats van een idee

Faro bestond als scherm maar deed niets echts. Deze dag kreeg hij een provider (Claude), een plek in de app (de docked ask bar) en zijn eerste eigen taak: beeldgeneratie, weggehaald bij het CRM en in Faro gezet.

## Gedragsveranderingen

De chat kost vanaf nu credits. Beeldgeneratie verhuisde van een eigen pagina naar het gesprek.

## Bekende problemen bij oplevering

Nog geen gespreksgeheugen: elke vraag stond op zichzelf.

## Commits

Deze versie is afgeleid uit de echte geschiedenis; elke regel is op te zoeken
met `git show <hash>`.

| Commit | Datum | Onderwerp |
|---|---|---|
| `138c430` | 2026-08-17 | Let the client customise inside the engine: palette, vibe, materials, more |
| `233fb65` | 2026-08-17 | Hardcode the transformation engine; meter chat; close Faro's scope |
| `6e0d3bc` | 2026-08-17 | Implement the Claude adapter; move Faro to a docked ask bar |
| `d1df531` | 2026-08-17 | Make image generation actually honour the request |
| `d18bf3d` | 2026-08-17 | Generate from the chat; Beelden and Video's become galleries |
| `870e97c` | 2026-08-17 | Move image generation into Faro; drop AI-beeld from the CRM sidebar |
| `37dc226` | 2026-08-17 | Rename to Faro; replace the workspace switcher with an overlay |

## Gewijzigde bestanden

```
api/_faro/actions.js
api/_faro/config.js
api/_faro/fixtures.js
api/_faro/handler.js
api/_faro/media.js
api/_faro/orchestrator.js
api/_faro/prompt.js
api/_faro/providers/claude.js
api/_faro/providers/demo.js
api/_faro/providers/index.js
api/_faro/providers/openai.js
api/_faro/schema.js
api/_faro/store.js
api/_faro/stream.js
api/_faro/tools.js
api/_faro/ui/client.js
api/_faro/ui/i18n.js
api/_faro/ui/icons.js
api/_faro/ui/index.js
api/_faro/ui/markup.js
api/_faro/ui/quick-actions.js
api/_faro/ui/styles.js
api/_faro/ui/tokens.js
api/faro.js
scripts/faro-check.js
scripts/faro-dev.js
```

## Teststatus

Vastgesteld op 2026-08-31 op de volledige suite, niet per historische versie —
de tests van toen zijn niet apart bewaard. Op het moment van archiveren:
**54 testbestanden groen, faro-check groen.** De Faro-specifieke bestanden zijn
`tests/faro-writes.test.js`, `tests/faro-sessies.test.js`,
`tests/faro-store-live.test.js`, `tests/clerk-faro-route.test.js` en
`tests/campagnes.test.js`.
