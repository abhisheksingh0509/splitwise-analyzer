# 📊 Splitwise Analyser

A **private, in-browser** spend analyser for Splitwise CSV exports. Upload your group's export and instantly see where the money went — by category, over time, who bankrolled what, net balances, and the minimal settle-up.

> **Your data never leaves your browser.** Parsing and analysis happen entirely client-side. Nothing is uploaded, stored, or tracked. Refresh the page and it's gone. The two libraries it uses (PapaParse, Chart.js) are vendored locally, so analysing a file makes **zero network requests**.

## Use it

1. In Splitwise: open a group → ⚙️ settings → **Export as spreadsheet (CSV)**.
2. Open the app and drop the CSV in (or click **Try with demo data**).
3. **Multiple groups, same people?** Drop several exports (or use **+ add another file**) and they're combined into one analysis. All files must contain the **exact same set of people** — if one has an extra or missing person, the app refuses to merge and tells you which name differs. Column order doesn't matter (nets are matched by name).

## What it shows

The layout is deliberately lean: a few headline numbers, **one general view**, then a **personalised** view.

- **KPIs** — group spend, people, date range, largest expense.
- **Each person's share of the trip** *(the headline)* — what each person actually consumed, its % of the total, and what they paid out of pocket.
- **Spend by category** and **spend over time** — the time chart toggles **Day / Month / Year** and defaults to a sensible granularity for the date span.
- **Your trip, <name>** *(personalised)* — your share, its % of group spend, what you paid, your share by category, and how you compare to the group average.
- **Light / dark theme** — toggle in the header; follows your OS preference by default.

### How "share" is computed
A Splitwise export stores each person's **net** per expense (`paid − share`). For a standard **single-payer** expense, the share is *exactly* recoverable: everyone who didn't pay has `share = −net`, and the payer's share is the remainder of the bill. The app does this — so per-person share is exact, not an equal-split guess. The only exception is an expense with **multiple payers** (which the export can't split apart); those rows are divided equally and counted in a small note.

The app also auto-detects settlements logged under a normal category (e.g. "Settle all balances" tagged *General*) and excludes them from spend, with a visible note.

## Run locally

It's a static site — no build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

(Opening `index.html` via `file://` won't work because it uses ES modules — use a server.)

## Deploy to GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick your branch and `/ (root)`.
3. The included `.nojekyll` ensures files are served as-is.

## Tests

Pure parsing/analysis logic is covered by a dependency-free Node harness:

```bash
node test/run.mjs            # runs against test/trip.csv
node test/run.mjs sample.csv # a smaller edge-case fixture
```

## Project layout

```
index.html        entry + layout
css/styles.css    styling
js/parse.js       CSV rows → normalized model (pure, no deps)
js/analyze.js     KPIs, breakdowns, balances, settle-up (pure, no deps)
js/charts.js      Chart.js render helpers
js/app.js         glue: file → parse → analyze → render (only DOM/file code)
js/sample.js      embedded demo dataset
vendor/           PapaParse + Chart.js (vendored, no CDN at runtime)
test/             Node test harness + fixtures
```
