import { describe, it, expect } from "vitest";
import { computePhases, canCloseDay, overallRatio, type CompletionInput } from "./completion";

const empty: CompletionInput = {
  narratives: [], preps: [], levels: [], environment: null, hypotheses: [],
  opportunities: [], trades: [], notes: [], tradesDebriefed: [],
  dayDebrief: null, ruleChecks: [], activeRuleCount: 0,
};

const phase = (input: CompletionInput, key: string) =>
  computePhases(input).find((p) => p.key === key)!;

describe("phase completion", () => {
  it("starts a fresh day at zero on every gating phase except the trade-less debrief", () => {
    const phases = computePhases(empty);
    expect(phase(empty, "prepare").ratio).toBe(0);
    expect(phase(empty, "plan").ratio).toBe(0);
    expect(phase(empty, "debrief-trades").complete).toBe(true); // nothing to debrief
    expect(canCloseDay(phases)).toBe(false);
  });

  it("does not count an empty note as a written narrative", () => {
    const input = { ...empty, narratives: [{ rawContent: "   " }] };
    expect(phase(input, "prepare").checks[0].done).toBe(false);
  });

  it("judges the plan on the primary hypothesis, not any hypothesis", () => {
    const input: CompletionInput = {
      ...empty,
      hypotheses: [
        { id: "b", rank: 2, invalidation: "below ONL", plannedResponse: "fade", outcome: null },
        { id: "a", rank: 1, invalidation: null, plannedResponse: null, outcome: null },
      ],
      opportunities: [{ id: "o" }],
    };
    const p = phase(input, "plan");
    expect(p.checks.find((c) => c.key === "invalidation")!.done).toBe(false);
    expect(p.checks.find((c) => c.key === "hypothesis")!.done).toBe(true);
  });

  it("requires both a primary domain and a debrief per trade", () => {
    const input: CompletionInput = {
      ...empty,
      tradesDebriefed: [
        { tradeId: "1", hasPrimaryDomain: true, hasDebrief: true },
        { tradeId: "2", hasPrimaryDomain: true, hasDebrief: false },
      ],
    };
    expect(phase(input, "debrief-trades").ratio).toBe(0.5);
  });

  it("treats the trade phase as informational — it never blocks the close", () => {
    const full: CompletionInput = {
      narratives: [{ rawContent: "Attention on the CPI print." }],
      preps: [{ id: "p", structureNote: "Balanced above value.", directionalBias: "long_bias" }],
      levels: [{ id: "l" }],
      environment: { expectedEnvironment: "Two-sided until 13:30." },
      hypotheses: [{ id: "h", rank: 1, invalidation: "below VAL", plannedResponse: "size down", outcome: "played_out" }],
      opportunities: [{ id: "o" }],
      trades: [], notes: [],
      tradesDebriefed: [],
      dayDebrief: { hypothesisVsReality: "Held value as expected.", lessons: "Wait for the retest.", focusRating: 4 },
      ruleChecks: [{ ruleId: "r" }],
      activeRuleCount: 1,
    };
    const phases = computePhases(full);
    expect(phase(full, "trade").complete).toBe(false);
    expect(canCloseDay(phases)).toBe(true);
    expect(overallRatio(phases)).toBe(1);
  });

  it("needs a check for every active rule", () => {
    const input = { ...empty, activeRuleCount: 3, ruleChecks: [{ ruleId: "a" }, { ruleId: "b" }] };
    expect(phase(input, "debrief-day").checks.find((c) => c.key === "rules")!.done).toBe(false);
  });
});
