// connection.js
import { CONNECTION_STORAGE_KEY } from "./config.js";

const memoryState = {
  url: "",
  anonKey: "",
  remember: false,
};

let loaded = false;

function normalizeUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  return t.endsWith("/") ? t.slice(0, -1) : t;
}

function loadFromStorage() {
  if (loaded) return;
  loaded = true;

  try {
    const raw = localStorage.getItem(CONNECTION_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);

    memoryState.url = normalizeUrl(parsed?.url);
    memoryState.anonKey = String(parsed?.anonKey || "").trim();
    memoryState.remember = !!parsed?.remember;
  } catch {
    // ignore storage errors
  }
}

export function loadConnection() {
  loadFromStorage();
  return { ...memoryState };
}

export function getConnection() {
  loadFromStorage();
  return { ...memoryState };
}

export function setConnection({ url, anonKey, remember = false } = {}) {
  loadFromStorage();

  memoryState.url = normalizeUrl(url);
  memoryState.anonKey = String(anonKey || "").trim();
  memoryState.remember = !!remember;

  try {
    if (memoryState.remember && memoryState.url && memoryState.anonKey) {
      localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(memoryState));
    } else {
      localStorage.removeItem(CONNECTION_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }

  return { ...memoryState };
}

export function hasConnection() {
  const { url, anonKey } = getConnection();
  return Boolean(url && anonKey);
}
