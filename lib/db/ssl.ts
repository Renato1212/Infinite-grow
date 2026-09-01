/** Hosts where a plaintext, passwordless connection is normal. */
export function isLocalHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "::1", "[::1]", ""].includes(hostname);
}

/**
 * postgres-js defaults to `ssl: false`, and every hosted Postgres — Supabase
 * included — refuses a plaintext connection. Rather than make every deployment
 * and every script remember `?sslmode=require`, require TLS for any host that
 * is not local.
 *
 * An explicit `sslmode` in the URL always wins, so `?sslmode=disable` still
 * works for a remote database reached over a private network.
 */
export function sslFor(url: string): "require" | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("sslmode")) return undefined;
    return isLocalHost(parsed.hostname) ? undefined : "require";
  } catch {
    // Not a URL we can parse (a socket path, say) — leave the driver's default.
    return undefined;
  }
}
