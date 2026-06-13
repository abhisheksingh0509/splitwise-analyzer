// charts.js — thin Chart.js render helpers. Each helper destroys any prior
// chart bound to the same canvas before drawing, so re-rendering (on currency
// or person change) never leaks Chart instances.

const PALETTE = [
  '#1cc29f', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#14b8a6', '#ec4899', '#84cc16', '#f97316', '#06b6d4',
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

export function doughnut(canvasId, labels, values, currency) {
  draw(canvasId, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE, borderWidth: 1, borderColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
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
