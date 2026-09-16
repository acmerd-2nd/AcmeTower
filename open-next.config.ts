import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// V0.1 uses defaults: no external image optimization and no R2-backed
// incremental cache yet. Route handlers here are dynamic (no ISR), so the
// default in-memory cache is acceptable. Revisit in a later version if we add
// static/ISR pages.
export default defineCloudflareConfig({});
