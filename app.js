import { generateMockEvents } from "./mockData.js";

/**
 * Later Supabase:
 * - vervang loadData() zodat hij je conversations ophaalt
 * - mapping naar hetzelfde conversation object schema
 */

/* --- Donut center text plugin --- */
const CenterTextPlugin = {
  id: "centerText",
  afterDraw(chart, args, pluginOptions) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta?.data?.length) return;

    const x = meta.data[0].x;
    const y = meta.data[0].y;

    const main = pluginOptions?.mainText ?? "";
    const sub = pluginOptions?.subText ?? "";
    const sub2 = pluginOptions?.subText2 ?? "";

    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#e8eefc";
    ctx.font = "800 28px ui-sans-serif, system-ui";
    ctx.fillText(main, x, y - (sub2 ? 12 : 6));

    ctx.fillStyle = "rgba(232,238,252,.75)";
    ctx.font = "600 12px ui-sans-serif, system-ui";
    ctx.fillText(sub, x, y + (sub2 ? 10 : 18));

    if (sub2) {
      ctx.fillStyle = "rgba(232,238,252,.55)";
      ctx.font = "600 11px ui-sans-serif, system-ui";
      ctx.fillText(sub2, x, y + 28);
    }

    ctx.restore();
  }
};
Chart.register(CenterTextPlugin);

let state = {
  raw: [],
  filtered: [],
  charts: {},
  selectedConversationId: null,
};

init();

function init() {
  wireUI();
  loadData(); // mock
}

function wireUI() {
  document.getElementById("refreshBtn").addEventListener("click", loadData);
  document.getElementById("exportBtn").addEventListener("click", exportCSV);

  ["rangeSelect","channelSelect","typeSelect","searchInput"].forEach(id => {
    document.getElementById(id).addEventListener("input", applyFiltersAndRender);
  });
}

function loadData() {
  const days = Number(document.getElementById("rangeSelect").value || 30);
  const { conversations } = generateMockEvents({ days, seed: Date.now() % 100000 });

  state.raw = conversations.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  document.getElementById("lastUpdatePill").textContent =
    `Last update: ${new Date().toLocaleString("nl-NL")}`;

  const statusPill = document.getElementById("statusPill");
  statusPill.textContent = "Status: Running";
  statusPill.className = "pill status ok";

  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  const rangeDays = Number(document.getElementById("rangeSelect").value);
  const channel = document.getElementById("channelSelect").value;
  const type = document.getElementById("typeSelect").value;
  const q = (document.getElementById("searchInput").value || "").toLowerCase().trim();

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - (rangeDays - 1));
  from.setHours(0,0,0,0);

  state.filtered = state.raw.filter(c => {
    const t = new Date(c.created_at);
    if (t < from) return false;
    if (channel !== "all" && c.channel !== channel) return false;
    if (type !== "all" && c.type !== type) return false;

    if (q) {
      const blob = [
        c.topic, c.type, c.channel,
        c.messages?.map(m => m.content).join(" ") || ""
      ].join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  const version = dominant(state.filtered.map(x => x.prompt_version || "v1")) || "v1";
  document.getElementById("versionPill").textContent = `Version: ${version}`;

  renderAll();
}

function renderAll() {
  renderKPIs();
  renderCharts();
  renderTables();
  renderConversationList();
  renderConversationDetail();
}

/* ---------------- KPIs ---------------- */

function renderKPIs() {
  const data = state.filtered;
  const total = data.length;

  const success = data.filter(c => c.outcome?.success).length;
  const escalated = data.filter(c => c.outcome?.escalated).length;
  const leads = data.filter(c => c.outcome?.lead).length;
  const lowConf = data.filter(c => (c.metrics?.confidence ?? 1) < 0.55).length;

  const tokens = data.reduce((sum, c) => sum + (c.metrics?.tokens || 0), 0);
  const cost = (tokens / 1000) * 0.002;

  setText("kpiSuccess", pct(success, total));
  setText("kpiEscalation", pct(escalated, total));
  setText("kpiConvos", String(total));
  setText("kpiLeads", String(leads));
  setText("kpiLowConf", String(lowConf));
  setText("kpiCost", `€${cost.toFixed(2)}`);
}

function pct(a,b){
  if (!b) return "0%";
  return `${Math.round((a/b)*100)}%`;
}
function setText(id, v){ document.getElementById(id).textContent = v; }

/* ---------------- Charts ---------------- */

function renderCharts() {
  const data = state.filtered;

  // Conversations per day
  const byDay = groupBy(data, c => isoDay(c.created_at));
  const dayLabels = Object.keys(byDay).sort();
  const dayCounts = dayLabels.map(d => byDay[d].length);

  // Top topics
  const byTopic = countBy(data, c => c.topic || "unknown");
  const topicPairs = Object.entries(byTopic).sort((a,b) => b[1]-a[1]).slice(0,7);
  const topicLabels = topicPairs.map(x => x[0]);
  const topicCounts = topicPairs.map(x => x[1]);

  // Outcomes
  const outcomes = {
    success: data.filter(c => c.outcome?.success).length,
    escalated: data.filter(c => c.outcome?.escalated).length,
    failed: data.filter(c => !c.outcome?.success).length,
    leads: data.filter(c => c.outcome?.lead).length
  };

  // Latency p95 per day
  const p95 = dayLabels.map(d => percentile(
    (byDay[d] || []).map(c => c.metrics?.latency_ms || 0),
    95
  ));

  /* --- NEW: Today success ring with fallback --- */
  const MIN_TODAY_N = 20; // <-- pas aan als je wilt
  const todayKey = new Date().toISOString().slice(0,10);
  const today = data.filter(c => isoDay(c.created_at) === todayKey);

  let ringData = today;
  let ringLabel = "vandaag";
  let ringNote = "";

  if (today.length < MIN_TODAY_N) {
    ringData = data.filter(c => withinLastDays(c.created_at, 7));
    ringLabel = "laatste 7 dagen";
    ringNote = `fallback (n<${MIN_TODAY_N})`;
  }

  const ringTotal = ringData.length;
  const ringSuccess = ringData.filter(c => c.outcome?.success).length;
  const ringFail = ringTotal - ringSuccess;
  const ringPct = ringTotal ? Math.round((ringSuccess / ringTotal) * 100) : 0;

  upsertChart("chartTodaySuccess", {
    type: "doughnut",
    data: {
      labels: ["Success", "Not success"],
      datasets: [{
        data: [ringSuccess, ringFail],
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      cutout: "72%",
      plugins: {
        legend: { display: false },
        centerText: {
          mainText: `${ringPct}%`,
          subText: `${ringLabel} • n=${ringTotal}`,
          subText2: ringNote
        }
      }
    }
  });

  upsertChart("chartConvos", {
    type: "line",
    data: {
      labels: dayLabels,
      datasets: [{ label: "Conversations", data: dayCounts }]
    },
    options: baseChartOptions()
  });

  upsertChart("chartTopics", {
    type: "bar",
    data: {
      labels: topicLabels,
      datasets: [{ label: "Mentions", data: topicCounts }]
    },
    options: baseChartOptions()
  });

  upsertChart("chartOutcomes", {
    type: "doughnut",
    data: {
      labels: ["Success", "Escalated", "Failed", "Leads"],
      datasets: [{
        label: "Outcomes",
        data: [outcomes.success, outcomes.escalated, outcomes.failed, outcomes.leads],
        borderWidth: 0
      }]
    },
    options: {
      plugins: { legend: { labels: { color: "#e8eefc" } } }
    }
  });

  upsertChart("chartLatency", {
    type: "line",
    data: {
      labels: dayLabels,
      datasets: [{ label: "p95 ms", data: p95 }]
    },
    options: baseChartOptions()
  });
}

function baseChartOptions(){
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: "#e8eefc" } }
    },
    scales: {
      x: { ticks: { color: "#8ea0c8" }, grid: { color: "rgba(255,255,255,.05)" } },
      y: { ticks: { color: "#8ea0c8" }, grid: { color: "rgba(255,255,255,.05)" } },
    }
  };
}

function upsertChart(canvasId, config){
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (state.charts[canvasId]) state.charts[canvasId].destroy();
  state.charts[canvasId] = new Chart(ctx, config);
}

/* ---------------- Tables ---------------- */

function renderTables() {
  const data = state.filtered;

  const failed = data
    .filter(c => !c.outcome?.success)
    .slice(0, 30);

  fillTable("failedTable", failed, (c) => ([
    fmtDateTime(c.created_at),
    c.channel,
    c.type,
    truncate(c.messages?.[0]?.content || "", 80),
    c.outcome?.reason || "—",
  ]));

  const escalations = data
    .filter(c => c.outcome?.escalated)
    .slice(0, 30);

  fillTable("escalationTable", escalations, (c) => ([
    fmtDateTime(c.created_at),
    c.channel,
    truncate(c.messages?.[0]?.content || "", 80),
    c.outcome?.lead ? "Lead captured" : "Needs follow-up",
    c.outcome?.lead ? "Yes" : "No"
  ]));
}

function fillTable(tableId, rows, mapper){
  const table = document.getElementById(tableId);
  const tbody = table.querySelector("tbody");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    mapper(r).forEach(cell => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* ---------------- Conversation viewer ---------------- */

function renderConversationList() {
  const list = document.getElementById("convoList");
  list.innerHTML = "";

  const items = state.filtered.slice(0, 80);

  items.forEach(c => {
    const div = document.createElement("div");
    div.className = "list-item" + (c.conversation_id === state.selectedConversationId ? " active" : "");
    div.addEventListener("click", () => {
      state.selectedConversationId = c.conversation_id;
      renderConversationList();
      renderConversationDetail();
    });

    const top = document.createElement("div");
    top.className = "list-top";
    top.innerHTML = `
      <span>${fmtDateTime(c.created_at)} • ${c.channel}</span>
      <span class="badge ${badgeClass(c)}">${badgeText(c)}</span>
    `;

    const q = document.createElement("div");
    q.className = "list-q";
    q.textContent = truncate(c.messages?.[0]?.content || "(no question)", 90);

    div.appendChild(top);
    div.appendChild(q);
    list.appendChild(div);
  });
}

function renderConversationDetail() {
  const detail = document.getElementById("convoDetail");
  const c = state.filtered.find(x => x.conversation_id === state.selectedConversationId);

  if (!c) {
    detail.innerHTML = `<div class="empty">Selecteer een gesprek links.</div>`;
    return;
  }

  const header = `
    <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:10px;">
      <div>
        <div style="font-weight:800; font-size:16px;">Conversation ${c.conversation_id}</div>
        <div style="color:#8ea0c8; font-size:12px;">
          ${fmtDateTime(c.created_at)} • ${c.channel} • ${c.type}/${c.topic} • ${c.prompt_version}
        </div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <span class="badge ${badgeClass(c)}">${badgeText(c)}</span>
        <span class="badge ${confidenceBadge(c)}">conf ${(c.metrics?.confidence ?? 0).toFixed(2)}</span>
        <span class="badge warn">lat ${c.metrics?.latency_ms || 0}ms</span>
      </div>
    </div>
  `;

  const products = (c.outcome?.products || []);
  const productsHtml = products.length ? `
    <div class="msg system">
      <div class="meta"><span>Products</span><span>${c.outcome?.clicked_product ? "Clicked ✅" : "Clicked —"}</span></div>
      <div class="content">
        ${products.map(p => `• ${p.name} (${p.id})`).join("\n")}
      </div>
    </div>
  ` : "";

  const msgs = (c.messages || []).map(m => `
    <div class="msg ${m.role}">
      <div class="meta">
        <span>${m.role.toUpperCase()}</span>
        <span>${fmtDateTime(m.at)}</span>
      </div>
      <div class="content">${escapeHtml(m.content)}</div>
    </div>
  `).join("");

  detail.innerHTML = header + productsHtml + msgs;
}

function badgeText(c){
  if (c.outcome?.lead) return "LEAD";
  if (c.outcome?.escalated) return "ESCALATED";
  if (!c.outcome?.success) return "FAILED";
  return "SUCCESS";
}
function badgeClass(c){
  if (c.outcome?.lead) return "ok";
  if (c.outcome?.escalated) return "warn";
  if (!c.outcome?.success) return "bad";
  return "ok";
}
function confidenceBadge(c){
  const conf = c.metrics?.confidence ?? 1;
  if (conf < 0.55) return "bad";
  if (conf < 0.70) return "warn";
  return "ok";
}

/* ---------------- Export ---------------- */

function exportCSV() {
  const rows = state.filtered.map(c => ({
    conversation_id: c.conversation_id,
    created_at: c.created_at,
    channel: c.channel,
    type: c.type,
    topic: c.topic,
    success: c.outcome?.success,
    escalated: c.outcome?.escalated,
    lead: c.outcome?.lead,
    reason: c.outcome?.reason || "",
    confidence: c.metrics?.confidence ?? "",
    latency_ms: c.metrics?.latency_ms ?? "",
    tokens: c.metrics?.tokens ?? "",
    question: c.messages?.[0]?.content || "",
    answer: c.messages?.[1]?.content || "",
  }));

  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `chatbot_export_${Date.now()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

function toCSV(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map(r => headers.map(h => escape(r[h])).join(","))
  ];
  return lines.join("\n");
}

/* ---------------- Utils ---------------- */

function groupBy(arr, keyFn){
  return arr.reduce((acc, x) => {
    const k = keyFn(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {});
}
function countBy(arr, keyFn){
  return arr.reduce((acc, x) => {
    const k = keyFn(x);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}
function isoDay(iso){
  const d = new Date(iso);
  return d.toISOString().slice(0,10);
}
function fmtDateTime(iso){
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", { dateStyle:"short", timeStyle:"short" });
}
function truncate(s, n){
  s = String(s || "");
  return s.length > n ? s.slice(0, n-1) + "…" : s;
}
function dominant(arr){
  const m = new Map();
  arr.forEach(x => m.set(x, (m.get(x)||0)+1));
  let best=null, bestN=0;
  for (const [k,v] of m.entries()) if (v>bestN){ best=k; bestN=v; }
  return best;
}
function percentile(values, p){
  if (!values.length) return 0;
  const v = [...values].sort((a,b)=>a-b);
  const idx = Math.ceil((p/100)*v.length) - 1;
  return v[Math.max(0, Math.min(v.length-1, idx))];
}
function withinLastDays(iso, days){
  const t = new Date(iso).getTime();
  const now = Date.now();
  const ms = days * 24 * 60 * 60 * 1000;
  return (now - t) <= ms;
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}