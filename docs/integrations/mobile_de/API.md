# mobile.de: API

Base URL `https://services.mobile.de` (sandbox: `https://services.sandbox.mobile.de`). Required header `Accept: application/vnd.de.mobile.api+json`.

| Call | Used for |
|---|---|
| `GET /seller-api/sellers` | `{ "sellers": [ { mobileSellerId, customerNumber, companyName, ... } ] }`. Used when the dealer did not enter a seller ID: exactly one seller is used; none or several stops the run with a clear message. Also `health()`. |
| `GET /seller-api/sellers/{mobileSellerId}/ads` | `{ "ads": [ ... ] }`. The documentation says the result contains all ad details, no extra call per ad needed. |

**Pagination:** none is documented for the ads list; the response is the whole list. If mobile.de ever adds paging, a partial answer would look like a short list. The mass-drop guard (more than half of the platform's active cars missing, 5 or more) stops the sync from selling them.

Time-out 30 seconds per request; 429 and 5xx (not 503) are retried like the AutoScout24 reader. Calls go through an injectable `fetch`.
