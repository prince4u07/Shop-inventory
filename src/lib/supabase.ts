import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client for Next.js API routes.
// ALWAYS uses the service-role key (bypasses RLS) — never expose it to the browser.
// Public storefront reads go through API routes, not direct table access.

let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill in Supabase project values."
    );
  }

  if (!cached) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
