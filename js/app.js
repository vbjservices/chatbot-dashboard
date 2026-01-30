// app.js
import { ENV_LABEL, PROFILES_TABLE } from "./config.js";
import { getConnection, setConnection, hasConnection, setConnectionScope, clearConnection } from "./connection.js";
import { readCache, writeCache, clearCache, buildCacheMeta } from "./storage.js";
import { fetchSupabaseRows, fetchChatbotStatus } from "./supabase.js";
import { normalizeChatEvent, groupTurnsToConversations } from "./normalize.js";
import { supabase } from "./auth.js";
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
  notify,

  // NEW (drilldown overlay)
  openDrilldownOverlay,
} from "./ui.js";
import { renderCharts, destroyCharts } from "./charts.js";
import { toISODateKey } from "./utils/date.js";

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

  userId: null,
  userHasPassword: false,
  isAdmin: false,
  adminView: null,
  adminUsers: [],
};

init().catch((err) => {
  console.error("Init failed:", err);
});

/* ---------------- init ---------------- */

async function init() {
  const user = await ensureAuthenticated();
  if (!user) return;

  const profile = await fetchProfile(user.id);
  await hydrateConnectionFromProfile(user, profile);
  await hydrateSidebarUser(user, profile);
  if (state.isAdmin) {
    await loadAdminUsers();
  }

  setEnvLabel(ENV_LABEL);
  setStatusPill("Loading");
  setChatbotPill("Loading");

  wireUI();
  loadData({ preferNetwork: true });
}

async function ensureAuthenticated() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (user) {
      state.userId = user.id || null;
      if (state.userId) setConnectionScope(state.userId);
      return user;
    }
  } catch (err) {
    console.warn("Auth session check failed:", err);
  }
  window.location.href = "./login.html";
  return null;
}

async function fetchProfile(userId) {
  if (!userId) return null;
  try {
    const attempts = [
      "id, is_admin, has_password, supabase_url, supabase_anon_key",
      "id, is_admin, has_password, supabase_url",
      "id, is_admin, has_password",
      "id, is_admin",
      "id, admin, has_password, supabase_url, supabase_anon_key",
      "id, admin, has_password",
      "id, admin",
      "id, has_password",
      "id",
    ];

    let data = null;
    let error = null;
    for (const select of attempts) {
      ({ data, error } = await supabase.from(PROFILES_TABLE).select(select).eq("id", userId).maybeSingle());
      if (!error) break;
      const msg = error.message || "";
      if (!/column/i.test(msg)) break;
    }
    if (error) {
      console.warn("Failed to fetch profile:", error.message || error);
      return null;
    }
    const isAdmin = coerceBoolean(data?.is_admin ?? data?.admin ?? data?.isAdmin);
    state.isAdmin = isAdmin;
    if (coerceBoolean(data?.has_password ?? data?.hasPassword)) state.userHasPassword = true;
    if (!state.isAdmin) {
      state.adminView = null;
      state.adminUsers = [];
    }
    return data || null;
  } catch (err) {
    console.warn("Failed to fetch profile:", err);
    return null;
  }
}

async function loadAdminUsers() {
  if (!state.isAdmin) return;
  try {
    const baseQuery = supabase.from(PROFILES_TABLE);
    let data = null;
    let error = null;

    const attempts = [
      { select: "id, email, full_name, company, supabase_url, supabase_anon_key", order: "email" },
      { select: "id, email, full_name, company", order: "email" },
      { select: "id, email, full_name", order: "email" },
      { select: "id, email", order: "email" },
      { select: "id", order: "id" },
    ];

    for (const attempt of attempts) {
      ({ data, error } = await baseQuery.select(attempt.select).order(attempt.order, { ascending: true }));
      if (!error) break;
      const msg = error.message || "";
      if (!/column/i.test(msg)) break;
    }

    if (error) {
      console.warn("Failed to load users:", error.message || error);
      return;
    }
    state.adminUsers = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn("Failed to load users:", err);
  }
}

async function fetchProfileRowById(userId) {
  if (!userId) return null;
  try {
    const attempts = [
      "id, email, full_name, company, supabase_url, supabase_anon_key",
      "id, email, full_name, company, supabase_url",
      "id, email, full_name, company",
      "id, email, full_name",
      "id, email",
      "id",
    ];

    let data = null;
    let error = null;
    for (const select of attempts) {
      ({ data, error } = await supabase.from(PROFILES_TABLE).select(select).eq("id", userId).maybeSingle());
      if (!error) break;
      const msg = error.message || "";
      if (!/column/i.test(msg)) break;
    }

    if (error) {
      console.warn("Failed to fetch profile row:", error.message || error);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn("Failed to fetch profile row:", err);
    return null;
  }
}

async function resolveAdminCredentialList() {
  const users = Array.isArray(state.adminUsers) ? state.adminUsers : [];
  if (!users.length) return [];

  const resolved = await Promise.all(
    users.map(async (user) => {
      let url = user?.supabase_url || user?.supabaseUrl || "";
      let anonKey = user?.supabase_anon_key || user?.supabaseAnonKey || "";

      if (!url || !anonKey) {
        const row = await fetchProfileRowById(user.id);
        if (row) {
          url = row.supabase_url || row.supabaseUrl || url;
          anonKey = row.supabase_anon_key || row.supabaseAnonKey || anonKey;
        }
      }

      return {
        id: user.id,
        label: user.full_name || user.email || user.id,
        url,
        anonKey,
      };
    })
  );

  return resolved.filter((u) => u.url && u.anonKey);
}

function getActiveCredentials() {
  if (state.adminView) {
    if (state.adminView.url && state.adminView.anonKey) {
      return { url: state.adminView.url, anonKey: state.adminView.anonKey };
    }
    return null;
  }
  const { url, anonKey } = getConnection();
  return url && anonKey ? { url, anonKey } : null;
}

function getCacheScope() {
  if (state.isAdmin && !state.adminView) return "admin:all";
  if (state.adminView?.id) return `admin:${state.adminView.id}`;
  return state.userId || "";
}

async function hydrateConnectionFromProfile(user, profile) {
  if (!user || hasConnection()) return;

  const meta = user.user_metadata || {};
  const url =
    meta.supabase_url ||
    meta.supabaseUrl ||
    profile?.supabase_url ||
    profile?.supabaseUrl ||
    "";
  const anonKey =
    meta.supabase_anon_key ||
    meta.supabaseAnonKey ||
    meta.supabaseKey ||
    profile?.supabase_anon_key ||
    profile?.supabaseAnonKey ||
    profile?.supabaseKey ||
    "";

  if (url && anonKey) {
    setConnection({ url, anonKey, remember: true });
  }
}

async function hydrateSidebarUser(user, profile) {
  const nameEl = document.getElementById("sidebarUserName");
  const emailEl = document.getElementById("sidebarUserEmail");
  const setPasswordBtn = document.getElementById("setPasswordBtn");
  const adminUserField = document.getElementById("adminUserField");
  const adminUserMeta = document.getElementById("adminUserMeta");
  if (!nameEl) return;

  try {
    const currentUser = user || (await supabase.auth.getUser()).data?.user;
    const meta = currentUser?.user_metadata || {};
    if (meta.has_password === true) state.userHasPassword = true;
    const activeProfile = profile || null;
    if (activeProfile?.has_password === true) state.userHasPassword = true;

    if (!currentUser) {
      nameEl.textContent = "-";
      if (emailEl) emailEl.textContent = "";
      if (setPasswordBtn) setPasswordBtn.hidden = true;
      if (adminUserField) adminUserField.hidden = true;
      if (adminUserMeta) adminUserMeta.hidden = true;
      return;
    }

    const name = meta.full_name || meta.name || currentUser.email || "-";
    const email = currentUser.email || "";

    nameEl.textContent = name;
    if (emailEl) {
      if (!email || email === name) {
        emailEl.textContent = "";
        emailEl.style.display = "none";
      } else {
        emailEl.textContent = email;
        emailEl.style.display = "block";
      }
    }

    if (setPasswordBtn) setPasswordBtn.hidden = state.userHasPassword;
    if (adminUserField) adminUserField.hidden = !state.isAdmin;
    if (adminUserMeta) adminUserMeta.hidden = !state.isAdmin;
    document.body.classList.toggle("is-admin", state.isAdmin);
  } catch (err) {
    console.warn("Failed to load user profile:", err);
    nameEl.textContent = "-";
    if (emailEl) emailEl.textContent = "";
    if (setPasswordBtn) setPasswordBtn.hidden = true;
    if (adminUserField) adminUserField.hidden = true;
    if (adminUserMeta) adminUserMeta.hidden = true;
    document.body.classList.remove("is-admin");
  }
}

/* ---------------- loading ---------------- */

async function loadData({ preferNetwork = true } = {}) {
  if (state.isAdmin && !state.adminView) {
    await loadAllUsersData({ preferNetwork });
    return;
  }

  const activeCreds = getActiveCredentials();
  const hasConn = !!activeCreds;
  if (hasConn) {
    setStatusPill("Loading");
  } else {
    setStatusPill("Disconnected");
    setChatbotPill("Disconnected");
  }

  // chatbot_status pill ophalen (best-effort, blokkeert load niet)
  if (hasConn) {
    (async () => {
      try {
        const st = await fetchChatbotStatus({ botId: "chatbot", credentials: activeCreds });
        if (!st) {
          setChatbotPill("Disconnected");
          return;
        }
        setChatbotPill(st.is_up ? "Online" : "Offline");
      } catch (e) {
        console.warn("chatbot_status fetch failed:", e);
        setChatbotPill("Disconnected");
      }
    })();
  }

  const sinceISO = rangeToSinceISO(state.filters.range);

  if (preferNetwork && hasConn) {
    try {
      const rows = await fetchSupabaseRows({ sinceISO, credentials: activeCreds });
      state.rows = rows || [];
      state.turns = state.rows.map(normalizeChatEvent);
      state.conversations = groupTurnsToConversations(state.turns);

      state.lastLoadedAt = new Date().toISOString();
      state.source = "Supabase";

      writeCache(
        { turns: state.turns },
        buildCacheMeta({ source: "Supabase", rowCount: state.rows.length, sinceISO }),
        { scope: getCacheScope() }
      );

      setStatusPill("Connected");

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

  const cached = readCache({ scope: getCacheScope() });
  if (cached?.data?.turns?.length) {
    state.rows = [];
    state.turns = cached.data.turns;
    state.conversations = groupTurnsToConversations(state.turns);

    state.lastLoadedAt = cached?.meta?.cachedAt || null;
    state.source = cached?.meta?.source || "Cache";

    setStatusPill("Disconnected", "cached");

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

  setStatusPill("Disconnected");
  setLastUpdatePill("—");
  setVersionPill("—");

  applyFiltersAndRender({ keepSelection: false });
}

async function loadAllUsersData({ preferNetwork = true } = {}) {
  const sinceISO = rangeToSinceISO(state.filters.range);
  const credsList = await resolveAdminCredentialList();
  const total = credsList.length;

  if (!total) {
    setStatusPill("Disconnected");
    setChatbotPill("Disconnected");
    state.rows = [];
    state.turns = [];
    state.conversations = [];
    state.filteredTurns = [];
    state.filteredConvos = [];
    state.selectedId = null;
    setLastUpdatePill("â€”");
    setVersionPill("â€”");
    applyFiltersAndRender({ keepSelection: false });
    return;
  }

  setChatbotPill("Multiple");

  if (preferNetwork) {
    try {
      setStatusPill("Loading");

      const results = await Promise.allSettled(
        credsList.map((creds) => fetchSupabaseRows({ sinceISO, credentials: creds }))
      );

      const rows = [];
      let successCount = 0;
      let failureCount = 0;

      for (const result of results) {
        if (result.status === "fulfilled") {
          successCount += 1;
          if (Array.isArray(result.value)) rows.push(...result.value);
        } else {
          failureCount += 1;
          console.warn("All-users fetch failed:", result.reason);
        }
      }

      if (!rows.length) {
        throw new Error("No rows fetched for All users.");
      }

      state.rows = rows;
      state.turns = state.rows.map(normalizeChatEvent);
      state.conversations = groupTurnsToConversations(state.turns);

      state.lastLoadedAt = new Date().toISOString();
      state.source = failureCount ? `Supabase (${successCount}/${total})` : "Supabase (All users)";

      writeCache(
        { turns: state.turns },
        buildCacheMeta({ source: state.source, rowCount: state.rows.length, sinceISO }),
        { scope: getCacheScope() }
      );

      setStatusPill("Connected", failureCount ? `${successCount}/${total}` : "");
      if (failureCount) {
        notify(`Some user connections failed (${successCount}/${total}).`, { variant: "warn", key: "all-users" });
      }

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
      console.warn("All-users Supabase fetch failed:", e);
      // fallback below
    }
  }

  const cached = readCache({ scope: getCacheScope() });
  if (cached?.data?.turns?.length) {
    state.rows = [];
    state.turns = cached.data.turns;
    state.conversations = groupTurnsToConversations(state.turns);

    state.lastLoadedAt = cached?.meta?.cachedAt || null;
    state.source = cached?.meta?.source || "Cache";

    setStatusPill("Disconnected", "cached");

    setLastUpdatePill(
      state.lastLoadedAt
        ? new Date(state.lastLoadedAt).toLocaleString("nl-NL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "â€”"
    );

    setVersionPill(pickVersion(state.turns));
    applyFiltersAndRender({ keepSelection: true });
    return;
  }

  state.rows = [];
  state.turns = [];
  state.conversations = [];
  state.filteredTurns = [];
  state.filteredConvos = [];
  state.selectedId = null;

  setStatusPill("Disconnected");
  setLastUpdatePill("â€”");
  setVersionPill("â€”");
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
    renderConversationDetail(convo || null, { searchTerm: state.filters.search });
  };

  const onSelect = (id) => selectConversationInMain(id);

  renderConversationList(state.filteredConvos, state.selectedId, onSelect);

  const selected = state.filteredConvos.find((c) => c.conversation_id === state.selectedId);
  renderConversationDetail(selected || null, { searchTerm: state.filters.search });

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
        searchTerm: state.filters.search,
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
    const want = String(label || "Other");
    return turns.filter((t) => String(t.topic || "Other") === want);
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

/* ---------------- UI wiring ---------------- */

function wireUI() {
  const rangeSelect = document.getElementById("rangeSelect");
  const channelSelect = document.getElementById("channelSelect");
  const typeSelect = document.getElementById("typeSelect");
  const searchInput = document.getElementById("searchInput");
  const refreshBtn = document.getElementById("refreshBtn");
  const exportBtn = document.getElementById("exportBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const setPasswordBtn = document.getElementById("setPasswordBtn");
  const connectionBtn = document.getElementById("connectionBtn");
  const connectionOverlay = document.getElementById("connectionOverlay");
  const connectionBackdrop = document.getElementById("connectionOverlayBackdrop");
  const connectionClose = document.getElementById("connectionOverlayClose");
  const connectionSave = document.getElementById("connectionSaveBtn");
  const supabaseUrlInput = document.getElementById("supabaseUrlInput");
  const supabaseKeyInput = document.getElementById("supabaseKeyInput");
  const rememberConnection = document.getElementById("rememberConnection");
  const supabaseUrlToggle = document.getElementById("supabaseUrlToggle");
  const supabaseKeyToggle = document.getElementById("supabaseKeyToggle");
  const passwordOverlay = document.getElementById("passwordOverlay");
  const passwordBackdrop = document.getElementById("passwordOverlayBackdrop");
  const passwordClose = document.getElementById("passwordOverlayClose");
  const savePasswordBtn = document.getElementById("savePasswordBtn");
  const newPasswordInput = document.getElementById("newPasswordInput");
  const confirmPasswordInput = document.getElementById("confirmPasswordInput");
  const passwordMessage = document.getElementById("passwordMessage");
  const adminUserField = document.getElementById("adminUserField");
  const adminUserSelect = document.getElementById("adminUserSelect");
  const adminUserMeta = document.getElementById("adminUserMeta");
  const adminUserLabel = document.getElementById("adminUserLabel");
  const adminUserUrl = document.getElementById("adminUserUrl");
  const adminUserKey = document.getElementById("adminUserKey");

  const latencyP95Btn = document.getElementById("latencyP95Btn");
  const latencyAvgBtn = document.getElementById("latencyAvgBtn");

  function setupSecretToggle(input, button, label) {
    if (!input || !button) return null;
    const baseLabel = String(label || "value");

    if (input.type !== "password") input.type = "password";
    if (input.id) button.setAttribute("aria-controls", input.id);

    const sync = () => {
      const visible = input.type === "text";
      button.dataset.visible = visible ? "true" : "false";
      button.setAttribute("aria-pressed", visible ? "true" : "false");
      button.setAttribute("aria-label", visible ? `Hide ${baseLabel}` : `Show ${baseLabel}`);
    };

    button.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      sync();
      input.focus();
    });

    sync();
    return {
      sync,
      hide: () => {
        input.type = "password";
        sync();
      },
    };
  }

  const urlSecret = setupSecretToggle(supabaseUrlInput, supabaseUrlToggle, "Project URL");
  const keySecret = setupSecretToggle(supabaseKeyInput, supabaseKeyToggle, "Anon key");

  const setPasswordMessage = (type, text) => {
    if (!passwordMessage) return;
    passwordMessage.textContent = text || "";
    passwordMessage.className = "password-message" + (type ? ` ${type}` : "");
  };

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
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      try {
        clearCache({ scope: state.userId });
        clearConnection();
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Sign out failed:", err);
      } finally {
        window.location.href = "./login.html";
      }
    });
  }

  if (connectionBtn && connectionOverlay) {
    const openConnectionOverlay = () => {
      const { url, anonKey, remember } = getConnection();
      if (supabaseUrlInput) supabaseUrlInput.value = url || "";
      if (supabaseKeyInput) supabaseKeyInput.value = anonKey || "";
      urlSecret?.hide?.();
      keySecret?.hide?.();
      if (rememberConnection) rememberConnection.checked = !!remember;
      connectionOverlay.classList.add("is-open");
      connectionOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("overlay-open");
      connectionClose?.focus?.();
    };

    const closeConnectionOverlay = () => {
      connectionOverlay.classList.remove("is-open");
      connectionOverlay.setAttribute("aria-hidden", "true");
      const drill = document.getElementById("drillOverlay");
      const drillOpen = drill?.classList.contains("is-open");
      if (!drillOpen) document.body.classList.remove("overlay-open");
    };

    const saveConnection = async () => {
      const url = supabaseUrlInput?.value || "";
      const anonKey = supabaseKeyInput?.value || "";
      const remember = !!rememberConnection?.checked;
      setConnection({ url, anonKey, remember });
      await persistConnectionToProfile({ url, anonKey, remember });
      closeConnectionOverlay();
      loadData({ preferNetwork: true });
    };

    connectionBtn.addEventListener("click", openConnectionOverlay);
    connectionBackdrop?.addEventListener("click", closeConnectionOverlay);
    connectionClose?.addEventListener("click", closeConnectionOverlay);
    connectionSave?.addEventListener("click", saveConnection);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeConnectionOverlay();
    });
  }

  if (setPasswordBtn && passwordOverlay) {
    const openPasswordOverlay = () => {
      if (state.userHasPassword) return;
      if (newPasswordInput) newPasswordInput.value = "";
      if (confirmPasswordInput) confirmPasswordInput.value = "";
      setPasswordMessage("", "");
      passwordOverlay.classList.add("is-open");
      passwordOverlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("overlay-open");
      newPasswordInput?.focus?.();
    };

    const closePasswordOverlay = () => {
      passwordOverlay.classList.remove("is-open");
      passwordOverlay.setAttribute("aria-hidden", "true");
      const connectionOpen = connectionOverlay?.classList.contains("is-open");
      const drill = document.getElementById("drillOverlay");
      const drillOpen = drill?.classList.contains("is-open");
      if (!connectionOpen && !drillOpen) document.body.classList.remove("overlay-open");
    };

    const savePassword = async () => {
      const password = newPasswordInput?.value || "";
      const confirm = confirmPasswordInput?.value || "";

      if (!password || password.length < 8) {
        setPasswordMessage("error", "Use at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setPasswordMessage("error", "Passwords do not match.");
        return;
      }

      setPasswordMessage("", "Saving...");
      try {
        const { error } = await supabase.auth.updateUser({
          password,
          data: { has_password: true },
        });
        if (error) {
          setPasswordMessage("error", error.message || "Unable to set password.");
          return;
        }

        if (state.userId) {
          supabase
            .from(PROFILES_TABLE)
            .update({ has_password: true, updated_at: new Date().toISOString() })
            .eq("id", state.userId)
            .then(({ error: profileError }) => {
              if (profileError) {
                console.warn("Failed to update profile has_password:", profileError.message || profileError);
              }
            });
        }

        state.userHasPassword = true;
        if (setPasswordBtn) setPasswordBtn.hidden = true;
        setPasswordMessage("success", "Password saved. You can now sign in with it.");
        setTimeout(closePasswordOverlay, 700);
      } catch (err) {
        setPasswordMessage("error", err?.message || "Unable to set password.");
      }
    };

    setPasswordBtn.addEventListener("click", openPasswordOverlay);
    passwordBackdrop?.addEventListener("click", closePasswordOverlay);
    passwordClose?.addEventListener("click", closePasswordOverlay);
    savePasswordBtn?.addEventListener("click", savePassword);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePasswordOverlay();
    });
  }

  if (adminUserField) adminUserField.hidden = !state.isAdmin;
  if (adminUserMeta) adminUserMeta.hidden = !state.isAdmin;

  if (state.isAdmin && adminUserSelect) {
    const renderAdminOptions = () => {
      adminUserSelect.innerHTML = "";
      const duplicateIds = getDuplicateCredentialIds(state.adminUsers);
      const optAll = document.createElement("option");
      optAll.value = "";
      optAll.textContent = "All users";
      adminUserSelect.appendChild(optAll);

      for (const user of state.adminUsers) {
        const opt = document.createElement("option");
        opt.value = user.id;
        const label = user.full_name || user.email || user.id;
        const isDup = duplicateIds.has(user.id);
        opt.textContent = isDup ? `${label} ⚠️` : label;
        if (isDup) opt.title = "Duplicate Supabase credentials";
        adminUserSelect.appendChild(opt);
      }

      if (state.adminView?.id) {
        adminUserSelect.value = state.adminView.id;
      }
    };

    const updateAdminMeta = (user) => {
      if (!adminUserLabel || !adminUserUrl || !adminUserKey) return;
      if (!user) {
        adminUserLabel.textContent = "All users";
        adminUserUrl.textContent = "Project URL: —";
        adminUserKey.textContent = "Anon key: —";
        return;
      }
      const label = user.full_name || user.email || user.label || user.id;
      const url = user.supabase_url || user.supabaseUrl || user.url || "";
      const key = user.supabase_anon_key || user.supabaseAnonKey || user.anonKey || "";
      adminUserLabel.textContent = label;
      adminUserUrl.textContent = url ? `Project URL: ${url}` : "Project URL: — (not saved)";
      adminUserKey.textContent = key ? `Anon key: ${key}` : "Anon key: — (not saved)";
    };

    renderAdminOptions();
    updateAdminMeta(state.adminView);

    adminUserSelect.addEventListener("change", async () => {
      const id = adminUserSelect.value;
      if (!id) {
        state.adminView = null;
        updateAdminMeta(null);
        loadData({ preferNetwork: true });
        return;
      }

      const selected = state.adminUsers.find((u) => u.id === id) || { id };
      updateAdminMeta(selected);

      const row = await fetchProfileRowById(id);
      const resolved = { ...selected, ...(row || {}) };
      const url = resolved.supabase_url || resolved.supabaseUrl || "";
      const anonKey = resolved.supabase_anon_key || resolved.supabaseAnonKey || "";

      state.adminView = {
        id,
        label: resolved.full_name || resolved.email || resolved.label || id,
        url,
        anonKey,
      };
      updateAdminMeta(resolved);
      loadData({ preferNetwork: true });
    });
  }

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
    fillSelect(channelSelect, ["all", ...channels], state.filters.channel, "All channels");
  }

  if (typeSelect) {
    const types = uniq(state.turns.map((t) => t.type || "unknown")).sort();
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
  if (range == null) return null;

  const raw = String(range).trim().toLowerCase();
  const match = raw.match(/^(\d+)\s*d?$/);
  if (match) {
    const days = Number(match[1]);
    if (days > 0) return new Date(now - days * day).toISOString();
  }

  return null;
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function pickVersion(turns) {
  const v = turns.find((t) => t.bot_key)?.bot_key;
  return v || "—";
}

function coerceBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === "true" || s === "t" || s === "1" || s === "yes" || s === "y";
}

function normalizeCredUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  return lower.endsWith("/") ? lower.slice(0, -1) : lower;
}

function normalizeCredKey(value) {
  return String(value || "").trim();
}

function buildCredentialKey(user) {
  const url = normalizeCredUrl(user?.supabase_url || user?.supabaseUrl || "");
  const key = normalizeCredKey(user?.supabase_anon_key || user?.supabaseAnonKey || "");
  if (!url || !key) return "";
  return `${url}::${key}`;
}

function getDuplicateCredentialIds(users = []) {
  const map = new Map();
  for (const u of users || []) {
    const k = buildCredentialKey(u);
    if (!k) continue;
    const arr = map.get(k);
    if (arr) arr.push(u.id);
    else map.set(k, [u.id]);
  }

  const dupes = new Set();
  for (const ids of map.values()) {
    if (ids.length > 1) {
      for (const id of ids) dupes.add(id);
    }
  }
  return dupes;
}

async function getCurrentUserId() {
  if (state.userId) return state.userId;
  try {
    const { data } = await supabase.auth.getUser();
    const id = data?.user?.id || null;
    if (id) state.userId = id;
    return id;
  } catch (err) {
    console.warn("Failed to resolve current user id:", err);
    return null;
  }
}

async function persistConnectionToProfile({ url, anonKey, remember } = {}) {
  const cleanUrl = String(url || "").trim();
  const cleanKey = String(anonKey || "").trim();
  const hasCreds = !!(cleanUrl && cleanKey);
  const payload = hasCreds
    ? { supabase_url: cleanUrl, supabase_anon_key: cleanKey }
    : { supabase_url: null, supabase_anon_key: null };

  try {
    await supabase.auth.updateUser({
      data: hasCreds
        ? { supabase_url: cleanUrl, supabase_anon_key: cleanKey }
        : { supabase_url: "", supabase_anon_key: "" },
    });
  } catch (err) {
    console.warn("Failed to store connection in profile:", err);
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    notify("Could not save connection: user not authenticated.", { variant: "bad", key: "profile-save" });
    return;
  }
  try {
    const timestamp = new Date().toISOString();
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .update({ ...payload, updated_at: timestamp })
      .eq("id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.warn("Failed to update profiles table:", error.message || error);
      notify("Could not save connection to your profile (update blocked).", { variant: "bad", key: "profile-save" });
      return;
    }

    if (!data) {
      const { error: insertError } = await supabase
        .from(PROFILES_TABLE)
        .insert({ id: userId, ...payload, updated_at: timestamp })
        .select("id")
        .maybeSingle();
      if (insertError) {
        console.warn("Failed to insert profile row:", insertError.message || insertError);
        notify("Could not create profile row to save connection.", { variant: "bad", key: "profile-save" });
        return;
      }
    }

    if (hasCreds) {
      const { data: verify, error: verifyError } = await supabase
        .from(PROFILES_TABLE)
        .select("supabase_url, supabase_anon_key")
        .eq("id", userId)
        .maybeSingle();
      if (verifyError) {
        console.warn("Failed to verify profile save:", verifyError.message || verifyError);
      } else if (!verify?.supabase_url || !verify?.supabase_anon_key) {
        notify("Saved locally, but profile row still missing credentials.", { variant: "warn", key: "profile-save" });
      }
    }
  } catch (err) {
    console.warn("Failed to store connection in profiles table:", err);
    notify("Could not save connection to your profile.", { variant: "bad", key: "profile-save" });
  }
}
