"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { action, defined, simpleAction } from "./helpers";
import * as S from "@/lib/schemas";
import { z } from "zod";
import { toInstant } from "@/lib/time";
import {
  dayDebriefActions, dayDebriefs, dayEnvironment, dayNotes, hypotheses,
  hypothesisPathLevels, instrumentPrep, levelInteractions, opportunities,
  prepLevels, prepNarratives, prepTemplates, ruleChecks, scheduledEvents,
  sessionPreps, tradingDays, trades,
} from "@/lib/db/schema";

const touch = (date: string) => {
  revalidatePath(`/day/${date}`);
  revalidatePath(`/day/${date}/brief`);
};

/* ── the day itself ────────────────────────────────────────────────────── */

export async function updateDay(dayId: string, date: string, input: unknown) {
  const res = await action(S.dayPatch, input, async (db, v) => {
    await db.update(tradingDays).set(defined(v)).where(eq(tradingDays.id, dayId));
  });
  touch(date);
  return res;
}

/** Phases 1, 2, 4 and 5 complete → the day is closed. */
export async function closeDay(dayId: string, date: string) {
  const res = await simpleAction(async (db) => {
    await db.update(tradingDays).set({ status: "debriefed" }).where(eq(tradingDays.id, dayId));
  });
  touch(date);
  return res;
}

export async function reopenDay(dayId: string, date: string) {
  const res = await simpleAction(async (db) => {
    await db.update(tradingDays).set({ status: "live" }).where(eq(tradingDays.id, dayId));
  });
  touch(date);
  return res;
}

/* ── prepare ───────────────────────────────────────────────────────────── */

export async function upsertNarrative(dayId: string, date: string, input: unknown) {
  const res = await action(S.narrativePatch, input, async (db, v, userId) => {
    await db.insert(prepNarratives)
      .values({
        userId, tradingDayId: dayId, source: v.source,
        rawContent: v.rawContent ?? "", keyThemes: v.keyThemes ?? [],
        sentiment: v.sentiment ?? null, sourceUrl: v.sourceUrl ?? null,
      })
      .onConflictDoUpdate({
        target: [prepNarratives.tradingDayId, prepNarratives.source],
        set: defined({
          rawContent: v.rawContent, keyThemes: v.keyThemes,
          sentiment: v.sentiment, sourceUrl: v.sourceUrl,
        }),
      });
  });
  touch(date);
  return res;
}

export async function addInstrumentPrep(dayId: string, date: string, instrumentId: string) {
  const res = await action(z.object({ instrumentId: S.uuid }), { instrumentId }, async (db, v, userId) => {
    const rows = await db.insert(instrumentPrep)
      .values({ userId, tradingDayId: dayId, instrumentId: v.instrumentId })
      .onConflictDoNothing()
      .returning();
    return rows[0]?.id ?? null;
  });
  touch(date);
  return res;
}

export async function updateInstrumentPrep(prepId: string, date: string, input: unknown) {
  const res = await action(S.instrumentPrepPatch, input, async (db, v) => {
    await db.update(instrumentPrep).set(defined(v)).where(eq(instrumentPrep.id, prepId));
  });
  touch(date);
  return res;
}

export async function deleteInstrumentPrep(prepId: string, date: string) {
  const res = await simpleAction((db) => db.delete(instrumentPrep).where(eq(instrumentPrep.id, prepId)));
  touch(date);
  return res;
}

/** Yesterday's levels, carried forward and editable rather than retyped. */
export async function carryLevelsForward(prepId: string, date: string, instrumentId: string) {
  const res = await simpleAction(async (db, userId) => {
    const copied = await db.execute(sql`
      insert into prep_levels
        (user_id, instrument_prep_id, level_type_id, price, secondary_price, timeframe, strength, note, source, sort_order)
      select ${userId}, ${prepId}, pl.level_type_id, pl.price, pl.secondary_price,
             pl.timeframe, pl.strength, pl.note, pl.source, pl.sort_order
      from prep_levels pl
      join instrument_prep ip on ip.id = pl.instrument_prep_id
      join trading_days d on d.id = ip.trading_day_id
      where ip.instrument_id = ${instrumentId}
        and d.user_id = ${userId}
        and d.date < ${date}::date
        and ip.id = (
          select ip2.id from instrument_prep ip2
          join trading_days d2 on d2.id = ip2.trading_day_id
          where ip2.instrument_id = ${instrumentId} and d2.user_id = ${userId} and d2.date < ${date}::date
          order by d2.date desc limit 1
        )
      returning id
    `);
    return (copied as unknown as { length: number }).length ?? 0;
  });
  touch(date);
  return res;
}

export async function addLevel(prepId: string, date: string, input: unknown) {
  const res = await action(S.levelInput, input, async (db, v, userId) => {
    const rows = await db.insert(prepLevels).values({
      userId, instrumentPrepId: prepId, levelTypeId: v.levelTypeId,
      price: String(v.price), secondaryPrice: v.secondaryPrice === null ? null : String(v.secondaryPrice),
      timeframe: v.timeframe ?? null, strength: v.strength ?? 2,
      note: v.note ?? null, source: v.source,
    }).returning();
    return rows[0]?.id ?? null;
  });
  touch(date);
  return res;
}

export async function updateLevel(levelId: string, date: string, input: unknown) {
  const res = await action(S.levelInput.partial(), input, async (db, v) => {
    await db.update(prepLevels).set(defined({
      levelTypeId: v.levelTypeId,
      price: v.price === null || v.price === undefined ? undefined : String(v.price),
      secondaryPrice: v.secondaryPrice === undefined ? undefined
        : v.secondaryPrice === null ? null : String(v.secondaryPrice),
      timeframe: v.timeframe, strength: v.strength ?? undefined,
      note: v.note, source: v.source,
    })).where(eq(prepLevels.id, levelId));
  });
  touch(date);
  return res;
}

export async function deleteLevel(levelId: string, date: string) {
  const res = await simpleAction((db) => db.delete(prepLevels).where(eq(prepLevels.id, levelId)));
  touch(date);
  return res;
}

/** What price actually did at a marked level. Turns mark-up into a dataset. */
export async function setLevelInteraction(date: string, input: unknown) {
  const res = await action(S.levelInteractionInput, input, async (db, v, userId) => {
    await db.insert(levelInteractions).values({
      userId, prepLevelId: v.prepLevelId, reaction: v.reaction,
      reactionTicks: v.reactionTicks ?? null,
      firstTouchAt: v.firstTouchAt ?? null, note: v.note ?? null,
    }).onConflictDoUpdate({
      target: levelInteractions.prepLevelId,
      set: {
        reaction: v.reaction, reactionTicks: v.reactionTicks ?? null,
        firstTouchAt: v.firstTouchAt ?? null, note: v.note ?? null,
      },
    });
  });
  touch(date);
  return res;
}

export async function upsertEnvironment(dayId: string, date: string, input: unknown) {
  const res = await action(S.environmentPatch, input, async (db, v, userId) => {
    await db.insert(dayEnvironment).values({ userId, tradingDayId: dayId, ...defined(v) })
      .onConflictDoUpdate({ target: dayEnvironment.tradingDayId, set: defined(v) });
  });
  touch(date);
  return res;
}

export async function addEvent(dayId: string, date: string, input: unknown) {
  const res = await action(S.eventInput, input, async (db, v, userId) => {
    await db.insert(scheduledEvents).values({
      userId, tradingDayId: dayId, name: v.name,
      scheduledAt: toInstant(date, v.time),
      importance: v.importance ?? 2,
      consensus: v.consensus ?? null, actual: v.actual ?? null,
      prior: v.prior ?? null, note: v.note ?? null,
    });
  });
  touch(date);
  return res;
}

export async function updateEvent(eventId: string, date: string, input: unknown) {
  const res = await action(S.eventInput.partial(), input, async (db, v) => {
    await db.update(scheduledEvents).set(defined({
      name: v.name,
      scheduledAt: v.time ? toInstant(date, v.time) : undefined,
      importance: v.importance ?? undefined,
      consensus: v.consensus, actual: v.actual, prior: v.prior, note: v.note,
    })).where(eq(scheduledEvents.id, eventId));
  });
  touch(date);
  return res;
}

export async function deleteEvent(eventId: string, date: string) {
  const res = await simpleAction((db) => db.delete(scheduledEvents).where(eq(scheduledEvents.id, eventId)));
  touch(date);
  return res;
}

/* ── plan ──────────────────────────────────────────────────────────────── */

export async function addHypothesis(dayId: string, date: string, input: unknown) {
  const res = await action(S.hypothesisInput, input, async (db, v, userId) => {
    const rows = await db.insert(hypotheses).values({
      userId, tradingDayId: dayId, instrumentId: v.instrumentId, label: v.label,
      rank: v.rank ?? 1, narrative: v.narrative ?? null,
      triggerConditions: v.triggerConditions ?? null, invalidation: v.invalidation ?? null,
      assignedProbability: v.assignedProbability ?? null,
      expectedMoveTicks: v.expectedMoveTicks ?? null,
      plannedResponse: v.plannedResponse ?? null,
    }).returning();
    return rows[0]?.id ?? null;
  });
  touch(date);
  return res;
}

export async function updateHypothesis(id: string, date: string, input: unknown) {
  const res = await action(S.hypothesisInput.partial().merge(S.hypothesisOutcomePatch), input, async (db, v) => {
    await db.update(hypotheses).set(defined({
      ...v,
      rank: v.rank ?? undefined,
      assignedProbability: v.assignedProbability ?? undefined,
      expectedMoveTicks: v.expectedMoveTicks ?? undefined,
      outcomeRecordedAt: v.outcome ? new Date().toISOString() : undefined,
    })).where(eq(hypotheses.id, id));
  });
  touch(date);
  return res;
}

export async function deleteHypothesis(id: string, date: string) {
  const res = await simpleAction((db) => db.delete(hypotheses).where(eq(hypotheses.id, id)));
  touch(date);
  return res;
}

/** A hypothesis is a route through marked levels; this sets the route. */
export async function setHypothesisPath(hypothesisId: string, date: string, levelIds: string[]) {
  const res = await action(
    z.object({ levelIds: z.array(S.uuid).max(24) }), { levelIds },
    async (db, v, userId) => {
      await db.delete(hypothesisPathLevels).where(eq(hypothesisPathLevels.hypothesisId, hypothesisId));
      if (v.levelIds.length) {
        await db.insert(hypothesisPathLevels).values(
          v.levelIds.map((id, i) => ({ userId, hypothesisId, prepLevelId: id, ordinal: i + 1 })),
        );
      }
    },
  );
  touch(date);
  return res;
}

export async function addOpportunity(dayId: string, date: string, input: unknown) {
  const res = await action(S.opportunityInput, input, async (db, v, userId) => {
    await db.insert(opportunities).values({
      userId, tradingDayId: dayId, instrumentId: v.instrumentId,
      hypothesisId: v.hypothesisId ?? null, setupName: v.setupName,
      locationNote: v.locationNote ?? null, entryTrigger: v.entryTrigger ?? null,
      invalidation: v.invalidation ?? null, target: v.target ?? null,
      primaryEdgeDomainId: v.primaryEdgeDomainId ?? null,
      potentialTicks: v.potentialTicks ?? null,
      estimatedProbability: v.estimatedProbability ?? null,
    });
  });
  touch(date);
  return res;
}

export async function updateOpportunity(id: string, date: string, input: unknown) {
  const res = await action(S.opportunityInput.partial(), input, async (db, v) => {
    await db.update(opportunities).set(defined({
      ...v,
      potentialTicks: v.potentialTicks ?? undefined,
      estimatedProbability: v.estimatedProbability ?? undefined,
    })).where(eq(opportunities.id, id));
  });
  touch(date);
  return res;
}

export async function deleteOpportunity(id: string, date: string) {
  const res = await simpleAction((db) => db.delete(opportunities).where(eq(opportunities.id, id)));
  touch(date);
  return res;
}

export async function upsertSessionPrep(sessionId: string, date: string, input: unknown) {
  const res = await action(S.sessionPrepPatch, input, async (db, v, userId) => {
    await db.insert(sessionPreps).values({ userId, sessionId, ...defined(v) })
      .onConflictDoUpdate({ target: sessionPreps.sessionId, set: defined(v) });
  });
  touch(date);
  return res;
}

/* ── during and after the session ──────────────────────────────────────── */

export async function addNote(dayId: string, date: string, body: string, kind: z.infer<typeof S.dayNoteKind> = "observation") {
  const res = await action(
    z.object({ body: z.string().trim().min(1, "Write something first").max(4000), kind: S.dayNoteKind }),
    { body, kind },
    async (db, v, userId) => {
      await db.insert(dayNotes).values({ userId, tradingDayId: dayId, body: v.body, kind: v.kind });
    },
  );
  touch(date);
  return res;
}

/**
 * Reground: a timestamp saying "I went back and reread the plan mid-session".
 * Stored as a day note so it can be correlated with the day's outcome in Study.
 */
export async function reground(dayId: string, date: string) {
  const res = await simpleAction(async (db, userId) => {
    await db.insert(dayNotes).values({
      userId, tradingDayId: dayId, kind: "reground",
      body: "Revisited the plan.",
    });
  });
  touch(date);
  return res;
}

export async function deleteNote(id: string, date: string) {
  const res = await simpleAction((db) => db.delete(dayNotes).where(eq(dayNotes.id, id)));
  touch(date);
  return res;
}

export async function upsertDayDebrief(dayId: string, date: string, input: unknown) {
  const res = await action(S.dayDebriefPatch, input, async (db, v, userId) => {
    await db.insert(dayDebriefs).values({ userId, tradingDayId: dayId, ...defined(v) })
      .onConflictDoUpdate({ target: dayDebriefs.tradingDayId, set: defined(v) });
  });
  touch(date);
  return res;
}

export async function addDebriefAction(dayId: string, date: string, text: string, dueDate: string | null) {
  const res = await action(
    z.object({ text: z.string().trim().min(1, "Write the action").max(300), dueDate: S.isoDate.nullish() }),
    { text, dueDate },
    async (db, v, userId) => {
      const existing = await db.select({ id: dayDebriefs.id }).from(dayDebriefs)
        .where(eq(dayDebriefs.tradingDayId, dayId)).limit(1);
      let debriefId = existing[0]?.id;
      if (!debriefId) {
        const created = await db.insert(dayDebriefs).values({ userId, tradingDayId: dayId }).returning();
        debriefId = created[0].id;
      }
      await db.insert(dayDebriefActions)
        .values({ userId, dayDebriefId: debriefId, actionText: v.text, dueDate: v.dueDate ?? null });
    },
  );
  touch(date);
  return res;
}

export async function toggleDebriefAction(id: string, date: string, done: boolean) {
  const res = await simpleAction((db) =>
    db.update(dayDebriefActions)
      .set({ completedAt: done ? new Date().toISOString() : null })
      .where(eq(dayDebriefActions.id, id)),
  );
  touch(date);
  return res;
}

export async function deleteDebriefAction(id: string, date: string) {
  const res = await simpleAction((db) => db.delete(dayDebriefActions).where(eq(dayDebriefActions.id, id)));
  touch(date);
  return res;
}

/** Process adherence becomes a number via a trigger on this table. */
export async function setRuleCheck(dayId: string, date: string, ruleId: string, status: unknown, note?: string) {
  const res = await action(
    z.object({ ruleId: S.uuid, status: S.ruleStatus, note: z.string().max(400).nullish() }),
    { ruleId, status, note },
    async (db, v, userId) => {
      await db.insert(ruleChecks)
        .values({ userId, tradingDayId: dayId, ruleId: v.ruleId, status: v.status, note: v.note ?? null })
        .onConflictDoUpdate({
          target: [ruleChecks.tradingDayId, ruleChecks.ruleId],
          set: { status: v.status, note: v.note ?? null },
        });
    },
  );
  touch(date);
  return res;
}

export async function setHypothesisOutcome(id: string, date: string, input: unknown) {
  const res = await action(S.hypothesisOutcomePatch, input, async (db, v) => {
    await db.update(hypotheses).set({
      outcome: v.outcome ?? null,
      outcomeNote: v.outcomeNote ?? null,
      outcomeRecordedAt: v.outcome ? new Date().toISOString() : null,
    }).where(eq(hypotheses.id, id));
  });
  touch(date);
  return res;
}

export async function linkTradeToHypothesis(tradeId: string, date: string, hypothesisId: string | null) {
  const res = await simpleAction((db) =>
    db.update(trades).set({ hypothesisId }).where(eq(trades.id, tradeId)),
  );
  touch(date);
  return res;
}

/* ── templates ─────────────────────────────────────────────────────────── */

/**
 * A prep template carries the shape of your routine, not yesterday's numbers:
 * the narrative scaffolding, your defaults, and the level *types* you always
 * mark. Prices are the one thing that must be looked at fresh every morning, so
 * they are deliberately not stored.
 */
export async function saveInstrumentPrepTemplate(prepId: string, name: string) {
  return action(
    z.object({ name: z.string().trim().min(1, "Name the template").max(80) }),
    { name },
    async (db, v, userId) => {
      const [prep] = await db.select().from(instrumentPrep)
        .where(eq(instrumentPrep.id, prepId)).limit(1);
      if (!prep) throw new Error("That preparation is gone — reload and try again.");

      const levels = await db.select({ levelTypeId: prepLevels.levelTypeId })
        .from(prepLevels).where(eq(prepLevels.instrumentPrepId, prepId));

      await db.insert(prepTemplates).values({
        userId, name: v.name, kind: "instrument_prep", instrumentId: prep.instrumentId,
        payload: {
          structureNote: prep.structureNote,
          ladderBehaviour: prep.ladderBehaviour,
          vwapSlope: prep.vwapSlope,
          chartPattern: prep.chartPattern,
          directionalBias: prep.directionalBias,
          conviction: prep.conviction,
          expectedRangeTicks: prep.expectedRangeTicks,
          levelTypeIds: [...new Set(levels.map((l) => l.levelTypeId))],
        },
      }).onConflictDoUpdate({
        target: [prepTemplates.userId, prepTemplates.kind, prepTemplates.name],
        set: { instrumentId: prep.instrumentId, payload: {
          structureNote: prep.structureNote,
          ladderBehaviour: prep.ladderBehaviour,
          vwapSlope: prep.vwapSlope,
          chartPattern: prep.chartPattern,
          directionalBias: prep.directionalBias,
          conviction: prep.conviction,
          expectedRangeTicks: prep.expectedRangeTicks,
          levelTypeIds: [...new Set(levels.map((l) => l.levelTypeId))],
        } },
      });
    },
  );
}

interface PrepTemplatePayload {
  structureNote?: string | null;
  ladderBehaviour?: string | null;
  vwapSlope?: "up" | "flat" | "down" | null;
  chartPattern?: string[];
  directionalBias?: "short_bias" | "neutral" | "long_bias" | null;
  conviction?: number | null;
  expectedRangeTicks?: number | null;
  levelTypeIds?: string[];
}

/**
 * Instantiates a template into a prep: fills the empty fields and adds a
 * price-less placeholder row for each level type the template carries, ready to
 * have this morning's numbers typed in. Fields you have already written are left
 * alone — a template should never overwrite work.
 */
export async function applyInstrumentPrepTemplate(
  prepId: string, date: string, templateId: string,
) {
  const res = await action(
    z.object({ templateId: S.uuid }), { templateId },
    async (db, v, userId) => {
      const [template] = await db.select().from(prepTemplates)
        .where(eq(prepTemplates.id, v.templateId)).limit(1);
      if (!template) throw new Error("That template is gone.");

      const [prep] = await db.select().from(instrumentPrep)
        .where(eq(instrumentPrep.id, prepId)).limit(1);
      if (!prep) throw new Error("That preparation is gone — reload and try again.");

      const payload = template.payload as PrepTemplatePayload;
      const keepExisting = <T,>(current: T, incoming: T | undefined) =>
        current === null || current === undefined ||
        (typeof current === "string" && current.trim() === "")
          ? incoming
          : undefined;

      await db.update(instrumentPrep).set(defined({
        structureNote: keepExisting(prep.structureNote, payload.structureNote),
        ladderBehaviour: keepExisting(prep.ladderBehaviour, payload.ladderBehaviour),
        vwapSlope: keepExisting(prep.vwapSlope, payload.vwapSlope),
        directionalBias: keepExisting(prep.directionalBias, payload.directionalBias),
        conviction: keepExisting(prep.conviction, payload.conviction),
        expectedRangeTicks: keepExisting(prep.expectedRangeTicks, payload.expectedRangeTicks),
        chartPattern: prep.chartPattern.length ? undefined : payload.chartPattern,
      })).where(eq(instrumentPrep.id, prepId));

      const existing = await db.select({ levelTypeId: prepLevels.levelTypeId })
        .from(prepLevels).where(eq(prepLevels.instrumentPrepId, prepId));
      const already = new Set(existing.map((l) => l.levelTypeId));
      const missing = (payload.levelTypeIds ?? []).filter((id) => !already.has(id));

      if (missing.length) {
        await db.insert(prepLevels).values(missing.map((levelTypeId, i) => ({
          userId, instrumentPrepId: prepId, levelTypeId,
          price: "0", note: "from template — set the price",
          sortOrder: 500 + i,
        })));
      }
      return missing.length;
    },
  );
  touch(date);
  return res;
}

export async function saveHypothesisTemplate(hypothesisId: string, name: string) {
  return action(
    z.object({ name: z.string().trim().min(1, "Name the template").max(80) }),
    { name },
    async (db, v, userId) => {
      const [h] = await db.select().from(hypotheses)
        .where(eq(hypotheses.id, hypothesisId)).limit(1);
      if (!h) throw new Error("That hypothesis is gone.");

      const payload = {
        label: h.label, narrative: h.narrative,
        triggerConditions: h.triggerConditions, invalidation: h.invalidation,
        plannedResponse: h.plannedResponse,
        assignedProbability: h.assignedProbability,
        expectedMoveTicks: h.expectedMoveTicks,
      };
      await db.insert(prepTemplates)
        .values({ userId, name: v.name, kind: "hypothesis", instrumentId: h.instrumentId, payload })
        .onConflictDoUpdate({
          target: [prepTemplates.userId, prepTemplates.kind, prepTemplates.name],
          set: { instrumentId: h.instrumentId, payload },
        });
    },
  );
}
