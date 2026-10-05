# AutoScout24 (official API): limitations

- Needs Helvaro's data-provider credentials from AutoScout24. Without them the provider is FEED_REQUIRED and reads nothing.
- Needs the dealer to authorise Helvaro in AutoScout24.
- The list call returns summaries only, so a sync costs one request per listing plus two reference calls. There is no "changed since" filter in the spec, so every run reads everything (the content hash still skips the writes when nothing changed).
- The spec defines no pagination, no listing address and no rate limit numbers. A very large stock (above 1,500 listings) stops the run on purpose.
- The customer ID format is only specified as a string; Helvaro accepts letters, digits, `_` and `-` up to 40 characters (every example in the docs is numeric).
- Marketplace `be` and culture `nl-BE` are assumed for names and codes. A dealer on another marketplace may see some body types or colours missing; they stay empty rather than guessed.
- First-claim risk on customer IDs: see AUTH.md ("Tenant safety"). One ID can be linked to one dealer; whether the dealer really owns it is not proven.
- Read only. Publishing needs a separate step (Phase 2).
