import { z } from "zod";

/* Shared by every form and every server action. One definition, two consumers. */

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const nullableText = z.string().trim().max(20000).nullish().transform((v) => (v ? v : null));
const nullableShort = z.string().trim().max(400).nullish().transform((v) => (v ? v : null));

/**
 * Numeric fields arrive from inputs as strings. Empty means "not set", not zero.
 *
 * `unknown().optional()` rather than a union including `z.undefined()`: Zod
 * treats a transform over such a union as non-optional, so an absent key — a
 * field the form simply did not render — fails the whole patch.
 */
export const numericish = z
  .unknown()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  });

export const requiredNumeric = numericish.refine((v) => v !== null, "Enter a number");

const intInRange = (min: number, max: number) =>
  numericish.refine((v) => v === null || (Number.isFinite(v) && v >= min && v <= max),
    `Must be between ${min} and ${max}`);

export const dayType = z.enum([
  "trend_up", "trend_down", "double_distribution", "normal",
  "normal_variation", "neutral", "non_trend",
]);
export const openType = z.enum([
  "open_drive", "open_test_drive", "open_rejection_reverse", "open_auction",
]);
export const regime = z.enum(["low", "average", "high", "extreme"]);
export const bias = z.enum(["short_bias", "neutral", "long_bias"]);
export const slope = z.enum(["up", "flat", "down"]);
export const direction = z.enum(["long", "short"]);
export const alignment = z.enum(["supportive", "neutral", "conflicting", "not_applicable"]);
export const hypothesisOutcome = z.enum(["played_out", "partial", "invalidated", "never_triggered"]);
export const levelReaction = z.enum(["respected", "broke", "broke_and_retested", "no_touch"]);
export const ruleStatus = z.enum(["followed", "broken", "not_applicable"]);
export const narrativeSource = z.enum([
  "google_trends", "morning_bid_europe", "morning_bid_us", "news_terminal", "options_data", "other",
]);
export const entryStyle = z.enum(["limit", "market", "stop", "scaled"]);
export const exitReason = z.enum([
  "target", "stop", "trail", "time", "discretionary", "news", "management_error",
]);
export const sizeVsPlan = z.enum(["under", "as_planned", "over"]);
export const tagCategory = z.enum([
  "setup", "location", "context", "execution", "error", "emotion", "custom",
]);
export const dayNoteKind = z.enum([
  "observation", "emotion", "market_event", "rule_reminder", "reground",
]);

export const dayPatch = z.object({
  actualDayType: dayType.nullish(),
  openType: openType.nullish(),
  volumeRegime: z.enum(["low", "average", "high"]).nullish(),
  volatilityRegime: regime.nullish(),
  disciplineScore: intInRange(0, 10),
  executionScore: intInRange(0, 10),
  status: z.enum(["planned", "live", "debriefed"]).optional(),
});

export const narrativePatch = z.object({
  source: narrativeSource,
  rawContent: z.string().max(50000).optional(),
  keyThemes: z.array(z.string().trim().min(1).max(80)).max(24).optional(),
  sentiment: intInRange(-2, 2),
  sourceUrl: nullableShort,
});

export const instrumentPrepPatch = z.object({
  structureNote: nullableText,
  vwapSlope: slope.nullish(),
  chartPattern: z.array(z.string().trim().min(1).max(60)).max(16).optional(),
  priorDayType: dayType.nullish(),
  priorSessionNote: nullableText,
  ladderBehaviour: nullableText,
  expectedRangeTicks: numericish,
  directionalBias: bias.nullish(),
  conviction: intInRange(1, 5),
});

export const levelInput = z.object({
  levelTypeId: uuid,
  price: requiredNumeric,
  secondaryPrice: numericish,
  timeframe: nullableShort,
  strength: intInRange(1, 3),
  note: nullableShort,
  source: z.enum(["chart", "profile", "options", "external"]).default("chart"),
});

export const levelInteractionInput = z.object({
  prepLevelId: uuid,
  reaction: levelReaction,
  reactionTicks: numericish,
  firstTouchAt: z.string().nullish(),
  note: nullableShort,
});

export const environmentPatch = z.object({
  dynamicCalendarNote: nullableText,
  optionsNote: nullableText,
  expectedEnvironment: nullableText,
  flowNote: nullableText,
  flagOpex: z.boolean().optional(),
  flagMonthEnd: z.boolean().optional(),
  flagQuarterEnd: z.boolean().optional(),
  flagRoll: z.boolean().optional(),
  flagAuction: z.boolean().optional(),
  flagHoliday: z.boolean().optional(),
});

export const eventInput = z.object({
  name: z.string().trim().min(1, "Give the release a name").max(160),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  importance: intInRange(1, 3),
  consensus: nullableShort,
  actual: nullableShort,
  prior: nullableShort,
  note: nullableShort,
});

export const hypothesisInput = z.object({
  instrumentId: uuid,
  label: z.string().trim().min(1, "Give the hypothesis a short name").max(120),
  rank: intInRange(1, 20),
  narrative: nullableText,
  triggerConditions: nullableText,
  invalidation: nullableText,
  assignedProbability: intInRange(0, 100),
  expectedMoveTicks: numericish,
  plannedResponse: nullableText,
});

export const hypothesisOutcomePatch = z.object({
  outcome: hypothesisOutcome.nullish(),
  outcomeNote: nullableText,
});

export const opportunityInput = z.object({
  instrumentId: uuid,
  hypothesisId: uuid.nullish(),
  setupName: z.string().trim().min(1, "Name the setup").max(120),
  locationNote: nullableText,
  entryTrigger: nullableText,
  invalidation: nullableText,
  target: nullableText,
  primaryEdgeDomainId: uuid.nullish(),
  potentialTicks: numericish,
  estimatedProbability: intInRange(0, 100),
});

export const sessionPrepPatch = z.object({
  reassessment: nullableText,
  whatChanged: nullableText,
  updatedBias: bias.nullish(),
  energyLevel: intInRange(1, 5),
  mentalStateTags: z.array(z.string().trim().max(40)).max(12).optional(),
});

/** The 10-second quick entry. Everything else is added from the debrief queue. */
export const quickTradeInput = z.object({
  instrumentId: uuid,
  direction,
  size: requiredNumeric.refine((v) => v !== null && v > 0, "Size must be positive"),
  entryPrice: requiredNumeric,
  exitPrice: numericish,
  entryTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM"),
  exitTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullish().or(z.literal("")),
  planned: z.boolean().default(true),
  commissions: numericish,
  initialStop: numericish,
  initialTarget: numericish,
  hypothesisId: uuid.nullish(),
  opportunityId: uuid.nullish(),
  sessionId: uuid.nullish(),
  notes: nullableText,
});

export const tradePatch = z.object({
  hypothesisId: uuid.nullish(),
  opportunityId: uuid.nullish(),
  sessionId: uuid.nullish(),
  planned: z.boolean().optional(),
  entryStyle: entryStyle.nullish(),
  exitReason: exitReason.nullish(),
  maeTicks: numericish,
  mfeTicks: numericish,
  initialStop: numericish,
  initialTarget: numericish,
  conviction: intInRange(1, 5),
  sizeVsPlan: sizeVsPlan.nullish(),
  notes: nullableText,
});

export const executionInput = z.object({
  side: z.enum(["buy", "sell"]),
  price: requiredNumeric,
  quantity: requiredNumeric.refine((v) => v !== null && v > 0, "Quantity must be positive"),
  time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM"),
  isEntry: z.boolean(),
  commission: numericish,
});

export const edgeAssessmentInput = z.object({
  edgeDomainId: uuid,
  alignment,
  weight: intInRange(0, 3),
  note: nullableText,
});

export const tradeDebriefPatch = z.object({
  contextNote: nullableText,
  edgeNote: nullableText,
  processNote: nullableText,
  executionQuality: intInRange(1, 5),
  managementQuality: intInRange(1, 5),
  entryQuality: intInRange(1, 5),
  exitQuality: intInRange(1, 5),
  emotionalStateEntry: z.array(z.string().max(40)).max(10).optional(),
  emotionalStateExit: z.array(z.string().max(40)).max(10).optional(),
  whatISaw: nullableText,
  whatWasActuallyThere: nullableText,
  lesson: nullableText,
  action: nullableText,
  repeatable: z.boolean().nullish(),
});

export const dayDebriefPatch = z.object({
  hypothesisVsReality: nullableText,
  whatTheMarketActuallyDid: nullableText,
  whatIDidWell: nullableText,
  whatIDidPoorly: nullableText,
  biggestMissedOpportunity: nullableText,
  biggestAvoidedMistake: nullableText,
  lessons: nullableText,
  focusRating: intInRange(1, 5),
  physicalState: intInRange(1, 5),
  emotionalControl: intInRange(1, 5),
});

export const tagInput = z.object({
  label: z.string().trim().min(1, "Tags need a label").max(60),
  category: tagCategory,
  color: nullableShort,
});

export const ruleInput = z.object({
  text: z.string().trim().min(1, "Write the rule as you would say it").max(300),
  detail: nullableText,
  sortOrder: numericish,
});

export const reviewInput = z.object({
  type: z.enum(["weekly", "monthly"]),
  periodStart: isoDate,
  periodEnd: isoDate,
  summary: nullableText,
  themes: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  focusNextPeriod: nullableText,
});

/** One row of an imported broker CSV, after lib/import/csv.ts has normalised it. */
export const importRow = z.object({
  externalId: z.string().max(120).nullish(),
  symbol: z.string().min(1).max(20),
  side: z.enum(["buy", "sell"]),
  price: requiredNumeric,
  quantity: requiredNumeric,
  executedAt: z.string().min(1),
});

export type QuickTradeInput = z.infer<typeof quickTradeInput>;
export type LevelInput = z.infer<typeof levelInput>;
export type HypothesisInput = z.infer<typeof hypothesisInput>;
export type OpportunityInput = z.infer<typeof opportunityInput>;
