// app.js — glue: file → PapaParse → normalize → analyze → render.
// The only place that touches the DOM and the file input. No user data is ever
// sent over the network (PapaParse & Chart.js are vendored locally).
import { normalize, mergeModels } from './parse.js';
import { analyzeCurrency, spendOverTime, suggestTimeUnit } from './analyze.js';
import { doughnut, bars, destroyAll } from './charts.js';
import { makeCategorizer, DEFAULT_RULES } from './categorize.js';
import { SAMPLE_CSV } from './sample.js';

const $ = (id) => document.getElementById(id);
let model = null;        // current merged model
let entries = [];        // [{ name, raw }] accumulated across uploads (raw = parsed rows)
let timeUnit = 'month';  // day | month | year for the "Spend over time" chart

// Category rules are user-editable (persisted) and re-applied by re-normalizing.
let rules = loadRules();
let categorizer = makeCategorizer(rules);

function loadRules() {
  try {
    const saved = JSON.parse(localStorage.getItem('categoryRules'));
    if (Array.isArray(saved) && saved.length) return saved;
  } catch (e) { /* fall through to defaults */ }
  return DEFAULT_RULES;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtBucket(bucket, unit) {
  if (unit === 'year') return bucket;
  const [y, m, d] = bucket.split('-');
  if (unit === 'month') return `${MON[+m - 1]} ${y}`;
  return `${+d} ${MON[+m - 1]}`; // day
}

// ── Theme ─────────────────────────────────────────────────────────────────
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

function applyChartTheme() {
  if (!window.Chart) return;
  window.Chart.defaults.color = isDark() ? '#bcc5d2' : '#5b6573';
  window.Chart.defaults.borderColor = isDark() ? 'rgba(255,255,255,.08)' : 'rgba(20,26,38,.08)';
}

function toggleTheme() {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked — fine */ }
  applyChartTheme();
  if (model) render(); // redraw charts so legends/axes match the theme
}

// ── Entry points ────────────────────────────────────────────────────────────
const readText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = (e) => resolve(String(e.target.result));
  r.onerror = () => reject(new Error(`Couldn't read "${file.name}".`));
  r.readAsText(file);
});

function entryFromText(name, text) {
  const parsed = window.Papa.parse(text.trim(), { skipEmptyLines: 'greedy' });
  return { name, raw: parsed.data };
}

// Normalize every stored file with the current categorizer and merge them.
// Throws on no-people / mismatched-people so callers can show the message.
function buildModel(candidateEntries) {
  const models = candidateEntries.map((e) => {
    const m = normalize(e.raw, { categorize: categorizer });
    if (!m.people.length) throw new Error(`"${e.name}" has no people columns — is it a Splitwise CSV export?`);
    return { name: e.name, model: m };
  });
  return mergeModels(models);
}

// Add one or more files to whatever is already loaded; merge; render.
// On any error, keep the previous state untouched and show the message.
async function addFiles(fileList) {
  const files = Array.from(fileList);
  if (!files.length) return;
  try {
    const fresh = [];
    for (const f of files) fresh.push(entryFromText(f.name, await readText(f)));
    const combined = [...entries, ...fresh];
    model = buildModel(combined); // throws if people don't match
    entries = combined;
    showError(null);
    showAnalysis();
  } catch (err) {
    showError(err.message);
  }
}

// Load the bundled demo (replaces any current state).
function loadDemo() {
  entries = [entryFromText('demo.csv', SAMPLE_CSV)];
  model = buildModel(entries);
  showError(null);
  showAnalysis();
}

function showAnalysis() {
  timeUnit = suggestTimeUnit(model); // sensible default from the data's span
  buildControls();
  render();
  $('controls').hidden = false;
  $('results').hidden = false;
  $('dropzone').hidden = true;
  renderSources();
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showError(msg) {
  const box = $('errorBox');
  if (!msg) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `⚠️ ${escapeHtml(msg)}`;
}

function renderSources() {
  const el = $('sources');
  if (entries.length <= 1) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = `Combined ${entries.length} files: ${entries.map((e) => e.name).join(', ')}`;
}

// ── Controls ─────────────────────────────────────────────────────────────────
function buildControls() {
  const cs = $('currencySel');
  cs.innerHTML = model.currencies.map((c) => `<option>${c}</option>`).join('');
  cs.parentElement.style.display = model.currencies.length > 1 ? '' : 'none';

  const ps = $('personSel');
  ps.innerHTML = model.people.map((p) => `<option>${escapeHtml(p)}</option>`).join('');
  // Repopulating options can preserve the old selection in some browsers —
  // force back to the first person so a fresh load always starts clean.
  cs.selectedIndex = 0;
  ps.selectedIndex = 0;
}

// ── Render ───────────────────────────────────────────────────────────────────
const fmt = (cur, v) => `${cur} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function render() {
  const currency = $('currencySel').value || model.currencies[0];
  const person = $('personSel').value || model.people[0];
  const a = analyzeCurrency(model, currency);

  renderWarnings();
  renderKpis(a.kpis, currency);

  // GENERAL: each person's share
  const shares = [...a.share.people].sort((x, y) => y.share - x.share);
  bars('shareChart', shares.map((p) => p.person), shares.map((p) => p.share), currency, { horizontal: true });
  renderShareTable(shares, currency);
  const note = $('shareNote');
  if (a.share.approxRows > 0) {
    note.hidden = false;
    note.textContent = `~ ${a.share.approxRows} expense(s) had multiple payers, which a Splitwise export can't split exactly — those were divided equally. Everything else is exact.`;
  } else { note.hidden = true; }

  doughnut('catChart', a.byCategory.map((c) => c.category), a.byCategory.map((c) => c.amount), currency,
    { onSlice: (label) => showCategoryTransactions(label, currency) });
  const catNote = $('catNote');
  const reNote = model.recategorized > 0
    ? `${model.recategorized} "General" expense(s) auto-sorted into finer categories. `
    : '';
  catNote.hidden = false;
  catNote.textContent = `${reNote}Tip: click a slice to see its transactions.`;
  const series = spendOverTime(model, currency, timeUnit);
  bars('monthChart', series.map((s) => fmtBucket(s.bucket, timeUnit)), series.map((s) => s.amount), currency, { color: '#6366f1' });
  for (const b of $('timeUnit').querySelectorAll('button')) b.classList.toggle('active', b.dataset.unit === timeUnit);

  // PERSONALISED
  renderPersonal(a, currency, person);
}

function renderWarnings() {
  const box = $('warnings');
  if (!model.warnings.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<h3>⚠️ ${model.warnings.length} note(s) about your data</h3><ul>` +
    model.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('') + '</ul>';
}

function renderKpis(k, cur) {
  const cards = [
    { label: 'Group spend', value: fmt(cur, k.groupSpend), sub: `${k.transactions} expenses` },
    { label: 'People', value: k.people, sub: 'in the group' },
    { label: 'Date range', value: k.from || '—', sub: k.to && k.to !== k.from ? `to ${k.to}` : '' },
    { label: 'Largest expense', value: fmt(cur, k.largest), sub: '' },
  ];
  $('kpis').innerHTML = cards.map((c) =>
    `<div class="kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`
  ).join('');
}

// GENERAL: each person's share (what they consumed) + what they paid
function renderShareTable(shares, cur) {
  const total = shares.reduce((s, p) => s + p.share, 0) || 1;
  const rows = shares.map((p) => {
    const pct = Math.round((p.share / total) * 100);
    return `<tr><td>${escapeHtml(p.person)}</td><td class="num">${fmt(cur, p.share)}</td><td class="num muted">${pct}%</td><td class="num muted">${fmt(cur, p.paid)}</td></tr>`;
  }).join('');
  $('shareTable').innerHTML =
    '<table><thead><tr><th>Person</th><th class="num">Share</th><th class="num">% of spend</th><th class="num">Paid</th></tr></thead><tbody>' +
    rows + '</tbody></table>';
}

// PERSONALISED: focused view for the selected person
function renderPersonal(a, cur, person) {
  $('personName').textContent = person;
  const me = a.share.people.find((p) => p.person === person);
  if (!me) return;

  const avgShare = a.kpis.groupSpend / a.kpis.people;
  const sharePct = a.kpis.groupSpend ? Math.round((me.share / a.kpis.groupSpend) * 100) : 0;

  $('personStats').innerHTML = [
    { label: 'Your share', value: fmt(cur, me.share), sub: 'what you consumed' },
    { label: 'Share of total', value: `${sharePct}%`, sub: 'of group spend' },
    { label: 'You paid', value: fmt(cur, me.paid), sub: 'out of pocket' },
  ].map((c) => `<div class="kpi"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`).join('');

  const entries = Object.entries(me.byCategory).sort((x, y) => y[1] - x[1]);
  if (entries.length) doughnut('myCatChart', entries.map((e) => e[0]), entries.map((e) => e[1]), cur);
  else doughnut('myCatChart', ['No data'], [1], cur);

  const vsAvg = me.share - avgShare;
  const pct = avgShare ? Math.round((vsAvg / avgShare) * 100) : 0;
  const topCat = entries[0];
  $('personCompare').innerHTML =
    `<p>Average share per person: <strong>${fmt(cur, avgShare)}</strong></p>` +
    `<p>Your share is <strong class="${vsAvg >= 0 ? 'neg' : 'pos'}">${fmt(cur, Math.abs(vsAvg))} ${vsAvg >= 0 ? 'above' : 'below'}</strong> average (${pct >= 0 ? '+' : ''}${pct}%).</p>` +
    (topCat ? `<p>Your biggest category: <strong>${escapeHtml(topCat[0])}</strong> at ${fmt(cur, topCat[1])}.</p>` : '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Modal ─────────────────────────────────────────────────────────────────
function openModal(title, bodyHtml) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  $('modal').hidden = false;
}
function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; }

// ── Category drill-down (click a slice) ─────────────────────────────────────
function showCategoryTransactions(category, currency) {
  const rows = model.rows
    .filter((r) => r.kind === 'expense' && r.currency === currency && r.category === category)
    .sort((a, b) => b.cost - a.cost);
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const paidBy = (r) => model.people.filter((p) => r.net[p] > 0.005).join(', ') || '—';
  const body =
    `<p class="modal-total">${rows.length} transaction(s) · total <strong>${fmt(currency, total)}</strong></p>` +
    '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Paid by</th><th class="num">Cost</th></tr></thead><tbody>' +
    rows.map((r) => `<tr><td>${r.dateStr}</td><td>${escapeHtml(r.description) || '<span class="muted">(no description)</span>'}</td><td>${escapeHtml(paidBy(r))}</td><td class="num">${fmt(currency, r.cost)}</td></tr>`).join('') +
    '</tbody></table></div>';
  openModal(`${category} — transactions`, body);
}

// ── Custom category rule editor ─────────────────────────────────────────────
const ruleRowHtml = (cat, kw) =>
  `<div class="rule-row">
     <input class="rule-cat" type="text" value="${escapeHtml(cat)}" placeholder="Category" />
     <input class="rule-kw" type="text" value="${escapeHtml(kw)}" placeholder="keywords, comma separated" />
     <button type="button" class="rule-del" title="Remove" aria-label="Remove rule">&times;</button>
   </div>`;

function openCategoryEditor() {
  const body =
    '<p class="modal-hint">These rules rename <strong>General</strong> / blank expenses by matching keywords in the description (first match wins). Real Splitwise categories are never changed. Saved on this device only.</p>' +
    `<div id="ruleList">${rules.map((r) => ruleRowHtml(r.category, r.keywords.join(', '))).join('')}</div>` +
    '<button type="button" id="addRule" class="link">+ add rule</button>' +
    '<div class="modal-foot">' +
      '<button type="button" id="resetRules" class="link">Reset to defaults</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" id="cancelRules" class="link">Cancel</button>' +
      '<button type="button" id="applyRules" class="secondary">Apply</button>' +
    '</div>';
  openModal('Custom category rules', body);

  $('addRule').addEventListener('click', () => $('ruleList').insertAdjacentHTML('beforeend', ruleRowHtml('', '')));
  $('ruleList').addEventListener('click', (e) => {
    if (e.target.classList.contains('rule-del')) e.target.closest('.rule-row').remove();
  });
  $('resetRules').addEventListener('click', () => {
    $('ruleList').innerHTML = DEFAULT_RULES.map((r) => ruleRowHtml(r.category, r.keywords.join(', '))).join('');
  });
  $('cancelRules').addEventListener('click', closeModal);
  $('applyRules').addEventListener('click', () => {
    const collected = [];
    for (const row of $('ruleList').querySelectorAll('.rule-row')) {
      const cat = row.querySelector('.rule-cat').value.trim();
      const kw = row.querySelector('.rule-kw').value.split(',').map((s) => s.trim()).filter(Boolean);
      if (cat && kw.length) collected.push({ category: cat, keywords: kw });
    }
    rules = collected;
    try { localStorage.setItem('categoryRules', JSON.stringify(rules)); } catch (e) { /* fine */ }
    categorizer = makeCategorizer(rules);
    if (entries.length) {
      try { model = buildModel(entries); render(); } catch (e) { showError(e.message); }
    }
    closeModal();
  });
}

// ── Export ──────────────────────────────────────────────────────────────────
async function exportPNG() {
  if (!window.html2canvas || !model) return;
  const btn = $('pngBtn'); const original = btn.textContent; btn.textContent = '…rendering';
  // Flatten shadows + drop the page gradient so html2canvas doesn't render a
  // grey wash that makes the image look dimmer than the live page.
  document.body.classList.add('exporting');
  const bg = getComputedStyle(document.body).backgroundColor;
  try {
    const canvas = await window.html2canvas($('results'), {
      backgroundColor: bg, scale: 2, logging: false, useCORS: true,
      windowWidth: document.documentElement.clientWidth,
    });
    const link = document.createElement('a');
    link.download = 'splitwise-analysis.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (e) {
    showError('Could not generate PNG: ' + e.message);
  } finally {
    document.body.classList.remove('exporting');
    btn.textContent = original;
  }
}

function reset() {
  destroyAll();
  model = null;
  entries = [];
  $('fileInput').value = '';
  $('personSel').innerHTML = '';
  $('currencySel').innerHTML = '';
  $('personName').textContent = '';
  $('controls').hidden = true;
  $('results').hidden = true;
  $('warnings').hidden = true;
  $('sources').hidden = true;
  showError(null);
  $('dropzone').hidden = false;
}

// ── Wire up events ────────────────────────────────────────────────────────────
$('browseBtn').addEventListener('click', () => $('fileInput').click());
$('addBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; });
$('demoBtn').addEventListener('click', loadDemo);
$('resetBtn').addEventListener('click', reset);
$('currencySel').addEventListener('change', render);
$('personSel').addEventListener('change', render);
$('themeToggle').addEventListener('click', toggleTheme);
$('catBtn').addEventListener('click', openCategoryEditor);
$('pngBtn').addEventListener('click', exportPNG);
$('pdfBtn').addEventListener('click', () => window.print());
$('modal').addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });
$('timeUnit').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-unit]');
  if (!btn || btn.dataset.unit === timeUnit) return;
  timeUnit = btn.dataset.unit;
  if (model) render();
});
applyChartTheme(); // sync Chart.js defaults with the theme set before paint

const dz = $('dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
dz.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
// Allow dropping more files onto the page once results are shown.
document.addEventListener('drop', (e) => {
  if ($('results').hidden) return;
  e.preventDefault();
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});
document.addEventListener('dragover', (e) => { if (!$('results').hidden) e.preventDefault(); });

// Deep link: opening the app with #demo loads the sample data straight away.
if (location.hash === '#demo') loadDemo();
