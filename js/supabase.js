// supabase.js
import {
  TABLE_NAME,
  REQUEST_TIMEOUT_MS,
  DEFAULT_LIMIT,
} from "./config.js";
import { getConnection } from "./connection.js";

function withTimeout(signalMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), signalMs);
  return { controller, timeout };
}

function getCredentials(overrides) {
  const url = overrides?.url || overrides?.supabase_url;
  const anonKey = overrides?.anonKey || overrides?.supabase_anon_key;
  if (url && anonKey) return { url, anonKey };
  const conn = getConnection();
  const finalUrl = conn?.url;
  const finalKey = conn?.anonKey;
  if (!finalUrl || !finalKey) {
    throw new Error("Missing Supabase credentials");
  }
  return { url: finalUrl, anonKey: finalKey };
}

/**
 * Fetch rows from Supabase REST.
 * We halen "turn rows" op (chat_events), later groeperen we ze per conversation_id.
 */
export async function fetchSupabaseRows({ sinceISO = null, limit = DEFAULT_LIMIT, credentials = null } = {}) {
  const { controller, timeout } = withTimeout(REQUEST_TIMEOUT_MS);

  try {
    const { url: baseUrl, anonKey } = getCredentials(credentials);
    const url = new URL(`${baseUrl}/rest/v1/${TABLE_NAME}`);

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
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
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

export async function fetchChatbotStatus({ botId = "chatbot", credentials = null } = {}) {
  const { controller, timeout } = withTimeout(REQUEST_TIMEOUT_MS);

  try {
    const { url: baseUrl, anonKey } = getCredentials(credentials);
    const url = new URL(`${baseUrl}/rest/v1/chatbot_status`);
    url.searchParams.set("select", "id,is_up,last_ok_at,last_error_at,last_error,updated_at");
    url.searchParams.set("id", `eq.${botId}`);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
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
