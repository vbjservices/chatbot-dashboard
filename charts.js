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

export function renderCharts({ conversations = [] } = {}) {
  // Vandaag success rate (eenvoudig: in filtered set)
  const total = conversations.length || 0;
  const success = conversations.filter(c => !!c.outcome?.success).length;
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
  const byDay = bucketByDay(conversations);
  upsertChart("chartConvos", {
    type: "line",
    data: {
      labels: byDay.labels,
      datasets: [{ label: "Conversations", data: byDay.counts }],
    },
    options: { plugins: { legend: { display: false } } },
  });

  // Topics
  const topics = countBy(conversations, c => c.topic || "Overig");
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
    success: conversations.filter(c => !!c.outcome?.success).length,
    escalated: conversations.filter(c => !!c.outcome?.escalated).length,
    lead: conversations.filter(c => !!c.outcome?.lead).length,
    other: Math.max(0, total - conversations.filter(c => !!c.outcome?.success || !!c.outcome?.escalated || !!c.outcome?.lead).length),
  };

  upsertChart("chartOutcomes", {
    type: "bar",
    data: {
      labels: ["Success", "Escalated", "Lead", "Other"],
      datasets: [{ label: "Outcomes", data: [outcomes.success, outcomes.escalated, outcomes.lead, outcomes.other] }],
    },
    options: { plugins: { legend: { display: false } } },
  });

  // “Latency” canvas hergebruiken als Tokens-per-conversation
  const tokensByDay = bucketByDay(conversations, c => Number(c.metrics?.tokens ?? 0));
  upsertChart("chartLatency", {
    type: "line",
    data: {
      labels: tokensByDay.labels,
      datasets: [{ label: "Tokens", data: tokensByDay.sums }],
    },
    options: { plugins: { legend: { display: false } } },
  });
}

/* ---------- helpers ---------- */

function bucketByDay(conversations, valueFn = null) {
  const map = new Map();

  for (const c of conversations) {
    const iso = c.updated_at || c.created_at;
    if (!iso) continue;

    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (!map.has(key)) map.set(key, { count: 0, sum: 0 });
    const cur = map.get(key);
    cur.count += 1;

    if (valueFn) {
      const v = Number(valueFn(c));
      cur.sum += Number.isFinite(v) ? v : 0;
    }
  }

  const labels = Array.from(map.keys()).sort();
  const counts = labels.map(k => map.get(k).count);

  return {
    labels,
    counts,
    sums: labels.map(k => map.get(k).sum),
  };
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