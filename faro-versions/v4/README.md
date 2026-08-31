# Faro v4

**Versie:** v4
**Datum:** 2026-08-28
**Aantal commits:** 4

## Waarom deze versie er is

Mascotte, live saldo, en twee stille datafouten

Kleiner in omvang, belangrijk in gevolgen. Twee bugs die data stil onvolledig maakten: dbFetch riep zichzelf aan, en listMessages pagineerde niet — lange gesprekken werden dus afgekapt zonder dat iemand het zag.

## Gedragsveranderingen

Het creditsaldo loopt live mee. De mascotte kwam in gebruik. Een opgeheven VPS kan geen token meer weglekken en kost geen geld meer.

## Bekende problemen bij oplevering

Geen.

## Commits

Deze versie is afgeleid uit de echte geschiedenis; elke regel is op te zoeken
met `git show <hash>`.

| Commit | Datum | Onderwerp |
|---|---|---|
| `c68e8fa` | 2026-08-28 | feat: creditsaldo loopt live mee, en een Faro-icoon in de gesprekken |
| `65fdd69` | 2026-08-28 | feat: FARO-mascotte in gebruik, en het logo van de loginpagina zonder plaat |
| `36ce1ae` | 2026-08-28 | fix: opgeheven VPS kan het token niet meer weglekken, en kost geen geld meer |
| `9e6aeca` | 2026-08-28 | fix: Faro-gesprekken — dbFetch riep zichzelf aan, listMessages paginéérde niet |

## Gewijzigde bestanden

```
api/_faro/store.js
api/_faro/ui/client.js
api/_faro/ui/markup.js
api/_faro/ui/styles.js
public/faro/falcon-error.webp
public/faro/falcon-generating.webp
public/faro/falcon-idle.webp
public/faro/falcon-success.webp
public/faro/falcon-thinking.webp
public/faro/falcon-video.webp
public/faro/faro-icon.webp
tests/faro-sessies.test.js
```

## Teststatus

Vastgesteld op 2026-08-31 op de volledige suite, niet per historische versie —
de tests van toen zijn niet apart bewaard. Op het moment van archiveren:
**54 testbestanden groen, faro-check groen.** De Faro-specifieke bestanden zijn
`tests/faro-writes.test.js`, `tests/faro-sessies.test.js`,
`tests/faro-store-live.test.js`, `tests/clerk-faro-route.test.js` en
`tests/campagnes.test.js`.
