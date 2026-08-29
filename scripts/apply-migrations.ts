/**
 * Applies db/migrations/*.sql in filename order, recording what ran in
 * schema_migrations. Migrations are files; nothing is ever applied by hand.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { sslFor } from "../lib/db/ssl";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");

const sql = postgres(url, { max: 1, ssl: sslFor(url), onnotice: () => {} });

async function main() {
  await sql`create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
  const applied = new Set(
    (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
  );

  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`applying ${file} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log("ok");
  }
  console.log("migrations up to date");
  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
