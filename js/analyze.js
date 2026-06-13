// analyze.js — pure analysis over the normalized model from parse.js.
//
// Every monetary aggregate is computed PER CURRENCY (never summed across
// currencies). No DOM, no I/O — testable in Node, reusable in the browser.
//
// Net column recap (per row, per person): net_i = paid_i - share_i, sums to ~0.

const round = (n) => Math.round(n * 100) / 100;

export function forCurrency(model, currency) {
  const rows = model.rows.filter((r) => r.currency === currency);
  return {
    expenses: rows.filter((r) => r.kind === 'expense'),
    payments: rows.filter((r) => r.kind === 'payment'),
  };
}

// ── Headline KPIs (lean) ─────────────────────────────────────────────────────
export function kpis(model, currency) {
  const { expenses } = forCurrency(model, currency);
  const costs = expenses.map((r) => r.cost);
  const dates = expenses.map((r) => r.date).filter((d) => d && !isNaN(d)).sort((a, b) => a - b);
  return {
    currency,
    people: model.people.length,
    transactions: expenses.length,
    groupSpend: round(costs.reduce((a, c) => a + c, 0)),
    largest: round(costs.length ? Math.max(...costs) : 0),
    from: dates[0] ? dates[0].toISOString().slice(0, 10) : null,
    to: dates[dates.length - 1] ? dates[dates.length - 1].toISOString().slice(0, 10) : null,
  };
}

// ── Spend by category (sorted desc, with % of total) ────────────────────────
export function spendByCategory(model, currency) {
  const { expenses } = forCurrency(model, currency);
  const total = expenses.reduce((a, r) => a + r.cost, 0);
  const map = {};
  for (const r of expenses) {
    const c = r.category || '(uncategorized)';
    map[c] = (map[c] || 0) + r.cost;
  }
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount: round(amount), pct: total ? round((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

// ── Spend over time (monthly, chronological) ────────────────────────────────
export function spendByMonth(model, currency) {
  const { expenses } = forCurrency(model, currency);
  const map = {};
  for (const r of expenses) {
    if (!r.date || isNaN(r.date)) continue;
    const key = r.date.toISOString().slice(0, 7);
    map[key] = (map[key] || 0) + r.cost;
  }
  return Object.entries(map)
    .map(([month, amount]) => ({ month, amount: round(amount) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ── Per-person share / paid / balance ───────────────────────────────────────
// share : what this person actually consumed (their portion of the bills).
// paid  : what they fronted out of pocket.
// balance = paid - share  (>0 owed, <0 owes; matches Splitwise net).
//
// Reconstruction from the net column:
//   • borrowers (net<0) paid nothing ⇒ share = -net               (exact)
//   • the single payer's share = cost - sum(borrower shares)      (exact)
//   • multi-payer rows can't be split from the export ⇒ that row's
//     payer portion is divided equally and counted in `approxRows`.
export function perPersonShare(model, currency) {
  const { expenses } = forCurrency(model, currency);
  const acc = Object.fromEntries(model.people.map((p) => [p, { share: 0, paid: 0, byCategory: {} }]));
  const bump = (p, cat, amt) => { acc[p].byCategory[cat] = (acc[p].byCategory[cat] || 0) + amt; };
  let approxRows = 0;

  for (const r of expenses) {
    const cat = r.category || '(uncategorized)';
    const payers = model.people.filter((p) => r.net[p] > 0.005);
    const borrowers = model.people.filter((p) => r.net[p] < -0.005);

    let borrowerShare = 0;
    for (const p of borrowers) {
      const s = -r.net[p];
      acc[p].share += s; bump(p, cat, s); borrowerShare += s;
    }
    const payerShare = r.cost - borrowerShare;

    if (payers.length === 1) {
      const p = payers[0];
      acc[p].share += payerShare; acc[p].paid += r.cost; bump(p, cat, payerShare);
    } else if (payers.length > 1) {
      approxRows++;
      const s = payerShare / payers.length, pd = r.cost / payers.length;
      for (const p of payers) { acc[p].share += s; acc[p].paid += pd; bump(p, cat, s); }
    }
  }

  const people = model.people.map((p) => ({
    person: p,
    share: round(acc[p].share),
    paid: round(acc[p].paid),
    balance: round(acc[p].paid - acc[p].share),
    byCategory: Object.fromEntries(Object.entries(acc[p].byCategory).map(([k, v]) => [k, round(v)])),
  }));
  return { people, approxRows };
}

// ── Bundle for one currency ─────────────────────────────────────────────────
export function analyzeCurrency(model, currency) {
  return {
    kpis: kpis(model, currency),
    byCategory: spendByCategory(model, currency),
    byMonth: spendByMonth(model, currency),
    share: perPersonShare(model, currency),
  };
}
