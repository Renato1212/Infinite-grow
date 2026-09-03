"use server";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { action, simpleAction } from "./helpers";
import { savedViews } from "@/lib/db/schema";
import { runReadOnlyQuery } from "@/lib/study/queries";

export async function runQuery(text: string) {
  const user = await requireUser();
  if (!text.trim()) return { ok: false as const, error: "Write a query first." };
  try {
    const rows = await runReadOnlyQuery(user.id, text);
    return { ok: true as const, data: rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, error: message.slice(0, 400) };
  }
}

/** Saved SQL lives alongside saved study views, distinguished by kind. */
export async function saveQuery(name: string, sql: string) {
  return action(
    z.object({
      name: z.string().trim().min(1, "Name the query").max(80),
      sql: z.string().trim().min(1).max(20000),
    }),
    { name, sql },
    async (db, v, userId) => {
      const rows = await db.insert(savedViews)
        .values({ userId, name: v.name, kind: "sql", query: { sql: v.sql } })
        .onConflictDoUpdate({
          target: [savedViews.userId, savedViews.kind, savedViews.name],
          set: { query: { sql: v.sql } },
        })
        .returning();
      return rows[0].id;
    },
  );
}

export async function listQueries() {
  return simpleAction(async (db) => {
    const rows = await db.select().from(savedViews)
      .where(eq(savedViews.kind, "sql")).orderBy(savedViews.name);
    return rows.map((r) => ({
      id: r.id, name: r.name, sql: String((r.query as { sql?: string }).sql ?? ""),
    }));
  });
}

export async function deleteQuery(id: string) {
  return simpleAction((db) =>
    db.delete(savedViews).where(and(eq(savedViews.id, id), eq(savedViews.kind, "sql"))),
  );
}
