import { redirect } from "next/navigation";
import type { User } from "@/lib/db/schema";
import { createClient } from "./server";
import { rpcEnsureProfile } from "@/lib/data/app-rpc";

// The authenticated Supabase user (may be null).
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Ensure a public.users row mirrors auth.users (link by auth_user_id). Idempotent.
// If a matching row exists by email but isn't linked yet (e.g. the seeded owner),
// claim it by setting auth_user_id, avoiding the unique-email conflict.
// Runs over HTTPS RPC (V0.3b) so this per-request path never touches Hyperdrive.
export async function ensureProfile(
  authUserId: string,
  email: string,
  name?: string,
): Promise<User> {
  return rpcEnsureProfile(authUserId, email, name ?? null);
}

export async function getCurrentProfile(): Promise<User | null> {
  const user = await getSessionUser();
  if (!user) return null;
  return ensureProfile(
    user.id,
    user.email ?? "unknown",
    (user.user_metadata?.name as string | undefined) ?? undefined,
  );
}

// Gate for protected server components / actions.
export async function requireProfile(): Promise<User> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}
