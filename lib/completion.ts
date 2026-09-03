/**
 * Phase completion for the day cockpit. Pure, so it can be tested and so the
 * stepper, the close-the-day button and the streak all agree on one definition.
 *
 * A ring is a count of satisfied checks, not a vibe. Each check names itself so
 * the UI can say exactly what is missing rather than showing an unexplained
 * three-quarters circle.
 */

export interface Check {
  key: string;
  label: string;
  done: boolean;
}

export interface Phase {
  key: PhaseKey;
  label: string;
  checks: Check[];
  ratio: number;
  complete: boolean;
  /** Whether this phase gates closing the day. Phase 3 (Trade) does not. */
  required: boolean;
}

export type PhaseKey = "prepare" | "plan" | "trade" | "debrief-trades" | "debrief-day";

export interface CompletionInput {
  narratives: { rawContent: string | null }[];
  preps: { id: string; structureNote: string | null; directionalBias: string | null }[];
  levels: { id: string }[];
  environment: { expectedEnvironment: string | null } | null;
  hypotheses: {
    id: string; rank: number; invalidation: string | null;
    plannedResponse: string | null; outcome: string | null;
  }[];
  opportunities: { id: string }[];
  trades: { id: string }[];
  notes: { id: string }[];
  tradesDebriefed: { tradeId: string; hasPrimaryDomain: boolean; hasDebrief: boolean }[];
  dayDebrief: { hypothesisVsReality: string | null; lessons: string | null; focusRating: number | null } | null;
  ruleChecks: { ruleId: string }[];
  activeRuleCount: number;
}

const filled = (v: string | null | undefined) => Boolean(v && v.trim().length > 0);

export function computePhases(input: CompletionInput): Phase[] {
  const primary = [...input.hypotheses].sort((a, b) => a.rank - b.rank)[0] ?? null;

  const prepare: Check[] = [
    { key: "narrative", label: "At least one narrative captured",
      done: input.narratives.some((n) => filled(n.rawContent)) },
    { key: "instrument", label: "At least one instrument analysed",
      done: input.preps.some((p) => filled(p.structureNote) || p.directionalBias !== null) },
    { key: "levels", label: "Levels marked", done: input.levels.length > 0 },
    { key: "environment", label: "Expected environment written",
      done: filled(input.environment?.expectedEnvironment ?? null) },
  ];

  const plan: Check[] = [
    { key: "hypothesis", label: "At least one hypothesis", done: input.hypotheses.length > 0 },
    { key: "invalidation", label: "Primary hypothesis has an invalidation",
      done: filled(primary?.invalidation ?? null) },
    { key: "response", label: "Primary hypothesis has a planned response",
      done: filled(primary?.plannedResponse ?? null) },
    { key: "opportunity", label: "At least one opportunity identified",
      done: input.opportunities.length > 0 },
  ];

  // A day with no trades is a legitimate day. This phase records activity, it
  // does not gate the close.
  const trade: Check[] = [
    { key: "activity", label: "Trades logged or the day noted",
      done: input.trades.length > 0 || input.notes.length > 0 },
  ];

  const debriefTrades: Check[] = input.tradesDebriefed.length
    ? input.tradesDebriefed.map((t) => ({
        key: `trade-${t.tradeId}`,
        label: "Trade scored across the five domains and debriefed",
        done: t.hasPrimaryDomain && t.hasDebrief,
      }))
    : [{ key: "none", label: "No trades to debrief", done: true }];

  const debriefDay: Check[] = [
    { key: "vs-reality", label: "Hypothesis compared to reality",
      done: filled(input.dayDebrief?.hypothesisVsReality ?? null) },
    { key: "lessons", label: "Lessons written", done: filled(input.dayDebrief?.lessons ?? null) },
    { key: "outcomes", label: "Every hypothesis has an outcome",
      done: input.hypotheses.length > 0 && input.hypotheses.every((h) => h.outcome !== null) },
    { key: "rules", label: "Rules checked",
      done: input.activeRuleCount === 0 || input.ruleChecks.length >= input.activeRuleCount },
  ];

  return [
    build("prepare", "Prepare", prepare, true),
    build("plan", "Plan", plan, true),
    build("trade", "Trade", trade, false),
    build("debrief-trades", "Debrief trades", debriefTrades, true),
    build("debrief-day", "Debrief day", debriefDay, true),
  ];
}

function build(key: PhaseKey, label: string, checks: Check[], required: boolean): Phase {
  const done = checks.filter((c) => c.done).length;
  const ratio = checks.length ? done / checks.length : 1;
  return { key, label, checks, ratio, complete: ratio === 1, required };
}

/** The day may be closed when every gating phase is complete. */
export function canCloseDay(phases: Phase[]): boolean {
  return phases.filter((p) => p.required).every((p) => p.complete);
}

export function overallRatio(phases: Phase[]): number {
  const gating = phases.filter((p) => p.required);
  if (!gating.length) return 1;
  return gating.reduce((a, p) => a + p.ratio, 0) / gating.length;
}
