# mobile.de: limitations

- Each dealer needs their own Seller API activation by mobile.de (e-mail to `service@team.mobile.de`); Helvaro can not do that for them.
- No pagination, no ad address and no rate limits are documented. The code assumes the full list in one response.
- Whether blocked or deleted ads (`adQuality`) appear in the ads list is not stated in the documentation; the reader does not filter on it.
- Sellers: a mobile.de account with several sellers needs the seller ID entered by the dealer.
- Cross-platform matching is by VIN only.
- Read only. Publishing is not built (Phase 2).
