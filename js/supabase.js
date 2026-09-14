/**
 * Supabase client for AATIMER (static GitHub Pages).
 *
 * Infrastructure only — no auth UI, sync, or Realtime wiring yet.
 * Other modules should: import { supabase, pingSupabase } from "./supabase.js";
 *
 * SDK: official @supabase/supabase-js via ESM CDN (no Node/bundler).
 * Publishable key is safe in the frontend. Never put service_role / secrets here.
 */

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm";

/** Project URL without /rest/v1 — the SDK adds API paths itself. */
export const SUPABASE_URL = "https://ksjtmitpqgpgdryjmdje.supabase.co";

/** Publishable (anon) key — frontend-safe. */
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ScJ3G0g76WgZ5jBhrfOg2Q_Tfqjs2F-";

/**
 * Shared browser client. Persist session in localStorage under default sb-*-auth-token
 * when Auth is added later; unused for now.
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Safe connectivity check: does not read/write user tables.
 * Uses Auth getSession (returns null session when logged out).
 *
 * @returns {Promise<{ ok: boolean, message: string, error?: string }>}
 */
export async function pingSupabase() {
  try {
    const { error } = await supabase.auth.getSession();
    if (error) {
      return { ok: false, message: "Supabase Auth error", error: error.message };
    }
    return { ok: true, message: "Supabase client reachable" };
  } catch (err) {
    return {
      ok: false,
      message: "Supabase unreachable",
      error: err?.message || String(err),
    };
  }
}

export default supabase;
