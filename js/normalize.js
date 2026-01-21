// normalize.js

/**
 * Normaliseer 1 chat_events row naar een "turn"
 * (Later groeperen we turns per conversation_id)
 */
export function normalizeChatEvent(row) {
  const createdAt = row?.created_at || row?.createdAt || null;

  const metrics = row?.metrics || {};
  const outcome = row?.outcome || {};

  return {
    id: row?.id ?? null,
    event_id: row?.event_id ?? null,
    workspace_id: row?.workspace_id ?? "unknown",
    bot_key: row?.bot_key ?? null,

    conversation_id: row?.conversation_id ?? row?.sessionId ?? "unknown",
    created_at: createdAt,

    user_message: row?.user_message ?? "",
    ai_output: row?.ai_output ?? "",

    success: !!row?.success,
    escalated: !!row?.escalated,
    lead: !!row?.lead,
    reason: row?.reason ?? null,

    outcome,
    metrics,
  };
}

/**
 * Groepeer turns per conversation_id naar conversation objecten
 * zodat de bestaande UI (list/detail) netjes werkt.
 */
export function groupTurnsToConversations(turns) {
  const map = new Map();

  for (const t of turns) {
    const cid = t.conversation_id || "unknown";

    if (!map.has(cid)) {
      map.set(cid, {
        conversation_id: cid,
        created_at: t.created_at,
        updated_at: t.created_at,
        channel: t.workspace_id,          // gebruikt door channel filter
        type: "chat",                    // gebruikt door type filter
        topic: inferTopic(t),            // voor topics chart
        prompt_version: t.bot_key || null,

        // UI verwacht "messages"
        messages: [],
        // outcome/metrics op convo-level (we vullen later)
        outcome: { success: false, escalated: false, lead: false },
        metrics: { tokens: 0, total_cost: 0 },

        _turns: 0,
      });
    }

    const convo = map.get(cid);

    // Update convo time range
    if (!convo.created_at || (t.created_at && t.created_at < convo.created_at)) {
      convo.created_at = t.created_at;
    }
    if (!convo.updated_at || (t.created_at && t.created_at > convo.updated_at)) {
      convo.updated_at = t.created_at;
    }

    // Messages toevoegen
    if (t.user_message) {
      convo.messages.push({
        role: "user",
        content: t.user_message,
        at: t.created_at,
      });
    }
    if (t.ai_output) {
      convo.messages.push({
        role: "assistant",
        content: t.ai_output,
        at: t.created_at,
      });
    }

    // Aggregaties
    convo._turns += 1;
    convo.outcome.success = convo.outcome.success || !!t.success;
    convo.outcome.escalated = convo.outcome.escalated || !!t.escalated;
    convo.outcome.lead = convo.outcome.lead || !!t.lead;

    const tokens = Number(t?.metrics?.tokens ?? 0);
    const cost = Number(t?.metrics?.total_cost ?? 0);
    convo.metrics.tokens += Number.isFinite(tokens) ? tokens : 0;
    convo.metrics.total_cost += Number.isFinite(cost) ? cost : 0;

    // topic: als je later topic expliciet opslaat, kun je hier logica aanpassen
    if (convo.topic === "Overig") {
      convo.topic = inferTopic(t);
    }
  }

  // Sort messages chronologisch binnen convo
  const conversations = Array.from(map.values());
  for (const c of conversations) {
    c.messages.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  }

  // Sort convos newest first
  conversations.sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );

  return conversations;
}

function inferTopic(turn) {
  const products = turn?.outcome?.products || [];
  if (Array.isArray(products) && products.length > 0) return "Product";
  if (turn?.escalated) return "Support";
  return "Overig";
}