# AutoScout24 (official API): setup

**Helvaro side (once):** register with AutoScout24 as a data provider for the Listing Creation API, receive the credentials, and set `AS24_API_USER` and `AS24_API_PASSWORD` in the server environment (Vercel). Until then the card shows "Awaiting activation".

**Dealer side:**

1. In AutoScout24, authorise Helvaro as the data provider that may operate in your name, and note your `customerId`.
2. Settings, Integrations, AutoScout24 (API), Connect. Enter the customer ID. No password is asked.
3. Once Helvaro is activated the first synchronisation starts. It can run alongside the seller-profile reader: the same car is recognised by its AutoScout number.
