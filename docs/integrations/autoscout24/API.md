# AutoScout24 (seller profile): API

No API. The page embeds its listings as structured data (`__NEXT_DATA__`). Rules the reader follows:

- robots.txt is read on every run and respected.
- Honest user agent, one page per second, at most 60 pages (1200 cars).
- A block, captcha or HTTP 403/429/503 stops the run with a clear error. No workaround, no other user agent, no retry loop.
- Fewer than 95% of the cars the page itself counts means the run fails (SYNC_TIMEOUT): a half-read stock must never mark cars as sold.

Whether AutoScout24's terms allow automated reading of a public page is not something this project has verified; that is the reason the official API route exists as provider `autoscout24_api`.
