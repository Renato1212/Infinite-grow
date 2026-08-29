import type { DayBundle } from "@/lib/queries/day";
import type { EdgeDomain, Instrument, LevelType, Rule, Tag } from "@/lib/queries/reference";
import type { tradeDebriefs, tradeEdgeAssessments } from "@/lib/db/schema";

export type Assessment = typeof tradeEdgeAssessments.$inferSelect;
export type TradeDebrief = typeof tradeDebriefs.$inferSelect;

export interface CockpitProps {
  date: string;
  bundle: DayBundle;
  instruments: Instrument[];
  domains: EdgeDomain[];
  levelTypes: LevelType[];
  tags: Tag[];
  rules: Rule[];
  settings: { minSampleSize: number; timezone: string };
  streak: number;
  assessments: Assessment[];
  tradeDebriefs: TradeDebrief[];
  tradeTagLinks: { tradeId: string; tagId: string }[];
  mistakeTagLinks: { tradeDebriefId: string; tagId: string }[];
  explainers: Record<string, string | null>;
  openAction: string | null;
  focusPhase: string | null;
}

export type Explainers = Record<string, string | null>;
