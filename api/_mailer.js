// Unified mailer for Helvaro.
//
// Mail loopt via SMTP (hello@helvaro.pro, Namecheap Private Email). Dat is de
// ENIGE weg: Resend stond hier als terugval en is eruit gehaald nadat OneSignal
// geverifieerd raakte.
//
// Let op wat dat betekent: een ontbrekende SMTP_* variabele werd vroeger door
// Resend opgevangen. Nu komt er dan geen mail meer aan. Onderaan sendMail()
// staat daarom een luide melding in plaats van een stille { ok: false }.
//
// Config via env vars (Vercel):
//   SMTP_HOST   bv. mail.privateemail.com   (Namecheap Private Email)
//   SMTP_PORT   465   (SSL) of 587 (STARTTLS)
//   SMTP_SECURE 'true' voor 465, 'false' voor 587
//   SMTP_USER   hello@helvaro.pro
//   SMTP_PASS   het mailbox-wachtwoord
//   SMTP_FROM   'Helvaro <hello@helvaro.pro>'  (optioneel, default = SMTP_USER)

// Bestandsnaam begint met '_' zodat Vercel het niet als route behandelt.

let _transport;  // undefined = nog niet bepaald, false = geen SMTP, object = transport

function getTransport() {
  if (_transport !== undefined) return _transport;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) { _transport = false; return false; }
  try {
    const nodemailer = require('nodemailer');
    _transport = nodemailer.createTransport({
      host,
      port:   parseInt(process.env.SMTP_PORT || '465', 10),
      secure: (process.env.SMTP_SECURE || 'true') !== 'false',  // 465=true, 587=false
      auth:   { user, pass }
    });
  } catch (err) {
    console.error('[mailer] kon nodemailer niet laden:', err && err.message);
    _transport = false;
  }
  return _transport;
}

// sendMail({ to, subject, html, from?, replyTo? }) -> { ok, via?, id?, error? }
// Faalt nooit hard: e-mail mag nooit een request-flow blokkeren.
async function sendMail({ to, subject, html, from, replyTo }) {
  if (!to)      return { ok: false, error: 'geen ontvanger' };
  if (!subject) return { ok: false, error: 'geen onderwerp' };

  // 1. SMTP primair (Namecheap Private Email)
  const t = getTransport();
  if (t) {
    const fromAddr = from || process.env.SMTP_FROM || process.env.SMTP_USER;
    try {
      const info = await t.sendMail({ from: fromAddr, to, subject, html, replyTo });
      return { ok: true, via: 'smtp', id: info.messageId };
    } catch (err) {
      console.error('[mailer] SMTP send mislukt, val terug op Resend:', err && err.message);
      // val door naar Resend
    }
  }

  /* ── Geen tweede weg meer ──────────────────────────────────────────────
     Hier stond Resend als terugval. Die is eruit: OneSignal is geverifieerd
     en mail loopt via SMTP (Namecheap Private Email).

     Dat betekent wel dat SMTP nu de ENIGE weg is. Een ontbrekende SMTP_*
     variabele werd vroeger opgevangen door Resend; nu komt er dan helemaal
     geen mail meer aan -- en dat zijn verificatiemails en wachtwoordherstel,
     precies het soort bericht waarvan niemand merkt dat het ontbreekt behalve
     de klant die niet binnenkomt.

     Daarom is dit geval LUID. Het staat als fout in de Vercel-logs, met de
     naam van wat er mist, in plaats van stil een { ok: false } terug te geven
     die verderop in een lege catch verdwijnt. Zie ook _ratelimit.js en
     _stripe.js, die om dezelfde reden zo schreeuwen. */
  const mist = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((k) => !process.env[k]);
  console.error('[mailer] GEEN MAILTRANSPORT — er is geen enkele mail verstuurd. '
    + (mist.length
        ? 'Ontbrekende instelling(en): ' + mist.join(', ') + '. '
        : 'SMTP is ingesteld maar het versturen mislukte; zie de fout hierboven. ')
    + 'Sinds Resend eruit is, is SMTP de enige weg: verificatiemails en '
    + 'wachtwoordherstel komen nu niet aan.');

  return { ok: false, error: 'geen mailtransport geconfigureerd (zet SMTP_HOST, SMTP_USER en SMTP_PASS)' };
}

module.exports = { sendMail };
