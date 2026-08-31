# Website ↔ app: klopt wat we beloven?

Opgemaakt 2026-08-31. Bron: `helvaro.pro` (repo `UseHelvaro/Helvaro-Website`)
naast de productiecode van de app.

De kolom **Getest** is bewust streng. "Live" betekent dat ik het in de echte
browser heb zien werken. "Code" betekent dat de implementatie er is en door de
testsuite gedekt wordt, maar dat ik het niet zelf heb kunnen uitvoeren — bijna
altijd omdat het achter de login zit en ik geen sessie heb.

| Belofte op de site | Bestaat | Werkt | Getest | Actie |
|---|---|---|---|---|
| Prijzen: Starter €249,99 / Growth €499 / Scale vanaf €799 | ja | ja | **Live** — komt exact overeen met `api/_plans.js` | geen |
| "Login" (18 links) → app | ja | ja | **Live** | geen |
| "Start je 14 dagen gratis" → aanmelden | ja | ja | **Live** — hele reis nagelopen, e-mail gaat mee | *opgelost vandaag* |
| Reageer voor je concurrent (WhatsApp-antwoord) | ja | ? | **Code** — webhook leeft en weigert onbevoegden; nooit een echt bericht bezorgd | nummer nodig |
| Toon de verbouwing (AI-beeld) | ja | ? | **Code** — zit achter de login | sessie nodig |
| Je agenda vult zichzelf (Google Calendar) | ja | ? | **Code** — OAuth niet doorlopen | sessie nodig |
| Elke sector eigen agent (5 sectoren) | ja | ? | **Code** | sessie nodig |
| Faro: advertentieteksten Meta/Google | ja | ja | **Code** — 26 tests, incl. tekenlimieten | *gebouwd vandaag* |
| Faro: merkconsistentie ("kent je toon") | ja | ja | **Code** — huisstijl gaat elke beurt mee | *gebouwd vandaag* |
| Faro: campagnes schrijven | ja | ja | **Code** — naam + tekst | *gebouwd vandaag* |
| Campagnes VERSTUREN | nee | nee | n.v.t. | **Meta-template nodig** |
| Lead-formulier (`/start/<code>`) | ja | ja | **Live** — validatie, mobiel, toegankelijkheid | geen |

## Waar de site en de app niet meer uit elkaar liepen

Drie beloftes stonden op de site zonder dat er iets achter zat, en die zijn
vandaag gebouwd: advertentieteksten, merkconsistentie en het echt kunnen
schrijven van een campagne. Zie `faro-versions/v5/`.

Eén belofte staat er bewust NIET: campagnes versturen. Dat vraagt een
goedgekeurde WhatsApp-template bij Meta.
