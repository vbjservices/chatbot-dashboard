// config.js
export const SUPABASE_URL = "https://oxfhlfdwahuzzytpcivk.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94ZmhsZmR3YWh1enp5dHBjaXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkwMDIyMTMsImV4cCI6MjA4NDU3ODIxM30.EmA_DRdeiQ3br9dCw39qH0jvv0LpnPWDzqsQP5IYlNE";

// Table waar je n8n in schrijft
export const TABLE_NAME = "chat_events";
export const PROFILES_TABLE = "profiles";

// Cache keys (localStorage)
export const CACHE_DATA_KEY = "dash_chat_events_cache_v1";
export const CACHE_META_KEY = "dash_chat_events_cache_meta_v1";
export const CONNECTION_STORAGE_KEY = "dash_supabase_connection_v1";

// Defaults
export const DEFAULT_LIMIT = 5000; // pas aan als nodig
export const REQUEST_TIMEOUT_MS = 12000;

// UI
export const ENV_LABEL = "VBJ Services";
