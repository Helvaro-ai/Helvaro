# Faro v3

**Versie:** v3
**Datum:** 2026-08-19 t/m 2026-08-22
**Aantal commits:** 24

## Waarom deze versie er is

Eerlijke credits, blijvende gesprekken, Nederlands

De week waarin Faro betrouwbaar werd in plaats van indrukwekkend. Credits gingen van een vast tarief naar wat een antwoord echt kost. Faro ging Nederlands praten tegen Nederlandse gebruikers. Vijf getallen die zelfverzekerd fout waren zijn rechtgezet.

## Gedragsveranderingen

Kosten per antwoord in plaats van per gesprek. Gesprekken in Airtable. Afspraken verzetten en afzeggen vanuit de chat. Prijsadvies uit de eigen leads, met de grens er hard in.

## Bekende problemen bij oplevering

De VPS waar de opslag op zou draaien bestond niet; dat is toen eerlijk gemaakt in plaats van weggemoffeld.

## Commits

Deze versie is afgeleid uit de echte geschiedenis; elke regel is op te zoeken
met `git show <hash>`.

| Commit | Datum | Onderwerp |
|---|---|---|
| `61a4335` | 2026-08-19 | Geen 404 meer bij elk bezoek, en een eerlijke dev-server |
| `d483c9f` | 2026-08-19 | Videopijplijn gebouwd, standaard weg van Sora |
| `7e14afa` | 2026-08-19 | Afspraken verzetten en afzeggen vanuit de chat |
| `2dc8ed6` | 2026-08-19 | Faro kan het CRM ook wijzigen, niet alleen lezen |
| `59842c0` | 2026-08-19 | Prijsadvies uit de eigen leads, met de grens er hard in |
| `35fbf8b` | 2026-08-19 | CRM en AI worden twee modi met een schakelaar in de zijbalk |
| `1440369` | 2026-08-19 | Videolengtes uit de modelregistry in plaats van uit literals |
| `3031080` | 2026-08-19 | Faro is charged on what it actually costs, not a flat rate |
| `0f293c2` | 2026-08-19 | Credits: price video before it is wired, and stop losing concurrent charges |
| `be03d36` | 2026-08-19 | Headings, a skip link, visible focus, and the focus-return bug behind them |
| `e3f48dd` | 2026-08-19 | Attachments can be removed, and rejected files say why |
| `e0bbba9` | 2026-08-19 | Faro speaks Dutch to Dutch users, and its gates say what they will do |
| `e5333ab` | 2026-08-19 | Faro writes conversations down, and you can stop a running answer |
| `508285e` | 2026-08-19 | Faro's two Airtable tables exist; marketing stays parked |
| `485c739` | 2026-08-19 | There is no VPS: say so, and stop depending on one |
| `18d790f` | 2026-08-19 | Faro can hold a conversation instead of answering exactly once |
| `a21c131` | 2026-08-19 | Phase 5 — five numbers that were confidently wrong |
| `571a20f` | 2026-08-20 | Panden: de AI weet nu over welke woning een lead het heeft |
| `21103c4` | 2026-08-20 | Founder-tools via de router, WhatsApp-prompt op zijn eigen plek |
| `9fe8b73` | 2026-08-21 | Drie dingen uit een klikronde over alle pagina's |
| `9cc860d` | 2026-08-22 | Campagnes doen nu het werk dat zonder Meta-goedkeuring kan (#16) |
| `6bde396` | 2026-08-22 | Campagnes doen nu het werk dat zonder Meta-goedkeuring kan |
| `2960e41` | 2026-08-22 | De lead kan zelf afzeggen, en afzeggen doet nu alles (#9) |
| `fb21606` | 2026-08-22 | Video werkt: de AI maakt hem, en een mislukte kost niets (#6) |

## Gewijzigde bestanden

```
api/_campagnes.js
api/_faro/actions.js
api/_faro/data.js
api/_faro/handler.js
api/_faro/media.js
api/_faro/orchestrator.js
api/_faro/pricing.js
api/_faro/prompt.js
api/_faro/store.js
api/_faro/tools.js
api/_faro/ui/client.js
api/_faro/ui/i18n.js
api/_faro/ui/markup.js
api/_faro/ui/quick-actions.js
api/_faro/ui/styles.js
api/_faro/writes.js
scripts/faro-check.js
scripts/faro-dev.js
tests/campagnes.test.js
tests/faro-store-live.test.js
tests/faro-writes.test.js
```

## Teststatus

Vastgesteld op 2026-08-31 op de volledige suite, niet per historische versie —
de tests van toen zijn niet apart bewaard. Op het moment van archiveren:
**54 testbestanden groen, faro-check groen.** De Faro-specifieke bestanden zijn
`tests/faro-writes.test.js`, `tests/faro-sessies.test.js`,
`tests/faro-store-live.test.js`, `tests/clerk-faro-route.test.js` en
`tests/campagnes.test.js`.
