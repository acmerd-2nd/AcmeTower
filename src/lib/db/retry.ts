/**
 * Worker-side DB resilience.
 *
 * Over Hyperdrive→Supabase from a Cloudflare isolate, connection setup can
 * intermittently stall forever (the awaited query never settles), which workerd
 * turns into an HTTP 1101. There's no app-visible error to catch in that case, so
 * we impose our OWN per-attempt deadline: race the query against a timer, abandon
 * a stalled attempt (each attempt opens a fresh connection), and retry. A few fast
 * retries clear the transient stall in the overwhelming majority of requests.
 */
export class DbDeadlineError extends Error {
  constructor(label = "db") {
    super(`${label}: query exceeded its deadline`);
    this.name = "DbDeadlineError";
  }
}

/**
 * Run an async DB operation with a per-attempt deadline and bounded retries.
 * Returns on the first successful attempt; rethrows the last error if all fail.
 */
export async function withDbRetry<T>(
  run: () => Promise<T>,
  opts: { timeoutMs?: number; attempts?: number; label?: string } = {},
): Promise<T> {
  const { timeoutMs = 2500, attempts = 6, label = "db" } = opts;
  let lastErr: unknown;
  for (let a = 0; a < attempts; a++) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new DbDeadlineError(label)), timeoutMs);
        }),
      ]);
    } catch (err) {
      lastErr = err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new DbDeadlineError(label);
}
