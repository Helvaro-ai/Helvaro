# Feed / dealer website: API

There is no vendor API. The contract is the file format:

- CSV: delimiter detected (`;`, tab or `,`), first row is the header, quotes supported.
- JSON: an array, or an array under one of `vehicles`, `items`, `data`, `listings`, `results`, `cars`, `voertuigen`, `ads`.
- XML: repeated elements named `vehicle`, `car`, `item`, `ad`, `listing`, `voertuig` or `auto` with child tags. No DTD or entity expansion.

Format is auto-detected unless set.
