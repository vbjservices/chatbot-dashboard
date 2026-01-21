// storage.js
import { CACHE_DATA_KEY, CACHE_META_KEY } from "./config.js";

export function readCache() {
  try {
    const rawData = localStorage.getItem(CACHE_DATA_KEY);
    const rawMeta = localStorage.getItem(CACHE_META_KEY);
    if (!rawData) return { data: null, meta: null };

    const data = JSON.parse(rawData);
    const meta = rawMeta ? JSON.parse(rawMeta) : null;
    return { data, meta };
  } catch {
    return { data: null, meta: null };
  }
}

export function writeCache(data, meta = {}) {
  try {
    localStorage.setItem(CACHE_DATA_KEY, JSON.stringify(data));
    localStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
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