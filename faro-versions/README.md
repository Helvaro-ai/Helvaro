# Faro — versiearchief

Wat hier staat, en wat bewust NIET.

Dit archief is afgeleid uit de ECHTE git-geschiedenis van `api/_faro/` en
`api/faro.js` — 50 commits tussen 17 en 31 augustus 2026. Elke versie hieronder
verwijst naar commits die je zelf kunt opzoeken. Er staan geen verzonnen
versies in: waar geen commits waren, is geen versie.

De grenzen tussen versies liggen op de dagen waarop Faro echt van karakter
veranderde, niet op ronde getallen. Twee dagen met samen dertig commits (18 en
19 augustus) zijn daarom twee versies, en de week zonder Faro-werk (23-27
augustus) is er geen.

| Versie | Datum | Waar het over ging |
|---|---|---|
| [v1](v1/README.md) | 2026-08-17 | Faro wordt een echte assistent in plaats van een idee |
| [v2](v2/README.md) | 2026-08-18 | Eigen pagina, echt CRM, en handelen na bevestiging |
| [v3](v3/README.md) | 2026-08-19 — 2026-08-22 | Eerlijke credits, blijvende gesprekken, Nederlands |
| [v4](v4/README.md) | 2026-08-28 | Mascotte, live saldo, en twee stille datafouten |
| [v5](v5/README.md) | 2026-08-31 | Campagnes, advertentieteksten en de huisstijl |

## Hoe je dit zelf nakijkt

```bash
git log --all --date=short --pretty="%h|%ad|%s" -- api/_faro api/faro.js
```

Dat is precies de lijst waaruit dit archief is opgebouwd.

## Wat Faro vandaag kan

27 gereedschappen. Lezen: leads, panden, gesprekken, pipeline, cijfers, agenda,
prijsadvies, huisstijl. Handelen (altijd na bevestiging): leadstatus, notities,
afspraken verzetten en afzeggen, opvolging, campagnes. Maken: pandteksten,
advertentieteksten, beelden.

Wat Faro NIET kan, en waarom het er niet is: campagnes VERSTUREN. Dat vraagt een
goedgekeurde WhatsApp-template bij Meta, en die goedkeuring ligt buiten deze
codebase. Alles eromheen staat wel klaar.
