import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import type { Actor } from "@/lib/core/audit";

// Build an audit Actor from the current human web session.
export async function webActor(): Promise<Actor> {
  const p = await getCurrentProfile();
  if (!p) return { actorType: "SYSTEM", source: "WEB", actorLabel: "anonymous" };
  return {
    actorType: "HUMAN",
    actorId: p.id,
    actorLabel: p.displayName ?? p.email,
    source: "WEB",
  };
}

export async function requireWebActor(): Promise<Actor> {
  const p = await getCurrentProfile();
  if (!p) redirect("/login");
  return {
    actorType: "HUMAN",
    actorId: p.id,
    actorLabel: p.displayName ?? p.email,
    source: "WEB",
  };
}
