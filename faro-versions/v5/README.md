# Faro v5

**Versie:** v5
**Datum:** 2026-08-31
**Aantal commits:** 3

## Waarom deze versie er is

Campagnes, advertentieteksten en de huisstijl

Faro ging doen wat de website belooft. Campagnes kon hij al aanmaken maar niet SCHRIJVEN — geen naam, geen tekst. Advertentieteksten voor Meta en Google bestonden helemaal niet. En hij kende de huisstijl van het kantoor niet: die was alleen te overschrijven, niet te lezen.

## Gedragsveranderingen

create_campaign kreeg naam en tekst; naam werd verplicht en het pand optioneel. write_ad_copy erbij, met de echte tekenlimieten van Meta en Google. get_brand_voice erbij, en de huisstijl gaat nu bij elke beurt mee in de context.

## Bekende problemen bij oplevering

Campagnes VERSTUREN kan nog steeds niet: dat vraagt een goedgekeurde WhatsApp-template bij Meta.

## Commits

Deze versie is afgeleid uit de echte geschiedenis; elke regel is op te zoeken
met `git show <hash>`.

| Commit | Datum | Onderwerp |
|---|---|---|
| `105ff65` | 2026-08-31 | fix: Faro deed serververzoeken op het inlogscherm (152x 401 in de logs) |
| `e7d844a` | 2026-08-31 | feat: Faro schrijft advertentieteksten en kent de huisstijl van het kantoor |
| `4702617` | 2026-08-31 | feat: Faro kan de campagne zelf schrijven, niet alleen aanmelden dat er een is |

## Gewijzigde bestanden

```
api/_faro/actions.js
api/_faro/prompt.js
api/_faro/tools.js
api/_faro/ui/client.js
api/_faro/writes.js
tests/campagnes.test.js
tests/faro-writes.test.js
```

## Teststatus

Vastgesteld op 2026-08-31 op de volledige suite, niet per historische versie —
de tests van toen zijn niet apart bewaard. Op het moment van archiveren:
**54 testbestanden groen, faro-check groen.** De Faro-specifieke bestanden zijn
`tests/faro-writes.test.js`, `tests/faro-sessies.test.js`,
`tests/faro-store-live.test.js`, `tests/clerk-faro-route.test.js` en
`tests/campagnes.test.js`.
