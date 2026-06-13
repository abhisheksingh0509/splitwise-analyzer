// charts.js — thin Chart.js render helpers. Each helper destroys any prior
// chart bound to the same canvas before drawing, so re-rendering (on currency
// or person change) never leaks Chart instances.

const PALETTE = [
  '#14b8a6', '#6366f1', '#f59e0b', '#ef4444', '#0ea5e9',
  '#a855f7', '#ec4899', '#84cc16', '#f97316', '#0d9488',
];

const registry = new Map(); // canvasId -> Chart

function draw(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (registry.has(canvasId)) registry.get(canvasId).destroy();
  registry.set(canvasId, new window.Chart(el, config));
}

export function destroyAll() {
  for (const c of registry.values()) c.destroy();
  registry.clear();
}

const money = (cur) => (v) => `${cur} ${Number(v).toLocaleString()}`;

export function doughnut(canvasId, labels, values, currency, { onSlice = null } = {}) {
  draw(canvasId, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE, borderWidth: 2, borderColor: 'transparent' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      onClick: onSlice ? (evt, els, chart) => { if (els.length) onSlice(chart.data.labels[els[0].index]); } : undefined,
      onHover: onSlice ? (evt, els) => { evt.native.target.style.cursor = els.length ? 'pointer' : 'default'; } : undefined,
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${money(currency)(c.parsed)}` } },
      },
    },
  });
}

export function bars(canvasId, labels, values, currency, { horizontal = false, color = PALETTE[0] } = {}) {
  draw(canvasId, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: color, borderRadius: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => money(currency)(horizontal ? c.parsed.x : c.parsed.y) } },
      },
      scales: {
        x: { ticks: { font: { size: 11 } }, grid: { display: horizontal } },
        y: { ticks: { font: { size: 11 } }, grid: { display: !horizontal }, beginAtZero: true },
      },
    },
  });
}
