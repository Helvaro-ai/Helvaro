# Feed / dealer website: data mapping

| Helvaro field | Feed column / key (case and punctuation ignored) |
|---|---|
| Source Record ID (required) | id, vehicleid, stocknumber, stock, voorraadnummer, reference, ref, guid, listingid, vin |
| Make (required) | make, merk, brand, marque, marke, manufacturer |
| Model | model, modele, modell |
| Variant | variant, version, uitvoering, trim, type |
| Price | price, prijs, prix, preis, saleprice |
| Mileage | mileage, km, kilometerstand, kilometrage, odometer |
| Registration | registration, firstregistration, year, bouwjaar, erstzulassung |
| Fuel / Transmission / Power KW / Body / Color | fuel, transmission, powerkw, body, color (plus Dutch, French, German names) |
| Listing URL | url, link, listingurl, detailurl |
| Photo URLs | images, photos, photourls, pictures, fotos |
| Status | status, availability, state (available, reserved, sold; unknown values become "onbekend") |
| Description | description, omschrijving, remarks |
| VIN | vin, chassisnumber, chassisnr, fahrgestellnummer (only a valid 17 character VIN is kept) |
| AutoScout ID | autoscoutid, autoscout_id, as24id |

A row without an id, or without a make, is counted as invalid and skipped. A feed with no usable rows at all is an error (INVALID_DATA), never "everything sold".
