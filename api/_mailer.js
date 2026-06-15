// Unified mailer for Helvaro.
//
// Waarom: Resend vereist domeinverificatie (SPF/DKIM) om vanaf @helvaro.pro
// te mogen sturen. helvaro.pro heeft echter AL een werkende mailbox
// (hello@helvaro.pro via Namecheap Private Email), die SMTP ondersteunt en
// naar iedereen kan sturen zonder extra DNS-setup. Daarom: SMTP primair,
// Resend als automatische fallback.
//
// Config via env vars (Vercel):
//   SMTP_HOST   bv. mail.privateemail.com   (Namecheap Private Email)
//   SMTP_PORT   465   (SSL) of 587 (STARTTLS)
//   SMTP_SECURE 'true' voor 465, 'false' voor 587
//   SMTP_USER   hello@helvaro.pro
//   SMTP_PASS   het mailbox-wachtwoord
//   SMTP_FROM   'Helvaro <hello@helvaro.pro>'  (optioneel, default = SMTP_USER)
//
// Zonder SMTP-env vars valt 't terug op Resend (RESEND_API_KEY + RESEND_FROM).
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

  // 2. Resend fallback
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (RESEND_KEY) {
    const fromAddr = from || process.env.RESEND_FROM || 'Helvaro <noreply@helvaro.pro>';
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from:     fromAddr,
          to:       Array.isArray(to) ? to : [to],
          subject,
          html,
          reply_to: replyTo || undefined
        })
      });
      if (r.ok) return { ok: true, via: 'resend' };
      const txt = await r.text().catch(() => '');
      console.error('[mailer] Resend fout', r.status, txt.slice(0, 200));
      return { ok: false, error: 'resend ' + r.status };
    } catch (err) {
      console.error('[mailer] Resend netwerkfout:', err && err.message);
      return { ok: false, error: 'resend netwerk' };
    }
  }

  return { ok: false, error: 'geen mailtransport geconfigureerd (zet SMTP_* of RESEND_API_KEY)' };
}

module.exports = { sendMail };
