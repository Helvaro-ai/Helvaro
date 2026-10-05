# mobile.de

Provider id: `mobile_de` · Status: **FEED_REQUIRED** · Auth: basic (credentials from the Dealer Area)

The mobile.de Seller API and Search API, <https://services.mobile.de/docs/seller-api.html>. A dealer account can read its own ads; credentials come from the Dealer Area. Helvaro stores them (encrypted) but does not call the API yet.

**What it reads:** Nothing. `haal()` throws `activatie_vereist`; the sync skips this provider.

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/`. Overview of all providers: [../README.md](../README.md).
