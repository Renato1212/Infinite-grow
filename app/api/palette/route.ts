import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { withUser } from "@/lib/db/client";
import { savedViews, tradingDays } from "@/lib/db/schema";
import { getInstruments } from "@/lib/queries/reference";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ instruments: [], savedViews: [], recentDays: [] });

  const [instruments, rest] = await Promise.all([
    getInstruments(user.id),
    withUser(user.id, async (db) => ({
      views: await db.select({ id: savedViews.id, name: savedViews.name }).from(savedViews)
        .where(eq(savedViews.kind, "study")).orderBy(savedViews.name),
      days: await db.select({
        date: tradingDays.date, netPnl: tradingDays.netPnl, tradeCount: tradingDays.tradeCount,
      }).from(tradingDays).orderBy(desc(tradingDays.date)).limit(8),
    })),
  ]);

  return NextResponse.json({
    instruments: instruments.map((i) => ({ id: i.id, symbol: i.symbol, name: i.name })),
    savedViews: rest.views,
    recentDays: rest.days,
  });
}
