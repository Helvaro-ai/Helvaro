---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: ["api/dashboard.js","api/_dash/styles.js"]
---

# Surface: marketing homepage (site/index.html) — mode: Persuade

Scope: the apex marketing site (helvaro.pro), rebuilt as static HTML/CSS/JS inside this repo under `site/`. The app (api/dashboard.js, Operate) inherits this world; it does not run its own direction round.

Audience & job: owner/sales lead of a small Belgian firm in vastgoed / automotive / bouw / keuken / renovatie, arriving from outreach or search, deciding within seconds whether Helvaro answers "my leads go cold while I'm on the road". Action: Start met Helvaro (signup) or Plan een demo. Proof available: the real product UI only (no testimonials, logos or numbers — see PRODUCT.md Evidence). Constraints: nl/fr/en/de(+es undecided), never call the product "AI" in customer copy, no fabricated claims, pricing €249,99 / €499 / €799 incl. btw.

## Direction contract

THESIS: Helvaro is shown as a showroom sample board — real product samples pinned in workflow order (reageren → kwalificeren → boeken → melden → opvolgen). It refuses the category default (centered hero, three benefit cards, screenshot, pricing) and its opposite (cream-and-serif editorial essay).

OWN-WORLD: a warm sand board as ground; three tone steps per theme (ground / raised / ink) and nothing between; muted-tan chip edges instead of shadows; charcoal label type in small tracked caps for codes (01 REAGEREN), a grotesk display face with a point of view for the one display line; body in a workhorse sans; product samples are the only "objects" on the board — few, large, real UI. Light Helvaro: warm off-white ground, light-sand raised, charcoal ink. Dark Helvaro: deep warm black ground, warm charcoal raised, sand ink — the same board under evening light, not an inversion. Faro appears once, small, as the maker's mark in the corner of the board.

STORY: "My leads get an answer before they go cold — and the serious ones get an appointment." The visitor reads the five samples in order, recognises their own trade in the material chips (oak, stone, steel, paper, lacquer = the five verticals), sees pricing without hunting, and starts or books a demo.

FIRST VIEWPORT: full-width board on a 12-column registration grid. Columns 1–6, rows 1–2: the display line "Elke lead een antwoord. De serieuze een afspraak." with a two-line sub-sentence beneath. Column 1, row 3: the primary action as the one solid charcoal chip "Start met Helvaro", secondary text link "Plan een demo". Columns 7–12: sample 01 (a real WhatsApp exchange, 4 messages, with an elapsed-seconds readout in tan mono) and sample 02 (qualification factors with text-labelled states). Below the fold, samples 03–05 (calendar block, employee notification, pipeline row) continue the board. Section codes sit in the left margin like registration crosses. Signature interaction: samples lift one tone step on hover, and the visitor can type the lead's message into sample 01 (labelled DEMO) and watch the answer arrive with a real timer. Motion grammar: one 200ms ease for lifts, samples settle into place on first scroll, nothing loops; respects prefers-reduced-motion.

FORM: the showroom material sample board — candidate 3 of 7 on the grounded list (1 appointment book, 2 offerte, 3 sample board, 4 windshield price card, 5 verkoopdossier, 6 werfbord, 7 classifieds). Seed key 5f5c3b18. Raises kept from the declined hand: tone ladder (manga), registration grid (screenprint), measured readouts with units (oscilloscope), author-in-place demo (HyperCard), text-labelled states (silk canopy), per-vertical material chip (sleeping city).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Unresolved: Spanish (es) on the site; which real photography (if any) replaces the two live stock photos; whether the partner points helvaro.pro at this repo's `site/` or copies it into their project.
