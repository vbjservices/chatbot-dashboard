// charts.js
// Vereist Chart.js global (zoals je index.html al doet)

const charts = new Map();

export function destroyCharts() {
  for (const [, ch] of charts) {
    try { ch.destroy(); } catch {}
  }
  charts.clear();
}

export function upsertChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return;

  const prev = charts.get(canvasId);
  if (prev) {
    try { prev.destroy(); } catch {}
    charts.delete(canvasId);
  }

  const ctx = el.getContext("2d");
  const chart = new Chart(ctx, config);
  charts.set(canvasId, chart);
}

/**
 * renderCharts:
 * Gebruik bij voorkeur turns (rows). Conversations mag nog, maar turns is waarheid.
 */
export function renderCharts({ turns = [], conversations = [] } = {}) {
  const items = (turns && turns.length) ? turns : conversations;

  // Vandaag success rate (op items)
  const total = items.length || 0;
  const success = items.filter(x => !!(x.success ?? x.outcome?.success)).length;
  const rate = total ? Math.round((success / total) * 100) : 0;

  upsertChart("chartTodaySuccess", {
    type: "doughnut",
    data: {
      labels: ["Success", "Other"],
      datasets: [{ data: [rate, 100 - rate] }],
    },
    options: { plugins: { legend: { position: "bottom" } } },
  });

  // Volume per dag
  const byDay = bucketByDay(items);
  upsertChart("chartConvos", {
    type: "line",
    data: {
      labels: byDay.labels,
      datasets: [{ label: "Chats", data: byDay.counts }],
    },
    options: { plugins: { legend: { display: false } } },
  });

  // Topics
  const topics = countBy(items, x => x.topic || "Overig");
  upsertChart("chartTopics", {
    type: "bar",
    data: {
      labels: topics.labels,
      datasets: [{ label: "Topics", data: topics.counts }],
    },
    options: { plugins: { legend: { display: false } } },
  });

  // Outcomes (success/escalated/lead)
  const outcomes = {
    success: items.filter(x => !!(x.success ?? x.outcome?.success)).length,
    escalated: items.filter(x => !!(x.escalated ?? x.outcome?.escalated)).length,
    lead: items.filter(x => !!(x.lead ?? x.outcome?.lead)).length,
  };
  outcomes.other = Math.max(0, total - (outcomes.success + outcomes.escalated + outcomes.lead));

  upsertChart("chartOutcomes", {
    type: "bar",
    data: {
      labels: ["Success", "Escalated", "Lead", "Other"],
      datasets: [{ label: "Outcomes", data: [outcomes.success, outcomes.escalated, outcomes.lead, outcomes.other] }],
    },
    options: { plugins: { legend: { display: false } } },
  });

  // Latency p95 per dag (ms) — gebruikt NULL bij gebrek aan data (geen fake zeros)
  const p95ByDay = bucketP95ByDay(items, x => x?.metrics?.latency_ms);
  upsertChart("chartLatency", {
    type: "line",
    data: {
      labels: p95ByDay.labels,
      datasets: [{ label: "Latency p95 (ms)", data: p95ByDay.p95s }],
    },
    options: {
      plugins: { legend: { display: false } },
      spanGaps: true,
    },
  });
}

/* ---------- helpers ---------- */

function bucketByDay(items) {
  const map = new Map();

  for (const x of items) {
    const iso = x.updated_at || x.created_at;
    if (!iso) continue;

    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (!map.has(key)) map.set(key, { count: 0 });
    map.get(key).count += 1;
  }

  const labels = Array.from(map.keys()).sort();
  return { labels, counts: labels.map(k => map.get(k).count) };
}

function bucketP95ByDay(items, valueFn) {
  const map = new Map();

  for (const x of items) {
    const iso = x.updated_at || x.created_at;
    if (!iso) continue;

    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const v = Number(valueFn(x));
    if (!Number.isFinite(v)) continue;

    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v);
  }

  const labels = Array.from(map.keys()).sort();
  const p95s = labels.map(k => percentile(map.get(k), 95));
  return { labels, p95s };
}

function percentile(values, p) {
  if (!values || !values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * v.length) - 1;
  const safe = Math.max(0, Math.min(v.length - 1, idx));
  return v[safe];
}

function countBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it) || "—";
    m.set(k, (m.get(k) || 0) + 1);
  }
  const labels = Array.from(m.keys());
  labels.sort((a, b) => (m.get(b) - m.get(a)));
  return { labels, counts: labels.map(l => m.get(l)) };
}