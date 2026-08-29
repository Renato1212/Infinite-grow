import {
  pgTable, pgEnum, uuid, text, integer, smallint, boolean, numeric, timestamp,
  date, time, jsonb, char, bigint, primaryKey, uniqueIndex, index,
} from "drizzle-orm/pg-core";

/* ── enums ─────────────────────────────────────────────────────────────── */
export const dayStatus = pgEnum("day_status", ["planned", "live", "debriefed"]);
export const dayType = pgEnum("day_type", [
  "trend_up", "trend_down", "double_distribution", "normal",
  "normal_variation", "neutral", "non_trend",
]);
export const openType = pgEnum("open_type", [
  "open_drive", "open_test_drive", "open_rejection_reverse", "open_auction",
]);
export const regime = pgEnum("regime", ["low", "average", "high", "extreme"]);
export const slope = pgEnum("slope", ["up", "flat", "down"]);
export const bias = pgEnum("bias", ["short_bias", "neutral", "long_bias"]);
export const narrativeSource = pgEnum("narrative_source", [
  "google_trends", "morning_bid_europe", "morning_bid_us", "news_terminal",
  "options_data", "other",
]);
export const levelSource = pgEnum("level_source", ["chart", "profile", "options", "external"]);
export const levelReaction = pgEnum("level_reaction", [
  "respected", "broke", "broke_and_retested", "no_touch",
]);
export const hypothesisOutcome = pgEnum("hypothesis_outcome", [
  "played_out", "partial", "invalidated", "never_triggered",
]);
export const sessionKey = pgEnum("session_key", [
  "asia", "europe_pre", "europe_rth", "us_pre", "us_rth", "us_afternoon", "settlement",
]);
export const tradeDirection = pgEnum("trade_direction", ["long", "short"]);
export const entryStyle = pgEnum("entry_style", ["limit", "market", "stop", "scaled"]);
export const exitReason = pgEnum("exit_reason", [
  "target", "stop", "trail", "time", "discretionary", "news", "management_error",
]);
export const sizeVsPlan = pgEnum("size_vs_plan", ["under", "as_planned", "over"]);
export const domainAlignment = pgEnum("domain_alignment", [
  "supportive", "neutral", "conflicting", "not_applicable",
]);
export const tagCategory = pgEnum("tag_category", [
  "setup", "location", "context", "execution", "error", "emotion", "custom",
]);
export const productGroup = pgEnum("product_group", [
  "equity_index", "energy", "metals", "rates", "fx", "crypto",
]);
export const mediaOwnerType = pgEnum("media_owner_type", [
  "trade", "instrument_prep", "day", "trade_debrief",
]);
export const mediaKind = pgEnum("media_kind", [
  "screen_recording", "chart_screenshot", "news_terminal", "ladder_capture", "other",
]);
export const dayNoteKind = pgEnum("day_note_kind", [
  "observation", "emotion", "market_event", "rule_reminder", "reground",
]);
export const ruleStatus = pgEnum("rule_status", ["followed", "broken", "not_applicable"]);
export const reviewType = pgEnum("review_type", ["weekly", "monthly"]);
export const executionSide = pgEnum("execution_side", ["buy", "sell"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const stamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
};

/* ── reference ─────────────────────────────────────────────────────────── */
export const instruments = pgTable("instruments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  exchange: text("exchange").notNull(),
  productGroup: productGroup("product_group").notNull(),
  tickSize: numeric("tick_size").notNull(),
  tickValue: numeric("tick_value").notNull(),
  pointValue: numeric("point_value").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("USD"),
  rthOpen: time("rth_open").notNull(),
  rthClose: time("rth_close").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  ...stamps,
});

export const edgeDomains = pgTable("edge_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  key: text("key").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(100),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
});

export const levelTypes = pgTable("level_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  key: text("key").notNull(),
  label: text("label").notNull(),
  grouping: text("grouping").notNull().default("other"),
  sortOrder: integer("sort_order").notNull().default(100),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
});

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  label: text("label").notNull(),
  category: tagCategory("category").notNull().default("custom"),
  color: text("color"),
  archived: boolean("archived").notNull().default(false),
  ...stamps,
});

export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  text: text("text").notNull(),
  detail: text("detail"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  ...stamps,
});

/* ── day ───────────────────────────────────────────────────────────────── */
export const tradingDays = pgTable("trading_days", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  date: date("date").notNull(),
  status: dayStatus("status").notNull().default("planned"),
  actualDayType: dayType("actual_day_type"),
  openType: openType("open_type"),
  volumeRegime: regime("volume_regime"),
  volatilityRegime: regime("volatility_regime"),
  disciplineScore: smallint("discipline_score"),
  executionScore: smallint("execution_score"),
  processAdherencePct: numeric("process_adherence_pct"),
  grossPnl: numeric("gross_pnl").notNull().default("0"),
  commissions: numeric("commissions").notNull().default("0"),
  netPnl: numeric("net_pnl").notNull().default("0"),
  tradeCount: integer("trade_count").notNull().default(0),
  winCount: integer("win_count").notNull().default(0),
  ...stamps,
}, (t) => [uniqueIndex("trading_days_user_date_uq").on(t.userId, t.date)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  key: sessionKey("key").notNull(),
  label: text("label").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  ...stamps,
});

export const sessionPreps = pgTable("session_preps", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  sessionId: uuid("session_id").notNull(),
  reassessment: text("reassessment"),
  whatChanged: text("what_changed"),
  updatedBias: bias("updated_bias"),
  energyLevel: smallint("energy_level"),
  mentalStateTags: text("mental_state_tags").array().notNull().default([]),
  ...stamps,
});

export const prepNarratives = pgTable("prep_narratives", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  source: narrativeSource("source").notNull(),
  rawContent: text("raw_content").notNull().default(""),
  keyThemes: text("key_themes").array().notNull().default([]),
  sentiment: smallint("sentiment"),
  sourceUrl: text("source_url"),
  capturedAt: ts("captured_at").notNull().defaultNow(),
  ...stamps,
});

export const instrumentPrep = pgTable("instrument_prep", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  instrumentId: uuid("instrument_id").notNull(),
  structureNote: text("structure_note"),
  vwapSlope: slope("vwap_slope"),
  chartPattern: text("chart_pattern").array().notNull().default([]),
  priorDayType: dayType("prior_day_type"),
  priorSessionNote: text("prior_session_note"),
  ladderBehaviour: text("ladder_behaviour"),
  expectedRangeTicks: integer("expected_range_ticks"),
  directionalBias: bias("directional_bias"),
  conviction: smallint("conviction"),
  sortOrder: integer("sort_order").notNull().default(100),
  ...stamps,
});

export const prepLevels = pgTable("prep_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  instrumentPrepId: uuid("instrument_prep_id").notNull(),
  levelTypeId: uuid("level_type_id").notNull(),
  price: numeric("price").notNull(),
  secondaryPrice: numeric("secondary_price"),
  timeframe: text("timeframe"),
  strength: smallint("strength").notNull().default(2),
  note: text("note"),
  source: levelSource("source").notNull().default("chart"),
  sortOrder: integer("sort_order").notNull().default(100),
  ...stamps,
});

export const levelInteractions = pgTable("level_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  prepLevelId: uuid("prep_level_id").notNull(),
  firstTouchAt: ts("first_touch_at"),
  reaction: levelReaction("reaction").notNull(),
  reactionTicks: integer("reaction_ticks"),
  note: text("note"),
  ...stamps,
});

export const dayEnvironment = pgTable("day_environment", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  dynamicCalendarNote: text("dynamic_calendar_note"),
  optionsNote: text("options_note"),
  expectedEnvironment: text("expected_environment"),
  flowNote: text("flow_note"),
  flagOpex: boolean("flag_opex").notNull().default(false),
  flagMonthEnd: boolean("flag_month_end").notNull().default(false),
  flagQuarterEnd: boolean("flag_quarter_end").notNull().default(false),
  flagRoll: boolean("flag_roll").notNull().default(false),
  flagAuction: boolean("flag_auction").notNull().default(false),
  flagHoliday: boolean("flag_holiday").notNull().default(false),
  ...stamps,
});

export const scheduledEvents = pgTable("scheduled_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  scheduledAt: ts("scheduled_at").notNull(),
  name: text("name").notNull(),
  importance: smallint("importance").notNull().default(2),
  consensus: text("consensus"),
  actual: text("actual"),
  prior: text("prior"),
  note: text("note"),
  ...stamps,
});

export const scheduledEventInstruments = pgTable("scheduled_event_instruments", {
  eventId: uuid("event_id").notNull(),
  instrumentId: uuid("instrument_id").notNull(),
  userId: uuid("user_id").notNull(),
}, (t) => [primaryKey({ columns: [t.eventId, t.instrumentId] })]);

export const hypotheses = pgTable("hypotheses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  instrumentId: uuid("instrument_id").notNull(),
  label: text("label").notNull(),
  rank: smallint("rank").notNull().default(1),
  narrative: text("narrative"),
  triggerConditions: text("trigger_conditions"),
  invalidation: text("invalidation"),
  assignedProbability: smallint("assigned_probability"),
  expectedMoveTicks: integer("expected_move_ticks"),
  plannedResponse: text("planned_response"),
  outcome: hypothesisOutcome("outcome"),
  outcomeNote: text("outcome_note"),
  outcomeRecordedAt: ts("outcome_recorded_at"),
  ...stamps,
});

export const hypothesisPathLevels = pgTable("hypothesis_path_levels", {
  hypothesisId: uuid("hypothesis_id").notNull(),
  prepLevelId: uuid("prep_level_id").notNull(),
  userId: uuid("user_id").notNull(),
  ordinal: smallint("ordinal").notNull().default(1),
}, (t) => [primaryKey({ columns: [t.hypothesisId, t.prepLevelId] })]);

export const opportunities = pgTable("opportunities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  hypothesisId: uuid("hypothesis_id"),
  instrumentId: uuid("instrument_id").notNull(),
  setupName: text("setup_name").notNull(),
  locationNote: text("location_note"),
  entryTrigger: text("entry_trigger"),
  invalidation: text("invalidation"),
  target: text("target"),
  primaryEdgeDomainId: uuid("primary_edge_domain_id"),
  potentialTicks: integer("potential_ticks"),
  estimatedProbability: smallint("estimated_probability"),
  asymmetryScore: numeric("asymmetry_score"),
  ...stamps,
});

export const opportunitySupportingDomains = pgTable("opportunity_supporting_domains", {
  opportunityId: uuid("opportunity_id").notNull(),
  edgeDomainId: uuid("edge_domain_id").notNull(),
  userId: uuid("user_id").notNull(),
}, (t) => [primaryKey({ columns: [t.opportunityId, t.edgeDomainId] })]);

/* ── trades ────────────────────────────────────────────────────────────── */
export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  sessionId: uuid("session_id"),
  instrumentId: uuid("instrument_id").notNull(),
  hypothesisId: uuid("hypothesis_id"),
  opportunityId: uuid("opportunity_id"),
  direction: tradeDirection("direction").notNull(),
  entryAt: ts("entry_at").notNull(),
  exitAt: ts("exit_at"),
  durationSeconds: integer("duration_seconds"),
  avgEntryPrice: numeric("avg_entry_price"),
  avgExitPrice: numeric("avg_exit_price"),
  maxSize: numeric("max_size"),
  initialStop: numeric("initial_stop"),
  initialTarget: numeric("initial_target"),
  planned: boolean("planned").notNull().default(true),
  entryStyle: entryStyle("entry_style"),
  exitReason: exitReason("exit_reason"),
  maeTicks: integer("mae_ticks"),
  mfeTicks: integer("mfe_ticks"),
  ticksCaptured: numeric("ticks_captured"),
  rMultiple: numeric("r_multiple"),
  grossPnl: numeric("gross_pnl").notNull().default("0"),
  commissions: numeric("commissions").notNull().default("0"),
  netPnl: numeric("net_pnl").notNull().default("0"),
  conviction: smallint("conviction"),
  sizeVsPlan: sizeVsPlan("size_vs_plan"),
  notes: text("notes"),
  ...stamps,
}, (t) => [
  index("trades_day_ix").on(t.tradingDayId),
  index("trades_instr_ix").on(t.instrumentId, t.entryAt),
]);

export const tradeExecutions = pgTable("trade_executions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradeId: uuid("trade_id").notNull(),
  side: executionSide("side").notNull(),
  price: numeric("price").notNull(),
  quantity: numeric("quantity").notNull(),
  executedAt: ts("executed_at").notNull(),
  isEntry: boolean("is_entry").notNull(),
  commission: numeric("commission").notNull().default("0"),
  externalId: text("external_id"),
  ...stamps,
});

export const tradeTags = pgTable("trade_tags", {
  tradeId: uuid("trade_id").notNull(),
  tagId: uuid("tag_id").notNull(),
  userId: uuid("user_id").notNull(),
}, (t) => [primaryKey({ columns: [t.tradeId, t.tagId] })]);

export const tradeEdgeAssessments = pgTable("trade_edge_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradeId: uuid("trade_id").notNull(),
  edgeDomainId: uuid("edge_domain_id").notNull(),
  alignment: domainAlignment("alignment").notNull().default("not_applicable"),
  weight: smallint("weight").notNull().default(0),
  wasPrimary: boolean("was_primary").notNull().default(false),
  note: text("note"),
  ...stamps,
});

export const tradeDebriefs = pgTable("trade_debriefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradeId: uuid("trade_id").notNull(),
  contextNote: text("context_note"),
  edgeNote: text("edge_note"),
  processNote: text("process_note"),
  executionQuality: smallint("execution_quality"),
  managementQuality: smallint("management_quality"),
  entryQuality: smallint("entry_quality"),
  exitQuality: smallint("exit_quality"),
  emotionalStateEntry: text("emotional_state_entry").array().notNull().default([]),
  emotionalStateExit: text("emotional_state_exit").array().notNull().default([]),
  whatISaw: text("what_i_saw"),
  whatWasActuallyThere: text("what_was_actually_there"),
  lesson: text("lesson"),
  action: text("action"),
  repeatable: boolean("repeatable"),
  ...stamps,
});

export const tradeMistakeTags = pgTable("trade_mistake_tags", {
  tradeDebriefId: uuid("trade_debrief_id").notNull(),
  tagId: uuid("tag_id").notNull(),
  userId: uuid("user_id").notNull(),
}, (t) => [primaryKey({ columns: [t.tradeDebriefId, t.tagId] })]);

export const media = pgTable("media", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  ownerType: mediaOwnerType("owner_type").notNull(),
  ownerId: uuid("owner_id").notNull(),
  kind: mediaKind("kind").notNull().default("other"),
  storagePath: text("storage_path").notNull(),
  mime: text("mime"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  durationSeconds: numeric("duration_seconds"),
  capturedAt: ts("captured_at"),
  caption: text("caption"),
  ...stamps,
});

export const pnlPoints = pgTable("pnl_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  recordedAt: ts("recorded_at").notNull(),
  realisedPnl: numeric("realised_pnl").notNull().default("0"),
  openPnl: numeric("open_pnl"),
  note: text("note"),
  sourceTradeId: uuid("source_trade_id"),
  ...stamps,
});

export const dayNotes = pgTable("day_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  notedAt: ts("noted_at").notNull().defaultNow(),
  body: text("body").notNull().default(""),
  kind: dayNoteKind("kind").notNull().default("observation"),
  ...stamps,
});

export const dayDebriefs = pgTable("day_debriefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  hypothesisVsReality: text("hypothesis_vs_reality"),
  whatTheMarketActuallyDid: text("what_the_market_actually_did"),
  whatIDidWell: text("what_i_did_well"),
  whatIDidPoorly: text("what_i_did_poorly"),
  biggestMissedOpportunity: text("biggest_missed_opportunity"),
  biggestAvoidedMistake: text("biggest_avoided_mistake"),
  lessons: text("lessons"),
  focusRating: smallint("focus_rating"),
  physicalState: smallint("physical_state"),
  emotionalControl: smallint("emotional_control"),
  ...stamps,
});

export const dayDebriefActions = pgTable("day_debrief_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  dayDebriefId: uuid("day_debrief_id").notNull(),
  actionText: text("action_text").notNull(),
  dueDate: date("due_date"),
  completedAt: ts("completed_at"),
  ...stamps,
});

export const ruleChecks = pgTable("rule_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tradingDayId: uuid("trading_day_id").notNull(),
  ruleId: uuid("rule_id").notNull(),
  status: ruleStatus("status").notNull(),
  note: text("note"),
  ...stamps,
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  type: reviewType("type").notNull(),
  summary: text("summary"),
  themes: text("themes").array().notNull().default([]),
  focusNextPeriod: text("focus_next_period"),
  ...stamps,
});

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("study"),
  query: jsonb("query").notNull().default({}),
  ...stamps,
});

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("Europe/Lisbon"),
  theme: text("theme").notNull().default("system"),
  minSampleSize: integer("min_sample_size").notNull().default(30),
  defaultInstrumentId: uuid("default_instrument_id"),
  explainerSeen: jsonb("explainer_seen").notNull().default({}),
  ...stamps,
});

export const prepTemplates = pgTable("prep_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  instrumentId: uuid("instrument_id"),
  payload: jsonb("payload").notNull().default({}),
  ...stamps,
});
