/**
 * Checks a configuration end to end and says exactly what is wrong with it.
 *
 * Runs the same checks the deployment runs on itself (lib/health.ts) against
 * whatever DATABASE_URL and Supabase keys this environment holds, plus one it
 * can only do here: comparing db/migrations on disk against what the database
 * says it has applied.
 *
 * The deployed copy answers the same questions at /api/health, which is the
 * one that matters for Vercel — this only ever sees your own .env.local.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { sslFor } from "../lib/db/ssl";
import { classifyDbError, overall, runHealth, type Check } from "../lib/health";
import { resolveDatabaseUrl } from "../lib/db/url";
import "dotenv/config";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const COLOUR: Record<string, string> = {
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  fail: "\x1b[31m",
};

function line(check: Check): string {
  const tag = `${COLOUR[check.status]}${check.status.padEnd(4)}${RESET}`;
  const out = [`  ${tag}  ${check.name.padEnd(20)} ${check.detail}`];
  if (check.fix) out.push(`        ${DIM}→ ${check.fix}${RESET}`);
  return out.join("\n");
}

/** The host being checked, with any credentials removed. */
function target(): string {
  const resolved = resolveDatabaseUrl();
  if (!resolved) return "no connection string set";
  try {
    const { hostname, port } = new URL(resolved.url);
    return `${hostname}:${port || "5432"} (from ${resolved.source})`;
  } catch {
    return `${resolved.source} is not a valid URL`;
  }
}

/** Migrations on disk that the database has not recorded as applied. */
async function pendingMigrations(): Promise<Check | null> {
  const url = resolveDatabaseUrl()?.url;
  if (!url) return null;

  const files = readdirSync(join(process.cwd(), "db", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const sql = postgres(url, { max: 1, prepare: false, ssl: sslFor(url), onnotice: () => {}, connect_timeout: 10 });
  try {
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
    );
    const pending = files.filter((f) => !applied.has(f));
    return pending.length === 0
      ? { name: "Migrations", status: "ok", detail: `All ${files.length} applied.` }
      : {
          name: "Migrations",
          status: "fail",
          detail: `${pending.length} not applied: ${pending.join(", ")}.`,
          fix: "npm run db:push",
        };
  } catch (err) {
    // An absent schema_migrations means this database has never been migrated,
    // which is a completely different problem from not being able to reach it.
    const never = (err as { code?: string })?.code === "42P01";
    return {
      name: "Migrations",
      status: "fail",
      detail: never
        ? `None of the ${files.length} migrations have been applied to this database.`
        : `Could not read schema_migrations — ${classifyDbError(err)}.`,
      fix: "npm run db:push",
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  console.log(`\n${BOLD}Deliberate practice — configuration check${RESET}`);
  console.log(`${DIM}database: ${target()}${RESET}\n`);

  const { checks } = await runHealth();
  const pending = await pendingMigrations();
  const all = pending ? [...checks, pending] : checks;

  const verified = all.filter((c) => !c.manual);
  const manual = all.filter((c) => c.manual);

  console.log(verified.map(line).join("\n"));

  if (manual.length) {
    console.log(`\n${BOLD}Only you can confirm this${RESET}`);
    console.log(manual.map(line).join("\n"));
  }

  const status = overall(all);
  const fails = verified.filter((c) => c.status === "fail").length;
  const warns = verified.filter((c) => c.status === "warn").length;

  const summary =
    status === "ok"
      ? `${COLOUR.ok}Ready to use.${RESET}`
      : status === "warn"
        ? `${COLOUR.warn}Usable, with ${warns} thing${warns === 1 ? "" : "s"} worth fixing.${RESET}`
        : `${COLOUR.fail}Not usable yet: ${fails} blocking problem${fails === 1 ? "" : "s"}.${RESET}`;

  console.log(`\n${summary}\n`);
  process.exit(status === "fail" ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
