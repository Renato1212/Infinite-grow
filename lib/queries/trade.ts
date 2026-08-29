import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withUser } from "@/lib/db/client";
import {
  hypotheses, instrumentPrep, instruments, levelTypes, media, opportunities,
  prepLevels, tradeDebriefs, tradeEdgeAssessments, tradeExecutions,
  tradeMistakeTags, tradeTags, trades, tradingDays,
} from "@/lib/db/schema";

export async function getTrade(userId: string, tradeId: string) {
  return withUser(userId, async (db) => {
    const rows = await db.select().from(trades).where(eq(trades.id, tradeId)).limit(1);
    const trade = rows[0];
    if (!trade) return null;

    const [day] = await db.select().from(tradingDays)
      .where(eq(tradingDays.id, trade.tradingDayId)).limit(1);
    const [instrument] = await db.select().from(instruments)
      .where(eq(instruments.id, trade.instrumentId)).limit(1);

    const [executions, assessments, debriefRows, tagLinks, mediaRows, dayHypotheses, dayOpportunities] =
      await Promise.all([
        db.select().from(tradeExecutions)
          .where(eq(tradeExecutions.tradeId, tradeId)).orderBy(asc(tradeExecutions.executedAt)),
        db.select().from(tradeEdgeAssessments).where(eq(tradeEdgeAssessments.tradeId, tradeId)),
        db.select().from(tradeDebriefs).where(eq(tradeDebriefs.tradeId, tradeId)).limit(1),
        db.select({ tagId: tradeTags.tagId }).from(tradeTags).where(eq(tradeTags.tradeId, tradeId)),
        db.select().from(media)
          .where(and(eq(media.ownerType, "trade"), eq(media.ownerId, tradeId))),
        db.select().from(hypotheses)
          .where(eq(hypotheses.tradingDayId, trade.tradingDayId)).orderBy(asc(hypotheses.rank)),
        db.select().from(opportunities).where(eq(opportunities.tradingDayId, trade.tradingDayId)),
      ]);

    const debrief = debriefRows[0] ?? null;
    const mistakeLinks = debrief
      ? await db.select({ tagId: tradeMistakeTags.tagId }).from(tradeMistakeTags)
          .where(eq(tradeMistakeTags.tradeDebriefId, debrief.id))
      : [];

    // The levels marked for this instrument that day: the chart context the
    // trade was actually taken against.
    const [prep] = await db.select().from(instrumentPrep)
      .where(and(
        eq(instrumentPrep.tradingDayId, trade.tradingDayId),
        eq(instrumentPrep.instrumentId, trade.instrumentId),
      )).limit(1);

    const levels = prep
      ? await db.select({
          id: prepLevels.id, price: prepLevels.price, note: prepLevels.note,
          strength: prepLevels.strength, levelTypeId: prepLevels.levelTypeId,
        }).from(prepLevels).where(eq(prepLevels.instrumentPrepId, prep.id))
      : [];

    const types = await db.select().from(levelTypes);

    return {
      trade, day, instrument, executions, assessments, debrief,
      tagIds: tagLinks.map((t) => t.tagId),
      mistakeTagIds: mistakeLinks.map((t) => t.tagId),
      media: mediaRows,
      hypotheses: dayHypotheses,
      opportunities: dayOpportunities,
      levels: levels.map((l) => ({
        ...l,
        typeLabel: types.find((t) => t.id === l.levelTypeId)?.label ?? "Level",
      })),
    };
  });
}

export type TradeDetail = NonNullable<Awaited<ReturnType<typeof getTrade>>>;
