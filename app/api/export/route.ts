import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { withUserSql } from "@/lib/db/client";
import { compileFilter, parseFilter } from "@/lib/study/filters";

export const dynamic = "force-dynamic";

/**
 * The whole filtered set, as CSV or JSON, so the data can leave for a notebook
 * or n8n without anyone reverse-engineering the schema. `format=full` returns
 * every grain: trades, levels and days.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const filter = parseFilter(url.searchParams);
  const { where, params } = compileFilter(filter);

  const rows = await withUserSql(user.id, async (sql) => {
    const result = await sql.unsafe(
      `select * from trade_facts where ${where} order by entry_at desc limit 20000`,
      params as never[],
    );
    return result as unknown as Record<string, unknown>[];
  });

  if (format === "csv") {
    const body = toCsv(rows);
    return new NextResponse(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (format === "full") {
    const extra = await withUserSql(user.id, async (sql) => ({
      levels: (await sql`select * from level_facts order by day desc limit 20000`) as unknown as unknown[],
      days: (await sql`select * from day_facts order by day desc limit 5000`) as unknown as unknown[],
    }));
    return NextResponse.json({ trades: rows, ...extra, filter, exportedAt: new Date().toISOString() });
  }

  return NextResponse.json(
    { trades: rows, filter, count: rows.length, exportedAt: new Date().toISOString() },
    {
      headers: {
        "content-disposition": `attachment; filename="trades-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    },
  );
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const s = Array.isArray(value) ? value.join("|") : String(value);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}
