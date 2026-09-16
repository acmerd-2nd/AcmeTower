import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// SERVICE-role client: admin auth ops (create user, bypass triggers) and
// PostgREST admin writes. Server-only. Never import from client code.
export function createAdminClient() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("createAdminClient requires SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
