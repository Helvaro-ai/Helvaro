# AutoScout24 (official API): API

Base URL `https://listing-creation.api.autoscout24.com`. Source: the OpenAPI spec and the markdown guides of the official documentation. Only operations that spec lists are used.

| Call | Used for |
|---|---|
| `GET /customers/{customerId}/listings` | Listing summaries: `{ "listings": [ { id, createdAt, lastUpdatedAt, offerReferenceId, crossReferenceId, ... } ] }`. The spec defines **no pagination** for this call: one response is the whole list. |
| `GET /customers/{customerId}/listings/{listingId}` | The full listing (one request per listing). |
| `GET /makes?marketplace=be&culture=nl-BE` | Make and model ids to names. Makes missing there are fetched with `GET /makes?makeId=...`. |
| `GET /references?referenceType=FuelCategory&referenceType=Transmission&referenceType=BodyType&referenceType=BodyColor&marketplace=be&culture=nl-BE` | Fuel, transmission, body type and colour ids to names. |
| `GET /customers` | `health()`: is this customer ID among the customers Helvaro may operate on? |

Behaviour, following the documented guidance:

- A client time-out of 10 seconds per request (the documented recommendation).
- 429 and 5xx (not 503, which is planned maintenance) are retried up to three times after 100, 200 and 400 ms plus jitter. 4 listings are read at a time with a short pause, to stay clear of rate limiting.
- A time budget like the profile reader: out of time before every listing is read = the run fails (`SYNC_TIMEOUT`), nothing is changed.
- A listing that returns 404 between the list and the detail call was deleted meanwhile and is skipped. **Any other failure (including 500) fails the whole run**: the documentation warns not to assume a listing is gone after a 500.
- The reference lists are cached for six hours.
- Every call goes through an injectable `fetch`; tests use fixtures and never the network.
