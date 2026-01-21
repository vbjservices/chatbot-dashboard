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
 * Conversation list:
 * - Vraag (user) BOVEN
 * - Meta (tijd • site/kanaal • type/topic) ONDER
 * - Badge rechts in de meta-row
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

    // Gebruik button voor toegankelijkheid, maar style komt uit CSS (.list-item)
    const item = document.createElement("button");
    item.type = "button";
    item.className = `list-item${isActive ? " active" : ""}`;

    const question =
      (c.messages?.find(m => m.role === "user")?.content) ||
      c.user_message ||
      "(geen vraag)";

    // Meta: tijd • workspace/site • type/topic (of channel als je dat gebruikt)
    const when = fmtDateTime(c.updated_at || c.created_at);
    const site = c.workspace_id || c.site || c.channel || "—";
    const typeTopic = formatTypeTopic(c);

    // Bouw: vraag eerst, meta onderaan met badge rechts
    const qDiv = document.createElement("div");
    qDiv.className = "list-q";
    qDiv.textContent = truncate(question, 110);

    const top = document.createElement("div");
    top.className = "list-top";
    top.innerHTML = `
      <span>${escapeHTML(`${when} • ${site} • ${typeTopic}`)}</span>
      <span class="badge ${badgeClass(c)}">${escapeHTML(badgeText(c))}</span>
    `;

    item.appendChild(qDiv);
    item.appendChild(top);

    item.addEventListener("click", () => onSelect?.(id));
    root.appendChild(item);
  }
}

export function renderConversationDetail(convo) {
  const root = document.getElementById("convoDetail");
  if (!root) return;

  if (!convo) {
    root.innerHTML = `<div class="empty">Selecteer een gesprek links.</div>`;
    return;
  }

  const id = stableConvoId(convo) || "—";

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
        ${badge(convo.outcome?.success ? "Success" : "Not success", convo.outcome?.success ? "ok" : "bad")}
        ${badge(convo.outcome?.escalated ? "Escalated" : "—", convo.outcome?.escalated ? "warn" : "muted")}
        ${badge(convo.outcome?.lead ? "Lead" : "—", convo.outcome?.lead ? "ok" : "muted")}
      </div>
    </div>

    <div class="detail-messages">
      ${(convo.messages || []).map(renderMsg).join("")}
    </div>

    <div class="detail-foot">
      <div class="detail-metric">Tokens: <strong>${fmtNum(convo.metrics?.tokens)}</strong></div>
      <div class="detail-metric">Cost (USD): <strong>${fmtMoney(convo.metrics?.total_cost)}</strong></div>
    </div>
  `;
}

/**
 * failedTable HTML heeft kolommen:
 * Datum | Kanaal | Type | Vraag | Reason
 */
export function renderFailedTable(rows) {
  const tbl = document.getElementById("failedTable");
  if (!tbl) return;

  const body = tbl.querySelector("tbody");
  if (!body) return;

  body.innerHTML = "";

  const top = (rows || []).slice(0, 12);

  for (const c of top) {
    const q = c.messages?.find(m => m.role === "user")?.content || c.user_message || "";
    const reason = c.reason || c.outcome?.reason || "—";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtDateTime(c.updated_at || c.created_at))}</td>
      <td>${escapeHTML(c.channel || c.workspace_id || "—")}</td>
      <td>${escapeHTML(c.type || "—")}</td>
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

  for (const c of top) {
    const q = c.messages?.find(m => m.role === "user")?.content || c.user_message || "";
    const action = "Follow-up"; // placeholder
    const lead = c.outcome?.lead ? "Yes" : "No";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtDateTime(c.updated_at || c.created_at))}</td>
      <td>${escapeHTML(c.channel || c.workspace_id || "—")}</td>
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

/* ---------- internal helpers ---------- */

function stableConvoId(c) {
  // voorkeur: conversation_id; fallback: event_id
  const v = c?.conversation_id || c?.event_id || "";
  return String(v || "");
}

function formatTypeTopic(c) {
  const t = c?.type || "—";
  const topic = c?.topic ? ` / ${c.topic}` : "";
  return `${t}${topic}`;
}

function badgeText(c) {
  const o = c?.outcome || {};
  if (o.escalated) return "Support";
  if (o.success) return "Success";
  if (o.reason) return "Failed";
  return "—";
}

function badgeClass(c) {
  const o = c?.outcome || {};
  if (o.escalated) return "warn";
  if (o.success) return "ok";
  if (o.reason) return "bad";
  return "";
}

function renderMsg(m) {
  const role = m?.role || "unknown";
  const cls = role === "user" ? "msg user" : role === "assistant" ? "msg bot" : "msg system";
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
    const d = new Date(iso);
    return d.toLocaleString();
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