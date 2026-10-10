// Is dit IP-adres intern (loopback, privé, link-local, metadata, ULA)?
// Eén plek voor alle SSRF-controles (fetch-website, voorraadfeed, CRM-webhook).
//
// Waarom een eigen IPv6-parser: `new URL('http://[::ffff:127.0.0.1]/')` geeft als
// hostname `[::ffff:7f00:1]` (hex, geen punten). Een regex op "::ffff:127." mist
// die vorm, en dan wijst de "externe" URL naar de loopback van de server (audit F9).
// Daarom: IPv6 volledig uitschrijven naar 8 groepen en elke ingebedde IPv4
// (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::/96, 2002::/16 6to4) apart controleren.
const net = require('net');

/** Een IPv4 in een bereik dat nooit van een klant kan zijn. Onleesbaar = intern. */
function internV4(ip) {
  const d = String(ip).split('.').map(Number);
  if (d.length !== 4 || d.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = d;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

/** IPv6 (ook met punten-staart) -> 8 getallen, of null als het geen geldig adres is. */
function groepenV6(ip) {
  let s = String(ip).toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const punt = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (punt) {
    const v4 = punt[2].split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => !(n >= 0 && n <= 255))) return null;
    s = punt[1] + ((v4[0] << 8) | v4[1]).toString(16) + ':' + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const delen = s.split('::');
  if (delen.length > 2) return null;
  const kop = delen[0] ? delen[0].split(':') : [];
  const staart = delen.length === 2 && delen[1] ? delen[1].split(':') : [];
  const gat = 8 - kop.length - staart.length;
  if (delen.length === 1 ? kop.length !== 8 : gat < 1) return null;
  const alle = delen.length === 1 ? kop : kop.concat(Array(gat).fill('0'), staart);
  const uit = alle.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return uit.length === 8 && uit.every(Number.isFinite) ? uit : null;
}

const v4Uit = (hoog, laag) => [hoog >> 8, hoog & 255, laag >> 8, laag & 255].join('.');

function internV6(ip) {
  const g = groepenV6(ip);
  if (!g) return true;                                       // onleesbaar = weigeren
  if (g.every((x) => x === 0)) return true;                  // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;   // ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true;               // fc00::/7  ULA
  if ((g[0] & 0xffc0) === 0xfe80) return true;               // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true;               // fec0::/10 site-local (verouderd)
  if ((g[0] & 0xff00) === 0xff00) return true;               // ff00::/8  multicast
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return internV4(v4Uit(g[6], g[7])); // ::ffff:a.b.c.d en ::a.b.c.d
  if (g.slice(0, 4).every((x) => x === 0) && g[4] === 0xffff && g[5] === 0) return internV4(v4Uit(g[6], g[7])); // ::ffff:0:a.b.c.d (IPv4-translated, RFC 2765)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return internV4(v4Uit(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return internV4(v4Uit(g[1], g[2]));   // 6to4
  return false;
}

/** Intern IP-adres? Geen IP-adres (een hostnaam) -> false; de aanroeper lost eerst op. */
function isInternIp(ip) {
  const s = String(ip || '').replace(/^\[|\]$/g, '');
  const fam = net.isIP(s);
  if (fam === 4) return internV4(s);
  if (fam === 6 || s.includes(':')) return internV6(s);
  return false;
}

module.exports = { isInternIp, internV4, internV6, groepenV6 };
