import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import { createClient } from "./server";

// The authenticated Supabase user (may be null).
export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

// Ensure a public.users row mirrors auth.users (link by auth_user_id). Idempotent.
export async function ensureProfile(
  authUserId: string,
  email: string,
  name?: string,
): Promise<User> {
  const db = getDb();
  const [existing] = await db.select().from(users).where(eq(users.authUserId, authUserId));
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ authUserId, email, displayName: name ?? null })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db.select().from(users).where(eq(users.authUserId, authUserId));
  return row!;
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
