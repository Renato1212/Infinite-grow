"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { action, defined, simpleAction } from "./helpers";
import * as S from "@/lib/schemas";
import {
  edgeDomains, instruments, levelTypes, prepTemplates, reviews, rules,
  savedViews, tags, userSettings,
} from "@/lib/db/schema";

const touchLibrary = () => revalidatePath("/library");

export async function createTag(input: unknown) {
  const res = await action(S.tagInput, input, async (db, v, userId) => {
    const rows = await db.insert(tags)
      .values({ userId, label: v.label, category: v.category, color: v.color ?? null })
      .onConflictDoNothing()
      .returning();
    return rows[0]?.id ?? null;
  });
  touchLibrary();
  return res;
}

export async function archiveTag(id: string, archived: boolean) {
  const res = await simpleAction((db) => db.update(tags).set({ archived }).where(eq(tags.id, id)));
  touchLibrary();
  return res;
}

export async function createRule(input: unknown) {
  const res = await action(S.ruleInput, input, async (db, v, userId) => {
    await db.insert(rules).values({
      userId, text: v.text, detail: v.detail ?? null, sortOrder: v.sortOrder ?? 100,
    });
  });
  touchLibrary();
  return res;
}

export async function updateRule(id: string, input: unknown) {
  const res = await action(S.ruleInput.partial().extend({ active: z.boolean().optional() }), input,
    async (db, v) => {
      await db.update(rules).set(defined({ ...v, sortOrder: v.sortOrder ?? undefined })).where(eq(rules.id, id));
    });
  touchLibrary();
  return res;
}

export async function deleteRule(id: string) {
  const res = await simpleAction((db) => db.delete(rules).where(eq(rules.id, id)));
  touchLibrary();
  return res;
}

/**
 * A sixth edge domain. Historical assessments keep pointing at the five they
 * always pointed at — nothing is rewritten, which is why this is a table.
 */
export async function createEdgeDomain(input: unknown) {
  const schema = z.object({
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{2,40}$/, "Lower case, underscores, no spaces"),
    label: z.string().trim().min(1).max(60),
    description: z.string().max(600).optional(),
    sortOrder: S.numericish,
  });
  const res = await action(schema, input, async (db, v, userId) => {
    await db.insert(edgeDomains).values({
      userId, key: v.key, label: v.label,
      description: v.description ?? "", sortOrder: v.sortOrder ?? 100,
    });
  });
  touchLibrary();
  return res;
}

export async function createLevelType(input: unknown) {
  const schema = z.object({
    key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{1,40}$/, "Letters, digits and underscores"),
    label: z.string().trim().min(1).max(60),
    grouping: z.string().max(40).default("other"),
    sortOrder: S.numericish,
  });
  const res = await action(schema, input, async (db, v, userId) => {
    await db.insert(levelTypes).values({
      userId, key: v.key, label: v.label, grouping: v.grouping, sortOrder: v.sortOrder ?? 100,
    });
  });
  touchLibrary();
  return res;
}

export async function upsertInstrument(input: unknown) {
  const schema = z.object({
    id: S.uuid.nullish(),
    symbol: z.string().trim().min(1).max(12),
    name: z.string().trim().min(1).max(80),
    exchange: z.string().trim().min(1).max(40),
    productGroup: z.enum(["equity_index", "energy", "metals", "rates", "fx", "crypto"]),
    tickSize: S.requiredNumeric,
    tickValue: S.requiredNumeric,
    pointValue: S.requiredNumeric,
    currency: z.string().length(3).default("USD"),
    rthOpen: z.string().regex(/^\d{2}:\d{2}$/),
    rthClose: z.string().regex(/^\d{2}:\d{2}$/),
    sortOrder: S.numericish,
  });
  const res = await action(schema, input, async (db, v, userId) => {
    const values = {
      userId, symbol: v.symbol.toUpperCase(), name: v.name, exchange: v.exchange,
      productGroup: v.productGroup, tickSize: String(v.tickSize), tickValue: String(v.tickValue),
      pointValue: String(v.pointValue), currency: v.currency.toUpperCase(),
      rthOpen: v.rthOpen, rthClose: v.rthClose, sortOrder: v.sortOrder ?? 100,
    };
    if (v.id) await db.update(instruments).set(values).where(eq(instruments.id, v.id));
    else await db.insert(instruments).values(values);
  });
  touchLibrary();
  return res;
}

export async function updateSettings(input: unknown) {
  const schema = z.object({
    timezone: z.string().max(60).optional(),
    theme: z.enum(["system", "light", "dark"]).optional(),
    minSampleSize: S.numericish,
    defaultInstrumentId: S.uuid.nullish(),
  });
  const res = await action(schema, input, async (db, v, userId) => {
    const patch = defined({ ...v, minSampleSize: v.minSampleSize ?? undefined });
    await db.insert(userSettings).values({ userId, ...patch })
      .onConflictDoUpdate({ target: userSettings.userId, set: patch });
  });
  revalidatePath("/settings");
  return res;
}

export async function saveStudyView(name: string, query: unknown) {
  const res = await action(
    z.object({ name: z.string().trim().min(1, "Name the view").max(80), query: z.record(z.string(), z.unknown()) }),
    { name, query },
    async (db, v, userId) => {
      const rows = await db.insert(savedViews)
        .values({ userId, name: v.name, kind: "study", query: v.query })
        .onConflictDoUpdate({
          target: [savedViews.userId, savedViews.kind, savedViews.name],
          set: { query: v.query },
        })
        .returning();
      return rows[0].id;
    },
  );
  revalidatePath("/study");
  return res;
}

export async function deleteStudyView(id: string) {
  const res = await simpleAction((db) => db.delete(savedViews).where(eq(savedViews.id, id)));
  revalidatePath("/study");
  return res;
}

export async function upsertReview(input: unknown) {
  const res = await action(S.reviewInput, input, async (db, v, userId) => {
    await db.insert(reviews).values({
      userId, type: v.type, periodStart: v.periodStart, periodEnd: v.periodEnd,
      summary: v.summary ?? null, themes: v.themes ?? [],
      focusNextPeriod: v.focusNextPeriod ?? null,
    }).onConflictDoUpdate({
      target: [reviews.userId, reviews.type, reviews.periodStart],
      set: {
        periodEnd: v.periodEnd, summary: v.summary ?? null,
        themes: v.themes ?? [], focusNextPeriod: v.focusNextPeriod ?? null,
      },
    });
  });
  revalidatePath("/reviews");
  return res;
}

export async function saveTemplate(input: unknown) {
  const schema = z.object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["instrument_prep", "hypothesis"]),
    instrumentId: S.uuid.nullish(),
    payload: z.record(z.string(), z.unknown()),
  });
  const res = await action(schema, input, async (db, v, userId) => {
    await db.insert(prepTemplates).values({
      userId, name: v.name, kind: v.kind,
      instrumentId: v.instrumentId ?? null, payload: v.payload,
    }).onConflictDoUpdate({
      target: [prepTemplates.userId, prepTemplates.kind, prepTemplates.name],
      set: { payload: v.payload, instrumentId: v.instrumentId ?? null },
    });
  });
  revalidatePath("/settings");
  return res;
}

export async function deleteTemplate(id: string) {
  const res = await simpleAction((db) => db.delete(prepTemplates).where(eq(prepTemplates.id, id)));
  revalidatePath("/settings");
  return res;
}
