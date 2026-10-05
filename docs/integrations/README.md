# Automotive integrations

How a dealer's stock gets into Helvaro from more than one place, and what is honestly possible per platform. Phase 1 of the multi-provider layer: it can **read** stock from a feed, an AutoScout24 seller profile and a Gocar.be export. Two official APIs are prepared but wait for activation. Nothing is published to any platform yet.

| Platform | Provider id | Status | Auth |
|---|---|---|---|
| [Feed / dealer website](feed/README.md) | `feed` | ACTIVE | feed_url |
| [AutoScout24 (seller profile)](autoscout24/README.md) | `autoscout24` | BETA | feed_url |
| [AutoScout24 (official API)](autoscout24_api/README.md) | `autoscout24_api` | FEED_REQUIRED | basic |
| [mobile.de](mobile_de/README.md) | `mobile_de` | FEED_REQUIRED | basic |
| [2dehands](tweedehands/README.md) | `tweedehands` | COMING_SOON | partner |
| [Marktplaats](marktplaats/README.md) | `marktplaats` | COMING_SOON | partner |
| [Vroom.be](vroom/README.md) | `vroom` | COMING_SOON | partner |
| [Gocar.be](gocar/README.md) | `gocar` | MANUAL | csv |
| [Meta (Facebook / Instagram)](meta/README.md) | `meta` | COMING_SOON | partner |
| [heycar](heycar/README.md) | `heycar` | DISABLED | none |

Status meaning: ACTIVE and BETA and MANUAL synchronise. FEED_REQUIRED stores encrypted credentials and waits for activation (nothing is read). COMING_SOON and DISABLED can not be saved and never sync.

Out of scope: **Car-Pass** offers garage web services for accredited businesses; it is not a marketplace and not a stock source.

## How it fits together

- **Providers** (`api/_voorraad-providers/`): one file per platform behind one contract (id, label, status, auth, capabilities, `haal`, `health`, `normaliseerFout`). `api/_inventaris.js` knows no platform.
- **Several sources per dealer**: `Inventory Source` is `{ bronnen: [...], bewaarDagen }`. The old single object reads as a list of one. One source per platform.
- **Listings** (`vehicle_listings`, `api/_listings.js`): one row per platform and advertisement id, key `projectCode|provider|externalId`, linked to one internal vehicle.
- **Matching across platforms** is exact only: the AutoScout number, the normalised listing URL, or a valid VIN. Never make, model or price. No match means a new vehicle. A VIN that fits two vehicles merges nothing and is reported.
- **Sold** only when every source that showed a vehicle was read successfully in this run and none shows it any more. A source that failed is unknown: nothing changes. The mass-drop guard works per source.
- **Retention**: sold vehicles stay visible for `bewaarDagen` (default 14, 1 to 365 per dealer), then are archived, never deleted.
- **Errors** are normalised to AUTH_ERROR, RATE_LIMIT, PROVIDER_DOWN, INVALID_DATA, MISSING_FIELD, DUPLICATE_VEHICLE, PERMISSION_DENIED, SYNC_TIMEOUT, UNKNOWN_ERROR. The dealer sees a sentence in their language; the technical text stays in the log.
- **Credentials** are encrypted (AES-256-GCM) and never returned by any endpoint.

Adding a platform: a file in `api/_voorraad-providers/`, a line in its `index.js`, translations for its name if needed. Nothing else changes.
