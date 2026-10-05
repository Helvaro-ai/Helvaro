# mobile.de

Provider id: `mobile_de` · Status: **BETA** · Auth: basic (the dealer's own Seller API credentials)

The mobile.de Seller API, <https://services.mobile.de/docs/seller-api.html>. Helvaro stores the dealer's API credentials (encrypted) and reads the dealer's own ads. Once credentials are saved it really synchronises.

**What it reads:** `GET /seller-api/sellers` (to find the seller if none was entered) and `GET /seller-api/sellers/{mobileSellerId}/ads` (all ads with full details in one response). Header `Accept: application/vnd.de.mobile.api+json`.

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/mobile-de.js`, `http.js`. Overview of all providers: [../README.md](../README.md).
