# Feed / dealer website

Provider id: `feed` · Status: **ACTIVE** · Auth: feed_url (no credentials)

A CSV, JSON or XML export of the dealer's stock at an https address. This is also how a dealer website or a DMS is connected: most of them can publish such an export.

**What it reads:** Reads the file, never writes. One request per sync (hourly via cron, plus the "Sync now" button).

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/`. Overview of all providers: [../README.md](../README.md).
