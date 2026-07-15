// SSRF-protected website fetcher. Protocol whitelist (http/https only),
// private-IP/metadata-endpoint blocklist, no redirect-follow (a redirect to
// an internal IP would otherwise bypass the blocklist above), 5s timeout.
// Strips <script>/<style> content plus all remaining tags and returns plain
// text, truncated to `opts.maxChars`.
//
// Shared by api/whatsapp.js (fetches a lead's own client's website, for AI
// reply context) and api/cron-followup.js's runOutreach() (fetches a
// third-party Apify-scraped prospect's website — untrusted input, same SSRF
// exposure). Both call sites hand this function a URL that ultimately
// originates outside our system, so both need the same protections. Keeping
// the logic in one place means a future SSRF fix here protects both call
// sites instead of risking two copies silently drifting apart.
async function fetchWebsite(url, opts = {}) {
  const tag      = opts.tag || '[fetchWebsite]';
  const maxChars = opts.maxChars || 3000;
  try {
    // SSRF protection. Only allow http/https and block internal IPs
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      console.warn(`${tag} Blocked non-HTTP URL:`, url);
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    // Block localhost, private IPs, link-local, metadata endpoints
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host === '169.254.169.254' ||                     // AWS/GCP metadata
      /^127\./.test(host) ||                            // 127.0.0.0/8
      /^10\./.test(host) ||                             // 10.0.0.0/8
      /^192\.168\./.test(host) ||                       // 192.168.0.0/16
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||        // 172.16.0.0/12
      /^\[?::1\]?$/.test(host) ||                       // IPv6 localhost
      /^\[?fe80:/i.test(host)                           // IPv6 link-local
    ) {
      console.warn(`${tag} Blocked internal URL:`, url);
      return null;
    }

    const res  = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'manual',                               // Don't follow redirects to internal IPs
      signal:  AbortSignal.timeout(5000),
    });
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, maxChars);
    console.log(`${tag} Website geladen: ${url} (${text.length} tekens)`);
    return text;
  } catch (err) {
    console.error(`${tag} Website ophalen mislukt (${url}):`, err.message);
    return null;
  }
}

module.exports = { fetchWebsite };
