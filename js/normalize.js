// normalize.js

/**
 * Normaliseer 1 chat_events row naar een "turn"
 * Turn = 1 user vraag + 1 assistant antwoord (row in Supabase)
 */
export function normalizeChatEvent(row) {
  const createdAt =
    row?.created_at || row?.createdAt || row?.updated_at || row?.updatedAt || null;

  const metrics = row?.metrics || {};
  const outcome = row?.outcome || {};

  const user_message = row?.user_message ?? row?.chatInput ?? row?.message ?? "";
  const ai_output = row?.ai_output ?? row?.output ?? row?.reply ?? row?.text ?? "";

  // 1) Pak flags van top-level als ze bestaan
  // 2) anders pak uit outcome
  // 3) anders heuristiek (alleen als failsafe)
  const escalated = pickBool(row?.escalated, outcome?.escalated, inferEscalated(ai_output));
  const lead = pickBool(row?.lead, outcome?.lead, false);

  const products = Array.isArray(outcome?.products) ? outcome.products : [];
  const success = pickBool(
    row?.success,
    outcome?.success,
    inferSuccess({ ai_output, escalated, products })
  );

  const reason = row?.reason ?? outcome?.reason ?? (success ? null : inferReason(ai_output, escalated));

  // type/topic (voor filters & charts)
  const type = row?.type ?? outcome?.type ?? inferType({ user_message, ai_output, products });
  const topic = row?.topic ?? outcome?.topic ?? inferTopic({ products, escalated, user_message, ai_output });

  // latency: verwacht metrics.latency_ms, anders null (niet liegen met 0)
  const latency_ms = numOrNull(metrics?.latency_ms ?? metrics?.latencyMs ?? row?.latency_ms ?? null);

  // tokens/cost: best effort
  const tokens = numOrZero(metrics?.tokens ?? metrics?.total_tokens ?? 0);
  const total_cost = numOrZero(metrics?.total_cost ?? metrics?.totalCost ?? 0);

  return {
    id: row?.id ?? null,
    event_id: row?.event_id ?? null,
    workspace_id: row?.workspace_id ?? row?.workspace ?? "unknown",
    bot_key: row?.bot_key ?? null,

    conversation_id: row?.conversation_id ?? row?.sessionId ?? row?.session_id ?? "unknown",
    created_at: createdAt,
    updated_at: createdAt,

    channel: row?.channel ?? row?.workspace_id ?? "unknown",
    type,
    topic,

    user_message,
    ai_output,

    success,
    escalated,
    lead,
    reason,

    outcome: {
      ...outcome,
      success,
      escalated,
      lead,
      reason,
      products,
    },

    metrics: {
      ...metrics,
      latency_ms,
      tokens,
      total_cost,
    },

    // UI verwacht "messages" (voor tables/detail)
    messages: [
      { role: "user", content: user_message, at: createdAt },
      { role: "assistant", content: ai_output, at: createdAt },
    ],
  };
}

/**
 * Groepeer turns per conversation_id naar conversation objecten
 * zodat de viewer links/rechts werkt.
 *
 * LET OP: success/escalation/etc op conversation-level is OR over turns.
 * KPIs/charts doen we in app.js op TURN-level (dus eerlijk).
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

        channel: t.channel,
        type: "chat",
        topic: "Overig",
        prompt_version: t.bot_key || null,

        messages: [],
        outcome: { success: false, escalated: false, lead: false, reason: null },
        metrics: { tokens: 0, total_cost: 0, latency_ms_p95: null },

        _turns: 0,
      });
    }

    const convo = map.get(cid);

    // time range
    if (!convo.created_at || (t.created_at && t.created_at < convo.created_at)) convo.created_at = t.created_at;
    if (!convo.updated_at || (t.created_at && t.created_at > convo.updated_at)) convo.updated_at = t.created_at;

    // messages
    if (t.user_message) convo.messages.push({ role: "user", content: t.user_message, at: t.created_at });
    if (t.ai_output) convo.messages.push({ role: "assistant", content: t.ai_output, at: t.created_at });

    // aggregaties
    convo._turns += 1;
    convo.outcome.success = convo.outcome.success || !!t.success;
    convo.outcome.escalated = convo.outcome.escalated || !!t.escalated;
    convo.outcome.lead = convo.outcome.lead || !!t.lead;
    convo.outcome.reason = convo.outcome.reason || t.reason || null;

    convo.metrics.tokens += numOrZero(t?.metrics?.tokens ?? 0);
    convo.metrics.total_cost += numOrZero(t?.metrics?.total_cost ?? 0);

    if (convo.topic === "Overig") convo.topic = t.topic || "Overig";
  }

  const conversations = Array.from(map.values());

  // sort msgs
  for (const c of conversations) {
    c.messages.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
  }

  // newest first
  conversations.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));

  return conversations;
}

/* ---------------- internal helpers ---------------- */

function pickBool(...vals) {
  for (const v of vals) {
    if (v === true) return true;
    if (v === false) return false;
  }
  return false;
}

function numOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function inferEscalated(ai_output) {
  const t = String(ai_output || "").toLowerCase();
  return (
    t.includes("info@") ||
    t.includes("klantenservice") ||
    t.includes("customer service") ||
    t.includes("verkoop") ||
    /\+?\d[\d\s()-]{6,}/.test(t) // telefoonnummer-achtig
  );
}

function inferSuccess({ ai_output, escalated, products }) {
  if (escalated) return false;

  const text = String(ai_output || "").toLowerCase();
  const hasLink = /https?:\/\/\S+/i.test(text);
  const isFallback =
    text.includes("ik weet het niet") ||
    text.includes("dat kan ik niet") ||
    text.includes("niet genoeg informatie") ||
    text.includes("ik begrijp je vraag niet");

  // success als: producthits of link of duidelijke vervolgvraag, zolang niet fallback
  const hasProducts = Array.isArray(products) && products.length > 0;
  const hasNextQuestion = text.includes("?") && (
    text.includes("artikel") || text.includes("maat") || text.includes("kleur") || text.includes("formaat") ||
    text.includes("kun je") || text.includes("kunt u") || text.includes("wil je")
  );

  if (isFallback) return false;
  if (hasProducts) return true;
  if (hasLink) return true;
  if (hasNextQuestion) return true;
  return false;
}

function inferReason(ai_output, escalated) {
  if (escalated) return "Escalated to support";
  const t = String(ai_output || "").toLowerCase();
  if (t.includes("ik weet het niet") || t.includes("dat kan ik niet")) return "Fallback response";
  return "No product/link/next-step";
}

function inferType({ user_message, ai_output, products }) {
  if (Array.isArray(products) && products.length > 0) return "product";

  const text = `${user_message || ""}\n${ai_output || ""}`.toLowerCase();
  if (text.includes("retour") || text.includes("verzending") || text.includes("garantie") || text.includes("annule")) return "policy";
  if (text.length < 3) return "unknown";
  return "general";
}

function inferTopic({ products, escalated, user_message, ai_output }) {
  if (Array.isArray(products) && products.length > 0) return "Product";
  if (escalated) return "Support";

  const text = `${user_message || ""}\n${ai_output || ""}`.toLowerCase();
  if (text.includes("retour")) return "Retour";
  if (text.includes("verzend")) return "Verzending";
  if (text.includes("garantie")) return "Garantie";
  return "Overig";
}