// storage.js
import { CACHE_DATA_KEY, CACHE_META_KEY } from "./config.js";

function normalizeScope(scope) {
  return String(scope || "").trim();
}

function scopedKey(base, scope) {
  const s = normalizeScope(scope);
  return s ? `${base}:${s}` : base;
}

export function readCache({ scope } = {}) {
  try {
    const dataKey = scopedKey(CACHE_DATA_KEY, scope);
    const metaKey = scopedKey(CACHE_META_KEY, scope);
    const rawData = localStorage.getItem(dataKey);
    const rawMeta = localStorage.getItem(metaKey);
    if (!rawData) return { data: null, meta: null };

    const data = JSON.parse(rawData);
    const meta = rawMeta ? JSON.parse(rawMeta) : null;
    return { data, meta };
  } catch {
    return { data: null, meta: null };
  }
}

export function writeCache(data, meta = {}, { scope } = {}) {
  try {
    const dataKey = scopedKey(CACHE_DATA_KEY, scope);
    const metaKey = scopedKey(CACHE_META_KEY, scope);
    localStorage.setItem(dataKey, JSON.stringify(data));
    localStorage.setItem(metaKey, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function clearCache({ scope } = {}) {
  try {
    const dataKey = scopedKey(CACHE_DATA_KEY, scope);
    const metaKey = scopedKey(CACHE_META_KEY, scope);
    localStorage.removeItem(dataKey);
    localStorage.removeItem(metaKey);
    return true;
  } catch {
    return false;
  }
}

export function buildCacheMeta(extra = {}) {
  return {
    cachedAt: new Date().toISOString(),
    ...extra,
  };
}