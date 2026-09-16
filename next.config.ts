import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// In local `next dev`, pull `wrangler` config (vars + `.dev.vars` bindings) into
// process.env so the same env access works as on Cloudflare. No-op for the
// OpenNext build/deploy path.
initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  // Required by @opennextjs/cloudflare: emits a standalone server bundle.
  output: "standalone",
};

export default nextConfig;
