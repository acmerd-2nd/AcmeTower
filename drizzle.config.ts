import { defineConfig } from "drizzle-kit";
import { readFileSync } from "node:fs";

// Load DATABASE_URL from .env.local (drizzle-kit does not read .env.local by default).
function loadEnvLocal(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL("./.env.local", import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.trim().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnvLocal(), ...process.env };

// `generate` needs no live URL; `push`/`migrate` read dbCredentials.url at run time.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: env.DATABASE_URL ?? "" },
  verbose: true,
  strict: true,
});
