# AutoScout24 (official API): data mapping

Listing fields as defined in the spec (schema `Listing`), mapped to the internal vehicle shape:

| Internal | Spec field | Notes |
|---|---|---|
| `bronId`, `autoscout` | `id` (guid) | lower-cased. The same value is used by the seller-profile reader, so the same car on both providers is one vehicle. |
| `merk` | `make` (integer) | name via `GET /makes` |
| `model` | `model` (integer) | name via `GET /makes`; falls back to `modelName` (string, for commercial vehicles etc.) |
| `uitvoering` | `modelVersion` | |
| `prijs` | `prices.public.price` | gross price, integer |
| `km` | `mileage` | only if `mileageUnit` is km or absent |
| `inschrijving` | `firstRegistrationDate` | `YYYY-MM` |
| `brandstof` | `fuelCategory` | reference type `FuelCategory`, lower-cased, localised (nl-BE) |
| `transmissie` | `transmission` | reference type `Transmission` |
| `kw` | `power` | kW per the spec |
| `carrosserie` | `bodyType` | reference type `BodyType` |
| `kleur` | `bodyColorName`, else `bodyColor` | `BodyColor` reference |
| `fotos` | `images[].previewUrl` | https only, at most 20 |
| `vin` | `vin` | only a valid 17 character VIN |
| `omschrijving` | `description` | |
| `status` | `publication.status` | `Active` or absent: `beschikbaar`; `Inactive`: `uit aanbod` (not on AutoScout24; not sold) |
| `link` | none | The `Listing` schema has no listing address. None is invented. |

Reservations: AutoScout24 knows no "reserved", so `kentReservering` is false and a reservation set in Helvaro is never reverted.
Marketplace and culture for the reference lists are fixed to `be` / `nl-BE` (Helvaro serves Belgian dealers); see LIMITATIONS.
