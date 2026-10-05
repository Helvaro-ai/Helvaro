# AutoScout24 (official API)

Provider id: `autoscout24_api` · Status: **FEED_REQUIRED** until Helvaro has its data-provider credentials on the server, then **BETA** · Auth: `customer_id` (the dealer enters only their AutoScout24 customer ID)

The official AutoScout24 Listing Creation API, <https://listing-creation.api.autoscout24.com/docs>. Helvaro reads the dealer's own listings with it.

**Who logs in:** Helvaro, as an AutoScout24 *data provider*. The Basic Auth credentials are per data provider, not per dealer (AutoScout24: "The credentials are per data provider and not per dealer"). They live in the server environment (`AS24_API_USER`, `AS24_API_PASSWORD`) and never reach a screen, a stored source or a log. The dealer authorises Helvaro inside AutoScout24 and gives Helvaro their `customerId`; that number is all the dealer stores.

**Without those two variables** the card says it is waiting for Helvaro's activation with AutoScout24, the customer ID can be saved, `haal()` throws `activatie_vereist` before any request is made, and the sync skips the provider (no error every hour).

**What it reads:** the listing summaries, then every listing in full, plus the make and reference lists to turn ids into names. See [API](API.md) and [DATA_MAPPING](DATA_MAPPING.md).

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/autoscout24-api.js`, `http.js`. Overview of all providers: [../README.md](../README.md).
