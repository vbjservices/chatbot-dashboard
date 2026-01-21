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
 * - Badge rechts (conversation-level)
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
      (c.messages?.find(m => m.role === "user")?.content) ||
      c.user_message ||
      "(geen vraag)";

    const when = fmtDateTime(c.updated_at || c.created_at);
    const site = c.workspace_id || c.site || c.channel || "—";
    const typeTopic = formatTypeTopic(c);

    const qDiv = document.createElement("div");
    qDiv.className = "list-q";
    qDiv.textContent = truncate(question, 110);

    const top = document.createElement("div");
    top.className = "list-top";
    top.innerHTML = `
      <span>${escapeHTML(`${when} • ${site} • ${typeTopic}`)}</span>
      <span class="badge ${badgeClassConversation(c)}">${escapeHTML(badgeTextConversation(c))}</span>
    `;

    item.appendChild(qDiv);
    item.appendChild(top);

    item.addEventListener("click", () => onSelect?.(id));
    root.appendChild(item);
  }
}

/**
 * Conversation detail:
 * - Header met total cost bovenaan (niet onderaan scrollen)
 * - Per message bubble een status-chip (Success / Failed / Support)
 */
export function renderConversationDetail(convo) {
  const root = document.getElementById("convoDetail");
  if (!root) return;

  if (!convo) {
    root.innerHTML = `<div class="empty">Selecteer een gesprek links.</div>`;
    return;
  }

  const id = stableConvoId(convo) || "—";

  // cost/tokens bovenaan (en niet alleen onderaan)
  const tokens = fmtNum(convo.metrics?.tokens);
  const cost = fmtMoney(convo.metrics?.total_cost);

  // messages: verwacht newest->oldest (jij sorteert dat nu in normalize)
  const msgs = Array.isArray(convo.messages) ? convo.messages : [];

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
        ${badge(convo.outcome?.escalated ? "Support" : "—", convo.outcome?.escalated ? "warn" : "muted")}
        ${badge(convo.outcome?.lead ? "Lead" : "—", convo.outcome?.lead ? "ok" : "muted")}
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
 * rows kan turns OF convos zijn; wij verwachten turns (zoals jouw app.js nu doet)
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
    const q = r.user_message || r.messages?.find(m => m.role === "user")?.content || "";
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
    const q = r.user_message || r.messages?.find(m => m.role === "user")?.content || "";
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
  const role = m?.role || "unknown";
  const at = m?.at ? fmtDateTime(m.at) : "—";
  const content = m?.content || "";

  // status per antwoord: alleen meaningful op assistant/system (maar we tonen ook op user voor consistentie)
  const st = inferMessageStatus(m);

  const cls =
    role === "user"
      ? "msg user"
      : role === "assistant"
      ? "msg bot"
      : "msg system";

  // status chip style (badge ok/warn/bad/muted)
  const chip = st?.text
    ? `<span class="badge ${st.kind}">${escapeHTML(st.text)}</span>`
    : `<span class="badge muted">—</span>`;

  return `
    <div class="${cls}">
      <div class="meta">
        <span>${escapeHTML(role)} • ${escapeHTML(at)}</span>
        ${chip}
      </div>
      <div class="content">${escapeHTML(content)}</div>
    </div>
  `;
}

/**
 * Probeert status op message-level te pakken:
 * 1) m.escalated/m.success/m.failed/m.reason als je ze meegeeft (beste)
 * 2) anders heuristiek op content
 */
function inferMessageStatus(m) {
  const role = String(m?.role || "").toLowerCase();
  const text = String(m?.content || "");
  const t = text.toLowerCase();

  // Als jij straks turn-metadata aan assistant messages hangt:
  // { success, escalated, reason } → dan pakt dit dat direct.
  const escalated = m?.escalated === true;
  const success = m?.success === true;
  const failed = m?.failed === true;

  if (escalated) return { kind: "warn", text: "Support" };
  if (success) return { kind: "ok", text: "Success" };
  if (failed) return { kind: "bad", text: "Failed" };

  // Heuristiek (failsafe)
  if (role === "assistant" || role === "system") {
    if (
      t.includes("info@") ||
      t.includes("klantenservice") ||
      t.includes("customer service") ||
      t.includes("verkoop") ||
      /\+?\d[\d\s()-]{6,}/.test(t)
    ) return { kind: "warn", text: "Support" };

    const isFallback =
      t.includes("ik weet het niet") ||
      t.includes("dat kan ik niet") ||
      t.includes("niet genoeg informatie") ||
      t.includes("ik begrijp je vraag niet");

    if (isFallback) return { kind: "bad", text: "Failed" };

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

    if (hasLink || hasNext) return { kind: "ok", text: "Success" };

    // unknown: niet liegen
    return { kind: "muted", text: "Unknown" };
  }

  // user message: geen success/fail betekenis
  return { kind: "muted", text: "User" };
}

/* =========================
   Conversation-level badges
   ========================= */

function badgeTextConversation(c) {
  const o = c?.outcome || {};
  if (o.escalated) return "Support";
  if (o.success) return "Success";
  if (o.reason) return "Failed";
  return "—";
}

function badgeClassConversation(c) {
  const o = c?.outcome || {};
  if (o.escalated) return "warn";
  if (o.success) return "ok";
  if (o.reason) return "bad";
  return "muted";
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