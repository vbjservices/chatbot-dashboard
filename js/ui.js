// ui.js

export function setStatusPill(status, detail = "") {
  const el = document.getElementById("statusPill");
  if (!el) return;

  el.classList.remove("ok", "warn", "bad");

  if (status === "Online") el.classList.add("ok");
  else if (status === "Offline") el.classList.add("bad");
  else el.classList.add("warn");

  el.textContent = detail ? `Status: ${status} (${detail})` : `Status: ${status}`;
}

/* NEW: Chatbot pill */
export function setChatbotPill(status, detail = "") {
  const el = document.getElementById("chatbotPill");
  if (!el) return;

  el.classList.remove("ok", "warn", "bad");

  // We support: Running/Down/Loading/Unknown
  if (status === "Running") el.classList.add("ok");
  else if (status === "Down") el.classList.add("bad");
  else el.classList.add("warn");

  el.textContent = detail ? `Chatbot: ${status} (${detail})` : `Chatbot: ${status}`;
}

export function setEnvLabel(text) {
  const el = document.getElementById("envLabel");
  if (el) el.textContent = text;
}

export function setVersionPill(text) {
  const el = document.getElementById("versionPill");
  if (el) el.textContent = `Version: ${text ?? "—"}`;
}

export function setLastUpdatePill(text) {
  const el = document.getElementById("lastUpdatePill");
  if (el) el.textContent = `Last update: ${text ?? "—"}`;
}

export function setKPI(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "—";
}

/**
 * Conversation list:
 * - Vraag (User) boven
 * - Meta onder
 * - Badges rechts: status(sen) van gesprek (max 3)
 */
export function renderConversationList(conversations, activeId, onSelect) {
  const root = document.getElementById("convoList");
  if (!root) return;

  root.innerHTML = "";

  if (!conversations?.length) {
    root.innerHTML = `<div class="empty">Geen conversaties gevonden.</div>`;
    return;
  }

  for (const c of conversations) {
    const id = stableConvoId(c);
    const isActive = !!activeId && !!id && id === activeId;

    const item = document.createElement("button");
    item.type = "button";
    item.className = `list-item${isActive ? " active" : ""}`;

    const question =
      (c.messages?.find(m => normalizeRole(m.role) === "user")?.content) ||
      c.user_message ||
      "(geen vraag)";

    const when = fmtDateTime(c.updated_at || c.created_at);
    const site = c.workspace_id || c.site || c.channel || "—";
    const typeTopic = formatTypeTopic(c);

    const badges = getConversationBadges(c, 3);

    const qDiv = document.createElement("div");
    qDiv.className = "list-q";
    qDiv.textContent = truncate(question, 110);

    const top = document.createElement("div");
    top.className = "list-top";
    top.innerHTML = `
      <span>${escapeHTML(`${when} • ${site} • ${typeTopic}`)}</span>
      <span style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
        ${badgesToHTML(badges, 3)}
      </span>
    `;

    item.appendChild(qDiv);
    item.appendChild(top);

    item.addEventListener("click", () => onSelect?.(id));
    root.appendChild(item);
  }
}

/**
 * Conversation detail:
 * - tokens/cost bovenaan
 * - per message bubble max 3 status-badges
 * - bubble kleur: alleen failed -> rood, anders groen (default)
 */
export function renderConversationDetail(convo) {
  const root = document.getElementById("convoDetail");
  if (!root) return;

  if (!convo) {
    root.innerHTML = `<div class="empty">Selecteer een gesprek links.</div>`;
    return;
  }

  const id = stableConvoId(convo) || "—";

  const tokens = fmtNum(convo.metrics?.tokens);
  const cost = fmtMoney(convo.metrics?.total_cost);

  // messages: verwacht newest->oldest (jij sorteert dit in normalize)
  const msgs = Array.isArray(convo.messages) ? convo.messages : [];

  const headBadges = getConversationBadges(convo, 3);

  root.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title">${escapeHTML(id)}</div>
        <div class="detail-sub">
          ${escapeHTML(convo.workspace_id || convo.channel || "—")} •
          ${escapeHTML(convo.type || "—")} •
          ${escapeHTML(convo.topic || "—")} •
          Updated: ${escapeHTML(fmtDateTime(convo.updated_at || convo.created_at))}
        </div>
      </div>

      <div class="detail-badges">
        ${badgesToHTML(headBadges, 3)}
      </div>
    </div>

    <div class="detail-metrics-top">
      <div class="detail-metric">Tokens: <strong>${tokens}</strong></div>
      <div class="detail-metric">Cost (USD): <strong>${cost}</strong></div>
    </div>

    <div class="detail-messages">
      ${msgs.map(renderMsgWithStatus).join("")}
    </div>
  `;
}

/**
 * failedTable HTML heeft kolommen:
 * Datum | Kanaal | Type | Vraag | Reason
 *
 * rows verwacht turns (zoals jouw app.js nu doet)
 */
export function renderFailedTable(rows) {
  const tbl = document.getElementById("failedTable");
  if (!tbl) return;

  const body = tbl.querySelector("tbody");
  if (!body) return;

  body.innerHTML = "";

  const top = (rows || []).slice(0, 12);

  for (const r of top) {
    const created = r.updated_at || r.created_at;
    const channel = r.channel || r.workspace_id || "—";
    const type = r.type || "—";
    const q =
      r.user_message ||
      r.messages?.find(m => normalizeRole(m.role) === "user")?.content ||
      "";
    const reason = r.reason || r.outcome?.reason || "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtDateTime(created))}</td>
      <td>${escapeHTML(channel)}</td>
      <td>${escapeHTML(type)}</td>
      <td title="${escapeHTML(q)}">${escapeHTML(truncate(q, 80))}</td>
      <td>${escapeHTML(reason)}</td>
    `;
    body.appendChild(tr);
  }

  if (!top.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">Geen failed conversaties.</td>`;
    body.appendChild(tr);
  }
}

/**
 * escalationTable HTML heeft kolommen:
 * Datum | Kanaal | Vraag | Actie | Lead
 */
export function renderEscalationTable(rows) {
  const tbl = document.getElementById("escalationTable");
  if (!tbl) return;

  const body = tbl.querySelector("tbody");
  if (!body) return;

  body.innerHTML = "";

  const top = (rows || []).slice(0, 12);

  for (const r of top) {
    const created = r.updated_at || r.created_at;
    const channel = r.channel || r.workspace_id || "—";
    const q =
      r.user_message ||
      r.messages?.find(m => normalizeRole(m.role) === "user")?.content ||
      "";
    const action = "Follow-up";
    const lead = (r.lead ?? r.outcome?.lead) ? "Yes" : "No";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtDateTime(created))}</td>
      <td>${escapeHTML(channel)}</td>
      <td title="${escapeHTML(q)}">${escapeHTML(truncate(q, 80))}</td>
      <td>${escapeHTML(action)}</td>
      <td>${escapeHTML(lead)}</td>
    `;
    body.appendChild(tr);
  }

  if (!top.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">Geen escalations.</td>`;
    body.appendChild(tr);
  }
}

/* =========================
   Message rendering w/ status
   ========================= */

function renderMsgWithStatus(m) {
  const roleRaw = m?.role || "unknown";
  const role = normalizeRole(roleRaw); // user/assistant/system
  const roleLabel = prettyRole(roleRaw); // User/Assistant/System
  const at = m?.at ? fmtDateTime(m.at) : "—";
  const content = m?.content || "";

  const badges = getMessageBadges(m, 3);
  const isFailedAssistant = role === "assistant" && badges.some(b => b.text === "Failed");

  const cls =
    role === "user"
      ? "msg user"
      : role === "assistant"
      ? "msg bot"
      : "msg system";

  // Alleen failed => bubble rood (geen extra kleurcodes verder)
  const inlineStyle = isFailedAssistant
    ? ` style="background:linear-gradient(180deg, rgba(239,68,68,0.16), rgba(10,14,28,0.55)); border-color:rgba(239,68,68,0.35);"`
    : "";

  const chip =
    role === "assistant"
      ? badgesToHTML(badges, 3) || `<span class="badge muted">—</span>`
      : `<span class="badge muted"> Question </span>`;

  return `
    <div class="${cls}"${inlineStyle}>
      <div class="meta">
        <span>${escapeHTML(roleLabel)} • ${escapeHTML(at)}</span>
        <span style="display:inline-flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
          ${chip}
        </span>
      </div>
      <div class="content">${escapeHTML(content)}</div>
    </div>
  `;
}

/* =========================
   Status logic (multi-badge, max 3)
   ========================= */

function getConversationBadges(convo, max = 3) {
  // Prefer conversation-level outcome flags (deze kunnen gecombineerd zijn)
  const o = convo?.outcome || {};
  const hasOutcomeFlags =
    o &&
    (o.success === true || o.escalated === true || o.lead === true || o.reason);

  if (hasOutcomeFlags) {
    const failed = o.success === false && !!(o.reason || convo?._turns);
    return buildBadges({
      failed,
      escalated: o.escalated === true,
      lead: o.lead === true,
      success: o.success === true,
    }).slice(0, max) || [{ kind: "muted", text: "Unknown" }];
  }

  // Fallback: kijk naar laatste assistant message
  const msgs = Array.isArray(convo?.messages) ? convo.messages : [];
  const lastAssistant = msgs.find(m => normalizeRole(m?.role) === "assistant");
  if (lastAssistant) {
    const b = getMessageBadges(lastAssistant, max);
    return b.length ? b.slice(0, max) : [{ kind: "muted", text: "Unknown" }];
  }

  return [{ kind: "muted", text: "Unknown" }];
}

function getMessageBadges(m, max = 3) {
  const role = normalizeRole(m?.role);
  if (role !== "assistant" && role !== "system") return [];

  // Hard flags (nieuwste waarheid)
  const escalatedFlag = m?.escalated === true;
  const leadFlag = m?.lead === true;
  const successFlag = m?.success === true;

  // Failed is expliciet (oude data) of success === false
  const failedFlag =
    m?.failed === true ||
    m?.success === false ||
    String(m?.reason || "").toLowerCase().includes("no answer") ||
    String(m?.reason || "").toLowerCase().includes("unanswered");

  // Als er flags aanwezig zijn: geen content-heuristiek nodig
  const hasAnyFlag = escalatedFlag || leadFlag || successFlag || failedFlag;
  if (hasAnyFlag) {
    return buildBadges({
      failed: failedFlag,
      escalated: escalatedFlag,
      lead: leadFlag,
      success: successFlag,
    }).slice(0, max);
  }

  // Fallback heuristiek (oud gedrag behouden)
  const reason = String(m?.reason || "").toLowerCase();
  const text = String(m?.content || "");
  const t = text.toLowerCase();

  const escalated =
    reason.includes("escalat") ||
    reason.includes("support") ||
    t.includes("info@") ||
    t.includes("klantenservice") ||
    t.includes("customer service") ||
    t.includes("verkoop") ||
    /\+?\d[\d\s()-]{6,}/.test(t);

  const fallback =
    reason.includes("fallback") ||
    reason.includes("failed") ||
    reason.includes("no product") ||
    t.includes("ik weet het niet") ||
    t.includes("dat kan ik niet") ||
    t.includes("niet genoeg informatie") ||
    t.includes("ik begrijp je vraag niet");

  const hasLink = /https?:\/\/\S+/i.test(text);
  const hasNext =
    t.includes("?") &&
    (t.includes("artikel") ||
      t.includes("maat") ||
      t.includes("kleur") ||
      t.includes("formaat") ||
      t.includes("kun je") ||
      t.includes("kunt u") ||
      t.includes("wil je"));

  const success = (hasLink || hasNext) && !fallback && !escalated;
  const failed = fallback;

  const badges = buildBadges({ failed, escalated, lead: false, success });
  return badges.length ? badges.slice(0, max) : [{ kind: "muted", text: "Unknown" }];
}

function buildBadges({ failed = false, escalated = false, lead = false, success = false } = {}) {
  // Prioriteit: Failed (rood) > Support (oranje) > Lead (groen) > Success (groen)
  const out = [];
  const seen = new Set();

  const push = (kind, text) => {
    if (seen.has(text)) return;
    seen.add(text);
    out.push({ kind, text });
  };

  if (failed) push("bad", "Failed");
  if (escalated) push("warn", "Support");
  if (lead) push("ok", "Lead");
  if (success) push("ok", "Success");

  return out;
}

function badgesToHTML(badges, max = 3) {
  const arr = Array.isArray(badges) ? badges.slice(0, max) : [];
  if (!arr.length) return "";
  return arr.map(b => badge(b.text, b.kind)).join("");
}

/* =========================
   Helpers
   ========================= */

function stableConvoId(c) {
  const v = c?.conversation_id || c?.event_id || "";
  return String(v || "");
}

function formatTypeTopic(c) {
  const t = c?.type || "—";
  const topic = c?.topic ? ` / ${c.topic}` : "";
  return `${t}${topic}`;
}

function badge(text, kind) {
  return `<span class="badge ${kind}">${escapeHTML(text)}</span>`;
}

function normalizeRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === "user") return "user";
  if (r === "assistant" || r === "bot") return "assistant";
  if (r === "system") return "system";
  return "unknown";
}

function prettyRole(role) {
  const r = normalizeRole(role);
  if (r === "user") return "User";
  if (r === "assistant") return "Assistant";
  if (r === "system") return "System";
  return "Unknown";
}

// Always DD/MM/YYYY HH:MM (nl-NL)
function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    // nl-NL => dag/maand/jaar
    return d.toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function fmtNum(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toLocaleString("nl-NL") : "0";
}

function fmtMoney(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toFixed(6) : "0.000000";
}

function truncate(s, max) {
  const t = String(s ?? "");
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[ch]));
}