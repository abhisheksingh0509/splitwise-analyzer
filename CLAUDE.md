# Splitwise Analyser

A **client-side, privacy-first** web app that takes a Splitwise CSV export and produces an on-the-fly spend analysis. Hostable as a static site on **GitHub Pages**.

> Core promise: **nothing leaves the browser.** No upload to any server, no storage, no cookies, no analytics. The file is parsed in memory and discarded on refresh.

---

## 1. The input: Splitwise CSV export

Splitwise's "Export as spreadsheet (CSV)" produces a file shaped like this:

```
Date,Description,Category,Cost,Currency,Vikram Singh,Priya Sen
2022-07-05,kitchen stuffs,Household supplies,1338,INR,-669,669
2022-07-05,stuffs,General,1139,INR,569.5,-569.5
2022-07-06,Big basket,Groceries,1073,INR,536.5,-536.5
2022-07-06,Ola,Taxi,99,INR,99,-99
...
2022-12-31,Total balance,,,INR,1234.5,-1234.5
```

### Column contract

| Column        | Meaning |
|---------------|---------|
| `Date`        | Expense date, `YYYY-MM-DD`. |
| `Description` | Free text. |
| `Category`    | Splitwise category (e.g. Groceries, Taxi). The literal value `Payment` marks a **settle-up**, not an expense. |
| `Cost`        | Total cost of the expense (what was actually spent), in the row's currency. |
| `Currency`    | ISO-ish currency code (INR, USD, EUR, ...). A single group can contain multiple currencies. |
| `<Person 1>` … `<Person N>` | **Variable count, names vary per group.** Each cell is that person's *net* for the row: `amount they paid − their share`. Positive = they are owed (net lender); negative = they owe (net borrower). The person columns of a normal expense row sum to ~0. |

### Structural facts we must handle (don't assume)
- **Person columns are dynamic**: anything after `Currency` is a person. Could be 2 people or 10. Names contain spaces. Detect them as "all headers after the `Currency` column".
- **`Total balance` summary row**: Splitwise appends a final row with `Description = "Total balance"` and empty `Cost`/`Date`. It is **not a transaction** — exclude it from spend analysis, but use it to *validate* our computed net balances.
- **`Payment` rows**: `Category == "Payment"` are settle-ups (money moving between people), **not spend**. Exclude from spend totals; optionally show separately as a "settlements" section.
- **Disguised settlements (DECIDED: auto-exclude)**: users sometimes log a settle-up under a normal category (real example: `"Settle all balances"` tagged `General`). Rule: a non-`Payment` row is reclassified as `payment` when **exactly 2 people have a non-zero net** AND the description matches `/\b(settle|paid)\b/i`. The keyword guard avoids dropping genuine 2-person shared expenses. Always emit a warning when this fires so it's visible.
- **Numbers**: may have decimals (`.5`), may be negative, may have thousands separators or currency symbols in some locales — strip non-numeric chars defensively. Empty cells = 0.
- **Encoding/quoting**: descriptions can contain commas → must use a real CSV parser (quoted fields), not `split(',')`.
- **Multiple currencies**: do **not** sum across currencies. Group every monetary aggregate by currency, or let the user pick one currency to view at a time.

### Validation / sanity checks (surface to user, don't crash)
- For each expense row, person columns should sum to ≈ 0 (within rounding). Flag rows that don't.
- Computed final net per person (sum of their column over expense + payment rows) should match the `Total balance` row if present.
- Warn if: no person columns found, unparyseable dates, mixed currencies.

---

## 2. Analyses to produce

All figures are **per currency**. "Spend" excludes `Payment` rows and the `Total balance` row.

### Headline KPIs
- Date range covered, number of transactions, number of people.
- **Total group spend** (sum of `Cost`).
- Total settled (sum of `Payment` rows).
- Average / median transaction size.
- **Current net balance per person** (who owes whom, and the minimal settle-up suggestion).

### Layout (REVISED — lean: one general view, then personalised)
Deliberately not bloated. KPIs trimmed to: group spend, people, date range, largest expense (dropped avg & total-settled). Then:

1. **GENERAL — "Each person's share of the trip"** (the headline): per-person `share` / `% of spend` / `paid`. (The pre-settlement "difference" column was removed — it read like an outstanding debt even after a group had settled, which was misleading.) Plus spend by category and spend over time.
2. **PERSONALISED — "Your trip, <name>"**: selected person's share, share-of-total %, paid, share-by-category, and comparison vs the group average.

### Multi-file import (`parse.js > mergeModels`)
Users can upload several exports (multi-select, multi-drop, or **+ add another file** — accumulated across uploads). Each file is `normalize()`d (and validated) on its own, then merged. **Hard rule:** all files must have the **exact same set of people** (order-independent — rows key nets by name). A file with an extra/missing person throws a descriptive Error naming the difference; nothing merges and the previous state is preserved. Merged model: rows concatenated, currencies unioned, per-file warnings prefixed `[file]`, `totalBalanceRow` dropped (each file's balance was already validated), `sources` lists filenames.

### Category refinement (`categorize.js`)
Splitwise's "General" bucket mixes unrelated spend. A keyword map (`CATEGORY_RULES`, ordered, first-match-wins) refines **only** `General`/blank **expense** rows into finer categories (Accommodation, Transport, Liquor, Groceries, Activities, Food & drinks, Shopping, Household). Real categories and payments are untouched. The original is kept as `categoryRaw`; unmatched rows stay `General`. `model.recategorized` counts hits and the UI shows a transparency note. Conservative by design — ambiguous descriptions (e.g. "Fifth Generation") are left as General rather than guessed.

Removed from the page: who-bankrolled chart, net-balances & settle-up section, top-expenses table, settlements table (kept lean per user request; can be re-added).

### Per-person share IS recoverable (supersedes the earlier "estimate only" note)
The net column is `paid − share`. For a **single-payer** expense (the Splitwise default, and 100% of the sample trip) the share is **exactly** recoverable — no equal-split guess needed:
- borrowers (`net < 0`) paid nothing ⇒ `share = −net`;
- the single payer's `share = cost − Σ(borrower shares)`; their `paid = cost`.
Then `balance = paid − share` (matches the net). Only **multi-payer** rows (≥2 positive nets) can't be split from the export — those divide the payer portion equally and are surfaced via an `approxRows` count + UI note. Implemented in `analyze.js > perPersonShare`.

### Breakdowns (charts)
- **Spend by category** — bar/pie, sortable, with % of total.
- **Spend over time** — monthly (and weekly) line/bar trend.
- **Spend by person** — who paid the most, who consumed the most.
- **Category × month** heatmap (optional, nice-to-have).
- **Top N transactions** — biggest single expenses.
- **Day-of-week / weekday-vs-weekend** pattern (optional).

### Settlements section
- List of `Payment` rows, total moved between each pair.
- Net balance matrix + **minimal cash-flow settle-up** suggestion (greedy: largest creditor ↔ largest debtor).

---

## 3. Architecture & tech

**Constraint:** must run as a fully static site on GitHub Pages — no backend, no build server required at runtime.

### Recommended stack (no build step, simplest to host)
- **Plain HTML + vanilla JS (ES modules) + CSS**, single-page.
- **[PapaParse](https://www.papaparse.com/)** (CDN) for robust CSV parsing (handles quotes/commas).
- **[Chart.js](https://www.chartjs.org/)** (CDN) for charts.
- No framework needed. If it grows, migrate to Vite + a framework later — but keep v1 buildless so `index.html` + assets deploy directly.

### File layout (proposed)
```
splitwise-analyzer/
  index.html          # entry, file picker, layout
  css/styles.css
  js/
    parse.js          # CSV → normalized model (people detection, row classification)
    analyze.js        # pure functions: KPIs, breakdowns, balances, settle-up
    charts.js         # Chart.js render helpers
    app.js            # glue: file input → parse → analyze → render
    sample.js         # embedded sample dataset for "Try with demo data"
  CLAUDE.md
  README.md
  .nojekyll           # so GitHub Pages serves files as-is
```

### Data model (normalized, after parse)
```js
{
  people: ["Vikram Singh", "Priya Sen"],
  currencies: ["INR"],
  rows: [
    {
      date: Date, description, category,
      cost: Number, currency,
      net: { "Vikram Singh": -669, "Priya Sen": 669 },
      kind: "expense" | "payment" | "summary"  // classified during parse
    }
  ],
  totalBalanceRow: { ... } | null
}
```

### Privacy guarantees (must hold)
- All parsing/analysis in-browser; **no `fetch`/XHR of user data anywhere**.
- No `localStorage`/`sessionStorage`/cookies for the file contents.
- State lives only in memory; refresh = gone. Make this explicit in the UI ("Your file never leaves this browser").
- Third-party libs loaded from CDN (or vendored locally for extra trust — prefer **vendored/local** so there's zero third-party network call when analyzing).

---

## 4. Implementation notes / open decisions
- **"My spend" definition (DECIDED)**: show both. Exact view = net balances + who-paid (positive net). Estimate view = per-person consumption assuming equal split (`Cost / participants`), always rendered with a `~`/"assumes equal splits" marker. A row's participants = person columns with a non-zero net for that row.
- **Multi-currency**: v1 — detect, and if >1 currency, show a currency selector; never cross-sum.
- **Locale numbers**: strip `,` and currency symbols before `parseFloat`.
- **Accessibility / mobile**: responsive layout, charts degrade to tables.

## 5. Milestones
1. `parse.js` + a tiny test harness against the sample → prints normalized model & validation warnings.
2. `analyze.js` pure functions (KPIs, by-category, by-month, balances, settle-up).
3. `index.html` + file picker + render KPIs as tables (no charts yet).
4. Add Chart.js visualizations.
5. Polish: demo data, privacy banner, responsive CSS, README + GitHub Pages deploy (`.nojekyll`, Pages settings).

## 6. Conventions for this repo
- Keep v1 **buildless**: must work by opening `index.html` (via a static server) with no npm install to run.
- Pure functions in `analyze.js` (no DOM) so logic is testable in isolation.
- No network calls with user data — this is a hard rule, treat any violation as a bug.
