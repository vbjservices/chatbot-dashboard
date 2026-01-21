// app.js
import { ENV_LABEL } from "./config.js";
import { readCache, writeCache, buildCacheMeta } from "./storage.js";
import { fetchSupabaseRows } from "./supabase.js";
import { normalizeChatEvent, groupTurnsToConversations } from "./normalize.js";
import {
  setStatusPill,
  setEnvLabel,
  setVersionPill,
  setLastUpdatePill,
  setKPI,
  renderConversationList,
  renderConversationDetail,
  renderFailedTable,
  renderEscalationTable,
} from "./ui.js";
import { renderCharts, destroyCharts } from "./charts.js";

const state = {
  rows: [],
  turns: [],
  conversations: [],
  filtered: [],
  selectedId: null,

  filters: {
    range: "7d",
    channel: "all",
    type: "all",
    search: "",
  },

  lastLoadedAt: null,
  source: "—",
};

init();

/* ---------------- init ---------------- */

function init() {
  setEnvLabel(ENV_LABEL);
  setStatusPill("Loading");

  wireUI();
  loadData({ preferNetwork: true });
}

/* ---------------- loading ---------------- */

async function loadData({ preferNetwork = true } = {}) {
  setStatusPill("Loading");

  const sinceISO = rangeToSinceISO(state.filters.range);

  // 1) Probeer Supabase (netwerk)
  if (preferNetwork) {
    try {
      const rows = await fetchSupabaseRows({ sinceISO });
      state.rows = rows || [];
      state.turns = state.rows.map(normalizeChatEvent);
      state.conversations = groupTurnsToConversations(state.turns);

      state.lastLoadedAt = new Date().toISOString();
      state.source = "Supabase";

      // Cache: bewaar genormaliseerde turns (kleiner dan raw rows) + meta
      writeCache(
        { turns: state.turns },
        buildCacheMeta({
          source: "Supabase",
          rowCount: state.rows.length,
          sinceISO,
        })
      );

      setStatusPill("Online");
      setLastUpdatePill(new Date(state.lastLoadedAt).toLocaleString());
      setVersionPill(pickVersion(state.turns));

      applyFiltersAndRender();
      return;
    } catch (e) {
      console.warn("Supabase fetch failed:", e);
      // val terug op cache
    }
  }

  // 2) Cache fallback
  const cached = readCache();
  if (cached?.data?.turns?.length) {
    state.rows = [];
    state.turns = cached.data.turns;
    state.conversations = groupTurnsToConversations(state.turns);

    state.lastLoadedAt = cached?.meta?.cachedAt || null;
    state.source = cached?.meta?.source || "Cache";

    setStatusPill("Offline", "cached");
    setLastUpdatePill(state.lastLoadedAt ? new Date(state.lastLoadedAt).toLocaleString() : "—");
    setVersionPill(pickVersion(state.turns));

    applyFiltersAndRender();
    return;
  }

  // 3) Geen data beschikbaar → offline + leeg
  state.rows = [];
  state.turns = [];
  state.conversations = [];
  state.filtered = [];
  state.selectedId = null;

  setStatusPill("Offline");
  setLastUpdatePill("—");
  setVersionPill("—");

  applyFiltersAndRender();
}

/* ---------------- render pipeline ---------------- */

function applyFiltersAndRender() {
  const f = state.filters;
  const rangeSince = rangeToSinceISO(f.range);

  state.filtered = state.conversations
    .filter((c) => !rangeSince || (c.updated_at || c.created_at) >= rangeSince)
    .filter((c) => f.channel === "all" || c.channel === f.channel)
    .filter((c) => f.type === "all" || c.type === f.type)
    .filter((c) => {
      if (!f.search) return true;
      const s = f.search.toLowerCase();
      const blob = (c.messages || []).map(m => m.content).join("\n").toLowerCase();
      return blob.includes(s) || String(c.conversation_id).toLowerCase().includes(s);
    });

  // default select
  if (!state.selectedId || !state.filtered.some(c => c.conversation_id === state.selectedId)) {
    state.selectedId = state.filtered[0]?.conversation_id || null;
  }

  // KPIs
  const total = state.filtered.length;
  const success = state.filtered.filter(c => !!c.outcome?.success).length;
  const escal = state.filtered.filter(c => !!c.outcome?.escalated).length;
  const leads = state.filtered.filter(c => !!c.outcome?.lead).length;

  const cost = state.filtered.reduce((a, c) => a + Number(c.metrics?.total_cost ?? 0), 0);

  // LowConf KPI bestaat in UI; we hebben geen confidence-score → zet op 0
  const lowConf = 0;

  setKPI("kpiSuccess", total ? `${Math.round((success / total) * 100)}%` : "0%");
  setKPI("kpiEscalation", total ? `${Math.round((escal / total) * 100)}%` : "0%");
  setKPI("kpiConvos", String(total));
  setKPI("kpiLeads", String(leads));
  setKPI("kpiLowConf", String(lowConf));
  setKPI("kpiCost", `$${cost.toFixed(6)}`);

  // Filters dropdown opties (channel/type)
  repopulateFilters();

  // List + detail
  renderConversationList(state.filtered, state.selectedId, (id) => {
    state.selectedId = id;
    renderConversationDetail(state.filtered.find(c => c.conversation_id === id));
  });

  renderConversationDetail(state.filtered.find(c => c.conversation_id === state.selectedId));

  // Tables
  const failed = state.filtered.filter(c => !c.outcome?.success);
  const escalRows = state.filtered.filter(c => !!c.outcome?.escalated);

  renderFailedTable(failed);
  renderEscalationTable(escalRows);

  // Charts
  destroyCharts();
  renderCharts({ conversations: state.filtered });
}

/* ---------------- UI wiring ---------------- */

function wireUI() {
  const rangeSelect = document.getElementById("rangeSelect");
  const channelSelect = document.getElementById("channelSelect");
  const typeSelect = document.getElementById("typeSelect");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportBtn = document.getElementById("exportBtn");

  if (rangeSelect) {
    rangeSelect.addEventListener("change", () => {
      state.filters.range = rangeSelect.value;
      // reload from network for new range (liefst)
      loadData({ preferNetwork: true });
    });
  }

  if (channelSelect) {
    channelSelect.addEventListener("change", () => {
      state.filters.channel = channelSelect.value;
      applyFiltersAndRender();
    });
  }

  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      state.filters.type = typeSelect.value;
      applyFiltersAndRender();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.filters.search = searchInput.value.trim();
      applyFiltersAndRender();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => loadData({ preferNetwork: true }));
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", exportCSV);
  }
}

function repopulateFilters() {
  const channelSelect = document.getElementById("channelSelect");
  const typeSelect = document.getElementById("typeSelect");

  if (channelSelect) {
    const channels = uniq(state.conversations.map(c => c.channel || "unknown")).sort();
    fillSelect(channelSelect, ["all", ...channels], state.filters.channel, "All channels");
  }

  if (typeSelect) {
    const types = uniq(state.conversations.map(c => c.type || "chat")).sort();
    fillSelect(typeSelect, ["all", ...types], state.filters.type, "All types");
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

  // preserve if possible
  const want = selected || current || "all";
  selectEl.value = values.includes(want) ? want : "all";
}

/* ---------------- CSV export ---------------- */

function exportCSV() {
  const rows = state.filtered.map((c) => {
    const firstUser = c.messages?.find(m => m.role === "user")?.content || "";
    const lastAssist = [...(c.messages || [])].reverse().find(m => m.role === "assistant")?.content || "";
    return {
      conversation_id: c.conversation_id,
      channel: c.channel,
      type: c.type,
      topic: c.topic,
      updated_at: c.updated_at,
      success: !!c.outcome?.success,
      escalated: !!c.outcome?.escalated,
      lead: !!c.outcome?.lead,
      tokens: Number(c.metrics?.tokens ?? 0),
      total_cost_usd: Number(c.metrics?.total_cost ?? 0),
      user_message: firstUser,
      ai_output: lastAssist,
    };
  });

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
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => esc(r[c])).join(",")),
  ].join("\n");
}

/* ---------------- helpers ---------------- */

function rangeToSinceISO(range) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (range === "24h") return new Date(now - 1 * day).toISOString();
  if (range === "7d") return new Date(now - 7 * day).toISOString();
  if (range === "30d") return new Date(now - 30 * day).toISOString();
  if (range === "90d") return new Date(now - 90 * day).toISOString();
  return null; // "all"
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function pickVersion(turns) {
  const v = turns.find(t => t.bot_key)?.bot_key;
  return v || "—";
}