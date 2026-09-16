"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser Supabase client (user-scoped auth). Public keys only — safe to ship.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
  );
}
