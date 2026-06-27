# Helvaro Social Content Playbook

Operating reference for Atlas + the content generator (`api/admin.js`). Single source of truth for what to post, in which voice, on which platform, and what still needs research. Update this when strategy changes.

Last updated: 2026-06-27.

---

## 1. Who we are (positioning)

Helvaro is a Belgian B2B SaaS. SMBs (car dealers, hairdressers, lawyers, real estate, dentists, ...) get an AI that qualifies their WhatsApp leads in 30 seconds. EUR 1.000/maand. NL/FR/EN.

Flow: lead fills a form on the client's website -> Helvaro's AI sends a WhatsApp immediately -> natural conversation -> marks qualified -> client gets notified. Without Helvaro: the lead walks to a competitor after 5-10 minutes.

Core promise to lead with: **speed-to-lead**. The first 5 minutes decide the deal.

---

## 2. Voice rules (non-negotiable)

- Language: Dutch.
- NO emojis. NO em-dashes (use normal periods/commas).
- NO AI cliches ("Did you know", "Stel je voor", "In een wereld waar...", "Ontketen", "Naadloos").
- Concrete situations, real numbers, sentences like a real entrepreneur wrote them.
- Never mention price (EUR 1.000/maand) unless the pillar is pain-point or customer-win.
- NEVER reveal the AI is an AI in any product context. Never claim it's a bot.
- NOOIT LEKKEN: no technical/security/credential topics, no vendors by name, no customer data, no internal infrastructure, never imply the product is broken/insecure/unfinished. Abstract to the human lesson.

Why this matters: AI-generic-sounding content gets ~47% less reach on LinkedIn in 2026. Generic = invisible.

---

## 3. Platform split

| Platform | Account | Role | Content |
|----------|---------|------|---------|
| LinkedIn | Sindi Said (personal) | Trust / founder brand | Personal founder stories, struggles, company-why, building-in-public. Text-only. |
| Instagram | helvaro.pro | Reach / brand | Marketing only: pain-point, solution, stats, education. Image required. |
| Facebook | Helvaro page | Reach / local SMB | Marketing only, slightly longer, community tone. Image required. |

Key 2026 facts driving this split:
- Personal profiles get ~8x more engagement than company pages -> LinkedIn runs through Sindi, not a company page.
- Story-driven, specific, falsifiable founder posts get ~5x more comments.
- Carousels (multi-slide) = highest engagement (~6.6%), 2-3x dwell time.
- Native video ~5x, image ~2x text-only.
- Proof-based content (real metric + context + takeaway) outperforms on average.

---

## 4. Competitors and what they post

Direct competitors (WhatsApp / conversational-AI lead tools): **WATI, Respond.io, Trengo, Landbot, ManyChat, MessageBird**.

Their post types (the menu we benchmark against):

1. Case study / result with a real number ("How X booked Y% more demos").
2. Product demo (short video/GIF of the chatbot flow).
3. Educational carousel ("5 ways to qualify leads on WhatsApp").
4. Single big-stat post (one number + context).
5. Industry use-case (real estate, auto, dental addressed separately).
6. Integration announcements (CRM, Meta).
7. Founder POV / behind-the-scenes (on personal profiles).

Where Helvaro currently has gaps vs them: carousels, WhatsApp-mockup visuals, sector-specific targeting, dedicated big-stat format, video demos.

---

## 5. Content pillars (current + roadmap)

Implemented in `CONTENT_PILLARS` / `LINKEDIN_PILLARS` / `MARKETING_PILLARS` in `api/admin.js`:

LinkedIn pool (personal/founder): `founder-pov`, `personal-struggle`, `company-story`, `behind-scenes`, `industry-insight`.
IG/FB pool (marketing only): `pain-point`, `solution`, `industry-insight`, `educational`, `customer-win`.

Roadmap additions (not yet built, prioritized):

1. **WhatsApp-mockup visuals** (highest impact, low risk): instead of generic stock/AI photos, render an image that mimics a real WhatsApp conversation showing Helvaro qualifying a lead. This is the product promise made visual.
2. **Sector rotation**: rotate IG/FB posts across verticals (auto, vastgoed, dental, kappers, advocaten) so the feed speaks to each niche directly.
3. **Big-stat format**: a dedicated format = one bold number, one line of context, one takeaway.
4. **Carousels**: generate 3-5 slide educational/stat sets (the strongest LinkedIn/IG format). Bigger build (multiple images per post).
5. **Video/GIF demos**: longer-term; a short screen-capture of the WhatsApp flow.

---

## 6. Visual direction

- Brand look: deep dark navy/black + electric blue (#2b86ff) with glow. Matches the Instagram feed and logo.
- Image gen stack: OpenAI `gpt-image-1-mini` primary (org verified), Pollinations free fallback, Pexels last resort. IG 1024x1024, FB 1536x1024.
- Image prompts: professional, photorealistic or clean brand graphic, no text/letters in image, no watermark, brand-safe.
- LinkedIn stays text-only (B2B norm, photos distract).
- Idea worth testing: WhatsApp-chat mockup as the recurring visual signature.

---

## 7. Cadence and pipeline

- Default generation: 7 days. Per day: LinkedIn 08:30 (weekdays only), Instagram 12:00, Facebook 18:00 (Brussels time).
- Volume: ~19 posts/week (LinkedIn 5, IG 7, FB 7). Research says 2-4 quality posts/week/platform beats volume, so quality-filter hard at approval.
- Pipeline: Social Studio (`/social`) generates drafts -> Sindi reviews/edits/approves -> approved posts collect in the Goedgekeurd tab -> Atlas pushes to Buffer via the connector -> Buffer auto-posts on schedule. See `[[helvaro-buffer-social]]`.

---

## 8. Quality bar (approve / reject checklist)

Before a post is approved it should pass:
- Sounds like a human entrepreneur, not an AI summary.
- One concrete situation, number, or specific detail (not vague advice).
- Clear hook in the first line.
- Ends with a question or a real takeaway.
- No emoji, no em-dash, no cliche, no price (unless pain-point/customer-win).
- Nothing sensitive leaked (security/tech/vendors/customer data).
- LinkedIn: personal and specific. IG/FB: marketing, with a strong image.

---

## 9. Research to do (open)

- Pull the actual feeds of WATI / Respond.io / Trengo / Landbot (login-walled; try scrapegraph or manual review) to confirm their real post mix and best performers.
- Benchmark Belgian/EU SMB-facing SaaS specifically (most competitor content is US/global).
- Test whether WhatsApp-mockup visuals outperform stock/AI photos (A/B over a few weeks).
- Track which pillars get the most engagement once posting starts, then reweight `CONTENT_PILLARS`.
- Confirm LinkedIn external-link penalty (20-35% less reach) and keep links in comments, not the post body.

---

## 10. Sources

- respond.io best WhatsApp chatbots 2026: https://respond.io/blog/best-whatsapp-chatbots
- LinkedIn content strategy for B2B SaaS 2026 (BuildMVPfast): https://www.buildmvpfast.com/blog/linkedin-content-strategy-b2b-saas-60k-playbook-2026
- LinkedIn content strategy for SaaS 2026 (Autoposting.ai): https://autoposting.ai/blog/linkedin-saas-content-strategy
- Content strategy for B2B SaaS startups 2026 (Sproutworth): https://www.sproutworth.com/content-strategy-for-b2b-saas-startups/
