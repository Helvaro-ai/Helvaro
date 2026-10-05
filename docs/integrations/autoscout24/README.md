# AutoScout24 (seller profile)

Provider id: `autoscout24` · Status: **BETA** · Auth: feed_url (the public seller profile address, no credentials)

Reads the dealer's own public AutoScout24 seller profile page. This is not an API and it is the only integration in this folder that reads a web page. It is live for one real dealer. No new page reading is added by the multi-provider work.

**What it reads:** Reads the page `https://www.autoscout24.<tld>/<lang>/verkopers/<name>` (and the equivalent dealer path in other languages), 20 listings per page.

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/`. Overview of all providers: [../README.md](../README.md).
