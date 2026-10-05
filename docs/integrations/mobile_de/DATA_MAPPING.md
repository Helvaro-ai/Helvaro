# mobile.de: data mapping

Ad fields as documented (type `Ad`):

| Internal | Ad field | Notes |
|---|---|---|
| `bronId` | `mobileAdId` | |
| `merk` | `make` | string |
| `model` | `model` | string |
| `uitvoering` | `modelDescription` | also the ad title |
| `prijs` | `price.consumerPriceGross` | decimal string; `ON_REQUEST` prices (no amount) stay empty |
| `km` | `mileage` | km |
| `inschrijving` | `firstRegistration` | `yyyyMM` becomes `YYYY-MM` |
| `brandstof` | `fuel` | PETROL, DIESEL, ELECTRICITY, HYBRID, HYBRID_DIESEL, LPG, CNG, HYDROGENIUM, ETHANOL (the documented reference values); anything else stays empty |
| `transmissie` | `gearbox` | MANUAL_GEAR, AUTOMATIC_GEAR, SEMIAUTOMATIC_GEAR |
| `kw` | `power` | kW |
| `carrosserie` | `category` | as sent (for example `Cabrio`, `EstateCar`) |
| `kleur` | `manufacturerColorName`, else `exteriorColor` | |
| `fotos` | `images[].ref` | https only, at most 20 |
| `vin` | `vin` | valid 17 character VIN only |
| `omschrijving` | `description` | |
| `status` | `reserved` | `true` becomes `gereserveerd`, otherwise `beschikbaar` |
| `link` | none | The documented `Ad` has no address of the public ad page. None is invented. |

Cross-platform matching: an ad has no AutoScout number, so mobile.de matches other platforms through the **VIN** only.
`kentReservering` is false: a reservation set in Helvaro is not reverted by mobile.de; one set on mobile.de does come in.
