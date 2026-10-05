# AUTO1.com / wijkopenautos.be

Provider id: `auto1` · Status: **COMING_SOON** · Auth: partner · Capabilities: none (no read, no publish, no leads)

wijkopenautos.be is the Belgian consumer site of AUTO1 and **buys cars from private sellers**. For dealers, AUTO1.com Remarketing lets them **sell trade-ins B2B** through a partner API. It is a way to *sell* cars, not a source of a dealer's stock, so Helvaro has nothing to read from it. Source: <https://www.auto1.com/en/home/sell>.

Activation needs a partner agreement with AUTO1; there is no public API access to build against, and none is invented in the code. It can not be saved or synchronised.

**What it reads:** Nothing. `haal()` throws `provider_niet_beschikbaar`; the sync never calls it.

Files: [AUTH](AUTH.md) · [API](API.md) · [DATA_MAPPING](DATA_MAPPING.md) · [LIMITATIONS](LIMITATIONS.md) · [SETUP](SETUP.md)

Code: `api/_voorraad-providers/index.js`. Overview of all providers: [../README.md](../README.md).
