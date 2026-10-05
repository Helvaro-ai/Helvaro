# AutoScout24 (seller profile): data mapping

Listing JSON path to Helvaro field:

| Helvaro field | Listing path |
|---|---|
| Source Record ID, AutoScout ID | `id` (lower case) |
| Make / Model | `vehicle.make`, `vehicle.model` |
| Variant | `vehicle.modelVersionInput` |
| Price | `prices.public.priceRaw` |
| Mileage | `vehicle.mileageInKm.raw` |
| Registration | `vehicle.firstRegistrationDate.formatted` |
| Fuel / Transmission / Body | `vehicle.fuelCategory`, `transmissionType`, `bodyType` `.formatted` |
| Power KW | `vehicle.powerInKw.raw` |
| Photo URLs | `images` (larger size, autoscout24 image host only) |
| Listing URL | `url` (made absolute) |

Status is always "beschikbaar": present means for sale, gone means sold (with the normal safeguards). No VIN is available on this page.
