# mobile.de: authentication

From the official Seller API documentation:

- HTTP Basic Auth. The credentials of an API user are unique to that API user and do not depend on sellers or ads.
- A dealer who only wants to serve **their own account** (a "Self-Uploading Dealer") needs no separate Seller API account. They request the Seller API activation by e-mail to `service@team.mobile.de` with their mobile.de customer number and company name, and receive instructions for the access credentials.
- A technical service provider (TSP) with its own API account can serve several dealers; for more than ten customers mobile.de asks for company details. Helvaro does **not** rely on that route here: each dealer brings their own credentials.

**Unverified:** the documentation text does not mention the "Dealer Area" as the place where these credentials are issued (it does for related features such as the self-upload account). It says Customer Support provides the credentials during activation. The setup text therefore points to the activation e-mail, not to a screen.

Helvaro stores username and password encrypted (AES-256-GCM, same key handling as the Google tokens). They are never returned by any endpoint; the card only says "saved".

Error mapping: 401 `AUTH_ERROR`, 403 `PERMISSION_DENIED`, 404 `PERMISSION_DENIED` (documented: the seller is not linked to this API account), other 4xx `INVALID_DATA`, 5xx `PROVIDER_DOWN`, time-out `SYNC_TIMEOUT`. 429 is not documented for this API; it is mapped to `RATE_LIMIT` anyway.
