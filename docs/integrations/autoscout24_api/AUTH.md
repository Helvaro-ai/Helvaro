# AutoScout24 (official API): authentication

Verified in `authentication_authorization.md` of the official documentation:

- The API uses HTTP Basic Auth. The credentials are **per data provider and not per dealer**, so one set works for every dealer the provider represents. New credentials are created by AutoScout24 on request.
- The API is designed from the dealer's point of view: each dealer configures which data provider may operate in their name, then tells that provider their internal AutoScout24 identifier, the `customerId`.

What that means for Helvaro:

1. **Helvaro must register as an AutoScout24 data provider** (contact: daten@autoscout24.de, per the spec) and receives one set of credentials. They are set as `AS24_API_USER` and `AS24_API_PASSWORD` on the server. The username is the e-mail address registered with AutoScout24 (FAQ).
2. **The dealer authorises Helvaro** in AutoScout24 and enters their `customerId` in Settings, Integrations.
3. Helvaro never asks a dealer for an AutoScout24 login, and the Basic header is built in memory per request.

Error mapping: 401 `AUTH_ERROR` (Helvaro's own credentials were refused: shown as a Helvaro problem, not "check your password"), 403 `PERMISSION_DENIED` (the dealer has not authorised Helvaro, or the customer ID is wrong), 404 `INVALID_DATA` (unknown customer), 429 `RATE_LIMIT`, 5xx and 503 `PROVIDER_DOWN`, time-out `SYNC_TIMEOUT`.

## Tenant safety: the customer ID is not a secret

Helvaro's one set of credentials works for **every** customer ID that has authorised Helvaro. A customer ID is not a secret, and AutoScout24 only tells Helvaro that the ID authorised Helvaro, not which Helvaro dealer owns it. Without a guard, dealer A could type dealer B's ID and read B's stock into A's account.

What the code does about it:

- A customer ID can be linked to **one Helvaro dealer only**. Saving an ID that another dealer already has is refused (`klantnummer_bezet`). The check fails closed: if it can not run, nothing is saved.
- The ID is only ever used as a path segment after validation (`^[A-Za-z0-9_-]{1,40}$`), and nothing the dealer enters can change the host or the credentials.

What it does **not** do (open decision): it can not prove that the person typing an unclaimed ID is that AutoScout24 customer (first claim wins). The spec's `GET /customers` returns the company name behind each ID; showing it on the card and having Helvaro confirm it against the dealer's own company before the first sync would close this. Until then, treat a new AutoScout24 (API) connection as needing a human check.
