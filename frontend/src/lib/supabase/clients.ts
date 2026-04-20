import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`Missing environment variable: ${key}`);
  return v;
}

/**
 * Anon client — used from browser-safe contexts and RLS-scoped reads.
 * Requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.
 */
export function createAnonClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/**
 * Service-role client — server-side only, bypasses RLS.
 * Same pattern as AlphaDesk's worker.js getSupabaseClient().
 */
export function createServiceClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
