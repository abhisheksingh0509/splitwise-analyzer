// Quick Node test harness for parse.js — no dependencies.
// Run: node test/run.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalize } from '../js/parse.js';
import { analyzeCurrency } from '../js/analyze.js';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal RFC-4180-ish CSV → array of arrays. Handles "quoted, fields" and "".
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const file = process.argv[2] || 'trip.csv';
const csv = readFileSync(join(here, file), 'utf8');
const model = normalize(parseCSV(csv));

const expenses = model.rows.filter((r) => r.kind === 'expense');
const payments = model.rows.filter((r) => r.kind === 'payment');

console.log(`Fixture       : ${file}`);
console.log('People        :', model.people);
console.log('Currencies    :', model.currencies);
console.log('Expense rows  :', expenses.length);
console.log('Payment rows  :', payments.length);
console.log('Total balance :', model.totalBalanceRow ? model.totalBalanceRow.net : '(none)');
console.log('Group spend   :', expenses.reduce((a, r) => a + r.cost, 0).toFixed(2));

// Spend by category (quick sanity peek)
const byCat = {};
for (const r of expenses) byCat[r.category] = (byCat[r.category] || 0) + r.cost;
console.log('By category   :', Object.fromEntries(
  Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(2)])
));

console.log('Warnings      :', model.warnings.length ? model.warnings : '(none)');

// Assertions (generic — no hard-coded counts beyond structural invariants)
let failed = 0;
const check = (name, cond) => { if (!cond) { failed++; console.error('  FAIL:', name); } };
check('people detected', model.people.length > 0);
check('person names with spaces intact', model.people.some((p) => p.includes(' ')));
check('expenses found', expenses.length > 0);
check('payments classified', payments.length > 0);
check('Total balance row captured (not counted as expense)', !!model.totalBalanceRow);
check('Total balance excluded from expense rows',
  !expenses.some((r) => r.description.toLowerCase() === 'total balance'));
check('no net-balance mismatch warnings (group is settled)',
  !model.warnings.some((w) => w.includes('mismatch')));

// ── analyze.js sanity ───────────────────────────────────────────────────────
const a = analyzeCurrency(model, model.currencies[0]);
console.log('\n── ANALYSIS (' + model.currencies[0] + ') ──');
console.log('KPIs          :', a.kpis);
console.log('Multi-payer rows (approx):', a.share.approxRows);
console.log('Per-person share / paid / balance:');
for (const p of a.share.people) {
  console.log(`  ${p.person.padEnd(18)} share ${String(p.share).padStart(9)}  paid ${String(p.paid).padStart(9)}  balance ${p.balance}`);
}

const shareTotal = a.share.people.reduce((s, p) => s + p.share, 0);
const paidTotal = a.share.people.reduce((s, p) => s + p.paid, 0);
check('shares reconstitute group spend', Math.abs(shareTotal - a.kpis.groupSpend) < 1);
check('paid reconstitutes group spend', Math.abs(paidTotal - a.kpis.groupSpend) < 1);
check('balances sum to ~0', Math.abs(a.share.people.reduce((s, p) => s + p.balance, 0)) < 0.5);
check('category percentages sum to ~100', Math.abs(a.byCategory.reduce((s, c) => s + c.pct, 0) - 100) < 1);

console.log(failed ? `\n${failed} assertion(s) FAILED` : '\nAll assertions passed ✓');
process.exit(failed ? 1 : 0);
