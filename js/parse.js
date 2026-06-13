// parse.js — pure, dependency-free normalization of a Splitwise CSV export.
//
// Input  : `rawRows` = array of string arrays (first row = header), as produced
//          by a CSV parser (PapaParse in the browser, or a tiny splitter in tests).
// Output : a normalized model (see CLAUDE.md "Data model").
//
// This file does NO file/network I/O and touches NO DOM, so it is identical in
// the browser and under Node — which is what makes it testable.

import { categorize as defaultCategorize } from './categorize.js';

const SUMMARY_DESC = 'total balance';
const PAYMENT_CATEGORY = 'payment';
const GENERIC_CATEGORIES = new Set(['', 'general', 'uncategorized']);
// Settlements are sometimes logged under a normal category (e.g. "Settle all
// balances" tagged General). Treat a row as a settlement if its description
// reads like one AND the money only moves between two people.
const SETTLEMENT_DESC = /\b(settle|paid)\b/i;

// Coerce a Splitwise money cell to a Number. Strips currency symbols and
// thousands separators; blank / "-" / garbage -> 0.
export function num(value) {
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Locate the fixed columns by header name (case-insensitive, trimmed).
function indexColumns(header) {
  const find = (name) =>
    header.findIndex((h) => String(h).trim().toLowerCase() === name);
  return {
    date: find('date'),
    description: find('description'),
    category: find('category'),
    cost: find('cost'),
    currency: find('currency'),
  };
}

export function normalize(rawRows, options = {}) {
  const categorize = options.categorize || defaultCategorize;
  const warnings = [];

  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return { people: [], currencies: [], rows: [], totalBalanceRow: null,
      warnings: ['Empty file — no rows found.'] };
  }

  const header = rawRows[0].map((h) => String(h).trim());
  const idx = indexColumns(header);

  if (idx.currency === -1) {
    warnings.push('No "Currency" column found — cannot locate person columns reliably.');
  }
  for (const [k, v] of Object.entries(idx)) {
    if (v === -1) warnings.push(`Expected column "${k}" not found in header.`);
  }

  // Everything after the Currency column is a person. Names may contain spaces.
  const peopleStart = idx.currency === -1 ? header.length : idx.currency + 1;
  const people = header.slice(peopleStart).filter((h) => h !== '');
  if (people.length === 0) warnings.push('No person columns detected after "Currency".');

  const rows = [];
  let totalBalanceRow = null;
  let recategorized = 0;
  const currencies = new Set();

  for (let r = 1; r < rawRows.length; r++) {
    const raw = rawRows[r];
    if (!raw || raw.every((c) => String(c).trim() === '')) continue; // skip blank lines

    const description = String(raw[idx.description] ?? '').trim();
    const category = String(raw[idx.category] ?? '').trim();
    const dateStr = String(raw[idx.date] ?? '').trim();
    const costStr = String(raw[idx.cost] ?? '').trim();
    const currency = String(raw[idx.currency] ?? '').trim();

    const net = {};
    people.forEach((p, i) => { net[p] = num(raw[peopleStart + i]); });

    const nonZeroPeople = people.filter((p) => Math.abs(net[p]) > 0.005).length;

    // Classify the row.
    let kind;
    if (description.toLowerCase() === SUMMARY_DESC || (dateStr === '' && costStr === '')) {
      kind = 'summary';
    } else if (category.toLowerCase() === PAYMENT_CATEGORY) {
      kind = 'payment';
    } else if (nonZeroPeople === 2 && SETTLEMENT_DESC.test(description)) {
      // Settlement disguised under a normal category — money moved between two
      // people and the description says so. Auto-exclude from spend.
      kind = 'payment';
      warnings.push(
        `Row ${r + 1} ("${description}"): looks like a settlement (₹${num(costStr)} between 2 people) though tagged "${category}" — treated as a payment, not spend.`
      );
    } else {
      kind = 'expense';
    }

    // Refine the catch-all "General"/blank category from description keywords
    // (expenses only; real categories and payments are left untouched).
    let displayCategory = category;
    if (kind === 'expense' && GENERIC_CATEGORIES.has(category.toLowerCase())) {
      const guessed = categorize(description);
      if (guessed) { displayCategory = guessed; recategorized++; }
      else if (category === '') displayCategory = 'General';
    }

    const row = {
      date: dateStr ? new Date(dateStr) : null,
      dateStr,
      description,
      category: displayCategory,
      categoryRaw: category,
      cost: num(costStr),
      currency,
      net,
      kind,
    };

    if (kind === 'summary') {
      totalBalanceRow = row;
      continue; // not a transaction; don't add to rows
    }

    if (currency) currencies.add(currency);

    // Per-expense validation: person nets should sum to ~0.
    if (kind === 'expense') {
      const sum = people.reduce((a, p) => a + net[p], 0);
      if (Math.abs(sum) > 0.5) {
        warnings.push(
          `Row ${r + 1} ("${description}"): person columns sum to ${sum.toFixed(2)}, expected ~0.`
        );
      }
      if (row.date && isNaN(row.date.getTime())) {
        warnings.push(`Row ${r + 1} ("${description}"): unparseable date "${dateStr}".`);
      }
    }

    rows.push(row);
  }

  if (currencies.size > 1) {
    warnings.push(`Multiple currencies detected (${[...currencies].join(', ')}). Figures are grouped per currency; never summed across.`);
  }

  // Cross-check computed net balances against the Total balance row, if present.
  if (totalBalanceRow) {
    people.forEach((p) => {
      const computed = rows.reduce((a, row) => a + row.net[p], 0);
      const declared = totalBalanceRow.net[p];
      if (Math.abs(computed - declared) > 0.5) {
        warnings.push(
          `Net balance mismatch for ${p}: computed ${computed.toFixed(2)} vs Total balance ${declared.toFixed(2)}.`
        );
      }
    });
  }

  return { people, currencies: [...currencies], rows, totalBalanceRow, warnings, recategorized };
}

// Combine several parsed models (one per uploaded file) into one.
// Requires every file to have the EXACT same set of people (order doesn't
// matter — rows key their nets by name). Throws a descriptive Error otherwise,
// so the caller can show it and merge nothing.
export function mergeModels(entries) {
  if (!entries.length) throw new Error('No files to combine.');
  const base = entries[0];
  const baseSet = new Set(base.model.people);

  for (const e of entries.slice(1)) {
    const set = new Set(e.model.people);
    const extra = e.model.people.filter((p) => !baseSet.has(p));
    const missing = base.model.people.filter((p) => !set.has(p));
    if (extra.length || missing.length) {
      const parts = [];
      if (extra.length) parts.push(`extra: ${extra.join(', ')}`);
      if (missing.length) parts.push(`missing: ${missing.join(', ')}`);
      throw new Error(
        `"${e.name}" has a different set of people than "${base.name}" (${parts.join('; ')}). ` +
        `All files must contain the exact same people to be combined.`
      );
    }
  }

  const rows = [];
  const currencies = new Set();
  const warnings = [];
  let recategorized = 0;
  const multi = entries.length > 1;
  for (const e of entries) {
    for (const r of e.model.rows) rows.push(r);
    for (const c of e.model.currencies) currencies.add(c);
    for (const w of e.model.warnings) warnings.push(multi ? `[${e.name}] ${w}` : w);
    recategorized += e.model.recategorized || 0;
  }
  return {
    people: base.model.people,
    currencies: [...currencies],
    rows,
    totalBalanceRow: null, // per-file balances were validated during each normalize()
    warnings,
    recategorized,
    sources: entries.map((e) => e.name),
  };
}
