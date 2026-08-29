"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PhaseShell } from "./cockpit";
import { Explainer } from "@/components/explainer";
import { Card, Divider, EmptyState } from "@/components/ui/surface";
import { SimilarDays } from "./similar-days";
import { Button, TextButton } from "@/components/ui/button";
import { AutosaveTextarea, AutosaveSelect } from "@/components/ui/autosave";
import { Input, Scale, Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { useToast } from "@/components/ui/toast";
import {
  addDebriefAction, deleteDebriefAction, setHypothesisOutcome, setRuleCheck,
  toggleDebriefAction, updateDay, upsertDayDebrief,
} from "@/app/actions/day";
import { humanise } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/completion";
import type { CockpitProps } from "./types";

const DAY_TYPES = [
  "trend_up", "trend_down", "double_distribution", "normal",
  "normal_variation", "neutral", "non_trend",
].map((v) => ({ value: v, label: humanise(v) }));

const OPEN_TYPES = ["open_drive", "open_test_drive", "open_rejection_reverse", "open_auction"]
  .map((v) => ({ value: v, label: humanise(v) }));

const OUTCOMES = [
  { value: "played_out", label: "Played out", tone: "pos" as const },
  { value: "partial", label: "Partial", tone: "neutral" as const },
  { value: "invalidated", label: "Invalidated", tone: "neg" as const },
  { value: "never_triggered", label: "Never triggered", tone: "neutral" as const },
];

const RULE_STATES = [
  { value: "followed", label: "Followed" },
  { value: "broken", label: "Broken" },
  { value: "not_applicable", label: "n/a" },
];

export function PhaseDebriefDay(props: CockpitProps & { phase: Phase }) {
  const { bundle, date, phase, explainers, rules, instruments } = props;
  const router = useRouter();
  const toast = useToast();
  const [, start] = React.useTransition();
  const [actionText, setActionText] = React.useState("");
  const [actionDue, setActionDue] = React.useState("");

  const save = async (patch: Record<string, unknown>) => {
    await upsertDayDebrief(bundle.day.id, date, patch);
    router.refresh();
  };
  const saveDay = async (patch: Record<string, unknown>) => {
    await updateDay(bundle.day.id, date, patch);
    router.refresh();
  };

  const debrief = bundle.debrief;
  const checkFor = (ruleId: string) => bundle.ruleChecks.find((c) => c.ruleId === ruleId);
  const followed = bundle.ruleChecks.filter((c) => c.status === "followed").length;
  const answered = bundle.ruleChecks.filter((c) => c.status !== "not_applicable").length;

  return (
    <PhaseShell
      id="debrief-day" index={5} title="Debrief day"
      description="Compare the plan to what happened, check the rules, and write the actions."
      ratio={phase.ratio} checks={phase.checks}
    >
      <Explainer id="day-debrief" source={explainers.dayDebrief} />

      <div className="space-y-4">
        <Card className="p-4">
          <h3 className="label mb-2.5">How the day classified</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <AutosaveSelect
              label="Day type" initial={bundle.day.actualDayType} options={DAY_TYPES}
              save={(v) => saveDay({ actualDayType: v })}
            />
            <AutosaveSelect
              label="Open type" initial={bundle.day.openType} options={OPEN_TYPES}
              save={(v) => saveDay({ openType: v })}
            />
            <AutosaveSelect
              label="Volume" initial={bundle.day.volumeRegime}
              options={[
                { value: "low", label: "Low" }, { value: "average", label: "Average" },
                { value: "high", label: "High" },
              ]}
              save={(v) => saveDay({ volumeRegime: v })}
            />
            <AutosaveSelect
              label="Volatility" initial={bundle.day.volatilityRegime}
              options={[
                { value: "low", label: "Low" }, { value: "average", label: "Average" },
                { value: "high", label: "High" }, { value: "extreme", label: "Extreme" },
              ]}
              save={(v) => saveDay({ volatilityRegime: v })}
            />
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="label mb-2.5">Hypotheses against reality</h3>
          {bundle.hypotheses.length === 0 ? (
            <EmptyState
              title="No hypotheses to score."
              body="Nothing was written this morning, so there is nothing to be right or wrong about. Write one tomorrow before the open."
            />
          ) : (
            <ul className="space-y-2">
              {bundle.hypotheses.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0">
                  <Pill tone={h.rank === 1 ? "accent" : "neutral"}>Rank {h.rank}</Pill>
                  <span className="mono text-12">
                    {instruments.find((i) => i.id === h.instrumentId)?.symbol}
                  </span>
                  <span className="text-13 flex-1 min-w-[120px] truncate">{h.label}</span>
                  {h.assignedProbability !== null && (
                    <span className="text-11 num text-[var(--text-tertiary)]">
                      said {h.assignedProbability}%
                    </span>
                  )}
                  <div className="flex gap-0.5">
                    {OUTCOMES.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={h.outcome === o.value}
                        onClick={() => start(async () => {
                          await setHypothesisOutcome(h.id, date, {
                            outcome: h.outcome === o.value ? null : o.value,
                            outcomeNote: h.outcomeNote,
                          });
                          router.refresh();
                        })}
                        className={cn(
                          "h-7 px-2 rounded-[var(--r-input)] text-11 border transition-colors duration-[var(--d-fast)]",
                          h.outcome === o.value && o.tone === "pos" && "bg-[var(--pos-quiet)] text-[var(--pos)] border-transparent font-[560]",
                          h.outcome === o.value && o.tone === "neg" && "bg-[var(--neg-quiet)] text-[var(--neg)] border-transparent font-[560]",
                          h.outcome === o.value && o.tone === "neutral" && "bg-[var(--bg-active)] border-transparent font-[560]",
                          h.outcome !== o.value && "border-[var(--line)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]",
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid gap-3 lg:grid-cols-2">
          <Card className="p-4 space-y-3.5">
            <AutosaveTextarea
              label="Hypothesis versus reality" initial={debrief?.hypothesisVsReality ?? ""} rows={4}
              draftKey={`dd:${date}:vs`}
              placeholder="Where the plan and the day agreed, and where they came apart."
              save={(v) => save({ hypothesisVsReality: v })}
            />
            <AutosaveTextarea
              label="What the market actually did" initial={debrief?.whatTheMarketActuallyDid ?? ""} rows={3}
              draftKey={`dd:${date}:market`}
              save={(v) => save({ whatTheMarketActuallyDid: v })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <AutosaveTextarea
                label="Did well" initial={debrief?.whatIDidWell ?? ""} rows={3}
                draftKey={`dd:${date}:well`} save={(v) => save({ whatIDidWell: v })}
              />
              <AutosaveTextarea
                label="Did poorly" initial={debrief?.whatIDidPoorly ?? ""} rows={3}
                draftKey={`dd:${date}:poorly`} save={(v) => save({ whatIDidPoorly: v })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AutosaveTextarea
                label="Biggest missed opportunity" initial={debrief?.biggestMissedOpportunity ?? ""} rows={2}
                draftKey={`dd:${date}:missed`} save={(v) => save({ biggestMissedOpportunity: v })}
              />
              <AutosaveTextarea
                label="Biggest avoided mistake" initial={debrief?.biggestAvoidedMistake ?? ""} rows={2}
                draftKey={`dd:${date}:avoided`} save={(v) => save({ biggestAvoidedMistake: v })}
              />
            </div>
            <AutosaveTextarea
              label="Lessons" initial={debrief?.lessons ?? ""} rows={3}
              draftKey={`dd:${date}:lessons`} save={(v) => save({ lessons: v })}
            />
          </Card>

          <div className="space-y-3">
            <Card className="p-4">
              <div className="flex items-baseline justify-between mb-2.5">
                <h3 className="label">Rules</h3>
                {answered > 0 && (
                  <span className="text-11 num text-[var(--text-tertiary)]">
                    {followed}/{answered} followed
                    {bundle.day.processAdherencePct !== null &&
                      ` · ${Number(bundle.day.processAdherencePct).toFixed(0)}% adherence`}
                  </span>
                )}
              </div>
              {rules.length === 0 ? (
                <EmptyState
                  title="No rules defined."
                  body="Write the rules you actually hold yourself to — 'be flat before any major scheduled release' — and process adherence becomes a number you can plot."
                />
              ) : (
                <ul className="space-y-1">
                  {rules.map((r) => {
                    const check = checkFor(r.id);
                    return (
                      <li key={r.id} className="flex items-start gap-2.5 py-1.5 border-b border-[var(--line)] last:border-0">
                        <span className="text-12 flex-1 min-w-0">{r.text}</span>
                        <div className="flex gap-0.5 shrink-0">
                          {RULE_STATES.map((s) => (
                            <button
                              key={s.value}
                              type="button"
                              aria-pressed={check?.status === s.value}
                              onClick={() => start(async () => {
                                await setRuleCheck(bundle.day.id, date, r.id, s.value);
                                router.refresh();
                              })}
                              className={cn(
                                "h-6 px-2 rounded-[var(--r-input)] text-11 border transition-colors duration-[var(--d-fast)]",
                                check?.status === s.value && s.value === "followed" && "bg-[var(--pos-quiet)] text-[var(--pos)] border-transparent font-[560]",
                                check?.status === s.value && s.value === "broken" && "bg-[var(--neg-quiet)] text-[var(--neg)] border-transparent font-[560]",
                                check?.status === s.value && s.value === "not_applicable" && "bg-[var(--bg-active)] border-transparent",
                                check?.status !== s.value && "border-[var(--line)] text-[var(--text-tertiary)] hover:bg-[var(--bg-hover)]",
                              )}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="label mb-2.5">Actions</h3>
              <ul className="space-y-1">
                {bundle.actions.length === 0 && (
                  <li className="text-12 text-[var(--text-tertiary)]">
                    Nothing outstanding. An action is a thing you will do differently, with a date.
                  </li>
                )}
                {bundle.actions.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5 py-1">
                    <input
                      type="checkbox"
                      checked={Boolean(a.completedAt)}
                      aria-label={`Mark "${a.actionText}" done`}
                      onChange={(e) => start(async () => {
                        await toggleDebriefAction(a.id, date, e.target.checked);
                        router.refresh();
                      })}
                      className="mt-0.5 size-[15px] rounded-[4px] accent-[var(--accent)]"
                    />
                    <span className={cn("text-12 flex-1", a.completedAt && "line-through text-[var(--text-tertiary)]")}>
                      {a.actionText}
                    </span>
                    {a.dueDate && (
                      <span className="text-11 num text-[var(--text-tertiary)]">{a.dueDate}</span>
                    )}
                    <button
                      type="button" aria-label="Remove action"
                      onClick={() => start(async () => { await deleteDebriefAction(a.id, date); router.refresh(); })}
                      className="text-[var(--text-tertiary)] hover:text-[var(--neg)] px-1"
                    >×</button>
                  </li>
                ))}
              </ul>
              <div className="flex items-end gap-2 mt-2.5">
                <Input
                  value={actionText} placeholder="What you will do differently"
                  className="h-8 py-0 flex-1"
                  onChange={(e) => setActionText(e.target.value)}
                />
                <Input
                  type="date" value={actionDue} className="h-8 py-0 w-[140px] mono"
                  aria-label="Due date"
                  onChange={(e) => setActionDue(e.target.value)}
                />
                <Button
                  size="sm" disabled={!actionText.trim()}
                  onClick={() => start(async () => {
                    const res = await addDebriefAction(bundle.day.id, date, actionText, actionDue || null);
                    if (!res.ok) { toast(res.error); return; }
                    setActionText(""); setActionDue("");
                    router.refresh();
                  })}
                >
                  Add
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="label mb-2.5">How you were</h3>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {([
                  ["focusRating", "Focus"], ["physicalState", "Physical"], ["emotionalControl", "Emotional control"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <div className="label mb-1">{label}</div>
                    <Scale
                      name={label}
                      value={(debrief?.[key] as number | null) ?? null}
                      onChange={(v) => start(async () => { await save({ [key]: v }); })}
                    />
                  </div>
                ))}
                <div>
                  <div className="label mb-1">Discipline</div>
                  <Scale
                    name="Discipline" max={10}
                    value={bundle.day.disciplineScore ?? null}
                    onChange={(v) => start(async () => { await saveDay({ disciplineScore: v }); })}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>

        <SimilarDays
          days={props.similarDays}
          classified={Boolean(bundle.day.actualDayType)}
        />
      </div>
    </PhaseShell>
  );
}
