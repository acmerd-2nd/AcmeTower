import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client for RSC / route handlers / middleware, cookie-based.
// Uses the publishable key + the user's session (via cookies). Data access in this
// app goes through Drizzle (see lib/db), so this client is for AUTH only.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component where cookies are read-only — safe to
            // ignore when middleware keeps the session refreshed.
          }
        },
      },
    },
  );
}
