'use strict';
/*
 * Command Center — the intelligence layer.
 *
 * Everything here is DERIVED. It owns no records, writes nothing, and calls no
 * model. Given the tenant's leads (already fetched and already scoped by
 * api/_faro/data.js) it answers one question: what should this person do next
 * to make more money, and why.
 *
 * ── Why there is no AI call in this file ─────────────────────────────────────
 * The brief asks for a page that loads fast and does not spend credits on a
 * page view, and separately for insights that never invent a claim. Both point
 * the same way: every number, category and sentence below is arithmetic over
 * records that exist. A model is very good at sounding confident about a
 * pattern that is three leads wide; a threshold is not. Faro is still there for
 * anything genuinely open-ended, and it is metered when the user asks it
 * something — which is the only time it should cost anything.
 *
 * ── Opportunity Score is not Lead Score ──────────────────────────────────────
 * Lead Score, written by the WhatsApp AI, answers "how good is this lead". It
 * is a property of the person. Opportunity Score answers "how much does acting
 * on this RIGHT NOW matter", which is a property of the moment: the same
 * excellent lead scores high on Monday when they are waiting for a reply and
 * near zero on Tuesday once the viewing is booked. Conflating them is why CRM
 * dashboards sort by score and still leave the urgent thing at position 14.
 *
 * ── Explainability is a hard requirement, not a feature ──────────────────────
 * Every score carries the reasons that produced it, in the order they
 * contributed. Nothing here may reach the UI as a bare number: a prioritisation
 * the user cannot interrogate is one they will stop trusting the first time it
 * looks wrong, and they will be right to.
 */

const data = require('./_faro/data');

const DAY = 86400000;

/* ── Tunables ────────────────────────────────────────────────────────────────
   Named and gathered so the thresholds are arguable rather than buried. These
   are the judgements the whole page rests on; the numbers themselves come from
   how this product's leads actually behave — a Flemish estate agent's buyer
   goes quiet over a weekend and is not "lost" on day two. */
const T = {
  // Silence, measured from the lead's last inbound message.
  QUIET_DAYS: 2,          // starting to drift
  AT_RISK_DAYS: 3,        // the brief's example: "no response for 3 days"
  COLD_DAYS: 7,           // stopped responding

  // A budget at or above this counts as high value on its own merit, before
  // the per-tenant percentile below gets a say.
  HIGH_VALUE_EUR: 500000,

  // Below this an opportunity is not worth putting on a page that claims to
  // show what matters today.
  MIN_SCORE: 25,

  // How many make it onto the Command Center at once. More than this and the
  // list stops being a priority list.
  TOP_N: 8,
};

/* ── Signals ─────────────────────────────────────────────────────────────── */

function daysSince(ms) {
  if (!Number.isFinite(ms)) return null;
  return (Date.now() - ms) / DAY;
}

/** When we last heard from the lead, in days. Null when they never wrote. */
function silenceDays(lead) {
  return daysSince(data.lastInboundAt(lead));
}

/** How much of the conversation is the lead talking, and how much of it is us. */
function engagement(lead) {
  const turns = data.parseConversation(lead.gesprek);
  const fromLead = turns.filter((t) => t.role === 'lead').length;
  const fromUs = turns.filter((t) => t.role === 'assistant').length;
  // Reply rate, not message count: a lead who answered 7 of 8 is engaged; a
  // lead who sent 7 messages into silence is a different situation entirely.
  const rate = fromUs > 0 ? Math.min(1, fromLead / fromUs) : (fromLead > 0 ? 1 : 0);
  return { turns: turns.length, fromLead, fromUs, rate };
}

/** Timing pulled from the CRM's urgency field, mapped to a 0–1 weight. */
function urgencyWeight(lead) {
  const u = String(lead.urgentie || '').toLowerCase();
  if (/hoog|high|urgent|direct|meteen|asap/.test(u)) return 1;
  if (/middel|medium|gemiddeld/.test(u)) return 0.6;
  if (/laag|low|geen haast|later/.test(u)) return 0.2;
  return 0.45;   // unknown sits mid-scale rather than penalising a blank field
}

/* ── Opportunity Score ───────────────────────────────────────────────────────
   0–100, from five contributions that add up to 100 before penalties. The
   weights say what this product believes: value and quality matter most, but
   an excellent lead nobody has replied to in a week is not an opportunity, it
   is a post-mortem — hence recency carrying real weight in both directions. */
function scoreLead(lead, ctx) {
  const reasons = [];
  const budget = data.parseBudget(lead.verwachteWaarde);
  const silent = silenceDays(lead);
  const eng = engagement(lead);
  let score = 0;

  // 1. Value — 30. Scaled against this tenant's own top budget rather than an
  //    absolute, because €400k is an ordinary lead in Knokke and an
  //    exceptional one in Genk. A tenant with no budgets recorded gets 0 here
  //    rather than a guess.
  if (budget && ctx.topBudget > 0) {
    const rel = Math.min(1, budget / ctx.topBudget);
    const pts = Math.round(rel * 30);
    score += pts;
    if (pts >= 20) reasons.push({ key: 'value', label: 'Hoge waarde', detail: `Budget ${fmtEur(budget)}`, points: pts });
    else if (pts > 0) reasons.push({ key: 'value', label: 'Waarde', detail: `Budget ${fmtEur(budget)}`, points: pts });
  }

  // 2. Quality — 25. The AI's own judgement of the lead, trusted as given.
  if (lead.leadScore > 0) {
    const pts = Math.round((Math.min(10, lead.leadScore) / 10) * 25);
    score += pts;
    if (pts >= 18) reasons.push({ key: 'quality', label: 'Sterk gekwalificeerd', detail: `Leadscore ${lead.leadScore}/10`, points: pts });
    else if (pts > 0) reasons.push({ key: 'quality', label: 'Kwalificatie', detail: `Leadscore ${lead.leadScore}/10`, points: pts });
  }

  // 3. Timing — 15.
  const uw = urgencyWeight(lead);
  const uPts = Math.round(uw * 15);
  score += uPts;
  if (uw >= 1) reasons.push({ key: 'timing', label: 'Wil snel kopen', detail: lead.urgentie || 'Hoge urgentie', points: uPts });

  // 4. Engagement — 15. A reply rate over a real conversation, not a vibe.
  if (eng.turns >= 2) {
    const pts = Math.round(eng.rate * 15);
    score += pts;
    if (eng.rate >= 0.7) {
      reasons.push({
        key: 'engagement', label: 'Sterke betrokkenheid',
        detail: `Reageerde op ${eng.fromLead} van ${eng.fromUs} berichten`, points: pts,
      });
    }
  }

  // 5. Recency — 15, and it cuts both ways. Someone who wrote this morning is
  //    warm; someone who has not written in a fortnight is not urgent, they are
  //    a re-engagement problem, and the categories below say so.
  if (silent != null) {
    let pts;
    if (silent <= 1) pts = 15;
    else if (silent <= T.QUIET_DAYS) pts = 11;
    else if (silent <= T.AT_RISK_DAYS) pts = 8;
    else if (silent <= T.COLD_DAYS) pts = 5;
    else pts = 2;
    score += pts;
    if (silent <= 1) reasons.push({ key: 'recent', label: 'Recent contact', detail: 'Reageerde in de laatste 24 uur', points: pts });
    else if (silent > T.COLD_DAYS) reasons.push({ key: 'stale', label: 'Lang stil', detail: `${Math.floor(silent)} dagen geen reactie`, points: pts });
  }

  // ── Penalties ─────────────────────────────────────────────────────────────
  // A booked appointment is the outcome this whole page is chasing. Once it
  // exists there is nothing to do, and leaving these near the top is exactly
  // how a "what needs attention" list fills up with things that do not.
  if (lead.afspraakGeboekt) {
    score = Math.round(score * 0.15);
    reasons.push({ key: 'booked', label: 'Afspraak staat al', detail: 'Er is al een afspraak geboekt', points: 0, negative: true });
  }

  // Terminal states are not opportunities.
  const state = String(lead.status || '').toLowerCase();
  if (/verloren|lost|afgehaakt|geen interesse/.test(state)) {
    score = 0;
    reasons.push({ key: 'lost', label: 'Verloren', detail: 'Deze lead is als verloren gemarkeerd', points: 0, negative: true });
  }

  // No phone number means no follow-up and no call: whatever else is true, the
  // system cannot act, so it should not be told to.
  if (!lead.telefoon) {
    score = Math.round(score * 0.5);
    reasons.push({ key: 'no_phone', label: 'Geen telefoonnummer', detail: 'Opvolgen via WhatsApp is niet mogelijk', points: 0, negative: true });
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    reasons: reasons.sort((a, b) => (b.points || 0) - (a.points || 0)),
    budget, silent, engagement: eng,
  };
}

/* ── Categories ──────────────────────────────────────────────────────────────
   Ordered most-urgent first, and the FIRST match wins. A lead is in exactly one
   bucket, because a list where the same person appears three times is a list
   nobody trusts to be a count of anything. */
const CATEGORIES = [
  {
    key: 'ready_to_book',
    label: 'Klaar om te boeken',
    icon: 'calendar',
    tone: 'ready',
    test: (l, s) => l.qualified && !l.afspraakGeboekt && Boolean(l.telefoon)
      && s.silent != null && s.silent <= T.QUIET_DAYS,
    why: () => 'Gekwalificeerd, recent in gesprek en er staat nog geen bezichtiging.',
  },
  {
    key: 'high_priority',
    label: 'Hoge prioriteit',
    icon: 'flame',
    tone: 'hot',
    test: (l, s) => !l.afspraakGeboekt && s.score >= 65,
    why: () => 'Sterk gekwalificeerde koper met duidelijke intentie, zonder afspraak.',
  },
  {
    key: 'at_risk',
    label: 'Dreigt af te koelen',
    icon: 'alert',
    tone: 'risk',
    test: (l, s) => !l.afspraakGeboekt && s.silent != null
      && s.silent > T.AT_RISK_DAYS && s.silent <= T.COLD_DAYS
      && (l.qualified || l.leadScore >= 6),
    why: (l, s) => `Was betrokken, maar reageert al ${Math.floor(s.silent)} dagen niet meer.`,
  },
  {
    key: 'high_value',
    label: 'Hoge waarde',
    icon: 'euro',
    tone: 'value',
    test: (l, s, ctx) => !l.afspraakGeboekt && s.budget != null
      && (s.budget >= T.HIGH_VALUE_EUR || s.budget >= ctx.budgetP80),
    why: (l, s) => `Bovengemiddeld budget voor jouw portefeuille: ${fmtEur(s.budget)}.`,
  },
  {
    key: 'gone_cold',
    label: 'Afgekoeld',
    icon: 'snow',
    tone: 'cold',
    test: (l, s) => !l.afspraakGeboekt && l.qualified
      && s.silent != null && s.silent > T.COLD_DAYS,
    why: (l, s) => `Gekwalificeerd maar al ${Math.floor(s.silent)} dagen stil.`,
  },
];

/* ── Next best action ────────────────────────────────────────────────────────
   Only actions the system can actually carry out. Recommending "send a
   WhatsApp" to a lead whose 24-hour window closed is worse than recommending
   nothing: the user clicks, it fails, and they stop believing the column. */
function nextAction(lead, s, ctx) {
  if (!lead.telefoon && lead.gesprek) {
    return { key: 'review', label: 'Gesprek bekijken', reason: 'Geen telefoonnummer om op te volgen.' };
  }
  if (!lead.telefoon) {
    return { key: 'none', label: 'Geen actie mogelijk', reason: 'Deze lead heeft geen contactgegevens.' };
  }

  const win = data.messagingWindow(lead);

  if (lead.afspraakGeboekt) {
    return { key: 'review', label: 'Gesprek bekijken', reason: 'De afspraak staat al; niets te doen.' };
  }

  // Booking beats messaging when the lead is qualified and the calendar can
  // actually confirm a slot. Without a connected calendar this would be an
  // invitation to promise a time nobody can honour.
  if (lead.qualified && ctx.calendarConnected && win.open) {
    return {
      key: 'book', label: 'Afspraak inplannen',
      reason: 'Gekwalificeerd en bereikbaar — stel een bezichtiging voor.',
    };
  }

  if (win.open) {
    return {
      key: 'follow_up', label: 'Opvolgen',
      reason: `WhatsApp-venster nog ${win.hoursLeft} uur open.`,
    };
  }

  // Window shut: WhatsApp free-form is not permitted, so the honest advice is
  // a phone call, which the user can do and the system is not pretending to.
  return {
    key: 'call', label: 'Bellen',
    reason: win.reason === 'no_inbound_timestamp'
      ? 'Deze lead heeft nooit zelf geantwoord, dus WhatsApp mag niet.'
      : 'Het 24-uursvenster is gesloten; WhatsApp mag alleen nog met een template.',
  };
}

/* ── Assembly ────────────────────────────────────────────────────────────────
   One pass over the tenant's leads, producing the whole page. */
function analyse(leads, opts = {}) {
  const calendarConnected = Boolean(opts.calendarConnected);

  const budgets = leads.map((l) => data.parseBudget(l.verwachteWaarde)).filter((b) => b > 0).sort((a, b) => a - b);
  const ctx = {
    calendarConnected,
    topBudget: budgets.length ? budgets[budgets.length - 1] : 0,
    // 80th percentile, so "high value" means high FOR THIS TENANT. With fewer
    // than five recorded budgets a percentile is noise, so it falls back to the
    // absolute threshold and the category simply fires less often.
    budgetP80: budgets.length >= 5 ? budgets[Math.floor(budgets.length * 0.8)] : T.HIGH_VALUE_EUR,
  };

  const scored = leads.map((lead) => {
    const s = scoreLead(lead, ctx);
    const category = CATEGORIES.find((c) => c.test(lead, s, ctx)) || null;
    return {
      id: lead.id,
      name: lead.naam || 'Naamloze lead',
      phone: lead.telefoon || '',
      score: s.score,
      leadScore: lead.leadScore || 0,
      qualified: Boolean(lead.qualified),
      booked: Boolean(lead.afspraakGeboekt),
      budget: s.budget,
      budgetText: lead.verwachteWaarde || '',
      timing: lead.urgentie || '',
      source: lead.bron || '',
      status: lead.status || '',
      summary: lead.samenvatting || '',
      silentDays: s.silent == null ? null : Math.floor(s.silent),
      lastInboundAt: data.lastInboundAt(lead),
      engagement: s.engagement,
      reasons: s.reasons,
      category: category ? category.key : null,
      categoryLabel: category ? category.label : '',
      categoryTone: category ? category.tone : '',
      why: category ? category.why(lead, s, ctx) : '',
      action: nextAction(lead, s, ctx),
      hasConversation: Boolean(lead.gesprek),
    };
  });

  const opportunities = scored
    .filter((o) => o.category && o.score >= T.MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  return {
    opportunities: opportunities.slice(0, T.TOP_N),
    totalOpportunities: opportunities.length,
    byCategory: CATEGORIES.map((c) => ({
      key: c.key, label: c.label, tone: c.tone, icon: c.icon,
      count: opportunities.filter((o) => o.category === c.key).length,
    })).filter((c) => c.count > 0),
    all: scored,
    ctx,
  };
}

/* ── Revenue overview ────────────────────────────────────────────────────────
   Potential and closed are kept rigidly apart. Potential pipeline is the sum
   of budgets on live opportunities — it is a forecast, and calling it revenue
   would be a lie the customer discovers at the end of the month. */
function overview(leads, scored) {
  const base = require('./_leads-read').computeStats(leads);

  const live = scored.filter((o) => !o.booked && !/verloren|lost|afgehaakt/i.test(o.status));
  const potentialPipeline = live
    .filter((o) => o.qualified && o.budget)
    .reduce((sum, o) => sum + o.budget, 0);

  const bookedValue = scored
    .filter((o) => o.booked && o.budget)
    .reduce((sum, o) => sum + o.budget, 0);

  return {
    potentialPipeline,
    bookedValue,
    qualified: base.qualified,
    appointments: base.booked,
    conversion: base.conversionRate,
    totalLeads: base.total,
    avgResponseTime: base.avgResponseTime,
    // Present only when there is something real behind it; the UI hides the
    // tile rather than printing a confident zero.
    hasBudgetData: scored.some((o) => o.budget > 0),
  };
}

/* ── Recovered ───────────────────────────────────────────────────────────────
   The brief's "Revenue Opportunities Recovered", stated as what it actually is.
   A lead counts as recovered when the system re-engaged it and it then reached
   an appointment — meaning: it had gone quiet past the at-risk threshold, and
   it is now booked. That is a claim the records support. Anything looser (every
   booked lead, or every lead Helvaro ever messaged) would be taking credit for
   the whole business. */
function recovered(leads, scored) {
  const recoveredLeads = leads.filter((l) => {
    if (!l.afspraakGeboekt) return false;
    const turns = data.parseConversation(l.gesprek);
    if (turns.length < 3) return false;
    // Find the longest gap between a lead message and our next one. A gap past
    // the at-risk threshold followed by a booking is the recovery.
    let biggestGap = 0;
    for (let i = 1; i < turns.length; i++) {
      if (turns[i - 1].at && turns[i].at) {
        biggestGap = Math.max(biggestGap, (turns[i].at - turns[i - 1].at) / DAY);
      }
    }
    return biggestGap >= T.AT_RISK_DAYS;
  });

  const value = recoveredLeads
    .map((l) => data.parseBudget(l.verwachteWaarde))
    .filter((b) => b > 0)
    .reduce((a, b) => a + b, 0);

  return {
    count: recoveredLeads.length,
    potentialValue: value,
    leadIds: recoveredLeads.map((l) => l.id),
  };
}

/* ── Insight engine ──────────────────────────────────────────────────────────
   Observations, each with a minimum sample size, each computed rather than
   written. An insight that cannot clear its own threshold is not softened, it
   is simply not produced — "not enough data yet" is a better answer than a
   pattern three leads wide. */
function insights(leads, scored, ov) {
  const out = [];
  const now = Date.now();
  const inWindow = (l, days) => {
    const t = Date.parse(l.datum);
    return Number.isFinite(t) && t >= now - days * DAY;
  };

  // 1. Source performance. Needs two sources with a real sample each.
  const bySource = {};
  leads.forEach((l) => {
    const k = l.bron || 'Onbekend';
    const s = bySource[k] || (bySource[k] = { source: k, total: 0, booked: 0 });
    s.total += 1;
    if (l.afspraakGeboekt) s.booked += 1;
  });
  const ranked = Object.values(bySource)
    .filter((s) => s.total >= 5)
    .map((s) => ({ ...s, rate: s.booked / s.total }))
    .sort((a, b) => b.rate - a.rate);
  if (ranked.length >= 2 && ranked[0].rate > 0 && ranked[ranked.length - 1].rate > 0) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const factor = best.rate / worst.rate;
    if (factor >= 1.3) {
      out.push({
        key: 'source',
        text: `${best.source}-leads converteren ${factor.toFixed(1)}× beter naar een afspraak dan ${worst.source}-leads.`,
        detail: `${best.source}: ${best.booked}/${best.total} · ${worst.source}: ${worst.booked}/${worst.total}`,
      });
    }
  }

  // 2. When qualified leads arrive. Needs 10 to be worth saying out loud.
  const qualifiedTimes = leads.filter((l) => l.qualified && l.datum)
    .map((l) => new Date(l.datum).getHours()).filter((h) => Number.isFinite(h));
  if (qualifiedTimes.length >= 10) {
    const buckets = [0, 0, 0, 0, 0, 0];
    qualifiedTimes.forEach((h) => { buckets[Math.min(5, Math.floor(h / 4))] += 1; });
    const top = buckets.indexOf(Math.max(...buckets));
    const share = buckets[top] / qualifiedTimes.length;
    if (share >= 0.3) {
      out.push({
        key: 'timing',
        text: `De meeste gekwalificeerde leads melden zich tussen ${top * 4}:00 en ${top * 4 + 4}:00.`,
        detail: `${buckets[top]} van ${qualifiedTimes.length} gekwalificeerde leads.`,
      });
    }
  }

  // 3. Qualified without an appointment — the single most actionable number on
  //    the page, and it needs no threshold because it is a count, not a trend.
  const stranded = scored.filter((o) => o.qualified && !o.booked).length;
  if (stranded >= 3) {
    const value = scored.filter((o) => o.qualified && !o.booked && o.budget)
      .reduce((s, o) => s + o.budget, 0);
    out.push({
      key: 'stranded',
      text: `${stranded} gekwalificeerde leads hebben nog geen afspraak.`,
      detail: value > 0 ? `Samen ${fmtEur(value)} aan potentiële pipeline.` : '',
    });
  }

  // 4. Response time, this week against last. Needs both weeks populated.
  const thisWeek = leads.filter((l) => inWindow(l, 7) && l.reactietijd > 0).map((l) => l.reactietijd);
  const lastWeek = leads.filter((l) => !inWindow(l, 7) && inWindow(l, 14) && l.reactietijd > 0).map((l) => l.reactietijd);
  if (thisWeek.length >= 5 && lastWeek.length >= 5) {
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const a = avg(thisWeek); const b = avg(lastWeek);
    const change = ((b - a) / b) * 100;
    if (Math.abs(change) >= 15) {
      out.push({
        key: 'response',
        text: change > 0
          ? `Je reactietijd verbeterde met ${Math.round(change)}% deze week.`
          : `Je reactietijd werd ${Math.round(-change)}% trager deze week.`,
        detail: `${Math.round(a)}s deze week tegenover ${Math.round(b)}s vorige week.`,
      });
    }
  }

  // 5. Which budget band actually books. Needs bands with a real sample.
  const bands = [
    { label: 'onder €300k', min: 0, max: 300000 },
    { label: '€300k–€400k', min: 300000, max: 400000 },
    { label: '€400k–€500k', min: 400000, max: 500000 },
    { label: 'boven €500k', min: 500000, max: Infinity },
  ].map((b) => {
    const inBand = scored.filter((o) => o.budget != null && o.budget >= b.min && o.budget < b.max);
    return { ...b, total: inBand.length, booked: inBand.filter((o) => o.booked).length };
  }).filter((b) => b.total >= 5);
  if (bands.length >= 2) {
    const best = bands.map((b) => ({ ...b, rate: b.booked / b.total })).sort((a, b) => b.rate - a.rate)[0];
    if (best.rate > 0) {
      out.push({
        key: 'band',
        text: `Je ${best.label}-leads boeken het vaakst een afspraak.`,
        detail: `${best.booked} van ${best.total} leads in deze categorie.`,
      });
    }
  }

  return out;
}

/* ── Daily briefing ──────────────────────────────────────────────────────────
   The three-line version of the page, for the top of the screen and for the
   notification body. Written from the same numbers, never separately. */
function briefing(analysis, ov, appointmentsToday) {
  const opps = analysis.opportunities;
  const atRisk = analysis.byCategory.find((c) => c.key === 'at_risk');
  const top = opps[0] || null;

  return {
    counts: {
      opportunities: analysis.totalOpportunities,
      appointments: appointmentsToday,
      atRisk: atRisk ? atRisk.count : 0,
      potentialPipeline: ov.potentialPipeline,
    },
    top: top ? {
      id: top.id,
      name: top.name,
      // One sentence, assembled from facts rather than generated. It reads like
      // a sentence because the clauses are ordered, not because a model wrote
      // it — and it therefore cannot say anything untrue.
      line: [
        top.budget ? `${top.name} is een ${fmtEur(top.budget)}-koper` : `${top.name} is een lead`,
        top.timing ? `met urgentie "${top.timing.toLowerCase()}"` : null,
        top.leadScore ? `en een leadscore van ${top.leadScore}/10` : null,
      ].filter(Boolean).join(' ') + (top.booked ? '.' : ', en heeft nog geen afspraak.'),
      action: top.action,
    } : null,
  };
}

/* ── Formatting ────────────────────────────────────────────────────────────── */
const EUR = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
function fmtEur(n) {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1000000) return '€' + (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 2).replace('.', ',') + 'M';
  return EUR.format(n);
}

/**
 * The whole Command Center payload for one tenant.
 * Takes leads that are ALREADY tenant-scoped — this module never fetches, so
 * it has no way to widen a query it was not given.
 */
function build(leads, opts = {}) {
  const analysis = analyse(leads, opts);
  const ov = overview(leads, analysis.all);
  return {
    overview: ov,
    opportunities: analysis.opportunities,
    totalOpportunities: analysis.totalOpportunities,
    categories: analysis.byCategory,
    insights: insights(leads, analysis.all, ov),
    recovered: recovered(leads, analysis.all),
    briefing: briefing(analysis, ov, opts.appointmentsToday || 0),
    calendarConnected: Boolean(opts.calendarConnected),
  };
}

module.exports = {
  build, analyse, overview, insights, recovered, briefing,
  scoreLead, nextAction, silenceDays, engagement, fmtEur,
  CATEGORIES, T,
};
