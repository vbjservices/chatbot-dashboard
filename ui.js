// ui.js

export function setStatusPill(status, detail = "") {
  const el = document.getElementById("statusPill");
  if (!el) return;

  // classes: "status ok" / "status warn" / "status bad"
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

export function renderConversationList(conversations, activeId, onSelect) {
  const root = document.getElementById("convoList");
  if (!root) return;

  root.innerHTML = "";
  if (!conversations?.length) {
    root.innerHTML = `<div class="empty">Geen conversaties gevonden.</div>`;
    return;
  }

  for (const c of conversations) {
    const item = document.createElement("button");
    item.className = `list-item ${c.conversation_id === activeId ? "active" : ""}`;

    const title = c.conversation_id;
    const subtitle = `${fmtTime(c.updated_at)} • ${c.channel || "—"} • ${c.topic || "—"}`;

    const preview = (c.messages?.find(m => m.role === "user")?.content || "").slice(0, 90);

    item.innerHTML = `
      <div class="li-title">${escapeHTML(title)}</div>
      <div class="li-sub">${escapeHTML(subtitle)}</div>
      <div class="li-preview">${escapeHTML(preview)}</div>
    `;

    item.addEventListener("click", () => onSelect?.(c.conversation_id));
    root.appendChild(item);
  }
}

export function renderConversationDetail(convo) {
  const root = document.getElementById("convoDetail");
  if (!root) return;

  if (!convo) {
    root.innerHTML = `<div class="empty">Selecteer een conversatie.</div>`;
    return;
  }

  root.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="detail-title">${escapeHTML(convo.conversation_id)}</div>
        <div class="detail-sub">
          ${escapeHTML(convo.channel || "—")} • ${escapeHTML(convo.type || "—")} •
          ${escapeHTML(convo.topic || "—")} •
          Updated: ${escapeHTML(fmtTime(convo.updated_at))}
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

export function renderFailedTable(rows) {
  const tbl = document.getElementById("failedTable");
  if (!tbl) return;

  const body = tbl.querySelector("tbody");
  if (!body) return;
  body.innerHTML = "";

  const top = (rows || []).slice(0, 12);
  for (const c of top) {
    const firstUser = c.messages?.find(m => m.role === "user")?.content || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtTime(c.updated_at))}</td>
      <td>${escapeHTML(firstUser.slice(0, 120))}</td>
      <td>${escapeHTML(c.channel || "—")}</td>
      <td>${escapeHTML(c.topic || "—")}</td>
    `;
    body.appendChild(tr);
  }

  if (!top.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">Geen failed conversaties.</td>`;
    body.appendChild(tr);
  }
}

export function renderEscalationTable(rows) {
  const tbl = document.getElementById("escalationTable");
  if (!tbl) return;

  const body = tbl.querySelector("tbody");
  if (!body) return;
  body.innerHTML = "";

  const top = (rows || []).slice(0, 12);
  for (const c of top) {
    const firstUser = c.messages?.find(m => m.role === "user")?.content || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHTML(fmtTime(c.updated_at))}</td>
      <td>${escapeHTML(firstUser.slice(0, 120))}</td>
      <td>${escapeHTML(c.channel || "—")}</td>
      <td>${escapeHTML(c.topic || "—")}</td>
    `;
    body.appendChild(tr);
  }

  if (!top.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="4" class="muted">Geen escalations.</td>`;
    body.appendChild(tr);
  }
}

/* ---------- helpers ---------- */

function renderMsg(m) {
  const cls = m.role === "user" ? "msg user" : "msg assistant";
  return `
    <div class="${cls}">
      <div class="msg-meta">${escapeHTML(m.role)} • ${escapeHTML(fmtTime(m.at))}</div>
      <div class="msg-body">${escapeHTML(m.content || "")}</div>
    </div>
  `;
}

function badge(text, kind) {
  return `<span class="badge ${kind}">${escapeHTML(text)}</span>`;
}

function fmtTime(iso) {
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

function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"]/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  }[ch]));
}