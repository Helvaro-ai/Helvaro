'use strict';
/*
 * Faro — demo fixtures.
 *
 * Sample data returned by the read tools when FARO_DEMO_MODE=1. Off by default.
 *
 * ── The one rule ─────────────────────────────────────────────────────────────
 * Fixture data must be impossible to mistake for real CRM data. Every record
 * here carries a `demo-` id prefix, and every tool result built from fixtures
 * keeps the `_stub` marker that api/_faro/tools.js sets. If this ever ships
 * enabled by default, an agent must be able to tell at a glance that "Emma Van
 * Dijk, €350.000" is a sample and not a person to phone.
 *
 * The names, towns and price points are drawn from the brief's own examples
 * (Knokke, €350k–€650k, WhatsApp-sourced leads) so the demo shows the product
 * in its real market rather than in Lorem Ipsum.
 */

const schema = require('./schema');

const LEADS = Object.freeze([
  { id: 'demo-1', name: 'Emma Van Dijk',    budget: 350000, timeframe: '1-3m', channel: 'whatsapp', status: 'qualified', note: 'Zoekt appartement met zeezicht.' },
  { id: 'demo-2', name: 'Lucas Peeters',    budget: 480000, timeframe: '0-1m', channel: 'whatsapp', status: 'qualified', note: 'Financiering al goedgekeurd.' },
  { id: 'demo-3', name: 'Sofie Maes',       budget: 625000, timeframe: '1-3m', channel: 'form',     status: 'qualified', note: 'Villa, minimaal 4 slaapkamers.' },
  { id: 'demo-4', name: 'Thomas De Clercq', budget: 410000, timeframe: '3-6m', channel: 'whatsapp', status: 'contacted', note: 'Wil eerst huidige woning verkopen.' },
  { id: 'demo-5', name: 'Anke Willems',     budget: 300000, timeframe: '1-3m', channel: 'phone',    status: 'new',       note: 'Eerste aankoop.' },
  { id: 'demo-6', name: 'Karel Janssens',   budget: 750000, timeframe: '0-1m', channel: 'whatsapp', status: 'qualified', note: 'Investeerder, tweede pand.' },
  { id: 'demo-7', name: 'Nina Vermeulen',   budget: 395000, timeframe: '1-3m', channel: 'form',     status: 'qualified', note: 'Zoekt in Knokke-Heist.' },
  { id: 'demo-8', name: 'Bram Coppens',     budget: 520000, timeframe: '3-6m', channel: 'whatsapp', status: 'new',       note: 'Nog aan het oriënteren.' },
]);

const TIMEFRAME_LABEL = {
  '0-1m': 'Aankoop binnen 1 maand',
  '1-3m': 'Aankoop in 1–3 maanden',
  '3-6m': 'Aankoop in 3–6 maanden',
  '6m+':  'Aankoop over 6+ maanden',
};

const STATUS_LABEL = {
  new: 'Nieuw', qualified: 'Gekwalificeerd', contacted: 'Gecontacteerd',
  won: 'Gewonnen', lost: 'Verloren',
};

function euro(n) {
  return `€${n.toLocaleString('nl-BE')}`;
}

/** One lead → the lead_card component the client renders. */
function leadCard(l) {
  return schema.leadCard({
    id: l.id,
    name: l.name,
    budget: euro(l.budget),
    timeframe: TIMEFRAME_LABEL[l.timeframe] || l.timeframe,
    channel: l.channel === 'whatsapp' ? 'WhatsApp' : l.channel === 'form' ? 'Formulier' : 'Telefoon',
    status: STATUS_LABEL[l.status] || l.status,
    note: l.note,
  });
}

/** Apply the same filters search_leads accepts, so the demo honours the query. */
function searchLeads(args = {}) {
  let out = LEADS.slice();
  if (args.minBudget) out = out.filter((l) => l.budget >= args.minBudget);
  if (args.maxBudget) out = out.filter((l) => l.budget <= args.maxBudget);
  if (args.timeframe) out = out.filter((l) => l.timeframe === args.timeframe);
  if (args.status)    out = out.filter((l) => l.status === args.status);
  if (args.channel)   out = out.filter((l) => l.channel === args.channel);
  if (args.query) {
    const q = String(args.query).toLowerCase();
    out = out.filter((l) => (l.name + ' ' + l.note).toLowerCase().indexOf(q) > -1);
  }
  out.sort((a, b) => b.budget - a.budget);
  return out.slice(0, args.limit || 10);
}

const PIPELINE = Object.freeze([
  { label: 'Nieuw',           value: '12 leads · €4,1M' },
  { label: 'Gekwalificeerd',  value: '9 leads · €4,3M'  },
  { label: 'Bezoek gepland',  value: '4 leads · €1,9M'  },
  { label: 'Bod uitgebracht', value: '2 leads · €1,1M'  },
]);

const ANALYTICS = Object.freeze([
  { label: 'Nieuwe leads (30d)', value: '34'      },
  { label: 'Kwalificatiegraad',  value: '62%'     },
  { label: 'Gem. responstijd',   value: '2 min'   },
  { label: 'Bezoeken geboekt',   value: '11'      },
]);

/* Recent activity. `subtitle` carries the PROPERTY only — the age is derived
   from createdAt on the client, because a pre-rendered "5 min geleden" ages
   while the page is open and cannot be translated.

   Thumbnails are inline SVG data URIs rather than remote images: they render
   at any size, need no network, and cannot 404 into a broken card. They are
   obviously placeholders up close, which is the point — nothing here should be
   mistakable for a real generated render. */
function fixtureThumb(a, b, label) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240">'
    + '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
    + '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>'
    + '</linearGradient></defs>'
    + '<rect width="320" height="240" fill="url(#g)"/>'
    + '<text x="160" y="128" text-anchor="middle" font-family="sans-serif" font-size="15"'
    + ' fill="rgba(255,255,255,0.66)">' + label + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const ACTIVITY = Object.freeze([
  { id: 'demo-a1', kind: 'image', title: 'Woonkamer — Modern Luxe', subtitle: 'Villa Knokke',
    thumbUrl: fixtureThumb('#4a4438', '#20201c', 'woonkamer'), createdAt: Date.now() - 3e5 },
  { id: 'demo-a2', kind: 'video', title: 'Instagram Reel — Villa Knokke', subtitle: '',
    duration: '00:15', thumbUrl: fixtureThumb('#3b4a52', '#1b2124', 'reel'), createdAt: Date.now() - 6e5 },
  { id: 'demo-a3', kind: 'text',  title: 'Pandtekst', subtitle: '',
    excerpt: 'Luxueuze villa met zeezicht in Knokke-Heist. 4 slaapkamers, 3 badkamers, ruim terras en hoogwaardige afwerking.',
    createdAt: Date.now() - 1.3e6 },
  { id: 'demo-a4', kind: 'image', title: 'Exterieur — Daglicht', subtitle: 'Villa Knokke',
    thumbUrl: fixtureThumb('#54503f', '#23231d', 'exterieur'), createdAt: Date.now() - 2.1e6 },
  { id: 'demo-a5', kind: 'image', title: 'Keuken — Scandinavisch', subtitle: 'Appartement Gent',
    thumbUrl: fixtureThumb('#4c4a45', '#232322', 'keuken'), createdAt: Date.now() - 5.4e6 },
]);

const CONVERSATIONS = Object.freeze([
  { id: 'demo-c1', title: 'Vind mijn beste leads' },
  { id: 'demo-c2', title: 'Villa campagne — Knokke' },
  { id: 'demo-c3', title: 'Pipeline van deze week' },
  { id: 'demo-c4', title: 'Opvolgstrategie' },
  { id: 'demo-c5', title: 'Marketing ideeën' },
]);

const PROJECTS = Object.freeze([
  { id: 'demo-p1', name: 'Villa Project — Knokke', subtitle: '1 pand · 3 beelden · 1 video · 6 leads' },
  { id: 'demo-p2', name: 'Appartementen Oostende', subtitle: '2 panden · 1 beeld · 4 leads' },
]);

function isEnabled() {
  return String(process.env.FARO_DEMO_MODE || '') === '1';
}

module.exports = {
  isEnabled,
  LEADS, PIPELINE, ANALYTICS, ACTIVITY, CONVERSATIONS, PROJECTS,
  leadCard, searchLeads, euro,
};
