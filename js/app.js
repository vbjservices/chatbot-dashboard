// app.js
import { ENV_LABEL } from "./config.js";
import { readCache, writeCache, buildCacheMeta } from "./storage.js";
import { fetchSupabaseRows, fetchChatbotStatus } from "./supabase.js";
import { normalizeChatEvent, groupTurnsToConversations } from "./normalize.js";
import {
  setStatusPill,
  setChatbotPill,
  setEnvLabel,
  setVersionPill,
  setLastUpdatePill,
  setKPI,
  renderConversationList,
  renderConversationDetail,
  renderFailedTable,
  renderEscalationTable,

  // NEW (drilldown overlay)
  openDrilldownOverlay,
} from "./ui.js";
import { renderCharts, destroyCharts } from "./charts.js";

const state = {
  rows: [],
  turns: [],
  conversations: [],

  filteredTurns: [],
  filteredConvos: [],
  selectedId: null,

  filters: {
    range: "30",
    channel: "all",
    type: "all",
    search: "",
  },

  // latency toggle
  latencyMode: "p95", // "p95" | "avg"

  lastLoadedAt: null,
  source: "—",
};

init();

/* ---------------- init ---------------- */

function init() {
  setEnvLabel(ENV_LABEL);
  setStatusPill("Loading");
  setChatbotPill("Loading");

  wireUI();
  loadData({ preferNetwork: true });
}

/* ---------------- loading ---------------- */

async function loadData({ preferNetwork = true } = {}) {
  setStatusPill("Loading");

  // chatbot_status pill ophalen (best-effort, blokkeert load niet)
  (async () => {
    try {
      const st = await fetchChatbotStatus({ botId: "chatbot" });
      if (!st) {
        setChatbotPill("Unknown");
        return;
      }
      setChatbotPill(st.is_up ? "Running" : "Down");
    } catch (e) {
      console.warn("chatbot_status fetch failed:", e);
      setChatbotPill("Unknown");
    }
  })();

  const sinceISO = rangeToSinceISO(state.filters.range);

  if (preferNetwork) {
    try {
      const rows = await fetchSupabaseRows({ sinceISO });
      state.rows = rows || [];
      state.turns = state.rows.map(normalizeChatEvent);
      state.conversations = groupTurnsToConversations(state.turns);

      state.lastLoadedAt = new Date().toISOString();
      state.source = "Supabase";

      writeCache(
        { turns: state.turns },
        buildCacheMeta({ source: "Supabase", rowCount: state.rows.length, sinceISO })
      );

      setStatusPill("Online");

      // DD/MM/YYYY HH:MM
      setLastUpdatePill(
        new Date(state.lastLoadedAt).toLocaleString("nl-NL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );

      setVersionPill(pickVersion(state.turns));

      applyFiltersAndRender({ keepSelection: true });
      return;
    } catch (e) {
      console.warn("Supabase fetch failed:", e);
      // fallback
    }
  }

  const cached = readCache();
  if (cached?.data?.turns?.length) {
    state.rows = [];
    state.turns = cached.data.turns;
    state.conversations = groupTurnsToConversations(state.turns);

    state.lastLoadedAt = cached?.meta?.cachedAt || null;
    state.source = cached?.meta?.source || "Cache";

    setStatusPill("Offline", "cached");

    // DD/MM/YYYY HH:MM
    setLastUpdatePill(
      state.lastLoadedAt
        ? new Date(state.lastLoadedAt).toLocaleString("nl-NL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—"
    );

    setVersionPill(pickVersion(state.turns));

    applyFiltersAndRender({ keepSelection: true });
    return;
  }

  // no data
  state.rows = [];
  state.turns = [];
  state.conversations = [];
  state.filteredTurns = [];
  state.filteredConvos = [];
  state.selectedId = null;

  setStatusPill("Offline");
  setLastUpdatePill("—");
  setVersionPill("—");

  applyFiltersAndRender({ keepSelection: false });
}

/* ---------------- render pipeline ---------------- */

function applyFiltersAndRender({ keepSelection = true } = {}) {
  const f = state.filters;
  const rangeSince = rangeToSinceISO(f.range);

  // 1) FILTER TURNS (waarheid voor KPIs/charts/tables)
  state.filteredTurns = state.turns
    .filter((t) => {
      if (!rangeSince) return true;
      const iso = t.created_at || t.updated_at;
      return !iso || iso >= rangeSince;
    })
    .filter((t) => f.channel === "all" || (t.channel || t.workspace_id) === f.channel)
    .filter((t) => f.type === "all" || (t.type || "unknown") === f.type)
    .filter((t) => {
      if (!f.search) return true;
      const s = f.search.toLowerCase();
      const blob = `${t.user_message || ""}\n${t.ai_output || ""}`.toLowerCase();
      return blob.includes(s) || String(t.conversation_id || "").toLowerCase().includes(s);
    });

  // 2) FILTER CONVERSATIONS (voor viewer) op basis van turns die overblijven
  const allowedConvoIds = new Set(state.filteredTurns.map((t) => t.conversation_id));
  state.filteredConvos = state.conversations.filter((c) => allowedConvoIds.has(c.conversation_id));

  // sorteer gesprekken newest-first op updated_at/created_at
  state.filteredConvos.sort((a, b) => {
    const ta = a.updated_at || a.created_at || "";
    const tb = b.updated_at || b.created_at || "";
    return String(tb).localeCompare(String(ta)); // DESC
  });

  // selection handling (viewer)
  if (keepSelection && state.selectedId) {
    const stillThere = state.filteredConvos.some((c) => c.conversation_id === state.selectedId);
    if (!stillThere) state.selectedId = null;
  } else if (!keepSelection) {
    state.selectedId = null;
  }

  // default: selecteer nieuwste convo als niets gekozen
  if (!state.selectedId) {
    state.selectedId = state.filteredConvos[0]?.conversation_id || null;
  }

  // KPIs — OP TURN LEVEL
  const totalChats = state.filteredTurns.length;
  const successChats = state.filteredTurns.filter((t) => !!(t.success ?? t.outcome?.success)).length;
  const escalChats = state.filteredTurns.filter((t) => !!(t.escalated ?? t.outcome?.escalated)).length;
  const leadChats = state.filteredTurns.filter((t) => !!(t.lead ?? t.outcome?.lead)).length;

  const cost = state.filteredTurns.reduce((a, t) => a + Number(t.metrics?.total_cost ?? 0), 0);

  setKPI("kpiSuccess", totalChats ? `${Math.round((successChats / totalChats) * 100)}%` : "0%");
  setKPI("kpiEscalation", totalChats ? `${Math.round((escalChats / totalChats) * 100)}%` : "0%");
  setKPI("kpiConvos", String(state.filteredTurns.length));
  setKPI("kpiLeads", String(leadChats));
  setKPI("kpiLowConf", "0");
  setKPI("kpiCost", `$${cost.toFixed(6)}`);

  repopulateFilters();

  const selectConversationInMain = (id) => {
    state.selectedId = id || null;
    renderConversationList(state.filteredConvos, state.selectedId, onSelect);

    const convo = state.filteredConvos.find((c) => c.conversation_id === state.selectedId);
    renderConversationDetail(convo || null);
  };

  const onSelect = (id) => selectConversationInMain(id);

  renderConversationList(state.filteredConvos, state.selectedId, onSelect);

  const selected = state.filteredConvos.find((c) => c.conversation_id === state.selectedId);
  renderConversationDetail(selected || null);

  const failedTurns = state.filteredTurns.filter((t) => !(t.success ?? t.outcome?.success));
  const escalTurns = state.filteredTurns.filter((t) => !!(t.escalated ?? t.outcome?.escalated));

  renderFailedTable(failedTurns);
  renderEscalationTable(escalTurns);

  renderChartsOnly({ onPickConversation: selectConversationInMain });
}

function renderChartsOnly({ onPickConversation } = {}) {
  destroyCharts();

  renderCharts({
    turns: state.filteredTurns,
    latencyMode: state.latencyMode,

    onDrill: (evt) => {
      const { kind, key, label } = evt || {};
      if (!kind) return;

      // 1) Selecteer TURNS (overlay lijst)
      const turns = drillTurns({ kind, key, label });

      // 2) Resolver zodat accordion volledige conversation messages kan pakken
      const getConversationById = (id) =>
        state.filteredConvos.find((c) => c.conversation_id === id) ||
        state.conversations.find((c) => c.conversation_id === id) ||
        null;

      // 3) Open overlay
      openDrilldownOverlay({
        title: buildDrillTitle({ kind, label }),
        turns,
        getConversationById,
      });
    },
  });

  syncLatencyToggleUI();
}

/* ---------------- drilldown helpers (TURNS) ---------------- */

function buildDrillTitle({ kind, label }) {
  if (kind === "day") return `Chats • ${label || "—"}`;
  if (kind === "topic") return `Topic • ${label || "—"}`;
  if (kind === "outcome") return `Outcome • ${label || "—"}`;
  return `Details • ${label || "—"}`;
}

function drillTurns({ kind, key, label }) {
  const turns = state.filteredTurns;

  if (kind === "day") {
    // key is ISO date: YYYY-MM-DD (komt uit charts.js bucketByDay keys)
    return turns.filter((t) => {
      const iso = t.updated_at || t.created_at;
      if (!iso) return false;
      return toISODateKey(new Date(iso)) === key;
    });
  }

  if (kind === "topic") {
    const want = String(label || "Overig");
    return turns.filter((t) => String(t.topic || "Overig") === want);
  }

  if (kind === "outcome") {
    const want = String(label || "");

    return turns.filter((t) => {
      const success = !!(t.success ?? t.outcome?.success);
      const escal = !!(t.escalated ?? t.outcome?.escalated);
      const lead = !!(t.lead ?? t.outcome?.lead);
      const other = !(success || escal || lead);

      if (want === "Success") return success;
      if (want === "Escalated") return escal;
      if (want === "Lead") return lead;
      if (want === "Other") return other;
      return false;
    });
  }

  return [];
}

function toISODateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ---------------- UI wiring ---------------- */

function wireUI() {
  const rangeSelect = document.getElementById("rangeSelect");
  const channelSelect = document.getElementById("channelSelect");
  const typeSelect = document.getElementById("typeSelect");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportBtn = document.getElementById("exportBtn");

  const latencyP95Btn = document.getElementById("latencyP95Btn");
  const latencyAvgBtn = document.getElementById("latencyAvgBtn");

  if (rangeSelect) state.filters.range = rangeSelect.value;

  if (rangeSelect) {
    rangeSelect.addEventListener("change", () => {
      state.filters.range = rangeSelect.value;
      loadData({ preferNetwork: true });
    });
  }

  if (channelSelect) {
    channelSelect.addEventListener("change", () => {
      state.filters.channel = channelSelect.value;
      applyFiltersAndRender({ keepSelection: true });
    });
  }

  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      state.filters.type = typeSelect.value;
      applyFiltersAndRender({ keepSelection: true });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.filters.search = searchInput.value.trim();
      applyFiltersAndRender({ keepSelection: true });
    });
  }

  if (refreshBtn) refreshBtn.addEventListener("click", () => loadData({ preferNetwork: true }));
  if (exportBtn) exportBtn.addEventListener("click", exportCSV);

  if (latencyP95Btn) {
    latencyP95Btn.addEventListener("click", () => {
      state.latencyMode = "p95";
      renderChartsOnly();
    });
  }
  if (latencyAvgBtn) {
    latencyAvgBtn.addEventListener("click", () => {
      state.latencyMode = "avg";
      renderChartsOnly();
    });
  }

  syncLatencyToggleUI();
}

function syncLatencyToggleUI() {
  const latencyP95Btn = document.getElementById("latencyP95Btn");
  const latencyAvgBtn = document.getElementById("latencyAvgBtn");
  const latencyTitle = document.getElementById("latencyTitle");

  if (latencyP95Btn) latencyP95Btn.classList.toggle("active", state.latencyMode === "p95");
  if (latencyAvgBtn) latencyAvgBtn.classList.toggle("active", state.latencyMode === "avg");

  if (latencyTitle) {
    latencyTitle.textContent = state.latencyMode === "avg" ? "Latency (avg, s)" : "Latency (p95, s)";
  }
}

function repopulateFilters() {
  const channelSelect = document.getElementById("channelSelect");
  const typeSelect = document.getElementById("typeSelect");

  if (channelSelect) {
    const channels = uniq(state.turns.map((t) => t.channel || t.workspace_id || "unknown")).sort();
    fillSelect(channelSelect, ["all", ...channels], state.filters.channel, "Alle kanalen");
  }

  if (typeSelect) {
    const types = uniq(state.turns.map((t) => t.type || "unknown")).sort();
    fillSelect(typeSelect, ["all", ...types], state.filters.type, "Alle types");
  }
}

function fillSelect(selectEl, values, selected, allLabel) {
  const current = selectEl.value;
  selectEl.innerHTML = "";

  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v === "all" ? allLabel : v;
    selectEl.appendChild(opt);
  }

  const want = selected || current || "all";
  selectEl.value = values.includes(want) ? want : "all";
}

/* ---------------- CSV export ---------------- */

function exportCSV() {
  const rows = state.filteredTurns.map((t) => ({
    conversation_id: t.conversation_id,
    created_at: t.created_at,
    channel: t.channel,
    type: t.type,
    topic: t.topic,
    success: !!(t.success ?? t.outcome?.success),
    escalated: !!(t.escalated ?? t.outcome?.escalated),
    lead: !!(t.lead ?? t.outcome?.lead),
    reason: t.reason || t.outcome?.reason || "",
    latency_ms: t.metrics?.latency_ms ?? "",
    tokens: t.metrics?.tokens ?? "",
    total_cost_usd: t.metrics?.total_cost ?? "",
    user_message: t.user_message || "",
    ai_output: t.ai_output || "",
  }));

  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chat_events_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

/* ---------------- helpers ---------------- */

function rangeToSinceISO(range) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (range === "7") return new Date(now - 7 * day).toISOString();
  if (range === "14") return new Date(now - 14 * day).toISOString();
  if (range === "30") return new Date(now - 30 * day).toISOString();

  if (range === "7d") return new Date(now - 7 * day).toISOString();
  if (range === "14d") return new Date(now - 14 * day).toISOString();
  if (range === "30d") return new Date(now - 30 * day).toISOString();
  if (range === "90d") return new Date(now - 90 * day).toISOString();

  return null;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function pickVersion(turns) {
  const v = turns.find((t) => t.bot_key)?.bot_key;
  return v || "—";
}
