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

/* ── Een pandpagina lezen ─────────────────────────────────────────────────────
 * fetchWebsite() hierboven levert kale tekst. Voor het importeren van een pand
 * uit een link is dat te weinig: op Immoweb, Realo en Zimmo staan prijs,
 * oppervlakte en slaapkamers vaak in JSON-LD of in og:-tags, netjes gelabeld,
 * terwijl ze in de platte tekst tussen menu's en cookiemeldingen verdwijnen.
 * Een model dat de gelabelde versie krijgt hoeft minder te raden -- en raden is
 * precies wat hier niet mag.
 *
 * -- Waarom omleidingen hier wél gevolgd worden --------------------------------
 * fetchWebsite() volgt ze bewust NIET: een omleiding naar een intern adres
 * omzeilt de blokkeerlijst. Maar een makelaar plakt een link die hij uit een
 * app of een mail kopieert, en die gaat vaak eerst langs een omleiding. Daarom
 * volgen we er hier hoogstens twee -- en wordt ELKE tussenstap opnieuw langs
 * dezelfde controle gehaald. Een omleiding naar 169.254.169.254 stopt dus nog
 * steeds bij de eerste hop.
 */

/** Dezelfde controle als hierboven, apart zodat elke omleiding hem ook krijgt. */
function urlToegestaan(url, tag) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    console.warn(`${tag} Geblokkeerd (geen http/https):`, url);
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '169.254.169.254' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host) ||
    /^\[?::1\]?$/.test(host) ||
    /^\[?fe80:/i.test(host) ||
    /^\[?fc00:/i.test(host) ||
    /^\[?fd/i.test(host)
  ) {
    console.warn(`${tag} Geblokkeerd (intern adres):`, url);
    return null;
  }
  return parsed;
}

function tekstUitHtml(html, maxChars) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&euro;/g, '\u20AC')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxChars);
}

/**
 * Haalt een pagina op en levert wat er voor een pandimport toe doet.
 *
 * @param {string} url
 * @param {object} [opts] { tag, maxChars, maxRedirects, timeoutMs }
 * @returns {Promise<null|{url,text,jsonLd,meta,images}>}
 */
async function fetchPage(url, opts = {}) {
  const tag        = opts.tag || '[fetchPage]';
  const maxChars   = opts.maxChars || 14000;
  const timeoutMs  = opts.timeoutMs || 9000;
  let   hopsOver   = Number.isFinite(opts.maxRedirects) ? opts.maxRedirects : 2;
  let   huidige    = url;

  for (;;) {
    const parsed = urlToegestaan(huidige, tag);
    if (!parsed) return null;

    let res;
    try {
      res = await fetch(parsed.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HelvaroBot/1.0)', 'Accept-Language': 'nl,en;q=0.8' },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      console.warn(`${tag} ophalen mislukt (${huidige}):`, err && err.message);
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc || hopsOver <= 0) {
        console.warn(`${tag} omleiding niet gevolgd (${res.status}) voor`, huidige);
        return null;
      }
      hopsOver -= 1;
      /* Relatieve Location-headers bestaan; los ze op tegen de huidige URL en
         haal het resultaat opnieuw door de controle. */
      huidige = new URL(loc, parsed).toString();
      continue;
    }

    if (!res.ok) {
      console.warn(`${tag} HTTP ${res.status} voor`, huidige);
      return null;
    }

    const html = await res.text();

    /* JSON-LD. Immoweb en Realo zetten hier prijs, adres en oppervlakte in,
       gelabeld en al. Kapotte blokken worden overgeslagen, niet gerepareerd. */
    const jsonLd = [];
    const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    while ((m = ldRe.exec(html)) !== null && jsonLd.length < 6) {
      try { jsonLd.push(JSON.parse(m[1].trim())); } catch { /* stukje overslaan */ }
    }

    /* og:- en gewone meta-tags. */
    const meta = {};
    const metaRe = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
    while ((m = metaRe.exec(html)) !== null) {
      const naam = m[1].toLowerCase();
      if (/^(og:|twitter:)/.test(naam) || naam === 'description') {
        if (!meta[naam]) meta[naam] = m[2].slice(0, 500);
      }
    }

    /* Foto's: alleen https, want de pandkaart staat op een https-pagina en een
       http-afbeelding laadt daar niet. */
    const images = [];
    const zetErbij = (u) => {
      const schoon = String(u || '').trim();
      if (/^https:\/\/\S{10,500}$/.test(schoon) && images.indexOf(schoon) === -1) images.push(schoon);
    };
    zetErbij(meta['og:image']);
    const uitLd = (x) => {
      if (!x) return;
      if (Array.isArray(x)) return x.forEach(uitLd);
      if (typeof x === 'string') return zetErbij(x);
      if (typeof x === 'object') {
        if (x.url) zetErbij(x.url);
        if (x.image) uitLd(x.image);
        if (x.contentUrl) zetErbij(x.contentUrl);
      }
    };
    jsonLd.forEach((blok) => uitLd(blok && blok.image));

    const text = tekstUitHtml(html, maxChars);
    console.log(`${tag} gelezen: ${huidige} (${text.length} tekens, ${jsonLd.length} json-ld, ${images.length} foto's)`);
    return { url: huidige, text, jsonLd, meta, images: images.slice(0, 12) };
  }
}

module.exports = { fetchWebsite, fetchPage, urlToegestaan };
