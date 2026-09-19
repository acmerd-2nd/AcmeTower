import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// In local `next dev`, pull `wrangler` config (vars + `.dev.vars` bindings) into
// process.env so the same env access works as on Cloudflare. This call is
// UNAWAITED and internally fires `getPlatformProxy()`, which now tries to resolve
// the HYPERDRIVE binding locally and rejects when no local Postgres connection
// string is configured. Under Node 24 that becomes a FATAL unhandled rejection and
// kills `next build`. The dev context is pointless during a production build (the
// real bindings are injected by the worker at runtime), so only run it for dev.
if (process.env.NODE_ENV !== "production") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  // Required by @opennextjs/cloudflare: emits a standalone server bundle.
  output: "standalone",
};

export default nextConfig;
