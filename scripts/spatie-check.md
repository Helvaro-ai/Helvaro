# Spatiecontrole — tekst die uit zijn blok loopt of over andere tekst valt

Draai de ontwikkelserver (`node scripts/faro-dev.js`) en laad het script in de
console van het dashboard:

```js
var s=document.createElement('script'); s.src='/dev-scripts/spatie-check.js';
document.head.appendChild(s);
// daarna:
spatieVeeg()
```

Plakken kan ook, maar laden is beter: dan draai je gegarandeerd het bestand dat
in de repo staat en niet een oudere kopie uit je klembord. (`eval()` werkt niet
-- de CSP van het dashboard staat `unsafe-eval` niet toe, en dat hoort zo.) Hij loopt alle veertien pagina's af en meldt twee dingen:

* **buiten** — tekst die rechts buiten zijn eigen blok steekt
* **overlap** — twee stukken tekst die elkaar voor meer dan 15% bedekken

## Waarom dit geen gewone test is

Er is geen layout zonder browser. De 101 tests in `tests/` draaien op kale
Node en kunnen dus niet zien waar tekst terechtkomt. Dit is het gereedschap
dat dat wel kan, en het hoort met de hand gedraaid te worden voor een release.

## Vier manieren waarop een rechthoek liegt

Elk van deze heeft hier een vals alarm opgeleverd voordat de meter klopte.
Ze staan er zodat de volgende persoon ze niet opnieuw hoeft te ontdekken:

1. **`scrollWidth` op een flexbox.** Meldde tien telefoonnummers als
   "loopt over"; met een Range gemeten eindigden ze 61px BINNEN hun cel.
2. **`getBoundingClientRect` in een geschaald venster.** Gaf 41,8px voor een
   knop die in CSS 44px is. Voor CSS-maten is `getComputedStyle` de waarheid.
3. **Een dichte `<details>`.** De inhoud heeft nog steeds een doos. Acht
   installatiegidsen en één "meer opties"-blok leverden zo 331 overlappingen
   op die op het scherm niet bestonden.
4. **`text-overflow: ellipsis`.** De Range geeft de VOLLEDIGE tekst terug, ook
   het afgekapte deel. Een keurig ingekorte URL "overlapte" zo de knop ernaast.

De meter snijdt Range-rechthoeken daarom bij tot elke afknippende voorouder.

## En animaties

Staat het browservenster verborgen (bijvoorbeeld in een geautomatiseerde
sessie), dan lopen CSS-animaties niet. Alles wat met `opacity: 0` begint blijft
daar staan en meet als onzichtbaar — 206 tekstnodes werden er 0, en de meter
meldde vrolijk "geen enkel probleem" over een scherm dat hij niet gemeten had.
`spatieVeeg()` zet daarom eerst alle animaties uit.

## Laatste uitkomst

2026-09-07, na de marktwissel-fix, gedraaid vanuit dit bestand:

| breedte | stukken tekst | buiten blok | overlap |
|---------|---------------|-------------|---------|
| 1440    | 883           | 0           | 0       |
|  768    | 640           | 0           | 0       |
|  390    | 742           | 0           | 0       |

Gifproef op dezelfde meter: 240 overlappingen zodra er met de hand een label
overheen gelegd wordt, en 0 zodra dat weer weg is. Een meter die nul meldt
zonder dat je hebt gezien dat hij ook iets KAN melden, zegt niets.
