import "server-only";
import { requireUser } from "@/lib/auth";
import { withUser, type Db } from "@/lib/db/client";
import { z } from "zod";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Wraps a mutation: resolves the user, opens an RLS-scoped transaction, and
 * turns a Zod failure into field errors the form can render. Errors say what
 * happened, in the interface's voice — no apologies, no stack traces.
 */
export async function action<S extends z.ZodTypeAny, T>(
  schema: S,
  input: unknown,
  run: (db: Db, values: z.infer<S>, userId: string) => Promise<T>,
): Promise<ActionResult<T>> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    const first = parsed.error.issues[0]?.message;
    return { ok: false, error: first ?? "That input isn't valid.", fieldErrors };
  }
  try {
    const data = await withUser(user.id, (db) => run(db, parsed.data, user.id));
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

export async function simpleAction<T>(run: (db: Db, userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  try {
    return { ok: true, data: await withUser(user.id, (db) => run(db, user.id)) };
  } catch (err) {
    return { ok: false, error: describe(err) };
  }
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/duplicate key/i.test(message)) return "That already exists.";
  if (/violates foreign key/i.test(message)) return "Something it points at is missing — reload and try again.";
  if (/violates check constraint/i.test(message)) return "One of those values is out of range.";
  if (/row-level security/i.test(message)) return "That record belongs to another account.";
  if (/DATABASE_URL/.test(message)) return "No database is configured. Set DATABASE_URL and run npm run db:push.";
  return message.slice(0, 300);
}

/** Strips undefined so a partial patch never nulls a column it didn't mention. */
export function defined<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
