// connection.js
import { CONNECTION_STORAGE_KEY } from "./config.js";

let memoryState = {
  url: "",
  anonKey: "",
  remember: false,
};

let loaded = false;
let activeScope = "";
let loadedScope = "";

function normalizeUrl(raw) {
  const t = String(raw || "").trim();
  if (!t) return "";
  return t.endsWith("/") ? t.slice(0, -1) : t;
}

function normalizeScope(scope) {
  return String(scope || "").trim();
}

function storageKey() {
  return activeScope ? `${CONNECTION_STORAGE_KEY}:${activeScope}` : CONNECTION_STORAGE_KEY;
}

function loadFromStorage() {
  if (loaded && loadedScope === activeScope) return;
  loaded = true;
  loadedScope = activeScope;

  memoryState = { url: "", anonKey: "", remember: false };

  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return;
    const parsed = JSON.parse(raw);

    memoryState.url = normalizeUrl(parsed?.url);
    memoryState.anonKey = String(parsed?.anonKey || "").trim();
    memoryState.remember = !!parsed?.remember;
  } catch {
    // ignore storage errors
  }
}

export function setConnectionScope(scope) {
  const nextScope = normalizeScope(scope);
  if (nextScope === activeScope) return;
  activeScope = nextScope;
  loaded = false;
  loadedScope = "";
  memoryState = { url: "", anonKey: "", remember: false };
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
      localStorage.setItem(storageKey(), JSON.stringify(memoryState));
    } else {
      localStorage.removeItem(storageKey());
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

export function clearConnection() {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    // ignore storage errors
  }
  memoryState = { url: "", anonKey: "", remember: false };
  loaded = false;
  loadedScope = "";
  return { ...memoryState };
}
