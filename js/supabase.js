// supabase.js
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  TABLE_NAME,
  REQUEST_TIMEOUT_MS,
  DEFAULT_LIMIT,
} from "./config.js";

function withTimeout(signalMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), signalMs);
  return { controller, timeout };
}

/**
 * Fetch rows from Supabase REST.
 * We halen "turn rows" op (chat_events), later groeperen we ze per conversation_id.
 */
export async function fetchSupabaseRows({ sinceISO = null, limit = DEFAULT_LIMIT } = {}) {
  const { controller, timeout } = withTimeout(REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`);

    // Selecteer alleen kolommen die we nodig hebben (scheelt payload)
    const select =
      "id,workspace_id,bot_key,event_id,conversation_id,created_at,user_message,ai_output,success,escalated,lead,reason,outcome,metrics,latency_ms";
    url.searchParams.set("select", select);

    if (sinceISO) url.searchParams.set("created_at", `gte.${sinceISO}`);
    url.searchParams.set("order", "created_at.desc");
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase error ${res.status}: ${text || res.statusText}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchChatbotStatus({ botId = "chatbot" } = {}) {
  const { controller, timeout } = withTimeout(REQUEST_TIMEOUT_MS);

  try {
    const url = new URL(`${SUPABASE_URL}/rest/v1/chatbot_status`);
    url.searchParams.set("select", "id,is_up,last_ok_at,last_error_at,last_error,updated_at");
    url.searchParams.set("id", `eq.${botId}`);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Supabase chatbot_status error ${res.status}: ${text || res.statusText}`);
    }

    const rows = await res.json();
    return rows?.[0] || null;
  } finally {
    clearTimeout(timeout);
  }
}