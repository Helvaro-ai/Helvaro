# AutoScout24 (official API)

Provider id: `autoscout24_api` · Status: **FEED_REQUIRED** · Auth: basic (per dealer account)

The official AutoScout24 Listing Creation API, <https://listing-creation.api.autoscout24.com/docs>. Helvaro stores the dealer's credentials (encrypted) but does not call the API yet.

**What it reads:** Nothing. `haal()` throws `activatie_vereist`, which shows as "waiting for activation". The sync skips this provider, so it raises no error every hour.

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/`. Overview of all providers: [../README.md](../README.md).
