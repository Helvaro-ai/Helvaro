# Gocar.be

Provider id: `gocar` · Status: **MANUAL** · Auth: csv (an export address or an uploaded file, no credentials)

No public dealer integration was found. If the dealer has an export of their Gocar.be stock, it goes through the same path as a generic feed: either at an https address, or as a **file the dealer uploads** in the Gocar.be card.

**What it reads:** the export at the address the dealer gives, like provider Feed, or the uploaded file (CSV, JSON or XML, same columns, up to 2 MB). Status MANUAL means: no API, the dealer supplies the export.

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/`. Overview of all providers: [../README.md](../README.md).
