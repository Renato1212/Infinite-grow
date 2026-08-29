"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, defined, simpleAction } from "./helpers";
import * as S from "@/lib/schemas";
import { toInstant } from "@/lib/time";
import {
  media, tradeDebriefs, tradeEdgeAssessments, tradeExecutions, tradeMistakeTags,
  tradeTags, trades,
} from "@/lib/db/schema";

const touch = (date?: string, tradeId?: string) => {
  if (date) { revalidatePath(`/day/${date}`); revalidatePath(`/day/${date}/brief`); }
  if (tradeId) revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trades");
};

/**
 * Quick entry. Creates the trade and its two implied fills; the database
 * recomputes every money column from those fills. Tags, domains and the debrief
 * come later, from the debrief queue.
 */
export async function createQuickTrade(dayId: string, date: string, input: unknown) {
  const res = await action(S.quickTradeInput, input, async (db, v, userId) => {
    const entryAt = toInstant(date, v.entryTime);
    const exitAt = v.exitTime ? toInstant(date, v.exitTime) : null;

    const rows = await db.insert(trades).values({
      userId, tradingDayId: dayId, instrumentId: v.instrumentId,
      sessionId: v.sessionId ?? null,
      hypothesisId: v.hypothesisId ?? null, opportunityId: v.opportunityId ?? null,
      direction: v.direction, entryAt, exitAt,
      planned: v.planned,
      initialStop: v.initialStop === null ? null : String(v.initialStop),
      initialTarget: v.initialTarget === null ? null : String(v.initialTarget),
      notes: v.notes ?? null,
      maxSize: String(v.size!),
    }).returning();

    const trade = rows[0];
    const buying = v.direction === "long";
    const commissionPerSide = (v.commissions ?? 0) / (exitAt ? 2 : 1);

    const fills: (typeof tradeExecutions.$inferInsert)[] = [{
      userId, tradeId: trade.id, side: buying ? "buy" : "sell",
      price: String(v.entryPrice!), quantity: String(v.size!),
      executedAt: entryAt, isEntry: true, commission: String(commissionPerSide),
    }];
    if (exitAt && v.exitPrice !== null) {
      fills.push({
        userId, tradeId: trade.id, side: buying ? "sell" : "buy",
        price: String(v.exitPrice), quantity: String(v.size!),
        executedAt: exitAt, isEntry: false, commission: String(commissionPerSide),
      });
    }
    await db.insert(tradeExecutions).values(fills);
    return trade.id;
  });
  touch(date);
  return res;
}

export async function updateTrade(tradeId: string, date: string, input: unknown) {
  const res = await action(S.tradePatch, input, async (db, v) => {
    await db.update(trades).set(defined({
      ...v,
      maeTicks: v.maeTicks ?? undefined,
      mfeTicks: v.mfeTicks ?? undefined,
      conviction: v.conviction ?? undefined,
      initialStop: v.initialStop === undefined ? undefined
        : v.initialStop === null ? null : String(v.initialStop),
      initialTarget: v.initialTarget === undefined ? undefined
        : v.initialTarget === null ? null : String(v.initialTarget),
    })).where(eq(trades.id, tradeId));
    // R multiple depends on the initial stop, so re-derive after a stop edit.
    await db.execute(sql`select public.recompute_trade(${tradeId}::uuid)`);
  });
  touch(date, tradeId);
  return res;
}

export async function deleteTrade(tradeId: string, date: string) {
  const res = await simpleAction((db) => db.delete(trades).where(eq(trades.id, tradeId)));
  touch(date);
  return res;
}

export async function addExecution(tradeId: string, date: string, input: unknown) {
  const res = await action(S.executionInput, input, async (db, v, userId) => {
    await db.insert(tradeExecutions).values({
      userId, tradeId, side: v.side, price: String(v.price!),
      quantity: String(v.quantity!), executedAt: toInstant(date, v.time),
      isEntry: v.isEntry, commission: String(v.commission ?? 0),
    });
  });
  touch(date, tradeId);
  return res;
}

export async function deleteExecution(executionId: string, date: string, tradeId: string) {
  const res = await simpleAction((db) =>
    db.delete(tradeExecutions).where(eq(tradeExecutions.id, executionId)),
  );
  touch(date, tradeId);
  return res;
}

export async function setTradeTags(tradeId: string, date: string, tagIds: string[]) {
  const res = await action(
    z.object({ tagIds: z.array(S.uuid).max(40) }), { tagIds },
    async (db, v, userId) => {
      await db.delete(tradeTags).where(eq(tradeTags.tradeId, tradeId));
      if (v.tagIds.length) {
        await db.insert(tradeTags).values(v.tagIds.map((tagId) => ({ userId, tradeId, tagId })));
      }
    },
  );
  touch(date, tradeId);
  return res;
}

/* ── the five-domain grid ──────────────────────────────────────────────── */

export async function setEdgeAssessment(tradeId: string, date: string, input: unknown) {
  const res = await action(S.edgeAssessmentInput, input, async (db, v, userId) => {
    await db.insert(tradeEdgeAssessments).values({
      userId, tradeId, edgeDomainId: v.edgeDomainId, alignment: v.alignment,
      weight: v.weight ?? 0, note: v.note ?? null,
    }).onConflictDoUpdate({
      target: [tradeEdgeAssessments.tradeId, tradeEdgeAssessments.edgeDomainId],
      set: { alignment: v.alignment, weight: v.weight ?? 0, note: v.note ?? null },
    });
  });
  touch(date, tradeId);
  return res;
}

/** Exactly one primary domain per trade — the partial unique index enforces it,
 *  so clear the old one in the same transaction. */
export async function setPrimaryDomain(tradeId: string, date: string, edgeDomainId: string) {
  const res = await action(
    z.object({ edgeDomainId: S.uuid }), { edgeDomainId },
    async (db, v, userId) => {
      await db.update(tradeEdgeAssessments).set({ wasPrimary: false })
        .where(eq(tradeEdgeAssessments.tradeId, tradeId));
      await db.insert(tradeEdgeAssessments)
        .values({ userId, tradeId, edgeDomainId: v.edgeDomainId, wasPrimary: true, weight: 3 })
        .onConflictDoUpdate({
          target: [tradeEdgeAssessments.tradeId, tradeEdgeAssessments.edgeDomainId],
          set: { wasPrimary: true },
        });
    },
  );
  touch(date, tradeId);
  return res;
}

export async function upsertTradeDebrief(tradeId: string, date: string, input: unknown) {
  const res = await action(S.tradeDebriefPatch, input, async (db, v, userId) => {
    await db.insert(tradeDebriefs).values({ userId, tradeId, ...defined(v) })
      .onConflictDoUpdate({ target: tradeDebriefs.tradeId, set: defined(v) });
  });
  touch(date, tradeId);
  return res;
}

export async function setMistakeTags(tradeId: string, date: string, tagIds: string[]) {
  const res = await action(
    z.object({ tagIds: z.array(S.uuid).max(20) }), { tagIds },
    async (db, v, userId) => {
      const existing = await db.select({ id: tradeDebriefs.id }).from(tradeDebriefs)
        .where(eq(tradeDebriefs.tradeId, tradeId)).limit(1);
      let debriefId = existing[0]?.id;
      if (!debriefId) {
        const created = await db.insert(tradeDebriefs).values({ userId, tradeId }).returning();
        debriefId = created[0].id;
      }
      await db.delete(tradeMistakeTags).where(eq(tradeMistakeTags.tradeDebriefId, debriefId));
      if (v.tagIds.length) {
        await db.insert(tradeMistakeTags)
          .values(v.tagIds.map((tagId) => ({ userId, tradeDebriefId: debriefId!, tagId })));
      }
    },
  );
  touch(date, tradeId);
  return res;
}

/* ── media ─────────────────────────────────────────────────────────────── */

export async function attachMedia(input: unknown) {
  const schema = z.object({
    ownerType: z.enum(["trade", "instrument_prep", "day", "trade_debrief"]),
    ownerId: S.uuid,
    kind: z.enum(["screen_recording", "chart_screenshot", "news_terminal", "ladder_capture", "other"]),
    storagePath: z.string().min(1).max(600),
    mime: z.string().max(120).nullish(),
    sizeBytes: S.numericish,
    durationSeconds: S.numericish,
    caption: z.string().max(300).nullish(),
  });
  const res = await action(schema, input, async (db, v, userId) => {
    const rows = await db.insert(media).values({
      userId, ownerType: v.ownerType, ownerId: v.ownerId, kind: v.kind,
      storagePath: v.storagePath, mime: v.mime ?? null,
      sizeBytes: v.sizeBytes ?? null,
      durationSeconds: v.durationSeconds === null ? null : String(v.durationSeconds),
      caption: v.caption ?? null,
    }).returning();
    return rows[0].id;
  });
  revalidatePath("/trades");
  return res;
}

export async function detachMedia(mediaId: string) {
  const res = await simpleAction((db) => db.delete(media).where(eq(media.id, mediaId)));
  revalidatePath("/trades");
  return res;
}

/* ── CSV import ────────────────────────────────────────────────────────── */

/**
 * Fills, grouped into trades by symbol and by the position going flat. Written
 * against a neutral row shape so a Rithmic or broker-specific mapping is a new
 * parser in lib/import/, not a rewrite of this.
 */
export async function importExecutions(dayId: string, date: string, rows: unknown) {
  const res = await action(z.object({ rows: z.array(S.importRow).max(2000) }), { rows },
    async (db, v, userId) => {
      const instruments = await db.execute<{ id: string; symbol: string }>(
        sql`select id, symbol from instruments where user_id is null or user_id = ${userId}`,
      );
      const bySymbol = new Map(
        (instruments as unknown as { id: string; symbol: string }[]).map((i) => [i.symbol.toUpperCase(), i.id]),
      );

      const sorted = [...v.rows].sort(
        (a, b) => new Date(a.executedAt).getTime() - new Date(b.executedAt).getTime(),
      );

      let created = 0;
      let skipped = 0;
      const open = new Map<string, { tradeId: string; position: number }>();

      for (const row of sorted) {
        const instrumentId = bySymbol.get(row.symbol.toUpperCase());
        if (!instrumentId) { skipped++; continue; }

        const signed = (row.side === "buy" ? 1 : -1) * row.quantity!;
        let current = open.get(row.symbol.toUpperCase());

        if (!current) {
          const inserted = await db.insert(trades).values({
            userId, tradingDayId: dayId, instrumentId,
            direction: signed > 0 ? "long" : "short",
            entryAt: new Date(row.executedAt).toISOString(),
            planned: false,
          }).returning();
          current = { tradeId: inserted[0].id, position: 0 };
          open.set(row.symbol.toUpperCase(), current);
          created++;
        }

        const isEntry = current.position === 0 || Math.sign(signed) === Math.sign(current.position);
        await db.insert(tradeExecutions).values({
          userId, tradeId: current.tradeId, side: row.side,
          price: String(row.price!), quantity: String(row.quantity!),
          executedAt: new Date(row.executedAt).toISOString(),
          isEntry, externalId: row.externalId ?? null,
        }).onConflictDoNothing();

        current.position += signed;
        if (current.position === 0) open.delete(row.symbol.toUpperCase()); // flat: trade closed
      }
      return { created, skipped };
    });
  touch(date);
  return res;
}
