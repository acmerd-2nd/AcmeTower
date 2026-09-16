/**
 * Bootstrap the first human login via the Supabase Admin API.
 * Requires SUPABASE_SECRET_KEY (service/secret key). Creates a confirmed auth user
 * and links it to public.users as the owner.
 *
 * Usage:  SUPABASE_SECRET_KEY=... npm run auth:create-admin -- <email> <password>
 */
import { readFileSync } from "node:fs";
import { createAdminClient } from "../src/lib/auth/admin";

const envPairs: [string, string][] = readFileSync(".env.local", "utf8")
  .split(/\r?\n/)
  .filter((l) => l && !l.trim().startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]);
for (const [k, v] of envPairs) if (v) process.env[k] ||= v;

const email = process.argv[2] ?? "owner@acmetower.local";
const password = process.argv[3] ?? "ChangeMe-2026!";

async function main() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    throw new Error("SUPABASE_SECRET_KEY is required (set it in .env.local).");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "华子哥" },
  });
  if (error) {
    if (/already/i.test(error.message)) console.log("user already exists:", email);
    else throw error;
  } else {
    console.log("created auth user:", email, data.user?.id);
  }
  console.log("✅ done — you can now sign in at /login");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
