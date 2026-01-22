// charts.js
// Vereist Chart.js global (zoals je index.html al doet)

const charts = new Map();

/* ---------------- public API ---------------- */

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
export function renderCharts({ turns = [], conversations = [], latencyMode = "p95" } = {}) {
  const items = (turns && turns.length) ? turns : conversations;

  // Theme uit CSS (robust)
  const theme = getTheme();

  // Defaults (per chart consistent)
  const basePlugins = [shadowPlugin()];

  // Vandaag success rate (op items)
  const total = items.length || 0;
  const success = items.filter(x => !!(x.success ?? x.outcome?.success)).length;
  const rate = total ? Math.round((success / total) * 100) : 0;

  // Labels/volgorde expliciet vastzetten
  const donutLabels = ["Success", "Failed"];
  const donutData = [rate, 100 - rate];

  upsertChart("chartTodaySuccess", {
    type: "doughnut",
    plugins: basePlugins,
    data: {
      labels: donutLabels,
      datasets: [{
        data: donutData,

        // Per slice 1 kleur returnen (scriptable)
        backgroundColor: (context) => {
          const { chart, dataIndex } = context;
          const c = chart.ctx;
          const area = chart.chartArea;

          // chartArea kan bij eerste render nog undefined zijn
          if (!area) {
            return dataIndex === 0 ? theme.okBase : theme.failBase;
          }

          // Success slice: minder “donkere rand” + iets lichter groen
          if (dataIndex === 0) {
            return radialSliceGradient(
              c,
              area,
              theme.okBase,     // base
              theme.okGlow,     // glow
              theme.rimFade     // rand fade (minder dissolve)
            );
          }

          // Failed slice: minder dissolve (zelfde rimFade)
          return radialSliceGradient(
            c,
            area,
            theme.failBase,
            theme.failGlow,
            theme.rimFade
          );
        },

        borderColor: "rgba(255,255,255,.16)",
        borderWidth: 1,
        spacing: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "72%",

      // Force default text color for *this chart only*
      color: theme.legendText,

      plugins: {
        legend: {
          position: "bottom",
          labels: {
            // Force white (no more black text)
            color: theme.legendText,

            padding: 14,
            usePointStyle: true,
            pointStyle: "circle",

            generateLabels: (chart) => {
              const labels = chart.data.labels || [];
              return labels.map((label, i) => {
                const isSuccess = i === 0;

                const fill = isSuccess ? theme.okLegendFill : theme.failLegendFill;
                const stroke = isSuccess ? theme.okLegendStroke : theme.failLegendStroke;

                return {
                  text: label,

                  // “gradient-like” bullets (fill + edge)
                  fillStyle: fill,
                  strokeStyle: stroke,
                  lineWidth: 2,

                  // THE IMPORTANT PART: force text color per item
                  fontColor: theme.legendText,

                  hidden: !chart.getDataVisibility(i),
                  index: i,
                  pointStyle: "circle",
                };
              });
            },
          },
        },
        tooltip: tooltipOpts(theme),
      },
    },
  });

  // Volume per dag (Conversations per dag)
  const byDay = bucketByDay(items);

  // AANGEPAST: van line -> bar + altijd beginnen op 0
  upsertChart("chartConvos", {
    type: "bar",
    plugins: basePlugins,
    data: {
      labels: byDay.labels,
      datasets: [{
        label: "Chats",
        data: byDay.counts,
        borderRadius: 10,
        borderSkipped: false,
        backgroundColor: (ctx) => verticalBarGradient(ctx.chart.ctx, theme.accent, theme.accentGlow),
        borderColor: "rgba(255,255,255,.16)",
        borderWidth: 1,
      }],
    },
    options: barOpts(theme, { yTitle: "Chats", beginAtZero: true }),
  });

  // Topics
  const topics = countBy(items, x => x.topic || "Overig");
  upsertChart("chartTopics", {
    type: "bar",
    plugins: basePlugins,
    data: {
      labels: topics.labels,
      datasets: [{
        label: "Topics",
        data: topics.counts,
        borderRadius: 10,
        borderSkipped: false,
        backgroundColor: (ctx) => verticalBarGradient(ctx.chart.ctx, theme.accent, theme.accentGlow),
        borderColor: "rgba(255,255,255,.16)",
        borderWidth: 1,
      }],
    },
    options: barOpts(theme, { yTitle: "Aantal" }),
  });

  // Outcomes
  const outcomes = {
    success: items.filter(x => !!(x.success ?? x.outcome?.success)).length,
    escalated: items.filter(x => !!(x.escalated ?? x.outcome?.escalated)).length,
    lead: items.filter(x => !!(x.lead ?? x.outcome?.lead)).length,
  };
  outcomes.other = Math.max(0, total - (outcomes.success + outcomes.escalated + outcomes.lead));

  upsertChart("chartOutcomes", {
    type: "bar",
    plugins: basePlugins,
    data: {
      labels: ["Success", "Escalated", "Lead", "Other"],
      datasets: [{
        label: "Outcomes",
        data: [outcomes.success, outcomes.escalated, outcomes.lead, outcomes.other],
        borderRadius: 10,
        borderSkipped: false,
        backgroundColor: (ctx) => {
          const c = ctx.chart.ctx;
          return [
            verticalBarGradient(c, theme.ok, theme.okGlowStrong),
            verticalBarGradient(c, theme.warn, theme.warnGlow),
            verticalBarGradient(c, theme.accent, theme.accentGlow),
            verticalBarGradient(c, theme.otherBase, theme.otherGlow),
          ];
        },
        borderColor: "rgba(255,255,255,.14)",
        borderWidth: 1,
      }],
    },
    options: barOpts(theme, { yTitle: "Aantal" }),
  });

  // -------------------------------
  // Latency chart (toggle: p95 / avg) — in seconden met decimalen
  // - leest latency uit metrics.latency_ms OF latency_ms
  // - zet ms -> s
  // - tooltip formatting alleen voor latency chart
  // -------------------------------
  const latencyMs = (x) => (x?.metrics?.latency_ms ?? x?.latency_ms);

  const series =
    (latencyMode === "avg")
      ? bucketAvgByDaySeconds(items, latencyMs)
      : bucketP95ByDaySeconds(items, latencyMs);

  const latencyLabel = latencyMode === "avg" ? "Latency avg (s)" : "Latency p95 (s)";
  const latencyData = latencyMode === "avg" ? series.avgs : series.p95s;

  upsertChart("chartLatency", {
  type: "line",
  plugins: basePlugins,
  data: {
    labels: series.labels,
    datasets: [{
      label: latencyLabel,
      data: latencyData,
      borderWidth: 2,
      tension: 0.35,
      pointRadius: 2.5,
      pointHoverRadius: 5,

      // dots (paars)
      pointBackgroundColor: "rgba(127, 0, 152, 1)",
      pointBorderColor: "rgba(225, 0, 255, 0.49)",
      pointBorderWidth: 2,
      pointHoverBackgroundColor: "rgba(225, 0, 255, 1)",
      pointHoverBorderColor: "rgba(0,0,0,.55)",

      spanGaps: true,
      fill: true,

      // ✅ lijn + area fill: PAARS gradient via theme.accent
      borderColor: (ctx) => verticalLineGradient(ctx.chart.ctx, theme.accent, theme.accentGlow),
      backgroundColor: (ctx) => areaFillGradient(ctx.chart.ctx, theme.accent),
    }],
  },
  options: lineOptsWithLatencySeconds(theme, { yTitle: "s", spanGaps: true }),
});

}

/* ---------- Chart options (consistent + pro) ---------- */

function tooltipOpts(theme) {
  // originele tooltip (geen latency formatting)
  return {
    backgroundColor: "rgba(10,14,28,.92)",
    borderColor: "rgba(255,255,255,.14)",
    borderWidth: 1,
    titleColor: theme.text,
    bodyColor: theme.text,
    padding: 10,
    cornerRadius: 10,
    displayColors: true,
    callbacks: {
      labelTextColor: () => theme.text,
    }
  };
}

function baseScale(theme, { yTitle = "", beginAtZero = false } = {}) {
  return {
    x: {
      ticks: { color: theme.muted, maxRotation: 0, autoSkip: true },
      grid: { color: theme.grid },
      border: { color: theme.gridBorder },
    },
    y: {
      min: beginAtZero ? 0 : undefined,
      ticks: { color: theme.muted, beginAtZero },
      grid: { color: theme.grid },
      border: { color: theme.gridBorder },
      title: yTitle ? { display: true, text: yTitle, color: theme.muted, font: { weight: "600" } } : undefined,
    },
  };
}

function lineOpts(theme, { yTitle = "", spanGaps = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    spanGaps,
    plugins: {
      legend: { display: false },
      tooltip: tooltipOpts(theme),
    },
    scales: baseScale(theme, { yTitle }),
  };
}

// alleen voor latency chart: seconden + decimalen in tooltip en y-as
function lineOptsWithLatencySeconds(theme, { yTitle = "s", spanGaps = false } = {}) {
  const opts = lineOpts(theme, { yTitle, spanGaps });

  // tooltip: alleen latency
  opts.plugins.tooltip = {
    ...tooltipOpts(theme),
    callbacks: {
      ...tooltipOpts(theme).callbacks,
      label: (ctx) => {
        const label = ctx.dataset?.label ? `${ctx.dataset.label}: ` : "";
        const v = ctx.raw;
        if (v == null || !Number.isFinite(Number(v))) return `${label}—`;
        const n = Number(v);
        const s = n < 10 ? n.toFixed(3) : n.toFixed(2);
        return `${label}${s}s`;
      },
    },
  };

  // y-as ticks: seconden met decimals
  opts.scales = {
    ...opts.scales,
    y: {
      ...opts.scales.y,
      ticks: {
        ...opts.scales.y.ticks,
        callback: (val) => {
          const n = Number(val);
          if (!Number.isFinite(n)) return val;
          return n < 10 ? n.toFixed(2) : n.toFixed(1);
        },
      },
    },
  };

  return opts;
}

function barOpts(theme, { yTitle = "", beginAtZero = false } = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: tooltipOpts(theme),
    },
    scales: baseScale(theme, { yTitle, beginAtZero }),
  };
}

/* ---------- 2.5D look helpers ---------- */

function shadowPlugin() {
  return {
    id: "softShadow",
    beforeDatasetDraw(chart, args) {
      const meta = chart.getDatasetMeta(args.index);
      if (!meta || meta.hidden) return;

      const { ctx } = chart;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,.35)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 6;
    },
    afterDatasetDraw(chart) {
      chart.ctx.restore();
    },
  };
}

function radialSliceGradient(ctx, chartArea, base, glow, rimFade) {
  const cx = (chartArea.left + chartArea.right) / 2;
  const cy = (chartArea.top + chartArea.bottom) / 2;
  const r = Math.max(
    40,
    Math.min(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2
  );

  const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
  g.addColorStop(0.00, glow);
  g.addColorStop(0.55, base);
  g.addColorStop(0.88, withAlpha(base, 0.96));
  g.addColorStop(1.00, rimFade);
  return g;
}

function verticalLineGradient(ctx, base, glow) {
  const g = ctx.createLinearGradient(0, 0, 0, 260);
  g.addColorStop(0, glow);
  g.addColorStop(0.35, base);
  g.addColorStop(1, "rgba(255,255,255,.10)");
  return g;
}

function areaFillGradient(ctx, base) {
  const g = ctx.createLinearGradient(0, 0, 0, 280);
  g.addColorStop(0, withAlpha(base, 0.28));
  g.addColorStop(1, "rgba(0,0,0,0)");
  return g;
}

function verticalBarGradient(ctx, base, glow) {
  const g = ctx.createLinearGradient(0, 0, 0, 300);
  g.addColorStop(0, glow);
  g.addColorStop(0.45, base);
  g.addColorStop(1, "rgba(0,0,0,.12)");
  return g;
}

function withAlpha(hexOrRgb, alpha) {
  const s = String(hexOrRgb || "");
  if (s.startsWith("#") && (s.length === 7)) {
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  if (s.startsWith("rgb(")) return s.replace("rgb(", "rgba(").replace(")", `,${alpha})`);
  if (s.startsWith("rgba(")) return s.replace(/,([0-9.]+)\)\s*$/, `,${alpha})`);
  return s;
}

/* ---------- Theme from CSS variables ---------- */

function getTheme() {
  const root = getComputedStyle(document.documentElement);

  const text = root.getPropertyValue("--text").trim() || "#e8eefc";
  const muted = root.getPropertyValue("--muted").trim() || "#8ea0c8";
  const accent = root.getPropertyValue("--accent").trim() || "#7c3aed";

  const ok = root.getPropertyValue("--ok").trim() || "#22c55e";
  const warn = root.getPropertyValue("--warn").trim() || "#f59e0b";

  const fail = "#ef4444";

  const okBase = lightenHex(ok, 0.10);
  const okGlow = withAlpha(okBase, 0.82);

  const failBase = deepenHex(fail, 0.06);
  const failGlow = withAlpha(lightenHex(failBase, 0.06), 0.80);

  const rimFade = "rgba(0,0,0,.04)";

  const legendText = text || "#9b9b9bff";

  const okLegendFill = withAlpha(okBase, 0.95);
  const okLegendStroke = withAlpha(deepenHex(okBase, 0.50), 0.95);

  const failLegendFill = withAlpha(failBase, 0.95);
  const failLegendStroke = withAlpha(deepenHex(failBase, 0.50), 0.95);

  const otherBase = "#2a3552";
  const otherGlow = "rgba(142,160,200,.55)";

  return {
    text,
    muted,
    accent,
    ok: ok,
    warn,

    okBase,
    okGlow,
    failBase,
    failGlow,
    rimFade,

    legendText,
    okLegendFill,
    okLegendStroke,
    failLegendFill,
    failLegendStroke,

    accentGlow: withAlpha(accent, 0.85),
    okGlowStrong: withAlpha(ok, 0.85),
    warnGlow: withAlpha(warn, 0.85),

    otherBase,
    otherGlow,

    grid: "rgba(255,255,255,.06)",
    gridBorder: "rgba(255,255,255,.10)",
  };
}

function lightenHex(hex, amount = 0.1) {
  const h = String(hex || "").trim();
  if (!h.startsWith("#") || h.length !== 7) return hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);

  const lift = (x) => Math.max(0, Math.min(255, Math.round(x + (255 - x) * amount)));
  return `#${[lift(r), lift(g), lift(b)].map(n => n.toString(16).padStart(2, "0")).join("")}`;
}

function deepenHex(hex, amount = 0.1) {
  const h = String(hex || "").trim();
  if (!h.startsWith("#") || h.length !== 7) return hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);

  const drop = (x) => Math.max(0, Math.min(255, Math.round(x * (1 - amount))));
  return `#${[drop(r), drop(g), drop(b)].map(n => n.toString(16).padStart(2, "0")).join("")}`;
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

function bucketP95ByDaySeconds(items, valueFnMs) {
  const map = new Map();

  for (const x of items) {
    const iso = x.updated_at || x.created_at;
    if (!iso) continue;

    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const vMs = Number(valueFnMs(x));
    if (!Number.isFinite(vMs)) continue;

    const vSec = vMs / 1000;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(vSec);
  }

  const labels = Array.from(map.keys()).sort();
  const p95s = labels.map(k => percentile(map.get(k), 95));
  return { labels, p95s };
}

function bucketAvgByDaySeconds(items, valueFnMs) {
  const map = new Map();

  for (const x of items) {
    const iso = x.updated_at || x.created_at;
    if (!iso) continue;

    const d = new Date(iso);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const vMs = Number(valueFnMs(x));
    if (!Number.isFinite(vMs)) continue;

    const vSec = vMs / 1000;
    if (!map.has(key)) map.set(key, { sum: 0, n: 0 });
    const agg = map.get(key);
    agg.sum += vSec;
    agg.n += 1;
  }

  const labels = Array.from(map.keys()).sort();
  const avgs = labels.map(k => {
    const { sum, n } = map.get(k);
    return n ? (sum / n) : null;
  });

  return { labels, avgs };
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