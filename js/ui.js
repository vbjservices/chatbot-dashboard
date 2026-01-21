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
 * Conversation list (links)
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
      (c.messages?.find((m) => m.role === "user")?.content) ||
      "(geen vraag)";

    const when = fmtDateTime(c.updated_at || c.created_at);
    const site = c.workspace_id || c.channel || "—";
    const typeTopic = formatTypeTopic(c);

    const qDiv = document.createElement("div");
    qDiv.className = "list-q";
    qDiv.textContent = truncate(question, 110);

    const top = document.createElement("div");
    top.className = "list-top";
    top.innerHTML = `
      <span>${escapeHTML(`${when} • ${site} • ${typeTopic}`)}</span>
      ${badgeHTMLFromOutcome(c)}
    `;

    item.appendChild(qDiv);
    item.appendChild(top);

    item.addEventListener("click", () => onSelect?.(id));
    root.appendChild(item);
  }
}

/**
 * Conversation detail (rechts)
 * 🔥 FIX: messages DESC (nieuw->oud)
 * 🔥 FIX: cost/tokens bovenaan in header
 */
export function renderConversationDetail(convo) {
  const root = document.getElementById("convoDetail");
  if (!root) return;

  if (!convo) {
    root.innerHTML = `<div class="empty">Selecteer een gesprek links.</div>`;
    return;
  }

  const id = stableConvoId(convo) || "—";
  const updated = fmtDateTime(convo.updated_at || convo.created_at);

  const tokens = Number(convo.metrics?.tokens ?? 0);
  const cost = Number(convo.metrics?.total_cost ?? 0);
  const turns = Number(convo._turns ?? 0);

  // latency: als je sum gebruikt is dit geen p95, maar beter dan niets
  const latencySum = Number(convo.metrics?.latency_ms ?? 0);
  const latencyAvg = turns ? Math.round(latencySum / turns) : 0;

  // 🔥 messages newest-first
  const msgs = [...(convo.messages || [])].sort((a, b) =>
    String(b.at || "").localeCompare(String(a.at || ""))
  );

  root.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title">${escapeHTML(id)}</div>
        <div class="detail-sub">
          ${escapeHTML(convo.workspace_id || convo.channel || "—")} •
          ${escapeHTML(convo.type || "—")} •
          ${escapeHTML(convo.topic || "—")} •
          Updated: ${escapeHTML(updated)}
        </div>
      </div>

      <div class="detail-badges">
        ${badge(convo.outcome?.success ? "Success" : "Not success", convo.outcome?.success ? "ok" : "bad")}
        ${badge(convo.outcome?.escalated ? "Escalated" : "—", convo.outcome?.escalated ? "warn" : "muted")}
        ${badge(convo.outcome?.lead ? "Lead" : "—", convo.outcome?.lead ? "ok" : "muted")}
        ${badge(`Turns: ${fmtNum(turns)}`, "muted")}
        ${badge(`Tokens: ${fmtNum(tokens)}`, "muted")}
        ${badge(`Cost: $${fmtMoney(cost)}`, "muted")}
        ${badge(`Avg latency: ${fmtNum(latencyAvg)}ms`, "muted")}
      </div>
    </div>

    <div class="detail-messages">
      ${msgs.map(renderMsg).join("")}
    </div>
  `;
}

/**
 * TURN-LEVEL tables
 * Datum | Kanaal | Type | Vraag | Reason
 */
export function renderFailedTable(turns) {
  const tbl = document.getElementById("failedTable");
  if (!tbl) return;
  const body = tbl.querySelector("tbody");
  if (!body) return;

  body.innerHTML = "";
  const top = (turns || []).slice(0, 12);

  for (const t of top) {
    const q = t.user_message || "";
    const reason = t.reason || t.outcome?.reason || "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtDateTime(t.created_at || t.updated_at))}</td>
      <td>${escapeHTML(t.channel || t.workspace_id || "—")}</td>
      <td>${escapeHTML(t.type || "—")}</td>
      <td title="${escapeHTML(q)}">${escapeHTML(truncate(q, 80))}</td>
      <td>${escapeHTML(reason)}</td>
    `;
    body.appendChild(tr);
  }

  if (!top.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">Geen failed chats.</td>`;
    body.appendChild(tr);
  }
}

/**
 * Datum | Kanaal | Vraag | Actie | Lead
 */
export function renderEscalationTable(turns) {
  const tbl = document.getElementById("escalationTable");
  if (!tbl) return;
  const body = tbl.querySelector("tbody");
  if (!body) return;

  body.innerHTML = "";
  const top = (turns || []).slice(0, 12);

  for (const t of top) {
    const q = t.user_message || "";
    const action = "Follow-up";
    const lead = (t.lead ?? t.outcome?.lead) ? "Yes" : "No";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtDateTime(t.created_at || t.updated_at))}</td>
      <td>${escapeHTML(t.channel || t.workspace_id || "—")}</td>
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

/* ---------- helpers ---------- */

function stableConvoId(c) {
  return String(c?.conversation_id || c?.event_id || "");
}

function formatTypeTopic(c) {
  const t = c?.type || "—";
  const topic = c?.topic ? ` / ${c.topic}` : "";
  return `${t}${topic}`;
}

function badgeHTMLFromOutcome(c) {
  const o = c?.outcome || {};
  if (o.escalated) return badge("Support", "warn");
  if (o.success) return badge("Success", "ok");
  if (o.reason) return badge("Failed", "bad");
  return badge("—", "muted");
}

function renderMsg(m) {
  const role = m?.role || "unknown";
  const cls =
    role === "user" ? "msg user" :
    role === "assistant" ? "msg bot" :
    "msg system";

  const at = m?.at ? fmtDateTime(m.at) : "—";
  const content = m?.content || "";

  return `
    <div class="${cls}">
      <div class="meta">
        <span>${escapeHTML(role)}</span>
        <span>${escapeHTML(at)}</span>
      </div>
      <div class="content">${escapeHTML(content)}</div>
    </div>
  `;
}

function badge(text, kind) {
  return `<span class="badge ${kind}">${escapeHTML(text)}</span>`;
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function fmtNum(n) {
  const x = Number(n ?? 0);
  return Number.isFinite(x) ? x.toLocaleString() : "0";
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