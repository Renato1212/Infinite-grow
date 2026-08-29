import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { withUser } from "@/lib/db/client";
import { edgeDomains, instruments, levelTypes, rules, tags, userSettings } from "@/lib/db/schema";

export async function getInstruments(userId: string) {
  return withUser(userId, (db) =>
    db.select().from(instruments)
      .where(and(eq(instruments.isActive, true), or(isNull(instruments.userId), eq(instruments.userId, userId))))
      .orderBy(asc(instruments.sortOrder), asc(instruments.symbol)),
  );
}

export async function getEdgeDomains(userId: string) {
  return withUser(userId, (db) =>
    db.select().from(edgeDomains)
      .where(and(eq(edgeDomains.archived, false), or(isNull(edgeDomains.userId), eq(edgeDomains.userId, userId))))
      .orderBy(asc(edgeDomains.sortOrder)),
  );
}

export async function getLevelTypes(userId: string) {
  return withUser(userId, (db) =>
    db.select().from(levelTypes)
      .where(and(eq(levelTypes.archived, false), or(isNull(levelTypes.userId), eq(levelTypes.userId, userId))))
      .orderBy(asc(levelTypes.sortOrder)),
  );
}

export async function getTags(userId: string) {
  return withUser(userId, (db) =>
    db.select().from(tags).where(eq(tags.archived, false)).orderBy(asc(tags.category), asc(tags.label)),
  );
}

export async function getRules(userId: string) {
  return withUser(userId, (db) =>
    db.select().from(rules).where(eq(rules.active, true)).orderBy(asc(rules.sortOrder)),
  );
}

export async function getSettings(userId: string) {
  const rows = await withUser(userId, (db) =>
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  );
  if (rows[0]) return rows[0];
  const created = await withUser(userId, (db) =>
    db.insert(userSettings).values({ userId }).onConflictDoNothing().returning(),
  );
  return created[0] ?? {
    userId, timezone: "Europe/Lisbon", theme: "system", minSampleSize: 30,
    defaultInstrumentId: null, explainerSeen: {},
    createdAt: "", updatedAt: "",
  };
}

export type Instrument = Awaited<ReturnType<typeof getInstruments>>[number];
export type EdgeDomain = Awaited<ReturnType<typeof getEdgeDomains>>[number];
export type LevelType = Awaited<ReturnType<typeof getLevelTypes>>[number];
export type Tag = Awaited<ReturnType<typeof getTags>>[number];
export type Rule = Awaited<ReturnType<typeof getRules>>[number];
