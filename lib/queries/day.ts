import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { withUser, withUserSql } from "@/lib/db/client";
import {
  dayDebriefActions, dayDebriefs, dayEnvironment, dayNotes, hypotheses,
  hypothesisPathLevels, instrumentPrep, levelInteractions, opportunities,
  opportunitySupportingDomains, pnlPoints, prepLevels, prepNarratives, ruleChecks,
  scheduledEvents, sessionPreps, sessions, trades, tradingDays,
} from "@/lib/db/schema";

/** The seven sessions a day is divided into, in Europe/Lisbon wall clock. */
const DEFAULT_SESSIONS: { key: typeof sessions.$inferInsert["key"]; label: string; start: string; end: string }[] = [
  { key: "asia",         label: "Asia",          start: "00:00", end: "07:00" },
  { key: "europe_pre",   label: "Europe pre",    start: "07:00", end: "08:00" },
  { key: "europe_rth",   label: "Europe RTH",    start: "08:00", end: "14:30" },
  { key: "us_pre",       label: "US pre",        start: "13:00", end: "14:30" },
  { key: "us_rth",       label: "US RTH",        start: "14:30", end: "18:00" },
  { key: "us_afternoon", label: "US afternoon",  start: "18:00", end: "20:00" },
  { key: "settlement",   label: "Settlement",    start: "20:00", end: "22:00" },
];

/** Idempotently gets the day, creating it and its sessions on first visit. */
export async function ensureDay(userId: string, date: string) {
  return withUser(userId, async (db) => {
    const existing = await db.select().from(tradingDays)
      .where(and(eq(tradingDays.userId, userId), eq(tradingDays.date, date))).limit(1);
    let day = existing[0];

    if (!day) {
      const inserted = await db.insert(tradingDays)
        .values({ userId, date })
        .onConflictDoNothing()
        .returning();
      day = inserted[0] ?? (await db.select().from(tradingDays)
        .where(and(eq(tradingDays.userId, userId), eq(tradingDays.date, date))).limit(1))[0];
    }

    const existingSessions = await db.select().from(sessions)
      .where(eq(sessions.tradingDayId, day.id));
    if (existingSessions.length === 0) {
      await db.insert(sessions).values(
        DEFAULT_SESSIONS.map((s) => ({
          userId, tradingDayId: day.id, key: s.key, label: s.label,
          startTime: s.start, endTime: s.end,
        })),
      ).onConflictDoNothing();
    }
    return day;
  });
}

export async function getDayBundle(userId: string, date: string) {
  const day = await ensureDay(userId, date);

  return withUser(userId, async (db) => {
    const [
      narratives, preps, environment, events, hyps, opps, daySessions,
      preps2, notes, debrief, actions, checks, dayTrades, points,
    ] = await Promise.all([
      db.select().from(prepNarratives).where(eq(prepNarratives.tradingDayId, day.id)),
      db.select().from(instrumentPrep).where(eq(instrumentPrep.tradingDayId, day.id))
        .orderBy(asc(instrumentPrep.sortOrder)),
      db.select().from(dayEnvironment).where(eq(dayEnvironment.tradingDayId, day.id)).limit(1),
      db.select().from(scheduledEvents).where(eq(scheduledEvents.tradingDayId, day.id))
        .orderBy(asc(scheduledEvents.scheduledAt)),
      db.select().from(hypotheses).where(eq(hypotheses.tradingDayId, day.id))
        .orderBy(asc(hypotheses.rank)),
      db.select().from(opportunities).where(eq(opportunities.tradingDayId, day.id))
        .orderBy(desc(opportunities.asymmetryScore)),
      db.select().from(sessions).where(eq(sessions.tradingDayId, day.id))
        .orderBy(asc(sessions.startTime)),
      db.select().from(sessionPreps).where(sql`${sessionPreps.sessionId} in (select id from sessions where trading_day_id = ${day.id})`),
      db.select().from(dayNotes).where(eq(dayNotes.tradingDayId, day.id))
        .orderBy(asc(dayNotes.notedAt)),
      db.select().from(dayDebriefs).where(eq(dayDebriefs.tradingDayId, day.id)).limit(1),
      db.select().from(dayDebriefActions)
        .where(sql`${dayDebriefActions.dayDebriefId} in (select id from day_debriefs where trading_day_id = ${day.id})`),
      db.select().from(ruleChecks).where(eq(ruleChecks.tradingDayId, day.id)),
      db.select().from(trades).where(eq(trades.tradingDayId, day.id)).orderBy(asc(trades.entryAt)),
      db.select().from(pnlPoints).where(eq(pnlPoints.tradingDayId, day.id))
        .orderBy(asc(pnlPoints.recordedAt)),
    ]);

    const prepIds = preps.map((p) => p.id);
    const levels = prepIds.length
      ? await db.select().from(prepLevels).where(inArray(prepLevels.instrumentPrepId, prepIds))
          .orderBy(asc(prepLevels.sortOrder), desc(prepLevels.price))
      : [];
    const levelIds = levels.map((l) => l.id);
    const interactions = levelIds.length
      ? await db.select().from(levelInteractions).where(inArray(levelInteractions.prepLevelId, levelIds))
      : [];
    const hypIds = hyps.map((h) => h.id);
    const paths = hypIds.length
      ? await db.select().from(hypothesisPathLevels).where(inArray(hypothesisPathLevels.hypothesisId, hypIds))
          .orderBy(asc(hypothesisPathLevels.ordinal))
      : [];
    const oppIds = opps.map((o) => o.id);
    const supporting = oppIds.length
      ? await db.select().from(opportunitySupportingDomains)
          .where(inArray(opportunitySupportingDomains.opportunityId, oppIds))
      : [];

    return {
      day, narratives, preps, levels, interactions, environment: environment[0] ?? null,
      events, hypotheses: hyps, paths, opportunities: opps, supporting,
      sessions: daySessions, sessionPreps: preps2, notes, debrief: debrief[0] ?? null,
      actions, ruleChecks: checks, trades: dayTrades, pnlPoints: points,
    };
  });
}

export type DayBundle = Awaited<ReturnType<typeof getDayBundle>>;

/** Consecutive fully-debriefed days ending yesterday or today. The habit engine. */
export async function getStreak(userId: string, today: string): Promise<number> {
  const rows = await withUserSql(userId, (sql) => sql<{ date: string }[]>`
    select to_char(date, 'YYYY-MM-DD') as date
    from trading_days
    where user_id = ${userId} and status = 'debriefed' and date <= ${today}::date
    order by date desc
    limit 400
  `);
  if (!rows.length) return 0;

  const set = new Set(rows.map((r) => r.date));
  let streak = 0;
  let counting = false;
  const cursor = new Date(`${today}T00:00:00Z`);

  // Weekends do not break a streak — the market is shut. Neither does today
  // still being open: the streak is counted back from the last closed day.
  for (let i = 0; i < 400; i++) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = cursor.getUTCDay();
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (dow === 0 || dow === 6) continue;

    if (set.has(iso)) { streak++; counting = true; continue; }
    if (!counting && iso === today) continue; // today is not debriefed yet
    break;
  }
  return streak;
}

export async function getRecentDays(userId: string, limit = 20) {
  return withUser(userId, (db) =>
    db.select().from(tradingDays).where(eq(tradingDays.userId, userId))
      .orderBy(desc(tradingDays.date)).limit(limit),
  );
}
